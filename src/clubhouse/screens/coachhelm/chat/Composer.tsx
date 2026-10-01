'use client';

import { ArrowUp, AtSign, CalendarDays, Plus, Square } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ASK_RANGES,
  ASK_STARTERS,
  insertMention,
  matchPlayers,
  mentionQuery,
  withRangeClause,
  type ChAskPlayer,
  type ChAskRange,
} from '../../../data/coachhelm-chat-shape';
import { haptic } from '../../../lib/haptics';
import { isOffline } from '../../../lib/use-action';
import { Icon } from '../../../ui/Icon';
import { Menu } from '../../../ui/Menu';
import { Modal } from '../../../ui/Modal';
import { useToast } from '../../../ui/Toast';

/** The text box grows with its text and stops here; past it the box scrolls (a taller one hides the answer it is about). */
const MAX_HEIGHT = 168;

/** A real pointer implies a real keyboard, and only a real keyboard has the Shift+Enter this composer's Enter depends on. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(pointer: fine)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia('(pointer: fine)').matches,
    () => false,
  );
}

/**
 * Offline, a send is refused before anything is sent: the shell's error toast (CH-1903) and an error haptic, and the text
 * stays where it is (CH-13920). Returns true when it refused. A question from a pill, a finding or a shortcut goes
 * through the same gate, so nothing half-sends.
 */
export function useRefuseOffline(): () => boolean {
  const toast = useToast();
  return useCallback(() => {
    if (!isOffline()) return false;
    haptic('error');
    toast({ tone: 'error', title: "Couldn't send: you're offline", body: 'Reconnect, then try again. Nothing was sent.', code: 'CH-1903' });
    return true;
  }, [toast]);
}

export interface AskComposerProps {
  /** `hero`: the new chat's big box with its Players and date chips. `dock`: the one-line box at the foot of a thread. */
  variant: 'hero' | 'dock';
  phone: boolean;
  players: ChAskPlayer[];
  /** A reply is on its way: Send becomes Stop. */
  busy: boolean;
  /** The last send failed: its text comes back into the box (once, and only into an empty box). */
  failed: boolean;
  /** An action card is waiting for Confirm or Cancel: a new question can't go over it (PR #2105 fixes that on the server). */
  blocked: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  autoFocus?: boolean;
  /** A new chat (no messages yet): the box invites a first question, whatever its shape (the phone's new chat is the one-row box). */
  fresh?: boolean;
}

/**
 * The Ask composer (mockups Main, Thread, PhoneHome; spec 3.5). One box for the new chat and the thread.
 *
 *  - Enter sends on a fine pointer, Shift+Enter is a new line; Enter while an IME is composing is left alone.
 *  - `+` opens the seven starters. A starter seeds the text and never sends.
 *  - The Players button (or typing `@`) opens the roster: a popover on desktop with the arrow keys, Enter, Tab and Esc, a
 *    sheet of 44px rows on the phone. A pick puts `@Name` into the text, where the coach reads it; the model gets the name as
 *    text, never a hidden id (nothing is sent on the coach's behalf that they cannot see).
 *  - The date chip starts unset. Choosing a range adds its sentence to the sent text, visibly.
 *  - Offline, Send is refused before anything is sent: an error toast (CH-1903) and the text stays.
 *  - A send that failed puts its text back (once, into an empty box); a card awaiting a decision disables Send.
 */
