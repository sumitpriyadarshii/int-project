const mongoose = require('mongoose');

const contentFlagSchema = new mongoose.Schema({
  targetType: { type: String, enum: ['discussion', 'reply', 'dataset'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  dataset: { type: mongoose.Schema.Types.ObjectId, ref: 'Dataset', default: null },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['abuse', 'spam', 'toxic', 'other'], required: true },
  details: { type: String, default: '', maxlength: 2000 },
  status: { type: String, enum: ['open', 'reviewed', 'action_taken', 'dismissed'], default: 'open' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  actionNote: { type: String, default: '', maxlength: 2000 }
}, {
  timestamps: true
});

contentFlagSchema.index({ status: 1, createdAt: -1 });
contentFlagSchema.index({ dataset: 1, createdAt: -1 });

module.exports = mongoose.model('ContentFlag', contentFlagSchema);