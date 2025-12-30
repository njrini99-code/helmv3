/**
 * ImplementationReasoning
 * 
 * Teaches agents HOW TO THINK about feature implementations.
 * Instead of hardcoded templates, this provides:
 * 
 * 1. DOMAIN AWARENESS - What matters in baseball/golf/recruiting
 * 2. PATTERN RECOGNITION - What type of feature is this?
 * 3. COMPLETENESS CHECKLIST - What does EVERY feature need?
 * 4. CODEBASE AWARENESS - What already exists to reuse?
 * 5. REASONING FRAMEWORK - How to derive requirements
 * 
 * Agents use this to REASON about implementations, not just fill templates.
 */

// ============================================
// DOMAIN AWARENESS
// ============================================

export const DomainKnowledge = {
  baseball: {
    name: 'Baseball',
    
    // Core entities and their important fields
    entities: {
      player: {
        description: 'A player on the roster',
        requiredFields: ['first_name', 'last_name', 'team_id'],
        importantFields: [
          'jersey_number',
          'primary_position', // P, C, 1B, 2B, 3B, SS, LF, CF, RF, DH
          'secondary_positions',
          'batting_hand', // L, R, S (switch)
          'throwing_hand', // L, R
          'graduation_year',
        ],
        statsFields: [
          'batting_avg', 'on_base_pct', 'slugging_pct', 'ops',
          'home_runs', 'rbi', 'stolen_bases',
          'era', 'wins', 'losses', 'saves', 'strikeouts',
        ],
        displayPatterns: {
          name: '{first_name} {last_name}',
          shortName: '{first_name[0]}. {last_name}',
          jersey: '#{jersey_number}',
          handedness: '{batting_hand}/{throwing_hand}',
          statLine: '.{batting_avg} / {home_runs} HR / {rbi} RBI',
        },
      },
      
      lineup: {
        description: 'Batting order and defensive positions for a game',
        requiredFields: ['team_id', 'name'],
        structure: {
          battingOrder: { slots: 9, field: 'batting_order', range: [1, 9] },
          positions: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
          bench: { roles: ['PH', 'PR', 'DEF'] },
        },
        businessRules: [
          'Each batting order slot (1-9) must have exactly one player',
          'Each player can only appear once in the lineup',
          'Defensive positions should not duplicate (except DH)',
          'Batting order has strategic meaning (leadoff, cleanup, etc.)',
        ],
        interactions: [
          'Drag players from roster to batting slots',
          'Change defensive position via dropdown',
          'Reorder by dragging between slots',
          'Add players to bench',
        ],
      },
      
      event: {
        description: 'Games, practices, and team activities',
        types: ['game', 'practice', 'scrimmage', 'meeting', 'tryout', 'camp', 'showcase', 'tournament'],
        requiredFields: ['team_id', 'title', 'event_type', 'start_time', 'end_time'],
        gameSpecific: ['opponent_name', 'is_home', 'home_score', 'away_score', 'game_result'],
        recurrence: ['daily', 'weekly', 'monthly'],
        attendance: ['present', 'absent', 'late', 'excused'],
      },
      
      prospect: {
        description: 'Recruiting pipeline prospect',
        stages: ['lead', 'contacted', 'interested', 'visited', 'offered', 'committed', 'signed', 'passed'],
        requiredFields: ['team_id', 'first_name', 'last_name', 'pipeline_stage'],
        recruitingFields: [
          'high_school_name', 'graduation_year', 'gpa',
          'primary_position', 'velocity', 'exit_velocity', 'sixty_time',
          'interest_level', 'priority',
        ],
        activities: ['note', 'email', 'call', 'text', 'visit', 'offer', 'stage_change'],
      },
    },
    
    // Position knowledge
    positions: {
      all: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL'],
      infield: ['P', 'C', '1B', '2B', '3B', 'SS'],
      outfield: ['LF', 'CF', 'RF'],
      labels: {
        'P': 'Pitcher', 'C': 'Catcher', '1B': 'First Base', '2B': 'Second Base',
        '3B': 'Third Base', 'SS': 'Shortstop', 'LF': 'Left Field',
        'CF': 'Center Field', 'RF': 'Right Field', 'DH': 'Designated Hitter',
      },
    },
    
    // Batting order strategy
    battingOrderStrategy: {
      1: 'Leadoff - High OBP, speed, sees many pitches',
      2: 'Two-hole - Contact hitter, can bunt, moves runners',
      3: 'Three-hole - Best overall hitter, high AVG + power',
      4: 'Cleanup - Power hitter, drives in runs',
      5: 'Five-hole - Second power hitter',
      6: 'Six-hole - Solid hitter, less pressure',
      7: 'Seven-hole - Often developing players',
      8: 'Eight-hole - Sets up top of order',
      9: 'Nine-hole - Second leadoff or pitcher spot',
    },
  },
  
  golf: {
    name: 'Golf',
    
    entities: {
      player: {
        requiredFields: ['first_name', 'last_name', 'team_id'],
        importantFields: [
          'handicap',
          'average_score',
          'graduation_year',
        ],
        statsFields: [
          'scoring_average', 'handicap_index',
          'fairways_hit_pct', 'greens_in_regulation_pct',
          'putts_per_round', 'birdies', 'eagles',
        ],
      },
      
      round: {
        description: 'A round of golf with hole-by-hole scores',
        structure: {
          holes: 18,
          perHole: ['strokes', 'putts', 'fairway_hit', 'green_in_regulation'],
        },
      },
      
      tournament: {
        description: 'Golf tournament with multiple rounds',
        structure: ['qualifying', 'round1', 'round2', 'round3', 'final'],
      },
    },
  },
};

