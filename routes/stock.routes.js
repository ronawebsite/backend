const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stock.controller');
const authGuard = require('../middlewares/auth.guard');

// Public market data
router.get('/markets', stockController.getMarkets);
router.get('/candles', stockController.getCandles);
router.get('/orderbook', stockController.getOrderBook);

// Protected user stock trading
router.post('/order', authGuard, stockController.placeOrder);
router.get('/positions', authGuard, stockController.getPositions);
router.get('/orders', authGuard, stockController.getOrders);
router.get('/portfolio', authGuard, stockController.getPortfolio);

// Stock trading bots
router.get('/bots', authGuard, stockController.getBots);
router.post('/bots/deploy', authGuard, stockController.deployBot);
router.post('/backtest', authGuard, stockController.backtest);

module.exports = router;
