# Phone: Auth (sign in, welcome, sign up, onboarding)

Status: approved. The owner's mobile boards are the spec: `Sign in - Mobile.html` (ten phones: sign in, four errors, three welcomes, two empty welcomes) and `Sign up - Mobile.html` (twenty phones: every step, the errors and the empty states) in `design/handoff/auth/`, with `screenshots/mobile/`, handed off with the desktop design and answered by Q-96. The boards win over any prose here. Sign up and onboarding are phase 2; this file covers what is built.

The phone layout is `@media (max-width: 820px)`, the same breakpoint as `useChPhone`, in the same stylesheet as desktop (`styles/auth.css`): the screens are one structure, and CSS turns the right-hand panel into a sheet under the course.

## Board to component

| Board | Component and behaviour |
| --- | --- |
| Sign in: the course on top (392px), the GolfHelm mark and "GolfHelm for college golf." over it, an ivory sheet from 352px with "Sign in", one line, grouped email and password rows, the button, "Forgot password?", "New here? Create an account", Privacy and Terms, "A Helm Sports Labs product" | `SignIn` over the same DOM as desktop. The sheet's two inputs are one white group (`.ch-au-fields`) with a hairline between the rows; the visible labels are kept for assistive technology and hidden on the phone; the forgot link moves under the button (there are two links in the markup and CSS shows one). The top bar's Home link and the wordmark lockup are desktop only |
| Four sign-in errors (wrong password, no connection, too many attempts, email not verified) | `AuthNotice` under the group: danger, danger, warning, warning. A credentials refusal rings the whole group in red (`data-invalid`), as the board does (CH-15001) |
| Welcome: coach at sunrise, player at golden hour, night with the name lookup failed | `Welcome` over the full-screen course, with the camera slid 180 units so the clubhouse is centred (the board's framing) and scaled 1.06. The type flips to ivory after dark |
| Welcome empty: all caught up, first sign-in | `NewsEmpty` (CH-15301, CH-15302), the list stacked one item to a row |
| Continue | The one big button on the card (52px). There is no Return hint on the phone |

## Gestures and haptics

No gestures. Sign in is tapped (light), a sign-in landing is success, a refusal is warning or error by kind, and Continue on the welcome is medium (CH-15701 to CH-15705), through `src/clubhouse/lib/haptics.ts`.

## Phone notes

- Every control is 44 x 44 or has a hit area that reaches it (the password eye and both links extend past their drawn size); text fields are 16px so iOS does not zoom.
- The sheet pads its bottom by `var(--keyboard-height)` and scrolls the button into view when a field is focused, so the keyboard never covers the field or the button.
- The App Store build hides "Home" and "Create an account" (CH-15905).
- The hand-off on the phone is a fade to the canvas colour, then the destination. The board draws a sheet rising to the dashboard's hero with the card flying into the tab bar; that needs the dashboard mounted under the welcome, which a route change cannot do, so it is not built (`pages/P015-auth/DESIGN.md` "Not built").
- Not yet: a pass on a real iPhone (keyboard, safe areas, haptics felt, the course's frame rate).
