import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Subscription from '../src/models/Subscription.js';
import Plan from '../src/models/Plan.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mspk_trading';

mongoose.connect(MONGO_URI).then(async () => {
    console.log('Connected to MongoDB');

    try {
        const user = await User.findOne({ email: 'admin@masterstroke.com' });
        if (!user) {
            console.log('Admin user not found. Run create_admin.js first.');
            process.exit(1);
        }

        // Create or Find Plan
        let plan = await Plan.findOne({ name: 'Premium Segment' });
        if (!plan) {
            plan = await Plan.create({
                name: 'Premium Segment',
                description: 'All Access Plan',
                segment: 'EQUITY', // Required field
                price: 5000,
                durationDays: 30, // Required field matching schema
                features: ['Nifty', 'BankNifty', 'Stocks'],
                isActive: true
            });
            console.log('Premium Plan Created');
        }

        // Create Subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30); // 30 days validity

        // Check existing
        let sub = await Subscription.findOne({ user: user._id, status: 'active' });
        if (sub) {
            console.log('Active subscription already exists. Updating dates.');
            sub.startDate = startDate;
            sub.endDate = endDate;
            sub.plan = plan._id;
            await sub.save();
        } else {
            sub = await Subscription.create({
                user: user._id,
                plan: plan._id,
                startDate: startDate,
                endDate: endDate,
                status: 'active',
                paymentId: 'MANUAL_SEED_' + Date.now()
            });
            console.log('New Subscription Created');
        }

        console.log('Subscription Seeded for Admin User');

    } catch (e) {
        console.error('Seed Failed', e);
    } finally {
        mongoose.disconnect();
    }
}).catch(err => {
    console.dir(err, { depth: null });
});
