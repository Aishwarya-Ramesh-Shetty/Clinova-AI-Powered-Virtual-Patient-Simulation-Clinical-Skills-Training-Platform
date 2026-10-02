const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const groqService = require('./groqService');
const DEFAULT_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']);

// Exported call counter — used only in testing to verify Gemini budget
let callCount = 0;
const getCallCount = () => callCount;
const resetCallCount = () => { callCount = 0; };

// ─── Initialise client lazily so we give a clear error if key is missing ────
let _genAI = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'Gemini is not configured. Please add GEMINI_API_KEY to backend/.env'
    );
  }
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _genAI;
}

function getModelName() {
  return process.env.GEMINI_MODEL || 'gemini-3.7-flash';
}

function getModelNames() {
  const configuredFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  const fallbackModels = configuredFallbacks === undefined
    ? DEFAULT_FALLBACK_MODELS
    : configuredFallbacks.split(',').map((model) => model.trim()).filter(Boolean);

  return [...new Set([getModelName(), ...fallbackModels])];
}

function getFailureStatus(error) {
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    const status = Number(current.status || current.statusCode || current.response?.status);
    if (Number.isInteger(status) && status > 0) return `HTTP ${status}`;

    const messageStatus = typeof current.message === 'string' ? current.message.match(/\[(\d{3})\s/) : null;
    if (messageStatus) return `HTTP ${messageStatus[1]}`;

    if (current.code && RETRYABLE_NETWORK_CODES.has(current.code)) return `NETWORK ${current.code}`;
    if (current.name === 'TypeError' && /fetch failed|network error/i.test(current.message || '')) return 'NETWORK FETCH_FAILED';
    if (current.code === 'GROQ_NOT_CONFIGURED') return 'NOT_CONFIGURED';
    if (current.code === 'GROQ_INVALID_OUTPUT') return 'INVALID_OUTPUT';
    if (typeof current.code === 'string' && current.code.startsWith('GROQ_HTTP_')) return current.code.replace('GROQ_HTTP_', 'HTTP ');
  }

  return 'UNKNOWN';
}

function isRetryableError(error) {
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    const status = Number(current.status || current.statusCode || current.response?.status);
    if (RETRYABLE_HTTP_STATUSES.has(status)) return true;

    const messageStatus = typeof current.message === 'string' ? current.message.match(/\[(\d{3})\s/) : null;
    if (messageStatus && RETRYABLE_HTTP_STATUSES.has(Number(messageStatus[1]))) return true;

    if (current.code && RETRYABLE_NETWORK_CODES.has(current.code)) return true;
    if (current.name === 'TypeError' && /fetch failed|network error/i.test(current.message || '')) return true;
  }

  return false;
}

// ─── Helper: call Gemini with a system instruction + user prompt ─────────────
async function callGemini(systemInstruction, userPrompt, generationConfig) {
  const genAI = getClient();
  const modelNames = getModelNames();
  let allFailuresRetryable = true;

  for (let i = 0; i < modelNames.length; i += 1) {
    const modelName = modelNames[i];
    callCount++;

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        ...(generationConfig ? { generationConfig } : {})
      });
      const result = await model.generateContent(userPrompt);
      const text = result.response.text();

      // Strip markdown code fences if Gemini wraps output in ```json ... ```
      return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    } catch (error) {
      const status = getFailureStatus(error);
      const retryable = isRetryableError(error);
      if (!retryable) allFailuresRetryable = false;
      const canFallback = retryable && i < modelNames.length - 1;
      const label = i === 0 ? 'Gemini model failed' : 'Gemini fallback failed';
      console.warn(`[Gemini] ${label}: ${modelName} (${status})${canFallback ? '; trying next model.' : '.'}`);

      if (!canFallback) break;
    }
  }

  const error = new Error('Gemini model chain exhausted.');
  error.code = 'GEMINI_MODELS_EXHAUSTED';
  error.allowProviderFallback = allFailuresRetryable;
  throw error;
}

async function runGroqFallback(operation, args, validate, safeErrorMessage) {
  const modelName = groqService.getModelName();
  try {
    const result = await groqService[operation](...args);
    const validated = validate(result);
    console.info(`[Groq] fallback succeeded: ${modelName}`);
    return validated;
  } catch (error) {
    console.warn(`[Groq] fallback failed: ${modelName} (${getFailureStatus(error)})`);
    throw new Error(safeErrorMessage);
  }
}

function validateFollowUpQuestions(questions) {
  if (!Array.isArray(questions)) {
    throw new Error('Gemini response missing "questions" array.');
  }
  if (questions.length < 3 || questions.length > 4) {
    throw new Error(`Gemini returned ${questions.length} questions but 3–4 were expected.`);
  }
  for (const question of questions) {
    if (!question.questionId || !question.question) {
      throw new Error('Gemini question missing questionId or question text.');
    }
  }
  return questions;
}

