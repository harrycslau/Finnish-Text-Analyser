
import React from 'react';
import { TooltipData } from '../types';

interface TooltipProps {
  tooltipData: TooltipData;
}

const Tooltip: React.FC<TooltipProps> = ({ tooltipData }) => {
  if (!tooltipData) {
    return null;
  }

  const { x, y, text } = tooltipData;

  return (
    <div
      className="fixed z-50 bg-gray-700 text-white text-sm rounded py-1.5 px-3 shadow-lg transition-opacity duration-200 ease-in-out"
      style={{
        top: `${y}px`,
        left: `${x}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px', // small offset from the word
      }}
    >
      {text}
    </div>
  );
};

export default Tooltip;
