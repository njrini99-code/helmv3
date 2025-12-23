'use client';

import { useState } from 'react';
import { IconTrendingUp, IconTarget, IconFlag, IconGolf, IconAward } from '@/components/icons';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator';

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling';

interface StatsDisplayProps {
  stats: GolfStats;
  playerName?: string;
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({ 
  label, 
  value, 
  subValue,
  highlight = false,
  large = false,
}: { 
  label: string; 
  value: string; 
  subValue?: string;
  highlight?: boolean;
  large?: boolean;
}) {
  return (
    <div className={`p-4 rounded-xl border ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`font-bold ${large ? 'text-3xl' : 'text-2xl'} ${highlight ? 'text-green-600' : 'text-slate-900'}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-slate-400 mt-0.5">{subValue}</div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ============================================================================
// CATEGORY COMPONENTS
// ============================================================================

function ScoringStats({ stats }: { stats: GolfStats }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label="Scoring Average" 
          value={formatStat(stats.scoringAverage, '', 2)} 
          highlight 
          large 
        />
        <StatCard 
          label="Best Round" 
          value={formatStatInt(stats.bestRound)} 
        />
        <StatCard 
          label="Worst Round" 
          value={formatStatInt(stats.worstRound)} 
        />
        <StatCard 
          label="Rounds Played" 
          value={formatStatInt(stats.roundsPlayed)} 
        />
      </div>

      {/* Per Round Stats */}
      <StatSection title="Per Round Averages">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{formatStat(stats.eaglesPerRound, '', 2)}</div>
            <div className="text-xs text-slate-500">Eagles</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-500">{formatStat(stats.birdiesPerRound, '', 2)}</div>
            <div className="text-xs text-slate-500">Birdies</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-700">{formatStat(stats.parsPerRound, '', 2)}</div>
            <div className="text-xs text-slate-500">Pars</div>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{formatStat(stats.bogeysPerRound, '', 2)}</div>
            <div className="text-xs text-slate-500">Bogeys</div>
          </div>
          <div className="text-center p-3 bg-red-100 rounded-lg">
            <div className="text-2xl font-bold text-red-700">{formatStat(stats.doublePlusPerRound, '', 2)}</div>
            <div className="text-xs text-slate-500">Double+</div>
          </div>
        </div>
      </StatSection>

      {/* Totals */}
      <StatSection title="Career Totals">
        <StatRow label="Total Birdies" value={formatStatInt(stats.totalBirdies)} />
        <StatRow label="Total Eagles" value={formatStatInt(stats.totalEagles)} />
        <StatRow label="Total Pars" value={formatStatInt(stats.totalPars)} />
        <StatRow label="Total Bogeys" value={formatStatInt(stats.totalBogeys)} />
        <StatRow label="Double Bogey+" value={formatStatInt(stats.totalDoublePlus)} />
      </StatSection>

      {/* By Round Type */}
      <StatSection title="Scoring by Round Type">
        <StatRow label="Practice Rounds" value={`${formatStat(stats.practiceScoringAvg, '', 2)} (${stats.practiceRounds} rounds)`} />
        <StatRow label="Qualifying Rounds" value={`${formatStat(stats.qualifyingScoringAvg, '', 2)} (${stats.qualifyingRounds} rounds)`} />
        <StatRow label="Tournament Rounds" value={`${formatStat(stats.tournamentScoringAvg, '', 2)} (${stats.tournamentRounds} rounds)`} />
      </StatSection>

      {/* Streaks */}
      <StatSection title="Streaks & Records">
        <StatRow label="Most Birdies in a Round" value={formatStatInt(stats.mostBirdiesRound)} />
        <StatRow label="Most Birdies in a Row" value={formatStatInt(stats.mostBirdiesRow)} />
        <StatRow label="Most Pars in a Row" value={formatStatInt(stats.mostParsRow)} />
        <StatRow label="Current No 3-Putt Streak" value={`${formatStatInt(stats.currentNo3PuttStreak)} holes`} />
        <StatRow label="Longest No 3-Putt Streak" value={`${formatStatInt(stats.longestNo3PuttStreak)} holes`} />
        <StatRow label="Longest Hole Out" value={stats.longestHoleOut ? `${stats.longestHoleOut} yards` : '-'} />
      </StatSection>
    </div>
  );
}

function DrivingStats({ stats }: { stats: GolfStats }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label="Driving Distance" 
          value={stats.drivingDistanceAvg ? `${Math.round(stats.drivingDistanceAvg)}` : '-'} 
          subValue="yards avg"
          highlight 
          large 
        />
        <StatCard 
          label="Driver Only" 
          value={stats.drivingDistanceDriverOnly ? `${Math.round(stats.drivingDistanceDriverOnly)}` : '-'} 
          subValue="yards avg"
        />
        <StatCard 
          label="Fairway %" 
          value={formatStat(stats.fairwayPercentage, '%')} 
        />
        <StatCard 
          label="Fairways/Round" 
          value={stats.fairwayOpportunities > 0 ? formatStat(stats.fairwaysHit / stats.roundsPlayed, '', 1) : '-'} 
        />
      </div>

      {/* Fairway by Hole Type */}
      <StatSection title="Fairway % by Hole Type">
        <StatRow label="Par 4s" value={formatStat(stats.fairwayPctPar4, '%')} />
        <StatRow label="Par 5s" value={formatStat(stats.fairwayPctPar5, '%')} />
      </StatSection>

      {/* Fairway by Club */}
      <StatSection title="Fairway % by Club">
        <StatRow label="With Driver" value={formatStat(stats.fairwayPctDriver, '%')} />
        <StatRow label="Without Driver" value={formatStat(stats.fairwayPctNonDriver, '%')} />
      </StatSection>

      {/* Miss Direction */}
      <StatSection title="Miss Direction (when missing fairway)">
        <div className="flex items-center justify-center gap-8 py-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{formatStat(stats.missLeftPct, '%')}</div>
            <div className="text-sm text-slate-500">← Left</div>
          </div>
          <div className="w-px h-12 bg-slate-200" />
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">{formatStat(stats.missRightPct, '%')}</div>
            <div className="text-sm text-slate-500">Right →</div>
          </div>
        </div>
        <div className="text-center text-xs text-slate-400">
          {stats.missLeftCount} left / {stats.missRightCount} right
        </div>
      </StatSection>

      {/* Totals */}
      <StatSection title="Totals">
        <StatRow label="Fairways Hit" value={`${stats.fairwaysHit} / ${stats.fairwayOpportunities}`} />
        <StatRow label="Holes Played" value={formatStatInt(stats.holesPlayed)} />
      </StatSection>
    </div>
  );
}

function ApproachStats({ stats }: { stats: GolfStats }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label="GIR %" 
          value={formatStat(stats.girPercentage, '%')} 
          highlight 
          large 
        />
        <StatCard 
          label="GIR / Round" 
          value={formatStat(stats.girPerRound, '', 1)} 
        />
        <StatCard 
          label="Approach Proximity" 
          value={stats.approachProximityAvg ? `${Math.round(stats.approachProximityAvg)}'` : '-'} 
          subValue="avg to hole"
        />
        <StatCard 
          label="Total GIR" 
          value={`${stats.girTotal}/${stats.girOpportunities}`} 
        />
      </div>

      {/* GIR by Hole Type */}
      <StatSection title="GIR % by Hole Type">
        <StatRow label="Par 3s" value={formatStat(stats.girPctPar3, '%')} />
        <StatRow label="Par 4s" value={formatStat(stats.girPctPar4, '%')} />
        <StatRow label="Par 5s" value={formatStat(stats.girPctPar5, '%')} />
      </StatSection>

      {/* Proximity by Hole Type */}
      <StatSection title="Approach Proximity by Hole Type (feet)">
        <StatRow label="Par 3s" value={stats.approachProximityPar3 ? `${Math.round(stats.approachProximityPar3)}'` : '-'} />
        <StatRow label="Par 4s" value={stats.approachProximityPar4 ? `${Math.round(stats.approachProximityPar4)}'` : '-'} />
        <StatRow label="Par 5s" value={stats.approachProximityPar5 ? `${Math.round(stats.approachProximityPar5)}'` : '-'} />
      </StatSection>

      {/* Proximity by Lie */}
      <StatSection title="Approach Proximity by Lie (feet)">
        <StatRow label="From Fairway" value={stats.approachProximityFairway ? `${Math.round(stats.approachProximityFairway)}'` : '-'} />
        <StatRow label="From Rough" value={stats.approachProximityRough ? `${Math.round(stats.approachProximityRough)}'` : '-'} />
        <StatRow label="From Sand" value={stats.approachProximitySand ? `${Math.round(stats.approachProximitySand)}'` : '-'} />
      </StatSection>

      {/* Proximity by Distance */}
      <StatSection title="Approach Proximity by Distance (feet from hole)">
        <StatRow label="30-75 yards" value={stats.approachProx30_75 ? `${Math.round(stats.approachProx30_75)}'` : '-'} />
        <StatRow label="75-100 yards" value={stats.approachProx75_100 ? `${Math.round(stats.approachProx75_100)}'` : '-'} />
        <StatRow label="100-125 yards" value={stats.approachProx100_125 ? `${Math.round(stats.approachProx100_125)}'` : '-'} />
        <StatRow label="125-150 yards" value={stats.approachProx125_150 ? `${Math.round(stats.approachProx125_150)}'` : '-'} />
        <StatRow label="150-175 yards" value={stats.approachProx150_175 ? `${Math.round(stats.approachProx150_175)}'` : '-'} />
        <StatRow label="175-200 yards" value={stats.approachProx175_200 ? `${Math.round(stats.approachProx175_200)}'` : '-'} />
        <StatRow label="200-225 yards" value={stats.approachProx200_225 ? `${Math.round(stats.approachProx200_225)}'` : '-'} />
        <StatRow label="225+ yards" value={stats.approachProx225Plus ? `${Math.round(stats.approachProx225Plus)}'` : '-'} />
      </StatSection>

      {/* Approach Efficiency */}
      <StatSection title="Approach Efficiency (avg strokes to hole out)">
        <StatRow label="30-75 yards" value={formatStat(stats.approachEff30_75, '', 2)} />
        <StatRow label="75-100 yards" value={formatStat(stats.approachEff75_100, '', 2)} />
        <StatRow label="100-125 yards" value={formatStat(stats.approachEff100_125, '', 2)} />
        <StatRow label="125-150 yards" value={formatStat(stats.approachEff125_150, '', 2)} />
        <StatRow label="150-175 yards" value={formatStat(stats.approachEff150_175, '', 2)} />
        <StatRow label="175-200 yards" value={formatStat(stats.approachEff175_200, '', 2)} />
        <StatRow label="200-225 yards" value={formatStat(stats.approachEff200_225, '', 2)} />
        <StatRow label="225+ yards" value={formatStat(stats.approachEff225Plus, '', 2)} />
      </StatSection>
    </div>
  );
}

function PuttingStats({ stats }: { stats: GolfStats }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label="Putts / Round" 
          value={formatStat(stats.puttsPerRound, '', 1)} 
          highlight 
          large 
        />
        <StatCard 
          label="Putts / GIR" 
          value={formatStat(stats.puttsPerGir, '', 2)} 
        />
        <StatCard 
          label="3-Putts / Round" 
          value={formatStat(stats.threePuttsPerRound, '', 2)} 
        />
        <StatCard 
          label="1-Putts Total" 
          value={formatStatInt(stats.onePuttsTotal)} 
        />
      </div>

      {/* Make % by Distance */}
      <StatSection title="Make % by Distance">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <div className="text-lg font-bold text-green-600">{formatStat(stats.puttMakePct0_3, '%', 0)}</div>
            <div className="text-xs text-slate-500">0-3 ft</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <div className="text-lg font-bold text-green-600">{formatStat(stats.puttMakePct3_5, '%', 0)}</div>
            <div className="text-xs text-slate-500">3-5 ft</div>
          </div>
          <div className="text-center p-2 bg-yellow-50 rounded-lg">
            <div className="text-lg font-bold text-yellow-600">{formatStat(stats.puttMakePct5_10, '%', 0)}</div>
            <div className="text-xs text-slate-500">5-10 ft</div>
          </div>
          <div className="text-center p-2 bg-orange-50 rounded-lg">
            <div className="text-lg font-bold text-orange-600">{formatStat(stats.puttMakePct10_15, '%', 0)}</div>
            <div className="text-xs text-slate-500">10-15 ft</div>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <div className="text-lg font-bold text-red-600">{formatStat(stats.puttMakePct15_20, '%', 0)}</div>
            <div className="text-xs text-slate-500">15-20 ft</div>
          </div>
        </div>
        <StatRow label="20-25 feet" value={formatStat(stats.puttMakePct20_25, '%')} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttMakePct25_30, '%')} />
        <StatRow label="30-35 feet" value={formatStat(stats.puttMakePct30_35, '%')} />
        <StatRow label="35+ feet" value={formatStat(stats.puttMakePct35Plus, '%')} />
      </StatSection>

      {/* Putting Proximity */}
      <StatSection title="First Putt Leave (avg feet remaining)">
        <StatRow label="Overall Average" value={stats.puttProximityAvg ? `${stats.puttProximityAvg.toFixed(1)}'` : '-'} />
        <StatRow label="From 5-10 feet" value={stats.puttProximity5_10 ? `${stats.puttProximity5_10.toFixed(1)}'` : '-'} />
        <StatRow label="From 10-15 feet" value={stats.puttProximity10_15 ? `${stats.puttProximity10_15.toFixed(1)}'` : '-'} />
        <StatRow label="From 15-20 feet" value={stats.puttProximity15_20 ? `${stats.puttProximity15_20.toFixed(1)}'` : '-'} />
        <StatRow label="From 20+ feet" value={stats.puttProximity20Plus ? `${stats.puttProximity20Plus.toFixed(1)}'` : '-'} />
      </StatSection>

      {/* Putting Efficiency */}
      <StatSection title="Putting Efficiency (avg putts to hole out)">
        <StatRow label="0-3 feet" value={formatStat(stats.puttEfficiency0_3, '', 2)} />
        <StatRow label="3-5 feet" value={formatStat(stats.puttEfficiency3_5, '', 2)} />
        <StatRow label="5-10 feet" value={formatStat(stats.puttEfficiency5_10, '', 2)} />
        <StatRow label="10-15 feet" value={formatStat(stats.puttEfficiency10_15, '', 2)} />
        <StatRow label="15-20 feet" value={formatStat(stats.puttEfficiency15_20, '', 2)} />
        <StatRow label="20-25 feet" value={formatStat(stats.puttEfficiency20_25, '', 2)} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttEfficiency25_30, '', 2)} />
        <StatRow label="30+ feet" value={formatStat(stats.puttEfficiency30Plus, '', 2)} />
      </StatSection>

      {/* Miss Direction */}
      <StatSection title="Putt Miss Direction">
        <div className="grid grid-cols-4 gap-2 py-4">
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{formatStat(stats.puttMissShortPct, '%', 0)}</div>
            <div className="text-xs text-slate-500">Short</div>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{formatStat(stats.puttMissLongPct, '%', 0)}</div>
            <div className="text-xs text-slate-500">Long</div>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{formatStat(stats.puttMissLeftPct, '%', 0)}</div>
            <div className="text-xs text-slate-500">Left</div>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{formatStat(stats.puttMissRightPct, '%', 0)}</div>
            <div className="text-xs text-slate-500">Right</div>
          </div>
        </div>
      </StatSection>

      {/* Totals */}
      <StatSection title="Totals">
        <StatRow label="Total Putts" value={formatStatInt(stats.totalPutts)} />
        <StatRow label="Total 3-Putts" value={formatStatInt(stats.threePuttsTotal)} />
        <StatRow label="Putts per Hole" value={formatStat(stats.puttsPerHole, '', 2)} />
      </StatSection>
    </div>
  );
}

