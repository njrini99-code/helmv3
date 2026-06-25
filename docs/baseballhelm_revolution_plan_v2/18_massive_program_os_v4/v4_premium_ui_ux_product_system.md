# V4 Premium UI/UX Product System

This product should look and feel like a professional sports technology company with serious engineering resources built it. The visual quality target is not "nice SaaS dashboard." The target is a polished team operations cockpit that a college head coach, director of ops, strength coach, and player would trust immediately.

## Visual Direction

Use a restrained professional sports operations aesthetic:

- neutral base
- off-black text, never pure black
- one desaturated accent
- clear status language
- dense staff tables
- mobile player simplicity
- source badges
- role-safe visibility labels
- tactical spacing
- no generic hero marketing layout inside the app
- no neon gradients
- no AI-purple glow
- no cartoon baseball gimmicks

Recommended palette:

- background: zinc-50 or slate-50
- surface: white or zinc-25
- staff workspace panels: zinc-950 text on zinc-50
- borders: zinc-200 / slate-200
- accent: muted green, steel blue, or deep red depending brand
- warning: amber with restrained background
- critical: red, used sparingly
- success: green, used sparingly

Typography:

- Geist or Satoshi style sans
- mono for numbers, stats, timestamps, import row counts
- no serif dashboard UI
- no oversized landing-page H1s inside app

## Layout Principles

### Staff Desktop

Staff views should be dense but calm.

Use:

- max-width around 1400px where content benefits
- full-width operational tables when needed
- split panes
- sticky filters
- left navigation or app shell
- command palette
- source drawers
- row actions
- keyboard-friendly controls

Avoid:

- card grids where every metric is boxed
- huge whitespace on operational screens
- hero sections in dashboard routes
- marketing copy inside app

### Player Mobile

Player views should be action-first.

Use:

- bottom navigation
- large tap targets
- clear status
- single primary action per card
- today-first ordering
- no dense staff tables

Avoid:

- player access to staff dashboards
- too many tabs
- raw data dumps
- scary risk labels

### Showcase/Public Profile

Showcase/player public profile should feel premium and inspectable:

- verified metric badges
- video/document sections
- source labels
- clean profile header
- event history
- privacy controls

It should not look like a youth sports recruiting template.

## Component System

Build a coherent component vocabulary.

### Core Components

`ProgramShell`

- route shell for baseball dashboards
- program/team selector
- role-aware navigation
- command palette trigger
- notification/signal indicator

`RoleGate`

- server-aware capability wrapper
- never only client-side for security

`SourceTrustBadge`

- labels data source:
  - official
  - device export
  - staff entered
  - player entered
  - imported
  - AI-derived
  - unreviewed

`SourceDrawer`

- shows source objects, import rows, timestamps, uploader, confidence, visibility

`SignalCard`

- signal type, severity, source, owner, action, disposition

`SignalInboxTable`

- filterable dense staff table

`PlayerStatusPill`

- available, limited, unavailable, review, no check-in

`VisibilityPill`

- player-visible, staff-only, restricted, public

`ImportDossierPanel`

- import status, warnings, errors, rows, affected objects, rollback

`AIInsightCard`

- title, summary, confidence, source refs, action, disposition

`TimelineEventCard`

- event type, source, visibility, timestamp, related object

`PracticeBlockRow`

- time, duration, activity, group, staff owner, source reason

`LiftAssignmentCard`

- lift title, due time, status, group, completion

`ReadinessFlagRow`

- player, status, sources, practice impact, action

## Screen Systems

### Command Center UI

Layout:

- top context bar
- left primary nav
- main grid:
  - Daily Brief wide panel
  - Signal Inbox
  - Today Schedule
  - Practice Status
  - Availability Board
  - Import Health
  - Postgame Review

Density:

- high staff density
- row-based signals
- fewer decorative cards

Interaction:

