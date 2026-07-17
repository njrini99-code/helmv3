'use client';

import { useRouter } from 'next/navigation';
import { FilterPill } from '@/components/fairway';

export interface RoleChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * The Users tab's role filter row — `fetchUsersTab({ role })` has always
 * honored `?role=`, but the directory had no UI surface to set it (URL-only,
 * undiscoverable). Same server-href + client-navigate pattern as
 * ActivityKindFilterChips (src/app/admin/activity/ActivityKindFilterChips.tsx):
 * the page computes every chip's href server-side (merging role with every
 * OTHER active filter), this component just does the navigation.
 */
export function UserRoleFilterChips({ chips }: { chips: readonly RoleChip[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter users by role">
      <span className="text-xs font-medium uppercase tracking-widest text-warm-500">Role</span>
      {chips.map((chip) => (
        <FilterPill
          key={chip.key}
          size="sm"
          showCheck={false}
          selected={chip.selected}
          onClick={() => router.push(chip.href)}
        >
          {chip.label}
        </FilterPill>
      ))}
    </div>
  );
}
