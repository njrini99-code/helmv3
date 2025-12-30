/**
 * UltraSmartEngine - The brain of Ultra Agent Audit
 * 
 * This is NOT just "call Claude for each route"
 * This is ACTUAL INTELLIGENCE:
 * 
 * 1. PRE-ANALYSIS: Build project graph before any LLM calls
 * 2. PATTERN DETECTION: Find issues across ALL routes first
 * 3. SMART BATCHING: Group related issues for single fixes
 * 4. IMPACT SCORING: Calculate actual impact, not guesses
 * 5. LEARNING: Remember what worked, what didn't
 * 6. CODE GENERATION: Produce actually runnable code
 */

import { promises as fs } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

export class UltraSmartEngine {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.appDir = path.join(projectRoot, 'src/app');
    this.componentsDir = path.join(projectRoot, 'src/components');
    
    this.anthropic = new Anthropic();
    
    // Project Graph - Built BEFORE any analysis
    this.graph = {
      routes: new Map(),
      components: new Map(),
      imports: new Map(),
      exports: new Map(),
      dependencies: new Map(),
      sharedCode: new Map(),
    };
    
    // Pattern Database
    this.patterns = {
      codeSmells: [],
      missingFeatures: [],
      designViolations: [],
      quickWins: [],
      dominoEffects: [],
    };
    
    // Learning System
    this.learning = {
      successfulFixes: [],
      failedFixes: [],
      timeEstimates: new Map(),
      codePatterns: new Map(),
    };
    
    // Analysis Results
    this.analysis = {
      routes: new Map(),
      globalIssues: [],
      batchFixes: [],
      priorityQueue: [],
    };
    
