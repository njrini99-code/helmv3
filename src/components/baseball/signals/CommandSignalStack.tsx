'use client';

// =============================================================================
// src/components/baseball/signals/CommandSignalStack.tsx
//
// Packet: signal-inbox — the compact Signal Stack embedded in the Coach Command
// Center (V10 §Command Center "Signal Stack: grouped by urgency"). Shows the top
// open, source-backed signals with severity + source chip + confidence, and a
// link into the full Signals workspace. Read-only here (triage + conversion
// happen on /signals); this is the 20-second "what changed" surface.
//
// Cream/green GolfHelm look (Card + Badge + SourceTrustBadge). NO golf labels.
// =============================================================================

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import { IconShieldAlert, IconArrowRight, IconAlertCircle } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { SignalInboxRow } from '@/lib/baseball/read-models/signal-inbox';
import { getSeverityPresentation, getCategoryLabel } from './signal-presentation';

export interface CommandSignalStackProps {
  /** Pre-ordered top open signals (read model feed order, already sliced). */
  signals: SignalInboxRow[];
  playerNames: Record<string, string>;
  /** Total open count, for the "view all" affordance. */
  openCount: number;
  /** Honest degraded-feed error from the read model. */
  error?: string | null;
  /** Max to render inline (default 5). */
  limit?: number;
}

export function CommandSignalStack({
  signals,
  playerNames,
  openCount,
  error = null,
  limit = 5,
}: CommandSignalStackProps) {
  const shown = signals.slice(0, limit);

  return (
    <Card variant="overlay" hover={false} padding="md" className="border-warm-200/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconShieldAlert size={16} className="text-warm-400" />
          <h2 className="text-sm font-semibold text-warm-800 uppercase tracking-wide">
            Signal Stack
          </h2>
          {openCount > 0 && (
            <Badge tone="primary" appearance="soft" size="sm">
              {openCount} open
            </Badge>
          )}
        </div>
        <Link
          href="/baseball/dashboard/signals"
          className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Triage all <IconArrowRight size={13} />
        </Link>
      </div>

      {error && (
        <p className="mb-2 text-xs text-amber-700">{error}</p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          title="No open signals"
          description="You're clear. New signals appear here when data lands."
          variant="minimal"
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => {
            const sev = getSeverityPresentation(s.severity);
            return (
              <li
                key={s.id}
                className="relative flex items-start gap-3 rounded-xl bg-cream-100/70 border border-warm-200/50 p-3 overflow-hidden"
              >
                <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-1', sev.accentClass)} />
                <div className="min-w-0 flex-1 pl-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    <Badge tone={sev.tone} appearance="soft" size="sm">
                      {sev.label}
                    </Badge>
                    <Badge tone="warm" appearance="outline" size="sm">
                      {getCategoryLabel(s.category)}
                    </Badge>
                    {s.sampleTooSmall && (
                      <span className="flex items-center gap-0.5 text-eyebrow uppercase tracking-wide text-warm-400">
                        <IconAlertCircle size={11} /> small sample
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-warm-900 leading-snug truncate">
                    {s.title}
                  </p>
                  <p className="text-xs text-warm-500 mt-0.5">
                    {s.playerId ? (playerNames[s.playerId] ?? 'Player') : 'Team-wide'}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <SourceTrustBadge trust={s.trust} provenance={s.provenance} size="sm" iconOnly />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
