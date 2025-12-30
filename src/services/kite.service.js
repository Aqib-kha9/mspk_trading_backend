import { KiteConnect, KiteTicker } from 'kiteconnect';
import logger from '../config/logger.js';

class KiteService {
    constructor() {
        this.kite = null;
        this.ticker = null;
        this.apiKey = null;
        this.apiSecret = null;
        this.accessToken = null;
        this.isTickerConnected = false;
        this.subscriptions = [];
        this.callbacks = {
            onTick: () => {},
            onConnect: () => {},
            onError: () => {}
        };
    }

    /**
     * Initialize the service with API credentials
     */
    initialize(apiKey, apiSecret) {
        if (!apiKey || !apiSecret) {
            throw new Error('API Key and Secret are required for KiteService');
        }
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        
        this.kite = new KiteConnect({
            api_key: this.apiKey,
        });

        logger.info('KiteService initialized with API Key');
    }

    /**
     * Generate the login URL for the user to authenticate
     */
    getLoginUrl() {
        if (!this.kite) return null;
        return this.kite.getLoginURL();
    }

    /**
     * Exchange request token for access token
     */
    async generateSession(requestToken) {
        if (!this.kite || !this.apiSecret) throw new Error('KiteService not initialized');
        
        try {
            const response = await this.kite.generateSession(requestToken, this.apiSecret);
            this.accessToken = response.access_token;
            this.kite.setAccessToken(this.accessToken);
            
            logger.info('Kite Session Generated Successfully');
            return response;
        } catch (error) {
            logger.error('Error generating Kite session', error);
            throw error;
        }
    }

    /**
     * Set Access Token manually (if loaded from DB/Cache)
     */
    setAccessToken(token) {
        this.accessToken = token;
        if (this.kite) {
            this.kite.setAccessToken(token);
        }
    }

    /**
     * Connect to Kite Ticker (WebSocket)
     */
    connectTicker(onTickCallback, onConnectCallback) {
        if (!this.apiKey || !this.accessToken) {
            logger.error('Cannot connect ticker: Missing credentials');
            return;
        }

        if (this.ticker) {
            logger.info('Ticker already exists, reconnecting...');
            this.ticker.disconnect();
        }

        this.callbacks.onTick = onTickCallback;
        if (onConnectCallback) this.callbacks.onConnect = onConnectCallback;

        this.ticker = new KiteTicker({
            api_key: this.apiKey,
            access_token: this.accessToken
        });

        this.ticker.autoReconnect(true, 10, 5);

        this.ticker.on('ticks', this.handleTicks.bind(this));
        this.ticker.on('connect', this.handleConnect.bind(this));
        this.ticker.on('disconnect', this.handleDisconnect.bind(this));
        this.ticker.on('error', (error) => logger.error('Kite Ticker Error', error));
        this.ticker.on('reconnecting', (attempt) => logger.warn(`Kite Ticker Reconnecting (Attempt ${attempt})...`));

        this.ticker.connect();
    }

    handleTicks(ticks) {
        // Normalize ticks if necessary or pass raw
        // Kite ticks format: [{ instrument_token, last_price, ... }]
        if (this.callbacks.onTick) {
            this.callbacks.onTick(ticks);
        }
    }

    handleConnect() {
        logger.info('Kite Ticker Connected');
        this.isTickerConnected = true;
        
        // Resubscribe if needed
        if (this.subscriptions.length > 0) {
            this.subscribe(this.subscriptions);
        }

        if (this.callbacks.onConnect) {
            this.callbacks.onConnect();
        }
    }

    handleDisconnect() {
        logger.warn('Kite Ticker Disconnected');
        this.isTickerConnected = false;
    }

    subscribe(instrumentTokens) {
        if (!this.ticker || !this.isTickerConnected) {
            logger.warn('Ticker not connected, queuing subscriptions');
            // Add unique tokens to subscription list
            const newTokens = instrumentTokens.filter(t => !this.subscriptions.includes(t));
            this.subscriptions = [...this.subscriptions, ...newTokens];
            return;
        }

        const tokensToSubscribe = instrumentTokens.map(t => parseInt(t));
        this.ticker.subscribe(tokensToSubscribe);
        this.ticker.setMode(this.ticker.modeFull, tokensToSubscribe);
        
        // Update local list
        const newTokens = instrumentTokens.filter(t => !this.subscriptions.includes(t));
        this.subscriptions = [...this.subscriptions, ...newTokens];
        
        logger.info(`Subscribed to ${tokensToSubscribe.length} tokens`);
    }

    unsubscribe(instrumentTokens) {
        if (!this.ticker || !this.isTickerConnected) return;
        const tokensToUnsub = instrumentTokens.map(t => parseInt(t));
        this.ticker.unsubscribe(tokensToUnsub);
        
        // Remove from local list
        this.subscriptions = this.subscriptions.filter(t => !tokensToUnsub.includes(parseInt(t)));
    }
}

export const kiteService = new KiteService();
export default KiteService;
