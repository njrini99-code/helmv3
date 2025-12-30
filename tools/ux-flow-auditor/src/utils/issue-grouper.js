/**
 * IssueGrouper - Smart grouping and prioritization of issues
 * 
 * Features:
 * - Groups related issues together
 * - Calculates batch fix potential
 * - Prioritizes by impact and effort
 * - Detects patterns across routes
 */

export class IssueGrouper {
  constructor() {
    // Issue type categories
    this.categories = {
      spacing: ['spacing', 'padding', 'margin', 'gap', 'p-', 'm-'],
      animation: ['animation', 'transition', 'hover', 'motion', 'framer'],
      accessibility: ['aria', 'a11y', 'accessibility', 'keyboard', 'focus', 'sr-only'],
      typography: ['font', 'text', 'heading', 'typography', 'line-height'],
      color: ['color', 'bg-', 'text-', 'border-', 'theme'],
      layout: ['flex', 'grid', 'layout', 'container', 'responsive'],
      glass: ['glass', 'backdrop', 'blur', 'transparent'],
      loading: ['loading', 'skeleton', 'spinner', 'suspense'],
      error: ['error', 'boundary', 'catch', 'fallback'],
      form: ['form', 'input', 'validation', 'submit', 'field'],
      navigation: ['nav', 'route', 'link', 'button', 'click'],
      data: ['fetch', 'query', 'api', 'supabase', 'mutation'],
    };
    
    // Quick fix templates
    this.quickFixes = {
      'missing-hover': {
        pattern: /hover/i,
        template: (issue) => `Add hover:bg-opacity-80 or hover:scale-[1.02] to ${issue.element || 'element'}`,
        effort: 'low',
      },
      'wrong-spacing': {
        pattern: /spacing|padding|margin/i,
        template: (issue) => `Change to design system value: ${this.getSuggestedSpacing(issue)}`,
        effort: 'low',
      },
      'missing-transition': {
        pattern: /transition/i,
        template: () => `Add: transition-all duration-200 ease-out`,
        effort: 'low',
      },
      'glass-misuse': {
        pattern: /glass.*table|table.*glass|glass.*form|form.*glass/i,
        template: () => `Remove glass effect - use solid bg-zinc-900 instead`,
        effort: 'low',
      },
      'missing-loading': {
        pattern: /loading/i,
        template: (issue) => `Create loading.tsx with skeleton for ${issue.route || 'route'}`,
        effort: 'medium',
      },
    };
  }

  /**
   * Group issues by category
   */
  groupByCategory(issues) {
    const groups = {};
    
    for (const issue of issues) {
      const category = this.categorize(issue);
      
      if (!groups[category]) {
        groups[category] = {
          category,
          issues: [],
          count: 0,
          batchFixPossible: false,
          estimatedEffort: 'unknown',
        };
      }
      
      groups[category].issues.push(issue);
      groups[category].count++;
    }
    
    // Analyze each group for batch fix potential
    for (const group of Object.values(groups)) {
      this.analyzeGroup(group);
    }
    
    return groups;
  }

