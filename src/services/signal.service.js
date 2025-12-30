import Signal from '../models/Signal.js';
import logger from '../config/logger.js';
import { getIo } from './socket.service.js';
// import { sendPushNotification } from './email.service.js'; 

const createSignal = async (signalBody, user) => {
  const signal = await Signal.create({ ...signalBody, createdBy: user.id });
  
  // Broadcast via Socket.io
  try {
      const io = getIo();
      io.emit('new_signal', signal);
  } catch (e) {
      logger.error('Failed to emit socket event for new signal', e);
  }

  // Publish to Redis for Notification Service
  try {
      const { redisClient } = await import('./redis.service.js');
      // Payload for notification service
      const payload = JSON.stringify({ ...signal.toJSON(), user: user.id }); 
      await redisClient.publish('signals', payload);
      logger.info(`Published new signal ${signal.id} to Redis 'signals' channel`);
  } catch (e) {
      logger.error('Failed to publish signal to Redis', e);
  }
  
  return signal;
};

const querySignals = async (filter, options) => {
  const page = options.page ? parseInt(options.page) : 1;
  const limit = options.limit ? parseInt(options.limit) : 10;
  const skip = (page - 1) * limit;

  const [totalResults, results] = await Promise.all([
    Signal.countDocuments(filter),
    Signal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
  ]);

  const totalPages = Math.ceil(totalResults / limit);

  return {
    results,
    page,
    limit,
    totalPages,
    totalResults
  };
};

const getSignalStats = async () => {
  const stats = await Signal.aggregate([
    {
      $group: {
        _id: null,
        totalSignals: { $sum: 1 },
        activeSignals: {
          $sum: {
            $cond: [{ $in: ["$status", ["Open", "Active", "Paused"]] }, 1, 0]
          }
        },
        closedSignals: {
          $sum: {
            $cond: [{ $eq: ["$status", "Closed"] }, 1, 0]
          }
        },
        targetHit: {
          $sum: {
            $cond: [{ $eq: ["$status", "Target Hit"] }, 1, 0]
          }
        },
        stoplossHit: {
          $sum: {
            $cond: [{ $eq: ["$status", "Stoploss Hit"] }, 1, 0]
          }
        }
      }
    }
  ]);

  const data = stats[0] || { totalSignals: 0, activeSignals: 0, closedSignals: 0, targetHit: 0, stoplossHit: 0 };
  
  // Success Rate = (Target Hit) / (Target Hit + Stoploss Hit) * 100
  // Or (Target Hit) / (Total Closed) ? Usually Target vs SL.
  const outcomes = data.targetHit + data.stoplossHit;
  const successRate = outcomes > 0 ? Math.round((data.targetHit / outcomes) * 100) : 0;

  return {
    ...data,
    successRate
  };
};

const updateSignalById = async (signalId, updateBody) => {
  const signal = await Signal.findById(signalId);
  if (!signal) {
     throw new Error('Signal not found');
  }
  Object.assign(signal, updateBody);
  
  // Status update broadcast
  if (updateBody.status || updateBody.report) {
       try {
          const io = getIo();
          io.emit('update_signal', signal);
      } catch (e) {
          logger.error('Failed to emit socket event for update signal', e);
      }
  }

  await signal.save();
  return signal;
};

const deleteSignalById = async (signalId) => {
  const signal = await Signal.findById(signalId);
  if (!signal) {
    throw new Error('Signal not found');
  }
  await signal.deleteOne();
  return signal;
};

export default {
  createSignal,
  querySignals,
  getSignalStats,
  updateSignalById,
  deleteSignalById,
};
