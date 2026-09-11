# Change ledger — roster_team

## 2026-08-27 — standing tier wraps instead of truncating

- SHA: 1a57943e6.
- Change: `FairwayPlayerCard`'s `standing_tier` line drops `truncate` and its
  `title` attribute; it now wraps.
- Why: at 390pt that cell is ~77px of text width while the tier phrases run
  19-25 characters ("Top quartile on your team"), so `truncate` cut inside the
  phrase and left "Top quartile…" — and the `title` tooltip that was the
  fallback does nothing on a touch device (2026-08-26 owner report).

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/roster`, `dashboard/team`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.
