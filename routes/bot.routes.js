const express = require('express');
const router = express.Router();
const botController = require('../controllers/bot.controller');
const authenticateToken = require('../middlewares/auth.guard');

router.get('/available', botController.getAvailableBots);
router.post('/backtest', botController.backtestBot);

router.use(authenticateToken);
router.get('/my-bots', botController.getUserBots);
router.post('/create', botController.createBot);
router.patch('/:id/status', botController.toggleBotStatus);
router.post('/:id/terminate', botController.terminateBot);
router.get('/:id/logs', botController.getBotTradeLogs);

module.exports = router;
