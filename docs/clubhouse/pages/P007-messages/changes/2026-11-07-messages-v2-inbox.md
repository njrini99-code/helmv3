# 2026-11-07 — messages

## 2026-11-07 — Messages v2, package A: the inbox and the rail

```text
Design package: design-refresh/messages/redesign
PR/commit:      agent/ch-messages-v2 (4b1d94e682)
Contract IDs:   none new
Actions:        none new
Data impact:    none (pins stay device-only until golf_conversation_pins is applied; search stays client-side)
Held items:     M5 pins promotion, M7 search RPC
```

Phone inbox: no context line, one page edge (16, 20 at 430), Pinned card of 62 px faces with bubblets (groups too) and
typing dots, Recent card, the "Nothing here" card for Unread and Groups, rows with a 44 px face, unread dot and muted bell in
the name line, a two-line preview and a hairline from x = 16. Pinned people are listed in Recent only while a search is asking.
A pinned tile opens the row menu on a long press (Unpin, Mark as unread, Mute, Delete). The team channel counts as one of the
three pins and has no Pin, Unpin or Delete. Typing is dots only, labelled with the typers. Rail: 40 px faces, no separators,
Pinned / Recent labels, two-line preview. Loading: five skeleton rows at the artifact's widths on the route and in both
lists, pulsing 1.4 s. The filter thumb slides 360 ms on the (.34, 1.3, .64, 1) curve. Rows are plain background changes.
All new rules are in `styles/messages-inbox.css`; `messages.css` is untouched, so its replaced inbox rules are now overridden,
not deleted. The pins probe no longer repeats a failing request on every window focus.
