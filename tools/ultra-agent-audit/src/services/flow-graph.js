/**
 * Flow Graph Service
 * Builds visualization data for route connections and user flows
 */

export class FlowGraphService {
  constructor(tracker) {
    this.tracker = tracker;
    
    // Known navigation flows for each domain
    this.knownFlows = {
      shared: [
        { from: '/', to: '/login', label: 'Login' },
        { from: '/', to: '/signup', label: 'Sign Up' },
        { from: '/login', to: '/player/dashboard', label: 'Player Login' },
        { from: '/login', to: '/coach/dashboard', label: 'Coach Login' },
        { from: '/login', to: '/team-dashboard', label: 'Team Login' },
      ],
      baseball: [
        { from: '/', to: '/player/dashboard', label: 'Player Dashboard' },
        { from: '/', to: '/coach/dashboard', label: 'Coach Dashboard' },
        { from: '/player/dashboard', to: '/player/dashboard/profile', label: 'Profile' },
        { from: '/player/dashboard', to: '/player/dashboard/stats', label: 'Stats' },
        { from: '/player/dashboard', to: '/player/dashboard/video', label: 'Video' },
        { from: '/player/dashboard', to: '/player/dashboard/recruiting', label: 'Recruiting' },
        { from: '/player/dashboard', to: '/player/dashboard/settings', label: 'Settings' },
        { from: '/coach/dashboard', to: '/coach/dashboard/roster', label: 'Roster' },
        { from: '/coach/dashboard', to: '/coach/dashboard/recruiting', label: 'Recruiting' },
        { from: '/coach/dashboard', to: '/coach/dashboard/discover', label: 'Discover' },
        { from: '/coach/dashboard', to: '/coach/dashboard/settings', label: 'Settings' },
        { from: '/coach/dashboard/discover', to: '/coach/dashboard/discover/[id]', label: 'Player Detail' },
        { from: '/coach/dashboard/recruiting', to: '/coach/dashboard/recruiting/[id]', label: 'Recruit Detail' },
      ],
      golf: [
        { from: '/', to: '/team-dashboard', label: 'Team Dashboard' },
        { from: '/team-dashboard', to: '/team-dashboard/roster', label: 'Roster' },
        { from: '/team-dashboard', to: '/team-dashboard/schedule', label: 'Schedule' },
        { from: '/team-dashboard', to: '/team-dashboard/stats', label: 'Stats' },
        { from: '/team-dashboard', to: '/team-dashboard/recruiting', label: 'Recruiting' },
        { from: '/team-dashboard', to: '/team-dashboard/settings', label: 'Settings' },
        { from: '/team-dashboard/roster', to: '/team-dashboard/roster/[id]', label: 'Player Detail' },
        { from: '/team-dashboard/schedule', to: '/team-dashboard/schedule/[id]', label: 'Event Detail' },
      ],
    };
  }

  /**
   * Build complete flow graph
   */
  buildGraph() {
    const paths = this.tracker.getAllPaths();
    
    return {
      nodes: this.buildNodes(paths),
      edges: this.buildEdges(paths),
      domains: this.buildDomainGroups(paths),
      stats: this.buildStats(paths),
      generatedAt: Date.now(),
    };
  }

  /**
   * Build node data for each path
   */
  buildNodes(paths) {
    return paths.map(path => ({
      id: path.route,
      label: this.getNodeLabel(path.route),
      domain: path.domain,
      type: path.type,
      completeness: path.completeness,
      
      // Status indicators
      hasScreenshot: path.status.screenshot === 'complete',
      hasAnalysis: path.status.codeAnalysis === 'complete',
      issueCount: path.issues.pending,
      
      // Visual properties
      status: this.getNodeStatus(path),
      color: this.getNodeColor(path),
      size: this.getNodeSize(path),
      
      // Position hints (for layout)
      depth: this.calculateDepth(path.route),
      isEntry: path.route === '/',
    }));
  }

