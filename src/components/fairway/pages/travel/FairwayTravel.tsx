'use client';

/**
 * ============================================================================
 * Fairway · pages/travel · FairwayTravel
 * ----------------------------------------------------------------------------
 * The shared coach + player /golf/dashboard/travel route: the team's
 * tournament travel. A presentation layer on the Fairway system; data and
 * writes are the existing ones:
 *
 *   • Data        — the page passes the mapped golf_travel_itineraries rows
 *                   (departure_date asc, is_test rows excluded).
 *   • Itinerary writes — createGolfTravelItinerary / updateGolfTravelItinerary /
 *                   deleteGolfTravelItinerary.
 *   • Expenses    — getExpensesForItinerary / getExpenseSummary /
 *                   getBudgetsForItinerary / exportExpensesToCSV, displayed by
 *                   FairwayExpenseList / FairwayExpenseSummary inside
 *                   FairwayTripDetail; the editor is FairwayExpenseForm.
 *
 * ── LAYOUT ─────────────────────────────────────────────────────────────────
 *   ViewHeader (counts by phase, the coach's one primary action), then a trip
 *   list grouped On the road / Upcoming / Past trips by local calendar day
 *   (travel-helpers `tripPhase`), beside a detail panel.
 *
 *   Desktop (lg+): the panel always shows a trip. Until one is picked it shows
 *   the default (`defaultTripId`: on the road, else the next to leave, else
 *   the latest past trip), never an empty "Select a trip". Every action in
 *   the panel (edit, delete, expenses, export, the expense form) acts on the
 *   trip the panel shows.
 *   Phone: a navigation stack. The list is the root; picking a trip pushes its
 *   detail full screen (the masthead steps aside) with an "All trips" back
 *   control, which returns focus to the card it came from (NAT-05).
 *
 * ── EXPENSES ───────────────────────────────────────────────────────────────
 *   Read per trip, for the trip the panel shows, whenever the panel is on
 *   screen (always on desktop; after a pick on a phone). Each read carries a
 *   request token, so a late answer for a trip no longer shown is dropped
 *   instead of painting its expenses (and its delete count) onto another trip.
 *   A refresh of the same trip keeps its rows on screen until the new read
 *   lands. A failed read is shown as failed with a retry, never as "none".
 *
 * ── ROLE FORK ──────────────────────────────────────────────────────────────
 *   Coaches and players see the same list and detail. Role toggles only the
 *   coach create / edit / delete and add-expense actions. Players mark travel
 *   seen on mount (badge clear, verbatim).
 *
 * Tokens only. fairwayToast for toasts. Renders inside `.fairway-ds`.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { ChevronDown, ChevronLeft, Plane } from 'lucide-react';

import { ViewHeader, Surface, Button, EmptyState, fairwayToast } from '@/components/fairway';
import { IconPlus } from '@/components/icons';
import { useMediaQuery } from '@/hooks/use-media-query';
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
import { type TravelItinerary, defaultTripId, groupTrips } from './travel-helpers';
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
   * P314: the team's wall-clock date as a bare ISO date ("YYYY-MM-DD"),
   * computed on the server in the team's timezone. It is "today" for the
   * groups, pills, countdowns and default trip, on the server render and on
   * the client alike (everything here is by calendar day, so no finer clock
   * is needed and nothing flips on hydration). Absent, the device clock is
   * used after mount.
   */
  nowISO?: string;
  /**
   * `?trip=<id>` from the route's searchParams: the Calendar→Travel
   * cross-link. When the id matches a loaded itinerary it is picked on mount.
   * Silently ignored when the trip isn't found (deleted, wrong team).
   */
  initialTripId?: string;
}

/** Past trips shown before "Show N earlier trips". */
const PAST_PREVIEW = 4;

