/**
 * AgentThinking - Shared Intelligence for All Agents
 * 
 * This module provides decision-making frameworks that all agents can use to:
 * 
 * 1. ASSESS - Understand what they're looking at
 * 2. PRIORITIZE - Decide what's important
 * 3. DETAIL - Determine appropriate depth of analysis
 * 4. CONNECT - Find relationships to other features
 * 5. IMPLEMENT - Know what's needed to build it
 * 
 * Think of this as the "brain" that makes all agents smart.
 */

// ============================================
// ASSESSMENT FRAMEWORKS
// ============================================

export const Assessment = {
  /**
   * Assess the scope of work for any issue/feature
   */
  assessScope(issue) {
    const title = (issue.title || '').toLowerCase();
    const desc = (issue.description || '').toLowerCase();
    const combined = `${title} ${desc}`;

    return {
      // Is this UI-only, backend-only, or full-stack?
      stack: this.determineStack(combined),
      
      // Is this new feature, enhancement, bug fix, or refactor?
      type: this.determineType(combined),
      
      // What domain does this belong to?
      domain: this.determineDomain(combined),
      
      // How many systems does this touch?
      breadth: this.determineBreadth(combined),
      
      // How deep does the change go?
      depth: this.determineDepth(combined),
    };
  },

  determineStack(text) {
    const uiSignals = ['button', 'modal', 'form', 'card', 'list', 'display', 'show', 'view', 'ui', 'design', 'layout', 'style', 'animation'];
    const backendSignals = ['api', 'database', 'schema', 'table', 'query', 'rls', 'policy', 'migration', 'function', 'trigger'];
    
    const hasUI = uiSignals.some(s => text.includes(s));
    const hasBackend = backendSignals.some(s => text.includes(s));
    
    if (hasUI && hasBackend) return 'fullstack';
    if (hasBackend) return 'backend';
    return 'frontend';
  },

  determineType(text) {
    if (/add|create|new|implement|build/.test(text)) return 'new-feature';
    if (/improve|enhance|better|upgrade|polish/.test(text)) return 'enhancement';
    if (/fix|bug|broken|error|issue|wrong/.test(text)) return 'bugfix';
    if (/refactor|clean|reorganize|restructure/.test(text)) return 'refactor';
    if (/missing|need|should|must/.test(text)) return 'gap';
    return 'unknown';
  },

  determineDomain(text) {
    const domains = {
      'roster|player|team': 'roster',
      'calendar|event|schedule|practice|game': 'calendar',
      'message|announce|communicate|notification': 'messaging',
      'recruit|prospect|pipeline|coach': 'recruiting',
      'stat|score|metric|performance': 'stats',
      'lineup|batting|position|order': 'lineup',
      'payment|billing|subscription': 'billing',
      'auth|login|signup|permission': 'auth',
      'setting|config|preference': 'settings',
    };

    for (const [pattern, domain] of Object.entries(domains)) {
      if (new RegExp(pattern).test(text)) return domain;
    }
    return 'general';
  },

  determineBreadth(text) {
    let score = 0;
    
    // Each mention of a different system/domain increases breadth
    const systems = ['database', 'api', 'ui', 'auth', 'storage', 'email', 'notification', 'analytics'];
    systems.forEach(s => { if (text.includes(s)) score++; });
    
    if (score <= 1) return 'narrow';
    if (score <= 3) return 'moderate';
    return 'wide';
  },

  determineDepth(text) {
    // Deep changes are architectural, foundational, or systemic
    const deepSignals = ['schema', 'architecture', 'refactor', 'migration', 'all', 'every', 'system'];
    const deepCount = deepSignals.filter(s => text.includes(s)).length;
    
    if (deepCount >= 2) return 'deep';
    if (deepCount === 1) return 'moderate';
    return 'shallow';
  },
};

// ============================================
// PRIORITIZATION FRAMEWORK
// ============================================

