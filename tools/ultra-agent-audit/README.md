# 🤖 Ultra Agent Audit - Command Center

Multi-agent UX auditing system for Helm Sports Labs with **NO PAID API CALLS**.

## Features

### 🔍 Tab 1: Route Audit
Click routes → Analyze → See Issues with WHY/RESULT → Send to Agents → Get detailed MD → Copy to Claude Code

### 🗺️ Tab 2: Flow Visualizer  
End-to-end user journeys with live animated wires showing how paths connect through baseball and golf flows.

---

## Quick Start

```bash
cd tools/ultra-agent-audit
npm install
npm start
```

Dashboard: http://localhost:3333

---

## Architecture

### Two Tab System

```
┌─────────────────────────────────────────────────────────────────┐
│                   ULTRA AGENT AUDIT                              │
├─────────────────────────┬───────────────────────────────────────┤
│     🔍 Route Audit      │         🗺️ Flow Visualizer           │
├─────────────────────────┴───────────────────────────────────────┤
│                                                                  │
│  TAB 1: ROUTE AUDIT                                             │
│  ┌─────────┐  ┌─────────────────┐  ┌────────────────┐           │
│  │ Routes  │  │   Analysis      │  │   MD Queue +   │           │
│  │ List    │  │ • Issues 🔴     │  │   Agents       │           │
│  │ ⚾ ⛳   │→ │ • UI Issues 🎨  │→ │   🔍🎨🗺️📝    │           │
│  │         │  │ • Features ✨   │  │                │           │
│  └─────────┘  └─────────────────┘  └────────────────┘           │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TAB 2: FLOW VISUALIZER                                         │
│                                                                  │
│                      🏠 Home                                     │
│                     /      \                                     │
│                    ↓        ↓                                    │
│            ⚾ Baseball    ⛳ Golf                                │
│                 ↓              ↓                                 │
│           📊 Dashboard    📊 Dashboard                           │
│          /   |   |   \       /   |   \                          │
│         ↓    ↓   ↓    ↓     ↓    ↓    ↓                         │
│        📈   🔍  👥  💬    📈   👥   🏆                          │
│       Over Disc Rost Msg  Over Rost Tour                        │
│                                                                  │
│        Live animated wires show user flow                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Agent System

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT COORDINATOR                           │
│                           🎯                                     │
│    Routes messages • Broadcasts discoveries • Tracks flow        │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────┴────┐        ┌────┴────┐        ┌────┴────┐
    │   🔍    │        │   🎨    │        │   🗺️    │
    │  Code   │ ←───→  │ Design  │ ←───→  │ Route   │
    │ Quality │        │ System  │        │ Context │
    └────┬────┘        └────┬────┘        └────┬────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                       ┌────┴────┐
                       │   📝    │
                       │   MD    │
                       │Generator│
                       └─────────┘
```

### Supporting Agents

- **🧠 Improvement**: Learns from fixes, tracks patterns
- **🚀 MegaThink**: Strategic proposals (rule-based)
- **👁️ Visual Analysis**: Screenshot management
- **📸 UI Review**: Before/after capture with Puppeteer

---

## HelmKnowledge System

Deep project context for intelligent analysis:

```javascript
HelmKnowledge = {
  domains: {
    baseball: { ... },  // Recruiting platform
    golf: { ... },      // Team management
  },
  routes: {
    '/baseball/dashboard': {
      type: 'dashboard',
      domain: 'baseball',
      description: 'Player/coach home dashboard...',
      expectedComponents: ['StatsCards', 'ActivityFeed'...],
      mustHave: ['loading skeleton', 'empty state'...],
    },
    // 20+ route contexts
  },
  flowGraph: {
    nodes: [...],  // Visual nodes for Flow Visualizer
    edges: [...],  // Connections between routes
  },
  designSystem: {
    colors: {...},
    spacing: {...},
    borderRadius: {...},
    glass: {...},
  },
  patterns: {
    loadingState: { code: '...' },
    emptyState: { code: '...' },
  },
}
```

---

## Complete Flow

### Route Audit Flow

```
1. Click route in left panel
         ↓
2. Orchestrator.analyzeRoute() runs:
   • CodeQualityAgent → finds issues → adds why/result
   • DesignSystemAgent → finds UI issues → adds why/result
   • RouteContextAgent → finds missing features
   • MegaThinkAgent → generates proposals
         ↓
3. Dashboard renders route detail:
   • Route context from HelmKnowledge
   • Score (critical/warning/good)
   • Issues | UI Issues | Features
         ↓
4. Click issue → Modal shows:
   • What's wrong
   • ⚠️ Why it matters
   • ✅ After fixing
   • "Send to Agents" button
         ↓
5. Click "Send to Agents":
   • Agents pulse (visual feedback)
   • MDGeneratorAgent builds comprehensive guide
         ↓
6. MD added to queue
         ↓
7. Click MD → Preview modal → "Copy to Clipboard"
         ↓
8. Paste into Claude Code for implementation
```

### Flow Visualizer

