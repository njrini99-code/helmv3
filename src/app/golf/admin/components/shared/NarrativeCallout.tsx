'use client';

import { cn } from '@/lib/utils';

interface NarrativeCalloutProps {
  text: string;
  type: 'insight' | 'warning' | 'positive';
  className?: string;
}

const typeStyles: Record<NarrativeCalloutProps['type'], string> = {
  insight: 'bg-blue-50/50 text-blue-800 border border-blue-100',
  warning: 'bg-amber-50/50 text-amber-800 border border-amber-100',
  positive: 'bg-primary-50/50 text-primary-800 border border-primary-100',
};

const typeIcons: Record<NarrativeCalloutProps['type'], string> = {
  insight: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  positive:
    'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

export function NarrativeCallout({
  text,
  type,
  className,
}: NarrativeCalloutProps) {
  return (
    <div className={cn('rounded-xl px-4 py-3 flex items-start gap-2.5', typeStyles[type], className)}>
      <svg
        className="w-4 h-4 shrink-0 mt-0.5 opacity-70"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={typeIcons[type]} />
      </svg>
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  );
}
