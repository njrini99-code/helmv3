'use client';

// =============================================================================
// src/components/baseball/signals/SignalInboxClient.tsx
//
// Packet: signal-inbox — the Signal Inbox workspace (V10 §Signals tab), rebuilt
// on the "Living Annual" kit (spec: docs/baseball/design-system-living-annual.md;
// plan: docs/baseball/ui-migration-execution-plan.md §3.2 signals row). THE WAR
// ROOM lane (`pursuit`/clay ink). This is an operational TRIAGE INBOX with four
// views (V10 §Views):
//
//   - Feed     : open signals, severity-then-recency (daily triage).
//   - Compact  : dense list for staff meetings / quick review.
//   - Grouped  : by player / category / source / owner (filter chips, URL state).
//   - Board    : action-lifecycle columns (new / acknowledged / converted / resolved).
//
// It is NOT a commit/offer/milestone ticker — no `<CommitSeal>` anywhere on
// this surface. Triage + convert-to-action wire to the SAME signals server
// actions as before; the page re-renders via `router.refresh()`. Every
// zero/degraded state renders through `<EditorsLetter>` / `<InkNotice>` —
// never a yellow/amber box. NO golf labels.
// =============================================================================

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  SectionMasthead,
  Eyebrow,
  PaperCard,
  HairlineRule,
  InkBadge,
  StatReadout,
  EditorsLetter,
  LiveDot,
  InkNotice,
} from '@/components/baseball/living-annual';
import { Button, Segmented, SelectablePill } from '@/components/fairway';
import {
  IconShieldAlert,
  IconList,
  IconLayoutGrid,
  IconLayers,
  IconRefresh,
} from '@/components/icons';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { SignalCard } from './SignalCard';
import {
  ConvertToActionDialog,
  type ConvertOption,
  type RosterOption,
  type StaffOption,
} from './ConvertToActionDialog';
import type {
  SignalInboxReadModel,
  SignalInboxRow,
  SignalGrouping,
} from '@/lib/baseball/read-models/signal-inbox';
import {
  acknowledgeSignal,
  setSignalDisposition,
  recordSignalFeedback,
  convertSignalToAction,
} from '@/app/baseball/actions/signals';
import { runOperationalSignalDetection } from '@/app/baseball/actions/operational-signals';

type SignalView = 'feed' | 'compact' | 'grouped' | 'board';

export interface SignalInboxClientProps {
  model: SignalInboxReadModel;
  /** Player id -> display name, for card subjects + grouping. */
  playerNames: Record<string, string>;
  roster: RosterOption[];
  staff: StaffOption[];
  /** Capability gate (server-resolved). */
  canManage: boolean;
}

const VIEWS: { id: SignalView; label: string; icon: React.ReactNode }[] = [
  { id: 'feed', label: 'Feed', icon: <IconShieldAlert size={15} /> },
  { id: 'compact', label: 'Compact', icon: <IconList size={15} /> },
  { id: 'grouped', label: 'Grouped', icon: <IconLayers size={15} /> },
  { id: 'board', label: 'Board', icon: <IconLayoutGrid size={15} /> },
];

const GROUPINGS: { id: SignalGrouping; label: string }[] = [
  { id: 'player', label: 'Player' },
  { id: 'category', label: 'Category' },
  { id: 'source', label: 'Source' },
  { id: 'owner', label: 'Owner' },
];

