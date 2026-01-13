import connectDB from './src/config/database.js';
import EconomicEvent from './src/models/EconomicEvent.js';
import logger from './src/config/logger.js';

const checkData = async () => {
    try {
        await connectDB();
        const events = await EconomicEvent.find().sort({ date: 1 }).limit(5);
        
        console.log('\n--- VERIFIED: Economic Data in DB ---');
        console.log(`Total Events Found: ${await EconomicEvent.countDocuments()}`);
        console.log('Sample Events:');
        events.forEach(e => {
            console.log(`[${e.date.toISOString().split('T')[0]}] ${e.country} ${e.event} | Impact: ${e.impact} | Est: ${e.forecast}`);
        });
        console.log('-------------------------------------\n');
        
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkData();
