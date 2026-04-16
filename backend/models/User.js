const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEFAULT_BCRYPT_SALT_ROUNDS = 12;
const parsedBcryptRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_BCRYPT_SALT_ROUNDS}`, 10);
const BCRYPT_SALT_ROUNDS = Number.isFinite(parsedBcryptRounds) && parsedBcryptRounds >= 8 && parsedBcryptRounds <= 14
  ? parsedBcryptRounds
  : DEFAULT_BCRYPT_SALT_ROUNDS;

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [80, 'Name cannot exceed 80 characters'],
    default: ''
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  googleId: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
    index: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  avatar: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  organization: { type: String, default: '' },
  website: { type: String, default: '' },
  githubUrl: { type: String, default: '' },
  totalUploads: { type: Number, default: 0 },
  totalDownloads: { type: Number, default: 0 },
  reputation: { type: Number, default: 0 },
  badges: [{ type: String }],
  discussionProfileAccess: { type: Boolean, default: false },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedDatasets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dataset' }],
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date, default: Date.now },
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ip: String,
    userAgent: String
  }],
  tokenVersion: { type: Number, default: 0, select: false },
  refreshTokens: [{ type: String }],
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  resetPasswordCode: { type: String, default: null },
  resetPasswordExpire: { type: Date, default: null },
  notifications: [{
    type: { type: String },
    message: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    link: String,
    attachmentName: String,
    attachmentUrl: String,
    attachmentSize: Number
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  try {
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
  } catch (error) {
    throw new Error(`Password hashing failed: ${error.message}`);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ email: 1, otp: 1, otpExpiry: 1 });

// Get public profile (no sensitive data)
userSchema.methods.toPublicJSON = function() {
  return {
    _id: this._id,
    username: this.username,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    bio: this.bio,
    role: this.role,
    organization: this.organization,
    website: this.website,
    totalUploads: this.totalUploads,
    totalDownloads: this.totalDownloads,
    reputation: this.reputation,
    discussionProfileAccess: this.discussionProfileAccess,
    badges: this.badges,
    followers: this.followers.length,
    following: this.following.length,
    createdAt: this.createdAt,
    lastLogin: this.lastLogin
  };
};

module.exports = mongoose.model('User', userSchema);
