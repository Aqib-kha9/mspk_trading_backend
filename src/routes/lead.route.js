import express from 'express';
import validate from '../middleware/validate.js'; // Assuming you have validation logic, skipping for speed or basic valid
import leadController from '../controllers/lead.controller.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Public: Create Request
router.post('/', leadController.createLead);

// Admin: View Leads
router.get('/', auth(['admin']), leadController.getLeads);

export default router;
