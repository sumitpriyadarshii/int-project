const { logSecurityEvent } = require('../utils/securityEvents');

const requestBuckets = new Map();
const authFailureBuckets = new Map();

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const cleanupMap = (store, now, maxEntries = 50000) => {
  if (store.size <= maxEntries) return;

  for (const [key, value] of store.entries()) {
    if (!value || value.resetAt <= now || (value.lockUntil && value.lockUntil <= now)) {
      store.delete(key);
    }
    if (store.size <= maxEntries) break;
  }
};

const createRateLimiter = ({ name, windowMs, max, message, skip, eventSeverity = 'medium' }) => {
  const limitWindowMs = parseNumber(windowMs, 60 * 1000);
  const limitMax = parseNumber(max, 120);
  const limitMessage = message || 'Too many requests. Please try again shortly.';

  return async (req, res, next) => {
    try {
      if (typeof skip === 'function' && skip(req)) return next();

      const now = Date.now();
      const key = `${name}:${getClientIp(req)}`;
      let bucket = requestBuckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + limitWindowMs, blocked: 0 };
      }

      bucket.count += 1;
      const remaining = Math.max(limitMax - bucket.count, 0);

      res.setHeader('X-RateLimit-Limit', String(limitMax));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

      if (bucket.count > limitMax) {
        bucket.blocked += 1;
        const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
        res.setHeader('Retry-After', String(retryAfterSeconds));

        if (bucket.blocked === 3 || bucket.blocked === 10) {
          await logSecurityEvent({
            type: 'rate_limit_exceeded',
            severity: eventSeverity,
            ip: getClientIp(req),
            endpoint: req.originalUrl,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
            metadata: {
              limiter: name,
              method: req.method,
              limit: limitMax,
              windowMs: limitWindowMs,
              blockedCount: bucket.blocked
            }
          });
        }

        requestBuckets.set(key, bucket);
        cleanupMap(requestBuckets, now);
        return res.status(429).json({ success: false, message: limitMessage });
      }

      requestBuckets.set(key, bucket);
      cleanupMap(requestBuckets, now);
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

const getAuthFailureConfig = () => ({
  windowMs: parseNumber(process.env.AUTH_FAILURE_WINDOW_MS, 10 * 60 * 1000),
  maxFailures: parseNumber(process.env.AUTH_MAX_FAILURES, 5),
  lockMs: parseNumber(process.env.AUTH_LOCK_MS, 10 * 60 * 1000)
});

const authFailureKey = (ip, identifier) => `${ip}:${String(identifier || '').toLowerCase()}`;

const getAuthLockStatus = (ip, identifier) => {
  const now = Date.now();
  const key = authFailureKey(ip, identifier);
  const entry = authFailureBuckets.get(key);
  if (!entry || !entry.lockUntil || entry.lockUntil <= now) {
    return { isLocked: false, retryAfterSeconds: 0, lockedUntil: null };
  }

  return {
    isLocked: true,
    retryAfterSeconds: Math.max(Math.ceil((entry.lockUntil - now) / 1000), 1),
    lockedUntil: new Date(entry.lockUntil)
  };
};

const registerAuthFailure = (ip, identifier) => {
  const now = Date.now();
  const { windowMs, maxFailures, lockMs } = getAuthFailureConfig();
  const key = authFailureKey(ip, identifier);
  const entry = authFailureBuckets.get(key) || { failures: [], lockUntil: 0 };

  entry.failures = entry.failures.filter((timestamp) => timestamp > now - windowMs);
  entry.failures.push(now);

  if (entry.failures.length >= maxFailures) {
    entry.lockUntil = now + lockMs;
  }

  authFailureBuckets.set(key, entry);
  cleanupMap(authFailureBuckets, now, 20000);

  return {
    attempts: entry.failures.length,
    isLocked: entry.lockUntil > now,
    retryAfterSeconds: entry.lockUntil > now ? Math.max(Math.ceil((entry.lockUntil - now) / 1000), 1) : 0,
    lockedUntil: entry.lockUntil > now ? new Date(entry.lockUntil) : null
  };
};

const clearAuthFailures = (ip, identifier) => {
  authFailureBuckets.delete(authFailureKey(ip, identifier));
};

const apiRateLimiter = createRateLimiter({
  name: 'api',
  windowMs: parseNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: parseNumber(process.env.API_RATE_LIMIT_MAX, 300),
  message: 'Too many requests. Please slow down.'
});

const mutationRateLimiter = createRateLimiter({
  name: 'mutation',
  windowMs: parseNumber(process.env.MUTATION_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: parseNumber(process.env.MUTATION_RATE_LIMIT_MAX, 120),
  message: 'Too many write operations. Please retry in a moment.',
  skip: (req) => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
});

const authRateLimiter = createRateLimiter({
  name: 'auth',
  windowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 40),
  message: 'Too many authentication requests. Try again later.',
  eventSeverity: 'high'
});

const adminRateLimiter = createRateLimiter({
  name: 'admin',
  windowMs: parseNumber(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: parseNumber(process.env.ADMIN_RATE_LIMIT_MAX, 100),
  message: 'Too many admin requests. Try again shortly.',
  eventSeverity: 'high'
});

const passwordResetRateLimiter = createRateLimiter({
  name: 'password-reset',
  windowMs: parseNumber(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parseNumber(process.env.PASSWORD_RESET_RATE_LIMIT_MAX, 20),
  message: 'Too many password reset attempts. Please try again later.',
  eventSeverity: 'high'
});

module.exports = {
  apiRateLimiter,
  mutationRateLimiter,
  authRateLimiter,
  adminRateLimiter,
  passwordResetRateLimiter,
  getClientIp,
  getAuthLockStatus,
  registerAuthFailure,
  clearAuthFailures
};
