const { createClient } = require('redis');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_CACHE_TTL_SECONDS = parsePositiveInt(process.env.CACHE_TTL_SECONDS, 60);

const memoryCache = new Map();
let redisClient = null;
let redisEnabled = false;

const now = () => Date.now();

const normalizeTtl = (ttlSeconds) => parsePositiveInt(ttlSeconds, DEFAULT_CACHE_TTL_SECONDS);

const memoryGet = (key) => {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
};

const memorySet = (key, value, ttlSeconds) => {
  const ttl = normalizeTtl(ttlSeconds);
  memoryCache.set(key, {
    value,
    expiresAt: now() + ttl * 1000
  });
};

const memoryInvalidatePrefix = (prefix) => {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
};

const buildCacheKey = (...parts) => {
  return parts
    .flat()
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(':');
};

const initCache = async (logger = console) => {
  const redisUrl = String(process.env.REDIS_URL || '').trim();

  if (!redisUrl) {
    logger.info('ℹ️ Redis URL not configured. Using in-memory cache fallback.');
    redisEnabled = false;
    return { provider: 'memory' };
  }

  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(3000, retries * 100)
      }
    });

    redisClient.on('error', (error) => {
      logger.error('Redis cache error:', error.message);
    });

    await redisClient.connect();
    redisEnabled = true;
    logger.info('✅ Redis cache connected');
    return { provider: 'redis' };
  } catch (error) {
    redisEnabled = false;
    redisClient = null;
    logger.error(`⚠️ Redis unavailable. Falling back to in-memory cache: ${error.message}`);
    return { provider: 'memory', error: error.message };
  }
};

const closeCache = async () => {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }

  redisEnabled = false;
  redisClient = null;
};

const getCache = async (key) => {
  if (redisEnabled && redisClient) {
    const raw = await redisClient.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  return memoryGet(key);
};

const setCache = async (key, value, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS) => {
  const ttl = normalizeTtl(ttlSeconds);

  if (redisEnabled && redisClient) {
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    return;
  }

  memorySet(key, value, ttl);
};

const invalidateCacheByPrefix = async (prefix) => {
  const normalizedPrefix = String(prefix || '').trim();
  if (!normalizedPrefix) return;

  if (redisEnabled && redisClient) {
    let cursor = '0';

    do {
      const scanResult = await redisClient.scan(cursor, {
        MATCH: `${normalizedPrefix}*`,
        COUNT: 200
      });

      const nextCursor = typeof scanResult === 'object' ? scanResult.cursor : scanResult?.[0];
      const keys = typeof scanResult === 'object' ? scanResult.keys : scanResult?.[1] || [];

      if (Array.isArray(keys) && keys.length) {
        await redisClient.del(keys);
      }

      cursor = String(nextCursor || '0');
    } while (cursor !== '0');

    return;
  }

  memoryInvalidatePrefix(normalizedPrefix);
};

module.exports = {
  initCache,
  closeCache,
  getCache,
  setCache,
  invalidateCacheByPrefix,
  buildCacheKey,
  DEFAULT_CACHE_TTL_SECONDS
};
