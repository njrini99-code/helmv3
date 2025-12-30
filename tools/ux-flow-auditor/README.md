# 🧠 HelmDev - Autonomous Development Orchestration System

> Intelligent, context-aware development automation with Claude Code integration and continuous improvement.

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                      ║
║   ██╗  ██╗███████╗██╗     ███╗   ███╗██████╗ ███████╗██╗   ██╗                       ║
║   ██║  ██║██╔════╝██║     ████╗ ████║██╔══██╗██╔════╝██║   ██║                       ║
║   ███████║█████╗  ██║     ██╔████╔██║██║  ██║█████╗  ██║   ██║                       ║
║   ██╔══██║██╔══╝  ██║     ██║╚██╔╝██║██║  ██║██╔══╝  ╚██╗ ██╔╝                       ║
║   ██║  ██║███████╗███████╗██║ ╚═╝ ██║██████╔╝███████╗ ╚████╔╝                        ║
║   ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝╚═════╝ ╚══════╝  ╚═══╝                         ║
║                                                                                      ║
║   🧠 Autonomous Development Orchestration System                                     ║
║   🔗 Claude Code Integration (Cursor)                                                ║
║   🔍 Continuous Research & Improvement (MegaThink)                                   ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

## 🌟 Overview

HelmDev is an intelligent development orchestration system that:

1. **Deeply understands your codebase** - Builds a complete graph of files, dependencies, patterns, and conventions
2. **Detects issues automatically** - Analyzes for UX problems, accessibility issues, performance concerns, and more
3. **Sends tasks to Claude Code** - Dispatches comprehensive context to Claude Code in Cursor for autonomous fixing
4. **Learns and improves** - Remembers what worked, avoids what failed, continuously researches best practices
5. **Generates improvement proposals** - MegaThink agent identifies opportunities organized by route/dashboard

## 🚀 Quick Start

```bash
# Navigate to the tool directory
cd tools/ux-flow-auditor

# Install dependencies
npm install

# Start HelmDev in supervised mode
npm run helmdev

# Or use the CLI directly
node src/index.js src/app
```

## 📋 Commands

```bash
# Start in supervised mode (default - asks before fixing)
npm run helmdev

# Start in autonomous mode (fixes automatically)
npm run helmdev -- --autonomous

# Run analysis only (no fixing)
npm run analyze

# Run analysis with JSON output
npm run analyze:json

# Run MegaThink improvement session
npm run megathink

# View the dashboard
npm run dashboard
```

## 🏗️ Architecture

```
HelmDev/
├── src/
│   ├── index.js                 # Main orchestrator
│   ├── context/
│   │   ├── codebase-graph.js    # Full codebase understanding
│   │   ├── pattern-library.js   # Pattern detection
│   │   └── memory.js            # Learning from past fixes
│   ├── queue/
│   │   └── task-queue.js        # Intelligent task prioritization
│   ├── claude-code/
│   │   └── dispatcher.js        # Claude Code integration
│   ├── agents/
│   │   └── megathink.js         # Continuous improvement agent
│   └── verification/
│       └── runner.js            # Fix verification
├── scripts/
│   └── analyze_flows.py         # Static analysis (Python)
└── .helmdev/                    # Runtime data (created automatically)
    ├── context/                 # Context files for Claude Code
    ├── tasks/                   # Current task prompts
    ├── results/                 # Task completion results
    ├── improvements/            # MegaThink proposals
    ├── research/                # Research findings
    └── memory/                  # Learning data
```

## 🔧 How It Works

### 1. Codebase Understanding

HelmDev builds a complete graph of your codebase:

- **Files & Dependencies** - Every import/export relationship
- **Routes & Purposes** - What each route does
- **Patterns** - How you write components, forms, data fetching
- **Features** - Search, pagination, filters detected
- **Hotspots** - Most connected/complex files

### 2. Issue Detection

The analyzer detects 40+ issue types including:

| Category | Issues Detected |
|----------|-----------------|
| **UX** | Empty handlers, broken links, missing loading states |
| **Accessibility** | Missing alt text, unlabeled buttons, clickable divs |
| **Forms** | No validation, missing error handling |
| **Performance** | Using `<img>` instead of Next.js Image |
| **TypeScript** | `any` types, ts-ignore comments |
| **Content** | Lorem ipsum, placeholder text, test data |
| **Navigation** | Orphan routes, dead ends, redirect cycles |

