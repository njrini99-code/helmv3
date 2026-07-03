# CRM Email System Upgrade — Design Spec

**Date:** 2026-04-09
**Author:** Rick Nini / Claude
**Status:** Draft

---

## Context

Helm Sports Labs CRM is used by Rick (founder) to email college golf coaches and sell them on GolfHelm. The current system has bugs, stiff templates, and requires too much manual work per email. The goal is: **maximum close rate with minimum effort per email.**

## Problems to Solve

1. **Double greeting bug** — `buildEmailHtml()` hardcodes "Hi {firstName}," AND every template body starts with "Hi {name}," — recipients see both greetings
2. **Wrong greeting style** — Says "Hi Aaron" when college coaches expect "Coach Feyes"
3. **Only 4 templates, all stiff** — Sound like SaaS marketing, not a founder who understands college golf
4. **Only 3 merge tags** — {name}, {school}, {conference}. Tons of coach data sits unused
5. **HTML template looks like a newsletter** — Big green header, GolfHelm branding block. Coaches should feel like they got a personal email
6. **No AI personalization** — Every coach gets the same mail-merged text. No leverage on the rich coach data already in the CRM
7. **UX friction** — Template picker and compose flow could be smoother

---

## Design

### 1. Fix the Double Greeting

**buildEmailHtml()** in `send-email/route.ts`:
- Change hardcoded greeting from `Hi ${firstName},` to `Coach ${lastName},`
- Extract last name from `recipientName` (split on space, take last element)

**All template bodies**: Remove the leading `Hi {name},` line. The HTML wrapper handles the greeting.

**Preview pane** in `BulkEmailModal.tsx`: Update to show `Coach {lastName},` to match.

### 2. Expand Merge Tags

Current: `{name}`, `{school}`, `{conference}`

Add: `{first_name}`, `{last_name}`, `{title}`, `{division}`, `{program}`, `{team_size}`, `{current_software}`

**Data flow change**: `BulkEmailModal.tsx` already has full coach objects. Pass all fields to the send-email API (currently only passes 5). Update `replaceMergeTags()` on both client and server to handle the new tags.

### 3. New Template Library (15 templates)

Replace the 4 stiff defaults with templates organized by sales stage. All written in casual founder-to-coach tone.

**Cold Outreach (4):**
- **Cold Intro** — First touch, short, curiosity-driven
- **Post-Call (No Answer)** — "Just tried calling to introduce myself"
- **Post-Call (Spoke)** — "Great chatting earlier, wanted to follow up"
- **Referral Intro** — "Coach {referrer} suggested I reach out"

**Active Conversation (4):**
- **Demo Follow Up** — After a demo, recap + next steps
- **Check In** — Casual mid-cycle check in
- **Seasonal** — Reference the season (pre-season prep, mid-season, post-season reflection)
- **Feature Spotlight** — Highlight a specific feature relevant to their pain points

**Re-Engage (3):**
- **Haven't Heard Back** — Friendly nudge, no pressure
- **New Feature Announcement** — Something new that's relevant to them
- **Conference Peer** — "{conference} programs are using this"

**Close (2):**
- **Proposal** — Formal-ish pricing/next steps
- **Decision Nudge** — For coaches with "deciding" timeline

**Post-Close (2):**
- **Welcome / Onboarding** — Just signed up, here's what's next
- **Referral Ask** — Happy customer, ask for intro to peers

### 4. Clean HTML Email Template

**Remove:**
- Green header bar with Helm Sports Labs branding
- GolfHelm logo + wordmark block
- The "Built for College Golf" footer tagline
- The "You're receiving this because..." disclaimer

**Keep:**
- Clean white email body
- Properly styled text (15px, warm gray, good line height)

**New structure:**
```
Coach Feyes,

[Body text — looks like a plain email]

Best,
Rick Nini
Founder, Helm Sports Labs
helmsportslabs.com
```

Minimal signature block — name, title, link. No logos, no images. Feels like a real email from a real person.

### 5. AI Personalization Engine

**New Supabase Edge Function: `personalize-email`**

**Input:**
- `template` — The template body text (with merge tags already replaced)
- `coachData` — Full coach profile (school, conference, division, program, team_size, current_software, pain_points, notes, tags, decision_timeline, best_contact_method)
- `tone` — "casual" (default), "professional"
- `senderName` — "Rick Nini"

**What it does:**
- Calls Claude API (claude-haiku-4-5 for speed/cost) with a system prompt:
  - "You are Rick Nini, founder of Helm Sports Labs / GolfHelm. Rewrite this email template to feel personally written for this specific coach. Use their school name, conference, division, team size, any notes or pain points naturally. Keep it short (3-5 sentences for the body). Casual founder tone — like you actually know college golf. Never be salesy or use marketing language."
