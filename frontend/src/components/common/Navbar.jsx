import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const { isAuthenticated, logout, user, isDoctorAuthenticated, doctorLogout, doctor } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDoctorLogout = () => {
    doctorLogout();
    navigate('/doctor/login');
  };

  return (
    <nav className="bg-teal-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-wider">Clinova</Link>
        <div className="flex gap-4 items-center">
          {isDoctorAuthenticated ? (
            <>
              <Link to="/doctor/dashboard" className="hover:text-teal-200">Doctor Dashboard</Link>
              <button onClick={handleDoctorLogout} className="bg-teal-700 px-3 py-1 rounded hover:bg-teal-800">Logout</button>
            </>
          ) : isAuthenticated ? (
            <>
              <Link to="/" className="hover:text-teal-200">Home</Link>
              <Link to="/symptoms" className="hover:text-teal-200">Symptoms</Link>
              <Link to="/appointments" className="hover:text-teal-200">Appointments</Link>
              <Link to="/diagnosis-history" className="hover:text-teal-200">Diagnosis History</Link>
              <Link to="/prescriptions" className="hover:text-teal-200">Prescription Vault</Link>
              <Link to="/profile" className="font-semibold">Profile</Link>
              <button onClick={handleLogout} className="bg-teal-700 px-3 py-1 rounded hover:bg-teal-800">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:text-teal-200">Login</Link>
              <Link to="/register" className="bg-teal-700 px-3 py-1 rounded hover:bg-teal-800">Register</Link>
              <Link to="/doctor/login" className="hover:text-teal-200">Doctor Login</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
