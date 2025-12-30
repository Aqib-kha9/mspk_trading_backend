import express from 'express';
import auth from '../middleware/auth.js';
import settingController from '../controllers/setting.controller.js';

const router = express.Router();

// All settings routes require Admin access
router.use(auth(['admin']));

router
  .route('/')
  .get(settingController.getSettings);

router.put('/bulk', settingController.updateBulkSettings);

router
  .route('/:key')
  .patch(settingController.updateSetting);

export default router;
