#!/usr/bin/env node
/**
 * Orchestrator Bridge
 * 
 * This module bridges the ES Module orchestrator with the CJS dashboard.
 * It runs as a separate process and communicates via HTTP/WebSocket.
 * 
 * The bridge provides:
 * - Full CodebaseGraph analysis
 * - PatternLibrary detection  
 * - MegaThinkAgent proposals
 * - VerificationRunner checks
 * - ProjectMemory with learning
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

import { CodebaseGraph } from './context/codebase-graph.js';
import { PatternLibrary } from './context/pattern-library.js';
import { ProjectMemory } from './context/memory.js';
import { TaskQueue } from './queue/task-queue.js';
import { ClaudeCodeDispatcher } from './claude-code/dispatcher.js';
import { MegaThinkAgent } from './agents/megathink.js';
import { VerificationRunner } from './verification/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.BRIDGE_PORT || 3334;
const PROJECT_ROOT = path.resolve(__dirname, '../../../'); // helmv3 root
const APP_DIR = 'src/app';

class OrchestratorBridge {
  constructor() {
    this.projectRoot = PROJECT_ROOT;
    this.appDir = APP_DIR;
    this.helmdevDir = path.join(PROJECT_ROOT, '.helmdev');
    this.initialized = false;
    
    // Core systems
    this.graph = null;
    this.patterns = null;
    this.memory = null;
    this.queue = null;
    this.dispatcher = null;
    this.megaThink = null;
    this.verifier = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('🚀 Initializing Orchestrator Bridge...');
    console.log(`   Project: ${this.projectRoot}`);
    console.log(`   App Dir: ${this.appDir}`);
    
    // Ensure directories
    await fs.mkdir(this.helmdevDir, { recursive: true });
    await fs.mkdir(path.join(this.helmdevDir, 'context'), { recursive: true });
    await fs.mkdir(path.join(this.helmdevDir, 'tasks'), { recursive: true });
    await fs.mkdir(path.join(this.helmdevDir, 'results'), { recursive: true });
    await fs.mkdir(path.join(this.helmdevDir, 'improvements'), { recursive: true });
    await fs.mkdir(path.join(this.helmdevDir, 'memory'), { recursive: true });
    
    try {
      // 1. Build codebase graph
      console.log('   📊 Building codebase graph...');
      this.graph = new CodebaseGraph(this.projectRoot, this.appDir);
      await this.graph.build();
      console.log(`   ✅ Indexed ${this.graph.fileCount} files, ${this.graph.routes.size} routes`);
      
      // 2. Extract patterns
      console.log('   🎨 Extracting patterns...');
      this.patterns = new PatternLibrary(this.graph);
      await this.patterns.build();
      console.log(`   ✅ Found ${this.patterns.size} patterns`);
      
      // 3. Load memory
      console.log('   🧠 Loading memory...');
      this.memory = new ProjectMemory(this.helmdevDir);
      await this.memory.load();
      console.log(`   ✅ Loaded ${this.memory.totalFixes} historical fixes`);
      
      // 4. Learn code style
      console.log('   ✨ Learning code style...');
      await this.memory.learnCodeStyle(this.graph);
      
      // 5. Initialize queue
      this.queue = new TaskQueue({
        helmdevDir: this.helmdevDir,
        memory: this.memory,
        graph: this.graph,
      });
      await this.queue.loadQueue();
      
      // 6. Initialize dispatcher
      this.dispatcher = new ClaudeCodeDispatcher({
        projectRoot: this.projectRoot,
        helmdevDir: this.helmdevDir,
        graph: this.graph,
        patterns: this.patterns,
        memory: this.memory,
      });
      
      // 7. Initialize MegaThink
      this.megaThink = new MegaThinkAgent({
        projectRoot: this.projectRoot,
        helmdevDir: this.helmdevDir,
        graph: this.graph,
        patterns: this.patterns,
        memory: this.memory,
      });
      
      // 8. Initialize verifier
      this.verifier = new VerificationRunner({
        projectRoot: this.projectRoot,
        appDir: path.join(this.projectRoot, this.appDir),
      });
      
      this.initialized = true;
      console.log('✅ Orchestrator Bridge initialized!\n');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      throw error;
    }
  }

  // Get full codebase analysis
  getCodebaseAnalysis() {
    if (!this.initialized) return null;
    
    return {
      summary: this.graph.getSummary(),
      routes: Array.from(this.graph.routes.entries()).map(([path, node]) => ({
        path,
        ...node,
      })),
      patterns: this.patterns.getAllPatterns(),
      hotspots: this.graph.metrics?.hotspots || [],
      features: this.graph.getUsedFeatures(),
    };
  }

  // Get patterns for a specific task type
  getPatternsFor(taskType) {
    if (!this.initialized) return [];
    return this.patterns.getRelevantPatterns(taskType);
  }

  // Get file context with full analysis
  async getFileContext(filePath) {
    if (!this.initialized) return null;
    return await this.graph.getFileContext(filePath);
  }

  // Get memory context
  getMemoryContext(taskType, filePath) {
    if (!this.initialized) return null;
    return this.memory.getContextFor(taskType, filePath);
  }

  // Get style preferences
  getStylePreferences() {
    if (!this.initialized) return {};
    return this.memory.getStylePreferences();
  }

  // Run MegaThink session
  async runMegaThink(options = {}) {
    if (!this.initialized) await this.initialize();
    
    console.log('🧠 Starting MegaThink session...');
    await this.megaThink.startSession(options);
    
    // Return proposals
    const proposalsPath = path.join(this.helmdevDir, 'improvements', 'proposals.json');
    try {
      const data = await fs.readFile(proposalsPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  // Dispatch with full context
  async dispatchWithContext(task) {
    if (!this.initialized) await this.initialize();
    
    // Build comprehensive context
    const fileContext = await this.getFileContext(task.file_path);
    const patterns = this.getPatternsFor(task.type);
    const memoryContext = this.getMemoryContext(task.type, task.file_path);
    const style = this.getStylePreferences();
    const codebase = this.graph.getSummary();
    
    const context = {
      task,
      file: fileContext,
      patterns,
      memory: memoryContext,
      style,
      codebase,
    };
    
    await this.dispatcher.dispatch(task, context);
    
    return {
      success: true,
      contextWritten: true,
      patterns: patterns.length,
      hasMemory: !!memoryContext,
    };
  }

  // Verify a fix
  async verifyFix(task) {
    if (!this.initialized) await this.initialize();
    return await this.verifier.verify(task);
  }

  // Quick TypeScript check
  async checkTypeScript() {
    if (!this.initialized) await this.initialize();
    return await this.verifier.checkTypeScript();
  }

  // Record success/failure
  async recordResult(taskId, success, details = {}) {
    if (!this.initialized) return;
    
    if (success) {
      await this.memory.recordSuccess({
        taskId,
        type: details.type,
        filePath: details.filePath,
        approach: details.approach,
        duration: details.duration,
      });
    } else {
      await this.memory.recordFailure({
        taskId,
        type: details.type,
        filePath: details.filePath,
        approach: details.approach,
        reason: details.reason,
      });
    }
  }

  // Get memory stats
  getMemoryStats() {
    if (!this.initialized) return {};
    return this.memory.getStats();
  }
}

// Create singleton instance
const bridge = new OrchestratorBridge();

// HTTP Server for dashboard communication
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const sendJSON = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });

  try {
    // Initialize endpoint
    if (req.url === '/init' && req.method === 'POST') {
      await bridge.initialize();
      sendJSON({ success: true, initialized: bridge.initialized });
      return;
    }

    // Status endpoint
    if (req.url === '/status') {
      sendJSON({
        initialized: bridge.initialized,
        projectRoot: bridge.projectRoot,
        appDir: bridge.appDir,
        files: bridge.graph?.fileCount || 0,
        routes: bridge.graph?.routes?.size || 0,
        patterns: bridge.patterns?.size || 0,
        fixes: bridge.memory?.totalFixes || 0,
      });
      return;
    }

    // Ensure initialized for other endpoints
    if (!bridge.initialized) {
      await bridge.initialize();
    }

    // Codebase analysis
    if (req.url === '/codebase') {
      sendJSON(bridge.getCodebaseAnalysis());
      return;
    }

    // Patterns for task type
    if (req.url === '/patterns' && req.method === 'POST') {
      const { taskType } = await readBody();
      sendJSON(bridge.getPatternsFor(taskType));
      return;
    }

    // File context
    if (req.url === '/file-context' && req.method === 'POST') {
      const { filePath } = await readBody();
      const context = await bridge.getFileContext(filePath);
      sendJSON(context || { error: 'File not found' });
      return;
    }

    // Memory context
    if (req.url === '/memory-context' && req.method === 'POST') {
      const { taskType, filePath } = await readBody();
      sendJSON(bridge.getMemoryContext(taskType, filePath));
      return;
    }

    // Style preferences
    if (req.url === '/style') {
      sendJSON(bridge.getStylePreferences());
      return;
    }

    // MegaThink
    if (req.url === '/megathink' && req.method === 'POST') {
      const options = await readBody();
      const proposals = await bridge.runMegaThink(options);
      sendJSON(proposals);
      return;
    }

    // Dispatch with full context
    if (req.url === '/dispatch' && req.method === 'POST') {
      const { task } = await readBody();
      const result = await bridge.dispatchWithContext(task);
      sendJSON(result);
      return;
    }

    // Verify fix
    if (req.url === '/verify' && req.method === 'POST') {
      const { task } = await readBody();
      const result = await bridge.verifyFix(task);
      sendJSON(result);
      return;
    }

    // TypeScript check
    if (req.url === '/typescript-check') {
      const result = await bridge.checkTypeScript();
      sendJSON(result);
      return;
    }

    // Record result
    if (req.url === '/record-result' && req.method === 'POST') {
      const { taskId, success, details } = await readBody();
      await bridge.recordResult(taskId, success, details);
      sendJSON({ success: true });
      return;
    }

    // Memory stats
    if (req.url === '/memory-stats') {
      sendJSON(bridge.getMemoryStats());
      return;
    }

    // Not found
    sendJSON({ error: 'Not found' }, 404);

  } catch (error) {
    console.error('Bridge error:', error);
    sendJSON({ error: error.message }, 500);
  }
});

server.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🌉 ORCHESTRATOR BRIDGE                                                     ║
║                                                                              ║
║   Server:  http://localhost:${PORT}                                            ║
║   Project: ${bridge.projectRoot.slice(-50).padEnd(50)}    ║
║                                                                              ║
║   Endpoints:                                                                 ║
║   • POST /init           - Initialize orchestrator                           ║
║   • GET  /status         - Get bridge status                                 ║
║   • GET  /codebase       - Full codebase analysis                            ║
║   • POST /patterns       - Get patterns for task type                        ║
║   • POST /file-context   - Get file context                                  ║
║   • POST /memory-context - Get memory for task                               ║
║   • GET  /style          - Get style preferences                             ║
║   • POST /megathink      - Run MegaThink session                             ║
║   • POST /dispatch       - Dispatch with full context                        ║
║   • POST /verify         - Verify a fix                                      ║
║   • GET  /typescript-check - Run TypeScript check                            ║
║   • POST /record-result  - Record success/failure                            ║
║   • GET  /memory-stats   - Get memory statistics                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // Auto-initialize on startup
  try {
    await bridge.initialize();
  } catch (error) {
    console.error('Failed to auto-initialize:', error.message);
  }
});

export { bridge, OrchestratorBridge };
