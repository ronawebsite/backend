const db = require('../config/db');
const botEngine = require('../services/botEngine.service');

exports.getAvailableBots = async (req, res, next) => {
  try {
    const [bots] = await db.query('SELECT * FROM trading_bots WHERE is_active = 1');
    res.json({ success: true, data: bots });
  } catch (error) {
    next(error);
  }
};

exports.getUserBots = async (req, res, next) => {
  try {
    const [userBots] = await db.query(
      `SELECT ub.*, tb.risk_level, tb.strategy_type, tb.badge_color, tb.icon
       FROM user_bots ub
       JOIN trading_bots tb ON ub.bot_id = tb.id
       WHERE ub.user_id = ?
       ORDER BY ub.id DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: userBots });
  } catch (error) {
    next(error);
  }
};

exports.createBot = async (req, res, next) => {
  try {
    const { bot_id, pair, allocated_capital, strategy_params } = req.body;
    const capital = parseFloat(allocated_capital);

    if (!bot_id || isNaN(capital) || capital <= 0) {
      return res.status(400).json({ success: false, error: 'Valid bot_id and allocated_capital are required' });
    }

    const [bots] = await db.query('SELECT * FROM trading_bots WHERE id = ?', [bot_id]);
    if (bots.length === 0) {
      return res.status(404).json({ success: false, error: 'Trading bot template not found' });
    }

    const botTemplate = bots[0];
    if (capital < parseFloat(botTemplate.min_investment)) {
      return res.status(400).json({
        success: false,
        error: `Minimum capital allocation for ${botTemplate.name} is $${botTemplate.min_investment}`
      });
    }

    // Check user USDT wallet balance
    const [wallets] = await db.query(
      "SELECT id, balance FROM user_wallets WHERE user_id = ? AND asset_symbol = 'USDT'",
      [req.user.id]
    );

    if (wallets.length === 0 || parseFloat(wallets[0].balance) < capital) {
      return res.status(400).json({
        success: false,
        error: `Insufficient USDT balance. Available: $${wallets[0] ? parseFloat(wallets[0].balance).toFixed(2) : '0.00'}`
      });
    }

    // Deduct capital from USDT wallet
    await db.query(
      "UPDATE user_wallets SET balance = balance - ? WHERE user_id = ? AND asset_symbol = 'USDT'",
      [capital, req.user.id]
    );

    // Insert user bot
    const [insertRes] = await db.query(
      `INSERT INTO user_bots (user_id, bot_id, bot_name, pair, allocated_capital, pay_method, strategy_params, status)
       VALUES (?, ?, ?, ?, ?, 'USDT', ?, 'running')`,
      [
        req.user.id,
        bot_id,
        botTemplate.name,
        pair || 'BTC/USDT',
        capital,
        strategy_params ? JSON.stringify(strategy_params) : botTemplate.default_params
      ]
    );

    // Record allocation transaction
    await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, amount_usd, status, tx_hash, notes)
       VALUES (?, 'bot_allocation', 'USDT', ?, ?, 'completed', ?, ?)`,
      [
        req.user.id,
        capital,
        capital,
        `BOT-ALLOC-${insertRes.insertId}`,
        `Capital allocated to ${botTemplate.name} (${pair || 'BTC/USDT'})`
      ]
    );

    res.status(201).json({
      success: true,
      message: `Successfully deployed ${botTemplate.name} with $${capital.toFixed(2)} allocated capital`,
      data: {
        id: insertRes.insertId,
        bot_name: botTemplate.name,
        allocated_capital: capital,
        status: 'running'
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleBotStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'running' or 'paused'

    if (!['running', 'paused'].includes(status)) {
      return res.status(400).json({ success: false, error: "Status must be 'running' or 'paused'" });
    }

    await db.query(
      'UPDATE user_bots SET status = ? WHERE id = ? AND user_id = ?',
      [status, id, req.user.id]
    );

    res.json({ success: true, message: `Bot status updated to ${status}` });
  } catch (error) {
    next(error);
  }
};

exports.terminateBot = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [bots] = await db.query(
      "SELECT * FROM user_bots WHERE id = ? AND user_id = ? AND status != 'stopped'",
      [id, req.user.id]
    );

    if (bots.length === 0) {
      return res.status(404).json({ success: false, error: 'Active bot instance not found' });
    }

    const bot = bots[0];
    const refundAmount = parseFloat(bot.allocated_capital);

    // Refund capital to USDT wallet
    await db.query(
      "UPDATE user_wallets SET balance = balance + ? WHERE user_id = ? AND asset_symbol = 'USDT'",
      [refundAmount, req.user.id]
    );

    // Mark bot stopped
    await db.query(
      "UPDATE user_bots SET status = 'stopped', stopped_at = NOW() WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: `Bot terminated. Capital of $${refundAmount.toFixed(2)} returned to your USDT wallet.`
    });
  } catch (error) {
    next(error);
  }
};

exports.backtestBot = async (req, res, next) => {
  try {
    const { strategy_type, pair, capital, days } = req.body;
    const result = botEngine.backtestStrategy(
      strategy_type || 'SMA_CROSSOVER',
      pair || 'BTC/USDT',
      capital || 1000,
      days || 30
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.getBotTradeLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [logs] = await db.query(
      'SELECT * FROM bot_trade_logs WHERE user_bot_id = ? AND user_id = ? ORDER BY id DESC LIMIT 50',
      [id, req.user.id]
    );

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};
