/**
 * ContinuousImprovementAgent - Never-ending improvement discovery
 * 
 * KNOWLEDGE-POWERED agent that:
 * - Continuously scans routes for improvements
 * - Finds UI enhancements and feature opportunities
 * - Generates detailed implementation MDs
 * - Learns from previous fixes to improve suggestions
 * 
 * Works with:
 * - Screenshots (visual analysis)
 * - Code (pattern analysis)  
 * - Route context (expected features)
 * - Domain knowledge (baseball/golf specifics)
 */

import { BaseAgent } from './coordination/base-agent.js';
import Anthropic from '@anthropic-ai/sdk';
import HelmKnowledge from '../knowledge/index.js';

export class ContinuousImprovementAgent extends BaseAgent {
  constructor(config = {}) {
    super('continuous-improvement', [
      'ui-improvements',
      'feature-discovery',
      'implementation-generation',
      'visual-analysis',
      'never-ending-scan',
    ]);
    
    this.projectRoot = config.projectRoot;
    this.knowledge = HelmKnowledge;
    this.anthropic = new Anthropic();
    
    // Track what we've already suggested to avoid duplicates
    this.suggestedImprovements = new Map(); // route -> Set of improvement IDs
    this.skippedImprovements = new Map(); // route -> Set of skipped IDs
    
    // Cache of improvements per route
    this.improvementCache = new Map();
  }

  async start(sharedState) {
    super.start(sharedState);
    this.log('info', 'Continuous Improvement Agent ready');
  }

