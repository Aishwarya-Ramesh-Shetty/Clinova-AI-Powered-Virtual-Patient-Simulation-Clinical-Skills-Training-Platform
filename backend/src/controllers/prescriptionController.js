const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const Prescription = require('../models/Prescription');
const { sendResponse } = require('../utils/helpers');

// Only these image types are accepted for OCR extraction
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Images are kept in memory only — nothing is written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    const error = new Error('Unsupported file type. Only image/jpeg, image/png and image/webp are allowed.');
    return cb(error);
  }
});

// Multer middleware wrapper: every upload-shape problem (missing/oversized file,
// unexpected field, unsupported MIME type) is a client error -> 400
const uploadPrescriptionImage = (req, res, next) => {
  upload.single('prescription')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        data: null,
        message: err.message || 'Invalid prescription upload.'
      });
    }
    return next();
  });
};

const aiExtractUrl = () => {
  const base = String(process.env.AI_SERVICE_URL || 'http://localhost:8000');
  return `${base.endsWith('/') ? base.slice(0, -1) : base}/extract-prescription`;
};

// Response shape used everywhere in this controller: string `id` (project
// convention, matches the other endpoints) plus the stored fields only
const serializePrescription = (prescription) => ({
  id: String(prescription._id),
  patientId: String(prescription.patientId),
  originalFileName: prescription.originalFileName || '',
  mimeType: prescription.mimeType || '',
  extractedData: prescription.extractedData || {
    medicines: [],
    doctor_name: '',
    date: '',
    diagnosis: '',
    raw_text: ''
  },
  createdAt: prescription.createdAt
});

// POST /api/prescriptions — multipart/form-data, field name `prescription`
exports.createPrescription = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'No prescription image uploaded. Use multipart/form-data with the field name "prescription".'
      });
    }

    // Forward the image bytes to the FastAPI AI service as multipart (its
    // /extract-prescription endpoint expects an UploadFile part named `file`).
    // The original content type of the image travels with the part.
    const form = new FormData();
    form.append(
      'file',
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname || 'prescription'
    );

    let extracted;
    try {
      const aiResponse = await axios.post(aiExtractUrl(), form, {
        timeout: 60000,
        maxBodyLength: 10 * 1024 * 1024,
        maxContentLength: 10 * 1024 * 1024
        // Content-Type (multipart/form-data; boundary=...) is set automatically
        // from the FormData so FastAPI can parse the upload correctly
      });
      extracted = aiResponse.data;
    } catch (aiError) {
      const reason = aiError.response
        ? `AI service responded with status ${aiError.response.status}.`
        : 'AI service is unavailable. Please try again later.';
      console.error('Prescription AI extraction failed:', aiError.message);
      return res.status(502).json({ success: false, data: null, message: reason });
    }

    // Invalid or non-JSON AI response -> 502
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)
      || extracted.error || !Array.isArray(extracted.medicines)) {
      return res.status(502).json({
        success: false,
        data: null,
        message: 'AI service returned an invalid response. Please try again later.'
      });
    }

    const prescription = await Prescription.create({
      patientId: req.user._id,
      originalFileName: req.file.originalname || '',
      mimeType: req.file.mimetype,
      extractedData: {
        medicines: extracted.medicines.map((medicine) => ({
          name: (medicine && medicine.name) || '',
          dosage: (medicine && medicine.dosage) || '',
          frequency: (medicine && medicine.frequency) || '',
          duration: (medicine && medicine.duration) || '',
          instructions: (medicine && medicine.instructions) || ''
        })),
        doctor_name: extracted.doctor_name || '',
        date: extracted.date || '',
        diagnosis: extracted.diagnosis || '',
        raw_text: extracted.raw_text || ''
      }
    });

    return sendResponse(res, 201, { prescription: serializePrescription(prescription) }, 'Prescription extracted and saved successfully');
  } catch (error) {
    return next(error);
  }
};

// GET /api/prescriptions — only the authenticated patient's records, newest first
exports.getPrescriptions = async (req, res, next) => {
  try {
    const prescriptions = await Prescription.find({ patientId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return sendResponse(
      res,
      200,
      { prescriptions: prescriptions.map(serializePrescription) },
      'Prescriptions fetched successfully'
    );
  } catch (error) {
    return next(error);
  }
};

// GET /api/prescriptions/:id — owner only; 404 for missing OR another patient's record
exports.getPrescriptionById = async (req, res, next) => {
  try {
    const id = req.params.id;
    const validId = mongoose.Types.ObjectId.isValid(id);
    const prescription = validId
      ? await Prescription.findOne({ _id: id, patientId: req.user._id }).lean()
      : null;
    if (!prescription) {
      return res.status(404).json({ success: false, data: null, message: 'Prescription not found.' });
    }
    return sendResponse(res, 200, { prescription: serializePrescription(prescription) }, 'Prescription fetched successfully');
  } catch (error) {
    return next(error);
  }
};

exports.uploadPrescriptionImage = uploadPrescriptionImage;
