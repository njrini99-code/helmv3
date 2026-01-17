'use client';

import { useState } from 'react';
import { IconTrendingUp, IconTarget, IconFlag, IconGolf, IconAward, IconChartBar, IconCrosshair } from '@/components/icons';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat, formatStatInt } from '@/lib/utils/golf-stats-calculator-shots';
import ProgressStats from './ProgressStats';
import ShotDispersionChart from './ShotDispersionChart';

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress' | 'dispersion';

interface RoundOption {
  id: string;
  round_date: string;
  course_name: string;
  total_score: number;
  total_to_par: number;
}

interface StatsDisplayProps {
  stats: GolfStats;
  playerName?: string;
  rounds?: RoundOption[];
  selectedRoundId?: string | 'overall';
  onRoundChange?: (roundId: string | 'overall') => void;
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
    <div className={`relative ${highlight ? 'glass-standard' : 'glass-standard'} rounded-xl overflow-hidden p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}>
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />
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
    <div className="relative glass-standard rounded-2xl overflow-hidden p-4 mb-4 transition-all duration-300">
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />
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
        <StatRow label="Longest Hole Out" value={stats.longestHoleOut ? `${stats.longestHoleOut} feet` : '-'} />
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
          value={formatStat(stats.fairwaysHitPerRound, '', 1)} 
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
      {/* GIR Stats - MOVED FROM DRIVING */}
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
          label="Total GIR"
          value={`${stats.girTotal}/${stats.girOpportunities}`}
        />
        <StatCard
          label="Approach Proximity"
          value={stats.approachProximityAvg ? `${Math.round(stats.approachProximityAvg)}'` : '-'}
        />
      </div>

      {/* GIR % by Par Type */}
      <StatSection title="GIR % by Hole Type">
        <StatRow label="Par 3s" value={formatStat(stats.girPctPar3, '%')} />
        <StatRow label="Par 4s" value={formatStat(stats.girPctPar4, '%')} />
        <StatRow label="Par 5s" value={formatStat(stats.girPctPar5, '%')} />
      </StatSection>

      {/* GIR % by Distance */}
      <StatSection title="GIR % by Approach Distance">
        <StatRow label="50-75 yards" value={formatStat(stats.girPct50_75, '%')} />
        <StatRow label="75-100 yards" value={formatStat(stats.girPct75_100, '%')} />
        <StatRow label="100-125 yards" value={formatStat(stats.girPct100_125, '%')} />
        <StatRow label="125-150 yards" value={formatStat(stats.girPct125_150, '%')} />
        <StatRow label="150-175 yards" value={formatStat(stats.girPct150_175, '%')} />
        <StatRow label="175-200 yards" value={formatStat(stats.girPct175_200, '%')} />
        <StatRow label="200-225 yards" value={formatStat(stats.girPct200_225, '%')} />
        <StatRow label="225+ yards" value={formatStat(stats.girPct225Plus, '%')} />
      </StatSection>

      {/* GIR % by Lie */}
      <StatSection title="GIR % by Lie">
        <StatRow label="From Fairway" value={formatStat(stats.girPctFromFairway, '%')} />
        <StatRow label="From Rough" value={formatStat(stats.girPctFromRough, '%')} />
        <StatRow label="From Sand" value={formatStat(stats.girPctFromSand, '%')} />
      </StatSection>

      {/* Proximity Split */}
      <StatSection title="Proximity Analysis">
        <StatRow
          label="Avg Proximity (All)"
          value={stats.approachProximityAvg ? `${Math.round(stats.approachProximityAvg)}'` : '-'}
        />
        <StatRow
          label="When Hit Green"
          value={stats.approachProximityWhenHitGreen ? `${Math.round(stats.approachProximityWhenHitGreen)}'` : '-'}
        />
        <StatRow
          label="When Missed Green"
          value={stats.approachProximityWhenMissedGreen ? `${Math.round(stats.approachProximityWhenMissedGreen)}'` : '-'}
        />
      </StatSection>

      {/* Proximity by Hole Type */}
      <StatSection title="Proximity by Hole Type (feet)">
        <StatRow label="Par 3s" value={stats.approachProximityPar3 ? `${Math.round(stats.approachProximityPar3)}'` : '-'} />
        <StatRow label="Par 4s" value={stats.approachProximityPar4 ? `${Math.round(stats.approachProximityPar4)}'` : '-'} />
        <StatRow label="Par 5s" value={stats.approachProximityPar5 ? `${Math.round(stats.approachProximityPar5)}'` : '-'} />
      </StatSection>

      {/* Proximity by Lie */}
      <StatSection title="Proximity by Lie (feet)">
        <StatRow label="From Fairway" value={stats.approachProximityFairway ? `${Math.round(stats.approachProximityFairway)}'` : '-'} />
        <StatRow label="From Rough" value={stats.approachProximityRough ? `${Math.round(stats.approachProximityRough)}'` : '-'} />
        <StatRow label="From Sand" value={stats.approachProximitySand ? `${Math.round(stats.approachProximitySand)}'` : '-'} />
      </StatSection>

      {/* Proximity by Distance */}
      <StatSection title="Proximity by Distance (feet from hole)">
        <StatRow label="30-75 yards" value={stats.approachProx30_75 ? `${Math.round(stats.approachProx30_75)}'` : '-'} />
        <StatRow label="75-100 yards" value={stats.approachProx75_100 ? `${Math.round(stats.approachProx75_100)}'` : '-'} />
        <StatRow label="100-125 yards" value={stats.approachProx100_125 ? `${Math.round(stats.approachProx100_125)}'` : '-'} />
        <StatRow label="125-150 yards" value={stats.approachProx125_150 ? `${Math.round(stats.approachProx125_150)}'` : '-'} />
        <StatRow label="150-175 yards" value={stats.approachProx150_175 ? `${Math.round(stats.approachProx150_175)}'` : '-'} />
        <StatRow label="175-200 yards" value={stats.approachProx175_200 ? `${Math.round(stats.approachProx175_200)}'` : '-'} />
        <StatRow label="200-225 yards" value={stats.approachProx200_225 ? `${Math.round(stats.approachProx200_225)}'` : '-'} />
        <StatRow label="225+ yards" value={stats.approachProx225Plus ? `${Math.round(stats.approachProx225Plus)}'` : '-'} />
      </StatSection>

      {/* Approach Efficiency by Lie */}
      <StatSection title="Approach Efficiency (avg strokes to hole out) by Lie">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 font-semibold text-slate-700">Distance</th>
                <th className="text-center py-2 px-2 font-semibold text-green-600">Fairway</th>
                <th className="text-center py-2 px-2 font-semibold text-amber-600">Rough</th>
                <th className="text-center py-2 px-2 font-semibold text-orange-600">Sand</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">30-75 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff30_75.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff30_75.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff30_75.sand, '', 2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">75-100 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff75_100.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff75_100.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff75_100.sand, '', 2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">100-125 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff100_125.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff100_125.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff100_125.sand, '', 2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">125-150 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff125_150.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff125_150.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff125_150.sand, '', 2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">150-175 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff150_175.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff150_175.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff150_175.sand, '', 2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">175-200 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff175_200.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff175_200.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff175_200.sand, '', 2)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-2 text-slate-600">200-225 yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff200_225.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff200_225.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff200_225.sand, '', 2)}</td>
              </tr>
              <tr>
                <td className="py-2 px-2 text-slate-600">225+ yds</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff225Plus.fairway, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff225Plus.rough, '', 2)}</td>
                <td className="py-2 px-2 text-center text-slate-900">{formatStat(stats.approachEff225Plus.sand, '', 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </StatSection>
    </div>
  );
}

