const express = require('express');
const router = express.Router();
const cardController = require('../controllers/card.controller');
const authenticateToken = require('../middlewares/auth.guard');

router.use(authenticateToken);

router.get('/', cardController.getCards);
router.post('/:id/reveal', cardController.revealDetails);
router.patch('/:id/freeze', cardController.toggleFreeze);
router.post('/request', cardController.requestCard);

module.exports = router;
