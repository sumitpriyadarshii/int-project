const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../models/User');
const Dataset = require('../models/Dataset');
const Discussion = require('../models/Discussion');
const Announcement = require('../models/Announcement');
const ContentFlag = require('../models/ContentFlag');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');
const { invalidateCacheByPrefix } = require('../utils/cache');
const {
  isBlobStorageConfigured,
  uploadBufferToBlob,
  deleteBlobAsset
} = require('../utils/blobStorage');

const DATASET_CACHE_PREFIX = 'datasets:';

const invalidateDatasetCaches = async () => {
  try {
    await invalidateCacheByPrefix(DATASET_CACHE_PREFIX);
  } catch (error) {
    console.error('Dataset cache invalidation failed:', error.message);
  }
};

const announcementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.use(protect, authorize('admin'));

// @route   GET /api/admin/overview
router.get('/overview', async (req, res) => {
  try {
    const [users, admins, activeUsers, datasets, discussions, downloads] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ isActive: true }),
      Dataset.countDocuments(),
      Discussion.countDocuments(),
      Dataset.aggregate([{ $group: { _id: null, total: { $sum: '$downloadCount' } } }])
    ]);
    const pendingUploads = await Dataset.countDocuments({ status: 'pending' });
    const openFlags = await ContentFlag.countDocuments({ status: 'open' });

    res.json({
      success: true,
      overview: {
        users,
        admins,
        activeUsers,
        datasets,
        discussions,
        totalDownloads: downloads[0]?.total || 0,
        pendingUploads,
        openFlags
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load admin overview' });
  }
});

// @route   GET /api/admin/flags
router.get('/flags', async (req, res) => {
  try {
    const flags = await ContentFlag.find()
      .populate('reporter', 'username email role')
      .populate('reviewedBy', 'username email role')
      .populate('dataset', 'title status visibility')
      .sort('-createdAt')
      .limit(100);

    res.json({ success: true, flags });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load flags' });
  }
});

// @route   PATCH /api/admin/flags/:id
router.patch('/flags/:id', async (req, res) => {
  try {
    const { status = 'reviewed', actionNote = '' } = req.body;
    const flag = await ContentFlag.findById(req.params.id);
    if (!flag) return res.status(404).json({ success: false, message: 'Flag not found' });

    flag.status = status;
    flag.reviewedBy = req.user._id;
    flag.reviewedAt = new Date();
    flag.actionNote = actionNote;
    await flag.save();

    if (status === 'action_taken' && flag.targetType === 'discussion') {
      await Discussion.findByIdAndUpdate(flag.targetId, {
        flagStatus: 'action_taken',
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id
      });
    }

    if (status === 'action_taken' && flag.targetType === 'dataset') {
      await Dataset.findByIdAndUpdate(flag.targetId, { status: 'rejected' });
      await invalidateDatasetCaches();
    }

    await AuditLog.create({
      dataset: flag.dataset,
      actor: req.user._id,
      action: 'flag_reviewed',
      summary: `Reviewed ${flag.targetType} flag`,
      metadata: { flagId: flag._id, status, actionNote }
    });

    res.json({ success: true, message: 'Flag updated', flag });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update flag' });
  }
});

// @route   GET /api/admin/announcements
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('createdBy', 'username email')
      .sort('-createdAt')
      .limit(50);

    res.json({ success: true, announcements });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load announcements' });
  }
});

// @route   POST /api/admin/announcements
router.post('/announcements', announcementUpload.single('attachment'), async (req, res) => {
  try {
    const { title, message, link = '' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement message is required' });
    }

    let attachmentUrl = '';
    let attachmentName = '';
    let attachmentSize = 0;

    if (req.file) {
      if (!isBlobStorageConfigured()) {
        return res.status(503).json({
          success: false,
          message: 'Attachment storage is not configured. Set BLOB_READ_WRITE_TOKEN first.'
        });
      }

      const blobAsset = await uploadBufferToBlob(req.file, { folder: 'announcements' });
      attachmentUrl = blobAsset.url;
      attachmentName = req.file.originalname;
      attachmentSize = req.file.size;
    }

    const announcement = await Announcement.create({
      title: title ? title.trim() : '',
      message: message.trim(),
      link: link.trim(),
      attachmentName,
      attachmentUrl,
      attachmentSize,
      createdBy: req.user._id
    });

    const notification = {
      type: 'announcement',
      announcementId: announcement._id,
      message: `${title && title.trim() ? `${title.trim()}: ` : ''}${message.trim()}`,
      link: attachmentUrl || link.trim(),
      attachmentName,
      attachmentUrl,
      attachmentSize,
      read: false,
      createdAt: new Date()
    };

    await User.updateMany(
      { isActive: true },
      { $push: { notifications: notification } }
    );

    res.status(201).json({ success: true, message: 'Announcement sent to all users', announcement });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send announcement' });
  }
});

