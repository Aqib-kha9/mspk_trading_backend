// This service handles connections to external socket feeds (Polygon, Tiingo)
import WebSocket from 'ws';
import { redisClient } from './redis.service.js';
import logger from '../config/logger.js';
import config from '../config/config.js';

class MarketDataService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectInterval = 5000;
  }

  // Placeholder for Polygon connection
  connectPolygon(apiKey) {
    if (!apiKey) {
      logger.warn('Polygon API Key missing, skipping connection');
      // For development, we might simulate data
      this.startSimulation();
      return;
    }

    const url = 'wss://socket.polygon.io/stocks';
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      logger.info('Connected to Polygon WebSocket');
      this.isConnected = true;
      
      // Auth
      this.ws.send(JSON.stringify({ action: 'auth', params: apiKey }));
      
      // Subscribe to aggregates (one minute bars) for example
      // In real app, we would subscribe based on active Strategies
      this.ws.send(JSON.stringify({ action: 'subscribe', params: 'A.*' })); // Subscribe to all aggregates
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', () => {
      logger.info('Polygon WebSocket disconnected');
      this.isConnected = false;
      setTimeout(() => this.connectPolygon(apiKey), this.reconnectInterval);
    });

    this.ws.on('error', (err) => {
      logger.error('Polygon WebSocket error', err);
    });
  }

  handleMessage(data) {
    try {
        const parsed = JSON.parse(data);
        // Process array of events
        parsed.forEach(tick => {
            // E.g. { ev: 'A', sym: 'AAPL', c: 150.2, ... }
            if (tick.ev === 'A' || tick.ev === 'T') { // Aggregate or Trade
                const marketUpdate = {
                    symbol: tick.sym,
                    price: tick.c || tick.p, // Close or Price
                    timestamp: tick.t || tick.e,
                    volume: tick.v || tick.s
                };
                
                // Publish to Redis for:
                // 1. Strategy Engine to consume
                // 2. Socket Server to push to frontend
                redisClient.publish('market_data', JSON.stringify(marketUpdate));
            }
        });
    } catch (error) {
        logger.error('Error parsing market data', error);
    }
  }

  startSimulation() {
    logger.info('Starting Market Data Simulation');
    setInterval(() => {
        const mockTick = {
            symbol: 'AAPL',
            price: (150 + Math.random() * 2).toFixed(2),
            timestamp: Date.now(),
            volume: 100
        };
        redisClient.publish('market_data', JSON.stringify(mockTick));
    }, 1000); // 1 tick per second
  }
}

export default new MarketDataService();
