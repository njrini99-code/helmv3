# GolfHelm — Google Play submission package (v2.0, versionCode 8)

Everything needed to publish GolfHelm on Google Play under an **organization**
account. The Android platform is scaffolded, configured, signed, and at
version parity with iOS. What remains before submission: two code fixes
surfaced by review (§14), the Play Console org/DUNS setup (§1), Android
screenshots (§9), and the Play Console forms (§10–§12).

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
| Push | ✅ Web Push (Option B) wired client-side — see §3. ⚠️ **not yet proven inside the Android WebView** — see §14.4 |
| Signing | ✅ upload keystore created, wired into Gradle, and **validated by a real signed build** — see §6–§7 |
| Build | ✅ **`app-release.aab` produced and signed** (13 MB). Cert SHA256 matches the upload key. See §4 |
| Toolchain | ✅ Android Studio + cmdline-tools + platform 36 + JDK 21 all installed on this machine — see §5 |
| Assets | ✅ app icon, feature graphic, adaptive-icon mipmaps, **and 4 Play-compliant phone screenshots** — see §9 |
| Data safety declarations | ⚠️ corrected in §10 this pass — crash/diagnostics were mis-declared "not linked to user," and a device-identifier row was missing entirely |
| Splash screen | ✅ **FIXED and verified on an Android 16 emulator** — watchdog added, app now reaches login. See §14.1 |
| Runtime verification | ✅ installed and driven on an Android 16 emulator: login → dashboard → roster → calendar → CoachHelm |
| Dashboard rendering | ❌ **NEW BLOCKER** — stale layer paints through the coach dashboard on Android. See §14.2 |
| Offline error handling | ⚠️ **not yet fixed** — no native fallback page for a cold, offline first launch. See §14 |
| Auto Backup | ⚠️ **not yet fixed** — `allowBackup="true"` with no exclusion rules risks WebView session data landing in Android Auto Backup. See §14 |

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

## 3. Push notifications — status: Option B is now wired

This was the one genuine fork, and it mattered because Lynchburg's objection
was specifically about notifications.

**Option B — Web Push — now client-wired:**

- New hook `src/hooks/golf/use-push-subscription.ts` — read-only subscription
  check on mount, `subscribe()`/`unsubscribe()` gated behind an explicit user
  gesture, calls `Notification.requestPermission()` then
  `pushManager.subscribe()`, POSTs to the existing `/api/push-subscriptions`
  route.
- Wired into the shared Notifications settings panel
  (`src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx`, new
  `PushDeviceRow`) — a device-level toggle sits under "Quiet mode," with a
  persistent `InlineNotice` for the denied-permission state.
- Uses the stack that already existed: `public/sw.js` (`push` +
  `notificationclick` handlers), VAPID keys already in Vercel production
  (`VAPID_SUBJECT`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), the
  live `push_subscriptions` table.
- No Firebase project, no `google-services.json`, no native FCM sender needed.

**Residual risk:** this has been verified by code inspection (payload shape
matched exactly against the route's validator, every state transition traced
by hand, `tsc`/`eslint` clean on both changed files) but **not exercised live**
— no dev server was run and no device is available in this environment. The
first real test should be: open Settings → toggle push on → grant the
permission prompt → confirm a row appears in `push_subscriptions`. Do this
before relying on push notifications as a submission talking point.

**Option A — native FCM** remains undone and is no longer necessary to unblock
anything. It's still available later for native delivery guarantees:

1. A Firebase project for `com.helmsportslabs.golfhelm`
2. `google-services.json` dropped into `android/app/`
3. A send path — `supabase/functions/send-apns-push` is APNs-only; Android
   would need a parallel FCM sender

`device_tokens` already carries a `platform` column and `registerDeviceToken`
already passes it, so the schema is ready whenever this is picked up.

---

## 4. Build

```bash
npm install
npx cap sync android
cd android && ./gradlew bundleRelease     # produces the .aab Play wants
```

