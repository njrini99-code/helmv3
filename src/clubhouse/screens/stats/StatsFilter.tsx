'use client';

import { CalendarRange, Info, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  candidates,
  clearFilters,
  dayLabel,
  filterChips,
  filterSummary,
  hasRange,
  isFiltered,
  KIND_LABEL,
  PER_18_NOTE,
  ROUND_KINDS,
  roundsWord,
  sameFilter,
  withCourses,
  withHoles,
  withPick,
  withRange,
  withTypes,
  withWindow,
  type ChFilter,
  type ChFilterOptions,
  type ChHoles,
  type ChRoundKind,
  type ChWindow,
} from '../../data/stats-filter';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/States';
import { haptic } from '../../lib/haptics';
import { WindowSwitch } from './WindowSwitch';

/** The catalog codes one page gives the filter's states (the team page's are 4xxx, a profile's 5xxx). */
export interface ChFilterCodes {
  /** The filter leaves no round. */
  empty: string;
  /** The pick list has nothing to offer under the current choices. */
  pickEmpty: string;
  /** The pick list is cut at its size. */
  pickCap: string;
  /** The range starts after it ends. */
  range: string;
  /** Nine-hole rounds are in: how they count (per 18, a nine-hole round is half a round). */
  holes: string;
}

type PickMode = 'off' | 'only' | 'skip';

const HOLES: ReadonlyArray<{ value: ChHoles; label: string }> = [
  { value: '18', label: '18 holes' },
  { value: '9', label: '9 holes' },
  { value: 'all', label: 'Both' },
];

const MODES: ReadonlyArray<{ value: PickMode; label: string }> = [
  { value: 'off', label: 'All matching' },
  { value: 'only', label: 'Only these' },
  { value: 'skip', label: 'Exclude these' },
];

/**
 * The round filter: a Filter button, the active filters as removable chips with a Clear, the count line
 * ("12 rounds: tournaments, Sep 1 to Sep 29"), and a sheet to choose round type, time, course and
 * individual rounds. Removing a chip applies at once; the sheet applies on Done. Every change is an
 * address change made by the page (`onChange`), so it goes through the same offline refusal and slow
 * notice as a window change, and the server reads the same filter for every figure.
 */
