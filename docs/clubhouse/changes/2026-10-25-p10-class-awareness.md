# 2026-10-25 — Class awareness (P-10): shared pieces

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: none
Actions: none
Data impact: none by itself; the flag class_awareness_v1 is delivered to the client by the shell
Held items: the migrations
```

### Changed

- `ClassStatusLine` and `ClassStatusRow` (ui/) draw the one status line and the one player row every class surface uses, so the coach views and the player's "Coaches see" preview read the same words for the same payload.
- `styles/class-awareness.css` holds the `.ch-ca-*` pieces several pages share.
- `ClubhouseMarker` carries `classAwareness`, read with `useClassAwareness()`. The flag registry is server-only, so the shell reads `class_awareness_v1` once (ChShellData) and hands it down; false means no RPC, no new column in a query and nothing drawn.

### Why

- One vocabulary and one flag path, so a surface cannot word the same moment two ways or fetch with the flag off.
