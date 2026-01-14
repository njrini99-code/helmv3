# Opinionated Defaults

Steve Jobs didn't give choices. He made the **right choice**.

This guide shows you how to design defaults so good that 90% of users never need configuration.

## The Default Philosophy

### Why Opinionated Defaults Win

**User Perspective:**
- Decision fatigue is real
- "Just make it work" beats "give me 50 options"
- Trust comes from confident defaults
- Power users can always customize later

**Business Perspective:**
- Lower support load
- Faster onboarding
- Higher activation
- Cleaner codebase

**Jobs Principle:**
> "People don't know what they want until you show it to them."

---

## The Four Levels

```
Level 0: WORKS OUT OF BOX
└─ 90% of users stay here
   Smart analysis → Perfect default

Level 1: ONE-CLICK TEMPLATES
└─ 8% of users go here
   "Use case" → Pre-configured setup

Level 2: GUIDED CUSTOMIZATION
└─ 2% of users go here
   Specific needs → Assisted configuration

Level 3: POWER USER ESCAPE HATCH
└─ <1% of users go here
   Full control → Advanced settings
```

**Design Goal**: Make Level 0 so good that moving to Level 1+ feels like a power-up, not a necessity.

---

## Pattern Library

### 1. Smart Field Pre-Population

**Bad Default:**
```jsx
<input 
  type="text" 
  name="project_name"
  placeholder="Enter project name"
/>
// Empty. User has to think.
```

**Good Default:**
```jsx
<input 
  type="text" 
  name="project_name"
  value="Untitled Project - Jan 10, 2026"
/>
// Pre-filled. User can keep or edit.
```

**Even Better:**
```jsx
// Analyze context
const suggestedName = user.lastProject 
  ? `${user.lastProject} (Copy)`
  : `${user.company} Project - ${date}`;

<input 
  type="text" 
  name="project_name"
  value={suggestedName}
/>
// Contextually smart. Saves cognitive load.
```

---

### 2. Intelligent Sort Orders

**Bad Default:**
```jsx
// Alphabetical sort
projects.sort((a, b) => a.name.localeCompare(b.name))
```

**Good Default:**
```jsx
// Sort by relevance
projects.sort((a, b) => {
  // 1. Pinned first
  if (a.pinned !== b.pinned) return b.pinned - a.pinned;
  
  // 2. Recently accessed
  if (a.lastAccessed !== b.lastAccessed) 
    return b.lastAccessed - a.lastAccessed;
  
  // 3. Then alphabetical
  return a.name.localeCompare(b.name);
})
```

---

### 3. Use Case Detection

**Bad Onboarding:**
```jsx
"What do you want to do?"
[ ] Option A
[ ] Option B
[ ] Option C
[ ] Option D
```

**Good Onboarding:**
```jsx
// Detect from signup context
const detectedUseCase = 
  referrer.includes('product-hunt') ? 'launch' :
  user.email.includes('edu') ? 'education' :
  company.size > 50 ? 'enterprise' :
  'startup';

// Pre-configure for that use case
setupDefaults(detectedUseCase);

// Show in UI
"We've set this up for {detectedUseCase}. 
 [Change] if that's not right."
```

---

### 4. Time Zone Intelligence

**Bad Default:**
```jsx
<select name="timezone">
  <option>Select timezone...</option>
  <option>UTC</option>
  <option>EST</option>
  <option>PST</option>
  {/* 500+ more timezones */}
</select>
```

**Good Default:**
```jsx
// Detect from browser
const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

<select name="timezone">
  <option value={detected} selected>
    {detected} (detected)
  </option>
  <optgroup label="Common">
    {commonTimezones.map(...)}
  </optgroup>
  <optgroup label="All">
    {allTimezones.map(...)}
  </optgroup>
</select>
```

---

### 5. Notification Preferences

**Bad Default:**
```jsx
// All notifications on (spam)
OR
// All notifications off (miss important info)
```

