# Release Candidate — Helm Sports Labs 2.0 (9)

> Prepared overnight 2026-08-25 → 2026-08-26 per
> `docs/plans/IOS_PREMIUM_NATIVE_UPDATE_2026-08-25.md`. Audit:
> `docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md`. Metadata base:
> `ios/appstore/SUBMISSION.md` (v2.0 package; the build number moved 8 → 9).
> **Upload / Submit for Review are owner actions (§89) — nothing here uploads.**

## §88 Release Candidate Report

```text
Version:            2.0
Build:              9

Xcode:              26.6 (17F113)
SDK:                iOS 26.5.1 (23F81a) — clears the Xcode 26+/iOS 26 SDK upload floor
Minimum iOS:        15.0 (unchanged)

Simulator QA:       PASS — device matrix booted (17e / 17 Pro / Pro Max), authed
                    player walkthrough of dashboard/CoachHelm/rounds/stats/new-round/
                    shot-entry; session survived build 8→9 reinstall.
                    CAVEAT: the safe-area fixes live in the WEB layer — the shell
                    renders production, so final visual confirmation happens after
                    the morning web deploy (runbook step 2).

Physical device:    PENDING — owner checklist below (§13/§71/§72).
Push:               PASS (architecture) — value-first pre-prompt verified live in
                    simulator; system prompt chained correctly; production APNs
                    delivery is a physical-device item.
Haptics:            PASS (integration) — grammar wired at primitives (Button=light,
                    Segmented=selection), tabs now selection; FEEL approval needs
                    Taptic hardware (checklist).
Live Activity:      N/A — deliberately deferred (§62: no secure extension auth yet).
Accessibility:      WARN — no regressions introduced; full VoiceOver/Dynamic Type
                    pass not run tonight. Declare NO accessibility nutrition labels
                    (voluntary; unverified claims are a 2.3 risk).
Performance:        PASS (build-level) — Release device compile clean; no new
                    blur/animation surfaces added. Instruments pass deferred.
Privacy:            PASS — PrivacyInfo.xcprivacy: no tracking, 2 required-reason
                    APIs declared; no new SDKs added tonight.
App Store metadata: READY — SUBMISSION.md + build-9 deltas (What's New, review
                    notes) in this directory; screenshots regenerating (see below).

Known issues:       P2 deferrals listed in audit §5 (Live Activity, App Intents,
                    dark auth surface, badge bridge, brand-mark duality, Rounds
                    trend-pill wording).

Recommendation:     SHIP — after the 4 owner steps below complete cleanly.
                    No open P0; the remaining P1s are exactly those owner steps.
```

## Morning runbook (owner, in order)

1. **Sign into Xcode once**: Xcode → Settings → Accounts → add your Apple ID
   (team MK49MSX29G). This is the only reason tonight's archive attempt stopped
   ("No Accounts"); both signing identities are already in the keychain and the
   unsigned Release compile is clean.
2. **Deploy the web layer to production** (your usual `vercel` promote). The
   safe-area fixes (round chrome, new-round flow, course-picker close) ship in
   the web app, not the binary.
3. **Re-verify in the simulator** (2 minutes): open the installed app (iPhone
   17 Pro sim, already logged in as the demo player) → New round → confirm the
   dark setup band and the Prev/Exit/Next row now clear the clock/Dynamic
   Island. Approve the dark/tinted icon from
   `docs/audits/evidence/ios-premium-2026-08-25/` + Settings→App Icon check.
4. **Archive + upload**:
   ```bash
   cd /Users/ricknini/Downloads/helmv3/ios/App
   xcodebuild -project App.xcodeproj -scheme App -configuration Release \
     -destination 'generic/platform=iOS' archive \
     -archivePath ~/Desktop/HelmSportsLabs-2.0-b9.xcarchive -allowProvisioningUpdates
   ```
   then Xcode → Organizer → Distribute (validate first). TestFlight **internal**
   testing needs no Beta App Review — fastest way onto your iPhone for the
   physical checklist.
5. **App Store Connect console checks** (blocking): re-answer the **new 2026
   age-rating questionnaire** (new tiers + Social Media question — team-scoped
   private messaging is most likely "no", but answer deliberately); paste the
   What's New + review notes; upload screenshots; confirm demo account works;
   verify privacy labels still match SUBMISSION.md §privacy.
6. **Submit for Review** — your call, your button (§89).

## Physical-device checklist (before or right after upload)

- [ ] Install build 9 via TestFlight internal on your iPhone (upgrade-in-place
      over the current install if you have one — session/theme/haptic prefs
      must survive).
- [ ] Haptic FEEL pass (§72): tabs (selection tick), buttons (light), score
      entry chips, round submit success — "would this annoy after 50 uses?"
- [ ] Push end-to-end: enable notifications → receive a real team message push
      → tap → lands on the right screen; badge behavior.
- [ ] Universal link from Messages/Safari → correct in-app routing (cold+warm).
- [ ] Cold launch on LTE + weak signal; offline launch shows offline.html.
- [ ] Dark mode + outdoor brightness read of dashboard/round screens.
- [ ] VoiceOver smoke on login → dashboard → score entry.
- [ ] Icon: Home Screen in Light / Dark / Tinted appearance modes.

## Guideline 4.2.2 answer ("what does the app do Safari can't")

Push notifications with actionable deep-link routing and a value-first native
permission flow · universal links · Taptic Engine haptic grammar across
scoring/navigation · native status-bar/theme integration · dark/tinted app
icon · offline recovery surface · App Store 3.1.1-compliant native gating ·
portrait-locked, safe-area-native chrome. (Expand in review notes; see
metadata deltas.)
