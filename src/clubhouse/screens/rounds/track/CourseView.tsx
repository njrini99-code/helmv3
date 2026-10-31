'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DistancePreference } from '@/lib/golf/distance-units';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { useDialogLifetime } from '../../../lib/dialog-lifetime';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Icon } from '../../../ui/Icon';
import { Tooltip } from '../../../ui/Tooltip';
import { distanceText, RESULT_LABEL, shotKind, shotTitle } from './labels';
import { HoleMap } from './parts';
import { pluralWord } from '../../../lib/plural';

/** "to the fairway", "holed", "+1 stroke". */
function whereTo(shot: ShotRecord): string {
  if (shot.isPenalty) return '+1 stroke';
  return shot.result === 'hole' ? 'holed' : `to the ${RESULT_LABEL[shot.result].toLowerCase()}`;
}

/** The figure at a row's end: how far a shot in yards went, or the putt's length. */
function shotFigure(shot: ShotRecord, pref: DistancePreference): string {
  if (shot.isPenalty) return '';
  if (shot.distanceUnitBefore === 'feet') return distanceText(shot.distanceToHoleBefore, 'feet', pref);
  return shot.shotDistance > 0 ? distanceText(Math.round(shot.shotDistance), 'yards', pref) : '';
}

/**
 * The course view (owner board 3b): tap the hole on the shot screen and it opens full screen, the drawn hole top to
 * bottom with the 50/100/150 rings from the pin and every shot numbered with its club and distance, and a sheet
 * listing this hole's shots. ‹ › look at another hole: they only change what this view shows, never the hole being
 * scored (that is the strip's job, with its unsaved-shot question). No GPS, satellite or course geometry: the course
 * factory is on hold (owner, 2026-10-08), and nothing here reads new data. "Your last 3 here" and "Team average here"
 * from the board are left out: the shot screen has neither loaded.
 */
