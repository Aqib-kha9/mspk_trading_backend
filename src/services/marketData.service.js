/**
 * Market Data Service (Hybrid: Simulation & Real)
 * Manages Data Feed from Kite Connect or Internal Simulation
 */
import EventEmitter from 'events';
import Setting from '../models/Setting.js';
import MasterSymbol from '../models/MasterSymbol.js';
import { kiteService } from './kite.service.js';
import { upstoxService } from './upstox.service.js';
import { fyersService } from './fyers.service.js';
import logger from '../config/logger.js';
import { decrypt, encrypt } from '../utils/encryption.js';

class MarketDataService extends EventEmitter {
    constructor() {
        super();
        this.mode = 'simulation'; // 'simulation' | 'live'
        this.symbols = {}; // Mock symbols mapping
        this.tokenMap = {}; // instrument_token -> symbol
        this.currentPrices = {};
        this.interval = null;
        
        // Stats tracking
        this.tickCount = 0;
        this.startTime = new Date();

        // 1. Load Initial Configuration
        this.init();
    }

    async init() {
        try {
            await this.loadSettings();
            await this.loadMasterSymbols();
            
            if (this.canGoLive()) {
                await this.startLiveFeed();
            } else {
                this.startSimulation();
            }

            // Periodic Stats Broadcast
            this.startStatsBroadcast();

        } catch (error) {
            logger.error('Failed to initialize MarketDataService', error);
            this.startSimulation(); // Fallback
        }
    }

    async loadSettings() {
        const settings = await Setting.find({ 
            key: { $regex: '^(data_feed_|kite_|upstox_|fyers_)' } 
        });
        
        this.config = {};
        
        settings.forEach(s => {
            // Decrypt if it's a secret key
            if (s.key.includes('api_key') || s.key.includes('api_secret') || s.key.includes('access_token')) {
                this.config[s.key] = decrypt(s.value);
            } else {
                this.config[s.key] = s.value;
            }
        });

        // Backward Compatibility / Normalization
        // Mapped generic keys to the specific provider's keys if generic keys are missing or provider switched
        const provider = this.config.data_feed_provider || 'kite';
        
        // Populate generic keys (used by some old logic or as fallback)
        // Ideally we should move away from generic data_feed_api_key in memory to specific ones
        // But for compatibility with existing methods:
        this.config.data_feed_api_key = this.config[`${provider}_api_key`];
        this.config.data_feed_api_secret = this.config[`${provider}_api_secret`];
        this.config.data_feed_access_token = this.config[`${provider}_access_token`];
        
        // Pre-load access token if available
        if (this.config.data_feed_access_token && provider === 'kite') {
            kiteService.setAccessToken(this.config.data_feed_access_token);
        }
    }

    async loadMasterSymbols() {
        const symbols = await MasterSymbol.find({ isActive: true });
        this.symbols = {};
        this.tokenMap = {};
        
        symbols.forEach(s => {
            // For simulation, we need base prices. 
            // In real app, we fetch from DB or history. 
            // Here we use defaults if not present.
            this.symbols[s.symbol] = { 
                base: 1000, 
                volatility: 10,
                instrumentToken: s.instrumentToken
            };
            
            if (s.instrumentToken) {
                this.tokenMap[s.instrumentToken] = s.symbol;
            }
            
            // Initialize mock price if not set
            if (!this.currentPrices[s.symbol]) {
                this.currentPrices[s.symbol] = 1000;
            }
        });
    }

    canGoLive() {
        // Check if keys exist
        if (this.config.data_feed_api_key && this.config.data_feed_api_secret) {
             return true; 
        }
        return false;
    }

