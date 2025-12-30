/**
 * ShipCommandHub v5.0.0 - Complete orchestration for shipping helmv3
 * 
 * Integrates:
 * - UI Review Agent (your design system built-in)
 * - Improvement Agent (learning system)
 * - Agent Coordinator (multi-agent)
 * - Production Readiness Analyzer
 * - Issue Tracker (persistent)
 * - Route Flow Analyzer
 * - Ship Score calculation
 * - File watcher for real-time updates
 */

import EventEmitter from 'events';
import path from 'path';
import { promises as fs } from 'fs';
import chokidar from 'chokidar';

// Core analyzers
import { ProductionReadinessAnalyzer } from './analyzers/production-readiness.js';
import { IssueTracker } from './analyzers/issue-tracker.js';
import { RouteFlowAnalyzer } from './analyzers/route-flow-analyzer.js';

// Agents
import { AgentCoordinator } from './agents/coordination/agent-coordinator.js';
import { UIReviewAgent } from './agents/ui-review-agent.js';
import { ImprovementAgent } from './agents/improvement-agent.js';

// Context
import { ProjectMemory } from './context/memory.js';

export class ShipCommandHub extends EventEmitter {
  constructor(projectRoot, config = {}) {
    super();
    
    this.projectRoot = projectRoot;
    this.helmdevDir = path.join(projectRoot, '.helmdev');
    this.appDir = path.join(projectRoot, 'src/app');
    
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      watchFiles: config.watchFiles !== false,
      ...config,
    };
    
    // State
    this.initialized = false;
    this.routeAnalyses = new Map();
    this.screenshotData = new Map();
    this.lastScan = null;
    this.watcher = null;
    
