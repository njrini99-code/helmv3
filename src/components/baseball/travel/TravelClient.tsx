'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconPlus,
  IconMapPin,
  IconCalendar,
  IconTrash,
  IconEdit,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';
import { SectionMasthead, EmptyIssue, PaperCard, InkBadge, Eyebrow } from '@/components/baseball/living-annual';
import { CreateItineraryModal } from './CreateItineraryModal';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { ExpenseSummary } from './ExpenseSummary';
import {
  deleteItinerary,
  getItineraryExpenses,
  getExpenseSummary,
  type BaseballTravelItinerary,
  type BaseballTravelExpense,
  type BaseballExpenseSummary,
} from '@/app/baseball/actions/travel';

interface TravelClientProps {
  itineraries: BaseballTravelItinerary[];
  teamId: string;
  isCoach: boolean;
}

export function TravelClient({ itineraries: initialItineraries, teamId, isCoach }: TravelClientProps) {
  const [itineraries, setItineraries] = useState(initialItineraries);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItinerary, setEditingItinerary] = useState<BaseballTravelItinerary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Expense state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseItineraryId, setExpenseItineraryId] = useState<string | null>(null);
  const [expensesMap, setExpensesMap] = useState<Record<string, BaseballTravelExpense[]>>({});
  const [summaryMap, setSummaryMap] = useState<Record<string, BaseballExpenseSummary>>({});
  const [loadingExpenses, setLoadingExpenses] = useState<string | null>(null);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'TBD';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function isUpcoming(dateStr: string | null) {
    if (!dateStr) return true;
    // Anchor the date-only departure at local noon (same as formatDate) and
    // compare against local midnight today. Parsing "YYYY-MM-DD" as UTC and
    // comparing to a UTC "today" pushed trips departing today into "Past" for
    // US timezones once UTC had rolled over to the next day.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateStr + 'T12:00:00') >= today;
  }

  const loadExpenses = useCallback(async (itineraryId: string) => {
    setLoadingExpenses(itineraryId);
    const [expResult, sumResult] = await Promise.all([
      getItineraryExpenses(itineraryId),
      getExpenseSummary(itineraryId),
    ]);

    if (expResult.success) {
      setExpensesMap(prev => ({ ...prev, [itineraryId]: expResult.data }));
    }
    if (sumResult.success && sumResult.data) {
      setSummaryMap(prev => ({ ...prev, [itineraryId]: sumResult.data! }));
    }
    setLoadingExpenses(null);
  }, []);

  async function handleToggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!expensesMap[id]) {
        await loadExpenses(id);
      }
    }
  }

  async function handleDeleteItinerary(id: string) {
    if (!confirm('Delete this trip and all its expenses? This cannot be undone.')) return;
    const result = await deleteItinerary(id);
    if (result.success) {
      setItineraries(prev => prev.filter(i => i.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  }

  function handleSaved() {
    // Refresh page data
    window.location.reload();
  }

  function handleExpenseSaved() {
    if (expenseItineraryId) {
      loadExpenses(expenseItineraryId);
    }
  }

  const upcoming = itineraries.filter(i => isUpcoming(i.departure_date));
  const past = itineraries.filter(i => !isUpcoming(i.departure_date));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8">
      <SectionMasthead
        eyebrow="THE PRESSBOX · TRAVEL"
        title="Travel"
        ink="team"
        actions={
          isCoach ? (
            <Button onClick={() => { setEditingItinerary(null); setShowCreateModal(true); }} className="gap-2">
              <IconPlus size={18} />
              Create Trip
            </Button>
          ) : undefined
        }
      >
        <p className="max-w-prose font-annual text-body text-text-secondary">
          {itineraries.length > 0
            ? `${itineraries.length} trip${itineraries.length !== 1 ? 's' : ''} planned`
            : 'Manage team travel and expenses'}
        </p>
      </SectionMasthead>

      {/* Empty State */}
      {itineraries.length === 0 && (
        <EmptyIssue
          variant="travel"
          ink="team"
          action={
            isCoach ? (
              <Button onClick={() => { setEditingItinerary(null); setShowCreateModal(true); }} className="gap-2">
                <IconPlus size={18} />
                Create First Trip
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Upcoming Trips */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="mb-4 font-annual text-h3 font-semibold text-text-primary">Upcoming Trips</h2>
          <div className="space-y-4">
            {upcoming.map(itin => (
              <ItineraryCard
                key={itin.id}
                itinerary={itin}
                isExpanded={expandedId === itin.id}
                isCoach={isCoach}
                expenses={expensesMap[itin.id] || []}
                summary={summaryMap[itin.id]}
                loadingExpenses={loadingExpenses === itin.id}
                onToggleExpand={() => handleToggleExpand(itin.id)}
                onEdit={() => { setEditingItinerary(itin); setShowCreateModal(true); }}
                onDelete={() => handleDeleteItinerary(itin.id)}
                onAddExpense={() => { setExpenseItineraryId(itin.id); setShowExpenseForm(true); }}
                onRefreshExpenses={() => loadExpenses(itin.id)}
                formatDate={formatDate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past Trips */}
      {past.length > 0 && (
        <div>
          <h2 className="mb-4 font-annual text-h3 font-semibold text-text-tertiary">Past Trips</h2>
          <div className="space-y-4 opacity-80">
            {past.map(itin => (
              <ItineraryCard
                key={itin.id}
                itinerary={itin}
                isExpanded={expandedId === itin.id}
                isCoach={isCoach}
                expenses={expensesMap[itin.id] || []}
                summary={summaryMap[itin.id]}
                loadingExpenses={loadingExpenses === itin.id}
                onToggleExpand={() => handleToggleExpand(itin.id)}
                onEdit={() => { setEditingItinerary(itin); setShowCreateModal(true); }}
                onDelete={() => handleDeleteItinerary(itin.id)}
                onAddExpense={() => { setExpenseItineraryId(itin.id); setShowExpenseForm(true); }}
                onRefreshExpenses={() => loadExpenses(itin.id)}
                formatDate={formatDate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateItineraryModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingItinerary(null); }}
        onSaved={handleSaved}
        teamId={teamId}
        itinerary={editingItinerary}
      />

      {expenseItineraryId && (
        <ExpenseForm
          isOpen={showExpenseForm}
          onClose={() => { setShowExpenseForm(false); setExpenseItineraryId(null); }}
          onSaved={handleExpenseSaved}
          teamId={teamId}
          itineraryId={expenseItineraryId}
        />
      )}
    </div>
  );
}

// ============================================================================
// Itinerary Card sub-component
// ============================================================================

interface ItineraryCardProps {
  itinerary: BaseballTravelItinerary;
  isExpanded: boolean;
  isCoach: boolean;
  expenses: BaseballTravelExpense[];
  summary?: BaseballExpenseSummary;
  loadingExpenses: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddExpense: () => void;
  onRefreshExpenses: () => void;
  formatDate: (d: string | null) => string;
}

function ItineraryCard({
  itinerary,
  isExpanded,
  isCoach,
  expenses,
  summary,
  loadingExpenses,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddExpense,
  onRefreshExpenses,
  formatDate,
}: ItineraryCardProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <PaperCard className="overflow-hidden p-0">
      {/* Header Row */}
      <div
        role="button"
        tabIndex={0}
        className="flex cursor-pointer items-center gap-4 p-5 transition-colors hover:bg-[color:var(--paper-canvas)]"
        onClick={onToggleExpand}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand(); } }}
      >
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
          <IconMapPin size={24} className="text-primary-600" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-annual text-h3 font-semibold text-text-primary">{itinerary.event_name}</h3>
          <div className="mt-0.5 flex items-center gap-3 font-annual text-body-sm text-text-secondary">
            {itinerary.location && <span>{itinerary.location}</span>}
            <span className="flex items-center gap-1">
              <IconCalendar size={14} />
              {formatDate(itinerary.departure_date)}
              {itinerary.return_date && ` - ${formatDate(itinerary.return_date)}`}
            </span>
          </div>
        </div>

        {itinerary.transportation && (
          <span className="hidden sm:inline-flex">
            <InkBadge tone="neutral" label={itinerary.transportation.toUpperCase()} />
          </span>
        )}

        <div className="text-text-tertiary">
          {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
            className="overflow-hidden"
          >
            <div className="space-y-6 border-t border-[color:var(--hairline)] px-5 pb-5 pt-4">
              {/* Trip Details */}
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                {itinerary.accommodation && (
                  <div>
                    <Eyebrow ink="muted" className="mb-1">Accommodation</Eyebrow>
                    <p className="text-text-primary">{itinerary.accommodation}</p>
                  </div>
                )}
                {itinerary.transportation && (
                  <div>
                    <Eyebrow ink="muted" className="mb-1">Transportation</Eyebrow>
                    <p className="text-text-primary">{itinerary.transportation}</p>
                  </div>
                )}
              </div>

              {itinerary.notes && (
                <div>
                  <Eyebrow ink="muted" className="mb-1">Notes</Eyebrow>
                  <p className="whitespace-pre-line text-sm text-text-secondary">{itinerary.notes}</p>
                </div>
              )}

              {/* Expenses Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-annual text-h3 font-semibold text-text-primary">Expenses</h4>
                  {isCoach && (
                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onAddExpense(); }} className="gap-1">
                      <IconPlus size={14} />
                      Add Expense
                    </Button>
                  )}
                </div>

                {loadingExpenses ? (
                  <div className="space-y-3" aria-busy="true" aria-label="Loading expenses">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-4"
                      >
                        <Skeleton variant="circular" width={40} height={40} />
                        <div className="flex-1 space-y-2">
                          <Skeleton variant="text" width="45%" />
                          <Skeleton variant="text" width="30%" height={10} />
                        </div>
                        <Skeleton variant="text" width={56} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <ExpenseList
                      expenses={expenses}
                      onRefresh={onRefreshExpenses}
                      isCoach={isCoach}
                    />
                    {summary && summary.count > 0 && (
                      <div className="mt-6">
                        <ExpenseSummary summary={summary} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              {isCoach && (
                <div className="flex items-center gap-2 border-t border-[color:var(--hairline)] pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="gap-2 text-text-secondary hover:bg-[color:var(--paper-canvas)] hover:text-text-primary"
                  >
                    <IconEdit size={14} />
                    Edit Trip
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100"
                  >
                    <IconTrash size={14} />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PaperCard>
  );
}
