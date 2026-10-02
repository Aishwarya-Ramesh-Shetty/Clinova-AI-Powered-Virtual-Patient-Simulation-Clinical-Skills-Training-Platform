import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeSymptoms, submitAssessmentAnswer, prepareAssessmentSession } from '../services/api';
import { useVoice } from '../hooks/useVoice';
import { FaMicrophone, FaStop } from 'react-icons/fa';
import toast from 'react-hot-toast';
import Loader from '../components/common/Loader';

export default function SymptomInputPage() {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isListening, transcript, startListening, stopListening, resetTranscript, error: voiceError } = useVoice();

  useEffect(() => {
    if (transcript) {
      setText((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  const handleAnalyze = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setError('Please enter your symptoms before continuing.');
      toast.error('Please enter your symptoms');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const backendLanguage = lang.split('-')[0] || 'en';
      const res = await analyzeSymptoms({ symptoms: trimmedText, language: backendLanguage });
      const createdSession = res.data?.session;

      if (!createdSession?.id || !Array.isArray(createdSession.questions)) {
        throw new Error('The backend did not return a valid assessment session.');
      }

      setSessionId(createdSession.id);
      setQuestions(createdSession.questions);
      setAnswers({});
      toast.success('Follow-up questions generated successfully.');
    } catch (err) {
      const message = err?.message || 'Unable to start the assessment right now.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSaveAnswer = async (questionId, questionText) => {
    const answer = (answers[questionId] || '').trim();
    if (!answer) {
      setError(`Please answer "${questionText}" before continuing.`);
      toast.error('Please provide an answer for each question.');
      return;
    }

    if (!sessionId) {
      setError('Please start a symptom assessment before answering questions.');
      return;
    }

    setSavingAnswer(true);
    setError('');

    try {
      await submitAssessmentAnswer(sessionId, { questionId, answer });
      toast.success('Answer saved');
    } catch (err) {
      const message = err?.message || 'Failed to save your answer.';
      setError(message);
      toast.error(message);
    } finally {
      setSavingAnswer(false);
    }
  };

  const handlePrepareAssessment = async () => {
    if (!sessionId) return;

    const unanswered = questions.filter((q) => !(answers[q.questionId] || '').trim());
    if (unanswered.length > 0) {
      setError('Please answer all questions before preparing the assessment.');
      toast.error('Please answer all questions before continuing.');
      return;
    }

    setPreparing(true);
    setError('');

    try {
      for (const question of questions) {
        const answer = (answers[question.questionId] || '').trim();
        if (!answer) {
          throw new Error(`Please answer "${question.question}" before preparing.`);
        }

        await submitAssessmentAnswer(sessionId, {
          questionId: question.questionId,
          answer
        });
      }

      const res = await prepareAssessmentSession(sessionId);
      const preparedSession = res.data?.session;

      if (!preparedSession) {
        throw new Error('The backend did not return prepared assessment data.');
      }

      navigate('/diagnosis', { state: { result: preparedSession, lang } });
    } catch (err) {
      const message = err?.message || 'Failed to prepare the clinical assessment.';
      setError(message);
      toast.error(message);
    } finally {
      setPreparing(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.questionId] || '').trim());

  return (
    <div className="max-w-3xl mx-auto p-4 mt-8">
      <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-6">
        <strong>Disclaimer:</strong> This tool provides AI-assisted intake and is NOT a substitute for professional medical advice.
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold mb-4">Describe your symptoms</h2>

        <div className="mb-4 flex gap-4 flex-wrap">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="border rounded p-2">
            <option value="en-US">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="kn-IN">Kannada</option>
          </select>
          <button
            onClick={isListening ? stopListening : () => startListening(lang)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-white ${isListening ? 'bg-red-500' : 'bg-teal-600'}`}
          >
            {isListening ? <><FaStop /> Stop</> : <><FaMicrophone /> Voice Input</>}
          </button>
        </div>

        {(error || voiceError) && <p className="text-red-500 mb-2">{error || voiceError}</p>}

        <textarea
          className="w-full h-40 border rounded-md p-4 mb-4 focus:ring-2 focus:ring-teal-500"
          placeholder="e.g., I have a sore throat and fever for two days."
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

      {questions.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
          <h3 className="text-lg font-bold mb-4">Follow-up questions</h3>

          {questions.map((question) => (
            <div key={question.questionId} className="mb-5 border rounded p-4 bg-gray-50">
              <p className="font-medium text-gray-800 mb-2">{question.question}</p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={answers[question.questionId] || ''}
                  onChange={(e) => handleAnswerChange(question.questionId, e.target.value)}
                  placeholder="Type your answer"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => handleSaveAnswer(question.questionId, question.question)}
                  disabled={savingAnswer}
                  className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={handlePrepareAssessment}
            disabled={!allAnswered || preparing}
            className="w-full bg-indigo-600 text-white py-3 rounded-md font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {preparing ? 'Preparing your clinical information...' : 'Prepare Assessment'}
          </button>
        </div>
      )}
    </div>
  );
}
