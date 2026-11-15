'use client';

import { TERMS } from '../../../lib/glossary';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { createTeamDrill } from '@/app/golf/actions/practice-library';
import type { PlanBlock, PlanBodyV2, StationsBlock } from '@/lib/coachhelm/v3/practice-plan/model';
import { stationsLen } from '@/lib/coachhelm/v3/practice-plan/model';
import type { ChBankDrill } from '../../../data/practice-home-shape';
import { haptic } from '../../../lib/haptics';
import { Button } from '../../../ui/Button';
import { PracticeSheet } from '../PracticeSheet';
import { Icon } from '../../../ui/Icon';
import { Select } from '../../../ui/Select';
import { fmtMinutes, PLACES, setHoles, setStationCount, stepLength } from './builder-model';

const KIND_LABEL = { skill: 'Skill', random: 'Random', pressure: 'Pressure' } as const;
export const kindLabel = (k: ChBankDrill['kind']) => KIND_LABEL[k];
const FORMATS: ReadonlyArray<{ value: 'stroke' | 'scramble' | 'best_ball' | 'worst_ball' | 'match'; label: string }> = [
  { value: 'stroke', label: 'Stroke play' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'best_ball', label: 'Best ball' },
  { value: 'worst_ball', label: 'Worst ball' },
  { value: 'match', label: 'Match play' },
];

