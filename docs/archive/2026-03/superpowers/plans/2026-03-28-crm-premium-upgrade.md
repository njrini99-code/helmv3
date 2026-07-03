# CRM Premium Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the GolfHelm CRM to premium quality across visual design, email system, and workflow cohesion — ready for real coach outreach this week.

**Architecture:** Config-first approach — update `crm-config.tsx` icons/colors first, then sweep all 22 components for visual consistency, then upgrade email composer and workflow features. Each task is independent and can run in parallel.

**Tech Stack:** Next.js App Router, Tailwind CSS (glass-premium design system), Lucide React icons, Supabase client, Resend API

---

## Chunk 1: Visual Foundation + Config

### Task 1: Replace All Emoji with Premium Lucide Icons in crm-config.tsx

**Files:**
- Modify: `src/app/golf/admin/crm/crm-config.tsx`

- [ ] **Step 1: Replace PIPELINE_STAGES emoji with Lucide icons**

Replace the 4 pipeline stage emoji (🎯💬🤝🏁) with Lucide icon components. Import `IconTarget, IconMessageSquare, IconHandshake, IconFlag` from `@/components/icons`. Each stage should have an `icon` component reference and remove the `iconLabel` emoji field.

- [ ] **Step 2: Replace STATUS_CONFIG emoji iconLabels with Lucide icons**

Replace all 7 status iconLabel emoji strings with proper Lucide icon components:
- `new_lead`: IconInbox (📥 → clean inbox icon)
- `contacted`: IconPhoneOutgoing (📞 → already correct as component, just remove emoji label)
- `engaged`: IconSparkles (✨ → already correct)
- `proposal`: IconFileText (📄 → clean document icon)
- `won`: IconTrophy (🏆 → already correct as component)
- `lost`: IconCircleX (✗ → already correct)
- `nurture`: IconSprout (🌱 → already correct)

Remove all `iconLabel` string fields — use only the `icon` component references.

- [ ] **Step 3: Replace PRIORITY_CONFIG emoji with styled icons**

