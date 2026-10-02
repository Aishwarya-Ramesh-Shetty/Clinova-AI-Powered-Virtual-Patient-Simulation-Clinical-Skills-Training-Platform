import { useState, useEffect, useRef } from 'react';

const mapLanguageToSpeechRecognition = (lang = 'en-US') => {
  if (!lang) return 'en-IN';

  const normalized = lang.toLowerCase();

  if (normalized.startsWith('hi')) return 'hi-IN';
  if (normalized.startsWith('kn')) return 'kn-IN';
  if (normalized.startsWith('en')) return 'en-IN';

  return 'en-IN';
};

export const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [recognition, setRecognition] = useState(null);
  const nextResultIndexRef = useRef(0);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser. Please use Chrome or type your answer instead.');
      return undefined;
    }

    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.lang = 'en-IN';

    recog.onresult = (event) => {
      let newFinalTranscript = '';

      for (let i = nextResultIndexRef.current; i < event.results.length; i += 1) {
        const result = event.results[i];

        if (!result.isFinal) {
          break;
        }

        newFinalTranscript += `${result[0].transcript} `;
        nextResultIndexRef.current = i + 1;
      }

      newFinalTranscript = newFinalTranscript.trim();

      if (newFinalTranscript) {
        setTranscript((previousTranscript) => (
          previousTranscript
            ? `${previousTranscript} ${newFinalTranscript}`
            : newFinalTranscript
        ));
      }
    };

    recog.onerror = (event) => {
      const code = event.error || 'unknown';
      const messages = {
        'not-allowed': 'Microphone permission was denied. Please allow microphone access in your browser settings.',
        'permission-denied': 'Microphone permission was denied. Please allow microphone access in your browser settings.',
        'no-speech': 'No speech was detected. Please try again.',
        'audio-capture': 'No microphone was detected. Please check your audio device.',
        'network': 'A network error occurred while trying to access the microphone. Please try again.'
      };

      setError(messages[code] || 'Voice input is unavailable right now. Please try again or type your answer.');
      setIsListening(false);
    };

    recog.onend = () => {
      setIsListening(false);
    };

    setRecognition(recog);

    return () => {
      try {
        recog.stop();
      } catch {}
    };
  }, []);

  const startListening = (lang = 'en-US') => {
    if (!recognition) {
      setError('Voice input is not supported in this browser. Please use Chrome or type your answer instead.');
      return;
    }

    try {
      recognition.lang = mapLanguageToSpeechRecognition(lang);
      nextResultIndexRef.current = 0;
      setTranscript('');
      setError(null);
      recognition.start();
      setIsListening(true);
    } catch (err) {
      if (err && err.name === 'InvalidStateError') {
        try {
          recognition.stop();
          nextResultIndexRef.current = 0;
          setTranscript('');
          recognition.start();
          setError(null);
          setIsListening(true);
          return;
        } catch (retryError) {
          setError('Voice input is already active. Please wait a moment and try again.');
          setIsListening(false);
          return;
        }
      }

      setError('Voice input could not be started. Please try again.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
    }

    setIsListening(false);
  };

  const resetTranscript = () => setTranscript('');

  return { isListening, transcript, error, startListening, stopListening, resetTranscript };
};
