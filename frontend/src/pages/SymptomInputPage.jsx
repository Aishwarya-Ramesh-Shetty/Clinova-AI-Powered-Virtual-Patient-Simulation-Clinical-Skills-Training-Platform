import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeSymptoms } from '../services/api';
import { useVoice } from '../hooks/useVoice';
import { FaMicrophone, FaStop } from 'react-icons/fa';
import toast from 'react-hot-toast';
import Loader from '../components/common/Loader';

export default function SymptomInputPage() {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isListening, transcript, startListening, stopListening, resetTranscript, error } = useVoice();

  useEffect(() => {
    if (transcript) {
      setText((prev) => prev + ' ' + transcript);
      resetTranscript();
    }
  }, [transcript]);

  const handleAnalyze = async () => {
    if (!text.trim()) return toast.error('Please enter symptoms');
    setLoading(true);
    try {
      const res = await analyzeSymptoms({ symptoms: text, language: lang });
      navigate('/diagnosis', { state: { result: res.data, lang } });
    } catch (err) {
      toast.error('Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 mt-8">
      <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-6">
        <strong>Disclaimer:</strong> This tool provides AI-assisted analysis and is NOT a substitute for professional medical advice.
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold mb-4">Describe your symptoms</h2>
        
        <div className="mb-4 flex gap-4">
          <select value={lang} onChange={(e)=>setLang(e.target.value)} className="border rounded p-2">
            <option value="en-US">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="kn-IN">Kannada</option>
          </select>
          <button 
            onClick={isListening ? stopListening : () => startListening(lang)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-white ${isListening ? 'bg-red-500' : 'bg-teal-600'}`}
          >
            {isListening ? <><FaStop/> Stop</> : <><FaMicrophone/> Voice Input</>}
          </button>
        </div>
        
        {error && <p className="text-red-500 mb-2">{error}</p>}

        <textarea
          className="w-full h-40 border rounded-md p-4 mb-4 focus:ring-2 focus:ring-teal-500"
          placeholder="e.g., I have been having knee pain for 2 weeks..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        
        <button 
          onClick={handleAnalyze} 
          disabled={loading}
          className="w-full bg-teal-600 text-white py-3 rounded-md font-bold hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? <Loader /> : 'Analyze Symptoms'}
        </button>
      </div>
    </div>
  );
}
