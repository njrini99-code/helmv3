/**
 * CodeQualityAgent - Validates code patterns, types, imports, and bugs
 * 
 * AGENT COMMUNICATION:
 * - Sends discoveries when issues found
 * - Sends messages to design-system and route-context
 * - Receives requests from other agents
 */

import { BaseAgent } from './coordination/base-agent.js';

export class CodeQualityAgent extends BaseAgent {
  constructor(config = {}) {
    super('code-quality', [
      'type-validation',
      'import-validation',
      'pattern-detection',
      'bug-detection',
      'convention-check',
    ]);

    this.config = {
      icon: '🔍',
      color: '#ef4444',
      description: 'Validates code quality, types, and patterns',
    };

    this.projectRoot = config.projectRoot || process.cwd();
    
    // Rules
    this.rules = {
      bannedImports: ['import React from', 'require('],
      bannedTypes: [': any', ': object', ': Function'],
      requiredDirectives: ["'use client'", '"use client"'],
    };
  }

  async initialize() {
    this.log('info', 'Initializing code quality checks...');
    this.log('success', 'Code quality agent ready');
    return true;
  }

  /**
   * Analyze a file
   */
  async analyzeFile(filePath, content) {
    return this.executeTask(`Analyze ${filePath}`, async () => {
      const issues = [];
      const metrics = {
        lines: content.split('\n').length,
      };

      // Run all checks
      issues.push(...this.checkImports(content, filePath));
      issues.push(...this.checkTypes(content, filePath));
      issues.push(...this.checkPatterns(content, filePath));
      issues.push(...this.checkBugs(content, filePath));

      // Calculate score
      const score = this.calculateScore(issues);

      const result = {
        filePath,
        score,
        issues,
        metrics,
        timestamp: Date.now(),
      };

      // AGENT COMMUNICATION: Share discovery
      if (issues.length > 0) {
        this.shareDiscovery('code-issues-found', {
          filePath,
          issueCount: issues.length,
          severity: issues.some(i => i.severity === 'error') ? 'error' : 'warning',
          topIssues: issues.slice(0, 3).map(i => i.title),
        });

        // Send message to improvement agent
        this.sendToAgent('improvement', 'issues-detected', {
          filePath,
          issues: issues.map(i => ({ id: i.id, category: i.category, severity: i.severity })),
        });
      }

      return result;
    });
  }

  /**
   * Check imports
   */
  checkImports(content, filePath) {
    const issues = [];

    // Banned imports
    for (const banned of this.rules.bannedImports) {
      if (content.includes(banned)) {
        issues.push({
          id: `banned-import-${banned.replace(/[^a-z]/gi, '')}`,
          category: 'code',
          severity: 'warning',
          title: 'Banned import pattern',
          description: `Found banned pattern: "${banned}"`,
          location: filePath,
          suggestedFix: banned.includes('require') 
            ? 'Use ES6 import syntax' 
            : 'Use named imports from react',
          effort: 'low',
        });
      }
    }

    // Missing use client
    const hasClientFeatures = content.includes('useState') || 
                              content.includes('useEffect') ||
                              content.includes('onClick');
    
    const hasDirective = this.rules.requiredDirectives.some(d => content.includes(d));
    
    if (hasClientFeatures && !hasDirective) {
      issues.push({
        id: 'missing-use-client',
        category: 'code',
        severity: 'error',
        title: 'Missing "use client" directive',
        description: 'File uses client features without directive',
        location: filePath,
        suggestedFix: 'Add "use client" at the top of the file',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Check TypeScript types
   */
  checkTypes(content, filePath) {
    const issues = [];

    // Check for any types
    const anyMatches = content.match(/:\s*any\b/g);
    if (anyMatches && anyMatches.length > 0) {
      issues.push({
        id: 'any-type',
        category: 'code',
        severity: 'warning',
        title: 'TypeScript "any" type',
        description: `Found ${anyMatches.length} uses of "any"`,
        location: filePath,
        suggestedFix: 'Replace with proper types',
        effort: 'medium',
        count: anyMatches.length,
      });
    }

    return issues;
  }

  /**
   * Check patterns
   */
  checkPatterns(content, filePath) {
    const issues = [];

    // Console statements
    const consoleMatches = content.match(/console\.(log|warn|error|info|debug)\(/g);
    if (consoleMatches && consoleMatches.length > 0) {
      issues.push({
        id: 'console-statements',
        category: 'code',
        severity: 'warning',
        title: 'Console statements',
        description: `Found ${consoleMatches.length} console statements`,
        location: filePath,
        suggestedFix: 'Remove before production',
        effort: 'low',
        count: consoleMatches.length,
      });
    }

    // TODO comments
    const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi);
    if (todoMatches && todoMatches.length > 0) {
      issues.push({
        id: 'todo-comments',
        category: 'code',
        severity: 'info',
        title: 'TODO comments',
        description: `Found ${todoMatches.length} TODO/FIXME comments`,
        location: filePath,
        suggestedFix: 'Address before shipping',
        effort: 'varies',
        count: todoMatches.length,
      });
    }

    // Empty catch
    if (content.match(/catch\s*\([^)]*\)\s*{\s*}/)) {
      issues.push({
        id: 'empty-catch',
        category: 'code',
        severity: 'error',
        title: 'Empty catch block',
        description: 'Silently swallowing errors',
        location: filePath,
        suggestedFix: 'Add error handling',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Check for bugs
   */
  checkBugs(content, filePath) {
    const issues = [];

    // Async without await
    if (content.includes('async') && !content.includes('await')) {
      issues.push({
        id: 'async-no-await',
        category: 'code',
        severity: 'warning',
        title: 'Async without await',
        description: 'Async function has no await',
        location: filePath,
        suggestedFix: 'Use await or remove async',
        effort: 'low',
      });
    }

    // Direct DOM access
    if ((content.includes('document.') || content.includes('window.')) && 
        !content.includes('typeof window')) {
      issues.push({
        id: 'direct-dom',
        category: 'code',
        severity: 'warning',
        title: 'Direct DOM access',
        description: 'May cause SSR issues',
        location: filePath,
        suggestedFix: 'Guard with typeof window check',
        effort: 'medium',
      });
    }

    return issues;
  }

  /**
   * Calculate score
   */
  calculateScore(issues) {
    let score = 100;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error': score -= 15; break;
        case 'warning': score -= 5; break;
        case 'info': score -= 1; break;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'request-analysis':
        // Another agent wants us to analyze something
        this.log('receive', `Analysis request from ${message.from}`);
        // Would trigger analysis here
        break;
        
      case 'discovery':
        // React to discoveries
        if (message.payload.type === 'design-issues-found') {
          this.log('info', `Design issues found in ${message.payload.data.filePath}`);
        }
        break;
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      rulesCount: Object.values(this.rules).flat().length,
    };
  }
}

export default CodeQualityAgent;
