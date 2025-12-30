#!/usr/bin/env node
/**
 * HelmDev Dashboard Patch
 * 
 * This script patches the UX Flow Auditor dashboard to include
 * the HelmDev agent system integration.
 * 
 * Run with: node patch-dashboard.js
 */

const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, 'dashboard.cjs');
const backupPath = path.join(__dirname, 'dashboard.cjs.backup');

console.log('🔧 Patching UX Flow Auditor Dashboard with HelmDev integration...\n');

// Read the current dashboard
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

// Check if already patched
if (dashboard.includes('helmdev-panel')) {
  console.log('✅ Dashboard already includes HelmDev integration!');
  process.exit(0);
}

// Create backup
fs.writeFileSync(backupPath, dashboard);
console.log('📦 Created backup at dashboard.cjs.backup');

// Import HelmDev integration at the top
const helmdevImport = `
const HelmDevIntegration = require('./helmdev-integration.cjs');
const { HELMDEV_STYLES, HELMDEV_HTML, HELMDEV_JS } = require('./helmdev-panel.cjs');
`;

// Add after the existing requires
dashboard = dashboard.replace(
  "const { WebSocketServer } = require('ws');",
  `const { WebSocketServer } = require('ws');
${helmdevImport}`
);

// Initialize HelmDev after APP_DIR
const helmdevInit = `
// HelmDev Integration
const PROJECT_ROOT = path.resolve(APP_DIR, '..');
const helmdev = new HelmDevIntegration(PROJECT_ROOT);
helmdev.loadState();
`;

dashboard = dashboard.replace(
  "const ANALYZER_SCRIPT = path.join(SCRIPT_DIR, 'analyze_flows.py');",
  `const ANALYZER_SCRIPT = path.join(SCRIPT_DIR, 'analyze_flows.py');
${helmdevInit}`
);

// Add HelmDev API endpoints
const helmdevEndpoints = `
  } else if (req.url === '/api/helmdev/state' && req.method === 'GET') {
    // Get HelmDev state
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
    // Populate queue from analysis
    if (lastAnalysis) {
      helmdev.populateQueueFromAnalysis(lastAnalysis);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ queue: helmdev.state.queue, stats: helmdev.getStats() }));
    
  } else if (req.url === '/api/helmdev/dispatch' && req.method === 'POST') {
    // Dispatch task to Claude Code
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { taskId } = JSON.parse(body);
        const task = helmdev.state.queue.tasks.find(t => t.id === taskId);
        if (task) {
          const result = await helmdev.dispatchToClaudeCode(task);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Task not found' }));
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
  } else if (req.url === '/api/helmdev/skip' && req.method === 'POST') {
    // Skip task
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { taskId, reason } = JSON.parse(body);
      helmdev.skipTask(taskId, reason);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats: helmdev.getStats() }));
    });
    
  } else if (req.url === '/api/helmdev/complete' && req.method === 'POST') {
    // Complete task
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { taskId, success } = JSON.parse(body);
      helmdev.completeTask(taskId, { success: success });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats: helmdev.getStats() }));
    });
    
  } else if (req.url === '/api/helmdev/mode' && req.method === 'POST') {
    // Set mode
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { mode } = JSON.parse(body);
      helmdev.setMode(mode);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ mode: mode }));
    });
    
  } else if (req.url === '/api/helmdev/clear-history' && req.method === 'POST') {
    // Clear history
    helmdev.clearHistory();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
`;

// Insert before the 404 handler
dashboard = dashboard.replace(
  "} else {\n    res.writeHead(404);\n    res.end('Not found');",
  `${helmdevEndpoints}
  } else {
    res.writeHead(404);
    res.end('Not found');`
);

// Add HelmDev button to header
const helmdevButton = `
            <button class="refresh-btn" onclick="toggleHelmdevPanel()" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.1)); border-color: rgba(139, 92, 246, 0.3);">
              🤖 HelmDev
            </button>`;

dashboard = dashboard.replace(
  `<button class="refresh-btn" onclick="toggleScreenshotsView()"`,
  `${helmdevButton}
            <button class="refresh-btn" onclick="toggleScreenshotsView()"`
);

// Add HelmDev styles to <style> section
dashboard = dashboard.replace(
  '.mermaid .edgeLabel { background: var(--bg-secondary) !important; fill: var(--text-secondary) !important; font-size: 10px !important; }',
  `.mermaid .edgeLabel { background: var(--bg-secondary) !important; fill: var(--text-secondary) !important; font-size: 10px !important; }
    
    \${HELMDEV_STYLES}`
);

// Add HelmDev panel HTML after Quick Health panel
dashboard = dashboard.replace(
  '<!-- Screenshot Gallery Panel -->',
  `\${HELMDEV_HTML}
    
    <!-- Screenshot Gallery Panel -->`
);

// Add HelmDev JS before the connect() call
dashboard = dashboard.replace(
  '// Load milestones and annotations from localStorage',
  `\${HELMDEV_JS}
    
    // Load milestones and annotations from localStorage`
);

// Write the patched dashboard
fs.writeFileSync(dashboardPath, dashboard);

console.log('✅ Successfully patched dashboard with HelmDev integration!\n');
console.log('📊 New features added:');
console.log('   • 🤖 HelmDev button in header');
console.log('   • 📋 Task queue management');
console.log('   • 🚀 Claude Code dispatch');
console.log('   • 🧠 Memory & learning stats');
console.log('   • 👁️ Supervised/Autonomous modes');
console.log('');
console.log('🚀 Run the dashboard with: npm run dashboard');
