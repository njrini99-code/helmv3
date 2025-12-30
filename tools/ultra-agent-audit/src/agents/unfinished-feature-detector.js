/**
 * UnfinishedFeatureDetector - Finds incomplete features and TODOs
 *
 * This agent scans for:
 * - TODO/FIXME comments
 * - Empty function bodies
 * - Placeholder content
 * - Missing error handling
 * - Missing loading states
 * - Incomplete implementations
 * - Dead code paths
 *
 * NO PAID API CALLS - Pattern-based detection
 */

import { BaseAgent } from './coordination/base-agent.js';

export class UnfinishedFeatureDetector extends BaseAgent {
  constructor(config = {}) {
    super('unfinished-detector', [
      'todo-detection',
      'incomplete-features',
      'placeholder-detection',
      'dead-code-detection',
    ]);

    this.config = {
      icon: '🚧',
      color: '#f97316',
      description: 'Detects unfinished features and incomplete implementations',
    };

    this.unfinishedItems = [];
  }

  async initialize() {
    this.log('info', 'Initializing Unfinished Feature Detector...');
    this.log('success', 'Ready to hunt for incomplete work');
    return true;
  }

  /**
   * Scan code for unfinished work
   */
  async scanForUnfinished(code, filePath) {
    return this.executeTask(`Scan ${filePath}`, async () => {
      const issues = [];

      // 1. TODO/FIXME comments
      issues.push(...this.detectTODOs(code, filePath));

      // 2. Empty functions
      issues.push(...this.detectEmptyFunctions(code, filePath));

      // 3. Placeholder content
      issues.push(...this.detectPlaceholders(code, filePath));

      // 4. Missing error handling
      issues.push(...this.detectMissingErrorHandling(code, filePath));

      // 5. Missing loading states
      issues.push(...this.detectMissingLoadingStates(code, filePath));

      // 6. Console statements (dev leftovers)
      issues.push(...this.detectConsoleStatements(code, filePath));

      // 7. Dead code
      issues.push(...this.detectDeadCode(code, filePath));

      // 8. Incomplete forms
      issues.push(...this.detectIncompleteForms(code, filePath));

      // Store unfinished items
      for (const issue of issues) {
        this.unfinishedItems.unshift({ ...issue, filePath, timestamp: Date.now() });
      }

      // Share discovery
      if (issues.length > 0) {
        this.shareDiscovery('unfinished-work-found', {
          filePath,
          count: issues.length,
          categories: [...new Set(issues.map(i => i.category))],
        });
      }

      return {
        filePath,
        issues,
        completeness: this.calculateCompleteness(issues),
        timestamp: Date.now(),
      };
    });
  }

  /**
   * Detect TODO/FIXME comments
   */
  detectTODOs(code, filePath) {
    const issues = [];
    const todoPattern = /(\/\/|\/\*|\*)\s*(TODO|FIXME|HACK|XXX|NOTE|BUG):?\s*(.+)/gi;

    let match;
    while ((match = todoPattern.exec(code)) !== null) {
      const [, , type, message] = match;
      issues.push({
        id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        category: 'todo-comment',
        severity: type === 'FIXME' || type === 'BUG' ? 'error' : 'warning',
        title: `${type}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
        description: message.trim(),
        location: filePath,
        suggestedFix: 'Complete the TODO or remove if no longer needed',
        effort: 'varies',
        lineNumber: this.getLineNumber(code, match.index),
      });
    }

    return issues;
  }

  /**
   * Detect empty function bodies
   */
  detectEmptyFunctions(code, filePath) {
    const issues = [];

    // Match empty functions
    const emptyFunctionPattern = /(function|const|let)\s+(\w+)\s*=?\s*(?:async)?\s*\([^)]*\)\s*(?:=>)?\s*\{\s*\}/g;

    let match;
    while ((match = emptyFunctionPattern.exec(code)) !== null) {
      const [, , funcName] = match;

      // Skip common patterns that are intentionally empty
      if (funcName === 'noop' || funcName === 'handleClose') continue;

      issues.push({
        id: `empty-function-${funcName}-${Date.now()}`,
        category: 'incomplete-implementation',
        severity: 'warning',
        title: `Empty function: ${funcName}`,
        description: `Function ${funcName} has no implementation`,
        location: filePath,
        suggestedFix: 'Implement the function or remove if unused',
        effort: 'medium',
        lineNumber: this.getLineNumber(code, match.index),
      });
    }

    return issues;
  }

  /**
   * Detect placeholder content
   */
  detectPlaceholders(code, filePath) {
    const issues = [];

    const placeholders = [
      /coming soon/gi,
      /under construction/gi,
      /work in progress/gi,
      /placeholder/gi,
      /lorem ipsum/gi,
      /\bTBD\b/g,
      /Not implemented/gi,
    ];

    for (const pattern of placeholders) {
      if (pattern.test(code)) {
        const matches = code.match(pattern);
        issues.push({
          id: `placeholder-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          category: 'placeholder-content',
          severity: 'warning',
          title: `Placeholder content found: "${matches[0]}"`,
          description: 'Replace placeholder with real content',
          location: filePath,
          suggestedFix: 'Replace with production-ready content',
          effort: 'varies',
        });
      }
    }