// @route   DELETE /api/admin/announcements/:id
router.delete('/announcements/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });

    if (announcement.attachmentUrl) {
      try {
        await deleteBlobAsset(announcement.attachmentUrl);
      } catch (blobDeleteError) {
        console.error('Announcement attachment cleanup failed:', blobDeleteError.message);
      }
    }

    await Promise.all([
      Announcement.deleteOne({ _id: announcement._id }),
      User.updateMany(
        {},
        { $pull: { notifications: { announcementId: announcement._id } } }
      )
    ]);

    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete announcement' });
  }
});

// @route   GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20, role } = req.query;
    const query = {};

    if (q) {
      query.$or = [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { organization: { $regex: q, $options: 'i' } }
      ];
    }

    if (role) query.role = role;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select('-password -refreshTokens -loginHistory')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
});

// @route   POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { username, email, password, role = 'user', organization = '', bio = '' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email, and password are required' });
    }

    if (!['user', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = String(username).trim();

    const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] });
    if (existing) {
      const field = existing.email === normalizedEmail ? 'Email' : 'Username';
      return res.status(400).json({ success: false, message: `${field} already exists` });
    }

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      role,
      organization,
      bio,
      isActive: true
    });

    res.status(201).json({ success: true, message: 'User created successfully', user: user.toPublicJSON() });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ success: false, message: `${field} already exists` });
    }
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

// @route   GET /api/admin/users/:id/summary
router.get('/users/:id/summary', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshTokens -loginHistory');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [datasets, discussions] = await Promise.all([
      Dataset.find({ contributor: user._id }).sort('-createdAt').limit(20),
      Discussion.find({ author: user._id }).sort('-createdAt').limit(20)
    ]);

    res.json({ success: true, user, datasets, discussions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load user summary' });
  }
});

// @route   PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent removing the last admin
    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote the last admin' });
      }
    }

    target.role = role;
    await target.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Role updated successfully', user: target.toPublicJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
});

// @route   PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    target.isActive = Boolean(isActive);
    await target.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'User status updated', user: target.toPublicJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
});

// @route   PATCH /api/admin/users/:id/discussion-profile-access
router.patch('/users/:id/discussion-profile-access', async (req, res) => {
  try {
    const { discussionProfileAccess } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    target.discussionProfileAccess = Boolean(discussionProfileAccess);
    await target.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Discussion profile access updated', user: target.toPublicJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update discussion profile access' });
  }
});

// @route   DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last admin' });
      }
    }

    const datasets = await Dataset.find({ contributor: target._id }).select('_id');
    const datasetIds = datasets.map((dataset) => dataset._id);

    await Promise.all([
      Discussion.deleteMany({ $or: [{ author: target._id }, ...(datasetIds.length ? [{ dataset: { $in: datasetIds } }] : [])] }),
      Dataset.deleteMany({ contributor: target._id }),
      User.deleteOne({ _id: target._id })
    ]);

    if (datasetIds.length) {
      await invalidateDatasetCaches();
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// @route   GET /api/admin/datasets
router.get('/datasets', async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20, status } = req.query;
    const query = {};


    if (status) {
      query.status = status;
    }
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { topic: { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Dataset.countDocuments(query);

    const datasets = await Dataset.find(query)
      .populate('contributor', 'username email role')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      datasets,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load datasets' });
  }
});

// @route   PATCH /api/admin/datasets/:id/review
router.patch('/datasets/:id/review', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['published', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid review status' });
    }

    const dataset = await Dataset.findById(req.params.id).populate('contributor', 'username email');
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    dataset.status = status;
    await dataset.save({ validateBeforeSave: false });

    await invalidateDatasetCaches();

    res.json({
      success: true,
      message: status === 'published' ? 'Dataset approved' : 'Dataset rejected',
      dataset
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update review status' });
  }
});

// @route   DELETE /api/admin/datasets/:id
router.delete('/datasets/:id', async (req, res) => {
  try {
    const deleted = await Dataset.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Dataset not found' });

    // Also delete linked discussions for cleanup
    await Discussion.deleteMany({ dataset: deleted._id });

    await invalidateDatasetCaches();

    res.json({ success: true, message: 'Dataset deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete dataset' });
  }
});

// @route   GET /api/admin/discussions
router.get('/discussions', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Discussion.countDocuments();

    const discussions = await Discussion.find()
      .populate('author', 'username email role')
      .populate('dataset', 'title')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      discussions,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load discussions' });
  }
});

// @route   DELETE /api/admin/discussions/:id
router.delete('/discussions/:id', async (req, res) => {
  try {
    const deleted = await Discussion.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Discussion not found' });

    res.json({ success: true, message: 'Discussion deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete discussion' });
  }
});

module.exports = router;
