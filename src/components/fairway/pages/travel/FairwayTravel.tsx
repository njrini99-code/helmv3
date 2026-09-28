'use client';

/**
 * ============================================================================
 * Fairway · pages/travel · FairwayTravel  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the SHARED coach+player /golf/dashboard/travel route
 * — the team's tournament-travel surface. A PRESENTATION rebuild on the warm
 * Fairway design system; ALL data + write logic is reused VERBATIM:
 *
 *   • Data        — the page passes the SAME mapped golf_travel_itineraries
 *                   rows (legacy query, departure_date asc).
 *   • Itinerary writes — createGolfTravelItinerary / updateGolfTravelItinerary /
 *                   deleteGolfTravelItinerary (exact import paths, unchanged).
 *   • Expense sub-feature — getExpensesForItinerary / getExpenseSummary /
 *                   getBudgetsForItinerary / exportExpensesToCSV (unchanged).
 *                   The add/edit EDITOR is the Fairway-native FairwayExpenseForm
 *                   (P317: same ModalShell paradigm as the itinerary editor;
 *                   write logic preserved verbatim). The list/summary DISPLAY
 *                   components are now also Fairway-native — FairwayExpenseList /
 *                   FairwayExpenseSummary (mounted by FairwayTripDetail), not
 *                   the legacy golf/travel ExpenseList/ExpenseSummary.
 *
 * ── ROLE FORK (the ONLY thing role changes) ────────────────────────────────
 *   Coaches and players see the SAME trip list + detail. Role ONLY toggles the
 *   coach-only create / edit / delete CTAs and the add/export-expense actions.
 *   Players get a read-only view. The player-side "mark travel seen" badge
 *   clear is preserved verbatim.
 *
 * ── LAYOUT ─────────────────────────────────────────────────────────────────
 *   ViewHeader masthead → a left itinerary list (timeline of trips) + a right
 *   detail panel (schedule · lodging · logistics · expenses). Honest-empty when
 *   there are no trips. Numbers tabular-nums; em-dash for missing.
 *
 * Tokens ONLY. No glass / blur / warm-* / blue-* / amber-* legacy classes.
 * fairwayToast for all toasts. Renders inside `.fairway-ds` on a bg-canvas page.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { ChevronDown, ChevronLeft, Plane } from 'lucide-react';

import {
  ViewHeader,
  Surface,
  Button,
  EmptyState,
  fairwayToast,
} from '@/components/fairway';
import { IconPlus } from '@/components/icons';
import { cn } from '@/lib/utils';
import { markTravelSeen } from '@/app/golf/actions/player-notifications';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import {
  createGolfTravelItinerary,
  updateGolfTravelItinerary,
  deleteGolfTravelItinerary,
  getExpensesForItinerary,
  getExpenseSummary,
  getBudgetsForItinerary,
  exportExpensesToCSV,
  type TravelExpense,
  type ExpenseSummary as ExpenseSummaryType,
  type TravelBudget,
} from '@/app/golf/actions/travel';
import { type TravelItinerary, groupTrips } from './travel-helpers';
import { FairwayNextTrip } from './FairwayNextTrip';
import { FairwayTravelSeason } from './FairwayTravelSeason';
import { FairwayTripCard } from './FairwayTripCard';
import { FairwayTripDetail } from './FairwayTripDetail';
import { FairwayItineraryModal, type ItineraryFormData } from './FairwayItineraryModal';
import { FairwayExpenseForm } from './FairwayExpenseForm';

export interface FairwayTravelProps {
  itineraries: TravelItinerary[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
  /**
   * P314: server-computed "today" as a bare ISO date ("YYYY-MM-DD"). Used to seed
   * `now` on the FIRST paint so a finished/in-transit trip's status pill is already
   * correct on the server render instead of every trip flashing "Upcoming" until
   * the client effect runs. Date-granularity → hydration-safe (server + client
   * agree on the calendar date; the effect then upgrades to precise client time).
   */
  nowISO?: string;
  /**
   * `?trip=<id>` from the route's searchParams — the Calendar→Travel
   * cross-link (FairwayEventDetailDrawer's "Linked travel itinerary" chip).
   * When the id matches a loaded itinerary, it auto-selects on mount instead
   * of landing on the general trips list. Silently ignored if the trip isn't
   * found (deleted, wrong team) — honest, no error for a stale link.
   */
  initialTripId?: string;
}

/**
 * Parse a bare ISO date ("YYYY-MM-DD") to LOCAL midnight, identical to
 * travel-helpers#parseDateLocal, so the seeded `now` and trip dates compare in
 * the same local-midnight space. Returns null for a missing/malformed value.
 */
