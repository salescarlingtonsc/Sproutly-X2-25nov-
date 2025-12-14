
import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({ 
  data, 
  width = 100, 
  height = 30, 
  color = '#4f46e5',
  fill = false 
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Coordinate conversion
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const fillPath = `M 0,${height} L ${points} L ${width},${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {fill && <path d={fillPath} fill={color} fillOpacity={0.1} stroke="none" />}
      <polyline 
        points={points} 
        fill="none" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {/* End dot */}
      <circle 
        cx={width} 
        cy={height - ((data[data.length-1] - min) / range) * height} 
        r="3" 
        fill={color} 
      />
    </svg>
  );
};

export default Sparkline;