    // Ship score components
    this.shipScore = {
      overall: 0,
      ui: 0,
      production: 0,
      flow: 0,
      issues: 0,
    };
  }

  async initialize() {
    console.log('🚀 Initializing Ship Command Hub v5.0.0...\n');
    
    await this.ensureDirectories();
    
    // Initialize analyzers
    this.productionAnalyzer = new ProductionReadinessAnalyzer(this.projectRoot);
    this.issueTracker = new IssueTracker(this.helmdevDir);
    this.flowAnalyzer = new RouteFlowAnalyzer(this.projectRoot);
    this.memory = new ProjectMemory(this.helmdevDir);
    
    // Load persisted data
    try {
      await this.issueTracker.load();
      console.log(`   📊 Loaded ${this.issueTracker.getAllIssues().length} tracked issues`);
    } catch (e) {
      console.log('   📊 No previous issues found');
    }
    
    try {
      await this.memory.load();
      console.log('   🧠 Memory loaded');
    } catch (e) {
      console.log('   🧠 No previous memory found');
    }
    
    // Initialize agents
    this.coordinator = new AgentCoordinator({ maxParallelAgents: 3 });
    
    this.uiAgent = new UIReviewAgent({ 
      projectRoot: this.projectRoot,
      baseUrl: this.config.baseUrl,
    });
    this.improvementAgent = new ImprovementAgent(this.memory, {});
    
    this.coordinator.registerAgent('ui-review', this.uiAgent, this.uiAgent.capabilities);
    this.coordinator.registerAgent('improvement', this.improvementAgent, this.improvementAgent.capabilities);
    
    // Wire events
    this.setupEventHandlers();
    
    // Start file watcher if enabled
    if (this.config.watchFiles) {
      this.startFileWatcher();
    }
    
    // Start agents
    try {
      await this.coordinator.startAgent('ui-review');
      await this.coordinator.startAgent('improvement');
    } catch (error) {
      console.log('   ⚠️ Some agents failed to start:', error.message);
    }
    
    this.initialized = true;
    
    console.log('\n✅ Ship Command Hub ready');
    console.log(`   📁 Project: ${this.projectRoot}`);
    console.log(`   🔌 Watching: ${this.config.watchFiles ? 'Yes' : 'No'}`);
    console.log(`   📊 Tracked issues: ${this.issueTracker.getAllIssues().length}\n`);
    
    return this;
  }

  async ensureDirectories() {
    const dirs = [
      this.helmdevDir,
      path.join(this.helmdevDir, 'issues'),
      path.join(this.helmdevDir, 'memory'),
      path.join(this.helmdevDir, 'screenshots'),
      path.join(this.helmdevDir, 'reports'),
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  setupEventHandlers() {
    this.coordinator.on('activity', (data) => {
      this.emit('agent-activity', data);
    });
    
    this.coordinator.on('agent:discovery', (data) => {
      this.emit('discovery', data);
    });
    
    this.coordinator.on('agent:insight', (data) => {
      this.emit('insight', data);
    });
  }

  startFileWatcher() {
    const watchPaths = [
      path.join(this.appDir, '**/*.{tsx,jsx,ts,js}'),
    ];
    
    this.watcher = chokidar.watch(watchPaths, {
      ignored: /(node_modules|\.next)/,
      persistent: true,
      ignoreInitial: true,
    });
    
    let debounceTimer = null;
    
    this.watcher.on('change', (filePath) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      
      debounceTimer = setTimeout(() => {
        const relativePath = path.relative(this.projectRoot, filePath);
        console.log(`📝 File changed: ${relativePath}`);
        
        this.emit('file-changed', { filePath: relativePath });
        
        const routePath = this.fileToRoute(relativePath);
        if (routePath) {
          this.emit('route-needs-refresh', { routePath, filePath: relativePath });
        }
      }, 500);
    });
    
    console.log('   👀 File watcher started');
  }

  fileToRoute(filePath) {
    if (!filePath.includes('src/app/')) return null;
    
    let route = filePath.replace('src/app', '').replace(/\/page\.(tsx|jsx|ts|js)$/, '');
    route = route.replace(/\(.*?\)\//g, '');
    return route || '/';
  }

  /**
   * Run complete scan
   */
  async runFullScan() {
    console.log('\n🔍 Running full scan...\n');
    
    this.emit('scan-start', { type: 'full' });
    
    const results = {
      production: null,
      flow: null,
      ui: null,
      timestamp: Date.now(),
    };
    
    // 1. Production readiness
    console.log('📋 Checking production readiness...');
    try {
      results.production = await this.productionAnalyzer.analyze();
      this.emit('scan-progress', { step: 'production', complete: true });
    } catch (error) {
      console.error('   Production analysis error:', error.message);
      results.production = { blockers: [], warnings: [], score: 50 };
    }
    
    // 2. Route flow analysis
    console.log('🔀 Analyzing route flow...');
    try {
      results.flow = await this.flowAnalyzer.analyze();
      this.emit('scan-progress', { step: 'flow', complete: true });
    } catch (error) {
      console.error('   Flow analysis error:', error.message);
      results.flow = { routes: [], issues: { deadPaths: [], brokenLinks: [] }, score: 50 };
    }
    
    // 3. UI review
    console.log('🎨 Running UI reviews...');
    try {
      results.ui = await this.runUIReviews();
      this.emit('scan-progress', { step: 'ui', complete: true });
    } catch (error) {
      console.error('   UI review error:', error.message);
      results.ui = [];
    }
    
    // 4. Update issue tracker
    await this.updateIssueTracker(results);
    
    // 5. Calculate ship score
    this.calculateShipScore(results);
    
    // Store results
    this.lastScan = results;
    
    const issueStats = this.issueTracker.getStats();
    
    this.emit('scan-complete', {
      results,
      shipScore: this.shipScore,
      issueStats,
      issueCount: issueStats.byStatus?.open || 0,
    });
    
    console.log('\n✅ Scan complete');
    console.log(`   🚢 Ship Score: ${this.shipScore.overall}/100`);
    console.log(`   📊 Open Issues: ${issueStats.byStatus?.open || 0}`);
    
    return results;
  }

  async runUIReviews() {
    const reviews = [];
    
    for (const [routePath, screenshotData] of this.screenshotData) {
      try {
        let codeContent = null;
        const route = this.flowAnalyzer.routes?.get(routePath);
        if (route?.fullPath) {
          try {
            codeContent = await fs.readFile(route.fullPath, 'utf8');
          } catch (e) {}
        }
        
        const review = await this.uiAgent.reviewRoute(routePath, screenshotData, codeContent);
        reviews.push(review);
        this.routeAnalyses.set(routePath, review);
        this.emit('route-reviewed', { routePath, review });
      } catch (error) {
        console.error(`Error reviewing ${routePath}:`, error.message);
      }
    }
    
    return reviews;
  }

  async updateIssueTracker(results) {
    for (const blocker of results.production?.blockers || []) {
      await this.issueTracker.upsertIssue({
        ...blocker,
        severity: 'blocker',
        source: 'production-readiness',
      });
    }
    
    for (const warning of results.production?.warnings || []) {
      await this.issueTracker.upsertIssue({
        ...warning,
        source: 'production-readiness',
      });
    }
    
    for (const deadPath of results.flow?.issues?.deadPaths || []) {
      await this.issueTracker.upsertIssue({
        category: 'navigation',
        title: `Dead path: ${deadPath.route}`,
        ...deadPath,
        source: 'route-flow',
      });
    }
    
    for (const brokenLink of results.flow?.issues?.brokenLinks || []) {
      await this.issueTracker.upsertIssue({
        category: 'navigation',
        title: `Broken link: ${brokenLink.from} → ${brokenLink.to}`,
        ...brokenLink,
        source: 'route-flow',
      });
    }
    
    for (const uiReview of results.ui || []) {
      for (const suggestion of uiReview.suggestions || []) {
        await this.issueTracker.upsertIssue({
          ...suggestion,
          routePath: uiReview.routePath,
          source: 'ui-review',
        });
      }
    }
  }

  calculateShipScore(results) {
    const productionScore = results.production?.score || 0;
    const flowScore = results.flow?.score || 0;
    
    const uiScores = (results.ui || [])
      .filter(r => r.review?.scores?.overall)
      .map(r => r.review.scores.overall);
    const avgUIScore = uiScores.length > 0
      ? Math.round(uiScores.reduce((a, b) => a + b, 0) / uiScores.length)
      : 50;
    
    const stats = this.issueTracker.getStats();
    const openBlockers = stats.bySeverity?.blocker || 0;
    const openErrors = stats.bySeverity?.error || 0;
    const issueScore = Math.max(0, 100 - (openBlockers * 20) - (openErrors * 5));
    
    this.shipScore = {
      overall: Math.round(
        productionScore * 0.4 +
        flowScore * 0.2 +
        avgUIScore * 0.3 +
        issueScore * 0.1
      ),
      production: productionScore,
      flow: flowScore,
      ui: avgUIScore,
      issues: issueScore,
      status: this.getShipStatus(productionScore, openBlockers),
    };
    
    return this.shipScore;
  }

  getShipStatus(productionScore, openBlockers) {
    if (openBlockers > 0) return { status: 'blocked', message: `${openBlockers} blocker(s) must be fixed`, color: 'red' };
    if (productionScore >= 90) return { status: 'ready', message: 'Ready to ship! 🚀', color: 'green' };
    if (productionScore >= 70) return { status: 'almost', message: 'Almost ready - review warnings', color: 'yellow' };
    return { status: 'needs-work', message: 'Needs more work before shipping', color: 'orange' };
  }

  setScreenshotData(routePath, data) {
    this.screenshotData.set(routePath, data);
  }

  async refreshRoute(routePath) {
    const screenshotData = this.screenshotData.get(routePath);
    
    let codeContent = null;
    const route = this.flowAnalyzer.routes?.get(routePath);
    if (route?.fullPath) {
      try {
        codeContent = await fs.readFile(route.fullPath, 'utf8');
      } catch (e) {}
    }
    
    const review = await this.uiAgent.reviewRoute(routePath, screenshotData, codeContent);
    this.routeAnalyses.set(routePath, review);
    
    for (const suggestion of review.suggestions || []) {
      await this.issueTracker.upsertIssue({
        ...suggestion,
        routePath,
        source: 'ui-review',
      });
    }
    
    this.emit('route-refreshed', { routePath, review });
    
    return review;
  }

  /**
   * Generate Intelligence Brief for fixing an issue
   */
  async generateFixPrompt(issueId) {
    const issue = this.issueTracker.issues.get(issueId);
    if (!issue) return null;
    
    // Get learnings from improvement agent
    let learnings = null;
    try {
      learnings = this.improvementAgent.getRecommendedApproach(issue.category);
    } catch (e) {}
    
    // Get affected personas
    let personas = [];
    try {
      personas = this.improvementAgent.getAffectedPersonas(issue.routePath || issue.file || '');
    } catch (e) {}
    
    // Get verification steps
    let verification = [];
    try {
      verification = this.improvementAgent.getVerificationSteps(issue.category);
    } catch (e) {}

    const prompt = `# 🎯 Intelligence Brief: ${issue.title}

**Generated**: ${new Date().toLocaleString()}
**Issue ID**: \`${issueId}\`
**Status**: ${issue.status}

---

## 📋 TL;DR

| Aspect | Detail |
|--------|--------|
| **Severity** | ${this.getSeverityIcon(issue.severity)} ${issue.severity || 'warning'} |
| **Category** | ${issue.category} |
| **File** | \`${issue.file || 'N/A'}\` |
| **Line** | ${issue.line || 'N/A'} |
| **Est. Fix Time** | ${this.getEstimatedTime(issue.category)} |

---

${personas.length > 0 ? `## 👤 WHO: Affected Users

${personas.map(p => `### ${p.name}

**Goals**: ${p.goals.join(', ')}

**This issue blocks/degrades**: Their ability to ${p.goals[0]?.toLowerCase() || 'use the feature'}.
`).join('\n')}

---

` : ''}## 🔍 WHAT: The Problem

### Issue Description
${issue.description || issue.title}

### Why This Matters
${this.getCategoryImpact(issue.category)}

---

## 📍 WHERE: Exact Location

### Primary File
\`${issue.file || issue.routePath || 'N/A'}\`

${issue.line ? `### Line Number
Line ${issue.line}
` : ''}
---

## 🔧 HOW: The Fix

### Goal
${issue.suggestedFix || issue.fix || 'Analyze and implement the best solution'}

${learnings ? `### Recommended Approach
${learnings.approach}

**Success Rate**: ${Math.round((learnings.successRate || 0) * 100)}%

${learnings.commonMistakes?.length > 0 ? `### ⚠️ Common Mistakes to Avoid
${learnings.commonMistakes.map(m => `- ${m}`).join('\n')}
` : ''}
${learnings.tips?.length > 0 ? `### 💡 Tips
${learnings.tips.map(t => `- ${t}`).join('\n')}
` : ''}` : ''}

### Design System Rules
- Spacing: Use 4, 8, 12, 16, 24, 32, 48, 64px only
- Radii: 8px (inputs), 12px (buttons), 16px (cards), 24px (modals)
- Glass: Only on nav, toolbars, modals - NOT on tables, forms
- Always add transitions to hover states

---

${verification.length > 0 ? `## ✅ VERIFICATION

After applying the fix, verify:

${verification.map((v, i) => `${i + 1}. ${v}`).join('\n')}

---

` : ''}## 🎨 Design System Quick Reference

| Element | Value |
|---------|-------|
| **Spacing** | 4, 8, 12, 16, 24, 32, 48, 64px |
| **Card Radius** | 16px (rounded-2xl) |
| **Button Radius** | 12px (rounded-xl) |
| **Input Radius** | 8px (rounded-lg) |
| **Transitions** | 150ms hover, 220ms state |
| **Glass** | Nav, toolbars, modals only |

---

*Generated by Ship Command Hub v5.0.0*
*Issue ID: ${issueId}*
`;

    return prompt;
  }

  getSeverityIcon(severity) {
    const icons = {
      blocker: '🔴',
      error: '🟠',
      warning: '🟡',
      info: '🔵',
    };
    return icons[severity] || '🟡';
  }

  getEstimatedTime(category) {
    const times = {
      'loading': '10-15 min',
      'error-handling': '15-20 min',
      'console-statements': '5-10 min',
      'type-safety': '15-30 min',
      'navigation': '10-15 min',
      'accessibility': '20-30 min',
      'design-system': '15-20 min',
      'performance': '30-60 min',
      'security': '30-60 min',
    };
    return times[category] || '15-20 min';
  }

  getCategoryImpact(category) {
    const impacts = {
      'loading': 'Missing loading states cause confusion - users don\'t know if the app is working or broken. They may leave.',
      'error-handling': 'Without proper error handling, users see cryptic error messages or white screens. This destroys trust.',
      'console-statements': 'Console logs in production expose internal details and look unprofessional. Security risk.',
      'type-safety': 'Type errors can cause runtime crashes. TypeScript exists to catch these before users do.',
      'navigation': 'Broken links and dead paths frustrate users. They lose confidence in the app.',
      'accessibility': 'Inaccessible features exclude users with disabilities. Also affects SEO and usability.',
      'design-system': 'Inconsistent design makes the app feel unprofessional. Premium feel requires consistency.',
      'performance': 'Slow pages lose users. Every 100ms of delay costs conversions.',
      'security': 'Security issues can expose user data. Legal liability and reputation damage.',
    };
    return impacts[category] || 'This issue affects user experience and should be addressed.';
  }

  /**
   * Mark issue as fixed
   */
  async markIssueFixed(issueId, note = '') {
    const result = await this.issueTracker.markAsFixed(issueId, note);
    
    if (result) {
      const issue = this.issueTracker.issues.get(issueId);
      if (issue) {
        await this.improvementAgent.learnFromFix({
          success: true,
          issue,
          approach: issue.suggestedFix || 'manual fix',
          duration: 0,
        });
      }
      
      this.emit('issue-fixed', { issueId });
    }
    
    return result;
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      shipScore: this.shipScore,
      routes: {
        total: this.flowAnalyzer.routes?.size || 0,
        analyzed: this.routeAnalyses.size,
        withScreenshots: this.screenshotData.size,
      },
      issues: this.issueTracker.getStats(),
      agents: this.coordinator?.getStatus() || {},
      lastScan: this.lastScan?.timestamp,
    };
  }

  /**
   * Get all route analyses
   */
  getRouteAnalyses() {
    const analyses = [];
    for (const [routePath, analysis] of this.routeAnalyses) {
      analyses.push({
        routePath,
        ...analysis,
        screenshots: this.screenshotData.get(routePath),
      });
    }
    return analyses;
  }

  /**
   * Get quick fixes grouped by category
   */
  getQuickFixes() {
    const openIssues = this.issueTracker.getByStatus('open');
    
    return [
      {
        id: 'fix-console',
        title: 'Remove all console statements',
        count: openIssues.filter(i => (i.title || '').toLowerCase().includes('console')).length,
        type: 'batch',
      },
      {
        id: 'fix-loading',
        title: 'Add missing loading states',
        count: openIssues.filter(i => (i.title || '').toLowerCase().includes('loading')).length,
        type: 'generate',
      },
      {
        id: 'fix-errors',
        title: 'Add error boundaries',
        count: openIssues.filter(i => (i.title || '').toLowerCase().includes('error') && !(i.title || '').toLowerCase().includes('console')).length,
        type: 'generate',
      },
      {
        id: 'fix-dead-paths',
        title: 'Fix dead navigation paths',
        count: openIssues.filter(i => i.category === 'navigation').length,
        type: 'list',
      },
    ];
  }

  /**
   * Shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Ship Command Hub...');
    
    if (this.watcher) {
      await this.watcher.close();
    }
    
    try {
      await this.issueTracker.save();
      await this.memory.save();
    } catch (e) {}
    
    if (this.coordinator) {
      for (const [name] of this.coordinator.agents) {
        this.coordinator.stopAgent(name);
      }
    }
    
    this.initialized = false;
    console.log('✅ Shutdown complete');
  }
}

export default ShipCommandHub;
