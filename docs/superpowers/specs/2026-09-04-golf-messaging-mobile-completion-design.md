# Golf Messaging mobile completion design

<!-- markdownlint-disable MD013 -->

**Date:** 2026-09-04  
**Status:** Owner direction approved; implementation plan pending review  
**Scope:** GolfHelm Messaging on the existing `agent/messages-instant-entry` PR

## Purpose

Finish the premium mobile Messaging rebuild so it feels like a native Helm
communication surface rather than a dashboard panel containing a web chat.
The experience must be calmer, people-first, and immediately legible while
preserving the mature realtime, history, attachment, read-state, and
bottom-anchor behavior already in the feature.

This is not a visual clone of the supplied references. Their useful qualities
are breathable composition, real people as anchors, compact controls, soft
depth, and a single dominant task. Helm expresses those qualities with the
shipped warm Fairway token system and iconography; it does not borrow their
purple/blue palettes, generic glass cards, voice-note features, or branding.

## Product outcomes

1. The inbox reads as a conversation list, not an administrative rail.
2. A mobile thread is the screen. It does not sit inside a framed panel.
3. A player can start a direct message or a private group from eligible team
   members. Coaches retain a distinct official team-channel flow.
4. Sending is immediate and recoverable: a failed message remains visible and
   can be retried.
5. Opening a conversation always starts at the newest relevant message; it
   never first consumes a hidden mobile layout and lands at history start.
6. Movement explains state: no decorative page animations, list-wide fades, or
   persistent scrolling glass.

## Mobile information architecture

```text
FairwayMessagesMobile
├─ MessagesInbox
│  ├─ MessagesRootNavBar                Messages + compose action
│  ├─ SearchField                       stable, compact inbox search
│  ├─ MessageFilterStrip                All / Unread n / Teams only when useful
│  └─ ConversationList
│     └─ ConversationRow                PressTarget + Avatar or AvatarGroup
│
├─ ConversationScreen
│  ├─ FairwayMessageNavBar              back, identity, optional overflow
│  ├─ MessageList                       native overflow scroll
│  │  ├─ DateLandmark / UnreadLandmark
│  │  ├─ MessageGroup
│  │  │  ├─ SenderIdentity and Avatar
│  │  │  ├─ MessageBubble[]
│  │  │  └─ MessageMeta / reactions
│  │  └─ TypingIndicator
│  ├─ NewMessagesButton
│  └─ FairwayMessageComposer
│
└─ NewConversationSheet
   ├─ Direct recipient mode
   ├─ Private group recipient mode + title
   └─ Coach-only official team-channel entry point
```

Desktop may continue composing the inbox and thread as a two-pane workspace.
The mobile presentation must not inherit an `InstrumentPanel` or rail-card
shell merely because desktop needs a boundary.

## Inbox composition

The root is intentionally sparse:

```text
Messages                                                compose
Search messages
All     Unread 2     Teams

[avatar] Cole Bennett                              9:12
         Bring rain gear                              2
[avatar stack] 26–27 Group Chat                     Yesterday
               Coach moved practice to 3:30
```

- The root header has one visible trailing action: compose. Secondary creation
  choices appear after the tap in a Sheet.
- Use `SearchField`, not a hand-styled generic input. Search focus must not
  move the list or add a second visual container.
- Filters are compact Fairway pills. They stay only if they solve a real inbox
  task; the chosen material moves between pills rather than each pill becoming
  a heavy segmented card.
- A conversation is a `PressTarget`, not a ghost `Button`. Rows are 68–76px,
  with a 44–48px real avatar, a clear name, a quiet one-line preview, and one
  restrained unread treatment. Rows have no individual card perimeter.
- Direct conversations use an `Avatar`; groups use `AvatarGroup` with a
  meaningful fallback. A generic people glyph and an `Unknown User` flash are
  not acceptable where participants are known.
- Normal recency controls ordering. A realtime message updates preview,
  timestamp, and unread state in place, then the row glides to its server
  ordered position. The whole list never fades or rebuilds.

## Conversation composition

