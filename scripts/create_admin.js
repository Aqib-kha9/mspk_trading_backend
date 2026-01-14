import mongoose from 'mongoose';
import User from '../src/models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;
console.log('Connecting to:', MONGO_URI);

mongoose.connect(MONGO_URI).then(() => {
  console.log('Connected to MongoDB');
  createAdmin();
}).catch(err => {
    console.error('DB Connection Failed:', err);
    process.exit(1);
});

const createAdmin = async () => {
  try {
    const email = 'admin@masterstroke.com';
    const password = 'admin123';

    const existingUser = await User.findOne({ email });

    if (existingUser) {
        console.log('Admin already exists.');
        existingUser.password = password; 
        existingUser.role = 'admin';
        await existingUser.save();
        console.log(`Admin password reset to: ${password}`);
    } else {
        await User.create({
            name: 'Master Admin',
            email,
            password,
            role: 'admin',
            isEmailVerified: true,
            status: 'Active'
        });
        console.log('Admin created successfully');
    }
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};
