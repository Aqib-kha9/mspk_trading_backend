import express from 'express';
import auth from '../middleware/auth.js';
import subBrokerController from '../controllers/subBroker.controller.js';

const router = express.Router();

router.use(auth());

// Admin Routes
router.get('/', auth(['admin']), subBrokerController.getSubBrokers);
router.get('/:subBrokerId/details', auth(['admin']), subBrokerController.getSubBrokerDetails);

// Sub-Broker Routes (Self)
router.get('/clients', auth(['sub-broker']), subBrokerController.getMyClients);
router.get('/commissions', auth(['sub-broker']), subBrokerController.getMyCommissions);

export default router;
