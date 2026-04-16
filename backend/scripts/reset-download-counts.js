require('dotenv').config();
const mongoose = require('mongoose');
const Dataset = require('../models/Dataset');
const User = require('../models/User');
const { initCache, closeCache, invalidateCacheByPrefix } = require('../utils/cache');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dataverse';
const DATASET_CACHE_PREFIX = 'datasets:';

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    await initCache(console);

    const datasetResult = await Dataset.updateMany(
      {},
      {
        $set: {
          downloadCount: 0,
          downloads: []
        }
      }
    );

    const userResult = await User.updateMany(
      {},
      {
        $set: {
          totalDownloads: 0
        }
      }
    );

    await invalidateCacheByPrefix(DATASET_CACHE_PREFIX);

    console.log(`[reset-downloads] datasets matched=${datasetResult.matchedCount} modified=${datasetResult.modifiedCount}`);
    console.log(`[reset-downloads] users matched=${userResult.matchedCount} modified=${userResult.modifiedCount}`);
    console.log('[reset-downloads] download counters reset to zero successfully');

    process.exit(0);
  } catch (error) {
    console.error('[reset-downloads] failed:', error.message);
    process.exit(1);
  } finally {
    try {
      await closeCache();
    } catch (_) {
      // ignore cache close errors
    }

    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore connection close errors
    }
  }
})();
