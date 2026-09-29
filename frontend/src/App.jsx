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
import DoctorLoginPage from './pages/DoctorLoginPage'
import DoctorDashboardPage from './pages/DoctorDashboardPage'
import PatientHistoryPage from './pages/PatientHistoryPage'

function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/doctor/login" element={<DoctorLoginPage />} />
          
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

          {/* Doctor Portal Routes (Create a separate ProtectedRoute for doctors) */}
          <Route path="/doctor/dashboard" element={<DoctorDashboardPage />} />
          <Route path="/doctor/patients/:patientId/history" element={<PatientHistoryPage />} />
        </Routes>
      </main>
      <Footer />
      <Toaster position="top-right" />
    </div>
  )
}

export default App
