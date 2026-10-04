// Browser E2E: DEMO PROVIDERS are ALWAYS visible and fully bookable, independent of
// geolocation, the real-provider endpoint (Groq/Nominatim), and the internet.
//   Pass 1: geolocation DENIED + /api/providers/nearby -> 429 + all external hosts blocked
//           -> demo section renders all providers; full booking flow works
//   Pass 2: geolocation GRANTED + /api/providers/nearby -> 429 -> demos still render
//   Pass 3: mismatched recommended specialty -> demo section never empties
// Usage: node test_demo_providers_ui.js  (requires backend :5000 and vite dev :5173)
import puppeteer from 'puppeteer-core';

const APP = 'http://localhost:5173';
const API = 'http://localhost:5000/api';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const REQUIRED_NAMES = [
  'Dr. Priya Sharma', 'Dr. Vivek Rao', 'Dr. Ananya Mehta', 'Dr. Rohan Desai',
  'Dr. Neha Kulkarni', 'Dr. Arjun Patel', 'Dr. Sneha Nair', 'Dr. Karan Shah',
  'Dr. Meera Joshi', 'Dr. Rahul Iyer'
];

const DEMO_PASSWORD = 'Demo@1234';

// Mirrors seeds/doctorSeed.js: "Dr. Ananya Mehta" -> ananya.mehta@demo.clinova.test
function doctorEmail(name) {
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

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pageText = (page) => page.evaluate(() => document.body.innerText);

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

async function demoStats(page) {
  return page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Demo providers"]');
    if (!section) return null;
    const cards = [...section.querySelectorAll('li')];
    return {
      heading: document.body.innerText.toUpperCase().includes('DEMO PROVIDERS'),
      cards: cards.length,
      badges: cards.filter((c) => c.innerText.includes('Demo Provider')).length,
      bookButtons: [...section.querySelectorAll('button')].filter((b) => b.textContent.includes('Book Appointment')).length,
      firstCard: cards[0] ? cards[0].innerText : '',
      allText: section.innerText
    };
  });
}

