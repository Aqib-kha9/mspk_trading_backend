import express from 'express';
import auth from '../middlewares/auth.js';
import settingController from '../../controllers/setting.controller.js';

const router = express.Router();

router
  .route('/:key')
  .get(auth('managePlans'), settingController.getSetting) // Reusing 'managePlans' permission as it fits context
  .post(auth('managePlans'), settingController.updateSetting);

export default router;
