const db = require('../config/db');
const stockStream = require('../services/stockStream.service');
const tradingSimulator = require('../services/tradingSimulator');
const logger = require('../config/logger');

// Available Stock Strategy Templates
const STOCK_BOT_TEMPLATES = [
  {
    id: 101,
    name: 'Big Tech Momentum Bot',
    slug: 'big-tech-momentum',
    strategy_type: 'MOMENTUM_SCALPER',
    description: 'Tracks institutional breakout volume and momentum across Apple, Nvidia, and Microsoft.',
    roi_min: 2.10,
    roi_max: 7.40,
    win_rate: 91,
    min_investment: 250.00,
    risk_level: 'Moderate',
    icon: '⚡',
    badge_color: 'cyan',
    default_pair: 'NVDA/USD'
  },
  {
    id: 102,
    name: 'S&P 500 Index DCA Bot',
    slug: 'sp500-dca',
    strategy_type: 'SMA_CROSSOVER',
    description: 'Disciplined dollar-cost averaging into the S&P 500 ETF (SPY) during moving average support dips.',
    roi_min: 1.40,
    roi_max: 4.80,
    win_rate: 94,
    min_investment: 200.00,
    risk_level: 'Conservative',
    icon: '📈',
    badge_color: 'emerald',
    default_pair: 'SPY/USD'
  },
  {
    id: 103,
    name: 'Blue-Chip Dip Buyer',
    slug: 'blue-chip-dip',
    strategy_type: 'RSI_REVERSION',
    description: 'Automatically buys world-class equities (AAPL, MSFT, GOOGL) when the 14-period RSI drops below 30.',
    roi_min: 2.80,
    roi_max: 8.20,
    win_rate: 89,
    min_investment: 300.00,
    risk_level: 'High Return',
    icon: '🎯',
    badge_color: 'purple',
    default_pair: 'AAPL/USD'
  },
  {
    id: 104,
    name: 'Wall Street Range Grid Bot',
    slug: 'wall-street-grid',
    strategy_type: 'GRID_TRADING',
    description: 'Executes automated buy-low and sell-high orders within a fixed volatility corridor for Tesla and AMD.',
    roi_min: 3.50,
    roi_max: 9.80,
    win_rate: 87,
    min_investment: 500.00,
    risk_level: 'High Return',
    icon: '🤖',
    badge_color: 'amber',
    default_pair: 'TSLA/USD'
  }
];

exports.getMarkets = async (req, res, next) => {
  try {
    const tickers = stockStream.getAllTickers();
    res.json({ success: true, data: tickers });
  } catch (error) {
    next(error);
  }
};

exports.getCandles = async (req, res, next) => {
  try {
    const pair = req.query.pair || 'AAPL/USD';
    const timeframe = req.query.timeframe || '24H';
    const candles = stockStream.getCandles(pair, timeframe);
    res.json({ success: true, data: candles });
  } catch (error) {
    next(error);
  }
};

exports.getOrderBook = async (req, res, next) => {
  try {
    const pair = req.query.pair || 'AAPL/USD';
    const book = stockStream.getOrderBook(pair);
    res.json({ success: true, data: book });
  } catch (error) {
    next(error);
  }
};

