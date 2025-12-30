/**
 * Ship Command Hub v5 Dashboard
 */

class ShipCommandDashboard {
  constructor() {
    this.wsUrl = 'ws://localhost:3334';
    this.ws = null;
    this.issues = new Map();
    this.routes = new Map();
    this.shipScore = 0;
    this.currentIssueId = null;
    this.mode = 'manual';
    
    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.connectWebSocket();
  }

  bindElements() {
    // Header
    this.connectionStatus = document.getElementById('connection-status');
    this.shipScoreEl = document.getElementById('ship-score');
    this.scoreRing = document.getElementById('score-ring');
    this.btnScan = document.getElementById('btn-scan');
    
    // Mode buttons
    this.modeBtns = document.querySelectorAll('.mode-btn');
    
    // Agent status elements
    this.statusVisual = document.getElementById('status-visual');
    this.statusImprovement = document.getElementById('status-improvement');
    this.statusCoordinator = document.getElementById('status-coordinator');
    this.agentLog = document.getElementById('agent-log');
    this.btnClearLog = document.getElementById('btn-clear-log');
    
    // Panels
    this.issueList = document.getElementById('issue-list');
    this.routeList = document.getElementById('route-list');
    this.issueCount = document.getElementById('issue-count');
    this.routeCount = document.getElementById('route-count');
    
    // Stats
    this.statRoutes = document.getElementById('stat-routes');
    this.statIssues = document.getElementById('stat-issues');
    this.statFixed = document.getElementById('stat-fixed');
    
    // Quick action buttons
    this.quickActionBtns = document.querySelectorAll('[data-action]');
    
    // Checklist
    this.readinessChecklist = document.getElementById('readiness-checklist');
    
    // Modal
    this.modal = document.getElementById('fix-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.fixFile = document.getElementById('fix-file');
    this.fixDescription = document.getElementById('fix-description');
    this.promptCode = document.getElementById('prompt-code');
    this.btnCopy = document.getElementById('btn-copy');
    this.btnSkip = document.getElementById('btn-skip');
    this.btnMarkFixed = document.getElementById('btn-mark-fixed');
    this.btnCloseModal = document.getElementById('btn-close-modal');
  }

  bindEvents() {
    // Scan button
    this.btnScan?.addEventListener('click', () => this.scan());
    
    // Mode buttons
    this.modeBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.setMode(mode);
      });
    });
    
    // Quick actions
    this.quickActionBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.quickAction(action);
      });
    });
    
    // Clear log
    this.btnClearLog?.addEventListener('click', () => this.clearLog());
    
    // Modal
    this.btnCopy?.addEventListener('click', () => this.copyPrompt());
    this.btnSkip?.addEventListener('click', () => this.closeModal());
    this.btnMarkFixed?.addEventListener('click', () => this.markFixed());
    this.btnCloseModal?.addEventListener('click', () => this.closeModal());
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());
  }

  connectWebSocket() {
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.onopen = () => {
      console.log('🔌 Connected to Ship Command Hub');
      this.setConnectionStatus('connected', 'Connected');
      this.addLogEntry('coordinator', 'Connected to orchestrator', 'success');
      
      this.ws.send(JSON.stringify({ type: 'get-status' }));
      this.ws.send(JSON.stringify({ type: 'get-routes' }));
      this.ws.send(JSON.stringify({ type: 'get-issues' }));
    };
    
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };
    
    this.ws.onclose = () => {
      this.setConnectionStatus('disconnected', 'Disconnected');
      this.addLogEntry('coordinator', 'Disconnected from orchestrator', 'error');
      setTimeout(() => this.connectWebSocket(), 3000);
    };
    
    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  setConnectionStatus(status, text) {
    if (this.connectionStatus) {
      this.connectionStatus.className = `connection-status ${status}`;
      this.connectionStatus.querySelector('.status-text').textContent = text;
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'status':
        this.updateStatus(msg.data);
        break;
        
      case 'mode-changed':
        this.updateMode(msg.data.mode);
        break;
        
      case 'scan-start':
        this.btnScan.disabled = true;
        this.btnScan.innerHTML = '<span>⏳</span> Scanning...';
        this.setAgentStatus('visual', 'Scanning...');
        this.addLogEntry('visual-analysis', 'Starting route scan...', 'info');
        break;
        
      case 'scan-complete':
        this.btnScan.disabled = false;
        this.btnScan.innerHTML = '<span>🔍</span> Scan';
        this.setAgentStatus('visual', 'Idle');
        this.addLogEntry('coordinator', `Scan complete: ${msg.data?.issueCount || 0} issues found`, 'success');
        this.updateChecklist();
        break;
        
      case 'routes':
        this.handleRoutes(msg.data);
        break;
        
      case 'issues':
        this.handleIssues(msg.data);
        break;
        
      case 'agent-activity':
        this.handleAgentActivity(msg.data);
        break;
        
      case 'prompt-generated':
        this.showPrompt(msg.data);
        break;
        
      case 'batch-prompt':
        this.showBatchPrompt(msg.data);
        break;
        
      case 'issue-fixed':
        this.handleIssuefixed(msg.data);
        break;
        
      case 'discovery':
        this.addLogEntry('visual-analysis', msg.data.message || 'New discovery', 'info');
        break;
        
      case 'insight':
        this.addLogEntry('improvement', msg.data.message || 'New insight', 'info');
        break;
    }
  }

  updateStatus(data) {
    if (data.mode) {
      this.updateMode(data.mode);
    }
  }

  updateMode(mode) {
    this.mode = mode;
    this.modeBtns?.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  setMode(mode) {
    this.ws.send(JSON.stringify({ type: 'set-mode', data: { mode } }));
    this.addLogEntry('coordinator', `Mode changed to: ${mode}`, 'info');
  }

  setAgentStatus(agent, status) {
    const el = document.getElementById(`status-${agent}`);
    if (el) el.textContent = status;
    
    const node = document.querySelector(`[data-agent="${agent === 'visual' ? 'visual-analysis' : agent}"]`);
    if (node) {
      node.classList.toggle('active', status !== 'Idle' && status !== 'Ready');
    }
  }

  updateShipScore(score) {
    this.shipScore = score;
    if (this.shipScoreEl) {
      this.shipScoreEl.textContent = score;
    }
    if (this.scoreRing) {
      const circumference = 339.292;
      const offset = circumference - (score / 100) * circumference;
      this.scoreRing.style.strokeDashoffset = offset;
    }
  }

  handleRoutes(routes) {
    if (!routes) return;
    
    this.routes.clear();
    routes.forEach(r => this.routes.set(r.path || r.routePath, r));
    
    const count = routes.length;
    if (this.routeCount) this.routeCount.textContent = count;
    if (this.statRoutes) this.statRoutes.textContent = count;
    
    if (count === 0) {
      this.routeList.innerHTML = `
        <div class="empty-state">
          <span>🗺️</span>
          <p>No routes scanned yet</p>
        </div>
      `;
      return;
    }
    
    this.routeList.innerHTML = routes.map(route => {
      const routePath = route.path || route.routePath;
      const hasLoading = route.hasLoading !== false;
      const hasError = route.hasError !== false;
      const status = hasLoading && hasError ? 'ready' : 'needs-work';
      
      return `
        <div class="route-item" data-path="${routePath}">
          <div class="route-path">${routePath}</div>
          <div class="route-status ${status}">
            ${hasLoading ? '✅' : '❌'} Loading · ${hasError ? '✅' : '❌'} Error
          </div>
        </div>
      `;
    }).join('');
    
    // Calculate ship score
    const totalChecks = routes.length * 2;
    const passedChecks = routes.filter(r => r.hasLoading !== false).length + 
                         routes.filter(r => r.hasError !== false).length;
    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
    this.updateShipScore(score);
  }

  handleIssues(issues) {
    if (!issues) return;
    
    this.issues.clear();
    issues.forEach(i => this.issues.set(i.id, i));
    
    const openIssues = issues.filter(i => i.status !== 'fixed');
    const fixedIssues = issues.filter(i => i.status === 'fixed');
    
    if (this.issueCount) this.issueCount.textContent = openIssues.length;
    if (this.statIssues) this.statIssues.textContent = openIssues.length;
    if (this.statFixed) this.statFixed.textContent = fixedIssues.length;
    
    if (issues.length === 0) {
      this.issueList.innerHTML = `
        <div class="empty-state">
          <span>📋</span>
          <p>Click Scan to find issues</p>
        </div>
      `;
      return;
    }
    
    this.issueList.innerHTML = issues.map(issue => `
      <div class="issue-item ${issue.status === 'fixed' ? 'fixed' : ''}" data-id="${issue.id}">
        <div class="issue-title">${issue.title}</div>
        <div class="issue-meta">
          <span class="severity-${issue.severity}">${issue.severity || 'warning'}</span>
          <span>${issue.category || 'general'}</span>
        </div>
      </div>
    `).join('');
    
    // Bind click events
    this.issueList.querySelectorAll('.issue-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        this.openIssue(id);
      });
    });
    
    this.updateChecklist();
  }

  handleAgentActivity(data) {
    const { agent, message, status } = data;
    
    if (status) {
      this.setAgentStatus(agent, status);
    }
    
    if (message) {
      this.addLogEntry(agent, message, 'info');
    }
  }

  handleIssuefixed(data) {
    const issue = this.issues.get(data.issueId);
    if (issue) {
      issue.status = 'fixed';
      this.handleIssues(Array.from(this.issues.values()));
      this.addLogEntry('improvement', `Issue fixed: ${issue.title}`, 'success');
    }
  }

  scan() {
    this.ws.send(JSON.stringify({ type: 'scan' }));
  }

  quickAction(action) {
    this.ws.send(JSON.stringify({ type: 'quick-action', data: { action } }));
    this.addLogEntry('coordinator', `Quick action: ${action}`, 'info');
  }

  openIssue(issueId) {
    const issue = this.issues.get(issueId);
    if (!issue || issue.status === 'fixed') return;
    
    this.currentIssueId = issueId;
    
    this.modalTitle.textContent = `Intelligence Brief: ${issue.title}`;
    this.fixFile.textContent = issue.file || issue.routePath || '';
    this.fixDescription.textContent = issue.description || '';
    this.promptCode.textContent = 'Generating Intelligence Brief...';
    
    this.modal.classList.add('active');
    
    this.ws.send(JSON.stringify({
      type: 'generate-prompt',
      data: { issueId },
    }));
  }

  showPrompt(data) {
    if (this.promptCode) {
      this.promptCode.textContent = data.prompt || 'No prompt available';
    }
  }

  showBatchPrompt(data) {
    this.modalTitle.textContent = `Batch Fix: ${data.action} (${data.count} issues)`;
    this.fixFile.textContent = '';
    this.fixDescription.textContent = `Fix ${data.count} ${data.action} issues`;
    this.promptCode.textContent = data.prompt || 'No prompt available';
    this.currentIssueId = null;
    this.modal.classList.add('active');
  }

  copyPrompt() {
    const prompt = this.promptCode?.textContent;
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      this.btnCopy.textContent = '✅ Copied!';
      setTimeout(() => {
        this.btnCopy.textContent = '📋 Copy';
      }, 2000);
    }
  }

  markFixed() {
    if (!this.currentIssueId) {
      this.closeModal();
      return;
    }
    
    this.ws.send(JSON.stringify({
      type: 'mark-fixed',
      data: { issueId: this.currentIssueId },
    }));
    
    this.closeModal();
  }

  closeModal() {
    this.modal?.classList.remove('active');
    this.currentIssueId = null;
  }

  addLogEntry(agent, message, type = 'info') {
    if (!this.agentLog) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
      <div class="log-agent">${agent}</div>
      <div class="log-message">${message}</div>
      <div class="log-time">${new Date().toLocaleTimeString()}</div>
    `;
    
    this.agentLog.insertBefore(entry, this.agentLog.firstChild);
    
    // Keep only last 50 entries
    while (this.agentLog.children.length > 50) {
      this.agentLog.removeChild(this.agentLog.lastChild);
    }
  }

  clearLog() {
    if (this.agentLog) {
      this.agentLog.innerHTML = '';
    }
  }

  updateChecklist() {
    if (!this.readinessChecklist) return;
    
    const issues = Array.from(this.issues.values()).filter(i => i.status !== 'fixed');
    
    const checks = {
      loading: !issues.some(i => (i.title || '').toLowerCase().includes('loading')),
      errors: !issues.some(i => (i.title || '').toLowerCase().includes('error') && !(i.title || '').toLowerCase().includes('console')),
      console: !issues.some(i => (i.title || '').toLowerCase().includes('console')),
      types: !issues.some(i => (i.title || '').toLowerCase().includes('type')),
    };
    
    Object.entries(checks).forEach(([check, passed]) => {
      const item = this.readinessChecklist.querySelector(`[data-check="${check}"]`);
      if (item) {
        item.classList.toggle('checked', passed);
        item.querySelector('.check-icon').textContent = passed ? '✅' : '⬜';
      }
    });
  }
}

// Start
new ShipCommandDashboard();