function PuttingStats({ stats }: { stats: GolfStats }) {
  const [selectedBreak, setSelectedBreak] = useState<'left_to_right' | 'right_to_left' | 'straight' | 'multiple' | null>(null);

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
        <StatRow label="From 0-5 feet" value={stats.puttProximity0_5 ? `${stats.puttProximity0_5.toFixed(1)}'` : '-'} />
        <StatRow label="From 5-10 feet" value={stats.puttProximity5_10 ? `${stats.puttProximity5_10.toFixed(1)}'` : '-'} />
        <StatRow label="From 10-15 feet" value={stats.puttProximity10_15 ? `${stats.puttProximity10_15.toFixed(1)}'` : '-'} />
        <StatRow label="From 15-20 feet" value={stats.puttProximity15_20 ? `${stats.puttProximity15_20.toFixed(1)}'` : '-'} />
        <StatRow label="From 20+ feet" value={stats.puttProximity20Plus ? `${stats.puttProximity20Plus.toFixed(1)}'` : '-'} />
      </StatSection>

      {/* Putting Efficiency */}
      <StatSection title="Putting Efficiency (avg putts to hole out)">
        <StatRow label="0-5 feet" value={formatStat(stats.puttEff0_5, '', 2)} />
        <StatRow label="5-10 feet" value={formatStat(stats.puttEff5_10, '', 2)} />
        <StatRow label="10-15 feet" value={formatStat(stats.puttEff10_15, '', 2)} />
        <StatRow label="15-20 feet" value={formatStat(stats.puttEff15_20, '', 2)} />
        <StatRow label="20-25 feet" value={formatStat(stats.puttEff20_25, '', 2)} />
        <StatRow label="25-30 feet" value={formatStat(stats.puttEff25_30, '', 2)} />
        <StatRow label="30-35 feet" value={formatStat(stats.puttEff30_35, '', 2)} />
        <StatRow label="35+ feet" value={formatStat(stats.puttEff35Plus, '', 2)} />
      </StatSection>

      {/* Miss Direction */}
      <StatSection title="Putt Miss Direction">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 py-4">
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
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <div className="text-xl font-bold text-blue-700">{formatStat(stats.puttMissLowPct, '%', 0)}</div>
            <div className="text-xs text-slate-500">Low (amateur)</div>
          </div>
          <div className="text-center p-2 bg-purple-50 rounded-lg">
            <div className="text-xl font-bold text-purple-700">{formatStat(stats.puttMissHighPct, '%', 0)}</div>
            <div className="text-xs text-slate-500">High (pro)</div>
          </div>
        </div>
      </StatSection>

      {/* Putting by Break Type */}
      <StatSection title="Putting by Break Type">
        {/* Break Type Toggle */}
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { key: 'left_to_right', label: 'L → R' },
            { key: 'right_to_left', label: 'R → L' },
            { key: 'straight', label: 'Straight' },
            { key: 'multiple', label: 'Multiple' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedBreak(selectedBreak === key ? null : key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedBreak === key
                  ? 'bg-green-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {selectedBreak ? (
          <div className="space-y-4">
            {/* Make % by Distance for Selected Break */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">
                Make % by Distance - {selectedBreak === 'left_to_right' ? 'Left to Right' :
                                      selectedBreak === 'right_to_left' ? 'Right to Left' :
                                      selectedBreak === 'straight' ? 'Straight' : 'Multiple Breaks'}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-green-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct0_3, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">0-3 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-green-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct3_5, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">3-5 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-yellow-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct5_10, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">5-10 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-orange-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct10_15, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">10-15 ft</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-red-600">
                    {formatStat(stats.puttingByBreak[selectedBreak].makePct15_20, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">15-20 ft</div>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <StatRow label="20-25 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct20_25, '%')} />
                <StatRow label="25-30 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct25_30, '%')} />
                <StatRow label="30-35 feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct30_35, '%')} />
                <StatRow label="35+ feet" value={formatStat(stats.puttingByBreak[selectedBreak].makePct35Plus, '%')} />
                <StatRow label="Overall Make %" value={formatStat(stats.puttingByBreak[selectedBreak].overallMakePct, '%')} />
              </div>
            </div>

            {/* Miss Direction for Selected Break */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Miss Direction</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-slate-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missShortPct, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">Short</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-blue-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missLowPct, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">Low</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-lg font-bold text-purple-700">
                    {formatStat(stats.puttingByBreak[selectedBreak].missHighPct, '%', 0)}
                  </div>
                  <div className="text-xs text-slate-500">High</div>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500 italic">
              Total putts with this break: {stats.puttingByBreak[selectedBreak].totalPutts}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 text-center py-4">
            Select a break type above to view detailed statistics
          </div>
        )}
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

function StrokesGainedStats({ stats }: { stats: GolfStats }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="SG Total / Round"
          value={formatStat(stats.sgTotalPerRound, '', 2)}
          highlight
          large
        />
        <StatCard
          label="SG Tee / Round"
          value={formatStat(stats.sgTeePerRound, '', 2)}
        />
        <StatCard
          label="SG Approach / Round"
          value={formatStat(stats.sgApproachPerRound, '', 2)}
        />
        <StatCard
          label="SG Putting / Round"
          value={formatStat(stats.sgPuttingPerRound, '', 2)}
        />
      </div>

      {/* Strokes Gained Overview */}
      <StatSection title="Strokes Gained Overview (vs PGA Tour)">
        <div className="mb-4 text-sm text-slate-600">
          Positive numbers indicate better than PGA Tour average. Negative numbers indicate worse than tour average.
        </div>
        <StatRow label="Total Strokes Gained" value={formatStat(stats.strokesGainedTotal, '', 2)} />
        <StatRow label="Strokes Gained: Tee" value={formatStat(stats.strokesGainedTee, '', 2)} />
        <StatRow label="Strokes Gained: Approach" value={formatStat(stats.strokesGainedApproach, '', 2)} />
        <StatRow label="Strokes Gained: Around Green" value={formatStat(stats.strokesGainedAroundGreen, '', 2)} />
        <StatRow label="Strokes Gained: Putting" value={formatStat(stats.strokesGainedPutting, '', 2)} />
      </StatSection>

      {/* Per Round Breakdown */}
      <StatSection title="Strokes Gained Per Round">
        <StatRow label="SG: Tee per Round" value={formatStat(stats.sgTeePerRound, '', 2)} />
        <StatRow label="SG: Approach per Round" value={formatStat(stats.sgApproachPerRound, '', 2)} />
        <StatRow label="SG: Around Green per Round" value={formatStat(stats.sgAroundGreenPerRound, '', 2)} />
        <StatRow label="SG: Putting per Round" value={formatStat(stats.sgPuttingPerRound, '', 2)} />
        <StatRow label="SG: Total per Round" value={formatStat(stats.sgTotalPerRound, '', 2)} />
      </StatSection>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-blue-900 mb-2">What is Strokes Gained?</div>
        <div className="text-sm text-blue-800 space-y-1">
          <p>Strokes Gained measures performance relative to PGA Tour benchmarks:</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Tee:</strong> Driving performance from the tee</li>
            <li><strong>Approach:</strong> Shots aimed at the green from fairway, rough, or sand</li>
            <li><strong>Around Green:</strong> Shots within 30 yards of the green</li>
            <li><strong>Putting:</strong> All putts on the green</li>
          </ul>
          <p className="mt-2">A positive SG value means you performed better than the tour average for that category.</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GolfStatsDisplay({
  stats,
  playerName,
  rounds = [],
  selectedRoundId = 'overall',
  onRoundChange
}: StatsDisplayProps) {
  const [activeCategory, setActiveCategory] = useState<StatsCategory>('scoring');

  const categories: { id: StatsCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'progress', label: 'Progress', icon: <IconChartBar size={16} /> },
    { id: 'dispersion', label: 'Spray Charts', icon: <IconCrosshair size={16} /> },
    { id: 'scoring', label: 'Scoring', icon: <IconAward size={16} /> },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={16} /> },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={16} /> },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={16} /> },
    { id: 'scrambling', label: 'Scrambling', icon: <IconTrendingUp size={16} /> },
    { id: 'strokes-gained', label: 'Strokes Gained', icon: <IconChartBar size={16} /> },
  ];

  const formatRoundDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {playerName ? `${playerName}'s Stats` : 'My Stats'}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {stats.roundsPlayed} rounds • {stats.holesPlayed} holes
              </p>
            </div>

            {/* Round Selector */}
            {onRoundChange && rounds.length > 0 && (
              <div className="min-w-[200px]">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                  View Stats
                </label>
                <select
                  value={selectedRoundId}
                  onChange={(e) => onRoundChange(e.target.value as string | 'overall')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white hover:border-green-300 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none transition-colors"
                >
                  <option value="overall">Overall Stats</option>
                  <optgroup label="Individual Rounds">
                    {rounds.map(round => (
                      <option key={round.id} value={round.id}>
                        {formatRoundDate(round.round_date)} • {round.course_name} ({round.total_score})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}
          </div>
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
          {activeCategory === 'progress' && <ProgressStats stats={stats} rounds={rounds} />}
          {activeCategory === 'dispersion' && <ShotDispersionChart stats={stats} />}
          {activeCategory === 'scoring' && <ScoringStats stats={stats} />}
          {activeCategory === 'driving' && <DrivingStats stats={stats} />}
          {activeCategory === 'approach' && <ApproachStats stats={stats} />}
          {activeCategory === 'putting' && <PuttingStats stats={stats} />}
          {activeCategory === 'scrambling' && <ScramblingStats stats={stats} />}
          {activeCategory === 'strokes-gained' && <StrokesGainedStats stats={stats} />}
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
