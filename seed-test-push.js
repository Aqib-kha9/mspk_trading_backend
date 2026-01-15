import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './src/models/User.js';
import pushService from './src/services/channels/push.service.js';
import { initializeFirebase } from './src/config/firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const seedTestPush = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    // Initialize Firebase Admin
    initializeFirebase();

    // Find the first user with an FCM token
    const user = await User.findOne({ fcmTokens: { $exists: true, $not: { $size: 0 } } });

    if (!user) {
      console.error('No user found with a valid FCM token in the database.');
      process.exit(1);
    }

    console.log(`Sending test notification to user: ${user.name} (${user.email})`);
    console.log(`FCM Tokens found: ${user.fcmTokens.length}`);

    const payload = {
      title: 'Test Notification 🚀',
      body: 'Bhai, yeh ek test push notification hai aapke mobile app ke liye!',
      data: {
        type: 'TEST',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      }
    };

    const success = await pushService.sendPushNotification(
      user.fcmTokens,
      payload.title,
      payload.body,
      payload.data
    );

    if (success) {
      console.log('✅ Push notification sent successfully!');
    } else {
      console.error('❌ Failed to send push notification.');
    }

    // Close connection after a short delay
    setTimeout(() => {
      mongoose.connection.close();
      process.exit(0);
    }, 2000);

  } catch (error) {
    console.error('Error seeding test push notification:', error);
    process.exit(1);
  }
};

seedTestPush();
