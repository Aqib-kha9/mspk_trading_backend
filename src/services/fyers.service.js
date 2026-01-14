import fyers from 'fyers-api-v3';
import logger from '../config/logger.js';
// Fyers API V3 Base URL (handled by SDK mostly)
const FYERS_BASE_URL = 'https://api-t1.fyers.in/api/v3';

class FyersService {
    constructor() {
        this.appId = null; // Fyers uses App ID (client_id)
        this.secretId = null; // Secret Key
        this.accessToken = null;
        this.redirectUri = 'http://localhost:3000/market/login/fyers';
        this.fyersModel = null; // Fyers SDK instance
        this.isTickerConnected = false;
        this.subscriptions = [];
        this.callbacks = {
            onTick: () => {},
            onConnect: () => {},
            onError: () => {}
        };
    }

    /**
     * Initialize service
     */
    initialize(appId, secretId, redirectUri) {
        if (!appId || !secretId) {
            throw new Error('App ID and Secret ID are required for FyersService');
        }
        this.appId = appId;
        this.secretId = secretId;
        if (redirectUri) this.redirectUri = redirectUri;
        logger.info('FyersService initialized');
    }

    /**
     * Get Login URL
     */
    getLoginUrl() {
        return `${FYERS_BASE_URL}/generate-authcode?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&state=somerandomstate`;
    }

