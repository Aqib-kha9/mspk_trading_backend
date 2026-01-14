import marketDataService from './marketData.service.js';
import technicalAnalysisService from './technicalAnalysis.service.js';
import signalService from './signal.service.js';
import logger from '../config/logger.js';
import EventEmitter from 'events';
import { getIo } from './socket.service.js';

class HybridStrategyService extends EventEmitter {
    constructor() {
        super();
        this.candles = {}; // Map<Symbol, Array<{time, open, high, low, close}>>
        this.status = {}; // Map<Symbol, { supertrend, psar, structure, lastSignal }>
        this.CANDLE_SIZE_SEC = 60; // Default 1 Minute, will be updated by strategy config
        this.MAX_CANDLES = 200; // Keep last 200 candles
        this.strategyId = null;
    }

    async start() {
        logger.info('🚀 Hybrid Strategy Engine Started');
        
        // Find or Seed the System Strategy to get its ID
        try {
            const Strategy = (await import('../models/Strategy.js')).default;
            let hybrid = await Strategy.findOne({ name: 'Hybrid Strategy', isSystem: true });
            if (hybrid) {
                this.strategyId = hybrid._id;
                // Update candle size based on strategy timeframe if needed
                // 5m = 300s, 15m = 900s etc.
                const tfMap = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };
                this.CANDLE_SIZE_SEC = tfMap[hybrid.timeframe] || 60;
            }
        } catch (e) {
            logger.error('Failed to fetch Hybrid Strategy info', e);
        }

