import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import transactionService from './transaction.service.js';
import subBrokerService from './subBroker.service.js';
import User from '../models/User.js';

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

const getAllSubscriptions = async (filter = {}) => {
    // Populate user and plan for the table
    // Sort by createdAt desc
    return Subscription.find(filter)
        .populate('user', 'name email lastLoginIp') // Adjust fields as needed
        .populate('plan', 'name durationDays price')
        .populate('transaction', 'amount status paymentGateway transactionId createdAt')
        .sort({ createdAt: -1 });
};

const assignPlanToUser = async (userId, planId, { startDate, durationDays } = {}) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    const plan = await Plan.findById(planId);
    if (!plan) {
         throw new ApiError(httpStatus.BAD_REQUEST, 'Plan not found');
    }

    // Create a manual transaction record
    const transaction = await transactionService.createTransaction({
        user: userId,
        amount: plan.price,
        currency: 'INR',
        type: 'DEBIT',
        purpose: 'SUBSCRIPTION',
        status: 'success',
        paymentGateway: 'MANUAL_ADMIN',
        metadata: { planId: plan.id, planName: plan.name, adminAssigned: true }
    });

    const start = startDate ? new Date(startDate) : new Date();
    const duration = durationDays || plan.durationDays;
    const end = new Date(start);
    end.setDate(start.getDate() + duration);

    const subscription = await Subscription.create({
        user: userId,
        plan: plan.id,
        status: 'active',
        startDate: start,
        endDate: end,
        transaction: transaction.id
    });

    return subscription;
};

const extendSubscription = async (subscriptionId, days) => {
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    // Add days to current end date
    const currentEnd = new Date(subscription.endDate);
    const newEnd = new Date(currentEnd);
    newEnd.setDate(currentEnd.getDate() + parseInt(days));

    subscription.endDate = newEnd;
    
    // If it was expired, mark as active if new end date is future
    if (subscription.status === 'expired' && newEnd > new Date()) {
        subscription.status = 'active';
    }

    await subscription.save();
    return subscription;
};

export default {
  purchaseSubscription,
  getUserSubscriptions,
  getAllSubscriptions,
  assignPlanToUser,
  extendSubscription
};
