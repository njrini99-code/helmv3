# Phone: Waiting for approval

Status: draft, 2026-10-19. No owner board exists for this screen; it is written from the sign-in phone board (`design/handoff/auth/Sign in - Mobile.html`, see [auth.md](auth.md)) and built from this text. It awaits the owner's review. The phone layout is `@media (max-width: 820px)` in `styles/auth.css`, the same structure as the desktop panel: the course on top (392px) and an ivory sheet from 352px that carries the panel.

Route: `/golf/coach/pending`. Component `CoachPending`.

## Layout

Heading "Waiting for approval", one line naming the program, two rows between a hairline (who approves: "Your head coach"; status: "Waiting", with a neutral dot and when it was last checked), a line saying nothing more is needed, the key "Check again", "Sign out" under it, and "Expected to be a player? Sign up with your team code" in the foot.

## States

Waiting; checking; checked and still waiting ("Checked just now. Nothing yet."); sign out failed (a notice, the link on again). It looks again by itself once a minute while it is in front of the person and when they come back to the tab, never faster than every 15 seconds; approval redirects to the dashboard.

## Gestures, haptics, keyboard

No gestures. Press on Check again and Sign out, error if signing out fails.
