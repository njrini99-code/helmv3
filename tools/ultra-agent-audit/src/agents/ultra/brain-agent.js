/**
 * 🧠 BrainAgent - Strategic Intelligence
 * 
 * THE SMART ONE. Understands:
 * - What feature TYPE this is (calendar, roster, messaging, etc.)
 * - What capabilities are MISSING vs industry standards
 * - What user workflows are BLOCKED
 * - What the PRIORITY should be
 * - How to compare to COMPETITORS
 * 
 * Combines: featureAgent, megathink, smartMegathink, improvement
 */

import { BaseAgent } from '../coordination/base-agent.js';
import { FeatureKnowledge } from '../../knowledge/feature-knowledge.js';
import HelmKnowledge from '../../knowledge/helm-knowledge.js';
import { AgentThinking } from '../../knowledge/agent-thinking.js';

export class BrainAgent extends BaseAgent {
  constructor(config = {}) {
    super('brain', [
      'feature-detection',
      'capability-analysis', 
      'strategic-suggestions',
      'workflow-analysis',
      'industry-comparison',
      'prioritization',
    ]);

    this.config = {
      icon: '🧠',
      color: '#8b5cf6',
      description: 'Strategic intelligence - understands features deeply',
    };

    this.knowledge = FeatureKnowledge;
    this.helmKnowledge = HelmKnowledge;
    this.analysisCache = new Map();
  }

  async initialize() {
    this.log('info', 'Brain coming online...');
    const featureCount = Object.keys(this.knowledge.features).length;
    this.log('success', `Loaded ${featureCount} feature definitions with capabilities`);
    return true;
  }

  /**
   * Full strategic analysis of a route
   */
  async analyze(routePath, code) {
    return this.executeTask(`Brain analysis: ${routePath}`, async () => {
      const cacheKey = `${routePath}:${code.length}`;
      if (this.analysisCache.has(cacheKey)) {
        return this.analysisCache.get(cacheKey);
      }

      const result = {
        routePath,
        timestamp: Date.now(),
        feature: null,
        capabilities: { found: [], missing: [], advanced: [] },
        suggestions: [],
        blockedWorkflows: [],
        competitors: [],
        priority: null,
      };

      // Step 1: Detect feature type
      const featureId = this.knowledge.detectFeature(routePath, code);
      
      if (featureId) {
        const feature = this.knowledge.features[featureId];
        result.feature = {
          id: featureId,
          name: feature.name,
          category: feature.category,
          description: feature.description,
        };

        // Step 2: Analyze capability gaps
        const gaps = this.knowledge.analyzeCapabilityGaps(featureId, code);
        result.capabilities = {
          found: gaps.found.map(c => ({ id: c.id, name: c.name, priority: c.priority })),
          missing: gaps.missing,
          advanced: gaps.advanced,
          completeness: this.calculateCompleteness(gaps.found, gaps.missing),
        };

        // Step 3: Get blocked workflows
        result.blockedWorkflows = this.knowledge.getBlockedWorkflows(featureId, gaps.missing);

        // Step 4: Industry comparison
        result.competitors = feature.competitors || [];

        // Step 5: Generate prioritized suggestions
        result.suggestions = this.generateSuggestions(featureId, gaps.missing, gaps.advanced, feature);

      } else {
        result.suggestions = this.getGenericSuggestions(routePath, code);
      }

      // Step 6: Prioritize all suggestions
      for (const suggestion of result.suggestions) {
        const priority = AgentThinking.Prioritization.prioritize(suggestion);
        suggestion.priorityScore = priority.totalScore;
        suggestion.priorityLevel = priority.priority;
        suggestion.recommendation = priority.recommendation;
      }

      result.suggestions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      this.analysisCache.set(cacheKey, result);

      this.shareDiscovery('brain-analysis', {
        routePath,
        featureId: result.feature?.id,
        suggestions: result.suggestions.length,
      });

      return result;
    });
  }

  generateSuggestions(featureId, missing, advanced, feature) {
    const suggestions = [];

    for (const cap of missing) {
      suggestions.push({
        id: `feature-${cap.id}`,
        title: cap.name,
        description: cap.description,
        category: 'missing-capability',
        severity: cap.priority === 'critical' ? 'error' : cap.priority === 'high' ? 'warning' : 'info',
        priority: cap.priority,
        effort: cap.effort || 'medium',
        why: cap.why || `Standard capability for ${feature.name}`,
        result: cap.result || `Users can ${cap.description?.toLowerCase()}`,
        industryExample: cap.industryExample,
        competitors: feature.competitors,
        implementation: cap.implementation,
        source: 'brain',
        featureContext: { featureId, featureName: feature.name },
      });
    }

    const topAdvanced = advanced.filter(c => c.priority !== 'low').slice(0, 3);
    for (const cap of topAdvanced) {
      suggestions.push({
        id: `advanced-${cap.id}`,
        title: `✨ ${cap.name}`,
        description: cap.description,
        category: 'advanced-feature',
        severity: 'info',
        priority: 'low',
        effort: cap.effort || 'high',
        why: cap.why || 'Nice-to-have for power users',
        result: cap.result,
        implementation: cap.implementation,
        source: 'brain',
      });
    }

    return suggestions;
  }

  getGenericSuggestions(routePath, code) {
    const suggestions = [];
    const codeL = code.toLowerCase();

    if (!codeL.includes('isloading') && !codeL.includes('loading')) {
      suggestions.push({
        id: 'generic-loading',
        title: 'Add Loading State',
        description: 'Show skeleton while data loads',
        category: 'ux',
        severity: 'warning',
        priority: 'high',
        effort: 'low',
        why: 'Users see blank screen while waiting - feels broken',
        result: 'Smooth loading experience with visual feedback',
        source: 'brain',
      });
    }

    if (!codeL.includes('length === 0') && !codeL.includes('emptystate')) {
      suggestions.push({
        id: 'generic-empty',
        title: 'Add Empty State',
        description: 'Show helpful message when no data exists',
        category: 'ux',
        severity: 'warning',
        priority: 'high',
        effort: 'low',
        why: 'Users see nothing and don\'t know what to do',
        result: 'Clear guidance with call-to-action',
        source: 'brain',
      });
    }

    if (!codeL.includes('catch') && !codeL.includes('error')) {
      suggestions.push({
        id: 'generic-error',
        title: 'Add Error Handling',
        description: 'Handle and display errors gracefully',
        category: 'reliability',
        severity: 'warning',
        priority: 'high',
        effort: 'low',
        why: 'Errors crash the page or show nothing',
        result: 'Graceful error messages with retry option',
        source: 'brain',
      });
    }

    return suggestions;
  }

  calculateCompleteness(found, missing) {
    const total = found.length + missing.length;
    return total > 0 ? Math.round((found.length / total) * 100) : 100;
  }

  getStatus() {
    return { ...this.getStats(), cached: this.analysisCache.size };
  }
}

export default BrainAgent;
