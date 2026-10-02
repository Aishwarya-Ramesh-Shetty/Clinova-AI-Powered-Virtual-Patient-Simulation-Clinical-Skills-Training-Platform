const mongoose = require('mongoose');

const intakeQuestionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  question:   { type: String, required: true },
  answer:     { type: String, default: null },
  answeredAt: { type: Date,   default: null }
}, { _id: false });

const assessmentSessionSchema = new mongoose.Schema({
  patientId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true
  },
  initialSymptoms: {
    type:     String,
    required: true,
    trim:     true
  },
  language: {
    type:    String,
    default: 'en',
    trim:    true
  },
  intakeQuestions: {
    type:    [intakeQuestionSchema],
    default: []
  },
  structuredSymptoms: {
    type:    mongoose.Schema.Types.Mixed,
    default: null
  },
  status: {
    type:    String,
    enum:    ['intake', 'ready_for_assessment', 'assessing', 'completed', 'failed'],
    default: 'intake'
  },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
});

// Auto-update updatedAt on every save
assessmentSessionSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('AssessmentSession', assessmentSessionSchema);
