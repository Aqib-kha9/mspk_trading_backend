import { fyersService } from './src/services/fyers.service.js';
import Setting from './src/models/Setting.js';
import connectDB from './src/config/database.js';
import { encrypt } from './src/utils/encryption.js';
import dotenv from 'dotenv';
dotenv.config();

const setToken = async () => {
    const args = process.argv.slice(2);
    const authCode = args[0];

    if (!authCode) {
        console.error('❌ Please provide the Auth Code as an argument.');
        console.error('Usage: node set_fyers_token.js <YOUR_AUTH_CODE>');
        process.exit(1);
    }
    
    // Manually override redirect for this script
    process.env.FYERS_REDIRECT_URI = 'https://www.google.com';

    try {
        await connectDB();
        const appId = process.env.FYERS_APP_ID;
        const secret = process.env.FYERS_SECRET_ID;
        
        console.log('Using Creds:', appId, 'Redirect:', process.env.FYERS_REDIRECT_URI);

        fyersService.initialize(appId, secret, process.env.FYERS_REDIRECT_URI);
        
        console.log('Generating Session for Code:', authCode.substring(0, 10) + '...');
        const response = await fyersService.generateSession(authCode);

        console.log('✅ Token Generated:', response.access_token.substring(0, 10) + '...');

        // Save to DB
        await Setting.findOneAndUpdate(
             { key: 'fyers_access_token' },
             { key: 'fyers_access_token', value: encrypt(response.access_token), description: 'Fyers Access Token' },
             { upsert: true }
        );
        
        console.log('✅ Token Saved to Database. You can now restart the server!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed:', error.message);
        if(error.response) console.error('API Response:', error.response.data);
        process.exit(1);
    }
};

setToken();
