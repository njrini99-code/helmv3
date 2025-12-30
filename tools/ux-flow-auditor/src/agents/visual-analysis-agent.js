/**
 * VisualAnalysisAgent - Analyzes screenshots using Claude Vision
 * 
 * NOW POWERED BY comprehensive project knowledge:
 * - Design system (spacing, colors, glass rules, transitions)
 * - Route context (expected components, must-haves)
 * - Domain knowledge (baseball recruiting, golf team management)
 * 
 * Capabilities:
 * - Screenshot analysis (what it SEES)
 * - UI issue detection (spacing, alignment, contrast)
 * - UX improvement suggestions
 * - Feature opportunity detection
 * - Accessibility observations
 * - Mobile responsiveness checks
 */

import { BaseAgent } from './coordination/base-agent.js';
import Anthropic from '@anthropic-ai/sdk';
import HelmKnowledge from '../knowledge/index.js';
import { promises as fs } from 'fs';
import path from 'path';

export class VisualAnalysisAgent extends BaseAgent {
  constructor(config) {
    super('visual-analysis', [
      'screenshot-analysis',
      'ui-suggestions',
      'ux-improvements',
      'feature-detection',
      'visual-scoring',
      'accessibility-visual',
      'responsive-check',
      'knowledge-powered',
    ]);
    
    this.projectRoot = config.projectRoot;
    this.codebaseGraph = config.codebaseGraph;
    this.memory = config.memory;
    
    // Knowledge system integration
    this.knowledge = HelmKnowledge;
    
    // Initialize Anthropic client
    this.anthropic = new Anthropic();
    
    // Analysis cache to avoid re-analyzing unchanged screenshots
    this.analysisCache = new Map();
  }

