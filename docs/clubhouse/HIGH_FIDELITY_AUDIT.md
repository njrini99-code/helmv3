# Clubhouse high-fidelity audit: status

The owner's "GolfHelm High-Fidelity App Audit" (2026-10-01) is the brief. This
file tracks each of its findings (F01 to F12) and acceptance tests (T01 to
T32) on branch `agent/swap-audit` (PR #2111). Owner decisions are PROGRESS
Q-139 and Q-140.

Status words: **fixed** (changed, with the evidence named), **confirmed**
(the code already does what the audit asks), **open** (not done yet),
**blocked** (needs something this session cannot do: a real iPhone, Xcode, a
native build, Safari on a Mac), **not exercised** (a prescribed test not yet
run). A fix proven only in jsdom says so.

## Build under audit

- Web: `agent/swap-audit`, not merged; production serves `main` (`ef6e017a2`
  at session start), which has none of this.
- Flag: Clubhouse on for the local stack; production flag unchanged.
- Native wrapper: not built or run here (blocked).

## Findings

- **F01 staggered reveal: fixed** (`6217041d3`). Routine navigation shows the
  page when ready; the crossfade is the only entrance. Empty pages fade once.
  Evidence: jsdom (RouteFrame tests); not filmed on a device.
- **F02 universal press: fixed** (`6217041d3`). Only `.ch-btn` and
  `data-ch-press` up to 240px scale; a quick release springs back from where
  the press got to; a second press releases the first. Evidence:
  `motion.test.tsx`. Cancellation by scroll and drag: pointercancel and
  dragstart release (code), not exercised on touch hardware.
- **F03 phone first paint: fixed** (`3b676e724`). With no layout cookie the
  server guesses from Sec-CH-UA-Mobile or the user agent. Evidence:
  `phone-hint.test.ts`. T01 and T02 on a device: not exercised.
- **F04 materials: fixed** (`6217041d3`). Flat cards and wells; glass only on
  the top bar and tab bar (20px) with an opaque fallback; opaque popovers.
  Safari profiling of glass versus opaque: not exercised.
- **F05 native and web colours: partly fixed.** `html` and `body` take
  Clubhouse's colour where Clubhouse is on screen (overscroll, before paint).
  The native launch colour (#F2E6D2) is unchanged: Q-140.
- **F06 keyboard ownership: confirmed in code.** One writer of
  `--keyboard-height` (CapacitorProvider, keyboardWillShow); `resize:
  'ionic'` resizes nothing here; fixed sheets and screens lift themselves and
  the in-flow Ask panel subtracts the height once. Device test: blocked.
- **F07 route scroll reset: fixed earlier** (`e9b833761`). A new destination
  opens at the top; Back and Forward restore the page's place; filters
  survive through `useChSessionState`.
- **F08 reveal guard: removed** with F01; nothing replays on refresh because
  nothing staggers.
- **F09 typography: partly fixed** (`6217041d3`). Phone type tokens 16 / 14,
  tab labels 11.5px. Most page CSS uses literal sizes; moving the most-read
  ones to the tokens is open, page by page.
- **F10 contrast: confirmed** for the solid pairs the audit computed; rendered
  pairs on translucent surfaces: not exercised.
- **F11 tools: in use.** clubhouse:check, Vitest, Playwright specs on the
  local stack (`clubhouse-phone-audit`, `clubhouse-team-switch`,
  `clubhouse-round`).
- **F12 evidence discipline:** this file names the build and what ran.

## Acceptance tests

- T01, T02 cold and stale phone layout: unit-tested; device not exercised.
- T03 rapid navigation: not exercised.
- T04 return restoration: jsdom (`route-frame-scroll`, `session-state`).
- T05 skeleton geometry: not exercised.
- T06, T07 press timing and cancellation: jsdom for T06; T07 not exercised.
- T08, T09 keyboard: blocked (device).
- T10, T11 browser bars, launch seam: blocked (device).
- T12 to T20: not exercised.
- T21 to T23 round safety: local-stack e2e covers save, continue and submit
  (`clubhouse-round`); offline and kill/resume not exercised.
- T24 message retry: unit (bubble keeps the id; Q-135).
- T25 thread anchoring: fixed. Both thread views jumped to the end on any
  new message or typing dots; now they follow only a reader at the end (or
  their own message), and "N new messages" takes a reader who is up down
  (`use-thread-anchor.ts`, `thread-anchor.test.tsx`). Device not exercised.
- T26 to T32: not exercised.

No composite score is given: most runtime evidence is missing.
