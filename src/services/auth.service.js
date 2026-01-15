import httpStatus from 'http-status';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

const createUser = async (userBody) => {
  if (await User.findOne({ email: userBody.email })) {
    throw new ApiError(400, 'Email already taken');
  }

  // Handle Referral Logic
  const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // Simple 6-char code
  
  let referredBy = undefined;
  if (userBody.referralCode) {
      const referrer = await User.findOne({ 'referral.code': userBody.referralCode });
      if (referrer) {
          referredBy = referrer._id;
      }
  }

  const user = await User.create({
      ...userBody,
      referral: {
          code: referralCode,
          referredBy: referredBy
      },
      status: 'Active'
  });
  return user;
};

const loginUserWithEmailAndPassword = async (email, password) => {
  // Ensure email is lowercase to match schema
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Incorrect email or password');
  }

  // Return both the Mongoose Document (for saving) and the Plan Data (for response)
  const planDetails = await getUserActivePlan(user);
  return { user, planDetails };
};

const getUserActivePlan = async (user) => {
  const Subscription = (await import('../models/Subscription.js')).default;
  
  const activeSub = await Subscription.findOne({ 
      user: user._id, 
      status: 'active', 
      endDate: { $gt: new Date() } 
  }).populate('plan');

  if (activeSub && activeSub.plan) {
      return {
          planId: activeSub.plan._id,
          planName: activeSub.plan.name,
          permissions: activeSub.plan.permissions || [],
          planExpiry: activeSub.endDate
      };
  }
  
  return {
      permissions: [],
      planName: null,
      planId: null,
      planExpiry: null
  };
};

export default {
  createUser,
  loginUserWithEmailAndPassword,
  getUserActivePlan
};
