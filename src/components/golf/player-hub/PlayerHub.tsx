'use client';

import { useState, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { useFormatDate } from '@/hooks/golf/use-appearance-preferences';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import {
  IconAirplane,
  IconMapPin,
  IconCalendar,
  IconClock,
  IconCheck,
  IconChevronRight,
  IconUsers,
  IconClipboardList,
  IconUpload,
  IconCheckCheck,
} from '@/components/icons';
import { PlayerHubAnnouncementsSection } from './PlayerHubAnnouncementsSection';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

// ============================================================================
// Types
// ============================================================================

interface TripData {
  id: string;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'fly' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  room_assignments: string | null;
  notes: string | null;
  flight_info: string | null;
}

interface PlayerTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string | null;
  requires_upload: boolean;
  status: 'pending' | 'overdue' | 'completed';
  completed_at: string | null;
}

interface EventInvite {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  rsvp_status: 'pending' | 'accepted' | 'declined' | 'tentative' | null;
  going_count: number;
  maybe_count: number;
}

interface PlayerHubProps {
  trips: TripData[];
  tasks: PlayerTask[];
  events: EventInvite[];
  announcements: GolfAnnouncementMeta[];
  playerName: string;
  onCompleteTask: (taskId: string) => Promise<void>;
  onRSVP: (eventId: string, status: 'accepted' | 'declined' | 'tentative') => Promise<void>;
}

// ============================================================================
// Helpers
// ============================================================================

