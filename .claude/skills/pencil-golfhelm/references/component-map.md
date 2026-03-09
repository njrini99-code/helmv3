# Pencil Component Map — Lunaris × GolfHelm

> Complete mapping of all 101 Lunaris components to their Pencil IDs, descendant structure, and GolfHelm usage patterns.

---

## Buttons

### Button/Default (Primary) — `ZETEA`
**Type:** frame (reusable)
**Descendants:** Text label child
**Usage:** Primary CTAs — "Add Round", "Save", "Generate Insights"
**Customization:**
```javascript
btn=I(parent, {type: "ref", ref: "ZETEA"})
U(btn+"/[label-child-id]", {content: "Add Round"})
```

### Button/Secondary — `U83R7`
**Usage:** Secondary actions — "Cancel", "View Details", "Export"

### Button/Ghost — `Svd9t`
**Usage:** Tertiary/navigation actions — breadcrumbs, inline links, "See All →"

### Button/Outline — `4x7RU`
**Usage:** Alternative actions — "Filter", "Sort", toggle views

### Button/Destructive — `ftEoU`
**Usage:** Danger actions — "Delete Round", "Remove Player", "Archive"

### Button/Link — `hJyQf`
**Usage:** Text-only link styled as button

### Button/Large/Default — `ZGI9Z`
**Usage:** Hero CTAs on marketing creatives — "Get Started Free →", "See It In Action"
**Note:** Use this for IG post/story CTA buttons, NOT regular Button/Default

### Button/Large/Secondary — `1S4cN`
**Usage:** Large secondary actions on marketing or landing pages

### Button/Large/Ghost — `dhdaO`
**Usage:** Large tertiary on marketing pages

### Button/Large/Outline — `s8RFP`
**Usage:** Large alternative on marketing pages

### Button/Large/Destructive — `Y4mMU`
**Usage:** Large destructive (rare)

### Button/Large/Link — `0MJt3`
**Usage:** Large link-style button

---

## Input Fields

### Input Group/Default — `gKpi4`
**Type:** frame (reusable)
**Descendants:** Label text + input frame + helper text
**Usage:** Empty form fields — score entry, player name, notes
**Customization:**
```javascript
input=I(parent, {type: "ref", ref: "gKpi4", width: "fill_container"})
U(input+"/[label-id]", {content: "Score"})
U(input+"/[placeholder-id]", {content: "Enter score..."})
```

### Input Group/Filled — `z6HCm`
**Usage:** Pre-filled form fields showing existing data

### Input Group/Error — `x2DLR`
**Usage:** Validation error state — red border + error message

### Input Group/Disabled — `Ws5tB`
**Usage:** Read-only/locked fields

### Select Group/Default — `XhJWF`
**Usage:** Dropdown selects — course picker, player selector, date range

### Select Group/Filled — `hMKV2`
**Usage:** Pre-selected dropdown

### Textarea Group/Default — `QFzE8`
**Usage:** Multi-line input — notes, AI feedback, messages

### Textarea Group/Filled — `MH8uI`
**Usage:** Pre-filled textarea

### Search Box/Default — `T5yK2`
**Usage:** Empty search — roster search, round search

### Search Box/Filled — `Zksub`
**Usage:** Active search with query text

---

## Cards

### Card — `ERkuB`
**Type:** frame (reusable)
**Descendants:** Header area + content area + optional footer
**Usage:** Standard content container — insight cards, stat summaries, event details
**GolfHelm patterns:**
- Insight card: Card + icon + title + description + confidence bar
- Stat card: Card + label + big number + trend indicator
- Event card: Card + date badge + event name + details

### Card Image — `ksvfk`
**Usage:** Card with image header — player profile cards, course cards

### Card Action — `wg5F3`
**Usage:** Card with action buttons in footer — round summaries with "View Review" CTA

### Card Plain — `eBwLd`
**Usage:** Minimal card without header — used for nested content, list containers

---

## Data Display

### Data Table — `yLiVX`
**Type:** frame (reusable)
**Descendants:** Header row + body rows + pagination
**Usage:** Full featured data table — team stats, round history, qualifier leaderboards
**GolfHelm patterns:**
- Team stats table: columns for player name, scoring avg, GIR%, fairways, putts
- Round history: date, course, score, vs par, review link
- Qualifier leaderboard: rank, player, R1, R2, R3, total

### Table — `pPOgy`
**Usage:** Simple table container

### Table Row — `T73Cd`
**Usage:** Individual table row

### Table Cell — `uKYIj`
**Usage:** Individual table cell

### Table Column Header — `tbrR4`
**Usage:** Column header with sort indicator

---

## Navigation

### Sidebar — `d5ZTS`
**Type:** frame (reusable)
**Descendants:** Logo area + nav items + user section
**Usage:** Main navigation for coach/player dashboards
**Width:** 240px standard
**Customization:**
```javascript
sidebar=I(screen, {type: "ref", ref: "d5ZTS", height: "fill_container"})
// Override nav items:
U(sidebar+"/[nav-item-1]", {content: "Dashboard"})
U(sidebar+"/[nav-item-2]", {content: "Rounds"})
```

### Sidebar Item/Active — `dOLzc`
**Usage:** Currently active nav item (highlighted)

### Sidebar Item/Default — `X6nwq`
**Usage:** Inactive nav item

### Tabs — `Kbr4h`
**Type:** frame (reusable)
**Usage:** Tab navigation — stats periods (Season/Month/Week), view modes (Grid/List)

### Tab Item/Active — `73OPj`
**Usage:** Selected tab

### Tab Item/Default — `2r7Sj`
**Usage:** Unselected tab

### Breadcrumb Item — `nW26m`
**Usage:** Breadcrumb navigation — "Dashboard / Rounds / Round Review"

