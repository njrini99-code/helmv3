# HelmDev Visual Intelligence System v4.0

Screenshot-first route analysis with multi-agent coordination and Claude Vision integration.

## 🚀 Quick Start

```bash
# 1. Make sure your Next.js app is running
cd /path/to/helmv3
npm run dev  # Running on http://localhost:3000

# 2. Capture screenshots first (requires Playwright)
cd tools/ux-flow-auditor
npx playwright install chromium  # First time only
npm run capture:all

# 3. Start the Visual Intelligence dashboard
npm start

# 4. Open dashboard
open http://localhost:3333
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Visual Intelligence Dashboard             │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │ Agent Panel  │  │           Route Grid                 │ │
│  │              │  │  ┌──────────┐ ┌──────────┐          │ │
│  │ 👁️ Visual    │  │  │ Route    │ │ Route    │ ...      │ │
│  │   Analysis   │  │  │ Card     │ │ Card     │          │ │
│  │      ↓       │  │  │ [📸]     │ │ [📸]     │          │ │
│  │ 🧠 Improve-  │  │  │ Score:85 │ │ Score:72 │          │ │
│  │   ment       │  │  │ 3 issues │ │ 5 issues │          │ │
│  │      ↓       │  │  └──────────┘ └──────────┘          │ │
│  │ 🎯 Coordi-   │  │                                      │ │
│  │   nator      │  │  Click suggestion → Generate prompt  │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↕
                    WebSocket (port 3334)
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    HelmDev Orchestrator                      │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ Agent           │  │ Controllers                     │   │
│  │ Coordinator     │  │ ┌─────────────┐ ┌─────────────┐│   │
│  │                 │  │ │ Mode        │ │ Agent       ││   │
│  │ Routes events   │  │ │ Controller  │ │ Router      ││   │
│  │ between agents  │  │ │ Manual/Auto │ │ Click→Fix   ││   │
│  └─────────────────┘  │ └─────────────┘ └─────────────┘│   │
│                       └─────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Agents                                                  ││
│  │ ┌──────────────────┐  ┌───────────────────────────────┐││
│  │ │ Visual Analysis  │  │ Improvement Agent             │││
│  │ │ • Claude Vision  │  │ • Learn from fixes            │││
│  │ │ • Screenshot AI  │  │ • Pattern detection           │││
│  │ │ • Code analysis  │  │ • Success rate tracking       │││
│  │ └──────────────────┘  └───────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
tools/ux-flow-auditor/
├── src/
│   ├── server.js                     # Main server (HTTP + WebSocket)
│   ├── orchestrator.js               # Wires all components together
│   ├── agents/
│   │   ├── coordination/
│   │   │   ├── agent-coordinator.js  # Multi-agent orchestration
│   │   │   └── base-agent.js         # Base agent class
│   │   ├── visual-analysis-agent.js  # Claude Vision integration
│   │   └── improvement-agent.js      # Learning system
│   ├── controllers/
│   │   ├── mode-controller.js        # Manual/Hybrid/Autonomous modes
│   │   └── agent-router.js           # Click-to-action routing
│   └── context/
│       ├── codebase-graph.js         # Code analysis
│       ├── pattern-library.js        # Pattern detection
│       └── memory.js                 # Persistent learning
├── dashboard-v2/
│   ├── index.html                    # Premium dashboard UI
│   ├── styles.css                    # Glassmorphism design
│   └── app.js                        # Dashboard logic
├── snapshots/
│   └── latest/
│       └── screenshots.json          # Captured screenshots
└── package.json
```

## 🎯 Features

### Visual Analysis (Claude Vision)
- Analyzes screenshots to find UI/UX issues
- Detects spacing, alignment, contrast problems
- Suggests feature opportunities
- Scores routes on multiple dimensions

### Multi-Agent Coordination
- Agents communicate via events
- Proposals require validation
- Insights shared between agents
- Activity logged for dashboard

### Learning System
- Tracks successful/failed fixes
- Detects dominant approaches
- Warns about failing patterns
- Suggests proven fixes

