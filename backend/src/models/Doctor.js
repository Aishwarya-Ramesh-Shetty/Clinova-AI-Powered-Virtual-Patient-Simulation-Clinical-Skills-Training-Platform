const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  specialty: { type: String, required: true, trim: true },
  clinicName: { type: String, required: true, trim: true },
  hospitalName: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  experience: { type: Number, default: 0, min: 0 },
  consultationFee: { type: Number, default: 0, min: 0 },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coordinates) => coordinates.length === 2
          && coordinates[0] >= -180 && coordinates[0] <= 180
          && coordinates[1] >= -90 && coordinates[1] <= 90,
        message: 'Location coordinates must be [longitude, latitude].'
      }
    }
  },
  availableSlots: {
    type: [{ date: String, times: [String] }],
    default: []
  },
  isDemo: { type: Boolean, default: false },
  // Fictional demo provider (local MongoDB) — never presented as a real doctor
  demoProvider: { type: Boolean, default: false },
  // Doctor-portal credentials (demo doctors only use fictional demo accounts)
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  password: { type: String, select: false }
}, { timestamps: true });

doctorSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Doctor', doctorSchema);