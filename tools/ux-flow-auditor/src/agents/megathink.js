/**
 * MegaThinkAgent - Continuous Improvement Engine
 * 
 * NOW POWERED BY comprehensive project knowledge:
 * - Design system (spacing, colors, glass rules, transitions)
 * - Route context (expected components, must-haves)
 * - Domain knowledge (baseball recruiting, golf team management)
 * - Code patterns (validated against Helm standards)
 * 
 * This agent:
 * - Researches best practices via web search
 * - Analyzes the codebase for improvement opportunities
 * - Generates prioritized enhancement proposals
 * - Organizes proposals by route/dashboard/component
 * - Creates detailed implementation guides
 */

import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import HelmKnowledge from '../knowledge/index.js';

export class MegaThinkAgent {
  constructor(options) {
    this.projectRoot = options.projectRoot;
    this.helmdevDir = options.helmdevDir;
    this.graph = options.graph;
    this.patterns = options.patterns;
    this.memory = options.memory;
    
    // Knowledge system integration
    this.knowledge = HelmKnowledge;
    
    this.improvementsDir = path.join(this.helmdevDir, 'improvements');
    this.researchDir = path.join(this.helmdevDir, 'research');
    
    this.anthropic = new Anthropic();
    this.proposals = new Map();
    this.research = [];
    
    this.sessionStats = {
      proposalsGenerated: 0,
      researchQueries: 0,
      routesAnalyzed: 0,
    };
  }

  /**
   * Start a MegaThink session
   */
  async startSession(options = {}) {
    const { depth = 'deep', scope = 'all', focus = null } = options;
    
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🧠 MEGATHINK SESSION STARTED                                               ║
║                                                                              ║
║   Depth: ${depth.padEnd(15)} Scope: ${scope.padEnd(15)}                      ║
║   Focus: ${(focus || 'All areas').padEnd(55)}║
║                                                                              ║
║   Analyzing codebase and researching improvements...                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
    
    await fs.mkdir(this.improvementsDir, { recursive: true });
    await fs.mkdir(this.researchDir, { recursive: true });
    
    // Phase 1: Analyze current state
    console.log('\n📊 Phase 1: Analyzing current state...');
    const analysis = await this.analyzeCurrentState();
    
    // Phase 2: Conduct research
    console.log('\n🔍 Phase 2: Researching best practices...');
    const research = await this.conductResearch(analysis, focus);
    
    // Phase 3: Generate proposals
    console.log('\n💡 Phase 3: Generating improvement proposals...');
    await this.generateAllProposals(analysis, research, options);
    
    // Phase 4: Organize and prioritize
    console.log('\n📋 Phase 4: Organizing proposals...');
    this.organizeProposals();
    
    // Phase 5: Generate reports
    console.log('\n📝 Phase 5: Generating reports...');
    await this.generateReports();
    
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║ 📊 MEGATHINK SESSION COMPLETE                                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║ Results:                                                                     ║
║   📋 Proposals Generated: ${String(this.sessionStats.proposalsGenerated).padEnd(48)}║
║   🔍 Research Queries: ${String(this.sessionStats.researchQueries).padEnd(51)}║
║   📁 Routes Analyzed: ${String(this.sessionStats.routesAnalyzed).padEnd(52)}║
║                                                                              ║
║ Reports Generated:                                                           ║
║   • .helmdev/improvements/master-report.md                                  ║
║   • .helmdev/improvements/quick-wins.md                                     ║
║   • .helmdev/improvements/by-route/                                         ║
║   • .helmdev/improvements/proposals.json                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
  }

