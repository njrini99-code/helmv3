/**
 * HelmDev Visual Intelligence Dashboard
 * 
 * Features:
 * - Real-time WebSocket connection to orchestrator
 * - Route cards with screenshots and scores
 * - Click-to-fix suggestions
 * - Agent activity visualization
 * - Mode switching (manual/hybrid/autonomous)
 */

class VisualIntelligenceDashboard {
  constructor() {
    this.ws = null;
    this.wsUrl = 'ws://localhost:3334';
    this.routes = new Map();
    this.currentMode = 'manual';
    this.selectedRoute = null;
    this.activityLog = [];
    
    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.connectWebSocket();
    this.updateStats();
  }

  bindElements() {
    // Stats
    this.statRoutes = document.getElementById('stat-routes');
    this.statIssues = document.getElementById('stat-issues');
    this.statFeatures = document.getElementById('stat-features');
    this.statScore = document.getElementById('stat-score');
    
    // Controls
    this.btnScan = document.getElementById('btn-scan');
    this.btnScanEmpty = document.getElementById('btn-scan-empty');
    this.btnRefresh = document.getElementById('btn-refresh');
    this.sortBy = document.getElementById('sort-by');
    this.filterSeverity = document.getElementById('filter-severity');
    this.modeButtons = document.querySelectorAll('.mode-btn');
    
    // Containers
    this.routeGrid = document.getElementById('route-grid');
    this.emptyState = document.getElementById('empty-state');
    this.activityLogEl = document.getElementById('activity-log');
    this.insightsList = document.getElementById('insights-list');
    
    // Modal
    this.promptModal = document.getElementById('prompt-modal');
    this.modalIcon = document.getElementById('modal-icon');
    this.modalTitle = document.getElementById('modal-title');
    this.modalSubtitle = document.getElementById('modal-subtitle');
    this.modalLoading = document.getElementById('modal-loading');
    this.modalPrompt = document.getElementById('modal-prompt');
    this.promptCode = document.getElementById('prompt-code');
    this.modalFooter = document.getElementById('modal-footer');
    this.btnCloseModal = document.getElementById('btn-close-modal');
    this.btnCopyPrompt = document.getElementById('btn-copy-prompt');
    this.btnApplyFix = document.getElementById('btn-apply-fix');
    
    // Scanning overlay
    this.scanningOverlay = document.getElementById('scanning-overlay');
    this.scanningStatus = document.getElementById('scanning-status');
    this.scanningProgress = document.getElementById('scanning-progress-bar');
    this.scanningDetail = document.getElementById('scanning-detail');
    
    // Toast container
    this.toastContainer = document.getElementById('toast-container');
    
    // Agent nodes
    this.agentNodes = document.querySelectorAll('.agent-node');
  }