export const Prioritization = {
  /**
   * Prioritize an issue based on multiple factors
   */
  prioritize(issue, context = {}) {
    const scores = {
      userImpact: this.scoreUserImpact(issue),
      frequency: this.scoreFrequency(issue),
      effort: this.scoreEffort(issue),
      dependencies: this.scoreDependencies(issue, context),
      strategic: this.scoreStrategic(issue, context),
    };

    // Calculate weighted priority
    const totalScore = 
      scores.userImpact * 0.3 +
      scores.frequency * 0.2 +
      (10 - scores.effort) * 0.2 + // Lower effort = higher priority
      scores.strategic * 0.2 +
      scores.dependencies * 0.1;

    return {
      scores,
      totalScore,
      priority: this.scoreToPriority(totalScore),
      recommendation: this.generateRecommendation(scores, totalScore),
    };
  },

  scoreUserImpact(issue) {
    const title = (issue.title || '').toLowerCase();
    const severity = issue.severity || 'info';
    
    let score = 5; // Base score
    
    // Severity modifiers
    if (severity === 'error') score += 3;
    if (severity === 'warning') score += 1;
    
    // High-impact keywords
    const highImpact = ['broken', 'crash', 'error', 'fail', 'cannot', 'blocked', 'unusable'];
    const mediumImpact = ['missing', 'need', 'should', 'improve', 'slow', 'confusing'];
    
    if (highImpact.some(k => title.includes(k))) score += 3;
    if (mediumImpact.some(k => title.includes(k))) score += 1;
    
    return Math.min(10, Math.max(1, score));
  },

  scoreFrequency(issue) {
    const title = (issue.title || '').toLowerCase();
    
    // Keywords indicating frequency
    const highFrequency = ['every', 'always', 'daily', 'constantly', 'all users', 'everyone'];
    const mediumFrequency = ['often', 'regularly', 'common', 'many', 'most'];
    const lowFrequency = ['sometimes', 'occasional', 'rare', 'few'];
    
    if (highFrequency.some(k => title.includes(k))) return 9;
    if (mediumFrequency.some(k => title.includes(k))) return 6;
    if (lowFrequency.some(k => title.includes(k))) return 3;
    
    return 5; // Default to medium
  },

  scoreEffort(issue) {
    const effort = issue.effort || 'medium';
    const effortScores = { low: 2, medium: 5, high: 8, 'very-high': 10 };
    return effortScores[effort] || 5;
  },

  scoreDependencies(issue, context) {
    // Higher score if other features depend on this
    const blocksOthers = context.blocksFeatures?.length || 0;
    const blockedBy = context.blockedByFeatures?.length || 0;
    
    let score = 5;
    if (blocksOthers > 0) score += blocksOthers * 2;
    if (blockedBy > 0) score -= blockedBy;
    
    return Math.min(10, Math.max(1, score));
  },

  scoreStrategic(issue, context) {
    const title = (issue.title || '').toLowerCase();
    
    let score = 5;
    
    // Strategic keywords
    const strategic = ['mvp', 'launch', 'critical', 'core', 'essential', 'foundation'];
    const niceToHave = ['polish', 'nice', 'bonus', 'extra', 'advanced'];
    
    if (strategic.some(k => title.includes(k))) score += 3;
    if (niceToHave.some(k => title.includes(k))) score -= 2;
    
    // Context modifiers
    if (context.isBlocking) score += 2;
    if (context.isPilotUser) score += 1;
    
    return Math.min(10, Math.max(1, score));
  },

  scoreToPriority(score) {
    if (score >= 8) return 'critical';
    if (score >= 6) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  },

  generateRecommendation(scores, total) {
    if (total >= 8) {
      return 'Address immediately - high user impact with reasonable effort';
    }
    if (scores.userImpact >= 8 && scores.effort <= 4) {
      return 'Quick win - high impact, low effort';
    }
    if (scores.userImpact >= 7 && scores.effort >= 7) {
      return 'Important but plan carefully - high impact, high effort';
    }
    if (scores.userImpact <= 4 && scores.effort >= 6) {
      return 'Consider deprioritizing - low impact, high effort';
    }
    return 'Standard priority - implement when resources allow';
  },
};

// ============================================
// DETAIL LEVEL DETERMINATION
// ============================================

export const DetailLevel = {
  /**
   * Determine how much detail to provide based on context
   */
  determine(issue, audience = 'developer') {
    const scope = Assessment.assessScope(issue);
    const priority = Prioritization.prioritize(issue);

    // More detail for:
    // - Higher priority items
    // - Full-stack work
    // - Complex features
    // - Developer audience
    
    let level = 'standard';
    
    if (priority.priority === 'critical' || priority.priority === 'high') {
      level = 'detailed';
    }
    
    if (scope.stack === 'fullstack' || scope.breadth === 'wide') {
      level = 'detailed';
    }
    
    if (scope.depth === 'deep') {
      level = 'comprehensive';
    }
    
    return {
      level,
      include: this.getInclusions(level),
      exclude: this.getExclusions(level),
    };
  },

  getInclusions(level) {
    const base = ['title', 'description', 'priority', 'severity'];
    
    const standard = [...base, 'why', 'result', 'effort'];
    
    const detailed = [...standard, 
      'implementation.approach',
      'implementation.components',
      'implementation.hooks',
      'tasks',
      'verification',
    ];
    
    const comprehensive = [...detailed,
      'implementation.schema',
      'implementation.rls',
      'implementation.types',
      'implementation.fullCode',
      'tests',
      'metrics',
      'industryComparison',
    ];

    switch (level) {
      case 'minimal': return base;
      case 'standard': return standard;
      case 'detailed': return detailed;
      case 'comprehensive': return comprehensive;
      default: return standard;
    }
  },

  getExclusions(level) {
    switch (level) {
      case 'minimal': return ['implementation', 'tasks', 'verification', 'metrics'];
      case 'standard': return ['fullCode', 'tests', 'industryComparison'];
      case 'detailed': return ['industryComparison'];
      case 'comprehensive': return [];
      default: return [];
    }
  },
};

