"use client";

import { Check, ListChecks, Lock, Minus, Plus } from "lucide-react";
import { AnimatePresence, m, useIsPresent } from "motion/react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POLL_SUGGESTIONS,
  buildPollPayload,
  defaultCustomEnd,
  encodeChoice,
  isPollClosed,
  nextPollCheckDelay,
  pollEligibleCount,
  pollState,
  pollShare,
  pollRemindDraft,
  pollResultDraft,
  pollWaiting,
  zonedWallTimeToInstant,
  type Poll,
  type PollDraft,
  type PollTally,
} from "@/lib/golf/message-polls";
import { haptic } from "../../lib/haptics";
import { CH_DUR, chTween } from "../../lib/motion";
import { plural } from "../../lib/plural";
import { useChReducedMotion } from "../../lib/reduced-motion";
import { Avatar } from "../../ui/Avatar";
import { Button, IconButton } from "../../ui/Button";
import { DateField } from "../../ui/DateField";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { Modal } from "../../ui/Modal";
import { ListPresence, PresenceRow } from "../../ui/ListPresence";
import { InlineNotice } from "../../ui/Notices";
import { Segmented } from "../../ui/Segmented";
import { Switch } from "../../ui/Switch";
import { TimeField } from "../../ui/TimeField";
import { clock, firstName, untilLabel, type ChConv } from "./model";
import type { ChMessagesApi } from "./MessagesView";

/**
 * Polls in a thread (premium features P-2, handoff §4.34.2): the card a poll message draws, the sheet that writes one,
 * and the two small sheets around it (who voted, close the poll). The pure rules are in lib/golf/message-polls.ts.
 *
 * The card is a quiet surface, not a coloured bubble, so it reads the same from either side of the thread. Each choice
 * is a row the whole width of the card; its share of the voters fills behind the label as a bar. The bar is drawn at
 * its width (no first-paint draw-in, Q-153) and only moves when a vote changes it, on the release spring, a value that
 * changes being the one thing that may move.
 */

export interface ChPollsApi {
  /** The tally for one poll message, or null while votes load for the first time. */
  tally: (messageId: string, poll: Poll) => PollTally | null;
  /** Option ids picked, or none to take the vote back. */
  vote: (messageId: string, poll: Poll, optionIds: string[]) => void;
  /** The polls with a vote being saved. A card stays tappable: the latest tap is the one written. */
  pending: ReadonlySet<string>;
  error: string | null;
  retry: () => void;
  /**
   * `clientId` stays the same for one draft, so a Send retried after a lost answer can't post the poll twice.
   * `priorClientId` is the id of a send that threw, only when the draft was edited since (D19). The answer says
   * whether the send threw (`threw`) and whether that earlier copy had landed after all (`earlierCopy`, CH-7031).
   */
  send: (
    conversationId: string,
    draft: PollDraft,
    clientId: string,
    priorClientId?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string; threw?: true; earlierCopy?: true }>;
  close: (messageId: string) => Promise<boolean>;
}

/** The head's second part: "Final", the end ("Ends tomorrow at 6:00 PM", the last hour counting down), or nothing. */
function endsLabel(poll: Poll, closed: boolean, now: string, timeZone: string, hours: "12" | "24", nowMs: number) {
  if (closed) return "Final";
  if (!poll.closesAt) return null;
  // The last hour counts down, so a tap just before the end never looks like it landed after it.
  const left = Date.parse(poll.closesAt) - nowMs;
  if (left < 60_000) return "Ends in under a minute";
  if (left < 3_600_000) return `Ends in ${Math.ceil(left / 60_000)} min`;
  const day = untilLabel(poll.closesAt, now, timeZone);
  return `Ends ${day === "today" ? "" : day === "tomorrow" ? "tomorrow " : `${day} `}at ${clock(poll.closesAt, timeZone, hours)}`;
}

/** When a long press last opened a message's actions (MessagesPhone), so the release that ends it isn't a vote. */
let lastHold = 0;
export const notePollHold = () => {
  lastHold = Date.now();
};
/** The press that started at `pressAt` turned into a hold that opened the actions sheet. */
const heldSince = (pressAt: number) => pressAt > 0 && lastHold >= pressAt;

/**
 * The poll's own clock: the page's minute clock, plus a timer set to the exact end so the card turns final on time, and
 * a 15-second tick in the last hour while it counts down.
 */
