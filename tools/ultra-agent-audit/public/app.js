/**
 * Ultra Agent Audit Dashboard
 * 
 * TWO TABS:
 * 1. Route Audit - Click route → analyze → send to agents → MD queue
 * 2. Flow Visualizer - See end-to-end user journeys with live animated wires
 */

class UltraAgentDashboard {
  constructor() {
    this.ws = null;
    this.state = {
      connected: false,
      mode: 'manual',
      routes: [],
      selectedRoute: null,
      analysis: null,
      mdQueue: [],
      agents: [],
      currentIssue: null,
      currentMdId: null,
      activeTab: 'audit',
      flowFilter: 'college-coach',
      routeFilter: 'college-coach', // Add route filter for Route Audit tab
      selectedNode: null,
      flowGraph: null,
      // Store analysis results for each route
      routeAnalyses: new Map(),
      // Track completed MDs and their issues (persisted in localStorage)
      completedMDs: this.loadCompletedMDs(),
    };

    this.init();
  }

  loadCompletedMDs() {
    try {
      const stored = localStorage.getItem('completedMDs');
      return stored ? new Map(JSON.parse(stored)) : new Map();
    } catch (error) {
      console.error('Failed to load completed MDs:', error);
      return new Map();
    }
  }

  saveCompletedMDs() {
    try {
      localStorage.setItem('completedMDs', JSON.stringify([...this.state.completedMDs]));
    } catch (error) {
      console.error('Failed to save completed MDs:', error);
    }
  }

  async init() {
    this.connectWebSocket();
    await this.loadRoutes();
    await this.loadFlowGraph();
    this.setupEventListeners();
    this.renderAgentGrid();
    this.loadMDQueue();
  }

  // ============================================
  // Load Flow Graph from Server
  // ============================================

  async loadFlowGraph() {
    try {
      const response = await fetch('/api/flow-graph');
      this.state.flowGraph = await response.json();
      console.log('Flow graph loaded with', this.state.flowGraph.nodes.length, 'nodes');
      this.renderFlowVisualizer();
      // Re-render route list with role-based filtering now that flowGraph is loaded
      this.renderRouteList();
    } catch (error) {
      console.error('Failed to load flow graph:', error);
      this.state.flowGraph = this.getDefaultFlowGraph();
      this.renderFlowVisualizer();
      this.renderRouteList();
    }
  }

  getDefaultFlowGraph() {
    return {
      nodes: [
        { id: 'home', label: 'Home', path: '/', icon: '🏠', type: 'entry', domain: null, x: 600, y: 50 },
        { id: 'baseball-landing', label: 'Baseball', path: '/baseball', icon: '⚾', type: 'entry', domain: 'baseball', x: 300, y: 180 },
        { id: 'baseball-dashboard', label: 'Dashboard', path: '/baseball/dashboard', icon: '📊', type: 'dashboard', domain: 'baseball', x: 300, y: 320 },
        { id: 'golf-landing', label: 'Golf', path: '/golf', icon: '⛳', type: 'entry', domain: 'golf', x: 900, y: 180 },
        { id: 'golf-dashboard', label: 'Dashboard', path: '/golf/dashboard', icon: '📊', type: 'dashboard', domain: 'golf', x: 900, y: 320 },
      ],
      edges: [
        { from: 'home', to: 'baseball-landing', label: 'Select Baseball' },
        { from: 'home', to: 'golf-landing', label: 'Select Golf' },
        { from: 'baseball-landing', to: 'baseball-dashboard', label: 'Enter App' },
        { from: 'golf-landing', to: 'golf-dashboard', label: 'Enter App' },
      ],
    };
  }

