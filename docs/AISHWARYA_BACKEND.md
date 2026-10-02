# Aishwarya's Backend Implementation Guide

This guide provides a comprehensive, step-by-step implementation plan for the **Backend Module** (Node.js + Express + MongoDB). You will be working exclusively in the `backend/` folder on branch `aishwarya/backend`.

---

## 1. Getting Started

### Project Scaffolding
Run the following commands to set up the backend directory, initialize the project, and install all required dependencies:

```bash
mkdir backend
cd backend
npm init -y

# Install main dependencies
npm install express mongoose bcryptjs jsonwebtoken cors dotenv multer axios morgan

# Install development dependencies
npm install -D nodemon
```

### Folder Structure
Create the following folder structure inside the `backend/` directory:

```
backend/
├── .env
├── .env.example
├── package.json
├── server.js
├── seeds/
│   └── doctorSeed.js
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── db.js
│   │   └── env.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── doctorController.js
│   │   ├── appointmentController.js
│   │   ├── prescriptionController.js
│   │   └── summaryController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── errorHandler.js
│   │   └── upload.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Doctor.js
│   │   ├── Appointment.js
│   │   ├── ConsultationSummary.js
│   │   └── Prescription.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── doctorRoutes.js
│   │   ├── appointmentRoutes.js
│   │   ├── aiProxyRoutes.js
│   │   ├── prescriptionRoutes.js
│   │   └── summaryRoutes.js
│   └── utils/
│       └── helpers.js
└── uploads/
    └── .gitkeep
```
*(Don't forget to create `uploads/.gitkeep` so the uploads folder is tracked by git).*

### `.env.example`
Create a `.env.example` file (and copy its contents to `.env` for your local environment):

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/clinova
JWT_SECRET=clinova_jwt_secret_2026
JWT_EXPIRES_IN=7d
AI_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
```

### `package.json` Scripts
Update the `scripts` section in `package.json`:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js",
  "seed": "node seeds/doctorSeed.js"
}
```

---

## 2. File-by-File Implementation Guide

### `backend/server.js`
**Purpose:** Entry point for the application. Starts the server and connects to DB.
```javascript
const app = require('./src/app');
const connectDB = require('./src/config/db');
require('./src/config/env');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
```

### `backend/src/app.js`
**Purpose:** Express app setup, middlewares, and route mounting.
```javascript
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('./config/env');

const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const aiProxyRoutes = require('./routes/aiProxyRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const summaryRoutes = require('./routes/summaryRoutes');
const { protect } = require('./middleware/authMiddleware');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

// Routes Mounting
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', protect, appointmentRoutes);
app.use('/api/symptoms', protect, aiProxyRoutes);
app.use('/api/summary', protect, summaryRoutes);
app.use('/api/prescriptions', protect, prescriptionRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
```

### `backend/src/config/db.js`
**Purpose:** MongoDB connection logic.
```javascript
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
```

### `backend/src/config/env.js`
**Purpose:** Load environment variables.
```javascript
const dotenv = require('dotenv');
dotenv.config();
```

### `backend/src/utils/helpers.js`
**Purpose:** Helper functions like standardizing responses and converting snake_case to camelCase.
```javascript
const sendResponse = (res, statusCode, data, message = '') => {
  res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    data: data || null,
    message
  });
};

const snakeToCamel = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamel(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/([-_][a-z])/ig, ($1) => {
        return $1.toUpperCase().replace('-', '').replace('_', '');
      });
      result[camelKey] = snakeToCamel(obj[key]);
      return result;
    }, {});
  }
  return obj;
};

module.exports = { sendResponse, snakeToCamel };
```

### `backend/src/middleware/errorHandler.js`
**Purpose:** Global error handler ensuring standard `{success, data, message}` response.
```javascript
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    data: null,
    message: err.message || 'Server Error'
  });
};

module.exports = errorHandler;
```

### `backend/src/middleware/authMiddleware.js`
**Purpose:** Verify JWT tokens and protect routes.
```javascript
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId).select('-password');
      next();
    } catch (error) {
      res.status(401).json({ success: false, data: null, message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ success: false, data: null, message: 'Not authorized, no token' });
  }
};

module.exports = { protect };
```

### `backend/src/middleware/upload.js`
**Purpose:** Multer configuration for file uploads.
```javascript
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, 'uploads/'); },
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const checkFileType = (file, cb) => {
  const filetypes = /jpeg|jpg|png|pdf/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb('Images and PDFs only!');
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) { checkFileType(file, cb); }
});

module.exports = upload;
```

### Database Models (`backend/src/models/`)

#### `User.js`
```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phone: { type: String },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  address: { type: String },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

#### `Doctor.js`
```javascript
const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialty: { type: String, required: true },
  experience: { type: Number },
  consultationFee: { type: Number },
  rating: { type: Number, default: 0 },
  clinicName: { type: String },
  clinicAddress: { type: String },
  phone: { type: String },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' } // [lng, lat]
  },
  availableSlots: [{
    day: { type: String },
    times: [{ type: String }]
  }],
  about: { type: String },
  imageUrl: { type: String, default: '/images/default-doctor.png' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Doctor', doctorSchema);
```

#### `Appointment.js`
```javascript
const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  date: { type: Date, required: true },
  timeSlot: { type: String, required: true },
  status: { type: String, enum: ['booked', 'cancelled', 'completed'], default: 'booked' },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appointment', appointmentSchema);
```

#### `ConsultationSummary.js`
```javascript
const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chiefComplaint: { type: String },
  symptoms: [{
    name: { type: String },
    duration: { type: String },
    severity: { type: String }
  }],
  assessment: { type: String },
  recommendedSpecialist: { type: String },
  additionalNotes: { type: String },
  summaryText: { type: String },
  generatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ConsultationSummary', summarySchema);
```

#### `Prescription.js`
```javascript
const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  originalFileUrl: { type: String, required: true },
  extractedData: {
    medicines: [{
      name: { type: String },
      dosage: { type: String },
      frequency: { type: String },
      duration: { type: String },
      instructions: { type: String }
    }],
    doctorName: { type: String },
    date: { type: String },
    diagnosis: { type: String },
    rawText: { type: String }
  },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Prescription', prescriptionSchema);
```

### Controllers and Routes

#### Auth (`src/controllers/authController.js` & `src/routes/authRoutes.js`)
**Controller:**
```javascript
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendResponse } = require('../utils/helpers');

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, dateOfBirth, gender } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ success: false, data: null, message: 'User already exists' });
    
    const user = await User.create({ name, email, password, phone, dateOfBirth, gender });
    const token = generateToken(user._id, user.email);
    
    sendResponse(res, 201, { token, user: { id: user._id, name: user.name, email: user.email } }, 'Registration successful');
  } catch (error) { next(error); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && (await user.comparePassword(password))) {
      const token = generateToken(user._id, user.email);
      sendResponse(res, 200, { token, user: { id: user._id, name: user.name, email: user.email } }, 'Login successful');
    } else {
      res.status(401).json({ success: false, data: null, message: 'Invalid credentials' });
    }
  } catch (error) { next(error); }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    sendResponse(res, 200, { user });
  } catch (error) { next(error); }
};
```
**Routes:**
```javascript
const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;
```

#### Doctors (`src/controllers/doctorController.js` & `src/routes/doctorRoutes.js`)
**Controller:**
```javascript
const Doctor = require('../models/Doctor');
const { sendResponse } = require('../utils/helpers');

