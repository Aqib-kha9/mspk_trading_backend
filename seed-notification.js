import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './src/models/User.js';
import Notification from './src/models/Notification.js';
import pushService from './src/services/channels/push.service.js';
import { initializeFirebase } from './src/config/firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const seedNotification = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB.');

        // Initialize Firebase
        initializeFirebase();

        // 1. Find a user with FCM tokens
        const user = await User.findOne({ fcmTokens: { $exists: true, $not: { $size: 0 } } });

        if (!user) {
            console.error('❌ No user found with FCM tokens. Please log in to the app first.');
            process.exit(1);
        }

        console.log(`Target User: ${user.name} (${user.email})`);

        // 2. Create Database Notification Record
        const dbNotification = await Notification.create({
            user: user._id,
            title: 'Welcome to MS PK Trading 🚀',
            message: 'Bhai, aapka push notification system ab live hai! Check kijiye.',
            type: 'SYSTEM',
            isRead: false,
            data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                type: 'SYSTEM_TEST'
            }
        });

        console.log(`✅ Database Record Created: ${dbNotification._id}`);

        // 3. Send Push Notification
        console.log(`Sending Push to ${user.fcmTokens.length} tokens...`);
        const pushSuccess = await pushService.sendPushNotification(
            user.fcmTokens,
            dbNotification.title,
            dbNotification.message,
            dbNotification.data
        );

        if (pushSuccess) {
            console.log('🔥 Push Notification sent successfully!');
        } else {
            console.warn('⚠️ Push service returned failure. Check Firebase logs.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error in seeding script:', error);
        process.exit(1);
    }
};

seedNotification();
