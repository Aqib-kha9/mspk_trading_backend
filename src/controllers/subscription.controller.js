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
};
