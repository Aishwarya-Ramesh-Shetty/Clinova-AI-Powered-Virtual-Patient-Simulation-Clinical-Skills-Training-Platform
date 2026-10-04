const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

const getDoctorSecret = () =>
  process.env.JWT_DOCTOR_SECRET || `${process.env.JWT_SECRET || 'clinova_jwt_secret_2026'}_doctor`;

const generateDoctorToken = (doctorId, email) =>
  jwt.sign(
    { doctorId, email, role: 'doctor' },
    getDoctorSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const fail = (res, message) => res.status(401).json({ success: false, data: null, message });

// Separate from the patient `protect` middleware: different secret and role claim,
// so a patient token can never authenticate as a doctor (and vice versa).
const protectDoctor = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return fail(res, 'Not authorized, no doctor token provided');
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], getDoctorSecret());
    if (decoded.role !== 'doctor' || !decoded.doctorId) {
      return fail(res, 'Not authorized, invalid doctor token');
    }
    const doctor = await Doctor.findById(decoded.doctorId);
    if (!doctor) return fail(res, 'Not authorized, doctor not found');
    req.doctor = doctor;
    return next();
  } catch (error) {
    return fail(res, 'Not authorized, doctor token failed');
  }
};

module.exports = { protectDoctor, generateDoctorToken };
