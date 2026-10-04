const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const { sendResponse } = require('../utils/helpers');

function normalizeSpecialty(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/ologists?$/.test(word)) return word.replace(/ologists?$/, 'ology');
      if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
      if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
      return word;
    })
    .join(' ');
}

function mapSpecialtyForSearch(aiSpecialty) {
  const specialtyLower = String(aiSpecialty || '').trim().toLowerCase();
  const specialtyMap = {
    'cardiology': 'Cardiology',
    'dermatology': 'Dermatology',
    'neurology': 'Neurology',
    'orthopedics': 'Orthopedics',
    'ent': 'ENT',
    'gynecology': 'Gynecology',
    'pediatrics': 'Pediatrics',
    'doctor': 'General Physician',
    'clinic': 'General Physician',
    'hospital': 'General Physician',
  };

  if (specialtyMap[specialtyLower]) {
    return specialtyMap[specialtyLower];
  }

  if (/cardologist/i.test(aiSpecialty)) return 'Cardiology';
  if (/dermatolog/i.test(aiSpecialty)) return 'Dermatology';
  if (/neurolog/i.test(aiSpecialty)) return 'Neurology';
  if (/orthoped/i.test(aiSpecialty)) return 'Orthopedics';
  if (/general physician/i.test(aiSpecialty)) return 'General Physician';

  return String(aiSpecialty || '').trim();
}

function serializeDoctor(doctor) {
  return {
    id: String(doctor._id),
    name: doctor.name,
    specialty: doctor.specialty,
    clinicName: doctor.clinicName,
    hospitalName: doctor.hospitalName,
    address: doctor.address || '',
    rating: doctor.rating,
    experience: doctor.experience,
    consultationFee: doctor.consultationFee,
    location: doctor.location,
    availableSlots: doctor.availableSlots,
    isDemo: doctor.isDemo,
    demoProvider: doctor.demoProvider === true || doctor.isDemo === true
  };
}

// Demo providers are fictional local records — never expose credentials, and leave out
// rating/fee so the UI cannot present invented real-world claims.
function serializeDemoDoctor(doctor) {
  return {
    id: String(doctor._id),
    name: doctor.name,
    specialty: doctor.specialty,
    clinicName: doctor.clinicName,
    hospitalName: doctor.hospitalName,
    address: doctor.address || '',
    experience: doctor.experience,
    location: doctor.location,
    availableSlots: doctor.availableSlots,
    isDemo: true,
    demoProvider: true
  };
}

exports.searchDoctors = async (req, res, next) => {
  try {
    const aiSpecialty = String(req.query.specialty || '').trim();
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const radiusKm = req.query.radius === undefined ? 10 : Number(req.query.radius);

    if (!aiSpecialty) {
      return res.status(400).json({ success: false, data: null, message: 'specialty is required.' });
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, data: null, message: 'Valid lat and lng coordinates are required.' });
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      return res.status(400).json({ success: false, data: null, message: 'radius must be between 0 and 50 km.' });
    }

    const searchSpecialty = mapSpecialtyForSearch(aiSpecialty);
    const targetSpecialty = normalizeSpecialty(searchSpecialty);

    const nearbyDoctors = await Doctor.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: radiusKm * 1000
        }
      }
    }).lean();

    const doctors = nearbyDoctors
      .filter((doctor) => normalizeSpecialty(doctor.specialty) === targetSpecialty)
      .map(serializeDoctor);

    return sendResponse(res, 200, { doctors, radiusKm, searchSpecialty }, 'Nearby doctors retrieved');
  } catch (error) {
    return next(error);
  }
};

// GET /api/doctors/demo — ALL demo providers, with NO dependence on geolocation,
// specialty, or any third-party service. This is what powers the always-visible
// DEMO PROVIDERS section on Doctor Discovery.
exports.getDemoDoctors = async (req, res, next) => {
  try {
    const doctors = await Doctor.find({ $or: [{ demoProvider: true }, { isDemo: true }] })
      .sort({ name: 1 })
      .lean();
    return sendResponse(
      res,
      200,
      { doctors: doctors.map(serializeDemoDoctor), count: doctors.length },
      'Demo providers retrieved'
    );
  } catch (error) {
    return next(error);
  }
};

exports.getDoctorById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.doctorId)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid doctor ID.' });
    }

    const doctor = await Doctor.findById(req.params.doctorId).lean();
    if (!doctor) {
      return res.status(404).json({ success: false, data: null, message: 'Doctor not found.' });
    }

    return sendResponse(res, 200, { doctor: serializeDoctor(doctor) }, 'Doctor retrieved');
  } catch (error) {
    return next(error);
  }
};