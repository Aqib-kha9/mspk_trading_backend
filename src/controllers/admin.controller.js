import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import ApiError from '../utils/ApiError.js';
import { redisClient } from '../services/redis.service.js';
import transactionService from '../services/transaction.service.js';
import { subBrokerService } from '../services/index.js';

const createUser = catchAsync(async (req, res) => {
    console.log("Create User Payload:", JSON.stringify(req.body, null, 2)); // DEBUG LOG
    const { email, password, name, phone, role, clientId, equity, walletBalance, subBrokerId, planId, status } = req.body;

    if (await User.findOne({ email })) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
    }

    const user = await User.create({
        name,
        email,
        password,
        phone,
        role,
        clientId,
        equity,
        walletBalance,
        subBrokerId,
        status,
        isEmailVerified: true // Admin created, so verify
    });

    // Handle Plan Subscription
    if (planId) {
        const plan = await Plan.findById(planId);
        if (plan) {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + (plan.durationDays || 30));

            // Create Manual Transaction
            const transaction = await transactionService.createTransaction({
                user: user.id,
                amount: plan.price,
                currency: 'INR',
                type: 'DEBIT',
                purpose: 'SUBSCRIPTION',
                status: 'success',
                paymentGateway: 'MANUAL_ADMIN',
                metadata: { planId: plan.id, planName: plan.name, adminCreated: true }
            });

            await Subscription.create({
                user: user.id,
                plan: plan.id,
                status: 'active',
                startDate,
                endDate,
                transaction: transaction.id
            });

            // Trigger Commission Record
            try {
                await subBrokerService.recordCommission(transaction, user, plan);
            } catch (err) {
                console.error("Commission Recording Failed:", err);
            }

            // Update legacy user subscription field for consistency
            user.subscription = {
                plan: plan.name,
                expiresAt: endDate
            };
            await user.save();
        }
    }

    res.status(httpStatus.CREATED).send(user);
});

const getUsers = catchAsync(async (req, res) => {
  const users = await User.find({}, '-password').sort({ createdAt: -1 }).populate('subBrokerId', 'name');

  const enrichedUsers = await Promise.all(users.map(async (u) => {
      // Find active subscription
      const sub = await Subscription.findOne({ user: u.id, status: 'active' }).populate('plan');
      
      return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          ip: u.lastLoginIp,
          
          // Subscription / Plan Data
          plan: (sub && sub.plan) ? sub.plan.name : 'Free', 
          planStatus: sub ? 'Active' : 'Inactive',
          subscriptionStart: sub ? sub.startDate : null,
          subscriptionExpiry: sub ? sub.endDate : null,

          // Broker Data
          subBrokerId: u.subBrokerId ? u.subBrokerId._id : 'DIRECT',
          subBrokerName: u.subBrokerId ? u.subBrokerId.name : 'Direct Client',

          // Trading Stats
          status: u.status || 'Active', 
          walletBalance: u.walletBalance || 0,
          clientId: u.clientId || `MS-${u.id.toString().slice(-4)}`,
          equity: u.equity || 0,
          marginUsed: u.marginUsed || 0,
          pnl: u.pnl || 0,
          
          joinDate: u.createdAt,
          kycStatus: u.kyc?.status || 'Pending',
      };
  }));
  res.send(enrichedUsers);
});

const getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.userId).populate('subBrokerId', 'name clientId');
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Fetch active subscription
  const sub = await Subscription.findOne({ user: user.id, status: 'active' }).populate('plan');

  // Fetch all subscriptions for history
  const history = await Subscription.find({ user: user.id }).sort({ createdAt: -1 }).populate('plan');

  const enrichedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      
      // Subscription / Plan Data
      plan: (sub && sub.plan) ? sub.plan.name : 'Free', 
      planStatus: sub ? 'Active' : 'Inactive',
      subscriptionStart: sub ? sub.startDate : null,
      subscriptionExpiry: sub ? sub.endDate : null,
      planPrice: (sub && sub.plan) ? sub.plan.price : 0,

      // Broker Data
      subBrokerId: user.subBrokerId ? user.subBrokerId._id : null,
      subBrokerName: user.subBrokerId ? user.subBrokerId.name : 'Direct Client',
      subBrokerClientId: user.subBrokerId ? user.subBrokerId.clientId : null,

      // Trading Stats
      status: user.status || 'Active', 
      walletBalance: user.walletBalance || 0,
      clientId: user.clientId || `MS-${user.id.toString().slice(-4)}`,
      equity: user.equity || 0,
      marginUsed: user.marginUsed || 0,
      pnl: user.pnl || 0,
      
      joinDate: user.createdAt,
      kycStatus: user.kyc?.status || 'Pending',
      
      // History
      subscriptionHistory: history.map(h => ({
          id: h.id,
          plan: h.plan ? h.plan.name : 'Unknown Plan',
          amount: h.plan ? `₹${h.plan.price}` : '-',
          date: h.createdAt,
          status: h.status,
          expiry: h.endDate
      })),

      // Computed Signals (Default List + Overrides)
      signals: getComputedSignals(user, sub)
  };

  res.send(enrichedUser);
});

