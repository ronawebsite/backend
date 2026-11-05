const db = require('../config/db');
const bcrypt = require('bcryptjs');
const marketStream = require('../services/marketStream.service');
const stockStream = require('../services/stockStream.service');
const { notifyUser, getIO } = require('../sockets/market.socket');
const brokerEngine = require('../services/brokerEngine.service');

exports.getMetrics = async (req, res, next) => {
  try {
    const [userCount] = await db.query('SELECT COUNT(*) as total_users FROM app_users');
    const [botCount] = await db.query("SELECT COUNT(*) as active_bots FROM user_bots WHERE status = 'running'");
    const [volume] = await db.query('SELECT COALESCE(SUM(total_value), 0) as simulated_volume FROM trades');
    const [txSums] = await db.query(
      "SELECT type, COALESCE(SUM(amount_usd), 0) as total FROM transactions WHERE status = 'completed' GROUP BY type"
    );
    const [settings] = await db.query('SELECT simulated_liquidity_usd FROM system_settings WHERE id = 1');

    const txMap = {};
    txSums.forEach(t => { txMap[t.type] = parseFloat(t.total); });

    res.json({
      success: true,
      data: {
        total_users: userCount[0].total_users,
        active_bots: botCount[0].active_bots,
        simulated_volume_usd: parseFloat(volume[0].simulated_volume),
        total_liquidity_usd: parseFloat(settings[0] ? settings[0].simulated_liquidity_usd : 50000000.00),
        total_deposits_usd: txMap['deposit'] || 0,
        total_withdrawals_usd: txMap['withdrawal'] || 0
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const [users] = await db.query(
      `SELECT id, account_id, full_name, username, email, role, kyc_status, email_verified, transaction_pin, phone, country, created_at
       FROM app_users
       WHERE full_name LIKE ? OR email LIKE ? OR username LIKE ? OR account_id LIKE ?
       ORDER BY id DESC LIMIT 100`,
      [search, search, search, search]
    );

    // Attach wallets to each user
    for (const u of users) {
      const [wallets] = await db.query(
        'SELECT asset_symbol, balance, locked_balance FROM user_wallets WHERE user_id = ?',
        [u.id]
      );
      u.wallets = wallets;
    }

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

exports.updateUserBalance = async (req, res, next) => {
  try {
    const { user_id, asset_symbol, new_balance } = req.body;
    const balance = parseFloat(new_balance);

    if (!user_id || !asset_symbol || isNaN(balance)) {
      return res.status(400).json({ success: false, error: 'user_id, asset_symbol, and valid new_balance are required' });
    }

    await db.query(
      `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = ?`,
      [user_id, asset_symbol.toUpperCase(), asset_symbol.toUpperCase(), balance, balance]
    );

    res.json({
      success: true,
      message: `User #${user_id} ${asset_symbol} balance updated to ${balance.toFixed(4)}`
    });
  } catch (error) {
    next(error);
  }
};

exports.overrideKYC = async (req, res, next) => {
  try {
    const { user_id, status, admin_notes } = req.body;

    if (!['approved', 'rejected', 'pending', 'unverified'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid KYC status' });
    }

    await db.query('UPDATE app_users SET kyc_status = ? WHERE id = ?', [status, user_id]);
    await db.query(
      'UPDATE kyc_documents SET status = ?, admin_notes = ?, reviewed_at = NOW() WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [status, admin_notes || 'Reviewed by Executive Compliance Officer', user_id]
    );

    res.json({ success: true, message: `KYC status for user #${user_id} set to ${status}` });
  } catch (error) {
    next(error);
  }
};

exports.resetUserSecurity = async (req, res, next) => {
  try {
    const { user_id, new_password, new_pin } = req.body;

    if (new_password) {
      const hash = await bcrypt.hash(new_password, 10);
      await db.query('UPDATE app_users SET password_hash = ? WHERE id = ?', [hash, user_id]);
    }

    if (new_pin) {
      await db.query('UPDATE app_users SET transaction_pin = ? WHERE id = ?', [String(new_pin), user_id]);
    }

    res.json({ success: true, message: `Security credentials updated for user #${user_id}` });
  } catch (error) {
    next(error);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const [txs] = await db.query(
      `SELECT t.*, u.full_name, u.email, u.account_id
       FROM transactions t
       JOIN app_users u ON t.user_id = u.id
       ORDER BY t.id DESC LIMIT 100`
    );
    res.json({ success: true, data: txs });
  } catch (error) {
    next(error);
  }
};

exports.reviewTransaction = async (req, res, next) => {
  try {
    const { transaction_id, status, tx_hash } = req.body;

    if (!['completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be completed, failed, or cancelled' });
    }

    const [txRows] = await db.query('SELECT * FROM transactions WHERE id = ?', [transaction_id]);
    if (txRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const tx = txRows[0];

    // If approving a pending deposit -> Release & credit funds to the user's wallet!
    if (status === 'completed' && tx.status === 'pending' && tx.type === 'deposit') {
      const asset = tx.asset_symbol.toUpperCase();
      const amount = parseFloat(tx.amount);

      await db.query(
        `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
        [tx.user_id, asset, asset, amount]
      );

      // Real-time notification & balance push to user
      notifyUser(tx.user_id, 'wallet:balance_update', {
        type: 'DEPOSIT_APPROVED',
        asset: asset,
        amount: amount,
        message: `Your deposit of ${amount} ${asset} has been confirmed and released to your account!`
      });
    }

    // If rejecting a pending withdrawal -> Return locked funds to available balance
    if ((status === 'failed' || status === 'cancelled') && tx.status === 'pending' && tx.type === 'withdrawal') {
      const asset = tx.asset_symbol.toUpperCase();
      const amount = parseFloat(tx.amount);

      await db.query(
        `UPDATE user_wallets 
         SET balance = balance + ?, locked_balance = GREATEST(0, locked_balance - ?)
         WHERE user_id = ? AND asset_symbol = ?`,
        [amount, amount, tx.user_id, asset]
      );

      notifyUser(tx.user_id, 'wallet:balance_update', {
        type: 'WITHDRAWAL_REJECTED',
        asset: asset,
        amount: amount,
        message: `Your cash out request of ${amount} ${asset} was declined. Balance returned to wallet.`
      });
    }

    await db.query(
      'UPDATE transactions SET status = ?, tx_hash = COALESCE(?, tx_hash), updated_at = NOW() WHERE id = ?',
      [status, tx_hash || null, transaction_id]
    );

    res.json({
      success: true,
      message: status === 'completed' && tx.type === 'deposit'
        ? `Deposit #${transaction_id} approved! ${tx.amount} ${tx.asset_symbol} has been credited and released to client account.`
        : `Transaction #${transaction_id} updated to ${status}`
    });
  } catch (error) {
    next(error);
  }
};

exports.getSystemSettings = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM system_settings WHERE id = 1');
    res.json({ success: true, data: rows[0] || {} });
  } catch (error) {
    next(error);
  }
};

exports.updateSystemSettings = async (req, res, next) => {
  try {
    const {
      sitename,
      enable_email_verification,
      enable_pin_on_login,
      enable_kyc_for_withdrawal,
      simulated_liquidity_usd
    } = req.body;

    await db.query(
      `UPDATE system_settings
       SET sitename = COALESCE(?, sitename),
           enable_email_verification = COALESCE(?, enable_email_verification),
           enable_pin_on_login = COALESCE(?, enable_pin_on_login),
           enable_kyc_for_withdrawal = COALESCE(?, enable_kyc_for_withdrawal),
           simulated_liquidity_usd = COALESCE(?, simulated_liquidity_usd)
       WHERE id = 1`,
      [sitename, enable_email_verification, enable_pin_on_login, enable_kyc_for_withdrawal, simulated_liquidity_usd]
    );

    res.json({ success: true, message: 'System feature toggles updated successfully' });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// MANAGED TRADING & LIVE PROFIT CONTROLLER
// Allows Admin to trade for users, manipulate profits, and alter trade outcomes in real-time
// =========================================================================

exports.getManagedTrades = async (req, res, next) => {
  try {
    const userId = req.query.user_id;
    let query = `
      SELECT t.*, u.full_name, u.email, u.account_id 
      FROM trades t 
      JOIN app_users u ON t.user_id = u.id 
      WHERE (t.is_managed = 1 OR t.target_outcome != 'CLOSED' OR t.status = 'OPEN')
    `;
    const params = [];
    if (userId) {
      query += ' AND t.user_id = ?';
      params.push(userId);
    }
    query += ' ORDER BY t.id DESC LIMIT 100';

    const [trades] = await db.query(query, params);
    res.json({ success: true, data: trades });
  } catch (error) {
    next(error);
  }
};

exports.tradeForUser = async (req, res, next) => {
  try {
    const { user_id, pair, side, amount, price, initial_profit, target_outcome, admin_notes } = req.body;

    if (!user_id || !pair || !side || !amount) {
      return res.status(400).json({ success: false, error: 'user_id, pair, side, and amount are required' });
    }

    // Determine current market price if not specified
    let executionPrice = parseFloat(price || 0);
    if (!executionPrice) {
      if (pair.includes('/USD') && !pair.includes('USDT')) {
        const t = stockStream.getTicker(pair);
        executionPrice = t ? t.price : 150.00;
      } else {
        const t = marketStream.getTicker(pair);
        executionPrice = t ? t.price : 65000.00;
      }
    }

    const tradeAmount = parseFloat(amount);
    const totalValue = parseFloat((executionPrice * tradeAmount).toFixed(2));
    const profit = parseFloat(initial_profit || 0.00);
    const outcome = target_outcome || 'IN_PROGRESS';
    const notes = admin_notes || 'Managed trade executed by Platform Supervisor';

    const [result] = await db.query(
      `INSERT INTO trades 
       (user_id, pair, side, order_type, price, amount, filled_amount, total_value, fee, realized_pnl, status, filled_at, is_managed, current_profit, target_outcome, admin_notes, intervention_at)
       VALUES (?, ?, ?, 'MARKET', ?, ?, ?, ?, 0.0000, 0.00, 'FILLED', NOW(), 1, ?, ?, ?, NOW())`,
      [user_id, pair, side.toUpperCase(), executionPrice, tradeAmount, tradeAmount, totalValue, profit, outcome, notes]
    );

    const tradeId = result.insertId;

    const [newTradeRows] = await db.query(
      `SELECT t.*, u.full_name, u.email, u.account_id 
       FROM trades t 
       JOIN app_users u ON t.user_id = u.id 
       WHERE t.id = ?`,
      [tradeId]
    );
    const newTrade = newTradeRows[0];

    // Push live Socket.IO update to user
    notifyUser(user_id, 'trade:managed_update', {
      type: 'NEW_TRADE',
      trade: newTrade,
      message: `Your supervisor launched a managed trade on ${pair}!`
    });

    const io = getIO();
    if (io) {
      io.emit('trade:managed_broadcast', { trade: newTrade });
    }

    res.status(201).json({
      success: true,
      message: `Managed trade #${tradeId} placed successfully for user #${user_id}`,
      data: newTrade
    });
  } catch (error) {
    next(error);
  }
};

exports.alterTradeProfit = async (req, res, next) => {
  try {
    const { trade_id, new_profit, delta_profit, target_outcome, admin_notes } = req.body;

    if (!trade_id) {
      return res.status(400).json({ success: false, error: 'trade_id is required' });
    }

    const [existing] = await db.query('SELECT * FROM trades WHERE id = ?', [trade_id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Trade not found' });
    }

    const trade = existing[0];
    let updatedProfit = parseFloat(trade.current_profit || 0);

    if (new_profit !== undefined && new_profit !== null && !isNaN(parseFloat(new_profit))) {
      updatedProfit = parseFloat(new_profit);
    } else if (delta_profit !== undefined && !isNaN(parseFloat(delta_profit))) {
      updatedProfit = parseFloat((updatedProfit + parseFloat(delta_profit)).toFixed(2));
    }

    const outcome = target_outcome || trade.target_outcome || 'IN_PROGRESS';
    const notes = admin_notes || trade.admin_notes;

    let realizedPnl = trade.realized_pnl;
    if (outcome === 'WIN' || outcome === 'TAKE_PROFIT') {
      realizedPnl = updatedProfit > 0 ? updatedProfit : Math.abs(updatedProfit);
      updatedProfit = realizedPnl;
    } else if (outcome === 'LOSS' || outcome === 'STOP_LOSS') {
      realizedPnl = updatedProfit < 0 ? updatedProfit : -Math.abs(updatedProfit);
      updatedProfit = realizedPnl;
    }

    await db.query(
      `UPDATE trades 
       SET current_profit = ?, target_outcome = ?, admin_notes = COALESCE(?, admin_notes), intervention_at = NOW(), realized_pnl = ?, is_managed = 1
       WHERE id = ?`,
      [updatedProfit, outcome, notes, realizedPnl, trade_id]
    );

    const [updatedRows] = await db.query(
      `SELECT t.*, u.full_name, u.email, u.account_id 
       FROM trades t 
       JOIN app_users u ON t.user_id = u.id 
       WHERE t.id = ?`,
      [trade_id]
    );
    const updatedTrade = updatedRows[0];

    // Push live Socket.IO update to user
    notifyUser(trade.user_id, 'trade:managed_update', {
      type: 'PROFIT_UPDATE',
      trade: updatedTrade,
      delta: delta_profit,
      current_profit: updatedProfit,
      outcome: outcome
    });

    const io = getIO();
    if (io) {
      io.emit('trade:managed_broadcast', { trade: updatedTrade });
    }

    res.json({
      success: true,
      message: `Trade #${trade_id} profit updated to $${updatedProfit.toFixed(2)} (${outcome})`,
      data: updatedTrade
    });
  } catch (error) {
    next(error);
  }
};

exports.closeTrade = async (req, res, next) => {
  try {
    const { trade_id, outcome } = req.body;

    const [trades] = await db.query('SELECT * FROM trades WHERE id = ?', [trade_id]);
    if (trades.length === 0) {
      return res.status(404).json({ success: false, error: 'Trade not found' });
    }

    const trade = trades[0];
    let finalProfit = parseFloat(trade.current_profit || 0);

    if (outcome === 'WIN' && finalProfit <= 0) {
      finalProfit = 250.00;
    } else if (outcome === 'LOSS' && finalProfit >= 0) {
      finalProfit = -100.00;
    }

    // Finalize realized P&L and outcome
    await db.query(
      `UPDATE trades 
       SET status = 'FILLED', realized_pnl = ?, current_profit = ?, target_outcome = ?, intervention_at = NOW() 
       WHERE id = ?`,
      [finalProfit, finalProfit, outcome || 'CLOSED', trade_id]
    );

    // Credit client wallet (USDT or USD)
    const [existingWallets] = await db.query(
      `SELECT * FROM user_wallets WHERE user_id = ? AND asset_symbol IN ('USDT', 'USD') ORDER BY FIELD(asset_symbol, 'USDT', 'USD') LIMIT 1`,
      [trade.user_id]
    );
    const targetSymbol = existingWallets.length > 0 ? existingWallets[0].asset_symbol : 'USDT';

    await db.query(
      `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance) 
       VALUES (?, ?, ?, GREATEST(0, ?)) 
       ON DUPLICATE KEY UPDATE balance = GREATEST(0, balance + ?)`,
      [trade.user_id, targetSymbol, targetSymbol, finalProfit, finalProfit]
    );

    // Record audited financial transaction
    await db.query(
      `INSERT INTO transactions 
       (user_id, type, asset_symbol, amount, amount_usd, status, notes) 
       VALUES (?, 'trade', ?, ?, ?, 'completed', ?)`,
      [trade.user_id, targetSymbol, Math.abs(finalProfit), finalProfit, `Managed Trade #${trade_id} closed: ${outcome || 'CLOSED'} ($${finalProfit.toFixed(2)})`]
    );

    const [closedRows] = await db.query(
      `SELECT t.*, u.full_name, u.email, u.account_id 
       FROM trades t 
       JOIN app_users u ON t.user_id = u.id 
       WHERE t.id = ?`,
      [trade_id]
    );
    const closedTrade = closedRows[0];

    // Real-time Push to user
    notifyUser(trade.user_id, 'trade:managed_update', {
      type: 'TRADE_CLOSED',
      trade: closedTrade,
      profit: finalProfit,
      outcome: outcome || 'CLOSED',
      message: `Managed trade #${trade_id} has been settled: ${outcome} ($${finalProfit >= 0 ? '+' : ''}${finalProfit.toFixed(2)})`
    });

    const io = getIO();
    if (io) {
      io.emit('trade:managed_broadcast', { trade: closedTrade });
    }

    res.json({
      success: true,
      message: `Trade #${trade_id} closed with ${outcome}: $${finalProfit.toFixed(2)}`,
      data: closedTrade
    });
  } catch (error) {
    next(error);
  }
};

exports.signalTradeClosing = async (req, res, next) => {
  try {
    const { trade_id, estimated_profit, closing_note } = req.body;
    if (!trade_id) {
      return res.status(400).json({ success: false, error: 'trade_id is required' });
    }

    const [trades] = await db.query('SELECT * FROM trades WHERE id = ?', [trade_id]);
    if (trades.length === 0) {
      return res.status(404).json({ success: false, error: 'Trade not found' });
    }

    const trade = trades[0];
    const currentProfit = estimated_profit !== undefined ? parseFloat(estimated_profit) : parseFloat(trade.current_profit || 0);
    const note = closing_note || 'Deal closing window initiated: Senior broker is locking in target profit.';

    await db.query(
      `UPDATE trades 
       SET target_outcome = 'CLOSING_SOON', current_profit = ?, admin_notes = ?, intervention_at = NOW() 
       WHERE id = ?`,
      [currentProfit, note, trade_id]
    );

    const [updatedRows] = await db.query(
      `SELECT t.*, u.full_name, u.email, u.account_id 
       FROM trades t 
       JOIN app_users u ON t.user_id = u.id 
       WHERE t.id = ?`,
      [trade_id]
    );
    const updatedTrade = updatedRows[0];

    // Push real-time lifecycle event to user
    notifyUser(trade.user_id, 'trade:managed_update', {
      type: 'DEAL_CLOSING_SOON',
      trade: updatedTrade,
      current_profit: currentProfit,
      outcome: 'CLOSING_SOON',
      message: `🔔 Deal Closing Window Initiated: Senior broker is preparing to settle position (${trade.pair}). Target profit: $${currentProfit >= 0 ? '+' : ''}${currentProfit.toFixed(2)}.`
    });

    const io = getIO();
    if (io) {
      io.emit('trade:managed_broadcast', { trade: updatedTrade });
    }

    res.json({
      success: true,
      message: `Signaled closing window for trade #${trade_id}. User alerted in real time.`,
      data: updatedTrade
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// MULTI-ASSET BASKET TRADING & CUSTOMIZABLE BROKER CAPITAL PROMPTS
// =========================================================================

exports.tradeMultiAssets = async (req, res, next) => {
  try {
    const { user_id, assets, admin_notes } = req.body;

    if (!user_id || !Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ success: false, error: 'user_id and an array of assets are required' });
    }

    const createdTrades = [];

    for (const item of assets) {
      const pair = item.pair;
      const side = (item.side || 'BUY').toUpperCase();
      const amount = parseFloat(item.amount || 1);
      const initialProfit = parseFloat(item.initial_profit || 100);
      const notes = item.admin_notes || admin_notes || 'Multi-Asset Institutional Allocation';

      let executionPrice = parseFloat(item.price || 0);
      if (!executionPrice) {
        if (pair.includes('/USD') && !pair.includes('USDT')) {
          const t = stockStream.getTicker(pair);
          executionPrice = t ? t.price : 180.00;
        } else {
          const t = marketStream.getTicker(pair);
          executionPrice = t ? t.price : 65000.00;
        }
      }

      const totalValue = parseFloat((executionPrice * amount).toFixed(2));

      const [result] = await db.query(
        `INSERT INTO trades 
         (user_id, pair, side, order_type, price, amount, filled_amount, total_value, fee, realized_pnl, status, filled_at, is_managed, current_profit, target_outcome, admin_notes, intervention_at)
         VALUES (?, ?, ?, 'MARKET', ?, ?, ?, ?, 0.0000, 0.00, 'FILLED', NOW(), 1, ?, 'IN_PROGRESS', ?, NOW())`,
        [user_id, pair, side, executionPrice, amount, amount, totalValue, initialProfit, notes]
      );

      const [rows] = await db.query(
        `SELECT t.*, u.full_name, u.email, u.account_id 
         FROM trades t 
         JOIN app_users u ON t.user_id = u.id 
         WHERE t.id = ?`,
        [result.insertId]
      );

      if (rows.length > 0) {
        createdTrades.push(rows[0]);
      }
    }

    // Push live Socket.IO update to user
    notifyUser(user_id, 'trade:managed_update', {
      type: 'MULTI_TRADE_CREATED',
      trades: createdTrades,
      message: `Your broker allocated capital across ${createdTrades.length} institutional market assets!`
    });

    const io = getIO();
    if (io) {
      io.emit('trade:managed_broadcast', { count: createdTrades.length });
    }

    res.status(201).json({
      success: true,
      message: `Successfully executed ${createdTrades.length} managed asset positions for user #${user_id}`,
      data: createdTrades
    });
  } catch (error) {
    next(error);
  }
};

exports.boostAllProfits = async (req, res, next) => {
  try {
    const { user_id, delta_profit } = req.body;

    if (!user_id || delta_profit === undefined) {
      return res.status(400).json({ success: false, error: 'user_id and delta_profit are required' });
    }

    const delta = parseFloat(delta_profit);

    await db.query(
      `UPDATE trades 
       SET current_profit = current_profit + ?, intervention_at = NOW()
       WHERE user_id = ? AND is_managed = 1 AND target_outcome = 'IN_PROGRESS' AND status = 'FILLED'`,
      [delta, user_id]
    );

    const [updated] = await db.query(
      `SELECT t.*, u.full_name, u.email, u.account_id 
       FROM trades t 
       JOIN app_users u ON t.user_id = u.id 
       WHERE t.user_id = ? AND t.is_managed = 1 AND t.status = 'FILLED'
       ORDER BY t.id DESC`,
      [user_id]
    );

    // Notify user in real-time
    notifyUser(user_id, 'trade:managed_update', {
      type: 'BULK_PROFIT_BOOST',
      delta: delta,
      trades: updated,
      message: `Supervisor applied a bulk profit adjustment of ${delta >= 0 ? '+' : ''}$${delta} across all active assets!`
    });

    const io = getIO();
    if (io) {
      io.emit('trade:managed_broadcast', { count: updated.length });
    }

    res.json({
      success: true,
      message: `Boosted ${updated.length} active positions by $${delta.toFixed(2)} for user #${user_id}`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

exports.sendBrokerPrompt = async (req, res, next) => {
  try {
    const { user_id, title, message, target_amount, expected_payout, urgency } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({ success: false, error: 'user_id, title, and message are required' });
    }

    const target = target_amount ? parseFloat(target_amount) : 2500.00;
    const payout = expected_payout ? parseFloat(expected_payout) : 6000.00;
    const urg = urgency || 'opportunity';

    const [result] = await db.query(
      `INSERT INTO broker_prompts (user_id, title, message, target_amount, expected_payout, urgency, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [user_id, title, message, target, payout, urg]
    );

    const promptId = result.insertId;
    const [rows] = await db.query('SELECT * FROM broker_prompts WHERE id = ?', [promptId]);
    const prompt = rows[0];

    // Real-Time Socket.IO alert directly into user's browser session!
    notifyUser(user_id, 'broker:prompt', {
      prompt: prompt,
      alert: true,
      sound: true
    });

    const io = getIO();
    if (io) {
      io.emit('broker:prompt_broadcast', { user_id, prompt_id: promptId });
    }

    res.status(201).json({
      success: true,
      message: `Broker capital directive sent to user #${user_id}`,
      data: prompt
    });
  } catch (error) {
    next(error);
  }
};

exports.getBrokerPrompts = async (req, res, next) => {
  try {
    const userId = req.query.user_id;
    let query = `
      SELECT p.*, u.full_name, u.email, u.account_id
      FROM broker_prompts p
      JOIN app_users u ON p.user_id = u.id
    `;
    const params = [];
    if (userId) {
      query += ' WHERE p.user_id = ?';
      params.push(userId);
    }
    query += ' ORDER BY p.id DESC LIMIT 50';

    const [prompts] = await db.query(query, params);
    res.json({ success: true, data: prompts });
  } catch (error) {
    next(error);
  }
};

exports.dismissBrokerPrompt = async (req, res, next) => {
  try {
    const promptId = req.params.id;
    await db.query(
      "UPDATE broker_prompts SET status = 'dismissed', dismissed_at = NOW() WHERE id = ?",
      [promptId]
    );
    res.json({ success: true, message: `Broker prompt #${promptId} dismissed` });
  } catch (error) {
    next(error);
  }
};

exports.toggleLiveDrift = async (req, res, next) => {
  try {
    const { enabled } = req.body;
    brokerEngine.setLiveDrift(enabled);
    res.json({
      success: true,
      message: `Live market drift loop set to ${brokerEngine.isLiveDriftEnabled()}`,
      data: { enabled: brokerEngine.isLiveDriftEnabled() }
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// PLATFORM DEPOSIT WALLETS (Admin Configured Deposit Addresses)
// =========================================================================
exports.getDepositWallets = async (req, res, next) => {
  try {
    const [wallets] = await db.query(
      'SELECT * FROM platform_deposit_wallets ORDER BY id ASC'
    );
    res.json({ success: true, data: wallets });
  } catch (error) {
    next(error);
  }
};

exports.createDepositWallet = async (req, res, next) => {
  try {
    const {
      asset_symbol,
      asset_name,
      network,
      deposit_address,
      memo_tag,
      instructions,
      minimum_deposit,
      confirmations_required,
      is_active
    } = req.body;

    if (!asset_symbol || !deposit_address) {
      return res.status(400).json({ success: false, error: 'Asset symbol and deposit address are required' });
    }

    const [result] = await db.query(
      `INSERT INTO platform_deposit_wallets 
       (asset_symbol, asset_name, network, deposit_address, memo_tag, instructions, minimum_deposit, confirmations_required, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset_symbol.toUpperCase().trim(),
        asset_name ? asset_name.trim() : asset_symbol.toUpperCase().trim(),
        network ? network.trim() : 'Mainnet',
        deposit_address.trim(),
        memo_tag ? memo_tag.trim() : null,
        instructions ? instructions.trim() : 'Send only the specified asset to this address. Credits after network confirmation.',
        minimum_deposit !== undefined ? parseFloat(minimum_deposit) : 10.0,
        confirmations_required !== undefined ? parseInt(confirmations_required, 10) : 3,
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      ]
    );

    res.status(201).json({
      success: true,
      message: `Deposit wallet for ${asset_symbol.toUpperCase()} created successfully`,
      data: { id: result.insertId }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateDepositWallet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      asset_symbol,
      asset_name,
      network,
      deposit_address,
      memo_tag,
      instructions,
      minimum_deposit,
      confirmations_required,
      is_active
    } = req.body;

    if (!deposit_address) {
      return res.status(400).json({ success: false, error: 'Deposit address cannot be empty' });
    }

    await db.query(
      `UPDATE platform_deposit_wallets
       SET asset_symbol = COALESCE(?, asset_symbol),
           asset_name = COALESCE(?, asset_name),
           network = COALESCE(?, network),
           deposit_address = ?,
           memo_tag = ?,
           instructions = COALESCE(?, instructions),
           minimum_deposit = COALESCE(?, minimum_deposit),
           confirmations_required = COALESCE(?, confirmations_required),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        asset_symbol ? asset_symbol.toUpperCase().trim() : null,
        asset_name ? asset_name.trim() : null,
        network ? network.trim() : null,
        deposit_address.trim(),
        memo_tag !== undefined ? (memo_tag ? memo_tag.trim() : null) : null,
        instructions !== undefined ? instructions : null,
        minimum_deposit !== undefined ? parseFloat(minimum_deposit) : null,
        confirmations_required !== undefined ? parseInt(confirmations_required, 10) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Deposit address updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleDepositWallet = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE platform_deposit_wallets SET is_active = NOT is_active WHERE id = ?', [id]);
    res.json({ success: true, message: 'Deposit wallet status updated' });
  } catch (error) {
    next(error);
  }
};

exports.deleteDepositWallet = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM platform_deposit_wallets WHERE id = ?', [id]);
    res.json({ success: true, message: 'Deposit wallet deleted successfully' });
  } catch (error) {
    next(error);
  }
};