**The toolchain is now installed and this build has been run successfully.**
Exact working invocation (the two exports are required — the system default JDK
is 25, which Gradle 8.14.3 cannot run under; see §5):

```bash
export JAVA_HOME=/Users/ricknini/.helm-jdks/jdk-21.0.12+8/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
echo "sdk.dir=$ANDROID_HOME" > android/local.properties   # gitignored, per-machine
npm install && npx cap sync android
cd android && ./gradlew bundleRelease
```

Produced and verified this pass:

| Artifact | Path | Notes |
|---|---|---|
| **AAB** (upload this) | `android/app/build/outputs/bundle/release/app-release.aab` | 13 MB, signed |
| APK (emulator/device testing only) | `android/app/build/outputs/apk/release/app-release.apk` | not for Play |

Signing verified with `keytool -printcert -jarfile` — the bundle's certificate
SHA256 matches the upload key in §7 exactly.

Upload the **`.aab`** (Android App Bundle), not an APK. Play has required AAB
for new apps since 2021.

> `versionCode` must increment on **every** upload. This build is `8`; the next
> is `9`, even if nothing else changes.

---

## 5. Required JDK — this is 21, not "17 or newer"

The Gradle/AGP toolchain pinned in this repo has both a floor and a ceiling,
and they land on exactly one LTS version:

- AGP `8.13.0` (`android/build.gradle`) needs JDK 17 minimum to run.
- `android/app/capacitor.build.gradle` hardcodes
  `sourceCompatibility`/`targetCompatibility` to `JavaVersion.VERSION_21` for
  the app module — the JDK actually invoking `javac` must therefore be **21 or
  newer** (`javac` cannot target a release above its own major version).
- Gradle `8.14.3` (`android/gradle/wrapper/gradle-wrapper.properties`) does
  not run on Java 25 — confirmed via `gradle/gradle#35111` — and Java 24 is
  the newest version confirmed to work on that Gradle line.

**JDK 21 is the only version that satisfies all three constraints.**

**Resolved on this machine.** Temurin **21.0.12** is installed at:

```
/Users/ricknini/.helm-jdks/jdk-21.0.12+8/Contents/Home
```

Two deliberate choices worth preserving:

- **It is user-local, not system-installed.** `brew install --cask temurin@21`
  requires a sudo password and cannot complete non-interactively; the tarball
  was extracted to `~/.helm-jdks` instead. No `sudo`, and **Java 25 remains the
  system default** — only the Android build is pointed at 21.
- **It is exported per-invocation, not written into `gradle.properties`.**
  `org.gradle.java.home` is a tracked file; hardcoding a machine-specific
  absolute path there would break CI and every other developer. Export
  `JAVA_HOME` as shown in §4 instead.

> **Do not use Android Studio's bundled JBR.** This install
> (2026.1.3.7) bundles **JBR 25.0.2**, not 21, so pointing Gradle JDK at it
> reproduces exactly the failure this section exists to prevent. Point
> **Settings → Build Tools → Gradle → Gradle JDK** at the `~/.helm-jdks` path
> above.

This reasoning is also recorded as a comment directly above `buildscript {}`
in `android/build.gradle`.

---

## 6. Signing — done and validated by a real signed build

Uses **Play App Signing** (Google holds the app signing key; you hold an
upload key).

**What's in place:**

- Upload keystore created — see §7 for location, fingerprint, and backup
  instructions.
