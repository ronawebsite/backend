const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const authenticateToken = require('../middlewares/auth.guard');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure receipt proof upload storage
const uploadDir = path.join(__dirname, '../uploads/receipts');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, `receipt-${unique}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.use(authenticateToken);

router.get('/portfolio', walletController.getWallets);
router.get('/deposit-methods', walletController.getDepositMethods);
router.get('/deposit-address/:asset', walletController.getDepositAddress);
router.post('/deposit-request', upload.single('receipt'), walletController.submitDepositRequest);
router.post('/deposit-sandbox', upload.single('receipt'), walletController.sandboxDeposit);
router.post('/withdraw/initiate', walletController.initiateWithdrawal);
router.post('/withdraw/confirm', walletController.confirmWithdrawal);
router.get('/transactions', walletController.getTransactions);
router.get('/statement/csv', walletController.downloadStatementCSV);
router.get('/statement/pdf', walletController.downloadStatementPDF);

module.exports = router;
