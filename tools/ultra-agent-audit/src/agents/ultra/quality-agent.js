/**
 * ✅ QualityAgent - Validation & Production Readiness
 * 
 * THE GATEKEEPER. Validates:
 * - Production readiness checklist
 * - Quality gates (no console, no TODOs, proper types)
 * - Performance concerns (bundle size, render patterns)
 * - Security basics (exposed keys, unsafe patterns)
 * - Final synthesis of all issues
 * 
 * Combines: finalCheck, visualAnalysis
 */

import { BaseAgent } from '../coordination/base-agent.js';

export class QualityAgent extends BaseAgent {
  constructor(config = {}) {
    super('quality', [
      'production-readiness',
      'quality-gates',
      'performance',
      'security',
      'synthesis',
    ]);

    this.config = {
      icon: '✅',
      color: '#22c55e',
      description: 'Quality gatekeeper - ensures production readiness',
    };
  }

  async initialize() {
    this.log('info', 'Quality gates activating...');
    this.log('success', 'Ready to validate');
    return true;
  }

  /**
   * Full validation
   */
  async analyze(routePath, code, otherResults = {}) {
    return this.executeTask(`Quality check: ${routePath}`, async () => {
      const checks = {
        quality: [],
        performance: [],
        security: [],
      };
      
      let readinessScore = 100;

      // 1. Quality Gates
      const qualityChecks = this.runQualityGates(code);
      checks.quality = qualityChecks;
      readinessScore -= qualityChecks.filter(c => !c.passed).length * 5;

      // 2. Performance Checks
      const perfChecks = this.runPerformanceChecks(code);
      checks.performance = perfChecks;
      readinessScore -= perfChecks.filter(c => !c.passed && c.severity === 'warning').length * 3;

      // 3. Security Checks
      const secChecks = this.runSecurityChecks(code);
      checks.security = secChecks;
      readinessScore -= secChecks.filter(c => !c.passed).length * 10;

      // 4. Synthesize with other agent results
      const synthesis = this.synthesize(checks, otherResults);

      const result = {
        routePath,
        timestamp: Date.now(),
        readinessScore: Math.max(0, readinessScore),
        isReady: readinessScore >= 70,
        checks,
        synthesis,
        blockers: this.getBlockers(checks),
        recommendations: this.getRecommendations(checks, readinessScore),
      };

      this.shareDiscovery('quality-check', {
        routePath,
        isReady: result.isReady,
        score: result.readinessScore,
      });

      return result;
    });
  }

