'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayTripDetail — the selected-trip detail + expenses
 * ----------------------------------------------------------------------------
 * The read of ONE itinerary. Two tabs (Fairway Tabs primitive):
 *
 *   • Details  — schedule (depart/return), lodging, flight info, room
 *                assignments, uniform, gear, notes. Honest emptiness: only
 *                fields that exist render; nothing is fabricated.
 *   • Expenses — REUSES the legacy ExpenseSummary / ExpenseList / (the form is
 *                mounted by the parent) VERBATIM. The expense sub-feature has
 *                its own self-contained write surface; we do not re-implement
 *                it. The parent owns the load/export/CRUD wiring and passes it
 *                down (no writes happen in this presentational component).
 *
 * Coach actions (edit / delete) sit in the panel header; delete is a two-tap
 * inline confirm (no destructive auto-fire) and calls the parent handler which
 * uses the unchanged deleteGolfTravelItinerary action.
 *
 * Presentation only. Tokens ONLY (legacy expense components keep their own
 * styling — they are reused, not re-skinned, per the file-ownership rule).
 * ========================================================================== */

import * as React from 'react';
import { MapPin, Pencil, Trash2, Download, Plus, Receipt } from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  EmptyState,
  Skeleton,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import { ExpenseList, ExpenseSummary } from '@/components/golf/travel';
import type {
  TravelExpense,
  ExpenseSummary as ExpenseSummaryType,
  TravelBudget,
} from '@/app/golf/actions/travel';
import {
  type TravelItinerary,
  TRANSPORT_ICON,
  TRANSPORT_LABEL,
  formatTravelDate,
  formatTravelTime,
} from './travel-helpers';

const EM_DASH = '—';

export interface FairwayTripDetailProps {
  itinerary: TravelItinerary;
  isCoach: boolean;
  activeTab: 'details' | 'expenses';
  onTabChange: (tab: 'details' | 'expenses') => void;
  onEdit: () => void;
  onDelete: () => void;
  /* ── expenses wiring (owned by the parent; passed in) ── */
  expenses: TravelExpense[];
  expenseSummary: ExpenseSummaryType | null;
  budgets: TravelBudget[];
  loadingExpenses: boolean;
  exporting: boolean;
  onAddExpense: () => void;
  onEditExpense: (expense: TravelExpense) => void;
  onRefreshExpenses: () => void;
  onExportCSV: () => void;
}

/* ───────────────────────────────────────────────────────────────────────────
 * A labeled detail row. `value` is rendered honestly — callers only pass rows
 * for fields that exist, so we never show a fabricated value.
 * ────────────────────────────────────────────────────────────────────────── */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">{value}</p>
    </div>
  );
}

