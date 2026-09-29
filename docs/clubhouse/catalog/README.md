# Clubhouse state catalog

Every error, empty state, loading state, confirmation, motion, haptic and
accessibility behaviour on every Clubhouse page has a number. The number is
stable: it is never reused, and a removed row stays in its table marked
retired. Later it becomes the key the Helm Bridge groups on; for now it lives
in the UI as `data-ch-code="CH-8001"` so tests (and anyone inspecting the
page) can find it. It is not sent to Sentry yet.

## Numbering

`CH-` plus four digits. The first digit is the page, the second the kind.

| First digit | Page |
| --- | --- |
| 1 | Shell (sidebar, top bar, bell, offline, shared behaviour) |
| 2 | Home |
| 3 | Roster |
| 4 | Stats (team) |
| 5 | Stats (player) |
| 6 | Calendar |
| 7 | Messages |
| 8 | Settings |

| Second digit | Kind | What it means |
| --- | --- | --- |
| 0 | Error toast | Something the person did didn't save or send |
| 1 | Validation | A form message shown before anything is sent |
| 2 | Didn't load | A section's data failed to load: an inline notice with Try again |
| 3 | Empty | There is nothing to show yet, and what to do about it |
| 4 | Loading | Skeletons and in-progress states |
| 5 | Confirm | A question asked before something destructive or unsaved is lost |
| 6 | Motion | A micro animation and its duration |
| 7 | Haptic | A tap felt in the iOS app |
| 8 | Accessibility | Keyboard, screen reader and contrast behaviour |
| 9 | Network and UX | Offline, slow, and signals of a confusing experience |

So `CH-8001` is Settings, error toast, number one.

## How each row is written

| Column | Meaning |
| --- | --- |
| # | The number |
| When | What the person did or what happened, in plain words |
| They see | The exact words (or the visible behaviour) |
| How | The mechanism: component, hook, duration, haptic |
| Test | Where it is forced in CI (`src/clubhouse/__tests__/…`) or `preview` when checked in the preview only |

Pages: [shell](shell.md) · [settings](settings.md). Home, Roster, Stats,
Calendar and Messages are added one page at a time, each reviewed by the
owner before the next.
