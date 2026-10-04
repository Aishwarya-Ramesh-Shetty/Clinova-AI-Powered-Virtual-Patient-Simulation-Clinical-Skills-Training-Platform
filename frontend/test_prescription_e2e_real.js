// Browser E2E with the REAL OCR chain (no stub):
//   frontend -> Node :5000 -> FastAPI ai-service :8000 -> Gemini Vision -> MongoDB -> Vault
// Flow: login -> Prescriptions -> Upload -> select PNG -> upload -> loading ->
//       OCR result (doctor name, diagnosis, date, medicines/dosage/frequency/duration/
//       instructions) -> saved to MongoDB -> Prescription Vault shows it.
// Usage: node test_prescription_e2e_real.js
//   (requires backend :5000, vite dev :5173, and the ai-service on :8000 running)
import puppeteer from 'puppeteer-core';

const APP = 'http://localhost:5173';
const API = 'http://localhost:5000/api';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const IMAGE = '../tmp_rx_real.png';

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

(async () => {
  const stamp = Date.now();
  const email = `rereal.patient.${stamp}@example.test`;
  const password = 'Passw0rd!';

  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Real E2E Patient', email, password })
  });
  check('patient registers via API', reg.status === 201, reg.status);
  if (reg.status !== 201) process.exit(1);

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

    // Prescriptions -> Upload
    await page.goto(`${APP}/prescriptions/upload`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="file"]');
    const accept = await page.evaluate(() => document.querySelector('input[type="file"]').getAttribute('accept'));
    check('upload accepts JPEG/PNG/WebP only', accept === 'image/jpeg,image/png,image/webp', accept);

    // Select the real image and upload
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(IMAGE);
    await clickText(page, 'button', 'Upload & Extract');
    const loadingShown = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Extracting'));
      return btn !== undefined && btn.disabled;
    });
    check('loading state while OCR runs', loadingShown);
    // Real Gemini takes a few seconds
    await page.waitForFunction(() => document.body.innerText.includes('Extraction Results'), { timeout: 90000 });
    const uploadText = await pageText(page);
    check('OCR results rendered', uploadText.includes('Extraction Results'));
    check('medicines with dosage/frequency/duration/instructions',
      uploadText.includes('Amoxicillin') && uploadText.includes('Paracetamol')
      && uploadText.includes('Twice daily') && uploadText.includes('Every 8 hours')
      && uploadText.includes('5 days') && uploadText.includes('After food'));
    const doctorBlock = await page.evaluate(() => {
      const label = [...document.querySelectorAll('p')].find((p) => p.textContent.trim() === 'Doctor Name');
      return label && label.parentElement ? label.parentElement.innerText : '';
    });
    check('doctor name from extractedData.doctor_name', String(doctorBlock).includes('Dr. Asha'), String(doctorBlock).replace(/\n/g, ' | '));
    check('date from real OCR', uploadText.includes('2026-10-04'));
    check('diagnosis from real OCR', uploadText.includes('Bacterial throat infection'));
    check('success toast', uploadText.includes('Uploaded successfully'));

    // Prescription Vault -> MongoDB record
    await clickText(page, 'a', 'View Prescription Vault');
    await page.waitForFunction(() => location.pathname === '/prescriptions', { timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('Dr. Asha'), { timeout: 20000 });
    const vaultText = await pageText(page);
    check('vault shows the MongoDB prescription (doctor_name)', vaultText.includes('Dr. Asha'));
    check('vault shows medicines with dosage', vaultText.includes('Amoxicillin') && vaultText.includes('500 mg'));
    check('vault shows a valid upload date', !vaultText.includes('Invalid Date')
      && vaultText.includes(String(new Date().getFullYear())));
    check('vault keeps Upload New navigation', vaultText.includes('Upload New'));
    check('no mock data markers in vault', !vaultText.includes('Ramesh Kumar'));

    await page.close();
  } catch (err) {
    check(`unexpected error: ${err.message}`, false);
    console.error(err);
  } finally {
    await browser.close();
  }

  console.log(failures === 0 ? 'ALL REAL OCR FRONTEND E2E CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  console.log(`TEST_PATIENT_EMAIL=${email}`);
  process.exit(failures === 0 ? 0 : 1);
})();
