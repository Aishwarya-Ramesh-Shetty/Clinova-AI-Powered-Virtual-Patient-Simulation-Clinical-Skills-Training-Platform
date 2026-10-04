// Browser E2E for the prescription frontend integration, driving the REAL UI:
//   - accept attribute restricted to JPEG/PNG/WebP
//   - upload via real POST /api/prescriptions (multipart, stub AI service on :8000)
//   - extraction results render medicines + doctor_name/date/diagnosis from the real response
//   - Prescription Vault lists MongoDB records with doctor_name + upload date (no Invalid Date)
//   - backend error messages surface as toasts (unsupported MIME, invalid AI response)
// Usage: node test_prescription_ui.js  (requires backend :5000 and vite dev :5173)
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';

const APP = 'http://localhost:5173';
const API = 'http://localhost:5000/api';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const AI_PORT = 8000;
const PNG_PATH = 'tmp_rx_ui_test.png';
const TXT_PATH = 'tmp_rx_ui_test.txt';
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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

// Stub of the FastAPI /extract-prescription endpoint
const stub = { mode: 'good' };
function startStub() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (stub.mode === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>not json</html>');
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
        raw_text: 'Rx: Amoxicillin 500mg BD x 5 days'
      }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(AI_PORT, () => resolve(server));
  });
}

(async () => {
  const stamp = Date.now();
  const email = `rxui.patient.${stamp}@example.test`;
  const password = 'Passw0rd!';

  fs.writeFileSync(PNG_PATH, PNG_BYTES);
  fs.writeFileSync(TXT_PATH, 'this is not an image');

  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Rx UI Patient', email, password })
  });
  check('patient registers via API', reg.status === 201, reg.status);
  if (reg.status !== 201) process.exit(1);

  const server = await startStub();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    page.on('dialog', (d) => d.accept());

    // Login through the real login form
    await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForFunction(() => location.pathname === '/symptoms', { timeout: 20000 }),
      page.click('button[type="submit"]')
    ]);
    check('login through the login form', true);

    // ── Upload page: accept attribute ─────────────────────────────────────────
    await page.goto(`${APP}/prescriptions/upload`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="file"]');
    const accept = await page.evaluate(() => document.querySelector('input[type="file"]').getAttribute('accept'));
    check('file input accepts only JPEG/PNG/WebP', accept === 'image/jpeg,image/png,image/webp', accept);

    // ── Real upload happy path ────────────────────────────────────────────────
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(PNG_PATH);
    await clickText(page, 'button', 'Upload & Extract');
    await page.waitForFunction(() => document.body.innerText.includes('Extraction Results'), { timeout: 30000 });
    const uploadText = await pageText(page);
    check('loading state appeared (button disabled while extracting)', await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Extract'));
      return btn !== undefined;
    }));
    check('medicines table shows real extracted medicines',
      uploadText.includes('Amoxicillin 500mg') && uploadText.includes('Paracetamol'));
    check('doctor shown from extractedData.doctor_name', uploadText.includes('Dr. Stub Tester'));
    check('date and diagnosis shown from real response',
      uploadText.includes('2026-10-04') && uploadText.includes('Bacterial throat infection'));
    check('success toast from real upload', uploadText.includes('Uploaded successfully'));

    // ── Vault: MongoDB records with doctor_name + upload date ─────────────────
    await clickText(page, 'a', 'View Prescription Vault');
    await page.waitForFunction(() => location.pathname === '/prescriptions', { timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('Dr. Stub Tester'), { timeout: 20000 });
    const vaultText = await pageText(page);
    check('vault lists the MongoDB prescription with doctor_name', vaultText.includes('Dr. Stub Tester'));
    check('vault shows the medicines', vaultText.includes('Amoxicillin 500mg - 1 capsule'));
    check('vault shows a valid upload date (no Invalid Date)',
      !vaultText.includes('Invalid Date') && vaultText.includes(String(new Date().getFullYear())),
      vaultText.includes('Invalid Date') ? 'Invalid Date present' : 'current year rendered from createdAt');
    check('vault keeps the Upload New navigation', vaultText.includes('Upload New'));

    // ── Backend error message for unsupported MIME type ───────────────────────
    await page.goto(`${APP}/prescriptions/upload`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="file"]');
    const fileInput2 = await page.$('input[type="file"]');
    await fileInput2.uploadFile(TXT_PATH);
    await clickText(page, 'button', 'Upload & Extract');
    await page.waitForFunction(() => document.body.innerText.includes('Unsupported file type'), { timeout: 20000 });
    check('backend 400 message (unsupported MIME) shown as toast', true);

    // ── Backend error message when the AI service misbehaves ──────────────────
    stub.mode = 'html';
    await sleep(4500); // let the previous toast dismiss
    const fileInput3 = await page.$('input[type="file"]');
    await fileInput3.uploadFile(PNG_PATH);
    await clickText(page, 'button', 'Upload & Extract');
    await page.waitForFunction(() => document.body.innerText.includes('AI service returned an invalid response'), { timeout: 20000 });
    check('backend 502 message (invalid AI response) shown as toast', true);
    const errText = await pageText(page);
    check('no fake extraction results after a failed upload', !errText.includes('Extraction Results'));

    await page.close();
  } catch (err) {
    check(`unexpected error: ${err.message}`, false);
    console.error(err);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(PNG_PATH, { force: true });
    fs.rmSync(TXT_PATH, { force: true });
  }

  console.log(failures === 0 ? 'ALL PRESCRIPTION UI CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
