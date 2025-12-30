/**
 * FinalCheckAgent - Quality Gate & Validation Agent
 * 
 * This agent is the FINAL QUALITY GATE in the pipeline that:
 * 1. VALIDATES completeness - all required elements present
 * 2. CHECKS consistency - matches existing patterns
 * 3. VERIFIES accessibility - proper focus, aria, keyboard
 * 4. CONFIRMS design alignment - uses correct tokens
 * 5. SCORES readiness - is this production-ready?
 * 6. GENERATES checklist - what needs attention
 * 
 * PIPELINE ROLE:
 * Receives from UIEnhancementAgent → Validates → Returns to queue as ready or needs-work
 * 
 * The difference between:
 * - Generic: "Looks good" ✓
 * - Smart: "Ready with 92/100 score. Minor: add aria-label to icon button.
 *          Matches OnboardingCard pattern. Uses correct tokens."
 */

import { BaseAgent } from './coordination/base-agent.js';
import { UIKnowledge } from '../knowledge/ui-knowledge.js';

export class FinalCheckAgent extends BaseAgent {
  constructor(config = {}) {
    super('final-check', [
      'completeness-check',
      'consistency-check', 
      'accessibility-check',
      'design-alignment',
      'production-readiness',
      'checklist-generation',
    ]);

    this.config = {
      icon: '✅',
      color: '#10b981',
      description: 'Final quality gate for production readiness',
    };

    this.uiKnowledge = UIKnowledge;
    
    // Validation rules
    this.validationRules = {
      required: {
        loading: {
          name: 'Loading State',
          check: (code) => /isLoading|loading|Skeleton|animate-pulse/.test(code),
          severity: 'error',
          message: 'Missing loading state - users see blank screen',
        },
        errorHandling: {
          name: 'Error Handling',
          check: (code) => /catch|error|Error|onError/.test(code),
          severity: 'error',
          message: 'Missing error handling - crashes will be ugly',
        },
        transitions: {
          name: 'Transitions',
          check: (code) => /transition/.test(code),
          severity: 'warning',
          message: 'Missing transitions - interactions feel jarring',
        },
      },

      recommended: {
        emptyState: {
          name: 'Empty State',
          check: (code) => /empty|no data|No |EmptyState/.test(code.toLowerCase()),
          severity: 'info',
          message: 'Consider adding empty state for better UX',
        },
        motion: {
          name: 'Framer Motion',
          check: (code) => /motion\.|AnimatePresence|framer-motion/.test(code),
          severity: 'info',
          message: 'Consider adding motion for premium feel',
        },
        responsive: {
          name: 'Responsive Design',
          check: (code) => /sm:|md:|lg:|xl:/.test(code),
          severity: 'warning',
          message: 'Missing responsive breakpoints',
        },
      },

      accessibility: {
        ariaLabels: {
          name: 'ARIA Labels',
          check: (code) => {
            const hasIconButtons = /<button[^>]*>[^<]*<(svg|Icon|icon)/.test(code);
            const hasAriaLabel = /aria-label/.test(code);
            return !hasIconButtons || hasAriaLabel;
          },
          severity: 'warning',
          message: 'Icon buttons need aria-label for screen readers',
        },
        focusVisible: {
          name: 'Focus Indicators',
          check: (code) => /focus:|focus-visible:/.test(code),
          severity: 'warning',
          message: 'Missing focus indicators for keyboard navigation',
        },
        altText: {
          name: 'Image Alt Text',
          check: (code) => {
            const hasImages = /<img|<Image/.test(code);
            const hasAlt = /alt=/.test(code);
            return !hasImages || hasAlt;
          },
          severity: 'error',
          message: 'Images missing alt text',
        },
      },

      design: {
        designTokens: {
          name: 'Design Tokens',
          check: (code) => {
            const hasHardcodedColors = /#[0-9a-fA-F]{6}/.test(code);
            const colorCount = (code.match(/#[0-9a-fA-F]{6}/g) || []).length;
            return colorCount < 3; // Allow some for special cases
          },
          severity: 'info',
          message: 'Consider using design tokens instead of hardcoded colors',
        },
        fontFamily: {
          name: 'Font Family',
          check: (code) => /font-sf-pro|font-sans/.test(code) || !/<[a-z]/i.test(code),
          severity: 'info', 
          message: 'Use font-sf-pro for Helm branding',
        },
        spacing: {
          name: 'Consistent Spacing',
          check: (code) => {
            const arbitrarySpacing = /(?:p|m|gap)-\[\d+px\]/.test(code);
            return !arbitrarySpacing;
          },
          severity: 'warning',
          message: 'Use Tailwind spacing scale instead of arbitrary values',
        },
      },

      consistency: {
        borderRadius: {
          name: 'Border Radius Consistency',
          check: (code) => {
            const radii = code.match(/rounded(-\w+)?/g) || [];
            const unique = [...new Set(radii)];
            return unique.length <= 3;
          },
          severity: 'warning',
          message: 'Too many different border-radius values',
        },
        hoverStates: {
          name: 'Hover States',
          check: (code) => {
            const hasInteractive = /<button|onClick|<Button/.test(code);
            const hasHover = /hover:/.test(code);
            return !hasInteractive || hasHover;
          },
          severity: 'warning',
          message: 'Interactive elements need hover states',
        },
      },
    };

    // Reference patterns for consistency checking
    this.helmPatterns = {
      card: {
        premium: 'bg-white rounded-2xl border border-black/[0.06] p-6 shadow-sm hover:shadow-md',
        interactive: 'hover:-translate-y-0.5 transition-all duration-200',
      },
      button: {
        primary: 'h-14 px-6 rounded-xl font-medium bg-onboarding-kelly-green text-white',
        hover: 'hover:bg-onboarding-kelly-green/90 hover:-translate-y-0.5',
      },
      input: {
        standard: 'h-[52px] px-4 rounded-lg border transition-all duration-200',
        focus: 'focus:border-onboarding-kelly-green focus:ring-4 focus:ring-onboarding-kelly-green/10',
      },
    };
  }

  async initialize() {
    this.log('info', 'Initializing final check agent...');
    this.log('info', `Validation categories: ${Object.keys(this.validationRules).length}`);
    this.log('success', 'Final check agent ready');
    return true;
  }

  /**
   * Quick validation for route audit (lighter than full validation)
   * Returns: { result: { isValid, issues, score, checks } }
   */
  async quickValidate(code, routePath) {
    return this.executeTask(`Quick validate: ${routePath}`, async () => {
      const checks = {
        passed: [],
        failed: [],
        warnings: [],
        info: [],
      };

      // Run validation rules
      for (const [category, rules] of Object.entries(this.validationRules)) {
        for (const [ruleId, rule] of Object.entries(rules)) {
          const passed = rule.check(code);

          const checkResult = {
            id: ruleId,
            name: rule.name,
            category,
            severity: rule.severity,
            message: rule.message,
          };

          if (passed) {
            checks.passed.push(checkResult);
          } else {
            switch (rule.severity) {
              case 'error':
                checks.failed.push(checkResult);
                break;
              case 'warning':
                checks.warnings.push(checkResult);
                break;
              case 'info':
                checks.info.push(checkResult);
                break;
            }
          }
        }
      }

      // Calculate score
      const totalChecks = checks.passed.length + checks.failed.length + checks.warnings.length + checks.info.length;
      const passedChecks = checks.passed.length + checks.info.length;
      const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

      // Determine if valid (no errors)
      const isValid = checks.failed.length === 0;

      // Format issues for orchestrator
      const issues = [
        ...checks.failed.map(c => ({ severity: 'error', message: c.message, name: c.name })),
        ...checks.warnings.map(c => ({ severity: 'warning', message: c.message, name: c.name })),
      ];

      return {
        isValid,
        score,
        issues,
        checks,
        summary: `${checks.failed.length} errors, ${checks.warnings.length} warnings, ${checks.passed.length} passed`,
      };
    });
  }

  /**
   * Main entry point: Validate UI enhancement from pipeline
   */
  async validateUIEnhancement(enhancementResult) {
    return this.executeTask(`Validate: ${enhancementResult.feature.title}`, async () => {
      this.log('info', `Validating UI enhancement for: ${enhancementResult.feature.title}`);

      // We need the actual code to validate - get from route context
      // For now, we validate the enhancement result structure and suggestions
      
      const validation = {
        feature: enhancementResult.feature,
        routePath: enhancementResult.routePath,
        timestamp: Date.now(),
        
        // Scores
        scores: {
          completeness: 0,
          consistency: 0,
          accessibility: 0,
          designAlignment: 0,
          overall: 0,
        },
        
        // Check results
        checks: {
          passed: [],
          failed: [],
          warnings: [],
          info: [],
        },
        
        // Readiness assessment
        readiness: {
          status: 'unknown', // ready, needs-work, blocked
          blockers: [],
          recommendations: [],
        },
        
        // Generated checklist
        checklist: [],
      };

      // Validate the enhancement has required outputs
      validation.checks = this.validateEnhancementStructure(enhancementResult);
      
      // Validate suggestions are actionable
      const suggestionValidation = this.validateSuggestions(enhancementResult.suggestions);
      validation.checks.passed.push(...suggestionValidation.passed);
      validation.checks.warnings.push(...suggestionValidation.warnings);

      // Check if premium spec is complete
      const specValidation = this.validatePremiumSpec(enhancementResult.premiumSpec);
      validation.checks.passed.push(...specValidation.passed);
      validation.checks.failed.push(...specValidation.failed);

      // Calculate scores
      validation.scores = this.calculateScores(validation.checks);

      // Determine readiness
      validation.readiness = this.assessReadiness(validation);

      // Generate checklist
      validation.checklist = this.generateChecklist(enhancementResult, validation);

      // Share result
      this.shareDiscovery('validation-complete', {
        feature: enhancementResult.feature.title,
        status: validation.readiness.status,
        overallScore: validation.scores.overall,
      });

      return validation;
    });
  }

  /**
   * Full code validation (called directly with code)
   */
  async validateCode(routePath, code, feature = null) {
    return this.executeTask(`Validate code: ${routePath}`, async () => {
      const checks = {
        passed: [],
        failed: [],
        warnings: [],
        info: [],
      };

      // Run all validation rules
      for (const [category, rules] of Object.entries(this.validationRules)) {
        for (const [ruleId, rule] of Object.entries(rules)) {
          const passed = rule.check(code);
          const result = {
            id: `${category}-${ruleId}`,
            name: rule.name,
            category,
            passed,
          };

          if (passed) {
            checks.passed.push(result);
          } else {
            const item = { ...result, message: rule.message };
            switch (rule.severity) {
              case 'error': checks.failed.push(item); break;
              case 'warning': checks.warnings.push(item); break;
              case 'info': checks.info.push(item); break;
            }
          }
        }
      }

      // Pattern matching check
      const patternMatch = this.checkPatternMatching(code);
      if (patternMatch.matches) {
        checks.passed.push({
          id: 'pattern-match',
          name: 'Pattern Consistency',
          category: 'consistency',
          passed: true,
          details: patternMatch.matchedPatterns,
        });
      } else {
        checks.warnings.push({
          id: 'pattern-match',
          name: 'Pattern Consistency',
          category: 'consistency',
          passed: false,
          message: patternMatch.message,
          suggestions: patternMatch.suggestions,
        });
      }

      // Calculate scores
      const scores = this.calculateScores(checks);

      // Readiness
      const readiness = this.assessReadiness({ checks, scores });

      // Checklist
      const checklist = this.generateCodeChecklist(code, checks);

      return {
        routePath,
        feature,
        checks,
        scores,
        readiness,
        checklist,
        timestamp: Date.now(),
      };
    });
  }

  /**
   * Validate enhancement structure
   */
  validateEnhancementStructure(result) {
    const checks = {
      passed: [],
      failed: [],
      warnings: [],
      info: [],
    };

    // Must have suggestions
    if (result.suggestions?.length > 0) {
      checks.passed.push({
        id: 'has-suggestions',
        name: 'Has UI Suggestions',
        category: 'completeness',
      });
    } else {
      checks.warnings.push({
        id: 'has-suggestions',
        name: 'Has UI Suggestions',
        category: 'completeness',
        message: 'No UI suggestions generated',
      });
    }

    // Must have recipes
    if (result.recipes?.length > 0) {
      checks.passed.push({
        id: 'has-recipes',
        name: 'Has Code Recipes',
        category: 'completeness',
      });
    } else {
      checks.info.push({
        id: 'has-recipes',
        name: 'Has Code Recipes',
        category: 'completeness',
        message: 'No code recipes - code may already be premium',
      });
    }

    // Must have premium spec
    if (result.premiumSpec) {
      checks.passed.push({
        id: 'has-spec',
        name: 'Has Premium Spec',
        category: 'completeness',
      });
    } else {
      checks.failed.push({
        id: 'has-spec',
        name: 'Has Premium Spec',
        category: 'completeness',
        message: 'Missing premium UI specification',
      });
    }

    // Should have design tokens
    if (result.designTokens) {
      checks.passed.push({
        id: 'has-tokens',
        name: 'Has Design Tokens',
        category: 'design',
      });
    }

    return checks;
  }

  /**
   * Validate suggestions are actionable
   */
  validateSuggestions(suggestions) {
    const passed = [];
    const warnings = [];

    if (!suggestions || suggestions.length === 0) {
      return { passed, warnings };
    }

    // Check each suggestion has required fields
    for (const suggestion of suggestions) {
      if (suggestion.why && suggestion.result) {
        passed.push({
          id: `suggestion-${suggestion.id}`,
          name: suggestion.title,
          category: 'actionability',
          details: 'Has why and result',
        });
      } else {
        warnings.push({
          id: `suggestion-${suggestion.id}`,
          name: suggestion.title,
          category: 'actionability',
          message: 'Suggestion missing why or result explanation',
        });
      }
    }

    // Check for high priority items
    const highPriority = suggestions.filter(s => s.priority === 'high' || s.priority === 'critical');
    if (highPriority.length > 0) {
      passed.push({
        id: 'has-priorities',
        name: 'Has Prioritized Items',
        category: 'actionability',
        details: `${highPriority.length} high priority items`,
      });
    }

    return { passed, warnings };
  }

  /**
   * Validate premium spec is complete
   */
  validatePremiumSpec(spec) {
    const passed = [];
    const failed = [];

    if (!spec) {
      failed.push({
        id: 'spec-exists',
        name: 'Premium Spec Exists',
        category: 'completeness',
        message: 'No premium specification generated',
      });
      return { passed, failed };
    }

    // Check for must-haves
    if (spec.mustHave?.length > 0) {
      passed.push({
        id: 'spec-musthave',
        name: 'Has Must-Have Items',
        category: 'completeness',
      });
    }

    // Check for checklist
    if (spec.checklist?.length >= 5) {
      passed.push({
        id: 'spec-checklist',
        name: 'Has Complete Checklist',
        category: 'completeness',
      });
    } else {
      failed.push({
        id: 'spec-checklist',
        name: 'Has Complete Checklist',
        category: 'completeness',
        message: 'Checklist is incomplete',
      });
    }

    // Check for code examples
    if (spec.codeExamples?.length > 0) {
      passed.push({
        id: 'spec-code',
        name: 'Has Code Examples',
        category: 'actionability',
      });
    }

    return { passed, failed };
  }

  /**
   * Check if code matches Helm patterns
   */
  checkPatternMatching(code) {
    const matchedPatterns = [];
    const suggestions = [];

    // Check card pattern
    if (code.includes('rounded') && code.includes('border')) {
      if (code.includes('rounded-2xl') && code.includes('border-black/[0.0')) {
        matchedPatterns.push('premium-card');
      } else {
        suggestions.push('Upgrade card to use rounded-2xl border-black/[0.06]');
      }
    }

    // Check button pattern
    if (/<button|<Button/.test(code)) {
      if (code.includes('h-14') && code.includes('rounded-xl')) {
        matchedPatterns.push('premium-button');
      } else {
        suggestions.push('Upgrade button to h-14 rounded-xl pattern');
      }
    }

    // Check input pattern
    if (/<input|<Input/.test(code)) {
      if (code.includes('h-[52px]') && code.includes('focus:ring-4')) {
        matchedPatterns.push('premium-input');
      } else {
        suggestions.push('Upgrade input to h-[52px] with focus:ring-4');
      }
    }

    return {
      matches: matchedPatterns.length > 0 || suggestions.length === 0,
      matchedPatterns,
      suggestions,
      message: suggestions.length > 0 
        ? `Code doesn't fully match Helm patterns` 
        : 'Code matches Helm patterns',
    };
  }

  /**
   * Calculate scores from checks
   */
  calculateScores(checks) {
    const totalChecks = 
      checks.passed.length + 
      checks.failed.length + 
      checks.warnings.length;

    if (totalChecks === 0) {
      return {
        completeness: 50,
        consistency: 50,
        accessibility: 50,
        designAlignment: 50,
        overall: 50,
      };
    }

    // Base score
    let score = 100;

    // Deduct for failed (errors)
    score -= checks.failed.length * 15;

    // Deduct for warnings
    score -= checks.warnings.length * 5;

    // Info items don't affect score much
    score -= checks.info.length * 1;

    // Bonus for many passed checks
    score += Math.min(checks.passed.length * 2, 20);

    const overall = Math.max(0, Math.min(100, score));

    // Calculate category scores
    const categoryScores = {};
    const categories = ['completeness', 'consistency', 'accessibility', 'design'];
    
    for (const category of categories) {
      const categoryPassed = checks.passed.filter(c => c.category === category).length;
      const categoryFailed = checks.failed.filter(c => c.category === category).length;
      const categoryWarnings = checks.warnings.filter(c => c.category === category).length;
      const categoryTotal = categoryPassed + categoryFailed + categoryWarnings;
      
      if (categoryTotal === 0) {
        categoryScores[category] = 80; // No checks = assume OK
      } else {
        categoryScores[category] = Math.round(
          (categoryPassed / categoryTotal) * 100 - (categoryWarnings * 5)
        );
      }
    }

    return {
      completeness: Math.max(0, categoryScores.completeness || 50),
      consistency: Math.max(0, categoryScores.consistency || 50),
      accessibility: Math.max(0, categoryScores.accessibility || 50),
      designAlignment: Math.max(0, categoryScores.design || 50),
      overall,
    };
  }

  /**
   * Assess production readiness
   */
  assessReadiness(validation) {
    const { checks, scores } = validation;
    
    const blockers = checks.failed.map(f => f.message || f.name);
    const recommendations = [
      ...checks.warnings.map(w => w.message || w.name),
      ...checks.info.map(i => i.message || i.name),
    ];

    let status = 'ready';
    
    if (blockers.length > 0) {
      status = 'blocked';
    } else if (checks.warnings.length > 2 || scores.overall < 70) {
      status = 'needs-work';
    } else if (scores.overall >= 85) {
      status = 'ready';
    } else {
      status = 'acceptable';
    }

    return {
      status,
      blockers,
      recommendations: recommendations.slice(0, 5),
      score: scores.overall,
      summary: this.getReadinessSummary(status, scores.overall, blockers.length),
    };
  }

  /**
   * Get human-readable readiness summary
   */
  getReadinessSummary(status, score, blockerCount) {
    switch (status) {
      case 'ready':
        return `✅ Production ready (${score}/100). Matches Helm premium standards.`;
      case 'acceptable':
        return `✓ Acceptable (${score}/100). Consider polish items for premium feel.`;
      case 'needs-work':
        return `⚠️ Needs work (${score}/100). Address warnings before shipping.`;
      case 'blocked':
        return `🚫 Blocked (${score}/100). ${blockerCount} critical issues must be fixed.`;
      default:
        return `Score: ${score}/100`;
    }
  }

  /**
   * Generate checklist from enhancement
   */
  generateChecklist(enhancement, validation) {
    const checklist = [];
    
    // From premium spec
    if (enhancement.premiumSpec?.checklist) {
      for (const item of enhancement.premiumSpec.checklist) {
        checklist.push({
          item,
          status: 'unchecked',
          category: 'spec',
        });
      }
    }

    // From failed checks
    for (const failed of validation.checks.failed) {
      checklist.push({
        item: `FIX: ${failed.message || failed.name}`,
        status: 'required',
        category: 'blocker',
      });
    }

    // From warnings
    for (const warning of validation.checks.warnings.slice(0, 5)) {
      checklist.push({
        item: `IMPROVE: ${warning.message || warning.name}`,
        status: 'recommended',
        category: 'warning',
      });
    }

    // From high priority suggestions
    const highPriority = (enhancement.suggestions || [])
      .filter(s => s.priority === 'high' || s.priority === 'critical');
    
    for (const suggestion of highPriority.slice(0, 3)) {
      checklist.push({
        item: `IMPLEMENT: ${suggestion.title}`,
        status: 'recommended',
        category: 'enhancement',
        recipe: suggestion.recipe?.name || null,
      });
    }

    return checklist;
  }

  /**
   * Generate checklist from code validation
   */
  generateCodeChecklist(code, checks) {
    const checklist = [];

    // Required fixes
    for (const failed of checks.failed) {
      checklist.push({
        item: failed.message || failed.name,
        status: 'required',
        category: 'error',
      });
    }

    // Recommended improvements
    for (const warning of checks.warnings) {
      checklist.push({
        item: warning.message || warning.name,
        status: 'recommended',
        category: 'warning',
        suggestions: warning.suggestions,
      });
    }

    // Nice-to-haves
    for (const info of checks.info.slice(0, 3)) {
      checklist.push({
        item: info.message || info.name,
        status: 'optional',
        category: 'polish',
      });
    }

    return checklist;
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'validate-ui-enhancement':
        this.validateUIEnhancement(message.payload)
          .then(result => {
            this.sendToAgent(message.from, 'validation-result', result);
            
            // Also send to orchestrator for queue
            this.sendToAgent('coordinator', 'enhancement-validated', {
              feature: message.payload.feature,
              validation: result,
              readyForMD: result.readiness.status === 'ready' || 
                         result.readiness.status === 'acceptable',
            });
          });
        break;

      case 'validate-code':
        this.validateCode(
          message.payload.routePath, 
          message.payload.code,
          message.payload.feature
        ).then(result => {
          this.sendToAgent(message.from, 'code-validation-result', result);
        });
        break;

      case 'get-checklist':
        this.sendToAgent(message.from, 'checklist', 
          this.generateCodeChecklist(message.payload.code, message.payload.checks)
        );
        break;
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      validationCategories: Object.keys(this.validationRules).length,
      rulesCount: Object.values(this.validationRules)
        .reduce((sum, cat) => sum + Object.keys(cat).length, 0),
      patternCount: Object.keys(this.helmPatterns).length,
    };
  }
}

export default FinalCheckAgent;