(async () => {
  const stamp = Date.now();
  const email = `demoui.patient.${stamp}@example.test`;
  const password = 'Passw0rd!';

  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Demo UI Patient', email, password })
  });
  check('patient registers via API', reg.status === 201, reg.status);
  if (reg.status !== 201) process.exit(1);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900']
  });
  // NOTE: no geolocation permission is granted to this context -> DENIED by default.

  try {
    const context = browser.defaultBrowserContext();

    // ── Helpers for both passes ───────────────────────────────────────────────
    async function newPage({ blockNearby }) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 900 });
      await page.setCacheEnabled(false);
      page.on('dialog', (d) => d.accept());
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        // Simulate the real-provider endpoint failing (429 rate limit / Groq-Nominatim outage)
        if (blockNearby && url.includes('/api/providers/nearby')) {
          return req.respond({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'Rate limited' })
          });
        }
        // Local dev servers only — everything external (tiles, CDNs, fonts) is cut off
        if (url.includes('localhost') || url.includes('127.0.0.1') || url.startsWith('data:') || url.startsWith('blob:')) {
          return req.continue();
        }
        return req.abort();
      });
      // Track that the demo endpoint is what feeds the section, and geo search is not needed
      page.demoApiHits = [];
      page.on('response', (res) => {
        if (res.url().includes('/api/doctors/demo') && res.request().method() === 'GET') page.demoApiHits.push(res.status());
      });
      page.searchApiHits = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/doctors/search')) page.searchApiHits.push(req.url());
      });
      return page;
    }

    async function loginThroughUi(page) {
      await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
      await page.type('input[type="email"]', email);
      await page.type('input[type="password"]', password);
      await Promise.all([
        page.waitForFunction(() => location.pathname === '/symptoms', { timeout: 20000 }),
        page.click('button[type="submit"]')
      ]);
    }

    async function assertAllDemosVisible(page, scenario) {
      await page.waitForFunction(() => document.body.innerText.toUpperCase().includes('DEMO PROVIDERS'), { timeout: 30000 });
      await page.waitForFunction(() => {
        const section = document.querySelector('section[aria-label="Demo providers"]');
        return section && section.querySelectorAll('li').length > 0;
      }, { timeout: 30000 });
      await sleep(500);
      const stats = await demoStats(page);
      const text = await pageText(page);
      check(`${scenario}: demo section heading visible`, stats && stats.heading);
      check(`${scenario}: at least 10 demo provider cards`, stats.cards >= 10, `cards=${stats.cards}`);
      check(`${scenario}: every card labelled "Demo Provider"`, stats.badges === stats.cards, `${stats.badges}/${stats.cards}`);
      check(`${scenario}: every card has a Book Appointment button`, stats.bookButtons === stats.cards, `${stats.bookButtons}/${stats.cards}`);
      const missing = REQUIRED_NAMES.filter((n) => !text.includes(n));
      check(`${scenario}: all 10 required demo providers rendered`, missing.length === 0, missing.length ? missing.join(', ') : 'all 10 present');
      check(`${scenario}: demo section served by GET /api/doctors/demo`,
        page.demoApiHits.some((s) => s === 200 || s === 304), page.demoApiHits.join(','));
      check(`${scenario}: no geo-dependent /api/doctors/search request needed`, page.searchApiHits.length === 0, page.searchApiHits.join(','));
      check(`${scenario}: no fake rating/fee claims on demo cards`,
        !stats.allText.includes('rating') && !stats.allText.includes('consultation fee') && !stats.allText.includes('/ 5'));
      return stats;
    }

    // ═══════ PASS 1 — geolocation DENIED + real-provider endpoint 429 ═══════
    console.log('PASS 1 — geolocation denied, /api/providers/nearby returns 429, external internet blocked');
    const page1 = await newPage({ blockNearby: true });
    await loginThroughUi(page1);
    await page1.goto(`${APP}/doctors?specialty=General%20Medicine`, { waitUntil: 'domcontentloaded' });

    // Location failure UI must appear (it replaces only the map/nearby area)...
    await page1.waitForFunction(() =>
      document.body.innerText.includes('Location access is needed to show nearby doctors'), { timeout: 30000 });
    check('P1: location-denial notice is shown for the nearby/map area', true);
    // ...while demos are STILL visible
    const p1stats = await assertAllDemosVisible(page1, 'P1 (geo denied)');
    check('P1: recommended-specialty normalization puts a match first (General Medicine -> General Physician)',
      p1stats.firstCard.includes('General Physician'), p1stats.firstCard.split('\n').slice(0, 2).join(' | '));

    // ── Full booking flow from the demo card, with NO location ────────────────
    console.log('P1 — full booking flow without location');
    await clickText(page1, 'button', 'Book Appointment');
    await page1.waitForFunction(() => location.pathname.startsWith('/book/'), { timeout: 20000 });
    await page1.waitForFunction(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Date'));
      return label && label.parentElement.querySelector('button');
    }, { timeout: 20000 });
    const bookingTitle = await page1.evaluate(() => {
      const h2 = [...document.querySelectorAll('h2')].find((e) => e.innerText.includes('Book with'));
      return h2 ? h2.innerText : '';
    });
    check('P1: booking page shows doctor information', bookingTitle.includes('Book with'), bookingTitle.split('\n')[0]);
    check('P1: booking page labels the demo provider', bookingTitle.includes('Demo Provider'));
    await page1.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Date'));
      label.parentElement.querySelector('button').click();
    });
    await page1.waitForFunction(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Time'));
      return label && [...label.parentElement.querySelectorAll('button')].some((b) => !b.disabled);
    }, { timeout: 20000 });
    await page1.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Select Time'));
      [...label.parentElement.querySelectorAll('button')].find((b) => !b.disabled).click();
    });
    await page1.evaluate((marker) => {
      const notes = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(notes, marker);
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    }, `geo-denied booking ${stamp}`);
    await Promise.all([
      page1.waitForFunction(() => location.pathname === '/appointments', { timeout: 30000 }),
      clickText(page1, 'button', 'Confirm Booking')
    ]);
    await page1.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 30000 }, `geo-denied booking ${stamp}`);
    const apptText = await pageText(page1);
    check('P1: appointment appears in My Appointments', apptText.includes(`geo-denied booking ${stamp}`));

    // ── Doctor side (real dashboard UI): Doctor A sees it, Doctor B does not ──
    const bookedDoctorName = bookingTitle.replace('Book with', '').replace('Demo Provider', '').trim();
    check('P1: booked demo doctor name captured from booking page', bookedDoctorName.startsWith('Dr.'), bookedDoctorName);
    const otherDoctorEmail = 'vivek.rao@demo.clinova.test';
    check('P1: isolation test uses a different doctor than the booked one',
      doctorEmail(bookedDoctorName) !== otherDoctorEmail, `${bookedDoctorName} vs ${otherDoctorEmail}`);

    const pageD = await newPage({ blockNearby: true });
    // Doctor A: log in through the real doctor login form
    await pageD.goto(`${APP}/doctor/login`, { waitUntil: 'domcontentloaded' });
    await pageD.waitForSelector('input[type="email"]');
    await pageD.type('input[type="email"]', doctorEmail(bookedDoctorName));
    await pageD.type('input[type="password"]', DEMO_PASSWORD);
    await Promise.all([
      pageD.waitForFunction(() => location.pathname === '/doctor/dashboard', { timeout: 20000 }),
      clickText(pageD, 'button', 'Login as Doctor')
    ]);
    await pageD.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 30000 }, `geo-denied booking ${stamp}`);
    const dashText = await pageText(pageD);
    check('P1: doctor dashboard shows the appointment (patient, notes, PENDING)',
      dashText.includes('Demo UI Patient') && dashText.includes('PENDING'),
      dashText.includes('Demo UI Patient') ? 'patient + PENDING visible' : 'patient name missing');

    // Doctor B: another demo doctor must NOT see this appointment
    await pageD.evaluate(() => localStorage.removeItem('clinova_doctor_token'));
    await pageD.goto(`${APP}/doctor/login`, { waitUntil: 'domcontentloaded' });
    await pageD.waitForSelector('input[type="email"]');
    await pageD.type('input[type="email"]', otherDoctorEmail);
    await pageD.type('input[type="password"]', DEMO_PASSWORD);
    await Promise.all([
      pageD.waitForFunction(() => location.pathname === '/doctor/dashboard', { timeout: 20000 }),
      clickText(pageD, 'button', 'Login as Doctor')
    ]);
    await pageD.waitForFunction(() =>
      document.body.innerText.includes('Doctor Dashboard') && !document.body.innerText.includes('Loading...'),
      { timeout: 30000 });
    await sleep(800); // allow the appointment list to settle
    const otherDashText = await pageText(pageD);
    check('P1: another doctor does NOT see that appointment on their dashboard',
      !otherDashText.includes(`geo-denied booking ${stamp}`));
    await pageD.close();

    // Cancel it so repeated runs stay clean
    await page1.evaluate((marker) => {
      const card = [...document.querySelectorAll('div')].filter((d) => d.className.includes('bg-white p-4 rounded shadow'))
        .find((d) => d.innerText.includes(marker));
      [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click();
    }, `geo-denied booking ${stamp}`);
    await page1.waitForFunction((marker) => {
      const card = [...document.querySelectorAll('div')].filter((d) => d.className.includes('bg-white p-4 rounded shadow'))
        .find((d) => d.innerText.includes(marker));
      return card && card.innerText.includes('CANCELLED');
    }, { timeout: 20000 }, `geo-denied booking ${stamp}`);
    check('P1: cancellation works from My Appointments', true);
    await page1.close();

    // ═══════ PASS 2 — geolocation GRANTED but real-provider endpoint 429 ═══════
    console.log('PASS 2 — geolocation granted, /api/providers/nearby still returns 429');
    const page2 = await newPage({ blockNearby: true });
    await context.overridePermissions(APP, ['geolocation']);
    await page2.setGeolocation({ latitude: 19.39, longitude: 72.83 });
    await loginThroughUi(page2);
    await page2.goto(`${APP}/doctors?specialty=Cardiology`, { waitUntil: 'domcontentloaded' });
    await assertAllDemosVisible(page2, 'P2 (nearby 429)');
    const p2text = await pageText(page2);
    check('P2: real-provider failure does NOT show a broken nearby section', !p2text.includes('Nearby Doctors'));
    check('P2: demo cards still labelled while real sections are empty', p2text.includes('Demo Provider'));
    await page2.close();

    // ═══════ PASS 3 — mismatched specialty must never empty the demo section ═══════
    console.log('PASS 3 — specialty wording mismatches never empty the demo section');
    const page3 = await newPage({ blockNearby: false });
    await loginThroughUi(page3);
    for (const specialty of ['Physician', 'General Medicine', 'Ortho', 'Pediatric Surgeon', 'xyz-specialty']) {
      await page3.goto(`${APP}/doctors?specialty=${encodeURIComponent(specialty)}`, { waitUntil: 'domcontentloaded' });
      const stats = await (async () => {
        await page3.waitForFunction(() => {
          const section = document.querySelector('section[aria-label="Demo providers"]');
          return section && section.querySelectorAll('li').length > 0;
        }, { timeout: 30000 });
        return demoStats(page3);
      })();
      check(`P3: specialty "${specialty}" still shows at least 10 demo providers`, stats && stats.cards >= 10, `cards=${stats ? stats.cards : 'n/a'}`);
    }
    await page3.close();

    await context.overridePermissions(APP, []);
  } catch (err) {
    check(`unexpected error: ${err.message}`, false);
    console.error(err);
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? 'ALL DEMO PROVIDER UI CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
