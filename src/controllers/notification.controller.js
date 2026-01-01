
import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import Notification from '../models/Notification.js';

const getMyNotifications = catchAsync(async (req, res) => {
  const notifications = await Notification.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50);
  
  const unreadCount = await Notification.countDocuments({ user: req.user.id, isRead: false });

  res.send({ results: notifications, unreadCount });
});

const markAsRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, user: req.user.id },
    { isRead: true },
    { new: true }
  );
  if (!notification) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Notification not found' });
  }
  res.send(notification);
});

const markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { user: req.user.id, isRead: false },
    { isRead: true }
  );
  res.status(httpStatus.NO_CONTENT).send();
});

export default {
  getMyNotifications,
  markAsRead,
  markAllAsRead
};