function usePollClock(closesAt: string | null, pageNow: string): number {
  const page = Date.parse(pageNow);
  const [now, setNow] = useState(() => (Number.isFinite(page) ? page : Date.now()));
  useEffect(() => {
    setNow(Number.isFinite(page) ? Math.max(page, Date.now()) : Date.now());
  }, [page]);
  // D13: never one long timer. Each check re-arms the next (at most six hours), and a page shown again re-checks at once,
  // because iOS pauses timers in the background.
  useEffect(() => {
    const delay = nextPollCheckDelay(closesAt, Date.now());
    if (delay == null) return;
    const next = setTimeout(() => setNow(Date.now()), delay);
    const left = Date.parse(closesAt as string) - Date.now();
    const tick = left < 3_600_000 ? setInterval(() => setNow(Date.now()), 15_000) : null;
    const recheck = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('pageshow', recheck);
    return () => {
      clearTimeout(next);
      if (tick) clearInterval(tick);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('pageshow', recheck);
    };
  }, [closesAt, now]);
  return now;
}

/**
 * D30: a poll action that reaches people prefills a reply in the thread; the person presses Send. The thread (desktop and
 * phone) provides this: it sets the reply to the poll and seeds the composer.
 */
export interface PollThreadActions {
  replyWith: (messageId: string, text: string) => void;
}
export const PollThreadContext = createContext<PollThreadActions | null>(null);

/** D26: what a poll offers right now, for the desktop menu and the phone's actions sheet (null when not offered). */
export interface PollCardActions {
  seeVotes: (() => void) | null;
  remind: { count: number; run: () => void } | null;
  close: (() => void) | null;
  share: (() => void) | null;
}
const cardActions = new Map<string, PollCardActions>();
/** The live actions of a drawn poll card, or null when the card isn't on screen. */
export const pollCardActions = (messageId: string): PollCardActions | null => cardActions.get(messageId) ?? null;

/** First names, with a last initial when two share one ("Sam C."). */
function shortNames(ids: readonly string[], nameOf: (id: string) => string): string[] {
  const full = ids.map(nameOf);
  const firsts = full.map((n) => firstName(n));
  return full.map((n, i) => {
    if (firsts.filter((f) => f === firsts[i]).length < 2) return firsts[i]!;
    const last = n.trim().split(/\s+/).slice(1).pop();
    return last ? `${firsts[i]} ${last[0]!.toUpperCase()}.` : firsts[i]!;
  });
}

/**
 * One copy of a crossfade (M5, M7, M8, M11): the new copy fades in over the base beat, the old one out over the quick
 * one, and the leaving copy drops out of assistive tech and focus at once. Instant under reduced motion and Animations off.
 */
function FadeCopy({ as = "span", className, children }: { as?: "span" | "div"; className?: string; children: ReactNode }) {
  const reduced = useChReducedMotion();
  const present = useIsPresent();
  const Item = as === "div" ? m.div : m.span;
  return (
    <Item
      className={className}
      aria-hidden={present ? undefined : true}
      inert={!present}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: chTween("base", reduced) }}
      exit={{ opacity: 0, transition: chTween("quick", reduced) }}
    >
      {children}
    </Item>
  );
}

/**
 * A figure or line that changes in place: the copies stack in one grid cell (messages.css `.ch-ms-poll__x`), so the old
 * and the new share the spot while they cross. Keyed by what it shows; first paint never animates. A caller draws a
 * plain element until the votes have loaded, so the first figures arrive without motion.
 */
function Crossfade({ k, className, children }: { k: string | number; className?: string; children: ReactNode }) {
  return (
    <span className={"ch-ms-poll__x" + (className ? ` ${className}` : "")}>
      <AnimatePresence initial={false}>
        <FadeCopy key={k}>{children}</FadeCopy>
      </AnimatePresence>
    </span>
  );
}

/** A part of the sheet that fades out when it leaves and back in when it returns (M11, M17); drawn at once the first time. */
function FadePart({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <FadeCopy as="div" className={className}>
      {children}
    </FadeCopy>
  );
}

