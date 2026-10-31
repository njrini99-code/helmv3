# 2026-10-30 — Targets, type steps, focus ring, headings and regions

## 2026-10-30 — Shared controls, avatar initials, Surface level and ZoneBlock regions (F-0021, F-0022, F-0044, F-0050, F-0063, F-0064, F-0073)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0021, F-0022,
                F-0044, F-0050, F-0063, F-0064, F-0073; fix plan PR 8)
PR/commit:      claude/audit-fix-08-a11y-touch-type (#2419)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- controls.css (phone): a select is 44 tall like a text field, and the shared
  44pt reach covers .ch-hl-since__b and .ch-hs-ld__why (F-0021).
- ui.css: a fine-pointer twin of the shared reach grows .ch-hw-more,
  .ch-tr__link, .ch-tour-cmp-div and the compare timeline thumb (through
  ::before) to 24 by 24 under a mouse (F-0022). The primary and secondary
  hover rules skip :focus-visible, so hover never removes the focus ring
  (F-0044). .ch-line__t is the 12 role on the phone (F-0050).
- ui/Avatar.tsx and ui.css: initials sit on a step per coin size (xs 11, sm
  12, md 13, lg 14, xl 22) through --ch-av-type; a numeric size takes the
  nearest step; the phone 12 floor stays (F-0073).
- ui/Surface.tsx takes level (2 or 3, default 3) for a Surface that is a
  page’s top-level section (F-0063). ui/Zone.tsx ZoneBlock takes
  region={false} for a block whose title repeats its zone’s, so two regions
  never share a name (F-0064).

### Why

- The audit measured phone targets under 44pt, desktop targets under 24px,
  chart and caption text under 12px, a focus ring lost on hover, skipped
  heading levels and two regions with one name.

### Verification

- New tests red on main, green after: target-size-css, phone-type-floor-css,
  focus-ring-css, ui/__tests__/Surface.test.tsx, avatar-sizes (F-0073 cases).
  look-feel-pass RAW_FONT hub.css lowered 8 to 7.
