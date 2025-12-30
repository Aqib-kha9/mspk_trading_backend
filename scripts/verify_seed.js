
import mongoose from 'mongoose';
import 'dotenv/config'; // Requires node -r dotenv/config or just running from root where .env is
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Ticket from '../src/models/Ticket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const verify = async () => {
    try {
        if (!process.env.MONGODB_URL) {
            console.error('MONGODB_URL missing');
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGODB_URL);
        const count = await Ticket.countDocuments();
        console.log(`VERIFICATION RESULT: Found ${count} tickets.`);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

verify();
