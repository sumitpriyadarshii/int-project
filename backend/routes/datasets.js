const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Dataset = require('../models/Dataset');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect, optionalAuth } = require('../middleware/auth');
const {
  validateDatasetListQuery,
  validateDatasetSearchQuery,
  validateTrendingQuery
} = require('../middleware/inputValidation');
const { applyDatasetQuality, computeDatasetQuality } = require('../utils/datasetQuality');
const { enforceNoPII } = require('../utils/piiGuard');
const { buildCacheKey, getCache, setCache, invalidateCacheByPrefix } = require('../utils/cache');

const logAudit = async (payload) => {
  try {
    await AuditLog.create(payload);
  } catch (error) {
    console.error('Audit log failed:', error.message);
  }
};

const safeObjectIdString = (value) => (value ? value.toString() : '');
const DATASET_CACHE_PREFIX = 'datasets:';
const DATASET_CACHE_TTL_SECONDS = Number.parseInt(process.env.DATASET_CACHE_TTL_SECONDS || '120', 10);

const normalizeCacheTtl = Number.isFinite(DATASET_CACHE_TTL_SECONDS) && DATASET_CACHE_TTL_SECONDS > 0
  ? DATASET_CACHE_TTL_SECONDS
  : 120;

const stableSerializeQuery = (query = {}) => {
  return Object.keys(query)
    .sort()
    .map((key) => {
      const value = query[key];
      if (Array.isArray(value)) {
        return `${key}=${value.join(',')}`;
      }
      return `${key}=${value}`;
    })
    .join('&');
};

const canUsePublicCache = (req) => {
  const hasBearer = Boolean(req.headers.authorization && req.headers.authorization.startsWith('Bearer '));
  return !req.user && !hasBearer;
};

const datasetCacheKey = (scope, query) => buildCacheKey(DATASET_CACHE_PREFIX, scope, stableSerializeQuery(query));

const invalidateDatasetCaches = async () => {
  try {
    await invalidateCacheByPrefix(DATASET_CACHE_PREFIX);
  } catch (error) {
    console.error('Dataset cache invalidation failed:', error.message);
  }
};

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.json', '.xlsx', '.xls', '.txt', '.tsv', '.parquet', '.zip', '.pptx', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not supported`));
  }
});

// Parse CSV/JSON for sample records
const parseSampleRecords = (file) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    const content = fs.readFileSync(file.path, 'utf8');

    if (ext === '.json') {
      const data = JSON.parse(content);
      const arr = Array.isArray(data) ? data : [data];
      return arr.slice(0, 10).map((row, i) => ({ data: row, rowIndex: i }));
    }

    if (ext === '.csv' || ext === '.tsv') {
      const separator = ext === '.tsv' ? '\t' : ',';
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) return [];
      const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''));
      const records = [];
      for (let i = 1; i < Math.min(11, lines.length); i++) {
        const values = lines[i].split(separator);
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]?.trim().replace(/"/g, '') || ''; });
        records.push({ data: row, rowIndex: i - 1 });
      }
      // Extract schema
      return records;
    }
    return [];
  } catch {
    return [];
  }
};

const extractSchema = (file) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    const content = fs.readFileSync(file.path, 'utf8');
    if (ext === '.csv') {
      const headers = content.split('\n')[0].split(',').map(h => h.trim().replace(/"/g, ''));
      return { columns: headers.map(h => ({ name: h, type: 'string', description: '', nullable: true })) };
    }
    if (ext === '.json') {
      const data = JSON.parse(content);
      const sample = Array.isArray(data) ? data[0] : data;
      if (sample && typeof sample === 'object') {
        return {
          columns: Object.keys(sample).map(k => ({
            name: k,
            type: typeof sample[k],
            description: '',
            nullable: true
          }))
        };
      }
    }
    return { columns: [] };
  } catch {
    return { columns: [] };
  }
};

