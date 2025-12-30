#!/usr/bin/env node
/**
 * HelmDev Enhanced Dashboard
 * UX Flow Auditor with integrated HelmDev agent system
 * 
 * Features:
 * - All original UX Flow Auditor features
 * - HelmDev task queue management
 * - Claude Code dispatch
 * - Memory & learning stats
 * - Supervised/Autonomous modes
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

// HelmDev Integration
const HelmDevIntegration = require('./helmdev-integration.cjs');
const { HELMDEV_STYLES, HELMDEV_HTML, HELMDEV_JS } = require('./helmdev-panel.cjs');

// Configuration
const PORT = process.env.PORT || 3333;
const APP_DIR = process.argv[2] || './app';
const SCRIPT_DIR = path.dirname(__filename);
const ANALYZER_SCRIPT = path.join(SCRIPT_DIR, 'analyze_flows.py');

// HelmDev
const PROJECT_ROOT = path.resolve(APP_DIR, '..');
const helmdev = new HelmDevIntegration(PROJECT_ROOT);
helmdev.loadState();

// State
let lastAnalysis = null;
let isAnalyzing = false;
let clients = new Set();

// Debounce utility
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Run the analyzer
async function runAnalysis() {
  if (isAnalyzing) return;
  isAnalyzing = true;
  
  console.log('\n🔍 Analyzing ' + APP_DIR + '...');
  
  const todoPath = path.join(path.dirname(path.resolve(APP_DIR)), 'TODO.md');
  
  return new Promise((resolve) => {
    const python = spawn('python3', [ANALYZER_SCRIPT, APP_DIR, '--format', 'json', '--todo', todoPath]);
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => { stdout += data; });
    python.stderr.on('data', (data) => { stderr += data; });
    
    python.on('close', (code) => {
      isAnalyzing = false;
      
      if (code === 0) {
        try {
          lastAnalysis = JSON.parse(stdout);
          lastAnalysis.timestamp = new Date().toISOString();
          console.log('✅ Analysis complete: ' + lastAnalysis.summary.total_routes + ' routes, ' + lastAnalysis.summary.issues.warnings + ' warnings');
          broadcast({ type: 'analysis', data: lastAnalysis });
        } catch (e) {
          console.error('Failed to parse analysis:', e);
        }
      } else {
        console.error('Analysis failed:', stderr);
        broadcast({ type: 'error', message: stderr });
      }
      resolve();
    });
  });
}

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

function watchDirectory(dir) {
  const watchedDirs = new Set();
  
  function addWatch(dirPath) {
    if (watchedDirs.has(dirPath)) return;
    
    try {
      fs.watch(dirPath, { persistent: true }, debouncedAnalysis);
      watchedDirs.add(dirPath);
      
      fs.readdirSync(dirPath, { withFileTypes: true }).forEach(entry => {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          addWatch(path.join(dirPath, entry.name));
        }
      });
    } catch (e) {}
  }
  
  addWatch(dir);
  console.log('👀 Watching ' + dir + ' for changes...');
}

const debouncedAnalysis = debounce(() => runAnalysis(), 500);

function serveHTML(res) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(DASHBOARD_HTML);
}

function serveAnalysis(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(lastAnalysis || { error: 'No analysis yet' }));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    serveHTML(res);
  } else if (req.url === '/api/analysis') {
    serveAnalysis(res);
  } else if (req.url === '/api/refresh') {
    runAnalysis().then(() => serveAnalysis(res));
    
  // HelmDev API endpoints
  } else if (req.url === '/api/helmdev/state' && req.method === 'GET') {
    helmdev.loadState();
    const state = {
      mode: helmdev.state.mode,
      isRunning: helmdev.state.isRunning,
      currentTask: helmdev.state.currentTask,
      queue: helmdev.state.queue,
      stats: helmdev.getStats(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    
  } else if (req.url === '/api/helmdev/populate' && req.method === 'POST') {
    if (lastAnalysis) {
      helmdev.populateQueueFromAnalysis(lastAnalysis);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ queue: helmdev.state.queue, stats: helmdev.getStats() }));
    
  } else if (req.url === '/api/helmdev/dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { taskId } = JSON.parse(body);
        console.log('📤 Dispatch request for task:', taskId);
        
        // Reload state to ensure we have latest tasks
        helmdev.loadState();
        
        const task = helmdev.state.queue.tasks.find(t => t.id === taskId);
        if (task) {
          console.log('✅ Found task:', task.type, task.file_path);
          const result = await helmdev.dispatchToClaudeCode(task);
          
          if (result.prompt) {
            console.log('✅ Prompt generated, length:', result.prompt.length);
          } else {
            console.log('❌ No prompt in result:', Object.keys(result));
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          console.log('❌ Task not found. Available tasks:', helmdev.state.queue.tasks.length);
          console.log('Task IDs:', helmdev.state.queue.tasks.slice(0, 5).map(t => t.id));
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Task not found', taskId }));
        }
      } catch (error) {
        console.error('❌ Dispatch error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  } else if (req.url === '/api/helmdev/skip' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { taskId, reason } = JSON.parse(body);
      helmdev.skipTask(taskId, reason);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats: helmdev.getStats() }));
    });
    
  } else if (req.url === '/api/helmdev/complete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { taskId, success } = JSON.parse(body);
      helmdev.completeTask(taskId, { success: success });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats: helmdev.getStats() }));
    });
    
  } else if (req.url === '/api/helmdev/mode' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { mode } = JSON.parse(body);
      helmdev.setMode(mode);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ mode: mode }));
    });
    
  } else if (req.url === '/api/helmdev/clear-history' && req.method === 'POST') {
    helmdev.clearHistory();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));

  // === NEW BRIDGE ENDPOINTS ===
    
  } else if (req.url === '/api/helmdev/bridge-status' && req.method === 'GET') {
    helmdev.checkBridgeStatus().then(status => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        connected: helmdev.bridgeConnected,
        status: status || { error: 'Bridge not running' }
      }));
    });
    
  } else if (req.url === '/api/helmdev/start-bridge' && req.method === 'POST') {
    helmdev.startBridge().then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    
  } else if (req.url === '/api/helmdev/codebase' && req.method === 'GET') {
    helmdev.getCodebaseAnalysis().then(analysis => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(analysis || { error: 'Bridge not connected' }));
    });
    
  } else if (req.url === '/api/helmdev/megathink' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const options = body ? JSON.parse(body) : {};
        const proposals = await helmdev.runMegaThink(options);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(proposals));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  } else if (req.url === '/api/helmdev/typescript-check' && req.method === 'GET') {
    helmdev.runTypeScriptCheck().then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    
  } else if (req.url === '/api/helmdev/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { task } = JSON.parse(body);
        const result = await helmdev.verifyFix(task);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  } else if (req.url === '/api/helmdev/memory-stats' && req.method === 'GET') {
    helmdev.getMemoryStats().then(stats => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    });
    
  } else if (req.url === '/api/helmdev/style' && req.method === 'GET') {
    helmdev.getStylePreferences().then(style => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(style));
    });
    
  // Route detail endpoint
  } else if (req.url === '/api/route-detail' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { routePath } = JSON.parse(body);
        
        if (!lastAnalysis) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No analysis available' }));
          return;
        }
        
        const route = lastAnalysis.routes[routePath];
        const routeIntel = lastAnalysis.route_intelligence?.[routePath];
        const routeIssues = lastAnalysis.issues.filter(i => i.file_path.includes(routePath.replace(/\//g, path.sep)));
        
        const detail = {
          path: routePath,
          route: route,
          intelligence: routeIntel,
          issues: routeIssues,
          scoreBreakdown: routeIntel ? {
            total: routeIntel.completion_score,
            factors: {
              hasLoading: routeIntel.has_loading_state ? 10 : 0,
              hasError: routeIntel.has_error_handling ? 10 : 0,
              hasEmpty: routeIntel.has_empty_state ? 10 : 0,
              formValidation: routeIntel.has_form_validation ? 10 : 0,
              accessibility: routeIntel.accessibility_score || 0,
              elementsScore: Math.min(route?.elements?.length * 2, 30) || 0,
              noIssues: routeIssues.length === 0 ? 20 : Math.max(0, 20 - routeIssues.length * 5),
            }
          } : null,
          suggestions: [],
        };
        
        if (routeIntel) {
          if (!routeIntel.has_loading_state) {
            detail.suggestions.push({ type: 'missing_loading', priority: 'high', title: 'Add Loading State', description: 'Add Skeleton or Spinner while data loads.', impact: '+10 pts' });
          }
          if (!routeIntel.has_error_handling) {
            detail.suggestions.push({ type: 'missing_error', priority: 'high', title: 'Add Error Handling', description: 'Add error boundary and error UI components.', impact: '+10 pts' });
          }
          if (!routeIntel.has_empty_state) {
            detail.suggestions.push({ type: 'missing_empty', priority: 'medium', title: 'Add Empty State', description: 'Show helpful message when no data.', impact: '+10 pts' });
          }
        }
        
        routeIssues.forEach(issue => {
          detail.suggestions.push({
            type: issue.type,
            priority: issue.severity === 'error' ? 'critical' : 'medium',
            title: issue.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: issue.message,
            suggestion: issue.suggestion,
            line: issue.line_number,
            impact: issue.severity === 'error' ? 'Fix required' : '+5 pts'
          });
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(detail));
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  // Send task to Cursor's Claude (legacy - AppleScript)
  } else if (req.url === '/api/helmdev/execute-claude' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { prompt, taskId } = JSON.parse(body);
        console.log('📝 Sending task to Cursor:', taskId);
        
        // Save prompt to a markdown file
        const promptPath = path.join(helmdev.helmdevDir, 'tasks', 'current-task.md');
        fs.writeFileSync(promptPath, prompt);
        
        // Copy prompt to clipboard
        const pbcopy = spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] });
        pbcopy.stdin.write(prompt);
        pbcopy.stdin.end();
        
        await new Promise(resolve => pbcopy.on('close', resolve));
        
        // AppleScript to: activate Cursor, open AI chat (Cmd+L), paste, and submit
        const appleScript = `
          tell application "Cursor"
            activate
          end tell
          
          delay 0.5
          
          tell application "System Events"
            tell process "Cursor"
              keystroke "l" using command down
              delay 0.3
              keystroke "v" using command down
              delay 0.2
              keystroke return
            end tell
          end tell
        `;
        
        const osascript = spawn('osascript', ['-e', appleScript], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        
        let scriptOutput = '';
        osascript.stdout.on('data', (data) => scriptOutput += data);
        osascript.stderr.on('data', (data) => scriptOutput += data);
        
        osascript.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Sent to Cursor successfully');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Sent to Cursor - check the AI chat',
              promptPath 
            }));
          } else {
            console.log('⚠️ AppleScript failed:', scriptOutput);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Prompt copied to clipboard - paste into Cursor with Cmd+V',
              promptPath,
              note: 'Auto-send failed, but prompt is in clipboard'
            }));
          }
        });
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  // ==================== CLAUDE CODE CLI ENDPOINT ====================
  // Runs `claude` CLI directly - uses stdin to send prompt
  } else if (req.url === '/api/helmdev/execute-claude-cli' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { prompt, taskId } = JSON.parse(body);
        console.log('🤖 Running Claude Code CLI for task:', taskId);
        
        // Save prompt to file for reference
        const promptPath = path.join(helmdev.helmdevDir, 'tasks', 'current-task.md');
        fs.mkdirSync(path.dirname(promptPath), { recursive: true });
        fs.writeFileSync(promptPath, prompt);
        
        console.log('📝 Task file:', promptPath);
        console.log('✅ Prompt length:', prompt.length);
        console.log('🚀 Starting Claude Code via stdin...');
        
        // Run Claude Code CLI - send prompt via stdin
        const claude = spawn('claude', [], {
          cwd: PROJECT_ROOT,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
        });
        
        // Send the prompt via stdin
        claude.stdin.write(prompt);
        claude.stdin.end();
        
        let output = '';
        
        claude.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          if (output.length < 1000) {
            console.log('[Claude]', text.trim().slice(0, 200));
          }
        });
        
        claude.stderr.on('data', (data) => {
          const text = data.toString();
          if (!text.includes('DeprecationWarning')) {
            console.error('[Claude Error]', text.trim().slice(0, 200));
          }
        });
        
        console.log('✅ Claude Code CLI started (running in background)');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Claude Code CLI started - running in background',
          promptPath,
          taskId,
        }));
        
        claude.on('close', (code) => {
          console.log(`⚠️ Claude Code CLI exited with code: ${code}`);
          console.log('Output length:', output.length);
          
          // Save result
          const resultPath = path.join(helmdev.helmdevDir, 'results', `${taskId}.json`);
          fs.mkdirSync(path.dirname(resultPath), { recursive: true });
          fs.writeFileSync(resultPath, JSON.stringify({
            taskId,
            status: code === 0 ? 'completed' : 'failed',
            exitCode: code,
            output: output.slice(-2000),
            timestamp: new Date().toISOString(),
          }, null, 2));
        });
        
      } catch (error) {
        console.error('❌ Claude Code CLI error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  // ==================== CLAUDE CODE FULL AUTONOMOUS MODE ====================
  // Uses --dangerously-skip-permissions for maximum autonomy
  } else if (req.url === '/api/helmdev/execute-claude-autonomous' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { prompt, taskId } = JSON.parse(body);
        console.log('🤖 Running Claude Code AUTONOMOUS for task:', taskId);
        
        // Save prompt to file
        const promptPath = path.join(helmdev.helmdevDir, 'tasks', 'current-task.md');
        fs.mkdirSync(path.dirname(promptPath), { recursive: true });
        fs.writeFileSync(promptPath, prompt);
        
        console.log('🚀 Starting Claude Code with FULL AUTONOMY...');
        
        // Run Claude Code CLI - pipe prompt via stdin (no -p flag)
        // This allows Claude to actually use tools and make edits
        const claude = spawn('claude', [
          '--dangerously-skip-permissions',
        ], {
          cwd: PROJECT_ROOT,
          stdio: ['pipe', 'pipe', 'pipe'],  // pipe stdin so we can send prompt
          shell: true,
        });
        
        // Send the prompt via stdin
        claude.stdin.write(prompt);
        claude.stdin.end();
        
        let output = '';
        
        claude.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          // Only log first part to avoid spam
          if (output.length < 1000) {
            console.log('[Claude]', text.trim().slice(0, 200));
          }
        });
        
        claude.stderr.on('data', (data) => {
          const text = data.toString();
          if (!text.includes('DeprecationWarning')) {
            console.error('[Claude Error]', text.trim().slice(0, 200));
          }
        });
        
        console.log('✅ Claude Code AUTONOMOUS started');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Claude Code AUTONOMOUS started - full permissions bypassed',
          promptPath,
          taskId,
        }));
        
        claude.on('close', (code) => {
          console.log(`Claude AUTONOMOUS completed (code ${code}):`, taskId);
          console.log('Output length:', output.length);
          
          // Save result
          const resultPath = path.join(helmdev.helmdevDir, 'results', `${taskId}.json`);
          fs.mkdirSync(path.dirname(resultPath), { recursive: true });
          fs.writeFileSync(resultPath, JSON.stringify({
            taskId,
            status: code === 0 ? 'completed' : 'failed',
            exitCode: code,
            output: output.slice(-2000),
            timestamp: new Date().toISOString(),
          }, null, 2));
        });
        
      } catch (error) {
        console.error('❌ Claude AUTONOMOUS error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  // ==================== CONTINUOUS IMPROVEMENT AGENT ====================
  // Generates improvement tasks (priority 4-5) to add after issues
  } else if (req.url === '/api/helmdev/generate-improvements' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        if (!lastAnalysis) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No analysis available. Run analysis first.' }));
          return;
        }
        
        const improvements = [];
        const existingIds = new Set(helmdev.state.queue.tasks.map(t => t.id));
        const completedIds = new Set(helmdev.state.queue.completed.map(t => t.id));
        
        // Generate improvements based on route intelligence
        Object.entries(lastAnalysis.route_intelligence || {}).forEach(([routePath, intel]) => {
          // Accessibility improvements
          if ((intel.accessibility_score || 0) < 15) {
            const id = `improve-a11y-${routePath.replace(/\//g, '-')}`;
            if (!existingIds.has(id) && !completedIds.has(id)) {
              improvements.push({
                id,
                type: 'accessibility_enhancement',
                priority: 4,
                severity: 'improvement',
                message: `Improve accessibility for ${routePath} - add ARIA labels, keyboard navigation`,
                file_path: routePath,
                suggestion: 'Add aria-label, aria-describedby, tabIndex, onKeyDown handlers',
                created_at: new Date().toISOString(),
                status: 'pending',
              });
            }
          }
          
          // UX polish for near-complete routes
          if ((intel.completion_score || 0) >= 70 && (intel.completion_score || 0) < 90) {
            const id = `improve-ux-${routePath.replace(/\//g, '-')}`;
            if (!existingIds.has(id) && !completedIds.has(id)) {
              improvements.push({
                id,
                type: 'ux_polish',
                priority: 5,
                severity: 'enhancement',
                message: `Polish UX for ${routePath} - add micro-interactions, transitions`,
                file_path: routePath,
                suggestion: 'Add loading skeletons, hover effects, smooth transitions',
                created_at: new Date().toISOString(),
                status: 'pending',
              });
            }
          }
        });
        
        // Add to queue (sorted to end due to priority 4-5)
        helmdev.state.queue.tasks.push(...improvements);
        helmdev.state.queue.tasks.sort((a, b) => a.priority - b.priority);
        helmdev.saveQueue();
        
        console.log(`💡 Added ${improvements.length} improvement tasks`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          added: improvements.length, 
          stats: helmdev.getStats() 
        }));
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  // Add route issues to queue
  } else if (req.url === '/api/helmdev/add-route-issues' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { routePath, suggestions } = JSON.parse(body);
        const tasks = [];
        
        suggestions?.forEach((s, idx) => {
          const taskId = `route-${routePath.replace(/\//g, '-')}-${s.type}-${idx}`;
          if (!helmdev.state.queue.tasks.find(t => t.id === taskId)) {
            tasks.push({
              id: taskId,
              type: s.type,
              priority: s.priority === 'critical' ? 1 : s.priority === 'high' ? 2 : 3,
              severity: s.priority === 'critical' ? 'error' : 'warning',
              message: s.description,
              suggestion: s.suggestion || s.description,
              file_path: routePath,
              created_at: new Date().toISOString(),
              status: 'pending',
            });
          }
        });
        
        helmdev.state.queue.tasks.push(...tasks);
        helmdev.state.queue.tasks.sort((a, b) => a.priority - b.priority);
        helmdev.saveQueue();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ added: tasks.length, stats: helmdev.getStats() }));
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  // === END BRIDGE ENDPOINTS ===
    
  } else if (req.url === '/api/capture' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { routes } = JSON.parse(body);
        const { captureAllRoutes, saveScreenshots } = require('./capture.cjs');

        const timestamp = new Date().toISOString();
        const result = await captureAllRoutes(routes, timestamp);
        await saveScreenshots(result, timestamp);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Screenshot capture error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else if (req.url === '/screenshots/latest' && req.method === 'GET') {
    const latestPath = path.join(__dirname, '../snapshots/latest/screenshots.json');
    if (fs.existsSync(latestPath)) {
      const data = fs.readFileSync(latestPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ screenshots: {}, summary: { total: 0 } }));
    }
  } else if (req.url === '/screenshots/history' && req.method === 'GET') {
    const snapshotsDir = path.join(__dirname, '../snapshots');
    if (!fs.existsSync(snapshotsDir)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ history: [] }));
      return;
    }

    const dirs = fs.readdirSync(snapshotsDir)
      .filter(name => name !== 'latest' && fs.statSync(path.join(snapshotsDir, name)).isDirectory())
      .sort()
      .reverse();

    const history = dirs.map(dir => {
      const screenshotsPath = path.join(snapshotsDir, dir, 'screenshots.json');
      if (fs.existsSync(screenshotsPath)) {
        const data = JSON.parse(fs.readFileSync(screenshotsPath, 'utf8'));
        return {
          timestamp: data.summary.timestamp || dir.replace(/-/g, ':') + '.000Z',
          summary: data.summary
        };
      }
      return null;
    }).filter(item => item !== null);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history }));
  } else if (req.url === '/api/scan-components' && req.method === 'GET') {
    try {
      const ComponentScanner = require('./scan-components.cjs');
      const srcDir = path.join(__dirname, '../../../src');
      const scanner = new ComponentScanner(srcDir);
      const inventory = scanner.scan();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(inventory));
    } catch (error) {
      console.error('Component scan error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Component scan failed', message: error.message }));
    }
  } else if (req.url === '/api/scan-design-system' && req.method === 'GET') {
    try {
      const DesignSystemScanner = require('./design-system-scanner.cjs');
      const srcDir = path.join(__dirname, '../../../src');
      const scanner = new DesignSystemScanner(srcDir);
      const report = scanner.scan();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
    } catch (error) {
      console.error('Design system scan error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Design system scan failed', message: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('📱 Client connected (' + clients.size + ' total)');
  
  if (lastAnalysis) {
    ws.send(JSON.stringify({ type: 'analysis', data: lastAnalysis }));
  }
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('📱 Client disconnected (' + clients.size + ' total)');
  });
  
  ws.on('message', (message) => {
    const msg = JSON.parse(message);
    if (msg.type === 'refresh') {
      runAnalysis();
    }
  });
});

// Generate the dashboard HTML with HelmDev integration
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HelmDev Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a0b;
      --bg-secondary: #111113;
      --bg-tertiary: #18181b;
      --bg-elevated: #1f1f23;
      --border: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(255, 255, 255, 0.15);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent: #22c55e;
      --accent-muted: rgba(34, 197, 94, 0.15);
      --error: #ef4444;
      --error-muted: rgba(239, 68, 68, 0.15);
      --warning: #f59e0b;
      --warning-muted: rgba(245, 158, 11, 0.15);
      --info: #3b82f6;
      --info-muted: rgba(59, 130, 246, 0.15);
      --glass: rgba(255, 255, 255, 0.03);
      --glass-border: rgba(255, 255, 255, 0.06);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 64px 64px;
      pointer-events: none;
      z-index: -1;
    }
    .gradient-orb {
      position: fixed;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%);
      top: -200px;
      right: -200px;
      pointer-events: none;
      z-index: -1;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    .logo h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .logo h1 span { 
      background: linear-gradient(135deg, #8b5cf6, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .logo-subtitle { color: var(--text-muted); font-size: 12px; font-weight: 400; }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      animation: pulse 2s infinite;
    }
    .status-dot.disconnected { background: var(--error); animation: none; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--glass);
      border: 1px solid var(--glass-border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .refresh-btn:hover { background: var(--bg-tertiary); border-color: var(--border-hover); }
    .refresh-btn.loading svg { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 16px;
      transition: all 0.3s;
    }
    .stat-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
    .stat-label { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; font-family: 'JetBrains Mono', monospace; }
    .panel {
      background: var(--glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .panel-title { font-size: 13px; font-weight: 600; }
    .panel-badge {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      padding: 3px 8px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      color: var(--text-secondary);
    }
    .panel-content { padding: 16px; }
    .main-grid { display: grid; grid-template-columns: 1fr 380px; gap: 20px; }
    .graph-panel { height: 400px; }
    .graph-panel .panel-content { height: calc(100% - 48px); display: flex; align-items: center; justify-content: center; overflow: auto; }
    #mermaid-graph { width: 100%; height: 100%; }
    #mermaid-graph svg { max-width: 100%; height: auto; }
    .issues-panel { height: 400px; display: flex; flex-direction: column; }
    .issues-list { flex: 1; overflow-y: auto; padding: 8px; }
    .issue-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 4px;
      transition: background 0.2s;
      cursor: pointer;
    }
    .issue-item:hover { background: var(--bg-tertiary); }
    .issue-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
    }
    .issue-item.error .issue-icon { background: var(--error-muted); color: var(--error); }
    .issue-item.warning .issue-icon { background: var(--warning-muted); color: var(--warning); }
    .issue-content { flex: 1; min-width: 0; }
    .issue-message { font-size: 11px; color: var(--text-primary); }
    .issue-file { font-size: 10px; color: var(--text-muted); margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
    .loading-overlay {
      position: fixed;
      inset: 0;
      background: var(--bg-primary);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 100;
      transition: opacity 0.3s;
    }
    .loading-overlay.hidden { opacity: 0; pointer-events: none; }
    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    .timestamp {
      text-align: center;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .routes-table { width: 100%; border-collapse: collapse; }
    .routes-table th {
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .routes-table td { padding: 10px 12px; font-size: 12px; border-bottom: 1px solid var(--border); }
    .routes-table tr { cursor: pointer; transition: background 0.2s; }
    .routes-table tr:hover td { background: var(--bg-tertiary); }
    .route-path { font-family: 'JetBrains Mono', monospace; color: #8b5cf6; font-size: 11px; }
    .route-badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 2px 5px; border-radius: 3px; margin-left: 6px; }
    .route-badge.dynamic { background: var(--info-muted); color: var(--info); }

    ${HELMDEV_STYLES}
  </style>
</head>
<body>
  <div class="gradient-orb"></div>
  
  <div class="loading-overlay" id="loading">
    <div class="loading-spinner"></div>
    <p>Initializing HelmDev...</p>
  </div>

  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">🤖</div>
        <div>
          <h1><span>HelmDev</span> Dashboard</h1>
          <div class="logo-subtitle">UX Flow Auditor + Autonomous Development</div>
        </div>
      </div>
      <div class="header-actions">
        <div class="status">
          <div class="status-dot" id="status-dot"></div>
          <span id="status-text">Connected</span>
        </div>
        <button class="refresh-btn" onclick="toggleHelmdevPanel()" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.1)); border-color: rgba(139, 92, 246, 0.3);">
          🤖 Agent Panel
        </button>
        <button class="refresh-btn" id="refresh-btn" onclick="refresh()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          Refresh
        </button>
      </div>
    </header>

    ${HELMDEV_HTML}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Routes</div>
        <div class="stat-value" id="stat-routes" style="color: var(--text-primary);">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Completion</div>
        <div class="stat-value" id="stat-completion" style="color: #8b5cf6;">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Elements</div>
        <div class="stat-value" id="stat-elements" style="color: var(--info);">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Warnings</div>
        <div class="stat-value" id="stat-warnings" style="color: var(--warning);">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Errors</div>
        <div class="stat-value" id="stat-errors" style="color: var(--error);">—</div>
      </div>
    </div>

    <div class="main-grid">
      <div class="panel graph-panel">
        <div class="panel-header">
          <span class="panel-title">Navigation Graph</span>
          <span class="panel-badge" id="edge-count">0 edges</span>
        </div>
        <div class="panel-content">
          <div id="mermaid-graph"></div>
        </div>
      </div>

      <div class="panel issues-panel">
        <div class="panel-header">
          <span class="panel-title">Issues</span>
          <span class="panel-badge" id="issue-count">0 issues</span>
        </div>
        <div class="issues-list" id="issues-list">
          <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
            <p>No issues found</p>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Route Inventory</span>
        <span class="panel-badge" id="route-count">0 routes</span>
      </div>
      <div class="panel-content" style="padding: 0;">
        <table class="routes-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Score</th>
              <th>Elements</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody id="routes-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="timestamp" id="timestamp">Waiting for analysis...</div>
  </div>

  <script>
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#1f1f23',
        primaryTextColor: '#fafafa',
        primaryBorderColor: '#3f3f46',
        lineColor: '#71717a',
      }
    });

    var ws = null;
    var reconnectAttempts = 0;
    var lastData = null;

    function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function escapeJs(text) {
      return text.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/"/g, '\\\\"');
    }

    ${HELMDEV_JS}

    function connect() {
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + window.location.host);

      ws.onopen = function() {
        document.getElementById('status-dot').classList.remove('disconnected');
        document.getElementById('status-text').textContent = 'Connected';
        reconnectAttempts = 0;
      };

      ws.onclose = function() {
        document.getElementById('status-dot').classList.add('disconnected');
        document.getElementById('status-text').textContent = 'Disconnected';
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        setTimeout(connect, delay);
      };

      ws.onmessage = function(event) {
        try {
          var message = JSON.parse(event.data);
          if (message.type === 'analysis') {
            lastData = message.data;
            updateDashboard(message.data);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    }

    function updateDashboard(data) {
      try {
        document.getElementById('loading').classList.add('hidden');

        var avgCompletion = data.summary.average_completion_score || 0;

        document.getElementById('stat-routes').textContent = data.summary.total_routes;
        document.getElementById('stat-elements').textContent = data.summary.total_elements;
        document.getElementById('stat-completion').textContent = avgCompletion + '%';
        document.getElementById('stat-warnings').textContent = data.summary.issues.warnings;
        document.getElementById('stat-errors').textContent = data.summary.issues.errors;

        document.getElementById('edge-count').textContent = data.summary.total_edges + ' edges';
        document.getElementById('route-count').textContent = data.summary.total_routes + ' routes';
        document.getElementById('issue-count').textContent = data.issues.length + ' issues';

        renderGraph(data.mermaid);
        renderIssues(data.issues);
        renderRoutes(data.routes);

        var time = new Date(data.timestamp).toLocaleTimeString();
        document.getElementById('timestamp').textContent = 'Last updated: ' + time;
      } catch (e) {
        console.error('Failed to update dashboard:', e);
      }
    }

    function renderGraph(mermaidCode) {
      var container = document.getElementById('mermaid-graph');
      container.innerHTML = '';
      mermaid.render('graph-' + Date.now(), mermaidCode).then(function(result) {
        container.innerHTML = result.svg;
      }).catch(function(error) {
        console.error('Mermaid graph rendering failed:', error);
        container.innerHTML = '<p style="color: var(--text-muted)">Graph rendering failed</p>';
      });
    }

    function renderIssues(issues) {
      var container = document.getElementById('issues-list');
      
      if (issues.length === 0) {
        container.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--text-muted);"><p>No issues found</p></div>';
        return;
      }

      var icons = { error: '✕', warning: '⚠' };
      var html = '';
      
      issues.slice(0, 30).forEach(function(issue) {
        var filename = issue.file_path.split('/').slice(-2).join('/');
        html += '<div class="issue-item ' + issue.severity + '">';
        html += '<div class="issue-icon">' + (icons[issue.severity] || '•') + '</div>';
        html += '<div class="issue-content">';
        html += '<div class="issue-message">' + escapeHtml(issue.message) + '</div>';
        html += '<div class="issue-file">' + escapeHtml(filename) + '</div>';
        html += '</div></div>';
      });
      
      container.innerHTML = html;
    }

    function renderRoutes(routes) {
      var tbody = document.getElementById('routes-tbody');
      
      var rows = Object.entries(routes).map(function(entry) {
        var path = entry[0];
        var route = entry[1];
        
        var badges = [];
        if (route.is_dynamic) badges.push('<span class="route-badge dynamic">dynamic</span>');
        
        var ri = lastData.route_intelligence ? lastData.route_intelligence[path] : null;
        var score = ri ? ri.completion_score : '—';
        var scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
        
        return '<tr onclick="openRouteDetail(\\\'' + escapeJs(path) + '\\\')" style="cursor: pointer;">' +
          '<td><span class="route-path">' + escapeHtml(path) + '</span></td>' +
          '<td style="color: ' + scoreColor + '; font-weight: 600; font-family: JetBrains Mono;">' + score + '</td>' +
          '<td style="color: var(--text-muted);">' + route.elements.length + '</td>' +
          '<td>' + badges.join('') + '</td>' +
        '</tr>';
      });
      
      tbody.innerHTML = rows.join('');
    }
    
    // Route Detail Modal
    var currentRouteDetail = null;
    
    async function openRouteDetail(routePath) {
      try {
        var response = await fetch('/api/route-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routePath: routePath })
        });
        var detail = await response.json();
        currentRouteDetail = detail;
        showRouteModal(detail);
      } catch (error) {
        console.error('Failed to load route detail:', error);
      }
    }
    
    function showRouteModal(detail) {
      var modal = document.getElementById('route-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'route-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;';
        modal.onclick = function(e) { if (e.target === modal) closeRouteModal(); };
        document.body.appendChild(modal);
      }
      
      var score = detail.intelligence?.completion_score || 0;
      var scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
      var breakdown = detail.scoreBreakdown?.factors || {};
      
      var html = '<div style="background:var(--bg-secondary);border-radius:16px;max-width:800px;width:100%;max-height:90vh;overflow-y:auto;border:1px solid var(--border);">';
      
      // Header
      html += '<div style="padding:24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;">';
      html += '<div>';
      html += '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Route Analysis</div>';
      html += '<div style="font-size:18px;font-weight:700;font-family:JetBrains Mono;color:#8b5cf6;">' + escapeHtml(detail.path) + '</div>';
      html += '</div>';
      html += '<button onclick="closeRouteModal()" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;">&times;</button>';
      html += '</div>';
      
      // Score Section
      html += '<div style="padding:24px;border-bottom:1px solid var(--border);">';
      html += '<div style="display:flex;align-items:center;gap:24px;">';
      html += '<div style="text-align:center;">';
      html += '<div style="font-size:48px;font-weight:700;font-family:JetBrains Mono;color:' + scoreColor + ';">' + score + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);">Completion Score</div>';
      html += '</div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-size:12px;font-weight:600;margin-bottom:12px;">Score Breakdown</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
      html += renderScoreFactor("Loading", breakdown.hasLoading, 10);
      html += renderScoreFactor("Error UI", breakdown.hasError, 10);
      html += renderScoreFactor("Empty State", breakdown.hasEmpty, 10);
      html += renderScoreFactor("Validation", breakdown.formValidation, 10);
      html += renderScoreFactor("A11y", breakdown.accessibility, 20);
      html += renderScoreFactor("No Issues", breakdown.noIssues, 20);
      html += '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      
      // Suggestions Section
      if (detail.suggestions && detail.suggestions.length > 0) {
        html += '<div style="padding:24px;border-bottom:1px solid var(--border);">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
        html += '<div style="font-size:14px;font-weight:600;">🎯 Improvement Suggestions</div>';
        html += '<button onclick="addRouteToQueue()" style="padding:8px 16px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border:none;border-radius:8px;color:white;font-size:12px;font-weight:600;cursor:pointer;">📥 Add All to Queue</button>';
        html += '</div>';
        
        detail.suggestions.forEach(function(s) {
          var prioColor = s.priority === 'critical' ? '#ef4444' : s.priority === 'high' ? '#f59e0b' : '#3b82f6';
          html += '<div style="padding:12px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:8px;border-left:3px solid ' + prioColor + ';">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
          html += '<div style="font-size:13px;font-weight:600;">' + escapeHtml(s.title) + '</div>';
          html += '<div style="display:flex;gap:8px;align-items:center;">';
          html += '<span style="font-size:10px;padding:2px 6px;background:rgba(139,92,246,0.2);border-radius:4px;color:#a78bfa;">' + s.impact + '</span>';
          html += '<span style="font-size:10px;padding:2px 6px;background:' + prioColor + '20;border-radius:4px;color:' + prioColor + ';text-transform:uppercase;">' + s.priority + '</span>';
          html += '</div>';
          html += '</div>';
          html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">' + escapeHtml(s.description) + '</div>';
          if (s.line) html += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Line ' + s.line + '</div>';
          html += '</div>';
        });
        html += '</div>';
      }
      
      // Elements Section
      if (detail.route?.elements?.length > 0) {
        html += '<div style="padding:24px;">';
        html += '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">📦 UI Elements (' + detail.route.elements.length + ')</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
        detail.route.elements.forEach(function(el) {
          html += '<span style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;font-size:11px;font-family:JetBrains Mono;">' + escapeHtml(el.type) + '</span>';
        });
        html += '</div>';
        html += '</div>';
      }
      
      html += '</div>';
      modal.innerHTML = html;
      modal.style.display = 'flex';
    }
    
    function renderScoreFactor(name, value, max) {
      var pct = Math.round((value / max) * 100);
      var color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
      return '<div style="padding:8px;background:var(--bg-tertiary);border-radius:6px;">' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">' + name + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:4px;">' +
        '<span style="font-size:16px;font-weight:600;color:' + color + ';">' + (value || 0) + '</span>' +
        '<span style="font-size:10px;color:var(--text-muted);">/' + max + '</span>' +
        '</div></div>';
    }
    
    function closeRouteModal() {
      var modal = document.getElementById('route-modal');
      if (modal) modal.style.display = 'none';
    }
    
    async function addRouteToQueue() {
      if (!currentRouteDetail) return;
      try {
        var response = await fetch('/api/helmdev/add-route-issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routePath: currentRouteDetail.path,
            suggestions: currentRouteDetail.suggestions
          })
        });
        var data = await response.json();
        alert('Added ' + data.added + ' tasks to queue!');
        closeRouteModal();
        if (helmdevVisible) refreshHelmdevState();
      } catch (error) {
        console.error('Failed to add to queue:', error);
      }
    }

    function refresh() {
      var btn = document.getElementById('refresh-btn');
      btn.classList.add('loading');
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'refresh' }));
      setTimeout(function() { btn.classList.remove('loading'); }, 1000);
    }

    connect();
  <\/script>
</body>
</html>`;

server.listen(PORT, function() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                           ║');
  console.log('║   ██╗  ██╗███████╗██╗     ███╗   ███╗██████╗ ███████╗██╗   ██╗           ║');
  console.log('║   ██║  ██║██╔════╝██║     ████╗ ████║██╔══██╗██╔════╝██║   ██║           ║');
  console.log('║   ███████║█████╗  ██║     ██╔████╔██║██║  ██║█████╗  ██║   ██║           ║');
  console.log('║   ██╔══██║██╔══╝  ██║     ██║╚██╔╝██║██║  ██║██╔══╝  ╚██╗ ██╔╝           ║');
  console.log('║   ██║  ██║███████╗███████╗██║ ╚═╝ ██║██████╔╝███████╗ ╚████╔╝            ║');
  console.log('║   ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝╚═════╝ ╚══════╝  ╚═══╝             ║');
  console.log('║                                                                           ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                           ║');
  console.log('║   🤖 Dashboard: http://localhost:' + PORT + '                                    ║');
  console.log('║   📁 Watching:  ' + APP_DIR.padEnd(52) + '║');
  console.log('║                                                                           ║');
  console.log('║   Features:                                                               ║');
  console.log('║   • UX Flow Analysis          • Task Queue Management                     ║');
  console.log('║   • Route Intelligence        • Claude Code Dispatch                      ║');
  console.log('║   • Issue Tracking            • Memory & Learning                         ║');
  console.log('║                                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  runAnalysis();
  
  var resolvedPath = path.resolve(APP_DIR);
  if (fs.existsSync(resolvedPath)) {
    watchDirectory(resolvedPath);
  } else {
    console.error('⚠️  Directory not found: ' + resolvedPath);
  }
});
