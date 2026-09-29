import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
      <h1 className="text-6xl font-bold text-teal-600 mb-4">404</h1>
      <p className="text-xl text-gray-700 mb-6">Page not found</p>
      <p className="text-gray-500 mb-6">Redirecting you home in 3 seconds...</p>
      <button 
        onClick={() => navigate('/')} 
        className="bg-teal-600 text-white px-6 py-2 rounded hover:bg-teal-700"
      >
        Go Home Now
      </button>
    </div>
  );
}
