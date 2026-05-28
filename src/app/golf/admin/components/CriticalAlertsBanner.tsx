'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconWarning, IconInfo, IconX } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { Button, IconButton } from '@/components/ui/button';

interface Props {
  items: AdminDashboardData['needsAttention'];
  onNavigateTab?: (tab: string) => void;
}

const DISMISSED_KEY = 'admin-alerts-dismissed';

const severityConfig = {
  critical: {
    bg: 'bg-red-50/80 border-red-200/50',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    titleColor: 'text-red-900',
    descColor: 'text-red-600',
    btnColor: 'text-red-600 hover:text-red-800 hover:bg-red-100',
    dismissColor: 'text-red-400 hover:text-red-600',
  },
  warning: {
    bg: 'bg-amber-50/80 border-amber-200/50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-900',
    descColor: 'text-amber-600',
    btnColor: 'text-amber-600 hover:text-amber-800 hover:bg-amber-100',
    dismissColor: 'text-amber-400 hover:text-amber-600',
  },
  info: {
    bg: 'bg-blue-50/80 border-blue-200/50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-900',
    descColor: 'text-blue-600',
    btnColor: 'text-blue-600 hover:text-blue-800 hover:bg-blue-100',
    dismissColor: 'text-blue-400 hover:text-blue-600',
  },
};

const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function CriticalAlertsBanner({ items, onNavigateTab }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { ids: string[]; ts: number };
        // Clear dismissed after 24h
        if (Date.now() - parsed.ts < 86400000) {
          setDismissed(new Set(parsed.ids));
        }
      }
    } catch { /* ignore */ }
  }, []);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ids: [...next], ts: Date.now() }));
    } catch { /* ignore */ }
  }

  // Only show actionable alerts — no "all clear" or purely informational "growth" items
  const alertItems = items
    .filter((item) => {
      if (item.severity === 'info' && item.label.includes('All clear')) return false;
      if (item.severity === 'info' && item.label.includes('signed up this week')) return false;
      return true;
    })
    .sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  // Deduplicate alerts with overlapping content (e.g. two error-related alerts)
  const seen = new Set<string>();
  const deduped = alertItems.filter((item) => {
    // Normalize key: strip numbers to catch "3 unresolved" vs "5 unresolved" dupes
    const key = item.label.replace(/\d+/g, '#').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const visible = deduped.filter((item) => !dismissed.has(item.label));
  if (visible.length === 0) return null;

  const maxVisible = 3;
  const displayed = showAll ? visible : visible.slice(0, maxVisible);
  const hiddenCount = visible.length - maxVisible;

  return (
    <div className="space-y-2">
      {displayed.map((item) => {
        const config = severityConfig[item.severity];
        const Icon = item.severity === 'info' ? IconInfo : IconWarning;

        return (
          <div
            key={item.label}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-2xl',
              'border backdrop-blur-sm',
              config.bg
            )}
          >
            {/* Icon — always 44px touch-safe, flex-shrink-0 */}
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
              config.iconBg
            )}>
              <Icon size={16} className={config.iconColor} />
            </div>

            {/* Text block — allow full wrapping on narrow screens */}
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold leading-snug', config.titleColor)}>
                {item.label}
              </p>
              <p className={cn('text-xs mt-0.5 leading-relaxed', config.descColor)}>
                {item.detail}
              </p>
            </div>

            {/* Action + dismiss buttons — stack below text on very small screens, inline otherwise */}
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              {onNavigateTab && item.tab && (
                <Button variant="ghost"
                  onClick={() => onNavigateTab(item.tab)}
                  className={cn(
                    'min-h-[44px] min-w-[44px] text-xs font-semibold px-3 py-2.5 rounded-lg transition-colors flex items-center gap-1',
                    config.btnColor
                  )}
                >
                  {item.severity === 'critical' ? 'Fix Now' : item.severity === 'warning' ? 'Review' : 'View'}
                  <span aria-hidden="true">&rarr;</span>
                </Button>
              )}
              <IconButton variant="default"
                onClick={() => dismiss(item.label)}
                aria-label="Dismiss alert"
                className={cn(
                  'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors',
                  config.dismissColor
                )}
              >
                <IconX size={16} />
              </IconButton>
            </div>
          </div>
        );
      })}
      {!showAll && hiddenCount > 0 && (
        <Button variant="ghost"
          onClick={() => setShowAll(true)}
          className="min-h-[44px] text-xs font-medium text-warm-500 hover:text-warm-700 px-4 py-2.5 transition-colors"
        >
          Show {hiddenCount} more alert{hiddenCount > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
}