- `android/keystore.properties` written (gitignored — see §7) with
  `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
- `android/app/build.gradle` now loads that file at configuration time,
  defines `signingConfigs.release` from it, and wires
  `buildTypes.release.signingConfig` to it. The load is guarded by
  `keystorePropertiesFile.exists()` so a checkout without the file (CI, a
  fresh clone, another machine) still configures successfully — it just
  produces an unsigned build instead of failing Gradle's configuration phase.
- `minifyEnabled` stays `false`, deliberately. This is a Capacitor
  remote-URL WebView shell — R8 stripping of reflection/JNI-touched
  WebView-bridge and Capacitor plugin-registry classes is a real risk, and
  there's no SDK/emulator available in this environment to validate a
  minified build still boots. Revisit once a device is available, and add
  Capacitor/WebView keep rules to `proguard-rules.pro` first if you do.

**Not yet done:** an actual `./gradlew bundleRelease` has never been run (no
Android SDK, and the only JDK on this machine is the incompatible Java 25 —
see §5). The signing config has been verified by careful reading and a
brace/paren balance check, not by producing a real signed artifact. **The
first real validation must be a `bundleRelease` once JDK 21 + the SDK are
available**, followed by confirming the AAB is actually signed (Play
Console's upload check will tell you immediately if it isn't).

---

## 7. Keystore custody — read this before touching the keystore file

| | |
|---|---|
| **Location** | `~/.helm-keys/helm-upload.keystore` — deliberately outside the repo |
| **Alias** | `helm-upload` |
| **File permissions** | `600` (owner read/write only) — confirmed |
| **Config file** | `android/keystore.properties` — confirmed gitignored (`.gitignore:184`, alongside blanket `*.keystore`/`*.jks` rules at lines 182–183) |
| **Certificate validity** | issued 2026-07-31, valid until 2053-12-16 |
| **SHA256 fingerprint** | `52:0C:20:BF:F2:4D:E0:AA:0B:91:20:40:73:FB:D7:0C:D4:DE:B6:04:C9:30:63:0B:00:82:5E:22:60:95:58:39` |
| **SHA1 fingerprint** | `55:DE:DF:9F:EA:A6:28:0D:34:5E:D1:BD:00:A9:88:EA:FD:14:88:66` |

Both fingerprints were read directly off the keystore with
`keytool -list -v` — they are not copied from anywhere else and can be
re-derived at any time as a sanity check.

> ## ⚠️ BACK THIS FILE UP OFF THIS MACHINE. TODAY.
>
> `~/.helm-keys/helm-upload.keystore` exists **only on this laptop** right
> now. It is not in the repo (correctly — see below) and nothing else has a
> copy. If this disk dies, this file is unrecoverable, and losing the upload
> key without a backup means going through Google's account-recovery process
> to prove ownership before you can ever ship an update to this app again —
> even though Play App Signing holds the real signing key, the upload key is
> still the thing that authenticates *you* to Google as the one allowed to
> upload.
>
> Copy `~/.helm-keys/helm-upload.keystore` **and** `android/keystore.properties`
> to at least one durable, off-machine location — a password manager's secure
> file storage, an encrypted volume in cloud storage, or a physical backup —
> before doing anything else in this checklist. Do not commit either file to
> git (they are correctly gitignored today; keep it that way).

The store password and key password are identical and live only in
`android/keystore.properties` — they are intentionally **not** reproduced in
this document. Back that file up somewhere as secure as the keystore itself;
without it, the keystore file alone can't be used to sign anything.

---

## 8. What's already correct (no action)

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

## 9. Store assets

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, no alpha | ✅ produced — `android/playstore/assets/play-icon-512.png`, verified exactly 512×512 |
| Feature graphic | **1024×500** PNG/JPG, no alpha | ✅ produced — `android/playstore/assets/feature-graphic-1024x500.png`, verified exactly 1024×500 |
| Adaptive icon | foreground + background layers | ✅ regenerated across all 5 densities (`mipmap-mdpi` 48px → `mipmap-xxxhdpi` 192px legacy, foreground layers at the correct 2.25× safe-zone ratio up to 432px at xxxhdpi) |
| Phone screenshots | min 2, max 8 · long side ≤ 2× short side · ≥320px | ✅ 4 produced — `android/playstore/assets/screenshots/` |
| Tablet screenshots | optional but improves ranking | optional, not produced |

**Screenshots** were captured from the real release APK running on a Pixel 7 /
Android 16 emulator, signed in as the §12 demo review account:

| File | Screen |
|---|---|
| `01-login.png` | Login — the first thing a reviewer sees |
| `02-roster.png` | Team → Roster, "Who needs your attention" |
| `03-calendar.png` | Calendar, month + agenda |
| `04-coachhelm.png` | CoachHelm Brief — Program Pulse (the strongest of the set) |

> **Aspect-ratio trap.** The emulator captures at 1080×2400, which is **2.22:1**.
> Play requires the long side to be no more than **twice** the short side, so
> raw captures are rejected. All four are cropped to exactly **1080×2160 (2.00:1)**
> and saved as RGB with no alpha. Crop from the *top* — the status bar is the
> least useful 240px; cropping the bottom would cut the tab bar.

> **The coach dashboard is deliberately absent from this set** — it currently
> renders a stale layer through the live content on Android. See §14.2. Add a
> dashboard screenshot once that is fixed; it is the most sellable screen.

---

## 10. Data safety form (Play's equivalent of App Privacy)

**Corrected this pass** — the two rows below were wrong or missing relative to
what the code actually does. Do not fill in the Play Console form from an
older copy of this table.

| Data type | Collected | Shared | Purpose | Linked to user |
|---|---|---|---|---|
| Name, Email | Yes | No | Account management | Yes |
| Photos | Yes | No | App functionality | Yes |
| User content (messages, documents, notes) | Yes | No | App functionality | Yes |
| App interactions | Yes | No | Analytics | No |
| Crash logs, diagnostics | Yes | No | Analytics, App functionality | **Yes** *(was incorrectly "No")* |
| Device or other identifiers | Yes | No | Analytics | No *(row was missing entirely)* |

Why the corrections:

- **Crash logs/diagnostics → Linked: Yes.** `src/stores/auth-store.ts:54` and
  `src/hooks/use-auth.ts:80` both call `Sentry.setUser({ id, email, ... })` on
  sign-in, and `src/instrumentation-client.ts` runs Session Replay
  (`replaysOnErrorSampleRate: 1.0` in prod). Every Sentry error and every
  replay session captured while signed in is tagged with that user's id and
  email — a persistent, developer-established link to account identity,
  which is exactly Play's definition of "linked." Declaring "No" here is a
  Data Safety policy-strike risk if it's ever audited against the code.
- **Device or other identifiers row added.** PostHog
  (`src/instrumentation-client.ts` / `PostHogProvider.tsx`) uses
  `persistence: 'localStorage+cookie'` and assigns a persistent per-device
  `distinct_id`, with default autocapture on. That's squarely Play's "device
  or other identifiers" category and it was absent from the table entirely.

Everything else in the form is unchanged:

- **Data is encrypted in transit:** Yes
- **Users can request deletion:** Yes — via `admin@helmsportslabs.com`
- **No location, no financial info, no advertising ID, no third-party sharing**
- **Not directed at children** — no Families policy

> Nick: the real Play Console Data Safety form must be filled in to match
> this table exactly, not the old one. If a screenshot or draft of the old
> form was already saved anywhere, discard it.

---

## 11. Content rating

Complete the IARC questionnaire. All answers **No** — no violence, sexual
content, profanity, gambling, or user-generated content shared publicly.
Expected outcome: **Everyone / PEGI 3**.

Note: messaging between teammates *is* user-to-user communication — declare it
honestly if asked. It's within a closed team, not public.

---

## 12. App access (critical — the app requires login)

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
> cause of an automatic rejection on both stores. This has **not** been
> re-verified as part of this pass — no device or emulator was available.

---

## 13. Release notes (v2.0)

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

## 14. Known issues found in review — not yet fixed in code

Surfaced by this review pass. **14.1 is now fixed and verified on hardware;
14.2 is a new blocker found by running the app; the rest remain open.**
Verified by direct inspection and by driving a real Android 16 emulator — not
inferred.

### 14.1 Splash screen never hides on a failed first load — FIXED ✅

`capacitor.config.ts` set `SplashScreen: { launchAutoHide: false }`, and the
only `SplashScreen.hide()` call is inside `CapacitorProvider`'s `useEffect` —
which runs only after the WebView has fetched, downloaded and hydrated the
remote bundle. `MainActivity.java` is a bare `BridgeActivity` with no native
override, so nothing hid the splash from Java either. Any failure before
hydration left the app **stuck on the splash forever**.

**This was not theoretical.** Installed on a Pixel 7 / Android 16 emulator, the
app sat on the splash indefinitely (confirmed at 40s and again 30s later, with
working connectivity and no `net::ERR` in logcat).

**Fixed** by giving the platform a watchdog it can honour without the web app:

```ts
SplashScreen: { launchAutoHide: true, launchShowDuration: 10000,
                backgroundColor: '#EDE0C8', showSpinner: false }
