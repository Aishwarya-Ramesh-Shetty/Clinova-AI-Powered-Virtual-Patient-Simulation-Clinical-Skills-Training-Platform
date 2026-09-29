# Clinova Frontend Implementation Guide

This is the complete implementation guide for building the **Clinova Frontend** (React + Vite + Tailwind CSS).
You will be working ONLY in the `frontend/` folder on the `pranav/frontend` branch.

---

## 1. Getting Started

Run these exact commands in your terminal:

```bash
# 1. Create the Vite React app
npm create vite@latest frontend -- --template react

# 2. Enter directory and install dependencies
cd frontend
npm install

# 3. Install Tailwind CSS v4 and its Vite plugin
npm install -D tailwindcss @tailwindcss/vite

# 4. Install additional required dependencies
npm install axios react-router-dom leaflet react-leaflet react-hot-toast react-icons
```

Create a `.env.example` (and `.env`) file in the `frontend/` root:
```env
VITE_API_URL=http://localhost:5000/api
```

Update `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

Update `src/index.css`:
```css
@import 'tailwindcss';
@import 'leaflet/dist/leaflet.css';

/* Custom base styles if needed */
body {
  @apply bg-gray-50 text-gray-900;
}
```

---

## 2. File-by-File Implementation Guide

### `src/main.jsx`
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
```

### `src/App.jsx`
```jsx
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/common/Navbar'
import Footer from './components/common/Footer'
import ProtectedRoute from './components/common/ProtectedRoute'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SymptomInputPage from './pages/SymptomInputPage'
import DiagnosisResultPage from './pages/DiagnosisResultPage'
import DoctorDiscoveryPage from './pages/DoctorDiscoveryPage'
import AppointmentBookingPage from './pages/AppointmentBookingPage'
import AppointmentsPage from './pages/AppointmentsPage'
import ConsultationSummaryPage from './pages/ConsultationSummaryPage'
import PrescriptionUploadPage from './pages/PrescriptionUploadPage'
import PrescriptionVaultPage from './pages/PrescriptionVaultPage'
import ProfilePage from './pages/ProfilePage'

function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/symptoms" element={<SymptomInputPage />} />
            <Route path="/diagnosis" element={<DiagnosisResultPage />} />
            <Route path="/doctors" element={<DoctorDiscoveryPage />} />
            <Route path="/book/:doctorId" element={<AppointmentBookingPage />} />
            <Route path="/appointments" element={<AppointmentsPage />} />
            <Route path="/summary/:appointmentId" element={<ConsultationSummaryPage />} />
            <Route path="/prescriptions/upload" element={<PrescriptionUploadPage />} />
            <Route path="/prescriptions" element={<PrescriptionVaultPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </main>
      <Footer />
      <Toaster position="top-right" />
    </div>
  )
}

export default App
```

### `src/components/common/ProtectedRoute.jsx`
```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Loader from './Loader'

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <Loader />
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

export default ProtectedRoute
```

### `src/services/api.js`
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clinova_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('clinova_token');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || { message: 'Something went wrong' });
  }
);

export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

export const analyzeSymptoms = (data) => api.post('/symptoms/analyze', data); // body: { symptoms: 'text' }

export const searchDoctors = (params) => api.get('/doctors/search', { params });
export const getDoctorById = (id) => api.get(`/doctors/${id}`);

export const bookAppointment = (data) => api.post('/appointments', data); // body: { doctorId, date, timeSlot, notes }
export const getAppointments = () => api.get('/appointments');
export const cancelAppointment = (id) => api.patch(`/appointments/${id}`, { status: 'cancelled' });

export const generateSummary = (data) => api.post('/summary/generate', data);
export const getSummary = (appointmentId) => api.get(`/summary/${appointmentId}`);

export const uploadPrescription = (formData) => api.post('/prescriptions/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
}); // formData must have key 'prescription'
export const getPrescriptions = () => api.get('/prescriptions');
export const getPrescriptionById = (id) => api.get(`/prescriptions/${id}`);

