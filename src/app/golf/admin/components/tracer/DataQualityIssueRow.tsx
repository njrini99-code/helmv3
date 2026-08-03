'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconWarning, IconAlertCircle, IconInfo, IconWrench, IconLoader, IconChevronDown, IconChevronRight } from '@/components/icons';
import type { DataQualityIssue, FixResult } from './tracer-types';
import { Button } from '@/components/ui/button';
import { parseDateOnly } from '@/lib/utils/date-only';

interface DataQualityIssueRowProps {
  issue: DataQualityIssue;
  onFix?: (issue: DataQualityIssue) => Promise<FixResult>;
  fixing?: boolean;
}

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', icon: IconAlertCircle },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', icon: IconWarning },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', icon: IconInfo },
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
        issue.severity === 'critical' ? 'bg-red-50/5 hover:bg-red-50/10' : 'hover:bg-cream-100'
      )}
    >
      {/* Main row */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- row click is a pointer convenience; the chevron button below is the accessible toggle */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Expand toggle */}
        <Button
          variant="ghost"
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse issue details' : 'Expand issue details'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-warm-300 flex-shrink-0"
        >
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </Button>

        {/* Severity badge */}
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-eyebrow font-semibold flex-shrink-0', style.bg, style.text)}>
          <Icon size={10} />
          {issue.severity}
        </span>

        {/* Category */}
        <span className="text-eyebrow font-medium text-warm-400 uppercase tracking-wider flex-shrink-0 w-20">
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
          <Button variant="primary"
            type="button"
            onClick={(e) => { e.stopPropagation(); onFix(issue); }}
            disabled={fixing}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-eyebrow font-semibold transition-all flex-shrink-0',
              fixing
                ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
            )}
          >
            {fixing ? <IconLoader size={10} className="animate-spin" /> : <IconWrench size={10} />}
            Fix
          </Button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pl-12">
          <p className="text-xs text-warm-500 leading-relaxed">{issue.description}</p>
          {issue.actual_value != null && (
            <div className="mt-1.5 flex items-center gap-3 text-eyebrow">
              <span className="text-warm-400">Actual:</span>
              <span className="font-mono text-red-600 font-medium">{String(issue.actual_value)}</span>
              {issue.expected_value != null && (
                <>
                  <span className="text-warm-300">|</span>
                  <span className="text-warm-400">Expected:</span>
                  <span className="font-mono text-primary-600 font-medium">{String(issue.expected_value)}</span>
                </>
              )}
            </div>
          )}
          {issue.round_id && (
            <div className="mt-1 text-eyebrow text-warm-400">
              Round: <span className="font-mono">{issue.round_id.slice(0, 8)}...</span>
              {issue.round_date && <span className="ml-2">{parseDateOnly(issue.round_date).toLocaleDateString()}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
