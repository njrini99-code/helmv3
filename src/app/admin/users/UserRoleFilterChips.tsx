import { FilterPillLink } from '@/components/fairway';

export interface RoleChip {
  key: string;
  label: string;
  href: string;
  selected: boolean;
}

/**
 * The Users tab's role filter row. `fetchUsersTab({ role })` always
 * honored `?role=`; the directory just had no UI to set it.
 *
 * REAL LINKS, not buttons that push the router. Every chip's href is already
 * computed server-side; rendering it as an `<a>` means the row can be
 * middle-clicked into a new tab, cmd-clicked, copied with "copy link address"
 * and previewed on hover — and the file stops needing a `'use client'`
 * boundary and a router hook to do what an anchor does for free. On an admin
 * console the whole point of a filtered view is that you can hand someone the
 * URL. `aria-current` replaces `aria-pressed`: a link is not a toggle.
 */
export function UserRoleFilterChips({ chips }: { chips: readonly RoleChip[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Filter users by role">
      <span className="text-xs font-medium uppercase tracking-widest text-warm-500">Role</span>
      {chips.map((chip) => (
        <FilterPillLink key={chip.key} href={chip.href} size="sm" showCheck={false} selected={chip.selected}>
          {chip.label}
        </FilterPillLink>
      ))}
    </nav>
  );
}
