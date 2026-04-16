const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

const piiPatterns = [
  { type: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'phone', regex: /\b(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,14}\b/g },
  { type: 'credit_card', regex: /\b(?:\d[ -]?){13,19}\b/g },
  { type: 'ssn_like', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'aadhaar_like', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g }
];

const isPiiGuardEnabled = () => ENABLED_VALUES.has(String(process.env.PII_GUARD_ENABLED || 'false').toLowerCase());

const scanTextForPii = (text) => {
  const input = String(text || '');
  const findings = [];

  piiPatterns.forEach((pattern) => {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(input)) {
      findings.push(pattern.type);
    }
  });

  return findings;
};

const enforceNoPII = (fields = [], options = {}) => {
  const normalizedFields = Array.isArray(fields) ? fields : [];
  const responseMessage = options.message || 'Potential sensitive personal information detected. Please remove PII and retry.';

  return (req, res, next) => {
    if (!isPiiGuardEnabled()) return next();

    const findings = [];

    normalizedFields.forEach((field) => {
      const value = req.body ? req.body[field] : undefined;
      if (typeof value !== 'string') return;
      const matches = scanTextForPii(value);
      if (matches.length) {
        findings.push({ field, types: matches });
      }
    });

    if (!findings.length) return next();

    return res.status(400).json({
      success: false,
      message: responseMessage,
      pii: findings.map((entry) => ({ field: entry.field, types: entry.types }))
    });
  };
};

module.exports = {
  enforceNoPII,
  isPiiGuardEnabled,
  scanTextForPii
};
