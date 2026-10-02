const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  createSession,
  submitAnswer,
  getSession,
  prepareSession
} = require('../controllers/symptomController');

const router = express.Router();

// All routes are protected — require valid JWT
router.post('/sessions',                      protect, createSession);
router.post('/sessions/:sessionId/answers',   protect, submitAnswer);
router.get( '/sessions/:sessionId',           protect, getSession);
router.post('/sessions/:sessionId/prepare',   protect, prepareSession);

module.exports = router;
