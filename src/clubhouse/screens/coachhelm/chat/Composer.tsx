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
import { matchSlash, slashQuery, type ChAskSlash } from '../../../data/coachhelm-slash';
import { haptic } from '../../../lib/haptics';
import { isOffline } from '../../../lib/use-action';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { Menu } from '../../../ui/Menu';
import { useToast } from '../../../ui/Toast';
import { Tooltip } from '../../../ui/Tooltip';
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
  /** Ask v2's scope chips (E-COMP): what the next answer will read, from the words so far. None: no chips. */
  scopeOf?: (text: string) => string[];
  /** Ask v2's `/` list (ask 05). A pick fills the box. */
  slash?: readonly ChAskSlash[];
  /** `hero`: the new chat's big box with its Players and date chips. `dock`: the one-line box at the foot of a thread. */
  variant: 'hero' | 'dock';
  phone: boolean;
  players: ChAskPlayer[];
  /** Ask v2's home line, one line on a phone (E-HOME). */
  hint?: string;
  /** A task card waits for the coach. The box stays open (a new question sets the card aside) and its hint says so. */
  waiting?: boolean;
  /** A reply is on its way: Send becomes Stop. */
  busy: boolean;
  /** The last send failed: its text comes back into the box (once, and only into an empty box). */
  failed: boolean;
  /** An action card is waiting for Confirm or Cancel: a new question can't go over it (PR #2105 fixes that on the server). */
  blocked: boolean;
  /** A player out of Ask: the box stays, says why and takes nothing (E-OUT). */
  paused?: string;
  onSend: (text: string) => void;
  onStop: () => void;
  autoFocus?: boolean;
  /** A new chat (no messages yet): the box invites a first question, whatever its shape (the phone's new chat is the one-row box). */
  fresh?: boolean;
  /** "Ask about this" from another page (`?q=`): the question waits in the box, unsent. */
  seed?: string | null;
  /** Who and which chat the unsent text belongs to ("coach:chat"), so it comes back when the coach returns to this page; none, none kept. */
  draftKey?: string | null;
  /**
   * Whether `players` is the team's roster. The shell's Ask sheet loads none, so it passes false: its picker offers the
   * stats alone, never a "No active players" that is not true of the team.
   */
  roster?: boolean;
}

/** Space kept between the picker and the edge that would cut it off. */
const PICK_EDGE = 8;
/** The gap between the box and the picker (`.ch-ask-pick`'s `calc(100% + 8px)`). */
const PICK_GAP = 8;
/**
 * The room the picker needs under the desktop's new-chat box to open there (about five rows). With less, it opens above
 * when that side has more: the box sits low on its page now, and the list had 80px for 23 rows (owner's preview, 11 Nov 2026).
 */
const PICK_MIN_BELOW = 240;

/**
 * Where the picker opens and how tall it may be there: from the box to the nearest edge that would clip it. That edge is
 * the closest ancestor that clips its overflow (the Ask sheet's panel, a page's scroller) or the visible viewport (the
 * phone's keyboard); the CSS caps take the smaller of this and their own height. `preferBelow` (the desktop's new-chat
 * box) opens below while it has PICK_MIN_BELOW, else on the roomier side. Remeasured on a resize or the keyboard moving.
 */