---

## Feedback & Status

### Alert/Error — `YZjRF`
**Usage:** Error messages — "Failed to save round", validation errors

### Alert/Success — `nIj3a`
**Usage:** Success messages — "Round saved", "Insights generated"

### Alert/Warning — `vbyqV`
**Usage:** Warning messages — "Incomplete round data", "Low confidence prediction"

### Alert/Info — `ITZkn`
**Usage:** Informational — AI recommendations, tips, CoachHelm insights
**GolfHelm pattern:** Primary vehicle for displaying AI-generated insights

### Progress — `W4YFH`
**Type:** frame (reusable)
**Usage:** Progress/confidence bars — insight confidence %, improvement tracking, goal progress
**Customization:**
```javascript
prog=I(parent, {type: "ref", ref: "W4YFH", width: "fill_container"})
// Update fill width to represent percentage
```

### Tooltip — `xCEfn`
**Usage:** Hover tooltips — stat explanations, abbreviation definitions

---

## Form Controls

### Checkbox/Default — `Wxq1C`
**Usage:** Unchecked checkbox — task lists, multi-select

### Checkbox/Checked — `r91nP`
**Usage:** Checked checkbox — completed tasks

### Radio/Default — `Ao9E1`
**Usage:** Unselected radio — single-select options

### Radio/Selected — `u61z6`
**Usage:** Selected radio option

### Switch/Default — `wk1O8`
**Usage:** Toggle off — feature toggles, notification settings

### Switch/Checked — `zdFKu`
**Usage:** Toggle on — active features

---

## Labels & Badges

### Icon Label/Secondary — `XYdcn`
**Usage:** Neutral status badges — "Pending", "Draft"

### Icon Label/Success — `Ffti9`
**Usage:** Positive badges — "Complete", "Verified", "+2.1 improvement"

### Icon Label/Orange — `7Fif0`
**Usage:** Warning badges — "Needs Review", "Due Soon"

### Icon Label/Violet — `A58oI`
**Usage:** Info/AI badges — "AI Generated", "CoachHelm", "New Insight"

---

## Modals & Overlays

### Dialog — `cYAuh`
**Usage:** Standard dialog — confirmations, simple forms

### Modal/Center — `5JUG0`
**Usage:** Centered modal — detailed views, multi-step flows

### Modal/Center Icon — `DBtsv`
**Usage:** Modal with icon header — success/error confirmations

---

## Avatars & Identity

### Avatar/Text — `90SQo`
**Usage:** Text initials avatar — player list items, team rosters when no photo

### Avatar/Image — `4AN1p`
**Usage:** Photo avatar — player profiles, coach profiles

---

## Other Components

### Pagination — `9PVw5`
**Usage:** Page navigation — data table pagination, round history

### Dropdown — `cH4wO`
**Usage:** Dropdown menu — action menus, filter options

### List Item/Checked — `5RtqD`
**Usage:** Checked list item — completed tasks, selected filters

### Accordion/Collapsed — `QqpT7`
**Usage:** Collapsed section — FAQ, expandable details

### Accordion/Expanded — `sFr1w`
**Usage:** Expanded section showing content

### IG Post — GolfHelm v2 — `15lvJ`
**Usage:** Pre-built Instagram post template with GolfHelm branding
**Note:** This is a complete template — use as starting point for IG creatives

---

## Component Selection Guide

### By GolfHelm Feature

| Feature | Primary Components |
|---------|-------------------|
| **Player Hub** | Card (`ERkuB`), Alert/Info (`ITZkn`), Progress (`W4YFH`), Icon Label/Success (`Ffti9`) |
| **Coach Dashboard** | Sidebar (`d5ZTS`), Data Table (`yLiVX`), Card (`ERkuB`), Tabs (`Kbr4h`) |
| **Round Entry** | Input Group (`gKpi4`), Select Group (`XhJWF`), Button/Default (`ZETEA`) |
| **Round Review** | Card (`ERkuB`), Alert/Info (`ITZkn`), Progress (`W4YFH`), Icon Label variants |
| **CoachHelm Insights** | Alert/Info (`ITZkn`), Card (`ERkuB`), Progress (`W4YFH`), Icon Label/Violet (`A58oI`) |
| **Stats & Analytics** | Data Table (`yLiVX`), Tabs (`Kbr4h`), Progress (`W4YFH`), Card (`ERkuB`) |
| **Calendar** | Card (`ERkuB`), Icon Label variants, Button/Default (`ZETEA`) |
| **Roster** | Avatar/Image (`4AN1p`), Card (`ERkuB`), Data Table (`yLiVX`) |
| **Qualifiers** | Data Table (`yLiVX`), Tabs (`Kbr4h`), Icon Label/Success (`Ffti9`) |
| **Tasks** | Checkbox variants (`Wxq1C`/`r91nP`), Card (`ERkuB`), List Item/Checked (`5RtqD`) |
| **Messages** | Card Plain (`eBwLd`), Avatar/Text (`90SQo`), Input Group (`gKpi4`) |
| **Settings** | Switch variants (`wk1O8`/`zdFKu`), Input Group (`gKpi4`), Select Group (`XhJWF`) |

### By Creative Type

| Creative | Primary Components |
|----------|-------------------|
| **IG Feed Post** | IG Post template (`15lvJ`), Button/Large/Default (`ZGI9Z`), Card (`ERkuB`) |
| **Feature Highlight** | Card (`ERkuB`), Progress (`W4YFH`), Alert/Info (`ITZkn`) |
| **Stats Showcase** | Data Table (`yLiVX`), Progress (`W4YFH`), Icon Label/Success (`Ffti9`) |
| **Team Display** | Avatar/Image (`4AN1p`), Card (`ERkuB`), Data Table (`yLiVX`) |
