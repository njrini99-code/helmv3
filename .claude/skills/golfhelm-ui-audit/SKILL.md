---
name: golfhelm-ui-audit
description: Full visual UI audit for GolfHelm using Playwright MCP. Logs into player and coach accounts, navigates all pages, screenshots each view, and evaluates against premium SaaS UI standards (hierarchy, spacing, glass usage, motion, accessibility). Generates a detailed markdown report with page-by-page recommendations. Use when auditing GolfHelm UI quality, finding vibe-coded patterns, or preparing UI improvement sprints.
---

# GolfHelm UI Audit

Automated visual audit for GolfHelm using Playwright MCP against premium SaaS UI standards.

## Prerequisites

- **Playwright MCP** connected in Claude Desktop
- **GolfHelm** running at `http://localhost:3000`

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Player | rinin376@gmail.com | Pirates#09!! |
| Coach | testcoach@testgolf.com | TestPass123! |

## Audit Workflow

Execute these phases in order:

### Phase 1: Setup & Landing Page

1. Navigate to `http://localhost:3000`
2. Screenshot the landing page (logged out state)
3. Evaluate landing page against [Landing Checklist](#landing-page-checklist)

### Phase 2: Player Account Audit

1. Click login/sign-in
2. Enter player credentials: `rinin376@gmail.com` / `Pirates#09!!`
3. Submit and wait for dashboard
4. **For each page in player navigation:**
   - Screenshot the page
   - Note the URL/route
   - Evaluate against [Page Audit Checklist](#page-audit-checklist)
   - Record findings
5. Log out

### Phase 3: Coach Account Audit

1. Click login/sign-in
2. Enter coach credentials: `testcoach@testgolf.com` / `TestPass123!`
3. Submit and wait for dashboard
4. **For each page in coach navigation:**
   - Screenshot the page
   - Note the URL/route
   - Evaluate against [Page Audit Checklist](#page-audit-checklist)
   - Record findings
5. Log out

### Phase 4: Generate Report

Create a markdown report following [Report Template](#report-template).

---

## Landing Page Checklist

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| One dominant headline | | |
| Clear target audience in subhead | | |
| Primary CTA stands out (one only) | | |
| Product screenshot/demo visible | | |
| No carousel | | |
| Glass used only on chrome (nav, footer) | | |
| Consistent spacing (8px grid) | | |
| Max 2 border-radius values | | |
| Typography hierarchy clear (3-4 sizes) | | |

---

## Page Audit Checklist

Run this for every page. Order matters—foundation before effects.

### 1. Foundation (Critical)

| Check | Criteria | Common Fixes |
|-------|----------|--------------|
| **Spacing** | Consistent padding/margins on 4/8/12/16/24/32 scale | Adopt spacing tokens |
| **Typography** | Clear size hierarchy, 3-4 sizes max | Reduce font variations |
| **Border Radius** | Max 2 values (cards: 16px, inputs: 8px) | Standardize radii |
| **Colors** | 1 brand accent, rest neutral | Remove competing colors |
| **Alignment** | Everything on 8px grid | Fix alignment issues |

### 2. Hierarchy

| Check | Criteria |
|-------|----------|
| **Primary Action** | One clear primary action per screen |
| **Grouping** | Clear grouping with whitespace |
| **Section Rhythm** | Predictable vertical spacing |
| **Data Surfaces** | Dense data on solid (not glass) |

### 3. Glass Usage

| Surface | Glass OK? |
|---------|-----------|
| Navigation bar | ✅ Yes |
| Filter bar | ✅ Yes |
| Toolbars | ✅ Yes |
| Modal backdrop | ✅ Yes |
| Data tables | ❌ No |
| Forms | ❌ No |
| KPI cards | ⚠️ Only if background controlled |
| Long text content | ❌ No |

### 4. Components

| Component | Checks |
|-----------|--------|
| **Buttons** | Primary/secondary/ghost hierarchy, hover states, consistent sizing |
| **Cards** | Consistent radius, shadow, padding |
| **Tables** | Sticky headers, row hover, consistent row height |
| **Inputs** | Clear focus ring, error states, consistent sizing |
| **Navigation** | Current location indicator, logical grouping |

### 5. Motion & States

| Check | Criteria |
|-------|----------|
| **Hover states** | All interactive elements have hover feedback |
| **Focus rings** | Visible focus indicators for keyboard nav |
| **Transitions** | 150-220ms, consistent easing |
| **Loading states** | Skeleton or spinner where data loads |
| **Empty states** | Helpful message + action when no data |

### 6. Vibe-Code Flags 🚩

Red flags that indicate "template" look:

- [ ] Glass on every card
- [ ] Different blur values per element
- [ ] Mixed border-radius across similar components
- [ ] Multiple competing CTAs
- [ ] Random padding values
- [ ] Text over busy backgrounds without sufficient contrast
- [ ] Motion without purpose
- [ ] Inconsistent button styles

---

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| 🔴 **Critical** | Breaks usability, accessibility failure, illegible | Fix immediately |
| 🟠 **High** | Inconsistent patterns, weak hierarchy, vibe-coded | Fix in current sprint |
| 🟡 **Medium** | Minor spacing issues, missing states | Fix in next sprint |
| 🟢 **Low** | Polish items, nice-to-haves | Backlog |

---

## Report Template

Generate a report with this structure:

```markdown
# GolfHelm UI Audit Report

**Date**: [date]
**Auditor**: Claude + Playwright MCP
**App Version**: localhost:3000

## Executive Summary

- **Overall Grade**: [A/B/C/D/F]
- **Critical Issues**: [count]
- **High Priority**: [count]
- **Total Pages Audited**: [count]

### Top 3 Systemic Issues
1. [Issue affecting multiple pages]
2. [Issue affecting multiple pages]
3. [Issue affecting multiple pages]

---

## Landing Page

**URL**: /
**Screenshot**: [reference]

### Findings

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| ... | 🔴/🟠/🟡/🟢 | ... | ... |

### Code Recommendations

\`\`\`tsx
// Specific Tailwind/component fixes
\`\`\`

---

## Player Pages

### Player Dashboard

**URL**: /player/dashboard (or discovered route)
**Screenshot**: [reference]

### Findings

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| ... | ... | ... | ... |

### Code Recommendations

\`\`\`tsx
// Fixes
\`\`\`

[Repeat for each player page]

---

## Coach Pages

### Coach Dashboard

**URL**: /coach/dashboard (or discovered route)
**Screenshot**: [reference]

### Findings

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| ... | ... | ... | ... |

### Code Recommendations

\`\`\`tsx
// Fixes
\`\`\`

[Repeat for each coach page]

---

## Systemic Recommendations

### Spacing System
[Recommendations for spacing tokens]

### Typography System
[Recommendations for type scale]

### Component Standardization
[Which components need alignment]

### Glass Usage Policy
[Where glass is appropriate vs not]

---

## Implementation Priority

### Sprint 1 (Critical + High)
- [ ] Fix 1
- [ ] Fix 2

### Sprint 2 (Medium)
- [ ] Fix 3
- [ ] Fix 4

### Backlog (Low)
- [ ] Polish item 1
```

---

## Premium Standard Reference

### Token System

```css
/* Spacing */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;
--space-4: 16px; --space-5: 24px; --space-6: 32px;

/* Radii */
--radius-sm: 8px;  --radius-md: 12px;
--radius-lg: 16px; --radius-xl: 24px;

/* Shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07);

/* Motion */
--duration-fast: 150ms;
--duration-base: 220ms;
```

### Glass Recipe

```tsx
// Chrome glass (nav, toolbars)
className="backdrop-blur-md bg-white/70 border border-white/20"

// Overlay glass (modals, sheets)  
className="backdrop-blur-lg bg-white/80 border border-white/30"
```

### Button Hierarchy

```tsx
// Primary (one per section)
className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"

// Secondary
className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"

// Ghost
className="px-4 py-2 rounded-lg hover:bg-gray-100"
```

---

## Benchmark Targets

| Brand | Signature | What GolfHelm Should Match |
|-------|-----------|---------------------------|
| **Linear** | Spacing discipline + subtle lighting | Consistent 8px grid, muted colors |
| **Stripe** | Editorial typography + gradients | Large headlines, atmospheric backgrounds |
| **Vercel** | Technical clarity + high contrast | Black/white, sharp CTAs |

**The goal**: A recognizable system where everything obeys the same rules.
