/**
 * UIKnowledge - Deep UI Pattern Knowledge System
 * 
 * This is the "brain" of the UIEnhancementAgent that enables intelligent,
 * context-aware UI enhancement suggestions.
 * 
 * WHAT IT KNOWS:
 * 1. HELM'S AESTHETIC - The ultra-premium Linear/Stripe/Vercel vibe Nick is going for
 * 2. PATTERN CATALOG - What components exist and their "premium" implementations
 * 3. ELEMENT MATCHING - How to ensure similar elements look consistent
 * 4. CONTEXT RULES - When to use glass vs solid, animations vs subtle, etc.
 * 5. ENHANCEMENT LIBRARY - Actual code examples for upgrading components
 * 
 * The difference between:
 * - Generic: "Add loading state" 
 * - Smart: "Add skeleton loading with staggered fade-in animation using 
 *          the existing onboarding-cream gradient, matching the 
 *          PlanSelection card hover effects"
 */

export const UIKnowledge = {
  // ============================================
  // HELM'S DESIGN IDENTITY
  // ============================================
  designIdentity: {
    name: 'Helm Premium',
    inspiration: ['Linear', 'Stripe', 'Vercel', 'Apple', 'Framer'],
    
    // Core principles that NEVER change
    principles: {
      craftsmanship: 'Code as art, not just functionality',
      consistency: 'Like elements MUST match - no exceptions',
      subtlety: 'Premium is felt, not screamed',
      purposefulMotion: 'Animation serves UX, not decoration',
      spatialHierarchy: 'Whitespace is a feature, not emptiness',
    },

    // The emotional response we want
    vibe: {
      feel: 'Expensive, confident, trustworthy, innovative',
      avoid: 'Generic, template-y, cluttered, gimmicky',
      comparison: 'Should feel like a $10B company built this',
    },

    // Color philosophy
    colors: {
      baseball: {
        primary: 'onboarding-kelly-green (#169B45)',
        backgrounds: ['onboarding-cream (#FAF6F1)', 'onboarding-warm-white'],
        text: ['onboarding-text-primary', 'onboarding-text-secondary', 'onboarding-text-muted'],
        borders: 'onboarding-border-light (subtle, barely visible)',
        accents: 'kelly-green at 10% opacity for subtle highlights',
      },
      golf: {
        primary: 'emerald-500',
        backgrounds: ['slate-900', 'slate-800'],
        text: ['white', 'slate-300', 'slate-500'],
        glass: 'white/5 to white/10 with backdrop-blur',
        accents: 'emerald glow effects',
      },
    },

    // Typography system
    typography: {
      fontFamily: 'font-sf-pro (San Francisco Pro)',
      scale: {
        hero: 'text-4xl lg:text-5xl font-semibold tracking-tight',
        h1: 'text-2xl sm:text-3xl font-semibold',
        h2: 'text-xl sm:text-2xl font-semibold',
        h3: 'text-lg font-medium',
        body: 'text-base',
        small: 'text-sm',
        micro: 'text-xs (use sparingly)',
      },
      letterSpacing: {
        headings: 'tracking-tight or -0.02em',
        uppercase: 'tracking-wider',
        body: 'default',
      },
    },

    // Spacing system (8px grid)
    spacing: {
      base: 4,
      scale: [4, 8, 12, 16, 24, 32, 48, 64, 96],
      semantic: {
        cardPadding: 'p-6 or p-8',
        sectionGap: 'space-y-8 or space-y-16',
        inputHeight: 'h-[52px]',
        buttonHeight: 'h-12 or h-14',
        cardRadius: 'rounded-xl or rounded-2xl',
        inputRadius: 'rounded-lg',
      },
    },

    // Border radius consistency
    radii: {
      small: 'rounded-lg (8px) - inputs, chips',
      medium: 'rounded-xl (12px) - cards, buttons',
      large: 'rounded-2xl (16px) - panels, modals',
      full: 'rounded-full - avatars, pills',
    },

    // Shadow system
    shadows: {
      subtle: 'shadow-sm',
      card: 'shadow-md hover:shadow-lg',
      elevated: 'shadow-lg',
      glow: {
        green: 'shadow-[0_0_20px_rgba(22,155,69,0.1)]',
        premium: 'shadow-[0_0_40px_rgba(22,155,69,0.15)]',
      },
    },
  },

  // ============================================
  // UI ELEMENT PATTERNS
  // ============================================
  elements: {
    // ---- CARDS ----
    card: {
      name: 'Card',
      description: 'Container for grouped content',
      
      variants: {
        solid: {
          name: 'Solid Card',
          when: 'Data display, forms, content that needs readability',
          base: 'bg-white rounded-xl border border-black/[0.08] p-6',
          hover: 'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
          premium: {
            border: 'border border-black/[0.06]',
            shadow: 'shadow-sm',
            hover: 'hover:shadow-md hover:border-black/[0.1] hover:-translate-y-0.5',
          },
        },
        glass: {
          name: 'Glass Card',
          when: 'Navigation chrome, overlays, floating elements',
          base: 'backdrop-blur-md bg-white/70 border border-white/20 rounded-xl',
          fallback: 'supports-[backdrop-filter]:bg-white/70 bg-white',
          warning: 'NEVER use glass for data tables or dense text',
        },
        interactive: {
          name: 'Interactive Card',
          when: 'Selectable options, clickable items',
          base: 'bg-white rounded-xl border transition-all duration-200 cursor-pointer',
          idle: 'border-black/[0.08]',
          hover: 'hover:border-kelly-green/50 hover:shadow-lg hover:-translate-y-0.5',
          selected: 'border-kelly-green bg-kelly-green/5',
          motion: {
            whileHover: '{ scale: 1.02 }',
            whileTap: '{ scale: 0.98 }',
          },
        },
        premium: {
          name: 'Premium Card (recommended tier, hero)',
          when: 'Highlighting a recommended option',
          border: 'border-2 border-kelly-green',
          glow: 'shadow-[0_0_20px_rgba(22,155,69,0.1)]',
          badge: 'absolute -top-3 left-1/2 -translate-x-1/2',
        },
      },

      antiPatterns: [
        'Glass on data-heavy content',
        'Different radii on same-level cards',
        'Missing hover states on clickable cards',
        'Inconsistent padding within card groups',
      ],
    },

    // ---- BUTTONS ----
    button: {
      name: 'Button',
      description: 'Interactive action triggers',

      variants: {
        primary: {
          name: 'Primary Button',
          when: 'Main CTA, one per section max',
          base: 'h-14 px-6 rounded-xl font-medium transition-all duration-200',
          colors: 'bg-kelly-green text-white hover:bg-kelly-green/90',
          disabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
          premium: {
            shadow: 'shadow-sm hover:shadow-md',
            transform: 'hover:-translate-y-0.5 active:translate-y-0',
          },
        },
        secondary: {
          name: 'Secondary Button',
          when: 'Alternative actions, back buttons',
          base: 'h-14 px-6 rounded-xl font-medium border transition-colors',
          colors: 'border-black/[0.1] text-text-primary hover:bg-black/5',
        },
        ghost: {
          name: 'Ghost Button',
          when: 'Tertiary actions, skip, cancel',
          base: 'px-4 py-2 rounded-lg transition-colors',
          colors: 'text-text-secondary hover:text-text-primary hover:bg-black/5',
        },
        icon: {
          name: 'Icon Button',
          when: 'Icon-only actions',
          base: 'p-2 rounded-lg transition-colors',
          colors: 'hover:bg-black/5',
        },
      },

      antiPatterns: [
        'Multiple primary buttons in same section',
        'Buttons without hover states',
        'Inconsistent heights in button groups',
        'Missing disabled states',
      ],
    },

    // ---- INPUTS ----
    input: {
      name: 'Input',
      description: 'Form input fields',

      variants: {
        standard: {
          name: 'Standard Input',
          when: 'Most form fields',
          base: 'w-full h-[52px] px-4 rounded-lg border transition-all duration-200',
          colors: 'border-border-light bg-white text-text-primary placeholder:text-text-muted',
          focus: 'focus:border-kelly-green focus:ring-4 focus:ring-kelly-green/10',
          error: 'border-red-500 focus:border-red-500 focus:ring-red-100',
        },
        floating: {
          name: 'Floating Label Input',
          when: 'Premium forms, onboarding',
          label: 'Animates from placeholder to floating above on focus',
          complexity: 'high',
        },
        withIcon: {
          name: 'Input with Icon',
          when: 'Search, password toggle, clearable',
          padding: 'Add pr-12 for right icon',
          iconPosition: 'absolute right-4 top-1/2 -translate-y-1/2',
        },
      },

      antiPatterns: [
        'Inputs without focus states',
        'Missing error states',
        'Inconsistent heights across forms',
        'Labels not associated with inputs',
      ],
    },

    // ---- LOADING STATES ----
    loading: {
      name: 'Loading States',
      description: 'Feedback during async operations',

      variants: {
        skeleton: {
          name: 'Skeleton Loader',
          when: 'Content placeholders while data loads',
          base: 'animate-pulse bg-black/[0.06] rounded',
          premium: {
            gradient: 'Shimmer effect with gradient sweep',
            stagger: 'Stagger children with animation-delay',
          },
        },
        spinner: {
          name: 'Spinner',
          when: 'Button loading, small areas',
          base: 'animate-spin rounded-full border-2 border-current border-t-transparent',
          sizes: {
            sm: 'h-4 w-4',
            md: 'h-6 w-6',
            lg: 'h-8 w-8',
          },
        },
        dots: {
          name: 'Animated Dots',
          when: 'Inline loading, thinking indicator',
          animation: 'Staggered bounce with 0.15s delays',
        },
      },

      antiPatterns: [
        'No loading state at all (blank screen)',
        'Spinner for content areas (use skeleton)',
        'Loading states that don\'t match content shape',
      ],
    },

    // ---- PROGRESS INDICATORS ----
    progress: {
      name: 'Progress Indicators',
      description: 'Show advancement through multi-step flows',

      variants: {
        dots: {
          name: 'Progress Dots',
          when: 'Simple step indicator',
        },
        stepped: {
          name: 'Stepped Progress',
          when: 'Numbered steps with labels',
          premium: {
            animation: 'Checkmark draws on completion',
            connector: 'Line fills between steps',
            pulse: 'Current step has subtle pulse ring',
          },
        },
        bar: {
          name: 'Progress Bar',
          when: 'Percentage completion',
          base: 'h-1 rounded-full bg-black/[0.06] overflow-hidden',
          fill: 'h-full bg-kelly-green transition-all duration-500',
        },
      },
    },

    // ---- EMPTY STATES ----
    emptyState: {
      name: 'Empty State',
      description: 'Shown when no data exists',

      structure: {
        icon: 'Optional illustration or icon',
        heading: 'Clear, friendly message',
        description: 'What to do next',
        action: 'Primary CTA to create/add',
      },

      premium: {
        illustration: 'Custom SVG or Lottie animation',
        motion: 'Fade in with slight y translation',
        personality: 'Match brand voice, not generic',
      },
    },

    // ---- MODALS & SHEETS ----
    modal: {
      name: 'Modal / Dialog',
      description: 'Overlay content requiring focus',

      variants: {
        dialog: {
          name: 'Standard Dialog',
          when: 'Confirmations, small forms',
          overlay: 'fixed inset-0 bg-black/50 backdrop-blur-sm',
          container: 'bg-white rounded-2xl shadow-xl max-w-md w-full p-6',
          animation: {
            overlay: 'Fade in',
            content: 'Scale from 95% + fade',
          },
        },
        sheet: {
          name: 'Bottom Sheet',
          when: 'Mobile-first actions, filters',
          container: 'fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl',
          animation: 'Slide up from bottom',
          dragHandle: 'w-10 h-1 rounded-full bg-black/20 mx-auto mt-3',
        },
        fullScreen: {
          name: 'Full Screen Modal',
          when: 'Complex forms, multi-step flows',
          transition: 'Fade or slide in from right',
        },
      },
    },

    // ---- MOTION & ANIMATION ----
    motion: {
      name: 'Motion System',
      description: 'Animation patterns and timing',

      timing: {
        instant: '100ms - micro-interactions',
        fast: '150ms - hover states',
        normal: '200-220ms - transitions',
        smooth: '300-350ms - modals, significant changes',
        cinematic: '500-1000ms - hero animations, onboarding',
      },

      easing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        slowReveal: '[0.16, 1, 0.3, 1]',
      },

      patterns: {
        fadeInUp: {
          initial: '{ opacity: 0, y: 10 }',
          animate: '{ opacity: 1, y: 0 }',
          duration: '0.3s',
        },
        staggerChildren: {
          container: '{ staggerChildren: 0.1 }',
          child: '{ opacity: [0, 1], y: [10, 0] }',
        },
        hover3D: {
          transform: 'perspective(1000px) rotateX(var(--rx)) rotateY(var(--ry))',
          subtle: '±3 degrees max',
        },
        pulseRing: {
          animation: 'scale 1s ease-out infinite',
          opacity: '0.5 → 0',
        },
      },

      antiPatterns: [
        'Animation without purpose',
        'Too many competing animations',
        'Motion that blocks interaction',
        'Ignoring prefers-reduced-motion',
      ],
    },
  },

  // ============================================
  // CONTEXT AWARENESS RULES
  // ============================================
  contextRules: {
    // When to use glass vs solid
    surfaceSelection: {
      glass: [
        'Navigation bars (sticky)',
        'Floating toolbars',
        'Overlays and modals (backdrop)',
        'Side panels (shell only)',
        'Hero sections with controlled backgrounds',
      ],
      solid: [
        'Data tables (ALWAYS)',
        'Forms and inputs',
        'Long-form content',
        'KPI cards with numbers',
        'Any dense information',
      ],
    },

    // Animation intensity by context
    motionIntensity: {
      cinematic: ['Onboarding intro', 'Landing page hero', 'First-time experience'],
      smooth: ['Page transitions', 'Modal open/close', 'Tab switches'],
      subtle: ['Hover states', 'Focus rings', 'Loading indicators'],
      minimal: ['Data tables', 'Form validation', 'List updates'],
    },

    // Component matching rules
    consistency: {
      sameLevel: 'Cards at same hierarchy level MUST have same: radius, padding, shadow',
      sameType: 'All buttons of same type MUST have same: height, font-weight, transition',
      sameFlow: 'Components in same user flow MUST have consistent motion timing',
      sameSection: 'Elements in same section MUST use same color palette intensity',
    },
  },

  // ============================================
  // ENHANCEMENT RECIPES (with actual code)
  // ============================================
  enhancements: {
    cardToPremium: {
      name: 'Card → Premium Card',
      description: 'Upgrade basic card to ultra-premium',
      before: 'bg-white rounded-lg border p-4',
      after: 'bg-white rounded-2xl border border-black/[0.06] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
      additions: [
        'Increased border radius (lg → 2xl)',
        'Softer border color',
        'More generous padding',
        'Shadow hierarchy',
        'Hover lift effect',
        'Smooth transitions',
      ],
    },

    buttonToPremium: {
      name: 'Button → Premium Button',
      description: 'Upgrade basic button to ultra-premium',
      before: 'bg-green-500 text-white px-4 py-2 rounded',
      after: 'h-14 px-6 rounded-xl font-medium bg-onboarding-kelly-green text-white shadow-sm hover:shadow-md hover:bg-onboarding-kelly-green/90 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
    },

    addSkeletonLoading: {
      name: 'Add Skeleton Loading',
      description: 'Premium skeleton with shimmer effect',
      code: `
// Skeleton component with shimmer
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={\`relative overflow-hidden rounded bg-black/[0.06] \${className}\`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] 
                      bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

// Add to tailwind.config.js keyframes:
// shimmer: { '100%': { transform: 'translateX(100%)' } }

// Usage - match the content shape:
{isLoading ? (
  <div className="space-y-4">
    <Skeleton className="h-8 w-48" />  {/* Title */}
    <Skeleton className="h-4 w-full" /> {/* Line 1 */}
    <Skeleton className="h-4 w-3/4" />  {/* Line 2 */}
  </div>
) : (
  <ActualContent />
)}`,
    },

    addAnimatedBackground: {
      name: 'Add Animated Gradient Background',
      description: 'Subtle animated gradient orbs like premium SaaS',
      code: `
'use client';
import { motion } from 'framer-motion';

function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base */}
      <div className="absolute inset-0 bg-onboarding-cream" />
      
      {/* Animated orbs */}
      <motion.div
        className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(22,155,69,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(22,155,69,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.015]"
        style={{ backgroundImage: 'url("data:image/svg+xml,...")' }} />
    </div>
  );
}`,
    },

    add3DTilt: {
      name: 'Add 3D Tilt on Hover',
      description: 'Subtle perspective tilt for interactive cards',
      code: `
'use client';
import { useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';

function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const rotateX = useSpring(useTransform(y, [-100, 100], [3, -3]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-100, 100], [-3, 3]), { stiffness: 300, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="..."
    >
      {children}
    </motion.div>
  );
}`,
    },

    addSteppedProgress: {
      name: 'Add Premium Stepped Progress',
      description: 'Animated step indicator with checkmarks and pulse',
      code: `
'use client';
import { motion } from 'framer-motion';

interface SteppedProgressProps {
  steps: string[];
  currentStep: number;
}

function SteppedProgress({ steps, currentStep }: SteppedProgressProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;
        
        return (
          <div key={step} className="flex items-center gap-2">
            <motion.div className="relative">
              <motion.div
                className={\`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                  transition-colors duration-300
                  \${isComplete 
                    ? 'bg-onboarding-kelly-green text-white' 
                    : isCurrent 
                      ? 'bg-onboarding-kelly-green/10 text-onboarding-kelly-green border-2 border-onboarding-kelly-green'
                      : 'bg-black/5 text-black/30'
                  }
                \`}
              >
                {isComplete ? (
                  <motion.svg 
                    className="w-4 h-4" viewBox="0 0 24 24" fill="none" 
                    stroke="currentColor" strokeWidth={3}
                  >
                    <motion.path
                      d="M5 13l4 4L19 7"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  </motion.svg>
                ) : index + 1}
              </motion.div>
              
              {isCurrent && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-onboarding-kelly-green"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.div>
            
            {index < steps.length - 1 && (
              <div className="w-8 h-0.5 rounded-full bg-black/5 overflow-hidden">
                <motion.div
                  className="h-full bg-onboarding-kelly-green"
                  initial={{ width: 0 }}
                  animate={{ width: isComplete ? '100%' : '0%' }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}`,
    },

    addPremiumInput: {
      name: 'Add Premium Floating Label Input',
      description: 'Input with animated floating label',
      code: `
'use client';
import { useState, forwardRef, InputHTMLAttributes } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PremiumInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const PremiumInput = forwardRef<HTMLInputElement, PremiumInputProps>(
  ({ label, error, value, className, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value && String(value).length > 0;
    const isActive = isFocused || hasValue;

    return (
      <div className="relative">
        <input
          ref={ref}
          value={value}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={\`
            w-full h-14 px-4 pt-4 rounded-xl border-2 transition-all duration-200
            bg-white text-onboarding-text-primary font-sf-pro
            \${error 
              ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100' 
              : 'border-black/[0.08] focus:border-onboarding-kelly-green focus:ring-4 focus:ring-onboarding-kelly-green/10'
            }
            \${className}
          \`}
          placeholder=" "
          {...props}
        />
        <motion.label
          className={\`
            absolute left-4 pointer-events-none font-sf-pro
            \${error ? 'text-red-500' : isActive ? 'text-onboarding-kelly-green' : 'text-onboarding-text-muted'}
          \`}
          initial={false}
          animate={{
            top: isActive ? '4px' : '50%',
            y: isActive ? 0 : '-50%',
            fontSize: isActive ? '12px' : '16px',
          }}
          transition={{ duration: 0.15 }}
        >
          {label}
        </motion.label>
        
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-1.5 text-sm text-red-600"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);`,
    },
  },

  // ============================================
  // DETECTION PATTERNS
  // ============================================
  detection: {
    patterns: {
      card: {
        signals: ['rounded', 'border', 'shadow', 'p-4', 'p-6', 'bg-white'],
        confidence: (code) => {
          let score = 0;
          if (/rounded-(lg|xl|2xl)/.test(code)) score += 20;
          if (/border/.test(code)) score += 15;
          if (/shadow/.test(code)) score += 15;
          if (/p-[4-8]/.test(code)) score += 20;
          if (/bg-white/.test(code)) score += 15;
          if (/hover:/.test(code)) score += 15;
          return score;
        },
      },
      button: {
        signals: ['<button', '<Button', 'onClick', 'type="button"'],
        confidence: (code) => {
          let score = 0;
          if (/<button|<Button/.test(code)) score += 40;
          if (/onClick/.test(code)) score += 30;
          if (/px-\d/.test(code)) score += 15;
          if (/rounded/.test(code)) score += 15;
          return score;
        },
      },
      input: {
        signals: ['<input', '<Input', 'onChange', 'placeholder'],
        confidence: (code) => {
          let score = 0;
          if (/<input|<Input/.test(code)) score += 40;
          if (/onChange/.test(code)) score += 20;
          if (/placeholder/.test(code)) score += 20;
          if (/focus:/.test(code)) score += 20;
          return score;
        },
      },
      loading: {
        signals: ['isLoading', 'Skeleton', 'animate-pulse', 'animate-spin'],
        confidence: (code) => {
          let score = 0;
          if (/isLoading|loading/.test(code)) score += 30;
          if (/Skeleton/.test(code)) score += 30;
          if (/animate-pulse/.test(code)) score += 25;
          if (/animate-spin/.test(code)) score += 15;
          return score;
        },
      },
      animation: {
        signals: ['motion.', 'framer-motion', 'AnimatePresence'],
        confidence: (code) => {
          let score = 0;
          if (/motion\./.test(code)) score += 35;
          if (/AnimatePresence/.test(code)) score += 25;
          if (/whileHover|whileTap/.test(code)) score += 20;
          if (/transition.*duration/.test(code)) score += 20;
          return score;
        },
      },
    },

    issues: {
      inconsistentRadius: {
        detect: (code) => {
          const radii = code.match(/rounded(-\w+)?/g) || [];
          const unique = [...new Set(radii)];
          return unique.length > 3;
        },
        severity: 'warning',
        message: 'Multiple border-radius values - consolidate for consistency',
      },
      missingHoverState: {
        detect: (code) => {
          const hasButton = /<button|<Button|onClick/.test(code);
          const hasHover = /hover:/.test(code);
          return hasButton && !hasHover;
        },
        severity: 'warning',
        message: 'Interactive element without hover state',
      },
      hardcodedColors: {
        detect: (code) => /#[0-9a-fA-F]{6}/.test(code),
        severity: 'info',
        message: 'Hardcoded colors - use design tokens',
      },
      missingTransition: {
        detect: (code) => {
          const hasHover = /hover:/.test(code);
          const hasTransition = /transition/.test(code);
          return hasHover && !hasTransition;
        },
        severity: 'info',
        message: 'Hover without transition - will feel jarring',
      },
      glassOnData: {
        detect: (code) => {
          const hasGlass = /backdrop-blur/.test(code);
          const hasTable = /<table|rows|columns/.test(code);
          return hasGlass && hasTable;
        },
        severity: 'error',
        message: 'Glass effect on data - hurts readability',
      },
    },
  },

  // ============================================
  // HELPER METHODS
  // ============================================
  
  detectElements(code) {
    const elements = [];
    for (const [type, config] of Object.entries(this.detection.patterns)) {
      const confidence = config.confidence(code);
      if (confidence >= 40) {
        elements.push({ type, confidence });
      }
    }
    return elements.sort((a, b) => b.confidence - a.confidence);
  },

  findConsistencyIssues(code) {
    const issues = [];
    for (const [id, check] of Object.entries(this.detection.issues)) {
      if (check.detect(code)) {
        issues.push({
          id,
          severity: check.severity,
          message: check.message,
        });
      }
    }
    return issues;
  },

  getEnhancementsFor(elementType) {
    const suggestions = [];
    const element = this.elements[elementType];
    if (!element) return suggestions;

    if (element.variants?.premium) {
      suggestions.push({
        type: 'upgrade-to-premium',
        element: elementType,
        description: `Upgrade to premium ${elementType}`,
      });
    }
    return suggestions;
  },

  getRecipe(recipeId) {
    return this.enhancements[recipeId];
  },

  scoreDesignAlignment(code) {
    let score = 100;
    const issues = [];

    if (!code.includes('font-sf-pro')) {
      score -= 10;
      issues.push('Missing font-sf-pro');
    }
    if (/#[0-9a-fA-F]{6}/.test(code)) {
      score -= 5;
      issues.push('Hardcoded colors');
    }
    if (/hover:/.test(code) && !/transition/.test(code)) {
      score -= 10;
      issues.push('Hover without transitions');
    }
    if (code.includes('backdrop-blur')) score += 5;
    if (code.includes('motion.')) score += 5;

    return { score: Math.max(0, Math.min(100, score)), issues };
  },
};

export default UIKnowledge;
