import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Loader from './Loader'

const DoctorProtectedRoute = () => {
  const { isDoctorAuthenticated, loading } = useAuth()

  if (loading) return <Loader />
  return isDoctorAuthenticated ? <Outlet /> : <Navigate to="/doctor/login" replace />
}

export default DoctorProtectedRoute
