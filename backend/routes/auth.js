const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { protect, optionalAuth, generateToken } = require('../middleware/auth');
const { googleOAuthConfigured } = require('../config/passport');
const {
  getClientIp,
  getAuthLockStatus,
  registerAuthFailure,
  clearAuthFailures,
  passwordResetRateLimiter
} = require('../middleware/security');
const { logSecurityEvent } = require('../utils/securityEvents');
const { sendPasswordOtpEmail } = require('../utils/mailer');

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
const hashOtp = (code) => crypto.createHash('sha256').update(String(code || '')).digest('hex');
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const DEFAULT_BCRYPT_SALT_ROUNDS = 12;
const parsedBcryptRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_BCRYPT_SALT_ROUNDS}`, 10);
const BCRYPT_SALT_ROUNDS = Number.isFinite(parsedBcryptRounds) && parsedBcryptRounds >= 8 && parsedBcryptRounds <= 14
  ? parsedBcryptRounds
  : DEFAULT_BCRYPT_SALT_ROUNDS;
const normalizeIdentity = (value) => String(value || '').trim().toLowerCase();

const normalizeGoogleUsername = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized.length >= 3) {
    return normalized.slice(0, 30);
  }

  return `user_${Date.now().toString().slice(-6)}`;
};

const generateUniqueUsername = async (seed) => {
  const baseRaw = normalizeGoogleUsername(seed);
  const base = baseRaw.slice(0, 24);
  let candidate = base;
  let suffix = 1;

  while (await User.exists({ username: candidate })) {
    const suffixToken = `_${suffix}`;
    const trimmedBase = base.slice(0, Math.max(3, 30 - suffixToken.length));
    candidate = `${trimmedBase}${suffixToken}`;
    suffix += 1;
  }

  return candidate;
};

const getClientRedirectBase = (req) => {
  const configuredClientUrl =
    process.env.CLIENT_URL ||
    process.env.CLIENT_ORIGIN ||
    (process.env.CLIENT_URLS || '').split(',').map((entry) => entry.trim()).find(Boolean);

  if (configuredClientUrl) {
    return configuredClientUrl.replace(/\/+$/, '');
  }

  const requestOrigin = String(req.headers.origin || '').trim();
  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, '');
  }

  return 'http://localhost:5173';
};

const buildGoogleRedirectUrl = (req, params = {}) => {
  const base = getClientRedirectBase(req);
  const hash = new URLSearchParams({ oauth: 'google', ...params }).toString();

  try {
    const url = new URL(base);
    url.hash = hash;
    return url.toString();
  } catch (_) {
    return `${base}#${hash}`;
  }
};

const encodeOAuthPayload = (payload) => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const encodeOAuthUser = (user) => {
  return encodeOAuthPayload(user.toPublicJSON());
};

const buildGoogleSignupPrefill = async (googleProfile) => {
  const email = String(googleProfile.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google account email is unavailable.');
  }

  const name = String(googleProfile.name || '').trim();

  return {
    email,
    name,
    avatar: String(googleProfile.avatar || '')
  };
};

const findOrCreateGoogleUser = async (googleProfile, req) => {
  const email = String(googleProfile.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google account email is unavailable.');
  }

  const findCriteria = [{ email }];
  if (googleProfile.googleId) {
    findCriteria.unshift({ googleId: googleProfile.googleId });
  }

  let user = await User.findOne({ $or: findCriteria }).select('+tokenVersion');

  if (!user) {
    throw new Error('ACCOUNT_NOT_REGISTERED');
  }

  let shouldSave = false;

  if (googleProfile.googleId && user.googleId !== googleProfile.googleId) {
    user.googleId = googleProfile.googleId;
    shouldSave = true;
  }

  if (googleProfile.avatar && user.avatar !== googleProfile.avatar) {
    user.avatar = googleProfile.avatar;
    shouldSave = true;
  }

  if (user.authProvider !== 'google' && googleProfile.googleId) {
    user.authProvider = 'google';
    shouldSave = true;
  }

  if (shouldSave) {
    await user.save({ validateBeforeSave: false });
  }

  if (!user.isActive) {
    throw new Error('ACCOUNT_BLOCKED');
  }

  const clientIp = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const previousLogin = user.loginHistory[user.loginHistory.length - 1] || null;
  const suspiciousLogin = Boolean(
    previousLogin &&
      previousLogin.ip &&
      previousLogin.userAgent &&
      (previousLogin.ip !== clientIp || previousLogin.userAgent !== userAgent)
  );

  user.lastLogin = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.loginHistory.push({
    timestamp: new Date(),
    ip: clientIp,
    userAgent
  });

  if (user.loginHistory.length > 10) {
    user.loginHistory = user.loginHistory.slice(-10);
  }

  await user.save({ validateBeforeSave: false });

  if (suspiciousLogin) {
    await logSecurityEvent({
      type: 'suspicious_login',
      severity: 'medium',
      actor: user._id,
      ip: clientIp,
      endpoint: req.originalUrl,
      userAgent,
      metadata: {
        previousIp: previousLogin.ip,
        previousUserAgent: previousLogin.userAgent,
        reason: 'OAuth login context changed from previous session'
      }
    });
  }

  const token = generateToken(user._id, { tokenVersion: user.tokenVersion || 0 });
  return { user, token };
};

