'use client';

import { AnimatePresence, m } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/haptics';
import { CH_POP, chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useChPhone } from '../lib/use-phone';
import { Icon } from './Icon';
import { Modal } from './Modal';

/** What a picker's body is given to work with. */
export interface PickerPanelApi {
  /** Chooses `value`: the field takes it, the picker closes, the opener gets focus back. */
  pick: (value: string) => void;
  /** Clears the field (only when the field is `clearable`). */
  clear?: () => void;
  close: () => void;
  phone: boolean;
  /** The body takes focus as it opens: it was opened from the keyboard or the key, not by a click that put the cursor in the text. */
  grab: boolean;
}

export interface PickerFieldProps {
  /** The form's own string: `yyyy-mm-dd` or `HH:mm`; empty for none. */
  value: string;
  onChange: (value: string) => void;
  /** Names the field for assistive tech and titles the phone sheet ("Start time"). */
  label: string;
  icon: LucideIcon;
  /** How the value reads in the field ("Thu 15 Oct 2026"). */
  format: (value: string) => string;
  /** What typed text means: the form's string, or null when it is not understood. */
  parse: (text: string) => string | null;
  /** Text that is already the machine form (`2026-10-15`) commits as it is typed; the rest waits for Enter or blur. */
  isMachine: (text: string) => boolean;
  /** Said under the field when typed text isn't understood. */
  hint: string;
  panelWidth: number;
  /** The opener key's name: "Pick a date". */
  pickLabel: string;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Takes the whole row on the phone, in a grid that gives the fields beside it a share. */
  row?: boolean;
  clearable?: boolean;
  name?: string;
  /** Called as the picker opens, to settle anything the body depends on (today's date). */
  onOpen?: () => void;
  render: (api: PickerPanelApi) => ReactNode;
  ariaInvalid?: boolean | 'true' | 'false';
  ariaDescribedBy?: string;
  dataChCode?: string;
  /** Extra attributes for the text field (data-min, data-max). */
  extra?: Record<string, string | undefined>;
}

/** Where a portaled picker mounts: inside the open dialog it came from (else it would be inert), or the app root. */
function hostFor(from: HTMLElement | null): HTMLElement {
  return (from?.closest('dialog[open]') as HTMLElement | null) ?? document.querySelector<HTMLElement>('.ch-root') ?? document.body;
}

/**
 * The field chrome of DateField and TimeField, so the two cannot drift apart.
 *
 * Desktop: a text field that stays typable (the field's own words read back, and what `parse` understands goes in), with a
 * key at its end that opens a popover anchored under it. Phone: no keyboard, no typing: the field is a key that opens a
 * bottom sheet (ui/Modal.tsx). Both mount through a portal into the dialog they came from, so a click on the popover
 * can't reach the `<label>` around the field and open it again, and Escape closes the picker without closing the sheet
 * under it.
 */