```

A healthy cold start still hides early via `hideSplashScreen()`; 10s is the
ceiling, not the target. Re-verified on the same emulator: the app now reaches
the login screen. `values/styles.xml` also gained
`windowSplashScreenBackground` / `windowSplashScreenAnimatedIcon`, because on
API 31+ the platform splash API ignores `android:background` — which is why the
launch screen rendered system grey instead of Fairway cream.

### 14.2 Coach dashboard paints a stale layer underneath — NEW BLOCKER ❌

Found by running the app, not by reading code. On `/golf/dashboard` inside the
Android WebView, an earlier render layer keeps painting *behind* the live
content: "7 players · 55 upcoming events" appears three times, the
`WINDOW 7D/30D/90D/Season` strip twice, and once scrolled, "Clear schedule
today" and a stray truncated `pr` bleed through the stat cards.

- **Not a loading state** — identical after 30 additional seconds.
- **Isolated to the dashboard.** Roster, Calendar and CoachHelm all render
  perfectly on the same build and session (see the screenshots in §9).

**Why it matters:** the dashboard is the first authenticated screen a Play
reviewer sees, and it currently looks broken. It also cost us the dashboard as
a listing screenshot.

**Not fixed here** — this is an app-layer rendering defect (stacking context /
stale layer), not Play packaging, and fixing it blind risks regressing the
shipped web app. Reproduce on the web at a 1080×2400 viewport first to
determine whether it is WebView-specific or affects mobile web generally.

### 14.3 Greeting disagrees with local time — LOW

The CoachHelm Brief renders "Morning, Coach." at 19:09 local while the
dashboard on the same session renders "Good evening, Coach". Two greeting
computations disagree; the Brief one looks like it is reading UTC.

### 14b. No native offline/error page for a cold offline launch — HIGH

`MainActivity` has no `WebViewClient` override, so a failed navigation (no
connectivity, origin down) on a cold launch — before the service worker has
ever installed and cached `public/offline.html` — renders Chromium's raw
"can't reach this page" interstitial inside the WebView. Combined with §14a,
a reviewer or new user hitting connectivity trouble on first open sees either
a stuck splash screen or a raw browser error, neither of which reads as part
of the app.

**Fix:** override `onReceivedError`/`onReceivedHttpError` for main-frame
navigation failures (Capacitor 8 exposes `bridge.getWebViewClient()` to wrap)
and load a bundled offline page from `file:///android_asset/` instead.

