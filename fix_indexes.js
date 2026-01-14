import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const url = process.env.MONGO_URI;

async function fix() {
    console.log('Connecting to:', url);
    try {
        await mongoose.connect(url);
        const db = mongoose.connection.db;
        
        // The error mentioned 'test.settings'
        // Let's try to drop the index in the current DB first
        const collections = await db.listCollections().toArray();
        const settingsExists = collections.some(c => c.name === 'settings');
        
        if (settingsExists) {
            const collection = db.collection('settings');
            const indexes = await collection.indexes();
            console.log('Current Database:', mongoose.connection.db.databaseName);
            console.log('Indexes found:', indexes.map(i => i.name));
            
            if (indexes.some(i => i.name === 'type_1')) {
                console.log('Dropping type_1 index...');
                await collection.dropIndex('type_1');
                console.log('✅ Successfully dropped type_1 index.');
            }
        }

        // Also check specifically for 'test' database if current is different
        if (mongoose.connection.db.databaseName !== 'test') {
             console.log('Checking "test" database specifically...');
             const testDb = mongoose.connection.client.db('test');
             const testCollections = await testDb.listCollections().toArray();
             if (testCollections.some(c => c.name === 'settings')) {
                 const testColl = testDb.collection('settings');
                 const testIndexes = await testColl.indexes();
                 console.log('Test DB Indexes:', testIndexes.map(i => i.name));
                 if (testIndexes.some(i => i.name === 'type_1')) {
                     console.log('Dropping type_1 index from test database...');
                     await testColl.dropIndex('type_1');
                     console.log('✅ Successfully dropped type_1 index from test database.');
                 }
             }
        }

        console.log('Index cleanup complete.');
    } catch (e) {
        console.error('Error during cleanup:', e);
    } finally {
        process.exit(0);
    }
}

fix();
