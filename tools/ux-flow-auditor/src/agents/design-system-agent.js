/**
 * DesignSystemAgent - Validates UI against Helm design system
 * 
 * Uses: DesignSystemValidator from knowledge system
 * 
 * Capabilities:
 * - Spacing scale validation (4, 8, 12, 16, 24, 32, 48, 64)
 * - Border radius consistency
 * - Glass effect usage (nav/toolbar only, NOT tables/forms)
 * - Animation timing validation
 * - Color palette compliance
 * - Component pattern validation
 * - Accessibility checks
 * - Responsive design validation
 */

import { BaseAgent } from './coordination/base-agent.js';
import { DesignSystemValidator } from '../knowledge/design-system-validator.js';
import { ComponentPatterns } from '../knowledge/component-patterns.js';
import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export class DesignSystemAgent extends BaseAgent {
  constructor(config = {}) {
    super('design-system', [
      'spacing-validation',
      'radius-validation',
      'glass-validation',
      'animation-validation',
      'color-validation',
      'component-validation',
      'accessibility-check',
      'responsive-check',
    ]);
    
    this.projectRoot = config.projectRoot;
    this.componentsDir = path.join(config.projectRoot || '.', 'src/components');
    this.appDir = path.join(config.projectRoot || '.', 'src/app');
    
    this.validator = DesignSystemValidator;
    this.patterns = ComponentPatterns;
    
    // Results cache
    this.fileResults = new Map();
    this.lastFullScan = null;
    
    // Design system quick reference
    this.designSystem = {
      spacing: [4, 8, 12, 16, 24, 32, 48, 64],
      radii: { input: 8, button: 12, card: 16, modal: 24 },
      transitions: { hover: 150, state: 220, modal: 300 },
      glassAllowed: ['nav', 'toolbar', 'modal', 'sidebar', 'filter'],
      glassForbidden: ['table', 'form', 'card-content', 'list'],
    };
  }

  async start(sharedState) {
    super.start(sharedState);
    this.log('info', 'Design System Agent ready');
    this.log('info', `Design system: ${this.designSystem.spacing.length} spacing values, ${Object.keys(this.designSystem.radii).length} radius rules`);
  }

  /**
   * Analyze a single file for design system compliance
   */
  async analyzeFile(filePath) {
    const startTime = Date.now();
    
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.projectRoot, filePath);
      
      const content = await fs.readFile(absolutePath, 'utf8');
      const relativePath = path.relative(this.projectRoot, absolutePath);
      
      // Determine component type from path/content
      const componentType = this.detectComponentType(relativePath, content);
      
      const issues = this.validator.validateUI(content, componentType);
      const summary = this.validator.getSummary(issues);
      
      const result = {
        file: relativePath,
        componentType,
        issues,
        summary: {
          total: issues.length,
          categories: summary.categories,
          bySeverity: {
            error: issues.filter(i => i.severity === 'error').length,
            warning: issues.filter(i => i.severity === 'warning').length,
            info: issues.filter(i => i.severity === 'info').length,
          },
        },
        analyzedAt: Date.now(),
        duration: Date.now() - startTime,
      };
      
      this.fileResults.set(relativePath, result);
      
      // Emit activity for significant issues
      const significantIssues = issues.filter(i => i.severity !== 'info');
      if (significantIssues.length > 0) {
        this.emit('activity', {
          agent: this.name,
          action: 'design-violation',
          target: relativePath,
          message: `Found ${significantIssues.length} design system violations`,
        });
      }
      
      return result;
    } catch (error) {
      this.log('error', `Failed to analyze ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect component type from file path and content
   */
  detectComponentType(filePath, content) {
    // Check path patterns
    if (filePath.includes('/ui/')) return 'ui-primitive';
    if (filePath.includes('/features/')) return 'feature';
    if (filePath.includes('/layout/')) return 'layout';
    if (filePath.includes('/golf/')) return 'golf-feature';
    if (filePath.includes('/coach/')) return 'coach-feature';
    if (filePath.includes('/player/')) return 'player-feature';
    
    // Check content patterns
    if (/Card|card/.test(content)) return 'card';
    if (/Button|btn/.test(content)) return 'button';
    if (/Modal|Dialog/.test(content)) return 'modal';
    if (/Form|form/.test(content)) return 'form';
    if (/Table|table/.test(content)) return 'table';
    if (/Nav|navigation|Sidebar/.test(content)) return 'navigation';
    
    return 'component';
  }

  /**
   * Run full design system scan
   */
  async fullScan() {
    this.log('info', 'Starting full design system scan...');
    const startTime = Date.now();
    
    this.emit('activity', {
      agent: this.name,
      action: 'scan-start',
      message: 'Analyzing design system compliance',
    });
    
    // Scan both components and app directories
    const componentFiles = await fg(['**/*.{tsx,jsx}'], {
      cwd: this.componentsDir,
      ignore: ['**/node_modules/**'],
      absolute: true,
    });
    
    const appFiles = await fg(['**/*.{tsx,jsx}'], {
      cwd: this.appDir,
      ignore: ['**/node_modules/**', '**/.next/**'],
      absolute: true,
    });
    
    const allFiles = [...componentFiles, ...appFiles];
    
    const results = {
      files: [],
      summary: {
        totalFiles: allFiles.length,
        filesWithIssues: 0,
        totalIssues: 0,
        byCategory: {},
        bySeverity: { error: 0, warning: 0, info: 0 },
        topViolations: [],
      },
      designSystemHealth: 100,
      timestamp: Date.now(),
    };
    
    for (const file of allFiles) {
      const result = await this.analyzeFile(file);
      if (result) {
        results.files.push(result);
        
        if (result.issues.length > 0) {
          results.summary.filesWithIssues++;
          results.summary.totalIssues += result.issues.length;
          
          // Count by category
          for (const issue of result.issues) {
            const category = issue.type.split('-')[0];
            results.summary.byCategory[category] = (results.summary.byCategory[category] || 0) + 1;
            results.summary.bySeverity[issue.severity]++;
          }
        }
      }
    }
    
    // Calculate design system health score
    const errorWeight = 10;
    const warningWeight = 3;
    const maxPenalty = 100;
    const penalty = Math.min(
      results.summary.bySeverity.error * errorWeight + 
      results.summary.bySeverity.warning * warningWeight,
      maxPenalty
    );
    results.designSystemHealth = Math.max(0, 100 - penalty);
    
    // Get top violations
    const violationCounts = Object.entries(results.summary.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    results.summary.topViolations = violationCounts.map(([category, count]) => ({
      category,
      count,
      description: this.getViolationDescription(category),
    }));
    
    results.duration = Date.now() - startTime;
    this.lastFullScan = results;
    
    this.emit('activity', {
      agent: this.name,
      action: 'scan-complete',
      target: 'coordinator',
      message: `Design health: ${results.designSystemHealth}% (${results.summary.totalIssues} issues)`,
    });
    
    this.log('info', `Scan complete: ${results.designSystemHealth}% health in ${results.duration}ms`);
    
    return results;
  }

  /**
   * Get human-readable violation description
   */
  getViolationDescription(category) {
    const descriptions = {
      spacing: 'Non-standard spacing values (use 4, 8, 12, 16, 24, 32, 48, 64)',
      glass: 'Glass effect misuse (only nav, toolbar, modal allowed)',
      animation: 'Non-standard animation timing',
      color: 'Non-standard color usage',
      button: 'Button pattern violations',
      card: 'Card pattern violations',
      a11y: 'Accessibility issues',
      responsive: 'Responsive design issues',
    };
    return descriptions[category] || 'Design system violation';
  }

  /**
   * Check specific pattern compliance
   */
  checkPattern(content, patternName) {
    const pattern = this.patterns[patternName];
    if (!pattern) return { valid: true, issues: [] };
    
    const issues = [];
    
    // Check for required classes
    if (pattern.mustHave) {
      for (const required of pattern.mustHave) {
        if (!content.includes(required)) {
          issues.push({
            type: 'pattern-missing',
            severity: 'warning',
            message: `Missing required pattern: ${required}`,
            pattern: patternName,
          });
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get glass effect violations
   */
  getGlassViolations() {
    const violations = [];
    
    for (const [file, result] of this.fileResults) {
      const glassIssues = result.issues.filter(i => i.type.startsWith('glass'));
      if (glassIssues.length > 0) {
        violations.push({
          file,
          issues: glassIssues,
        });
      }
    }
    
    return violations;
  }

  /**
   * Get spacing violations
   */
  getSpacingViolations() {
    const violations = [];
    
    for (const [file, result] of this.fileResults) {
      const spacingIssues = result.issues.filter(i => i.type === 'spacing');
      if (spacingIssues.length > 0) {
        violations.push({
          file,
          issues: spacingIssues,
        });
      }
    }
    
    return violations;
  }

  /**
   * Get component-specific recommendations
   */
  getComponentRecommendations(componentType) {
    const pattern = this.patterns[componentType];
    if (!pattern) return null;
    
    return {
      type: componentType,
      recommendations: pattern,
      designSystem: this.designSystem,
    };
  }

  /**
   * Get status summary
   */
  getStatus() {
    const lastScan = this.lastFullScan;
    
    return {
      name: this.name,
      state: this.state,
      filesAnalyzed: this.fileResults.size,
      designSystemHealth: lastScan?.designSystemHealth || null,
      lastScan: lastScan ? {
        timestamp: lastScan.timestamp,
        files: lastScan.summary.totalFiles,
        issues: lastScan.summary.totalIssues,
        duration: lastScan.duration,
      } : null,
      topViolations: lastScan?.summary.topViolations || [],
    };
  }
}

export default DesignSystemAgent;
