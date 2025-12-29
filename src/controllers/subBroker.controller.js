import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { subBrokerService } from '../services/index.js';

const getSubBrokers = catchAsync(async (req, res) => {
    const subBrokers = await subBrokerService.getSubBrokers();
    res.send(subBrokers);
});

// For Sub-Broker Self View
const getMyClients = catchAsync(async (req, res) => {
    const clients = await subBrokerService.getSubBrokerClients(req.user.id);
    res.send(clients);
});

const getMyCommissions = catchAsync(async (req, res) => {
    const commissions = await subBrokerService.getCommissions(req.user.id);
    res.send(commissions);
});

// Admin View of specific sub-broker stats
const getSubBrokerDetails = catchAsync(async (req, res) => {
    const clients = await subBrokerService.getSubBrokerClients(req.params.subBrokerId);
    const commissions = await subBrokerService.getCommissions(req.params.subBrokerId);
    res.send({ clients, commissions });
});

export default {
  getSubBrokers,
  getMyClients,
  getMyCommissions,
  getSubBrokerDetails
};
