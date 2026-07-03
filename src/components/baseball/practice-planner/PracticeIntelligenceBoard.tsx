'use client';

// =============================================================================
// src/components/baseball/practice-planner/PracticeIntelligenceBoard.tsx
//
// Packet: practice-intel
//
// The V5 "Intelligence Rail" / "Practice Intelligence Board". Renders the team's
// active CoachHelm signals and lets a coach convert a signal into a draft
// practice block on the open practice (source -> signal -> action). Every signal
// shows its confidence (honest "—" when null), visibility, generated-at age, and
// subject player. A staff_only signal is clearly marked and never produces a
// player-visible block body.
//
// NO golf labels. NO AI without a source — each card cites the insight it came
// from. NEVER auto-publishes: convert only APPENDS a draft block the coach edits.
//
// Design: GolfHelm cream/green primitives + the shared SourceTrustBadge for the
// trust pill. No new palette.
// =============================================================================

import { useState } from 'react';
import { Brain, Plus, CheckCircle2, Eye, EyeOff, Clock, User } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import type {
  PracticeSignal,
  SuggestedPracticeBlock,
} from '@/lib/types/baseball-practice-deep';

interface PracticeIntelligenceBoardProps {
  signals: PracticeSignal[];
  suggestions: SuggestedPracticeBlock[];
  /** Whether there's an open practice to drop a block onto. */
  canConvert: boolean;
  /** Convert a suggestion into a draft block on the open practice. */
  onConvert: (suggestion: SuggestedPracticeBlock) => void | Promise<void>;
  /** Which insight id is currently being converted (spinner). */
  convertingId?: string | null;
  loading?: boolean;
}

function ageLabel(iso: string | null): string {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function PracticeIntelligenceBoard({
  signals,
  suggestions,
  canConvert,
  onConvert,
  convertingId,
  loading,
}: PracticeIntelligenceBoardProps) {
  const [showConverted, setShowConverted] = useState(false);

  const suggestionByInsight = new Map(suggestions.map((s) => [s.sourceInsightId, s]));
  const visible = signals.filter((s) => showConverted || s.disposition !== 'converted');
  const convertedCount = signals.filter((s) => s.disposition === 'converted').length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-warm-100/70" />
        ))}
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <EmptyState
        icon={<Brain className="h-7 w-7" />}
        title="No signals yet"
        description="When CoachHelm surfaces postgame signals, development goals, or limited players, they appear here ready to convert into practice blocks."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-warm-800">
          <Brain className="h-4 w-4 text-primary-600" />
          Intelligence Board
          <span className="font-normal text-warm-400">({visible.length})</span>
        </div>
        {convertedCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowConverted((v) => !v)}
            haptic="none"
            className="min-h-0 p-0 text-xs font-normal text-warm-500 underline-offset-2 hover:bg-transparent hover:underline"
          >
            {showConverted ? 'Hide' : 'Show'} {convertedCount} converted
          </Button>
        )}
      </div>

      {!canConvert && (
        <p className="rounded-lg bg-cream-100/70 px-3 py-2 text-xs text-warm-500">
          Open or create a practice to convert a signal into a block.
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((signal) => {
          const suggestion = suggestionByInsight.get(signal.insightId);
          const converted = signal.disposition === 'converted';
          const staffOnly = signal.visibility === 'staff_only';
          const isConverting = convertingId === signal.insightId;
          return (
            <li
              key={signal.insightId}
              className={cn(
                'rounded-xl border glass-standard p-3',
                converted ? 'border-primary-200 bg-primary-50/50' : 'border-warm-200',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-warm-900">{signal.title}</span>
                    {staffOnly ? (
                      <Badge tone="neutral" appearance="soft" size="sm" icon={<EyeOff className="h-3 w-3" />}>
                        Staff only
                      </Badge>
                    ) : (
                      <Badge tone="primary" appearance="soft" size="sm" icon={<Eye className="h-3 w-3" />}>
                        Player-safe
                      </Badge>
                    )}
                  </div>
                  {signal.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-warm-600">{signal.summary}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-warm-500">
                    {/* Honest source-trust pill: AI-derived + confidence (null -> "—"). */}
                    <SourceTrustBadge
                      size="sm"
                      trust={{
                        label: 'CoachHelm signal',
                        kind: 'ai',
                        trustLevel: 'ai_derived',
                        captureMode: 'logged_intent',
                        confidencePct:
                          signal.confidence == null ? null : Math.round(signal.confidence * 100),
                      }}
                    />
                    {signal.playerName && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {signal.playerName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {ageLabel(signal.generatedAt)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {converted ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Added
                    </span>
                  ) : suggestion ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canConvert || isConverting}
                      isLoading={isConverting}
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => onConvert(suggestion)}
                    >
                      To block
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* The suggestion preview (what the converted block would look like). */}
              {!converted && suggestion && (
                <div className="mt-2 rounded-lg border border-dashed border-warm-200 bg-cream-50/70 px-2.5 py-1.5 text-micro text-warm-600">
                  <span className="font-medium text-warm-700">{suggestion.headline}</span>
                  {' · '}
                  {suggestion.durationMin}m
                  {suggestion.groupLabel ? ` · ${suggestion.groupLabel}` : ''}
                  {suggestion.measurementTarget ? ` · measures: ${suggestion.measurementTarget}` : ''}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
