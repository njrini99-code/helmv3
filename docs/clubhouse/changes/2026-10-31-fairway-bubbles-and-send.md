# 2026-10-31 — Messages: Fairway's bubble depth and a clean send

## 2026-10-31 — Bubbles lift like Fairway's; a sent message rises in

```text
Design package: none (owner, 2026-10-31, on the phone: "the motion once you
                send a message... sloppy jittery reloads"; "the bubbles had
                depth and shadow and motion... look at what's in Fairway")
PR/commit:      claude/round-bar-discard
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     not yet watched on a real iPhone
```

### Changed

- tokens.css: --ch-elevation-bubble is Fairway's card (a lit top edge, a
  contact and a soft shadow, --fw-shadow-card); --ch-elevation-bubble-mine is
  raised like Fairway's own bubble (--fw-shadow-raise), tinted green, under a
  faint lit edge. Dark theme takes Fairway's dark values. This reverses the
  2026-10-06 flattening (DEPTH_AUDIT.md) on the owner's word.
- ListPresence `arrive="rise"`, used by both threads (MessagesView,
  MessagesPhone): a message that arrives takes its height at once and rises
  8px while it fades in on the base beat, as Fairway's thread does. It used
  to open its height from 0 under overflow clip, which pushed every message
  above it up frame by frame while use-thread-anchor re-pinned the end.

### Verification

- wiring-p007-messages (20, the B7 arrival test rewritten for the rise) and
  the Messages, polls, seen-by, drafts and elevation suites (287) pass.
- WebKit (Playwright, 402 px), preview `messages`, a send in Jonah's
  thread, every frame logged: the message above steps once to its final
  place (709 to 646) instead of gliding for about 300 ms; the new bubble
  fades in over 260 ms and lands at 731.
