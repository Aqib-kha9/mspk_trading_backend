
import mongoose from 'mongoose';
import 'dotenv/config'; // Requires node -r dotenv/config or just running from root where .env is
import User from '../src/models/User.js';

const makeAdmin = async () => {
    try {
        const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/mspk_trading';
        await mongoose.connect(mongoUrl);
        console.log(`Connected to MongoDB successfully at ${mongoUrl}`);

        const email = 'cid@gmail.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.error(`User with email ${email} not found!`);
            process.exit(1);
        }

        user.role = 'admin';
        await user.save();
        
        console.log(`✅ User ${user.name} (${user.email}) is now an ADMIN.`);

    } catch (error) {
        console.error('Error updating user:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

makeAdmin();
