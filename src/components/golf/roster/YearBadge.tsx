const YEAR_LABELS: Record<string, string> = {
  freshman: 'FR',
  sophomore: 'SO',
  junior: 'JR',
  senior: 'SR',
  graduate: 'GR',
  'grad_student': 'GR',
  'red_shirt_freshman': 'RS FR',
  'red_shirt_sophomore': 'RS SO',
  'red_shirt_junior': 'RS JR',
  'red_shirt_senior': 'RS SR',
};

export function YearBadge({ year }: { year: string | number | null }) {
  if (year === null || year === undefined) return null;

  let label: string;

  if (typeof year === 'number') {
    // Graduation year - display as abbreviated year
    label = `'${String(year).slice(-2)}`;
  } else {
    // Class standing string
    label = YEAR_LABELS[year] || year.slice(0, 2).toUpperCase();
  }

  return (
    <span className="px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider
                     bg-slate-100 text-slate-500 rounded">
      {label}
    </span>
  );
}
