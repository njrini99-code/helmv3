# 2026-10-25 — Class awareness (P-10): the thread header status and Notify anyway

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: new CH-7270..7273, 7370, 7770, 7870 (Bridge IDs in CONTRACT.md); CH-7271 names the Notified anyway caption
Actions: sendGolfMessage gains an optional fifth argument, { notifyAnyway }; its result shape is unchanged
Data impact: reads golf_team_class_day through the shared cache and golf_conversations.team_id for the open thread; a flagged send writes golf_messages.notify_anyway (the database keeps it only for a coach of the conversation's team) and the fan-out stamps notify_anyway_pushed_at after a push really went out
Held items: migration 20261025070300 (columns and trigger); with class_awareness_v1 off nothing is read, no query names the new columns and the header is unchanged
```

### Changed

- A coach's 1:1 with a player of their own team shows the player's class status under the name ("In class until 11:50 AM"; on desktop the usual subtitle follows after a dot, on the phone the status replaces it). The class name never appears in the header.
- It shows only for a direct thread, with a player on the coach's team, in a conversation that belongs to that same team. A group, another team's conversation, a conversation with no team, one whose team is not known yet and a player viewer all draw exactly what they drew before.
- Notify anyway (the plumbing; the coach's control lives with the hold slice). A send can carry `{ notifyAnyway: true }`: the server action stores it on the message only when the flag is on, the fan-out sends that message's pushes with a bypass instruction so a held player's phone is not skipped, and `push.ts` strips the instruction before the payload is built. After a push a device really accepted (`delivered > 0` on the push result; an opted-out player, one with no device and a push that was only queued do not count) the fan-out stamps `notify_anyway_pushed_at`.
- A message whose stamp is set shows a quiet "Notified anyway" under it. In a 1:1 both sides see it; in a group only a coach does (a teammate reading it would learn who was in class). It never shows on a failed send, and never merely because the coach asked: no confirmed push, no caption. With the job queue on, a push is only queued when sent, so it is not confirmed and the caption does not show (open question, default: leave it unstamped).
- The thread read names the two columns only with the flag on; if the database does not have them yet the read repeats without them, so no message is lost. A realtime update that only stamps the message now re-renders it.
- Server action results keep their old shape; the stored-message detail stays internal.

- Placeholder (CH-7270). A coach in a 1:1 with a player who is in a class or an exam and whose pushes are held sees "Won't interrupt Theo in class" ("in an exam"). It promises only that the message will not interrupt now, not when they read it (Should 14, owner call 12.1 C default); "Class at 1:00 PM" and a player whose pushes are not held leave it unchanged.
- Notify anyway (CH-7370, 7770, 7870). Offered only to a coach, in a conversation of their own team, with a recipient in class whose pushes are held, a plain text send. Phone: a 450 ms hold on Send (the Peek hold time, press tick) opens a one-item menu, "Notify anyway" + "In class until 11:50 AM · skips the class hold" (a group: "3 people here are in class · skips the class hold"); the click the hold ends in never sends (Must 6; Send also gets `-webkit-touch-callout: none; user-select: none`). Desktop: a 24 px chevron beside Send opens "Send and notify anyway" with the shortcut, and Cmd or Ctrl + Shift + Enter sends the same way (a no-op, still a new line, when nothing is offered); the hint under the field gains the chord. VoiceOver gets a visually hidden "More send options" button and a spoken hint. A plain Send keeps its three-argument call; the flagged send carries `{ notifyAnyway: true }` and retry keeps it.
- Group line (CH-7272). A coach in a group sees "4 in class now" ("All 11 in class now") directly above the composer, hidden at 0, no names; it opens the In class now sheet scoped to the group with "4 of 11 in this group · Class names show to coaches only." and a count of players with no status in place of the list.
- Details (CH-7273). A coach's 1:1 Details gains a Class status block: the status with the class, today's blocks in order, and "From Theo's class schedule · pushes held during class" ("not held"); "No class status" alone for an untracked player. The class name shows here and never in the header.
- Shared `Menu` gains optional `open`/`onOpenChange` (controlled), `width`, and an item `caption` and `shortcut`; nothing else uses them yet.
- The placeholder, the menu and the group line promise a hold only when one can happen: the class payload's `holds` is false until 070200 is applied and while the release job's heartbeat is stale (golf_class_holds_live).
- Not here: Notify anyway on a send with attachments (the attachment path has no flag; the menu is hidden while files are attached).

### Verification

- class-thread.test.tsx.
- class-awareness-messages.test.tsx (CH-7270, 7272, 7273, 7370, 7770, 7870), messages.test.tsx (CH-7271), use-golf-messages.notify-anyway.test.tsx, send-message-notify-anyway.test.ts, golf-message-fanout.notify-anyway.test.ts, push-delivered.test.ts.
