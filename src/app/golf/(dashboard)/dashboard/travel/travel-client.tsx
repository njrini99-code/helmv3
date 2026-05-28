'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { m, AnimatePresence } from 'framer-motion';

import {
  IconAirplane,
  IconMapPin,
  IconCalendar,
  IconClock,
  IconPlus,
  IconX,
  IconTrash,
  IconEdit,
  IconDownload,
  IconChartBar,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { markTravelSeen } from '@/app/golf/actions/player-notifications';
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
import { ExpenseForm, ExpenseList, ExpenseSummary } from '@/components/golf/travel';
import { useToast } from '@/components/ui/sonner';
import { Button, IconButton } from '@/components/ui/button';

interface TravelItinerary {
  id: string;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'flight' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  flight_info: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_assignments: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  notes: string | null;
  created_at: string | null;
}

type TransportationType = TravelItinerary['transportation_type'];

interface TravelClientProps {
  itineraries: TravelItinerary[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

type TabType = 'details' | 'expenses';

export function TravelClient({ itineraries: initialItineraries, coachId, teamId, isCoach }: TravelClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const badges = useNotificationBadges();
  const [itineraries, setItineraries] = useState(initialItineraries);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected itinerary for expense tracking
  const [selectedItinerary, setSelectedItinerary] = useState<TravelItinerary | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('details');

  // Mark travel as seen for players on mount
  useEffect(() => {
    if (!isCoach) {
      markTravelSeen().then(() => badges.refetch());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach]);

  // Expense state
  const [expenses, setExpenses] = useState<TravelExpense[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummaryType | null>(null);
  const [budgets, setBudgets] = useState<TravelBudget[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<TravelExpense | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    event_name: '',
    destination: '',
    transportation_type: 'bus' as TransportationType,
    departure_date: '',
    departure_time: '',
    departure_location: '',
    return_date: '',
    return_time: '',
    flight_info: '',
    hotel_name: '',
    hotel_address: '',
    hotel_phone: '',
    hotel_confirmation: '',
    check_in_date: '',
    check_out_date: '',
    room_assignments: '',
    uniform_requirements: '',
    gear_list: '',
    notes: '',
  });

  const getTransportIcon = (type: TransportationType, size = 24) => {
    switch (type) {
      case 'flight':
        return <IconAirplane size={size} className="text-blue-600" />;
      case 'bus':
        return <span style={{ fontSize: size }}>🚌</span>;
      case 'van':
        return <span style={{ fontSize: size }}>🚐</span>;
      case 'carpool':
        return <span style={{ fontSize: size }}>🚗</span>;
      default:
        return <span style={{ fontSize: size }}>🚗</span>;
    }
  };

  const getTripStatus = (itinerary: TravelItinerary) => {
    const now = new Date();
    const departure = new Date(itinerary.departure_date);
    const returnDate = itinerary.return_date ? new Date(itinerary.return_date) : null;
    const diffMs = departure.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (returnDate && now > returnDate) {
      return { label: 'Completed', color: 'bg-warm-100 text-warm-600', dotColor: 'bg-warm-400' };
    }
    if (now >= departure && returnDate && now <= returnDate) {
      return { label: 'In Transit', color: 'bg-primary-100 text-primary-700', dotColor: 'bg-primary-500', pulse: true };
    }
    if (now >= departure && !returnDate) {
      return { label: 'Departed', color: 'bg-warm-100 text-warm-600', dotColor: 'bg-warm-400' };
    }
    if (diffDays <= 3 && diffDays > 0) {
      return { label: `${diffDays}d away`, color: 'bg-amber-100 text-amber-700', dotColor: 'bg-amber-500' };
    }
    if (diffDays <= 7 && diffDays > 0) {
      return { label: `${diffDays}d away`, color: 'bg-blue-100 text-blue-700', dotColor: 'bg-blue-500' };
    }
    return { label: 'Upcoming', color: 'bg-warm-100 text-warm-600', dotColor: 'bg-warm-400' };
  };

  const formatDate = (dateStr: string) => {
    // Parse date parts directly to avoid timezone shift (new Date("2026-03-15") = midnight UTC = Mar 14 in US timezones)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = dateStr.split('T')[0]?.split('-');
    if (parts && parts.length === 3) {
      const month = months[parseInt(parts[1]!, 10) - 1] ?? parts[1];
      return `${month} ${parseInt(parts[2]!, 10)}, ${parts[0]}`;
    }
    return dateStr;
  };

  const resetForm = () => {
    setFormData({
      event_name: '',
      destination: '',
      transportation_type: 'bus',
      departure_date: '',
      departure_time: '',
      departure_location: '',
      return_date: '',
      return_time: '',
      flight_info: '',
      hotel_name: '',
      hotel_address: '',
      hotel_phone: '',
      hotel_confirmation: '',
      check_in_date: '',
      check_out_date: '',
      room_assignments: '',
      uniform_requirements: '',
      gear_list: '',
      notes: '',
    });
    setEditingId(null);
    setError(null);
  };

  const handleEdit = (itinerary: TravelItinerary) => {
    setFormData({
      event_name: itinerary.event_name,
      destination: itinerary.destination,
      transportation_type: itinerary.transportation_type,
      departure_date: itinerary.departure_date,
      departure_time: itinerary.departure_time || '',
      departure_location: itinerary.departure_location || '',
      return_date: itinerary.return_date || '',
      return_time: itinerary.return_time || '',
      flight_info: itinerary.flight_info || '',
      hotel_name: itinerary.hotel_name || '',
      hotel_address: itinerary.hotel_address || '',
      hotel_phone: itinerary.hotel_phone || '',
      hotel_confirmation: itinerary.hotel_confirmation || '',
      check_in_date: itinerary.check_in_date || '',
      check_out_date: itinerary.check_out_date || '',
      room_assignments: itinerary.room_assignments || '',
      uniform_requirements: itinerary.uniform_requirements || '',
      gear_list: itinerary.gear_list || '',
      notes: itinerary.notes || '',
    });
    setEditingId(itinerary.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.event_name.trim() || !formData.destination.trim() || !formData.departure_date) {
      setError('Event name, destination, and departure date are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        // Update existing
        const result = await updateGolfTravelItinerary({
          id: editingId,
          ...formData,
        });

        if (!result.success) {
          setError(result.error || 'Failed to update itinerary');
          setSaving(false);
          return;
        }
      } else {
        // Create new
        const result = await createGolfTravelItinerary({
          team_id: teamId,
          created_by: coachId,
          ...formData,
        });

        if (!result.success) {
          setError(result.error || 'Failed to create itinerary');
          setSaving(false);
          return;
        }
      }

      resetForm();
      setShowModal(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async (id: string) => {
    setDeleteConfirmId(null);
    try {
      const result = await deleteGolfTravelItinerary(id);

      if (result.success) {
        setItineraries((prev) => prev.filter((i) => i.id !== id));
        if (selectedItinerary?.id === id) {
          setSelectedItinerary(null);
        }
        router.refresh();
      } else {
        showToast(result.error || 'Failed to delete itinerary', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      showToast('An error occurred. Please try again.', 'error');
    }
  };

  // Load expenses for selected itinerary
  const loadExpenses = useCallback(async () => {
    if (!selectedItinerary) return;

    setLoadingExpenses(true);
    try {
      const [expensesResult, summaryResult, budgetsResult] = await Promise.all([
        getExpensesForItinerary(selectedItinerary.id),
        getExpenseSummary(selectedItinerary.id),
        getBudgetsForItinerary(selectedItinerary.id),
      ]);

      if (expensesResult.success) {
        setExpenses(expensesResult.data || []);
      }
      if (summaryResult.success) {
        setExpenseSummary(summaryResult.data || null);
      }
      if (budgetsResult.success) {
        setBudgets(budgetsResult.data || []);
      }
    } catch {
      showToast('Failed to load expense data. Please try again.', 'error');
    } finally {
      setLoadingExpenses(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `showToast` is captured only inside a parameterless `catch {}` block; the rule misreads scope and toggles between "missing" and "unnecessary" depending on adjacent edits. Behavior is correct without it.
  }, [selectedItinerary]);

  useEffect(() => {
    if (selectedItinerary && activeTab === 'expenses') {
      loadExpenses();
    }
  }, [selectedItinerary, activeTab, loadExpenses]);

  // Handle CSV export
  const handleExportCSV = async () => {
    if (!selectedItinerary) return;

    setExporting(true);
    const result = await exportExpensesToCSV(selectedItinerary.id);

    if (result.success && result.csv) {
      // Create and download file
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `expenses_${selectedItinerary.event_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      showToast(result.error || 'Failed to export expenses', 'error');
    }
    setExporting(false);
  };

  // Select itinerary to view
  const handleSelectItinerary = (itinerary: TravelItinerary) => {
    setSelectedItinerary(itinerary);
    setActiveTab('details');
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <LargeTitleHeader
        title="Travel"
        subtitle={
          itineraries.length === 0
            ? 'Tournament travel itineraries & expenses'
            : (() => {
                const now = new Date();
                const upcoming = itineraries.filter(i => new Date(i.departure_date) > now).length;
                const past = itineraries.length - upcoming;
                return `${upcoming} upcoming trip${upcoming !== 1 ? 's' : ''}${past > 0 ? ` \u00b7 ${past} completed` : ''}`;
              })()
        }
      >
        {isCoach && (
          <Button variant="primary"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <IconPlus size={18} />
            <span className="hidden sm:inline">Add Itinerary</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </LargeTitleHeader>

      {/* Main Content */}
      <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Editorial hero band — anchors the trip list beneath the sticky
            title header in the magazine-cover rhythm used across the app. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Travel"
              eyebrowAccent="primary"
              title="Trips on the calendar."
              subtitle={
                itineraries.length === 0
                  ? isCoach
                    ? 'Build itineraries for upcoming tournaments and team trips.'
                    : 'Travel details will appear here as your coach posts them.'
                  : (() => {
                      const now = new Date();
                      const upcoming = itineraries.filter(i => new Date(i.departure_date) > now).length;
                      const past = itineraries.length - upcoming;
                      return `${upcoming} upcoming · ${past} past.`;
                    })()
              }
            />
          </div>
        </Reveal>

        {itineraries.length === 0 ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-8 md:p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconAirplane size={28} className="text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">No Travel Itineraries</h3>
            <p className="text-warm-500 mb-6 max-w-sm mx-auto">
              {isCoach
                ? 'Create travel itineraries for upcoming tournaments and events'
                : 'Travel details will appear here when available'}
            </p>
            {isCoach && (
              <Button variant="primary"
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Create First Itinerary
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Itinerary List */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-sm font-medium text-warm-500 uppercase tracking-wider mb-2">
                Trips
              </h2>
              {itineraries.map((itinerary) => (
                <m.div
                  key={itinerary.id}
                  onClick={() => handleSelectItinerary(itinerary)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className={`relative rounded-xl p-4 cursor-pointer transition-all ${
                    selectedItinerary?.id === itinerary.id
                      ? 'bg-primary-50 border-2 border-primary-500 shadow-md'
                      : 'bg-white border border-warm-200 hover:border-warm-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 flex items-center justify-center">{getTransportIcon(itinerary.transportation_type, 20)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium text-warm-900 truncate">{itinerary.event_name}</h3>
                        {(() => {
                          const status = getTripStatus(itinerary);
                          return (
                            <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`} suppressHydrationWarning>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor} ${status.pulse ? 'animate-pulse' : ''}`} />
                              {status.label}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-warm-500 mt-0.5">
                        <IconMapPin size={14} />
                        <span className="truncate">{itinerary.destination}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-warm-400 mt-1">
                        <IconCalendar size={12} />
                        <span>{formatDate(itinerary.departure_date)}</span>
                        {itinerary.return_date && itinerary.return_date !== itinerary.departure_date && (
                          <span> - {formatDate(itinerary.return_date)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </m.div>
              ))}
            </div>

            {/* Selected Itinerary Details / Expenses */}
            <div className="lg:col-span-2">
              {selectedItinerary ? (
                <div className="surface-matte rounded-3xl overflow-clip">
                  {/* Itinerary Header */}
                  <div className="p-6 border-b border-warm-200">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 flex items-center justify-center">{getTransportIcon(selectedItinerary.transportation_type, 28)}</div>
                        <div>
                          <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em]">{selectedItinerary.event_name}</h2>
                          <div className="flex items-center gap-2 text-warm-500 mt-1">
                            <IconMapPin size={16} />
                            <span>{selectedItinerary.destination}</span>
                          </div>
                        </div>
                      </div>
                      {isCoach && (
                        <div className="flex items-center gap-2">
                          <IconButton variant="default" aria-label="Edit"
                            onClick={() => handleEdit(selectedItinerary)}
                            className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
                          >
                            <IconEdit size={18} className="text-warm-600" />
                          </IconButton>
                          <IconButton variant="default" aria-label="Delete"
                            onClick={() => setDeleteConfirmId(selectedItinerary.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <IconTrash size={18} className="text-red-600" />
                          </IconButton>
                        </div>
                      )}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-4 border-b border-warm-200 -mb-6 -mx-6 px-6">
                      <Button variant="ghost"
                        onClick={() => setActiveTab('details')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === 'details'
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-warm-500 hover:text-warm-700'
                        }`}
                      >
                        Details
                      </Button>
                      <Button variant="ghost"
                        onClick={() => setActiveTab('expenses')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                          activeTab === 'expenses'
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-warm-500 hover:text-warm-700'
                        }`}
                      >
                        <IconChartBar size={16} />
                        Expenses
                      </Button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="p-6">
                    <AnimatePresence mode="popLayout">
                      {activeTab === 'details' ? (
                        <m.div
                          key="details"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          {/* Departure/Return */}
                          <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="p-4 bg-warm-50 rounded-xl">
                              <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-2">Departure</p>
                              <div className="flex items-center gap-2 text-warm-900">
                                <IconCalendar size={16} className="text-warm-400" />
                                <span className="font-medium">{formatDate(selectedItinerary.departure_date)}</span>
                                {selectedItinerary.departure_time && (
                                  <>
                                    <IconClock size={16} className="text-warm-400 ml-2" />
                                    <span>{selectedItinerary.departure_time}</span>
                                  </>
                                )}
                              </div>
                              {selectedItinerary.departure_location && (
                                <p className="text-sm text-warm-500 mt-2">{selectedItinerary.departure_location}</p>
                              )}
                            </div>
                            {selectedItinerary.return_date && (
                              <div className="p-4 bg-warm-50 rounded-xl">
                                <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-2">Return</p>
                                <div className="flex items-center gap-2 text-warm-900">
                                  <IconCalendar size={16} className="text-warm-400" />
                                  <span className="font-medium">{formatDate(selectedItinerary.return_date)}</span>
                                  {selectedItinerary.return_time && (
                                    <>
                                      <IconClock size={16} className="text-warm-400 ml-2" />
                                      <span>{selectedItinerary.return_time}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Hotel Info */}
                          {selectedItinerary.hotel_name && (
                            <div className="p-4 bg-blue-50 rounded-xl mb-6">
                              <p className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-2">Lodging</p>
                              <p className="font-medium text-warm-900">{selectedItinerary.hotel_name}</p>
                              {selectedItinerary.hotel_address && (
                                <p className="text-sm text-warm-600 mt-1">{selectedItinerary.hotel_address}</p>
                              )}
                              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                                {selectedItinerary.hotel_phone && (
                                  <div>
                                    <span className="text-warm-500">Phone: </span>
                                    <span className="text-warm-900">{selectedItinerary.hotel_phone}</span>
                                  </div>
                                )}
                                {selectedItinerary.hotel_confirmation && (
                                  <div>
                                    <span className="text-warm-500">Confirmation: </span>
                                    <span className="text-warm-900">{selectedItinerary.hotel_confirmation}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Additional Details */}
                          <div className="space-y-4">
                            {selectedItinerary.uniform_requirements && (
                              <div>
                                <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-1">Uniform</p>
                                <p className="text-warm-700">{selectedItinerary.uniform_requirements}</p>
                              </div>
                            )}
                            {selectedItinerary.gear_list && (
                              <div>
                                <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-1">Gear List</p>
                                <p className="text-warm-700">{selectedItinerary.gear_list}</p>
                              </div>
                            )}
                            {selectedItinerary.notes && (
                              <div>
                                <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-1">Notes</p>
                                <p className="text-warm-700">{selectedItinerary.notes}</p>
                              </div>
                            )}
                          </div>
                        </m.div>
                      ) : (
                        <m.div
                          key="expenses"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          {/* Expense Actions */}
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="font-medium text-warm-900">Trip Expenses</h3>
                            <div className="flex items-center gap-2">
                              {expenses.length > 0 && (
                                <Button variant="ghost"
                                  onClick={handleExportCSV}
                                  disabled={exporting}
                                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  <IconDownload size={16} />
                                  {exporting ? 'Exporting...' : 'Export CSV'}
                                </Button>
                              )}
                              {isCoach && (
                                <Button variant="primary"
                                  onClick={() => {
                                    setEditingExpense(null);
                                    setShowExpenseForm(true);
                                  }}
                                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                                >
                                  <IconPlus size={16} />
                                  Add Expense
                                </Button>
                              )}
                            </div>
                          </div>

                          {loadingExpenses ? (
                            <div className="space-y-4 py-8 px-4">
                              <div className="h-4 w-3/4 bg-warm-200 rounded skeleton-shimmer" />
                              <div className="h-4 w-1/2 bg-warm-200 rounded skeleton-shimmer" />
                              <div className="h-4 w-2/3 bg-warm-200 rounded skeleton-shimmer" />
                            </div>
                          ) : (
                            <div className="space-y-6">
                              {/* Summary */}
                              {expenseSummary && expenseSummary.count > 0 && (
                                <ExpenseSummary
                                  summary={expenseSummary}
                                  budgets={budgets}
                                  itineraryId={selectedItinerary.id}
                                  isCoach={isCoach}
                                  onBudgetUpdated={loadExpenses}
                                />
                              )}

                              {/* Expense List */}
                              <div>
                                <h4 className="font-medium text-warm-900 mb-3">All Expenses</h4>
                                <ExpenseList
                                  expenses={expenses}
                                  onEdit={(expense) => {
                                    setEditingExpense(expense);
                                    setShowExpenseForm(true);
                                  }}
                                  onRefresh={loadExpenses}
                                  isCoach={isCoach}
                                />
                              </div>
                            </div>
                          )}
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <div className="surface-matte rounded-3xl p-8 md:p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
                    <IconAirplane size={28} className="text-warm-400" />
                  </div>
                  <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">Select a Trip</h3>
                  <p className="text-warm-500 max-w-sm mx-auto">
                    Choose a travel itinerary from the list to view details and track expenses.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-warm-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50/92 backdrop-blur-xl rounded-2xl max-w-sm w-full shadow-2xl border border-warm-200/45 overflow-clip">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <IconTrash size={22} className="text-red-600" />
              </div>
              <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">Delete Itinerary?</h3>
              <p className="text-sm text-warm-500">This action cannot be undone. All trip details and expenses will be removed.</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="ghost"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 border border-warm-200 rounded-xl font-medium text-warm-700 hover:bg-warm-50 transition-colors text-sm"
              >
                Cancel
              </Button>
              <Button variant="danger"
                onClick={() => handleDeleteConfirmed(deleteConfirmId)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors text-sm"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Itinerary Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em]">
                {editingId ? 'Edit Travel Itinerary' : 'Create Travel Itinerary'}
              </h2>
              <IconButton variant="default" aria-label="Close"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
              >
                <IconX size={20} />
              </IconButton>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
              {/* Event Name */}
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Event Name *</label>
                <input
                  type="text"
                  value={formData.event_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, event_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  placeholder="e.g., Spring Invitational"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Destination *</label>
                <input
                  type="text"
                  value={formData.destination}
                  onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value }))}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  placeholder="e.g., Pebble Beach, CA"
                />
              </div>

              {/* Transportation */}
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Transportation</label>
                <select
                  value={formData.transportation_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      transportation_type: e.target.value as TransportationType,
                    }))
                  }
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="bus">Bus</option>
                  <option value="van">Van</option>
                  <option value="flight">Flight</option>
                  <option value="carpool">Carpool</option>
                </select>
              </div>

              {/* Departure Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">Departure Date *</label>
                  <input
                    type="date"
                    value={formData.departure_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, departure_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">Departure Time</label>
                  <input
                    type="time"
                    value={formData.departure_time}
                    onChange={(e) => setFormData((prev) => ({ ...prev, departure_time: e.target.value }))}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Departure Location</label>
                <input
                  type="text"
                  value={formData.departure_location}
                  onChange={(e) => setFormData((prev) => ({ ...prev, departure_location: e.target.value }))}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  placeholder="e.g., School parking lot"
                />
              </div>

              {/* Return Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">Return Date</label>
                  <input
                    type="date"
                    value={formData.return_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, return_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">Return Time</label>
                  <input
                    type="time"
                    value={formData.return_time}
                    onChange={(e) => setFormData((prev) => ({ ...prev, return_time: e.target.value }))}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Hotel Info */}
              <div className="border-t border-warm-200 pt-4 mt-4">
                <h3 className="font-medium text-warm-900 mb-3">Hotel Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Hotel Name</label>
                    <input
                      type="text"
                      value={formData.hotel_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, hotel_name: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Hotel Address</label>
                    <input
                      type="text"
                      value={formData.hotel_address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, hotel_address: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-warm-700 mb-2">Hotel Phone</label>
                      <input
                        type="tel"
                        value={formData.hotel_phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, hotel_phone: e.target.value }))}
                        className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-700 mb-2">Confirmation #</label>
                      <input
                        type="text"
                        value={formData.hotel_confirmation}
                        onChange={(e) => setFormData((prev) => ({ ...prev, hotel_confirmation: e.target.value }))}
                        className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div className="border-t border-warm-200 pt-4 mt-4">
                <h3 className="font-medium text-warm-900 mb-3">Additional Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Uniform Requirements</label>
                    <input
                      type="text"
                      value={formData.uniform_requirements}
                      onChange={(e) => setFormData((prev) => ({ ...prev, uniform_requirements: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                      placeholder="e.g., Team polo, khaki pants"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Gear List</label>
                    <input
                      type="text"
                      value={formData.gear_list}
                      onChange={(e) => setFormData((prev) => ({ ...prev, gear_list: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                      placeholder="e.g., Clubs, rain gear, extra balls"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-2">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                      rows={3}
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t border-warm-200">
              <Button variant="ghost"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-warm-200 rounded-lg font-medium text-warm-700 hover:bg-warm-50 active:bg-warm-100 transition-colors"
              >
                Cancel
              </Button>
              <Button variant="primary"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Itinerary'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Form Modal */}
      {selectedItinerary && (
        <ExpenseForm
          isOpen={showExpenseForm}
          onClose={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
          onSaved={loadExpenses}
          teamId={teamId}
          itineraryId={selectedItinerary.id}
          expense={editingExpense}
        />
      )}
    </div>
  );
}
