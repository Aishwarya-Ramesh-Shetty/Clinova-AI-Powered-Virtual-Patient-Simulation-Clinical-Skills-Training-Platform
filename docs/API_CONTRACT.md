# 🔗 API Contract — Shared Interface Definitions

> **This is the source of truth.** All three modules (frontend, backend, AI service) MUST conform to these exact shapes. If you need to change something here, notify the entire team.

---

## 🌐 Ports & Base URLs

| Service    | Base URL                     | Used By            |
|------------|------------------------------|---------------------|
| Frontend   | `http://localhost:5173`      | Users (browser)     |
| Backend    | `http://localhost:5000`      | Frontend            |
| AI Service | `http://localhost:8000`      | Backend (internal)  |

- Frontend calls Backend at: `http://localhost:5000/api/*`
- Backend calls AI Service at: `http://localhost:8000/*`
- **Frontend NEVER calls AI Service directly**

---

## 🔐 Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/clinova
JWT_SECRET=clinova_jwt_secret_2026
JWT_EXPIRES_IN=7d
AI_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
```

### AI Service (`ai-service/.env`)
```env
PORT=8000
GEMINI_API_KEY=your_google_gemini_api_key_here
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000/api
```

---

## 📦 Response Envelope

**Every backend response** follows this format:

```json
{
  "success": true,
  "data": { },
  "message": "Human-readable message"
}
```

**Error responses:**
```json
{
  "success": false,
  "data": null,
  "message": "Error description"
}
```

HTTP status codes: `200` OK, `201` Created, `400` Bad Request, `401` Unauthorized, `404` Not Found, `500` Server Error

---

## 🔑 Authentication

- **Method:** JWT Bearer Token
- **Header:** `Authorization: Bearer <token>`
- **Token payload:** `{ userId: "mongo_id", email: "user@email.com" }`
- **Signed with:** `JWT_SECRET` env variable
- **Expiry:** 7 days

---

## 📊 Database Models (MongoDB/Mongoose)

### User
```javascript
{
  _id: ObjectId,
  name: String,           // "Pranav Shenoy"
  email: String,          // unique, lowercase
  password: String,       // bcrypt hashed
  phone: String,          // "9876543210"
  dateOfBirth: Date,      // 1998-05-15
  gender: String,         // "male" | "female" | "other"
  address: String,        // optional
  createdAt: Date         // auto
}
```

### Doctor
```javascript
{
  _id: ObjectId,
  name: String,              // "Dr. Ramesh Kumar"
  email: String,             // unique, lowercase (For Doctor Portal login)
  password: String,          // bcrypt hashed
  specialty: String,         // "Orthopedic" (MUST match specialist names from AI)
  experience: Number,        // years, e.g. 12
  consultationFee: Number,   // in INR, e.g. 500
  rating: Number,            // 1.0 - 5.0
  clinicName: String,        // "Kumar Bone & Joint Clinic"
  clinicAddress: String,     // "KS Rao Road, Mangalore"
  phone: String,
  location: {
    type: "Point",
    coordinates: [Number, Number]   // [longitude, latitude] — GeoJSON format
  },
  availableSlots: [
    {
      day: String,           // "Monday", "Tuesday", etc.
      times: [String]        // ["09:00", "09:30", "10:00", "14:00", "15:30"]
    }
  ],
  about: String,             // short bio
  imageUrl: String,          // optional, placeholder default
  createdAt: Date
}
```

### Appointment
```javascript
{
  _id: ObjectId,
  patientId: ObjectId,       // ref → User
  doctorId: ObjectId,        // ref → Doctor
  date: Date,                // appointment date, e.g. 2026-10-15
  timeSlot: String,          // "09:00"
  status: String,            // "booked" | "cancelled" | "completed"
  notes: String,             // optional patient notes
  createdAt: Date
}
```

### ConsultationSummary
```javascript
{
  _id: ObjectId,
  appointmentId: ObjectId,   // ref → Appointment (optional, can be null for pre-booking)
  patientId: ObjectId,       // ref → User
  chiefComplaint: String,
  symptoms: [
    {
      name: String,          // "knee pain"
      duration: String,      // "2 weeks"
      severity: String       // "moderate"
    }
  ],
  assessment: String,        // AI clinical assessment text
  recommendedSpecialist: String,  // "Orthopedic"
  additionalNotes: String,
  summaryText: String,       // Full formatted summary
  generatedAt: Date
}
```

### Prescription
```javascript
{
  _id: ObjectId,
  patientId: ObjectId,       // ref → User
  appointmentId: ObjectId,   // ref → Appointment, optional
  originalFileUrl: String,   // "/uploads/prescription_1234.jpg"
  extractedData: {
    medicines: [
      {
        name: String,        // "Amoxicillin"
        dosage: String,      // "500mg"
        frequency: String,   // "3 times a day"
        duration: String,    // "7 days"
        instructions: String // "After food"
      }
    ],
    doctorName: String,      // extracted doctor name
    date: String,            // extracted date from prescription
    diagnosis: String,       // extracted diagnosis if present
    rawText: String          // raw OCR text
  },
  uploadedAt: Date
}
```

---

## 🛣️ Frontend ↔ Backend API Endpoints

### Auth

#### `POST /api/auth/register`
```
Request:  { name, email, password, phone, dateOfBirth, gender }
Response: { success: true, data: { token: "jwt...", user: { id, name, email } }, message: "Registration successful" }
```

#### `POST /api/auth/login`
```
Request:  { email, password }
Response: { success: true, data: { token: "jwt...", user: { id, name, email } }, message: "Login successful" }
```

#### `GET /api/auth/me`  🔒
```
Headers:  Authorization: Bearer <token>
Response: { success: true, data: { user: { id, name, email, phone, dateOfBirth, gender, address } } }
```

---

### Doctor Portal (Hospital Side)

#### `POST /api/doctor-auth/login`
```
Request:  { email, password }
Response: { success: true, data: { token: "jwt...", doctor: { id, name, email, specialty } }, message: "Doctor Login successful" }
```

#### `GET /api/doctor-portal/appointments`  🔒
```
Headers:  Authorization: Bearer <doctor_token>
Response: { success: true, data: { appointments: [ ...list of upcoming appointments for this doctor... ] } }
```

#### `GET /api/doctor-portal/patients/:patientId/history`  🔒
```
Headers:  Authorization: Bearer <doctor_token>
Response: { 
  success: true, 
  data: { 
    prescriptions: [ ...past prescriptions... ], 
    consultationSummaries: [ ...past summaries... ] 
  } 
}
```

---

### Symptom Analysis

#### `POST /api/symptoms/analyze`  🔒
```
Headers:  Authorization: Bearer <token>
Request:  {
  symptoms: "I have been having knee pain for 2 weeks, it swells up after walking",
  language: "en-IN"  // optional, e.g. "hi-IN", "kn-IN" to get AI output in Indian languages
}

