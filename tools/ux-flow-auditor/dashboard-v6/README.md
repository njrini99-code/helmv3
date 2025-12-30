# Ship Command Hub v6 - Path Scanner

## Complete System Overview

A comprehensive path-by-path analysis and improvement system with:

### 🎯 Core Features

1. **Full Path Browser** - Lists ALL routes from helmv3/src/app
2. **Three Issue Categories** (color-coded):
   - 🔴 **Issues** - Bugs, dead code, unfinished features
   - 🟡 **UI Enhancements** - Visual polish, animations, microinteractions
   - 🟢 **Feature Enhancements** - Missing functionality, UX improvements

3. **Screenshot Integration** - Upload screenshots for visual analysis
4. **Neural Wire Visualization** - See agents working in real-time
5. **MD Queue** - Copy-paste ready implementation guides
6. **Continuous Improvement Agent** - Never-ending improvement discovery

---

## 📁 File Structure

```
tools/ux-flow-auditor/
├── dashboard-v6/                    # New Path Scanner Dashboard
│   ├── index.html                   # Main UI
│   ├── styles.css                   # Premium dark theme
│   └── app.js                       # Client-side logic
│
├── src/
│   ├── server.js                    # HTTP + WebSocket server (updated)
│   ├── ship-command-hub.js          # Main orchestrator (updated)
│   │
│   ├── agents/
│   │   ├── code-quality-agent.js    # 🔍 Code pattern validation
│   │   ├── design-system-agent.js   # 🎨 Design system compliance
│   │   ├── route-context-agent.js   # 🗺️ Route context & must-haves
│   │   ├── ui-review-agent.js       # 📸 UI/UX review
│   │   ├── improvement-agent.js     # 🧠 Learning & recommendations
│   │   ├── continuous-improvement-agent.js  # 🔄 Never-ending discovery
│   │   ├── md-generator-agent.js    # 📝 Detailed MD generation
│   │   ├── visual-analysis-agent.js # 👁️ Screenshot analysis
│   │   └── megathink.js             # 💡 Deep research
│   │
│   └── knowledge/                   # Project knowledge system
│       ├── index.js                 # HelmKnowledge main export
│       ├── design-system-validator.js
│       ├── code-quality-analyzer.js
│       └── route-context-analyzer.js
```

---

## 🚀 How to Use

### 1. Start the Server
```bash
cd tools/ux-flow-auditor
npm start
```

### 2. Open Dashboard
- **v6 (Path Scanner)**: http://localhost:3333
- **v3 (Ship Score)**: http://localhost:3333/v3

### 3. Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Click "Full Project Scan"                               │
│     └── Discovers all routes from src/app                   │
│                                                             │
│  2. Click on any path in the left panel                     │
│     └── Shows Issues, UI, Features for that route           │
│                                                             │
│  3. Upload a screenshot (optional)                          │
│     └── Enables visual analysis by agents                   │
│                                                             │
│  4. Click any issue/UI/feature item                         │
│     └── Opens detail modal with:                            │
│         • Summary - What it is                              │
│         • Why - Why it matters                              │
│         • Result - What fixing achieves                     │
│                                                             │
│  5. Click "Send to Agents" or "Skip"                        │
│     └── Send: Generates detailed MD                         │
│     └── Skip: Close modal                                   │
│                                                             │
│  6. View generated MD in queue                              │
│     └── Click "Copy to Clipboard"                           │
│     └── Paste into Cursor                                   │
│     └── Click "Done - Next"                                 │
│                                                             │
│  7. Run "Continuous Improvement" (button)                   │
│     └── Agent finds MORE improvements                       │
│     └── Skip or Send each one                               │
│                                                             │
│  8. Repeat until route is clean ✨                          │
│     └── Move to next route                                  │
│     └── Never-ending improvement loop                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤖 Agent Architecture

```
                     ┌──────────────────┐
                     │   🎯 Coordinator │
                     │   (Dispatches)   │
                     └────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ 🔍 Code       │    │ 🎨 Design     │    │ 🗺️ Route      │
│ Quality       │    │ System        │    │ Context       │
│ Agent         │    │ Agent         │    │ Agent         │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └─────────────┬──────┴──────┬─────────────┘
                      │             │
                      ▼             ▼
              ┌───────────┐ ┌───────────────┐
              │ 📸 UI     │ │ 🧠 Improvement│
              │ Review    │ │ Agent         │
              └───────────┘ └───────┬───────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ 📝 MD Generator │
                          │ (Detailed MDs)  │
                          └─────────────────┘
```

All agents are **KNOWLEDGE-POWERED** with:
- Design system rules (spacing, colors, glass, transitions)
- Route context (expected components, must-haves)
- Domain knowledge (baseball recruiting, golf team management)
- Code patterns (valid imports, table names, etc.)

---

## 📝 MD Output Quality

The MDGeneratorAgent creates EXTREMELY detailed implementation guides:

```markdown
# Implementation: Add Loading State to Dashboard

> Feature for `/dashboard`
> Generated by Ship Command Hub

## Overview
Add a skeleton loading state to the dashboard...

## Files

| File | Action | Description |
|------|--------|-------------|
| `src/app/(app)/dashboard/loading.tsx` | Create | Loading skeleton |

## Dependencies

```bash
npm install framer-motion
```

## Implementation

### Step 1: Create Loading Component

```tsx
// src/app/(app)/dashboard/loading.tsx
'use client';

import { motion } from 'framer-motion';

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse"
      />
      
      {/* Cards skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {Array(6).fill(0).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="h-32 bg-zinc-800/50 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
```

## Verification

1. [ ] Navigate to dashboard - loading state appears
2. [ ] Skeleton matches page layout
3. [ ] Animation is smooth (no jank)
4. [ ] Loads correctly on slow connection
```

---

## 🎨 Design System Compliance

All generated code follows:

| Property | Value |
|----------|-------|
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64px |
| Border Radius | Input 8px, Button 12px, Card 16px, Modal 24px |
| Transitions | Hover 150ms, State 220ms, Modal 300ms |
| Glass | ONLY nav/toolbar, NEVER tables/forms |
| Colors | bg #0a0a0f, surface #111118, accent #6366f1 |

---

## 🔄 Continuous Improvement Loop

The system is designed for a **never-ending improvement cycle**:

1. Scan route → See all issues
2. Fix one → Mark done
3. Scan again → Find more
4. Run CI Agent → Discover hidden improvements
5. Repeat until PERFECT

---

## 🏁 Quick Start

```bash
# Terminal 1: Run dev server
cd /Users/ricknini/Downloads/helmv3
npm run dev

# Terminal 2: Run Ship Command Hub
cd tools/ux-flow-auditor
npm start

# Open browser
open http://localhost:3333
```

Then:
1. Click "Full Project Scan"
2. Click on any route
3. Review Issues/UI/Features
4. Send to agents
5. Copy MD to Cursor
6. Repeat!

---

*Built for Helm Sports Labs - Path by Path to Perfection* 🚢
