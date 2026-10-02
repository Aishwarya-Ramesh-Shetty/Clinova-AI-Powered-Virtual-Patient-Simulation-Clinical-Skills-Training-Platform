require('./src/config/env');

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const AssessmentSession = require('./src/models/AssessmentSession');
const geminiService = require('./src/services/geminiService');
const clinicalAssessmentService = require('./src/services/clinicalAssessmentService');
const { evaluateClinicalSafety } = require('./src/services/clinicalSafetyService');

const testRunId = Date.now();
const createdUsers = [];
const originalGenerator = geminiService.generateClinicalAssessment;
let appServer;
let generatorMode = 'valid';
let generatedInputs = [];

const sampleAssessment = () => ({
  possibleConditions: [{
    name: 'Tension-type headache',
    reason: 'The reported headache description may be consistent with this possibility.',
    evidence: ['Patient reported a headache for two days.'],
    confidence: 'low'
  }],
  triage: { level: 'routine', reason: 'No emergency indicators were identified in the supplied report.' },
  redFlags: [],
  recommendedSpecialist: { specialty: 'General Physician', reason: 'The presentation is nonspecific.' },
  followUpNeeded: ['Seek professional evaluation if symptoms continue or worsen.'],
  disclaimer: 'Model output disclaimer is normalized by the service.'
});

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

function createToken(user) {
  return jwt.sign({ userId: String(user._id) }, process.env.JWT_SECRET || 'clinova_jwt_secret_2026');
}

function createUserModel() {
  const ageDate = new Date();
  ageDate.setFullYear(ageDate.getFullYear() - 30);
  return {
    name: 'Phase 3B Clinical Test User',
    email: `phase3b_${testRunId}_${createdUsers.length}@clinova.test`,
    password: 'TestPassword123!',
    gender: 'female',
    dateOfBirth: ageDate
  };
}

async function createUser(overrides = {}) {
  const user = await User.create({ ...createUserModel(), ...overrides });
  createdUsers.push(user);
  return user;
}

async function createSession(user, overrides = {}) {
  return AssessmentSession.create({
    patientId: user._id,
    initialSymptoms: 'I have had a headache for two days.',
    intakeQuestions: [{ questionId: 'q1', question: 'What else do you feel?', answer: 'I feel tired.', answeredAt: new Date() }],
    structuredSymptoms: {
      chiefComplaint: 'Headache',
      symptoms: [{ name: 'Headache', present: true, duration: 'two days', severity: null, location: null }],
      relevantHistory: [],
      associatedSymptoms: ['Tiredness'],
      redFlagInformation: [],
      patientReportedInformation: []
    },
    status: 'ready_for_assessment',
    completedAt: new Date(),
    ...overrides
  });
}

