'use client';

/**
 * ============================================================================
 * CoachHelm · chat · prompt composer
 * ----------------------------------------------------------------------------
 * The input. One component, used by both surfaces.
 *
 * Player mentions are TYPED ENTITIES, not text. Picking someone from the `@`
 * menu adds a chip carrying their id; the model receives the id and the tools
 * validate it against the roster. The alternative — letting the model read a
 * name out of free text and guess who it meant — is how you end up analysing
 * the wrong Nick on a roster with two, silently.
 *
 * The `+` menu is the discoverable surface for what CoachHelm can do. A coach
 * should not have to know the phrasing that triggers a practice draft; they
 * should be able to find it.
 *
 * Keyboard behaviour is conventional on purpose: Enter sends, Shift+Enter is a
 * newline, `@` opens the picker, arrows move through it, Escape closes it. A
 * novel interaction model in a text box is a cost with no upside.
 * ========================================================================== */

import * as React from 'react';
import { Plus, ArrowUp, Square, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatContextChip } from './useCoachHelmChat';

export interface ComposerPlayer {
  id: string;
  name: string;
}

export interface PromptComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy?: boolean;
  players: ComposerPlayer[];
  context: ChatContextChip[];
  onRemoveContext: (id: string) => void;
  onAddContext: (chip: ChatContextChip) => void;
  placeholder?: string;
  /** Extra bottom padding for the phone's home indicator. */
  safeArea?: boolean;
  autoFocus?: boolean;
  /**
   * Text to start the field with, e.g. from a quick action.
   *
   * Read once on mount — the field stays uncontrolled so typing never fights a
   * parent re-render. Callers change it by remounting with a new `key`, which
   * is also what makes "tap Compare players twice" re-seed rather than no-op.
   */
  initialValue?: string;
  className?: string;
}

/** What the `+` menu offers. Each one seeds the composer, never sends blind. */
const PLUS_ACTIONS: { id: string; label: string; seed: string; needsPlayer?: boolean }[] = [
  { id: 'add-player', label: 'Add player', seed: '', needsPlayer: true },
  { id: 'compare', label: 'Compare players', seed: 'Compare ', needsPlayer: true },
  { id: 'date-range', label: 'Add date range', seed: 'Over the last 30 days, ' },
  { id: 'practice', label: 'Create practice', seed: 'Create a recurring practice every ' },
  { id: 'focus', label: 'Create focus area', seed: 'Create a focus area for ' },
  { id: 'task', label: 'Assign task', seed: 'Assign a task to ' },
  { id: 'update', label: 'Draft team update', seed: 'Draft a team update about ' },
];

