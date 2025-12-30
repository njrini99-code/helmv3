/**
 * Ship Command Hub v6 - Path Scanner App
 * 
 * Complete path-by-path analysis with:
 * - Full path browser
 * - Issues, UI enhancements, Feature enhancements (color coded)
 * - Screenshot integration
 * - Neural wire visualization
 * - MD queue for copy/paste to Cursor
 * - Continuous improvement agent
 */

class ShipCommandV6 {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.paths = new Map();
    this.selectedPath = null;
    this.mdQueue = [];
    this.currentIssue = null;
    
    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.connect();
  }

  bindElements() {
    // Header
    this.connectionStatus = document.getElementById('connection-status');
    this.scanStatus = document.getElementById('scan-status');
    this.btnFullScan = document.getElementById('btn-full-scan');
    
    // Path browser
    this.pathList = document.getElementById('path-list');
    this.pathCount = document.getElementById('path-count');
    this.statTotal = document.getElementById('stat-total');
    this.statIssues = document.getElementById('stat-issues');
    this.statUi = document.getElementById('stat-ui');
    this.statFeatures = document.getElementById('stat-features');
    
    // Path detail
    this.detailEmpty = document.getElementById('detail-empty');
    this.detailContent = document.getElementById('detail-content');
    this.detailPathName = document.getElementById('detail-path-name');
    this.screenshotContainer = document.getElementById('screenshot-container');
    this.screenshotPlaceholder = document.getElementById('screenshot-placeholder');
    this.screenshotImage = document.getElementById('screenshot-image');
    this.screenshotMeta = document.getElementById('screenshot-meta');
    
    // Issue lists
    this.listIssues = document.getElementById('list-issues');
    this.listUi = document.getElementById('list-ui');
    this.listFeatures = document.getElementById('list-features');
    this.countIssues = document.getElementById('count-issues');
    this.countUi = document.getElementById('count-ui');
    this.countFeatures = document.getElementById('count-features');
    
    // Buttons
    this.btnUploadScreenshot = document.getElementById('btn-upload-screenshot');
    this.btnCaptureScreenshot = document.getElementById('btn-capture-screenshot');
    this.btnContinuousImprovement = document.getElementById('btn-continuous-improvement');
    this.screenshotInput = document.getElementById('screenshot-input');
    
    // Neural wire
    this.liveFeed = document.getElementById('live-feed');
    
    // MD Queue
    this.mdQueueEl = document.getElementById('md-queue');
    this.mdQueueCount = document.getElementById('md-queue-count');
    
    // Modals
    this.issueModal = document.getElementById('issue-modal');
    this.mdModal = document.getElementById('md-modal');
    this.ciModal = document.getElementById('ci-modal');
  }

  bindEvents() {
    // Full scan
    this.btnFullScan.addEventListener('click', () => this.runFullScan());
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.filterPaths(e.target.dataset.filter));
    });
    
    // Screenshot upload
    this.btnUploadScreenshot?.addEventListener('click', () => this.screenshotInput.click());
    this.btnCaptureScreenshot?.addEventListener('click', () => this.screenshotInput.click());
    this.screenshotInput.addEventListener('change', (e) => this.handleScreenshotUpload(e));
    
    // Continuous improvement
    this.btnContinuousImprovement?.addEventListener('click', () => this.startContinuousImprovement());
    
    // Issue modal
    document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal('issue'));
    document.getElementById('btn-skip')?.addEventListener('click', () => this.closeModal('issue'));
    document.getElementById('btn-send-to-agents')?.addEventListener('click', () => this.sendToAgents());
    
    // MD modal
    document.getElementById('md-modal-close')?.addEventListener('click', () => this.closeModal('md'));
    document.getElementById('btn-copy-md')?.addEventListener('click', () => this.copyMdToClipboard());
    document.getElementById('btn-done-md')?.addEventListener('click', () => this.markMdDone());
    
    // CI modal
    document.getElementById('ci-modal-close')?.addEventListener('click', () => this.closeModal('ci'));
    document.getElementById('btn-ci-skip')?.addEventListener('click', () => this.skipContinuousImprovement());
    document.getElementById('btn-ci-send')?.addEventListener('click', () => this.sendCiToAgents());
    
    // Modal backdrops
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        this.closeModal('issue');
        this.closeModal('md');
        this.closeModal('ci');
      });
    });
  }

  // ===========================================
  // WEBSOCKET CONNECTION
  // ===========================================

  connect() {
    // WebSocket on port 3334, HTTP on 3333
    const wsUrl = `ws://${window.location.hostname}:3334`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      this.connected = true;
      this.updateConnectionStatus(true);
      this.addFeedItem('system', 'Connected to Ship Command Hub', '🔌');
    };
    
    this.ws.onclose = () => {
      this.connected = false;
      this.updateConnectionStatus(false);
      setTimeout(() => this.connect(), 3000);
    };
    
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };
  }

  send(type, data = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'paths':
        this.handlePaths(msg.data);
        break;
      case 'path-analysis':
        this.handlePathAnalysis(msg.data);
        break;
      case 'agent-activity':
        this.handleAgentActivity(msg.data);
        break;
      case 'md-generated':
        this.handleMdGenerated(msg.data);
        break;
      case 'ci-result':
        this.handleCiResult(msg.data);
        break;
      case 'scan-progress':
        this.handleScanProgress(msg.data);
        break;
      case 'scan-complete':
        this.handleScanComplete(msg.data);
        break;
    }
  }

  updateConnectionStatus(connected) {
    const dot = this.connectionStatus.querySelector('.status-dot');
    const text = this.connectionStatus.querySelector('.status-text');
    
    if (connected) {
      dot.classList.add('connected');
      text.textContent = 'Connected';
    } else {
      dot.classList.remove('connected');
      text.textContent = 'Disconnected';
    }
  }

  // ===========================================
  // FULL SCAN
  // ===========================================

  runFullScan() {
    this.btnFullScan.disabled = true;
    this.btnFullScan.innerHTML = '<span>⏳</span> Scanning...';
    this.updateScanStatus('scanning', 'Discovering all paths...');
    
    this.send('full-scan');
    this.addFeedItem('coordinator', 'Initiating full project scan', '🎯');
    this.pulseAgent('coordinator');
  }

  handleScanProgress(data) {
    this.updateScanStatus('scanning', data.message || 'Analyzing...');
    
    if (data.agent) {
      this.pulseAgent(data.agent);
      this.addFeedItem(data.agent, data.message, this.getAgentIcon(data.agent));
    }
  }

  handleScanComplete(data) {
    this.btnFullScan.disabled = false;
    this.btnFullScan.innerHTML = '<span>🔍</span> Full Project Scan';
    this.updateScanStatus('complete', `Scan complete: ${data.pathCount || 0} paths`);
    
    this.addFeedItem('coordinator', `Scan complete! Found ${data.pathCount} paths`, '✅');
  }

  updateScanStatus(state, message) {
    const icon = this.scanStatus.querySelector('.status-icon');
    const text = this.scanStatus.querySelector('.status-text');
    
    const icons = {
      ready: '⏳',
      scanning: '🔄',
      complete: '✅',
    };
    
    icon.textContent = icons[state] || '⏳';
    text.textContent = message;
  }

  // ===========================================
  // PATH HANDLING
  // ===========================================

  handlePaths(paths) {
    this.paths.clear();
    
    paths.forEach(path => {
      this.paths.set(path.route, path);
    });
    
    this.renderPathList();
    this.updateStats();
  }

  handlePathAnalysis(data) {
    const existing = this.paths.get(data.route);
    if (existing) {
      // Preserve screenshot and code from existing
      data.screenshot = data.screenshot || existing.screenshot;
      data.code = data.code || existing.code;
      Object.assign(existing, data);
    } else {
      this.paths.set(data.route, data);
    }
    
    this.renderPathList();
    this.updateStats();
    
    // Update detail view if this is the selected path
    if (this.selectedPath === data.route) {
      this.renderPathDetail(this.paths.get(data.route));
    }
  }

  renderPathList() {
    if (this.paths.size === 0) {
      this.pathList.innerHTML = `
        <div class="empty-state">
          <span>📂</span>
          <p>Click "Full Project Scan" to discover all paths</p>
        </div>
      `;
      return;
    }
    
    const sortedPaths = Array.from(this.paths.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    this.pathList.innerHTML = sortedPaths.map(([route, data]) => {
      const issueCount = data.issues?.length || 0;
      const uiCount = data.uiEnhancements?.length || 0;
      const featureCount = data.featureEnhancements?.length || 0;
      
      const badges = [];
      if (issueCount > 0) badges.push(`<span class="path-badge issues">${issueCount} issues</span>`);
      if (uiCount > 0) badges.push(`<span class="path-badge ui">${uiCount} UI</span>`);
      if (featureCount > 0) badges.push(`<span class="path-badge features">${featureCount} features</span>`);
      
      return `
        <div class="path-item ${this.selectedPath === route ? 'active' : ''}" data-route="${route}">
          <div class="path-item-name">${route}</div>
          <div class="path-item-badges">${badges.join('')}</div>
        </div>
      `;
    }).join('');
    
    // Bind click events
    this.pathList.querySelectorAll('.path-item').forEach(item => {
      item.addEventListener('click', () => this.selectPath(item.dataset.route));
    });
    
    this.pathCount.textContent = this.paths.size;
  }

  filterPaths(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    this.pathList.querySelectorAll('.path-item').forEach(item => {
      const route = item.dataset.route;
      const data = this.paths.get(route);
      
      let show = true;
      if (filter === 'issues') show = (data?.issues?.length || 0) > 0;
      else if (filter === 'ui') show = (data?.uiEnhancements?.length || 0) > 0;
      else if (filter === 'features') show = (data?.featureEnhancements?.length || 0) > 0;
      
      item.style.display = show ? '' : 'none';
    });
  }

  updateStats() {
    let totalIssues = 0;
    let totalUi = 0;
    let totalFeatures = 0;
    
    this.paths.forEach(data => {
      totalIssues += data.issues?.length || 0;
      totalUi += data.uiEnhancements?.length || 0;
      totalFeatures += data.featureEnhancements?.length || 0;
    });
    
    this.statTotal.textContent = this.paths.size;
    this.statIssues.textContent = totalIssues;
    this.statUi.textContent = totalUi;
    this.statFeatures.textContent = totalFeatures;
  }

  // ===========================================
  // PATH DETAIL VIEW
  // ===========================================

  selectPath(route) {
    this.selectedPath = route;
    const data = this.paths.get(route);
    
    // Update active state
    this.pathList.querySelectorAll('.path-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });
    
    // Show detail view
    this.detailEmpty.style.display = 'none';
    this.detailContent.style.display = 'block';
    
    // Request full analysis if not already done
    if (!data.analyzed) {
      this.send('analyze-path', { route });
      this.addFeedItem('coordinator', `Analyzing ${route}`, '🔍');
    }
    
    this.renderPathDetail(data);
  }

  renderPathDetail(data) {
    this.detailPathName.textContent = data.route;
    
    // Screenshot
    if (data.screenshot) {
      this.screenshotPlaceholder.style.display = 'none';
      this.screenshotImage.src = data.screenshot;
      this.screenshotImage.style.display = 'block';
      this.screenshotMeta.innerHTML = `<span>Last captured: ${this.timeAgo(data.screenshotTime)}</span>`;
    } else {
      this.screenshotPlaceholder.style.display = 'flex';
      this.screenshotImage.style.display = 'none';
      this.screenshotMeta.innerHTML = '<span>No screenshot yet</span>';
    }
    
    // Issues (Red)
    this.renderCategoryList(this.listIssues, this.countIssues, data.issues || [], 'issues');
    
    // UI Enhancements (Yellow)
    this.renderCategoryList(this.listUi, this.countUi, data.uiEnhancements || [], 'ui');
    
    // Feature Enhancements (Green)
    this.renderCategoryList(this.listFeatures, this.countFeatures, data.featureEnhancements || [], 'features');
  }

  renderCategoryList(listEl, countEl, items, type) {
    countEl.textContent = items.length;
    
    if (items.length === 0) {
      const emptyMessages = {
        issues: 'No issues found ✓',
        ui: 'No UI enhancements needed',
        features: 'No feature opportunities yet',
      };
      listEl.innerHTML = `<div class="category-empty">${emptyMessages[type]}</div>`;
      return;
    }
    
    listEl.innerHTML = items.map((item, index) => `
      <div class="category-item" data-type="${type}" data-index="${index}">
        <div class="category-item-title">${item.title}</div>
        <div class="category-item-desc">${item.summary || item.description || ''}</div>
      </div>
    `).join('');
    
    // Bind click events
    listEl.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('click', () => {
        this.showIssueModal(item.dataset.type, parseInt(item.dataset.index));
      });
    });
  }

  // ===========================================
  // SCREENSHOT HANDLING
  // ===========================================

  handleScreenshotUpload(event) {
    const file = event.target.files[0];
    if (!file || !this.selectedPath) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      
      // Update local display
      this.screenshotPlaceholder.style.display = 'none';
      this.screenshotImage.src = base64;
      this.screenshotImage.style.display = 'block';
      this.screenshotMeta.innerHTML = `<span>Just uploaded</span>`;
      
      // Send to server
      this.send('upload-screenshot', {
        route: this.selectedPath,
        screenshot: base64,
      });
      
      // Update local data
      const data = this.paths.get(this.selectedPath);
      if (data) {
        data.screenshot = base64;
        data.screenshotTime = Date.now();
      }
      
      this.addFeedItem('ui-review', `Screenshot uploaded for ${this.selectedPath}`, '📸');
    };
    reader.readAsDataURL(file);
    
    // Reset input
    event.target.value = '';
  }

  // ===========================================
  // ISSUE MODAL
  // ===========================================

  showIssueModal(type, index) {
    const data = this.paths.get(this.selectedPath);
    if (!data) return;
    
    let items;
    switch (type) {
      case 'issues': items = data.issues; break;
      case 'ui': items = data.uiEnhancements; break;
      case 'features': items = data.featureEnhancements; break;
    }
    
    const item = items?.[index];
    if (!item) return;
    
    this.currentIssue = { type, index, item, route: this.selectedPath };
    
    // Update modal content
    const modalType = document.getElementById('modal-type');
    modalType.className = `modal-type ${type}`;
    modalType.querySelector('.type-label').textContent = 
      type === 'issues' ? 'Issue' : type === 'ui' ? 'UI Enhancement' : 'Feature';
    
    document.getElementById('modal-title').textContent = item.title;
    document.getElementById('modal-summary').textContent = item.summary || item.description || 'No summary available';
    document.getElementById('modal-why').textContent = item.why || item.reason || 'This affects user experience and code quality';
    document.getElementById('modal-result').textContent = item.result || item.benefit || 'Improved functionality and user experience';
    
    // Screenshot
    const screenshotSection = document.getElementById('modal-screenshot-section');
    if (data.screenshot) {
      screenshotSection.style.display = 'block';
      document.getElementById('modal-screenshot').src = data.screenshot;
    } else {
      screenshotSection.style.display = 'none';
    }
    
    this.openModal('issue');
  }

  // ===========================================
  // SEND TO AGENTS
  // ===========================================

  sendToAgents() {
    if (!this.currentIssue) return;
    
    const { type, item, route } = this.currentIssue;
    const data = this.paths.get(route);
    
    this.closeModal('issue');
    
    // Animate neural pathway
    this.animateNeuralPath(type);
    
    // Add to feed
    this.addFeedItem('coordinator', `Received: ${item.title}`, '📥');
    
    // Send to server
    this.send('send-to-agents', {
      type,
      issue: item,
      route,
      screenshot: data?.screenshot,
      code: data?.code,
    });
    
    // Pulse agents
    setTimeout(() => {
      this.pulseAgent('coordinator');
      this.addFeedItem('coordinator', 'Dispatching to specialized agents...', '🎯');
    }, 500);
    
    setTimeout(() => {
      if (type === 'issues') {
        this.pulseAgent('code-quality');
        this.addFeedItem('code-quality', 'Analyzing code patterns', '🔍');
      } else if (type === 'ui') {
        this.pulseAgent('design-system');
        this.pulseAgent('ui-review');
        this.addFeedItem('design-system', 'Checking design system compliance', '🎨');
      } else {
        this.pulseAgent('route-context');
        this.addFeedItem('route-context', 'Evaluating feature context', '🗺️');
      }
    }, 1000);
    
    setTimeout(() => {
      this.pulseAgent('improvement');
      this.addFeedItem('improvement', 'Generating detailed implementation...', '🧠');
    }, 2000);
  }

  // ===========================================
  // MD QUEUE
  // ===========================================

  handleMdGenerated(data) {
    this.mdQueue.push(data);
    this.renderMdQueue();
    
    this.addFeedItem('improvement', `MD ready: ${data.title}`, '📝');
    
    // Auto-open the modal
    this.showMdModal(this.mdQueue.length - 1);
  }

  renderMdQueue() {
    this.mdQueueCount.textContent = this.mdQueue.length;
    
    if (this.mdQueue.length === 0) {
      this.mdQueueEl.innerHTML = `
        <div class="queue-empty">
          <span>📝</span>
          <p>No MDs ready</p>
        </div>
      `;
      return;
    }
    
    this.mdQueueEl.innerHTML = this.mdQueue.map((item, index) => `
      <div class="queue-item" data-index="${index}">
        <div class="queue-item-title">${item.title}</div>
        <div class="queue-item-path">${item.route}</div>
        <span class="queue-item-type ${item.type}">${item.type}</span>
      </div>
    `).join('');
    
    // Bind click events
    this.mdQueueEl.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('click', () => {
        this.showMdModal(parseInt(item.dataset.index));
      });
    });
  }

  showMdModal(index) {
    const item = this.mdQueue[index];
    if (!item) return;
    
    this.currentMdIndex = index;
    document.getElementById('md-content').textContent = item.content;
    this.openModal('md');
  }

  copyMdToClipboard() {
    const content = document.getElementById('md-content').textContent;
    navigator.clipboard.writeText(content).then(() => {
      const btn = document.getElementById('btn-copy-md');
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.innerHTML = '📋 Copy to Clipboard';
      }, 2000);
    });
  }

  markMdDone() {
    // Remove from queue
    this.mdQueue.splice(this.currentMdIndex, 1);
    this.renderMdQueue();
    this.closeModal('md');
    
    this.addFeedItem('system', 'MD completed, moving to next...', '✅');
    
    // If there are more in queue, show the next one
    if (this.mdQueue.length > 0) {
      setTimeout(() => this.showMdModal(0), 500);
    }
  }

  // ===========================================
  // CONTINUOUS IMPROVEMENT
  // ===========================================

  startContinuousImprovement() {
    if (!this.selectedPath) return;
    
    this.openModal('ci');
    document.getElementById('ci-scanning').style.display = 'flex';
    document.getElementById('ci-result').style.display = 'none';
    
    const data = this.paths.get(this.selectedPath);
    
    this.send('continuous-improvement', {
      route: this.selectedPath,
      screenshot: data?.screenshot,
      code: data?.code,
    });
    
    this.pulseAgent('continuous');
    this.addFeedItem('continuous', `Starting CI scan on ${this.selectedPath}`, '🔄');
  }

  handleCiResult(data) {
    document.getElementById('ci-scanning').style.display = 'none';
    document.getElementById('ci-result').style.display = 'block';
    
    const ciType = document.getElementById('ci-type');
    ciType.className = `ci-type ${data.type}`;
    ciType.querySelector('.type-label').textContent = 
      data.type === 'ui' ? 'UI Improvement' : 'Feature Enhancement';
    
    document.getElementById('ci-title').textContent = data.title;
    document.getElementById('ci-description').textContent = data.description;
    document.getElementById('ci-impact-fill').style.width = `${data.impact || 70}%`;
    document.getElementById('ci-impact-label').textContent = 
      data.impact > 80 ? 'High' : data.impact > 50 ? 'Medium' : 'Low';
    
    this.currentCiResult = data;
  }

  skipContinuousImprovement() {
    // Request another improvement
    document.getElementById('ci-scanning').style.display = 'flex';
    document.getElementById('ci-result').style.display = 'none';
    
    const data = this.paths.get(this.selectedPath);
    
    this.send('continuous-improvement-next', {
      route: this.selectedPath,
      skip: this.currentCiResult?.id,
      screenshot: data?.screenshot,
    });
    
    this.addFeedItem('continuous', 'Skipping, finding another improvement...', '⏭️');
  }

  sendCiToAgents() {
    if (!this.currentCiResult) return;
    
    this.closeModal('ci');
    
    // Convert to issue format and send
    this.currentIssue = {
      type: this.currentCiResult.type,
      item: this.currentCiResult,
      route: this.selectedPath,
    };
    
    this.sendToAgents();
  }

  // ===========================================
  // NEURAL WIRE ANIMATION
  // ===========================================

  pulseAgent(agentId) {
    const node = document.getElementById(`node-${agentId}`);
    if (!node) return;
    
    node.classList.add('active');
    setTimeout(() => node.classList.remove('active'), 2000);
  }

  animateNeuralPath(type) {
    const paths = {
      issues: ['wire-coord-code'],
      ui: ['wire-coord-design', 'wire-design-improve'],
      features: ['wire-coord-route', 'wire-route-ui'],
    };
    
    const gradient = {
      issues: 'active-issue',
      ui: 'active-ui',
      features: 'active-feature',
    };
    
    const pathIds = paths[type] || [];
    
    pathIds.forEach((id, index) => {
      setTimeout(() => {
        const path = document.getElementById(id);
        if (path) {
          path.classList.add('active', gradient[type]);
          setTimeout(() => {
            path.classList.remove('active', gradient[type]);
          }, 2000);
        }
      }, index * 300);
    });
  }

  // ===========================================
  // MODAL HELPERS
  // ===========================================

  openModal(type) {
    const modal = document.getElementById(`${type}-modal`);
    if (modal) modal.classList.add('open');
  }

  closeModal(type) {
    const modal = document.getElementById(`${type}-modal`);
    if (modal) modal.classList.remove('open');
  }

  // ===========================================
  // FEED & UTILITIES
  // ===========================================

  addFeedItem(source, text, icon = '📡') {
    const feedEmpty = this.liveFeed.querySelector('.feed-empty');
    if (feedEmpty) feedEmpty.remove();
    
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
      <span class="feed-icon">${icon}</span>
      <span class="feed-text">${text}</span>
      <span class="feed-time">${this.timeAgo(Date.now())}</span>
    `;
    
    this.liveFeed.insertBefore(item, this.liveFeed.firstChild);
    
    // Keep only last 20 items
    while (this.liveFeed.children.length > 20) {
      this.liveFeed.lastChild.remove();
    }
  }

  getAgentIcon(agentId) {
    const icons = {
      'coordinator': '🎯',
      'code-quality': '🔍',
      'design-system': '🎨',
      'route-context': '🗺️',
      'ui-review': '📸',
      'improvement': '🧠',
      'continuous': '🔄',
      'system': '💻',
    };
    return icons[agentId] || '📡';
  }

  handleAgentActivity(data) {
    const { agent, action, message } = data;
    this.pulseAgent(agent);
    this.addFeedItem(agent, message || action, this.getAgentIcon(agent));
  }

  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.shipCommand = new ShipCommandV6();
});
