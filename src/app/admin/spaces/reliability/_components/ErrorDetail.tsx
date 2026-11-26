import type { ReactNode } from 'react';
import Link from 'next/link';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import {
  DETAIL_TABS,
  DETAIL_TAB_LABEL,
  STATE_WORDS,
  feedHref,
  itemExplanation,
  itemHeadline,
  itemHeadlineQuoted,
  serverCodeWords,
  serverSource,
  type FeedItem,
  type FixStatus,
  type FeedScope,
  type TrailLine,
  type WhereModel,
} from '@/lib/admin/clubhouse/feed';
import { OWNER_TONE, OWNER_WORDS, plainLine } from '@/lib/admin/clubhouse/explain';
import { liveHref, type LiveState } from '@/lib/admin/clubhouse/live-model';
import type { BridgeNoteRow } from '@/lib/admin/clubhouse/notes';
import { clubhouseHref, githubBlobUrl, liveRef } from '@/lib/admin/clubhouse/screens';
import { LocalTime } from '@/app/admin/_components/LocalTime';
import { LinkTabs, Pill, RoleBadge } from '../../_ui/ui';

export interface DetailProps {
  item: FeedItem;
  graph: BridgeGraph;
  scope: FeedScope;
  where: WhereModel;
  trail: { state: LiveState; lines: TrailLine[]; truncated?: boolean };
  counts: string[];
  /** How many failures of this code carried the same server code, of how many. */
  sameServer: { same: number; of: number } | null;
  notes: { state: LiveState; expected: BridgeNoteRow | null; watching: BridgeNoteRow | null };
  /** The item is outside the loaded window (an older stored link). */
  outsideWindow: boolean;
  /** The existing Watch and Mark expected controls (CodeNotes.tsx), built by the route file. */
  noteControls: { watch: ReactNode; expected: ReactNode };
  /** Whether the code still fails in the live release (fixStatus, from the 8-day hourly history). */
  fix: FixStatus;
}

/**
 * What happened, the likely cause and how we know it, what to do, and whether it still fails. Above the tabs, so the
 * first thing on the panel is the explanation, not the plumbing.
 */