// @route   GET /api/datasets
router.get('/', optionalAuth, validateDatasetListQuery, async (req, res) => {
  try {
    const {
      q, category, topic, tags, license, sort = '-createdAt',
      page = 1, limit = 12, featured, contributor
    } = req.query;

    const query = { status: 'published', visibility: 'public' };

    const listCacheKey = canUsePublicCache(req) ? datasetCacheKey('list', req.query) : null;
    if (listCacheKey) {
      const cachedPayload = await getCache(listCacheKey);
      if (cachedPayload) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedPayload);
      }
      res.setHeader('X-Cache', 'MISS');
    }

    if (q) query.$text = { $search: q };
    if (category) query.category = category;
    if (topic) query.topic = { $regex: topic, $options: 'i' };
    if (tags) query.tags = { $in: tags.split(',') };
    if (license) query.license = license;
    if (featured === 'true') query.featured = true;
    if (contributor) query.contributor = contributor;

    if (contributor && req.user && req.user._id.toString() === contributor) {
      delete query.status;
      delete query.visibility;
    } else if (contributor && req.user && req.user.role === 'admin') {
      delete query.status;
      delete query.visibility;
    }

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(20, Math.max(10, parseInt(limit, 10) || 12));
    const skip = (parsedPage - 1) * parsedLimit;
    const total = await Dataset.countDocuments(query);

    const datasets = await Dataset.find(query)
      .populate('contributor', 'username name avatar reputation')
      .sort(sort)
      .skip(skip)
      .limit(parsedLimit)
      .select('-downloads -accessRequests -sampleRecords')
      .lean();

    const payload = {
      success: true,
      datasets,
      pagination: {
        total,
        page: parsedPage,
        pages: Math.ceil(total / parsedLimit),
        limit: parsedLimit
      }
    };

    if (listCacheKey) {
      await setCache(listCacheKey, payload, normalizeCacheTtl);
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch datasets', error: error.message });
  }
});

// @route   GET /api/datasets/search
router.get('/search', optionalAuth, validateDatasetSearchQuery, async (req, res) => {
  try {
    const { q, category, tags, sort = 'score' } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Search query required' });

    const searchCacheKey = datasetCacheKey('search', req.query);
    const cachedPayload = await getCache(searchCacheKey);
    if (cachedPayload) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedPayload);
    }
    res.setHeader('X-Cache', 'MISS');

    const query = {
      $text: { $search: q },
      status: 'published',
      visibility: 'public'
    };
    if (category) query.category = category;

    const sortOption = sort === 'score' ? { score: { $meta: 'textScore' } } :
                       sort === 'downloads' ? { downloadCount: -1 } :
                       sort === 'latest' ? { createdAt: -1 } : { downloadCount: -1 };

    const datasets = await Dataset.find(query, sort === 'score' ? { score: { $meta: 'textScore' } } : {})
      .populate('contributor', 'username name avatar')
      .sort(sortOption)
      .limit(20)
      .select('-downloads -accessRequests')
      .lean();

    const payload = { success: true, datasets, total: datasets.length };
    await setCache(searchCacheKey, payload, normalizeCacheTtl);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Search failed', error: error.message });
  }
});

// @route   GET /api/datasets/trending
router.get('/trending', validateTrendingQuery, async (req, res) => {
  try {
    const trendingCacheKey = datasetCacheKey('trending', req.query);
    const cachedPayload = await getCache(trendingCacheKey);
    if (cachedPayload) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedPayload);
    }
    res.setHeader('X-Cache', 'MISS');

    const requestedLimit = parseInt(req.query.limit, 10);
    const normalizedLimit = Math.min(20, Math.max(10, requestedLimit || 12));
    const datasets = await Dataset.find({
      status: 'published',
      visibility: 'public'
    })
      .populate('contributor', 'username name avatar')
      .sort({ featured: -1, downloadCount: -1, viewCount: -1, qualityScore: -1, createdAt: -1 })
      .limit(normalizedLimit)
      .select('-downloads -accessRequests -sampleRecords')
      .lean();

    const payload = { success: true, datasets };
    await setCache(trendingCacheKey, payload, normalizeCacheTtl);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch trending' });
  }
});

