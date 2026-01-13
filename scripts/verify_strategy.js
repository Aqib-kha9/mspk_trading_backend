import hybridStrategyService from '../src/services/hybridStrategy.service.js';
import marketDataService from '../src/services/marketData.service.js';

console.log("🚀 Starting Verification Script...");

// Mock Socket IO
// We need to mocking getIo if we want to avoid errors, but the service has a try/catch.

// 1. Start Service
hybridStrategyService.start();

// 2. Listen for Updates
hybridStrategyService.on('strategy_update', (data) => {
    console.log(`\nStrategy Update for ${data.symbol}:`);
    console.log(`Price: ${data.price}`);
    console.log(`Supertrend: ${data.supertrend.trend} (${data.supertrend.value.toFixed(2)})`);
    console.log(`PSAR: ${data.psar.trend} (${data.psar.value.toFixed(2)})`);
    console.log(`Structure: ${data.structure}`);
    if (data.lastSignal) {
        console.log(`SIGNAL: ${data.lastSignal.type}`);
    }
});

// 3. Inject Mock Ticks (Simulate Uptrend)
console.log("💉 Injecting Ticks...");

const symbol = 'TEST_SYM';
let price = 100;

// Simulate 30 minutes of data (30 candles)
// We need enough candles to trigger supertrend (period 10)
const simulate = async () => {
    for (let i = 0; i < 50; i++) {
        // Create an uptrend
        price += (Math.random() * 2); 
        
        // High/Low deviation
        const tick = {
            symbol,
            price: price,
            timestamp: new Date().getTime() + (i * 60 * 1000) // Forward time
        };

        // We need to trick the service into thinking time passed if it uses Date.now()
        // The service uses tick timestamp for candle logic?
        // Checked code: uses `tick.timestamp` for candle bucketing. Good.
        
        // But `processSignal` uses `new Date()`. This might block signals in test due to debouncing if we run fast.
        // That's fine for now, we just want to see indicators calculating.

        hybridStrategyService.handleTick(tick);
        
        await new Promise(r => setTimeout(r, 100)); // Small delay to read logs
    }
};

simulate();
