import httpStatus from 'http-status';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

const getUserById = async (id) => {
  return User.findById(id);
};

const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

const updateKyc = async (userId, kycData) => {
    const user = await getUserById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    user.kyc = { ...user.kyc, ...kycData, status: 'pending' }; // Reset to pending on update
    await user.save();
    return user;
};

export default {
  getUserById,
  updateUserById,
  updateKyc
};
