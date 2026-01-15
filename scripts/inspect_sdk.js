
import fyers from 'fyers-api-v3';
import dotenv from 'dotenv';
import connectDB from '../src/config/database.js';
import Setting from '../src/models/Setting.js';
import { decrypt } from '../src/utils/encryption.js';

dotenv.config();

async function check() {
    await connectDB();
    const appIdSetting = await Setting.findOne({ key: 'fyers_api_key' });
    const tokenSetting = await Setting.findOne({ key: 'fyers_access_token' });
    
    if (!appIdSetting || !tokenSetting) {
        process.exit(1);
    }

    const appId = decrypt(appIdSetting.value);
    const token = decrypt(tokenSetting.value);

    const model = new fyers.fyersModel();
    model.setAppId(appId);
    model.setAccessToken(token);

    try {
        const symbol = 'NSE:NIFTYBANK-INDEX';
        const resolution = '5';
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0];

        const params = {
            symbol: symbol,
            resolution: resolution,
            date_format: '1',
            range_from: from,
            range_to: to,
            cont_flag: '1'
        };

        console.log(`Testing getHistory for ${symbol}...`);
        const data = await model.getHistory(params);
        console.log('History Status:', data.s);
        if (data.candles) {
            console.log('Candle Count:', data.candles.length);
            console.log('First Candle:', JSON.stringify(data.candles[0]));
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
    process.exit(0);
}

check();
