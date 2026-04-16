require('dotenv').config({ quiet: true });

const http = require('http');

const app = require('./server');
const { closeCache } = require('./utils/cache');
const { disconnectDatabase } = require('./utils/db');

const port = Number.parseInt(process.env.PORT || '5000', 10);
const server = http.createServer(app);

const stopServer = (signal) => {
  console.log(`\n${signal} received. Shutting down local dev server...`);
  server.close(async () => {
    await Promise.allSettled([
      closeCache(),
      disconnectDatabase()
    ]);
    process.exit(0);
  });
};

process.on('SIGINT', () => stopServer('SIGINT'));
process.on('SIGTERM', () => stopServer('SIGTERM'));

server.listen(port, () => {
  console.log(`DataVerse backend local dev server running on port ${port}`);
});
