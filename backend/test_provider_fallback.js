require('./src/config/env');

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const AssessmentSession = require('./src/models/AssessmentSession');
const geminiService = require('./src/services/geminiService');
const groqService = require('./src/services/groqService');

const originalEnv = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  geminiFallbacks: process.env.GEMINI_FALLBACK_MODELS,
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL
};
const originalGeminiMethod = GoogleGenerativeAI.prototype.getGenerativeModel;
const originalGroqQuestions = groqService.generateFollowUpQuestions;
const originalGroqStructure = groqService.structureAssessment;
const modelCalls = [];
const createdUsers = [];
let geminiMode = 'fail';
let groqQuestionMode = 'success';
let groqStructureMode = 'success';
let groqQuestionCalls = 0;
let groqStructureCalls = 0;
let appServer;
let groqCompletionsPrototype;
let originalGroqCompletionCreate;

const questions = [
  { questionId: 'q1', question: 'When did this synthetic complaint begin?' },
  { questionId: 'q2', question: 'How severe is it?' },
  { questionId: 'q3', question: 'Where do you feel it?' }
];
const structuredAssessment = {
  chiefComplaint: 'Synthetic headache complaint',
  symptoms: [{ name: 'Headache', present: true, duration: 'two days', severity: null, location: null }],
  relevantHistory: [],
  associatedSymptoms: [],
  redFlagInformation: [],
  patientReportedInformation: []
};