    /**
     * Generate Session (Exchange Code for Token)
     */
    async generateSession(authCode) {
        if (!this.appId || !this.secretId) throw new Error('FyersService not initialized');

        try {
            // Using raw fetch for stability
            const crypto = (await import('crypto')).default;
            const appIdHash = crypto.createHash('sha256').update(`${this.appId}:${this.secretId}`).digest('hex');

            const res = await fetch(`${FYERS_BASE_URL}/validate-authcode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: "authorization_code",
                    appIdHash: appIdHash,
                    code: authCode
                })
            });

            const data = await res.json();
            if (data.s !== 'ok' || !data.access_token) {
                 throw new Error(data.message || 'Failed to generate Fyers token');
            }

            this.accessToken = data.access_token;
            logger.info('Fyers Session Generated Successfully');
            return { access_token: this.accessToken };

        } catch (error) {
            logger.error('Error generating Fyers session', error);
            throw error;
        }
    }
    
    setAccessToken(token) {
        this.accessToken = token;
    }

    /**
     * Fetch Quotes (LTP, Close, etc) for a list of symbols
     * symbols: Array of strings e.g. ["NSE:SBIN-EQ", "MCX:CRUDEOIL24JANFUT"]
     */
    async getQuotes(symbols) {
        if (!this.accessToken) throw new Error('No access token');
        
        try {
            // Initialize SDK Model
            if (!this.fyersModel) {
                this.fyersModel = new fyers.fyersModel();
                this.fyersModel.setAppId(this.appId);
                this.fyersModel.setAccessToken(this.accessToken);
            }
            
            logger.info(`Fetching Fyers Quotes (SDK) for ${symbols.length} symbols`);
            const data = await this.fyersModel.getQuotes(symbols);
            
            if (data.s !== 'ok') {
                logger.error('Fyers Quote SDK Error', data);
                return {};
            }
            
            const result = {};
            data.d.forEach(item => {
                const sym = item.n;
                result[sym] = item.v.lp; 
            });
            
            return result;
            
        } catch (error) {
            logger.error('Error fetching Fyers quotes via SDK', error);
            return {};
        }
    }

    /**
     * Connect Fyers Socket
     */
    async connectTicker(onTickCallback, onConnectCallback) {
         if (!this.accessToken) {
            logger.error('Cannot connect ticker: Missing access token');
            return;
        }

        try {
            const authStr = this.accessToken; // V3 DataSocket takes just the access token
            
            // Log path is optional, second arg.
            this.fyersSocket = new fyers.fyersDataSocket(authStr);
            
            // Handlers
            this.fyersSocket.on("connect", () => {
                this.isTickerConnected = true;
                logger.info('✅ Fyers Websocket Connected');
                if (onConnectCallback) onConnectCallback();
                
                // Resubscribe if needed
                if (this.subscriptions.length > 0) {
                     this.subscribe(this.subscriptions);
                }
            });

            this.fyersSocket.on("message", (msg) => {
                // Fyers V3 Data Socket Message Structure
                // msg is usually JSON object or array
                // Example: { type: 'sf', symbol: 'NSE:SBIN-EQ', code: 200, ... }
                // Or if multiple? 
                // Let's assume standard handling. 
                // Note: fyers-api-v3 docs say msg is the tick object directly.
                
                if (onTickCallback) {
                     // Check if it's an array or single object
                     const dataArray = Array.isArray(msg) ? msg : [msg];
                     
                     // Filter only "sf" (Symbol Refresh) or "if" (Index Refresh) or similar
                     // V3 types: sf, if, dp, etc.
                     // Mapping to standardized tick format
                     
                     const ticks = dataArray.map(m => {
                         // Check valid packet
                         if (!m.symbol) return null;
                         
                         return {
                            symbol: m.symbol, 
                            last_price: m.ltp || m.lp, // ltp is common
                            change: m.ch,
                            change_percent: m.chp,
                            volume: m.vol,
                            // Add extra fields if needed
                            high: m.high,
                            low: m.low
                         };
                     }).filter(t => t !== null);
                     
                     if (ticks.length > 0) onTickCallback(ticks);
                }
            });

            this.fyersSocket.on("error", (err) => {
                logger.error("Fyers Socket Error", err);
                this.isTickerConnected = false;
            });
            
            this.fyersSocket.on("close", () => {
                logger.warn("Fyers Socket Closed");
                this.isTickerConnected = false;
            });

            // Connect
             this.fyersSocket.connect(); 
             
             // Keep Alive? SDK handles it usually.

        } catch (e) {
            logger.error('Failed to init Fyers Socket', e);
        }
    }

    subscribe(tokens) {
        if (!this.fyersSocket || !this.isTickerConnected) {
             this.subscriptions = [...new Set([...this.subscriptions, ...tokens])];
             return;
        }
        
        // Fyers SDK subscribe expects array of symbols
        // tokens here are expected to be symbols e.g. "NSE:SBIN-EQ"
        // fyersSocket.subscribe(symbols)
        
        // Filter valid strings
        const validSyms = tokens.filter(t => typeof t === 'string' && t.includes(':'));
        
        if (validSyms.length > 0) {
            this.fyersSocket.subscribe(validSyms);
            logger.info(`Fyers Subscribed to ${validSyms.length} symbols`);
        }
    }
    
    unsubscribe(tokens) {
        if (this.fyersSocket && this.isTickerConnected) {
             this.fyersSocket.unsubscribe(tokens);
        }
    }

    /**
     * Fetch History (OHLC) for a symbol
     * symbol: e.g. "NSE:SBIN-EQ"
     * resolution: e.g. "5" (mins)
     * from: yyyy-mm-dd
     * to: yyyy-mm-dd
     */
    async getHistory(symbol, resolution = '5', from, to) {
        if (!this.accessToken) throw new Error('No access token');

        try {
            // Initialize SDK Model
            if (!this.fyersModel) {
                this.fyersModel = new fyers.fyersModel();
                this.fyersModel.setAppId(this.appId);
                this.fyersModel.setAccessToken(this.accessToken);
            }

            const params = {
                symbol,
                resolution,
                date_format: "1",
                range_from: from,
                range_to: to,
                cont_flag: "1"
            };

            logger.info(`Fetching Fyers History (SDK): ${symbol} (${resolution})`);
            const data = await this.fyersModel.getHistory(params);

            if (data.s !== 'ok') {
                logger.error('Fyers History SDK Error:', {
                    symbol,
                    status: data.s,
                    code: data.code,
                    message: data.message
                });
                return [];
            }

            return data.candles.map(c => ({
                time: c[0],
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5]
            }));

        } catch (error) {
            logger.error('Error fetching Fyers history via SDK', error);
            return [];
        }
    }
}

export const fyersService = new FyersService();
export default FyersService;
