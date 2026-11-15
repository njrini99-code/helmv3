# 2026-11-13 — the span switch takes its caller's labels

## 2026-11-13 — `ui/SpanSwitch` names a span the way the caller's figure reads it

```text
Design package: none (audit 2026-11-13, F-0002)
PR/commit:      agent/ch-look-home
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `ui/SpanSwitch.tsx` takes optional `labels` for either span. Without them it
  reads "This season | All time" (`SPAN_LABEL`) as before. Home, its only user,
  passes "Last 10" for the default, so Team scoring's pill names the window its
  figure reads (P002 change, 2026-11-13).

### Why

- F-0002: "This season" sat over each player's last ten rounds, read back a
  year, so the pill and the figure disagreed (75.6 from May to September, where
  Roster's season average was 73.4).

### Verification

- `screens/stats/__tests__/span-switch.test.tsx`: Home's switch and the Team
  scoring card read "Last 10" and "All time", and choosing either still writes
  or clears `?range=all`.
