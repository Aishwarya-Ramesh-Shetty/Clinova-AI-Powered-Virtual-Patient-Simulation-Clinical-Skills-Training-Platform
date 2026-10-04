import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getDoctorAppointments, updateDoctorAppointmentStatus } from '../services/api';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

// Allowed doctor actions per current status (mirrors backend transitions)
const ACTIONS = {
  pending: [
    { to: 'confirmed', label: 'Confirm', cls: 'bg-teal-600 text-white hover:bg-teal-700' },
    { to: 'cancelled', label: 'Cancel', cls: 'border border-red-500 text-red-600 hover:bg-red-50' }
  ],
  confirmed: [
    { to: 'completed', label: 'Mark Completed', cls: 'bg-green-600 text-white hover:bg-green-700' },
    { to: 'cancelled', label: 'Cancel', cls: 'border border-red-500 text-red-600 hover:bg-red-50' }
  ],
  completed: [],
  cancelled: []
};

export default function DoctorDashboardPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = async () => {
    try {
      const res = await getDoctorAppointments();
      setAppointments(res.data.appointments || []);
    } catch (err) {
      toast.error(err?.message || 'Could not load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApps(); }, []);

  const changeStatus = async (id, status) => {
    try {
      await updateDoctorAppointmentStatus(id, status);
      toast.success(`Appointment ${status}`);
      fetchApps();
    } catch (err) {
      toast.error(err?.message || 'Could not update status');
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 mt-8">
      <h2 className="text-2xl font-bold mb-6">Doctor Dashboard</h2>
      <div className="bg-white p-6 shadow rounded-lg">
        <h3 className="text-xl font-semibold mb-4">Appointments</h3>
        {loading && <p className="text-gray-600">Loading...</p>}
        {!loading && appointments.length === 0 && <p className="text-gray-600">No appointments booked yet.</p>}

        <div className="space-y-4">
          {appointments.map((app) => (
            <div key={app.id} className="border rounded p-4 flex justify-between items-start gap-4">
              <div>
                <h4 className="font-bold text-lg">{app.patient.name}</h4>
                <p className="text-sm text-gray-500">
                  {app.patient.email}{app.patient.phone ? ` · ${app.patient.phone}` : ''}
                </p>
                <p className="text-gray-700 mt-1">
                  {new Date(`${app.date}T00:00:00`).toLocaleDateString()} at {app.timeSlot}
                </p>
                <p className="text-gray-600 text-sm mt-1">Notes: {app.notes || '—'}</p>
                <span className={`inline-block mt-2 px-2 py-1 text-xs font-bold rounded ${STATUS_STYLES[app.status] || 'bg-gray-100 text-gray-800'}`}>
                  {app.status.toUpperCase()}
                </span>
              </div>
              <div className="flex flex-col gap-2 min-w-[140px]">
                {ACTIONS[app.status]?.map((a) => (
                  <button key={a.to} onClick={() => changeStatus(app.id, a.to)} className={`text-sm px-3 py-1 rounded ${a.cls}`}>
                    {a.label}
                  </button>
                ))}
                <Link to={`/doctor/patients/${app.patient.id}/history`} className="text-teal-600 text-sm underline text-center">
                  Patient History
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
