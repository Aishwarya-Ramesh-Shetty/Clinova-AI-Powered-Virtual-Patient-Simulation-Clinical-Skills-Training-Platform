const { GoogleGenerativeAI } = require('@google/generative-ai');

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
  return process.env.GEMINI_MODEL || 'gemini-1.5-flash';
}

// ─── Helper: call Gemini with a system instruction + user prompt ─────────────
async function callGemini(systemInstruction, userPrompt) {
  callCount++; // track every real API call for budget enforcement
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();

  // Strip markdown code fences if Gemini wraps output in ```json ... ```
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
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
    throw new Error(`Gemini API error during question generation: ${err.message}`);
  }

  const parsed = safeParseJSON(raw);

  if (!Array.isArray(parsed.questions)) {
    throw new Error('Gemini response missing "questions" array.');
  }
  if (parsed.questions.length < 3 || parsed.questions.length > 4) {
    throw new Error(
      `Gemini returned ${parsed.questions.length} questions but 3–4 were expected.`
    );
  }
  for (const q of parsed.questions) {
    if (!q.questionId || !q.question) {
      throw new Error('Gemini question missing questionId or question text.');
    }
  }

  return parsed.questions;
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
    throw new Error(`Gemini API error during assessment structuring: ${err.message}`);
  }

  const parsed = safeParseJSON(raw);

  if (!parsed.chiefComplaint || !Array.isArray(parsed.symptoms)) {
    throw new Error('Gemini returned invalid structured assessment format.');
  }

  return parsed;
}

module.exports = { generateFollowUpQuestions, structureAssessment, getCallCount, resetCallCount };
