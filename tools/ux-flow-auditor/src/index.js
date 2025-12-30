#!/usr/bin/env node
/**
 * HelmDev - Autonomous Development Orchestration System
 * 
 * This is the main entry point that orchestrates:
 * - Codebase analysis and understanding
 * - Task prioritization and queue management
 * - Claude Code integration for fixes
 * - MegaThink continuous improvement agent
 * - Web research for best practices
 * - Verification and learning
 */

import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';

import { CodebaseGraph } from './context/codebase-graph.js';
import { PatternLibrary } from './context/pattern-library.js';
import { ProjectMemory } from './context/memory.js';
import { TaskQueue } from './queue/task-queue.js';
import { ClaudeCodeDispatcher } from './claude-code/dispatcher.js';
import { MegaThinkAgent } from './agents/megathink.js';
import { VerificationRunner } from './verification/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HelmDev {
  constructor(config) {
    this.config = {
      projectRoot: config.projectRoot || process.cwd(),
      appDir: config.appDir || 'src/app',
      mode: config.mode || 'supervised', // 'autonomous' | 'supervised' | 'manual'
      enableMegaThink: config.enableMegaThink !== false,
      megaThinkInterval: config.megaThinkInterval || 4, // hours
      autoAdvance: config.autoAdvance !== false,
      maxRetries: config.maxRetries || 3,
      pauseOnFailure: config.pauseOnFailure !== false,
      verbose: config.verbose || false,
    };
    
    this.helmdevDir = path.join(this.config.projectRoot, '.helmdev');
    this.isRunning = false;
    this.currentTask = null;
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      sessionStart: new Date(),
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  /**
   * Initialize all systems
   */
  async initialize() {
    console.log(this.getBanner());
    
    const spinner = ora('Initializing HelmDev...').start();
    
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // 1. Build codebase graph
      spinner.text = 'Building codebase graph...';
      this.graph = new CodebaseGraph(this.config.projectRoot, this.config.appDir);
      await this.graph.build();
      spinner.succeed(`Indexed ${this.graph.fileCount} files`);
      
      // 2. Extract patterns
      spinner.start('Extracting patterns from codebase...');
      this.patterns = new PatternLibrary(this.graph);
      await this.patterns.build();
      spinner.succeed(`Found ${this.patterns.size} patterns`);
      
      // 3. Load memory
      spinner.start('Loading project memory...');
      this.memory = new ProjectMemory(this.helmdevDir);
      await this.memory.load();
      spinner.succeed(`Loaded ${this.memory.totalFixes} historical fixes`);
      
      // 4. Initialize task queue
      spinner.start('Initializing task queue...');
      this.queue = new TaskQueue({
        helmdevDir: this.helmdevDir,
        memory: this.memory,
        graph: this.graph,
      });
      spinner.succeed('Task queue ready');
      
      // 5. Initialize Claude Code dispatcher
      spinner.start('Initializing Claude Code dispatcher...');
      this.dispatcher = new ClaudeCodeDispatcher({
        projectRoot: this.config.projectRoot,
        helmdevDir: this.helmdevDir,
        graph: this.graph,
        patterns: this.patterns,
        memory: this.memory,
      });
      spinner.succeed('Claude Code dispatcher ready');
      
      // 6. Initialize verification runner
      spinner.start('Initializing verification runner...');
      this.verifier = new VerificationRunner({
        projectRoot: this.config.projectRoot,
        appDir: path.join(this.config.projectRoot, this.config.appDir),
      });
      spinner.succeed('Verification runner ready');
      
      // 7. Initialize MegaThink agent
      if (this.config.enableMegaThink) {
        spinner.start('Initializing MegaThink agent...');
        this.megaThink = new MegaThinkAgent({
          projectRoot: this.config.projectRoot,
          helmdevDir: this.helmdevDir,
          graph: this.graph,
          patterns: this.patterns,
          memory: this.memory,
        });
        spinner.succeed('MegaThink agent ready');
      }
      
      // 8. Learn code style
      spinner.start('Learning code style...');
      await this.memory.learnCodeStyle(this.graph);
      spinner.succeed('Code style preferences saved');
      
      console.log(chalk.green('\n✅ HelmDev initialized successfully!\n'));
      
    } catch (error) {
      spinner.fail(`Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      this.helmdevDir,
      path.join(this.helmdevDir, 'tasks'),
      path.join(this.helmdevDir, 'context'),
      path.join(this.helmdevDir, 'results'),
      path.join(this.helmdevDir, 'improvements'),
      path.join(this.helmdevDir, 'research'),
      path.join(this.helmdevDir, 'memory'),
      path.join(this.helmdevDir, 'snapshots'),
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Start the main orchestration loop
   */
  async start() {
    this.isRunning = true;
    
    console.log(chalk.cyan('🚀 Starting HelmDev orchestration loop...\n'));
    
    // Run initial analysis
    await this.runAnalysis();
    
    // Run initial MegaThink session if enabled
    if (this.config.enableMegaThink) {
      await this.runMegaThink();
    }
    
    // Start the main loop
    await this.runMainLoop();
  }

  /**
   * Run codebase analysis
   */
  async runAnalysis() {
    const spinner = ora('Analyzing codebase for issues...').start();
    
    try {
      const analysisPath = path.join(this.helmdevDir, 'analysis.json');
      const appDir = path.join(this.config.projectRoot, this.config.appDir);
      const analyzerPath = path.join(__dirname, '../scripts/analyze_flows.py');
      
      await new Promise((resolve, reject) => {
        const proc = spawn('python3', [
          analyzerPath,
          appDir,
          '--format', 'json',
          '-o', analysisPath,
        ]);
        
        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data; });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Analysis failed: ${stderr}`));
          }
        });
      });
      
      // Load analysis results
      const analysisData = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
      
      // Populate task queue
      await this.queue.populateFromAnalysis(analysisData);
      
      const stats = this.queue.getStats();
      spinner.succeed(`Found ${stats.total} issues (${stats.critical} critical, ${stats.high} high)`);
      
      return analysisData;
      
    } catch (error) {
      spinner.fail(`Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run MegaThink improvement session
   */
  async runMegaThink() {
    console.log(chalk.magenta('\n🧠 Starting MegaThink session...\n'));
    
    try {
      await this.megaThink.startSession({
        depth: 'deep',
        scope: 'all',
      });
      
      console.log(chalk.magenta('✅ MegaThink session complete\n'));
      
    } catch (error) {
      console.error(chalk.red(`MegaThink failed: ${error.message}`));
    }
  }

  /**
   * Main orchestration loop
   */
  async runMainLoop() {
    while (this.isRunning) {
      try {
        // Get next task
        const task = this.queue.getNextTask();
        
        if (!task) {
          console.log(chalk.green('\n🎉 No more tasks! Refreshing analysis...\n'));
          await this.runAnalysis();
          
          const newTask = this.queue.getNextTask();
          if (!newTask) {
            console.log(chalk.green('✨ All issues resolved! Your app is looking great.\n'));
            await this.waitForChanges();
            continue;
          }
        }
        
        this.currentTask = task || this.queue.getNextTask();
        
        if (!this.currentTask) {
          await this.sleep(5000);
          continue;
        }
        
        // Process the task
        await this.processTask(this.currentTask);
        
        // Brief pause between tasks
        await this.sleep(2000);
        
      } catch (error) {
        console.error(chalk.red(`\n❌ Error in main loop: ${error.message}\n`));
        
        if (this.config.pauseOnFailure) {
          await this.waitForResume();
        }
      }
    }
  }

  /**
   * Process a single task
   */
  async processTask(task) {
    console.log(this.getTaskHeader(task));
    
    // 1. Build comprehensive context
    const spinner = ora('Building task context...').start();
    const context = await this.buildTaskContext(task);
    spinner.succeed('Context ready');
    
    // 2. In supervised mode, wait for approval
    if (this.config.mode === 'supervised') {
      const approved = await this.waitForApproval(task);
      if (!approved) {
        this.queue.skipTask(task.id, 'User skipped');
        return;
      }
    }
    
    // 3. Dispatch to Claude Code
    spinner.start('Dispatching to Claude Code...');
    await this.dispatcher.dispatch(task, context);
    spinner.succeed('Task dispatched');
    
    // 4. Wait for completion
    console.log(chalk.cyan('\n🔄 Waiting for Claude Code to complete...\n'));
    const result = await this.waitForCompletion(task);
    
    // 5. Verify the fix
    if (result.status === 'completed') {
      spinner.start('Verifying fix...');
      const verification = await this.verifier.verify(task);
      
      if (verification.passed) {
        spinner.succeed('Verification passed');
        await this.handleSuccess(task, result, verification);
      } else {
        spinner.fail('Verification failed');
        await this.handleFailure(task, result, verification);
      }
    } else {
      await this.handleFailure(task, result, { passed: false });
    }
    
    this.currentTask = null;
  }

  /**
   * Build comprehensive context for a task
   */
  async buildTaskContext(task) {
    const context = {
      task,
      file: await this.graph.getFileContext(task.file_path),
      patterns: this.patterns.getRelevantPatterns(task.type),
      memory: this.memory.getContextFor(task.type),
      codebase: this.graph.getSummary(),
      style: this.memory.getStylePreferences(),
    };
    
    // Write context files for Claude Code
    await this.writeContextFiles(context);
    
    return context;
  }

  /**
   * Write context files for Claude Code
   */
  async writeContextFiles(context) {
    const contextDir = path.join(this.helmdevDir, 'context');
    
    // Main context document
    await fs.writeFile(
      path.join(contextDir, 'task-context.md'),
      this.generateTaskContextMarkdown(context)
    );
    
    // Related files
    await fs.writeFile(
      path.join(contextDir, 'related-files.md'),
      this.generateRelatedFilesMarkdown(context.file)
    );
    
    // Patterns
    await fs.writeFile(
      path.join(contextDir, 'patterns.md'),
      this.generatePatternsMarkdown(context.patterns)
    );
    
    // Memory
    await fs.writeFile(
      path.join(contextDir, 'memory.md'),
      this.generateMemoryMarkdown(context.memory)
    );
    
    // Style guide
    await fs.writeFile(
      path.join(contextDir, 'style-guide.md'),
      this.generateStyleMarkdown(context.style)
    );
  }

  /**
   * Generate task context markdown
   */
  generateTaskContextMarkdown(context) {
    const { task, file, codebase } = context;
    
    return `# Task Context

## Current Task

**ID:** ${task.id}
**Type:** ${task.type}
**Severity:** ${task.severity}
**Title:** ${task.title}

### Problem
${task.description}

${task.problem_explanation ? `### Why This Matters\n${task.problem_explanation}` : ''}

${task.user_impact ? `### User Impact\n${task.user_impact}` : ''}

## File Information

**Path:** \`${task.file_path}\`
**Line:** ${task.line_number}
**Purpose:** ${file?.purpose || 'Unknown'}
**Route:** ${file?.route || 'N/A'}

### Dependencies
${file?.dependencies?.slice(0, 5).map(d => `- \`${d}\``).join('\n') || 'None detected'}

