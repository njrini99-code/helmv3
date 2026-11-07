'use client';

import type { ChMessagesApi } from '../api/types';
import type { FirstMessage } from './phone-types';
import { useState, useRef, useEffect } from 'react';
import { useAddAttachments, useAutosize, AttachChips, AttachButton, CharsLeft } from '../thread/composer-parts';
import { useComposerInset } from '../composer-inset';
import { groupLacksPlayer, firstName, MESSAGE_MAX } from '../model';
import { haptic } from '../../../lib/haptics';
import { chTrail } from '../../../lib/track';
import { tokenBeat, usePopIn } from '../details-v2';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useIsPresent } from 'motion/react';
import { personOf } from '../person-of';
import { Icon } from '../../../ui/Icon';
import { Megaphone, ChevronRight, Users, UserRound, X, Check, ArrowUp } from 'lucide-react';
import { pluralWord } from '../../../lib/plural';
import { PhoneScreen } from '../../../shell/PhoneScreen';
import { PhoneBar, PhoneTextAction } from '../../../ui/PhoneBar';
import { InlineNotice } from '../../../ui/Notices';
import { Avatar } from '../../../ui/Avatar';

/* New message */

export function PhoneNewMessage({
  api,
  teamSeed = false,
  onCancel,
  onAnnounce,
  onFirstMessage,
  draft: kept,
  onDraft,
}: {
  api: ChMessagesApi;
  teamSeed?: boolean;
  onCancel: () => void;
  onAnnounce: () => void;
  /** Hands the first message to the thread that opens next; null takes it back. */
  onFirstMessage: (first: FirstMessage | null) => void;
  /** The first message as last left, held by MessagesPhone so Cancel doesn't lose it. */
  draft: FirstMessage;
  onDraft: (draft: FirstMessage) => void;
}) {
  const coach = api.viewer.role === "coach";
  // A prefilled message (prefill.ts) arrives with its people and its group name. Its draft is quoted here and lands in
  // the new thread's composer (not this screen's first message, which Next sends): the coach presses Send there.
  const [seed] = useState(() => api.prefill ?? null);
  const [to, setTo] = useState<string[]>(() => (seed ? (coach ? seed.to : seed.to.slice(0, 1)) : teamSeed ? api.directory.map((p) => p.userId) : []));
  const [q, setQ] = useState("");
  const [name, setName] = useState(seed?.title ?? (teamSeed ? (api.teamName ?? "") : ""));
  const draft = kept.text;
  const files = kept.files;
  const setDraft = (text: string) => onDraft({ text, files });
  const setFiles = (next: File[]) => onDraft({ text: draft, files: next });
  const addFiles = useAddAttachments();
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const reduced = useChReducedMotion();
  const pop = usePopIn();
  // The first message box grows as the thread's does (wave 5 #4), and toasts sit above it (#1).
  const box = useRef<HTMLTextAreaElement | null>(null);
  const footer = useRef<HTMLElement | null>(null);
  useAutosize(box, draft);
  useComposerInset(footer);
  const group = coach && to.length > 1;
  const needsName = group && !name.trim();
  // A coach's group is a team broadcast: with no player in it, it would reach the whole team (groupLacksPlayer).
  const needsPlayer = group && groupLacksPlayer(api.viewer.role, to, api.directory);
  // The lane's Suggested: people with no direct thread yet; a search looks through everyone (d64).
  const direct = new Set(api.convs.filter((c) => !c.group).map((c) => c.memberIds[0]));
  // As you type, the ones that no longer match dim to .35 (MSG-702) instead of leaving; a search still reaches everyone.
  const term = q.trim().toLowerCase();
  const matches = (name: string) => !term || name.toLowerCase().includes(term);
  const people = api.directory.filter((p) => !direct.has(p.userId) || to.includes(p.userId) || (!!term && matches(p.name)));
  const players = api.directory.filter((p) => p.role === "player");
  const coaches = api.directory.filter((p) => p.role === "coach");
  const seniors = players.filter((p) => p.subtitle === "Senior");
  const toggle = (id: string) => {
    haptic("select");
    // Redesign, a player: the token shows, then the conversation opens (MSG-NEW-03). A coach may pick several for a group, so Next stays.
    if (!coach && to[0] !== id) {
      setTo([id]);
      setBusy(true);
      window.setTimeout(() => {
        chTrail("messages start direct");
        void api.startDirect(id).then(() => setBusy(false));
      }, tokenBeat(reduced));
      return;
    }
    // Players start direct threads only (D-15): a second pick replaces the first.
    setTo((cur) => (!coach ? (cur[0] === id ? [] : [id]) : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const pick = (ids: string[], groupName: string) => {
    haptic("select");
    setTo(ids);
    setName(groupName);
    setQ("");
  };
  const go = async () => {
    if (!to.length || busy) return;
    if (needsName || needsPlayer) {
      setTouched(true);
      haptic("warning");
      if (needsName) nameInput.current?.focus();
      return;
    }
    setBusy(true);
    const text = draft.trim();
    // Handed over first: the thread opens as soon as the conversation exists, and its composer sends it
    // (files through the same `api.sendFiles` the thread's attach uses, so its limits and errors apply).
    onFirstMessage(text || files.length ? { text, files } : null);
    chTrail(group ? "messages create group" : "messages start direct");
    const ok = group ? await api.createGroup(to, name.trim()) : await api.startDirect(to[0]!);
    setBusy(false);
    if (!ok) onFirstMessage(null);
    // The thread has it now; a failure leaves it here.
    else onDraft({ text: "", files: [] });
  };
  // A hardware keyboard's Esc is Cancel (audit A-28): the same pop, history step and focus return as the button. A
  // dialog or menu open over the screen takes its own Esc first, and a screen already leaving (after Next) ignores it,
  // so it cannot clear a prefill the new thread is taking.
  const present = useIsPresent();
  useEffect(() => {
    if (!present) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      if (e.target instanceof Element && e.target.closest("dialog, [role='dialog'], [role='menu']")) return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, present]);
  const who = to.length === 1 ? firstName(personOf(api, to[0]!)?.name ?? "them") : `${to.length} people`;
  const quickGroups = coach && !q ? (
<>
              <h2 className="ch-ms-sec__l">Quick groups</h2>
              <div className="ch-msp-panel">
                <button type="button" className="ch-msp-row is-btn" onClick={onAnnounce}>
                  <span className="ch-msp-row__ic is-round">
                    <Icon icon={Megaphone} size={16} />
                  </span>
                  <span className="ch-msp-row__b">
                    <b>Announcement</b>
                    <span>Everyone on {api.teamName ?? "the team"}, with acknowledgement</span>
                  </span>
                  <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                </button>
                {players.length > 0 && (
                  <button
                    type="button"
                    className="ch-msp-row is-btn"
                    onClick={() => pick([...players, ...coaches].map((p) => p.userId), api.teamName ?? "Whole team")}
                  >
                    <span className="ch-msp-row__ic is-round">
                      <Icon icon={Users} size={16} />
                    </span>
                    <span className="ch-msp-row__b">
                      <b>Whole team</b>
                      <span className="ch-num">
                        {players.length} {pluralWord(players.length, "player")} · {coaches.length + 1} coaches
                      </span>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                  </button>
                )}
                {seniors.length > 0 && (
                  <button type="button" className="ch-msp-row is-btn" onClick={() => pick(seniors.map((p) => p.userId), "Seniors")}>
                    <span className="ch-msp-row__ic is-round">
                      <Icon icon={UserRound} size={16} />
                    </span>
                    <span className="ch-msp-row__b">
                      <b>Seniors</b>
                      <span>{seniors.map((p) => firstName(p.name)).join(", ")}</span>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                  </button>
                )}
              </div>
            </>
  ) : null;
  return (
    <PhoneScreen labelledBy="ch-msp-new-title" className="ch-msp-new" keyboardAware>
      <PhoneBar
        back={{ label: "Cancel", chevron: false, onBack: onCancel }}
        title="New message"
        titleId="ch-msp-new-title"
        action={
          (coach && to.length > 0) ? (
            <PhoneTextAction onClick={() => void go()} disabled={!to.length} busy={busy}>
              {busy ? "Starting…" : group ? "Create group" : "Next"}
            </PhoneTextAction>
          ) : undefined
        }
      />
      <div className="ch-msp-to">
        <span className="ch-msp-to__k" aria-hidden="true">
          {"To:"}
        </span>
        <div className="ch-msp-to__f">
          {to.map((id) => (
            <button key={id} type="button" className="ch-msp-tok ch-msd-tok" ref={(el) => void pop(el, 0.8, { once: true, fade: true })} aria-label={`Remove ${personOf(api, id)?.name ?? "person"}`} onClick={() => toggle(id)}>
              <Avatar name={personOf(api, id)?.name ?? "Member"} id={personOf(api, id)?.playerId ?? id} size={22} />
              {firstName(personOf(api, id)?.name ?? "Member")}
              <Icon icon={X} size={12} />
            </button>
          ))}
          <input
            className="ch-msp-to__in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder=""
            aria-label="Search people"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- New message opens on its To field; the page was opened to type a name
            autoFocus
          />
        </div>
      </div>
      {group && (
        <label className="ch-msp-to is-name">
          <span className="ch-msp-to__k">Name</span>
          <input
            ref={nameInput}
            className="ch-msp-to__in"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            maxLength={80}
            aria-invalid={touched && needsName}
          />
        </label>
      )}
      <div className="ch-msp-scroll">
        <div className="ch-msp-page">
          {seed?.draft && (
            <p className="ch-ms-new__draft">
              <span>Your draft, ready in the conversation to edit and send</span>
              <q>{seed.draft}</q>
            </p>
          )}
          {touched && needsName && (
            <p className="ch-field__help is-error" data-ch-code="CH-7104" role="alert">
              Name the group so players know what it’s for.
            </p>
          )}
          {touched && needsPlayer && (
            <p className="ch-field__help is-error" data-ch-code="CH-7105" role="alert">
              Choose at least one player. Coaches join the group once it exists.
            </p>
          )}

          {!api.directoryError && !people.length && !q ? null : (
            <h2 className="ch-msv-suggest__h">Suggested</h2>
          )}
          {api.directoryError ? (
            <InlineNotice code="CH-7205" title="Your team list didn’t load" body="Try again." onRetry={api.retryDirectory} />
          ) : (
            <div className="ch-msp-panel" role="listbox" aria-multiselectable={coach} aria-label="People">
              {people.map((p) => {
                const on = to.includes(p.userId);
                return (
                  <button key={p.userId} type="button" role="option" aria-selected={on} className={"ch-msp-row is-btn ch-msd-sug" + (matches(p.name) ? "" : " is-dim")} onClick={() => toggle(p.userId)}>
                    <Avatar name={p.name} id={p.playerId ?? p.userId} size="md" />
                    <span className="ch-msp-row__b">
                      <b>{p.name}</b>
                      <span>{p.subtitle}</span>
                    </span>
                    {on && (
                      <span className={"ch-msp-check" + (on ? " is-on" : "")} aria-hidden="true">
                        {on && <Icon icon={Check} size={14} />}
                      </span>
                    )}
                  </button>
                );
              })}
              {!people.length && (q.trim()) && <p className="ch-msp-none">{q.trim() ? `No one matches “${q.trim()}”.` : "No one to message yet."}</p>}
            </div>
          )}
          {group && <p className="ch-msp-hint ch-num">Messages to {to.length} people start a new group.</p>}
          {quickGroups}
        </div>
      </div>
      <footer ref={footer} className="ch-ms-comp" hidden={!to.length}>
        <AttachChips files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        <div className="ch-ms-comp__field">
          <AttachButton phone disabled={!to.length} onPick={(picked) => setFiles(addFiles(files, picked))} />
          <textarea
            ref={box}
            rows={1}
            aria-label={to.length ? `Message ${who}` : "Choose who to message"}
            placeholder={to.length ? `Message ${who}` : "Choose who to message"}
            value={draft}
            disabled={!to.length}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setDraft(e.target.value)}
            // Return adds a line, as in the thread; Send sends.
            enterKeyHint="enter"
          />
          <button
            type="button"
            className={"ch-ms-send" + (to.length && (draft.trim() || files.length) && !busy ? " is-ready" : "")}
            onClick={() => void go()}
            disabled={!to.length || !(draft.trim() || files.length) || busy}
            aria-label="Send"
          >
            <Icon icon={ArrowUp} size={17} />
          </button>
        </div>
        <CharsLeft text={draft} />
      </footer>
    </PhoneScreen>
  );
}
