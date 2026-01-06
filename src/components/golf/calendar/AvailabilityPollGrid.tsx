'use client';

/**
 * Availability Poll Grid Component
 *
 * When2meet-style availability scheduler:
 * - Date header row with day labels
 * - Time slot rows (customizable intervals)
 * - Heat map cells showing group availability
 * - Hover tooltips with participant names
 * - My response border overlay
 * - Click/drag to toggle availability
 * - Mobile-responsive grid
 *
 * Used for finding optimal meeting times with visual heat map.
 */

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AvailabilityCell, AvailabilityCellLegend } from './AvailabilityCell';
import { format, parseISO } from 'date-fns';
import '@/styles/calendar-tokens.css';

export interface TimeSlot {
  date: string; // ISO date string
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  availableCount: number;
  maybeCount: number;
  totalResponses: number;
  availableUsers: string[];
  myResponse: 'available' | 'maybe' | 'unavailable' | null;
}

export interface AvailabilityPollGridProps {
  title: string;
  dates: string[]; // Array of ISO date strings
  timeSlots: TimeSlot[];
  onToggleSlot: (date: string, startTime: string) => Promise<void>;
  timeInterval?: 30 | 60; // Minutes
  startHour?: number; // 24-hour format
  endHour?: number; // 24-hour format
  className?: string;
  disabled?: boolean;
}

export function AvailabilityPollGrid({
  title,
  dates,
  timeSlots,
  onToggleSlot,
  timeInterval = 30,
  startHour = 8,
  endHour = 22,
  className,
  disabled = false,
}: AvailabilityPollGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect' | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Generate time labels
  const timeLabels: string[] = [];
  for (let hour = startHour; hour < endHour; hour += timeInterval / 60) {
    const hours = Math.floor(hour);
    const minutes = (hour % 1) * 60;
    timeLabels.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
  }

  function getSlot(date: string, time: string): TimeSlot | undefined {
    return timeSlots.find((slot) => slot.date === date && slot.startTime === time);
  }

  async function handleCellClick(date: string, time: string) {
    if (disabled) return;
    await onToggleSlot(date, time);
  }

  function handleMouseDown(date: string, time: string) {
    if (disabled) return;

    const slot = getSlot(date, time);
    setIsDragging(true);
    setDragMode(slot?.myResponse === 'available' ? 'deselect' : 'select');

    // Toggle this cell immediately
    handleCellClick(date, time);
  }

  function handleMouseEnter(date: string, time: string) {
    if (isDragging && dragMode) {
      const slot = getSlot(date, time);

      // Only toggle if it matches the drag mode
      if (dragMode === 'select' && slot?.myResponse !== 'available') {
        handleCellClick(date, time);
      } else if (dragMode === 'deselect' && slot?.myResponse === 'available') {
        handleCellClick(date, time);
      }
    }
  }

  function handleMouseUp() {
    setIsDragging(false);
    setDragMode(null);
  }

  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
      {/* Header */}
      <div className="p-5 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-4">
          Click or drag to mark your availability. Darker green = more people available.
        </p>

        {/* Legend */}
        <AvailabilityCellLegend />
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="p-4 overflow-x-auto"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="min-w-max">
          {/* Date header row */}
          <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `80px repeat(${dates.length}, minmax(60px, 1fr))` }}>
            <div className="h-12" /> {/* Empty corner cell */}
            {dates.map((date) => {
              const dateObj = parseISO(date);
              return (
                <div key={date} className="h-12 flex flex-col items-center justify-center">
                  <span className="text-xs font-semibold text-slate-900">
                    {format(dateObj, 'EEE')}
                  </span>
                  <span className="text-xs text-slate-500">{format(dateObj, 'MMM d')}</span>
                </div>
              );
            })}
          </div>

          {/* Time slot rows */}
          <div className="space-y-1">
            {timeLabels.map((time) => (
              <div
                key={time}
                className="grid gap-1"
                style={{ gridTemplateColumns: `80px repeat(${dates.length}, minmax(60px, 1fr))` }}
              >
                {/* Time label */}
                <div className="h-12 flex items-center justify-end pr-3">
                  <span className="text-xs font-medium text-slate-600">{formatTimeLabel(time)}</span>
                </div>

                {/* Cells for each date */}
                {dates.map((date) => {
                  const slot = getSlot(date, time);

                  if (!slot) {
                    return (
                      <div
                        key={`${date}-${time}`}
                        className="h-12 bg-slate-50 rounded-md border border-slate-100"
                      />
                    );
                  }

                  return (
                    <div
                      key={`${date}-${time}`}
                      className="h-12"
                      onMouseDown={() => handleMouseDown(date, time)}
                      onMouseEnter={() => handleMouseEnter(date, time)}
                    >
                      <AvailabilityCell
                        timeSlot={{
                          date: slot.date,
                          startTime: slot.startTime,
                          endTime: slot.endTime,
                        }}
                        availableCount={slot.availableCount}
                        maybeCount={slot.maybeCount}
                        totalResponses={slot.totalResponses}
                        myResponse={slot.myResponse}
                        availableUsers={slot.availableUsers}
                        onToggle={() => handleCellClick(date, time)}
                        disabled={disabled}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer instructions */}
      <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
        <div className="flex items-start gap-2 text-xs text-slate-600">
          <span className="shrink-0">💡</span>
          <p>
            <strong>Tip:</strong> Click individual cells or click and drag to quickly mark multiple
            time slots. Your selections are outlined in dark.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Format time label for display
 */
function formatTimeLabel(time: string): string {
  const parts = time.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;

  if (minutes === 0) {
    return `${displayHour} ${period}`;
  }

  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Compact Availability Grid (preview mode)
 */
export function CompactAvailabilityGrid({
  dates,
  timeSlots,
  className,
}: Pick<AvailabilityPollGridProps, 'dates' | 'timeSlots' | 'className'>) {
  // Show only 3 dates max
  const previewDates = dates.slice(0, 3);

  // Show only 4-6 time slots
  const uniqueTimes = Array.from(new Set(timeSlots.map((s) => s.startTime))).slice(0, 6);

  return (
    <div className={cn('space-y-1', className)}>
      {uniqueTimes.map((time) => (
        <div key={time} className="flex items-center gap-1">
          <span className="text-xs text-slate-500 w-12 text-right">{formatTimeLabel(time)}</span>
          <div className="flex gap-1">
            {previewDates.map((date) => {
              const slot = timeSlots.find((s) => s.date === date && s.startTime === time);
              if (!slot) return <div key={date} className="w-8 h-6 bg-slate-100 rounded" />;

              return (
                <div key={date} className="w-8 h-6">
                  <AvailabilityCell
                    timeSlot={{
                      date: slot.date,
                      startTime: slot.startTime,
                      endTime: slot.endTime,
                    }}
                    availableCount={slot.availableCount}
                    maybeCount={slot.maybeCount}
                    totalResponses={slot.totalResponses}
                    myResponse={slot.myResponse}
                    disabled
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