### Click-to-Fix
1. Click any suggestion in dashboard
2. Agent router determines best handler
3. Context built from code + visuals
4. Prompt generated with learnings
5. Copy to Claude Code or auto-apply

### Operation Modes
- **Manual**: Approve every fix
- **Hybrid**: Auto-fix simple issues
- **Autonomous**: Full automation with thresholds

## 📊 Dashboard Features

### Route Cards
- Screenshot preview (desktop/mobile toggle)
- Letter grade (A-F) based on score
- Score breakdown (visual, usability, a11y, etc.)
- Version history showing progress
- Clickable suggestions

### Agent Activity Panel
- Real-time agent status
- Flow visualization
- Activity log
- Insights from learning

### Controls
- Mode toggle (Manual/Hybrid/Auto)
- Sort by score/issues/name
- Filter by severity
- Scan all routes

## 🔧 Configuration

### Environment Variables

```bash
# Claude API (required for Vision)
export ANTHROPIC_API_KEY=your-key

# App URL for screenshots
export BASE_URL=http://localhost:3000
```

### Ports
- **3333**: Dashboard HTTP server
- **3334**: WebSocket server
- **3000**: Your Next.js app

## 📸 Screenshot Workflow

The system uses existing Playwright screenshots:

```bash
# Capture screenshots (requires app running on :3000)
npm run capture:all

# Screenshots saved to:
# snapshots/latest/screenshots.json
```

Screenshot format:
```json
{
  "/dashboard": {
    "desktop": "base64-image...",
    "mobile": "base64-image...",
    "capturedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## 🧠 How Claude Vision Works

When you click "Scan All":
1. Screenshots loaded from `snapshots/latest/`
2. For each route, Claude Vision receives:
   - Desktop screenshot
   - Mobile screenshot (if available)
   - Code content for the route
3. Claude analyzes and returns:
   - Overall impression
   - Scores (0-100) for visual, usability, etc.
   - Issues with severity and fix suggestions
   - Feature opportunities
4. Results displayed in dashboard

## 🔄 Typical Workflow

```
1. Start your app          → npm run dev (in helmv3)
2. Capture screenshots     → npm run capture:all
3. Start dashboard         → npm start
4. View routes at          → http://localhost:3333
5. Click "Scan All"        → Claude Vision analyzes
6. Click suggestions       → Get fix prompts
7. Apply fixes             → Copy to Claude Code
8. Re-scan                 → See score improvements
```

## 🎨 Design Philosophy

- **Screenshot-first**: See what users see
- **AI-powered**: Claude Vision finds issues humans miss
- **Learning**: System gets smarter with every fix
- **Premium UI**: editorial-grade glassmorphism
- **Click-to-action**: Suggestions become fixes

## 📝 API

### WebSocket Messages

**From Dashboard:**
```javascript
{ type: 'scan-all' }
{ type: 'refresh-route', data: { routePath: '/dashboard' } }
{ type: 'route-suggestion', data: { suggestion, routePath } }
{ type: 'apply-fix', data: { suggestion, routePath, prompt } }
{ type: 'set-mode', data: { mode: 'autonomous' } }
```

**From Server:**
```javascript
{ type: 'status', data: { agents, mode, memory } }
{ type: 'routes', data: [...analyses] }
{ type: 'route-analysis', data: { routePath, scores, suggestions } }
{ type: 'prompt-generated', data: { prompt } }
{ type: 'agent-activity', data: { agent, level, message } }
```

## 🚨 Troubleshooting

### "No screenshots found"
Run `npm run capture:all` with your app running on port 3000

### "Claude Vision API error"
Check `ANTHROPIC_API_KEY` is set

### "WebSocket connection failed"
Make sure port 3334 is available

### Dashboard not loading
Check port 3333, try `npm start` again

## 🔮 Future Enhancements

- [ ] Auto-capture on route change
- [ ] Diff view between versions
- [ ] Team collaboration mode
- [ ] CI/CD integration
- [ ] Custom detection rules
- [ ] Performance metrics overlay
