import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Signal from '../src/models/Signal.js';
// import logger from '../src/config/logger.js'; // Use console for script simplicity

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env explicitly
dotenv.config({ path: path.join(__dirname, '../.env') });

const mapSignalToCategory = (signal) => {
  const { symbol, segment } = signal;
  const sym = symbol ? symbol.toUpperCase() : '';
  const seg = segment ? segment.toUpperCase() : '';

  if (sym.includes('NIFTY') && !sym.includes('BANK') && !sym.includes('FIN')) return 'NIFTY_OPT';
  if (sym.includes('BANKNIFTY')) return 'BANKNIFTY_OPT';
  if (sym.includes('FINNIFTY')) return 'FINNIFTY_OPT';
  if (seg === 'MCX' || seg === 'COMMODITY') return 'MCX_FUT';
  if (seg === 'CDS' || seg === 'CURRENCY') return 'CURRENCY';
  if (seg === 'CRYPTO') return 'CRYPTO';
  if (seg === 'EQ' || seg === 'EQUITY') return 'EQUITY_INTRA'; // Default to Intra
  
  return 'EQUITY_INTRA'; // Fallback
};

const fixSignals = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in .env');
    }
    // New Mongoose versions don't need these options
    await mongoose.connect(mongoUri); 
    console.log('Connected to MongoDB: ' + mongoUri);

    const signals = await Signal.find({}); // Fetch ALL and check missing category logic
    console.log(`Checking ${signals.length} signals for missing category...`);

    let updatedCount = 0;
    for (const signal of signals) {
      if (!signal.category || signal.category === '') {
          const newCategory = mapSignalToCategory(signal);
          signal.category = newCategory;
          await signal.save({ validateBeforeSave: false });
          process.stdout.write('.');
          updatedCount++;
      }
    }

    console.log('\nMigration complete.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed', error);
    process.exit(1);
  }
};

fixSignals();
