import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

// Models
import User from './src/models/User.js';
import Segment from './src/models/MasterSegment.js';
import MasterSymbol from './src/models/MasterSymbol.js';
import Strategy from './src/models/Strategy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI is missing in .env');
    process.exit(1);
}

const seedData = async () => {
    try {
        console.log('🔄 Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        // 1. Seed Admin User
        console.log('👤 Seeding Admin User...');
        const existingAdmin = await User.findOne({ email: 'admin@masterstroke.com' });
        let adminId;
        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = await User.create({
                full_name: 'Master Admin',
                email: 'admin@masterstroke.com',
                password: hashedPassword,
                role: 'admin',
                phone: '9999999999',
                status: 'Active'
            });
            adminId = admin._id;
            console.log('✅ Admin Created (Email: admin@masterstroke.com, Pass: admin123)');
        } else {
            adminId = existingAdmin._id;
            console.log('ℹ️ Admin already exists');
        }

        // 2. Seed Segments
        console.log('Layers Seeding Segments...');
        const segments = [
            { name: 'Equity Intraday', code: 'EQUITY' },
            { name: 'Futures & Options', code: 'FNO' },
            { name: 'Commodity', code: 'COMMODITY' },
            { name: 'Currency', code: 'CURRENCY' },
            { name: 'Crypto', code: 'CRYPTO' }
        ];

        for (const seg of segments) {
            await Segment.findOneAndUpdate({ code: seg.code }, seg, { upsert: true });
        }
        console.log('✅ Segments Seeded');

        // 3. Seed Popular Master Symbols (Watchlist Ready)
        console.log('📈 Seeding Popular Symbols...');
        const symbols = [
            { symbol: 'NSE:NIFTY50-INDEX', name: 'Nifty 50', segment: 'FNO', exchange: 'NSE', lotSize: 50, tickSize: 0.05 },
            { symbol: 'NSE:NIFTYBANK-INDEX', name: 'Nifty Bank', segment: 'FNO', exchange: 'NSE', lotSize: 15, tickSize: 0.05 },
            { symbol: 'NSE:RELIANCE-EQ', name: 'Reliance Industries', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:TCS-EQ', name: 'Tata Consultancy Services', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'BINANCE:BTCUSDT', name: 'Bitcoin USDT', segment: 'CRYPTO', exchange: 'BINANCE', lotSize: 1, tickSize: 0.01 },
            { symbol: 'MCX:CRUDEOIL24JANFUT', name: 'Crude Oil Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 100, tickSize: 1.0 }
        ];

        for (const sym of symbols) {
            await MasterSymbol.findOneAndUpdate({ symbol: sym.symbol }, sym, { upsert: true });
        }
        console.log('✅ Popular Symbols Seeded');

        // 4. Seed Default Hybrid Strategy
        console.log('🤖 Seeding Hybrid Strategy...');
        const existingStrategy = await Strategy.findOne({ name: 'Hybrid Strategy', isSystem: true });
        if (!existingStrategy) {
            await Strategy.create({
                user: adminId,
                name: 'Hybrid Strategy',
                symbol: 'NSE:NIFTYBANK-INDEX',
                timeframe: '5m',
                segment: 'FNO',
                status: 'Active',
                isSystem: true,
                isDefault: true,
                logic: {
                    condition: 'AND',
                    rules: [
                        { indicator: 'Supertrend', params: { period: 10, multiplier: 3 }, operator: 'CROSS_ABOVE', value: 0 },
                        { indicator: 'PSAR', params: { step: 0.02, max: 0.2 }, operator: '<', value: 'CLOSE' }
                    ]
                }
            });
            console.log('✅ Hybrid Strategy Activated');
        } else {
            console.log('ℹ️ Hybrid Strategy already exists');
        }

        console.log('\n🚀 ALL DONE! Your Atlas DB is now ready for Live Market.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        process.exit(1);
    }
};

seedData();