function Stepper({ label, value, onLess, onMore, lessOff, moreOff }: { label: string; value: string; onLess: () => void; onMore: () => void; lessOff?: boolean; moreOff?: boolean }) {
  return (
    <div className="ch-prc-step" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Less, ${label}`}
        disabled={lessOff}
        onClick={() => {
          haptic('select');
          onLess();
        }}
      >
        <Icon icon={Minus} size={16} />
      </button>
      <output className="ch-num" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        aria-label={`More, ${label}`}
        disabled={moreOff}
        onClick={() => {
          haptic('select');
          onMore();
        }}
      >
        <Icon icon={Plus} size={16} />
      </button>
    </div>
  );
}

function PlaceField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const list = `${id}-places`;
  return (
    <>
      <input id={id} className="ch-input" list={list} maxLength={40} value={value} placeholder="Where" onChange={(e) => onChange(e.target.value)} />
      <datalist id={list}>
        {PLACES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

/** A block's fields by kind (N-00 4.5): the phone's sheet and the desk's inspector draw the same ones. */
export function BlockFields({ block, body, onChange, onRemove }: { block: PlanBlock; body: PlanBodyV2; onChange: (next: PlanBlock) => void; onRemove?: () => void }) {
  const id = useId();
  const set = (patch: Partial<PlanBlock>) => onChange({ ...block, ...patch } as PlanBlock);
  const titleBad = !block.title.trim();
  return (
    <div className="ch-prc-fields">
      <div className="ch-field">
        <label className="ch-field__label" htmlFor={`${id}-t`}>
          Name
        </label>
        <input id={`${id}-t`} className="ch-input" maxLength={80} value={block.title} aria-invalid={titleBad || undefined} onChange={(e) => set({ title: e.target.value })} />
        {titleBad && <span className="ch-field__help is-error" role="alert">Name this block.</span>}
      </div>
      {block.kind === 'stations' ? (
        <StationsFields block={block} body={body} onChange={onChange} />
      ) : (
        <div className="ch-field">
          <span className="ch-field__label">Length</span>
          <Stepper label="Length" value={fmtMinutes(block.len)} lessOff={block.len <= 5} moreOff={block.len >= 360} onLess={() => onChange(stepLength(block, -5))} onMore={() => onChange(stepLength(block, 5))} />
        </div>
      )}
      {(block.kind === 'team' || block.kind === 'break' || block.kind === 'own') && (
        <div className="ch-field">
          <label className="ch-field__label" htmlFor={`${id}-p`}>
            Place
          </label>
          <PlaceField id={`${id}-p`} value={block.place} onChange={(place) => set({ place })} />
        </div>
      )}
      {block.kind === 'course' && (
        <>
          <div className="ch-prc-fields__two">
            <div className="ch-field">
              <span className="ch-field__label">From hole</span>
              <Stepper label="From hole" value={String(block.holeFrom)} lessOff={block.holeFrom <= 1} moreOff={block.holeFrom >= block.holeTo} onLess={() => onChange(setHoles(block, block.holeFrom - 1, block.holeTo))} onMore={() => onChange(setHoles(block, block.holeFrom + 1, block.holeTo))} />
            </div>
            <div className="ch-field">
              <span className="ch-field__label">To hole</span>
              <Stepper label="To hole" value={String(block.holeTo)} lessOff={block.holeTo <= block.holeFrom} moreOff={block.holeTo >= 18} onLess={() => onChange(setHoles(block, block.holeFrom, block.holeTo - 1))} onMore={() => onChange(setHoles(block, block.holeFrom, block.holeTo + 1))} />
            </div>
          </div>
          <div className="ch-field">
            <span className="ch-field__label">Format</span>
            <Select label="Format" value={block.format} options={FORMATS} onChange={(format) => onChange({ ...block, format })} />
          </div>
        </>
      )}
      <div className="ch-field">
        <label className="ch-field__label" htmlFor={`${id}-n`}>
          Note <span className="ch-field__opt">Optional</span>
        </label>
        <textarea id={`${id}-n`} className="ch-textarea" rows={2} maxLength={280} value={block.note} onChange={(e) => set({ note: e.target.value })} />
      </div>
      {onRemove && (
        <Button variant="ghost" leftIcon={Trash2} onClick={onRemove}>
          Delete block
        </Button>
      )}
    </div>
  );
}

function StationsFields({ block, body, onChange }: { block: StationsBlock; body: PlanBodyV2; onChange: (b: PlanBlock) => void }) {
  const id = useId();
  const withLen = (b: StationsBlock) => ({ ...b, len: stationsLen(b) });
  return (
    <>
      <div className="ch-prc-fields__two">
        <div className="ch-field">
          <span className="ch-field__label">Turn</span>
          <Stepper label="Turn minutes" value={`${block.turnMin} min`} lessOff={block.turnMin <= 5} moreOff={block.turnMin >= 60} onLess={() => onChange(stepLength(block, -5))} onMore={() => onChange(stepLength(block, 5))} />
        </div>
        <div className="ch-field">
          <span className="ch-field__label">Move between</span>
          <Stepper label="Move minutes" value={`${block.moveMin} min`} lessOff={block.moveMin <= 0} moreOff={block.moveMin >= 10} onLess={() => onChange(withLen({ ...block, moveMin: Math.max(0, block.moveMin - 5) }))} onMore={() => onChange(withLen({ ...block, moveMin: Math.min(10, block.moveMin + 5) }))} />
        </div>
      </div>
      <div className="ch-field">
        <span className="ch-field__label">Stations</span>
        <Stepper label="Stations" value={String(block.stations.length)} lessOff={block.stations.length <= 1} moreOff={block.stations.length >= 8} onLess={() => onChange(setStationCount(block, block.stations.length - 1, body))} onMore={() => onChange(setStationCount(block, block.stations.length + 1, body))} />
      </div>
      {block.stations.map((s, i) => (
        <div className="ch-field" key={s.id}>
          <label className="ch-field__label" htmlFor={`${id}-${s.id}`}>
            Station {i + 1}
          </label>
          <PlaceField id={`${id}-${s.id}`} value={s.place} onChange={(place) => onChange({ ...block, stations: block.stations.map((x) => (x.id === s.id ? { ...x, place } : x)) })} />
        </div>
      ))}
      <p className="ch-prc-fields__len ch-num">
        {fmtMinutes(block.len)} in all{block.groupIds.length ? ` · ${block.groupIds.length} groups rotate` : ' · set the groups next'}
      </p>
    </>
  );
}

const AREAS = ['All', 'Putting', TERMS.shortGame.long, 'Bunker', 'Approach', 'Tee', 'Course', 'Fitness', 'Mental'];

/** The one drill bank (S-PRC.drill-bank-sheet's list): search and area chips, your drills then GolfHelm's. The desk's rail and the phone's sheet draw the same. */
export function BankList({ drills, onPick, onNew, pickLabel }: { drills: ChBankDrill[]; onPick: (d: ChBankDrill) => void; onNew: () => void; pickLabel: string }) {
  const [q, setQ] = useState('');
  const [area, setArea] = useState('All');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return drills.filter((d) => (area === 'All' || d.area === area) && (!t || d.name.toLowerCase().includes(t)));
  }, [drills, q, area]);
  const own = shown.filter((d) => d.source === 'Your bank');
  const lib = shown.filter((d) => d.source === 'GolfHelm');
  const row = (d: ChBankDrill) => (
    <button key={d.ref} type="button" className="ch-prc-drill" onClick={() => onPick(d)} aria-label={`${pickLabel} ${d.name}`}>
      <b>{d.name}</b>
      <span className="ch-num">
        {d.area} · {KIND_LABEL[d.kind]} · {d.minutes} min · {d.source}
      </span>
    </button>
  );
  return (
    <div className="ch-prc-bank">
      <label className="ch-prc-bank__q">
        <Icon icon={Search} size={15} />
        <input className="ch-input" type="search" aria-label="Search drills" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="ch-pills" role="group" aria-label="Area">
        {AREAS.map((a) => (
          <button key={a} type="button" className="ch-pill" aria-pressed={a === area} onClick={() => setArea(a)}>
            {a}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="ch-prc-bank__none">{drills.length ? 'No drills match.' : 'No drills in your bank yet.'}</p>}
      {own.length > 0 && <h4>Your drills</h4>}
      {own.map(row)}
      {lib.length > 0 && <h4>GolfHelm drills</h4>}
      {lib.map(row)}
      <button type="button" className="ch-prc-add" onClick={onNew}>
        <Icon icon={Plus} size={14} /> New drill
      </button>
    </div>
  );
}

const DRILL_AREAS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'putting', label: 'Putting' },
  { value: 'short_game', label: TERMS.shortGame.long },
  { value: 'bunker', label: 'Bunker' },
  { value: 'approach', label: 'Approach' },
  { value: 'tee', label: 'Tee' },
  { value: 'course', label: 'Course' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'mental', label: 'Mental' },
];

/** New drill (S-PRC.drill-new): the fields a slot needs. Save adds it to the bank and the slot (CH-13083). `preview`: a press closes it and reaches no server. */
export function NewDrillSheet({ open, onClose, teamId, onSaved, preview = false }: { open: boolean; onClose: () => void; teamId: string; onSaved: (d: ChBankDrill) => void; preview?: boolean }) {
  const id = useId();
  const [name, setName] = useState('');
  const [area, setArea] = useState('putting');
  const [kind, setKind] = useState<ChBankDrill['kind']>('skill');
  const [minutes, setMinutes] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (preview) return onClose();
    setBusy(true);
    setError(null);
    try {
      const res = await createTeamDrill({ teamId, name, area, kind, minutes });
      if (!res.success) {
        setError(res.unavailable ? 'Your drill bank comes with the Practice tab.' : res.error);
        return;
      }
      onSaved({ ref: `team:${res.id}`, name: name.trim(), area: DRILL_AREAS.find((a) => a.value === area)?.label ?? area, kind, minutes, source: 'Your bank' });
      setName('');
    } catch {
      setError('Couldn’t save the drill. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <PracticeSheet open={open} onClose={onClose} title="New drill" actionLabel="Save" onAction={() => void save()} actionDisabled={!name.trim()} busy={busy} dirty={!!name} code="CH-13083" note={error ?? undefined}>
      <div className="ch-prc-fields">
        <div className="ch-field">
          <label className="ch-field__label" htmlFor={`${id}-n`}>
            Name
          </label>
          <input id={`${id}-n`} className="ch-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ch-prc-fields__two">
          <div className="ch-field">
            <span className="ch-field__label">Area</span>
            <Select label="Area" value={area} options={DRILL_AREAS} onChange={setArea} />
          </div>
          <div className="ch-field">
            <span className="ch-field__label">Kind</span>
            <Select<ChBankDrill['kind']> label="Kind" value={kind} options={[{ value: 'skill', label: 'Skill' }, { value: 'random', label: 'Random' }, { value: 'pressure', label: 'Pressure' }]} onChange={setKind} />
          </div>
        </div>
        <div className="ch-field">
          <span className="ch-field__label">Minutes</span>
          <Stepper label="Minutes" value={`${minutes} min`} lessOff={minutes <= 5} moreOff={minutes >= 180} onLess={() => setMinutes((m) => m - 5)} onMore={() => setMinutes((m) => m + 5)} />
        </div>
      </div>
    </PracticeSheet>
  );
}
