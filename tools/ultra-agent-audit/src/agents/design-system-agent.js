/**
 * DesignSystemAgent - Validates UI against Helm design system
 * 
 * AGENT COMMUNICATION:
 * - Shares discoveries when design issues found
 * - Sends messages to route-context about validation results
 * - Receives queries from other agents
 */

import { BaseAgent } from './coordination/base-agent.js';

export class DesignSystemAgent extends BaseAgent {
  constructor(config = {}) {
    super('design-system', [
      'spacing-validation',
      'color-validation',
      'glass-validation',
      'typography-validation',
      'component-validation',
    ]);

    this.config = {
      icon: '🎨',
      color: '#ec4899',
      description: 'Validates UI against Helm design system',
    };

    // Design system rules
    this.rules = {
      spacing: {
        arbitrary: /(?:p|m|gap|space)-\[\d+(?:px|rem|em)\]/g,
        preferred: ['p-4', 'p-5', 'p-6', 'm-4', 'm-6', 'gap-4', 'gap-6'],
      },
      colors: {
        hardcodedHex: /#[0-9a-fA-F]{3,6}(?!\w)/g,
        hardcodedRgb: /rgba?\([^)]+\)/g,
      },
      glass: {
        pattern: /backdrop-blur/,
        fallback: /supports-\[backdrop-filter\]/,
      },
      typography: {
        tooSmall: /text-xs/g,
        arbitrary: /text-\[\d+(?:px|rem)\]/g,
      },
    };
  }

  async initialize() {
    this.log('info', 'Initializing design system validation...');
    this.log('success', 'Design system agent ready');
    return true;
  }

  /**
   * Validate code against design system
   */
  async validateCode(content, filePath) {
    return this.executeTask(`Validate ${filePath}`, async () => {
      const issues = [];
      
      issues.push(...this.validateSpacing(content, filePath));
      issues.push(...this.validateColors(content, filePath));
      issues.push(...this.validateGlass(content, filePath));
      issues.push(...this.validateTypography(content, filePath));

      const score = this.calculateScore(issues);

      const result = {
        filePath,
        score,
        issues,
        timestamp: Date.now(),
      };

      // AGENT COMMUNICATION: Share discovery
      if (issues.length > 0) {
        this.shareDiscovery('design-issues-found', {
          filePath,
          issueCount: issues.length,
          categories: [...new Set(issues.map(i => i.id.split('-')[0]))],
        });

        // Send to route-context agent
        this.sendToAgent('route-context', 'design-validated', {
          filePath,
          score,
          hasGlass: content.includes('backdrop-blur'),
          issueCount: issues.length,
        });
      }

      return result;
    });
  }

  /**
   * Validate spacing
   */
  validateSpacing(content, filePath) {
    const issues = [];

    // Arbitrary spacing
    const arbitrary = content.match(this.rules.spacing.arbitrary);
    if (arbitrary && arbitrary.length > 0) {
      issues.push({
        id: 'spacing-arbitrary',
        category: 'ui',
        severity: 'warning',
        title: 'Arbitrary spacing values',
        description: `Found ${arbitrary.length} arbitrary spacing values`,
        location: filePath,
        suggestedFix: 'Use Tailwind spacing scale (p-4, m-6, gap-4)',
        effort: 'low',
        examples: [...new Set(arbitrary)].slice(0, 3),
      });
    }

    return issues;
  }

  /**
   * Validate colors
   */
  validateColors(content, filePath) {
    const issues = [];

    // Hex colors
    const hexColors = content.match(this.rules.colors.hardcodedHex);
    if (hexColors && hexColors.length > 0) {
      issues.push({
        id: 'color-hardcoded-hex',
        category: 'ui',
        severity: 'warning',
        title: 'Hardcoded hex colors',
        description: `Found ${hexColors.length} hex colors`,
        location: filePath,
        suggestedFix: 'Use Tailwind color classes',
        effort: 'medium',
        examples: [...new Set(hexColors)].slice(0, 5),
      });
    }

    // RGB colors
    const rgbColors = content.match(this.rules.colors.hardcodedRgb);
    if (rgbColors && rgbColors.length > 0) {
      issues.push({
        id: 'color-hardcoded-rgb',
        category: 'ui',
        severity: 'warning',
        title: 'RGB color values',
        description: `Found ${rgbColors.length} RGB colors`,
        location: filePath,
        suggestedFix: 'Use Tailwind opacity (bg-white/80)',
        effort: 'medium',
      });
    }

    return issues;
  }

  /**
   * Validate glassmorphism
   */
  validateGlass(content, filePath) {
    const issues = [];

    // Check glass without fallback
    if (this.rules.glass.pattern.test(content) && !this.rules.glass.fallback.test(content)) {
      issues.push({
        id: 'glass-no-fallback',
        category: 'ui',
        severity: 'warning',
        title: 'Glass without browser fallback',
        description: 'backdrop-blur without supports-[] check',
        location: filePath,
        suggestedFix: 'Add supports-[backdrop-filter]: prefix',
        effort: 'low',
      });
    }

    // Glass without border
    if (content.includes('backdrop-blur') && !content.includes('border')) {
      issues.push({
        id: 'glass-no-border',
        category: 'ui',
        severity: 'info',
        title: 'Glass without subtle border',
        description: 'Glass surfaces need borders for definition',
        location: filePath,
        suggestedFix: 'Add border border-white/20',
        effort: 'low',
      });
    }

    return issues;
  }

  /**
   * Validate typography
   */
  validateTypography(content, filePath) {
    const issues = [];

    // Too small text
    const tooSmall = content.match(this.rules.typography.tooSmall);
    if (tooSmall && tooSmall.length > 0) {
      issues.push({
        id: 'typography-too-small',
        category: 'ui',
        severity: 'warning',
        title: 'Very small text (text-xs)',
        description: `Found ${tooSmall.length} uses of text-xs`,
        location: filePath,
        suggestedFix: 'Use text-sm minimum for readability',
        effort: 'low',
      });
    }

    // Arbitrary font sizes
    const arbitrary = content.match(this.rules.typography.arbitrary);
    if (arbitrary && arbitrary.length > 0) {
      issues.push({
        id: 'typography-arbitrary',
        category: 'ui',
        severity: 'warning',
        title: 'Arbitrary font sizes',
        description: `Found ${arbitrary.length} arbitrary sizes`,
        location: filePath,
        suggestedFix: 'Use Tailwind type scale',
        effort: 'low',
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
        case 'warning': score -= 7; break;
        case 'info': score -= 2; break;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'request-validation':
        this.log('receive', `Validation request from ${message.from}`);
        break;
        
      case 'discovery':
        if (message.payload.type === 'code-issues-found') {
          this.log('info', `Code issues affect design: ${message.payload.data.filePath}`);
        }
        break;
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      rulesCategories: Object.keys(this.rules),
    };
  }
}

export default DesignSystemAgent;
