/**
 * Intelligence Brief Generator v5.0.0
 * 
 * Generates comprehensive, actionable prompts with:
 * - WHO: Affected user personas
 * - WHAT: The problem with code context
 * - WHERE: Exact locations with line numbers
 * - WHY: Business and user impact
 * - HOW: Step-by-step fix with templates
 * - LEARNINGS: From past fixes
 */

import path from 'path';
import { promises as fs } from 'fs';

class IntelligenceBriefGenerator {
  constructor(knowledge, issueTracker, improvementAgent, projectRoot) {
    this.knowledge = knowledge;
    this.issueTracker = issueTracker;
    this.improvementAgent = improvementAgent;
    this.projectRoot = projectRoot;
    
    // User personas
    this.personas = {
      'college-coach': {
        name: '🏈 College Coach',
        description: 'College baseball/softball recruiting coordinator',
        goals: ['Find talented recruits', 'Manage recruiting pipeline', 'Communicate with prospects'],
        frustrations: ['Wasted time on unqualified leads', 'Slow/buggy tools', 'Missing player data'],
        techLevel: 'moderate',
      },
      'hs-player': {
        name: '⚾ High School Player',
        description: 'High school athlete seeking college recruitment',
        goals: ['Get recruited', 'Showcase skills', 'Connect with coaches'],
        frustrations: ['Confusing interfaces', 'Slow uploads', 'Unclear next steps'],
        techLevel: 'high',
      },
      'golf-coach': {
        name: '⛳ Golf Coach',
        description: 'College golf team coach/manager',
        goals: ['Manage team roster', 'Track player stats', 'Coordinate tournaments'],
        frustrations: ['Manual data entry', 'Scattered information', 'Poor mobile experience'],
        techLevel: 'moderate',
      },
      'golf-player': {
        name: '🏌️ Golf Player',
        description: 'College golf team member',
        goals: ['Track personal stats', 'View team standings', 'Schedule practice'],
        frustrations: ['Outdated data', 'Limited mobile access', 'Missing features'],
        techLevel: 'high',
      },
    };
    
    // Severity impacts
    this.severityImpacts = {
      blocker: {
        label: '🔴 BLOCKER',
        userImpact: 'Users cannot complete their task at all.',
        businessImpact: 'Direct revenue/conversion loss. Users will leave.',
        priority: 'Fix immediately before any other work.',
      },
      error: {
        label: '🟠 ERROR',
        userImpact: 'Users may encounter crashes or data loss.',
        businessImpact: 'Trust erosion, support tickets, churn risk.',
        priority: 'Fix within 24 hours.',
      },
      warning: {
        label: '🟡 WARNING',
        userImpact: 'Users can work around it, but experience is degraded.',
        businessImpact: 'Accumulates technical debt, slows future development.',
        priority: 'Fix in current sprint.',
      },
      info: {
        label: '🔵 INFO',
        userImpact: 'Minor polish issue, users may not notice.',
        businessImpact: 'Small quality improvement.',
        priority: 'Fix when convenient.',
      },
    };
    
    // Category context
    this.categoryContext = {
      'loading': {
        why: 'Missing loading states cause confusion - users don\'t know if the app is working or broken. They may leave.',
        userPerspective: 'Users stare at a blank screen, unsure if the page is loading, frozen, or broken.',
        bestPractice: 'Every async route should have a loading.tsx that mirrors the page layout.',
        premiumExample: 'Linear shows perfectly aligned skeletons that morph into actual content seamlessly.',
      },
      'error-handling': {
        why: 'Unhandled errors crash the page, showing cryptic messages that destroy user confidence.',
        userPerspective: 'Users see "Something went wrong" with no way to recover. They blame the app.',
        bestPractice: 'Every route should have an error.tsx with clear messaging and a retry option.',
        premiumExample: 'Stripe shows friendly error messages with specific actions users can take.',
      },
      'console-statements': {
        why: 'Console logs in production slow down the app, expose internal details, and look unprofessional in dev tools.',
        userPerspective: 'Users opening dev tools see debug noise, suggesting the app is unfinished.',
        bestPractice: 'Remove all console.log before shipping. Use proper error tracking (Sentry) for production logging.',
        premiumExample: 'Production apps have zero console output except critical errors.',
      },
      'type-safety': {
        why: 'TypeScript errors mean potential runtime crashes. The type system exists to catch bugs before users do.',
        userPerspective: 'Users may experience crashes or incorrect data display.',
        bestPractice: 'Fix all TypeScript errors. Use strict mode. Never use `any` without justification.',
        premiumExample: 'Well-typed code is self-documenting and prevents entire categories of bugs.',
      },
      'accessibility': {
        why: 'Accessibility issues exclude users with disabilities and often indicate poor semantic HTML that hurts SEO.',
        userPerspective: 'Screen reader users, keyboard-only users, and users with visual impairments cannot use the feature.',
        bestPractice: 'All interactive elements need proper labels, keyboard support, and focus management.',
        premiumExample: 'Apple products are renowned for accessibility, which benefits all users.',
      },
      'design-system': {
        why: 'Inconsistent design makes the app feel unpolished and confusing. Users subconsciously lose trust.',
        userPerspective: 'The app feels "off" even if users cannot articulate why.',
        bestPractice: 'Follow the design system exactly. Use standard spacing (4/8/12/16/24/32/48/64px), radii, and glass effects.',
        premiumExample: 'Linear, Stripe, and Vercel have pixel-perfect consistency across every screen.',
      },
      'navigation': {
        why: 'Broken navigation strands users. Dead links erode trust and make the app feel incomplete.',
        userPerspective: 'Users click expecting to go somewhere and nothing happens, or they get an error.',
        bestPractice: 'Every link must work. Use proper Next.js Link components. Test all navigation paths.',
        premiumExample: 'Professional apps never have 404s from internal navigation.',
      },
      'performance': {
        why: 'Slow pages frustrate users and hurt conversion. Every 100ms matters.',
        userPerspective: 'Users perceive slow apps as broken or cheap.',
        bestPractice: 'Lazy load below-fold content. Optimize images. Minimize bundle size.',
        premiumExample: 'Linear loads instantly because they obsess over performance.',
      },
      'security': {
        why: 'Security issues expose user data and can destroy the business overnight.',
        userPerspective: 'Users trust you with their data. Betray that trust once and they are gone forever.',
        bestPractice: 'Never hardcode secrets. Always validate input. Use RLS in Supabase.',
        premiumExample: 'Security is non-negotiable. There is no "good enough".',
      },
    };
    
    // Fix templates
    this.templates = {
      'loading.tsx': {
        type: 'loading.tsx',
        description: 'Next.js loading state component',
        code: `export default function Loading() {
  return (
    <div className="container py-8">
      <div className="animate-pulse space-y-6">
        {/* Header skeleton */}
        <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        
        {/* Content grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div 
              key={i} 
              className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"
            />
          ))}
        </div>
      </div>
    </div>
  );
}`,
      },
      'error.tsx': {
        type: 'error.tsx',
        description: 'Next.js error boundary component',
        code: `'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="text-6xl">😕</div>
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-zinc-500 text-center max-w-md">
        We hit an unexpected error. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}`,
      },
    };
  }

