import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getDiagnosisHistory } from '../services/api';

const TRIAGE_STYLES = {
  emergency: 'bg-red-100 text-red-800',
  urgent: 'bg-orange-100 text-orange-800',
  routine: 'bg-green-100 text-green-800'
};

export default function DiagnosisHistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDiagnosisHistory()
      .then((res) => setHistory(res.data.history || []))
      .catch((err) => toast.error(err?.message || 'Could not load diagnosis history'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 mt-8">
      <h2 className="text-2xl font-bold mb-6">Diagnosis History</h2>
      {loading && <p>Loading...</p>}
      {!loading && history.length === 0 && (
        <p className="text-gray-600">
          No saved diagnoses yet. <Link to="/symptoms" className="text-teal-600 underline">Start a symptom assessment</Link>.
        </p>
      )}
      <div className="space-y-4">
        {history.map((h) => (
          <div key={h.id} className="bg-white p-4 rounded shadow">
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <p className="text-sm text-gray-500">{new Date(h.assessedAt).toLocaleString()}</p>
                <p className="font-semibold text-gray-900 mt-1 break-words">{h.initialSymptoms}</p>
                <p className="text-gray-700 mt-2">
                  <span className="font-medium">Possible conditions:</span>{' '}
                  {h.possibleConditions.length ? h.possibleConditions.join(', ') : 'None returned'}
                </p>
                <p className="text-gray-700 mt-1">
                  <span className="font-medium">Recommended specialist:</span> {h.recommendedSpecialist?.specialty || 'Not specified'}
                </p>
                <span className={`inline-block mt-2 px-2 py-1 text-xs font-bold rounded ${TRIAGE_STYLES[h.triage?.level] || 'bg-gray-100 text-gray-800'}`}>
                  TRIAGE: {(h.triage?.level || 'routine').toUpperCase()}
                </span>
              </div>
              <Link
                to={`/diagnosis-history/${h.id}`}
                className="shrink-0 text-teal-600 text-sm border border-teal-600 px-3 py-1 rounded hover:bg-teal-50"
              >
                View Full Summary
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
