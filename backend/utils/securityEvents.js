const SecurityEvent = require('../models/SecurityEvent');

const logSecurityEvent = async (payload = {}) => {
  try {
    await SecurityEvent.create(payload);
  } catch (error) {
    console.error('Security event logging failed:', error.message);
  }
};

module.exports = {
  logSecurityEvent
};
