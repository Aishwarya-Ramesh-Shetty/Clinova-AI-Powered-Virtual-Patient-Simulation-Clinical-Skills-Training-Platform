const express = require('express');
const { protectDoctor } = require('../middleware/doctorAuthMiddleware');
const { login, getMe } = require('../controllers/doctorAuthController');
const {
  getDoctorAppointments,
  updateDoctorAppointmentStatus
} = require('../controllers/appointmentController');

const router = express.Router();

router.post('/login', login);
router.get('/me', protectDoctor, getMe);
router.get('/appointments', protectDoctor, getDoctorAppointments);
router.patch('/appointments/:id/status', protectDoctor, updateDoctorAppointmentStatus);

module.exports = router;