  /**
   * Analyze the current state of the codebase (knowledge-enhanced)
   */
  async analyzeCurrentState() {
    const routes = Array.from(this.graph.routes.entries());
    const files = Array.from(this.graph.files.values());
    
    this.sessionStats.routesAnalyzed = routes.length;
    
    // Analyze each route with knowledge context
    const routeAnalyses = [];
    for (const [routePath, routeNode] of routes) {
      const file = this.graph.files.get(routeNode.filePath);
      if (!file) continue;
      
      // Get knowledge context
      const routeContext = this.knowledge?.getRouteContext(routePath) || {};
      const domain = this.knowledge?.getRouteDomain(routePath);
      
      // Validate against knowledge system
      let codeIssues = [];
      let uiIssues = [];
      if (file.content && this.knowledge) {
        codeIssues = this.knowledge.validateCode(file.content, routePath) || [];
        uiIssues = this.knowledge.validateUI(file.content) || [];
      }
      
      routeAnalyses.push({
        path: routePath,
        filePath: routeNode.filePath,
        purpose: file.purpose,
        features: file.features,
        patterns: file.patterns,
        hasLoading: routeNode.hasLoading,
        hasError: routeNode.hasError,
        hasLayout: routeNode.hasLayout,
        complexity: file.complexity,
        lines: file.lines,
        // Knowledge-enhanced fields
        domain,
        expectedComponents: routeContext.expectedComponents || [],
        mustHaves: routeContext.mustHave || [],
        knowledgeIssues: {
          code: codeIssues,
          ui: uiIssues,
        },
      });
    }
    
    // Identify gaps (now knowledge-aware)
    const gaps = this.identifyGaps(routeAnalyses);
    
    // Identify strengths
    const strengths = this.identifyStrengths(routeAnalyses);
    
    // Calculate overall health
    const health = this.calculateHealthScore(routeAnalyses);
    
    // Get design system for reference
    const designSystem = this.knowledge?.getDesignSystem() || {};
    
    return {
      routes: routeAnalyses,
      gaps,
      strengths,
      health,
      totalFiles: files.length,
      totalRoutes: routes.length,
      patterns: this.patterns.getAllPatterns(),
      knowledgeStatus: {
        loaded: !!this.knowledge,
        designSystem: Object.keys(designSystem).length > 0,
        routeConfigs: Object.keys(this.knowledge?.routeAnalyzer?.routeConfigs || {}).length,
      },
    };
  }

  /**
   * Identify gaps in the codebase (knowledge-enhanced)
   */
  identifyGaps(routes) {
    const gaps = [];
    
    for (const route of routes) {
      // Missing loading states
      if (!route.hasLoading && route.patterns.some(p => 
        ['data-fetching', 'async-component'].includes(p)
      )) {
        gaps.push({
          type: 'missing-loading',
          route: route.path,
          severity: 'medium',
          description: 'Data-fetching route without loading state',
        });
      }
      
      // Missing error boundaries
      if (!route.hasError) {
        gaps.push({
          type: 'missing-error',
          route: route.path,
          severity: 'low',
          description: 'Route without error boundary',
        });
      }
      
      // List pages without search/filter
      if (route.features.includes('data-table') && 
          !route.features.includes('search') &&
          !route.features.includes('filters')) {
        gaps.push({
          type: 'missing-search',
          route: route.path,
          severity: 'medium',
          description: 'Data table without search/filter functionality',
        });
      }
      
      // Forms without proper validation feedback
      if (route.features.includes('form') && 
          !route.features.includes('error-state')) {
        gaps.push({
          type: 'form-ux',
          route: route.path,
          severity: 'medium',
          description: 'Form without visible error handling',
        });
      }
      
      // Knowledge-powered gap detection
      if (route.mustHaves?.length > 0) {
        for (const mustHave of route.mustHaves) {
          // Check if the must-have is present in features
          const featureWords = mustHave.toLowerCase().split(/\s+/);
          const hasFeature = route.features.some(f => 
            featureWords.some(word => f.toLowerCase().includes(word))
          );
          
          if (!hasFeature) {
            gaps.push({
              type: 'missing-must-have',
              route: route.path,
              severity: 'high',
              description: `Missing required feature: ${mustHave}`,
              source: 'knowledge-system',
            });
          }
        }
      }
      
      // Add code quality issues from knowledge validation
      if (route.knowledgeIssues?.code?.length > 0) {
        for (const issue of route.knowledgeIssues.code.slice(0, 3)) { // Top 3 code issues
          gaps.push({
            type: 'code-quality',
            route: route.path,
            severity: issue.severity === 'blocker' ? 'high' : issue.severity,
            description: issue.message,
            fix: issue.fix,
            source: 'knowledge-system',
          });
        }
      }
      
      // Add UI issues from knowledge validation
      if (route.knowledgeIssues?.ui?.length > 0) {
        for (const issue of route.knowledgeIssues.ui.slice(0, 3)) { // Top 3 UI issues
          gaps.push({
            type: 'design-system',
            route: route.path,
            severity: issue.severity === 'error' ? 'high' : 'medium',
            description: issue.message,
            fix: issue.fix,
            source: 'knowledge-system',
          });
        }
      }
    }
    
    return gaps;
  }

