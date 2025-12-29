import express from 'express';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import signalValidation from '../validations/signal.validation.js';
import signalController from '../controllers/signal.controller.js';

const router = express.Router();

router.use(auth());

// Public (to authenticated users)
router.get('/', signalController.getSignals);

// Admin Only
router.post('/', auth(['admin']), validate(signalValidation.createSignal), signalController.createSignal);
router.patch('/:signalId', auth(['admin']), validate(signalValidation.updateSignal), signalController.updateSignal);

export default router;
