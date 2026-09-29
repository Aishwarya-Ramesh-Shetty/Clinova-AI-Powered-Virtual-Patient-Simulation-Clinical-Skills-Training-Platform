import { useLocation, useNavigate } from 'react-router-dom';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
import { useState } from 'react';
import { generateSummary } from '../services/api';
import toast from 'react-hot-toast';

export default function DiagnosisResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSpeaking, speak, stop } = useSpeechSynthesis();
  const [summary, setSummary] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const result = location.state?.result;
  const lang = location.state?.lang || 'en-US';

  if (!result) {
    return <div className="text-center mt-10">No results found. <button onClick={() => navigate('/symptoms')} className="text-teal-600 underline">Go back</button></div>;
  }

  const { symptoms, assessment, recommendedSpecialist, confidence, reasoning, caseStudyReference } = result;

  const handleSpeak = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(assessment, lang);
    }
  };

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    try {
      const res = await generateSummary({
        symptoms,
        assessment,
        recommendedSpecialist,
        additionalNotes: ''
      });
      setSummary(res.data.summary);
      toast.success('Summary generated successfully');
    } catch (error) {
      toast.error('Failed to generate summary');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 mt-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">AI Clinical Assessment</h1>
        <button 
          onClick={handleSpeak}
          className="flex items-center gap-2 bg-teal-100 text-teal-800 px-4 py-2 rounded font-bold hover:bg-teal-200"
        >
          {isSpeaking ? <><FaVolumeMute /> Stop Audio</> : <><FaVolumeUp /> Read Aloud</>}
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Identified Symptoms:</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {symptoms.map((s, idx) => (
              <span key={idx} className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-sm">
                {s.name} ({s.severity}, {s.duration})
              </span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="font-semibold text-gray-700">Assessment:</h3>
          <p className="text-gray-800 mt-1">{assessment}</p>
        </div>

        <div className="mb-4 bg-gray-50 p-4 rounded border">
          <h3 className="font-semibold text-gray-700">Recommended Specialist:</h3>
          <p className="text-xl font-bold text-teal-700 mt-1">{recommendedSpecialist}</p>
        </div>

        <details className="mb-4 bg-gray-50 p-4 rounded border">
          <summary className="font-semibold text-gray-700 cursor-pointer">AI Reasoning & References (Confidence: {Math.round(confidence * 100)}%)</summary>
          <div className="mt-2 text-sm text-gray-600">
            <p><strong>Reasoning:</strong> {reasoning}</p>
            <p className="mt-2"><strong>Case Study Ref:</strong> {caseStudyReference}</p>
          </div>
        </details>
      </div>

      <div className="mb-6">
        <button
          onClick={handleGenerateSummary}
          disabled={isGenerating}
          className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isGenerating ? <span className="animate-pulse">Generating Summary...</span> : 'Generate Consultation Summary'}
        </button>
      </div>

      {summary && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6 border border-teal-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Consultation Summary</h2>
            <button 
              onClick={() => window.print()}
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded font-semibold hover:bg-gray-300"
            >
              Print
            </button>
          </div>
          
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700">Chief Complaint:</h3>
            <p className="text-gray-800 mt-1">{summary.chiefComplaint}</p>
          </div>
          
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700">Assessment:</h3>
            <p className="text-gray-800 mt-1">{summary.assessment}</p>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-700">Full Summary:</h3>
            <pre className="whitespace-pre-wrap font-sans text-gray-800 mt-2 bg-gray-50 p-4 rounded border">
              {summary.summaryText}
            </pre>
          </div>
        </div>
      )}

      <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-6 font-semibold text-center">
        This is AI-assisted analysis. Please consult a qualified doctor.
      </div>

      <div className="flex gap-4">
        <button 
          onClick={() => navigate(`/doctors?specialty=${encodeURIComponent(recommendedSpecialist)}`)}
          className="flex-1 bg-teal-600 text-white py-3 rounded hover:bg-teal-700 font-bold"
        >
          Find Nearby {recommendedSpecialist}s
        </button>
      </div>
    </div>
  );
}
