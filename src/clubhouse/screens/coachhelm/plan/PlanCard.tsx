'use client';

import { CH_DESK_QUERY } from '@/clubhouse/lib/phone-query';
import { Button } from '../../../ui/Button';

import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, FolderClosed, Minus, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { safeSave } from './safe-save';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flyPageToFolder, squashFolder } from '../chat/ask-flight';
import { plural } from '../../../lib/plural';
import { useChPhone } from '../../../lib/use-phone';
import { type DrillRef, type PlanBlock, type PlanDraft } from '@/lib/coachhelm/v3/practice-plan/model';
import { listPlanFolders, savePracticePlanDraft, undoPracticePlanDraft } from '@/app/golf/actions/coachhelm-practice-plans';
import { forgetSavedPlan, publishRequest, rememberSavedPlan, savedPlanFor, type SavedPlanRef } from './saved-plans';
import { FormSheet } from '../../../ui/FormSheet';
import { Icon } from '../../../ui/Icon';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { PracticePlanSheet } from './sheet/PracticePlanSheet';
import { toSheetModel } from './sheet/plan-sheet-model';
import { useUndoWindow } from './useUndoWindow';

export type DrillKind = 'skill' | 'random' | 'pressure';
export interface PlanAlternative {
  ref: string;
  name: string;
  kind: DrillKind;
  min: number;
  line: string;
}
export interface PlanEvidence {
  label: string;
  line: string;
  rows: Array<{ label: string; value: string; pct?: number; tour?: number | null }>;
}
export interface PlanPartData {
  version: number;
  eventId: string | null;
  title: string;
  draft: PlanDraft;
  /** Both flags on, read on the server when the card was written. Off: Save and Publish are inert and make no network call. */
  saveOn?: boolean;
  /** "Thu, Nov 5 · 2:00 to 5:00 PM". */
  when?: string;
  /** "14:00", so each block can print its clock time. */
  start?: string;
  /** Names and kinds from this turn's bank read, by drill ref. */
  drills?: Record<string, { name: string; kind: DrillKind }>;
  /** Up to three swaps from the bank, by block or station id. */
  alternatives?: Record<string, PlanAlternative[]>;
  /** The figures behind a source chip, from this turn's reads, by source ref. */
  evidence?: Record<string, PlanEvidence>;
  sources?: Record<string, Array<{ ref: string; label: string }>>;
  /** What the full plan prints: the team, the practice's window and who's on it. Absent, the sheet starts at the plan's own clock. */
  sheet?: { team: string; start: string; end: string | null; zone: string; coaches: string[]; names: Record<string, string> };
}

/** What a preview hands the card, in place of a tap or a signed-in read. */
export interface PlanCardPreview {
  phase?: 'writing' | 'ready' | 'saving' | 'saved' | 'failed' | 'undone';
  writingAt?: number;
  menu?: 'open' | 'new';
  sheet?: { kind: 'block'; id: string } | { kind: 'swap'; id: string } | { kind: 'evidence'; ref: string };
  full?: boolean;
  swapped?: boolean;
  folders?: Array<{ name: string; count: number }>;
  stepsOpen?: boolean;
}

/** The preview's stand-in for taps and reads; the live thread has no provider. */
export const PlanPreview = createContext<PlanCardPreview | null>(null);
/** Every plan written in this conversation, oldest first: a redraft is the same plan's next version (S-ASKD). */
export const PlanVersions = createContext<readonly PlanPartData[]>([]);
const planKey = (p: PlanPartData) => p.eventId ?? p.title;
const blockSig = (b: PlanBlock) => JSON.stringify({ ...b, id: undefined });
/** The blocks this version changed from the one before: new, or different in any field. */
function changedBlocks(before: PlanPartData | undefined, now: PlanPartData): string[] {
  if (!before) return [];
  const old = new Map(before.draft.body.variants.main.blocks.map((b) => [b.id, blockSig(b)]));
  return now.draft.body.variants.main.blocks.filter((b) => old.get(b.id) !== blockSig(b)).map((b) => b.id);
}

