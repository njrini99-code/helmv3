'use client';

/**
 * TEMP redesign direction B (removed before ship) · section navigation.
 *
 * Desktop (>=1024px): a sticky left rail. Each entry is a real link (so a
 * modified click opens the section in a new tab) that REPLACES the URL
 * without scrolling, and carries a one-line live status under its label. The
 * column of status lines is the value-forward audit: a coach reads their
 * configuration down the rail without opening anything.
 *
 * Phone: the kit's `Segmented` (THE tab-switcher) in a sticky strip under the
 * top bar, scroll-snapping when the sections outgrow the width. The status of
 * the ACTIVE section sits under it (`SectionSummary`), since six two-line
 * segments would not fit a 390px track. `SegmentedLinks` was not used: it
 * renders plain `next/link`s with no `replace` / `scroll={false}`, and the
 * section switch must replace the URL in place.
 *
 * An amber dot marks a section holding unsaved edits. It is never the only
 * signal: the rail's status line reads "Unsaved changes", and on the phone
 * segment it carries screen-reader text.
 */

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Segmented } from '@/components/fairway';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { cn } from '@/lib/utils';
import type { SectionDef, SectionId } from './sections';
import type { StatusLine } from './status-lines';

interface NavBaseProps {
  sections: readonly SectionDef[];
  active: SectionId;
  dirty: ReadonlySet<SectionId>;
  className?: string;
}

function UnsavedDot({ className }: { className?: string }) {
  // Amber ink rather than the amber fill: the fill measures ~2:1 on the
  // cream canvas, under the 3:1 a meaningful graphic needs.
  return (
    <span
      aria-hidden
      className={cn('shrink-0 rounded-full bg-fw-warning-text', className)}
    />
  );
}

/* ── desktop rail ─────────────────────────────────────────────────────────── */

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function RailStatus({
  status,
  dirty,
  active,
}: {
  status: StatusLine;
  dirty: boolean;
  active: boolean;
}) {
  if (dirty) {
    return (
      <span className="block truncate font-fw-sans text-caption font-medium text-text-primary">
        Unsaved changes
      </span>
    );
  }
  if (status.kind === 'none') return null;
  if (status.kind === 'loading') {
    // 12px block + 3px above and below = the 18px caption line it becomes.
    return <Skeleton className={cn('my-[3px] h-3 w-32', active && 'bg-surface')} />;
  }
  return (
    <span
      className={cn(
        // Regular weight under a 15px medium label: the value reads as data
        // beneath its name, one clear step down (caption is 500 by default).
        'block truncate font-fw-sans text-caption font-normal tabular-nums',
        status.muted ? 'text-text-tertiary' : 'text-text-secondary',
      )}
    >
      {status.text}
    </span>
  );
}

function RailLink({
  section,
  href,
  active,
  dirty,
  status,
  onSelect,
}: {
  section: SectionDef;
  href: string;
  active: boolean;
  dirty: boolean;
  status: StatusLine;
  onSelect: (id: SectionId) => void;
}) {
  const twoLine = dirty || status.kind !== 'none';
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        // Show the section at once; the URL catches up through the router.
        if (isPlainClick(event)) onSelect(section.id);
      }}
      className={cn(
        'flex flex-col justify-center gap-0.5 rounded-fw-md px-3.5 py-2.5',
        twoLine ? 'min-h-[64px]' : 'min-h-[44px]',
        'outline-none transition-colors [transition-duration:var(--fw-dur-fast)]',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        active ? 'bg-accent-wash' : 'hover:bg-surface',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'truncate font-fw-sans text-body',
            active ? 'font-semibold text-accent-ink' : 'font-medium text-text-primary',
          )}
        >
          {section.label}
        </span>
        {dirty ? <UnsavedDot className="h-2 w-2" /> : null}
      </span>
      <RailStatus status={status} dirty={dirty} active={active} />
    </Link>
  );
}

export function SectionRail({
  sections,
  active,
  dirty,
  statusFor,
  hrefFor,
  onSelect,
  className,
}: NavBaseProps & {
  statusFor: (id: SectionId) => StatusLine;
  hrefFor: (id: SectionId) => string;
  onSelect: (id: SectionId) => void;
}) {
  // Configured sections carry a status; Help & legal is a utility and sits
  // apart at the foot, single-line.
  const configured = sections.filter((s) => s.id !== 'help');
  const utility = sections.filter((s) => s.id === 'help');

  const renderItem = (section: SectionDef) => (
    <li key={section.id}>
      <RailLink
        section={section}
        href={hrefFor(section.id)}
        active={section.id === active}
        dirty={dirty.has(section.id)}
        status={statusFor(section.id)}
        onSelect={onSelect}
      />
    </li>
  );

  return (
    <nav aria-label="Settings sections" className={className}>
      <ul className="flex flex-col gap-1">{configured.map(renderItem)}</ul>
      {utility.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-3">
          {utility.map(renderItem)}
        </ul>
      ) : null}
    </nav>
  );
}

/* ── phone switcher ───────────────────────────────────────────────────────── */

function SegmentLabel({ label, dirty }: { label: string; dirty: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {dirty ? (
        <>
          <UnsavedDot className="h-1.5 w-1.5" />
          <span className="sr-only">, unsaved changes</span>
        </>
      ) : null}
    </span>
  );
}

export function SectionSwitcher({
  sections,
  active,
  dirty,
  onSelect,
  className,
}: NavBaseProps & { onSelect: (id: SectionId) => void }) {
  return (
    <div
      className={cn(
        // Pinned under the app's top bar (AppShell publishes its height as
        // --golf-mobile-header-offset). Opaque canvas, not glass: panes
        // scroll under it and must not show through.
        'sticky top-[var(--golf-mobile-header-offset)] z-[var(--fw-z-sticky)]',
        '-mx-4 border-b border-border-subtle bg-canvas px-4 py-2 md:-mx-6 md:px-6',
        className,
      )}
    >
      <Segmented<SectionId>
        aria-label="Settings sections"
        size="lg"
        value={active}
        onValueChange={onSelect}
        options={sections.map((s) => ({
          value: s.id,
          label: <SegmentLabel label={s.label} dirty={dirty.has(s.id)} />,
        }))}
        className="snap-x snap-mandatory scroll-px-1 [&>*]:snap-start"
      />
    </div>
  );
}

/**
 * The phone's status line: the active section's label and its live status,
 * under the switcher. Omitted for Help & legal, which has nothing to report.
 */
export function SectionSummary({
  label,
  status,
  dirty,
  className,
}: {
  label: string;
  status: StatusLine;
  dirty: boolean;
  className?: string;
}) {
  if (!dirty && status.kind === 'none') return null;
  return (
    <div
      className={cn(
        'flex min-h-[18px] min-w-0 items-center gap-1.5 px-1 font-fw-sans text-caption',
        className,
      )}
    >
      <span className="shrink-0 font-semibold text-text-primary">{label}</span>
      <span aria-hidden className="shrink-0 text-text-tertiary">
        {'·'}
      </span>
      {dirty ? (
        <span className="truncate font-medium text-text-primary">Unsaved changes</span>
      ) : status.kind === 'loading' ? (
        <Skeleton className="h-3 w-32" />
      ) : status.kind === 'text' ? (
        <span
          className={cn(
            'truncate font-normal tabular-nums',
            status.muted ? 'text-text-tertiary' : 'text-text-secondary',
          )}
        >
          {status.text}
        </span>
      ) : null}
    </div>
  );
}