export function AskComposer({ variant, phone, players, busy, failed, blocked, onSend, onStop, autoFocus, fresh = false }: AskComposerProps) {
  const refuseOffline = useRefuseOffline();
  const finePointer = useFinePointer();
  const hero = variant === 'hero';
  const [value, setValue] = useState('');
  const [range, setRange] = useState<ChAskRange | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetQuery, setSheetQuery] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const last = useRef<{ text: string; range: ChAskRange | null } | null>(null);

  // Grows with the text, up to the cap.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && finePointer) box.current?.focus();
    // Mount only: an empty page exists to be typed into, but the phone keyboard must not open by itself.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // CH-13921: the text a send just failed on comes back, only on the transition into a failure and only into an empty box.
  const wasFailed = useRef(false);
  useEffect(() => {
    if (failed && !wasFailed.current && last.current) {
      const back = last.current;
      setValue((v) => (v.trim() ? v : back.text));
      setRange((r) => r ?? back.range);
    }
    wasFailed.current = failed;
  }, [failed]);

  const query = mentionQuery(value);
  const pickerOpen = !phone && query !== null && !dismissed;
  const matches = useMemo(() => matchPlayers(players, query ?? '', value), [players, query, value]);
  const sheetMatches = useMemo(() => matchPlayers(players, sheetQuery, value), [players, sheetQuery, value]);
  useEffect(() => setActive(0), [query]);

  const focusEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const submit = () => {
    const typed = value.trim();
    if (!typed || busy || blocked) return;
    if (refuseOffline()) return;
    last.current = { text: typed, range };
    haptic('press');
    onSend(withRangeClause(typed, range));
    setValue('');
    setRange(null);
    setDismissed(false);
  };

  const pick = (p: ChAskPlayer) => {
    setValue((v) => insertMention(v, p.name));
    setSheet(false);
    setSheetQuery('');
    setDismissed(false);
    focusEnd();
  };

  /** The Players button: a sheet on the phone; on desktop an `@` at the end opens the popover. */
  const openPlayers = () => {
    if (phone) {
      setSheetQuery('');
      setSheet(true);
      return;
    }
    setDismissed(false);
    setValue((v) => (mentionQuery(v) !== null ? v : `${v}${v && !/\s$/.test(v) ? ' ' : ''}@`));
    focusEnd();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (pickerOpen && matches.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const p = matches[active];
        if (p) pick(p);
        return;
      }
    }
    if (pickerOpen && e.key === 'Escape') {
      e.preventDefault();
      setDismissed(true);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && finePointer) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = value.trim().length > 0 && !blocked;
  const first = hero || fresh;
  const placeholder = first ? (phone ? 'Ask about a player, a stat, or the week' : 'Ask about a player, a stat, or the week ahead') : 'Ask a follow-up';

  const plus = (
    <Menu
      label="Add to your question"
      align="start"
      items={ASK_STARTERS.map((s) => ({
        label: s.label,
        onSelect: () => {
          if (s.id === 'add-player') {
            openPlayers();
            return;
          }
          setValue((v) => (v ? `${v.trimEnd()} ${s.seed}` : s.seed));
          focusEnd();
        },
      }))}
      trigger={(t) => (
        <button type="button" className="ch-ask-cmp__round" aria-label="Add to your question" {...t}>
          <Icon icon={Plus} size={18} />
        </button>
      )}
    />
  );

  const send = busy ? (
    <button type="button" className="ch-ask-cmp__send is-stop" aria-label="Stop generating" data-ch-code="CH-13421" onClick={onStop}>
      <Icon icon={Square} size={14} />
    </button>
  ) : (
    <button type="button" className="ch-ask-cmp__send" aria-label="Send" disabled={!canSend} onClick={submit}>
      <Icon icon={ArrowUp} size={18} />
    </button>
  );

  return (
    <div className={'ch-ask-cmp is-' + variant + (phone ? ' is-phone' : '')}>
      <div className="ch-ask-cmp__box">
        <label className="ch-ask-cmp__label" htmlFor={`${listId}-ta`}>
          {first ? 'Ask CoachHelm' : 'Reply to CoachHelm'}
        </label>
        <textarea
          id={`${listId}-ta`}
          ref={box}
          className="ch-ask-cmp__ta"
          rows={hero && !phone ? 2 : 1}
          value={value}
          placeholder={placeholder}
          enterKeyHint="send"
          autoComplete="off"
          aria-describedby={blocked ? `${listId}-blocked` : undefined}
          aria-controls={pickerOpen ? `${listId}-list` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="ch-ask-cmp__bar" data-ch-code="CH-13821">
          {plus}
          {hero && !phone && (
            <button type="button" className="ch-ask-cmp__chip" onClick={openPlayers}>
              <Icon icon={AtSign} size={15} />
              Players
            </button>
          )}
          {hero && !phone && (
            <Menu
              label="Date range"
              align="start"
              items={[
                { label: 'Any dates', checked: range === null, onSelect: () => setRange(null) },
                ...ASK_RANGES.map((r) => ({ label: r.label, checked: range === r.id, onSelect: () => setRange(r.id) })),
              ]}
              trigger={(t) => (
                <button type="button" className={'ch-ask-cmp__chip' + (range ? ' is-set' : '')} {...t}>
                  <Icon icon={CalendarDays} size={15} />
                  {range ? ASK_RANGES.find((r) => r.id === range)?.label : 'Any dates'}
                </button>
              )}
            />
          )}
          <span className="ch-ask-cmp__grow" />
          {(!hero || phone) && (
            <button type="button" className="ch-ask-cmp__round is-quiet" aria-label="Mention a player" onClick={openPlayers}>
              <Icon icon={AtSign} size={18} />
            </button>
          )}
          {send}
        </div>
        {pickerOpen && (
          <ul className="ch-ask-pick" id={`${listId}-list`} role="listbox" aria-label="Players" data-ch-code="CH-13821">
            {matches.length === 0 ? (
              <li className="ch-ask-pick__none" role="presentation">
                {players.length === 0 ? 'No active players' : 'No match on your roster'}
              </li>
            ) : (
              matches.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={'ch-ask-pick__row' + (i === active ? ' is-on' : '')}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(p)}
                  >
                    {p.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {blocked && (
        <p className="ch-ask-cmp__note" id={`${listId}-blocked`} role="status" data-ch-code="CH-13120">
          Confirm or cancel the action above first
        </p>
      )}
      <Modal open={sheet} onClose={() => setSheet(false)} title="Mention a player" code="CH-13821">
        <label className="ch-ask-pick__find">
          <span className="ch-sr-only">Filter players</span>
          <input type="search" value={sheetQuery} placeholder="Filter players" autoComplete="off" onChange={(e) => setSheetQuery(e.target.value)} />
        </label>
        <ul className="ch-ask-sheetlist">
          {sheetMatches.length === 0 ? (
            <li className="ch-ask-pick__none">{players.length === 0 ? 'No active players' : 'No match on your roster'}</li>
          ) : (
            sheetMatches.map((p) => (
              <li key={p.id}>
                <button type="button" className="ch-ask-sheetlist__row" onClick={() => pick(p)}>
                  {p.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </Modal>
    </div>
  );
}
