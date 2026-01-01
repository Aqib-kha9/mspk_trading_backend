
import express from 'express';
import auth from '../middleware/auth.js';
import notificationController from '../controllers/notification.controller.js';

const router = express.Router();

router.use(auth());

router.get('/', notificationController.getMyNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:notificationId/read', notificationController.markAsRead);

export default router;
