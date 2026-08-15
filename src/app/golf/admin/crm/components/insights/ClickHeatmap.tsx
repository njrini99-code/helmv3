'use client';

import { cn } from '@/lib/utils';
import {
  IconTarget as MousePointerClick,
  IconExternalLink,
  IconUsers,
} from '@/components/icons';
import type { ClickDestinationRow } from '@/app/golf/actions/crm-insights';
import { EmptyState, Surface } from '@/components/fairway';

// ============================================================================
// ClickHeatmap — top-N clicked URLs with horizontal bars.
// Bar width is proportional to the row's click_count vs the max in the set.
// ============================================================================

interface ClickHeatmapProps {
  rows: ClickDestinationRow[];
  loading?: boolean;
  /** Display title (defaults to "Top click destinations"). */
  title?: string;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function shortenPath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return path.length > 60 ? path.slice(0, 57) + '…' : path;
  } catch {
    return url.length > 80 ? url.slice(0, 77) + '…' : url;
  }
}

export function ClickHeatmap({ rows, loading, title }: ClickHeatmapProps) {
  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 bg-surface-sunken rounded-fw-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Surface padding="none">
        <EmptyState
          variant="subtle"
          icon={<MousePointerClick size={20} />}
          title="No clicks tracked yet"
          description="When recipients click a link in your emails, the destination URL and total clicks per recipient appear here."
        />
      </Surface>
    );
  }

  const max = rows.reduce((m, r) => Math.max(m, r.click_count), 0) || 1;

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-fw-sm bg-accent-50 text-accent-700 flex items-center justify-center">
            <MousePointerClick size={14} />
          </span>
          <h3 className="text-sm font-semibold text-text-primary">
            {title ?? 'Top click destinations'}
          </h3>
        </div>
        <span className="text-xs text-text-tertiary tabular-nums">{rows.length} URLs</span>
      </div>

      <div className="divide-y divide-border-subtle/40">
        {rows.map((row, i) => {
          const widthPct = Math.max(2, Math.round((row.click_count / max) * 100));
          const host = safeHostname(row.clicked_url);
          const path = shortenPath(row.clicked_url);
          return (
            <div key={`${row.clicked_url}-${i}`} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-bold text-text-tertiary tabular-nums w-5 text-right">
                    {i + 1}
                  </span>
                  <a
                    href={row.clicked_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-text-primary hover:text-fw-success-ink truncate flex items-center gap-1.5 group min-w-0"
                    title={row.clicked_url}
                  >
                    <span className="truncate">{host}</span>
                    <span className="text-text-tertiary truncate flex-1">{path}</span>
                    <IconExternalLink
                      size={10}
                      className="text-text-tertiary group-hover:text-accent-700 flex-shrink-0"
                    />
                  </a>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="flex items-center gap-1 text-xs text-text-tertiary" title="Unique recipients">
                    <IconUsers size={11} />
                    <span className="tabular-nums">{row.unique_recipients.toLocaleString()}</span>
                  </span>
                  <span className="text-sm font-semibold text-text-primary tabular-nums w-12 text-right">
                    {row.click_count.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-surface-sunken/80 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    'bg-accent-500',
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
