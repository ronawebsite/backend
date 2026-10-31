const db = require('../config/db');
const { getIO, notifyUser } = require('../sockets/market.socket');
const logger = require('../config/logger');

class BrokerEngineService {
  constructor() {
    this.liveDriftEnabled = true;
    this.interval = null;
    this.startLiveDriftLoop();
  }

  setLiveDrift(enabled) {
    this.liveDriftEnabled = Boolean(enabled);
    logger.info(`[BrokerEngine] Live drift enabled: ${this.liveDriftEnabled}`);
  }

  isLiveDriftEnabled() {
    return this.liveDriftEnabled;
  }

  startLiveDriftLoop() {
    // Run gentle broker activity drift loop every 5 seconds
    this.interval = setInterval(async () => {
      if (!this.liveDriftEnabled) return;

      try {
        // Find all active managed trades
        const [activeTrades] = await db.query(
          "SELECT id, user_id, pair, side, current_profit, target_outcome FROM trades WHERE is_managed = 1 AND target_outcome = 'IN_PROGRESS' AND status = 'FILLED'"
        );

        if (!activeTrades || activeTrades.length === 0) return;

        for (const t of activeTrades) {
          // Generate a natural, gentle micro-tick drift (+0.50 to +3.50 with 85% probability, -0.75 with 15% probability)
          const isUp = Math.random() < 0.85;
          const delta = isUp
            ? parseFloat((Math.random() * 2.5 + 0.5).toFixed(2))
            : -parseFloat((Math.random() * 0.8 + 0.2).toFixed(2));

          const current = parseFloat(t.current_profit || 0);
          const updatedProfit = parseFloat((current + delta).toFixed(2));

          await db.query(
            "UPDATE trades SET current_profit = ?, intervention_at = NOW() WHERE id = ?",
            [updatedProfit, t.id]
          );

          t.current_profit = updatedProfit;

          // Push live update to specific user
          notifyUser(t.user_id, 'trade:managed_update', {
            type: 'LIVE_DRIFT_TICK',
            trade: { ...t, current_profit: updatedProfit },
            delta: delta,
            current_profit: updatedProfit
          });
        }

        // Global broadcast for any open admin monitors
        const io = getIO();
        if (io) {
          io.emit('trade:managed_stream_tick', { count: activeTrades.length });
        }
      } catch (err) {
        // Silent catch for background loop
      }
    }, 5000);
  }
}

module.exports = new BrokerEngineService();
