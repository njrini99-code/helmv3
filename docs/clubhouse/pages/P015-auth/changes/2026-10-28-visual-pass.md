# 2026-10-28 — Front door: visual pass (inks, links, member card, scene motion)

## 2026-10-28 — Pre-deploy visual pass, area H

```text
Design package: none (visual-pass-2026-10-28 RUBRIC.md H2, H8, H13;
                recheck-2026-10-24
                G3 findings 1, 5, 9 and 14)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none (presentation only)
Actions:        none
Data impact:    none
Held items:     the intro's two green choice cards (owner's call, see findings);
                the scene's pine and bough slide on a real iPhone (Safari)
```

### Changed

- Onboarding inks: the eight light-mode `#55524b` and three `#6b6860` text
  colours, both lighter than the tertiary ink, are now `--ch-text-secondary`
  and `--ch-text-tertiary`, the same tokens the dark theme already used for
  those selectors (back, enter hint, legal line, labels, options, hints, the big
  fields' labels, consent, help, the password rules, the rail's steps).
- The handicap step's "no handicap" readout: the dash was `#cfc9ba` (1.34:1)
  and the live region read a bare dash. It is `<NoData label="No handicap yet">`
  in the tertiary ink, so it is seen as a dash and heard as words.
- The big name and city fields keep the shared `--ch-text-placeholder`, which
  the same pass darkened in tokens.css (light `#69655d`: 4.69:1 on the bare
  desktop page, was 4.05; dark `#a09a8c`: 6.6:1).
- The member card, which stays ivory in both themes: the blank name reads at
  3.6:1 (was 1.8:1), blank values at 4.5:1 (was 1.7:1), the field labels at
  5.1:1 (was 4.0:1 over the card's grain) and the blank coin's glyph at 3.4:1.
- Links inside a sentence are underlined at rest: sign in's "New here? Create
  an account", onboarding's legal line and "Already a member? Sign in". They
  were told apart by colour alone on the phone.
- The scene's foreground pine and bough slide by `translate` instead of
  animating `left` and `right`. The path, timing and easing are the documented
  ones (`--ch-au-t-photo`, `--ch-au-ease`); the reduced-motion path is unchanged
  (the same token goes to 1ms).

### Verification

- P015 tests (auth, auth-logic, auth-server, auth-scene, onboard, onboard-logic,
  auth-reset, auth-join, auth-staff, auth-demo-pending, onboard-coach,
  front-door-routes) plus auth-kb-mark, auth-forgot-hit-area, dark-ink-guard,
  hairlines and reduce-transparency: all pass.
- Screenshots (Chromium, 393 and 1280, light and dark): sign in, entry,
  onboarding intro.
- Needs an iPhone: the pine and bough slide as the sign-in panel opens.