export default api;
```

### `src/context/AuthContext.jsx`
```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import * as api from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('clinova_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await api.getMe();
          setUser(res.data.user);
        } catch (error) {
          localStorage.removeItem('clinova_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const res = await api.login({ email, password });
    localStorage.setItem('clinova_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const register = async (data) => {
    const res = await api.register(data);
    localStorage.setItem('clinova_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('clinova_token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
```

### `src/hooks/useVoice.js`
```javascript
import { useState, useEffect } from 'react';

export const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;

      recog.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            currentTranscript += event.results[i][0].transcript + ' ';
          }
        }
        setTranscript((prev) => prev + currentTranscript);
      };

      recog.onerror = (event) => {
        setError(event.error);
        setIsListening(false);
      };

      recog.onend = () => {
        setIsListening(false);
      };

      setRecognition(recog);
    } else {
      setError('Web Speech API is not supported in this browser.');
    }
  }, []);

  const startListening = (lang = 'en-US') => {
    if (recognition) {
      recognition.lang = lang;
      recognition.start();
      setIsListening(true);
      setError(null);
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const resetTranscript = () => setTranscript('');

  return { isListening, transcript, error, startListening, stopListening, resetTranscript };
};
```

### `src/hooks/useGeolocation.js`
```javascript
import { useState, useEffect } from 'react';

export const useGeolocation = () => {
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
  }, []);

  return { ...location, error, loading };
};
```

### `src/pages/HomePage.jsx`
```jsx
import { Link } from 'react-router-dom';
import { FaStethoscope, FaPrescription, FaUserMd } from 'react-icons/fa';

export default function HomePage() {
  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Clinova AI Platform
          </h1>
          <p className="mt-4 text-xl text-gray-600">
            Virtual Patient Simulation & Clinical Skills Training
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link to="/symptoms" className="bg-teal-600 text-white px-6 py-3 rounded-md font-medium hover:bg-teal-700">
              Get Started
            </Link>
            <Link to="/login" className="bg-gray-100 text-teal-700 px-6 py-3 rounded-md font-medium hover:bg-gray-200">
              Login
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <FaStethoscope className="text-teal-600 text-4xl mx-auto mb-4" />
            <h3 className="text-lg font-bold">Symptom Analysis</h3>
            <p className="mt-2 text-gray-600">AI-powered preliminary diagnosis</p>
          </div>
          {/* Feature 2 */}
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <FaUserMd className="text-teal-600 text-4xl mx-auto mb-4" />
            <h3 className="text-lg font-bold">Doctor Discovery</h3>
            <p className="mt-2 text-gray-600">Find the right specialist nearby</p>
          </div>
          {/* Feature 3 */}
          <div className="bg-gray-50 p-6 rounded-lg text-center">
            <FaPrescription className="text-teal-600 text-4xl mx-auto mb-4" />
            <h3 className="text-lg font-bold">Prescription Vault</h3>
            <p className="mt-2 text-gray-600">Smart OCR extraction for prescriptions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### `src/pages/LoginPage.jsx`
```jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success('Logged in successfully');
      navigate('/symptoms');
    } catch (err) {
      toast.error(err.message || 'Login failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-teal-700">Login</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700">Email</label>
          <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-gray-700">Password</label>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required className="w-full border rounded px-3 py-2" />
        </div>
        <button type="submit" className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700">Login</button>
      </form>
      <p className="mt-4 text-center text-gray-600">Don't have an account? <Link to="/register" className="text-teal-600">Register</Link></p>
    </div>
  );
}
```

### `src/pages/RegisterPage.jsx`
```jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '', dateOfBirth: '', gender: '' });
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await register(formData);
      toast.success('Registered successfully');
      navigate('/symptoms');
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md mb-10">
      <h2 className="text-2xl font-bold mb-6 text-center text-teal-700">Register</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input name="name" placeholder="Full Name" onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        <input name="email" type="email" placeholder="Email" onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        <input name="password" type="password" placeholder="Password" onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        <input name="phone" placeholder="Phone" onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        <input name="dateOfBirth" type="date" onChange={handleChange} required className="w-full border rounded px-3 py-2" />
        <select name="gender" onChange={handleChange} required className="w-full border rounded px-3 py-2">
          <option value="">Select Gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <button type="submit" className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700">Register</button>
      </form>
    </div>
  );
}
```

### `src/pages/SymptomInputPage.jsx`
```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeSymptoms } from '../services/api';
import { useVoice } from '../hooks/useVoice';
import { FaMicrophone, FaStop } from 'react-icons/fa';
import toast from 'react-hot-toast';
import Loader from '../components/common/Loader';

export default function SymptomInputPage() {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isListening, transcript, startListening, stopListening, resetTranscript, error } = useVoice();

  useEffect(() => {
    if (transcript) {
      setText((prev) => prev + ' ' + transcript);
      resetTranscript();
    }
  }, [transcript]);

  const handleAnalyze = async () => {
    if (!text.trim()) return toast.error('Please enter symptoms');
    setLoading(true);
    try {
      const res = await analyzeSymptoms({ symptoms: text });
      navigate('/diagnosis', { state: { result: res.data } });
    } catch (err) {
      toast.error('Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 mt-8">
      <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-6">
        <strong>Disclaimer:</strong> This tool provides AI-assisted analysis and is NOT a substitute for professional medical advice.
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold mb-4">Describe your symptoms</h2>
        
        <div className="mb-4 flex gap-4">
          <select value={lang} onChange={(e)=>setLang(e.target.value)} className="border rounded p-2">
            <option value="en-US">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="kn-IN">Kannada</option>
          </select>
          <button 
            onClick={isListening ? stopListening : () => startListening(lang)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-white ${isListening ? 'bg-red-500' : 'bg-teal-600'}`}
          >
            {isListening ? <><FaStop/> Stop</> : <><FaMicrophone/> Voice Input</>}
          </button>
        </div>
        
        {error && <p className="text-red-500 mb-2">{error}</p>}

        <textarea
          className="w-full h-40 border rounded-md p-4 mb-4 focus:ring-2 focus:ring-teal-500"
          placeholder="e.g., I have been having knee pain for 2 weeks..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        
        <button 
          onClick={handleAnalyze} 
          disabled={loading}
          className="w-full bg-teal-600 text-white py-3 rounded-md font-bold hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? <Loader /> : 'Analyze Symptoms'}
        </button>
      </div>
    </div>
  );
}
```

### `src/pages/DiagnosisResultPage.jsx`
```jsx
import { useLocation, useNavigate } from 'react-router-dom';

