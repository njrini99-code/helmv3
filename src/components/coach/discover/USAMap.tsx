'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface StateData {
  name: string;
  count: number;
}

interface USAMapProps {
  stateData: Record<string, StateData>;
  onStateClick?: (state: string) => void;
  className?: string;
}

const STATE_PATHS: Record<string, { path: string; cx: number; cy: number }> = {
  AL: { path: 'M720,450 L750,440 L760,460 L750,480 L730,475 Z', cx: 745, cy: 460 },
  AK: { path: 'M50,580 L150,570 L180,600 L100,610 Z', cx: 115, cy: 590 },
  AZ: { path: 'M180,380 L280,370 L290,450 L190,460 Z', cx: 235, cy: 415 },
  AR: { path: 'M590,400 L650,390 L660,440 L600,450 Z', cx: 625, cy: 420 },
  CA: { path: 'M80,250 L150,220 L170,350 L100,380 Z', cx: 135, cy: 300 },
  CO: { path: 'M320,280 L420,270 L430,340 L330,350 Z', cx: 375, cy: 310 },
  CT: { path: 'M880,210 L900,200 L910,220 L890,230 Z', cx: 895, cy: 215 },
  DE: { path: 'M850,300 L870,290 L880,320 L860,330 Z', cx: 865, cy: 310 },
  FL: { path: 'M780,520 L820,510 L840,590 L800,600 L780,580 Z', cx: 810, cy: 555 },
  GA: { path: 'M750,440 L800,430 L810,500 L760,510 Z', cx: 780, cy: 470 },
  HI: { path: 'M250,580 L300,575 L310,600 L260,605 Z', cx: 280, cy: 590 },
  ID: { path: 'M210,140 L280,120 L300,220 L220,240 Z', cx: 255, cy: 180 },
  IL: { path: 'M620,280 L680,270 L690,370 L630,380 Z', cx: 655, cy: 325 },
  IN: { path: 'M680,280 L730,270 L740,360 L690,370 Z', cx: 710, cy: 315 },
  IA: { path: 'M560,220 L630,210 L640,280 L570,290 Z', cx: 600, cy: 250 },
  KS: { path: 'M480,320 L580,310 L590,380 L490,390 Z', cx: 535, cy: 350 },
  KY: { path: 'M680,340 L760,330 L770,390 L690,400 Z', cx: 725, cy: 365 },
  LA: { path: 'M580,480 L640,470 L650,530 L590,540 Z', cx: 615, cy: 505 },
  ME: { path: 'M900,80 L930,70 L950,130 L920,140 Z', cx: 925, cy: 105 },
  MD: { path: 'M830,300 L870,290 L880,330 L840,340 Z', cx: 855, cy: 315 },
  MA: { path: 'M890,180 L920,170 L930,200 L900,210 Z', cx: 915, cy: 185 },
  MI: { path: 'M680,200 L740,180 L760,260 L700,280 Z', cx: 720, cy: 230 },
  MN: { path: 'M530,120 L610,110 L620,200 L540,210 Z', cx: 575, cy: 155 },
  MS: { path: 'M650,420 L690,410 L700,490 L660,500 Z', cx: 675, cy: 455 },
  MO: { path: 'M580,310 L650,300 L660,380 L590,390 Z', cx: 620, cy: 345 },
  MT: { path: 'M280,100 L430,80 L440,160 L290,180 Z', cx: 360, cy: 130 },
  NE: { path: 'M430,240 L550,230 L560,300 L440,310 Z', cx: 495, cy: 270 },
  NV: { path: 'M150,220 L230,200 L250,320 L170,340 Z', cx: 200, cy: 270 },
  NH: { path: 'M900,140 L920,130 L930,170 L910,180 Z', cx: 915, cy: 155 },
  NJ: { path: 'M870,260 L890,250 L900,290 L880,300 Z', cx: 885, cy: 275 },
  NM: { path: 'M330,350 L420,340 L430,450 L340,460 Z', cx: 380, cy: 400 },
  NY: { path: 'M820,200 L890,180 L910,260 L840,280 Z', cx: 865, cy: 230 },
  NC: { path: 'M770,380 L850,370 L860,420 L780,430 Z', cx: 815, cy: 400 },
  ND: { path: 'M420,100 L530,90 L540,160 L430,170 Z', cx: 480, cy: 130 },
  OH: { path: 'M730,270 L790,260 L800,340 L740,350 Z', cx: 765, cy: 305 },
  OK: { path: 'M480,380 L590,370 L600,430 L490,440 Z', cx: 540, cy: 405 },
  OR: { path: 'M120,140 L210,120 L230,200 L140,220 Z', cx: 175, cy: 170 },
  PA: { path: 'M790,260 L870,250 L880,310 L800,320 Z', cx: 835, cy: 285 },
  RI: { path: 'M910,200 L925,195 L930,215 L915,220 Z', cx: 920, cy: 207 },
  SC: { path: 'M780,420 L830,410 L840,460 L790,470 Z', cx: 810, cy: 440 },
  SD: { path: 'M430,170 L540,160 L550,230 L440,240 Z', cx: 490, cy: 200 },
  TN: { path: 'M680,380 L770,370 L780,420 L690,430 Z', cx: 730, cy: 400 },
  TX: { path: 'M420,450 L590,430 L610,580 L440,600 Z', cx: 515, cy: 515 },
  UT: { path: 'M250,250 L330,240 L340,340 L260,350 Z', cx: 295, cy: 295 },
  VT: { path: 'M880,140 L900,130 L910,180 L890,190 Z', cx: 895, cy: 160 },
  VA: { path: 'M800,340 L870,330 L880,380 L810,390 Z', cx: 840, cy: 360 },
  WA: { path: 'M140,80 L230,60 L250,140 L160,160 Z', cx: 195, cy: 110 },
  WV: { path: 'M770,320 L820,310 L830,370 L780,380 Z', cx: 800, cy: 345 },
  WI: { path: 'M610,180 L680,170 L690,250 L620,260 Z', cx: 650, cy: 215 },
  WY: { path: 'M320,180 L430,170 L440,260 L330,270 Z', cx: 380, cy: 220 },
};

