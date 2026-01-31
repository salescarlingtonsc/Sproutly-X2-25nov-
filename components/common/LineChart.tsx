
import React, { useState, useRef } from 'react';

interface Series {
  name: string;
  values: number[];
  stroke: string;
  strokeDasharray?: string; // Added for limit lines
}

interface LineChartProps {
  xLabels: (string | number)[];
  series: Series[];
  height?: number;
  onFormatY?: (v: number) => string;
  onFormatX?: (v: string | number, i: number) => string | number;
}

const LineChart: React.FC<LineChartProps> = ({
  xLabels,
  series,
  height = 260,
  onFormatY = (v) => String(v),
  onFormatX = (v, _i) => v
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = 800;
  const basePad = { top: 20, right: 20, bottom: 40, left: 60 };

  const estSlotPx = 60;
  const maxLabels = Math.max(2, Math.floor((width - basePad.left - basePad.right) / estSlotPx));
  const stride = Math.max(1, Math.ceil((xLabels?.length || 0) / maxLabels));
  const xLabelAngle = stride >= 6 ? -60 : stride >= 3 ? -35 : 0;
  const pad = { ...basePad, bottom: xLabelAngle ? 70 : basePad.bottom };

  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  const allValues = series.flatMap((s) => s.values);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const xStep = chartWidth / Math.max(1, xLabels.length - 1);
  const toY = (val: number) => pad.top + chartHeight - ((val - minVal) / range) * chartHeight;
  const toX = (i: number) => pad.left + i * xStep;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x - pad.left) / xStep);
    setHoverIdx(idx >= 0 && idx < xLabels.length ? idx : null);
  };

  const compactToAge = (txt: string | number) => {
    const ageMatch = String(txt).match(/Age\s*(\d+(?:.\d+)?)/i);
    if (ageMatch) return `Age ${Math.floor(parseFloat(ageMatch[1]))}`;
    const yearMatch = String(txt).match(/\b(\d{4})\b/);
    return yearMatch ? yearMatch[1] : txt;
  };

  return (
    <div className="relative w-full max-w-[800px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full h-auto cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const val = minVal + frac * range;
          const y = toY(val);
          return (
            <g key={frac}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke='#E5E7EB' strokeWidth={1} />
              <text x={pad.left - 8} y={y + 4} textAnchor='end' fontSize={11} fill='#6B7280'>
                {onFormatY(val)}
              </text>
            </g>
          );
        })}
        {xLabels.map((raw, i) => {
          const shouldShow = i === 0 || i === xLabels.length - 1 || i % stride === 0;
          if (!shouldShow) return null;
          const formatted = onFormatX ? onFormatX(raw, i) ?? raw : raw;
          const text = stride >= 12 ? compactToAge(formatted) : formatted;
          const x = toX(i);
          const y = height - pad.bottom + (xLabelAngle ? 18 : 16);
          return (
            <text
              key={i}
              x={x}
              y={y}
              fontSize={10}
              fill='#6B7280'
              textAnchor={xLabelAngle ? 'end' : 'middle'}
              transform={xLabelAngle ? `rotate(${xLabelAngle}, ${x}, ${y})` : undefined}
            >
              {text}
            </text>
          );
        })}
        {series.map((s, idx) => {
          const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(v)}`).join(' ');
          return <path key={idx} d={d} fill='none' stroke={s.stroke} strokeWidth={2} strokeDasharray={s.strokeDasharray} />;
        })}
        {hoverIdx !== null && (
          <line
            x1={toX(hoverIdx)}
            y1={pad.top}
            x2={toX(hoverIdx)}
            y2={height - pad.bottom}
            stroke='#9CA3AF'
            strokeWidth={1}
            strokeDasharray='4 2'
          />
        )}
      </svg>

      {hoverIdx !== null && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: Math.min(Math.max(0, toX(hoverIdx) + 10), width - 150), // Clamp tooltip
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 50
          }}
        >
          <div className="font-bold mb-1">{xLabels[hoverIdx]}</div>
          {(() => {
            const valuesAtIdx = series.map(s => s.values[hoverIdx]);
            const maxValueAtIdx = Math.max(...valuesAtIdx);
            
            return series.map((s, i) => {
              const isHighest = s.values[hoverIdx] === maxValueAtIdx;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div style={{ width: 12, height: 2, background: s.stroke }} />
                  <span style={{ 
                    fontWeight: isHighest ? 700 : 400,
                    fontSize: isHighest ? 13 : 12
                  }}>
                    {s.name}: {onFormatY(s.values[hoverIdx])}
                    {isHighest && ' 🏆'}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs">
        {(() => {
          const finalValues = series.map(s => s.values[s.values.length - 1]);
          const maxFinalValue = Math.max(...finalValues);
          
          return series.map((s, i) => {
            const finalValue = s.values[s.values.length - 1];
            const isHighest = finalValue === maxFinalValue && maxFinalValue > 0;
            
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div style={{ width: 20, height: 3, background: s.stroke }} />
                <span style={{ 
                  fontWeight: isHighest ? 700 : 500,
                  fontSize: isHighest ? 16 : 12,
                  color: isHighest ? s.stroke : '#374151'
                }}>
                  {s.name}
                  {isHighest && ' 🏆'}
                </span>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
};

export default LineChart;
