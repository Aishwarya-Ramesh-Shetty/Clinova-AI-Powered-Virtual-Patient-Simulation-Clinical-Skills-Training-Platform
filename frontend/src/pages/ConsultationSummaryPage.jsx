import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSummary } from '../services/api';

export default function ConsultationSummaryPage() {
  const { appointmentId } = useParams();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    getSummary(appointmentId).then(res => setSummary(res.data.summary)).catch(console.error);
  }, [appointmentId]);

  if(!summary) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 mt-8 bg-white shadow rounded-lg mb-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Consultation Summary</h1>
        <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded no-print">Print</button>
      </div>
      
      <div className="prose max-w-none">
        <h3 className="text-lg font-semibold">Chief Complaint</h3>
        <p>{summary.chiefComplaint}</p>
        
        <h3 className="text-lg font-semibold mt-4">Assessment</h3>
        <p>{summary.assessment}</p>

        <h3 className="text-lg font-semibold mt-4">Full Details</h3>
        {/* Render markdown summaryText if needed, here just basic text for demo */}
        <pre className="whitespace-pre-wrap font-sans text-sm bg-gray-50 p-4 border">{summary.summaryText}</pre>
      </div>
    </div>
  );
}
