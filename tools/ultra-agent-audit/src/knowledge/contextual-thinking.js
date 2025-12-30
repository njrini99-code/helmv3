/**
 * ContextualThinking - Teaches agents HOW to think about features
 * 
 * Instead of hardcoded implementations, this gives agents the ability to:
 * 1. Analyze what a feature NEEDS based on its type
 * 2. Look at existing patterns in the codebase
 * 3. Generate appropriate detail dynamically
 * 4. Make decisions like a senior developer would
 */

// ============================================
// FEATURE ANALYSIS FRAMEWORK
// ============================================

export const FeatureAnalysis = {
  /**
   * Given a feature, determine what it needs
   */
  analyzeFeature(feature) {
    return {
      // What data does this feature manage?
      dataNeeds: this.analyzeDataNeeds(feature),
      
      // What UI components are required?
      uiNeeds: this.analyzeUINeeds(feature),
      
      // What interactions/behaviors?
      behaviorNeeds: this.analyzeBehaviorNeeds(feature),
      
      // What integrations?
      integrationNeeds: this.analyzeIntegrationNeeds(feature),
      
      // What's the implementation complexity?
      complexity: this.assessComplexity(feature),
    };
  },

  /**
   * Analyze data requirements from feature description
   */
  analyzeDataNeeds(feature) {
    const title = (feature.title || '').toLowerCase();
    const desc = (feature.description || '').toLowerCase();
    const combined = `${title} ${desc}`;
    
    const needs = {
      requiresNewTable: false,
      requiresNewFields: false,
      tables: [],
      fields: [],
      relationships: [],
      indexes: [],
    };

    // Detect if feature manages a collection of items
    const collectionKeywords = ['list', 'manage', 'track', 'add', 'create', 'builder', 'roster', 'lineup', 'schedule'];
    if (collectionKeywords.some(k => combined.includes(k))) {
      needs.requiresNewTable = true;
    }

    // Detect specific data types needed
    const dataPatterns = {
      'lineup|batting|order': { table: 'lineups', fields: ['batting_order', 'position', 'player_id'] },
      'attendance|check.?in|present': { table: 'attendance', fields: ['status', 'check_in_time', 'player_id', 'event_id'] },
      'schedule|event|calendar': { table: 'events', fields: ['start_time', 'end_time', 'title', 'event_type'] },
      'message|announce|communicate': { table: 'messages', fields: ['body', 'sender_id', 'recipient_type'] },
      'recruit|prospect|pipeline': { table: 'prospects', fields: ['pipeline_stage', 'interest_level', 'contact_date'] },
      'stat|score|metric': { table: 'stats', fields: ['value', 'stat_type', 'player_id'] },
      'note|comment': { table: 'notes', fields: ['content', 'entity_type', 'entity_id'] },
      'tag|label|category': { table: 'tags', fields: ['name', 'color'] },
      'file|upload|attachment': { table: 'attachments', fields: ['url', 'file_type', 'file_size'] },
    };

    for (const [pattern, config] of Object.entries(dataPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.tables.push(config.table);
        needs.fields.push(...config.fields);
      }
    }

    // Detect relationships
    if (combined.includes('player') || combined.includes('roster')) {
      needs.relationships.push('players');
    }
    if (combined.includes('team')) {
      needs.relationships.push('teams');
    }
    if (combined.includes('event') || combined.includes('game') || combined.includes('practice')) {
      needs.relationships.push('events');
    }

    return needs;
  },

  /**
   * Analyze UI requirements from feature description
   */
  analyzeUINeeds(feature) {
    const title = (feature.title || '').toLowerCase();
    const desc = (feature.description || '').toLowerCase();
    const combined = `${title} ${desc}`;

    const needs = {
      components: [],
      patterns: [],
      interactions: [],
    };

    // Detect UI patterns needed
    const uiPatterns = {
      'list|table|grid': ['ListView', 'DataTable', 'EmptyState', 'LoadingSkeleton'],
      'form|add|create|edit': ['Form', 'FormField', 'Validation', 'SubmitButton'],
      'detail|view|profile': ['DetailView', 'InfoCard', 'Tabs'],
      'modal|dialog|popup': ['Modal', 'DialogForm'],
      'drag|drop|reorder|sort': ['DragDropContext', 'SortableList', 'DragHandle'],
      'search|filter': ['SearchInput', 'FilterDropdown', 'FilterChips'],
      'calendar|schedule': ['CalendarView', 'DatePicker', 'TimePicker'],
      'card|tile': ['Card', 'CardGrid', 'CardActions'],
      'select|choose|pick': ['Select', 'MultiSelect', 'Combobox'],
      'toggle|switch|check': ['Toggle', 'Checkbox', 'RadioGroup'],
      'upload|import': ['FileUpload', 'ImportDialog', 'ProgressBar'],
      'export|download': ['ExportButton', 'CSVExport'],
      'share|link': ['ShareDialog', 'CopyLink'],
    };

    for (const [pattern, components] of Object.entries(uiPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.components.push(...components);
        needs.patterns.push(pattern.split('|')[0]);
      }
    }

    // Detect interaction patterns
    const interactionPatterns = {
      'click|tap|press': 'click-action',
      'hover|tooltip': 'hover-feedback',
      'drag|drop': 'drag-drop',
      'swipe': 'swipe-gesture',
      'scroll|infinite': 'infinite-scroll',
      'real.?time|live': 'realtime-updates',
    };

    for (const [pattern, interaction] of Object.entries(interactionPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.interactions.push(interaction);
      }
    }

    return needs;
  },

  /**
   * Analyze behavior/logic requirements
   */
  analyzeBehaviorNeeds(feature) {
    const title = (feature.title || '').toLowerCase();
    const desc = (feature.description || '').toLowerCase();
    const combined = `${title} ${desc}`;

    const needs = {
      crud: [],
      validation: [],
      businessLogic: [],
      hooks: [],
    };

    // CRUD operations
    if (/add|create|new/.test(combined)) needs.crud.push('create');
    if (/view|display|show|list/.test(combined)) needs.crud.push('read');
    if (/edit|update|change|modify/.test(combined)) needs.crud.push('update');
    if (/delete|remove|archive/.test(combined)) needs.crud.push('delete');

    // Validation needs
    const validationPatterns = {
      'required|mandatory': 'required-fields',
      'unique|duplicate': 'uniqueness',
      'email': 'email-format',
      'phone': 'phone-format',
      'date|time': 'date-validation',
      'number|amount|count': 'numeric-validation',
      'range|between|limit': 'range-validation',
    };

    for (const [pattern, validation] of Object.entries(validationPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.validation.push(validation);
      }
    }

    // Business logic
    const logicPatterns = {
      'calculate|compute|sum|average': 'calculations',
      'filter|search|find': 'filtering',
      'sort|order|rank': 'sorting',
      'group|categorize': 'grouping',
      'notify|alert|remind': 'notifications',
      'recurring|repeat|schedule': 'recurrence',
      'permission|role|access': 'authorization',
      'export|download': 'export',
      'import|upload': 'import',
      'share|invite': 'sharing',
    };

    for (const [pattern, logic] of Object.entries(logicPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.businessLogic.push(logic);
      }
    }

    // Custom hooks needed
    if (needs.crud.length > 0) {
      const entityName = this.extractEntityName(feature);
      needs.hooks.push(`use${entityName}`);
    }

    return needs;
  },

  /**
   * Analyze integration requirements
   */
  analyzeIntegrationNeeds(feature) {
    const title = (feature.title || '').toLowerCase();
    const desc = (feature.description || '').toLowerCase();
    const combined = `${title} ${desc}`;

    const needs = {
      external: [],
      internal: [],
    };

    // External integrations
    const externalPatterns = {
      'google|gmail|calendar': 'google',
      'outlook|microsoft': 'microsoft',
      'slack': 'slack',
      'email|mail': 'email',
      'sms|text': 'sms',
      'stripe|payment': 'stripe',
      'pdf': 'pdf-generation',
      'csv|excel|spreadsheet': 'spreadsheet',
    };

    for (const [pattern, integration] of Object.entries(externalPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.external.push(integration);
      }
    }

    // Internal integrations (other features)
    const internalPatterns = {
      'player|roster': 'players',
      'team': 'teams',
      'event|game|practice': 'events',
      'message|notification': 'messaging',
      'file|upload': 'storage',
    };

    for (const [pattern, integration] of Object.entries(internalPatterns)) {
      if (new RegExp(pattern).test(combined)) {
        needs.internal.push(integration);
      }
    }

    return needs;
  },

  /**
   * Assess overall complexity
   */
  assessComplexity(feature) {
    const dataNeeds = this.analyzeDataNeeds(feature);
    const uiNeeds = this.analyzeUINeeds(feature);
    const behaviorNeeds = this.analyzeBehaviorNeeds(feature);
    const integrationNeeds = this.analyzeIntegrationNeeds(feature);

    let score = 0;

    // Data complexity
    score += dataNeeds.requiresNewTable ? 2 : 0;
    score += dataNeeds.tables.length;
    score += dataNeeds.relationships.length * 0.5;

    // UI complexity
    score += uiNeeds.components.length * 0.5;
    score += uiNeeds.interactions.includes('drag-drop') ? 2 : 0;
    score += uiNeeds.interactions.includes('realtime-updates') ? 2 : 0;

    // Behavior complexity
    score += behaviorNeeds.crud.length * 0.5;
    score += behaviorNeeds.businessLogic.length;
    score += behaviorNeeds.validation.length * 0.3;

    // Integration complexity
    score += integrationNeeds.external.length * 2;
    score += integrationNeeds.internal.length * 0.5;

    if (score < 3) return { level: 'simple', score, estimatedHours: 2 };
    if (score < 6) return { level: 'moderate', score, estimatedHours: 4 };
    if (score < 10) return { level: 'complex', score, estimatedHours: 8 };
    return { level: 'very-complex', score, estimatedHours: 16 };
  },

  /**
   * Extract the main entity name from feature
   */
  extractEntityName(feature) {
    const title = feature.title || '';
    
    // Common entity patterns
    const entityPatterns = [
      /(\w+)\s+(list|manager|builder|tracker|viewer)/i,
      /manage\s+(\w+)/i,
      /add\s+(\w+)/i,
      /create\s+(\w+)/i,
      /(\w+)\s+crud/i,
    ];

    for (const pattern of entityPatterns) {
      const match = title.match(pattern);
      if (match) {
        const entity = match[1].toLowerCase();
        return entity.charAt(0).toUpperCase() + entity.slice(1);
      }
    }

    // Fallback: use first noun-like word
    const words = title.split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && /^[A-Za-z]+$/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    }

    return 'Item';
  },
};

