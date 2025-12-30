/**
 * Ship Command Hub Server v5.0.0
 * 
 * Uses the REAL ShipCommandHub with all agents and analyzers
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the REAL ShipCommandHub, not orchestrator
import { ShipCommandHub } from './ship-command-hub.js';
import IntelligenceBriefGenerator from './intelligence-brief-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  httpPort: 3333,
  wsPort: 3334,
  projectRoot: path.resolve(__dirname, '../../..'), // helmv3 root
  baseUrl: 'http://localhost:3000',
};

class ShipCommandServer {
  constructor(config) {
    this.config = config;
    this.hub = null;
    this.briefGenerator = null;
    this.httpServer = null;
    this.wss = null;
    this.clients = new Set();
  }

  async start() {
    console.log('\n🚢 Starting Ship Command Hub Server v5.0.0...\n');

    // Initialize the REAL ShipCommandHub with all agents
    this.hub = new ShipCommandHub(this.config.projectRoot, {
      baseUrl: this.config.baseUrl,
      watchFiles: true,
    });

    try {
      await this.hub.initialize();
      
      // Initialize Intelligence Brief Generator with hub's components
      this.briefGenerator = new IntelligenceBriefGenerator(
        this.hub.knowledge,
        this.hub.issueTracker,
        this.hub.improvementAgent,
        this.config.projectRoot
      );
    } catch (error) {
      console.error('⚠️  Hub initialization error:', error.message);
      console.log('   Server will continue with limited functionality\n');
    }

    // Wire hub events to WebSocket broadcasts
    this.setupHubEvents();

    // Start HTTP server
    await this.startHttpServer();

    // Start WebSocket server
    this.startWebSocketServer();

    console.log('\n✅ Ship Command Hub Server Ready!');
    console.log(`   📊 Dashboard:  http://localhost:${this.config.httpPort}`);
    console.log(`   📊 Dashboard v2: http://localhost:${this.config.httpPort}/v2`);
    console.log(`   🔌 WebSocket:  ws://localhost:${this.config.wsPort}`);
    console.log(`   📁 Project:    ${this.config.projectRoot}\n`);
  }

  setupHubEvents() {
    if (!this.hub) return;

    // Forward all hub events to WebSocket clients
    const events = [
      'discovery',
      'insight',
      'agent-activity',
      'mode-changed',
      'fix-completed',
      'fix-failed',
      'route-reviewed',
      'route-refreshed',
      'route-needs-refresh',
      'file-changed',
      'scan-start',
      'scan-progress',
      'scan-complete',
      'issue-fixed',
    ];

    for (const event of events) {
      this.hub.on(event, (data) => {
        this.broadcast({
          type: event,
          data,
          timestamp: Date.now(),
        });
      });
    }
  }

  async startHttpServer() {
    const dashboardDir = path.join(__dirname, '../dashboard');
    const dashboardV2Dir = path.join(__dirname, '../dashboard-v2');
    const dashboardV3Dir = path.join(__dirname, '../dashboard-v3');
    const dashboardV6Dir = path.join(__dirname, '../dashboard-v6');

    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let filePath = new URL(req.url, `http://localhost:${this.config.httpPort}`).pathname;
      
      // DEFAULT TO V6 - Path Scanner dashboard
      let servingDir = dashboardV6Dir;
      
      if (filePath.startsWith('/v2')) {
        servingDir = dashboardV2Dir;
        filePath = filePath.replace('/v2', '') || '/';
      } else if (filePath.startsWith('/v3')) {
        servingDir = dashboardV3Dir;
        filePath = filePath.replace('/v3', '') || '/';
      } else if (filePath.startsWith('/v6')) {
        filePath = filePath.replace('/v6', '') || '/';
      } else if (filePath.startsWith('/old')) {
        servingDir = dashboardDir;
        filePath = filePath.replace('/old', '') || '/';
      }
      
      if (filePath === '/') filePath = '/index.html';

      const fullPath = path.join(servingDir, filePath);

      try {
        const content = await fs.readFile(fullPath);
        const ext = path.extname(fullPath);
        const types = { 
          '.html': 'text/html', 
          '.css': 'text/css', 
          '.js': 'application/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
        res.end(content);
      } catch {
        try {
          const fallbackPath = path.join(dashboardV2Dir, filePath);
          const content = await fs.readFile(fallbackPath);
          const ext = path.extname(fallbackPath);
          const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
          res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
    });

    return new Promise((resolve) => {
      this.httpServer.listen(this.config.httpPort, () => {
        console.log(`📊 HTTP server on port ${this.config.httpPort}`);
        resolve();
      });
    });
  }

  startWebSocketServer() {
    this.wss = new WebSocketServer({ port: this.config.wsPort });

    this.wss.on('connection', (ws) => {
      console.log('📡 Dashboard connected');
      this.clients.add(ws);

      // Send initial state
      ws.send(JSON.stringify({ 
        type: 'status', 
        data: { 
          initialized: !!this.hub?.initialized,
          shipScore: this.hub?.shipScore,
        } 
      }));

      if (this.hub) {
        // Send current issues
        const issues = this.hub.issueTracker?.getAllIssues() || [];
        ws.send(JSON.stringify({ type: 'issues', data: issues }));

        // Send current routes
        const routes = this.hub.flowAnalyzer?.getRoutes?.() || 
                       Array.from(this.hub.flowAnalyzer?.routes?.values() || []);
        ws.send(JSON.stringify({ type: 'routes', data: routes }));

        // Send quick fixes
        const quickFixes = this.hub.getQuickFixes?.() || [];
        ws.send(JSON.stringify({ type: 'quick-fixes', data: quickFixes }));
      }

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (e) {
          console.error('Message error:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('📡 Dashboard disconnected');
      });
    });

    console.log(`🔌 WebSocket server on port ${this.config.wsPort}`);
  }

  async handleMessage(ws, data) {
    const { type } = data;

    switch (type) {
      case 'get-status':
        ws.send(JSON.stringify({
          type: 'status',
          data: this.hub?.getStatus?.() || { initialized: false },
        }));
        break;

      case 'get-routes':
        await this.handleGetRoutes(ws);
        break;

      case 'get-issues':
        await this.handleGetIssues(ws);
        break;

      case 'scan':
        await this.handleScan(ws);
        break;

      case 'scan-route':
        await this.handleScanRoute(ws, data);
        break;

      case 'generate-prompt':
        await this.handleGeneratePrompt(ws, data);
        break;

      case 'mark-fixed':
        await this.handleMarkFixed(ws, data);
        break;

      case 'quick-action':
        await this.handleQuickAction(ws, data);
        break;

      case 'get-checklist':
        await this.handleGetChecklist(ws);
        break;

      case 'get-flow':
        await this.handleGetFlow(ws);
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }

  async handleGetRoutes(ws) {
    const routes = this.hub?.flowAnalyzer?.getRoutes?.() || 
                   Array.from(this.hub?.flowAnalyzer?.routes?.values() || []);
    ws.send(JSON.stringify({ type: 'routes', data: routes }));
  }

  async handleGetIssues(ws) {
    const issues = this.hub?.issueTracker?.getAllIssues() || [];
    ws.send(JSON.stringify({ type: 'issues', data: issues }));
  }

  async handleScan(ws) {
    if (!this.hub) {
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Hub not initialized' } }));
      return;
    }

    console.log('\n🔍 Starting full scan...');

    try {
      // Use the hub's full scan which runs all analyzers and agents
      const results = await this.hub.runFullScan();

      // Send results
      const allIssues = this.hub.issueTracker?.getAllIssues() || [];
      const routes = Array.from(this.hub.flowAnalyzer?.routes?.values() || []);

      ws.send(JSON.stringify({ type: 'issues', data: allIssues }));
      ws.send(JSON.stringify({ type: 'routes', data: routes }));
      ws.send(JSON.stringify({ type: 'ship-score', data: this.hub.shipScore }));

      console.log(`   Found ${allIssues.length} issues across ${routes.length} routes\n`);
    } catch (error) {
      console.error('Scan error:', error);
      this.broadcast({ type: 'scan-error', data: { message: error.message } });
    }
  }

  async handleScanRoute(ws, data) {
    const { routePath } = data;
    if (!this.hub || !routePath) return;

    console.log(`\n🔍 Scanning route: ${routePath}`);

    try {
      const result = await this.hub.refreshRoute(routePath);
      ws.send(JSON.stringify({ type: 'route-reviewed', data: { routePath, review: result } }));
    } catch (error) {
      console.error('Route scan error:', error);
    }
  }

  async handleGeneratePrompt(ws, data) {
    const { issueId, suggestion, routePath } = data;

    let prompt;

    if (issueId) {
      // Try Intelligence Brief Generator first
      if (this.briefGenerator) {
        try {
          prompt = await this.briefGenerator.generateBrief(issueId);
        } catch (e) {
          console.error('Brief generation error:', e);
        }
      }
      
      // Fallback to hub's prompt generator
      if (!prompt && this.hub) {
        prompt = await this.hub.generateFixPrompt(issueId);
      }
    } else if (suggestion && routePath) {
      prompt = this.generateSuggestionPrompt(suggestion, routePath);
    }

    ws.send(JSON.stringify({ type: 'prompt-generated', data: { prompt: prompt || 'Unable to generate prompt' } }));
  }

  generateSuggestionPrompt(suggestion, routePath) {
    const domain = routePath?.includes('/golf/') ? '⛳ Golf' : '⚾ Baseball';
    
    return `# 🎯 Intelligence Brief: ${suggestion.title}

**Generated**: ${new Date().toLocaleString()}
**Route**: \`${routePath}\`
**Domain**: ${domain}

---

## 📋 TL;DR

| Aspect | Detail |
|--------|--------|
| **Severity** | ${suggestion.severity || 'warning'} |
| **Category** | ${suggestion.category || 'general'} |
| **Route** | \`${routePath}\` |

---

## 🔍 WHAT: The Problem

${suggestion.description || suggestion.title}

---

## 🔧 HOW: The Fix

${suggestion.suggestedFix || suggestion.fix || 'Implement the appropriate fix'}

### Design System Reference

| Element | Value |
|---------|-------|
| **Spacing** | 4, 8, 12, 16, 24, 32, 48, 64px |
| **Card Radius** | 16px (rounded-2xl) |
| **Button Radius** | 12px (rounded-xl) |
| **Input Radius** | 8px (rounded-lg) |
| **Transitions** | 150ms hover, 220ms state |

---

## ✅ VERIFICATION

1. No TypeScript errors: \`npx tsc --noEmit\`
2. Route renders correctly
3. Manual visual inspection looks correct

---

*Generated by Ship Command Hub*
`;
  }

  async handleMarkFixed(ws, data) {
    if (!this.hub) return;

    const result = await this.hub.markIssueFixed(data.issueId);

    if (result) {
      // Send updated issues
      const issues = this.hub.issueTracker?.getAllIssues() || [];
      this.broadcast({ type: 'issues', data: issues });
    }
  }

  async handleQuickAction(ws, data) {
    const { action } = data;
    
    if (!this.hub) {
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Hub not initialized' } }));
      return;
    }
    
    console.log(`Quick action: ${action}`);
    
    const allIssues = (this.hub.issueTracker?.getAllIssues() || []).filter(i => i.status === 'open');
    let matchingIssues = [];
    
    switch (action) {
      case 'fix-console':
      case 'console-logs':
        matchingIssues = allIssues.filter(i => (i.title || '').toLowerCase().includes('console'));
        break;
      case 'fix-loading':
      case 'loading-states':
        matchingIssues = allIssues.filter(i => (i.title || '').toLowerCase().includes('loading'));
        break;
      case 'fix-dead-paths':
      case 'navigation':
        matchingIssues = allIssues.filter(i => i.category === 'navigation');
        break;
      case 'error-handling':
        matchingIssues = allIssues.filter(i => 
          (i.title || '').toLowerCase().includes('error') && 
          !(i.title || '').toLowerCase().includes('console')
        );
        break;
    }
    
    if (matchingIssues.length === 0) {
      ws.send(JSON.stringify({ 
        type: 'agent-activity', 
        data: { agent: 'coordinator', message: `No ${action} issues found` } 
      }));
      return;
    }
    
    // Generate batch prompt
    let batchPrompt;
    
    if (this.briefGenerator) {
      try {
        const issueIds = matchingIssues.map(i => i.id);
        batchPrompt = await this.briefGenerator.generateBatchBrief(issueIds);
      } catch (e) {
        console.error('Batch brief error:', e);
      }
    }
    
    if (!batchPrompt) {
      batchPrompt = `# Batch Fix: ${action}\n\n**Issues**: ${matchingIssues.length}\n\n` +
        matchingIssues.map((issue, i) => `${i + 1}. ${issue.title}\n   File: ${issue.file || 'N/A'}`).join('\n\n');
    }
    
    ws.send(JSON.stringify({ 
      type: 'batch-prompt', 
      data: { 
        action,
        count: matchingIssues.length,
        prompt: batchPrompt,
      } 
    }));
  }

  async handleGetChecklist(ws) {
    if (!this.hub) return;
    
    const issues = this.hub.issueTracker?.getAllIssues() || [];
    const openIssues = issues.filter(i => i.status === 'open');
    
    const checklist = {
      passed: [],
      blockers: openIssues.filter(i => i.severity === 'blocker'),
      warnings: openIssues.filter(i => i.severity !== 'blocker'),
    };
    
    ws.send(JSON.stringify({ type: 'checklist', data: checklist }));
  }

  async handleGetFlow(ws) {
    if (!this.hub?.flowAnalyzer) return;
    
    const flowData = this.hub.flowAnalyzer.getFlowGraph?.() || { nodes: [], edges: [] };
    ws.send(JSON.stringify({ type: 'flow-graph', data: flowData }));
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  async stop() {
    console.log('\n🛑 Stopping server...');

    if (this.hub) {
      await this.hub.shutdown?.();
    }

    if (this.wss) {
      this.wss.close();
    }

    if (this.httpServer) {
      this.httpServer.close();
    }

    console.log('✅ Server stopped');
  }
}

// Start server
const server = new ShipCommandServer(CONFIG);

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

server.start().catch(console.error);
