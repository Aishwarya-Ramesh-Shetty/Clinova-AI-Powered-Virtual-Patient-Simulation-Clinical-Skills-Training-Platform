const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getDemoDoctors, getDoctorById, searchDoctors } = require('../controllers/doctorController');

const router = express.Router();

router.get('/search', protect, searchDoctors);
// Must be registered before '/:doctorId' so 'demo' is not treated as an id
router.get('/demo', protect, getDemoDoctors);
router.get('/:doctorId', protect, getDoctorById);

module.exports = router;