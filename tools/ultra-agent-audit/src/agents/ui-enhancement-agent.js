/**
 * UIEnhancementAgent - Premium UI Intelligence
 * 
 * This agent understands:
 * - Nick's premium aesthetic goals (Linear/Stripe/Apple quality)
 * - Current design system and patterns
 * - Consistency requirements across the app
 * - Page-type specific enhancements
 * 
 * Works in pipeline:
 * 1. FeatureAgent creates feature suggestion
 * 2. UIEnhancementAgent designs the UI for it
 * 3. FinalCheckAgent validates everything
 * 
 * Now INTEGRATES PremiumUIAgent patterns for:
 * - Microinteractions (hover, ripple, transitions)
 * - Glassmorphism (nav, modals, cards)
 * - Animations (page transitions, staggered loading)
 * - Loading states (skeletons)
 * 
 * NO PAID API CALLS - Uses deep pattern knowledge
 */

import { BaseAgent } from './coordination/base-agent.js';
import UIKnowledge from '../knowledge/ui-knowledge.js';
import HelmKnowledge from '../knowledge/helm-knowledge.js';

// Premium UI patterns (integrated from PremiumUIAgent)
const PremiumPatterns = {
  microinteractions: {
    hoverScale: {
      pattern: /hover:scale-\d+/,
      missing: 'Add subtle hover scale (hover:scale-105) with smooth transition',
      code: 'transition-transform hover:scale-105',
      impact: 'medium',
    },
    hoverGlow: {
      pattern: /hover:shadow-.*\/(10|20|30)/,
      missing: 'Add glow on hover for interactive elements',
      code: 'hover:shadow-lg hover:shadow-green-500/20',
      impact: 'high',
    },
    hoverLift: {
      pattern: /hover:-translate-y/,
      missing: 'Add hover lift effect for cards',
      code: 'hover:-translate-y-1 transition-transform',
      impact: 'high',
    },
    smoothTransitions: {
      antiPattern: /transition-all(?!\s+duration)/,
      missing: 'Use specific transitions with duration',
      code: 'transition-all duration-200 ease-out',
      impact: 'medium',
    },
  },
  glassmorphism: {
    navBar: {
      signal: /(nav|header|Nav|Header|Navbar|TopBar)/,
      pattern: /backdrop-blur/,
      missing: 'Premium nav with glass + blur + border',
      code: 'bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 border-b border-white/20',
      impact: 'high',
    },
    modals: {
      signal: /(modal|dialog|Modal|Dialog|Sheet|Overlay)/,
      pattern: /backdrop-blur/,
      missing: 'Glass modal with animated backdrop',
      code: 'bg-white/90 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl',
      impact: 'high',
    },
    stickyElements: {
      signal: /sticky\s+top/,
      pattern: /backdrop-blur/,
      missing: 'Add glass effect to sticky elements',
      code: 'backdrop-blur-md bg-white/70',
      impact: 'medium',
    },
  },
  animations: {
    pageTransitions: {
      signal: /AnimatePresence|motion\./,
      alwaysCheck: true,
      missing: 'Add Framer Motion page transitions for smooth navigation',
      code: `<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>`,
      impact: 'high',
    },
    staggeredLoading: {
      signal: /\.map\s*\(/,
      pattern: /delay.*(\*|index)|stagger/i,
      missing: 'Stagger list item animations for premium feel',
      code: 'transition={{ delay: index * 0.05 }}',
      impact: 'medium',
    },
    fadeIn: {
      signal: /(initial|animate)\s*=/,
      pattern: /opacity:\s*0/,
      missing: 'Add fade-in animations for content',
      code: 'initial={{ opacity: 0 }} animate={{ opacity: 1 }}',
      impact: 'medium',
    },
  },
  loadingStates: {
    skeletons: {
      signal: /(loading|isLoading|isPending)/i,
      pattern: /(skeleton|Skeleton|animate-pulse)/,
      missing: 'Use skeleton loaders instead of spinners',
      code: `<div className="animate-pulse space-y-4">
  <div className="h-4 bg-slate-200/60 rounded w-3/4" />
</div>`,
      impact: 'high',
    },
    shimmer: {
      signal: /animate-pulse/,
      pattern: /shimmer|background.*gradient/,
      missing: 'Add shimmer effect to skeletons',
      code: 'bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-shimmer',
      impact: 'low',
    },
  },
  emptyStates: {
    illustrations: {
      signal: /(empty|no\s*(items|data|results))/i,
      pattern: /(EmptyState|illustration|icon.*w-16)/i,
      missing: 'Add friendly illustrations to empty states',
      code: `<EmptyState
  icon={<Icon className="w-16 h-16 text-slate-300" />}
  title="No items yet"
  action={<Button>Create</Button>}
/>`,
      impact: 'medium',
    },
  },
  accessibility: {
    focusRings: {
      signal: /(button|Button|input|Input|onClick)/,
      pattern: /focus:ring/,
      missing: 'Add visible focus rings for keyboard navigation',
      code: 'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
      impact: 'high',
    },
    touchTargets: {
      signal: /(button|Button)/i,
      pattern: /(min-h-\[44|h-1[0-2]|py-3)/,
      missing: 'Ensure 44px+ touch targets for buttons',
      code: 'min-h-[44px] px-4 py-2.5',
      impact: 'medium',
    },
  },
};

export class UIEnhancementAgent extends BaseAgent {
  constructor(config = {}) {
    super('ui-enhancement', [
      'ui-analysis',
      'ui-enhancement',
      'consistency-check',
      'component-design',
      'premium-validation',
      'premium-patterns', // NEW: Premium UI patterns
    ]);

    this.config = {
      icon: '🎨',
      color: '#ec4899',
      description: 'Premium UI enhancement with design system + premium patterns',
    };

    this.uiKnowledge = UIKnowledge;
    this.helmKnowledge = HelmKnowledge;
    this.premiumPatterns = PremiumPatterns;
    
    // Cache for consistency analysis across routes
    this.patternCache = new Map();
    this.analysisCache = new Map();
  }

  async initialize() {
    this.log('info', 'Initializing UI Enhancement Agent...');
    this.log('success', `Loaded ${Object.keys(this.uiKnowledge.components).length} component patterns`);
    this.log('success', `Loaded ${Object.keys(this.uiKnowledge.pagePatterns).length} page patterns`);
    this.log('success', `Loaded ${Object.keys(this.premiumPatterns).length} premium pattern categories`);
    this.log('success', `Philosophy: ${this.uiKnowledge.philosophy.vision}`);
    return true;
  }

  // ============================================
  // MAIN ANALYSIS METHOD
  // ============================================

  /**
   * Full UI analysis for a route
   */
  async analyzeUI(routePath, code) {
    return this.executeTask(`Analyze UI: ${routePath}`, async () => {
      // Detect context
      const pageType = this.uiKnowledge.detectPageType(routePath, code);
      const domain = this.uiKnowledge.detectDomain(routePath);
      const pagePattern = this.uiKnowledge.pagePatterns[pageType];
      const domainColors = this.uiKnowledge.tokens.colors[domain] || this.uiKnowledge.tokens.colors.baseball;

      // Run all analysis
      const issues = this.detectIssues(code, routePath, pageType, domain);
      const consistencyIssues = this.checkConsistency(code, routePath, domain);
      const enhancements = this.generateEnhancements(code, routePath, pageType, domain);
      const componentAnalysis = this.analyzeComponents(code, pageType);
      
      // NEW: Premium pattern analysis
      const premiumIssues = this.analyzePremiumPatterns(code, routePath);
      
      // Combine all issues
      const allIssues = [...issues, ...consistencyIssues, ...premiumIssues];
      
      const premiumScore = this.calculatePremiumScore(code, pageType, allIssues, componentAnalysis);

      // Build result
      const result = {
        routePath,
        pageType,
        domain,
        premiumScore,
        status: premiumScore >= 80 ? 'premium' : premiumScore >= 60 ? 'good' : premiumScore >= 40 ? 'needs-work' : 'critical',
        
        // Context
        context: {
          pagePattern: pagePattern?.description,
          required: pagePattern?.required || [],
          premium: pagePattern?.premium || [],
          domainColors,
        },

        // Issues found (including premium patterns)
        issues: allIssues,
        
        // Component breakdown
        components: componentAnalysis,
        
        // Enhancement suggestions
        enhancements,
        
        // Premium pattern analysis
        premiumAnalysis: {
          patterns: premiumIssues,
          score: this.calculatePremiumPatternScore(code),
        },
        
        // Summary
        summary: this.generateSummary(pageType, premiumScore, allIssues, enhancements),
      };

      // Cache for consistency checking
      this.analysisCache.set(routePath, result);
      this.cachePatterns(code, routePath, domain);

      // Share discovery
      this.shareDiscovery('ui-analysis-complete', {
        route: routePath,
        pageType,
        score: premiumScore,
        issueCount: result.issues.length,
        enhancementCount: enhancements.length,
      });

      return result;
    });
  }

  // ============================================
  // PREMIUM PATTERN ANALYSIS (NEW!)
  // ============================================

  /**
   * Analyze code against premium UI patterns
   */
  analyzePremiumPatterns(code, routePath) {
    const issues = [];

    for (const [category, patterns] of Object.entries(this.premiumPatterns)) {
      for (const [patternName, pattern] of Object.entries(patterns)) {
        const suggestion = this.checkPremiumPattern(code, pattern, category, patternName);
        if (suggestion) {
          issues.push(suggestion);
        }
      }
    }

    return issues;
  }

  /**
   * Check a single premium pattern
   */
  checkPremiumPattern(code, pattern, category, patternName) {
    // Check if this pattern applies (has signal)
    if (pattern.signal && !new RegExp(pattern.signal).test(code)) {
      // Signal not present, pattern doesn't apply
      return null;
    }

    // Check if pattern is already implemented
    if (pattern.pattern && new RegExp(pattern.pattern).test(code)) {
      // Already has the pattern
      return null;
    }

    // Check anti-pattern
    if (pattern.antiPattern && new RegExp(pattern.antiPattern).test(code)) {
      return {
        id: `premium-${category}-${patternName}`,
        severity: pattern.impact === 'high' ? 'warning' : 'info',
        title: `Premium ${category}: ${pattern.missing}`,
        description: pattern.missing,
        category: 'premium-pattern',
        why: `Premium apps like Linear/Stripe use this pattern for polish`,
        result: `More refined, premium feel matching industry leaders`,
        fix: {
          approach: pattern.missing,
          code: pattern.code,
        },
        effort: 'low',
        impact: pattern.impact,
        source: 'premium-patterns',
      };
    }

    // Pattern is missing
    if (pattern.alwaysCheck || pattern.signal) {
      // Check if we have the signal but missing the pattern
      const hasSignal = pattern.signal ? new RegExp(pattern.signal).test(code) : true;
      const hasPattern = pattern.pattern ? new RegExp(pattern.pattern).test(code) : false;

      if (hasSignal && !hasPattern) {
        return {
          id: `premium-${category}-${patternName}`,
          severity: pattern.impact === 'high' ? 'warning' : 'info',
          title: `Premium ${category}: ${pattern.missing}`,
          description: pattern.missing,
          category: 'premium-pattern',
          why: `Premium apps like Linear/Stripe use this pattern for polish`,
          result: `More refined, premium feel matching industry leaders`,
          fix: {
            approach: pattern.missing,
            code: pattern.code,
          },
          effort: 'low',
          impact: pattern.impact,
          source: 'premium-patterns',
        };
      }
    }

    return null;
  }

  /**
   * Calculate premium pattern score (0-100)
   */
  calculatePremiumPatternScore(code) {
    let score = 50; // Start neutral

    // Positive signals - premium patterns present
    if (/transition-\[|transition-all duration/.test(code)) score += 10;
    if (/backdrop-blur/.test(code)) score += 10;
    if (/hover:(scale|shadow|-translate)/.test(code)) score += 10;
    if (/rounded-(2xl|3xl)/.test(code)) score += 5;
    if (/shadow-(lg|xl|2xl)/.test(code)) score += 5;
    if (/animate-/.test(code)) score += 5;
    if (/motion\.div|AnimatePresence/.test(code)) score += 10;
    if (/focus:ring/.test(code)) score += 5;
    if (/skeleton|Skeleton|animate-pulse/.test(code)) score += 5;

    // Negative signals
    if (/transition-all(?!\s+duration)/.test(code)) score -= 10;
    if (/#[0-9a-f]{6}/i.test(code)) score -= 5; // Hardcoded colors
    if (/\bp-[12]\b/.test(code)) score -= 5; // Too tight padding
    if (/text-xs(?!\s+sm:)/.test(code)) score -= 5; // Too small text

    return Math.max(0, Math.min(100, score));
  }

  // ============================================
  // ISSUE DETECTION
  // ============================================

  /**
   * Detect UI issues in code
   */
  detectIssues(code, routePath, pageType, domain) {
    const issues = [];

    // 1. Spacing issues
    const arbitrarySpacing = code.match(/[pm][xytblr]?-\[\d+px\]/g) || [];
    if (arbitrarySpacing.length > 0) {
      issues.push({
        id: 'arbitrary-spacing',
        severity: 'warning',
        title: 'Arbitrary Spacing Values',
        description: `Found ${arbitrarySpacing.length} arbitrary values. Use spacing scale (4, 8, 12, 16, 24, 32px).`,
        found: [...new Set(arbitrarySpacing)].slice(0, 5),
        why: 'Arbitrary values break visual rhythm. The 8px grid creates consistent spacing.',
        result: 'Consistent visual rhythm matching Linear/Stripe quality.',
        fix: {
          approach: 'Replace with Tailwind scale values',
          examples: [
            'p-[13px] → p-3 (12px)',
            'p-[17px] → p-4 (16px)',
            'm-[22px] → m-6 (24px)',
          ],
        },
        effort: 'low',
      });
    }

    // 2. Color consistency
    const hexColors = [...new Set(code.match(/#[0-9a-fA-F]{6}/g) || [])];
    const domainColors = this.uiKnowledge.tokens.colors[domain];
    const allowedColors = Object.values(domainColors || {}).flat().filter(c => typeof c === 'string');
    const rogueColors = hexColors.filter(c => !allowedColors.some(allowed => 
      allowed.toLowerCase().includes(c.toLowerCase())
    ));
    
    if (rogueColors.length > 3) {
      issues.push({
        id: 'rogue-colors',
        severity: 'warning',
        title: 'Inconsistent Color Usage',
        description: `Found ${rogueColors.length} colors outside design system.`,
        found: rogueColors.slice(0, 5),
        why: 'Colors should come from domain palette for consistency.',
        result: 'Cohesive color scheme matching domain identity.',
        fix: {
          approach: 'Use design tokens or Tailwind classes',
          domainAccent: domain === 'golf' ? '#10b981 (emerald)' : '#169B45 (kelly green)',
        },
        effort: 'medium',
      });
    }

    // 3. Border radius consistency
    const radiiFound = [];
    ['rounded-sm', 'rounded-md', 'rounded', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl'].forEach(r => {
      const count = (code.match(new RegExp(r + '(?![\\w-])', 'g')) || []).length;
      if (count > 0) radiiFound.push({ value: r, count });
    });
    
    if (radiiFound.length > 3) {
      issues.push({
        id: 'inconsistent-radii',
        severity: 'warning',
        title: 'Too Many Border Radius Values',
        description: `Found ${radiiFound.length} different radii. Use max 3.`,
        found: radiiFound.map(r => `${r.value} (${r.count}x)`),
        why: 'Consistent radii create visual harmony. Pick values for: inputs, buttons, cards.',
        result: 'Clean, consistent rounded corners throughout.',
        fix: {
          standard: this.uiKnowledge.tokens.radii.consistency,
          approach: 'Standardize: inputs=rounded-lg, buttons=rounded-xl, cards=rounded-2xl',
        },
        effort: 'low',
      });
    }

    // 4. Missing transitions
    const hoverCount = (code.match(/hover:/g) || []).length;
    const transitionCount = (code.match(/transition/g) || []).length;
    if (hoverCount > transitionCount * 2) {
      issues.push({
        id: 'missing-transitions',
        severity: 'warning',
        title: 'Hover States Without Transitions',
        description: 'Hover effects need transitions for smooth feedback.',
        why: 'Instant state changes feel jarring. Smooth transitions feel premium.',
        result: 'Buttery smooth interactions like Linear/Stripe.',
        fix: {
          approach: 'Add transition-all duration-200 to hoverable elements',
          className: 'transition-all duration-200 ease-out',
        },
        effort: 'low',
      });
    }

    // 5. Glass on data surfaces (anti-pattern)
    if (code.includes('backdrop-blur') && (code.includes('table') || code.includes('Table') || code.includes('tbody'))) {
      issues.push({
        id: 'glass-on-data',
        severity: 'error',
        title: 'Glass Effect on Data Surface',
        description: 'Blur effects reduce data readability. Use solid backgrounds.',
        why: 'Data needs maximum readability. Glass is for chrome (nav, toolbars), not content.',
        result: 'Clear, readable data with professional appearance.',
        fix: {
          approach: 'Remove backdrop-blur from data containers',
          alternative: 'Use bg-white with subtle border instead',
        },
        effort: 'low',
      });
    }

    // 6. Page-type specific issues
    const pagePattern = this.uiKnowledge.pagePatterns[pageType];
    if (pagePattern) {
      // Check required elements
      for (const required of pagePattern.required || []) {
        const signalPatterns = {
          'Animated background': ['AnimatedBackground', 'gradient', 'motion.div.*background'],
          'Progress indicator': ['Progress', 'step', 'dots'],
          'Back navigation': ['Back', 'previous', 'onBack'],
          'Loading state': ['loading', 'isLoading', 'skeleton', 'Skeleton'],
          'Empty state': ['empty', 'no results', 'EmptyState', 'length === 0'],
          'KPI cards': ['KPI', 'metric', 'stat', 'delta'],
          'Command palette': ['⌘K', 'command', 'CommandPalette'],
        };

        const patterns = signalPatterns[required];
        if (patterns) {
          const found = patterns.some(p => code.toLowerCase().includes(p.toLowerCase()));
          if (!found) {
            issues.push({
              id: `missing-${required.toLowerCase().replace(/\s+/g, '-')}`,
              severity: 'info',
              title: `Missing: ${required}`,
              description: `${pageType} pages should have ${required}.`,
              why: pagePattern.description,
              result: `Complete ${pageType} experience with ${required}.`,
              fix: {
                approach: `Add ${required} component`,
                reference: pagePattern.premium?.find(p => p.toLowerCase().includes(required.toLowerCase())),
              },
              effort: 'medium',
            });
          }
        }
      }

      // Check anti-patterns
      for (const antiPattern of pagePattern.antiPatterns || []) {
        const antiSignals = {
          'Glass on data tables': code.includes('backdrop-blur') && code.includes('table'),
          'No progress indication': pageType === 'onboarding' && !code.includes('progress') && !code.includes('step'),
          'Jarring page transitions': pageType === 'onboarding' && !code.includes('AnimatePresence'),
          'Generic empty states': code.includes('No data') || code.includes('Nothing here'),
        };

        if (antiSignals[antiPattern]) {
          issues.push({
            id: `anti-${antiPattern.toLowerCase().replace(/\s+/g, '-')}`,
            severity: 'warning',
            title: `Anti-pattern: ${antiPattern}`,
            description: `This pattern hurts the ${pageType} experience.`,
            why: 'Anti-patterns make the UI feel generic or template-like.',
            result: 'Premium feel by avoiding common pitfalls.',
            effort: 'medium',
          });
        }
      }
    }

    // 7. Missing focus states
    if (code.includes('button') || code.includes('Button') || code.includes('input')) {
      if (!code.includes('focus:ring') && !code.includes('focus:outline')) {
        issues.push({
          id: 'missing-focus-states',
          severity: 'warning',
          title: 'Missing Focus States',
          description: 'Interactive elements need visible focus states for accessibility.',
          why: 'Focus states improve accessibility and feel more polished.',
          result: 'Accessible, professional focus indicators.',
          fix: {
            approach: 'Add focus:ring classes to interactive elements',
            className: 'focus:outline-none focus:ring-4 focus:ring-[#169B45]/20 focus:border-[#169B45]',
          },
          effort: 'low',
        });
      }
    }

    // 8. Generic font usage
    if (code.includes('font-inter') || code.includes('font-roboto') || code.includes('font-arial')) {
      issues.push({
        id: 'generic-font',
        severity: 'info',
        title: 'Generic Font Family',
        description: 'Using generic fonts. Helm uses SF Pro for premium feel.',
        why: 'Font choice significantly impacts perceived quality.',
        result: 'Apple-quality typography with SF Pro.',
        fix: {
          approach: 'Use font-sf-pro class or system font stack',
          className: 'font-sf-pro',
        },
        effort: 'low',
      });
    }

    return issues;
  }

  // ============================================
  // CONSISTENCY CHECKING
  // ============================================

  /**
   * Check consistency with other routes in same domain
   */
  checkConsistency(code, routePath, domain) {
    const issues = [];
    
    // Get cached patterns from same domain
    const domainPatterns = [];
    for (const [path, patterns] of this.patternCache) {
      if (this.uiKnowledge.detectDomain(path) === domain && path !== routePath) {
        domainPatterns.push({ path, patterns });
      }
    }

    if (domainPatterns.length === 0) return issues;

    // Extract patterns from current code
    const currentPatterns = this.extractPatterns(code);

    // Compare with domain patterns
    for (const { path, patterns } of domainPatterns) {
      // Check button styles
      if (patterns.buttonStyles?.length && currentPatterns.buttonStyles?.length) {
        const mismatch = currentPatterns.buttonStyles.some(s => 
          !patterns.buttonStyles.includes(s)
        );
        if (mismatch) {
          issues.push({
            id: 'button-inconsistency',
            severity: 'info',
            title: 'Button Style Inconsistency',
            description: `Button styles differ from ${path}`,
            why: 'Same domain should use same button variants.',
            result: 'Consistent buttons throughout the domain.',
            fix: {
              approach: 'Use shared Button component with variants',
              reference: path,
            },
            effort: 'low',
          });
          break;
        }
      }

      // Check card styles
      if (patterns.cardStyles?.length && currentPatterns.cardStyles?.length) {
        const cardMismatch = currentPatterns.cardRadii?.some(r => 
          patterns.cardRadii?.length && !patterns.cardRadii.includes(r)
        );
        if (cardMismatch) {
          issues.push({
            id: 'card-inconsistency',
            severity: 'info',
            title: 'Card Style Inconsistency',
            description: `Card styles differ from ${path}`,
            why: 'Cards should use consistent radii and shadows.',
            result: 'Unified card appearance.',
            fix: {
              approach: 'Standardize card component',
              standard: 'rounded-2xl shadow-sm hover:shadow-lg',
            },
            effort: 'low',
          });
          break;
        }
      }
    }

    return issues;
  }

  /**
   * Extract patterns from code for caching
   */
  extractPatterns(code) {
    return {
      buttonStyles: (code.match(/className="[^"]*btn[^"]*"/g) || []),
      cardStyles: (code.match(/className="[^"]*card[^"]*"/g) || []),
      cardRadii: (code.match(/rounded-\w+/g) || []).filter(r => 
        code.indexOf(r) > code.indexOf('card') - 100 && 
        code.indexOf(r) < code.indexOf('card') + 200
      ),
      inputStyles: (code.match(/className="[^"]*input[^"]*"/g) || []),
      hasGlass: code.includes('backdrop-blur'),
      hasAnimations: code.includes('motion.') || code.includes('animate-'),
    };
  }

  /**
   * Cache patterns for cross-route consistency
   */
  cachePatterns(code, routePath, domain) {
    this.patternCache.set(routePath, this.extractPatterns(code));
  }

  // ============================================
  // COMPONENT ANALYSIS
  // ============================================

  /**
   * Analyze component usage and quality
   */
  analyzeComponents(code, pageType) {
    const analysis = {
      found: [],
      missing: [],
      quality: {},
    };

    // Check for common components
    const componentChecks = {
      Card: {
        signal: /className="[^"]*(?:rounded-(?:xl|2xl|3xl)|card)[^"]*"/,
        premium: ['hover:-translate', 'hover:shadow', 'transition'],
      },
      Button: {
        signal: /(?:<button|<Button|onClick)/,
        premium: ['transition', 'active:scale', 'focus:ring'],
      },
      Input: {
        signal: /(?:<input|<Input|<textarea)/,
        premium: ['focus:ring', 'focus:border', 'transition'],
      },
      Loading: {
        signal: /(?:isLoading|loading|skeleton|Skeleton|animate-pulse)/,
        premium: ['shimmer', 'stagger'],
      },
      Empty: {
        signal: /(?:empty|EmptyState|length === 0|no results)/i,
        premium: ['icon', 'cta', 'action'],
      },
      Modal: {
        signal: /(?:modal|Modal|dialog|Dialog)/,
        premium: ['AnimatePresence', 'backdrop-blur', 'rounded-3xl'],
      },
      Navigation: {
        signal: /(?:nav|Nav|sidebar|Sidebar|header|Header)/,
        premium: ['sticky', 'backdrop-blur', 'z-'],
      },
    };

    for (const [component, check] of Object.entries(componentChecks)) {
      if (check.signal.test(code)) {
        analysis.found.push(component);
        
        // Check quality
        const premiumFeatures = check.premium.filter(p => code.includes(p));
        const quality = Math.round((premiumFeatures.length / check.premium.length) * 100);
        
        analysis.quality[component] = {
          score: quality,
          has: premiumFeatures,
          missing: check.premium.filter(p => !code.includes(p)),
        };
      }
    }

    // Check for missing components based on page type
    const pagePattern = this.uiKnowledge.pagePatterns[pageType];
    if (pagePattern) {
      const componentSignals = {
        'Loading state': 'Loading',
        'Empty state': 'Empty',
        'Progress indicator': 'Progress',
        'Command palette': 'CommandPalette',
      };

      for (const required of pagePattern.required || []) {
        const componentName = componentSignals[required];
        if (componentName && !analysis.found.includes(componentName)) {
          analysis.missing.push({
            component: required,
            reason: `Required for ${pageType} pages`,
          });
        }
      }
    }

    return analysis;
  }

  // ============================================
  // ENHANCEMENT GENERATION
  // ============================================

  /**
   * Generate enhancement suggestions
   */
  generateEnhancements(code, routePath, pageType, domain) {
    const enhancements = [];

    // Get base enhancements from knowledge
    const baseEnhancements = this.uiKnowledge.generateEnhancements(code, routePath);
    
    for (const enhancement of baseEnhancements) {
      enhancements.push({
        ...enhancement,
        type: 'ui-enhancement',
        source: 'ui-knowledge',
        domain,
        pageType,
      });
    }

    // Page-type specific premium enhancements
    const pagePattern = this.uiKnowledge.pagePatterns[pageType];
    if (pagePattern?.premium) {
      for (const premiumFeature of pagePattern.premium) {
        const featureSignals = {
          'Cinematic intro animation': ['CinematicIntro', 'cinematic'],
          'Page transitions': ['AnimatePresence', 'pageTransition'],
          '3D tilt on interactive cards': ['TiltCard', 'rotateX', 'rotateY'],
          'Floating labels on inputs': ['FloatingInput', 'FloatingLabel'],
          'Pulse animation on current step': ['pulse', 'ring-animation'],
          'Confetti/celebration': ['confetti', 'celebration'],
          'Animated number counters': ['CountUp', 'animatedNumber'],
          'Micro-interactions on KPIs': ['whileHover', 'animate'],
          'Contextual empty states': ['EmptyState', 'contextual'],
          'Skeleton loading that matches content': ['Skeleton', 'shimmer'],
        };

        const signals = featureSignals[premiumFeature] || [premiumFeature.toLowerCase()];
        const hasFeature = signals.some(s => code.toLowerCase().includes(s.toLowerCase()));

        if (!hasFeature) {
          const enhancement = this.uiKnowledge.enhancements[this.getEnhancementKey(premiumFeature)];
          if (enhancement) {
            enhancements.push({
              id: enhancement.id,
              title: enhancement.name,
              description: enhancement.description,
              priority: 'medium',
              effort: enhancement.effort,
              impact: enhancement.impact,
              type: 'premium-feature',
              source: 'page-pattern',
              pageType,
              why: `Premium feature for ${pageType}: ${premiumFeature}`,
              result: `Elevated ${pageType} experience`,
              implementation: enhancement.code || enhancement.className,
            });
          } else {
            enhancements.push({
              id: `premium-${premiumFeature.toLowerCase().replace(/\s+/g, '-')}`,
              title: premiumFeature,
              description: `Add ${premiumFeature} for premium experience`,
              priority: 'low',
              effort: 'medium',
              impact: 'medium',
              type: 'premium-feature',
              source: 'page-pattern',
              pageType,
              why: `Premium ${pageType} pages have this feature`,
              result: `More polished ${pageType} experience`,
            });
          }
        }
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    enhancements.sort((a, b) => 
      (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
    );

    return enhancements;
  }

  /**
   * Map premium feature name to enhancement key
   */
  getEnhancementKey(featureName) {
    const mapping = {
      'Animated background': 'background',
      '3D tilt on interactive cards': 'card3DTilt',
      'Floating labels on inputs': 'floatingLabel',
      'Pulse animation on current step': 'steppedProgress',
      'Skeleton loading': 'shimmerSkeleton',
    };
    return mapping[featureName] || null;
  }

  // ============================================
  // SCORING
  // ============================================

  /**
   * Calculate premium score (0-100)
   */
  calculatePremiumScore(code, pageType, issues, components) {
    let score = 100;

    // Deduct for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error': score -= 15; break;
        case 'warning': score -= 8; break;
        case 'info': score -= 3; break;
      }
    }

    // Deduct for missing required components
    const missingCount = components.missing?.length || 0;
    score -= missingCount * 5;

    // Bonus for premium features
    if (code.includes('AnimatePresence')) score += 5;
    if (code.includes('motion.')) score += 3;
    if (code.includes('backdrop-blur') && !code.includes('table')) score += 2;
    if (code.includes('transition-all')) score += 2;
    if (code.includes('hover:-translate')) score += 2;
    if (code.includes('focus:ring')) score += 2;

    // Bonus for component quality
    const qualityScores = Object.values(components.quality || {}).map(q => q.score);
    if (qualityScores.length > 0) {
      const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
      score += Math.round((avgQuality - 50) / 10); // Bonus/penalty based on quality
    }

    return Math.max(0, Math.min(100, score));
  }

  // ============================================
  // SUMMARY GENERATION
  // ============================================

  /**
   * Generate executive summary
   */
  generateSummary(pageType, score, issues, enhancements) {
    const status = score >= 80 ? 'premium' : score >= 60 ? 'good' : score >= 40 ? 'needs-work' : 'critical';
    
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const highPriorityEnhancements = enhancements.filter(e => e.priority === 'high');

    let message = '';
    if (status === 'premium') {
      message = '✨ This page meets premium standards. Consider the suggested enhancements for extra polish.';
    } else if (status === 'good') {
      message = '👍 Good foundation. Address warnings and add key enhancements to reach premium.';
    } else if (status === 'needs-work') {
      message = '⚠️ Several issues affecting quality. Focus on consistency and missing patterns.';
    } else {
      message = '🚨 Critical issues found. Address errors first, then work through warnings.';
    }

    return {
      status,
      score,
      message,
      pageType,
      quickStats: {
        errors: errorCount,
        warnings: warningCount,
        enhancements: enhancements.length,
      },
      topPriority: highPriorityEnhancements.slice(0, 3).map(e => e.title),
      nextSteps: this.generateNextSteps(status, issues, enhancements),
    };
  }

  /**
   * Generate actionable next steps
   */
  generateNextSteps(status, issues, enhancements) {
    const steps = [];

    // Always fix errors first
    const errors = issues.filter(i => i.severity === 'error');
    if (errors.length > 0) {
      steps.push(`Fix ${errors.length} error(s): ${errors.map(e => e.title).join(', ')}`);
    }

    // Then high-impact low-effort fixes
    const quickWins = issues.filter(i => i.effort === 'low' && i.severity === 'warning');
    if (quickWins.length > 0) {
      steps.push(`Quick wins: ${quickWins.slice(0, 3).map(e => e.title).join(', ')}`);
    }

    // Then high-priority enhancements
    const highPriority = enhancements.filter(e => e.priority === 'high');
    if (highPriority.length > 0) {
      steps.push(`Add: ${highPriority.slice(0, 2).map(e => e.title).join(', ')}`);
    }

    return steps.slice(0, 4);
  }

  // ============================================
  // FEATURE DESIGN (Pipeline Integration)
  // ============================================

  /**
   * Design UI for a new feature (called by pipeline after FeatureAgent)
   */
  async designFeatureUI(featureSuggestion, routePath, code) {
    return this.executeTask(`Design UI: ${featureSuggestion.title}`, async () => {
      const pageType = this.uiKnowledge.detectPageType(routePath, code);
      const domain = this.uiKnowledge.detectDomain(routePath);
      
      // Get relevant component patterns
      const componentType = this.mapFeatureToComponent(featureSuggestion);
      const componentPattern = this.uiKnowledge.components[componentType];
      
      // Get domain colors
      const domainColors = this.uiKnowledge.tokens.colors[domain];
      
      // Build UI specification
      const uiSpec = {
        feature: featureSuggestion.title,
        featureId: featureSuggestion.id,
        
        // Component recommendation
        component: {
          type: componentType,
          variant: this.recommendVariant(componentPattern, pageType),
          baseClassName: componentPattern?.variants?.standard?.className || '',
        },
        
        // Styling tokens
        tokens: {
          colors: {
            accent: domainColors?.accent?.primary,
            accentMuted: domainColors?.accent?.muted,
            background: domainColors?.background?.primary,
            text: domainColors?.text?.primary,
          },
          spacing: this.uiKnowledge.tokens.spacing.scale,
          radii: this.uiKnowledge.tokens.radii.consistency,
        },
        
        // Motion recommendations
        motion: {
          hover: this.uiKnowledge.tokens.motion.patterns.hover,
          transition: 'transition-all duration-200 ease-out',
          animate: componentType === 'card' ? 'hover:-translate-y-1 hover:shadow-lg' : null,
        },
        
        // Premium additions (from PremiumPatterns)
        premium: this.recommendPremiumAdditions(featureSuggestion, pageType, code),
        
        // Code snippet
        codeSnippet: this.generateCodeSnippet(featureSuggestion, componentPattern, domain),
        
        // Consistency notes
        consistencyNotes: this.getConsistencyNotes(componentType, routePath),
      };

      // Share for next agent in pipeline
      this.shareDiscovery('feature-ui-designed', {
        feature: featureSuggestion.title,
        component: componentType,
        ready: true,
      });

      return uiSpec;
    });
  }

  /**
   * Map feature type to component type
   */
  mapFeatureToComponent(feature) {
    const mapping = {
      'recurring-events': 'modal',
      'attendance-tracking': 'card',
      'drag-drop-reschedule': 'card',
      'calendar-sync': 'button',
      'event-notifications': 'card',
      'bulk-import': 'modal',
      'advanced-filters': 'input',
      'loading-state': 'loading',
      'empty-state': 'emptyState',
    };
    
    const featureId = feature.id?.replace('feature-', '').replace('advanced-', '');
    return mapping[featureId] || 'card';
  }

  /**
   * Recommend component variant
   */
  recommendVariant(componentPattern, pageType) {
    if (!componentPattern?.variants) return 'standard';
    
    if (pageType === 'onboarding') return 'interactive';
    if (pageType === 'dashboard') return 'standard';
    if (pageType === 'landing') return 'premium';
    
    return 'standard';
  }

  /**
   * Recommend premium additions for feature
   */
  recommendPremiumAdditions(feature, pageType, code) {
    const additions = [];
    
    // Check which premium patterns are missing and relevant
    for (const [category, patterns] of Object.entries(this.premiumPatterns)) {
      for (const [patternName, pattern] of Object.entries(patterns)) {
        // Check if pattern applies and is missing
        const applies = pattern.signal ? new RegExp(pattern.signal).test(code) : true;
        const has = pattern.pattern ? new RegExp(pattern.pattern).test(code) : false;
        
        if (applies && !has && pattern.impact === 'high') {
          additions.push({
            type: category,
            pattern: patternName,
            className: pattern.code,
            why: pattern.missing,
          });
        }
      }
    }

    // Always recommend transitions
    if (!code.includes('transition')) {
      additions.push({
        type: 'transition',
        className: 'transition-all duration-200',
        why: 'Smooth state changes',
      });
    }

    // Hover effects for interactive features
    if (feature.category === 'feature' || feature.category === 'ui') {
      if (!code.includes('hover:-translate')) {
        additions.push({
          type: 'hover',
          className: 'hover:-translate-y-0.5 hover:shadow-md',
          why: 'Interactive feedback',
        });
      }
    }

    return additions.slice(0, 5); // Max 5 suggestions
  }

  /**
   * Generate code snippet for feature
   */
  generateCodeSnippet(feature, componentPattern, domain) {
    const accent = domain === 'golf' ? '#10b981' : '#169B45';
    const variant = componentPattern?.variants?.standard?.className || '';
    
    return `// ${feature.title} Component
// Following Helm premium design system

export function ${this.toPascalCase(feature.title)}() {
  return (
    <div className="${variant}">
      {/* Implementation */}
    </div>
  );
}`;
  }

  /**
   * Get consistency notes
   */
  getConsistencyNotes(componentType, routePath) {
    const notes = [];
    
    // Check cached patterns
    for (const [path, patterns] of this.patternCache) {
      if (path !== routePath) {
        notes.push(`Reference ${path} for ${componentType} patterns`);
        break;
      }
    }
    
    // Add component-specific notes
    const componentNotes = {
      card: 'Use rounded-2xl, consistent padding (p-6), hover:-translate-y-1',
      button: 'Use rounded-xl, consistent heights (h-10, h-12), focus:ring',
      input: 'Use rounded-xl, consistent heights (h-12), focus:ring with accent',
      modal: 'Use rounded-3xl, backdrop-blur-sm on overlay',
    };
    
    if (componentNotes[componentType]) {
      notes.push(componentNotes[componentType]);
    }
    
    return notes;
  }

  /**
   * Convert string to PascalCase
   */
  toPascalCase(str) {
    return str
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  handleMessage(message) {
    switch (message.type) {
      case 'analyze-ui':
        this.analyzeUI(message.payload.route, message.payload.code)
          .then(result => this.sendToAgent(message.from, 'ui-analysis-result', result));
        break;
        
      case 'design-feature-ui':
        this.designFeatureUI(message.payload.feature, message.payload.route, message.payload.code)
          .then(result => this.sendToAgent(message.from, 'feature-ui-spec', result));
        break;
        
      case 'check-consistency':
        const issues = this.checkConsistency(
          message.payload.code, 
          message.payload.route, 
          message.payload.domain
        );
        this.sendToAgent(message.from, 'consistency-result', { issues });
        break;
        
      case 'request-premium-analysis':
        // Handle requests from PremiumUIAgent for backwards compatibility
        this.analyzeUI(message.payload.routePath, message.payload.code)
          .then(result => this.sendToAgent(message.from, 'premium-analysis-complete', result));
        break;
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      cachedRoutes: this.analysisCache.size,
      patternsCached: this.patternCache.size,
      premiumPatternCategories: Object.keys(this.premiumPatterns),
      philosophy: this.uiKnowledge.philosophy.vision,
    };
  }
}

export default UIEnhancementAgent;
