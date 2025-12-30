
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Ticket from '../src/models/Ticket.js';
import User from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
// Adjusted path to point to root .env
dotenv.config({ path: join(__dirname, '../.env') });

const seedTickets = async () => {
    try {
        console.log('Connecting to MongoDB...');
        // Ensure MONGO_URI is loaded or use default
        const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/mspk_trading';
        
        await mongoose.connect(mongoUrl);
        console.log(`Connected to MongoDB successfully at ${mongoUrl}`);

        // Find specific user 'akki' (cid@gmail.com) to ensure visibility
        let user = await User.findOne({ email: 'cid@gmail.com' });
        
        if (!user) {
             console.log('User cid@gmail.com not found, trying any user...');
             user = await User.findOne();
        }

        if (!user) {
            console.log('No user found. Creating test user...');
            user = await User.create({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
                role: 'user'
            });
        }
        
        console.log(`Seeding tickets for user: ${user.name} (${user.email}) ID: ${user._id}`);

        console.log('Clearing existing tickets...');
        await Ticket.deleteMany({}); // Optional: clear old tickets to avoid duplicates if re-running

        console.log('Creating new tickets...');
        const tickets = [
            {
                ticketId: `TKT-${Date.now()}-1`,
                user: user._id,
                subject: 'Login Issue on Mobile App',
                category: 'TECHNICAL',
                priority: 'HIGH',
                status: 'OPEN',
                messages: [
                    {
                        sender: 'USER',
                        message: 'I cannot login to the mobile app. It keeps saying "Network Error".',
                        timestamp: new Date()
                    }
                ]
            },
            {
                ticketId: `TKT-${Date.now()}-2`,
                user: user._id,
                subject: 'Billing Question',
                category: 'PAYMENT',
                priority: 'MEDIUM',
                status: 'IN_PROGRESS',
                messages: [
                    {
                        sender: 'USER',
                        message: 'Why was I charged twice?',
                        timestamp: new Date()
                    },
                    {
                         sender: 'ADMIN',
                         message: 'Checking your transaction history.',
                         timestamp: new Date()
                    }
                ]
            }
        ];

        await Ticket.insertMany(tickets);
        console.log('✓ Tickets seeded successfully!');
        
        // Verify count
        const count = await Ticket.countDocuments();
        console.log(`Total Tickets in DB: ${count}`);

    } catch (error) {
        console.error('❌ Error seeding tickets:', error);
        // Log full error details
        if (error.reason) console.error('Reason:', error.reason);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit(0);
    }
};

seedTickets();
