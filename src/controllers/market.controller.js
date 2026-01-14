import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import MasterSegment from '../models/MasterSegment.js';
import MasterSymbol from '../models/MasterSymbol.js';
import config from '../config/config.js';
import logger from '../config/logger.js';

// Seed Data (Standard Set)
import marketDataService from '../services/marketData.service.js';
import { kiteService } from '../services/kite.service.js';
import { upstoxService } from '../services/upstox.service.js';
import { fyersService } from '../services/fyers.service.js';

const SEED_SEGMENTS = [
    { name: 'Equity Intraday', code: 'EQUITY' },
    { name: 'Futures & Options', code: 'FNO' },
    { name: 'Commodity', code: 'COMMODITY' },
    { name: 'Currency', code: 'CURRENCY' },
    { name: 'BTST (Buy Today Sell Tomorrow)', code: 'BTST' }
];

const SEED_SYMBOLS = [
    { symbol: 'NSE:NIFTY50-INDEX', name: 'Nifty 50 Index', segment: 'FNO', exchange: 'NSE', lotSize: 50 },
    { symbol: 'NSE:NIFTYBANK-INDEX', name: 'Nifty Bank Index', segment: 'FNO', exchange: 'NSE', lotSize: 15 },
    { symbol: 'NSE:FINNIFTY-INDEX', name: 'Nifty Fin Services', segment: 'FNO', exchange: 'NSE', lotSize: 40 },
    { symbol: 'NSE:RELIANCE-EQ', name: 'Reliance Industries', segment: 'EQUITY', exchange: 'NSE', lotSize: 1 },
    { symbol: 'NSE:TCS-EQ', name: 'Tata Consultancy Svcs', segment: 'EQUITY', exchange: 'NSE', lotSize: 1 },
    { symbol: 'MCX:CRUDEOIL24JANFUT', name: 'Crude Oil Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 100 },
    { symbol: 'MCX:GOLD24FEBVAR', name: 'Gold Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 100 },
    { symbol: 'CDS:USDINR24JANFUT', name: 'USD INR', segment: 'CURRENCY', exchange: 'CDS', lotSize: 1000 },
];

const seedMarketData = catchAsync(async (req, res) => {
    // 1. Seed Segments
    const segCount = await MasterSegment.countDocuments();
    if (segCount === 0) {
        await MasterSegment.insertMany(SEED_SEGMENTS);
    }

    // 2. Seed Symbols
    const symCount = await MasterSymbol.countDocuments();
    if (symCount === 0) {
        await MasterSymbol.insertMany(SEED_SYMBOLS);
    }

    res.status(httpStatus.CREATED).send({ message: 'Market Master Data Seeded Successfully' });
});

const createSegment = catchAsync(async (req, res) => {
    const { name, code } = req.body;
    const segment = await MasterSegment.create({ name, code });
    res.status(httpStatus.CREATED).send(segment);
});

const updateSegment = catchAsync(async (req, res) => {
    const { id } = req.params;
    const segment = await MasterSegment.findByIdAndUpdate(id, req.body, { new: true });
    res.send(segment);
});

const createSymbol = catchAsync(async (req, res) => {
    const symbol = await MasterSymbol.create(req.body);
    res.status(httpStatus.CREATED).send(symbol);
});

const updateSymbol = catchAsync(async (req, res) => {
    const { id } = req.params;
    const symbol = await MasterSymbol.findByIdAndUpdate(id, req.body, { new: true });
    res.send(symbol);
});

const getSegments = catchAsync(async (req, res) => {
    const segments = await MasterSegment.find(); // Return all, let frontend filter active if needed or admin sees all
    res.send(segments);
});

const getSymbols = catchAsync(async (req, res) => {
    const { segment } = req.query;
    const filter = {};
    if (segment) filter.segment = segment;
    
    // Sort by symbol name
    const symbols = await MasterSymbol.find(filter).sort({ symbol: 1 });
    res.send(symbols);
});

import Signal from '../models/Signal.js'; // Import Signal Model

// ... existing code ...

const deleteSegment = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    // 1. Find the segment first
    const segment = await MasterSegment.findById(id);
    if (!segment) {
        return res.status(httpStatus.NOT_FOUND).send({ message: 'Segment not found' });
    }

    // 2. Check dependencies (Symbols)
    const symbolCount = await MasterSymbol.countDocuments({ segment: segment.code });
    if (symbolCount > 0) {
        return res.status(httpStatus.BAD_REQUEST).send({ 
            message: `Cannot delete. ${symbolCount} symbols are linked to this segment.` 
        });
    }

    // 3. Check dependencies (Signals)
    const signalCount = await Signal.countDocuments({ segment: segment.code });
    if (signalCount > 0) {
        return res.status(httpStatus.BAD_REQUEST).send({ 
            message: `Cannot delete. ${signalCount} active signals are linked to this segment.` 
        });
    }

    // 4. Safe to delete
    await MasterSegment.findByIdAndDelete(id);
    res.status(httpStatus.NO_CONTENT).send();
});