function getTransportIcon(type: string) {
  const map: Record<string, string> = { fly: '\u2708\uFE0F', bus: '\uD83D\uDE8C', van: '\uD83D\uDE90', carpool: '\uD83D\uDE97' };
  return map[type] || '\uD83D\uDE97';
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Date formatting handled by useFormatDate() hook in each sub-component

function formatTime(timeStr: string) {
  const parts = timeStr.split(':');
  const h = parts[0] || '0';
  const m = parts[1] || '00';
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatEventTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getEventTypeStyle(type: string) {
  const styles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    practice: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Practice' },
    tournament: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Tournament' },
    qualifier: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', label: 'Qualifier' },
    meeting: { bg: 'bg-warm-50', text: 'text-warm-700', dot: 'bg-warm-500', label: 'Meeting' },
    workout: { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500', label: 'Workout' },
    scrimmage: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', label: 'Scrimmage' },
  };
  return styles[type] || { bg: 'bg-warm-50', text: 'text-warm-700', dot: 'bg-warm-500', label: type };
}

function getTripStatus(trip: TripData) {
  const now = new Date();
  const departure = new Date(trip.departure_date);
  const returnDate = trip.return_date ? new Date(trip.return_date) : null;
  const diffMs = departure.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (returnDate && now > returnDate) return { label: 'Completed', color: 'bg-warm-100 text-warm-500' };
  if (now >= departure && returnDate && now <= returnDate) return { label: 'In Transit', color: 'bg-primary-100 text-primary-700', pulse: true };
  if (diffDays <= 3 && diffDays > 0) return { label: `${diffDays}d away`, color: 'bg-amber-100 text-amber-700' };
  if (diffDays <= 7 && diffDays > 0) return { label: `${diffDays}d away`, color: 'bg-blue-100 text-blue-700' };
  return { label: 'Upcoming', color: 'bg-warm-100 text-warm-600' };
}

// ============================================================================
// Tab Navigation
// ============================================================================

type TabId = 'overview' | 'trips' | 'tasks' | 'events';

interface TabDef {
  id: TabId;
  label: string;
  count: number;
  urgentCount?: number;
}

// ============================================================================
// Sub-components
// ============================================================================

function TripCard({ trip, onExpand }: { trip: TripData; onExpand: () => void }) {
  const fmtDate = useFormatDate();
  const status = getTripStatus(trip);

  return (
    <m.div
      variants={fadeUp}
      onClick={onExpand}
      className="group relative glass-standard rounded-2xl overflow-clip cursor-pointer transition-[transform,box-shadow] duration-300 hover:shadow-lg hover:-translate-y-0.5"
    >
      <ShineEffect />
      {/* Colored top accent based on trip proximity */}
      <div className={cn(
        'h-1',
        status.label === 'In Transit' ? 'bg-primary-500' :
        status.label.includes('away') ? 'bg-amber-400' :
        'bg-warm-200'
      )} />

      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Transport icon */}
          <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">
            {getTransportIcon(trip.transportation_type)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-warm-900 truncate">{trip.event_name}</h3>
              <span className={cn('flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', status.color)}>
                {status.label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-sm text-warm-500 mb-2">
              <IconMapPin size={14} className="flex-shrink-0" />
              <span className="truncate">{trip.destination}</span>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-4 text-xs text-warm-400">
              <span className="flex items-center gap-1">
                <IconCalendar size={12} />
                {fmtDate(trip.departure_date)}
                {trip.return_date && trip.return_date !== trip.departure_date && (
                  <> – {fmtDate(trip.return_date)}</>
                )}
              </span>
              {trip.departure_time && (
                <span className="flex items-center gap-1">
                  <IconClock size={12} />
                  {formatTime(trip.departure_time)}
                </span>
              )}
            </div>
          </div>

          <IconChevronRight size={18} className="text-warm-300 group-hover:text-warm-500 group-hover:translate-x-0.5 transition-[color,transform] flex-shrink-0 mt-1" />
        </div>
      </div>
    </m.div>
  );
}

function TripDetailSheet({ trip, onClose }: { trip: TripData; onClose: () => void }) {
  const fmtDate = useFormatDate();
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-warm-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <m.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto overscroll-contain"
      >
        {/* Handle bar (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-warm-300" />
        </div>

        {/* Header */}
        <div className="p-6 pb-4 border-b border-warm-100">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-warm-100 flex items-center justify-center text-3xl">
              {getTransportIcon(trip.transportation_type)}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-warm-900">{trip.event_name}</h2>
              <div className="flex items-center gap-1.5 text-warm-500 mt-1">
                <IconMapPin size={15} />
                <span>{trip.destination}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-warm-50 rounded-xl">
              <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Depart</p>
              <p className="font-semibold text-warm-900">{fmtDate(trip.departure_date)}</p>
              {trip.departure_time && (
                <p className="text-sm text-warm-500 mt-0.5">{formatTime(trip.departure_time)}</p>
              )}
              {trip.departure_location && (
                <p className="text-xs text-warm-400 mt-1">{trip.departure_location}</p>
              )}
            </div>
            {trip.return_date && (
              <div className="p-4 bg-warm-50 rounded-xl">
                <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Return</p>
                <p className="font-semibold text-warm-900">{fmtDate(trip.return_date)}</p>
                {trip.return_time && (
                  <p className="text-sm text-warm-500 mt-0.5">{formatTime(trip.return_time)}</p>
                )}
              </div>
            )}
          </div>

          {/* Hotel */}
          {trip.hotel_name && (
            <div className="p-4 bg-blue-50/70 rounded-xl">
              <p className="text-micro font-bold text-blue-500 uppercase tracking-widest mb-1.5">Lodging</p>
              <p className="font-semibold text-warm-900">{trip.hotel_name}</p>
              {trip.hotel_address && <p className="text-sm text-warm-600 mt-1">{trip.hotel_address}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-warm-500">
                {trip.hotel_phone && <span>Phone: {trip.hotel_phone}</span>}
                {trip.hotel_confirmation && <span>Conf: {trip.hotel_confirmation}</span>}
              </div>
            </div>
          )}

          {/* Room Assignments */}
          {trip.room_assignments && (
            <div>
              <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Room Assignment</p>
              <p className="text-sm text-warm-700">{trip.room_assignments}</p>
            </div>
          )}

          {/* Uniform & Gear */}
          {trip.uniform_requirements && (
            <div>
              <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Uniform</p>
              <p className="text-sm text-warm-700">{trip.uniform_requirements}</p>
            </div>
          )}
          {trip.gear_list && (
            <div>
              <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Gear List</p>
              <p className="text-sm text-warm-700">{trip.gear_list}</p>
            </div>
          )}

          {/* Flight */}
          {trip.flight_info && (
            <div>
              <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Flight Info</p>
              <p className="text-sm text-warm-700">{trip.flight_info}</p>
            </div>
          )}

          {/* Notes */}
          {trip.notes && (
            <div>
              <p className="text-micro font-bold text-warm-400 uppercase tracking-widest mb-1.5">Notes</p>
              <p className="text-sm text-warm-700">{trip.notes}</p>
            </div>
          )}
        </div>

        {/* Close */}
        <div className="p-6 pt-3 border-t border-warm-100">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </m.div>
    </m.div>
  );
}

function PlayerTaskCard({
  task,
  onComplete,
}: {
  task: PlayerTask;
  onComplete: () => void;
}) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  };

  const isOverdue = task.status === 'overdue';
  const isCompleted = task.status === 'completed';

  const categoryColors: Record<string, string> = {
    general: 'bg-warm-100 text-warm-600',
    conditioning: 'bg-orange-50 text-orange-600',
    academic: 'bg-blue-50 text-blue-600',
    administrative: 'bg-purple-50 text-purple-600',
    practice: 'bg-primary-50 text-primary-600',
    game_prep: 'bg-amber-50 text-amber-600',
  };

  return (
    <m.div
      variants={fadeUp}
      layout
      className={cn(
        'relative glass-standard rounded-2xl overflow-clip transition-[transform,box-shadow] duration-300',
        isCompleted && 'opacity-60',
        !isCompleted && 'hover:shadow-lg hover:-translate-y-0.5',
      )}
    >
      <ShineEffect />
      {/* Urgency accent */}
      {isOverdue && <div className="h-1 bg-red-500" />}

      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Completion button */}
          <button
            onClick={handleComplete}
            disabled={isCompleted || completing}
            aria-label={isCompleted ? 'Task completed' : 'Mark task complete'}
            className={cn(
              'w-9 h-9 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors duration-200 touch-manipulation',
              isCompleted
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-warm-300 hover:border-primary-500 hover:bg-primary-50 active:scale-90',
              completing && 'animate-pulse',
            )}
          >
            {isCompleted && <IconCheck size={14} />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={cn(
                'font-semibold text-warm-900 truncate',
                isCompleted && 'line-through text-warm-500',
              )}>
                {task.title}
              </h3>
              {task.requires_upload && !isCompleted && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-micro font-medium flex-shrink-0">
                  <IconUpload size={10} />
                  Upload
                </span>
              )}
            </div>

            {task.description && (
              <p className="text-sm text-warm-500 line-clamp-2 mb-2">{task.description}</p>
            )}

            <div className="flex items-center gap-3 text-xs">
              {task.due_date && (
                <span className={cn(
                  'flex items-center gap-1',
                  isOverdue ? 'text-red-600 font-medium' : 'text-warm-400',
                )}>
                  <IconClock size={12} />
                  {isOverdue ? 'Overdue \u00b7 ' : ''}{formatRelativeDate(task.due_date)}
                </span>
              )}
              {task.category && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded font-medium',
                  categoryColors[task.category] || 'bg-warm-100 text-warm-600',
                )}>
                  {task.category.replace('_', ' ')}
                </span>
              )}
              {isCompleted && task.completed_at && (
                <span className="flex items-center gap-1 text-primary-600">
                  <IconCheckCheck size={12} />
                  Done {formatRelativeDate(task.completed_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </m.div>
  );
}

function EventRSVPCard({
  event,
  onRSVP,
}: {
  event: EventInvite;
  onRSVP: (status: 'accepted' | 'declined' | 'tentative') => void;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const fmtDate = useFormatDate();
  const style = getEventTypeStyle(event.event_type);
  const eventDate = new Date(event.start_time);
  const isToday = new Date().toDateString() === eventDate.toDateString();
  const isPast = eventDate < new Date();

  const handleRSVP = async (status: 'accepted' | 'declined' | 'tentative') => {
    setSubmitting(status);
    try {
      await onRSVP(status);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <m.div
      variants={fadeUp}
      layout
      className={cn(
        'relative glass-standard rounded-2xl overflow-clip transition-[transform,box-shadow] duration-300',
        !isPast && 'hover:shadow-lg hover:-translate-y-0.5',
        isPast && 'opacity-60',
      )}
    >
      <ShineEffect />
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Event type indicator */}
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', style.bg)}>
            <span className={cn('w-3 h-3 rounded-full', style.dot)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-warm-900 truncate">{event.title}</h3>
              {event.is_mandatory && (
                <Badge variant="danger" size="sm">Required</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-400 mb-3">
              <span className={cn('flex items-center gap-1', isToday && 'text-primary-600 font-medium')}>
                <IconCalendar size={12} />
                {isToday ? 'Today' : fmtDate(event.start_time)}
              </span>
              <span className="flex items-center gap-1">
                <IconClock size={12} />
                {formatEventTime(event.start_time)}
                {event.end_time && <> – {formatEventTime(event.end_time)}</>}
              </span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <IconMapPin size={12} />
                  <span className="truncate max-w-[140px]">{event.location}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <IconUsers size={12} />
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-micro font-semibold">
                  {event.going_count} going
                </span>
                {event.maybe_count > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-micro font-semibold">
                    {event.maybe_count} maybe
                  </span>
                )}
              </span>
            </div>

            {/* Mandatory event warning - shown proactively */}
            {!isPast && event.is_mandatory && event.rsvp_status !== 'accepted' && (
              <p className="text-micro text-red-500 font-medium mb-2">Attendance required for this event</p>
            )}

            {/* RSVP buttons */}
            {!isPast && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRSVP('accepted')}
                  disabled={submitting !== null}
                  className={cn(
                    'px-3.5 py-2 rounded-lg text-xs font-medium transition-colors duration-200 touch-manipulation min-h-[36px]',
                    event.rsvp_status === 'accepted'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-primary-50 text-primary-700 hover:bg-primary-100 active:scale-95',
                    submitting === 'accepted' && 'animate-pulse',
                  )}
                >
                  {event.rsvp_status === 'accepted' ? <span className="flex items-center gap-1"><IconCheck size={12} /> Going</span> : 'Going'}
                </button>
                <button
                  onClick={() => handleRSVP('tentative')}
                  disabled={submitting !== null}
                  className={cn(
                    'px-3.5 py-2 rounded-lg text-xs font-medium transition-colors duration-200 touch-manipulation min-h-[36px]',
                    event.rsvp_status === 'tentative'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100 active:scale-95',
                    submitting === 'tentative' && 'animate-pulse',
                  )}
                >
                  Maybe
                </button>
                <button
                  onClick={() => handleRSVP('declined')}
                  disabled={submitting !== null}
                  className={cn(
                    'px-3.5 py-2 rounded-lg text-xs font-medium transition-colors duration-200 touch-manipulation min-h-[36px]',
                    event.rsvp_status === 'declined'
                      ? 'bg-warm-600 text-white shadow-sm'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200 active:scale-95',
                    submitting === 'declined' && 'animate-pulse',
                  )}
                >
                  Can&apos;t go
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </m.div>
  );
}

// ============================================================================
// Overview Cards (compact summaries for the overview tab)
// ============================================================================

function OverviewSection({
  title,
  icon,
  count,
  urgentCount,
  onViewAll,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  urgentCount?: number;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <m.div variants={fadeUp} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-warm-400">{icon}</span>
          <h2 className="text-sm font-semibold text-warm-900 uppercase tracking-wider">{title}</h2>
          <span className="text-xs text-warm-400 font-medium">{count}</span>
          {urgentCount !== undefined && urgentCount > 0 && (
            <span className="px-1.5 py-0.5 text-micro font-bold bg-red-500 text-white rounded-full min-w-[18px] text-center">
              {urgentCount}
            </span>
          )}
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          View all
        </button>
      </div>
      {children}
    </m.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlayerHub({ trips, tasks, events, announcements, playerName, onCompleteTask, onRSVP }: PlayerHubProps) {
  const badges = useNotificationBadges();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);

  // Computed values
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const overdueTasks = tasks.filter(t => t.status === 'overdue');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingEvents = events.filter(e => !e.rsvp_status || e.rsvp_status === 'pending');
  const upcomingTrips = trips.filter(t => new Date(t.departure_date) >= new Date());
  const urgentCount = overdueTasks.length + pendingEvents.length;

  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview', count: urgentCount, urgentCount },
    { id: 'trips', label: 'Trips', count: upcomingTrips.length },
    { id: 'tasks', label: 'Tasks', count: pendingTasks.length, urgentCount: overdueTasks.length },
    { id: 'events', label: 'Events', count: events.filter(e => new Date(e.start_time) >= new Date()).length, urgentCount: pendingEvents.length },
  ];

  const handleCompleteTask = useCallback(async (taskId: string) => {
    await onCompleteTask(taskId);
  }, [onCompleteTask]);

  const handleRSVP = useCallback(async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
    await onRSVP(eventId, status);
  }, [onRSVP]);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = playerName.split(' ')[0];

  return (
    <div className="min-h-full">
      {/* Header */}
      <m.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="golf-mobile-page-header bg-white/80 md:backdrop-blur-xl"
      >
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-5">
          <div className="flex items-center gap-3">
            <MobileMenuButton />
            <div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900">
                {greeting}, {firstName}
              </h1>
              {urgentCount > 0 ? (
                <p className="text-warm-500 mt-0.5 text-sm">
                  {urgentCount} item{urgentCount !== 1 ? 's' : ''} need{urgentCount === 1 ? 's' : ''} your attention
                </p>
              ) : (
                <p className="text-warm-500 mt-0.5 text-sm">You&apos;re all caught up</p>
              )}
            </div>
          </div>
        </div>
      </m.div>

      {/* Tab navigation */}
      <div className="sticky top-[var(--golf-mobile-header-offset)] z-[9] border-b border-warm-100 bg-white/80 backdrop-blur-sm md:top-[73px] md:backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <GolfTabBar
            tabs={tabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
              count: tab.count,
              dot: Boolean(tab.urgentCount && tab.urgentCount > 0 && activeTab !== tab.id),
            }))}
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Player hub sections"
            stretch
            compact
            className="py-2"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
          {/* =============== OVERVIEW TAB =============== */}
          <div className={activeTab === 'overview' ? 'block' : 'hidden'}>
            <div
              className="space-y-8"
            >
              {/* Urgent alert */}
              {overdueTasks.length > 0 && (
                <m.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <IconClipboardList size={16} className="text-red-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      {overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-red-600">Please complete these as soon as possible</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className="text-xs font-medium text-red-700 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-100 transition-colors flex-shrink-0"
                  >
                    View
                  </button>
                </m.div>
              )}

              {/* New travel itinerary alert */}
              {badges.travel > 0 && (
                <m.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <IconAirplane size={16} className="text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">
                      {badges.travel} new travel itinerar{badges.travel !== 1 ? 'ies' : 'y'} posted
                    </p>
                    <p className="text-xs text-blue-600">Check your upcoming trip details</p>
                  </div>
                  <a
                    href="/golf/dashboard/travel"
                    className="text-xs font-medium text-blue-700 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-100 transition-colors flex-shrink-0"
                  >
                    View
                  </a>
                </m.div>
              )}

              {/* Announcements */}
              {announcements.length > 0 && (
                <PlayerHubAnnouncementsSection announcements={announcements} />
              )}

              {/* Upcoming Trips */}
              {upcomingTrips.length > 0 && (
                <OverviewSection
                  title="Upcoming Trips"
                  icon={<IconAirplane size={16} />}
                  count={upcomingTrips.length}
                  onViewAll={() => setActiveTab('trips')}
                >
                  <div className="space-y-3">
                    {upcomingTrips.slice(0, 2).map(trip => (
                      <TripCard key={trip.id} trip={trip} onExpand={() => setSelectedTrip(trip)} />
                    ))}
                  </div>
                </OverviewSection>
              )}

              {/* Pending Tasks */}
              {pendingTasks.length > 0 && (
                <OverviewSection
                  title="Tasks"
                  icon={<IconClipboardList size={16} />}
                  count={pendingTasks.length}
                  urgentCount={overdueTasks.length}
                  onViewAll={() => setActiveTab('tasks')}
                >
                  <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                    {pendingTasks.slice(0, 3).map(task => (
                      <PlayerTaskCard
                        key={task.id}
                        task={task}
                        onComplete={() => handleCompleteTask(task.id)}
                      />
                    ))}
                  </m.div>
                </OverviewSection>
              )}

              {/* Events needing RSVP */}
              {pendingEvents.length > 0 && (
                <OverviewSection
                  title="Awaiting RSVP"
                  icon={<IconCalendar size={16} />}
                  count={pendingEvents.length}
                  urgentCount={pendingEvents.length}
                  onViewAll={() => setActiveTab('events')}
                >
                  <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                    {pendingEvents.slice(0, 3).map(event => (
                      <EventRSVPCard
                        key={event.id}
                        event={event}
                        onRSVP={(status: 'accepted' | 'declined' | 'tentative') => handleRSVP(event.event_id, status)}
                      />
                    ))}
                  </m.div>
                </OverviewSection>
              )}

              {/* All caught up state */}
              {upcomingTrips.length === 0 && pendingTasks.length === 0 && pendingEvents.length === 0 && (
                <EmptyState
                  variant="card"
                  glass
                  icon={<IconCheckCheck size={40} />}
                  title="You're all caught up"
                  description="No pending tasks, upcoming trips, or events to respond to. Enjoy the break."
                />
              )}
            </div>
          </div>

          {/* =============== TRIPS TAB =============== */}
          <div className={activeTab === 'trips' ? 'block' : 'hidden'}>
            <div
            >
              {trips.length > 0 ? (
                <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                  {trips.map(trip => (
                    <TripCard key={trip.id} trip={trip} onExpand={() => setSelectedTrip(trip)} />
                  ))}
                </m.div>
              ) : (
                <EmptyState
                  type="generic"
                  variant="card"
                  glass
                  title="No Trips Scheduled"
                  description="Your coach hasn't scheduled any trips yet. Check back later."
                />
              )}
            </div>
          </div>

          {/* =============== TASKS TAB =============== */}
          <div className={activeTab === 'tasks' ? 'block' : 'hidden'}>
            <div>
              {tasks.length > 0 ? (
                <div className="space-y-6">
                  {/* Pending tasks */}
                  {pendingTasks.length > 0 && (
                    <div>
                      <h2 className="text-xs font-bold text-warm-400 uppercase tracking-widest mb-3">
                        To Do ({pendingTasks.length})
                      </h2>
                      <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                        {pendingTasks.map(task => (
                          <PlayerTaskCard
                            key={task.id}
                            task={task}
                            onComplete={() => handleCompleteTask(task.id)}
                          />
                        ))}
                      </m.div>
                    </div>
                  )}

                  {/* Completed tasks */}
                  {completedTasks.length > 0 && (
                    <div>
                      <h2 className="text-xs font-bold text-warm-400 uppercase tracking-widest mb-3">
                        Completed ({completedTasks.length})
                      </h2>
                      <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                        {completedTasks.map(task => (
                          <PlayerTaskCard
                            key={task.id}
                            task={task}
                            onComplete={() => handleCompleteTask(task.id)}
                          />
                        ))}
                      </m.div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  type="generic"
                  variant="card"
                  glass
                  title="No Tasks"
                  description="You don't have any assigned tasks right now."
                />
              )}
            </div>
          </div>

          {/* =============== EVENTS TAB =============== */}
          <div className={activeTab === 'events' ? 'block' : 'hidden'}>
            <div>
              {events.length > 0 ? (
                <div className="space-y-6">
                  {/* Upcoming events */}
                  {(() => {
                    const upcoming = events.filter(e => new Date(e.start_time) >= new Date());
                    return upcoming.length > 0 ? (
                      <div>
                        <h2 className="text-xs font-bold text-warm-400 uppercase tracking-widest mb-3">
                          Upcoming ({upcoming.length})
                        </h2>
                        <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                          {upcoming.map(event => (
                            <EventRSVPCard
                              key={event.id}
                              event={event}
                              onRSVP={(status) => handleRSVP(event.event_id, status)}
                            />
                          ))}
                        </m.div>
                      </div>
                    ) : null;
                  })()}

                  {/* Past events */}
                  {(() => {
                    const past = events.filter(e => new Date(e.start_time) < new Date());
                    return past.length > 0 ? (
                      <div>
                        <h2 className="text-xs font-bold text-warm-400 uppercase tracking-widest mb-3">
                          Past ({past.length})
                        </h2>
                        <m.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
                          {past.map(event => (
                            <EventRSVPCard
                              key={event.id}
                              event={event}
                              onRSVP={(status) => handleRSVP(event.event_id, status)}
                            />
                          ))}
                        </m.div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <EmptyState
                  type="generic"
                  variant="card"
                  glass
                  title="No Events"
                  description="No events have been scheduled yet. Check back later."
                />
              )}
            </div>
          </div>
      </div>

      {/* Trip detail sheet */}
      <AnimatePresence>
        {selectedTrip && (
          <TripDetailSheet trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
