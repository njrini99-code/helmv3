/**
 * UltraAgentOrchestrator - SIMPLIFIED with 5 Ultra Agents
 * 
 * FLOW:
 * 1. Scan codebase → get all routes
 * 2. Click route → analyze with 5 agents → get issues
 * 3. Click issue → see WHY + RESULT
 * 4. Click "Generate Guide" → Builder creates implementation MD
 * 
 * 5 ULTRA AGENTS:
 * 🧠 Brain   - Strategic intelligence, feature gaps
 * 🔍 Code    - Code quality, completeness
 * 🎨 Design  - UI/UX, premium patterns
 * ✅ Quality - Validation, production readiness
 * 📝 Builder - Implementation guides
 */

import EventEmitter from 'events';
import path from 'path';
import { promises as fs } from 'fs';

// Ultra Agents
import { BrainAgent } from './agents/ultra/brain-agent.js';
import { CodeAgent } from './agents/ultra/code-agent.js';
import { DesignAgent } from './agents/ultra/design-agent.js';
import { QualityAgent } from './agents/ultra/quality-agent.js';
import { BuilderAgent } from './agents/ultra/builder-agent.js';

// Core systems
import { AgentCoordinator } from './agents/coordination/agent-coordinator.js';
import { BaseAgent } from './agents/coordination/base-agent.js';

// Context
import { CodebaseGraph } from './context/codebase-graph.js';
import { ProjectMemory } from './context/memory.js';

// Knowledge
import HelmKnowledge from './knowledge/helm-knowledge.js';

export class UltraAgentOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.projectRoot = config.projectRoot || process.cwd();
    this.dataDir = config.dataDir || path.join(this.projectRoot, 'tools', 'ultra-agent-audit', 'data');
    this.reportsDir = config.reportsDir || path.join(this.projectRoot, 'tools', 'ultra-agent-audit', 'reports');
    this.baseUrl = config.baseUrl || 'http://localhost:3000';

    // Knowledge
    this.knowledge = HelmKnowledge;

    // Core systems
    this.coordinator = new AgentCoordinator();
    this.codebaseGraph = new CodebaseGraph(this.projectRoot);
    this.memory = new ProjectMemory(path.join(this.dataDir, 'memory'));

    // 5 ULTRA AGENTS
    this.agents = {
      brain: new BrainAgent(config),
      code: new CodeAgent(config),
      design: new DesignAgent(config),
      quality: new QualityAgent(config),
      builder: new BuilderAgent(config),
    };

    // Cache
    this.routeAnalyses = new Map();

    // State
    this.state = {
      initialized: false,
      running: false,
      lastScan: null,
      selectedRoute: null,
    };

    this.wireEvents();
  }

  /**
   * Wire events
   */
  wireEvents() {
    this.coordinator.on('activity', (a) => this.emit('activity', a));
    this.coordinator.on('agent:state', (s) => this.emit('agent:state', s));
    this.coordinator.on('discovery', (d) => {
      this.memory.recordInsight({
        type: 'agent-discovery',
        summary: d.type,
        details: d.data,
        source: d.agent,
      });
      this.emit('discovery', d);
    });

    // Builder events
    this.agents.builder?.on('discovery', (d) => {
      if (d.type === 'md-generated') {
        this.emit('md:generated', d.data);
      }
    });
  }

  /**
   * Initialize
   */
  async initialize() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🤖 ULTRA AGENT AUDIT v8.0                                   ║
║   5 Ultra-Smart Agents                                        ║
╚═══════════════════════════════════════════════════════════════╝
`);

    // Create directories
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.reportsDir, { recursive: true });

    // Initialize memory
    const memoryStats = await this.memory.initialize();
    console.log(`📚 Memory: ${memoryStats.fixes} fixes, ${memoryStats.patterns} patterns`);

    // Register and initialize agents
    for (const agent of Object.values(this.agents)) {
      this.coordinator.registerAgent(agent);
    }
    await this.coordinator.initializeAll();

    console.log('\n📂 Scanning codebase...');
    const scanResult = await this.codebaseGraph.scan();
    console.log(`   Found ${scanResult.routeCount} routes`);

    this.state.initialized = true;
    this.state.lastScan = scanResult;

    this.emit('system:ready', {
      agents: Object.keys(this.agents),
      routes: scanResult.routeCount,
    });

    console.log(`
