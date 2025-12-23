'use client';

import Link from 'next/link';
import { IconBook, IconClock, IconMapPin, IconArrowRight } from '@/components/icons';
import { formatTimeDisplay, formatDaysDisplay } from '@/lib/utils/schedule-parser';

interface CalendarClass {
  id: string;
  course_code: string;
  course_name: string;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  color: string | null;
  instructor: string | null;
}

interface CalendarClassesListProps {
  classes: CalendarClass[];
}

export function CalendarClassesList({ classes }: CalendarClassesListProps) {
  // Group classes by day pattern for better organization
  const groupedClasses = classes.reduce((acc, cls) => {
    const pattern = formatDaysDisplay(cls.days) || 'Other';
    if (!acc[pattern]) acc[pattern] = [];
    acc[pattern].push(cls);
    return acc;
  }, {} as Record<string, CalendarClass[]>);

  // Sort each group by start time
  Object.keys(groupedClasses).forEach(pattern => {
    groupedClasses[pattern]?.sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Order patterns: MWF, TTh, MW, etc.
  const patternOrder = ['MWF', 'MW', 'MF', 'WF', 'TTh', 'M', 'T', 'W', 'Th', 'F', 'Other'];
  const sortedPatterns = Object.keys(groupedClasses).sort((a, b) => {
    const aIdx = patternOrder.indexOf(a);
    const bIdx = patternOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <IconBook size={18} className="text-blue-600" />
          <h3 className="font-semibold text-slate-900">My Classes</h3>
        </div>
        <Link 
          href="/golf/dashboard/classes"
          className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
        >
          Manage
          <IconArrowRight size={14} />
        </Link>
      </div>

      <div className="space-y-4">
        {sortedPatterns.map(pattern => (
          <div key={pattern}>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {pattern}
            </div>
            <div className="space-y-2">
              {groupedClasses[pattern]?.map(cls => (
                <div
                  key={cls.id}
                  className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-all"
                  style={{ borderLeftColor: cls.color || '#2563EB', borderLeftWidth: '3px' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-blue-600">
                        {cls.course_code}
                      </p>
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {cls.course_name}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    {cls.start_time && (
                      <span className="flex items-center gap-1">
                        <IconClock size={12} />
                        {formatTimeDisplay(cls.start_time)}
                        {cls.end_time && ` - ${formatTimeDisplay(cls.end_time)}`}
                      </span>
                    )}
                    {cls.location && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={12} />
                        {cls.location}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {classes.length === 0 && (
        <div className="text-center py-6">
          <IconBook size={32} className="mx-auto text-slate-200 mb-2" />
          <p className="text-sm text-slate-500 mb-3">No classes added yet</p>
          <Link
            href="/golf/dashboard/classes"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Add Classes
          </Link>
        </div>
      )}
    </div>
  );
}
