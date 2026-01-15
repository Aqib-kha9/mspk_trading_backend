
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
        console.log('Missing credentials in DB');
        process.exit(1);
    }

    const appId = decrypt(appIdSetting.value);
    const token = decrypt(tokenSetting.value);

    const urls = [
        'https://api-t1.fyers.in/data/history',
        'https://api.fyers.in/data-rest/v2/history',
        'https://api.fyers.in/data/history',
        'https://api-t1.fyers.in/data/history-v3'
    ];

    const symbol = 'NSE:NIFTYBANK-INDEX';
    const resolution = '5';
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0];

    for (const baseUrl of urls) {
        const url = `${baseUrl}?symbol=${symbol}&resolution=${resolution}&date_format=1&range_from=${from}&range_to=${to}&cont_flag=1`;
        console.log(`\nTesting ${url}...`);
        
        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `${appId}:${token}` }
            });
            const text = await res.text();
            console.log(`Status: ${res.status}`);
            console.log(`Content Type: ${res.headers.get('content-type')}`);
            console.log(`Response Snippet: ${text.substring(0, 500)}`);
            
            if (text.startsWith('{')) {
                const json = JSON.parse(text);
                if (json.s === 'ok') {
                    console.log('✅ WORKING URL FOUND CODE:', baseUrl);
                }
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
    process.exit(0);
}

check();
