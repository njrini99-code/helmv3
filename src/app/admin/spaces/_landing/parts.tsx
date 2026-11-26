import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Meter, toneClass, type Tone } from '../_ui/ui';
import type { Needs } from './model';
import './landing.css';

/**
 * Pieces the Today, Product, Ship and Desk landings share (branch E). Server components, no state. Built on the
 * shared vocabulary in ../_ui/ui.tsx; nothing here declares a colour.
 */

/** One pulse tile: a value, what it counts, and an optional meter. `value === null` reads "not measured yet". */
export function PulseTile({
  label,
  value,
  sub,
  tone = 'ink',
  meter,
}: {
  label: string;
  value: string | null;
  sub: ReactNode;
  tone?: Tone;
  meter?: { value: number; max: number; label: string };
}) {
  return (
    <div className="bs-panel bs-tile">
      <span className="bs-eyebrow">{label}</span>
      <span className={`bs-tile-value ${value === null ? 'bs-tone-muted' : toneClass(tone)}`}>{value ?? '—'}</span>
      <span className="bs-tile-sub">{value === null ? 'not measured yet' : sub}</span>
      {meter && value !== null && meter.max > 0 ? <Meter value={meter.value} max={meter.max} tone={tone} label={meter.label} /> : null}
    </div>
  );
}

export function Chevron() {
  return (
    <svg className="bs-chev" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** The "waiting on you" rows: count, what, where it lives. A row whose source failed shows "?" and says so. */
export function AskList({ needs, br }: { needs: Needs; br: string }) {
  return (
    <ul className="bs-asks">
      {needs.rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="bs-ask" data-br={br}>
            <span className={`bs-ask-count ${r.count === null ? 'bs-tone-muted' : toneClass(r.tone)}`}>{r.count ?? '?'}</span>
            <span>
              {r.title}
              {r.count === null ? <span className="bs-panel-note"> · {r.unknown ?? 'could not be read'}</span> : null}
            </span>
            <Chevron />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Tabs in this space": the old tabs a space groups, each a link. */
export function TabLinkRow({
  title = 'Tabs in this space',
  links,
  br,
}: {
  title?: string;
  links: ReadonlyArray<{ label: string; href: string; note?: string }>;
  br: string;
}) {
  return (
    <nav aria-label={title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 className="bs-eyebrow" style={{ margin: 0 }}>
        {title}
      </h2>
      <div className="bs-tablinks">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="bs-tablink" data-br={br}>
            {l.label}
            {l.note ? <small>{l.note}</small> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** A section whose read failed: says what failed and offers the retry. Never renders a number. */
export function FailedInline({ br, what, retryHref }: { br: string; what: string; retryHref: string }) {
  return (
    <div className="bs-inline-state" data-br={br} role="status">
      <span className="bs-tone-bad" style={{ fontWeight: 600 }}>
        {what} could not be read.
      </span>{' '}
      <Link href={retryHref} className="bs-link">
        Try again
      </Link>
    </div>
  );
}

export function Skel({ w = '100%', h = 16, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <span className="bs-skel" aria-hidden="true" style={{ width: w, height: h, ...style }} />;
}
