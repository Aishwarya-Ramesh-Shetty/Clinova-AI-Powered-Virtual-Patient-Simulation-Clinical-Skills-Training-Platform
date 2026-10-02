const Groq = require('groq-sdk');

const FOLLOW_UP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          questionId: { type: 'string' },
          question: { type: 'string' }
        },
        required: ['questionId', 'question']
      }
    }
  },
  required: ['questions']
};

const STRUCTURED_ASSESSMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    chiefComplaint: { type: 'string' },
    symptoms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          present: { type: 'boolean' },
          duration: { type: ['string', 'null'] },
          severity: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] }
        },
        required: ['name', 'present', 'duration', 'severity', 'location']
      }
    },
    relevantHistory: { type: 'array', items: { type: 'string' } },
    associatedSymptoms: { type: 'array', items: { type: 'string' } },
    redFlagInformation: { type: 'array', items: { type: 'string' } },
    patientReportedInformation: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'chiefComplaint',
    'symptoms',
    'relevantHistory',
    'associatedSymptoms',
    'redFlagInformation',
    'patientReportedInformation'
  ]
};

let client;

function getModelName() {
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}

function getClient() {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error('Groq fallback is not configured.');
    error.code = 'GROQ_NOT_CONFIGURED';
    throw error;
  }

  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });
  }
  return client;
}

function outputError() {
  const error = new Error('Groq returned invalid structured output.');
  error.code = 'GROQ_INVALID_OUTPUT';
  return error;
}

async function requestStructuredOutput(instructions, input, schemaName, schema) {
  let response;
  try {
    response = await getClient().chat.completions.create({
      model: getModelName(),
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: input }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema }
      }
    });
  } catch (error) {
    const safeError = new Error('Groq fallback request failed.');
    safeError.status = error.status;
    safeError.code = error.status ? `GROQ_HTTP_${error.status}` : 'GROQ_REQUEST_FAILED';
    throw safeError;
  }

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw outputError();

  try {
    return JSON.parse(content);
  } catch {
    throw outputError();
  }
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
  return age;
}

function validateQuestions(output) {
  if (!Array.isArray(output?.questions) || output.questions.length < 3 || output.questions.length > 4) throw outputError();
  for (const question of output.questions) {
    if (!question?.questionId || !question?.question) throw outputError();
  }
  return output.questions;
}

function validateStructuredAssessment(output) {
  if (!output || typeof output.chiefComplaint !== 'string' || !output.chiefComplaint.trim() || !Array.isArray(output.symptoms)) {
    throw outputError();
  }
  return output;
}

async function generateFollowUpQuestions(initialSymptoms, patientInfo = {}, language = 'en') {
  const systemInstruction = 'You are a medical intake assistant. Your ONLY role is to collect relevant information from a patient for a downstream clinical assessment service. You must NOT diagnose, recommend treatment, prescribe medication, or recommend a specialist. Generate only a small number of high-value questions that clarify the patient\'s reported symptoms. Do not invent symptoms or patient information. Return only the requested JSON structure.';
  const age = calculateAge(patientInfo.dateOfBirth);
  const patientContext = [
    age ? `Patient age: ${age}` : null,
    patientInfo.gender ? `Patient gender: ${patientInfo.gender}` : null,
    `Preferred language: ${language}`
  ].filter(Boolean).join('\n');
  const input = `A patient reports the following symptoms:\n"${initialSymptoms}"\n\n${patientContext}\n\nGenerate exactly 3 to 4 high-value follow-up questions to clarify duration, severity, location, associated symptoms, relevant history, timing/pattern, or red-flag information when appropriate. Do NOT diagnose or recommend treatment.`;
  const output = await requestStructuredOutput(systemInstruction, input, 'clinova_follow_up_questions', FOLLOW_UP_SCHEMA);
  return validateQuestions(output);
}

async function structureAssessment(initialSymptoms, intakeQuestions, patientInfo = {}, language = 'en') {
  const systemInstruction = 'You are a clinical information extraction assistant. Convert the patient\'s reported symptoms and question/answer session into structured clinical evidence. You must NOT diagnose, infer a disease, recommend treatment, prescribe medication, or recommend a specialist. Do NOT invent information. If something is unknown, represent it as null or an empty array. Only explicit patient-reported facts are clinical evidence; missing information must never become negative evidence. The downstream deterministic safety/red-flag layer remains independent and must not be bypassed.';
  const age = calculateAge(patientInfo.dateOfBirth);
  const patientContext = [
    age ? `Patient age: ${age}` : null,
    patientInfo.gender ? `Patient gender: ${patientInfo.gender}` : null,
    `Preferred language: ${language}`
  ].filter(Boolean).join('\n');
  const qaLines = intakeQuestions
    .map((question) => `Q (${question.questionId}): ${question.question}\nA: ${question.answer || '(not answered)'}`)
    .join('\n\n');
  const input = `A patient has completed a symptom intake session. Below is the information they provided.\n\nPatient context:\n${patientContext}\n\nInitial symptoms reported:\n"${initialSymptoms}"\n\nFollow-up questions and answers:\n${qaLines}\n\nBased ONLY on the information above, extract structured clinical evidence. Do not diagnose, recommend treatment, prescribe medication, or recommend a specialist. Use null or empty arrays for information the patient did not provide.`;
  const output = await requestStructuredOutput(systemInstruction, input, 'clinova_structured_assessment', STRUCTURED_ASSESSMENT_SCHEMA);
  return validateStructuredAssessment(output);
}

module.exports = { generateFollowUpQuestions, structureAssessment, getModelName };