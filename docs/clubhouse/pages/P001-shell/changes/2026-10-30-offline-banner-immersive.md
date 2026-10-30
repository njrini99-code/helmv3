# 2026-10-30 — Shell: offline banner on immersive screens

## 2026-10-30 — The offline banner stays off the shot screen; feature skeleton tone (F-0011, F-0060)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0011, F-0060;
                fix plan PR 4)
PR/commit:      claude/audit-fix-04-rounds-live-shot (#2415)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- OfflineBanner.tsx: hidden while an immersive screen is up (the shot screen
  says offline in its own save line).
- shell.css: .ch-skel.ch-skel--feature, the feature hero tone for skeletons.

### Verification

- track-offline.test and review-skeleton-hero.test: red on main, green after.