// @route   GET /api/auth/google
router.get('/google', (req, res, next) => {
  if (!googleOAuthConfigured) {
    return res.status(503).json({
      success: false,
      message: 'Google OAuth is not configured on this server.'
    });
  }

  const mode = req.query.mode === 'signup' ? 'signup' : 'signin';
  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
    state: mode
  })(req, res, next);
});

// @route   GET /api/auth/google/callback
router.get('/google/callback', (req, res, next) => {
  if (!googleOAuthConfigured) {
    return res.redirect(buildGoogleRedirectUrl(req, {
      error: 'Google OAuth is not configured on this server.'
    }));
  }

  return passport.authenticate('google', { session: false }, async (authError, googleProfile) => {
    if (authError || !googleProfile) {
      return res.redirect(buildGoogleRedirectUrl(req, {
        error: 'Google authentication failed. Please try again.'
      }));
    }

    try {
      const oauthMode = req.query.state === 'signup' ? 'signup' : 'signin';

      if (oauthMode === 'signup') {
        const email = String(googleProfile.email || '').trim().toLowerCase();
        if (!email) {
          throw new Error('Google account email is unavailable.');
        }

        const existingCriteria = [{ email }];
        if (googleProfile.googleId) {
          existingCriteria.unshift({ googleId: googleProfile.googleId });
        }

        const existingUser = await User.exists({ $or: existingCriteria });
        if (existingUser) {
          throw new Error('ACCOUNT_ALREADY_EXISTS');
        }

        const prefill = await buildGoogleSignupPrefill(googleProfile);
        return res.redirect(buildGoogleRedirectUrl(req, {
          mode: 'signup',
          prefill: encodeOAuthPayload(prefill)
        }));
      }

      const { user, token } = await findOrCreateGoogleUser(googleProfile, req);
      return res.redirect(buildGoogleRedirectUrl(req, {
        token,
        user: encodeOAuthUser(user),
        mode: oauthMode
      }));
    } catch (error) {
      const message = error.message === 'ACCOUNT_BLOCKED'
        ? 'Your account is blocked. Contact an administrator.'
        : error.message === 'ACCOUNT_ALREADY_EXISTS'
          ? 'Account already exists. Please sign in instead.'
        : error.message === 'ACCOUNT_NOT_REGISTERED'
          ? 'No account found for this Google email. Please register first.'
        : 'Unable to complete Google sign-in.';
      return res.redirect(buildGoogleRedirectUrl(req, { error: message }));
    }
  })(req, res, next);
});

// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password, bio, organization, avatar } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email, and password are required' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ success: false, message: `${field} already exists` });
    }

    const normalizedAvatar = typeof avatar === 'string' ? avatar.trim() : '';
    const safeAvatar = /^https?:\/\//i.test(normalizedAvatar) || normalizedAvatar.startsWith('/uploads/')
      ? normalizedAvatar
      : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    const user = await User.create({
      name: normalizedName,
      username,
      email,
      password,
      bio: bio || '',
      organization: organization || '',
      avatar: safeAvatar
    });
    const token = generateToken(user._id, { tokenVersion: user.tokenVersion || 0 });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to DataVerse.',
      token,
      user: user.toPublicJSON()
    });
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    console.error('Error details:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ success: false, message: `${field} is already registered` });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername, password, rememberMe } = req.body;
    const clientIp = getClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    const authIdentity = normalizeIdentity(emailOrUsername);

    if (!emailOrUsername || !password) {
      return res.status(400).json({ success: false, message: 'Please provide credentials' });
    }

    const lockStatus = getAuthLockStatus(clientIp, authIdentity);
    if (lockStatus.isLocked) {
      res.setHeader('Retry-After', String(lockStatus.retryAfterSeconds));
      await logSecurityEvent({
        type: 'auth_bruteforce',
        severity: 'high',
        ip: clientIp,
        endpoint: req.originalUrl,
        userAgent,
        metadata: {
          identifier: authIdentity,
          retryAfterSeconds: lockStatus.retryAfterSeconds,
          lockedUntil: lockStatus.lockedUntil
        }
      });
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.'
      });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }]
    }).select('+password +tokenVersion');

    if (!user || !(await user.comparePassword(password))) {
      const failure = registerAuthFailure(clientIp, authIdentity);
      if (failure.isLocked) {
        res.setHeader('Retry-After', String(failure.retryAfterSeconds));
      }

      if (failure.attempts >= 3 || failure.isLocked) {
        await logSecurityEvent({
          type: 'auth_bruteforce',
          severity: failure.isLocked ? 'critical' : 'high',
          ip: clientIp,
          endpoint: req.originalUrl,
          userAgent,
          metadata: {
            identifier: authIdentity,
            attempts: failure.attempts,
            retryAfterSeconds: failure.retryAfterSeconds,
            lockedUntil: failure.lockedUntil
          }
        });
      }

      if (failure.isLocked) {
        return res.status(429).json({
          success: false,
          message: 'Too many failed login attempts. Please try again later.'
        });
      }

      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User blocked due to rules and regulations. Contact the administrator to get unblocked.'
      });
    }

    clearAuthFailures(clientIp, authIdentity);

    const previousLogin = user.loginHistory[user.loginHistory.length - 1] || null;
    const suspiciousLogin = Boolean(
      previousLogin && previousLogin.ip && previousLogin.userAgent &&
      (previousLogin.ip !== clientIp || previousLogin.userAgent !== userAgent)
    );

    // Update last login
    user.lastLogin = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.loginHistory.push({
      timestamp: new Date(),
      ip: clientIp,
      userAgent
    });
    // Keep only last 10 login records
    if (user.loginHistory.length > 10) user.loginHistory = user.loginHistory.slice(-10);
    await user.save({ validateBeforeSave: false });

    if (suspiciousLogin) {
      await logSecurityEvent({
        type: 'suspicious_login',
        severity: 'medium',
        actor: user._id,
        ip: clientIp,
        endpoint: req.originalUrl,
        userAgent,
        metadata: {
          previousIp: previousLogin.ip,
          previousUserAgent: previousLogin.userAgent,
          reason: 'Login context changed from previous session'
        }
      });
    }

    const expiresIn = rememberMe ? '30d' : '7d';
    const token = generateToken(user._id, { expiresIn, tokenVersion: user.tokenVersion || 0 });

    res.json({
      success: true,
      message: `Welcome back, ${user.username}!`,
      token,
      expiresIn: rememberMe ? 30 : 7,
      user: user.toPublicJSON()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', passwordResetRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          otp: otpHash,
          otpExpiry,
          resetPasswordCode: null,
          resetPasswordExpire: null
        }
      },
      {
        new: true,
        select: 'email username'
      }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email. Please sign up first.' });
    }

    res.status(202).json({
      success: true,
      message: 'OTP sent to your registered email. It expires in 5 minutes.'
    });

    // Send email asynchronously so API response remains fast under load.
    setImmediate(async () => {
      try {
        const emailResult = await sendPasswordOtpEmail({
          to: user.email,
          username: user.username,
          otp
        });

        if (!emailResult.sent) {
          await User.updateOne(
            { _id: user._id, otp: otpHash },
            { $set: { otp: null, otpExpiry: null } }
          );
          console.error('❌ OTP email not sent:', emailResult.reason || 'Unknown mailer error');
        }
      } catch (mailError) {
        await User.updateOne(
          { _id: user._id, otp: otpHash },
          { $set: { otp: null, otpExpiry: null } }
        );
        console.error('❌ OTP email dispatch failed:', mailError.message);
      }
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to process forgot password request' });
  }
});