// @route   GET /api/datasets/stats
router.get('/stats', async (req, res) => {
  try {
    const statsCacheKey = datasetCacheKey('stats', 'overview');
    const cachedPayload = await getCache(statsCacheKey);
    if (cachedPayload) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedPayload);
    }
    res.setHeader('X-Cache', 'MISS');

    const [totalDatasets, totalDownloads, categories, topContributors] = await Promise.all([
      Dataset.countDocuments({ status: 'published' }),
      Dataset.aggregate([{ $group: { _id: null, total: { $sum: '$downloadCount' } } }]),
      Dataset.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      User.find().sort({ totalUploads: -1 }).limit(5).select('username name avatar totalUploads reputation').lean()
    ]);

    const payload = {
      success: true,
      stats: {
        totalDatasets,
        totalDownloads: totalDownloads[0]?.total || 0,
        categories,
        topContributors
      }
    };

    await setCache(statsCacheKey, payload, normalizeCacheTtl);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// @route   GET /api/datasets/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findOne({
      $or: [
        { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
        { slug: req.params.id }
      ]
    })
      .populate('contributor', 'username avatar bio organization reputation totalUploads')
      .populate('coContributors.user', 'username avatar')
      .populate('accessRequests.user', 'username avatar');

    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    // Check access
    if (dataset.visibility === 'private') {
      if (!req.user || (dataset.contributor._id.toString() !== req.user._id.toString() && req.user.role !== 'admin')) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Increment view count
    await Dataset.findByIdAndUpdate(dataset._id, { $inc: { viewCount: 1 } });

    const hasAccess = !req.user ? false :
      dataset.contributor._id.toString() === req.user._id.toString() ||
      dataset.approvedUsers.includes(req.user._id) ||
      req.user.role === 'admin' ||
      dataset.visibility === 'public';

    const hasLiked = req.user ? dataset.likes.includes(req.user._id) : false;
    const hasBookmarked = req.user ? dataset.bookmarks.includes(req.user._id) : false;

    const datasetResponse = dataset.toObject({ virtuals: true });
    const isGuest = !req.user;
    const isOwner = req.user && dataset.contributor._id.toString() === req.user._id.toString();
    const isAdmin = req.user && req.user.role === 'admin';

    if (isGuest) {
      datasetResponse.sampleRecords = (datasetResponse.sampleRecords || []).slice(0, 3);
      datasetResponse.files = (datasetResponse.files || []).map((file) => ({
        originalName: file.originalName,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: file.uploadedAt
      }));
    }

    if (!isOwner && !isAdmin) {
      datasetResponse.accessRequests = [];
    }

    res.json({
      success: true,
      dataset: datasetResponse,
      hasAccess,
      hasLiked,
      hasBookmarked,
      previewLimited: isGuest,
      previewLimit: isGuest ? 3 : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch dataset', error: error.message });
  }
});

// @route   POST /api/datasets
router.post('/', protect, upload.array('files', 5), enforceNoPII(['title', 'description', 'collectionMethod', 'usageDescription', 'source', 'doi']), async (req, res) => {
  try {
    const {
      title, description, collectionMethod, usageDescription,
      topic, tags, category, license, visibility, source, doi, version,
      updateFrequency, geographicCoverage, language
    } = req.body;

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'At least one file is required' });
    }
    const processedFiles = [];
    let sampleRecords = [];
    let schema = { columns: [] };
    let stats = { rows: 0, columns: 0, size: 0 };

    for (const file of files) {
      processedFiles.push({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      });
      stats.size += file.size;

      if (sampleRecords.length === 0) {
        sampleRecords = parseSampleRecords(file);
        schema = extractSchema(file);
        stats.columns = schema.columns.length;
        stats.rows = sampleRecords.length > 0 ? sampleRecords.length * 10 : 0; // estimate
      }
    }

    const parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags || [];

    const dataset = await Dataset.create({
      title,
      description,
      collectionMethod,
      usageDescription,
      topic,
      tags: parsedTags,
      category,
      license: license || 'CC BY',
      visibility: visibility || 'public',
      source, doi, version,
      updateFrequency, geographicCoverage,
      language: language || 'en',
      contributor: req.user._id,
      files: processedFiles,
      sampleRecords,
      schemaInfo: schema,
      stats,
      versions: [{
        version: version || '1.0',
        summary: 'Initial upload',
        changelog: 'Dataset created',
        createdBy: req.user._id
      }],
      status: 'pending'
    });

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { totalUploads: 1, reputation: 10 }
    });

    await dataset.populate('contributor', 'username avatar');
    await applyDatasetQuality(dataset);
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'upload',
      summary: `Uploaded dataset ${dataset.title}`,
      metadata: { version: dataset.version, files: dataset.files.length }
    });

    await invalidateDatasetCaches();

    res.status(201).json({
      success: true,
      message: 'Dataset uploaded and sent for admin approval.',
      dataset
    });
  } catch (error) {
    console.error('❌ Dataset upload error:', error.message);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    res.status(500).json({ success: false, message: 'Failed to upload dataset', error: error.message });
  }
});

