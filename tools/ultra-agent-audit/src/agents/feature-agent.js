/**
 * FeatureAgent - INTELLIGENT Feature Analysis Agent
 * 
 * This agent is SMART because it:
 * 1. DETECTS what feature the code represents (calendar, roster, messaging, etc.)
 * 2. KNOWS what capabilities that feature should have (from industry standards)
 * 3. ANALYZES code to find gaps between expected and actual
 * 4. EXPLAINS why each capability matters (user pain points)
 * 5. SHOWS blocked user workflows (real scenarios that don't work)
 * 6. PROVIDES implementation guidance (libraries, patterns, schema)
 * 7. COMPARES to competitors (TeamSnap, Google Calendar, etc.)
 * 8. SUGGESTS success metrics (how to measure improvement)
 * 
 * This is the difference between:
 * - Generic: "Add advanced filters" (for any list)
 * - Smart: "Add Recurring Events - coaches create same practice weekly, 
 *          currently they make 50+ events manually. See Google Calendar, TeamSnap."
 */

import { BaseAgent } from './coordination/base-agent.js';
import { FeatureKnowledge } from '../knowledge/feature-knowledge.js';

export class FeatureAgent extends BaseAgent {
  constructor(config = {}) {
    super('feature-analyzer', [
      'feature-detection',
      'capability-analysis',
      'smart-suggestions',
      'workflow-gaps',
      'industry-comparison',
      'implementation-guidance',
    ]);

    this.config = {
      icon: '🧠',
      color: '#8b5cf6',
      description: 'Intelligent feature suggestions with domain expertise',
    };

    this.knowledge = FeatureKnowledge;
    
    // Cache for analyzed routes
    this.analysisCache = new Map();
  }

  async initialize() {
    this.log('info', 'Initializing feature intelligence...');
    const featureCount = Object.keys(this.knowledge.features).length;
    const capabilityCount = Object.values(this.knowledge.features)
      .reduce((sum, f) => sum + this.knowledge.getAllCapabilities(f.name ? Object.keys(this.knowledge.features).find(k => this.knowledge.features[k] === f) : '').length, 0);
    
    this.log('success', `Loaded ${featureCount} feature definitions`);
    this.log('info', `Knowledge includes ${Object.keys(this.knowledge.features).length} features with detailed capabilities`);
    return true;
  }

