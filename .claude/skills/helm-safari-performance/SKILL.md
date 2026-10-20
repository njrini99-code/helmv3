---
name: helm-safari-performance
description: "Measure and fix how Helm feels in Safari, WebKit, the iPhone and the Capacitor app: page switches, sheets, keyboard, scroll, Calendar, Messages, Stats, the course renderer, 'choppy', 'janky', 'laggy', 'smooth'. Picks the instrument that can actually answer the question, records evidence that matches what it claims, and writes a before/after report."
---

# helm-safari-performance

Use for any question about smoothness, responsiveness or motion. The rule that
matters most: **claim only what your instrument measures.** Clubhouse motion
tokens, durations and doctrine are in `.claude/rules/clubhouse.md` and
`src/clubhouse/styles/tokens.css`; this skill is about measuring them.

## 1. Inventory first, every session

Write down what this session actually has before measuring anything, as
`AVAILABLE`, `NOT CONNECTED`, `NEEDS OWNER` or `NOT SUPPORTED`. Check, don't
assume: `claude mcp list`, `xcrun devicectl list devices`, `peekaboo
permissions status`, `xcrun simctl list devices booted`.

| Instrument | What it can prove | Notes |
| --- | --- | --- |
| Safari MCP (`safari-native`, Apple's, 17 tools) | DOM state, console, network, computed style, `document.getAnimations()` | Its own automation window, not your signed-in Safari. |
| `safari` / `safari-devtools` MCP | The same in your Safari session, plus network throttle and request mocks | |
| Playwright WebKit MCP and tests | Repeatable functional journeys, layout, screenshots | Playwright's WebKit build. Never Safari frame rate. |
| Peekaboo (`peekaboo` CLI; MCP after a session restart) | Drives Safari's Web Inspector (Timelines, Layers) and other Mac windows | Target the window by id, screenshot before each click. |
| Safari Web Inspector, Timelines → Frames | Frame durations and their JS / layout / paint split, mapped to source | The tool of record for "why is this frame slow". Works on Mac Safari, the Simulator and a cabled iPhone. |
| iOS Simulator (Safari) | iOS Safari layout, keyboard, safe areas, gestures | Timings come from the Mac's CPU and GPU, not the phone's. |
| Real iPhone + `scripts/phone/` | Instruments Animation Hitches: dropped frames on the device | Needs the cable and an unlocked phone. Native evidence; does not name the JS that caused a hitch. |
| rAF probe (below) | Callback cadence | A warning signal, never frames per second. |
| Screen recording + ffmpeg | What a person saw, frame by frame | Visual evidence; capture cadence can hide frames. |

An unsupported Performance API is reported as **not supported**, never as 0.
`performance.memory` and CDP do not exist in Safari; Chromium tools are only
for what Safari cannot do (CPU throttling, CDP traces), and you say so.

## 2. Pick the build

- **Production-like:** a Vercel preview of the commit (the deploy command in
  AGENTS.md *without* `--prod`), or `npm run clubhouse:perf` (production build
  against the local Supabase stack; about 12 minutes and several GB, so not on
  a busy laptop). Never time a dev server.
- **Never deploy production** to test something. Preview only.
- Previews read and write the one production database: navigate, scroll and
  type freely, but send, save or delete only on test-account data.
- The owner signs in on devices and in the Simulator. Do not type passwords.

## 3. The cycle

1. **Reproduce.** Find the route, the start state and the files involved.
   Screenshot it and read the console and network.
2. **Record the environment:** commit, build, device and OS, Safari version,
   viewport, network, Low Power Mode.
3. **Measure, 3 runs or more:** Web Inspector Frames for the cause, and
   Animation Hitches on the phone for the device. Keep cold and warm runs apart.
4. **Classify the cause.**
   - Network or a waterfall: data arrives in stages.
   - JS or React work.
   - Layout or paint: forced layout, blur, large shadows, layer growth.
   - Compositing: many or oversized layers.
   - **Design:** often the real answer. Examples: a crossfade that shows two
     pages at once, a second skeleton after the first, a bar that changes in
     two steps. In the 2026-10 section-switch work, Instruments showed zero
     dropped frames, and the "choppy" feel was all of these.
5. **Fix the smallest thing.** No new animation library, no blanket
   `will-change`, no `setTimeout` choreography without evidence.
6. **Rerun the same scenario** under the same conditions, then on the phone
   when the change touches motion.
7. **Check what breaks easily.** Reduced motion, interrupting a transition,
   back and edge swipe, ten repeats, keyboard and safe areas, light and dark.

## 4. Probes (Safari MCP `evaluate_javascript`)

Animation inventory:

```js
return document.getAnimations({ subtree: true }).map(a => {
  const t = a.effect?.target, c = a.effect?.getComputedTiming?.();
  return { state: a.playState, name: a.animationName ?? a.transitionProperty,
    target: t ? t.tagName.toLowerCase() + '.' + String(t.className).split(' ')[0] : null,
    duration: c?.duration, delay: c?.delay, easing: c?.easing };
});
```

rAF cadence. Start it, act, then call `window.__helmFrameProbe.stop()`:

```js
window.__helmFrameProbe?.cancel?.();
const s = []; let last = null, on = true, h = 0;
const tick = t => { if (!on) return; if (last !== null) s.push(t - last); last = t; h = requestAnimationFrame(tick); };
h = requestAnimationFrame(tick);
window.__helmFrameProbe = {
  cancel() { on = false; cancelAnimationFrame(h); },
  stop() { this.cancel(); const o = s.slice().sort((a, b) => a - b);
    const p = q => o.length ? o[Math.min(o.length - 1, Math.ceil(q * o.length) - 1)] : null;
    return { kind: 'rAF callback interval, NOT display fps', n: s.length,
      p50: p(.5), p95: p(.95), p99: p(.99), max: o.at(-1) ?? null,
      over33: s.filter(x => x > 33.3).length }; } };
return 'started';
```

Supported entry types before you trust an observer:
`PerformanceObserver.supportedEntryTypes`.

## 5. Web Inspector with Peekaboo

- Mac Safari: Develop → Show Web Inspector (Option-Command-I).
- Simulator or a cabled iPhone: Develop → *device* → the page.
- Timelines: record (Shift-Space), do one action, stop. Read Frames: each slow
  frame's duration and its JS, layout and paint split.
- Save the recording (Command-S), and keep the file outside the repo.
- Use `peekaboo see --app Safari --json` to find elements. Use `peekaboo click`
  on an element id, not a coordinate you remember. Take a fresh screenshot
  before each click.

## 6. Report

Write `docs/clubhouse/motion/<YYYY-MM-DD>-<scenario>.md` from
`docs/clubhouse/motion/TEMPLATE.md`. Each finding has an error, effect,
confidence and fix, and the report ends with a verdict: PASS, FAIL or NOT
VERIFIED, at P0, P1 or P2. Traces and screenshots stay out of git. Screenshots
go in the PR description; for a page, file them with `npm run clubhouse:shots`.

Never write "60 fps", "native-smooth" or "passed on iPhone" without the
device-specific evidence for it.

## 7. Priorities

**P0**
- Clubhouse page switches.
- Messages: typing, keyboard, a long thread.
- Calendar: rapid month switches.
- Stats: filter and chart switches.
- Shot tracking: persistence.
- Gesture and scroll ownership.

**P1**
- Course renderer pan, zoom and level of detail.
- CoachHelm streaming.
- Qualifiers leaderboard.
- Sheets.
- Loading and error states.

**P2**
- 50-cycle memory.
- Idle CPU.
- Easing polish.
