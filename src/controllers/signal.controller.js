import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { signalService, subscriptionService } from '../services/index.js';

const createSignal = catchAsync(async (req, res) => {
  const signal = await signalService.createSignal(req.body, req.user);
  res.status(httpStatus.CREATED).send(signal);
});

const getSignals = catchAsync(async (req, res) => {
  // Logic: Show all if admin. If user, show Free OR Subscribed segments.
  let filter = {};
  
  if (req.user.role !== 'admin') {
      // Get User Subscriptions
      const subs = await subscriptionService.getUserSubscriptions(req.user.id);
      const activeSegments = subs
        .filter(s => s.status === 'active')
        .map(s => s.plan.segment); // Assuming plan is populated

      // Condition: isFree OR segment IN activeSegments
      filter = {
          $or: [
              { isFree: true },
              { segment: { $in: activeSegments } }
          ]
      };
  }

  /* 
     Frontend Expects: { id, symbol, type, entry, stoploss, status, timestamp }
     Backend: { _id, symbol, type, entryPrice, stopLoss, status, createdAt }
  */
  const formattedSignals = signals.map(s => ({
      id: s._id,
      symbol: s.symbol,
      type: s.type,
      entry: s.entryPrice, // key mapping
      stoploss: s.stopLoss, // key mapping
      status: s.status,
      timestamp: s.createdAt,
      // Keep other fields if needed for config
      segment: s.segment
  }));
  res.send(formattedSignals);
});

const updateSignal = catchAsync(async (req, res) => {
    const signal = await signalService.updateSignalById(req.params.signalId, req.body);
    res.send(signal);
});

export default {
  createSignal,
  getSignals,
  updateSignal
};
