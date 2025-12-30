import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { subscriptionService } from '../services/index.js';

const purchaseSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.purchaseSubscription(req.user, req.body.planId, req.body.paymentDetails);
  res.status(httpStatus.CREATED).send(subscription);
});

const getMySubscriptions = catchAsync(async (req, res) => {
  const subscriptions = await subscriptionService.getUserSubscriptions(req.user.id);
  res.send(subscriptions);
});

export default {
  purchaseSubscription,
  getMySubscriptions,
  getAllSubscriptions: catchAsync(async (req, res) => {
      // Backend filtering logic
      let filter = {};
      if (req.query.status) {
          filter.status = req.query.status;
      }
      if (req.query.userId) {
          filter.user = req.query.userId;
      }
      // Add more filters as needed (date range etc)
      
      const subscriptions = await subscriptionService.getAllSubscriptions(filter);
      
      // Optional: Transform data here if strictly needed to match frontend table exactly, 
      // but usually better to have frontend adapt or basic populate is enough.
      // The service already populates user, plan, transaction.
      res.send(subscriptions);
  }),
  assignPlan: catchAsync(async (req, res) => {
      const { userId, planId, startDate, durationDays } = req.body;
      const subscription = await subscriptionService.assignPlanToUser(userId, planId, { startDate, durationDays });
      res.status(httpStatus.CREATED).send(subscription);
  }),
  extendSubscription: catchAsync(async (req, res) => {
      const { subscriptionId } = req.params;
      const { days } = req.body;
      const subscription = await subscriptionService.extendSubscription(subscriptionId, days);
      res.send(subscription);
  })
};
