/**
 * 🔍 CodeAgent - Code Quality & Completeness
 * 
 * THE DETECTIVE. Finds:
 * - TypeScript issues (any types, missing types)
 * - Missing directives ("use client")
 * - Console statements left in code
 * - Unfinished features (TODOs, placeholders)
 * - Route validation issues
 * - Import/export problems
 * 
 * Combines: codeQuality, routeContext, unfinishedDetector
 */

import { BaseAgent } from '../coordination/base-agent.js';
import HelmKnowledge from '../../knowledge/helm-knowledge.js';

export class CodeAgent extends BaseAgent {
  constructor(config = {}) {
    super('code', [
      'typescript-analysis',
      'directive-check',
      'console-detection',
      'unfinished-detection',
      'route-validation',
      'import-analysis',
    ]);

    this.config = {
      icon: '🔍',
      color: '#ef4444',
      description: 'Code quality detective - finds issues and incomplete features',
    };

    this.helmKnowledge = HelmKnowledge;
  }

  async initialize() {
    this.log('info', 'Code detective ready...');
    this.log('success', 'Loaded code quality rules');
    return true;
  }

  /**
   * Full code analysis
   */
  async analyze(routePath, code) {
    return this.executeTask(`Code analysis: ${routePath}`, async () => {
      const issues = [];
      let score = 100;

      // 1. TypeScript Issues
      const tsIssues = this.checkTypeScript(code);
      issues.push(...tsIssues);
      score -= tsIssues.length * 5;

      // 2. Directive Check
      const directiveIssues = this.checkDirectives(code, routePath);
      issues.push(...directiveIssues);
      score -= directiveIssues.filter(i => i.severity === 'error').length * 10;

      // 3. Console Statements
      const consoleIssues = this.checkConsole(code);
      issues.push(...consoleIssues);
      score -= consoleIssues.length * 3;

      // 4. Unfinished Features
      const unfinishedIssues = this.checkUnfinished(code);
      issues.push(...unfinishedIssues);
      score -= unfinishedIssues.length * 5;

      // 5. Route Validation
      const routeIssues = this.checkRoute(routePath, code);
      issues.push(...routeIssues);
      score -= routeIssues.length * 3;

      // 6. Import Issues
      const importIssues = this.checkImports(code);
      issues.push(...importIssues);
      score -= importIssues.length * 2;

      // Add WHY and RESULT to all issues
      for (const issue of issues) {
        issue.why = issue.why || this.getWhy(issue.id);
        issue.result = issue.result || this.getResult(issue.id);
        issue.source = 'code';
      }

      const result = {
        routePath,
        timestamp: Date.now(),
        score: Math.max(0, score),
        issues,
        summary: {
          total: issues.length,
          errors: issues.filter(i => i.severity === 'error').length,
          warnings: issues.filter(i => i.severity === 'warning').length,
          info: issues.filter(i => i.severity === 'info').length,
        },
      };

      this.shareDiscovery('code-analysis', {
        routePath,
        score: result.score,
        issues: issues.length,
      });

      return result;
    });
  }

