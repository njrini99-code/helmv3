/**
 * PremiumUIAgent - Claude Premium UI Skill Implementation
 *
 * This agent embodies the Claude premium UI design skill:
 * - Analyzes components for premium feel
 * - Suggests microinteractions and animations
 * - Recommends glassmorphism patterns
 * - Checks visual hierarchy and spacing
 * - Validates touch targets and accessibility
 * - Suggests premium polish enhancements
 *
 * NO PAID API CALLS - Uses pattern matching and analysis
 */

import { BaseAgent } from './coordination/base-agent.js';

export class PremiumUIAgent extends BaseAgent {
  constructor(config = {}) {
    super('premium-ui', [
      'microinteractions',
      'glassmorphism',
      'visual-hierarchy',
      'animation-timing',
      'premium-polish',
      'accessibility-plus',
    ]);

    this.config = {
      icon: '✨',
      color: '#a855f7',
      description: 'Premium UI enhancement recommendations (Claude skill)',
    };

    this.premiumPatterns = this.buildPremiumPatterns();
  }

  async initialize() {
    this.log('info', 'Initializing Premium UI Agent (Claude Skill)...');
    this.log('success', `Loaded ${Object.keys(this.premiumPatterns).length} premium patterns`);
    return true;
  }

  /**
   * Build premium UI pattern library
   */
  buildPremiumPatterns() {
    return {
      microinteractions: {
        hoverScale: {
          pattern: /hover:scale-\d+/,
          recommendation: 'Add subtle hover scale (hover:scale-105) with smooth transition',
          why: 'Makes UI feel responsive and alive - premium apps breathe',
          code: 'className="transition-transform hover:scale-105"',
        },
        hoverGlow: {
          pattern: /hover:shadow-\w+/,
          recommendation: 'Add glow on hover for interactive elements',
          why: 'Creates depth and signals interactivity',
          code: 'className="transition-shadow hover:shadow-lg hover:shadow-green-500/20"',
        },
        rippleEffect: {
          pattern: /ripple|wave/i,
          recommendation: 'Add ripple effect on button clicks',
          why: 'Premium tactile feedback - users feel the interaction',
          code: 'Add <RippleEffect /> component wrapping buttons',
        },
        smoothTransitions: {
          pattern: /transition-(?!all|transform|opacity|colors|shadow)/,
          recommendation: 'Use specific transitions, not transition-all',
          why: 'transition-all causes janky performance. Be surgical.',
          code: 'transition-[transform,opacity,shadow]',
        },
      },

      glassmorphism: {
        navBar: {
          check: (code) => code.includes('nav') || code.includes('header'),
          recommendation: 'Premium nav with glass + blur + border',
          why: 'Glass nav feels modern and premium - signature of polished apps',
          code: `className="
  bg-white/80 backdrop-blur-xl
  supports-[backdrop-filter]:bg-white/60
  border-b border-white/20
  shadow-lg shadow-black/5
"`,
        },
        modals: {
          check: (code) => code.includes('modal') || code.includes('dialog'),
          recommendation: 'Glass modal with animated backdrop',
          why: 'Creates depth and focus - premium modal experience',
          code: `// Backdrop
className="bg-black/50 backdrop-blur-sm"

// Modal
className="
  bg-white/90 backdrop-blur-2xl
  supports-[backdrop-filter]:bg-white/70
  border border-white/20
  shadow-2xl shadow-black/20
  rounded-3xl
"`,
        },
        cards: {
          check: (code) => code.includes('Card') || code.includes('card'),
          recommendation: 'Elevated cards with subtle glass and depth',
          why: 'Cards should feel like they float above the surface',
          code: `className="
  bg-white/95 backdrop-blur-md
  supports-[backdrop-filter]:bg-white/80
  border border-slate-200/60
  rounded-2xl
  shadow-lg shadow-slate-900/5
  hover:shadow-xl hover:shadow-slate-900/10
  transition-shadow
"`,
        },
      },

      spacing: {
        breathingRoom: {
          check: (code) => {
            const p = (code.match(/\bp-\d+/g) || []);
            return p.some(cls => parseInt(cls.match(/\d+/)[0]) < 4);
          },
          recommendation: 'Increase padding - premium needs breathing room',
          why: 'Cramped UI feels cheap. Generous spacing = premium',
          code: 'Use p-6 minimum for cards, p-8 for major sections',
        },
        consistentGaps: {
          check: (code) => code.includes('gap-'),
          recommendation: 'Use consistent gap-4 or gap-6 throughout',
          why: 'Rhythm creates visual harmony',
          code: 'gap-4 for compact lists, gap-6 for relaxed layouts',
        },
      },

      typography: {
        hierarchy: {
          check: (code) => {
            const hasHeading = /text-(2xl|3xl|4xl)/.test(code);
            const hasBody = /text-(sm|base|lg)/.test(code);
            return hasHeading && hasBody;
          },
          recommendation: 'Strong type hierarchy with varied sizes',
          why: 'Guides the eye and creates visual interest',
          code: 'Heading: text-2xl font-semibold, Body: text-sm, Meta: text-xs text-slate-500',
        },
        fontWeights: {
          check: (code) => code.includes('font-'),
          recommendation: 'Use font weights to create emphasis',
          why: 'Weight creates hierarchy without color',
          code: 'font-semibold for headings, font-medium for labels, font-normal for body',
        },
      },

      colors: {
        semanticColors: {
          check: (code) => /#[0-9a-f]{6}/i.test(code),
          recommendation: 'Replace hex with semantic Tailwind colors',
          why: 'Semantic colors enable dark mode and consistency',
          code: 'bg-slate-50, text-slate-900, border-slate-200',
        },
        subtleAccents: {
          check: (code) => code.includes('green-'),
          recommendation: 'Use green accents sparingly for premium feel',
          why: 'Too much accent color feels unprofessional',
          code: 'bg-green-50 for subtle highlights, text-green-600 for CTAs',
        },
      },

      animations: {
        pageTransitions: {
          check: (code) => code.includes('initial') && code.includes('animate'),
          recommendation: 'Add Framer Motion page transitions',
          why: 'Smooth navigation = premium feel',
          code: `<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
>`,
        },
        staggeredLoading: {
          check: (code) => code.includes('map('),
          recommendation: 'Stagger list item animations',
          why: 'Makes UI feel crafted, not dumped',
          code: `{items.map((item, i) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.05 }}
  />
))}`,
        },
      },

      accessibility: {
        touchTargets: {
          check: (code) => code.includes('p-1') || code.includes('p-2'),
          recommendation: 'Ensure 44px+ touch targets for buttons',
          why: 'WCAG requires 44px minimum - premium means accessible',
          code: 'min-h-[44px] px-4 py-2.5',
        },
        focusStates: {
          check: (code) => code.includes('focus:'),
          recommendation: 'Add visible focus rings for keyboard navigation',
          why: 'Accessibility is premium - not optional',
          code: 'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
        },
      },

      emptyStates: {
        illustrations: {
          check: (code) => code.includes('no items') || code.includes('empty'),
          recommendation: 'Add friendly illustrations to empty states',
          why: 'First impressions matter - make empty delightful',
          code: `<EmptyState
  icon={<Icon className="w-16 h-16 text-slate-300" />}
  title="No items yet"
  description="Get started by creating your first item"
  action={<Button>Create Item</Button>}
/>`,
        },
      },

      loadingStates: {
        skeletons: {
          check: (code) => code.includes('loading') || code.includes('isLoading'),
          recommendation: 'Use skeleton loaders, not spinners',
          why: 'Skeletons feel faster and more premium',
          code: `{isLoading ? (
  <div className="animate-pulse space-y-4">
    <div className="h-8 bg-slate-200/60 rounded-lg w-1/2" />
    <div className="h-4 bg-slate-200/60 rounded w-3/4" />
  </div>
) : (
  <Content />
)}`,
        },
      },
    };
  }

