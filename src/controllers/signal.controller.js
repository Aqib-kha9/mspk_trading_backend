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
  const { page = 1, limit = 10, search, status, segment } = req.query;

  // 1. Build Base Filter (Permissions)
  if (!req.user || req.user.role !== 'admin') {
      let allowedCategories = [];
      
      // If user is logged in, fetch their subscriptions
      if (req.user) {
          const subs = await subscriptionService.getUserSubscriptions(req.user.id);
          // Extract all permissions from active plans
          subs.filter(s => s.status === 'active' && s.plan).forEach(sub => {
              if (sub.plan.permissions && Array.isArray(sub.plan.permissions)) {
                  allowedCategories.push(...sub.plan.permissions);
              }
          });
      }

      // Filter: Free OR Subscribed Category OR Closed (History/SEO)
      filter = {
          $or: [
              { isFree: true },
              { status: 'Closed' },
              { category: { $in: allowedCategories } }
          ]
      };
  }

  // 2. Apply Search & Filters
  if (search) {
      // Create regex for symbol
      filter.symbol = { $regex: search, $options: 'i' };
  }

  if (status && status !== 'All') {
      if (status === '!Closed') {
          filter.status = { $ne: 'Closed' };
      } else {
          filter.status = status;
      }
  }

  if (segment && segment !== 'All') {
      filter.segment = segment;
  }

  // 3. Query Data
  const signalsData = await signalService.querySignals(filter, { page, limit });
  
  // 4. Get Global Stats (Independent of filters? Or dependent? Usually Global for the dashboard feel)
  // For now, let's keep stats global as per request "active positions", "success rate" usually implies overall system health.
  const stats = await signalService.getSignalStats();

  const formattedResults = signalsData.results.map(s => ({
      id: s._id,
      symbol: s.symbol,
      type: s.type,
      entry: s.entryPrice,
      stoploss: s.stopLoss,
      status: s.status,
      timestamp: s.createdAt,
      timestamp: s.createdAt,
      segment: s.segment,
      category: s.category,
      targets: s.targets,
      isFree: s.isFree,
      notes: s.notes
  }));

  res.send({
      results: formattedResults,
      pagination: {
          page: signalsData.page,
          limit: signalsData.limit,
          totalPages: signalsData.totalPages,
          totalResults: signalsData.totalResults
      },
      stats
  });
});

const updateSignal = catchAsync(async (req, res) => {
    const signal = await signalService.updateSignalById(req.params.signalId, req.body);
    res.send(signal);
});

const deleteSignal = catchAsync(async (req, res) => {
    await signalService.deleteSignalById(req.params.signalId);
    res.status(httpStatus.NO_CONTENT).send();
});

export default {
  createSignal,
  getSignals,
  updateSignal,
  deleteSignal
};
