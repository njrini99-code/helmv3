# 2026-11-12 — sign in, welcome and hand-off transitions

## 2026-11-12 — Transforms only, and the welcome card arrives whole

```text
Design package: none (owner, 12 Nov 2026: "landing > sign in glitchy", "after Sign in very clunky", "what you missed is
                sloppy during the animation", "transitions are clunky, not smooth")
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- **Desk, right after Sign in.** The window on the course was a clip-path on the photo, opened over 1000ms, while the
  panel faded out in 420ms: the frame's green showed as a slab where the form had been, and the welcome route mounted
  before the clip had opened, so the rest snapped. Now the course is drawn full frame and a seam (`.ch-au-seam`, the
  frame's green with the window's two rounded corners) covers everything right of the window. Opening, the panel and the
  seam slide right by the panel's width and gutter while the course slides to full frame, over 720ms (`--ch-au-t-open`,
  = `OPENING_MS`); the panel stays opaque and its words fade. The resting frame is unchanged (WebKit pixel diff at
  1100, 1440 and 1920, day, night, dark and the reset gate: 0 to 4 pixels, all anti-aliasing at the corners).
- **Desk hand-off.** The fold was a clip-path on the photo over 880ms; it is now the sidebar's green (`.ch-au-fold`)
  sliding in over the course to the canvas's edge, which draws the same (the green only runs top to bottom).
- **Welcome card.** Its rows started 0.3s after the card, 0.14s apart, each fading on its own: the card stood empty with
  its header and Continue, then the rows popped in (on a phone, a tall blank card). The rows now ride the card's fade and
  settle 6px, 50ms apart; the card is opaque in 0.4s (its rise still 0.9s). Leaving, every piece is gone in 0.24s.
- **Landing to sign in.** The painted course is fetched while the landing page is idle (`SignInScenePreload`, only with
  the front door on), and the sign in then renders it directly (`scene-preload.ts`), in its first frame and with no
  fade-in, so it no longer opens on the daytime still and turns to the hour's sky a beat later (filmed at dusk: grey for
  300ms, then gold; after: the painted course in the first frame). Through next/dynamic the course went through a
  Suspense fallback even with its chunk loaded. A hard load is unchanged (no preload; SkyScript's wash, then the fade-in).
  A sky tint on the still was tried and dropped: as a colour blend it browned the trees at morning and golden hour. Sign in reads
  hydration from the shared store (`useHydrated`), so a client navigation draws it enabled; the server HTML still holds it
  disabled (#1245).

### Why

All four were filmed in WebKit (video plus a per-frame trace) before the change. A clip-path transition repaints the
whole painted course on the main thread every frame in WebKit, so it stalls while the next route loads; transforms keep
moving. Guarded by `screens/auth/__tests__/auth-transform-only.test.tsx` and `auth-logic.test.ts`.
