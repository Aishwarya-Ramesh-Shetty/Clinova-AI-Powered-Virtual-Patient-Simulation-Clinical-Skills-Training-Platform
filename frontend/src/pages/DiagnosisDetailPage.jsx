import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAssessmentSession } from '../services/api';
import DiagnosisSummaryView from '../components/common/DiagnosisSummaryView';

export default function DiagnosisDetailPage() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAssessmentSession(sessionId)
      .then((res) => setSession(res.data.session))
      .catch((err) => setError(err?.message || 'Could not load diagnosis summary.'));
  }, [sessionId]);

  if (error) return <div className="p-10 text-center text-red-600">{error}</div>;
  if (!session) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 mt-8 bg-white shadow rounded-lg mb-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Diagnosis Summary</h1>
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded no-print">Print</button>
      </div>
      {session.clinicalAssessment ? (
        <DiagnosisSummaryView session={session} />
      ) : (
        <p className="text-gray-700">This assessment was not completed, so there is no summary to show.</p>
      )}
      <div className="mt-6">
        <Link to="/diagnosis-history" className="text-teal-600 underline">← Back to Diagnosis History</Link>
      </div>
    </div>
  );
}
