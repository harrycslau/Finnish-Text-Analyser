import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TooltipData, SynthesizedSpeech } from './types';
import { translateWord } from './services/geminiService';
import { synthesizeSpeech } from './services/ttsService';
import { sanitizeHtml } from './services/htmlService';
import Tooltip from './components/Tooltip';
import Controls from './components/Controls';
import Spinner from './components/Spinner';
import RichTextDisplay from './components/RichTextDisplay';

const PRELOAD_AHEAD_COUNT = 2; // Preload this many sentences ahead

const App: React.FC = () => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [sentencesForTTS, setSentencesForTTS] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingSentenceId, setSpeakingSentenceId] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isCancelledRef = useRef(false);
  const audioCacheRef = useRef<Map<number, SynthesizedSpeech>>(new Map());
  const preloadingRef = useRef<Set<number>>(new Set());

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
  
  // Apply playback rate changes to the current audio element
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);


  const handleAnalyse = () => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const plainText = tempDiv.innerText;

    if (!plainText.trim()) return;
    
    // Split text into sentences for the TTS engine. Regex tries to keep delimiters.
    const sentenceRegex = /[^.!?]+[.!?]?/g;
    const sentencesText = plainText.match(sentenceRegex) || [];
    setSentencesForTTS(sentencesText.filter(s => s.trim().length > 0));

    setIsAnalyzing(true);
  };
  
  const handleWordClick = useCallback(async (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (isTranslating) return;

    const wordText = event.currentTarget.textContent || '';
    if (!wordText.trim()) return;

    setIsTranslating(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipX = rect.left + rect.width / 2;
    const tooltipY = rect.top;

    setTooltip({ x: tooltipX, y: tooltipY, text: '...' });

    try {
      const translation = await translateWord(wordText);
      setTooltip({ x: tooltipX, y: tooltipY, text: translation });
    } catch (error) {
      setTooltip({ x: tooltipX, y: tooltipY, text: 'Error' });
    } finally {
      setIsTranslating(false);
    }
  }, [isTranslating]);

  const playAudio = useCallback((speech: SynthesizedSpeech): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (isCancelledRef.current) {
            return resolve();
        }

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
            audio.playbackRate = playbackRate;
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
                // If speech was cancelled by the user, this "error" is expected.
                // We can resolve the promise peacefully instead of rejecting.
                if (isCancelledRef.current) {
                    console.log("Audio playback cancelled by user (onerror).");
                    resolve();
                } else {
                    console.error("Audio playback error", e);
                    reject(new Error("Audio playback failed"));
                }
            };
            
            audio.play().catch(e => {
                cleanup();
                // The play() promise rejects when interrupted by pause().
                // This is expected during a manual stop, so we check our cancellation flag.
                if (isCancelledRef.current) {
                    console.log("Audio playback cancelled by user (play promise rejected).");
                    resolve();
                } else {
                    console.error("Error playing audio:", e);
                    reject(e);
                }
            });
        } catch (error) {
            console.error("Error processing audio data:", error);
            reject(new Error("Failed to process audio data."));
        }
    });
  }, [playbackRate]);

  const speakSentences = useCallback(async (startIndex: number = 0) => {
    if (startIndex >= sentencesForTTS.length) {
        setIsSpeaking(false);
        setSpeakingSentenceId(null);
        return;
    }

    isCancelledRef.current = false;
    setIsSpeaking(true);

    for (let i = startIndex; i < sentencesForTTS.length; i++) {
        if (isCancelledRef.current) break;

        const sentenceText = sentencesForTTS[i];
        setSpeakingSentenceId(i);

        // --- Start preloading next sentences ---
        for (let j = 1; j <= PRELOAD_AHEAD_COUNT; j++) {
            const preloadIndex = i + j;
            if (preloadIndex < sentencesForTTS.length) {
                const sentenceToPreload = sentencesForTTS[preloadIndex];
                const id = preloadIndex;
                if (!audioCacheRef.current.has(id) && !preloadingRef.current.has(id)) {
                    preloadingRef.current.add(id);
                    // Sanitize text by removing newlines before sending to TTS
                    synthesizeSpeech(sentenceToPreload.replace(/\n/g, ' '))
                        .then(audioData => {
                            if (!isCancelledRef.current) audioCacheRef.current.set(id, audioData);
                        })
                        .catch(err => console.error(`Preloading failed for sentence ${id}:`, err))
                        .finally(() => preloadingRef.current.delete(id));
                }
            }
        }

        try {
            let audioData = audioCacheRef.current.get(i);
            if (!audioData) {
                 // Sanitize text by removing newlines before sending to TTS
                audioData = await synthesizeSpeech(sentenceText.replace(/\n/g, ' '));
                if (isCancelledRef.current) break;
                audioCacheRef.current.set(i, audioData);
            }
            if (isCancelledRef.current) break;
            await playAudio(audioData);
        } catch (error) {
            console.error("Failed to speak sentence:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown TTS error occurred.";
            alert(`Error during text-to-speech: ${errorMessage}`);
            break;
        }
    }

    setIsSpeaking(false);
    setSpeakingSentenceId(null);
    audioRef.current = null;
  }, [sentencesForTTS, playAudio]);


  const handleReadAloud = () => {
    if (isSpeaking) {
      isCancelledRef.current = true;
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = ''; 
          audioRef.current = null;
      }
      setIsSpeaking(false);
      setSpeakingSentenceId(null);
    } else {
        speakSentences(0);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
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
    setSentencesForTTS([]);
    setHtmlContent('');
    setIsSpeaking(false);
    setSpeakingSentenceId(null);
    setTooltip(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboardData = e.clipboardData;
    const pastedHtml = clipboardData.getData('text/html');
    const sanitized = sanitizeHtml(pastedHtml || clipboardData.getData('text/plain'));
    document.execCommand('insertHTML', false, sanitized);
  };

  const renderInputView = () => (
    <div className="w-full max-w-2xl flex flex-col items-center gap-6 p-4">
      <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-blue-500 text-center">
        Finnish Text Analyzer
      </h1>
      <div
        contentEditable
        onInput={(e) => setHtmlContent(e.currentTarget.innerHTML)}
        onPaste={handlePaste}
        data-placeholder="Tervetuloa! Kirjoita tai liitä suomenkielistä tekstiä tähän."
        className="rich-text-input w-full h-64 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg p-4 text-lg text-gray-200 focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition resize-y shadow-lg"
        // Use dangerouslySetInnerHTML only for initial state hydration on reset
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
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
        playbackRate={playbackRate}
        onPlaybackRateChange={handlePlaybackRateChange}
      />
      <div className="w-full max-w-3xl bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl border border-gray-700">
          <RichTextDisplay
            htmlContent={htmlContent}
            onWordClick={handleWordClick}
            speakingSentenceId={speakingSentenceId}
          />
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