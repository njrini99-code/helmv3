'use client';

import { Command, useCommandState } from 'cmdk';
import { ArrowUp, AtSign, CalendarDays, ChartColumn, Plus, Square } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
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
import { ASK_STATS, matchStats } from '../../../data/coachhelm-mentions';
import { haptic } from '../../../lib/haptics';
import { isOffline } from '../../../lib/use-action';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { Menu } from '../../../ui/Menu';
import { useToast } from '../../../ui/Toast';
import { useAskDraft } from './drafts';

/** The text box grows with its text and stops here; past it the box scrolls (a taller one hides the answer it is about). */
const MAX_HEIGHT = 168;

/** The keys the text box hands to the open picker; cmdk's own navigation, wrap-around, scrolling and pick then run. */
const PICKER_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Tab']);

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

type PickerIds = { list?: string; active?: string };

/**
 * The picker's listbox and highlighted row, so the text box can point at them (cmdk sets both ids itself). The row is read
 * from the list once a selection has rendered: cmdk's own `selectedItemId` misses the first row it highlights on mount.
 */
function PickerIdsProbe({ list, onIds }: { list: RefObject<HTMLDivElement | null>; onIds: (ids: PickerIds) => void }) {
  const selected = useCommandState((s) => s.value);
  useLayoutEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
    onIds({ list: list.current?.id, active: row?.id });
  }, [selected, list, onIds]);
  return null;
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
    toast({ tone: 'error', title: 'Couldn’t send: you’re offline', body: 'Reconnect, then try again. Nothing was sent.', code: 'CH-1903' });
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
  /** Who and which chat the unsent text belongs to ("coach:chat"), so it comes back when the coach returns to this page; none, none kept. */
  draftKey?: string | null;
}

/**
 * The Ask composer (mockups Main, Thread, PhoneHome; spec 3.5). One box for the new chat and the thread.
 *
 *  - Enter sends on a fine pointer, Shift+Enter is a new line; Enter while an IME is composing is left alone.
 *  - `+` opens the seven starters. A starter seeds the text and never sends.
 *  - Typing `@` (or the Players chip, the `@` key, the Add player starter) opens the mention picker (cmdk): the roster and
 *    the stats CoachHelm can read, filtered as the coach types. The text box keeps the focus (and the phone its keyboard);
 *    the arrow keys, Enter and Tab pick, Esc closes. It is a list docked above the box (below the desktop's new-chat box),
 *    never a sheet. A pick puts `@Name` or `@Greens in regulation` into the text, where the coach reads it; the model gets
 *    the words, never a hidden id (nothing is sent on the coach's behalf that they cannot see).
 *  - The date chip starts unset. Choosing a range adds its sentence to the sent text, visibly.
 *  - Offline, Send is refused before anything is sent: an error toast (CH-1903) and the text stays.
 *  - A send that failed puts its text back (once, into an empty box); a card awaiting a decision disables Send.
 */
