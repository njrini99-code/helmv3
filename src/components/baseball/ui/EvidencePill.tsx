import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  IconChartBar,
  IconBaseball,
  IconCrosshair,
  IconNote,
  IconAlertCircle,
  IconClock,
  IconTarget,
  IconCheckCircle2,
} from '@/components/icons';

// ── Types ──────────────────────────────────────────────────────────────────

export type EvidenceSource =
  | 'official_stats'
  | 'gamechanger'
  | 'trackman'
  | 'rapsodo'
  | 'manual'
  | 'low_confidence'
  | 'last_5_games'
  | 'player_checkin';

export interface EvidencePillProps {
  source: EvidenceSource;
  /** Override the default display label for this source. */
  label?: string;
  className?: string;
}

// ── Source config ──────────────────────────────────────────────────────────

interface SourceConfig {
  label: string;
  tone: BadgeTone;
  /** Icon rendered inside the Badge via the `icon` prop (size 11). */
  icon: React.ReactNode;
}

const SOURCE_CONFIG: Record<EvidenceSource, SourceConfig> = {
  official_stats: { label: 'Official stats', tone: 'neutral',  icon: <IconChartBar size={11} /> },
  gamechanger:    { label: 'GameChanger',     tone: 'neutral',  icon: <IconBaseball size={11} /> },
  trackman:       { label: 'TrackMan',        tone: 'neutral',  icon: <IconCrosshair size={11} /> },
  rapsodo:        { label: 'Rapsodo',         tone: 'neutral',  icon: <IconTarget size={11} /> },
  manual:         { label: 'Manual note',     tone: 'warning',  icon: <IconNote size={11} /> },
  low_confidence: { label: 'Low confidence',  tone: 'warning',  icon: <IconAlertCircle size={11} /> },
  last_5_games:   { label: 'Last 5 games',    tone: 'neutral',  icon: <IconClock size={11} /> },
  player_checkin: { label: 'Player check-in', tone: 'primary',  icon: <IconCheckCircle2 size={11} /> },
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * EvidencePill — source-evidence chip used by CommandCard and SignalCard.
 *
 * Purely presentational (no hooks). Wraps the shared Badge primitive using
 * the tone × appearance API (soft surface, sm size). Custom `label` overrides
 * the default display string for the given source.
 *
 * Each source maps to a BadgeTone and an icon so callers get consistent
 * visual language without duplicating the mapping.
 */
export function EvidencePill({ source, label, className }: EvidencePillProps) {
  const config = SOURCE_CONFIG[source];

  return (
    <Badge
      tone={config.tone}
      appearance="soft"
      size="sm"
      icon={config.icon}
      className={cn(className)}
    >
      {label ?? config.label}
    </Badge>
  );
}