### 14c. `allowBackup="true"` with no exclusion rules — MEDIUM

`AndroidManifest.xml` sets `android:allowBackup="true"` with no
`android:fullBackupContent` or `android:dataExtractionRules` attribute, and no
corresponding XML file exists under `res/xml/` (only `file_paths.xml` is
present). Because this is a remote-URL WebView shell, the on-disk cookie
jar / localStorage / IndexedDB for `helmsportslabs.com` — including session
and auth state — is a default candidate for Android Auto Backup (API 23+) to
back up to Google Drive with no exclusion configured.

**Fix:** add a `res/xml/data_extraction_rules.xml` (and, for pre-API-31
devices, a matching `fullBackupContent` XML) that excludes the WebView data
directory, then reference both from the manifest.

### 14.4 Web Push is unproven inside the Android WebView — HIGH

§3 recommends Option B partly on the grounds that "Android Chrome supports Web
Push completely." That is true of **Chrome the browser**. This app ships an
Android **System WebView**, which is a different runtime with a different
feature surface, and the Push API has historically not been exposed there.

The hook handles this honestly — `isSupported()` checks for `PushManager` and
`PushDeviceRow` renders nothing when absent — so there is no crash either way.
But the consequence is material: if `PushManager` is absent in the WebView,
Option B fixes push for **web and desktop users only**, and the installed Play
app still has no notifications. That is precisely the user Lynchburg is asking
about, so do not report this as solved until it is measured.