export function StatsFilter({
  filter,
  options,
  count,
  codes,
  onChange,
  phone = false,
  team = false,
}: {
  filter: ChFilter;
  options: ChFilterOptions;
  /** The rounds the page is counting under the filter. */
  count: number;
  codes: ChFilterCodes;
  onChange: (next: ChFilter) => void;
  phone?: boolean;
  /** The pick list names each round's player. */
  team?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const year = useMemo(() => new Date().getUTCFullYear(), []);
  const chips = filterChips(filter, year);
  const active = isFiltered(filter);
  return (
    <section className={'ch-sf' + (phone ? ' is-phone' : '')} aria-label="Round filter">
      <div className="ch-sf__bar">
        <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm ch-sf__open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon icon={SlidersHorizontal} size={14} />
          <span>Filter</span>
          {chips.length > 0 && <span className="ch-sf__n ch-num" aria-label={`${chips.length} on`}>{chips.length}</span>}
        </button>
        {chips.length > 0 && (
          <ul className="ch-sf__chips" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className="ch-sf__chip"
                  aria-label={`Remove filter: ${c.label}`}
                  onClick={() => {
                    haptic('select');
                    onChange(c.next);
                  }}
                >
                  <span>{c.label}</span>
                  <Icon icon={X} size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {active && (
          <button
            type="button"
            className="ch-sf__clear"
            aria-label="Clear filters"
            onClick={() => {
              haptic('select');
              onChange(clearFilters(filter));
            }}
          >
            Clear
          </button>
        )}
      </div>
      {active && (
        <p className="ch-sf__count ch-num" role="status">
          {filterSummary(filter, count, year)}
        </p>
      )}
      {filter.holes !== '18' && (
        <p className="ch-sf__note" data-ch-code={codes.holes}>
          {PER_18_NOTE}
        </p>
      )}
      <FilterSheet open={open} onClose={() => setOpen(false)} filter={filter} options={options} codes={codes} onApply={onChange} team={team} />
    </section>
  );
}

/**
 * No round of the length the page reads (18 holes unless the filter says otherwise), but choosing Both would show 9-hole rounds in this
 * window (its time, type and course): where to find them. Nothing when it would show none, so the hint never sends anyone to an empty page.
 */
export function NineHint({ code, filter, options, who }: { code: string; filter: ChFilter; options: ChFilterOptions; who: string }) {
  if (!candidates(options.rounds, withHoles(filter, 'all'), options.seasonStart, (r) => r).some((r) => r.holes === 9)) return null;
  return (
    <div className="ch-pf-early" role="note" data-ch-code={code}>
      <Icon icon={Info} size={15} />
      {who} 9-hole rounds in this window, which the 18-hole view leaves out. Choose 9 holes or Both in Filter to see them.
    </div>
  );
}

/** The filter leaves one or two rounds (team page): every average and trend moves a lot on so few. */
export function EarlyRead({ code, count, whole = count }: { code: string; count: number; /** The rounds in whole rounds (a 9-hole round is half): what the floor counts. */ whole?: number }) {
  return (
    <div className="ch-pf-early" role="note" data-ch-code={code}>
      <Icon icon={Info} size={15} />
      Early read. {count === 1 ? 'One round matches' : `${count} rounds match`} these filters{whole === count ? '' : `, ${roundsWord(whole)} counting 9-hole rounds as half`}, so the averages and trends will move a lot. Strokes gained shows once a player has three rounds with shots.
    </div>
  );
}

/** The empty state when the filter matches nothing: says so, and Clear filters is the way back. */
export function FilterEmpty({ code, onClear }: { code: string; onClear: () => void }) {
  return (
    <div className="ch-st-card">
      <EmptyState
        code={code}
        icon={SlidersHorizontal}
        title="No rounds match these filters."
        body="Try a wider time, fewer round types, or clear the filters to see every round again."
        action={
          <Button size="sm" variant="primary" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    </div>
  );
}

function FilterSheet({
  open,
  onClose,
  filter,
  options,
  codes,
  onApply,
  team,
}: {
  open: boolean;
  onClose: () => void;
  filter: ChFilter;
  options: ChFilterOptions;
  codes: ChFilterCodes;
  onApply: (next: ChFilter) => void;
  team: boolean;
}) {
  const uid = useId();
  // The draft: what the page has now, changed in the sheet and applied on Done.
  const [draft, setDraft] = useState<ChFilter>(filter);
  const [from, setFrom] = useState(filter.from ?? '');
  const [to, setTo] = useState(filter.to ?? '');
  const [mode, setMode] = useState<PickMode>(filter.pick?.mode ?? 'off');
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(filter.pick?.ids ?? []));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDraft(filter);
    setFrom(filter.from ?? '');
    setTo(filter.to ?? '');
    setMode(filter.pick?.mode ?? 'off');
    setTicked(new Set(filter.pick?.ids ?? []));
    setTouched(false);
    // Reset only when the sheet opens; the filter it opened on is what it starts from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const badRange = from !== '' && to !== '' && from > to;
  // The other choices as the page would read them (no picks yet): what can be picked among.
  const base = useMemo(() => withRange(withPick(draft, null), badRange ? null : from || null, badRange ? null : to || null), [draft, from, to, badRange]);
  const pickable = useMemo(() => candidates(options.rounds, base, options.seasonStart, (r) => r), [options, base]);
  const year = new Date().getUTCFullYear();
  const capped = options.total > options.rounds.length;
  const earlier = !!from && from < options.seasonStart;

  const setType = (k: ChRoundKind | 'all') => {
    haptic('select');
    setDraft((d) => (k === 'all' ? withTypes(d, []) : withTypes(d, d.types.includes(k) ? d.types.filter((x) => x !== k) : [...d.types, k])));
  };
  const setWindow = (w: ChWindow) => {
    setFrom('');
    setTo('');
    setDraft((d) => withWindow(d, w));
  };
  const toggleCourse = (name: string, on: boolean) => setDraft((d) => withCourses(d, on ? [...d.courses, name] : d.courses.filter((c) => c !== name)));
  const toggleRound = (id: string, on: boolean) =>
    setTicked((t) => {
      const next = new Set(t);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const apply = () => {
    setTouched(true);
    if (badRange) {
      haptic('warning');
      document.getElementById(`${uid}-from`)?.focus();
      return;
    }
    const ranged = withRange(draft, from || null, to || null);
    // A pick never names a round the filter would not list, so the chip and the count agree.
    const canPick = new Set(candidates(options.rounds, withPick(ranged, null), options.seasonStart, (r) => r).map((r) => r.id));
    const ids = [...ticked].filter((id) => canPick.has(id));
    const next = withPick(ranged, mode === 'off' ? null : { mode, ids });
    if (!sameFilter(next, filter)) onApply(next);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={SlidersHorizontal}
      title="Filter rounds"
      description="Choose which rounds every figure counts."
      width={600}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(clearFilters(draft));
              setFrom('');
              setTo('');
              setMode('off');
              setTicked(new Set());
              setTouched(false);
            }}
          >
            Clear
          </Button>
          <Button variant="primary" onClick={apply}>
            Done
          </Button>
        </>
      }
    >
      <div className="ch-sf-sheet">
        <div className="ch-sf-sec" role="group" aria-labelledby={`${uid}-type`}>
          <h3 id={`${uid}-type`}>Round type</h3>
          <div className="ch-pills">
            <button type="button" className="ch-pill ch-num" aria-pressed={draft.types.length === 0} onClick={() => setType('all')}>
              All
            </button>
            {ROUND_KINDS.map((k) => (
              <button key={k} type="button" className="ch-pill ch-num" aria-pressed={draft.types.includes(k)} onClick={() => setType(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="ch-sf-sec" role="group" aria-labelledby={`${uid}-holes`}>
          <h3 id={`${uid}-holes`}>Holes</h3>
          <div className="ch-pills">
            {HOLES.map((h) => (
              <button
                key={h.value}
                type="button"
                className="ch-pill ch-num"
                aria-pressed={draft.holes === h.value}
                onClick={() => {
                  if (draft.holes !== h.value) haptic('select');
                  setDraft((d) => withHoles(d, h.value));
                }}
              >
                {h.label}
              </button>
            ))}
          </div>
          <p className="ch-field__help">{draft.holes === '18' ? 'Nine-hole rounds are left out.' : PER_18_NOTE}</p>
        </div>

        <div className="ch-sf-sec" role="group" aria-labelledby={`${uid}-time`}>
          <h3 id={`${uid}-time`}>Time</h3>
          <WindowSwitch value={draft.window} onChange={setWindow} custom={hasRange(withRange(draft, from || null, to || null)) && !badRange} />
          <div className="ch-sf-range">
            <label className="ch-field" htmlFor={`${uid}-from`}>
              <span className="ch-field__label">From</span>
              <input
                id={`${uid}-from`}
                type="date"
                className="ch-input ch-num"
                value={from}
                min="2000-01-01"
                max="2100-12-31"
                aria-invalid={touched && badRange}
                aria-describedby={`${uid}-range-help`}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="ch-field" htmlFor={`${uid}-to`}>
              <span className="ch-field__label">To</span>
              <input
                id={`${uid}-to`}
                type="date"
                className="ch-input ch-num"
                value={to}
                min="2000-01-01"
                max="2100-12-31"
                aria-invalid={touched && badRange}
                aria-describedby={`${uid}-range-help`}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <p id={`${uid}-range-help`} className={'ch-field__help' + (touched && badRange ? ' is-error' : '')} data-ch-code={touched && badRange ? codes.range : undefined}>
            {touched && badRange
              ? 'The start date is after the end date. Swap them, or clear one.'
              : 'A date range replaces the window: every round in it counts, including rounds before this season.'}
          </p>
        </div>

        {options.courses.length > 1 && (
          <div className="ch-sf-sec" role="group" aria-labelledby={`${uid}-course`}>
            <h3 id={`${uid}-course`}>Course</h3>
            <ul className="ch-sf-list ch-sf-list--courses">
              {options.courses.map((c) => (
                <li key={c.name}>
                  <Checkbox checked={draft.courses.includes(c.name)} onChange={(on) => toggleCourse(c.name, on)}>
                    <span className="ch-sf-row">
                      <span className="ch-sf-row__main">{c.name}</span>
                      <span className="ch-sf-row__n ch-num">{c.count}</span>
                    </span>
                  </Checkbox>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="ch-sf-sec" role="group" aria-labelledby={`${uid}-pick`}>
          <h3 id={`${uid}-pick`}>Pick rounds</h3>
          <div className="ch-pills">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className="ch-pill ch-num"
                aria-pressed={mode === m.value}
                onClick={() => {
                  if (mode !== m.value) haptic('select');
                  setMode(m.value);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode !== 'off' && (
            <>
              <p className="ch-field__help" id={`${uid}-pick-help`}>
                {mode === 'only'
                  ? `Tick the rounds to keep. Exactly those count, however many there are${ticked.size ? ` (${ticked.size} ticked)` : ''}. With none ticked, every matching round counts.`
                  : `Tick the rounds to leave out${ticked.size ? ` (${ticked.size} ticked)` : ''}. The rest still follow the window.`}
              </p>
              {pickable.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarRange}
                  code={codes.pickEmpty}
                  title="No rounds to pick from."
                  body={
                    earlier
                      ? `Rounds before ${dayLabel(options.seasonStart, options.seasonStart.slice(0, 4) !== String(year))} load once the range is applied. Apply it, then open Filter again to pick among them.`
                      : 'Nothing matches the round type, course and time above. Widen them, then pick.'
                  }
                />
              ) : (
                <ul className="ch-sf-list" aria-label={mode === 'only' ? 'Rounds to keep' : 'Rounds to leave out'} aria-describedby={`${uid}-pick-help`}>
                  {pickable.map((r) => (
                    <li key={r.id}>
                      <Checkbox checked={ticked.has(r.id)} onChange={(on) => toggleRound(r.id, on)}>
                        <span className="ch-sf-row">
                          <span className="ch-sf-row__date ch-num">{dayLabel(r.date, !r.date.startsWith(String(year)))}</span>
                          <span className="ch-sf-row__main">
                            {team && r.player ? `${r.player} · ` : ''}
                            {r.course ?? 'Course not recorded'}
                          </span>
                          {r.holes === 9 && <span className="ch-gx-type">9 holes</span>}
                          {r.kind && <span className={`ch-gx-type is-${r.kind}`}>{KIND_LABEL[r.kind]}</span>}
                          <span className="ch-sf-row__n ch-num">{r.score}</span>
                        </span>
                      </Checkbox>
                    </li>
                  ))}
                </ul>
              )}
              {capped && (
                <p className="ch-field__help" data-ch-code={codes.pickCap}>
                  Showing the newest {options.rounds.length} of {options.total} rounds. Narrow the time or the course to reach the rest.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
