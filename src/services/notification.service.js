import { Queue } from 'bullmq';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { redisSubscriber } from './redis.service.js';

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
          
          logger.info(`Scheduled notifications for Signal ${signal._id} to ${eligibleUserIds.size} users`);

      } catch (error) {
          logger.error('Failed to schedule notifications', error);
      }
  }
}

export default new NotificationService();
