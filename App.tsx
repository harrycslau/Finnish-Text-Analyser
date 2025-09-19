import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordData, TooltipData, SentenceData, Voice } from './types';
import { translateWord } from './services/geminiService';
import { synthesizeSpeech, finnishVoices } from './services/ttsService';
import Word from './components/Word';
import Tooltip from './components/Tooltip';
import Controls from './components/Controls';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [text, setText] = useState<string>('');
  const [sentences, setSentences] = useState<SentenceData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingSentenceId, setSpeakingSentenceId] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [voices] = useState<Voice[]>(finnishVoices);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(finnishVoices.length > 0 ? finnishVoices[0] : null);
  
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isCancelledRef = useRef(false);

  // Stop speech on component unmount
  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
  
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

      // FIX: Replaced a complex `while` loop with `string.match()` and a `for...of` loop.
      // This is more readable and fixes a TypeScript type inference issue where
      // a variable was incorrectly inferred as `never`.
      const sentenceWords: WordData[] = [];
      const wordRegex = /\S+/g;
      const words = trimmedSentence.match(wordRegex) || [];

      for (const word of words) {
        sentenceWords.push({
          id: wordIdCounter++,
          text: word,
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

  const playAudio = (base64Audio: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (isCancelledRef.current) {
            return resolve();
        }
        const audioSrc = `data:audio/mp3;base64,${base64Audio}`;
        const audio = new Audio(audioSrc);
        audioRef.current = audio;

        audio.onended = () => {
            audioRef.current = null;
            resolve();
        };
        audio.onerror = (e) => {
            audioRef.current = null;
            console.error("Audio playback error", e);
            reject(new Error("Audio playback failed"));
        };
        
        audio.play().catch(e => {
            console.error("Error playing audio:", e);
            reject(e);
        });
    });
  };

  const speakSentences = useCallback(async (startIndex: number = 0) => {
    if (!selectedVoice || startIndex >= sentences.length) {
        setIsSpeaking(false);
        setSpeakingSentenceId(null);
        return;
    }

    isCancelledRef.current = false;
    setIsSpeaking(true);

    for (let i = startIndex; i < sentences.length; i++) {
        if (isCancelledRef.current) {
            break;
        }

        const sentence = sentences[i];
        setSpeakingSentenceId(sentence.id);

        try {
            const audioContent = await synthesizeSpeech(sentence.text, selectedVoice.name, speechRate);
            if (isCancelledRef.current) break;
            await playAudio(audioContent);
        } catch (error) {
            console.error("Failed to speak sentence:", error);
            // Optional: Show an error to the user
            break; // Stop on error
        }
    }

    // Clean up after finishing or being cancelled
    setIsSpeaking(false);
    setSpeakingSentenceId(null);
    audioRef.current = null;
  }, [sentences, speechRate, selectedVoice]);

  const handleReadAloud = () => {
    if (isSpeaking) {
      isCancelledRef.current = true;
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = ''; // Stop download & release resources
          audioRef.current = null;
      }
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
  
  const handleReset = () => {
    isCancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
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
        placeholder="Tervetuloa! Kirjoita tai liitä suomenkielistä tekstiä tähän."
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