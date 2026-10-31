const express = require('express');
const router = express.Router();
const supportController = require('../controllers/support.controller');
const authenticateToken = require('../middlewares/auth.guard');
const { requireAdmin } = require('../middlewares/role.guard');

// All support endpoints require authentication
router.use(authenticateToken);

// User & general ticket actions
router.get('/tickets', supportController.getUserTickets);
router.get('/tickets/:id', supportController.getTicketDetails);
router.post('/tickets', supportController.createTicket);
router.post('/tickets/:id/messages', supportController.addMessage);

// AI Chatbot intelligent support & auto-dispute escalator
router.post('/ai-chat', supportController.aiChatbotMessage);

// Admin Command Center Support & Dispute actions
router.get('/admin/tickets', requireAdmin, supportController.getAllTicketsAdmin);
router.put('/admin/tickets/:id/status', requireAdmin, supportController.updateTicketStatusAdmin);

module.exports = router;
