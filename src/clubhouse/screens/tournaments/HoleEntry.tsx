'use client';

import { Check, TriangleAlert } from 'lucide-react';
import { Fragment, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { importTournamentResults } from '@/app/golf/actions/tournaments-import';
import { haptic } from '../../lib/haptics';
import { plural } from '../../lib/plural';
import { friendlyReason, useAction } from '../../lib/use-action';
import { useRefresh } from '../../lib/use-refresh';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';
import { EmptyState } from '../../ui/States';
import { tourDay } from './format';
import { ImpField } from './ImportResults';
import { advancesAfter, CELL_ERROR_WORDS, cellKey, gridCards, gridErrors, gridFor, rowSum, shownHoles, type ChGrid, type ChGridEdits } from './import/grid';
import { ToPar, TourChip } from './parts';
import type { ChTourDeskData } from './types';
import '../../styles/tournaments-import.css';

const NO_GRID = {
  no_round: {
    title: 'This round isn’t in the event',
    body: 'Choose another round.',
  },
  no_pars: {
    title: 'The course has no hole pars yet',
    body: 'Add the pars to the course on the event, then enter holes. Round totals can be entered from the live round meanwhile.',
  },
  no_players: {
    title: 'No one is in this round yet',
    body: 'Set the lineup first; the grid lists every player in the round.',
  },
} as const;

/**
 * Enter holes (launch readiness F-01): the whole round at once on a desktop, as a coach types a stack of paper cards in
 * after the round. Players down the side, holes across, Out, In, total and to par worked out as they type. A digit
 * from 2 to 9 moves to the next hole; arrows and Enter move around (CH-16880). Saving writes each changed row as that
 * player's tournament card through the same path as an import, so a submitted round is never changed (D-82) and a
 * total entered by hand is replaced by the card.
 */
export function HoleEntry({ open, onClose, data, round: initial }: { open: boolean; onClose: () => void; data: ChTourDeskData; round: number }) {
  const e = data.event;
  const { refresh } = useRefresh();
  const [was, setWas] = useState(false);
  const [round, setRound] = useState(initial);
  // Typed text per round, so moving between rounds keeps what was typed.
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [leaving, setLeaving] = useState(false);
  const table = useRef<HTMLTableElement>(null);
  if (open !== was) {
    setWas(open);
    if (open) {
      setRound(initial);
      setEdits({});
      setLeaving(false);
    }
  }

  const grids = useMemo(() => {
    const out = new Map<number, ReturnType<typeof gridFor>>();
    for (const r of e.rounds) out.set(r.number, gridFor(e, data.players, data.holes, data.courses, r.number));
    return out;
  }, [e, data.players, data.holes, data.courses]);
  const now = grids.get(round) ?? gridFor(e, data.players, data.holes, data.courses, round);
  const typed: ChGridEdits = edits[round] ?? {};

  const cards = e.rounds.flatMap((r) => {
    const g = grids.get(r.number);
    return g?.ok ? gridCards(g.grid, edits[r.number] ?? {}) : [];
  });
  const errors = now.ok ? gridErrors(now.grid, typed) : [];
  const badCells = e.rounds.reduce((n, r) => {
    const g = grids.get(r.number);
    return n + (g?.ok ? gridErrors(g.grid, edits[r.number] ?? {}).length : 0);
  }, 0);
  const anyErrors = badCells > 0;
  const players = new Set(cards.map((c) => c.playerId)).size;

  const save = useAction(
    'tournaments.enterHoles',
    importTournamentResults,
    {
      done: `Holes saved for ${plural(players, 'player')}`,
      failed: 'Couldn’t save the holes',
      hint: 'What you typed is still here. Try again.',
      code: 'CH-16081',
    },
    (r, c) => {
      // A refined hint is shown as written, so a refusal keeps the server's words ahead of the fallback.
      if (!r.success) return { ...c, hint: friendlyReason(r.error) ?? c.hint };
      const kept = r.data?.kept.length ?? 0;
      return kept
        ? {
            ...c,
            done: `${c.done}. ${plural(kept, 'round')} kept as ${kept === 1 ? 'it was' : 'they were'}`,
          }
        : c;
    },
  );

  const tryClose = () => (cards.length || Object.values(edits).some((x) => Object.keys(x).length) ? setLeaving(true) : onClose());
  const doSave = async () => {
    const r = await save.run({ tournamentId: e.id, cards, teams: [] });
    if (r.success) {
      refresh();
      onClose();
    }
  };

  const type = (key: string, value: string) =>
    setEdits((all) => ({
      ...all,
      [round]: { ...(all[round] ?? {}), [key]: value },
    }));

  // Arrows, Enter and a whole score move between cells (CH-16880).
  const focusCell = (r: number, h: number) => {
    const el = table.current?.querySelector<HTMLInputElement>(`input[data-cell="${r}:${h}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const onKey = (ev: KeyboardEvent<HTMLInputElement>, r: number, h: number, last: number, rows: number) => {
    const move = (dr: number, dh: number) => {
      ev.preventDefault();
      let nh = h + dh;
      let nr = r + dr;
      if (nh > last) {
        nh = 1;
        nr += 1;
      } else if (nh < 1) {
        nh = last;
        nr -= 1;
      }
      if (nr >= 0 && nr < rows) focusCell(nr, nh);
    };
    if (ev.key === 'ArrowRight') move(0, 1);
    else if (ev.key === 'ArrowLeft') move(0, -1);
    else if (ev.key === 'ArrowDown' || ev.key === 'Enter') move(1, 0);
    else if (ev.key === 'ArrowUp') move(-1, 0);
  };

  const course = data.courses[e.rounds.find((r) => r.number === round)?.courseId ?? e.courseIds[0] ?? ''];
  const roundDate = e.rounds.find((r) => r.number === round)?.date;

  return (
    <>
      <Modal
        open={open && !leaving}
        onClose={tryClose}
        title="Enter holes"
        description={[course ? `${course.name} · ${course.tees}` : null, roundDate ? tourDay(roundDate) : null].filter(Boolean).join(' · ')}
        width={1120}
        className="ch-tour-imp-modal"
        footer={
          <>
            <Button variant="ghost" onClick={tryClose}>
              Cancel
            </Button>
            <Button variant="primary" leftIcon={Check} busy={save.pending} disabled={!cards.length || anyErrors} onClick={() => void doSave()}>
              {save.pending ? 'Saving…' : anyErrors ? `Fix ${plural(badCells, 'hole')} to save` : cards.length ? `Save holes for ${plural(players, 'player')}` : 'Nothing to save'}
            </Button>
          </>
        }
      >
        <div className="ch-tour-imp">
          {e.rounds.length > 1 && (
            <div className="ch-tour-imp-ask">
              <ImpField className="ch-tour-imp-ask__f" label="Round">
                {(id) => (
                  <Select
                    id={id}
                    value={String(round)}
                    options={e.rounds.map((r) => {
                      const n = Object.keys(edits[r.number] ?? {}).length;
                      return {
                        value: String(r.number),
                        label: `Round ${r.number}${n ? ' · typed' : ''}`,
                      };
                    })}
                    onChange={(v) => {
                      haptic('select');
                      setRound(Number(v));
                    }}
                  />
                )}
              </ImpField>
            </div>
          )}
          {!now.ok ? (
            <EmptyState compact kind="first-run" code="CH-16381" title={NO_GRID[now.why].title} body={NO_GRID[now.why].body} />
          ) : (
            <Grid grid={now.grid} edits={typed} tableRef={table} onType={type} onKey={onKey} focusCell={focusCell} errors={errors} />
          )}
        </div>
      </Modal>
      <Modal
        open={open && leaving}
        onClose={() => setLeaving(false)}
        icon={TriangleAlert}
        code="CH-16581"
        title="Leave without saving?"
        description={cards.length ? `The holes you typed for ${plural(players, 'player')} aren’t saved.` : 'What you typed isn’t saved.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              Keep typing
            </Button>
            {/* The warning came with the question (D-70): the yes is silent, and the sheet closing answers. */}
            <Button variant="danger" feel={null} onClick={onClose}>
              Leave
            </Button>
          </>
        }
      />
    </>
  );
}

function Grid({
  grid,
  edits,
  tableRef,
  onType,
  onKey,
  focusCell,
  errors,
}: {
  grid: ChGrid;
  edits: ChGridEdits;
  tableRef: RefObject<HTMLTableElement | null>;
  onType: (key: string, value: string) => void;
  onKey: (ev: KeyboardEvent<HTMLInputElement>, r: number, h: number, last: number, rows: number) => void;
  focusCell: (r: number, h: number) => void;
  errors: ReturnType<typeof gridErrors>;
}) {
  const n = grid.pars.length;
  const nines = n === 18 ? [grid.pars.slice(0, 9), grid.pars.slice(9)] : [grid.pars];
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const errorAt = (playerId: string, hole: number) => errors.find((x) => x.playerId === playerId && x.hole === hole);
  const errId = (playerId: string, hole: number) => `ch-tour-imp-g-e-${playerId}-${hole}`;
  return (
    <>
      <div className="ch-tour-imp-g-wrap" role="region" aria-label={`Round ${grid.roundNumber} holes`} tabIndex={-1}>
        <table ref={tableRef} className="ch-tour-imp-g ch-num" data-ch-code="CH-16880">
          <thead>
            <tr>
              <th scope="col" className="ch-tour-imp-g__who">
                Hole
              </th>
              {nines.map((nine, k) => (
                <Fragment key={k}>
                  {nine.map((_, i) => (
                    <th key={i} scope="col" className="ch-num">
                      {k * 9 + i + 1}
                    </th>
                  ))}
                  {n === 18 && (
                    <th scope="col" className="ch-tour-imp-g__sub">
                      {k === 0 ? 'Out' : 'In'}
                    </th>
                  )}
                </Fragment>
              ))}
              <th scope="col" className="ch-tour-imp-g__sub">
                Total
              </th>
              <th scope="col" className="ch-tour-imp-g__sub">
                To par
              </th>
            </tr>
            <tr className="ch-tour-imp-g__par">
              <th scope="row" className="ch-tour-imp-g__who">
                Par
              </th>
              {nines.map((nine, k) => (
                <Fragment key={k}>
                  {nine.map((p, i) => (
                    <td key={i} className="ch-num">
                      {p}
                    </td>
                  ))}
                  {n === 18 && <td className="ch-num ch-tour-imp-g__sub">{sum(nine)}</td>}
                </Fragment>
              ))}
              <td className="ch-num ch-tour-imp-g__sub">{sum(grid.pars)}</td>
              <td className="ch-tour-imp-g__sub" />
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, ri) => {
              const holes = shownHoles(row, edits);
              const front = rowSum(holes.slice(0, 9), grid.pars.slice(0, 9));
              const back = rowSum(holes.slice(9), grid.pars.slice(9));
              const all = rowSum(holes, grid.pars);
              const changed = holes.some((h, i) => h !== (row.saved[i] ?? null));
              return (
                <tr key={row.playerId} className={row.locked ? 'is-locked' : undefined} data-ch-grid-row={row.playerId}>
                  <th scope="row" className="ch-tour-imp-g__who">
                    <span>{row.name}</span>
                    {row.locked ? (
                      <TourChip>Submitted</TourChip>
                    ) : row.entered != null ? (
                      <TourChip tone={changed ? 'warn' : undefined}>{changed ? `Replaces ${row.entered}` : `Entered ${row.entered}`}</TourChip>
                    ) : null}
                  </th>
                  {nines.map((nine, k) => (
                    <Fragment key={k}>
                      {nine.map((par, i) => {
                        const h = k * 9 + i + 1;
                        const key = cellKey(row.playerId, h);
                        const value = edits[key] ?? (row.saved[h - 1] == null ? '' : String(row.saved[h - 1]));
                        const err = errorAt(row.playerId, h);
                        const strokes = holes[h - 1];
                        return (
                          <td key={h} className={strokes != null && strokes < par ? 'is-under' : undefined}>
                            <input
                              className="ch-tour-imp-g__in ch-num"
                              data-cell={`${ri}:${h}`}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={2}
                              autoComplete="off"
                              readOnly={!!row.locked}
                              aria-label={`${row.name}, hole ${h}, par ${par}`}
                              aria-invalid={err ? true : undefined}
                              aria-describedby={err ? errId(row.playerId, h) : undefined}
                              value={value}
                              onFocus={(ev) => ev.currentTarget.select()}
                              onChange={(ev) => {
                                const v = ev.currentTarget.value.replace(/\s/g, '');
                                onType(key, v);
                                if (advancesAfter(v)) focusCell(h === n ? ri + 1 : ri, h === n ? 1 : h + 1);
                              }}
                              onKeyDown={(ev) => onKey(ev, ri, h, n, grid.rows.length)}
                            />
                          </td>
                        );
                      })}
                      {n === 18 && <td className="ch-num ch-tour-imp-g__sub">{(k === 0 ? front : back).played ? (k === 0 ? front : back).strokes : '—'}</td>}
                    </Fragment>
                  ))}
                  <td className="ch-num ch-tour-imp-g__sub ch-tour-imp-g__tot">{all.played ? all.strokes : '—'}</td>
                  <td className="ch-tour-imp-g__sub">{all.played ? <ToPar value={all.toPar} /> : <span className="ch-num">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errors.length > 0 && (
        <ul className="ch-tour-imp-g__errors" role="alert" data-ch-code="CH-16182">
          {errors.map((x) => (
            <li key={`${x.playerId}-${x.hole}`} id={errId(x.playerId, x.hole)}>
              {grid.rows.find((r) => r.playerId === x.playerId)?.name ?? 'Player'}, hole {x.hole}: {CELL_ERROR_WORDS[x.error]}
            </li>
          ))}
        </ul>
      )}
      <p className="ch-tour-imp-note">
        A submitted round is the player’s own and stays as it is. A total entered by hand is replaced by the holes once they are typed.
      </p>
    </>
  );
}
