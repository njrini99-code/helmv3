'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  IconPlus,
  IconMapPin,
  IconCalendar,
  IconTrash,
  IconEdit,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';
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
    return new Date(dateStr) >= new Date(new Date().toISOString().split('T')[0]!);
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900">Travel</h1>
          <p className="text-warm-500 mt-1 text-sm">
            {itineraries.length > 0
              ? `${itineraries.length} trip${itineraries.length !== 1 ? 's' : ''} planned`
              : 'Manage team travel and expenses'}
          </p>
        </div>
        {isCoach && (
          <Button onClick={() => { setEditingItinerary(null); setShowCreateModal(true); }} className="gap-2">
            <IconPlus size={18} />
            Create Trip
          </Button>
        )}
      </div>

      {/* Empty State */}
      {itineraries.length === 0 && (
        <Card variant="glass">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconMapPin size={32} className="text-warm-300" />
            </div>
            <h3 className="text-lg font-medium text-warm-900 mb-2">No Trips Planned</h3>
            <p className="text-warm-500 mb-6 max-w-md mx-auto">
              {isCoach
                ? 'Create a trip itinerary to track travel logistics and expenses for your team.'
                : 'Your coach has not added any travel itineraries yet.'}
            </p>
            {isCoach && (
              <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                <IconPlus size={18} />
                Create First Trip
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming Trips */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-warm-900 mb-4">Upcoming Trips</h2>
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
          <h2 className="text-lg font-semibold text-warm-500 mb-4">Past Trips</h2>
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
  return (
    <div className="glass-standard rounded-2xl overflow-clip">
      {/* Header Row */}
      <div
        className="p-5 flex items-center gap-4 cursor-pointer hover:bg-cream-100/82 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
          <IconMapPin size={24} className="text-primary-600" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-warm-900 truncate">{itinerary.event_name}</h3>
          <div className="flex items-center gap-3 text-sm text-warm-500 mt-0.5">
            {itinerary.location && <span>{itinerary.location}</span>}
            <span className="flex items-center gap-1">
              <IconCalendar size={14} />
              {formatDate(itinerary.departure_date)}
              {itinerary.return_date && ` - ${formatDate(itinerary.return_date)}`}
            </span>
          </div>
        </div>

        {itinerary.transportation && (
          <span className="hidden sm:inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-warm-100 text-warm-600">
            {itinerary.transportation}
          </span>
        )}

        <div className="text-warm-400">
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
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-warm-100 pt-4 space-y-6">
              {/* Trip Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {itinerary.accommodation && (
                  <div>
                    <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Accommodation</p>
                    <p className="text-warm-900">{itinerary.accommodation}</p>
                  </div>
                )}
                {itinerary.transportation && (
                  <div>
                    <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Transportation</p>
                    <p className="text-warm-900">{itinerary.transportation}</p>
                  </div>
                )}
              </div>

              {itinerary.notes && (
                <div>
                  <p className="text-warm-500 text-xs uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-warm-700 text-sm whitespace-pre-line">{itinerary.notes}</p>
                </div>
              )}

              {/* Expenses Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-warm-900">Expenses</h4>
                  {isCoach && (
                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onAddExpense(); }} className="gap-1">
                      <IconPlus size={14} />
                      Add Expense
                    </Button>
                  )}
                </div>

                {loadingExpenses ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto" />
                    <p className="text-sm text-warm-500 mt-2">Loading expenses...</p>
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
                <div className="flex items-center gap-2 pt-4 border-t border-warm-100">
                  <Button variant="ghost"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
                  >
                    <IconEdit size={14} />
                    Edit Trip
                  </Button>
                  <Button variant="danger"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
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
    </div>
  );
}
