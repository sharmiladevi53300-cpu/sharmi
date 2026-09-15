const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'rms_super_secure_jwt_secret_key_2026';

// Middleware: Authenticate JWT Token
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '401 Unauthorized: Authentication token required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // CSRF protection for mutating requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfHeader || csrfHeader !== decoded.csrf) {
        return res.status(403).json({ error: '403 Forbidden: CSRF token mismatch.' });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: '401 Unauthorized: Invalid or expired token.' });
  }
}

// Middleware: Authorize specific role(s)
function authorizeRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '401 Unauthorized' });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({
        error: `403 Forbidden: Access restricted to ${requiredRole} accounts only.`
      });
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  authenticate,
  authorizeRole
};