  bindEvents() {
    // Scan buttons
    this.btnScan?.addEventListener('click', () => this.startScan());
    this.btnScanEmpty?.addEventListener('click', () => this.startScan());
    this.btnRefresh?.addEventListener('click', () => this.refresh());
    
    // Filters
    this.sortBy?.addEventListener('change', () => this.renderRoutes());
    this.filterSeverity?.addEventListener('change', () => this.renderRoutes());
    
    // Mode toggle
    this.modeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    
    // Modal
    this.btnCloseModal?.addEventListener('click', () => this.closeModal());
    this.promptModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());
    this.btnCopyPrompt?.addEventListener('click', () => this.copyPrompt());
    this.btnApplyFix?.addEventListener('click', () => this.applyFix());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });
    
    // Clear activity log
    document.getElementById('btn-clear-log')?.addEventListener('click', () => {
      this.activityLog = [];
      this.renderActivityLog();
    });
  }

  // ============================================
  // WebSocket Connection
  // ============================================

  connectWebSocket() {
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.onopen = () => {
      console.log('🔌 Connected to HelmDev');
      this.addActivity('coordinator', 'success', 'Connected to orchestrator');
      this.ws.send(JSON.stringify({ type: 'get-status' }));
      this.ws.send(JSON.stringify({ type: 'get-routes' }));
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onclose = () => {
      console.log('🔌 Disconnected from HelmDev');
      this.addActivity('coordinator', 'warn', 'Disconnected - reconnecting...');
      
      // Reconnect after 3 seconds
      setTimeout(() => this.connectWebSocket(), 3000);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.addActivity('coordinator', 'error', 'Connection error');
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'status':
        this.handleStatus(message.data);
        break;
        
      case 'routes':
        this.handleRoutes(message.data);
        break;
        
      case 'route-analysis':
        this.handleRouteAnalysis(message.data);
        break;
        
      case 'scan-start':
        this.showScanningOverlay(message.data);
        break;
        
      case 'scan-progress':
        this.updateScanProgress(message.data);
        break;
        
      case 'scan-complete':
        this.hideScanningOverlay();
        this.showToast('success', 'Scan Complete', `Analyzed ${message.data?.total || 0} routes`);
        break;
        
      case 'agent-activity':
        this.handleAgentActivity(message.data);
        break;
        
      case 'prompt-generated':
        this.handlePromptGenerated(message.data);
        break;
        
      case 'mode-changed':
        this.handleModeChanged(message.data);
        break;
        
      case 'fix-completed':
        this.handleFixCompleted(message.data);
        break;
        
      case 'fix-failed':
        this.handleFixFailed(message.data);
        break;
        
      case 'insights':
        this.handleInsights(message.data);
        break;
    }
  }

  // ============================================
  // Message Handlers
  // ============================================

  handleStatus(data) {
    if (data.agents) {
      this.updateAgentStatus(data.agents);
    }
    if (data.mode) {
      this.currentMode = data.mode.mode;
      this.updateModeUI();
    }
  }

  handleRoutes(data) {
    this.routes.clear();
    
    if (Array.isArray(data)) {
      for (const route of data) {
        this.routes.set(route.routePath, route);
      }
    }
    
    this.renderRoutes();
    this.updateStats();
  }

  handleRouteAnalysis(data) {
    if (data.routePath) {
      this.routes.set(data.routePath, data);
      this.renderRoutes();
      this.updateStats();
      
      this.addActivity('visual-analysis', 'success', 
        `Analyzed ${data.routePath}: ${data.scores?.overall || 0}/100`);
    }
  }

  handleAgentActivity(data) {
    this.addActivity(data.agent, data.level, data.message);
    this.updateAgentNodeStatus(data.agent, data.level === 'error' ? 'error' : 'active');
    
    // Reset status after a delay
    setTimeout(() => {
      this.updateAgentNodeStatus(data.agent, 'idle');
    }, 2000);
  }

  handlePromptGenerated(data) {
    this.showPromptInModal(data.prompt);
    this.currentPromptData = data;
  }

  handleModeChanged(data) {
    this.currentMode = data.to;
    this.updateModeUI();
    this.showToast('info', 'Mode Changed', `Now in ${data.to} mode`);
  }

  handleFixCompleted(data) {
    this.showToast('success', 'Fix Applied', data.issue?.title || 'Fix completed successfully');
    this.closeModal();
  }

  handleFixFailed(data) {
    this.showToast('error', 'Fix Failed', data.result?.error || 'Unknown error');
  }

  handleInsights(data) {
    this.renderInsights(data);
  }

  // ============================================
  // Scanning
  // ============================================

  startScan() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.showToast('error', 'Not Connected', 'Waiting for connection...');
      return;
    }
    
    this.ws.send(JSON.stringify({ type: 'scan-all' }));
  }

  showScanningOverlay(data) {
    this.scanningOverlay.classList.add('active');
    this.scanningStatus.textContent = 'Capturing screenshots...';
    this.scanningProgress.style.width = '0%';
    this.scanningDetail.textContent = '';
  }

  updateScanProgress(data) {
    const { current, total, routePath } = data;
    const percent = Math.round((current / total) * 100);
    
    this.scanningProgress.style.width = `${percent}%`;
    this.scanningStatus.textContent = `Analyzing routes (${current}/${total})`;
    this.scanningDetail.textContent = routePath || '';
  }

  hideScanningOverlay() {
    this.scanningOverlay.classList.remove('active');
  }

  refresh() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'get-routes' }));
      this.ws.send(JSON.stringify({ type: 'get-status' }));
    }
  }

  // ============================================
  // Route Rendering
  // ============================================

  renderRoutes() {
    const routesArray = Array.from(this.routes.values());
    
    // Show empty state if no routes
    if (routesArray.length === 0) {
      this.emptyState.style.display = 'flex';
      // Clear any existing cards
      const cards = this.routeGrid.querySelectorAll('.route-card');
      cards.forEach(card => card.remove());
      return;
    }
    
    this.emptyState.style.display = 'none';
    
    // Sort routes
    const sortValue = this.sortBy?.value || 'score-asc';
    const filtered = this.filterRoutes(routesArray);
    const sorted = this.sortRoutes(filtered, sortValue);
    
    // Clear existing cards
    const existingCards = this.routeGrid.querySelectorAll('.route-card');
    existingCards.forEach(card => card.remove());
    
    // Render cards
    for (const route of sorted) {
      const card = this.createRouteCard(route);
      this.routeGrid.appendChild(card);
    }
  }

  filterRoutes(routes) {
    const severity = this.filterSeverity?.value;
    
    if (!severity) return routes;
    
    return routes.filter(route => {
      const suggestions = route.suggestions || [];
      return suggestions.some(s => s.severity === severity);
    });
  }

  sortRoutes(routes, sortValue) {
    return [...routes].sort((a, b) => {
      switch (sortValue) {
        case 'score-asc':
          return (a.scores?.overall || 0) - (b.scores?.overall || 0);
        case 'score-desc':
          return (b.scores?.overall || 0) - (a.scores?.overall || 0);
        case 'issues':
          return (b.suggestions?.length || 0) - (a.suggestions?.length || 0);
        case 'name':
          return a.routePath.localeCompare(b.routePath);
        default:
          return 0;
      }
    });
  }

  createRouteCard(route) {
    const card = document.createElement('div');
    card.className = 'route-card';
    card.dataset.route = route.routePath;
    
    const score = route.scores?.overall || 0;
    const grade = route.scores?.grade || this.getGrade(score);
    const issues = route.suggestions?.filter(s => s.type === 'issue') || [];
    const features = route.suggestions?.filter(s => s.type === 'feature') || [];
    
    card.innerHTML = `
      <!-- Header -->
      <div class="card-header">
        <div class="card-header-left">
          <div class="grade-badge grade-${grade.toLowerCase()}">${grade}</div>
          <div>
            <div class="card-title">${route.routePath}</div>
            <div class="card-meta">
              <span class="card-score ${this.getScoreClass(score)}">${score}/100</span>
              <span>•</span>
              <span>${issues.length} issues</span>
              <span>•</span>
              <span>${features.length} ideas</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-icon-only" data-action="refresh" title="Refresh">🔄</button>
        </div>
      </div>
      
      <!-- Screenshot -->
      <div class="card-screenshot">
        ${route.screenshots?.desktop 
          ? `<img class="screenshot-img" src="data:image/png;base64,${route.screenshots.desktop.replace(/^data:image\/\w+;base64,/, '')}" alt="${route.routePath}">`
          : `<div class="screenshot-placeholder">
              <span class="screenshot-placeholder-icon">📸</span>
              <span class="screenshot-placeholder-text">No screenshot yet</span>
            </div>`
        }
        
        ${route.screenshots ? `
          <div class="viewport-toggle">
            <button class="viewport-btn active" data-viewport="desktop">🖥️</button>
            <button class="viewport-btn" data-viewport="mobile">📱</button>
          </div>
        ` : ''}
        
        ${route.scores?.breakdown ? `
          <div class="score-overlay">
            ${Object.entries(route.scores.breakdown).slice(0, 4).map(([key, value]) => `
              <div class="score-item">
                <div class="score-item-value ${this.getScoreClass(value)}">${value}</div>
                <div class="score-item-label">${key.slice(0, 8)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
      
      ${route.history?.length > 1 ? `
        <div class="version-history">
          <span class="version-history-label">📈</span>
          <div class="version-dots">
            ${route.history.slice(-4).map((v, i, arr) => `
              <span class="version-dot ${i === arr.length - 1 ? 'current' : ''}">${v.scores?.overall || v.score || '?'}</span>
              ${i < arr.length - 1 ? '<span class="version-arrow">→</span>' : ''}
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <!-- Suggestions -->
      <div class="card-suggestions">
        <div class="suggestions-header">Click to send to agent:</div>
        <div class="suggestions-list">
          ${(route.suggestions || []).slice(0, 5).map(s => this.createSuggestionHTML(s)).join('')}
        </div>
        ${(route.suggestions?.length || 0) > 5 ? `
          <button class="show-more-btn" data-action="expand">
            Show ${route.suggestions.length - 5} more
          </button>
        ` : ''}
      </div>
    `;
    
    // Bind card events
    this.bindCardEvents(card, route);
    
    return card;
  }

  createSuggestionHTML(suggestion) {
    const categoryIcons = {
      ui: '🎨', ux: '👆', a11y: '♿', perf: '⚡', code: '🔧', feature: '🚀'
    };
    const severityIcons = {
      error: '🔴', warning: '🟡', info: '🔵', enhancement: '✨'
    };
    
    return `
      <button class="suggestion-item" data-suggestion-id="${suggestion.id}">
        <span class="suggestion-icon">${categoryIcons[suggestion.category] || '📋'}</span>
        <div class="suggestion-content">
          <div class="suggestion-header">
            <span class="suggestion-severity">${severityIcons[suggestion.severity] || '📋'}</span>
            <span class="suggestion-title">${suggestion.title}</span>
          </div>
          <div class="suggestion-description">${suggestion.description}</div>
        </div>
        <span class="suggestion-action">Fix →</span>
      </button>
    `;
  }

  bindCardEvents(card, route) {
    // Viewport toggle
    const viewportBtns = card.querySelectorAll('.viewport-btn');
    viewportBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewportBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const viewport = btn.dataset.viewport;
        const img = card.querySelector('.screenshot-img');
        if (img && route.screenshots?.[viewport]) {
          img.src = `data:image/png;base64,${route.screenshots[viewport].replace(/^data:image\/\w+;base64,/, '')}`;
        }
      });
    });
    
    // Suggestion clicks
    const suggestionItems = card.querySelectorAll('.suggestion-item');
    suggestionItems.forEach(item => {
      item.addEventListener('click', () => {
        const suggestionId = item.dataset.suggestionId;
        const suggestion = route.suggestions?.find(s => s.id === suggestionId);
        if (suggestion) {
          this.handleSuggestionClick(suggestion, route.routePath);
        }
      });
    });
    
    // Show more
    const showMoreBtn = card.querySelector('[data-action="expand"]');
    showMoreBtn?.addEventListener('click', () => {
      card.classList.toggle('expanded');
      const suggestionsList = card.querySelector('.suggestions-list');
      if (card.classList.contains('expanded')) {
        suggestionsList.innerHTML = (route.suggestions || [])
          .map(s => this.createSuggestionHTML(s))
          .join('');
        showMoreBtn.textContent = 'Show less';
        // Re-bind events for new suggestions
        const newItems = suggestionsList.querySelectorAll('.suggestion-item');
        newItems.forEach(item => {
          item.addEventListener('click', () => {
            const suggestionId = item.dataset.suggestionId;
            const suggestion = route.suggestions?.find(s => s.id === suggestionId);
            if (suggestion) {
              this.handleSuggestionClick(suggestion, route.routePath);
            }
          });
        });
      } else {
        suggestionsList.innerHTML = (route.suggestions || [])
          .slice(0, 5)
          .map(s => this.createSuggestionHTML(s))
          .join('');
        showMoreBtn.textContent = `Show ${route.suggestions.length - 5} more`;
      }
    });
    
    // Refresh
    const refreshBtn = card.querySelector('[data-action="refresh"]');
    refreshBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'refresh-route',
          data: { routePath: route.routePath }
        }));
        this.showToast('info', 'Refreshing', `Re-analyzing ${route.routePath}`);
      }
    });
  }

  // ============================================
  // Suggestion Handling
  // ============================================

  handleSuggestionClick(suggestion, routePath) {
    this.openModal(suggestion);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'route-suggestion',
        data: { suggestion, routePath }
      }));
    }
  }

  openModal(suggestion) {
    this.currentSuggestion = suggestion;
    
    const isFeature = suggestion.type === 'feature';
    this.modalIcon.textContent = isFeature ? '🚀' : '🔧';
    this.modalTitle.textContent = isFeature ? 'Implement Feature' : 'Fix Issue';
    this.modalSubtitle.textContent = suggestion.title;
    
    this.modalLoading.style.display = 'flex';
    this.modalPrompt.style.display = 'none';
    this.modalFooter.style.display = 'none';
    
    this.promptModal.classList.add('active');
  }

  showPromptInModal(prompt) {
    this.promptCode.textContent = prompt;
    
    this.modalLoading.style.display = 'none';
    this.modalPrompt.style.display = 'block';
    this.modalFooter.style.display = 'flex';
  }

  closeModal() {
    this.promptModal.classList.remove('active');
    this.currentSuggestion = null;
    this.currentPromptData = null;
  }

  copyPrompt() {
    const prompt = this.promptCode.textContent;
    navigator.clipboard.writeText(prompt).then(() => {
      this.showToast('success', 'Copied', 'Prompt copied to clipboard');
    });
  }

  applyFix() {
    if (!this.currentPromptData || !this.ws) return;
    
    this.ws.send(JSON.stringify({
      type: 'apply-fix',
      data: this.currentPromptData
    }));
    
    this.showToast('info', 'Applying Fix', 'Sending to Claude Code...');
  }

  // ============================================
  // Mode Management
  // ============================================

  setMode(mode) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'set-mode',
        data: { mode }
      }));
    }
  }

  updateModeUI() {
    this.modeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
    });
  }

  // ============================================
  // Agent Status
  // ============================================

  updateAgentStatus(agents) {
    for (const [name, status] of Object.entries(agents)) {
      this.updateAgentNodeStatus(name, status.status || 'idle');
    }
  }

  updateAgentNodeStatus(agentName, status) {
    const node = document.querySelector(`.agent-node[data-agent="${agentName}"]`);
    if (node) {
      node.dataset.status = status;
      const statusEl = node.querySelector('.agent-status');
      if (statusEl) {
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      }
    }
  }

  // ============================================
  // Activity Log
  // ============================================

  addActivity(agent, level, message) {
    const activity = {
      agent,
      level,
      message,
      timestamp: Date.now()
    };
    
    this.activityLog.unshift(activity);
    
    // Keep bounded
    if (this.activityLog.length > 50) {
      this.activityLog = this.activityLog.slice(0, 50);
    }
    
    this.renderActivityLog();
  }

  renderActivityLog() {
    if (this.activityLog.length === 0) {
      this.activityLogEl.innerHTML = `
        <div class="activity-empty">
          <span class="activity-empty-icon">📋</span>
          <p>Agent activity will appear here</p>
        </div>
      `;
      return;
    }
    
    const levelIcons = {
      info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌'
    };
    
    this.activityLogEl.innerHTML = this.activityLog.slice(0, 20).map(a => `
      <div class="activity-item">
        <span class="activity-icon">${levelIcons[a.level] || '📝'}</span>
        <div class="activity-content">
          <span class="activity-agent">${a.agent}</span>
          <span class="activity-message">${a.message}</span>
        </div>
        <span class="activity-time">${this.formatTime(a.timestamp)}</span>
      </div>
    `).join('');
  }

  // ============================================
  // Insights
  // ============================================

  renderInsights(insights) {
    if (!insights || insights.length === 0) {
      this.insightsList.innerHTML = '<p class="activity-empty">No insights yet</p>';
      return;
    }
    
    this.insightsList.innerHTML = insights.map(i => `
      <div class="insight-item">${i.text}</div>
    `).join('');
  }

  // ============================================
  // Stats
  // ============================================

  updateStats() {
    const routesArray = Array.from(this.routes.values());
    
    const totalRoutes = routesArray.length;
    const totalIssues = routesArray.reduce((sum, r) => 
      sum + (r.suggestions?.filter(s => s.type === 'issue').length || 0), 0);
    const totalFeatures = routesArray.reduce((sum, r) =>
      sum + (r.suggestions?.filter(s => s.type === 'feature').length || 0), 0);
    const avgScore = totalRoutes > 0
      ? Math.round(routesArray.reduce((sum, r) => sum + (r.scores?.overall || 0), 0) / totalRoutes)
      : 0;
    
    this.statRoutes.textContent = totalRoutes;
    this.statIssues.textContent = totalIssues;
    this.statFeatures.textContent = totalFeatures;
    this.statScore.textContent = avgScore;
  }

  // ============================================
  // Utilities
  // ============================================

  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  getScoreClass(score) {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-mid';
    return 'score-low';
  }

  formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }

  showToast(type, title, message) {
    const icons = {
      success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;
    
    this.toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new VisualIntelligenceDashboard();
});
