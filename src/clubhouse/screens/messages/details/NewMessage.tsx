'use client';

import type { ChMessagesApi } from '../api/types';
import { useState, useEffect } from 'react';
import { haptic } from '../../../lib/haptics';
import { groupLacksPlayer, firstName } from '../model';
import { Modal } from '../../../ui/Modal';
import { Megaphone, SquarePen, X, Check } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { Segmented } from '../../../ui/Segmented';
import { SearchField } from '../../../ui/SearchField';
import { personOf } from '../person-of';
import { Avatar } from '../../../ui/Avatar';
import { Tooltip } from '../../../ui/Tooltip';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';

/* New message */

export function NewMessage({
  api,
  open,
  onClose,
  initialMode,
}: {
  api: ChMessagesApi;
  open: boolean;
  onClose: () => void;
  /** The redesign's pane hands a group or an announcement over to this dialog. */
  initialMode?: "group" | "announce";
}) {
  const [mode, setMode] = useState<"direct" | "group" | "announce">("direct");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [ack, setAck] = useState(true);
  const [to, setTo] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  // The announcement's own title: its draft (with the message and the two switches) outlives Cancel, Esc and the
  // backdrop until a post lands, as Team Hub's compose does (wave 5 #7). A group's name is the prefill's or empty.
  const [annTitle, setAnnTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const prefill = api.prefill ?? null;
  useEffect(() => {
    if (!open) return;
    // A prefilled message (prefill.ts) opens with its people chosen and, for a group, its name.
    // Players start direct threads only (D-15): theirs keeps the first person.
    const group = !!prefill && prefill.to.length > 1 && api.viewer.role === "coach";
    setMode(initialMode ?? (group ? "group" : "direct"));
    setTo(prefill ? (group ? prefill.to : prefill.to.slice(0, 1)) : []);
    setQ("");
    setTitle(prefill?.title ?? "");
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialMode seeds the sheet when it opens, and only then
  }, [open, prefill, api.viewer.role]);
  const coachGroup = mode === "group" && api.viewer.role === "coach";
  // A coach's group can include other coaches (D-45): they're added right after it's created.
  const people = api.directory.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const toggle = (id: string) => {
    haptic("select");
    setTo(
      mode === "direct"
        ? [id]
        : to.includes(id)
          ? to.filter((x) => x !== id)
          : [...to, id],
    );
  };
  const announce = mode === "announce";
  const needsTitle = coachGroup ? !title.trim() : announce && !annTitle.trim();
  const needsBody = announce && !body.trim();
  // A coach's group is a team broadcast: with no player in it, it would reach the whole team (groupLacksPlayer).
  const needsPlayer = mode === "group" && groupLacksPlayer(api.viewer.role, to, api.directory);
  const canGo = announce
    ? !needsTitle && !needsBody
    : mode === "direct"
      ? to.length === 1
      : to.length >= 1 && !needsTitle && !needsPlayer;
  const go = async () => {
    setTouched(true);
    if (!canGo) {
      haptic("warning");
      return;
    }
    setBusy(true);
    const ok = announce
      ? await api.createAnnouncement({
          title: annTitle.trim(),
          body: body.trim(),
          urgent,
          ack,
        })
      : mode === "direct"
        ? await api.startDirect(to[0]!)
        : await api.createGroup(to, title.trim());
    setBusy(false);
    if (ok && announce) {
      setAnnTitle("");
      setBody("");
      setUrgent(false);
      setAck(true);
    }
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      icon={announce ? Megaphone : SquarePen}
      title={announce ? "New announcement" : "New message"}
      description={
        announce
          ? `Goes to everyone on ${api.teamName ?? "the team"}. Players can acknowledge it.`
          : `Only players and coaches${api.teamName ? ` on ${api.teamName}` : " on your team"} can be messaged.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void go()}>
            {busy
              ? announce
                ? "Posting…"
                : "Starting…"
              : announce
                ? "Post announcement"
                : mode === "group"
                  ? "Create group"
                  : "Start conversation"}
          </Button>
        </>
      }
    >
      <div className="ch-ms-new">
        {api.viewer.role === "coach" && (
          <Segmented<"direct" | "group" | "announce">
            label="Message type"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setTo([]);
              setTouched(false);
            }}
            options={[
              { value: "direct", label: "Direct" },
              { value: "group", label: "Group" },
              { value: "announce", label: "Announcement" },
            ]}
          />
        )}
        {announce ? (
          <>
            <label className="ch-field">
              <span className="ch-field__label">Title</span>
              <input
                className="ch-input"
                placeholder="Bus time moved to 6:00"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                maxLength={200}
                aria-invalid={touched && needsTitle}
              />
              {touched && needsTitle && (
                <span className="ch-field__help is-error" data-ch-code="CH-7102">
                  Give the announcement a title.
                </span>
              )}
            </label>
            <label className="ch-field">
              <span className="ch-field__label">Message</span>
              <textarea
                className="ch-textarea"
                rows={4}
                placeholder="What the team needs to know, and by when"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                aria-invalid={touched && needsBody}
              />
              {touched && needsBody && (
                <span className="ch-field__help is-error" data-ch-code="CH-7103">
                  Write what the team needs to know.
                </span>
              )}
            </label>
            <div className="ch-ms-mute__opts" style={{ gap: 24 }}>
              <label className="ch-switch">
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(e) => (
                    haptic("select"),
                    setUrgent(e.target.checked)
                  )}
                />
                <span className="ch-switch__t" aria-hidden="true" />
                Urgent
              </label>
              <label className="ch-switch">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => (haptic("select"), setAck(e.target.checked))}
                />
                <span className="ch-switch__t" aria-hidden="true" />
                Ask players to acknowledge
              </label>
            </div>
          </>
        ) : (
          <>
            {coachGroup && (
              <label className="ch-field">
                <span className="ch-field__label">Group name</span>
                <input
                  className="ch-input"
                  placeholder="Pinehurst travel"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  aria-invalid={touched && needsTitle}
                />
                {touched && needsTitle && (
                  <span className="ch-field__help is-error" data-ch-code="CH-7104">
                    Name the group so players know what it’s for.
                  </span>
                )}
              </label>
            )}
            {prefill?.draft && (
              <p className="ch-ms-new__draft">
                <span>Your draft, ready in the conversation to edit and send</span>
                <q>{prefill.draft}</q>
              </p>
            )}
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Find a player or coach"
              label="Find people"
            />
            {mode === "group" && to.length > 0 && (
              <div className="ch-ms-to">
                {to.map((id) => {
                  const p = personOf(api, id);
                  return (
                    <span key={id} className="ch-ms-to__c">
                      <Avatar name={p?.name ?? "Member"} id={p?.playerId ?? id} size={20} />
                      {firstName(p?.name ?? "Member")}
                      <Tooltip>
                        <button
                          type="button"
                          aria-label={`Remove ${p?.name ?? "member"}`}
                          onClick={() => toggle(id)}
                        >
                          <Icon icon={X} size={12} />
                        </button>
                      </Tooltip>
                    </span>
                  );
                })}
              </div>
            )}
            {api.directoryError ? (
              <InlineNotice
                code="CH-7205"
                title="Your team list didn’t load"
                body="Try again."
                onRetry={api.retryDirectory}
              />
            ) : (
              <div
                className="ch-ms-pick"
                role="listbox"
                aria-multiselectable={mode === "group"}
                aria-label="People"
              >
                {people.map((p) => {
                  const on = to.includes(p.userId);
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className="ch-pp__row"
                      onClick={() => toggle(p.userId)}
                    >
                      <Avatar name={p.name} id={p.playerId ?? p.userId} size="sm" />
                      <span className="ch-pp__name">
                        <b>{p.name}</b>
                        <span>{p.subtitle}</span>
                      </span>
                      {mode === "group" ? (
                        <span className={"ch-pp__box" + (on ? " is-on" : "")}>
                          {on && <Icon icon={Check} size={12} />}
                        </span>
                      ) : on ? (
                        <Icon icon={Check} size={15} />
                      ) : (
                        <span />
                      )}
                    </button>
                  );
                })}
                {!people.length && (
                  <div className="ch-pp__empty">
                    {q.trim()
                      ? `No one matches “${q.trim()}”.`
                      : "No one to message yet."}
                  </div>
                )}
              </div>
            )}
            {touched && !canGo && !needsTitle && (
              <span className="ch-field__help is-error" data-ch-code="CH-7105">
                {mode === "direct"
                  ? "Choose who to message."
                  : needsPlayer
                    ? "Choose at least one player. Coaches join the group once it exists."
                    : "Choose at least one person."}
              </span>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
