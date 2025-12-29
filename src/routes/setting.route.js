import express from 'express';
import auth from '../middleware/auth.js';
import settingController from '../controllers/setting.controller.js';

const router = express.Router();

router
  .route('/:key')
  .get(auth(['admin']), settingController.getSetting)
  .post(auth(['admin']), settingController.updateSetting);

export default router;
