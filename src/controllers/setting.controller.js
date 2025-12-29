import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { settingService } from '../services/index.js';

const getSetting = catchAsync(async (req, res) => {
  const { key } = req.params;
  const value = await settingService.getSetting(key);
  // Return null if not found, or default object? keeping it simple: just the value
  res.send({ key, value });
});

const updateSetting = catchAsync(async (req, res) => {
  const { key } = req.params;
  const { value, description } = req.body;
  const setting = await settingService.setSetting(key, value, description);
  res.send(setting);
});

export default {
  getSetting,
  updateSetting,
};