// ============================================
// CONNECTION FINDING
// ============================================

export const Connections = {
  /**
   * Find connections between features
   */
  findConnections(issue, allIssues = []) {
    const issueKeywords = this.extractKeywords(issue);
    
    const connections = {
      related: [],
      dependencies: [],
      synergies: [],
    };

    for (const other of allIssues) {
      if (other.id === issue.id) continue;
      
      const otherKeywords = this.extractKeywords(other);
      const overlap = this.calculateOverlap(issueKeywords, otherKeywords);
      
      if (overlap > 0.3) {
        connections.related.push({
          id: other.id,
          title: other.title,
          overlap,
          relationship: this.determineRelationship(issue, other),
        });
      }
    }

    // Find dependencies
    connections.dependencies = this.findDependencies(issue, allIssues);
    
    // Find synergies
    connections.synergies = this.findSynergies(issue, allIssues);

    return connections;
  },

  extractKeywords(issue) {
    const text = `${issue.title || ''} ${issue.description || ''}`.toLowerCase();
    
    // Remove common words
    const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
      'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
      'add', 'create', 'make', 'build', 'implement', 'fix', 'update', 'change'];
    
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    return words.filter(w => !stopWords.includes(w));
  },

  calculateOverlap(keywords1, keywords2) {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    
    let overlap = 0;
    for (const word of set1) {
      if (set2.has(word)) overlap++;
    }
    
    const maxSize = Math.max(set1.size, set2.size);
    return maxSize > 0 ? overlap / maxSize : 0;
  },

  determineRelationship(issue1, issue2) {
    const title1 = (issue1.title || '').toLowerCase();
    const title2 = (issue2.title || '').toLowerCase();
    
    // Same domain?
    const domain1 = Assessment.determineDomain(title1);
    const domain2 = Assessment.determineDomain(title2);
    
    if (domain1 === domain2) return 'same-domain';
    
    // Parent-child?
    if (title1.includes(title2) || title2.includes(title1)) {
      return 'parent-child';
    }
    
    return 'related';
  },

  findDependencies(issue, allIssues) {
    const dependencies = [];
    const title = (issue.title || '').toLowerCase();
    
    // Common dependency patterns
    const dependencyPatterns = {
      'filter|search': ['list', 'table', 'data'],
      'export': ['list', 'data', 'table'],
      'notification': ['event', 'message'],
      'recurring': ['event', 'calendar'],
      'stats': ['player', 'game'],
      'report': ['data', 'stats'],
    };

    for (const [feature, deps] of Object.entries(dependencyPatterns)) {
      if (new RegExp(feature).test(title)) {
        for (const other of allIssues) {
          const otherTitle = (other.title || '').toLowerCase();
          if (deps.some(d => otherTitle.includes(d))) {
            dependencies.push({
              id: other.id,
              title: other.title,
              type: 'requires',
            });
          }
        }
      }
    }

    return dependencies;
  },

  findSynergies(issue, allIssues) {
    const synergies = [];
    const title = (issue.title || '').toLowerCase();
    
    // Features that work well together
    const synergyPairs = [
      ['calendar', 'notification'],
      ['roster', 'lineup'],
      ['message', 'notification'],
      ['event', 'attendance'],
      ['recruit', 'message'],
      ['stats', 'report'],
    ];

    for (const [f1, f2] of synergyPairs) {
      if (title.includes(f1)) {
        for (const other of allIssues) {
          const otherTitle = (other.title || '').toLowerCase();
          if (otherTitle.includes(f2)) {
            synergies.push({
              id: other.id,
              title: other.title,
              synergy: `${f1} + ${f2} work well together`,
            });
          }
        }
      }
    }

    return synergies;
  },
};

// ============================================
// IMPLEMENTATION AWARENESS
// ============================================

