import { fyersService } from './src/services/fyers.service.js';

async function testMockBroker() {
    console.log('Testing Mock Broker Integration...');
    
    fyersService.initialize('mock_app', 'mock_secret');
    
    // Test login flow
    const url = fyersService.getLoginUrl();
    console.log('Login URL:', url);
    
    const session = await fyersService.generateSession('mock_auth_code');
    console.log('Session:', session);
    
    // Test Ticker
    console.log('Connecting Ticker...');
    fyersService.connectTicker((ticks) => {
        console.log('Mock Tick Received:', ticks[0]);
        if(ticks.length > 2) process.exit(0); // Exit after a few ticks
    }, () => {
        console.log('Ticker Connected!');
        fyersService.subscribe(['NSE:SBIN-EQ']);
    });
}
// Set env var just for this run if not set
process.env.USE_MOCK_BROKER = 'true';
testMockBroker();
