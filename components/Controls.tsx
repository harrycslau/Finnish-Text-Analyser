
import React from 'react';

interface ControlsProps {
  isSpeaking: boolean;
  playbackRate: number;
  onReadAloud: () => void;
  onReset: () => void;
  onPlaybackRateChange: (rate: number) => void;
}

const ReadAloudIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path d="M6 10a4 4 0 118 0 4 4 0 01-8 0zM10 18a8 8 0 100-16 8 8 0 000 16z" />
        <path d="M10 3a1 1 0 00-1 1v1a1 1 0 102 0V4a1 1 0 00-1-1zM4 10a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zM14 10a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM10 15a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1z" />
    </svg>
);

const StopIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);

const Controls: React.FC<ControlsProps> = ({
  isSpeaking,
  onReadAloud,
  onReset,
  playbackRate,
  onPlaybackRateChange,
}) => {
  return (
    <div className="w-full max-w-3xl bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg shadow-xl flex items-center justify-start gap-4 sticky top-4 z-10 border border-gray-700">
        <button
          onClick={onReadAloud}
          className="flex items-center justify-center bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-full transition-transform transform hover:scale-105"
        >
          {isSpeaking ? <StopIcon/> : <ReadAloudIcon/>}
          {isSpeaking ? 'Stop' : 'Read Aloud'}
        </button>
        <button
            onClick={onReset}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-full transition-transform transform hover:scale-105"
        >
            New Text
        </button>
        <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm font-medium text-gray-300">Speed</span>
            <input
                id="playback-speed"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={playbackRate}
                onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
                className="w-32 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <span className="text-sm font-mono text-gray-200 w-10 text-center">{playbackRate.toFixed(1)}x</span>
        </div>
    </div>
  );
};

export default Controls;