  /**
   * Generate a comprehensive Intelligence Brief for an issue
   */
  async generateBrief(issueId) {
    const issue = this.issueTracker?.issues?.get(issueId);
    if (!issue) return null;
    
    // Gather all context
    const context = await this.gatherContext(issue);
    const codeContext = await this.getCodeContext(issue);
    const relatedFiles = await this.findRelatedFiles(issue);
    const learnings = this.getLearnings(issue);
    const template = this.getTemplate(issue);
    
    // Build the brief
    const brief = this.buildBrief(issue, context, codeContext, relatedFiles, learnings, template);
    
    return brief;
  }

  /**
   * Gather comprehensive context about the issue
   */
  async gatherContext(issue) {
    const context = {
      route: null,
      personas: [],
      severity: null,
      category: null,
    };
    
    // Get route context
    if (issue.routePath && this.knowledge) {
      try {
        context.route = this.knowledge.getRouteContext?.(issue.routePath);
      } catch (e) {}
    }
    
    // Determine affected personas
    const domain = issue.routePath?.includes('/golf/') ? 'golf' : 'baseball';
    const isCoachRoute = issue.routePath?.includes('/dashboard/');
    
    if (domain === 'golf') {
      context.personas = isCoachRoute ? [this.personas['golf-coach']] : [this.personas['golf-player']];
    } else {
      context.personas = isCoachRoute ? [this.personas['college-coach']] : [this.personas['hs-player']];
    }
    
    // Get severity context
    context.severity = this.severityImpacts[issue.severity] || this.severityImpacts.warning;
    
    // Get category context
    const categoryKey = this.matchCategory(issue);
    context.category = this.categoryContext[categoryKey] || null;
    
    return context;
  }

