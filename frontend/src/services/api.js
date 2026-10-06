import axios from 'axios';
import { mockSymptomsResponse, mockDoctorsResponse, mockSummaryResponse, mockPrescriptionResponse, mockAppointmentsResponse, mockPrescriptionsListResponse } from '../utils/mockData';

// Axios instance - baseURL from .env (VITE_API_URL)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach patient JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clinova_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 - clear and redirect
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

// Doctor portal uses a separate JWT (clinova_doctor_token)
const doctorApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});
doctorApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('clinova_doctor_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
doctorApi.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('clinova_doctor_token');
      window.location.href = '/doctor/login';
    }
    return Promise.reject(error.response?.data || { message: 'Something went wrong' });
  }
);

// Auth
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// Symptom Analysis - real backend -> AI service
export const analyzeSymptoms = (data) => api.post('/symptoms/analyze', data);

// Doctor Search - real API, falls back to demo doctors when no geolocation
export const searchDoctors = (params) => {
  if (params && params.lat && params.lng) {
    return api.get('/doctors/search', { params });
  }
  return api.get('/doctors/demo');
};
export const getDoctorById = (id) => api.get(`/doctors/${id}`);

// Appointments
export const bookAppointment = (data) => api.post('/appointments', data);
export const getAppointments = () => api.get('/appointments');
export const cancelAppointment = (id) => api.put(`/appointments/${id}/cancel`);

// Summary
export const generateSummary = (data) => api.post('/summary/generate', data);
export const getSummary = (appointmentId) => api.get(`/summary/${appointmentId}`);

// Prescriptions (multipart field name: 'prescription')
export const uploadPrescription = (formData) => api.post('/prescriptions/upload', formData);
export const getPrescriptions = () => api.get('/prescriptions');
export const getPrescriptionById = (id) => api.get(`/prescriptions/${id}`);

// Doctor Portal (uses clinova_doctor_token)
export const doctorLoginApi = (data) => api.post('/doctor-auth/login', data);
export const getDoctorAppointments = () => doctorApi.get('/doctor-portal/appointments');
export const updateAppointmentStatus = (id, status) => doctorApi.patch(`/doctor-portal/appointments/${id}/status`, { status });
export const getPatientHistory = (patientId) => doctorApi.get(`/doctor-portal/patients/${patientId}/history`);

export default api;