# Phone: Demo entry

Status: draft, 2026-10-19. No owner board exists for this screen; it is written from the sign-in phone board (`design/handoff/auth/Sign in - Mobile.html`, see [auth.md](auth.md)) and built from this text. It awaits the owner's review. The phone layout is `@media (max-width: 820px)` in `styles/auth.css`, the same structure as the desktop panel: the course on top (392px) and an ivory sheet from 352px that carries the panel.

Route: `/golf/demo`. Component `DemoEntry`.

## Layout

Heading "Try the live demo", one line, Your name, Work email, School / Program, the key "Enter the live demo", and the line "You'll be signed into a shared demo account instantly. No password needed." The foot says "Already have an account? Sign in". The course line reads "Step inside a live team."

## States

Checking whether someone is already signed in (never longer than four seconds); signed in ("You're already signed in. Continue where you left off."); timed-out demo ("Your demo session timed out…"); the address a demo email carries is filled in; a problem is said in a notice and the box rings; the server's refusal is said in its words.

## Gestures, haptics, keyboard

No gestures. Press on Enter the live demo, warning for a missing answer, error for a refusal. Enter in the last box submits.
