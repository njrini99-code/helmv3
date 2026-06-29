'use client';

/**
 * CrmCommandPalette — ⌘K / Ctrl+K command palette for the GolfHelm admin CRM.
 *
 * Built on the `cmdk` engine (Linear/Raycast/Vercel), which owns the fuzzy
 * matcher, keyboard navigation (arrows / Home / End / Enter), scroll-into-view
 * of the highlighted item, and the empty state. We own only the chrome
 * (backdrop, dialog frame) and the group/item layout.
 *
 * This is a thin, fully-controlled component: the parent (the CRM page) holds
 * the open state and supplies every navigation/action/select callback. Nothing
 * about the CRM's routing or data shape leaks in here beyond the plain props,
 * so this palette is reusable across the CRM surface without coupling to the
 * golf-dashboard CommandPalette.
 *
 * Visual surface mirrors the California-modern recipe used elsewhere: a warm
 * cream/glass panel over a tinted, blurred backdrop, rounded-2xl, with
 * primary-50 highlight on the active row and warm text throughout.
 */

import { useState } from 'react';
import { Command } from 'cmdk';
import { cn } from '@/lib/utils';
import { IconSearch, IconPlus, IconMail, IconUpload, IconUser } from '@/components/icons';

interface Destination {
  id: string;
  label: string;
}

interface CommandCoach {
  id: string;
  name: string;
  school: string;
  email: string | null;
}

interface CrmCommandPaletteProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  destinations: Destination[];
  onNavigate: (id: string) => void;
  onNewCoach: () => void;
  onCompose: () => void;
  onImport: () => void;
  coaches: CommandCoach[];
  onSelectCoach: (id: string) => void;
}

// Cap the rendered coach matches so a 2,000+ row book never tries to mount
// every match at once. cmdk filters the full list (cheap string compare); we
// only ever render the top slice.
const MAX_COACH_RESULTS = 8;

export function CrmCommandPalette({
  open,
  onOpenChange,
  destinations,
  onNavigate,
  onNewCoach,
  onCompose,
  onImport,
  coaches,
  onSelectCoach,
}: CrmCommandPaletteProps) {
  const [search, setSearch] = useState('');

  if (!open) return null;

  const close = () => {
    onOpenChange(false);
    setSearch('');
  };

  // Pre-filter the coach list ourselves (case-insensitive substring over
  // name/school/email) so we can cap the rendered rows BEFORE handing them to
  // cmdk. cmdk's own matcher still highlights/keyboards within this slice.
  const q = search.trim().toLowerCase();
  const matchedCoaches = q
    ? coaches
        .filter((c) => {
          const blob = `${c.name} ${c.school} ${c.email ?? ''}`.toLowerCase();
          return blob.includes(q);
        })
        .slice(0, MAX_COACH_RESULTS)
    : [];

  const itemClass = cn(
    'flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-xl cursor-pointer outline-none',
    'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
    'text-warm-700 data-[selected=true]:bg-primary-50 data-[selected=true]:text-primary-900',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
  );

  return (
    <div
      className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="CRM command palette"
    >
      {/* Backdrop — click closes (cmdk.Dialog isn't used; we own the frame) */}
      <button
        type="button"
        aria-label="Close command palette"
        onClick={close}
        className="absolute inset-0 bg-warm-900/40 backdrop-blur-md cursor-default"
      >
        <span className="sr-only">Close command palette</span>
      </button>

      {/* Palette frame */}
      <div className="absolute top-[16%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-full max-w-xl animate-in zoom-in-95 fade-in-0 slide-in-from-top-2 duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]">
        <Command
          label="CRM command palette"
          loop
          shouldFilter={false}
          className={cn(
            'overflow-hidden rounded-2xl bg-[#FFFEFA]/95 backdrop-blur-xl border border-white/40',
            'shadow-[0_4px_18px_rgba(28,25,23,0.10),0_28px_60px_rgba(28,25,23,0.16)]',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-warm-200/40">
            <IconSearch size={18} className="text-warm-400" aria-hidden />
            <Command.Input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Search coaches, jump to a tab, run an action…"
              className="flex-1 bg-transparent outline-none text-base text-warm-900 placeholder:text-warm-500 tracking-[-0.005em] focus-visible:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') close();
              }}
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-caption font-medium text-warm-500 bg-cream-200/55 rounded-md border border-warm-200/40">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="text-center py-10 text-sm text-warm-500">
              No results found.
            </Command.Empty>

            {/* Go to — navigable destinations */}
            <Command.Group
              heading="Go to"
              className="text-warm-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              {destinations.map((d) => (
                <Command.Item
                  key={`go-${d.id}`}
                  value={`Go to ${d.label}`}
                  onSelect={() => {
                    onNavigate(d.id);
                    close();
                  }}
                  className={itemClass}
                >
                  <span className="flex-1 min-w-0 text-sm font-medium tracking-[-0.005em] truncate">
                    {d.label}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Actions */}
            <Command.Group
              heading="Actions"
              className="text-warm-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              <Command.Item
                value="New Coach add create coach"
                onSelect={() => {
                  onNewCoach();
                  close();
                }}
                className={itemClass}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream-200/55 text-warm-700 data-[selected=true]:bg-primary-100">
                  <IconPlus size={18} aria-hidden />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium tracking-[-0.005em] truncate">
                  New Coach
                </span>
              </Command.Item>
              <Command.Item
                value="Compose email bulk message"
                onSelect={() => {
                  onCompose();
                  close();
                }}
                className={itemClass}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream-200/55 text-warm-700 data-[selected=true]:bg-primary-100">
                  <IconMail size={18} aria-hidden />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium tracking-[-0.005em] truncate">
                  Compose
                </span>
              </Command.Item>
              <Command.Item
                value="Import coaches upload csv"
                onSelect={() => {
                  onImport();
                  close();
                }}
                className={itemClass}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream-200/55 text-warm-700 data-[selected=true]:bg-primary-100">
                  <IconUpload size={18} aria-hidden />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium tracking-[-0.005em] truncate">
                  Import
                </span>
              </Command.Item>
            </Command.Group>

            {/* Coaches — fuzzy filter over name/school/email, capped */}
            {matchedCoaches.length > 0 && (
              <Command.Group
                heading="Coaches"
                className="text-warm-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                {matchedCoaches.map((c) => (
                  <Command.Item
                    key={`coach-${c.id}`}
                    value={`coach ${c.id} ${c.name} ${c.school} ${c.email ?? ''}`}
                    onSelect={() => {
                      onSelectCoach(c.id);
                      close();
                    }}
                    className={itemClass}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-200/55 text-warm-700 data-[selected=true]:bg-primary-100">
                      <IconUser size={16} aria-hidden />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium tracking-[-0.005em] truncate">
                        {c.name}
                      </span>
                      <span className="block text-xs text-warm-500 truncate">
                        {c.school}
                        {c.email ? ` · ${c.email}` : ''}
                      </span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer hints */}
          <div className="px-4 py-2 border-t border-warm-200/40 flex items-center justify-between text-caption text-warm-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-200/55 rounded border border-warm-200/40">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-cream-200/55 rounded border border-warm-200/40">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-200/55 rounded border border-warm-200/40">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
