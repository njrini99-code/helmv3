/**
 * AgentRouter - Click-to-fix routing
 * 
 * Routes user actions to the appropriate agent and generates
 * context-aware prompts for Claude Code execution.
 * 
 * Features:
 * - Routes issues to best agent
 * - Generates fix prompts with context
 * - Tracks routing decisions
 * - Builds fix workflows
 */

import EventEmitter from 'events';

export class AgentRouter extends EventEmitter {
  constructor(coordinator, modeController) {
    super();

    this.coordinator = coordinator;
    this.modeController = modeController;
    
    // Routing rules
    this.routes = {
      // Issue category -> agent mapping
      'ui': ['design-system', 'visual-analysis'],
      'ux': ['route-context', 'visual-analysis'],
      'code': ['code-quality'],
      'a11y': ['visual-analysis', 'code-quality'],
      'perf': ['code-quality'],
      'features': ['route-context', 'megathink'],
      
      // Specific issue types
      'spacing': ['design-system'],
      'color': ['design-system'],
      'typography': ['design-system'],
      'glass': ['design-system'],
      'missing-component': ['route-context'],
      'loading-state': ['route-context', 'code-quality'],
      'error-handling': ['code-quality'],
      'types': ['code-quality'],
      'imports': ['code-quality'],
    };

    // Prompt templates
    this.promptTemplates = {
      fix: this.getFixPromptTemplate(),
      analyze: this.getAnalyzePromptTemplate(),
      improve: this.getImprovePromptTemplate(),
    };

    // Routing history
    this.routingHistory = [];
  }

  /**
   * Route an issue to the best agent
   */
  async routeIssue(issue, context = {}) {
    const category = issue.category || 'ui';
    const type = issue.id?.split('-')[0] || category;

    // Find agents that can handle this
    const agentNames = this.routes[type] || this.routes[category] || ['visual-analysis'];
    
    // Get available agents from coordinator
    const availableAgents = [];
    for (const name of agentNames) {
      const agent = this.coordinator.getAgent(name);
      if (agent && agent.state !== 'error') {
        availableAgents.push(agent);
      }
    }

    if (availableAgents.length === 0) {
      this.emit('routing:failed', { issue, reason: 'No available agents' });
      return null;
    }

    // Select best agent (prefer idle, then by success rate)
    const selectedAgent = availableAgents.sort((a, b) => {
      if (a.state === 'idle' && b.state !== 'idle') return -1;
      if (b.state === 'idle' && a.state !== 'idle') return 1;
      const aRate = a.taskCount > 0 ? a.successCount / a.taskCount : 1;
      const bRate = b.taskCount > 0 ? b.successCount / b.taskCount : 1;
      return bRate - aRate;
    })[0];

    // Record routing decision
    const routing = {
      id: `route-${Date.now()}`,
      issue,
      selectedAgent: selectedAgent.name,
      candidateAgents: agentNames,
      context,
      timestamp: Date.now(),
    };

    this.routingHistory.unshift(routing);
    if (this.routingHistory.length > 50) {
      this.routingHistory = this.routingHistory.slice(0, 50);
    }

    this.emit('routing:complete', routing);

    return {
      agent: selectedAgent,
      routing,
    };
  }

  /**
   * Generate a fix prompt for an issue
   */
  async generateFixPrompt(issue, context = {}) {
    // Get relevant agent recommendations
    const routing = await this.routeIssue(issue, context);
    
    if (!routing) {
      return this.getBasicFixPrompt(issue, context);
    }

    // Get learning recommendations if improvement agent available
    const improvementAgent = this.coordinator.getAgent('improvement');
    let recommendations = null;
    if (improvementAgent) {
      recommendations = improvementAgent.getRecommendation(issue.id || issue.category);
    }

    // Build comprehensive prompt
    const prompt = this.buildPrompt({
      issue,
      context,
      agentName: routing.agent.name,
      recommendations,
    });

    return {
      prompt,
      agent: routing.agent.name,
      recommendations,
    };
  }