  /**
   * Identify strengths in the codebase
   */
  identifyStrengths(routes) {
    const strengths = [];
    
    // Count pattern usage
    const patternCounts = {};
    for (const route of routes) {
      for (const pattern of route.patterns) {
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }
    }
    
    // Consistent pattern usage is a strength
    const topPatterns = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    for (const [pattern, count] of topPatterns) {
      if (count >= 3) {
        strengths.push({
          type: 'consistent-pattern',
          pattern,
          count,
          description: `Consistent use of ${pattern} across ${count} routes`,
        });
      }
    }
    
    // Routes with complete UX
    const completeRoutes = routes.filter(r => 
      r.hasLoading && r.hasError && r.features.length >= 3
    );
    
    if (completeRoutes.length > 0) {
      strengths.push({
        type: 'complete-ux',
        count: completeRoutes.length,
        description: `${completeRoutes.length} routes with complete UX (loading, error, features)`,
      });
    }
    
    return strengths;
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(routes) {
    if (routes.length === 0) return 0;
    
    let totalScore = 0;
    
    for (const route of routes) {
      let routeScore = 50; // Base score
      
      // Loading state
      if (route.hasLoading) routeScore += 10;
      
      // Error boundary
      if (route.hasError) routeScore += 10;
      
      // Layout
      if (route.hasLayout) routeScore += 5;
      
      // Features
      routeScore += Math.min(route.features.length * 3, 15);
      
      // Patterns
      routeScore += Math.min(route.patterns.length * 2, 10);
      
      totalScore += routeScore;
    }
    
    return Math.round(totalScore / routes.length);
  }

  /**
   * Conduct web research for best practices
   */
  async conductResearch(analysis, focus) {
    const queries = this.generateResearchQueries(analysis, focus);
    const findings = [];
    
    for (const query of queries.slice(0, 8)) { // Limit queries
      console.log(`   🔎 Researching: ${query.topic}...`);
      
      try {
        const result = await this.researchTopic(query);
        if (result) {
          findings.push(result);
          this.sessionStats.researchQueries++;
        }
      } catch (error) {
        console.log(`   ⚠️ Research failed: ${error.message}`);
      }
    }
    
    // Save research
    await fs.writeFile(
      path.join(this.researchDir, 'findings.json'),
      JSON.stringify(findings, null, 2)
    );
    
    this.research = findings;
    return findings;
  }

  /**
   * Generate research queries based on analysis
   */
  generateResearchQueries(analysis, focus) {
    const queries = [];
    
    // Always research these
    queries.push({
      topic: 'Next.js 14 app router best practices 2024',
      category: 'best-practices',
      context: 'Looking for latest patterns',
    });
    
    queries.push({
      topic: 'SaaS dashboard UI design trends 2024',
      category: 'ui-trends',
      context: 'Modern dashboard aesthetics',
    });
    
    // Based on gaps
    for (const gap of analysis.gaps.slice(0, 3)) {
      queries.push({
        topic: `${gap.type.replace(/-/g, ' ')} best practices React`,
        category: 'solutions',
        context: gap.description,
      });
    }
    
    // Based on features found
    const features = new Set(analysis.routes.flatMap(r => r.features));
    
    if (features.has('data-table')) {
      queries.push({
        topic: 'React data table UX best practices',
        category: 'ui-patterns',
        context: 'Improving table UX',
      });
    }
    
    if (features.has('form')) {
      queries.push({
        topic: 'React form UX patterns validation feedback',
        category: 'ui-patterns',
        context: 'Better form experiences',
      });
    }
    
    // Focus-specific
    if (focus) {
      queries.push({
        topic: `${focus} implementation best practices`,
        category: 'specific',
        context: `Focused research on ${focus}`,
      });
    }
    
    return queries;
  }

  /**
   * Research a specific topic using Claude (knowledge-enhanced)
   */
  async researchTopic(query) {
    try {
      // Get design system context
      const designSystem = this.knowledge?.getDesignSystem() || {};
      const designContext = `
Design System:
- Spacing: ${designSystem.spacing?.scale?.join(', ') || '4, 8, 12, 16, 24, 32, 48, 64'}px
- Glass effects: ONLY on nav/toolbar, NEVER on tables/forms
- Transitions: hover ${designSystem.motion?.hover || 150}ms, state ${designSystem.motion?.state || 220}ms
- Target quality: Linear, Stripe, Vercel level premium`;
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are a senior frontend engineer researching best practices for Helm Sports Labs.

## Project Context
Helm Sports Labs is a premium multi-sport SaaS platform:
- BaseballHelm: College baseball recruiting (connecting high school players with college coaches)
- GolfHelm: College golf team management

Tech Stack: Next.js 14 + TypeScript + Tailwind CSS + Supabase
${designContext}

## Research Topic
${query.topic}

## Context
${query.context}

## Provide:
1. Key Best Practices (3-5 bullet points)
2. Code Pattern Example using our stack (if applicable)
3. Common Mistakes to Avoid
4. How This Applies Specifically to Sports Recruiting/Team Management
5. Premium UI/UX considerations for $1B SaaS quality

Be specific and practical. Focus on 2024 modern patterns that match our premium aesthetic.`
        }]
      });
      
      const text = response.content[0]?.text || '';
      
      return {
        query: query.topic,
        category: query.category,
        findings: text,
        timestamp: new Date().toISOString(),
        knowledgeEnhanced: true,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate all improvement proposals
   */
  async generateAllProposals(analysis, research, options) {
    // Generate proposals for each route
    for (const route of analysis.routes) {
      const proposals = await this.generateRouteProposals(route, research);
      
      if (proposals.length > 0) {
        this.proposals.set(route.path, proposals);
        this.sessionStats.proposalsGenerated += proposals.length;
      }
    }
    
    // Generate dashboard-specific proposals
    const dashboardRoutes = analysis.routes.filter(r => 
      r.path.includes('dashboard') || r.purpose.includes('Dashboard')
    );
    
    if (dashboardRoutes.length > 0) {
      const dashboardProposals = await this.generateDashboardProposals(dashboardRoutes, research);
      this.proposals.set('__dashboard__', dashboardProposals);
      this.sessionStats.proposalsGenerated += dashboardProposals.length;
    }
    
    // Generate system-wide proposals
    const systemProposals = await this.generateSystemProposals(analysis, research);
    this.proposals.set('__system__', systemProposals);
    this.sessionStats.proposalsGenerated += systemProposals.length;
  }

  /**
   * Generate proposals for a specific route (knowledge-enhanced)
   */
  async generateRouteProposals(route, research) {
    const proposals = [];
    
    // Get knowledge context for this route
    const routeContext = this.knowledge?.getRouteContext(route.path) || {};
    const domain = this.knowledge?.getRouteDomain(route.path);
    const domainKnowledge = domain ? this.knowledge?.getDomain(domain) : null;
    
    // Based on missing features (now knowledge-aware)
    const expectedFeatures = this.getExpectedFeatures(route.purpose, route.path);
    const missingFeatures = expectedFeatures.filter(f => !route.features.includes(f));
    
    for (const feature of missingFeatures) {
      proposals.push(this.createFeatureProposal(route, feature, research));
    }
    
    // Based on UX gaps
    if (!route.hasLoading && route.patterns.some(p => p.includes('data'))) {
      proposals.push({
        id: `${route.path}-loading`,
        category: 'ux',
        title: 'Add Loading State',
        description: 'Add a loading skeleton or spinner for better perceived performance',
        route: route.path,
        priority: 75,
        effort: 'low',
        impact: 'medium',
        implementation: {
          approach: 'Create loading.tsx with skeleton components',
          steps: [
            'Create loading.tsx in the route directory',
            'Add skeleton components matching the page layout',
            'Test with artificial delay',
          ],
          codeExample: `// loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 bg-muted animate-pulse rounded" />
      <div className="h-64 bg-muted animate-pulse rounded" />
    </div>
  )
}`,
        },
      });
    }
    
    // Based on research insights
    const relevantResearch = research.filter(r => 
      r.category === 'ui-patterns' || r.category === 'best-practices'
    );
    
    if (relevantResearch.length > 0 && route.features.length > 0) {
      proposals.push({
        id: `${route.path}-research-improvement`,
        category: 'enhancement',
        title: 'Apply Best Practice Improvements',
        description: 'Implement improvements based on research findings',
        route: route.path,
        priority: 50,
        effort: 'medium',
        impact: 'medium',
        research: relevantResearch.map(r => r.query),
        implementation: {
          approach: 'Review research findings and apply relevant patterns',
          steps: [
            'Review the research findings in .helmdev/research/',
            'Identify applicable improvements',
            'Implement incrementally',
          ],
        },
      });
    }
    
    return proposals;
  }

  /**
   * Generate dashboard-specific proposals
   */
  async generateDashboardProposals(dashboardRoutes, research) {
    const proposals = [];
    
    // Command palette
    proposals.push({
      id: 'dashboard-command-palette',
      category: 'feature',
      title: 'Add Command Palette (⌘K)',
      description: 'Quick navigation and actions via keyboard shortcut',
      route: 'dashboard',
      priority: 85,
      effort: 'medium',
      impact: 'high',
      implementation: {
        approach: 'Use cmdk library with shadcn/ui integration',
        steps: [
          'Install cmdk: npm install cmdk',
          'Create CommandPalette component',
          'Add keyboard listener for ⌘K / Ctrl+K',
          'Populate with routes, actions, and search',
        ],
        codeExample: `import { Command } from 'cmdk'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])
  
  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Group heading="Navigation">
          {/* Route items */}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}`,
      },
    });
    
    // Keyboard shortcuts
    proposals.push({
      id: 'dashboard-keyboard-shortcuts',
      category: 'feature',
      title: 'Add Keyboard Shortcuts',
      description: 'Power user keyboard shortcuts for common actions',
      route: 'dashboard',
      priority: 70,
      effort: 'medium',
      impact: 'medium',
      implementation: {
        approach: 'Create useKeyboardShortcuts hook',
        steps: [
          'Create hook to handle keyboard events',
          'Define shortcuts for navigation and actions',
          'Add visual indicator showing available shortcuts',
        ],
      },
    });
    
    // Real-time updates
    proposals.push({
      id: 'dashboard-realtime',
      category: 'feature',
      title: 'Add Real-time Updates',
      description: 'Live data updates without page refresh',
      route: 'dashboard',
      priority: 65,
      effort: 'high',
      impact: 'high',
      implementation: {
        approach: 'Use Supabase realtime subscriptions',
        steps: [
          'Set up Supabase realtime channel',
          'Subscribe to relevant table changes',
          'Update UI optimistically',
        ],
      },
    });
    
    // Glassmorphism enhancement
    proposals.push({
      id: 'dashboard-glassmorphism',
      category: 'ui',
      title: 'Enhance with Glassmorphism Effects',
      description: 'Premium frosted glass visual effects for cards and panels',
      route: 'dashboard',
      priority: 60,
      effort: 'low',
      impact: 'medium',
      implementation: {
        approach: 'Apply backdrop-blur and semi-transparent backgrounds',
        steps: [
          'Update Card components with glass effect classes',
          'Add subtle border with white/10 opacity',
          'Ensure proper layering with z-index',
        ],
        codeExample: `// Glass card variant