  /**
   * Full feature analysis for a route
   */
  async analyzeFeatures(routePath, code) {
    return this.executeTask(`Analyze features: ${routePath}`, async () => {
      // Check cache first
      const cacheKey = `${routePath}:${code.length}`;
      if (this.analysisCache.has(cacheKey)) {
        this.log('info', `Using cached analysis for ${routePath}`);
        return this.analysisCache.get(cacheKey);
      }

      // Step 1: Detect what feature type this is
      const featureId = this.knowledge.detectFeature(routePath, code);
      
      if (!featureId) {
        this.log('info', `Could not detect specific feature type for ${routePath}`);
        return {
          routePath,
          feature: null,
          suggestions: this.getGenericSuggestions(routePath, code),
          message: 'No specific feature type detected - using generic analysis',
        };
      }

      const feature = this.knowledge.features[featureId];
      this.log('info', `Detected feature: ${feature.name} (${featureId})`);

      // Step 2: Analyze capability gaps
      const { found, missing, advanced } = this.knowledge.analyzeCapabilityGaps(featureId, code);
      
      this.log('info', `Capabilities: ${found.length} found, ${missing.length} missing, ${advanced.length} advanced available`);

      // Step 3: Generate prioritized suggestions
      const suggestions = this.generatePrioritizedSuggestions(featureId, missing, advanced, feature);

      // Step 4: Find blocked user workflows
      const blockedWorkflows = this.knowledge.getBlockedWorkflows(featureId, missing);
      
      if (blockedWorkflows.length > 0) {
        this.log('warning', `${blockedWorkflows.length} user workflows are blocked by missing capabilities`);
      }

      // Step 5: Get feature synergies
      const synergies = this.knowledge.getSynergiesFor(featureId);

      // Step 6: Calculate feature completeness
      const totalCapabilities = found.length + missing.length;
      const completeness = totalCapabilities > 0 
        ? Math.round((found.length / totalCapabilities) * 100) 
        : 0;

      // Step 7: Generate executive summary
      const summary = this.generateExecutiveSummary(feature, found, missing, blockedWorkflows);

      const result = {
        routePath,
        
        // Feature identification
        feature: {
          id: featureId,
          name: feature.name,
          category: feature.category,
          description: feature.description,
          competitors: feature.competitors || [],
        },
        
        // Capability analysis
        capabilities: {
          found: found.map(c => ({
            id: c.id,
            name: c.name,
            priority: c.priority,
          })),
          missing: missing.map(c => ({
            id: c.id,
            name: c.name,
            priority: c.priority,
            why: c.why,
            effort: c.effort,
            industryExample: c.industryExample,
          })),
          advanced: advanced.map(c => ({
            id: c.id,
            name: c.name,
            effort: c.effort,
          })),
          completeness,
          score: this.calculateFeatureScore(found, missing),
        },
        
        // Smart suggestions (the gold!)
        suggestions,
        
        // User impact
        blockedWorkflows: blockedWorkflows.map(w => ({
          persona: w.persona,
          task: w.task,
          frequency: w.frequency,
          currentPain: w.currentPain,
          idealFlow: w.idealFlow,
          timeImpact: w.timeImpact,
          blockedBy: w.blockedBy,
        })),
        
        // Strategic context
        industryComparison: feature.competitors,
        synergies: synergies.map(s => ({
          features: s.features,
          synergy: s.synergy,
          description: s.description,
        })),
        
        // Metrics
        successMetrics: feature.successMetrics || [],
        
        // Executive summary
        summary,
        
        timestamp: Date.now(),
      };

      // Cache the result
      this.analysisCache.set(cacheKey, result);

      // Share discoveries with other agents
      this.shareDiscovery('feature-analysis-complete', {
        routePath,
        featureId,
        featureName: feature.name,
        completeness,
        suggestionCount: suggestions.length,
        blockedWorkflowCount: blockedWorkflows.length,
      });

      // Send high-impact suggestions to megathink
      const criticalSuggestions = suggestions.filter(s => s.priority === 'high' || s.priority === 'critical');
      if (criticalSuggestions.length > 0) {
        this.sendToAgent('megathink', 'high-impact-features', {
          routePath,
          feature: feature.name,
          suggestions: criticalSuggestions,
          blockedWorkflows,
        });
      }

      return result;
    });
  }