Replace priority emoji:
- Normal (0): no icon (keep as-is)
- High (1): IconZap with amber color (⚡ → keep Zap but ensure it's the component, not emoji)
- Hot (2): IconFlame with red color (🔥 → replace Target with Flame icon)

- [ ] **Step 4: Add premium color palette to config**

Add a `STATUS_COLORS` export with consistent Tailwind color classes for each status:
```typescript
export const STATUS_COLORS: Record<CoachStatus, { bg: string; text: string; border: string; dot: string }> = {
  new_lead: { bg: 'bg-warm-50', text: 'text-warm-700', border: 'border-warm-200', dot: 'bg-warm-400' },
  contacted: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400' },
  engaged: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-400' },
  proposal: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
  won: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  lost: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-400' },
  nurture: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-400' },
};
```

- [ ] **Step 5: Commit**
```bash
git add src/app/golf/admin/crm/crm-config.tsx
git commit -m "feat(crm): replace all emoji with premium Lucide icons + add status color palette"
```

---

### Task 2: Visual Polish — Main Page & Sidebar

**Files:**
- Modify: `src/app/golf/admin/crm/page.tsx`

- [ ] **Step 1: Upgrade sidebar to premium glass design**

The sidebar (dark theme #1C1917) needs:
- Nav items: add `transition-all duration-200` hover states with subtle left border accent in primary color
- Active tab: primary-500 left border, bg-white/10 background
- Stats badges in sidebar: use pill-shaped badges with `bg-primary-500/20 text-primary-400` instead of raw numbers
- Section dividers: subtle `border-white/10` lines

- [ ] **Step 2: Upgrade main header area**

The sticky header above content needs:
- Glass treatment: `bg-white/70 backdrop-blur-xl border-b border-white/20`
- Tab title with icon from config (not emoji)
- Description text in `text-warm-500`
- Stat badges: pill-shaped with status colors from config

- [ ] **Step 3: Upgrade tab content wrapper**

Add consistent wrapper around each tab's content:
- `p-6` padding on content area
- Background: cream `bg-[#FFFEFA]`
- Smooth fade transition between tabs using CSS transitions or framer-motion AnimatePresence

- [ ] **Step 4: Commit**
```bash
git add src/app/golf/admin/crm/page.tsx
git commit -m "feat(crm): premium sidebar + header + tab transitions"
```

---

### Task 3: Visual Polish — Dashboard Tab

**Files:**
- Modify: `src/app/golf/admin/crm/components/CRMDashboard.tsx`

- [ ] **Step 1: Upgrade stat cards to glass-premium**

All KPI cards (Total Leads, In Pipeline, Contacted, Follow-ups Due, Hot Leads) get:
- `glass-premium rounded-2xl p-5` base
- Icon with colored background circle
- Number in `text-2xl font-bold`
- Label in `text-xs text-warm-500 uppercase tracking-wider`
- Trend indicator with green/red color

- [ ] **Step 2: Upgrade pipeline stage breakdown**

Pipeline stage cards get:
- Horizontal bar with status color from `STATUS_COLORS`
- Count on right
- Stage icon from config (Lucide, not emoji)

- [ ] **Step 3: Add "Today's Focus" section**

Add a prominent card at the top:
- Follow-ups due today (count + list of coach names, click to open detail)
- Stale leads (contacted >7 days ago with no response)
- Recent inbound leads (if any unprocessed)

- [ ] **Step 4: Upgrade "Getting Started" / quick actions area**

- Rename "Research Next 10" to "Move to Pipeline" (honest labeling)
- Glass card with clear CTA buttons
- Remove emoji from button labels, use Lucide icons

- [ ] **Step 5: Commit**
```bash
git add src/app/golf/admin/crm/components/CRMDashboard.tsx
git commit -m "feat(crm): premium dashboard with glass cards + today's focus"
```

---

### Task 4: Visual Polish — Coach Table

**Files:**
- Modify: `src/app/golf/admin/crm/components/CoachTable.tsx`

- [ ] **Step 1: Upgrade table styling**

- Header row: `bg-warm-50/50 text-xs font-medium text-warm-500 uppercase tracking-wider`
- Row hover: `hover:bg-white/60 transition-colors`
- Selection: `bg-primary-50/50 border-l-2 border-primary-500`
- Status badges: pill-shaped using `STATUS_COLORS` from config
- Priority indicators: colored dot, not emoji
- Star toggle: filled/outlined star with smooth transition

- [ ] **Step 2: Upgrade context menu actions**

- Replace emoji in context menu items with Lucide icons
- Use consistent icon sizing (16px)
- "Move to Contacted" → use status icon from config

- [ ] **Step 3: Commit**
```bash
git add src/app/golf/admin/crm/components/CoachTable.tsx
git commit -m "feat(crm): premium table styling with status color pills"
```

---

### Task 5: Visual Polish — Pipeline Kanban

**Files:**
- Modify: `src/app/golf/admin/crm/components/PipelineView.tsx`

- [ ] **Step 1: Upgrade column headers**

Each pipeline column gets:
- Status color accent bar at top (4px, using STATUS_COLORS)
- Lucide icon from config (not emoji)
- Count badge in pill shape
- `glass-premium rounded-2xl` column container

- [ ] **Step 2: Upgrade coach cards in pipeline**

Each card gets:
- `bg-white/70 rounded-xl p-3 shadow-sm hover:shadow-md transition-all`
- Coach name (bold), school (muted), division badge
- Last contacted: relative time in `text-xs text-warm-400`
- Priority dot (colored, no emoji)
- Star indicator

- [ ] **Step 3: Commit**
```bash
git add src/app/golf/admin/crm/components/PipelineView.tsx
git commit -m "feat(crm): premium pipeline kanban with glass columns + coach cards"
```

---

### Task 6: Visual Polish — Coach Detail Panel

**Files:**
- Modify: `src/app/golf/admin/crm/components/CoachDetailPanel.tsx`

- [ ] **Step 1: Upgrade panel header**

- Glass header: `bg-white/80 backdrop-blur-xl border-b border-white/20`
- Coach name large, school below in muted text
- Status badge using STATUS_COLORS (pill-shaped, clickable to change)
- Priority indicator with color dot
- Star toggle prominent

- [ ] **Step 2: Upgrade info sections**

- Section headers: `text-xs font-semibold text-warm-500 uppercase tracking-wider`
- Info rows: clean grid layout with label left, value right
- Editable fields: subtle input styling `bg-white/50 border border-white/30 rounded-lg`

- [ ] **Step 3: Upgrade quick actions bar**

- Sticky bottom actions: Email, Call, Schedule, Note — each with Lucide icon
- Primary action (Email) gets primary color button
- Others get ghost button style

- [ ] **Step 4: Commit**
```bash
git add src/app/golf/admin/crm/components/CoachDetailPanel.tsx
git commit -m "feat(crm): premium detail panel with glass header + sticky actions"
```

---

### Task 7: Visual Polish — Remaining Components (batch)

**Files:**
- Modify: `src/app/golf/admin/crm/components/ConferenceGroupView.tsx`
- Modify: `src/app/golf/admin/crm/components/InboundLeadsView.tsx`
- Modify: `src/app/golf/admin/crm/components/CoachFilters.tsx`
- Modify: `src/app/golf/admin/crm/components/BulkActionsBar.tsx`
- Modify: `src/app/golf/admin/crm/components/FAB.tsx`
- Modify: `src/app/golf/admin/crm/components/PipelineStats.tsx`
- Modify: `src/app/golf/admin/crm/components/QuickActionsPanel.tsx`
- Modify: `src/app/golf/admin/crm/components/QuickActionsToolbar.tsx`

- [ ] **Step 1: Conference view — glass cards per conference group, count badges, Lucide icons**
- [ ] **Step 2: Inbound view — glass cards, status badges, "Add to CRM" gets primary button style, fix hardcoded D3 division**
- [ ] **Step 3: Filters bar — refined pill-shaped filter buttons, active state with primary color**
- [ ] **Step 4: Bulk actions bar — glass treatment, Lucide icons, primary/ghost button styles**
- [ ] **Step 5: FAB — refined shadow, smooth animation, Lucide icons in menu**
- [ ] **Step 6: Pipeline stats — glass cards with status color accents**
- [ ] **Step 7: Quick actions panel/toolbar — consistent Lucide icons, glass styling, remove emoji**
- [ ] **Step 8: Commit**
```bash
git add src/app/golf/admin/crm/components/
git commit -m "feat(crm): premium visual polish across all remaining components"
```

---

## Chunk 2: Email System Upgrade

### Task 8: Email Composer Redesign

**Files:**
- Modify: `src/app/golf/admin/crm/components/BulkEmailModal.tsx`

- [ ] **Step 1: Redesign modal layout — split-pane**

Replace single-column layout with:
- Left pane (60%): compose area with subject, body editor, merge tag toolbar
- Right pane (40%): live preview showing exactly what the coach will see
- Responsive: stack vertically on narrow screens

- [ ] **Step 2: Add merge tag toolbar**

Above the body textarea, add a toolbar row with buttons:
- `{name}` — inserts coach name
- `{school}` — inserts school name
- `{conference}` — inserts conference name
Each button: pill-shaped, click to insert at cursor position in textarea

- [ ] **Step 3: Build live preview pane**

Right pane shows:
- Helm branded email header (logo + "Helm Sports Labs")
- Personalized subject line (first recipient's data as example)
- Body with merge tags replaced with first recipient's actual data
- Professional footer with unsubscribe link placeholder
- Updates live as user types

- [ ] **Step 4: Upgrade Gmail mode**

- Show preview of what will be pre-filled in Gmail
- "Copy to Clipboard" button for body text
- Cleaner recipient list display

- [ ] **Step 5: Upgrade Helm mode**

- Send progress indicator (sending 3 of 15...)
- Results summary: sent/skipped/failed with expandable details
- "Send Another Batch" button after completion

- [ ] **Step 6: Upgrade recipient summary**

- Show recipient count with email status indicators
- Warn about bounced/invalid emails prominently
- Expandable list showing all recipients

- [ ] **Step 7: Commit**
```bash
git add src/app/golf/admin/crm/components/BulkEmailModal.tsx
git commit -m "feat(crm): premium email composer with split-pane preview + merge tag toolbar"
```

---

### Task 9: Template Picker Upgrade

**Files:**
- Modify: `src/app/golf/admin/crm/components/TemplatePicker.tsx`

- [ ] **Step 1: Fix type cast bug**

Remove `as 'crm_contact_log'` hack. The table should now be in generated types after the earlier db:types run during the error fix commit. If not, use a typed helper function.

- [ ] **Step 2: Upgrade to visual template cards**

Replace dropdown with card grid:
- Each template shows: name, category badge, subject preview (truncated), body preview (first 2 lines), usage count
- Cards get glass treatment: `bg-white/60 rounded-xl border border-white/20 p-4`
- Click to select, selected card gets primary border
- Category colors: intro=blue, follow_up=amber, demo_invite=emerald, proposal=violet, check_in=teal, general=warm

- [ ] **Step 3: Add "New Template" card**

Dashed border card at the end: "+ Create Template"
Opens inline form to save a new template (name, category, subject, body)

- [ ] **Step 4: Commit**
```bash
git add src/app/golf/admin/crm/components/TemplatePicker.tsx
git commit -m "feat(crm): visual template cards with previews + inline creation"
```

---

### Task 10: Email Tracking Upgrade

**Files:**
- Modify: `src/app/golf/admin/crm/components/EmailTrackingView.tsx`

- [ ] **Step 1: Fix RPC type cast**

Replace `(supabase as any).rpc('get_crm_email_stats')` with properly typed call. Add try/catch with graceful fallback to empty stats.

- [ ] **Step 2: Upgrade stats header**

Glass cards showing:
- Total Sent (with trend)
- Delivery Rate (%)
- Open Rate (%)
- Click Rate (%)
Each card: glass-premium with color-coded value

- [ ] **Step 3: Add campaign-level grouping**

Group emails by batch (same subject + send date):
- Campaign card showing subject, date, recipient count
- Expandable to show per-recipient status: sent/delivered/opened/clicked/bounced
- Status icons: green check (delivered), blue eye (opened), purple click (clicked), red X (bounced)

- [ ] **Step 4: Commit**
```bash
git add src/app/golf/admin/crm/components/EmailTrackingView.tsx
git commit -m "feat(crm): premium email tracking with campaign grouping + stats cards"
```

---

## Chunk 3: Workflow & Modals Polish

### Task 11: Modal Polish (batch)

**Files:**
- Modify: `src/app/golf/admin/crm/components/AddCoachModal.tsx`
- Modify: `src/app/golf/admin/crm/components/ContactLogModal.tsx`
- Modify: `src/app/golf/admin/crm/components/ScheduleEventModal.tsx`
- Modify: `src/app/golf/admin/crm/components/EventDetailModal.tsx`
- Modify: `src/app/golf/admin/crm/components/ImportModal.tsx`

- [ ] **Step 1: Unified modal styling**

All modals get:
- `bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20`
- Header: `text-lg font-semibold` with Lucide icon, X close button
- Body: consistent `p-6` padding
- Footer: right-aligned buttons, primary + ghost styles
- Overlay: `bg-black/40 backdrop-blur-sm`

- [ ] **Step 2: Form input styling**

All form inputs across modals get:
- `bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm`
- Focus: `focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400`
- Labels: `text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5`
- Select dropdowns match input styling

- [ ] **Step 3: Replace emoji in modal content**

Scan all modals for remaining emoji in labels, buttons, placeholders — replace with Lucide icons.

- [ ] **Step 4: Commit**
```bash
git add src/app/golf/admin/crm/components/AddCoachModal.tsx \
  src/app/golf/admin/crm/components/ContactLogModal.tsx \
  src/app/golf/admin/crm/components/ScheduleEventModal.tsx \
  src/app/golf/admin/crm/components/EventDetailModal.tsx \
  src/app/golf/admin/crm/components/ImportModal.tsx
git commit -m "feat(crm): unified premium modal styling across all modals"
```

---

### Task 12: Calendar View Polish

**Files:**
- Modify: `src/app/golf/admin/crm/components/CalendarView.tsx`

- [ ] **Step 1: Glass calendar container**

- Calendar wrapper: `glass-premium rounded-2xl p-5`
- Day cells: clean borders, today highlighted with primary color
- Events on calendar: colored dots using status colors

- [ ] **Step 2: Event type styling**

Event badges on calendar:
- Demo: emerald dot
- Follow-up: amber dot
- Call: blue dot
- Meeting: violet dot

- [ ] **Step 3: Commit**
```bash
git add src/app/golf/admin/crm/components/CalendarView.tsx
git commit -m "feat(crm): premium calendar with glass container + event type colors"
```

---

## Final Build Verification

### Task 13: Build Check + Commit

- [ ] **Step 1: Run TypeScript check**
```bash
cd /Users/ricknini/downloads/helmv3 && npx tsc --noEmit 2>&1 | grep "admin/crm"
```
Fix any type errors in CRM files.

- [ ] **Step 2: Run Next.js build**
```bash
npm run build
```
Ensure clean build.

- [ ] **Step 3: Push to deploy**
```bash
git push origin main
```
