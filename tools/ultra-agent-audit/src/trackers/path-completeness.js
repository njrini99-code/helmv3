/**
 * PathCompletenessTracker - Track what's complete/incomplete within each path
 * 
 * Tracks: screenshot status, code analysis, issues found/fixed, required elements
 * Auto-updates when tasks complete
 */

export class PathCompletenessTracker {
  constructor() {
    this.paths = new Map();
    this.listeners = new Set();
    
    // Required elements by route type
    this.requirements = {
      page: ['loading.tsx', 'error.tsx', 'metadata'],
      dashboard: ['loading.tsx', 'error.tsx', 'metadata', 'breadcrumbs', 'skeleton'],
      form: ['loading.tsx', 'error.tsx', 'validation', 'success-toast', 'error-handling'],
      list: ['loading.tsx', 'error.tsx', 'empty-state', 'pagination', 'filters'],
      detail: ['loading.tsx', 'error.tsx', 'not-found', 'back-nav', 'skeleton'],
    };
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    this.listeners.add({ event, callback });
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    for (const listener of this.listeners) {
      if (listener.event === event) {
        listener.callback(data);
      }
    }
  }

  /**
   * Initialize or update a path
   */
  initPath(routePath, metadata = {}) {
    const existing = this.paths.get(routePath);
    const type = metadata.type || this.inferRouteType(routePath);
    
    const pathData = {
      route: routePath,
      type,
      domain: this.inferDomain(routePath),
      file: metadata.file || null,
      
      // Completeness status
      status: {
        screenshot: existing?.status?.screenshot || 'pending',
        codeAnalysis: existing?.status?.codeAnalysis || 'pending',
        issuesFix: 'pending',
      },
      
      // Screenshot data
      screenshot: existing?.screenshot || null,
      screenshotError: null,
      
      // Code analysis results
      codeAnalysis: existing?.codeAnalysis || {
        analyzed: false,
        lineCount: 0,
        hasClientDirective: false,
        imports: [],
        exports: [],
        patterns: {},
        summary: '',
      },
      
      // Issues tracking
      issues: {
        total: 0,
        fixed: 0,
        pending: 0,
        skipped: 0,
        items: [],
      },
      
      // Completeness checklist
      checklist: this.buildChecklist(routePath, type, metadata),
      
      // Overall completeness percentage
      completeness: 0,
      
      // Timestamps
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    
    pathData.completeness = this.calculateCompleteness(pathData);
    this.paths.set(routePath, pathData);
    this.emit('path-updated', pathData);
    
    return pathData;
  }

  /**
   * Build checklist for a route
   */
  buildChecklist(routePath, type, metadata = {}) {
    const requirements = this.requirements[type] || this.requirements.page;
    
    return requirements.map(req => ({
      id: req,
      label: this.formatLabel(req),
      status: metadata[req] ? 'complete' : 'unchecked',
      complete: !!metadata[req],
      autoDetected: false,
      detectedAt: null,
    }));
  }

  formatLabel(req) {
    const labels = {
      'loading.tsx': 'Loading State',
      'error.tsx': 'Error Boundary',
      'metadata': 'SEO Metadata',
      'breadcrumbs': 'Breadcrumbs',
      'skeleton': 'Skeleton Loading',
      'validation': 'Form Validation',
      'success-toast': 'Success Feedback',
      'error-handling': 'Error Handling',
      'empty-state': 'Empty State',
      'pagination': 'Pagination',
      'filters': 'Filter Controls',
      'not-found': '404 Handling',
      'back-nav': 'Back Navigation',
    };
    return labels[req] || req;
  }

  inferRouteType(routePath) {
    if (routePath.includes('/dashboard')) return 'dashboard';
    if (routePath.includes('/new') || routePath.includes('/edit') || routePath.includes('/settings')) return 'form';
    if (routePath.match(/\/\[.*\]$/)) return 'detail';
    if (routePath.includes('/roster') || routePath.includes('/schedule') || routePath.includes('/discover')) return 'list';
    return 'page';
  }

  inferDomain(routePath) {
    if (routePath.includes('/player/') || routePath.includes('/coach/')) return 'baseball';
    if (routePath.includes('/team-dashboard')) return 'golf';
    return 'shared';
  }

  /**
   * Update screenshot status
   */
  updateScreenshot(routePath, screenshot, error = null) {
    const pathData = this.paths.get(routePath);
    if (!pathData) return;
    
    if (screenshot) {
      pathData.screenshot = screenshot;
      pathData.status.screenshot = 'complete';
      pathData.screenshotError = null;
    } else if (error) {
      pathData.status.screenshot = 'failed';
      pathData.screenshotError = error;
    }
    
    pathData.updatedAt = Date.now();
    pathData.completeness = this.calculateCompleteness(pathData);
    this.emit('path-updated', pathData);
  }

  /**
   * Update code analysis results
   */
  updateCodeAnalysis(routePath, analysis) {
    const pathData = this.paths.get(routePath);
    if (!pathData) return;
    
    pathData.codeAnalysis = {
      analyzed: true,
      analyzedAt: Date.now(),
      ...analysis,
    };
    pathData.status.codeAnalysis = 'complete';
    
    // Auto-detect checklist items from analysis
    this.autoDetectChecklist(pathData, analysis);
    
    pathData.updatedAt = Date.now();
    pathData.completeness = this.calculateCompleteness(pathData);
    this.emit('path-updated', pathData);
  }

  /**
   * Auto-detect checklist items from code analysis
   */
  autoDetectChecklist(pathData, analysis) {
    const checklist = pathData.checklist;
    
    for (const item of checklist) {
      let detected = false;
      
      switch (item.id) {
        case 'loading.tsx':
          detected = analysis.structure?.hasLoading === true;
          break;
        case 'error.tsx':
          detected = analysis.structure?.hasError === true;
          break;
        case 'metadata':
          detected = analysis.structure?.hasMetadata === true;
          break;
        case 'skeleton':
          detected = analysis.patterns?.usesSkeleton === true;
          break;
        case 'validation':
          detected = analysis.patterns?.usesForm === true;
          break;
      }
      
      if (detected) {
        item.status = 'complete';
        item.complete = true;
        item.autoDetected = true;
        item.detectedAt = Date.now();
      }
    }
  }

  /**
   * Update issues for a path
   */
  updateIssues(routePath, issues) {
    const pathData = this.paths.get(routePath);
    if (!pathData) return;
    
    pathData.issues.items = issues;
    pathData.issues.total = issues.length;
    pathData.issues.pending = issues.filter(i => !i.fixed && !i.skipped).length;
    pathData.issues.fixed = issues.filter(i => i.fixed).length;
    pathData.issues.skipped = issues.filter(i => i.skipped).length;
    
    pathData.updatedAt = Date.now();
    pathData.completeness = this.calculateCompleteness(pathData);
    this.emit('path-updated', pathData);
  }

  /**
   * Mark an issue as fixed
   */
  markIssueFixed(routePath, issueId) {
    const pathData = this.paths.get(routePath);
    if (!pathData) return;
    
    const issue = pathData.issues.items.find(i => i.id === issueId);
    if (issue) {
      issue.fixed = true;
      issue.fixedAt = Date.now();
      
      pathData.issues.pending--;
      pathData.issues.fixed++;
      
      pathData.updatedAt = Date.now();
      pathData.completeness = this.calculateCompleteness(pathData);
      this.emit('issue-fixed', { route: routePath, issue });
      this.emit('path-updated', pathData);
    }
  }

  /**
   * Calculate overall completeness percentage
   */
  calculateCompleteness(pathData) {
    let score = 0;
    let maxScore = 0;
    
    // Screenshot (20 points)
    maxScore += 20;
    if (pathData.status.screenshot === 'complete') score += 20;
    
    // Code analysis (20 points)
    maxScore += 20;
    if (pathData.status.codeAnalysis === 'complete') score += 20;
    
    // Checklist items (40 points total)
    const checklistItems = pathData.checklist.length;
    const completedItems = pathData.checklist.filter(c => c.complete).length;
    if (checklistItems > 0) {
      maxScore += 40;
      score += Math.round((completedItems / checklistItems) * 40);
    }
    
    // Issues fixed (20 points)
    maxScore += 20;
    if (pathData.issues.total === 0) {
      score += 20; // No issues = perfect
    } else if (pathData.issues.pending === 0) {
      score += 20; // All issues addressed
    } else {
      const fixRate = (pathData.issues.fixed + pathData.issues.skipped) / pathData.issues.total;
      score += Math.round(fixRate * 20);
    }
    
    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }

  /**
   * Get all paths
   */
  getAllPaths() {
    return Array.from(this.paths.values());
  }

  /**
   * Get path by route
   */
  getPath(routePath) {
    return this.paths.get(routePath);
  }

  /**
   * Get paths by domain
   */
  getPathsByDomain(domain) {
    return this.getAllPaths().filter(p => p.domain === domain);
  }

  /**
   * Get incomplete paths
   */
  getIncompletePaths() {
    return this.getAllPaths().filter(p => p.completeness < 100);
  }

  /**
   * Get overall stats
   */
  getStats() {
    const all = this.getAllPaths();
    
    return {
      total: all.length,
      complete: all.filter(p => p.completeness === 100).length,
      partial: all.filter(p => p.completeness > 0 && p.completeness < 100).length,
      pending: all.filter(p => p.completeness === 0).length,
      averageCompleteness: all.length > 0 
        ? Math.round(all.reduce((sum, p) => sum + p.completeness, 0) / all.length)
        : 0,
      byDomain: {
        baseball: this.getDomainStats('baseball'),
        golf: this.getDomainStats('golf'),
        shared: this.getDomainStats('shared'),
      },
    };
  }

  getDomainStats(domain) {
    const paths = this.getPathsByDomain(domain);
    return {
      total: paths.length,
      complete: paths.filter(p => p.completeness === 100).length,
      averageCompleteness: paths.length > 0
        ? Math.round(paths.reduce((sum, p) => sum + p.completeness, 0) / paths.length)
        : 0,
    };
  }

  /**
   * Export data
   */
  export() {
    return {
      paths: Object.fromEntries(this.paths),
      stats: this.getStats(),
      exportedAt: Date.now(),
    };
  }

  /**
   * Import data
   */
  import(data) {
    if (data.paths) {
      for (const [route, pathData] of Object.entries(data.paths)) {
        this.paths.set(route, pathData);
      }
    }
  }
}

export default PathCompletenessTracker;
