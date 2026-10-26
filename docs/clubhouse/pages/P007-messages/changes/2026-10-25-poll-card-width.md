# 2026-10-25 — Messages: poll card width on desktop

## 2026-10-25 — A poll no longer collapses to a thin strip in the two-pane thread

```text
Design package: P-2 polls follow-up (found on the first real thread with a poll)
PR/commit:      agent/poll-card-width
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The poll card is an inline-size container, so its content gives its column
  no width, and `width: min(360px, 100%)` resolved against a parent that sized
  to its content. In the desktop thread the line shrank to its buttons and the
  stack to the line, so the card drew about 24px wide with its words one per
  line. The column now carries a width, the line stretches to it and the stack
  takes what the hover buttons leave. The phone rule is unchanged.
- Measured in WebKit on the preview thread: 24px before, 312px at an 1100px
  window and 360px at 1440px and 820px.
- A CSS pin in `messages-polls-css.test.ts` guards the four rules.
