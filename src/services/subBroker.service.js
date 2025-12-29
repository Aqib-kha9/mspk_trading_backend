import User from '../models/User.js';
import Commission from '../models/Commission.js';

const getSubBrokers = async () => {
  return User.find({ role: 'sub-broker' });
};

const getSubBrokerClients = async (subBrokerId) => {
  return User.find({ 'referral.referredBy': subBrokerId });
};

const getCommissions = async (subBrokerId) => {
    return Commission.find({ subBroker: subBrokerId }).populate('user', 'name').populate('transaction');
};

const recordCommission = async (transaction, user, plan) => {
    // Check if user is referred by a sub-broker
    if (user.referral && user.referral.referredBy) {
        const subBroker = await User.findById(user.referral.referredBy);
        
        // Simple validation: must be a valid user and have role 'sub-broker'
        if (subBroker && subBroker.role === 'sub-broker') {
            const commissionRate = 10; // Fixed 10% for now. Could be dynamic in User model.
            const commissionAmount = (transaction.amount * commissionRate) / 100;

            await Commission.create({
                subBroker: subBroker.id,
                user: user.id,
                transaction: transaction.id,
                amount: commissionAmount,
                percentage: commissionRate,
                status: 'PENDING'
            });
        }
    }
};

export default {
  getSubBrokers,
  getSubBrokerClients,
  getCommissions,
  recordCommission
};
