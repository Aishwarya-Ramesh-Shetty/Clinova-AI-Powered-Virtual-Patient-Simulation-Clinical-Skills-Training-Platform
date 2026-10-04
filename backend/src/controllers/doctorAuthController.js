const bcrypt = require('bcryptjs');
const Doctor = require('../models/Doctor');
const { generateDoctorToken } = require('../middleware/doctorAuthMiddleware');
const { sendResponse } = require('../utils/helpers');

const serializeDoctorProfile = (doctor) => ({
  id: String(doctor._id),
  name: doctor.name,
  email: doctor.email,
  specialty: doctor.specialty,
  clinicName: doctor.clinicName
});

// POST /api/doctor-auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, data: null, message: 'Email and password are required' });
    }

    const doctor = await Doctor.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    const valid = doctor && doctor.password && await bcrypt.compare(password, doctor.password);
    if (!valid) {
      return res.status(401).json({ success: false, data: null, message: 'Invalid credentials' });
    }

    return sendResponse(res, 200, {
      token: generateDoctorToken(doctor._id, doctor.email),
      doctor: serializeDoctorProfile(doctor)
    }, 'Doctor login successful');
  } catch (error) {
    return next(error);
  }
};

// GET /api/doctor-auth/me
exports.getMe = async (req, res, next) => {
  try {
    return sendResponse(res, 200, { doctor: serializeDoctorProfile(req.doctor) }, 'Doctor profile retrieved');
  } catch (error) {
    return next(error);
  }
};
