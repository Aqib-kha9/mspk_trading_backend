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

export default router;
