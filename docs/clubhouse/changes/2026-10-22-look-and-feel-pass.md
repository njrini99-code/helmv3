# 2026-10-22 — Look-and-feel pass: interruptible Back, sheet reopen, type and placeholders

## 2026-10-22 — Look-and-feel pass (mot-04, mot-05, mot-06, mot-07)

```text
Design package: none (owner-approved look-and-feel pass, 2026-10-22)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- mot-04: Back during a phone push no longer waits for the push to end. The push is
  finished where it stands (`takeRunningPush`, `lib/nav-motion.ts`) and the pop
  starts from that point on the same smooth spring, so the page reverses from where
  the finger left it. A push started during a push still jumps; a view transition
  cannot be reversed, so a full fix means moving the push to WAAPI.
- mot-05: a sheet or dialog reopened while it is still closing picks up from where
  the exit stood (`lib/dialog-lifetime.ts`) instead of snapping open, on the smooth
  spring (the house curve for a centred dialog).
- mot-06: weights sit on the scale's rungs (400, 500, 600, 700). The ten 650s are
  600, the team hero numerals' 560 is 600, the button's 550 is 500, and the More
  sheet's list rows are 400, as an iOS list row. The sign-in pages keep theirs
  under their own contract. The phone player page's name wraps to two balanced
  lines instead of losing the surname to an ellipsis.
- mot-07: placeholder text reads on its own token, `--ch-text-placeholder`
  (light #736f66, 4.8:1 on a card; dark #8f897c). The fields that used the
  disabled ink or a lighter raw colour (sign-in, onboarding, the event title,
  qualifiers, settings) use it; fields already on the tertiary ink or darker keep
  theirs. No text ink was lightened.

### Why

- Apple's bar: a gesture can be taken back mid-motion, a sheet never jumps, a
  type scale has a few clear weights, and a hint inside a field is readable.

### Verification

- `src/clubhouse/__tests__/native-nav.test.tsx` (Back during a push) and
  `src/clubhouse/__tests__/look-feel-pass-css.test.ts` (new: placeholder token in
  both themes, no faint placeholder ink, weights on the rungs, the name wrap).
- No browser was available, so nothing here was measured or seen on a device.
