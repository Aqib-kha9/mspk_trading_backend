import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/config.js';
import routes from './routes/index.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(cors());

// Logger
if (config.env === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.use('/v1', routes);

// Error handling
app.use((err, req, res, next) => {
  const { statusCode, message } = err;
  res.status(statusCode || 500).json({
    status: 'error',
    statusCode: statusCode || 500,
    message: message || 'Internal Server Error',
  });
});

export default app;
