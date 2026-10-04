import axios from 'axios';
import { mockSummaryResponse, mockAppointmentsResponse } from '../utils/mockData';

// ─────────────────────────────────────────────────────────
// Axios instance — baseURL from .env (VITE_API_URL)
// ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// Attach the correct JWT: doctor token for /doctor-auth endpoints, patient token otherwise
const isDoctorUrl = (url = '') => url.startsWith('/doctor-auth');
const isLoginUrl = (url = '') => url.endsWith('/login') || url.endsWith('/register');

api.interceptors.request.use((config) => {
  const token = isDoctorUrl(config.url)
    ? localStorage.getItem('clinova_doctor_token')
    : localStorage.getItem('clinova_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 (from a non-login request) — clear the relevant token and redirect to its login page
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !isLoginUrl(url)) {
      if (isDoctorUrl(url)) {
        localStorage.removeItem('clinova_doctor_token');
        window.location.href = '/doctor/login';
      } else {
        localStorage.removeItem('clinova_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error.response?.data || { message: 'Something went wrong' });
  }
);

export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

export const analyzeSymptoms = (data) => api.post('/symptoms/sessions', data);
export const createAssessmentSession = (data) => api.post('/symptoms/sessions', data);
export const submitAssessmentAnswer = (sessionId, data) => api.post(`/symptoms/sessions/${sessionId}/answers`, data);
export const prepareAssessmentSession = (sessionId) => api.post(`/symptoms/sessions/${sessionId}/prepare`);
export const assessSession = (sessionId) => api.post(`/symptoms/sessions/${sessionId}/assess`);
export const getAssessmentSession = (sessionId) => api.get(`/symptoms/sessions/${sessionId}`);
export const getDiagnosisHistory = () => api.get('/symptoms/history');
export const getAppointmentSummary = (appointmentId) => api.get(`/appointments/${appointmentId}/summary`);

export const searchDoctors = (params) => api.get('/doctors/search', { params });
// Demo providers — always-visible local MongoDB records (no geolocation / no Groq)
export const getDemoDoctors = () => api.get('/doctors/demo');
export const getDoctorById = (id) => api.get(`/doctors/${id}`);

export const bookAppointment = (data) => api.post('/appointments', data); // body: { doctorId, date, timeSlot, notes }
export const getAppointments = () => api.get('/appointments');
export const getBookedSlots = (params) => api.get('/appointments/booked', { params });
export const cancelAppointment = (id) => api.patch(`/appointments/${id}/cancel`);

export const generateSummary = (data) => Promise.resolve(mockSummaryResponse);
export const getSummary = (appointmentId) => Promise.resolve(mockSummaryResponse);

// Prescriptions — real API. Never set Content-Type manually for these: axios
// must generate the multipart boundary for the FormData upload itself.
export const uploadPrescription = (formData) => api.post('/prescriptions', formData); // formData must have key 'prescription'
export const getPrescriptions = () => api.get('/prescriptions');
export const getPrescriptionById = (id) => api.get(`/prescriptions/${id}`);

// Doctor portal auth — real API call
export const doctorLoginApi = (data) => api.post('/doctor-auth/login', data);
export const getDoctorAppointments = () => api.get('/doctor-auth/appointments');
export const updateDoctorAppointmentStatus = (id, status) => api.patch(`/doctor-auth/appointments/${id}/status`, { status });

export default api;