✅ System Ready!

   🧠 Brain   - Feature intelligence
   🔍 Code    - Code quality
   🎨 Design  - UI/UX excellence  
   ✅ Quality - Validation
   📝 Builder - Implementation guides
`);

    return scanResult;
  }

  /**
   * Get route summary
   */
  getRouteSummary(routePath) {
    const route = this.codebaseGraph.getRoute(routePath);
    const routeContext = this.knowledge.getRouteContext(routePath);
    const domain = this.knowledge.getRouteDomain(routePath);
    const analysis = this.routeAnalyses.get(routePath);

    return {
      route: routePath,
      domain,
      routeContext,
      code: route?.content,
      lines: route?.lines,
      analysis: analysis || null,
    };
  }

  /**
   * Analyze a route with all 5 agents
   */
  async analyzeRoute(routePath) {
    const route = this.codebaseGraph.getRoute(routePath);
    const content = route?.content || '';
    const routeContext = this.knowledge.getRouteContext(routePath);
    const domain = this.knowledge.getRouteDomain(routePath);

    const result = {
      routePath,
      domain,
      routeContext,
      timestamp: Date.now(),
      
      // All issues combined
      issues: [],
      uiIssues: [],
      features: [],
      
      // Scores
      scores: {},
      
      // Agent results
      agentResults: {},
    };

    console.log(`\n🔍 Analyzing: ${routePath}`);

    // 1. 🧠 BRAIN - Feature intelligence
    this.emit('agent:state', { agent: 'brain', to: 'working' });
    const brainResult = await this.agents.brain.analyze(routePath, content);
    result.agentResults.brain = brainResult.result;
    this.emit('agent:state', { agent: 'brain', to: 'idle' });

    // Add brain suggestions as features
    for (const suggestion of (brainResult.result?.suggestions || [])) {
      result.features.push({
        ...suggestion,
        source: 'brain',
      });
    }

    // Add blocked workflows
    result.blockedWorkflows = brainResult.result?.blockedWorkflows || [];
    result.featureType = brainResult.result?.feature || null;

    // 2. 🔍 CODE - Code quality
    this.emit('agent:state', { agent: 'code', to: 'working' });
    const codeResult = await this.agents.code.analyze(routePath, content);
    result.agentResults.code = codeResult.result;
    result.scores.code = codeResult.result?.score || 100;
    this.emit('agent:state', { agent: 'code', to: 'idle' });

    // Add code issues
    for (const issue of (codeResult.result?.issues || [])) {
      result.issues.push({
        ...issue,
        source: 'code',
      });
    }

    // 3. 🎨 DESIGN - UI/UX
    this.emit('agent:state', { agent: 'design', to: 'working' });
    const designResult = await this.agents.design.analyze(routePath, content);
    result.agentResults.design = designResult.result;
    result.scores.design = designResult.result?.premiumScore || 50;
    this.emit('agent:state', { agent: 'design', to: 'idle' });

    // Add design issues
    for (const issue of (designResult.result?.issues || [])) {
      result.uiIssues.push({
        ...issue,
        source: 'design',
      });
    }

    // Add design enhancements as features
    for (const enhancement of (designResult.result?.enhancements || [])) {
      result.features.push({
        ...enhancement,
        category: 'ui-enhancement',
        severity: 'info',
        source: 'design',
      });
    }

    // 4. ✅ QUALITY - Validation
    this.emit('agent:state', { agent: 'quality', to: 'working' });
    const qualityResult = await this.agents.quality.analyze(routePath, content, {
      brainResult: brainResult.result,
      codeResult: codeResult.result,
      designResult: designResult.result,
    });
    result.agentResults.quality = qualityResult.result;
    result.scores.quality = qualityResult.result?.readinessScore || 100;
    result.isReady = qualityResult.result?.isReady ?? true;
    this.emit('agent:state', { agent: 'quality', to: 'idle' });

    // Add quality blockers as issues
    for (const blocker of (qualityResult.result?.blockers || [])) {
      result.issues.push({
        id: blocker.id,
        title: blocker.name,
        description: blocker.reason,
        severity: 'error',
        category: 'quality-gate',
        source: 'quality',
      });
    }

    // Deduplicate
    result.issues = this.deduplicateIssues(result.issues);
    result.uiIssues = this.deduplicateIssues(result.uiIssues);
    result.features = this.deduplicateIssues(result.features);

    // Calculate overall score
    const scores = Object.values(result.scores).filter(s => typeof s === 'number');
    result.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Cache
    this.routeAnalyses.set(routePath, result);
    this.state.selectedRoute = routePath;

    this.emit('route:analyzed', result);
    
    console.log(`   Score: ${result.score}/100 | Issues: ${result.issues.length} | Features: ${result.features.length}`);

    return result;
  }

  /**
   * Send issue to Builder for MD generation
   */
  async sendToAgents(options) {
    const { type, issue, route, code } = options;

    console.log(`\n📝 Generating guide: ${issue.title}`);

    this.emit('activity', {
      agent: 'coordinator',
      message: `Generating: ${issue.title}`,
      icon: '📝',
      timestamp: Date.now(),
    });

    // Animate agents
    for (const agentId of ['brain', 'code', 'design', 'quality', 'builder']) {
      setTimeout(() => {
        this.emit('agent:state', { agent: agentId, to: 'working' });
      }, Object.keys(this.agents).indexOf(agentId) * 200);
    }

    try {
      // Generate MD with Builder
      this.emit('agent:state', { agent: 'builder', to: 'working' });
      const mdResult = await this.agents.builder.generateMD({
        type,
        issue,
        route,
        code,
      });

      // Reset states
      for (const agentId of Object.keys(this.agents)) {
        this.emit('agent:state', { agent: agentId, to: 'idle' });
      }

      if (!mdResult.success) {
        throw new Error(mdResult.error || 'Generation failed');
      }

      const md = mdResult.result;
      console.log(`   ✅ Generated: ${md.content?.length || 0} chars`);

      this.emit('md:generated', md);
      return md;

    } catch (error) {
      console.error('   ❌ Error:', error.message);
      
      for (const agentId of Object.keys(this.agents)) {
        this.emit('agent:state', { agent: agentId, to: 'idle' });
      }
      
      throw error;
    }
  }

  /**
   * Deduplicate issues
   */
  deduplicateIssues(issues) {
    if (!issues?.length) return [];
    
    const seen = new Map();
    
    for (const issue of issues) {
      const key = (issue.id || issue.title || '')
        .toLowerCase()
        .replace(/^(feature-|advanced-|ui-|code-)/, '')
        .replace(/[^a-z0-9]/g, '-');
      
      if (!seen.has(key)) {
        seen.set(key, issue);
      } else {
        // Keep more detailed version
        const existing = seen.get(key);
        if ((issue.why?.length || 0) > (existing.why?.length || 0)) {
          seen.set(key, issue);
        }
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Get MD queue
   */
  getMDQueue() {
    return this.agents.builder.getQueue();
  }

  getMD(id) {
    return this.agents.builder.getMD(id);
  }

  removeMD(id) {
    return this.agents.builder.removeMD(id);
  }

  /**
   * Mark MD as complete and remove from queue + route analysis
   */
  completeMD(mdId) {
    const md = this.getMD(mdId);
    if (!md) {
      return { success: false, error: 'MD not found' };
    }

    // Get the route and issue
    const { route, issue } = md;

    // Remove from MD queue
    const removed = this.removeMD(mdId);
    if (!removed) {
      return { success: false, error: 'Failed to remove MD from queue' };
    }

    // Remove issue from route analysis
    const analysis = this.routeAnalyses.get(route);
    if (analysis) {
      // Remove from issues array
      if (analysis.issues) {
        analysis.issues = analysis.issues.filter(i => i.id !== issue.id);
      }
      // Remove from uiIssues array
      if (analysis.uiIssues) {
        analysis.uiIssues = analysis.uiIssues.filter(i => i.id !== issue.id);
      }
      // Remove from features array
      if (analysis.features) {
        analysis.features = analysis.features.filter(i => i.id !== issue.id);
      }

      // Update the cached analysis
      this.routeAnalyses.set(route, analysis);

      this.log('info', `✅ Completed: ${issue.title} for ${route}`);
      this.emit('md:completed', { mdId, route, issueId: issue.id });
    }

    return {
      success: true,
      md,
      route,
      issueId: issue.id,
    };
  }

  log(level, message) {
    const prefix = level === 'info' ? 'ℹ️' : level === 'success' ? '✅' : level === 'error' ? '❌' : '📝';
    console.log(`${prefix} [Orchestrator] ${message}`);
  }

  /**
   * Run full audit
   */
  async runFullAudit() {
    console.log('\n🔍 Starting Full Audit...\n');
    
    const routes = this.codebaseGraph.getAllRoutes();
    const results = [];
    const startTime = Date.now();

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      console.log(`[${i + 1}/${routes.length}] ${route.path}`);
      
      const result = await this.analyzeRoute(route.path);
      results.push(result);
    }

    const summary = this.generateAuditSummary(results);
    const reportPath = await this.generateReport(results, summary);

    console.log(`\n📊 Audit Complete!`);
    console.log(`   Routes: ${summary.totalRoutes}`);
    console.log(`   Score: ${summary.averageScore}/100`);
    console.log(`   Issues: ${summary.totalIssues}`);
    console.log(`   Report: ${reportPath}\n`);

    return { results, summary, reportPath };
  }

  /**
   * Generate summary
   */
  generateAuditSummary(results) {
    const allIssues = results.flatMap(r => [...(r.issues || []), ...(r.uiIssues || [])]);
    
    return {
      totalRoutes: results.length,
      averageScore: Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length),
      totalIssues: allIssues.length,
      criticalIssues: allIssues.filter(i => i.severity === 'error').length,
      warnings: allIssues.filter(i => i.severity === 'warning').length,
    };
  }

  /**
   * Generate report
   */
  async generateReport(results, summary) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `audit-${timestamp}.md`;
    const filepath = path.join(this.reportsDir, filename);

    const md = `# 🤖 Ultra Agent Audit Report