### Dependents (files that import this)
${file?.dependents?.slice(0, 5).map(d => `- \`${d}\``).join('\n') || 'None detected'}

## Codebase Overview

- **Total Files:** ${codebase.totalFiles}
- **Total Routes:** ${codebase.totalRoutes}
- **Framework:** Next.js App Router
- **Language:** TypeScript

## Fix Instructions

${task.fix_steps?.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'See suggested code below.'}

${task.fix_code ? `### Suggested Code\n\`\`\`tsx\n${task.fix_code}\n\`\`\`` : ''}

## Verification

After fixing, ensure:
- [ ] Code compiles without errors
- [ ] No new linting warnings
- [ ] The issue is resolved (re-run analysis)
- [ ] Visual appearance is correct
`;
  }

  /**
   * Generate related files markdown
   */
  generateRelatedFilesMarkdown(fileContext) {
    if (!fileContext) return '# Related Files\n\nNo context available.';
    
    let md = '# Related Files\n\n';
    
    if (fileContext.content) {
      md += `## Main File: \`${fileContext.path}\`\n\n`;
      md += '```tsx\n' + fileContext.content + '\n```\n\n';
    }
    
    if (fileContext.relatedFiles?.length) {
      md += '## Related Files\n\n';
      for (const file of fileContext.relatedFiles.slice(0, 5)) {
        md += `### \`${file.path}\`\n\n`;
        md += `**Relationship:** ${file.relationship}\n\n`;
        if (file.content) {
          md += '```tsx\n' + file.content.slice(0, 2000) + '\n```\n\n';
        }
      }
    }
    
    return md;
  }

  /**
   * Generate patterns markdown
   */
  generatePatternsMarkdown(patterns) {
    if (!patterns?.length) return '# Patterns\n\nNo relevant patterns found.';
    
    let md = '# Codebase Patterns\n\n';
    md += '> **IMPORTANT:** Follow these patterns exactly when making changes.\n\n';
    
    for (const pattern of patterns) {
      md += `## ${pattern.name}\n\n`;
      md += `**Category:** ${pattern.category}\n`;
      md += `**Used in:** ${pattern.usedIn?.length || 0} files\n\n`;
      
      if (pattern.description) {
        md += `### Description\n${pattern.description}\n\n`;
      }
      
      if (pattern.template) {
        md += `### Template\n\`\`\`tsx\n${pattern.template}\n\`\`\`\n\n`;
      }
      
      if (pattern.example) {
        md += `### Example\n\`\`\`tsx\n${pattern.example}\n\`\`\`\n\n`;
      }
    }
    
    return md;
  }

  /**
   * Generate memory markdown
   */
  generateMemoryMarkdown(memory) {
    if (!memory) return '# Project Memory\n\nNo historical context available.';
    
    let md = '# Project Memory\n\n';
    
    if (memory.successfulFixes?.length) {
      md += '## What Has Worked\n\n';
      for (const fix of memory.successfulFixes.slice(0, 5)) {
        md += `- **${fix.type}:** ${fix.approach}\n`;
      }
      md += '\n';
    }
    
    if (memory.failedFixes?.length) {
      md += '## What Has Failed\n\n';
      for (const fix of memory.failedFixes.slice(0, 5)) {
        md += `- **${fix.type}:** ${fix.approach} — *${fix.reason}*\n`;
      }
      md += '\n';
    }
    
    if (memory.insights?.length) {
      md += '## Key Insights\n\n';
      for (const insight of memory.insights) {
        md += `- ${insight}\n`;
      }
    }
    
    return md;
  }

  /**
   * Generate style guide markdown
   */
  generateStyleMarkdown(style) {
    if (!style) return '# Style Guide\n\nNo style preferences detected.';
    
    return `# Style Guide

## Code Style

- **Indentation:** ${style.indentation || 'spaces'}
- **Indent Size:** ${style.indentSize || 2}
- **Quotes:** ${style.quotes || 'single'}
- **Semicolons:** ${style.semicolons ? 'Yes' : 'No'}
- **Trailing Commas:** ${style.trailingCommas || 'es5'}

## Naming Conventions

- **Components:** PascalCase
- **Files:** kebab-case
- **Hooks:** camelCase with 'use' prefix
- **Utilities:** camelCase

## Import Order

1. React/Next.js imports
2. Third-party libraries
3. Internal components
4. Utilities/helpers
5. Types
6. Styles
`;
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(task, timeout = 300000) {
    const resultFile = path.join(this.helmdevDir, 'results', `${task.id}.json`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const content = await fs.readFile(resultFile, 'utf8');
        return JSON.parse(content);
      } catch {
        // File doesn't exist yet
      }
      
      // Also check for file changes
      const hasChanges = await this.checkForChanges(task);
      if (hasChanges) {
        // Wait a bit for saves to complete, then verify
        await this.sleep(3000);
        return { status: 'completed', method: 'file-watch' };
      }
      
      await this.sleep(2000);
    }
    
    return { status: 'timeout' };
  }

  /**
   * Check if the task file has been modified
   */
  async checkForChanges(task) {
    try {
      const filePath = path.join(this.config.projectRoot, task.file_path);
      const stats = await fs.stat(filePath);
      const taskStartTime = new Date(task.startedAt);
      
      return stats.mtime > taskStartTime;
    } catch {
      return false;
    }
  }

  /**
   * Handle successful fix
   */
  async handleSuccess(task, result, verification) {
    this.stats.tasksCompleted++;
    this.stats.currentStreak++;
    
    if (this.stats.currentStreak > this.stats.longestStreak) {
      this.stats.longestStreak = this.stats.currentStreak;
    }
    
    // Record in memory
    await this.memory.recordSuccess({
      taskId: task.id,
      type: task.type,
      filePath: task.file_path,
      approach: result.approach || 'unknown',
      duration: Date.now() - new Date(task.startedAt).getTime(),
    });
    
    // Mark task complete
    this.queue.markComplete(task.id, true);
    
    // Celebration!
    this.showCelebration(task);
  }

  /**
   * Handle failed fix
   */
  async handleFailure(task, result, verification) {
    this.stats.tasksFailed++;
    this.stats.currentStreak = 0;
    
    // Record in memory
    await this.memory.recordFailure({
      taskId: task.id,
      type: task.type,
      filePath: task.file_path,
      approach: result.approach || 'unknown',
      reason: verification.error || 'Verification failed',
    });
    
    if (task.attempts < this.config.maxRetries) {
      console.log(chalk.yellow(`\n⚠️ Fix failed. Retry ${task.attempts + 1}/${this.config.maxRetries}...\n`));
      task.attempts++;
    } else {
      console.log(chalk.red(`\n❌ Fix failed after ${task.attempts} attempts. Skipping.\n`));
      this.queue.skipTask(task.id, 'Max retries exceeded');
    }
  }

  /**
   * Wait for user approval in supervised mode
   */
  async waitForApproval(task) {
    // In a real implementation, this would prompt the user
    // For now, auto-approve after showing the task
    console.log(chalk.cyan('\n📋 Review the task above. Press Enter to proceed or "s" to skip...\n'));
    return true;
  }

  /**
   * Wait for resume after failure
   */
  async waitForResume() {
    console.log(chalk.yellow('\n⏸️ Paused. Press Enter to continue...\n'));
    // In a real implementation, this would wait for user input
    await this.sleep(5000);
  }

  /**
   * Wait for file changes
   */
  async waitForChanges() {
    console.log(chalk.gray('\n👀 Watching for file changes...\n'));
    // In a real implementation, this would use chokidar
    await this.sleep(30000);
  }

  /**
   * Show celebration for completed task
   */
  showCelebration(task) {
    const celebrations = [
      '🎉 DONE!',
      '✨ FIXED!',
      '🚀 SHIPPED!',
      '💪 CRUSHED IT!',
      '🔥 ON FIRE!',
    ];
    
    const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
    
    console.log(`
${chalk.green('╔══════════════════════════════════════════════════════════════════════════════╗')}
${chalk.green('║')}                                                                              ${chalk.green('║')}
${chalk.green('║')}   ${chalk.bold(celebration)}                                                            ${chalk.green('║')}
${chalk.green('║')}                                                                              ${chalk.green('║')}
${chalk.green('║')}   📊 Session: ${String(this.stats.tasksCompleted).padStart(3)} fixed    🔥 Streak: ${String(this.stats.currentStreak).padStart(3)}                        ${chalk.green('║')}
${chalk.green('║')}   📈 Total: ${String(this.memory.totalFixes + this.stats.tasksCompleted).padStart(5)} all-time                                           ${chalk.green('║')}
${chalk.green('║')}                                                                              ${chalk.green('║')}
${chalk.green('╚══════════════════════════════════════════════════════════════════════════════╝')}
`);
  }

  /**
   * Get task header display
   */
  getTaskHeader(task) {
    const priorityColors = {
      critical: chalk.red,
      high: chalk.yellow,
      medium: chalk.blue,
      low: chalk.gray,
    };
    
    const color = priorityColors[task.severity] || chalk.white;
    
    return `
${chalk.cyan('╔══════════════════════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')} ${chalk.bold('TASK:')} ${task.title.slice(0, 65).padEnd(65)} ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}                                                                              ${chalk.cyan('║')}
${chalk.cyan('║')} 📁 File: ${task.file_path.slice(0, 62).padEnd(62)} ${chalk.cyan('║')}
${chalk.cyan('║')} 📍 Line: ${String(task.line_number).padEnd(62)} ${chalk.cyan('║')}
${chalk.cyan('║')} 🏷️  Type: ${task.type.padEnd(62)} ${chalk.cyan('║')}
${chalk.cyan('║')} ⚠️  Severity: ${color(task.severity.toUpperCase().padEnd(58))} ${chalk.cyan('║')}
${chalk.cyan('║')} ⏱️  Estimate: ${(task.estimated_time || 'Unknown').padEnd(58)} ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                              ${chalk.cyan('║')}
${chalk.cyan('╚══════════════════════════════════════════════════════════════════════════════╝')}
`;
  }

  /**
   * Get the banner
   */
  getBanner() {
    return `
${chalk.cyan('╔══════════════════════════════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}                                                                                      ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.bold.white('██╗  ██╗███████╗██╗     ███╗   ███╗██████╗ ███████╗██╗   ██╗')}                       ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.bold.white('██║  ██║██╔════╝██║     ████╗ ████║██╔══██╗██╔════╝██║   ██║')}                       ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.bold.white('███████║█████╗  ██║     ██╔████╔██║██║  ██║█████╗  ██║   ██║')}                       ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.bold.white('██╔══██║██╔══╝  ██║     ██║╚██╔╝██║██║  ██║██╔══╝  ╚██╗ ██╔╝')}                       ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.bold.white('██║  ██║███████╗███████╗██║ ╚═╝ ██║██████╔╝███████╗ ╚████╔╝')}                        ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.bold.white('╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝╚═════╝ ╚══════╝  ╚═══╝')}                         ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                                      ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.gray('🧠 Autonomous Development Orchestration System')}                                       ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.gray('🔗 Claude Code Integration')}                                                             ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.gray('🔍 Continuous Research & Improvement')}                                                   ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                                      ${chalk.cyan('║')}
${chalk.cyan('╠══════════════════════════════════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}                                                                                      ${chalk.cyan('║')}
${chalk.cyan('║')}   Mode: ${chalk.bold(this.config.mode.toUpperCase().padEnd(15))} MegaThink: ${this.config.enableMegaThink ? chalk.green('ON') : chalk.red('OFF')}                              ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                                      ${chalk.cyan('║')}
${chalk.cyan('╚══════════════════════════════════════════════════════════════════════════════════════╝')}
`;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop the orchestrator
   */
  stop() {
    this.isRunning = false;
    console.log(chalk.yellow('\n👋 HelmDev stopped.\n'));
  }
}

// CLI Entry Point
const program = new Command();

program
  .name('helmdev')
  .description('Autonomous Development Orchestration System')
  .version('3.0.0')
  .argument('[appDir]', 'Path to the app directory', 'src/app')
  .option('-m, --mode <mode>', 'Operation mode: autonomous, supervised, manual', 'supervised')
  .option('--no-megathink', 'Disable MegaThink agent')
  .option('-v, --verbose', 'Verbose output')
  .action(async (appDir, options) => {
    const projectRoot = process.cwd();
    
    const helmdev = new HelmDev({
      projectRoot,
      appDir,
      mode: options.mode,
      enableMegaThink: options.megathink !== false,
      verbose: options.verbose,
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      helmdev.stop();
      process.exit(0);
    });
    
    try {
      await helmdev.initialize();
      await helmdev.start();
    } catch (error) {
      console.error(chalk.red(`\n❌ Fatal error: ${error.message}\n`));
      process.exit(1);
    }
  });

program.parse();

export { HelmDev };
