// Complete appointment-flow verification for EVERY demo provider (checks A-K).
//   A. Provider exists in MongoDB (verified directly against the collection)
//   B. Provider has a valid MongoDB id (also resolvable via GET /api/doctors/:id)
//   C. Provider has a specialty
//   D. Provider has future availability
//   E. Patient can book a slot
//   F. Appointment contains the correct doctorId
//   G. Patient can retrieve the appointment (My Appointments)
//   H. Corresponding doctor can retrieve it (Doctor Dashboard)
//   I. Another doctor can neither see nor update it
//   J. Patient can cancel it
//   K. The slot becomes available again after cancellation
// Usage: node test_demo_providers_flow.js   (requires backend running on :5000)
require('./src/config/env');

const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Doctor = require('./src/models/Doctor');

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const DEMO_PASSWORD = 'Demo@1234';
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

// Mirrors seeds/doctorSeed.js slugEmail: "Dr. Priya Sharma" -> priya.sharma@demo.clinova.test
function slugEmail(name) {
  let base = String(name).toLowerCase();
  if (base.startsWith('dr.')) base = base.slice(3).trim();
  let slug = '';
  let prevDot = false;
  for (const ch of base) {
    const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlnum) { slug += ch; prevDot = false; }
    else if (!prevDot && slug) { slug += '.'; prevDot = true; }
  }
  while (slug.endsWith('.')) slug = slug.slice(0, -1);
  return `${slug}@demo.clinova.test`;
}

const REQUIRED_NAMES = [
  'Dr. Priya Sharma',
  'Dr. Vivek Rao',
  'Dr. Ananya Mehta',
  'Dr. Rohan Desai',
  'Dr. Neha Kulkarni',
  'Dr. Arjun Patel',
  'Dr. Sneha Nair',
  'Dr. Karan Shah',
  'Dr. Meera Joshi',
  'Dr. Rahul Iyer'
];

const todayString = () => new Date().toISOString().split('T')[0];