    async startLiveFeed() {
        const provider = this.config.data_feed_provider || 'kite';
        logger.info(`Attempting to start LIVE Market Feed via ${provider.toUpperCase()}...`);
        
        try {
            // Factory Pattern
            switch (provider) {
                case 'kite': this.adapter = kiteService; break;
                case 'upstox': this.adapter = upstoxService; break;
                case 'fyers': this.adapter = fyersService; break;
                default: this.adapter = kiteService;
            }

            this.adapter.initialize(this.config.data_feed_api_key, this.config.data_feed_api_secret);
            
            // Set Access Token if available
            if (this.config.data_feed_access_token) {
                this.adapter.setAccessToken(this.config.data_feed_access_token);
                // Try connecting
                this.connectTicker();
            } else {
                logger.warn(`Live Feed (${provider}) Configured but NO Access Token. Waiting for Login...`);
                this.mode = 'simulation'; 
                this.startSimulation(); 
            }

        } catch (e) {
            logger.error(`Error starting live feed (${provider})`, e);
            this.startSimulation();
        }
    }

    connectTicker() {
        if (!this.adapter) return;
        
        this.adapter.connectTicker((ticks) => {
            this.processLiveTicks(ticks);
        }, () => {
            logger.info('Live Ticker Connected');
            this.mode = 'live';
            this.provider = this.config.data_feed_provider;
            
            // NEW: Fetch Initial Quotes/Snapshots
            this.fetchInitialQuotes().then(() => {
                this.stopSimulation();
                this.subscribeToSymbols();
            });
        });
    }

    async fetchInitialQuotes() {
        if (this.provider === 'fyers' && this.adapter.getQuotes) {
            const symbols = Object.values(this.tokenMap); // tokenMap stores Symbol Strings for Fyers if updated?
            // Actually tokenMap maps ID -> Symbol. 
            // Fyers needs Symbol Names.
            const symbolList = Object.keys(this.symbols); // This defaults to keys of this.symbols map
            const fyersSymbols = symbolList.filter(s => s.includes(':')); // Filter valid Fyers symbols e.g. NSE:SBIN-EQ
            
            if (fyersSymbols.length > 0) {
                logger.info(`Fetching Initial Quotes for ${fyersSymbols.length} symbols...`);
                const quotes = await this.adapter.getQuotes(fyersSymbols); // Returns { 'NSE:SBIN-EQ': 1400, ... }
                
                const updates = [];
                for (const [sym, price] of Object.entries(quotes)) {
                     if (price) {
                         this.currentPrices[sym] = price;
                         updates.push({ symbol: sym, price, timestamp: new Date() });
                         
                         // Optional: Update DB for persistence?
                         // await MasterSymbol.updateOne({ symbol: sym }, { lastPrice: price });
                     }
                }
                
                if (updates.length > 0) {
                    this.publishToRedis('market_data', updates);
                    logger.info(`Updated ${updates.length} symbols with Initial Quotes`);
                }
            }
        }
    }

    subscribeToSymbols() {
        if (!this.adapter) return;
        
        const provider = this.config.data_feed_provider || 'kite';
        
        if (provider === 'fyers' || provider === 'upstox') {
            // Fyers/Upstox usually prefer Symbol Strings e.g. ["NSE:SBIN-EQ"]
            const symbols = Object.keys(this.symbols).filter(s => s.includes(':'));
            if (symbols.length > 0) {
                this.adapter.subscribe(symbols);
                logger.info(`Subscribed to ${symbols.length} symbols using String Names [${provider}]`);
            }
        } else {
            // Kite uses Instrument Tokens (Numbers)
            const tokens = Object.keys(this.tokenMap);
            if (tokens.length > 0) {
                this.adapter.subscribe(tokens);
                logger.info(`Subscribed to ${tokens.length} tokens using ID [${provider}]`);
            }
        }
    }

    processLiveTicks(ticks) {
        // Normalize Ticks from Adapter
        // Adapters should optimally return uniform structure, or we normalize here.
        // For now Assuming Adapter emits array of objects with { instrument_token, last_price }
        
        const updates = [];
        ticks.forEach(tick => {
            let symbol = null;
            let price = 0;

            // Strategy 1: Map by Token
            if (tick.instrument_token && this.tokenMap[tick.instrument_token]) {
                symbol = this.tokenMap[tick.instrument_token];
                price = tick.last_price;
            } 
            // Strategy 2: Map by Symbol Name (if adapter sends symbol)
            else if (tick.symbol) {
                symbol = tick.symbol;
                price = tick.lp || tick.last_price; // Common fields
            }

            if (symbol) {
                this.currentPrices[symbol] = price;
                
                const update = {
                    symbol,
                    price,
                    timestamp: new Date(),
                    volume: tick.volume || 0
                };
                
                this.tickCount++;
                this.emit('price_update', update);
                updates.push(update);
            }
        });

        if (updates.length > 0) {
           this.publishToRedis('market_data', updates); // Batch publish ideally
        }
    }



