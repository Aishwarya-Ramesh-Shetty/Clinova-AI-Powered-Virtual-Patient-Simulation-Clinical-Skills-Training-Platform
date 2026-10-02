const mongoose = require('mongoose');
const AssessmentSession = require('../models/AssessmentSession');
const { generateFollowUpQuestions, structureAssessment } = require('../services/geminiService');
const clinicalAssessmentService = require('../services/clinicalAssessmentService');
const { evaluateClinicalSafety } = require('../services/clinicalSafetyService');
const { sendResponse } = require('../utils/helpers');

// ─── Helper: validate Mongoose ObjectId ──────────────────────────────────────
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function calculatePatientAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function assessmentSessionPayload(session) {
  return {
    id: session._id,
    status: session.status,
    structuredSymptoms: session.structuredSymptoms,
    clinicalAssessment: session.clinicalAssessment,
    completedAt: session.completedAt
  };
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/symptoms/sessions
// Create a new assessment session and trigger Gemini Call #1
// ════════════════════════════════════════════════════════════════════════════
exports.createSession = async (req, res, next) => {
  try {
    const { symptoms, language = 'en' } = req.body;

    if (!symptoms || !symptoms.trim()) {
      return res.status(400).json({
        success: false, data: null,
        message: 'Symptoms are required to start an assessment session.'
      });
    }

    // Create session immediately so we have an ID even if Gemini fails
    let session = new AssessmentSession({
      patientId:       req.user._id,
      initialSymptoms: symptoms.trim(),
      language,
      status:          'intake'
    });
    await session.save();

    // ── Gemini Call #1 ─────────────────────────────────────────────────────
    let questions;
    try {
      questions = await generateFollowUpQuestions(
        symptoms.trim(),
        { dateOfBirth: req.user.dateOfBirth, gender: req.user.gender },
        language
      );
    } catch (geminiErr) {
      // Mark session as failed and return a safe provider-independent error.
      session.status = 'failed';
      await session.save();
      return res.status(502).json({
        success: false, data: null,
        message: 'AI intake service is temporarily unavailable. Please try again.'
      });
    }

    // Store questions (no answers yet)
    session.intakeQuestions = questions.map(q => ({
      questionId: q.questionId,
      question:   q.question,
      answer:     null,
      answeredAt: null
    }));
    await session.save();

    sendResponse(res, 201, {
      session: {
        id:             session._id,
        initialSymptoms: session.initialSymptoms,
        language:        session.language,
        status:          session.status,
        questions:       session.intakeQuestions
      }
    }, 'Assessment session created');

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/symptoms/sessions/:sessionId/answers
// Store a patient answer — NO Gemini call
// ════════════════════════════════════════════════════════════════════════════
exports.submitAnswer = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { questionId, answer } = req.body;

    if (!isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid session ID.' });
    }
    if (!questionId) {
      return res.status(400).json({ success: false, data: null, message: 'questionId is required.' });
    }
    if (answer === undefined || answer === null || String(answer).trim() === '') {
      return res.status(400).json({ success: false, data: null, message: 'answer is required.' });
    }

    const session = await AssessmentSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, data: null, message: 'Session not found.' });
    }
    if (String(session.patientId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, data: null, message: 'Access denied to this session.' });
    }
    if (session.status === 'ready_for_assessment' || session.status === 'completed') {
      return res.status(400).json({
        success: false, data: null,
        message: 'Session is already finalised and cannot be modified.'
      });
    }

    const question = session.intakeQuestions.find(q => q.questionId === questionId);
    if (!question) {
      return res.status(404).json({ success: false, data: null, message: `Question "${questionId}" not found in this session.` });
    }

    // Store / overwrite answer — pure DB write, zero Gemini calls
    question.answer     = String(answer).trim();
    question.answeredAt = new Date();
    session.markModified('intakeQuestions');
    await session.save();

    sendResponse(res, 200, {
      sessionId: session._id,
      status:    session.status,
      questions: session.intakeQuestions
    }, 'Answer saved');

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /api/symptoms/sessions/:sessionId
// Return full session state for the authenticated owner
// ════════════════════════════════════════════════════════════════════════════
exports.getSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid session ID.' });
    }

    const session = await AssessmentSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, data: null, message: 'Session not found.' });
    }
    if (String(session.patientId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, data: null, message: 'Access denied to this session.' });
    }

    sendResponse(res, 200, {
      session: {
        id:                 session._id,
        initialSymptoms:    session.initialSymptoms,
        language:           session.language,
        status:             session.status,
        questions:          session.intakeQuestions,
        structuredSymptoms: session.structuredSymptoms,
        clinicalAssessment: session.clinicalAssessment,
        createdAt:          session.createdAt,
        updatedAt:          session.updatedAt,
        completedAt:        session.completedAt
      }
    }, '');

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/symptoms/sessions/:sessionId/assess
// Run constrained Gemini assessment and deterministic safety checks
// ════════════════════════════════════════════════════════════════════════════
exports.assessSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid session ID.' });
    }

    const session = await AssessmentSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, data: null, message: 'Session not found.' });
    }
    if (String(session.patientId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, data: null, message: 'Access denied to this session.' });
    }
    if (session.status === 'completed') {
      return sendResponse(res, 200, { session: assessmentSessionPayload(session) }, 'Assessment already completed');
    }
    if (session.status === 'assessing') {
      return res.status(409).json({ success: false, data: null, message: 'This session is already being assessed.' });
    }
    if (!session.structuredSymptoms || !session.completedAt || !['ready_for_assessment', 'failed'].includes(session.status)) {
      return res.status(400).json({ success: false, data: null, message: 'Prepare the completed intake before running the clinical assessment.' });
    }

    const unanswered = session.intakeQuestions.filter((question) => !question.answer || !question.answer.trim());
    if (unanswered.length > 0) {
      return res.status(400).json({ success: false, data: null, message: 'All follow-up questions must be answered before assessment.' });
    }

    const age = calculatePatientAge(req.user.dateOfBirth);
    session.status = 'assessing';
    await session.save();

    try {
      const assessment = await clinicalAssessmentService.assessPatient({
        initialSymptoms: session.initialSymptoms,
        structuredSymptoms: session.structuredSymptoms,
        intakeQuestions: session.intakeQuestions.map(({ questionId, question, answer }) => ({ questionId, question, answer })),
        age,
        gender: req.user.gender || null
      });
      const safety = evaluateClinicalSafety([
        session.initialSymptoms,
        ...session.intakeQuestions.map((question) => question.answer).filter(Boolean)
      ]);

      const finalAssessment = safety.override
        ? {
            ...assessment,
            triage: {
              level: 'emergency',
              reason: 'An explicit high-risk symptom was reported. Immediate emergency professional evaluation is recommended.'
            },
            redFlags: [
              ...assessment.redFlags.filter((redFlag) => !safety.flags.some((flag) => flag.flag === redFlag.flag)),
              ...safety.flags
            ]
          }
        : assessment;

      session.clinicalAssessment = finalAssessment;
      session.status = 'completed';
      await session.save();

      return sendResponse(res, 200, { session: assessmentSessionPayload(session) }, 'Clinical assessment completed');
    } catch (assessmentError) {
      session.status = 'failed';
      await session.save();
      return res.status(assessmentError.statusCode || 502).json({
        success: false,
        data: null,
        message: assessmentError.message || 'The clinical assessment could not be completed.',
        code: assessmentError.code || 'ASSESSMENT_FAILED'
      });
    }
  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/symptoms/sessions/:sessionId/prepare