  /**
   * Match issue to category
   */
  matchCategory(issue) {
    const title = (issue.title || '').toLowerCase();
    const category = (issue.category || '').toLowerCase();
    
    if (title.includes('loading') || category === 'loading') return 'loading';
    if (title.includes('error') || category === 'error-handling') return 'error-handling';
    if (title.includes('console')) return 'console-statements';
    if (title.includes('type') || category === 'type-safety') return 'type-safety';
    if (title.includes('accessibility') || title.includes('a11y')) return 'accessibility';
    if (title.includes('design') || category === 'design-system') return 'design-system';
    if (title.includes('navigation') || title.includes('dead')) return 'navigation';
    if (title.includes('performance') || title.includes('slow')) return 'performance';
    if (title.includes('security')) return 'security';
    
    return category || 'general';
  }

  /**
   * Get code context for the issue
   */
  async getCodeContext(issue) {
    const context = {
      mainSnippet: null,
      matchLocations: [],
    };
    
    if (!issue.file) return context;
    
    try {
      const filePath = path.join(this.projectRoot, issue.file);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      if (issue.line) {
        const startLine = Math.max(0, issue.line - 4);
        const endLine = Math.min(lines.length, issue.line + 3);
        const snippet = lines.slice(startLine, endLine).map((line, i) => {
          const lineNum = startLine + i + 1;
          const marker = lineNum === issue.line ? '>>>' : '   ';
          return `${marker} ${lineNum.toString().padStart(4)} | ${line}`;
        }).join('\n');
        
        context.mainSnippet = {
          code: snippet,
          startLine: startLine + 1,
          endLine,
          focusLine: issue.line,
        };
      }
      
      // Get all match locations if present
      if (issue.matches) {
        context.matchLocations = issue.matches.map(m => ({
          file: m.file,
          line: m.line,
          code: m.code,
        }));
      }
    } catch (e) {
      // File not readable
    }
    
    return context;
  }

  /**
   * Find related files
   */
  async findRelatedFiles(issue) {
    const related = [];
    
    if (!issue.file && !issue.routePath) return related;
    
    const routeDir = issue.file 
      ? path.dirname(path.join(this.projectRoot, issue.file))
      : path.join(this.projectRoot, 'src/app', issue.routePath);
    
    const siblingFiles = [
      { name: 'loading.tsx', reason: 'Loading skeleton' },
      { name: 'error.tsx', reason: 'Error boundary' },
      { name: 'layout.tsx', reason: 'Layout wrapper' },
      { name: 'page.tsx', reason: 'Page component' },
    ];
    
    for (const sibling of siblingFiles) {
      const siblingPath = path.join(routeDir, sibling.name);
      try {
        await fs.access(siblingPath);
        related.push({ file: sibling.name, exists: true, reason: sibling.reason });
      } catch {
        related.push({ file: sibling.name, exists: false, reason: sibling.reason });
      }
    }
    
    return related;
  }

