"use client";

import { personOf } from "./person-of";
import { ListChecks, Lock, Minus } from "lucide-react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  buildPollPayload,
  customEndOf,
  defaultCustomEnd,
  encodeChoice,
  isPollClosed,
  nextPollCheckDelay,
  pollState,
  pollShare,
  pollReminderLine,
  pollResultDraft,
  pollWaiting,
  zonedWallTimeToInstant,
  type Poll,
  type PollDraft,
  type PollTally,
} from "@/lib/golf/message-polls";
import { haptic } from "../../lib/haptics";
import { plural } from "../../lib/plural";
import { CH_DUR } from "../../lib/motion";
import { useToast } from "../../ui/Toast";
import { Avatar } from "../../ui/Avatar";
import { Button, IconButton } from "../../ui/Button";
import { DateField } from "../../ui/DateField";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { Modal } from "../../ui/Modal";
import { ListPresence, PresenceRow } from "../../ui/ListPresence";
import { InlineNotice } from "../../ui/Notices";
import { Switch } from "../../ui/Switch";
import { TimeField } from "../../ui/TimeField";
import { clock, untilLabel, type ChConv } from "./model";
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

/**
 * The footer's second part (MSG-501): "Closes tomorrow at 6:00 PM", the last hour counting down ("Closes in 12 min"), "Final" once
 * closed by hand or "Voting ended" when its time ran out. Nothing when the poll has no end.
 */
export function closesLabel(poll: Poll, state: ReturnType<typeof pollState>, now: string, timeZone: string, hours: "12" | "24", nowMs: number): string | null {
  if (state === "closed") return "Final";
  if (state === "ended") return "Voting ended";
  if (!poll.closesAt) return null;
  // The last hour counts down, so a tap just before the end never looks like it landed after it.
  const left = Date.parse(poll.closesAt) - nowMs;
  if (left < 60_000) return "Closes in under a minute";
  if (left < 3_600_000) return `Closes in ${Math.ceil(left / 60_000)} min`;
  return `Closes ${endsWords(poll.closesAt, now, timeZone, hours)}`;
}

/** Header words (MSG-501): "Poll · Choose one", "Poll · Choose any", and "Poll · Final" once it is over (Q-08). */
export const pollHeadWords = (poll: Poll, closed: boolean): string => `Poll · ${closed ? "Final" : poll.multi ? "Choose any" : "Choose one"}`;

/** The footer's first part: the votes cast (a vote per choice picked), "No votes yet" while there are none. */
export function votesWords(tally: PollTally | null, failed: boolean, closed: boolean): string {
  if (!tally) return failed ? "Votes didn’t load" : "Loading votes…";
  const votes = Object.values(tally.counts).reduce((sum, n) => sum + n, 0);
  if (votes === 0) return closed ? "No one voted" : "No votes yet";
  return plural(votes, "vote");
}

/** Whose face goes where in a choice's stack: yours first, then the others, up to three (MSG-502). */
export function faceOrder(voters: readonly string[], me: string): string[] {
  return [...voters].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0)).slice(0, 3);
}

