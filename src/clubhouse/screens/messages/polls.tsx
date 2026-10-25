"use client";

import { Check, ListChecks, Lock, Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  buildPollPayload,
  encodeChoice,
  isPollClosed,
  pollEligibleCount,
  pollShare,
  pollWaiting,
  type Poll,
  type PollDraft,
  type PollTally,
} from "@/lib/golf/message-polls";
import { haptic } from "../../lib/haptics";
import { Avatar } from "../../ui/Avatar";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import { Segmented } from "../../ui/Segmented";
import { Switch } from "../../ui/Switch";
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
  /** `clientId` stays the same for one draft, so a Send retried after a lost answer can't post the poll twice. */
  send: (conversationId: string, draft: PollDraft, clientId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  close: (messageId: string) => Promise<boolean>;
}

function endsLabel(poll: Poll, closed: boolean, now: string, timeZone: string, hours: "12" | "24", nowMs: number) {
  if (poll.closedAt) return "Final";
  if (!poll.closesAt) return poll.multi ? "Choose any" : "Choose one";
  if (closed) return "Final";
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
  useEffect(() => {
    if (!closesAt) return;
    const end = Date.parse(closesAt);
    const left = end - Date.now();
    if (!Number.isFinite(end) || left <= 0) return;
    const atEnd = setTimeout(() => setNow(Date.now()), Math.min(left + 50, 2_147_000_000));
    const tick = left < 3_600_000 ? setInterval(() => setNow(Date.now()), 15_000) : null;
    return () => {
      clearTimeout(atEnd);
      if (tick) clearInterval(tick);
    };
  }, [closesAt, now]);
  return now;
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
  const qid = useId();
  const [votesOpen, setVotesOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const tally = polls?.tally(messageId, poll) ?? null;
  const nowMs = usePollClock(poll.closesAt, api.now);
  const closed = isPollClosed(poll, nowMs);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  // Everyone in the thread can vote, the sender too (memberIds are the others), and anyone who voted and then left
  // still counts, so the footer never reads "9 of 8".
  const eligible = conv && tally ? pollEligibleCount(tally, [...conv.memberIds, api.viewer.userId]) : conv ? conv.memberIds.length + 1 : null;
  const busy = polls?.pending.has(messageId) ?? false;
  const mineIds = tally?.mine ?? [];

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
    polls.vote(messageId, poll, ordered);
  };

  const ends = endsLabel(poll, closed, api.now, api.timeZone, api.clock ?? "12", nowMs);
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
        <Icon icon={closed ? Lock : ListChecks} size={14} />
        <span>{closed ? "Poll closed" : "Poll"}</span>
        <span className="ch-ms-poll__dot" aria-hidden="true">
          ·
        </span>
        <span className="ch-ms-poll__ends">{ends}</span>
      </div>
      <p id={qid} className="ch-ms-poll__q">
        {poll.question}
      </p>
      <ul className="ch-ms-poll__opts" role={poll.multi ? "group" : "radiogroup"} aria-labelledby={qid}>
        {poll.options.map((o) => {
          const n = tally?.counts[o.id] ?? 0;
          const share = tally ? pollShare(tally, o.id) : 0;
          const on = mineIds.includes(o.id);
          const lead = !!tally && tally.leaders.includes(o.id) && tally.voterCount > 0;
          const faces = tally?.voters[o.id] ?? [];
          return (
            <li key={o.id} role="none">
              <button
                type="button"
                role={poll.multi ? "checkbox" : "radio"}
                aria-checked={on}
                tabIndex={stop == null || stop === o.id ? 0 : -1}
                onKeyDown={onKey}
                aria-disabled={closed || !tally || undefined}
                aria-label={`${o.label}, ${n === 1 ? "1 vote" : `${n} votes`}${on ? ", your vote" : ""}${lead && closed ? ", most votes" : ""}`}
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
                <span className="ch-ms-poll__mark" aria-hidden="true">
                  {on && <Icon icon={Check} size={12} />}
                </span>
                <span className="ch-ms-poll__label">{o.label}</span>
                {faces.length > 0 && (
                  <span className="ch-ms-poll__faces" aria-hidden="true">
                    {faces.slice(0, 3).map((id) => (
                      <Avatar key={id} name={api.directory.find((p) => p.userId === id)?.name ?? "Member"} size={18} />
                    ))}
                  </span>
                )}
                <span className="ch-ms-poll__n ch-num" aria-hidden="true">
                  {tally ? n : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ch-ms-poll__foot">
        {/* No live region: a thread with several polls would read out every vote on every card. A voter hears their own
            pick through the option's checked state. */}
        <span className="ch-ms-poll__count ch-num">
          {!tally
            ? polls?.error
              ? polls.error
              : "Loading votes…"
            : eligible
              ? tally.voterCount >= eligible
                ? "Everyone voted"
                : `${tally.voterCount} of ${eligible} voted`
              : tally.voterCount === 1
                ? "1 vote"
                : `${tally.voterCount} voted`}
        </span>
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
        {mine && !closed && tally && (
          <button type="button" className="ch-ms-poll__link" onClick={() => setClosing(true)}>
            Close poll
          </button>
        )}
      </div>
      <PollVotesModal api={api} conv={conv} poll={poll} tally={tally} open={votesOpen} onClose={() => setVotesOpen(false)} />
      <ClosePollModal api={api} messageId={messageId} open={closing} onClose={() => setClosing(false)} />
    </div>
  );
}

/** Who picked what, and who hasn't answered yet. Votes are visible to everyone in the thread, so this hides nothing. */
function PollVotesModal({
  api,
  conv,
  poll,
  tally,
  open,
  onClose,
}: {
  api: ChMessagesApi;
  conv: ChConv | null;
  poll: Poll;
  tally: PollTally | null;
  open: boolean;
  onClose: () => void;
}) {
  const nameOf = (id: string) =>
    id === api.viewer.userId ? "You" : (api.directory.find((p) => p.userId === id)?.name ?? "Member");
  const waiting = tally && conv ? pollWaiting(tally, [api.viewer.userId, ...conv.memberIds]) : [];
  return (
    <Modal open={open} onClose={onClose} icon={ListChecks} title="Votes" description={poll.question} width={440}>
      <div className="ch-ms-pollv">
        {poll.options.map((o) => {
          const ids = tally?.voters[o.id] ?? [];
          return (
            <section key={o.id} className="ch-ms-pollv__opt" aria-label={o.label}>
              <h3 className="ch-ms-pollv__h">
                <span>{o.label}</span>
                <span className="ch-num">{ids.length}</span>
              </h3>
              {ids.length ? (
                <ul className="ch-ms-pollv__who">
                  {ids.map((id) => (
                    <li key={id}>
                      <Avatar name={nameOf(id) === "You" ? api.viewer.name : nameOf(id)} size={24} />
                      <span>{nameOf(id)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ch-ms-pollv__none">No votes yet</p>
              )}
            </section>
          );
        })}
        {waiting.length > 0 && (
          <section className="ch-ms-pollv__opt is-waiting" aria-label="Hasn’t voted">
            <h3 className="ch-ms-pollv__h">
              <span>Hasn’t voted</span>
              <span className="ch-num">{waiting.length}</span>
            </h3>
            <p className="ch-ms-pollv__names">{waiting.map((id) => firstName(nameOf(id))).join(", ")}</p>
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

type Ends = "none" | "1h" | "1d" | "3d";
const ENDS: ReadonlyArray<{ value: Ends; label: string }> = [
  { value: "none", label: "No end" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
];
const ENDS_MS: Record<Ends, number> = { none: 0, "1h": 3_600_000, "1d": 86_400_000, "3d": 3 * 86_400_000 };

const PROBLEM: Record<string, string> = {
  question: "Add a question.",
  options: `Add ${POLL_MIN_OPTIONS} to ${POLL_MAX_OPTIONS} choices.`,
  duplicate: "Two choices say the same thing.",
  closes: "Pick an end time that hasn’t passed.",
  closes_far: "Pick an end time within 30 days.",
};

/** The composer's poll button: group threads only, where "9 of 12 voted" means something. */
export function PollButton({ api, conv, disabled }: { api: ChMessagesApi; conv: ChConv; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!api.polls || !conv.group) return null;
  return (
    <>
      <IconButton icon={ListChecks} label="New poll" size="sm" disabled={disabled} onClick={() => setOpen(true)} />
      <PollSheet api={api} conv={conv} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Write a poll: a question, two to six choices (a spare row appears as the last one fills, as Reminders adds a row),
 * more than one answer or not, and an optional end. Send writes it into the thread; nothing is saved before that.
 */
export function PollSheet({ api, conv, open, onClose }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [ends, setEnds] = useState<Ends>("none");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const clientId = useRef<string>(crypto.randomUUID());
  const filled = options.filter((o) => o.trim()).length;

  // The end time is worked out when Send is pressed, so a sheet left open for a while can't send a poll that has
  // already ended.
  const draftAt = (now: number): PollDraft => ({
    question,
    options,
    multi,
    closesAt: ends === "none" ? null : new Date(now + ENDS_MS[ends]).toISOString(),
  });
  // The draft as last sent. When a failed send is retried after an edit, it gets a new client id, so the server can't
  // answer the edited poll with the earlier one.
  const lastTry = useRef<string | null>(null);
  const ready = !!question.trim() && filled >= POLL_MIN_OPTIONS;

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
    setEnds("none");
    setProblem(null);
    clientId.current = crypto.randomUUID();
    lastTry.current = null;
  };

  const setOption = (i: number, text: string) => {
    setOptions((prev) => {
      const next = prev.slice();
      next[i] = text;
      // A spare row once every row has text, up to six; trailing empty rows past two fold away.
      if (next.every((o) => o.trim()) && next.length < POLL_MAX_OPTIONS) next.push("");
      while (next.length > POLL_MIN_OPTIONS && !next[next.length - 1]!.trim() && !next[next.length - 2]!.trim()) next.pop();
      return next;
    });
    setProblem(null);
  };

  const send = async () => {
    if (!api.polls || busy) return;
    const draft = draftAt(Date.now());
    const built = buildPollPayload(draft);
    if (!built.ok) {
      setProblem(PROBLEM[built.problem] ?? null);
      haptic("error");
      return;
    }
    const signature = JSON.stringify([question, options, multi, ends]);
    if (lastTry.current !== null && lastTry.current !== signature) clientId.current = crypto.randomUUID();
    lastTry.current = signature;
    setBusy(true);
    const result = await api.polls.send(conv.id, draft, clientId.current);
    setBusy(false);
    if (result.ok) {
      haptic("success");
      reset();
      onClose();
    } else {
      setProblem(result.error);
      haptic("error");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ListChecks}
      title="New poll"
      description={`Everyone in ${conv.title} can vote and see the votes.`}
      initialFocus="#ch-ms-poll-q"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} disabled={!ready} onClick={() => void send()}>
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
            placeholder="Which van are you riding in?"
            autoComplete="off"
            enterKeyHint="next"
            onChange={(e) => {
              setQuestion(e.target.value);
              setProblem(null);
            }}
          />
        </div>
        <fieldset className="ch-ms-pollf__set">
          <legend className="ch-field__label">Choices</legend>
          <ol ref={list} className="ch-ms-pollf__opts">
            {options.map((o, i) => (
              <li key={i} className="ch-ms-pollf__opt">
                <span className="ch-ms-pollf__n ch-num" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  className="ch-input"
                  aria-label={`Choice ${i + 1}`}
                  value={o}
                  maxLength={POLL_OPTION_MAX}
                  placeholder={i < POLL_MIN_OPTIONS ? `Choice ${i + 1}` : "Add a choice"}
                  autoComplete="off"
                  enterKeyHint={i === options.length - 1 ? "done" : "next"}
                  onChange={(e) => setOption(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    list.current?.querySelectorAll<HTMLInputElement>("input")[i + 1]?.focus();
                  }}
                />
                {options.length > POLL_MIN_OPTIONS && o.trim() && (
                  <IconButton
                    icon={Minus}
                    label={`Remove choice ${i + 1}`}
                    size="sm"
                    onClick={() => setOptions((prev) => {
                      const next = prev.filter((_, j) => j !== i);
                      if (next.every((x) => x.trim()) && next.length < POLL_MAX_OPTIONS) next.push("");
                      return next;
                    })}
                  />
                )}
              </li>
            ))}
          </ol>
          {options.length >= POLL_MAX_OPTIONS && options.every((o) => o.trim()) ? (
            <p className="ch-field__help">Six choices is the most a poll takes.</p>
          ) : (
            <p className="ch-field__help">
              <Icon icon={Plus} size={12} /> A new row appears as you fill the last one.
            </p>
          )}
        </fieldset>
        <Switch checked={multi} onChange={setMulti} label="Allow more than one answer" />
        <div className="ch-field">
          <span className="ch-field__label" id="ch-ms-poll-ends">
            Voting ends
          </span>
          <Segmented<Ends> label="Voting ends" value={ends} options={ENDS} onChange={setEnds} block size="sm" />
        </div>
        {problem && (
          <p className="ch-field__help is-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
