import { Worker } from 'bullmq';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { sendEmail, sendPushNotification } from '../services/email.service.js';
import User from '../models/User.js';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const notificationWorker = new Worker('notifications', async (job) => {
  const { type, signal, userId } = job.data;
  
  try {
      const user = await User.findById(userId);
      if (!user) {
          logger.warn(`User ${userId} not found for notification`);
          return;
      }

      const message = `${signal.type} ${signal.symbol} at ${signal.price}`;

      if (type === 'email') {
          await sendEmail(user.email, `Trade Alert: ${signal.symbol}`, message);
      } else if (type === 'push') {
          if (user.fcmTokens && user.fcmTokens.length > 0) {
              await sendPushNotification(user.fcmTokens, `Trade Alert`, message);
          }
      }
      
      logger.info(`Processed ${type} notification for job ${job.id}`);
  } catch (error) {
      logger.error(`Failed to process notification job ${job.id}`, error);
      throw error;
  }
}, { connection });

notificationWorker.on('completed', (job) => {
  logger.debug(`Job ${job.id} completed`);
});

notificationWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed: ${err.message}`);
});

export default notificationWorker;
