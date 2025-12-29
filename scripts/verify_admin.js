import mongoose from 'mongoose';
import User from '../src/models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mspk_trading';

mongoose.connect(MONGO_URI).then(async () => {
  console.log('Connected to MongoDB');
  
  const email = 'admin@masterstroke.com';
  const password = 'admin123';
  
  const user = await User.findOne({ email });
  if (!user) {
      console.log('User NOT found!');
  } else {
      console.log('User found:', user.email, user.role);
      // Manually check password
      const isMatch = await user.matchPassword(password);
      console.log('Password match check:', isMatch);
  }
  
  mongoose.disconnect();
}).catch(err => {
    console.error(err);
});
