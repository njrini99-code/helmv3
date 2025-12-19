'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface USMapProps {
  selectedStates: string[];
  onStateClick: (state: string) => void;
  stateCounts?: Record<string, number>;
  className?: string;
}

// Simplified US state paths for an SVG map
const STATE_PATHS: Record<string, { path: string; name: string }> = {
  WA: { path: 'M50,30 L120,30 L120,80 L50,80 Z', name: 'Washington' },
  OR: { path: 'M50,85 L120,85 L120,135 L50,135 Z', name: 'Oregon' },
  CA: { path: 'M50,140 L120,140 L120,240 L50,240 Z', name: 'California' },
  NV: { path: 'M125,85 L180,85 L180,180 L125,180 Z', name: 'Nevada' },
  ID: { path: 'M125,30 L180,30 L180,80 L125,80 Z', name: 'Idaho' },
  MT: { path: 'M185,30 L280,30 L280,80 L185,80 Z', name: 'Montana' },
  WY: { path: 'M185,85 L280,85 L280,135 L185,135 Z', name: 'Wyoming' },
  UT: { path: 'M185,140 L240,140 L240,190 L185,190 Z', name: 'Utah' },
  AZ: { path: 'M125,185 L180,185 L180,240 L125,240 Z', name: 'Arizona' },
  CO: { path: 'M245,140 L340,140 L340,190 L245,190 Z', name: 'Colorado' },
  NM: { path: 'M185,195 L280,195 L280,245 L185,245 Z', name: 'New Mexico' },
  ND: { path: 'M285,30 L380,30 L380,75 L285,75 Z', name: 'North Dakota' },
  SD: { path: 'M285,80 L380,80 L380,130 L285,130 Z', name: 'South Dakota' },
  NE: { path: 'M285,135 L395,135 L395,180 L285,180 Z', name: 'Nebraska' },
  KS: { path: 'M285,185 L395,185 L395,230 L285,230 Z', name: 'Kansas' },
  OK: { path: 'M285,235 L395,235 L395,280 L285,280 Z', name: 'Oklahoma' },
  TX: { path: 'M285,285 L395,285 L395,380 L285,380 Z', name: 'Texas' },
  MN: { path: 'M385,30 L480,30 L480,120 L385,120 Z', name: 'Minnesota' },
  IA: { path: 'M400,125 L480,125 L480,175 L400,175 Z', name: 'Iowa' },
  MO: { path: 'M400,180 L480,180 L480,230 L400,230 Z', name: 'Missouri' },
  AR: { path: 'M400,235 L470,235 L470,285 L400,285 Z', name: 'Arkansas' },
  LA: { path: 'M400,290 L470,290 L470,340 L400,340 Z', name: 'Louisiana' },
  WI: { path: 'M485,30 L550,30 L550,110 L485,110 Z', name: 'Wisconsin' },
  IL: { path: 'M485,115 L550,115 L550,200 L485,200 Z', name: 'Illinois' },
  MI: { path: 'M555,30 L620,30 L620,130 L555,130 Z', name: 'Michigan' },
  IN: { path: 'M555,135 L610,135 L610,200 L555,200 Z', name: 'Indiana' },
  OH: { path: 'M615,135 L680,135 L680,200 L615,200 Z', name: 'Ohio' },
  KY: { path: 'M555,205 L650,205 L650,250 L555,250 Z', name: 'Kentucky' },
  TN: { path: 'M475,240 L595,240 L595,285 L475,285 Z', name: 'Tennessee' },
  MS: { path: 'M475,290 L535,290 L535,350 L475,350 Z', name: 'Mississippi' },
  AL: { path: 'M540,290 L595,290 L595,360 L540,360 Z', name: 'Alabama' },
  GA: { path: 'M600,250 L670,250 L670,340 L600,340 Z', name: 'Georgia' },
  FL: { path: 'M600,345 L720,345 L720,390 L600,390 Z', name: 'Florida' },
  SC: { path: 'M675,250 L735,250 L735,295 L675,295 Z', name: 'South Carolina' },
  NC: { path: 'M655,205 L755,205 L755,245 L655,245 Z', name: 'North Carolina' },
  VA: { path: 'M685,165 L760,165 L760,200 L685,200 Z', name: 'Virginia' },
  WV: { path: 'M685,135 L740,135 L740,160 L685,160 Z', name: 'West Virginia' },
  PA: { path: 'M685,95 L780,95 L780,130 L685,130 Z', name: 'Pennsylvania' },
  NY: { path: 'M685,50 L780,50 L780,90 L685,90 Z', name: 'New York' },
  VT: { path: 'M785,30 L820,30 L820,70 L785,70 Z', name: 'Vermont' },
  NH: { path: 'M825,30 L860,30 L860,75 L825,75 Z', name: 'New Hampshire' },
  ME: { path: 'M825,5 L870,5 L870,60 L825,60 Z', name: 'Maine' },
  MA: { path: 'M785,75 L860,75 L860,100 L785,100 Z', name: 'Massachusetts' },
  RI: { path: 'M850,85 L870,85 L870,105 L850,105 Z', name: 'Rhode Island' },
  CT: { path: 'M785,105 L840,105 L840,125 L785,125 Z', name: 'Connecticut' },
  NJ: { path: 'M765,120 L800,120 L800,155 L765,155 Z', name: 'New Jersey' },
  DE: { path: 'M765,160 L790,160 L790,180 L765,180 Z', name: 'Delaware' },
  MD: { path: 'M715,155 L760,155 L760,175 L715,175 Z', name: 'Maryland' },
  AK: { path: 'M10,350 L90,350 L90,390 L10,390 Z', name: 'Alaska' },
  HI: { path: 'M100,350 L180,350 L180,390 L100,390 Z', name: 'Hawaii' },
};

