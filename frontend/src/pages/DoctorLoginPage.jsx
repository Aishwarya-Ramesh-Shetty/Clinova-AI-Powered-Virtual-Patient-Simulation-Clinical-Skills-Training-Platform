import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function DoctorLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Mock login for doctor portal
      toast.success('Doctor Logged in successfully');
      navigate('/doctor/dashboard');
    } catch (err) {
      toast.error('Login failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md border-t-4 border-teal-600">
      <h2 className="text-2xl font-bold mb-6 text-center text-teal-700">Doctor Portal Login</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700">Email</label>
          <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-gray-700">Password</label>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required className="w-full border rounded px-3 py-2" />
        </div>
        <button type="submit" className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700">Login as Doctor</button>
      </form>
    </div>
  );
}