// @route   PUT /api/datasets/:id
router.put('/:id', protect, enforceNoPII(['title', 'description', 'collectionMethod', 'usageDescription', 'source', 'doi']), async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    if (dataset.status !== 'published') {
      const isOwner = req.user && dataset.contributor.toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'This dataset is awaiting admin approval' });
      }
    }

    if (dataset.contributor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updated = await Dataset.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('contributor', 'username avatar');

    await applyDatasetQuality(updated);
    await logAudit({
      dataset: updated._id,
      actor: req.user._id,
      action: 'updated',
      summary: `Updated dataset ${updated.title}`,
      metadata: { fields: Object.keys(req.body || {}) }
    });

    await invalidateDatasetCaches();

    res.json({ success: true, dataset: updated, message: 'Dataset updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update dataset' });
  }
});

// @route   DELETE /api/datasets/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    if (dataset.status !== 'published') {
      const isOwner = dataset.contributor.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'This dataset is awaiting admin approval' });
      }
    }

    if (dataset.contributor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Delete files
    for (const file of dataset.files) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    await Dataset.findByIdAndDelete(req.params.id);
    await User.findByIdAndUpdate(dataset.contributor, { $inc: { totalUploads: -1 } });
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'deleted',
      summary: `Deleted dataset ${dataset.title}`
    });

    await invalidateDatasetCaches();

    res.json({ success: true, message: 'Dataset deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete dataset' });
  }
});

// @route   POST /api/datasets/:id/download
router.post('/:id/download', protect, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const hasAccess = dataset.visibility === 'public' ||
      dataset.contributor.toString() === req.user._id.toString() ||
      dataset.approvedUsers.includes(req.user._id) ||
      req.user.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'You need to request access first' });
    }

    // Track download
    await Dataset.findByIdAndUpdate(req.params.id, {
      $inc: { downloadCount: 1 },
      $push: {
        downloads: {
          user: req.user._id,
          downloadedAt: new Date(),
          ip: req.ip
        }
      }
    });

    await User.findByIdAndUpdate(dataset.contributor, { $inc: { totalDownloads: 1 } });
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'downloaded',
      summary: `Downloaded dataset ${dataset.title}`,
      metadata: { ip: req.ip }
    });

    await invalidateDatasetCaches();

    res.json({
      success: true,
      message: 'Download recorded',
      files: dataset.files.map(f => ({
        originalName: f.originalName,
        downloadUrl: `/api/datasets/${req.params.id}/file/${f.filename}`
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Download failed' });
  }
});

// @route   GET /api/datasets/:id/file/:filename
router.get('/:id/file/:filename', protect, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const hasAccess = dataset.visibility === 'public' ||
      dataset.contributor.toString() === req.user._id.toString() ||
      dataset.approvedUsers.includes(req.user._id) ||
      req.user.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const file = dataset.files.find((entry) => entry.filename === req.params.filename);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ success: false, message: 'File missing on server' });
    }

    res.download(file.path, file.originalName || file.filename);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to download file' });
  }
});

// @route   POST /api/datasets/:id/access-request
router.post('/:id/access-request', protect, enforceNoPII(['message', 'purpose']), async (req, res) => {
  try {
    const { message, accessDays = 30, purpose = '' } = req.body;
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const existingRequest = dataset.accessRequests.find(r =>
      r.user.toString() === req.user._id.toString() && r.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'Access request already pending' });
    }

    dataset.accessRequests.push({
      user: req.user._id,
      message,
      purpose,
      accessDays: Math.max(1, Math.min(parseInt(accessDays, 10) || 30, 90)),
      status: 'pending'
    });
    await dataset.save();
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'access_requested',
      summary: `Requested access to ${dataset.title}`,
      metadata: { accessDays, purpose }
    });

    // Notify contributor
    await User.findByIdAndUpdate(dataset.contributor, {
      $push: {
        notifications: {
          type: 'access_request',
          message: `${req.user.username} requested access to "${dataset.title}"`,
          link: `/datasets/${dataset._id}`,
          read: false
        }
      }
    });

    res.json({ success: true, message: 'Access request submitted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to submit access request' });
  }
});