// Helper to compute signals based on Plan and User Overrides
const getComputedSignals = (user, activeSub) => {
    // Defines all available signal categories in the system
    const systemSignals = [
        { key: 'NIFTY_OPT', label: 'Nifty 50 Options', keywords: ['Nifty', 'Options', 'FNO'] },
        { key: 'BANKNIFTY_OPT', label: 'BankNifty Options', keywords: ['BankNifty', 'Options', 'FNO'] },
        { key: 'STOCKS_INTRA', label: 'Stocks Intraday', keywords: ['Equity', 'Stocks', 'Intraday', 'Cash'] },
        { key: 'COMMODITY', label: 'Commodity (MCX)', keywords: ['Commodity', 'Gold', 'Silver', 'Crude', 'MCX'] },
        { key: 'FOREX', label: 'Forex Signals', keywords: ['Forex', 'Currency', 'Pairs'] }
    ];

    return systemSignals.map(sig => {
        // 1. Check for specific user override first
        const override = user.signalAccess?.find(s => s.category === sig.key);
        if (override) {
            return {
                category: sig.label,
                key: sig.key,
                access: override.access,
                expiry: override.expiry ? override.expiry : (activeSub ? activeSub.endDate : null),
                source: 'override'
            };
        }

        // 2. Smart Plan Mapping
        let planHasAccess = false;
        
        if (activeSub && activeSub.status === 'active' && activeSub.plan && activeSub.plan.features) {
            // Check if any plan feature contains any of the signal keywords
            // logic: Does plan.features (array of strings) have any string that includes a keyword?
            const planFeatures = activeSub.plan.features.map(f => f.toLowerCase());
            
            // Check segment match (stronger check)
            if (activeSub.plan.segment) {
                const seg = activeSub.plan.segment; // NEVER check toLowerCase here if enum is CONSTANT, but safe to do so
                if (seg === 'FNO' && (sig.key === 'NIFTY_OPT' || sig.key === 'BANKNIFTY_OPT')) planHasAccess = true;
                if (seg === 'EQUITY' && sig.key === 'STOCKS_INTRA') planHasAccess = true;
                if (seg === 'COMMODITY' && sig.key === 'COMMODITY') planHasAccess = true;
                if (seg === 'CURRENCY' && sig.key === 'FOREX') planHasAccess = true;
            }

            // Keyword fallback check
            if (!planHasAccess) {
                const keywords = sig.keywords.map(k => k.toLowerCase());
                const matchesKeyword = planFeatures.some(feature => 
                    keywords.some(keyword => feature.includes(keyword))
                );
                if (matchesKeyword) planHasAccess = true;
            }
        }

        return {
            category: sig.label,
            key: sig.key,
            access: planHasAccess,
            expiry: activeSub ? activeSub.endDate : null,
            source: 'plan'
        };
    });
};

const updateSignalAccess = catchAsync(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    const { category, access, expiry } = req.body;

    // Check if override exists
    const existingIndex = user.signalAccess.findIndex(s => s.category === category);

    if (existingIndex > -1) {
        // Update existing
        user.signalAccess[existingIndex].access = access;
        if (expiry) user.signalAccess[existingIndex].expiry = expiry;
    } else {
        // Add new override
        user.signalAccess.push({ category, access, expiry });
    }

    await user.save();
    res.send({ message: 'Signal access updated', signals: getComputedSignals(user, null) }); // Return updated list (approximation)
});

const updateUserRole = catchAsync(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.userId, { role: req.body.role }, { new: true });
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    res.send(user);
});

const getSystemHealth = catchAsync(async (req, res) => {
    // Check Redis
    let redisStatus = 'DOWN';
    try {
        await redisClient.ping();
        redisStatus = 'UP';
    } catch(e) {
        redisStatus = 'DOWN';
    }

    // Check DB
    const dbStatus = 'UP'; // If we are here, express is connected (usually)
    
    // Memory Usage
    const memory = process.memoryUsage();

    res.send({
        status: 'OK',
        timestamp: new Date(),
        components: {
            redis: redisStatus,
            database: dbStatus
        },
        memory: {
            rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`
        }
    });
});

const deleteUser = catchAsync(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    await Subscription.deleteMany({ user: user.id });
    await User.deleteOne({ _id: user._id });
    res.status(httpStatus.NO_CONTENT).send();
});

const blockUser = catchAsync(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    user.status = user.status === 'Blocked' ? 'Active' : 'Blocked';
    await user.save();
    res.send(user);
});

const liquidateUser = catchAsync(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    // Logic: Reset trading stats and mark liquidated
    user.status = 'Liquidated';
    user.equity = 0;
    user.marginUsed = 0;
    user.pnl = 0;
    await user.save();
    
    res.send(user);
});

const updateUser = catchAsync(async (req, res) => {
    const { userId } = req.params;
    const { planId, ...body } = req.body; // Extract planId separately

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check if email is taken (if email is being updated)
    if (body.email && body.email !== user.email) {
        if (await User.findOne({ email: body.email })) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
        }
    }

    // Update basic fields
    Object.assign(user, body);
    await user.save(); // Password hashing happens in pre-save if 'password' was in body

    // Handle Plan Update (if planId provided and changed)
    if (planId) {
        const currentSub = await Subscription.findOne({ user: user.id, status: 'active' });
        
        // If no active plan OR different plan
        if (!currentSub || currentSub.plan.toString() !== planId) {
             const plan = await Plan.findById(planId);
             if (plan) {
                 // Expire old subscription
                 if (currentSub) {
                     currentSub.status = 'expired';
                     currentSub.endDate = new Date();
                     await currentSub.save();
                 }

                 // Create new subscription
                 const startDate = new Date();
                 const endDate = new Date();
                 endDate.setDate(endDate.getDate() + (plan.durationDays || 30));

                 await Subscription.create({
                     user: user.id,
                     plan: plan.id,
                     status: 'active',
                     startDate,
                     endDate,
                     transaction: null
                 });
             }
        }
    }

    res.send(user);
});

export default {
  getUsers,
  createUser,
  getUser,
  updateUser,
  updateUserRole,
  deleteUser,
  blockUser, 
  liquidateUser,
  updateSignalAccess,
  getSystemHealth
};
