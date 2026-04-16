const DATASET_CATEGORIES = new Set([
  'science',
  'technology',
  'health',
  'environment',
  'social',
  'economics',
  'education',
  'sports',
  'arts',
  'other'
]);

const DATASET_SORT_OPTIONS = new Set([
  '-createdAt',
  'createdAt',
  '-downloadCount',
  'downloadCount',
  '-viewCount',
  'viewCount',
  '-qualityScore',
  'qualityScore'
]);

const SEARCH_SORT_OPTIONS = new Set(['score', 'downloads', 'latest']);

const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      output[key] = sanitizeValue(nestedValue);
    }
    return output;
  }

  return value;
};

const sanitizeRequestPayload = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params);
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

const toInteger = (value) => Number.parseInt(String(value ?? ''), 10);

const validateDatasetListQuery = (req, res, next) => {
  const { page, limit, sort, category, featured } = req.query;

  if (page !== undefined) {
    const parsedPage = toInteger(page);
    if (!Number.isFinite(parsedPage) || parsedPage < 1 || parsedPage > 100000) {
      return res.status(400).json({ success: false, message: 'Invalid page parameter' });
    }
  }

  if (limit !== undefined) {
    const parsedLimit = toInteger(limit);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ success: false, message: 'Invalid limit parameter' });
    }
  }

  if (sort !== undefined && !DATASET_SORT_OPTIONS.has(String(sort))) {
    return res.status(400).json({ success: false, message: 'Invalid sort parameter' });
  }

  if (category !== undefined && !DATASET_CATEGORIES.has(String(category))) {
    return res.status(400).json({ success: false, message: 'Invalid category parameter' });
  }

  if (featured !== undefined && !['true', 'false'].includes(String(featured))) {
    return res.status(400).json({ success: false, message: 'Invalid featured parameter' });
  }

  return next();
};

const validateDatasetSearchQuery = (req, res, next) => {
  const { q, category, sort } = req.query;

  if (q !== undefined && String(q).trim().length > 160) {
    return res.status(400).json({ success: false, message: 'Search query is too long' });
  }

  if (category !== undefined && !DATASET_CATEGORIES.has(String(category))) {
    return res.status(400).json({ success: false, message: 'Invalid category parameter' });
  }

  if (sort !== undefined && !SEARCH_SORT_OPTIONS.has(String(sort))) {
    return res.status(400).json({ success: false, message: 'Invalid search sort parameter' });
  }

  return next();
};

const validateTrendingQuery = (req, res, next) => {
  const { limit } = req.query;

  if (limit !== undefined) {
    const parsedLimit = toInteger(limit);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ success: false, message: 'Invalid limit parameter' });
    }
  }

  return next();
};

module.exports = {
  sanitizeRequestPayload,
  validateDatasetListQuery,
  validateDatasetSearchQuery,
  validateTrendingQuery
};
