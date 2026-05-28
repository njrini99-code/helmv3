'use client';

/**
 * AvailabilityDayView — premium hour-rail comparison view.
 *
 * Renders the current user's busy periods alongside one-or-more selected
 * players' busy periods, colored by the per-player swatch assigned in
 * CalendarAvatarSidebar. Free hours surface a centered ghost CTA so coaches
 * can drop a new event into common availability without opening the create
 * modal first.
 *
 * Each busy period may carry a `color` field (added upstream by
 * PremiumCalendarClient when fanning out per selected player). The view
 * uses that color for the block background, ring, and avatar dot. Periods
 * without a color (the viewer's own coachBusyPeriods) fall back to the
 * primary-stamp + class-stripe palette.
 */

import { useState } from 'react';
import { Plus, BookOpen, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamMember } from './CalendarAvatarSidebar';

export interface BusyPeriodColor {
  bg: string;
  light: string;
  border: string;
  name: string;
}

export interface BusyPeriod {
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  title?: string;
  eventId?: string;
  ownerId?: string;
  ownerType?: 'coach' | 'player';
  /** Per-player swatch when this row came from a selected-player overlay. */
  color?: BusyPeriodColor;
  /** Player id this period belongs to (matches a selectedPlayers entry). */
  playerId?: string;
}

interface SelectedPlayerWithColor extends TeamMember {
  color: BusyPeriodColor;
}

interface AvailabilityDayViewProps {
  date: Date;
  coachBusyPeriods: BusyPeriod[];
  playerBusyPeriods: BusyPeriod[];
  /** First-selected player — kept for backward compatibility. */
  selectedPlayer: TeamMember | null;
  /** Full selection so the header can render per-player chips. */
  selectedPlayers?: SelectedPlayerWithColor[];
  onTimeSlotClick: (date: Date, hour: number) => void;
}

const START_HOUR = 7;
const END_HOUR = 19;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i,
);

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display} ${period}`;
}

function formatRange(period: BusyPeriod): string {
  const start = new Date(period.start);
  const end = new Date(period.end);
  return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getInitials(member: { first_name?: string; last_name?: string }) {
  return `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase();
}

