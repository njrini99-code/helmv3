/**
 * AgentRouter - Routes suggestions to the correct agent for prompt generation
 * 
 * When user clicks a suggestion in the dashboard:
 * 1. Determines which agent should handle it
 * 2. Builds comprehensive context
 * 3. Routes to agent for prompt generation
 * 4. Returns prompt for user approval or auto-execution
 */

import EventEmitter from 'events';

export class AgentRouter extends EventEmitter {
  constructor(coordinator, promptGenerator, memory) {
    super();
    
    this.coordinator = coordinator;
    this.promptGenerator = promptGenerator;
    this.memory = memory;
    
    // Category to capability mapping
    this.categoryCapabilities = {
      'ui': 'ui-suggestions',
      'ux': 'ux-improvements',
      'a11y': 'accessibility-visual',
      'perf': 'performance-optimization',
      'code': 'code-fix',
      'feature': 'feature-implementation',
    };
    
    // Capability to preferred agent
    this.capabilityAgents = {
      'ui-suggestions': 'visual-analysis',
      'ux-improvements': 'visual-analysis',
      'accessibility-visual': 'visual-analysis',
      'screenshot-analysis': 'visual-analysis',
      'performance-optimization': 'code-execution',
      'code-fix': 'code-execution',
      'feature-implementation': 'code-execution',
      'learning': 'improvement',
      'pattern-detection': 'improvement',
      'fix-validation': 'improvement',
    };
    
    // Track routing history
    this.routingHistory = [];
  }

  /**
   * Route a suggestion to the appropriate agent
   */
  async routeSuggestion(suggestion, routePath, routeContext = {}) {
    const routeId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    this.emit('routing:start', {
      id: routeId,
      suggestion,
      routePath,
    });
    
    try {
      // Determine capability and agent
      const capability = this.categoryCapabilities[suggestion.category] || 'code-fix';
      const preferredAgent = this.capabilityAgents[capability] || 'code-execution';
      
      // Build comprehensive context
      const context = await this.buildContext(suggestion, routePath, routeContext);
      
      // Get learnings from improvement agent
      let learnings = null;
      if (this.coordinator) {
        try {
          const learningResponse = await this.coordinator.routeQuestion('router', {
            domain: 'learning',
            text: `What do we know about fixing ${suggestion.category} issues like "${suggestion.title}"?`,
            context: { issueType: `${suggestion.category}-${suggestion.type}` },
          });
          learnings = learningResponse;
        } catch (e) {
          // Learnings are optional
        }
      }
      
      // Create the routing request
      const request = {
        id: routeId,
        type: suggestion.type === 'issue' ? 'fix' : 'implement',
        suggestion,
        routePath,
        context,
        learnings,
        capability,
        targetAgent: preferredAgent,
        priority: this.calculatePriority(suggestion),
        timestamp: Date.now(),
      };
      
      // Generate prompt
      const prompt = await this.generatePrompt(request);
      
      // Track routing
      this.routingHistory.push({
        id: routeId,
        suggestion: suggestion.title,
        routePath,
        targetAgent: preferredAgent,
        timestamp: Date.now(),
      });
      
      // Keep history bounded
      if (this.routingHistory.length > 100) {
        this.routingHistory = this.routingHistory.slice(-100);
      }
      
      const result = {
        id: routeId,
        prompt,
        request,
        targetAgent: preferredAgent,
      };
      
      this.emit('routing:complete', result);
      
      return result;
      
    } catch (error) {
      this.emit('routing:error', {
        id: routeId,
        error: error.message,
        suggestion,
        routePath,
      });
      
      throw error;
    }
  }

  /**
   * Build comprehensive context for the agent
   */
  async buildContext(suggestion, routePath, routeContext) {
    // Get similar past fixes from memory
    let similarFixes = [];
    if (this.memory?.getContextFor) {
      const memoryContext = this.memory.getContextFor(
        `${suggestion.category}-${suggestion.type}`,
        routeContext.filePath
      );
      similarFixes = memoryContext?.successfulFixes || [];
    }
    
    return {
      // Route info
      routePath,
      filePath: routeContext.filePath,
      routePurpose: routeContext.purpose || 'Unknown',
      
      // Suggestion details
      suggestionId: suggestion.id,
      category: suggestion.category,
      severity: suggestion.severity,
      title: suggestion.title,
      description: suggestion.description,
      suggestedFix: suggestion.suggestedFix,
      location: suggestion.location,
      
      // Code context
      codeContent: routeContext.codeContent,
      imports: routeContext.imports || [],
      usedComponents: routeContext.usedComponents || [],
      
      // Project patterns
      projectPatterns: routeContext.patterns || [],
      hasGlassmorphism: routeContext.hasGlassmorphism || false,
      hasSuspense: routeContext.hasSuspense || false,
      
      // Visual context
      screenshotPath: routeContext.screenshotPath,
      visualScore: routeContext.visualScore,
      
      // Historical context
      similarFixes,
    };
  }