// ============================================
// PATTERN RECOGNITION
// ============================================

export const FeaturePatterns = {
  // Recognize what TYPE of feature this is
  patterns: {
    list: {
      signals: ['list', 'view', 'browse', 'search', 'filter', 'table'],
      needs: ['fetch query', 'loading state', 'empty state', 'search/filter', 'pagination'],
      components: ['List', 'Card', 'EmptyState', 'SearchBar', 'FilterTabs'],
    },
    
    crud: {
      signals: ['add', 'create', 'edit', 'update', 'delete', 'manage'],
      needs: ['form', 'validation', 'create mutation', 'update mutation', 'delete confirmation'],
      components: ['Form', 'Dialog', 'ConfirmDialog'],
    },
    
    dragDrop: {
      signals: ['drag', 'drop', 'reorder', 'arrange', 'builder', 'organize'],
      needs: ['@dnd-kit', 'draggable items', 'drop zones', 'reorder logic', 'save order'],
      components: ['DndContext', 'Draggable', 'Droppable', 'DragOverlay'],
      library: '@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities',
    },
    
    calendar: {
      signals: ['calendar', 'schedule', 'event', 'date', 'time', 'booking'],
      needs: ['date picker', 'time slots', 'month/week/day views', 'event display'],
      components: ['Calendar', 'EventCard', 'DatePicker', 'TimePicker'],
    },
    
    pipeline: {
      signals: ['pipeline', 'stage', 'kanban', 'workflow', 'status', 'funnel'],
      needs: ['stages', 'drag between stages', 'stage counts', 'filters'],
      components: ['KanbanBoard', 'StageColumn', 'ProspectCard'],
    },
    
    messaging: {
      signals: ['message', 'chat', 'communication', 'announce', 'notify'],
      needs: ['message list', 'compose', 'threads', 'read status', 'notifications'],
      components: ['MessageList', 'Composer', 'Thread'],
    },
    
    tracking: {
      signals: ['track', 'log', 'record', 'attendance', 'check-in', 'stats'],
      needs: ['quick input', 'history', 'aggregations', 'charts'],
      components: ['Tracker', 'HistoryList', 'StatsChart'],
    },
    
    import: {
      signals: ['import', 'upload', 'csv', 'bulk', 'batch'],
      needs: ['file upload', 'parsing', 'preview', 'mapping', 'validation'],
      components: ['FileDropzone', 'PreviewTable', 'MappingUI'],
    },
    
    export: {
      signals: ['export', 'download', 'csv', 'pdf', 'share', 'print'],
      needs: ['data formatting', 'file generation', 'download trigger'],
      functions: ['exportToCSV', 'exportToPDF', 'generateShareLink'],
    },
  },
  
  // Detect patterns from feature description
  detectPatterns(featureTitle, featureDescription) {
    const text = `${featureTitle} ${featureDescription}`.toLowerCase();
    const detected = [];
    
    for (const [patternName, pattern] of Object.entries(this.patterns)) {
      const matchCount = pattern.signals.filter(s => text.includes(s)).length;
      if (matchCount > 0) {
        detected.push({ pattern: patternName, confidence: matchCount / pattern.signals.length, ...pattern });
      }
    }
    
    return detected.sort((a, b) => b.confidence - a.confidence);
  },
};

