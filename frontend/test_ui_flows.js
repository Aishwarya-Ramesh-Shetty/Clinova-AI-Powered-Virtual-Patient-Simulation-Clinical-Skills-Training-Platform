// Browser E2E for the two diagnosis-summary features, driving the REAL UI.
//   TEST A — assessment → Diagnosis History (no booking) → survives refresh
//   TEST B — assessment → book demo provider → My Appointments → Summary → Cancel
//   TEST C — two diagnoses listed separately, each full summary opens correctly
// Usage: node test_ui_flows.js   (requires backend :5000 and vite dev :5173 running)
import puppeteer from 'puppeteer-core';

const APP = 'http://localhost:5173';
const API = 'http://localhost:5000/api';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageText(page) {
  return page.evaluate(() => document.body.innerText);
}

// Click the first element of `selector` whose text contains (or equals) `text`, in-page.
async function clickText(page, selector, text, exact = false) {
  const clicked = await page.evaluate(({ selector, text, exact }) => {
    const el = [...document.querySelectorAll(selector)].find((e) =>
      exact ? e.textContent.trim() === text : e.textContent.includes(text)
    );
    if (!el) return false;
    el.click();
    return true;
  }, { selector, text, exact });
  if (!clicked) throw new Error(`clickText failed: ${selector} "${text}"`);
}

async function hasText(page, selector, text, exact = false) {
  return page.evaluate(({ selector, text, exact }) =>
    [...document.querySelectorAll(selector)].some((e) =>
      exact ? e.textContent.trim() === text : e.textContent.includes(text)
    ), { selector, text, exact });
}

