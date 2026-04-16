require('dotenv').config();
const mongoose = require('mongoose');
const { ensureSeedDatasets } = require('../utils/seedDatasets');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dataverse';
const force = process.argv.includes('--force');

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    const result = await ensureSeedDatasets({
      minPublished: 18,
      force,
      logger: console
    });

    console.log('[seed] result:', JSON.stringify(result));
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[seed] failed:', error.message);
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore close errors
    }
    process.exit(1);
  }
})();
