import { Worker } from 'bullmq';
import config from '../config/config.js';
import logger from '../config/logger.js';
import User from '../models/User.js';
import Setting from '../models/Setting.js';
import telegramService from '../services/channels/telegram.service.js';
import whatsappService from '../services/channels/whatsapp.service.js';
import pushService from '../services/channels/push.service.js';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const notificationWorker = new Worker('notifications', async (job) => {
  const { type, signal, userId } = job.data;
  
  try {
      // Fetch System Settings
      const settings = await Setting.find({ 
          key: { $in: ['telegram_config', 'whatsapp_config', 'push_config'] } 
      });
      
      const getSetting = (key) => {
          const s = settings.find(s => s.key === key);
          return s ? s.value : null;
      };

      const user = await User.findById(userId);
      // For broadcast signals (userId might be null if it's a system broadcast), handle separately.
      // Assuming signal.user is the CREATOR. 
      // Current logic: Notifications are for specific users (e.g. Signal Alert to Subscriber).
      // IF type is 'broadcast', we iterate all users? Or BullMQ jobs are per user?
      // Assuming 'notification.service.js' schedules jobs per user.
      
      if (!user) {
          logger.warn(`User ${userId} not found for notification`);
          return;
      }

      const message = `🚀 ${signal.type} ALERT: ${signal.symbol}\n\nPrice: ${signal.entryPrice}\nSL: ${signal.stopLoss}\nTarget: ${signal.targets?.target1}`;

      if (type === 'telegram') {
          const teleConfig = getSetting('telegram_config');
          if (teleConfig && teleConfig.enabled && teleConfig.botToken && teleConfig.channelId) {
             // For user specific telegram? Or Channel Broadcast?
             // User requested "Telegram Broadcast" in UI.
             // If this job is for "broadcast", we use channelID.
             // If for specific user, we need their chatID.
             // Let's assume this worker handles SYSTEM BROADCASTS also.
             await telegramService.sendTelegramMessage(teleConfig, message);
          }
      } 
      else if (type === 'whatsapp') {
          const waConfig = getSetting('whatsapp_config');
           // Check if user has phone number and WA is enabled globally
          if (waConfig && waConfig.enabled && user.phoneNumber) {
             await whatsappService.sendWhatsAppText({ ...waConfig, to: user.phoneNumber }, message);
          }
      }
      else if (type === 'push') {
          const pushConfig = getSetting('push_config');
          if (pushConfig && pushConfig.enabled && pushConfig.fcmServerKey) {
              if (user.fcmTokens && user.fcmTokens.length > 0) {
                  await pushService.sendPushNotification(
                      pushConfig.fcmServerKey, 
                      user.fcmTokens, 
                      `Target Hit: ${signal.symbol}`, 
                      message
                  );
              }
          }
      }
      
      logger.info(`Processed ${type} notification for job ${job.id}`);
  } catch (error) {
      logger.error(`Failed to process notification job ${job.id}`, error);
      // throw error; // Retry logic relies on throwing
  }
}, { connection });

notificationWorker.on('completed', (job) => {
  logger.debug(`Job ${job.id} completed`);
});

notificationWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed: ${err.message}`);
});

export default notificationWorker;