/** The one choice with the most votes, or null when none, or two or more tie (Q-34: any time, open or final). */
export function soleLeader(tally: PollTally | null): string | null {
  return tally && tally.voterCount > 0 && tally.leaders.length === 1 ? tally.leaders[0]! : null;
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
  const toast = useToast();
  const qid = useId();
  const [votesOpen, setVotesOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // M3: the row the viewer last tapped; only its check plays the pop (a card that loads voted shows it at rest).
  const [tapped, setTapped] = useState<string | null>(null);
  const tally = polls?.tally(messageId, poll) ?? null;
  const nowMs = usePollClock(poll.closesAt, api.now);
  const closed = isPollClosed(poll, nowMs);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  const busy = polls?.pending.has(messageId) ?? false;
  const mineIds = tally?.mine ?? [];
  const nameOf = (id: string) => personOf(api, id)?.name ?? "Member";
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
            const by = poll.closesAt ? endsWords(poll.closesAt, api.now, api.timeZone, api.clock ?? "12") : null;
            // Q-09: the reminder names the poll and when it closes; it fills the composer and never sends itself.
            thread.replyWith(messageId, pollReminderLine({ question: poll.question, by }));
            toast({ title: "Reminder drafted. It sends only when you tap Send" });
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

  const state = pollState(poll, nowMs);
  const closes = closesLabel(poll, state, api.now, api.timeZone, api.clock ?? "12", nowMs);
  const footWords = [votesWords(tally, !!polls?.error, closed), tally ? closes : null].filter(Boolean).join(" · ");
  const leader = soleLeader(tally);
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
    <div
      className={"ch-ms-poll ch-msd-poll" + (closed ? " is-closed" : "") + (mine ? " is-mine" : " is-theirs")}
      data-ch-bubble=""
      role="group"
      aria-labelledby={qid}
      aria-busy={busy || undefined}
    >
      <div className="ch-msd-poll__head">
        <Icon icon={closed ? Lock : ListChecks} size={14} />
        <span>{pollHeadWords(poll, closed)}</span>
      </div>
      <p id={qid} className="ch-msd-poll__q">
        {poll.question}
      </p>
      <ul className="ch-msd-poll__opts" role={poll.multi ? "group" : "radiogroup"} aria-labelledby={qid}>
        {poll.options.map((o) => {
          const n = tally?.counts[o.id] ?? 0;
          const share = tally ? pollShare(tally, o.id) : 0;
          const on = mineIds.includes(o.id);
          const lead = leader === o.id;
          return (
            <li key={o.id} role="none">
              <button
                type="button"
                role={poll.multi ? "checkbox" : "radio"}
                aria-checked={on}
                tabIndex={stop == null || stop === o.id ? 0 : -1}
                onKeyDown={onKey}
                aria-disabled={closed || !tally || undefined}
                aria-label={`${o.label}, ${plural(n, "vote")}${on ? ", your vote" : ""}${lead ? ", most votes" : ""}`}
                className={"ch-msd-poll__opt" + (on ? " is-on" : "") + (lead ? " is-lead" : "") + (poll.multi ? " is-multi" : "")}
                style={{ ["--ch-poll-share" as string]: String(share) }}
                onPointerDown={() => {
                  pressAt.current = Date.now();
                }}
                onClick={(e) => pick(o.id, e.detail === 0)}
              >
                <span className="ch-msd-poll__fill" aria-hidden="true" />
                <span className="ch-msd-poll__mark" aria-hidden="true" data-pop={on && tapped === o.id ? "" : undefined}>
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.2 6.4 4.9 9l4.9-5.6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={20} strokeDasharray={20} strokeDashoffset={0} />
                    </svg>
                  )}
                </span>
                <span className="ch-msd-poll__label">
                  {o.label}
                  {lead && <span className="ch-msd-poll__chip">Most votes</span>}
                </span>
                <span className="ch-msd-poll__side" aria-hidden="true">
                  {tally && (tally.voters[o.id]?.length ?? 0) > 0 && (
                    <span className="ch-msd-poll__faces">
                      {faceOrder(tally.voters[o.id] ?? [], api.viewer.userId).map((id) => (
                        <span key={id} data-pop={id === api.viewer.userId && tapped === o.id ? "" : undefined}>
                          <Avatar name={id === api.viewer.userId ? api.viewer.name : nameOf(id)} size={18} />
                        </span>
                      ))}
                    </span>
                  )}
                  {/* The count changes at once while its bar glides (no count-up, MOTION house rules). */}
                  <span className="ch-msd-poll__n ch-num">{tally ? n : "—"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ch-msd-poll__foot">
        {/* No live region: a thread with several polls would read out every vote on every card. A voter hears their own
            pick through the option's checked state. */}
        <span className="ch-msd-poll__count ch-num">{footWords}</span>
        {!tally && polls?.error ? (
          <button type="button" className="ch-msd-poll__link" onClick={polls.retry}>
            Retry
          </button>
        ) : (
          tally && (
            <button type="button" className="ch-msd-poll__link" onClick={() => setVotesOpen(true)}>
              See votes
            </button>
          )
        )}
        {remind && (
          <button type="button" className="ch-msd-poll__link" onClick={remind.run}>
            Remind {remind.count}
          </button>
        )}
        {mine && !closed && tally && (
          <button type="button" className="ch-msd-poll__link" onClick={() => setClosing(true)}>
            Close poll
          </button>
        )}
        {share && (
          <button type="button" className="ch-msd-poll__link" onClick={share}>
            Share result
          </button>
        )}
      </div>
      <PollVotesModal api={api} conv={conv} poll={poll} tally={tally} closed={closed} remind={remind} author={mine} open={votesOpen} onClose={() => setVotesOpen(false)} />
      <ClosePollModal api={api} messageId={messageId} open={closing} onClose={() => setClosing(false)} />
    </div>
  );
}

/**
 * D29, MSG-505: who picked what, and who hasn't answered yet. Votes are visible to everyone in the thread (RLS), so the choices
 * hide nothing. "Hasn't voted" is a tool for whoever asked the question and for coaches (Q-09, Q-16), so a player who did not
 * send the poll does not see who is still out. A card per choice, its share as a 3 px bar along the foot; "You" first.
 */
function PollVotesModal({
  api,
  conv,
  poll,
  tally,
  closed,
  remind,
  author,
  open,
  onClose,
}: {
  api: ChMessagesApi;
  conv: ChConv | null;
  poll: Poll;
  tally: PollTally | null;
  closed: boolean;
  remind: PollCardActions["remind"];
  /** The viewer sent the poll. */
  author: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const me = api.viewer.userId;
  const nameOf = (id: string) => (id === me ? "You" : (personOf(api, id)?.name ?? "Member"));
  const members = new Set([me, ...(conv?.memberIds ?? [])]);
  // MSG-VOTES-01: rows carry the person's line under the name.
  const lineOf = (id: string) => (id === me ? "" : (personOf(api, id)?.subtitle ?? ""));
  const order = (ids: readonly string[]) => [...ids].sort((a, b) => (a === me ? -1 : b === me ? 1 : nameOf(a).localeCompare(nameOf(b))));
  const showWaiting = api.viewer.role === "coach" || author;
  const allWaiting = showWaiting && tally && conv ? order(pollWaiting(tally, [me, ...conv.memberIds])) : [];
  // Redesign: "Hasn't voted" lists players, coaches left out (MSG-VOTES-01).
  const waiting = allWaiting.filter((id) => personOf(api, id)?.role !== "coach" && !(id === me && api.viewer.role === "coach"));
  const totalVotes = poll.options.reduce((sum, o) => sum + (tally?.voters[o.id]?.length ?? 0), 0);
  const row = (id: string) => (
    <li key={id} className="ch-msd-vg__row">
      <Avatar name={id === me ? api.viewer.name : nameOf(id)} size={32} />
      <span className="ch-msd-vg__person">
        <span className="ch-msd-vg__name">{nameOf(id)}</span>
        {lineOf(id) ? <small className="ch-msd-vg__line">{lineOf(id)}</small> : null}
      </span>
      {!members.has(id) && <span className="ch-msd-vg__left">Left the group</span>}
    </li>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={undefined}
      title="Votes"
      description={poll.question}
      width={400}
      className="ch-msv-sheet ch-msv-votes ch-msd-votes"
      action={closed ? <span className="ch-ms-pollv__final">Final</span> : undefined}
      footer={
        remind ? (
          <button type="button" className="ch-msd-draft" onClick={remind.run}>
            Draft a reminder
          </button>
        ) : undefined
      }
    >
      <div className="ch-msd-vgs">
        {poll.options.map((o) => {
          const ids = order(tally?.voters[o.id] ?? []);
          const pct = totalVotes ? Math.round((ids.length / totalVotes) * 100) : 0;
          return (
            <section key={o.id} className="ch-msd-vg" aria-label={o.label}>
              <h3 className="ch-msd-vg__h">
                <span>{o.label}</span>
                <small className="ch-num">{totalVotes > 0 ? `${ids.length} · ${pct}%` : ids.length}</small>
                <i className="ch-msd-vg__bar" aria-hidden="true" style={{ ["--ch-msd-w" as string]: `${pct}%` }} />
              </h3>
              {ids.length ? <ul className="ch-msd-vg__who">{ids.map(row)}</ul> : <p className="ch-msd-vg__none">No votes yet</p>}
            </section>
          );
        })}
        {waiting.length > 0 && (
          <section className="ch-msd-vg is-waiting" aria-label="Hasn’t voted">
            <h3 className="ch-msd-vg__h">
              <span>Hasn’t voted</span>
              <small className="ch-num">{waiting.length}</small>
            </h3>
            <ul className="ch-msd-vg__who">{waiting.map(row)}</ul>
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
/** Bumped when Ask hands this conversation a poll: the sheet remounts on it, and the composer opens the sheet once. */
const seeds = new Map<string, number>();
const seedOpened = new Set<string>();
const seedListeners = new Set<() => void>();
const subscribeSeeds = (l: () => void) => {
  seedListeners.add(l);
  return () => void seedListeners.delete(l);
};

/** Ask's poll, in the sheet's own draft. Nothing is posted until the coach presses Send. */
export function seedPollDraft(conversationId: string, poll: { question: string; options: string[]; multi?: boolean; closes?: string }, zone: string): void {
  const at = poll.closes ? Date.parse(poll.closes) : NaN;
  const end = Number.isFinite(at) ? customEndOf(at, zone) : defaultCustomEnd(Date.now(), zone);
  drafts.set(conversationId, { question: poll.question, options: [...poll.options, ""], placeholders: null, multi: !!poll.multi, ends: Number.isFinite(at) ? "custom" : "none", customDate: end.date, customTime: end.time });
  seeds.set(conversationId, (seeds.get(conversationId) ?? 0) + 1);
  seedListeners.forEach((l) => l());
}

/** The sheet's key for this conversation; calls `open` once for each poll Ask hands it. */
function usePollSeed(conversationId: string, open: () => void): string {
  const n = useSyncExternalStore(subscribeSeeds, () => seeds.get(conversationId) ?? 0, () => 0);
  useEffect(() => {
    const mark = `${conversationId}:${n}`;
    if (!n || seedOpened.has(mark)) return;
    seedOpened.add(mark);
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per seed; `open` is a fresh closure on the same state
  }, [conversationId, n]);
  return `${conversationId}:${n}`;
}
export { usePollSeed };

/** Test seam: the kept drafts start empty in each test. */
export const clearPollDrafts = () => drafts.clear();

/** "today at 7:12 PM", "tomorrow at …", "Thursday at …", "Oct 30 at …", on the team's clock. */
function endsWords(iso: string, nowIso: string, timeZone: string, hours: "12" | "24") {
  return `${untilLabel(iso, nowIso, timeZone)} at ${clock(iso, timeZone, hours)}`;
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
      icon={undefined}
      title="New poll"
      description={undefined}
      initialFocus="#ch-ms-poll-q"
      width={400}
      className="ch-msv-pollnew"
      action={
        (
          <>
            <button type="button" className="ch-msv-txtbtn is-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="ch-msv-txtbtn is-strong" disabled={!ready || busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </>
        )
      }
      footer={
        undefined
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
          ) : false}
        </fieldset>
        {/* MOT-X-7: 44 x 26, a 22 knob travelling 18 on a 320 ms spring, the track in 250 ms (messages-details.css). */}
        <div className="ch-msd-sw">
          <Switch checked={multi} onChange={setMulti} label="Allow multiple answers" />
        </div>
        <div className="ch-field" aria-invalid={invalid("ends")}>

          <Menu
              label="Closes"
              align="start"
              items={ENDS.map((e) => ({ label: e.label, checked: e.value === ends, onSelect: () => setEnds(e.value) }))}
              trigger={(p) => (
                <button type="button" className="ch-msv-closes" {...p}>
                  Closes
                  <b>{ENDS.find((e) => e.value === ends)!.label}</b>
                </button>
              )}
            />
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

/** The composer's poll button: group threads only, where "9 of 12 voted" means something. */
export function PollButton({ api, conv, disabled }: { api: ChMessagesApi; conv: ChConv; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const seedKey = usePollSeed(conv.id, () => setOpen(true));
  if (!api.polls || !conv.group) return null;
  return (
    <>
      <IconButton icon={ListChecks} label="New poll" size="sm" disabled={disabled} onClick={() => setOpen(true)} />
      <PollSheet key={seedKey} api={api} conv={conv} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
