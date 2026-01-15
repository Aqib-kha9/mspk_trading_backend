import app from './src/app.js';
import config from './src/config/config.js';
import logger from './src/config/logger.js';
import connectDB from './src/config/database.js';
import { initSocket } from './src/services/socket.service.js';
import { connectRedis } from './src/services/redis.service.js';
import strategyService from './src/services/strategy.service.js';
import signalMonitor from './src/services/signal.monitor.js';
import schedulerService from './src/services/scheduler.service.js';
import hybridStrategyService from './src/services/hybridStrategy.service.js';
import { initializeFirebase } from './src/config/firebase.js';
import marketDataService from './src/services/marketData.service.js';

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();
    
    // 2. Connect to Redis (if used)
    await connectRedis();

    // 2.5 Initialize Firebase
    initializeFirebase();

    // 3. Start Express Server
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`Server running in ${config.env} mode on port ${config.port}`);
    });

    // 4. Initialize Background Services
    marketDataService.init(); 
    initSocket(server);
    await strategyService.seedStrategies(); 
    strategyService.startEngine();
    hybridStrategyService.start();
    signalMonitor.start(); 
    schedulerService.initScheduler();

    // Handle signals for graceful shutdown
    const exitHandler = () => {
      if (server) {
        server.close(() => {
          logger.info('Server closed');
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    };

    const unexpectedErrorHandler = (error) => {
      logger.error(error);
      exitHandler();
    };

    process.on('uncaughtException', unexpectedErrorHandler);
    process.on('unhandledRejection', unexpectedErrorHandler);

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received');
      if (server) {
        server.close();
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
