/**
 * HelmDevOrchestrator - Main entry point that wires everything together
 * 
 * Integrates:
 * - Visual Analysis Agent (Claude Vision)
 * - Improvement Agent (learning)
 * - Agent Coordinator (multi-agent routing)
 * - Mode Controller (manual/autonomous)
 * - Agent Router (click-to-action)
 * - Screenshot Service
 * - Memory System
 * - Codebase Graph
 */

import EventEmitter from 'events';
import path from 'path';
import { promises as fs } from 'fs';

// Core components
import { CodebaseGraph } from './context/codebase-graph.js';
import { PatternLibrary } from './context/pattern-library.js';
import { ProjectMemory } from './context/memory.js';

// Agent system
import { AgentCoordinator } from './agents/coordination/agent-coordinator.js';
import { VisualAnalysisAgent } from './agents/visual-analysis-agent.js';
import { ImprovementAgent } from './agents/improvement-agent.js';

// Controllers
import { ModeController } from './controllers/mode-controller.js';
import { AgentRouter } from './controllers/agent-router.js';

export class HelmDevOrchestrator extends EventEmitter {
  constructor(projectRoot, config = {}) {
    super();
    
    this.projectRoot = projectRoot;
    this.helmdevDir = path.join(projectRoot, '.helmdev');
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      maxParallelAgents: config.maxParallelAgents || 3,
      ...config,
    };
    
    // State
    this.initialized = false;
    this.routeAnalyses = new Map();
    this.screenshotData = new Map();
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('🚀 Initializing HelmDev Orchestrator...');
    
    // Ensure directories exist
    await this.ensureDirectories();
    
    // Initialize core components
    this.graph = new CodebaseGraph(this.projectRoot, 'src/app');
    this.patterns = new PatternLibrary();
    this.memory = new ProjectMemory(this.helmdevDir);
    
    // Load existing data
    await this.memory.load();
    await this.graph.build();
    if (this.patterns.loadFrom) {
      await this.patterns.loadFrom(this.graph);
    }
    
    // Initialize agent coordinator
    this.coordinator = new AgentCoordinator({
      maxParallelAgents: this.config.maxParallelAgents,
    });
    
    // Initialize agents
    this.visualAgent = new VisualAnalysisAgent({
      projectRoot: this.projectRoot,
      codebaseGraph: this.graph,
      memory: this.memory,
    });
    
    this.improvementAgent = new ImprovementAgent(this.memory, null);
    
    // Register agents
    this.coordinator.registerAgent('visual-analysis', this.visualAgent, this.visualAgent.capabilities);
    this.coordinator.registerAgent('improvement', this.improvementAgent, this.improvementAgent.capabilities);
    
    // Initialize controllers
    this.modeController = new ModeController({
      projectRoot: this.projectRoot,
      codebaseGraph: this.graph,
      memory: this.memory,
      agentCoordinator: this.coordinator,
    });
    
    this.agentRouter = new AgentRouter(this.coordinator, null, this.memory);
    
    // Wire up events
    this.setupEventHandlers();
    
    // Start agents
    await this.coordinator.startAgent('visual-analysis');
    await this.coordinator.startAgent('improvement');
    
    this.initialized = true;
    
    console.log('✅ HelmDev Orchestrator ready');
    console.log(`   📁 ${this.graph.files?.size || 0} files discovered`);
    console.log(`   🧠 ${this.memory.totalFixes || 0} fixes in memory`);
    console.log(`   🤖 ${this.coordinator.agents.size} agents registered`);
    
    return this;
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      this.helmdevDir,
      path.join(this.helmdevDir, 'memory'),
      path.join(this.helmdevDir, 'screenshots'),
      path.join(this.helmdevDir, 'issues'),
      path.join(this.helmdevDir, 'prompts'),
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Set up event handlers between components
   */
  setupEventHandlers() {
    // Coordinator events
    this.coordinator.on('agent:discovery', (data) => {
      this.emit('discovery', data);
    });
    
    this.coordinator.on('agent:insight', (data) => {
      this.emit('insight', data);
    });
    
    this.coordinator.on('activity', (data) => {
      this.emit('agent-activity', data);
    });
    
    this.coordinator.on('proposal:evaluated', (data) => {
      this.emit('proposal-evaluated', data);
    });
    
    // Mode controller events
    this.modeController.on('mode:changed', (data) => {
      this.emit('mode-changed', data);
    });
    
    this.modeController.on('fix:completed', async (data) => {
      // Notify improvement agent to learn
      await this.improvementAgent.learnFromFix({
        success: data.success,
        issue: data.issue,
        approach: data.issue?.suggestedFix || 'unknown',
        duration: data.duration,
        routePath: data.context?.routePath,
      });
      
      this.emit('fix-completed', data);
    });
    
    this.modeController.on('fix:failed', async (data) => {
      await this.improvementAgent.learnFromFix({
        success: false,
        issue: data.issue,
        approach: data.issue?.suggestedFix || 'unknown',
        error: data.result?.error || 'Unknown error',
        routePath: data.context?.routePath,
      });
      
      this.emit('fix-failed', data);
    });
    
    // Agent router events
    this.agentRouter.on('routing:start', (data) => {
      this.emit('routing-start', data);
    });
    
    this.agentRouter.on('routing:complete', (data) => {
      this.emit('routing-complete', data);
    });
  }