// ============================================
// COMPLETENESS CHECKLIST
// ============================================

export const CompletenessChecklist = {
  // What EVERY feature needs - agents should check each item
  universal: {
    database: {
      question: 'Does this feature need to persist data?',
      ifYes: [
        'Define table schema with all fields',
        'Add proper indexes for query patterns',
        'Add RLS policies for security',
        'Add updated_at trigger',
        'Consider foreign keys and cascades',
      ],
    },
    
    types: {
      question: 'What TypeScript types are needed?',
      always: [
        'Main entity interface (e.g., Player, Event)',
        'Form data interface',
        'API payload types',
        'Component prop types',
      ],
    },
    
    states: {
      question: 'What UI states must be handled?',
      always: [
        'Loading state (skeleton)',
        'Empty state (no data)',
        'Error state (fetch failed)',
        'Success state (data loaded)',
      ],
      ifForm: [
        'Validation errors',
        'Submitting state',
        'Success feedback',
      ],
    },
    
    interactions: {
      question: 'What user interactions are needed?',
      consider: [
        'Create new item',
        'Edit existing item',
        'Delete with confirmation',
        'Search/filter',
        'Sort',
        'Bulk actions',
        'Keyboard shortcuts',
      ],
    },
    
    accessibility: {
      always: [
        'Keyboard navigation',
        'Focus management',
        'ARIA labels',
        'Screen reader text',
        'Color contrast',
      ],
    },
    
    mobile: {
      always: [
        'Responsive layout',
        'Touch targets (min 44px)',
        'Swipe gestures where appropriate',
        'Bottom sheet for mobile modals',
      ],
    },
    
    exports: {
      question: 'Should users be able to export this data?',
      options: [
        'CSV export',
        'PDF export',
        'Print view',
        'Share link',
        'Copy to clipboard',
      ],
    },
  },
  
  // Feature-specific checklists
  byPattern: {
    list: [
      'Pagination or infinite scroll for large datasets',
      'Search with debounce',
      'Filter persistence (URL or localStorage)',
      'Sort indicators',
      'Row click action',
      'Bulk selection',
    ],
    
    form: [
      'Client-side validation',
      'Server-side validation',
      'Required field indicators',
      'Error messages per field',
      'Dirty state tracking',
      'Unsaved changes warning',
      'Auto-save (if appropriate)',
    ],
    
    dragDrop: [
      'Visual feedback during drag',
      'Drop zone highlighting',
      'Keyboard alternative',
      'Touch support',
      'Revert on drop failure',
      'Optimistic updates',
    ],
  },
};

// ============================================
// CODEBASE AWARENESS
// ============================================

export const CodebaseAwareness = {
  // Existing patterns in Helm codebase
  existingPatterns: {
    hooks: {
      pattern: 'use{Entity}s(teamId)',
      example: 'usePlayers(teamId)',
      returns: '{ data, isLoading, error, create, update, delete }',
      library: '@tanstack/react-query',
    },
    
    supabase: {
      client: '@/lib/supabase/client',
      server: '@/lib/supabase/server',
      pattern: 'createClient() -> .from(table).select().eq()',
    },
    
    components: {
      ui: '@/components/ui/*',
      available: ['Button', 'Input', 'Label', 'Select', 'Dialog', 'Table', 'Card', 'Badge', 'Tabs'],
    },
    
    styling: {
      framework: 'Tailwind CSS',
      theme: {
        background: '#0a0a0a',
        surface: 'bg-white/5',
        border: 'border-white/10',
        text: 'text-white/80',
        muted: 'text-white/40',
        accent: 'green-500',
      },
      patterns: {
        card: 'rounded-2xl bg-white/5 border border-white/10 p-6',
        input: 'h-12 bg-white/5 border-white/10 rounded-xl',
        button: 'rounded-xl',
        hover: 'hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200',
      },
    },
    
    toast: {
      library: 'sonner',
      usage: "toast.success('Message') / toast.error('Error')",
    },
  },
  
  // What to REUSE vs CREATE
  reuseVsCreate: {
    reuse: [
      'UI components from @/components/ui',
      'Supabase client setup',
      'React Query patterns',
      'Toast notifications',
      'Form validation patterns',
      'Loading skeletons',
    ],
    create: [
      'Feature-specific components',
      'Custom hooks for this data',
      'Database tables',
      'TypeScript types',
    ],
  },
};

