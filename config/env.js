const dotenv = require('dotenv');
const path = require('path');

// Load .env from root fichain or server
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_HOST: process.env.DB_HOST || process.env.DB_SERVER || '127.0.0.1',
  DB_PORT: parseInt(process.env.DB_PORT || '3307', 10),
  DB_USER: process.env.DB_USER || process.env.DB_USERNAME || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  DB_NAME: process.env.DB_NAME || 'ddfichain',
  JWT_SECRET: process.env.JWT_SECRET || 'fichain_institution_jwt_secret_key_99812_capstone',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'fichain_refresh_secret_key_88421_capstone',
  JWT_EXPIRES_IN: '15m',
  REFRESH_EXPIRES_IN: '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:4200',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  GMAIL_USER: process.env.GMAIL_USER || '',
  GMAIL_PASS: process.env.GMAIL_PASS || '',
};
