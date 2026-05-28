# Token Unification — Body Font + Cream Background (2026-05-28)

**P0 fix.** Resolves three disagreeing sources of truth for the body font and
cream background that produced a "washed-out" page body — the body read
slightly cooler than the cards, so cards looked like they were fighting their
background rather than sitting on it.

## The three sources of truth — before

| File | Body font | Cream value |
|---|---|---|
| `src/styles/tokens.css` | `--font-family: 'DM Sans', system-ui, sans-serif` (broken — DM Sans is only the editorial fallback, not the body font; Tailwind never defines `--font-family`) | `--color-cream: #FFFEFA` (the old cool cream) |
| `tailwind.config.ts` | `fontFamily.sans = ['var(--font-geist-sans)', 'DM Sans', ...]` (correct — Geist via `next/font` in `layout.tsx`) | `cream.100 = #F7F5F2` (the Apr 2026 linen pivot) |
| `src/app/globals.css` | `body { font-family: var(--font-family); }` (broken — `--font-family` resolved to the DM-Sans-first stack from tokens.css, but Tailwind expected `--font-geist-sans`, so some surfaces rendered Geist and others fell back to system-ui) | Body `linear-gradient` started from `#FFFEFA` (the old value, cooler than the cards) |

**Symptom:** card glass tints derive from cream-100 (`rgba(247, 245, 242, *)`
per PR #139's gray-card fix), but the page background started at `#FFFEFA`.
The 8-unit RGB gap between page and card looked like a washed-out halo.

## Canonical values — after

### Body font: Geist Sans wins

`src/app/layout.tsx` loads Geist via `next/font`
(`GeistSans.variable` → CSS variable `--font-geist-sans`).

The canonical alias is **`--font-sans`** (in `src/styles/tokens.css`):

```css
--font-sans: var(--font-geist-sans), 'DM Sans', -apple-system,
             BlinkMacSystemFont, system-ui, sans-serif;
```

`--font-family` is kept as a legacy alias pointing at `--font-sans`, so
any forgotten consumer still resolves to Geist instead of falling back
to system-ui.

Tailwind's `fontFamily.sans` already starts with `var(--font-geist-sans)`,
so `font-sans` utility classes and the CSS-only `var(--font-sans)` token
now resolve to the same first-choice font.

### Cream background: linen `#F7F5F2` wins

`src/styles/tokens.css` now defines `--color-cream: #F7F5F2`, matching
Tailwind's `cream-100` and the card glass tints
(`rgba(247, 245, 242, 0.78)` for `--glass-standard-bg`, etc.).

The body gradient in `src/app/globals.css` now starts from `#F7F5F2`
and warms toward `#ECE5D6` (a cream-200/300 blend) so the "warm room"
vertical progression is preserved without the cool `#FFFEFA` start:

```css
body {
  background: linear-gradient(180deg,
    #F7F5F2 0%,    /* cream-100 (linen) */
    #F4EFE6 33%,   /* warm linen */
    #F1ECE0 66%,   /* deeper linen */
    #ECE5D6 100%); /* warmest */
}
```

The same gradient now powers `.bg-dashboard` and the linen base layer
of `.bg-dashboard-gradient` (which also has helm-green aurora overlays),
so all three "page body" surfaces harmonize.

## Files touched

| File | Change |
|---|---|
| `src/styles/tokens.css` | Added `--font-sans` (canonical), pointed legacy `--font-family` at it, changed `--color-cream` from `#FFFEFA` → `#F7F5F2` |
| `src/app/globals.css` | `body` font-family now `var(--font-sans)`; body + `.bg-dashboard` + `.bg-dashboard-gradient` linear-gradient stops shifted from `#FFFEFA/#FDF9F0/#FAF5EB/#F5F0E6` → `#F7F5F2/#F4EFE6/#F1ECE0/#ECE5D6` |

**Not touched** (out of scope per the audit brief):

- `tailwind.config.ts` — already correct (`fontFamily.sans` already starts
  with `var(--font-geist-sans)`; `cream.100` already `#F7F5F2`)
- Auth page mesh gradients (`.bg-auth-golf`, `.bg-auth-baseball` in
  `globals.css:2362,2387`) — these fade from `#FFFEFA` to a brand-tinted
  green/yellow; intentionally distinct from the dashboard linen system
- Email templates (`src/lib/email/*.ts`, `src/lib/notifications/email.ts`,
  `src/lib/coachhelm/v3/recap/template.ts`) — hard-coded `#FFFEFA` for
  email-client safety (email rendering does not pick up CSS variables)

## Known downstream `#FFFEFA` consumers — flagged for a follow-up pass

About 60 files still hard-code `bg-[#FFFEFA]` or `background: '#FFFEFA'`
inline (mostly loading skeletons, error boundaries, and baseball
dashboard pages that pre-date the Apr 2026 linen pivot). These read
slightly cooler than the new body gradient when rendered against the
unified linen base. Fixing them is mechanical (replace `#FFFEFA` →
`#F7F5F2` or `bg-cream-100`) but was kept out of scope here to keep
this P0 fix surgical for the presentation.

Suggested follow-up PR: "chore(ui): migrate hard-coded `#FFFEFA` to
cream-100 across loading/error states" — touches roughly:

- `src/app/golf/(auth)/**` — login/forgot-password/reset-password error boundaries + welcome page
- `src/app/golf/admin/crm/**` — 5 admin CRM pages
- `src/app/golf/(onboarding)/**` — 2 loading screens
- `src/app/baseball/(dashboard)/**` — ~15 loading/error/page surfaces
- `src/components/baseball/**` — 6 client components
- `src/components/messages/ChatWindow.tsx`
- `src/app/products/page.tsx`, `src/app/about/page.tsx`, `src/app/support/page.tsx`, `src/app/not-found.tsx`
- `src/components/golf/scenes/palette.ts` (cream1 constant)
- `src/components/landing/MobileNav.tsx`

Also flagged: `src/app/golf/(auth)/welcome/page.tsx` and
`src/app/golf/(auth)/login/page.tsx` inline `fontFamily: "DM Sans"`
style overrides. Should be reviewed once the auth pages are next
on the polish list — they intentionally use DM Sans for the
splash-style welcome, so this is a design call, not a bug.

## How to verify in dev

```bash
grep -rn "var(--font-family)" src/   # 0 hits outside comments
grep -n  "color-cream"        src/styles/tokens.css  # #F7F5F2
```

Visual: open `/golf/dashboard`. Page background (linen `#F7F5F2`) and
card glass surfaces (cream-100 tinted) should harmonize — no "cool halo"
gap around the cards. Body text renders in Geist Sans (subpixel optical
sizing visible at large display sizes like H1/large-title).
