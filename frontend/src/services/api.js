import axios from 'axios';
import { mockSymptomsResponse, mockDoctorsResponse, mockSummaryResponse, mockPrescriptionResponse, mockAppointmentsResponse, mockPrescriptionsListResponse } from '../utils/mockData';

// ─────────────────────────────────────────────────────────
// Axios instance — baseURL from .env (VITE_API_URL)
// ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clinova_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 — clear token and redirect to login
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

export const analyzeSymptoms = (data) => Promise.resolve(mockSymptomsResponse); // body: { symptoms: 'text' }

export const searchDoctors = (params) => Promise.resolve(mockDoctorsResponse);
export const getDoctorById = (id) => Promise.resolve({ data: { doctor: mockDoctorsResponse.data.doctors[0] } });

export const bookAppointment = (data) => Promise.resolve({ data: { appointment: { status: 'booked' } } }); // body: { doctorId, date, timeSlot, notes }
export const getAppointments = () => Promise.resolve(mockAppointmentsResponse);
export const cancelAppointment = (id) => Promise.resolve({ data: {} });

export const generateSummary = (data) => Promise.resolve(mockSummaryResponse);
export const getSummary = (appointmentId) => Promise.resolve(mockSummaryResponse);

export const uploadPrescription = (formData) => Promise.resolve(mockPrescriptionResponse); // formData must have key 'prescription'
export const getPrescriptions = () => Promise.resolve(mockPrescriptionsListResponse);
export const getPrescriptionById = (id) => Promise.resolve({ success: true, data: { prescription: mockPrescriptionsListResponse.data.prescriptions[0] } });


// Doctor portal auth � real API call
export const doctorLoginApi = (data) => api.post('/doctor-auth/login', data);

export default api;