exports.searchDoctors = async (req, res, next) => {
  try {
    const { specialty, lat, lng, radius = 10, sortBy } = req.query;
    let query = {};
    if (specialty) query.specialty = specialty;

    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: radius * 1000
        }
      };
    }

    let docs = await Doctor.find(query);
    if (sortBy === 'rating') docs = docs.sort((a, b) => b.rating - a.rating);
    
    sendResponse(res, 200, { doctors: docs });
  } catch (error) { next(error); }
};

exports.getDoctorById = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, data: null, message: 'Doctor not found' });
    sendResponse(res, 200, { doctor });
  } catch (error) { next(error); }
};
```
**Routes:**
```javascript
const express = require('express');
const { searchDoctors, getDoctorById } = require('../controllers/doctorController');
const router = express.Router();

router.get('/search', searchDoctors);
router.get('/:id', getDoctorById);

module.exports = router;
```

#### AI Proxy (`src/routes/aiProxyRoutes.js`)
**Routes:**
```javascript
const express = require('express');
const axios = require('axios');
const { sendResponse, snakeToCamel } = require('../utils/helpers');
const router = express.Router();

router.post('/analyze', async (req, res, next) => {
  try {
    const { symptoms } = req.body;
    // Calculate age from user's DOB
    const age = req.user.dateOfBirth ? new Date().getFullYear() - new Date(req.user.dateOfBirth).getFullYear() : null;
    
    const response = await axios.post(`${process.env.AI_SERVICE_URL}/analyze-symptoms`, {
      symptoms,
      patient_info: { age, gender: req.user.gender }
    });
    
    const camelData = snakeToCamel(response.data);
    sendResponse(res, 200, camelData);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

#### Prescriptions (`src/controllers/prescriptionController.js` & `src/routes/prescriptionRoutes.js`)
**Controller:**
```javascript
const Prescription = require('../models/Prescription');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { sendResponse, snakeToCamel } = require('../utils/helpers');

exports.uploadPrescription = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, data: null, message: 'No file uploaded' });
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));

    const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL}/extract-prescription`, formData, {
      headers: { ...formData.getHeaders() }
    });

    const camelData = snakeToCamel(aiResponse.data);

    const prescription = await Prescription.create({
      patientId: req.user._id,
      appointmentId: req.body.appointmentId || null,
      originalFileUrl: `/uploads/${req.file.filename}`,
      extractedData: camelData
    });

    sendResponse(res, 201, { prescription }, 'Prescription extracted successfully');
  } catch (error) { next(error); }
};

