'use client';

/**
 * ============================================================================
 * SignalInsightPanel — the Signals workspace's right ("CoachHelm") pane
 * (Triage Desk spec — desktop 1440 composition)
 * ----------------------------------------------------------------------------
 * The `InsightPanel` primitive's first real (non-test) consumer. Distinct
 * from `SignalDossier` (center pane): the dossier is the full evidence +
 * Mark-reviewed/Dismiss/Prescribe record for the selected signal; this pane
 * is the synthesized "why this matters, and what to do about it" read —
 * evidence rows + a recommended next step + Add focus area / Ask. Reviewing
 * or dismissing a signal stays exclusively a dossier action (one place to
 * change queue membership, not two).
 *
 * `mode="auto"` (the default, left unset here): docked on desktop, its own
 * matte `Sheet` on phone — the "assistant Sheet" the spec's phone behaviors
 * call for, for free, with no separate frost budget spend (the Sheet here is
 * `material="matte"` by default, unlike the dossier's phone Sheet).
 * ========================================================================== */

import { useRouter } from 'next/navigation';
import type { InsightPanelAction } from '@/components/fairway/cards-insight/InsightPanel';
import { InsightPanel } from '@/components/fairway/cards-insight/InsightPanel';
import type { InsightPriority } from '@/components/fairway/cards-insight/InsightCard';
import type { PlayersGridStats } from '@/components/fairway';
import type { GroupedSignal, SignalGroup, SignalSeverity } from '@/lib/coachhelm/signal-grouping';
import { EvidencePanel } from '@/components/golf/coachhelm/insights/EvidencePanel';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';
import { formatCategoryLabel, resolveSignalEvidence } from './buildTriageViewModel';
import { PromoteToFocusAreaButton } from './PromoteToFocusAreaButton';

export interface SignalInsightPanelEntry {
  signal: GroupedSignal;
  group: SignalGroup;
}

export interface SignalInsightPanelProps {
  entry: SignalInsightPanelEntry | null;
  coachId: string;
  onPromoted: (signal: GroupedSignal) => void;
  playerStats?: PlayersGridStats | null;
  /** Controlled open state — only consulted in the panel's phone Sheet mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SEVERITY_TO_PRIORITY: Record<SignalSeverity, InsightPriority> = {
  urgent: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function recommendationFor(signal: GroupedSignal, playerName: string): string {
  if (signal.kind === 'team_synthesis') {
    return 'A team-wide roll-up of the leaks it summarizes. Review or dismiss the individual player signals in the queue rather than this row.';
  }
  if (signal.kind === 'pattern') {
    return 'A cross-player pattern. Worth a look across the roster before acting on any one player.';
  }
  if (signal.playerId) {
    return `Prescribe a focus area to turn this into a plan ${playerName} can work on.`;
  }
  return 'Review the evidence, then mark it reviewed or dismiss it from the queue.';
}

export function SignalInsightPanel({
  entry,
  coachId,
  onPromoted,
  playerStats = null,
  open,
  onOpenChange,
}: SignalInsightPanelProps) {
  const router = useRouter();

  if (!entry) {
    return (
      <InsightPanel
        title="CoachHelm"
        overline="Ask"
        empty
        emptyTitle="Nothing selected"
        emptyMessage="Pick a signal from the queue and CoachHelm will explain why it matters and what to do next."
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  const { signal, group } = entry;

  const askAction: InsightPanelAction = {
    key: 'ask',
    label: surfaceName('ask'),
    onClick: () => router.push(surfaceHref('ask')),
  };

  return (
    <InsightPanel
      priority={SEVERITY_TO_PRIORITY[signal.severity]}
      overline={`${formatCategoryLabel(signal.category)} · CoachHelm`}
      title="Why this matters"
      meta={group.playerId ? group.playerName : 'Team'}
      evidenceLabel="Evidence"
      evidence={<EvidencePanel evidence={resolveSignalEvidence(signal.evidence)} compact />}
      detail={
        <p className="font-fw-sans text-body-sm leading-relaxed text-text-secondary">
          {recommendationFor(signal, group.playerName)}
        </p>
      }
      actionsSlot={
        signal.kind === 'insight' && signal.playerId ? (
          <PromoteToFocusAreaButton
            signal={signal}
            coachId={coachId}
            onPromoted={() => onPromoted(signal)}
            playerName={group.playerName}
            playerStats={playerStats}
          />
        ) : null
      }
      actions={[askAction]}
      open={open}
      onOpenChange={onOpenChange}
    >
      {signal.title}
    </InsightPanel>
  );
}
