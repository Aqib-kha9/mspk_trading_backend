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

  // TODO: Trigger Push Notification Worker
  
  return signal;
};

const querySignals = async (filter, options) => {
  const signals = await Signal.find(filter).sort({ createdAt: -1 });
  return signals;
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

export default {
  createSignal,
  querySignals,
  updateSignalById,
};
