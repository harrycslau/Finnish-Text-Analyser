
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordData, TooltipData, SentenceData, SynthesizedSpeech } from './types';
import { translateWord } from './services/geminiService';
import { synthesizeSpeech } from './services/ttsService';
import Word from './components/Word';
import Tooltip from './components/Tooltip';
import Controls from './components/Controls';
import Spinner from './components/Spinner';

const PRELOAD_AHEAD_COUNT = 2; // Preload this many sentences ahead

const App: React.FC = () => {
  const [text, setText] = useState<string>('');
  const [sentences, setSentences] = useState<SentenceData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingSentenceId, setSpeakingSentenceId] = useState<number | null>(null);
  
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isCancelledRef = useRef(false);
  const audioCacheRef = useRef<Map<number, SynthesizedSpeech>>(new Map());
  const preloadingRef = useRef<Set<number>>(new Set()); // Track in-progress preloads

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

    // FIX: Replaced `forEach` with a `for...of` loop to resolve a TypeScript
    // type inference issue where `sentenceText` was incorrectly inferred as `never`.
    for (const sentenceText of sentencesText) {
      const trimmedSentence = sentenceText.trim();
      if (!trimmedSentence) continue;

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
    }

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

  const playAudio = (speech: SynthesizedSpeech): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (isCancelledRef.current) {
            return resolve();
        }

        // Helper to convert base64 to a Blob, which is more reliable for audio playback.
        const base64ToBlob = (base64: string, mimeType: string): Blob => {
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        };

        try {
            const audioBlob = base64ToBlob(speech.data, speech.mimeType);
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            const cleanup = () => {
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
            };

            audio.onended = () => {
                cleanup();
                resolve();
            };
            audio.onerror = (e) => {
                cleanup();
                console.error("Audio playback error", e);
                reject(new Error("Audio playback failed"));
            };
            
            audio.play().catch(e => {
                cleanup();
                console.error("Error playing audio:", e);
                reject(e);
            });
        } catch (error) {
            console.error("Error processing audio data:", error);
            reject(new Error("Failed to process audio data."));
        }
    });
  };

  const speakSentences = useCallback(async (startIndex: number = 0) => {
    if (startIndex >= sentences.length) {
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

        // --- Start preloading next sentences ---
        for (let j = 1; j <= PRELOAD_AHEAD_COUNT; j++) {
            const preloadIndex = i + j;
            if (preloadIndex < sentences.length) {
                const sentenceToPreload = sentences[preloadIndex];
                const id = sentenceToPreload.id;

                // Check if not already cached or being preloaded
                if (!audioCacheRef.current.has(id) && !preloadingRef.current.has(id)) {
                    preloadingRef.current.add(id);
                    // Fire-and-forget promise for caching
                    synthesizeSpeech(sentenceToPreload.text)
                        .then(audioData => {
                            if (!isCancelledRef.current) {
                                audioCacheRef.current.set(id, audioData);
                            }
                        })
                        .catch(err => {
                            console.error(`Preloading failed for sentence ${id}:`, err);
                        })
                        .finally(() => {
                            preloadingRef.current.delete(id);
                        });
                }
            }
        }


        try {
            let audioData = audioCacheRef.current.get(sentence.id);

            // If not in cache, fetch and wait.
            if (!audioData) {
                audioData = await synthesizeSpeech(sentence.text);
                if (isCancelledRef.current) break;
                audioCacheRef.current.set(sentence.id, audioData);
            }
            
            if (isCancelledRef.current) break; // check again before playing
            await playAudio(audioData);

        } catch (error) {
            console.error("Failed to speak sentence:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown TTS error occurred.";
            alert(`Error during text-to-speech: ${errorMessage}`);
            break; // Stop on error
        }
    }

    // Clean up after finishing or being cancelled
    setIsSpeaking(false);
    setSpeakingSentenceId(null);
    audioRef.current = null;
  }, [sentences]);


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
  
  const handleReset = () => {
    isCancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    audioCacheRef.current.clear();
    preloadingRef.current.clear();
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
        onReset={handleReset}
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
