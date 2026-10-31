const db = require('../config/db');
const { notifyUser, getIO } = require('../sockets/market.socket');
const logger = require('../config/logger');

class PlanEngineService {
  constructor() {
    this.interval = null;
    this.tickIntervalMs = 3000; // Ticks every 3 seconds for real-time responsiveness
    this.momentumState = new Map(); // investmentId -> { phase, trend, lastPrice, lastCandleTime }
    this.startLoop();
  }

  startLoop() {
    if (this.interval) clearInterval(this.interval);

    logger.info('[PlanEngine] Starting Growth Plan Real-Time Fluctuation Engine (3s interval)...');
    this.interval = setInterval(async () => {
      try {
        await this.tickActiveInvestments();
      } catch (err) {
        logger.error(`[PlanEngine] Tick error: ${err.message}`);
      }
    }, this.tickIntervalMs);
  }

  /**
   * Pre-seed historical candles (30-40 periods) for an investment upon creation
   * so the chart displays a rich Binance-style graph immediately.
   */
  async seedCandlesForInvestment(investmentId, investedAmount, startTime) {
    try {
      const nowSec = Math.floor(new Date(startTime).getTime() / 1000);
      const candleCount = 35;
      const stepSec = 60; // 1-minute historical candles
      const startSec = nowSec - (candleCount * stepSec);

      let currentPrice = parseFloat(investedAmount);
      const basePrice = currentPrice;

      for (let i = 0; i < candleCount; i++) {
        const time = startSec + (i * stepSec);
        // Small gentle walk around base price (+/- 0.4%)
        const deltaPercent = (Math.sin(i * 0.5) * 0.003) + ((Math.random() - 0.48) * 0.004);
        const open = currentPrice;
        const close = parseFloat((open * (1 + deltaPercent)).toFixed(2));
        const high = parseFloat((Math.max(open, close) + (Math.random() * basePrice * 0.002)).toFixed(2));
        const low = parseFloat((Math.min(open, close) - (Math.random() * basePrice * 0.002)).toFixed(2));
        const volume = parseFloat((Math.random() * 2.5 + 0.5).toFixed(4));

        await db.query(
          `INSERT INTO plan_candle_ticks (investment_id, time, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [investmentId, time, open, high, low, close, volume]
        );

        currentPrice = close;
      }

      logger.info(`[PlanEngine] Pre-seeded ${candleCount} candles for investment #${investmentId}`);
    } catch (err) {
      logger.error(`[PlanEngine] Failed to seed candles for #${investmentId}: ${err.message}`);
    }
  }

  /**
   * Main tick loop: iterates all active investments and updates fluctuating value.
   */
  async tickActiveInvestments() {
    const [activeInvestments] = await db.query(
      "SELECT * FROM investments WHERE status = 'ACTIVE' ORDER BY id ASC"
    );

    if (!activeInvestments || activeInvestments.length === 0) return;

    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    for (const inv of activeInvestments) {
      const startTime = new Date(inv.start_date).getTime();
      const endTime = new Date(inv.end_date).getTime();
      const totalDurationMs = Math.max(1000, endTime - startTime);
      const elapsedMs = Math.max(0, now - startTime);

      const progress = Math.min(1.0, elapsedMs / totalDurationMs);
      const S0 = parseFloat(inv.invested_amount);
      const ST = parseFloat(inv.target_amount);

      // Check if plan has reached or exceeded maturity
      if (progress >= 1.0) {
        await this.completeInvestment(inv);
        continue;
      }

      // --- Mathematical Brownian Bridge Fluctuation ---
      // Expected linear trend to target:
      const expectedBaseline = S0 + (ST - S0) * progress;

      // Volatility envelope: strictly 0 at progress=0 and progress=1, highest at progress=0.5
      // 4 * p * (1 - p) peaks at 1.0 when p = 0.5
      const envelope = 4 * progress * (1 - progress);

      // Retrieve or initialize momentum state
      let state = this.momentumState.get(inv.id);
      if (!state) {
        state = {
          phase: Math.random() * Math.PI * 2,
          trend: 1,
          lastPrice: parseFloat(inv.current_value) || S0,
          currentCandle: null
        };
        this.momentumState.set(inv.id, state);
      }

      // Progressively advance harmonic wave phase for realistic multi-frequency cycle
      state.phase += 0.15 + (Math.random() * 0.1);
      const wave1 = Math.sin(state.phase);
      const wave2 = Math.cos(state.phase * 2.3) * 0.5;
      const noise = (Math.random() - 0.48) * 0.3;
      const combinedOscillation = (wave1 + wave2 + noise);

      // Maximum amplitude scales with (ST - S0) * 0.08
      const maxAmplitude = (ST - S0) * 0.08 * envelope;
      let calculatedPrice = expectedBaseline + (combinedOscillation * maxAmplitude);

      // Additional safeguard: ensure strictly at S0 on start, and converges to ST as progress -> 1
      if (progress > 0.98) {
        const factor = (1 - progress) / 0.02; // 1 down to 0
        calculatedPrice = ST - ((ST - calculatedPrice) * factor);
      }

      // Price rounding
      calculatedPrice = parseFloat(Math.max(S0 * 0.92, calculatedPrice).toFixed(2));
      const delta = parseFloat((calculatedPrice - state.lastPrice).toFixed(2));
      const profit = parseFloat((calculatedPrice - S0).toFixed(2));

      state.lastPrice = calculatedPrice;

      // Update in database
      await db.query(
        "UPDATE investments SET current_value = ?, current_profit = ?, last_tick_at = NOW() WHERE id = ?",
        [calculatedPrice, profit, inv.id]
      );

      // Update/insert real-time candle tick (aggregate by 15-second or 60-second window)
      const candleTimeWindow = 15; // 15-second candle for snappy real-time responsiveness
      const candleBucketTime = Math.floor(nowSec / candleTimeWindow) * candleTimeWindow;

      let candle = null;
      if (!state.currentCandle || state.currentCandle.time !== candleBucketTime) {
        // Start new candle
        state.currentCandle = {
          time: candleBucketTime,
          open: calculatedPrice,
          high: calculatedPrice,
          low: calculatedPrice,
          close: calculatedPrice,
          volume: parseFloat((Math.random() * 1.5 + 0.2).toFixed(4))
        };

        // Persist new candle in DB
        await db.query(
          `INSERT INTO plan_candle_ticks (investment_id, time, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE high = VALUES(high), low = VALUES(low), close = VALUES(close), volume = volume + VALUES(volume)`,
          [inv.id, state.currentCandle.time, state.currentCandle.open, state.currentCandle.high, state.currentCandle.low, state.currentCandle.close, state.currentCandle.volume]
        );
      } else {
        // Update high, low, close
        state.currentCandle.high = Math.max(state.currentCandle.high, calculatedPrice);
        state.currentCandle.low = Math.min(state.currentCandle.low, calculatedPrice);
        state.currentCandle.close = calculatedPrice;
        state.currentCandle.volume = parseFloat((state.currentCandle.volume + (Math.random() * 0.1)).toFixed(4));

        await db.query(
          `UPDATE plan_candle_ticks SET high = ?, low = ?, close = ?, volume = ? WHERE investment_id = ? AND time = ?`,
          [state.currentCandle.high, state.currentCandle.low, state.currentCandle.close, state.currentCandle.volume, inv.id, state.currentCandle.time]
        );
      }
      candle = { ...state.currentCandle };

      // Calculate time remaining countdown
      const remainingSec = Math.max(0, Math.floor((endTime - now) / 1000));
      const remainingDays = Math.floor(remainingSec / 86400);
      const remainingHours = Math.floor((remainingSec % 86400) / 3600);
      const remainingMins = Math.floor((remainingSec % 3600) / 60);
      const remainingSecs = remainingSec % 60;

      // Broadcast real-time Socket.IO tick event to the user's room
      notifyUser(inv.user_id, 'plan:tick', {
        type: 'PLAN_PRICE_TICK',
        investment_id: inv.id,
        plan_name: inv.plan_name,
        current_value: calculatedPrice,
        current_profit: profit,
        delta: delta,
        progress_percent: parseFloat((progress * 100).toFixed(2)),
        invested_amount: S0,
        target_amount: ST,
        candle: candle,
        countdown: {
          remaining_seconds: remainingSec,
          formatted: `${remainingDays}d ${remainingHours}h ${remainingMins}m ${remainingSecs}s`,
          days: remainingDays,
          hours: remainingHours,
          minutes: remainingMins,
          seconds: remainingSecs
        }
      });
    }

    // Also broadcast global overview update to any active admin controllers
    const io = getIO();
    if (io) {
      io.emit('admin:plans_overview', {
        active_count: activeInvestments.length,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Settle & complete an investment when it reaches target maturity (or admin forces completion)
   */
  async completeInvestment(inv) {
    const ST = parseFloat(inv.target_amount);
    const S0 = parseFloat(inv.invested_amount);
    const netProfit = parseFloat((ST - S0).toFixed(2));

    logger.info(`[PlanEngine] Plan #${inv.id} (${inv.plan_name}) reached target maturity: $${ST}. Settle & Credit Payout!`);

    // 1. Update investment status
    await db.query(
      "UPDATE investments SET status = 'COMPLETED', current_value = ?, current_profit = ?, payout_credited = 1, updated_at = NOW() WHERE id = ?",
      [ST, netProfit, inv.id]
    );

    // 2. Credit the target amount directly to the user's universal USD cash wallet
    await db.query(
      "UPDATE user_wallets SET balance = balance + ? WHERE user_id = ? AND asset_symbol = 'USD'",
      [ST, inv.user_id]
    );

    // 3. Insert transaction record for transparent auditing & PDF statements
    await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, amount_usd, fee, status, notes)
       VALUES (?, 'INVESTMENT_PAYOUT', 'USD', ?, ?, 0.00, 'completed', ?)`,
      [inv.user_id, ST, ST, `Matured Guaranteed Payout for Plan: ${inv.plan_name} (Initial: $${S0} -> Target: $${ST})`]
    );

    this.momentumState.delete(inv.id);

    // 4. Notify user via Socket.IO
    notifyUser(inv.user_id, 'plan:completed', {
      investment_id: inv.id,
      plan_name: inv.plan_name,
      invested_amount: S0,
      target_amount: ST,
      net_profit: netProfit,
      message: `🎉 Your plan "${inv.plan_name}" has matured! Full guaranteed payout of $${ST.toLocaleString()} has been credited to your cash balance.`
    });
  }

  /**
   * Admin Force-Complete: Instantly matures the plan to target amount
   */
  async forceComplete(investmentId) {
    const [invs] = await db.query('SELECT * FROM investments WHERE id = ?', [investmentId]);
    if (!invs || invs.length === 0) throw new Error('Investment plan not found');
    const inv = invs[0];
    if (inv.status === 'COMPLETED') throw new Error('Plan is already completed');

    await this.completeInvestment(inv);
    return { success: true, target_amount: parseFloat(inv.target_amount) };
  }

  /**
   * Admin Fast-Forward / Time-Advance
   */
  async advanceProgress(investmentId, fastForwardSeconds = 86400) {
    const [invs] = await db.query('SELECT * FROM investments WHERE id = ?', [investmentId]);
    if (!invs || invs.length === 0) throw new Error('Investment plan not found');
    const inv = invs[0];

    // Shift start_date backwards by fastForwardSeconds
    await db.query(
      'UPDATE investments SET start_date = DATE_SUB(start_date, INTERVAL ? SECOND) WHERE id = ?',
      [fastForwardSeconds, investmentId]
    );

    // Immediately trigger a tick
    await this.tickActiveInvestments();
    return { success: true, fastForwardSeconds };
  }

  /**
   * Admin Nudge Value: Injects an instant real-time price bump / pullback
   */
  async nudgeValue(investmentId, delta) {
    const [invs] = await db.query('SELECT * FROM investments WHERE id = ?', [investmentId]);
    if (!invs || invs.length === 0) throw new Error('Investment plan not found');
    const inv = invs[0];

    const current = parseFloat(inv.current_value);
    const S0 = parseFloat(inv.invested_amount);
    const newPrice = parseFloat((current + delta).toFixed(2));
    const newProfit = parseFloat((newPrice - S0).toFixed(2));

    await db.query(
      'UPDATE investments SET current_value = ?, current_profit = ?, last_tick_at = NOW() WHERE id = ?',
      [newPrice, newProfit, investmentId]
    );

    // Notify user
    notifyUser(inv.user_id, 'plan:tick', {
      type: 'ADMIN_NUDGE',
      investment_id: inv.id,
      plan_name: inv.plan_name,
      current_value: newPrice,
      current_profit: newProfit,
      delta: delta
    });

    return { success: true, new_price: newPrice };
  }

  /**
   * Fetch recent candle ticks for charting
   */
  async getCandles(investmentId, limit = 150) {
    const [candles] = await db.query(
      `SELECT time, open, high, low, close, volume FROM plan_candle_ticks
       WHERE investment_id = ? ORDER BY time ASC LIMIT ?`,
      [investmentId, limit]
    );

    return candles.map(c => ({
      time: parseInt(c.time),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume)
    }));
  }
}

// Export singleton instance
module.exports = new PlanEngineService();