// ============================================
// REASONING FRAMEWORK
// ============================================

export const ReasoningFramework = {
  /**
   * How to reason about a feature implementation
   * Agents should follow this process
   */
  process: [
    {
      step: 1,
      name: 'Understand the Feature',
      questions: [
        'What is the user trying to accomplish?',
        'What entities/data are involved?',
        'What are the key interactions?',
        'What does success look like?',
      ],
    },
    {
      step: 2,
      name: 'Identify Domain Context',
      questions: [
        'What domain is this in? (baseball, golf, etc.)',
        'What domain-specific fields/concepts apply?',
        'Are there business rules specific to this domain?',
        'What terminology should be used?',
      ],
    },
    {
      step: 3,
      name: 'Recognize Patterns',
      questions: [
        'Is this a list? CRUD? Drag-drop? Pipeline?',
        'What similar features exist in the codebase?',
        'What patterns from other apps apply? (Linear, Notion, etc.)',
      ],
    },
    {
      step: 4,
      name: 'Define Data Model',
      questions: [
        'What tables are needed?',
        'What are ALL the fields? (don\'t miss any!)',
        'What are the relationships?',
        'What indexes improve performance?',
        'What RLS policies secure the data?',
      ],
    },
    {
      step: 5,
      name: 'Design the UI',
      questions: [
        'What components are needed?',
        'What is the visual hierarchy?',
        'What are all the states? (loading, empty, error)',
        'What animations/transitions enhance UX?',
        'How does it work on mobile?',
      ],
    },
    {
      step: 6,
      name: 'Plan Implementation',
      questions: [
        'What is the order of implementation?',
        'What can be reused from the codebase?',
        'What libraries need to be installed?',
        'What are the verification criteria?',
      ],
    },
    {
      step: 7,
      name: 'Check Completeness',
      questions: [
        'Did I handle all UI states?',
        'Did I include all fields?',
        'Did I add exports/sharing?',
        'Did I consider accessibility?',
        'Did I consider mobile?',
        'Would Claude Code have enough detail to implement this?',
      ],
    },
  ],
  
  /**
   * Given a feature, generate detailed implementation requirements
   */
  generateRequirements(feature, domain) {
    const domainContext = DomainKnowledge[domain];
    const patterns = FeaturePatterns.detectPatterns(feature.title, feature.description);
    
    return {
      feature,
      domain: domainContext,
      patterns,
      
      // What needs to be built
      deliverables: {
        database: this.reasonAboutDatabase(feature, domainContext),
        types: this.reasonAboutTypes(feature, domainContext),
        components: this.reasonAboutComponents(feature, patterns),
        hooks: this.reasonAboutHooks(feature),
        pages: this.reasonAboutPages(feature),
      },
      
      // Checklist
      checklist: this.generateChecklist(feature, patterns),
    };
  },
  
  reasonAboutDatabase(feature, domain) {
    // Reason about what tables/fields are needed
    const tables = [];
    
    // Look for entity mentions
    for (const [entityName, entity] of Object.entries(domain?.entities || {})) {
      if (feature.title.toLowerCase().includes(entityName) || 
          feature.description?.toLowerCase().includes(entityName)) {
        tables.push({
          name: entityName,
          fields: [...entity.requiredFields, ...entity.importantFields],
          description: entity.description,
        });
      }
    }
    
    return tables;
  },
  
  reasonAboutTypes(feature, domain) {
    // What TypeScript interfaces are needed
    return [
      `${feature.entityName || 'Entity'} - Main data type`,
      `${feature.entityName || 'Entity'}FormData - Form input type`,
      `Create${feature.entityName || 'Entity'}Payload - API create payload`,
      `Update${feature.entityName || 'Entity'}Payload - API update payload`,
    ];
  },
  
  reasonAboutComponents(feature, patterns) {
    const components = new Set();
    
    for (const pattern of patterns) {
      if (pattern.components) {
        pattern.components.forEach(c => components.add(c));
      }
    }
    
    // Always include
    components.add('LoadingState');
    components.add('EmptyState');
    components.add('ErrorState');
    
    return [...components];
  },
  
  reasonAboutHooks(feature) {
    return [
      `use${feature.entityName || 'Data'} - Fetch and mutate data`,
    ];
  },
  
  reasonAboutPages(feature) {
    return [
      `${feature.route}/page.tsx - Main page`,
      feature.hasDetail ? `${feature.route}/[id]/page.tsx - Detail page` : null,
    ].filter(Boolean);
  },
  
  generateChecklist(feature, patterns) {
    const checklist = [...CompletenessChecklist.universal.states.always];
    
    for (const pattern of patterns) {
      const patternChecklist = CompletenessChecklist.byPattern[pattern.pattern];
      if (patternChecklist) {
        checklist.push(...patternChecklist);
      }
    }
    
    return [...new Set(checklist)];
  },
};

