# Modern SaaS Dashboard Design

Research-backed guidance for building premium dashboards—decision surfaces that help users monitor, detect anomalies, and take action.

---

## What a Dashboard Is

NN/g defines dashboards as collections of data visualizations in a single-page view providing at-a-glance information users can act on quickly.

**Three modes**:
1. **Monitoring** — Are we on track? What changed?
2. **Diagnosis** — Why did it change? Where is it coming from?
3. **Action** — What do I do now? Who/what do I change?

**Key insight**: Design around workflows, not chart types your library offers.

---

## The Overview → Detail Contract

Premium dashboards establish a predictable structure:

```
┌─────────────────────────────────────────────────┐
│  KPI ROW (3-7 key metrics with deltas)          │
├─────────────────────────────────────────────────┤
│  TREND BAND (1-3 charts answering "why")        │
├─────────────────────────────────────────────────┤
│  DETAIL SURFACE (table/list where users act)    │
└─────────────────────────────────────────────────┘
```

**Responsive behavior**:
- KPI cards wrap
- Charts stack
- Detail surface becomes dedicated tab/route on mobile

---

## Bento Layouts

Modular cards of varied sizes that encode hierarchy visually.

**Rules**:
- Card size = importance (big cards answer most important questions)
- Every card needs a job statement ("I answer X")
- Cards that can't justify their job should be removed or merged

**Failure mode**: "Box soup" — everything is a card of equal weight, feels generic.

---

## Data Visualization

**Choose charts by task, not taste**:

| Task | Chart Type |
|------|------------|
| Change over time | Trend lines |
| Comparison | Bars |
| Composition | Stacked bars, pie (sparingly) |
| Distribution | Histograms |

**Premium trends**:
- Fewer heavy gridlines
- Fewer legends, more direct labeling
- Clear annotation around anomalies
- Goal: faster comprehension, not decorative minimalism

---

## Tables Are the Workbench

In B2B SaaS, dashboards often end in a table (accounts, tickets, devices, invoices, users).

**User tasks**:
- Find records
- Compare rows
- View/edit a record
- Take actions (including bulk)

**Required table UX**:
- [ ] Sticky headers
- [ ] Column sorting
- [ ] Multi-select
- [ ] Row actions
- [ ] Bulk actions
- [ ] Pagination
- [ ] Loading states
- [ ] Empty states

**Visual style**: Quiet. Consistent row height, subtle dividers, strong alignment, typography-led hierarchy.

**Critical rule**: Keep tables on solid or near-solid surfaces. Dense + translucent = readability trap.

---

## Progressive Disclosure

Dashboards accrete controls (filters, segments, exports, saved views, comparisons, alerts). If everything is visible, the page becomes intimidating and template-like.

**Pattern**: Primary info/actions in main view; advanced controls in secondary surfaces:
- Expandable filter drawers
- "More filters" sheets
- Context panels
- Advanced sections

**Result**: Calm for new users, powerful for experts.

---

## Command Palette (⌘K / Ctrl+K)

High-leverage feature for complex products. Lets users navigate and trigger actions without hunting through menus.

**Capabilities**:
- Navigate to any page
- Trigger actions (create, invite, export)
- Surface recent items
- Access saved views

**Premium signal**: Makes dashboard feel faster and more deliberate—"expensive" usability in complex tools.

---

## Dashboard Checklist

### Layout
- [ ] Clear KPI row (3-7 metrics with deltas)
- [ ] Trend band answering "why"
- [ ] Detail surface (table) for action
- [ ] Bento cards with semantic sizing
- [ ] Responsive behavior defined

### Tables
- [ ] Sticky headers
- [ ] Sorting, filtering
- [ ] Multi-select + bulk actions
- [ ] Row actions
- [ ] Loading/empty states
- [ ] Solid surface (no glass)

### Progressive Disclosure
- [ ] Primary controls visible
- [ ] Advanced controls in drawers/sheets
- [ ] Filter state clearly indicated

### Navigation
- [ ] Command palette (⌘K)
- [ ] Recent items accessible
- [ ] Saved views/reports

### Visual
- [ ] Glass only on chrome (nav, filters, overlays)
- [ ] Charts: direct labeling, minimal gridlines
- [ ] Consistent card radii and spacing
- [ ] Clear hierarchy (one primary focus per view)

---

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Box soup | All cards equal weight | Vary card sizes semantically |
| Glass everywhere | Readability issues on data | Glass only on chrome |
| Chart gallery | Charts without workflow purpose | Choose by task, remove decorative |
| Filter overload | All controls visible | Progressive disclosure |
| No action path | Users can't do anything | End in actionable table |