function validateStructuredAssessment(parsed) {
  if (!parsed.chiefComplaint || !Array.isArray(parsed.symptoms)) {
    throw new Error('Gemini returned invalid structured assessment format.');
  }
  return parsed;
}

// ─── Helper: safely parse JSON from Gemini text ──────────────────────────────
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini returned malformed JSON — cannot parse response.');
  }
}

// ─── Helper: calculate age from date of birth ───────────────────────────────
function calcAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ════════════════════════════════════════════════════════════════════════════
// GEMINI CALL #1 — Generate 3–4 follow-up questions
// ════════════════════════════════════════════════════════════════════════════
async function generateFollowUpQuestions(initialSymptoms, patientInfo = {}, language = 'en') {
  const systemInstruction = `You are a medical intake assistant. Your ONLY role is to collect relevant information from a patient for a downstream clinical assessment service. You must NOT diagnose, recommend treatment, prescribe medication, or recommend a specialist. Generate only a small number of high-value questions that clarify the patient's reported symptoms.`;

  const age = calcAge(patientInfo.dateOfBirth);
  const patientContext = [
    age ? `Patient age: ${age}` : null,
    patientInfo.gender ? `Patient gender: ${patientInfo.gender}` : null,
    `Preferred language: ${language}`
  ].filter(Boolean).join('\n');

  const userPrompt = `A patient reports the following symptoms:
"${initialSymptoms}"

${patientContext}

Generate exactly 3 to 4 high-value follow-up questions to help a clinical assessment service understand this case better. Focus on: duration, severity, location, associated symptoms, relevant history, timing/pattern, or red-flag information when appropriate. Do NOT diagnose or recommend treatment.

Respond ONLY with valid JSON in this exact format:
{
  "questions": [
    { "questionId": "q1", "question": "..." },
    { "questionId": "q2", "question": "..." },
    { "questionId": "q3", "question": "..." }
  ]
}`;

  let raw;
  try {
    raw = await callGemini(systemInstruction, userPrompt);
  } catch (err) {
    if (err.allowProviderFallback) {
      return runGroqFallback(
        'generateFollowUpQuestions',
        [initialSymptoms, patientInfo, language],
        validateFollowUpQuestions,
        'Follow-up question generation is temporarily unavailable. Please try again.'
      );
    }
      throw new Error('AI intake service is temporarily unavailable. Please try again.');
  }

  const parsed = safeParseJSON(raw);
  return validateFollowUpQuestions(parsed.questions);
}

// ════════════════════════════════════════════════════════════════════════════
// GEMINI CALL #2 — Structure the complete Q&A into clinical evidence
// ════════════════════════════════════════════════════════════════════════════
async function structureAssessment(initialSymptoms, intakeQuestions, patientInfo = {}, language = 'en') {
  const systemInstruction = `You are a clinical information extraction assistant. Convert the patient's reported symptoms and question/answer session into structured clinical evidence. You must NOT diagnose, infer a disease, recommend treatment, prescribe medication, or recommend a specialist. Do NOT invent information. If something is unknown, represent it as null or an empty array. The downstream clinical assessment will be performed separately by a clinical decision service.`;

  const age = calcAge(patientInfo.dateOfBirth);
  const patientContext = [
    age ? `Patient age: ${age}` : null,
    patientInfo.gender ? `Patient gender: ${patientInfo.gender}` : null,
    `Preferred language: ${language}`
  ].filter(Boolean).join('\n');

  const qaLines = intakeQuestions
    .map(q => `Q (${q.questionId}): ${q.question}\nA: ${q.answer || '(not answered)'}`)
    .join('\n\n');

  const userPrompt = `A patient has completed a symptom intake session. Below is the information they provided.

Patient context:
${patientContext}

Initial symptoms reported:
"${initialSymptoms}"

Follow-up questions and answers:
${qaLines}

Based ONLY on the information above (do not invent anything), extract and return structured clinical evidence in this exact JSON format:
{
  "chiefComplaint": "...",
  "symptoms": [
    {
      "name": "...",
      "present": true,
      "duration": "...",
      "severity": null,
      "location": null
    }
  ],
  "relevantHistory": [],
  "associatedSymptoms": [],
  "redFlagInformation": [],
  "patientReportedInformation": []
}

Rules:
- Use null for any field the patient did not provide.
- Do NOT diagnose.
- Do NOT recommend a specialist.
- Do NOT suggest treatment or medication.
- Do NOT invent symptoms or history.`;

  let raw;
  try {
    raw = await callGemini(systemInstruction, userPrompt);
  } catch (err) {
    if (err.allowProviderFallback) {
      return runGroqFallback(
        'structureAssessment',
        [initialSymptoms, intakeQuestions, patientInfo, language],
        validateStructuredAssessment,
        'Assessment structuring is temporarily unavailable. Please try again.'
      );
    }
      throw new Error('AI intake service is temporarily unavailable. Please try again.');
  }

  const parsed = safeParseJSON(raw);
  return validateStructuredAssessment(parsed);
}