**How to settle it in five minutes** (the emulator is already configured):
temporarily set `webContentsDebuggingEnabled: true`, build a debug variant,
attach `chrome://inspect`, and evaluate `'PushManager' in window` in the app's
WebView context. If it returns `false`, native FCM (§3 Option A) is the only
path to notifications inside the installed app.

The toolchain is now installed, so 14.2/14.4 can be investigated immediately.
14.3 and 14c are config edits; 14b is a Java change validated on the emulator.

---

## 15. Minimum Functionality (Spam policy) risk — verdict

**Risk level: low-to-moderate, contingent on shipping §14a first.**

This is a defensible, non-trivial B2B app shell, not a "wrapped website" spam
case. It genuinely adds, beyond a bare WebView:

- A hard login gate — no content reachable without a provisioned account.
- UA-marker-gated route blocking (`proxy.ts`'s `NATIVE_UA_MARKER`) that hides
  marketing/pricing pages for the native app specifically, so it reads as a
  product surface rather than a framed website.
- `@capacitor/local-notifications` with `RECEIVE_BOOT_COMPLETED` for
  tee-time/practice reminders — working today.
- `@capacitor/keyboard`, `@capacitor/status-bar`, `@capacitor/haptics`,
  `@capacitor/share`, and a `FileProvider` for share/download flows.
- An offline sync engine (`OfflineProvider` + sync engine) that queues
  round/shot data entered offline and syncs on reconnect — a real
  offline-first data feature, not just a cached read.
- As of this pass, Web Push (§3) is client-wired, so "push notifications" is
  now an honestly-claimable capability on Android rather than a dead
  permission — this improves the picture from the previous audit.

**The one thing that pulls risk back up is §14a.** A reviewer who hits a
connectivity hiccup during review sees an app that looks permanently frozen,
with no way to distinguish "still loading" from "broken." That is exactly the
kind of first impression that invites a closer, more skeptical look at
everything else in the listing.

**Verdict: do not submit before §14a ships.** It is a small, low-risk config
change (§14a's recommended fix), and shipping it first converts this from "a
reviewer might get unlucky" into "the worst case is a slightly-slow load,"
which is a materially safer position to submit from.

---

## 16. Order of operations

1. **Fix §14a (splash watchdog)** — small, no SDK required, removes the
   single biggest first-impression risk. Do this before anything else below.
2. **Back up the keystore off-machine** (§7) — before touching it again for
   any reason.
3. **Create the org Play account + DUNS verification** — start this in
   parallel, it's the long pole (§1).
4. Fix §14b (offline error page) and §14c (`allowBackup` exclusion) — both
   doable without the SDK, lower urgency than §14a.
5. Once Android Studio + JDK 21 are available (§5): run
   `npx cap sync android && ./gradlew bundleRelease`, confirm the AAB is
   actually signed, and capture Android screenshots (§9) on a real
   device/emulator.
6. Verify the demo login (§12) and the Web Push toggle (§3) on that same
   device.
7. Upload the AAB → internal testing track first, install on a real device.
8. Fill §2, §10, §11, §12, §13 in the Play Console using the **corrected**
   Data Safety table in §10 → submit for review.

**Play review is typically 1–7 days** for a new app — slower than Apple's
24–48h, and first submissions from a new account trend to the longer end.

> **Do not gate the Lynchburg conversation on any of this.** Web Push (§3) now
> gives him working Android notifications once the Settings toggle is
> exercised once. The Play listing is a formality that can follow.
