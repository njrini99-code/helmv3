'use client';

import { memo, useState, useCallback, useRef } from 'react';
import { scaleQuantize } from 'd3-scale';
import { cn } from '@/lib/utils';
import { IconX } from '@/components/icons';
import { US_STATE_PATHS } from './us-state-paths';

// State name to code mapping
const STATE_NAME_TO_CODE: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC',
};

const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
);

interface USStateMapProps {
  playersByState: Record<string, number>;
  selectedStates?: string[];
  onStateClick?: (stateCode: string) => void;
  onClearSelection?: () => void;
  className?: string;
  multiSelect?: boolean;
  /** Display mode - affects labels (players vs teams) */
  mode?: 'players' | 'teams';
}

export const USStateMap = memo(function USStateMap({
  playersByState,
  selectedStates = [],
  onStateClick,
  onClearSelection,
  className,
  mode = 'players',
}: USStateMapProps) {
  // Dynamic labels based on mode
  const itemLabel = mode === 'teams' ? 'team' : 'player';
  const itemLabelPlural = mode === 'teams' ? 'teams' : 'players';
  const itemLabelCapital = mode === 'teams' ? 'Teams' : 'Players';
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const maxPlayers = Math.max(...Object.values(playersByState), 1);

  // Enhanced 8-step color scale for richer gradients
  const colorScale = scaleQuantize<string>()
    .domain([0, maxPlayers])
    .range([
      '#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d',
    ]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleStateClick = useCallback((stateCode: string) => {
    // Trigger click animation
    setActiveState(stateCode);
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = setTimeout(() => {
      setActiveState(null);
    }, 200);

    onStateClick?.(stateCode);
  }, [onStateClick]);

  const totalPlayers = Object.values(playersByState).reduce((sum, count) => sum + count, 0);
  const selectedCount = selectedStates.reduce((sum, code) => sum + (playersByState[code] || 0), 0);
  const singleSelectedState = selectedStates.length === 1 ? selectedStates[0] : null;
  const singleSelectedLabel = singleSelectedState ? STATE_CODE_TO_NAME[singleSelectedState] : null;

  return (
    <div className={cn('relative', className)} onMouseMove={handleMouseMove}>
      {/* Premium Selection Badge */}
      {selectedStates.length > 0 && (
        <div className="absolute top-5 left-5 z-20 animate-in slide-in-from-top-3 fade-in duration-300">
          <div
            className="relative flex items-center gap-3 px-5 py-3 rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #16a34a 50%, #22c55e 100%)',
              boxShadow: `
                0 12px 32px -8px rgba(5, 150, 105, 0.4),
                0 4px 12px -2px rgba(5, 150, 105, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                inset 0 -1px 0 rgba(0, 0, 0, 0.1)
              `,
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            {/* Shine effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)',
              }}
            />

            {/* Location icon */}
            <div className="relative w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <div className="relative text-white">
              <p className="font-semibold text-base leading-tight">
                {singleSelectedLabel ?? `${selectedStates.length} states`}
              </p>
              <p className="text-emerald-100 text-sm">
                {selectedCount.toLocaleString()} {itemLabelPlural}
              </p>
            </div>

            {/* Divider */}
            <div className="relative w-px h-8 bg-white/20" />

            {/* Clear button */}
            <button
              onClick={onClearSelection}
              className="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-150"
              aria-label="Clear selection"
            >
              <IconX size={16} className="text-white" />
            </button>
          </div>
        </div>
      )}

      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          minHeight: '420px',
          background: 'linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.95) 35%, rgba(241,245,249,0.93) 65%, rgba(226,232,240,0.88) 100%)',
          boxShadow: `
            0 25px 60px -12px rgba(0, 0, 0, 0.12),
            0 12px 28px -8px rgba(0, 0, 0, 0.08),
            0 4px 12px -2px rgba(0, 0, 0, 0.04),
            inset 0 1px 2px rgba(255, 255, 255, 0.95),
            inset 0 -1px 2px rgba(0, 0, 0, 0.03)
          `,
          border: '1px solid rgba(255, 255, 255, 0.7)',
        }}
      >
        {/* Ambient floating orbs for visual depth */}
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(22, 163, 74, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
            animation: 'map-float 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%)',
            filter: 'blur(30px)',
            animation: 'map-float 25s ease-in-out infinite reverse',
          }}
        />

        {/* Premium top highlight bar */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-20"
          style={{
            background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.9) 20%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.9) 80%, transparent 95%)',
          }}
        />

        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(16, 185, 129, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(16, 185, 129, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <svg
          viewBox="0 0 800 500"
          className="w-full h-full relative z-10"
          style={{ minHeight: '400px' }}
        >
          {/* SVG Definitions for gradients and filters */}
          <defs>
            {/* Base gradient for states */}
            <linearGradient id="stateGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
            </linearGradient>

            {/* Hover glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* 3D shadow filter */}
            <filter id="stateShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.15" />
            </filter>

            {/* Selected state glow */}
            <filter id="selectedGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#059669" floodOpacity="0.4" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Inner highlight for 3D effect */}
            <filter id="innerLight">
              <feOffset dx="0" dy="1" />
              <feGaussianBlur stdDeviation="0.5" result="offset-blur" />
              <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
              <feFlood floodColor="white" floodOpacity="0.4" result="color" />
              <feComposite operator="in" in="color" in2="inverse" result="shadow" />
              <feComposite operator="over" in="shadow" in2="SourceGraphic" />
            </filter>
          </defs>

          {US_STATE_PATHS.map((state) => {
            const stateCode = STATE_NAME_TO_CODE[state.name];
            if (!stateCode) return null;

            const playerCount = playersByState[stateCode] || 0;
            const isSelected = selectedStates.includes(stateCode);
            const isHovered = hoveredState === stateCode;
            const isActive = activeState === stateCode;

            // Microinteraction styles
            const baseFill = isSelected ? '#059669' : colorScale(playerCount);
            const hoverFill = isSelected ? '#047857' : isHovered ? '#22c55e' : baseFill;
            const activeFill = isSelected ? '#065f46' : '#16a34a';

            return (
              <g key={state.name} className="state-group">
                {/* Shadow layer for 3D depth */}
                <path
                  d={state.d}
                  fill="rgba(0,0,0,0.08)"
                  className="pointer-events-none"
                  style={{
                    transform: 'translate(1px, 2px)',
                    filter: 'blur(2px)',
                  }}
                />

                {/* Main state path with enhanced 3D styling */}
                <path
                  d={state.d}
                  fill={isActive ? activeFill : isHovered ? hoverFill : baseFill}
                  stroke={isSelected ? '#047857' : isHovered ? '#16a34a' : 'rgba(148, 163, 184, 0.5)'}
                  strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 0.8}
                  className="cursor-pointer"
                  filter={isSelected ? 'url(#selectedGlow)' : isHovered ? 'url(#glow)' : 'url(#stateShadow)'}
                  style={{
                    transition: 'all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transform: isActive
                      ? 'scale(0.96) translate(0.5px, 1px)'
                      : isHovered
                        ? 'scale(1.04) translate(-0.5px, -2px)'
                        : 'scale(1)',
                    transformOrigin: 'center',
                    transformBox: 'fill-box',
                    opacity: isHovered || isSelected ? 1 : 0.95,
                  }}
                  onMouseEnter={() => setHoveredState(stateCode)}
                  onMouseLeave={() => setHoveredState(null)}
                  onClick={() => handleStateClick(stateCode)}
                />

                {/* Gradient overlay for 3D sheen effect */}
                <path
                  d={state.d}
                  fill="url(#stateGradient)"
                  className="pointer-events-none"
                  style={{
                    opacity: isHovered ? 0.6 : 0.4,
                    transition: 'opacity 150ms ease',
                  }}
                />

                {/* Top highlight for 3D bevel effect */}
                <path
                  d={state.d}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.5)"
                  strokeWidth={isSelected ? 1.5 : 0.8}
                  className="pointer-events-none"
                  style={{
                    transform: 'translate(-0.3px, -0.3px)',
                    opacity: isHovered ? 0.8 : 0.5,
                    transition: 'opacity 150ms ease',
                  }}
                />

                {/* Selected state glow ring with pulse animation */}
                {isSelected && (
                  <>
                    <path
                      d={state.d}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={4}
                      className="pointer-events-none"
                      style={{
                        opacity: 0.25,
                        filter: 'blur(6px)',
                        animation: 'map-pulse-ring 2s ease-in-out infinite',
                      }}
                    />
                    {/* Animated dashed border */}
                    <path
                      d={state.d}
                      fill="none"
                      stroke="#059669"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      className="pointer-events-none"
                      style={{
                        opacity: 0.5,
                        animation: 'map-dash-rotate 20s linear infinite',
                      }}
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Premium Glass Tooltip */}
      {hoveredState && (
        <div
          className="fixed pointer-events-none z-50 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: tooltipPos.x + 16,
            top: tooltipPos.y - 80,
          }}
        >
          <div
            className="relative px-5 py-4 rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(16px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: `
                0 20px 40px -12px rgba(0, 0, 0, 0.4),
                0 8px 16px -8px rgba(0, 0, 0, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `,
            }}
          >
            {/* Top shine line */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
              }}
            />

            {/* Content */}
            <div className="flex items-center gap-3">
              {/* Color indicator with glow */}
              <div className="relative">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: colorScale(playersByState[hoveredState] || 0),
                    boxShadow: `0 0 8px ${colorScale(playersByState[hoveredState] || 0)}`,
                  }}
                />
              </div>

              <div>
                <p className="font-semibold text-white text-base">
                  {STATE_CODE_TO_NAME[hoveredState]}
                </p>
                <p className="text-warm-300 text-sm mt-0.5">
                  <span className="font-semibold text-white tabular-nums">
                    {(playersByState[hoveredState] || 0).toLocaleString()}
                  </span>
                  {' '}{playersByState[hoveredState] !== 1 ? itemLabelPlural : itemLabel}
                </p>
              </div>
            </div>

            {/* Hint text */}
            <p className="text-micro text-warm-500 mt-2 uppercase tracking-wider">
              Click to filter
            </p>

            {/* Pointer arrow */}
            <div
              className="absolute -left-2 top-1/2 -tranwarm-y-1/2 w-4 h-4 rotate-45"
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            />
          </div>
        </div>
      )}

      {/* Premium Legend */}
      <div
        className="absolute bottom-5 right-5 z-10"
      >
        <div
          className="px-5 py-4 rounded-2xl"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: `
              0 12px 32px -8px rgba(0, 0, 0, 0.12),
              0 4px 12px -4px rgba(0, 0, 0, 0.08),
              inset 0 1px 0 rgba(255, 255, 255, 0.8)
            `,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-6 mb-3">
            <span className="text-xs font-bold text-warm-700 uppercase tracking-wider">
              {itemLabelCapital}
            </span>
            <span className="text-xs font-semibold text-warm-500 tabular-nums">
              {totalPlayers.toLocaleString()} total
            </span>
          </div>

          {/* Gradient bar with enhanced styling */}
          <div className="relative">
            <div
              className="flex items-center h-4 rounded-full overflow-hidden"
              style={{
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              {['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d'].map((color, i) => (
                <div
                  key={color}
                  className="flex-1 h-full transition-all duration-200 hover:scale-y-125"
                  style={{
                    backgroundColor: color,
                    borderRadius: i === 0 ? '9999px 0 0 9999px' : i === 7 ? '0 9999px 9999px 0' : '0',
                  }}
                />
              ))}
            </div>

            {/* Scale markers */}
            <div className="flex justify-between mt-1.5">
              <span className="text-micro font-medium text-warm-400">0</span>
              <span className="text-micro font-medium text-warm-400">{Math.round(maxPlayers / 2)}</span>
              <span className="text-micro font-medium text-warm-400">{maxPlayers}+</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
