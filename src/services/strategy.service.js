import technicalindicators from 'technicalindicators';
const { RSI, SMA, EMA } = technicalindicators;
import { redisSubscriber, redisClient } from './redis.service.js';
import Strategy from '../models/Strategy.js';
import Signal from '../models/Signal.js';
import logger from '../config/logger.js';

// Simple in-memory cache for candles/prices to calculate indicators
// In a real production system, this should be in Redis or TimeSeries DB (InfluxDB)
const priceHistory = {}; 

class StrategyService {
  constructor() {
    this.activeStrategies = [];
    this.init();
  }

  async init() {
    // Load active strategies
    this.activeStrategies = await Strategy.find({ isActive: true });
    logger.info(`Loaded ${this.activeStrategies.length} active strategies`);

    // Subscribe to market data
    // optimization: redisSubscriber is already subscribed in socket.service
    // but here we attach a listener to 'message' event on the same instance
    redisSubscriber.on('message', (channel, message) => {
        if (channel === 'market_data') {
            try {
                const tick = JSON.parse(message);
                this.processTick(tick);
            } catch (err) {
                logger.error('Strategy Tick Error', err);
            }
        }
    });

    // Refresh strategies periodically (e.g., every minute)
    setInterval(async () => {
        this.activeStrategies = await Strategy.find({ isActive: true });
    }, 60000);
  }

  processTick(tick) {
      const { symbol, price } = tick;
      
      // Update local history for indicator calculation
      if (!priceHistory[symbol]) priceHistory[symbol] = [];
      priceHistory[symbol].push(parseFloat(price));
      
      // Keep only last 200 prices
      if (priceHistory[symbol].length > 200) {
          priceHistory[symbol].shift();
      }

      // Find strategies for this symbol
      const relevantStrategies = this.activeStrategies.filter(s => s.symbol === symbol);
      
      relevantStrategies.forEach(async (strategy) => {
          this.evaluateStrategy(strategy, priceHistory[symbol], price);
      });
  }

  async evaluateStrategy(strategy, prices, currentPrice) {
      // Need minimum data points (e.g. 200) to be safe for most indicators
      if (prices.length < 50) return; 

      const { logic, action } = strategy;
      if (!logic || !logic.rules || logic.rules.length === 0) return;

      let allRulesMet = true;
      if (logic.condition === 'OR') allRulesMet = false;

      // Evaluate each rule
      // We'll collect results and apply AND/OR logic
      const results = await Promise.all(logic.rules.map(async (rule) => {
          return await this.evaluateRule(rule, prices);
      }));

      if (logic.condition === 'AND') {
          allRulesMet = results.every(r => r === true);
      } else {
          allRulesMet = results.some(r => r === true);
      }

      if (allRulesMet) {
          // Check for signal debouncing/spam prevention here if needed
          await this.generateSignal(strategy, action.type || 'ALERT', currentPrice, 'Dynamic Logic Triggered');
      }
  }

  async evaluateRule(rule, prices) {
      try {
          // 1. Calculate Left Hand Side (LHS) Value
          const lhsValue = await this.calculateIndicator(rule.indicator, rule.params, prices);
          
          // 2. Calculate Right Hand Side (RHS) Value
          let rhsValue;
          if (rule.comparisonType === 'VALUE') {
              rhsValue = rule.value;
          } else if (rule.comparisonType === 'INDICATOR') {
              // Recursively calculate RHS indicator
              // rule.value should be { indicator: '...', params: '...' }
              rhsValue = await this.calculateIndicator(rule.value.indicator, rule.value.params, prices);
          }

          if (lhsValue === null || rhsValue === null) return false;

          // 3. Compare
          return this.compareValues(lhsValue, rhsValue, rule.operator, prices);
      } catch (err) {
          logger.error(`Rule Evaluation Error: ${err.message}`);
          return false;
      }
  }

  async calculateIndicator(name, params, prices) {
      // Helper to get array of values from technicalindicators library
      // We usually need the LAST value for current check, but for Crossovers we might need last 2
      
      let result = [];
      const values = { values: prices };
      
      // Map params from Mongoose Map if needed, or straight object
      // For RSI: { values: [], period: 14 }
      
      switch (name.toUpperCase()) {
          case 'RSI':
              // RSI.calculate({ period: 14, values: [] })
              result = RSI.calculate({ period: params.period || 14, values: prices });
              break;
          case 'SMA':
              result = SMA.calculate({ period: params.period || 14, values: prices });
              break;
          case 'EMA':
              result = EMA.calculate({ period: params.period || 14, values: prices });
              break;
          // Add more indicators here: MACD, Bollinger, etc.
          case 'PRICE':
              // Special case: just returns the price array
              result = prices;
              break;
          default:
              return null;
      }
      
      // We return the whole array because Crossover logic needs history
      return result;
  }

  compareValues(lhsSeries, rhsSeries, operator, prices) {
      // Get latest values
      // If rhsSeries is a constant number (Simple Value comparison), treat as series
      
      const lastLHS = lhsSeries[lhsSeries.length - 1];
      let lastRHS;
      
      if (Array.isArray(rhsSeries)) {
          lastRHS = rhsSeries[rhsSeries.length - 1];
      } else {
          lastRHS = rhsSeries; // Constant value
      }

      // Previous values for crossover checks
      const prevLHS = lhsSeries[lhsSeries.length - 2];
      let prevRHS;
      if (Array.isArray(rhsSeries)) {
          prevRHS = rhsSeries[rhsSeries.length - 2];
      } else {
          prevRHS = rhsSeries;
      }

      switch (operator) {
          case '>': return lastLHS > lastRHS;
          case '<': return lastLHS < lastRHS;
          case '>=': return lastLHS >= lastRHS;
          case '<=': return lastLHS <= lastRHS;
          case '==': return lastLHS == lastRHS; // fuzzy equals for standard JS
          case 'CROSS_ABOVE':
              // (PrevLHS <= PrevRHS) AND (LastLHS > LastRHS)
              return (prevLHS <= prevRHS) && (lastLHS > lastRHS);
          case 'CROSS_BELOW':
              // (PrevLHS >= PrevRHS) AND (LastLHS < LastRHS)
              return (prevLHS >= prevRHS) && (lastLHS < lastRHS);
          default: return false;
      }
  }

  async generateSignal(strategy, type, price, reason) {
      // Check if we recently signaled to avoid spam (throttling)
      // Implementation skipped for brevity

      logger.info(`SIGNAL GENERATED: ${strategy.name} - ${type} @ ${price} (${reason})`);

      const signal = await Signal.create({
          strategy: strategy._id,
          user: strategy.user,
          symbol: strategy.symbol,
          type: type,
          price: price,
          status: 'GENERATED'
      });

      // Publish signal for Notification Service
      redisClient.publish('signals', JSON.stringify(signal));
  }
}

// Export singleton
export default new StrategyService();
