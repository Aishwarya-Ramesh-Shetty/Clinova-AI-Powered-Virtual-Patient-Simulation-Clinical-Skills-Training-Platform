const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { generateSummary, getSummary } = require('../controllers/summaryController');

const router = express.Router();

router.post('/generate', protect, generateSummary);
router.get('/:appointmentId', protect, getSummary);

module.exports = router;