→ Backend internally calls AI Service: POST http://localhost:8000/analyze-symptoms
  with body: {
    symptoms: "I have been having knee pain for 2 weeks...",
    language: "en-IN",
    patient_info: { age: 28, gender: "male" }     ← derived from user's DOB & gender
  }

→ AI Service returns (snake_case):
  {
    symptoms: [ { name: "knee pain", duration: "2 weeks", severity: "moderate" } ],
    assessment: "Based on clinical case study analysis, the symptom pattern...", // translated if language != en
    recommended_specialist: "Orthopedic", // Specialist name always remains in English
    confidence: 0.82,
    reasoning: "Persistent knee pain with swelling...", // translated
    case_study_reference: "Osteoarthritis Case Study #3"
  }

→ Backend converts to camelCase and responds:
Response: {
  success: true,
  data: {
    symptoms: [ { name: "knee pain", duration: "2 weeks", severity: "moderate" } ],
    assessment: "Based on clinical case study analysis...",
    recommendedSpecialist: "Orthopedic",
    confidence: 0.82,
    reasoning: "Persistent knee pain with swelling...",
    caseStudyReference: "Osteoarthritis Case Study #3"
  }
}
```

---

### Doctors

#### `GET /api/doctors/search`  🔒
```
Query params: ?specialty=Orthopedic&lat=12.8714&lng=74.8425&radius=10&sortBy=rating
Response: {
  success: true,
  data: {
    doctors: [
      {
        id: "abc123",
        name: "Dr. Ramesh Kumar",
        specialty: "Orthopedic",
        experience: 12,
        consultationFee: 500,
        rating: 4.5,
        clinicName: "Kumar Bone & Joint Clinic",
        clinicAddress: "KS Rao Road, Mangalore",
        phone: "9876543210",
        location: { coordinates: [74.8425, 12.8714] },
        distance: 2.3,
        availableSlots: [ { day: "Monday", times: ["09:00", "10:00", "14:00"] } ],
        imageUrl: "/images/default-doctor.png"
      }
    ]
  }
}
```

#### `GET /api/doctors/:id`  🔒
```
Response: { success: true, data: { doctor: { ...full doctor object } } }
```

---

### Appointments

#### `POST /api/appointments`  🔒
```
Request:  { doctorId: "abc123", date: "2026-10-15", timeSlot: "09:00", notes: "optional" }
Response: {
  success: true,
  data: {
    appointment: { id, patientId, doctorId, date, timeSlot, status: "booked", notes }
  },
  message: "Appointment booked successfully"
}
```

#### `GET /api/appointments`  🔒
```
Response: {
  success: true,
  data: {
    appointments: [
      {
        id: "appt123",
        doctor: { name: "Dr. Ramesh Kumar", specialty: "Orthopedic", clinicName: "..." },
        date: "2026-10-15",
        timeSlot: "09:00",
        status: "booked",
        notes: ""
      }
    ]
  }
}
```

#### `PATCH /api/appointments/:id`  🔒
```
Request:  { status: "cancelled" }
Response: { success: true, data: { appointment: { ...updated } }, message: "Appointment cancelled" }
```

---

### Consultation Summary

#### `POST /api/summary/generate`  🔒
```
Request: {
  appointmentId: "appt123",           ← optional (can be null for pre-booking summary)
  symptoms: [ { name: "knee pain", duration: "2 weeks", severity: "moderate" } ],
  assessment: "Based on clinical case study analysis...",
  recommendedSpecialist: "Orthopedic",
  additionalNotes: "Patient mentioned family history of arthritis"
}

