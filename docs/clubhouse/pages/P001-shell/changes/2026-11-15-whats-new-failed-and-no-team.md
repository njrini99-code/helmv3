# P001 Shell — 2026-11-15

## 2026-11-15 — What’s new says a failed or partial read, and no team (GAP-S-02, GAP-S-36), and one not-found voice (GAP-S-24)

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-02, GAP-S-24, GAP-S-36)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   130490 (CH-13385), 130690 (CH-13285); CH-13231, CH-13330, CH-1306 rows updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `data/whats-new.ts`, `data/whats-new-shape.ts`, `src/app/golf/actions/whats-new.ts`:
  each kind's read (insights, patterns with the roster behind them, focus
  areas) reports its own failure, and someone with no organization or team
  gets `noTeam`. They no longer get an empty week.
- `screens/whats-new/WhatsNew.tsx`:
  - When every kind failed, the page shows "What’s new didn’t load" (CH-13231).
  - When only some kinds failed, a notice above the filter names them: "Some
    updates didn’t load" with Try again (CH-13285). The week that loaded draws
    under it, and the filter shows — for a kind that didn't load.
  - Someone with no team gets the shared no-team state (CH-13385).
  - "Nothing new this week" (CH-13330) is drawn only over a read that fully
    answered.
- `shell/NotFound.tsx` (`ClubhouseNotFound`) takes an optional `thing` and
  `back`. A section names what is missing ("This plan isn’t here") and goes
  back to the section, and every not-found says "It may have been deleted, or
  the link is wrong." Practice's plan, print and drill routes and the Practice
  section now use it through their own `not-found.tsx`.

### Why

- GAP-S-02 (P0): a failed read drew "Nothing new this week", telling a coach
  their team had done nothing.
- GAP-S-36: a coach with no team was told the same.
- GAP-S-24: missing content spoke in several voices and always went Home.

### Verification

- `src/clubhouse/__tests__/whats-new.test.tsx` (CH-13285, CH-13385, CH-13231,
  CH-13330) and `src/clubhouse/shell/__tests__/not-found-thing.test.tsx` (new)
  pass.
- Preview: `/clubhouse-preview/whats-new?state=partial` and `?state=noteam`.
