const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const AssessmentSession = require('../models/AssessmentSession');
const { sendResponse } = require('../utils/helpers');

const todayString = () => new Date().toISOString().split('T')[0];

const serializeForPatient = (a) => ({
  id: String(a._id),
  assessmentSessionId: a.assessmentSession ? String(a.assessmentSession) : null,
  date: a.date,
  timeSlot: a.timeSlot,
  notes: a.notes,
  status: a.status,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  doctor: a.doctor && a.doctor.name ? {
    id: String(a.doctor._id),
    name: a.doctor.name,
    specialty: a.doctor.specialty,
    clinicName: a.doctor.clinicName,
    consultationFee: a.doctor.consultationFee
  } : { id: String(a.doctor), name: 'Unknown doctor', specialty: '' }
});

const serializeForDoctor = (a) => ({
  id: String(a._id),
  date: a.date,
  timeSlot: a.timeSlot,
  notes: a.notes,
  status: a.status,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  patient: a.patient && a.patient.name ? {
    id: String(a.patient._id),
    name: a.patient.name,
    email: a.patient.email,
    phone: a.patient.phone || ''
  } : { id: String(a.patient), name: 'Unknown patient' }
});

// ───────── Patient side ─────────

// POST /api/appointments
exports.createAppointment = async (req, res, next) => {
  try {
    const { doctorId, date, timeSlot } = req.body;
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, data: null, message: 'A valid doctorId is required.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      return res.status(400).json({ success: false, data: null, message: 'date must be in YYYY-MM-DD format.' });
    }
    if (!timeSlot || typeof timeSlot !== 'string') {
      return res.status(400).json({ success: false, data: null, message: 'timeSlot is required.' });
    }
    if (date < todayString()) {
      return res.status(400).json({ success: false, data: null, message: 'Cannot book an appointment in the past.' });
    }

    const doctor = await Doctor.findById(doctorId).lean();
    if (!doctor) {
      return res.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
    }

    const daySlots = (doctor.availableSlots || []).find((s) => s.date === date);
    if (!daySlots || !(daySlots.times || []).includes(timeSlot)) {
      return res.status(400).json({ success: false, data: null, message: 'That date/time is not available for this doctor.' });
    }

    let assessmentSession = null;
    if (req.body.assessmentSessionId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.assessmentSessionId)) {
        return res.status(400).json({ success: false, data: null, message: 'Invalid assessmentSessionId.' });
      }
      const owned = await AssessmentSession.findOne({
        _id: req.body.assessmentSessionId,
        patientId: req.user._id,
        status: 'completed'
      }).select('_id').lean();
      if (!owned) {
        return res.status(404).json({ success: false, data: null, message: 'Assessment not found.' });
      }
      assessmentSession = owned._id;
    }

    let appointment;
    try {
      appointment = await Appointment.create({
        patient: req.user._id,
        doctor: doctor._id,
        assessmentSession,
        date,
        timeSlot,
        notes
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ success: false, data: null, message: 'This time slot has just been booked. Please choose another.' });
      }
      throw error;
    }

    appointment.doctor = doctor;
    return sendResponse(res, 201, { appointment: serializeForPatient(appointment) }, 'Appointment booked');
  } catch (error) {
    return next(error);
  }
};

// GET /api/appointments  (only the authenticated patient's appointments)
exports.getMyAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ patient: req.user._id })
      .populate('doctor', 'name specialty clinicName consultationFee')
      .sort({ date: 1, timeSlot: 1 })
      .lean();
    return sendResponse(res, 200, { appointments: appointments.map(serializeForPatient) }, 'Appointments retrieved');
  } catch (error) {
    return next(error);
  }
};

// GET /api/appointments/:id/summary  → the saved assessment linked to this appointment (or null)
exports.getAppointmentSummary = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid appointment ID.' });
    }
    const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.user._id })
      .populate('doctor', 'name specialty clinicName consultationFee')
      .lean();
    if (!appointment) {
      return res.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
    }

    let session = null;
    if (appointment.assessmentSession) {
      const s = await AssessmentSession.findOne({
        _id: appointment.assessmentSession,
        patientId: req.user._id
      }).lean();
      if (s) {
        session = {
          id: String(s._id),
          initialSymptoms: s.initialSymptoms,
          questions: (s.intakeQuestions || []).map(({ questionId, question, answer }) => ({ questionId, question, answer })),
          structuredSymptoms: s.structuredSymptoms,
          clinicalAssessment: s.clinicalAssessment,
          status: s.status,
          createdAt: s.createdAt,
          completedAt: s.completedAt
        };
      }
    }

    return sendResponse(res, 200, { appointment: serializeForPatient(appointment), session }, 'Appointment summary retrieved');
  } catch (error) {
    return next(error);
  }
};

// GET /api/appointments/booked?doctorId=...&date=YYYY-MM-DD  (slots already taken, no patient info)
exports.getBookedSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, data: null, message: 'A valid doctorId is required.' });
    }
    const filter = { doctor: doctorId, isActive: true };
    if (date) filter.date = String(date);
    const rows = await Appointment.find(filter).select('date timeSlot -_id').lean();
    return sendResponse(res, 200, { booked: rows }, 'Booked slots retrieved');
  } catch (error) {
    return next(error);
  }
};

// PATCH /api/appointments/:id/cancel
exports.cancelMyAppointment = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid appointment ID.' });
    }
    const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.user._id });
    if (!appointment) {
      return res.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
    }
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({ success: false, data: null, message: `Cannot cancel a ${appointment.status} appointment.` });
    }
    appointment.status = 'cancelled';
    await appointment.save();
    await appointment.populate('doctor', 'name specialty clinicName consultationFee');
    return sendResponse(res, 200, { appointment: serializeForPatient(appointment) }, 'Appointment cancelled');
  } catch (error) {
    return next(error);
  }
};

// ───────── Doctor side ─────────

// GET /api/doctor-auth/appointments  (only the logged-in doctor's appointments)
exports.getDoctorAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ doctor: req.doctor._id })
      .populate('patient', 'name email phone')
      .sort({ date: 1, timeSlot: 1 })
      .lean();
    return sendResponse(res, 200, { appointments: appointments.map(serializeForDoctor) }, 'Doctor appointments retrieved');
  } catch (error) {
    return next(error);
  }
};

const DOCTOR_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

// PATCH /api/doctor-auth/appointments/:id/status
exports.updateDoctorAppointmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!Appointment.STATUSES.includes(status)) {
      return res.status(400).json({ success: false, data: null, message: `status must be one of: ${Appointment.STATUSES.join(', ')}` });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid appointment ID.' });
    }
    const appointment = await Appointment.findOne({ _id: req.params.id, doctor: req.doctor._id });
    if (!appointment) {
      return res.status(404).json({ success: false, data: null, message: 'Appointment not found.' });
    }
    if (!DOCTOR_TRANSITIONS[appointment.status].includes(status)) {
      return res.status(400).json({ success: false, data: null, message: `Cannot change status from ${appointment.status} to ${status}.` });
    }
    appointment.status = status;
    await appointment.save();
    await appointment.populate('patient', 'name email phone');
    return sendResponse(res, 200, { appointment: serializeForDoctor(appointment) }, 'Appointment status updated');
  } catch (error) {
    return next(error);
  }
};