→ Backend calls AI Service: POST http://localhost:8000/generate-summary
  with body: {
    symptoms: [ { name, duration, severity } ],
    assessment: "...",
    recommended_specialist: "Orthopedic",
    patient_info: { age: 28, gender: "male", name: "Pranav" },
    additional_notes: "..."
  }

→ AI Service returns:
  {
    summary_text: "## Consultation Summary\n\n**Chief Complaint:** ...",
    chief_complaint: "Knee pain with swelling for 2 weeks"
  }

→ Backend saves to DB and responds:
Response: {
  success: true,
  data: {
    summary: {
      id: "sum123",
      appointmentId: "appt123",
      chiefComplaint: "Knee pain with swelling for 2 weeks",
      symptoms: [...],
      assessment: "...",
      recommendedSpecialist: "Orthopedic",
      summaryText: "## Consultation Summary\n\n**Chief Complaint:** ...",
      generatedAt: "2026-10-15T10:30:00Z"
    }
  },
  message: "Summary generated"
}
```

#### `GET /api/summary/:appointmentId`  🔒
```
Response: { success: true, data: { summary: { ...full summary } } }
```

---

### Prescriptions

#### `POST /api/prescriptions/upload`  🔒
```
Content-Type: multipart/form-data
Form fields:
  - prescription: File (image/jpeg, image/png, application/pdf)    ← FIELD NAME IS "prescription"
  - appointmentId: String (optional)

→ Backend saves file to /uploads/ folder
→ Backend calls AI Service: POST http://localhost:8000/extract-prescription
    Content-Type: multipart/form-data
    Form field: file (the uploaded file)                            ← FIELD NAME IS "file"

