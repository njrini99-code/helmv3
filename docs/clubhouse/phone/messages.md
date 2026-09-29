# Phone design: Messages (coach and player)

Status: draft (awaiting owner approval)

The native pattern: a conversation list that pushes to a full-screen thread.

## List
1. Large title "Messages"; trailing action: New message.
2. Search, then All, Unread and Groups as a segmented control.
3. Conversations in Today, This week and Earlier sections; 72px rows with avatar or group mark, name, time and a two-line preview; unread count in green. Swipe left on a row to mark read or unread (when supported), with a light haptic.

## Thread
- Pushes over the list with the tab bar hidden (immersive), back chevron in the top bar with the conversation name and member line; the info button opens Details as a sheet.
- Bubbles up to 80% width; long-press a bubble for the reaction bar and Edit or Delete (own messages), with a press haptic, replacing desktop hover tools.
- Composer pinned above the keyboard, with the attach button (camera, photo library, files via the native picker) and Send. Return inserts a new line on phone; Send is the button.
- New messages arriving while scrolled up show a "New messages" pill instead of jumping.

## New message
A full-height sheet: Direct (and Group for coaches), search, and the people list with 56px rows.
