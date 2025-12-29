import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import transactionService from './transaction.service.js';
import subBrokerService from './subBroker.service.js';

const purchaseSubscription = async (user, planId, paymentDetails) => {
  const plan = await Plan.findById(planId);
  if (!plan || !plan.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Plan not found or inactive');
  }

  // 1. Create Transaction (Pending)
  const transaction = await transactionService.createTransaction({
      user: user.id,
      amount: plan.price,
      currency: 'INR', // Default for now
      type: 'DEBIT',
      purpose: 'SUBSCRIPTION',
      status: 'pending',
      paymentGateway: paymentDetails.gateway || 'MANUAL',
      metadata: { planId: plan.id, planName: plan.name }
  });

  // 2. Simulate Payment Verification (In prod, this happens via Webhook or Server-side SDK verify)
  // For now, assume success if paymentDetails.success is true
  const isPaymentSuccessful = paymentDetails.success !== false; // Default true for mock

  if (!isPaymentSuccessful) {
      await transactionService.updateTransactionStatus(transaction.id, 'failed');
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment failed');
  }

  await transactionService.updateTransactionStatus(transaction.id, 'success', paymentDetails.transactionId);

  // Trigger Commission Logic
  try {
      await subBrokerService.recordCommission(transaction, user, plan);
  } catch (err) {
      // Don't fail subscription if commission logic fails
      console.error('Commission recording failed', err);
  }

  // 3. Create Subscription
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + plan.durationDays);

  const subscription = await Subscription.create({
      user: user.id,
      plan: plan.id,
      status: 'active',
      startDate,
      endDate,
      transaction: transaction.id
  });

  return subscription;
};

const getUserSubscriptions = async (userId) => {
    return Subscription.find({ user: userId }).populate('plan').populate('transaction');
};

export default {
  purchaseSubscription,
  getUserSubscriptions,
};
