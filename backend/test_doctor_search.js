require('./src/config/env');

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const Doctor = require('./src/models/Doctor');
const { seedDemoDoctors } = require('./seeds/doctorSeed');

let server;
let testUser;

async function request(port, path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: response.status, body: await response.json() };
}

function logPass(message) {
  console.log(`  PASS: ${message}`);
}

async function run() {
  try {
    await connectDB();
    await Doctor.createIndexes();
    await seedDemoDoctors();
    testUser = await User.create({
      name: 'Synthetic Doctor Search Test',
      email: `doctor-search-${Date.now()}@clinova.test`,
      password: 'TemporaryTestPassword123!',
      gender: 'female',
      dateOfBirth: '1995-01-01'
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', resolve);
    });
    const token = jwt.sign(
      { userId: String(testUser._id) },
      process.env.JWT_SECRET || 'clinova_jwt_secret_2026'
    );
    const basePath = `/api/doctors/search?specialty=${encodeURIComponent('Cardiologist')}&lat=19.3934&lng=72.8264&radius=`;

    const unauthorized = await request(server.address().port, `${basePath}10`);
    assert.equal(unauthorized.status, 401);
    logPass('doctor search requires authentication');

    const tenKm = await request(server.address().port, `${basePath}10`, token);
    assert.equal(tenKm.status, 200);
    assert.equal(tenKm.body.success, true);
    assert.equal(tenKm.body.data.doctors.length, 3);
    assert.ok(tenKm.body.data.doctors.every((doctor) => doctor.specialty === 'Cardiology'));
    assert.deepEqual(tenKm.body.data.doctors[0].location.coordinates, [72.83, 19.39]);
    logPass('Cardiologist recommendation matches canonical Cardiology records within 10 km');

    const twentyFiveKm = await request(server.address().port, `${basePath}25`, token);
    assert.equal(twentyFiveKm.status, 200);
    assert.equal(twentyFiveKm.body.data.doctors.length, 3);
    logPass('radius expansion to 25 km returns the additional real database provider');

    const noMatches = await request(server.address().port, '/api/doctors/search?specialty=Cardiologist&lat=0&lng=0&radius=10', token);
    assert.equal(noMatches.status, 200);
    assert.equal(noMatches.body.data.doctors.length, 0);
    logPass('unrelated location returns no fabricated providers');

    const selectedDoctor = tenKm.body.data.doctors[0];
    const details = await request(server.address().port, `/api/doctors/${selectedDoctor.id}`, token);
    assert.equal(details.status, 200);
    assert.equal(details.body.data.doctor.id, selectedDoctor.id);
    assert.ok(details.body.data.doctor.clinicName);
    logPass('selected provider details resolve by the actual ID used by /book/:doctorId');

    const invalidCoordinates = await request(server.address().port, '/api/doctors/search?specialty=Cardiologist&lat=95&lng=74&radius=10', token);
    assert.equal(invalidCoordinates.status, 400);
    logPass('invalid coordinates are rejected');

    const seededCount = await Doctor.countDocuments({ isDemo: true });
    // Spec: at least 10 demo providers must exist in MongoDB (seed keeps expanding)
    assert.ok(seededCount >= 10, `expected at least 10 demo providers in MongoDB, found ${seededCount}`);
    const demoFlagged = await Doctor.countDocuments({ demoProvider: true });
    assert.equal(demoFlagged, seededCount, 'every demo provider must also have demoProvider=true');
    console.log(`  Demo providers available in database: ${seededCount}`);
    console.log('ALL DOCTOR SEARCH TESTS PASSED');
  } catch (error) {
    console.error('DOCTOR SEARCH TESTS FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    if (testUser) await User.deleteOne({ _id: testUser._id }).catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
  }
}

run();
