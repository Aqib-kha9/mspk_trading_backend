import { fyersService } from '../src/services/fyers.service.js';
import Setting from '../src/models/Setting.js';
import connectDB from '../src/config/database.js';
import { decrypt } from '../src/utils/encryption.js';
import logger from '../src/config/logger.js';
import dotenv from 'dotenv';
dotenv.config();

const verifyConnection = async () => {
    try {
        await connectDB();
        
        // 1. Get Token from DB
        const setting = await Setting.findOne({ key: 'fyers_access_token' });
        if (!setting) {
            console.error('❌ No Access Token found in DB. Run login flow first.');
            process.exit(1);
        }
        
        const token = decrypt(setting.value);
        console.log('✅ Access Token Found length:', token.length);

        // 2. Init Service
        const appId = process.env.FYERS_APP_ID;
        fyersService.initialize(appId, process.env.FYERS_SECRET_ID);
        fyersService.setAccessToken(token);

        // 3. Test Profile Fetch (Raw fetch as SDK method might differ)
        // Using raw fetch to be safe
        console.log('Fetching Profile...');
        const profileUrl = 'https://api-t1.fyers.in/api/v3/profile'; // Profile endpoint
        
        const response = await fetch(profileUrl, {
            headers: {
                'Authorization': `${appId}:${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.s === 'ok') {
           console.log('\n✅ CONNECTION SUCCESSFUL!');
           console.log('User:', data.data.name);
           console.log('ID:', data.data.fy_id);
           console.log('Email:', data.data.email_id);
        } else {
            console.error('❌ Profile Fetch Failed:', data);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Verification Error:', error);
        process.exit(1);
    }
};

verifyConnection();
