const http = require('http');
require('./src/config/env');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const User = require('./src/models/User');

const testEmail = `testuser_${Date.now()}@clinova.com`;
const testPassword = 'Password123!';
let userToken = '';

async function runTests() {
  console.log('--- STARTING PHASE 2 AUTHENTICATION TEST SUITE ---');
  
  // 1. Connect DB and start test server on port 5001
  await connectDB();
  const PORT = 5001;
  const server = app.listen(PORT);
  console.log(`[Test Setup] Test server running on http://localhost:${PORT}`);

  const baseUrl = `http://localhost:${PORT}/api/auth`;

  try {
    // TEST A: Register a new user
    console.log('\n[Test A] POST /api/auth/register...');
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Clinova User',
        email: testEmail,
        password: testPassword,
        gender: 'female',
        phone: '+91 9876543210'
      })
    });
    const regData = await regRes.json();
    console.log('Status:', regRes.status);
    console.log('Response:', JSON.stringify(regData, null, 2));

    if (regRes.status !== 201 || !regData.success || !regData.data.token) {
      throw new Error('Test A Failed');
    }
    userToken = regData.data.token;
    if (regData.data.user.password || (regData.data.password)) {
      throw new Error('Test A Failed: Password exposed in registration response!');
    }
    console.log('-> Test A PASSED');

    // TEST B: Duplicate registration
    console.log('\n[Test B] Attempting duplicate registration with same email...');
    const dupRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate User',
        email: testEmail,
        password: testPassword
      })
    });
    const dupData = await dupRes.json();
    console.log('Status:', dupRes.status);
    console.log('Response:', JSON.stringify(dupData, null, 2));
    if (dupRes.status !== 400 || dupData.success !== false) {
      throw new Error('Test B Failed: Duplicate registration was not rejected!');
    }
    console.log('-> Test B PASSED');

    // TEST C: Login with correct credentials
    console.log('\n[Test C] POST /api/auth/login with correct credentials...');
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    const loginData = await loginRes.json();
    console.log('Status:', loginRes.status);
    console.log('Response:', JSON.stringify(loginData, null, 2));
    if (loginRes.status !== 200 || !loginData.success || !loginData.data.token) {
      throw new Error('Test C Failed');
    }
    if (loginData.data.user.password || loginData.data.password) {
      throw new Error('Test C Failed: Password exposed in login response!');
    }
    console.log('-> Test C PASSED');

    // TEST D: Login with incorrect password
    console.log('\n[Test D] POST /api/auth/login with incorrect password...');
    const wrongLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword!'
      })
    });
    const wrongLoginData = await wrongLoginRes.json();
    console.log('Status:', wrongLoginRes.status);
    console.log('Response:', JSON.stringify(wrongLoginData, null, 2));
    if (wrongLoginRes.status !== 401 || wrongLoginData.success !== false) {
      throw new Error('Test D Failed: Invalid login password was accepted!');
    }
    console.log('-> Test D PASSED');

    // TEST E: GET /api/auth/me with valid Bearer token
    console.log('\n[Test E] GET /api/auth/me with Bearer token...');
    const meRes = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    const meData = await meRes.json();
    console.log('Status:', meRes.status);
    console.log('Response:', JSON.stringify(meData, null, 2));
    if (meRes.status !== 200 || !meData.success || !meData.data.user) {
      throw new Error('Test E Failed');
    }
    if (meData.data.user.password) {
      throw new Error('Test E Failed: Password exposed in /me response!');
    }
    console.log('-> Test E PASSED');

    // TEST F: GET /api/auth/me without token
    console.log('\n[Test F] GET /api/auth/me without token...');
    const noTokenRes = await fetch(`${baseUrl}/me`, { method: 'GET' });
    const noTokenData = await noTokenRes.json();
    console.log('Status:', noTokenRes.status);
    console.log('Response:', JSON.stringify(noTokenData, null, 2));
    if (noTokenRes.status !== 401 || noTokenData.success !== false) {
      throw new Error('Test F Failed: Protected route allowed access without token!');
    }
    console.log('-> Test F PASSED');

    // TEST G: GET /api/auth/me with invalid token
    console.log('\n[Test G] GET /api/auth/me with invalid token...');
    const invalidTokenRes = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid_token_12345' }
    });
    const invalidTokenData = await invalidTokenRes.json();
    console.log('Status:', invalidTokenRes.status);
    console.log('Response:', JSON.stringify(invalidTokenData, null, 2));
    if (invalidTokenRes.status !== 401 || invalidTokenData.success !== false) {
      throw new Error('Test G Failed: Protected route accepted invalid token!');
    }
    console.log('-> Test G PASSED');

    // TEST H: Health Check endpoint
    console.log('\n[Test H] GET /api/health...');
    const healthRes = await fetch(`http://localhost:${PORT}/api/health`);
    const healthData = await healthRes.json();
    console.log('Status:', healthRes.status);
    console.log('Response:', JSON.stringify(healthData, null, 2));
    if (healthRes.status !== 200 || !healthData.success) {
      throw new Error('Test H Failed: Health endpoint failed!');
    }
    console.log('-> Test H PASSED');

    // VERIFY MONGODB PASSWORD HASHING
    console.log('\n[DB Verification] Checking stored user password in MongoDB...');
    const dbUser = await User.findOne({ email: testEmail });
    console.log('Raw DB Stored Password Hash:', dbUser.password);
    if (!dbUser.password.startsWith('$2a$') && !dbUser.password.startsWith('$2b$')) {
      throw new Error('DB Verification Failed: Password is not hashed with bcrypt!');
    }
    console.log('-> DB Password Hash Verification PASSED');

    console.log('\n=============================================');
    console.log('ALL PHASE 2 AUTHENTICATION TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================');
  } catch (err) {
    console.error('\nTEST SUITE FAILED:', err.message);
  } finally {
    // Clean up created test user and close server
    await User.deleteOne({ email: testEmail });
    server.close();
    process.exit(0);
  }
}

runTests();