// ============================================
// CODEBASE PATTERN RECOGNITION
// ============================================

export const CodebasePatterns = {
  /**
   * Learn patterns from existing code
   */
  learnFromCodebase(codebaseKnowledge) {
    return {
      // How are hooks typically structured?
      hookPattern: this.extractHookPattern(codebaseKnowledge),
      
      // How are components structured?
      componentPattern: this.extractComponentPattern(codebaseKnowledge),
      
      // What UI libraries are used?
      uiLibraries: this.extractUILibraries(codebaseKnowledge),
      
      // What's the typical file structure?
      fileStructure: this.extractFileStructure(codebaseKnowledge),
      
      // What naming conventions?
      namingConventions: this.extractNamingConventions(codebaseKnowledge),
    };
  },

  extractHookPattern(knowledge) {
    // Based on existing hooks in the codebase
    return {
      structure: `
// Standard hook structure for Helm
export function use{Entity}(teamId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Query
  const query = useQuery({
    queryKey: ['{entity}', teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('{table}')
        .select('{select}')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

  // Create mutation
  const create = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('{table}')
        .insert({ ...payload, team_id: teamId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['{entity}', teamId] });
      toast.success('Created successfully');
    },
    onError: (err) => toast.error(err.message),
  });

  // Update mutation
  const update = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase
        .from('{table}')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['{entity}', teamId] });
      toast.success('Updated successfully');
    },
    onError: (err) => toast.error(err.message),
  });

  // Delete mutation
  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('{table}')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['{entity}', teamId] });
      toast.success('Deleted successfully');
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  };
}`,
      imports: `
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';`,
    };
  },

  extractComponentPattern(knowledge) {
    return {
      // List component pattern
      list: `
"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { use{Entity} } from '@/hooks/use-{entity}';

export function {Entity}List({ teamId }: { teamId: string }) {
  const { data, isLoading, error } = use{Entity}(teamId);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return data;
    return data.filter(item => 
      item.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  if (isLoading) return <{Entity}ListSkeleton />;
  if (error) return <{Entity}ListError error={error} />;
  if (data.length === 0) return <{Entity}EmptyState onAdd={() => setShowForm(true)} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-10 h-10 bg-white/5 border-white/10 rounded-xl"
          />
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add {Entity}
        </Button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((item) => (
          <{Entity}Card key={item.id} item={item} />
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <{Entity}Form 
          onClose={() => setShowForm(false)} 
          teamId={teamId} 
        />
      )}
    </div>
  );
}`,

      // Form component pattern
      form: `
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { use{Entity} } from '@/hooks/use-{entity}';

interface {Entity}FormProps {
  teamId: string;
  initial?: {Entity};
  onClose: () => void;
}

export function {Entity}Form({ teamId, initial, onClose }: {Entity}FormProps) {
  const { create, update } = use{Entity}(teamId);
  const [formData, setFormData] = useState({
    // fields from initial or defaults
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    // Add validation rules
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, ...formData });
      } else {
        await create.mutateAsync(formData);
      }
      onClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isLoading = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl bg-[#0f0f0f] border border-white/10">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit' : 'Add'} {Entity}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Form fields */}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}`,

      // Card component pattern
      card: `
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { use{Entity} } from '@/hooks/use-{entity}';

interface {Entity}CardProps {
  item: {Entity};
}

export function {Entity}Card({ item }: {Entity}CardProps) {
  const { remove } = use{Entity}(item.team_id);
  const [showEdit, setShowEdit] = useState(false);

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10
      hover:bg-white/8 transition-colors group">
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium truncate">{item.name}</h3>
        <p className="text-sm text-white/40">{item.description}</p>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowEdit(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="text-red-400"
            onClick={() => remove.mutate(item.id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}`,

      // Empty state pattern
      empty: `
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
    <{Icon} className="w-10 h-10 text-white/20" />
  </div>
  <h3 className="text-xl font-semibold text-white/80">No {entities} yet</h3>
  <p className="text-white/40 mt-2 max-w-md">{description}</p>
  <Button className="mt-6" onClick={onAdd}>
    <Plus className="w-4 h-4 mr-2" />
    Add {Entity}
  </Button>
</div>`,

      // Loading skeleton pattern
      skeleton: `
<div className="space-y-4 animate-pulse">
  <div className="flex items-center justify-between">
    <div className="h-10 bg-white/5 rounded-xl w-64" />
    <div className="h-10 bg-white/5 rounded-xl w-32" />
  </div>
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-20 bg-white/5 rounded-xl" />
    ))}
  </div>
</div>`,
    };
  },

  extractUILibraries(knowledge) {
    return {
      components: '@/components/ui/*', // shadcn/ui
      icons: 'lucide-react',
      toast: 'sonner',
      dnd: '@dnd-kit/core, @dnd-kit/sortable',
      dates: 'date-fns',
      forms: 'react-hook-form (optional)',
      tables: '@tanstack/react-table (for complex tables)',
    };
  },

  extractFileStructure(knowledge) {
    return {
      components: 'src/components/{feature}/',
      hooks: 'src/hooks/',
      types: 'src/types/',
      lib: 'src/lib/',
      pages: 'src/app/{domain}/dashboard/{feature}/',
    };
  },

  extractNamingConventions(knowledge) {
    return {
      components: 'PascalCase (PlayerCard, LineupBuilder)',
      hooks: 'camelCase with use prefix (useLineups, usePlayers)',
      files: 'kebab-case (player-card.tsx, use-lineups.ts)',
      types: 'PascalCase (Player, Lineup, Event)',
      tables: 'snake_case plural (players, lineups, events)',
      columns: 'snake_case (first_name, created_at)',
    };
  },
};

