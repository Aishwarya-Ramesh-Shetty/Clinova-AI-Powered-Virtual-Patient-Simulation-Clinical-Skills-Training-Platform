const mongoose = require('mongoose');

const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
  // Optional: the saved clinical assessment this appointment came from (assessment exists independently)
  assessmentSession: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentSession', default: null },
  // 'YYYY-MM-DD' — same convention as Doctor.availableSlots[].date
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timeSlot: { type: String, required: true, trim: true },
  notes: { type: String, default: '', trim: true, maxlength: 1000 },
  status: { type: String, enum: APPOINTMENT_STATUSES, default: 'pending' },
  // true while the slot is held (anything except cancelled); used for the double-booking index
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

appointmentSchema.pre('validate', function () {
  this.isActive = this.status !== 'cancelled';
});

// A doctor's slot can only be held by one non-cancelled appointment
appointmentSchema.index(
  { doctor: 1, date: 1, timeSlot: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

appointmentSchema.statics.STATUSES = APPOINTMENT_STATUSES;

module.exports = mongoose.model('Appointment', appointmentSchema);
