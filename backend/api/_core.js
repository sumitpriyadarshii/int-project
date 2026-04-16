require('dotenv').config({ quiet: true });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const passport = require('passport');

require('../config/passport');

const { sanitizeRequestPayload } = require('../middleware/inputValidation');
const {
  apiRateLimiter,
  mutationRateLimiter,
  authRateLimiter,
  adminRateLimiter
} = require('../middleware/security');
const { connectToDatabase, getDbStatus } = require('../utils/db');
const { initCache } = require('../utils/cache');
const { ensureSeedDatasets, MIN_PUBLISHED_DATASETS } = require('../utils/seedDatasets');

const authRoutes = require('../routes/auth');
const datasetRoutes = require('../routes/datasets');
const discussionRoutes = require('../routes/discussions');
const adminRoutes = require('../routes/admin');

const isProduction = process.env.NODE_ENV === 'production';
const autoSeedDatasets = String(process.env.AUTO_SEED_DATASETS || 'false').toLowerCase() === 'true';

const configuredOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
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

  if (configuredOrigins.includes(origin)) {
    return callback(null, true);
  }

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

let runtimeReady = false;
let runtimeInitPromise = null;

const initializeRuntime = async () => {
  if (runtimeReady) {
    return;
  }

  if (!runtimeInitPromise) {
    runtimeInitPromise = (async () => {
      await connectToDatabase();
      await initCache(console);

      if (autoSeedDatasets) {
        try {
          await ensureSeedDatasets({ minPublished: MIN_PUBLISHED_DATASETS });
        } catch (error) {
          console.error('Dataset seed check failed:', error.message);
        }
      }

      runtimeReady = true;
    })().catch((error) => {
      runtimeInitPromise = null;
      throw error;
    });
  }

  await runtimeInitPromise;
};

const attachCommonMiddleware = (app) => {
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

  app.use(async (req, res, next) => {
    try {
      await initializeRuntime();
      return next();
    } catch (error) {
      return next(error);
    }
  });
};

const stripPrefix = (prefix) => {
  const normalized = String(prefix || '').trim().replace(/\/+$/g, '');

  return (req, res, next) => {
    if (!normalized) {
      return next();
    }

    if (req.url === normalized) {
      req.url = '/';
      return next();
    }

    if (req.url.startsWith(`${normalized}/`)) {
      req.url = req.url.slice(normalized.length) || '/';
    }

    return next();
  };
};

const addErrorHandlers = (app) => {
  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });
};

const createHealthApp = () => {
  const app = express();
  attachCommonMiddleware(app);
  app.use(stripPrefix('/api/health'));
  app.use(stripPrefix('/health'));

  app.get('/', (req, res) => {
    res.json({
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date(),
      db: getDbStatus()
    });
  });

  addErrorHandlers(app);
  return app;
};

const createScopedApiApp = (scope) => {
  if (scope === 'health') {
    return createHealthApp();
  }

  const app = express();
  attachCommonMiddleware(app);
  app.use(apiRateLimiter);
  app.use(mutationRateLimiter);

  if (scope === 'auth') {
    app.use(stripPrefix('/api/auth'));
    app.use(authRateLimiter);
    app.use(authRoutes);
  } else if (scope === 'datasets') {
    app.use(stripPrefix('/api/datasets'));
    app.use(datasetRoutes);
  } else if (scope === 'discussions') {
    app.use(stripPrefix('/api/discussions'));
    app.use(discussionRoutes);
  } else if (scope === 'admin') {
    app.use(stripPrefix('/api/admin'));
    app.use(adminRateLimiter);
    app.use(adminRoutes);
  } else {
    throw new Error(`Unsupported scope: ${scope}`);
  }

  addErrorHandlers(app);
  return app;
};

const createUnifiedApp = () => {
  const app = express();
  attachCommonMiddleware(app);

  app.get(['/health', '/api/health'], (req, res) => {
    res.json({
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date(),
      db: getDbStatus()
    });
  });

  app.use(apiRateLimiter);
  app.use(mutationRateLimiter);

  app.use('/api/auth', authRateLimiter, authRoutes);
  app.use('/auth', authRateLimiter, authRoutes);

  app.use('/api/datasets', datasetRoutes);
  app.use('/datasets', datasetRoutes);

  app.use('/api/discussions', discussionRoutes);
  app.use('/discussions', discussionRoutes);

  app.use('/api/admin', adminRateLimiter, adminRoutes);
  app.use('/admin', adminRateLimiter, adminRoutes);

  addErrorHandlers(app);
  return app;
};

module.exports = {
  createScopedApiApp,
  createUnifiedApp,
  initializeRuntime
};
