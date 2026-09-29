import { Link } from 'react-router-dom';

export default function DoctorDashboardPage() {
  return (
    <div className="max-w-5xl mx-auto p-4 mt-8">
      <h2 className="text-2xl font-bold mb-6">Doctor Dashboard</h2>
      <div className="bg-white p-6 shadow rounded-lg">
        <h3 className="text-xl font-semibold mb-4">Upcoming Appointments</h3>
        <p className="text-gray-600">No appointments for today.</p>
        
        {/* Mock patient link for demo */}
        <div className="mt-8">
          <Link to="/doctor/patients/123/history" className="text-teal-600 underline">View Patient History Demo (ID: 123)</Link>
        </div>
      </div>
    </div>
  );
}