// ============================================
// IMPLEMENTATION GENERATOR
// ============================================

export class ImplementationGenerator {
  constructor() {
    this.domainKnowledge = DomainKnowledge;
    this.patterns = FeaturePatterns;
    this.checklist = CompletenessChecklist;
    this.codebase = CodebaseAwareness;
    this.reasoning = ReasoningFramework;
  }
  
  /**
   * Generate a complete, detailed implementation guide for ANY feature
   */
  generate(feature, options = {}) {
    const { route, domain = 'baseball', code } = options;
    
    // Step 1: Understand domain context
    const domainContext = this.domainKnowledge[domain];
    
    // Step 2: Detect patterns
    const detectedPatterns = this.patterns.detectPatterns(
      feature.title, 
      feature.description || ''
    );
    
    // Step 3: Identify relevant entities
    const relevantEntities = this.identifyEntities(feature, domainContext);
    
    // Step 4: Generate database schema
    const schema = this.generateSchema(feature, relevantEntities, domainContext);
    
    // Step 5: Generate TypeScript types
    const types = this.generateTypes(feature, relevantEntities, domainContext);
    
    // Step 6: Generate component list with descriptions
    const components = this.generateComponentList(feature, detectedPatterns);
    
    // Step 7: Generate hook specification
    const hooks = this.generateHookSpec(feature, relevantEntities);
    
    // Step 8: Generate step-by-step tasks
    const tasks = this.generateTasks(feature, detectedPatterns, components);
    
    // Step 9: Generate checklist
    const checklist = this.generateChecklist(feature, detectedPatterns);
    
    return {
      feature,
      domain: domainContext?.name || domain,
      patterns: detectedPatterns.map(p => p.pattern),
      entities: relevantEntities,
      schema,
      types,
      components,
      hooks,
      tasks,
      checklist,
      
      // For the MD
      metadata: {
        route,
        effort: feature.effort || this.estimateEffort(components.length, schema.tables?.length),
        impact: feature.impact || 'high',
      },
    };
  }
  
  identifyEntities(feature, domainContext) {
    const entities = [];
    const text = `${feature.title} ${feature.description || ''}`.toLowerCase();
    
    if (!domainContext?.entities) return entities;
    
    for (const [name, entity] of Object.entries(domainContext.entities)) {
      if (text.includes(name) || text.includes(name.replace('_', ' '))) {
        entities.push({ name, ...entity });
      }
    }
    
    // If no entities found, try to infer from feature type
    if (entities.length === 0) {
      if (text.includes('roster') || text.includes('player')) {
        entities.push({ name: 'player', ...domainContext.entities.player });
      }
      if (text.includes('lineup') || text.includes('batting')) {
        entities.push({ name: 'lineup', ...domainContext.entities.lineup });
      }
      if (text.includes('event') || text.includes('game') || text.includes('practice')) {
        entities.push({ name: 'event', ...domainContext.entities.event });
      }
      if (text.includes('recruit') || text.includes('prospect') || text.includes('pipeline')) {
        entities.push({ name: 'prospect', ...domainContext.entities.prospect });
      }
    }
    
    return entities;
  }
  
