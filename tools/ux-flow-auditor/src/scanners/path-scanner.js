/**
 * PathScanner - Discovers and analyzes all paths in the Helm project
 * 
 * Returns comprehensive data for each path including:
 * - Issues (bugs, dead code, unfinished features)
 * - UI Enhancements (design improvements)
 * - Feature Enhancements (new functionality)
 * - Screenshot support
 */

import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import HelmKnowledge from '../knowledge/index.js';

export class PathScanner {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.knowledge = HelmKnowledge;
    this.appDir = path.join(projectRoot, 'src', 'app');
    this.componentsDir = path.join(projectRoot, 'src', 'components');
    
    // Issue type colors
    this.colors = {
      issue: '#ef4444',      // Red - bugs, dead code
      ui: '#f59e0b',         // Amber - UI enhancements
      feature: '#10b981',    // Green - feature enhancements
    };
  }

  /**
   * Scan all paths and return initial analysis
   */
  async scanAllPaths() {
    console.log('📂 Scanning all paths...');
    
    const paths = [];
    
    // Get all route files
    const routeFiles = await fg([
      '**/page.tsx',
      '**/page.ts',
      '**/layout.tsx',
    ], { 
      cwd: this.appDir,
      ignore: ['**/node_modules/**'],
    });
    
    for (const file of routeFiles) {
      const routePath = this.fileToRoutePath(file);
      const fullPath = path.join(this.appDir, file);
      
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const analysis = await this.analyzePathQuick(routePath, content, fullPath);
        
        paths.push({
          id: this.pathToId(routePath),
          routePath,
          filePath: fullPath,
          relativePath: file,
          type: file.includes('layout') ? 'layout' : 'page',
          ...analysis,
        });
      } catch (error) {
        console.error(`Error analyzing ${file}:`, error.message);
      }
    }
    
    // Sort by issue count (most issues first)
    paths.sort((a, b) => {
      const aTotal = a.issues.length + a.uiEnhancements.length + a.featureEnhancements.length;
      const bTotal = b.issues.length + b.uiEnhancements.length + b.featureEnhancements.length;
      return bTotal - aTotal;
    });
    
    console.log(`📊 Scanned ${paths.length} paths`);
    
    return {
      paths,
      summary: this.generateSummary(paths),
      timestamp: Date.now(),
    };
  }

  /**
   * Convert file path to route path
   */
  fileToRoutePath(file) {
    let route = file
      .replace(/\/page\.(tsx?|jsx?)$/, '')
      .replace(/\/layout\.(tsx?|jsx?)$/, '')
      .replace(/\(.*?\)\//g, '') // Remove route groups like (dashboard)/
      .replace(/\[(.+?)\]/g, ':$1'); // Convert [id] to :id
    
    return '/' + route || '/';
  }

  /**
   * Convert path to safe ID
   */
  pathToId(routePath) {
    return routePath.replace(/[/:]/g, '-').replace(/^-/, '') || 'root';
  }

  /**
   * Quick analysis of a path (initial scan)
   */
  async analyzePathQuick(routePath, content, filePath) {
    const issues = [];
    const uiEnhancements = [];
    const featureEnhancements = [];
    
    // Get knowledge context
    const routeContext = this.knowledge.getRouteContext(routePath);
    const domain = this.knowledge.getRouteDomain(routePath);
    const domainKnowledge = this.knowledge.getDomain(domain);
    
    // Run code validation
    const codeIssues = this.knowledge.validateCode(content, routePath);
    const uiIssues = this.knowledge.validateUI(content);
    
    // === ISSUES (Red) ===
    
    // Code quality issues
    for (const issue of codeIssues) {
      issues.push({
        id: `code-${issues.length}`,
        type: 'code',
        severity: issue.severity,
        title: issue.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        summary: issue.message,
        why: this.getWhyForIssue(issue.type),
        fix: issue.fix,
        result: this.getResultForIssue(issue.type),
        color: this.colors.issue,
      });
    }
    
    // Dead code detection
    const deadCode = this.detectDeadCode(content);
    for (const dead of deadCode) {
      issues.push({
        id: `dead-${issues.length}`,
        type: 'dead-code',
        severity: 'warning',
        title: 'Dead Code Detected',
        summary: dead.description,
        why: 'Dead code increases bundle size, confuses developers, and makes maintenance harder.',
        fix: dead.fix,
        result: 'Cleaner codebase, smaller bundle, easier maintenance.',
        color: this.colors.issue,
      });
    }
    
    // Unfinished features
    const unfinished = this.detectUnfinishedFeatures(content, routeContext);
    for (const item of unfinished) {
      issues.push({
        id: `unfinished-${issues.length}`,
        type: 'unfinished',
        severity: 'error',
        title: item.title,
        summary: item.description,
        why: item.why,
        fix: item.fix,
        result: item.result,
        color: this.colors.issue,
      });
    }
    
    // Missing loading/error states
    if (!content.includes('loading') && this.routeNeedsLoading(content)) {
      issues.push({
        id: `loading-${issues.length}`,
        type: 'missing-loading',
        severity: 'warning',
        title: 'Missing Loading State',
        summary: 'This route fetches data but has no loading state.',
        why: 'Users see a blank screen while data loads, damaging perceived performance.',
        fix: 'Add loading.tsx with skeleton components.',
        result: 'Better UX, users see immediate feedback while data loads.',
        color: this.colors.issue,
      });
    }
    
    // === UI ENHANCEMENTS (Amber) ===
    
    // UI validation issues
    for (const issue of uiIssues) {
      uiEnhancements.push({
        id: `ui-${uiEnhancements.length}`,
        type: 'ui',
        severity: issue.severity,
        title: issue.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        summary: issue.message,
        why: this.getWhyForUI(issue.type),
        fix: issue.fix,
        result: this.getResultForUI(issue.type),
        color: this.colors.ui,
      });
    }
    
    // Design system violations
    const dsViolations = this.detectDesignSystemViolations(content);
    for (const violation of dsViolations) {
      uiEnhancements.push({
        id: `ds-${uiEnhancements.length}`,
        type: 'design-system',
        severity: 'warning',
        ...violation,
        color: this.colors.ui,
      });
    }
    
    // Missing animations/transitions
    if (this.shouldHaveAnimations(routePath) && !this.hasAnimations(content)) {
      uiEnhancements.push({
        id: `anim-${uiEnhancements.length}`,
        type: 'animation',
        severity: 'info',
        title: 'Missing Micro-interactions',
        summary: 'This page would benefit from subtle animations.',
        why: 'Animations provide feedback, guide attention, and create premium feel.',
        fix: 'Add hover states, transitions, and loading animations.',
        result: 'More polished, professional UI that feels responsive.',
        color: this.colors.ui,
      });
    }
    
    // === FEATURE ENHANCEMENTS (Green) ===
    
    // Missing must-have features
    if (routeContext.mustHave) {
      for (const mustHave of routeContext.mustHave) {
        if (!this.featurePresent(content, mustHave)) {
          featureEnhancements.push({
            id: `feat-${featureEnhancements.length}`,
            type: 'missing-feature',
            severity: 'info',
            title: `Add: ${mustHave}`,
            summary: `This route should have ${mustHave} but it's not implemented.`,
            why: this.getWhyForFeature(mustHave, domainKnowledge),
            fix: `Implement ${mustHave} component/functionality.`,
            result: `Complete ${domain} workflow with proper ${mustHave} support.`,
            color: this.colors.feature,
          });
        }
      }
    }
    
    // Domain-specific feature opportunities
    const domainFeatures = this.getDomainFeatureOpportunities(routePath, content, domainKnowledge);
    for (const feat of domainFeatures) {
      featureEnhancements.push({
        id: `domain-${featureEnhancements.length}`,
        type: 'domain-feature',
        severity: 'info',
        ...feat,
        color: this.colors.feature,
      });
    }
    
    return {
      issues,
      uiEnhancements,
      featureEnhancements,
      domain,
      routeContext,
      stats: {
        lines: content.split('\n').length,
        hasLoading: await this.checkForLoadingFile(filePath),
        hasError: await this.checkForErrorFile(filePath),
      },
    };
  }

  /**
   * Deep analysis of a specific path (when clicked)
   */
  async analyzePathDeep(routePath, screenshot = null) {
    const filePath = await this.routePathToFilePath(routePath);
    if (!filePath) {
      throw new Error(`Could not find file for route: ${routePath}`);
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    const quickAnalysis = await this.analyzePathQuick(routePath, content, filePath);
    
    // Enhanced analysis with screenshot context if available
    const screenshotAnalysis = screenshot 
      ? await this.analyzeWithScreenshot(routePath, content, screenshot)
      : null;
    
    // Get related files (components, hooks, utils used by this route)
    const relatedFiles = await this.findRelatedFiles(content, filePath);
    
    // Get route dependencies and what routes to
    const routing = this.analyzeRouting(content);
    
    return {
      ...quickAnalysis,
      filePath,
      content,
      screenshotAnalysis,
      relatedFiles,
      routing,
      deepScan: true,
    };
  }

  /**
   * Detect dead code patterns
   */
  detectDeadCode(content) {
    const deadCode = [];
    
    // Commented out code blocks
    const commentedCodePattern = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
    const comments = content.match(commentedCodePattern) || [];
    const largeCommentedBlocks = comments.filter(c => c.split('\n').length > 5);
    
    if (largeCommentedBlocks.length > 0) {
      deadCode.push({
        description: `${largeCommentedBlocks.length} large commented code blocks found`,
        fix: 'Remove commented code - use git history instead.',
      });
    }
    
    // console.log statements
    const consoleLogs = (content.match(/console\.(log|debug|info)\(/g) || []).length;
    if (consoleLogs > 3) {
      deadCode.push({
        description: `${consoleLogs} console.log statements found`,
        fix: 'Remove debug console statements before production.',
      });
    }
    
    // Unused imports (basic detection)
    const importMatches = content.match(/import\s+{([^}]+)}\s+from/g) || [];
    for (const imp of importMatches) {
      const items = imp.match(/{([^}]+)}/)?.[1]?.split(',').map(s => s.trim()) || [];
      for (const item of items) {
        const cleanItem = item.split(' as ')[0].trim();
        if (cleanItem && !content.includes(cleanItem + '(') && !content.includes(cleanItem + ' ') && !content.includes('<' + cleanItem)) {
          // Only flag if we're reasonably sure it's unused
          const occurrences = (content.match(new RegExp(cleanItem, 'g')) || []).length;
          if (occurrences <= 1) {
            deadCode.push({
              description: `Potentially unused import: ${cleanItem}`,
              fix: `Remove unused import '${cleanItem}' if not needed.`,
            });
          }
        }
      }
    }
    
    // TODO comments (unfinished work)
    const todos = (content.match(/\/\/\s*TODO/gi) || []).length;
    if (todos > 0) {
      deadCode.push({
        description: `${todos} TODO comments found - incomplete work`,
        fix: 'Complete TODO items or create tickets for them.',
      });
    }
    
    return deadCode;
  }

  /**
   * Detect unfinished features
   */
  detectUnfinishedFeatures(content, routeContext) {
    const unfinished = [];
    
    // Placeholder text
    if (content.includes('Lorem ipsum') || content.includes('placeholder')) {
      unfinished.push({
        title: 'Placeholder Content',
        description: 'Contains placeholder text that needs real content.',
        why: 'Placeholder text looks unprofessional and confuses users.',
        fix: 'Replace placeholder text with actual content.',
        result: 'Professional, complete UI ready for users.',
      });
    }
    
    // Empty onClick handlers
    if (content.match(/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/)) {
      unfinished.push({
        title: 'Empty Click Handler',
        description: 'Button has empty onClick - does nothing when clicked.',
        why: 'Broken UX - users click expecting something to happen.',
        fix: 'Implement the click handler functionality.',
        result: 'Fully functional interactive elements.',
      });
    }
    
    // Functions that just return null or empty
    if (content.match(/return\s+null\s*;?\s*\/\/\s*(TODO|FIXME|implement)/i)) {
      unfinished.push({
        title: 'Stub Function',
        description: 'Function returns null with TODO comment.',
        why: 'Feature is incomplete and may cause runtime issues.',
        fix: 'Implement the function logic.',
        result: 'Fully functional feature.',
      });
    }
    
    // Hardcoded data that should be dynamic
    if (content.includes("['Item 1', 'Item 2'") || content.includes('["Test', 'fake')) {
      unfinished.push({
        title: 'Hardcoded Test Data',
        description: 'Contains hardcoded placeholder data.',
        why: 'Not connected to real data source, will show fake data to users.',
        fix: 'Connect to actual data source (Supabase query).',
        result: 'Real data displayed from database.',
      });
    }
    
    return unfinished;
  }

  /**
   * Detect design system violations
   */
  detectDesignSystemViolations(content) {
    const violations = [];
    const ds = this.knowledge.getDesignSystem();
    
    // Non-standard spacing
    const spacingPattern = /(?:p|m|gap|space)-(\d+)/g;
    const spacings = [...content.matchAll(spacingPattern)];
    const nonStandard = spacings.filter(m => {
      const val = parseInt(m[1]) * 4; // Tailwind default scale
      return !ds.spacing?.scale?.includes(val);
    });
    
    if (nonStandard.length > 3) {
      violations.push({
        title: 'Non-Standard Spacing',
        summary: `${nonStandard.length} instances of non-standard spacing values.`,
        why: 'Inconsistent spacing creates visual disharmony and harder maintenance.',
        fix: `Use spacing scale: ${ds.spacing?.scale?.join(', ')}px`,
        result: 'Consistent, harmonious spacing throughout.',
      });
    }
    
    // Glass effect misuse
    if ((content.includes('backdrop-blur') || content.includes('bg-white/')) && 
        (content.includes('table') || content.includes('Table') || content.includes('form') || content.includes('Form'))) {
      violations.push({
        title: 'Glass Effect on Table/Form',
        summary: 'Glass/blur effects applied to table or form elements.',
        why: 'Glass effects reduce readability for data-heavy components.',
        fix: 'Remove glass effects from tables and forms. Only use on nav/toolbar.',
        result: 'Better readability and data accessibility.',
      });
    }
    
    // Hardcoded colors
    const hardcodedColors = content.match(/#[a-fA-F0-9]{3,6}(?![a-fA-F0-9])/g) || [];
    if (hardcodedColors.length > 5) {
      violations.push({
        title: 'Hardcoded Colors',
        summary: `${hardcodedColors.length} hardcoded hex colors found.`,
        why: 'Breaks theme consistency and makes global changes difficult.',
        fix: 'Use CSS variables or Tailwind color palette.',
        result: 'Consistent theming and easy global color updates.',
      });
    }
    
    return violations;
  }

  /**
   * Check if route needs loading state
   */
  routeNeedsLoading(content) {
    return content.includes('await') || 
           content.includes('useEffect') || 
           content.includes('fetch(') ||
           content.includes('supabase.from');
  }

  /**
   * Check if route should have animations
   */
  shouldHaveAnimations(routePath) {
    return routePath.includes('dashboard') || 
           routePath.includes('discovery') ||
           routePath.includes('pipeline') ||
           routePath === '/';
  }

  /**
   * Check if content has animations
   */
  hasAnimations(content) {
    return content.includes('animate-') ||
           content.includes('transition-') ||
           content.includes('motion') ||
           content.includes('framer-motion');
  }

  /**
   * Check if feature is present in content
   */
  featurePresent(content, feature) {
    const featurePatterns = {
      'search': ['search', 'Search', 'filter', 'Filter', 'query'],
      'pagination': ['pagination', 'Pagination', 'page', 'limit', 'offset'],
      'loading state': ['loading', 'Loading', 'skeleton', 'Skeleton', 'Spinner'],
      'error handling': ['error', 'Error', 'catch', 'try'],
      'empty state': ['empty', 'Empty', 'no data', 'No results'],
      'drag and drop': ['drag', 'Drag', 'dnd', 'Sortable', 'draggable'],
      'filters': ['filter', 'Filter', 'sort', 'Sort'],
    };
    
    const patterns = featurePatterns[feature.toLowerCase()] || [feature.toLowerCase()];
    return patterns.some(p => content.includes(p));
  }

  /**
   * Get domain-specific feature opportunities
   */
  getDomainFeatureOpportunities(routePath, content, domainKnowledge) {
    const opportunities = [];
    
    if (!domainKnowledge) return opportunities;
    
    // Baseball-specific
    if (domainKnowledge.name === 'Baseball Recruiting') {
      if (routePath.includes('player') && !content.includes('comparison')) {
        opportunities.push({
          title: 'Player Comparison Mode',
          summary: 'Allow coaches to compare multiple players side-by-side.',
          why: 'Coaches need to evaluate players against each other during recruiting.',
          fix: 'Add comparison selection and side-by-side view.',
          result: 'Faster, more informed recruiting decisions.',
        });
      }
      
      if (routePath.includes('discover') && !content.includes('map')) {
        opportunities.push({
          title: 'Geographic Discovery Map',
          summary: 'Show players on a map by location.',
          why: 'Coaches often recruit by region for travel considerations.',
          fix: 'Add interactive map view with player markers.',
          result: 'Visual geographic recruiting intelligence.',
        });
      }
    }
    
    // Golf-specific
    if (domainKnowledge.name === 'Golf Team Management') {
      if (routePath.includes('roster') && !content.includes('handicap')) {
        opportunities.push({
          title: 'Handicap Tracking',
          summary: 'Track and display player handicaps over time.',
          why: 'Handicaps are essential for golf team lineup decisions.',
          fix: 'Add handicap display and history chart.',
          result: 'Better lineup decisions based on player performance.',
        });
      }
    }
    
    return opportunities;
  }

  /**
   * Explanations for issues
   */
  getWhyForIssue(type) {
    const whys = {
      'invalid-type-import': 'Type imports from wrong locations cause TypeScript errors and runtime issues.',
      'invalid-supabase-client': 'Using server client in client components causes authentication failures.',
      'missing-use-client': 'React hooks fail without "use client" directive.',
      'invalid-table-name': 'Wrong table names cause database query failures.',
      'hardcoded-name': 'Hardcoded names break multi-tenancy and personalization.',
    };
    return whys[type] || 'This issue affects code quality and reliability.';
  }

  getResultForIssue(type) {
    const results = {
      'invalid-type-import': 'Proper TypeScript compilation and runtime safety.',
      'invalid-supabase-client': 'Reliable database authentication and queries.',
      'missing-use-client': 'React hooks work correctly with proper hydration.',
      'invalid-table-name': 'Database queries return correct data.',
      'hardcoded-name': 'Personalized experience for each user.',
    };
    return results[type] || 'Improved code quality and reliability.';
  }

  getWhyForUI(type) {
    const whys = {
      'glass-on-table': 'Glass effects reduce readability on data-dense components.',
      'non-standard-spacing': 'Inconsistent spacing creates visual disharmony.',
      'missing-transition': 'Instant state changes feel jarring to users.',
    };
    return whys[type] || 'This affects visual consistency and user experience.';
  }

  getResultForUI(type) {
    const results = {
      'glass-on-table': 'Clear, readable data presentation.',
      'non-standard-spacing': 'Harmonious, professional visual rhythm.',
      'missing-transition': 'Smooth, polished interactions.',
    };
    return results[type] || 'Better visual consistency and polish.';
  }

  getWhyForFeature(feature, domainKnowledge) {
    const domainContext = domainKnowledge?.name || 'sports management';
    return `${feature} is essential for ${domainContext} workflows and user productivity.`;
  }

  /**
   * Check for loading.tsx file
   */
  async checkForLoadingFile(filePath) {
    const dir = path.dirname(filePath);
    try {
      await fs.access(path.join(dir, 'loading.tsx'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for error.tsx file
   */
  async checkForErrorFile(filePath) {
    const dir = path.dirname(filePath);
    try {
      await fs.access(path.join(dir, 'error.tsx'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert route path back to file path
   */
  async routePathToFilePath(routePath) {
    // Try to find the file
    const possiblePaths = [
      path.join(this.appDir, routePath.replace(/^\//, ''), 'page.tsx'),
      path.join(this.appDir, routePath.replace(/^\//, ''), 'page.ts'),
    ];
    
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    
    return null;
  }

  /**
   * Find related files (components, hooks used)
   */
  async findRelatedFiles(content, filePath) {
    const related = [];
    
    // Find component imports
    const importMatches = content.match(/from\s+['"](@\/components\/[^'"]+)['"]/g) || [];
    for (const imp of importMatches) {
      const match = imp.match(/['"](@\/components\/[^'"]+)['"]/);
      if (match) {
        related.push({
          type: 'component',
          path: match[1],
        });
      }
    }
    
    // Find hook imports
    const hookMatches = content.match(/from\s+['"](@\/hooks\/[^'"]+)['"]/g) || [];
    for (const imp of hookMatches) {
      const match = imp.match(/['"](@\/hooks\/[^'"]+)['"]/);
      if (match) {
        related.push({
          type: 'hook',
          path: match[1],
        });
      }
    }
    
    return related;
  }

  /**
   * Analyze routing in content
   */
  analyzeRouting(content) {
    const routes = {
      linksTo: [],
      redirectsTo: [],
      buttons: [],
    };
    
    // Find Link components
    const linkMatches = content.match(/href=["']([^"']+)["']/g) || [];
    for (const link of linkMatches) {
      const match = link.match(/href=["']([^"']+)["']/);
      if (match) {
        routes.linksTo.push(match[1]);
      }
    }
    
    // Find router.push
    const pushMatches = content.match(/router\.push\(["']([^"']+)["']\)/g) || [];
    for (const push of pushMatches) {
      const match = push.match(/router\.push\(["']([^"']+)["']\)/);
      if (match) {
        routes.redirectsTo.push(match[1]);
      }
    }
    
    // Find buttons (may need routing)
    const buttonMatches = content.match(/<Button[^>]*>([^<]*)<\/Button>/g) || [];
    routes.buttons = buttonMatches.length;
    
    return routes;
  }

  /**
   * Analyze with screenshot (returns analysis to be enhanced by visual agent)
   */
  async analyzeWithScreenshot(routePath, content, screenshot) {
    return {
      hasScreenshot: true,
      screenshotPath: screenshot,
      routePath,
      // This will be populated by VisualAnalysisAgent
      visualAnalysis: null,
    };
  }

  /**
   * Generate summary of all paths
   */
  generateSummary(paths) {
    const totalIssues = paths.reduce((sum, p) => sum + p.issues.length, 0);
    const totalUI = paths.reduce((sum, p) => sum + p.uiEnhancements.length, 0);
    const totalFeatures = paths.reduce((sum, p) => sum + p.featureEnhancements.length, 0);
    
    const byDomain = {};
    for (const p of paths) {
      const domain = p.domain || 'general';
      if (!byDomain[domain]) {
        byDomain[domain] = { count: 0, issues: 0 };
      }
      byDomain[domain].count++;
      byDomain[domain].issues += p.issues.length;
    }
    
    return {
      totalPaths: paths.length,
      totalIssues,
      totalUIEnhancements: totalUI,
      totalFeatureEnhancements: totalFeatures,
      totalItems: totalIssues + totalUI + totalFeatures,
      byDomain,
      healthScore: Math.max(0, 100 - (totalIssues * 2) - (totalUI * 0.5)),
    };
  }
}

export default PathScanner;
