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
