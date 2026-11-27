# Clubhouse design lab

The research base for the premium design-engineering programme (QUEUE row
`dsx-01`, Nick, 27 Nov 2026). Read this before redesigning or building a
Clubhouse component family. Minor fixes do not need it.

## What is here

| File | What it holds |
| --- | --- |
| `inventory/A-foundations.md` | Tokens, type, colour, surfaces, spacing, radii, breakpoints, focus; compliance counts |
| `inventory/B-components.md` | Every shared primitive, duplicates, the card census, headers and navigation, overlays, forms, the catalog |
| `inventory/C-motion-mobile.md` | Every motion path, reduced motion, the Capacitor shell, safe areas, keyboard, touch, haptics, device coverage |
| `inventory/D-analytics.md` | Every chart and figure, chart anatomy, dashboards, tables, metric-integrity risks, missing chart types |
| `inventory/E-routes-quality.md` | Route coverage matrix, test and gate inventory, governance gaps, test-layer map |
| `research/R-external-references.md` | External comparison database: open-source implementations read at source, licences, techniques |
| `03-gap-register.md` | Ranked gaps and blind spots with severity, evidence and the test that would catch each |
| `04-foundations-and-pilots.md` | Proposed Phase 4 foundations and the Phase 6 pilot picks for Nick's review |

## Evidence tiers

Every claim in these files carries one of these:

- **V** verified by reading code or counting with a command.
- **I** inferred from code, not observed running.
- **F** observed in a fixture render (`/clubhouse-preview/*`, Chromium, no
  sign-in). Fixture shots are layout evidence only, never shown as the
  product.
- **S / D** real Safari, Simulator or iPhone. None in this pass.

External references carry SOURCE (code read, file URL given), DOCS, VISUAL
or INFERRED. Nothing claims to have read proprietary source.

## Status vocabulary for a component family

discovered, researched, compared, prototyped, approved, implemented,
tested, regressed, deprecated. The register in `03-gap-register.md` holds
each family's current status.

## Locked by the owner (do not propose reversing)

Ivory gradient over the deeper linen page, ivory cards, nothing pure white;
the green top-left corner; one Practice-style toggle; no Larger Text option;
no thick left-border cards; Player Home's look; coach Home matches Player
Home; card system option F (QUEUE `look-09`); red for errors only, under par
is the gain green.