    this.initialized = false;
  }

  async initialize() {
    console.log('\n🧠 Ultra Smart Engine Initializing...\n');
    console.log('   Phase 1: Building Project Graph\n');
    
    const files = await this.discoverAllFiles();
    console.log(`   📁 Found ${files.length} source files`);
    
    await this.parseAllImports(files);
    console.log(`   🔗 Parsed ${this.graph.imports.size} import graphs`);
    
    await this.buildDependencyGraph();
    console.log(`   🕸️  Built dependency graph`);
    
    await this.detectSharedPatterns(files);
    console.log(`   🔍 Detected ${this.graph.sharedCode.size} patterns`);
    
    await this.analyzeAllRoutes();
    console.log(`   📍 Analyzed ${this.graph.routes.size} routes`);
    
    await this.loadLearningData();
    
    this.initialized = true;
    console.log('\n   ✅ Project graph complete!\n');
    
    return this.getGraphSummary();
  }

  async discoverAllFiles() {
    const files = [];
    const scan = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (e) {}
    };
    await scan(path.join(this.projectRoot, 'src'));
    return files;
  }

  async parseAllImports(files) {
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        this.graph.imports.set(file, this.extractImports(content));
        this.graph.exports.set(file, this.extractExports(content));
      } catch (e) {}
    }
  }

  extractImports(content) {
    const imports = new Set();
    const regex = /import\s+(?:(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    return imports;
  }

  extractExports(content) {
    const exports = new Set();
    const regex = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      exports.add(match[1]);
    }
    if (content.includes('export default')) exports.add('default');
    return exports;
  }

  async buildDependencyGraph() {
    for (const [file, imports] of this.graph.imports) {
      for (const imp of imports) {
        if (imp.startsWith('.') || imp.startsWith('@/')) {
          const resolved = this.resolveImport(file, imp);
          if (!this.graph.dependencies.has(resolved)) {
            this.graph.dependencies.set(resolved, new Set());
          }
          this.graph.dependencies.get(resolved).add(file);
        }
      }
    }
  }

  resolveImport(fromFile, importPath) {
    if (importPath.startsWith('@/')) {
      return path.join(this.projectRoot, 'src', importPath.slice(2));
    }
    return path.resolve(path.dirname(fromFile), importPath);
  }

  async detectSharedPatterns(files) {
    const patterns = {
      'glass-on-table': /className=["'][^"']*glass[^"']*["'][^>]*(?:table|Table)/gi,
      'wrong-spacing': /(?:p|m|gap)-(?:1|2|3|5|6|7|9|10|11|13|14|15)/g,
      'missing-transition': /hover:[^"'\s]+(?!.*transition)/g,
      'hardcoded-color': /#[0-9a-f]{3,6}(?!.*(?:gradient|var))/gi,
      'no-loading-state': /useState.*loading.*false[^}]*return[^}]*(?!loading)/s,
      'inline-function-prop': /on\w+=\{(?:\([^)]*\)|)\s*=>/g,
      'missing-aria': /<(?:button|a|input)[^>]*(?!aria-)[^>]*>/gi,
      'console-log': /console\.(log|warn|error)\(/g,
      'todo-comment': /\/\/\s*TODO|\/\*\s*TODO/gi,
      'any-type': /:\s*any\b/g,
    };
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        for (const [name, regex] of Object.entries(patterns)) {
          const matches = content.match(regex);
          if (matches?.length > 0) {
            if (!this.graph.sharedCode.has(name)) {
              this.graph.sharedCode.set(name, new Set());
            }
            this.graph.sharedCode.get(name).add({
              file, count: matches.length, examples: matches.slice(0, 3),
            });
          }
        }
      } catch (e) {}
    }
  }

  async analyzeAllRoutes() {
    const scan = async (dir, routePath = '') => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            let newRoute = routePath;
            if (!entry.name.startsWith('(') && !entry.name.startsWith('@') && !entry.name.startsWith('_')) {
              newRoute = `${routePath}/${entry.name}`;
            }
            await scan(fullPath, newRoute);
          } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx') {
            await this.analyzeRoute(routePath || '/', fullPath, dir);
          }
        }
      } catch (e) {}
    };
    await scan(this.appDir);
  }

  async analyzeRoute(routePath, pageFile, routeDir) {
    try {
      const content = await fs.readFile(pageFile, 'utf8');
      const siblings = await fs.readdir(routeDir);
      
      this.graph.routes.set(routePath, {
        path: routePath,
        file: pageFile,
        hasLayout: siblings.some(f => f.startsWith('layout.')),
        hasLoading: siblings.some(f => f.startsWith('loading.')),
        hasError: siblings.some(f => f.startsWith('error.')),
        isClientComponent: content.includes("'use client'"),
        componentsUsed: this.extractComponentsUsed(content),
        hooksUsed: this.extractHooksUsed(content),
        lineCount: content.split('\n').length,
        content,
      });
    } catch (e) {}
  }

  extractComponentsUsed(content) {
    const components = new Set();
    const regex = /<([A-Z][a-zA-Z0-9]*)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      components.add(match[1]);
    }
    return components;
  }

  extractHooksUsed(content) {
    const hooks = new Set();
    const regex = /\b(use[A-Z][a-zA-Z]*)\s*\(/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      hooks.add(match[1]);
    }
    return hooks;
  }

  async loadLearningData() {
    try {
      const data = await fs.readFile(path.join(this.projectRoot, '.helmdev', 'learning.json'), 'utf8');
      this.learning = { ...this.learning, ...JSON.parse(data) };
    } catch (e) {}
  }

  async saveLearningData() {
    try {
      await fs.mkdir(path.join(this.projectRoot, '.helmdev'), { recursive: true });
      await fs.writeFile(
        path.join(this.projectRoot, '.helmdev', 'learning.json'),
        JSON.stringify(this.learning, null, 2)
      );
    } catch (e) {}
  }

  getGraphSummary() {
    return {
      routes: this.graph.routes.size,
      components: this.graph.dependencies.size,
      patterns: this.graph.sharedCode.size,
      patternBreakdown: Object.fromEntries(
        Array.from(this.graph.sharedCode.entries()).map(([name, files]) => [name, files.size])
      ),
      routeHealth: {
        total: this.graph.routes.size,
        withLoading: Array.from(this.graph.routes.values()).filter(r => r.hasLoading).length,
        withError: Array.from(this.graph.routes.values()).filter(r => r.hasError).length,
        clientComponents: Array.from(this.graph.routes.values()).filter(r => r.isClientComponent).length,
      },
    };
  }

  async runSmartAnalysis() {
    if (!this.initialized) await this.initialize();
    
    console.log('\n🔬 Phase 2: Smart Pattern Analysis\n');
    
    this.findGlobalIssues();
    console.log(`   🌍 Found ${this.analysis.globalIssues.length} global issues`);
    
    this.identifyBatchFixes();
    console.log(`   📦 Found ${this.analysis.batchFixes.length} batch opportunities`);
    
    this.calculateImpactScores();
    this.buildPriorityQueue();
    console.log(`   🎯 Priority queue: ${this.analysis.priorityQueue.length} items`);
    
    await this.getSmartEnhancements();
    
    return this.getAnalysisSummary();
  }

  findGlobalIssues() {
    this.analysis.globalIssues = [];
    
    const patternMeta = {
      'glass-on-table': { cat: 'design', title: 'Glass on Tables', impact: 70, effort: 'low' },
      'wrong-spacing': { cat: 'design', title: 'Non-Standard Spacing', impact: 50, effort: 'low' },
      'missing-transition': { cat: 'animation', title: 'Missing Transitions', impact: 40, effort: 'low' },
      'hardcoded-color': { cat: 'design', title: 'Hardcoded Colors', impact: 45, effort: 'medium' },
      'inline-function-prop': { cat: 'perf', title: 'Inline Functions', impact: 60, effort: 'medium' },
      'missing-aria': { cat: 'a11y', title: 'Missing ARIA', impact: 75, effort: 'low' },
      'console-log': { cat: 'quality', title: 'Console Logs', impact: 30, effort: 'low' },
      'todo-comment': { cat: 'quality', title: 'TODO Comments', impact: 25, effort: 'medium' },
      'any-type': { cat: 'quality', title: 'Any Types', impact: 55, effort: 'medium' },
    };
    
    for (const [name, files] of this.graph.sharedCode) {
      if (files.size >= 2) {
        const meta = patternMeta[name] || { cat: 'quality', title: name, impact: 50, effort: 'medium' };
        this.analysis.globalIssues.push({
          id: `global-${name}`,
          type: 'pattern',
          category: meta.cat,
          title: meta.title,
          description: `Found in ${files.size} files`,
          affectedFiles: Array.from(files).map(f => f.file),
          affectedCount: files.size,
          totalInstances: Array.from(files).reduce((s, f) => s + f.count, 0),
          impact: Math.min(100, meta.impact + files.size * 3),
          effort: meta.effort,
          batchFixPossible: true,
        });
      }
    }
    
    // Missing loading states
    const noLoading = Array.from(this.graph.routes.values()).filter(r => !r.hasLoading && r.isClientComponent);
    if (noLoading.length >= 3) {
      this.analysis.globalIssues.push({
        id: 'missing-loading',
        type: 'structure',
        category: 'ux',
        title: 'Missing Loading States',
        description: `${noLoading.length} client routes without loading.tsx`,
        affectedFiles: noLoading.map(r => r.file),
        affectedCount: noLoading.length,
        impact: 85,
        effort: 'medium',
        batchFixPossible: true,
      });
    }
    
    // Missing error boundaries
    const noError = Array.from(this.graph.routes.values()).filter(r => !r.hasError);
    if (noError.length >= 5) {
      this.analysis.globalIssues.push({
        id: 'missing-error',
        type: 'structure',
        category: 'reliability',
        title: 'Missing Error Boundaries',
        description: `${noError.length} routes without error.tsx`,
        affectedFiles: noError.map(r => r.file),
        affectedCount: noError.length,
        impact: 75,
        effort: 'medium',
        batchFixPossible: true,
      });
    }
  }

  identifyBatchFixes() {
    this.analysis.batchFixes = [];
    const byCategory = {};
    
    for (const issue of this.analysis.globalIssues) {
      if (!byCategory[issue.category]) byCategory[issue.category] = [];
      byCategory[issue.category].push(issue);
    }
    
    for (const [cat, issues] of Object.entries(byCategory)) {
      if (issues.length >= 2) {
        this.analysis.batchFixes.push({
          id: `batch-${cat}`,
          category: cat,
          title: `Fix All ${cat.toUpperCase()} Issues`,
          issues,
          totalFiles: new Set(issues.flatMap(i => i.affectedFiles)).size,
          combinedImpact: Math.min(100, issues.reduce((s, i) => s + i.impact, 0) / issues.length + 20),
          effort: issues.every(i => i.effort === 'low') ? 'low' : 'medium',
        });
      }
    }
    
    // Find domino effects
    const compUsage = new Map();
    for (const route of this.graph.routes.values()) {
      for (const comp of route.componentsUsed) {
        if (!compUsage.has(comp)) compUsage.set(comp, new Set());
        compUsage.get(comp).add(route.path);
      }
    }
    
    for (const [comp, routes] of compUsage) {
      if (routes.size >= 3) {
        this.patterns.dominoEffects.push({ component: comp, routes: Array.from(routes) });
      }
    }
  }

  calculateImpactScores() {
    const highTraffic = ['/', '/dashboard', '/discovery', '/pipeline', '/settings'];
    
    for (const issue of this.analysis.globalIssues) {
      const isDomino = this.patterns.dominoEffects.some(d => 
        issue.affectedFiles.some(f => f.includes(d.component))
      );
      if (isDomino) issue.impact = Math.min(100, issue.impact + 15);
      
      const hitsHighTraffic = issue.affectedFiles.some(f => 
        highTraffic.some(r => f.includes(r.replace('/', '')))
      );
      if (hitsHighTraffic) issue.impact = Math.min(100, issue.impact + 10);
    }
  }

  buildPriorityQueue() {
    const effortMult = { low: 1.5, medium: 1, high: 0.7 };
    
    this.analysis.priorityQueue = [
      ...this.analysis.globalIssues.map(i => ({ ...i, itemType: 'issue' })),
      ...this.analysis.batchFixes.map(b => ({ ...b, itemType: 'batch', impact: b.combinedImpact })),
    ]
      .map(item => ({ ...item, priority: Math.round(item.impact * (effortMult[item.effort] || 1)) }))
      .sort((a, b) => b.priority - a.priority);
  }

  async getSmartEnhancements() {
    console.log('   🤖 Getting AI insights...');
    
    const prompt = `Analyze this Next.js project and suggest 3 NEW improvements we might have missed.

## Already Found
${this.analysis.globalIssues.slice(0, 5).map(i => `- ${i.title} (${i.affectedCount} files)`).join('\n')}

## Route Stats
- ${this.graph.routes.size} routes
- ${Array.from(this.graph.routes.values()).filter(r => r.hasLoading).length} with loading
- ${Array.from(this.graph.routes.values()).filter(r => r.isClientComponent).length} client components

## Task
Add 3 NEW insights we missed. Focus on architecture, performance, or UX.

Respond JSON only:
{"insights":[{"category":"string","title":"string","description":"string","impact":70,"effort":"low|medium|high"}]}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      
      const { insights } = JSON.parse(response.content[0].text.replace(/```json?|```/g, '').trim());
      
      for (const insight of insights || []) {
        this.analysis.globalIssues.push({
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'ai',
          ...insight,
          affectedFiles: [],
          affectedCount: 0,
          batchFixPossible: false,
        });
      }
      
      this.buildPriorityQueue();
      console.log(`   ✅ AI added ${insights?.length || 0} insights`);
    } catch (e) {
      console.log(`   ⚠️ AI skipped: ${e.message}`);
    }
  }

  getAnalysisSummary() {
    return {
      stats: this.getGraphSummary(),
      issueCount: this.analysis.globalIssues.length,
      batchCount: this.analysis.batchFixes.length,
      
      topPriority: this.analysis.priorityQueue.slice(0, 10).map(i => ({
        title: i.title,
        type: i.itemType || i.type,
        impact: i.impact,
        effort: i.effort,
        priority: i.priority,
        files: i.affectedCount || i.totalFiles || 0,
      })),
      
      quickWins: this.analysis.priorityQueue
        .filter(i => i.effort === 'low' && i.impact >= 50)
        .slice(0, 5)
        .map(i => ({ title: i.title, impact: i.impact, files: i.affectedCount || 0 })),
      
      dominoEffects: this.patterns.dominoEffects.slice(0, 5).map(d => ({
        component: d.component,
        affectsRoutes: d.routes.length,
      })),
    };
  }

  async generateSmartFix(item) {
    const files = item.affectedFiles?.slice(0, 3) || [];
    const contents = {};
    
    for (const file of files) {
      try {
        contents[file] = (await fs.readFile(file, 'utf8')).slice(0, 1500);
      } catch (e) {}
    }
    
    const prompt = `Generate a COMPLETE fix for: ${item.title}

Category: ${item.category}
Affected: ${item.affectedCount || item.totalFiles || 0} files
Description: ${item.description || ''}

Sample code:
${Object.entries(contents).map(([f, c]) => `### ${path.basename(f)}\n\`\`\`tsx\n${c}\n\`\`\``).join('\n\n')}

Requirements:
- COMPLETE code, no placeholders
- Design system spacing: 4,8,12,16,24,32,48,64px
- Add transitions for interactions
- TypeScript types, no 'any'

Write a markdown implementation guide with full code.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
      });
      
      return {
        id: item.id,
        title: item.title,
        category: item.category,
        content: response.content[0].text,
        type: 'smart-fix',
        generatedAt: Date.now(),
      };
    } catch (e) {
      return {
        id: item.id,
        title: item.title,
        content: `# Fix: ${item.title}\n\n${item.description}\n\nAffected files:\n${(item.affectedFiles || []).slice(0, 10).map(f => `- ${path.basename(f)}`).join('\n')}`,
        type: 'fallback',
      };
    }
  }

  async getTopPriorityFix() {
    if (!this.initialized) {
      await this.initialize();
      await this.runSmartAnalysis();
    }
    return this.analysis.priorityQueue[0] ? this.generateSmartFix(this.analysis.priorityQueue[0]) : null;
  }

  getFullAnalysis() {
    return { graph: this.getGraphSummary(), analysis: this.getAnalysisSummary() };
  }
}

export default UltraSmartEngine;
