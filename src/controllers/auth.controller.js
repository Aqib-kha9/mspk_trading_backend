import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { authService, tokenService, userService } from '../services/index.js';

const register = catchAsync(async (req, res) => {
  const user = await authService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(201).send({ user, token: tokens.access.token });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  // Destructure service response
  const { user, planDetails } = await authService.loginUserWithEmailAndPassword(email, password);
  
  // Single Session & IP Tracking Logic
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.lastLoginIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  await user.save(); // Now works because 'user' is a Mongoose doc

  const tokens = await tokenService.generateAuthTokens(user);
  
  // Merge User + Plan Details for Frontend
  const responseUser = {
      ...user.toObject(),
      ...planDetails
  };

  res.send({ user: responseUser, token: tokens.access.token });
});

const getMe = catchAsync(async (req, res) => {
    const planDetails = await authService.getUserActivePlan(req.user);
    const responseUser = {
        ...req.user.toObject(),
        ...planDetails
    };
    res.send(responseUser);
});

const updateMe = catchAsync(async (req, res) => {
    const user = await userService.updateUserById(req.user.id, req.body);
    res.send(user);
});

const updateKyc = catchAsync(async (req, res) => {
    const user = await userService.updateKyc(req.user.id, req.body);
    res.send(user);
});

export default {
  register,
  login,
  getMe,
  updateMe,
  updateKyc,
};