  /**
   * Check TypeScript issues
   */
  checkTypeScript(code) {
    const issues = [];

    // Any types
    const anyMatches = code.match(/:\s*any\b/g) || [];
    if (anyMatches.length > 0) {
      issues.push({
        id: 'ts-any-type',
        title: `Using 'any' type (${anyMatches.length}x)`,
        description: `Found ${anyMatches.length} uses of 'any' type which defeats TypeScript's purpose`,
        category: 'typescript',
        severity: 'warning',
        priority: 'medium',
        effort: 'low',
        count: anyMatches.length,
      });
    }

    // Missing return types on functions
    const funcWithoutReturn = (code.match(/(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*{/g) || [])
      .filter(f => !f.includes(':'));
    if (funcWithoutReturn.length > 0) {
      issues.push({
        id: 'ts-missing-return',
        title: 'Functions missing return types',
        description: `${funcWithoutReturn.length} functions without explicit return types`,
        category: 'typescript',
        severity: 'info',
        priority: 'low',
        effort: 'low',
      });
    }

    // @ts-ignore comments
    const ignoreCount = (code.match(/@ts-ignore|@ts-nocheck/g) || []).length;
    if (ignoreCount > 0) {
      issues.push({
        id: 'ts-ignore',
        title: `TypeScript ignores (${ignoreCount}x)`,
        description: 'Using @ts-ignore suppresses type errors instead of fixing them',
        category: 'typescript',
        severity: 'warning',
        priority: 'medium',
        effort: 'medium',
      });
    }

    return issues;
  }

  /**
   * Check React directives
   */
  checkDirectives(code, routePath) {
    const issues = [];

    // Check if needs "use client"
    const needsClient = /useState|useEffect|useRef|useContext|onClick|onChange|onSubmit/i.test(code);
    const hasClient = code.includes('"use client"') || code.includes("'use client'");

    if (needsClient && !hasClient) {
      issues.push({
        id: 'missing-use-client',
        title: 'Missing "use client" directive',
        description: 'This component uses React hooks or event handlers but lacks the client directive',
        category: 'react',
        severity: 'error',
        priority: 'critical',
        effort: 'low',
        fix: 'Add "use client" at the top of the file',
      });
    }

    return issues;
  }

  /**
   * Check console statements
   */
  checkConsole(code) {
    const issues = [];

    const consoleMatches = code.match(/console\.(log|warn|error|debug|info)\s*\(/g) || [];
    if (consoleMatches.length > 0) {
      issues.push({
        id: 'console-statements',
        title: `Console statements (${consoleMatches.length}x)`,
        description: 'Console statements should be removed before production',
        category: 'cleanup',
        severity: 'warning',
        priority: 'medium',
        effort: 'low',
        count: consoleMatches.length,
      });
    }

    return issues;
  }

  /**
   * Check for unfinished features
   */
  checkUnfinished(code) {
    const issues = [];

    // TODOs
    const todoMatches = code.match(/\/\/\s*TODO[:\s]?.*/gi) || [];
    if (todoMatches.length > 0) {
      issues.push({
        id: 'todo-comments',
        title: `TODO comments (${todoMatches.length}x)`,
        description: 'Unfinished work marked with TODO',
        category: 'incomplete',
        severity: 'info',
        priority: 'medium',
        effort: 'varies',
        items: todoMatches.slice(0, 5).map(t => t.replace(/\/\/\s*TODO[:\s]?/i, '').trim()),
      });
    }

    // FIXMEs
    const fixmeMatches = code.match(/\/\/\s*FIXME[:\s]?.*/gi) || [];
    if (fixmeMatches.length > 0) {
      issues.push({
        id: 'fixme-comments',
        title: `FIXME comments (${fixmeMatches.length}x)`,
        description: 'Known issues marked with FIXME',
        category: 'incomplete',
        severity: 'warning',
        priority: 'high',
        effort: 'varies',
      });
    }

    // Placeholder text
    const placeholders = code.match(/lorem ipsum|placeholder|coming soon|tbd|xxx/gi) || [];
    if (placeholders.length > 0) {
      issues.push({
        id: 'placeholder-content',
        title: 'Placeholder content found',
        description: 'Temporary placeholder text that needs to be replaced',
        category: 'incomplete',
        severity: 'warning',
        priority: 'medium',
        effort: 'low',
      });
    }

    // Empty functions/handlers
    const emptyHandlers = code.match(/=>\s*{\s*}|function\s*\([^)]*\)\s*{\s*}/g) || [];
    if (emptyHandlers.length > 0) {
      issues.push({
        id: 'empty-handlers',
        title: `Empty handlers (${emptyHandlers.length}x)`,
        description: 'Functions or handlers with no implementation',
        category: 'incomplete',
        severity: 'warning',
        priority: 'high',
        effort: 'medium',
      });
    }

    // Commented out code blocks
    const commentedCode = code.match(/\/\*[\s\S]*?\*\/|\/\/.*(?:function|const|let|var|import|export)/g) || [];
    if (commentedCode.length > 3) {
      issues.push({
        id: 'commented-code',
        title: 'Large amount of commented code',
        description: 'Commented code should be removed or restored',
        category: 'cleanup',
        severity: 'info',
        priority: 'low',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Check route-specific issues
   */
  checkRoute(routePath, code) {
    const issues = [];
    const routeContext = this.helmKnowledge.getRouteContext(routePath);

    if (!routeContext) return issues;

    // Check for expected patterns based on route type
    const routeType = routeContext.type;

    if (routeType === 'list' || routeType === 'dashboard') {
      if (!code.includes('map(') && !code.includes('.map')) {
        issues.push({
          id: 'route-missing-list',
          title: 'List route without mapping',
          description: 'This appears to be a list view but doesn\'t render items',
          category: 'route-pattern',
          severity: 'info',
          priority: 'medium',
          effort: 'medium',
        });
      }
    }

    if (routeType === 'form' || routeType === 'create' || routeType === 'edit') {
      if (!code.includes('onSubmit') && !code.includes('handleSubmit')) {
        issues.push({
          id: 'route-missing-submit',
          title: 'Form route without submit handler',
          description: 'This appears to be a form but lacks submit handling',
          category: 'route-pattern',
          severity: 'warning',
          priority: 'high',
          effort: 'medium',
        });
      }
    }

    return issues;
  }

  /**
   * Check import issues
   */
  checkImports(code) {
    const issues = [];

    // Unused imports (simple check)
    const imports = code.match(/import\s+{([^}]+)}\s+from/g) || [];
    for (const imp of imports) {
      const names = imp.match(/{([^}]+)}/)?.[1]?.split(',').map(n => n.trim()) || [];
      for (const name of names) {
        const cleanName = name.split(' as ')[0].trim();
        // Check if name is used elsewhere in code (rough check)
        const regex = new RegExp(`\\b${cleanName}\\b`, 'g');
        const matches = code.match(regex) || [];
        if (matches.length <= 1) { // Only the import itself
          issues.push({
            id: `unused-import-${cleanName}`,
            title: `Potentially unused import: ${cleanName}`,
            description: `${cleanName} is imported but may not be used`,
            category: 'imports',
            severity: 'info',
            priority: 'low',
            effort: 'low',
          });
        }
      }
    }

    return issues.slice(0, 3); // Limit to avoid noise
  }

  /**
   * Get WHY explanation for issue
   */
  getWhy(id) {
    const whyMap = {
      'missing-use-client': 'React hooks require client-side rendering. Without the directive, Next.js tries to render server-side and fails.',
      'console-statements': 'Console statements pollute production logs and can expose internal data.',
      'ts-any-type': 'Using `any` defeats TypeScript\'s purpose - bugs slip through that would be caught at compile time.',
      'ts-ignore': 'Ignoring type errors hides problems instead of fixing them.',
      'todo-comments': 'TODOs represent unfinished work that may be forgotten.',
      'fixme-comments': 'FIXMEs indicate known bugs that need attention.',
      'empty-handlers': 'Empty handlers do nothing when users interact - buttons don\'t work.',
      'placeholder-content': 'Placeholder text looks unprofessional and confuses users.',
    };
    return whyMap[id] || 'This affects code quality.';
  }

  /**
   * Get RESULT explanation for issue
   */
  getResult(id) {
    const resultMap = {
      'missing-use-client': 'Component renders correctly with hooks working.',
      'console-statements': 'Clean production code with no debug output.',
      'ts-any-type': 'Type-safe code that catches errors at compile time.',
      'ts-ignore': 'Properly typed code without suppressions.',
      'todo-comments': 'All planned work is complete.',
      'fixme-comments': 'All known issues are resolved.',
      'empty-handlers': 'All interactions work as expected.',
      'placeholder-content': 'Real content in place.',
    };
    return resultMap[id] || 'Issue resolved.';
  }

  getStatus() {
    return { ...this.getStats() };
  }
}

export default CodeAgent;
