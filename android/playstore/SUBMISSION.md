# GolfHelm — Google Play submission package (v2.0, versionCode 8)

Everything needed to publish GolfHelm on Google Play under an **organization**
account. The Android platform is scaffolded, configured, and at version parity
with iOS. What remains is a Firebase decision (§3), a keystore (§5), assets
(§7), and the Play Console forms (§8–§10).

> **Why an organization account:** personal Play accounts created after Nov 2023
> must run a closed test with **12 testers for 14 continuous days** before they
> can promote to production. Organization accounts are exempt. That exemption is
> worth roughly two weeks, and it is the single largest schedule lever here.

---

## 0. Status

| | |
|---|---|
| Platform | ✅ `android/` generated (`@capacitor/android@8.4.2`) |
| App ID | `com.helmsportslabs.golfhelm` — **identical to iOS**, correct and intended |
| Version | `versionName "2.0"` / `versionCode 8` — parity with iOS 2.0 (8) |
| SDK | `minSdk 24` (Android 7.0) · `targetSdk 36` (Android 16) |
| Permissions | ✅ INTERNET, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, ACCESS_NETWORK_STATE |
| UA marker | ✅ `HelmSportsLabsApp` — `proxy.ts` marketing block works on Android |
| Push | ⚠️ **decision required — see §3** |
| Signing | ⚠️ keystore not created — §5 |
| Assets | ⚠️ icons/feature graphic/screenshots — §7 |

`targetSdk 36` already satisfies Play's current target-API requirement, so
there's no upgrade treadmill before launch.

---

## 1. Organization account setup (do this first — it gates everything)

1. Play Console → create account → choose **Organization**, not Personal.
2. One-time **$25 USD** registration fee.
3. Supply legal entity name, address, website, and a **D-U-N-S number**.

> **You may already have a DUNS.** Apple requires one for *organizational*
> Apple Developer Program enrollment. If Helm Sports Labs enrolled as an
> organization (team `MK49MSX29G`), that number already exists — reuse it and
> verification is largely paperwork. If Apple enrollment was as an individual,
> request a DUNS free from Dun & Bradstreet and expect a few business days.

4. Google verifies the org against D&B records. Budget **1–3 days** with a DUNS
   in hand, longer without.

---

## 2. App identity

| Field | Value |
|---|---|
| **App name** (max 30) | `GolfHelm` |
| **Short description** (max 80) | `Team golf, run by the data — rounds, stats, and your whole program.` (68) |
| **Package name** | `com.helmsportslabs.golfhelm` |
| **Category** | Sports |
| **Tags** | Sports, Productivity |
| **Contact email** | `admin@helmsportslabs.com` |
| **Website** | `https://www.helmsportslabs.com` |
| **Privacy Policy** | `https://www.helmsportslabs.com/privacy` (**required** — Play rejects without it) |
| **Pricing** | Free, no in-app purchases |

---

## 3. Push notifications — THE decision to make

This is the one genuine fork, and it matters because Lynchburg's objection is
specifically about notifications.

**Option A — native FCM (what `@capacitor/push-notifications` expects)**

The plugin uses Firebase Cloud Messaging on Android. It needs:

1. A Firebase project for `com.helmsportslabs.golfhelm`
2. `google-services.json` dropped into `android/app/`
3. A send path — `supabase/functions/send-apns-push` is **APNs-only**; Android
   needs a parallel FCM sender

`device_tokens` already carries a `platform` column and `registerDeviceToken`
already passes it, so the schema is ready. Budget half a day plus Firebase setup.

**Option B — Web Push (already built, zero Android work)**

The full Web Push stack already exists and Android Chrome supports it
completely:

