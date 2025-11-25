import React, { ReactNode } from 'react';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`
      px-5 py-3 border-b-4 text-sm font-medium cursor-pointer whitespace-nowrap rounded-t-lg transition-colors
      ${active 
        ? 'border-indigo-500 bg-gradient-to-b from-indigo-50 to-white text-indigo-600 font-bold' 
        : 'border-transparent bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }
    `}
  >
    {children}
  </button>
);

export default TabButton;