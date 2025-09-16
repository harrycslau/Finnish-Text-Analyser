
import React from 'react';
import { WordData } from '../types';

interface WordProps {
  wordData: WordData;
  isHighlighted: boolean;
  onClick: (wordData: WordData, event: React.MouseEvent<HTMLSpanElement>) => void;
}

const Word: React.FC<WordProps> = ({ wordData, isHighlighted, onClick }) => {
  const baseClasses = "cursor-pointer inline-block transition-all duration-200 ease-in-out rounded";
  const highlightedClasses = "bg-teal-500 text-white scale-110 shadow-lg";
  const normalClasses = "hover:bg-gray-700";

  return (
    <span
      className={`${baseClasses} ${isHighlighted ? highlightedClasses : normalClasses}`}
      onClick={(e) => onClick(wordData, e)}
      style={{ padding: '2px 4px', margin: '0 2px' }}
    >
      {wordData.text}
    </span>
  );
};

export default Word;
