const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    chiefComplaint: { type: String, default: '' },
    symptoms: { type: Array, default: [] },
    assessment: { type: String, default: '' },
    recommendedSpecialist: { type: String, default: '' },
    summaryText: { type: String, default: '' },
    additionalNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Summary', summarySchema);
