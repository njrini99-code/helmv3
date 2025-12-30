/**
 * HELM KNOWLEDGE SYSTEM
 * 
 * Central export for all project knowledge.
 * 
 * This system makes agents 100x smarter by providing:
 * - Complete project context
 * - Domain knowledge (baseball/golf)
 * - Database schema
 * - Design system rules
 * - Component patterns
 * - Code quality rules
 * - Route-specific context
 * 
 * Usage:
 *   import { HelmKnowledge } from './knowledge/index.js';
 *   
 *   // Get route context
 *   const context = HelmKnowledge.getRouteContext('/golf/dashboard');
 *   
 *   // Validate code
 *   const codeIssues = HelmKnowledge.validateCode(code, filePath);
 *   
 *   // Validate UI
 *   const uiIssues = HelmKnowledge.validateUI(code);
 *   
 *   // Get component pattern
 *   const pattern = HelmKnowledge.getComponentPattern('playerCard');
 */

// Import all knowledge modules
import { HelmProjectKnowledge, getKnowledge, isValidTableName, isValidPipelineStage, isValidSpacing, getFixTemplate } from './helm-project-knowledge.js';
import { ComponentPatterns, isValidCardPattern, isValidButtonVariant, getPatternForComponent } from './component-patterns.js';
import { RouteContextAnalyzer, getRouteContext, getExpectedComponents, getRouteChecks } from './route-context-analyzer.js';
import { CodeQualityAnalyzer, validateCode, getCodeIssues } from './code-quality-analyzer.js';
import { DesignSystemValidator, validateUI, getUIIssues } from './design-system-validator.js';

// Unified knowledge interface
export const HelmKnowledge = {
  // =============================================
  // PROJECT KNOWLEDGE
  // =============================================
  
  // Full project knowledge object
  project: HelmProjectKnowledge,
  
  // Get knowledge by category
  getKnowledge(category) {
    return getKnowledge(category);
  },
  
  // Get product info
  getProduct() {
    return HelmProjectKnowledge.product;
  },
  
  // Get database schema
  getDatabase() {
    return HelmProjectKnowledge.database;
  },
  
  // Get design system
  getDesignSystem() {
    return HelmProjectKnowledge.designSystem;
  },
  
  // Get domain knowledge
  getDomain(sport) {
    if (sport === 'golf') return HelmProjectKnowledge.golfDomain;
    return HelmProjectKnowledge.baseballDomain;
  },
  
  // =============================================
  // ROUTE CONTEXT
  // =============================================
  
  // Full route analyzer
  routeAnalyzer: RouteContextAnalyzer,
  
  // Get context for a route
  getRouteContext(path) {
    return getRouteContext(path);
  },
  
  // Get expected components for a route
  getExpectedComponents(path) {
    return getExpectedComponents(path);
  },
  
  // Get all checks for a route
  getRouteChecks(path) {
    return getRouteChecks(path);
  },
  
  // Determine domain from route
  getRouteDomain(path) {
    return path.includes('/golf/') ? 'golf' : 'baseball';
  },
  
  // =============================================
  // CODE QUALITY
  // =============================================
  
  // Full code quality analyzer
  codeAnalyzer: CodeQualityAnalyzer,
  
  // Validate code
  validateCode(code, filePath) {
    return validateCode(code, filePath);
  },
  
  // Get issues by severity
  getCodeIssues(code, filePath) {
    return getCodeIssues(code, filePath);
  },
  
  // Check if table name is valid
  isValidTable(name) {
    return isValidTableName(name);
  },
  
  // Check if pipeline stage is valid
  isValidStage(stage) {
    return isValidPipelineStage(stage);
  },
  
  // =============================================
  // DESIGN SYSTEM
  // =============================================
  
  // Full design system validator
  designValidator: DesignSystemValidator,
  
  // Validate UI code
  validateUI(code, componentType) {
    return validateUI(code, componentType);
  },
  
  // Get UI issues summary
  getUIIssues(code) {
    return getUIIssues(code);
  },
  
  // Check spacing value
  isValidSpacing(value) {
    return isValidSpacing(value);
  },
  
  // =============================================
  // COMPONENT PATTERNS
  // =============================================
  
  // Full component patterns
  patterns: ComponentPatterns,
  
  // Get pattern for a component type
  getComponentPattern(type) {
    return getPatternForComponent(type);
  },
  
  // Check if card pattern is valid
  isValidCardPattern(className) {
    return isValidCardPattern(className);
  },
  
  // Check if button variant is valid
  isValidButtonVariant(variant) {
    return isValidButtonVariant(variant);
  },
  
  // =============================================
  // FIX TEMPLATES
  // =============================================
  
  // Get fix template
  getFixTemplate(templateName) {
    return getFixTemplate(templateName);
  },
  
  // Get all fix templates
  getAllFixTemplates() {
    return HelmProjectKnowledge.fixTemplates;
  },
  
  // =============================================
  // COMBINED ANALYSIS
  // =============================================
  
  // Full analysis of a file
  analyzeFile(code, filePath) {
    const routeContext = this.getRouteContext(filePath);
    const codeIssues = this.validateCode(code, filePath);
    const uiIssues = this.validateUI(code);
    
    return {
      route: routeContext,
      codeIssues: {
        total: codeIssues.length,
        issues: codeIssues,
      },
      uiIssues: {
        total: uiIssues.length,
        issues: uiIssues,
      },
      allIssues: [...codeIssues, ...uiIssues],
      summary: {
        blockers: [...codeIssues, ...uiIssues].filter(i => i.severity === 'blocker').length,
        errors: [...codeIssues, ...uiIssues].filter(i => i.severity === 'error').length,
        warnings: [...codeIssues, ...uiIssues].filter(i => i.severity === 'warning').length,
        info: [...codeIssues, ...uiIssues].filter(i => i.severity === 'info').length,
      },
    };
  },
  
  // Generate context prompt for an agent
  generateAgentContext(path, code) {
    const routeContext = this.getRouteContext(path);
    const domain = this.getRouteDomain(path);
    const domainKnowledge = this.getDomain(domain);
    
    return `
## Route Context
- Path: ${path}
- Domain: ${domain}
- Route Type: ${routeContext.routeType}
- Purpose: ${routeContext.purpose || 'Page'}

## Expected Components
${(routeContext.expectedComponents || []).map(c => `- ${c}`).join('\n')}

## Must Have
${(routeContext.mustHave || []).map(m => `- ${m}`).join('\n')}

## Anti-Patterns to Check
${(routeContext.antiPatterns || []).map(a => `- ${a}`).join('\n')}

## Domain Knowledge (${domain})
${JSON.stringify(domainKnowledge, null, 2)}

## Design System Quick Reference
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64px (use p-1 through p-16)
- Border Radius: 8px inputs, 12px buttons, 16px cards, 24px modals
- Glass: Only nav, toolbar, modal - NEVER tables/forms
- Motion: 150ms micro, 200ms small, 300ms medium
- Primary Color: green-600 (hover: green-500)
`;
  },
};

// Re-export individual modules for direct access
export {
  HelmProjectKnowledge,
  ComponentPatterns,
  RouteContextAnalyzer,
  CodeQualityAnalyzer,
  DesignSystemValidator,
};

// Default export
export default HelmKnowledge;