function assertGeminiChain() {
  assert.deepEqual(modelCalls, ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
}

async function createTestPatient() {
  const email = `provider-fallback-${Date.now()}-${createdUsers.length}@clinova.test`;
  const patient = await User.create({
    name: 'Synthetic Provider Test',
    email,
    password: 'TemporaryTestPassword123!',
    gender: 'female',
    dateOfBirth: '1995-01-01'
  });
  createdUsers.push(patient);
  return patient;
}

async function requestSession(port, patient) {
  const token = jwt.sign(
    { userId: String(patient._id) },
    process.env.JWT_SECRET || 'clinova_jwt_secret_2026'
  );
  return fetch(`http://127.0.0.1:${port}/api/symptoms/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ symptoms: 'I have a headache for two days.', language: 'en' })
  });
}

async function run() {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-3.7-flash';
  process.env.GEMINI_FALLBACK_MODELS = 'gemini-3.6-flash,gemini-3.5-flash-lite';
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GROQ_MODEL = 'openai/gpt-oss-120b';

  GoogleGenerativeAI.prototype.getGenerativeModel = function ({ model }) {
    modelCalls.push(model);
    return {
      generateContent: async () => {
        if (geminiMode === 'primary-success' && model === 'gemini-3.7-flash') {
          const body = JSON.stringify({ questions });
          return { response: { text: () => body } };
        }
        if (geminiMode === 'structured-success' && model === 'gemini-3.7-flash') {
          const body = JSON.stringify(structuredAssessment);
          return { response: { text: () => body } };
        }
        const error = new Error('simulated transient provider failure');
        error.status = 503;
        throw error;
      }
    };
  };

  groqService.generateFollowUpQuestions = async () => {
    groqQuestionCalls += 1;
    if (groqQuestionMode === 'fail') throw new Error('simulated Groq failure');
    if (groqQuestionMode === 'malformed') return [{ questionId: '', question: '' }];
    return questions;
  };
  groqService.structureAssessment = async () => {
    groqStructureCalls += 1;
    if (groqStructureMode === 'fail') throw new Error('simulated Groq failure');
    return structuredAssessment;
  };

  try {
    console.log('Gemini-to-Groq provider fallback tests');

    geminiMode = 'primary-success';
    modelCalls.length = 0;
    groqQuestionCalls = 0;
    const primaryQuestions = await geminiService.generateFollowUpQuestions('Synthetic headache complaint.');
    assert.deepEqual(primaryQuestions, questions);
    assert.deepEqual(modelCalls, ['gemini-3.7-flash']);
    assert.equal(groqQuestionCalls, 0);
    console.log('  PASS: Gemini 3.7 success skips Gemini fallbacks and Groq');

    geminiMode = 'fail';
    modelCalls.length = 0;
    groqQuestionCalls = 0;
    groqQuestionMode = 'success';
    const groqQuestions = await geminiService.generateFollowUpQuestions('Synthetic headache complaint.');
    assertGeminiChain();
    assert.deepEqual(groqQuestions, questions);
    assert.equal(groqQuestionCalls, 1);
    console.log('  PASS: three Gemini 503s reach Groq and return valid Clinova questions');

    modelCalls.length = 0;
    groqStructureCalls = 0;
    groqStructureMode = 'success';
    const groqStructure = await geminiService.structureAssessment(
      'Synthetic headache complaint.',
      [{ questionId: 'q1', question: 'When did it begin?', answer: 'Two days ago.' }]
    );
    assertGeminiChain();
    assert.deepEqual(groqStructure, structuredAssessment);
    assert.equal(groqStructureCalls, 1);
    console.log('  PASS: three Gemini 503s reach Groq and return valid structured assessment');

    modelCalls.length = 0;
    groqQuestionMode = 'fail';
    await assert.rejects(
      geminiService.generateFollowUpQuestions('Synthetic headache complaint.'),
      (error) => error.message === 'Follow-up question generation is temporarily unavailable. Please try again.'
    );
    assertGeminiChain();
    console.log('  PASS: all providers failing returns only the safe application error');

    modelCalls.length = 0;
    groqQuestionMode = 'malformed';
    await assert.rejects(
      geminiService.generateFollowUpQuestions('Synthetic headache complaint.'),
      (error) => error.message === 'Follow-up question generation is temporarily unavailable. Please try again.'
    );
    console.log('  PASS: malformed Groq questions are rejected safely');

    groqStructureMode = 'fail';
    modelCalls.length = 0;
    await assert.rejects(
      geminiService.structureAssessment('Synthetic complaint.', []),
      (error) => error.message === 'Assessment structuring is temporarily unavailable. Please try again.'
    );
    console.log('  PASS: structured assessment provider failures are normalized safely');

    groqService.generateFollowUpQuestions = originalGroqQuestions;
    groqService.structureAssessment = originalGroqStructure;
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
    const probeClient = new Groq({ apiKey: 'test-only', maxRetries: 0 });
    groqCompletionsPrototype = Object.getPrototypeOf(probeClient.chat.completions);
    originalGroqCompletionCreate = groqCompletionsPrototype.create;
    const groqRequests = [];
    let responseText = JSON.stringify({ questions });
    groqCompletionsPrototype.create = async function (request) {
      groqRequests.push(request);
      return { choices: [{ message: { content: responseText } }] };
    };

    groqQuestionMode = 'sdk';
    const sdkQuestions = await groqService.generateFollowUpQuestions('Synthetic complaint.');
    assert.deepEqual(sdkQuestions, questions);
    assert.equal(groqRequests[0].model, 'openai/gpt-oss-120b');
    assert.equal(groqRequests[0].response_format.type, 'json_schema');
    assert.equal(groqRequests[0].response_format.json_schema.strict, true);
    console.log('  PASS: Groq request uses strict JSON Schema and configured model');

    responseText = '{malformed';
    await assert.rejects(
      groqService.generateFollowUpQuestions('Synthetic complaint.'),
      (error) => error.code === 'GROQ_INVALID_OUTPUT'
    );
    console.log('  PASS: malformed Groq JSON is rejected');

    groqService.generateFollowUpQuestions = async () => {
      groqQuestionCalls += 1;
      return questions;
    };
    await connectDB();
    const patient = await createTestPatient();
    appServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      appServer.once('error', reject);
      appServer.once('listening', resolve);
    });

    geminiMode = 'fail';
    groqQuestionMode = 'success';
    modelCalls.length = 0;
    groqQuestionCalls = 0;
    const response = await requestSession(appServer.address().port, patient);
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.session.questions.map(({ questionId, question }) => ({ questionId, question })), questions);
    assertGeminiChain();
    assert.equal(groqQuestionCalls, 1);
    console.log('  PASS: authenticated /api/symptoms/sessions returns Groq-generated questions');

    geminiMode = 'primary-success';
    modelCalls.length = 0;
    groqQuestionCalls = 0;
    const primaryResponse = await requestSession(appServer.address().port, patient);
    const primaryBody = await primaryResponse.json();
    assert.equal(primaryResponse.status, 201);
    assert.equal(primaryBody.success, true);
    assert.deepEqual(modelCalls, ['gemini-3.7-flash']);
    assert.equal(groqQuestionCalls, 0);
    console.log('  PASS: API uses Gemini 3.7 without calling Groq when primary succeeds');

    console.log('ALL GEMINI TO GROQ PROVIDER TESTS PASSED');
  } catch (error) {
    console.error('PROVIDER FALLBACK TESTS FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGeminiMethod;
    if (groqCompletionsPrototype && originalGroqCompletionCreate) {
      groqCompletionsPrototype.create = originalGroqCompletionCreate;
    }
    groqService.generateFollowUpQuestions = originalGroqQuestions;
    groqService.structureAssessment = originalGroqStructure;
    for (const [key, value] of Object.entries({
      GEMINI_API_KEY: originalEnv.geminiApiKey,
      GEMINI_MODEL: originalEnv.geminiModel,
      GEMINI_FALLBACK_MODELS: originalEnv.geminiFallbacks,
      GROQ_API_KEY: originalEnv.groqApiKey,
      GROQ_MODEL: originalEnv.groqModel
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (createdUsers.length) {
      const ids = createdUsers.map((user) => user._id);
      await AssessmentSession.deleteMany({ patientId: { $in: ids } }).catch(() => {});
      await User.deleteMany({ _id: { $in: ids } }).catch(() => {});
    }
    if (appServer) await new Promise((resolve) => appServer.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
  }
}

run();
