// End-to-end test of the demo appointment lifecycle against a running backend (http://localhost:5000).
// Usage: node test_appointment_flow.js
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

(async () => {
  const stamp = Date.now();
  const patientA = { name: 'Test Patient A', email: `patient.a.${stamp}@example.test`, password: 'Passw0rd!', phone: '9999900001' };
  const patientB = { name: 'Test Patient B', email: `patient.b.${stamp}@example.test`, password: 'Passw0rd!' };

  // 1-3. register patients
  const regA = await call('POST', '/auth/register', { body: patientA });
  check('patient A registers', regA.status === 201, regA.status);
  const tokenA = regA.json?.data?.token;
  const regB = await call('POST', '/auth/register', { body: patientB });
  const tokenB = regB.json?.data?.token;
  check('patient B registers', regB.status === 201, regB.status);

  // 4. find a demo doctor (via the real doctor-detail API, Dr. Priya Sharma via search)
  const search = await call('GET', '/doctors/search?specialty=Cardiology&lat=19.39&lng=72.83&radius=20', { token: tokenA });
  const priya = (search.json?.data?.doctors || []).find((d) => d.name === 'Dr. Priya Sharma');
  check('demo doctor Dr. Priya Sharma found with Mongo id', !!priya?.id, priya?.id);
  const slotDay = priya.availableSlots[0];
  const date = slotDay.date;
  const timeSlot = slotDay.times[0];

  // 5-6. book
  const notes = `Chest tightness since yesterday ${stamp}`;
  const book = await call('POST', '/appointments', { token: tokenA, body: { doctorId: priya.id, date, timeSlot, notes } });
  check('POST /appointments succeeds (201)', book.status === 201, `${book.status} ${book.json?.message}`);
  const appt = book.json?.data?.appointment;
  check('new appointment status is pending', appt?.status === 'pending', appt?.status);

  // validation / security on booking
  const dup = await call('POST', '/appointments', { token: tokenB, body: { doctorId: priya.id, date, timeSlot } });
  check('double booking same slot rejected (409)', dup.status === 409, dup.status);
  const badSlot = await call('POST', '/appointments', { token: tokenB, body: { doctorId: priya.id, date, timeSlot: '03:33' } });
  check('unavailable time slot rejected (400)', badSlot.status === 400, badSlot.status);
  const noAuth = await call('POST', '/appointments', { body: { doctorId: priya.id, date, timeSlot } });
  check('booking without token rejected (401)', noAuth.status === 401, noAuth.status);

  // 7-8. patient sees it
  const mineA = await call('GET', '/appointments', { token: tokenA });
  const foundA = (mineA.json?.data?.appointments || []).find((a) => a.id === appt?.id);
  check('patient A sees appointment in GET /appointments', !!foundA);
  check('patient sees doctor name', foundA?.doctor?.name === 'Dr. Priya Sharma', foundA?.doctor?.name);
  const mineB = await call('GET', '/appointments', { token: tokenB });
  check('patient B does NOT see patient A appointment', !(mineB.json?.data?.appointments || []).some((a) => a.id === appt?.id));

  // 9. doctor login
  const bad = await call('POST', '/doctor-auth/login', { body: { email: 'priya.sharma@demo.clinova.test', password: 'wrong' } });
  check('doctor login with wrong password rejected (401)', bad.status === 401, bad.status);
  const dl = await call('POST', '/doctor-auth/login', { body: { email: 'priya.sharma@demo.clinova.test', password: 'Demo@1234' } });
  check('doctor Priya logs in', dl.status === 200, dl.status);
  const doctorToken = dl.json?.data?.token;
  check('doctor login response has no password', !JSON.stringify(dl.json).includes('password'));
  const dl2 = await call('POST', '/doctor-auth/login', { body: { email: 'vivek.rao@demo.clinova.test', password: 'Demo@1234' } });
  const vivekToken = dl2.json?.data?.token;

  // token isolation
  const patientTokenOnDoctor = await call('GET', '/doctor-auth/appointments', { token: tokenA });
  check('patient token rejected on doctor endpoint (401)', patientTokenOnDoctor.status === 401, patientTokenOnDoctor.status);
  const doctorTokenOnPatient = await call('GET', '/appointments', { token: doctorToken });
  check('doctor token rejected on patient endpoint (401)', doctorTokenOnPatient.status === 401, doctorTokenOnPatient.status);

  // 10-12. doctor sees the SAME appointment
  const dApps = await call('GET', '/doctor-auth/appointments', { token: doctorToken });
  const dFound = (dApps.json?.data?.appointments || []).find((a) => a.id === appt?.id);
  check('doctor Priya sees the SAME appointment id', !!dFound, dFound?.id);
  check('patient name matches', dFound?.patient?.name === patientA.name, dFound?.patient?.name);
  check('date matches', dFound?.date === date, dFound?.date);
  check('time matches', dFound?.timeSlot === timeSlot, dFound?.timeSlot);
  check('notes match', dFound?.notes === notes, dFound?.notes);
  check('status matches (pending)', dFound?.status === 'pending', dFound?.status);
  check('doctor response exposes no patient password', !JSON.stringify(dApps.json).toLowerCase().includes('"password"'));

  // another doctor must not see/modify it
  const vApps = await call('GET', '/doctor-auth/appointments', { token: vivekToken });
  check('doctor Vivek does NOT see Priya appointment', !(vApps.json?.data?.appointments || []).some((a) => a.id === appt?.id));
  const vUpdate = await call('PATCH', `/doctor-auth/appointments/${appt?.id}/status`, { token: vivekToken, body: { status: 'confirmed' } });
  check('doctor Vivek cannot update Priya appointment (404)', vUpdate.status === 404, vUpdate.status);

  // 13. status workflow
  const bogus = await call('PATCH', `/doctor-auth/appointments/${appt?.id}/status`, { token: doctorToken, body: { status: 'completed' } });
  check('invalid transition pending->completed rejected (400)', bogus.status === 400, bogus.status);
  const confirm = await call('PATCH', `/doctor-auth/appointments/${appt?.id}/status`, { token: doctorToken, body: { status: 'confirmed' } });
  check('doctor confirms appointment', confirm.status === 200 && confirm.json?.data?.appointment?.status === 'confirmed', confirm.status);
  const afterA = await call('GET', '/appointments', { token: tokenA });
  const seenA = (afterA.json?.data?.appointments || []).find((a) => a.id === appt?.id);
  check('patient sees updated status "confirmed"', seenA?.status === 'confirmed', seenA?.status);

  // patient B cannot cancel patient A's appointment
  const hijack = await call('PATCH', `/appointments/${appt?.id}/cancel`, { token: tokenB });
  check('patient B cannot cancel patient A appointment (404)', hijack.status === 404, hijack.status);

  // patient cancel frees slot
  const cancel = await call('PATCH', `/appointments/${appt?.id}/cancel`, { token: tokenA });
  check('patient A cancels own appointment', cancel.status === 200 && cancel.json?.data?.appointment?.status === 'cancelled', cancel.status);
  const dAfter = await call('GET', '/doctor-auth/appointments', { token: doctorToken });
  check('doctor sees cancelled status', (dAfter.json?.data?.appointments || []).find((a) => a.id === appt?.id)?.status === 'cancelled');
  const rebook = await call('POST', '/appointments', { token: tokenB, body: { doctorId: priya.id, date, timeSlot } });
  check('cancelled slot can be rebooked by another patient', rebook.status === 201, rebook.status);
  // cleanup: cancel rebooked one so repeated runs stay clean
  if (rebook.status === 201) await call('PATCH', `/appointments/${rebook.json.data.appointment.id}/cancel`, { token: tokenB });

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
