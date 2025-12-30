/**
 * HELM COMPONENT PATTERNS KNOWLEDGE
 * 
 * Extracted from actual codebase analysis.
 * This teaches agents exactly how components should look.
 */

export const ComponentPatterns = {

  // ============================================================
  // CARD COMPONENT PATTERNS
  // ============================================================
  
  cards: {
    // Standard card with glass effect
    glassCard: {
      className: 'glass-standard rounded-2xl p-5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
      mustHave: ['ShineEffect component inside', 'rounded-2xl', 'transition-all'],
      example: `
<div className="relative glass-standard rounded-2xl p-5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
  <ShineEffect />
  {/* Content */}
</div>`,
    },
    
    // Interactive card (clickable)
    interactiveCard: {
      className: 'group relative overflow-hidden rounded-2xl bg-white border border-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-200',
      mustHave: ['group class for child hover effects', 'hover:-translate-y-0.5', 'transition-all duration-200'],
      hoverReveal: 'opacity-0 group-hover:opacity-100 transition-opacity',
    },
    
    // Metric card (stats display)
    metricCard: {
      structure: `
- Container: glass-standard rounded-2xl p-5
- ShineEffect inside
- Label: text-[13px] font-medium text-slate-500
- Value: text-[28px] font-semibold tracking-tight text-slate-900
- Icon: w-10 h-10 rounded-xl with bg color
- Optional trend badge
- Optional hover arrow`,
      iconColors: {
        emerald: 'bg-emerald-50 text-emerald-600',
        blue: 'bg-blue-50 text-blue-600',
        amber: 'bg-amber-50 text-amber-600',
        violet: 'bg-violet-50 text-violet-600',
      },
    },
    
    // Quick action card
    quickActionCard: {
      default: 'glass-standard hover:shadow-lg hover:-translate-y-0.5',
      primary: 'bg-slate-900 text-white hover:bg-slate-800',
      structure: 'flex items-center gap-4 p-4 rounded-xl',
      icon: 'w-10 h-10 rounded-xl flex items-center justify-center',
      arrow: 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all',
    },
  },

  // ============================================================
  // PLAYER CARD VARIANTS
  // ============================================================
  
  playerCard: {
    variants: ['default', 'compact', 'featured'],
    
    compact: {
      className: 'flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-200',
      avatar: 'w-10 h-10',
      content: 'font-medium text-slate-900 truncate',
      subtitle: 'text-sm text-slate-500',
    },
    
    default: {
      className: 'relative overflow-hidden rounded-2xl bg-white border border-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-200 group',
      padding: 'p-5',
      avatar: 'w-12 h-12',
      stats: 'flex items-center gap-3 mt-4 pt-4 border-t border-slate-100',
      hoverActions: 'absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
    },
    
    featured: {
      className: 'relative overflow-hidden rounded-2xl bg-white border border-slate-100 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl',
      coverImage: 'h-32 bg-gradient-to-br from-slate-200 to-slate-300',
      overlappingAvatar: '-mt-10 relative z-10',
      featuredGlow: 'ring-2 ring-amber-400/50 ring-offset-2 shadow-amber-100',
    },
    
    // Selection state
    selected: 'ring-2 ring-green-500 ring-offset-2 border-green-200',
    
    // Checkbox for compare mode
    checkbox: {
      base: 'w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200',
      unchecked: 'border-slate-300 hover:border-green-500 bg-white/90 backdrop-blur-sm',
      checked: 'bg-green-600 border-green-600 text-white scale-110',
    },
  },

  // ============================================================
  // AVATAR PATTERNS
  // ============================================================
  
  avatar: {
    sizes: {
      sm: 'w-10 h-10 text-sm',
      md: 'w-12 h-12 text-base',
      lg: 'w-20 h-20 text-xl',
    },
    base: 'rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden',
    border: 'ring-4 ring-white shadow-md',
    initials: 'font-medium text-slate-600',
  },

  // ============================================================
  // BUTTON PATTERNS
  // ============================================================
  
  buttons: {
    // Primary button
    primary: {
      className: 'bg-green-600 text-white hover:-translate-y-0.5 hover:bg-green-500 hover:shadow-lg hover:shadow-green-500/25 active:translate-y-0 active:scale-[0.98]',
      loading: 'Loader2 icon with animate-spin',
    },
    
    // Secondary button
    secondary: {
      className: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98]',
    },
    
    // Ghost button
    ghost: {
      className: 'text-slate-600 bg-transparent hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
    },
    
    // Danger button
    danger: {
      className: 'bg-red-600 text-white hover:-translate-y-0.5 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/25',
    },
    
    // Action button (icon only)
    action: {
      base: 'rounded-lg bg-white/90 backdrop-blur-sm text-slate-600 hover:bg-white hover:text-slate-900 transition-all duration-200 active:scale-95',
      sizes: { sm: 'p-1.5', md: 'p-2' },
    },
    
    // Sizes
    sizes: {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    },
    
    // Focus ring
    focusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  },

  // ============================================================
  // NAVIGATION PATTERNS
  // ============================================================
  
  navigation: {
    // Top nav item
    navLink: {
      base: 'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
      active: 'bg-green-50 text-green-700',
      inactive: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    },
    
    // Sidebar nav
    sidebarItem: {
      base: 'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
      active: 'bg-slate-900 text-white',
      inactive: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    },
    
    // Mobile bottom nav
    bottomNav: {
      container: 'fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-area-bottom',
      item: 'flex flex-col items-center gap-1 py-2',
      active: 'text-green-600',
      inactive: 'text-slate-400',
    },
  },

  // ============================================================
  // FORM PATTERNS
  // ============================================================
  
  forms: {
    // Input field
    input: {
      base: 'w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 transition-all duration-200',
      focus: 'focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100',
      error: 'border-red-300 focus:border-red-400 focus:ring-red-50',
    },
    
    // Label
    label: 'block text-sm font-medium text-slate-700 mb-1.5',
    
    // Helper text
    helperText: 'text-xs text-slate-500 mt-1',
    errorText: 'text-xs text-red-500 mt-1',
    
    // Checkbox
    checkbox: {
      base: 'w-4 h-4 text-slate-900 bg-white border-slate-300 rounded cursor-pointer',
      checked: 'checked:bg-slate-900 checked:border-slate-900',
    },
    
    // Select
    select: {
      base: 'w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg transition-all duration-200',
      focus: 'focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100',
    },
  },

  // ============================================================
  // BADGE/TAG PATTERNS
  // ============================================================
  
  badges: {
    base: 'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full',
    variants: {
      default: 'bg-slate-100 text-slate-600',
      success: 'bg-green-50 text-green-700',
      warning: 'bg-amber-50 text-amber-700',
      error: 'bg-red-50 text-red-700',
      info: 'bg-blue-50 text-blue-700',
    },
    // Status dot
    statusDot: {
      base: 'w-2 h-2 rounded-full',
      colors: {
        success: 'bg-green-500',
        warning: 'bg-amber-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        offline: 'bg-slate-300',
      },
    },
    // Trend badge
    trend: {
      positive: 'text-emerald-700 bg-emerald-50',
      negative: 'text-red-600 bg-red-50',
    },
  },

  // ============================================================
  // EMPTY STATE PATTERNS
  // ============================================================
  
  emptyState: {
    container: 'flex flex-col items-center justify-center py-12 px-6 text-center',
    icon: 'w-16 h-16 mb-4 text-slate-300',
    title: 'text-lg font-semibold text-slate-900 mb-2',
    description: 'text-sm text-slate-500 mb-6 max-w-sm',
    action: 'btn-primary',
    compact: 'py-8',
  },

  // ============================================================
  // MODAL PATTERNS
  // ============================================================
  
  modal: {
    overlay: 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50',
    container: 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50',
    content: 'bg-white rounded-3xl shadow-2xl overflow-hidden',
    header: 'flex items-center justify-between px-6 py-4 border-b border-slate-100',
    title: 'text-lg font-semibold text-slate-900',
    body: 'px-6 py-4',
    footer: 'flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100',
  },

  // ============================================================
  // LIST/TABLE PATTERNS
  // ============================================================
  
  lists: {
    // Row item
    row: {
      base: 'flex items-center gap-4 px-4 py-3 transition-colors',
      hover: 'hover:bg-slate-50 rounded-lg cursor-pointer',
      divider: 'border-b border-slate-100',
    },
    
    // Section header
    sectionHeader: {
      title: 'text-[13px] font-semibold text-slate-500 uppercase tracking-wider',
      action: 'flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors',
    },
  },

  // ============================================================
  // ANIMATION PATTERNS
  // ============================================================
  
  animations: {
    // Fade in up (for staggered loading)
    fadeInUp: {
      keyframes: `@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}`,
      usage: 'animation: fadeInUp 0.5s ease-out forwards; opacity: 0;',
      stagger: 'animationDelay: `${index * 50}ms`',
    },
    
    // Hover lift
    hoverLift: 'hover:-translate-y-0.5 transition-all duration-200',
    hoverLiftLarge: 'hover:-translate-y-1 transition-all duration-300',
    
    // Hover reveal
    hoverReveal: 'opacity-0 group-hover:opacity-100 transition-opacity',
    
    // Scale on click
    activeScale: 'active:scale-[0.98] transition-transform',
    
    // Spinner
    spinner: 'animate-spin',
  },

  // ============================================================
  // LAYOUT PATTERNS
  // ============================================================
  
  layouts: {
    // Page layout
    page: {
      container: 'min-h-screen',
      header: 'border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10',
      headerContent: 'max-w-7xl mx-auto px-6 py-5',
      main: 'max-w-7xl mx-auto px-6 py-8',
    },
    
    // Dashboard layout
    dashboard: {
      metricsGrid: 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8',
      twoColumn: 'grid lg:grid-cols-3 gap-6',
    },
    
    // Card grid
    cardGrid: {
      default: 'grid gap-4',
      responsive: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    },
  },

  // ============================================================
  // ICON USAGE
  // ============================================================
  
  icons: {
    library: 'Custom icons from @/components/icons (not lucide-react directly)',
    sizes: {
      xs: 10,
      sm: 14,
      md: 18,
      lg: 20,
      xl: 24,
    },
    inButton: 'size={18} for buttons',
    inCard: 'size={20} for card icons',
    standalone: 'size={16} for inline icons',
  },
};

// Export validation functions
export function isValidCardPattern(className) {
  const required = ['rounded-2xl', 'transition'];
  return required.every(r => className.includes(r));
}

export function isValidButtonVariant(variant) {
  return ['primary', 'secondary', 'ghost', 'danger'].includes(variant);
}

export function getPatternForComponent(componentType) {
  return ComponentPatterns[componentType] || null;
}

export default ComponentPatterns;
