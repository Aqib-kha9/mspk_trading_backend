import Plan from '../models/Plan.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';

const createPlan = async (planBody) => {
  return Plan.create(planBody);
};

const queryPlans = async (filter, options) => {
  const plans = await Plan.find(filter);
  return plans;
};

const getPlanById = async (id) => {
  return Plan.findById(id);
};

const updatePlanById = async (planId, updateBody) => {
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Plan not found');
  }
  Object.assign(plan, updateBody);
  await plan.save();
  return plan;
};

const deletePlanById = async (planId) => {
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Plan not found');
  }
  await plan.deleteOne();
  return plan;
};

export default {
  createPlan,
  queryPlans,
  getPlanById,
  updatePlanById,
  deletePlanById,
};