export function SignalInboxClient({
  model,
  playerNames,
  roster,
  staff,
  canManage,
}: SignalInboxClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL-backed view + grouping + severity filter ─────────────────────────
  const isView = (v: string | null): v is SignalView =>
    v === 'feed' || v === 'compact' || v === 'grouped' || v === 'board';
  const isGrouping = (v: string | null): v is SignalGrouping =>
    v === 'player' || v === 'category' || v === 'source' || v === 'owner';

  const view: SignalView = isView(searchParams.get('view'))
    ? (searchParams.get('view') as SignalView)
    : 'feed';
  const grouping: SignalGrouping = isGrouping(searchParams.get('group'))
    ? (searchParams.get('group') as SignalGrouping)
    : 'player';
  const severityFilter = searchParams.get('sev'); // 'critical'|'warning'|'info'|null

  const updateParams = React.useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null) params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // ── Lookup map id -> row ─────────────────────────────────────────────────
  const byId = React.useMemo(() => {
    const m = new Map<string, SignalInboxRow>();
    for (const s of model.signals) m.set(s.id, s);
    return m;
  }, [model.signals]);

  // ── Severity filter applied to ordered feed ──────────────────────────────
  const filteredFeed = React.useMemo(() => {
    const ids = model.feedOrder;
    const rows = ids.map((id) => byId.get(id)).filter(Boolean) as SignalInboxRow[];
    if (!severityFilter) return rows;
    return rows.filter((r) => r.severity === severityFilter);
  }, [model.feedOrder, byId, severityFilter]);

  // ── Conversion dialog + pending state ────────────────────────────────────
  const [convertTarget, setConvertTarget] = React.useState<SignalInboxRow | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const runMutation = React.useCallback(
    async (id: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
      setPendingId(id);
      try {
        const result = await fn();
        if (!result.success) {
          toast.error('Could not update the signal', result.error ?? 'Please try again.');
        }
      } catch {
        toast.error('Could not update the signal', 'Please try again.');
      } finally {
        setPendingId(null);
        router.refresh();
      }
    },
    [router],
  );

  const handleAcknowledge = (id: string) =>
    runMutation(id, () => acknowledgeSignal(id));
  const handleDismiss = (id: string) =>
    runMutation(id, () => setSignalDisposition({ signalId: id, disposition: 'dismissed' }));
  const handleResolve = (id: string) =>
    runMutation(id, () => setSignalDisposition({ signalId: id, disposition: 'resolved' }));
  const handleFeedback = (id: string, feedback: 'useful' | 'not_useful' | 'wrong') =>
    runMutation(id, () => recordSignalFeedback({ signalId: id, feedback }));

  // ── Scan-now: re-run the deterministic operational rule engine on demand.
  // Surfaces the operations/roster/practice/stats/recruiting rule signals that
  // the scheduled evaluator would otherwise produce. Honest disabled+busy state.
  const [scanState, setScanState] = React.useState<{
    busy: boolean;
    note: string | null;
  }>({ busy: false, note: null });
  const handleScan = React.useCallback(async () => {
    setScanState({ busy: true, note: null });
    try {
      const res = await runOperationalSignalDetection();
      const note = res.success
        ? `Scanned. ${res.stats?.emitted ?? 0} signal${
            (res.stats?.emitted ?? 0) === 1 ? '' : 's'
          } refreshed${
            (res.stats?.resolved ?? 0) > 0 ? `, ${res.stats?.resolved} cleared` : ''
          }.`
        : res.error ?? 'Could not run the scan.';
      setScanState({ busy: false, note });
    } catch {
      setScanState({ busy: false, note: 'Could not run the scan.' });
    } finally {
      router.refresh();
    }
  }, [router]);

  const [convertPending, setConvertPending] = React.useState(false);
  const handleConvert = async (signalId: string, options: ConvertOption[]) => {
    setConvertPending(true);
    try {
      const result = await convertSignalToAction({
        signalId,
        actions: options.map((o) => ({
          actionType: o.actionType,
          title: o.title,
          detail: o.detail,
          assigneeCoachId: o.assigneeCoachId,
          assigneePlayerId: o.assigneePlayerId,
          ownerCoachId: o.assigneeCoachId,
          dueDate: o.dueDate,
          visibility: o.visibility,
        })),
      });
      if (result.success) {
        setConvertTarget(null);
      } else {
        // Keep the dialog open so the coach can retry — closing it here would
        // read as success when no action was created.
        toast.error('Could not create the action', result.error ?? 'Please try again.');
      }
    } catch {
      toast.error('Could not create the action', 'Please try again.');
    } finally {
      setConvertPending(false);
      router.refresh();
    }
  };

  const renderCard = (s: SignalInboxRow, index: number, variant: 'full' | 'compact' = 'full') => (
    <SignalCard
      key={s.id}
      signal={s}
      playerName={s.playerId ? playerNames[s.playerId] : null}
      variant={variant}
      canManage={canManage}
      pending={pendingId === s.id}
      index={index}
      onAcknowledge={handleAcknowledge}
      onDismiss={handleDismiss}
      onResolve={handleResolve}
      onConvert={setConvertTarget}
      onFeedback={handleFeedback}
    />
  );

  // ── Unauthorized envelope ────────────────────────────────────────────────
  if (!model.authorized) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
        <EditorsLetter
          ink="pursuit"
          title="Signals are staff-only."
          body="The Signal Inbox is a coaching surface. Ask a head coach for staff access on this team."
        />
      </div>
    );
  }

  const summary = model.summary;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ───────────────────────────────────────────────── */}
      <SectionMasthead
        eyebrow="THE WAR ROOM · SIGNALS"
        title="Signals"
        ink="pursuit"
        actions={
          canManage ? (
            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              <Button
                variant="secondary"
                onClick={handleScan}
                disabled={scanState.busy}
                busy={scanState.busy}
                leftIcon={!scanState.busy ? <IconRefresh size={15} aria-hidden /> : undefined}
              >
                {scanState.busy ? (
                  <span className="inline-flex items-center gap-1.5">
                    Scanning
                    <LiveDot ink="sodium" />
                  </span>
                ) : (
                  'Scan for signals'
                )}
              </Button>
              <span
                className="min-h-[1rem] font-annual text-body-sm text-text-tertiary sm:text-right"
                role="status"
                aria-live="polite"
              >
                {scanState.note}
              </span>
            </div>
          ) : undefined
        }
      >
        <p className="max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
          Source-backed triage. Convert a signal into an assignable action.
        </p>
      </SectionMasthead>

      {/* ── Summary strip: loud numerals double as severity filters ─────── */}
      <div className="mt-6 flex flex-wrap items-end gap-2">
        <SeverityStatChip
          label="Open"
          count={summary.open}
          active={!severityFilter}
          onClick={() => updateParams({ sev: null })}
        />
        <SeverityStatChip
          label="Critical"
          count={summary.critical}
          active={severityFilter === 'critical'}
          onClick={() => updateParams({ sev: severityFilter === 'critical' ? null : 'critical' })}
        />
        <SeverityStatChip
          label="Warning"
          count={summary.warning}
          active={severityFilter === 'warning'}
          onClick={() => updateParams({ sev: severityFilter === 'warning' ? null : 'warning' })}
        />
        <SeverityStatChip
          label="Info"
          count={summary.info}
          active={severityFilter === 'info'}
          onClick={() => updateParams({ sev: severityFilter === 'info' ? null : 'info' })}
        />
        <span className="mx-1 mb-2 h-8 w-px bg-[color:var(--hairline)]" aria-hidden />
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <InkBadge label={`${summary.sampleTooSmall} sample-too-small`} tone="neutral" />
          <InkBadge label={`${summary.converted} converted`} tone="team" />
          <InkBadge label={`${summary.activeActions} active actions`} tone="team" />
        </div>
      </div>

      {/* ── Honest degraded-feed error ───────────────────────────── */}
      {model.error && (
        <InkNotice ink="pursuit" className="mt-4">
          {model.error}
        </InkNotice>
      )}

      {/* ── View toggle ──────────────────────────────────────────── */}
      <div className="mt-6 mb-5">
        <Segmented
          aria-label="Signal view"
          value={view}
          onValueChange={(v) => updateParams({ view: v === 'feed' ? null : v })}
          options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon }))}
        />
      </div>

      {/* ── Empty state ──────────────────────────────────────────── */}
      {model.signals.length === 0 ? (
        <EditorsLetter
          ink="pursuit"
          title="No open signals."
          body="Signals appear here when stats imports, readiness check-ins, schedule conflicts, or the CoachHelm engine surface something worth a coach's attention."
        />
      ) : (
        <>
          {/* FEED / COMPACT */}
          {(view === 'feed' || view === 'compact') && (
            <div className="grid grid-cols-1 gap-3">
              {filteredFeed.length === 0 ? (
                <EditorsLetter
                  ink="pursuit"
                  title="Nothing matches this filter."
                  body="Clear the severity filter to see all open signals."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => updateParams({ sev: null })}>
                      Clear filter
                    </Button>
                  }
                />
              ) : (
                filteredFeed.map((s, i) => renderCard(s, i, view === 'compact' ? 'compact' : 'full'))
              )}
            </div>
          )}

          {/* GROUPED */}
          {view === 'grouped' && (
            <div>
              <div role="group" aria-label="Group signals by" className="mb-4 flex flex-wrap gap-1.5">
                {GROUPINGS.map((g) => (
                  <SelectablePill
                    key={g.id}
                    shape="round"
                    selected={grouping === g.id}
                    onClick={() => updateParams({ group: g.id === 'player' ? null : g.id })}
                    className="min-h-[32px] px-3 text-caption font-medium"
                  >
                    By {g.label}
                  </SelectablePill>
                ))}
              </div>
              <div className="space-y-6">
                {model.grouped[grouping].map((group) => (
                  <div key={group.key}>
                    <div className="mb-2 flex items-center gap-2">
                      <Eyebrow ink="pursuit">{group.label}</Eyebrow>
                      <InkBadge label={String(group.count)} tone="pursuit" />
                    </div>
                    <HairlineRule ink="pursuit" className="mb-3" />
                    <div className="grid gap-3">
                      {group.signalIds
                        .map((id) => byId.get(id))
                        .filter(Boolean)
                        .map((s, i) => renderCard(s as SignalInboxRow, i, 'compact'))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BOARD */}
          {view === 'board' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  { key: 'new', label: 'New', ids: model.board.new },
                  { key: 'acknowledged', label: 'Acknowledged', ids: model.board.acknowledged },
                  { key: 'converted', label: 'Converted', ids: model.board.converted },
                  { key: 'resolved', label: 'Resolved', ids: model.board.resolved },
                ] as const
              ).map((col) => (
                <PaperCard key={col.key} className="flex flex-col p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Eyebrow ink="pursuit">{col.label}</Eyebrow>
                    <InkBadge
                      label={String(col.ids.length)}
                      tone="pursuit"
                      variant={col.ids.length > 0 ? 'solid' : 'soft'}
                    />
                  </div>
                  <HairlineRule ink="pursuit" className="mb-3" />
                  <div className="flex flex-1 flex-col gap-3">
                    {col.ids.length === 0 ? (
                      <p className="py-6 text-center font-annual text-body-sm text-text-tertiary">
                        Nothing here
                      </p>
                    ) : (
                      col.ids
                        .map((id) => byId.get(id))
                        .filter(Boolean)
                        .map((s, i) => renderCard(s as SignalInboxRow, i, 'compact'))
                    )}
                  </div>
                </PaperCard>
              ))}
            </div>
          )}
        </>
      )}

      {/* Convert-to-action dialog */}
      <ConvertToActionDialog
        signal={convertTarget}
        open={convertTarget !== null}
        onOpenChange={(o) => !o && setConvertTarget(null)}
        roster={roster}
        staff={staff}
        pending={convertPending}
        onConvert={handleConvert}
      />
    </div>
  );
}

// ── Severity stat chip — a loud RuledStatLine-style numeral that also acts as
// a click-to-filter toggle. Built on the shared `<Button ghost>` (its own
// press/hover physics own this, per pressable.ts's own guidance not to layer
// pressableClass on top of a `<Button>`) so no bespoke hover/press CSS lives
// here. ──────────────────────────────────────────────────────────────────

function SeverityStatChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}: ${count}${active ? ' (filter active)' : ''}`}
      className={cn(
        'h-auto min-h-0 flex-col items-start justify-start gap-1 rounded-fw-sm px-3 py-2 text-left',
        active && 'bg-pursuit/[0.07] hover:bg-pursuit/[0.1]',
      )}
    >
      <span className="font-annual text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </span>
      <StatReadout
        value={count}
        flashOnChange
        ariaLabel={label}
        className={cn('text-h2 leading-none', active ? 'text-pursuit' : 'text-text-primary')}
      />
      <HairlineRule ink={active ? 'pursuit' : 'hairline'} weight={1.5} className="mt-0.5" />
    </Button>
  );
}