exports.getPrescriptions = async (req, res, next) => {
  try {
    const prescriptions = await Prescription.find({ patientId: req.user._id });
    sendResponse(res, 200, { prescriptions });
  } catch (error) { next(error); }
};

exports.getPrescriptionById = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    sendResponse(res, 200, { prescription });
  } catch (error) { next(error); }
};
```
**Routes:**
```javascript
const express = require('express');
const upload = require('../middleware/upload');
const { uploadPrescription, getPrescriptions, getPrescriptionById } = require('../controllers/prescriptionController');
const router = express.Router();

router.post('/upload', upload.single('prescription'), uploadPrescription);
router.get('/', getPrescriptions);
router.get('/:id', getPrescriptionById);

module.exports = router;
```

#### Appointments & Summary
Follow similar patterns using `snakeToCamel` for AI interactions and `sendResponse` for returning data. 

**Summary Controller snippet for /generate:**
```javascript
// POST /api/summary/generate
const ConsultationSummary = require('../models/ConsultationSummary');
const axios = require('axios');
const { sendResponse, snakeToCamel } = require('../utils/helpers');

exports.generateSummary = async (req, res, next) => {
  try {
    const { appointmentId, symptoms, assessment, recommendedSpecialist, additionalNotes } = req.body;
    
    const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL}/generate-summary`, {
      symptoms, assessment, recommended_specialist: recommendedSpecialist,
      patient_info: { name: req.user.name, gender: req.user.gender },
      additional_notes: additionalNotes
    });
    
    const camelData = snakeToCamel(aiResponse.data);
    
    const summary = await ConsultationSummary.create({
      appointmentId, patientId: req.user._id, chiefComplaint: camelData.chiefComplaint,
      symptoms, assessment, recommendedSpecialist, additionalNotes, summaryText: camelData.summaryText
    });
    
    sendResponse(res, 201, { summary }, 'Summary generated');
  } catch (error) { next(error); }
};
```

### `backend/seeds/doctorSeed.js`
Create a seed script covering the exact canonical specialties in Mangalore.
```javascript
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Doctor = require('../src/models/Doctor');

dotenv.config({ path: './.env' });

const specialties = ["General Medicine", "Orthopedic", "Cardiologist", "Dermatologist", "Neurologist", "Gastroenterologist", "Pulmonologist", "ENT", "Ophthalmologist", "Gynecologist", "Urologist", "Psychiatrist", "Pediatrician", "Dentist", "Endocrinologist"];

const doctors = specialties.map((spec, i) => ({
  name: `Dr. Example ${i}`,
  specialty: spec,
  experience: 5 + (i % 15),
  consultationFee: 300 + (i * 50),
  rating: 4.0 + (i % 10) / 10,
  clinicName: `${spec} Clinic Mangalore`,
  clinicAddress: `Mangalore Area ${i}`,
  phone: `98765432${i < 10 ? '0' + i : i}`,
  location: { type: 'Point', coordinates: [74.84 + (i * 0.01), 12.87 + (i * 0.01)] },
  availableSlots: [{ day: 'Monday', times: ['09:00', '10:00'] }],
  about: `Expert in ${spec}`
}));

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    await Doctor.deleteMany();
    await Doctor.insertMany(doctors);
    console.log('Doctors Seeded!');
    process.exit(0);
  });
```

---

## 3. Route Mounting Summary (App.js Review)

Ensure your `src/app.js` is set exactly as specified in the API contract:
```javascript
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', protect, appointmentRoutes);
app.use('/api/symptoms', protect, aiProxyRoutes); // Matches /symptoms/analyze
app.use('/api/summary', protect, summaryRoutes);
app.use('/api/prescriptions', protect, prescriptionRoutes);
app.use('/uploads', express.static('uploads'));
```

## 4. Testing Guide

Use **Postman** or **cURL**:
1. Run `npm run seed` to load doctor data.
2. Run `npm run dev` to start server.
3. Test `POST /api/auth/register` to create a user. Extract the `token`.
4. In Postman, set Header `Authorization: Bearer <token>` to test `GET /api/doctors/search` and `GET /api/auth/me`.
5. For file uploads on `POST /api/prescriptions/upload`, use Form-Data in Postman and set key `prescription` to File type.

## 5. Important Notes & Frontend Integration

- **CORS:** Ensure `origin` matches `FRONTEND_URL` in `.env`.
- **Naming Conventions:** `snakeToCamel` is heavily utilized to convert AI snake_case to frontend-ready camelCase.
- **Upload Names:** Frontend sends `prescription`, Multer intercepts `prescription`, then backend receives the image file, forwards it to AI service's `/extract-prescription` endpoint, which uses **Gemini Vision API** directly (no PaddleOCR dependency — much simpler installation).
- **Specialty Strings:** Must precisely match the canonical list in API docs.
- **Envelope:** Every response uses the `sendResponse` wrapper, forcing `{success, data, message}`.
- **`POST /api/symptoms/analyze`:** Must forward the `language` field from the request body to the AI service's `/analyze-symptoms` endpoint (the frontend sends it, AI service expects it).
- **`POST /api/doctor-auth/login`:** Must return exactly `{ success: true, data: { token: 'jwt', doctor: { id, name, email, specialty } }, message }` — frontend's AuthContext stores `res.data.token` as `clinova_doctor_token` and `res.data.doctor` as doctor state.
- **Doctor Portal Middleware:** Doctor portal routes must use a separate middleware that reads `Authorization: Bearer <doctor_token>` and validates it with the same JWT_SECRET but extracts `doctorId` from payload.
- **Static File Serving:** `app.use('/uploads', express.static('uploads'))` must be in app.js so prescription images served from `/uploads/filename.jpg` are accessible by the frontend's `<img>` tags.
- **Real API Switching:** When switching frontend from mock to real: `uploadPrescription` in `api.js` returns `res.data.prescription.extractedData` — backend must return this exact shape.
