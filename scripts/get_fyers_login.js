import dotenv from 'dotenv';
dotenv.config(); 
import { fyersService } from '../src/services/fyers.service.js';

const start = () => {
    const appId = process.env.FYERS_APP_ID;
    const secret = process.env.FYERS_SECRET_ID;
    const redirect = process.env.FYERS_REDIRECT_URI;
    
    console.log('App ID Configured:', appId);

    if(!appId || !secret) { 
        console.error('❌ Missing Credentials in .env'); 
        return; 
    }

    fyersService.initialize(appId, secret, redirect);
    const url = fyersService.getLoginUrl();
    
    console.log('\n=============================================');
    console.log('🔐 FYERS LOGIN LINK');
    console.log('=============================================');
    console.log(url);
    console.log('=============================================\n');
}

start();
