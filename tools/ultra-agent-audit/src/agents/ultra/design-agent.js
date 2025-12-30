/**
 * 🎨 DesignAgent - UI/UX Excellence
 * 
 * THE ARTIST. Checks:
 * - Design system compliance (Tailwind classes, spacing, colors)
 * - Premium UI patterns (glassmorphism, animations, micro-interactions)
 * - Accessibility (contrast, touch targets, focus states)
 * - Responsive design (mobile-first, breakpoints)
 * - State handling (loading, empty, error, success)
 * 
 * Combines: designSystem, uiReview, premiumUI, uiEnhancement
 */

import { BaseAgent } from '../coordination/base-agent.js';
import { UIKnowledge } from '../../knowledge/ui-knowledge.js';
import HelmKnowledge from '../../knowledge/helm-knowledge.js';

export class DesignAgent extends BaseAgent {
  constructor(config = {}) {
    super('design', [
      'design-system',
      'premium-ui',
      'accessibility',
      'responsive',
      'state-handling',
      'animations',
    ]);

    this.config = {
      icon: '🎨',
      color: '#ec4899',
      description: 'UI/UX excellence - premium patterns and design system',
    };

    this.uiKnowledge = UIKnowledge;
    this.helmKnowledge = HelmKnowledge;
    this.designSystem = HelmKnowledge.getDesignSystem();
  }

  async initialize() {
    this.log('info', 'Design agent awakening...');
    this.log('success', 'Loaded Helm design system');
    return true;
  }

  /**
   * Full UI/UX analysis
   */
  async analyze(routePath, code) {
    return this.executeTask(`Design analysis: ${routePath}`, async () => {
      const issues = [];
      const enhancements = [];
      let premiumScore = 50; // Start at 50

      // 1. Design System Compliance
      const dsIssues = this.checkDesignSystem(code);
      issues.push(...dsIssues);
      premiumScore -= dsIssues.length * 3;

      // 2. State Handling
      const stateIssues = this.checkStateHandling(code);
      issues.push(...stateIssues);
      premiumScore -= stateIssues.length * 5;

      // 3. Premium UI Patterns
      const premiumResult = this.checkPremiumPatterns(code);
      enhancements.push(...premiumResult.enhancements);
      premiumScore += premiumResult.bonus;

      // 4. Accessibility
      const a11yIssues = this.checkAccessibility(code);
      issues.push(...a11yIssues);
      premiumScore -= a11yIssues.length * 3;

      // 5. Responsive Design
      const responsiveIssues = this.checkResponsive(code);
      issues.push(...responsiveIssues);

      // 6. Animation & Motion
      const motionResult = this.checkMotion(code);
      enhancements.push(...motionResult.enhancements);
      premiumScore += motionResult.bonus;

      // Add WHY and RESULT
      for (const issue of issues) {
        issue.why = issue.why || this.getWhy(issue.id);
        issue.result = issue.result || this.getResult(issue.id);
        issue.source = 'design';
      }

      for (const enhancement of enhancements) {
        enhancement.source = 'design';
      }

      // Determine page type
      const pageType = this.detectPageType(routePath, code);

      const result = {
        routePath,
        timestamp: Date.now(),
        premiumScore: Math.max(0, Math.min(100, premiumScore)),
        pageType,
        issues,
        enhancements,
        summary: {
          issues: issues.length,
          enhancements: enhancements.length,
          status: premiumScore >= 80 ? 'premium' : premiumScore >= 60 ? 'good' : 'needs-work',
        },
      };

      this.shareDiscovery('design-analysis', {
        routePath,
        premiumScore: result.premiumScore,
        issues: issues.length,
      });

      return result;
    });
  }

