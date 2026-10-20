# GolfHelm · Sign in, sign up and onboarding — implementation handoff

Design reference for the GolfHelm auth surface: sign-in, the post-sign-in welcome, sign-up with team code or access request, role-based onboarding (player, assistant coach, staff invite, head coach), and the animated hand-off into the dashboard. Built on **Fairway — Clubhouse Edition**. Target repo: `njrini99-code/helmv3`, routes under `src/app/golf/(auth)` and `src/app/golf/(onboarding)`.

The HTML files are the spec. They hold exact colours, spacing, type and motion. Screenshots are a quick visual index.

---

## What's in this folder

```
design_handoff_golfhelm_auth/
  README.md                 this file
  Sign in.html              desktop sign-in → welcome → dashboard hand-off (reviewer chip bottom-right)
  Sign in - Mobile.html     10 phones: sign-in, 4 errors, 3 welcomes, 2 empty welcomes
  Sign in - Times of day.html  the scene at 8 hours of the day
  Sign up.html              desktop onboarding, all paths + states (reviewer chip, ?step= deep links)
  Sign up - Mobile.html     20 phones: every step + errors + empty states
  src/                      scene, flows, steps, CSS (see "Source map")
  assets/                   helm-golf-mark.png (cropped), helm-sports-labs-mark.png
  screenshots/desktop/{sign-in,sign-up,states}/
  screenshots/mobile/{sign-in,sign-up}/
```

Open the HTML files from the project root (they load `_ds/`, `gh-core.js`, `depth.css` and the dashboard pages for the hand-off).

---

## Flows

### Sign in (`/golf/login`)
One form for everyone; the server resolves role (unchanged from `golf-sign-in-form.tsx`).
- Desktop: green frame, painted course left, ivory panel right (width `clamp(400px, 40vw, 540px)`).
- Mobile: scene top (392px), ivory sheet from 352px with grouped email/password rows.
- Success → `/golf/welcome?next=…`.

### Welcome (`/golf/welcome`)
- The form leaves, the scene fills the frame, camera pushes toward the pin (scale 1.34, 5.2s), ball flies in, hops and rolls to the cup.
- "Good morning," focuses in, then the name rises (reserved second line, left-anchored, per the existing page contract).
- Glass card: **Since you last signed in** + up to three notifications, then Continue (Return on desktop). Owner rule kept: **no auto-advance**.
- Coach name: `Coach {Last}`; player: first name; anonymous fallback: "Good morning." with no name line.

### Sign up (`/golf/signup`) → onboarding
Full-screen. One question per screen on a stationery-glass pane, with the **member card** filling in beside it.

| Path | Steps |
|---|---|
| Pre-code | intro → code |
| Player (roster code) | intro → code → role → name → grad → account → game → photo → done |
| Assistant (roster code) | intro → code → role → name → account → pending |
| Staff invite code | intro → code → name → account → staffdone |
| Head coach (program code) | intro → code → name → title → account → program → photo → cdone |
| Request access | intro → rwho → rdetails → sent |

Code namespaces follow `lib/golf/signup-gate.ts`: **roster** join code (player or pending assistant, never new-program), **staff** code (role in the signed token, no picker), **program**/global code (new-program path). The team name is shown only for a roster code.

Sample codes in the prototype: `K7PQX4MN` roster · `S4VN8QRT` staff · `HELM2026` program · anything else = no match. Team code minted at the end of the head-coach path: `R4TW9KLM` (display only).

### Hand-off to the dashboard
Sign-in (Continue) and onboarding (finish CTA) both land on the dashboard without a hard page change:
1. **Lift** 0–800ms — content fades, the member card lifts to centre (onboarding) / the welcome text slides left (sign-in).
2. **Fold** 700–1600ms — the scene clips to `inset(0 0 0 240px round 14px)` (the app canvas), fades to ivory, camera pushes to 1.6×.
3. **Load** — the destination loads underneath (iframe in the prototype; in the app this is the route transition with the dashboard already prefetched). Reveal waits for sidebar + canvas + fonts.
4. **Reveal** — dashboard fades in (480ms), sidebar items stagger in (30ms apart), content rises via `GH.reveal`.
5. **Settle** — the card flies into the sidebar identity slot, shrinks and fades as the real name appears.

In helmv3: prefetch the destination on mount of the welcome / final step (`router.prefetch`), keep the green frame + 8px inset canvas identical on both sides so only the content changes.

---

## States

### Sign-in errors (copy is verbatim from `getErrorMessage`)
| Kind | Message | Tone | Haptic |
|---|---|---|---|
| Empty fields | Enter your email and password to sign in. | danger | warning |
| Wrong credentials | Incorrect email or password. Please check your credentials and try again. | danger, both fields invalid | error |
| Email not verified | Please verify your email address before signing in. Check your inbox for the confirmation link. | warning | warning |
| Rate limited | Too many sign-in attempts. Please wait a moment and try again. | warning | warning |
| Network | Unable to reach the server. Please check your internet connection and try again. | danger | error |
| Stale bundle | The app updated in the background. Please try signing in once more. | info | error |

### Welcome empty states
- **All caught up** — "You’re all caught up · Nothing new since your last visit." (last sign-in time still shown)
- **First sign-in** — header becomes "Your first time in"; "Your team’s updates will show up here."
- **Name lookup failed** — greeting stands alone ("Good evening.").

