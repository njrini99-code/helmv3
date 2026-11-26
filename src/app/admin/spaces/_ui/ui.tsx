import type { ReactNode } from 'react';
import Link from 'next/link';
import './bridge-space.css';

/**
 * The shared vocabulary of the Bridge spaces (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md).
 * Server components only, no state: interactive pieces live in their own 'use client' files.
 * Every control and state a screen renders carries its `data-br` code from BR (br-codes.ts).
 */

export type Tone = 'good' | 'watch' | 'bad' | 'coach' | 'player' | 'muted' | 'ink';
export type Role = 'coach' | 'player' | 'signed-out';

export function toneClass(tone: Tone): string {
  return `bs-tone-${tone}`;
}

/** The space root: scoped tokens, the page column, and the space's `data-br` state code. */
export function SpaceRoot({ br, children }: { br: string; children: ReactNode }) {
  return (
    <div className="bs" data-br={br}>
      <main className="bs-main">{children}</main>
    </div>
  );
}

/** Eyebrow, two-part headline (the second part carries the tone), one-paragraph lede, optional actions. */
export function SpaceHeader({
  eyebrow,
  title,
  second,
  secondTone = 'good',
  lede,
  badges,
  aside,
}: {
  eyebrow: string;
  title: string;
  second?: string;
  secondTone?: Tone;
  lede?: ReactNode;
  badges?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 20 }}>
      <div style={{ flex: '1 1 600px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span className="bs-eyebrow">{eyebrow}</span>
          {badges}
        </div>
        <h1 className="bs-headline">
          {title}
          {second ? <span className={`bs-second ${toneClass(secondTone)}`}>{second}</span> : null}
        </h1>
        {lede ? <p className="bs-lede">{lede}</p> : null}
      </div>
      {aside ? <div style={{ flex: '0 1 auto' }}>{aside}</div> : null}
    </section>
  );
}

export function Panel({
  title,
  note,
  tone,
  br,
  children,
  className,
}: {
  title?: string;
  note?: ReactNode;
  tone?: 'bad' | 'watch';
  br?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bs-panel ${tone ? `bs-wash-${tone}` : ''} ${className ?? ''}`} data-br={br}>
      {title ? (
        <div className="bs-panel-head">
          <h2 className={`bs-eyebrow ${tone ? toneClass(tone) : ''}`} style={{ margin: 0 }}>
            {title}
          </h2>
          {note ? <span className="bs-panel-note">{note}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** One number with its label and a plain-words line under it. `value === null` reads "not measured", never 0. */
export function Stat({
  label,
  value,
  sub,
  tone = 'ink',
  href,
  br,
}: {
  label: string;
  value: string | number | null;
  sub?: ReactNode;
  tone?: Tone;
  href?: string;
  br?: string;
}) {
  const body = (
    <>
      <div className="bs-eyebrow">{label}</div>
      <div className={`bs-stat-value ${value === null ? 'bs-tone-muted' : toneClass(tone)}`}>{value === null ? '—' : value}</div>
      <div className="bs-stat-sub">{value === null ? 'not measured yet' : sub}</div>
    </>
  );
  return href ? (
    <Link href={href} className="bs-panel bs-panel-pad bs-card-link" data-br={br}>
      {body}
    </Link>
  ) : (
    <div className="bs-panel bs-panel-pad" data-br={br}>
      {body}
    </div>
  );
}

export function Pill({ tone, children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  const wash = tone && tone !== 'muted' && tone !== 'ink' ? `bs-wash-${tone}` : '';
  return (
    <span className={`bs-pill ${wash} ${tone ? toneClass(tone) : ''}`}>
      {dot ? <span className="bs-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const ROLE_WORD: Record<Role, string> = { coach: 'Coach', player: 'Player', 'signed-out': 'Signed out' };

/** Who it happened to. Coaches and players always read in their own colour, on every space. */
export function RoleBadge({ role }: { role: Role }) {
  const tone: Tone = role === 'coach' ? 'coach' : role === 'player' ? 'player' : 'muted';
  return (
    <Pill tone={tone} dot>
      {ROLE_WORD[role]}
    </Pill>
  );
}

/** A horizontal meter with an optional threshold line. `max` sets the scale; values past it fill the bar. */
export function Meter({
  value,
  max,
  line,
  tone,
  label,
}: {
  value: number;
  max: number;
  line?: number;
  tone: Tone;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={`bs-bar ${toneClass(tone)}`} role="img" aria-label={label}>
      <span className="bs-bar-fill" style={{ width: `${pct}%` }} />
      {line !== undefined ? <span className="bs-bar-line" aria-hidden="true" style={{ left: `${Math.min(100, (line / max) * 100)}%` }} /> : null}
    </span>
  );
}

/** Link tabs: each tab is a URL (`?view=`), so the server renders the selected one and Back works. */
export function LinkTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: ReadonlyArray<{ key: string; label: string; href: string; count?: number | string; br?: string }>;
  current: string;
}) {
  return (
    <nav aria-label={label} className="bs-tabs">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className="bs-tab" aria-current={t.key === current ? 'page' : undefined} data-br={t.br}>
          {t.label}
          {t.count !== undefined ? <span className="bs-mono">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** The honest empty, failed and no-signal states, each with its xx91/xx92/xx93 code. */
export function SpaceState({ br, title, children }: { br: string; title: string; children?: ReactNode }) {
  return (
    <div className="bs-panel bs-panel-pad" data-br={br} role="status">
      <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
      {children ? <div className="bs-panel-note" style={{ marginTop: 6 }}>{children}</div> : null}
    </div>
  );
}
