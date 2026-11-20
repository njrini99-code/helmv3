'use client';

import { useId, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '../lib/haptics';

/**
 * An immediate on/off setting (takes effect without Save): the handoff's
 * recessed track with a raised thumb, green when on. A detent haptic on
 * change. `label` is always the accessible name, even when it isn't shown.
 * Held, the thumb stretches toward where it would travel (controls.css, CH-1620). The thumb can also be dragged (GES-12):
 * it follows the finger along its 17px travel, a selection haptic marks crossing the middle, and letting go decides by
 * where it stands. A drag never also counts as the tap that flips it.
 */
const TRAVEL = 17;
export function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  disabled,
  busy,
  busyCode,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  /** A save is in flight: the switch holds its new position but can't be flipped again. */
  busy?: boolean;
  /** Catalog number shown while busy (docs/clubhouse/catalog). */
  busyCode?: string;
}) {
  const id = useId();
  const thumb = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<{ x: number; at: number; moved: boolean; on: boolean } | null>(null);
  const swallow = useRef(false);
  const locked = disabled || busy;
  const onDown = (e: ReactPointerEvent) => {
    if (locked || e.button !== 0) return;
    drag.current = { x: e.clientX, at: checked ? TRAVEL : 0, moved: false, on: checked };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const el = thumb.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    const at = Math.min(TRAVEL, Math.max(0, (checked ? TRAVEL : 0) + dx));
    const on = at > TRAVEL / 2;
    if (on !== d.on) {
      d.on = on;
      haptic('select');
    }
    d.at = at;
    el.style.transition = 'none';
    el.style.transform = `translateX(${at}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    const el = thumb.current;
    if (!d?.moved) return;
    swallow.current = true;
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
    }
    if (d.on !== checked) onChange(d.on);
  };
  return (
    <label
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
        if (thumb.current) {
          thumb.current.style.transition = '';
          thumb.current.style.transform = '';
        }
      }}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={'ch-switch' + (disabled ? ' is-disabled' : '') + (busy ? ' is-busy' : '')} htmlFor={id} data-ch-code={busy ? busyCode : undefined}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onChange={(e) => {
          haptic('select');
          onChange(e.target.checked);
        }}
      />
      <span className="ch-switch__track" aria-hidden>
        <span ref={thumb} className="ch-switch__thumb" />
      </span>
      <span className={hideLabel ? 'ch-sr-only' : 'ch-switch__l'}>{label}</span>
    </label>
  );
}
