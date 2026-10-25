# 2026-10-25 — Class awareness (P-10): the thread header status and Notify anyway

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: none (no new CH code in this slice)
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

### Verification

- class-thread.test.tsx.
- messages.test.tsx (Notified anyway caption), use-golf-messages.notify-anyway.test.tsx, send-message-notify-anyway.test.ts, golf-message-fanout.notify-anyway.test.ts, push-delivered.test.ts.