    startSimulation() {
        if (this.interval) return;
        this.mode = 'simulation';
        logger.info('📡 Market Data Feed Started (MOCK SIMULATION)...');
        
        this.interval = setInterval(() => {
            this.simulateTick();
        }, 1000); 
    }

    stopSimulation() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    startStatsBroadcast() {
        setInterval(() => {
            const stats = this.getStats();
            this.publishToRedis('market_stats', stats);
        }, 2000);
    }

    publishToRedis(channel, data) {
         import('./redis.service.js').then(({ redisClient }) => {
            if(redisClient.status === 'ready') {
                redisClient.publish(channel, JSON.stringify(data));
            }
        }).catch(e => console.error(`Redis Publish Error ${channel}`, e));
    }

    simulateTick() {
        // ... (Existing Simulation Logic adapted to use loaded symbols)
        const updates = [];
        
        // Use Mock Symbols list (NIFTY/BANKNIFTY defaults if DB empty)
        // Use Mock Symbols list (Default to Frontend Demo Symbols if DB empty)
        const demoSymbols = ['SPX', 'NDQ', 'DJI', 'AAPL', 'TSLA', 'NVDA', 'BTC/USD', 'EUR/USD', 'GOLD', 'VIX'];
        // Merge DB symbols with Demo symbols to ensure frontend always has data
        const dbSymbols = Object.keys(this.symbols);
        const mockList = [...new Set([...dbSymbols, ...demoSymbols])];

        const defaultPrices = {
            'SPX': 4750, 'NDQ': 16800, 'DJI': 37500,
            'AAPL': 185, 'TSLA': 240, 'NVDA': 550,
            'BTC/USD': 45000, 'EUR/USD': 1.09, 'GOLD': 2040, 'VIX': 14.50
        };

        mockList.forEach(symbol => {
            // Ensure symbol exists in currentPrices if not in DB
            if (!this.currentPrices[symbol]) {
                this.currentPrices[symbol] = defaultPrices[symbol] || 1000;
            }
            
            const volatility = this.symbols[symbol]?.volatility || (symbol === 'EUR/USD' ? 0.0001 : 10);
            const change = (Math.random() - 0.5) * volatility;
            
            let price = (this.currentPrices[symbol] || 10000) + change;
            price = parseFloat(price.toFixed(2));
            this.currentPrices[symbol] = price;

            const tick = {
                symbol,
                price,
                timestamp: new Date(),
                volume: Math.floor(Math.random() * 500)
            };
            
            this.tickCount++;
            this.emit('price_update', tick);
            this.publishToRedis('market_data', tick);
            updates.push(tick);
        });
    }

    getStats() {
        return {
            tickCount: this.tickCount,
            startTime: this.startTime,
            uptime: Math.floor((new Date() - this.startTime) / 1000),
            symbolsCount: Object.keys(this.symbols).length,
            mode: this.mode,
            provider: this.config?.data_feed_provider || 'none'
        };
    }

    // --- Public API for Login ---
    async handleLogin(provider, payload) {
        await this.loadSettings();

        if (provider === 'kite') {
            return this.handleKiteLogin(payload.request_token || payload.code);
        } else if (provider === 'fyers') {
            return this.handleFyersLogin(payload.auth_code || payload.code);
        } else {
             throw new Error(`Login provider ${provider} not supported yet`);
        }
    }

