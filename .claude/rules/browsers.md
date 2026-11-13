---
paths:
  - "e2e/**"
  - "playwright*.config.ts"
  - "scripts/clubhouse/**"
  - "scripts/phone/**"
  - "src/clubhouse/**"
  - "docs/clubhouse/audit/**"
  - ".claude/agents/**"
  - ".claude/skills/helm-tools/**"
  - ".claude/skills/helm-safari-performance/**"
---
# Which browser, for what

Clubhouse is graded as an iPhone Safari product first. No single browser tool
proves that, so every measurement names its tier. A finding or a grade that
doesn't name its tier is not evidence.

## The four tiers

| Tier | What it is | Use it for | It can never prove |
| --- | --- | --- | --- |
| **W: WebKit lab** (default) | Playwright WebKit, `iPhone 17 Pro` preset (402×874 screen, DPR 3, touch), signed in from a minted storage state | Layout, overflow, clipping, tap targets, text sizes, painted contrast, aria snapshots, screenshots, pressing every control, `document.getAnimations()` inventories, reduced motion | Real Safari rendering, safe areas, the collapsing toolbar (`dvh`), momentum scroll, frame rate |
| **S: Real Safari** | Apple's Safari MCP (`safaridriver --mcp`, Safari 27) on the Mac; Simulator Safari through safaridriver (`platformName: ios`) | Checking a W finding in branded Safari. Fonts, `backdrop-filter`, glass. INP and LCP from Safari's own Event Timing and LCP APIs (Safari 26.2+). Simulator: safe areas, toolbar, keyboard, Text Size, Increase Contrast | Frame rate. The Simulator runs on the Mac's CPU and GPU. |
| **D: Real iPhone** | Your iPhone, cabled: Safari Web Inspector Timelines (Frames) plus `scripts/phone/` (Instruments Animation Hitches) | Any claim about smoothness, hitches or dropped frames, plus the hand test | Nothing about other phones. One device is the bar. |
| **C: Chromium** | Playwright Chromium, Chrome DevTools MCP, Lighthouse | What only Chromium measures: CPU-throttled traces, Long Animation Frames, Lighthouse, heap. Desktop at 1440×932. | Anything about iPhone. Label each such number "Chromium". |

## Defaults

- **Phone:** W first, every screen. Escalate to S when W shows something that
  could be a WebKit-build quirk, or when the check is on the "never" list for
  W. Escalate to D only for motion and feel.
- **Desktop:** C at 1440×932 for the sweep, plus one W pass at the same size.
- **CI:** the existing specs keep their engines (`playwright.clubhouse.config.ts`:
  Chromium and WebKit × motion on/off; the gate's phone project is WebKit).
- **Claims:** "smooth", "60 fps", "native feel" and "passed on iPhone" need D
  evidence (`helm-safari-performance`). "Looks right on iPhone" needs W and,
  for anything with blur, safe areas or the keyboard, S.

## Signing in

No password is typed, by an agent or a script. W and C load a storage state
minted for the staging demo account. S and D use the session you signed in by
hand. The Chrome DevTools MCP stays `--isolated`. Use `--autoConnect` (your own
Chrome, after you click Allow) only when you ask for it in that session.

## Video

Playwright's WebKit video is capped at 25 fps (Playwright 1.64 release notes),
too coarse to time a 150 to 300 ms transition. Use it only to spot sequence
bugs, such as two pages showing at once. For timing, use the Simulator
(`xcrun simctl io <udid> recordVideo`) or D.
