import React from 'react';
import { WordData } from '../types';

interface WordProps {
  wordData: WordData;
  isHighlighted: boolean;
  onClick: (wordData: WordData, event: React.MouseEvent<HTMLSpanElement>) => void;
}

const Word: React.FC<WordProps> = ({ wordData, isHighlighted, onClick }) => {
  // If the sentence is highlighted, the word has no special styling, just the cursor.
  // Otherwise, it has a hover effect, its own rounded corners, and margin.
  const baseClasses = "cursor-pointer inline-block transition-colors duration-200 ease-in-out";
  const normalClasses = "hover:bg-gray-700 rounded";

  return (
    <span
      className={`${baseClasses} ${isHighlighted ? '' : normalClasses}`}
      onClick={(e) => onClick(wordData, e)}
      // Padding provides a better click target; margin creates space only when not highlighted.
      style={{
        padding: isHighlighted ? '0 4px' : '2px 4px',
        margin: isHighlighted ? '0' : '0 2px',
      }}
    >
      {wordData.text}
    </span>
  );
};

export default Word;