  /**
   * Generate prioritized suggestions with full context
   */
  generatePrioritizedSuggestions(featureId, missing, advanced, feature) {
    const suggestions = [];
    
    // Sort missing by priority
    const sortedMissing = [...missing].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });

    // Add missing capabilities as suggestions
    for (const cap of sortedMissing) {
      suggestions.push({
        id: `feature-${cap.id}`,
        title: cap.name,
        description: cap.description,
        
        // Categorization
        category: 'feature-gap',
        severity: cap.priority === 'critical' ? 'error' : cap.priority === 'high' ? 'warning' : 'info',
        priority: cap.priority,
        effort: cap.effort || 'medium',
        
        // THE SMART PARTS - domain knowledge
        why: cap.why || `Standard capability for ${feature.name}`,
        result: cap.result || `Users can ${cap.description?.toLowerCase() || 'use this feature'}`,
        
        // Industry context
        industryExample: cap.industryExample,
        competitors: feature.competitors,
        
        // Implementation guidance
        implementation: cap.implementation ? {
          approach: cap.implementation.approach,
          libraries: cap.implementation.libraries,
          services: cap.implementation.services,
          schema: cap.implementation.schema,
          uiComponents: cap.implementation.uiComponents,
          endpoint: cap.implementation.endpoint,
        } : null,
        
        // Success metrics
        metrics: cap.metrics,
        
        // Phase recommendation
        implementationPhase: this.knowledge.getImplementationPriority(cap.id),
        
        // For MD generation
        source: 'feature-knowledge',
        context: {
          featureType: featureId,
          featureName: feature.name,
          capability: cap.name,
          codeSignals: cap.codeSignals,
        },
      });
    }

    // Add top advanced features (nice-to-haves)
    const topAdvanced = advanced
      .filter(cap => cap.priority === 'medium' || cap.priority === 'high')
      .slice(0, 3);
    
    for (const cap of topAdvanced) {
      suggestions.push({
        id: `advanced-${cap.id}`,
        title: `✨ ${cap.name}`,
        description: cap.description,
        category: 'advanced-feature',
        severity: 'info',
        priority: 'low',
        effort: cap.effort || 'high',
        why: cap.why || 'Nice-to-have enhancement for power users',
        result: cap.result,
        industryExample: cap.industryExample,
        implementation: cap.implementation,
        implementationPhase: 'scale',
        source: 'feature-knowledge',
        context: {
          featureType: featureId,
          featureName: feature.name,
          capability: cap.name,
        },
      });
    }

    return suggestions;
  }

  /**
   * Calculate feature score based on capabilities
   */
  calculateFeatureScore(found, missing) {
    let score = 100;
    
    // Deduct for missing critical
    const missingCritical = missing.filter(c => c.priority === 'critical').length;
    score -= missingCritical * 25;
    
    // Deduct for missing high
    const missingHigh = missing.filter(c => c.priority === 'high').length;
    score -= missingHigh * 10;
    
    // Deduct for missing medium
    const missingMedium = missing.filter(c => c.priority === 'medium').length;
    score -= missingMedium * 3;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(feature, found, missing, blockedWorkflows) {
    const criticalMissing = missing.filter(c => c.priority === 'critical');
    const highMissing = missing.filter(c => c.priority === 'high');
    
    let status = 'good';
    let message = `${feature.name} is well-implemented.`;
    
    if (criticalMissing.length > 0) {
      status = 'critical';
      message = `${feature.name} is missing critical capabilities: ${criticalMissing.map(c => c.name).join(', ')}`;
    } else if (highMissing.length > 2) {
      status = 'needs-work';
      message = `${feature.name} is functional but missing important features: ${highMissing.slice(0, 3).map(c => c.name).join(', ')}`;
    } else if (highMissing.length > 0) {
      status = 'good-with-opportunities';
      message = `${feature.name} is solid. Consider adding: ${highMissing.map(c => c.name).join(', ')}`;
    }

    const quickWins = missing
      .filter(c => c.effort === 'low' && (c.priority === 'high' || c.priority === 'medium'))
      .slice(0, 3);

    return {
      status,
      message,
      foundCount: found.length,
      missingCount: missing.length,
      criticalMissingCount: criticalMissing.length,
      highMissingCount: highMissing.length,
      blockedWorkflowCount: blockedWorkflows.length,
      quickWins: quickWins.map(c => ({ id: c.id, name: c.name, effort: c.effort })),
      topPriority: criticalMissing[0] || highMissing[0] || null,
      competitors: feature.competitors,
    };
  }

  /**
   * Generic suggestions when feature type isn't detected
   */
  getGenericSuggestions(routePath, code) {
    const suggestions = [];
    const codeLower = code.toLowerCase();
    
    // Check for common patterns
    if (!codeLower.includes('loading') && !codeLower.includes('skeleton')) {
      suggestions.push({
        id: 'missing-loading-state',
        title: 'Add Loading State',
        description: 'Show skeleton or spinner while data loads',
        category: 'ux',
        severity: 'warning',
        priority: 'high',
        effort: 'low',
        why: 'Users see blank screen while data loads, feels broken',
        result: 'Users see content placeholder, better perceived performance',
        source: 'generic-analysis',
      });
    }
    
    if (!codeLower.includes('empty') && !codeLower.includes('no data') && !codeLower.includes('no items')) {
      suggestions.push({
        id: 'missing-empty-state',
        title: 'Add Empty State',
        description: 'Show helpful message when no data exists',
        category: 'ux',
        severity: 'info',
        priority: 'medium',
        effort: 'low',
        why: 'Users see nothing when no data, don\'t know what to do',
        result: 'Clear guidance with call-to-action',
        source: 'generic-analysis',
      });
    }
    
    if (!codeLower.includes('error') && !codeLower.includes('catch')) {
      suggestions.push({
        id: 'missing-error-handling',
        title: 'Add Error Handling',
        description: 'Show user-friendly error messages',
        category: 'reliability',
        severity: 'warning',
        priority: 'high',
        effort: 'low',
        why: 'Unhandled errors crash or show cryptic messages',
        result: 'Graceful error display with retry option',
        source: 'generic-analysis',
      });
    }

    return suggestions;
  }

  /**
   * Get quick summary (for UI badges)
   */
  async getFeatureSummary(routePath, code) {
    const featureId = this.knowledge.detectFeature(routePath, code);
    if (!featureId) return null;

    const feature = this.knowledge.features[featureId];
    const { found, missing } = this.knowledge.analyzeCapabilityGaps(featureId, code);
    
    return {
      featureId,
      featureName: feature.name,
      category: feature.category,
      completeness: Math.round((found.length / (found.length + missing.length)) * 100) || 0,
      score: this.calculateFeatureScore(found, missing),
      foundCount: found.length,
      missingCount: missing.length,
      highPriorityMissing: missing.filter(c => c.priority === 'high' || c.priority === 'critical').length,
      competitors: feature.competitors,
    };
  }

  /**
   * Get all known features
   */
  getKnownFeatures() {
    return Object.entries(this.knowledge.features).map(([id, feature]) => ({
      id,
      name: feature.name,
      category: feature.category,
      description: feature.description,
      routes: feature.indicators.routes,
      competitors: feature.competitors,
      capabilityCount: this.knowledge.getAllCapabilities(id).length,
    }));
  }

  /**
   * Get synergies that could be implemented
   */
  getSynergySuggestions(implementedFeatures) {
    return this.knowledge.synergies
      .filter(s => s.features.every(f => implementedFeatures.includes(f)))
      .map(s => ({
        ...s,
        suggestion: `Combine ${s.features.join(' + ')} to enable ${s.synergy}`,
      }));
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'analyze-features':
        this.analyzeFeatures(message.payload.routePath, message.payload.code)
          .then(result => {
            this.sendToAgent(message.from, 'feature-analysis-result', result);
          });
        break;

      case 'get-feature-summary':
        this.getFeatureSummary(message.payload.routePath, message.payload.code)
          .then(summary => {
            this.sendToAgent(message.from, 'feature-summary', summary);
          });
        break;

      case 'discovery':
        if (message.payload.type === 'route-analyzed') {
          this.log('info', `Route analyzed: ${message.payload.data.routePath}`);
        }
        break;

      case 'get-known-features':
        this.sendToAgent(message.from, 'known-features', this.getKnownFeatures());
        break;
    }
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
    this.log('info', 'Analysis cache cleared');
  }

  getStatus() {
    return {
      ...this.getStats(),
      featuresKnown: Object.keys(this.knowledge.features).length,
      features: this.getKnownFeatures().map(f => f.name),
      cacheSize: this.analysisCache.size,
      synergiesKnown: this.knowledge.synergies.length,
      categories: Object.keys(this.knowledge.categories),
    };
  }
}

export default FeatureAgent;