// @route   PUT /api/datasets/:id/access-request/:requestId
router.put('/:id/access-request/:requestId', protect, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    const dataset = await Dataset.findById(req.params.id);

    if (dataset.contributor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const request = dataset.accessRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    request.status = status;
    request.respondedAt = new Date();
    request.respondedBy = req.user._id;
    request.expiresAt = status === 'approved'
      ? new Date(Date.now() + (Math.max(1, Math.min(request.accessDays || 30, 90)) * 24 * 60 * 60 * 1000))
      : null;

    if (status === 'approved') {
      dataset.approvedUsers.push(request.user);
    }

    await dataset.save();

    // Notify requester
    await User.findByIdAndUpdate(request.user, {
      $push: {
        notifications: {
          type: 'access_response',
          message: `Your access request for "${dataset.title}" was ${status}`,
          link: `/datasets/${dataset._id}`,
          read: false
        }
      }
    });

    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: status === 'approved' ? 'access_approved' : 'access_rejected',
      summary: `Access request ${status} for ${dataset.title}`,
      metadata: { requestId: request._id, user: request.user, expiresAt: request.expiresAt }
    });

    await invalidateDatasetCaches();

    res.json({ success: true, message: `Access request ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update access request' });
  }
});

// @route   POST /api/datasets/:id/like
router.post('/:id/like', protect, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const hasLiked = dataset.likes.includes(req.user._id);
    if (hasLiked) {
      await Dataset.findByIdAndUpdate(req.params.id, { $pull: { likes: req.user._id } });
      await invalidateDatasetCaches();
      res.json({ success: true, liked: false, likeCount: dataset.likes.length - 1 });
    } else {
      await Dataset.findByIdAndUpdate(req.params.id, { $push: { likes: req.user._id } });
      await invalidateDatasetCaches();
      res.json({ success: true, liked: true, likeCount: dataset.likes.length + 1 });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle like' });
  }
});

// @route   POST /api/datasets/:id/bookmark
router.post('/:id/bookmark', protect, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    const hasBookmarked = dataset.bookmarks.includes(req.user._id);

    if (hasBookmarked) {
      await Dataset.findByIdAndUpdate(req.params.id, { $pull: { bookmarks: req.user._id } });
      await User.findByIdAndUpdate(req.user._id, { $pull: { savedDatasets: req.params.id } });
      await invalidateDatasetCaches();
      res.json({ success: true, bookmarked: false });
    } else {
      await Dataset.findByIdAndUpdate(req.params.id, { $push: { bookmarks: req.user._id } });
      await User.findByIdAndUpdate(req.user._id, { $push: { savedDatasets: req.params.id } });
      await invalidateDatasetCaches();
      res.json({ success: true, bookmarked: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle bookmark' });
  }
});

// @route   POST /api/datasets/:id/rate
router.post('/:id/rate', protect, async (req, res) => {
  try {
    const { score } = req.body;
    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ success: false, message: 'Score must be between 1 and 5' });
    }

    const dataset = await Dataset.findById(req.params.id);
    const existingRating = dataset.qualityRatings.find(r => r.user.toString() === req.user._id.toString());

    if (existingRating) {
      existingRating.score = score;
      existingRating.ratedAt = new Date();
    } else {
      dataset.qualityRatings.push({ user: req.user._id, score });
    }

    // Recalculate average
    const avg = dataset.qualityRatings.reduce((sum, r) => sum + r.score, 0) / dataset.qualityRatings.length;
    dataset.qualityScore = Math.round(avg * 10) / 10;
    dataset.featured = dataset.qualityScore > 4.5;
    await dataset.save();
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'updated',
      summary: `Rated dataset ${dataset.title}`,
      metadata: { score }
    });

    await invalidateDatasetCaches();

    res.json({ success: true, qualityScore: dataset.qualityScore, message: 'Rating submitted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to submit rating' });
  }
});

// @route   GET /api/datasets/:id/versions
router.get('/:id/versions', optionalAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id)
      .populate('contributor', 'username role')
      .populate('versions.createdBy', 'username role');
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    if (dataset.visibility === 'private') {
      const isOwner = req.user && dataset.contributor._id.toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({
      success: true,
      currentVersion: dataset.version,
      versions: (dataset.versions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch versions' });
  }
});

// @route   POST /api/datasets/:id/versions
router.post('/:id/versions', protect, async (req, res) => {
  try {
    const { version, summary = '', changelog = '' } = req.body;
    if (!version || typeof version !== 'string') {
      return res.status(400).json({ success: false, message: 'Version is required' });
    }

    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const isOwner = dataset.contributor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const exists = (dataset.versions || []).some((entry) => entry.version === version.trim());
    if (exists) {
      return res.status(400).json({ success: false, message: 'Version already exists' });
    }

    dataset.version = version.trim();
    dataset.versions.push({
      version: version.trim(),
      summary,
      changelog,
      createdBy: req.user._id
    });
    await dataset.save();
    await dataset.populate('versions.createdBy', 'username role');
    await applyDatasetQuality(dataset);
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'version_created',
      summary: `Created dataset version ${version.trim()}`,
      metadata: { summary, changelog }
    });

    await invalidateDatasetCaches();

    res.status(201).json({
      success: true,
      message: 'Version added successfully',
      currentVersion: dataset.version,
      versions: dataset.versions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add version' });
  }
});

// @route   POST /api/datasets/:id/versions/:versionId/rollback
router.post('/:id/versions/:versionId/rollback', protect, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const isOwner = safeObjectIdString(dataset.contributor) === safeObjectIdString(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const version = dataset.versions.id(req.params.versionId);
    if (!version) return res.status(404).json({ success: false, message: 'Version not found' });

    dataset.version = version.version;
    await dataset.save();
    await applyDatasetQuality(dataset);
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'version_rolled_back',
      summary: `Rolled back to version ${version.version}`
    });

    await invalidateDatasetCaches();

    res.json({ success: true, currentVersion: dataset.version, message: 'Rolled back successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to rollback version' });
  }
});

// @route   GET /api/datasets/:id/compare/:fromVersionId/:toVersionId
router.get('/:id/compare/:fromVersionId/:toVersionId', optionalAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const fromVersion = dataset.versions.id(req.params.fromVersionId);
    const toVersion = dataset.versions.id(req.params.toVersionId);
    if (!fromVersion || !toVersion) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const fromSnapshot = JSON.stringify(fromVersion.toObject());
    const toSnapshot = JSON.stringify(toVersion.toObject());
    const compare = {
      fromVersion: fromVersion.version,
      toVersion: toVersion.version,
      summaryChanged: fromVersion.summary !== toVersion.summary,
      changelogChanged: fromVersion.changelog !== toVersion.changelog,
      rowCountDelta: Number(dataset.stats?.rows || 0),
      qualityDelta: Math.round((dataset.qualityScore || 0) * 10) / 10,
      snapshotChanged: fromSnapshot !== toSnapshot
    };

    res.json({ success: true, compare });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to compare versions' });
  }
});

// @route   GET /api/datasets/:id/quality-report
router.get('/:id/quality-report', optionalAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const report = computeDatasetQuality(dataset);
    res.json({
      success: true,
      qualityScore: dataset.qualityScore,
      qualityMetrics: dataset.qualityMetrics || report.metrics,
      projectedScore: report.score,
      report
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch quality report' });
  }
});

// @route   GET /api/datasets/:id/timeline
router.get('/:id/timeline', optionalAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const auditLogs = await AuditLog.find({ dataset: dataset._id })
      .populate('actor', 'username role avatar')
      .sort('-createdAt')
      .limit(100);

    res.json({ success: true, timeline: auditLogs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch timeline' });
  }
});

// @route   GET /api/datasets/:id/issues
router.get('/:id/issues', optionalAuth, async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id)
      .populate('contributor', 'username role')
      .populate('qualityIssues.createdBy', 'username role')
      .populate('qualityIssues.resolvedBy', 'username role');
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    if (dataset.visibility === 'private') {
      const isOwner = req.user && dataset.contributor._id.toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const issues = (dataset.qualityIssues || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, issues });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch quality issues' });
  }
});

// @route   POST /api/datasets/:id/issues
router.post('/:id/issues', protect, enforceNoPII(['title', 'description']), async (req, res) => {
  try {
    const { type = 'other', title, description, priority = 'medium', assignee = null, dueDays = 7 } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    let assigneeId = null;
    if (assignee) {
      assigneeId = assignee;
      if (!String(assignee).match(/^[0-9a-fA-F]{24}$/)) {
        const assigneeUser = await User.findOne({ username: assignee }).select('_id');
        assigneeId = assigneeUser ? assigneeUser._id : null;
      }
    }

    dataset.qualityIssues.push({
      type,
      title,
      description,
      priority,
      createdBy: req.user._id,
      assignee: assigneeId,
      dueAt: new Date(Date.now() + (Math.max(1, Math.min(parseInt(dueDays, 10) || 7, 30)) * 24 * 60 * 60 * 1000))
    });

    await dataset.save();
    await dataset.populate('qualityIssues.createdBy', 'username role');
    await dataset.populate('qualityIssues.assignee', 'username role');

    const createdIssue = dataset.qualityIssues[dataset.qualityIssues.length - 1];
    await applyDatasetQuality(dataset);
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: 'issue_created',
      summary: `Created quality issue: ${title}`,
      metadata: { type, priority, assignee }
    });
    await invalidateDatasetCaches();
    res.status(201).json({ success: true, issue: createdIssue, message: 'Issue created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create issue' });
  }
});

// @route   PATCH /api/datasets/:id/issues/:issueId
router.patch('/:id/issues/:issueId', protect, async (req, res) => {
  try {
    const { status, resolutionNote = '', assignee = null, resolutionEvidence = [] } = req.body;
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const issue = dataset.qualityIssues.id(req.params.issueId);
    if (!issue) return res.status(404).json({ success: false, message: 'Issue not found' });

    const isOwner = dataset.contributor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isCreator = issue.createdBy.toString() === req.user._id.toString();
    if (!isOwner && !isAdmin && !isCreator) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (status) {
      issue.status = status;
      if (status === 'in_review') {
        issue.dueAt = issue.dueAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
      if (status === 'resolved') {
        issue.resolvedBy = req.user._id;
        issue.resolvedAt = new Date();
      } else if (status === 'verified') {
        issue.verifiedBy = req.user._id;
        issue.verifiedAt = new Date();
      } else {
        issue.resolvedBy = null;
        issue.resolvedAt = null;
        issue.verifiedBy = null;
        issue.verifiedAt = null;
      }
    }

    if (typeof resolutionNote === 'string') {
      issue.resolutionNote = resolutionNote;
    }

    if (assignee) {
      let assigneeId = assignee;
      if (!String(assignee).match(/^[0-9a-fA-F]{24}$/)) {
        const assigneeUser = await User.findOne({ username: assignee }).select('_id');
        assigneeId = assigneeUser ? assigneeUser._id : null;
      }
      issue.assignee = assigneeId;
    }

    if (Array.isArray(resolutionEvidence)) {
      issue.resolutionEvidence = resolutionEvidence
        .filter((item) => item && (item.filename || item.url))
        .map((item) => ({
          filename: item.filename || item.url || '',
          url: item.url || '',
          uploadedAt: item.uploadedAt || new Date()
        }));
    }

    await dataset.save();
    await dataset.populate('qualityIssues.createdBy', 'username role');
    await dataset.populate('qualityIssues.assignee', 'username role');
    await dataset.populate('qualityIssues.resolvedBy', 'username role');
    await dataset.populate('qualityIssues.verifiedBy', 'username role');
    await applyDatasetQuality(dataset);
    await logAudit({
      dataset: dataset._id,
      actor: req.user._id,
      action: status === 'verified' ? 'issue_verified' : 'issue_updated',
      summary: `Updated issue on ${dataset.title}`,
      metadata: { issueId: issue._id, status, assignee }
    });

    await invalidateDatasetCaches();

    res.json({ success: true, issue, message: 'Issue updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update issue' });
  }
});

module.exports = router;
