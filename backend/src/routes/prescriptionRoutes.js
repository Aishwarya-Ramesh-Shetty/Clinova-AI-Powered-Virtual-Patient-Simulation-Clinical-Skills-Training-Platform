const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  uploadPrescriptionImage,
  createPrescription,
  getPrescriptions,
  getPrescriptionById
} = require('../controllers/prescriptionController');

const router = express.Router();

// Upload + extract a prescription image (multipart/form-data, field name: `prescription`)
router.post('/', protect, uploadPrescriptionImage, createPrescription);
// List the authenticated patient's prescriptions (newest first)
router.get('/', protect, getPrescriptions);
// Single prescription — owner only (404 otherwise)
router.get('/:id', protect, getPrescriptionById);

module.exports = router;
