require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const passport = require('passport');
require('./config/passport');
const { ensureSeedDatasets, MIN_PUBLISHED_DATASETS } = require('./utils/seedDatasets');
const { sanitizeRequestPayload } = require('./middleware/inputValidation');
const { initCache, closeCache } = require('./utils/cache');

const authRoutes = require('./routes/auth');
const datasetRoutes = require('./routes/datasets');
const discussionRoutes = require('./routes/discussions');
const adminRoutes = require('./routes/admin');
const {
  apiRateLimiter,
  mutationRateLimiter,
  authRateLimiter,
  adminRateLimiter
} = require('./middleware/security');

const app = express();
const server = http.createServer(app);
const isProduction = process.env.NODE_ENV === 'production';
const autoSeedDatasets = String(process.env.AUTO_SEED_DATASETS || 'true').toLowerCase() === 'true';

const configuredOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isPrivateNetworkHost = (hostname) => {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return (
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
};

const originChecker = (origin, callback) => {
  if (!origin) return callback(null, true);

  if (!configuredOrigins.length) {
    try {
      const host = new URL(origin).hostname;
      return callback(null, isPrivateNetworkHost(host));
    } catch {
      return callback(null, false);
    }
  }

  if (configuredOrigins.includes(origin)) return callback(null, true);

  try {
    const host = new URL(origin).hostname;
    return callback(null, isPrivateNetworkHost(host));
  } catch {
    return callback(null, false);
  }
};

const corsOptions = {
  origin: originChecker,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After', 'X-Cache'],
  maxAge: 600
};

// Socket.io setup
const io = new Server(server, {
  cors: corsOptions
});

// Middleware
app.disable('x-powered-by');
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));
app.use(compression());
if (!isProduction) {
  app.use(morgan('dev'));
}
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeRequestPayload);
app.use(passport.initialize());
app.use('/api', apiRateLimiter);
app.use('/api', mutationRateLimiter);

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  etag: true,
  lastModified: true,
  maxAge: isProduction ? '30d' : 0,
  immutable: isProduction
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/datasets', datasetRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/admin', adminRateLimiter, adminRoutes);

// Real-time Socket.io events
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  socket.on('join', ({ userId, username }) => {
    onlineUsers.set(socket.id, { userId, username });
    socket.join(`user:${userId}`);
    io.emit('online_users', onlineUsers.size);
    console.log(`👤 ${username} joined`);
  });

  socket.on('join_dataset', (datasetId) => {
    socket.join(`dataset:${datasetId}`);
  });

  socket.on('leave_dataset', (datasetId) => {
    socket.leave(`dataset:${datasetId}`);
  });

  socket.on('new_discussion', (data) => {
    io.to(`dataset:${data.datasetId}`).emit('discussion_added', data);
  });

  socket.on('new_reply', (data) => {
    io.to(`dataset:${data.datasetId}`).emit('reply_added', data);
  });

  socket.on('dataset_downloaded', (data) => {
    io.to(`dataset:${data.datasetId}`).emit('download_count_updated', data);
  });

  socket.on('typing', ({ datasetId, username }) => {
    socket.to(`dataset:${datasetId}`).emit('user_typing', { datasetId, username });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_users', onlineUsers.size);
    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

// Make io available in routes
app.set('io', io);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dataverse';

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n📴 ${signal} received. Shutting down gracefully...`);
  server.close((err) => {
    if (err) console.error('⚠️  Error closing server:', err.message);
    else console.log('✅ Server closed');
    
    mongoose.connection.close(false, (err) => {
      if (err) console.error('⚠️  Error closing MongoDB:', err.message);
      else console.log('✅ MongoDB connection closed');

      closeCache()
        .then(() => {
          console.log('✅ Cache connection closed');
          process.exit(0);
        })
        .catch((cacheError) => {
          console.error('⚠️  Error closing cache connection:', cacheError.message);
          process.exit(0);
        });
    });
  });
  
  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('❌ Force shutting down (timeout)...');
    process.exit(1);
  }, 10000);
};

// Handle graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start MongoDB connection and server
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected successfully');

    await initCache(console);

    if (autoSeedDatasets) {
      try {
        const result = await ensureSeedDatasets({ minPublished: MIN_PUBLISHED_DATASETS });
        if (result.seeded) {
          console.log(`🌱 Seeded dummy datasets: +${result.inserted} (published total: ${result.totalPublished})`);
        } else {
          console.log(`🌱 Dummy dataset seed check passed (published total: ${result.totalPublished})`);
        }
      } catch (seedError) {
        console.error('⚠️  Dataset seed check failed:', seedError.message);
      }
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 DataVerse backend running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
      console.log(`📡 Socket.io ready for real-time communication`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use.`);
        console.error('💡 Try running: npm run clean-dev');
        process.exit(1);
      } else {
        console.error('❌ Server error:', err.message);
        process.exit(1);
      }
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = { app, io };
