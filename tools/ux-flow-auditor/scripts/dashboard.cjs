#!/usr/bin/env node
/**
 * UX Flow Auditor Dashboard Server
 * Watches your Next.js app directory and serves a live-updating analysis dashboard
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

// Configuration
const PORT = process.env.PORT || 3333;
const APP_DIR = process.argv[2] || './app';
const SCRIPT_DIR = path.dirname(__filename);
const ANALYZER_SCRIPT = path.join(SCRIPT_DIR, 'analyze_flows.py');

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

  if (req.url === '/' || req.url === '/index.html') {
    serveHTML(res);
  } else if (req.url === '/api/analysis') {
    serveAnalysis(res);
  } else if (req.url === '/api/refresh') {
    runAnalysis().then(() => serveAnalysis(res));
  } else if (req.url === '/api/capture' && req.method === 'POST') {
    // Screenshot capture API
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { routes } = JSON.parse(body);
        const { captureAllRoutes, saveScreenshots } = require('./capture.js');

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
    // Serve latest screenshots
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
    // Serve screenshot history timeline
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

        // Calculate average score if route intelligence data exists
        let avgScore;
        if (lastAnalysis && lastAnalysis.route_intelligence) {
          const scores = Object.keys(data.screenshots)
            .map(route => lastAnalysis.route_intelligence[route]?.completion_score)
            .filter(score => score !== undefined);
          if (scores.length > 0) {
            avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          }
        }

        return {
          timestamp: data.summary.timestamp || dir.replace(/-/g, ':') + '.000Z',
          summary: data.summary,
          avgScore: avgScore
        };
      }
      return null;
    }).filter(item => item !== null);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history }));
  } else if (req.url.startsWith('/screenshots/') && req.method === 'GET') {
    // Serve specific timestamp screenshots
    const timestamp = req.url.split('/screenshots/')[1];
    const screenshotsPath = path.join(__dirname, '../snapshots', timestamp, 'screenshots.json');

    if (fs.existsSync(screenshotsPath)) {
      const data = fs.readFileSync(screenshotsPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Screenshot not found' }));
    }
  } else if (req.url === '/api/scan-components' && req.method === 'GET') {
    // Scan components and return inventory
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
      res.end(JSON.stringify({
        error: 'Component scan failed',
        message: error.message
      }));
    }
  } else if (req.url === '/api/scan-design-system' && req.method === 'GET') {
    // Scan design system and return report
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
      res.end(JSON.stringify({
        error: 'Design system scan failed',
        message: error.message
      }));
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

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UX Flow Auditor</title>
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
      background: radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%);
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
      margin-bottom: 48px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, var(--accent) 0%, #15803d 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .logo h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
    .logo span { color: var(--text-muted); font-size: 13px; font-weight: 400; }
    .header-actions { display: flex; align-items: center; gap: 16px; }
    .status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
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
      padding: 8px 16px;
      background: var(--glass);
      border: 1px solid var(--glass-border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 13px;
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
      margin-bottom: 32px;
    }
    .stat-card {
      background: var(--glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 20px;
      transition: all 0.3s;
    }
    .stat-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
    .stat-label { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; font-family: 'JetBrains Mono', monospace; }
    .stat-card.routes .stat-value { color: var(--text-primary); }
    .stat-card.elements .stat-value { color: var(--info); }
    .stat-card.todos .stat-value { color: #a855f7; }
    .stat-card.warnings .stat-value { color: var(--warning); }
    .stat-card.errors .stat-value { color: var(--error); }
    .main-grid { display: grid; grid-template-columns: 1fr 420px; gap: 24px; }
    .panel {
      background: var(--glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .panel-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .panel-badge {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 8px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      color: var(--text-secondary);
    }
    .panel-content { padding: 20px; }
    .graph-panel { height: 480px; }
    .graph-panel .panel-content { height: calc(100% - 53px); display: flex; align-items: center; justify-content: center; overflow: auto; }
    #mermaid-graph { width: 100%; height: 100%; }
    #mermaid-graph svg { max-width: 100%; height: auto; }
    .issues-panel { height: 480px; display: flex; flex-direction: column; }
    .filter-bar {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .filter-btn {
      padding: 6px 12px;
      background: var(--bg-tertiary);
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .filter-btn:hover { border-color: var(--border-hover); color: var(--text-primary); }
    .filter-btn.active { background: var(--accent-muted); border-color: var(--accent); color: var(--accent); }
    .issues-list { flex: 1; overflow-y: auto; padding: 8px; }
    .issue-group { margin-bottom: 16px; }
    .issue-group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 8px;
    }
    .issue-group-header:hover { background: var(--bg-tertiary); }
    .issue-group-icon { font-size: 14px; }
    .issue-group-title { flex: 1; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
    .issue-group-count {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      color: var(--text-secondary);
    }
    .issue-group-chevron { color: var(--text-muted); transition: transform 0.2s; }
    .issue-group.collapsed .issue-group-chevron { transform: rotate(-90deg); }
    .issue-group.collapsed .issue-group-items { display: none; }
    .issue-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 6px;
      transition: background 0.2s;
    }
    .issue-item:hover { background: var(--bg-tertiary); }
    .issue-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }
    .issue-item.error .issue-icon { background: var(--error-muted); color: var(--error); }
    .issue-item.warning .issue-icon { background: var(--warning-muted); color: var(--warning); }
    .issue-item.info .issue-icon { background: var(--info-muted); color: var(--info); }
    .issue-content { flex: 1; min-width: 0; padding-right: 120px; }
    .issue-item .ai-fix-badge {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
    }
    .issue-message { font-size: 12px; color: var(--text-primary); word-break: break-word; }
    .issue-file { font-size: 10px; color: var(--text-muted); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }
    .issue-suggestion {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 6px;
      padding: 6px 10px;
      background: var(--bg-secondary);
      border-radius: 4px;
      border-left: 2px solid var(--accent);
    }
    .no-issues {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      text-align: center;
      padding: 40px;
    }
    .no-issues-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
    .routes-panel { margin-top: 24px; grid-column: 1 / -1; }
    .routes-table { width: 100%; border-collapse: collapse; }
    .routes-table th {
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    .routes-table td { padding: 12px 14px; font-size: 12px; border-bottom: 1px solid var(--border); }
    .routes-table tr { cursor: pointer; transition: background 0.2s; }
    .routes-table tr:hover td { background: var(--bg-tertiary); }
    .route-path { font-family: 'JetBrains Mono', monospace; color: var(--accent); font-size: 11px; }
    .route-badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 2px 5px; border-radius: 3px; margin-left: 6px; }
    .route-badge.dynamic { background: var(--info-muted); color: var(--info); }
    .route-badge.layout { background: var(--accent-muted); color: var(--accent); }
    .route-badge.loading { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .route-badge.error-b { background: var(--error-muted); color: var(--error); }
    .element-count { font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); }
    .route-issues { display: flex; gap: 4px; }
    .route-issue-dot { width: 8px; height: 8px; border-radius: 50%; }
    .route-issue-dot.error { background: var(--error); }
    .route-issue-dot.warning { background: var(--warning); }
    .timestamp {
      text-align: center;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }
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
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .modal-overlay.open { opacity: 1; pointer-events: auto; }
    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 20px;
      width: 90%;
      max-width: 800px;
      max-height: 85vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95) translateY(10px);
      transition: transform 0.2s;
    }
    .modal-overlay.open .modal { transform: scale(1) translateY(0); }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }
    .modal-title {
      font-size: 18px;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent);
    }
    .modal-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      transition: all 0.2s;
    }
    .modal-close:hover { border-color: var(--border-hover); color: var(--text-primary); }
    .modal-body { flex: 1; overflow-y: auto; padding: 24px; }
    .report-section { margin-bottom: 28px; }
    .report-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .report-section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .report-meta-item { background: var(--bg-tertiary); border-radius: 10px; padding: 14px; }
    .report-meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 4px; }
    .report-meta-value { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .report-meta-value.success { color: var(--accent); }
    .report-meta-value.warning { color: var(--warning); }
    .report-meta-value.error { color: var(--error); }
    .report-list { background: var(--bg-tertiary); border-radius: 10px; overflow: hidden; }
    .report-list-item { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
    .report-list-item:last-child { border-bottom: none; }
    .report-list-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
    .report-list-icon.link { background: var(--accent-muted); color: var(--accent); }
    .report-list-icon.inbound { background: rgba(34, 197, 94, 0.15); color: var(--accent); }
    .report-list-icon.outbound { background: var(--info-muted); color: var(--info); }
    .report-list-content { flex: 1; min-width: 0; }
    .report-list-title { font-size: 13px; color: var(--text-primary); }
    .report-list-subtitle { font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
    .report-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
    .report-nav-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .report-nav-section h4 { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
    @media (max-width: 1200px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 1024px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .main-grid { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .stats-grid { grid-template-columns: 1fr; } .report-nav-grid { grid-template-columns: 1fr; } }
    .mermaid .node rect { fill: var(--bg-tertiary) !important; stroke: var(--border-hover) !important; }
    .mermaid .node .label { fill: var(--text-primary) !important; font-family: 'JetBrains Mono', monospace !important; }
    .mermaid .edgePath path { stroke: var(--text-muted) !important; }
    .mermaid .edgeLabel { background: var(--bg-secondary) !important; fill: var(--text-secondary) !important; font-size: 10px !important; }

    /* Command Palette */
    .command-palette-container {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 16px;
      width: 90%;
      max-width: 640px;
      max-height: 70vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      animation: commandPaletteSlideIn 0.2s ease-out;
    }
    @keyframes commandPaletteSlideIn {
      from { transform: scale(0.95) translateY(-10px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }
    .command-palette-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .command-palette-header input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-size: 15px;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .command-palette-header input::placeholder { color: var(--text-muted); }
    .command-kbd {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 6px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-muted);
    }
    .command-results {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .command-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }
    .command-group {
      margin-bottom: 16px;
    }
    .command-group-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding: 8px 12px 4px;
    }
    .command-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .command-item:hover, .command-item.selected {
      background: var(--bg-tertiary);
    }
    .command-item.selected {
      border: 1px solid var(--border-hover);
    }
    .command-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .command-icon.route {
      background: var(--accent-muted);
      color: var(--accent);
    }
    .command-icon.issue {
      background: var(--warning-muted);
      color: var(--warning);
    }
    .command-icon.action {
      background: var(--info-muted);
      color: var(--info);
    }
    .command-content {
      flex: 1;
      min-width: 0;
    }
    .command-title {
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .command-subtitle {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .command-badge {
      font-size: 10px;
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      color: var(--text-secondary);
      font-family: 'JetBrains Mono', monospace;
      flex-shrink: 0;
    }
    .command-footer {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg-primary);
    }
    .command-footer-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .command-footer-item kbd {
      font-size: 9px;
      padding: 2px 5px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Route Explorer Sidebar */
    .app-layout {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .route-explorer {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .route-explorer-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .route-explorer-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .route-explorer-search {
      padding: 8px 12px;
      margin: 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .route-explorer-search input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-size: 12px;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .route-explorer-search input::placeholder { color: var(--text-muted); }
    .route-explorer-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .route-tree-node {
      margin-bottom: 2px;
    }
    .route-tree-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }
    .route-tree-item:hover {
      background: var(--bg-tertiary);
    }
    .route-tree-item.active {
      background: var(--accent-muted);
      color: var(--accent);
    }
    .route-tree-chevron {
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 10px;
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .route-tree-node.collapsed > .route-tree-item > .route-tree-chevron {
      transform: rotate(-90deg);
    }
    .route-tree-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-center;
      font-size: 12px;
      flex-shrink: 0;
    }
    .route-tree-label {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .route-tree-score {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .route-tree-score.high {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .route-tree-score.medium {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    .route-tree-score.low {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .route-tree-children {
      margin-left: 16px;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .route-tree-node.collapsed > .route-tree-children {
      max-height: 0 !important;
    }
    .main-content-wrapper {
      flex: 1;
      overflow-y: auto;
      background: var(--bg-primary);
      display: flex;
    }
    .content-center {
      flex: 1;
      overflow-y: auto;
    }

    /* Route Detail Panel */
    .route-detail-panel {
      width: 360px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .route-detail-panel.hidden {
      display: none;
    }
    .route-detail-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .route-detail-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .route-detail-close {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      transition: all 0.15s;
    }
    .route-detail-close:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
    .route-detail-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .detail-section {
      margin-bottom: 24px;
    }
    .detail-section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    .detail-stat {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--bg-primary);
      border-radius: 8px;
      margin-bottom: 6px;
    }
    .detail-stat-label {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .detail-stat-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .detail-score-ring {
      width: 100px;
      height: 100px;
      margin: 0 auto 16px;
      position: relative;
    }
    .detail-score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 24px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }
    .detail-badge-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .detail-badge {
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .detail-badge.detected {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .detail-badge.missing {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .detail-interaction-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: var(--bg-primary);
      border-radius: 6px;
      margin-bottom: 4px;
      font-size: 11px;
    }
    .detail-interaction-icon {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      flex-shrink: 0;
    }
    .detail-interaction-icon.working {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .detail-interaction-icon.broken, .detail-interaction-icon.todo {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .detail-interaction-icon.empty {
      background: rgba(161, 161, 170, 0.15);
      color: #a1a1aa;
    }
    .detail-interaction-label {
      flex: 1;
      color: var(--text-primary);
    }
    .detail-interaction-status {
      font-size: 10px;
      color: var(--text-muted);
    }

    /* Screenshot Gallery */
    .screenshot-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      padding: 20px;
    }
    .screenshot-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .screenshot-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
      border-color: var(--border-hover);
    }
    .screenshot-preview {
      width: 100%;
      aspect-ratio: 16/10;
      background: var(--bg-tertiary);
      position: relative;
      overflow: hidden;
    }
    .screenshot-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .screenshot-preview.loading {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 12px;
    }
    .screenshot-preview.error {
      background: rgba(239, 68, 68, 0.1);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--error);
      font-size: 12px;
      padding: 20px;
      text-align: center;
    }
    .screenshot-overlay {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 6px;
    }
    .screenshot-badge {
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      backdrop-filter: blur(8px);
    }
    .screenshot-badge.desktop {
      background: rgba(59, 130, 246, 0.9);
      color: white;
    }
    .screenshot-badge.mobile {
      background: rgba(168, 85, 247, 0.9);
      color: white;
    }
    .screenshot-info {
      padding: 12px;
    }
    .screenshot-path {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .screenshot-purpose {
      font-size: 11px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .screenshot-stats {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .screenshot-score {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .screenshot-score.high {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .screenshot-score.medium {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    .screenshot-score.low {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .screenshot-issues {
      font-size: 10px;
      color: var(--text-muted);
    }

    /* Screenshot Modal/Lightbox */
    .screenshot-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .screenshot-modal.open {
      opacity: 1;
      pointer-events: all;
    }
    .screenshot-modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .screenshot-modal-title {
      font-size: 14px;
      color: white;
      font-weight: 600;
    }
    .screenshot-modal-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .screenshot-view-toggle {
      display: flex;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 4px;
    }
    .screenshot-view-btn {
      padding: 6px 12px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .screenshot-view-btn.active {
      background: white;
      color: #09090b;
    }
    .screenshot-modal-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .screenshot-modal-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .screenshot-modal-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow: auto;
    }
    .screenshot-modal-image {
      max-width: 100%;
      max-height: 100%;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .screenshot-modal-footer {
      padding: 16px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
    }

    /* Timeline & History */
    .timeline-container {
      padding: 20px;
    }
    .timeline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .timeline-item {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .timeline-item:hover {
      border-color: var(--border-hover);
      background: var(--glass);
      transform: translateX(4px);
    }
    .timeline-item.selected {
      border-color: rgba(59, 130, 246, 0.5);
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05));
    }
    .timeline-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1));
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }
    .timeline-info {
      flex: 1;
    }
    .timeline-date {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .timeline-stats {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .timeline-compare-btn {
      padding: 8px 16px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 8px;
      color: #3b82f6;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .timeline-compare-btn:hover {
      background: rgba(59, 130, 246, 0.3);
      border-color: rgba(59, 130, 246, 0.5);
    }

    /* Visual Diff Comparison */
    .diff-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 12px;
    }
    .diff-images {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
    }
    .diff-image-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .diff-image-container.before {
      z-index: 1;
    }
    .diff-image-container.after {
      z-index: 2;
      clip-path: inset(0 0 0 50%);
    }
    .diff-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .diff-slider {
      position: absolute;
      top: 0;
      left: 50%;
      width: 4px;
      height: 100%;
      background: rgba(59, 130, 246, 0.8);
      cursor: ew-resize;
      z-index: 10;
      transform: translateX(-2px);
    }
    .diff-slider::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 40px;
      background: #3b82f6;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }
    .diff-slider::after {
      content: '⟷';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 20px;
      font-weight: bold;
      z-index: 1;
    }
    .diff-labels {
      position: absolute;
      top: 16px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 5;
      pointer-events: none;
    }
    .diff-label {
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: white;
    }
    .diff-label.before {
      color: #ef4444;
    }
    .diff-label.after {
      color: #22c55e;
    }

    /* Progress Chart */
    .progress-chart {
      padding: 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .progress-chart-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .progress-chart-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .progress-chart-canvas {
      width: 100%;
      height: 200px;
      background: var(--bg-primary);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      align-items: flex-end;
      gap: 4px;
    }
    .progress-bar {
      flex: 1;
      background: linear-gradient(180deg, rgba(59, 130, 246, 0.6), rgba(59, 130, 246, 0.3));
      border-radius: 4px 4px 0 0;
      min-height: 4px;
      position: relative;
      cursor: pointer;
      transition: all 0.2s;
    }
    .progress-bar:hover {
      background: linear-gradient(180deg, rgba(59, 130, 246, 0.8), rgba(59, 130, 246, 0.5));
    }
    .progress-bar-label {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: var(--text-muted);
      white-space: nowrap;
      margin-bottom: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .progress-bar:hover .progress-bar-label {
      opacity: 1;
    }

    /* Comparison Mode */
    .comparison-mode {
      padding: 12px 20px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05));
      border-bottom: 1px solid rgba(59, 130, 246, 0.2);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .comparison-info {
      font-size: 12px;
      color: #3b82f6;
      font-weight: 500;
    }
    .comparison-exit {
      padding: 4px 12px;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 6px;
      color: #ef4444;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .comparison-exit:hover {
      background: rgba(239, 68, 68, 0.3);
      border-color: rgba(239, 68, 68, 0.5);
    }

    /* AI Fix Panel */
    .ai-fix-panel {
      position: fixed;
      top: 0;
      right: -600px;
      width: 600px;
      height: 100vh;
      background: var(--bg-primary);
      border-left: 1px solid var(--border);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
    }
    .ai-fix-panel.open {
      right: 0;
    }
    .ai-fix-header {
      padding: 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), transparent);
    }
    .ai-fix-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ai-fix-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ai-fix-close:hover {
      background: var(--glass);
      border-color: var(--border-hover);
      color: var(--text-primary);
    }
    .ai-fix-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .ai-fix-loading {
      padding: 60px 20px;
      text-align: center;
      color: var(--text-muted);
    }
    .ai-fix-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(139, 92, 246, 0.2);
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .ai-fix-section {
      margin-bottom: 24px;
    }
    .ai-fix-section-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .ai-fix-explanation {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
      margin-bottom: 16px;
    }

    /* Code Diff Viewer */
    .code-diff {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .code-diff-header {
      padding: 12px 16px;
      background: var(--glass);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .code-diff-file {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
    }
    .code-diff-stats {
      font-size: 11px;
      color: var(--text-muted);
    }
    .code-diff-lines {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    .code-diff-line {
      display: flex;
      padding: 2px 0;
    }
    .code-diff-line-number {
      width: 40px;
      text-align: right;
      padding: 0 8px;
      color: var(--text-muted);
      user-select: none;
      flex-shrink: 0;
    }
    .code-diff-line-content {
      flex: 1;
      padding: 0 12px;
      white-space: pre;
      overflow-x: auto;
    }
    .code-diff-line.added {
      background: rgba(34, 197, 94, 0.1);
    }
    .code-diff-line.added .code-diff-line-number {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .code-diff-line.added .code-diff-line-content {
      color: #22c55e;
    }
    .code-diff-line.removed {
      background: rgba(239, 68, 68, 0.1);
    }
    .code-diff-line.removed .code-diff-line-number {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .code-diff-line.removed .code-diff-line-content {
      color: #ef4444;
    }
    .code-diff-line.context .code-diff-line-content {
      color: var(--text-primary);
    }

    /* AI Fix Actions */
    .ai-fix-actions {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
    }
    .ai-fix-btn {
      flex: 1;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .ai-fix-btn.primary {
      background: linear-gradient(135deg, #8b5cf6, #7c3aed);
      color: white;
    }
    .ai-fix-btn.primary:hover {
      background: linear-gradient(135deg, #7c3aed, #6d28d9);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    .ai-fix-btn.secondary {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      color: var(--text-primary);
    }
    .ai-fix-btn.secondary:hover {
      background: var(--glass);
      border-color: var(--border-hover);
    }
    .ai-fix-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* AI Badge on Issue Cards */
    .ai-fix-badge {
      padding: 4px 8px;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1));
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      color: #8b5cf6;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ai-fix-badge:hover {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(139, 92, 246, 0.2));
      border-color: rgba(139, 92, 246, 0.5);
      transform: translateY(-1px);
    }

    /* Milestone & Annotation System */
    .milestone-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(234, 179, 8, 0.1));
      border: 1px solid rgba(234, 179, 8, 0.4);
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      color: #eab308;
      margin-left: 8px;
    }
    .milestone-icon {
      font-size: 14px;
    }
    .timeline-item.has-milestone {
      border-left: 3px solid #eab308;
    }
    .timeline-item.has-annotation::after {
      content: '📝';
      position: absolute;
      top: 12px;
      right: 12px;
      font-size: 16px;
      opacity: 0.5;
    }
    .timeline-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    .timeline-action-btn {
      padding: 6px 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .timeline-action-btn:hover {
      background: var(--glass);
      color: var(--text-primary);
      border-color: var(--text-muted);
    }

    /* Milestone Modal */
    .milestone-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .milestone-modal.open {
      display: flex;
    }
    .milestone-modal-content {
      background: var(--bg-primary);
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .milestone-modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .milestone-modal-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .milestone-modal-body {
      padding: 24px;
      overflow-y: auto;
    }
    .milestone-form-group {
      margin-bottom: 20px;
    }
    .milestone-form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }
    .milestone-form-input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      color: var(--text-primary);
      transition: all 0.2s;
    }
    .milestone-form-input:focus {
      outline: none;
      border-color: #eab308;
      box-shadow: 0 0 0 3px rgba(234, 179, 8, 0.1);
    }
    .milestone-form-textarea {
      min-height: 100px;
      resize: vertical;
      font-family: inherit;
    }
    .milestone-icon-picker {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-top: 8px;
    }
    .milestone-icon-option {
      padding: 12px;
      background: var(--bg-secondary);
      border: 2px solid var(--border);
      border-radius: 8px;
      font-size: 20px;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    }
    .milestone-icon-option:hover {
      background: var(--glass);
      border-color: var(--text-muted);
    }
    .milestone-icon-option.selected {
      border-color: #eab308;
      background: rgba(234, 179, 8, 0.1);
    }
    .milestone-modal-actions {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .milestone-btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .milestone-btn.primary {
      background: linear-gradient(135deg, #eab308, #ca8a04);
      color: white;
    }
    .milestone-btn.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);
    }
    .milestone-btn.secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .milestone-btn.secondary:hover {
      background: var(--glass);
    }

    /* Export Panel */
    .export-panel {
      position: fixed;
      top: 0;
      right: -500px;
      width: 500px;
      height: 100vh;
      background: var(--bg-primary);
      border-left: 1px solid var(--border);
      z-index: 9998;
      display: flex;
      flex-direction: column;
      transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
    }
    .export-panel.open {
      right: 0;
    }
    .export-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .export-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .export-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--bg-secondary);
      border: none;
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .export-close:hover {
      background: var(--glass);
      color: var(--text-primary);
    }
    .export-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }
    .export-section {
      margin-bottom: 24px;
    }
    .export-section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    .export-option {
      padding: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }
    .export-option:hover {
      background: var(--glass);
      border-color: var(--success);
    }
    .export-option-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .export-option-desc {
      font-size: 12px;
      color: var(--text-muted);
    }
    .export-preview {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-primary);
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .export-actions {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 12px;
    }
    .export-btn {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .export-btn.primary {
      background: linear-gradient(135deg, #16a34a, #15803d);
      color: white;
    }
    .export-btn.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
    }

    /* Component Inventory */
    .component-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .component-item {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .component-item:hover {
      background: var(--glass);
      border-color: var(--success);
      transform: translateX(4px);
    }
    .component-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05));
      border: 1px solid rgba(99, 102, 241, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .component-icon.unused {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05));
      border-color: rgba(239, 68, 68, 0.2);
    }
    .component-info {
      flex: 1;
      min-width: 0;
    }
    .component-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .component-path {
      font-size: 11px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .component-stats {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .component-usage {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #6366f1;
    }
    .component-usage.unused {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .component-size {
      font-size: 11px;
      color: var(--text-muted);
    }
    .component-filter {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .filter-btn {
      padding: 8px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-btn:hover {
      background: var(--glass);
      border-color: var(--text-muted);
    }
    .filter-btn.active {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border-color: #6366f1;
    }
    .component-detail-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 10001;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .component-detail-modal.open {
      display: flex;
    }
    .component-detail-content {
      background: var(--bg-primary);
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 800px;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .component-detail-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .component-detail-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .component-detail-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }
    .used-by-list {
      margin-top: 16px;
    }
    .used-by-item {
      padding: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
    }
    .code-preview {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-primary);
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* Design System Audit */
    .design-token-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .design-token-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      transition: all 0.2s;
    }
    .design-token-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .color-swatch {
      width: 100%;
      height: 48px;
      border-radius: 6px;
      margin-bottom: 8px;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    .token-value {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .token-count {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .inconsistency-card {
      background: var(--bg-secondary);
      border-left: 4px solid var(--error);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .inconsistency-card.warning {
      border-left-color: var(--warning);
    }
    .inconsistency-type {
      display: inline-block;
      padding: 4px 8px;
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6366f1;
      margin-bottom: 8px;
    }
    .design-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .design-stat {
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .design-stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .design-stat-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="gradient-orb"></div>
  
  <div class="loading-overlay" id="loading">
    <div class="loading-spinner"></div>
    <p>Analyzing your app...</p>
  </div>

  <div class="modal-overlay" id="route-modal" onclick="closeModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title" id="modal-route-path">/</span>
        <button class="modal-close" onclick="closeRouteModal()">×</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  </div>

  <div class="modal-overlay" id="todo-modal" onclick="closeTodoModal(event)">
    <div class="modal" style="max-width: 900px;" onclick="event.stopPropagation()">
      <div class="modal-header" style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), transparent);">
        <span class="modal-title" style="color: #a855f7;">📋 Project TODO List</span>
        <button class="modal-close" onclick="closeTodoModalDirect()">×</button>
      </div>
      <div class="modal-body" id="todo-modal-body" style="max-height: 70vh;"></div>
    </div>
  </div>

  <div class="modal-overlay" id="issue-modal" onclick="closeIssueModal(event)">
    <div class="modal" style="max-width: 700px;" onclick="event.stopPropagation()">
      <div class="modal-header" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), transparent);">
        <span class="modal-title" style="color: var(--error);">🔍 Issue Details</span>
        <button class="modal-close" onclick="closeIssueModalDirect()">×</button>
      </div>
      <div class="modal-body" id="issue-modal-body" style="max-height: 70vh;"></div>
    </div>
  </div>

  <!-- Command Palette -->
  <div class="modal-overlay" id="command-palette" onclick="closeCommandPalette(event)">
    <div class="command-palette-container" onclick="event.stopPropagation()">
      <div class="command-palette-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted);">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input type="text" id="command-input" placeholder="Search routes, issues, actions..." autocomplete="off" />
        <kbd class="command-kbd">ESC</kbd>
      </div>
      <div class="command-results" id="command-results">
        <div class="command-empty">
          <div style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;">⌘K</div>
          <p style="color: var(--text-muted); font-size: 13px;">Type to search routes, issues, or actions</p>
        </div>
      </div>
      <div class="command-footer">
        <div class="command-footer-item">
          <kbd>↑↓</kbd> Navigate
        </div>
        <div class="command-footer-item">
          <kbd>↵</kbd> Select
        </div>
        <div class="command-footer-item">
          <kbd>ESC</kbd> Close
        </div>
      </div>
    </div>
  </div>

  <!-- Screenshot Modal -->
  <div class="screenshot-modal" id="screenshot-modal">
    <!-- Comparison Mode Banner -->
    <div class="comparison-mode" id="comparison-mode-banner" style="display: none;">
      <span class="comparison-info" id="comparison-info">Comparing: Before vs After</span>
      <div style="display: flex; gap: 12px;">
        <button class="comparison-exit" onclick="openExportPanel()" style="background: linear-gradient(135deg, #16a34a, #15803d);">📊 Export Report</button>
        <button class="comparison-exit" onclick="exitComparisonMode()">Exit Comparison</button>
      </div>
    </div>

    <div class="screenshot-modal-header">
      <span class="screenshot-modal-title" id="screenshot-modal-title">/route</span>
      <div class="screenshot-modal-controls">
        <div class="screenshot-view-toggle" id="screenshot-view-toggle">
          <button class="screenshot-view-btn active" data-view="desktop" onclick="switchScreenshotView('desktop')">Desktop</button>
          <button class="screenshot-view-btn" data-view="mobile" onclick="switchScreenshotView('mobile')">Mobile</button>
          <button class="screenshot-view-btn" data-view="fullPage" onclick="switchScreenshotView('fullPage')">Full Page</button>
        </div>
        <button class="screenshot-modal-close" onclick="closeScreenshotModal()">×</button>
      </div>
    </div>
    <div class="screenshot-modal-content" id="screenshot-modal-content">
      <!-- Single Image Mode -->
      <img id="screenshot-modal-image" class="screenshot-modal-image" src="" alt="Screenshot">

      <!-- Visual Diff Mode -->
      <div id="screenshot-diff-container" class="diff-container" style="display: none;">
        <div class="diff-images">
          <div class="diff-image-container before">
            <img id="diff-image-before" class="diff-image" src="" alt="Before">
          </div>
          <div class="diff-image-container after" id="diff-after-container">
            <img id="diff-image-after" class="diff-image" src="" alt="After">
          </div>
        </div>
        <div class="diff-slider" id="diff-slider"></div>
        <div class="diff-labels">
          <div class="diff-label before">Before</div>
          <div class="diff-label after">After</div>
        </div>
      </div>
    </div>
    <div class="screenshot-modal-footer">
      <span id="screenshot-modal-info">Captured: —</span>
      <span id="screenshot-modal-status">Status: —</span>
    </div>
  </div>

  <!-- AI Fix Panel -->
  <div class="ai-fix-panel" id="ai-fix-panel">
    <div class="ai-fix-header">
      <div class="ai-fix-title">
        <span>🤖</span>
        <span>AI Fix Suggestion</span>
      </div>
      <button class="ai-fix-close" onclick="closeAIFixPanel()">×</button>
    </div>
    <div class="ai-fix-content" id="ai-fix-content">
      <div class="ai-fix-loading" id="ai-fix-loading">
        <div class="ai-fix-spinner"></div>
        <p style="font-size: 14px;">Analyzing issue and generating fix...</p>
      </div>
      <div id="ai-fix-result" style="display: none;">
        <!-- AI fix content will be inserted here -->
      </div>
    </div>
    <div class="ai-fix-actions">
      <button class="ai-fix-btn secondary" onclick="copyAIFix()" id="copy-fix-btn" disabled>
        📋 Copy Code
      </button>
      <button class="ai-fix-btn primary" onclick="applyAIFix()" id="apply-fix-btn" disabled>
        ✨ Apply Fix
      </button>
    </div>
  </div>

  <!-- Milestone Modal -->
  <div class="milestone-modal" id="milestone-modal">
    <div class="milestone-modal-content">
      <div class="milestone-modal-header">
        <div class="milestone-modal-title">
          <span id="milestone-modal-icon">🏁</span>
          <span id="milestone-modal-title-text">Add Milestone</span>
        </div>
        <button class="export-close" onclick="closeMilestoneModal()">×</button>
      </div>
      <div class="milestone-modal-body">
        <div class="milestone-form-group">
          <label class="milestone-form-label">Milestone Title</label>
          <input type="text" id="milestone-title" class="milestone-form-input" placeholder="e.g., Before Redesign, Production Ready" />
        </div>
        <div class="milestone-form-group">
          <label class="milestone-form-label">Icon</label>
          <div class="milestone-icon-picker" id="milestone-icon-picker">
            <div class="milestone-icon-option selected" data-icon="🏁" onclick="selectMilestoneIcon('🏁')">🏁</div>
            <div class="milestone-icon-option" data-icon="🎯" onclick="selectMilestoneIcon('🎯')">🎯</div>
            <div class="milestone-icon-option" data-icon="⭐" onclick="selectMilestoneIcon('⭐')">⭐</div>
            <div class="milestone-icon-option" data-icon="🚀" onclick="selectMilestoneIcon('🚀')">🚀</div>
            <div class="milestone-icon-option" data-icon="✨" onclick="selectMilestoneIcon('✨')">✨</div>
            <div class="milestone-icon-option" data-icon="🔥" onclick="selectMilestoneIcon('🔥')">🔥</div>
            <div class="milestone-icon-option" data-icon="💎" onclick="selectMilestoneIcon('💎')">💎</div>
            <div class="milestone-icon-option" data-icon="🎉" onclick="selectMilestoneIcon('🎉')">🎉</div>
            <div class="milestone-icon-option" data-icon="📦" onclick="selectMilestoneIcon('📦')">📦</div>
            <div class="milestone-icon-option" data-icon="🛠️" onclick="selectMilestoneIcon('🛠️')">🛠️</div>
            <div class="milestone-icon-option" data-icon="🏗️" onclick="selectMilestoneIcon('🏗️')">🏗️</div>
            <div class="milestone-icon-option" data-icon="✅" onclick="selectMilestoneIcon('✅')">✅</div>
          </div>
        </div>
        <div class="milestone-form-group">
          <label class="milestone-form-label">Notes (Optional)</label>
          <textarea id="milestone-notes" class="milestone-form-input milestone-form-textarea" placeholder="Add any notes about this capture..."></textarea>
        </div>
      </div>
      <div class="milestone-modal-actions">
        <button class="milestone-btn secondary" onclick="closeMilestoneModal()">Cancel</button>
        <button class="milestone-btn primary" onclick="saveMilestone()">Save Milestone</button>
      </div>
    </div>
  </div>

  <!-- Annotation Modal (reuses milestone modal structure) -->
  <div class="milestone-modal" id="annotation-modal">
    <div class="milestone-modal-content">
      <div class="milestone-modal-header">
        <div class="milestone-modal-title">
          <span>📝</span>
          <span>Add Annotation</span>
        </div>
        <button class="export-close" onclick="closeAnnotationModal()">×</button>
      </div>
      <div class="milestone-modal-body">
        <div class="milestone-form-group">
          <label class="milestone-form-label">Notes</label>
          <textarea id="annotation-notes" class="milestone-form-input milestone-form-textarea" placeholder="Add notes about this capture..." style="min-height: 150px;"></textarea>
        </div>
        <div class="milestone-form-group">
          <label class="milestone-form-label">Tags (comma-separated)</label>
          <input type="text" id="annotation-tags" class="milestone-form-input" placeholder="e.g., bug-fix, redesign, performance" />
        </div>
      </div>
      <div class="milestone-modal-actions">
        <button class="milestone-btn secondary" onclick="closeAnnotationModal()">Cancel</button>
        <button class="milestone-btn primary" onclick="saveAnnotation()">Save Annotation</button>
      </div>
    </div>
  </div>

  <!-- Export Panel -->
  <div class="export-panel" id="export-panel">
    <div class="export-header">
      <div class="export-title">
        <span>📊</span>
        <span>Export Comparison Report</span>
      </div>
      <button class="export-close" onclick="closeExportPanel()">×</button>
    </div>
    <div class="export-content" id="export-content">
      <div class="export-section">
        <div class="export-section-title">Select Format</div>
        <div class="export-option" onclick="selectExportFormat('pdf')">
          <div class="export-option-title">📄 PDF Report</div>
          <div class="export-option-desc">Comprehensive visual report with screenshots and metrics</div>
        </div>
        <div class="export-option" onclick="selectExportFormat('markdown')">
          <div class="export-option-title">📝 Markdown</div>
          <div class="export-option-desc">Text-based report for GitHub/documentation</div>
        </div>
        <div class="export-option" onclick="selectExportFormat('json')">
          <div class="export-option-title">💾 JSON</div>
          <div class="export-option-desc">Raw data for programmatic processing</div>
        </div>
        <div class="export-option" onclick="selectExportFormat('html')">
          <div class="export-option-title">🌐 HTML</div>
          <div class="export-option-desc">Interactive web page with side-by-side comparison</div>
        </div>
      </div>
      <div class="export-section" id="export-preview-section" style="display: none;">
        <div class="export-section-title">Preview</div>
        <div class="export-preview" id="export-preview"></div>
      </div>
    </div>
    <div class="export-actions">
      <button class="export-btn primary" onclick="downloadExport()" id="download-export-btn" disabled>
        📥 Download Report
      </button>
    </div>
  </div>

  <!-- Component Detail Modal -->
  <div class="component-detail-modal" id="component-detail-modal">
    <div class="component-detail-content">
      <div class="component-detail-header">
        <div class="component-detail-title" id="component-detail-name">Component Name</div>
        <button class="export-close" onclick="closeComponentDetail()">×</button>
      </div>
      <div class="component-detail-body" id="component-detail-body">
        <!-- Content will be inserted by JavaScript -->
      </div>
    </div>
  </div>

  <div class="app-layout">
    <!-- Route Explorer Sidebar -->
    <div class="route-explorer">
      <div class="route-explorer-header">
        <span class="route-explorer-title">🗂️ Routes</span>
        <span class="panel-badge" id="route-count">0</span>
      </div>
      <div class="route-explorer-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted);">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input type="text" id="route-search" placeholder="Filter routes..." />
      </div>
      <div class="route-explorer-content" id="route-tree"></div>
    </div>

    <!-- Main Content Area -->
    <div class="main-content-wrapper">
      <div class="content-center">
        <div class="container">
          <header>
          <div class="logo">
            <div class="logo-icon">◈</div>
            <div>
              <h1>UX Flow Auditor</h1>
              <span id="app-path">Watching...</span>
            </div>
          </div>
          <div class="header-actions">
            <div class="status">
              <div class="status-dot" id="status-dot"></div>
              <span id="status-text">Connected</span>
            </div>
            <button class="refresh-btn" onclick="toggleScreenshotsView()" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1)); border-color: rgba(59, 130, 246, 0.3);">
              📸 Screenshots
            </button>
            <button class="refresh-btn" onclick="toggleTimelineView()" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1)); border-color: rgba(139, 92, 246, 0.3);">
              ⏱️ Timeline
            </button>
            <button class="refresh-btn" onclick="toggleComponentsView()" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1)); border-color: rgba(99, 102, 241, 0.3);">
              🧩 Components
            </button>
            <button class="refresh-btn" onclick="toggleDesignSystemView()" style="background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(236, 72, 153, 0.1)); border-color: rgba(236, 72, 153, 0.3);">
              🎨 Design System
            </button>
            <button class="refresh-btn" onclick="openTodoModal()" style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(168, 85, 247, 0.1)); border-color: rgba(168, 85, 247, 0.3);">
              📋 View TODO List
            </button>
            <button class="refresh-btn" id="refresh-btn" onclick="refresh()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              Refresh
            </button>
          </div>
        </header>

    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header">
        <span class="panel-title">⚡ Quick Health</span>
        <span class="panel-badge" id="health-badge">0%</span>
      </div>
      <div class="panel-content" style="padding: 20px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div style="padding: 12px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Pages with Metadata</div>
            <div style="font-size: 20px; font-weight: 600; color: var(--text-primary);" id="health-metadata">—</div>
          </div>
          <div style="padding: 12px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Images with Alt Text</div>
            <div style="font-size: 20px; font-weight: 600; color: var(--text-primary);" id="health-images">—</div>
          </div>
          <div style="padding: 12px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">TypeScript "any" Types</div>
            <div style="font-size: 20px; font-weight: 600; color: var(--text-primary);" id="health-any">—</div>
          </div>
          <div style="padding: 12px; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Client Components</div>
            <div style="font-size: 20px; font-weight: 600; color: var(--text-primary);" id="health-client">—</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Screenshot Gallery Panel -->
    <div class="panel" id="screenshots-panel" style="display: none; margin-bottom: 24px;">
      <div class="panel-header">
        <span class="panel-title">📸 Route Screenshots</span>
        <div style="display: flex; gap: 8px;">
          <button class="refresh-btn" onclick="captureScreenshots()" id="capture-btn">
            Capture All Routes
          </button>
          <button class="refresh-btn" onclick="loadLatestScreenshots()">
            Load Latest
          </button>
        </div>
      </div>
      <div class="panel-content">
        <div id="screenshot-gallery" class="screenshot-gallery">
          <div style="padding: 60px 20px; text-align: center; color: var(--text-muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">📸</div>
            <p style="font-size: 14px; margin-bottom: 8px;">No screenshots captured yet</p>
            <p style="font-size: 12px;">Click "Capture All Routes" to get started</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline & History Panel -->
    <div class="panel" id="timeline-panel" style="display: none; margin-bottom: 24px;">
      <div class="panel-header">
        <span class="panel-title">⏱️ Screenshot History & Timeline</span>
        <div style="display: flex; gap: 8px;">
          <button class="refresh-btn" onclick="loadScreenshotHistory()">
            🔄 Refresh History
          </button>
        </div>
      </div>
      <div class="panel-content" style="padding: 0;">
        <!-- Progress Chart -->
        <div class="progress-chart" id="progress-chart-container" style="display: none;">
          <div class="progress-chart-header">
            <div class="progress-chart-title">📈 Average Completion Score Over Time</div>
          </div>
          <div class="progress-chart-canvas" id="progress-chart"></div>
        </div>

        <!-- Timeline List -->
        <div class="timeline-container">
          <div class="timeline-header">
            <div style="font-size: 12px; color: var(--text-muted);">
              Select two captures to compare
            </div>
          </div>
          <div id="timeline-list" class="timeline-list">
            <div style="padding: 60px 20px; text-align: center; color: var(--text-muted);">
              <div style="font-size: 48px; margin-bottom: 16px;">⏱️</div>
              <p style="font-size: 14px; margin-bottom: 8px;">No screenshot history yet</p>
              <p style="font-size: 12px;">Capture screenshots multiple times to see timeline</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Component Inventory Panel -->
    <div class="panel" id="components-panel" style="display: none; margin-bottom: 24px;">
      <div class="panel-header">
        <span class="panel-title">🧩 Component Inventory</span>
        <div style="display: flex; gap: 8px;">
          <button class="refresh-btn" onclick="scanComponents()" id="scan-components-btn">
            🔍 Scan Components
          </button>
        </div>
      </div>
      <div class="panel-content">
        <div id="component-summary" style="padding: 16px; background: var(--glass); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; display: none;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; font-size: 13px;">
            <div>
              <span style="color: var(--text-muted);">Total:</span>
              <strong id="total-components" style="margin-left: 6px;">0</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Used:</span>
              <strong id="used-components" style="margin-left: 6px; color: #6366f1;">0</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Unused:</span>
              <strong id="unused-components" style="margin-left: 6px; color: #ef4444;">0</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Unused Size:</span>
              <strong id="unused-size" style="margin-left: 6px;">0 KB</strong>
            </div>
          </div>
        </div>

        <div class="component-filter" id="component-filter" style="display: none;">
          <button class="filter-btn active" data-filter="all" onclick="filterComponents('all')">All</button>
          <button class="filter-btn" data-filter="used" onclick="filterComponents('used')">Used</button>
          <button class="filter-btn" data-filter="unused" onclick="filterComponents('unused')">Unused</button>
        </div>

        <div id="component-list" class="component-list">
          <div style="padding: 60px 20px; text-align: center; color: var(--text-muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">🧩</div>
            <p style="font-size: 14px; margin-bottom: 8px;">No components scanned yet</p>
            <p style="font-size: 12px;">Click "Scan Components" to analyze your codebase</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Design System Audit Panel -->
    <div class="panel" id="design-system-panel" style="display: none; margin-bottom: 24px;">
      <div class="panel-header">
        <span class="panel-title">🎨 Design System Audit</span>
        <div style="display: flex; gap: 8px;">
          <button class="refresh-btn" onclick="scanDesignSystem()" id="scan-design-btn">
            🔍 Scan Design Tokens
          </button>
        </div>
      </div>
      <div class="panel-content">
        <!-- Summary Stats -->
        <div class="design-stats" id="design-stats" style="display: none;">
          <div class="design-stat">
            <div class="design-stat-value" id="stat-colors">0</div>
            <div class="design-stat-label">Colors</div>
          </div>
          <div class="design-stat">
            <div class="design-stat-value" id="stat-spacings">0</div>
            <div class="design-stat-label">Spacings</div>
          </div>
          <div class="design-stat">
            <div class="design-stat-value" id="stat-typography">0</div>
            <div class="design-stat-label">Typography</div>
          </div>
          <div class="design-stat">
            <div class="design-stat-value" id="stat-radius">0</div>
            <div class="design-stat-label">Border Radii</div>
          </div>
          <div class="design-stat">
            <div class="design-stat-value" id="stat-inconsistencies">0</div>
            <div class="design-stat-label">Issues</div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="component-filter" id="design-tabs" style="display: none; margin-bottom: 16px;">
          <button class="filter-btn active" data-tab="colors" onclick="switchDesignTab('colors')">Colors</button>
          <button class="filter-btn" data-tab="spacing" onclick="switchDesignTab('spacing')">Spacing</button>
          <button class="filter-btn" data-tab="typography" onclick="switchDesignTab('typography')">Typography</button>
          <button class="filter-btn" data-tab="inconsistencies" onclick="switchDesignTab('inconsistencies')">Issues</button>
        </div>

        <!-- Content -->
        <div id="design-content">
          <div style="padding: 60px 20px; text-align: center; color: var(--text-muted);">
            <div style="font-size: 48px; margin-bottom: 16px;">🎨</div>
            <p style="font-size: 14px; margin-bottom: 8px;">No design tokens analyzed yet</p>
            <p style="font-size: 12px;">Click "Scan Design Tokens" to analyze your design system</p>
          </div>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card routes">
        <div class="stat-label">Routes</div>
        <div class="stat-value" id="stat-routes">—</div>
      </div>
      <div class="stat-card elements">
        <div class="stat-label">Elements</div>
        <div class="stat-value" id="stat-elements">—</div>
      </div>
      <div class="stat-card todos">
        <div class="stat-label">Avg Completion</div>
        <div class="stat-value" id="stat-completion">—</div>
      </div>
      <div class="stat-card warnings">
        <div class="stat-label">Warnings</div>
        <div class="stat-value" id="stat-warnings">—</div>
      </div>
      <div class="stat-card errors">
        <div class="stat-label">Errors</div>
        <div class="stat-value" id="stat-errors">—</div>
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
        <div class="filter-bar" id="filter-bar"></div>
        <div class="issues-list" id="issues-list">
          <div class="no-issues">
            <div class="no-issues-icon">✓</div>
            <p>No issues found</p>
          </div>
        </div>
      </div>
    </div>

    <div class="panel routes-panel">
      <div class="panel-header">
        <span class="panel-title">Route Inventory</span>
        <span class="panel-badge" id="route-count">0 routes</span>
      </div>
      <div class="panel-content" style="padding: 0;">
        <table class="routes-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Health</th>
              <th>Elements</th>
              <th>Features</th>
              <th>Issues</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody id="routes-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="timestamp" id="timestamp">Waiting for analysis...</div>
        </div> <!-- /container -->
      </div> <!-- /content-center -->

      <!-- Route Detail Panel -->
      <div class="route-detail-panel hidden" id="route-detail-panel">
        <div class="route-detail-header">
          <span class="route-detail-title">Route Details</span>
          <button class="route-detail-close" onclick="closeDetailPanel()">×</button>
        </div>
        <div class="route-detail-content" id="route-detail-content">
          <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 12px;">
            Select a route to view details
          </div>
        </div>
      </div>
    </div> <!-- /main-content-wrapper -->
  </div> <!-- /app-layout -->

  <script>
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#1f1f23',
        primaryTextColor: '#fafafa',
        primaryBorderColor: '#3f3f46',
        lineColor: '#71717a',
        secondaryColor: '#18181b',
        tertiaryColor: '#111113'
      }
    });

    var ws = null;
    var reconnectAttempts = 0;
    var currentFilter = 'all';
    var lastData = null;
    var issueDataStore = {};
    var currentRouteData = null;

    var ISSUE_CATEGORIES = {
      'broken-interaction': { icon: '🔴', label: 'Broken Interactions', priority: 1 },
      'redirect-cycle': { icon: '🔄', label: 'Redirect Cycles', priority: 2 },
      'env-staging-url': { icon: '🚨', label: 'Env Leaks (Critical)', priority: 3 },
      'accessibility': { icon: '♿', label: 'Accessibility', priority: 4 },
      'auth-missing': { icon: '🔐', label: 'Missing Auth', priority: 5 },
      'not-implemented': { icon: '🚫', label: 'Not Implemented', priority: 6 },
      'broken-link': { icon: '🔗', label: 'Broken Links', priority: 7 },
      'nav-delete-no-confirm': { icon: '⚠️', label: 'No Delete Confirm', priority: 8 },
      'performance': { icon: '⚡', label: 'Performance', priority: 9 },
      'empty-handler': { icon: '⚙️', label: 'Empty Handlers', priority: 10 },
      'seo-metadata': { icon: '🔍', label: 'SEO/Metadata', priority: 11 },
      'empty-state': { icon: '📭', label: 'Empty States', priority: 12 },
      'mutation-no-feedback': { icon: '🔄', label: 'Mutation UX', priority: 13 },
      'empty-catch': { icon: '🕳️', label: 'Empty Catches', priority: 14 },
      'form-ux': { icon: '📋', label: 'Form UX', priority: 15 },
      'content-lorem': { icon: '📝', label: 'Placeholder Content', priority: 16 },
      'content-tbd': { icon: '❓', label: 'Incomplete Content', priority: 17 },
      'placeholder-content': { icon: '📝', label: 'Placeholders', priority: 18 },
      'typescript-quality': { icon: '📘', label: 'TypeScript Quality', priority: 19 },
      'env-localhost-url': { icon: '🌐', label: 'Env Config', priority: 20 },
      'responsive-large-fixed-width': { icon: '📱', label: 'Responsive Issues', priority: 21 },
      'nav-detail-no-back': { icon: '◀️', label: 'Navigation', priority: 22 },
      'nav-modal-no-close': { icon: '✖️', label: 'Modal UX', priority: 23 },
      'dead-code-if-false': { icon: '☠️', label: 'Dead Code', priority: 24 },
      'todo-comment': { icon: '📌', label: 'TODOs', priority: 25 },
      'missing-loading-state': { icon: '⏳', label: 'Missing Loading', priority: 26 },
      'missing-error-boundary': { icon: '🛡️', label: 'Missing Error Boundary', priority: 27 },
      'console-statement': { icon: '🖥️', label: 'Console Logs', priority: 28 },
      'test-data': { icon: '🧪', label: 'Test Data', priority: 29 },
      'commented-code': { icon: '💬', label: 'Commented Code', priority: 30 },
      'dead-end': { icon: '🚷', label: 'Dead Ends', priority: 31 },
      'orphan-route': { icon: '👻', label: 'Orphan Routes', priority: 32 },
      'minimal-content': { icon: '📄', label: 'Minimal Content', priority: 33 }
    };

    function calculateHealthScore(route, routeIssues, inbound, outbound) {
      var score = 100;
      var deductions = [];
      
      var errors = routeIssues.filter(function(i) { return i.severity === 'error'; }).length;
      var warnings = routeIssues.filter(function(i) { return i.severity === 'warning'; }).length;
      var infos = routeIssues.filter(function(i) { return i.severity === 'info'; }).length;
      
      if (errors > 0) { var d = errors * 15; score -= d; deductions.push({ reason: errors + ' error(s)', points: -d }); }
      if (warnings > 0) { var d = warnings * 5; score -= d; deductions.push({ reason: warnings + ' warning(s)', points: -d }); }
      if (infos > 0) { var d = infos * 2; score -= d; deductions.push({ reason: infos + ' info(s)', points: -d }); }
      
      if (inbound.length === 0 && route.file_path !== '/') { score -= 10; deductions.push({ reason: 'Orphan route', points: -10 }); }
      if (outbound.length === 0) { score -= 5; deductions.push({ reason: 'Dead end', points: -5 }); }
      if (!route.has_loading) { score -= 3; deductions.push({ reason: 'No loading.tsx', points: -3 }); }
      if (!route.has_error) { score -= 3; deductions.push({ reason: 'No error.tsx', points: -3 }); }
      if (route.elements.length >= 3) { score += 5; deductions.push({ reason: 'Good interactivity', points: +5 }); }
      if (route.has_loading && route.has_error) { score += 5; deductions.push({ reason: 'Complete error handling', points: +5 }); }
      
      return { score: Math.max(0, Math.min(100, score)), deductions: deductions };
    }

    function getHealthGrade(score) {
      if (score >= 90) return { grade: 'A', color: '#22c55e', label: 'Excellent' };
      if (score >= 80) return { grade: 'B', color: '#84cc16', label: 'Good' };
      if (score >= 70) return { grade: 'C', color: '#f59e0b', label: 'Fair' };
      if (score >= 60) return { grade: 'D', color: '#f97316', label: 'Needs Work' };
      return { grade: 'F', color: '#ef4444', label: 'Critical' };
    }

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

    function updateQuickHealth(data) {
      try {
        // Count pages (page.tsx files)
        var pageFiles = Object.values(data.routes).filter(function(r) { return r.file_path.endsWith('page.tsx'); });
        var totalPages = pageFiles.length;

        // Calculate metadata percentage
        var missingMetadata = data.issues.filter(function(i) { return i.type === 'seo-metadata-missing'; }).length;
        var pagesWithMetadata = Math.max(0, totalPages - missingMetadata);
        var metadataPercent = totalPages > 0 ? Math.round((pagesWithMetadata / totalPages) * 100) : 100;

        // Calculate images with alt text percentage
        var imagesNoAlt = data.issues.filter(function(i) { return i.type === 'a11y-img-no-alt'; }).length;
        var totalImages = imagesNoAlt + 50; // Estimate total images (we only know missing ones)
        var imagesWithAlt = totalImages > 0 ? Math.max(0, totalImages - imagesNoAlt) : 0;
        var imagePercent = totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100;

        // Count "any" types
        var anyTypes = data.issues.filter(function(i) { return i.type.startsWith('typescript-quality'); }).length;

        // Count client components
        var clientComponents = Object.values(data.routes).filter(function(r) {
          return r.file_path.match(/\.(tsx|jsx)$/) && !r.file_path.includes('/api/');
        }).length;

        // Calculate overall health score
        var healthScore = Math.round((metadataPercent + imagePercent) / 2);

        // Update UI
        document.getElementById('health-badge').textContent = healthScore + '%';
        document.getElementById('health-metadata').textContent = metadataPercent + '%';
        document.getElementById('health-images').textContent = imagePercent + '%';
        document.getElementById('health-any').textContent = anyTypes;
        document.getElementById('health-client').textContent = clientComponents;

        // Color code the badge
        var badge = document.getElementById('health-badge');
        if (healthScore >= 90) badge.style.color = '#22c55e';
        else if (healthScore >= 70) badge.style.color = '#f59e0b';
        else badge.style.color = '#ef4444';
      } catch (e) {
        console.error('Failed to update quick health:', e);
      }
    }

    // Route Explorer Tree Functions
    var activeRoute = null;

    function buildRouteTree(routeIntelligence) {
      var tree = {};

      Object.keys(routeIntelligence || {}).forEach(function(path) {
        var parts = path.split('/').filter(function(p) { return p; });
        var current = tree;

        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          if (!current[part]) {
            current[part] = {
              name: part,
              path: '/' + parts.slice(0, i + 1).join('/'),
              children: {},
              ri: i === parts.length - 1 ? routeIntelligence[path] : null
            };
          }
          current = current[part].children;
        }
      });

      return tree;
    }

    function renderRouteTree(tree, container, searchQuery) {
      var html = '';

      function renderNode(node, depth) {
        var isLeaf = node.ri !== null;
        var hasChildren = Object.keys(node.children).length > 0;
        var matchesSearch = !searchQuery || node.path.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch && !hasChildren) return '';

        var nodeHtml = '';
        var nodeId = 'route-node-' + node.path.replace(/\\//g, '-');

        nodeHtml += '<div class="route-tree-node" id="' + nodeId + '">';
        nodeHtml += '<div class="route-tree-item' + (activeRoute === node.path ? ' active' : '') + '" onclick="selectRoute(\\\'' + escapeJs(node.path) + '\\\')">';

        if (hasChildren) {
          nodeHtml += '<div class="route-tree-chevron">▼</div>';
        } else {
          nodeHtml += '<div class="route-tree-chevron" style="opacity: 0;">▼</div>';
        }

        if (isLeaf) {
          var purposeIcon = getPurposeIcon(node.ri.inferred_purpose);
          nodeHtml += '<div class="route-tree-icon">' + purposeIcon + '</div>';
        } else {
          nodeHtml += '<div class="route-tree-icon">📁</div>';
        }

        nodeHtml += '<div class="route-tree-label">' + escapeHtml(node.name) + '</div>';

        if (isLeaf) {
          var score = node.ri.completion_score;
          var scoreClass = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
          nodeHtml += '<div class="route-tree-score ' + scoreClass + '">' + score + '</div>';
        }

        nodeHtml += '</div>';

        if (hasChildren) {
          var childrenHtml = '';
          Object.keys(node.children).sort().forEach(function(key) {
            childrenHtml += renderNode(node.children[key], depth + 1);
          });
          nodeHtml += '<div class="route-tree-children" style="max-height: 1000px;">' + childrenHtml + '</div>';
        }

        nodeHtml += '</div>';
        return nodeHtml;
      }

      Object.keys(tree).sort().forEach(function(key) {
        html += renderNode(tree[key], 0);
      });

      container.innerHTML = html || '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">No routes found</div>';
    }

    function getPurposeIcon(purpose) {
      var icons = {
        'List View': '📋',
        'Detail View': '📄',
        'Create Form': '➕',
        'Edit Form': '✏️',
        'Dashboard': '📊',
        'Settings Page': '⚙️',
        'Landing Page': '🏠',
        'Auth Page': '🔐'
      };
      return icons[purpose] || '📄';
    }

    function selectRoute(path) {
      activeRoute = path;
      showDetailPanel(path);

      document.querySelectorAll('.route-tree-item').forEach(function(el) {
        el.classList.remove('active');
      });
      var selectedItem = document.querySelector('[onclick*="' + path.replace(/\\//g, '\\/') + '"]');
      if (selectedItem) {
        selectedItem.classList.add('active');
      }
    }

    function toggleRouteNode(nodeId) {
      var node = document.getElementById(nodeId);
      if (node) {
        node.classList.toggle('collapsed');
      }
    }

    function showDetailPanel(routePath) {
      var panel = document.getElementById('route-detail-panel');
      var content = document.getElementById('route-detail-content');

      if (!lastData || !lastData.route_intelligence || !lastData.route_intelligence[routePath]) {
        return;
      }

      var ri = lastData.route_intelligence[routePath];
      panel.classList.remove('hidden');

      var html = '';

      html += '<div style="padding: 16px; background: var(--bg-primary); border-radius: 12px; margin-bottom: 20px; text-align: center;">';
      html += '<div class="detail-score-ring">';
      html += '<svg width="100" height="100" viewBox="0 0 100 100">';
      var circumference = 2 * Math.PI * 40;
      var offset = circumference - (ri.completion_score / 100) * circumference;
      var color = ri.completion_score >= 80 ? '#22c55e' : ri.completion_score >= 60 ? '#f59e0b' : '#ef4444';
      html += '<circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" stroke-width="8"/>';
      html += '<circle cx="50" cy="50" r="40" fill="none" stroke="' + color + '" stroke-width="8" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 50 50)" style="transition: stroke-dashoffset 0.5s;"/>';
      html += '</svg>';
      html += '<div class="detail-score-value" style="color: ' + color + ';">' + ri.completion_score + '</div>';
      html += '</div>';
      html += '<div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">' + escapeHtml(routePath) + '</div>';
      html += '<div style="font-size: 11px; color: var(--text-secondary);">' + getPurposeIcon(ri.inferred_purpose) + ' ' + ri.inferred_purpose + '</div>';
      html += '</div>';

      html += '<div class="detail-section">';
      html += '<div class="detail-section-title">Completion Breakdown</div>';
      if (ri.completion_breakdown) {
        Object.keys(ri.completion_breakdown).forEach(function(key) {
          var value = ri.completion_breakdown[key];
          var max = key === 'ui_completeness' ? 25 : key === 'functionality' ? 30 : key === 'error_handling' ? 20 : key === 'accessibility' ? 15 : 10;
          var percent = Math.round((value / max) * 100);
          var label = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
          html += '<div class="detail-stat">';
          html += '<span class="detail-stat-label">' + label + '</span>';
          html += '<span class="detail-stat-value">' + value + '/' + max + ' (' + percent + '%)</span>';
          html += '</div>';
        });
      }
      html += '</div>';

      html += '<div class="detail-section">';
      html += '<div class="detail-section-title">Features</div>';
      html += '<div class="detail-badge-grid">';
      ri.features_detected.forEach(function(feature) {
        html += '<div class="detail-badge detected">✓ ' + feature.replace(/-/g, ' ') + '</div>';
      });
      ri.features_missing.forEach(function(feature) {
        html += '<div class="detail-badge missing">✗ ' + feature.replace(/-/g, ' ') + '</div>';
      });
      html += '</div>';
      html += '</div>';

      if (ri.interactions.length > 0) {
        html += '<div class="detail-section">';
        html += '<div class="detail-section-title">Interactions (' + ri.interactions.length + ')</div>';
        ri.interactions.forEach(function(ia) {
          var icon = ia.status === 'working' ? '✓' : ia.status === 'empty' ? '∅' : ia.status === 'todo' ? '⚠' : '✗';
          html += '<div class="detail-interaction-item">';
          html += '<div class="detail-interaction-icon ' + ia.status + '">' + icon + '</div>';
          html += '<div class="detail-interaction-label">' + escapeHtml(ia.label) + '</div>';
          html += '<div class="detail-interaction-status">' + ia.type + '</div>';
          html += '</div>';
        });
        html += '</div>';
      }

      if (ri.placeholder_warnings.length > 0) {
        html += '<div class="detail-section">';
        html += '<div class="detail-section-title">⚠️ Warnings</div>';
        ri.placeholder_warnings.forEach(function(warning) {
          html += '<div style="padding: 8px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 6px; margin-bottom: 6px; font-size: 11px; color: var(--text-secondary);">' + escapeHtml(warning) + '</div>';
        });
        html += '</div>';
      }

      html += '<div class="detail-section">';
      html += '<div class="detail-section-title">Metadata</div>';
      html += '<div class="detail-stat"><span class="detail-stat-label">Loading State</span><span class="detail-stat-value">' + (ri.has_loading ? '✓ Yes' : '✗ No') + '</span></div>';
      html += '<div class="detail-stat"><span class="detail-stat-label">Error Handling</span><span class="detail-stat-value">' + (ri.has_error ? '✓ Yes' : '✗ No') + '</span></div>';
      html += '<div class="detail-stat"><span class="detail-stat-label">Metadata</span><span class="detail-stat-value">' + (ri.has_metadata ? '✓ Yes' : '✗ No') + '</span></div>';
      html += '<div class="detail-stat"><span class="detail-stat-label">Protected</span><span class="detail-stat-value">' + (ri.is_protected ? '✓ Yes' : '✗ No') + '</span></div>';
      html += '</div>';

      content.innerHTML = html;
    }

    function closeDetailPanel() {
      var panel = document.getElementById('route-detail-panel');
      panel.classList.add('hidden');
      activeRoute = null;
      document.querySelectorAll('.route-tree-item').forEach(function(el) {
        el.classList.remove('active');
      });
    }

    // Screenshot Management
    var currentScreenshots = {};
    var currentScreenshotView = 'desktop';
    var screenshotsVisible = false;

    function toggleScreenshotsView() {
      screenshotsVisible = !screenshotsVisible;
      var panel = document.getElementById('screenshots-panel');
      if (screenshotsVisible) {
        panel.style.display = 'block';
        loadLatestScreenshots();
      } else {
        panel.style.display = 'none';
      }
    }

    async function loadLatestScreenshots() {
      try {
        var response = await fetch('/screenshots/latest');
        var data = await response.json();
        currentScreenshots = data.screenshots || {};
        renderScreenshotGallery();
      } catch (error) {
        console.error('Failed to load screenshots:', error);
      }
    }

    async function captureScreenshots() {
      if (!lastData || !lastData.routes) return;

      var btn = document.getElementById('capture-btn');
      btn.disabled = true;
      btn.textContent = 'Capturing...';

      try {
        var routes = Object.keys(lastData.routes);
        var response = await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routes: routes })
        });

        var result = await response.json();
        currentScreenshots = result.screenshots || {};
        renderScreenshotGallery();

        btn.textContent = 'Captured ' + result.summary.success + ' routes!';
        setTimeout(function() {
          btn.disabled = false;
          btn.textContent = 'Capture All Routes';
        }, 2000);

      } catch (error) {
        console.error('Screenshot capture failed:', error);
        btn.disabled = false;
        btn.textContent = 'Capture Failed';
      }
    }

    function renderScreenshotGallery() {
      var container = document.getElementById('screenshot-gallery');
      if (!currentScreenshots || Object.keys(currentScreenshots).length === 0) {
        container.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: var(--text-muted);"><div style="font-size: 48px; margin-bottom: 16px;">📸</div><p style="font-size: 14px;">No screenshots available</p></div>';
        return;
      }

      var html = '';
      Object.keys(currentScreenshots).sort().forEach(function(routePath) {
        var screenshot = currentScreenshots[routePath];
        var ri = lastData.route_intelligence ? lastData.route_intelligence[routePath] : null;

        html += '<div class="screenshot-card" onclick="openScreenshotModal(\\\'' + escapeJs(routePath) + '\\\')">';

        if (screenshot.status === 'success') {
          html += '<div class="screenshot-preview">';
          html += '<img src="data:image/png;base64,' + screenshot.desktop + '" alt="' + escapeHtml(routePath) + '">';
          html += '<div class="screenshot-overlay">';
          html += '<div class="screenshot-badge desktop">Desktop</div>';
          html += '</div>';
          html += '</div>';
        } else {
          html += '<div class="screenshot-preview error">';
          html += '<div style="font-size: 24px;">⚠️</div>';
          html += '<div>' + escapeHtml(screenshot.error || 'Failed to capture') + '</div>';
          html += '</div>';
        }

        html += '<div class="screenshot-info">';
        html += '<div class="screenshot-path">' + escapeHtml(routePath) + '</div>';

        if (ri) {
          html += '<div class="screenshot-purpose">' + getPurposeIcon(ri.inferred_purpose) + ' ' + ri.inferred_purpose + '</div>';
          html += '<div class="screenshot-stats">';
          var scoreClass = ri.completion_score >= 80 ? 'high' : ri.completion_score >= 60 ? 'medium' : 'low';
          html += '<div class="screenshot-score ' + scoreClass + '">' + ri.completion_score + '/100</div>';
          html += '<div class="screenshot-issues">' + ri.issues_count + ' issues</div>';
          html += '</div>';
        } else {
          html += '<div class="screenshot-purpose">Route</div>';
        }

        html += '</div>';
        html += '</div>';
      });

      container.innerHTML = html;
    }

    function openScreenshotModal(routePath) {
      var modal = document.getElementById('screenshot-modal');
      var screenshot = currentScreenshots[routePath];

      if (!screenshot || screenshot.status !== 'success') return;

      document.getElementById('screenshot-modal-title').textContent = routePath;
      document.getElementById('screenshot-modal-info').textContent = 'Captured: ' + new Date(screenshot.capturedAt).toLocaleString();
      document.getElementById('screenshot-modal-status').textContent = 'Status: ' + screenshot.statusCode;

      switchScreenshotView('desktop');
      modal.classList.add('open');
    }

    function closeScreenshotModal() {
      var modal = document.getElementById('screenshot-modal');
      modal.classList.remove('open');

      // Reset modal state
      document.getElementById('comparison-mode-banner').style.display = 'none';
      document.getElementById('screenshot-modal-image').style.display = 'block';
      document.getElementById('screenshot-diff-container').style.display = 'none';
    }

    function switchScreenshotView(view) {
      currentScreenshotView = view;
      var modal = document.getElementById('screenshot-modal');
      var title = document.getElementById('screenshot-modal-title').textContent;
      var screenshot = currentScreenshots[title];

      if (!screenshot) return;

      var img = document.getElementById('screenshot-modal-image');
      img.src = 'data:image/png;base64,' + screenshot[view];

      document.querySelectorAll('.screenshot-view-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
          btn.classList.add('active');
        }
      });
    }

    // Close screenshot modal with Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeScreenshotModal();
      }
    });

    // Timeline & Visual Diff Management
    var screenshotHistory = [];
    var timelineVisible = false;
    var comparisonMode = false;
    var selectedTimestamps = [];
    var diffSliderPosition = 50;

    function toggleTimelineView() {
      timelineVisible = !timelineVisible;
      var panel = document.getElementById('timeline-panel');
      if (timelineVisible) {
        panel.style.display = 'block';
        loadScreenshotHistory();
      } else {
        panel.style.display = 'none';
      }
    }

    async function loadScreenshotHistory() {
      try {
        var response = await fetch('/screenshots/history');
        var data = await response.json();
        screenshotHistory = data.history || [];
        renderTimeline();
        renderProgressChart();
      } catch (error) {
        console.error('Failed to load screenshot history:', error);
      }
    }

    function renderTimeline() {
      var container = document.getElementById('timeline-list');

      if (!screenshotHistory || screenshotHistory.length === 0) {
        container.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: var(--text-muted);"><div style="font-size: 48px; margin-bottom: 16px;">⏱️</div><p style="font-size: 14px;">No screenshot history yet</p></div>';
        document.getElementById('progress-chart-container').style.display = 'none';
        return;
      }

      var html = '';
      screenshotHistory.forEach(function(item, index) {
        var isSelected = selectedTimestamps.includes(item.timestamp);
        var hasMilestone = milestones[item.timestamp];
        var hasAnnotation = annotations[item.timestamp];
        var date = new Date(item.timestamp);
        var formattedDate = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        var itemClasses = 'timeline-item';
        if (isSelected) itemClasses += ' selected';
        if (hasMilestone) itemClasses += ' has-milestone';
        if (hasAnnotation) itemClasses += ' has-annotation';

        html += '<div class="' + itemClasses + '" style="position: relative;" onclick="selectTimelineItem(\\\'' + item.timestamp + '\\\')">';
        html += '<div class="timeline-icon">📸</div>';
        html += '<div class="timeline-info">';
        html += '<div class="timeline-date">' + formattedDate;

        // Show milestone badge
        if (hasMilestone) {
          html += '<span class="milestone-badge">';
          html += '<span class="milestone-icon">' + hasMilestone.icon + '</span>';
          html += hasMilestone.title;
          html += '</span>';
        }

        html += '</div>';

        html += '<div class="timeline-stats">';
        html += '<span>' + item.summary.success + ' routes captured</span>';
        if (item.avgScore !== undefined) {
          html += '<span>Avg Score: ' + item.avgScore + '/100</span>';
        }
        html += '</div>';

        // Show annotation preview
        if (hasAnnotation && hasAnnotation.notes) {
          html += '<div style="margin-top: 8px; font-size: 11px; color: var(--text-muted); font-style: italic;">';
          html += escapeHtml(hasAnnotation.notes.substring(0, 100));
          if (hasAnnotation.notes.length > 100) html += '...';
          html += '</div>';
        }

        // Show annotation tags
        if (hasAnnotation && hasAnnotation.tags && hasAnnotation.tags.length > 0) {
          html += '<div style="margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap;">';
          hasAnnotation.tags.forEach(function(tag) {
            html += '<span style="padding: 2px 8px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 4px; font-size: 10px; color: #3b82f6;">';
            html += escapeHtml(tag);
            html += '</span>';
          });
          html += '</div>';
        }

        html += '</div>';

        // Action buttons
        html += '<div class="timeline-actions" onclick="event.stopPropagation();">';

        if (hasMilestone) {
          html += '<button class="timeline-action-btn" onclick="removeMilestone(\\\'' + item.timestamp + '\\\')">';
          html += '🏁 Remove Milestone';
          html += '</button>';
        } else {
          html += '<button class="timeline-action-btn" onclick="openMilestoneModal(\\\'' + item.timestamp + '\\\')">';
          html += '🏁 Add Milestone';
          html += '</button>';
        }

        if (hasAnnotation) {
          html += '<button class="timeline-action-btn" onclick="openAnnotationModal(\\\'' + item.timestamp + '\\\')">';
          html += '📝 Edit Notes';
          html += '</button>';
          html += '<button class="timeline-action-btn" onclick="removeAnnotation(\\\'' + item.timestamp + '\\\')">';
          html += '× Remove';
          html += '</button>';
        } else {
          html += '<button class="timeline-action-btn" onclick="openAnnotationModal(\\\'' + item.timestamp + '\\\')">';
          html += '📝 Add Notes';
          html += '</button>';
        }

        html += '</div>';

        if (selectedTimestamps.length === 2 && isSelected) {
          html += '<button class="timeline-compare-btn" onclick="event.stopPropagation(); compareTimestamps()">Compare Selected</button>';
        }

        html += '</div>';
      });

      container.innerHTML = html;
    }

    function selectTimelineItem(timestamp) {
      if (selectedTimestamps.includes(timestamp)) {
        selectedTimestamps = selectedTimestamps.filter(function(t) { return t !== timestamp; });
      } else {
        selectedTimestamps.push(timestamp);
        if (selectedTimestamps.length > 2) {
          selectedTimestamps.shift();
        }
      }
      renderTimeline();
    }

    async function compareTimestamps() {
      if (selectedTimestamps.length !== 2) return;

      var before = selectedTimestamps[0];
      var after = selectedTimestamps[1];

      try {
        var beforeData = await fetch('/screenshots/' + before.replace(/:/g, '-').split('.')[0]).then(r => r.json());
        var afterData = await fetch('/screenshots/' + after.replace(/:/g, '-').split('.')[0]).then(r => r.json());

        startComparisonMode(beforeData, afterData, before, after);
      } catch (error) {
        console.error('Failed to load comparison data:', error);
      }
    }

    function startComparisonMode(beforeData, afterData, beforeTimestamp, afterTimestamp) {
      comparisonMode = true;

      var commonRoutes = Object.keys(beforeData.screenshots).filter(function(route) {
        return afterData.screenshots[route] &&
               beforeData.screenshots[route].status === 'success' &&
               afterData.screenshots[route].status === 'success';
      });

      if (commonRoutes.length === 0) {
        alert('No common routes found between the two captures');
        return;
      }

      var route = commonRoutes[0];
      openComparisonModal(route, beforeData.screenshots[route], afterData.screenshots[route], beforeTimestamp, afterTimestamp);
    }

    function openComparisonModal(routePath, beforeScreenshot, afterScreenshot, beforeTime, afterTime) {
      var modal = document.getElementById('screenshot-modal');
      var banner = document.getElementById('comparison-mode-banner');
      var info = document.getElementById('comparison-info');

      var beforeDate = new Date(beforeTime).toLocaleString();
      var afterDate = new Date(afterTime).toLocaleString();

      info.textContent = 'Comparing: ' + beforeDate + ' vs ' + afterDate;
      banner.style.display = 'flex';

      document.getElementById('screenshot-modal-title').textContent = routePath;
      document.getElementById('screenshot-modal-image').style.display = 'none';
      document.getElementById('screenshot-diff-container').style.display = 'block';

      switchComparisonView('desktop', beforeScreenshot, afterScreenshot);

      modal.classList.add('open');
      initDiffSlider();
    }

    function switchComparisonView(view, beforeScreenshot, afterScreenshot) {
      if (!beforeScreenshot || !afterScreenshot) return;

      document.getElementById('diff-image-before').src = 'data:image/png;base64,' + beforeScreenshot[view];
      document.getElementById('diff-image-after').src = 'data:image/png;base64,' + afterScreenshot[view];

      document.querySelectorAll('.screenshot-view-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
          btn.classList.add('active');
        }
      });
    }

    function initDiffSlider() {
      var slider = document.getElementById('diff-slider');
      var afterContainer = document.getElementById('diff-after-container');
      var isDragging = false;

      function updateSliderPosition(clientX) {
        var container = document.getElementById('screenshot-modal-content');
        var rect = container.getBoundingClientRect();
        var x = clientX - rect.left;
        var percentage = (x / rect.width) * 100;
        percentage = Math.max(0, Math.min(100, percentage));

        slider.style.left = percentage + '%';
        afterContainer.style.clipPath = 'inset(0 0 0 ' + percentage + '%)';
        diffSliderPosition = percentage;
      }

      slider.onmousedown = function(e) {
        isDragging = true;
        e.preventDefault();
      };

      document.onmousemove = function(e) {
        if (isDragging) {
          updateSliderPosition(e.clientX);
        }
      };

      document.onmouseup = function() {
        isDragging = false;
      };

      slider.ontouchstart = function(e) {
        isDragging = true;
        e.preventDefault();
      };

      document.ontouchmove = function(e) {
        if (isDragging && e.touches.length > 0) {
          updateSliderPosition(e.touches[0].clientX);
        }
      };

      document.ontouchend = function() {
        isDragging = false;
      };
    }

    function exitComparisonMode() {
      comparisonMode = false;
      selectedTimestamps = [];
      document.getElementById('comparison-mode-banner').style.display = 'none';
      closeScreenshotModal();
      renderTimeline();
    }

    function renderProgressChart() {
      if (!screenshotHistory || screenshotHistory.length < 2) {
        document.getElementById('progress-chart-container').style.display = 'none';
        return;
      }

      document.getElementById('progress-chart-container').style.display = 'block';

      var container = document.getElementById('progress-chart');
      var maxScore = 100;

      var html = '';
      screenshotHistory.forEach(function(item, index) {
        var score = item.avgScore || 0;
        var height = (score / maxScore) * 100;
        var date = new Date(item.timestamp);
        var label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        html += '<div class="progress-bar" style="height: ' + height + '%;">';
        html += '<div class="progress-bar-label">' + score + '%<br>' + label + '</div>';
        html += '</div>';
      });

      container.innerHTML = html;
    }

    // AI Fix Panel Management
    var currentAIFix = null;
    var currentIssue = null;

    function openAIFixPanel(issue) {
      currentIssue = issue;
      var panel = document.getElementById('ai-fix-panel');
      var loading = document.getElementById('ai-fix-loading');
      var result = document.getElementById('ai-fix-result');

      // Show panel and loading state
      panel.classList.add('open');
      loading.style.display = 'block';
      result.style.display = 'none';
      document.getElementById('copy-fix-btn').disabled = true;
      document.getElementById('apply-fix-btn').disabled = true;

      // Generate AI fix
      generateAIFix(issue);
    }

    function closeAIFixPanel() {
      var panel = document.getElementById('ai-fix-panel');
      panel.classList.remove('open');
      currentAIFix = null;
      currentIssue = null;
    }

    async function generateAIFix(issue) {
      try {
        // Simulate AI generation with mock fix
        // In production, this would call Claude API
        await new Promise(resolve => setTimeout(resolve, 2000));

        var fix = generateMockAIFix(issue);
        currentAIFix = fix;
        renderAIFix(fix);
      } catch (error) {
        console.error('AI fix generation failed:', error);
        showAIFixError(error.message);
      }
    }

    function generateMockAIFix(issue) {
      // Mock AI-generated fix based on issue type
      var explanation = '';
      var codeDiff = null;

      if (issue.message.includes('onClick') || issue.message.includes('empty handler')) {
        explanation = 'This button has an empty onClick handler, which provides no functionality to users. I recommend adding a proper handler or removing the button if it\\\'s not needed.';
        codeDiff = {
          file: issue.file_path,
          added: [
            'const handleClick = () => {',
            '  // TODO: Implement button functionality',
            '  console.log(\\\'Button clicked\\\');',
            '};',
            '',
            '<button onClick={handleClick}>Click Me</button>'
          ],
          removed: [
            '<button onClick={() => {}}>Click Me</button>'
          ]
        };
      } else if (issue.message.includes('alt text') || issue.message.includes('accessibility')) {
        explanation = 'This image is missing alt text, which is important for accessibility. Screen readers need alt text to describe images to visually impaired users.';
        codeDiff = {
          file: issue.file_path,
          added: [
            '<img src="/logo.png" alt="Company Logo" />'
          ],
          removed: [
            '<img src="/logo.png" />'
          ]
        };
      } else {
        explanation = 'I\\\'ve analyzed this issue and generated a recommended fix. The changes address the core problem while maintaining code quality and consistency.';
        codeDiff = {
          file: issue.file_path,
          added: ['// TODO: Fix this issue'],
          removed: []
        };
      }

      return {
        issue: issue,
        explanation: explanation,
        diff: codeDiff
      };
    }

    function renderAIFix(fix) {
      var loading = document.getElementById('ai-fix-loading');
      var result = document.getElementById('ai-fix-result');

      loading.style.display = 'none';
      result.style.display = 'block';

      var html = '';

      // Explanation section
      html += '<div class="ai-fix-section">';
      html += '<div class="ai-fix-section-title">Explanation</div>';
      html += '<div class="ai-fix-explanation">' + escapeHtml(fix.explanation) + '</div>';
      html += '</div>';

      // Code diff section
      if (fix.diff) {
        html += '<div class="ai-fix-section">';
        html += '<div class="ai-fix-section-title">Proposed Changes</div>';
        html += '<div class="code-diff">';
        html += '<div class="code-diff-header">';
        html += '<div class="code-diff-file">' + escapeHtml(fix.diff.file) + '</div>';
        html += '<div class="code-diff-stats">';
        html += '+' + fix.diff.added.length + ' -' + fix.diff.removed.length;
        html += '</div>';
        html += '</div>';
        html += '<div class="code-diff-lines">';

        // Show removed lines
        fix.diff.removed.forEach(function(line, index) {
          html += '<div class="code-diff-line removed">';
          html += '<div class="code-diff-line-number">-</div>';
          html += '<div class="code-diff-line-content">' + escapeHtml(line) + '</div>';
          html += '</div>';
        });

        // Show added lines
        fix.diff.added.forEach(function(line, index) {
          html += '<div class="code-diff-line added">';
          html += '<div class="code-diff-line-number">+</div>';
          html += '<div class="code-diff-line-content">' + escapeHtml(line) + '</div>';
          html += '</div>';
        });

        html += '</div>';
        html += '</div>';
        html += '</div>';
      }

      result.innerHTML = html;

      // Enable action buttons
      document.getElementById('copy-fix-btn').disabled = false;
      document.getElementById('apply-fix-btn').disabled = false;
    }

    function showAIFixError(message) {
      var loading = document.getElementById('ai-fix-loading');
      var result = document.getElementById('ai-fix-result');

      loading.style.display = 'none';
      result.style.display = 'block';

      result.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">' +
        '<div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>' +
        '<p style="font-size: 14px; margin-bottom: 8px;">Failed to generate fix</p>' +
        '<p style="font-size: 12px;">' + escapeHtml(message) + '</p>' +
        '</div>';
    }

    function copyAIFix() {
      if (!currentAIFix || !currentAIFix.diff) return;

      var code = currentAIFix.diff.added.join('\\n');
      navigator.clipboard.writeText(code).then(function() {
        var btn = document.getElementById('copy-fix-btn');
        var originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        setTimeout(function() {
          btn.innerHTML = originalText;
        }, 2000);
      });
    }

    function applyAIFix() {
      if (!currentAIFix) return;

      // In a real implementation, this would apply the fix to the file
      // For now, just show a success message
      alert('Fix applied! (Demo mode: In production, this would write to ' + currentAIFix.diff.file + ')');
      closeAIFixPanel();
    }

    // Milestone & Annotation Management
    var milestones = {};  // { timestamp: { title, icon, notes } }
    var annotations = {}; // { timestamp: { notes, tags } }
    var currentMilestoneTimestamp = null;
    var currentAnnotationTimestamp = null;
    var selectedMilestoneIcon = '🏁';

    function loadMilestones() {
      // Load from localStorage
      var stored = localStorage.getItem('ux-auditor-milestones');
      if (stored) {
        try {
          milestones = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to load milestones:', e);
        }
      }

      stored = localStorage.getItem('ux-auditor-annotations');
      if (stored) {
        try {
          annotations = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to load annotations:', e);
        }
      }
    }

    function saveMilestonesData() {
      localStorage.setItem('ux-auditor-milestones', JSON.stringify(milestones));
    }

    function saveAnnotationsData() {
      localStorage.setItem('ux-auditor-annotations', JSON.stringify(annotations));
    }

    function openMilestoneModal(timestamp) {
      currentMilestoneTimestamp = timestamp;
      var modal = document.getElementById('milestone-modal');

      // Pre-fill if editing existing milestone
      if (milestones[timestamp]) {
        document.getElementById('milestone-title').value = milestones[timestamp].title;
        document.getElementById('milestone-notes').value = milestones[timestamp].notes || '';
        selectMilestoneIcon(milestones[timestamp].icon);
        document.getElementById('milestone-modal-title-text').textContent = 'Edit Milestone';
      } else {
        document.getElementById('milestone-title').value = '';
        document.getElementById('milestone-notes').value = '';
        selectMilestoneIcon('🏁');
        document.getElementById('milestone-modal-title-text').textContent = 'Add Milestone';
      }

      modal.classList.add('open');
    }

    function closeMilestoneModal() {
      var modal = document.getElementById('milestone-modal');
      modal.classList.remove('open');
      currentMilestoneTimestamp = null;
    }

    function selectMilestoneIcon(icon) {
      selectedMilestoneIcon = icon;
      document.querySelectorAll('.milestone-icon-option').forEach(function(el) {
        el.classList.remove('selected');
        if (el.dataset.icon === icon) {
          el.classList.add('selected');
        }
      });
      document.getElementById('milestone-modal-icon').textContent = icon;
    }

    function saveMilestone() {
      var title = document.getElementById('milestone-title').value.trim();
      if (!title) {
        alert('Please enter a milestone title');
        return;
      }

      var notes = document.getElementById('milestone-notes').value.trim();

      milestones[currentMilestoneTimestamp] = {
        title: title,
        icon: selectedMilestoneIcon,
        notes: notes,
        timestamp: currentMilestoneTimestamp
      };

      saveMilestonesData();
      closeMilestoneModal();
      renderTimeline(); // Re-render timeline to show milestone
    }

    function removeMilestone(timestamp) {
      if (confirm('Remove this milestone?')) {
        delete milestones[timestamp];
        saveMilestonesData();
        renderTimeline();
      }
    }

    function openAnnotationModal(timestamp) {
      currentAnnotationTimestamp = timestamp;
      var modal = document.getElementById('annotation-modal');

      // Pre-fill if editing existing annotation
      if (annotations[timestamp]) {
        document.getElementById('annotation-notes').value = annotations[timestamp].notes || '';
        document.getElementById('annotation-tags').value = (annotations[timestamp].tags || []).join(', ');
      } else {
        document.getElementById('annotation-notes').value = '';
        document.getElementById('annotation-tags').value = '';
      }

      modal.classList.add('open');
    }

    function closeAnnotationModal() {
      var modal = document.getElementById('annotation-modal');
      modal.classList.remove('open');
      currentAnnotationTimestamp = null;
    }

    function saveAnnotation() {
      var notes = document.getElementById('annotation-notes').value.trim();
      var tagsInput = document.getElementById('annotation-tags').value.trim();
      var tags = tagsInput ? tagsInput.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];

      if (!notes && tags.length === 0) {
        alert('Please add notes or tags');
        return;
      }

      annotations[currentAnnotationTimestamp] = {
        notes: notes,
        tags: tags,
        timestamp: currentAnnotationTimestamp
      };

      saveAnnotationsData();
      closeAnnotationModal();
      renderTimeline(); // Re-render timeline to show annotation
    }

    function removeAnnotation(timestamp) {
      if (confirm('Remove this annotation?')) {
        delete annotations[timestamp];
        saveAnnotationsData();
        renderTimeline();
      }
    }

    // Export Management
    var exportFormat = null;
    var exportData = null;

    function openExportPanel() {
      if (!comparisonMode || selectedTimestamps.length !== 2) {
        alert('Please select two captures to compare before exporting');
        return;
      }

      var panel = document.getElementById('export-panel');
      panel.classList.add('open');

      // Prepare export data
      prepareExportData();
    }

    function closeExportPanel() {
      var panel = document.getElementById('export-panel');
      panel.classList.remove('open');
      exportFormat = null;
      document.getElementById('export-preview-section').style.display = 'none';
      document.getElementById('download-export-btn').disabled = true;
    }

    function prepareExportData() {
      var timestamps = selectedTimestamps.sort();
      var beforeTimestamp = timestamps[0];
      var afterTimestamp = timestamps[1];

      var before = screenshotHistory.find(function(h) { return h.timestamp === beforeTimestamp; });
      var after = screenshotHistory.find(function(h) { return h.timestamp === afterTimestamp; });

      exportData = {
        comparison: {
          before: {
            timestamp: beforeTimestamp,
            date: new Date(beforeTimestamp).toLocaleString(),
            avgScore: before ? before.avgScore : null,
            routeCount: before ? before.summary.success : 0
          },
          after: {
            timestamp: afterTimestamp,
            date: new Date(afterTimestamp).toLocaleString(),
            avgScore: after ? after.avgScore : null,
            routeCount: after ? after.summary.success : 0
          },
          improvement: (after && before && after.avgScore && before.avgScore)
            ? (after.avgScore - before.avgScore)
            : null
        },
        milestones: {
          before: milestones[beforeTimestamp],
          after: milestones[afterTimestamp]
        },
        annotations: {
          before: annotations[beforeTimestamp],
          after: annotations[afterTimestamp]
        },
        routes: lastData ? lastData.routes : {},
        intelligence: lastData ? lastData.route_intelligence : {}
      };
    }

    function selectExportFormat(format) {
      exportFormat = format;
      var preview = generateExportPreview(format);

      document.getElementById('export-preview').textContent = preview;
      document.getElementById('export-preview-section').style.display = 'block';
      document.getElementById('download-export-btn').disabled = false;
    }

    function generateExportPreview(format) {
      if (!exportData) return '';

      if (format === 'markdown') {
        return generateMarkdownReport();
      } else if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
      } else if (format === 'html') {
        return '<html>\\n  <head>\\n    <title>UX Comparison Report</title>\\n  </head>\\n  <body>\\n    <!-- Full report HTML -->\\n  </body>\\n</html>';
      } else if (format === 'pdf') {
        return 'PDF generation requires server-side processing.\\nClick Download to generate.';
      }

      return '';
    }

    function generateMarkdownReport() {
      var md = '# UX Flow Comparison Report\n\n';
      md += '**Generated:** ' + new Date().toLocaleString() + '\n\n';

      md += '## Comparison Overview\n\n';
      md += '| Metric | Before | After | Change |\n';
      md += '|--------|--------|-------|--------|\n';
      md += '| Date | ' + exportData.comparison.before.date + ' | ' + exportData.comparison.after.date + ' | — |\n';
      md += '| Routes Captured | ' + exportData.comparison.before.routeCount + ' | ' + exportData.comparison.after.routeCount + ' | ' + (exportData.comparison.after.routeCount - exportData.comparison.before.routeCount) + ' |\n';

      if (exportData.comparison.before.avgScore && exportData.comparison.after.avgScore) {
        md += '| Avg Completion | ' + exportData.comparison.before.avgScore + ' | ' + exportData.comparison.after.avgScore + ' | ';
        var delta = exportData.comparison.improvement;
        md += (delta >= 0 ? '+' : '') + delta + ' |\n';
      }

      md += '\n';

      if (exportData.milestones.before || exportData.milestones.after) {
        md += '## Milestones\n\n';
        if (exportData.milestones.before) {
          md += '**Before:** ' + exportData.milestones.before.icon + ' ' + exportData.milestones.before.title + '\n\n';
        }
        if (exportData.milestones.after) {
          md += '**After:** ' + exportData.milestones.after.icon + ' ' + exportData.milestones.after.title + '\n\n';
        }
      }

      if (exportData.annotations.before || exportData.annotations.after) {
        md += '## Notes\n\n';
        if (exportData.annotations.before && exportData.annotations.before.notes) {
          md += '**Before:**\n' + exportData.annotations.before.notes + '\n\n';
        }
        if (exportData.annotations.after && exportData.annotations.after.notes) {
          md += '**After:**\n' + exportData.annotations.after.notes + '\n\n';
        }
      }

      md += '---\n\n';
      md += '*Generated by UX Flow Auditor*';

      return md;
    }

    function downloadExport() {
      if (!exportFormat || !exportData) return;

      var content = '';
      var filename = 'ux-comparison-report';
      var mimeType = 'text/plain';

      if (exportFormat === 'markdown') {
        content = generateMarkdownReport();
        filename += '.md';
        mimeType = 'text/markdown';
      } else if (exportFormat === 'json') {
        content = JSON.stringify(exportData, null, 2);
        filename += '.json';
        mimeType = 'application/json';
      } else if (exportFormat === 'html') {
        content = generateHTMLReport();
        filename += '.html';
        mimeType = 'text/html';
      } else if (exportFormat === 'pdf') {
        alert('PDF export requires server-side processing. For now, export as HTML or Markdown.');
        return;
      }

      // Create download
      var blob = new Blob([content], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function generateHTMLReport() {
      var html = '<!DOCTYPE html>\n<html>\n<head>\n';
      html += '  <meta charset="UTF-8">\n';
      html += '  <title>UX Comparison Report</title>\n';
      html += '  <style>\n';
      html += '    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 40px auto; padding: 20px; }\n';
      html += '    h1 { color: #09090b; }\n';
      html += '    table { width: 100%; border-collapse: collapse; margin: 20px 0; }\n';
      html += '    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e4e4e7; }\n';
      html += '    th { background: #f4f4f5; font-weight: 600; }\n';
      html += '    .positive { color: #16a34a; }\n';
      html += '    .negative { color: #dc2626; }\n';
      html += '  </style>\n';
      html += '</head>\n<body>\n';
      html += '  <h1>UX Flow Comparison Report</h1>\n';
      html += '  <p><strong>Generated:</strong> ' + new Date().toLocaleString() + '</p>\n';
      html += '  <h2>Comparison Overview</h2>\n';
      html += '  <table>\n';
      html += '    <tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr>\n';
      html += '    <tr><td>Date</td><td>' + exportData.comparison.before.date + '</td><td>' + exportData.comparison.after.date + '</td><td>—</td></tr>\n';
      html += '    <tr><td>Routes</td><td>' + exportData.comparison.before.routeCount + '</td><td>' + exportData.comparison.after.routeCount + '</td><td>' + (exportData.comparison.after.routeCount - exportData.comparison.before.routeCount) + '</td></tr>\n';

      if (exportData.comparison.improvement !== null) {
        var delta = exportData.comparison.improvement;
        var className = delta >= 0 ? 'positive' : 'negative';
        html += '    <tr><td>Avg Score</td><td>' + exportData.comparison.before.avgScore + '</td><td>' + exportData.comparison.after.avgScore + '</td><td class="' + className + '">' + (delta >= 0 ? '+' : '') + delta + '</td></tr>\n';
      }

      html += '  </table>\n';
      html += '</body>\n</html>';

      return html;
    }

    // Component Inventory Management
    var componentInventory = null;
    var componentsVisible = false;
    var componentFilter = 'all';

    function toggleComponentsView() {
      componentsVisible = !componentsVisible;
      var panel = document.getElementById('components-panel');
      if (componentsVisible) {
        panel.style.display = 'block';
        if (!componentInventory) {
          // Auto-scan on first open
          scanComponents();
        }
      } else {
        panel.style.display = 'none';
      }
    }

    async function scanComponents() {
      var btn = document.getElementById('scan-components-btn');
      btn.disabled = true;
      btn.textContent = '🔍 Scanning...';

      try {
        var response = await fetch('/api/scan-components');
        var data = await response.json();

        componentInventory = data;
        renderComponentInventory();

        btn.textContent = '✅ Scanned ' + data.summary.total + ' components';
        setTimeout(function() {
          btn.disabled = false;
          btn.textContent = '🔍 Scan Components';
        }, 2000);

      } catch (error) {
        console.error('Component scan failed:', error);
        btn.disabled = false;
        btn.textContent = '❌ Scan Failed';
      }
    }

    function renderComponentInventory() {
      if (!componentInventory) return;

      // Update summary
      document.getElementById('component-summary').style.display = 'block';
      document.getElementById('total-components').textContent = componentInventory.summary.total;
      document.getElementById('used-components').textContent = componentInventory.summary.used;
      document.getElementById('unused-components').textContent = componentInventory.summary.unused;
      document.getElementById('unused-size').textContent = (componentInventory.summary.unusedSize / 1024).toFixed(1) + ' KB';

      // Show filter
      document.getElementById('component-filter').style.display = 'flex';

      // Render component list
      var components = getFilteredComponents();
      var container = document.getElementById('component-list');

      if (components.length === 0) {
        container.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: var(--text-muted);"><p>No components match this filter</p></div>';
        return;
      }

      var html = '';
      components.forEach(function(comp) {
        var isUnused = comp.usageCount === 0;
        var iconClass = isUnused ? 'unused' : '';
        var usageClass = isUnused ? 'unused' : '';

        html += '<div class="component-item" onclick="showComponentDetail(\\\'' + escapeJs(comp.name) + '\\\')">';
        html += '<div class="component-icon ' + iconClass + '">🧩</div>';
        html += '<div class="component-info">';
        html += '<div class="component-name">' + escapeHtml(comp.name) + '</div>';
        html += '<div class="component-path">' + escapeHtml(comp.path) + '</div>';
        html += '</div>';
        html += '<div class="component-stats">';

        if (isUnused) {
          html += '<div class="component-usage unused">⚠️ Unused</div>';
        } else {
          html += '<div class="component-usage">' + comp.usageCount + ' import' + (comp.usageCount === 1 ? '' : 's') + '</div>';
        }

        html += '<div class="component-size">' + (comp.size / 1024).toFixed(1) + ' KB</div>';
        html += '</div>';
        html += '</div>';
      });

      container.innerHTML = html;
    }

    function getFilteredComponents() {
      if (!componentInventory) return [];

      if (componentFilter === 'all') {
        return componentInventory.components.all;
      } else if (componentFilter === 'used') {
        return componentInventory.components.used;
      } else if (componentFilter === 'unused') {
        return componentInventory.components.unused;
      }

      return [];
    }

    function filterComponents(filter) {
      componentFilter = filter;

      // Update active button
      document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
          btn.classList.add('active');
        }
      });

      renderComponentInventory();
    }

    function showComponentDetail(componentName) {
      if (!componentInventory) return;

      var component = componentInventory.components.all.find(function(c) {
        return c.name === componentName;
      });

      if (!component) return;

      var modal = document.getElementById('component-detail-modal');
      document.getElementById('component-detail-name').textContent = component.name;

      var html = '';

      // Component info
      html += '<div style="margin-bottom: 24px;">';
      html += '<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Path</p>';
      html += '<p style="font-family: \'JetBrains Mono\', monospace; font-size: 12px;">' + escapeHtml(component.path) + '</p>';
      html += '</div>';

      html += '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">';
      html += '<div>';
      html += '<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Usage Count</p>';
      html += '<p style="font-size: 18px; font-weight: 600; color: ' + (component.usageCount === 0 ? '#ef4444' : '#6366f1') + ';">' + component.usageCount + '</p>';
      html += '</div>';
      html += '<div>';
      html += '<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">File Size</p>';
      html += '<p style="font-size: 18px; font-weight: 600;">' + (component.size / 1024).toFixed(1) + ' KB</p>';
      html += '</div>';
      html += '<div>';
      html += '<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Lines of Code</p>';
      html += '<p style="font-size: 18px; font-weight: 600;">' + component.lines + '</p>';
      html += '</div>';
      html += '</div>';

      // Used by list
      if (component.usedBy.length > 0) {
        html += '<div class="used-by-list">';
        html += '<p style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Used by (' + component.usedBy.length + ' files)</p>';
        component.usedBy.slice(0, 10).forEach(function(usage) {
          html += '<div class="used-by-item">';
          html += escapeHtml(usage.file);
          html += '</div>';
        });
        if (component.usedBy.length > 10) {
          html += '<p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">+ ' + (component.usedBy.length - 10) + ' more</p>';
        }
        html += '</div>';
      } else {
        html += '<div style="padding: 24px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; text-align: center;">';
        html += '<p style="font-size: 14px; font-weight: 600; color: #ef4444; margin-bottom: 4px;">⚠️ Unused Component</p>';
        html += '<p style="font-size: 12px; color: var(--text-muted);">This component is not imported anywhere in the codebase</p>';
        html += '<p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Safe to delete if no longer needed</p>';
        html += '</div>';
      }

      document.getElementById('component-detail-body').innerHTML = html;
      modal.classList.add('open');
    }

    function closeComponentDetail() {
      var modal = document.getElementById('component-detail-modal');
      modal.classList.remove('open');
    }

    // Design System Audit
    var designSystemReport = null;
    var designSystemVisible = false;
    var currentDesignTab = 'colors';

    function toggleDesignSystemView() {
      designSystemVisible = !designSystemVisible;
      var panel = document.getElementById('design-system-panel');
      if (designSystemVisible) {
        panel.style.display = 'block';
        if (!designSystemReport) {
          scanDesignSystem(); // Auto-scan on first open
        }
      } else {
        panel.style.display = 'none';
      }
    }

    async function scanDesignSystem() {
      var btn = document.getElementById('scan-design-btn');
      btn.disabled = true;
      btn.textContent = '🔍 Scanning...';

      try {
        var response = await fetch('/api/scan-design-system');
        var data = await response.json();
        designSystemReport = data;
        renderDesignSystemSummary();
        renderDesignTab(currentDesignTab);

        btn.textContent = '✅ Scanned ' + data.summary.filesScanned + ' files';
        setTimeout(function() {
          btn.disabled = false;
          btn.textContent = '🔍 Scan Design Tokens';
        }, 2000);
      } catch (error) {
        console.error('Design system scan failed:', error);
        btn.disabled = false;
        btn.textContent = '❌ Scan Failed';
      }
    }

    function renderDesignSystemSummary() {
      if (!designSystemReport) return;

      document.getElementById('design-stats').style.display = 'grid';
      document.getElementById('design-tabs').style.display = 'flex';

      document.getElementById('stat-colors').textContent = designSystemReport.summary.uniqueColors;
      document.getElementById('stat-spacings').textContent = designSystemReport.summary.uniqueSpacings;
      document.getElementById('stat-typography').textContent = designSystemReport.summary.uniqueTypography;
      document.getElementById('stat-radius').textContent = designSystemReport.summary.uniqueBorderRadius;
      document.getElementById('stat-inconsistencies').textContent = designSystemReport.summary.inconsistenciesFound;
    }

    function switchDesignTab(tab) {
      currentDesignTab = tab;

      document.querySelectorAll('#design-tabs .filter-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
          btn.classList.add('active');
        }
      });

      renderDesignTab(tab);
    }

    function renderDesignTab(tab) {
      if (!designSystemReport) return;

      var container = document.getElementById('design-content');
      var html = '';

      if (tab === 'colors') {
        html += '<div class="design-token-grid">';
        designSystemReport.colors.forEach(function(color) {
          html += '<div class="design-token-card">';
          html += '<div class="color-swatch" style="background: ' + escapeHtml(color.value) + ';"></div>';
          html += '<div class="token-value">' + escapeHtml(color.value) + '</div>';
          html += '<div class="token-count">' + color.count + ' uses</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (tab === 'spacing') {
        html += '<div class="design-token-grid">';
        designSystemReport.spacings.forEach(function(spacing) {
          html += '<div class="design-token-card">';
          html += '<div class="token-value">' + escapeHtml(spacing.value) + '</div>';
          html += '<div class="token-count">' + spacing.count + ' uses</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (tab === 'typography') {
        html += '<div class="design-token-grid">';
        designSystemReport.typography.forEach(function(type) {
          html += '<div class="design-token-card">';
          html += '<div class="token-value">' + escapeHtml(type.value) + '</div>';
          html += '<div class="token-count">' + type.count + ' uses</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (tab === 'inconsistencies') {
        if (designSystemReport.inconsistencies.length === 0) {
          html += '<div style="padding: 40px; text-align: center; color: var(--text-muted);">';
          html += '<div style="font-size: 48px; margin-bottom: 16px;">✅</div>';
          html += '<p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">No Issues Found</p>';
          html += '<p style="font-size: 14px;">Your design system looks consistent!</p>';
          html += '</div>';
        } else {
          designSystemReport.inconsistencies.forEach(function(issue) {
            html += '<div class="inconsistency-card ' + issue.severity + '">';
            html += '<div class="inconsistency-type">' + issue.type + '</div>';
            html += '<p style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">' + escapeHtml(issue.message) + '</p>';
            html += '<p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">' + escapeHtml(issue.suggestion) + '</p>';
            html += '<div style="font-size: 11px; color: var(--text-muted);">' + issue.occurrences + ' occurrences</div>';
            html += '</div>';
          });
        }
      }

      container.innerHTML = html;
    }

    function updateDashboard(data) {
      try {
        document.getElementById('loading').classList.add('hidden');

        var avgCompletion = data.summary.average_completion_score || 0;

        document.getElementById('stat-routes').textContent = data.summary.total_routes;
        document.getElementById('stat-elements').textContent = data.summary.total_elements;
        document.getElementById('stat-completion').textContent = avgCompletion;
        document.getElementById('stat-warnings').textContent = data.summary.issues.warnings;
        document.getElementById('stat-errors').textContent = data.summary.issues.errors;

        // Color code the completion score
        var completionEl = document.getElementById('stat-completion');
        if (avgCompletion >= 80) completionEl.style.color = '#22c55e';
        else if (avgCompletion >= 60) completionEl.style.color = '#f59e0b';
        else completionEl.style.color = '#ef4444';

        document.getElementById('edge-count').textContent = data.summary.total_edges + ' edges';
        document.getElementById('route-count').textContent = data.summary.total_routes + ' routes';
        document.getElementById('issue-count').textContent = data.issues.length + ' issues';

        updateQuickHealth(data);
        renderGraph(data.mermaid);
        renderFilters(data.issues);
        renderIssues(data.issues);
        renderRoutes(data.routes, data.issues);

        // Render route tree
        if (data.route_intelligence) {
          var tree = buildRouteTree(data.route_intelligence);
          var container = document.getElementById('route-tree');
          renderRouteTree(tree, container, '');
          document.getElementById('route-count').textContent = Object.keys(data.route_intelligence).length;
        }

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

    function renderFilters(issues) {
      var container = document.getElementById('filter-bar');
      var html = '<button class="filter-btn ' + (currentFilter === 'all' ? 'active' : '') + '" data-filter="all">All</button>';
      html += '<button class="filter-btn ' + (currentFilter === 'errors' ? 'active' : '') + '" data-filter="errors">🔴 Errors</button>';
      html += '<button class="filter-btn ' + (currentFilter === 'warnings' ? 'active' : '') + '" data-filter="warnings">🟡 Warnings</button>';

      // Add category filters
      var categoryFilters = ['accessibility', 'broken-interaction', 'auth-missing', 'performance', 'seo-metadata', 'form-ux', 'typescript-quality'];
      categoryFilters.forEach(function(catKey) {
        var cat = ISSUE_CATEGORIES[catKey];
        var count = issues.filter(function(i) { return i.type.startsWith(catKey); }).length;
        if (count > 0) {
          html += '<button class="filter-btn ' + (currentFilter === catKey ? 'active' : '') + '" data-filter="' + catKey + '">' + cat.icon + ' ' + cat.label + ' (' + count + ')</button>';
        }
      });

      container.innerHTML = html;

      container.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.onclick = function() {
          currentFilter = btn.dataset.filter;
          if (lastData) { renderFilters(lastData.issues); renderIssues(lastData.issues); }
        };
      });
    }

    function renderIssues(issues) {
      var container = document.getElementById('issues-list');
      var filtered = issues;
      if (currentFilter === 'errors') filtered = issues.filter(function(i) { return i.severity === 'error'; });
      else if (currentFilter === 'warnings') filtered = issues.filter(function(i) { return i.severity === 'warning'; });
      else if (currentFilter !== 'all') filtered = issues.filter(function(i) { return i.type.startsWith(currentFilter); });
      
      if (filtered.length === 0) {
        container.innerHTML = '<div class="no-issues"><div class="no-issues-icon">✓</div><p>No issues found</p></div>';
        return;
      }

      var grouped = {};
      filtered.forEach(function(issue) { if (!grouped[issue.type]) grouped[issue.type] = []; grouped[issue.type].push(issue); });
      
      var sortedTypes = Object.keys(grouped).sort(function(a, b) {
        var pa = ISSUE_CATEGORIES[a] ? ISSUE_CATEGORIES[a].priority : 99;
        var pb = ISSUE_CATEGORIES[b] ? ISSUE_CATEGORIES[b].priority : 99;
        return pa - pb;
      });

      var icons = { error: '✕', warning: '⚠', info: 'ℹ' };
      var html = '';
      
      sortedTypes.forEach(function(type) {
        var cat = ISSUE_CATEGORIES[type] || { icon: '•', label: type };
        var items = grouped[type];
        
        html += '<div class="issue-group">';
        html += '<div class="issue-group-header" onclick="this.parentElement.classList.toggle(&quot;collapsed&quot;)">';
        html += '<span class="issue-group-icon">' + cat.icon + '</span>';
        html += '<span class="issue-group-title">' + cat.label + '</span>';
        html += '<span class="issue-group-count">' + items.length + '</span>';
        html += '<span class="issue-group-chevron">▼</span></div>';
        html += '<div class="issue-group-items">';
        
        items.slice(0, 20).forEach(function(issue, idx) {
          var filename = issue.file_path.split('/').slice(-2).join('/');
          var issueId = type + '_' + idx;
          issueDataStore[issueId] = issue;
          html += '<div class="issue-item ' + issue.severity + '" style="cursor: pointer; position: relative;">';
          html += '<div class="issue-icon">' + icons[issue.severity] + '</div>';
          html += '<div class="issue-content" onclick="openIssueModal(\\\'' + escapeJs(issueId) + '\\\')">';
          html += '<div class="issue-message">' + escapeHtml(issue.message) + '</div>';
          html += '<div class="issue-file">' + escapeHtml(filename);
          if (issue.line_number) html += ':' + issue.line_number;
          html += '</div>';
          if (issue.suggestion) html += '<div class="issue-suggestion">💡 ' + escapeHtml(issue.suggestion) + '</div>';
          html += '</div>';
          html += '<div class="ai-fix-badge" onclick="event.stopPropagation(); openAIFixPanel(issueDataStore[\\\'' + escapeJs(issueId) + '\\\'])">🤖 Get AI Fix</div>';
          html += '</div>';
        });
        
        if (items.length > 20) html += '<div style="padding: 8px 12px; color: var(--text-muted); font-size: 11px;">...and ' + (items.length - 20) + ' more</div>';
        html += '</div></div>';
      });
      container.innerHTML = html;
    }

    function renderRoutes(routes, issues) {
      var tbody = document.getElementById('routes-tbody');
      var issuesByRoute = {};
      issues.forEach(function(issue) {
        var found = Object.entries(routes).find(function(entry) { return entry[1].file_path === issue.file_path; });
        if (found) { if (!issuesByRoute[found[0]]) issuesByRoute[found[0]] = []; issuesByRoute[found[0]].push(issue); }
      });
      
      var edgesByRoute = {};
      if (lastData && lastData.edges) {
        lastData.edges.forEach(function(edge) {
          if (!edgesByRoute[edge.from]) edgesByRoute[edge.from] = { inbound: [], outbound: [] };
          if (!edgesByRoute[edge.to]) edgesByRoute[edge.to] = { inbound: [], outbound: [] };
          edgesByRoute[edge.from].outbound.push(edge);
          edgesByRoute[edge.to].inbound.push(edge);
        });
      }
      
      var rows = Object.entries(routes).map(function(entry) {
        var path = entry[0];
        var route = entry[1];
        
        var badges = [];
        if (route.is_dynamic) badges.push('<span class="route-badge dynamic">dynamic</span>');
        if (route.has_layout) badges.push('<span class="route-badge layout">layout</span>');
        if (route.has_loading) badges.push('<span class="route-badge loading">loading</span>');
        if (route.has_error) badges.push('<span class="route-badge error-b">error</span>');
        
        var routeIssues = issuesByRoute[path] || [];
        var routeEdges = edgesByRoute[path] || { inbound: [], outbound: [] };
        var health = calculateHealthScore(route, routeIssues, routeEdges.inbound, routeEdges.outbound);
        var grade = getHealthGrade(health.score);
        
        var issueDots = '';
        var errors = routeIssues.filter(function(i) { return i.severity === 'error'; }).length;
        var warnings = routeIssues.filter(function(i) { return i.severity === 'warning'; }).length;
        for (var i = 0; i < Math.min(errors, 3); i++) issueDots += '<div class="route-issue-dot error"></div>';
        for (var i = 0; i < Math.min(warnings, 5); i++) issueDots += '<div class="route-issue-dot warning"></div>';
        
        var filename = route.file_path.split('/').slice(-2).join('/');
        
        return '<tr data-route="' + escapeHtml(path) + '">' +
          '<td><span class="route-path">' + escapeHtml(path) + '</span></td>' +
          '<td><div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 14px; font-weight: 700; color: ' + grade.color + '; font-family: JetBrains Mono;">' + grade.grade + '</span><span style="font-size: 10px; color: var(--text-muted);">' + health.score + '</span></div></td>' +
          '<td><span class="element-count">' + route.elements.length + '</span></td>' +
          '<td>' + badges.join('') + '</td>' +
          '<td><div class="route-issues">' + issueDots + '</div></td>' +
          '<td style="color: var(--text-muted); font-family: JetBrains Mono, monospace; font-size: 11px;">' + escapeHtml(filename) + '</td>' +
        '</tr>';
      });
      
      tbody.innerHTML = rows.join('');

      var rowCount = 0;
      tbody.querySelectorAll('tr').forEach(function(row) {
        rowCount++;
        row.onclick = function() {
          console.log('Row clicked:', row.dataset.route);
          openRouteModal(row.dataset.route);
        };
      });
      console.log('Attached click handlers to', rowCount, 'rows');
    }

    function openRouteModal(routePath) {
      console.log('openRouteModal called with:', routePath);
      if (!lastData) {
        console.log('No lastData');
        return;
      }
      var route = lastData.routes[routePath];
      if (!route) {
        console.log('Route not found:', routePath);
        return;
      }
      console.log('Opening modal for route:', route);

      document.getElementById('modal-route-path').textContent = routePath;
      var routeIssues = lastData.issues.filter(function(i) { return i.file_path === route.file_path; });
      var inbound = lastData.edges.filter(function(e) { return e.to === routePath; });
      var outbound = lastData.edges.filter(function(e) { return e.from === routePath; });
      var health = calculateHealthScore(route, routeIssues, inbound, outbound);
      var grade = getHealthGrade(health.score);

      currentRouteData = { path: routePath, route: route, issues: routeIssues };

      var routePurpose = getRoutePurpose(routePath);
      var similarRoutes = findSimilarRoutes(routePath);

      var html = '<div class="report-section">';
      html += '<div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">';
      html += '<div style="width: 80px; height: 80px; border-radius: 16px; background: ' + grade.color + '20; border: 2px solid ' + grade.color + '; display: flex; flex-direction: column; align-items: center; justify-content: center;">';
      html += '<div style="font-size: 28px; font-weight: 700; color: ' + grade.color + '; font-family: JetBrains Mono;">' + grade.grade + '</div>';
      html += '<div style="font-size: 11px; color: ' + grade.color + ';">' + health.score + '/100</div></div>';
      html += '<div style="flex: 1;"><div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Health: ' + grade.label + '</div>';
      html += '<div style="font-size: 12px; color: var(--text-secondary);">' + health.deductions.filter(function(d) { return d.points < 0; }).length + ' issues found</div></div>';
      if (routeIssues.length > 0) {
        html += '<button onclick="copyRouteIssuesToClipboard()" style="background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap;">📋 Copy All Issues for Claude</button>';
      }
      html += '</div></div>';

      // Route Intelligence section
      var routeIntelligence = lastData.route_intelligence ? lastData.route_intelligence[routePath] : null;
      if (routeIntelligence) {
        html += '<div class="report-section"><div class="report-section-title">🤖 Route Intelligence</div>';

        // Purpose & Completion Score
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">';
        html += '<div style="padding: 14px; background: var(--bg-tertiary); border-radius: 8px;">';
        html += '<div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Inferred Purpose</div>';
        html += '<div style="font-size: 14px; font-weight: 600;">' + escapeHtml(routeIntelligence.inferred_purpose) + '</div>';
        html += '<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">' + Math.round(routeIntelligence.purpose_confidence * 100) + '% confidence</div>';
        html += '</div>';

        var completionColor = routeIntelligence.completion_score >= 80 ? 'var(--accent)' : routeIntelligence.completion_score >= 60 ? 'var(--warning)' : 'var(--error)';
        html += '<div style="padding: 14px; background: var(--bg-tertiary); border-radius: 8px;">';
        html += '<div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Completion Score</div>';
        html += '<div style="font-size: 24px; font-weight: 700; font-family: JetBrains Mono; color: ' + completionColor + ';">' + routeIntelligence.completion_score + '/100</div>';
        html += '</div>';
        html += '</div>';

        // Completion Breakdown
        if (routeIntelligence.completion_breakdown) {
          html += '<div style="margin-bottom: 16px;"><div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Score Breakdown:</div>';
          html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px;">';
          var breakdown = routeIntelligence.completion_breakdown;
          Object.keys(breakdown).forEach(function(key) {
            var label = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
            var value = breakdown[key];
            var max = key === 'ui_completeness' ? 25 : key === 'functionality' ? 30 : key === 'error_handling' ? 20 : key === 'accessibility' ? 15 : 10;
            var percent = (value / max) * 100;
            var barColor = percent >= 80 ? 'var(--accent)' : percent >= 60 ? 'var(--warning)' : 'var(--error)';
            html += '<div style="padding: 8px; background: var(--bg-secondary); border-radius: 6px;">';
            html += '<div style="font-size: 9px; color: var(--text-muted); margin-bottom: 4px;">' + label + '</div>';
            html += '<div style="display: flex; align-items: center; gap: 6px;">';
            html += '<div style="flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;"><div style="height: 100%; width: ' + percent + '%; background: ' + barColor + ';"></div></div>';
            html += '<span style="font-size: 11px; font-weight: 600; font-family: JetBrains Mono; min-width: 28px;">' + value + '/' + max + '</span>';
            html += '</div></div>';
          });
          html += '</div></div>';
        }

        // Features
        html += '<div style="margin-bottom: 16px;"><div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Features Detected (' + routeIntelligence.features_detected.length + '):</div>';
        if (routeIntelligence.features_detected.length > 0) {
          html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
          routeIntelligence.features_detected.forEach(function(feature) {
            html += '<span style="font-size: 10px; padding: 4px 8px; background: var(--accent-muted); color: var(--accent); border-radius: 4px; font-weight: 500;">✓ ' + feature.replace(/-/g, ' ') + '</span>';
          });
          html += '</div>';
        } else {
          html += '<div style="font-size: 11px; color: var(--text-muted); font-style: italic;">No standard features detected</div>';
        }
        if (routeIntelligence.features_missing && routeIntelligence.features_missing.length > 0) {
          html += '<div style="margin-top: 8px;"><div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px;">Missing Expected Features:</div>';
          html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
          routeIntelligence.features_missing.forEach(function(feature) {
            html += '<span style="font-size: 10px; padding: 4px 8px; background: var(--error-muted); color: var(--error); border-radius: 4px;">✗ ' + feature.replace(/-/g, ' ') + '</span>';
          });
          html += '</div></div>';
        }
        html += '</div>';

        // Interactions
        if (routeIntelligence.interactions && routeIntelligence.interactions.length > 0) {
          html += '<div style="margin-bottom: 16px;"><div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Interactions (' + routeIntelligence.interactions.length + '): ' + routeIntelligence.working_count + ' working, ' + routeIntelligence.broken_count + ' broken</div>';
          html += '<div style="max-height: 200px; overflow-y: auto; background: var(--bg-secondary); border-radius: 8px; padding: 8px;">';
          routeIntelligence.interactions.forEach(function(ia) {
            var statusIcon = ia.status === 'working' ? '✓' : ia.status === 'empty' ? '∅' : ia.status === 'todo' ? '📌' : ia.status === 'console-only' ? '🖥️' : ia.status === 'broken' ? '✗' : ia.status === 'disabled' ? '⊘' : '?';
            var statusColor = ia.status === 'working' ? 'var(--accent)' : ia.status === 'empty' || ia.status === 'broken' ? 'var(--error)' : ia.status === 'todo' ? 'var(--warning)' : 'var(--text-muted)';
            html += '<div style="display: flex; align-items: center; gap: 8px; padding: 6px; border-bottom: 1px solid var(--border);">';
            html += '<span style="color: ' + statusColor + '; font-size: 12px;">' + statusIcon + '</span>';
            html += '<span style="font-size: 9px; padding: 2px 6px; background: var(--bg-tertiary); border-radius: 3px; color: var(--text-secondary);">' + ia.type + '</span>';
            html += '<span style="flex: 1; font-size: 11px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(ia.label) + '</span>';
            html += '<span style="font-size: 10px; color: var(--text-muted);">:' + ia.line_number + '</span>';
            html += '</div>';
          });
          html += '</div></div>';
        }

        // Warnings
        if (routeIntelligence.placeholder_warnings && routeIntelligence.placeholder_warnings.length > 0) {
          html += '<div style="padding: 10px; background: var(--warning-muted); border-left: 3px solid var(--warning); border-radius: 6px;">';
          html += '<div style="font-size: 11px; font-weight: 600; color: var(--warning); margin-bottom: 4px;">⚠️ Quality Warnings:</div>';
          html += '<div style="font-size: 11px; color: var(--text-primary);">' + routeIntelligence.placeholder_warnings.join(', ') + '</div>';
          html += '</div>';
        }

        html += '</div>';
      }

      html += '<div class="report-section"><div class="report-section-title">🎯 Route Purpose</div>';
      html += '<div style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 12px;">';
      html += '<p style="margin: 0; font-size: 14px; line-height: 1.6;">' + escapeHtml(routePurpose) + '</p></div>';
      if (similarRoutes.length > 0) {
        html += '<div style="margin-top: 12px;"><div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Related Routes:</div>';
        html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
        similarRoutes.forEach(function(path) {
          html += '<span style="font-size: 11px; padding: 4px 8px; background: var(--bg-tertiary); border-radius: 4px; font-family: JetBrains Mono;">' + escapeHtml(path) + '</span>';
        });
        html += '</div></div>';
      }
      html += '</div>';

      html += '<div class="report-section"><div class="report-section-title">Overview</div><div class="report-meta">';
      html += '<div class="report-meta-item"><div class="report-meta-label">Elements</div><div class="report-meta-value">' + route.elements.length + '</div></div>';
      html += '<div class="report-meta-item"><div class="report-meta-label">Issues</div><div class="report-meta-value ' + (routeIssues.length > 0 ? 'warning' : 'success') + '">' + routeIssues.length + '</div></div>';
      html += '<div class="report-meta-item"><div class="report-meta-label">Dynamic</div><div class="report-meta-value">' + (route.is_dynamic ? '✓ Yes' : '—') + '</div></div>';
      html += '<div class="report-meta-item"><div class="report-meta-label">Loading UI</div><div class="report-meta-value ' + (route.has_loading ? 'success' : '') + '">' + (route.has_loading ? '✓ Yes' : '—') + '</div></div>';
      html += '</div></div>';
      
      html += '<div class="report-section"><div class="report-section-title">Navigation</div><div class="report-nav-grid">';
      html += '<div class="report-nav-section"><h4>⬅️ Inbound (' + inbound.length + ')</h4>';
      if (inbound.length > 0) {
        html += '<div class="report-list">';
        inbound.forEach(function(edge) {
          html += '<div class="report-list-item"><div class="report-list-icon inbound">←</div>';
          html += '<div class="report-list-content"><div class="report-list-title">' + escapeHtml(edge.from) + '</div>';
          html += '<div class="report-list-subtitle">' + escapeHtml(edge.label || 'Link') + '</div></div></div>';
        });
        html += '</div>';
      } else { html += '<div class="report-empty">No inbound links</div>'; }
      html += '</div>';
      
      html += '<div class="report-nav-section"><h4>➡️ Outbound (' + outbound.length + ')</h4>';
      if (outbound.length > 0) {
        html += '<div class="report-list">';
        outbound.forEach(function(edge) {
          html += '<div class="report-list-item"><div class="report-list-icon outbound">→</div>';
          html += '<div class="report-list-content"><div class="report-list-title">' + escapeHtml(edge.to) + '</div>';
          html += '<div class="report-list-subtitle">' + escapeHtml(edge.label || 'Link') + '</div></div></div>';
        });
        html += '</div>';
      } else { html += '<div class="report-empty">No outbound links</div>'; }
      html += '</div></div></div>';
      
      if (routeIssues.length > 0) {
        html += '<div class="report-section"><div class="report-section-title">Issues (' + routeIssues.length + ')</div><div class="report-list">';
        var icons = { error: '✕', warning: '⚠', info: 'ℹ' };
        routeIssues.forEach(function(issue) {
          var cat = ISSUE_CATEGORIES[issue.type] || { icon: '•', label: issue.type };
          html += '<div class="report-list-item"><div class="report-list-icon" style="background: var(--' + issue.severity + '-muted); color: var(--' + issue.severity + ');">' + icons[issue.severity] + '</div>';
          html += '<div class="report-list-content"><div class="report-list-title">' + escapeHtml(issue.message) + '</div>';
          html += '<div class="report-list-subtitle">' + cat.icon + ' ' + cat.label + '</div></div></div>';
        });
        html += '</div></div>';
      }
      
      document.getElementById('modal-body').innerHTML = html;
      var modalElement = document.getElementById('route-modal');
      console.log('Adding open class to modal:', modalElement);
      modalElement.classList.add('open');
      console.log('Modal classes:', modalElement.className);
    }

    function closeRouteModal() { document.getElementById('route-modal').classList.remove('open'); }
    function closeModal(event) { if (event.target === event.currentTarget) closeRouteModal(); }

    function openIssueModal(issueId) {
      var issue = issueDataStore[issueId];
      if (!issue) {
        console.error('Issue not found:', issueId);
        return;
      }

      var cat = ISSUE_CATEGORIES[issue.type] || { icon: '•', label: issue.type };

      var severityColors = {
        error: { bg: 'var(--error-muted)', text: 'var(--error)', label: 'Error' },
        warning: { bg: 'var(--warning-muted)', text: 'var(--warning)', label: 'Warning' },
        info: { bg: 'var(--info-muted)', text: 'var(--info)', label: 'Info' }
      };
      var sev = severityColors[issue.severity] || severityColors.info;

      var html = '';
      html += '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;">';
      html += '<div>';
      html += '<div style="display: inline-block; background: ' + sev.bg + '; color: ' + sev.text + '; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-bottom: 12px;">' + sev.label.toUpperCase() + '</div>';
      html += '<h3 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">' + cat.icon + ' ' + cat.label + '</h3>';
      html += '</div>';
      html += '<button onclick="copyIssueToClipboard()" style="background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer;">📋 Copy for Claude</button>';
      html += '</div>';

      html += '<div style="background: var(--bg-tertiary); border-radius: 12px; padding: 16px; margin-bottom: 16px;">';
      html += '<div style="font-size: 14px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px;">Issue:</div>';
      html += '<div style="font-size: 15px; line-height: 1.6;">' + escapeHtml(issue.message) + '</div>';
      html += '</div>';

      html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">';
      html += '<div><div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">FILE</div>';
      html += '<div style="font-family: JetBrains Mono; font-size: 13px;">' + escapeHtml(issue.file_path) + '</div></div>';
      if (issue.line_number) {
        html += '<div><div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">LINE</div>';
        html += '<div style="font-family: JetBrains Mono; font-size: 13px;">Line ' + issue.line_number + '</div></div>';
      }
      html += '</div>';

      if (issue.suggestion) {
        html += '<div style="background: var(--accent-muted); border-left: 3px solid var(--accent); border-radius: 8px; padding: 16px; margin-top: 16px;">';
        html += '<div style="font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 8px;">💡 Suggested Fix</div>';
        html += '<div style="font-size: 14px; line-height: 1.6;">' + escapeHtml(issue.suggestion) + '</div>';
        html += '</div>';
      }

      window.currentIssue = issue;
      window.currentIssueCategory = cat;

      document.getElementById('issue-modal-body').innerHTML = html;
      document.getElementById('issue-modal').classList.add('open');
    }

    function copyIssueToClipboard() {
      var issue = window.currentIssue;
      var cat = window.currentIssueCategory;

      var text = '## UX Issue: ' + cat.label + '\\n\\n';
      text += '**Severity:** ' + issue.severity + '\\n';
      text += '**File:** ' + issue.file_path + '\\n';
      if (issue.line_number) text += '**Line:** ' + issue.line_number + '\\n';
      text += '\\n**Problem:**\\n' + issue.message + '\\n';
      if (issue.suggestion) text += '\\n**Suggested Fix:**\\n' + issue.suggestion + '\\n';

      navigator.clipboard.writeText(text).then(function() {
        var btn = event.target;
        var originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.background = 'var(--accent)';
        setTimeout(function() {
          btn.textContent = originalText;
          btn.style.background = 'var(--accent)';
        }, 2000);
      });
    }

    function getRoutePurpose(path) {
      var segments = path.split('/').filter(function(s) { return s; });
      var lastSegment = segments[segments.length - 1] || 'home';

      var purposes = {
        'dashboard': 'Main dashboard/overview page',
        'settings': 'User or application settings page',
        'profile': 'User profile management',
        'login': 'User authentication/login',
        'signup': 'New user registration',
        'forgot-password': 'Password recovery',
        'reset-password': 'Password reset',
        'onboarding': 'New user onboarding flow',
        'player': 'Player-related functionality',
        'coach': 'Coach-related functionality',
        'roster': 'Team roster management',
        'schedule': 'Schedule/calendar view',
        'stats': 'Statistics and analytics',
        'messages': 'Messaging/communication',
        'notifications': 'User notifications',
        'calendar': 'Calendar/event management',
        'watchlist': 'Saved/favorite items',
        'discover': 'Discovery/search functionality',
        'compare': 'Comparison tool',
        'pipeline': 'Pipeline/workflow management',
        'camps': 'Camps/events management',
        'videos': 'Video library/management',
        'analytics': 'Data analytics dashboard',
        'journey': 'User journey/progress tracking',
        'rounds': 'Golf rounds management',
        'qualifiers': 'Tournament qualifiers',
        'travel': 'Travel management',
        'documents': 'Document management',
        'announcements': 'Announcements/news',
        'tasks': 'Task management',
        'team': 'Team management',
        'activate': 'Feature activation',
        'college-interest': 'College recruitment tracking',
        'dev-plans': 'Development plans'
      };

      return purposes[lastSegment] || 'Application page';
    }

    function findSimilarRoutes(currentPath) {
      if (!lastData || !lastData.routes) return [];

      var similar = [];
      var currentSegments = currentPath.split('/').filter(function(s) { return s; });
      var currentBase = currentSegments.slice(0, -1).join('/');

      Object.keys(lastData.routes).forEach(function(path) {
        if (path === currentPath) return;

        var segments = path.split('/').filter(function(s) { return s; });
        var base = segments.slice(0, -1).join('/');

        if (base === currentBase) {
          similar.push(path);
        }
      });

      return similar;
    }

    function copyRouteIssuesToClipboard(event) {
      if (!currentRouteData || !currentRouteData.issues.length) {
        console.log('No route data or issues to copy');
        return;
      }
      console.log('Copying', currentRouteData.issues.length, 'issues for route:', currentRouteData.path);

      var route = currentRouteData.route;
      var issues = currentRouteData.issues;
      var routePath = currentRouteData.path;

      var errorCount = issues.filter(function(i) { return i.severity === 'error'; }).length;
      var warningCount = issues.filter(function(i) { return i.severity === 'warning'; }).length;
      var infoCount = issues.filter(function(i) { return i.severity === 'info'; }).length;

      var issuesByCategory = {};
      issues.forEach(function(issue) {
        var cat = ISSUE_CATEGORIES[issue.type] || { icon: '•', label: issue.type };
        if (!issuesByCategory[cat.label]) issuesByCategory[cat.label] = 0;
        issuesByCategory[cat.label]++;
      });

      var routePurpose = getRoutePurpose(routePath);
      var similarRoutes = findSimilarRoutes(routePath);

      var text = '# Route Analysis: ' + routePath + '\\n\\n';

      text += '## Route Purpose\\n\\n';
      text += routePurpose + '\\n\\n';

      if (similarRoutes.length > 0) {
        text += '**Related Routes:**\\n';
        similarRoutes.forEach(function(path) {
          text += '- ' + path + '\\n';
        });
        text += '\\n';
      }

      text += '## Technical Summary\\n\\n';
      text += '**File:** ' + route.file_path + '\\n';
      text += '**Total Issues:** ' + issues.length + ' (' + errorCount + ' errors, ' + warningCount + ' warnings, ' + infoCount + ' info)\\n';
      text += '**Elements:** ' + route.elements.length + '\\n';

      var features = [];
      if (route.is_dynamic) features.push('Dynamic Route');
      if (route.has_layout) features.push('Has Layout');
      if (route.has_loading) features.push('Has Loading UI');
      if (route.has_error) features.push('Has Error Boundary');
      if (features.length > 0) {
        text += '**Features:** ' + features.join(', ') + '\\n';
      }

      var componentTypes = [];
      route.elements.forEach(function(el) {
        if (el.type === 'button' && !componentTypes.includes('Buttons')) componentTypes.push('Buttons');
        if (el.type === 'form' && !componentTypes.includes('Forms')) componentTypes.push('Forms');
        if (el.type === 'link' && !componentTypes.includes('Links')) componentTypes.push('Links');
        if ((el.label && el.label.toLowerCase().includes('modal')) && !componentTypes.includes('Modals')) componentTypes.push('Modals');
        if ((el.label && el.label.toLowerCase().includes('table')) && !componentTypes.includes('Tables')) componentTypes.push('Tables');
      });
      if (componentTypes.length > 0) {
        text += '**UI Components:** ' + componentTypes.join(', ') + '\\n';
      }

      text += '\\n**Issue Breakdown by Category:**\\n';
      Object.keys(issuesByCategory).sort(function(a, b) {
        return issuesByCategory[b] - issuesByCategory[a];
      }).forEach(function(category) {
        text += '- ' + category + ': ' + issuesByCategory[category] + '\\n';
      });

      text += '\\n---\\n\\n';
      text += '## Detailed Issues\\n\\n';

      issues.forEach(function(issue, idx) {
        var cat = ISSUE_CATEGORIES[issue.type] || { icon: '•', label: issue.type };
        text += '### Issue ' + (idx + 1) + ': ' + cat.label + '\\n\\n';
        text += '**Severity:** ' + issue.severity + '\\n';
        if (issue.line_number) text += '**Line:** ' + issue.line_number + '\\n';
        text += '\\n**Problem:**\\n' + issue.message + '\\n';
        if (issue.suggestion) text += '\\n**Suggested Fix:**\\n' + issue.suggestion + '\\n';
        text += '\\n---\\n\\n';
      });

      navigator.clipboard.writeText(text).then(function() {
        var btn = event.target;
        var originalText = btn.textContent;
        btn.textContent = '✓ Copied ' + currentRouteData.issues.length + ' issues!';
        btn.style.background = 'var(--accent)';
        setTimeout(function() {
          btn.textContent = originalText;
          btn.style.background = 'var(--accent)';
        }, 2000);
      });
    }

    function openTodoModal() {
      if (!lastData || !lastData.todo) { alert('TODO data not available. Refresh the analysis.'); return; }
      var todo = lastData.todo;
      
      var html = '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">';
      html += '<div style="background: var(--bg-tertiary); border-radius: 12px; padding: 16px; text-align: center;"><div style="font-size: 28px; font-weight: 700; font-family: JetBrains Mono;">' + todo.stats.total + '</div><div style="font-size: 11px; color: var(--text-muted);">TOTAL</div></div>';
      html += '<div style="background: var(--error-muted); border-radius: 12px; padding: 16px; text-align: center;"><div style="font-size: 28px; font-weight: 700; color: var(--error);">' + todo.stats.critical + '</div><div style="font-size: 11px; color: var(--error);">CRITICAL</div></div>';
      html += '<div style="background: var(--warning-muted); border-radius: 12px; padding: 16px; text-align: center;"><div style="font-size: 28px; font-weight: 700; color: var(--warning);">' + (todo.stats.by_priority[3] || 0) + '</div><div style="font-size: 11px; color: var(--warning);">MEDIUM</div></div>';
      html += '<div style="background: var(--accent-muted); border-radius: 12px; padding: 16px; text-align: center;"><div style="font-size: 28px; font-weight: 700; color: var(--accent);">' + todo.stats.findings_count + '</div><div style="font-size: 11px; color: var(--accent);">FINDINGS</div></div></div>';
      
      var byCategory = {};
      todo.todos.forEach(function(t) { if (!byCategory[t.category]) byCategory[t.category] = []; byCategory[t.category].push(t); });
      var priorityIcons = { 1: '🚨', 2: '🔴', 3: '🟠', 4: '🟡', 5: '📝' };
      
      var sortedCats = Object.keys(byCategory).sort(function(a, b) {
        var pa = Math.min.apply(null, byCategory[a].map(function(t) { return t.priority; }));
        var pb = Math.min.apply(null, byCategory[b].map(function(t) { return t.priority; }));
        return pa - pb;
      });
      
      sortedCats.forEach(function(category) {
        var items = byCategory[category].sort(function(a, b) { return a.priority - b.priority; });
        html += '<details style="margin-bottom: 12px; background: var(--bg-tertiary); border-radius: 10px;" open>';
        html += '<summary style="padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 500;">';
        html += '<span>' + (priorityIcons[items[0].priority] || '📋') + '</span><span style="flex: 1;">' + escapeHtml(category) + '</span>';
        html += '<span style="font-size: 11px; font-family: JetBrains Mono; padding: 2px 8px; background: var(--bg-secondary); border-radius: 4px;">' + items.length + '</span></summary>';
        html += '<div style="padding: 0 16px 16px;">';
        items.forEach(function(item) {
          html += '<div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border);">';
          html += '<input type="checkbox" style="margin-top: 3px;" disabled>';
          html += '<div style="flex: 1;"><div style="font-size: 13px; font-weight: 500;">' + escapeHtml(item.task) + '</div>';
          html += '<div style="font-size: 11px; color: var(--text-muted); font-family: JetBrains Mono;">📁 ' + escapeHtml(item.file) + '</div></div></div>';
        });
        html += '</div></details>';
      });
      
      document.getElementById('todo-modal-body').innerHTML = html;
      document.getElementById('todo-modal').classList.add('open');
    }

    function closeTodoModalDirect() { document.getElementById('todo-modal').classList.remove('open'); }
    function closeTodoModal(event) { if (event.target === event.currentTarget) closeTodoModalDirect(); }

    function closeIssueModalDirect() { document.getElementById('issue-modal').classList.remove('open'); }
    function closeIssueModal(event) { if (event.target === event.currentTarget) closeIssueModalDirect(); }

    function refresh() {
      var btn = document.getElementById('refresh-btn');
      btn.classList.add('loading');
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'refresh' }));
      setTimeout(function() { btn.classList.remove('loading'); }, 1000);
    }

    function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Escape for JavaScript strings (for use in onclick attributes)
    function escapeJs(text) {
      return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }

    // Command Palette functionality
    var commandPaletteOpen = false;
    var commandPaletteSelected = 0;
    var commandPaletteItems = [];

    function openCommandPalette() {
      commandPaletteOpen = true;
      document.getElementById('command-palette').classList.add('open');
      document.getElementById('command-input').focus();
      document.getElementById('command-input').value = '';
      renderCommandPaletteResults('');
    }

    function closeCommandPalette(event) {
      if (event && event.target !== event.currentTarget) return;
      commandPaletteOpen = false;
      document.getElementById('command-palette').classList.remove('open');
      commandPaletteSelected = 0;
    }

    function closeCommandPaletteDirect() {
      commandPaletteOpen = false;
      document.getElementById('command-palette').classList.remove('open');
      commandPaletteSelected = 0;
    }

    function renderCommandPaletteResults(query) {
      if (!lastData) {
        document.getElementById('command-results').innerHTML = '<div class="command-empty"><p style="color: var(--text-muted); font-size: 13px;">No data loaded yet</p></div>';
        return;
      }

      var results = {
        routes: [],
        issues: [],
        actions: []
      };

      var lowerQuery = query.toLowerCase();

      // Search routes
      Object.entries(lastData.routes || {}).forEach(function(entry) {
        var path = entry[0];
        var route = entry[1];
        if (path.toLowerCase().includes(lowerQuery) || (route.file_path && route.file_path.toLowerCase().includes(lowerQuery))) {
          var ri = lastData.route_intelligence ? lastData.route_intelligence[path] : null;
          results.routes.push({
            type: 'route',
            path: path,
            subtitle: route.file_path.split('/').slice(-2).join('/'),
            badge: ri ? ri.completion_score + '/100' : null,
            action: function() { closeCommandPaletteDirect(); openRouteModal(path); }
          });
        }
      });

      // Search issues
      (lastData.issues || []).forEach(function(issue, idx) {
        if (issue.message.toLowerCase().includes(lowerQuery) || issue.type.toLowerCase().includes(lowerQuery)) {
          var cat = ISSUE_CATEGORIES[issue.type] || { icon: '•', label: issue.type };
          results.issues.push({
            type: 'issue',
            title: issue.message,
            subtitle: cat.icon + ' ' + cat.label,
            badge: issue.severity,
            action: function() { closeCommandPaletteDirect(); openIssueModal(idx); }
          });
        }
      });

      // Add actions
      if ('refresh'.includes(lowerQuery)) {
        results.actions.push({
          type: 'action',
          title: 'Refresh Analysis',
          subtitle: 'Re-analyze the codebase',
          icon: '🔄',
          action: function() { closeCommandPaletteDirect(); refresh(); }
        });
      }
      if ('export'.includes(lowerQuery) || 'json'.includes(lowerQuery)) {
        results.actions.push({
          type: 'action',
          title: 'Export as JSON',
          subtitle: 'Download full analysis data',
          icon: '📥',
          action: function() { closeCommandPaletteDirect(); exportResults('json'); }
        });
      }
      if ('export'.includes(lowerQuery) || 'todo'.includes(lowerQuery)) {
        results.actions.push({
          type: 'action',
          title: 'Export as TODO.md',
          subtitle: 'GitHub-compatible task list',
          icon: '✓',
          action: function() { closeCommandPaletteDirect(); exportResults('todo'); }
        });
      }
      if ('export'.includes(lowerQuery) || 'routes'.includes(lowerQuery) || 'docs'.includes(lowerQuery)) {
        results.actions.push({
          type: 'action',
          title: 'Export as ROUTES.md',
          subtitle: 'Route documentation with intelligence',
          icon: '📄',
          action: function() { closeCommandPaletteDirect(); exportResults('routes'); }
        });
      }
      if ('export'.includes(lowerQuery) || 'csv'.includes(lowerQuery) || 'spreadsheet'.includes(lowerQuery)) {
        results.actions.push({
          type: 'action',
          title: 'Export as CSV',
          subtitle: 'Spreadsheet-compatible format',
          icon: '📊',
          action: function() { closeCommandPaletteDirect(); exportResults('csv'); }
        });
      }

      // Build HTML
      var html = '';
      commandPaletteItems = [];

      if (results.routes.length === 0 && results.issues.length === 0 && results.actions.length === 0) {
        html = '<div class="command-empty"><div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">🔍</div><p style="color: var(--text-muted); font-size: 13px;">No results found</p></div>';
      } else {
        if (results.routes.length > 0) {
          html += '<div class="command-group"><div class="command-group-title">Routes (' + results.routes.length + ')</div>';
          results.routes.slice(0, 8).forEach(function(item) {
            commandPaletteItems.push(item);
            var idx = commandPaletteItems.length - 1;
            html += '<div class="command-item' + (idx === commandPaletteSelected ? ' selected' : '') + '" onclick="commandPaletteItems[' + idx + '].action()">';
            html += '<div class="command-icon route">→</div>';
            html += '<div class="command-content"><div class="command-title">' + escapeHtml(item.path) + '</div>';
            html += '<div class="command-subtitle">' + escapeHtml(item.subtitle) + '</div></div>';
            if (item.badge) html += '<span class="command-badge">' + escapeHtml(item.badge) + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }

        if (results.issues.length > 0) {
          html += '<div class="command-group"><div class="command-group-title">Issues (' + results.issues.length + ')</div>';
          results.issues.slice(0, 8).forEach(function(item) {
            commandPaletteItems.push(item);
            var idx = commandPaletteItems.length - 1;
            html += '<div class="command-item' + (idx === commandPaletteSelected ? ' selected' : '') + '" onclick="commandPaletteItems[' + idx + '].action()">';
            html += '<div class="command-icon issue">⚠</div>';
            html += '<div class="command-content"><div class="command-title">' + escapeHtml(item.title.substring(0, 60)) + '</div>';
            html += '<div class="command-subtitle">' + escapeHtml(item.subtitle) + '</div></div>';
            if (item.badge) html += '<span class="command-badge">' + escapeHtml(item.badge) + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }

        if (results.actions.length > 0) {
          html += '<div class="command-group"><div class="command-group-title">Actions</div>';
          results.actions.forEach(function(item) {
            commandPaletteItems.push(item);
            var idx = commandPaletteItems.length - 1;
            html += '<div class="command-item' + (idx === commandPaletteSelected ? ' selected' : '') + '" onclick="commandPaletteItems[' + idx + '].action()">';
            html += '<div class="command-icon action">' + escapeHtml(item.icon) + '</div>';
            html += '<div class="command-content"><div class="command-title">' + escapeHtml(item.title) + '</div>';
            html += '<div class="command-subtitle">' + escapeHtml(item.subtitle) + '</div></div>';
            html += '</div>';
          });
          html += '</div>';
        }
      }

      document.getElementById('command-results').innerHTML = html;
    }

    // Export Format Generators
    function generateTodoMarkdown() {
      if (!lastData) return '';

      var output = '# UX Flow Audit - Action Items\n\n';
      output += 'Generated: ' + new Date().toISOString() + '\n\n';
      output += '## Summary\n\n';
      output += '- **Total Routes**: ' + lastData.summary.total_routes + '\n';
      output += '- **Average Completion**: ' + (lastData.summary.average_completion_score || 0) + '/100\n';
      output += '- **Total Issues**: ' + lastData.summary.total_issues + '\n\n';

      // Group issues by severity
      var critical = [];
      var high = [];
      var medium = [];
      var low = [];

      (lastData.issues || []).forEach(function(issue) {
        var item = {
          category: issue.category,
          message: issue.message,
          file: issue.file_path.replace(/.*\/src\/app\//, ''),
          line: issue.line_number,
          suggestion: issue.suggestion
        };

        if (issue.severity === 'critical') critical.push(item);
        else if (issue.severity === 'high') high.push(item);
        else if (issue.severity === 'medium') medium.push(item);
        else low.push(item);
      });

      function renderIssueGroup(title, issues) {
        if (issues.length === 0) return '';
        var out = '## ' + title + ' (' + issues.length + ')\n\n';
        issues.forEach(function(item) {
          out += '- [ ] **' + item.category + '**: ' + item.message + '\n';
          out += '  - File: ' + String.fromCharCode(96) + item.file + ':' + item.line + String.fromCharCode(96) + '\n';
          if (item.suggestion) {
            out += '  - Fix: ' + item.suggestion + '\n';
          }
          out += '\n';
        });
        return out;
      }

      output += renderIssueGroup('🔴 Critical Issues', critical);
      output += renderIssueGroup('🟠 High Priority Issues', high);
      output += renderIssueGroup('🟡 Medium Priority Issues', medium);
      output += renderIssueGroup('⚪ Low Priority Issues', low);

      // Add incomplete routes section
      if (lastData.route_intelligence) {
        var incompleteRoutes = [];
        Object.entries(lastData.route_intelligence).forEach(function(entry) {
          var path = entry[0];
          var ri = entry[1];
          if (ri.completion_score < 80) {
            incompleteRoutes.push({
              path: path,
              score: ri.completion_score,
              purpose: ri.inferred_purpose,
              missing: ri.features_missing
            });
          }
        });

        incompleteRoutes.sort(function(a, b) { return a.score - b.score; });

        if (incompleteRoutes.length > 0) {
          output += '## 🚧 Incomplete Routes (' + incompleteRoutes.length + ')\n\n';
          incompleteRoutes.forEach(function(route) {
            output += '- [ ] **' + route.path + '** (' + route.score + '/100)\n';
            output += '  - Purpose: ' + route.purpose + '\n';
            if (route.missing.length > 0) {
              output += '  - Missing: ' + route.missing.join(', ') + '\n';
            }
            output += '\n';
          });
        }
      }

      return output;
    }

    function generateRoutesMarkdown() {
      if (!lastData) return '';

      var output = '# Routes Documentation\n\n';
      output += 'Generated: ' + new Date().toISOString() + '\n\n';
      output += '## Overview\n\n';
      output += '- **Total Routes**: ' + lastData.summary.total_routes + '\n';
      output += '- **Average Completion**: ' + (lastData.summary.average_completion_score || 0) + '/100\n\n';

      if (!lastData.route_intelligence) {
        output += '*No route intelligence data available*\n';
        return output;
      }

      // Group routes by path structure
      var routesBySection = {};
      Object.entries(lastData.route_intelligence).forEach(function(entry) {
        var path = entry[0];
        var ri = entry[1];
        var section = path.split('/')[1] || 'root';
        if (!routesBySection[section]) routesBySection[section] = [];
        routesBySection[section].push({ path: path, ri: ri });
      });

      // Sort sections
      Object.keys(routesBySection).sort().forEach(function(section) {
        output += '## /' + section + '\n\n';

        routesBySection[section].sort(function(a, b) {
          return a.path.localeCompare(b.path);
        }).forEach(function(item) {
          var ri = item.ri;

          output += '### ' + String.fromCharCode(96) + item.path + String.fromCharCode(96) + '\n\n';
          output += '**Purpose**: ' + ri.inferred_purpose + ' (' + Math.round(ri.purpose_confidence * 100) + '% confidence)\n\n';
          output += '**Completion Score**: ' + ri.completion_score + '/100\n\n';

          if (ri.completion_breakdown) {
            output += '**Score Breakdown**:\n';
            Object.entries(ri.completion_breakdown).forEach(function(entry) {
              var key = entry[0];
              var value = entry[1];
              var label = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
              output += '- ' + label + ': ' + value + '\n';
            });
            output += '\n';
          }

          if (ri.features_detected.length > 0) {
            output += '**Features Detected**: ' + ri.features_detected.join(', ') + '\n\n';
          }

          if (ri.features_missing.length > 0) {
            output += '**Features Missing**: ' + ri.features_missing.join(', ') + '\n\n';
          }

          if (ri.interactions.length > 0) {
            output += '**Interactions** (' + ri.interactions.length + '):\n';
            ri.interactions.forEach(function(ia) {
              var icon = ia.status === 'working' ? '✓' : ia.status === 'empty' ? '∅' : ia.status === 'todo' ? '⚠' : '✗';
              output += '- ' + icon + ' ' + ia.type + ': "' + ia.label + '" (' + ia.status + ')\n';
            });
            output += '\n';
          }

          if (ri.placeholder_warnings.length > 0) {
            output += '**⚠️ Quality Warnings**:\n';
            ri.placeholder_warnings.forEach(function(warning) {
              output += '- ' + warning + '\n';
            });
            output += '\n';
          }

          output += '---\n\n';
        });
      });

      return output;
    }

    function generateCSV() {
      if (!lastData) return '';

      var rows = [];
      rows.push(['Route', 'Purpose', 'Completion Score', 'Features Detected', 'Features Missing', 'Working Interactions', 'Broken Interactions', 'Total Issues', 'File Path']);

      if (lastData.route_intelligence) {
        Object.entries(lastData.route_intelligence).forEach(function(entry) {
          var path = entry[0];
          var ri = entry[1];

          rows.push([
            path,
            ri.inferred_purpose,
            ri.completion_score,
            ri.features_detected.join('; '),
            ri.features_missing.join('; '),
            ri.working_count,
            ri.broken_count,
            ri.issues_count,
            ri.file_path
          ]);
        });
      }

      // Convert to CSV string
      return rows.map(function(row) {
        return row.map(function(cell) {
          var str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(',');
      }).join('\\n');
    }

    function exportResults(format) {
      if (!lastData) return;

      format = format || 'json';
      var content, mimeType, extension;

      if (format === 'json') {
        content = JSON.stringify(lastData, null, 2);
        mimeType = 'application/json';
        extension = '.json';
      } else if (format === 'todo') {
        content = generateTodoMarkdown();
        mimeType = 'text/markdown';
        extension = '.md';
      } else if (format === 'routes') {
        content = generateRoutesMarkdown();
        mimeType = 'text/markdown';
        extension = '.md';
      } else if (format === 'csv') {
        content = generateCSV();
        mimeType = 'text/csv';
        extension = '.csv';
      } else {
        return;
      }

      var dataUri = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content);
      var filename = 'ux-flow-audit-' + new Date().toISOString().split('T')[0] + extension;
      var linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', filename);
      linkElement.click();
    }

    // Route search filter
    document.getElementById('route-search').addEventListener('input', function(e) {
      if (lastData && lastData.route_intelligence) {
        var tree = buildRouteTree(lastData.route_intelligence);
        var container = document.getElementById('route-tree');
        renderRouteTree(tree, container, e.target.value);
      }
    });

    // Keyboard event handler
    document.getElementById('command-input').addEventListener('input', function(e) {
      commandPaletteSelected = 0;
      renderCommandPaletteResults(e.target.value);
    });

    document.addEventListener('keydown', function(e) {
      // Command palette toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (commandPaletteOpen) closeCommandPaletteDirect();
        else openCommandPalette();
        return;
      }

      // Command palette navigation
      if (commandPaletteOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeCommandPaletteDirect();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          commandPaletteSelected = Math.min(commandPaletteSelected + 1, commandPaletteItems.length - 1);
          renderCommandPaletteResults(document.getElementById('command-input').value);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          commandPaletteSelected = Math.max(commandPaletteSelected - 1, 0);
          renderCommandPaletteResults(document.getElementById('command-input').value);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (commandPaletteItems[commandPaletteSelected]) {
            commandPaletteItems[commandPaletteSelected].action();
          }
          return;
        }
      }

      // Close modals with Escape
      if (e.key === 'Escape') {
        closeRouteModal();
        closeTodoModalDirect();
        closeIssueModalDirect();
      }
    });

    // Load milestones and annotations from localStorage
    loadMilestones();

    connect();
  <\/script>
</body>
</html>`;

server.listen(PORT, function() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║   🎯 UX Flow Auditor Dashboard                            ║');
  console.log('║                                                           ║');
  console.log('║   Dashboard: http://localhost:' + PORT + '                       ║');
  console.log('║   Watching:  ' + APP_DIR.padEnd(40) + '║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  runAnalysis();
  
  var resolvedPath = path.resolve(APP_DIR);
  if (fs.existsSync(resolvedPath)) {
    watchDirectory(resolvedPath);
  } else {
    console.error('⚠️  Directory not found: ' + resolvedPath);
  }
});
