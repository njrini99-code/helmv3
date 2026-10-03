---
version: alpha
omitted:
  - section: colors
    reason: Existing scoped runtime tokens own colors; this index does not duplicate them.
  - section: typography
    reason: Existing font loaders and runtime type tokens own the values.
  - section: spacing
    reason: The maintained page handoffs and runtime primitives own geometry.
  - section: rounded
    reason: Existing runtime radius tokens remain canonical.
  - section: components
    reason: Existing shared components and page contracts own their variants.
---

# Helm design context

## Overview

This index preserves the existing product identity. Clubhouse serves college
golf coaches managing their team and players following their schedule and game.
Its reference is the owner's course-inspired Clubhouse design handoff and
mobile boards in `design/handoff/`, with the current Safari feedback recorded
in `docs/clubhouse/CHANGELOG.md`. The golf-hole arrival is the signature moment;
daily screens prioritize readable facts and actions.

## Colors

Runtime tokens remain canonical (Model B). Clubhouse's scoped palette,
semantic ink, status colors and phone overrides live in
`src/clubhouse/styles/tokens.css`. Green identifies the frame and safe primary
actions; warm ivory separates page, sheet and well. Scoring colors retain their
domain meanings. Other Helm surfaces retain `src/styles/design-tokens.css` and
their existing shared components. This index does not merge those systems.

## Typography

`src/clubhouse/lib/fonts.ts` loads Instrument Sans for display, body and data,
with JetBrains Mono for keyboard hints. Type roles and readable phone floors
come from the scoped runtime tokens. Long names and explanatory text wrap;
shrinking text or hiding important status is not a substitute for space.

## Layout

The maintained page handoffs under `docs/clubhouse/pages/` own hierarchy.
Clubhouse changes to its phone shell at 820px. Its page, sheet and pushed-screen
scroll owners preserve safe areas and keyboard access. See the shell handoff
and the ownership map in `docs/clubhouse/UI_OWNERSHIP.md`.

## Elevation & Depth

`design/handoff/depth.css` is the visual reference. Runtime sheet, well, raised
control and bubble tokens implement lit faces, contact shadows and restrained
ambient depth. The owner’s October 2 revision removes decorative green rails
and outline rings from cards and quoted replies. Raised cards use soft contact
and ambient shadows, with lit faces, so their depth remains visible at rest.
Focus outlines and meaningful chart markings remain. Static cards remain readable immediately; motion does not hide
them. Routine page changes crossfade together, while the auth course has its
own documented choreography and reduced-motion path.

## Shapes

Shared controls, cards and sheets consume the Clubhouse radius tokens and
primitives. Page variants preserve that family and expand to fit real content.

## Components

The existing page CONTRACT files own behavior. The UI ownership map points to
the runtime owners and their verification rather than copying their contracts.
Token changes follow `tokens.css` → shared primitives/styles → page consumers;
auth timing follows `auth-tokens.css` → course/welcome. Browser theme color reads
the active runtime tokens. This document does not generate CSS.

## Do's and Don'ts

- Match the supplied designs and preserve their golf identity and depth.
- Keep pending, confirmed, empty, unavailable and failed data distinct.
- Preserve known values on failure and provide the existing recovery path.
- Use the shared controls, notices, dialogs and motion utilities.
- Keep physical-device and human-usability claims within observed evidence.
- Do not add fictitious weather, season weeks, identities or generic metrics.
