'use client';

import { useRef, useState, type Ref } from 'react';
import { chunkSlots, codeFromEntry } from './join-state';

/**
 * The team code, drawn as one box per character over a single real input (so a paste fills every box, the keyboard's
 * one-time-code suggestion works, Backspace and the caret behave as in any field, and assistive technology sees one
 * field named "Team code"). It is sign up's code entry (`Code` in onboard/Steps) in this panel's size: eight boxes with
 * a dash after the fourth, growing to ten for the older teams whose codes are longer.
 */
export function CodeField({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  autoFocus = false,
  inputRef,
  onEnter,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Enter on the field; a form submits on its own, this is for the preview and tests. */
  onEnter?: () => void;
}) {
  const [focus, setFocus] = useState(false);
  const own = useRef<HTMLInputElement>(null);
  const { n, slots, chars } = chunkSlots(value);
  return (
    <label className="ch-au-code" data-focus={focus ? '' : undefined} data-invalid={invalid ? '' : undefined} htmlFor={id}>
      <input
        ref={(el) => {
          own.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el;
        }}
        id={id}
        value={value}
        onChange={(e) => onChange(codeFromEntry(e.target.value))}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
        aria-label="Team code"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        inputMode="text"
        // A pasted link is longer than a code: it is cut down to the code it carries, not to the box.
        maxLength={200}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the one task on this screen
        autoFocus={autoFocus}
      />
      <span className="ch-au-slots" aria-hidden="true" style={{ ['--ch-au-rest' as string]: String(n - 4) }}>
        {slots.map((i) =>
          i === 'dash' ? (
            <b key="dash" />
          ) : (
            <span key={`${i}${chars[i] ?? ''}`} className="ch-au-slot" data-filled={chars[i] ? '' : undefined} data-cur={i === chars.length ? '' : undefined}>
              {chars[i] ?? ''}
            </span>
          ),
        )}
      </span>
    </label>
  );
}
