/**
 * Enhanced MD Generator Agent v2
 * 
 * SMART FEATURES:
 * - Full project knowledge injection
 * - Design system rules embedded
 * - Route-specific context
 * - Component pattern suggestions
 * - Quick fix detection
 * - Screenshot analysis integration
 */

import Anthropic from '@anthropic-ai/sdk';
import HelmKnowledge from '../knowledge/index.js';

export class MDGeneratorAgent {
  constructor(config = {}) {
    this.projectRoot = config.projectRoot;
    this.anthropic = new Anthropic();
    this.knowledge = HelmKnowledge;
    
    // Quick fix patterns
    this.quickFixes = {
      'hover-state': {
        pattern: /missing.*hover|no.*hover|hover.*missing/i,
        fix: 'Add: hover:bg-opacity-80 transition-all duration-150',
        effort: '1 min',
      },
      'loading-state': {
        pattern: /missing.*loading|no.*loading\.tsx|needs.*loading/i,
        fix: 'Create loading.tsx with Skeleton components',
        effort: '5 min',
      },
      'error-boundary': {
        pattern: /missing.*error|no.*error\.tsx|needs.*error/i,
        fix: 'Create error.tsx with error UI',
        effort: '5 min',
      },
      'wrong-spacing': {
        pattern: /spacing|wrong.*padding|incorrect.*margin|non-standard.*space/i,
        fix: 'Use design system values: 4, 8, 12, 16, 24, 32, 48, 64px',
        effort: '2 min',
      },
      'glass-misuse': {
        pattern: /glass.*table|glass.*form|glass.*data|remove.*glass/i,
        fix: 'Remove glass effect, use solid bg-zinc-900 or bg-slate-900',
        effort: '2 min',
      },
      'missing-transition': {
        pattern: /missing.*transition|no.*animation|needs.*transition/i,
        fix: 'Add: transition-all duration-200 ease-out',
        effort: '1 min',
      },
      'border-radius': {
        pattern: /wrong.*radius|incorrect.*rounded|border-radius/i,
        fix: 'Use: input=8px, button=12px, card=16px, modal=24px',
        effort: '2 min',
      },
    };
  }

  /**
   * Check if issue has a quick fix
   */
  detectQuickFix(title, description) {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    for (const [id, qf] of Object.entries(this.quickFixes)) {
      if (qf.pattern.test(text)) {
        return {
          id,
          fix: qf.fix,
          effort: qf.effort,
          isQuickFix: true,
        };
      }
    }
    
    return null;
  }

  /**
   * Generate implementation MD with full context
   */
  async generateMD(options) {
    const { type, title, description, why, result, route, screenshot, code } = options;
    
    // Check for quick fix first
    const quickFix = this.detectQuickFix(title, description);
    if (quickFix) {
      options.quickFix = quickFix;
    }
    
    // Get rich context
    const routeContext = this.knowledge.getRouteContext(route);
    const domain = this.knowledge.getRouteDomain(route);
    const domainKnowledge = this.knowledge.getDomain(domain);
    const designSystem = this.knowledge.getDesignSystem();
    const componentPatterns = this.knowledge.patterns;
    
    // Build mega prompt with full context
    const prompt = this.buildMegaPrompt({
      type,
      title,
      description,
      why,
      result,
      route,
      code,
      routeContext,
      domain,
      domainKnowledge,
      designSystem,
      componentPatterns,
      quickFix,
    });
    
    try {
      const messages = [];
      
      // Add screenshot if available
      if (screenshot) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.replace(/^data:image\/\w+;base64,/, ''),
              },
            },
            { type: 'text', text: prompt },
          ],
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000, // More tokens for detailed output
        messages,
      });

      return {
        title,
        type,
        route,
        content: response.content[0].text,
        quickFix,
        generatedAt: Date.now(),
        context: {
          domain,
          routeType: routeContext.routeType,
          hasScreenshot: !!screenshot,
        },
      };
    } catch (error) {
      console.error('MD generation error:', error.message);
      return this.generateFallbackMD(options);
    }
  }

  /**
   * Build comprehensive prompt with full project knowledge
   */
  buildMegaPrompt(ctx) {
    const {
      type,
      title,
      description,
      why,
      result,
      route,
      code,
      routeContext,
      domain,
      domainKnowledge,
      designSystem,
      componentPatterns,
      quickFix,
    } = ctx;
    
    return `You are a SENIOR FULL-STACK DEVELOPER at Helm Sports Labs creating an implementation guide.

# CRITICAL: Generate COMPLETE, PRODUCTION-READY code. NO placeholders, NO "// TODO", NO "implement here".

## PROJECT CONTEXT

**Platform**: Helm Sports Labs - Premium multi-sport SaaS
**Tech Stack**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase, Framer Motion
**Quality Target**: Linear, Stripe, Vercel level premium UI
**Domain**: ${domain === 'golf' ? 'GolfHelm - College golf team management' : 'BaseballHelm - College recruiting platform'}

## ROUTE BEING FIXED

**Path**: \`${route}\`
**Route Type**: ${routeContext.routeType || 'page'}
${routeContext.purpose ? `**Purpose**: ${routeContext.purpose}` : ''}
${routeContext.expectedComponents?.length ? `**Expected Components**: ${routeContext.expectedComponents.join(', ')}` : ''}
${routeContext.mustHave?.length ? `**Must-Have Features**: ${routeContext.mustHave.join(', ')}` : ''}

## ISSUE TO FIX

**Title**: ${title}
**Type**: ${type === 'issues' ? '🔴 Bug/Issue' : type === 'ui' ? '🟡 UI Enhancement' : '🟢 Feature'}
**Description**: ${description || 'No description provided'}
**Why It Matters**: ${why || 'Affects user experience'}
**Expected After Fix**: ${result || 'Improved functionality'}

${quickFix ? `
## QUICK FIX DETECTED ⚡

This appears to be a quick fix issue!
**Suggested Fix**: ${quickFix.fix}
**Estimated Time**: ${quickFix.effort}

Generate a focused, minimal fix rather than a full refactor.
` : ''}

## DESIGN SYSTEM (MUST FOLLOW)

### Spacing Scale (ONLY these values)
${designSystem.spacing?.scale?.join(', ') || '4, 8, 12, 16, 24, 32, 48, 64'}px
Use: gap-1=4px, gap-2=8px, gap-3=12px, gap-4=16px, gap-6=24px, gap-8=32px, gap-12=48px, gap-16=64px

### Border Radius
- Input: 8px (rounded-lg)
- Button: 12px (rounded-xl)
- Card: 16px (rounded-2xl)
- Modal: 24px (rounded-3xl)
- Badge: 9999px (rounded-full)

### Glass Effects
**ALLOWED ONLY ON**: Navigation, Toolbar, Modal backdrop, Side panels
**NEVER USE ON**: Tables, Forms, Data cards, Long content

**Glass Classes**:
- glass-subtle: rgba(255,255,255,0.55) blur-12
- glass-standard: rgba(255,255,255,0.7) blur-16
- glass-prominent: rgba(255,255,255,0.8) blur-20

### Transitions
- Micro (hover): 150ms
- Small (dropdown): 220ms
- Medium (modal): 320ms
- Easing: cubic-bezier(0.16, 1, 0.3, 1)

### Colors
- Primary: green-600 (#16a34a), hover: green-500
- Background: slate-50
- Text: slate-900, secondary: slate-600, tertiary: slate-400
- Border: slate-200, hover: slate-300

## CODE PATTERNS

### Imports
\`\`\`tsx
// Types - ALWAYS from @/lib/types
import type { Player, Coach } from '@/lib/types';

// Supabase - server vs client
// Server components/actions:
import { createClient } from '@/lib/supabase/server';
// Client components:
import { createClient } from '@/lib/supabase/client';

// Components
import { Button, Input, Modal } from '@/components/ui';
\`\`\`

### Client Components
Add \`'use client'\` at top if using: useState, useEffect, useRef, onClick, onChange

${code ? `
## CURRENT CODE (for reference)
\`\`\`tsx
${code.slice(0, 4000)}
\`\`\`
` : ''}

