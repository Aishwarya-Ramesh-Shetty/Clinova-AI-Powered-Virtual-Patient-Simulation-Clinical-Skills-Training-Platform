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