async function generateClinicalAssessment({ initialSymptoms, structuredSymptoms, intakeQuestions, age, gender }) {
  const systemInstruction = `You are a clinical decision-support component for an academic software prototype. You are NOT a doctor. You must NOT claim that the patient definitely has a disease. Return possible conditions only. Base all possible conditions strictly on the evidence provided. Do not invent symptoms. Do not convert missing information into negative evidence. Do not recommend medication dosage or treatment. Do not provide a definitive diagnosis. When evidence is insufficient, use low confidence and say that further professional evaluation is needed. When potentially serious symptoms are present, prioritize the appropriate triage level rather than attempting to provide reassurance. Use the patient's age and sex only when they are actually available. Do not infer age, sex, medical history, pregnancy, medications, allergies, or other facts that were not provided. For specialist recommendations, use the clinical presentation and explicitly identified symptoms/evidence. Do not use a hardcoded disease-to-specialist mapping. When the presentation is nonspecific or evidence is insufficient, prefer General Physician rather than guessing a narrow specialty. Triage must be exactly one of emergency, urgent, routine. Return only JSON matching the supplied schema.`;

  const patientReportedFacts = {
    initialSymptoms: initialSymptoms || '',
    followUpAnswers: (Array.isArray(intakeQuestions) ? intakeQuestions : []).map(({ questionId, question, answer }) => ({
      questionId,
      question,
      patientAnswer: answer || null
    }))
  };
  const demographics = {
    age: Number.isInteger(age) && age >= 0 ? age : null,
    gender: typeof gender === 'string' && gender.trim() ? gender.trim() : null
  };
  const userPrompt = `Assess the patient's reported presentation using the supplied output schema.

PATIENT-REPORTED FACTS (the only source of clinical evidence):
${JSON.stringify(patientReportedFacts, null, 2)}

PATIENT DEMOGRAPHICS (null means not provided; do not infer):
${JSON.stringify(demographics, null, 2)}

MODEL-DERIVED INFORMATION (from an earlier evidence-structuring step; use only as an index to the patient-reported facts above, never as independent evidence):
${JSON.stringify(structuredSymptoms || {}, null, 2)}

Every possible condition's evidence must quote or accurately summarize explicit patient-reported facts. If the model-derived information conflicts with or is unsupported by patient-reported facts, ignore it. If evidence is insufficient, return an empty or low-confidence possible-conditions list, routine/urgent triage as supported, and request professional evaluation in followUpNeeded. Set redFlags.detected to true only for evidence explicitly reported by the patient. The disclaimer must be: "This assessment is for informational and educational purposes only and does not replace evaluation by a qualified healthcare professional."`;

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      possibleConditions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            reason: { type: SchemaType.STRING },
            evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            confidence: { type: SchemaType.STRING, enum: ['low', 'moderate', 'high'] }
          },
          required: ['name', 'reason', 'evidence', 'confidence']
        }
      },
      triage: {
        type: SchemaType.OBJECT,
        properties: {
          level: { type: SchemaType.STRING, enum: ['emergency', 'urgent', 'routine'] },
          reason: { type: SchemaType.STRING }
        },
        required: ['level', 'reason']
      },
      redFlags: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            flag: { type: SchemaType.STRING },
            detected: { type: SchemaType.BOOLEAN },
            reason: { type: SchemaType.STRING }
          },
          required: ['flag', 'detected', 'reason']
        }
      },
      recommendedSpecialist: {
        type: SchemaType.OBJECT,
        properties: {
          specialty: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING }
        },
        required: ['specialty', 'reason']
      },
      followUpNeeded: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      disclaimer: { type: SchemaType.STRING }
    },
    required: ['possibleConditions', 'triage', 'redFlags', 'recommendedSpecialist', 'followUpNeeded', 'disclaimer']
  };

  let raw;
  try {
    raw = await callGemini(systemInstruction, userPrompt, {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.1
    });
  } catch {
    const error = new Error('Gemini clinical assessment is temporarily unavailable. Please try again.');
    error.statusCode = 502;
    error.code = 'CLINICAL_ASSESSMENT_UNAVAILABLE';
    throw error;
  }

  return parseClinicalAssessmentResponse(raw);
}

function parseClinicalAssessmentResponse(raw) {
  try {
    return safeParseJSON(raw);
  } catch {
    const error = new Error('Gemini returned malformed clinical assessment data. Please retry the assessment.');
    error.statusCode = 502;
    error.code = 'MALFORMED_CLINICAL_ASSESSMENT';
    throw error;
  }
}

module.exports = {
  generateFollowUpQuestions,
  structureAssessment,
  generateClinicalAssessment,
  parseClinicalAssessmentResponse,
  getCallCount,
  resetCallCount
};
