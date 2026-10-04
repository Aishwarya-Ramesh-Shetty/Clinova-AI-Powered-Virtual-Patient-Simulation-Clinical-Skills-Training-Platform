// End-to-end test of the two diagnosis-summary features against a running backend.
//   FEATURE 1: appointment "Summary" button → saved assessment linked to the appointment
//   FEATURE 2: standalone Diagnosis History (independent of any appointment)
// Covers TEST A (history without booking), TEST B (booking + summary + cancel), TEST C (multiple diagnoses).
// Usage: node test_diagnosis_history_flow.js
const BASE = process.env.API_URL || 'http://localhost:5000/api';
let failures = 0;

const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!cond) failures += 1;
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

// Drive a full assessment session through the real endpoints to a completed clinical assessment.
async function completeAssessment(token, symptoms) {
  const created = await call('POST', '/symptoms/sessions', { token, body: { symptoms, language: 'en' } });
  if (created.status !== 201) return { ok: false, step: 'create', status: created.status, message: created.json?.message };
  const sessionId = created.json.data.session.id;
  const questions = created.json.data.session.questions || [];
  if (questions.length === 0) return { ok: false, step: 'no-questions', sessionId };

  for (const q of questions) {
    const ans = await call('POST', `/symptoms/sessions/${sessionId}/answers`, {
      token, body: { questionId: q.questionId, answer: 'No, nothing else. Mild and improving with rest.' }
    });
    if (ans.status !== 200) return { ok: false, step: 'answer', status: ans.status, sessionId, message: ans.json?.message };
  }

  const prep = await call('POST', `/symptoms/sessions/${sessionId}/prepare`, { token });
  if (prep.status !== 200) return { ok: false, step: 'prepare', status: prep.status, sessionId, message: prep.json?.message };

  const assess = await call('POST', `/symptoms/sessions/${sessionId}/assess`, { token });
  if (assess.status !== 200) return { ok: false, step: 'assess', status: assess.status, sessionId, message: assess.json?.message };
  if (!assess.json.data.session.clinicalAssessment) return { ok: false, step: 'no-assessment', sessionId };

  return { ok: true, sessionId };
}

