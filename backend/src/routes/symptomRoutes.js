const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  analyzeSymptoms,
  createSession,
  submitAnswer,
  getSession,
  prepareSession,
  assessSession,
  getHistory
} = require('../controllers/symptomController');

const router = express.Router();

// All routes protected by patient JWT

// One-shot analysis — what the frontend calls
router.post('/analyze', protect, analyzeSymptoms);

// Session-based assessment flow
router.get( '/history',                       protect, getHistory);
router.post('/sessions',                      protect, createSession);
router.post('/sessions/:sessionId/answers',   protect, submitAnswer);
router.get( '/sessions/:sessionId',           protect, getSession);
router.post('/sessions/:sessionId/prepare',   protect, prepareSession);
router.post('/sessions/:sessionId/assess',    protect, assessSession);

module.exports = router;