  /**
   * Build context-aware prompt
   */
  buildPrompt({ issue, context, agentName, recommendations }) {
    const parts = [];

    // Header
    parts.push(`# Fix Request: ${issue.title}`);
    parts.push('');

    // Issue details
    parts.push('## Issue');
    parts.push(`- **Category**: ${issue.category}`);
    parts.push(`- **Severity**: ${issue.severity}`);
    parts.push(`- **Location**: ${issue.location || context.routePath || 'Unknown'}`);
    parts.push(`- **Description**: ${issue.description}`);
    if (issue.suggestedFix) {
      parts.push(`- **Suggested Fix**: ${issue.suggestedFix}`);
    }
    parts.push('');

    // Route context
    if (context.routePath) {
      parts.push('## Route Context');
      parts.push(`- **Route**: ${context.routePath}`);
      if (context.domain) {
        parts.push(`- **Domain**: ${context.domain}`);
      }
      if (context.type) {
        parts.push(`- **Route Type**: ${context.type}`);
      }
      parts.push('');
    }

    // Code context
    if (context.code) {
      parts.push('## Current Code');
      parts.push('```tsx');
      parts.push(context.code.substring(0, 1500));
      parts.push('```');
      parts.push('');
    }

    // Learning recommendations
    if (recommendations?.hasData) {
      parts.push('## What Has Worked Before');
      
      if (recommendations.recommendations.length > 0) {
        parts.push('### Proven Approaches');
        for (const rec of recommendations.recommendations.slice(0, 3)) {
          parts.push(`- **${rec.approach}**: ${rec.successRate}% success rate (used ${rec.timesUsed} times)`);
        }
        parts.push('');
      }

      if (recommendations.warnings.length > 0) {
        parts.push('### Avoid These Approaches');
        for (const warn of recommendations.warnings) {
          parts.push(`- ⚠️ ${warn.message}`);
        }
        parts.push('');
      }
    }

    // Agent-specific guidance
    parts.push('## Fix Guidelines');
    parts.push(this.getAgentGuidelines(agentName, issue));
    parts.push('');

    // Requirements
    parts.push('## Requirements');
    parts.push('1. Fix the issue described above');
    parts.push('2. Maintain existing functionality');
    parts.push('3. Follow project conventions');
    parts.push('4. Add proper TypeScript types');
    parts.push('5. Include loading/error states if applicable');
    parts.push('');

    return parts.join('\n');
  }

  /**
   * Get agent-specific guidelines
   */
  getAgentGuidelines(agentName, issue) {
    const guidelines = {
      'design-system': `
- Use Tailwind classes only (no inline styles)
- Follow spacing scale: p-4, p-5, p-6 for cards
- Use semantic colors (brand-*, gray-*) not raw hex
- Add transitions for interactive elements
- For glass effects: bg-white/80 backdrop-blur-xl with supports-[] fallback`,

      'code-quality': `
- Remove console.log statements
- Add proper TypeScript types (no 'any')
- Add proper error handling
- Include loading states
- Follow naming conventions (PascalCase for components)`,

      'route-context': `
- Add missing required components
- Include loading skeleton
- Add empty state
- Include error boundary
- Match route type requirements`,

      'visual-analysis': `
- Fix visual issues exactly as described
- Maintain visual hierarchy
- Ensure sufficient contrast
- Test responsive behavior
- Preserve existing animations`,
    };

    return guidelines[agentName] || guidelines['visual-analysis'];
  }

  /**
   * Get basic fix prompt (fallback)
   */
  getBasicFixPrompt(issue, context) {
    return {
      prompt: `# Fix: ${issue.title}

## Issue
${issue.description}

${issue.suggestedFix ? `## Suggested Fix\n${issue.suggestedFix}` : ''}

## Location
${context.routePath || issue.location || 'See code context'}

## Requirements
- Fix the described issue
- Follow project conventions
- Add TypeScript types
- Maintain existing functionality`,
      agent: null,
      recommendations: null,
    };
  }

  /**
   * Get fix prompt template
   */
  getFixPromptTemplate() {
    return `You are fixing a UI/UX issue in a Next.js 14 application.

## Issue
{{issue}}

## Context
{{context}}

## Guidelines
{{guidelines}}

Fix the issue following best practices.`;
  }

  /**
   * Get analyze prompt template
   */
  getAnalyzePromptTemplate() {
    return `Analyze this route for potential issues.

## Route
{{route}}

## Code
{{code}}

Identify issues in: UI, UX, code quality, accessibility, performance.`;
  }

  /**
   * Get improve prompt template
   */
  getImprovePromptTemplate() {
    return `Suggest improvements for this route.

## Route
{{route}}

## Current State
{{state}}

Suggest high-impact, feasible improvements.`;
  }

  /**
   * Get routing history
   */
  getHistory(limit = 20) {
    return this.routingHistory.slice(0, limit);
  }

  /**
   * Get routing statistics
   */
  getStats() {
    const agentCounts = {};
    
    for (const routing of this.routingHistory) {
      agentCounts[routing.selectedAgent] = (agentCounts[routing.selectedAgent] || 0) + 1;
    }

    return {
      totalRoutings: this.routingHistory.length,
      byAgent: agentCounts,
      availableRoutes: Object.keys(this.routes),
    };
  }
}

export default AgentRouter;