export default function DiagnosisResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result;

  if (!result) {
    return <div className="text-center mt-10">No results found. <button onClick={() => navigate('/symptoms')} className="text-teal-600 underline">Go back</button></div>;
  }

  const { symptoms, assessment, recommendedSpecialist, confidence, reasoning, caseStudyReference } = result;

  return (
    <div className="max-w-4xl mx-auto p-4 mt-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">AI Clinical Assessment</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Identified Symptoms:</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {symptoms.map((s, idx) => (
              <span key={idx} className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-sm">
                {s.name} ({s.severity}, {s.duration})
              </span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Assessment:</h3>
          <p className="text-gray-800 mt-1">{assessment}</p>
        </div>

        <div className="mb-4 bg-gray-50 p-4 rounded border">
          <h3 className="font-semibold text-gray-700">Recommended Specialist:</h3>
          <p className="text-xl font-bold text-teal-700 mt-1">{recommendedSpecialist}</p>
        </div>

        <details className="mb-4 bg-gray-50 p-4 rounded border">
          <summary className="font-semibold text-gray-700 cursor-pointer">AI Reasoning & References (Confidence: {Math.round(confidence * 100)}%)</summary>
          <div className="mt-2 text-sm text-gray-600">
            <p><strong>Reasoning:</strong> {reasoning}</p>
            <p className="mt-2"><strong>Case Study Ref:</strong> {caseStudyReference}</p>
          </div>
        </details>
      </div>

      <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-6 font-semibold text-center">
        This is AI-assisted analysis. Please consult a qualified doctor.
      </div>

      <div className="flex gap-4">
        <button 
          onClick={() => navigate(`/doctors?specialty=${encodeURIComponent(recommendedSpecialist)}`)}
          className="flex-1 bg-teal-600 text-white py-3 rounded hover:bg-teal-700 font-bold"
        >
          Find Nearby {recommendedSpecialist}s
        </button>
      </div>
    </div>
  );
}
```

### `src/pages/DoctorDiscoveryPage.jsx`
```jsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchDoctors } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Loader from '../components/common/Loader';

export default function DoctorDiscoveryPage() {
  const [searchParams] = useSearchParams();
  const specialty = searchParams.get('specialty') || '';
  const [doctors, setDoctors] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const { latitude, longitude, loading: geoLoading } = useGeolocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!geoLoading && latitude && longitude) {
      fetchDoctors();
    }
  }, [geoLoading, latitude, longitude, specialty]);

  const fetchDoctors = async () => {
    setLoadingDocs(true);
    try {
      const res = await searchDoctors({ specialty, lat: latitude, lng: longitude, radius: 10 });
      setDoctors(res.data.doctors);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDocs(false);
    }
  };

  if (geoLoading || loadingDocs) return <div className="mt-20"><Loader /></div>;

  return (
    <div className="max-w-7xl mx-auto p-4 flex flex-col md:flex-row gap-6 h-[calc(100vh-100px)]">
      <div className="w-full md:w-1/2 overflow-y-auto pr-2">
        <h2 className="text-2xl font-bold mb-4">Nearby {specialty}s</h2>
        <div className="space-y-4">
          {doctors.map(doc => (
            <div key={doc.id} className="bg-white p-4 rounded-lg shadow border flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{doc.name}</h3>
                <p className="text-sm text-gray-600">{doc.clinicName}</p>
                <p className="text-sm">Rating: {doc.rating} ⭐ | Exp: {doc.experience} yrs</p>
                <p className="text-sm font-semibold text-teal-700">Fee: ₹{doc.consultationFee}</p>
              </div>
              <button 
                onClick={() => navigate(`/book/${doc.id}`)}
                className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700"
              >
                Book
              </button>
            </div>
          ))}
          {doctors.length === 0 && <p>No doctors found nearby.</p>}
        </div>
      </div>
      
      <div className="w-full md:w-1/2 h-full min-h-[400px] bg-gray-100 rounded-lg overflow-hidden">
        {latitude && longitude && (
          <MapContainer center={[latitude, longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {doctors.map(doc => (
              <Marker key={doc.id} position={[doc.location.coordinates[1], doc.location.coordinates[0]]}>
                <Popup>
                  <strong>{doc.name}</strong><br/>{doc.clinicName}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
```

### `src/pages/AppointmentBookingPage.jsx`
```jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDoctorById, bookAppointment } from '../services/api';
import toast from 'react-hot-toast';

export default function AppointmentBookingPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    getDoctorById(doctorId).then(res => setDoctor(res.data.doctor)).catch(console.error);
  }, [doctorId]);

  const handleBook = async () => {
    if(!date || !timeSlot) return toast.error('Please select date and time');
    try {
      await bookAppointment({ doctorId, date, timeSlot, notes });
      toast.success('Appointment Booked!');
      navigate('/appointments');
    } catch(err) {
      toast.error('Failed to book');
    }
  };

  if(!doctor) return <div>Loading...</div>;

  // Simplistic approach: just taking the first availableSlots object for demo
  const slots = doctor.availableSlots?.[0]?.times || [];

  return (
    <div className="max-w-2xl mx-auto p-4 mt-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-2">Book with {doctor.name}</h2>
        <p className="text-gray-600 mb-6">{doctor.specialty} | {doctor.clinicName}</p>

        <div className="mb-4">
          <label className="block font-semibold mb-2">Select Date</label>
          <input 
            type="date" 
            min={new Date().toISOString().split('T')[0]}
            value={date} 
            onChange={(e)=>setDate(e.target.value)}
            className="border rounded p-2 w-full"
          />
        </div>

        <div className="mb-4">
          <label className="block font-semibold mb-2">Select Time</label>
          <div className="flex flex-wrap gap-2">
            {slots.map(t => (
              <button 
                key={t}
                onClick={() => setTimeSlot(t)}
                className={`px-4 py-2 border rounded ${timeSlot === t ? 'bg-teal-600 text-white' : 'hover:bg-gray-50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block font-semibold mb-2">Notes (optional)</label>
          <textarea 
            value={notes} 
            onChange={(e)=>setNotes(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>

        <button onClick={handleBook} className="w-full bg-teal-600 text-white py-3 rounded font-bold hover:bg-teal-700">
          Confirm Booking (₹{doctor.consultationFee})
        </button>
      </div>
    </div>
  );
}
```

### `src/pages/AppointmentsPage.jsx`
```jsx
import { useState, useEffect } from 'react';
import { getAppointments, cancelAppointment } from '../services/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);

  const fetchApps = async () => {
    const res = await getAppointments();
    setAppointments(res.data.appointments);
  };

  useEffect(() => { fetchApps(); }, []);

  const handleCancel = async (id) => {
    if(window.confirm('Are you sure?')) {
      await cancelAppointment(id);
      toast.success('Cancelled');
      fetchApps();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 mt-8">
      <h2 className="text-2xl font-bold mb-6">My Appointments</h2>
      <div className="space-y-4">
        {appointments.map(app => (
          <div key={app.id} className="bg-white p-4 rounded shadow flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">{app.doctor.name} ({app.doctor.specialty})</h3>
              <p className="text-gray-600">{new Date(app.date).toLocaleDateString()} at {app.timeSlot}</p>
              <span className={`inline-block mt-2 px-2 py-1 text-xs font-bold rounded ${app.status === 'booked' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                {app.status.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {app.status === 'booked' && (
                <button onClick={() => handleCancel(app.id)} className="text-red-500 text-sm border border-red-500 px-3 py-1 rounded hover:bg-red-50">Cancel</button>
              )}
              <Link to={`/summary/${app.id}`} className="text-teal-600 text-sm border border-teal-600 px-3 py-1 rounded hover:bg-teal-50 text-center">Summary</Link>
            </div>
          </div>
        ))}
        {appointments.length === 0 && <p>No appointments found.</p>}
      </div>
    </div>
  );
}
```

### `src/pages/ConsultationSummaryPage.jsx`
```jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSummary } from '../services/api';

export default function ConsultationSummaryPage() {
  const { appointmentId } = useParams();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    getSummary(appointmentId).then(res => setSummary(res.data.summary)).catch(console.error);
  }, [appointmentId]);

  if(!summary) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 mt-8 bg-white shadow rounded-lg mb-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Consultation Summary</h1>
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded no-print">Print</button>
      </div>
      
      <div className="prose max-w-none">
        <h3 className="text-lg font-semibold">Chief Complaint</h3>
        <p>{summary.chiefComplaint}</p>
        
        <h3 className="text-lg font-semibold mt-4">Assessment</h3>
        <p>{summary.assessment}</p>

        <h3 className="text-lg font-semibold mt-4">Full Details</h3>
        {/* Render markdown summaryText if needed, here just basic text for demo */}
        <pre className="whitespace-pre-wrap font-sans text-sm bg-gray-50 p-4 border">{summary.summaryText}</pre>
      </div>
    </div>
  );
}
```

### `src/pages/PrescriptionUploadPage.jsx`
```jsx
import { useState } from 'react';
import { uploadPrescription } from '../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function PrescriptionUploadPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpload = async (e) => {
    e.preventDefault();
    if(!file) return toast.error('Select a file');
    
    const formData = new FormData();
    formData.append('prescription', file); // IMPORTANT: Key is 'prescription'

    setLoading(true);
    try {
      await uploadPrescription(formData);
      toast.success('Uploaded successfully');
      navigate('/prescriptions');
    } catch(err) {
      toast.error('Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 mt-10 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Upload Prescription</h2>
      <form onSubmit={handleUpload}>
        <input 
          type="file" 
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full border p-2 mb-4"
        />
        {file && <p className="mb-4 text-sm text-gray-600">Selected: {file.name}</p>}
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Extracting via AI...' : 'Upload & Extract'}
        </button>
      </form>
    </div>
  );
}
```

### `src/pages/PrescriptionVaultPage.jsx`
```jsx
import { useState, useEffect } from 'react';
import { getPrescriptions } from '../services/api';
import { Link } from 'react-router-dom';

export default function PrescriptionVaultPage() {
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    getPrescriptions().then(res => setPrescriptions(res.data.prescriptions)).catch(console.error);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Prescription Vault</h2>
        <Link to="/prescriptions/upload" className="bg-teal-600 text-white px-4 py-2 rounded">Upload New</Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {prescriptions.map(p => (
          <div key={p.id} className="bg-white p-4 rounded shadow border">
            <h3 className="font-bold text-lg">{p.extractedData.doctorName || 'Unknown Doctor'}</h3>
            <p className="text-sm text-gray-500">{new Date(p.uploadedAt).toLocaleDateString()}</p>
            <div className="mt-4">
              <h4 className="font-semibold text-sm mb-1">Medicines:</h4>
              <ul className="text-sm list-disc pl-4 space-y-1">
                {p.extractedData.medicines?.map((m, i) => (
                  <li key={i}>{m.name} - {m.dosage}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### `src/pages/ProfilePage.jsx`
```jsx
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();
  if(!user) return null;

  return (
    <div className="max-w-2xl mx-auto p-4 mt-8 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">My Profile</h2>
      <div className="space-y-3">
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Phone:</strong> {user.phone}</p>
        <p><strong>Gender:</strong> {user.gender}</p>
      </div>
    </div>
  );
}
```

### `src/components/common/Navbar.jsx`
```jsx
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-teal-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-wider">Clinova</Link>
        <div className="flex gap-4 items-center">
          {isAuthenticated ? (
            <>
              <Link to="/symptoms" className="hover:text-teal-200">Symptom Checker</Link>
              <Link to="/appointments" className="hover:text-teal-200">Appointments</Link>
              <Link to="/prescriptions" className="hover:text-teal-200">Vault</Link>
              <Link to="/profile" className="font-semibold">{user?.name}</Link>
              <button onClick={handleLogout} className="bg-teal-700 px-3 py-1 rounded hover:bg-teal-800">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:text-teal-200">Login</Link>
              <Link to="/register" className="bg-teal-700 px-3 py-1 rounded hover:bg-teal-800">Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
```

### `src/components/common/Footer.jsx`
```jsx
export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 py-6 mt-10">
      <div className="max-w-7xl mx-auto px-4 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} Clinova AI Platform. All rights reserved.</p>
        <p className="mt-2 text-gray-500">Not a replacement for professional medical advice.</p>
      </div>
    </footer>
  );
}
```

### `src/components/common/Loader.jsx`
```jsx
export default function Loader() {
  return (
    <div className="flex justify-center items-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
    </div>
  );
}
```

---

## 3. Color Palette & Design System (Tailwind Classes)

- **Primary**: `bg-teal-600`, `text-teal-700`
- **Background**: `bg-white`
- **Surface**: `bg-gray-50`
- **Text Primary**: `text-gray-900`
- **Text Secondary**: `text-gray-600`
- **Accent/Warning**: `text-amber-800`, `bg-amber-100` (Use for disclaimers)
- **Error**: `text-red-500`, `bg-red-100`
- **Success**: `text-green-600`

---

## 4. Mock Data for Development (`src/utils/mockData.js`)

Since the backend isn't ready yet, use this mock data. Simply bypass the Axios calls in `api.js` and return these promises to develop the UI independently.

```javascript
export const mockSymptomsResponse = {
  success: true,
  data: {
    symptoms: [{ name: "knee pain", duration: "2 weeks", severity: "moderate" }],
    assessment: "Based on clinical case study analysis, this points towards early osteoarthritis.",
    recommendedSpecialist: "Orthopedic",
    confidence: 0.82,
    reasoning: "Persistent knee pain with swelling matching OA profiles.",
    caseStudyReference: "Osteoarthritis Case Study #3"
  }
};

export const mockDoctorsResponse = {
  success: true,
  data: {
    doctors: [
      {
        id: "doc1", name: "Dr. Ramesh Kumar", specialty: "Orthopedic", experience: 12, consultationFee: 500, rating: 4.5, clinicName: "Kumar Bone Clinic", location: { coordinates: [74.8425, 12.8714] }, availableSlots: [{ times: ["09:00", "10:00"] }]
      }
    ]
  }
};
```
*To toggle mock data:* Temporarily edit the functions in `api.js` to return `Promise.resolve(mockSymptomsResponse)` instead of `api.post(...)`.

---

## 5. Important Notes

- **JWT Token Key:** Always use `clinova_token` for `localStorage`.
- **API URL:** Comes from `import.meta.env.VITE_API_URL`.
- **Prescription Upload:** The FormData append key MUST be `'prescription'` (not `'file'`).
- **Symptom Request Body:** Send `{ symptoms: textValue }` exactly.
- **Voice API:** Powered by the browser (`window.SpeechRecognition`), no API call required. Just use the `useVoice` hook.
- **Diagnosis Navigation:** Pass the result forward using `navigate('/diagnosis', { state: { result: res.data } })`.
- **Leaflet:** Remember to import the CSS in `index.css`: `@import 'leaflet/dist/leaflet.css';`.

---

## 6. Testing Guide

1. **Testing with Mock Data:** Replace API exports in `api.js` with mock promises. Verify that the UI renders lists and handles state changes without errors.
2. **Testing Voice Input:** Use Google Chrome (safari/firefox support varies). Click the voice button, accept microphone permissions, speak, and verify the text appears in the textarea.
3. **Testing with Real Backend:** Ensure `backend` and `ai-service` are running locally. Ensure `VITE_API_URL` points to `http://localhost:5000/api`. Verify the full flow: Register -> Login -> Symptoms -> Diagnosis -> Book -> Summary.