    async handleFyersLogin(authCode) {
         if (!this.config.fyers || !this.config.fyers.appId) throw new Error('Fyers App Config Missing');
         // Initialize Service
         fyersService.initialize(this.config.fyers.appId, this.config.fyers.secretId, this.config.fyers.redirectUri);
         
         const response = await fyersService.generateSession(authCode);
         
         // Save Token
         await Setting.findOneAndUpdate(
             { key: 'fyers_access_token' },
             { key: 'fyers_access_token', value: encrypt(response.access_token), description: 'Fyers Access Token' },
             { upsert: true }
         );
         
         // Update Config
         this.config.data_feed_access_token = response.access_token;
         this.config.data_feed_provider = 'fyers';
         
         // Start Feed
         this.mode = 'live';
         this.adapter = fyersService;
         this.connectTicker();
         
         return response;
    }

    async handleKiteLogin(requestToken) {
         await this.loadSettings(); // Refresh settings
         if (!this.config.data_feed_api_key) throw new Error('API Key not configured');

         kiteService.initialize(this.config.data_feed_api_key, this.config.data_feed_api_secret);
         const response = await kiteService.generateSession(requestToken);
         
         // Save access_token to DB (Encrypted)
         await Setting.findOneAndUpdate(
             { key: 'data_feed_access_token' }, 
             { key: 'data_feed_access_token', value: encrypt(response.access_token), description: 'Kite Access Token' }, 
             { upsert: true }
         );

         // Update local config
         this.config.data_feed_access_token = response.access_token;

         // If successful
         this.mode = 'live';
         this.connectKiteTicker();
         return response;
    }

    /**
     * Get History for a symbol
     * @param {string} symbol
     * @param {string} resolution
     * @param {string} from
     * @param {string} to
     */
    async getHistory(symbol, resolution, from, to) {
        if (this.mode === 'simulation') {
            // Return some mock if needed, but usually frontend handles mock if API fails
            return [];
        }

        if (!this.adapter || !this.adapter.getHistory) {
            logger.warn(`History not supported for current provider: ${this.config.data_feed_provider}`);
            return [];
        }

        return this.adapter.getHistory(symbol, resolution, from, to);
    }

