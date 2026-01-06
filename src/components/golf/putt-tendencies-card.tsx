'use client';

import { motion } from 'framer-motion';
import { IconAlertTriangle } from '@/components/icons';
import { PlayerPuttTendencies, PUTT_MISS_TAG_CONFIG } from '@/lib/types/golf';
import { cn } from '@/lib/utils';
import { PremiumGlassCard } from '@/components/golf/dashboard';

interface PuttTendenciesCardProps {
  data: PlayerPuttTendencies;
}

export function PuttTendenciesCard({ data }: PuttTendenciesCardProps) {
  const { percentages, missByType, totalMissedPutts } = data;
  
  // Determine primary tendency for coaching insight
  const getPrimaryIssue = () => {
    if (percentages.underReadTendency > 65) return 'under-reading';
    if (percentages.underReadTendency < 35) return 'over-reading';
    if (percentages.leaveShortTendency > 65) return 'speed-short';
    if (percentages.leaveShortTendency < 35) return 'speed-long';
    return null;
  };

  const primaryIssue = getPrimaryIssue();

  return (
    <PremiumGlassCard className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Putting Tendencies</h3>
          <p className="text-sm text-slate-500">
            Based on {totalMissedPutts} missed putts
          </p>
        </div>
        {primaryIssue && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200">
            <IconAlertTriangle size={16} className="text-amber-600" />
            <span className="text-sm text-amber-700 font-medium">
              {primaryIssue === 'under-reading' && 'Under-reads break'}
              {primaryIssue === 'over-reading' && 'Over-reads break'}
              {primaryIssue === 'speed-short' && 'Leaves putts short'}
              {primaryIssue === 'speed-long' && 'Runs putts by'}
            </span>
          </div>
        )}
      </div>

      {/* Green Reading Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Green Reading</span>
          <span className="text-slate-500">
            {percentages.underReadTendency > 50 ? 'Under-reads' : 'Over-reads'}
          </span>
        </div>
        <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentages.underReadTendency}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-amber-500"
          />
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white/50" />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Low (Under-read)</span>
          <span>High (Over-read)</span>
        </div>
      </div>

      {/* Speed Control Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Speed Control</span>
          <span className="text-slate-500">
            {percentages.leaveShortTendency > 50 ? 'Leaves short' : 'Runs by'}
          </span>
        </div>
        <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentages.leaveShortTendency}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-500 to-orange-500"
          />
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white/50" />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Short</span>
          <span>Long</span>
        </div>
      </div>

      {/* Miss Distribution */}
      <div className="grid grid-cols-3 gap-3">
        {(['low', 'high', 'short', 'long', 'pull', 'push'] as const).map((tag) => {
          const config = PUTT_MISS_TAG_CONFIG[tag];
          const count = missByType[tag];
          const pct = totalMissedPutts > 0 
            ? Math.round((count / totalMissedPutts) * 100) 
            : 0;
          
          return (
            <div 
              key={tag}
              className="p-3 rounded-xl bg-white/50 backdrop-blur-sm border border-slate-200"
            >
              <p className={cn('text-sm font-medium', config.color)}>
                {config.label}
              </p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{count}</p>
              <p className="text-xs text-slate-500">{pct}% of misses</p>
            </div>
          );
        })}
      </div>

      {/* Distance Breakdown */}
      <div className="pt-4 border-t border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">By Distance</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-slate-50">
            <p className="text-xs text-slate-500 mb-1">Inside 5ft</p>
            <p className="text-xl font-bold text-slate-900">
              {data.byDistance.inside5ft.pct}%
            </p>
            <p className="text-xs text-slate-500">
              {data.byDistance.inside5ft.made} / {data.byDistance.inside5ft.attempts}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50">
            <p className="text-xs text-slate-500 mb-1">5-10ft</p>
            <p className="text-xl font-bold text-slate-900">
              {data.byDistance.fiveTo10ft.pct}%
            </p>
            <p className="text-xs text-slate-500">
              {data.byDistance.fiveTo10ft.made} / {data.byDistance.fiveTo10ft.attempts}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50">
            <p className="text-xs text-slate-500 mb-1">Outside 10ft</p>
            <p className="text-xl font-bold text-slate-900">
              {data.byDistance.outside10ft.pct}%
            </p>
            <p className="text-xs text-slate-500">
              {data.byDistance.outside10ft.made} / {data.byDistance.outside10ft.attempts}
            </p>
          </div>
        </div>
      </div>
    </PremiumGlassCard>
  );
}