  /**
   * Categorize a single issue
   */
  categorize(issue) {
    const text = `${issue.title} ${issue.summary || ''} ${issue.description || ''}`.toLowerCase();
    
    for (const [category, keywords] of Object.entries(this.categories)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return category;
        }
      }
    }
    
    return 'other';
  }

  /**
   * Analyze a group for batch fix potential
   */
  analyzeGroup(group) {
    const { issues, category } = group;
    
    // Categories that can typically be batch-fixed
    const batchableCategories = ['spacing', 'color', 'typography', 'glass', 'animation'];
    group.batchFixPossible = batchableCategories.includes(category) && issues.length >= 2;
    
    // Estimate effort
    if (issues.length === 1) {
      group.estimatedEffort = 'low';
    } else if (group.batchFixPossible) {
      group.estimatedEffort = issues.length <= 3 ? 'medium' : 'high';
    } else {
      group.estimatedEffort = issues.length * 2 > 10 ? 'high' : 'medium';
    }
    
    // Check for quick fix
    for (const [fixId, fix] of Object.entries(this.quickFixes)) {
      const matchingIssues = issues.filter(i => 
        fix.pattern.test(`${i.title} ${i.summary || ''}`)
      );
      
      if (matchingIssues.length > 0) {
        group.hasQuickFix = true;
        group.quickFixId = fixId;
        group.quickFixCount = matchingIssues.length;
        break;
      }
    }
  }

  /**
   * Group issues by component/element
   */
  groupByComponent(issues) {
    const groups = {};
    
    for (const issue of issues) {
      const component = this.extractComponent(issue);
      
      if (!groups[component]) {
        groups[component] = {
          component,
          issues: [],
          singleFixResolvesAll: false,
        };
      }
      
      groups[component].issues.push(issue);
    }
    
    // Check if single fix could resolve all issues for a component
    for (const group of Object.values(groups)) {
      if (group.issues.length >= 2) {
        const categories = new Set(group.issues.map(i => this.categorize(i)));
        // If all issues are same category, likely one fix
        group.singleFixResolvesAll = categories.size === 1;
      }
    }
    
    return groups;
  }

  /**
   * Extract component name from issue
   */
  extractComponent(issue) {
    const text = `${issue.title} ${issue.summary || ''}`;
    
    // Common component patterns
    const patterns = [
      /(?:the\s+)?(\w+Button)/i,
      /(?:the\s+)?(\w+Card)/i,
      /(?:the\s+)?(\w+Modal)/i,
      /(?:the\s+)?(\w+Table)/i,
      /(?:the\s+)?(\w+Form)/i,
      /(?:the\s+)?(\w+Input)/i,
      /(?:the\s+)?(\w+List)/i,
      /(?:the\s+)?(\w+Header)/i,
      /(?:the\s+)?(\w+Nav)/i,
      /<(\w+)/,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    
    return 'general';
  }

  /**
   * Detect cross-route patterns
   */
  detectCrossRoutePatterns(issuesByRoute) {
    const patterns = [];
    const issueTypeCount = {};
    
    // Count issue types across routes
    for (const [route, issues] of Object.entries(issuesByRoute)) {
      for (const issue of issues) {
        const category = this.categorize(issue);
        const key = `${category}:${this.normalizeIssue(issue)}`;
        
        if (!issueTypeCount[key]) {
          issueTypeCount[key] = {
            category,
            issue: this.normalizeIssue(issue),
            routes: [],
            count: 0,
          };
        }
        
        issueTypeCount[key].routes.push(route);
        issueTypeCount[key].count++;
      }
    }
    
    // Find patterns (same issue in 3+ routes)
    for (const pattern of Object.values(issueTypeCount)) {
      if (pattern.count >= 3) {
        patterns.push({
          pattern: pattern.issue,
          category: pattern.category,
          affectedRoutes: pattern.routes,
          count: pattern.count,
          suggestedFix: `Create shared fix in ${this.suggestFixLocation(pattern)}`,
          batchFixPossible: true,
        });
      }
    }
    
    return patterns.sort((a, b) => b.count - a.count);
  }

  /**
   * Normalize issue for pattern detection
   */
  normalizeIssue(issue) {
    return (issue.title || '')
      .toLowerCase()
      .replace(/\d+/g, 'N')
      .replace(/['"`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Suggest fix location for pattern
   */
  suggestFixLocation(pattern) {
    const category = pattern.category;
    
    const locations = {
      spacing: 'tailwind.config.ts or shared component',
      animation: 'src/components/ui/animations.tsx',
      accessibility: 'src/components/ui/accessible-base.tsx',
      typography: 'tailwind.config.ts typography section',
      color: 'tailwind.config.ts colors or CSS variables',
      glass: 'src/components/ui/glass.tsx',
      loading: 'src/components/ui/loading.tsx',
      navigation: 'src/components/navigation/',
    };
    
    return locations[category] || 'shared utility file';
  }

  /**
   * Get suggested spacing value
   */
  getSuggestedSpacing(issue) {
    const text = `${issue.title} ${issue.summary || ''}`;
    
    // Extract current value
    const match = text.match(/(\d+)px/);
    const current = match ? parseInt(match[1]) : 0;
    
    // Design system spacing scale
    const scale = [4, 8, 12, 16, 24, 32, 48, 64];
    
    // Find closest
    const closest = scale.reduce((prev, curr) => 
      Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev
    );
    
    return `${closest}px (p-${closest / 4} or similar)`;
  }

  /**
   * Priority score calculation
   */
  calculatePriority(issue, context = {}) {
    let score = 0;
    
    // Base impact from issue
    score += (issue.impact || 50);
    
    // Boost for quick fixes
    const hasQuickFix = Object.values(this.quickFixes).some(fix => 
      fix.pattern.test(`${issue.title} ${issue.summary || ''}`)
    );
    if (hasQuickFix) score += 20;
    
    // Boost for user-facing routes
    if (context.isPublic) score += 15;
    
    // Boost for dashboard routes
    if (context.isDashboard) score += 10;
    
    // Boost for issues affecting multiple routes
    if (context.crossRouteCount > 1) {
      score += context.crossRouteCount * 5;
    }
    
    // Severity boost
    const severityBoost = {
      blocker: 50,
      error: 30,
      warning: 10,
      info: 0,
    };
    score += severityBoost[issue.severity] || 0;
    
    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Get prioritized issue list
   */
  prioritize(issues, routeContext = {}) {
    return issues
      .map(issue => ({
        ...issue,
        priority: this.calculatePriority(issue, routeContext),
        category: this.categorize(issue),
        hasQuickFix: this.hasQuickFix(issue),
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if issue has quick fix
   */
  hasQuickFix(issue) {
    const text = `${issue.title} ${issue.summary || ''}`;
    
    for (const [fixId, fix] of Object.entries(this.quickFixes)) {
      if (fix.pattern.test(text)) {
        return {
          id: fixId,
          template: fix.template(issue),
          effort: fix.effort,
        };
      }
    }
    
    return null;
  }

  /**
   * Generate batch fix MD for a group
   */
  generateBatchFixContext(group) {
    const { category, issues } = group;
    
    return {
      category,
      issueCount: issues.length,
      issues: issues.map(i => ({
        title: i.title,
        summary: i.summary,
        route: i.route,
      })),
      suggestedApproach: this.getBatchApproach(category),
      estimatedTime: this.estimateTime(group),
    };
  }

  /**
   * Get batch fix approach for category
   */
  getBatchApproach(category) {
    const approaches = {
      spacing: 'Create spacing utility classes or update Tailwind config',
      animation: 'Create shared animation variants in framer-motion config',
      accessibility: 'Create accessible base components with proper ARIA',
      typography: 'Update typography scale in Tailwind config',
      color: 'Update color tokens in Tailwind or CSS variables',
      glass: 'Create GlassContainer component with proper rules',
      loading: 'Create shared loading skeletons for each component type',
      navigation: 'Fix Link/router.push usage across affected components',
      form: 'Standardize form components with validation',
    };
    
    return approaches[category] || 'Address each issue individually';
  }

  /**
   * Estimate time for group fix
   */
  estimateTime(group) {
    const baseTime = {
      low: 5,
      medium: 15,
      high: 30,
    };
    
    const base = baseTime[group.estimatedEffort] || 15;
    
    if (group.batchFixPossible) {
      return `${base}-${base * 1.5} minutes (batch fix)`;
    }
    
    return `${base * group.count}-${base * group.count * 1.5} minutes`;
  }
}

export default IssueGrouper;
