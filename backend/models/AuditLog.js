const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: {
    type: String,
    enum: [
      'upload',
      'review_approved',
      'review_rejected',
      'updated',
      'deleted',
      'downloaded',
      'version_created',
      'version_rolled_back',
      'issue_created',
      'issue_updated',
      'issue_verified',
      'access_requested',
      'access_approved',
      'access_rejected',
      'discussion_created',
      'discussion_deleted',
      'flag_created',
      'flag_reviewed'
    ],
    required: true
  },
  summary: { type: String, required: true, maxlength: 500 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false
});

auditLogSchema.index({ dataset: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('Audit logs are immutable and cannot be modified'));
  }
  return next();
});

[
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'findOneAndRemove'
].forEach((operation) => {
  auditLogSchema.pre(operation, function (next) {
    return next(new Error('Audit logs are immutable and cannot be updated or deleted'));
  });
});

auditLogSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  return next(new Error('Audit logs are immutable and cannot be deleted'));
});

auditLogSchema.pre('remove', function (next) {
  return next(new Error('Audit logs are immutable and cannot be deleted'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);