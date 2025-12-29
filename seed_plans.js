import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Plan from './src/models/Plan.js';

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const plansToSeed = [
    { name: 'Equity Segment', price: 25000, durationDays: 30, segment: 'EQUITY', features: ['Equity specific signals', 'Priority Support'], isDemo: false },
    { name: 'Options Segment', price: 25000, durationDays: 30, segment: 'FNO', features: ['BankNifty/Nifty Options', 'Live Market Updates'], isDemo: false },
    { name: 'Crypto Segment', price: 25000, durationDays: 30, segment: 'COMMODITY', features: ['Major Crypto Pairs', '24/7 Alerts'], isDemo: false }, 
    { name: 'Forex Segment', price: 25000, durationDays: 30, segment: 'CURRENCY', features: ['Major Forex Pairs', 'News Events'], isDemo: false },
    { name: 'Commodity Segment', price: 25000, durationDays: 30, segment: 'COMMODITY', features: ['Gold & Silver', 'Crude Oil'], isDemo: false },
    { name: 'Free Demo Trial', price: 0, durationDays: 3, segment: 'EQUITY', features: ['Delayed Signals', 'App Access'], isDemo: true }
];

const seedPlans = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mspk_trading';
        console.log('Connecting to MongoDB...', mongoUri);
        await mongoose.connect(mongoUri);
        console.log('Connected.');

        console.log('Clearing existing plans...');
        await Plan.deleteMany({});
        
        console.log('Seeding new plans...');
        await Plan.insertMany(plansToSeed);

        console.log('✓ Successfully seeded 6 plans!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding plans:', error);
        process.exit(1);
    }
};

seedPlans();
