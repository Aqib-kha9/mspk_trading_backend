import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import Strategy from '../models/Strategy.js';
import ApiError from '../utils/ApiError.js';

const createStrategy = catchAsync(async (req, res) => {
  const strategy = await Strategy.create({
      ...req.body,
      user: req.user.id
  });
  res.status(httpStatus.CREATED).send(strategy);
});

const getStrategies = catchAsync(async (req, res) => {
  const strategies = await Strategy.find({ user: req.user.id });
  res.send(strategies);
});

const getStrategy = catchAsync(async (req, res) => {
  const strategy = await Strategy.findById(req.params.strategyId);
  if (!strategy) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Strategy not found');
  }
  // Check ownership
  if (strategy.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }
  res.send(strategy);
});

const deleteStrategy = catchAsync(async (req, res) => {
  const strategy = await Strategy.findById(req.params.strategyId);
  if (!strategy) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Strategy not found');
  }
  if (strategy.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }
  await strategy.deleteOne(); // Updated to deleteOne() for Mongoose v7+
  res.status(httpStatus.NO_CONTENT).send();
});

export default {
  createStrategy,
  getStrategies,
  getStrategy,
  deleteStrategy
};
