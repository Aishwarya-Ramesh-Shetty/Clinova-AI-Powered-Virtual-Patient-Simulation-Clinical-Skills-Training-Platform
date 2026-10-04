const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    dosage: { type: String, default: '' },
    frequency: { type: String, default: '' },
    duration: { type: String, default: '' },
    instructions: { type: String, default: '' }
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  originalFileName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  extractedData: {
    medicines: { type: [medicineSchema], default: [] },
    doctor_name: { type: String, default: '' },
    date: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    raw_text: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Prescription', prescriptionSchema);
