const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT secret is not configured');
  }
  return secret;
};

const buildJwtVerifyOptions = () => {
  const options = { algorithms: ['HS256'] };
  if (process.env.JWT_ISSUER) options.issuer = process.env.JWT_ISSUER;
  if (process.env.JWT_AUDIENCE) options.audience = process.env.JWT_AUDIENCE;
  return options;
};

const buildJwtSignOptions = (expiresIn) => {
  const options = {
    expiresIn,
    algorithm: 'HS256'
  };
  if (process.env.JWT_ISSUER) options.issuer = process.env.JWT_ISSUER;
  if (process.env.JWT_AUDIENCE) options.audience = process.env.JWT_AUDIENCE;
  return options;
};

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }

    const decoded = jwt.verify(token, getJwtSecret(), buildJwtVerifyOptions());
    const user = await User.findById(decoded.id).select('-password +tokenVersion');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const tokenVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;
    const currentTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
    if (tokenVersion !== currentTokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account has been deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret(), buildJwtVerifyOptions());
      const user = await User.findById(decoded.id).select('-password +tokenVersion');
      if (user) {
        const tokenVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;
        const currentTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
        if (tokenVersion === currentTokenVersion) {
          req.user = user;
        }
      }
    }
  } catch (error) {
    // Optional auth - just continue without user
  }
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

const generateToken = (id, options = {}) => {
  const tokenVersion = Number.isInteger(options.tokenVersion) ? options.tokenVersion : 0;
  const expiresIn = options.expiresIn || process.env.JWT_EXPIRE || '30d';
  return jwt.sign({ id, tokenVersion }, getJwtSecret(), buildJwtSignOptions(expiresIn));
};

module.exports = { protect, optionalAuth, authorize, generateToken };
