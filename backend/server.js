require('dotenv').config({ quiet: true });

const { createUnifiedApp } = require('./api/_core');

module.exports = createUnifiedApp();
