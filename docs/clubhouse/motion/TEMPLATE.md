# Motion report: {area}, {YYYY-MM-DD}

Copy to `<YYYY-MM-DD>-<scenario>.md` in this folder. The method is the
`helm-safari-performance` skill. Traces and screenshots stay out of git: name
where they are kept, and put screenshots in the PR description.

## Environment

| | |
| --- | --- |
| Commit | |
| Build | preview / local production / dev (diagnostic only) |
| Device | model, iOS, Safari; or Mac Safari version; or Simulator model + runtime |
| Viewport | |
| Network | |
| Power | charging, Low Power Mode |
| Data | team, account role, size of the data |

## Instruments

| Instrument | State | Used for |
| --- | --- | --- |
| Safari MCP | | |
| Web Inspector Timelines | | |
| Simulator | | |
| Real iPhone + Animation Hitches | | |
| Playwright WebKit | | |

## Scenario

Start state, the exact actions, repetitions, and what should happen.

## Before

The measurements, each labelled with what it is:

- frame durations from Inspector Frames
- hitches from Instruments
- rAF cadence, which is not fps
- timings from the network panel or Sentry

## Findings

| # | Error | Effect | Confidence | Fix |
| --- | --- | --- | --- | --- |

Root cause: the files, components and CSS involved, with the evidence for each.
Keep what was observed apart from what is a hypothesis.

## Fix

The diff that was made, the alternatives considered, and the trade-off.

## After

The same scenario on the same device and the same build type, with the change
in each measurement.

## Verdict

PASS / FAIL / NOT VERIFIED, P0 / P1 / P2. Close with what is still unverified
and the next step.
