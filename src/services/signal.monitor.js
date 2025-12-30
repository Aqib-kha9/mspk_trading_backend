import Signal from '../models/Signal.js';
import marketDataService from './marketData.service.js';
import logger from '../config/logger.js';

let activeSignals = [];
let isMonitoring = false;

const startMonitoring = async () => {
    if (isMonitoring) return;

    logger.info('🛰️ Signal Monitor Started (Auto TP/SL Check)...');
    isMonitoring = true;

    // 1. Initial Load of Active Signals
    await refreshSignalCache();

    // 2. Listen to Market Data
    marketDataService.on('price_update', handlePriceUpdate);
};

const stopMonitoring = () => {
    logger.info('🛑 Signal Monitor Stopped.');
    isMonitoring = false;
    marketDataService.off('price_update', handlePriceUpdate);
    activeSignals = [];
};

const refreshSignalCache = async () => {
    try {
        // Fetch specific statuses that should be monitored
        const signals = await Signal.find({ 
            status: { $in: ['Active', 'Open'] } 
        });
        activeSignals = signals;
        logger.info(`♻️ Signal Cache Refreshed. Monitoring ${signals.length} active signals.`);
    } catch (e) {
        logger.error('Failed to refresh signal cache', e);
    }
};

const handlePriceUpdate = async (tick) => {
    if (!isMonitoring || activeSignals.length === 0) return;

    // Filter signals for this symbol
    const relevantSignals = activeSignals.filter(s => s.symbol === tick.symbol);

    for (const signal of relevantSignals) {
        await checkSignal(signal, tick.price);
    }
};

const checkSignal = async (signal, currentPrice) => {
    let newStatus = null;
    let exitPrice = null;

    // Parse Target/Stoploss (ensure they are numbers)
    const sl = signal.stopLoss;
    const t1 = signal.targets?.target1;
    const t2 = signal.targets?.target2;
    const t3 = signal.targets?.target3;

    // Logic for BUY
    if (signal.type === 'BUY') {
        // Stoploss Hit
        if (currentPrice <= sl) {
            newStatus = 'Stoploss Hit';
            exitPrice = sl; // Or actual currentPrice (slippage) - using SL level for now
        }
        // Target Hit (Any target for now marks it as Target Hit, distinct logic can be added for partials)
        else if (currentPrice >= t1) {
            newStatus = 'Target Hit';
            exitPrice = t1;
        }
    } 
    // Logic for SELL
    else if (signal.type === 'SELL') {
        // Stoploss Hit
        if (currentPrice >= sl) {
            newStatus = 'Stoploss Hit';
            exitPrice = sl; 
        }
        // Target Hit
        else if (currentPrice <= t1) {
            newStatus = 'Target Hit';
            exitPrice = t1;
        }
    }

    if (newStatus) {
        await updateSignalStatus(signal, newStatus, currentPrice);
    }
};

const updateSignalStatus = async (signal, status, closePrice) => {
    try {
        logger.info(`🔔 Auto-Update: Signal ${signal.symbol} marked as ${status} @ ${closePrice}`);
        
        // Update DB
        await Signal.findByIdAndUpdate(signal._id, {
            status: status,
            exitPrice: closePrice,
            closedAt: new Date(),
            notes: signal.notes + `\n[Auto] ${status} triggered at ${closePrice}`
        });

        // Remove from local cache immediately
        activeSignals = activeSignals.filter(s => s._id.toString() !== signal._id.toString());

    } catch (e) {
        logger.error(`Failed to auto-update signal ${signal._id}`, e);
    }
};

// Export refresh for external triggers (e.g. when new signal created)
export const reloadSignals = refreshSignalCache;

export default {
    start: startMonitoring,
    stop: stopMonitoring,
    reload: refreshSignalCache
};
