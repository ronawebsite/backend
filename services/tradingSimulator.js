const db = require('../config/db');
const marketStream = require('./marketStream.service');
const stockStream = require('./stockStream.service');
const logger = require('../config/logger');

class TradingSimulator {
  constructor() {
    // Start background watcher for limit orders
    setInterval(() => this.checkOpenLimitOrders(), 2500);
  }

  getTickerForPair(pair) {
    if (pair && (pair.endsWith('/USD') || stockStream.tickers[pair])) {
      return stockStream.getTicker(pair);
    }
    return marketStream.getTicker(pair);
  }

  async placeOrder({ userId, pair, side, orderType, price, amount }) {
    const [baseSymbol, quoteSymbol] = pair.split('/');
    const cleanAmount = parseFloat(amount);
    const cleanPrice = parseFloat(price);

    if (cleanAmount <= 0) throw new Error('Order amount must be greater than zero');

    // Fetch user wallet for required asset
    const requiredSymbol = side === 'BUY' ? quoteSymbol : baseSymbol;
    const [wallets] = await db.query(
      'SELECT id, balance, locked_balance FROM user_wallets WHERE user_id = ? AND asset_symbol = ?',
      [userId, requiredSymbol]
    );

    if (wallets.length === 0) {
      throw new Error(`You do not have a wallet for ${requiredSymbol}. Please initialize or deposit funds.`);
    }

    const wallet = wallets[0];
    const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.locked_balance);

    // Calculate total cost
    let executionPrice = cleanPrice;
    if (orderType === 'MARKET') {
      const ticker = this.getTickerForPair(pair);
      // Realistic simulated slippage of 0.05%
      const slippage = side === 'BUY' ? 1.0005 : 0.9995;
      executionPrice = parseFloat((ticker.price * slippage).toFixed(4));
    }

    const totalValue = parseFloat((executionPrice * cleanAmount).toFixed(2));
    const requiredAmount = side === 'BUY' ? totalValue : cleanAmount;

    if (availableBalance < requiredAmount) {
      throw new Error(`Insufficient ${requiredSymbol} balance. Available: ${availableBalance.toFixed(4)}, Required: ${requiredAmount.toFixed(4)}`);
    }

    const fee = parseFloat((totalValue * 0.001).toFixed(4)); // 0.1% standard taker/maker fee

