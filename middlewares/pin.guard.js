const db = require('../config/db');

async function verifyPin(req, res, next) {
  try {
    const pin = req.headers['x-transaction-pin'] || req.body.transaction_pin;

    if (!pin) {
      return res.status(403).json({
        success: false,
        error: '4-Digit Transaction PIN required for this operation',
        code: 'PIN_REQUIRED'
      });
    }

    const [rows] = await db.query('SELECT transaction_pin FROM app_users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const storedPin = rows[0].transaction_pin;
    if (storedPin !== String(pin)) {
      return res.status(403).json({
        success: false,
        error: 'Invalid 4-digit Transaction PIN. Verification failed.',
        code: 'INVALID_PIN'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = verifyPin;