const DEFAULT = 'Practice plans';
const FIELD_MAX = 60;
const NO_CLAIM = 'Routine. No claim.';
const REFINE = ['Make it 2 hours', 'More pressure', 'Lighter before Hargrove'];
const keyOf = (d: DrillRef | null | undefined) => (d ? `${d.src}:${d.id}` : '');
const clock = (start: string | undefined, plus: number) => {
  if (!start) return null;
  const [h, m] = start.split(':').map(Number);
  const t = (h ?? 0) * 60 + (m ?? 0) + plus;
  return `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, '0')}`;
};
const placeOf = (b: PlanBlock) => ('place' in b ? b.place : '');
const subOf = (b: PlanBlock, n: number) => {
  if (b.kind === 'stations') return [b.stations[0]?.place, n ? `groups move every ${b.turnMin} min` : null].filter(Boolean).join(' · ');
  if (b.kind === 'course') return [`Holes ${b.holeFrom} to ${b.holeTo}`, b.format === 'stroke' ? 'stroke play' : b.format.replace('_', ' ')].join(' · ');
  return [placeOf(b), b.kind === 'team' ? 'everyone' : null].filter(Boolean).join(' · ');
};
const blockKind = (b: PlanBlock, drills: PlanPartData['drills']): DrillKind | null => (b.kind === 'team' ? (drills?.[keyOf(b.drill)]?.kind ?? null) : null);
const kindLabel = { skill: 'Skill', random: 'Random', pressure: 'Pressure' } as const;

function KindChip({ kind }: { kind: DrillKind | null | undefined }) {
  return kind ? <span className={`kind k-${kind}`}>{kindLabel[kind]}</span> : null;
}

