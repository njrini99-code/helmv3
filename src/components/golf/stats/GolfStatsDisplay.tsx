'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconTrendingUp, IconTarget, IconFlag, IconGolf, IconAward, IconChartBar, IconCrosshair, IconFilter, IconChevronDown, IconDownload, IconPrinter, IconHome } from '@/components/icons';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import ProgressStats from './ProgressStats';
import { tabContentVariants, FormatToggle } from './sections/shared-primitives';
import type { HoleFormat } from './sections/shared-primitives';
import {
  ScoringStats, DrivingStats, ApproachStats, PuttingStats,
  ScramblingStats, StrokesGainedStats, OverviewStats, AnalysisStats,
} from './sections';
import type { CourseBreakdownResponse, WorstHoleResponse, TrendAnalysisResponse, PlayerProfile } from './sections/types';
import { generateStatsPDF } from './exportPdf';
import { GolfTabBar } from '@/components/golf/GolfTabBar';

// Re-export Sparkline so existing imports continue to work
export { Sparkline } from './sections/shared-primitives';

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'overview' | 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress' | 'dispersion' | 'analysis';

interface RoundOption {
  id: string;
  round_date: string;
  course_name: string;
  total_score: number;
  total_to_par: number;
}

interface StatsFilter {
  preset?: 'last5' | 'last10' | 'last20' | 'tournaments' | 'practice' | 'thisMonth' | 'thisYear' | 'custom';
  startDate?: string;
  endDate?: string;
  courseName?: string;
  roundType?: 'practice' | 'qualifier' | 'tournament';
  season?: number;
}

interface FilterOptions {
  courses: string[];
  seasons: number[];
  roundTypes: string[];
}

interface StatsDisplayProps {
  stats: GolfStats;
  playerName?: string;
  playerProfile?: PlayerProfile;
  isCoachView?: boolean;
  rounds?: RoundOption[];
  selectedRoundId?: string | 'overall';
  onRoundChange?: (roundId: string | 'overall') => void;
  activeFilter?: StatsFilter | null;
  onFilterChange?: (filter: StatsFilter | null) => void;
  filterOptions?: FilterOptions | null;
  courseBreakdown?: CourseBreakdownResponse | null;
  worstHoleData?: WorstHoleResponse | null;
  trendData?: TrendAnalysisResponse | null;
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
}

// ============================================================================
// MODULE-LEVEL CONSTANTS
// ============================================================================

const FILTER_PRESETS: { label: string; filter: StatsFilter }[] = [
  { label: 'Last 5 Rounds', filter: { preset: 'last5' } },
  { label: 'Last 10 Rounds', filter: { preset: 'last10' } },
  { label: 'Tournaments Only', filter: { preset: 'tournaments' } },
  { label: 'Practice Only', filter: { preset: 'practice' } },
  { label: 'This Month', filter: { preset: 'thisMonth' } },
  { label: 'This Year', filter: { preset: 'thisYear' } },
];


// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GolfStatsDisplay({
  stats, playerName, playerProfile, isCoachView = false,
  rounds = [], selectedRoundId = 'overall', onRoundChange,
  activeFilter, onFilterChange, filterOptions,
  courseBreakdown, worstHoleData, trendData,
  statisticalStrengths, statisticalWeaknesses,
}: StatsDisplayProps) {
  const [activeCategory, setActiveCategory] = useState<StatsCategory>(isCoachView ? 'overview' : 'scoring');
  const [holeFormat, setHoleFormat] = useState<HoleFormat>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await generateStatsPDF({ stats, playerName, trendData });
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => { window.print(); };

  const isFilterActive = (filter: StatsFilter) => !activeFilter ? false : JSON.stringify(filter) === JSON.stringify(activeFilter);
  const handleFilterClick = (filter: StatsFilter) => { if (isFilterActive(filter)) { onFilterChange?.(null); } else { onFilterChange?.(filter); } };
  const handleCourseFilter = (courseName: string) => { if (activeFilter?.courseName === courseName) { onFilterChange?.(null); } else { onFilterChange?.({ courseName }); } setShowCourseDropdown(false); };
  const clearFilters = () => { onFilterChange?.(null); };
  const getActiveFilterLabel = (): string | null => { if (!activeFilter) return null; if (activeFilter.courseName) return activeFilter.courseName; return FILTER_PRESETS.find(p => isFilterActive(p.filter))?.label || null; };
  const formatRoundDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const categories: { id: StatsCategory; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'overview', label: 'Overview', icon: <IconHome size={16} />, description: 'Player dashboard summary' },
    { id: 'progress', label: 'Progress', icon: <IconChartBar size={16} />, description: 'Track improvement over time' },
    { id: 'dispersion', label: 'Spray Charts', icon: <IconCrosshair size={16} />, description: 'Visualize shot patterns' },
    { id: 'scoring', label: 'Scoring', icon: <IconAward size={16} />, description: 'Score breakdown and trends' },
    { id: 'driving', label: 'Driving', icon: <IconGolf size={16} />, description: 'Tee shot performance' },
    { id: 'approach', label: 'Approach', icon: <IconTarget size={16} />, description: 'Green in regulation stats' },
    { id: 'putting', label: 'Putting', icon: <IconFlag size={16} />, description: 'Putting efficiency by distance' },
    { id: 'scrambling', label: 'Scrambling', icon: <IconTrendingUp size={16} />, description: 'Short game recovery' },
    { id: 'strokes-gained', label: 'Strokes Gained', icon: <IconChartBar size={16} />, description: 'Tour-level comparison' },
    { id: 'analysis', label: 'Analysis', icon: <IconTarget size={16} />, description: 'Course & hole analysis' },
  ];

  return (
    <div className="min-h-full bg-transparent print:bg-white">
      <div ref={contentRef} className="max-w-4xl mx-auto px-4 py-6 print:max-w-none print:px-8">
        {/* Header */}
        <motion.div className="mb-6" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <motion.h1 className="text-xl sm:text-2xl font-bold text-warm-900 truncate" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                {playerName ? `${playerName}'s Stats` : 'My Stats'}
              </motion.h1>
              <motion.p className="text-warm-500 text-xs sm:text-sm mt-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                {stats.roundsPlayed} rounds • {stats.holesPlayed} holes
              </motion.p>
            </div>
            <div className="flex items-center gap-2 sm:gap-2 print:hidden flex-shrink-0">
              <motion.button onClick={handleExportPDF} disabled={isExporting} className={`p-2.5 rounded-lg border transition-colors ${isExporting ? 'bg-warm-100 border-warm-200 text-warm-400 cursor-not-allowed' : 'bg-white border-warm-200 text-warm-500 hover:border-primary-300 hover:text-primary-600'}`} whileHover={isExporting ? {} : { scale: 1.05 }} whileTap={isExporting ? {} : { scale: 0.95 }} title="Export as PDF">
                {isExporting ? <motion.div className="h-[18px] w-[18px] border-2 border-warm-300 border-t-primary-500 rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} /> : <IconDownload size={18} />}
              </motion.button>
              <motion.button onClick={handlePrint} className="p-2.5 rounded-lg border bg-white border-warm-200 text-warm-500 hover:border-primary-300 hover:text-primary-600 transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} title="Print stats"><IconPrinter size={18} /></motion.button>
              <motion.button onClick={() => setShowFilters(!showFilters)} className={`p-2.5 rounded-lg border transition-colors ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600' : 'bg-white border-warm-200 text-warm-500 hover:border-primary-300 hover:text-primary-600'}`} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} title="Filter options"><IconFilter size={18} /></motion.button>
              {onRoundChange && rounds.length > 0 && (
                <motion.div className="flex-1 min-w-[100px] sm:min-w-[200px] max-w-[200px] sm:max-w-none" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                  <label className="hidden sm:block text-xs font-medium text-warm-500 uppercase tracking-wide mb-1.5">View Stats</label>
                  <select value={selectedRoundId} onChange={(e) => onRoundChange(e.target.value as string | 'overall')} className="w-full px-2 sm:px-3 py-2 rounded-lg border border-warm-200 text-xs sm:text-sm font-medium text-warm-700 bg-white hover:border-primary-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-colors">
                    <option value="overall">Overall</option>
                    <optgroup label="Individual Rounds">
                      {rounds.map(round => <option key={round.id} value={round.id}>{formatRoundDate(round.round_date)} • {round.course_name} ({round.total_score})</option>)}
                    </optgroup>
                  </select>
                </motion.div>
              )}
            </div>
          </div>
          {activeFilter && (
            <motion.div className="flex items-center gap-2 mb-3" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <span className="text-xs text-warm-500">Filtered by:</span>
              <span className="px-2.5 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">{getActiveFilterLabel()}</span>
              <button onClick={clearFilters} className="text-xs text-warm-400 hover:text-red-500 transition-colors">Clear</button>
            </motion.div>
          )}
          <AnimatePresence>
            {showFilters && (
              <motion.div className="glass-standard rounded-xl p-4 mb-4" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: 16 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-warm-700">Quick Filters</h3>
                  <button onClick={() => setShowFilters(false)} className="text-xs text-warm-400 hover:text-warm-600 transition-colors">Close</button>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {FILTER_PRESETS.map((preset, idx) => (
                    <motion.button key={preset.label} onClick={() => handleFilterClick(preset.filter)} className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${isFilterActive(preset.filter) ? 'bg-primary-600 text-white border border-primary-600' : 'bg-white border border-warm-200 text-warm-600 hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100 hover:text-primary-700'}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.03 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>{preset.label}</motion.button>
                  ))}
                </div>
                {filterOptions && filterOptions.courses.length > 0 && (
                  <div className="relative">
                    <label className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1.5 block">Filter by Course</label>
                    <button onClick={() => setShowCourseDropdown(!showCourseDropdown)} className={`w-full px-3 py-2 rounded-lg border text-sm font-medium text-left flex items-center justify-between transition-colors ${activeFilter?.courseName ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-warm-200 text-warm-600 hover:border-primary-300'}`}>
                      <span>{activeFilter?.courseName || 'All Courses'}</span>
                      <IconChevronDown size={16} className={`transition-transform ${showCourseDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {showCourseDropdown && (
                        <motion.div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-warm-200 shadow-lg z-20 max-h-48 overflow-y-auto" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                          <button onClick={() => { onFilterChange?.(null); setShowCourseDropdown(false); }} className="w-full px-3 py-2 text-sm text-left hover:bg-warm-50 transition-colors active:bg-warm-100 text-warm-600">All Courses</button>
                          {filterOptions.courses.map(course => <button key={course} onClick={() => handleCourseFilter(course)} className={`w-full px-3 py-2 text-sm text-left transition-colors ${activeFilter?.courseName === course ? 'bg-primary-50 text-primary-700' : 'hover:bg-warm-50 active:bg-warm-100 text-warm-600'}`}>{course}</button>)}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Format Toggle — 9H / 18H / All */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <FormatToggle
            value={holeFormat}
            onChange={setHoleFormat}
            counts={{
              all: stats.roundsPlayed,
              h18: stats.roundsPlayed18,
              h9: stats.roundsPlayed9,
            }}
          />
        </div>

        {/* Category Pills */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GolfTabBar
            tabs={categories}
            value={activeCategory}
            onChange={setActiveCategory}
            ariaLabel="Stats categories"
            scrollable
          />
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.p key={activeCategory} className="text-sm text-warm-500 mb-4" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.2 }}>
            {categories.find(c => c.id === activeCategory)?.description}
          </motion.p>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div key={activeCategory} variants={tabContentVariants} initial="initial" animate="animate" exit="exit" transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            {activeCategory === 'overview' && <OverviewStats stats={stats} playerName={playerName} playerProfile={playerProfile} trendData={trendData} statisticalStrengths={statisticalStrengths} statisticalWeaknesses={statisticalWeaknesses} holeFormat={holeFormat} />}
            {activeCategory === 'progress' && <ProgressStats stats={stats} rounds={rounds} />}
            {activeCategory === 'dispersion' && <div className="text-center py-8 text-warm-500">Spray charts coming soon</div>}
            {activeCategory === 'scoring' && <ScoringStats stats={stats} holeFormat={holeFormat} />}
            {activeCategory === 'driving' && <DrivingStats stats={stats} />}
            {activeCategory === 'approach' && <ApproachStats stats={stats} />}
            {activeCategory === 'putting' && <PuttingStats stats={stats} />}
            {activeCategory === 'scrambling' && <ScramblingStats stats={stats} />}
            {activeCategory === 'strokes-gained' && <StrokesGainedStats stats={stats} statisticalStrengths={statisticalStrengths} statisticalWeaknesses={statisticalWeaknesses} />}
            {activeCategory === 'analysis' && <AnalysisStats worstHoleData={worstHoleData} courseBreakdown={courseBreakdown} trendData={trendData} />}
          </motion.div>
        </AnimatePresence>

        {stats.roundsPlayed === 0 && (
          <motion.div className="text-center py-16" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
            <motion.div className="w-20 h-20 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4" animate={{ boxShadow: ['0 0 0 0 rgba(22, 163, 74, 0)', '0 0 0 20px rgba(22, 163, 74, 0.1)', '0 0 0 0 rgba(22, 163, 74, 0)'] }} transition={{ duration: 2, repeat: Infinity }}>
              <IconGolf size={40} className="text-warm-300" />
            </motion.div>
            <motion.h2 className="text-lg font-semibold text-warm-900 mb-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>No Stats Yet</motion.h2>
            <motion.p className="text-warm-500 max-w-sm mx-auto" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>Complete rounds with shot tracking to see your detailed statistics here.</motion.p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
