'use client';

import { Menu } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type Modifier,
  type PointerActivationConstraint,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '../../../ui/Icon';
import { haptic } from '../../../lib/haptics';
import { CH_DUR, CH_EASE } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { moveOrder, PRIORITY_LABEL, type PriorityKey } from '../model';

/**
 * Touch and hold 250ms before a row lifts (iOS's own reorder delay); a finger that drifts 8px first is scrolling.
 * The pointer (a mouse or a pen) holds the same way, so the row reads the same under any hand.
 */
const HOLD: PointerActivationConstraint = { delay: 250, tolerance: 8 };

/**
 * The pointer sensor for a mouse or a pen only. WebKit sends `pointerdown` before `touchstart`, and dnd-kit gives the
 * gesture to whichever sensor claims it first: a finger left to the pointer sensor would lose its drag to the page's
 * pan (`pointercancel`). A finger belongs to the touch sensor, which can hold the page still once the row is lifted.
 */
class HandPointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** The lifted row travels only up and down the list. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** dnd-kit's own announcements read raw ids; the ranker says its steps in its own live region instead. */
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

const EASE = `cubic-bezier(${CH_EASE.join(', ')})`;
const HINT = 'Touch and hold, then drag. With a keyboard, press the up or down arrow, or press space to pick the row up and again to put it down.';

/**
 * The priority ranker with the native reorder handle (dnd-kit sortable): touch and hold a row, then drag; each step it
 * passes ticks (selection). The order is saved once, when the row is let go. With a keyboard, the handle takes the
 * arrow keys (each press moves and saves), or space picks the row up, the arrows carry it a step at a time, and space
 * puts it down (saved once) while Escape puts it back; VoiceOver users also get Move up and Move down. The lifted row is
 * the one elevated object (the drag overlay); the place it leaves is a recess in the list.
 */
export function Reorder({ order, onCommit }: { order: PriorityKey[]; onCommit: (next: PriorityKey[]) => void }) {
  const hintId = useId();
  const dndId = useId();
  const list = useRef<HTMLOListElement>(null);
  const reduced = useChReducedMotion();
  const [held, setHeld] = useState<{ key: PriorityKey; from: number; at: number; keys: boolean } | null>(null);
  const [said, setSaid] = useState('');
  const [host, setHost] = useState<HTMLElement | null>(null);
  // Where the rank numbers stand while a row is held: the order it would save if let go now.
  const shown = held ? arrayMove(order, held.from, held.at) : order;

  // The overlay is drawn in the Clubhouse root (its fonts, theme and motion setting), above the pushed screen.
  useEffect(() => setHost(list.current?.closest<HTMLElement>('.ch-root') ?? document.body), []);

  const sensors = useSensors(
    useSensor(HandPointerSensor, { activationConstraint: HOLD }),
    useSensor(TouchSensor, { activationConstraint: HOLD }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const place = (key: PriorityKey, at: number) => `${PRIORITY_LABEL[key].label}, number ${at + 1} of ${order.length}`;

  const step = (key: PriorityKey, dir: -1 | 1) => {
    const next = moveOrder(order, key, dir);
    if (next === order) return;
    haptic('select');
    setSaid(place(key, next.indexOf(key)));
    onCommit(next);
  };

  const onStart = ({ active, activatorEvent }: DragStartEvent) => {
    const key = active.id as PriorityKey;
    const from = order.indexOf(key);
    const keys = activatorEvent instanceof KeyboardEvent;
    setHeld({ key, from, at: from, keys });
    if (keys) setSaid(`Picked up ${place(key, from)}`);
  };

  const onOver = ({ over }: DragOverEvent) => {
    if (!held || !over) return;
    const at = order.indexOf(over.id as PriorityKey);
    if (at < 0 || at === held.at) return;
    haptic('select');
    setHeld({ ...held, at });
    if (held.keys) setSaid(place(held.key, at));
  };

  const onEnd = ({ over }: DragEndEvent) => {
    if (!held) return;
    const at = over ? order.indexOf(over.id as PriorityKey) : held.from;
    setHeld(null);
    if (at < 0 || at === held.from) {
      if (held.keys) setSaid(place(held.key, held.from));
      return;
    }
    setSaid(place(held.key, at));
    onCommit(arrayMove(order, held.from, at));
  };

  const onCancel = () => {
    if (held?.keys) setSaid(`Put back, ${place(held.key, held.from)}`);
    setHeld(null);
  };

  const drop: DropAnimation | null = reduced
    ? null
    : {
        duration: CH_DUR.release * 1000,
        easing: EASE,
        sideEffects: defaultDropAnimationSideEffects({ className: { dragOverlay: 'is-settling' }, styles: { active: { opacity: '0' } } }),
      };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[vertical]}
      accessibility={{ announcements: SILENT, screenReaderInstructions: { draggable: HINT } }}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={onCancel}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol ref={list} className="ch-setm-rank" aria-label="Priorities, most important first">
          {order.map((k, i) => (
            <Row key={k} k={k} rank={shown.indexOf(k) + 1} first={i === 0} last={i === order.length - 1} hintId={hintId} reduced={reduced} holding={!!held} onStep={step} />
          ))}
        </ol>
      </SortableContext>
      {host &&
        createPortal(
          <div className="ch-setm-rank-lift" data-ui={host.closest('[data-ui="clubhouse"]') ? undefined : 'clubhouse'}>
            <DragOverlay dropAnimation={drop}>{held ? <Face k={held.key} rank={held.at + 1} /> : null}</DragOverlay>
          </div>,
          host,
        )}
      <span id={hintId} className="ch-sr-only">
        {HINT}
      </span>
      <span className="ch-sr-only" aria-live="polite">
        {said}
      </span>
    </DndContext>
  );
}