    /**
     * Search Instruments (Predefined list + DB symbols)
     * @param {string} query
     */
    async searchInstruments(query = '') {
        const popular = [
            // Indices
            { symbol: 'NSE:NIFTY50-INDEX', name: 'Nifty 50', segment: 'FNO', exchange: 'NSE', lotSize: 50, tickSize: 0.05 },
            { symbol: 'NSE:NIFTYBANK-INDEX', name: 'Nifty Bank', segment: 'FNO', exchange: 'NSE', lotSize: 15, tickSize: 0.05 },
            { symbol: 'NSE:FINNIFTY-INDEX', name: 'Nifty Financial Services', segment: 'FNO', exchange: 'NSE', lotSize: 40, tickSize: 0.05 },
            { symbol: 'NSE:MIDCPNIFTY-INDEX', name: 'Nifty Midcap Select', segment: 'FNO', exchange: 'NSE', lotSize: 75, tickSize: 0.05 },
            
            // Banking
            { symbol: 'NSE:RELIANCE-EQ', name: 'Reliance Industries', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:HDFCBANK-EQ', name: 'HDFC Bank Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:ICICIBANK-EQ', name: 'ICICI Bank Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:SBIN-EQ', name: 'State Bank of India', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:KOTAKBANK-EQ', name: 'Kotak Mahindra Bank', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:AXISBANK-EQ', name: 'Axis Bank Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:INDUSINDBK-EQ', name: 'IndusInd Bank Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },

            // IT
            { symbol: 'NSE:TCS-EQ', name: 'Tata Consultancy Services', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:INFY-EQ', name: 'Infosys Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:WIPRO-EQ', name: 'Wipro Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:HCLTECH-EQ', name: 'HCL Technologies Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:TECHM-EQ', name: 'Tech Mahindra Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },

            // Others (Nifty 100 Staples)
            { symbol: 'NSE:ITC-EQ', name: 'ITC Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:LT-EQ', name: 'Larsen & Toubro Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:SUNPHARMA-EQ', name: 'Sun Pharma Industries', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:TATAMOTORS-EQ', name: 'Tata Motors Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:MARUTI-EQ', name: 'Maruti Suzuki India', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:ADANIENT-EQ', name: 'Adani Enterprises', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:BHARTIARTL-EQ', name: 'Bharti Airtel Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:HINDALCO-EQ', name: 'Hindalco Industries Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:TITAN-EQ', name: 'Titan Company Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:JINDALSTEL-EQ', name: 'Jindal Steel & Power', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:ASIANPAINT-EQ', name: 'Asian Paints Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            { symbol: 'NSE:M&M-EQ', name: 'Mahindra & Mahindra Ltd', segment: 'EQUITY', exchange: 'NSE', lotSize: 1, tickSize: 0.05 },
            
            // Commodities
            { symbol: 'MCX:CRUDEOIL24JANFUT', name: 'Crude Oil Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 100, tickSize: 1.0 },
            { symbol: 'MCX:GOLD24FEBVAR', name: 'Gold Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 100, tickSize: 1.0 },
            { symbol: 'MCX:SILVER24MARFUT', name: 'Silver Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 30, tickSize: 1.0 },
            { symbol: 'MCX:COPPER24JANFUT', name: 'Copper Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 2500, tickSize: 0.05 },
            { symbol: 'MCX:NATGAS24JANFUT', name: 'Natural Gas Futures', segment: 'COMMODITY', exchange: 'MCX', lotSize: 1250, tickSize: 0.10 },
            
            // Currencies
            { symbol: 'CDS:USDINR24JANFUT', name: 'USDINR Currency Futures', segment: 'CURRENCY', exchange: 'CDS', lotSize: 1000, tickSize: 0.0025 },
            { symbol: 'CDS:GBPINR24JANFUT', name: 'GBPINR Currency Futures', segment: 'CURRENCY', exchange: 'CDS', lotSize: 1000, tickSize: 0.0025 },
            { symbol: 'CDS:EURINR24JANFUT', name: 'EURINR Currency Futures', segment: 'CURRENCY', exchange: 'CDS', lotSize: 1000, tickSize: 0.0025 },
            { symbol: 'CDS:JPYINR24JANFUT', name: 'JPYINR Currency Futures', segment: 'CURRENCY', exchange: 'CDS', lotSize: 1000, tickSize: 0.0025 },

            // Crypto (Binance Format)
            { symbol: 'BINANCE:BTCUSDT', name: 'Bitcoin USDT', segment: 'CRYPTO', exchange: 'BINANCE', lotSize: 1, tickSize: 0.01 },
            { symbol: 'BINANCE:ETHUSDT', name: 'Ethereum USDT', segment: 'CRYPTO', exchange: 'BINANCE', lotSize: 1, tickSize: 0.01 },
            { symbol: 'BINANCE:BNBUSDT', name: 'Binance Coin USDT', segment: 'CRYPTO', exchange: 'BINANCE', lotSize: 1, tickSize: 0.01 },
            { symbol: 'BINANCE:XRPUSDT', name: 'XRP USDT', segment: 'CRYPTO', exchange: 'BINANCE', lotSize: 1, tickSize: 0.0001 },
            { symbol: 'BINANCE:ADAUSDT', name: 'Cardano USDT', segment: 'CRYPTO', exchange: 'BINANCE', lotSize: 1, tickSize: 0.0001 },
            { symbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin USD (Bitstamp)', segment: 'CRYPTO', exchange: 'BITSTAMP', lotSize: 1, tickSize: 0.01 },
        ];

        // Search in DB too
        const dbSymbols = await MasterSymbol.find({
            $or: [
                { symbol: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } }
            ]
        }).limit(20);

        const dbMapped = dbSymbols.map(s => ({
            symbol: s.symbol,
            name: s.name,
            segment: s.segment,
            exchange: s.exchange,
            lotSize: s.lotSize,
            tickSize: s.tickSize || 0.05
        }));

        // Merge and Filter
        const q = query.toUpperCase();
        const filteredPopular = popular.filter(p => 
            p.symbol.includes(q) || 
            p.name.toUpperCase().includes(q)
        );

        // Combine, remove duplicates (by symbol), and limit
        const combined = [...dbMapped, ...filteredPopular];
        const unique = Array.from(new Map(combined.map(item => [item.symbol, item])).values());

        return unique.slice(0, 30); // Show up to 30 results for variety
    }
}

const marketDataService = new MarketDataService();
export default marketDataService;
