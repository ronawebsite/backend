const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');

// Generate 12-word mnemonic recovery phrase
function generateMnemonicPhrase() {
  const wordlist = [
    'alpha', 'bravery', 'castle', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
    'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
    'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
    'yankee', 'zulu', 'comet', 'orbit', 'galaxy', 'nebula', 'cosmos', 'star',
    'planet', 'token', 'chain', 'asset', 'secure', 'market', 'enigma', 'trade'
  ];
  const phrase = [];
  for (let i = 0; i < 12; i++) {
    const idx = Math.floor(Math.random() * wordlist.length);
    phrase.push(wordlist[idx]);
  }
  return phrase.join(' ');
}

function generateTokens(user) {
  const payload = {
    id: user.id,
    account_id: user.account_id,
    email: user.email,
    role: user.role
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_EXPIRES_IN });

  return { accessToken, refreshToken };
}

exports.register = async (req, res, next) => {
  try {
    const { full_name, username, email, password, phone, country } = req.body;

    if (!full_name || !username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Full name, username, email, and password are required' });
    }

    // Check existing
    const [existing] = await db.query(
      'SELECT id FROM app_users WHERE email = ? OR username = ?',
      [email.toLowerCase(), username.toLowerCase()]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'An account with this email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const recoveryPhrase = generateMnemonicPhrase();
    const accountId = 'USR-' + Math.floor(10000 + Math.random() * 90000);

    const [insertRes] = await db.query(
      `INSERT INTO app_users (account_id, full_name, username, email, password_hash, transaction_pin, recovery_phrase, role, kyc_status, email_verified, phone, country)
       VALUES (?, ?, ?, ?, ?, '1234', ?, 'user', 'unverified', 1, ?, ?)`,
      [accountId, full_name, username.toLowerCase(), email.toLowerCase(), passwordHash, recoveryPhrase, phone || null, country || 'United States']
    );

    const userId = insertRes.insertId;

    // Seed default demo wallets for new user
    const defaultAssets = [
      { symbol: 'USD', name: 'US Dollar', balance: 10000.00 },
      { symbol: 'USDT', name: 'Tether USD', balance: 5000.00 },
      { symbol: 'BTC', name: 'Bitcoin', balance: 0.25000000 },
      { symbol: 'ETH', name: 'Ethereum', balance: 2.50000000 },
      { symbol: 'SOL', name: 'Solana', balance: 15.00000000 },
      { symbol: 'BNB', name: 'BNB', balance: 4.00000000 },
      { symbol: 'TRX', name: 'TRON', balance: 5000.00000000 },
      { symbol: 'DOGE', name: 'Dogecoin', balance: 2500.00000000 },
      { symbol: 'LTC', name: 'Litecoin', balance: 10.00000000 },
      { symbol: 'MATIC', name: 'Polygon', balance: 1000.00000000 },
      { symbol: 'XRP', name: 'Ripple', balance: 1200.00000000 }
    ];

    for (const a of defaultAssets) {
      await db.query(
        `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance, deposit_address)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, a.symbol, a.name, a.balance, `0x${crypto.randomBytes(20).toString('hex')}`]
      );
    }

    // Issue virtual card
    const cardNum = '4' + Math.floor(100000000000000 + Math.random() * 900000000000000).toString().replace(/(\d{4})/g, '$1 ').trim();
    await db.query(
      `INSERT INTO virtual_cards (user_id, card_holder_name, card_number, cvv, expiry, card_type, card_tier, status, balance, spending_limit)
       VALUES (?, ?, ?, '492', '12/29', 'Visa', 'Platinum World Elite', 'active', 2500.00, 10000.00)`,
      [userId, full_name.toUpperCase(), cardNum]
    );

    const userObj = { id: userId, account_id: accountId, full_name, username, email, role: 'user', kyc_status: 'unverified' };
    const tokens = generateTokens(userObj);

    res.cookie('fichain_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false, // set true in production SSL
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Multi-asset sandbox ledger initialized.',
      data: {
        user: userObj,
        recovery_phrase: recoveryPhrase,
        tokens
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const [rows] = await db.query(
      'SELECT * FROM app_users WHERE email = ? OR username = ?',
      [email.toLowerCase(), email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email/username or password' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email/username or password' });
    }

    const tokens = generateTokens(user);

    res.cookie('fichain_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    delete user.password_hash;

    res.json({
      success: true,
      message: 'Authentication successful',
      data: {
        user,
        tokens
      }
    });
  } catch (error) {
    next(error);
  }
};

// Web3-Style 12-Word Recovery Phrase Dual-Login
exports.phraseLogin = async (req, res, next) => {
  try {
    const { phrase } = req.body;

    if (!phrase || phrase.trim().split(/\s+/).length < 12) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 12-word recovery mnemonic phrase' });
    }

    const cleanPhrase = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const [rows] = await db.query(
      'SELECT * FROM app_users WHERE LOWER(TRIM(recovery_phrase)) = ?',
      [cleanPhrase]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'No account associated with this recovery phrase' });
    }

    const user = rows[0];
    const tokens = generateTokens(user);

    res.cookie('fichain_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    delete user.password_hash;

    res.json({
      success: true,
      message: 'Mnemonic recovery login successful',
      data: {
        user,
        tokens
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies.fichain_refresh_token || req.body.refreshToken;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }

    jwt.verify(token, env.JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ success: false, error: 'Invalid or expired refresh token' });
      }

      const [rows] = await db.query('SELECT * FROM app_users WHERE id = ?', [decoded.id]);
      if (rows.length === 0) {
        return res.status(401).json({ success: false, error: 'User no longer exists' });
      }

      const user = rows[0];
      const tokens = generateTokens(user);
      delete user.password_hash;

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          user
        }
      });
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const [wallets] = await db.query(
      'SELECT id, asset_symbol, asset_name, balance, locked_balance, deposit_address FROM user_wallets WHERE user_id = ? ORDER BY id ASC',
      [req.user.id]
    );

    const user = { ...req.user };
    delete user.password_hash;

    res.json({
      success: true,
      data: {
        user,
        wallets
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.setPin = async (req, res, next) => {
  try {
    const { new_pin, current_pin } = req.body;

    if (!new_pin || !/^\d{4}$/.test(String(new_pin))) {
      return res.status(400).json({ success: false, error: 'Transaction PIN must be exactly 4 numeric digits' });
    }

    await db.query('UPDATE app_users SET transaction_pin = ? WHERE id = ?', [String(new_pin), req.user.id]);

    res.json({
      success: true,
      message: '4-digit Transaction PIN successfully updated'
    });
  } catch (error) {
    next(error);
  }
};
