const path = require('path');
const serverModules = path.join(__dirname, '..', 'server', 'node_modules');
const mysql = require(path.join(serverModules, 'mysql2', 'promise'));
const bcrypt = require(path.join(serverModules, 'bcryptjs'));
const fs = require('fs');

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3307', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ddfichain',
  multipleStatements: true,
};

async function runMigration() {
  console.log(`[Migration] Connecting to MySQL on port ${DB_CONFIG.port}...`);
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('[Migration] Connected to database:', DB_CONFIG.database);

    // 1. Execute schema.sql
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('[Migration] Executing schema.sql DDL...');
    await connection.query(schemaSql);
    console.log('[Migration] Tables created successfully.');

    // 2. Hash default passwords
    const passwordHash = await bcrypt.hash('123456', 10);

    // 3. Insert Admin user
    const adminPhrase = 'alpha bravery castle delta echo foxtrot golf hotel india juliet kilo lima';
    await connection.query(
      `INSERT INTO app_users (account_id, full_name, username, email, password_hash, transaction_pin, recovery_phrase, role, kyc_status, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'approved', 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      ['ADM-99001', 'Chief Compliance & Risk Admin', 'superadmin', 'admin@mail.com', passwordHash, '1234', adminPhrase]
    );

    // 4. Insert Demo Pro Trader user
    const userPhrase = 'comet mike quebec secure orbit uniform papa elephant sierra victor galaxy quick';
    const [userRes] = await connection.query(
      `INSERT INTO app_users (account_id, full_name, username, email, password_hash, transaction_pin, recovery_phrase, role, kyc_status, email_verified, country, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 'approved', 1, 'United States', '+1 (212) 555-0199')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      ['USR-77001', 'Alexander Vance (Pro Trader)', 'alexvance', 'user@mail.com', passwordHash, '1234', userPhrase]
    );

    const [adminRows] = await connection.query('SELECT id FROM app_users WHERE email = ?', ['admin@mail.com']);
    const [userRows] = await connection.query('SELECT id FROM app_users WHERE email = ?', ['user@mail.com']);
    const adminId = adminRows[0].id;
    const userId = userRows[0].id;

    // 5. Seed Multi-Asset Wallets for user
    const initialAssets = [
      { symbol: 'USD', name: 'US Dollar (Fiat Buffer)', balance: 25450.00, address: 'USD-ACCOUNT-FEDERAL-WIRE-992' },
      { symbol: 'USDT', name: 'Tether USD (ERC20 / TRC20)', balance: 14850.00, address: '0x71C8fb861337577648bf4A36b69D0388A152fC3b' },
      { symbol: 'BTC', name: 'Bitcoin (Layer 1)', balance: 1.84500000, address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' },
      { symbol: 'ETH', name: 'Ethereum Mainnet', balance: 14.52000000, address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
      { symbol: 'SOL', name: 'Solana High Speed', balance: 94.20000000, address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
      { symbol: 'BNB', name: 'BNB Smart Chain', balance: 22.40000000, address: 'bnb136ns6lfw4zs5hg4n85vdthaad7hq5m4gtkgf23' },
      { symbol: 'TRX', name: 'TRON Protocol', balance: 24500.00000000, address: 'TLyqz4YmmYmkdBCnyP5mTxWBKGowjCc5ow' },
      { symbol: 'DOGE', name: 'Dogecoin', balance: 18500.00000000, address: 'D8vFz4GJ1EQCP8T4q44P96qZ4T4V1G4LwE' },
      { symbol: 'LTC', name: 'Litecoin Network', balance: 48.00000000, address: 'ltc1qrg5w36sq46p53vgj2z030z22euhf7t0q6lftg3' },
      { symbol: 'MATIC', name: 'Polygon PoS', balance: 5200.00000000, address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
      { symbol: 'XRP', name: 'Ripple Ledger', balance: 6400.00000000, address: 'rEb8TK3gBgk5auZyyb6BiH2JwNiHT3925e' }
    ];

    for (const a of initialAssets) {
      await connection.query(
        `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance, deposit_address)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE balance = VALUES(balance), deposit_address = VALUES(deposit_address)`,
        [userId, a.symbol, a.name, a.balance, a.address]
      );
      // Give admin a liquidity reserve wallet
      await connection.query(
        `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance, deposit_address)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
        [adminId, a.symbol, a.name, a.balance * 10, a.address]
      );
    }

    // 6. Seed Quantitative Trading Bots
    const bots = [
      {
        name: 'Momentum Scalper Pro',
        slug: 'momentum-scalper',
        strategy_type: 'MOMENTUM_SCALPER',
        description: 'Ultra-low latency micro-trend execution capturing intraday volatility spikes.',
        roi_min: 1.80,
        roi_max: 4.20,
        win_rate: 91,
        min_investment: 100.00,
        risk_level: 'High Frequency',
        default_params: JSON.stringify({ ema_fast: 9, ema_slow: 21, stop_loss_pct: 1.5, take_profit_pct: 3.5 }),
        icon: 'zap',
        badge_color: 'amber'
      },
      {
        name: 'Institutional Grid Bot',
        slug: 'grid-bot',
        strategy_type: 'GRID_TRADING',
        description: 'Automated geometric grid placing bilateral limit orders across dynamic support/resistance zones.',
        roi_min: 2.20,
        roi_max: 5.80,
        win_rate: 89,
        min_investment: 250.00,
        risk_level: 'Medium',
        default_params: JSON.stringify({ grid_levels: 10, price_range_pct: 12, rebalance_freq_min: 15 }),
        icon: 'grid',
        badge_color: 'indigo'
      },
      {
        name: 'RSI Mean Reversion Alpha',
        slug: 'rsi-mean-reversion',
        strategy_type: 'RSI_REVERSION',
        description: 'Identifies statistically extreme overbought (>70) and oversold (<30) conditions with automated counter-trend entries.',
        roi_min: 1.50,
        roi_max: 3.80,
        win_rate: 94,
        min_investment: 200.00,
        risk_level: 'Low Risk',
        default_params: JSON.stringify({ rsi_period: 14, overbought: 70, oversold: 30, exit_rsi: 50 }),
        icon: 'trending-up',
        badge_color: 'emerald'
      },
      {
        name: 'SMA Trend Crossover',
        slug: 'sma-crossover',
        strategy_type: 'SMA_CROSSOVER',
        description: 'Golden Cross & Death Cross trend-following system configured for institutional macro momentum.',
        roi_min: 2.50,
        roi_max: 6.50,
        win_rate: 86,
        min_investment: 500.00,
        risk_level: 'Medium Trend',
        default_params: JSON.stringify({ sma_short: 20, sma_long: 50, trailing_stop_pct: 2.0 }),
        icon: 'activity',
        badge_color: 'purple'
      },
      {
        name: 'Whale Flow Tracker',
        slug: 'whale-tracker',
        strategy_type: 'NEURAL_TREND',
        description: 'Monitors multi-million dollar on-chain block trades and institutional order book depth imbalances.',
        roi_min: 3.20,
        roi_max: 8.50,
        win_rate: 82,
        min_investment: 1000.00,
        risk_level: 'High Yield',
        default_params: JSON.stringify({ volume_multiplier: 3.0, orderbook_depth_ratio: 1.8 }),
        icon: 'shield',
        badge_color: 'blue'
      }
    ];

    for (const b of bots) {
      await connection.query(
        `INSERT INTO trading_bots (name, slug, strategy_type, description, roi_min, roi_max, win_rate, min_investment, risk_level, default_params, icon, badge_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
        [b.name, b.slug, b.strategy_type, b.description, b.roi_min, b.roi_max, b.win_rate, b.min_investment, b.risk_level, b.default_params, b.icon, b.badge_color]
      );
    }

    // 7. Seed active user bot instances
    const [botRows] = await connection.query('SELECT id, name FROM trading_bots LIMIT 2');
    if (botRows.length >= 2) {
      await connection.query(
        `INSERT INTO user_bots (user_id, bot_id, bot_name, pair, allocated_capital, pay_method, status, total_profit_loss, win_trades, total_trades)
         VALUES (?, ?, ?, 'BTC/USDT', 1500.00, 'USDT', 'running', 284.50, 14, 16),
                (?, ?, ?, 'ETH/USDT', 800.00, 'USDT', 'running', 142.10, 8, 9)`,
        [userId, botRows[0].id, botRows[0].name, userId, botRows[1].id, botRows[1].name]
      );
    }

    // 8. Seed 3D Virtual Cards
    await connection.query(
      `INSERT INTO virtual_cards (user_id, card_holder_name, card_number, cvv, expiry, card_type, card_tier, status, balance, spending_limit)
       VALUES (?, 'ALEXANDER VANCE', '4532 8901 3456 9102', '849', '09/29', 'Visa', 'Platinum World Elite', 'active', 3500.00, 15000.00),
              (?, 'ALEXANDER VANCE', '5412 7534 8920 1845', '312', '11/30', 'Mastercard', 'Institutional Black Card', 'active', 6250.00, 25000.00)`,
      [userId, userId]
    );

    // 9. Seed System Settings
    await connection.query(
      `INSERT INTO system_settings (id, sitename, siteurl, enable_email_verification, enable_pin_on_login, enable_kyc_for_withdrawal, enable_mock_trading, simulated_liquidity_usd)
       VALUES (1, 'Fichain Pro Institutional', 'http://localhost:4200', 0, 0, 0, 1, 50000000.00)
       ON DUPLICATE KEY UPDATE sitename = VALUES(sitename)`
    );

    // 10. Seed recent transactions
    await connection.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, network, amount, amount_usd, status, tx_hash, destination_address, notes)
       VALUES (?, 'deposit', 'BTC', 'Bitcoin Native', 0.50000000, 34250.00, 'completed', '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'Simulated liquidity injection'),
              (?, 'deposit', 'USDT', 'Ethereum (ERC20)', 10000.00000000, 10000.00, 'completed', '0x1234567890abcdef1234567890abcdef12345678', '0x71C8fb861337577648bf4A36b69D0388A152fC3b', 'Federal Wire Gateway Transfer'),
              (?, 'trade', 'ETH', 'Internal Book', 2.00000000, 5200.00, 'completed', 'EXEC-ETH-99824', 'Simulated Market Order', 'Market Buy Filled'),
              (?, 'bot_profit', 'USDT', 'Algorithm Yield', 184.20000000, 184.20, 'completed', 'YIELD-BOT-001', 'Algorithm', 'Momentum Scalper 24H Settlement')`,
      [userId, userId, userId, userId]
    );

    console.log('[Migration] Database initialized and seeded successfully!');
    console.log('[Migration] Demo Accounts:');
    console.log('   Admin: admin@mail.com / 123456 (PIN: 1234)');
    console.log('   User:  user@mail.com  / 123456 (PIN: 1234)');
    console.log('   Phrase: comet mike quebec secure orbit uniform papa elephant sierra victor galaxy quick');
  } catch (err) {
    console.error('[Migration Error]:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runMigration();
