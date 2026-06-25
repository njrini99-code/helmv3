'use client';

// =============================================================================
// src/components/baseball/signals/SignalInboxClient.tsx
//
// Packet: signal-inbox — the Signal Inbox workspace (V10 §Signals tab). The
// central triage surface with FOUR views (V10 §Views):
//
//   - Feed     : open signals, severity-then-recency (daily triage).
//   - Compact  : dense list for staff meetings / quick review.
//   - Grouped  : by player / category / source / owner (filter chips, URL state).
//   - Board    : action-lifecycle columns (new / acknowledged / converted / resolved).
//
// Triage + convert-to-action wire to the signals server actions; the page
// re-renders via revalidatePath. Cream/green GolfHelm look. Empty/loading/error
// handled (loading is the route's loading.tsx; error is the read-model error +
// route error.tsx). NO golf labels.
// =============================================================================

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconShieldAlert,
  IconList,
  IconLayoutGrid,
  IconLayers,
  IconWarning,
  IconRefresh,
} from '@/components/icons';
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
        await fn();
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
      await convertSignalToAction({
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
      setConvertTarget(null);
    } finally {
      setConvertPending(false);
      router.refresh();
    }
  };

  const renderCard = (s: SignalInboxRow, variant: 'full' | 'compact' = 'full') => (
    <SignalCard
      key={s.id}
      signal={s}
      playerName={s.playerId ? playerNames[s.playerId] : null}
      variant={variant}
      canManage={canManage}
      pending={pendingId === s.id}
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
      <div className="min-h-dvh bg-cream-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <EmptyState
            icon={<IconShieldAlert size={28} />}
            title="Signals are staff-only"
            description="The Signal Inbox is a coaching surface. Ask a head coach for staff access on this team."
            variant="card"
          />
        </div>
      </div>
    );
  }

  const summary = model.summary;

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-warm-900">Signals</h1>
            <p className="text-warm-500 mt-0.5 text-sm">
              Source-backed triage. Convert a signal into an assignable action.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <Button
                variant="secondary"
                onClick={handleScan}
                disabled={scanState.busy}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <IconRefresh
                  size={15}
                  className={cn(scanState.busy && 'animate-spin')}
                />
                {scanState.busy ? 'Scanning…' : 'Scan for signals'}
              </Button>
              {scanState.note && (
                <span className="text-xs text-warm-500 sm:text-right" role="status">
                  {scanState.note}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Summary strip (no generic KPI wall — counts only) ────── */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <SummaryChip
            label="Open"
            count={summary.open}
            active={!severityFilter}
            onClick={() => updateParams({ sev: null })}
          />
          <SummaryChip
            label="Critical"
            count={summary.critical}
            tone="red"
            active={severityFilter === 'critical'}
            onClick={() =>
              updateParams({ sev: severityFilter === 'critical' ? null : 'critical' })
            }
          />
          <SummaryChip
            label="Warning"
            count={summary.warning}
            tone="amber"
            active={severityFilter === 'warning'}
            onClick={() =>
              updateParams({ sev: severityFilter === 'warning' ? null : 'warning' })
            }
          />
          <SummaryChip
            label="Info"
            count={summary.info}
            tone="warm"
            active={severityFilter === 'info'}
            onClick={() =>
              updateParams({ sev: severityFilter === 'info' ? null : 'info' })
            }
          />
          <span className="mx-1 h-4 w-px bg-warm-200" aria-hidden />
          <Badge tone="warm" appearance="soft" size="sm">
            {summary.sampleTooSmall} sample-too-small
          </Badge>
          <Badge tone="primary" appearance="soft" size="sm">
            {summary.converted} converted
          </Badge>
          <Badge tone="primary" appearance="soft" size="sm">
            {summary.activeActions} active actions
          </Badge>
        </div>

        {/* ── Honest degraded-feed error ───────────────────────────── */}
        {model.error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <IconWarning size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700">{model.error}</p>
          </div>
        )}

        {/* ── View toggle ──────────────────────────────────────────── */}
        <div className="flex bg-cream-100/75 backdrop-blur-sm border border-warm-200/45 rounded-2xl p-1 gap-1 shadow-sm mb-5 w-fit">
          {VIEWS.map(({ id, label, icon }) => (
            <Button
              key={id}
              variant="ghost"
              onClick={() => updateParams({ view: id === 'feed' ? null : id })}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-[color,background-color,box-shadow]',
                view === id
                  ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-600'
                  : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50',
              )}
            >
              {icon}
              {label}
            </Button>
          ))}
        </div>

        {/* ── Empty state ──────────────────────────────────────────── */}
        {model.signals.length === 0 ? (
          <EmptyState
            icon={<IconShieldAlert size={28} />}
            title="No open signals"
            description="Signals appear here when stats imports, readiness check-ins, schedule conflicts, or the CoachHelm engine surface something worth a coach's attention."
            variant="card"
          />
        ) : (
          <>
            {/* FEED / COMPACT */}
            {(view === 'feed' || view === 'compact') && (
              <div className={cn('grid gap-3', view === 'feed' ? 'grid-cols-1' : 'grid-cols-1')}>
                {filteredFeed.length === 0 ? (
                  <EmptyState
                    title="Nothing matches this filter"
                    description="Clear the severity filter to see all open signals."
                    variant="minimal"
                    action={{ label: 'Clear filter', onClick: () => updateParams({ sev: null }) }}
                  />
                ) : (
                  filteredFeed.map((s) => renderCard(s, view === 'compact' ? 'compact' : 'full'))
                )}
              </div>
            )}

            {/* GROUPED */}
            {view === 'grouped' && (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {GROUPINGS.map((g) => (
                    <Button
                      key={g.id}
                      variant="ghost"
                      onClick={() => updateParams({ group: g.id === 'player' ? null : g.id })}
                      className={cn(
                        'h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                        grouping === g.id
                          ? 'bg-primary-50 text-primary-700 border border-primary-200'
                          : 'text-warm-500 hover:text-warm-800 border border-transparent',
                      )}
                    >
                      By {g.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-6">
                  {model.grouped[grouping].map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-warm-800">
                          {group.label}
                        </h3>
                        <Badge tone="warm" appearance="soft" size="sm">
                          {group.count}
                        </Badge>
                      </div>
                      <div className="grid gap-3">
                        {group.signalIds
                          .map((id) => byId.get(id))
                          .filter(Boolean)
                          .map((s) => renderCard(s as SignalInboxRow, 'compact'))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOARD */}
            {view === 'board' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {(
                  [
                    { key: 'new', label: 'New', ids: model.board.new },
                    { key: 'acknowledged', label: 'Acknowledged', ids: model.board.acknowledged },
                    { key: 'converted', label: 'Converted', ids: model.board.converted },
                    { key: 'resolved', label: 'Resolved', ids: model.board.resolved },
                  ] as const
                ).map((col) => (
                  <div key={col.key} className="flex flex-col">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
                        {col.label}
                      </h3>
                      <Badge tone="warm" appearance="soft" size="sm">
                        {col.ids.length}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-3 min-h-[60px] rounded-2xl bg-warm-50/50 p-2">
                      {col.ids.length === 0 ? (
                        <p className="text-xs text-warm-400 text-center py-6">
                          Nothing here
                        </p>
                      ) : (
                        col.ids
                          .map((id) => byId.get(id))
                          .filter(Boolean)
                          .map((s) => renderCard(s as SignalInboxRow, 'compact'))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

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

// ── Summary chip ────────────────────────────────────────────────────────────

function SummaryChip({
  label,
  count,
  tone = 'warm',
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: 'warm' | 'red' | 'amber';
  active: boolean;
  onClick: () => void;
}) {
  const toneRing =
    tone === 'red'
      ? 'ring-red-300'
      : tone === 'amber'
        ? 'ring-amber-300'
        : tone === 'warm'
          ? 'ring-warm-300'
          : 'ring-primary-300';
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 gap-1.5 rounded-xl border border-warm-200/70 bg-cream-100/75 px-3 text-sm font-medium text-warm-700 hover:bg-cream-50',
        active && cn('ring-2 ring-offset-1 ring-offset-cream-50', toneRing),
      )}
    >
      {label}
      <span className="tabular-nums font-semibold text-warm-900">{count}</span>
    </Button>
  );
}