  /**
   * Check design system compliance
   */
  checkDesignSystem(code) {
    const issues = [];

    // Arbitrary spacing values
    const arbitrarySpacing = code.match(/(?:p|m|gap|space)-\[\d+px\]/g) || [];
    if (arbitrarySpacing.length > 0) {
      issues.push({
        id: 'ds-arbitrary-spacing',
        title: `Arbitrary spacing (${arbitrarySpacing.length}x)`,
        description: 'Use Tailwind spacing scale instead of arbitrary values',
        category: 'design-system',
        severity: 'warning',
        priority: 'medium',
        effort: 'low',
        examples: arbitrarySpacing.slice(0, 3),
        fix: 'Use p-4, m-6, gap-4, etc. from the spacing scale',
      });
    }

    // Hardcoded hex colors
    const hexColors = code.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    const nonSystemColors = hexColors.filter(c => 
      !['#fff', '#000', '#ffffff', '#000000'].includes(c.toLowerCase())
    );
    if (nonSystemColors.length > 0) {
      issues.push({
        id: 'ds-hardcoded-colors',
        title: `Hardcoded colors (${nonSystemColors.length}x)`,
        description: 'Use Tailwind color classes or CSS variables',
        category: 'design-system',
        severity: 'warning',
        priority: 'medium',
        effort: 'low',
        examples: nonSystemColors.slice(0, 3),
      });
    }

    // Non-standard border radius
    const nonStandardRadius = code.match(/rounded-\[\d+px\]/g) || [];
    if (nonStandardRadius.length > 0) {
      issues.push({
        id: 'ds-arbitrary-radius',
        title: 'Arbitrary border radius',
        description: 'Use rounded-xl, rounded-2xl, rounded-3xl from the scale',
        category: 'design-system',
        severity: 'info',
        priority: 'low',
        effort: 'low',
      });
    }

    // Text too small
    if (code.includes('text-xs') && !code.includes('text-xs uppercase')) {
      issues.push({
        id: 'ds-text-too-small',
        title: 'Text may be too small',
        description: 'text-xs (12px) can be hard to read. Consider text-sm minimum.',
        category: 'accessibility',
        severity: 'info',
        priority: 'low',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Check state handling
   */
  checkStateHandling(code) {
    const issues = [];
    const codeL = code.toLowerCase();

    // Loading state
    if (!codeL.includes('loading') && !codeL.includes('skeleton') && !codeL.includes('spinner')) {
      if (codeL.includes('usequery') || codeL.includes('fetch') || codeL.includes('async')) {
        issues.push({
          id: 'ui-missing-loading',
          title: 'Missing Loading State',
          description: 'Async operations should show loading feedback',
          category: 'ux',
          severity: 'warning',
          priority: 'high',
          effort: 'low',
        });
      }
    }

    // Empty state
    if (!codeL.includes('empty') && !codeL.includes('no ') && !codeL.includes('length === 0')) {
      if (codeL.includes('.map(') || codeL.includes('foreach')) {
        issues.push({
          id: 'ui-missing-empty',
          title: 'Missing Empty State',
          description: 'Lists should handle the empty case',
          category: 'ux',
          severity: 'warning',
          priority: 'high',
          effort: 'low',
        });
      }
    }

    // Error state
    if (!codeL.includes('error') && !codeL.includes('catch')) {
      if (codeL.includes('usequery') || codeL.includes('fetch')) {
        issues.push({
          id: 'ui-missing-error',
          title: 'Missing Error State',
          description: 'Data fetching should handle errors',
          category: 'ux',
          severity: 'warning',
          priority: 'high',
          effort: 'low',
        });
      }
    }

    return issues;
  }

  /**
   * Check premium UI patterns
   */
  checkPremiumPatterns(code) {
    const enhancements = [];
    let bonus = 0;

    // Glassmorphism
    if (code.includes('backdrop-blur') || code.includes('bg-white/') || code.includes('bg-black/')) {
      bonus += 10;
    } else {
      enhancements.push({
        id: 'premium-glass',
        title: 'Add Glassmorphism',
        description: 'Use backdrop-blur with semi-transparent backgrounds for depth',
        category: 'premium',
        priority: 'medium',
        effort: 'low',
        example: 'bg-white/5 backdrop-blur-xl border border-white/10',
      });
    }

    // Gradient text
    if (code.includes('bg-gradient-to') && code.includes('bg-clip-text')) {
      bonus += 5;
    }

    // Hover transforms
    if (code.includes('hover:-translate-y') || code.includes('hover:scale-')) {
      bonus += 5;
    } else if (code.includes('hover:')) {
      enhancements.push({
        id: 'premium-hover-lift',
        title: 'Add Hover Lift Effect',
        description: 'Subtle transforms on hover make UI feel premium',
        category: 'premium',
        priority: 'low',
        effort: 'low',
        example: 'hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
      });
    }

    // Shadows
    if (code.includes('shadow-lg') || code.includes('shadow-xl') || code.includes('shadow-2xl')) {
      bonus += 5;
    }

    // Smooth transitions
    if (code.includes('transition-all') || code.includes('duration-')) {
      bonus += 5;
    } else {
      enhancements.push({
        id: 'premium-transitions',
        title: 'Add Smooth Transitions',
        description: 'All interactive elements should have transitions',
        category: 'premium',
        priority: 'medium',
        effort: 'low',
        example: 'transition-all duration-200',
      });
    }

    // Rounded corners (premium uses larger radii)
    if (code.includes('rounded-2xl') || code.includes('rounded-3xl')) {
      bonus += 5;
    }

    return { enhancements, bonus };
  }

  /**
   * Check accessibility
   */
  checkAccessibility(code) {
    const issues = [];

    // Missing alt text
    if (code.includes('<img') && !code.includes('alt=')) {
      issues.push({
        id: 'a11y-missing-alt',
        title: 'Images missing alt text',
        description: 'All images should have descriptive alt attributes',
        category: 'accessibility',
        severity: 'warning',
        priority: 'medium',
        effort: 'low',
      });
    }

    // Missing button type
    if (code.includes('<button') && !code.includes('type=')) {
      issues.push({
        id: 'a11y-button-type',
        title: 'Buttons missing type attribute',
        description: 'Buttons should have type="button" to prevent form submission',
        category: 'accessibility',
        severity: 'info',
        priority: 'low',
        effort: 'low',
      });
    }

    // Missing focus styles (if custom focus is removed)
    if (code.includes('focus:outline-none') && !code.includes('focus:ring')) {
      issues.push({
        id: 'a11y-focus-visible',
        title: 'Missing focus indicator',
        description: 'Removing outline without adding ring breaks keyboard navigation',
        category: 'accessibility',
        severity: 'warning',
        priority: 'high',
        effort: 'low',
        fix: 'Add focus:ring-2 focus:ring-white/20 or similar',
      });
    }

    // Touch targets too small
    if (code.includes('size-icon') || code.includes('w-4 h-4') || code.includes('w-5 h-5')) {
      if (!code.includes('p-2') && !code.includes('p-3')) {
        issues.push({
          id: 'a11y-touch-target',
          title: 'Touch targets may be too small',
          description: 'Interactive elements should be at least 44x44px on mobile',
          category: 'accessibility',
          severity: 'info',
          priority: 'medium',
          effort: 'low',
        });
      }
    }

    return issues;
  }

  /**
   * Check responsive design
   */
  checkResponsive(code) {
    const issues = [];

    // No responsive classes at all
    const hasResponsive = /\b(sm:|md:|lg:|xl:)/.test(code);
    if (!hasResponsive && code.length > 500) {
      issues.push({
        id: 'responsive-missing',
        title: 'No responsive breakpoints',
        description: 'Consider adding responsive classes for different screen sizes',
        category: 'responsive',
        severity: 'info',
        priority: 'medium',
        effort: 'medium',
      });
    }

    // Fixed widths
    const fixedWidths = code.match(/w-\[\d+px\]/g) || [];
    if (fixedWidths.length > 2) {
      issues.push({
        id: 'responsive-fixed-width',
        title: 'Multiple fixed widths',
        description: 'Fixed pixel widths may break on different screens',
        category: 'responsive',
        severity: 'info',
        priority: 'low',
        effort: 'medium',
      });
    }

    return issues;
  }

  /**
   * Check motion and animation
   */
  checkMotion(code) {
    const enhancements = [];
    let bonus = 0;

    // Animate on mount
    if (code.includes('animate-') || code.includes('motion.')) {
      bonus += 10;
    } else {
      enhancements.push({
        id: 'motion-entrance',
        title: 'Add Entrance Animations',
        description: 'Subtle fade-in or slide-in on mount improves perceived performance',
        category: 'motion',
        priority: 'low',
        effort: 'medium',
      });
    }

    // Skeleton loading
    if (code.includes('animate-pulse') || code.includes('skeleton')) {
      bonus += 10;
    }

    // Stagger animations
    if (code.includes('delay-') || code.includes('stagger')) {
      bonus += 5;
    }

    return { enhancements, bonus };
  }

  /**
   * Detect page type
   */
  detectPageType(routePath, code) {
    const path = routePath.toLowerCase();
    const codeL = code.toLowerCase();

    if (path.includes('dashboard') || path.includes('overview')) return 'dashboard';
    if (path.includes('settings') || path.includes('profile')) return 'settings';
    if (path.includes('roster') || path.includes('players')) return 'list';
    if (path.includes('calendar') || path.includes('schedule')) return 'calendar';
    if (path.includes('[id]') || path.includes('/edit')) return 'detail';
    if (codeL.includes('form') || codeL.includes('onsubmit')) return 'form';
    if (codeL.includes('.map(')) return 'list';
    
    return 'page';
  }

  /**
   * Get WHY explanation
   */
  getWhy(id) {
    const whyMap = {
      'ds-arbitrary-spacing': 'Arbitrary values break visual rhythm. The spacing scale ensures consistency.',
      'ds-hardcoded-colors': 'Hardcoded colors make theming impossible and create inconsistency.',
      'ui-missing-loading': 'Users see blank screen while data loads - feels broken.',
      'ui-missing-empty': 'Users see nothing and don\'t know what to do next.',
      'ui-missing-error': 'Errors fail silently with no feedback to the user.',
      'a11y-missing-alt': 'Screen readers can\'t describe images to visually impaired users.',
      'a11y-focus-visible': 'Keyboard users can\'t see which element is focused.',
    };
    return whyMap[id] || 'This affects UI quality.';
  }

  /**
   * Get RESULT explanation
   */
  getResult(id) {
    const resultMap = {
      'ds-arbitrary-spacing': 'Consistent visual rhythm across the UI.',
      'ds-hardcoded-colors': 'Themeable, consistent color usage.',
      'ui-missing-loading': 'Smooth loading with skeleton feedback.',
      'ui-missing-empty': 'Clear guidance with call-to-action.',
      'ui-missing-error': 'Graceful error messages with retry.',
      'a11y-missing-alt': 'Accessible images for all users.',
      'a11y-focus-visible': 'Clear focus indicators for keyboard users.',
    };
    return resultMap[id] || 'Issue resolved.';
  }

  getStatus() {
    return { ...this.getStats() };
  }
}

export default DesignAgent;