function usePickerRoom(anchor: RefObject<HTMLElement | null>, open: boolean, preferBelow: boolean): { room: number | null; below: boolean } {
  const [fit, setFit] = useState<{ room: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      let top = vv ? vv.offsetTop : 0;
      let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (!/(hidden|clip|auto|scroll)/.test(`${s.overflow} ${s.overflowY}`)) continue;
        const pr = p.getBoundingClientRect();
        top = Math.max(top, pr.top);
        bottom = Math.min(bottom, pr.bottom);
      }
      const under = Math.max(0, Math.floor(bottom - r.bottom - PICK_GAP - PICK_EDGE));
      const over = Math.max(0, Math.floor(r.top - top - PICK_GAP - PICK_EDGE));
      const below = preferBelow && (under >= PICK_MIN_BELOW || under >= over);
      setFit((was) => (was && was.room === (below ? under : over) && was.below === below ? was : { room: below ? under : over, below }));
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    // iOS pans the viewport over the keyboard without resizing it.
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [anchor, open, preferBelow]);
  return open && fit ? fit : { room: null, below: preferBelow };
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
export function AskComposer({ seed, scopeOf, variant, phone, players, busy, failed, blocked, paused, onSend, onStop, autoFocus, fresh = false, draftKey = null, roster = true, hint, waiting = false, slash = [] }: AskComposerProps) {
  const refuseOffline = useRefuseOffline();
  const finePointer = useFinePointer();
  const hero = variant === 'hero';
  const [value, setValue, clearDraft] = useAskDraft(draftKey);
  useEffect(() => {
    if (seed) setValue(seed);
    // Mount only: it is a starting point, not a value to hold on to.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState<ChAskRange | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pickIds, setPickIds] = useState<PickerIds>({});
  const box = useRef<HTMLTextAreaElement>(null);
  // S-ASK.toolcard.ask-about: a chart mark fills the field; it never sends.
  useEffect(() => {
    const fill = (e: Event) => {
      setValue((e as CustomEvent<string>).detail);
      box.current?.focus();
    };
    window.addEventListener('ch-ask-fill', fill);
    return () => window.removeEventListener('ch-ask-fill', fill);
  }, [setValue]);
  const frame = useRef<HTMLDivElement>(null);
  const cmd = useRef<HTMLDivElement>(null);
  const cmdList = useRef<HTMLDivElement>(null);
  const listId = useId();
  const last = useRef<{ text: string; range: ChAskRange | null } | null>(null);
  /** What a Players or `@` chip added to the text (`@` or ` @`) while that picker is still the one open; a starter seeds text to keep. */
  const opened = useRef<string | null>(null);

  // Grows with the text, up to the cap.
  const fit = useCallback(() => {
    const el = box.current;
    // Where the browser sizes a field to its text (`field-sizing`, ask CSS), nothing is written per key. Never animated either way.
    if (!el || CSS.supports?.('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);
  useLayoutEffect(() => fit(), [value, fit]);

  // ...and again when its text wraps differently with no new text: the box gets narrower or wider, or the iPhone's Text
  // Size lands (--ch-type-scale on <html>, written by the shell's layout effect after this one ran on mount).
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const scaleOf = () => root.style.getPropertyValue('--ch-type-scale');
    let scale = scaleOf();
    const type = new MutationObserver(() => {
      if (scaleOf() === scale) return;
      scale = scaleOf();
      fit();
    });
    type.observe(root, { attributes: true, attributeFilter: ['style'] });
    let width = el.offsetWidth;
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      // Only a new width re-wraps the text; the height is the one this sets.
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fit();
    });
    size?.observe(el);
    return () => {
      type.disconnect();
      size?.disconnect();
    };
  }, [fit]);

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
  const matches = useMemo(() => (roster ? matchPlayers(players, query ?? '', value) : []), [roster, players, query, value]);
  const stats = useMemo(() => matchStats(ASK_STATS, query ?? '', value), [query, value]);
  const pickable = matches.length + stats.length > 0;
  const { room, below: pickBelow } = usePickerRoom(frame, pickerOpen, hero && !phone);
  const typedSlash = slashQuery(value);
  const slashes = useMemo(() => (typedSlash === null || dismissed ? [] : matchSlash(slash, typedSlash)), [slash, typedSlash, dismissed]);
  const [slashAt, setSlashAt] = useState(0);
  const slashActive = Math.min(slashAt, Math.max(0, slashes.length - 1));

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
    if (!typed || busy || blocked || paused) return;
    if (refuseOffline()) return;
    last.current = { text: typed, range };
    haptic('press');
    onSend(withRangeClause(typed, range));
    setValue('');
    clearDraft();
    setRange(null);
    setDismissed(false);
    opened.current = null;
  };

  const pick = (name: string) => {
    haptic('select');
    setValue((v) => insertMention(v, name));
    setDismissed(false);
    opened.current = null;
    focusEnd();
  };

  /** The Players chip, the `@` key and the Add player starter: an `@` at the end of the text opens the picker. */
  const openPlayers = (chip = false) => {
    setDismissed(false);
    opened.current = null;
    if (chip && mentionQuery(value) === null) opened.current = `${value && !/\s$/.test(value) ? ' ' : ''}@`;
    setValue((v) => (mentionQuery(v) !== null ? v : `${v}${v && !/\s$/.test(v) ? ' ' : ''}@`));
    focusEnd();
  };

  const pickSlash = (c: ChAskSlash) => {
    haptic('select');
    setValue(c.seed);
    setSlashAt(0);
    focusEnd();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 229: a soft keyboard (iOS autocorrect, an IME) still has the key; the event handed to cmdk would lose that mark.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (slashes.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashAt((slashActive + (e.key === 'ArrowDown' ? 1 : -1) + slashes.length) % slashes.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        pickSlash(slashes[slashActive]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
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
      // An `@` the chip put there goes with the picker; one the person typed stays.
      const added = opened.current;
      if (added && value.endsWith(added)) setValue(value.slice(0, -added.length));
      opened.current = null;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = value.trim().length > 0 && !blocked && !paused;
  // The key's return motion (the square leaving, the arrow coming back) belongs to a turn that ran in this visit, never to first paint.
  const [hasRun, setHasRun] = useState(false);
  if (busy && !hasRun) setHasRun(true);
  // The phone's scope line already says it until the coach types; a chip only earns its row there once the words change the scope.
  const scopeChips = scopeOf && (!phone || value.trim()) ? scopeOf(value) : [];
  const first = hero || fresh;
  const placeholder = paused ? paused : waiting ? 'Ask, or answer the card' : first && hint ? hint : first ? (phone ? 'Ask about a player, a stat, or the week' : 'Ask about a player, a stat, or the week ahead') : 'Ask a follow-up';

  const plus = (
    <Menu
      label="Add to your question"
      align="start"
      keepFocus
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
        <Tooltip>
          <button type="button" className="ch-ask-cmp__round" aria-label="Add to your question" data-ch-press="" {...t}>
            <Icon icon={Plus} size={18} />
          </button>
        </Tooltip>
      )}
    />
  );

  // One key, in one place, whose meaning changes in the frame of the tap (MOTION MO-3-3, MO-3-6): the arrow leaves upward, the
  // ink disc and the stop square come up under it; when the turn ends the square goes and the arrow comes back from below.
  const send = (
    <Tooltip>
      <button
        type="button"
        className={'ch-ask-cmp__send' + (busy ? ' is-stop' : '') + (hasRun ? ' has-run' : '')}
        aria-label={busy ? 'Stop generating' : 'Send'}
        data-ch-code={busy ? 'CH-13421' : undefined}
        disabled={!busy && !canSend}
        onClick={busy ? onStop : submit}
      >
        <span className="ink" aria-hidden="true" />
        <span className="g g-send" aria-hidden="true">
          <Icon icon={ArrowUp} size={18} />
        </span>
        <span className="g g-stop" aria-hidden="true">
          <Icon icon={Square} size={14} />
        </span>
      </button>
    </Tooltip>
  );

  // A fragment that matches nothing keeps one quiet line (in the Players group) rather than an empty panel. Without a
  // roster (the shell's Ask sheet) there is no Players group at all, and the line stands alone.
  const showPlayers = roster && (matches.length > 0 || !query || stats.length === 0);
  const noPlayers = players.length === 0 ? 'No active players' : query && stats.length === 0 ? 'No player or stat by that name' : 'No match on your roster';
  const pickLabel = roster ? 'Mention a player or stat' : 'Mention a stat';

  return (
    <div className={'ch-ask-cmp is-' + variant + (phone ? ' is-phone' : '')}>
      <div className="ch-ask-cmp__box" ref={frame}>
        {scopeChips.length > 0 && (
          <div className="ch-ak-cscope" role="group" aria-label="What the next answer reads">
            {scopeChips.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        )}
        <label className="ch-ask-cmp__label" htmlFor={`${listId}-ta`}>
          {first ? 'Ask CoachHelm' : 'Reply to CoachHelm'}
        </label>
        <textarea
          id={`${listId}-ta`}
          ref={box}
          className="ch-ask-cmp__ta"
          rows={hero && !phone ? 2 : 1}
          value={value}
          disabled={!!paused}
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
            opened.current = null;
          }}
          onKeyDown={onKeyDown}
        />
        <div className="ch-ask-cmp__bar" data-ch-code="CH-13821">
          {plus}
          {hero && !phone && (
            <button type="button" className="ch-ask-cmp__chip" onClick={() => openPlayers(true)}>
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
            <Tooltip>
              <button
                type="button"
                className="ch-ask-cmp__round is-quiet"
                aria-label="Mention a player or stat"
                data-ch-press=""
                // The text box keeps the focus, so a phone keyboard that is up stays up.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openPlayers(true)}
              >
                <Icon icon={AtSign} size={18} />
              </button>
            </Tooltip>
          )}
          {send}
        </div>
        {slashes.length > 0 && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- not a control; it only keeps the focus in the text box
          <div className="ch-ask-pick" data-ch-code="CH-13821" onMouseDown={(e) => e.preventDefault()}>
            <div className="ch-ask-pick__list" role="listbox" aria-label="Commands">
              {slashes.map((c, i) => (
                <button key={c.command} type="button" role="option" aria-selected={i === slashActive} data-selected={i === slashActive ? 'true' : undefined} className="ch-ask-pick__row" onClick={() => pickSlash(c)}>
                  <span className="ch-ask-pick__name">{c.command}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {pickerOpen && (
          // A press on the picker never moves the focus: the text box keeps it, and the phone its keyboard.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- not a control; it only keeps the focus in the text box
          <div
            className="ch-ask-pick"
            data-side={hero && !phone && !pickBelow ? 'up' : undefined}
            data-ch-code="CH-13821"
            // The CSS caps the list by this, so a short sheet or a raised keyboard never cuts it off.
            style={room === null ? undefined : { ['--ch-ask-pick-room' as string]: `${room}px` }}
            onMouseDown={(e) => e.preventDefault()}
          >
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
              <Command.List ref={cmdList} className="ch-ask-pick__list" label={pickLabel}>
                {!roster && stats.length === 0 && (
                  <Command.Item value="stats:none" disabled className="ch-ask-pick__none">
                    No stat by that name
                  </Command.Item>
                )}
                {showPlayers && (
                  <Command.Group heading="Players">
                    {matches.length === 0 ? (
                      <Command.Item value="players:none" disabled className="ch-ask-pick__none">
                        {noPlayers}
                      </Command.Item>
                    ) : (
                      matches.map((p) => (
                        <Command.Item key={p.id} value={`player:${p.id}`} className="ch-ask-pick__row" onSelect={() => pick(p.name)}>
                          <Avatar name={p.name} size="sm" />
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