<div className="
  bg-white/80 dark:bg-gray-900/80 
  backdrop-blur-xl 
  border border-white/20 
  rounded-xl shadow-xl
">
  {/* Content */}
</div>`,
      },
    });
    
    return proposals;
  }

  /**
   * Generate system-wide proposals
   */
  async generateSystemProposals(analysis, research) {
    const proposals = [];
    
    // Global error handling
    if (analysis.gaps.some(g => g.type === 'missing-error')) {
      proposals.push({
        id: 'system-global-error',
        category: 'reliability',
        title: 'Add Global Error Boundary',
        description: 'Catch-all error handling for the entire application',
        route: '__system__',
        priority: 80,
        effort: 'low',
        impact: 'high',
        implementation: {
          approach: 'Create global-error.tsx at app root',
          steps: [
            'Create app/global-error.tsx',
            'Add user-friendly error message',
            'Include "Try again" functionality',
            'Add error reporting (optional)',
          ],
        },
      });
    }
    
    // Toast notifications system
    if (!analysis.patterns.some(p => p.name.includes('toast'))) {
      proposals.push({
        id: 'system-toast',
        category: 'ux',
        title: 'Implement Toast Notification System',
        description: 'Consistent user feedback for actions',
        route: '__system__',
        priority: 75,
        effort: 'low',
        impact: 'high',
        implementation: {
          approach: 'Use sonner for toast notifications',
          steps: [
            'Install sonner: npm install sonner',
            'Add Toaster to root layout',
            'Use toast() for success/error feedback',
          ],
        },
      });
    }
    
    return proposals;
  }

  /**
   * Create a feature proposal
   */
  createFeatureProposal(route, feature, research) {
    const featureDetails = {
      'search': {
        title: 'Add Search Functionality',
        description: 'Allow users to search/filter the list',
        effort: 'medium',
        impact: 'high',
      },
      'pagination': {
        title: 'Add Pagination',
        description: 'Handle large data sets with pagination',
        effort: 'medium',
        impact: 'medium',
      },
      'filters': {
        title: 'Add Filter Controls',
        description: 'Allow filtering by various criteria',
        effort: 'medium',
        impact: 'medium',
      },
      'empty-state': {
        title: 'Add Empty State',
        description: 'Show helpful message when no data exists',
        effort: 'low',
        impact: 'medium',
      },
    };
    
    const details = featureDetails[feature] || {
      title: `Add ${feature}`,
      description: `Implement ${feature} functionality`,
      effort: 'medium',
      impact: 'medium',
    };
    
    return {
      id: `${route.path}-${feature}`,
      category: 'feature',
      title: details.title,
      description: details.description,
      route: route.path,
      priority: this.calculateFeaturePriority(feature),
      effort: details.effort,
      impact: details.impact,
      implementation: {
        approach: `Implement ${feature} following codebase patterns`,
        steps: this.getFeatureSteps(feature),
      },
    };
  }

  /**
   * Get expected features for a route purpose (now knowledge-powered)
   */
  getExpectedFeatures(purpose, routePath = null) {
    // Try to get from knowledge system first
    if (routePath && this.knowledge) {
      try {
        const routeContext = this.knowledge.getRouteContext(routePath);
        if (routeContext?.mustHave?.length > 0) {
          return routeContext.mustHave;
        }
      } catch (e) {
        // Fall through to default expectations
      }
    }
    
    // Default expectations based on purpose
    const expectations = {
      'List View': ['search', 'filters', 'pagination', 'empty-state', 'loading-state'],
      'Detail View': ['back-navigation', 'loading-state', 'error-state'],
      'Dashboard': ['loading-state', 'error-state', 'greeting with user name'],
      'Create Form': ['form', 'loading-state', 'error-state', 'form validation'],
      'Edit Form': ['form', 'loading-state', 'error-state', 'form validation'],
      'Settings': ['form', 'tabs', 'save confirmation'],
      'Discovery': ['search', 'filters', 'player cards', 'empty-state'],
      'Pipeline': ['drag and drop', 'stage filters', 'loading-state'],
      'Messages': ['conversation list', 'message thread', 'message input'],
    };
    
    for (const [key, features] of Object.entries(expectations)) {
      if (purpose.toLowerCase().includes(key.toLowerCase())) {
        return features;
      }
    }
    
    return ['loading-state'];
  }

  /**
   * Calculate feature priority
   */
  calculateFeaturePriority(feature) {
    const priorities = {
      'loading-state': 80,
      'error-state': 75,
      'empty-state': 70,
      'search': 65,
      'pagination': 60,
      'filters': 55,
      'back-navigation': 50,
    };
    return priorities[feature] || 50;
  }

  /**
   * Get implementation steps for a feature
   */
  getFeatureSteps(feature) {
    const steps = {
      'search': [
        'Add search input with useState',
        'Filter data based on search term',
        'Add debounce for performance',
        'Show "No results" when empty',
      ],
      'pagination': [
        'Add page state (default 1)',
        'Calculate paginated data slice',
        'Add Pagination component',
        'Handle page changes',
      ],
      'empty-state': [
        'Check if data array is empty',
        'Create EmptyState component',
        'Add call-to-action if applicable',
      ],
    };
    return steps[feature] || ['Implement the feature'];
  }

  /**
   * Organize proposals by priority
   */
  organizeProposals() {
    for (const [key, proposals] of this.proposals) {
      proposals.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Generate all reports
   */
  async generateReports() {
    await fs.mkdir(path.join(this.improvementsDir, 'by-route'), { recursive: true });
    
    // 1. Master report
    await fs.writeFile(
      path.join(this.improvementsDir, 'master-report.md'),
      this.generateMasterReport()
    );
    
    // 2. Quick wins report
    await fs.writeFile(
      path.join(this.improvementsDir, 'quick-wins.md'),
      this.generateQuickWinsReport()
    );
    
    // 3. Route-specific reports
    for (const [route, proposals] of this.proposals) {
      if (route.startsWith('__')) continue;
      
      const fileName = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
      await fs.writeFile(
        path.join(this.improvementsDir, 'by-route', `${fileName}.md`),
        this.generateRouteReport(route, proposals)
      );
    }
    
    // 4. JSON export
    await fs.writeFile(
      path.join(this.improvementsDir, 'proposals.json'),
      JSON.stringify(Object.fromEntries(this.proposals), null, 2)
    );
  }

  /**
   * Generate master report
   */
  generateMasterReport() {
    const allProposals = Array.from(this.proposals.values()).flat();
    const topProposals = allProposals
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 15);
    
    return `# 🧠 MegaThink Improvement Report

