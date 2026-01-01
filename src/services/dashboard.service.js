import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import Transaction from '../models/Transaction.js';

// Ticket Logic
const createTicket = async (ticketBody, user) => {
  const count = await Ticket.countDocuments();
  const ticketId = `#TIC-${1000 + count + 1}`;
  return Ticket.create({ ...ticketBody, user: user.id, ticketId, messages: [ticketBody.initialMessage] });
};

const replyToTicket = async (ticketId, messageData) => {
   const ticket = await Ticket.findById(ticketId);
   if(!ticket) throw new Error('Ticket not found');
   ticket.messages.push(messageData);
   if (messageData.sender === 'ADMIN') {
       ticket.status = 'IN_PROGRESS';
   }
   await ticket.save();
   return ticket;
};

const getTickets = async (filter) => {
    return Ticket.find(filter).populate('user', 'name email');
};

// Dashboard Logic
// Helper for growth calculation
const calculateGrowth = async (model, filter = {}) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const currentMonthCount = await model.countDocuments({
    ...filter,
    createdAt: { $gte: thirtyDaysAgo }
  });
  const prevMonthCount = await model.countDocuments({
    ...filter,
    createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
  });

  if (prevMonthCount === 0) return currentMonthCount > 0 ? 100 : 0;
  return Math.round(((currentMonthCount - prevMonthCount) / prevMonthCount) * 100);
};

const getRevenueGraph = async () => {
    // Aggregate daily revenue for last 30 days
    const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);
    const revenueOverTime = await Transaction.aggregate([
        { 
            $match: { 
                createdAt: { $gte: thirtyDaysAgo },
                status: 'success',
                // Assuming purpose 'SUBSCRIPTION' is revenue. 
                // Adjust if WALLET_TOPUP is also revenue, but usually subs are main revenue.
                purpose: 'SUBSCRIPTION' 
            } 
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                value: { $sum: "$amount" }
            }
        },
        { $sort: { _id: 1 } }
    ]);
    // Format: [{ date: '2023-12-01', value: 5000 }]
    return revenueOverTime.map(item => ({ date: item._id, value: item.value }));
};

const getRecentOrders = async () => {
    // Fetch last 5 success transactions linked to users
    const orders = await Transaction.find({ status: 'success', purpose: 'SUBSCRIPTION' })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email');
    
    // Map to frontend format
    // { id: 'ORD-001', user: 'Rajesh', plan: 'Gold', amount: '5000', status: 'Success', date: '...' }
    return orders.map((ord, index) => ({
        id: `ORD-${ord._id.toString().slice(-6).toUpperCase()}`,
        user: ord.user?.name || 'Unknown User',
        plan: ord.metadata?.get('planName') || 'Premium Plan', // Assuming plan name stored in metadata or need cross-reference
        amount: `₹ ${ord.amount.toLocaleString()}`,
        status: ord.status === 'success' ? 'Success' : ord.status,
        date: new Date(ord.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    }));
};

const getLastActivity = async () => {
     // Mock activity merging
     // 1. New Users
     const newUsers = await User.find().sort({ createdAt: -1 }).limit(3).lean();
     // 2. New Subscriptions/Txns
     const newTxns = await Transaction.find({ status: 'success' }).populate('user', 'name').sort({ createdAt: -1 }).limit(3).lean();
     // 3. New Tickets
     const newTickets = await Ticket.find().limit(3).populate('user', 'name').sort({ createdAt: -1 }).lean();

     const activities = [
         ...newUsers.map(u => ({
             type: 'user', msg: `New Registration: ${u.name}`, time: u.createdAt, id: u._id
         })),
         ...newTxns.map(t => ({
             type: 'sub', msg: `User ${t.user?.name} purchased plan`, time: t.createdAt, id: t._id
         })),
          ...newTickets.map(t => ({
             type: 'ticket', msg: `Ticket #${t.ticketId} from ${t.user?.name}`, time: t.createdAt, id: t._id
         }))
     ];

     // Sort by time descending and take top 10
     return activities
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 10)
        .map(a => ({
            ...a,
            time: new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) // Simple time format or relative
        }));
};

// Dashboard Logic
const getAdminStats = async () => {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const userGrowth = await calculateGrowth(User, { role: 'user' });

    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const subGrowth = await calculateGrowth(Subscription, { status: 'active' });

    const openTickets = await Ticket.countDocuments({ status: 'OPEN' });
    
    // Revenue aggregation
    const revenueAgg = await Transaction.aggregate([
        { $match: { status: 'success', purpose: 'SUBSCRIPTION' } }, 
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;
    // Revenue growth (simple approx based on transaction dates)
    const revenueGrowth = await calculateGrowth(Transaction, { status: 'success', purpose: 'SUBSCRIPTION' });

    return {
        users: { total: totalUsers, growth: userGrowth },
        subscriptions: { active: activeSubscriptions, growth: subGrowth },
        revenue: { total: totalRevenue, growth: revenueGrowth },
        tickets: { pending: openTickets },
        revenueGraph: await getRevenueGraph(),
        recentOrders: await getRecentOrders(),
        activityLog: await getLastActivity()
    };
};

export default {
  createTicket,
  replyToTicket,
  getTickets,
  getAdminStats
};
