const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authenticateToken = require('../middlewares/auth.guard');
const { authLimiter } = require('../middlewares/rateLimiter');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/phrase-login', authLimiter, authController.phraseLogin);
router.post('/refresh-token', authController.refreshToken);
router.get('/me', authenticateToken, authController.getMe);
router.post('/set-pin', authenticateToken, authController.setPin);

module.exports = router;
