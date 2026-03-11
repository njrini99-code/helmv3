'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, AlertCircle, Info, Wrench, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import type { DataQualityIssue, FixResult } from './tracer-types';

interface DataQualityIssueRowProps {
  issue: DataQualityIssue;
  onFix?: (issue: DataQualityIssue) => Promise<FixResult>;
  fixing?: boolean;
}

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', icon: AlertCircle },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', icon: AlertTriangle },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', icon: Info },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  missing_data: 'Missing Data',
  outlier: 'Outlier',
  integrity: 'Integrity',
  cache_divergence: 'Cache',
  completeness: 'Completeness',
  stuck_round: 'Stuck',
};

export function DataQualityIssueRow({ issue, onFix, fixing }: DataQualityIssueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[issue.severity];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'border-b border-warm-50/80 transition-colors',
        issue.severity === 'critical' ? 'bg-red-50/5 hover:bg-red-50/10' : 'hover:bg-white/40'
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Expand toggle */}
        <button type="button" className="text-warm-300 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Severity badge */}
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0', style.bg, style.text)}>
          <Icon size={10} />
          {issue.severity}
        </span>

        {/* Category */}
        <span className="text-[10px] font-medium text-warm-400 uppercase tracking-wider flex-shrink-0 w-20">
          {CATEGORY_LABELS[issue.category] || issue.category}
        </span>

        {/* Title */}
        <span className="text-sm font-medium text-warm-900 truncate flex-1">
          {issue.title}
        </span>

        {/* Player name */}
        <span className="text-xs text-warm-500 truncate max-w-[120px] flex-shrink-0">
          {issue.player_name}
        </span>

        {/* Course / round context */}
        {issue.course_name && (
          <span className="text-xs text-warm-400 truncate max-w-[120px] flex-shrink-0 hidden sm:inline">
            {issue.course_name}
          </span>
        )}

        {/* Fix button */}
        {issue.fixable && onFix && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFix(issue); }}
            disabled={fixing}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0',
              fixing
                ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            )}
          >
            {fixing ? <Loader2 size={10} className="animate-spin" /> : <Wrench size={10} />}
            Fix
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pl-12">
          <p className="text-xs text-warm-500 leading-relaxed">{issue.description}</p>
          {issue.actual_value != null && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              <span className="text-warm-400">Actual:</span>
              <span className="font-mono text-red-600 font-medium">{String(issue.actual_value)}</span>
              {issue.expected_value != null && (
                <>
                  <span className="text-warm-300">|</span>
                  <span className="text-warm-400">Expected:</span>
                  <span className="font-mono text-green-600 font-medium">{String(issue.expected_value)}</span>
                </>
              )}
            </div>
          )}
          {issue.round_id && (
            <div className="mt-1 text-[11px] text-warm-400">
              Round: <span className="font-mono">{issue.round_id.slice(0, 8)}...</span>
              {issue.round_date && <span className="ml-2">{new Date(issue.round_date).toLocaleDateString()}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