/** The plan in Ask: writes itself block by block, a Why under every block, Save to, Save draft and Publish. Coach only: never imported by a player surface. */
export function PlanCard({ plan, onSend, fresh = false }: { plan: PlanPartData; onSend: (text: string) => void; fresh?: boolean }) {
  const preview = useContext(PlanPreview);
  const router = useRouter();
  const reduced = useChReducedMotion();
  const saveOn = !!plan.saveOn;
  const artRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(plan.draft);
  const versions = useContext(PlanVersions).filter((p) => planKey(p) === planKey(plan));
  const own = Math.max(0, versions.indexOf(plan));
  const redrafted = changedBlocks(versions[own - 1], plan);
  const [viewing, setViewing] = useState<number | null>(null);
  const shownVersion = viewing == null || viewing === own ? null : (versions[viewing] ?? null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set([...(preview?.swapped ? [Object.keys(plan.alternatives ?? {})[0] ?? ''] : []), ...redrafted]));
  const blocks = draft.body.variants.main.blocks;
  const total = blocks.reduce((s, b) => s + b.len, 0);
  const [folders, setFolders] = useState<Array<{ name: string; count: number }>>(preview?.folders ?? []);
  const [folder, setFolder] = useState(DEFAULT);
  const [menu, setMenu] = useState(preview?.menu === 'open' || preview?.menu === 'new');
  const [naming, setNaming] = useState(preview?.menu === 'new');
  const [name, setName] = useState('');
  const [state, setState] = useState<{ k: 'draft' | 'saving' | 'undone' } | { k: 'failed' } | { k: 'saved'; planId: string; version: number; created: boolean; savedAt: string; until: string; folder: string }>(() =>
    preview?.phase === 'saving' ? { k: 'saving' } : preview?.phase === 'saved' ? { k: 'saved', planId: 'preview', version: 1, created: true, savedAt: '', until: new Date(Date.now() + 8000).toISOString(), folder: preview.menu ? 'Hargrove week' : DEFAULT } : preview?.phase === 'failed' ? { k: 'failed' } : preview?.phase === 'undone' ? { k: 'undone' } : { k: 'draft' },
  );
  const [error, setError] = useState<string | null>(preview?.phase === 'failed' ? 'Your draft is still here. Try again.' : null);
  const [sheet, setSheet] = useState(preview?.sheet ?? null);
  const phone = useChPhone();
  // Set after mount: it portals, and the first paint must match the server's.
  const [full, setFull] = useState(false);
  const [ask, setAsk] = useState('');
  // The card writes itself once: a card that isn't new shows whole, as does Reduce Motion.
  const [shown, setShown] = useState(() => (preview?.phase === 'writing' ? (preview.writingAt ?? 1) : fresh && !reduced ? 0 : blocks.length));
  const writing = shown < blocks.length;
  useEffect(() => {
    if (!writing || preview) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown ? 640 : 500);
    return () => clearTimeout(t);
  }, [writing, shown, preview]);
  useEffect(() => {
    if (saveOn && !preview) void listPlanFolders().then((r) => setFolders(r.folders));
  }, [saveOn, preview]);
  const undoOpen = useUndoWindow(state.k === 'saved' ? state.until : null);
  const clean = name.trim();
  const dupe = naming && folders.some((f) => f.name.toLowerCase() === clean.toLowerCase());
  const reserved = naming && clean.toLowerCase() === 'team';
  const mix = useMemo(() => {
    const m: Record<DrillKind, number> = { skill: 0, random: 0, pressure: 0 };
    for (const b of blocks) {
      if (b.kind === 'team') {
        const k = plan.drills?.[keyOf(b.drill)]?.kind;
        if (k) m[k] += b.len;
      }
      if (b.kind === 'stations') for (const s of b.stations) {
        const k = plan.drills?.[keyOf(s.drill)]?.kind;
        if (k) m[k] += b.stations.length ? b.len / b.stations.length : 0;
      }
    }
    return m;
  }, [blocks, plan.drills]);
  const mixTotal = mix.skill + mix.random + mix.pressure;
  const [undoing, setUndoing] = useState(false);
  const save = async (): Promise<SavedPlanRef | null> => {
    setState({ k: 'saving' });
    if (preview) return null;
    // The stored version from the last save of this plan, and null for a plan not saved yet. `draft.version` counts this card's edits: the database has never seen it.
    const target = savedPlanFor(planKey(plan));
    const res = await safeSave(() => savePracticePlanDraft({ eventId: plan.eventId, planId: target?.planId ?? null, version: target?.version ?? null, title: plan.title, draft, folder }));
    if (!res.success) {
      setError(res.error);
      setState({ k: 'failed' });
      return null;
    }
    setError(null);
    const saved = { planId: res.planId, version: res.version };
    rememberSavedPlan(planKey(plan), saved);
    // M-ASK-77 and 78: the page drops into its folder and the count ticks once, then the receipt. It's saved already, so a
    // flight that never settles (a hidden tab) can't hold the receipt back.
    const fold = stripRef.current?.querySelector<HTMLElement>('.fold.tg');
    if (fold && artRef.current) {
      const page = artRef.current;
      const landing = (async () => {
        await flyPageToFolder(page, fold, reduced).catch(() => {});
        setFolders((list) => (list.some((f) => f.name === folder) ? list.map((f) => (f.name === folder ? { ...f, count: f.count + 1 } : f)) : [...list, { name: folder, count: 1 }]));
        await squashFolder(fold, reduced).catch(() => {});
      })();
      await Promise.race([landing, new Promise((done) => window.setTimeout(done, 1500))]);
    }
    setState({ k: 'saved', planId: res.planId, version: res.version, created: res.created, savedAt: res.savedAt, until: new Date(Date.now() + 8000).toISOString(), folder });
    return saved;
  };
  /** Publish is of a saved plan: what's on the card is saved first, then the thread is told which plan and version. */
  const publish = async () => {
    if (preview) return onSend(`Publish the plan ${plan.title}`);
    if (state.k === 'saving') return;
    const saved = state.k === 'saved' ? { planId: state.planId, version: state.version } : await save();
    if (saved) onSend(publishRequest(plan.title, saved));
  };
  const setBlock = (id: string, next: (b: PlanBlock) => PlanBlock) => {
    setDraft((d) => ({ ...d, version: d.version + 1, body: { ...d.body, variants: { ...d.body.variants, main: { blocks: d.body.variants.main.blocks.map((b) => (b.id === id ? next(b) : b)) } } } }));
    setChanged((s) => new Set(s).add(id));
    // An edit after a save isn't saved: the card goes back to Save draft, and Publish saves it first.
    setState((s) => (s.k === 'saved' ? { k: 'draft' } : s));
  };
  const pickAlt = (slot: string, alt: PlanAlternative) => {
    const [src, id] = alt.ref.split(':');
    const ref: DrillRef | null = (src === 'team' || src === 'lib') && id ? { src, id } : null;
    const owner = blocks.find((b) => b.id === slot || (b.kind === 'stations' && b.stations.some((s) => s.id === slot)));
    if (owner) setBlock(owner.id, (b) => (b.kind === 'team' ? { ...b, drill: ref } : b.kind === 'stations' ? { ...b, stations: b.stations.map((s) => (s.id === slot ? { ...s, drill: ref } : s)) } : b));
    setSheet(null);
  };
  const open = sheet?.kind === 'block' ? blocks.find((b) => b.id === sheet.id) : null;
  const slotAlts = sheet?.kind === 'swap' ? (plan.alternatives?.[sheet.id] ?? []) : [];
  const evidence = sheet?.kind === 'evidence' ? plan.evidence?.[sheet.ref] : null;
  const sendAsk = (prefix: string) => {
    if (!ask.trim()) return;
    onSend(`${prefix}: ${ask.trim()}`);
    setAsk('');
    setSheet(null);
  };
  // S-ASKD.pane: on a Mac the plan opens beside the thread once it has written, and the card in the thread goes compact.
  const writingNow = !!writing;
  // Only as this plan finishes writing: a chat reopened with plans in it doesn't open a pane for each one.
  const wasWriting = useRef(writingNow);
  useEffect(() => {
    if (preview?.full || (wasWriting.current && !writingNow && window.matchMedia(CH_DESK_QUERY).matches)) setFull(true);
    wasWriting.current = writingNow;
  }, [preview?.full, writingNow]);
  const swapSlot =
    sheet?.kind === 'swap'
      ? blocks.flatMap((b) => (b.kind === 'stations' ? b.stations.map((s, i) => ({ id: s.id, head: `Station ${i + 1}`, drill: s.drill })) : b.kind === 'team' ? [{ id: b.id, head: b.title, drill: b.drill }] : [])).find((s) => s.id === sheet.id)
      : null;
  let at = 0;
  return (
    <div className={'ch-cpv' + (phone ? '' : ' is-desk')} data-ch="plan-card">
      <section ref={artRef} className="art">
        <header className="art-h">
          <span className="tile">
            <Icon icon={ClipboardList} size={18} />
          </span>
          <div className="hd">
            <span className="t">{redrafted.length ? `Changed ${plural(redrafted.length, 'block')}` : plan.title}</span>
            <span className="m">{['Draft', redrafted.length ? plan.title : plan.when].filter(Boolean).join(' · ')}</span>
          </div>
          {!writing && (
            <Button variant="secondary" size="sm" onClick={() => setFull(true)}>
              Open
            </Button>
          )}
        </header>
        <div className="strip" aria-hidden="true">
          {blocks.slice(0, shown).map((b) => (
            <i key={b.id} className={`seg-${blockKind(b, plan.drills) ?? (b.kind === 'stations' ? 'skill' : b.kind === 'course' ? 'random' : 'plain')}`} style={{ flexGrow: b.len }} />
          ))}
        </div>
        <div className="blocks">
          {blocks.map((b, i) => {
            const from = at;
            at += b.len;
            if (i > shown) {
              return (
                <div className="blk skel" key={b.id} aria-hidden="true">
                  <div className="tm">
                    <i className="sb" />
                    <i className="sb short" />
                  </div>
                  <div>
                    <i className="sb wide" />
                    <i className="sb" />
                  </div>
                </div>
              );
            }
            if (i === shown) {
              return (
                <div className="blk wh" key={b.id} aria-hidden="true">
                  <div className="tm ch-num">{clock(plan.start, from)}</div>
                  <div>
                    <span className="bt">
                      {b.title.slice(0, 5)}
                      <span className="caret" />
                    </span>
                  </div>
                </div>
              );
            }
            const why = draft.why[b.id];
            const src = plan.sources?.[b.id] ?? why?.sources ?? [];
            return (
              <div className="blk" key={b.id} role="button" tabIndex={0} onClick={() => setSheet({ kind: 'block', id: b.id })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet({ kind: 'block', id: b.id }); } }}>
                <div className="tm ch-num">
                  {clock(plan.start, from)}
                  <span>{b.len} min</span>
                </div>
                <div>
                  <div className="bt">
                    <span className="btt">{b.title}</span>
                    {b.kind !== 'stations' && <KindChip kind={blockKind(b, plan.drills)} />}
                    {changed.has(b.id) && <span className="changed">Changed</span>}
                  </div>
                  {subOf(b, 1) && <div className="bs">{subOf(b, 1)}</div>}
                  {b.kind === 'stations' && (
                    <div className="sl">
                      {b.stations.map((s, si) => {
                        const g = b.grid?.[0]?.[si] || b.groupIds[si] || '';
                        const d = plan.drills?.[keyOf(s.drill)];
                        return (
                          <div className="sline" key={s.id}>
                            {g && <i className={`gd g-${g}`}>{g}</i>}
                            <span className="dn">{d?.name ?? s.note ?? s.place}</span>
                            <KindChip kind={d?.kind} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {why?.routine || !why ? (
                    <div className="rout">
                      {b.note || NO_CLAIM}
                      {src[0] && (
                        <span className="src">
                          <button type="button" className="srcb" onClick={(e) => { e.stopPropagation(); setSheet({ kind: 'evidence', ref: src[0]!.ref }); }}>
                            {src[0].label}
                          </button>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="why">
                      {why.aim && (
                        <div>
                          <b>Aim</b> {why.aim}
                        </div>
                      )}
                      <div>{why.lean ? 'Lean read' : <><b>Because</b> {why.because}</>}</div>
                      {src.length > 0 && (
                        <div className="src">
                          {src.map((x) => (
                            <button type="button" className="srcb" key={x.ref} onClick={(e) => { e.stopPropagation(); setSheet({ kind: 'evidence', ref: x.ref }); }}>
                              {x.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {writing ? (
          <div className="building">
            <span className="bl">{shown + 1 < blocks.length ? `Writing block ${shown + 1} of ${blocks.length}` : 'Checking every why against the data'}</span>
            <span className="bar">
              <i style={{ transform: `scaleX(${shown / blocks.length})` }} />
            </span>
          </div>
        ) : (
          <div className="foot">
            {mixTotal > 0 && (
              <div className="mixw">
                <div className="mix" aria-hidden="true">
                  {(['skill', 'random', 'pressure'] as const).map((k) => mix[k] > 0 && <i key={k} className={`seg-${k}`} style={{ flexGrow: mix[k] }} />)}
                </div>
                <div className="mixleg">
                  {(['skill', 'random', 'pressure'] as const).map((k) => mix[k] > 0 && (
                    <span key={k} className={`lg-${k}`}>
                      {kindLabel[k]} {Math.round(mix[k])} min
                    </span>
                  ))}
                  <span>{total >= 60 ? `${Math.round((total / 60) * 10) / 10} h` : `${total} min`}</span>
                </div>
              </div>
            )}
            {state.k === 'undone' ? (
              <p className="inert">Removed. Nothing was saved.</p>
            ) : !saveOn ? null : state.k === 'saved' ? (
              <div className="savedw">
                <div className="saved" role="status">
                  <span className="okc">
                    <Icon icon={Check} size={13} />
                  </span>
                  <span>
                    <b>Plan saved · Documents · {state.folder}</b>
                    Only coaches can see it. Players are told when you publish.
                  </span>
                  <span className="links">
                    <button type="button" onClick={() => router.push(`/golf/dashboard/practice/plan/${state.planId}?from=coachhelm`)}>
                      Open
                    </button>
                    {undoOpen && (
                      <button
                        type="button"
                        disabled={undoing}
                        onClick={() => {
                          if (preview) return setState({ k: 'undone' });
                          setUndoing(true);
                          void safeSave(() => undoPracticePlanDraft({ planId: state.planId, created: state.created, savedAt: state.savedAt }))
                            .then((r) => {
                              if (!r.success) return setError('Too late to undo. It’s saved.');
                              forgetSavedPlan(planKey(plan));
                              setState({ k: 'undone' });
                            })
                            .finally(() => setUndoing(false));
                        }}
                      >
                        Undo
                      </button>
                    )}
                  </span>
                </div>
                {error && <p className="inert is-fail">{error}</p>}
                <Button variant="primary" size="lg" className="is-wide" onClick={() => void publish()}>
                  Publish…
                </Button>
              </div>
            ) : (
              <>
                <button type="button" className={'saverow' + (menu ? ' open' : '')} aria-expanded={menu} onClick={() => setMenu((v) => !v)} disabled={state.k === 'saving'}>
                  <Icon icon={FolderClosed} size={18} className="fi" />
                  <span>
                    Save to <b>{folder}</b>
                  </span>
                  <Icon icon={ChevronDown} size={14} className="chev" />
                </button>
                {menu && (
                  <div className="flist" role="menu" aria-label="Folders">
                    {[{ name: DEFAULT, count: folders.find((f) => f.name === DEFAULT)?.count ?? 0 }, ...folders.filter((f) => f.name !== DEFAULT)].map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        role="menuitemradio"
                        aria-checked={folder === f.name}
                        className={'fr' + (folder === f.name ? ' on' : '')}
                        onClick={() => {
                          setFolder(f.name);
                          setMenu(false);
                        }}
                      >
                        <Icon icon={FolderClosed} size={18} className="fi" />
                        <span className="n">{f.name}</span>
                        <span className="c ch-num">{f.count}</span>
                        <span className="tk">
                          <Icon icon={Check} size={16} />
                        </span>
                      </button>
                    ))}
                    {naming ? (
                      <form
                        className="fr nw"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!clean || dupe || reserved) return;
                          setFolders((l) => [{ name: clean, count: 0 }, ...l]);
                          setFolder(clean);
                          setName('');
                          setNaming(false);
                          setMenu(false);
                        }}
                      >
                        <Icon icon={FolderClosed} size={18} className="fi" />
                        <input className="inp" ref={(el) => el?.focus()} aria-label="Folder name" maxLength={FIELD_MAX} value={name} placeholder="Folder name" onChange={(e) => setName(e.target.value)} />
                        <Button variant="secondary" size="sm" type="submit" disabled={!clean || dupe || reserved}>
                          Create
                        </Button>
                        {clean && (dupe || reserved) && <p className="inert is-fail">{reserved ? '“Team” is the team’s own folder.' : 'You already have that folder.'}</p>}
                      </form>
                    ) : (
                      <button type="button" className="fr nw" onClick={() => setNaming(true)}>
                        <Icon icon={FolderClosed} size={18} className="fi" />
                        <span className="n">New folder</span>
                      </button>
                    )}
                  </div>
                )}
                {state.k === 'failed' && error && (
                  <p className="inert is-fail" role="alert">
                    {error}
                  </p>
                )}
                {state.k === 'saving' ? (
                  <div className="cap">
                    <span>Saving…</span>
                    <i className="sw2" />
                  </div>
                ) : (
                  <div className="acts">
                    <Button variant="secondary" onClick={() => void save()}>
                      {state.k === 'failed' ? 'Try again' : 'Save draft'}
                    </Button>
                    <Button variant="primary" onClick={() => void publish()}>
                      Publish…
                    </Button>
                  </div>
                )}
                {state.k === 'saving' && (
                  <div ref={stripRef} className="dstrip" aria-hidden="true">
                    {[{ name: folder, count: folders.find((f) => f.name === folder)?.count ?? 0 }, ...folders.filter((f) => f.name !== folder).slice(0, 2)].map((f, i) => (
                      <div key={f.name} className={'fold' + (i === 0 ? ' tg' : '')}>
                        <Icon icon={FolderClosed} size={24} />
                        <b>{f.name}</b>
                        <span className="cnt ch-num">{plural(f.count, 'plan')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
      {!writing && (
        <div className="refine" role="group" aria-label="Change the plan">
          {REFINE.map((r) => (
            <button type="button" key={r} onClick={() => onSend(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
      <FormSheet open={!!open} onClose={() => setSheet(null)} title={open?.title.split(':')[0] ?? ''} actionLabel="Done" onAction={() => setSheet(null)}>
        {open && (
          <div className="ch-cpv ch-cpv-sheet">
            <div className="grp">
              <div className="field-row">
                <span>Length</span>
                {open.kind === 'stations' ? (
                  <span className="v ch-num">{open.len} min</span>
                ) : (
                  <span className="stepper">
                    <button type="button" aria-label="Shorter" disabled={open.len <= 5} onClick={() => setBlock(open.id, (b) => ({ ...b, len: Math.max(5, b.len - 5) }) as PlanBlock)}>
                      <Icon icon={Minus} size={14} />
                    </button>
                    <span className="len ch-num">{open.len} min</span>
                    <button type="button" aria-label="Longer" disabled={open.len >= 360} onClick={() => setBlock(open.id, (b) => ({ ...b, len: Math.min(360, b.len + 5) }) as PlanBlock)}>
                      <Icon icon={Plus} size={14} />
                    </button>
                  </span>
                )}
              </div>
              {placeOf(open) && (
                <div className="field-row">
                  <span>Place</span>
                  <span className="v">{placeOf(open)}</span>
                </div>
              )}
              {open.coach && (
                <div className="field-row">
                  <span>Coach</span>
                  <span className="v">{open.coach}</span>
                </div>
              )}
              {open.kind === 'team' && (
                <div className="field-row">
                  <span>Drill</span>
                  {plan.alternatives?.[open.id]?.length ? (
                    <button type="button" className="v is-link" onClick={() => setSheet({ kind: 'swap', id: open.id })}>
                      {plan.drills?.[keyOf(open.drill)]?.name ?? 'Swap'} ›
                    </button>
                  ) : (
                    <span className="v">{plan.drills?.[keyOf(open.drill)]?.name ?? 'None'}</span>
                  )}
                </div>
              )}
              {open.kind === 'stations' &&
                open.stations.map((s) => (
                  <div className="field-row" key={s.id}>
                    <span>{s.place}</span>
                    {plan.alternatives?.[s.id]?.length ? (
                      <button type="button" className="v is-link" onClick={() => setSheet({ kind: 'swap', id: s.id })}>
                        {plan.drills?.[keyOf(s.drill)]?.name ?? 'Swap'} ›
                      </button>
                    ) : (
                      <span className="v">{plan.drills?.[keyOf(s.drill)]?.name ?? s.note}</span>
                    )}
                  </div>
                ))}
            </div>
            {draft.why[open.id] && !draft.why[open.id]!.routine && (
              <div className="why">
                {draft.why[open.id]!.aim && (
                  <div>
                    <b>Aim</b> {draft.why[open.id]!.aim}
                  </div>
                )}
                <div>{draft.why[open.id]!.lean ? 'Lean read' : <><b>Because</b> {draft.why[open.id]!.because}</>}</div>
              </div>
            )}
            <form
              className="ask-in"
              onSubmit={(e) => {
                e.preventDefault();
                sendAsk(open.title);
              }}
            >
              <input aria-label="Ask about this block" placeholder="Ask about this block" value={ask} onChange={(e) => setAsk(e.target.value)} />
              <button type="submit" aria-label="Send" disabled={!ask.trim()}>
                <Icon icon={ArrowUp} size={18} />
              </button>
            </form>
          </div>
        )}
      </FormSheet>
      <FormSheet open={sheet?.kind === 'swap'} onClose={() => setSheet(null)} title="Swap drill" actionLabel="Done" onAction={() => setSheet(null)}>
        <div className="ch-cpv ch-cpv-sheet">
          {swapSlot && (
            <div className="grp is-pad">
              <b>{swapSlot.head}</b>
              <span>{plan.drills?.[keyOf(swapSlot.drill)]?.name ?? 'No drill yet'}</span>
            </div>
          )}
          {slotAlts.length === 0 ? (
            <div className="grp is-pad">Nothing in your bank fits this one.</div>
          ) : (
            <div className="grp">
              {slotAlts.map((a) => (
                <div className="alt" key={a.ref}>
                  <span className="n">
                    {a.name}
                    <KindChip kind={a.kind} />
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => pickAlt(sheet?.kind === 'swap' ? sheet.id : '', a)}>
                    Use
                  </Button>
                  <span className="d">
                    <span className="ch-num">{a.min} min</span> · {a.line}
                  </span>
                </div>
              ))}
            </div>
          )}
          <form
            className="ask-in"
            onSubmit={(e) => {
              e.preventDefault();
              sendAsk('This station');
            }}
          >
            <input aria-label="Ask about this station" placeholder="Ask about this station" value={ask} onChange={(e) => setAsk(e.target.value)} />
            <button type="submit" aria-label="Send" disabled={!ask.trim()}>
              <Icon icon={ArrowUp} size={18} />
            </button>
          </form>
        </div>
      </FormSheet>
      <FormSheet open={sheet?.kind === 'evidence'} onClose={() => setSheet(null)} title="Evidence" actionLabel="Done" onAction={() => setSheet(null)}>
        <div className="ch-cpv ch-cpv-sheet">
          <div className="grp is-pad">
            {evidence ? (
              <>
                <b>{evidence.label}</b>
                <span>{evidence.line}</span>
                <div className="evrows">
                  {evidence.rows.map((r) => (
                    <div className="evr" key={r.label}>
                      <span>{r.label}</span>
                      {r.pct != null && (
                        <span className="tr">
                          <i className={'m' + (r.tour != null && r.tour - r.pct > 8 ? ' is-gap' : '')} style={{ width: `${r.pct}%` }} />
                          {r.tour != null && <i className="t" style={{ left: `${r.tour}%` }} />}
                        </span>
                      )}
                      <span className="ch-num">{r.value}</span>
                    </div>
                  ))}
                </div>
                {evidence.rows.some((r) => r.pct != null && r.tour != null) && <small className="evkey">Bar: team make rate. Tick: Tour line. Amber where the gap is over 8 points.</small>}
              </>
            ) : (
              <span>That read isn’t in this conversation any more.</span>
            )}
          </div>
        </div>
      </FormSheet>
      {full && createPortal(
        <div className="ch-cpv-full" role="dialog" aria-modal="true" aria-label={plan.title}>
          <div className="fbar">
            <button type="button" className="back" aria-label={phone ? undefined : 'Close the plan'} onClick={() => setFull(false)}>
              <Icon icon={phone ? ChevronLeft : X} size={18} />
              {phone && 'Ask'}
            </button>
            <b>{plan.title}</b>
            {!phone && versions.length > 0 && (
              <span className="vsw">
                <button type="button" aria-label="Earlier version" disabled={(viewing ?? own) <= 0} onClick={() => setViewing((viewing ?? own) - 1)}>
                  <Icon icon={ChevronLeft} size={14} />
                </button>
                <span className="vl ch-num">{(viewing ?? own) + 1} of {versions.length}</span>
                <button type="button" aria-label="Later version" disabled={(viewing ?? own) >= versions.length - 1} onClick={() => setViewing((viewing ?? own) + 1)}>
                  <Icon icon={ChevronRight} size={14} />
                </button>
              </span>
            )}
          </div>
          <div className="fbody">
            <PracticePlanSheet
              plan={toSheetModel(
                {
                  body: shownVersion?.draft.body ?? draft.body,
                  why: shownVersion?.draft.why ?? draft.why,
                  title: plan.title,
                  team: plan.sheet?.team ?? '',
                  start: new Date(plan.sheet?.start ?? Date.now()),
                  end: plan.sheet?.end ? new Date(plan.sheet.end) : null,
                  zone: plan.sheet?.zone ?? 'UTC',
                  coaches: plan.sheet?.coaches ?? [],
                  names: new Map(Object.entries(plan.sheet?.names ?? {})),
                  state: 'Draft · Only coaches',
                },
                'coach',
              )}
            />
          </div>
          <div className="fdock">
            {state.k === 'saved' && (
              <Button variant="secondary" onClick={() => router.push(`/golf/dashboard/practice/plan/${state.planId}/edit`)}>
                Edit in builder
              </Button>
            )}
            {!phone && state.k !== 'saved' && (
              <Button variant="secondary" busy={state.k === 'saving'} onClick={() => void save()}>
                {state.k === 'saving' ? 'Saving…' : 'Save draft…'}
              </Button>
            )}
            <Button variant="primary" onClick={() => { setFull(false); void publish(); }}>
              Publish…
            </Button>
          </div>
        </div>,
        document.querySelector('.ch-root') ?? document.body,
      )}
    </div>
  );
}
