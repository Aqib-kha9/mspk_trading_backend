import { Worker } from 'bullmq';
import config from '../config/config.js';
import logger from '../config/logger.js';
import User from '../models/User.js';
import Setting from '../models/Setting.js';
import telegramService from '../services/channels/telegram.service.js';
import whatsappService from '../services/channels/whatsapp.service.js';
import pushService from '../services/channels/push.service.js';
import templates from '../config/notificationTemplates.js';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const notificationWorker = new Worker('notifications', async (job) => {
  const { type, signal, announcement, userId } = job.data;
  
  try {
      // Fetch System Settings
      // Fetch System Settings
      const settings = await Setting.find({ 
          key: { $in: ['telegram_config', 'whatsapp_config', 'push_config', 'notification_templates'] } 
      });
      
      const getSetting = (key) => {
          const s = settings.find(s => s.key === key);
          return s ? s.value : null;
      };

      const dbTemplates = getSetting('notification_templates') || {};
      const activeTemplates = { ...templates, ...dbTemplates };

      const user = await User.findById(userId);
      
      if (!user) {
          logger.warn(`User ${userId} not found for notification`);
          return;
      }

      const renderTemplate = (templateKey, data) => {
          const template = activeTemplates[templateKey] || activeTemplates.ANNOUNCEMENT;
          let title = template.title;
          let body = template.body;

          // Simple variable replacement
          Object.keys(data).forEach(key => {
              const regex = new RegExp(`{{${key}}}`, 'g');
              const val = data[key] !== undefined ? data[key] : '';
              title = title.replace(regex, val);
              body = body.replace(regex, val);
          });
          return { title, body };
      };

      let title = 'Notification';
      let message = '';
      
      if (signal) {
          // Flatten signal data for template
          const data = {
              symbol: signal.symbol,
              type: signal.type,
              entryPrice: signal.entryPrice,
              stopLoss: signal.stopLoss,
              target1: signal.targets?.target1 || '-',
              target2: signal.targets?.target2 || '-',
              
              // For Update/Target
              updateMessage: signal.updateMessage || '',
              targetLevel: signal.targetLevel || 'TP1',
              currentPrice: signal.currentPrice || signal.entryPrice // fallback
          };
          
          // Use subType passed from publisher (SIGNAL_NEW, SIGNAL_UPDATE, SIGNAL_TARGET, SIGNAL_STOPLOSS)
          const templateKey = signal.subType || 'SIGNAL_NEW';
          
          const rendered = renderTemplate(templateKey, data);
          title = rendered.title;
          message = rendered.body;
      } else if (announcement) {
          // Determine subtype
          let templateKey = 'ANNOUNCEMENT';
          if (announcement.type === 'ECONOMIC') templateKey = 'ECONOMIC_ALERT';
          if (announcement.type === 'REMINDER') templateKey = 'PLAN_EXPIRY_REMINDER';
          
          // Add helper fields if missing
          // e.g. for REMINDER, we might need planName/daysLeft. 
          // If these are passed in 'announcement' object (even if not in DB schema but passed in payload), we use them.
          
          const rendered = renderTemplate(templateKey, announcement);
          title = rendered.title;
          message = rendered.body;
      } else {
          logger.warn('Unknown notification payload');
          return;
      }

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
          // If pushConfig exists and is enabled, we send. 
          // We don't strictly NEED fcmServerKey check anymore because we use Admin SDK, 
          // but we honor the 'enabled' flag.
          if (pushConfig && pushConfig.enabled) {
              if (user.fcmTokens && user.fcmTokens.length > 0) {
                  // Prepare data payload for deep-linking
                  const pushData = {};
                  if (signal) pushData.signalId = signal._id;
                  if (announcement) pushData.announcementId = announcement._id;

                  await pushService.sendPushNotification(
                      user.fcmTokens, 
                      title, 
                      message,
                      pushData
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