  /**
   * Analyze code for premium UI opportunities
   */
  async analyzeForPremiumUI(code, routePath) {
    return this.executeTask(`Premium UI analysis: ${routePath}`, async () => {
      const suggestions = [];

      // Check each premium pattern category
      for (const [category, patterns] of Object.entries(this.premiumPatterns)) {
        for (const [patternName, pattern] of Object.entries(patterns)) {
          if (this.shouldSuggest(code, pattern)) {
            suggestions.push({
              id: `premium-${category}-${patternName}`,
              category: 'premium-ui',
              severity: 'info',
              title: `Premium ${category}: ${pattern.recommendation}`,
              description: pattern.why,
              location: routePath,
              suggestedFix: pattern.code,
              effort: 'low',
              impact: 'high',
              premiumPattern: patternName,
              why: pattern.why,
              code: pattern.code,
            });
          }
        }
      }

      // Share discoveries
      if (suggestions.length > 0) {
        this.shareDiscovery('premium-ui-opportunities', {
          routePath,
          count: suggestions.length,
          categories: [...new Set(suggestions.map(s => s.category))],
        });
      }

      return {
        routePath,
        suggestions,
        premiumScore: this.calculatePremiumScore(code),
        timestamp: Date.now(),
      };
    });
  }

  /**
   * Check if pattern should be suggested
   */
  shouldSuggest(code, pattern) {
    if (pattern.pattern) {
      return !pattern.pattern.test(code);
    }
    if (pattern.check) {
      return !pattern.check(code);
    }
    return false;
  }

