/**
 * Ultra Agent Audit Server
 * 
 * TWO TABS:
 * 1. Route Audit - Analyze routes, generate MDs
 * 2. Flow Visualizer - See end-to-end user journeys
 * 
 * NO PAID API CALLS
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';

import { UltraAgentOrchestrator } from './orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3333;
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static dashboard
app.use(express.static(path.join(__dirname, '..', 'public')));

// Create HTTP server
const server = createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });

// Initialize orchestrator
const orchestrator = new UltraAgentOrchestrator({
  projectRoot: PROJECT_ROOT,
  baseUrl: 'http://localhost:3000',
});

// WebSocket clients
const clients = new Set();

// Broadcast to all clients
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// Wire orchestrator events to WebSocket
orchestrator.on('activity', (a) => broadcast('activity', a));
orchestrator.on('agent:state', (s) => broadcast('agent:state', s));
orchestrator.on('discovery', (d) => broadcast('discovery', d));
orchestrator.on('message:routed', (m) => broadcast('message:routed', m));
orchestrator.on('mode:changed', (c) => broadcast('mode:changed', c));
orchestrator.on('route:analyzed', (r) => broadcast('route:analyzed', r));
orchestrator.on('audit:complete', (a) => broadcast('audit:complete', a));
orchestrator.on('md:generated', (m) => broadcast('md:generated', m));
orchestrator.on('md:completed', (c) => broadcast('md:completed', c));
orchestrator.on('pipeline:complete', (p) => broadcast('pipeline:complete', p));

// WebSocket handling
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('📡 Client connected');
  
  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    data: orchestrator.getStatus(),
  }));

  ws.on('message', async (message) => {
    try {
      const { action, payload } = JSON.parse(message);
      
      switch (action) {
        case 'getStatus':
          ws.send(JSON.stringify({ type: 'status', data: orchestrator.getStatus() }));
          break;
        case 'setMode':
          orchestrator.setMode(payload.mode);
          break;
        case 'analyzeRoute':
          const result = await orchestrator.analyzeRoute(payload.routePath);
          ws.send(JSON.stringify({ type: 'route:analyzed', data: result }));
          break;
        case 'sendToAgents':
          const md = await orchestrator.sendToAgents(payload);
          ws.send(JSON.stringify({ type: 'md:generated', data: md }));
          break;
        case 'runFullAudit':
          const audit = await orchestrator.runFullAudit();
          ws.send(JSON.stringify({ type: 'audit:complete', data: audit }));
          break;
        case 'runPipeline':
          const pipeline = await orchestrator.runFeaturePipeline(payload.routePath);
          ws.send(JSON.stringify({ type: 'pipeline:complete', data: pipeline }));
          break;
        case 'completeMD':
          const completeResult = orchestrator.completeMD(payload.mdId);
          ws.send(JSON.stringify({ type: 'md:completed', data: completeResult }));
          broadcast('md:completed', completeResult);
          break;
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ type: 'error', data: { message: error.message } }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('📡 Client disconnected');
  });
});

// ============ REST API ============

// System status
app.get('/api/status', (req, res) => {
  res.json(orchestrator.getStatus());
});

// Agent registry
app.get('/api/agents', (req, res) => {
  res.json(orchestrator.getAgentRegistry());
});

// ============ KNOWLEDGE API ============

// Get all knowledge summary
app.get('/api/knowledge', (req, res) => {
  const knowledge = orchestrator.getKnowledge();
  res.json({
    domains: knowledge.flowGraph?.nodes ? [...new Set(knowledge.flowGraph.nodes.map(n => n.domain).filter(Boolean))] : [],
    routes: Object.keys(knowledge.flowGraph?.routeInfo || {}),
    designSystem: knowledge.designSystem || {},
  });
});

// Get route context from knowledge
app.get('/api/knowledge/route/:path(*)', (req, res) => {
  const routePath = '/' + req.params.path;
  const knowledge = orchestrator.getKnowledge();
  res.json({
    context: knowledge.getRouteContext(routePath),
    domain: knowledge.getRouteDomain(routePath),
    domainInfo: knowledge.getDomain(knowledge.getRouteDomain(routePath)),
  });
});

// ============ FLOW VISUALIZER API ============

// Get complete flow graph for visualizer
app.get('/api/flow-graph', (req, res) => {
  const knowledge = orchestrator.getKnowledge();
  const flowGraph = knowledge.getFlowGraph();
  
  // Enrich nodes with analysis scores if available
  const enrichedNodes = flowGraph.nodes.map(node => {
    const analysis = orchestrator.routeAnalyses.get(node.path);
    return {
      ...node,
      score: analysis?.score,
      issueCount: analysis ? (analysis.issues?.length || 0) + (analysis.uiIssues?.length || 0) : null,
      analyzed: !!analysis,
    };
  });
  
  res.json({
    nodes: enrichedNodes,
    edges: flowGraph.edges,
    routeInfo: flowGraph.routeInfo, // Add routeInfo for filtering
    domains: flowGraph.nodes ? [...new Set(flowGraph.nodes.map(n => n.domain).filter(Boolean))] : [],
    stats: {
      totalNodes: enrichedNodes.length,
      analyzedNodes: enrichedNodes.filter(n => n.analyzed).length,
      baseballNodes: enrichedNodes.filter(n => n.domain === 'baseball').length,
      golfNodes: enrichedNodes.filter(n => n.domain === 'golf').length,
    },
  });
});

// Get route info for visualizer sidebar
app.get('/api/flow-graph/route/:nodeId', (req, res) => {
  const { nodeId } = req.params;
  const knowledge = orchestrator.getKnowledge();
  const flowGraph = knowledge.getFlowGraph();
  
  const node = flowGraph.nodes.find(n => n.id === nodeId);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  const routeContext = knowledge.getRouteContext(node.path);
  const domain = knowledge.getRouteDomain(node.path);
  const analysis = orchestrator.routeAnalyses.get(node.path);
  
  // Find connections
  const outgoing = flowGraph.edges
    .filter(e => e.from === nodeId)
    .map(e => ({
      ...flowGraph.nodes.find(n => n.id === e.to),
      edgeLabel: e.label,
    }));
    
  const incoming = flowGraph.edges
    .filter(e => e.to === nodeId)
    .map(e => ({
      ...flowGraph.nodes.find(n => n.id === e.from),
      edgeLabel: e.label,
    }));
  
  res.json({
    node,
    routeContext,
    domain,
    domainInfo: knowledge.getDomain(domain),
    analysis: analysis ? {
      score: analysis.score,
      issues: analysis.issues?.length || 0,
      uiIssues: analysis.uiIssues?.length || 0,
      features: analysis.features?.length || 0,
    } : null,
    connections: {
      outgoing,
      incoming,
    },
  });
});

// ============ ROUTES API ============

// List all routes from codebase
app.get('/api/routes', (req, res) => {
  const routes = orchestrator.codebaseGraph.getAllRoutes().map(r => ({
    path: r.path,
    domain: r.domain,
    type: r.type,
    lines: r.lines,
    hasClientDirective: r.hasClientDirective,
  }));
  res.json(routes);
});

// Get route summary (click on route)
app.get('/api/route/:path(*)', (req, res) => {
  const routePath = '/' + req.params.path;
  const summary = orchestrator.getRouteSummary(routePath);
  res.json(summary);
});

// Analyze route
app.post('/api/analyze', async (req, res) => {
  try {
    const { routePath } = req.body;
    const result = await orchestrator.analyzeRoute(routePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run full audit
app.post('/api/audit', async (req, res) => {
  try {
    const result = await orchestrator.runFullAudit();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ MD GENERATION API ============

// Send to agents (generate MD)
app.post('/api/send-to-agents', async (req, res) => {
  try {
    const { type, issue, route, code, screenshot } = req.body;
    const md = await orchestrator.sendToAgents({ type, issue, route, code, screenshot });
    res.json(md);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ FEATURE PIPELINE API ============

// Run the smart feature pipeline (Feature → UI Design → Validation)
app.post('/api/pipeline', async (req, res) => {
  try {
    const { routePath } = req.body;
    const result = await orchestrator.runFeaturePipeline(routePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate MD from pipeline result
app.post('/api/pipeline/generate-md', async (req, res) => {
  try {
    const { pipelineResult } = req.body;
    const md = await orchestrator.generatePipelineMD(pipelineResult);
    res.json(md);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get MD queue
app.get('/api/md-queue', (req, res) => {
  const queue = orchestrator.getMDQueue();
  res.json(queue.map(md => ({
    id: md.id,
    title: md.title,
    type: md.type,
    route: md.route,
    generatedAt: md.metadata?.generatedAt,
  })));
});

// Get specific MD
app.get('/api/md/:id', (req, res) => {
  const md = orchestrator.getMD(req.params.id);
  if (md) {
    res.json(md);
  } else {
    res.status(404).json({ error: 'MD not found' });
  }
});

// Remove MD from queue
app.delete('/api/md/:id', (req, res) => {
  const removed = orchestrator.removeMD(req.params.id);
  res.json({ removed });
});

// ============ ACTIVITY & MONITORING API ============

// Activity
app.get('/api/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(orchestrator.getActivity(limit));
});

// Message flow graph (agent communication)
app.get('/api/message-flow', (req, res) => {
  res.json(orchestrator.coordinator.getMessageFlowGraph());
});

// Mode
app.get('/api/mode', (req, res) => {
  res.json({
    mode: orchestrator.getMode(),
    configs: orchestrator.modeController.getModeConfigs(),
  });
});

app.post('/api/mode', (req, res) => {
  try {
    const { mode } = req.body;
    const result = orchestrator.setMode(mode);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Learning/Memory
app.get('/api/learning', (req, res) => {
  res.json({
    memory: orchestrator.memory.getStats(),
    improvement: orchestrator.agents.improvement?.getSummary?.() || {},
    patterns: orchestrator.patternLibrary.getStats(),
  });
});

// Proposals
app.get('/api/proposals', (req, res) => {
  res.json({
    proposals: orchestrator.agents.megathink.proposals,
    roadmap: orchestrator.agents.megathink.generateRoadmap(),
  });
});

// Screenshots
app.get('/api/screenshots', (req, res) => {
  res.json(orchestrator.agents.visualAnalysis?.getAllScreenshots?.() || []);
});

// ============ Server Startup ============

async function start() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🤖 ULTRA AGENT AUDIT SYSTEM                                 ║
║                                                               ║
║   Multi-agent UX auditing with HelmKnowledge                  ║
║   NO PAID API CALLS                                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    // Initialize
    await orchestrator.initialize();

    // Start server
    server.listen(PORT, () => {
      console.log(`
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🌐 Dashboard: http://localhost:${PORT}                       │
│   📡 WebSocket: ws://localhost:${PORT}                         │
│   🔌 REST API:  http://localhost:${PORT}/api                   │
│                                                             │
│   📂 Project: ${PROJECT_ROOT.slice(-40).padStart(42)} │
│                                                             │
│   TABS:                                                     │
│   • Route Audit  - Analyze routes, generate MDs             │
│   • Flow Visualizer - End-to-end user journeys              │
│                                                             │
│   KEY ENDPOINTS:                                            │
│   • GET  /api/routes         - List routes from codebase    │
│   • GET  /api/flow-graph     - Flow visualizer data         │
│   • POST /api/analyze        - Analyze route                │
│   • POST /api/send-to-agents - Generate MD                  │
│   • GET  /api/md-queue       - MD queue                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
`);
    });

  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// Shutdown
process.on('SIGINT', async () => {
  console.log('\n');
  await orchestrator.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await orchestrator.shutdown();
  process.exit(0);
});

// Start
start();
