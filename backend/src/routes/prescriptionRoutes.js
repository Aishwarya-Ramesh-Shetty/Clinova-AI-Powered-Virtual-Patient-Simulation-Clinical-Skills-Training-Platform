const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  uploadPrescriptionImage,
  createPrescription,
  getPrescriptions,
  getPrescriptionById
} = require('../controllers/prescriptionController');

const router = express.Router();

// Both paths accepted — frontend calls /upload, field name: 'prescription'
router.post('/', protect, uploadPrescriptionImage, createPrescription);
router.post('/upload', protect, uploadPrescriptionImage, createPrescription);
router.get('/', protect, getPrescriptions);
router.get('/:id', protect, getPrescriptionById);

module.exports = router;
