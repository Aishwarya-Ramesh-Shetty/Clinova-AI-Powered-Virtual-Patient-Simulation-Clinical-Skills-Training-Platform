import { useState, useEffect } from 'react';
import { getAppointments, cancelAppointment } from '../services/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = async () => {
    try {
      const res = await getAppointments();
      setAppointments(res.data.appointments || []);
    } catch (err) {
      toast.error(err?.message || 'Could not load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApps(); }, []);

  const handleCancel = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await cancelAppointment(id);
        toast.success('Cancelled');
        fetchApps();
      } catch (err) {
        toast.error(err?.message || 'Could not cancel appointment');
      }
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
              {app.doctor.clinicName && <p className="text-gray-500 text-sm">{app.doctor.clinicName}</p>}
              <p className="text-gray-600">{new Date(`${app.date}T00:00:00`).toLocaleDateString()} at {app.timeSlot}</p>
              {app.notes && <p className="text-gray-500 text-sm mt-1">Notes: {app.notes}</p>}
              <span className={`inline-block mt-2 px-2 py-1 text-xs font-bold rounded ${STATUS_STYLES[app.status] || 'bg-gray-100 text-gray-800'}`}>
                {app.status.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {['pending', 'confirmed'].includes(app.status) && (
                <button onClick={() => handleCancel(app.id)} className="text-red-500 text-sm border border-red-500 px-3 py-1 rounded hover:bg-red-50">Cancel</button>
              )}
              <Link to={`/summary/${app.id}`} className="text-teal-600 text-sm border border-teal-600 px-3 py-1 rounded hover:bg-teal-50 text-center">Summary</Link>
            </div>
          </div>
        ))}
        {!loading && appointments.length === 0 && <p>No appointments found.</p>}
      </div>
    </div>
  );
}
