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
import { useReducedMotion } from 'framer-motion';
import { Plane } from 'lucide-react';

import {
  ViewHeader,
  Surface,
  Button,
  EmptyState,
  fairwayToast,
} from '@/components/fairway';
import { IconPlus } from '@/components/icons';
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
import type { TravelItinerary } from './travel-helpers';
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
  const prefersReducedMotion = useReducedMotion();

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
      markTravelSeen().then(() => badges.refetch());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach]);

  const selected = React.useMemo(
    () => itineraries.find((i) => i.id === selectedId) ?? null,
    [itineraries, selectedId],
  );

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
    if (!selected) return;
    setLoadingExpenses(true);
    try {
      const [expensesResult, summaryResult, budgetsResult] = await Promise.all([
        getExpensesForItinerary(selected.id),
        getExpenseSummary(selected.id),
        getBudgetsForItinerary(selected.id),
      ]);
      if (expensesResult.success) setExpenses(expensesResult.data || []);
      if (summaryResult.success) setExpenseSummary(summaryResult.data || null);
      if (budgetsResult.success) setBudgets(budgetsResult.data || []);
    } catch {
      fairwayToast.danger('Failed to load expense data. Please try again.');
    } finally {
      setLoadingExpenses(false);
    }
  }, [selected]);

  React.useEffect(() => {
    if (selected && activeTab === 'expenses') {
      loadExpenses();
    }
  }, [selected, activeTab, loadExpenses]);

  /* ── selection ──────────────────────────────────────────────────────────── */
  const handleSelect = (itinerary: TravelItinerary) => {
    setSelectedId(itinerary.id);
    setActiveTab('details');
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
        if (selectedId === id) setSelectedId(null);
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
    if (!selected) return;
    setExporting(true);
    const result = await exportExpensesToCSV(selected.id);
    if (result.success && result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `expenses_${selected.event_name.replace(/\s+/g, '_')}_${
        new Date().toISOString().split('T')[0]
      }.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      fairwayToast.danger(result.error || 'Failed to export expenses');
    }
    setExporting(false);
  };

  /* ── masthead meta (honest counts; only > 0) ────────────────────────────── */
  const upcomingCount = React.useMemo(() => {
    if (!now) return 0;
    return itineraries.filter((i) => {
      const [y, m, d] = i.departure_date.split('-').map(Number);
      return new Date(y!, (m! - 1), d!) > now;
    }).length;
  }, [itineraries, now]);
  const pastCount = itineraries.length - upcomingCount;

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
    <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={openCreate}>
      Add itinerary
    </Button>
  ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Travel"
        title="Trips on the calendar."
        description={
          itineraries.length === 0
            ? isCoach
              ? 'Build itineraries for upcoming tournaments and team trips.'
              : 'Travel details will appear here as your coach posts them.'
            : 'Schedule, lodging, gear, and expenses for every team trip.'
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
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          {/* ── Itinerary list ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:col-span-1">
            <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
              Trips
            </h3>
            {itineraries.map((itinerary) => (
              <FairwayTripCard
                key={itinerary.id}
                itinerary={itinerary}
                selected={selectedId === itinerary.id}
                now={now}
                onSelect={() => handleSelect(itinerary)}
              />
            ))}
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
          <div ref={detailPanelRef} className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
            {selected ? (
              <FairwayTripDetail
                itinerary={selected}
                isCoach={isCoach}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onEdit={() => openEdit(selected)}
                onDelete={() => handleDelete(selected.id)}
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
            ) : (
              <Surface elevation="border" padding="lg">
                <EmptyState
                  variant="subtle"
                  icon={Plane}
                  title="Select a trip"
                  description="Choose a travel itinerary from the list to view its details and expenses."
                />
              </Surface>
            )}
          </div>
        </div>
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
      {selected ? (
        <FairwayExpenseForm
          isOpen={showExpenseForm}
          onClose={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
          onSaved={loadExpenses}
          teamId={teamId}
          itineraryId={selected.id}
          expense={editingExpense}
        />
      ) : null}
    </div>
  );
}

export default FairwayTravel;