export function PickerField(p: PickerFieldProps) {
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const grab = useRef(true);
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const host = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const panelId = `${uid}-panel`;
  const errId = `${uid}-err`;

  // A value that changed under the field (the picker, a coupled field, a reset) replaces whatever was half typed.
  const [seen, setSeen] = useState(p.value);
  if (seen !== p.value) {
    setSeen(p.value);
    setText(null);
    setBad(false);
  }

  const shown = text ?? p.format(p.value);

  const openPicker = useCallback((byPointer = false) => {
    if (p.disabled) return;
    grab.current = !byPointer;
    p.onOpen?.();
    host.current = hostFor(wrap.current);
    setOpen(true);
  }, [p]);
  const closePicker = useCallback((focus = true) => {
    setOpen(false);
    if (focus && !phone) input.current?.focus({ preventScroll: true });
  }, [phone]);

  const pick = useCallback((v: string) => {
    haptic('select');
    setText(null);
    setBad(false);
    if (v !== p.value) p.onChange(v);
    closePicker();
  }, [p, closePicker]);
  const clear = p.clearable
    ? () => {
        haptic('select');
        setText(null);
        setBad(false);
        if (p.value !== '') p.onChange('');
        closePicker();
      }
    : undefined;

  /** Settles typed text: a value, a clear, or an inline word that it isn't understood. Returns whether the value changed. */
  const commit = (raw: string): boolean => {
    const t = raw.trim();
    if (!t) {
      setText(null);
      setBad(false);
      if (p.value !== '') {
        p.onChange('');
        return true;
      }
      return false;
    }
    const v = p.parse(t);
    if (v === null) {
      setBad(true);
      return false;
    }
    setBad(false);
    setText(null);
    if (v !== p.value) {
      p.onChange(v);
      return true;
    }
    return false;
  };

  // Placement under the field, as Menu places its list: flips up near the foot, stays inside the viewport and above the keyboard.
  useLayoutEffect(() => {
    if (!open || phone || !wrap.current) return;
    const place = () => {
      const r = wrap.current!.getBoundingClientRect();
      const keyboard = document.body.classList.contains('keyboard-open')
        ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0 : 0;
      const viewport = window.visualViewport;
      const bottom = Math.min(window.innerHeight - keyboard, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      const h = panel.current?.scrollHeight || panel.current?.offsetHeight || 320;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - p.panelWidth - 8));
      const above = Math.max(0, Math.min(r.top, bottom - 8) - 14);
      const below = Math.max(0, bottom - Math.max(8, r.bottom) - 14);
      const up = h > below && above > below;
      const maxHeight = up ? above : below;
      const top = Math.max(8, Math.min(up ? r.top - Math.min(h, maxHeight) - 6 : r.bottom + 6, bottom - 8 - Math.min(h, maxHeight)));
      setPos({ left, top, maxHeight });
    };
    place();
    const onScroll = (e: Event) => {
      if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return;
      place();
    };
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, phone, p.panelWidth]);

  useEffect(() => {
    if (!open || phone) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !wrap.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, phone]);

  // The field going away or turning off takes the picker with it.
  useEffect(() => {
    if (p.disabled) setOpen(false);
  }, [p.disabled]);

  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Without this the sheet or dialog the field sits in would take the Escape and close too.
      e.preventDefault();
      e.stopPropagation();
      closePicker();
    } else if (e.key === 'Tab') {
      const stops = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
      const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
      if (edge && document.activeElement === edge) {
        // Leaving the popover: the field is next in the page's order, then the key goes on from there.
        input.current?.focus({ preventScroll: true });
        setOpen(false);
      }
    }
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      closePicker();
    } else if (e.key === 'ArrowDown' || (e.key === 'ArrowUp' && e.altKey)) {
      e.preventDefault();
      openPicker();
    } else if (e.key === 'Enter' && text !== null) {
      // Enter that changes the value only changes it: a form submitting in the same keystroke would send the value from
      // before. Enter on an unchanged field goes on as it would from any input; on text that isn't understood it stops.
      const t = text.trim();
      const v = t === '' ? '' : p.parse(t);
      if (v === null) {
        setBad(true);
        e.preventDefault();
      } else {
        if (v !== p.value) e.preventDefault();
        commit(text);
      }
    }
  };

  const body = open ? p.render({ pick, clear, close: () => closePicker(), phone, grab: grab.current }) : null;
  const target = host.current ?? (typeof document === 'undefined' ? null : hostFor(null));
  const everOpened = useRef(false);
  if (open) everOpened.current = true;

  return (
    <span ref={wrap} className={'ch-df' + (p.row ? ' ch-df--row' : '') + (phone ? ' ch-df--phone' : '') + (open ? ' is-open' : '')}>
      {phone ? (
        // The invalid look is the field's own (.ch-input[aria-invalid]); on the phone the key stands in for the field.
        // eslint-disable-next-line jsx-a11y/role-supports-aria-props
        <button
          ref={trigger}
          type="button"
          id={p.id}
          name={p.name}
          className={(p.className ?? 'ch-input') + ' ch-df__btn'}
          disabled={p.disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={shown ? `${p.label}, ${shown}` : p.label}
          aria-invalid={p.ariaInvalid}
          aria-describedby={p.ariaDescribedBy}
          data-ch-code={p.dataChCode}
          {...p.extra}
          onClick={() => openPicker()}
        >
          <span className={'ch-df__v' + (shown ? '' : ' is-empty')}>{shown || p.placeholder || '—'}</span>
          <Icon icon={p.icon} size={16} />
        </button>
      ) : (
        <span className="ch-df__box">
          <input
            ref={input}
            type="text"
            role="combobox"
            id={p.id}
            name={p.name}
            className={(p.className ?? 'ch-input') + ' ch-df__in'}
            value={shown}
            placeholder={p.placeholder}
            disabled={p.disabled}
            autoComplete="off"
            spellCheck={false}
            aria-label={p.id ? undefined : p.label}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-invalid={bad ? true : p.ariaInvalid}
            aria-describedby={[bad ? errId : null, p.ariaDescribedBy].filter(Boolean).join(' ') || undefined}
            data-ch-code={p.dataChCode}
            {...p.extra}
            onFocus={(e) => {
              setText(p.format(p.value));
              e.currentTarget.select();
            }}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              setBad(false);
              // Emptied, as a native date input reports it: the field is cleared at once.
              if (!v.trim() && p.value !== '') p.onChange('');
              // The machine form (what a native input spoke, what the tests and the pasted text carry) lands at once.
              if (p.isMachine(v.trim())) {
                const ok = p.parse(v.trim());
                if (ok !== null) {
                  setText(null);
                  if (ok !== p.value) p.onChange(ok);
                }
              }
            }}
            onBlur={(e) => {
              if (text !== null) commit(text);
              // Tabbing on to another field closes the picker; a click inside it (no related target in Safari) does not.
              const to = e.relatedTarget as Node | null;
              if (open && to && !panel.current?.contains(to) && !wrap.current?.contains(to)) setOpen(false);
            }}
            onKeyDown={onInputKey}
            onClick={() => {
              if (!open) openPicker(true);
            }}
          />
          <button
            ref={trigger}
            type="button"
            className="ch-df__open"
            tabIndex={-1}
            disabled={p.disabled}
            aria-label={p.pickLabel}
            aria-expanded={open}
            onClick={() => (open ? closePicker() : openPicker())}
          >
            <Icon icon={p.icon} size={16} />
          </button>
        </span>
      )}
      {bad && !phone && (
        <span id={errId} className="ch-field__help is-error ch-df__err" role="alert">
          {p.hint}
        </span>
      )}
      {typeof document !== 'undefined' &&
        target &&
        (phone
          ? everOpened.current &&
            createPortal(
              <Modal open={open} onClose={() => setOpen(false)} title={p.label} width={420}>
                {body}
              </Modal>,
              target,
            )
          : createPortal(
              <AnimatePresence>
                {open && (
                  <m.div
                    ref={panel}
                    id={panelId}
                    role="dialog"
                    aria-label={`Pick ${p.label.toLowerCase()}`}
                    className="ch-df-pop ch-popover"
                    data-ui="clubhouse"
                    style={{ left: pos?.left ?? -9999, top: pos?.top, maxHeight: pos?.maxHeight, width: p.panelWidth }}
                    initial={reduced ? { opacity: 0 } : CH_POP.initial}
                    animate={reduced ? { opacity: 1 } : CH_POP.animate}
                    exit={reduced ? { opacity: 0 } : CH_POP.exit}
                    transition={chTween('quick', reduced)}
                    onKeyDown={onPanelKey}
                  >
                    {body}
                  </m.div>
                )}
              </AnimatePresence>,
              target,
            ))}
    </span>
  );
}
