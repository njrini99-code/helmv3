'use client';

import { ChevronRight, Ellipsis, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { archiveTeamDrill, copyLibraryDrill, deletePracticeGroup, deletePracticeTemplate, renamePracticeTemplate, savePracticeGroup, savePracticeTemplate, updateTeamDrill } from '@/app/golf/actions/practice-library';
import type { DrillKind, PlanArea, PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import type { ChDrillDetail, ChDrillRow, ChPracticeGroup, ChPracticeTemplate, ChRosterRow } from '../../data/practice-library-shape';
import { useRefresh } from '../../lib/use-refresh';
import { useChPhone } from '../../lib/use-phone';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useHScroll, useKeepInView } from '../../ui/use-hscroll';
import { plural } from '../../lib/plural';
import { PhoneTop } from '../../shell/phone-chrome';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { PracticeSheet } from './PracticeSheet';
import { Icon } from '../../ui/Icon';
import { LargeTitle } from '../../ui/LargeTitle';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { NewDrillSheet } from './builder/Sheets';
import { PracticeTabs, type PracticeTab } from './PracticeTabs';
import { AREA_WORDS, PLAN_STARTERS } from './starters';

const AREAS = Object.entries(AREA_WORDS) as Array<[PlanArea, string]>;
const KIND_WORD: Record<DrillKind, string> = { skill: 'Skill', random: 'Random', pressure: 'Pressure' };
const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`);

/** The same head on every tab: the title, the tab's action, and the tabs. */
function LibraryHead({ tab, title, actionLabel, onAction }: { tab: PracticeTab; title: string; actionLabel?: string; onAction?: () => void }) {
  const phone = useChPhone();
  return (
    <>
      {phone && <PhoneTop start title={title} action={actionLabel && onAction ? <PhoneIconAction icon={Plus} label={actionLabel} onClick={onAction} /> : undefined} />}
      <header className="ch-prc-h">
        <LargeTitle id="ch-prc-title">{title}</LargeTitle>
        {!phone && actionLabel && onAction && (
          <div className="ch-prc-h__a">
            <Button variant="primary" leftIcon={Plus} onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        )}
      </header>
      <PracticeTabs active={tab} />
    </>
  );
}

function DrillRowLink({ d }: { d: ChDrillRow }) {
  const facts = [d.areaLabel, d.kind ? KIND_WORD[d.kind] : null, d.minutes != null ? `${d.minutes} min` : null, d.players].filter(Boolean).join(' · ');
  return (
    <li>
      <Link href={`/golf/dashboard/practice/drills/${d.id}`} className="ch-prc-row">
        <span className="ch-prc-row__m">
          <span className="ch-prc-row__top">
            <b>{d.name}</b>
            {d.source === 'lib' && <Badge>GolfHelm</Badge>}
          </span>
          <span className="ch-prc-row__w ch-num">{facts}</span>
          {d.levels && <span className="ch-prc-row__l ch-num">{d.levels}</span>}
        </span>
        <Icon icon={ChevronRight} size={16} />
      </Link>
    </li>
  );
}

/** Drills (N-00 4.1): search, area chips, the team's bank, then GolfHelm's library. */
export function DrillsPage({ teamId, team, library, preview = false }: { teamId: string; team: ChDrillRow[]; library: ChDrillRow[]; preview?: boolean }) {
  const { refresh } = useRefresh();
  const [q, setQ] = useState('');
  const [area, setArea] = useState<PlanArea | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const match = (d: ChDrillRow) => (area === 'all' || d.area === area) && (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()));
  const mine = useMemo(() => team.filter(match), [team, q, area]); // eslint-disable-line react-hooks/exhaustive-deps -- match reads q and area
  const theirs = useMemo(() => library.filter(match), [library, q, area]); // eslint-disable-line react-hooks/exhaustive-deps -- match reads q and area
  const phone = useChPhone();
  const areaRow = useRef<HTMLDivElement | null>(null);
  const areaEdges = useHScroll(areaRow);
  useKeepInView(areaRow, '[aria-pressed="true"]', `${phone}:${area}`, useChReducedMotion());
  return (
    <main className={'ch-page ch-prc' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      <LibraryHead tab="drills" title="Drills" actionLabel="New drill" onAction={() => setCreating(true)} />
      {/* Search and the areas: one line on a Mac; on a phone the areas are one row that scrolls sideways, its clipped edge fading and the chosen area kept whole. */}
      <div className="ch-prc-find">
        <SearchField value={q} onChange={setQ} placeholder="Search drills" label="Search drills" />
        <div ref={areaEdges} className="ch-hscroll ch-pills ch-prc-areas" role="group" aria-label="Area">
          <button type="button" className="ch-pill" aria-pressed={area === 'all'} onClick={() => setArea('all')}>
            All
          </button>
          {AREAS.map(([v, label]) => (
            <button key={v} type="button" className="ch-pill" aria-pressed={area === v} onClick={() => setArea(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mine.length === 0 && theirs.length === 0 ? (
        <EmptyState
          kind={q.trim() ? 'filtered' : 'first-run'}
          title={q.trim() ? `No drills match “${q.trim()}”` : 'No drills here yet'}
          body={q.trim() ? 'Try another word, or save it as a new drill.' : 'New drills you save show up here.'}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              New drill
            </Button>
          }
        />
      ) : (
        <>
          <section className="ch-prc-sec" aria-label="Your drills">
            <h2>Your drills</h2>
            {mine.length ? <ul className="ch-prc-list is-drills">{mine.map((d) => <DrillRowLink key={d.id} d={d} />)}</ul> : <p className="ch-prc-none">{team.length ? 'None in this area.' : 'None yet. Copy a GolfHelm drill, or add your own.'}</p>}
          </section>
          <section className="ch-prc-sec" aria-label="GolfHelm drills">
            <h2>GolfHelm drills</h2>
            {theirs.length ? <ul className="ch-prc-list is-drills">{theirs.map((d) => <DrillRowLink key={d.id} d={d} />)}</ul> : <p className="ch-prc-none">{area === 'bunker' || area === 'fitness' ? `No GolfHelm drills for ${AREA_WORDS[area]} yet.` : 'None in this area.'}</p>}
          </section>
        </>
      )}
      <NewDrillSheet
        open={creating}
        onClose={() => setCreating(false)}
        teamId={teamId}
        preview={preview}
        onSaved={() => {
          setCreating(false);
          refresh();
        }}
      />
    </main>
  );
}

/** One drill, every field. A team drill can be edited and archived; a library drill can only be copied. */
export function DrillPage({ teamId, drill, preview = false }: { teamId: string; drill: ChDrillDetail; preview?: boolean }) {
  const phone = useChPhone();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useRefresh();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(drill.name);
  const [area, setArea] = useState<string>(drill.area ?? 'putting');
  const [kind, setKind] = useState<DrillKind>(drill.kind ?? 'skill');
  const [minutes, setMinutes] = useState(drill.minutes ?? 20);
  const [setup, setSetup] = useState(drill.setup);
  const [goal, setGoal] = useState(drill.goal);
  const team = drill.source === 'team';
  const save = async () => {
    if (preview) return setEditing(false);
    setBusy(true);
    const r = await updateTeamDrill({ teamId, drillId: drill.id, name, area, kind, minutes, setup, goal }).catch(() => ({ success: false as const, error: 'Couldn’t save the drill.' }));
    setBusy(false);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t save the drill.' });
    setEditing(false);
    refresh();
  };
  const copy = async () => {
    if (preview) return;
    setBusy(true);
    const r = await copyLibraryDrill({ teamId, drillId: drill.id }).catch(() => ({ success: false as const, error: 'Couldn’t copy the drill.' }));
    setBusy(false);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t copy the drill.' });
    toast({ title: 'Copied to your bank' });
    router.push(`/golf/dashboard/practice/drills/${r.id}`);
  };
  const archive = async () => {
    if (preview) return setArchiving(false);
    setBusy(true);
    const r = await archiveTeamDrill({ drillId: drill.id, archived: true }).catch(() => ({ success: false as const, error: 'Couldn’t archive the drill.' }));
    setBusy(false);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t archive the drill.' });
    router.push('/golf/dashboard/practice/drills');
  };
  return (
    <main className={'ch-page ch-prc ch-prc-drillpage' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop title="Drill" back={{ label: 'Drills', onBack: () => router.push('/golf/dashboard/practice/drills') }} />}
      <header className="ch-prc-h">
        <div>
          <LargeTitle id="ch-prc-title">{drill.name}</LargeTitle>
          <p className="ch-prc-h__line ch-num">{[drill.areaLabel, drill.kind ? KIND_WORD[drill.kind] : null, drill.minutes != null ? `${drill.minutes} min` : null, drill.players].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="ch-prc-h__a is-page">
          {team ? (
            <>
              <Button onClick={() => setArchiving(true)}>Archive</Button>
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          ) : (
            <Button variant="primary" busy={busy} onClick={() => void copy()}>
              Copy to your bank
            </Button>
          )}
        </div>
      </header>
      {team && drill.usedIn != null && <p className="ch-prc-none ch-num">{drill.usedIn ? `Used in ${plural(drill.usedIn, 'plan')}` : 'Not in a plan yet'}</p>}
      <dl className="ch-prc-dfacts">
        {drill.setup && (
          <div>
            <dt>Set-up</dt>
            <dd>{drill.setup}</dd>
          </div>
        )}
        {drill.goal && (
          <div>
            <dt>Goal</dt>
            <dd>{drill.goal}</dd>
          </div>
        )}
        {drill.levels && (
          <div>
            <dt>Levels</dt>
            <dd className="ch-num">{drill.levels}</dd>
          </div>
        )}
        {drill.equipment.length > 0 && (
          <div>
            <dt>Bring</dt>
            <dd className="ch-num">{drill.equipment.map((e) => `${e.item} (${e.qty})`).join(', ')}</dd>
          </div>
        )}
        {drill.scoring.length > 0 && (
          <div>
            <dt>Scoring</dt>
            <dd className="ch-num">{drill.scoring.map((s) => `${s.label}: ${s.points}`).join(' · ')}</dd>
          </div>
        )}
        {drill.tags.length > 0 && (
          <div>
            <dt>Tags</dt>
            <dd>{drill.tags.join(', ')}</dd>
          </div>
        )}
      </dl>
      <PracticeSheet open={editing} onClose={() => setEditing(false)} title="Edit drill" onAction={() => void save()} actionDisabled={!name.trim()} busy={busy}>
        <div className="ch-prc-fields">
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-prc-d-n">
              Name
            </label>
            <input id="ch-prc-d-n" className="ch-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="ch-prc-fields__two">
            <div className="ch-field">
              <span className="ch-field__label">Area</span>
              <Select label="Area" value={area} options={AREAS.map(([value, label]) => ({ value, label }))} onChange={setArea} />
            </div>
            <div className="ch-field">
              <span className="ch-field__label">Kind</span>
              <Select<DrillKind> label="Kind" value={kind} options={[{ value: 'skill', label: 'Skill' }, { value: 'random', label: 'Random' }, { value: 'pressure', label: 'Pressure' }]} onChange={setKind} />
            </div>
          </div>
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-prc-d-m">
              Minutes
            </label>
            <input id="ch-prc-d-m" className="ch-input" type="number" inputMode="numeric" min={1} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </div>
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-prc-d-s">
              Set-up
            </label>
            <textarea id="ch-prc-d-s" className="ch-input" rows={3} maxLength={1000} value={setup} onChange={(e) => setSetup(e.target.value)} />
          </div>
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-prc-d-g">
              Goal
            </label>
            <input id="ch-prc-d-g" className="ch-input" maxLength={200} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
        </div>
      </PracticeSheet>
      <Modal
        open={archiving}
        onClose={() => setArchiving(false)}
        title="Archive this drill?"
        description="It leaves your bank. Drafts that use it keep working, and published plans keep their copy."
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(false)}>
              Keep
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void archive()}>
              Archive
            </Button>
          </>
        }
      />
    </main>
  );
}

/** Saved groups (N-00 4.1): a card opens the sheet. Deleting never changes plans that copied it. */
export function GroupsPage({ teamId, groups, roster, preview = false }: { teamId: string; groups: ChPracticeGroup[]; roster: ChRosterRow[]; preview?: boolean }) {
  const phone = useChPhone();
  const toast = useToast();
  const { refresh } = useRefresh();
  const [editing, setEditing] = useState<ChPracticeGroup | 'new' | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const open = (g: ChPracticeGroup | 'new') => {
    setEditing(g);
    setName(g === 'new' ? '' : g.name);
    setPicked(g === 'new' ? [] : g.playerIds);
    setProblem(null);
  };
  const nameOf = (id: string) => roster.find((p) => p.id === id)?.name ?? 'Player';
  const save = async () => {
    if (preview) return setEditing(null);
    setBusy(true);
    setProblem(null);
    const r = await savePracticeGroup({ teamId, groupId: editing && editing !== 'new' ? editing.id : null, name, playerIds: picked }).catch(() => ({ success: false as const, error: 'Couldn’t save the group.' }));
    setBusy(false);
    if (!r.success) return setProblem(r.error ?? 'Couldn’t save the group.');
    setEditing(null);
    refresh();
  };
  const remove = async () => {
    if (preview || !editing || editing === 'new') return setDeleting(false);
    setBusy(true);
    const r = await deletePracticeGroup({ teamId, groupId: editing.id }).catch(() => ({ success: false as const, error: 'Couldn’t delete the group.' }));
    setBusy(false);
    setDeleting(false);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t delete the group.' });
    setEditing(null);
    refresh();
  };
  return (
    <main className={'ch-page ch-prc' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      <LibraryHead tab="groups" title="Groups" actionLabel="New group" onAction={() => open('new')} />
      {groups.length === 0 ? (
        <EmptyState
          kind="first-run"
          title="No saved groups yet"
          body="Save a group once, and any plan can use it."
          action={
            <Button variant="primary" onClick={() => open('new')}>
              New group
            </Button>
          }
        />
      ) : (
        <ul className="ch-prc-cards">
          {groups.map((g) => (
            <li key={g.id}>
              <button type="button" className="ch-prc-gcard" data-ch-press=".97" onClick={() => open(g)}>
                <b>{g.name}</b>
                <span className="ch-prc-faces" aria-hidden="true">
                  {g.playerIds.slice(0, 8).map((id) => (
                    <Avatar key={id} name={nameOf(id)} size="xs" />
                  ))}
                  {g.playerIds.length > 8 && <small className="ch-num">+{g.playerIds.length - 8}</small>}
                </span>
                <span className="ch-num">{plural(g.playerIds.length, 'player')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PracticeSheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New group' : 'Edit group'} onAction={() => void save()} actionDisabled={!name.trim()} busy={busy} full>
        <div className="ch-prc-fields">
          {problem && (
            <p className="ch-field__help is-error" role="alert">
              {problem}
            </p>
          )}
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-prc-g-n">
              Name
            </label>
            <input id="ch-prc-g-n" className="ch-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <ul className="ch-prc-checks" aria-label="Players">
            {roster.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => {
                  const on = e.target.checked;
                  setPicked((list) => (on ? [...list, p.id] : list.filter((x) => x !== p.id)));
                }} />
                  <Avatar name={p.name} size="xs" />
                  <span>{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
          {editing && editing !== 'new' && (
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete group
            </Button>
          )}
        </div>
      </PracticeSheet>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this group?"
        description="Plans that already use it keep their players."
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      />
    </main>
  );
}

/** A template's first few rows, from its own body: the same glance Documents draws. */
function BodyGlance({ body }: { body: PlanBodyV2 }) {
  return (
    <ul className="ch-prc-glance" aria-hidden="true">
      {body.variants.main.blocks.slice(0, 3).map((b) => (
        <li key={b.id}>
          <span className="ch-num">{b.len} min</span>
          <span>{b.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** Templates (N-00 4.16): GolfHelm's six first, then the team's, by kind. Use opens New plan with this start. */
export function TemplatesPage({ teamId, templates, preview = false }: { teamId: string; templates: ChPracticeTemplate[]; preview?: boolean }) {
  const phone = useChPhone();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useRefresh();
  const [kind, setKind] = useState<'session' | 'block' | 'week'>('session');
  const [renaming, setRenaming] = useState<ChPracticeTemplate | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<ChPracticeTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const startFrom = (ref: string) => router.push(`/golf/dashboard/practice?new=1&template=${encodeURIComponent(ref)}`);
  const duplicate = async (t: { name: string; minutes: number; body: PlanBodyV2; kind: 'session' | 'block' }) => {
    if (preview) return;
    const r = await savePracticeTemplate({ teamId, name: t.name, kind: t.kind, minutes: t.minutes, body: t.body }).catch(() => ({ success: false as const, error: 'Couldn’t save the template.' }));
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t save the template.' });
    toast({ title: 'Added to your templates' });
    refresh();
  };
  const rename = async () => {
    if (!renaming) return;
    if (preview) return setRenaming(null);
    setBusy(true);
    const r = await renamePracticeTemplate({ teamId, templateId: renaming.id, name }).catch(() => ({ success: false as const, error: 'Couldn’t rename the template.' }));
    setBusy(false);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t rename the template.' });
    setRenaming(null);
    refresh();
  };
  const remove = async () => {
    if (!deleting) return;
    if (preview) return setDeleting(null);
    setBusy(true);
    const r = await deletePracticeTemplate({ teamId, templateId: deleting.id }).catch(() => ({ success: false as const, error: 'Couldn’t delete the template.' }));
    setBusy(false);
    setDeleting(null);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t delete the template.' });
    refresh();
  };
  const mine = templates.filter((t) => t.kind === kind);
  return (
    <main className={'ch-page ch-prc' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      <LibraryHead tab="templates" title="Templates" />
      {kind === 'session' && (
        <section className="ch-prc-sec" aria-label="From GolfHelm">
          <h2>From GolfHelm</h2>
          <ul className="ch-prc-cards">
            {PLAN_STARTERS.map((s) => (
              <li key={s.id} className="ch-prc-card ch-prc-tmpl">
                <button type="button" className="ch-prc-tmpl__go" onClick={() => startFrom(s.id)}>
                  <b>{s.name}</b>
                  <span className="ch-num">Session · {hours(s.minutes)}</span>
                  <small>{s.line}</small>
                  <BodyGlance body={s.body} />
                </button>
                <Menu label={`${s.name}: more`} align="end" trigger={(p) => <IconButton icon={Ellipsis} size="sm" label={`${s.name}: more`} menu={p} />} items={[{ label: 'Use', onSelect: () => startFrom(s.id) }, { label: 'Duplicate to your templates', onSelect: () => void duplicate({ name: s.name, minutes: s.minutes, body: s.body, kind: 'session' }) }]} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="ch-prc-sec" aria-label="Your templates">
        <div className="ch-prc-sec__h">
          <h2>Your templates</h2>
          <Segmented size="sm" label="Kind" value={kind} onChange={setKind} options={[{ value: 'session', label: 'Session' }, { value: 'block', label: 'Block' }, { value: 'week', label: 'Week' }]} />
        </div>
        {mine.length === 0 ? (
          <p className="ch-prc-none">Save a plan as a template from the builder’s menu, and it shows up here.</p>
        ) : (
          <ul className="ch-prc-cards">
            {mine.map((t) => (
              <li key={t.id} className="ch-prc-card ch-prc-tmpl">
                <button type="button" className="ch-prc-tmpl__go" onClick={() => startFrom(t.id)}>
                  <b>{t.name}</b>
                  <span className="ch-num">{t.kind === 'block' ? 'Block' : t.kind === 'week' ? 'Week' : 'Session'}{t.minutes ? ` · ${hours(t.minutes)}` : ''}</span>
                  <BodyGlance body={t.body} />
                </button>
                <Menu
                  label={`${t.name}: more`}
                  align="end"
                  trigger={(p) => <IconButton icon={Ellipsis} size="sm" label={`${t.name}: more`} menu={p} />}
                  items={[
                    { label: 'Use', onSelect: () => startFrom(t.id) },
                    { label: 'Duplicate', onSelect: () => void duplicate({ name: `${t.name} copy`, minutes: t.minutes ?? 60, body: t.body, kind: t.kind === 'block' ? 'block' : 'session' }) },
                    {
                      label: 'Rename',
                      onSelect: () => {
                        setRenaming(t);
                        setName(t.name);
                      },
                    },
                    { label: 'Delete', danger: true, onSelect: () => setDeleting(t) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <PracticeSheet open={!!renaming} onClose={() => setRenaming(null)} title="Rename template" onAction={() => void rename()} actionDisabled={!name.trim()} busy={busy}>
        <div className="ch-prc-fields">
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-prc-t-n">
              Name
            </label>
            <input id="ch-prc-t-n" className="ch-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
      </PracticeSheet>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this template?"
        description="Plans made from it stay as they are."
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      />
    </main>
  );
}