// Run a full symptom assessment through the UI until navigation to /diagnosis.
async function completeAssessment(page, symptoms) {
  await page.goto(`${APP}/symptoms`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder*="sore throat"]'), { timeout: 20000 });
  await page.evaluate((value) => {
    const ta = document.querySelector('textarea[placeholder*="sore throat"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, symptoms);
  await clickText(page, 'button', 'Analyze Symptoms');

  // Answer every follow-up question until Finish Assessment triggers prepare + assess.
  await page.waitForFunction(() => !!document.querySelector('textarea[placeholder="Type your answer here..."]'), { timeout: 90000 });
  let finished = false;
  for (let i = 0; i < 20 && !finished; i += 1) {
    const state = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
      return {
        hasAnswerBox: !!document.querySelector('textarea[placeholder="Type your answer here..."]'),
        next: btns.includes('Next'),
        finish: btns.includes('Finish Assessment'),
        onDiagnosis: location.pathname === '/diagnosis'
      };
    });
    if (state.onDiagnosis) return;
    if (!state.hasAnswerBox) { await sleep(500); continue; }
    if (!state.next && !state.finish) { await sleep(500); continue; }

    await page.evaluate((answer) => {
      const ta = document.querySelector('textarea[placeholder="Type your answer here..."]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, answer);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, 'No, nothing else. It has been mild and slowly improving with rest.');
    await page.evaluate((label) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
      btn.click();
    }, state.finish ? 'Finish Assessment' : 'Next');

    if (state.finish) break;
    await page.waitForFunction(() => {
      const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
      return btns.includes('Next') || btns.includes('Finish Assessment') || location.pathname === '/diagnosis';
    }, { timeout: 60000 });
  }

  await page.waitForFunction(() => location.pathname === '/diagnosis', { timeout: 180000 });
  await page.waitForFunction(() => document.body.innerText.includes('Clinical Assessment'), { timeout: 30000 });
}

// Newest completed session id for the logged-in patient (in-page, uses the session's own token).
async function newestSessionId(page) {
  return page.evaluate(async (api) => {
    const token = localStorage.getItem('clinova_token');
    const res = await fetch(`${api}/symptoms/history`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    return json?.data?.history?.[0]?.id || null;
  }, API);
}

// Wait until the history list has actually rendered (entry present or empty-state shown).
async function waitForHistoryRendered(page, snippet) {
  await page.waitForFunction((snippet) =>
    document.body.innerText.includes(snippet) || document.body.innerText.includes('No saved diagnoses yet'),
  { timeout: 30000 }, snippet);
}

async function openHistoryEntry(page, snippet) {
  await waitForHistoryRendered(page, snippet);
  await page.evaluate((snippet) => {
    const card = [...document.querySelectorAll('div')].filter((d) => d.className.includes('bg-white p-4 rounded shadow'))
      .find((d) => d.innerText.includes(snippet));
    const link = [...card.querySelectorAll('a')].find((a) => a.textContent.includes('View Full Summary'));
    link.click();
  }, snippet);
  await page.waitForFunction(() => location.pathname.startsWith('/diagnosis-history/'), { timeout: 20000 });
  // Wait for the full summary content (or the explicit no-summary message) to render.
  await page.waitForFunction((snippet) =>
    document.body.innerText.includes(snippet) || document.body.innerText.includes('not completed'),
  { timeout: 30000 }, snippet);
}

(async () => {
  const stamp = Date.now();
  const email = `ui.patient.${stamp}@example.test`;
  const password = 'Passw0rd!';

  // Create the patient account via API, then log in through the real login form.
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'UI Test Patient', email, password })
  });
  check('patient registers via API', reg.status === 201, reg.status);
  if (reg.status !== 201) process.exit(1);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900']
  });
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(APP, ['geolocation']);
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setGeolocation({ latitude: 19.39, longitude: 72.83 });
  page.on('dialog', (d) => d.accept());

  // Track symptom-assessment POSTs so we can prove the Summary page never regenerates an assessment.
  let symptomPosts = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/symptoms/')) symptomPosts.push(req.url());
  });

  try {
    // ── Login through the UI ────────────────────────────────────────────────
    await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForFunction(() => location.pathname === '/symptoms', { timeout: 20000 }),
      page.click('button[type="submit"]')
    ]);
    check('login through the login form lands on /symptoms', true);

    // Navbar per spec
    const navText = await page.evaluate(() => document.querySelector('nav')?.innerText || '');
    check('navbar has Home', navText.includes('Home'));
    check('navbar has Symptoms', navText.includes('Symptoms'));
    check('navbar has Appointments', navText.includes('Appointments'));
    check('navbar has Diagnosis History', navText.includes('Diagnosis History'));
    check('navbar has Prescription Vault', navText.includes('Prescription Vault'));
    check('navbar has Profile', navText.includes('Profile'));

    // ─────────────────────── TEST A — without booking ───────────────────────
    console.log('\nTEST A — assessment, then Diagnosis History, without booking');
    const symptomsA = 'I have had a mild tension headache for two days.';
    await completeAssessment(page, symptomsA);
    check('assessment completed and result page shown', true);

    // Do NOT book — go straight to Diagnosis History via the navbar
    await clickText(page, 'nav a', 'Diagnosis History');
    await page.waitForFunction(() => location.pathname === '/diagnosis-history', { timeout: 20000 });
    await waitForHistoryRendered(page, symptomsA);
    let histText = await pageText(page);
    check('diagnosis appears in Diagnosis History without booking', histText.includes(symptomsA));
    check('history shows assessment date', /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(histText));
    check('history shows possible conditions', histText.includes('Possible conditions'));
    check('history shows triage', histText.includes('TRIAGE') || histText.includes('Triage'));
    check('history shows recommended specialist', histText.includes('Recommended specialist'));
    check('history shows View Full Summary button', histText.includes('View Full Summary'));

    // Refresh the page — must still be there (persisted in MongoDB)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHistoryRendered(page, symptomsA);
    histText = await pageText(page);
    check('diagnosis still present after page refresh', histText.includes(symptomsA));

    // Logout → login again — history must survive (persisted server-side in MongoDB)
    await clickText(page, 'nav button', 'Logout');
    await page.waitForFunction(() => location.pathname === '/login', { timeout: 20000 });
    check('logout returns to the login page', true);
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForFunction(() => location.pathname === '/symptoms', { timeout: 20000 }),
      page.click('button[type="submit"]')
    ]);
    await page.goto(`${APP}/diagnosis-history`, { waitUntil: 'domcontentloaded' });
    await waitForHistoryRendered(page, symptomsA);
    histText = await pageText(page);
    check('diagnosis still present after logout/login', histText.includes(symptomsA));

    // Open the full summary
    await openHistoryEntry(page, symptomsA);
    let fullText = await pageText(page);
    check('full summary shows initial symptoms', fullText.includes(symptomsA));
    check('full summary shows follow-up Q&A', fullText.includes('Follow-up questions'));
    check('full summary shows possible conditions', fullText.includes('Possible conditions'));
    check('full summary shows evidence/reasons', fullText.includes('Reported evidence') || fullText.includes('reason'));
    check('full summary shows triage', fullText.includes('Triage'));
    check('full summary shows recommended specialist', fullText.includes('Recommended specialist'));
    check('full summary shows disclaimer', fullText.toLowerCase().includes('does not replace evaluation') || fullText.toLowerCase().includes('informational and educational'));
    const sessionA = await newestSessionId(page);
    check('full summary URL carries the session id', page.url().includes(`/diagnosis-history/${sessionA}`), page.url());

    // ─────────────────────── TEST B — with booking ──────────────────────────
    console.log('\nTEST B — second assessment, book a demo provider, Summary, then Cancel');
    const symptomsB = 'I have a sore throat and mild fever since yesterday.';
    await completeAssessment(page, symptomsB);
    check('second assessment completed', true);
    const sessionB = await newestSessionId(page);
    check('second session is distinct from the first', !!sessionB && sessionB !== sessionA, `${sessionA} vs ${sessionB}`);

    // "Find Nearby ..." from the result page, carrying sessionId
    await clickText(page, 'button', 'Find Nearby');
    await page.waitForFunction(() => location.pathname === '/doctors', { timeout: 20000 });
    check('doctor search URL carries sessionId', page.url().includes(`sessionId=${sessionB}`), decodeURIComponent(page.url()));

    // Demo providers load independently of geolocation → Book Appointment
    await page.waitForFunction(() =>
      document.body.innerText.toUpperCase().includes('DEMO PROVIDERS') &&
      [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Book Appointment')),
      { timeout: 30000 }
    );
    await clickText(page, 'button', 'Book Appointment');
    await page.waitForFunction(() => location.pathname.startsWith('/book/'), { timeout: 20000 });
    check('booking URL carries sessionId', page.url().includes(`sessionId=${sessionB}`), decodeURIComponent(page.url()));

    // Select date + time, confirm booking
    await page.waitForFunction(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Date'));
      return label && label.parentElement.querySelector('button');
    }, { timeout: 20000 });
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Date'));
      label.parentElement.querySelector('button').click();
    });
    await page.waitForFunction(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Time'));
      return label && [...label.parentElement.querySelectorAll('button')].some((b) => !b.disabled);
    }, { timeout: 20000 });
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Time'));
      [...label.parentElement.querySelectorAll('button')].find((b) => !b.disabled).click();
    });
    await page.evaluate(() => {
      const notes = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(notes, `UI booking notes ${Date.now()}`);
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const notesMarker = await page.evaluate(() => document.querySelector('textarea').value);
    await Promise.all([
      page.waitForFunction(() => location.pathname === '/appointments', { timeout: 30000 }),
      clickText(page, 'button', 'Confirm Booking')
    ]);
    await page.waitForFunction((marker) => document.body.innerText.includes(marker), { timeout: 30000 }, notesMarker);
    const apptText = await pageText(page);
    check('appointment listed on My Appointments', apptText.includes(notesMarker));

    // Summary button → saved assessment (no regeneration)
    symptomPosts = [];
    await page.evaluate((marker) => {
      const card = [...document.querySelectorAll('div')].filter((d) => d.className.includes('bg-white p-4 rounded shadow'))
        .find((d) => d.innerText.includes(marker));
      [...card.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Summary').click();
    }, notesMarker);
    await page.waitForFunction(() => location.pathname.startsWith('/summary/'), { timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('Appointment Summary'), { timeout: 20000 });
    await sleep(2500); // allow any (unexpected) requests to surface
    let sumText = await pageText(page);
    check('Summary shows the correct diagnosis (assessment B symptoms)', sumText.includes(symptomsB));
    check('Summary does NOT show the other diagnosis', !sumText.includes(symptomsA));
    check('Summary shows follow-up Q&A', sumText.includes('Follow-up questions'));
    check('Summary shows possible conditions', sumText.includes('Possible conditions'));
    check('Summary shows triage', sumText.includes('Triage'));
    check('Summary shows recommended specialist', sumText.includes('Recommended specialist'));
    check('Summary shows disclaimer', sumText.toLowerCase().includes('does not replace evaluation') || sumText.toLowerCase().includes('informational and educational'));
    check('Summary page made NO new assessment calls (no Gemini regeneration)', symptomPosts.length === 0, symptomPosts.join(', '));

    // Graceful handling: book a second appointment WITHOUT an assessment, then open Summary.
    const unlinkedBook = await page.evaluate(async (api) => {
      const token = localStorage.getItem('clinova_token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const search = await fetch(`${api}/doctors/search?specialty=Cardiology&lat=19.39&lng=72.83&radius=20`, { headers });
      const sj = await search.json();
      const doctor = (sj?.data?.doctors || []).find((d) => d.name === 'Dr. Vivek Rao') || sj?.data?.doctors?.[0];
      const slot = doctor.availableSlots[0];
      const bookRes = await fetch(`${api}/appointments`, {
        method: 'POST', headers,
        body: JSON.stringify({ doctorId: doctor.id, date: slot.date, timeSlot: slot.times[0], notes: `UI unlinked booking ${Date.now()}` })
      });
      const bj = await bookRes.json();
      return { status: bookRes.status, id: bj?.data?.appointment?.id, assessmentSessionId: bj?.data?.appointment?.assessmentSessionId };
    }, API);
    check('unlinked appointment books without an assessment', unlinkedBook.status === 201 && !unlinkedBook.assessmentSessionId,
      JSON.stringify(unlinkedBook));

    symptomPosts = [];
    await page.goto(`${APP}/summary/${unlinkedBook.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Appointment Summary'), { timeout: 20000 });
    await page.waitForFunction(() =>
      document.body.innerText.includes('No diagnosis summary is linked to this appointment'), { timeout: 20000 });
    const unlinkedText = await pageText(page);
    check('Summary page explains there is no linked diagnosis (no fake data generated)',
      unlinkedText.includes('No diagnosis summary is linked to this appointment') &&
      !unlinkedText.includes('Possible conditions'));
    check('graceful Summary page made no assessment calls', symptomPosts.length === 0, symptomPosts.join(', '));

    // Clean up the unlinked appointment
    await page.evaluate(async (api, id) => {
      const token = localStorage.getItem('clinova_token');
      await fetch(`${api}/appointments/${id}/cancel`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    }, API, unlinkedBook.id);

    // Cancel separately — must still work
    await page.goto(`${APP}/appointments`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((marker) => document.body.innerText.includes(marker), { timeout: 30000 }, notesMarker);
    await page.evaluate((marker) => {
      const card = [...document.querySelectorAll('div')].filter((d) => d.className.includes('bg-white p-4 rounded shadow'))
        .find((d) => d.innerText.includes(marker));
      [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click();
    }, notesMarker);
    await page.waitForFunction((marker) => {
      const card = [...document.querySelectorAll('div')].filter((d) => d.className.includes('bg-white p-4 rounded shadow'))
        .find((d) => d.innerText.includes(marker));
      return card && card.innerText.includes('CANCELLED');
    }, { timeout: 20000 }, notesMarker);
    check('Cancel still works — appointment shows CANCELLED', true);

    // ─────────────────────── TEST C — multiple diagnoses ────────────────────
    console.log('\nTEST C — two diagnoses listed separately, correct summary each');
    await page.goto(`${APP}/diagnosis-history`, { waitUntil: 'domcontentloaded' });
    await waitForHistoryRendered(page, symptomsA);
    histText = await pageText(page);
    check('both diagnoses listed', histText.includes(symptomsA) && histText.includes(symptomsB));
    const idxB = histText.indexOf(symptomsB);
    const idxA = histText.indexOf(symptomsA);
    check('newest first (assessment B before assessment A)', idxB !== -1 && idxA !== -1 && idxB < idxA, `${idxB} < ${idxA}`);

    // Open B's summary first (newest card)
    await openHistoryEntry(page, symptomsB);
    fullText = await pageText(page);
    check('full summary for B shows B symptoms', fullText.includes(symptomsB));
    check('full summary for B does not show A symptoms', !fullText.includes(symptomsA));

    // Then A's summary
    await page.goto(`${APP}/diagnosis-history`, { waitUntil: 'domcontentloaded' });
    await openHistoryEntry(page, symptomsA);
    fullText = await pageText(page);
    check('full summary for A shows A symptoms', fullText.includes(symptomsA));
    check('full summary for A does not show B symptoms', !fullText.includes(symptomsB));

    // Security: another patient must not see these (route-level, via API from the browser session)
    const otherToken = await (async () => {
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'UI Outsider', email: `ui.outsider.${stamp}@example.test`, password })
      });
      const j = await r.json();
      return j?.data?.token;
    })();
    const outsiderHist = await (async () => {
      const r = await fetch(`${API}/symptoms/history`, { headers: { Authorization: `Bearer ${otherToken}` } });
      const j = await r.json();
      return (j?.data?.history || []).map((h) => h.id);
    })();
    check('other patient cannot see these diagnoses', !outsiderHist.includes(sessionA) && !outsiderHist.includes(sessionB));
  } catch (err) {
    check(`unexpected error: ${err.message}`, false);
    console.error(err);
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? '\nALL UI CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
