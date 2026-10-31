const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const authenticateToken = require('../middlewares/auth.guard');

// Public market feeds
router.get('/markets', tradeController.getMarkets);
router.get('/candles', tradeController.getCandles);
router.get('/orderbook', tradeController.getOrderBook);

// Authenticated trading actions
router.use(authenticateToken);
router.post('/order', tradeController.placeOrder);
router.get('/orders/open', tradeController.getOpenOrders);
router.get('/orders/history', tradeController.getOrderHistory);
router.delete('/orders/:id', tradeController.cancelOrder);
router.get('/positions', tradeController.getPositions);
router.get('/managed', tradeController.getManagedTrades);
router.get('/prompts', tradeController.getUserPrompts);
router.post('/prompts/:id/dismiss', tradeController.dismissUserPrompt);

module.exports = router;
