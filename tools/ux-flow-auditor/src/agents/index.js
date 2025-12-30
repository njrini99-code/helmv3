/**
 * HELM AGENTS INDEX
 * 
 * All Ship Command Hub agents in one place.
 * 
 * Knowledge-Powered Agents (NEW):
 * - CodeQualityAgent - Type imports, patterns, bugs
 * - DesignSystemAgent - Spacing, glass, colors
 * - RouteContextAgent - Expected components, features
 * 
 * Existing Agents:
 * - UIReviewAgent - Screenshot capture + visual validation
 * - ImprovementAgent - Learning from fixes
 * - VisualAnalysisAgent - Claude Vision analysis
 * - MegaThinkAgent - Deep improvement research
 * 
 * Coordination:
 * - AgentCoordinator - Orchestrates all agents
 * - BaseAgent - Base class for all agents
 */

// Base
export { BaseAgent } from './coordination/base-agent.js';
export { AgentCoordinator } from './coordination/agent-coordinator.js';

// Knowledge-powered agents (use knowledge system)
export { CodeQualityAgent } from './code-quality-agent.js';
export { DesignSystemAgent } from './design-system-agent.js';
export { RouteContextAgent } from './route-context-agent.js';

// Existing agents
export { UIReviewAgent } from './ui-review-agent.js';
export { ImprovementAgent } from './improvement-agent.js';
export { VisualAnalysisAgent } from './visual-analysis-agent.js';
export { MegaThinkAgent } from './megathink.js';
export { ContinuousImprovementAgent } from './continuous-improvement-agent.js';
export { MDGeneratorAgent } from './md-generator-agent.js';

// Agent registry with metadata
export const AgentRegistry = {
  'code-quality': {
    class: 'CodeQualityAgent',
    description: 'Validates code patterns, imports, and bugs',
    usesKnowledge: true,
    capabilities: ['type-validation', 'import-validation', 'pattern-detection', 'bug-detection'],
    icon: '🔍',
  },
  'design-system': {
    class: 'DesignSystemAgent',
    description: 'Validates UI against Helm design system',
    usesKnowledge: true,
    capabilities: ['spacing-validation', 'glass-validation', 'color-validation', 'component-validation'],
    icon: '🎨',
  },
  'route-context': {
    class: 'RouteContextAgent',
    description: 'Validates routes against expected patterns',
    usesKnowledge: true,
    capabilities: ['route-validation', 'component-checking', 'feature-detection', 'domain-knowledge'],
    icon: '🗺️',
  },
  'ui-review': {
    class: 'UIReviewAgent',
    description: 'Screenshot capture and visual validation',
    usesKnowledge: false,
    capabilities: ['visual-validation', 'screenshot-capture', 'responsive-check', 'animation-validation'],
    icon: '📸',
  },
  'improvement': {
    class: 'ImprovementAgent',
    description: 'Learns from fixes to improve future recommendations',
    usesKnowledge: false,
    capabilities: ['learning', 'recommendations', 'pattern-recognition'],
    icon: '🧠',
  },
  'visual-analysis': {
    class: 'VisualAnalysisAgent',
    description: 'Analyzes screenshots using Claude Vision',
    usesKnowledge: false,
    capabilities: ['screenshot-analysis', 'ui-suggestions', 'ux-improvements', 'feature-detection'],
    icon: '👁️',
  },
  'megathink': {
    class: 'MegaThinkAgent',
    description: 'Deep improvement research and proposals',
    usesKnowledge: true,
    capabilities: ['research', 'proposals', 'prioritization', 'implementation-guides'],
    icon: '💡',
  },
  'continuous-improvement': {
    class: 'ContinuousImprovementAgent',
    description: 'Never-ending improvement discovery and MD generation',
    usesKnowledge: true,
    capabilities: ['ui-improvements', 'feature-discovery', 'implementation-generation', 'visual-analysis'],
    icon: '🔄',
  },
};

// Get all agent names
export function getAgentNames() {
  return Object.keys(AgentRegistry);
}

// Get agents that use knowledge system
export function getKnowledgePoweredAgents() {
  return Object.entries(AgentRegistry)
    .filter(([_, meta]) => meta.usesKnowledge)
    .map(([name, meta]) => ({ name, ...meta }));
}

export default {
  CodeQualityAgent: () => import('./code-quality-agent.js'),
  DesignSystemAgent: () => import('./design-system-agent.js'),
  RouteContextAgent: () => import('./route-context-agent.js'),
  UIReviewAgent: () => import('./ui-review-agent.js'),
  ImprovementAgent: () => import('./improvement-agent.js'),
  VisualAnalysisAgent: () => import('./visual-analysis-agent.js'),
  MegaThinkAgent: () => import('./megathink.js'),
  AgentRegistry,
};
