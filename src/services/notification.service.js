import { Queue } from 'bullmq';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { redisSubscriber } from './redis.service.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const notificationQueue = new Queue('notifications', { connection });

class NotificationService {
  constructor() {
    this.init();
  }

  init() {
    // Subscribe to signals channel from Redis
    // Note: redisSubscriber is shared, so we just add another listener
    redisSubscriber.on('message', (channel, message) => {
        if (channel === 'signals') {
            try {
                const signal = JSON.parse(message);
                this.scheduleNotifications(signal);
            } catch (err) {
                logger.error('Notification Service Error', err);
            }
        }
    });
    
    logger.info('Notification Service started (Listening for Signals)');
  }

  async scheduleNotifications(signal) {
      try {
          // 1. TELEGRAM BROADCAST (System Level)
          // Always schedule this once, worker deals with channel config
          await notificationQueue.add('send-telegram-broadcast', {
              type: 'telegram',
              signal,
              userId: 'system' // Not user specific
          }, { removeOnComplete: true });

          // 2. TARGETED NOTIFICATIONS (WhatsApp / Push)
          // Find users with Active Subscriptions matching this Segment
          
          // Step A: Find Plans that cover this segment
          // Note: Plan schema uses 'segment' enum. Signal has 'segment' field.
          // Adjust matching logic if segment names differ. Assuming exact match for now.
          const { default: Subscription } = await import('../models/Subscription.js');
          const { default: Plan } = await import('../models/Plan.js');

          // Find active subscriptions
          const now = new Date();
          const activeSubs = await Subscription.find({
              status: 'active',
              endDate: { $gt: now }
          }).populate('plan');

          // Filter for segment match
          const eligibleUserIds = new Set();
          
          activeSubs.forEach(sub => {
              if (sub.plan && sub.user) {
                  // Direct Segment Match
                  if (sub.plan.segment === signal.segment) {
                      eligibleUserIds.add(sub.user.toString());
                  }
                  // TODO: Handle 'All Segments' plans if any
              }
          });

          // Also include the Creator for verification (if not already included)
          if (signal.createdBy) eligibleUserIds.add(signal.createdBy.toString());

          logger.info(`Found ${eligibleUserIds.size} eligible users for Signal ${signal.symbol}`);

          // Step B: Schedule Jobs for each user
          const promises = Array.from(eligibleUserIds).map(userId => {
              // We schedule ONE job per user, worker decides channel priority (Push vs WA vs Email)
              // Actually worker is split by type currently. Let's schedule both for now.
              // Optimization: We can have a 'notify-user' job types that handles all channels inside worker. 
              // But strictly following worker logic:
              
              const p1 = notificationQueue.add('send-push', {
                  type: 'push',
                  userId,
                  signal
              }, { removeOnComplete: true });

              const p2 = notificationQueue.add('send-whatsapp', {
                  type: 'whatsapp',
                  userId,
                  signal
              }, { removeOnComplete: true });
              
              return [p1, p2];
          });

          await Promise.all(promises.flat());
          

          // Step C: Create In-App Notifications for all eligible users
          const notificationDocs = Array.from(eligibleUserIds).map(userId => ({
              user: userId,
              title: `New Signal: ${signal.symbol}`,
              message: `Action: ${signal.type} | Entry: ${signal.entryPrice}`,
              type: 'SIGNAL',
              data: { signalId: signal._id },
              link: `/signals` // Or specific ID
          }));

          if (notificationDocs.length > 0) {
              await Notification.insertMany(notificationDocs);
          }

          logger.info(`Scheduled notifications for Signal ${signal._id} to ${eligibleUserIds.size} users`);

      } catch (error) {
          logger.error('Failed to schedule notifications', error);
      }
  }

  async scheduleAnnouncementNotifications(announcement) {
      try {
          const { targetAudience, title, message } = announcement;
          const query = { status: 'Active' };

          // Audience Filtering
          if (targetAudience && targetAudience.role !== 'all') {
             // Handle 'sub-broker' or specific roles
             // Note: frontend sends 'sub-broker', schema is 'sub-broker' or 'user' etc.
             // If role is simply the string, use it.
             query.role = targetAudience.role;
          }

          const users = await User.find(query).select('_id name fcmTokens');
          
          if (users.length === 0) {
              logger.info('No users found for announcement broadcast');
              return;
          }

          logger.info(`Scheduling announcement push for ${users.length} users`);

          const promises = users.map(user => {
              // Only schedule if user has FCM tokens (optimization)
              if (user.fcmTokens && user.fcmTokens.length > 0) {
                  return notificationQueue.add('send-push-announcement', {
                      type: 'push',
                      userId: user._id,
                      announcement: {
                          title,
                          message
                      }
                  }, { removeOnComplete: true });
              }
              return Promise.resolve();
          });

          await Promise.all(promises);

          // Save In-App Notifications
          const notificationDocs = users.map(user => ({
              user: user._id,
              title: title,
              message: message,
              type: 'ANNOUNCEMENT',
              isRead: false
          }));

          if (notificationDocs.length > 0) {
              await Notification.insertMany(notificationDocs);
          }

          logger.info(`Broadcasted announcement ${announcement._id} to ${users.length} potential users`);

      } catch (error) {
          logger.error('Failed to schedule announcement notifications', error);
      }
  }
  async sendPlanExpiryReminder(user, daysLeft) {
      try {
          const planName = user.subscription?.plan?.name || 'Subscription';
          
          await notificationQueue.add('send-push-reminder', {
              type: 'push',
              userId: user._id,
              announcement: {
                  type: 'REMINDER', // Triggers PLAN_EXPIRY_REMINDER template
                  planName,
                  daysLeft,
                  // Fallback values for ANNOUNCEMENT template if switch fails
                  title: 'Plan Expiry',
                  message: `Your ${planName} plan expires in ${daysLeft} days.`
              }
          }, { removeOnComplete: true });

      } catch (error) {
          logger.error(`Failed to schedule expiry reminder for user ${user._id}`, error);
      }
  }
}

export default new NotificationService();
