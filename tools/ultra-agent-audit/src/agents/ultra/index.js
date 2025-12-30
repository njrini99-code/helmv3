/**
 * Ultra Agents - 5 Smart Agents
 * 
 * 🧠 Brain   - Strategic intelligence, feature gaps, workflows
 * 🔍 Code    - Code quality, TypeScript, completeness
 * 🎨 Design  - UI/UX, design system, premium patterns  
 * ✅ Quality - Validation, production readiness
 * 📝 Builder - Implementation guide generation
 */

export { BrainAgent } from './brain-agent.js';
export { CodeAgent } from './code-agent.js';
export { DesignAgent } from './design-agent.js';
export { QualityAgent } from './quality-agent.js';
export { BuilderAgent } from './builder-agent.js';

// Export all as a bundle
export const UltraAgents = {
  BrainAgent: () => import('./brain-agent.js').then(m => m.BrainAgent),
  CodeAgent: () => import('./code-agent.js').then(m => m.CodeAgent),
  DesignAgent: () => import('./design-agent.js').then(m => m.DesignAgent),
  QualityAgent: () => import('./quality-agent.js').then(m => m.QualityAgent),
  BuilderAgent: () => import('./builder-agent.js').then(m => m.BuilderAgent),
};

export default UltraAgents;
