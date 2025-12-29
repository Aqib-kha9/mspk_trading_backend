import express from 'express';
import authRoute from './auth.route.js';
import strategyRoute from './strategy.route.js';
import adminRoute from './admin.route.js';
import planRoute from './plan.route.js';
import subscriptionRoute from './subscription.route.js';
import signalRoute from './signal.route.js';
import dashboardRoute from './dashboard.route.js';
import subBrokerRoute from './subBroker.route.js';
import settingRoute from './setting.route.js';

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/strategies',
    route: strategyRoute,
  },
  {
    path: '/admin',
    route: adminRoute,
  },
  {
    path: '/plans',
    route: planRoute,
  },
  {
    path: '/subscriptions',
    route: subscriptionRoute,
  },
  {
    path: '/signals',
    route: signalRoute,
  },
  {
    path: '/dashboard', // Covers tickets and stats
    route: dashboardRoute,
  },
  {
    path: '/sub-brokers',
    route: subBrokerRoute,
  },
  {
    path: '/settings',
    route: settingRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