    return issues;
  }

  /**
   * Detect missing error handling
   */
  detectMissingErrorHandling(code, filePath) {
    const issues = [];

    // Check for fetch/async without try-catch
    const asyncPattern = /async\s+function\s+(\w+)|const\s+(\w+)\s*=\s*async/g;
    const tryCatchPattern = /try\s*\{[\s\S]*?\}\s*catch/g;

    const asyncFunctions = code.match(asyncPattern) || [];
    const tryCatchBlocks = code.match(tryCatchPattern) || [];

    if (asyncFunctions.length > tryCatchBlocks.length) {
      const missing = asyncFunctions.length - tryCatchBlocks.length;
      issues.push({
        id: `missing-error-handling-${Date.now()}`,
        category: 'missing-error-handling',
        severity: 'error',
        title: `${missing} async function(s) without error handling`,
        description: 'Async functions should have try-catch blocks',
        location: filePath,
        suggestedFix: 'Wrap async code in try-catch blocks',
        effort: 'low',
      });
    }

    // Check for .then without .catch
    const thenWithoutCatch = /\.then\([^)]+\)(?!\s*\.catch)/g;
    const matches = code.match(thenWithoutCatch);
    if (matches && matches.length > 0) {
      issues.push({
        id: `promise-without-catch-${Date.now()}`,
        category: 'missing-error-handling',
        severity: 'warning',
        title: `${matches.length} promise(s) without .catch()`,
        description: 'Promises should have error handling',
        location: filePath,
        suggestedFix: 'Add .catch() to handle errors',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Detect missing loading states
   */
  detectMissingLoadingStates(code, filePath) {
    const issues = [];

    // Check for fetch/async but no loading state
    const hasFetch = /fetch\(|axios\.|await\s+\w+\(/.test(code);
    const hasLoadingState = /isLoading|loading|isPending|isFetching/.test(code);

    if (hasFetch && !hasLoadingState) {
      issues.push({
        id: `missing-loading-state-${Date.now()}`,
        category: 'missing-loading-state',
        severity: 'warning',
        title: 'Async data fetching without loading state',
        description: 'Users see nothing while data loads - add loading UI',
        location: filePath,
        suggestedFix: 'Add useState for loading + skeleton loader',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Detect console statements (dev leftovers)
   */
  detectConsoleStatements(code, filePath) {
    const issues = [];

    const consolePattern = /console\.(log|warn|error|info|debug)\(/g;
    const matches = code.match(consolePattern);

    if (matches && matches.length > 0) {
      issues.push({
        id: `console-statements-${Date.now()}`,
        category: 'dev-leftover',
        severity: 'warning',
        title: `${matches.length} console statement(s)`,
        description: 'Remove console statements before production',
        location: filePath,
        suggestedFix: 'Remove or replace with proper logging',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Detect dead code
   */
  detectDeadCode(code, filePath) {
    const issues = [];

    // Unreachable code after return
    const unreachablePattern = /return\s+[^;]+;[\s\n]+(?![\s\n]*\})[^}]+/g;
    const matches = code.match(unreachablePattern);

    if (matches && matches.length > 0) {
      issues.push({
        id: `unreachable-code-${Date.now()}`,
        category: 'dead-code',
        severity: 'warning',
        title: 'Unreachable code detected',
        description: 'Code after return statement will never execute',
        location: filePath,
        suggestedFix: 'Remove unreachable code',
        effort: 'low',
      });
    }

    // Unused variables (basic detection)
    const declaredVars = [...code.matchAll(/const\s+(\w+)\s*=/g)].map(m => m[1]);
    const unusedVars = declaredVars.filter(v => {
      const usagePattern = new RegExp(`\\b${v}\\b`, 'g');
      const matches = code.match(usagePattern) || [];
      return matches.length === 1; // Only declaration, no usage
    });

    if (unusedVars.length > 0) {
      issues.push({
        id: `unused-variables-${Date.now()}`,
        category: 'dead-code',
        severity: 'info',
        title: `${unusedVars.length} unused variable(s)`,
        description: `Variables declared but never used: ${unusedVars.slice(0, 3).join(', ')}`,
        location: filePath,
        suggestedFix: 'Remove unused variables',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Detect incomplete forms
   */
  detectIncompleteForms(code, filePath) {
    const issues = [];

    // Form without onSubmit
    if (/<form/i.test(code) && !/onSubmit=/i.test(code)) {
      issues.push({
        id: `form-no-submit-${Date.now()}`,
        category: 'incomplete-form',
        severity: 'error',
        title: 'Form without onSubmit handler',
        description: 'Form has no submit handler - cannot be submitted',
        location: filePath,
        suggestedFix: 'Add onSubmit handler to form',
        effort: 'medium',
      });
    }

    // Input without label
    const inputs = code.match(/<input/gi) || [];
    const labels = code.match(/<label/gi) || [];

    if (inputs.length > labels.length) {
      issues.push({
        id: `input-without-label-${Date.now()}`,
        category: 'accessibility-incomplete',
        severity: 'warning',
        title: `${inputs.length - labels.length} input(s) without labels`,
        description: 'Inputs need labels for accessibility',
        location: filePath,
        suggestedFix: 'Add label for each input',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Calculate completeness score
   */
  calculateCompleteness(issues) {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'error': score -= 15; break;
        case 'warning': score -= 5; break;
        case 'info': score -= 2; break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Get line number from character index
   */
  getLineNumber(code, index) {
    const upToIndex = code.substring(0, index);
    return upToIndex.split('\n').length;
  }

  /**
   * Get all unfinished items
   */
  getAllUnfinished() {
    return this.unfinishedItems;
  }

  /**
   * Get unfinished by category
   */
  getByCategory(category) {
    return this.unfinishedItems.filter(i => i.category === category);
  }

  /**
   * Get critical unfinished items
   */
  getCritical() {
    return this.unfinishedItems.filter(i => i.severity === 'error');
  }

  getStatus() {
    return {
      ...this.getStats(),
      unfinishedCount: this.unfinishedItems.length,
      criticalCount: this.getCritical().length,
      categories: [...new Set(this.unfinishedItems.map(i => i.category))],
    };
  }
}

export default UnfinishedFeatureDetector;
