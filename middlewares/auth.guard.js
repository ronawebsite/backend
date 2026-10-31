const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');

async function authenticateToken(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.fichain_access_token) {
      token = req.cookies.fichain_access_token;
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    jwt.verify(token, env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(403).json({ success: false, error: 'Invalid authentication token' });
      }

      // Check if user still exists in database
      const [rows] = await db.query(
        'SELECT id, account_id, full_name, username, email, role, kyc_status, transaction_pin FROM app_users WHERE id = ?',
        [decoded.id]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, error: 'User account no longer active' });
      }

      req.user = rows[0];
      next();
    });
  } catch (error) {
    next(error);
  }
}

module.exports = authenticateToken;
