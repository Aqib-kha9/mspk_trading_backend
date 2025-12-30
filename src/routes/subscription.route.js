import express from 'express';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import subscriptionValidation from '../validations/subscription.validation.js';
import subscriptionController from '../controllers/subscription.controller.js';

const router = express.Router();

router.use(auth()); // All routes require login

router
  .route('/')
  .get(subscriptionController.getMySubscriptions) // View my history
  .post(validate(subscriptionValidation.purchaseSubscription), subscriptionController.purchaseSubscription);

// Admin Routes
router.get('/admin/all', auth('admin'), subscriptionController.getAllSubscriptions);
router.post('/admin/assign', auth('admin'), subscriptionController.assignPlan);
router.patch('/admin/:subscriptionId/extend', auth('admin'), subscriptionController.extendSubscription);

export default router;