export function FairwayTripDetail({
  itinerary,
  isCoach,
  activeTab,
  onTabChange,
  onEdit,
  onDelete,
  expenses,
  expenseSummary,
  budgets,
  loadingExpenses,
  exporting,
  onAddExpense,
  onEditExpense,
  onRefreshExpenses,
  onExportCSV,
}: FairwayTripDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const Icon = TRANSPORT_ICON[itinerary.transportation_type];

  // Reset the delete confirm when the selected trip changes.
  React.useEffect(() => {
    setConfirmingDelete(false);
  }, [itinerary.id]);

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    onDelete();
  };

  return (
    <Surface elevation="border" padding="none" className="overflow-hidden">
      {/* A single Tabs root spans the header (TabsList) AND the body
          (TabsContent) — Radix Tabs share context, so they must co-exist under
          one root. `gap-0` overrides the root's default gap-6 so the header
          border sits flush against the content. */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as 'details' | 'expenses')}
        className="gap-0"
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 border-b border-border-subtle p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-fw-display text-h3 font-medium tracking-[-0.01em] text-text-primary">
                  {itinerary.event_name}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 font-fw-sans text-body-sm text-text-secondary">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
                  <span className="truncate">{itinerary.destination}</span>
                  <span aria-hidden className="text-text-tertiary">·</span>
                  <span className="text-text-tertiary">
                    {TRANSPORT_LABEL[itinerary.transportation_type]}
                  </span>
                </p>
              </div>
            </div>

            {isCoach ? (
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  leftIcon={<Pencil className="h-4 w-4" />}
                >
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button
                  variant={confirmingDelete ? 'danger' : 'ghost'}
                  size="sm"
                  onClick={handleDeleteClick}
                  onBlur={() => setConfirmingDelete(false)}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  {confirmingDelete ? 'Tap to confirm' : <span className="hidden sm:inline">Delete</span>}
                </Button>
              </div>
            ) : null}
          </div>

          <TabsList aria-label="Trip sections">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          </TabsList>
        </div>

        {/* ═══════════ DETAILS ═══════════ */}
        <TabsContent value="details" className="p-6">
          <div className="flex flex-col gap-5">
            {/* Schedule */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Inset padding="sm">
                <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">
                  Departure
                </p>
                <p className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary tabular-nums">
                  {formatTravelDate(itinerary.departure_date)}
                </p>
                {itinerary.departure_time ? (
                  <p className="font-fw-sans text-caption text-text-tertiary tabular-nums">
                    {formatTravelTime(itinerary.departure_time)}
                  </p>
                ) : null}
                {itinerary.departure_location ? (
                  <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                    {itinerary.departure_location}
                  </p>
                ) : null}
              </Inset>
              {itinerary.return_date ? (
                <Inset padding="sm">
                  <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">
                    Return
                  </p>
                  <p className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary tabular-nums">
                    {formatTravelDate(itinerary.return_date)}
                  </p>
                  {itinerary.return_time ? (
                    <p className="font-fw-sans text-caption text-text-tertiary tabular-nums">
                      {formatTravelTime(itinerary.return_time)}
                    </p>
                  ) : null}
                </Inset>
              ) : null}
            </div>

            {/* Lodging */}
            {itinerary.hotel_name ? (
              <Inset padding="sm">
                <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">
                  Lodging
                </p>
                <p className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary">
                  {itinerary.hotel_name}
                </p>
                {itinerary.hotel_address ? (
                  <p className="font-fw-sans text-caption text-text-secondary">
                    {itinerary.hotel_address}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                  {itinerary.hotel_phone ? (
                    <span>
                      Phone:{' '}
                      <span className="text-text-secondary tabular-nums">{itinerary.hotel_phone}</span>
                    </span>
                  ) : null}
                  {itinerary.hotel_confirmation ? (
                    <span>
                      Confirmation:{' '}
                      <span className="text-text-secondary">{itinerary.hotel_confirmation}</span>
                    </span>
                  ) : null}
                </div>
              </Inset>
            ) : null}

            {/* Remaining detail fields — only render the ones that exist. */}
            {itinerary.flight_info ||
            itinerary.room_assignments ||
            itinerary.uniform_requirements ||
            itinerary.gear_list ||
            itinerary.notes ? (
              <div className="flex flex-col gap-4">
                {itinerary.flight_info ? (
                  <DetailRow label="Flight info" value={itinerary.flight_info} />
                ) : null}
                {itinerary.room_assignments ? (
                  <DetailRow label="Room assignments" value={itinerary.room_assignments} />
                ) : null}
                {itinerary.uniform_requirements ? (
                  <DetailRow label="Uniform" value={itinerary.uniform_requirements} />
                ) : null}
                {itinerary.gear_list ? (
                  <DetailRow label="Gear list" value={itinerary.gear_list} />
                ) : null}
                {itinerary.notes ? <DetailRow label="Notes" value={itinerary.notes} /> : null}
              </div>
            ) : null}

            {/* Honest "nothing else added" — when only the required schedule
                fields exist and the coach added no lodging/logistics. */}
            {!itinerary.hotel_name &&
            !itinerary.flight_info &&
            !itinerary.room_assignments &&
            !itinerary.uniform_requirements &&
            !itinerary.gear_list &&
            !itinerary.notes ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">
                No lodging or logistics added yet {EM_DASH} the schedule above is all that&rsquo;s posted.
              </p>
            ) : null}
          </div>
        </TabsContent>

        {/* ═══════════ EXPENSES ═══════════ */}
        <TabsContent value="expenses" className="p-6">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h3 className="font-fw-sans text-body-lg font-semibold text-text-primary">
              Trip expenses
            </h3>
            <div className="flex items-center gap-1.5">
              {expenses.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExportCSV}
                  busy={exporting}
                  disabled={exporting}
                  leftIcon={<Download className="h-4 w-4" />}
                >
                  Export CSV
                </Button>
              ) : null}
              {isCoach ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onAddExpense}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Add expense
                </Button>
              ) : null}
            </div>
          </div>

          {loadingExpenses ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-2/3" />
            </div>
          ) : expenses.length === 0 ? (
            <Surface elevation="border" padding="none">
              <EmptyState
                variant="subtle"
                icon={Receipt}
                title="No expenses logged"
                description={
                  isCoach
                    ? 'Track lodging, transport, meals, and entry fees for this trip.'
                    : 'Trip expenses your coach logs will appear here.'
                }
                action={
                  isCoach ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onAddExpense}
                      leftIcon={<Plus className="h-4 w-4" />}
                    >
                      Add expense
                    </Button>
                  ) : undefined
                }
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Legacy expense components reused VERBATIM (own styling). */}
              {expenseSummary && expenseSummary.count > 0 ? (
                <ExpenseSummary
                  summary={expenseSummary}
                  budgets={budgets}
                  itineraryId={itinerary.id}
                  isCoach={isCoach}
                  onBudgetUpdated={onRefreshExpenses}
                />
              ) : null}
              <div>
                <h4 className={cn('mb-3 font-fw-sans text-body-sm font-semibold text-text-secondary')}>
                  All expenses
                </h4>
                <ExpenseList
                  expenses={expenses}
                  onEdit={onEditExpense}
                  onRefresh={onRefreshExpenses}
                  isCoach={isCoach}
                />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Surface>
  );
}

export default FairwayTripDetail;
