# CRM Premium Upgrade — Design Spec

**Date:** 2026-03-28
**Priority:** High — outreach to college golf coaches starts this week
**Scope:** 3 pillars across 6 tabs, 22 components

---

## Context

The GolfHelm CRM at `/golf/admin/crm` manages 354 college golf coach leads. The user is about to begin real sales outreach using a mix of personalized Gmail emails and batch Helm-branded emails. The CRM needs to feel premium, work cohesively, and have a production-grade email system.

## Pillar 1: Email System Upgrade

**Goal:** Make email the strongest feature — it's the primary outreach tool.

### Email Composer Redesign (`BulkEmailModal.tsx`)
- Split-pane layout: editor on left, live preview on right
- Merge tag toolbar buttons (`{name}`, `{school}`, `{conference}`) — click to insert, not manual typing
- Template picker with visual preview cards (not just a dropdown)
- Recipient summary with email validation badges
- Gmail mode: pre-compose button opens Gmail with subject + body populated
- Helm mode: branded send with Helm Sports Labs header, coach name personalization, professional footer
- Character/word count in composer

### Email Templates (`TemplatePicker.tsx`, `crm_email_templates`)
- Fix the `as 'crm_contact_log'` type cast — regenerate DB types to include `crm_email_templates`
- Template cards with subject preview, body preview, usage count, category badge
- Edit/duplicate/delete templates inline
- "New Template" creation from the composer

### Email Tracking (`EmailTrackingView.tsx`)
- Campaign-level grouping — see all emails from a batch together
- Per-recipient status: sent, delivered, opened, clicked, bounced
- Summary stats: total sent, delivery rate, open rate, click rate
- Fix `get_crm_email_stats` RPC type cast (`as any`)

## Pillar 2: Visual Polish & Cohesion

**Goal:** Every tab feels like the same premium app. Match the golf dashboard quality.

### Design System Alignment
- Replace ALL emoji in `crm-config.tsx` with Lucide icons (premium, consistent)
- Pipeline stages: Target, MessageSquare, Handshake, Flag → replace 🎯💬🤝🏁
- Status icons: all Lucide, consistent sizing, color-coded
- Priority: replace emoji with colored dot + icon system

### Card & Component Treatment
- All cards get `glass-premium rounded-2xl` treatment
- Consistent padding (p-5/p-6), gap-4 between cards
- Hover states: `hover:bg-white/80 hover:shadow-card-hover transition-all duration-200`
- Status badges: pill-shaped with status color backgrounds

### Tab Consistency
- Unified header pattern across all 6 tabs
- Consistent empty states with helpful CTAs
- Loading skeletons (not spinners)
- Smooth tab transitions

### Sidebar Polish
- Active tab indicator with primary color accent
- Hover states on nav items
- Stats badges refined (not raw numbers)

## Pillar 3: Workflow & Feature Cohesion

**Goal:** Tabs work together as a sales workflow, not isolated views.

### Dashboard Tab (`CRMDashboard.tsx`)
- "Today's Focus" section: follow-ups due, stale leads, recent responses
- Activity timeline: last 10 actions across all coaches
- Pipeline funnel visualization
- Quick stats: emails sent this week, response rate, demos scheduled

### Coach Detail Panel (`CoachDetailPanel.tsx`)
- Full activity timeline: emails, calls, events, status changes — chronological
- Email history with open/click status inline
- Next action prompt based on current status
- Quick actions: email, call, schedule, note — always visible

### Pipeline View (`PipelineView.tsx`)
- Drag-and-drop between columns
- Auto-prompt for follow-up date on status change
- Card shows: name, school, last contacted, days since contact

### Conference View (`ConferenceGroupView.tsx`)
- "Email All" button per conference for batch outreach
- Conference-level stats: total, contacted, engaged, won

### Inbound Tab (`InboundLeadsView.tsx`)
- Badge count on tab when new inbound leads exist
- One-click "Add to CRM" with proper division/conference detection (fix hardcoded D3)

---

## Implementation Order

1. **Pillar 2 (Visual)** — apply design system across all components first so everything looks cohesive
2. **Pillar 1 (Email)** — upgrade composer, templates, and tracking
3. **Pillar 3 (Workflow)** — dashboard, detail panel, pipeline, conference enhancements

## Files to Modify

### Core Config
- `crm-config.tsx` — replace all emoji with Lucide icons

### All 22 Components (visual pass)
- Every component in `src/app/golf/admin/crm/components/` gets glass-premium treatment

### Email System (functional)
- `BulkEmailModal.tsx` — redesign composer
- `TemplatePicker.tsx` — fix type cast, visual cards
- `EmailTrackingView.tsx` — campaign grouping, fix RPC cast
- `/api/admin/crm/send-email/route.ts` — already fixed status auto-advance

### Workflow (functional)
- `CRMDashboard.tsx` — today's focus, activity timeline
- `CoachDetailPanel.tsx` — activity timeline, email history
- `PipelineView.tsx` — drag-and-drop
- `ConferenceGroupView.tsx` — batch email per conference
- `InboundLeadsView.tsx` — fix hardcoded D3, add badge

## Non-Goals
- No new database tables or migrations (use existing schema)
- No new API routes (existing send-email + webhook sufficient)
- No mobile-specific design (admin CRM is desktop-only)
- No AI features (not needed for initial outreach)