On mobile, selecting a conversation makes it a full, flat canvas. The header
is 48–54px below the safe area:

```text
‹ Messages            [avatar / avatar stack]  Group name          …
```

The conversation header contains no second title, subtitle masthead, or
instrument-panel vocabulary. Pressing identity opens a Fairway Sheet for
existing thread actions and future details; it is not a persistent settings
dashboard.

Messages have a 76–80% maximum width, 16–17px normal body type, quiet normal
sans timestamps, 2–3px within-sender gaps, and 12–16px gaps between sender
groups. Bubble geometry is explicit:

```text
position: single | first | middle | last
outer radius: 19–20px
connected radius: 6px on the sender side
```

Incoming sender identity and a 28–32px avatar appear only for a new sender
group; the avatar aligns with the final bubble. Date and unread landmarks are
calm labels, not telemetry dividers. Short histories remain visually anchored
near the composer without absolute positioning. The existing native scroll,
image-load handling, resize observation, history prepending, and near-bottom
rules remain the authority for scroll behavior.

## Composer and send states

`FairwayMessageComposer` is a chat-specific component rather than a reskinned
form textarea. Its resting geometry is compact:

```text
[ plus ]    Message…                                      [ up ]
```

- The native textarea begins at 42–44px, grows upward to five or six visible
  lines, then scrolls internally. The composer is anchored to keyboard and
  safe-area geometry through the existing Capacitor/Fairway mechanisms.
- A plus control opens one Fairway Sheet for current supported attachments;
  upload state belongs in a small attachment strip above the field.
- On send commit: snapshot draft, stop typing, light haptic, insert the
  optimistic message, clear and collapse the composer in the same React turn,
  then persist underneath. The send control never becomes a form-style busy
  spinner for plain text.
- State belongs to the bubble: `sending`, `sent`, `read`, `failed`,
  `waiting-to-send`. The latest meaningful outgoing group owns metadata. A
  server-returned error marks the in-place optimistic message failed; it must
  never remove that message. Retry changes its metadata to sending without
  reinserting it.
- Reply creation validates that the reply target is in the same readable,
  non-deleted conversation before persistence. This is an integrity check,
  not a UI assumption.

## Direct, private-group, and official-channel creation

Compose opens a full-height mobile Sheet with a simple mode choice:

```text
Direct                             Group
Search teammates
[avatar] person row      selected people become a compact avatar strip
```

- **Direct** chooses one eligible teammate and uses the existing duplicate-DM
  behavior.
- **Group** chooses two or more eligible teammates, gives the group a concise
  title, then calls the existing multi-participant creation contract.
- Eligibility remains enforced by the current server-side team-audience
  wrapper. This is a UI capability addition, not a permission or schema
  weakening.
- Coaches retain a separately labeled official **Team channel** action that
  reuses the picker language but communicates that it is an official team
  conversation, not a peer-created private group.

## Interaction and motion map

All motion uses existing `framer-motion` and chat-specific constants. Historic
messages render with `AnimatePresence initial={false}`. Layout motion uses
`layout="position"` so text does not scale or distort. Native scroll remains
outside Lenis.

| State change | Treatment | Feedback |
| --- | --- | --- |
| Row press | 80ms warm-tint press, optional `.995` scale | selection haptic |
| Open thread | compact mobile push/fade; header is stable | none |
| Filter select | selected material glides in 120–160ms | selection haptic |
| Own send | bubble starts opacity 0, y 8, scale .985; settles in 150–180ms | light haptic |
| Same-sender message | previous final bubble settles to middle; new bubble is final | none |
| New sender | avatar, name, and bubble arrive together with tiny y/opacity motion | none |
| Inbox reorder | `LayoutGroup` position spring, 190–230ms | none |
| Read / sent / failed | metadata crossfade in reserved geometry | none |
| New messages control | floating chrome enters in 130–160ms | selection haptic on jump |
| Sheet | canonical Fairway/Vaul behavior | no custom page choreography |

Motion is interruptible, short, reduced-motion safe, and tied to a state
change. This follows the platform principle that motion conveys feedback and
status rather than decoration.[^apple-motion] The project must not use
`transition-all`, bounce normal chat bubbles, animate blur, run Lenis in the
message list, or use GSAP for ordinary chat state.

