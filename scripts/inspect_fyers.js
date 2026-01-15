import fyers from 'fyers-api-v3';
console.log('Fyers Exports:', fyers);
console.log('Keys:', Object.keys(fyers));
try {
    const socket = new fyers.fyersSocket('test');
    console.log('Socket instantiated');
} catch (e) {
    console.log('Socket instantiation failed:', e.message);
}