(async () => {
  await connectDB();
  const stamp = Date.now();

  // ── Setup: two patients ─────────────────────────────────────────────────────
  const regA = await call('POST', '/auth/register', { body: { name: 'Flow Patient A', email: `flow.a.${stamp}@example.test`, password: 'Passw0rd!' } });
  const tokenA = regA.json?.data?.token;
  check('patient A registers', regA.status === 201 && !!tokenA, regA.status);
  const regB = await call('POST', '/auth/register', { body: { name: 'Flow Patient B', email: `flow.b.${stamp}@example.test`, password: 'Passw0rd!' } });
  const tokenB = regB.json?.data?.token;
  check('patient B registers', regB.status === 201 && !!tokenB, regB.status);

  // ── Demo endpoint: protected, independent of location/specialty params ─────
  const noAuth = await call('GET', '/doctors/demo');
  check('GET /api/doctors/demo requires auth (401)', noAuth.status === 401, noAuth.status);
  const demo = await call('GET', '/doctors/demo', { token: tokenA });
  check('GET /api/doctors/demo returns 200 with no query params', demo.status === 200, demo.status);
  const list = demo.json?.data?.doctors || [];
  check('at least 10 demo providers returned', list.length >= 10, `count=${list.length}`);
  const payload = JSON.stringify(demo.json);
  check('demo payload exposes no passwords', !payload.toLowerCase().includes('password'));
  check('demo payload exposes no login emails', !payload.includes('@demo.clinova.test'));
  const specialties = new Set(list.map((d) => d.specialty));
  check('demo providers cover multiple specialties', specialties.size >= 6, `${specialties.size} specialties: ${[...specialties].join(', ')}`);

  const names = new Set(list.map((d) => d.name));
  const missing = REQUIRED_NAMES.filter((n) => !names.has(n));
  check('all 10 requested demo provider names exist', missing.length === 0, missing.length ? missing.join(', ') : 'all 10 present');

  // ── Direct MongoDB verification (A) ────────────────────────────────────────
  const raw = await Doctor.find({ $or: [{ demoProvider: true }, { isDemo: true }] }).lean();
  check('A: MongoDB contains at least 10 demo providers', raw.length >= 10, `mongo=${raw.length}`);
  check('A: every API id is a real MongoDB _id', list.every((d) => raw.some((r) => String(r._id) === d.id)));
  check('every demo provider has demoProvider=true', raw.every((d) => d.demoProvider === true), raw.filter((d) => d.demoProvider !== true).map((d) => d.name).join(','));
  check('every demo provider has a login email', raw.every((d) => !!d.email));
  check('password is never returned by a default query (select:false)', raw.every((d) => d.password === undefined));
  const today = todayString();
  check('D: every demo provider has future availability in MongoDB',
    raw.every((d) => (d.availableSlots || []).some((s) => s.date > today && (s.times || []).length > 0)),
    raw.filter((d) => !(d.availableSlots || []).some((s) => s.date > today && (s.times || []).length > 0)).map((d) => d.name).join(','));

  // ── Doctor login account for every provider (req 5) ────────────────────────
  const doctorTokens = new Map();
  for (const d of list) {
    const email = slugEmail(d.name);
    const login = await call('POST', '/doctor-auth/login', { body: { email, password: DEMO_PASSWORD } });
    check(`login works: ${d.name} <${email}>`, login.status === 200, `status=${login.status}`);
    check(`login payload has no password: ${d.name}`, !JSON.stringify(login.json).toLowerCase().includes('password'));
    if (login.status === 200) doctorTokens.set(d.id, login.json?.data?.token);
  }
  check('every demo provider has a working doctor login', doctorTokens.size === list.length, `${doctorTokens.size}/${list.length}`);
  const badLogin = await call('POST', '/doctor-auth/login', { body: { email: slugEmail(list[0].name), password: 'wrong-password' } });
  check('doctor login with wrong password is rejected (401)', badLogin.status === 401, badLogin.status);

  // ── A-K loop for EVERY demo provider ───────────────────────────────────────
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < sorted.length; i += 1) {
    const d = sorted[i];
    const label = `[${i + 1}/${sorted.length}] ${d.name}`;
    console.log(`--- ${label} ---`);

    check(`B: ${d.name} has a valid MongoDB id`, /^[0-9a-f]{24}$/.test(d.id), d.id);
    check(`C: ${d.name} has a specialty`, typeof d.specialty === 'string' && d.specialty.trim().length > 0, d.specialty);

    const detail = await call('GET', `/doctors/${d.id}`, { token: tokenA });
    check(`A: ${d.name} resolves by its own id`, detail.status === 200 && detail.json?.data?.doctor?.id === d.id, `status=${detail.status}`);

    const future = (d.availableSlots || [])
      .filter((s) => s.date > today && (s.times || []).length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    check(`D: ${d.name} has future availability`, future.length > 0, `${future.length} upcoming days`);
    if (future.length === 0) continue;

    // Pick a slot that is not currently held (skips leftovers from other test runs)
    const bookedRes = await call('GET', `/appointments/booked?doctorId=${d.id}`, { token: tokenA });
    const held = new Set((bookedRes.json?.data?.booked || []).map((b) => `${b.date}|${b.timeSlot}`));
    let date = null;
    let timeSlot = null;
    for (const day of future) {
      const free = day.times.find((t) => !held.has(`${day.date}|${t}`));
      if (free) { date = day.date; timeSlot = free; break; }
    }
    check(`E: ${d.name} has a free slot`, !!date, date ? `${date} ${timeSlot}` : 'no free slot');
    if (!date) continue;

    const notes = `A-K flow ${stamp} for ${d.name}`;
    const book = await call('POST', '/appointments', { token: tokenA, body: { doctorId: d.id, date, timeSlot, notes } });
    check(`E: ${d.name} booking accepted (201)`, book.status === 201, `${book.status} ${book.json?.message}`);
    const appt = book.json?.data?.appointment;
    if (!appt) continue;

    check(`F: ${d.name} appointment holds this doctor's id`, appt.doctor?.id === d.id, appt.doctor?.id);

    const mine = await call('GET', '/appointments', { token: tokenA });
    const found = (mine.json?.data?.appointments || []).find((a) => a.id === appt.id);
    check(`G: patient My Appointments shows ${d.name} booking`, !!found && found.doctor?.id === d.id, found?.doctor?.id);

    const dt = doctorTokens.get(d.id);
    const dApps = await call('GET', '/doctor-auth/appointments', { token: dt });
    const dFound = (dApps.json?.data?.appointments || []).find((a) => a.id === appt.id);
    check(`H: ${d.name} dashboard sees the appointment`, !!dFound && dFound.date === date && dFound.timeSlot === timeSlot && dFound.notes === notes,
      dFound ? `${dFound.date} ${dFound.timeSlot} ${dFound.status}` : 'not found');

    const other = sorted.find((x) => x.id !== d.id);
    const ot = doctorTokens.get(other.id);
    const oApps = await call('GET', '/doctor-auth/appointments', { token: ot });
    check(`I: ${other.name} cannot see ${d.name} appointment`, !(oApps.json?.data?.appointments || []).some((a) => a.id === appt.id));
    const oUpd = await call('PATCH', `/doctor-auth/appointments/${appt.id}/status`, { token: ot, body: { status: 'confirmed' } });
    check(`I: ${other.name} cannot update ${d.name} appointment (404)`, oUpd.status === 404, oUpd.status);

    const conf = await call('PATCH', `/doctor-auth/appointments/${appt.id}/status`, { token: dt, body: { status: 'confirmed' } });
    check(`status flow: ${d.name} pending -> confirmed`, conf.status === 200 && conf.json?.data?.appointment?.status === 'confirmed', conf.status);

    const cancel = await call('PATCH', `/appointments/${appt.id}/cancel`, { token: tokenA });
    check(`J: patient cancels ${d.name} appointment`, cancel.status === 200 && cancel.json?.data?.appointment?.status === 'cancelled',
      `status=${cancel.status} new=${cancel.json?.data?.appointment?.status}`);

    const after = await call('GET', `/appointments/booked?doctorId=${d.id}&date=${date}`, { token: tokenA });
    const stillHeld = (after.json?.data?.booked || []).some((b) => b.date === date && b.timeSlot === timeSlot);
    check(`K: ${d.name} slot released after cancellation`, !stillHeld);
    const rebook = await call('POST', '/appointments', { token: tokenB, body: { doctorId: d.id, date, timeSlot } });
    check(`K: ${d.name} slot rebookable after cancellation (201)`, rebook.status === 201, rebook.status);
    if (rebook.status === 201) {
      await call('PATCH', `/appointments/${rebook.json.data.appointment.id}/cancel`, { token: tokenB });
    }
  }

  // ── Full status workflow incl. completed (req 8), on the first provider ────
  const first = sorted[0];
  const futureDays = (first.availableSlots || [])
    .filter((s) => s.date > today && (s.times || []).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let wf = null;
  for (const day of [...futureDays].reverse()) {
    const booked = await call('GET', `/appointments/booked?doctorId=${first.id}&date=${day.date}`, { token: tokenA });
    const heldTimes = new Set((booked.json?.data?.booked || []).map((b) => b.timeSlot));
    const free = day.times.find((t) => !heldTimes.has(t));
    if (free) { wf = { date: day.date, timeSlot: free }; break; }
  }
  check('workflow: free slot available on first provider', !!wf, wf ? `${wf.date} ${wf.timeSlot}` : 'none');
  if (wf) {
    const book2 = await call('POST', '/appointments', { token: tokenA, body: { doctorId: first.id, date: wf.date, timeSlot: wf.timeSlot, notes: 'status workflow check' } });
    check('workflow: extra appointment books (201)', book2.status === 201, book2.status);
    const id2 = book2.json?.data?.appointment?.id;
    const dt2 = doctorTokens.get(first.id);
    const c1 = await call('PATCH', `/doctor-auth/appointments/${id2}/status`, { token: dt2, body: { status: 'confirmed' } });
    check('workflow: pending -> confirmed', c1.status === 200, c1.status);
    const c2 = await call('PATCH', `/doctor-auth/appointments/${id2}/status`, { token: dt2, body: { status: 'completed' } });
    check('workflow: confirmed -> completed', c2.status === 200 && c2.json?.data?.appointment?.status === 'completed', c2.status);
    const seen = await call('GET', '/appointments', { token: tokenA });
    check('workflow: patient sees completed status', (seen.json?.data?.appointments || []).find((a) => a.id === id2)?.status === 'completed');
    const cBad = await call('PATCH', `/appointments/${id2}/cancel`, { token: tokenA });
    check('workflow: completed appointment cannot be cancelled (400)', cBad.status === 400, cBad.status);
    const invalid = await call('PATCH', `/doctor-auth/appointments/${id2}/status`, { token: dt2, body: { status: 'pending' } });
    check('workflow: completed -> pending rejected (400)', invalid.status === 400, invalid.status);
  }

  console.log(failures === 0 ? 'ALL DEMO PROVIDER CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('Test crashed:', e);
  try { await mongoose.disconnect(); } catch (err) { /* ignore */ }
  process.exit(2);
});
