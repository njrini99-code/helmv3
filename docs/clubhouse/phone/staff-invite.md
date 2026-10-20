# Phone: Staff invitation

Status: draft, 2026-10-19. No owner board exists for this screen; it is written from the sign-in phone board (`design/handoff/auth/Sign in - Mobile.html`, see [auth.md](auth.md)) and built from this text. It awaits the owner's review. The phone layout is `@media (max-width: 820px)` in `styles/auth.css`, the same structure as the desktop panel: the course on top (392px) and an ivory sheet from 352px that carries the panel.

Route: `/golf/staff/join/[token]`. Component `StaffInvite`.

## Layout

Signed in: heading "Join <program>", one line, two rows (the program and team; the role and what it allows), "Signed in as <address>. Not you?", the key "Accept invitation". Signed out: the same heading, the offer as one row (role, program, team), then Full name, Email, Password (with the rules ticking off) and the key "Create account and join", with "Already have an account? Sign in and open this link again" carrying the link through sign in. The form is long, so the sheet scrolls and rises over the keyboard.

## States

Checking the session; invalid or expired invitation ("This invitation isn't valid", the server's reason, one key to sign in); wrong account (a warning with "Switch account", which ends the session and returns to this link); a refused account (the server's words, on the field it names); an account made but not yet on the staff (Accept again, with the reason); joined ("You're on the staff", then the dashboard).

## Gestures, haptics, keyboard

No gestures. Press on the keys, success when joined, warning for a field problem or the wrong account, error otherwise.
