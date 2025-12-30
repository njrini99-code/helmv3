/**
 * BaseAgent - Foundation for all Ultra Agent Audit agents
 * 
 * REAL agent communication via events:
 * - Agents emit discoveries that other agents can react to
 * - Agents can request help from other agents
 * - All communication is logged for the dashboard
 * - NO PAID API CALLS
 */

import EventEmitter from 'events';

export class BaseAgent extends EventEmitter {
  constructor(name, capabilities = []) {
    super();
    
    this.name = name;
    this.capabilities = capabilities;
    this.state = 'idle'; // idle | working | waiting | error
    this.activityLog = [];
    this.maxActivityLog = 100;
    this.startTime = Date.now();
    this.taskCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
    
    // Communication channels
    this.inbox = []; // Messages from other agents
    this.outbox = []; // Messages sent to other agents
    
    // Visual config for dashboard
    this.config = {
      icon: '🤖',
      color: '#6366f1',
      description: 'Base agent',
    };
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    this.log('info', `Initialized with capabilities: ${this.capabilities.join(', ')}`);
    return true;
  }

  /**
   * Check if agent can handle a capability
   */
  canHandle(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * Set agent state and emit event
   */
  setState(newState) {
    const previousState = this.state;
    this.state = newState;
    
    this.emit('state:changed', {
      agent: this.name,
      from: previousState,
      to: newState,
      timestamp: Date.now(),
    });
    
    return this;
  }

  /**
   * Log activity with visual indicator
   */
  log(level, message, data = {}) {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      working: '⚙️',
      thinking: '🧠',
      send: '📤',
      receive: '📥',
      discovery: '💡',
    };

    const entry = {
      id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      agent: this.name,
      level,
      icon: icons[level] || '📌',
      message,
      data,
      timestamp: Date.now(),
    };

    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxActivityLog) {
      this.activityLog = this.activityLog.slice(0, this.maxActivityLog);
    }

    // Emit for dashboard
    this.emit('activity', entry);

    // Console output
    console.log(`${entry.icon} [${this.name}] ${message}`);
    
    return entry;
  }

  /**
   * Send a message to another agent (via coordinator)
   */
  sendToAgent(targetAgent, messageType, payload) {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      from: this.name,
      to: targetAgent,
      type: messageType,
      payload,
      timestamp: Date.now(),
    };

    this.outbox.push(message);
    this.log('send', `→ ${targetAgent}: ${messageType}`);
    
    // Emit for coordinator to route
    this.emit('message:send', message);
    
    return message;
  }

  /**
   * Receive a message from another agent
   */
  receiveMessage(message) {
    this.inbox.push(message);
    this.log('receive', `← ${message.from}: ${message.type}`);
    
    // Handle the message
    this.handleMessage(message);
    
    this.emit('message:received', message);
  }

  /**
   * Handle incoming message (override in subclasses)
   */
  handleMessage(message) {
    // Default: just log it
    // Subclasses should override this to actually do something
  }

  /**
   * Share a discovery with all agents
   */
  shareDiscovery(discoveryType, data) {
    const discovery = {
      id: `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      agent: this.name,
      type: discoveryType,
      data,
      timestamp: Date.now(),
    };

    this.log('discovery', `Found: ${discoveryType}`);
    
    // Emit for coordinator to broadcast
    this.emit('discovery', discovery);
    
    return discovery;
  }

  /**
   * Request help from agents with a specific capability
   */
  requestHelp(capability, context) {
    const request = {
      id: `help-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      from: this.name,
      capability,
      context,
      timestamp: Date.now(),
    };

    this.log('info', `Requesting help: ${capability}`);
    this.emit('help:request', request);
    
    return request;
  }

  /**
   * Execute a task with state tracking
   */
  async executeTask(taskName, taskFn) {
    this.taskCount++;
    this.setState('working');
    this.log('working', `Starting: ${taskName}`);
    
    const startTime = Date.now();
    
    try {
      const result = await taskFn();
      
      this.successCount++;
      this.setState('idle');
      this.log('success', `Completed: ${taskName} (${Date.now() - startTime}ms)`);
      
      this.emit('task:complete', {
        agent: this.name,
        task: taskName,
        duration: Date.now() - startTime,
        success: true,
      });
      
      return { success: true, result };
      
    } catch (error) {
      this.errorCount++;
      this.setState('error');
      this.log('error', `Failed: ${taskName} - ${error.message}`);
      
      this.emit('task:error', {
        agent: this.name,
        task: taskName,
        error: error.message,
      });
      
      setTimeout(() => this.setState('idle'), 2000);
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      capabilities: this.capabilities,
      uptime: Date.now() - this.startTime,
      tasks: {
        total: this.taskCount,
        success: this.successCount,
        errors: this.errorCount,
        successRate: this.taskCount > 0 
          ? ((this.successCount / this.taskCount) * 100).toFixed(1) 
          : 100,
      },
      messages: {
        sent: this.outbox.length,
        received: this.inbox.length,
      },
      recentActivity: this.activityLog.slice(0, 10),
      config: this.config,
    };
  }

  /**
   * Get recent activity
   */
  getActivity(limit = 10) {
    return this.activityLog.slice(0, limit);
  }

  /**
   * Reset agent
   */
  reset() {
    this.state = 'idle';
    this.activityLog = [];
    this.inbox = [];
    this.outbox = [];
    this.taskCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.log('info', 'Agent reset');
  }

  /**
   * Shutdown
   */
  async shutdown() {
    this.log('info', 'Shutting down...');
    this.setState('idle');
    this.removeAllListeners();
  }
}

export default BaseAgent;
