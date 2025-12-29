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
  const user = await User.findOne({ email });
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Incorrect email or password');
  }
  return user;
};

export default {
  createUser,
  loginUserWithEmailAndPassword,
};