export function AvailabilityDayView({
  date,
  coachBusyPeriods,
  playerBusyPeriods,
  selectedPlayer,
  selectedPlayers = [],
  onTimeSlotClick,
}: AvailabilityDayViewProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const today = new Date();
  const isToday = isSameDay(date, today);

  const playersById = new Map(selectedPlayers.map((p) => [p.id, p]));

  function periodsForHour(periods: BusyPeriod[], hour: number): BusyPeriod[] {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    return periods.filter((period) => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return start < hourEnd && end > hourStart;
    });
  }

  return (
    <div className="surface-matte rounded-3xl overflow-hidden">
      {/* Premium header */}
      <header className="relative px-6 py-5 border-b border-warm-200/60 bg-gradient-to-br from-white/70 via-warm-50/40 to-primary-50/20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-h2 leading-tight font-medium text-warm-900">
                {date.toLocaleDateString('en-US', { weekday: 'long' })}
              </h3>
              {isToday && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-eyebrow font-medium tracking-wide ring-1 ring-primary-200/70">
                  Today
                </span>
              )}
            </div>
            <p className="text-sm text-warm-500 mt-1 tabular-nums">
              {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {selectedPlayers.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap" role="list" aria-label="Selected players">
              <span className="text-eyebrow font-medium uppercase tracking-[0.08em] text-warm-400 mr-1">
                Comparing
              </span>
              {selectedPlayers.map((player) => (
                <div
                  key={player.id}
                  role="listitem"
                  className="inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-cream-100/75 border border-warm-200/70 shadow-sm"
                  title={`${player.first_name} ${player.last_name}`}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-eyebrow font-medium ring-2 ring-cream-50"
                    style={{ background: player.color.bg }}
                  >
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(player)
                    )}
                  </span>
                  <span className="text-xs font-medium text-warm-700">
                    {player.first_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Time rail */}
      <div className="divide-y divide-warm-200/70">
        {HOURS.map((hour) => {
          const yourPeriods = periodsForHour(coachBusyPeriods, hour);
          const playerPeriodsThisHour = periodsForHour(playerBusyPeriods, hour);
          const totalBusy = yourPeriods.length + playerPeriodsThisHour.length;
          const isHovered = hoveredHour === hour;
          const showFreeAffordance = totalBusy === 0;

          return (
            <div
              key={hour}
              className="relative flex items-stretch group"
              style={{ minHeight: '88px' }}
              onMouseEnter={() => setHoveredHour(hour)}
              onMouseLeave={() => setHoveredHour(null)}
            >
              {/* Hour label rail */}
              <div className="w-20 flex-shrink-0 flex items-start justify-end pt-3 pr-3 select-none">
                <span className="text-xs font-medium text-warm-400 tabular-nums">
                  {formatHour(hour)}
                </span>
              </div>

              {/* Track */}
              <div className="flex-1 relative px-3 py-2.5">
                {showFreeAffordance ? (
                  <FreeSlot
                    isHovered={isHovered}
                    hasComparisonContext={selectedPlayers.length > 0}
                    onClick={() => onTimeSlotClick(date, hour)}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {yourPeriods.map((period, i) => (
                      <BusyBlock
                        key={`you-${i}-${period.eventId ?? period.start}`}
                        period={period}
                        ownerLabel="You"
                        ownerColor={null}
                      />
                    ))}
                    {playerPeriodsThisHour.map((period, i) => {
                      const owner = period.playerId ? playersById.get(period.playerId) : null;
                      return (
                        <BusyBlock
                          key={`p-${i}-${period.eventId ?? period.start}`}
                          period={period}
                          ownerLabel={owner ? owner.first_name : selectedPlayer?.first_name ?? 'Player'}
                          ownerColor={period.color ?? owner?.color ?? null}
                          ownerInitials={owner ? getInitials(owner) : undefined}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <footer className="px-6 py-3 bg-warm-50/40 border-t border-warm-200/60 flex items-center justify-between text-eyebrow text-warm-500">
        <span>
          Working hours · {formatHour(START_HOUR)} – {formatHour(END_HOUR)}
        </span>
        <span className="hidden sm:inline">
          Hover an empty hour to schedule
        </span>
      </footer>
    </div>
  );
}

interface FreeSlotProps {
  isHovered: boolean;
  hasComparisonContext: boolean;
  onClick: () => void;
}

function FreeSlot({ isHovered, hasComparisonContext, onClick }: FreeSlotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'absolute inset-1.5 rounded-xl border border-dashed border-transparent',
        'transition-all duration-200 ease-out',
        'flex items-center justify-center gap-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        isHovered
          ? 'bg-primary-50/60 border-primary-200 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.15)]'
          : 'bg-transparent',
      )}
      aria-label={hasComparisonContext ? 'Schedule when both are free' : 'Schedule at this time'}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
          'text-caption font-medium tracking-wide',
          'transition-all duration-200',
          isHovered
            ? 'bg-primary-600 text-white shadow-[0_2px_10px_rgba(22,163,74,0.25)] scale-100'
            : 'bg-transparent text-transparent scale-95',
        )}
      >
        <Plus className="w-3.5 h-3.5" />
        Schedule here
      </span>
      {!isHovered && hasComparisonContext && (
        <span className="text-eyebrow font-medium text-primary-600/80">
          ✓ Both available
        </span>
      )}
    </button>
  );
}

interface BusyBlockProps {
  period: BusyPeriod;
  ownerLabel: string;
  ownerColor: BusyPeriodColor | null;
  ownerInitials?: string;
}

function BusyBlock({ period, ownerLabel, ownerColor, ownerInitials }: BusyBlockProps) {
  const isClass = period.type === 'class';
  const isBlocked = period.type === 'blocked';
  const colorBg = ownerColor?.bg ?? (isClass || isBlocked ? '#f97316' : '#16a34a');
  const colorLight = ownerColor?.light ?? (isClass || isBlocked ? 'rgba(249, 115, 22, 0.1)' : 'rgba(22, 163, 74, 0.1)');
  const colorBorder = ownerColor?.border ?? (isClass || isBlocked ? 'rgba(249, 115, 22, 0.4)' : 'rgba(22, 163, 74, 0.4)');

  const stripePattern = isClass
    ? `repeating-linear-gradient(45deg, transparent 0 8px, ${ownerColor ? ownerColor.light : 'rgba(0,0,0,0.04)'} 8px 16px)`
    : undefined;

  return (
    <div
      className={cn(
        'group/block relative overflow-hidden rounded-xl px-3.5 py-2.5',
        'border ring-1 ring-inset',
        'transition-transform duration-200',
        'hover:-translate-y-[1px]',
      )}
      style={{
        background: `linear-gradient(135deg, ${colorLight} 0%, rgba(255,255,255,0.4) 100%)`,
        borderColor: colorBorder,
        boxShadow: `inset 3px 0 0 0 ${colorBg}`,
      }}
    >
      {stripePattern && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: stripePattern }}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {ownerInitials ? (
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-eyebrow font-medium flex-shrink-0"
                style={{ background: colorBg }}
              >
                {ownerInitials}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white flex-shrink-0"
                style={{ background: colorBg }}
              >
                {isClass ? <BookOpen className="w-2.5 h-2.5" /> : isBlocked ? <Lock className="w-2.5 h-2.5" /> : null}
              </span>
            )}
            <p className="text-sm font-medium text-warm-900 truncate">
              {period.title || (isClass ? 'Class' : isBlocked ? 'Blocked' : 'Busy')}
            </p>
          </div>
          <p className="text-eyebrow text-warm-500 tabular-nums pl-7">
            {ownerLabel} · {formatRange(period)}
          </p>
        </div>
      </div>
    </div>
  );
}
