const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['rate_limit_exceeded', 'auth_bruteforce', 'suspicious_login'],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ip: { type: String, default: '' },
  endpoint: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false
});

securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ type: 1, createdAt: -1 });
securityEventSchema.index({ severity: 1, createdAt: -1 });
securityEventSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
