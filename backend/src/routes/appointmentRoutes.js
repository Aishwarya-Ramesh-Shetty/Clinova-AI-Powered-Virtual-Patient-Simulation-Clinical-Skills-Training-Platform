const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  createAppointment,
  getMyAppointments,
  getBookedSlots,
  cancelMyAppointment,
  getAppointmentSummary
} = require('../controllers/appointmentController');

const router = express.Router();

router.post('/', protect, createAppointment);
router.get('/', protect, getMyAppointments);
router.get('/booked', protect, getBookedSlots);
router.get('/:id/summary', protect, getAppointmentSummary);
router.patch('/:id/cancel', protect, cancelMyAppointment);

module.exports = router;
