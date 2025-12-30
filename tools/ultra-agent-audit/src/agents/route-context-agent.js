/**
 * RouteContextAgent - Validates routes have expected features
 * 
 * AGENT COMMUNICATION:
 * - Shares discoveries when missing features found
 * - Receives design validation results
 * - Sends completeness info to megathink
 */

import { BaseAgent } from './coordination/base-agent.js';

export class RouteContextAgent extends BaseAgent {
  constructor(config = {}) {
    super('route-context', [
      'route-validation',
      'feature-detection',
      'domain-knowledge',
      'completeness-check',
    ]);

    this.config = {
      icon: '🗺️',
      color: '#0ea5e9',
      description: 'Validates routes have expected features',
    };

    // Route knowledge
    this.routeRequirements = {
      dashboard: {
        required: ['StatsCard', 'metrics', 'activity'],
        patterns: ['loading', 'error', 'empty'],
      },
      list: {
        required: ['table', 'Table', 'grid', 'Grid', 'list', 'List'],
        patterns: ['loading', 'skeleton', 'Skeleton', 'empty', 'pagination', 'filter'],
      },
      detail: {
        required: ['header', 'content'],
        patterns: ['loading', 'error', 'back', 'edit'],
      },
      form: {
        required: ['form', 'Form', 'input', 'Input', 'submit', 'Submit'],
        patterns: ['loading', 'error', 'validation'],
      },
      settings: {
        required: ['form', 'Form', 'save', 'Save'],
        patterns: ['loading', 'success', 'confirm'],
      },
    };
  }

  async initialize() {
    this.log('info', 'Initializing route context knowledge...');
    this.log('success', `Loaded ${Object.keys(this.routeRequirements).length} route type definitions`);
    return true;
  }

  /**
   * Validate a route
   */
  async validateRoute(routePath, content) {
    return this.executeTask(`Validate ${routePath}`, async () => {
      const routeType = this.inferRouteType(routePath, content);
      const domain = this.inferDomain(routePath);
      const requirements = this.routeRequirements[routeType] || this.routeRequirements.dashboard;
      
      const issues = [];
      const found = [];
      const missing = [];

      // Check required elements
      for (const req of requirements.required) {
        if (content.includes(req)) {
          found.push(req);
        } else {
          missing.push(req);
        }
      }

      // Check patterns
      const patternsFound = [];
      const patternsMissing = [];
      for (const pattern of requirements.patterns) {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          patternsFound.push(pattern);
        } else {
          patternsMissing.push(pattern);
        }
      }

      // Generate issues for missing required
      if (found.length === 0) {
        issues.push({
          id: 'missing-required-elements',
          category: 'features',
          severity: 'warning',
          title: `Missing ${routeType} elements`,
          description: `Expected one of: ${requirements.required.join(', ')}`,
          location: routePath,
          suggestedFix: `Add ${routeType} components`,
          effort: 'medium',
        });
      }

      // Generate issues for missing patterns
      for (const pattern of patternsMissing) {
        if (['loading', 'error', 'empty'].includes(pattern)) {
          issues.push({
            id: `missing-${pattern}-state`,
            category: 'ux',
            severity: pattern === 'loading' ? 'warning' : 'info',
            title: `Missing ${pattern} state`,
            description: `Route should handle ${pattern} state`,
            location: routePath,
            suggestedFix: `Add ${pattern} state handling`,
            effort: 'low',
          });
        }
      }

      // Calculate completeness
      const totalRequired = requirements.required.length + requirements.patterns.length;
      const totalFound = (found.length > 0 ? 1 : 0) + patternsFound.length;
      const completeness = Math.round((totalFound / totalRequired) * 100);

      const result = {
        routePath,
        routeType,
        domain,
        completeness,
        found,
        missing,
        patternsFound,
        patternsMissing,
        issues,
        timestamp: Date.now(),
      };

      // AGENT COMMUNICATION: Share discovery
      if (completeness < 70 || missing.length > 0) {
        this.shareDiscovery('route-incomplete', {
          routePath,
          completeness,
          missing: [...missing, ...patternsMissing],
        });

        // Send to megathink for proposals
        this.sendToAgent('megathink', 'route-needs-work', {
          routePath,
          routeType,
          domain,
          completeness,
          missing: [...missing, ...patternsMissing],
        });
      }

      return result;
    });
  }

  /**
   * Infer route type
   */
  inferRouteType(routePath, content) {
    const parts = routePath.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1] || '';

    // By path
    if (lastPart === 'overview' || routePath.endsWith('/dashboard')) return 'dashboard';
    if (lastPart === 'settings') return 'settings';
    if (lastPart === 'new' || lastPart === 'create' || lastPart === 'edit') return 'form';
    if (routePath.includes('[') && routePath.includes(']')) return 'detail';
    if (['roster', 'discover', 'messages', 'schedule', 'tournaments', 'practice'].includes(lastPart)) return 'list';
    
    // By content
    if (content.includes('DataTable') || content.includes('<table')) return 'list';
    if (content.includes('<form') || content.includes('onSubmit')) return 'form';
    
    return 'dashboard';
  }

  /**
   * Infer domain
   */
  inferDomain(routePath) {
    if (routePath.includes('/baseball')) return 'baseball';
    if (routePath.includes('/golf')) return 'golf';
    return 'shared';
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'design-validated':
        // Design system finished validating
        this.log('receive', `Design validated for ${message.payload.filePath}: ${message.payload.score}`);
        break;
        
      case 'discovery':
        if (message.payload.type === 'code-issues-found') {
          this.log('info', `Code issues in route: ${message.payload.data.filePath}`);
        }
        break;
        
      case 'request-context':
        // Another agent wants route context
        this.log('receive', `Context request from ${message.from}`);
        break;
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      routeTypes: Object.keys(this.routeRequirements),
    };
  }
}

export default RouteContextAgent;