// ============================================
// DYNAMIC IMPLEMENTATION GENERATOR
// ============================================

export const DynamicGenerator = {
  /**
   * Generate a complete implementation guide based on analysis
   */
  generateImplementation(feature, codebaseKnowledge) {
    const analysis = FeatureAnalysis.analyzeFeature(feature);
    const patterns = CodebasePatterns.learnFromCodebase(codebaseKnowledge);
    const entityName = FeatureAnalysis.extractEntityName(feature);
    const tableName = entityName.toLowerCase() + 's';

    return {
      // Summary
      summary: this.generateSummary(feature, analysis),
      
      // Database
      database: this.generateDatabase(feature, analysis, entityName, tableName),
      
      // Types
      types: this.generateTypes(feature, analysis, entityName),
      
      // Hook
      hook: this.generateHook(feature, analysis, entityName, tableName, patterns),
      
      // Components
      components: this.generateComponents(feature, analysis, entityName, patterns),
      
      // Tasks
      tasks: this.generateTasks(feature, analysis, entityName, tableName),
    };
  },

  generateSummary(feature, analysis) {
    return {
      title: feature.title,
      complexity: analysis.complexity,
      dataNeeds: analysis.dataNeeds,
      uiNeeds: analysis.uiNeeds,
      estimatedHours: analysis.complexity.estimatedHours,
    };
  },

  generateDatabase(feature, analysis, entityName, tableName) {
    if (!analysis.dataNeeds.requiresNewTable) {
      return { required: false, reason: 'Feature uses existing tables' };
    }

    const fields = analysis.dataNeeds.fields;
    const relationships = analysis.dataNeeds.relationships;

    // Generate CREATE TABLE dynamically
    let schema = `
CREATE TABLE ${tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,`;

    // Add detected fields
    for (const field of fields) {
      schema += `\n  ${this.fieldToSQL(field)},`;
    }

    // Add relationships
    for (const rel of relationships) {
      if (rel !== 'teams') { // teams already handled
        schema += `\n  ${rel.slice(0, -1)}_id UUID REFERENCES ${rel}(id),`;
      }
    }

    // Add metadata
    schema += `
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_${tableName}_team ON ${tableName}(team_id);`;

    // RLS
    const rls = `
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view" ON ${tableName}
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can manage" ON ${tableName}
  FOR ALL USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'coach')
    )
  );`;

    return {
      required: true,
      tableName,
      schema,
      rls,
      indexes: [`idx_${tableName}_team`],
    };
  },

  fieldToSQL(field) {
    const fieldTypes = {
      'name': 'TEXT NOT NULL',
      'title': 'TEXT NOT NULL',
      'description': 'TEXT',
      'body': 'TEXT NOT NULL',
      'content': 'TEXT',
      'notes': 'TEXT',
      'status': "TEXT DEFAULT 'active'",
      'batting_order': 'INTEGER CHECK (batting_order BETWEEN 1 AND 9)',
      'position': "TEXT",
      'start_time': 'TIMESTAMPTZ NOT NULL',
      'end_time': 'TIMESTAMPTZ',
      'check_in_time': 'TIMESTAMPTZ',
      'value': 'DECIMAL',
      'count': 'INTEGER DEFAULT 0',
      'is_active': 'BOOLEAN DEFAULT true',
      'pipeline_stage': "TEXT DEFAULT 'lead'",
      'interest_level': 'INTEGER CHECK (interest_level BETWEEN 1 AND 5)',
      'contact_date': 'DATE',
      'email': 'TEXT',
      'phone': 'TEXT',
      'url': 'TEXT',
      'color': "TEXT DEFAULT '#6366f1'",
    };

    // Handle _id fields (foreign keys)
    if (field.endsWith('_id')) {
      const table = field.replace('_id', 's');
      return `${field} UUID REFERENCES ${table}(id)`;
    }

    return `${field} ${fieldTypes[field] || 'TEXT'}`;
  },

  generateTypes(feature, analysis, entityName) {
    const fields = analysis.dataNeeds.fields;
    
    let typeInterface = `interface ${entityName} {
  id: string;
  team_id: string;`;

    for (const field of fields) {
      typeInterface += `\n  ${this.fieldToTS(field)};`;
    }

    typeInterface += `
  created_by: string | null;
  created_at: string;
  updated_at: string;
}`;

    // Form data type
    let formType = `interface ${entityName}FormData {`;
    for (const field of fields) {
      if (!field.endsWith('_id') && !['created_at', 'updated_at'].includes(field)) {
        formType += `\n  ${field}: string;`;
      }
    }
    formType += '\n}';

    return {
      main: typeInterface,
      form: formType,
    };
  },

  fieldToTS(field) {
    const fieldTypes = {
      'name': 'name: string',
      'title': 'title: string',
      'description': 'description: string | null',
      'body': 'body: string',
      'content': 'content: string | null',
      'notes': 'notes: string | null',
      'status': 'status: string',
      'batting_order': 'batting_order: number',
      'position': 'position: string | null',
      'start_time': 'start_time: string',
      'end_time': 'end_time: string | null',
      'check_in_time': 'check_in_time: string | null',
      'value': 'value: number | null',
      'count': 'count: number',
      'is_active': 'is_active: boolean',
      'pipeline_stage': 'pipeline_stage: string',
      'interest_level': 'interest_level: number | null',
      'contact_date': 'contact_date: string | null',
      'email': 'email: string | null',
      'phone': 'phone: string | null',
      'url': 'url: string | null',
      'color': 'color: string',
    };

    if (field.endsWith('_id')) {
      return `${field}: string | null`;
    }

    return fieldTypes[field] || `${field}: string | null`;
  },

  generateHook(feature, analysis, entityName, tableName, patterns) {
    const hookName = `use${entityName}s`;
    
    // Use the pattern but customize it
    let hook = patterns.hookPattern.structure
      .replace(/{Entity}/g, entityName)
      .replace(/{entity}/g, entityName.toLowerCase())
      .replace(/{table}/g, tableName)
      .replace(/{select}/g, '*');

    return {
      name: hookName,
      path: `src/hooks/use-${entityName.toLowerCase()}s.ts`,
      imports: patterns.hookPattern.imports,
      code: hook,
    };
  },

  generateComponents(feature, analysis, entityName, patterns) {
    const components = [];
    const lowerName = entityName.toLowerCase();

    // Always need a list component
    components.push({
      name: `${entityName}List`,
      path: `src/components/${lowerName}/${lowerName}-list.tsx`,
      description: `List view for ${entityName}s with search and filters`,
      pattern: 'list',
    });

    // Always need a card/item component
    components.push({
      name: `${entityName}Card`,
      path: `src/components/${lowerName}/${lowerName}-card.tsx`,
      description: `Individual ${entityName} card with actions`,
      pattern: 'card',
    });

    // Always need a form for CRUD
    if (analysis.behaviorNeeds.crud.includes('create') || analysis.behaviorNeeds.crud.includes('update')) {
      components.push({
        name: `${entityName}Form`,
        path: `src/components/${lowerName}/${lowerName}-form.tsx`,
        description: `Form for creating/editing ${entityName}`,
        pattern: 'form',
      });
    }

    // Detect special components needed
    if (analysis.uiNeeds.patterns.includes('drag')) {
      components.push({
        name: `${entityName}Builder`,
        path: `src/components/${lowerName}/${lowerName}-builder.tsx`,
        description: `Drag-and-drop builder for ${entityName}`,
        pattern: 'builder',
      });
    }

    if (analysis.uiNeeds.patterns.includes('calendar')) {
      components.push({
        name: `${entityName}Calendar`,
        path: `src/components/${lowerName}/${lowerName}-calendar.tsx`,
        description: `Calendar view for ${entityName}s`,
        pattern: 'calendar',
      });
    }

    if (analysis.behaviorNeeds.businessLogic.includes('export')) {
      components.push({
        name: `Export${entityName}Dialog`,
        path: `src/components/${lowerName}/export-${lowerName}-dialog.tsx`,
        description: `Export ${entityName}s to CSV/PDF`,
        pattern: 'export',
      });
    }

    return components;
  },

  generateTasks(feature, analysis, entityName, tableName) {
    const tasks = [];
    let step = 1;
    const lowerName = entityName.toLowerCase();

    // Database
    if (analysis.dataNeeds.requiresNewTable) {
      tasks.push({
        step: step++,
        title: `Create ${tableName} table`,
        file: `supabase/migrations/${Date.now()}_create_${tableName}.sql`,
        description: 'Create table with all fields, indexes, and RLS policies',
        verification: ['Table visible in Supabase', 'RLS enabled'],
      });
    }

    // Types
    tasks.push({
      step: step++,
      title: 'Add TypeScript types',
      file: `src/types/${lowerName}.ts`,
      description: `Add ${entityName} and ${entityName}FormData interfaces`,
      verification: ['No TypeScript errors', 'Types exported'],
    });

    // Hook
    tasks.push({
      step: step++,
      title: `Create use${entityName}s hook`,
      file: `src/hooks/use-${lowerName}s.ts`,
      description: 'Create React Query hook with CRUD operations',
      verification: ['Hook returns data', 'Mutations work'],
    });

    // Components
    const components = this.generateComponents(feature, analysis, entityName, {});
    for (const comp of components) {
      tasks.push({
        step: step++,
        title: `Create ${comp.name} component`,
        file: comp.path,
        description: comp.description,
        verification: ['Component renders', 'No console errors'],
      });
    }

    // Page integration
    tasks.push({
      step: step++,
      title: 'Add to page',
      file: `src/app/baseball/dashboard/${lowerName}/page.tsx`,
      description: `Integrate ${entityName}List into page`,
      verification: ['Page loads', 'Data displays'],
    });

    // Testing
    tasks.push({
      step: step++,
      title: 'Test complete flow',
      description: 'End-to-end testing of all CRUD operations',
      verification: [
        `Can create ${entityName}`,
        `Can view ${entityName} list`,
        `Can edit ${entityName}`,
        `Can delete ${entityName}`,
        'Loading states work',
        'Empty state displays',
        'Error handling works',
      ],
    });

    return tasks;
  },
};

export default {
  FeatureAnalysis,
  CodebasePatterns,
  DynamicGenerator,
};
