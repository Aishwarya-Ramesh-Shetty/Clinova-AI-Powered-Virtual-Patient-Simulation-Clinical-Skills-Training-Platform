import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getDoctorById, bookAppointment, getBookedSlots } from '../services/api';
import toast from 'react-hot-toast';

const todayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AppointmentBookingPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Optional link to the patient's SAVED assessment for this booking (diagnosis exists independently).
  const assessmentSessionId = (searchParams.get('sessionId') || '').trim();
  const [doctor, setDoctor] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [booked, setBooked] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getDoctorById(doctorId)
      .then((res) => setDoctor(res.data.doctor))
      .catch((err) => setLoadError(err?.message || 'Could not load doctor.'));
  }, [doctorId]);

  const loadBooked = () =>
    getBookedSlots({ doctorId })
      .then((res) => setBooked(res.data.booked || []))
      .catch(() => setBooked([]));

  useEffect(() => { loadBooked(); }, [doctorId]);

  const handleBook = async () => {
    if (!date || !timeSlot) return toast.error('Please select date and time');
    setSubmitting(true);
    try {
      await bookAppointment({
        doctorId,
        date,
        timeSlot,
        notes,
        ...(assessmentSessionId ? { assessmentSessionId } : {})
      });
      toast.success('Appointment booked!');
      navigate('/appointments');
    } catch (err) {
      toast.error(err?.message || 'Failed to book appointment');
      setTimeSlot('');
      loadBooked();
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <div className="max-w-2xl mx-auto p-4 mt-8 text-red-600">{loadError}</div>;
  if (!doctor) return <div className="max-w-2xl mx-auto p-4 mt-8">Loading...</div>;

  const today = todayString();
  const availableDays = (doctor.availableSlots || [])
    .filter((s) => s.date >= today && (s.times || []).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const selectedDay = availableDays.find((s) => s.date === date);
  const takenTimes = new Set(booked.filter((b) => b.date === date).map((b) => b.timeSlot));

  return (
    <div className="max-w-2xl mx-auto p-4 mt-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-2">
          Book with {doctor.name}
          {(doctor.isDemo || doctor.demoProvider) && (
            <span className="ml-2 align-middle px-2 py-0.5 text-xs font-bold rounded bg-teal-100 text-teal-800 border border-teal-200">Demo Provider</span>
          )}
        </h2>
        <p className="text-gray-600 mb-6">{doctor.specialty} | {doctor.clinicName}</p>

        <div className="mb-4">
          <label className="block font-semibold mb-2">Select Date</label>
          {availableDays.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming availability for this doctor.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableDays.map((s) => (
                <button
                  key={s.date}
                  type="button"
                  onClick={() => { setDate(s.date); setTimeSlot(''); }}
                  className={`px-4 py-2 border rounded ${date === s.date ? 'bg-teal-600 text-white' : 'hover:bg-gray-50'}`}
                >
                  {new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block font-semibold mb-2">Select Time</label>
          {!selectedDay ? (
            <p className="text-sm text-gray-500">Choose a date first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedDay.times.map((t) => {
                const taken = takenTimes.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={taken}
                    onClick={() => setTimeSlot(t)}
                    className={`px-4 py-2 border rounded ${
                      taken ? 'bg-gray-100 text-gray-400 line-through cursor-not-allowed'
                        : timeSlot === t ? 'bg-teal-600 text-white' : 'hover:bg-gray-50'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-6">
          <label className="block font-semibold mb-2">Notes (optional)</label>
          <textarea
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>

        <button
          onClick={handleBook}
          disabled={submitting || !date || !timeSlot}
          className="w-full bg-teal-600 text-white py-3 rounded font-bold hover:bg-teal-700 disabled:opacity-50"
        >
          {submitting ? 'Booking...' : `Confirm Booking (₹${doctor.consultationFee})`}
        </button>
      </div>
    </div>
  );
}
