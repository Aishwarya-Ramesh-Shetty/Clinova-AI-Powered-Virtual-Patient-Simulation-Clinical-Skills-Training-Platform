import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeSymptoms, submitAssessmentAnswer, prepareAssessmentSession, assessSession } from '../services/api';
import { useVoice } from '../hooks/useVoice';
import { FaMicrophone, FaStop, FaVolumeUp } from 'react-icons/fa';
import toast from 'react-hot-toast';
import Loader from '../components/common/Loader';

export default function SymptomInputPage() {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [answers, setAnswers] = useState({});
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [preparedSessionId, setPreparedSessionId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isListening, transcript, startListening, stopListening, resetTranscript, error: voiceError } = useVoice();

  const currentQuestion = questions[currentQuestionIndex] || null;
  const isLastQuestion = questions.length > 0 && currentQuestionIndex === questions.length - 1;

  useEffect(() => {
    if (!transcript) return;

    const appendTranscript = (previousValue) => {
      const separator = previousValue && !previousValue.endsWith(' ') ? ' ' : '';
      return `${previousValue}${separator}${transcript}`;
    };

    if (currentQuestion) {
      setCurrentAnswer(appendTranscript);
    } else {
      setText(appendTranscript);
    }

    resetTranscript();
  }, [transcript]);

  useEffect(() => {
    if (!currentQuestion) return;

    const speakQuestion = () => {
      if (!('speechSynthesis' in window)) {
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentQuestion.question);
      const voices = window.speechSynthesis.getVoices();
      const preferredLanguage = lang.startsWith('hi') ? 'hi-IN' : lang.startsWith('kn') ? 'kn-IN' : 'en-IN';
      const preferredVoice = voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(preferredLanguage.toLowerCase()))
        || voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0]))
        || voices[0];

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      utterance.lang = preferredLanguage;
      window.speechSynthesis.speak(utterance);
    };

    speakQuestion();

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [currentQuestion, lang]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    stopListening();
    resetTranscript();
    setCurrentAnswer('');
  }, [currentQuestionIndex]);

  useEffect(() => {
    return () => {
      stopListening();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakCurrentQuestion = () => {
    if (!currentQuestion || !('speechSynthesis' in window)) {
      if (!('speechSynthesis' in window)) {
        setError('Speech synthesis is not available in this browser.');
      }
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQuestion.question);
    const voices = window.speechSynthesis.getVoices();
    const preferredLanguage = lang.startsWith('hi') ? 'hi-IN' : lang.startsWith('kn') ? 'kn-IN' : 'en-IN';
    const preferredVoice = voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(preferredLanguage.toLowerCase()))
      || voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0]))
      || voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.lang = preferredLanguage;
    window.speechSynthesis.speak(utterance);
  };

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
      setCurrentQuestionIndex(0);
      setCurrentAnswer('');
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

  const handleNext = async () => {
    if (!currentQuestion || !sessionId) {
      setError('Please start an assessment before answering questions.');
      return;
    }

    const answer = currentAnswer.trim();
    if (!answer) {
      setError('Please provide an answer before continuing.');
      toast.error('Please provide an answer before continuing.');
      return;
    }

    setSubmittingAnswer(true);
    setError('');

    try {
      if (preparedSessionId !== sessionId) {
        await submitAssessmentAnswer(sessionId, {
          questionId: currentQuestion.questionId,
          answer
        });

        setAnswers((prev) => ({ ...prev, [currentQuestion.questionId]: answer }));

        if (!isLastQuestion) {
          setCurrentQuestionIndex((prev) => prev + 1);
          setCurrentAnswer('');
          toast.success('Answer saved');
          return;
        }

        setPreparing(true);
        const preparedResponse = await prepareAssessmentSession(sessionId);
        if (!preparedResponse.data?.session) {
          throw new Error('The backend did not return prepared assessment data.');
        }
        setPreparedSessionId(sessionId);
      }

      setPreparing(false);
      setAssessing(true);
      const assessmentResponse = await assessSession(sessionId);
      const assessedSession = assessmentResponse.data?.session;

      if (!assessedSession?.clinicalAssessment) {
        throw new Error('The backend did not return clinical assessment data.');
      }

      navigate('/diagnosis', { state: { result: assessedSession, lang } });
    } catch (err) {
      const message = err?.message || 'Failed to complete the clinical assessment. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmittingAnswer(false);
      setPreparing(false);
      setAssessing(false);
    }
  };

  const questionCount = questions.length;
  const currentStepLabel = questionCount > 0 ? `${currentQuestionIndex + 1} / ${questionCount}` : '0 / 0';

  return (
    <div className="max-w-3xl mx-auto p-4 mt-8">
      <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-6">
        <strong>Disclaimer:</strong> This tool provides AI-assisted intake and is NOT a substitute for professional medical advice.
      </div>

      {!questions.length ? (
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
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-xl">🤖</div>
              <div>
                <p className="font-bold text-teal-700">Clinova AI</p>
                <p className="text-xs text-gray-500">Question {currentStepLabel}</p>
              </div>
            </div>
            <div className="text-sm text-gray-600">{currentStepLabel}</div>
          </div>

          <div className="mb-6 rounded-lg border border-teal-100 bg-teal-50 p-5">
            <p className="text-xl font-medium text-gray-800 leading-relaxed">{currentQuestion.question}</p>
          </div>

          <div className="mb-5 flex justify-between items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={speakCurrentQuestion}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
            >
              <FaVolumeUp /> Listen
            </button>

            <button
              type="button"
              onClick={isListening ? stopListening : () => startListening(lang)}
              className={`flex items-center gap-2 px-4 py-2 rounded text-white ${isListening ? 'bg-red-500' : 'bg-teal-600'}`}
            >
              {isListening ? <><FaStop /> Stop</> : <><FaMicrophone /> Speak</>}
            </button>
          </div>

          {(error || voiceError) && <p className="text-red-500 mb-3">{error || voiceError}</p>}

          <label className="block text-sm font-medium text-gray-700 mb-2">Your answer</label>
          <textarea
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            rows={5}
            placeholder="Type your answer here..."
            className="w-full border rounded-md p-4 mb-4 focus:ring-2 focus:ring-teal-500"
          />

          <button
            type="button"
            onClick={handleNext}
            disabled={submittingAnswer || preparing || assessing}
            className="w-full bg-teal-600 text-white py-3 rounded-md font-bold hover:bg-teal-700 disabled:opacity-50"
          >
            {assessing
              ? 'Running clinical assessment...'
              : preparing
                ? 'Preparing your clinical information...'
                : submittingAnswer
                  ? 'Saving your answer...'
                  : isLastQuestion
                    ? 'Finish Assessment'
                    : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}
