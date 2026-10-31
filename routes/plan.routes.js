const express = require('express');
const router = express.Router();
const planController = require('../controllers/plan.controller');
const authenticateToken = require('../middlewares/auth.guard');
const { requireAdmin } = require('../middlewares/role.guard');

// Public or Authenticated User routes
router.get('/', planController.getActivePlans);

// Authenticated user routes
router.get('/my-subscriptions', authenticateToken, planController.getMySubscriptions);
router.get('/subscription/:id/candles', authenticateToken, planController.getSubscriptionCandles);
router.post('/subscribe', authenticateToken, planController.subscribeToPlan);

// Admin-only plan management & real-time controls
router.get('/admin/all-plans', authenticateToken, requireAdmin, planController.adminGetAllPlans);
router.post('/admin/create-plan', authenticateToken, requireAdmin, planController.adminCreatePlan);
router.put('/admin/update-plan/:id', authenticateToken, requireAdmin, planController.adminUpdatePlan);
router.delete('/admin/delete-plan/:id', authenticateToken, requireAdmin, planController.adminDeletePlan);
router.get('/admin/subscriptions', authenticateToken, requireAdmin, planController.adminGetSubscriptions);
router.post('/admin/force-complete/:id', authenticateToken, requireAdmin, planController.adminForceComplete);
router.post('/admin/fast-forward/:id', authenticateToken, requireAdmin, planController.adminFastForward);
router.post('/admin/nudge/:id', authenticateToken, requireAdmin, planController.adminNudgeValue);

module.exports = router;
