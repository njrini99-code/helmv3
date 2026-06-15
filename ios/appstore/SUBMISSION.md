# Helm Sports Labs — App Store submission package (v1.7, build 7)

Everything you need to fill in App Store Connect and submit tomorrow. The native
build is ready (icon, splash, version, privacy strings, encryption flag all done
— see "What's already done" at the bottom). The only things that require *you*
are: archive + upload the build, paste this metadata, upload screenshots, answer
the privacy questionnaire, attach the demo login, and hit Submit.

---

## 1. App information

| Field | Value |
|---|---|
| **Name** (max 30) | `Helm Sports Labs` *(matches the on-device name; alt: `GolfHelm`)* |
| **Subtitle** (max 30) | `Team golf, run by the data` *(alts below)* |
| **Bundle ID** | `com.helmsportslabs.golfhelm` |
| **SKU** | `helmsportslabs-golf` *(your choice; any unique string)* |
| **Primary category** | Sports |
| **Secondary category** | Education |
| **Primary language** | English (U.S.) |
| **Price** | Free (no in-app purchases — the native app intentionally hides membership/marketing pages per Guideline 3.1.1) |

Subtitle alternatives (pick the one you like, ≤30 chars):
- `Team golf, run by the data` (26)
- `Strokes-gained for college golf` ❌ 31 — too long
- `College golf team HQ` (20)
- `Strokes gained, simplified` (26)

---

## 2. Privacy Policy / Support / Marketing URLs (all live)

- **Privacy Policy URL:** `https://www.helmsportslabs.com/privacy`
- **Support URL:** `https://www.helmsportslabs.com/support`
- **Marketing URL:** `https://www.helmsportslabs.com`

---

## 3. Promotional text (max 170 chars — editable without a new build)

> Now with per-recruit documents, average approach-putting distance, yards/meters, a men's/women's team toggle, and LPGA standards for women's teams.

## 4. Description

> **Helm Sports Labs is the command center for college golf programs — every round, every stat, every player, in one place.**
>
> Built with coaches, for coaches and their players. Track rounds shot-by-shot and turn them into the numbers that actually move scores: strokes gained off the tee, approach, around the green, and putting — benchmarked against PGA Tour and LPGA Tour standards. See exactly where strokes leak with putting make-percentage and approach-proximity leak maps, and a true approach-putting metric: the average distance left to the hole after every putt.
>
> **For coaches**
> • Roster, lineups, and player profiles
> • Team calendar, travel itineraries, tasks, documents, and messaging
> • Qualifiers and lineup competitions
> • CoachHelm AI — surfaces each player's biggest strengths and leaks with cause-and-effect reads and recommended focus areas
> • Recruiting HQ — track prospects from first look to letter of intent, with per-recruit notes, schedules, and documents
> • Run a men's and a women's program from one login and switch between them instantly
>
> **For players**
> • Log rounds and shots fast
> • Your own strokes-gained dashboard, trends, and round reviews
> • Development plans and qualifier standings
> • Choose yards or meters
>
> Helm Sports Labs is a team product — you'll need an account from your program to sign in.

## 5. Keywords (max 100 chars, comma-separated, no spaces)

```
golf,college golf,strokes gained,golf stats,team,coach,roster,recruiting,putting,handicap,qualifier
```
*(99 chars. Don't repeat the app name — it's already indexed.)*

## 6. What's New in This Version (v1.7)

```
• A refreshed app icon and launch experience.
• Recruiting HQ: upload and organize documents (notes, schedules, transcripts, film) per recruit.
• Approach putting now shows the average distance left to the hole after every putt — by distance, too.
• Choose yards or meters for every distance.
• Program heads can toggle between their men's and women's teams.
• Women's teams are now benchmarked against LPGA Tour standards.
• Cloud course library in the new-round flow.
```

---

## 7. App Privacy (the "App Privacy" questionnaire / nutrition labels)

**Does this app collect data?** Yes.
**Does this app use data to track you?** **No** — there are no ad networks or
cross-app tracking SDKs, and the app does not request App Tracking Transparency.

Declare these data types (all **linked to the user's identity** unless noted, all
**Not used for tracking**):

| Data type | Specifics | Purpose |
|---|---|---|
| **Contact Info** | Name, Email address | App Functionality (account/auth) |
| **User Content** | Photos (profile/message/document uploads), other content (messages, documents, recruit notes, round notes) | App Functionality |
| **Identifiers** | User ID | App Functionality |
| **Other Data** | Golf round & performance data (scores, shots, stats) | App Functionality |
| **Diagnostics** | Crash data, performance data *(Sentry / Datadog RUM)* | App Functionality, Analytics — **Not linked to identity** |
| **Usage Data** | Product interaction *(Vercel Analytics)* | Analytics — **Not linked to identity** |

