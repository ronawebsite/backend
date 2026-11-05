const db = require('../config/db');
const planEngine = require('../services/planEngine.service');
const logger = require('../config/logger');

// =========================================================================
// USER CONTROLLERS
// =========================================================================

/**
 * Get all available active investment plans
 */
exports.getActivePlans = async (req, res, next) => {
  try {
    const [plans] = await db.query(
      `SELECT id, name, description, initial_amount, target_amount, duration_days, duration_seconds,
              roi_percentage, risk_level, badge, icon, color, is_active
       FROM investment_plans
       WHERE is_active = 1
       ORDER BY duration_days ASC, initial_amount ASC`
    );

    const enrichedPlans = plans.map(p => ({
      ...p,
      initial_amount: parseFloat(p.initial_amount),
      target_amount: parseFloat(p.target_amount),
      net_profit: parseFloat((p.target_amount - p.initial_amount).toFixed(2)),
      roi_percentage: parseFloat(p.roi_percentage || (((p.target_amount - p.initial_amount) / p.initial_amount) * 100).toFixed(2))
    }));

    res.json({
      success: true,
      data: enrichedPlans
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the current user's active and completed plan subscriptions
 */
exports.getMySubscriptions = async (req, res, next) => {
  try {
    const [subscriptions] = await db.query(
      `SELECT id, plan_id, plan_name, invested_amount, target_amount, current_value, current_profit,
              duration_days, duration_seconds, start_date, end_date, status, payout_credited, last_tick_at, created_at
       FROM investments
       WHERE user_id = ?
       ORDER BY status = 'ACTIVE' DESC, id DESC`,
      [req.user.id]
    );

    const now = Date.now();
    const enriched = subscriptions.map(sub => {
      const startTime = new Date(sub.start_date).getTime();
      const endTime = new Date(sub.end_date).getTime();
      const totalMs = Math.max(1000, endTime - startTime);
      const elapsedMs = Math.max(0, now - startTime);
      const progress = sub.status === 'COMPLETED' ? 1.0 : Math.min(1.0, elapsedMs / totalMs);

      const remainingSec = sub.status === 'COMPLETED' ? 0 : Math.max(0, Math.floor((endTime - now) / 1000));
      const days = Math.floor(remainingSec / 86400);
      const hours = Math.floor((remainingSec % 86400) / 3600);
      const minutes = Math.floor((remainingSec % 3600) / 60);
      const seconds = remainingSec % 60;

      const S0 = parseFloat(sub.invested_amount);
      const current = parseFloat(sub.current_value);
      const target = parseFloat(sub.target_amount);

      return {
        ...sub,
        invested_amount: S0,
        target_amount: target,
        current_value: current,
        current_profit: parseFloat(sub.current_profit),
        profit_percent: S0 > 0 ? parseFloat((((current - S0) / S0) * 100).toFixed(2)) : 0,
        target_profit_percent: S0 > 0 ? parseFloat((((target - S0) / S0) * 100).toFixed(2)) : 0,
        progress_percent: parseFloat((progress * 100).toFixed(1)),
        countdown: {
          remaining_seconds: remainingSec,
          formatted: sub.status === 'COMPLETED' ? 'Matured & Settled' : `${days}d ${hours}h ${minutes}m ${seconds}s`,
          days,
          hours,
          minutes,
          seconds
        }
      };
    });

    res.json({
      success: true,
      data: enriched
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get historical candlestick ticks for a specific subscription
 */
exports.getSubscriptionCandles = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Verify ownership or admin
    const [invs] = await db.query('SELECT user_id FROM investments WHERE id = ?', [id]);
    if (!invs || invs.length === 0) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    if (invs[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized to view this subscription' });
    }

    const candles = await planEngine.getCandles(id, 200);

    res.json({
      success: true,
      data: candles
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User subscribes to a plan
 */
exports.subscribeToPlan = async (req, res, next) => {
  try {
    const { plan_id, custom_amount } = req.body;

    const [plans] = await db.query('SELECT * FROM investment_plans WHERE id = ? AND is_active = 1', [plan_id]);
    if (!plans || plans.length === 0) {
      return res.status(404).json({ success: false, error: 'Investment plan not found or inactive' });
    }

    const plan = plans[0];
    const initialAmount = parseFloat(custom_amount || plan.initial_amount);
    if (initialAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Investment amount must be greater than zero' });
    }

    // Check user universal USD cash balance (supports USD or USDT)
    const [wallets] = await db.query(
      "SELECT asset_symbol, balance FROM user_wallets WHERE user_id = ? AND asset_symbol IN ('USD', 'USDT') ORDER BY FIELD(asset_symbol, 'USD', 'USDT')",
      [req.user.id]
    );

    let fundingAsset = 'USD';
    const usdWallet = wallets.find(w => w.asset_symbol === 'USD');
    const usdtWallet = wallets.find(w => w.asset_symbol === 'USDT');

    if (usdWallet && parseFloat(usdWallet.balance) >= initialAmount) {
      fundingAsset = 'USD';
    } else if (usdtWallet && parseFloat(usdtWallet.balance) >= initialAmount) {
      fundingAsset = 'USDT';
    } else {
      const maxBal = Math.max(
        usdWallet ? parseFloat(usdWallet.balance) : 0,
        usdtWallet ? parseFloat(usdtWallet.balance) : 0
      );
      return res.status(400).json({
        success: false,
        error: `Insufficient balance ($${maxBal.toFixed(2)}). You need $${initialAmount.toFixed(2)} to activate this plan.`
      });
    }

    // Calculate target amount proportional to plan ROI
    const ratio = parseFloat(plan.target_amount) / parseFloat(plan.initial_amount);
    const targetAmount = parseFloat((initialAmount * ratio).toFixed(2));

    const durationDays = plan.duration_days;
    const durationSeconds = plan.duration_seconds || (durationDays * 86400);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (durationSeconds * 1000));

    // 1. Deduct invested amount from user's funding wallet
    await db.query(
      "UPDATE user_wallets SET balance = balance - ? WHERE user_id = ? AND asset_symbol = ?",
      [initialAmount, req.user.id, fundingAsset]
    );

    // 2. Insert transaction record
    await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, amount_usd, fee, status, notes)
       VALUES (?, 'INVESTMENT_DEPOSIT', ?, ?, ?, 0.00, 'completed', ?)`,
      [req.user.id, fundingAsset, initialAmount, initialAmount, `Subscription to Plan: ${plan.name} (Target: $${targetAmount})`]
    );

    // 3. Create investment record (populate both amount and invested_amount)
    const [result] = await db.query(
      `INSERT INTO investments (user_id, plan_id, plan_name, amount, invested_amount, target_amount, current_value, current_profit, duration_days, duration_seconds, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, 'ACTIVE')`,
      [req.user.id, plan.id, plan.name, initialAmount, initialAmount, targetAmount, initialAmount, durationDays, durationSeconds, startDate, endDate]
    );

    const investmentId = result.insertId;

    // 4. Pre-seed historical candles for instant Binance-style chart view
    await planEngine.seedCandlesForInvestment(investmentId, initialAmount, startDate);

    logger.info(`[PlanController] User #${req.user.id} subscribed to plan "${plan.name}" with $${initialAmount} (Target: $${targetAmount})`);

    res.status(201).json({
      success: true,
      message: `Successfully activated "${plan.name}"! Real-time fluctuation tracking has commenced.`,
      data: {
        investment_id: investmentId,
        plan_name: plan.name,
        invested_amount: initialAmount,
        target_amount: targetAmount,
        duration_days: durationDays,
        start_date: startDate,
        end_date: endDate
      }
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// ADMIN CONTROLLERS
// =========================================================================

/**
 * Admin: Get all plans (including inactive)
 */
exports.adminGetAllPlans = async (req, res, next) => {
  try {
    const [plans] = await db.query('SELECT * FROM investment_plans ORDER BY id DESC');
    res.json({
      success: true,
      data: plans.map(p => ({
        ...p,
        initial_amount: parseFloat(p.initial_amount),
        target_amount: parseFloat(p.target_amount),
        roi_percentage: parseFloat(p.roi_percentage)
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Create a new growth plan
 */
exports.adminCreatePlan = async (req, res, next) => {
  try {
    const {
      name,
      description,
      initial_amount,
      target_amount,
      duration_days,
      duration_seconds,
      risk_level,
      badge,
      icon,
      color
    } = req.body;

    if (!name || !initial_amount || !target_amount || !duration_days) {
      return res.status(400).json({ success: false, error: 'Name, initial amount, target amount, and duration days are required' });
    }

    const initAmt = parseFloat(initial_amount);
    const tgtAmt = parseFloat(target_amount);
    const days = parseInt(duration_days, 10);
    const secs = duration_seconds ? parseInt(duration_seconds, 10) : (days * 86400);
    const roi = parseFloat((((tgtAmt - initAmt) / initAmt) * 100).toFixed(2));

    const [result] = await db.query(
      `INSERT INTO investment_plans (name, description, initial_amount, target_amount, duration_days, duration_seconds, roi_percentage, risk_level, badge, icon, color, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, description || '', initAmt, tgtAmt, days, secs, roi, risk_level || 'Moderate', badge || 'New Plan', icon || '📈', color || 'teal']
    );

    res.status(201).json({
      success: true,
      message: `Plan "${name}" created successfully.`,
      data: { id: result.insertId }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Update an existing plan
 */
exports.adminUpdatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      initial_amount,
      target_amount,
      duration_days,
      duration_seconds,
      risk_level,
      badge,
      icon,
      color,
      is_active
    } = req.body;

    const initAmt = parseFloat(initial_amount);
    const tgtAmt = parseFloat(target_amount);
    const days = parseInt(duration_days, 10);
    const secs = duration_seconds ? parseInt(duration_seconds, 10) : (days * 86400);
    const roi = parseFloat((((tgtAmt - initAmt) / initAmt) * 100).toFixed(2));

    await db.query(
      `UPDATE investment_plans
       SET name = ?, description = ?, initial_amount = ?, target_amount = ?, duration_days = ?, duration_seconds = ?, roi_percentage = ?, risk_level = ?, badge = ?, icon = ?, color = ?, is_active = ?
       WHERE id = ?`,
      [name, description, initAmt, tgtAmt, days, secs, roi, risk_level, badge, icon, color, is_active !== undefined ? is_active : 1, id]
    );

    res.json({
      success: true,
      message: 'Plan updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Delete / deactivate a plan
 */
exports.adminDeletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE investment_plans SET is_active = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Plan deactivated successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: View all client subscriptions
 */
exports.adminGetSubscriptions = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT i.*, u.full_name as user_name, u.email as user_email
       FROM investments i
       JOIN app_users u ON i.user_id = u.id
       ORDER BY i.status = 'ACTIVE' DESC, i.id DESC`
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        ...r,
        invested_amount: parseFloat(r.invested_amount),
        target_amount: parseFloat(r.target_amount),
        current_value: parseFloat(r.current_value),
        current_profit: parseFloat(r.current_profit)
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Force Complete a plan immediately to target amount
 */
exports.adminForceComplete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await planEngine.forceComplete(id);
    res.json({
      success: true,
      message: `Plan #${id} settled and matured to target ($${result.target_amount}). Cash payout credited to client.`,
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Admin: Fast-forward / advance progress
 */
exports.adminFastForward = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { seconds } = req.body;
    const fastForwardSeconds = seconds ? parseInt(seconds, 10) : 86400; // default 1 day
    await planEngine.advanceProgress(id, fastForwardSeconds);

    res.json({
      success: true,
      message: `Plan #${id} progress fast-forwarded by ${Math.round(fastForwardSeconds / 60)} minutes.`
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Admin: Nudge live fluctuating price
 */
exports.adminNudgeValue = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { delta } = req.body;
    if (delta === undefined) {
      return res.status(400).json({ success: false, error: 'Delta amount is required' });
    }

    const result = await planEngine.nudgeValue(id, parseFloat(delta));
    res.json({
      success: true,
      message: `Plan #${id} value nudged by $${delta}. New price: $${result.new_price}.`,
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
