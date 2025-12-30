/**
 * DESIGN SYSTEM VALIDATOR
 * 
 * Validates UI code against Helm design system rules:
 * - Spacing scale compliance
 * - Border radius consistency
 * - Glass effect usage
 * - Color palette
 * - Animation timing
 * - Component patterns
 */

import { HelmProjectKnowledge } from './helm-project-knowledge.js';
import { ComponentPatterns } from './component-patterns.js';

const DS = HelmProjectKnowledge.designSystem;

export const DesignSystemValidator = {

  // ============================================================
  // SPACING VALIDATION
  // ============================================================
  
  spacing: {
    // Valid Tailwind spacing values that map to our scale
    validClasses: [
      'p-1', 'p-2', 'p-3', 'p-4', 'p-6', 'p-8', 'p-12', 'p-16',
      'm-1', 'm-2', 'm-3', 'm-4', 'm-6', 'm-8', 'm-12', 'm-16',
      'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6', 'gap-8',
      'space-x-1', 'space-x-2', 'space-x-3', 'space-x-4', 'space-x-6',
      'space-y-1', 'space-y-2', 'space-y-3', 'space-y-4', 'space-y-6',
      // Also valid with directions
      'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
      'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-',
    ],
    
    // Invalid spacing values (not on our scale)
    invalidValues: ['5', '7', '9', '10', '11', '13', '14', '15'],
    
    validate(code) {
      const issues = [];
      
      // Check for invalid spacing values
      for (const val of this.invalidValues) {
        const patterns = [
          new RegExp(`\\bp-${val}\\b`),
          new RegExp(`\\bm-${val}\\b`),
          new RegExp(`\\bgap-${val}\\b`),
          new RegExp(`\\bp[xytblr]-${val}\\b`),
          new RegExp(`\\bm[xytblr]-${val}\\b`),
        ];
        
        for (const pattern of patterns) {
          if (pattern.test(code)) {
            issues.push({
              type: 'spacing',
              severity: 'warning',
              message: `Non-standard spacing value found (${val})`,
              fix: `Use values from spacing scale: 1, 2, 3, 4, 6, 8, 12, 16 (maps to 4, 8, 12, 16, 24, 32, 48, 64px)`,
            });
            break;
          }
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // BORDER RADIUS VALIDATION
  // ============================================================
  
  borderRadius: {
    // Component-specific radius rules
    rules: {
      'input': ['rounded-lg'],           // 8px
      'button': ['rounded-lg', 'rounded-xl'], // 8px or 12px
      'card': ['rounded-2xl'],           // 16px
      'modal': ['rounded-3xl'],          // 24px
      'badge': ['rounded-full'],         // pill
      'avatar': ['rounded-full'],        // circle
    },
    
    validate(code) {
      const issues = [];
      
      // Check for inconsistent card radius
      if (code.includes('card') || code.includes('Card')) {
        if (/rounded-(?:lg|xl|md|sm)(?:\s|"|')/.test(code) && !code.includes('rounded-2xl')) {
          // Only flag if it's likely a card component
          if (/className[^>]*card/i.test(code) || /\.card\b/.test(code)) {
            issues.push({
              type: 'border-radius',
              severity: 'info',
              message: 'Card may have non-standard border radius',
              fix: 'Cards should use rounded-2xl (16px)',
            });
          }
        }
      }
      
      // Check for modal radius
      if (code.includes('modal') || code.includes('Modal') || code.includes('dialog') || code.includes('Dialog')) {
        if (/rounded-(?:lg|xl|2xl|md|sm)(?:\s|"|')/.test(code) && !code.includes('rounded-3xl')) {
          issues.push({
            type: 'border-radius',
            severity: 'info',
            message: 'Modal may have non-standard border radius',
            fix: 'Modals should use rounded-3xl (24px)',
          });
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // GLASS EFFECT VALIDATION
  // ============================================================
  
  glass: {
    // Elements that SHOULD have glass
    allowedElements: ['nav', 'toolbar', 'header', 'modal-backdrop', 'side-panel', 'filter', 'overlay'],
    
    // Elements that should NEVER have glass
    forbiddenElements: ['table', 'form', 'input', 'data-grid', 'list-item'],
    
    // Glass class patterns
    glassPatterns: [
      /glass-subtle/,
      /glass-standard/,
      /glass-prominent/,
      /backdrop-blur/,
      /bg-white\/[0-9]+/,  // e.g., bg-white/70
    ],
    
    validate(code) {
      const issues = [];
      
      // Check for glass on tables
      if (/table|Table|DataTable|data-table/i.test(code)) {
        if (this.glassPatterns.some(p => p.test(code))) {
          issues.push({
            type: 'glass-forbidden',
            severity: 'error',
            message: 'Glass effect should not be used on data tables',
            fix: 'Remove backdrop-blur and glass classes from table elements',
          });
        }
      }
      
      // Check for glass on forms
      if (/<form|Form\s|FormField/i.test(code)) {
        if (this.glassPatterns.some(p => p.test(code))) {
          // Only flag if glass is on the form itself, not on containing elements
          if (/form[^>]*className[^>]*(?:glass|backdrop-blur)/i.test(code)) {
            issues.push({
              type: 'glass-forbidden',
              severity: 'warning',
              message: 'Glass effect should not be used on form elements',
              fix: 'Use solid backgrounds for form containers',
            });
          }
        }
      }
      
      // Check for "box soup" - too many glass elements
      const glassCount = (code.match(/glass-(?:subtle|standard|prominent)|backdrop-blur/g) || []).length;
      if (glassCount > 5) {
        issues.push({
          type: 'glass-overuse',
          severity: 'warning',
          message: `Too many glass effects (${glassCount}) - may create "box soup"`,
          fix: 'Reserve glass for navigation, toolbars, and modals only',
        });
      }
      
      // Check for glass without proper classes
      if (/backdrop-blur/.test(code) && !/glass-(?:subtle|standard|prominent)/.test(code)) {
        issues.push({
          type: 'glass-pattern',
          severity: 'info',
          message: 'Using backdrop-blur without glass utility class',
          fix: 'Use glass-subtle, glass-standard, or glass-prominent classes for consistency',
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // ANIMATION TIMING VALIDATION
  // ============================================================
  
  animation: {
    // Valid duration classes
    validDurations: ['duration-75', 'duration-100', 'duration-150', 'duration-200', 'duration-300', 'duration-500'],
    
    // Our timing system
    timingSystem: {
      micro: 'duration-150',
      small: 'duration-200',
      medium: 'duration-300',
      marketing: 'duration-500',
    },
    
    validate(code) {
      const issues = [];
      
      // Check for non-standard durations
      const durationPattern = /duration-(\d+)/g;
      let match;
      
      while ((match = durationPattern.exec(code)) !== null) {
        const duration = match[1];
        if (!['75', '100', '150', '200', '300', '500'].includes(duration)) {
          issues.push({
            type: 'animation-duration',
            severity: 'info',
            message: `Non-standard animation duration: ${duration}ms`,
            fix: 'Use 150ms (micro), 200ms (small), 300ms (medium), or 500ms (marketing)',
          });
        }
      }
      
      // Check for missing transition on hover effects
      if (/hover:/.test(code) && !/transition/.test(code)) {
        issues.push({
          type: 'missing-transition',
          severity: 'warning',
          message: 'Hover effect without transition class',
          fix: 'Add transition-all or transition-colors for smooth hover effects',
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // COLOR VALIDATION
  // ============================================================
  
  colors: {
    // Primary palette
    primary: 'green-600',
    primaryHover: 'green-500',
    
    // Semantic colors
    semantic: {
      success: ['green-', 'emerald-'],
      warning: ['amber-', 'yellow-'],
      error: ['red-'],
      info: ['blue-'],
    },
    
    validate(code) {
      const issues = [];
      
      // Check for inconsistent primary colors
      if (/(?:bg|text|border)-(?:primary|blue-600|teal-600)/.test(code)) {
        if (!/green-600/.test(code)) {
          issues.push({
            type: 'color-primary',
            severity: 'info',
            message: 'Non-standard primary color usage',
            fix: 'Use green-600 as primary color, green-500 for hover',
          });
        }
      }
      
      // Check for pure black shadows
      if (/shadow-black|shadow-\[.*#000.*\]/.test(code)) {
        issues.push({
          type: 'color-shadow',
          severity: 'warning',
          message: 'Pure black shadow detected',
          fix: 'Use tinted shadows: shadow-slate-200 or custom with hsl(220 3% 15%)',
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // COMPONENT PATTERN VALIDATION
  // ============================================================
  
  components: {
    // Check button patterns
    validateButton(code) {
      const issues = [];
      
      // Check for buttons without proper hover states
      if (/<button|Button/.test(code)) {
        if (!/hover:/.test(code) && !/btn-/.test(code) && !/Button\s/.test(code)) {
          issues.push({
            type: 'button-hover',
            severity: 'warning',
            message: 'Button may be missing hover state',
            fix: 'Add hover:bg-*, hover:-translate-y-0.5, or use Button component',
          });
        }
        
        // Check for active state
        if (/hover:/.test(code) && !/active:/.test(code)) {
          issues.push({
            type: 'button-active',
            severity: 'info',
            message: 'Button may be missing active state',
            fix: 'Add active:scale-[0.98] for tactile feedback',
          });
        }
      }
      
      return issues;
    },
    
    // Check card patterns
    validateCard(code) {
      const issues = [];
      
      // Check for cards with hover but no transition
      if (/card|Card/.test(code)) {
        if (/hover:shadow/.test(code) && !/transition/.test(code)) {
          issues.push({
            type: 'card-transition',
            severity: 'warning',
            message: 'Card has hover shadow but no transition',
            fix: 'Add transition-all duration-200 or duration-300',
          });
        }
        
        // Check for proper hover lift
        if (/hover:shadow/.test(code) && !/hover:-translate-y|hover:scale/.test(code)) {
          issues.push({
            type: 'card-lift',
            severity: 'info',
            message: 'Card has hover shadow but no lift effect',
            fix: 'Add hover:-translate-y-0.5 for subtle lift on hover',
          });
        }
      }
      
      return issues;
    },
    
    validate(code) {
      return [
        ...this.validateButton(code),
        ...this.validateCard(code),
      ];
    },
  },

  // ============================================================
  // ACCESSIBILITY VALIDATION
  // ============================================================
  
  accessibility: {
    validate(code) {
      const issues = [];
      
      // Check for focus states
      if (/<button|<a\s|<input|<select|<textarea/.test(code)) {
        if (!/focus:|focus-visible:/.test(code) && !/Button|Input|Select/.test(code)) {
          issues.push({
            type: 'a11y-focus',
            severity: 'warning',
            message: 'Interactive element may be missing focus state',
            fix: 'Add focus-visible:ring-2 focus-visible:ring-offset-2 for keyboard users',
          });
        }
      }
      
      // Check for focus vs focus-visible
      if (/\bfocus:/.test(code) && !/focus-visible:/.test(code)) {
        issues.push({
          type: 'a11y-focus-visible',
          severity: 'info',
          message: 'Using focus: instead of focus-visible:',
          fix: 'Use focus-visible: for better keyboard-only focus indication',
        });
      }
      
      // Check for icon buttons without labels
      if (/<button[^>]*>[^<]*<(?:svg|Icon)[^>]*>[^<]*<\/button>/.test(code)) {
        if (!/aria-label|title=/.test(code)) {
          issues.push({
            type: 'a11y-button-label',
            severity: 'warning',
            message: 'Icon button may be missing accessible label',
            fix: 'Add aria-label="description" to icon-only buttons',
          });
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // RESPONSIVE VALIDATION
  // ============================================================
  
  responsive: {
    validate(code) {
      const issues = [];
      
      // Check for fixed widths that might break on mobile
      if (/w-\[(?!100%)[^\]]+\]|width:\s*\d+px/.test(code)) {
        issues.push({
          type: 'responsive-width',
          severity: 'info',
          message: 'Fixed width may cause issues on mobile',
          fix: 'Use max-w-* or responsive width classes',
        });
      }
      
      // Check for proper grid responsiveness
      if (/grid-cols-\d/.test(code) && !/md:grid-cols|lg:grid-cols|sm:grid-cols/.test(code)) {
        issues.push({
          type: 'responsive-grid',
          severity: 'info',
          message: 'Grid may not be responsive',
          fix: 'Add responsive breakpoints: grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // MASTER VALIDATION FUNCTION
  // ============================================================
  
  validateUI(code, componentType = 'unknown') {
    const allIssues = [];
    
    // Run all validators
    allIssues.push(...this.spacing.validate(code));
    allIssues.push(...this.borderRadius.validate(code));
    allIssues.push(...this.glass.validate(code));
    allIssues.push(...this.animation.validate(code));
    allIssues.push(...this.colors.validate(code));
    allIssues.push(...this.components.validate(code));
    allIssues.push(...this.accessibility.validate(code));
    allIssues.push(...this.responsive.validate(code));
    
    // Deduplicate
    const seen = new Set();
    return allIssues.filter(issue => {
      const key = `${issue.type}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  
  // Get issues grouped by category
  getIssuesByCategory(issues) {
    const categories = {};
    for (const issue of issues) {
      const category = issue.type.split('-')[0];
      if (!categories[category]) categories[category] = [];
      categories[category].push(issue);
    }
    return categories;
  },
  
  // Get summary
  getSummary(issues) {
    const byCategory = this.getIssuesByCategory(issues);
    const bySeverity = {
      errors: issues.filter(i => i.severity === 'error'),
      warnings: issues.filter(i => i.severity === 'warning'),
      info: issues.filter(i => i.severity === 'info'),
    };
    
    return {
      total: issues.length,
      categories: Object.keys(byCategory),
      bySeverity,
      topIssues: issues.slice(0, 5),
    };
  },
};

// Export helper functions
export function validateUI(code, componentType) {
  return DesignSystemValidator.validateUI(code, componentType);
}

export function getUIIssues(code) {
  const issues = DesignSystemValidator.validateUI(code);
  return DesignSystemValidator.getSummary(issues);
}

export default DesignSystemValidator;
