const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const authenticateToken = require('../middlewares/auth.guard');

router.use(authenticateToken);

router.get('/portfolio', walletController.getWallets);
router.get('/deposit-methods', walletController.getDepositMethods);
router.get('/deposit-address/:asset', walletController.getDepositAddress);
router.post('/deposit-sandbox', walletController.sandboxDeposit);
router.post('/withdraw/initiate', walletController.initiateWithdrawal);
router.post('/withdraw/confirm', walletController.confirmWithdrawal);
router.get('/transactions', walletController.getTransactions);
router.get('/statement/csv', walletController.downloadStatementCSV);
router.get('/statement/pdf', walletController.downloadStatementPDF);

module.exports = router;
