require('dotenv').config({ quiet: true });

const { createUnifiedApp } = require('./api/_core');

const app = createUnifiedApp();

module.exports = app;
module.exports.default = app;