    if (orderType === 'MARKET') {
      // Execute instantly
      return await this.executeMarketOrder({
        userId,
        pair,
        side,
        amount: cleanAmount,
        price: executionPrice,
        totalValue,
        fee,
        baseSymbol,
        quoteSymbol
      });
    } else {
      // Lock balance for Limit Order
      await db.query(
        'UPDATE user_wallets SET locked_balance = locked_balance + ? WHERE id = ?',
        [requiredAmount, wallet.id]
      );

      const [res] = await db.query(
        `INSERT INTO trades (user_id, pair, side, order_type, price, amount, total_value, fee, status)
         VALUES (?, ?, ?, 'LIMIT', ?, ?, ?, ?, 'OPEN')`,
        [userId, pair, side, cleanPrice, cleanAmount, totalValue, fee]
      );

      return {
        id: res.insertId,
        pair,
        side,
        orderType: 'LIMIT',
        price: cleanPrice,
        amount: cleanAmount,
        totalValue,
        fee,
        status: 'OPEN',
        createdAt: new Date()
      };
    }
  }

  async executeMarketOrder({ userId, pair, side, amount, price, totalValue, fee, baseSymbol, quoteSymbol }) {
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();

      if (side === 'BUY') {
        // Deduct Quote (e.g. USDT)
        await conn.query(
          'UPDATE user_wallets SET balance = balance - ? WHERE user_id = ? AND asset_symbol = ?',
          [totalValue, userId, quoteSymbol]
        );

        // Add Base (e.g. BTC)
        await conn.query(
          `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
          [userId, baseSymbol, baseSymbol, amount]
        );
      } else {
        // SELL
        // Deduct Base (e.g. BTC)
        await conn.query(
          'UPDATE user_wallets SET balance = balance - ? WHERE user_id = ? AND asset_symbol = ?',
          [amount, userId, baseSymbol]
        );

        // Add Quote (e.g. USDT) minus fee
        const netQuote = totalValue - fee;
        await conn.query(
          `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
          [userId, quoteSymbol, quoteSymbol, netQuote]
        );
      }

      // Record trade in trades table
      const [tradeRes] = await conn.query(
        `INSERT INTO trades (user_id, pair, side, order_type, price, amount, filled_amount, total_value, fee, status, filled_at)
         VALUES (?, ?, ?, 'MARKET', ?, ?, ?, ?, ?, 'FILLED', NOW())`,
        [userId, pair, side, price, amount, amount, totalValue, fee]
      );

      // Record in transactions ledger
      await conn.query(
        `INSERT INTO transactions (user_id, type, asset_symbol, amount, amount_usd, fee, status, tx_hash, notes)
         VALUES (?, 'trade', ?, ?, ?, ?, 'completed', ?, ?)`,
        [
          userId,
          side === 'BUY' ? baseSymbol : quoteSymbol,
          amount,
          totalValue,
          fee,
          `EXEC-${side}-${Date.now().toString().slice(-6)}`,
          `Paper Trading Simulator: ${side} ${amount} ${baseSymbol} @ $${price}`
        ]
      );

      await conn.commit();

      logger.info(`[Trade Executed] User ${userId} ${side} ${amount} ${pair} @ $${price}`);
      return {
        id: tradeRes.insertId,
        pair,
        side,
        orderType: 'MARKET',
        price,
        amount,
        filledAmount: amount,
        totalValue,
        fee,
        status: 'FILLED',
        filledAt: new Date()
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async checkOpenLimitOrders() {
    try {
      const [openOrders] = await db.query(
        "SELECT * FROM trades WHERE status = 'OPEN' AND order_type = 'LIMIT'"
      );

      if (openOrders.length === 0) return;

      for (const order of openOrders) {
        const ticker = this.getTickerForPair(order.pair);
        if (!ticker) continue;

        const currentPrice = ticker.price;
        const limitPrice = parseFloat(order.price);
        let shouldFill = false;

        if (order.side === 'BUY' && currentPrice <= limitPrice) {
          shouldFill = true;
        } else if (order.side === 'SELL' && currentPrice >= limitPrice) {
          shouldFill = true;
        }

        if (shouldFill) {
          await this.fillLimitOrder(order, currentPrice);
        }
      }
    } catch (err) {
      logger.error(`[Limit Watcher Error]: ${err.message}`);
    }
  }

  async fillLimitOrder(order, executionPrice) {
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [baseSymbol, quoteSymbol] = order.pair.split('/');
      const amount = parseFloat(order.amount);
      const totalValue = parseFloat((executionPrice * amount).toFixed(2));
      const fee = parseFloat((totalValue * 0.001).toFixed(4));

      if (order.side === 'BUY') {
        // Unlock and deduct quote
        const originalLocked = parseFloat(order.total_value);
        await conn.query(
          'UPDATE user_wallets SET balance = balance - ?, locked_balance = GREATEST(0, locked_balance - ?) WHERE user_id = ? AND asset_symbol = ?',
          [totalValue, originalLocked, order.user_id, quoteSymbol]
        );

        // Add base
        await conn.query(
          `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
          [order.user_id, baseSymbol, baseSymbol, amount]
        );
      } else {
        // SELL: Unlock and deduct base
        await conn.query(
          'UPDATE user_wallets SET balance = balance - ?, locked_balance = GREATEST(0, locked_balance - ?) WHERE user_id = ? AND asset_symbol = ?',
          [amount, amount, order.user_id, baseSymbol]
        );

        // Add quote
        await conn.query(
          `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
          [order.user_id, quoteSymbol, quoteSymbol, totalValue - fee]
        );
      }

      await conn.query(
        "UPDATE trades SET status = 'FILLED', filled_amount = ?, filled_at = NOW(), price = ? WHERE id = ?",
        [amount, executionPrice, order.id]
      );

      await conn.commit();
      logger.info(`[Limit Order Filled] Order #${order.id} ${order.side} ${order.pair} @ $${executionPrice}`);
    } catch (err) {
      await conn.rollback();
      logger.error(`[Fill Limit Error]: ${err.message}`);
    } finally {
      conn.release();
    }
  }
}

module.exports = new TradingSimulator();
