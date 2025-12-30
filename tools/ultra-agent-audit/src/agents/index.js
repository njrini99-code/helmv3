/**
 * Ultra Agent Audit - Agent Index
 * 
 * All agents - NO PAID API CALLS
 * Now with HelmKnowledge for deep project context
 */

// Base infrastructure
export { BaseAgent } from './coordination/base-agent.js';
export { AgentCoordinator } from './coordination/agent-coordinator.js';

// Core agents
export { VisualAnalysisAgent } from './visual-analysis-agent.js';
export { ImprovementAgent } from './improvement-agent.js';
export { CodeQualityAgent } from './code-quality-agent.js';
export { DesignSystemAgent } from './design-system-agent.js';
export { RouteContextAgent } from './route-context-agent.js';
export { MegaThinkAgent } from './megathink-agent.js';
export { UIReviewAgent } from './ui-review-agent.js';
export { MDGeneratorAgent } from './md-generator-agent.js';

// Enhanced agents (Claude Premium UI Skill)
export { PremiumUIAgent } from './premium-ui-agent.js';
export { SmartMegaThinkAgent } from './smart-megathink-agent.js';
export { UnfinishedFeatureDetector } from './unfinished-feature-detector.js';

// Smart Pipeline Agents (Feature → UI → Validation)
export { FeatureAgent } from './feature-agent.js';
export { UIEnhancementAgent } from './ui-enhancement-agent.js';
export { FinalCheckAgent } from './final-check-agent.js';

/**
 * Agent Registry - Metadata for dashboard
 */
export const AgentRegistry = {
  'visual-analysis': {
    name: 'Visual Analysis',
    class: 'VisualAnalysisAgent',
    icon: '👁️',
    color: '#8b5cf6',
    description: 'Loads and tracks screenshots',
    capabilities: ['screenshot-loading', 'screenshot-tracking', 'visual-metadata', 'version-history'],
  },
  'improvement': {
    name: 'Improvement',
    class: 'ImprovementAgent',
    icon: '🧠',
    color: '#10b981',
    description: 'Learns from fixes to improve recommendations',
    capabilities: ['learning', 'pattern-detection', 'fix-recommendation', 'success-tracking'],
  },
  'code-quality': {
    name: 'Code Quality',
    class: 'CodeQualityAgent',
    icon: '🔍',
    color: '#ef4444',
    description: 'Validates code quality, types, and patterns',
    capabilities: ['type-validation', 'import-validation', 'pattern-detection', 'bug-detection'],
  },
  'design-system': {
    name: 'Design System',
    class: 'DesignSystemAgent',
    icon: '🎨',
    color: '#ec4899',
    description: 'Validates UI against Helm design system',
    capabilities: ['spacing-validation', 'color-validation', 'glass-validation', 'typography-validation'],
  },
  'route-context': {
    name: 'Route Context',
    class: 'RouteContextAgent',
    icon: '🗺️',
    color: '#0ea5e9',
    description: 'Validates routes have expected features',
    capabilities: ['route-validation', 'feature-detection', 'domain-knowledge', 'completeness-check'],
  },
  'megathink': {
    name: 'MegaThink',
    class: 'MegaThinkAgent',
    icon: '🚀',
    color: '#f59e0b',
    description: 'Strategic proposals (rule-based)',
    capabilities: ['strategic-proposals', 'feature-suggestions', 'improvement-ideas', 'roadmap-building'],
  },
  'ui-review': {
    name: 'UI Review',
    class: 'UIReviewAgent',
    icon: '📸',
    color: '#06b6d4',
    description: 'Captures before/after screenshots with Puppeteer',
    capabilities: ['screenshot-capture', 'before-after', 'regression-detection', 'visual-validation'],
  },
  'md-generator': {
    name: 'MD Generator',
    class: 'MDGeneratorAgent',
    icon: '📝',
    color: '#a855f7',
    description: 'Generates detailed implementation guides',
    capabilities: ['implementation-guide', 'detailed-md', 'code-generation', 'fix-instructions'],
  },
  'premium-ui': {
    name: 'Premium UI',
    class: 'PremiumUIAgent',
    icon: '✨',
    color: '#a855f7',
    description: 'Claude Premium UI skill - microinteractions, glassmorphism, premium polish',
    capabilities: ['microinteractions', 'glassmorphism', 'visual-hierarchy', 'animation-timing', 'premium-polish'],
  },
  'smart-megathink': {
    name: 'Smart MegaThink',
    class: 'SmartMegaThinkAgent',
    icon: '🧠',
    color: '#8b5cf6',
    description: 'Context-aware strategic intelligence - thinks BIG',
    capabilities: ['strategic-proposals', 'feature-gap-analysis', 'journey-mapping', 'bold-recommendations'],
  },
  'unfinished-detector': {
    name: 'Unfinished Detector',
    class: 'UnfinishedFeatureDetector',
    icon: '🚧',
    color: '#f97316',
    description: 'Detects TODOs, incomplete features, and unfinished work',
    capabilities: ['todo-detection', 'incomplete-features', 'placeholder-detection', 'dead-code-detection'],
  },
  'feature-agent': {
    name: 'Feature Agent',
    class: 'FeatureAgent',
    icon: '🧠',
    color: '#6366f1',
    description: 'Domain-aware feature intelligence with industry knowledge',
    capabilities: ['feature-detection', 'capability-analysis', 'blocked-workflows', 'industry-comparison'],
  },
  'ui-enhancement': {
    name: 'UI Enhancement',
    class: 'UIEnhancementAgent',
    icon: '✨',
    color: '#f59e0b',
    description: 'Premium UI design with deep aesthetic awareness - knows Helm\'s vibe',
    capabilities: ['element-detection', 'consistency-analysis', 'premium-enhancement', 'pattern-matching', 'code-generation'],
  },
  'final-check': {
    name: 'Final Check',
    class: 'FinalCheckAgent',
    icon: '✅',
    color: '#22c55e',
    description: 'Quality gate - validates completeness, consistency, accessibility before shipping',
    capabilities: ['completeness-check', 'consistency-check', 'accessibility-check', 'design-alignment', 'production-readiness'],
  },
  'coordinator': {
    name: 'Coordinator',
    class: 'AgentCoordinator',
    icon: '🎯',
    color: '#f59e0b',
    description: 'Routes messages between agents',
    capabilities: ['message-routing', 'discovery-broadcast', 'help-routing'],
  },
};

export default AgentRegistry;