  /**
   * Analyze a route combining screenshot + code + knowledge
   */
  async analyzeRoute(routePath, screenshotData, codeContent) {
    this.log('info', `Analyzing route: ${routePath}`);
    
    try {
      // Check cache
      const cacheKey = `${routePath}-${screenshotData?.capturedAt || Date.now()}`;
      if (this.analysisCache.has(cacheKey)) {
        this.log('info', 'Returning cached analysis');
        return this.analysisCache.get(cacheKey);
      }
      
      // Get knowledge context for this route
      const routeContext = this.knowledge.getRouteContext(routePath);
      const domain = this.knowledge.getRouteDomain(routePath);
      const domainKnowledge = this.knowledge.getDomain(domain);
      const designSystem = this.knowledge.getDesignSystem();
      
      // Pre-validate code if available
      const codeIssues = codeContent ? this.knowledge.validateCode(codeContent, routePath) : [];
      const uiIssues = codeContent ? this.knowledge.validateUI(codeContent) : [];
      
      // Get screenshot as base64
      const desktopImage = screenshotData?.desktop;
      const mobileImage = screenshotData?.mobile;
      
      if (!desktopImage) {
        this.log('warn', 'No screenshot available for analysis');
        return this.getFallbackAnalysis(routePath, codeContent, codeIssues, uiIssues);
      }
      
      // Build knowledge-enhanced analysis prompt
      const prompt = this.buildKnowledgeEnhancedPrompt(
        routePath, 
        codeContent, 
        routeContext, 
        domainKnowledge, 
        designSystem
      );
      
      // Prepare image content
      const imageContent = [];
      
      // Add desktop screenshot
      if (desktopImage) {
        imageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: desktopImage.replace(/^data:image\/\w+;base64,/, ''),
          },
        });
      }
      
      // Add mobile screenshot if available
      if (mobileImage) {
        imageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: mobileImage.replace(/^data:image\/\w+;base64,/, ''),
          },
        });
      }
      
      // Add text prompt
      imageContent.push({
        type: 'text',
        text: prompt,
      });
      
      // Call Claude Vision API
      this.log('info', 'Calling Claude Vision API with knowledge context...');
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: imageContent,
          },
        ],
      });
      
      // Parse response
      const analysis = this.parseAnalysisResponse(response.content[0].text);
      
      // Merge with knowledge-validated issues
      analysis.issues = [
        ...(analysis.issues || []),
        ...codeIssues.map(i => ({
          category: 'code',
          severity: i.severity,
          title: i.type,
          description: i.message,
          location: 'Code',
          suggestedFix: i.fix,
          source: 'knowledge-system',
        })),
        ...uiIssues.map(i => ({
          category: 'ui',
          severity: i.severity,
          title: i.type,
          description: i.message,
          location: 'UI',
          suggestedFix: i.fix,
          source: 'knowledge-system',
        })),
      ];
      
      // Calculate final scores
      analysis.scores = this.calculateScores(analysis);
      
      // Format for dashboard
      const result = {
        routePath,
        timestamp: Date.now(),
        versionId: `v-${Date.now()}`,
        analysis,
        suggestions: this.formatSuggestions(analysis),
        scores: analysis.scores,
        knowledgeContext: {
          domain,
          expectedComponents: routeContext.expectedComponents,
          mustHaves: routeContext.mustHave,
        },
      };
      
      // Cache result
      this.analysisCache.set(cacheKey, result);
      
      // Share discovery
      this.discover({
        summary: `Analyzed ${routePath}: Score ${analysis.scores.overall}/100, ${result.suggestions.length} suggestions`,
        routePath,
        score: analysis.scores.overall,
        suggestionCount: result.suggestions.length,
        domain,
      });
      
      this.log('success', `Analysis complete: ${analysis.scores.overall}/100`);
      
      return result;
      
    } catch (error) {
      this.log('error', `Analysis failed: ${error.message}`);
      return this.getFallbackAnalysis(routePath, codeContent, [], [], error.message);
    }
  }

  /**
   * Build knowledge-enhanced prompt for Claude Vision
   */
  buildKnowledgeEnhancedPrompt(routePath, codeContent, routeContext, domainKnowledge, designSystem) {
    return `You are a senior full-stack developer and UI/UX expert analyzing a Helm Sports Labs application.

## Project Context

**Platform**: Helm Sports Labs - Premium multi-sport SaaS
**Domain**: ${domainKnowledge?.name || 'Sports Tech'}
${domainKnowledge?.description ? `**Description**: ${domainKnowledge.description}` : ''}

### Domain Knowledge
${domainKnowledge?.coreWorkflow ? `**Core Workflow**: ${domainKnowledge.coreWorkflow.join(' → ')}` : ''}
${domainKnowledge?.terminology ? `**Key Terms**: ${Object.entries(domainKnowledge.terminology).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}

## Route Being Analyzed
**Path**: ${routePath}
${routeContext.description ? `**Purpose**: ${routeContext.description}` : ''}
${routeContext.expectedComponents?.length ? `**Expected Components**: ${routeContext.expectedComponents.join(', ')}` : ''}
${routeContext.mustHave?.length ? `**Must-Have Features**: ${routeContext.mustHave.join(', ')}` : ''}
${routeContext.antiPatterns?.length ? `**Anti-Patterns to Avoid**: ${routeContext.antiPatterns.join(', ')}` : ''}

## Design System Rules

**Spacing Scale**: ${designSystem.spacing?.scale?.join('px, ') || '4, 8, 12, 16, 24, 32, 48, 64'}px
**Border Radius**: Input ${designSystem.borderRadius?.input || 8}px, Button ${designSystem.borderRadius?.button || 12}px, Card ${designSystem.borderRadius?.card || 16}px
**Transitions**: Hover ${designSystem.motion?.hover || 150}ms, State ${designSystem.motion?.state || 220}ms
**Glass Effects**: ONLY allowed on nav, toolbar, modal, sidebar - NEVER on tables, forms, card content

**Colors**:
- Background: ${designSystem.colors?.background || '#0a0a0f'}
- Surface: ${designSystem.colors?.surface || '#111118'}
- Accent: ${designSystem.colors?.accent || '#6366f1'}
- Success: #10b981, Warning: #f59e0b, Error: #ef4444

## Task

Analyze the screenshot(s) against our design system and domain requirements.

### 1. Design System Compliance
- Check spacing follows our scale (4, 8, 12, 16, 24, 32, 48, 64)
- Verify border radius consistency
- Check glass effects are ONLY on nav/toolbar (not tables/forms)
- Verify animation timing appears correct

### 2. Domain-Specific UX
- Does this screen support the ${domainKnowledge?.name || 'sports'} workflow?
- Are the expected components present?
- Does terminology match our domain?
- Are must-have features visible?

### 3. Premium Quality Check
- Does this look like a $1B SaaS product (Linear, Stripe, Vercel quality)?
- Is the visual hierarchy clear?
- Are interactions obvious?
- Is the empty state handled elegantly?

### 4. Issues & Opportunities
- What violates our design system?
- What's missing that users expect?
- What would make this more premium?

${codeContent ? `
## Code Context
\`\`\`tsx
${codeContent.slice(0, 1500)}
\`\`\`
` : ''}

## Response Format

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "overallImpression": "1-2 sentence summary referencing our design system",
  "designSystemCompliance": {
    "spacing": "compliant|violations found",
    "borderRadius": "compliant|violations found",
    "glassEffects": "compliant|violations found",
    "colors": "compliant|violations found"
  },
  "scores": {
    "visualDesign": 0-100,
    "usability": 0-100,
    "completeness": 0-100,
    "accessibility": 0-100,
    "mobile": 0-100,
    "designSystemCompliance": 0-100
  },
  "issues": [
    {
      "category": "design-system|ux|a11y|domain",
      "severity": "error|warning|info",
      "title": "Short title",
      "description": "What's wrong relative to our system",
      "location": "Where in the UI",
      "suggestedFix": "Specific fix using our patterns"
    }
  ],
  "missingMustHaves": ["Features from must-have list that are missing"],
  "featureOpportunities": [
    {
      "title": "Feature name",
      "description": "What it does",
      "rationale": "Why ${domainKnowledge?.name || 'sports'} users need it",
      "complexity": "low|medium|high"
    }
  ],
  "positives": ["Good things about the design"]
}`;
  }

  /**
   * Parse Claude's response
   */
  parseAnalysisResponse(responseText) {
    try {
      // Try to extract JSON from response
      let jsonStr = responseText;
      
      // If wrapped in markdown code block, extract it
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      
      // Clean up
      jsonStr = jsonStr.trim();
      
      return JSON.parse(jsonStr);
    } catch (error) {
      this.log('warn', `Failed to parse JSON response: ${error.message}`);
      
      // Return a structured fallback
      return {
        overallImpression: responseText.slice(0, 200),
        scores: {
          visualDesign: 70,
          usability: 70,
          completeness: 70,
          accessibility: 70,
          mobile: 70,
          designSystemCompliance: 70,
        },
        issues: [],
        featureOpportunities: [],
        positives: [],
        parseError: true,
      };
    }
  }

  /**
   * Calculate overall scores
   */
  calculateScores(analysis) {
    const scores = analysis.scores || {};
    
    // Weight design system compliance higher
    const weights = {
      visualDesign: 0.2,
      usability: 0.2,
      completeness: 0.15,
      accessibility: 0.15,
      mobile: 0.1,
      designSystemCompliance: 0.2,
    };
    
    let overall = 0;
    for (const [key, weight] of Object.entries(weights)) {
      overall += (scores[key] || 70) * weight;
    }
    
    // Penalize for issues
    const issuePenalty = (analysis.issues || []).length * 2;
    overall = Math.max(0, Math.round(overall - issuePenalty));
    
    return {
      ...scores,
      overall,
    };
  }

  /**
   * Format suggestions for dashboard
   */
  formatSuggestions(analysis) {
    const suggestions = [];
    
    // Convert issues to suggestions
    for (const issue of analysis.issues || []) {
      suggestions.push({
        type: issue.category,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        fix: issue.suggestedFix,
        source: issue.source || 'visual-analysis',
      });
    }
    
    // Add missing must-haves as suggestions
    for (const missing of analysis.missingMustHaves || []) {
      suggestions.push({
        type: 'completeness',
        severity: 'warning',
        title: `Missing: ${missing}`,
        description: `This route should have: ${missing}`,
        fix: `Add ${missing} to the route`,
        source: 'knowledge-system',
      });
    }
    
    // Add feature opportunities as info suggestions
    for (const feature of analysis.featureOpportunities || []) {
      suggestions.push({
        type: 'opportunity',
        severity: 'info',
        title: feature.title,
        description: feature.description,
        fix: feature.rationale,
        complexity: feature.complexity,
        source: 'visual-analysis',
      });
    }
    
    return suggestions;
  }

  /**
   * Fallback analysis when no screenshot available
   */
  getFallbackAnalysis(routePath, codeContent, codeIssues = [], uiIssues = [], error = null) {
    const routeContext = this.knowledge.getRouteContext(routePath);
    const domain = this.knowledge.getRouteDomain(routePath);
    
    return {
      routePath,
      timestamp: Date.now(),
      versionId: `v-${Date.now()}`,
      analysis: {
        overallImpression: error 
          ? `Analysis skipped: ${error}` 
          : 'No screenshot available - code analysis only',
        scores: {
          visualDesign: null,
          usability: null,
          completeness: 70,
          accessibility: null,
          mobile: null,
          designSystemCompliance: codeIssues.length === 0 && uiIssues.length === 0 ? 90 : 60,
          overall: null,
        },
        issues: [
          ...codeIssues.map(i => ({
            category: 'code',
            severity: i.severity,
            title: i.type,
            description: i.message,
            suggestedFix: i.fix,
            source: 'knowledge-system',
          })),
          ...uiIssues.map(i => ({
            category: 'ui',
            severity: i.severity,
            title: i.type,
            description: i.message,
            suggestedFix: i.fix,
            source: 'knowledge-system',
          })),
        ],
      },
      suggestions: [],
      scores: { overall: null },
      knowledgeContext: {
        domain,
        expectedComponents: routeContext.expectedComponents,
        mustHaves: routeContext.mustHave,
      },
      noScreenshot: true,
      error,
    };
  }

  /**
   * Get status summary
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      capabilities: this.capabilities,
      cacheSize: this.analysisCache.size,
      knowledgePowered: true,
    };
  }
}

export default VisualAnalysisAgent;