## Installed-kit decision matrix

| System | Use | Deliberate exclusion |
| --- | --- | --- |
| `PressTarget` | conversation rows, people-picker rows, compact chat actions | generic pill-button row treatment |
| `Avatar` / `AvatarGroup` | real identity in inbox, thread, and private groups | generic group glyphs with known people |
| `Badge` + NumberFlow | unread, reaction, selected-recipient, and seen counts | timestamps and every metadata value |
| `SearchField` | inbox and recipient search | chat composer |
| Fairway `Sheet` / Vaul | creation, attachment choices, context/details | a separate drawer library or overlay stack |
| `GlassSurface` | at most floating new-message chrome or later in-app banner | bubbles, list rows, composer, nested panels |
| Framer Motion | state-driven bubble insertion and position-only layout | historical-message entrance or a second animation engine |
| Capacitor Haptics | send, selection, retry/reaction confirmation | typing, scroll, read receipts, incoming message |
| Capacitor Keyboard | native keyboard/safe-area lifecycle | manually animating the whole page for the keyboard |
| cmdk / CommandMenu | future anchored `@` mentions only when backed by real mention behavior | Slack-like slash-command scope in this delivery |
| Lucide | one icon language, 16px metadata / 20px actions | mixed inline SVG styles |
| dnd-kit, GSAP, Lenis | none for core messaging | manual normal ordering, basic bubble animation, chat scrolling |

The touch surfaces respect the iOS 44px target guidance.[^apple-accessibility]
The Motion layout strategy follows the library’s transform-based layout and
scroll-container guidance.[^motion-layout]

## Reliability repairs in this delivery

1. **Visibility-aware initial positioning.** A hidden mobile thread must not
   consume its initial-scroll sentinel. It becomes eligible only once it has a
   meaningful visible viewport; opening the previously selected thread then
   positions at the latest message.
2. **Server error preservation.** A resolved send action error marks the
   optimistic bubble `failed`; no `filter` removes it before the error state
   can appear.
3. **Reply-boundary validation.** The server verifies `reply_to_id` belongs to
   the target conversation and remains readable before insert.
4. **Known-person loading.** Conversation identity renders a deliberate
   skeleton/fallback rather than a visible `Unknown User` flash.

No production migration is part of this delivery. The existing production
schema additions are already recorded there and must not be applied again.

## Verification plan

- Unit/component regressions for hidden-to-visible initial bottom scroll,
  resolved server send errors, retry state, cross-thread reply rejection, group
  creation input, sender grouping, and motion-safe rendering.
- Render actual React components through the existing server-render/Tailwind
  screenshot harness; never validate with hand-written HTML stand-ins.
- Screenshot scenarios: inbox default/unread/group/long names; short and long
  DM; group typing; sending/failed/read; scrolled-up new messages; new-group
  sheet; thread at keyboard geometry.
- Overflow lab at 320, 360, 375, 390, 393, 402, 414, and 430px, asserting no
  document-width overflow and exercising long names, URLs, attachments,
  emoji, replies, high unread counts, and group titles.
- Run affected feature tests, a11y/E2E message flows, typecheck, lint,
  knowledge checks, and a production build.
- Physical iPhone QA is a release prerequisite for composer safe-area,
  Capacitor keyboard resize, group creation, long press/reaction, and incoming
  message anchoring. Browser evidence does not replace it.

## Non-goals

- No clone of the supplied references, fabricated presence, voice notes, or
  unsupported structured actions.
- No new chat UI kit, animation library, drawer library, schema migration, or
  permission broadening.
- No production deployment, promotion, or reapplication of existing
  production migrations.
- No claim that an unrehearsed physical-device behavior is verified.

[^apple-motion]: Apple, [Motion](https://developer.apple.com/design/human-interface-guidelines/motion?changes=_2_2).
[^apple-accessibility]: Apple, [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
[^motion-layout]: Motion, [Layout animations](https://motion.dev/docs/react-layout-animations).
