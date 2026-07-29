# Helm Sports Labs — App Store submission package (v2.0, build 8)

Everything you need to fill in App Store Connect and submit. The native build is
ready (version bumped, icon, splash, privacy strings, encryption flag, push
entitlement). What requires *you* is: archive + upload, paste this metadata,
upload screenshots, answer the privacy questionnaire, attach the demo login,
and hit Submit.

> **This is a big one.** The store last saw this app at v1.7 (PR #298).
> **942 commits** have landed since. The entire dashboard was rebuilt on the
> Fairway design system, CoachHelm was rewritten, navigation was consolidated,
> and dark mode shipped. Reviewers will effectively be looking at a new app —
> which is why this is 2.0 and not 1.8.

---

## 0. READ FIRST — what changed in this submission beyond the app itself

| | |
|---|---|
| **Version** | `1.7 (7)` → **`2.0 (8)`**, Debug + Release, in `project.pbxproj` |
| **Guideline 3.1.1 fix** | `DemoPricingNudge` is now hard-gated off native — see §11 |
| **Scope** | **Golf only.** BaseballHelm is live on the web but is deliberately NOT part of this submission — see §12 |

---

## 1. App information

| Field | Value |
|---|---|
| **Name** (max 30) | `Helm Sports Labs` |
| **Subtitle** (max 30) | `Team golf, run by the data` (26) |
| **Bundle ID** | `com.helmsportslabs.golfhelm` |
| **SKU** | `helmsportslabs-golf` |
| **Primary category** | Sports |
| **Secondary category** | Education |
| **Primary language** | English (U.S.) |
| **Price** | Free (no in-app purchases — the native app intentionally hides membership/marketing/pricing surfaces per Guideline 3.1.1) |

Subtitle alternatives (≤30 chars): `College golf team HQ` (20) · `Strokes gained, simplified` (26)

---

## 2. Privacy Policy / Support / Marketing URLs (all live)

- **Privacy Policy URL:** `https://www.helmsportslabs.com/privacy`
- **Support URL:** `https://www.helmsportslabs.com/support`
- **Marketing URL:** `https://www.helmsportslabs.com`

---

## 3. Promotional text (max 170 chars — editable without a new build)

> Rebuilt from the ground up: a faster, calmer interface, full dark mode, and a
> smarter CoachHelm that tells you what changed and what to do about it.

(159 chars.)

---

## 4. Description

> **Helm Sports Labs is the command center for college golf programs — every round, every stat, every player, in one place.**
>
> Built with coaches, for coaches and their players. Track rounds shot-by-shot and turn them into the numbers that actually move scores: strokes gained off the tee, approach, around the green, and putting — benchmarked against PGA Tour and LPGA Tour standards. See exactly where strokes leak with putting make-percentage and approach-proximity leak maps, and a true approach-putting metric: the average distance left to the hole after every putt.
>
> **For coaches**
> • Roster, lineups, and player profiles
> • Team calendar, travel itineraries, tasks, documents, and messaging
> • Qualifiers and lineup competitions
> • CoachHelm — a coaching intelligence layer that surfaces each player's biggest strengths and leaks, explains the cause behind them, and recommends focus areas
> • A triage workspace that puts the day's signals in priority order
> • Recruiting HQ — track prospects from first look to letter of intent, with per-recruit notes, schedules, and documents
> • Run a men's and a women's program from one login and switch between them instantly
>
> **For players**
> • Log rounds and shots fast
> • Your own strokes-gained dashboard, trends, and round reviews with shot-by-shot visuals
> • Development plans, focus areas, and qualifier standings
> • Choose yards or meters
>
> **Designed for the way coaches actually work** — a calm, dense interface, full light and dark modes, and haptic feedback throughout.
>
> Helm Sports Labs is a team product — you'll need an account from your program to sign in.

---

## 5. Keywords (max 100 chars, comma-separated, no spaces after commas)

```
golf,college golf,strokes gained,golf stats,team,coach,roster,recruiting,putting,handicap,qualifier
```

*(99 chars. Don't repeat the app name — it's already indexed.)*

---

## 6. What's New in This Version (v2.0)

```
A complete rebuild of the app you already use.

• An entirely new interface — calmer, denser, and faster on every screen.
• Full dark mode, with Light / Dark / System control in Settings.
• CoachHelm rebuilt: a grounded command center that tells you what changed,
  why it changed, and what to do next.
• A coach triage workspace that puts each day's signals in priority order.
• Round review rebuilt with shot-by-shot visuals.
• Navigation consolidated to 8 coach hubs and 8 player tabs — far less hunting.
• Stats reorganized into a single cockpit with team and player views.
• Development plans and focus areas redesigned, with progress tracked over the
  goal window rather than your all-time average.
• Premium password reset and branded account emails.
• Haptic feedback throughout, tuned per interaction.
• Hundreds of fixes to performance, accessibility, and reliability.
```

---

## 7. App Privacy (nutrition labels)

**Does this app collect data?** Yes.
**Does this app use data to track you?** **No** — no ad networks, no cross-app
tracking SDKs, and the app does not request App Tracking Transparency.

Declare these data types (all **linked to identity** unless noted, all **not
used for tracking**):

| Data type | Specifics | Purpose |
|---|---|---|
| **Contact Info** | Name, Email address | App Functionality (account/auth) |
| **User Content** | Photos (profile/message/document uploads), other content (messages, documents, recruit notes, round notes) | App Functionality |
| **Identifiers** | User ID | App Functionality |
| **Other Data** | Golf round & performance data (scores, shots, stats) | App Functionality |
| **Diagnostics** | Crash data, performance data *(Sentry)* | App Functionality, Analytics — **Not linked to identity** |
| **Usage Data** | Product interaction *(Vercel Analytics, PostHog)* | Analytics — **Not linked to identity** |

Notes:
- No **Location** data — the app requests no GPS permission.
- No **Financial Info** — there are no in-app payments.
- Sentry Session Replay runs with `maskAllText` on. We declare Diagnostics as
  **not linked**; if you'd rather be conservative, marking it linked is also
  defensible and will not fail review.

---

## 8. App Review information (CRITICAL — the app requires login)

**Sign-in required:** Yes.

- **Email:** `demo@golfhelmdemo.com`
- **Password:** `Demo2026`

> ⚠️ **Verify this login works before you submit.** It is the single most common
> cause of an automatic rejection. Sign out on a real device, sign in with the
> credentials above, and confirm you land on a populated dashboard.

**Review notes (paste this):**

> Helm Sports Labs is a SaaS product for college golf programs; all features are
> behind a team login. Please sign in with the demo coach account above — it is a
> fully populated demo team (roster, rounds, stats, calendar, recruiting).
>
> Notes:
> • This is a team/B2B product. There are no consumer sign-ups and no purchases
>   of any kind inside the app; accounts are provisioned by each program. Per
>   Guideline 3.1.1 the iOS app does not display membership, pricing, or
>   marketing surfaces.
> • Camera/Photo access is used only when a user chooses to attach a photo to a
>   message, their profile, or a document.
> • Notifications are used for team announcements, calendar changes, and
>   messages. They are optional and requested only after an in-app explanation.
> • To see the core value: after login, open **Stats** for a player
>   (strokes-gained dashboard), **Roster**, **Calendar**, and **Recruiting HQ**.

**Contact:** Nick Rini — njrini99@gmail.com — **add a phone number** (App Review
will use it if they need to reach you, and a missing number slows escalation).

---

## 9. Age rating

**4+.** Answer every category **None / No** (no violence, no mature/suggestive
content, no gambling, no unrestricted web access — the web view is scoped to
helmsportslabs.com). No Kids Category.

---

## 10. Screenshots

Apple needs **iPhone 6.7" (1290 × 2796)** at minimum — one set covers 6.7"/6.9".

> **These must be recaptured.** Any existing screenshots predate the Fairway
> rebuild and no longer resemble the app. Shipping stale screenshots is both a
> metadata-rejection risk and the single biggest conversion lever on the page.

Capture on the iOS Simulator (iPhone 16 Pro Max) for a real status bar and crisp
text. Recommended 5, in order — the first two are the thumbnail:

1. **Player Stats** — the strokes-gained dashboard (the "wow")
2. **Coach Dashboard / Triage**
3. **CoachHelm insight** (rebuilt in this version)
4. **Round review** with shot visuals
5. **Roster or Calendar**

Consider capturing 2–3 in **dark mode** — it's the headline feature of 2.0 and
it differentiates the listing.

---

## 11. Guideline 3.1.1 — what was fixed in this build

This app was **rejected once before** on 3.1.1 (`7933eb8be`, "strip membership
refs from iOS surfaces"). This build closes a live re-offense:

**`DemoPricingNudge`** (`src/components/golf/demo/DemoPricingNudge.tsx`) showed a
toast reading *"Interested in pricing? — Grab a quick 15-minute call for your
program"* with a **"Schedule a call"** action opening an external booking page.

Why it mattered:
- It fires **only for the shared demo coach account** — the exact account App
  Review signs in with.
- It arms on the **golf dashboard**, the screen the native app cold-starts onto.
- It triggers after **30 seconds or 8 taps**, both of which a reviewer exceeds.
- `proxy.ts` blocks marketing *routes* by user agent, but this is a toast mounted
  inside an allowed app route — so that guard never covered it.

It is now hard-gated behind `isNativeApp()`. Web demo behaviour is unchanged.

The rest of the surface was audited: the remaining external links in native-
reachable routes are functional (calendar sync, drill video, document preview,
import wizards), not purchasing mechanisms. The admin CRM is super-admin gated
and unreachable by a reviewer.

---

## 12. Scope note — BaseballHelm is NOT in this submission

BaseballHelm is live on the web, but this build ships **golf only**, by decision.

The native shell is hardcoded to golf in four places — `capacitor.config.ts`
(`server.url` → `/golf/dashboard`), `proxy.ts` (native marketing bounce →
`/golf/login`), `src/app/page.tsx`, and `NativeRedirect`. A baseball user who
downloaded this build would authenticate successfully and then land in the golf
dashboard with no route out.

**Do not add baseball to the metadata for this submission.** Describing a sport
the app cannot actually reach is itself a rejection risk (Guideline 2.3.1,
accurate metadata).

When baseball does ship natively, it needs: a sport-aware entry route, a
resolver keyed on golf/baseball team membership, a chooser for dual-sport
accounts, and updated metadata. Tracked separately.

---

## 13. What's already done (no action needed)

- ✅ **Version** → Marketing `2.0`, Build `8` (Debug + Release).
- ✅ **App icon** — brand cream (#EDE0C8) + green mark, fully opaque (no alpha).
- ✅ **Splash + launch screen** — on-brand cream; auto-hide wired in `CapacitorProvider`.
- ✅ **Status bar** — dark content for the light background.
- ✅ **Privacy usage strings** — descriptive Camera + Photo Library strings in `Info.plist`.
- ✅ **Encryption** — `ITSAppUsesNonExemptEncryption = false` (skips the per-build export prompt).
- ✅ **Push** — `aps-environment: production` entitlement present; permission is
  requested only behind an in-app soft-ask, never cold.
- ✅ **Universal Links** — `applinks:helmsportslabs.com` + AASA served, covering `/golf/*` and `/baseball/*`.
- ✅ **Category** — `public.app-category.sports`.
- ✅ **Sign in with Apple** — not required (email/password only, no third-party social login).
- ✅ **Guideline 3.1.1** — pricing nudge gated off native (§11).

---

## 14. Your steps

1. `npx cap sync ios`, then **Archive** (Xcode → Product → Archive, or Xcode
   Cloud) and **upload** build `2.0 (8)`.
2. App Store Connect → **+ Version 2.0** → paste §1, §3, §4, §5, §6; set URLs (§2).
3. **Recapture and upload screenshots** (§10) — do not reuse the 1.7 set.
4. **App Privacy** → §7. **Age rating** → §9.
5. **App Review Information** → demo login + notes (§8). **Verify the login first.**
6. Select the build (wait for "processing" to finish), set pricing **Free**, then
   **Add for Review → Submit**.

> Gotchas: the build must finish processing before it's selectable. If you ever
> add Google/social login, you'll then need Sign in with Apple (Guideline 4.8) —
> not now.