```
Click "Flow Visualizer" tab
         ↓
See complete application flow:
• All routes as nodes
• Animated wires showing navigation paths
• Baseball flow (red) | Golf flow (green)
         ↓
Filter by domain:
• All Flows
• ⚾ Baseball only
• ⛳ Golf only
         ↓
Click any node → Sidebar shows:
• Route description
• Expected components
• Connections (incoming/outgoing)
• "Analyze This Route" button
         ↓
Click "Analyze" → Switches to Route Audit tab
```

---

## MD Output Structure

```markdown
# Implementation Guide: Missing Loading State

> 🔴 Bug Fix for `/baseball/dashboard/discover`
> Severity: 🟡 Warning

## 📋 Overview
**What**: Missing loading state
**Why This Matters**: Users see blank screen while data loads
**Expected Result**: Skeleton loading improves perceived performance

## 🎯 Route Context
| Route | `/baseball/dashboard/discover` |
| Domain | Baseball Recruiting |
| Page Type | list |
| Expected Components | SearchBar, FilterPanel, CoachGrid... |

## 🛠️ How to Fix
**Add Loading State**
1. Add isLoading state
2. Show skeleton while loading
3. Use animate-pulse

```tsx
{isLoading ? (
  <div className="animate-pulse space-y-4">
    <div className="h-8 bg-white/5 rounded w-1/2" />
  </div>
) : <YourContent />}
```

## Design System Requirements
**Spacing**: ONLY 4, 8, 12, 16, 24, 32, 48, 64px
**Glass Effects**: ONLY for floating elements
**Transitions**: duration-200 for state changes

## ✅ Verification Steps
- [ ] Issue resolved
- [ ] No TypeScript errors
- [ ] Loading state implemented
- [ ] Mobile responsive
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/routes` | List routes from codebase |
| GET | `/api/flow-graph` | Complete flow graph for visualizer |
| GET | `/api/flow-graph/route/:nodeId` | Route details for sidebar |
| POST | `/api/analyze` | Analyze a route |
| POST | `/api/send-to-agents` | Generate MD |
| GET | `/api/md-queue` | List generated MDs |
| GET | `/api/md/:id` | Get specific MD |
| DELETE | `/api/md/:id` | Remove from queue |
| GET | `/api/knowledge` | HelmKnowledge summary |
| GET | `/api/knowledge/route/:path` | Route context |
| POST | `/api/audit` | Run full audit |

---

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `init` | Server→Client | Initial state |
| `agent:state` | Server→Client | Agent state changes |
| `activity` | Server→Client | Agent activity |
| `route:analyzed` | Server→Client | Analysis complete |
| `md:generated` | Server→Client | New MD ready |
| `audit:complete` | Server→Client | Full audit done |

---

## File Structure

```
ultra-agent-audit/
├── package.json
├── README.md
├── src/
│   ├── server.js              # Express + WebSocket server
│   ├── orchestrator.js        # Main coordinator
│   ├── agents/
│   │   ├── coordination/
│   │   │   ├── base-agent.js         # Base class
│   │   │   └── agent-coordinator.js  # Message routing
│   │   ├── code-quality-agent.js     # 🔍 Code issues
│   │   ├── design-system-agent.js    # 🎨 UI issues
│   │   ├── route-context-agent.js    # 🗺️ Feature validation
│   │   ├── md-generator-agent.js     # 📝 MD generation
│   │   ├── megathink-agent.js        # 🚀 Strategic proposals
│   │   ├── improvement-agent.js      # 🧠 Learning
│   │   ├── visual-analysis-agent.js  # 👁️ Screenshots
│   │   ├── ui-review-agent.js        # 📸 Before/after
│   │   └── index.js                  # Exports
│   ├── controllers/
│   │   ├── mode-controller.js        # Manual/Hybrid/Auto
│   │   └── agent-router.js           # Issue routing
│   ├── context/
│   │   ├── codebase-graph.js         # Route scanning
│   │   ├── pattern-library.js        # Pattern detection
│   │   └── memory.js                 # Persistent learning
│   └── knowledge/
│       └── helm-knowledge.js         # Deep project context
├── public/
│   ├── index.html                    # Dashboard HTML
│   ├── app.js                        # Dashboard JS
│   └── styles.css                    # Premium glassmorphism
├── data/                             # Persisted learning
├── reports/                          # Generated reports
└── screenshots/                      # Captured screenshots
```

---

## Key Principles

1. **NO PAID API CALLS** - All analysis is rule-based + HelmKnowledge
2. **Deep Context** - Agents understand YOUR project structure
3. **User Impact** - Every issue explains WHY it matters
4. **Actionable Output** - MDs are ready for Claude Code
5. **Visual Flow** - See the entire app structure at a glance

---

## Usage Example

```bash
# Start the system
npm start

# Open dashboard
# http://localhost:3333

# Tab 1: Route Audit
# 1. Click route in left panel
# 2. View analysis with score
# 3. Click issue for details
# 4. Click "Send to Agents"
# 5. Copy MD to Claude Code

# Tab 2: Flow Visualizer
# 1. See complete app flow
# 2. Filter by baseball/golf
# 3. Click nodes for details
# 4. Click "Analyze This Route"
```

---

*Built for Helm Sports Labs - Premium multi-sport SaaS*
*v7.0.0 - Two tabs: Route Audit + Flow Visualizer*
