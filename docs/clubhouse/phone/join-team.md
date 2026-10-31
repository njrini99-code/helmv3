# Phone: Join a team (code, then confirm)

Status: draft, 2026-10-19. No owner board exists for this screen; it is written from the sign-in phone board (`design/handoff/auth/Sign in - Mobile.html`, see [auth.md](auth.md)) and built from this text. It awaits the owner's review. The phone layout is `@media (max-width: 820px)` in `styles/auth.css`, the same structure as the desktop panel: the course on top (392px) and an ivory sheet from 352px that carries the panel.

Routes: `/golf/join` (`JoinCode`) and `/golf/join/[code]` (`JoinTeam`, `JoinInvalid`).

## Layout

1. The code: heading "Join a team", one line, then the code as one box per character (eight and a dash; ten for an older team's longer code), 52px boxes over a single real input, so a tap anywhere is a tap in the field. The keyboard is the text keyboard in capitals, with the one-time-code suggestion.
2. Paste fills every box at once; a pasted invite link gives up the code it carries. Under the boxes one quiet line says what to do or how far along it is. Continue is always lit; an empty or too-short code is said in a notice and the boxes ring.
3. Confirm: heading "Join {team}", the program, place and season on one line, then two rows between a hairline: the team, and who is joining (with their class and address) and "Not you?". "Golf players are on one team at a time." Key "Join {team}", then "Not now".

## States

Invalid code: "That code doesn't match a team", one key "Try another code". Already on this team: "You're already on {team}". On another team: the server's own sentence as a warning. Joined: "You're on {team}", then the dashboard. "Not you?" ends the session and comes back to this link after sign in.

## Gestures, haptics, keyboard

No gestures. Press on Continue and Join, success when joined, warning for a code problem or being on another team, error for a failed join.

## Not here

The coach's name is not shown: the team lookup the page uses returns the program and place, not the coach.
