import Link from 'next/link';
import type { ReactNode } from 'react';
import { Surface } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { bridgeFieldsOf, liveHref, PLATFORM_WORDS, type BridgeFields } from '@/lib/admin/clubhouse/live-model';
import { clubhouseHref } from '@/lib/admin/clubhouse/screens';
import { readAdminBridgeRows } from '@/lib/admin/clubhouse/live';

/**
 * B06 additions (plan §8): the Clubhouse code, Bridge ID, page, action, release and platform an incident's rows
 * carry, and a link to the session (B07) when a row names one. Read separately from the incident's own query, so a
 * held migration (no Bridge columns yet) can never take the incident page down: the fields then come from
 * `metadata.bridge`. Renders nothing for an incident that isn't Clubhouse's.
 */
export async function ClubhouseBridgePanel({ fingerprint }: { fingerprint: string }) {
  const read = await readAdminBridgeRows({ fingerprint, limit: 50 });
  if (read.state === 'error') {
    return (
      <p data-br={BR.incidents.failed} className="text-caption text-text-tertiary">
        The Clubhouse fields of this incident could not be read.
      </p>
    );
  }
  const rows = read.data.map((r) => bridgeFieldsOf(r)).filter((f): f is BridgeFields => f !== null);
  return <ClubhouseBridgeFields rows={rows} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[6.5rem_1fr] items-start gap-x-3 py-1.5">
      <dt className="pt-1.5 text-caption text-text-tertiary">{label}</dt>
      <dd className="flex min-w-0 flex-wrap gap-1.5">{children}</dd>
    </div>
  );
}

/** The panel, pure over the extracted fields, so the test renders it without a database. */
export function ClubhouseBridgeFields({ rows }: { rows: readonly BridgeFields[] }) {
  if (!rows.length) return null;
  const distinct = (pick: (f: BridgeFields) => string | null) => [...new Set(rows.map(pick).filter((v): v is string => Boolean(v)))];
  const codes = [...new Map(rows.filter((r) => r.code || r.bridgeId).map((r) => [r.code ?? String(r.bridgeId), r])).values()];
  const pages = distinct((r) => r.page);
  const actions = distinct((r) => r.action);
  const releases = distinct((r) => r.release);
  const platforms = distinct((r) => r.platform);
  const serverCodes = distinct((r) => r.serverCode);
  const sessions = distinct((r) => r.sessionId);
  const origins = distinct((r) => r.origin);
  const chip =
    'inline-flex min-h-8 items-center gap-1 rounded-full border border-border-subtle bg-surface-sunken px-2.5 font-fw-mono text-caption text-text-primary hover:border-border-strong [@media(pointer:coarse)]:min-h-10';

  return (
    <Surface padding="sm" className="min-w-0" aria-label="Clubhouse">
      <h2 className="border-b border-warm-200 pb-2 text-eyebrow uppercase text-warm-500">Clubhouse</h2>
      <dl data-br={BR.incidents.filterChips} className="mt-2 divide-y divide-border-subtle">
        <Row label="Code">
          {codes.map((r) => (
            <Link key={r.code ?? r.bridgeId} href={clubhouseHref.code(r.bridgeId ?? r.code ?? '')} data-br={BR.incidents.idChip} className={chip}>
              {r.bridgeId ?? r.code}
              {r.bridgeId && r.code ? <span className="text-text-tertiary">· {r.code}</span> : null}
            </Link>
          ))}
          {!codes.length ? <span className="pt-1.5 text-caption text-text-tertiary">no code on these rows</span> : null}
        </Row>
        {pages.length ? (
          <Row label="Page">
            {pages.map((p) => (
              <Link key={p} href={clubhouseHref.page(p)} className={chip}>
                {p}
              </Link>
            ))}
          </Row>
        ) : null}
        {actions.length ? (
          <Row label="Action">
            {actions.map((a) => (
              <Link key={a} href={clubhouseHref.action(a)} className={chip}>
                {a}
              </Link>
            ))}
          </Row>
        ) : null}
        {releases.length || platforms.length ? (
          <Row label="Release, platform">
            {releases.map((r) => (
              <Link key={r} href={liveHref.release(r)} className={chip}>
                {r.slice(0, 7)}
              </Link>
            ))}
            {platforms.map((p) => (
              <span key={p} className="inline-flex min-h-8 items-center px-1 text-caption text-text-secondary">
                {PLATFORM_WORDS[p] ?? p}
              </span>
            ))}
          </Row>
        ) : null}
        {serverCodes.length || origins.length ? (
          <Row label="Server">
            {serverCodes.map((c) => (
              <span key={c} className="inline-flex min-h-8 items-center font-fw-mono text-caption text-text-secondary">
                {c}
              </span>
            ))}
            {origins.map((o) => (
              <span key={o} className="inline-flex min-h-8 items-center text-caption text-text-tertiary">
                from {o === 'E5' ? 'a failed server read (E5)' : o === 'E9' ? 'a server action (E9)' : o}
              </span>
            ))}
          </Row>
        ) : null}
        <Row label="Sessions">
          {sessions.slice(0, 8).map((s) => (
            <Link key={s} href={liveHref.session(s)} data-br={BR.incidents.sessionLink} className={chip}>
              {s.slice(0, 12)}
            </Link>
          ))}
          <Link
            href={pages[0] ? `${liveHref.sessions()}?failed=1&page=${encodeURIComponent(pages[0])}` : `${liveHref.sessions()}?failed=1`}
            data-br={BR.incidents.peopleCount}
            className="inline-flex min-h-8 items-center px-1 text-caption text-accent-ink hover:underline"
          >
            {sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} · all failed sessions` : 'Failed sessions'}
          </Link>
        </Row>
      </dl>
    </Surface>
  );
}
