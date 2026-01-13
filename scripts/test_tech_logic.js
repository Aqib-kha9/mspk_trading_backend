import technicalAnalysisService from '../src/services/technicalAnalysis.service.js';

console.log("TESTING CUSTOM SUPERTREND LOGIC");

// 1. Create a mock candle series (Uptrend)
const candles = [];
let price = 100;
for(let i=0; i<20; i++) {
    price += 2; // steady rise
    candles.push({
        high: price + 1,
        low: price - 1,
        close: price,
        open: price - 0.5
    });
}

// 2. Run Supertrend
const st = technicalAnalysisService.calculateSupertrend(candles, 10, 3);
console.log(`Candles: ${candles.length}`);
console.log(`Last Close: ${candles[candles.length-1].close}`);
console.log(`Supertrend Value: ${st.value.toFixed(2)}`);
console.log(`Supertrend Trend: ${st.trend} (Expected 1)`);

// 3. Create Downtrend
for(let i=0; i<20; i++) {
    price -= 5; // sharp drop
    candles.push({
        high: price + 1,
        low: price - 1,
        close: price,
        open: price + 0.5
    });
}

const st2 = technicalAnalysisService.calculateSupertrend(candles, 10, 3);
console.log(`\nAfter Drop:`);
console.log(`Last Close: ${candles[candles.length-1].close}`);
console.log(`Supertrend Value: ${st2.value.toFixed(2)}`);
console.log(`Supertrend Trend: ${st2.trend} (Expected -1)`);

if (st.trend === 1 && st2.trend === -1) {
    console.log("\n✅ SUCCESS: Supertrend flipped correctly.");
} else {
    console.log("\n❌ EXCEPTION: Trend logic failed.");
}
