import { economicService } from '../src/services/economic.service.js';
import connectDB from '../src/config/database.js';
import logger from '../src/config/logger.js';

const seed = async () => {
    try {
        await connectDB();
        logger.info('Connected to DB. Starting Economic Data Seed...');

        // Fetch for this week
        const now = new Date();
        const from = new Date(now.setDate(now.getDate() - 2)).toISOString().split('T')[0];
        const to = new Date(now.setDate(now.getDate() + 5)).toISOString().split('T')[0];

        logger.info(`Seeding from ${from} to ${to}...`);
        
        await economicService.fetchAndStoreEvents(from, to);
        
        logger.info('✅ Economic Data Seeding Completed!');
        process.exit(0);
    } catch (error) {
        logger.error('Seeding Failed:', error);
        process.exit(1);
    }
};

seed();
