import { useParams } from 'react-router-dom';

export default function PatientHistoryPage() {
  const { patientId } = useParams();

  return (
    <div className="max-w-5xl mx-auto p-4 mt-8">
      <h2 className="text-2xl font-bold mb-6">Patient History (ID: {patientId})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 shadow rounded-lg border-l-4 border-teal-600">
          <h3 className="text-xl font-semibold mb-4">Past Prescriptions</h3>
          <p className="text-gray-600">No past prescriptions found.</p>
        </div>
        <div className="bg-white p-6 shadow rounded-lg border-l-4 border-blue-600">
          <h3 className="text-xl font-semibold mb-4">Consultation Summaries</h3>
          <p className="text-gray-600">No past summaries found.</p>
        </div>
      </div>
    </div>
  );
}