(async () => {
  const stamp = Date.now();
  const patient = { name: 'History Test Patient', email: `history.patient.${stamp}@example.test`, password: 'Passw0rd!' };
  const outsider = { name: 'History Outsider', email: `history.outsider.${stamp}@example.test`, password: 'Passw0rd!' };

  const reg = await call('POST', '/auth/register', { body: patient });
  check('patient registers', reg.status === 201, reg.status);
  const token = reg.json?.data?.token;
  const regOut = await call('POST', '/auth/register', { body: outsider });
  check('second patient registers', regOut.status === 201, regOut.status);
  const outsiderToken = regOut.json?.data?.token;

  // ───────────────────────── TEST A — history WITHOUT booking ─────────────────────────
  console.log('\nTEST A — diagnosis history without booking an appointment');
  const first = await completeAssessment(token, 'I have had a mild headache for two days.');
  check('assessment 1 completes', first.ok, `${first.step} ${first.status || ''} ${first.message || ''}`);
  if (!first.ok) { console.log('\nFAILED (assessment pipeline)'); process.exit(1); }

  const hist1 = await call('GET', '/symptoms/history', { token });
  check('GET /symptoms/history returns 200', hist1.status === 200, hist1.status);
  const entries1 = hist1.json?.data?.history || [];
  check('diagnosis appears in history without any booking', entries1.some((h) => h.id === first.sessionId));
  check('history entry has assessment date', !!entries1.find((h) => h.id === first.sessionId)?.assessedAt);
  check('history entry has initial symptoms', !!entries1.find((h) => h.id === first.sessionId)?.initialSymptoms);
  check('history entry has possible conditions', (entries1.find((h) => h.id === first.sessionId)?.possibleConditions || []).length > 0);
  check('history entry has triage', !!entries1.find((h) => h.id === first.sessionId)?.triage);
  check('history entry has recommended specialist', !!entries1.find((h) => h.id === first.sessionId)?.recommendedSpecialist);

  // "Refresh the page" → a second, fresh fetch must still return it (persisted in MongoDB)
  const hist1b = await call('GET', '/symptoms/history', { token });
  check('history still present after a fresh fetch (refresh)', (hist1b.json?.data?.history || []).some((h) => h.id === first.sessionId));

  // Full summary detail (View Full Summary)
  const detail = await call('GET', `/symptoms/sessions/${first.sessionId}`, { token });
  check('GET session detail returns 200', detail.status === 200, detail.status);
  const fullSession = detail.json?.data?.session;
  check('full summary has clinicalAssessment', !!fullSession?.clinicalAssessment);
  check('full summary has initial symptoms', !!fullSession?.initialSymptoms);
  check('full summary has answered follow-up questions', (fullSession?.questions || []).filter((q) => q.answer).length > 0);
  check('full summary has disclaimer', !!fullSession?.clinicalAssessment?.disclaimer);

  // Security: another patient cannot see it
  const outsiderHist = await call('GET', '/symptoms/history', { token: outsiderToken });
  check("outsider's history does NOT contain this diagnosis", !(outsiderHist.json?.data?.history || []).some((h) => h.id === first.sessionId));
  const outsiderDetail = await call('GET', `/symptoms/sessions/${first.sessionId}`, { token: outsiderToken });
  check('outsider cannot open the full summary (403)', outsiderDetail.status === 403, outsiderDetail.status);
  const noAuth = await call('GET', '/symptoms/history');
  check('history without token rejected (401)', noAuth.status === 401, noAuth.status);

  // ───────────────────────── TEST B — booking + Summary button + Cancel ─────────────────────────
  console.log('\nTEST B — book with assessment linked, Summary shows it, Cancel still works');
  const second = await completeAssessment(token, 'I have a sore throat and mild fever since yesterday.');
  check('assessment 2 completes', second.ok, `${second.step} ${second.status || ''} ${second.message || ''}`);
  if (!second.ok) { console.log('\nFAILED (assessment pipeline)'); process.exit(1); }

  const search = await call('GET', '/doctors/search?specialty=Cardiology&lat=19.39&lng=72.83&radius=20', { token });
  const doctor = (search.json?.data?.doctors || [])[0];
  check('demo doctor found for booking', !!doctor?.id, doctor?.id);
  const slot = (doctor.availableSlots || [])[0];
  const book = await call('POST', '/appointments', {
    token,
    body: { doctorId: doctor.id, date: slot.date, timeSlot: slot.times[0], notes: 'linked assessment', assessmentSessionId: second.sessionId }
  });
  check('appointment booked with assessmentSessionId', book.status === 201, `${book.status} ${book.json?.message}`);
  const apptId = book.json?.data?.appointment?.id;
  check('appointment stores the assessment link', book.json?.data?.appointment?.assessmentSessionId === second.sessionId,
    book.json?.data?.appointment?.assessmentSessionId);

  // Feature 1: appointment "Summary" button → saved assessment (no new generation)
  const summary = await call('GET', `/appointments/${apptId}/summary`, { token });
  check('GET appointment summary returns 200', summary.status === 200, summary.status);
  const sumSession = summary.json?.data?.session;
  check('summary returns the linked assessment', !!sumSession && sumSession.id === second.sessionId, sumSession?.id);
  check('summary matches assessment 2 symptoms', (sumSession?.initialSymptoms || '').includes('sore throat'), sumSession?.initialSymptoms);
  check('summary does NOT match assessment 1', !(sumSession?.initialSymptoms || '').includes('headache'));
  check('summary includes answered follow-up questions', (sumSession?.questions || []).filter((q) => q.answer).length > 0);
  check('summary includes possible conditions', (sumSession?.clinicalAssessment?.possibleConditions || []).length > 0);
  check('summary includes triage', !!sumSession?.clinicalAssessment?.triage);
  check('summary includes recommended specialist', !!sumSession?.clinicalAssessment?.recommendedSpecialist);
  check('summary includes disclaimer', !!sumSession?.clinicalAssessment?.disclaimer);

  // Appointment booked with NO assessment → graceful null, not fake data
  const book2 = await call('POST', '/appointments', {
    token, body: { doctorId: doctor.id, date: slot.date, timeSlot: slot.times[1] }
  });
  check('second appointment (no assessment) booked', book2.status === 201, `${book2.status} ${book2.json?.message}`);
  const sum2 = await call('GET', `/appointments/${book2.json?.data?.appointment?.id}/summary`, { token });
  check('summary for unlinked appointment returns 200 with null session', sum2.status === 200 && sum2.json?.data?.session === null);

  // Cancel must still work (independently of summary)
  const cancel = await call('PATCH', `/appointments/${apptId}/cancel`, { token });
  check('cancel still works', cancel.status === 200 && cancel.json?.data?.appointment?.status === 'cancelled', cancel.status);
  const summaryAfterCancel = await call('GET', `/appointments/${apptId}/summary`, { token });
  check('summary still retrievable after cancel', summaryAfterCancel.status === 200 && summaryAfterCancel.json?.data?.session?.id === second.sessionId);
  const cancel2 = await call('PATCH', `/appointments/${book2.json?.data?.appointment?.id}/cancel`, { token });
  check('unlinked appointment cancels too', cancel2.status === 200, cancel2.status);

  // ───────────────────────── TEST C — multiple diagnoses ─────────────────────────
  console.log('\nTEST C — multiple diagnoses listed separately with correct summaries');
  const hist2 = await call('GET', '/symptoms/history', { token });
  const entries2 = hist2.json?.data?.history || [];
  check('history now contains both diagnoses', entries2.some((h) => h.id === first.sessionId) && entries2.some((h) => h.id === second.sessionId));
  check('two separate history entries exist', entries2.length >= 2, entries2.length);
  const idxFirst = entries2.findIndex((h) => h.id === first.sessionId);
  const idxSecond = entries2.findIndex((h) => h.id === second.sessionId);
  check('newest first ordering (assessment 2 before assessment 1)', idxSecond !== -1 && idxFirst !== -1 && idxSecond < idxFirst, `${idxSecond} < ${idxFirst}`);
  check('history entries have distinct symptoms',
    entries2[idxSecond]?.initialSymptoms !== entries2[idxFirst]?.initialSymptoms,
    `${entries2[idxSecond]?.initialSymptoms} | ${entries2[idxFirst]?.initialSymptoms}`);

  const d1 = await call('GET', `/symptoms/sessions/${first.sessionId}`, { token });
  const d2 = await call('GET', `/symptoms/sessions/${second.sessionId}`, { token });
  check('summary 1 opens with assessment 1 content', (d1.json?.data?.session?.initialSymptoms || '').includes('headache'));
  check('summary 2 opens with assessment 2 content', (d2.json?.data?.session?.initialSymptoms || '').includes('sore throat'));
  check('the two summaries differ', d1.json?.data?.session?.initialSymptoms !== d2.json?.data?.session?.initialSymptoms);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
