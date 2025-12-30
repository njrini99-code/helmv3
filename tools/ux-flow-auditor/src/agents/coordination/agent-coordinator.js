/**
 * AgentCoordinator - Multi-agent orchestration system
 * 
 * Manages agent lifecycle, communication, and consensus
 */
import EventEmitter from 'events';

export class AgentCoordinator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.agents = new Map();
    this.activeAgents = new Set();
    this.messageQueue = [];
    this.sharedState = {
      currentTask: null,
      pendingProposals: [],
      recentDecisions: [],
      contextCache: new Map(),
    };
    
    this.config = {
      maxParallelAgents: config.maxParallelAgents || 3,
      proposalTimeout: config.proposalTimeout || 30000,
      consensusThreshold: config.consensusThreshold || 0.6,
    };
    
    this.setupMessageProcessor();
  }

  // Register an agent
  registerAgent(name, agent, capabilities = []) {
    this.agents.set(name, {
      instance: agent,
      capabilities,
      status: 'idle',
      lastActivity: null,
    });
    
    // Wire up agent events
    agent.on?.('discovery', (data) => this.handleDiscovery(name, data));
    agent.on?.('question', (data) => this.routeQuestion(name, data));
    agent.on?.('proposal', (data) => this.handleProposal(name, data));
    agent.on?.('insight', (data) => this.shareInsight(name, data));
    
    this.emit('agent:registered', { name, capabilities });
    console.log(`🤖 Agent registered: ${name} [${capabilities.join(', ')}]`);
  }

  // Start an agent
  async startAgent(name) {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Agent not found: ${name}`);
    }
    
    if (this.activeAgents.size >= this.config.maxParallelAgents) {
      console.log(`⏳ Agent ${name} queued (max parallel reached)`);
      return false;
    }
    
    agent.status = 'running';
    agent.lastActivity = Date.now();
    this.activeAgents.add(name);
    
    this.emit('agent:started', { name });
    this.emit('activity', { agent: name, message: 'Agent started', status: 'active' });
    console.log(`▶️ Agent started: ${name}`);
    
    // Start the agent's main loop if it has one
    if (agent.instance.start) {
      try {
        await agent.instance.start(this.sharedState);
      } catch (error) {
        console.error(`Error starting agent ${name}:`, error.message);
      }
    }
    
    return true;
  }

  // Stop an agent
  stopAgent(name) {
    const agent = this.agents.get(name);
    if (!agent) return;
    
    agent.status = 'stopped';
    this.activeAgents.delete(name);
    
    if (agent.instance.stop) {
      agent.instance.stop();
    }
    
    this.emit('agent:stopped', { name });
    this.emit('activity', { agent: name, message: 'Agent stopped', status: 'idle' });
    console.log(`⏹️ Agent stopped: ${name}`);
  }

  // Route a question to the best agent
  async routeQuestion(fromAgent, question) {
    const expertAgent = this.findExpertFor(question.domain);
    
    if (!expertAgent) {
      console.log(`❓ No expert found for domain: ${question.domain}`);
      return null;
    }
    
    const agent = this.agents.get(expertAgent);
    if (agent?.instance.answer) {
      const answer = await agent.instance.answer(question);
      
      this.emit('agent:communication', {
        from: fromAgent,
        to: expertAgent,
        type: 'question-answer',
        question: question.text,
        answer: answer.text
      });
      
      return answer;
    }
    
    return null;
  }

  // Find the best agent for a domain
  findExpertFor(domain) {
    for (const [name, agent] of this.agents) {
      if (agent.capabilities.includes(domain)) {
        return name;
      }
    }
    return null;
  }

  // Handle a discovery from an agent
  handleDiscovery(fromAgent, discovery) {
    console.log(`🔍 Discovery from ${fromAgent}: ${discovery.summary || discovery.message || 'New discovery'}`);
    
    // Broadcast to all agents
    for (const [name, agent] of this.agents) {
      if (name !== fromAgent && agent.instance.receiveDiscovery) {
        agent.instance.receiveDiscovery(discovery);
      }
    }
    
    this.emit('agent:discovery', { from: fromAgent, discovery });
    this.emit('discovery', { agent: fromAgent, message: discovery.summary || discovery.message });
  }

  // Handle a proposal from an agent
  async handleProposal(fromAgent, proposal) {
    console.log(`📋 Proposal from ${fromAgent}: ${proposal.title}`);
    
    // Add to pending proposals
    const fullProposal = {
      id: `proposal-${Date.now()}`,
      from: fromAgent,
      ...proposal,
      createdAt: new Date().toISOString(),
      validations: [],
      status: 'pending',
    };
    
    this.sharedState.pendingProposals.push(fullProposal);
    this.emit('agent:proposal', fullProposal);
    
    // Get validations from other agents
    const validations = await this.validateProposal(fromAgent, proposal);
    fullProposal.validations = validations;
    
    // Calculate consensus
    const approvals = validations.filter(v => v.approved);
    const consensus = validations.length > 0 
      ? approvals.length / validations.length 
      : 1;
    
    fullProposal.consensus = consensus;
    fullProposal.status = consensus >= this.config.consensusThreshold 
      ? 'approved' 
      : 'needs-review';
    
    this.emit('proposal:evaluated', fullProposal);
    
    return fullProposal;
  }

  // Get validation from other agents
  async validateProposal(fromAgent, proposal) {
    const validations = [];
    
    const validationPromises = Array.from(this.agents.entries())
      .filter(([name]) => name !== fromAgent)
      .map(async ([name, agent]) => {
        if (agent.instance.validate) {
          try {
            const validation = await Promise.race([
              agent.instance.validate(proposal),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), this.config.proposalTimeout)
              )
            ]);
            
            return {
              agent: name,
              approved: validation.approved,
              confidence: validation.confidence || 0.5,
              feedback: validation.feedback,
            };
          } catch (error) {
            return {
              agent: name,
              approved: true, // Default to approval on timeout
              confidence: 0.5,
              feedback: 'Validation timed out',
            };
          }
        }
        return null;
      });
    
    const results = await Promise.all(validationPromises);
    return results.filter(Boolean);
  }

  // Share an insight with all agents
  shareInsight(fromAgent, insight) {
    console.log(`💡 Insight from ${fromAgent}: ${insight.text}`);
    
    for (const [name, agent] of this.agents) {
      if (name !== fromAgent && agent.instance.receiveInsight) {
        agent.instance.receiveInsight(insight);
      }
    }
    
    this.emit('agent:insight', { from: fromAgent, insight });
    this.emit('insight', { agent: fromAgent, message: insight.text });
  }

  // Update shared context
  updateSharedContext(key, value) {
    this.sharedState.contextCache.set(key, value);
    this.emit('context:updated', { key, value });
  }

  // Get shared context
  getSharedContext(key) {
    return this.sharedState.contextCache.get(key);
  }

  // Process message queue
  setupMessageProcessor() {
    setInterval(() => {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        this.processMessage(message);
      }
    }, 100);
  }

  processMessage(message) {
    const agent = this.agents.get(message.to);
    if (agent?.instance.receiveMessage) {
      agent.instance.receiveMessage(message);
    }
  }

  // Get system status
  getStatus() {
    const agents = {};
    for (const [name, agent] of this.agents) {
      agents[name] = {
        status: agent.status,
        capabilities: agent.capabilities,
        lastActivity: agent.lastActivity,
      };
    }
    
    return {
      agents,
      activeCount: this.activeAgents.size,
      pendingProposals: this.sharedState.pendingProposals.length,
      recentDecisions: this.sharedState.recentDecisions.slice(-10),
    };
  }
}

export default AgentCoordinator;
