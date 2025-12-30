/**
 * AuditProgressTracker - Track audit progress across sessions
 * 
 * Features:
 * - Track which routes have been audited
 * - Track issues found vs fixed
 * - Persist progress between sessions
 * - Calculate completion percentage
 */

import { promises as fs } from 'fs';
import path from 'path';

export class AuditProgressTracker {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'audit-progress.json');
    
    this.progress = {
      startedAt: null,
      lastUpdated: null,
      routes: {},
      summary: {
        total: 0,
        audited: 0,
        clean: 0,
        needsWork: 0,
        issuesFound: 0,
        issuesFixed: 0,
      },
    };
  }

  /**
   * Initialize tracker
   */
  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.load();
  }

  /**
   * Load progress from disk
   */
  async load() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.progress = JSON.parse(content);
      console.log(`   📊 Progress loaded: ${this.progress.summary.audited}/${this.progress.summary.total} routes`);
    } catch {
      console.log('   📊 Progress: starting fresh');
    }
  }

  /**
   * Save progress to disk
   */
  async save() {
    this.progress.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.filePath, JSON.stringify(this.progress, null, 2));
  }

  /**
   * Set total routes (from discovery)
   */
  setTotalRoutes(routes) {
    if (!this.progress.startedAt) {
      this.progress.startedAt = new Date().toISOString();
    }
    
    this.progress.summary.total = routes.length;
    
    // Initialize route entries
    for (const route of routes) {
      const routePath = typeof route === 'string' ? route : route.route;
      
      if (!this.progress.routes[routePath]) {
        this.progress.routes[routePath] = {
          route: routePath,
          status: 'pending',
          auditedAt: null,
          issues: {
            found: 0,
            fixed: 0,
            open: 0,
          },
          history: [],
        };
      }
    }
    
    this.recalculateSummary();
    this.save();
  }

  /**
   * Mark route as audited
   */
  markAudited(routePath, analysis) {
    const route = this.progress.routes[routePath];
    if (!route) {
      this.progress.routes[routePath] = {
        route: routePath,
        status: 'pending',
        issues: { found: 0, fixed: 0, open: 0 },
        history: [],
      };
    }
    
    const issueCount = 
      (analysis.issues?.length || 0) + 
      (analysis.uiEnhancements?.length || 0) + 
      (analysis.featureEnhancements?.length || 0);
    
    this.progress.routes[routePath].status = issueCount > 0 ? 'needs-work' : 'clean';
    this.progress.routes[routePath].auditedAt = new Date().toISOString();
    this.progress.routes[routePath].issues.found = issueCount;
    this.progress.routes[routePath].issues.open = issueCount;
    
    // Add to history
    this.progress.routes[routePath].history.push({
      action: 'audited',
      timestamp: new Date().toISOString(),
      issuesFound: issueCount,
    });
    
    this.recalculateSummary();
    this.save();
  }

  /**
   * Mark issue as fixed
   */
  markIssueFixed(routePath, issueId) {
    const route = this.progress.routes[routePath];
    if (!route) return;
    
    route.issues.fixed++;
    route.issues.open = Math.max(0, route.issues.found - route.issues.fixed);
    
    if (route.issues.open === 0) {
      route.status = 'clean';
    }
    
    route.history.push({
      action: 'fixed',
      timestamp: new Date().toISOString(),
      issueId,
    });
    
    this.recalculateSummary();
    this.save();
  }

  /**
   * Recalculate summary statistics
   */
  recalculateSummary() {
    const routes = Object.values(this.progress.routes);
    
    this.progress.summary = {
      total: routes.length,
      audited: routes.filter(r => r.status !== 'pending').length,
      clean: routes.filter(r => r.status === 'clean').length,
      needsWork: routes.filter(r => r.status === 'needs-work').length,
      issuesFound: routes.reduce((sum, r) => sum + r.issues.found, 0),
      issuesFixed: routes.reduce((sum, r) => sum + r.issues.fixed, 0),
    };
  }

  /**
   * Get completion percentage
   */
  getCompletionPercent() {
    if (this.progress.summary.total === 0) return 0;
    return Math.round((this.progress.summary.audited / this.progress.summary.total) * 100);
  }

  /**
   * Get fix rate percentage
   */
  getFixRatePercent() {
    if (this.progress.summary.issuesFound === 0) return 100;
    return Math.round((this.progress.summary.issuesFixed / this.progress.summary.issuesFound) * 100);
  }

  /**
   * Get routes needing work
   */
  getRoutesNeedingWork() {
    return Object.values(this.progress.routes)
      .filter(r => r.status === 'needs-work')
      .sort((a, b) => b.issues.open - a.issues.open);
  }

  /**
   * Get pending routes
   */
  getPendingRoutes() {
    return Object.values(this.progress.routes)
      .filter(r => r.status === 'pending');
  }

  /**
   * Get clean routes
   */
  getCleanRoutes() {
    return Object.values(this.progress.routes)
      .filter(r => r.status === 'clean');
  }

  /**
   * Get full progress report
   */
  getReport() {
    return {
      ...this.progress.summary,
      completionPercent: this.getCompletionPercent(),
      fixRatePercent: this.getFixRatePercent(),
      openIssues: this.progress.summary.issuesFound - this.progress.summary.issuesFixed,
      startedAt: this.progress.startedAt,
      lastUpdated: this.progress.lastUpdated,
      routesNeedingWork: this.getRoutesNeedingWork().map(r => ({
        route: r.route,
        openIssues: r.issues.open,
      })),
    };
  }

  /**
   * Get route status
   */
  getRouteStatus(routePath) {
    return this.progress.routes[routePath] || {
      route: routePath,
      status: 'unknown',
      issues: { found: 0, fixed: 0, open: 0 },
    };
  }

  /**
   * Reset progress
   */
  async reset() {
    this.progress = {
      startedAt: null,
      lastUpdated: null,
      routes: {},
      summary: {
        total: 0,
        audited: 0,
        clean: 0,
        needsWork: 0,
        issuesFound: 0,
        issuesFixed: 0,
      },
    };
    
    await this.save();
  }
}

export default AuditProgressTracker;