// Validate answers then trigger Gemini Call #2 to structure clinical evidence
// ════════════════════════════════════════════════════════════════════════════
exports.prepareSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid session ID.' });
    }

    const session = await AssessmentSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, data: null, message: 'Session not found.' });
    }
    if (String(session.patientId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, data: null, message: 'Access denied to this session.' });
    }
    if (session.status === 'ready_for_assessment' || session.status === 'completed') {
      return res.status(400).json({
        success: false, data: null,
        message: 'Session has already been prepared.'
      });
    }
    if (session.status === 'failed') {
      return res.status(400).json({
        success: false, data: null,
        message: 'Cannot prepare a failed session.'
      });
    }

    // Check all questions have been answered
    const unanswered = session.intakeQuestions.filter(q => !q.answer);
    if (unanswered.length > 0) {
      const ids = unanswered.map(q => q.questionId).join(', ');
      return res.status(400).json({
        success: false, data: null,
        message: `The following questions have not been answered yet: ${ids}`
      });
    }

    // ── Gemini Call #2 ─────────────────────────────────────────────────────
    let structured;
    try {
      structured = await structureAssessment(
        session.initialSymptoms,
        session.intakeQuestions,
        { dateOfBirth: req.user.dateOfBirth, gender: req.user.gender },
        session.language
      );
    } catch (geminiErr) {
      session.status = 'failed';
      await session.save();
      return res.status(502).json({
        success: false, data: null,
        message: 'AI intake service is temporarily unavailable. Please try again.'
      });
    }

    session.structuredSymptoms = structured;
    session.status             = 'ready_for_assessment';
    session.completedAt        = new Date();
    await session.save();

    sendResponse(res, 200, {
      session: {
        id:                 session._id,
        status:             session.status,
        structuredSymptoms: session.structuredSymptoms,
        completedAt:        session.completedAt
      }
    }, 'Session prepared — structured clinical evidence ready for assessment');

  } catch (err) {
    next(err);
  }
};
