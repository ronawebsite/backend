const db = require('../config/db');

async function seedStocks() {
  const stocks = [
    { symbol: 'AAPL', name: 'Apple Inc.', u1: 25.0, u2: 12.0 },
    { symbol: 'TSLA', name: 'Tesla Inc.', u1: 30.0, u2: 10.0 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', u1: 50.0, u2: 20.0 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', u1: 15.0, u2: 8.0 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', u1: 20.0, u2: 10.0 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', u1: 18.0, u2: 6.0 },
    { symbol: 'META', name: 'Meta Platforms', u1: 10.0, u2: 5.0 },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', u1: 40.0, u2: 15.0 },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', u1: 25.0, u2: 10.0 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', u1: 35.0, u2: 14.0 }
  ];

  for (const s of stocks) {
    await db.query(`
      INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance, network)
      VALUES (1, ?, ?, ?, 'NASDAQ/NYSE')
      ON DUPLICATE KEY UPDATE balance = VALUES(balance)
    `, [s.symbol, s.name, s.u1]);

    await db.query(`
      INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance, network)
      VALUES (2, ?, ?, ?, 'NASDAQ/NYSE')
      ON DUPLICATE KEY UPDATE balance = VALUES(balance)
    `, [s.symbol, s.name, s.u2]);
  }
  console.log('Stock wallets seeded successfully for users 1 and 2!');
  process.exit(0);
}

seedStocks().catch(err => {
  console.error(err);
  process.exit(1);
});