async function postAssess(port, sessionId, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}/api/symptoms/sessions/${sessionId}/assess`, {
    method: 'POST',
    headers
  });
  return { status: response.status, body: await response.json() };
}

function validIntake() {
  return {
    initialSymptoms: 'I have had a headache for two days.',
    structuredSymptoms: { chiefComplaint: 'Headache', symptoms: [{ name: 'Headache', present: true }] },
    intakeQuestions: [{ questionId: 'q1', question: 'What else do you feel?', answer: 'I feel tired.' }],
    age: 30,
    gender: 'female'
  };
}

async function run() {
  console.log('\nPHASE 3B — Clinical assessment tests');

  try {
    await connectDB();
    appServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      appServer.once('error', reject);
      appServer.once('listening', resolve);
    });
    const port = appServer.address().port;

    geminiService.generateClinicalAssessment = async (input) => {
      generatedInputs.push(input);
      if (generatorMode === 'failure') throw new Error('private prompt and credential details');
      if (generatorMode === 'malformed') return { triage: { level: 'dangerous', reason: 'bad' } };
      return sampleAssessment();
    };

    try {
      geminiService.parseClinicalAssessmentResponse('{invalid json');
      throw new Error('Expected malformed Gemini JSON to be rejected.');
    } catch (error) {
      assert(error.code === 'MALFORMED_CLINICAL_ASSESSMENT', 'Malformed Gemini JSON is rejected with a controlled error');
    }

    try {
      clinicalAssessmentService.validateClinicalAssessment({ triage: { level: 'dangerous' } });
      throw new Error('Expected malformed Gemini assessment shape to be rejected.');
    } catch (error) {
      assert(error.code === 'INVALID_CLINICAL_ASSESSMENT', 'Malformed clinical assessment schema is rejected');
    }

    assert(evaluateClinicalSafety(['Patient reports severe difficulty breathing.']).override, 'Explicit severe breathing difficulty triggers emergency safety');
    assert(!evaluateClinicalSafety(['I have a normal headache.']).override, 'A normal headache does not trigger emergency safety');
    assert(!evaluateClinicalSafety(['I do not have severe difficulty breathing.']).override, 'Explicitly negated breathing difficulty does not trigger emergency safety');

    const owner = await createUser();
    const other = await createUser({ email: `phase3b_other_${testRunId}@clinova.test` });
    const ownerToken = createToken(owner);
    const otherToken = createToken(other);

    const authorizedSession = await createSession(owner);
    const noAuth = await postAssess(port, authorizedSession._id, null);
    assert(noAuth.status === 401, 'Assessment endpoint requires authentication');
    const wrongOwner = await postAssess(port, authorizedSession._id, otherToken);
    assert(wrongOwner.status === 403, 'Session ownership is enforced');
    const incompleteSession = await createSession(owner, { status: 'intake', structuredSymptoms: null, completedAt: null });
    const beforePreparation = await postAssess(port, incompleteSession._id, ownerToken);
    assert(beforePreparation.status === 400, 'Assessment before intake preparation is rejected');

    generatedInputs = [];
    const validResult = await postAssess(port, authorizedSession._id, ownerToken);
    assert(validResult.status === 200, 'Valid Gemini assessment completes successfully');
    const savedAssessment = validResult.body.data.session.clinicalAssessment;
    assert(savedAssessment.possibleConditions[0].name === 'Tension-type headache', 'Possible condition is returned, not stated as definitive');
    assert(savedAssessment.triage.level === 'routine', 'Non-emergency triage is retained');
    assert(savedAssessment.recommendedSpecialist.specialty === 'General Physician', 'Gemini specialist recommendation is validated');
    assert(savedAssessment.disclaimer.includes('does not replace evaluation'), 'Required disclaimer is stored');
    assert(generatedInputs[0].structuredSymptoms.chiefComplaint === 'Headache', 'Assessment receives the actual Gemini structured evidence');
    assert(generatedInputs[0].intakeQuestions[0].answer === 'I feel tired.', 'Assessment receives patient answers');
    assert(generatedInputs[0].age === 30 && generatedInputs[0].gender === 'female', 'Available age and gender are passed through');
    const persistedSession = await AssessmentSession.findById(authorizedSession._id);
    assert(persistedSession.status === 'completed' && persistedSession.clinicalAssessment.triage.level === 'routine', 'Assessment is persisted with completed status');

    const noDemographicUser = await createUser({
      email: `phase3b_no_demographic_${testRunId}@clinova.test`,
      dateOfBirth: undefined,
      gender: undefined
    });
    const noDemographicSession = await createSession(noDemographicUser);
    const noDemographicResult = await postAssess(port, noDemographicSession._id, createToken(noDemographicUser));
    assert(noDemographicResult.status === 200, 'Missing age and gender are handled without inference or rejection');
    const demographicInput = generatedInputs[generatedInputs.length - 1];
    assert(demographicInput.age === null && demographicInput.gender === null, 'Unavailable demographics are passed as unknown');

    const emergencySession = await createSession(owner, { initialSymptoms: 'Patient reports severe difficulty breathing.' });
    generatorMode = 'valid';
    const emergencyResult = await postAssess(port, emergencySession._id, ownerToken);
    assert(emergencyResult.status === 200, 'Explicit red-flag case receives an assessment');
    const emergencyAssessment = emergencyResult.body.data.session.clinicalAssessment;
    assert(emergencyAssessment.triage.level === 'emergency', 'Deterministic emergency overrides Gemini routine triage');
    assert(emergencyAssessment.possibleConditions[0].name === 'Tension-type headache', 'Safety override preserves Gemini possible conditions');
    assert(emergencyAssessment.redFlags.some((flag) => flag.detected && flag.flag === 'severe breathing difficulty'), 'Safety override adds the detected red flag');

    const malformedSession = await createSession(owner);
    generatorMode = 'malformed';
    const malformedResult = await postAssess(port, malformedSession._id, ownerToken);
    assert(malformedResult.status === 502, 'Malformed Gemini assessment is returned as a controlled failure');
    const malformedStored = await AssessmentSession.findById(malformedSession._id);
    assert(malformedStored.status === 'failed' && malformedStored.structuredSymptoms.chiefComplaint === 'Headache', 'Malformed output fails without losing Gemini preparation data');

    const failedSession = await createSession(owner);
    generatorMode = 'failure';
    const failedResult = await postAssess(port, failedSession._id, ownerToken);
    assert(failedResult.status === 502, 'Gemini assessment failure is handled');
    assert(!JSON.stringify(failedResult.body).includes('private prompt'), 'Assessment failures do not expose internal error details');
    const failureStored = await AssessmentSession.findById(failedSession._id);
    assert(failureStored.status === 'failed' && failureStored.structuredSymptoms.chiefComplaint === 'Headache', 'Failed assessment preserves prepared evidence');

    console.log('\nALL PHASE 3B CLINICAL ASSESSMENT TESTS PASSED');
  } catch (error) {
    console.error('\nPHASE 3B CLINICAL ASSESSMENT TESTS FAILED:', error.stack || error.message);
    process.exitCode = 1;
  } finally {
    geminiService.generateClinicalAssessment = originalGenerator;
    if (createdUsers.length) {
      const userIds = createdUsers.map((user) => user._id);
      await AssessmentSession.deleteMany({ patientId: { $in: userIds } }).catch(() => {});
      await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
    }
    if (appServer) await new Promise((resolve) => appServer.close(resolve));
    await mongoose.disconnect().catch(() => {});
  }
}

run();