# 2026-11-15 — shell

## 2026-11-15 — Quick chat opens as a popover over 260 ms (MOT-09)

```text
Design package: none (production audit 2026-11-15, MOT-09, spec S3.5 and S3.9)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     screenshots owed (before/after of the open at 90 ms and at rest, phone and desk); timing owed on tier D
```

### Changed

- `shell/quick-chat/useQcMotion.ts`: the panel opens from `scale(0.96)` and
  opacity 0 to whole over the base beat (260 ms) on `--ch-ease-ios`
  (`CH_EASE_IOS_CSS`), transform and opacity in one animation, from the key's
  centre. It closes over the quick beat (180 ms) on the same curve, back to 96%
  and clear. The old open grew the panel from half size on the `pour` spring
  (742 ms) and staggered the header, body and composer in (60 + i × 30 ms); both
  are gone, so nothing in the panel moves on its own.
- A dragged sheet closes from where the finger left it; a thrown one carries on
  along its throw at the finger's speed over the same 180 ms instead of
  shrinking to half size (`qcCloseTo`).
- Reduce Motion: opacity only over 180 ms, both ways. Animations off: at once.
- `QuickChatSession.tsx`, `QuickChatThread.tsx`: the `data-qc-rise` stagger
  hooks are removed. The header's ball takes `news` (see the P013 entry on the
  ball's rings).

### Why

- The panel read as a growing blob over about 742 ms, under the 0.94 scale floor
  and against the no-stagger rule. S3.5: "It is a large popover, not a growing
  blob."

### Verification

- `shell/quick-chat/__tests__/qc-motion.test.tsx` (new, jsdom): the open is one
  panel animation from `scale(0.96)`/0 to `none`/1, 260 ms, iOS curve, no delay,
  and no part animates; the close is 180 ms to `scale(0.96)`/0; the throw carry;
  Reduce Motion is opacity only over 180 ms; Animations off runs nothing. Source
  and jsdom only; no browser or device run.
