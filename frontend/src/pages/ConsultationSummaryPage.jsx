import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAppointmentSummary } from '../services/api';
import DiagnosisSummaryView from '../components/common/DiagnosisSummaryView';

// Appointment "Summary" page: shows the SAVED assessment linked to the appointment.
export default function ConsultationSummaryPage() {
  const { appointmentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAppointmentSummary(appointmentId)
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.message || 'Could not load summary.'));
  }, [appointmentId]);

  if (error) return <div className="p-10 text-center text-red-600">{error}</div>;
  if (!data) return <div className="p-10 text-center">Loading...</div>;

  const { appointment, session } = data;

  return (
    <div className="max-w-3xl mx-auto p-8 mt-8 bg-white shadow rounded-lg mb-10">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold">Appointment Summary</h1>
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded no-print">Print</button>
      </div>
      <p className="text-gray-600 mb-6">
        {appointment.doctor.name} ({appointment.doctor.specialty}) · {new Date(`${appointment.date}T00:00:00`).toLocaleDateString()} at {appointment.timeSlot}
      </p>

      {session ? (
        <DiagnosisSummaryView session={session} />
      ) : (
        <div className="bg-gray-50 border rounded p-6 text-gray-700">
          <p className="font-medium">No diagnosis summary is linked to this appointment.</p>
          <p className="text-sm mt-1">
            Appointments booked without completing a symptom assessment have no summary. You can{' '}
            <Link to="/symptoms" className="text-teal-600 underline">start a new assessment</Link> or review{' '}
            <Link to="/diagnosis-history" className="text-teal-600 underline">your Diagnosis History</Link>.
          </p>
        </div>
      )}

      <div className="mt-6">
        <Link to="/appointments" className="text-teal-600 underline">← Back to My Appointments</Link>
      </div>
    </div>
  );
}
