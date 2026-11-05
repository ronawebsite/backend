const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('./logger');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 25,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    logger.info(`[Database] MySQL Connection Pool initialized on ${env.DB_HOST}:${env.DB_PORT} [DB: ${env.DB_NAME}]`);
    conn.release();

    // 1. Ensure receipt_url column exists on transactions table
    await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(500) DEFAULT NULL AFTER notes').catch(() => {});

    // 2. Ensure platform_deposit_wallets table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_deposit_wallets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_symbol VARCHAR(16) NOT NULL,
        asset_name VARCHAR(64) NOT NULL,
        network VARCHAR(64) NOT NULL DEFAULT 'Mainnet',
        deposit_address VARCHAR(255) NOT NULL,
        memo_tag VARCHAR(64) DEFAULT NULL,
        instructions VARCHAR(255) DEFAULT 'Send only the specified asset to this address. Credits after network confirmation.',
        minimum_deposit DECIMAL(18, 6) DEFAULT 10.000000,
        confirmations_required INT DEFAULT 3,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_asset_network (asset_symbol, network)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch(() => {});

    // 3. Ensure default deposit wallets are seeded if table is empty
    const [existingWallets] = await pool.query('SELECT COUNT(*) as count FROM platform_deposit_wallets').catch(() => [[]]);
    if (existingWallets && existingWallets[0] && existingWallets[0].count === 0) {
      await pool.query(`
        INSERT IGNORE INTO platform_deposit_wallets (id, asset_symbol, asset_name, network, deposit_address, memo_tag, minimum_deposit, is_active)
        VALUES
        (1, 'USDT', 'Tether USD', 'TRC20 (Tron)', 'TYDzsYUEpvnYmQk4zGP9sWWcTEd3GL7q3b', NULL, 10.000000, 1),
        (2, 'BTC', 'Bitcoin', 'Bitcoin Mainnet', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', NULL, 0.000500, 1),
        (3, 'ETH', 'Ethereum', 'ERC20 (Ethereum)', '0x71C8fb861337577648bf4A36b69D0388A152fC3b', NULL, 0.010000, 1),
        (4, 'SOL', 'Solana', 'Solana SPL', 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', NULL, 0.100000, 1),
        (5, 'BNB', 'BNB', 'BEP20 (BNB Chain)', '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97', NULL, 0.050000, 1),
        (6, 'TRX', 'TRON', 'TRC20', 'TNDF57bTf4nK9m2q5x8v7h6y5r4e3w2q1a', NULL, 50.000000, 1),
        (7, 'XRP', 'Ripple', 'XRPL (Ripple Ledger)', 'rEb8TK3gBgk5auZyyb6MfCEmOMtdVYS556', '10928374', 20.000000, 1),
        (8, 'DOGE', 'Dogecoin', 'Dogecoin Native', 'DMqRV5v7L3nFz9Qp4X2w7Y8k6M5N1B3V4C', NULL, 50.000000, 1),
        (9, 'LTC', 'Litecoin', 'Litecoin Native', 'ltc1qg6v2s5x4q8e2h7k8m3n2p5v6x9', NULL, 0.100000, 1)
      `).catch(() => {});
    }
  } catch (err) {
    logger.error(`[Database Error] Failed to connect to MySQL: ${err.message}`);
  }
}

testConnection();

module.exports = {
  pool,
  query: (sql, params) => pool.query(sql, params),
  execute: (sql, params) => pool.execute(sql, params)
};