### 3. Claude Code Integration

When a fix is dispatched:

1. **Context Files Created** - Full understanding of the file and its relationships
2. **Patterns Documented** - How similar code is written in your codebase
3. **Memory Applied** - What has worked/failed before
4. **Task Prompt Generated** - Comprehensive instructions in `.helmdev/tasks/current-task.md`

**In Cursor with Claude Code, run:**
```
Read .helmdev/tasks/current-task.md and complete the task
```

### 4. MegaThink Agent

The continuous improvement agent:

- Researches best practices via Claude's web search
- Analyzes competitors and trends
- Generates prioritized improvement proposals
- Organizes by route, dashboard, or system-wide
- Creates detailed implementation guides

**Output:**
- `.helmdev/improvements/master-report.md` - All proposals
- `.helmdev/improvements/quick-wins.md` - Low-effort, high-impact
- `.helmdev/improvements/by-route/*.md` - Route-specific
- `.helmdev/improvements/proposals.json` - Machine-readable

### 5. Verification

After Claude Code completes a task:

1. **TypeScript Check** - Compilation must pass
2. **ESLint Check** - No new lint errors
3. **Re-analysis** - Confirm issue is resolved
4. **Regression Check** - No new issues introduced

### 6. Learning

HelmDev remembers:

- **Successful fixes** - What approach worked
- **Failed fixes** - What to avoid
- **Insights** - Patterns that emerge over time
- **Style preferences** - Your code conventions

## 📁 Context Files (For Claude Code)

When a task is dispatched, these files are created:

| File | Purpose |
|------|---------|
| `task-context.md` | Full task details and file information |
| `related-files.md` | Content of dependencies and related files |
| `patterns.md` | **CRITICAL** - Patterns to follow exactly |
| `memory.md` | What has worked/failed before |
| `style-guide.md` | Code style preferences |
| `project-overview.md` | Project structure summary |

## 🎯 Example MegaThink Proposals

### Dashboard Improvements

1. **Add Command Palette (⌘K)** - Quick navigation (Priority: 85)
2. **Add Keyboard Shortcuts** - Power user efficiency (Priority: 70)
3. **Add Real-time Updates** - Live data via Supabase (Priority: 65)
4. **Enhance with Glassmorphism** - Premium visual effects (Priority: 60)

### Route-Specific Proposals

Each route gets tailored proposals based on:
- Its inferred purpose (List View, Detail View, Form, etc.)
- Missing expected features
- Research on best practices
- Comparison with other routes

### Quick Wins

Low-effort, high-impact improvements like:
- Adding loading states
- Adding error boundaries
- Implementing empty states
- Adding proper metadata

## ⚙️ Configuration

Environment variables (optional):

```bash
# Anthropic API key for MegaThink research
ANTHROPIC_API_KEY=sk-...

# Mode: supervised (default), autonomous, manual
HELMDEV_MODE=supervised

# Enable/disable MegaThink
HELMDEV_MEGATHINK=true

# MegaThink interval (hours)
HELMDEV_MEGATHINK_INTERVAL=4
```

## 🛡️ Safety Features

HelmDev is designed to be safe:

1. **Supervised Mode (Default)** - Asks before making changes
2. **TypeScript Verification** - Won't accept broken code
3. **Regression Detection** - Checks for new issues
4. **Memory of Failures** - Avoids repeating mistakes
5. **Context Preservation** - Never hallucinates, always references real code

## 📊 Statistics

HelmDev tracks:

- Tasks completed / failed
- Current streak (consecutive successes)
- Longest streak ever
- Most common fix types
- Average fix time
- Success rate

## 🔮 Roadmap

- [ ] Visual regression testing with screenshots
- [ ] Git integration (auto-commit, PRs)
- [ ] Slack notifications
- [ ] Custom issue types
- [ ] Plugin system

---

## 🙏 Philosophy

HelmDev is built on the principle that **Claude Code works best with comprehensive context**. Instead of expecting Claude to figure everything out, we:

1. Build a deep understanding of your codebase
2. Detect patterns and conventions
3. Learn from past fixes
4. Research best practices
5. Provide all of this context with every task

The result: Fixes that match your codebase style, avoid past mistakes, and follow current best practices.

---

*Built for Helm Sports Labs by Nick with Claude Code*