  generateSchema(feature, entities, domainContext) {
    if (entities.length === 0) {
      return { tables: [], note: 'No database changes needed or entity not recognized' };
    }
    
    const tables = [];
    
    for (const entity of entities) {
      const fields = [
        'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
        'team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE',
      ];
      
      // Add entity-specific fields
      if (entity.requiredFields) {
        entity.requiredFields.forEach(f => {
          if (f !== 'team_id') fields.push(`${f} TEXT NOT NULL`);
        });
      }
      
      if (entity.importantFields) {
        entity.importantFields.forEach(f => {
          fields.push(`${f} TEXT`); // Simplified - real impl would have proper types
        });
      }
      
      // Add timestamps
      fields.push('created_at TIMESTAMPTZ DEFAULT now()');
      fields.push('updated_at TIMESTAMPTZ DEFAULT now()');
      
      tables.push({
        name: `${entity.name}s`,
        fields,
        indexes: [`idx_${entity.name}s_team ON ${entity.name}s(team_id)`],
        rls: true,
      });
      
      // Add related tables based on entity structure
      if (entity.structure) {
        // e.g., lineup has positions
        if (entity.name === 'lineup') {
          tables.push({
            name: 'lineup_positions',
            fields: [
              'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
              'lineup_id UUID NOT NULL REFERENCES lineups(id) ON DELETE CASCADE',
              'player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE',
              'batting_order INTEGER NOT NULL CHECK (batting_order BETWEEN 1 AND 9)',
              `position TEXT NOT NULL CHECK (position IN (${entity.structure.positions.map(p => `'${p}'`).join(',')}))`,
              'created_at TIMESTAMPTZ DEFAULT now()',
              'UNIQUE(lineup_id, batting_order)',
              'UNIQUE(lineup_id, player_id)',
            ],
            indexes: ['idx_lineup_positions_lineup ON lineup_positions(lineup_id)'],
            rls: true,
          });
        }
      }
    }
    
    return { tables };
  }
  
  generateTypes(feature, entities, domainContext) {
    const types = [];
    
    for (const entity of entities) {
      // Main interface
      types.push({
        name: this.capitalize(entity.name),
        fields: [
          'id: string',
          'team_id: string',
          ...(entity.requiredFields || []).map(f => `${f}: string`),
          ...(entity.importantFields || []).map(f => `${f}: string | null`),
          'created_at: string',
          'updated_at: string',
        ],
      });
      
      // Form data interface
      types.push({
        name: `${this.capitalize(entity.name)}FormData`,
        fields: [
          ...(entity.requiredFields || []).filter(f => f !== 'team_id').map(f => `${f}: string`),
          ...(entity.importantFields || []).map(f => `${f}: string`),
        ],
      });
    }
    
    return types;
  }
  
  generateComponentList(feature, patterns) {
    const components = [];
    
    // Based on detected patterns
    for (const pattern of patterns) {
      if (pattern.components) {
        for (const comp of pattern.components) {
          components.push({
            name: comp,
            purpose: this.getComponentPurpose(comp, pattern.pattern),
            path: this.getComponentPath(feature, comp),
          });
        }
      }
    }
    
    // Always include state components
    components.push(
      { name: 'LoadingSkeleton', purpose: 'Skeleton loading state', path: 'src/components/ui/loading-skeleton.tsx' },
      { name: 'EmptyState', purpose: 'No data state with CTA', path: 'src/components/ui/empty-state.tsx' },
    );
    
    return components;
  }
  
  getComponentPurpose(name, pattern) {
    const purposes = {
      'List': 'Display collection of items with search/filter',
      'Card': 'Individual item display with key info',
      'Form': 'Create/edit form with validation',
      'Dialog': 'Modal for create/edit actions',
      'ConfirmDialog': 'Delete confirmation dialog',
      'DndContext': 'Drag and drop context wrapper',
      'Draggable': 'Draggable item component',
      'Droppable': 'Drop target zone',
      'DragOverlay': 'Visual feedback during drag',
      'SearchBar': 'Search input with debounce',
      'FilterTabs': 'Filter tabs/buttons',
      'EmptyState': 'Empty state with illustration and CTA',
      'LoadingSkeleton': 'Loading skeleton animation',
    };
    return purposes[name] || `${name} component for ${pattern}`;
  }
  
