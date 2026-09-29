import { useState, useEffect } from 'react';

export const useSpeechSynthesis = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = window.speechSynthesis;

  const speak = (text, lang = 'en-US') => {
    if (synth.speaking) synth.cancel();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synth.speak(utterance);
  };

  const stop = () => {
    synth.cancel();
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => {
      synth.cancel();
    };
  }, []);

  return { isSpeaking, speak, stop };
};
