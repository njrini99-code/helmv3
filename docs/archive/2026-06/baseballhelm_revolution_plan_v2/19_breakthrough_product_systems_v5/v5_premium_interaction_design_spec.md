# V5 Premium Interaction Design Spec

This file defines the product feel. The app should feel expensive because the interactions are precise, not because it uses decorative effects.

## Design Personality

BaseballHelm should feel:

- serious
- fast
- clean
- athletic
- data-literate
- source-trustworthy
- premium

It should not feel:

- youth-sports cute
- generic admin
- AI-purple
- neon
- over-carded
- marketing-first

## Signature Interactions

### 1. Source Drawer

Any source badge opens a drawer.

Drawer contents:

- source type
- file/import/run
- source row
- uploader
- timestamp
- confidence
- related objects
- audit trail

This interaction becomes a product signature: trust is always one click away.

### 2. Convert To Action

Every signal has a conversion menu.

Menu:

- Create task
- Add to practice
- Add to staff meeting
- Add coach note
- Request player action
- Mark reviewed

This is the main "magic" interaction.

### 3. Player Peek

Clicking a player opens a peek panel:

- status
- today actions
- current signals
- latest timeline
- next event
- quick note

Should reuse existing `peek-panel` components and upgrade them.

### 4. Practice Drag-In

Practice Intelligence rail lets staff drag a signal into the practice outline.

If drag is too much for first implementation:

- one-click "Add to practice block"

### 5. Meeting Mode

Meeting mode should feel like a focused workspace:

- agenda left
- player/source detail right
- action strip bottom

Marking an item discussed should feel satisfying and persist state.

### 6. Player Today Stack

Player mobile should use a stack of required actions:

- next action first
- secondary actions below
- completed actions collapse

### 7. Import Review Table

Import review should feel like a professional data QA tool:

- sticky header
- raw/mapped toggle
- warning/error filters
- player match confidence
- affected object preview

## Screen-Level Signature

Command Center:

- first screen is not a grid of KPI cards
- it is a command board:
  - brief
  - signals
  - today
  - practice
  - availability

Performance:

- strength coach sees rows and actions, not inspirational graphics

Player Today:

- one action at a time

Showcase profile:

- polished proof packet with source labels

## Microcopy Standard

Use direct operational language:

- "Review before bullpen"
- "Add to practice"
- "Source conflict"
- "Player-visible"
- "Staff-only"
- "Needs acknowledgement"
- "Low-confidence match"
- "No mound work"
- "Publish practice"

Avoid:

- "unlock potential"
- "optimize athlete journey"
- "next-gen insight"
- "seamless ecosystem"

## UI Acceptance

The UI fails if:

- cards have vague labels
- AI outputs have no sources
- staff has to hunt for actions
- players see staff language
- imports look like a generic upload page
- strength coach workflow is buried
- showcase profile looks unverified

The UI passes if:

- every important thing has a next action
- every claim has a source
- every role sees less, not more
- every page feels intentional
