import mongoose from 'mongoose';
import dotenv from 'dotenv';
import signalService from './src/services/signal.service.js';
import User from './src/models/User.js';

dotenv.config();

const seedTestSignal = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.error('No admin user found to attribute the signal to.');
      process.exit(1);
    }

    const testSignal = {
      symbol: 'BTCUSD',
      type: 'BUY',
      segment: 'CRYPTO',
      entryPrice: 95000,
      targets: {
        target1: 96000,
        target2: 97000,
        target3: 98000
      },
      stopLoss: 94000,
      timeframe: '15m',
      status: 'Active',
      notes: 'Test signal for push notification verification.'
    };

    console.log('Creating test signal...');
    const signal = await signalService.createSignal(testSignal, adminUser);
    console.log('Test Signal Created Successfully:', signal._id);
    
    console.log('Signal published to Redis. Please check the notification worker logs and your device.');
    
    // Give it a moment to process before exiting
    setTimeout(() => {
        mongoose.connection.close();
        process.exit(0);
    }, 2000);

  } catch (error) {
    console.error('Error seeding test signal:', error);
    process.exit(1);
  }
};

seedTestSignal();