  /**
   * Calculate premium score (0-100)
   */
  calculatePremiumScore(code) {
    let score = 50; // Start neutral

    // Positive signals
    if (/transition-\[/.test(code)) score += 10;
    if (/backdrop-blur/.test(code)) score += 10;
    if (/hover:(scale|shadow)/.test(code)) score += 10;
    if (/rounded-(2xl|3xl)/.test(code)) score += 5;
    if (/shadow-(lg|xl|2xl)/.test(code)) score += 5;
    if (/animate-/.test(code)) score += 10;
    if (/motion\.div/.test(code)) score += 10;

    // Negative signals
    if (/transition-all/.test(code)) score -= 10;
    if (/#[0-9a-f]{6}/i.test(code)) score -= 5;
    if (/\bp-[12]\b/.test(code)) score -= 10;
    if (/text-xs/.test(code)) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate comprehensive premium UI report
   */
  async generatePremiumReport(routePath, code) {
    const analysis = await this.analyzeForPremiumUI(code, routePath);

    const categories = {
      microinteractions: analysis.suggestions.filter(s => s.premiumPattern?.includes('hover') || s.premiumPattern?.includes('ripple')),
      glassmorphism: analysis.suggestions.filter(s => s.premiumPattern?.includes('glass') || s.premiumPattern?.includes('backdrop')),
      animations: analysis.suggestions.filter(s => s.premiumPattern?.includes('transition') || s.premiumPattern?.includes('motion')),
      spacing: analysis.suggestions.filter(s => s.premiumPattern?.includes('breathing') || s.premiumPattern?.includes('gap')),
      accessibility: analysis.suggestions.filter(s => s.premiumPattern?.includes('touch') || s.premiumPattern?.includes('focus')),
    };

    return {
      routePath,
      premiumScore: analysis.premiumScore,
      verdict: this.getVerdict(analysis.premiumScore),
      suggestions: analysis.suggestions,
      categorizedSuggestions: categories,
      quickWins: analysis.suggestions.filter(s => s.effort === 'low' && s.impact === 'high').slice(0, 3),
      topPriority: this.getTopPriority(analysis.suggestions),
    };
  }

  /**
   * Get premium verdict
   */
  getVerdict(score) {
    if (score >= 80) return { emoji: '✨', text: 'Premium quality', color: 'green' };
    if (score >= 60) return { emoji: '👍', text: 'Good with room to polish', color: 'yellow' };
    if (score >= 40) return { emoji: '📝', text: 'Needs premium touches', color: 'orange' };
    return { emoji: '⚠️', text: 'Requires significant polish', color: 'red' };
  }

  /**
   * Get top priority suggestions
   */
  getTopPriority(suggestions) {
    // Prioritize microinteractions and glassmorphism first
    const priority = suggestions.filter(s =>
      s.premiumPattern?.includes('hover') ||
      s.premiumPattern?.includes('glass') ||
      s.premiumPattern?.includes('transition')
    );

    return priority.slice(0, 3);
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'request-premium-analysis':
        this.analyzeForPremiumUI(message.payload.code, message.payload.routePath).then(result => {
          this.sendToAgent(message.from, 'premium-analysis-complete', result);
        });
        break;
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      premiumPatternCategories: Object.keys(this.premiumPatterns),
      totalPatterns: Object.values(this.premiumPatterns).reduce((sum, cat) => sum + Object.keys(cat).length, 0),
    };
  }
}

export default PremiumUIAgent;
