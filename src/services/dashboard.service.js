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
const getAdminStats = async () => {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const openTickets = await Ticket.countDocuments({ status: 'OPEN' });
    
    // Revenue aggregation
    const revenueAgg = await Transaction.aggregate([
        { $match: { status: 'success', type: 'DEBIT' } }, // DEBIT from user perspective means payment to platform? 
                                                        // Wait, in Transaction.js 'DEBIT' usually means deducting from USER wallet. 
                                                        // If type is CREDIT to PLATFORM, or DEBIT from USER card.
                                                        // Let's assume Transaction type 'CREDIT' means User added money, 'DEBIT' means User spent money? 
                                                        // Actually commonly: CREDIT = Refund/Add, DEBIT = Purchase.
                                                        // Let's verify Transaction.js logic:
                                                        // type: Enum ['CREDIT', 'DEBIT'].
                                                        // Subscription Service uses type: 'DEBIT'.
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    return {
        totalUsers,
        activeSubscriptions,
        openTickets,
        totalRevenue
    };
};

export default {
  createTicket,
  replyToTicket,
  getTickets,
  getAdminStats
};
