const app = require('../server');

function handler(req, res) {
  return app(req, res);
}

module.exports = handler;
module.exports.default = handler;
