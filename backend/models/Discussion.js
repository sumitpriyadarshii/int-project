const mongoose = require('mongoose');

const discussionSchema = new mongoose.Schema({
  dataset: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dataset',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    maxlength: 200,
    default: ''
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: [5000, 'Content cannot exceed 5000 characters']
  },
  type: {
    type: String,
    enum: ['general', 'quality_issue', 'improvement', 'question', 'bug_report', 'feature_request'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['open', 'in_review', 'resolved', 'verified', 'closed', 'pending'],
    default: 'open'
  },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  flagStatus: { type: String, enum: ['none', 'open', 'reviewed', 'action_taken', 'dismissed'], default: 'none' },
  flagReason: { type: String, enum: ['abuse', 'spam', 'toxic', 'other'], default: 'other' },
  flagDetails: { type: String, default: '', maxlength: 2000 },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 3000 },
    parentReplyId: { type: mongoose.Schema.Types.ObjectId, default: null },
    depth: { type: Number, min: 0, max: 3, default: 0 },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isAccepted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  isPinned: { type: Boolean, default: false },
  isAnnouncement: { type: Boolean, default: false },
  tags: [String],
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attachments: [{
    filename: String,
    path: String,
    size: Number
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

discussionSchema.virtual('voteScore').get(function() {
  return this.upvotes.length - this.downvotes.length;
});

discussionSchema.index({ dataset: 1, createdAt: -1 });
discussionSchema.index({ author: 1 });

module.exports = mongoose.model('Discussion', discussionSchema);
