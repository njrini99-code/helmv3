'use client';

import { cn } from '@/lib/utils';

interface CohortRetentionMatrixProps {
  cohorts: {
    cohortWeek: string;
    cohortSize: number;
    retentionByWeek: number[];
  }[];
}

const WEEKS_TO_SHOW = 9; // Week 0 through Week 8

function formatWeekLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCellClasses(value: number | undefined): string {
  if (value === undefined) {
    return 'bg-warm-50 text-warm-300';
  }
  if (value >= 60) {
    return 'bg-primary-100 text-primary-800';
  }
  if (value >= 30) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-red-100 text-red-800';
}

export default function CohortRetentionMatrix({ cohorts }: CohortRetentionMatrixProps) {
  return (
    <div className="glass-standard rounded-2xl p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-warm-900">Cohort Retention</h3>
        <p className="text-xs text-warm-400">% of users active N weeks after signup</p>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-warm-500 pb-2 pr-3 whitespace-nowrap">
                Signup Week
              </th>
              {Array.from({ length: WEEKS_TO_SHOW }, (_, i) => (
                <th
                  key={i}
                  className="text-center text-xs font-medium text-warm-500 pb-2 px-1 whitespace-nowrap"
                >
                  Wk {i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.cohortWeek}>
                <td className="pr-3 py-1 whitespace-nowrap">
                  <span className="text-sm font-medium text-warm-900">
                    {formatWeekLabel(cohort.cohortWeek)}
                  </span>
                  <span className="text-xs text-warm-400 ml-1">
                    ({cohort.cohortSize})
                  </span>
                </td>
                {Array.from({ length: WEEKS_TO_SHOW }, (_, weekIndex) => {
                  const value = cohort.retentionByWeek[weekIndex];
                  const hasValue = value !== undefined;

                  return (
                    <td key={weekIndex} className="px-1 py-1">
                      <div
                        className={cn(
                          'w-12 h-8 rounded-md flex items-center justify-center text-xs font-medium',
                          getCellClasses(value)
                        )}
                      >
                        {hasValue ? `${Math.round(value)}%` : '—'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-warm-400 mt-4">
        Based on round submission activity
      </p>
    </div>
  );
}
