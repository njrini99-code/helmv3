import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

interface DateCellProps {
  date: Date | string;
  formatType?: 'full' | 'short' | 'relative';
}

export function DateCell({ date, formatType = 'short' }: DateCellProps) {
  const d = new Date(date);

  let display: string;
  if (formatType === 'relative') {
    if (isToday(d)) display = 'Today';
    else if (isYesterday(d)) display = 'Yesterday';
    else display = formatDistanceToNow(d, { addSuffix: true });
  } else if (formatType === 'full') {
    display = format(d, 'MMM d, yyyy h:mm a');
  } else {
    display = format(d, 'MMM d, yyyy');
  }

  return (
    <span className="text-sm text-warm-600">{display}</span>
  );
}