/** A row's face: its rank, its name and hint, and the handle. The lifted copy is a picture of the row, hidden from assistive tech. */
function Face({ k, rank }: { k: PriorityKey; rank: number }) {
  return (
    <div className="ch-setm-rank__i is-lifted" aria-hidden="true">
      <b className="ch-setm-rank__n ch-num">{rank}</b>
      <span className="ch-setm-rank__txt">
        <span>{PRIORITY_LABEL[k].label}</span>
        <span>{PRIORITY_LABEL[k].hint}</span>
      </span>
      <span className="ch-setm-rank__h">
        <Icon icon={Menu} size={20} />
      </span>
    </div>
  );
}

function Row({
  k,
  rank,
  first,
  last,
  hintId,
  reduced,
  holding,
  onStep,
}: {
  k: PriorityKey;
  rank: number;
  first: boolean;
  last: boolean;
  hintId: string;
  reduced: boolean;
  /** A row is held (by any hand): the arrows belong to the drag, not to a one-step move. */
  holding: boolean;
  onStep: (key: PriorityKey, dir: -1 | 1) => void;
}) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: k,
    transition: reduced ? null : { duration: CH_DUR.base * 1000, easing: EASE },
  });

  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (holding || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onStep(k, e.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    <li
      ref={setNodeRef}
      className={'ch-setm-rank__i' + (isDragging ? ' is-held' : '')}
      style={{ transform: CSS.Translate.toString(transform), transition: transition ?? undefined }}
      {...listeners}
      onContextMenu={(e) => e.preventDefault()}
    >
      <b className="ch-setm-rank__n ch-num">{rank}</b>
      <span className="ch-setm-rank__txt">
        <span>{PRIORITY_LABEL[k].label}</span>
        <span>{PRIORITY_LABEL[k].hint}</span>
      </span>
      <button ref={setActivatorNodeRef} type="button" className="ch-setm-rank__h" aria-label={`Reorder ${PRIORITY_LABEL[k].label}`} aria-describedby={hintId} onKeyDown={onKey}>
        <Icon icon={Menu} size={20} />
      </button>
      <span className="ch-sr-only ch-sr-only--focusable">
        <button type="button" disabled={first} onClick={() => onStep(k, -1)}>
          Move {PRIORITY_LABEL[k].label} up
        </button>
        <button type="button" disabled={last} onClick={() => onStep(k, 1)}>
          Move {PRIORITY_LABEL[k].label} down
        </button>
      </span>
    </li>
  );
}
