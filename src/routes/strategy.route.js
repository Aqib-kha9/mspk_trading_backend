import express from 'express';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import strategyValidation from '../validations/strategy.validation.js';
import strategyController from '../controllers/strategy.controller.js';

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(strategyValidation.createStrategy), strategyController.createStrategy)
  .get(auth(), validate(strategyValidation.getStrategies), strategyController.getStrategies);

router
  .route('/:strategyId')
  .get(auth(), validate(strategyValidation.getStrategy), strategyController.getStrategy)
  .delete(auth(), validate(strategyValidation.getStrategy), strategyController.deleteStrategy);

export default router;