// @route   POST /api/auth/verify-otp
router.post('/verify-otp', passwordResetRateLimiter, async (req, res) => {
  try {
    const { email, otp, resetCode } = req.body;
    const providedOtp = String(otp || resetCode || '').trim();

    if (!email || !providedOtp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      email: normalizedEmail,
      otp: hashOtp(providedOtp),
      otpExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
});

// @route   POST /api/auth/reset-password
router.post('/reset-password', passwordResetRateLimiter, async (req, res) => {
  try {
    const { email, otp, resetCode, newPassword } = req.body;
    const providedOtp = String(otp || resetCode || '').trim();

    if (!email || !providedOtp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpHash = hashOtp(providedOtp);
    const user = await User.findOne({
      email: normalizedEmail,
      otp: otpHash,
      otpExpiry: { $gt: new Date() }
    }).select('_id');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await User.updateOne(
      { _id: user._id, otp: otpHash },
      {
        $set: {
          password: hashedPassword,
          otp: null,
          otpExpiry: null,
          resetPasswordCode: null,
          resetPasswordExpire: null
        },
        $inc: { tokenVersion: 1 }
      }
    );

    res.json({ success: true, message: 'Password reset successful. Please sign in.' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// @route   GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('savedDatasets', 'title slug thumbnail downloadCount')
      .populate('followers', 'username avatar')
      .populate('following', 'username avatar');

    res.json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// @route   PUT /api/auth/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { email, bio, organization, website, githubUrl, avatar } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (typeof email === 'string' && email.trim().toLowerCase() !== user.email) {
      const nextEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      user.email = nextEmail;
    }

    if (typeof bio === 'string') user.bio = bio;
    if (typeof organization === 'string') user.organization = organization;
    if (typeof website === 'string') user.website = website;
    if (typeof githubUrl === 'string') user.githubUrl = githubUrl;
    if (typeof avatar === 'string') user.avatar = avatar;

    await user.save();

    res.json({ success: true, user: user.toPublicJSON(), message: 'Profile updated successfully' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// @route   PUT /api/auth/change-password
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password +tokenVersion');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    const token = generateToken(user._id, { tokenVersion: user.tokenVersion || 0 });
    res.json({ success: true, message: 'Password changed successfully', token });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// @route   GET /api/auth/notifications
router.get('/notifications', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notifications');
    const notifications = user.notifications.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// @route   PUT /api/auth/notifications/read
router.put('/notifications/read', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: { 'notifications.$[].read': true }
    });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
});

// @route   GET /api/auth/users/:username
router.get('/users/:username', optionalAuth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -refreshTokens -loginHistory');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isDiscussionContext = String(req.query.context || '').toLowerCase() === 'discussion';
    const canSeeFullProfile = req.user && (req.user.role === 'admin' || req.user._id.toString() === user._id.toString() || user.discussionProfileAccess);

    if (isDiscussionContext && !canSeeFullProfile) {
      return res.json({
        success: true,
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
          role: user.role,
          discussionProfileAccess: user.discussionProfileAccess,
          message: 'Profile details are restricted by admin'
        }
      });
    }

    res.json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// @route   POST /api/auth/follow/:userId
router.post('/follow/:userId', protect, async (req, res) => {
  try {
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You can't follow yourself" });
    }
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const isFollowing = req.user.following.includes(req.params.userId);

    if (isFollowing) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: req.params.userId } });
      await User.findByIdAndUpdate(req.params.userId, { $pull: { followers: req.user._id } });
      res.json({ success: true, message: 'Unfollowed successfully', isFollowing: false });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $push: { following: req.params.userId } });
      await User.findByIdAndUpdate(req.params.userId, { $push: { followers: req.user._id } });
      res.json({ success: true, message: 'Following successfully', isFollowing: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to follow/unfollow' });
  }
});

module.exports = router;