  /**
   * Find the next improvement for a route
   */
  async findNextImprovement(routePath, options = {}) {
    const { screenshot, code, skipId } = options;
    
    this.log('info', `Finding improvement for ${routePath}`);
    
    // Track skipped
    if (skipId) {
      if (!this.skippedImprovements.has(routePath)) {
        this.skippedImprovements.set(routePath, new Set());
      }
      this.skippedImprovements.get(routePath).add(skipId);
    }
    
    // Get already suggested and skipped
    const suggested = this.suggestedImprovements.get(routePath) || new Set();
    const skipped = this.skippedImprovements.get(routePath) || new Set();
    const excluded = new Set([...suggested, ...skipped]);
    
    // Get knowledge context
    const routeContext = this.knowledge.getRouteContext(routePath);
    const domain = this.knowledge.getRouteDomain(routePath);
    const domainKnowledge = this.knowledge.getDomain(domain);
    const designSystem = this.knowledge.getDesignSystem();
    
    // Validate code if available
    let codeIssues = [];
    let uiIssues = [];
    if (code) {
      codeIssues = this.knowledge.validateCode(code, routePath) || [];
      uiIssues = this.knowledge.validateUI(code) || [];
    }
    
    // Build prompt for Claude
    const prompt = this.buildImprovementPrompt(
      routePath,
      routeContext,
      domainKnowledge,
      designSystem,
      codeIssues,
      uiIssues,
      excluded,
      screenshot,
      code
    );
    
    try {
      const messages = [{
        role: 'user',
        content: screenshot ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.replace(/^data:image\/\w+;base64,/, ''),
            },
          },
          { type: 'text', text: prompt },
        ] : prompt,
      }];
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages,
      });
      
      const result = this.parseImprovementResponse(response.content[0].text);
      
      if (result) {
        // Track as suggested
        if (!this.suggestedImprovements.has(routePath)) {
          this.suggestedImprovements.set(routePath, new Set());
        }
        this.suggestedImprovements.get(routePath).add(result.id);
        
        this.log('success', `Found improvement: ${result.title}`);
        
        return {
          ...result,
          route: routePath,
          domain,
          routeContext,
        };
      }
      
      return null;
    } catch (error) {
      this.log('error', `Failed to find improvement: ${error.message}`);
      return null;
    }
  }

  /**
   * Build the prompt for finding improvements
   */
  buildImprovementPrompt(routePath, routeContext, domainKnowledge, designSystem, codeIssues, uiIssues, excluded, hasScreenshot, hasCode) {
    const excludedList = Array.from(excluded).join(', ') || 'none';
    
    return `You are a senior full-stack developer and UI/UX expert analyzing a route in Helm Sports Labs.

## Project Context

**Platform**: Helm Sports Labs - Premium multi-sport SaaS
**Domain**: ${domainKnowledge?.name || 'Sports Tech'}
${domainKnowledge?.description ? `**Description**: ${domainKnowledge.description}` : ''}
**Quality Target**: Linear, Stripe, Vercel level premium UI

## Route Being Analyzed
**Path**: ${routePath}
${routeContext.description ? `**Purpose**: ${routeContext.description}` : ''}
${routeContext.expectedComponents?.length ? `**Expected Components**: ${routeContext.expectedComponents.join(', ')}` : ''}
${routeContext.mustHave?.length ? `**Must-Have Features**: ${routeContext.mustHave.join(', ')}` : ''}

## Design System
- Spacing: ${designSystem.spacing?.scale?.join(', ') || '4, 8, 12, 16, 24, 32, 48, 64'}px
- Border Radius: Input 8px, Button 12px, Card 16px, Modal 24px
- Glass Effects: ONLY on nav/toolbar, NEVER on tables/forms
- Transitions: hover 150ms, state 220ms, modal 300ms
- Colors: bg #0a0a0f, surface #111118, accent #6366f1

## Known Issues from Code Analysis
${codeIssues.length > 0 ? codeIssues.slice(0, 5).map(i => `- ${i.message}`).join('\n') : 'None detected'}

## Known UI Issues
${uiIssues.length > 0 ? uiIssues.slice(0, 5).map(i => `- ${i.message}`).join('\n') : 'None detected'}

## Already Suggested (DO NOT REPEAT)
${excludedList}

## Your Task

Find ONE impactful improvement for this route. This could be:
1. **UI Enhancement** - Better animations, spacing, visual polish, microinteractions
2. **Feature Enhancement** - Missing functionality, better UX patterns, new capabilities

${hasScreenshot ? 'IMPORTANT: Analyze the screenshot to find visual improvements.' : ''}
${hasCode ? 'IMPORTANT: Consider the code structure for feature improvements.' : ''}

Choose something that will meaningfully improve the user experience or developer experience.

## Response Format

Respond ONLY with this JSON (no markdown, no explanation):
{
  "id": "unique-improvement-id",
  "type": "ui|features",
  "title": "Short improvement title",
  "description": "2-3 sentence description of what to improve and why",
  "impact": 70,
  "category": "animation|spacing|interaction|navigation|data|forms|accessibility",
  "summary": "One sentence summary",
  "why": "Why this matters for users",
  "result": "What the result will be after implementing"
}

The impact score should be 1-100 based on user benefit vs effort.`;
  }

  /**
   * Parse Claude's response
   */
  parseImprovementResponse(text) {
    try {
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      jsonStr = jsonStr.trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      this.log('warn', `Failed to parse response: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate detailed implementation MD for an improvement
   */
  async generateImplementationMd(improvement, options = {}) {
    const { screenshot, code, route } = options;
    
    this.log('info', `Generating MD for: ${improvement.title}`);
    
    // Get knowledge context
    const routeContext = this.knowledge.getRouteContext(route);
    const domain = this.knowledge.getRouteDomain(route);
    const domainKnowledge = this.knowledge.getDomain(domain);
    const designSystem = this.knowledge.getDesignSystem();
    
    const prompt = this.buildMdPrompt(improvement, routeContext, domainKnowledge, designSystem, code, route);
    
    try {
      const messages = [{
        role: 'user',
        content: screenshot ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.replace(/^data:image\/\w+;base64,/, ''),
            },
          },
          { type: 'text', text: prompt },
        ] : prompt,
      }];
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
      messages,
      });
      
      const md = response.content[0].text;
      
      this.log('success', `Generated MD: ${md.length} characters`);
      
      return {
        title: improvement.title,
        type: improvement.type,
        route,
        content: md,
        improvement,
        generatedAt: Date.now(),
      };
    } catch (error) {
      this.log('error', `Failed to generate MD: ${error.message}`);
      return null;
    }
  }

  /**
   * Build the prompt for generating implementation MD
   */
  buildMdPrompt(improvement, routeContext, domainKnowledge, designSystem, code, route) {
    return `You are a senior full-stack developer creating an EXTREMELY detailed implementation guide.

## Context

**Route**: ${route}
**Domain**: ${domainKnowledge?.name || 'Sports Tech'}
**Platform**: Helm Sports Labs (Next.js 14 + TypeScript + Tailwind + Supabase)

## Improvement to Implement

**Title**: ${improvement.title}
**Type**: ${improvement.type === 'ui' ? 'UI Enhancement' : 'Feature Enhancement'}
**Description**: ${improvement.description}
**Why It Matters**: ${improvement.why}
**Expected Result**: ${improvement.result}

## Design System Requirements

- Spacing Scale: ${designSystem.spacing?.scale?.join(', ') || '4, 8, 12, 16, 24, 32, 48, 64'}px
- Border Radius: Input 8px, Button 12px, Card 16px, Modal 24px
- Colors: 
  - Background: #0a0a0f
  - Surface: #111118  
  - Accent: #6366f1
  - Success: #10b981
  - Warning: #f59e0b
  - Error: #ef4444
- Glass Effects: ONLY on nav, toolbar, modal, sidebar - NEVER on tables/forms
- Transitions: hover 150ms, state 220ms, modal 300ms
- Animation: use framer-motion for complex animations

## Route Context

${routeContext.description ? `Purpose: ${routeContext.description}` : ''}
${routeContext.expectedComponents?.length ? `Expected Components: ${routeContext.expectedComponents.join(', ')}` : ''}

${code ? `## Current Code (for reference)
\`\`\`tsx
${code.slice(0, 3000)}
\`\`\`` : ''}

## Your Task

Generate an EXTREMELY DETAILED implementation guide that can be copy-pasted into Cursor/Claude Code.

The guide MUST include:

1. **File Path** - Exact file(s) to create or modify
2. **Full Code** - Complete, production-ready code (not pseudocode)
3. **Imports** - All necessary imports
4. **Types** - TypeScript types/interfaces
5. **Components** - Full component code with proper styling
6. **Animations** - Framer Motion animations if applicable
7. **Accessibility** - ARIA labels, keyboard navigation
8. **Responsive** - Mobile-first responsive design
9. **Integration** - How it connects to existing code
10. **Testing Notes** - What to verify after implementing

## Format

Write the guide as a markdown document that starts with:

\`\`\`markdown
# Implementation: ${improvement.title}

## Overview
[Brief description]

## Files to Modify/Create
[List of files]

## Implementation

### Step 1: [First step]
[Detailed explanation + full code]

### Step 2: [Second step]
[Detailed explanation + full code]

[... continue for all steps ...]

## Verification
[How to test the implementation]
\`\`\`

Make the code COMPLETE and PRODUCTION-READY. Include EVERY line of code needed.
Use the exact design system values. Match the premium aesthetic of Linear/Stripe.`;
  }

  /**
   * Analyze a route comprehensively (initial scan)
   */
  async analyzeRoute(routePath, options = {}) {
    const { screenshot, code } = options;
    
    this.log('info', `Full analysis of ${routePath}`);
    
    // Get knowledge context
    const routeContext = this.knowledge.getRouteContext(routePath);
    const domain = this.knowledge.getRouteDomain(routePath);
    const domainKnowledge = this.knowledge.getDomain(domain);
    const designSystem = this.knowledge.getDesignSystem();
    
    // Validate code
    let codeIssues = [];
    let uiIssues = [];
    if (code) {
      codeIssues = this.knowledge.validateCode(code, routePath) || [];
      uiIssues = this.knowledge.validateUI(code) || [];
    }
    
    // Build analysis prompt
    const prompt = this.buildAnalysisPrompt(routePath, routeContext, domainKnowledge, designSystem, codeIssues, uiIssues, screenshot, code);
    
    try {
      const messages = [{
        role: 'user',
        content: screenshot ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.replace(/^data:image\/\w+;base64,/, ''),
            },
          },
          { type: 'text', text: prompt },
        ] : prompt,
      }];
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages,
      });
      
      const analysis = this.parseAnalysisResponse(response.content[0].text);
      
      if (analysis) {
        // Add knowledge-derived issues
        analysis.issues = [
          ...(analysis.issues || []),
          ...codeIssues.map(i => ({
            id: `code-${i.type}-${Date.now()}`,
            title: i.message,
            summary: i.message,
            why: 'Code quality issue detected by knowledge system',
            result: i.fix,
            source: 'knowledge-system',
            severity: i.severity,
          })),
        ];
        
        analysis.uiEnhancements = [
          ...(analysis.uiEnhancements || []),
          ...uiIssues.map(i => ({
            id: `ui-${i.type}-${Date.now()}`,
            title: i.message,
            summary: i.message,
            why: 'Design system violation',
            result: i.fix,
            source: 'knowledge-system',
          })),
        ];
        
        analysis.route = routePath;
        analysis.domain = domain;
        analysis.routeContext = routeContext;
        analysis.analyzed = true;
        
        this.log('success', `Analysis complete: ${analysis.issues?.length || 0} issues, ${analysis.uiEnhancements?.length || 0} UI, ${analysis.featureEnhancements?.length || 0} features`);
        
        return analysis;
      }
      
      return null;
    } catch (error) {
      this.log('error', `Analysis failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build comprehensive analysis prompt
   */
  buildAnalysisPrompt(routePath, routeContext, domainKnowledge, designSystem, codeIssues, uiIssues, hasScreenshot, hasCode) {
    return `You are a senior full-stack developer analyzing a route in Helm Sports Labs.

## Project Context

**Platform**: Helm Sports Labs - Premium multi-sport SaaS
**Domain**: ${domainKnowledge?.name || 'Sports Tech'}
${domainKnowledge?.description ? `**Description**: ${domainKnowledge.description}` : ''}
**Quality Target**: Linear, Stripe, Vercel level premium UI

## Route Being Analyzed
**Path**: ${routePath}
${routeContext.description ? `**Purpose**: ${routeContext.description}` : ''}
${routeContext.expectedComponents?.length ? `**Expected Components**: ${routeContext.expectedComponents.join(', ')}` : ''}
${routeContext.mustHave?.length ? `**Must-Have Features**: ${routeContext.mustHave.join(', ')}` : ''}
${routeContext.antiPatterns?.length ? `**Anti-Patterns to Avoid**: ${routeContext.antiPatterns.join(', ')}` : ''}

## Design System
- Spacing: ${designSystem.spacing?.scale?.join(', ') || '4, 8, 12, 16, 24, 32, 48, 64'}px
- Glass Effects: ONLY on nav/toolbar, NEVER on tables/forms
- Transitions: hover 150ms, state 220ms

## Known Code Issues
${codeIssues.length > 0 ? codeIssues.map(i => `- ${i.message}`).join('\n') : 'None detected'}

## Known UI Issues
${uiIssues.length > 0 ? uiIssues.map(i => `- ${i.message}`).join('\n') : 'None detected'}

## Your Task

Analyze this route and categorize ALL issues and opportunities into THREE categories:

1. **Issues** (🔴 Red) - Bugs, dead code, broken functionality, unfinished features
2. **UI Enhancements** (🟡 Yellow) - Visual polish, animations, spacing, interactions
3. **Feature Enhancements** (🟢 Green) - New functionality, missing features, UX improvements

${hasScreenshot ? 'IMPORTANT: Analyze the screenshot carefully for visual issues.' : ''}
${hasCode ? 'IMPORTANT: Analyze the code for dead code, bugs, and unfinished features.' : ''}

## Response Format

Respond ONLY with this JSON (no markdown):
{
  "issues": [
    {
      "id": "issue-1",
      "title": "Short title",
      "summary": "Brief description",
      "why": "Why this is a problem",
      "result": "What fixing it achieves"
    }
  ],
  "uiEnhancements": [
    {
      "id": "ui-1",
      "title": "Short title",
      "summary": "Brief description",
      "why": "Why this improves UX",
      "result": "Visual/interaction improvement"
    }
  ],
  "featureEnhancements": [
    {
      "id": "feature-1", 
      "title": "Short title",
      "summary": "Brief description",
      "why": "Why users need this",
      "result": "Feature benefit"
    }
  ]
}

Find at least 2-3 items per category. Be thorough but realistic.`;
  }

  /**
   * Parse analysis response
   */
  parseAnalysisResponse(text) {
    try {
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      jsonStr = jsonStr.trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      this.log('warn', `Failed to parse analysis: ${error.message}`);
      return {
        issues: [],
        uiEnhancements: [],
        featureEnhancements: [],
      };
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      capabilities: this.capabilities,
      routesAnalyzed: this.suggestedImprovements.size,
      totalSuggestions: Array.from(this.suggestedImprovements.values())
        .reduce((sum, set) => sum + set.size, 0),
      knowledgePowered: true,
    };
  }
}

export default ContinuousImprovementAgent;
