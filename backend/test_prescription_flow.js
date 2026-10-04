// End-to-end test of the prescription feature against the running backend (:5000).
// Uses a local stub of the FastAPI /extract-prescription endpoint on :8000 so the
// full flow (Node -> FastAPI contract -> MongoDB) is verified deterministically.
// Usage: node test_prescription_flow.js
require('./src/config/env');

const http = require('http');
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const Prescription = require('./src/models/Prescription');

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const AI_PORT = 8000;
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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
  try { json = await res.json(); } catch (e) { /* non-JSON */ }
  return { status: res.status, json };
}

async function postPrescription(token, { fieldName = 'prescription', fileName = 'rx.png', mime = 'image/png', bytes = PNG_BYTES, textField } = {}) {
  const form = new FormData();
  if (textField !== undefined) form.append(fieldName, textField);
  else form.append(fieldName, new Blob([bytes], { type: mime }), fileName);
  const res = await fetch(`${BASE}/prescriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON */ }
  return { status: res.status, json };
}

// Stub of the FastAPI AI service
const stub = { mode: 'good', hits: 0, lastContentType: '', lastBody: Buffer.alloc(0), path: '' };

function startStub() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      stub.hits += 1;
      stub.path = req.url;
      stub.lastContentType = req.headers['content-type'] || '';
      stub.lastBody = Buffer.concat(chunks);
      if (stub.mode === 'error500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'gemini failed' }));
        return;
      }
      if (stub.mode === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>proxy error, not json</body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        medicines: [
          { name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: 'Twice daily', duration: '5 days', instructions: 'After food' },
          { name: 'Paracetamol', dosage: '500mg', frequency: 'Every 8 hours', duration: '3 days', instructions: 'As needed for fever' }
        ],
        doctor_name: 'Dr. Stub Tester',
        date: '2026-10-04',
        diagnosis: 'Bacterial throat infection',
        raw_text: 'Rx: Amoxicillin 500mg BD x 5 days, Paracetamol SOS'
      }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(AI_PORT, () => resolve(server));
  });
}

(async () => {
  await connectDB();
  const stamp = Date.now();

  // ── Setup: two patients ─────────────────────────────────────────────────────
  const regA = await call('POST', '/auth/register', { body: { name: 'Rx Patient A', email: `rx.a.${stamp}@example.test`, password: 'Passw0rd!' } });
  const tokenA = regA.json?.data?.token;
  check('patient A registers', regA.status === 201 && !!tokenA, regA.status);
  const regB = await call('POST', '/auth/register', { body: { name: 'Rx Patient B', email: `rx.b.${stamp}@example.test`, password: 'Passw0rd!' } });
  const tokenB = regB.json?.data?.token;
  check('patient B registers', regB.status === 201 && !!tokenB, regB.status);
  const userA = await User.findOne({ email: `rx.a.${stamp}@example.test` }).lean();

  // ── Authentication required ────────────────────────────────────────────────
  const noAuthGet = await call('GET', '/prescriptions');
  check('GET /api/prescriptions requires auth (401)', noAuthGet.status === 401, noAuthGet.status);
  const noAuthPost = await postPrescription(null, {});
  check('POST /api/prescriptions requires auth (401)', noAuthPost.status === 401, noAuthPost.status);

  // ── Upload validation ───────────────────────────────────────────────────────
  const noFile = await postPrescription(tokenA, { textField: 'just a note, no file' });
  check('missing file -> 400', noFile.status === 400, `${noFile.status} ${noFile.json?.message}`);
  check('missing file message is helpful', String(noFile.json?.message || '').includes('prescription'), noFile.json?.message);

  const badMime = await postPrescription(tokenA, { fileName: 'notes.txt', mime: 'text/plain', bytes: Buffer.from('plain text file') });
  check('unsupported MIME type -> 400', badMime.status === 400, `${badMime.status} ${badMime.json?.message}`);
  check('unsupported MIME message names the allowed types', String(badMime.json?.message || '').includes('image/jpeg'), badMime.json?.message);

  const wrongField = await postPrescription(tokenA, { fieldName: 'file' });
  check('wrong multipart field name -> 400', wrongField.status === 400, `${wrongField.status} ${wrongField.json?.message}`);

  // ── AI service unavailable -> 502 (nothing listening on :8000 yet) ─────────
  const aiDown = await postPrescription(tokenA, {});
  check('AI service unavailable -> 502', aiDown.status === 502, `${aiDown.status} ${aiDown.json?.message}`);
  check('AI-down response is the standard error shape', aiDown.json?.success === false && aiDown.json?.data === null);

  // ── Start the AI-service stub (same contract as FastAPI) ───────────────────
  const server = await startStub();
  console.log(`stub AI service listening on :${AI_PORT}`);

  // Success path
  const ok = await postPrescription(tokenA, {});
  check('valid image + AI response -> 201', ok.status === 201, `${ok.status} ${ok.json?.message}`);
  check('response message matches spec', ok.json?.message === 'Prescription extracted and saved successfully', ok.json?.message);
  check('response shape: success + data.prescription', ok.json?.success === true && !!ok.json?.data?.prescription);
  const first = ok.json?.data?.prescription;
  check('saved prescription has a MongoDB id', /^[0-9a-f]{24}$/.test(String(first?.id || first?._id || '')), String(first?.id || first?._id));
  check('extracted medicines stored', Array.isArray(first?.extractedData?.medicines) && first.extractedData.medicines.length === 2,
    `${first?.extractedData?.medicines?.length} medicines`);
  check('medicine fields preserved', first?.extractedData?.medicines?.[0]?.name === 'Amoxicillin 500mg'
    && first.extractedData.medicines[0].frequency === 'Twice daily');
  check('doctor_name/date/diagnosis/raw_text stored', first?.extractedData?.doctor_name === 'Dr. Stub Tester'
    && first.extractedData?.date === '2026-10-04' && first.extractedData?.diagnosis === 'Bacterial throat infection'
    && String(first?.extractedData?.raw_text || '').includes('Amoxicillin'));
  check('original file name + mime stored', first?.originalFileName === 'rx.png' && first?.mimeType === 'image/png',
    `${first?.originalFileName} ${first?.mimeType}`);
  check('patientId in response belongs to the caller', first?.patientId === String(userA._id), first?.patientId);

  // Direct MongoDB verification
  const inDb = await Prescription.findById(first?.id || first?._id).lean();
  check('prescription persisted in MongoDB with patientId', !!inDb && String(inDb.patientId) === String(userA._id));
  check('nothing is written outside MongoDB (no image stored on model)', !('imagePath' in (inDb || {})) && !('file' in (inDb || {})));

  // AI contract: multipart with the FastAPI field name `file`
  check('AI service called at /extract-prescription', stub.path === '/extract-prescription', stub.path);
  check('forwarded Content-Type is multipart with boundary',
    stub.lastContentType.startsWith('multipart/form-data') && stub.lastContentType.includes('boundary='),
    stub.lastContentType.split(';')[0]);
  check('image bytes forwarded as the `file` part with filename',
    stub.lastBody.includes(Buffer.from('name="file"')) && stub.lastBody.includes(Buffer.from('filename="rx.png"')));
  check('actual PNG bytes forwarded (magic number present)',
    stub.lastBody.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])));

  // Second upload for list ordering
  const ok2 = await postPrescription(tokenA, { fileName: 'rx2.png' });
  check('second upload -> 201', ok2.status === 201, ok2.status);
  const second = ok2.json?.data?.prescription;

  // ── GET list ───────────────────────────────────────────────────────────────
  const listA = await call('GET', '/prescriptions', { token: tokenA });
  check('GET /api/prescriptions -> 200', listA.status === 200, listA.status);
  check('response message matches spec', listA.json?.message === 'Prescriptions fetched successfully', listA.json?.message);
  const itemsA = listA.json?.data?.prescriptions || [];
  check('list contains this patient s prescriptions', itemsA.length === 2, `count=${itemsA.length}`);
  check('newest first ordering', itemsA[0]?.id === (second?.id || second?._id) && itemsA[1]?.id === (first?.id || first?._id),
    `${itemsA[0]?.id} then ${itemsA[1]?.id}`);

  const listB = await call('GET', '/prescriptions', { token: tokenB });
  check('other patient sees an empty list', listB.status === 200 && (listB.json?.data?.prescriptions || []).length === 0,
    `count=${(listB.json?.data?.prescriptions || []).length}`);

  // ── GET by id: owner only ──────────────────────────────────────────────────
  const firstId = String(first?.id || first?._id);
  const ownerGet = await call('GET', `/prescriptions/${firstId}`, { token: tokenA });
  check('owner can fetch by id -> 200', ownerGet.status === 200 && ownerGet.json?.data?.prescription?.id === firstId,
    ownerGet.status);

  const otherGet = await call('GET', `/prescriptions/${firstId}`, { token: tokenB });
  check('another patient gets 404 for someone else s prescription', otherGet.status === 404, otherGet.status);

  const randomId = new mongoose.Types.ObjectId().toString();
  const missingGet = await call('GET', `/prescriptions/${randomId}`, { token: tokenA });
  check('non-existent id -> 404', missingGet.status === 404, missingGet.status);

  const invalidGet = await call('GET', '/prescriptions/not-an-id', { token: tokenA });
  check('malformed id -> 404 (no 500)', invalidGet.status === 404, invalidGet.status);

  // ── AI service misbehaviour -> 502 ─────────────────────────────────────────
  stub.mode = 'html';
  const htmlResp = await postPrescription(tokenA, {});
  check('AI service returns non-JSON (200 HTML) -> 502', htmlResp.status === 502, `${htmlResp.status} ${htmlResp.json?.message}`);

  stub.mode = 'error500';
  const errResp = await postPrescription(tokenA, {});
  check('AI service returns 500 {error} -> 502', errResp.status === 502, `${errResp.status} ${errResp.json?.message}`);

  const failedWrites = await Prescription.countDocuments({ patientId: userA._id });
  check('failed AI attempts never create partial records', failedWrites === 2, `records=${failedWrites}`);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await new Promise((resolve) => server.close(resolve));
  await Prescription.deleteMany({ patientId: { $in: [userA._id] } });
  console.log('cleanup: stub stopped, test prescriptions removed');

  console.log(failures === 0 ? 'ALL PRESCRIPTION CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('Test crashed:', e);
  try { await mongoose.disconnect(); } catch (err) { /* ignore */ }
  process.exit(2);
});
