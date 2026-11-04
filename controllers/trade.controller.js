const db = require('../config/db');
const marketStream = require('../services/marketStream.service');
const tradingSimulator = require('../services/tradingSimulator');

exports.getMarkets = async (req, res, next) => {
  try {
    const tickers = marketStream.getAllTickers();
    res.json({ success: true, data: tickers });
  } catch (error) {
    next(error);
  }
};

exports.getCandles = async (req, res, next) => {
  try {
    const pair = req.query.pair || 'BTC/USDT';
    const timeframe = req.query.timeframe || '24H';
    const candles = marketStream.getCandles(pair, timeframe);
    res.json({ success: true, data: candles });
  } catch (error) {
    next(error);
  }
};

exports.getOrderBook = async (req, res, next) => {
  try {
    const pair = req.query.pair || 'BTC/USDT';
    const book = marketStream.getOrderBook(pair);
    res.json({ success: true, data: book });
  } catch (error) {
    next(error);
  }
};

exports.placeOrder = async (req, res, next) => {
  try {
    const { pair, side, order_type, price, amount } = req.body;

    if (!pair || !side || !order_type || !amount) {
      return res.status(400).json({ success: false, error: 'Pair, side (BUY/SELL), order_type (MARKET/LIMIT), and amount are required' });
    }

    const result = await tradingSimulator.placeOrder({
      userId: req.user.id,
      pair,
      side: side.toUpperCase(),
      orderType: order_type.toUpperCase(),
      price: parseFloat(price || 0),
      amount: parseFloat(amount)
    });

    res.status(201).json({
      success: true,
      message: `${order_type} ${side} order placed successfully`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.getOpenOrders = async (req, res, next) => {
  try {
    const [orders] = await db.query(
      "SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY id DESC",
      [req.user.id]
    );
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

exports.getOrderHistory = async (req, res, next) => {
  try {
    const [trades] = await db.query(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY id DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ success: true, data: trades });
  } catch (error) {
    next(error);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const [orders] = await db.query(
      "SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'",
      [orderId, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'Open order not found or already executed' });
    }

    const order = orders[0];
    const [baseSymbol, quoteSymbol] = order.pair.split('/');

    // Unlock locked funds
    if (order.side === 'BUY') {
      await db.query(
        'UPDATE user_wallets SET locked_balance = GREATEST(0, locked_balance - ?) WHERE user_id = ? AND asset_symbol = ?',
        [order.total_value, req.user.id, quoteSymbol]
      );
    } else {
      await db.query(
        'UPDATE user_wallets SET locked_balance = GREATEST(0, locked_balance - ?) WHERE user_id = ? AND asset_symbol = ?',
        [order.amount, req.user.id, baseSymbol]
      );
    }

    await db.query("UPDATE trades SET status = 'CANCELLED' WHERE id = ?", [orderId]);

    res.json({ success: true, message: 'Order successfully cancelled and locked balance restored' });
  } catch (error) {
    next(error);
  }
};

exports.getPositions = async (req, res, next) => {
  try {
    const [wallets] = await db.query(
      "SELECT asset_symbol, balance FROM user_wallets WHERE user_id = ? AND balance > 0 AND asset_symbol NOT IN ('USD', 'USDT')",
      [req.user.id]
    );

    const positions = [];
    for (const w of wallets) {
      const ticker = marketStream.getTicker(`${w.asset_symbol}/USDT`);
      const currentPrice = ticker ? ticker.price : 1;
      const currentHolding = parseFloat(w.balance);
      const currentValue = currentHolding * currentPrice;

      positions.push({
        pair: `${w.asset_symbol}/USDT`,
        asset: w.asset_symbol,
        size: currentHolding,
        currentPrice,
        totalValue: parseFloat(currentValue.toFixed(2)),
        unrealizedPnl: parseFloat((currentValue * 0.042).toFixed(2)), // simulated entry drift
        unrealizedPnlPct: 4.20
      });
    }

    res.json({ success: true, data: positions });
  } catch (error) {
    next(error);
  }
};

exports.getManagedTrades = async (req, res, next) => {
  try {
    const [trades] = await db.query(
      "SELECT * FROM trades WHERE user_id = ? AND (is_managed = 1 OR target_outcome != 'CLOSED' OR status = 'OPEN') ORDER BY id DESC LIMIT 30",
      [req.user.id]
    );
    res.json({ success: true, data: trades });
  } catch (error) {
    next(error);
  }
};

exports.getUserPrompts = async (req, res, next) => {
  try {
    const [prompts] = await db.query(
      "SELECT * FROM broker_prompts WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 10",
      [req.user.id]
    );
    res.json({ success: true, data: prompts });
  } catch (error) {
    next(error);
  }
};

exports.dismissUserPrompt = async (req, res, next) => {
  try {
    const promptId = req.params.id;
    await db.query(
      "UPDATE broker_prompts SET status = 'dismissed', dismissed_at = NOW() WHERE id = ? AND user_id = ?",
      [promptId, req.user.id]
    );
    res.json({ success: true, message: 'Broker prompt dismissed' });
  } catch (error) {
    next(error);
  }
};