> Generated: ${new Date().toISOString()}
> Total Proposals: ${allProposals.length}

---

## Executive Summary

This report contains ${allProposals.length} improvement proposals across ${this.proposals.size} areas.

### By Category

| Category | Count |
|----------|-------|
${this.getCategoryCounts(allProposals).map(([cat, count]) => `| ${cat} | ${count} |`).join('\n')}

---

## 🎯 Top 15 Priority Improvements

${topProposals.map((p, i) => `
### ${i + 1}. ${p.title}

**Route:** \`${p.route}\`
**Priority:** ${p.priority}/100
**Effort:** ${p.effort}
**Impact:** ${p.impact}

${p.description}

${p.implementation?.approach ? `**Approach:** ${p.implementation.approach}` : ''}

${p.implementation?.steps ? `**Steps:**\n${p.implementation.steps.map((s, j) => `${j + 1}. ${s}`).join('\n')}` : ''}

${p.implementation?.codeExample ? `**Code Example:**\n\`\`\`tsx\n${p.implementation.codeExample}\n\`\`\`` : ''}

---
`).join('\n')}

## 📁 Proposals by Route

${Array.from(this.proposals.entries())
  .filter(([k]) => !k.startsWith('__'))
  .map(([route, props]) => `
### ${route}
${props.slice(0, 3).map(p => `- **${p.title}** (Priority: ${p.priority})`).join('\n')}
${props.length > 3 ? `- *...and ${props.length - 3} more*` : ''}
`).join('\n')}

---

## 📊 Research Summary

${this.research.slice(0, 5).map(r => `
### ${r.query}
${r.findings.slice(0, 500)}${r.findings.length > 500 ? '...' : ''}
`).join('\n')}

---

*Generated by HelmDev MegaThink Agent*
`;
  }

  /**
   * Generate quick wins report
   */
  generateQuickWinsReport() {
    const allProposals = Array.from(this.proposals.values()).flat();
    const quickWins = allProposals
      .filter(p => p.effort === 'low' && p.priority >= 50)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);
    
    return `# ⚡ Quick Wins

> High-impact, low-effort improvements you can ship today

---

## Top ${quickWins.length} Quick Wins

${quickWins.map((p, i) => `
### ${i + 1}. ${p.title}