export const Implementation = {
  /**
   * Know what's needed to implement something
   */
  whatDoesItNeed(issue) {
    const scope = Assessment.assessScope(issue);
    const needs = {
      database: [],
      types: [],
      components: [],
      hooks: [],
      libs: [],
      pages: [],
      tests: [],
    };

    // Based on domain
    switch (scope.domain) {
      case 'roster':
        needs.database.push('players table with profile fields');
        needs.types.push('Player', 'PlayerFormData');
        needs.components.push('PlayerList', 'PlayerCard', 'PlayerForm');
        needs.hooks.push('usePlayers');
        break;
        
      case 'calendar':
        needs.database.push('events table with timing fields');
        needs.types.push('Event', 'EventType', 'RecurrenceRule');
        needs.components.push('CalendarView', 'EventForm', 'EventCard');
        needs.hooks.push('useEvents');
        needs.libs.push('date-fns', 'react-big-calendar (optional)');
        break;
        
      case 'messaging':
        needs.database.push('messages table', 'message_recipients table');
        needs.types.push('Message', 'MessageRecipient');
        needs.components.push('MessageList', 'ComposeMessage', 'MessageThread');
        needs.hooks.push('useMessages');
        needs.libs.push('rich text editor (optional)');
        break;
        
      case 'recruiting':
        needs.database.push('prospects table with pipeline_stage');
        needs.types.push('Prospect', 'PipelineStage');
        needs.components.push('ProspectList', 'ProspectCard', 'PipelineBoard');
        needs.hooks.push('useProspects');
        break;
        
      case 'lineup':
        needs.database.push('lineups table', 'lineup_positions table');
        needs.types.push('Lineup', 'LineupPosition', 'BaseballPosition');
        needs.components.push('LineupBuilder', 'LineupSlot', 'PlayerCard');
        needs.hooks.push('useLineups');
        needs.libs.push('@dnd-kit/core', '@dnd-kit/sortable');
        break;
    }

    // Based on type
    if (scope.type === 'new-feature' && scope.stack === 'fullstack') {
      needs.database.push('RLS policies');
      needs.tests.push('Integration tests');
    }

    // Based on UI needs
    const title = (issue.title || '').toLowerCase();
    if (/drag|drop|sort|reorder/.test(title)) {
      needs.libs.push('@dnd-kit/core');
    }
    if (/export|csv|pdf/.test(title)) {
      needs.libs.push('Export utilities');
    }
    if (/chart|graph|visualization/.test(title)) {
      needs.libs.push('recharts or similar');
    }

    return needs;
  },

  /**
   * Generate implementation checklist
   */
  generateChecklist(issue) {
    const needs = this.whatDoesItNeed(issue);
    const scope = Assessment.assessScope(issue);
    const checklist = [];

    // Database
    if (needs.database.length > 0 && scope.stack !== 'frontend') {
      checklist.push({
        phase: 'Database',
        items: [
          { task: 'Create migration file', done: false },
          { task: 'Add tables and columns', done: false },
          { task: 'Add indexes', done: false },
          { task: 'Add RLS policies', done: false },
          { task: 'Test in Supabase dashboard', done: false },
        ],
      });
    }

    // Types
    if (needs.types.length > 0) {
      checklist.push({
        phase: 'Types',
        items: [
          { task: 'Create type file', done: false },
          { task: 'Add all interfaces', done: false },
          { task: 'Export from index', done: false },
        ],
      });
    }

    // Hooks
    if (needs.hooks.length > 0) {
      checklist.push({
        phase: 'Hooks',
        items: [
          { task: 'Create hook file', done: false },
          { task: 'Add query function', done: false },
          { task: 'Add mutations (create/update/delete)', done: false },
          { task: 'Add cache invalidation', done: false },
          { task: 'Add error handling', done: false },
        ],
      });
    }

    // Components
    if (needs.components.length > 0) {
      checklist.push({
        phase: 'Components',
        items: needs.components.map(c => ({ 
          task: `Create ${c} component`, 
          done: false 
        })).concat([
          { task: 'Add loading skeleton', done: false },
          { task: 'Add empty state', done: false },
          { task: 'Add error state', done: false },
        ]),
      });
    }

    // Integration
    checklist.push({
      phase: 'Integration',
      items: [
        { task: 'Add to page', done: false },
        { task: 'Test full flow', done: false },
        { task: 'Test on mobile', done: false },
        { task: 'Remove console.logs', done: false },
      ],
    });

    return checklist;
  },
};

// ============================================
// EXPORT UNIFIED THINKING
// ============================================

export const AgentThinking = {
  Assessment,
  Prioritization,
  DetailLevel,
  Connections,
  Implementation,
  
  /**
   * Full analysis of any issue
   */
  analyze(issue, context = {}) {
    return {
      scope: Assessment.assessScope(issue),
      priority: Prioritization.prioritize(issue, context),
      detailLevel: DetailLevel.determine(issue),
      connections: Connections.findConnections(issue, context.allIssues || []),
      implementation: Implementation.whatDoesItNeed(issue),
      checklist: Implementation.generateChecklist(issue),
    };
  },
};

export default AgentThinking;
