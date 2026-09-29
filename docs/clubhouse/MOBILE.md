# Clubhouse on iPhone

How a mobile design in `design/handoff/mobile/` becomes the phone version of
a Clubhouse page, running in the iOS app. Desktop steps are in `README.md`,
and the rules that hold throughout are in `.claude/rules/clubhouse.md`. The
phone is **iPhone only, portrait, light theme** (D-22).

## How the app works (read this first)

- The iOS app (`ios/App`, Capacitor 8) is a shell around the live website: it
  loads `https://helmsportslabs.com/golf/dashboard` (`capacitor.config.ts`).
  A phone layout is web code. It reaches phones with a normal web deploy, and
  needs no App Store build unless native code changes.
- Old app builds run new web code indefinitely. Any native feature beyond
  what build 9 has is used only behind `hasNativeCapability()`
  (`src/lib/native/capabilities.ts`), with a web fallback.
- The platform contract lives in `memory/features/ios-native-shell.md`.
  Clubhouse inherits these pieces from the root layout (`CapacitorProvider`):
  - the status bar and splash
  - the keyboard pair `--keyboard-height` and `body.keyboard-open`
  - push notification listeners and tap routing
  - the offline page
- Detect the app with `isNativeApp()` (`@/lib/utils/capacitor`), never by
  reading the user agent.

## Native pieces Clubhouse owns

| Piece | Where | State |
| --- | --- | --- |
| Haptics, one grammar (select, press, commit, success, warning, error), honouring the user's setting | `src/clubhouse/lib/haptics.ts` | done |
| Safe areas: top bar, tab bar and toasts pad by `env(safe-area-inset-*)` | `src/clubhouse/styles/shell.css`, `ui.css` | done |
| Swipe-back guard: no edge swipe while a sheet or dialog is open | `NativeSwipeBackBridge` in `ClubhouseShell`; an overlay is `<dialog open>`, or `role="dialog"` with `data-state="open"` | done |
| Sign-out stops this phone getting the old account's pushes | `teardownDeviceTokenOnSignOut()` first in `writes.signOut` | done |
| Push permission prompt (soft ask before the iOS dialog) | Fairway's version can't be reused; needs a Clubhouse sheet | waits for the foundation design |
| Pull to refresh (Home, Roster, Messages list, Calendar agenda) | `router.refresh()`, light haptic at the threshold | waits for the foundation design |
| Keyboard: anything pinned to the bottom (composer, sheet footer) lifts by `var(--keyboard-height)` and carries `data-fw-keyboard-aware` | the page | per page |

A Clubhouse test (`src/clubhouse/__tests__/native.test.tsx`) pins the done
rows. Add to it when a row lands.

## Building a page's phone version

1. **Spec (gate `phone-spec`).** Write `docs/clubhouse/phone/<slug>.md` with
   these parts:
   - `Status: approved (owner design, design/handoff/mobile/<files>)`
   - what each screen maps to: the desktop component it reuses, or the new
     phone component
   - every gesture and its haptic
   - any gap between the design and the data, logged as a decision in
     `PROGRESS.md`
   
   A page with no mobile design keeps its draft, which still needs the
   owner's approval before it is built. `clubhouse:check` refuses a done
   `phone` gate without an approved spec.
2. **Build (gate `phone`).** Same components, data and catalog as desktop.
   - The phone layout is CSS under `@media (max-width: 820px)` in the page's
     stylesheet.
   - When the structure itself differs (a sheet instead of a panel, a pushed
     screen instead of a split view), add a phone component beside the
     desktop one in `src/clubhouse/screens/<slug>/`. Pick between them with
     `useChPhone()` (`src/clubhouse/lib/use-phone.ts`, the same 820px
     breakpoint as the CSS), and never by sniffing the device.
   - Rules:
     - Touch targets are at least 44px.
     - Every hover affordance gets a tap or long-press equivalent.
     - Popovers become sheets that drag to dismiss.
     - Modals become full-height sheets with the primary action above the
       home indicator.
     - Wide content scrolls inside its own container (`ScrollRegion`),
       never the page.
     - Nothing sits under the tab bar or the keyboard.
3. **States.** Every catalog number still holds on the phone. A phone-only
   state (a sheet, a gesture) gets a new number in the page's block, and a
   test like any other. Toasts sit above the tab bar.
4. **Motion and haptics.** Same doctrine:
   - Screens push and pop with a 220ms slide, and sheets rise in 360ms and
     follow the finger.
   - Reduced motion swaps both for fades.
   - Haptics go only through `haptic()`.

## Seeing it

| Where | How | Good for |
| --- | --- | --- |
| Browser | `/clubhouse-preview/<slug>` at 390px wide, every `?state=` | layout, states, screenshots against the design |
| a11y scan | `npm run clubhouse:a11y` runs every preview at 390px as well as 1280px | contrast, names, targets |
| Simulator or a real iPhone | `npm run dev -- -H 0.0.0.0`, then `npm run ios:dev` (needs Xcode; for a phone, the same network as the Mac) | safe areas, keyboard, swipe-back, real haptics (device only) |

`npm run ios:dev` points one debug run of the app at this Mac's dev server,
where `golf_clubhouse_ui` is on. When it finishes, the native files go back to
production. Nothing that points anywhere but production can be committed:
`src/test/lib/capacitor-config.test.ts` fails CI if it is. The preview routes
aren't reachable inside the app, so on a phone you use the real pages,
signed in.

## Done for a page's phone gate

- [ ] Matches the mobile design at 390 × 844 side by side (and 430 where it was drawn)
- [ ] Every catalog state checked at 390px in the preview; phone-only states numbered and tested
- [ ] `clubhouse:a11y` clean at 390px
- [ ] On a real iPhone through `ios:dev`:
  - safe areas right
  - keyboard never covers the field or the composer
  - edge swipe blocked while a sheet is open
  - haptics felt
  - dark status-bar glyphs on the light theme
- [ ] Logged in `PROGRESS.md` with the device and iOS version

Shipping follows the desktop rules. The flag stays off in production until
the owner turns it on, and deploys are the owner's call. A native change (a
new plugin, anything in `ios/`) also needs a new App Store build, which is
the owner's call too (`ios/appstore/`).
