'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/fairway';

export interface TeamFilterOption {
  value: string;
  label: string;
  href: string;
}

/**
 * Team filter for /admin/activity — a compact Select (not a FilterPill row;
 * the roster of teams is unbounded-ish and a chip-per-team row would blow
 * out phone width). Selecting a team navigates to `?team=<id>` — server
 * refetch, same contract as the kind chips.
 */
export function TeamFilterControl({
  options,
  value,
}: {
  options: readonly TeamFilterOption[];
  value: string;
}) {
  const router = useRouter();
  const hrefByValue = new Map(options.map((o) => [o.value, o.href]));

  return (
    <Select
      aria-label="Filter activity by team"
      value={value}
      onValueChange={(next) => {
        const href = next ? hrefByValue.get(next) : undefined;
        if (href) router.push(href);
      }}
      options={options.map((o) => ({ label: o.label, value: o.value }))}
      size="sm"
      className="w-full min-w-0 sm:w-56"
    />
  );
}
