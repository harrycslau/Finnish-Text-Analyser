import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordData, TooltipData, SentenceData } from './types';
import { translateWord } from './services/geminiService';
import Word from './components/Word';
import Tooltip from './components/Tooltip';
import Controls from './components/Controls';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [text, setText] = useState<string>('Tervetuloa! Kirjoita tai liitä suomenkielistä tekstiä tähän.');
  const [sentences, setSentences] = useState<SentenceData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingSentenceId, setSpeakingSentenceId] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  const currentSentenceIndexRef = useRef(0);

  // Stop speech synthesis on component unmount
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  // Load available Finnish voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices().filter(v => v.lang === 'fi-FI');
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        setSelectedVoice(availableVoices[0]);
      }
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [selectedVoice]);
  
  // Close tooltip on outside click
  useEffect(() => {
    const closeTooltip = () => setTooltip(null);
    if (tooltip) {
      window.addEventListener('click', closeTooltip);
    }
    return () => {
      window.removeEventListener('click', closeTooltip);
    };
  }, [tooltip]);


  const handleAnalyse = () => {
    if (!text.trim()) return;

    const newSentences: SentenceData[] = [];
    let sentenceIdCounter = 0;
    let wordIdCounter = 0;
    
    // Split text into sentences. Regex tries to keep delimiters.
    const sentenceRegex = /[^.!?]+[.!?]?/g;
    const sentencesText = text.match(sentenceRegex) || [];

    sentencesText.forEach(sentenceText => {
      const trimmedSentence = sentenceText.trim();
      if (!trimmedSentence) return;

      const sentenceWords: WordData[] = [];
      const wordRegex = /\S+/g;
      let match;

      while ((match = wordRegex.exec(trimmedSentence)) !== null) {
        sentenceWords.push({
          id: wordIdCounter++,
          text: match[0],
        });
      }
      
      if (sentenceWords.length > 0) {
          newSentences.push({
              id: sentenceIdCounter++,
              text: trimmedSentence,
              words: sentenceWords,
          });
      }
    });

    setSentences(newSentences);
    setIsAnalyzing(true);
  };
  
  const handleWordClick = useCallback(async (wordData: WordData, event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (isTranslating) return;

    setIsTranslating(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipX = rect.left + rect.width / 2;
    const tooltipY = rect.top;

    setTooltip({ x: tooltipX, y: tooltipY, text: '...' });

    try {
      const translation = await translateWord(wordData.text);
      setTooltip({ x: tooltipX, y: tooltipY, text: translation });
    } catch (error) {
      setTooltip({ x: tooltipX, y: tooltipY, text: 'Error' });
    } finally {
      setIsTranslating(false);
    }
  }, [isTranslating]);

  const speakSentences = useCallback((startIndex: number = 0) => {
    if (startIndex >= sentences.length) {
      setIsSpeaking(false);
      setSpeakingSentenceId(null);
      return;
    }

    speechSynthesis.cancel(); // Cancel any previous speech
    currentSentenceIndexRef.current = startIndex;
    
    const speakNext = () => {
      const index = currentSentenceIndexRef.current;
      if (index >= sentences.length) {
        setIsSpeaking(false);
        setSpeakingSentenceId(null);
        return;
      }

      const sentence = sentences[index];
      const utterance = new SpeechSynthesisUtterance(sentence.text);
      utterance.lang = 'fi-FI';
      utterance.rate = speechRate;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSpeakingSentenceId(sentence.id);
      };

      utterance.onend = () => {
        currentSentenceIndexRef.current++;
        speakNext();
      };

      utterance.onerror = (e) => {
        console.error("Speech synthesis error:", e);
        setIsSpeaking(false);
        setSpeakingSentenceId(null);
      };
      
      speechSynthesis.speak(utterance);
    };

    speakNext();
  }, [sentences, speechRate, selectedVoice]);

  const handleReadAloud = () => {
    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeakingSentenceId(null);
    } else {
      speakSentences(0);
    }
  };

  const handleVoiceChange = (voiceName: string) => {
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      setSelectedVoice(voice);
    }
  };

  const hasMounted = useRef(false);
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const speakingSentenceIdRef = useRef(speakingSentenceId);
  speakingSentenceIdRef.current = speakingSentenceId;

  useEffect(() => {
    if (hasMounted.current && isSpeakingRef.current) {
      const currentSentence = sentences.find(s => s.id === speakingSentenceIdRef.current);
      const sentenceIndex = currentSentence ? sentences.indexOf(currentSentence) : 0;
      if (sentenceIndex !== -1) {
        speakSentences(sentenceIndex);
      }
    } else {
      hasMounted.current = true;
    }
  // FIX: The dependency array was incomplete. Added `sentences` and `speakSentences` to
  // ensure the effect doesn't use stale closures, which can lead to bugs. This may resolve
  // the cascading type error that was reported.
  }, [speechRate, selectedVoice, sentences, speakSentences]);
  
  const handleReset = () => {
    speechSynthesis.cancel();
    setIsAnalyzing(false);
    setSentences([]);
    setIsSpeaking(false);
    setSpeakingSentenceId(null);
    setTooltip(null);
  }

  const renderInputView = () => (
    <div className="w-full max-w-2xl flex flex-col items-center gap-6 p-4">
      <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-blue-500 text-center">
        Finnish Text Analyzer
      </h1>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste Finnish text here..."
        className="w-full h-64 bg-gray-800 border border-gray-600 rounded-lg p-4 text-lg text-gray-200 focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition resize-none shadow-lg"
      />
      <button
        onClick={handleAnalyse}
        className="bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-8 rounded-full transition-transform transform hover:scale-105 text-lg shadow-md"
      >
        Analyse
      </button>
    </div>
  );

  const renderAnalysisView = () => (
    <div className="w-full flex flex-col items-center gap-8 p-4">
      <Controls 
        isSpeaking={isSpeaking}
        onReadAloud={handleReadAloud}
        speechRate={speechRate}
        onRateChange={setSpeechRate}
        onReset={handleReset}
        voices={voices}
        selectedVoice={selectedVoice}
        onVoiceChange={handleVoiceChange}
      />
      <div className="w-full max-w-3xl bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl border border-gray-700">
        <p className="text-xl sm:text-2xl text-gray-200 leading-relaxed text-left">
          {sentences.map((sentence) => {
            const isSentenceHighlighted = speakingSentenceId === sentence.id;
            return (
              <span
                key={sentence.id}
                className={`transition-colors duration-300 ease-in-out ${isSentenceHighlighted ? 'bg-teal-500 text-white rounded' : ''}`}
                // This padding gives the highlight its vertical size.
                style={{ padding: isSentenceHighlighted ? '2px 0' : '0' }}
              >
                {sentence.words.map((word) => (
                  <React.Fragment key={word.id}>
                    <Word
                      wordData={word}
                      isHighlighted={isSentenceHighlighted}
                      onClick={handleWordClick}
                    />{' '}
                  </React.Fragment>
                ))}
              </span>
            );
          })}
        </p>
      </div>
      {tooltip && isTranslating && tooltip.text === '...' && (
        <div 
          className="fixed z-50 flex items-center bg-gray-700 text-white text-sm rounded py-1.5 px-3 shadow-lg"
          style={{ 
            top: `${tooltip.y}px`, 
            left: `${tooltip.x}px`, 
            transform: 'translate(-50%, -100%)', 
            marginTop: '-8px' 
          }}
        >
          <Spinner className="mr-2"/> Translating...
        </div>
      )}
      {tooltip && (tooltip.text !== '...' || !isTranslating) && <Tooltip tooltipData={tooltip} />}

    </div>
  );

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center font-sans">
      {isAnalyzing ? renderAnalysisView() : renderInputView()}
    </main>
  );
};

export default App;