function parseSeedDate(iso?: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function FairwayTravel({
  itineraries: initialItineraries,
  coachId,
  teamId,
  isCoach,
  nowISO,
  initialTripId,
}: FairwayTravelProps) {
  const router = useRouter();
  const badges = useNotificationBadges();
  const prefersReducedMotion = useReducedMotionGuard();

  const [itineraries, setItineraries] = React.useState(initialItineraries);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const detailPanelRef = React.useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = React.useState<'details' | 'expenses'>('details');

  // Itinerary create/edit modal.
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TravelItinerary | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Seed `now` from the server-passed date (P314) so the first paint already
  // computes the correct lifecycle bucket per trip — no "Upcoming" flash on a
  // finished/in-transit trip. Date-granularity seed keeps server + client first
  // render identical (hydration-safe); the effect then upgrades to precise time.
  const [now, setNow] = React.useState<Date | null>(() => parseSeedDate(nowISO));
  React.useEffect(() => {
    setNow(new Date());
  }, []);

  // Keep local state in sync if the server passes fresh data (router.refresh).
  React.useEffect(() => {
    setItineraries(initialItineraries);
  }, [initialItineraries]);

  // Players: mark travel seen on mount, then refresh the badge (verbatim).
  React.useEffect(() => {
    if (!isCoach) {
      // Best-effort: a failed mark only leaves the badge stale until the next
      // visit. Without the catch it surfaced as an unhandled rejection (DATA-03).
      markTravelSeen()
        .then(() => badges.refetch())
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach]);

  const selected = React.useMemo(
    () => itineraries.find((i) => i.id === selectedId) ?? null,
    [itineraries, selectedId],
  );

  // Redesign 2026-09-28 (docs/redesign/travel): trips are grouped with the
  // same rules as the status pills, the next (or current) trip leads, and the
  // desktop detail panel shows it by default instead of an empty
  // "Select a trip" pane. `selected` stays the explicit choice (it drives the
  // phone nav stack); `shown` is what the detail panel renders.
  const groups = React.useMemo(() => groupTrips(itineraries, now), [itineraries, now]);
  const nextTrip = groups.current[0] ?? groups.upcoming[0] ?? null;
  const comingUp = React.useMemo(
    () => [...groups.current, ...groups.upcoming].filter((t) => t.id !== nextTrip?.id),
    [groups, nextTrip],
  );
  const shown = selected ?? nextTrip ?? groups.past[0] ?? null;
  const [showPast, setShowPast] = React.useState(false);

  // ── Deep-link auto-select (Calendar→Travel cross-link, P440 symmetric fix)
  // FairwayEventDetailDrawer's "Linked travel itinerary" chip deep-links here
  // with `?trip=<id>` instead of just landing on the general hub. Selects the
  // matching trip ONCE the id is found in the loaded list, then scrolls the
  // detail panel into view (it renders below the list on mobile, off-screen
  // otherwise). A ref guards against re-selecting after the coach/player picks
  // a different trip. Silently no-ops if the trip never shows up — honest,
  // never an error for a stale link.
  const autoSelectedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialTripId || autoSelectedRef.current) return;
    const match = itineraries.find((i) => i.id === initialTripId);
    if (!match) return;
    autoSelectedRef.current = true;
    setSelectedId(match.id);
    setActiveTab('details');
    // Defer to the next paint so the detail panel exists before scrolling.
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }, [initialTripId, itineraries, prefersReducedMotion]);

  /* ── expense state (parent-owned, verbatim) ─────────────────────────────── */
  const [expenses, setExpenses] = React.useState<TravelExpense[]>([]);
  const [expenseSummary, setExpenseSummary] = React.useState<ExpenseSummaryType | null>(null);
  const [budgets, setBudgets] = React.useState<TravelBudget[]>([]);
  const [loadingExpenses, setLoadingExpenses] = React.useState(false);
  const [showExpenseForm, setShowExpenseForm] = React.useState(false);
  const [editingExpense, setEditingExpense] = React.useState<TravelExpense | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const loadExpenses = React.useCallback(async () => {
    if (!shown) return;
    setLoadingExpenses(true);
    try {
      const [expensesResult, summaryResult, budgetsResult] = await Promise.all([
        getExpensesForItinerary(shown.id),
        getExpenseSummary(shown.id),
        getBudgetsForItinerary(shown.id),
      ]);
      if (expensesResult.success) setExpenses(expensesResult.data || []);
      if (summaryResult.success) setExpenseSummary(summaryResult.data || null);
      if (budgetsResult.success) setBudgets(budgetsResult.data || []);
    } catch {
      fairwayToast.danger('Failed to load expense data. Please try again.');
    } finally {
      setLoadingExpenses(false);
    }
  }, [shown]);

  // A different trip means different expenses: clear the previous trip's
  // rows so the delete-confirm count and the tab never show another trip's data.
  const shownId = shown?.id ?? null;
  React.useEffect(() => {
    setExpenses([]);
    setExpenseSummary(null);
    setBudgets([]);
  }, [shownId]);

  React.useEffect(() => {
    if (shown && activeTab === 'expenses') {
      loadExpenses();
    }
  }, [shown, activeTab, loadExpenses]);

  /* ── selection ──────────────────────────────────────────────────────────── */
  // `?trip=` mirrors the selection. Picking a trip PUSHES a history entry so
  // the phone's back gesture (iOS edge swipe) returns to the list instead of
  // leaving Travel; "All trips" pops it. `popstate` re-reads the URL.
  const pushedRef = React.useRef(false);
  const tripUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('trip', id);
    else url.searchParams.delete('trip');
    return url;
  };
  const syncTripParam = (id: string | null) => {
    if (typeof window === 'undefined') return;
    if (id) {
      window.history.pushState(window.history.state, '', tripUrl(id));
      pushedRef.current = true;
    } else {
      window.history.replaceState(window.history.state, '', tripUrl(null));
      pushedRef.current = false;
    }
  };
  React.useEffect(() => {
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get('trip');
      pushedRef.current = false;
      setSelectedId(id && itineraries.some((i) => i.id === id) ? id : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [itineraries]);

  // Move focus to the opened trip's heading once it has rendered (screen
  // readers and keyboard users land on what they opened, not on <body>).
  const focusOnOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (!selectedId || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    detailPanelRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [selectedId]);

  const backToList = () => {
    if (pushedRef.current) {
      window.history.back(); // popstate clears the selection
    } else {
      setSelectedId(null);
      syncTripParam(null);
    }
    window.scrollTo({ top: 0 });
  };

  const handleSelect = (itinerary: TravelItinerary) => {
    setSelectedId(itinerary.id);
    setActiveTab('details');
    syncTripParam(itinerary.id);
    focusOnOpenRef.current = true;
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    }
  };

  /* ── create / edit ──────────────────────────────────────────────────────── */
  const openCreate = () => {
    setEditing(null);
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = (itinerary: TravelItinerary) => {
    setEditing(itinerary);
    setSaveError(null);
    setModalOpen(true);
  };

  const handleSave = async (formData: ItineraryFormData) => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = editing
        ? await updateGolfTravelItinerary({ id: editing.id, ...formData })
        : await createGolfTravelItinerary({ team_id: teamId, created_by: coachId, ...formData });

      if (!result.success) {
        const msg = result.error || 'Failed to save itinerary';
        // Surface inline (inside the modal) AND via toast so the error is
        // visible even if the modal scroll position hides the InlineNotice
        // or the keyboard is covering the form on iOS.
        setSaveError(msg);
        fairwayToast.danger(msg);
        setSaving(false);
        return;
      }

      setModalOpen(false);
      setEditing(null);
      fairwayToast.success(editing ? 'Itinerary updated.' : 'Itinerary created.');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      const errMsg = err instanceof Error ? err.message : 'An error occurred';
      setSaveError(errMsg);
      // Always toast the error — on iOS the inline notice may be scrolled out
      // of view or the keyboard may be covering the form.
      fairwayToast.danger(errMsg);
    } finally {
      setSaving(false);
    }
  };

  /* ── delete (two-tap confirm lives in the detail panel header) ───────────── */
  const handleDelete = async (id: string) => {
    try {
      const result = await deleteGolfTravelItinerary(id);
      if (result.success) {
        setItineraries((prev) => prev.filter((i) => i.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          syncTripParam(null);
        }
        fairwayToast.success('Itinerary deleted.');
        router.refresh();
      } else {
        fairwayToast.danger(result.error || 'Failed to delete itinerary');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      fairwayToast.danger('An error occurred. Please try again.');
    }
  };

  /* ── expense actions (verbatim) ─────────────────────────────────────────── */
  const handleExportCSV = async () => {
    if (!shown) return;
    setExporting(true);
    const result = await exportExpensesToCSV(shown.id);
    if (result.success && result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const href = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = href;
        link.download = `expenses_${shown.event_name.replace(/\s+/g, '_')}_${
          new Date().toISOString().split('T')[0]
        }.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        // An object URL pins its Blob in memory for the lifetime of the
        // document. This handler ran on every "Export CSV" press and never
        // revoked, so a coach working a long trip leaked the full CSV of every
        // export until the tab was closed. Revoked on a macrotask so the click
        // has committed the download first — revoking synchronously can cancel
        // it in WebKit, which is the browser the iOS shell runs.
        setTimeout(() => URL.revokeObjectURL(href), 0);
      }
    } else {
      fairwayToast.danger(result.error || 'Failed to export expenses');
    }
    setExporting(false);
  };

  /* ── masthead meta (honest counts; only > 0) ────────────────────────────── */
  // Same buckets as the pills: a trip counts as completed only once its
  // status is Completed (in-transit / departed trips are still current).
  const upcomingCount = groups.current.length + groups.upcoming.length;
  const pastCount = groups.past.length;

  const meta =
    itineraries.length > 0 && now ? (
      <>
        {upcomingCount > 0 ? <span className="tabular-nums">{upcomingCount} upcoming</span> : null}
        {upcomingCount > 0 && pastCount > 0 ? <span aria-hidden>·</span> : null}
        {pastCount > 0 ? <span className="tabular-nums">{pastCount} completed</span> : null}
      </>
    ) : undefined;

  const createCta = isCoach ? (
    // `leftIcon` (not raw icon + <span> children) — Button's CHILDREN
    // CONTRACT wraps `children` in a single bare <span>; passing the icon as
    // a sibling child got silently split onto its own line by CSS anonymous
    // box rules at mobile widths, stacking the "+" above the label (founder
    // iPhone screenshot).
    // Secondary once trips exist: the page's job is reading the next trip, not
    // creating one (the empty state keeps a primary "Create first itinerary").
    <Button variant={itineraries.length === 0 ? 'primary' : 'secondary'} leftIcon={<IconPlus size={16} />} onClick={openCreate}>
      Add itinerary
    </Button>
  ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        title="Travel"
        description={
          itineraries.length === 0
            ? isCoach
              ? 'Build itineraries for upcoming tournaments and team trips.'
              : 'Travel details will appear here as your coach posts them.'
            : undefined
        }
        meta={meta}
        primaryAction={createCta}
      />

      {itineraries.length === 0 ? (
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={Plane}
              title="No travel itineraries yet"
              description={
                isCoach
                  ? 'Create travel itineraries for upcoming tournaments and events.'
                  : 'Travel details will appear here when your coach posts them.'
              }
              action={
                isCoach ? (
                  <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={openCreate}>
                    Create first itinerary
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      ) : (
        <>
        {/* The season at a glance: every trip on a real date axis. */}
        <div className={cn('mt-6', selected && 'hidden lg:block')}>
          <FairwayTravelSeason
            itineraries={itineraries}
            now={now}
            selectedId={shown?.id ?? null}
            nextId={nextTrip?.id ?? null}
            onSelect={handleSelect}
          />
        </div>
        {/* Desktop: the boarding pass spans the page (phones get it at the top
            of the list column instead). */}
        {nextTrip ? (
          <div className="mt-6 hidden lg:block">
            <FairwayNextTrip itinerary={nextTrip} now={now} onOpen={() => handleSelect(nextTrip)} />
          </div>
        ) : null}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          {/* ── Itinerary list ─────────────────────────────────────────── */}
          {/* NAT-05: below lg this is a navigation stack, not a split view.
              The list is the root; picking a trip pushes its detail in the
              list's place, with a Back control. The "Select a trip" pane is a
              desktop-only affordance (it read as an empty screen on a phone). */}
          <div className={cn('flex flex-col gap-6 lg:col-span-1', selected && 'hidden lg:flex')}>
            {/* Phone: the next trip is the answer, so it leads as a hero.
                Desktop shows it in the detail panel instead. */}
            {nextTrip ? (
              <div className="lg:hidden">
                <FairwayNextTrip itinerary={nextTrip} now={now} onOpen={() => handleSelect(nextTrip)} />
              </div>
            ) : null}

            {nextTrip || comingUp.length > 0 ? (
              <section aria-labelledby="coming-up-heading" className={cn('flex flex-col gap-2', comingUp.length === 0 && 'hidden lg:flex')}>
                <h2 id="coming-up-heading" className="px-1 font-fw-sans text-eyebrow uppercase text-text-tertiary">
                  Coming up
                </h2>
                {nextTrip ? (
                  <div className="hidden lg:block">
                    <FairwayTripCard
                      itinerary={nextTrip}
                      selected={shown?.id === nextTrip.id}
                      now={now}
                      onSelect={() => handleSelect(nextTrip)}
                    />
                  </div>
                ) : null}
                {comingUp.map((itinerary) => (
                  <FairwayTripCard
                    key={itinerary.id}
                    itinerary={itinerary}
                    selected={shown?.id === itinerary.id}
                    now={now}
                    onSelect={() => handleSelect(itinerary)}
                  />
                ))}
              </section>
            ) : (
              <p className="px-1 font-fw-sans text-body-sm text-text-secondary">
                No trips coming up.{isCoach ? ' Add an itinerary when the next one is booked.' : ''}
              </p>
            )}

            {groups.past.length > 0 ? (
              <section aria-labelledby="past-trips-heading" className="flex flex-col gap-2">
                <h2 id="past-trips-heading">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={showPast}
                    aria-controls={showPast ? 'past-trips-list' : undefined}
                    onClick={() => setShowPast((v) => !v)}
                    rightIcon={
                      <ChevronDown
                        aria-hidden
                        className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', showPast && 'rotate-180')}
                      />
                    }
                    className="-ml-2 text-text-tertiary"
                  >
                    Past trips <span className="ml-1 tabular-nums">({groups.past.length})</span>
                  </Button>
                </h2>
                {showPast ? (
                  <div id="past-trips-list" className="flex flex-col gap-2">
                    {groups.past.map((itinerary) => (
                      <FairwayTripCard
                        key={itinerary.id}
                        itinerary={itinerary}
                        selected={shown?.id === itinerary.id}
                        now={now}
                        onSelect={() => handleSelect(itinerary)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {/* ── Detail panel ───────────────────────────────────────────────
              #173: `lg:items-start` above (on the grid) + `lg:self-start`
              here stop this column from being CSS-Grid `stretch`-ed to match
              the trip list's height. Without that, a long trip list stretched
              this column's Surface to match, and both the populated detail
              AND the "Select a trip" empty state (each vertically centered
              inside their own Surface) rendered at that stretched height's
              MIDPOINT — often well past one viewport height down the page.
              On first paint (scrolled to top) that put the pane below the
              fold entirely; scrolled to the bottom of a long list it was
              already scrolled PAST. Either way it read as "orphaned" —
              never reliably in view, and on shorter viewports landing right
              at the bottom safe-area the mobile bottom nav also clears.
              `lg:sticky lg:top-6` pins it near the top of the viewport on
              desktop instead (mirrors FairwayTasks's templates rail), so it —
              and the real detail view once a trip IS selected — stay visible
              the whole time the list scrolls beside them. ─────────────────── */}
          <div
            ref={detailPanelRef}
            className={cn(
              'lg:col-span-2 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto',
              !selected && 'hidden lg:block',
            )}
          >
            {selected ? (
              <div className="mb-3 lg:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ChevronLeft size={16} aria-hidden />}
                  onClick={backToList}
                >
                  All trips
                </Button>
              </div>
            ) : null}
            {shown ? (
              <FairwayTripDetail
                itinerary={shown}
                now={now}
                isCoach={isCoach}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onEdit={() => openEdit(shown)}
                onDelete={() => handleDelete(shown.id)}
                expenses={expenses}
                expenseSummary={expenseSummary}
                budgets={budgets}
                loadingExpenses={loadingExpenses}
                exporting={exporting}
                onAddExpense={() => {
                  setEditingExpense(null);
                  setShowExpenseForm(true);
                }}
                onEditExpense={(expense) => {
                  setEditingExpense(expense);
                  setShowExpenseForm(true);
                }}
                onRefreshExpenses={loadExpenses}
                onExportCSV={handleExportCSV}
              />
            ) : null}
          </div>
        </div>
        </>
      )}

      {/* ── Coach create / edit modal ──────────────────────────────────── */}
      {isCoach ? (
        <FairwayItineraryModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
            setSaveError(null);
          }}
          editing={editing}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          teamId={teamId}
        />
      ) : null}

      {/* ── Expense form — P317: Fairway-native form in the same ModalShell
          paradigm as the itinerary editor (writes preserved verbatim). ──── */}
      {shown ? (
        <FairwayExpenseForm
          isOpen={showExpenseForm}
          onClose={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
          onSaved={loadExpenses}
          teamId={teamId}
          itineraryId={shown.id}
          expense={editingExpense}
        />
      ) : null}
    </div>
  );
}