- Returns the personalized subject + body

**Cost:** ~$0.001 per email with Haiku. 500 emails/day = $0.50/day.

**UI in BulkEmailModal:**

Single coach selected:
- Select template → body populates with merge tags replaced
- "Personalize with AI" button appears next to template name
- Click → spinner for 1-2 seconds → body updates with AI-personalized version
- You can edit the result before sending

Multiple coaches selected:
- Select template → "Personalize All" button in the send bar
- Click → progress bar → generates unique draft for each coach
- Preview cycles through recipients showing each personalized version
- "Send All" sends each coach their unique version

**Fallback:** If edge function fails or AI is unavailable, falls back to standard merge-tag substitution. Never blocks sending.

### 6. UX Improvements

**Compose flow simplification:**
- Remove the Gmail BCC tab (or demote to a small link) — "Send from Helm" is the primary flow
- Template picker: show template preview on hover instead of requiring click
- One-click "Personalize + Send" for single recipients
- From address: `Rick Nini <rick@helmsportslabs.com>` (configurable in settings)

**Preview pane:**
- Show the actual email as it will arrive (plain text style, no newsletter chrome)
- When AI personalizes, show a diff highlight of what changed
- Recipient switcher at top when multiple selected — arrow through each personalized draft

**Template management:**
- "Duplicate & Edit" button on existing templates
- Usage count + last used date visible
- Sort by most recently used (not just category)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/api/admin/crm/send-email/route.ts` | Fix greeting to "Coach {lastName}", clean HTML template, pass expanded data, add AI personalization call |
| `src/app/golf/admin/crm/components/BulkEmailModal.tsx` | New compose UX, AI personalize button, expanded merge tags, cleaner preview, from address config |
| `src/app/golf/admin/crm/components/TemplatePicker.tsx` | Hover preview, duplicate button, sort by recent use |
| `supabase/functions/personalize-email/index.ts` | NEW — Edge function calling Claude API for personalization |
| `supabase/migrations/xxx_update_crm_templates.sql` | NEW — Replace 4 default templates with 15 new ones, remove greeting from body text |

## Out of Scope

- Email sequences / drip campaigns
- A/B testing
- Send scheduling / send-later
- Email tracking pixel (already exists via Resend webhooks)
- Template builder UI (rich text editor) — plain text is fine, feels more personal

---

## Clarifications from Spec Review

### Template Categories
New categories: `cold_outreach`, `active_conversation`, `re_engage`, `close`, `post_close`. Update the CHECK constraint on `crm_email_templates.category`, the `TemplateCategory` type union in `TemplatePicker.tsx`, and the `CATEGORY_COLORS`/`CATEGORY_OPTIONS` maps.

### Expanded Recipient Interface
Add to the `Recipient` type in `send-email/route.ts`: `first_name`, `last_name`, `title`, `division`, `program`, `team_size`, `current_software`. Split `name` into first/last on the client side before sending.

### Pain Points
`pain_points` is an array — used as AI context only, NOT as a merge tag. Correct.

### From Address
Hardcode `Rick Nini <rick@helmsportslabs.com>` for v1. Configurable settings later.

### Bulk AI Concurrency
Sequential with progress bar. Max 5 concurrent calls to avoid Anthropic rate limits. Progress updates per-coach.

### Last Name Edge Cases
- Single word name → use as-is: "Coach Aaron"
- Names with suffixes (Jr., III) → take second-to-last word if last word is a known suffix
- Default fallback: last word of the name string

### Null Merge Tag Handling
Non-AI path: replace null fields with empty string (current behavior). Template authors should write templates that degrade gracefully (don't write "Your team of {team_size}" — write "your team" and let AI handle specifics).

### Template Migration
INSERT 15 new templates. Set `is_default = false` on old 4. Do NOT delete (contact log references template IDs).

### AI Changes Display
Before/after toggle, not character-level diff. Simpler and more useful.

### Progress Bar
Bulk "Personalize All" runs client-side per-coach, providing real progress. Bulk "Send All" also updates per-coach since it calls the API individually.

---

## Implementation Phases

- **Phase 1**: Fix double greeting, expand merge tags, clean HTML template, change from address
- **Phase 2**: Write 15 new templates, update categories, migrate DB
- **Phase 3**: AI personalization edge function + UI integration
- **Phase 4**: UX polish (hover preview, before/after toggle, template management)