        marketDataService.on('price_update', this.handleTick.bind(this));
    }

    async handleTick(tick) {
        const { symbol, price, timestamp } = tick;
        
        // Lazy load history if missing and not already loading
        if (!this.candles[symbol] && !this._fetchingHistory?.[symbol]) {
             await this.loadHistory(symbol);
        }
        
        this.updateCandle(symbol, price, timestamp);
        this.evaluateStrategy(symbol, price);
    }

    async loadHistory(symbol) {
        if (!this._fetchingHistory) this._fetchingHistory = {};
        this._fetchingHistory[symbol] = true;
        
        try {
            logger.info(`📚 Pre-loading history for ${symbol}...`);
            // We need to fetch history using the current resolution
            const resolution = (this.CANDLE_SIZE_SEC / 60).toString(); 
            const to = new Date();
            const from = new Date(to.getTime() - 2 * 24 * 60 * 60 * 1000); // Fetch 2 days to be safe
            
            const formatDate = (d) => d.toISOString().split('T')[0];
            
            // Note: marketDataService.getHistory handles formatting and adaptation
            const history = await marketDataService.adapter.getHistory(
                symbol, 
                resolution, 
                formatDate(from), 
                formatDate(to)
            );

            if (history && history.length > 0) {
                 this.candles[symbol] = history.map(h => ({
                     time: h.time * 1000, 
                     open: h.open,
                     high: h.high,
                     low: h.low,
                     close: h.close
                 })).slice(-this.MAX_CANDLES);
                 
                 logger.info(`✅ Successfully primed ${symbol} with ${this.candles[symbol].length} candles`);
            } else {
                 this.candles[symbol] = []; // Initialize empty if no history
                 logger.warn(`⚠️ No history found for ${symbol} to prime strategy`);
            }
        } catch (e) {
            logger.error(`❌ Failed to prime history for ${symbol}: ${e.message}`);
            this.candles[symbol] = [];
        } finally {
            this._fetchingHistory[symbol] = false;
        }
    }

    updateCandle(symbol, price, timestamp) {
        if (!this.candles[symbol]) {
            this.candles[symbol] = [];
        }

        const now = new Date(timestamp).getTime();
        const currentCandleValues = this.candles[symbol];
        const lastCandle = currentCandleValues[currentCandleValues.length - 1];

        // Check if we need a new candle
        // Align to minute boundary
        const candleTime = Math.floor(now / (this.CANDLE_SIZE_SEC * 1000)) * (this.CANDLE_SIZE_SEC * 1000);

        if (!lastCandle || lastCandle.time < candleTime) {
            // New Candle
            this.candles[symbol].push({
                time: candleTime,
                open: price,
                high: price,
                low: price,
                close: price
            });
            // Trim old candles
            if (this.candles[symbol].length > this.MAX_CANDLES) {
                this.candles[symbol].shift();
            }
        } else {
            // Update existing candle
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
            lastCandle.close = price;
        }
    }

    evaluateStrategy(symbol, price) {
        const candles = this.candles[symbol];
        if (candles.length < 20) return; // Need some history

        // 1. Calculate Indicators
        const supertrend = technicalAnalysisService.calculateSupertrend(candles, 10, 3.0);
        const psar = technicalAnalysisService.calculatePSAR(candles);
        const structure = technicalAnalysisService.calculateMarketStructure(candles, 5);

        // 2. Logic for Signals
        // Buy: Supertrend flips Green (1) AND PSAR < Price AND Structure is HH/HL (uptrend or recovery)
        // Sell: Supertrend flips Red (-1) AND PSAR > Price AND Structure is LH/LL

        // We check for "Flip" specifically on the LATEST COMPLETED candle ideally, 
        // but for live signals we often check current developing candle status vs previous closed.
        // Let's use the Supertrend result which returns `isBuy` / `isSell` flags based on the last calculated index.
        
        let signal = null;
        let sl = 0;
        let tp = 0;

        if (supertrend.isBuy) {
            // Confluence Check
            if (psar.value < price) {
                signal = 'BUY';
                // SL: Supertrend or 2%
                sl = Math.min(supertrend.value, price * 0.98);
                tp = price * 1.04; // 4% target
            }
        } else if (supertrend.isSell) {
            if (psar.value > price) {
                signal = 'SELL';
                // SL: Supertrend or 2%
                sl = Math.max(supertrend.value, price * 1.02);
                tp = price * 0.96; // 4% target
            }
        }

        // 3. Update Status State
        this.status[symbol] = {
            symbol,
            price,
            supertrend: {
                value: supertrend.value,
                trend: supertrend.trend === 1 ? 'UP' : 'DOWN'
            },
            psar: {
                value: psar.value,
                trend: psar.trend
            },
            structure: structure.structure,
            lastPivot: structure.lastPivot,
            timestamp: new Date()
        };

        if (signal) {
            this.processSignal(symbol, signal, price, sl, tp);
        }
        
        // Emit update via Socket.IO
        try {
            const io = getIo();
            if (io) {
                io.to(symbol).emit('strategy_update', this.status[symbol]);
                io.emit('strategy_update_all', this.status[symbol]); // Also broadcast to admins listening globally if any
            }
        } catch (e) {
            // Socket might not be ready
        }
    }

    async processSignal(symbol, type, price, sl, tp) {
        // Debounce / Cooldown
        const lastStatus = this.status[symbol];
        if (lastStatus.lastSignal && lastStatus.lastSignal.type === type && 
            (new Date() - new Date(lastStatus.lastSignal.time) < 15 * 60 * 1000)) {
            return; // Ignore repetitive signals within 15 mins (increased from 5)
        }

        logger.info(`🔥 HYBRID SIGNAL: ${type} on ${symbol} @ ${price} [SL: ${sl.toFixed(2)}, TP: ${tp.toFixed(2)}]`);
        
        const signalData = {
            symbol,
            type,
            entryPrice: price,
            stopLoss: sl,
            target1: tp,
            notes: 'Hybrid Strategy (Supertrend + PSAR + HH/LL)',
            timestamp: new Date()
        };

        this.status[symbol].lastSignal = signalData;

        // Persist via Signal Service
        try {
            // Create system user context for automated signals
            const systemUser = { id: this.userId || 'system' };
            
            await signalService.createSignal({
                strategyId: this.strategyId,
                symbol,
                segment: this.mapSegment(symbol),
                type,
                entryPrice: price,
                stopLoss: parseFloat(sl.toFixed(2)),
                targets: {
                    target1: parseFloat(tp.toFixed(2))
                },
                notes: signalData.notes,
                status: 'Active'
            }, systemUser);
            logger.info(`✅ Signal persisted for ${symbol}`);
        } catch (e) {
            logger.error(`Error persisting signal for ${symbol}`, e);
        }
    }

    mapSegment(symbol) {
        if (!symbol.includes(':')) return 'EQUITY';
        const [exchange, sym] = symbol.split(':');
        
        const map = {
            'NSE': 'FNO',
            'BSE': 'EQUITY',
            'MCX': 'COMMODITY',
            'CDS': 'CURRENCY',
            'BINANCE': 'CRYPTO',
            'BITSTAMP': 'CRYPTO'
        };

        // Specialized Nifty Equity check if needed, but NSE: usually implies FNO for most traders in this context
        // Or we could check for -EQ suffix
        if (exchange === 'NSE' && sym.endsWith('-EQ')) return 'EQUITY';
        
        return map[exchange] || 'EQUITY';
    }

    getLiveStatus(symbol) {
        return this.status[symbol];
    }
}

export const hybridStrategyService = new HybridStrategyService();
export default hybridStrategyService;
