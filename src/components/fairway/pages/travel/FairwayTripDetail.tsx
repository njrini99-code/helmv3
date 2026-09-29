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
 *   • Expenses — FairwayExpenseSummary / FairwayExpenseList, the Fairway
 *                re-skins of the legacy ExpenseSummary / ExpenseList (this
 *                file used to reuse those VERBATIM; that was a deliberate
 *                scope cut, now closed — see FairwayExpenseList.tsx /
 *                FairwayExpenseSummary.tsx for what changed). The form is
 *                mounted by the parent. The parent owns the load/export/CRUD
 *                wiring and passes it down (no writes happen in this
 *                presentational component).
 *
 * Coach actions (edit / delete) sit in the panel header. Delete opens a
 * ModalShell confirm that names the destructive cascade explicitly ("Deletes
 * the trip and its N expenses") — a two-tap had no consequence copy for a cascade
 * that removes the whole itinerary AND every expense. Confirm calls the parent
 * handler, which uses the unchanged deleteGolfTravelItinerary action.
 *
 * Presentation only. Fairway tokens end to end — the expense sub-feature now
 * shares this file's overlay paradigm (ModalShell) and toast system
 * (fairwayToast) instead of running its own.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { Pencil, Trash2, Download, Plus, Receipt, ArrowRight } from 'lucide-react';

import {
  Surface,
  Button,
  StatusPill,
  Checkbox,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  EmptyState,
  Skeleton,
  ModalShell,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import { FairwayExpenseList } from './FairwayExpenseList';
import { FairwayExpenseSummary } from './FairwayExpenseSummary';
import type {
  TravelExpense,
  ExpenseSummary as ExpenseSummaryType,
  TravelBudget,
} from '@/app/golf/actions/travel';
import {
  type TravelItinerary,
  getTripStatus,
  formatTravelDate,
  formatTravelTime,
  formatWeekdayDate,
  transportLabel,
  mapsHref,
  telHref,
  splitGear,
} from './travel-helpers';


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
  /** Countdown / live status in the header (desktop has no separate hero). */
  now?: Date | null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Trip sheet rows (redesign 2026-09-28, docs/redesign/travel). The details tab
 * reads like the paper trip sheet a coach hands out: a time column, then what
 * happens, with the practical detail (map, call, confirmation) beside it.
 * Rows and hairlines, no tiles: every row is optional and only rendered for
 * fields that exist, so nothing is fabricated.
 * ────────────────────────────────────────────────────────────────────────── */
function SheetStep({
  time,
  label,
  node = 'stop',
  children,
}: {
  time?: string | null;
  label: string;
  /** `end` = a solid node (leave / return), `stop` = a hollow one. */
  node?: 'end' | 'stop';
  children: React.ReactNode;
}) {
  return (
    <li className="group/step grid grid-cols-[4.25rem_1.25rem_1fr] gap-x-2">
      <span className="pt-4 text-right font-fw-sans text-body-sm font-semibold text-accent-ink tabular-nums">
        {time ?? ''}
      </span>
      {/* The journey rail: a dashed line through every stop, a node per step. */}
      <span aria-hidden className="relative flex justify-center">
        <span className="absolute inset-y-0 border-l-2 border-dotted border-border-strong group-first/step:top-5 group-last/step:bottom-auto group-last/step:h-5" />
        <span
          className={cn(
            'relative mt-[1.1rem] h-3 w-3 rounded-full ring-4 ring-surface',
            node === 'end' ? 'bg-accent-fill' : 'border-2 border-accent-fill bg-surface',
          )}
        />
      </span>
      <div className="min-w-0 pb-5 pt-3.5">
        <p className="font-fw-sans text-caption font-medium text-text-tertiary">{label}</p>
        <div className="mt-0.5 font-fw-sans text-body text-text-primary">{children}</div>
      </div>
    </li>
  );
}

/**
 * The packing list as something to tick off. Checks are personal and live on
 * this device only (localStorage per trip); the list itself is the coach's.
 */
function PackingList({ tripId, items }: { tripId: string; items: string[] }) {
  const storageKey = `helm:travel:packed:${tripId}`;
  const [packed, setPacked] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setPacked(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setPacked([]);
    }
  }, [storageKey]);
  const toggle = (item: string, on: boolean) => {
    setPacked((prev) => {
      const next = on ? [...new Set([...prev, item])] : prev.filter((p) => p !== item);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* private mode: keep it in memory */
      }
      return next;
    });
  };
  const done = items.filter((i) => packed.includes(i)).length;
  return (
    <>
      <p className="-mt-0.5 mb-1 font-fw-sans text-body-sm text-text-secondary tabular-nums">
        {done} of {items.length} packed <span className="text-text-tertiary">· saved on this device</span>
      </p>
      <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex min-h-11 items-center">
            <Checkbox
              label={<span className={cn(packed.includes(item) && 'text-text-tertiary line-through')}>{item}</span>}
              checked={packed.includes(item)}
              onCheckedChange={(v) => toggle(item, !!v)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function SheetLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="inline-flex min-h-11 items-center font-fw-sans text-body-sm text-accent-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {children}
    </a>
  );
}

function SheetBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-subtle pt-4">
      <p className="font-fw-sans text-caption font-medium text-text-tertiary">{label}</p>
      <div className="mt-1 font-fw-sans text-body text-text-primary">{children}</div>
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
  now = null,
}: FairwayTripDetailProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const status = getTripStatus(itinerary, now);
  const showStatus = status.label !== 'Upcoming' && status.label !== 'Completed';
  const gear = splitGear(itinerary.gear_list);
  const multiDay = !!itinerary.return_date && itinerary.return_date !== itinerary.departure_date;

  // The destructive cascade size — the trip plus every logged expense. Surfaced
  // in the confirm copy so the coach is told exactly what gets removed.
  const expenseCount = expenses.length;

  // Close the confirm when the selected trip changes.
  React.useEffect(() => {
    setConfirmOpen(false);
  }, [itinerary.id]);

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const hasLogistics =
    !!itinerary.hotel_name ||
    !!itinerary.hotel_address ||
    !!itinerary.flight_info ||
    !!itinerary.room_assignments ||
    !!itinerary.uniform_requirements ||
    gear.length > 0 ||
    !!itinerary.notes ||
    !!itinerary.departure_time ||
    !!itinerary.departure_location;

  return (
    <>
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
        {/* ── Header: the name owns the full width; coach actions sit under it
            on phones (beside it from sm) so a long name never wraps into a
            narrow column. ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 border-b border-border-subtle p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              {showStatus ? (
                <StatusPill tone={status.tone} size="sm" dot={false} className="mb-1.5 w-fit">
                  {status.label}
                </StatusPill>
              ) : null}
              {/* tabIndex -1: focus lands here when a trip is opened (phone stack). */}
              <h2 tabIndex={-1} className="break-words font-fw-display text-h3 text-text-primary focus:outline-none">
                {itinerary.event_name}
              </h2>
              <p className="mt-0.5 break-words font-fw-sans text-body-sm text-text-secondary">
                {transportLabel(itinerary.transportation_type)} to{' '}
                <span className="break-words">{itinerary.destination}</span>
                {multiDay ? (
                  <span className="tabular-nums">
                    {' '}&middot; {formatTravelDate(itinerary.departure_date)} &ndash;{' '}
                    {formatTravelDate(itinerary.return_date as string)}
                  </span>
                ) : null}
              </p>
            </div>

            {isCoach ? (
              <div className="-ml-2 flex flex-shrink-0 items-center gap-4 sm:ml-0">
                {/* size="sm" floors the tap target at 44px on coarse pointers
                    (button primitive), meeting WCAG 2.2. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  aria-label="Edit itinerary"
                  leftIcon={<Pencil className="h-4 w-4" />}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  aria-label="Delete itinerary"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>

          <TabsList aria-label="Trip sections">
            <TabsTrigger value="details">Trip sheet</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          </TabsList>
        </div>

        {/* ═══════════ TRIP SHEET ═══════════ */}
        <TabsContent value="details" className="px-3 pb-5 pt-3 sm:px-5 sm:pb-6">
          <ol aria-label="Itinerary">
            <SheetStep
              time={itinerary.departure_time ? formatTravelTime(itinerary.departure_time) : null}
              label={`Depart · ${formatWeekdayDate(itinerary.departure_date)}`}
              node="end"
            >
              {itinerary.departure_location ? (
                <>
                  <p>{itinerary.departure_location}</p>
                  <SheetLink href={mapsHref(itinerary.departure_location)} external>
                    Directions<span className="sr-only"> to {itinerary.departure_location} (opens Maps)</span>
                  </SheetLink>
                </>
              ) : (
                <p className="text-text-secondary">Meeting point not posted yet</p>
              )}
            </SheetStep>

            {/* What to wear and bring sits with the departure: it's what you
                need before you leave. */}
            {itinerary.uniform_requirements ? (
              <SheetStep label="Wear">
                <p>{itinerary.uniform_requirements}</p>
              </SheetStep>
            ) : null}
            {gear.length > 0 ? (
              <SheetStep label="Bring">
                <PackingList tripId={itinerary.id} items={gear} />
              </SheetStep>
            ) : null}

            {itinerary.hotel_name || itinerary.hotel_address ? (
              <SheetStep label="Stay">
                {itinerary.hotel_name ? <p>{itinerary.hotel_name}</p> : null}
                {itinerary.hotel_address ? (
                  <p className="text-body-sm text-text-secondary">{itinerary.hotel_address}</p>
                ) : null}
                {itinerary.hotel_confirmation ? (
                  <p className="text-body-sm text-text-secondary">
                    Confirmation <span className="text-text-primary tabular-nums">{itinerary.hotel_confirmation}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-x-5">
                  {itinerary.hotel_phone ? (
                    <SheetLink href={telHref(itinerary.hotel_phone)}>
                      Call <span className="ml-1 tabular-nums">{itinerary.hotel_phone}</span>
                    </SheetLink>
                  ) : null}
                  {itinerary.hotel_address || itinerary.hotel_name ? (
                    <SheetLink
                      href={mapsHref([itinerary.hotel_name, itinerary.hotel_address].filter(Boolean).join(', '))}
                      external
                    >
                      Directions<span className="sr-only"> to the hotel (opens Maps)</span>
                    </SheetLink>
                  ) : null}
                </div>
              </SheetStep>
            ) : null}

            {itinerary.return_date ? (
              <SheetStep
                time={itinerary.return_time ? formatTravelTime(itinerary.return_time) : null}
                label="Return"
                node="end"
              >
                <p className="tabular-nums">{formatWeekdayDate(itinerary.return_date)}</p>
              </SheetStep>
            ) : null}
          </ol>

          <div className="mt-2 flex flex-col gap-4">
            {itinerary.flight_info ? <SheetBlock label="Flight">{itinerary.flight_info}</SheetBlock> : null}
            {itinerary.room_assignments ? (
              <SheetBlock label="Rooms">{itinerary.room_assignments}</SheetBlock>
            ) : null}
            {itinerary.notes ? <SheetBlock label="Notes">{itinerary.notes}</SheetBlock> : null}

            {/* The linked calendar event isn't a step of the trip; it's a
                way out to the event itself. Deep-links to ?event=<id>. */}
            {itinerary.event_id ? (
              <div className="border-t border-border-subtle pt-2">
                <Link
                  href={`/golf/dashboard/calendar?event=${itinerary.event_id}`}
                  className="inline-flex min-h-11 items-center gap-1.5 font-fw-sans text-body-sm text-accent-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Event: {itinerary.event_title || 'calendar event'}
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </div>
            ) : null}

            {!hasLogistics ? (
              <p className="border-t border-border-subtle pt-4 font-fw-sans text-body-sm text-text-secondary">
                Only the date and destination are posted so far.
                {isCoach ? ' Edit the trip to add the leave time, meeting point and hotel.' : ''}
              </p>
            ) : null}
          </div>
        </TabsContent>

        {/* ═══════════ EXPENSES ═══════════ */}
        <TabsContent value="expenses" className="p-5 sm:p-6">
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
              {isCoach && expenses.length > 0 ? (
                <Button
                  variant="secondary"
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
            <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading expenses…</span>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-2/3" />
            </div>
          ) : expenses.length === 0 ? (
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
                    // Secondary: the page's one primary action is "Add itinerary".
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onAddExpense}
                      leftIcon={<Plus className="h-4 w-4" />}
                    >
                      Add expense
                    </Button>
                  ) : undefined
                }
              />
          ) : (
            <div className="flex flex-col gap-6">
              {expenseSummary && expenseSummary.count > 0 ? (
                <FairwayExpenseSummary
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
                <FairwayExpenseList
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

    {/* Destructive-cascade confirm — names what gets removed (the trip AND its
        N expenses), consistent with the Fairway remove-player confirm. A two-tap
        with only "Tap to confirm" copy under-warned for a cascade. */}
    <ModalShell
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      size="md"
      title="Delete this trip?"
      description={
        <>
          Delete <span className="font-medium text-text-primary">{itinerary.event_name}</span>?
          This can&rsquo;t be undone.
        </>
      }
    >
      <ModalShell.Body>
        <p className="rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-3 font-fw-sans text-body-sm text-text-secondary">
          {expenseCount > 0 ? (
            <>
              This removes the entire itinerary{' '}
              <span className="font-medium text-text-primary">
                and its {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
              </span>
              .
            </>
          ) : (
            <>
              This removes the itinerary and any expenses logged on it.
            </>
          )}
        </p>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirmDelete}>
          Delete trip
        </Button>
      </ModalShell.Footer>
    </ModalShell>
    </>
  );
}