- signals can be assigned/resolved
- AI brief has source drawer
- practice status links to planner
- import warnings link to import dossier
- player names open peek panel/profile

### Player Today UI

Layout:

- date and next event
- required action stack
- lift/practice card
- check-in card
- player-visible development focus
- schedule list

Tone:

- direct
- supportive
- no staff jargon

Interaction:

- acknowledge
- complete check-in
- ask for help
- view plan
- view own profile

### Performance UI

Strength coach desktop:

- compliance board
- readiness board
- lift session table
- player group filters
- source-dense import cards

Player mobile:

- today's lift
- logging form
- check-in
- completion history

Head coach:

- practice impact summary
- limited/unavailable list
- no-check-in list

### Import UI

Stepper:

1. source/type
2. upload
3. column map
4. player match
5. validate
6. preview
7. commit
8. result/rollback

Important UX:

- raw row and mapped row side-by-side
- warnings not hidden
- low-confidence matches surfaced
- duplicate file warning prominent
- no auto-commit
- source badge created at commit

### Practice Planner UI

Layout:

- practice header
- intelligence panel
- block builder
- player groups
- staff assignments
- availability panel
- publish/recap actions

Actions:

- convert signal to block
- add limited player note
- assign staff owner
- publish to players
- mark attendance
- complete recap

### Staff Meeting UI

Layout:

- agenda sections
- player discussion list
- open decisions
- unresolved signals
- action item creation
- source-backed source-backed action recommendations

Interaction:

- convert agenda item to task
- add player note
- mark discussed
- export summary

## Empty States

Empty states must help users get value.

Command Center empty:

- no roster: import roster or seed demo
- no schedule: import schedule or add first event
- no signals: "No open signals. Practice and import status are current."

Performance empty:

- no lift data: import strength sheet or create lift assignment
- no check-ins: enable check-in prompt or invite players

Practice empty:

- create practice from event
- use template
- create from recent signals

Import empty:

- show templates and supported sources

Player Today empty:

- "No required actions today" plus next scheduled event

## Loading States

Use skeletons matching actual layout:

- signal rows
- player cards
- timeline entries
- import stepper
- practice blocks
- lift board rows

Avoid generic spinners for primary content.

## Error States

Errors should be scoped:

- roster failed
- imports failed
- AI unavailable
- source refs unavailable
- permission denied

Each error should include:

- what failed
- retry action
- fallback if possible
- no stack traces

## Motion And Interaction

Motion should feel professional, not playful:

- subtle row reveal
- tactile button active states
- sheet/drawer transitions
- source drawer slide
- command palette reveal
- no heavy animated backgrounds in app

Performance guardrails:

- animate transform/opacity
- isolate client components
- avoid constant re-render loops
- no scroll hijacking in app dashboards

## Data Table Standards

Tables should support:

- search
- filter
- sort
- density control later
- row actions
- sticky header
- source badges
- status chips
- bulk actions where needed

Numbers:

- mono font
- aligned decimals
- clear units

## Form Standards

All forms:

- labels above inputs
- helper text for confusing fields
- inline errors
- required/optional clear
- save/cancel
- dirty state
- optimistic update only where safe

## Accessibility

Requirements:

- keyboard navigation
- visible focus
- color not sole signal
- ARIA labels where icon-only
- touch targets for mobile
- readable contrast

## Professional Polish Checklist

Every primary page must pass:

- no placeholder content
- no generic chart filler
- no broken mobile layout
- no overflowing table text
- no tabs that lead to dead surfaces
- no AI card without source
- no unclear primary action
- no feature hidden only client-side
- no player view leaking staff data

## Product "20M" Standard

The product should feel expensive because:

- navigation is role-aware
- data has provenance
- AI is grounded
- staff workflows are dense and efficient
- player workflows are simple
- imports are trustworthy
- settings are real
- program types are tailored
- every page has good empty/error/loading states
- design language is consistent
- there is no filler.