export function USMap({ selectedStates, onStateClick, stateCounts = {}, className }: USMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const getStateColor = (stateCode: string) => {
    if (selectedStates.includes(stateCode)) {
      return '#16A34A'; // brand-600 green
    }
    const count = stateCounts[stateCode] || 0;
    if (count === 0) {
      return '#F1F5F9'; // slate-100
    }
    // Gradient based on player count
    if (count >= 50) return '#86EFAC'; // green-300
    if (count >= 20) return '#BBF7D0'; // green-200
    return '#DCFCE7'; // green-100
  };

  const getStateStroke = (stateCode: string) => {
    if (selectedStates.includes(stateCode)) {
      return '#15803D'; // green-700
    }
    if (hoveredState === stateCode) {
      return '#16A34A'; // brand-600
    }
    return '#CBD5E1'; // slate-300
  };

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Filter by State</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-300" />
            <span className="text-slate-500">No players</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-100 border border-slate-300" />
            <span className="text-slate-500">1-19</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-200 border border-slate-300" />
            <span className="text-slate-500">20-49</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-300 border border-slate-300" />
            <span className="text-slate-500">50+</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-600 border border-green-700" />
            <span className="text-slate-500">Selected</span>
          </div>
        </div>
      </div>

      <svg viewBox="0 0 900 400" className="w-full h-auto">
        {Object.entries(STATE_PATHS).map(([stateCode, { path, name }]) => (
          <g key={stateCode}>
            <path
              d={path}
              fill={getStateColor(stateCode)}
              stroke={getStateStroke(stateCode)}
              strokeWidth={hoveredState === stateCode ? 3 : 2}
              className="cursor-pointer transition-all duration-200 hover:opacity-80"
              onClick={() => onStateClick(stateCode)}
              onMouseEnter={() => setHoveredState(stateCode)}
              onMouseLeave={() => setHoveredState(null)}
            >
              <title>{name}: {stateCounts[stateCode] || 0} players</title>
            </path>
            <text
              x={path.split(' ')[0]?.split(',')[0]?.replace('M', '') || '0'}
              y={path.split(' ')[0]?.split(',')[1] || '0'}
              dx="15"
              dy="20"
              fontSize="10"
              fontWeight="600"
              fill={selectedStates.includes(stateCode) ? '#FFFFFF' : '#334155'}
              pointerEvents="none"
              className="select-none"
            >
              {stateCode}
            </text>
          </g>
        ))}
      </svg>

      {hoveredState && (
        <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900">{STATE_PATHS[hoveredState]?.name}</span>
            <span className="text-sm text-slate-600">
              {stateCounts[hoveredState] || 0} {(stateCounts[hoveredState] || 0) === 1 ? 'player' : 'players'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
