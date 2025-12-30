#!/usr/bin/env node
/**
 * HelmDev Auto-Runner
 * 
 * Automatically dispatches tasks to Claude Code every 3 minutes
 * with auto-acceptance of all permissions.
 * 
 * Usage:
 *   node scripts/auto-runner.mjs                    # Run from ux-flow-auditor dir
 *   node scripts/auto-runner.mjs --interval 180    # Custom interval (seconds)
 *   node scripts/auto-runner.mjs --once            # Run once, no loop
 */

import { spawn, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  intervalSeconds: parseInt(process.argv.find(a => a.startsWith('--interval='))?.split('=')[1]) || 180, // 3 minutes
  runOnce: process.argv.includes('--once'),
  projectRoot: process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../'), // helmv3 root
  helmdevDir: path.resolve(__dirname, '../../../.helmdev'),
  allowedTools: [
    'Edit',
    'Write', 
    'Read',
    'Bash(npm run *)',
    'Bash(npx *)',
    'Bash(cat *)',
    'Bash(ls *)',
    'Bash(grep *)',
  ].join(','),
};

class AutoRunner {
  constructor() {
    this.isRunning = false;
    this.currentProcess = null;
    this.taskCount = 0;
    this.startTime = new Date();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString().slice(11, 19);
    const prefix = {
      info: '📋',
      success: '✅',
      error: '❌',
      warn: '⚠️',
      dispatch: '🚀',
      wait: '⏳',
    }[type] || '•';
    
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  banner() {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🤖 HELMDEV AUTO-RUNNER                                                     ║
║                                                                              ║
║   Autonomous Claude Code Task Dispatcher                                     ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   • Interval: ${String(CONFIG.intervalSeconds).padEnd(4)} seconds (${(CONFIG.intervalSeconds / 60).toFixed(1)} min)                            ║
║   • Project:  ${CONFIG.projectRoot.slice(-50).padEnd(50)} ║
║   • Mode:     ${CONFIG.runOnce ? 'Single Run' : 'Continuous Loop'}                                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
  }

  async ensureDirectories() {
    const dirs = [
      CONFIG.helmdevDir,
      path.join(CONFIG.helmdevDir, 'tasks'),
      path.join(CONFIG.helmdevDir, 'results'),
      path.join(CONFIG.helmdevDir, 'logs'),
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async getNextTaskFile() {
    const tasksDir = path.join(CONFIG.helmdevDir, 'tasks');
    
    // Check for current-task.md first
    const currentTask = path.join(tasksDir, 'current-task.md');
    try {
      await fs.access(currentTask);
      return currentTask;
    } catch {
      // No current task
    }

    // Look for any .md files in tasks directory
    try {
      const files = await fs.readdir(tasksDir);
      const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('.'));
      
      if (mdFiles.length > 0) {
        return path.join(tasksDir, mdFiles[0]);
      }
    } catch {
      // Directory doesn't exist or is empty
    }

    return null;
  }

  async getTaskContent(taskFile) {
    try {
      return await fs.readFile(taskFile, 'utf8');
    } catch {
      return null;
    }
  }

  buildClaudeCommand(taskFile) {
    // Build the prompt that tells Claude Code to read and execute the task
    const prompt = `Read the task file at ${taskFile} and complete all instructions in it. Follow all context files mentioned. When done, create the result file as specified.`;
    
    return {
      command: 'claude',
      args: [
        '-p', prompt,                              // Print mode (non-interactive)
        '--allowedTools', CONFIG.allowedTools,     // Pre-approve these tools
        '--cwd', CONFIG.projectRoot,               // Working directory
      ],
    };
  }

  buildClaudeCommandDangerous(taskFile) {
    // Alternative: Use dangerously-skip-permissions for full autonomy
    const prompt = `Read the task file at ${taskFile} and complete all instructions in it. Follow all context files mentioned. When done, create the result file as specified.`;
    
    return {
      command: 'claude',
      args: [
        '--dangerously-skip-permissions',
        '-p', prompt,
        '--cwd', CONFIG.projectRoot,
      ],
    };
  }

  async dispatchToClaudeCode(taskFile) {
    this.log(`Dispatching task: ${path.basename(taskFile)}`, 'dispatch');
    
    // Try the safer allowedTools approach first
    const { command, args } = this.buildClaudeCommand(taskFile);
    
    this.log(`Running: ${command} ${args.join(' ').slice(0, 80)}...`);
    
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: CONFIG.projectRoot,
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      });

      this.currentProcess = proc;
      
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });

      proc.on('close', (code) => {
        this.currentProcess = null;
        
        if (code === 0) {
          this.log('Task completed successfully', 'success');
          resolve({ success: true, stdout, stderr });
        } else {
          this.log(`Task failed with code ${code}`, 'error');
          resolve({ success: false, code, stdout, stderr });
        }
      });

      proc.on('error', (error) => {
        this.currentProcess = null;
        this.log(`Spawn error: ${error.message}`, 'error');
        reject(error);
      });
    });
  }

  async archiveCompletedTask(taskFile) {
    try {
      const archiveDir = path.join(CONFIG.helmdevDir, 'tasks', 'completed');
      await fs.mkdir(archiveDir, { recursive: true });
      
      const basename = path.basename(taskFile);
      const timestamp = Date.now();
      const archivePath = path.join(archiveDir, `${timestamp}-${basename}`);
      
      await fs.rename(taskFile, archivePath);
      this.log(`Archived: ${basename}`, 'info');
    } catch (error) {
      this.log(`Failed to archive: ${error.message}`, 'warn');
    }
  }

  async saveLog(taskFile, result) {
    try {
      const logsDir = path.join(CONFIG.helmdevDir, 'logs');
      const logFile = path.join(logsDir, `${Date.now()}-run.json`);
      
      await fs.writeFile(logFile, JSON.stringify({
        taskFile,
        timestamp: new Date().toISOString(),
        success: result.success,
        stdout: result.stdout?.slice(-5000),
        stderr: result.stderr?.slice(-5000),
      }, null, 2));
    } catch {
      // Ignore log errors
    }
  }

  async runOnce() {
    const taskFile = await this.getNextTaskFile();
    
    if (!taskFile) {
      this.log('No tasks found in queue', 'wait');
      return false;
    }

    this.taskCount++;
    this.log(`Task #${this.taskCount}: ${path.basename(taskFile)}`);

    try {
      const result = await this.dispatchToClaudeCode(taskFile);
      await this.saveLog(taskFile, result);
      
      if (result.success) {
        await this.archiveCompletedTask(taskFile);
      }
      
      return result.success;
    } catch (error) {
      this.log(`Error: ${error.message}`, 'error');
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatUptime() {
    const seconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${mins}m ${secs}s`;
  }

  async start() {
    this.banner();
    await this.ensureDirectories();
    
    this.isRunning = true;

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.log('Shutting down...', 'warn');
      this.isRunning = false;
      if (this.currentProcess) {
        this.currentProcess.kill();
      }
      process.exit(0);
    });

    if (CONFIG.runOnce) {
      await this.runOnce();
      return;
    }

    // Continuous loop
    while (this.isRunning) {
      await this.runOnce();
      
      if (!this.isRunning) break;
      
      this.log(`Waiting ${CONFIG.intervalSeconds}s until next run... (uptime: ${this.formatUptime()})`, 'wait');
      await this.sleep(CONFIG.intervalSeconds * 1000);
    }
  }
}

// Main
const runner = new AutoRunner();
runner.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