  getComponentPath(feature, componentName) {
    const folder = feature.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `src/components/${folder}/${componentName.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)}.tsx`;
  }
  
  generateHookSpec(feature, entities) {
    const hooks = [];
    
    for (const entity of entities) {
      hooks.push({
        name: `use${this.capitalize(entity.name)}s`,
        path: `src/hooks/use-${entity.name}s.ts`,
        returns: [
          `${entity.name}s: ${this.capitalize(entity.name)}[]`,
          'isLoading: boolean',
          'error: Error | null',
          `create: (data) => Promise<${this.capitalize(entity.name)}>`,
          `update: (id, data) => Promise<${this.capitalize(entity.name)}>`,
          'delete: (id) => Promise<void>',
        ],
      });
    }
    
    return hooks;
  }
  
  generateTasks(feature, patterns, components) {
    const tasks = [];
    let step = 1;
    
    // Database
    tasks.push({
      step: step++,
      title: 'Create database tables',
      file: `supabase/migrations/${Date.now()}_create_${feature.title.toLowerCase().replace(/\s+/g, '_')}.sql`,
      description: 'Create tables with all fields, indexes, and RLS policies',
      verification: ['Tables visible in Supabase', 'RLS policies active'],
    });
    
    // Types
    tasks.push({
      step: step++,
      title: 'Add TypeScript types',
      file: `src/types/${feature.title.toLowerCase().replace(/\s+/g, '-')}.ts`,
      description: 'Define all interfaces and type exports',
      verification: ['No TypeScript errors', 'Types importable'],
    });
    
    // Libraries
    const needsDnd = patterns.some(p => p.pattern === 'dragDrop');
    if (needsDnd) {
      tasks.push({
        step: step++,
        title: 'Install @dnd-kit',
        command: 'npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities',
        description: 'Install drag-and-drop library',
        verification: ['Package in package.json'],
      });
    }
    
    // Hook
    tasks.push({
      step: step++,
      title: 'Create data hook',
      file: `src/hooks/use-${feature.title.toLowerCase().replace(/\s+/g, '-')}.ts`,
      description: 'React Query hook for fetch/mutate',
      verification: ['Hook returns data', 'Mutations work'],
    });
    
    // Components
    for (const comp of components.filter(c => !['LoadingSkeleton', 'EmptyState'].includes(c.name))) {
      tasks.push({
        step: step++,
        title: `Create ${comp.name} component`,
        file: comp.path,
        description: comp.purpose,
        verification: ['Component renders', 'No console errors'],
      });
    }
    
    // Integration
    tasks.push({
      step: step++,
      title: 'Add to page',
      file: `src/app${feature.route || '/dashboard'}/page.tsx`,
      description: 'Integrate components into the page',
      verification: ['Feature accessible', 'All functionality works'],
    });
    
    // Testing
    tasks.push({
      step: step++,
      title: 'Test complete flow',
      description: 'End-to-end testing of all functionality',
      verification: [
        'Create works',
        'Edit works',
        'Delete works',
        'Loading state shows',
        'Empty state shows',
        'Mobile responsive',
      ],
    });
    
    return tasks;
  }
  
  generateChecklist(feature, patterns) {
    const checklist = [];
    
    // Universal items
    checklist.push(
      '[ ] Loading skeleton implemented',
      '[ ] Empty state with CTA implemented',
      '[ ] Error state handled',
      '[ ] Form validation working',
      '[ ] Success/error toasts showing',
      '[ ] Mobile responsive',
      '[ ] No TypeScript errors',
      '[ ] No console.log statements',
    );
    
    // Pattern-specific
    for (const pattern of patterns) {
      const patternItems = CompletenessChecklist.byPattern[pattern.pattern];
      if (patternItems) {
        patternItems.forEach(item => checklist.push(`[ ] ${item}`));
      }
    }
    
    return [...new Set(checklist)];
  }
  
  estimateEffort(componentCount, tableCount) {
    const total = (componentCount || 0) + (tableCount || 0) * 2;
    if (total <= 3) return 'low';
    if (total <= 7) return 'medium';
    return 'high';
  }
  
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export default new ImplementationGenerator();