export function PollCard({
  api,
  messageId,
  poll,
  mine,
}: {
  api: ChMessagesApi;
  messageId: string;
  poll: Poll;
  /** The viewer sent it: they can close it. */
  mine: boolean;
}) {
  const polls = api.polls;
  const thread = useContext(PollThreadContext);
  const qid = useId();
  const [votesOpen, setVotesOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // M3: the row the viewer last tapped; only its check plays the pop (a card that loads voted shows it at rest).
  const [tapped, setTapped] = useState<string | null>(null);
  const tally = polls?.tally(messageId, poll) ?? null;
  const nowMs = usePollClock(poll.closesAt, api.now);
  const closed = isPollClosed(poll, nowMs);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  // Everyone in the thread can vote, the sender too (memberIds are the others), and anyone who voted and then left
  // still counts, so the footer never reads "9 of 8".
  const eligible = conv && tally ? pollEligibleCount(tally, [...conv.memberIds, api.viewer.userId]) : conv ? conv.memberIds.length + 1 : null;
  const busy = polls?.pending.has(messageId) ?? false;
  const mineIds = tally?.mine ?? [];
  const nameOf = (id: string) => api.directory.find((p) => p.userId === id)?.name ?? "Member";
  // Remind: a coach, an open poll, the votes in, and someone left. `memberIds` are the others, so the viewer is out of
  // both the condition and the count, and a coach is never named in their own reminder; never "Remind 0".
  const waiting = tally && conv ? pollWaiting(tally, conv.memberIds) : [];
  const coach = api.viewer.role === "coach";
  const remind =
    coach && thread && !closed && tally && waiting.length > 0
      ? {
          count: waiting.length,
          run: () => {
            haptic("select");
            setVotesOpen(false);
            const endsPhrase = poll.closesAt ? endsWords(poll.closesAt, api.now, api.timeZone, api.clock ?? "12") : null;
            thread.replyWith(messageId, pollRemindDraft({ firstNames: shortNames(waiting, nameOf), endsPhrase }));
          },
        }
      : null;
  // Share result: final, at least one vote, and the sender or a coach.
  const share =
    thread && closed && tally && tally.voterCount > 0 && (mine || coach)
      ? () => {
          haptic("select");
          thread.replyWith(messageId, pollResultDraft(poll, tally));
        }
      : null;
  useEffect(() => {
    cardActions.set(messageId, {
      seeVotes: tally ? () => setVotesOpen(true) : null,
      remind,
      close: mine && !closed && tally ? () => setClosing(true) : null,
      share,
    });
    return () => {
      cardActions.delete(messageId);
    };
  });

  const pressAt = useRef(0);
  const pick = (optionId: string, viaKeyboard = false) => {
    // A long press that opened the message's actions isn't also a vote (a key press never is one).
    if (!polls || closed || !tally || (!viaKeyboard && heldSince(pressAt.current))) return;
    let next: string[];
    if (poll.multi) next = mineIds.includes(optionId) ? mineIds.filter((id) => id !== optionId) : [...mineIds, optionId];
    else next = mineIds.includes(optionId) ? [] : [optionId];
    // encodeChoice orders the ids as the options are, so "o3,o1" can't be stored.
    const ordered = next.length ? (encodeChoice(poll, next)?.split(",") ?? []) : [];
    haptic("select");
    setTapped(optionId);
    polls.vote(messageId, poll, ordered);
  };

  const countText = !tally
    ? polls?.error
      ? "Votes didn’t load"
      : "Loading votes…"
    : tally.voterCount === 0
      ? closed
        ? "No one voted"
        : "No votes yet"
      : eligible
        ? tally.voterCount >= eligible
          ? "Everyone voted"
          : `${tally.voterCount} of ${eligible} voted`
        : tally.voterCount === 1
          ? "1 vote"
          : `${tally.voterCount} voted`;
  const ends = endsLabel(poll, closed, api.now, api.timeZone, api.clock ?? "12", nowMs);
  const state = pollState(poll, nowMs);
  const soon = !closed && !!poll.closesAt && Date.parse(poll.closesAt) - nowMs < 3_600_000;
  const tied = !!tally && tally.leaders.length > 1;
  // Single answer: one tab stop on the picked choice (or the first); arrows move focus only, never a vote, and Space or
  // Enter votes. Several answers: each checkbox is its own stop.
  const stop = poll.multi ? null : (mineIds[0] ?? poll.options[0]!.id);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (poll.multi) return;
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const d = keys[e.key];
    if (d == null && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const all = Array.from(e.currentTarget.closest("ul")?.querySelectorAll<HTMLButtonElement>("button[role=radio]") ?? []);
    const at = all.indexOf(e.currentTarget);
    const to = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (at + d! + all.length) % all.length;
    all[to]?.focus();
  };
  return (
    <div className={"ch-ms-poll" + (closed ? " is-closed" : "")} role="group" aria-labelledby={qid} aria-busy={busy || undefined}>
      <div className="ch-ms-poll__head">
        {/* D12: says what happened: the sender closed it, or its time ran out. M8: the glyph and words cross when it closes live. */}
        <Crossfade k={state}>
          <Icon icon={closed ? Lock : ListChecks} size={14} />
          <span>{state === "closed" ? "Poll closed" : state === "ended" ? "Voting ended" : "Poll"}</span>
        </Crossfade>
        {ends && (
          <>
            <span className="ch-ms-poll__dot" aria-hidden="true">
              ·
            </span>
            <span className={"ch-ms-poll__ends" + (soon ? " is-soon" : "")}>{ends}</span>
          </>
        )}
      </div>
      <p id={qid} className="ch-ms-poll__q">
        {poll.question}
      </p>
      {poll.multi && !closed && <p className="ch-ms-poll__sub">Choose any that work</p>}
      <ul className="ch-ms-poll__opts" role={poll.multi ? "group" : "radiogroup"} aria-labelledby={qid}>
        {poll.options.map((o) => {
          const n = tally?.counts[o.id] ?? 0;
          const share = tally ? pollShare(tally, o.id) : 0;
          const on = mineIds.includes(o.id);
          const lead = !!tally && tally.leaders.includes(o.id) && tally.voterCount > 0;
          return (
            <li key={o.id} role="none">
              <button
                type="button"
                role={poll.multi ? "checkbox" : "radio"}
                aria-checked={on}
                tabIndex={stop == null || stop === o.id ? 0 : -1}
                onKeyDown={onKey}
                aria-disabled={closed || !tally || undefined}
                aria-label={`${o.label}, ${plural(n, "vote")}${on ? ", your vote" : ""}${lead && closed ? ", most votes" : ""}`}
                className={
                  "ch-ms-poll__opt" + (on ? " is-on" : "") + (lead ? " is-lead" : "") + (poll.multi ? " is-multi" : "")
                }
                style={{ ["--ch-poll-share" as string]: String(share) }}
                onPointerDown={() => {
                  pressAt.current = Date.now();
                }}
                onClick={(e) => pick(o.id, e.detail === 0)}
              >
                <span className="ch-ms-poll__fill" aria-hidden="true" />
                <span className="ch-ms-poll__level" aria-hidden="true" />
                <span className="ch-ms-poll__mark" aria-hidden="true" data-pop={on && tapped === o.id ? "" : undefined}>
                  {on && <Icon icon={Check} size={12} />}
                </span>
                <span className="ch-ms-poll__label">{o.label}</span>
                {/* M8: the leader's tag fades in when the poll closes live (nothing animates on a card drawn final). */}
                <AnimatePresence initial={false}>
                  {lead && closed && <FadeCopy key="tag" className="ch-ms-poll__tag">{tied ? "Tied" : "Most votes"}</FadeCopy>}
                </AnimatePresence>
                {/* An honest "0" (tertiary ink) open or final; "—" only while the votes load or failed to. M5: a changed count crosses in place. */}
                {tally ? (
                  <span className={"ch-ms-poll__n ch-num" + (n === 0 ? " is-zero" : "")} aria-hidden="true">
                    <Crossfade k={n}>{n}</Crossfade>
                  </span>
                ) : (
                  <span className="ch-ms-poll__n ch-num" aria-hidden="true">
                    —
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ch-ms-poll__foot">
        {/* No live region: a thread with several polls would read out every vote on every card. A voter hears their own
            pick through the option's checked state. */}
        {/* M5, M7: a changed line (and "Everyone voted") crosses in place once the votes are in. */}
        {tally ? (
          <Crossfade k={countText} className="ch-ms-poll__count ch-num">
            {countText}
          </Crossfade>
        ) : (
          <span className="ch-ms-poll__count ch-num">{countText}</span>
        )}
        {!tally && polls?.error ? (
          <button type="button" className="ch-ms-poll__link" onClick={polls.retry}>
            Retry
          </button>
        ) : (
          tally && (
            <button type="button" className="ch-ms-poll__link" onClick={() => setVotesOpen(true)}>
              See votes
            </button>
          )
        )}
        {remind && (
          <button type="button" className="ch-ms-poll__link" onClick={remind.run}>
            Remind {remind.count}
          </button>
        )}
        {mine && !closed && tally && (
          <button type="button" className="ch-ms-poll__link" onClick={() => setClosing(true)}>
            Close poll
          </button>
        )}
        {share && (
          <button type="button" className="ch-ms-poll__link" onClick={share}>
            Share result
          </button>
        )}
      </div>
      <PollVotesModal api={api} conv={conv} poll={poll} tally={tally} closed={closed} remind={remind} open={votesOpen} onClose={() => setVotesOpen(false)} />
      <ClosePollModal api={api} messageId={messageId} open={closing} onClose={() => setClosing(false)} />
    </div>
  );
}

/**
 * D29: who picked what, and who hasn't answered yet. Votes are visible to everyone in the thread, so this hides nothing.
 * No vote times in v1 (a vote's time would come from a device clock until the held updated_at trigger is applied):
 * "You" first, then by name. Someone who voted and has since left reads "Left the group".
 */
function PollVotesModal({
  api,
  conv,
  poll,
  tally,
  closed,
  remind,
  open,
  onClose,
}: {
  api: ChMessagesApi;
  conv: ChConv | null;
  poll: Poll;
  tally: PollTally | null;
  closed: boolean;
  remind: PollCardActions["remind"];
  open: boolean;
  onClose: () => void;
}) {
  const me = api.viewer.userId;
  const nameOf = (id: string) => (id === me ? "You" : (api.directory.find((p) => p.userId === id)?.name ?? "Member"));
  const members = new Set([me, ...(conv?.memberIds ?? [])]);
  const order = (ids: readonly string[]) => [...ids].sort((a, b) => (a === me ? -1 : b === me ? 1 : nameOf(a).localeCompare(nameOf(b))));
  const waiting = tally && conv ? order(pollWaiting(tally, [me, ...conv.memberIds])) : [];
  const row = (id: string) => (
    <li key={id} className="ch-ms-pollv__row">
      <Avatar name={id === me ? api.viewer.name : nameOf(id)} size="sm" />
      <span className="ch-ms-pollv__name">{nameOf(id)}</span>
      {!members.has(id) && <span className="ch-ms-pollv__left">Left the group</span>}
    </li>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ListChecks}
      title="Votes"
      description={poll.question}
      width={440}
      action={closed ? <span className="ch-ms-pollv__final">Final</span> : undefined}
      footer={
        remind ? (
          <Button variant="primary" onClick={remind.run}>
            Remind {remind.count}
          </Button>
        ) : undefined
      }
    >
      <div className="ch-ms-pollv">
        {poll.options.map((o) => {
          const ids = order(tally?.voters[o.id] ?? []);
          return (
            <section key={o.id} className="ch-ms-pollv__opt" aria-label={o.label}>
              <h3 className="ch-ms-pollv__h">
                <span>{o.label}</span>
                <span className="ch-num">{ids.length}</span>
              </h3>
              {ids.length ? <ul className="ch-ms-pollv__who">{ids.map(row)}</ul> : <p className="ch-ms-pollv__none">No votes yet</p>}
            </section>
          );
        })}
        {waiting.length > 0 && (
          <section className="ch-ms-pollv__opt is-waiting" aria-label="Hasn’t voted">
            <h3 className="ch-ms-pollv__h">
              <span>Hasn’t voted</span>
              <span className="ch-num">{waiting.length}</span>
            </h3>
            <ul className="ch-ms-pollv__who">{waiting.map(row)}</ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

function ClosePollModal({ api, messageId, open, onClose }: { api: ChMessagesApi; messageId: string; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Lock}
      title="Close this poll?"
      description="The votes stay as they are and no one can change them."
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep open
          </Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={async () => {
              if (!api.polls) return;
              setBusy(true);
              const ok = await api.polls.close(messageId);
              setBusy(false);
              if (ok) {
                haptic("success");
                onClose();
              }
            }}
          >
            {busy ? "Closing…" : "Close poll"}
          </Button>
        </>
      }
    />
  );
}

type Ends = "none" | "1h" | "1d" | "3d" | "custom";
const ENDS: ReadonlyArray<{ value: Ends; label: string }> = [
  { value: "none", label: "No end" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "custom", label: "Custom" },
];
const ENDS_MS: Record<Exclude<Ends, "custom">, number> = { none: 0, "1h": 3_600_000, "1d": 86_400_000, "3d": 3 * 86_400_000 };

const PROBLEM: Record<string, string> = {
  question: "Add a question.",
  options: `Add ${POLL_MIN_OPTIONS} to ${POLL_MAX_OPTIONS} choices.`,
  duplicate: "Two choices say the same thing.",
  closes: "Pick an end time that hasn’t passed.",
  closes_far: "Pick an end time within 30 days.",
};
/** Which field a problem points at, for its `aria-invalid`. */
const PROBLEM_FIELD: Record<string, "question" | "options" | "ends"> = { question: "question", options: "options", duplicate: "options", closes: "ends", closes_far: "ends" };

/** One conversation's unsent poll, kept for the session when the sheet is cancelled (4.4.1 Cancel). */
interface PollSheetDraft {
  question: string;
  options: string[];
  placeholders: readonly string[] | null;
  multi: boolean;
  ends: Ends;
  customDate: string;
  customTime: string;
}
const drafts = new Map<string, PollSheetDraft>();
/** A choice row of the sheet: its text and an id that stays with it as rows come and go. */
interface PollRow {
  id: number;
  text: string;
}
/** Test seam: the kept drafts start empty in each test. */
export const clearPollDrafts = () => drafts.clear();

/** "today at 7:12 PM", "tomorrow at …", "Thursday at …", "Oct 30 at …", on the team's clock. */
function endsWords(iso: string, nowIso: string, timeZone: string, hours: "12" | "24") {
  return `${untilLabel(iso, nowIso, timeZone)} at ${clock(iso, timeZone, hours)}`;
}

/** The composer's poll button: group threads only, where "9 of 12 voted" means something. */
export function PollButton({ api, conv, disabled }: { api: ChMessagesApi; conv: ChConv; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!api.polls || !conv.group) return null;
  return (
    <>
      <IconButton icon={ListChecks} label="New poll" size="sm" disabled={disabled} onClick={() => setOpen(true)} />
      <PollSheet key={conv.id} api={api} conv={conv} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Write a poll: a question, two to six choices (a spare row appears as the last one fills, as Reminders adds a row),
 * more than one answer or not, and an optional end. Send writes it into the thread; nothing is saved before that.
 * Cancel keeps the draft for this conversation for the session; Clear throws it away. Quick start fills the empty form.
 * A Custom end is a date and time on the team's clock (`api.timeZone`), never the device's.
 */
export function PollSheet({ api, conv, open, onClose }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void }) {
  const zone = api.timeZone;
  const hours = api.clock ?? "12";
  const kept = drafts.get(conv.id);
  const [question, setQuestion] = useState(kept?.question ?? "");
  // M10: each choice row keeps an id of its own, so a row that is added or removed animates and the others stay put.
  const rowIds = useRef(0);
  const [rows, setRows] = useState<PollRow[]>(() => (kept?.options ?? ["", ""]).map((text) => ({ id: rowIds.current++, text })));
  const options = useMemo(() => rows.map((r) => r.text), [rows]);
  // The same texts on the rows that are already there, by place; new places get new ids.
  const fit = (prev: PollRow[], texts: readonly string[]): PollRow[] => texts.map((text, i) => ({ id: prev[i]?.id ?? rowIds.current++, text }));
  const [placeholders, setPlaceholders] = useState<readonly string[] | null>(kept?.placeholders ?? null);
  const [multi, setMulti] = useState(kept?.multi ?? false);
  const [ends, setEnds] = useState<Ends>(kept?.ends ?? "none");
  const [custom, setCustom] = useState(() => (kept ? { date: kept.customDate, time: kept.customTime } : defaultCustomEnd(Date.now(), zone)));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; field: "question" | "options" | "ends" | null } | null>(null);
  const [earlier, setEarlier] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const list = useRef<HTMLOListElement | null>(null);
  const endsRow = useRef<HTMLDivElement | null>(null);
  const [endsFit, setEndsFit] = useState(true);
  const clientId = useRef<string>(crypto.randomUUID());
  // D19: the last Send that threw, and the draft it carried. An edited retry passes that id as `priorClientId`.
  const threw = useRef<{ id: string; signature: string } | null>(null);
  const lastTry = useRef<string | null>(null);
  const filled = options.filter((o) => o.trim()).length;
  const empty = !question.trim() && options.every((o) => !o.trim());
  const ready = !!question.trim() && filled >= POLL_MIN_OPTIONS;
  const signature = JSON.stringify([question, options, multi, ends, ends === "custom" ? custom : null]);

  // Kept for the session as it is typed, so Cancel, a closed sheet or a thread switch never loses it; an empty form keeps nothing.
  useEffect(() => {
    if (empty && !multi && ends === "none") drafts.delete(conv.id);
    else drafts.set(conv.id, { question, options, placeholders, multi, ends, customDate: custom.date, customTime: custom.time });
  }, [conv.id, question, options, placeholders, multi, ends, custom, empty]);
  // The resolved line re-reads once a minute while open, so "1 hour" always shows the real end.
  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [open]);
  // 4.4.1: at a large Text Size the five segments stop fitting; the field then draws one Menu row instead.
  useEffect(() => {
    const el = endsRow.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const labels = [...el.querySelectorAll<HTMLElement>(".ch-seg__l")];
      setEndsFit(!labels.some((l) => l.scrollWidth > l.clientWidth + 1));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, endsFit]);

  // M12: the fields stay drawn while the row closes on the base beat, then go (inert and hidden meanwhile).
  const [customShown, setCustomShown] = useState(ends === "custom");
  useEffect(() => {
    if (ends === "custom") {
      setCustomShown(true);
      return;
    }
    const t = setTimeout(() => setCustomShown(false), CH_DUR.base * 1000 + 40);
    return () => clearTimeout(t);
  }, [ends]);

  const customEnd = ends === "custom" ? zonedWallTimeToInstant(custom.date, custom.time, zone) : null;
  // The end time is worked out when Send is pressed, so a sheet left open for a while can't send a poll that has
  // already ended.
  const closesAtFor = (now: number): string | null =>
    ends === "none" ? null : ends === "custom" ? (customEnd?.at ?? null) : new Date(now + ENDS_MS[ends]).toISOString();
  const preview = closesAtFor(nowMs);
  const nowIso = new Date(nowMs).toISOString();

  const reset = () => {
    setQuestion("");
    setRows((prev) => fit(prev, ["", ""]));
    setPlaceholders(null);
    setMulti(false);
    setEnds("none");
    setCustom(defaultCustomEnd(Date.now(), zone));
    setProblem(null);
    setEarlier(false);
    clientId.current = crypto.randomUUID();
    threw.current = null;
    lastTry.current = null;
    drafts.delete(conv.id);
  };

  const setOption = (i: number, text: string) => {
    setRows((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i]!, text };
      // A spare row once every row has text, up to six; trailing empty rows past two fold away.
      if (next.every((r) => r.text.trim()) && next.length < POLL_MAX_OPTIONS) next.push({ id: rowIds.current++, text: "" });
      while (next.length > POLL_MIN_OPTIONS && !next[next.length - 1]!.text.trim() && !next[next.length - 2]!.text.trim()) next.pop();
      return next;
    });
    setProblem(null);
  };

  const suggest = (i: number) => {
    const s = POLL_SUGGESTIONS[i]!;
    haptic("select");
    setQuestion(s.question);
    setRows((prev) => fit(prev, s.options));
    setPlaceholders(s.placeholders ?? null);
    setMulti(s.multi);
    setEnds(s.ends);
    setProblem(null);
    // Focus the first empty choice, or the question's end.
    requestAnimationFrame(() => {
      const inputs = [...(list.current?.querySelectorAll<HTMLInputElement>("li:not([data-leaving]) input") ?? [])];
      const target = inputs.find((x) => !x.value) ?? document.querySelector<HTMLInputElement>("#ch-ms-poll-q");
      target?.focus();
      if (target === document.querySelector("#ch-ms-poll-q")) target?.setSelectionRange(target.value.length, target.value.length);
    });
  };

  const send = async (fresh = false) => {
    if (!api.polls || busy) return;
    const draft: PollDraft = { question, options, multi, closesAt: closesAtFor(Date.now()) };
    if (ends === "custom" && !customEnd) {
      setProblem({ text: PROBLEM.closes!, field: "ends" });
      haptic("error");
      return;
    }
    const built = buildPollPayload(draft);
    if (!built.ok) {
      setProblem({ text: PROBLEM[built.problem] ?? "", field: PROBLEM_FIELD[built.problem] ?? null });
      haptic("error");
      return;
    }
    // An unedited retry keeps its id (the server answers its own replay as success). An edited one is a new poll: a
    // new id, and if the last Send threw, that send's id goes along so the server can say whether it landed.
    let prior: string | undefined;
    if (fresh || (lastTry.current !== null && lastTry.current !== signature)) {
      if (!fresh && threw.current && threw.current.signature !== signature) prior = threw.current.id;
      clientId.current = crypto.randomUUID();
    }
    lastTry.current = signature;
    setBusy(true);
    setEarlier(false);
    const sentId = clientId.current;
    const result = await api.polls.send(conv.id, draft, sentId, prior);
    setBusy(false);
    if (result.ok) {
      haptic("success");
      reset();
      onClose();
      return;
    }
    if (result.earlierCopy) {
      setEarlier(true);
      return;
    }
    threw.current = result.threw ? { id: sentId, signature } : null;
    if (!result.threw) setProblem({ text: result.error, field: null });
    haptic("error");
  };

  // Cmd or Ctrl Enter sends from any field (desktop).
  const sendKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return false;
    e.preventDefault();
    void send();
    return true;
  };
  const invalid = (field: "question" | "options" | "ends") => (problem?.field === field ? true : undefined);
  const left = POLL_QUESTION_MAX - question.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ListChecks}
      title="New poll"
      description={`Everyone in ${conv.title} can vote and see who voted.`}
      initialFocus="#ch-ms-poll-q"
      width={480}
      action={
        !empty || multi || ends !== "none" ? (
          <button
            type="button"
            className="ch-ms-pollf__clear"
            onClick={() => {
              haptic("warning");
              reset();
            }}
          >
            Clear
          </button>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={earlier ? "secondary" : "primary"} busy={busy} disabled={!ready} onClick={() => void send()}>
            {busy ? "Sending…" : "Send poll"}
          </Button>
        </>
      }
    >
      <form
        className="ch-ms-pollf"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="ch-field">
          <label className="ch-field__label" htmlFor="ch-ms-poll-q">
            Question
          </label>
          <input
            id="ch-ms-poll-q"
            className="ch-input"
            value={question}
            maxLength={POLL_QUESTION_MAX}
            placeholder="Ask the team something"
            autoComplete="off"
            enterKeyHint="next"
            readOnly={busy}
            aria-invalid={invalid("question")}
            aria-describedby={left <= 20 ? "ch-ms-poll-q-left" : undefined}
            onChange={(e) => {
              setQuestion(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (sendKey(e) || e.key !== "Enter") return;
              e.preventDefault();
              list.current?.querySelector<HTMLInputElement>("li:not([data-leaving]) input")?.focus();
            }}
          />
          {left <= 20 && (
            <p id="ch-ms-poll-q-left" className={"ch-field__help ch-num" + (left === 0 ? " is-error" : "")}>
              {left === 0 ? "No characters left" : `${left} left`}
            </p>
          )}
        </div>
        {/* M11, M17: the chips fade out once there is something to keep, and back in when Clear empties the form. */}
        <AnimatePresence initial={false}>
          {empty && (
            <FadePart key="quick" className="ch-ms-pollf__quick">
              <span className="ch-ms-pollf__quickl" id="ch-ms-poll-quick">
                Quick start
              </span>
              <div className="ch-ms-pollf__chips" role="group" aria-labelledby="ch-ms-poll-quick">
                {POLL_SUGGESTIONS.map((sg, i) => (
                  <button key={sg.chip} type="button" className="ch-ms-pollf__chip" onClick={() => suggest(i)}>
                    {sg.chip}
                  </button>
                ))}
              </div>
            </FadePart>
          )}
        </AnimatePresence>
        <fieldset className="ch-ms-pollf__set" aria-invalid={invalid("options")}>
          <legend className="ch-field__label">Choices</legend>
          <ol ref={list} className="ch-ms-pollf__opts">
            <ListPresence>
              {options.map((o, i) => (
                <PresenceRow as="li" key={rows[i]!.id} className="ch-ms-pollf__opt">
                  <span className="ch-ms-pollf__n ch-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    className="ch-input"
                    aria-label={`Choice ${i + 1}`}
                    value={o}
                    maxLength={POLL_OPTION_MAX}
                    placeholder={placeholders?.[i] ?? (i < POLL_MIN_OPTIONS ? `Choice ${i + 1}` : "Add a choice")}
                    autoComplete="off"
                    readOnly={busy}
                    enterKeyHint={i === options.length - 1 ? "done" : "next"}
                    onChange={(e) => setOption(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (sendKey(e) || e.key !== "Enter") return;
                      e.preventDefault();
                      // Return moves on; on an empty spare it does nothing.
                      if (!o.trim()) return;
                      list.current?.querySelectorAll<HTMLInputElement>("li:not([data-leaving]) input")[i + 1]?.focus();
                    }}
                  />
                  {options.length > POLL_MIN_OPTIONS && o.trim() && (
                    <IconButton
                      icon={Minus}
                      label={`Remove choice ${i + 1}`}
                      size="sm"
                      onClick={() =>
                        setRows((prev) => {
                          const next = prev.filter((_, j) => j !== i);
                          if (next.every((x) => x.text.trim()) && next.length < POLL_MAX_OPTIONS) next.push({ id: rowIds.current++, text: "" });
                          return next;
                        })
                      }
                    />
                  )}
                </PresenceRow>
              ))}
            </ListPresence>
          </ol>
          {options.length >= POLL_MAX_OPTIONS && options.every((o) => o.trim()) ? (
            <p className="ch-field__help">A poll takes up to 6 choices.</p>
          ) : (
            <p className="ch-field__help">
              <Icon icon={Plus} size={12} /> A new row appears as you fill the last one.
            </p>
          )}
        </fieldset>
        <Switch checked={multi} onChange={setMulti} label="Allow more than one answer" />
        <div className="ch-field" aria-invalid={invalid("ends")}>
          <span className="ch-field__label" id="ch-ms-poll-ends">
            Voting ends
          </span>
          {endsFit ? (
            <div ref={endsRow}>
              <Segmented<Ends> label="Voting ends" value={ends} options={ENDS} onChange={setEnds} block size="sm" />
            </div>
          ) : (
            <Menu
              label="Voting ends"
              align="start"
              items={ENDS.map((e) => ({ label: e.label, checked: e.value === ends, onSelect: () => setEnds(e.value) }))}
              trigger={(p) => (
                <button type="button" className="ch-ms-pollf__endsrow" {...p}>
                  Voting ends · {ENDS.find((e) => e.value === ends)!.label}
                </button>
              )}
            />
          )}
          <div className={"ch-ms-pollf__custom" + (ends === "custom" ? " is-open" : "")} aria-hidden={ends === "custom" ? undefined : true} inert={ends !== "custom"}>
            <div className="ch-ms-pollf__customin">
              {customShown && (
                <>
                  <DateField label="Date" value={custom.date} onChange={(v) => v && setCustom((c) => ({ ...c, date: v }))} />
                  <TimeField label="Time" value={custom.time} onChange={(v) => v && setCustom((c) => ({ ...c, time: v }))} />
                </>
              )}
            </div>
          </div>
          {preview && (
            <p className="ch-field__help ch-num" aria-live="polite">
              Voting ends {endsWords(preview, nowIso, zone, hours)}
            </p>
          )}
          {customEnd?.shifted && <p className="ch-field__help">That time is skipped when the clocks go forward, so voting ends an hour later.</p>}
        </div>
        {earlier && (
          <div className="ch-ms-pollf__earlier" data-ch-code="CH-7031">
            <InlineNotice title="An earlier copy of this poll was already sent" body="Check the thread. Send this version too?" />
            <div className="ch-ms-pollf__earlierb">
              <Button variant="secondary" size="sm" onClick={() => void send(true)}>
                Send this version
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        )}
        {problem && (
          <p className="ch-field__help is-error" role="alert">
            {problem.text}
          </p>
        )}
      </form>
    </Modal>
  );
}