function ScramblingStats({ stats }: { stats: GolfStats }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          label="Scrambling %" 
          value={formatStat(stats.scramblingPercentage, '%')} 
          highlight 
          large 
        />
        <StatCard 
          label="Sand Save %" 
          value={formatStat(stats.sandSavePercentage, '%')} 
        />
        <StatCard 
          label="Scrambles Made" 
          value={`${stats.scramblesMade}/${stats.scrambleAttempts}`} 
        />
        <StatCard 
          label="Penalties / Round" 
          value={formatStat(stats.penaltiesPerRound, '', 2)} 
        />
      </div>

      {/* Scrambling by Lie */}
      <StatSection title="Scrambling % by Lie">
        <StatRow label="From Fairway" value={formatStat(stats.scramblingPctFairway, '%')} />
        <StatRow label="From Rough" value={formatStat(stats.scramblingPctRough, '%')} />
        <StatRow label="From Sand" value={formatStat(stats.scramblingPctSand, '%')} />
      </StatSection>

      {/* Scrambling by Distance */}
      <StatSection title="Scrambling % by Distance">
        <StatRow label="0-10 yards" value={formatStat(stats.scramblingPct0_10, '%')} />
        <StatRow label="10-20 yards" value={formatStat(stats.scramblingPct10_20, '%')} />
        <StatRow label="20-30 yards" value={formatStat(stats.scramblingPct20_30, '%')} />
      </StatSection>

      {/* Around the Green Efficiency */}
      <StatSection title="Around the Green Efficiency (avg strokes to hole out)">
        <StatRow label="Overall Average" value={formatStat(stats.atgEfficiencyAvg, '', 2)} />
        <StatRow label="0-10 yards" value={formatStat(stats.atgEfficiency0_10, '', 2)} />
        <StatRow label="10-20 yards" value={formatStat(stats.atgEfficiency10_20, '', 2)} />
        <StatRow label="20-30 yards" value={formatStat(stats.atgEfficiency20_30, '', 2)} />
      </StatSection>

      {/* ATG Efficiency by Lie */}
      <StatSection title="Around the Green by Lie (avg strokes)">
        <StatRow label="From Fairway" value={formatStat(stats.atgEffFairway, '', 2)} />
        <StatRow label="From Rough" value={formatStat(stats.atgEffRough, '', 2)} />
        <StatRow label="From Sand" value={formatStat(stats.atgEffSand, '', 2)} />
      </StatSection>

      {/* Sand Saves & Penalties */}
      <StatSection title="Sand Saves & Penalties">
        <StatRow label="Sand Saves" value={`${stats.sandSavesMade} / ${stats.sandSaveAttempts}`} />
        <StatRow label="Total Penalties" value={formatStatInt(stats.totalPenalties)} />
      </StatSection>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GolfStatsDisplay({ stats, playerName }: StatsDisplayProps) {
  const [activeCategory, setActiveCategory] = useState<StatsCategory>('scoring');

  const categories: { id: StatsCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'scoring', label: 'Scoring', icon: <IconAward size={16} /> },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={16} /> },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={16} /> },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={16} /> },
    { id: 'scrambling', label: 'Scrambling', icon: <IconTrendingUp size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {playerName ? `${playerName}'s Stats` : 'My Stats'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {stats.roundsPlayed} rounds • {stats.holesPlayed} holes
          </p>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 -mx-4 px-4">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-green-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-green-300'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Stats Content */}
        <div>
          {activeCategory === 'scoring' && <ScoringStats stats={stats} />}
          {activeCategory === 'driving' && <DrivingStats stats={stats} />}
          {activeCategory === 'approach' && <ApproachStats stats={stats} />}
          {activeCategory === 'putting' && <PuttingStats stats={stats} />}
          {activeCategory === 'scrambling' && <ScramblingStats stats={stats} />}
        </div>

        {/* Empty State */}
        {stats.roundsPlayed === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconGolf size={40} className="text-slate-300" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">No Stats Yet</h2>
            <p className="text-slate-500 max-w-sm mx-auto">
              Complete rounds with shot tracking to see your detailed statistics here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
