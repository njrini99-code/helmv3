'use client';

import { type BaseballPlayerClass } from '@/app/baseball/actions/academics';

interface ClassScheduleGridProps {
  classes: BaseballPlayerClass[];
  onClassClick?: (cls: BaseballPlayerClass) => void;
}

const DAY_ORDER = ['M', 'T', 'W', 'Th', 'F'];
const DAY_NAMES: Record<string, string> = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  Th: 'Thursday',
  F: 'Friday',
};

function formatTimeDisplay(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined) return time;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function parseClassName(className: string): { code: string; name: string } {
  if (className.includes(' - ')) {
    const parts = className.split(' - ');
    return { code: parts[0] || '', name: parts.slice(1).join(' - ') || className };
  }
  return { code: '', name: className };
}

export function ClassScheduleGrid({ classes, onClassClick }: ClassScheduleGridProps) {
  // Group classes by day
  const classesByDay = classes.reduce((acc, cls) => {
    (cls.days || []).forEach(day => {
      if (!acc[day]) acc[day] = [];
      acc[day].push(cls);
    });
    return acc;
  }, {} as Record<string, BaseballPlayerClass[]>);

  // Sort classes by time within each day
  Object.keys(classesByDay).forEach(day => {
    classesByDay[day]?.sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  return (
    <div className="grid grid-cols-5 gap-4">
      {DAY_ORDER.map(day => (
        <div key={day}>
          <div className="text-center mb-3">
            <span className="text-sm font-medium text-slate-500">{DAY_NAMES[day]}</span>
          </div>
          <div className="space-y-2 min-h-[200px]">
            {classesByDay[day] && classesByDay[day].length > 0 ? (
              classesByDay[day]!.map(cls => {
                const { code, name } = parseClassName(cls.class_name);
                const location = cls.building && cls.room
                  ? `${cls.building} ${cls.room}`
                  : cls.building || cls.room || null;

                return (
                  <button
                    key={`${cls.id}-${day}`}
                    onClick={() => onClassClick?.(cls)}
                    className="w-full text-left p-3 rounded-xl border border-white/20 hover:border-white/40 hover:shadow-sm transition-all bg-white/60"
                    style={{ borderLeftColor: cls.color || '#16A34A', borderLeftWidth: '3px' }}
                  >
                    {code && (
                      <p className="font-mono text-xs font-semibold text-green-600 mb-0.5">{code}</p>
                    )}
                    <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                    {cls.start_time && (
                      <p className="text-xs text-slate-500 mt-1">
                        {formatTimeDisplay(cls.start_time)}
                        {cls.end_time && ` - ${formatTimeDisplay(cls.end_time)}`}
                      </p>
                    )}
                    {location && (
                      <p className="text-xs text-slate-400 mt-0.5">{location}</p>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-300 py-8">
                No classes
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