export function AskComposer({ variant, phone, players, busy, failed, blocked, onSend, onStop, autoFocus, fresh = false, draftKey = null }: AskComposerProps) {
  const refuseOffline = useRefuseOffline();
  const finePointer = useFinePointer();
  const hero = variant === 'hero';
  const [value, setValue] = useAskDraft(draftKey);
  const [range, setRange] = useState<ChAskRange | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pickIds, setPickIds] = useState<PickerIds>({});
  const box = useRef<HTMLTextAreaElement>(null);
  const cmd = useRef<HTMLDivElement>(null);
  const cmdList = useRef<HTMLDivElement>(null);
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
  }, [failed, setValue]);

  const query = mentionQuery(value);
  const pickerOpen = query !== null && !dismissed;
  const matches = useMemo(() => matchPlayers(players, query ?? '', value), [players, query, value]);
  const stats = useMemo(() => matchStats(ASK_STATS, query ?? '', value), [query, value]);
  const pickable = matches.length + stats.length > 0;

  const focusEnd = useCallback(() => {
    // Focus inside the tap itself, so a phone raises its keyboard (or keeps it up); the caret goes to the end once the new
    // text is in.
    box.current?.focus();
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

  const pick = (name: string) => {
    haptic('select');
    setValue((v) => insertMention(v, name));
    setDismissed(false);
    focusEnd();
  };

  /** The Players chip, the `@` key and the Add player starter: an `@` at the end of the text opens the picker. */
  const openPlayers = () => {
    setDismissed(false);
    setValue((v) => (mentionQuery(v) !== null ? v : `${v}${v && !/\s$/.test(v) ? ' ' : ''}@`));
    focusEnd();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 229: a soft keyboard (iOS autocorrect, an IME) still has the key; the event handed to cmdk would lose that mark.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // The picker's keys go to cmdk's root. It sits beside the box, not around it, so a closed picker never takes Enter,
    // the arrows or a Shift+Enter from the text. Tab picks as Enter does.
    if (pickerOpen && pickable && PICKER_KEYS.has(e.key) && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      cmd.current?.dispatchEvent(new KeyboardEvent('keydown', { key: e.key === 'Tab' ? 'Enter' : e.key, bubbles: true, cancelable: true }));
      return;
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
        <button type="button" className="ch-ask-cmp__round" aria-label="Add to your question" data-ch-press="" {...t}>
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

  // A fragment that matches nothing keeps one quiet line (in the Players group) rather than an empty panel.
  const showPlayers = matches.length > 0 || !query || stats.length === 0;
  const noPlayers = players.length === 0 ? 'No active players' : query && stats.length === 0 ? 'No player or stat by that name' : 'No match on your roster';

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
          aria-autocomplete="list"
          aria-controls={pickerOpen ? pickIds.list : undefined}
          aria-activedescendant={pickerOpen && pickable ? pickIds.active : undefined}
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
            <button
              type="button"
              className="ch-ask-cmp__round is-quiet"
              aria-label="Mention a player or stat"
              data-ch-press=""
              // The text box keeps the focus, so a phone keyboard that is up stays up.
              onMouseDown={(e) => e.preventDefault()}
              onClick={openPlayers}
            >
              <Icon icon={AtSign} size={18} />
            </button>
          )}
          {send}
        </div>
        {pickerOpen && (
          // A press on the picker never moves the focus: the text box keeps it, and the phone its keyboard.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- not a control; it only keeps the focus in the text box
          <div className="ch-ask-pick" data-ch-code="CH-13821" onMouseDown={(e) => e.preventDefault()}>
            <Command
              // A new fragment starts the list again, at its first row.
              key={query}
              ref={cmd}
              shouldFilter={false}
              loop
              vimBindings={false}
              // The keys the text box hands over stop here, so nothing further up hears them twice.
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Command.List ref={cmdList} className="ch-ask-pick__list" label="Mention a player or stat">
                {showPlayers && (
                  <Command.Group heading="Players">
                    {matches.length === 0 ? (
                      <Command.Item value="players:none" disabled className="ch-ask-pick__none">
                        {noPlayers}
                      </Command.Item>
                    ) : (
                      matches.map((p) => (
                        <Command.Item key={p.id} value={`player:${p.id}`} className="ch-ask-pick__row" onSelect={() => pick(p.name)}>
                          <Avatar name={p.name} size={28} />
                          <span className="ch-ask-pick__name">{p.name}</span>
                        </Command.Item>
                      ))
                    )}
                  </Command.Group>
                )}
                {stats.length > 0 && (
                  <Command.Group heading="Stats">
                    {stats.map((s) => (
                      <Command.Item key={s.id} value={`stat:${s.id}`} className="ch-ask-pick__row" onSelect={() => pick(s.label)}>
                        <span className="ch-ask-pick__mark" aria-hidden="true">
                          <Icon icon={ChartColumn} size={15} />
                        </span>
                        <span className="ch-ask-pick__name">{s.label}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <PickerIdsProbe list={cmdList} onIds={setPickIds} />
            </Command>
          </div>
        )}
      </div>
      {blocked && (
        <p className="ch-ask-cmp__note" id={`${listId}-blocked`} role="status" data-ch-code="CH-13120">
          Confirm or cancel the action above first
        </p>
      )}
    </div>
  );
}
