
import React, { useState, useEffect, useCallback } from 'react';
import { WordData, TooltipData } from './types';
import { translateWord } from './services/geminiService';
import Word from './components/Word';
import Tooltip from './components/Tooltip';
import Controls from './components/Controls';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [text, setText] = useState<string>('Tervetuloa! Kirjoita tai liitä suomenkielistä tekstiä tähän.');
  const [words, setWords] = useState<WordData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingWordIndex, setSpeakingWordIndex] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(1);
  
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  // Stop speech synthesis on component unmount
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
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
    const newWords: WordData[] = [];
    let idCounter = 0;
    const wordRegex = /\S+/g;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
      newWords.push({
        id: idCounter++,
        text: match[0],
        charIndex: match.index,
      });
    }

    setWords(newWords);
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


  const handleReadAloud = () => {
    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeakingWordIndex(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fi-FI';
    utterance.rate = speechRate;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingWordIndex(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingWordIndex(null);
    };

    utterance.onboundary = (event) => {
        if (event.name === 'word') {
             const word = words.find(w => w.charIndex === event.charIndex);
             if (word) {
                setSpeakingWordIndex(word.id);
             }
        }
    };
    
    speechSynthesis.speak(utterance);
  };
  
  const handleReset = () => {
    speechSynthesis.cancel();
    setIsAnalyzing(false);
    setWords([]);
    setIsSpeaking(false);
    setSpeakingWordIndex(null);
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
      />
      <div className="w-full max-w-3xl bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl border border-gray-700">
        <p className="text-xl sm:text-2xl text-gray-200 leading-relaxed text-left">
          {words.map((word) => (
            <React.Fragment key={word.id}>
              <Word
                wordData={word}
                isHighlighted={speakingWordIndex === word.id}
                onClick={handleWordClick}
              />{' '}
            </React.Fragment>
          ))}
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