**Good Default:**
```jsx
const smartDefaults = {
  // Critical: Always on
  security_alerts: true,
  payment_issues: true,
  
  // Important: On during work hours
  mentions: { enabled: true, schedule: 'work_hours' },
  
  // Nice-to-have: Digest only
  product_updates: { enabled: true, frequency: 'weekly' },
  
  // Marketing: Off by default
  newsletter: false,
  promotions: false
};
```

---

### 6. Pricing Tier Guidance

**Bad Default:**
```jsx
// All tiers look equal
[Free] [Pro] [Enterprise]
```

**Good Default:**
```jsx
// Recommended tier highlighted
[Free] 
[Pro] ← "Most Popular" badge + subtle glow
[Enterprise]

// Pre-select based on:
- Team size
- Usage patterns
- Signup source
```

---

### 7. Form Field Ordering

**Bad Default:**
```jsx
// Alphabetical order
<form>
  <input name="company" />
  <input name="email" />
  <input name="first_name" />
  <input name="last_name" />
  <input name="phone" />
</form>
```

**Good Default:**
```jsx
// Conversation order
<form>
  <input name="first_name" />
  <input name="last_name" />
  <input name="email" />
  <input name="company" />
  <input name="phone" /> {/* Optional, at end */}
</form>

// Even better: Progressive
<form>
  {/* Step 1: Identity */}
  <input name="email" />
  
  {/* Step 2: Context (only if needed) */}
  {showContext && (
    <>
      <input name="company" />
      <input name="role" />
    </>
  )}
</form>
```

---

### 8. Empty State Defaults

**Bad Default:**
```jsx
<div className="empty">
  No projects found.
</div>
```

**Good Default:**
```jsx
<div className="empty">
  <h3>Let's create your first project</h3>
  <p>Projects help you organize your work</p>
  <button onClick={createProject}>
    Create Project
  </button>
  
  {/* OR auto-create */}
  <button onClick={createFromTemplate}>
    Start from Template
  </button>
</div>

// Even better: Auto-create starter project
useEffect(() => {
  if (projects.length === 0) {
    createStarterProject();
  }
}, []);
```

---

### 9. Date/Time Pickers

**Bad Default:**
```jsx
<input type="datetime-local" />
// No default, user has to set everything
```

**Good Default:**
```jsx
// Default to next business hour
const nextBusinessHour = () => {
  const now = new Date();
  let next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  
  // Skip to Monday if weekend
  if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  if (next.getDay() === 6) next.setDate(next.getDate() + 2);
  
  return next;
};

<input 
  type="datetime-local" 
  value={nextBusinessHour().toISOString().slice(0, 16)}
/>
```

---

### 10. Export File Names

**Bad Default:**
```jsx
<button onClick={() => download('export.csv')}>
  Export
</button>
```

**Good Default:**
```jsx
const intelligentFilename = () => {
  const date = new Date().toISOString().split('T')[0];
  const context = currentView; // "Revenue", "Users", etc.
  const filter = activeFilter; // "Q4-2024", "Last-30-Days"
  
  return `${company}-${context}-${filter}-${date}.csv`;
};

<button onClick={() => download(intelligentFilename())}>
  Export
</button>
```

---

## Template System

### Use Case Templates

Instead of blank slate, offer smart starting points:

```jsx
const templates = {
  marketing_agency: {
    projects: ['Website Redesign', 'Q1 Campaign', 'Brand Guidelines'],
    tags: ['Client Work', 'Internal', 'Urgent'],
    workflow: 'kanban',
    notifications: 'client-facing'
  },
  
  software_team: {
    projects: ['Sprint 1', 'Backlog', 'Bugs'],
    tags: ['Frontend', 'Backend', 'Design', 'Bug'],
    workflow: 'agile',
    notifications: 'dev-focused'
  },
  
  freelancer: {
    projects: ['Active Clients', 'Proposals', 'Admin'],
    tags: ['Billable', 'Non-Billable'],
    workflow: 'simple',
    notifications: 'minimal'
  }
};

// Detect or ask once
const selectedTemplate = detectUseCase() || askOnce();
applyTemplate(templates[selectedTemplate]);
```