export function CourseView({
  open,
  onClose,
  holes,
  current,
  shotsFor,
  pending,
  ball,
  pref,
}: {
  open: boolean;
  onClose: () => void;
  holes: RoundHole[];
  /** The hole being scored. */
  current: number;
  /** A hole's shots, when the round has them (the hole being scored always does). */
  shotsFor: (index: number) => ShotRecord[] | null;
  /** Whether the hole being scored is still open, and the next shot to play. */
  pending: { shot: number; kind: ShotRecord['shotType'] } | null;
  /** The ball's distance to the pin on the hole being scored. */
  ball: { value: number; unit: 'yards' | 'feet' };
  pref: DistancePreference;
}) {
  const { ref, retainContent } = useDialogLifetime(open, {
    direction: 'bottom',
    surfaceSelector: '.ch-rtcv',
    focusSelector: '.ch-rtcv__back',
  });
  const [index, setIndex] = useState(current);
  // The map is the whole screen; this hole's shots wait in a bar at its foot until it is tapped or swiped up (owner,
  // 2026-10-31: "it should become the whole screen").
  const [listOpen, setListOpen] = useState(false);
  const reduced = useChReducedMotion();
  const dragFrom = useRef<number | null>(null);
  const dragged = useRef(false);
  // Each opening starts on the hole being scored, with the list folded.
  useEffect(() => {
    if (open) {
      setIndex(current);
      setListOpen(false);
    }
  }, [open, current]);
  const hole = holes[index] ?? holes[current]!;
  const isCurrent = index === current;
  const shots = shotsFor(index) ?? [];
  const live = isCurrent && pending;
  const farText = distanceText(ball.value, ball.unit, pref);
  const yards = hole.yardage ? distanceText(hole.yardage, 'yards', pref) : null;
  const go = (i: number) => {
    haptic('select');
    setIndex(i);
  };

  return (
    // The click is only the backdrop's; Esc arrives through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="ch-rtcv-d"
      aria-label={`Course view, hole ${hole.number}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {retainContent(
        open && (
          <div className="ch-rtcv" data-ui="clubhouse">
            <HoleMap
              key={hole.number}
              hole={hole}
              shots={shots}
              pending={!!live}
              frame="tall"
              className={'ch-rtcv__map' + (reduced ? '' : ' is-play')}
              play={!reduced}
              rings={hole.yardage ? pref : undefined}
              labels={pref}
              ball={live ? farText : null}
            />
            <header className="ch-rtcv__top">
              <Tooltip>
                <button
                  type="button"
                  className="ch-rtcv__glass ch-rtcv__back"
                  aria-label={pending ? `Back to shot ${pending.shot}` : 'Back to the hole'}
                  onClick={onClose}
                >
                  <Icon icon={ChevronDown} size={18} />
                </button>
              </Tooltip>
              <h2 className="ch-rtcv__glass ch-rtcv__t">
                <b>Hole {hole.number}</b>
                <span>
                  Par {hole.par}
                  {yards ? ` · ${yards}` : ''}
                </span>
              </h2>
              <div className="ch-rtcv__glass ch-rtcv__nav" role="group" aria-label="Look at another hole">
                <Tooltip>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={index > 0 ? `Hole ${holes[index - 1]!.number}` : 'No earlier hole'}
                    onClick={() => go(index - 1)}
                  >
                    <Icon icon={ChevronLeft} size={17} />
                  </button>
                </Tooltip>
                <Tooltip>
                  <button
                    type="button"
                    disabled={index === holes.length - 1}
                    aria-label={index < holes.length - 1 ? `Hole ${holes[index + 1]!.number}` : 'No later hole'}
                    onClick={() => go(index + 1)}
                  >
                    <Icon icon={ChevronRight} size={17} />
                  </button>
                </Tooltip>
              </div>
            </header>
            <section className={'ch-rtcv__sheet' + (listOpen ? ' is-open' : '')} aria-labelledby="ch-rtcv-h">
              <button
                type="button"
                className="ch-rtcv__sh"
                aria-expanded={listOpen}
                aria-controls="ch-rtcv-list"
                onPointerDown={(e) => {
                  dragFrom.current = e.clientY;
                  dragged.current = false;
                }}
                onPointerUp={(e) => {
                  const dy = dragFrom.current == null ? 0 : e.clientY - dragFrom.current;
                  dragFrom.current = null;
                  if (Math.abs(dy) < 24) return;
                  dragged.current = true;
                  haptic('select');
                  setListOpen(dy < 0);
                }}
                onClick={() => {
                  if (dragged.current) return;
                  haptic('select');
                  setListOpen((o) => !o);
                }}
              >
                <span className="ch-grab" aria-hidden="true" />
                <h3 id="ch-rtcv-h">{isCurrent ? 'This hole' : `Hole ${hole.number}`}</h3>
                <span>
                  {!isCurrent && hole.score != null
                    ? `${hole.score} ${pluralWord(hole.score, 'stroke')}`
                    : !isCurrent && index > current && hole.score == null
                      ? 'Not played yet'
                      : `${shots.length} ${pluralWord(shots.length, 'shot')}${live ? ` · ${farText} to go` : ''}`}
                </span>
              </button>
              <div id="ch-rtcv-list" className="ch-rtcv__body" aria-hidden={listOpen ? undefined : true} inert={!listOpen}>
              {shots.length || live ? (
                <ol className="ch-rtcv__list">
                  {shots.map((s, i) => (
                    <li key={s.id ?? `${s.shotNumber}-${i}`}>
                      <span className="ch-rtcv__n" aria-hidden="true">
                        {s.isPenalty ? 'P' : i + 1}
                      </span>
                      <span className="ch-rtcv__w">
                        <b>{shotTitle(s)}</b> <em>{whereTo(s)}</em>
                      </span>
                      <span className="ch-rtcv__f">{shotFigure(s, pref)}</span>
                    </li>
                  ))}
                  {live && (
                    <li className="is-next">
                      <span className="ch-rtcv__n" aria-hidden="true">
                        {pending.shot}
                      </span>
                      <span className="ch-rtcv__w">
                        <b>{shotKind(pending.kind)}</b> <em>to play</em>
                      </span>
                      <span className="ch-rtcv__f">{farText} to go</span>
                    </li>
                  )}
                </ol>
              ) : (
                <p className="ch-rtcv__none">{hole.score != null ? 'This hole’s shots aren’t on this phone.' : 'No shots on this hole yet.'}</p>
              )}
              </div>
            </section>
          </div>
        ),
      )}
    </dialog>
  );
}
