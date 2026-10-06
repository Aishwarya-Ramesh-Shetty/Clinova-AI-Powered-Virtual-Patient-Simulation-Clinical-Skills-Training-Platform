const express = require('express');
const { protectDoctor } = require('../middleware/doctorAuthMiddleware');
const { getDoctorAppointments, updateDoctorAppointmentStatus } = require('../controllers/appointmentController');
const Prescription = require('../models/Prescription');
const { sendResponse } = require('../utils/helpers');

const router = express.Router();

// GET /api/doctor-portal/appointments
router.get('/appointments', protectDoctor, getDoctorAppointments);

// PATCH /api/doctor-portal/appointments/:id/status
router.patch('/appointments/:id/status', protectDoctor, updateDoctorAppointmentStatus);

// GET /api/doctor-portal/patients/:patientId/history
router.get('/patients/:patientId/history', protectDoctor, async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const prescriptions = await Prescription.find({ patientId })
      .sort({ createdAt: -1 })
      .lean();

    const history = prescriptions.map((p) => ({
      id: String(p._id),
      originalFileName: p.originalFileName || '',
      extractedData: p.extractedData || {},
      uploadedAt: p.createdAt,
    }));

    return sendResponse(res, 200, { prescriptions: history, patientId }, 'Patient history retrieved');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