const deleteSymbol = catchAsync(async (req, res) => {
    const { id } = req.params;

    // 1. Find the symbol
    const symbol = await MasterSymbol.findById(id);
    if (!symbol) {
         return res.status(httpStatus.NOT_FOUND).send({ message: 'Symbol not found' });
    }

    // 2. Check dependencies (Signals)
    // We check if any Signal uses this symbol directly (by string name)
    const signalCount = await Signal.countDocuments({ symbol: symbol.symbol });
    if (signalCount > 0) {
        return res.status(httpStatus.BAD_REQUEST).send({ 
            message: `Cannot delete. ${signalCount} active signals are using this symbol.` 
        });
    }

    // 3. Delete
    await MasterSymbol.findByIdAndDelete(id);
    res.status(httpStatus.NO_CONTENT).send();
});

const handleLogin = catchAsync(async (req, res) => {
    const { provider } = req.params;
    const payload = req.body; // { request_token } or { code }
    
    try {
        const session = await marketDataService.handleLogin(provider, payload);
        res.send(session);
    } catch (error) {
        res.status(httpStatus.BAD_REQUEST).send({ message: error.message });
    }
});

const handleLoginCallback = catchAsync(async (req, res) => {
    const { provider } = req.params;
    console.log(`\n--- CALLBACK RECEIVED [${provider}] ---`);
    console.log('Original URL:', req.originalUrl);
    console.log('Query Params:', req.query);

    const { code, request_token, auth_code } = req.query; // standard oauth params
    
    const finalCode = code || request_token || auth_code;
    
    if (!finalCode) {
        console.error('❌ Missing Code in Query params');
        return res.status(httpStatus.BAD_REQUEST).send(`
            <h1>Login Failed</h1>
            <p>No 'code' found in URL.</p>
            <p>Debug Data:</p>
            <pre>${JSON.stringify(req.query, null, 2)}</pre>
            <p>Ensure you did not remove parameters from the URL.</p>
        `);
    }

    try {
        await marketDataService.handleLogin(provider, { code: finalCode, request_token: finalCode });
        res.send('<h1>Login Successful!</h1><p>Token Generated. You can close this window.</p>');
    } catch (error) {
        console.error('Login Handling Error:', error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).send(`Login Failed: ${error.message}`);
    }
});

const getLoginUrl = catchAsync(async (req, res) => {
    const { provider } = req.params;
    
    // Ensure service uses latest settings
    await marketDataService.loadSettings();
    
    // Validate Provider
    let adapter = null;
    if (provider === 'kite') adapter = kiteService;
    else if (provider === 'upstox') adapter = upstoxService;
    else if (provider === 'fyers') adapter = fyersService;
    else return res.status(httpStatus.BAD_REQUEST).send({ message: 'Invalid Provider' });

    // Check if key is configured (using generic keys from settings)
    const apiKey = marketDataService.config.data_feed_api_key;
    const apiSecret = marketDataService.config.data_feed_api_secret; // Needed for some

    if (!apiKey) {
        return res.status(httpStatus.BAD_REQUEST).send({ message: 'API Key not configured' });
    }

    // Initialize specific adapter
    // For Login URL we typically only need API Key and Redirect URI
    // But generic init requires both usually.
    // Construct Redirect URI based on provider
    const redirectUri = `${req.protocol}://${req.get('host')}/market/login/${provider}/callback`; // e.g. NOT REAL ROUTE? 
    // Wait, the frontend handles redirect usually.
    // Let's assume the redirect_uri is fixed or backend generated.
    // Actually, for Kite it's set in App Console. For others passing it is allowed.
    // Let's use a standard localhost URI for now or what user configured.
    // Ideally user configures "Redirect URI" in settings but we don't have that field yet.
    // We will hardcode `http://localhost:5173/market/login/${provider}` (Frontend Route) as redirect.
    // OR backend route? Usually frontend receives code and POSTs to backend.
    
    const frontendCallback = `${config.frontendUrl}/market/login/${provider}`; // Frontend Page
    
    adapter.initialize(apiKey, apiSecret, frontendCallback);

    const url = adapter.getLoginUrl();
    res.send({ url });
});

const getHistory = catchAsync(async (req, res) => {
    const { symbol, resolution, from, to } = req.query;
    
    if (!symbol || !resolution || !from || !to) {
        return res.status(httpStatus.BAD_REQUEST).send({ message: 'Missing required parameters: symbol, resolution, from, to' });
    }

    logger.info(`History Request: ${symbol} (${resolution}) from ${from} to ${to}`);
    const history = await marketDataService.getHistory(symbol, resolution, from, to);
    res.send(history);
});

const searchInstruments = catchAsync(async (req, res) => {
    const { q } = req.query;
    const instruments = await marketDataService.searchInstruments(q);
    res.send(instruments);
});

export default {
    seedMarketData,
    getSegments,
    createSegment,
    deleteSegment,
    updateSegment,
    getSymbols,
    createSymbol,
    updateSymbol,
    deleteSymbol,
    handleLogin,
    handleLoginCallback,
    getLoginUrl,
    getHistory,
    searchInstruments,
    getMarketStats: (req, res) => {
        const stats = marketDataService.getStats();
        res.send(stats);
    }
};