  // ============================================
  // WebSocket
  // ============================================

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      this.state.connected = true;
      this.updateConnectionStatus(true);
    };
    
    this.ws.onclose = () => {
      this.state.connected = false;
      this.updateConnectionStatus(false);
      setTimeout(() => this.connectWebSocket(), 3000);
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'init':
        this.state.agents = message.data.agents || [];
        document.getElementById('total-routes').textContent = message.data.codebase?.routes?.total || 0;
        break;
        
      case 'agent:state':
        this.updateAgentState(message.data);
        break;
        
      case 'route:analyzed':
        this.state.analysis = message.data;
        // Store analysis for this route
        this.state.routeAnalyses.set(message.data.routePath, message.data);
        this.renderRouteDetail(message.data);
        // Update route list to show score
        this.renderRouteList();
        // Update node score in visualizer
        this.updateNodeScore(message.data.routePath, message.data.score);
        break;
        
      case 'md:generated':
        // Only add if not already in queue (prevents duplicate from REST + WebSocket)
        if (!this.state.mdQueue.find(m => m.id === message.data.id)) {
          this.state.mdQueue.unshift(message.data);
          this.renderMDQueue();
        }
        break;
        
      case 'audit:complete':
        alert(`Audit complete! Report saved to: ${message.data.reportPath}`);
        break;
        
      case 'pipeline:complete':
        this.handlePipelineComplete(message.data);
        break;
    }
  }

  // ============================================
  // Data Loading
  // ============================================

  async loadRoutes() {
    try {
      const response = await fetch('/api/routes');
      this.state.routes = await response.json();
      this.renderRouteList();
      document.getElementById('total-routes').textContent = this.state.routes.length;
    } catch (error) {
      console.error('Failed to load routes:', error);
    }
  }

  async loadMDQueue() {
    try {
      const response = await fetch('/api/md-queue');
      this.state.mdQueue = await response.json();
      this.renderMDQueue();
    } catch (error) {
      console.error('Failed to load MD queue:', error);
    }
  }

  // ============================================
  // Event Listeners
  // ============================================

  setupEventListeners() {
    // Main tab switching
    document.querySelectorAll('.main-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    
    // Audit button
    document.getElementById('audit-btn').addEventListener('click', () => this.runFullAudit());
    
    // Filter tabs (route list) - OLD, keeping for backwards compatibility
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderRouteList(tab.dataset.filter);
      });
    });

    // Role filter buttons (Route Audit) - NEW role-based filtering
    const filterButtons = document.querySelectorAll('.filter-btn');
    console.log('Found filter buttons:', filterButtons.length);
    filterButtons.forEach((btn, index) => {
      console.log(`Button ${index}:`, btn.dataset.role);
      btn.addEventListener('click', () => {
        console.log('Filter button clicked:', btn.dataset.role);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.routeFilter = btn.dataset.role;
        this.renderRouteList();
      });
    });

    // Modal close
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', () => this.closeModals());
    });
    
    // Send to agents
    document.getElementById('btn-send-agents').addEventListener('click', () => this.sendToAgents());

    // Mark issue as completed
    document.getElementById('btn-mark-completed').addEventListener('click', () => this.markIssueCompleted());

    // Copy MD
    document.getElementById('btn-copy-md').addEventListener('click', () => this.copyMD());
    
    // Remove MD
    document.getElementById('btn-remove-md').addEventListener('click', () => this.removeMD());
    
    // Visualizer controls
    document.querySelectorAll('.viz-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.flowFilter = btn.dataset.flow;
        this.renderFlowVisualizer();
      });
    });
    
    // Visualizer sidebar close
    document.getElementById('viz-sidebar-close')?.addEventListener('click', () => {
      document.getElementById('visualizer-sidebar').classList.remove('open');
      this.state.selectedNode = null;
      this.renderFlowNodes();
    });
  }

  // ============================================
  // Tab Switching
  // ============================================

  switchTab(tabId) {
    this.state.activeTab = tabId;
    
    // Update tab buttons
    document.querySelectorAll('.main-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
    
    // Re-render visualizer when switching to it
    if (tabId === 'visualizer') {
      this.renderFlowVisualizer();
    }
  }

  // ============================================
  // Actions
  // ============================================

  async selectRoute(routePath) {
    this.state.selectedRoute = routePath;
    
    // Highlight selected
    document.querySelectorAll('.route-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.path === routePath);
    });
    
    // Check if we already have analysis for this route
    const cachedAnalysis = this.state.routeAnalyses.get(routePath);
    if (cachedAnalysis) {
      this.state.analysis = cachedAnalysis;
      this.renderRouteDetail(cachedAnalysis);
      return;
    }
    
    // Show loading
    document.getElementById('route-detail').innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Analyzing route...</p>
      </div>
    `;
    
    // Analyze
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routePath }),
      });
      const analysis = await response.json();
      this.state.analysis = analysis;
      this.state.routeAnalyses.set(routePath, analysis);
      this.renderRouteDetail(analysis);
      this.renderRouteList(); // Update list with new score
    } catch (error) {
      console.error('Failed to analyze:', error);
    }
  }

  async runFullAudit() {
    const btn = document.getElementById('audit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>Running...</span>';
    
    try {
      await fetch('/api/audit', { method: 'POST' });
    } catch (error) {
      console.error('Audit failed:', error);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>📊</span><span>Full Audit</span>';
    }
  }

  showIssueModal(issue, type) {
    this.state.currentIssue = { ...issue, type };
    
    document.getElementById('issue-title').textContent = issue.title;
    document.getElementById('issue-severity').textContent = issue.severity;
    document.getElementById('issue-severity').className = `issue-badge ${issue.severity}`;
    document.getElementById('issue-category').textContent = issue.category || type;
    document.getElementById('issue-description').textContent = issue.description || issue.title;
    document.getElementById('issue-why').textContent = issue.why || 'Improves code quality and user experience.';
    document.getElementById('issue-result').textContent = issue.result || 'Issue resolved with better UX.';
    
    document.getElementById('issue-modal').classList.add('open');
  }

  async sendToAgents() {
    if (!this.state.currentIssue || !this.state.selectedRoute) {
      console.error('No issue or route selected');
      return;
    }
    
    this.closeModals();
    
    try {
      console.log('📤 Sending to agents:', this.state.currentIssue.title);
      
      const response = await fetch('/api/send-to-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: this.state.currentIssue.type,
          issue: this.state.currentIssue,
          route: this.state.selectedRoute,
          code: this.state.analysis?.code || '',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error:', response.status, errorText);
        alert(`Failed to generate MD: ${errorText}`);
        return;
      }
      
      const md = await response.json();
      
      // Check if we got a valid MD back
      if (!md || !md.id) {
        console.error('❌ Invalid MD response:', md);
        alert('Failed to generate MD - invalid response');
        return;
      }

      // Ensure MD has route and issue metadata for completion tracking
      md.route = this.state.selectedRoute;
      md.issue = this.state.currentIssue;

      // Check if not already in queue
      if (!this.state.mdQueue.find(m => m.id === md.id)) {
        this.state.mdQueue.unshift(md);
        this.renderMDQueue();
      }

      console.log(`✅ MD generated and added to queue: ${md.title || 'Implementation guide'}`);

    } catch (error) {
      console.error('❌ Failed to send to agents:', error);
      alert(`Failed to generate MD: ${error.message}`);
    }
  }

  showMDModal(mdId) {
    this.state.currentMdId = mdId;

    // Always fetch full MD content from API (queue only has metadata)
    fetch(`/api/md/${mdId}`)
      .then(r => r.json())
      .then(md => {
        document.getElementById('md-content').textContent = md.content;
        document.getElementById('md-modal').classList.add('open');
      })
      .catch(err => {
        console.error('Failed to load MD:', err);
        document.getElementById('md-content').textContent = 'Error loading MD content';
        document.getElementById('md-modal').classList.add('open');
      });
  }

  copyMD() {
    const content = document.getElementById('md-content').textContent;
    navigator.clipboard.writeText(content).then(() => {
      const btn = document.getElementById('btn-copy-md');
      btn.innerHTML = '<span>✅</span><span>Copied!</span>';
      setTimeout(() => {
        btn.innerHTML = '<span>📋</span><span>Copy to Clipboard</span>';
      }, 2000);
    });
  }

  async removeMD() {
    if (!this.state.currentMdId) return;

    try {
      await fetch(`/api/md/${this.state.currentMdId}`, { method: 'DELETE' });
      this.state.mdQueue = this.state.mdQueue.filter(m => m.id !== this.state.currentMdId);
      this.renderMDQueue();
      this.closeModals();
    } catch (error) {
      console.error('Failed to remove MD:', error);
    }
  }

  markIssueCompleted() {
    if (!this.state.currentMdId) return;

    // Find the MD in the queue
    const md = this.state.mdQueue.find(m => m.id === this.state.currentMdId);
    if (!md) return;

    // Store MD metadata in completed map (stores route and issue info)
    this.state.completedMDs.set(this.state.currentMdId, {
      route: md.route,
      issueTitle: md.issue?.title,
      issueCategory: md.issue?.category,
      issueSeverity: md.issue?.severity,
      completedAt: Date.now(),
    });
    this.saveCompletedMDs();

    // Remove from MD queue
    this.state.mdQueue = this.state.mdQueue.filter(m => m.id !== this.state.currentMdId);
    this.renderMDQueue();

    // Close modal
    this.closeModals();

    // Re-render route detail to hide the completed issue
    if (this.state.analysis) {
      this.renderRouteDetail(this.state.analysis);
    }

    console.log(`✅ Marked MD as completed: ${md.title}`);
  }

  isIssueCompleted(issue, route) {
    // Check if any completed MD matches this issue
    for (const [mdId, mdData] of this.state.completedMDs) {
      if (mdData.route === route &&
          mdData.issueTitle === issue.title &&
          mdData.issueCategory === issue.category &&
          mdData.issueSeverity === issue.severity) {
        return true;
      }
    }
    return false;
  }

  // ============================================
  // Smart Feature Pipeline
  // ============================================

  async runPipeline() {
    if (!this.state.selectedRoute) {
      alert('Please select a route first');
      return;
    }

    console.log('🚀 Running pipeline for:', this.state.selectedRoute);
    
    // Show pipeline running state
    this.showPipelineRunning();
    
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routePath: this.state.selectedRoute }),
      });
      
      const result = await response.json();
      this.handlePipelineComplete(result);
    } catch (error) {
      console.error('Pipeline failed:', error);
      alert('Pipeline failed: ' + error.message);
      // Reset agent states
      ['feature-agent', 'ui-enhancement', 'final-check'].forEach(agentId => {
        this.updateAgentState({ agent: agentId, to: 'idle' });
      });
    }
  }

  showPipelineRunning() {
    // Pulse the pipeline agents in sequence
    const pipelineAgents = ['feature-agent', 'ui-enhancement', 'final-check'];
    
    pipelineAgents.forEach((agentId, index) => {
      setTimeout(() => {
        this.updateAgentState({ agent: agentId, to: 'working' });
      }, index * 500);
    });
  }

  handlePipelineComplete(pipeline) {
    console.log('✅ Pipeline complete:', pipeline);
    
    // Reset agent states
    ['feature-agent', 'ui-enhancement', 'final-check'].forEach(agentId => {
      this.updateAgentState({ agent: agentId, to: 'idle' });
    });
    
    if (!pipeline.result) {
      alert('Pipeline completed but no feature suggestions found.');
      return;
    }
    
    // Show pipeline result modal
    this.showPipelineResultModal(pipeline);
  }

  showPipelineResultModal(pipeline) {
    const result = pipeline.result;
    const impl = result.implementation;
    
    // Build pipeline result content
    const modalContent = `
      <div class="pipeline-result">
        <div class="pipeline-status ${result.status}">
          ${result.status === 'ready' ? '✅ Ready to Implement' : '⚠️ Needs Work'}
          <span class="pipeline-score">${impl.validation?.score || 0}/100</span>
        </div>
        
        <div class="section">
          <h4>🎯 Feature</h4>
          <p><strong>${impl.title}</strong></p>
          <p>${impl.description || ''}</p>
        </div>
        
        <div class="section">
          <h4>💡 Why This Matters</h4>
          <p>${impl.why || 'Improves user experience'}</p>
        </div>
        
        <div class="section">
          <h4>✨ Expected Result</h4>
          <p>${impl.result || 'Better UX'}</p>
        </div>
        
        <div class="section">
          <h4>🎨 UI Specification</h4>
          <ul>
            <li><strong>Component:</strong> ${impl.ui?.component?.type || 'card'}</li>
            <li><strong>Variant:</strong> ${impl.ui?.component?.variant || 'standard'}</li>
            <li><strong>Motion:</strong> ${impl.ui?.motion?.transition || 'transition-all duration-200'}</li>
          </ul>
          ${impl.ui?.premium?.length ? `
            <p><strong>Premium Additions:</strong></p>
            <ul>
              ${impl.ui.premium.map(p => `<li>${p.why} - <code>${p.className || p.type}</code></li>`).join('')}
            </ul>
          ` : ''}
        </div>
        
        ${impl.validation?.blockers?.length ? `
          <div class="section blockers">
            <h4>🚫 Blockers</h4>
            <ul>
              ${impl.validation.blockers.map(b => `<li><strong>${b.category}:</strong> ${b.issue}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${impl.validation?.recommendations?.length ? `
          <div class="section recommendations">
            <h4>📝 Recommendations</h4>
            <ul>
              ${impl.validation.recommendations.map(r => `<li><strong>${r.category}:</strong> ${r.issue}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="section">
          <h4>📊 Effort & Impact</h4>
          <p><strong>Effort:</strong> ${impl.effort || 'medium'} | <strong>Impact:</strong> ${impl.impact || 'high'}</p>
        </div>
        
        ${impl.industryExample ? `
          <div class="section">
            <h4>🏆 Industry Example</h4>
            <p>${impl.industryExample}</p>
          </div>
        ` : ''}
      </div>
    `;
    
    // Use the issue modal to display
    document.getElementById('issue-title').textContent = `🚀 Pipeline: ${impl.title}`;
    document.getElementById('issue-severity').textContent = result.status;
    document.getElementById('issue-severity').className = `issue-badge ${result.status === 'ready' ? 'info' : 'warning'}`;
    document.getElementById('issue-category').textContent = 'pipeline';
    document.getElementById('issue-description').innerHTML = modalContent;
    document.getElementById('issue-why').textContent = '';
    document.getElementById('issue-result').textContent = '';
    
    // Store for MD generation
    this.state.currentPipeline = pipeline;
    this.state.currentIssue = {
      id: `pipeline-${Date.now()}`,
      title: impl.title,
      description: impl.description,
      why: impl.why,
      result: impl.result,
      severity: 'info',
      category: 'feature',
      type: 'feature',
      effort: impl.effort,
      impact: impl.impact,
      uiSpec: impl.ui,
      validation: impl.validation,
    };
    
    document.getElementById('issue-modal').classList.add('open');
  }

  closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  }

  // ============================================
  // Flow Visualizer - EXPANDED LAYOUT
  // ============================================

  renderFlowVisualizer() {
    if (!this.state.flowGraph) return;
    this.renderFlowWires();
    this.renderFlowNodes();
  }

  renderFlowWires() {
    const svg = document.getElementById('flow-wires');
    if (!svg || !this.state.flowGraph) return;
    
    const filter = this.state.flowFilter;
    const { nodes, edges, routeInfo } = this.state.flowGraph;

    // Filter nodes based on user role
    const isNodeRelevant = (node) => {
      // Determine domain filtering
      const isBaseballFilter = ['college-coach', 'hs-coach', 'juco-coach', 'showcase-coach',
                                 'hs-player', 'showcase-player', 'juco-player', 'college-player'].includes(filter);
      const isGolfFilter = filter === 'golf';

      // Entry points - domain aware
      if (node.type === 'entry') {
        if (!node.domain) return true; // Home always shows
        if (isBaseballFilter && node.domain === 'baseball') return true;
        if (isGolfFilter && node.domain === 'golf') return true;
        if (!isBaseballFilter && !isGolfFilter) return true; // Show both if no specific filter
        return false; // Hide other domain's entry
      }

      // Filter by domain if filter is active
      if (isBaseballFilter && node.domain === 'golf') return false;
      if (isGolfFilter && node.domain === 'baseball') return false;

      // Get route info
      const info = routeInfo[node.id];
      if (!info) return false;

      // Check if this role can access this route
      const roles = info.userRoles || [];

      // Role matching logic - show ALL paths that branch out
      if (filter === 'college-coach') return roles.includes('college-coach') || roles.includes('coach-recruiting');
      if (filter === 'hs-coach') return roles.includes('hs-coach') || roles.includes('coach-team');
      if (filter === 'juco-coach') {
        // JUCO coaches: BOTH recruiting AND team features (combined modes)
        return roles.includes('juco-coach-recruiting') ||
               roles.includes('juco-coach-team') ||
               roles.includes('coach-recruiting') ||
               roles.includes('coach-team');
      }
      if (filter === 'showcase-coach') return roles.includes('showcase-coach') || roles.includes('coach-team');
      if (filter === 'hs-player') return roles.includes('player') || roles.includes('player-recruiting');
      if (filter === 'showcase-player') return roles.includes('player') || roles.includes('player-recruiting');
      if (filter === 'juco-player') return roles.includes('player') || roles.includes('player-recruiting');
      if (filter === 'college-player') return roles.includes('player') && !roles.includes('player-recruiting');

      return true;
    };

    // Determine which domain to show based on filter
    const isBaseballFilter = ['college-coach', 'hs-coach', 'juco-coach', 'showcase-coach',
                               'hs-player', 'showcase-player', 'juco-player', 'college-player'].includes(filter);
    const isGolfFilter = filter === 'golf';

    // Always include core navigation edges for waterfall effect (domain-aware)
    const baseballCoreEdges = [
      { from: 'home', to: 'baseball' },
      { from: 'baseball', to: 'baseball-login' },
      { from: 'baseball', to: 'baseball-signup' },
      { from: 'baseball-login', to: 'baseball-dashboard' },
      { from: 'baseball-signup', to: 'baseball-coach-onboarding' },
      { from: 'baseball-signup', to: 'baseball-player' },
    ];

    const golfCoreEdges = [
      { from: 'home', to: 'golf' },
      { from: 'golf', to: 'golf-login' },
      { from: 'golf', to: 'golf-signup' },
      { from: 'golf-login', to: 'golf-dashboard' },
      { from: 'golf-signup', to: 'golf-coach' },
      { from: 'golf-signup', to: 'golf-player' },
    ];

    const coreEdgePatterns = isBaseballFilter ? baseballCoreEdges :
                             isGolfFilter ? golfCoreEdges :
                             [...baseballCoreEdges, ...golfCoreEdges];

    // Get all node IDs involved in core edges - these must always be visible
    const coreNodeIds = new Set();
    coreEdgePatterns.forEach(edge => {
      coreNodeIds.add(edge.from);
      coreNodeIds.add(edge.to);
    });

    // Filter nodes: include relevant nodes OR nodes involved in core edges
    const filteredNodes = nodes.filter(node =>
      isNodeRelevant(node) || coreNodeIds.has(node.id)
    );
    const relevantNodeIds = new Set(filteredNodes.map(n => n.id));

    const isCoreEdge = (edge) => {
      return coreEdgePatterns.some(p => p.from === edge.from && p.to === edge.to);
    };

    const filteredEdges = edges.filter(e =>
      isCoreEdge(e) || (relevantNodeIds.has(e.from) && relevantNodeIds.has(e.to))
    );
    
    // Create gradient definitions
    let svgContent = `
      <defs>
        <linearGradient id="wireGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="baseballGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#ef4444;stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:#f97316;stop-opacity:0.8" />
        </linearGradient>
        <linearGradient id="golfGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#10b981;stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:#14b8a6;stop-opacity:0.8" />
        </linearGradient>
      </defs>
    `;
    
    // Render each edge
    filteredEdges.forEach((edge, index) => {
      const fromNode = filteredNodes.find(n => n.id === edge.from);
      const toNode = filteredNodes.find(n => n.id === edge.to);

      if (!fromNode || !toNode) return;

      // Calculate path - center of extra compact nodes
      const x1 = fromNode.x + 55;
      const y1 = fromNode.y + 30;
      const x2 = toNode.x + 55;
      const y2 = toNode.y + 30;

      // Determine color based on domain
      let gradient = 'url(#wireGradient)';
      let wireClass = '';
      if (toNode.domain === 'baseball' || fromNode.domain === 'baseball') {
        gradient = 'url(#baseballGradient)';
        wireClass = 'baseball';
      } else if (toNode.domain === 'golf' || fromNode.domain === 'golf') {
        gradient = 'url(#golfGradient)';
        wireClass = 'golf';
      }

      // Create curved path
      const midY = (y1 + y2) / 2;
      const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

      // Calculate label position (midpoint of curve)
      const labelX = (x1 + x2) / 2;
      const labelY = midY;

      svgContent += `
        <path class="wire-path ${wireClass}" d="${path}" style="stroke: ${gradient};" />
        <path class="wire-flow" d="${path}" style="animation-delay: ${index * 0.15}s;" />
        <path class="wire-flow-secondary" d="${path}" style="animation-delay: ${index * 0.15}s;" />
        <path class="wire-flow-tertiary" d="${path}" style="animation-delay: ${index * 0.15}s;" />
      `;

      // Add label if not just "Navigate"
      if (edge.label && edge.label !== 'Navigate') {
        svgContent += `
          <text class="edge-label" x="${labelX}" y="${labelY}" text-anchor="middle">
            ${edge.label}
          </text>
        `;
      }
    });
    
    svg.innerHTML = svgContent;
  }

  renderFlowNodes() {
    const container = document.getElementById('flow-nodes');
    if (!container || !this.state.flowGraph) return;
    
    const filter = this.state.flowFilter;
    const { nodes, routeInfo } = this.state.flowGraph;

    // Filter nodes based on user role (same logic as wires)
    const isNodeRelevant = (node) => {
      // Determine domain filtering
      const isBaseballFilter = ['college-coach', 'hs-coach', 'juco-coach', 'showcase-coach',
                                 'hs-player', 'showcase-player', 'juco-player', 'college-player'].includes(filter);
      const isGolfFilter = filter === 'golf';

      // Entry points - domain aware
      if (node.type === 'entry') {
        if (!node.domain) return true; // Home always shows
        if (isBaseballFilter && node.domain === 'baseball') return true;
        if (isGolfFilter && node.domain === 'golf') return true;
        if (!isBaseballFilter && !isGolfFilter) return true; // Show both if no specific filter
        return false; // Hide other domain's entry
      }

      // Filter by domain if filter is active
      if (isBaseballFilter && node.domain === 'golf') return false;
      if (isGolfFilter && node.domain === 'baseball') return false;

      // Get route info
      const info = routeInfo[node.id];
      if (!info) return false;

      // Check if this role can access this route
      const roles = info.userRoles || [];

      // Role matching logic - show ALL paths that branch out
      if (filter === 'college-coach') return roles.includes('college-coach') || roles.includes('coach-recruiting');
      if (filter === 'hs-coach') return roles.includes('hs-coach') || roles.includes('coach-team');
      if (filter === 'juco-coach') {
        return roles.includes('juco-coach-recruiting') ||
               roles.includes('juco-coach-team') ||
               roles.includes('coach-recruiting') ||
               roles.includes('coach-team');
      }
      if (filter === 'showcase-coach') return roles.includes('showcase-coach') || roles.includes('coach-team');
      if (filter === 'hs-player') return roles.includes('player') || roles.includes('player-recruiting');
      if (filter === 'showcase-player') return roles.includes('player') || roles.includes('player-recruiting');
      if (filter === 'juco-player') return roles.includes('player') || roles.includes('player-recruiting');
      if (filter === 'college-player') return roles.includes('player') && !roles.includes('player-recruiting');

      return true;
    };

    const filteredNodes = nodes.filter(isNodeRelevant);
    
    container.innerHTML = filteredNodes.map(node => {
      const isSelected = this.state.selectedNode === node.id;
      const domainClass = node.domain || '';
      const typeClass = node.type || '';
      
      // Get score from node (enriched by server) or from cached analyses
      let score = node.score;
      if (score === undefined || score === null) {
        const analysis = this.state.routeAnalyses.get(node.path);
        if (analysis) score = analysis.score;
      }
      
      let scoreClass = '';
      let scoreHtml = '';
      if (score !== undefined && score !== null) {
        scoreClass = score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical';
        scoreHtml = `<div class="node-score ${scoreClass}">${score}</div>`;
      }
      
      return `
        <div class="flow-node ${typeClass} ${domainClass} ${isSelected ? 'active' : ''}" 
             style="left: ${node.x}px; top: ${node.y}px;"
             data-node-id="${node.id}"
             onclick="dashboard.selectNode('${node.id}')">
          ${scoreHtml}
          <div class="node-icon">${node.icon}</div>
          <div class="node-label">${node.label}</div>
          <div class="node-path">${node.path}</div>
        </div>
      `;
    }).join('');
  }

  async selectNode(nodeId) {
    this.state.selectedNode = nodeId;
    this.renderFlowNodes();
    await this.showNodeSidebar(nodeId);
  }

  async showNodeSidebar(nodeId) {
    const sidebar = document.getElementById('visualizer-sidebar');
    const content = document.getElementById('viz-sidebar-content');
    
    if (!this.state.flowGraph) return;
    
    const node = this.state.flowGraph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Try to fetch detailed info from server
    let routeInfo = null;
    try {
      const response = await fetch(`/api/flow-graph/route/${nodeId}`);
      if (response.ok) {
        routeInfo = await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch route info:', error);
    }
    
    // Find connections from local graph
    const outgoing = this.state.flowGraph.edges
      .filter(e => e.from === nodeId)
      .map(e => ({
        ...this.state.flowGraph.nodes.find(n => n.id === e.to),
        label: e.label,
      }))
      .filter(Boolean);
    
    const incoming = this.state.flowGraph.edges
      .filter(e => e.to === nodeId)
      .map(e => ({
        ...this.state.flowGraph.nodes.find(n => n.id === e.from),
        label: e.label,
      }))
      .filter(Boolean);
    
    // Get metadata from node itself and routeInfo
    const description = node.description || routeInfo?.routeContext?.description || routeInfo?.description || 'No description available.';
    const components = node.imports || routeInfo?.keyComponents || routeInfo?.routeContext?.expectedComponents || [];
    const analysis = routeInfo?.analysis;

    // Get coach/player types from routeInfo
    const coachTypes = routeInfo?.coachTypes || [];
    const playerTypes = routeInfo?.playerTypes || [];
    const userRoles = routeInfo?.userRoles || node.userRoles || [];
    const features = node.features || routeInfo?.features || [];
    const userJourneys = routeInfo?.userJourneys || [];

    content.innerHTML = `
      <div class="viz-route-info">
        <div class="viz-route-title">${node.icon} ${node.label}</div>
        <div class="viz-route-path">${node.path}</div>
        <div class="viz-route-desc">${description}</div>
      </div>

      ${coachTypes.length > 0 ? `
        <div class="viz-section">
          <div class="viz-section-title">👔 Coach Types</div>
          <div class="viz-badges">
            ${coachTypes.map(type => `
              <span class="viz-badge coach">${type}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${playerTypes.length > 0 ? `
        <div class="viz-section">
          <div class="viz-section-title">⚾ Player Types</div>
          <div class="viz-badges">
            ${playerTypes.map(type => `
              <span class="viz-badge player">${type}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${userRoles.length > 0 ? `
        <div class="viz-section">
          <div class="viz-section-title">👥 User Roles</div>
          <div class="viz-badges">
            ${userRoles.map(role => `
              <span class="viz-badge role">${role}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${features.length > 0 ? `
        <div class="viz-section">
          <div class="viz-section-title">✨ Features</div>
          <div class="viz-badges">
            ${features.map(feature => `
              <span class="viz-badge feature">${feature}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${userJourneys.length > 0 ? `
        <div class="viz-section">
          <div class="viz-section-title">🗺️ User Journeys</div>
          <ul class="viz-journeys">
            ${userJourneys.map(journey => `
              <li>${journey}</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${analysis ? `
        <div class="viz-section">
          <div class="viz-section-title">📊 Analysis</div>
          <div class="viz-analysis">
            <div class="viz-stat">
              <span class="viz-stat-value ${analysis.score >= 80 ? 'good' : analysis.score >= 50 ? 'warning' : 'critical'}">${analysis.score || '?'}</span>
              <span class="viz-stat-label">Score</span>
            </div>
            <div class="viz-stat">
              <span class="viz-stat-value">${analysis.issues || 0}</span>
              <span class="viz-stat-label">Issues</span>
            </div>
            <div class="viz-stat">
              <span class="viz-stat-value">${analysis.uiIssues || 0}</span>
              <span class="viz-stat-label">UI Issues</span>
            </div>
          </div>
        </div>
      ` : ''}

      ${components.length ? `
        <div class="viz-section">
          <div class="viz-section-title">🧩 Key Components</div>
          <div class="viz-components">
            ${components.map(c => `<span class="viz-component">${c}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      
      ${outgoing.length ? `
        <div class="viz-section">
          <div class="viz-section-title">→ Navigates To (${outgoing.length})</div>
          <div class="viz-connections">
            ${outgoing.map(n => `
              <div class="viz-connection" onclick="dashboard.selectNode('${n.id}')">
                <span>${n.icon}</span>
                <span>${n.label}</span>
                <span class="viz-connection-arrow">→</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${incoming.length ? `
        <div class="viz-section">
          <div class="viz-section-title">← Comes From (${incoming.length})</div>
          <div class="viz-connections">
            ${incoming.map(n => `
              <div class="viz-connection" onclick="dashboard.selectNode('${n.id}')">
                <span>${n.icon}</span>
                <span>${n.label}</span>
                <span class="viz-connection-arrow">←</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <button class="viz-analyze-btn" onclick="dashboard.analyzeFromVisualizer('${node.path}')">
        🔍 Analyze This Route
      </button>
    `;
    
    sidebar.classList.add('open');
  }

  analyzeFromVisualizer(routePath) {
    // Switch to audit tab and analyze the route
    this.switchTab('audit');
    this.selectRoute(routePath);
  }

  updateNodeScore(routePath, score) {
    if (!this.state.flowGraph) return;
    
    // Update in flow graph data
    const node = this.state.flowGraph.nodes.find(n => n.path === routePath);
    if (node) {
      node.score = score;
      
      // Update visual if visible
      const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
      if (nodeEl) {
        const scoreClass = score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical';
        let scoreEl = nodeEl.querySelector('.node-score');
        if (!scoreEl) {
          scoreEl = document.createElement('div');
          scoreEl.className = 'node-score';
          nodeEl.appendChild(scoreEl);
        }
        scoreEl.className = `node-score ${scoreClass}`;
        scoreEl.textContent = score;
      }
    }
  }

  // ============================================
  // Rendering
  // ============================================

  updateConnectionStatus(connected) {
    const el = document.getElementById('connection-status');
    if (connected) {
      el.classList.add('connected');
      el.querySelector('span:last-child').textContent = 'Connected';
    } else {
      el.classList.remove('connected');
      el.querySelector('span:last-child').textContent = 'Reconnecting...';
    }
  }

  updateAgentState(state) {
    const agentEl = document.querySelector(`[data-agent="${state.agent}"]`);
    if (agentEl) {
      agentEl.className = `agent-item ${state.to}`;
    }
  }

  renderRouteList(filter = 'all') {
    const container = document.getElementById('route-list');
    let routes = this.state.routes;

    console.log('renderRouteList called with filter:', filter);
    console.log('routeFilter state:', this.state.routeFilter);
    console.log('flowGraph exists?', !!this.state.flowGraph);
    console.log('routes count:', routes.length);

    // Use role-based filtering if routeFilter is set, otherwise use domain filtering
    if (this.state.routeFilter && this.state.flowGraph) {
      const { nodes, routeInfo } = this.state.flowGraph;

      console.log('Using role-based filtering for:', this.state.routeFilter);
      console.log('Flow graph nodes count:', nodes.length);

      routes = routes.filter(route => {
        // Find corresponding node in flow graph
        const node = nodes.find(n => n.path === route.path);
        if (!node) {
          console.log('No node found for route:', route.path);
          return false; // Route not in flow graph
        }

        // Entry points always show
        if (node.type === 'entry') return true;

        // Get route info for user roles
        const info = routeInfo[node.id];
        if (!info) return false;

        const roles = info.userRoles || [];
        const roleFilter = this.state.routeFilter;

        // Apply role-based filtering - show ALL paths that branch out for each role
        if (roleFilter === 'college-coach') {
          // College coaches: recruiting features only
          return roles.includes('college-coach') || roles.includes('coach-recruiting');
        }
        if (roleFilter === 'hs-coach') {
          // HS coaches: team features only
          return roles.includes('hs-coach') || roles.includes('coach-team');
        }
        if (roleFilter === 'juco-coach') {
          // JUCO coaches: BOTH recruiting AND team features (combined modes)
          return roles.includes('juco-coach-recruiting') ||
                 roles.includes('juco-coach-team') ||
                 roles.includes('coach-recruiting') ||
                 roles.includes('coach-team');
        }
        if (roleFilter === 'showcase-coach') {
          // Showcase coaches: team features only
          return roles.includes('showcase-coach') || roles.includes('coach-team');
        }
        if (roleFilter === 'hs-player') {
          // HS players: recruiting features when activated
          return roles.includes('player') || roles.includes('player-recruiting');
        }
        if (roleFilter === 'showcase-player') {
          // Showcase players: recruiting features when activated
          return roles.includes('player') || roles.includes('player-recruiting');
        }
        if (roleFilter === 'juco-player') {
          // JUCO players: recruiting features for transfers
          return roles.includes('player') || roles.includes('player-recruiting');
        }
        if (roleFilter === 'college-player') {
          // College players: team features only, no recruiting
          return roles.includes('player') && !roles.includes('player-recruiting');
        }
        if (roleFilter === 'golf') {
          // Golf: all golf domain routes
          return node.domain === 'golf';
        }

        return true;
      });
    } else if (filter !== 'all') {
      // Fallback to domain filtering if routeFilter not set
      routes = routes.filter(r => r.domain === filter);
    }

    container.innerHTML = routes.map(route => {
      // Check if we have analysis for this route
      const analysis = this.state.routeAnalyses.get(route.path);
      const score = analysis?.score;

      // Calculate issue count excluding completed issues
      let issueCount = null;
      if (analysis) {
        const activeIssues = (analysis.issues || []).filter(issue => !this.isIssueCompleted(issue, route.path));
        const activeUiIssues = (analysis.uiIssues || []).filter(issue => !this.isIssueCompleted(issue, route.path));
        issueCount = activeIssues.length + activeUiIssues.length;
      }
      
      let scoreHtml = '';
      if (score !== undefined && score !== null) {
        const scoreClass = score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical';
        scoreHtml = `<div class="route-score-badge ${scoreClass}">${score}</div>`;
      }
      
      let issueHtml = '';
      if (issueCount !== null && issueCount > 0) {
        issueHtml = `<span class="route-issue-count">${issueCount} issues</span>`;
      }
      
      const isSelected = this.state.selectedRoute === route.path;
      
      return `
        <div class="route-item ${isSelected ? 'selected' : ''}" data-path="${route.path}" onclick="dashboard.selectRoute('${route.path}')">
          <div class="route-icon">${route.domain === 'baseball' ? '⚾' : route.domain === 'golf' ? '⛳' : '📄'}</div>
          <div class="route-info">
            <div class="route-path">${route.path}</div>
            <div class="route-meta">${route.type} · ${route.lines} lines ${issueHtml}</div>
          </div>
          ${scoreHtml}
        </div>
      `;
    }).join('');
  }

  renderRouteDetail(analysis) {
    const container = document.getElementById('route-detail');

    const scoreClass = analysis.score < 50 ? 'critical' : analysis.score < 80 ? 'warning' : 'good';

    // Filter out completed issues
    const activeIssues = (analysis.issues || []).filter(issue => !this.isIssueCompleted(issue, analysis.routePath));
    const activeUiIssues = (analysis.uiIssues || []).filter(issue => !this.isIssueCompleted(issue, analysis.routePath));
    const activeFeatures = (analysis.features || []).filter(feature => !this.isIssueCompleted(feature, analysis.routePath));

    container.innerHTML = `
      <div class="route-header">
        <div class="route-title">
          <h2>${analysis.routePath}</h2>
          <div class="route-badges">
            <span class="badge">${analysis.domain}</span>
            <span class="badge">${analysis.type}</span>
          </div>
        </div>
        <div class="route-score ${scoreClass}">${analysis.score}</div>
      </div>

      <div class="route-context">
        <h3>📍 Route Context</h3>
        <p>${analysis.routeContext?.description || 'No context available'}</p>
        ${analysis.routeContext?.expectedComponents?.length ? `
          <div class="expected-components">
            <strong>Expected:</strong> ${analysis.routeContext.expectedComponents.join(', ')}
          </div>
        ` : ''}
      </div>

      <!-- Coach Types -->
      ${analysis.routeContext?.coachTypes?.length ? `
        <div class="route-context">
          <h3>👔 Coach Types</h3>
          <div class="viz-badges">
            ${analysis.routeContext.coachTypes.map(type => `
              <span class="viz-badge coach">${type}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Player Types -->
      ${analysis.routeContext?.playerTypes?.length ? `
        <div class="route-context">
          <h3>⚾ Player Types</h3>
          <div class="viz-badges">
            ${analysis.routeContext.playerTypes.map(type => `
              <span class="viz-badge player">${type}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- User Roles -->
      ${analysis.routeContext?.userRoles?.length ? `
        <div class="route-context">
          <h3>👥 User Roles</h3>
          <div class="viz-badges">
            ${analysis.routeContext.userRoles.map(role => `
              <span class="viz-badge role">${role}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Features -->
      ${analysis.routeContext?.features?.length ? `
        <div class="route-context">
          <h3>✨ Features</h3>
          <div class="viz-badges">
            ${analysis.routeContext.features.map(feature => `
              <span class="viz-badge feature">${feature}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- User Journeys -->
      ${analysis.routeContext?.userJourneys?.length ? `
        <div class="route-context">
          <h3>🗺️ User Journeys</h3>
          <ul class="viz-journeys">
            ${analysis.routeContext.userJourneys.map(journey => `
              <li>${journey}</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="route-sections">
        <!-- Issues -->
        <div class="section">
          <h3>🔴 Issues (${activeIssues.length})</h3>
          <div class="issue-list">
            ${activeIssues.map(issue => `
              <div class="issue-card" onclick="dashboard.showIssueModal(${JSON.stringify(issue).replace(/"/g, '&quot;')}, 'issue')">
                <div class="issue-severity-dot ${issue.severity}"></div>
                <div class="issue-info">
                  <div class="issue-title">${issue.title}</div>
                  <div class="issue-desc">${issue.description || ''}</div>
                </div>
                <div class="issue-arrow">→</div>
              </div>
            `).join('') || '<p class="no-items">No issues found ✅</p>'}
          </div>
        </div>

        <!-- UI Issues -->
        <div class="section">
          <h3>🎨 UI Issues (${activeUiIssues.length})</h3>
          <div class="issue-list">
            ${activeUiIssues.map(issue => `
              <div class="issue-card" onclick="dashboard.showIssueModal(${JSON.stringify(issue).replace(/"/g, '&quot;')}, 'ui')">
                <div class="issue-severity-dot ${issue.severity}"></div>
                <div class="issue-info">
                  <div class="issue-title">${issue.title}</div>
                  <div class="issue-desc">${issue.description || ''}</div>
                </div>
                <div class="issue-arrow">→</div>
              </div>
            `).join('') || '<p class="no-items">No UI issues found ✅</p>'}
          </div>
        </div>

        <!-- Feature Suggestions -->
        <div class="section">
          <h3>✨ Feature Suggestions (${activeFeatures.length})</h3>
          <div class="issue-list">
            ${activeFeatures.map(feature => `
              <div class="issue-card feature" onclick="dashboard.showIssueModal(${JSON.stringify(feature).replace(/"/g, '&quot;')}, 'feature')">
                <div class="issue-severity-dot info"></div>
                <div class="issue-info">
                  <div class="issue-title">${feature.title}</div>
                  <div class="issue-desc">${feature.description || ''}</div>
                </div>
                <div class="issue-arrow">→</div>
              </div>
            `).join('') || '<p class="no-items">No suggestions ✅</p>'}
          </div>
        </div>
      </div>
    `;
  }

  renderAgentGrid() {
    const container = document.getElementById('agent-grid');
    
    const agents = [
      { id: 'code-quality', icon: '🔍', name: 'Code' },
      { id: 'design-system', icon: '🎨', name: 'Design' },
      { id: 'route-context', icon: '🗺️', name: 'Context' },
      { id: 'feature-agent', icon: '🧠', name: 'Feature' },
      { id: 'ui-enhancement', icon: '✨', name: 'UI' },
      { id: 'final-check', icon: '✅', name: 'Check' },
      { id: 'md-generator', icon: '📝', name: 'MD Gen' },
    ];
    
    container.innerHTML = agents.map(agent => `
      <div class="agent-item idle" data-agent="${agent.id}">
        <span class="agent-icon">${agent.icon}</span>
        <span class="agent-name">${agent.name}</span>
      </div>
    `).join('');
  }

  renderMDQueue() {
    const container = document.getElementById('md-queue');
    const count = this.state.mdQueue.length;
    
    document.getElementById('queue-count').textContent = count;
    document.getElementById('md-count').textContent = count;
    
    if (count === 0) {
      container.innerHTML = `
        <div class="queue-empty">
          <p>No MDs generated yet</p>
          <p class="hint">Click "Send to Agents" on any issue</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.state.mdQueue.map(md => `
      <div class="md-item" onclick="dashboard.showMDModal('${md.id}')">
        <div class="md-icon">📝</div>
        <div class="md-info">
          <div class="md-title">${md.title}</div>
          <div class="md-route">${md.route}</div>
        </div>
        <div class="md-type ${md.type}">${md.type}</div>
      </div>
    `).join('');
  }
}

// Initialize
const dashboard = new UltraAgentDashboard();