### Onboarding errors
| Where | Trigger | Message |
|---|---|---|
| Code | no match | Slots shake and turn red · "That code didn’t match a team" + notice |
| Code | network | "We couldn’t check your code" + notice with **Try again** |
| Code | rate limit | "Too many attempts" + notice with **Try again** |
| Name | empty | Continue disabled; submit highlights the missing field |
| Account | invalid email / password rules | Inline field error; rules tick as you type (8+ chars, a number, a symbol) |
| Account | email exists | Field error + notice with **Go to sign in** |
| Account | network | Notice under the form |
| Game | state not 2 letters / city without state | "Use the two-letter code, like TX." / "Add the state." |
| Photo | not an image / over 10 MB | "Choose a JPG, PNG or HEIC image." / "That photo is over 10 MB. Try a smaller one." |
| Done | invite join failed | "Your profile is saved" · Enter a team code (card not issued) — mirrors `joinedTeam === false` |
| Request | network | Notice, details kept |

### Onboarding empty states
- **Team with no players** — dashed placeholder avatars · "No players yet. You’ll be the first on the roster."
- **First on the roster** (done) — "You’re the first on the roster, {name}."
- **Name / school not filled** — Continue disabled, placeholders shown.
- **Member card before answers** — every field shows "—", name reads "Your name".

### Field rules
- City: free text, max 40.
- State: **two letters only**, uppercased as typed, non-letters stripped, `maxLength=2`, `pattern="[A-Za-z]{2}"`, `autocomplete="address-level1"`.
- Handicap: −6 (shown as +6) to 36, step 0.1; "I don’t have one yet" stores null (not 0).
- Graduation year: 2027–2032 tiles; labels Senior / Junior / Sophomore / Freshman / Recruit.

---

## Motion

Easing: out `cubic-bezier(.2,.8,.2,1)`, smooth `cubic-bezier(.32,.72,0,1)`. Durations 90 / 150 / 220 / 360ms for UI; the choreographed moments below are the only exceptions.

| Moment | Spec |
|---|---|
| Step change | Question fades up 16px + 6px blur → clear, 720ms smooth. Back reverses direction. |
| Code slot | Key press 260ms; match: slots hop in sequence (40ms apart); wrong: 380ms shake. |
| Member card field | New value flashes brass → ink, 900ms. |
| Card issue | Card enters 40px up + 4° rotate, 1100ms; seal stamps in at 1100ms. |
| Welcome greeting | date 160ms · line 1 focus 640ms · name rise 1050ms · card 2250ms · items 2550ms + 140ms each. |
| Scene | Flag wave 1.9s loop, tree sway 9–13s, clouds 90s, birds 46s. Camera zoom per step `1 + progress × .38`. |
| Press | Every tappable scales to ~0.97 (110ms) and springs back (280ms) via `gh-core.js`. |

**Reduced motion:** all transitions/animations 1ms, SVG animations paused, ball placed on the green, hand-off becomes a fade.

## Haptics
Mapped by action through `GH.haptic(kind)` (native: `UISelectionFeedbackGenerator`, `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator`).

| Kind | Used for |
|---|---|
| selection | Role cards, year tiles, division tiles, handedness, title rows |
| light | Submit tapped (sign in, create account, check again, copy code) |
| medium | Continue on the welcome |
| success | Code matched, account created, photo accepted, onboarding finished, hand-off start |
| warning | Missing/invalid field, rate limit, email not verified |
| error | Wrong code, wrong password, network failure, photo rejected |

---

## Time of day
`skyAt(hour)` in `scene.jsx` interpolates 10 keyframes (night, pre-dawn, sunrise, morning, midday, afternoon, golden hour, dusk, night) with smoothstep. Every colour in the landscape is tinted toward the ambient colour at dusk/night (`mixc(colour, amb, ambA)`), clubhouse windows light from golden hour, stars and a crescent moon come out after dark. The greeting word follows the hour: morning 4:30–12, afternoon 12–17, evening otherwise. The page re-reads the clock every 30s.

## Visual tokens used
- Frame `#0A331F`, canvas `--bg-page` `#F7F5EF`, feature green `#0B3A25`, primary `--green-700`.
- Brass hairlines `rgb(176 149 96 / .24–.5)`, card-stock ivory `#FBF7EC → #EAE1CA`.
- Glass pane: ivory 88–93% over the scene, `blur(22px) saturate(130%)`, 22px radius, double brass inset rule at 12/16px.
- Type: Instrument Sans. Display 600 · wdth 88 · −0.04em. Figures wdth 92, tabular.
- Depth: `depth.css` well / raised / sheet / green-raised.

## Source map (in `src/`)
| File | What it is |
|---|---|
| `scene.jsx` | `GolfScene` — seeded SVG course, time-of-day palette, camera, ball flight |
| `login.jsx` / `login.css` | Sign in, welcome, sign-in hand-off (desktop + mobile) |
| `ox.jsx` | Onboarding shell: flow + plans, progress rail, member card, dashboard hand-off |
| `ox-steps.jsx` | Every onboarding step component + validation + error states |
| `ox.css` | Onboarding styles (glass pane, tiles, code slots, card, states) |
| `gh-core.js` | Press feedback, `GH.haptic`, `GH.reveal` load choreography |
| `depth.css` | Shared depth vocabulary |

## Implementation notes
- Keep auth behaviour exactly as in `golf-sign-in-form.tsx`, `signup-gate.ts` and the onboarding actions. These designs only change presentation.
- The prototype's `sim` flags stand in for server responses; map them to the real `result.error` / gate results.
- The member card is presentation only; nothing on it is authoritative.
- Replace the demo team ("Varsity Golf", Maya Reyes, roster faces) with the resolved team from the gate and the team query.
- Scene chart colours are fixed hex tuned for the painted palette; dark mode for the scene is its own night keyframes.
- "Plays right/left-handed" and GPA are optional fields not in the current schema. Drop them if you don't want to collect them.
