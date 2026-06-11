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
 *                   getBudgetsForItinerary / exportExpensesToCSV (unchanged) +
 *                   the legacy ExpenseForm / ExpenseList / ExpenseSummary
 *                   components reused as-is (not re-skinned; file-ownership).
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
import { ExpenseForm } from '@/components/golf/travel';

import type { TravelItinerary } from './travel-helpers';
import { FairwayTripCard } from './FairwayTripCard';
import { FairwayTripDetail } from './FairwayTripDetail';
import { FairwayItineraryModal, type ItineraryFormData } from './FairwayItineraryModal';

export interface FairwayTravelProps {
  itineraries: TravelItinerary[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

export function FairwayTravel({
  itineraries: initialItineraries,
  coachId,
  teamId,
  isCoach,
}: FairwayTravelProps) {
  const router = useRouter();
  const badges = useNotificationBadges();

  const [itineraries, setItineraries] = React.useState(initialItineraries);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'details' | 'expenses'>('details');

  // Itinerary create/edit modal.
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TravelItinerary | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // A single mount-time `now` (day granularity → no SSR hydration drift).
  const [now, setNow] = React.useState<Date | null>(null);
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
        setSaveError(result.error || 'Failed to save itinerary');
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
      setSaveError(err instanceof Error ? err.message : 'An error occurred');
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
    <Button variant="primary" onClick={openCreate}>
      <IconPlus size={16} />
      <span>Add itinerary</span>
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
                  <Button variant="primary" onClick={openCreate}>
                    <IconPlus size={16} />
                    <span>Create first itinerary</span>
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
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

          {/* ── Detail panel ───────────────────────────────────────────── */}
          <div className="lg:col-span-2">
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
        />
      ) : null}

      {/* ── Expense form (legacy component reused verbatim) ────────────── */}
      {selected ? (
        <ExpenseForm
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
