'use client';

import { useState } from 'react';
import type { PlayerStats } from '@/lib/golf/stats-calculator';
import { 
  IconGolf, 
  IconTarget, 
  IconFlag,
  IconTrendingUp,
  IconChartBar
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

type StatCategory = 'driving' | 'putting' | 'approach' | 'scrambling' | 'scoring';

interface StatItemProps {
  label: string;
  value: string | number | null;
  unit?: string;
  highlight?: boolean;
  trend?: 'up' | 'down' | 'neutral';
}

interface StatsDisplayProps {
  stats: PlayerStats;
  isLoading?: boolean;
}

// ============================================================================
// STAT ITEM COMPONENT
// ============================================================================

function StatItem({ label, value, unit, highlight, trend }: StatItemProps) {
  const displayValue = value === null ? '—' : value;
  
  return (
    <div className={`p-4 rounded-xl border ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${highlight ? 'text-green-600' : 'text-slate-900'}`}>
          {displayValue}
        </span>
        {unit && value !== null && (
          <span className="text-sm text-slate-500">{unit}</span>
        )}
        {trend && value !== null && (
          <span className={`ml-2 text-xs font-medium ${
            trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-slate-400'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
          </span>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">
        {value === null ? '—' : `${value}${unit || ''}`}
      </span>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">{title}</h3>
      <div className="space-y-0">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY COMPONENTS
// ============================================================================

function DrivingStats({ stats }: { stats: PlayerStats }) {
  const { driving, gir } = stats;
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatItem 
          label="Driving Distance" 
          value={driving.drivingDistanceAvg} 
          unit="yds"
          highlight
        />
        <StatItem 
          label="Fairway %" 
          value={driving.fairwayPercentage} 
          unit="%"
          highlight
        />
        <StatItem 
          label="Driver Distance" 
          value={driving.drivingDistanceDriverOnly} 
          unit="yds"
        />
        <StatItem 
          label="FW/Round" 
          value={driving.avgFairwaysPerRound} 
        />
      </div>
      
      {/* Detailed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatSection title="Fairway Accuracy">
          <StatRow label="Fairways Hit" value={`${driving.fairwaysHit}/${driving.fairwayOpportunities}`} />
          <StatRow label="Par 4 FW%" value={driving.fairwayPctPar4} unit="%" />
          <StatRow label="Par 5 FW%" value={driving.fairwayPctPar5} unit="%" />
          <StatRow label="Driver FW%" value={driving.fairwayPctDriver} unit="%" />
          <StatRow label="Non-Driver FW%" value={driving.fairwayPctNonDriver} unit="%" />
        </StatSection>
        
        <StatSection title="Miss Direction">
          <StatRow label="Miss Left" value={driving.missLeftPct} unit="%" />
          <StatRow label="Miss Right" value={driving.missRightPct} unit="%" />
          <StatRow label="Left Misses" value={driving.missLeftCount} />
          <StatRow label="Right Misses" value={driving.missRightCount} />
        </StatSection>
      </div>
      
      {/* GIR Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatItem 
          label="GIR %" 
          value={gir.girPercentage} 
          unit="%"
          highlight
        />
        <StatItem 
          label="GIR/Round" 
          value={gir.girPerRound} 
        />
        <StatItem 
          label="Total GIR" 
          value={gir.girTotal} 
        />
        <StatItem 
          label="Opportunities" 
          value={gir.girOpportunities} 
        />
      </div>
      
      <StatSection title="GIR by Hole Type">
        <StatRow label="Par 3 GIR%" value={gir.girPctPar3} unit="%" />
        <StatRow label="Par 4 GIR%" value={gir.girPctPar4} unit="%" />
        <StatRow label="Par 5 GIR%" value={gir.girPctPar5} unit="%" />
      </StatSection>
    </div>
  );
}

function PuttingStats({ stats }: { stats: PlayerStats }) {
  const { putting } = stats;
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatItem 
          label="Putts/Round" 
          value={putting.puttsPerRound} 
          highlight
        />
        <StatItem 
          label="Putts/GIR" 
          value={putting.puttsPerGir} 
          highlight
        />
        <StatItem 
          label="3-Putts/Round" 
          value={putting.threePuttsPerRound} 
        />
        <StatItem 
          label="1-Putts" 
          value={putting.onePuttsTotal} 
        />
      </div>
      
      {/* Make Percentage by Distance */}
      <StatSection title="Make % by Distance">
        <StatRow label="0-3 feet" value={putting.puttMakePct0_3} unit="%" />
        <StatRow label="3-5 feet" value={putting.puttMakePct3_5} unit="%" />
        <StatRow label="5-10 feet" value={putting.puttMakePct5_10} unit="%" />
        <StatRow label="10-15 feet" value={putting.puttMakePct10_15} unit="%" />
        <StatRow label="15-20 feet" value={putting.puttMakePct15_20} unit="%" />
        <StatRow label="20-25 feet" value={putting.puttMakePct20_25} unit="%" />
        <StatRow label="25-30 feet" value={putting.puttMakePct25_30} unit="%" />
        <StatRow label="30-35 feet" value={putting.puttMakePct30_35} unit="%" />
        <StatRow label="35+ feet" value={putting.puttMakePct35Plus} unit="%" />
      </StatSection>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Putting Proximity */}
        <StatSection title="First Putt Leave (avg)">
          <StatRow label="Overall Avg" value={putting.puttProximityAvg} unit=" ft" />
          <StatRow label="From 5-10 ft" value={putting.puttProximity5_10} unit=" ft" />
          <StatRow label="From 10-15 ft" value={putting.puttProximity10_15} unit=" ft" />
          <StatRow label="From 15-20 ft" value={putting.puttProximity15_20} unit=" ft" />
          <StatRow label="From 20+ ft" value={putting.puttProximity20Plus} unit=" ft" />
        </StatSection>
        
        {/* Putting Efficiency */}
        <StatSection title="Avg Putts to Hole">
          <StatRow label="From 0-3 ft" value={putting.puttEfficiency0_3} />
          <StatRow label="From 3-5 ft" value={putting.puttEfficiency3_5} />
          <StatRow label="From 5-10 ft" value={putting.puttEfficiency5_10} />
          <StatRow label="From 10-15 ft" value={putting.puttEfficiency10_15} />
          <StatRow label="From 15-20 ft" value={putting.puttEfficiency15_20} />
          <StatRow label="From 20-25 ft" value={putting.puttEfficiency20_25} />
          <StatRow label="From 25-30 ft" value={putting.puttEfficiency25_30} />
          <StatRow label="From 30+ ft" value={putting.puttEfficiency30Plus} />
        </StatSection>
      </div>
      
      {/* Miss Direction */}
      <StatSection title="Putt Miss Direction">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Short</div>
            <div className="text-lg font-bold text-slate-900">
              {putting.puttMissShortPct !== null ? `${putting.puttMissShortPct}%` : '—'}
            </div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Long</div>
            <div className="text-lg font-bold text-slate-900">
              {putting.puttMissLongPct !== null ? `${putting.puttMissLongPct}%` : '—'}
            </div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Left</div>
            <div className="text-lg font-bold text-slate-900">
              {putting.puttMissLeftPct !== null ? `${putting.puttMissLeftPct}%` : '—'}
            </div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Right</div>
            <div className="text-lg font-bold text-slate-900">
              {putting.puttMissRightPct !== null ? `${putting.puttMissRightPct}%` : '—'}
            </div>
          </div>
        </div>
      </StatSection>
    </div>
  );
}

function ApproachStats({ stats }: { stats: PlayerStats }) {
  const { approach } = stats;
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatItem 
          label="Avg Proximity" 
          value={approach.approachProximityAvg} 
          unit=" ft"
          highlight
        />
        <StatItem 
          label="From Fairway" 
          value={approach.approachProximityFairway} 
          unit=" ft"
        />
        <StatItem 
          label="From Rough" 
          value={approach.approachProximityRough} 
          unit=" ft"
        />
      </div>
      
      {/* Proximity by Hole Type */}
      <StatSection title="Proximity by Hole Type">
        <StatRow label="Par 3s" value={approach.approachProximityPar3} unit=" ft" />
        <StatRow label="Par 4s" value={approach.approachProximityPar4} unit=" ft" />
        <StatRow label="Par 5s" value={approach.approachProximityPar5} unit=" ft" />
      </StatSection>
      
      {/* Proximity by Distance */}
      <StatSection title="Proximity by Approach Distance">
        <StatRow label="30-75 yards" value={approach.approachProx30_75} unit=" ft" />
        <StatRow label="75-100 yards" value={approach.approachProx75_100} unit=" ft" />
        <StatRow label="100-125 yards" value={approach.approachProx100_125} unit=" ft" />
        <StatRow label="125-150 yards" value={approach.approachProx125_150} unit=" ft" />
        <StatRow label="150-175 yards" value={approach.approachProx150_175} unit=" ft" />
        <StatRow label="175-200 yards" value={approach.approachProx175_200} unit=" ft" />
        <StatRow label="200-225 yards" value={approach.approachProx200_225} unit=" ft" />
        <StatRow label="225+ yards" value={approach.approachProx225Plus} unit=" ft" />
      </StatSection>
      
      {/* Proximity by Lie */}
      <StatSection title="Proximity by Lie Type">
        <StatRow label="From Fairway" value={approach.approachProximityFairway} unit=" ft" />
        <StatRow label="From Rough" value={approach.approachProximityRough} unit=" ft" />
        <StatRow label="From Sand" value={approach.approachProximitySand} unit=" ft" />
      </StatSection>
    </div>
  );
}

function ScramblingStats({ stats }: { stats: PlayerStats }) {
  const { scrambling } = stats;
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatItem 
          label="Scrambling %" 
          value={scrambling.scramblingPercentage} 
          unit="%"
          highlight
        />
        <StatItem 
          label="Sand Save %" 
          value={scrambling.sandSavePercentage} 
          unit="%"
          highlight
        />
        <StatItem 
          label="Scrambles" 
          value={`${scrambling.scramblesMade}/${scrambling.scrambleAttempts}`} 
        />
        <StatItem 
          label="Sand Saves" 
          value={`${scrambling.sandSavesMade}/${scrambling.sandSaveAttempts}`} 
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scrambling by Lie */}
        <StatSection title="Scrambling by Lie">
          <StatRow label="From Fairway" value={scrambling.scramblingPctFairway} unit="%" />
          <StatRow label="From Rough" value={scrambling.scramblingPctRough} unit="%" />
          <StatRow label="From Sand" value={scrambling.scramblingPctSand} unit="%" />
        </StatSection>
        
        {/* Scrambling by Distance */}
        <StatSection title="Scrambling by Distance">
          <StatRow label="0-10 yards" value={scrambling.scramblingPct0_10} unit="%" />
          <StatRow label="10-20 yards" value={scrambling.scramblingPct10_20} unit="%" />
          <StatRow label="20-30 yards" value={scrambling.scramblingPct20_30} unit="%" />
        </StatSection>
      </div>
      
      {/* Around the Green Efficiency */}
      <StatSection title="Around-the-Green Efficiency (avg strokes to hole)">
        <StatRow label="Overall Average" value={scrambling.atgEfficiencyAvg} />
        <StatRow label="0-10 yards" value={scrambling.atgEfficiency0_10} />
        <StatRow label="10-20 yards" value={scrambling.atgEfficiency10_20} />
        <StatRow label="20-30 yards" value={scrambling.atgEfficiency20_30} />
      </StatSection>
    </div>
  );
}

function ScoringStats({ stats }: { stats: PlayerStats }) {
  const { scoring } = stats;
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatItem 
          label="Scoring Avg" 
          value={scoring.scoringAverage} 
          highlight
        />
        <StatItem 
          label="Best Round" 
          value={scoring.bestRound} 
          highlight
        />
        <StatItem 
          label="Rounds Played" 
          value={scoring.roundsPlayed} 
        />
        <StatItem 
          label="Holes Played" 
          value={scoring.holesPlayed} 
        />
      </div>
      
      {/* Score Distribution */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Score Distribution</h3>
        <div className="grid grid-cols-5 gap-3">
          <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="text-xs text-yellow-700 mb-1">Eagles</div>
            <div className="text-xl font-bold text-yellow-700">{scoring.totalEagles}</div>
            <div className="text-xs text-yellow-600">{scoring.eaglesPerRound}/rd</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="text-xs text-red-700 mb-1">Birdies</div>
            <div className="text-xl font-bold text-red-700">{scoring.totalBirdies}</div>
            <div className="text-xs text-red-600">{scoring.birdiesPerRound}/rd</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-xs text-slate-700 mb-1">Pars</div>
            <div className="text-xl font-bold text-slate-700">{scoring.totalPars}</div>
            <div className="text-xs text-slate-600">{scoring.parsPerRound}/rd</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs text-blue-700 mb-1">Bogeys</div>
            <div className="text-xl font-bold text-blue-700">{scoring.totalBogeys}</div>
            <div className="text-xs text-blue-600">{scoring.bogeysPerRound}/rd</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-xs text-purple-700 mb-1">Double+</div>
            <div className="text-xl font-bold text-purple-700">{scoring.totalDoublePlus}</div>
            <div className="text-xs text-purple-600">{scoring.doublePlusPerRound}/rd</div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scoring by Round Type */}
        <StatSection title="Scoring by Round Type">
          <StatRow label="Practice Average" value={scoring.practiceScoringAvg} />
          <StatRow label="Practice Rounds" value={scoring.practiceRounds} />
          <StatRow label="Qualifying Average" value={scoring.qualifyingScoringAvg} />
          <StatRow label="Qualifying Rounds" value={scoring.qualifyingRounds} />
          <StatRow label="Tournament Average" value={scoring.tournamentScoringAvg} />
          <StatRow label="Tournament Rounds" value={scoring.tournamentRounds} />
        </StatSection>
        
        {/* Streaks */}
        <StatSection title="Streaks & Records">
          <StatRow label="Most Birdies (Round)" value={scoring.mostBirdiesRound} />
          <StatRow label="Most Birdies in a Row" value={scoring.mostBirdiesRow} />
          <StatRow label="Most Pars in a Row" value={scoring.mostParsRow} />
          <StatRow label="Current No 3-Putt Streak" value={scoring.currentNo3PuttStreak} unit=" holes" />
          <StatRow label="Longest No 3-Putt Streak" value={scoring.longestNo3PuttStreak} unit=" holes" />
          <StatRow label="Longest Hole Out" value={scoring.longestHoleOut} unit=" yds" />
        </StatSection>
      </div>
      
      {/* Penalties */}
      <div className="grid grid-cols-2 gap-4">
        <StatItem 
          label="Total Penalties" 
          value={scoring.totalPenalties} 
        />
        <StatItem 
          label="Penalties/Round" 
          value={scoring.penaltiesPerRound} 
        />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StatsDisplay({ stats, isLoading }: StatsDisplayProps) {
  const [activeCategory, setActiveCategory] = useState<StatCategory>('scoring');
  
  const categories: { id: StatCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'scoring', label: 'Scoring', icon: <IconChartBar size={16} /> },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={16} /> },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={16} /> },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={16} /> },
    { id: 'scrambling', label: 'Scrambling', icon: <IconTrendingUp size={16} /> },
  ];
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeCategory === cat.id
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-green-300 hover:bg-green-50'
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>
      
      {/* Stats Content */}
      <div className="mt-6">
        {activeCategory === 'driving' && <DrivingStats stats={stats} />}
        {activeCategory === 'putting' && <PuttingStats stats={stats} />}
        {activeCategory === 'approach' && <ApproachStats stats={stats} />}
        {activeCategory === 'scrambling' && <ScramblingStats stats={stats} />}
        {activeCategory === 'scoring' && <ScoringStats stats={stats} />}
      </div>
      
      {/* Last Updated */}
      <div className="text-center text-xs text-slate-400 pt-4">
        Stats last calculated: {new Date(stats.lastCalculatedAt).toLocaleString()}
      </div>
    </div>
  );
}
