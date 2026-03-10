# Dashboard Page Overrides — GolfHelm

> Rules here **override** `MASTER.md`. Unmentioned rules fall through to Master.

## Layout
- **Sidebar:** 240px fixed left, full-height, glass subtle bg
- **Main content:** `flex-1` with `p-8` padding
- **Card grid:** `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6`
- **Bento grid:** Mix `col-span-1` + `col-span-2` for visual rhythm

## Coach Dashboard
- Featured card (col-span-2): Intelligence Hub metrics
- Stat cards: alerts count, patterns detected, insight accuracy
- AI status: green dot + "CoachHelm Active" in header
- Quick actions: "New Round", "Review Insights", "Team Stats"

## Player Hub
- Welcome banner: Glass prominent card with name + team
- Upcoming events: Next 3 from calendar, compact cards
- Quick stats: Scoring avg, rounds played, improvement trend
- Active tasks: Checklist, max 5 items
- Recent messages: 2-3 unread previews

## Component Notes
- Stat cards: Icon Label + trend arrows (↑ green, ↓ red)
- Tables: Zebra `bg-white/40` on even rows
- Sidebar active: Green left border + lighter bg

## Spacing
- Sidebar: p-4 (tighter). Main: p-8. Card rows: gap-6.
