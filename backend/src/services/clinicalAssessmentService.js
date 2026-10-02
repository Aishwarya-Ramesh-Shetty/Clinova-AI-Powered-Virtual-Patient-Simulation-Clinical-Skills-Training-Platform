const geminiService = require('./geminiService');

const DISCLAIMER = 'This assessment is for informational and educational purposes only and does not replace evaluation by a qualified healthcare professional.';
const CONFIDENCE_LEVELS = new Set(['low', 'moderate', 'high']);
const TRIAGE_LEVELS = new Set(['emergency', 'urgent', 'routine']);

function invalidAssessment(message) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = 'INVALID_CLINICAL_ASSESSMENT';
  return error;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidAssessment(`Gemini clinical assessment has an invalid ${field} field.`);
  }
  return value.trim();
}

function validateClinicalAssessment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidAssessment('Gemini clinical assessment must be a JSON object.');
  }
  if (!Array.isArray(value.possibleConditions) || !Array.isArray(value.redFlags) || !Array.isArray(value.followUpNeeded)) {
    throw invalidAssessment('Gemini clinical assessment is missing required arrays.');
  }
  if (!value.triage || !TRIAGE_LEVELS.has(value.triage.level)) {
    throw invalidAssessment('Gemini clinical assessment has an invalid triage level.');
  }
  if (!value.recommendedSpecialist || typeof value.recommendedSpecialist.specialty !== 'string' || !value.recommendedSpecialist.specialty.trim()) {
    throw invalidAssessment('Gemini clinical assessment must include a recommended specialty.');
  }

  const possibleConditions = value.possibleConditions.map((condition) => {
    if (!condition || !CONFIDENCE_LEVELS.has(condition.confidence) || !Array.isArray(condition.evidence)) {
      throw invalidAssessment('Gemini clinical assessment contains an invalid possible condition.');
    }
    return {
      name: requireText(condition.name, 'condition name'),
      reason: requireText(condition.reason, 'condition reason'),
      evidence: condition.evidence.map((item) => requireText(item, 'condition evidence')),
      confidence: condition.confidence
    };
  });

  const redFlags = value.redFlags.map((redFlag) => {
    if (!redFlag || typeof redFlag.detected !== 'boolean') {
      throw invalidAssessment('Gemini clinical assessment contains an invalid red flag.');
    }
    return {
      flag: requireText(redFlag.flag, 'red flag'),
      detected: redFlag.detected,
      reason: requireText(redFlag.reason, 'red flag reason')
    };
  });

  return {
    possibleConditions,
    triage: {
      level: value.triage.level,
      reason: requireText(value.triage.reason, 'triage reason')
    },
    redFlags,
    recommendedSpecialist: {
      specialty: requireText(value.recommendedSpecialist.specialty, 'recommended specialty'),
      reason: requireText(value.recommendedSpecialist.reason, 'specialist reason')
    },
    followUpNeeded: value.followUpNeeded.map((item) => requireText(item, 'follow-up item')),
    disclaimer: DISCLAIMER
  };
}

async function assessPatient(input) {
  let generated;
  try {
    generated = await geminiService.generateClinicalAssessment(input);
  } catch (error) {
    if (error.statusCode && error.code) throw error;
    const assessmentError = new Error('Clinical assessment is temporarily unavailable. Please try again.');
    assessmentError.statusCode = 502;
    assessmentError.code = 'CLINICAL_ASSESSMENT_UNAVAILABLE';
    throw assessmentError;
  }
  return validateClinicalAssessment(generated);
}

module.exports = { assessPatient, validateClinicalAssessment, DISCLAIMER };