import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDoctorById, bookAppointment } from '../services/api';
import toast from 'react-hot-toast';

export default function AppointmentBookingPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    getDoctorById(doctorId).then(res => setDoctor(res.data.doctor)).catch(console.error);
  }, [doctorId]);

  const handleBook = async () => {
    if(!date || !timeSlot) return toast.error('Please select date and time');
    try {
      await bookAppointment({ doctorId, date, timeSlot, notes });
      toast.success('Appointment Booked!');
      navigate('/appointments');
    } catch(err) {
      toast.error('Failed to book');
    }
  };

  if(!doctor) return <div>Loading...</div>;

  // Simplistic approach: just taking the first availableSlots object for demo
  const slots = doctor.availableSlots?.[0]?.times || [];

  return (
    <div className="max-w-2xl mx-auto p-4 mt-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-2">Book with {doctor.name}</h2>
        <p className="text-gray-600 mb-6">{doctor.specialty} | {doctor.clinicName}</p>

        <div className="mb-4">
          <label className="block font-semibold mb-2">Select Date</label>
          <input 
            type="date" 
            min={new Date().toISOString().split('T')[0]}
            value={date} 
            onChange={(e)=>setDate(e.target.value)}
            className="border rounded p-2 w-full"
          />
        </div>

        <div className="mb-4">
          <label className="block font-semibold mb-2">Select Time</label>
          <div className="flex flex-wrap gap-2">
            {slots.map(t => (
              <button 
                key={t}
                onClick={() => setTimeSlot(t)}
                className={`px-4 py-2 border rounded ${timeSlot === t ? 'bg-teal-600 text-white' : 'hover:bg-gray-50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block font-semibold mb-2">Notes (optional)</label>
          <textarea 
            value={notes} 
            onChange={(e)=>setNotes(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>

        <button onClick={handleBook} className="w-full bg-teal-600 text-white py-3 rounded font-bold hover:bg-teal-700">
          Confirm Booking (₹{doctor.consultationFee})
        </button>
      </div>
    </div>
  );
}
