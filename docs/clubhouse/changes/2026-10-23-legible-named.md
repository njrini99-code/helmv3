# 2026-10-23 — Legible and named (Clubhouse A+ WP-5)

## 2026-10-23 — Contrast misses (A18)

```text
Design package: none (Clubhouse A+ handoff, section 5, A18)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The header tones' brass eyebrow and figure labels use `--ch-ledger-eyebrow`
  (5.0:1 on the page, was 3.85:1) and drop their extra tracking.
- Every `::placeholder` uses `--ch-text-placeholder` (4.8:1 on a field),
  except the phone's To line, which has no fill and sits on the page, so it
  keeps the tertiary ink.
- A hole not played and a qualifier's empty plate use the tertiary ink, not
  ink-300, and ScoreMark prints the em dash (`NO_DATA`).
- Left alone: the unused `--ch-accent-hover` tokens. The placeholder token
  itself is 4.05:1 on the bare light page; changing its value is 4.32.2's
  (conflict X-2).

### Why

- Small eyebrows, several placeholders and the no-data dashes were below
  4.5:1.

### Verification

- New `contrast-tokens.test.ts`.

## 2026-10-23 — Labelled spans and divs have a role (A19)

```text
Design package: none (Clubhouse A+ handoff, section 5, A19)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Fifteen labelled spans and divs gained a role: `img` for a score mark, a
  count or a mini chart; `group` for a scorecard grid, a pick list or a set of
  attachments; `status` for a loading region.

### Why

- VoiceOver reads an `aria-label` on a plain span or div unreliably, so
  scorecard cells and mini charts were silent or read as raw digits.

### Verification

- New `aria-label-roles.test.tsx`: a source scan finds none without a role,
  and a score mark is an image named for its score.

## 2026-10-23 — The Track's disabled button is readable (A27)

```text
Design package: none (Clubhouse A+ handoff, section 5, A27)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Light: the disabled Next or Save hole is `#66625a` on its fill (4.6:1, was
  2.8:1). The phone's muted ink on green (4.9:1 by its tokens) and dark
  (4.8:1) already pass, and are now pinned.

### Why

- Players on a sunny course could not tell the button was there.

### Verification

- `contrast-tokens.test.ts`. Not done: a device check in sunlight; the 2.5:1
  render the audit measured on the phone does not match the tokens' math, so
  it may come from what sits behind the bar.
