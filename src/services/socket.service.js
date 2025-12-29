import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { redisSubscriber } from './redis.service.js';
import logger from '../config/logger.js';

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Adjust for production
      methods: ['GET', 'POST'],
    },
  });

  // Middleware for Auth
  io.use((socket, next) => {
    if (socket.handshake.query && socket.handshake.query.token) {
      jwt.verify(socket.handshake.query.token, config.jwt.secret, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.decoded = decoded;
        next();
      });
    } else {
      next(new Error('Authentication error'));
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

  redisSubscriber.on('message', (channel, message) => {
    if (channel === 'market_data') {
      try {
        const data = JSON.parse(message);
        // Broadcast to the specific symbol room
        // data.symbol must exist
        if (data.symbol) {
            io.to(data.symbol).emit('tick', data);
        }
      } catch (error) {
        logger.error('Socket Broadcast Error', error);
      }
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