  /**
   * Generate prompt for the fix
   */
  async generatePrompt(request) {
    const { suggestion, routePath, context, learnings } = request;
    
    // If we have a dedicated prompt generator, use it
    if (this.promptGenerator?.generatePrompt) {
      return this.promptGenerator.generatePrompt(request);
    }
    
    // Otherwise, build a comprehensive prompt
    const prompt = `# ${request.type === 'fix' ? 'Fix' : 'Implement'}: ${suggestion.title}

## Route
\`${routePath}\`

## File
\`${context.filePath || 'Unknown'}\`

## Issue
**Category**: ${suggestion.category}
**Severity**: ${suggestion.severity}

${suggestion.description}

${suggestion.location ? `**Location**: ${suggestion.location}` : ''}

## Suggested Approach
${suggestion.suggestedFix || 'Analyze the issue and implement the best solution based on project patterns.'}

${learnings?.recommended ? `
## What Has Worked Before
- Recommended approach: "${learnings.recommended.approach}"
- Success rate: ${Math.round(learnings.recommended.successRate * 100)}%
- Average time: ${Math.round(learnings.recommended.avgDuration / 1000)}s
` : ''}

${learnings?.toAvoid?.length > 0 ? `
## Approaches to Avoid
${learnings.toAvoid.map(a => `- "${a.approach}" (failed ${a.failureCount} times)`).join('\n')}
` : ''}

## Project Patterns to Follow
${context.projectPatterns?.length > 0 
  ? context.projectPatterns.map(p => `- ${p}`).join('\n')
  : '- Follow existing code style\n- Use Tailwind CSS for styling\n- Maintain consistency with surrounding code'}

${context.hasGlassmorphism ? '- Maintain glassmorphism design system (backdrop-blur, translucent backgrounds)' : ''}
${context.hasSuspense ? '- Use Suspense boundaries for async content' : ''}

## Instructions

1. Read the current file content at \`${context.filePath}\`
2. Identify the exact location of the issue
3. Implement the fix following the suggested approach
4. Verify the fix works correctly
5. Ensure no regressions are introduced

## Expected Outcome
${suggestion.type === 'issue' 
  ? `The ${suggestion.category} issue "${suggestion.title}" should be resolved.`
  : `The feature "${suggestion.title}" should be implemented and working.`}

## Verification
- Visual: Check that the UI looks correct
- Functional: Verify the fix/feature works as expected
- Code: Run linting to ensure no new errors

---
Generated by HelmDev Agent Router
Priority: ${request.priority}
Target Agent: ${request.targetAgent}
`;

    return prompt;
  }

  /**
   * Calculate priority based on severity and type
   */
  calculatePriority(suggestion) {
    const severityWeights = {
      error: 100,
      warning: 70,
      info: 40,
      enhancement: 30,
    };
    
    const categoryWeights = {
      a11y: 1.3,      // Accessibility is important
      perf: 1.2,      // Performance matters
      code: 1.0,
      ui: 0.9,
      ux: 0.9,
      feature: 0.7,
    };
    
    const severityScore = severityWeights[suggestion.severity] || 50;
    const categoryMultiplier = categoryWeights[suggestion.category] || 1.0;
    
    return Math.round(severityScore * categoryMultiplier);
  }

  /**
   * Route multiple suggestions as a batch
   */
  async routeBatch(suggestions, routePath, routeContext) {
    const results = [];
    
    // Sort by priority
    const sorted = [...suggestions].sort((a, b) => 
      this.calculatePriority(b) - this.calculatePriority(a)
    );
    
    for (const suggestion of sorted) {
      try {
        const result = await this.routeSuggestion(suggestion, routePath, routeContext);
        results.push({
          suggestion,
          success: true,
          result,
        });
      } catch (error) {
        results.push({
          suggestion,
          success: false,
          error: error.message,
        });
      }
    }
    
    return results;
  }

  /**
   * Get routing statistics
   */
  getStats() {
    const agentCounts = {};
    for (const route of this.routingHistory) {
      agentCounts[route.targetAgent] = (agentCounts[route.targetAgent] || 0) + 1;
    }
    
    return {
      totalRouted: this.routingHistory.length,
      byAgent: agentCounts,
      recent: this.routingHistory.slice(-10),
    };
  }
}

export default AgentRouter;
