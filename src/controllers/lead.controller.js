import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import Lead from '../models/Lead.js';

const createLead = catchAsync(async (req, res) => {
  const lead = await Lead.create(req.body);
  res.status(httpStatus.CREATED).send(lead);
});

const getLeads = catchAsync(async (req, res) => {
  // Simple get all for admin
  const leads = await Lead.find({}).sort({ createdAt: -1 });
  res.send(leads);
});

export default {
  createLead,
  getLeads
};