  /**
   * Get learnings from past fixes
   */
  getLearnings(issue) {
    if (!this.improvementAgent) return null;
    
    try {
      const categoryKey = this.matchCategory(issue);
      return this.improvementAgent.getRecommendedApproach?.(categoryKey);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get fix template
   */
  getTemplate(issue) {
    const categoryKey = this.matchCategory(issue);
    
    if (categoryKey === 'loading') return this.templates['loading.tsx'];
    if (categoryKey === 'error-handling') return this.templates['error.tsx'];
    
    return null;
  }

  /**
   * Build the complete Intelligence Brief
   */
  buildBrief(issue, context, codeContext, relatedFiles, learnings, template) {
    const lines = [];
    
    // HEADER
    lines.push(`# 🎯 Intelligence Brief: ${issue.title}`);
    lines.push('');
    lines.push(`**Generated**: ${new Date().toLocaleString()}`);
    lines.push(`**Issue ID**: \`${issue.id}\``);
    lines.push(`**Status**: ${issue.status || 'open'}`);
    lines.push('');
    
    // TL;DR
    lines.push('---');
    lines.push('## 📋 TL;DR');
    lines.push('');
    lines.push(`| Aspect | Detail |`);
    lines.push(`|--------|--------|`);
    lines.push(`| **Severity** | ${context.severity?.label || issue.severity} |`);
    lines.push(`| **Category** | ${issue.category} |`);
    lines.push(`| **File** | \`${issue.file || issue.routePath || 'Multiple'}\` |`);
    if (issue.line) lines.push(`| **Line** | ${issue.line} |`);
    lines.push(`| **Est. Fix Time** | ${this.estimateFixTime(issue)} |`);
    lines.push('');
    
    // WHO
    lines.push('---');
    lines.push('## 👤 WHO: Affected Users');
    lines.push('');
    
    if (context.personas.length > 0) {
      for (const persona of context.personas) {
        lines.push(`### ${persona.name}`);
        lines.push('');
        lines.push(`**Goals**: ${persona.goals.join(', ')}`);
        lines.push('');
        lines.push(`**This issue blocks/degrades**: ${this.getPersonaImpact(issue, persona)}`);
        lines.push('');
      }
    } else {
      lines.push('All users of this route may be affected.');
      lines.push('');
    }
    
    // WHAT
    lines.push('---');
    lines.push('## 🔍 WHAT: The Problem');
    lines.push('');
    lines.push(`### Issue Description`);
    lines.push('');
    lines.push(issue.description || issue.title);
    lines.push('');
    
    if (context.category) {
      lines.push(`### Why This Matters`);
      lines.push('');
      lines.push(context.category.why);
      lines.push('');
      lines.push(`> **User Perspective**: ${context.category.userPerspective}`);
      lines.push('');
    }
    
    // WHERE
    lines.push('---');
    lines.push('## 📍 WHERE: Exact Location');
    lines.push('');
    
    if (issue.file) {
      lines.push(`### Primary File`);
      lines.push('');
      lines.push(`\`${issue.file}\``);
      lines.push('');
    }
    
    if (codeContext.mainSnippet) {
      lines.push(`### Code Context (Lines ${codeContext.mainSnippet.startLine}-${codeContext.mainSnippet.endLine})`);
      lines.push('');
      lines.push('```tsx');
      lines.push(codeContext.mainSnippet.code);
      lines.push('```');
      lines.push('');
      lines.push(`> 📌 **Focus**: Line ${codeContext.mainSnippet.focusLine} (marked with >>>)`);
      lines.push('');
    }
    
    if (codeContext.matchLocations.length > 0) {
      lines.push(`### All Locations (${codeContext.matchLocations.length} total)`);
      lines.push('');
      
      const byFile = {};
      codeContext.matchLocations.forEach(m => {
        if (!byFile[m.file]) byFile[m.file] = [];
        byFile[m.file].push(m);
      });
      
      for (const [file, matches] of Object.entries(byFile)) {
        lines.push(`**\`${file}\`**`);
        lines.push('');
        for (const m of matches.slice(0, 5)) {
          lines.push(`- Line ${m.line}: \`${m.code?.slice(0, 60) || ''}${(m.code?.length || 0) > 60 ? '...' : ''}\``);
        }
        if (matches.length > 5) {
          lines.push(`- ... and ${matches.length - 5} more`);
        }
        lines.push('');
      }
    }
    
    if (relatedFiles.length > 0) {
      lines.push(`### Related Files`);
      lines.push('');
      lines.push(`| File | Status | Purpose |`);
      lines.push(`|------|--------|---------|`);
      for (const rf of relatedFiles) {
        const status = rf.exists ? '✅ Exists' : '❌ Missing';
        lines.push(`| \`${rf.file}\` | ${status} | ${rf.reason} |`);
      }
      lines.push('');
    }
    
    // WHY
    lines.push('---');
    lines.push('## 💼 WHY: Business Impact');
    lines.push('');
    
    if (context.severity) {
      lines.push(`### Severity: ${context.severity.label}`);
      lines.push('');
      lines.push(`**User Impact**: ${context.severity.userImpact}`);
      lines.push('');
      lines.push(`**Business Impact**: ${context.severity.businessImpact}`);
      lines.push('');
      lines.push(`**Priority**: ${context.severity.priority}`);
      lines.push('');
    }
    
    if (context.route) {
      lines.push(`### Route Context`);
      lines.push('');
      lines.push(`This is the **${context.route.title || context.route.routeType || 'standard'}** route.`);
      lines.push('');
      if (context.route.purpose) {
        lines.push(`**Purpose**: ${context.route.purpose}`);
        lines.push('');
      }
    }
    
    // HOW
    lines.push('---');
    lines.push('## 🔧 HOW: The Fix');
    lines.push('');
    
    lines.push(`### Goal`);
    lines.push('');
    lines.push(this.generateGoalStatement(issue, context));
    lines.push('');
    
    lines.push(`### Step-by-Step Fix`);
    lines.push('');
    const steps = this.generateFixSteps(issue, context, codeContext, relatedFiles, template);
    steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push('');
    
    if (template) {
      lines.push(`### Template: ${template.type}`);
      lines.push('');
      lines.push(template.description);
      lines.push('');
      lines.push('```tsx');
      lines.push(template.code);
      lines.push('```');
      lines.push('');
    }
    
    if (context.category?.bestPractice) {
      lines.push(`### Best Practice`);
      lines.push('');
      lines.push(context.category.bestPractice);
      lines.push('');
      lines.push(`> **Premium Example**: ${context.category.premiumExample}`);
      lines.push('');
    }
    
    // LEARNINGS
    if (learnings && (learnings.recentFixes?.length > 0 || learnings.tips?.length > 0)) {
      lines.push('---');
      lines.push('## 🧠 LEARNINGS: From Past Fixes');
      lines.push('');
      
      if (learnings.recommended) {
        lines.push(`**Recommended Approach**: ${learnings.recommended.approach}`);
        lines.push('');
        lines.push(`**Success Rate**: ${Math.round(learnings.successRate * 100)}%`);
        lines.push('');
      }
      
      if (learnings.commonMistakes?.length > 0) {
        lines.push(`### ⚠️ Common Mistakes to Avoid`);
        lines.push('');
        learnings.commonMistakes.forEach(m => {
          lines.push(`- ${m}`);
        });
        lines.push('');
      }
      
      if (learnings.tips?.length > 0) {
        lines.push(`### 💡 Tips`);
        lines.push('');
        learnings.tips.forEach(t => {
          lines.push(`- ${t}`);
        });
        lines.push('');
      }
    }
    
    // VERIFICATION
    lines.push('---');
    lines.push('## ✅ VERIFICATION');
    lines.push('');
    lines.push('After applying the fix, verify:');
    lines.push('');
    const verifications = this.generateVerificationSteps(issue, context);
    verifications.forEach((v, i) => {
      lines.push(`${i + 1}. ${v}`);
    });
    lines.push('');
    
    // DESIGN SYSTEM
    lines.push('---');
    lines.push('## 🎨 Design System Quick Reference');
    lines.push('');
    lines.push('| Element | Value |');
    lines.push('|---------|-------|');
    lines.push('| **Spacing** | 4, 8, 12, 16, 24, 32, 48, 64px |');
    lines.push('| **Card Radius** | 16px (rounded-2xl) |');
    lines.push('| **Button Radius** | 12px (rounded-xl) |');
    lines.push('| **Input Radius** | 8px (rounded-lg) |');
    lines.push('| **Transitions** | 150ms hover, 220ms state |');
    lines.push('| **Glass** | Nav, toolbars, modals only |');
    lines.push('');
    
    // FOOTER
    lines.push('---');
    lines.push('');
    lines.push(`*Generated by Ship Command Hub Intelligence Brief Generator*`);
    lines.push(`*Issue ID: ${issue.id}*`);
    
    return lines.join('\n');
  }

  /**
   * Estimate fix time
   */
  estimateFixTime(issue) {
    const title = (issue.title || '').toLowerCase();
    
    if (title.includes('console')) return '5-10 min';
    if (title.includes('loading')) return '10-15 min';
    if (title.includes('error')) return '10-15 min';
    if (title.includes('type')) return '5-15 min';
    if (title.includes('accessibility')) return '15-30 min';
    if (title.includes('design')) return '10-20 min';
    
    return '10-20 min';
  }

  /**
   * Get persona impact
   */
  getPersonaImpact(issue, persona) {
    const categoryKey = this.matchCategory(issue);
    const goal = persona.goals[0] || 'their task';
    
    const impacts = {
      'loading': `Their ability to quickly ${goal}. Blank screens waste their limited time.`,
      'error-handling': `Their confidence in the app. Crashes make them question data reliability.`,
      'console-statements': `Their perception of app quality (if they check dev tools).`,
      'accessibility': `Their ability to use the app at all (if they have accessibility needs).`,
      'navigation': `Their ability to navigate between features efficiently.`,
      'design-system': `Their trust in the app's professionalism and reliability.`,
    };
    
    return impacts[categoryKey] || `Their ability to ${goal} efficiently.`;
  }

  /**
   * Generate goal statement
   */
  generateGoalStatement(issue, context) {
    const categoryKey = this.matchCategory(issue);
    
    const goals = {
      'loading': 'Create a loading state that shows a skeleton UI matching the page layout, so users see immediate feedback while data loads.',
      'error-handling': 'Add an error boundary that catches errors gracefully and gives users a clear way to recover.',
      'console-statements': 'Remove all console.log statements to keep production clean and performant.',
      'accessibility': 'Ensure all users, including those with disabilities, can use this feature.',
      'navigation': 'Fix navigation so all links work and users can move through the app confidently.',
      'design-system': 'Align the component with the design system for visual consistency.',
    };
    
    return goals[categoryKey] || `Resolve ${issue.title} to improve user experience.`;
  }

  /**
   * Generate fix steps
   */
  generateFixSteps(issue, context, codeContext, relatedFiles, template) {
    const categoryKey = this.matchCategory(issue);
    const routeDir = issue.file ? path.dirname(issue.file) : issue.routePath;
    
    const stepsByCategory = {
      'loading': [
        `Open the route folder: \`${routeDir}\``,
        'Create `loading.tsx` in this folder (if it doesn\'t exist)',
        'Analyze the page.tsx to understand the layout structure',
        'Create skeleton elements that match the page layout dimensions',
        'Use `animate-pulse` for the shimmer effect',
        'Test by throttling network in DevTools',
      ],
      'error-handling': [
        `Open the route folder: \`${routeDir}\``,
        'Create `error.tsx` in this folder (if it doesn\'t exist)',
        'Add "use client" at the top (error boundaries must be client components)',
        'Implement the Error component with reset functionality',
        'Test by temporarily throwing an error in page.tsx',
      ],
      'console-statements': [
        'Search for all console.log statements in the file',
        'Remove each console.log (or replace with proper logging if needed)',
        'Check for console.error, console.warn too',
        'Run build to ensure no console statements slip through',
      ],
    };
    
    return stepsByCategory[categoryKey] || [
      `Open the file: \`${issue.file || routeDir}\``,
      'Locate the code causing the issue',
      'Apply the fix following design system rules',
      'Test the change manually',
      'Verify no TypeScript errors',
    ];
  }

  /**
   * Generate verification steps
   */
  generateVerificationSteps(issue, context) {
    const steps = [];
    const title = (issue.title || '').toLowerCase();
    
    steps.push('No TypeScript errors: `npx tsc --noEmit`');
    
    if (title.includes('loading')) {
      steps.push('Loading skeleton appears on initial page load (use network throttling)');
      steps.push('Skeleton layout matches actual content layout');
      steps.push('Transition from skeleton to content is smooth');
    } else if (title.includes('error')) {
      steps.push('Error boundary catches thrown errors');
      steps.push('Error message is user-friendly (not technical)');
      steps.push('Retry button works and attempts recovery');
    } else if (title.includes('console')) {
      steps.push('No console output in browser DevTools');
      steps.push('`npm run build` succeeds with no warnings');
    } else if (title.includes('accessibility')) {
      steps.push('Page is navigable with keyboard only');
      steps.push('Screen reader can read all content');
      steps.push('Focus states are visible');
    }
    
    steps.push('Manual visual inspection looks correct');
    
    return steps;
  }

  /**
   * Generate batch brief
   */
  async generateBatchBrief(issueIds) {
    const briefs = [];
    
    for (const id of issueIds) {
      const brief = await this.generateBrief(id);
      if (brief) briefs.push({ id, brief });
    }
    
    const lines = [];
    lines.push(`# 🎯 Batch Intelligence Brief`);
    lines.push('');
    lines.push(`**Total Issues**: ${briefs.length}`);
    lines.push(`**Generated**: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    
    briefs.forEach(({ id, brief }, i) => {
      lines.push(`## Issue ${i + 1} of ${briefs.length}`);
      lines.push('');
      lines.push(brief);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    
    return lines.join('\n');
  }
}

export default IntelligenceBriefGenerator;