  /**
   * Run quality gates
   */
  runQualityGates(code) {
    const checks = [];

    // No console statements
    const hasConsole = /console\.(log|warn|error|debug|info)\s*\(/.test(code);
    checks.push({
      id: 'no-console',
      name: 'No console statements',
      passed: !hasConsole,
      severity: hasConsole ? 'warning' : 'ok',
    });

    // No TODO/FIXME
    const hasTodo = /\/\/\s*(TODO|FIXME)/i.test(code);
    checks.push({
      id: 'no-todos',
      name: 'No TODO/FIXME comments',
      passed: !hasTodo,
      severity: hasTodo ? 'warning' : 'ok',
    });

    // No any types
    const hasAny = /:\s*any\b/.test(code);
    checks.push({
      id: 'no-any',
      name: 'No any types',
      passed: !hasAny,
      severity: hasAny ? 'warning' : 'ok',
    });

    // Has error handling
    const hasErrorHandling = /catch\s*\(|\.catch\(|onError|error\s*[=:]/.test(code);
    const needsErrorHandling = /fetch\(|useQuery|useMutation|async/.test(code);
    checks.push({
      id: 'error-handling',
      name: 'Has error handling',
      passed: !needsErrorHandling || hasErrorHandling,
      severity: (needsErrorHandling && !hasErrorHandling) ? 'warning' : 'ok',
    });

    // Has loading state
    const hasLoading = /loading|isLoading|skeleton|spinner/i.test(code);
    const needsLoading = /useQuery|fetch\(|async/.test(code);
    checks.push({
      id: 'loading-state',
      name: 'Has loading state',
      passed: !needsLoading || hasLoading,
      severity: (needsLoading && !hasLoading) ? 'warning' : 'ok',
    });

    // Proper "use client" directive
    const needsClient = /useState|useEffect|useRef|onClick|onChange/.test(code);
    const hasClient = /"use client"|'use client'/.test(code);
    checks.push({
      id: 'use-client',
      name: 'Proper "use client" directive',
      passed: !needsClient || hasClient,
      severity: (needsClient && !hasClient) ? 'error' : 'ok',
    });

    // No empty handlers
    const hasEmptyHandlers = /=>\s*{\s*}/.test(code);
    checks.push({
      id: 'no-empty-handlers',
      name: 'No empty event handlers',
      passed: !hasEmptyHandlers,
      severity: hasEmptyHandlers ? 'warning' : 'ok',
    });

    return checks;
  }

  /**
   * Run performance checks
   */
  runPerformanceChecks(code) {
    const checks = [];

    // No inline styles (prefer Tailwind)
    const hasInlineStyles = /style={{/.test(code);
    checks.push({
      id: 'no-inline-styles',
      name: 'No inline styles',
      passed: !hasInlineStyles,
      severity: hasInlineStyles ? 'info' : 'ok',
    });

    // Uses memo for expensive operations
    const hasExpensiveOps = /\.filter\(.*\.map\(|\.sort\(.*\.map\(/.test(code);
    const usesMemo = /useMemo|useCallback/.test(code);
    checks.push({
      id: 'memoization',
      name: 'Uses memoization for expensive ops',
      passed: !hasExpensiveOps || usesMemo,
      severity: (hasExpensiveOps && !usesMemo) ? 'info' : 'ok',
    });

    // No anonymous functions in render (for onClick etc)
    // This is a simplified check
    const hasInlineArrow = /onClick={\s*\(\)\s*=>/.test(code);
    checks.push({
      id: 'no-inline-arrows',
      name: 'Minimal inline arrow functions',
      passed: !hasInlineArrow,
      severity: hasInlineArrow ? 'info' : 'ok',
      note: 'Consider useCallback for frequently re-rendered components',
    });

    // Image optimization
    const hasUnoptimizedImages = /<img\s/.test(code) && !code.includes('next/image');
    checks.push({
      id: 'optimized-images',
      name: 'Uses optimized images',
      passed: !hasUnoptimizedImages,
      severity: hasUnoptimizedImages ? 'warning' : 'ok',
    });

    return checks;
  }

  /**
   * Run security checks
   */
  runSecurityChecks(code) {
    const checks = [];

    // No exposed API keys
    const hasApiKey = /(api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"]+['"]/i.test(code);
    checks.push({
      id: 'no-exposed-secrets',
      name: 'No exposed secrets',
      passed: !hasApiKey,
      severity: hasApiKey ? 'error' : 'ok',
    });

    // No dangerouslySetInnerHTML without sanitization
    const hasDangerousHtml = /dangerouslySetInnerHTML/.test(code);
    checks.push({
      id: 'no-dangerous-html',
      name: 'No unsanitized HTML',
      passed: !hasDangerousHtml,
      severity: hasDangerousHtml ? 'warning' : 'ok',
      note: hasDangerousHtml ? 'Ensure content is sanitized with DOMPurify or similar' : undefined,
    });

    // No eval
    const hasEval = /\beval\s*\(/.test(code);
    checks.push({
      id: 'no-eval',
      name: 'No eval()',
      passed: !hasEval,
      severity: hasEval ? 'error' : 'ok',
    });

    // SQL injection potential (if raw SQL)
    const hasRawSql = /`.*\${.*}.*`.*(?:select|insert|update|delete)/i.test(code);
    checks.push({
      id: 'no-sql-injection',
      name: 'No SQL injection risk',
      passed: !hasRawSql,
      severity: hasRawSql ? 'error' : 'ok',
    });

    return checks;
  }

  /**
   * Synthesize results from all agents
   */
  synthesize(checks, otherResults = {}) {
    const { brainResult, codeResult, designResult } = otherResults;
    
    const synthesis = {
      totalIssues: 0,
      criticalIssues: 0,
      suggestions: 0,
      topPriorities: [],
    };

    // Count issues from other agents
    if (brainResult?.suggestions) {
      synthesis.suggestions = brainResult.suggestions.length;
      synthesis.topPriorities.push(...brainResult.suggestions.filter(s => 
        s.priority === 'critical' || s.priority === 'high'
      ).slice(0, 3));
    }

    if (codeResult?.issues) {
      synthesis.totalIssues += codeResult.issues.length;
      synthesis.criticalIssues += codeResult.issues.filter(i => i.severity === 'error').length;
    }

    if (designResult?.issues) {
      synthesis.totalIssues += designResult.issues.length;
    }

    // Add failed checks
    const failedChecks = [
      ...checks.quality.filter(c => !c.passed),
      ...checks.performance.filter(c => !c.passed && c.severity !== 'info'),
      ...checks.security.filter(c => !c.passed),
    ];
    synthesis.totalIssues += failedChecks.length;
    synthesis.criticalIssues += failedChecks.filter(c => c.severity === 'error').length;

    return synthesis;
  }

  /**
   * Get blockers (must fix before production)
   */
  getBlockers(checks) {
    const blockers = [];

    for (const check of [...checks.quality, ...checks.security]) {
      if (!check.passed && check.severity === 'error') {
        blockers.push({
          id: check.id,
          name: check.name,
          reason: `Critical: ${check.name} check failed`,
        });
      }
    }

    return blockers;
  }

  /**
   * Get recommendations based on score
   */
  getRecommendations(checks, score) {
    const recommendations = [];

    if (score < 70) {
      recommendations.push({
        priority: 'high',
        message: 'Address all critical and warning issues before deploying',
      });
    }

    const failedQuality = checks.quality.filter(c => !c.passed);
    if (failedQuality.length > 3) {
      recommendations.push({
        priority: 'medium',
        message: 'Multiple quality checks failing - consider a focused cleanup pass',
      });
    }

    const failedSecurity = checks.security.filter(c => !c.passed);
    if (failedSecurity.length > 0) {
      recommendations.push({
        priority: 'critical',
        message: 'Security issues detected - address immediately',
      });
    }

    if (score >= 90) {
      recommendations.push({
        priority: 'low',
        message: 'Code is production-ready. Consider adding tests for long-term maintenance.',
      });
    }

    return recommendations;
  }

  /**
   * Quick validation (fast path)
   */
  async quickValidate(code, routePath) {
    return this.executeTask(`Quick validate: ${routePath}`, async () => {
      const criticalIssues = [];

      // Only check critical gates
      if (!/["']use client["']/.test(code) && /useState|useEffect|onClick/.test(code)) {
        criticalIssues.push({ message: 'Missing "use client" directive', severity: 'error' });
      }

      if (/console\.log/.test(code)) {
        criticalIssues.push({ message: 'Console statements found', severity: 'warning' });
      }

      if (/(api[_-]?key|secret)\s*[=:]\s*['"]/.test(code)) {
        criticalIssues.push({ message: 'Possible exposed secret', severity: 'error' });
      }

      return {
        isValid: criticalIssues.filter(i => i.severity === 'error').length === 0,
        issues: criticalIssues,
      };
    });
  }

  getStatus() {
    return { ...this.getStats() };
  }
}

export default QualityAgent;