  /**
   * Store screenshot data for a route
   */
  setScreenshotData(routePath, data) {
    this.screenshotData.set(routePath, data);
  }

  /**
   * Get screenshot data for a route
   */
  getScreenshotData(routePath) {
    return this.screenshotData.get(routePath);
  }

  /**
   * Analyze a single route
   */
  async analyzeRoute(routePath, screenshotData = null) {
    if (!this.initialized) {
      throw new Error('Orchestrator not initialized');
    }
    
    this.emit('route-analysis-start', { routePath });
    
    // Get code content for the route
    const routeInfo = this.graph.getRouteInfo?.(routePath);
    let codeContent = null;
    
    if (routeInfo?.filePath) {
      try {
        codeContent = await fs.readFile(routeInfo.filePath, 'utf8');
      } catch (e) {
        console.warn(`Could not read file for ${routePath}`);
      }
    }
    
    // Use provided screenshot data or stored data
    const screenshots = screenshotData || this.screenshotData.get(routePath);
    
    // Run visual analysis
    const analysis = await this.visualAgent.analyzeRoute(
      routePath,
      screenshots,
      codeContent
    );
    
    // Store result
    this.routeAnalyses.set(routePath, analysis);
    
    this.emit('route-analysis-complete', {
      routePath,
      analysis,
    });
    
    return analysis;
  }

  /**
   * Analyze all routes
   */
  async analyzeAllRoutes() {
    if (!this.initialized) {
      throw new Error('Orchestrator not initialized');
    }
    
    this.emit('scan-start', {
      routeCount: this.screenshotData.size,
    });
    
    const results = [];
    
    for (const [routePath, screenshotData] of this.screenshotData) {
      try {
        const analysis = await this.analyzeRoute(routePath, screenshotData);
        results.push(analysis);
      } catch (error) {
        console.error(`Failed to analyze ${routePath}:`, error.message);
        results.push({
          routePath,
          error: error.message,
        });
      }
    }
    
    this.emit('scan-complete', {
      results,
      total: results.length,
      successful: results.filter(r => !r.error).length,
    });
    
    return results;
  }

  /**
   * Handle suggestion click from dashboard
   */
  async handleSuggestionClick(suggestion, routePath) {
    const routeContext = {
      filePath: this.graph.getRouteInfo?.(routePath)?.filePath,
      purpose: this.routeAnalyses.get(routePath)?.analysis?.routePurpose,
      patterns: this.patterns.getForFile?.(routePath) || [],
      visualScore: this.routeAnalyses.get(routePath)?.scores?.overall,
    };
    
    // Try to get code content
    if (routeContext.filePath) {
      try {
        routeContext.codeContent = await fs.readFile(routeContext.filePath, 'utf8');
      } catch (e) {
        // Code content is optional
      }
    }
    
    const result = await this.agentRouter.routeSuggestion(
      suggestion,
      routePath,
      routeContext
    );
    
    return result;
  }

  /**
   * Apply a fix
   */
  async applyFix(suggestion, routePath, prompt) {
    // Queue the fix
    const fix = this.modeController.queueFix(suggestion, prompt, { routePath });
    
    // In manual mode, just return the queued fix
    if (this.modeController.mode === 'manual' && !fix.autoApproved) {
      return {
        status: 'queued',
        fix,
        message: 'Fix queued for approval',
      };
    }
    
    // For approved/auto-approved fixes, we'd execute here
    // This would integrate with Claude Code dispatcher
    
    return {
      status: 'approved',
      fix,
      message: 'Fix approved - ready for execution',
    };
  }

  /**
   * Set operation mode
   */
  setMode(mode) {
    return this.modeController.setMode(mode);
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.modeController.getMode();
  }

  /**
   * Get comprehensive status for dashboard
   */
  getStatus() {
    return {
      initialized: this.initialized,
      routes: {
        total: this.screenshotData.size,
        analyzed: this.routeAnalyses.size,
      },
      agents: this.coordinator?.getStatus() || {},
      mode: this.modeController?.getStats() || {},
      memory: this.memory?.getStats() || {},
      router: this.agentRouter?.getStats() || {},
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
   * Get activity log
   */
  getActivityLog(limit = 50) {
    return this.coordinator?.getActivityLog(limit) || [];
  }

  /**
   * Get improvement insights
   */
  getInsights() {
    return this.improvementAgent?.generateInsights() || [];
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown() {
    console.log('🛑 Shutting down HelmDev Orchestrator...');
    
    // Save memory
    if (this.memory) {
      await this.memory.save();
    }
    
    // Stop agents
    if (this.coordinator) {
      for (const [name] of this.coordinator.agents) {
        this.coordinator.stopAgent(name);
      }
    }
    
    this.initialized = false;
    console.log('✅ Orchestrator shutdown complete');
  }
}

export default HelmDevOrchestrator;