- `public/sw.js` — `push` + `notificationclick` handlers
- `src/lib/coachhelm/v3/foundation/push.ts` — VAPID via `web-push@3.6.7`
- `/api/push-subscriptions` — subscribe endpoint
- `push_subscriptions` table — live
- **VAPID keys already in Vercel production** (`VAPID_SUBJECT`,
  `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), set 67 days ago

**One thing is missing: nothing in the app ever calls `pushManager.subscribe`.**
That is why `push_subscriptions` has zero rows after 67 days. Wire that one call
and Android notifications work — on the web app *and* inside this shell, with no
Firebase project at all.

> **Recommendation: do Option B first.** It unblocks Lynchburg in hours rather
> than weeks, works without any store listing, and also fixes desktop and
> Android-web users. Add FCM later if you want native delivery guarantees.

---

## 4. Build

```bash
npm install
npx cap sync android
cd android && ./gradlew bundleRelease     # produces the .aab Play wants
```

Requires Android Studio / the Android SDK — **not currently installed on this
machine** (no `ANDROID_HOME`). Java 25 is present.

Upload the **`.aab`** (Android App Bundle), not an APK. Play has required AAB
for new apps since 2021.

---

## 5. Signing

Use **Play App Signing** (Google holds the app signing key; you hold an upload
key). Create the upload keystore:

```bash
keytool -genkey -v -keystore helm-upload.keystore \
  -alias helm-upload -keyalg RSA -keysize 2048 -validity 10000
```

> **Back this file up somewhere durable and out of the repo.** Losing the upload
> key is recoverable via Google support; losing it *without* Play App Signing is
> not — you'd have to ship a new package name. Do not commit it. Add
> `*.keystore` to `.gitignore` if it isn't already.

Wire it via `android/keystore.properties` (gitignored) referenced from
`android/app/build.gradle` — do not inline the password.

---

## 6. What's already correct (no action)

- **`appendUserAgent: 'HelmSportsLabsApp'`** — `proxy.ts` blocks marketing,
  pricing and membership routes for this UA. Play does not enforce Apple's
  Guideline 3.1.1, but keeping the platforms identical avoids a class of "the
  Android app shows things the iOS app hides" surprises.
- **`allowMixedContent: false`** — no silent HTTPS downgrade.
- **`backgroundColor: '#EDE0C8'`** — cream behind the WebView, so no white flash
  on navigation or rotation.
- **`capacitor-${platform}` body class** — was hardcoded `capacitor-ios`, which
  would have been a lie on Android. Now reads the real platform.
- **`POST_NOTIFICATIONS`** — Android 13+ makes notifications a runtime
  permission. Without the declaration the OS drops every notification silently:
  no prompt, no error, nothing in logcat. `cap add android` does not add it.

---

## 7. Store assets (all still to produce)

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, no alpha | derive from `public/icons/icon-512.png` |
| Feature graphic | **1024×500** PNG/JPG, no alpha | ❌ none exists — Play requires it |
| Phone screenshots | min 2, max 8 · 16:9 or 9:16 · ≥320px | ❌ recapture on an Android device/emulator |
| Tablet screenshots | optional but improves ranking | optional |
| Adaptive icon | foreground + background layers | `cap add android` generated defaults — replace |

> The **feature graphic** is the one people forget; Play will not let you submit
> without it. iOS has no equivalent, so it isn't in the App Store package.
>
> Screenshots must be captured on **Android** — reusing the iOS set is a
> rejection risk and looks wrong (different status bar, different chrome).

---

## 8. Data safety form (Play's equivalent of App Privacy)

Answers mirror the iOS App Privacy declarations:

| Data type | Collected | Shared | Purpose | Linked to user |
|---|---|---|---|---|
| Name, Email | Yes | No | Account management | Yes |
| Photos | Yes | No | App functionality | Yes |
| User content (messages, documents, notes) | Yes | No | App functionality | Yes |
| App interactions | Yes | No | Analytics | No |
| Crash logs, diagnostics | Yes | No | Analytics | No |

- **Data is encrypted in transit:** Yes
- **Users can request deletion:** Yes — via `admin@helmsportslabs.com`
- **No location, no financial info, no advertising ID, no third-party sharing**
- **Not directed at children** — no Families policy

---

## 9. Content rating

Complete the IARC questionnaire. All answers **No** — no violence, sexual
content, profanity, gambling, or user-generated content shared publicly.
Expected outcome: **Everyone / PEGI 3**.

Note: messaging between teammates *is* user-to-user communication — declare it
honestly if asked. It's within a closed team, not public.

---

## 10. App access (critical — the app requires login)

Play reviewers cannot sign up; they must be given credentials, same as Apple.

Under **App content → App access → All or some functionality is restricted:**

- **Username:** `demo@golfhelmdemo.com`
- **Password:** `Demo2026`
- **Instructions:** *GolfHelm is a B2B product for college golf programs. All
  features are behind a team login; accounts are provisioned by each program and
  there are no consumer sign-ups or purchases. Sign in with the demo coach
  account above — it is a fully populated demo team. To see core functionality,
  open Stats for a player, then Roster, Calendar and Recruiting.*

> Verify this login on a real device before submitting. It is the most common
> cause of an automatic rejection on both stores.

---

## 11. Release notes (v2.0)

```
A complete rebuild of GolfHelm.

• An entirely new interface — calmer, denser, faster on every screen.
• Full dark mode with Light / Dark / System control.
• CoachHelm rebuilt: tells you what changed, why, and what to do next.
• A coach triage workspace that puts each day's signals in priority order.
• Round review rebuilt with shot-by-shot visuals.
• Navigation consolidated — far less hunting.
• Hundreds of fixes to performance, accessibility, and reliability.
```

---

## 12. Order of operations

1. **Create the org Play account + DUNS verification** — start today, it's the
   long pole (§1)
2. **Decide push** — Option B unblocks Lynchburg this week (§3)
3. Create the upload keystore, back it up (§5)
4. Produce the feature graphic + Android screenshots (§7)
5. `npx cap sync android && ./gradlew bundleRelease` (§4)
6. Upload AAB → internal testing track first, install on a real device
7. Fill §2, §8, §9, §10, §11 → submit for review

**Play review is typically 1–7 days** for a new app — slower than Apple's
24–48h, and first submissions from a new account trend to the longer end.

> **Do not gate the Lynchburg conversation on this.** Web Push (§3, Option B)
> gives him working Android notifications in hours. The Play listing is a
> formality that can follow.
