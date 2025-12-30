/**
 * RouteContextAgent - Validates routes against expected patterns
 * 
 * Uses: RouteContextAnalyzer from knowledge system
 * 
 * Capabilities:
 * - Expected component checking (per route)
 * - Must-have feature validation
 * - Anti-pattern detection
 * - Domain knowledge application (baseball/golf)
 * - Route health scoring
 * - Missing feature detection
 * - User flow validation
 */

import { BaseAgent } from './coordination/base-agent.js';
import { RouteContextAnalyzer, getRouteContext, getRouteChecks } from '../knowledge/route-context-analyzer.js';
import HelmKnowledge from '../knowledge/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export class RouteContextAgent extends BaseAgent {
  constructor(config = {}) {
    super('route-context', [
      'route-validation',
      'component-checking',
      'feature-detection',
      'anti-pattern-detection',
      'domain-knowledge',
      'flow-validation',
    ]);
    
    this.projectRoot = config.projectRoot;
    this.appDir = path.join(config.projectRoot || '.', 'src/app');
    
    this.analyzer = RouteContextAnalyzer;
    this.knowledge = HelmKnowledge;
    
    // Results cache
    this.routeResults = new Map();
    this.lastFullScan = null;
  }

  async start(sharedState) {
    super.start(sharedState);
    const routeConfigs = Object.keys(this.analyzer.routeConfigs).length;
    this.log('info', 'Route Context Agent ready');
    this.log('info', `Loaded ${routeConfigs} route configurations`);
  }

  /**
   * Analyze a single route
   */
  async analyzeRoute(routePath, fileContent = null) {
    const startTime = Date.now();
    
    try {
      // Get expected context for this route
      const context = getRouteContext(routePath);
      const checks = getRouteChecks(routePath);
      
      // If no file content provided, try to load it
      if (!fileContent) {
        const pagePath = this.routeToFilePath(routePath);
        if (pagePath) {
          try {
            fileContent = await fs.readFile(pagePath, 'utf8');
          } catch (e) {
            // Route might not exist yet
          }
        }
      }
      
      const issues = [];
      const passed = [];
      
      // Check must-have features
      if (fileContent && checks.mustHave) {
        for (const feature of checks.mustHave) {
          const found = this.checkFeaturePresent(fileContent, feature);
          if (found) {
            passed.push({ feature, type: 'must-have' });
          } else {
            issues.push({
              type: 'missing-feature',
              severity: 'warning',
              message: `Missing: ${feature}`,
              feature,
              routePath,
            });
          }
        }
      }
      
      // Check for anti-patterns
      if (fileContent && checks.antiPatterns) {
        for (const antiPattern of checks.antiPatterns) {
          const found = this.checkAntiPatternPresent(fileContent, antiPattern);
          if (found) {
            issues.push({
              type: 'anti-pattern',
              severity: 'warning',
              message: `Anti-pattern detected: ${antiPattern}`,
              antiPattern,
              routePath,
            });
          }
        }
      }
      
      // Check expected components
      if (fileContent && context.expectedComponents) {
        const missingComponents = [];
        for (const component of context.expectedComponents) {
          // Check if component is imported or used
          const componentPattern = new RegExp(`<${component}|import.*${component}`, 'i');
          if (!componentPattern.test(fileContent)) {
            missingComponents.push(component);
          }
        }
        
        if (missingComponents.length > 0) {
          issues.push({
            type: 'missing-component',
            severity: 'info',
            message: `May be missing components: ${missingComponents.join(', ')}`,
            components: missingComponents,
            routePath,
          });
        }
      }
      
      // Check for loading.tsx
      const loadingPath = this.getLoadingPath(routePath);
      const hasLoading = await this.fileExists(loadingPath);
      if (!hasLoading) {
        issues.push({
          type: 'missing-loading',
          severity: 'warning',
          message: 'Route missing loading.tsx',
          routePath,
          fix: 'Create loading.tsx with skeleton UI',
        });
      } else {
        passed.push({ feature: 'loading.tsx', type: 'file' });
      }
      
      // Check for error.tsx
      const errorPath = this.getErrorPath(routePath);
      const hasError = await this.fileExists(errorPath);
      if (!hasError) {
        issues.push({
          type: 'missing-error',
          severity: 'info',
          message: 'Route missing error.tsx',
          routePath,
          fix: 'Create error.tsx with error boundary',
        });
      } else {
        passed.push({ feature: 'error.tsx', type: 'file' });
      }
      
      // Calculate route health
      const totalChecks = (checks.mustHave?.length || 0) + 2; // +2 for loading/error
      const passedChecks = passed.length;
      const health = Math.round((passedChecks / Math.max(totalChecks, 1)) * 100);
      
      const result = {
        routePath,
        context,
        issues,
        passed,
        health,
        summary: {
          total: issues.length,
          missingFeatures: issues.filter(i => i.type === 'missing-feature').length,
          antiPatterns: issues.filter(i => i.type === 'anti-pattern').length,
          missingFiles: issues.filter(i => i.type.startsWith('missing-')).length,
        },
        analyzedAt: Date.now(),
        duration: Date.now() - startTime,
      };
      
      this.routeResults.set(routePath, result);
      
      // Emit activity
      if (issues.length > 0) {
        this.emit('activity', {
          agent: this.name,
          action: 'route-analyzed',
          target: routePath,
          message: `Health: ${health}% (${issues.length} issues)`,
        });
      }
      
      return result;
    } catch (error) {
      this.log('error', `Failed to analyze ${routePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a feature is present in code
   */
  checkFeaturePresent(content, feature) {
    const featurePatterns = {
      'greeting with user name': /welcome|hello|hi,?\s*\{|good\s*(morning|afternoon|evening)/i,
      'role-specific content': /role|isCoach|isPlayer|userRole/i,
      'loading state': /loading|skeleton|Skeleton|isLoading|setLoading/i,
      'search input': /<input|<Input|type="search"|search/i,
      'filter panel': /filter|Filter|FilterPanel/i,
      'player cards': /PlayerCard|player-card/i,
      'pagination': /pagination|Pagination|page=|currentPage|nextPage/i,
      'infinite scroll': /infinite|InfiniteScroll|loadMore/i,
      'empty state': /empty|EmptyState|no\s*results|nothing\s*here/i,
      'stage filters': /stage|pipeline|PipelineStage/i,
      'drag and drop': /drag|drop|DragDropContext|Draggable|Droppable/i,
      'conversation list': /conversation|ConversationList|chat-list/i,
      'message thread': /message|MessageThread|ChatWindow/i,
      'message input': /sendMessage|messageInput|<textarea/i,
      'upload': /upload|Upload|file|File/i,
      'video': /video|Video|player|Player/i,
      'calendar': /calendar|Calendar|date|Date/i,
      'form sections': /form|Form|<form/i,
      'save button': /save|Save|submit|Submit/i,
      'metrics': /metric|Metric|stat|Stat|KPI/i,
      'quick actions': /quick|Quick|action|Action/i,
    };
    
    const pattern = featurePatterns[feature.toLowerCase()];
    if (pattern) {
      return pattern.test(content);
    }
    
    // Fallback: check if feature words appear
    const words = feature.toLowerCase().split(/\s+/);
    return words.some(word => content.toLowerCase().includes(word));
  }

  /**
   * Check if an anti-pattern is present
   */
  checkAntiPatternPresent(content, antiPattern) {
    const antiPatternChecks = {
      'too many metrics': (c) => (c.match(/MetricCard|metric-card/gi) || []).length > 4,
      'no loading state': (c) => !/loading|skeleton|isLoading/i.test(c),
      'hardcoded user name': (c) => /["']John["']|["']Jane["']|["']User["']/i.test(c),
      'glass effect on every element': (c) => (c.match(/glass-|backdrop-blur/gi) || []).length > 5,
      'no empty state': (c) => !/empty|EmptyState|no\s*results/i.test(c),
      'no debounce on search': (c) => /onChange.*search/i.test(c) && !/debounce|useDebounce/i.test(c),
    };
    
    const check = antiPatternChecks[antiPattern.toLowerCase()];
    if (check) {
      return check(content);
    }
    
    return false;
  }

  /**
   * Convert route path to file path
   */
  routeToFilePath(routePath) {
    const normalized = routePath.replace(/^\//, '');
    const possiblePaths = [
      path.join(this.appDir, normalized, 'page.tsx'),
      path.join(this.appDir, normalized, 'page.jsx'),
      path.join(this.appDir, `(dashboard)/${normalized}`, 'page.tsx'),
      path.join(this.appDir, `(auth)/${normalized}`, 'page.tsx'),
    ];
    
    return possiblePaths[0]; // Return first possibility, actual check done elsewhere
  }

  /**
   * Get loading.tsx path for a route
   */
  getLoadingPath(routePath) {
    const normalized = routePath.replace(/^\//, '');
    return path.join(this.appDir, normalized, 'loading.tsx');
  }

  /**
   * Get error.tsx path for a route
   */
  getErrorPath(routePath) {
    const normalized = routePath.replace(/^\//, '');
    return path.join(this.appDir, normalized, 'error.tsx');
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run full route scan
   */
  async fullScan() {
    this.log('info', 'Starting full route context scan...');
    const startTime = Date.now();
    
    this.emit('activity', {
      agent: this.name,
      action: 'scan-start',
      message: 'Analyzing all routes against expectations',
    });
    
    // Discover all routes
    const pageFiles = await fg(['**/page.{tsx,jsx}'], {
      cwd: this.appDir,
      ignore: ['**/node_modules/**', '**/.next/**'],
    });
    
    const results = {
      routes: [],
      summary: {
        totalRoutes: pageFiles.length,
        healthyRoutes: 0,
        routesWithIssues: 0,
        totalIssues: 0,
        averageHealth: 0,
        byDomain: { baseball: 0, golf: 0, other: 0 },
      },
      timestamp: Date.now(),
    };
    
    let totalHealth = 0;
    
    for (const pageFile of pageFiles) {
      // Convert file path to route path
      let routePath = '/' + pageFile
        .replace('/page.tsx', '')
        .replace('/page.jsx', '')
        .replace(/\(.*?\)\//g, ''); // Remove route groups
      
      // Load file content
      const fullPath = path.join(this.appDir, pageFile);
      let content = null;
      try {
        content = await fs.readFile(fullPath, 'utf8');
      } catch (e) {}
      
      const result = await this.analyzeRoute(routePath, content);
      if (result) {
        results.routes.push(result);
        totalHealth += result.health;
        
        if (result.issues.length > 0) {
          results.summary.routesWithIssues++;
          results.summary.totalIssues += result.issues.length;
        } else {
          results.summary.healthyRoutes++;
        }
        
        // Count by domain
        if (routePath.includes('/baseball/')) {
          results.summary.byDomain.baseball++;
        } else if (routePath.includes('/golf/')) {
          results.summary.byDomain.golf++;
        } else {
          results.summary.byDomain.other++;
        }
      }
    }
    
    results.summary.averageHealth = Math.round(totalHealth / Math.max(results.routes.length, 1));
    results.duration = Date.now() - startTime;
    this.lastFullScan = results;
    
    this.emit('activity', {
      agent: this.name,
      action: 'scan-complete',
      target: 'coordinator',
      message: `Scanned ${pageFiles.length} routes, avg health: ${results.summary.averageHealth}%`,
    });
    
    this.log('info', `Scan complete: ${results.summary.averageHealth}% average health in ${results.duration}ms`);
    
    return results;
  }

  /**
   * Get routes needing attention
   */
  getRoutesNeedingAttention(threshold = 70) {
    const needsAttention = [];
    
    for (const [routePath, result] of this.routeResults) {
      if (result.health < threshold) {
        needsAttention.push({
          routePath,
          health: result.health,
          issues: result.issues,
          priority: result.health < 50 ? 'high' : 'medium',
        });
      }
    }
    
    return needsAttention.sort((a, b) => a.health - b.health);
  }

  /**
   * Get domain knowledge for a route
   */
  getDomainKnowledge(routePath) {
    const domain = this.knowledge.getRouteDomain(routePath);
    return {
      domain,
      knowledge: this.knowledge.getDomain(domain),
      context: this.knowledge.getRouteContext(routePath),
    };
  }

  /**
   * Generate agent context for Claude Code
   */
  generateAgentContext(routePath, code) {
    return this.knowledge.generateAgentContext(routePath, code);
  }

  /**
   * Get status summary
   */
  getStatus() {
    const lastScan = this.lastFullScan;
    
    return {
      name: this.name,
      state: this.state,
      routesAnalyzed: this.routeResults.size,
      averageHealth: lastScan?.summary.averageHealth || null,
      lastScan: lastScan ? {
        timestamp: lastScan.timestamp,
        routes: lastScan.summary.totalRoutes,
        issues: lastScan.summary.totalIssues,
        duration: lastScan.duration,
      } : null,
      routesNeedingAttention: this.getRoutesNeedingAttention().length,
    };
  }
}

export default RouteContextAgent;
