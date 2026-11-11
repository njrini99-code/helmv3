'use client';

import { ArrowDown, ArrowUp, ChevronRight, Copy, Flag, Coffee, LayoutGrid, Ellipsis, Plus, Printer, ShipWheel, Trash2, User, Users, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { updateGolfEvent } from '@/app/golf/actions/calendar-events';
import { deletePracticePlan } from '@/app/golf/actions/practice-plans';
import { publishPracticePlan } from '@/app/golf/actions/practice-publish';
import { changeLines, diffVersions, validatePlan, type PlanBlock, type PlanBodyV2, type PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';
import type { ChBankDrill, ChBuilderData } from '../../../data/practice-home-shape';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { formatWallClock, formatWith, isoDay } from '../../../lib/dates';
import { plural } from '../../../lib/plural';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { Button } from '../../../ui/Button';
import { ActionSheet } from '../../../ui/FormSheet';
import { PracticeSheet } from '../PracticeSheet';
import { wholeFacts } from '../facts';
import { Switch } from '../../../ui/Switch';
import { TimeField } from '../../../ui/TimeField';
import { Icon } from '../../../ui/Icon';
import { Menu, type MenuItem } from '../../../ui/Menu';
import { Modal } from '../../../ui/Modal';
import { BackLink } from '../../../ui/Section';
import { Segmented } from '../../../ui/Segmented';
import { useToast } from '../../../ui/Toast';
import type { PlanPartData } from '../../coachhelm/plan/PlanCard';
import { printPlan } from '../../coachhelm/plan/PrintPlan';
import { PracticePlanSheet } from '../../coachhelm/plan/sheet/PracticePlanSheet';
import { toSheetModel } from '../../coachhelm/plan/sheet/plan-sheet-model';
import { addBlock, addGroup, askWords, takeAskPicks, BLOCK_KINDS, blockDaySegs, blockSub, blocksOf, clockFor, drillSlots, fmtMinutes, ghostsFrom, keepGhost, keyOfDrill, makeBlock, moveBlock, movePlayer, patchBlock, refOf, removeBlock, removeGroup, ribbon, setSlotDrill, splitGroups, STEPS, totalOf, type BuilderStep, type DayKind, type Ghost } from './builder-model';
import { BankList, BlockFields, kindLabel, NewDrillSheet } from './Sheets';
import { restoredDraft, useAutosave } from './useAutosave';
import { DayLegend, DayStrip, type DaySeg } from '../DayStrip';

const HelperSession = lazy(() => import('./HelperSession'));

const KIND_ICON: Record<PlanBlock['kind'], LucideIcon> = { team: Users, stations: LayoutGrid, course: Flag, own: User, break: Coffee };
const GROUP_TONES = ['is-a', 'is-b', 'is-c', 'is-d', 'is-e', 'is-f'];

/** What a preview hands the builder in place of a tap or a run; the live builder has none. */
export interface BuilderPreview {
  ghosts?: PlanPartData;
  kept?: boolean;
  publish?: boolean;
  sheet?: 'block';
  stale?: boolean;
}

type HelperState = { k: 'idle' } | { k: 'running'; request: string } | { k: 'ghosts' } | { k: 'kept'; count: number; ids: string[] } | { k: 'dismissed' } | { k: 'failed'; line: string };

/**
 * The practice builder (S-PRC.bld-*, S-BLD.*, S-BLDD.*): Blocks, Groups, Drills and Review over one plan, saved as it changes. On a desk: a drill rail, the board and an
 * inspector with a CoachHelm tab; on a phone: one column with a sheet per block. CoachHelm's suggestions wait beside the plan as outlined drafts with Keep, Swap and Remove, and
 * nothing joins it until kept. Coach only: the route never hands this to a player.
 */
/** A publish waits this long with an Undo before anything is written or sent, as Ask's does. */
const PUBLISH_HOLD_MS = 8000;

const zonedClock = (iso: string, zone: string) => formatWith(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone });
const zonedDate = (iso: string, zone: string) => isoDay(iso, zone);

export function Builder({ data, autoFill = false, preview }: { data: ChBuilderData; autoFill?: boolean; preview?: BuilderPreview }) {
  const router = useRouter();
  const phone = useChPhone();
  const toast = useToast();
  const reduced = useChReducedMotion();
  const previewing = !!preview;
  const [title, setTitle] = useState(data.title);
  const [body, setBody] = useState<PlanBodyV2>(data.body);
  const [why, setWhy] = useState<Record<string, PlanWhy>>(data.why);
  const [step, setStep] = useState<BuilderStep>(data.step);
  const [selected, setSelected] = useState<string | null>(preview?.sheet === 'block' ? (blocksOf(data.body)[0]?.id ?? null) : null);
  const [slot, setSlot] = useState<string | null>(null);
  const [drills, setDrills] = useState<ChBankDrill[]>(data.drills);
  const [bankOpen, setBankOpen] = useState(false);
  const [newDrill, setNewDrill] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitN, setSplitN] = useState(3);
  const [confirm, setConfirm] = useState(!!preview?.publish);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [restored, setRestored] = useState(false);
  const [inspector, setInspector] = useState<'block' | 'coachhelm'>(data.helperOn && preview?.sheet !== 'block' ? 'coachhelm' : 'block');
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);

  const [helper, setHelper] = useState<HelperState>(preview?.ghosts ? (preview.kept ? { k: 'kept', count: blocksOf(preview.ghosts.draft.body).length, ids: blocksOf(preview.ghosts.draft.body).map((b) => b.id) } : { k: 'ghosts' }) : { k: 'idle' });
  const [plan, setPlan] = useState<PlanPartData | null>(preview?.ghosts && !preview.kept ? preview.ghosts : null);
  const [ghosts, setGhosts] = useState<Ghost[]>(() => (preview?.ghosts && !preview.kept ? ghostsFrom(preview.ghosts.draft) : []));
  const [swap, setSwap] = useState<Ghost | null>(null);
  const [keptIds, setKeptIds] = useState<string[]>([]);
  const [saidLine, setSaidLine] = useState<string | null>(null);

  const snapshot = useMemo(() => ({ title, step, body, why }), [title, step, body, why]);
  const save = useAutosave({ planId: data.planId, version: data.version, snapshot, folder: data.folder ?? undefined, preview: previewing });

  // An offline tab's edits come back when it returns (S-PRC.bld-save-status).
  useEffect(() => {
    if (previewing) return;
    const kept = restoredDraft(data.planId);
    if (!kept) return;
    setBody(kept.body);
    setWhy(kept.why);
    setTitle(kept.title);
    setRestored(true);
  }, [data.planId, previewing]);

  const blocks = blocksOf(body);
  const total = totalOf(body);
  const windowMin = data.end ? Math.round((Date.parse(data.end) - Date.parse(data.start)) / 60_000) : null;
  const rib = ribbon(total, windowMin);
  const kinds = useMemo(() => new Map(drills.map((d) => [d.ref, d.kind])), [drills]);
  const drillOf = useMemo(() => new Map(drills.map((d) => [d.ref, d])), [drills]);
  const names = useMemo(() => new Map(data.roster.map((p) => [p.id, p.name])), [data.roster]);
  const check = useMemo(() => validatePlan(body, { eventStart: new Date(data.start), eventEnd: data.end ? new Date(data.end) : undefined, zone: data.zone, names }), [body, data.start, data.end, data.zone, names]);
  const slots = useMemo(() => drillSlots(body), [body]);
  const activeBlock = blocks.find((b) => b.id === selected) ?? null;

  const editBlock = (id: string, next: PlanBlock) => setBody((b) => patchBlock(b, id, () => next));

  const deleteBlock = (id: string) => {
    const at = blocks.findIndex((b) => b.id === id);
    const gone = blocks[at];
    if (!gone) return;
    setBody((b) => removeBlock(b, id));
    setSelected(null);
    toast({ title: `Deleted ${gone.title}`, code: 'CH-13581', action: { label: 'Undo', run: () => setBody((b) => addBlock(b, gone, at)) } });
  };
  const duplicate = (b: PlanBlock) => {
    const at = blocks.findIndex((x) => x.id === b.id);
    const copy = { ...structuredClone(b), id: `b-${Date.now().toString(36)}`, title: `${b.title} 2`.slice(0, 80) } as PlanBlock;
    setBody((x) => addBlock(x, copy, at + 1));
    setSelected(copy.id);
  };

  /* The helper. */
  const startFill = useCallback((words?: string) => {
    const line = `Fill the draft for ${data.title}, ${data.meta}${data.eventId ? ` (event ${data.eventId})` : ''}. ${words?.trim() ? `The coach says: ${words.trim()}.` : 'Use your best guesses.'} ${blocksOf(data.body).length ? 'The plan already has blocks; suggest only what it is missing.' : ''}`.trim();
    setSaidLine(null);
    setHelper({ k: 'running', request: line });
    setInspector('coachhelm');
  }, [data.title, data.meta, data.eventId, data.body]);
  useEffect(() => {
    // What the coach picked in New plan's sheet (how long, what to work on) goes in the helper's first message.
    if (autoFill && data.helperOn && !previewing) startFill(askWords(takeAskPicks(data.planId)));
    // Once, as the page opens from New plan's Ask CoachHelm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onPlan = useCallback((p: PlanPartData) => {
    setPlan(p);
    setGhosts(ghostsFrom(p.draft));
    setHelper({ k: 'ghosts' });
  }, []);
  const onDone = useCallback((r: { failed: boolean; said: string; busy: boolean }) => {
    if (r.failed) setHelper((h) => (h.k === 'running' ? { k: 'failed', line: 'That didn’t work. Nothing changed. Try again.' } : h));
    else if (!r.busy && r.said) setSaidLine(r.said);
  }, []);
  const keep = (g: Ghost) => {
    if (!plan) return;
    const res = keepGhost(body, why, g, plan.draft.body);
    setBody(res.body);
    setWhy(res.why);
    const rest = ghosts.filter((x) => x.id !== g.id);
    const ids = [...keptIds, g.id];
    setKeptIds(ids);
    setGhosts(rest);
    if (!rest.length) setHelper({ k: 'kept', count: ids.length, ids });
  };
  const keepAll = () => {
    if (!plan) return;
    let b = body;
    let w = why;
    for (const g of ghosts) {
      const res = keepGhost(b, w, g, plan.draft.body);
      b = res.body;
      w = res.why;
    }
    setBody(b);
    setWhy(w);
    const ids = [...keptIds, ...ghosts.map((g) => g.id)];
    setKeptIds(ids);
    setHelper({ k: 'kept', count: ids.length, ids });
    setGhosts([]);
  };
  const undoKept = () => {
    if (helper.k !== 'kept') return;
    setBody((b) => helper.ids.reduce((x, id) => removeBlock(x, id), b));
    setKeptIds([]);
    setHelper({ k: 'idle' });
  };
  const pickSwap = (g: Ghost, ref: string) => {
    const drill = refOf(ref);
    setGhosts((list) =>
      list.map((x) => {
        if (x.id !== g.id) return x;
        if (x.block.kind === 'team') return { ...x, block: { ...x.block, drill } };
        if (x.block.kind === 'stations') {
          const original = x.block.stations.find((s) => plan?.alternatives?.[s.id]?.some((a) => a.ref === ref));
          return { ...x, block: { ...x.block, stations: x.block.stations.map((s) => (s.id === original?.id ? { ...s, drill } : s)) } };
        }
        return x;
      }),
    );
    setSwap(null);
  };
  const altsOf = (g: Ghost) => {
    const original = g.id.replace(/^g-/, '');
    const own = plan?.alternatives?.[original] ?? [];
    const stations = g.block.kind === 'stations' ? g.block.stations.flatMap((s) => plan?.alternatives?.[s.id] ?? []) : [];
    return [...own, ...stations];
  };

  /* Drills. */
  const pickDrill = (d: ChBankDrill) => {
    const target = slot ?? (step === 'blocks' && activeBlock?.kind === 'team' ? activeBlock.id : null);
    if (!target) {
      toast({ title: 'Pick a block or station first', code: 'CH-13180' });
      return;
    }
    setBody((b) => setSlotDrill(b, target, refOf(d.ref)));
    setBankOpen(false);
  };

  /* Publish. */
  const peopleLine = `${plural(body.players.length, 'player')} and ${plural(data.coaches.length, 'coach', 'coaches')}`;
  const republish = data.status === 'published';
  const publishLabel = republish ? 'Republish' : 'Publish';
  const [tell, setTell] = useState(true);
  const diff = useMemo(() => (republish && data.liveBody ? diffVersions(data.liveBody, body, new Date(data.start), data.zone) : null), [republish, data.liveBody, body, data.start, data.zone]);
  const affectedNames = useMemo(() => (diff?.affected ?? []).map((p) => data.roster.find((r) => r.id === p)?.name.split(' ')[0] ?? 'A player').join(', '), [diff, data.roster]);
  const doPublish = async () => {
    if (previewing) return setConfirm(false);
    setPublishing(true);
    setPublishError(null);
    try {
      const expectedVersion = await save.flush();
      setConfirm(false);
      // The 8 second hold: nothing is written or sent until it runs out, so Undo, or closing the page, leaves the draft as it was.
      toast({
        title: `${publishLabel === 'Publish' ? 'Publishing' : 'Republishing'} in 8 seconds`,
        body: republish ? (tell && diff && !diff.wordingOnly ? `${plural(diff.affected.length, 'player')} hear when it goes.` : 'No one will be notified.') : `${peopleLine} hear when it goes.`,
        holdMs: PUBLISH_HOLD_MS,
        action: { label: 'Undo', run: () => toast({ title: 'Not published. Nobody was told.' }) },
        onExpire: () => void commitPublish(expectedVersion),
      });
    } catch {
      setPublishError('Couldn’t publish the plan. Nothing was sent.');
    } finally {
      setPublishing(false);
    }
  };
  const commitPublish = async (expectedVersion: number) => {
    try {
      const res = await publishPracticePlan({ planId: data.planId, expectedVersion, notify: republish && !tell ? 'none' : 'now' });
      if (!res.success) {
        setPublishError(res.stale ? 'Another coach changed this plan. Load the latest, then publish.' : res.error);
        setConfirm(true);
        return;
      }
      toast({ title: 'Published', body: republish && !tell ? 'No one was told.' : `${plural(res.recipients, 'person', 'people')} told`, code: 'CH-13081' });
      router.push(`/golf/dashboard/practice/plan/${data.planId}`);
    } catch {
      setPublishError('Couldn’t publish the plan. Nothing was sent.');
      setConfirm(true);
    }
  };
  /* The practice's time, from the builder (N-00 4.4). */
  const [moving, setMoving] = useState<{ start: string; end: string } | null>(null);
  const [moveAsk, setMoveAsk] = useState(false);
  const moveFrom = () => ({ start: zonedClock(data.start, data.zone), end: data.end ? zonedClock(data.end, data.zone) : '' });
  const movePractice = async () => {
    if (!moving) return;
    setMoveAsk(false);
    if (previewing || !data.eventId) return setMoving(null);
    const date = zonedDate(data.start, data.zone);
    const res = await updateGolfEvent(data.eventId, { startDate: date, startTime: moving.start, endTime: moving.end || undefined, timezoneOffset: offsetMinutesFor(date, moving.start, data.zone) ?? undefined }).catch(() => null);
    setMoving(null);
    if (!res?.success) return toast({ tone: 'error', title: 'Couldn’t move the practice', body: 'It’s still at the old time.' });
    router.refresh();
  };
  const doDelete = async () => {
    if (previewing) return setAskDelete(false);
    setDeleting(true);
    try {
      const res = await deletePracticePlan({ planId: data.planId });
      if (!res.success) {
        toast({ title: 'Couldn’t delete the plan', tone: 'error', code: 'CH-13082' });
        return;
      }
      router.push('/golf/dashboard/practice');
    } finally {
      setDeleting(false);
    }
  };

  const goBack = async () => {
    await save.flush();
    router.push('/golf/dashboard/practice');
  };
  const printIt = () => void printPlan(sheetModel);

  const sheetModel = useMemo(
    () =>
      toSheetModel(
        { body, why, title, team: data.team, start: new Date(data.start), end: data.end ? new Date(data.end) : null, zone: data.zone, coaches: data.coaches, names, state: data.status === 'published' ? 'Published' : 'Draft · Only coaches' },
        'coach',
      ),
    [body, why, title, data, names],
  );

  /* Pieces. */
  const statusLine =
    save.status === 'saving' ? 'Saving…' : save.status === 'offline' ? 'Offline · changes kept on this device' : save.status === 'failed' ? null : save.status === 'stale' ? null : 'Saved';
  const saveStatus = (
    <span className="ch-prc-save" role="status" data-state={save.status}>
      {statusLine}
      {save.status === 'failed' && (
        <>
          Couldn’t save ·{' '}
          <button type="button" onClick={save.retry}>
            Try again
          </button>
        </>
      )}
    </span>
  );
  const staleBar = (save.status === 'stale' || preview?.stale) && (
    <div className="ch-prc-stale" role="alert" data-ch-code="CH-13580">
      <span>Another coach changed this plan.</span>
      <Button size="sm" onClick={() => (previewing ? undefined : window.location.reload())}>
        Load latest
      </Button>
    </div>
  );
  // The day to scale: a block is as wide as its minutes and takes its drill's kind; suggestions wait as outlines, and what is left of the window stays empty.
  const toneOf = (d: Parameters<typeof keyOfDrill>[0]): DayKind => (d ? (kinds.get(keyOfDrill(d)) ?? 'plain') : 'plain');
  const blockSegs = (b: PlanBlock, ghost: boolean): DaySeg[] => (ghost ? [{ id: b.id, min: b.len, tone: 'ghost' }] : blockDaySegs(b, toneOf));
  const ghostMin = ghosts.reduce((n, g) => n + g.block.len, 0);
  const openMin = windowMin == null ? 0 : Math.max(0, windowMin - total - ghostMin);
  const daySegs: DaySeg[] = [...blocks.flatMap((b) => blockSegs(b, false)), ...ghosts.flatMap((g) => blockSegs(g.block, true)), ...(openMin > 0 ? [{ id: 'open', min: openMin, tone: 'open' as const }] : [])];
  const ribbonBar = (
    <div className="ch-prc-ribbon" aria-live="polite" data-ch-code="CH-13896">
      <div className="ch-prc-ribbon__w">
        <span>
          <b className="ch-num">{rib.used}</b> planned
        </span>
        <span className={'ch-num' + (rib.over ? ' is-over' : '')}>{ghostMin > 0 ? `${fmtMinutes(ghostMin)} suggested` : rib.rest}</span>
      </div>
      <DayStrip segs={daySegs} />
      <DayLegend segs={daySegs} />
    </div>
  );
  const whenLine = (
    <div className="ch-prb-when">
      <span className="ch-num">{wholeFacts(data.meta)}</span>
      <Button variant="ghost" size="sm" onClick={() => setMoving(moveFrom())} aria={{ label: 'Change the practice time' }}>
        Change
      </Button>
    </div>
  );
  const stepBar = <Segmented block={phone} label="Builder step" value={step} options={STEPS.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => setStep(v)} />;
  const addMenu = (at?: number, inline = false) => (
    <Menu
      label="Add block"
      align="start"
      width={280}
      items={BLOCK_KINDS.map((k): MenuItem => ({ label: k.label, caption: k.line, icon: KIND_ICON[k.kind], onSelect: () => {
        const block = makeBlock(k.kind, body);
        setBody((b) => addBlock(b, block, at));
        setSelected(block.id);
        setInspector('block');
      } }))}
      trigger={(p) => (
        <button type="button" {...p} className={'ch-prc-add' + (inline ? ' is-between' : '')}>
          <Icon icon={Plus} size={14} /> Add block
        </button>
      )}
    />
  );
  const facts = data.facts.length > 0 && (
    <ul className="ch-prc-feat__facts">
      {data.facts.map((f) => (
        <li key={f.lead}>
          <b>{f.lead}</b> {f.text}
        </li>
      ))}
    </ul>
  );
  const askField = asking ? (
    <form
      className="ch-prc-feat__ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (ask.trim()) startFill(ask);
      }}
    >
      <input className="ch-input" aria-label="What you want" ref={(el) => el?.focus()} value={ask} maxLength={280} placeholder="More pressure, finish on the course…" onChange={(e) => setAsk(e.target.value)} />
      <Button type="submit" size="sm" disabled={!ask.trim()}>
        Send
      </Button>
    </form>
  ) : (
    <button type="button" className="ch-prc-feat__more" onClick={() => setAsking(true)}>
      Or tell it what you want
    </button>
  );
  const featureCard = (head: string, cta: string) => (
    <div className="ch-prc-feat" data-ch="builder-helper">
      <h2>{head}</h2>
      <p>CoachHelm reads the calendar, the last 10 rounds and class times.</p>
      {facts}
      {helper.k === 'failed' && <p className="ch-prc-feat__fail" role="alert">{helper.line}</p>}
      <Button className="ch-prc-feat__go" onClick={() => startFill()}>
        {cta}
      </Button>
      {askField}
    </div>
  );
  const helperFold = (helper.k === 'running' || helper.k === 'ghosts' || helper.k === 'kept') && (
    <div className="ch-prc-fold" role="status" data-state={helper.k}>
      <span className={'ch-prc-fold__m' + (helper.k === 'running' ? ' is-working' : '')} aria-hidden="true">
        <Icon icon={ShipWheel} size={16} />
      </span>
      <span className="ch-prc-fold__t ch-num">
        <b>CoachHelm</b>
        {helper.k === 'running' && ' · building suggestions'}
        {helper.k === 'ghosts' && (phone ? ` · ${plural(ghosts.length, 'suggestion')}` : ` · ${plural(ghosts.length, 'suggestion')}. Nothing is in the plan until you keep it.`)}
        {helper.k === 'kept' && ` · ${plural(helper.count, 'suggestion')} kept`}
        {saidLine && helper.k === 'running' && <span className="ch-prc-fold__said">{saidLine}</span>}
      </span>
      {helper.k === 'ghosts' && !phone && (
        <Button size="sm" onClick={() => { setGhosts([]); setHelper({ k: 'dismissed' }); }}>
          Remove all
        </Button>
      )}
      {helper.k === 'ghosts' && (
        <Button variant="primary" size="sm" onClick={keepAll}>
          Keep all
        </Button>
      )}
      {helper.k === 'kept' && helper.ids.length > 0 && (
        <Button size="sm" onClick={undoKept}>
          Undo
        </Button>
      )}
      {helper.k === 'kept' && !phone && (
        <Button size="sm" onClick={() => setStep('groups')}>
          Go to Groups
        </Button>
      )}
    </div>
  );
  const ghostList = ghosts.length > 0 && (
    <ul className="ch-prc-ghosts" aria-label="Suggestions">
      {ghosts.map((g, i) => {
        const before = ghosts.slice(0, i).reduce((s, x) => s + x.block.len, total);
        const alts = altsOf(g);
        return (
          <li key={g.id} className={'ch-prc-gb' + (reduced ? '' : ' is-arriving')} data-ch="ghost-block" style={phone ? undefined : { minHeight: Math.max(56, g.block.len * 1.2) }}>
            <div className="ch-prc-gb__top">
              <span className="ch-num ch-prc-gb__tm">{clockFor(data.start, data.zone, before)}</span>
              <b>{g.block.title}</b>
              <span className="ch-num ch-prc-gb__mn">{fmtMinutes(g.block.len)}</span>
            </div>
            <span className="ch-prc-gb__s">Suggested</span>
            {g.why?.routine ? (
              <p>{g.block.note || 'Routine. No claim.'}</p>
            ) : g.why?.because ? (
              <p>
                <b>Because</b> {g.why.because}
              </p>
            ) : (
              <p>{g.why?.aim || blockSub(g.block)}</p>
            )}
            <div className="ch-prc-gb__a">
              <Button variant="primary" size="sm" onClick={() => keep(g)} aria={{ label: `Keep ${g.block.title}` }}>
                Keep
              </Button>
              {alts.length > 0 && (
                <Button size="sm" onClick={() => setSwap(g)} aria={{ label: `Swap ${g.block.title}` }}>
                  Swap
                </Button>
              )}
              <Button
                size="sm"
                aria={{ label: `Remove ${g.block.title}` }}
                onClick={() => {
                  const rest = ghosts.filter((x) => x.id !== g.id);
                  setGhosts(rest);
                  if (!rest.length) setHelper({ k: 'dismissed' });
                }}
              >
                Remove
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const blockMenu = (b: PlanBlock, i: number) => (
    <Menu
      label={`${b.title} actions`}
      items={[
        { label: 'Duplicate', icon: Copy, onSelect: () => duplicate(b) },
        { label: 'Move up', icon: ArrowUp, disabled: i === 0, onSelect: () => setBody((x) => moveBlock(x, b.id, -1)) },
        { label: 'Move down', icon: ArrowDown, disabled: i === blocks.length - 1, onSelect: () => setBody((x) => moveBlock(x, b.id, 1)) },
        { kind: 'separator' },
        { label: 'Delete', icon: Trash2, danger: true, feel: 'warning', onSelect: () => deleteBlock(b.id) },
      ]}
      trigger={(p) => (
        <button type="button" {...p} className="ch-prc-more" aria-label={`More for ${b.title}`}>
          <Icon icon={Ellipsis} size={18} />
        </button>
      )}
    />
  );

  let minuteAt = 0;
  const blockCards = (
    <ol className="ch-prc-blocks" aria-label="Blocks">
      {blocks.map((b, i) => {
        const start = minuteAt;
        minuteAt += b.len;
        const drillNames = (b.kind === 'team' ? [b.drill] : b.kind === 'stations' ? b.stations.map((s) => s.drill) : []).flatMap((d) => (d ? [drillOf.get(keyOfDrill(d))?.name ?? ''] : [])).filter(Boolean);
        return (
          <li key={b.id}>
            {/* The card's own keys are its buttons; these only add Alt+Arrow to reorder from anywhere in it. */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
              className={'ch-prc-block' + (selected === b.id ? ' is-on' : '') + (keptIds.includes(b.id) ? ' is-kept' : '')}
              style={phone ? undefined : { minHeight: Math.max(56, b.len * 1.2) }}
              data-kind={b.kind}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                  e.preventDefault();
                  setBody((x) => moveBlock(x, b.id, e.key === 'ArrowUp' ? -1 : 1));
                }
              }}
            >
              <button
                type="button"
                className="ch-prc-block__main"
                onClick={() => {
                  setSelected(b.id);
                  setInspector('block');
                }}
              >
                <span className="ch-prc-block__tm ch-num">{clockFor(data.start, data.zone, start)}</span>
                <span className="ch-prc-block__t">
                  <b>{b.title}</b>
                  <span className="ch-prc-block__s">
                    <Icon icon={KIND_ICON[b.kind]} size={14} />
                    <span className="ch-num">{wholeFacts(blockSub(b))}</span>
                  </span>
                  {drillNames.length > 0 && <span className="ch-prc-block__d">{wholeFacts(drillNames.join(' · '))}</span>}
                  {why[b.id]?.because && (
                    <span className="ch-prc-block__why">
                      <b>Because</b> {why[b.id]!.because}
                    </span>
                  )}
                </span>
                <span className="ch-prc-block__mn ch-num">{fmtMinutes(b.len)}</span>
              </button>
              {blockMenu(b, i)}
            </div>
            {!phone && i < blocks.length - 1 && addMenu(i + 1, true)}
          </li>
        );
      })}
    </ol>
  );

  const blocksStep = (
    <>
      {phone && data.helperOn && blocks.length === 0 && (helper.k === 'idle' || helper.k === 'failed') && featureCard(`Start ${data.dayWord} from your team’s data`, 'Fill the draft')}
      {helperFold}
      {helper.k === 'running' && (
        <Suspense fallback={null}>
          <HelperSession request={helper.request} onPlan={onPlan} onDone={onDone} />
        </Suspense>
      )}
      {ghostList}
      {blocks.length > 0 ? blockCards : ghosts.length === 0 && helper.k !== 'running' && (
        <div className="ch-prc-card ch-prc-empty">
          <h2>No blocks yet</h2>
          <p>{data.helperOn ? 'Add one, or let CoachHelm fill the draft.' : 'Add a block to start the plan.'}</p>
          {addMenu()}
        </div>
      )}
      {blocks.length > 0 && addMenu()}
    </>
  );

  const groupsStep = (
    <div className="ch-prc-groups">
      <div className="ch-prc-groups__a">
        <Button onClick={() => setSplitOpen(true)}>Split evenly</Button>
        {body.groups.length < 6 && <Button onClick={() => setBody(addGroup)}>Add group</Button>}
      </div>
      {!blocks.some((b) => b.kind === 'stations') && <p className="ch-prc-note">Groups are optional for this plan.</p>}
      {body.groups.length === 0 && <p className="ch-prc-note">No groups yet. Split your {plural(body.players.length, 'player')} evenly, or add a group.</p>}
      {body.groups.map((g, gi) => (
        <section key={g.id} className={`ch-prc-group ${GROUP_TONES[gi] ?? ''}`} aria-label={`Group ${g.name}`}>
          <header>
            <span className="ch-prc-disc" aria-hidden="true">{g.name}</span>
            <b>Group {g.name}</b>
            <span className="ch-num">{plural(g.players.length, 'player')}</span>
            <button type="button" className="ch-prc-more" aria-label={`Remove Group ${g.name}`} onClick={() => setBody((b) => removeGroup(b, g.id))}>
              <Icon icon={Trash2} size={16} />
            </button>
          </header>
          <ul>
            {g.players.map((p) => playerChip(p, g.id))}
            {g.players.length === 0 && <li className="ch-prc-note">No players yet</li>}
          </ul>
        </section>
      ))}
      {ungrouped().length > 0 && (
        <section className="ch-prc-group" aria-label="Not in a group">
          <header>
            <b>Not in a group</b>
            <span className="ch-num">{plural(ungrouped().length, 'player')}</span>
          </header>
          <ul>{ungrouped().map((p) => playerChip(p, null))}</ul>
        </section>
      )}
      {outOfPractice().length > 0 && (
        <section className="ch-prc-group" aria-label="Out of this practice">
          <header>
            <b>Out of this practice</b>
          </header>
          <ul>{outOfPractice().map((p) => playerChip(p, null, true))}</ul>
        </section>
      )}
    </div>
  );
  function ungrouped() {
    return body.players.filter((p) => !body.groups.some((g) => g.players.includes(p)));
  }
  function outOfPractice() {
    return data.roster.map((r) => r.id).filter((p) => !body.players.includes(p));
  }
  function playerChip(p: string, inGroup: string | null, out = false) {
    const items: MenuItem[] = [
      ...body.groups.filter((g) => g.id !== inGroup).map((g): MenuItem => ({ label: `Group ${g.name}`, onSelect: () => setBody((b) => movePlayer(b, p, g.id)) })),
      ...(out ? [{ label: 'Back in this practice', onSelect: () => setBody((b) => movePlayer(b, p, null)) } as MenuItem] : [{ kind: 'separator' } as MenuItem, { label: 'Out of this practice', onSelect: () => setBody((b) => movePlayer(b, p, null, true)) } as MenuItem]),
    ];
    return (
      <li key={p}>
        <Menu
          label={`Move ${names.get(p) ?? 'player'}`}
          align="start"
          items={items}
          trigger={(t) => (
            <button type="button" {...t} className="ch-prc-player">
              {names.get(p) ?? 'A player'}
            </button>
          )}
        />
      </li>
    );
  }

  const drillsStep = (
    <div className="ch-prc-slots">
      {slots.length === 0 && <p className="ch-prc-note">Add a Team or Stations block first. Each one has a drill slot.</p>}
      {slots.map((s) => {
        const d = s.drill ? drillOf.get(keyOfDrill(s.drill)) : null;
        const long = d && d.minutes > s.minutes;
        return (
          <div key={s.id} className={'ch-prc-slot' + (slot === s.id ? ' is-on' : '')}>
            <div className="ch-prc-slot__t">
              <b>{s.head}</b>
              <span>{s.sub}</span>
              {d ? (
                <span className="ch-prc-slot__d ch-num">
                  {d.name} · {kindLabel(d.kind)} · {d.minutes} min
                </span>
              ) : s.drill ? (
                <span className="ch-prc-slot__d">A drill that’s not in the bank</span>
              ) : null}
              {long && <span className="ch-prc-slot__w ch-num" data-ch-code="CH-13180">Drill runs {d.minutes} min; turn is {s.minutes}.</span>}
            </div>
            {s.drill && (
              <Button size="sm" variant="ghost" onClick={() => setBody((b) => setSlotDrill(b, s.id, null))} aria={{ label: `Take the drill off ${s.head}` }}>
                Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setSlot(s.id);
                if (phone) setBankOpen(true);
              }}
              aria={{ label: `${s.drill ? 'Change' : 'Add'} drill for ${s.head}` }}
            >
              {s.drill ? 'Change' : 'Add drill'}
            </Button>
          </div>
        );
      })}
    </div>
  );

  const reviewStep = (
    <div className="ch-prc-review">
      <section className="ch-prc-card ch-prc-strip" aria-label="Before you publish">
        {check.errors.length > 0 ? (
          <>
            <b className="is-err">Fix {plural(check.errors.length, 'problem')} to publish</b>
            <ul className="ch-prc-probs">
              {check.errors.map((p, i) => (
                <li key={i}>
                  <button type="button" onClick={() => { if (p.blockId) setSelected(p.blockId); setStep('blocks'); }}>
                    {p.message}
                    <Icon icon={ChevronRight} size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="ch-num">{data.status === 'published' ? 'Players whose day changed will be told.' : `${peopleLine} will be told.`}</p>
        )}
        {check.warnings.length > 0 && (
          <ul className="ch-prc-probs is-warn">
            {check.warnings.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        )}
        <div className="ch-prc-strip__a">
          <Button onClick={printIt}>Print</Button>
          {data.status === 'draft' && (
            <Button variant="ghost" onClick={() => setAskDelete(true)}>
              Delete draft
            </Button>
          )}
          {/* A Mac's head already holds Publish, on every step: one key, not two. A phone has no head, so its key is here. */}
          {phone && (
            <Button variant="primary" disabled={check.errors.length > 0} onClick={() => setConfirm(true)}>
              {publishLabel}
            </Button>
          )}
        </div>
      </section>
      <PracticePlanSheet plan={sheetModel} />
    </div>
  );

  const stepBody = step === 'blocks' ? blocksStep : step === 'groups' ? groupsStep : step === 'drills' ? drillsStep : reviewStep;
  const railStep = step === 'blocks' || step === 'drills';

  const sheets = (
    <>
      {phone && activeBlock && (
        <PracticeSheet open onClose={() => setSelected(null)} title={activeBlock.title || 'Block'} actionLabel="Done" onAction={() => setSelected(null)} actionDisabled={!activeBlock.title.trim()} code="CH-13895" full>
          <BlockFields block={activeBlock} body={body} onChange={(n) => editBlock(activeBlock.id, n)} onRemove={() => deleteBlock(activeBlock.id)} />
        </PracticeSheet>
      )}
      <Modal open={bankOpen} title="Add drill" detent={0.8} onClose={() => setBankOpen(false)}>
        <BankList drills={drills} pickLabel="Use" onPick={pickDrill} onNew={() => setNewDrill(true)} />
      </Modal>
      <NewDrillSheet
        open={newDrill}
        onClose={() => setNewDrill(false)}
        teamId={data.teamId}
        preview={previewing}
        onSaved={(d) => {
          setDrills((list) => [d, ...list]);
          setNewDrill(false);
          toast({ title: 'Saved to your drill bank', code: 'CH-13083' });
          if (slot) pickDrill(d);
        }}
      />
      <PracticeSheet open={splitOpen} onClose={() => setSplitOpen(false)} title="Split evenly" actionLabel="Split" onAction={() => { setBody((b) => splitGroups(b, splitN)); setSplitOpen(false); }} code="CH-13582" note={body.groups.some((g) => g.players.length) ? 'This replaces the groups you have.' : undefined}>
        <div className="ch-prc-fields">
          <Segmented label="Number of groups" value={String(splitN)} options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setSplitN(Number(v))} />
          <p className="ch-prc-note">{plural(body.players.length, 'player')} into {splitN} groups.</p>
        </div>
      </PracticeSheet>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`${publishLabel} ${title}?`}
        width={440}
        code="CH-13081"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Not yet
            </Button>
            <Button variant="primary" busy={publishing} onClick={() => void doPublish()}>
              {data.status === 'published' ? 'Republish' : `Publish to ${plural(body.players.length + data.coaches.length, 'person', 'people')}`}
            </Button>
          </>
        }
      >
        <div className="ch-prc-confirm">
          {publishError && (
            <p className="ch-prc-new__err" role="alert">
              {publishError}
            </p>
          )}
          {republish && diff ? (
            <div className="ch-prc-changed">
              <h3>What changed</h3>
              {diff.wordingOnly ? (
                <p className="ch-prc-note">Only wording changed. No one will be notified.</p>
              ) : (
                <>
                  <ul>
                    {changeLines(diff).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <Switch label="Tell players" checked={tell} onChange={setTell} />
                  <p className="ch-prc-note ch-num">{tell ? `${plural(diff.affected.length, 'player')} whose day changed will be notified: ${affectedNames}.` : 'No one will be notified.'}</p>
                </>
              )}
            </div>
          ) : (
            <dl className="ch-prc-facts">
              <div>
                <dt>When</dt>
                <dd className="ch-num">{wholeFacts(data.meta)}</dd>
              </div>
              <div>
                <dt>Tells</dt>
                <dd className="ch-num">{republish ? 'Players whose day changed, push and bell' : `${peopleLine}, push and bell`}</dd>
              </div>
              <div>
                <dt>Files to</dt>
                <dd>Documents › Practice plans</dd>
              </div>
            </dl>
          )}
          <p className="ch-prc-note">You get 8 seconds to undo before anyone is told.</p>
        </div>
      </Modal>
      <PracticeSheet open={!!moving} onClose={() => setMoving(null)} title="Practice time" actionLabel="Save" onAction={() => setMoveAsk(true)} actionDisabled={!moving?.start}>
        {moving && (
          <div className="ch-prc-timeform">
            <TimeField label="Starts" value={moving.start} onChange={(v) => setMoving({ ...moving, start: v })} />
            <TimeField label="Ends" value={moving.end} onChange={(v) => setMoving({ ...moving, end: v })} />
          </div>
        )}
      </PracticeSheet>
      {phone ? (
        <ActionSheet
          open={moveAsk}
          onClose={() => setMoveAsk(false)}
          title={moving ? `Also move ${data.dayWord} practice to ${moving.start ? formatWallClock(moving.start) : ''} on the calendar?` : ''}
          message={data.inSeries ? 'Only this practice moves. The rest of the series stays.' : undefined}
          actions={[{ label: 'Move practice', onClick: () => void movePractice() }]}
        />
      ) : (
        // The phone's action sheet has no desk drawing: on a Mac the same question is the shared Modal.
        <Modal
          open={moveAsk}
          onClose={() => setMoveAsk(false)}
          title={moving ? `Also move ${data.dayWord} practice to ${moving.start ? formatWallClock(moving.start) : ''} on the calendar?` : ''}
          description={data.inSeries ? 'Only this practice moves. The rest of the series stays.' : undefined}
          width={440}
          footer={
            <>
              <Button variant="ghost" onClick={() => setMoveAsk(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void movePractice()}>
                Move practice
              </Button>
            </>
          }
        />
      )}
      <PracticeSheet open={askDelete} onClose={() => setAskDelete(false)} title="Delete this draft?" actionLabel="Delete" danger onAction={() => void doDelete()} busy={deleting} code="CH-13082">
        <p className="ch-prc-note">Players never saw it. This can’t be undone.</p>
      </PracticeSheet>
      <PracticeSheet open={!!swap} onClose={() => setSwap(null)} title="Swap drill" actionLabel="Done" onAction={() => setSwap(null)} code="CH-13895">
        <div className="ch-prc-bank">
          {swap && altsOf(swap).map((a) => (
            <button key={a.ref} type="button" className="ch-prc-drill" onClick={() => pickSwap(swap, a.ref)}>
              <b>{a.name}</b>
              <span className="ch-num">{kindLabel(a.kind)} · {a.min} min · {a.line}</span>
            </button>
          ))}
        </div>
      </PracticeSheet>
    </>
  );

  if (phone) {
    return (
      <main className="ch-page ch-prc ch-prb is-phone" data-ch="practice-builder" aria-labelledby="ch-prb-title">
        <PhoneTop
          back={{ label: 'Practice', onBack: () => void goBack() }}
          title={title}
          titleId="ch-prb-title"
          action={<PhoneIconAction icon={Printer} label="Print" onClick={printIt} />}
        />
        <div className="ch-prb-sticky">{stepBar}</div>
        {restored && <p className="ch-prc-note" role="status">Restored your changes</p>}
        {staleBar}
        <div className="ch-prb-sub">
          {whenLine}
          {ribbonBar}
          {saveStatus}
        </div>
        {step === 'review' || step === 'groups' || step === 'drills' ? stepBody : <div className="ch-prb-col">{stepBody}</div>}
        {sheets}
      </main>
    );
  }

  return (
    <main className="ch-prc ch-prb is-desk" data-ch="practice-builder" aria-labelledby="ch-prb-title">
      <header className="ch-prb-head">
        <BackLink onClick={() => void goBack()}>Practice</BackLink>
        <div className="ch-prb-head__t">
          <input id="ch-prb-title" className="ch-prb-title" aria-label="Plan title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          {/* One line under the title: when and where, Change, then whether it is saved. */}
          <div className="ch-prb-head__m">
            {whenLine}
            {saveStatus}
          </div>
        </div>
        <div className="ch-prb-head__steps">{stepBar}</div>
        {ribbonBar}
        <Button onClick={() => setStep('review')}>Preview</Button>
        <Button variant="primary" disabled={check.errors.length > 0} onClick={() => setConfirm(true)}>
          {publishLabel}
        </Button>
      </header>
      {staleBar}
      {restored && <p className="ch-prc-note" role="status">Restored your changes</p>}
      <div className={'ch-prb-body' + (railStep ? ' has-rail' : '')}>
        {railStep && (
          <aside className="ch-prb-rail" aria-label="Drills">
            <h2>Drills</h2>
            <BankList drills={drills} pickLabel={slot || activeBlock ? 'Use' : 'Pick a block first, then'} onPick={pickDrill} onNew={() => setNewDrill(true)} />
          </aside>
        )}
        <div className="ch-prb-board">{stepBody}</div>
        {railStep && (
          <aside className="ch-prb-insp" aria-label="Inspector">
            {data.helperOn && (
              <Segmented block label="Inspector" value={inspector} options={[{ value: 'block', label: 'Inspector' }, { value: 'coachhelm', label: 'CoachHelm' }]} onChange={(v) => setInspector(v)} />
            )}
            {inspector === 'coachhelm' && data.helperOn ? (
              helper.k === 'idle' || helper.k === 'failed' || helper.k === 'dismissed' || helper.k === 'ghosts' ? (
                featureCard(`For ${data.dayWord}`, 'Fill this plan')
              ) : (
                <p className="ch-prc-note">{helper.k === 'running' ? 'CoachHelm is building suggestions on the board.' : 'Kept. Groups next: split the players or use your own.'}</p>
              )
            ) : activeBlock ? (
              <BlockFields block={activeBlock} body={body} onChange={(n) => editBlock(activeBlock.id, n)} onRemove={() => deleteBlock(activeBlock.id)} />
            ) : (
              <PracticeFields title={title} body={body} onFocus={(focus) => setBody((b) => ({ ...b, focus }))} onPlace={(place) => setBody((b) => ({ ...b, place }))} />
            )}
          </aside>
        )}
      </div>
      {sheets}
    </main>
  );
}

/** Nothing selected: this practice's own fields (N-00 4.4). */
function PracticeFields({ title, body, onFocus, onPlace }: { title: string; body: PlanBodyV2; onFocus: (v: string) => void; onPlace: (v: string) => void }) {
  return (
    <div className="ch-prc-fields">
      <h2>This practice</h2>
      <p className="ch-prc-note">{title}</p>
      <div className="ch-field">
        <label className="ch-field__label" htmlFor="ch-prb-focus">
          Focus
        </label>
        <textarea id="ch-prb-focus" className="ch-textarea" rows={2} maxLength={140} value={body.focus} onChange={(e) => onFocus(e.target.value)} />
      </div>
      <div className="ch-field">
        <label className="ch-field__label" htmlFor="ch-prb-place">
          Place
        </label>
        <input id="ch-prb-place" className="ch-input" maxLength={80} value={body.place} onChange={(e) => onPlace(e.target.value)} />
      </div>
    </div>
  );
}
