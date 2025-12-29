import app from './src/app.js';
import config from './src/config/config.js';
import logger from './src/config/logger.js';
import connectDB from './src/config/database.js';
import { initSocket } from './src/services/socket.service.js';
import { connectRedis } from './src/services/redis.service.js';
import marketDataService from './src/services/marketData.service.js';
import './src/services/strategy.service.js';
import './src/services/notification.service.js';
import './src/workers/notification.worker.js';

const startServer = async () => {
  await connectDB();
  await connectRedis();

  const server = app.listen(config.port, () => {
    logger.info(`Server running in ${config.env} mode on port ${config.port}`);
  });

  // Initialize Socket.IO
  initSocket(server);

  // Initialize Market Data Service
  marketDataService.connectPolygon(process.env.POLYGON_API_KEY);

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    logger.error(`Error: ${err.message}`);
    // Close server & exit process
    server.close(() => process.exit(1));
  });
};

startServer();
