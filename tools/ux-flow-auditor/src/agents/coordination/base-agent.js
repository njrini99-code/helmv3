/**
 * BaseAgent - Foundation class for all agents
 */
import EventEmitter from 'events';

export class BaseAgent extends EventEmitter {
  constructor(name, capabilities = []) {
    super();
    this.name = name;
    this.capabilities = capabilities;
    this.running = false;
    this.sharedState = null;
  }
  
  start(sharedState) {
    this.running = true;
    this.sharedState = sharedState;
    console.log(`🤖 ${this.name} started`);
  }
  
  stop() {
    this.running = false;
    console.log(`🤖 ${this.name} stopped`);
  }
  
  // Override in subclasses
  async answer(question) {
    return { text: 'Not implemented', confidence: 0 };
  }
  
  async validate(proposal) {
    return { approved: true, confidence: 0.5, feedback: 'No validation implemented' };
  }
  
  receiveDiscovery(discovery) {
    // Override in subclasses
  }
  
  receiveInsight(insight) {
    // Override in subclasses
  }
  
  receiveMessage(message) {
    // Override in subclasses
  }
  
  // Helper to emit discoveries
  discover(data) {
    this.emit('discovery', { ...data, timestamp: Date.now() });
  }
  
  // Helper to ask questions
  askQuestion(domain, text) {
    this.emit('question', { domain, text });
  }
  
  // Helper to propose changes
  propose(proposal) {
    this.emit('proposal', proposal);
  }
  
  // Helper to share insights
  shareInsight(text, data = {}) {
    this.emit('insight', { text, ...data });
  }
}

export default BaseAgent;
