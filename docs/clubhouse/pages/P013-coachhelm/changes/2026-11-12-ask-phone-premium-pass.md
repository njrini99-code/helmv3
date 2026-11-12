# 2026-11-12 — coachhelm

## 2026-11-12 — Ask on the phone, a premium pass (WebKit, 390, light and dark)

```text
Design package: none (a polish pass on what is built)
PR/commit:      agent/coachhelm-miss-compass
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- History, the phone drawer: a row's title is centred on its 44 line. The panel's 12px padding stayed under the drawer's
  44px line height and set every title 12px low, so "This week" and "Earlier" sat on the row above them and far from their
  own.
- History, the phone drawer: its title ("Chats", now a heading) takes focus as it opens, as a Modal's does. On a tap the
  first key (New chat) took it, and WebKit drew its focus ring and its tooltip, the tip pinned over the search field while
  the drawer slid in.
- The comparison table's header rule runs under every column. Its borders were collapsed, and WebKit drew the half-pixel
  rule only under the sticky first cell ("Player"); they are separate now, with no spacing, so they meet as one line.

### Verification

- `__tests__/coachhelm-ask.test.tsx`: the drawer's title has focus as it opens and New chat does not; the row rule.
- `studio/__tests__/comparison-legend.test.tsx`: the table's borders are separate with no spacing.
- WebKit at 390, light and dark, with the rules laid over :3100: titles centred in their rows (text middle at the row's),
  the header rule full width.
