/**
 * Phase 3A — End-to-End Test Suite
 * Tests: session creation, Gemini Call #1, answer storage (no extra Gemini),
 *        GET session, prepare/Gemini Call #2, ownership enforcement, health check.
 */
require('./src/config/env');

// Import geminiService FIRST (before app) so we share the same module instance
const geminiService = require('./src/services/geminiService');
geminiService.resetCallCount();

const app       = require('./src/app');
const connectDB = require('./src/config/db');
const User      = require('./src/models/User');
const AssessmentSession = require('./src/models/AssessmentSession');

const EMAIL_A = `phase3a_userA_${Date.now()}@clinova.com`;
const EMAIL_B = `phase3a_userB_${Date.now()}@clinova.com`;
const PASS    = 'Password123!';
const PORT    = 5003;

let tokenA = '', tokenB = '', sessionId = '';

const BASE = `http://localhost:${PORT}/api`;

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json() };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('PHASE 3A — Assessment Session + Gemini Tests');
  console.log('═══════════════════════════════════════════════\n');

  await connectDB();
  const server = app.listen(PORT);
  console.log(`[Setup] Server on http://localhost:${PORT}\n`);

  try {
    // ── Setup: register two users ─────────────────────────────────────────
    console.log('[Setup] Registering test users...');
    const rA = await req('POST', '/auth/register', { name:'User A', email:EMAIL_A, password:PASS, gender:'female', dateOfBirth:'1995-06-15' });
    const rB = await req('POST', '/auth/register', { name:'User B', email:EMAIL_B, password:PASS });
    assert(rA.status === 201, 'User A registered');
    assert(rB.status === 201, 'User B registered');
    tokenA = rA.data.data.token;
    tokenB = rB.data.data.token;

    // ── TEST 1: Missing symptoms ──────────────────────────────────────────
    console.log('\n[Test 1] Validation — missing symptoms...');
    const t1 = await req('POST', '/symptoms/sessions', { symptoms: '' }, tokenA);
    assert(t1.status === 400, 'Returns 400 for empty symptoms');

    // ── TEST 2: Unauthenticated access ────────────────────────────────────
    console.log('\n[Test 2] Unauthenticated — no token...');
    const t2u = await req('POST', '/symptoms/sessions', { symptoms: 'headache' }, null);
    assert(t2u.status === 401, 'Returns 401 without token');

    // ── TEST 3: Create session — Gemini Call #1 ───────────────────────────
    console.log('\n[Test 3] Create assessment session (Gemini Call #1)...');
    geminiService.resetCallCount();
    const t3 = await req('POST', '/symptoms/sessions',
      { symptoms: 'I have been having a severe headache since yesterday, along with some nausea.', language: 'en' },
      tokenA
    );
    console.log('  Status:', t3.status);
    if (t3.status !== 201) {
      console.log('  Response:', JSON.stringify(t3.data, null, 2));
    }
    assert(t3.status === 201, 'Session created (201)');
    assert(t3.data.success === true, 'success = true');
    assert(t3.data.data.session.id, 'Session ID returned');
    assert(t3.data.data.session.status === 'intake', 'Status = intake');
    assert(Array.isArray(t3.data.data.session.questions), 'questions is array');
    const qCount = t3.data.data.session.questions.length;
    assert(qCount >= 3 && qCount <= 4, `Gemini returned ${qCount} questions (3–4 expected)`);
    assert(geminiService.getCallCount() >= 1, `Gemini model attempts made (actual: ${geminiService.getCallCount()})`);
    sessionId = t3.data.data.session.id;
    const questions = t3.data.data.session.questions;
    console.log('  Session ID:', sessionId);
    console.log('  Questions generated:');
    questions.forEach(q => console.log(`    ${q.questionId}: ${q.question}`));

    // ── TEST 4: Submit answers — NO Gemini calls ──────────────────────────
    console.log('\n[Test 4] Submit answers (no Gemini calls)...');
    geminiService.resetCallCount();
    const sampleAnswers = [
      'Since yesterday evening, about 18 hours.',
      '7 out of 10, quite painful and throbbing.',
      'Both sides of my head.',
      'No known allergies, no prior migraines.'
    ];
    for (let i = 0; i < questions.length; i++) {
      const a = await req('POST', `/symptoms/sessions/${sessionId}/answers`,
        { questionId: questions[i].questionId, answer: sampleAnswers[i] || 'No additional information.' },
        tokenA
      );
      assert(a.status === 200, `Answer ${i+1} (${questions[i].questionId}) saved`);
    }
    assert(geminiService.getCallCount() === 0, `Gemini NOT called during answer submission (calls: ${geminiService.getCallCount()})`);

    // ── TEST 5: Answer validation errors ─────────────────────────────────
    console.log('\n[Test 5] Answer validation errors...');
    const t5a = await req('POST', `/symptoms/sessions/${sessionId}/answers`,
      { questionId: questions[0].questionId }, tokenA);
    assert(t5a.status === 400, 'Returns 400 for missing answer text');
    const t5b = await req('POST', `/symptoms/sessions/${sessionId}/answers`,
      { answer: 'test' }, tokenA);
    assert(t5b.status === 400, 'Returns 400 for missing questionId');
    const t5c = await req('POST', `/symptoms/sessions/${sessionId}/answers`,
      { questionId: 'q_nonexistent', answer: 'test' }, tokenA);
    assert(t5c.status === 404, 'Returns 404 for unknown questionId');

    // ── TEST 6: GET session — all answers stored ──────────────────────────
    console.log('\n[Test 6] GET session — verify all answers persisted...');
    const t6 = await req('GET', `/symptoms/sessions/${sessionId}`, null, tokenA);
    assert(t6.status === 200, 'GET session returns 200');
    const allAnswered = t6.data.data.session.questions.every(q => q.answer && q.answer.length > 0);
    assert(allAnswered, 'All questions have answers stored');
    assert(t6.data.data.session.status === 'intake', 'Status still "intake" before prepare');
    assert(t6.data.data.session.initialSymptoms, 'initialSymptoms present');

    // ── TEST 7: Ownership enforcement ────────────────────────────────────
    console.log('\n[Test 7] Ownership enforcement (User B → User A session)...');
    const t7g = await req('GET', `/symptoms/sessions/${sessionId}`, null, tokenB);
    assert(t7g.status === 403, 'User B cannot GET User A\'s session');
    const t7a = await req('POST', `/symptoms/sessions/${sessionId}/answers`,
      { questionId: questions[0].questionId, answer: 'hacked' }, tokenB);
    assert(t7a.status === 403, 'User B cannot submit answers to User A\'s session');
    const t7p = await req('POST', `/symptoms/sessions/${sessionId}/prepare`, null, tokenB);
    assert(t7p.status === 403, 'User B cannot prepare User A\'s session');

    // ── TEST 8: Prepare session — Gemini Call #2 ──────────────────────────
    console.log('\n[Test 8] Prepare session (Gemini Call #2)...');
    geminiService.resetCallCount();
    const t8 = await req('POST', `/symptoms/sessions/${sessionId}/prepare`, null, tokenA);
    console.log('  Status:', t8.status);
    if (t8.status !== 200) {
      console.log('  Response:', JSON.stringify(t8.data, null, 2));
    }
    assert(t8.status === 200, 'Prepare returns 200');
    assert(t8.data.data.session.status === 'ready_for_assessment', 'Status = ready_for_assessment');
    assert(t8.data.data.session.structuredSymptoms, 'structuredSymptoms populated');
    assert(t8.data.data.session.structuredSymptoms.chiefComplaint, 'chiefComplaint present');
    assert(Array.isArray(t8.data.data.session.structuredSymptoms.symptoms), 'symptoms array present');
    assert(geminiService.getCallCount() >= 1, `Gemini model attempts made for prepare (actual: ${geminiService.getCallCount()})`);
    // Verify Gemini did NOT diagnose or recommend
    const ss = t8.data.data.session.structuredSymptoms;
    assert(!ss.diagnosis, 'No diagnosis field (Gemini scope respected)');
    assert(!ss.recommendedSpecialist, 'No recommendedSpecialist field');
    assert(!ss.treatment, 'No treatment field');
    console.log('  chiefComplaint:', ss.chiefComplaint);
    console.log('  symptoms count:', ss.symptoms.length);

    // ── TEST 9: Verify MongoDB persistence ────────────────────────────────
    console.log('\n[Test 9] Verify MongoDB persistence...');
    const dbSession = await AssessmentSession.findById(sessionId);
    assert(dbSession.status === 'ready_for_assessment', 'DB status = ready_for_assessment');
    assert(dbSession.structuredSymptoms !== null, 'structuredSymptoms in MongoDB');
    assert(dbSession.completedAt !== null, 'completedAt set in MongoDB');

    // ── TEST 10: Cannot re-prepare ────────────────────────────────────────
    console.log('\n[Test 10] Cannot prepare an already-prepared session...');
    const t10 = await req('POST', `/symptoms/sessions/${sessionId}/prepare`, null, tokenA);
    assert(t10.status === 400, 'Returns 400 for re-prepare attempt');

    // ── TEST 11: Invalid session ID format ────────────────────────────────
    console.log('\n[Test 11] Invalid session ID format...');
    const t11 = await req('GET', '/symptoms/sessions/not-a-valid-id', null, tokenA);
    assert(t11.status === 400, 'Returns 400 for invalid session ID format');

    // ── TEST 12: Health check ─────────────────────────────────────────────
    console.log('\n[Test 12] Health check...');
    const t12 = await req('GET', '/health', null, null);
    assert(t12.status === 200, '/api/health returns 200');

    console.log('\n═══════════════════════════════════════════════');
    console.log('ALL PHASE 3A TESTS PASSED ✓');
    console.log('═══════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n✗ TEST SUITE FAILED:', err.message);
  } finally {
    await User.deleteOne({ email: EMAIL_A });
    await User.deleteOne({ email: EMAIL_B });
    if (sessionId) await AssessmentSession.deleteOne({ _id: sessionId });
    server.close();
    process.exit(0);
  }
}

run();
