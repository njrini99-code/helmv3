'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract calendar mockup showing month grid with event indicators
 */
export function CalendarMockup() {
  // Mini calendar grid - 7 cols, 4 rows
  const days = [
    [null, null, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11, 12],
    [13, 14, 15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24, 25, 26],
  ];

  // Days with events
  const events: Record<number, 'tournament' | 'practice' | 'meeting'> = {
    8: 'practice',
    12: 'tournament',
    15: 'practice',
    22: 'tournament',
    23: 'tournament',
  };

  const eventColors = {
    tournament: 'bg-primary-500',
    practice: 'bg-amber-500',
    meeting: 'bg-warm-400',
  };

  return (
    <div className={cn(
      "bg-cream-100/55 backdrop-blur-xl rounded-lg p-2",
      "border border-warm-200/45"
    )}>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-eyebrow text-warm-400 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="space-y-0.5">
        {days.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((day, di) => (
              <div
                key={di}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded text-eyebrow",
                  day === 15 && "bg-primary-100 text-primary-700 font-semibold"
                )}
              >
                {day && (
                  <>
                    <span className={day === 15 ? "" : "text-warm-600"}>{day}</span>
                    {events[day] && (
                      <div className={cn("w-1 h-1 rounded-full mt-0.5", eventColors[events[day]])} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-white/20">
        <LegendItem color="bg-primary-500" label="Tournament" />
        <LegendItem color="bg-amber-500" label="Practice" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn("w-1.5 h-1.5 rounded-full", color)} />
      <span className="text-eyebrow text-warm-500">{label}</span>
    </div>
  );
}
