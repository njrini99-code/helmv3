/**
 * ImprovementAgent - Learning from fixes and patterns
 * 
 * Tracks what works, what doesn't, and provides recommendations
 */
import { BaseAgent } from './coordination/base-agent.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ImprovementAgent extends BaseAgent {
  constructor(memory, config = {}) {
    super('improvement', [
      'learning',
      'pattern-detection',
      'recommendation',
      'fix-tracking',
    ]);
    
    this.memory = memory;
    this.config = config;
    
    // Learning data
    this.fixHistory = [];
    this.patterns = new Map();
    this.approaches = new Map();
    this.domainKnowledge = {
      baseball: {
        routes: ['discover', 'profile', 'schedule', 'settings', 'onboarding'],
        personas: ['College Coach', 'High School Player'],
        goals: {
          'College Coach': ['Find talented recruits', 'Manage recruiting pipeline', 'Communicate with prospects'],
          'High School Player': ['Get recruited', 'Showcase skills', 'Connect with coaches'],
        },
      },
      golf: {
        routes: ['team', 'roster', 'schedule', 'tryouts', 'settings'],
        personas: ['Golf Coach', 'Golf Player'],
        goals: {
          'Golf Coach': ['Manage team roster', 'Schedule matches', 'Track player performance'],
          'Golf Player': ['View team schedule', 'Track own stats', 'Communicate with coach'],
        },
      },
    };
    
    // Common fix patterns by category
    this.fixPatterns = {
      'loading': {
        successRate: 0.95,
        approach: 'Create loading.tsx with skeleton matching page grid',
        commonMistakes: [
          'Making skeleton layout different from actual page layout',
          'Forgetting to add animate-pulse',
          'Using wrong spacing values',
        ],
        tips: [
          'Copy the page\'s grid structure exactly',
          'Use the same container/padding as the page',
          'Test with slow network throttling',
        ],
      },
      'error-handling': {
        successRate: 0.90,
        approach: 'Create error.tsx with reset functionality',
        commonMistakes: [
          'Not including reset button',
          'Generic error messages',
          'Missing error boundary for client components',
        ],
        tips: [
          'Include specific error context when possible',
          'Provide clear action for user to recover',
          'Log error details for debugging',
        ],
      },
      'console-statements': {
        successRate: 0.99,
        approach: 'Remove or replace with proper logging',
        commonMistakes: [
          'Missing some console.log calls',
          'Removing useful debug logs without alternative',
        ],
        tips: [
          'Use search to find all instances',
          'Consider using debug library for development',
          'Replace with proper error handling where needed',
        ],
      },
      'type-safety': {
        successRate: 0.85,
        approach: 'Add explicit types and handle edge cases',
        commonMistakes: [
          'Using any instead of proper types',
          'Not handling null/undefined cases',
          'Missing return type annotations',
        ],
        tips: [
          'Start with interface definitions',
          'Use TypeScript strict mode',
          'Handle all union type cases',
        ],
      },
      'navigation': {
        successRate: 0.88,
        approach: 'Verify route exists and update link',
        commonMistakes: [
          'Not checking for dynamic route parameters',
          'Missing error handling for invalid routes',
          'Hardcoding URLs instead of using constants',
        ],
        tips: [
          'Use route constants from config',
          'Add fallback for invalid routes',
          'Test navigation flows end-to-end',
        ],
      },
      'accessibility': {
        successRate: 0.80,
        approach: 'Add aria-labels and ensure keyboard navigation',
        commonMistakes: [
          'Missing alt text for images',
          'Not handling focus states',
          'Using non-semantic elements for interactive content',
        ],
        tips: [
          'Use semantic HTML elements',
          'Test with screen reader',
          'Ensure sufficient color contrast',
        ],
      },
      'design-system': {
        successRate: 0.85,
        approach: 'Follow spacing, radius, and transition guidelines',
        commonMistakes: [
          'Using non-standard spacing values',
          'Inconsistent border radius',
          'Missing transitions on hover states',
        ],
        tips: [
          'Reference design system constants',
          'Use Tailwind classes consistently',
          'Glass effects only on nav, toolbar, modal',
        ],
      },
      'performance': {
        successRate: 0.75,
        approach: 'Optimize data loading and component rendering',
        commonMistakes: [
          'Not using useMemo/useCallback where needed',
          'Loading all data upfront',
          'Not implementing pagination',
        ],
        tips: [
          'Use React Server Components where possible',
          'Implement data virtualization for long lists',
          'Profile with React DevTools',
        ],
      },
      'security': {
        successRate: 0.90,
        approach: 'Validate inputs and sanitize outputs',
        commonMistakes: [
          'Not validating user inputs',
          'Exposing sensitive data in client code',
          'Missing CSRF protection',
        ],
        tips: [
          'Use Supabase RLS policies',
          'Validate on both client and server',
          'Never trust client-side data',
        ],
      },
    };
  }

  /**
   * Start the agent
   */
  async start(sharedState) {
    super.start(sharedState);
    
    // Load historical data
    await this.loadHistory();
  }

  /**
   * Load fix history from memory
   */
  async loadHistory() {
    try {
      if (this.memory?.learnings) {
        this.fixHistory = this.memory.learnings.fixHistory || [];
        
        // Rebuild patterns from history
        for (const fix of this.fixHistory) {
          this.updatePattern(fix.category, fix);
        }
      }
    } catch (error) {
      console.log('   No previous learning data found');
    }
  }

  /**
   * Learn from a completed fix
   */
  async learnFromFix(fixResult) {
    const { success, issue, approach, duration, notes } = fixResult;
    
    const learning = {
      id: `fix-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: issue.category,
      success,
      approach,
      duration,
      notes,
      context: {
        routePath: issue.routePath,
        severity: issue.severity,
        file: issue.file,
      },
    };
    
    this.fixHistory.push(learning);
    this.updatePattern(issue.category, learning);
    
    // Share insight with other agents
    this.shareInsight(`Learned from ${success ? 'successful' : 'failed'} fix: ${issue.title}`, {
      category: issue.category,
      approach,
      success,
    });
    
    // Save to memory
    if (this.memory) {
      this.memory.learnings = this.memory.learnings || {};
      this.memory.learnings.fixHistory = this.fixHistory;
      await this.memory.save?.();
    }
    
    return learning;
  }

  /**
   * Update pattern data based on fix result
   */
  updatePattern(category, fix) {
    const pattern = this.patterns.get(category) || {
      totalAttempts: 0,
      successfulAttempts: 0,
      approaches: new Map(),
      recentFixes: [],
    };
    
    pattern.totalAttempts++;
    if (fix.success) {
      pattern.successfulAttempts++;
    }
    
    // Track approach effectiveness
    const approachKey = fix.approach || 'manual';
    const approachStats = pattern.approaches.get(approachKey) || { count: 0, successes: 0 };
    approachStats.count++;
    if (fix.success) {
      approachStats.successes++;
    }
    pattern.approaches.set(approachKey, approachStats);
    
    // Keep recent fixes (last 10)
    pattern.recentFixes.push(fix);
    if (pattern.recentFixes.length > 10) {
      pattern.recentFixes.shift();
    }
    
    this.patterns.set(category, pattern);
  }

  /**
   * Get recommended approach for a category
   */
  getRecommendedApproach(category) {
    // First check learned patterns
    const pattern = this.patterns.get(category);
    
    // Then check built-in patterns
    const builtInPattern = this.fixPatterns[category];
    
    if (pattern && pattern.approaches.size > 0) {
      // Find the most successful approach
      let bestApproach = null;
      let bestRate = 0;
      
      for (const [approach, stats] of pattern.approaches) {
        const rate = stats.count > 0 ? stats.successes / stats.count : 0;
        if (rate > bestRate) {
          bestRate = rate;
          bestApproach = approach;
        }
      }
      
      return {
        approach: bestApproach || builtInPattern?.approach || 'Analyze and implement',
        successRate: bestRate || builtInPattern?.successRate || 0.5,
        basedOn: pattern.totalAttempts,
        commonMistakes: builtInPattern?.commonMistakes || [],
        tips: builtInPattern?.tips || [],
      };
    }
    
    // Fall back to built-in patterns
    if (builtInPattern) {
      return {
        approach: builtInPattern.approach,
        successRate: builtInPattern.successRate,
        basedOn: 'design system knowledge',
        commonMistakes: builtInPattern.commonMistakes,
        tips: builtInPattern.tips,
      };
    }
    
    return {
      approach: 'Analyze and implement the best solution',
      successRate: 0.5,
      basedOn: 'no historical data',
      commonMistakes: [],
      tips: [],
    };
  }

  /**
   * Get affected personas for a route/domain
   */
  getAffectedPersonas(routePath) {
    const personas = [];
    
    if (routePath.includes('/baseball/') || routePath.includes('baseball')) {
      personas.push({
        name: 'College Coach',
        goals: this.domainKnowledge.baseball.goals['College Coach'],
      });
      personas.push({
        name: 'High School Player',
        goals: this.domainKnowledge.baseball.goals['High School Player'],
      });
    }
    
    if (routePath.includes('/golf/') || routePath.includes('golf')) {
      personas.push({
        name: 'Golf Coach',
        goals: this.domainKnowledge.golf.goals['Golf Coach'],
      });
      personas.push({
        name: 'Golf Player',
        goals: this.domainKnowledge.golf.goals['Golf Player'],
      });
    }
    
    return personas;
  }

  /**
   * Get category-specific verification steps
   */
  getVerificationSteps(category) {
    const commonSteps = [
      'No TypeScript errors: `npx tsc --noEmit`',
      'Manual visual inspection looks correct',
    ];
    
    const categorySteps = {
      'loading': [
        'Loading skeleton appears on initial page load (use network throttling)',
        'Skeleton layout matches actual content layout',
        'Transition from skeleton to content is smooth',
      ],
      'error-handling': [
        'Error boundary catches errors correctly',
        'Reset button works and recovers state',
        'Error message is helpful and not generic',
      ],
      'console-statements': [
        'No console statements in production build',
        'Browser console is clean on page load',
      ],
      'type-safety': [
        'All type errors resolved',
        'No implicit any types',
        'Edge cases handled properly',
      ],
      'navigation': [
        'Link navigates to correct destination',
        'Back button works correctly',
        'No 404 errors on navigation',
      ],
      'accessibility': [
        'Screen reader announces content correctly',
        'Keyboard navigation works',
        'Color contrast meets WCAG standards',
      ],
      'design-system': [
        'Spacing follows design system',
        'Border radius is consistent',
        'Transitions are smooth',
      ],
    };
    
    return [
      ...(categorySteps[category] || []),
      ...commonSteps,
    ];
  }

  /**
   * Answer questions from other agents
   */
  async answer(question) {
    if (question.domain === 'learning' || question.domain === 'recommendation') {
      const category = question.category || question.text.split(' ')[0];
      const recommendation = this.getRecommendedApproach(category);
      
      return {
        text: `Recommended approach: ${recommendation.approach} (${Math.round(recommendation.successRate * 100)}% success rate)`,
        confidence: recommendation.successRate,
        data: recommendation,
      };
    }
    
    return {
      text: 'No recommendation available',
      confidence: 0.5,
    };
  }

  /**
   * Receive insights from other agents
   */
  receiveInsight(insight) {
    // Track insights that might be relevant to learning
    if (insight.category) {
      console.log(`💡 Improvement agent received insight about ${insight.category}`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalFixes = this.fixHistory.length;
    const successfulFixes = this.fixHistory.filter(f => f.success).length;
    
    const byCategory = {};
    for (const [category, pattern] of this.patterns) {
      byCategory[category] = {
        total: pattern.totalAttempts,
        successful: pattern.successfulAttempts,
        successRate: pattern.totalAttempts > 0 
          ? pattern.successfulAttempts / pattern.totalAttempts 
          : 0,
      };
    }
    
    return {
      totalFixes,
      successfulFixes,
      overallSuccessRate: totalFixes > 0 ? successfulFixes / totalFixes : 0,
      byCategory,
    };
  }
}

export default ImprovementAgent;
