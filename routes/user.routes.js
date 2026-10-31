const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticateToken = require('../middlewares/auth.guard');

router.use(authenticateToken);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.post('/kyc', userController.submitKYC);
router.get('/kyc', userController.getKYCStatus);

module.exports = router;
