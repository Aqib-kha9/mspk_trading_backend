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
      // In a real app, check User preferences here
      // For now, assume we send both Email and Push if enabled in Signal logic (or by default)
      
      const userId = signal.user;
      
      // Add to Queue (Email)
      await notificationQueue.add('send-email', {
          type: 'email',
          userId,
          signal
      }, {
          attempts: 3,
          backoff: 5000
      });

      // Add to Queue (Push)
      await notificationQueue.add('send-push', {
          type: 'push',
          userId,
          signal
      }, {
          attempts: 3,
          removeOnComplete: true
      });
      
      logger.info(`Scheduled notifications for Signal ${signal._id}`);
  }
}

export default new NotificationService();