  getNodeLabel(route) {
    if (route === '/') return 'Home';
    const parts = route.split('/').filter(Boolean);
    return parts[parts.length - 1]
      .replace(/\[.*\]/, '[id]')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  getNodeStatus(path) {
    if (path.completeness === 100) return 'complete';
    if (path.completeness >= 70) return 'good';
    if (path.completeness >= 40) return 'partial';
    if (path.completeness > 0) return 'started';
    return 'pending';
  }

  getNodeColor(path) {
    const colors = {
      complete: '#10b981', // green
      good: '#22c55e',
      partial: '#f59e0b', // amber
      started: '#f97316', // orange
      pending: '#6b7280', // gray
    };
    return colors[this.getNodeStatus(path)] || colors.pending;
  }

  getNodeSize(path) {
    if (path.route === '/') return 60;
    if (path.route.includes('dashboard')) return 50;
    return 40;
  }

  calculateDepth(route) {
    if (route === '/') return 0;
    return route.split('/').filter(Boolean).length;
  }

  /**
   * Build edges (connections) between routes
   */
  buildEdges(paths) {
    const edges = [];
    const pathSet = new Set(paths.map(p => p.route));
    
    // Add known flows
    for (const [domain, flows] of Object.entries(this.knownFlows)) {
      flows.forEach(flow => {
        if (pathSet.has(flow.from) || pathSet.has(flow.to)) {
          edges.push({
            id: `${flow.from}->${flow.to}`,
            source: flow.from,
            target: flow.to,
            label: flow.label,
            domain,
            type: 'navigation',
            animated: true,
          });
        }
      });
    }
    
    // Infer edges from route structure (parent-child relationships)
    paths.forEach(path => {
      if (path.route === '/') return;
      
      const parts = path.route.split('/').filter(Boolean);
      if (parts.length > 1) {
        const parentRoute = '/' + parts.slice(0, -1).join('/');
        if (pathSet.has(parentRoute)) {
          const edgeId = `${parentRoute}->${path.route}`;
          if (!edges.find(e => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: parentRoute,
              target: path.route,
              domain: path.domain,
              type: 'hierarchy',
              animated: false,
            });
          }
        }
      }
    });
    
    return edges;
  }

  /**
   * Group paths by domain for visualization
   */
  buildDomainGroups(paths) {
    const calcDomainCompleteness = (domainPaths) => {
      if (domainPaths.length === 0) return 0;
      const total = domainPaths.reduce((sum, p) => sum + p.completeness, 0);
      return Math.round(total / domainPaths.length);
    };

    const baseballPaths = paths.filter(p => p.domain === 'baseball');
    const golfPaths = paths.filter(p => p.domain === 'golf');
    const sharedPaths = paths.filter(p => p.domain === 'shared');

    return {
      baseball: {
        label: 'Baseball',
        color: '#ef4444',
        icon: '⚾',
        nodes: baseballPaths.map(p => p.route),
        entryPoint: '/player/dashboard',
        completeness: calcDomainCompleteness(baseballPaths),
        total: baseballPaths.length,
        complete: baseballPaths.filter(p => p.completeness === 100).length,
      },
      golf: {
        label: 'Golf',
        color: '#22c55e',
        icon: '⛳',
        nodes: golfPaths.map(p => p.route),
        entryPoint: '/team-dashboard',
        completeness: calcDomainCompleteness(golfPaths),
        total: golfPaths.length,
        complete: golfPaths.filter(p => p.completeness === 100).length,
      },
      shared: {
        label: 'Shared',
        color: '#6366f1',
        icon: '🔗',
        nodes: sharedPaths.map(p => p.route),
        entryPoint: '/',
        completeness: calcDomainCompleteness(sharedPaths),
        total: sharedPaths.length,
        complete: sharedPaths.filter(p => p.completeness === 100).length,
      },
    };
  }

  /**
   * Build summary statistics
   */
  buildStats(paths) {
    const totalRoutes = paths.length;
    const completeRoutes = paths.filter(p => p.completeness === 100).length;
    const partialRoutes = paths.filter(p => p.completeness > 0 && p.completeness < 100).length;
    const pendingRoutes = paths.filter(p => p.completeness === 0).length;
    
    const totalIssues = paths.reduce((sum, p) => sum + (p.issues?.total || 0), 0);
    const fixedIssues = paths.reduce((sum, p) => sum + (p.issues?.fixed || 0), 0);
    const pendingIssues = paths.reduce((sum, p) => sum + (p.issues?.pending || 0), 0);
    
    const overallCompleteness = totalRoutes > 0 
      ? Math.round(paths.reduce((sum, p) => sum + p.completeness, 0) / totalRoutes)
      : 0;

    return {
      routes: {
        total: totalRoutes,
        complete: completeRoutes,
        partial: partialRoutes,
        pending: pendingRoutes,
      },
      issues: {
        total: totalIssues,
        fixed: fixedIssues,
        pending: pendingIssues,
      },
      completeness: overallCompleteness,
      edges: this.buildEdges(paths).length,
    };
  }

  /**
   * Get incomplete routes for quick action list
   */
  getIncompleteRoutes() {
    const paths = this.tracker.getAllPaths();
    return paths
      .filter(p => p.completeness < 100)
      .sort((a, b) => b.completeness - a.completeness)
      .map(p => ({
        route: p.route,
        label: this.getNodeLabel(p.route),
        domain: p.domain,
        completeness: p.completeness,
        issues: p.issues?.pending || 0,
        missingItems: p.checklist?.filter(c => !c.complete).map(c => c.label) || [],
      }));
  }
}

export default FlowGraphService;