**Route:** \`${p.route}\`
**Priority:** ${p.priority}/100
**Estimated Time:** 15-30 minutes

${p.description}

**How to do it:**
${p.implementation?.steps?.slice(0, 3).map((s, j) => `${j + 1}. ${s}`).join('\n') || 'Follow standard implementation.'}

${p.implementation?.codeExample ? `\`\`\`tsx\n${p.implementation.codeExample}\n\`\`\`` : ''}

---
`).join('\n')}

---

*Ship these first for maximum impact with minimum effort*
`;
  }

  /**
   * Generate route-specific report
   */
  generateRouteReport(route, proposals) {
    return `# Improvements for ${route}

> ${proposals.length} proposals for this route

---

${proposals.map((p, i) => `
## ${i + 1}. ${p.title}

**Category:** ${p.category}
**Priority:** ${p.priority}/100
**Effort:** ${p.effort}
**Impact:** ${p.impact}

### Description
${p.description}

### Implementation

**Approach:** ${p.implementation?.approach || 'Standard implementation'}

**Steps:**
${p.implementation?.steps?.map((s, j) => `${j + 1}. ${s}`).join('\n') || '1. Implement the improvement'}

${p.implementation?.codeExample ? `### Code Example
\`\`\`tsx
${p.implementation.codeExample}
\`\`\`` : ''}

---
`).join('\n')}
`;
  }

  /**
   * Get category counts
   */
  getCategoryCounts(proposals) {
    const counts = {};
    for (const p of proposals) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }
}
