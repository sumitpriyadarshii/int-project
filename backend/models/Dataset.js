const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  rowIndex: Number
});

const datasetVersionSchema = new mongoose.Schema({
  version: { type: String, required: true, trim: true },
  summary: { type: String, default: '', maxlength: 500 },
  changelog: { type: String, default: '', maxlength: 5000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const qualityIssueSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['missing_values', 'duplicates', 'schema_mismatch', 'outliers', 'bias', 'label_error', 'other'],
    default: 'other'
  },
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 3000 },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_review', 'resolved', 'verified'], default: 'open' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolutionNote: { type: String, default: '', maxlength: 3000 },
  resolutionEvidence: [{
    filename: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  resolvedAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueAt: { type: Date, default: null }
}, { timestamps: true });

const datasetSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Dataset title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  collectionMethod: {
    type: String,
    required: [true, 'Collection method is required'],
    maxlength: [3000, 'Collection method cannot exceed 3000 characters']
  },
  usageDescription: {
    type: String,
    maxlength: [3000, 'Usage description cannot exceed 3000 characters']
  },
  contributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coContributors: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, default: 'contributor' }
  }],
  topic: {
    type: String,
    required: [true, 'Topic is required']
  },
  tags: [{ type: String, trim: true, lowercase: true }],
  category: {
    type: String,
    enum: ['science', 'technology', 'health', 'environment', 'social', 'economics', 'education', 'sports', 'arts', 'other'],
    required: true
  },
  license: {
    type: String,
    enum: ['CC0', 'CC BY', 'CC BY-SA', 'CC BY-NC', 'MIT', 'Apache 2.0', 'Custom', 'Restricted'],
    default: 'CC BY'
  },
  files: [{
    originalName: String,
    filename: String,
    path: String,
    size: Number,
    mimetype: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  sampleRecords: [recordSchema],
  schemaInfo: {
    columns: [{
      name: String,
      type: { type: String },
      description: String,
      nullable: Boolean
    }]
  },
  stats: {
    rows: { type: Number, default: 0 },
    columns: { type: Number, default: 0 },
    size: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'published', 'archived', 'rejected'],
    default: 'pending'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'restricted'],
    default: 'public'
  },
  accessRequests: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    respondedAt: Date,
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    accessDays: { type: Number, default: 30 },
    expiresAt: { type: Date, default: null },
    purpose: { type: String, default: '' }
  }],
  approvedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downloadCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  downloads: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    downloadedAt: { type: Date, default: Date.now },
    ip: String
  }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  qualityScore: { type: Number, default: 0, min: 0, max: 5 },
  qualityMetrics: {
    nullRate: { type: Number, default: 0 },
    duplicateRate: { type: Number, default: 0 },
    schemaDrift: { type: Number, default: 0 },
    outlierRate: { type: Number, default: 0 },
    labelConsistency: { type: Number, default: 100 },
    freshnessDays: { type: Number, default: 0 }
  },
  qualityRatings: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: { type: Number, min: 1, max: 5 },
    ratedAt: { type: Date, default: Date.now }
  }],
  thumbnail: { type: String, default: '' },
  source: { type: String, default: '' },
  doi: { type: String, default: '' },
  version: { type: String, default: '1.0' },
  versions: [datasetVersionSchema],
  qualityIssues: [qualityIssueSchema],
  relatedDatasets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dataset' }],
  featured: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
  temporalCoverage: {
    start: Date,
    end: Date
  },
  geographicCoverage: { type: String, default: '' },
  updateFrequency: {
    type: String,
    enum: ['real-time', 'daily', 'weekly', 'monthly', 'quarterly', 'annually', 'static'],
    default: 'static'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for like count
datasetSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Index for search
datasetSchema.index({ title: 'text', description: 'text', tags: 'text', topic: 'text' });
datasetSchema.index({ category: 1, status: 1 });
datasetSchema.index({ contributor: 1 });
datasetSchema.index({ createdAt: -1 });
datasetSchema.index({ downloadCount: -1 });
datasetSchema.index({ status: 1, visibility: 1, createdAt: -1 });
datasetSchema.index({ status: 1, visibility: 1, category: 1, createdAt: -1 });
datasetSchema.index({ status: 1, visibility: 1, featured: -1, downloadCount: -1, viewCount: -1, qualityScore: -1, createdAt: -1 });
datasetSchema.index({ status: 1, visibility: 1, license: 1, createdAt: -1 });
datasetSchema.index({ tags: 1 });
datasetSchema.index({ topic: 1 });

// Generate slug before save
datasetSchema.pre('save', function() {
  if (this.isModified('title') || this.isNew) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100) + '-' + Date.now();
  }
});

module.exports = mongoose.model('Dataset', datasetSchema);
