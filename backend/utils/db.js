const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const GLOBAL_DB_KEY = '__dataverse_db_state__';

const dbState = globalThis[GLOBAL_DB_KEY] || {
  connection: null,
  connectionPromise: null,
  memoryServer: null,
  resolvedUri: ''
};

globalThis[GLOBAL_DB_KEY] = dbState;

const isProduction = process.env.NODE_ENV === 'production';

const toEnvValue = (value) => String(value || '').trim();

const buildAtlasUri = () => {
  const username = toEnvValue(process.env.MONGO_USERNAME);
  const password = toEnvValue(process.env.MONGO_PASSWORD);
  const cluster = toEnvValue(process.env.MONGO_CLUSTER);
  const dbName = toEnvValue(process.env.MONGO_DB_NAME || 'dataverse');

  if (!username || !password || !cluster) {
    return '';
  }

  return `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${cluster}/${dbName}?retryWrites=true&w=majority`;
};

const shouldUseMemoryServer = () => {
  const explicit = toEnvValue(process.env.USE_MONGO_MEMORY_SERVER).toLowerCase();
  return !isProduction && explicit === 'true';
};

const resolveMongoUri = async () => {
  const directUri = toEnvValue(process.env.MONGO_URI || process.env.MONGODB_URI);
  if (directUri) {
    return directUri;
  }

  const atlasUri = buildAtlasUri();
  if (atlasUri) {
    return atlasUri;
  }

  if (shouldUseMemoryServer()) {
    if (!dbState.memoryServer) {
      dbState.memoryServer = await MongoMemoryServer.create();
    }
    return dbState.memoryServer.getUri('dataverse');
  }

  return 'mongodb://127.0.0.1:27017/dataverse';
};

const connectToDatabase = async () => {
  if (dbState.connection && mongoose.connection.readyState === 1) {
    return dbState.connection;
  }

  if (!dbState.connectionPromise) {
    dbState.connectionPromise = (async () => {
      const mongoUri = await resolveMongoUri();
      dbState.resolvedUri = mongoUri;

      const connection = await mongoose.connect(mongoUri, {
        maxPoolSize: Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10),
        serverSelectionTimeoutMS: Number.parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '10000', 10)
      });

      return connection;
    })().catch((error) => {
      dbState.connectionPromise = null;
      throw error;
    });
  }

  dbState.connection = await dbState.connectionPromise;
  return dbState.connection;
};

const getDbStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return states[mongoose.connection.readyState] || 'unknown';
};

const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  if (dbState.memoryServer) {
    await dbState.memoryServer.stop();
    dbState.memoryServer = null;
  }

  dbState.connection = null;
  dbState.connectionPromise = null;
};

module.exports = {
  connectToDatabase,
  disconnectDatabase,
  getDbStatus
};
