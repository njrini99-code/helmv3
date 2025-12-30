/**
 * AgentCoordinator - Routes messages between agents
 * 
 * REAL coordination:
 * - Routes messages between agents
 * - Broadcasts discoveries to all agents
 * - Tracks all agent communication for dashboard
 * - Manages the agent communication graph
 */

import EventEmitter from 'events';

export class AgentCoordinator extends EventEmitter {
  constructor() {
    super();
    
    this.agents = new Map();
    this.capabilities = new Map(); // capability -> [agent names]
    this.activityLog = [];
    this.maxActivity = 200;
    this.messageLog = []; // All inter-agent messages
    this.discoveryLog = [];
    
    this.state = {
      mode: 'manual',
      activeAgents: 0,
      totalMessages: 0,
      totalDiscoveries: 0,
      startTime: Date.now(),
    };

    this.config = {
      icon: '🎯',
      name: 'Coordinator',
      color: '#f59e0b',
    };
  }

  /**
   * Register an agent
   */
  registerAgent(agent) {
    this.agents.set(agent.name, agent);
    this.state.activeAgents = this.agents.size;

    // Map capabilities
    for (const cap of agent.capabilities) {
      if (!this.capabilities.has(cap)) {
        this.capabilities.set(cap, []);
      }
      const agents = this.capabilities.get(cap);
      if (!agents.includes(agent.name)) {
        agents.push(agent.name);
      }
    }

    // Wire up agent events
    this.wireAgentEvents(agent);

    this.logActivity('register', `Registered: ${agent.name}`, { icon: agent.config?.icon });
    
    this.emit('agent:registered', {
      name: agent.name,
      capabilities: agent.capabilities,
    });

    return this;
  }

  /**
   * Wire agent events to coordinator
   */
  wireAgentEvents(agent) {
    // Forward activity
    agent.on('activity', (entry) => {
      this.activityLog.unshift(entry);
      if (this.activityLog.length > this.maxActivity) {
        this.activityLog = this.activityLog.slice(0, this.maxActivity);
      }
      this.emit('activity', entry);
    });

    // Forward state changes
    agent.on('state:changed', (change) => {
      this.emit('agent:state', change);
    });

    // Handle inter-agent messages
    agent.on('message:send', (message) => {
      this.routeMessage(message);
    });

    // Handle discoveries - broadcast to all other agents
    agent.on('discovery', (discovery) => {
      this.broadcastDiscovery(discovery);
    });

    // Handle help requests
    agent.on('help:request', (request) => {
      this.routeHelpRequest(request);
    });

    // Track task completion
    agent.on('task:complete', (result) => {
      this.emit('task:complete', result);
    });

    agent.on('task:error', (error) => {
      this.emit('task:error', error);
    });
  }

  /**
   * Route a message from one agent to another
   */
  routeMessage(message) {
    this.state.totalMessages++;
    
    // Log the message
    this.messageLog.unshift(message);
    if (this.messageLog.length > 100) {
      this.messageLog = this.messageLog.slice(0, 100);
    }

    // Find target agent
    const targetAgent = this.agents.get(message.to);
    if (!targetAgent) {
      this.logActivity('warning', `Message target not found: ${message.to}`);
      return;
    }

    // Deliver message
    targetAgent.receiveMessage(message);
    
    this.logActivity('message', `${message.from} → ${message.to}: ${message.type}`, {
      icon: '📨',
    });

    this.emit('message:routed', message);
  }

  /**
   * Broadcast a discovery to all agents
   */
  broadcastDiscovery(discovery) {
    this.state.totalDiscoveries++;
    
    this.discoveryLog.unshift(discovery);
    if (this.discoveryLog.length > 50) {
      this.discoveryLog = this.discoveryLog.slice(0, 50);
    }

    // Send to all OTHER agents
    for (const [name, agent] of this.agents) {
      if (name !== discovery.agent) {
        agent.receiveMessage({
          id: `disc-${Date.now()}`,
          from: discovery.agent,
          to: name,
          type: 'discovery',
          payload: discovery,
          timestamp: Date.now(),
        });
      }
    }

    this.logActivity('discovery', `${discovery.agent} discovered: ${discovery.type}`, {
      icon: '💡',
    });

    this.emit('discovery', discovery);
  }