> ⚠️ Verify the **Diagnostics/Usage** linkage against your actual Sentry/Datadog
> config before submitting. Sentry Session Replay is on with `maskAllText`; if you
> consider replays identity-linked, mark Diagnostics "Linked: Yes". When unsure,
> the conservative (and accurate-for-our-setup) answer is **Not linked**.
>
> The app collects **no Location data** (no GPS permission is requested) and **no
> Financial Info** (no in-app payments).

---

## 8. App Review information (CRITICAL — the app requires login)

**Sign-in required:** Yes. Provide the reviewer a working demo account:

- **Email:** `demo@golfhelmdemo.com`
- **Password:** `Demo2026`

**Review notes (paste this):**

> Helm Sports Labs is a SaaS product for college golf programs; all features are
> behind a team login. Please sign in with the demo coach account above — it is a
> fully populated demo team (roster, rounds, stats, calendar, recruiting).
>
> Notes:
> • This is a team/B2B product. There are no consumer sign-ups or purchases inside
>   the app; accounts are provisioned by each program. Per Guideline 3.1.1 the iOS
>   app does not show membership, pricing, or marketing pages.
> • Camera/Photo access is used only when a user chooses to attach a photo to a
>   message, their profile, or a document.
> • To see the core value: after login, open **Stats** for a player (strokes-gained
>   dashboard), **Roster**, **Calendar**, and **Recruiting HQ**.

**Contact:** Nick Rini — njrini99@gmail.com — (add phone for App Review).

---

## 9. Age rating

**4+.** Answer every category in the questionnaire **None / No** (no violence,
no mature/suggestive content, no gambling, no unrestricted web access — the in-app
web view is scoped to helmsportslabs.com). No Kids Category.

---

## 10. Screenshots

Apple needs **iPhone 6.7" (1290 × 2796 px)** at minimum (one set covers 6.7"/6.9").
A starter set rendered from the live app is in `ios/appstore/screenshots/` if the
generator ran (see `scripts/gen-appstore-screenshots.mjs`). For the nicest result,
recapture on the iOS Simulator (iPhone 15/16 Pro Max) — real status bar, crisp text.

Recommended 5 screens, in order (first 2 matter most — they're the thumbnail):
1. **Player Stats** — the strokes-gained dashboard (the "wow")
2. **Coach Dashboard / Roster**
3. **Recruiting HQ** (newest feature)
4. **Calendar / Travel**
5. **Round review or CoachHelm insight**

Optional: add a one-line caption band per screenshot (e.g. "Strokes gained vs PGA
& LPGA", "Run men's + women's from one login").

---

## 11. What's already done (no action needed)

- ✅ **App icon** redesigned — brand cream (#EDE0C8, matches splash + launch) + green mark, **fully opaque (no alpha)** → App-Store compliant. 1024² at `AppIcon-512@2x.png`; marketing copy at `ios/appstore/AppIcon-1024.png`.
- ✅ **Version bumped** → Marketing `1.7`, Build `7` (Debug + Release).
- ✅ **Splash + launch screen** — on-brand cream; splash auto-hide wired (`CapacitorProvider`).
- ✅ **Status bar** — `Style.Light` = dark text for the light/cream background (correct).
- ✅ **Privacy usage strings** — descriptive Camera + Photo Library strings in `Info.plist`.
- ✅ **Encryption** — `ITSAppUsesNonExemptEncryption = false` (skips the per-build export-compliance prompt).
- ✅ **Category** — `public.app-category.sports`.
- ✅ **Sign in with Apple** — not required (email/password only, no third-party social login).
- ✅ **Xcode Cloud** archive is green (SPM resolution fixed in #297).

## 12. Your steps tomorrow

1. **Archive the build** (Xcode → Product → Archive, or let Xcode Cloud's Archive workflow produce it) and **upload to App Store Connect** (build 1.7(7)).
2. In App Store Connect → your app → **+ Version 1.7**: paste §1, §3, §4, §5, §6, §10 captions; set URLs (§2).
3. **Upload screenshots** (§10).
4. **App Privacy** → fill per §7.
5. **App Review Information** → demo login + notes (§8); **Age rating** → §9.
6. Select the uploaded **build**, set pricing **Free**, then **Add for Review → Submit**.

> First-submission gotchas: make sure the build finishes "processing" before you can
> select it; if you ever offer Google/social login later, you'll then need Sign in
> with Apple (Guideline 4.8) — not now.
