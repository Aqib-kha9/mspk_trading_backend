import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { redisSubscriber } from './redis.service.js';
import logger from '../config/logger.js';

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [config.frontendUrl, "http://localhost:5173", "http://localhost:3000", "*"], 
      methods: ['GET', 'POST'],
      credentials: true
    },
  });

  // Middleware for Auth
  io.use((socket, next) => {
    try {
        const token = socket.handshake.query.token;
        
        if (token && token !== 'null' && token !== 'undefined') {
        jwt.verify(socket.handshake.query.token, config.jwt.secret, (err, decoded) => {
            if (err) {
                logger.error(`Socket Auth Failed: ${err.message}`);
                return next(new Error('Authentication error'));
            }
            socket.decoded = decoded;
            next();
        });
        } else {
            logger.warn('Socket connection rejected: No token provided');
            next(new Error('Authentication error'));
        }
    } catch (error) {
        logger.error(`Socket Middleware Error: ${error.message}`);
        next(new Error('Internal Server Error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client subscribes to a specific symbol room
    socket.on('subscribe', (symbol) => {
      if (symbol) {
        socket.join(symbol);
        logger.debug(`Socket ${socket.id} joined ${symbol}`);
      }
    });

    socket.on('unsubscribe', (symbol) => {
      if (symbol) {
        socket.leave(symbol);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // Listen to Redis Market Data
  redisSubscriber.subscribe('market_data', (err) => {
      if (err) logger.error('Failed to subscribe to market_data channel');
  });
  
  // Listen to Redis Market Stats
  redisSubscriber.subscribe('market_stats', (err) => {
      if (err) logger.error('Failed to subscribe to market_stats channel');
  });

  redisSubscriber.on('message', (channel, message) => {
    try {
        const data = JSON.parse(message);
        
        if (channel === 'market_data') {
            // Data can be a single tick or an array of ticks
            const ticks = Array.isArray(data) ? data : [data];
            
            ticks.forEach(tick => {
                if (tick.symbol) {
                    io.to(tick.symbol).emit('tick', tick);
                }
            });
        } else if (channel === 'market_stats') {
            // Broadcast globally (or to specific admin room if needed)
            io.emit('market_stats', data);
        }
    } catch (error) {
        logger.error('Socket Broadcast Error', error);
    }
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export {
  initSocket,
  getIo,
};
