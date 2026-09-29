import { useState, useEffect } from 'react';
import { getAppointments, cancelAppointment } from '../services/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);

  const fetchApps = async () => {
    const res = await getAppointments();
    setAppointments(res.data.appointments);
  };

  useEffect(() => { fetchApps(); }, []);

  const handleCancel = async (id) => {
    if(window.confirm('Are you sure?')) {
      await cancelAppointment(id);
      toast.success('Cancelled');
      fetchApps();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 mt-8">
      <h2 className="text-2xl font-bold mb-6">My Appointments</h2>
      <div className="space-y-4">
        {appointments.map(app => (
          <div key={app.id} className="bg-white p-4 rounded shadow flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">{app.doctor.name} ({app.doctor.specialty})</h3>
              <p className="text-gray-600">{new Date(app.date).toLocaleDateString()} at {app.timeSlot}</p>
              <span className={`inline-block mt-2 px-2 py-1 text-xs font-bold rounded ${app.status === 'booked' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                {app.status.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {app.status === 'booked' && (
                <button onClick={() => handleCancel(app.id)} className="text-red-500 text-sm border border-red-500 px-3 py-1 rounded hover:bg-red-50">Cancel</button>
              )}
              <Link to={`/summary/${app.id}`} className="text-teal-600 text-sm border border-teal-600 px-3 py-1 rounded hover:bg-teal-50 text-center">Summary</Link>
            </div>
          </div>
        ))}
        {appointments.length === 0 && <p>No appointments found.</p>}
      </div>
    </div>
  );
}