## YOUR TASK

Generate a DETAILED implementation guide with:

1. **Overview** - What we're fixing and why (2-3 sentences)

2. **Files to Modify** - Exact paths, e.g., \`src/app${route}/page.tsx\`

3. **Complete Implementation** - FULL production-ready code
   - All imports
   - All TypeScript types
   - Complete component code
   - Proper Tailwind classes
   - Framer Motion animations (if UI)
   - ARIA labels and accessibility
   - Mobile responsive

4. **Integration Notes** - How this connects to existing code

5. **Verification Steps** - How to test the fix worked

## OUTPUT FORMAT

\`\`\`markdown
# Implementation: ${title}

## Overview
[2-3 sentences explaining the fix]

## Files

### \`src/app${route}/[filename].tsx\`
[Complete file content]

### [Additional files if needed]

## Verification
1. [Step to verify]
2. [Step to verify]
\`\`\`

Remember: Generate COMPLETE, COPY-PASTE READY code. Quality of Linear/Stripe.`;
  }

  /**
   * Fallback MD when API fails
   */
  generateFallbackMD(options) {
    const { title, type, route, description, why, result, quickFix } = options;
    
    let content = `# Implementation: ${title}

## Route
\`${route}\`

## Issue
${description || 'No description provided'}

## Why This Matters
${why || 'This affects user experience'}

## Expected Result
${result || 'Improved functionality'}
`;

    if (quickFix) {
      content += `
## Quick Fix ⚡
${quickFix.fix}

Estimated time: ${quickFix.effort}
`;
    }

    content += `
## Implementation Steps

1. Open the route file at \`src/app${route}/page.tsx\`
2. Implement the fix as described above
3. Follow the design system rules (spacing, colors, transitions)
4. Test the changes
5. Verify the issue is resolved

---
*Generated by Ship Command Hub - Enhanced MD Generator v2*
`;

    return {
      title,
      type,
      route,
      content,
      quickFix,
      generatedAt: Date.now(),
      isFallback: true,
    };
  }

  /**
   * Generate batch MD for multiple related issues
   */
  async generateBatchMD(issues, route, options = {}) {
    const { screenshot, code } = options;
    
    const routeContext = this.knowledge.getRouteContext(route);
    const domain = this.knowledge.getRouteDomain(route);
    
    const issueList = issues.map((issue, i) => 
      `${i + 1}. **${issue.title}**: ${issue.description || issue.summary || ''}`
    ).join('\n');
    
    const prompt = `You are a senior developer fixing MULTIPLE issues in one pass.

## Route: \`${route}\`
## Domain: ${domain}

## Issues to Fix (in one implementation):
${issueList}

Generate ONE comprehensive implementation that fixes ALL issues together.
This should be more efficient than fixing each separately.

Follow all design system rules and generate complete, production-ready code.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      });

      return {
        title: `Batch Fix: ${issues.length} issues on ${route}`,
        type: 'batch',
        route,
        issues: issues.map(i => i.title),
        content: response.content[0].text,
        generatedAt: Date.now(),
      };
    } catch (error) {
      return {
        title: `Batch Fix: ${issues.length} issues`,
        route,
        content: `# Batch Fix Failed\n\nFix each issue individually:\n${issueList}`,
        generatedAt: Date.now(),
        isFallback: true,
      };
    }
  }
}

export default MDGeneratorAgent;