---

## Configuration Patterns

### Progressive Configuration

```jsx
// START: Zero config
const config = SMART_DEFAULTS;

// LEVEL 1: One toggle
<Switch 
  label="Enable advanced features"
  onChange={showAdvanced}
/>

// LEVEL 2: Guided setup
{showAdvanced && (
  <Wizard steps={[
    'Choose workflow',
    'Set permissions',
    'Configure integrations'
  ]} />
)}

// LEVEL 3: Full control
{expertMode && (
  <AdvancedSettings />
)}
```

### Smart Toggles

```jsx
// Bad: Vague toggle
<Switch label="Enable notifications" />

// Good: Opinionated default + override
<Switch 
  label="Smart notifications (recommended)"
  description="We'll notify you about important updates during work hours"
  defaultChecked={true}
/>

<button onClick={showAdvancedNotifications}>
  Customize notification settings →
</button>
```

---

## Decision Frameworks

### When to Make Opinionated Choice

**Choose FOR the user when:**
- ✅ 80%+ of users want the same thing
- ✅ The decision requires domain expertise
- ✅ Wrong choice has low cost
- ✅ Right choice is obvious from context

**Let user choose when:**
- ❌ Preference varies widely
- ❌ Choice has high stakes
- ❌ User has strong prior expectations
- ❌ No clear "best" option

### The 80/20 Test

```jsx
// Analyze usage data
const usageStats = analyzeFeature('sort_order');

if (usageStats.topChoice.percentage > 80) {
  // Make it the default
  DEFAULT_SORT = usageStats.topChoice.value;
  
  // Hide setting unless user explicitly changes
  SHOW_SORT_SETTINGS = false;
}
```

---

## Examples from Great Products

### Stripe Dashboard

**Opinionated Default:**
- Shows revenue chart (not transactions)
- Last 30 days (not all time)
- Successful payments (not failures)
- USD (or detected currency)

**Why it works:**
- Answers the question users actually have: "How's business?"
- All defaults can be changed
- Most users never change them

### Linear Issue Tracker

**Opinionated Default:**
- Auto-assigns next issue number
- Default priority: Medium
- Default status: Backlog
- Smart labels from title (detects "bug", "feature")

**Why it works:**
- Zero friction to create issue
- Smart enough to be useful
- Can refine after creation

### Figma File Organization

**Opinionated Default:**
- New files go to "Drafts"
- Auto-organize by project
- Recent files surface first

**Why it works:**
- No "where should this go?" paralysis
- Can move later
- Smart surface = less searching

---

## Implementation Checklist

Building a feature with opinionated defaults:

- [ ] **Analyze** existing user behavior (what do 80%+ choose?)
- [ ] **Detect** context (signup source, team size, use case)
- [ ] **Pre-populate** intelligent defaults
- [ ] **Show** the default with confidence ("Recommended")
- [ ] **Allow** override without friction
- [ ] **Hide** advanced settings by default
- [ ] **Guide** if user needs customization
- [ ] **Measure** how many users change defaults

---

## Critical Principles

1. **Confidence over options** — Make the right choice for users
2. **Context awareness** — Use all available signals
3. **Progressive disclosure** — Advanced settings exist but hidden
4. **Smart not lazy** — "Select option..." is lazy, detect and suggest
5. **Learn from usage** — If 80%+ pick X, make X the default
6. **One-way doors rare** — Most choices should be reversible
7. **Explain the choice** — "We set this up for [reason]"
8. **Measure satisfaction** — Track if defaults stick

**The Goal**: User says "This just works" instead of "Where's the setting?"