function Explain({ item, fix }: { item: FeedItem; fix: FixStatus }) {
  const e = itemExplanation(item);
  const quoted = itemHeadlineQuoted(item);
  const means = quoted ? plainLine(item.meaning) : null;
  return (
    <div className="rl-explain" aria-label="What happened and what to do">
      {means ? (
        <p className="rl-explain-means">
          <span className="bs-eyebrow">When it shows</span> {means}.
        </p>
      ) : null}
      <div className="rl-explain-cause">
        <Pill tone={OWNER_TONE[e.owner]}>
          {OWNER_WORDS[e.owner]} · {e.label}
        </Pill>
        <span className="rl-note">{e.basisWords}</span>
      </div>
      <p className="rl-explain-why">{e.why}</p>
      <div className="bs-eyebrow">What to do</div>
      <ol className="rl-steps">
        {e.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className={`rl-explain-fix bs-tone-${fix.tone}`} data-state={fix.state}>
        {fix.words}
      </p>
    </div>
  );
}

/** Why a code cannot be watched or marked, or undefined when it can. */
export function noteBlocker(graph: BridgeGraph, id: number | null): string | undefined {
  const ch = id !== null ? graph.ids[String(id)]?.ch : undefined;
  return id === null ? 'This code is not in the Bridge map, so it cannot be watched or marked.' : !ch ? 'This Bridge row has no CH code, so it cannot be watched or marked.' : undefined;
}

const STATE_TONE = { expected: 'muted', watching: 'watch', new: 'bad' } as const;

function Facts({ rows }: { rows: ReadonlyArray<[string, ReactNode]> }) {
  return (
    <dl className="rl-facts">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FileLink({ path }: { path: string }) {
  return (
    <a className="bs-mono bs-link" href={githubBlobUrl(path, liveRef())} target="_blank" rel="noreferrer">
      {path}
    </a>
  );
}

/** An honest schematic of the phone: the page's name and the pressed control. It is not a screenshot. */
function PhoneSchematic({ where }: { where: WhereModel }) {
  const label = where.control?.label ?? where.action?.label ?? null;
  return (
    <figure style={{ margin: 0 }} aria-label={`Schematic: ${where.pageName}${label ? `, ${label} highlighted` : ''}`}>
      <div className="rl-phone" aria-hidden="true">
        <div className="rl-phone-screen">
          <div className="rl-phone-bar">{where.pageName}</div>
          <div className="rl-phone-lines">
            <span className="rl-phone-line" style={{ width: '72%' }} />
            <span className="rl-phone-line" style={{ width: '54%' }} />
            <span className="rl-phone-line" style={{ width: '86%' }} />
            <span className="rl-phone-line" style={{ width: '40%' }} />
          </div>
          <div className="rl-phone-hit" data-unknown={label ? 'false' : 'true'}>
            {label ?? 'Button not named'}
          </div>
        </div>
      </div>
      <figcaption className="rl-caption">Schematic, not a screenshot</figcaption>
    </figure>
  );
}

function WhereTab({ where }: { where: WhereModel }) {
  return (
    <div className="rl-where-grid">
      <PhoneSchematic where={where} />
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="bs-eyebrow">The button they pressed</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{where.control?.label ?? where.action?.label ?? 'Not named by the event'}</div>
        <Facts
          rows={[
            ['Page', <>{where.pageName} · <Link className="bs-link bs-mono" href={clubhouseHref.page(where.page)}>{where.page}</Link></>],
            ['Control', where.control ? <Link className="bs-link bs-mono" href={clubhouseHref.control(where.control.id)}>{where.control.id}</Link> : '—'],
            ['Action', where.action ? <Link className="bs-link bs-mono" href={clubhouseHref.action(where.action.id)}>{where.action.id}</Link> : '—'],
            ['Code in', where.files.length ? <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{where.files.map((f) => <FileLink key={f} path={f} />)}</span> : '—'],
            ['Tables', where.tables.length ? <span className="bs-mono">{where.tables.join(', ')}</span> : '—'],
            ['Docs', where.docs.length ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>{where.docs.map((d) => <a key={d.path} className="bs-link" href={githubBlobUrl(d.path, liveRef())} target="_blank" rel="noreferrer">{d.name}</a>)}</span> : '—'],
          ]}
        />
        {where.gap ? (
          <p className="rl-gap" style={{ margin: 0 }}>
            {where.gap} Not linked in the Bridge map yet (shows on <Link className="bs-link" href={clubhouseHref.drift()}>Drift</Link>).
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TrailTab({ trail, item }: { trail: DetailProps['trail']; item: FeedItem }) {
  if (trail.state !== 'ok') {
    return <p className="rl-note">{trail.state === 'no-signal' ? 'The session timeline is not there yet.' : 'The session timeline could not be read.'}</p>;
  }
  if (!trail.lines.length) {
    return item.trail?.length ? (
      <>
        <p className="rl-note">The timeline is empty, but the failure carried its last steps:</p>
        <ol className="rl-steps">{item.trail.map((t, i) => <li key={i}>{t}</li>)}</ol>
      </>
    ) : (
      <p className="rl-note">No steps were kept for this session.</p>
    );
  }
  return (
    <>
      <ol className="rl-trail">
        {trail.lines.map((l) => (
          <li key={l.seq} aria-current={l.current ? 'true' : undefined}>
            <span className="rl-time bs-mono">
              <LocalTime iso={l.at} variant="time" />
            </span>
            <span className={`bs-dot bs-tone-${l.tone}`} aria-hidden="true" />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{l.text}</span>
            <span className={`rl-trail-detail ${l.tone === 'bad' ? 'bs-tone-bad' : ''}`}>{l.detail ?? ''}</span>
          </li>
        ))}
      </ol>
      <p className="rl-note" style={{ margin: 0 }}>
        Switch times show once the app sends them; a page opened from code carries none.{trail.truncated ? ' The session is long, so only the steps around the failure are shown.' : ''}
      </p>
    </>
  );
}

function ServerTab({ item, sameServer, tables }: { item: FeedItem; sameServer: DetailProps['sameServer']; tables: string[] }) {
  const { words, known, meaning } = serverCodeWords(item.serverCode);
  return (
    <>
      <div className="rl-server">
        <div className="bs-eyebrow">What the server answered</div>
        {item.serverCode ? (
          <>
            <div className="rl-server-code">
              {serverSource(item.serverCode)} {item.serverCode}
            </div>
            <p>
              <b>{words}.</b> {meaning ?? (known ? '' : 'This code has no plain-words entry yet.')}
            </p>
          </>
        ) : (
          <p style={{ marginTop: 8 }}>No server code came back with this failure: it failed in the app, or the server did not say why.</p>
        )}
        {item.message ? (
          <>
            <div className="bs-eyebrow" style={{ marginTop: 12 }}>The message, as sent</div>
            <p className="bs-mono" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>
              {item.message}
            </p>
          </>
        ) : null}
      </div>
      <Facts
        rows={[
          ['Tables', tables.length ? <span className="bs-mono">{tables.join(', ')} <span className="bs-tone-muted">(from the Bridge map)</span></span> : '—'],
          ['Same answer', sameServer && item.serverCode ? `${sameServer.same} of ${sameServer.of} ${item.catalogCode ?? ''} failures in this window` : '—'],
        ]}
      />
      {item.serverCode ? (
        <Link className="bs-link" href={`/admin/spaces/reliability/speed`}>
          Database errors and slow pages
        </Link>
      ) : null}
    </>
  );
}

export function ErrorDetail(p: DetailProps) {
  const { item, scope } = p;
  const id = item.bridgeId;
  const why = noteBlocker(p.graph, id);
  const tabHref = (tab: (typeof DETAIL_TABS)[number]) => feedHref(scope, { e: { sessionId: item.sessionId, seq: item.seq }, tab }, 'detail');
  return (
    <section className="bs-panel rl-detail" id="detail" aria-label="The selected error">
      <div className="rl-detail-head">
        <div className="rl-detail-meta">
          {item.role ? <RoleBadge role={item.role} /> : <Pill tone="muted">Role unknown</Pill>}
          {item.code ? <span className="bs-chip">{item.code}</span> : null}
          {id !== null ? <span className="bs-mono bs-tone-muted">Bridge ID {id}</span> : null}
          {item.state ? <Pill tone={STATE_TONE[item.state]}>{STATE_WORDS[item.state]}</Pill> : null}
        </div>
        <h2 className="rl-detail-title">{itemHeadlineQuoted(item) ? <q>{itemHeadline(item)}</q> : itemHeadline(item)}</h2>
        <p className="bs-panel-note" style={{ margin: 0 }}>
          <LocalTime iso={item.at} variant="datetime" /> · {item.pageName}
          {item.controlLabel ? ` › ${item.controlLabel}` : ''} · {item.teamName ?? 'no team name'}
          {p.outsideWindow ? ' · outside this window, so the counts below are for it alone' : ''}
        </p>
        <Explain item={item} fix={p.fix} />
        <LinkTabs
          label="Detail"
          current={scope.tab}
          tabs={DETAIL_TABS.map((t) => ({ key: t, label: DETAIL_TAB_LABEL[t], href: tabHref(t), br: BR.feed.detailTab }))}
        />
      </div>
      <div className="rl-detail-body">
        {scope.tab === 'where' ? <WhereTab where={p.where} /> : null}
        {scope.tab === 'trail' ? <TrailTab trail={p.trail} item={item} /> : null}
        {scope.tab === 'counts' ? (
          <>
            <ol className="rl-steps">
              {p.counts.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <Link className="bs-link" href="/admin/spaces/reliability/rules">
              All the counting rules
            </Link>
          </>
        ) : null}
        {scope.tab === 'server' ? <ServerTab item={item} sameServer={p.sameServer} tables={p.where.tables} /> : null}

        <div className="rl-actions">
          {id !== null ? (
            <Link className="bs-button bs-button-primary" href={clubhouseHref.code(id)} data-br={BR.feed.openStory}>
              Open the full story
            </Link>
          ) : (
            <span className="bs-button" aria-disabled="true" data-br={BR.feed.openStory} title={why}>
              Open the full story
            </span>
          )}
          <div className="rl-actions-row">
            <span data-br={BR.feed.watch}>
              {p.noteControls.watch}
            </span>
            {id !== null ? (
              <Link className="bs-button" href={clubhouseHref.duet(String(id))} data-br={BR.feed.fixPack} prefetch={false}>
                Fix pack
              </Link>
            ) : (
              <span className="bs-button" aria-disabled="true" data-br={BR.feed.fixPack} title={why}>
                Fix pack
              </span>
            )}
            <Link className="bs-button" href={liveHref.session(item.sessionId)} data-br={BR.feed.replay}>
              Replay session
            </Link>
          </div>
          <div data-br={BR.feed.expected}>
            {p.noteControls.expected}
          </div>
          <p className="rl-note" style={{ margin: 0 }}>
            Watch and Mark expected save on the code&apos;s own page and open it, where the change shows. Fix pack opens the Duet desk with the pack built for this code.
          </p>
        </div>
      </div>
    </section>
  );
}
