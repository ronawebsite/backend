const db = require('../config/db');
const logger = require('../config/logger');

async function initDepositWallets() {
  try {
    // 1. Create table if it doesn't exist
    await db.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Check if default wallets exist
    const [rows] = await db.query('SELECT COUNT(*) as cnt FROM platform_deposit_wallets');
    if (rows[0].cnt === 0) {
      const defaultWallets = [
        ['USDT', 'Tether USD', 'TRC20 (Tron)', 'TYDzsYUEpvnYmQk4zGP9sWWcTEd3GL7q3b', null, 10.00],
        ['BTC', 'Bitcoin', 'Bitcoin Mainnet', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', null, 0.0005],
        ['ETH', 'Ethereum', 'ERC20 (Ethereum)', '0x71C8fb861337577648bf4A36b69D0388A152fC3b', null, 0.01],
        ['SOL', 'Solana', 'Solana SPL', 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', null, 0.1],
        ['BNB', 'BNB', 'BEP20 (BNB Chain)', '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97', null, 0.05],
        ['TRX', 'TRON', 'TRC20', 'TNDF57bTf4nK9m2q5x8v7h6y5r4e3w2q1a', null, 50.0],
        ['XRP', 'Ripple', 'XRPL (Ripple Ledger)', 'rEb8TK3gBgk5auZyyb6MfCEmOMtdVYS556', '10928374', 20.0],
        ['DOGE', 'Dogecoin', 'Dogecoin Native', 'DMqRV5v7L3nFz9Qp4X2w7Y8k6M5N1B3V4C', null, 50.0],
        ['LTC', 'Litecoin', 'Litecoin Native', 'ltc1qg6v2s5x4q8e2h7k8m3n2p5v6x9', null, 0.1]
      ];

      for (const w of defaultWallets) {
        await db.query(
          `INSERT IGNORE INTO platform_deposit_wallets 
           (asset_symbol, asset_name, network, deposit_address, memo_tag, minimum_deposit)
           VALUES (?, ?, ?, ?, ?, ?)`,
          w
        );
      }
      logger.info('✅ Default platform deposit wallets initialized in database');
    }
  } catch (err) {
    logger.error(`[DepositWallet Init Error] ${err.message}`);
  }
}

// Run initialization on load
initDepositWallets();

module.exports = { initDepositWallets };
