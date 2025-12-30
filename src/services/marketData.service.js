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
            this.stopSimulation();
            this.subscribeToSymbols();
        });
    }

    subscribeToSymbols() {
        if (!this.adapter) return;
        
        // Map based on provider requirements
        // Kite: Instrument Tokens (Numbers)
        // Upstox/Fyers: Might use Symbol names or Tokens. 
        // For MVP, passing tokens as is from MasterSymbol (assuming stored correctly for provider)
        // TODO: We might need a `provider_token` map in DB if tokens differ per provider.
        
        const tokens = Object.keys(this.tokenMap);
        if (tokens.length > 0) {
            this.adapter.subscribe(tokens);
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
        const mockList = Object.keys(this.symbols).length > 0 ? Object.keys(this.symbols) : ['NIFTY 50', 'BANKNIFTY'];

        mockList.forEach(symbol => {
            const volatility = this.symbols[symbol]?.volatility || 10;
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
}

const marketDataService = new MarketDataService();
export default marketDataService;