→ AI Service returns:
  {
    medicines: [
      { name: "Amoxicillin", dosage: "500mg", frequency: "3 times a day", duration: "7 days", instructions: "After food" }
    ],
    doctor_name: "Dr. Sharma",
    date: "2026-10-10",
    diagnosis: "Bacterial throat infection",
    raw_text: "full OCR extracted text..."
  }

→ Backend saves to DB and responds:
Response: {
  success: true,
  data: {
    prescription: {
      id: "presc123",
      originalFileUrl: "/uploads/prescription_1696012345678.jpg",
      extractedData: {
        medicines: [...],
        doctorName: "Dr. Sharma",
        date: "2026-10-10",
        diagnosis: "Bacterial throat infection",
        rawText: "..."
      },
      uploadedAt: "2026-10-15T11:00:00Z"
    }
  },
  message: "Prescription extracted successfully"
}
```

#### `GET /api/prescriptions`  🔒
```
Response: {
  success: true,
  data: {
    prescriptions: [
      { id, originalFileUrl, extractedData: { medicines, doctorName, date, diagnosis }, uploadedAt }
    ]
  }
}
```

#### `GET /api/prescriptions/:id`  🔒
```
Response: { success: true, data: { prescription: { ...full prescription } } }
```

---

## 🔄 Backend ↔ AI Service Internal API

> These endpoints are called **only by the backend**, never by the frontend.
> AI Service uses **snake_case**. Backend converts to **camelCase** before sending to frontend.

### `POST http://localhost:8000/analyze-symptoms`
```
Request:  { "symptoms": "string", "language": "string", "patient_info": { "age": 28, "gender": "male" } }
Response: {
  "symptoms": [{ "name": "string", "duration": "string", "severity": "string" }],
  "assessment": "string",
  "recommended_specialist": "string",
  "confidence": 0.85,
  "reasoning": "string",
  "case_study_reference": "string"
}
```

### `POST http://localhost:8000/generate-summary`
```
Request: {
  "symptoms": [{ "name": "string", "duration": "string", "severity": "string" }],
  "assessment": "string",
  "recommended_specialist": "string",
  "patient_info": { "age": 28, "gender": "male", "name": "string" },
  "additional_notes": "string"
}
Response: {
  "summary_text": "string (markdown formatted)",
  "chief_complaint": "string"
}
```

### `POST http://localhost:8000/extract-prescription`
```
Content-Type: multipart/form-data
Field: "file" (image or PDF)
Response: {
  "medicines": [{ "name": "str", "dosage": "str", "frequency": "str", "duration": "str", "instructions": "str" }],
  "doctor_name": "string",
  "date": "string",
  "diagnosis": "string",
  "raw_text": "string"
}
```

---

## 🏷️ Specialist Names (Canonical List)

Both the AI service and the doctor seed data MUST use these exact specialty names:

```
General Medicine
Orthopedic
Cardiologist
Dermatologist
Neurologist
Gastroenterologist
Pulmonologist
ENT
Ophthalmologist
Gynecologist
Urologist
Psychiatrist
Pediatrician
Dentist
Endocrinologist
```

The AI's `recommended_specialist` field will always return one of these exact strings.
The Doctor model's `specialty` field must use one of these exact strings.
The frontend filters doctors by matching this string.

---

## 📤 File Upload Field Names

| Upload Context         | Frontend FormData Key | Backend Multer Field | AI Service Form Field |
|------------------------|-----------------------|----------------------|-----------------------|
| Prescription upload    | `prescription`        | `prescription`       | `file`                |

---

## 🔀 Data Naming Conventions

| Layer       | Convention   | Example                    |
|-------------|--------------|----------------------------|
| Frontend    | camelCase    | `recommendedSpecialist`    |
| Backend     | camelCase    | `recommendedSpecialist`    |
| AI Service  | snake_case   | `recommended_specialist`   |
| Database    | camelCase    | `recommendedSpecialist`    |

Backend has a utility function `snakeToCamel(obj)` that converts AI service responses before forwarding to frontend.

---

## 🧪 CORS Configuration

### Backend (Express)
```javascript
cors({
  origin: "http://localhost:5173",
  credentials: true
})
```

### AI Service (FastAPI)
```python
CORSMiddleware(
    allow_origins=["http://localhost:5000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
