# Phone: Reset password (the link in the email)

Status: draft, 2026-10-19. No owner board exists for this screen; it is written from the sign-in phone board (`design/handoff/auth/Sign in - Mobile.html`, see [auth.md](auth.md)) and built from this text. It awaits the owner's review. The phone layout is `@media (max-width: 820px)` in `styles/auth.css`, the same structure as the desktop panel: the course on top (392px) and an ivory sheet from 352px that carries the panel.

Route: `/golf/reset-password`. Component `ResetPassword` in the sign-in room (`GateFrame`).

## Layout

1. Sheet, top to bottom: heading, one line ("For <address>"), the fields, the key, "Remembered it? Sign in". No lockup on the phone (the course carries the mark).
2. New password and Confirm new password are the sign-in field anatomy (52px boxes, 16px text, labels kept). One eye shows both. Under the first box: four bars and the four rules, which tick off as it is typed (the server's own rules).
3. The key is always lit: pressing it with something missing says what and rings the box (CH-15130 to CH-15133), the same refusal anatomy as sign in.

## States

- Checking: "Reset your password", "Checking your link…" and the shape of the two fields held, so nothing jumps.
- Expired or used: "This link has expired", one field and "Send a new link". The answer is the same whoever the address belongs to.
- Signed in as someone else when the link was opened: an info line says whose link this is and that the other session ended (CH-15931).
- Saved: "Password updated", "You're signed in as <address>", "Continue to GolfHelm". The sheet leaves, then the dashboard.

## Gestures, haptics, keyboard

No gestures. Press on Save, success when it lands, warning for a refusal about a box, error for the server's. The sheet rises over the keyboard as sign in's does. Enter in the first box moves to the second; Enter in the second saves.