/** The panel sits beside the list from Tailwind's `lg`. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** A bare ISO date ("YYYY-MM-DD") at LOCAL midnight; null when missing or malformed. */
function parseSeedDate(iso?: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = (iso.split('T')[0] ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

interface TripExpenses {
  tripId: string;
  /** `loading` only for a trip's first read; a refresh keeps `ready` rows. */
  status: 'loading' | 'ready' | 'error';
  expenses: TravelExpense[];
  summary: ExpenseSummaryType | null;
  budgets: TravelBudget[];
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
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [itineraries, setItineraries] = React.useState(initialItineraries);
  /** The viewer's pick. Null = nothing picked (the desktop panel shows the default). */
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'details' | 'expenses'>('details');
  const [showAllPast, setShowAllPast] = React.useState(false);
  const detailPanelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLElement>(null);
  /** The card a phone pick came from, so "All trips" can return to it. */
  const pickedFromRef = React.useRef<string | null>(null);

  // Itinerary create/edit modal.
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TravelItinerary | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // "Today" is the team's calendar date from the server, so the server render
  // and every client agree on the groups, countdowns and default trip. Only
  // without one does the device clock stand in (after mount: hydration-safe).
  const [now, setNow] = React.useState<Date | null>(() => parseSeedDate(nowISO));
  React.useEffect(() => {
    // A refresh on a new day brings a new date; the same date keeps `now`.
    const seeded = parseSeedDate(nowISO);
    setNow((prev) => {
      if (!seeded) return prev ?? new Date();
      return prev && prev.getTime() === seeded.getTime() ? prev : seeded;
    });
  }, [nowISO]);

  // Keep local state in sync if the server passes fresh data (router.refresh).
  React.useEffect(() => {
    setItineraries(initialItineraries);
  }, [initialItineraries]);

  // Players: mark travel seen on mount, then refresh the badge.
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

  /* ── groups, default, and the trip the panel shows ─────────────────────── */
  const groups = React.useMemo(
    () => (now ? groupTrips(itineraries, now) : { onTheRoad: [], upcoming: itineraries, past: [] }),
    [itineraries, now],
  );
  const defaultId = React.useMemo(
    () => (now ? defaultTripId(itineraries, now) : (itineraries[0]?.id ?? null)),
    [itineraries, now],
  );
  const selected = React.useMemo(
    () => itineraries.find((i) => i.id === selectedId) ?? null,
    [itineraries, selectedId],
  );
  const shown = React.useMemo(
    () => selected ?? itineraries.find((i) => i.id === defaultId) ?? null,
    [selected, itineraries, defaultId],
  );
  const shownId = shown?.id ?? null;
  const panelOnScreen = selected !== null || isDesktop;

  const scrollPanelIntoView = React.useCallback(() => {
    requestAnimationFrame(() => {
      const panel = detailPanelRef.current;
      panel?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      // Focus follows the push on a phone: the trip's name, not a hidden card.
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        panel?.querySelector<HTMLElement>('[data-trip-heading]')?.focus({ preventScroll: true });
      }
    });
  }, [prefersReducedMotion]);

  // ── Deep-link auto-select (Calendar→Travel cross-link, P440). Picks the
  // matching trip once it is in the loaded list, then scrolls the panel into
  // view. A ref stops it re-picking after the viewer chooses another trip.
  const autoSelectedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialTripId || autoSelectedRef.current) return;
    const match = itineraries.find((i) => i.id === initialTripId);
    if (!match) return;
    autoSelectedRef.current = true;
    setSelectedId(match.id);
    setActiveTab('details');
    scrollPanelIntoView();
  }, [initialTripId, itineraries, scrollPanelIntoView]);

  /* ── expenses: per trip, request-token guarded ──────────────────────────── */
  const [tripExpenses, setTripExpenses] = React.useState<TripExpenses | null>(null);
  const requestRef = React.useRef(0);
  const [showExpenseForm, setShowExpenseForm] = React.useState(false);
  const [editingExpense, setEditingExpense] = React.useState<TravelExpense | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const loadExpenses = React.useCallback(async (tripId: string) => {
    const token = ++requestRef.current;
    setTripExpenses((prev) =>
      prev && prev.tripId === tripId && prev.status === 'ready'
        ? prev
        : { tripId, status: 'loading', expenses: [], summary: null, budgets: [] },
    );
    try {
      const [expensesResult, summaryResult, budgetsResult] = await Promise.all([
        getExpensesForItinerary(tripId),
        getExpenseSummary(tripId),
        getBudgetsForItinerary(tripId),
      ]);
      if (token !== requestRef.current) return;
      if (!expensesResult.success) {
        setTripExpenses({ tripId, status: 'error', expenses: [], summary: null, budgets: [] });
        return;
      }
      setTripExpenses({
        tripId,
        status: 'ready',
        expenses: expensesResult.data ?? [],
        summary: summaryResult.success ? (summaryResult.data ?? null) : null,
        budgets: budgetsResult.success ? (budgetsResult.data ?? []) : [],
      });
    } catch {
      if (token !== requestRef.current) return;
      setTripExpenses({ tripId, status: 'error', expenses: [], summary: null, budgets: [] });
      fairwayToast.danger('Failed to load expense data. Please try again.');
    }
  }, []);

  // Read the shown trip's expenses once per trip while the panel is on screen.
  const loadedTripId = tripExpenses?.tripId ?? null;
  React.useEffect(() => {
    if (!shownId || !panelOnScreen || loadedTripId === shownId) return;
    void loadExpenses(shownId);
  }, [shownId, panelOnScreen, loadedTripId, loadExpenses]);

  // Only the shown trip's own read ever reaches the panel.
  const shownExpenses = tripExpenses && tripExpenses.tripId === shownId ? tripExpenses : null;
  const refreshShownExpenses = React.useCallback(() => {
    if (shownId) void loadExpenses(shownId);
  }, [shownId, loadExpenses]);

  /* ── selection ──────────────────────────────────────────────────────────── */
  const handleSelect = (itinerary: TravelItinerary) => {
    if (itinerary.id !== shownId) setActiveTab('details');
    setSelectedId(itinerary.id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      pickedFromRef.current = itinerary.id;
      scrollPanelIntoView();
    }
  };

  const handleBack = () => {
    setSelectedId(null);
    const from = pickedFromRef.current;
    pickedFromRef.current = null;
    if (!from) return;
    requestAnimationFrame(() => {
      // Trip ids are uuids, safe inside a quoted attribute selector.
      const card = listRef.current?.querySelector<HTMLElement>(`[data-trip-id="${from}"]`);
      card?.scrollIntoView({ behavior: 'auto', block: 'center' });
      card?.focus({ preventScroll: true });
    });
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
        // Inline (inside the modal) AND a toast, so the error is visible even
        // if the modal's scroll or the iOS keyboard hides the notice.
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
      fairwayToast.danger(errMsg);
    } finally {
      setSaving(false);
    }
  };

  /* ── delete (the confirm lives in the detail panel) ─────────────────────── */
  const handleDelete = async (id: string) => {
    try {
      const result = await deleteGolfTravelItinerary(id);
      if (result.success) {
        setItineraries((prev) => prev.filter((i) => i.id !== id));
        if (selectedId === id) setSelectedId(null);
        setTripExpenses((prev) => (prev?.tripId === id ? null : prev));
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

  /* ── export ─────────────────────────────────────────────────────────────── */
  const handleExportCSV = async () => {
    const trip = shown;
    if (!trip) return;
    setExporting(true);
    const result = await exportExpensesToCSV(trip.id);
    if (result.success && result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const href = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = href;
        link.download = `expenses_${trip.event_name.replace(/\s+/g, '_')}_${
          new Date().toISOString().split('T')[0]
        }.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        // An object URL pins its Blob for the document's lifetime; revoke on a
        // macrotask so the click has committed the download first (revoking
        // synchronously can cancel it in WebKit, the iOS shell's browser).
        setTimeout(() => URL.revokeObjectURL(href), 0);
      }
    } else {
      fairwayToast.danger(result.error || 'Failed to export expenses');
    }
    setExporting(false);
  };

  /* ── masthead meta: counts by phase, only those above zero ──────────────── */
  const meta = React.useMemo(() => {
    if (itineraries.length === 0 || !now) return undefined;
    const parts = [
      groups.onTheRoad.length > 0 ? `${groups.onTheRoad.length} on the road` : null,
      groups.upcoming.length > 0 ? `${groups.upcoming.length} upcoming` : null,
      groups.past.length > 0 ? `${groups.past.length} past` : null,
    ].filter((p): p is string => p !== null);
    return (
      <>
        {parts.map((part, i) => (
          <React.Fragment key={part}>
            {i > 0 ? <span aria-hidden>·</span> : null}
            <span className="tabular-nums">{part}</span>
          </React.Fragment>
        ))}
      </>
    );
  }, [itineraries.length, now, groups]);

  const createCta = isCoach ? (
    // `leftIcon` (not a raw icon child): Button wraps `children` in one span,
    // and a sibling icon was split onto its own line at phone widths.
    <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={openCreate}>
      Add itinerary
    </Button>
  ) : undefined;

  /* ── past trips: the latest few, then the rest on request ───────────────── */
  const shownPastIndex = shownId ? groups.past.findIndex((i) => i.id === shownId) : -1;
  const pastCollapsible = groups.past.length > PAST_PREVIEW + 1;
  const pastExpanded = showAllPast || !pastCollapsible || shownPastIndex >= PAST_PREVIEW;
  const visiblePast = pastExpanded ? groups.past : groups.past.slice(0, PAST_PREVIEW);
  const hiddenPastCount = groups.past.length - PAST_PREVIEW;

  const renderCards = (trips: TravelItinerary[]) => (
    <ul className="flex flex-col gap-3">
      {trips.map((itinerary) => (
        <li key={itinerary.id}>
          <FairwayTripCard
            itinerary={itinerary}
            selected={selected?.id === itinerary.id}
            shownOnDesktop={!selected && shownId === itinerary.id}
            now={now}
            onSelect={() => handleSelect(itinerary)}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8">
      {/* On a phone a picked trip is a pushed screen: the masthead steps aside. */}
      <div className={cn(selected && 'hidden lg:block')}>
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
      </div>

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
        <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start', selected ? 'mt-0 lg:mt-8' : 'mt-8')}>
          {/* ── Trip list, grouped by phase ───────────────────────────────── */}
          <section
            ref={listRef}
            aria-label="Trips"
            className={cn('flex flex-col gap-6 lg:col-span-1', selected && 'hidden lg:flex')}
          >
            <TripGroup title="On the road" count={groups.onTheRoad.length}>
              {renderCards(groups.onTheRoad)}
            </TripGroup>
            <TripGroup title={now ? 'Upcoming' : 'Trips'} count={groups.upcoming.length}>
              {renderCards(groups.upcoming)}
            </TripGroup>
            <TripGroup title="Past trips" count={groups.past.length}>
              {renderCards(visiblePast)}
              {pastCollapsible && shownPastIndex < PAST_PREVIEW ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={pastExpanded}
                  onClick={() => setShowAllPast((v) => !v)}
                  rightIcon={
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform [transition-duration:180ms] motion-reduce:transition-none',
                        pastExpanded && 'rotate-180',
                      )}
                    />
                  }
                  className="mt-2 self-start"
                >
                  {pastExpanded
                    ? 'Show fewer'
                    : `Show ${hiddenPastCount} earlier ${hiddenPastCount === 1 ? 'trip' : 'trips'}`}
                </Button>
              ) : null}
            </TripGroup>
          </section>

          {/* ── Detail panel ───────────────────────────────────────────────
              #173: `lg:items-start` on the grid + `lg:self-start` here stop
              CSS Grid from stretching this column to the list's height (which
              pushed the panel's content past the fold); `lg:sticky lg:top-6`
              keeps it in view while a long list scrolls beside it. Below lg it
              renders only for a picked trip. ─────────────────────────────── */}
          <div
            ref={detailPanelRef}
            className={cn(
              'scroll-mt-4 lg:col-span-2 lg:sticky lg:top-6 lg:self-start',
              !selected && 'hidden lg:block',
            )}
          >
            {selected ? (
              <div className="mb-3 lg:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ChevronLeft size={16} aria-hidden />}
                  onClick={handleBack}
                  className="-ml-2"
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
                expenses={shownExpenses?.expenses ?? []}
                expenseSummary={shownExpenses?.summary ?? null}
                budgets={shownExpenses?.budgets ?? []}
                loadingExpenses={!shownExpenses || shownExpenses.status === 'loading'}
                expensesFailed={shownExpenses?.status === 'error'}
                expenseCount={shownExpenses?.status === 'ready' ? shownExpenses.expenses.length : null}
                exporting={exporting}
                onAddExpense={() => {
                  setEditingExpense(null);
                  setShowExpenseForm(true);
                }}
                onEditExpense={(expense) => {
                  setEditingExpense(expense);
                  setShowExpenseForm(true);
                }}
                onRefreshExpenses={refreshShownExpenses}
                onExportCSV={handleExportCSV}
              />
            ) : null}
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

      {/* ── Expense form (P317), for the trip the panel shows ─────────────── */}
      {shown ? (
        <FairwayExpenseForm
          isOpen={showExpenseForm}
          onClose={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
          onSaved={refreshShownExpenses}
          teamId={teamId}
          itineraryId={shown.id}
          expense={editingExpense}
        />
      ) : null}
    </div>
  );
}

/** One phase of the list: a small heading with its count over a hairline. Hidden when empty. */
function TripGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const headingId = React.useId();
  if (count === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 px-1">
        <h2 id={headingId} className="font-fw-sans text-body-sm font-semibold text-text-primary">
          {title}
        </h2>
        <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">{count}</span>
        <span aria-hidden className="h-px flex-1 bg-border-subtle" />
      </div>
      {children}
    </section>
  );
}
