import express from 'express';
import marketController from '../controllers/market.controller.js';
// import auth from '../middlewares/auth.js'; 

const router = express.Router();

// Public routes for now (or protect them as needed)
router.post('/seed', marketController.seedMarketData);

// Segments
router.get('/segments', marketController.getSegments);
router.post('/segments', marketController.createSegment);
router.patch('/segments/:id', marketController.updateSegment);
router.delete('/segments/:id', marketController.deleteSegment);

// Symbols
router.get('/symbols', marketController.getSymbols);
router.post('/symbols', marketController.createSymbol);
router.patch('/symbols/:id', marketController.updateSymbol);
router.delete('/symbols/:id', marketController.deleteSymbol);

router.get('/stats', marketController.getMarketStats); // New Stats Route
router.post('/login/:provider', marketController.handleLogin); // Generic Login Endpoint
router.get('/login/:provider/url', marketController.getLoginUrl); // Generic Login URL

export default router;