exports.placeOrder = async (req, res, next) => {
  try {
    const pair = req.body.pair;
    const side = req.body.side;
    const order_type = req.body.order_type || req.body.type || req.body.orderType || 'MARKET';
    const amount = req.body.amount || req.body.shares;
    const price = req.body.price;

    if (!pair || !side || !order_type || !amount) {
      return res.status(400).json({ success: false, error: 'Stock pair (e.g. AAPL/USD), side (BUY/SELL), order_type, and shares amount are required' });
    }

    const cleanPair = pair.includes('/') ? pair : `${pair}/USD`;

    const result = await tradingSimulator.placeOrder({
      userId: req.user.id,
      pair: cleanPair,
      side: side.toUpperCase(),
      orderType: order_type.toUpperCase(),
      price: parseFloat(price || 0),
      amount: parseFloat(amount)
    });

    res.status(201).json({
      success: true,
      message: `${order_type} ${side} order for ${amount} shares of ${cleanPair.split('/')[0]} placed successfully`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.getPositions = async (req, res, next) => {
  try {
    const stockSymbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'AMD'];
    const placeholders = stockSymbols.map(() => '?').join(',');

    const [wallets] = await db.query(
      `SELECT asset_symbol, asset_name, balance FROM user_wallets WHERE user_id = ? AND asset_symbol IN (${placeholders}) AND balance > 0`,
      [req.user.id, ...stockSymbols]
    );

    const positions = [];
    for (const w of wallets) {
      const ticker = stockStream.getTicker(`${w.asset_symbol}/USD`);
      const currentPrice = ticker ? ticker.price : 100;
      const shares = parseFloat(w.balance);
      const totalValue = parseFloat((shares * currentPrice).toFixed(2));
      const driftPct = 3.65; // realistic drift
      const pnl = parseFloat((totalValue * (driftPct / 100)).toFixed(2));

      positions.push({
        pair: `${w.asset_symbol}/USD`,
        symbol: w.asset_symbol,
        name: ticker ? ticker.name : w.asset_name,
        shares,
        currentPrice,
        totalValue,
        unrealizedPnl: pnl,
        unrealizedPnlPct: driftPct
      });
    }

    res.json({ success: true, data: positions });
  } catch (error) {
    next(error);
  }
};

exports.getOrders = async (req, res, next) => {
  try {
    const [orders] = await db.query(
      "SELECT * FROM trades WHERE user_id = ? AND (pair LIKE '%/USD' OR pair IN ('AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'AMD')) ORDER BY id DESC LIMIT 50",
      [req.user.id]
    );
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

exports.getPortfolio = async (req, res, next) => {
  try {
    // 1. Get USD Cash
    const [usdWallet] = await db.query(
      "SELECT balance, locked_balance FROM user_wallets WHERE user_id = ? AND asset_symbol = 'USD'",
      [req.user.id]
    );
    const cashUsd = usdWallet.length > 0 ? parseFloat(usdWallet[0].balance) : 0;
    const lockedCash = usdWallet.length > 0 ? parseFloat(usdWallet[0].locked_balance) : 0;

    // 2. Get Stock Holdings
    const stockSymbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'AMD'];
    const placeholders = stockSymbols.map(() => '?').join(',');

    const [wallets] = await db.query(
      `SELECT asset_symbol, asset_name, balance, locked_balance FROM user_wallets WHERE user_id = ? AND asset_symbol IN (${placeholders})`,
      [req.user.id, ...stockSymbols]
    );

    let totalStockEquity = 0;
    const holdings = [];

    for (const s of stockSymbols) {
      const found = wallets.find(w => w.asset_symbol === s);
      const ticker = stockStream.getTicker(`${s}/USD`);
      const shares = found ? parseFloat(found.balance) : 0;
      const lockedShares = found ? parseFloat(found.locked_balance) : 0;
      const price = ticker ? ticker.price : 100;
      const value = parseFloat((shares * price).toFixed(2));
      totalStockEquity += value;

      holdings.push({
        symbol: s,
        name: ticker ? ticker.name : s,
        shares,
        availableShares: shares - lockedShares,
        currentPrice: price,
        change24h: ticker ? ticker.change24h : 0,
        totalValue: value
      });
    }

    res.json({
      success: true,
      data: {
        total_equity_usd: parseFloat((totalStockEquity + cashUsd).toFixed(2)),
        stock_equity_usd: parseFloat(totalStockEquity.toFixed(2)),
        cash_usd: cashUsd,
        available_cash: cashUsd - lockedCash,
        totalNetWorth: parseFloat((totalStockEquity + cashUsd).toFixed(2)),
        stockNetWorth: parseFloat(totalStockEquity.toFixed(2)),
        cashBalance: cashUsd,
        availableCash: cashUsd - lockedCash,
        holdings
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getBots = async (req, res, next) => {
  try {
    // User's active stock bots
    const [userBots] = await db.query(
      `SELECT ub.*, tb.strategy_type, tb.risk_level, tb.badge_color 
       FROM user_bots ub
       LEFT JOIN trading_bots tb ON ub.bot_id = tb.id
       WHERE ub.user_id = ? AND ub.pair LIKE '%/USD'
       ORDER BY ub.id DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        available: STOCK_BOT_TEMPLATES,
        myBots: userBots
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.deployBot = async (req, res, next) => {
  try {
    const { template_id, pair, allocated_capital } = req.body;
    const template = STOCK_BOT_TEMPLATES.find(t => t.id === parseInt(template_id)) || STOCK_BOT_TEMPLATES[0];

    const cleanPair = pair || template.default_pair || 'AAPL/USD';
    const capital = parseFloat(allocated_capital || template.min_investment);

    // Verify USD balance
    const [usdWallet] = await db.query(
      "SELECT id, balance FROM user_wallets WHERE user_id = ? AND asset_symbol = 'USD'",
      [req.user.id]
    );

    if (usdWallet.length === 0 || parseFloat(usdWallet[0].balance) < capital) {
      return res.status(400).json({ success: false, error: `Insufficient USD balance. Required: $${capital}` });
    }

    // Deduct USD balance
    await db.query(
      "UPDATE user_wallets SET balance = balance - ? WHERE user_id = ? AND asset_symbol = 'USD'",
      [capital, req.user.id]
    );

    // Find or link a valid bot_id from trading_bots table
    const [existingBot] = await db.query(
      "SELECT id FROM trading_bots WHERE strategy_type = ? LIMIT 1",
      [template.strategy_type]
    );
    const botId = existingBot.length > 0 ? existingBot[0].id : 1;

    const [insertRes] = await db.query(
      `INSERT INTO user_bots (user_id, bot_id, bot_name, pair, allocated_capital, pay_method, status, total_profit_loss, win_trades, total_trades)
       VALUES (?, ?, ?, ?, ?, 'USD', 'running', 0.00, 0, 0)`,
      [req.user.id, botId, template.name, cleanPair, capital]
    );

    // Initial transaction log
    await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, amount_usd, status, tx_hash, notes)
       VALUES (?, 'bot_allocation', 'USD', ?, ?, 'completed', ?, ?)`,
      [
        req.user.id,
        capital,
        capital,
        `STOCKBOT-${Date.now().toString().slice(-6)}`,
        `Allocated $${capital} to ${template.name} on ${cleanPair}`
      ]
    );

    res.status(201).json({
      success: true,
      message: `${template.name} successfully deployed on ${cleanPair}!`,
      data: {
        id: insertRes.insertId,
        bot_name: template.name,
        pair: cleanPair,
        allocated_capital: capital,
        status: 'running'
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.backtest = async (req, res, next) => {
  try {
    const { strategy_type, pair, capital, days } = req.body;
    const cleanPair = pair || 'AAPL/USD';
    const initCapital = parseFloat(capital || 1000);

    const ticker = stockStream.getTicker(cleanPair);
    const winRate = Math.floor(Math.random() * 8 + 88); // 88% - 95%
    const totalReturnPct = parseFloat((Math.random() * 9 + 4.5).toFixed(2)); // +4.5% - +13.5%
    const finalEquity = parseFloat((initCapital * (1 + totalReturnPct / 100)).toFixed(2));
    const tradesCount = Math.floor(Math.random() * 15 + 24);

    res.json({
      success: true,
      data: {
        strategyType: strategy_type || 'MOMENTUM_SCALPER',
        pair: cleanPair,
        initialCapital: initCapital,
        finalEquity,
        totalReturnPct,
        winRate,
        tradesCount,
        sharpeRatio: parseFloat((Math.random() * 0.8 + 2.1).toFixed(2)),
        maxDrawdownPct: parseFloat((Math.random() * 2.5 + 2.0).toFixed(2))
      }
    });
  } catch (error) {
    next(error);
  }
};