export function USAMap({ stateData, onStateClick, className }: USAMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [clickedState, setClickedState] = useState<string | null>(null);

  const getStateColor = (stateCode: string) => {
    const count = stateData[stateCode]?.count || 0;
    if (count === 0) return '#F1F5F9'; // slate-100
    if (count < 5) return '#DCFCE7'; // green-100
    if (count < 15) return '#86EFAC'; // green-300
    if (count < 30) return '#4ADE80'; // green-400
    return '#16A34A'; // green-600
  };

  const handleStateClick = (stateCode: string) => {
    setClickedState(stateCode);
    onStateClick?.(stateCode);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox="0 0 1000 650"
        className="w-full h-auto"
        style={{ maxHeight: '600px' }}
      >
        {/* State paths */}
        {Object.entries(STATE_PATHS).map(([code, { path }]) => (
          <path
            key={code}
            d={path}
            fill={getStateColor(code)}
            stroke="#FFFFFF"
            strokeWidth="2"
            className={cn(
              'transition-all duration-200 cursor-pointer',
              hoveredState === code && 'opacity-80',
              clickedState === code && 'stroke-green-700 stroke-[3]'
            )}
            onMouseEnter={() => setHoveredState(code)}
            onMouseLeave={() => setHoveredState(null)}
            onClick={() => handleStateClick(code)}
          />
        ))}

        {/* State labels */}
        {Object.entries(STATE_PATHS).map(([code, { cx, cy }]) => (
          <g key={`label-${code}`}>
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              className="text-xs font-medium fill-slate-700 pointer-events-none select-none"
              style={{ fontSize: '12px' }}
            >
              {code}
            </text>
            {stateData[code]?.count && stateData[code]!.count > 0 && (
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                className="text-[10px] font-semibold fill-green-700 pointer-events-none select-none"
              >
                {stateData[code]!.count}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-100 border border-slate-200" />
          <span>0 players</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 border border-green-200" />
          <span>1-4</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-300 border border-green-400" />
          <span>5-14</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-400 border border-green-500" />
          <span>15-29</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-600 border border-green-700" />
          <span>30+</span>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredState && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg border border-slate-200 px-3 py-2 pointer-events-none">
          <p className="text-sm font-semibold text-slate-900">
            {stateData[hoveredState]?.name || hoveredState}
          </p>
          <p className="text-xs text-slate-500">
            {stateData[hoveredState]?.count || 0} players
          </p>
        </div>
      )}
    </div>
  );
}