Generated: ${new Date().toLocaleString()}

## 📊 Summary

| Metric | Value |
|--------|-------|
| Routes | ${summary.totalRoutes} |
| Average Score | **${summary.averageScore}/100** |
| Total Issues | ${summary.totalIssues} |
| Critical | 🔴 ${summary.criticalIssues} |
| Warnings | 🟡 ${summary.warnings} |

## 🔴 Routes Needing Attention

${results
  .filter(r => r.score < 70)
  .sort((a, b) => a.score - b.score)
  .slice(0, 10)
  .map((r, i) => `${i + 1}. **${r.routePath}** - Score: ${r.score}/100 (${r.issues.length + r.uiIssues.length} issues)`)
  .join('\n')}

---
*Generated by Ultra Agent Audit v8.0 (5 Ultra Agents)*
`;

    await fs.writeFile(filepath, md);
    return filepath;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      state: this.state,
      agents: Object.keys(this.agents).map(id => ({
        id,
        icon: this.agents[id].config.icon,
        description: this.agents[id].config.description,
      })),
      codebase: this.codebaseGraph.getSummary(),
      mdQueue: this.getMDQueue().length,
    };
  }

  /**
   * Get agent states for UI
   */
  getAgentStates() {
    const states = {};
    for (const [id, agent] of Object.entries(this.agents)) {
      states[id] = {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        icon: agent.config.icon,
        color: agent.config.color,
        description: agent.config.description,
        state: 'idle',
        stats: agent.getStats?.() || {},
      };
    }
    return states;
  }

  /**
   * Shutdown
   */
  async shutdown() {
    console.log('\n🛑 Shutting down...');
    await this.memory.save();
    await this.coordinator.shutdownAll();
    this.state.running = false;
    console.log('✅ Done\n');
  }
}

export default UltraAgentOrchestrator;
