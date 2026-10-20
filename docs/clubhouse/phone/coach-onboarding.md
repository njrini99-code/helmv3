# Phone: New coach: set up your program

Status: draft, 2026-10-19. No owner board exists for this screen; it is written from the sign-in phone board (`design/handoff/auth/Sign in - Mobile.html`, see [auth.md](auth.md)) and built from this text. It awaits the owner's review. The phone layout is `@media (max-width: 820px)` in `styles/auth.css`, the same structure as the desktop panel: the course on top (392px) and an ivory sheet from 352px that carries the panel.

Route: `/golf/coach`. Steps `CProgram`, `CProfile`, `CDone` in `Onboard`, the sign-up flow's own frame ([auth.md](auth.md)).

## Layout

One question at a time on the stationery sheet over the course, "1 of 2" over a hairline that fills. The coach's member card is not drawn on the phone until the last step (as in sign up), where it arrives with "Member since".

1. Program: school (required), division as six tiles (optional, tap again to clear), conference, city and state, team (Men's or Women's) and an optional team name whose blank default is said ("Left blank, it's called Pine Needles University Golf").
2. Profile: first and last name, title, an optional photo (one row, "Add a photo").
3. Done: "<school> is ready.", the team code in its boxes, Copy code and Copy invite link, then "Invite players" (the roster) and "Go to your dashboard".

## States

Checking the account (the sign-in room holds the place; a coach who belongs elsewhere is sent there without the questions flashing). A refused save keeps every answer. A draft is kept in this tab and picked up where it was.

## Gestures, haptics, keyboard

No gestures. Select on a tile, press on Create program, success when the program exists and when a code is copied, warning for a missing answer, error for a failed save or upload. Copy says "Copied" only when it copied.
