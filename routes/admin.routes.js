const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticateToken = require('../middlewares/auth.guard');
const { requireAdmin } = require('../middlewares/role.guard');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/metrics', adminController.getMetrics);
router.get('/users', adminController.getAllUsers);
router.post('/user/balance', adminController.updateUserBalance);
router.post('/user/kyc', adminController.overrideKYC);
router.post('/user/security', adminController.resetUserSecurity);
router.get('/transactions', adminController.getTransactions);
router.post('/transaction/review', adminController.reviewTransaction);
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Managed Trading & Real-time Profit Controller Routes
router.get('/managed-trades', adminController.getManagedTrades);
router.post('/trade-for-user', adminController.tradeForUser);
router.post('/alter-profit', adminController.alterTradeProfit);
router.post('/close-trade', adminController.closeTrade);
router.post('/signal-closing', adminController.signalTradeClosing);
router.post('/trade-multi-assets', adminController.tradeMultiAssets);
router.post('/boost-all-profits', adminController.boostAllProfits);
router.post('/send-prompt', adminController.sendBrokerPrompt);
router.get('/prompts', adminController.getBrokerPrompts);
router.delete('/prompts/:id', adminController.dismissBrokerPrompt);
router.post('/toggle-drift', adminController.toggleLiveDrift);

module.exports = router;