  /**
   * Route a help request to capable agents
   */
  routeHelpRequest(request) {
    const capableAgentNames = this.capabilities.get(request.capability) || [];
    
    // Filter out the requesting agent
    const helpers = capableAgentNames.filter(name => name !== request.from);
    
    if (helpers.length === 0) {
      this.logActivity('warning', `No agent can help with: ${request.capability}`);
      return null;
    }

    // Pick the best helper (prefer idle)
    let bestHelper = null;
    for (const name of helpers) {
      const agent = this.agents.get(name);
      if (agent && agent.state === 'idle') {
        bestHelper = agent;
        break;
      }
      if (agent && !bestHelper) {
        bestHelper = agent;
      }
    }

    if (bestHelper) {
      // Send help request as a message
      bestHelper.receiveMessage({
        id: request.id,
        from: request.from,
        to: bestHelper.name,
        type: 'help-request',
        payload: request,
        timestamp: Date.now(),
      });

      this.logActivity('help', `${request.from} → ${bestHelper.name}: ${request.capability}`, {
        icon: '🤝',
      });

      this.emit('help:routed', {
        request,
        helper: bestHelper.name,
      });
    }

    return bestHelper;
  }

  /**
   * Get agent by name
   */
  getAgent(name) {
    return this.agents.get(name);
  }

  /**
   * Get agents that can handle a capability
   */
  getAgentsForCapability(capability) {
    const names = this.capabilities.get(capability) || [];
    return names.map(n => this.agents.get(n)).filter(Boolean);
  }

  /**
   * Set mode
   */
  setMode(mode) {
    const validModes = ['manual', 'hybrid', 'autonomous'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    
    const prev = this.state.mode;
    this.state.mode = mode;
    
    this.logActivity('mode', `Mode: ${prev} → ${mode}`, {
      icon: mode === 'autonomous' ? '🚀' : mode === 'hybrid' ? '⚡' : '🎮',
    });
    
    this.emit('mode:changed', { from: prev, to: mode });
    return mode;
  }

  /**
   * Log coordinator activity
   */
  logActivity(type, message, data = {}) {
    const entry = {
      id: `coord-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      agent: 'coordinator',
      type,
      message,
      data,
      timestamp: Date.now(),
      icon: data.icon || this.config.icon,
    };

    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxActivity) {
      this.activityLog = this.activityLog.slice(0, this.maxActivity);
    }

    console.log(`${entry.icon} [Coordinator] ${message}`);
    this.emit('activity', entry);
    
    return entry;
  }

  /**
   * Get all agent states for dashboard
   */
  getAgentStates() {
    const states = [];
    for (const [name, agent] of this.agents) {
      states.push({
        name,
        state: agent.state,
        config: agent.config,
        stats: agent.getStats(),
      });
    }
    return states;
  }

  /**
   * Get the message flow graph for visualization
   */
  getMessageFlowGraph() {
    // Build a graph of agent-to-agent communication
    const nodes = [];
    const edges = [];
    
    for (const [name, agent] of this.agents) {
      nodes.push({
        id: name,
        label: agent.config?.icon + ' ' + name,
        color: agent.config?.color,
        state: agent.state,
      });
    }
    
    // Build edges from message log
    const edgeCounts = new Map();
    for (const msg of this.messageLog.slice(0, 50)) {
      const key = `${msg.from}→${msg.to}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }
    
    for (const [key, count] of edgeCounts) {
      const [from, to] = key.split('→');
      edges.push({ from, to, count });
    }
    
    return { nodes, edges };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      mode: this.state.mode,
      uptime: Date.now() - this.state.startTime,
      agents: this.agents.size,
      totalMessages: this.state.totalMessages,
      totalDiscoveries: this.state.totalDiscoveries,
      capabilities: Array.from(this.capabilities.keys()),
      recentMessages: this.messageLog.slice(0, 10),
      recentDiscoveries: this.discoveryLog.slice(0, 10),
    };
  }

  /**
   * Get activity log
   */
  getActivity(limit = 50) {
    return this.activityLog.slice(0, limit);
  }

  /**
   * Initialize all agents
   */
  async initializeAll() {
    this.logActivity('system', 'Initializing all agents...', { icon: '🚀' });

    for (const [name, agent] of this.agents) {
      try {
        await agent.initialize();
      } catch (error) {
        this.logActivity('error', `${name} init failed: ${error.message}`, { icon: '❌' });
      }
    }

    this.emit('system:ready', {
      agents: Array.from(this.agents.keys()),
    });
  }

  /**
   * Shutdown all agents
   */
  async shutdownAll() {
    this.logActivity('system', 'Shutting down...', { icon: '🛑' });

    for (const [name, agent] of this.agents) {
      try {
        await agent.shutdown();
      } catch (error) {
        console.error(`Error shutting down ${name}:`, error);
      }
    }

    this.agents.clear();
    this.capabilities.clear();
    this.removeAllListeners();
  }
}

export default AgentCoordinator;