export function PromptComposer({
  onSend,
  onStop,
  busy,
  players,
  context,
  onRemoveContext,
  onAddContext,
  placeholder = 'Ask about your program',
  safeArea,
  autoFocus,
  initialValue,
  className,
}: PromptComposerProps) {
  const [value, setValue] = React.useState(initialValue ?? '');
  const [menu, setMenu] = React.useState<'none' | 'plus' | 'players'>('none');
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);

  const textarea = React.useRef<HTMLTextAreaElement>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  // Auto-grow, capped. Past the cap the textarea scrolls rather than eating the
  // whole viewport — on a phone a tall composer hides the answer it is about.
  React.useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  React.useEffect(() => {
    if (!initialValue) return;
    const el = textarea.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // Mount-only: a seeded prompt is an opening, not a controlled value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (menu === 'none') return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setMenu('none');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = players.filter((p) => !context.some((c) => c.id === p.id));
    if (!q) return pool.slice(0, 8);
    return pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [players, query, context]);

  const submit = React.useCallback(() => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue('');
    setMenu('none');
  }, [value, busy, onSend]);

  const pickPlayer = React.useCallback(
    (player: ComposerPlayer) => {
      onAddContext({ kind: 'player', id: player.id, label: player.name });
      setMenu('none');
      setQuery('');
      // Drop the trailing `@fragment` that opened the picker — the chip now
      // carries the reference, and leaving both would send it twice.
      setValue((v) => v.replace(/@[\w'-]*$/, ''));
      textarea.current?.focus();
    },
    [onAddContext],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu === 'players') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const chosen = matches[active];
        if (chosen) {
          e.preventDefault();
          pickPlayer(chosen);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu('none');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    // Open on `@` at a word boundary; track the fragment after it as the query.
    const trailing = /(?:^|\s)@([\w'-]*)$/.exec(next);
    if (trailing) {
      setQuery(trailing[1] ?? '');
      setActive(0);
      setMenu('players');
    } else if (menu === 'players') {
      setMenu('none');
    }
  };

  return (
    <div
      ref={root}
      className={cn('relative', safeArea && 'pb-[env(safe-area-inset-bottom)]', className)}
    >
      {/* ── Context chips — always visible, always removable ────────────── */}
      {context.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {context.map((chip) => (
            <li key={chip.id}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 py-1 pl-2.5 pr-1 font-fw-sans text-caption text-accent-800">
                {chip.label}
                {/* eslint-disable-next-line helm/no-raw-button -- inline chip dismiss inside a context pill */}
                <button
                  type="button"
                  onClick={() => onRemoveContext(chip.id)}
                  aria-label={`Remove ${chip.label} from this question`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-accent-700 transition-colors hover:bg-accent-100"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ── Menus ───────────────────────────────────────────────────────── */}
      {menu === 'players' && (
        <PlayerMenu
          id={menuId}
          matches={matches}
          active={active}
          onPick={pickPlayer}
          onHover={setActive}
          emptyLabel={players.length === 0 ? 'No active players' : 'No match on your roster'}
        />
      )}
      {menu === 'plus' && (
        <PlusMenu
          onPick={(action) => {
            setMenu('none');
            if (action.needsPlayer && action.id === 'add-player') {
              setValue((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}@`);
              setQuery('');
              setActive(0);
              setMenu('players');
            } else {
              setValue((v) => (v ? `${v.trimEnd()} ${action.seed}` : action.seed));
            }
            textarea.current?.focus();
          }}
        />
      )}

      {/* ── The field ───────────────────────────────────────────────────── */}
      {/*
        Focus is expressed as DEFINITION, not colour.

        This field was green twice over. `focus-within:border-accent-300` turned
        the frame green, and — the louder of the two — the global
        `textarea:focus-visible` rule in globals.css put a `ring-primary-500/40`
        halo directly around the textarea. An empty Ask page autofocuses the
        composer, so that green box was not a focus response at all: it was the
        page's resting state, the first thing the coach saw, sitting in the
        middle of a cream layout.

        The frame now carries the whole focus indicator — the border firms to
        `border-strong` and a soft neutral halo lifts the surface — and the
        textarea's own ring is suppressed below. One indicator, not two stacked,
        and the accent is spent where it means something: the send button.

        The global rule is left alone deliberately. It is the app-wide focus
        affordance for every input in every product; narrowing it here is a
        composer decision, not a licence to restyle focus everywhere.
      */}
      <div
        className={cn(
          'flex items-end gap-2 rounded-fw-lg border border-border-subtle bg-surface p-2',
          'transition-[border-color,box-shadow] duration-200',
          'shadow-[0_1px_2px_rgb(0_0_0/0.04)]',
          'focus-within:border-border-strong',
          'focus-within:shadow-[0_0_0_3px_rgb(23_23_23/0.07),0_2px_12px_rgb(0_0_0/0.06)]',
        )}
      >
        {/* eslint-disable-next-line helm/no-raw-button -- composer + menu trigger — an icon affordance inside the field frame */}
        <button
          type="button"
          onClick={() => setMenu((m) => (m === 'plus' ? 'none' : 'plus'))}
          aria-label="Add context or start an action"
          aria-expanded={menu === 'plus'}
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-fw-md text-text-tertiary',
            'transition-colors hover:bg-surface-sunken hover:text-text-primary',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          <Plus aria-hidden className="h-5 w-5" />
        </button>

        {/* eslint-disable-next-line helm/no-raw-input -- the composer is a combobox over the roster; <Textarea> has no listbox affordance */}
        <textarea
          ref={textarea}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={1}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the composer IS the surface; focusing it on an empty conversation is the expected behaviour of a prompt
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-label="Ask CoachHelm"
          aria-autocomplete="list"
          aria-controls={menu === 'players' ? menuId : undefined}
          aria-expanded={menu === 'players'}
          className={cn(
            'min-h-[44px] flex-1 resize-none bg-transparent py-2.5',
            'font-fw-sans text-body text-text-primary placeholder:text-text-tertiary',
            // Utilities beat the `@layer base` rule in globals.css. Focus is
            // shown once, by the frame above — not by a ring drawn around the
            // text itself inside a box that is already outlined.
            'outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
          )}
        />

        {busy ? (
          // eslint-disable-next-line helm/no-raw-button -- composer stop control — icon affordance inside the field frame
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-fw-md',
              'border border-border-subtle text-text-secondary transition-colors hover:bg-surface-sunken',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            <Square aria-hidden className="h-4 w-4" fill="currentColor" />
          </button>
        ) : (
          // eslint-disable-next-line helm/no-raw-button -- composer send control — icon affordance inside the field frame
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send"
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-fw-md',
              'bg-accent-700 text-text-on-accent transition-colors hover:bg-accent-800',
              'disabled:bg-surface-sunken disabled:text-text-tertiary',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            <ArrowUp aria-hidden className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerMenu({
  id,
  matches,
  active,
  onPick,
  onHover,
  emptyLabel,
}: {
  id: string;
  matches: ComposerPlayer[];
  active: number;
  onPick: (p: ComposerPlayer) => void;
  onHover: (i: number) => void;
  emptyLabel: string;
}) {
  return (
    <div
      className={cn(
        'absolute bottom-full left-0 z-[var(--fw-z-popover,60)] mb-2 w-full max-w-[20rem]',
        'overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft',
      )}
    >
      <p className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        <Search aria-hidden className="h-3.5 w-3.5" />
        Roster
      </p>
      {matches.length === 0 ? (
        <p className="px-3 py-3 font-fw-sans text-body-sm text-text-tertiary">{emptyLabel}</p>
      ) : (
        <ul id={id} role="listbox" aria-label="Players" className="max-h-64 overflow-y-auto py-1">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              {/* eslint-disable-next-line helm/no-raw-button -- listbox option row, not a <Button> */}
              <button
                type="button"
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(p)}
                className={cn(
                  'flex min-h-[44px] w-full items-center px-3 text-left font-fw-sans text-body-sm',
                  i === active ? 'bg-accent-50 text-accent-800' : 'text-text-primary',
                )}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlusMenu({ onPick }: { onPick: (a: (typeof PLUS_ACTIONS)[number]) => void }) {
  return (
    <div
      className={cn(
        'absolute bottom-full left-0 z-[var(--fw-z-popover,60)] mb-2 w-full max-w-[17rem]',
        'overflow-hidden rounded-fw-lg border border-border-subtle bg-surface py-1 shadow-soft',
      )}
    >
      <ul role="menu" aria-label="Add to this question">
        {PLUS_ACTIONS.map((a) => (
          <li key={a.id} role="none">
            {/* eslint-disable-next-line helm/no-raw-button -- menuitem row, not a <Button> */}
            <button
              type="button"
              role="menuitem"
              onClick={() => onPick(a)}
              className={cn(
                'flex min-h-[44px] w-full items-center px-3 text-left',
                'font-fw-sans text-body-sm text-text-primary transition-colors hover:bg-surface-sunken',
              )}
            >
              {a.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
