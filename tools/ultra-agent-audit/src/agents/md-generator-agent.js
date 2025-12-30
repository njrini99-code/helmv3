/**
 * MDGeneratorAgent - INTELLIGENT Implementation Guides
 * 
 * SMART APPROACH:
 * 1. If issue has rich context (why, result, implementation) → USE IT
 * 2. If issue is sparse → Analyze and enrich dynamically
 * 3. Always adapt detail level to complexity
 * 
 * This produces DIFFERENT outputs based on the actual issue content.
 */

import { BaseAgent } from './coordination/base-agent.js';
import HelmKnowledge from '../knowledge/helm-knowledge.js';
import FeatureKnowledge from '../knowledge/feature-knowledge.js';
import UIKnowledge from '../knowledge/ui-knowledge.js';
import { FeatureAnalysis, CodebasePatterns, DynamicGenerator } from '../knowledge/contextual-thinking.js';
import { AgentThinking } from '../knowledge/agent-thinking.js';

export class MDGeneratorAgent extends BaseAgent {
  constructor(config = {}) {
    super('md-generator', ['implementation-guide', 'detailed-md', 'code-generation']);

    this.config = {
      icon: '📝',
      color: '#a855f7',
      description: 'Generates intelligent implementation guides',
    };

    this.helmKnowledge = HelmKnowledge;
    this.featureKnowledge = FeatureKnowledge;
    this.uiKnowledge = UIKnowledge;
    this.mdQueue = [];
    this.maxQueue = 50;
    
    // Learn patterns from codebase
    this.codebasePatterns = CodebasePatterns.learnFromCodebase(HelmKnowledge);
  }

  async initialize() {
    this.log('info', 'Initializing INTELLIGENT MD generator...');
    this.log('success', 'Loaded contextual thinking + agent thinking');
    return true;
  }

  /**
   * Check if issue has rich context from feature-knowledge
   */
  hasRichContext(issue) {
    return !!(
      (issue.why && issue.why.length > 30) ||
      (issue.implementation) ||
      (issue.blockedWorkflows?.length > 0) ||
      (issue.featureContext) ||
      (issue.industryExample)
    );
  }

  /**
   * Generate implementation MD
   */
  async generateMD(options) {
    const { type, issue, route, code } = options;

    return this.executeTask(`Generate MD: ${issue.title}`, async () => {
      // Get route context
      const routeContext = this.helmKnowledge.getRouteContext(route);
      const domain = this.helmKnowledge.getRouteDomain(route);
      const designSystem = this.helmKnowledge.getDesignSystem();
      
      // Check if issue already has rich context
      const isRich = this.hasRichContext(issue);
      
      this.log('info', `Issue "${issue.title}" has rich context: ${isRich}`);

      let md;
      if (isRich) {
        // USE the existing rich context - don't re-analyze
        md = this.buildRichContextMD(issue, route, routeContext, designSystem, code);
      } else {
        // Sparse issue - analyze and enrich
        const analysis = FeatureAnalysis.analyzeFeature(issue);
        const agentAnalysis = AgentThinking.analyze(issue);
        const implementation = DynamicGenerator.generateImplementation(issue, this.helmKnowledge);
        md = this.buildDynamicMD(issue, route, analysis, agentAnalysis, implementation, routeContext, designSystem);
      }

      const mdObject = {
        id: `md-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: issue.title,
        type,
        route,
        content: md,
        issue,
        metadata: {
          domain,
          hasRichContext: isRich,
          generatedAt: Date.now(),
          charCount: md.length,
        },
      };

      this.mdQueue.unshift(mdObject);
      if (this.mdQueue.length > this.maxQueue) {
        this.mdQueue = this.mdQueue.slice(0, this.maxQueue);
      }

      this.shareDiscovery('md-generated', { 
        id: mdObject.id, 
        title: issue.title, 
        route, 
        type,
        hasRichContext: isRich,
      });
      
      this.log('success', `MD generated: ${issue.title} (${md.length} chars)`);

      return mdObject;
    });
  }

  /**
   * Build MD from RICH issue context (from feature-knowledge)
   * This is the good path - we have detailed info already
   */
  buildRichContextMD(issue, route, routeContext, designSystem, code) {
    const impl = issue.implementation || {};
    const effort = issue.effort || 'medium';
    const priority = issue.priority || 'medium';
    
    let md = `# 🚀 ${issue.title}

> **Route**: \`${route}\`
> **Priority**: ${priority}
> **Effort**: ${effort}
> **Generated**: ${new Date().toISOString()}

---

## 💡 Why This Matters

${issue.why || issue.description || 'Improves the user experience.'}

## 🎯 Expected Result

${issue.result || 'Feature will work as expected with improved UX.'}
`;

    // Blocked Workflows (if any)
    if (issue.blockedWorkflows?.length > 0) {
      md += `
---

## 🚫 Currently Blocked User Workflows

${issue.blockedWorkflows.map((w, i) => `
### ${i + 1}. ${w.task}
- **Who**: ${w.persona}
- **Frequency**: ${w.frequency}
- **Current Pain**: ${w.currentPain}
- **Ideal Flow**: ${w.idealFlow}
- **Time Impact**: ${w.timeImpact}
`).join('\n')}
`;
    }

    // Industry Example (if any)
    if (issue.industryExample) {
      md += `
---

## 🏆 Industry Example

${issue.industryExample}
`;
    }

    // Implementation details (if any)
    if (impl.approach || impl.libraries || impl.schema) {
      md += `
---

## 🛠️ Implementation Approach

${impl.approach || 'Follow standard patterns.'}
`;

      if (impl.libraries?.length > 0) {
        md += `
### Libraries Needed

\`\`\`bash
npm install ${impl.libraries.join(' ')}
\`\`\`
`;
      }

      if (impl.schema) {
        md += `
### Database Schema

\`\`\`sql
${impl.schema}
\`\`\`
`;
      }

      if (impl.uiComponents?.length > 0) {
        md += `
### UI Components

${impl.uiComponents.map(c => `- \`${c}\``).join('\n')}
`;
      }
    }

    // Generate components based on issue category
    const components = this.generateComponentsForIssue(issue, route);
    if (components.length > 0) {
      md += `
---

## 🧩 Components to Create/Update

${components.map(comp => `
### ${comp.name}

**File**: \`${comp.path}\`
**Purpose**: ${comp.description}

\`\`\`tsx
${comp.code}
\`\`\`
`).join('\n---\n')}
`;
    }

    // Tasks
    md += `
---

## 📋 Implementation Tasks

${this.generateTasksForIssue(issue, impl).map((task, i) => `
### Step ${i + 1}: ${task.title}

${task.file ? `**File**: \`${task.file}\`` : ''}

${task.description}

${task.verification ? `**Verify**: ${task.verification.join(', ')}` : ''}
`).join('\n')}
`;

    // Design requirements
    md += this.getDesignSection(issue, designSystem);

    // Checklist
    md += this.getFinalChecklist(issue);

    md += `
---

*Generated from Feature Knowledge*
`;

    return md;
  }

  /**
   * Build MD from DYNAMIC analysis (sparse issue)
   */
  buildDynamicMD(issue, route, analysis, agentAnalysis, implementation, routeContext, designSystem) {
    const { complexity, dataNeeds, uiNeeds, behaviorNeeds, integrationNeeds } = analysis;
    const entityName = FeatureAnalysis.extractEntityName(issue);

    let md = `# 🚀 ${issue.title}

> **Route**: \`${route}\`
> **Complexity**: ${complexity.level} (~${complexity.estimatedHours}h)
> **Stack**: ${agentAnalysis.scope.stack}
> **Type**: ${agentAnalysis.scope.type}
> **Generated**: ${new Date().toISOString()}

---

## 📋 Analysis

| Aspect | Details |
|--------|---------|
| **Domain** | ${agentAnalysis.scope.domain} |
| **Breadth** | ${agentAnalysis.scope.breadth} |
| **Depth** | ${agentAnalysis.scope.depth} |
| **Priority** | ${agentAnalysis.priority.priority} (score: ${agentAnalysis.priority.totalScore.toFixed(1)}) |
| **Recommendation** | ${agentAnalysis.priority.recommendation} |

### Data Needs

${dataNeeds.requiresNewTable ? `- **New Table**: \`${entityName.toLowerCase()}s\`` : '- Uses existing tables'}
${dataNeeds.fields.length > 0 ? `- **Fields**: ${dataNeeds.fields.join(', ')}` : ''}
${dataNeeds.relationships.length > 0 ? `- **Relationships**: ${dataNeeds.relationships.join(', ')}` : ''}

### UI Needs

${uiNeeds.components.length > 0 ? `- **Components**: ${uiNeeds.components.slice(0, 5).join(', ')}` : '- Standard components'}
${uiNeeds.interactions.length > 0 ? `- **Interactions**: ${uiNeeds.interactions.join(', ')}` : ''}
${uiNeeds.patterns.length > 0 ? `- **Patterns**: ${uiNeeds.patterns.join(', ')}` : ''}

### Behavior Needs

${behaviorNeeds.crud.length > 0 ? `- **CRUD**: ${behaviorNeeds.crud.join(', ')}` : ''}
${behaviorNeeds.validation.length > 0 ? `- **Validation**: ${behaviorNeeds.validation.join(', ')}` : ''}
${behaviorNeeds.businessLogic.length > 0 ? `- **Logic**: ${behaviorNeeds.businessLogic.join(', ')}` : ''}

---

## 💡 Why This Matters

${issue.why || issue.description || `This ${agentAnalysis.scope.type} improves the ${agentAnalysis.scope.domain} experience.`}

## 🎯 Expected Result

${issue.result || `Users can successfully ${issue.title.toLowerCase()}.`}
`;

    // Database (only if needed)
    if (implementation.database.required) {
      md += `
---

## 🗄️ Database

### Create Table: \`${implementation.database.tableName}\`

\`\`\`sql
${implementation.database.schema}
\`\`\`

### Row Level Security

\`\`\`sql
${implementation.database.rls}
\`\`\`
`;
    }

    // Types
    if (implementation.types.main) {
      md += `
---

## 📝 TypeScript Types

\`\`\`typescript
${implementation.types.main}

${implementation.types.form}
\`\`\`
`;
    }

    // Hook
    if (implementation.hook.code) {
      md += `
---

## 🪝 Custom Hook

**File**: \`${implementation.hook.path}\`

\`\`\`typescript
${implementation.hook.imports}

${implementation.hook.code}
\`\`\`
`;
    }

    // Components
    if (implementation.components.length > 0) {
      md += `
---

## 🧩 Components

${implementation.components.map(comp => `
### ${comp.name}

**File**: \`${comp.path}\`
**Pattern**: ${comp.pattern}

${this.getComponentCodeForPattern(comp.pattern, entityName, analysis)}
`).join('\n---\n')}
`;
    }

    // Tasks from agent analysis
    md += `
---

## 📋 Implementation Tasks

${agentAnalysis.checklist.map(phase => `
### ${phase.phase}

${phase.items.map(item => `- [ ] ${item.task}`).join('\n')}
`).join('\n')}
`;

    // Design requirements
    md += this.getDesignSection(issue, designSystem);

    // Checklist
    md += this.getFinalChecklist(issue);

    md += `
---

*Generated via Dynamic Analysis*
*Complexity: ${complexity.level} | Estimated: ${complexity.estimatedHours}h*
`;

    return md;
  }

  /**
   * Generate components based on issue category and severity
   */
  generateComponentsForIssue(issue, route) {
    const components = [];
    const id = (issue.id || '').toLowerCase();
    const title = (issue.title || '').toLowerCase();
    const category = issue.category || '';

    // Loading state component
    if (id.includes('loading') || title.includes('loading') || title.includes('skeleton')) {
      components.push({
        name: 'LoadingSkeleton',
        path: `src/components/ui/${this.getRouteFolder(route)}-skeleton.tsx`,
        description: 'Skeleton loading state for this page',
        code: this.getLoadingSkeletonCode(route),
      });
    }

    // Empty state component
    if (id.includes('empty') || title.includes('empty')) {
      components.push({
        name: 'EmptyState',
        path: `src/components/ui/${this.getRouteFolder(route)}-empty.tsx`,
        description: 'Empty state when no data exists',
        code: this.getEmptyStateCode(route, issue),
      });
    }

    // Error state
    if (id.includes('error') || title.includes('error')) {
      components.push({
        name: 'ErrorState',
        path: `src/components/ui/error-state.tsx`,
        description: 'Error state with retry button',
        code: this.getErrorStateCode(),
      });
    }

    // Form component
    if (title.includes('form') || title.includes('add') || title.includes('create') || title.includes('edit')) {
      const entity = this.extractEntityFromRoute(route);
      components.push({
        name: `${entity}Form`,
        path: `src/components/${this.getRouteFolder(route)}/${entity.toLowerCase()}-form.tsx`,
        description: `Form for creating/editing ${entity}`,
        code: this.getFormCode(entity, issue),
      });
    }

    // Modal component
    if (title.includes('modal') || title.includes('dialog')) {
      components.push({
        name: 'ActionModal',
        path: `src/components/ui/action-modal.tsx`,
        description: 'Reusable modal dialog',
        code: this.getModalCode(issue),
      });
    }

    // Filter component
    if (title.includes('filter') || title.includes('search')) {
      components.push({
        name: 'FilterBar',
        path: `src/components/${this.getRouteFolder(route)}/filter-bar.tsx`,
        description: 'Search and filter controls',
        code: this.getFilterBarCode(issue),
      });
    }

    return components;
  }

  /**
   * Generate tasks based on issue
   */
  generateTasksForIssue(issue, impl) {
    const tasks = [];
    const title = (issue.title || '').toLowerCase();
    
    // Database task
    if (impl.schema) {
      tasks.push({
        title: 'Create database migration',
        file: 'supabase/migrations/xxx.sql',
        description: 'Add the required tables and columns',
        verification: ['Table exists in Supabase', 'RLS policies applied'],
      });
    }

    // Type definition
    if (title.includes('type') || impl.schema) {
      tasks.push({
        title: 'Add TypeScript types',
        file: 'src/types/',
        description: 'Create interfaces for the new data structures',
        verification: ['No TypeScript errors', 'Types exported from index'],
      });
    }

    // Component tasks
    if (title.includes('loading') || title.includes('skeleton')) {
      tasks.push({
        title: 'Create loading skeleton',
        file: 'src/components/',
        description: 'Add skeleton component with animate-pulse',
        verification: ['Skeleton renders', 'Matches layout structure'],
      });
    }

    if (title.includes('empty')) {
      tasks.push({
        title: 'Create empty state',
        file: 'src/components/',
        description: 'Add empty state with icon, message, and CTA',
        verification: ['Shows when data.length === 0', 'CTA triggers action'],
      });
    }

    if (title.includes('form') || title.includes('add') || title.includes('create')) {
      tasks.push({
        title: 'Create form component',
        file: 'src/components/',
        description: 'Build form with validation and error states',
        verification: ['Validation works', 'Submits correctly', 'Errors display'],
      });
    }

    if (title.includes('filter') || title.includes('search')) {
      tasks.push({
        title: 'Add search/filter functionality',
        file: 'src/components/',
        description: 'Implement search input and filter dropdowns',
        verification: ['Search filters results', 'Filters combine correctly'],
      });
    }

    // Hook task
    if (impl.libraries?.length > 0 || title.includes('hook')) {
      tasks.push({
        title: 'Create custom hook',
        file: 'src/hooks/',
        description: 'Add React Query hook with CRUD operations',
        verification: ['Data fetches', 'Mutations work', 'Cache invalidates'],
      });
    }

    // Integration task
    tasks.push({
      title: 'Integrate into page',
      file: route,
      description: 'Add component to the page with proper state management',
      verification: ['Component renders', 'State updates correctly'],
    });

    // Testing task
    tasks.push({
      title: 'Test full flow',
      description: 'End-to-end testing of the feature',
      verification: ['Happy path works', 'Edge cases handled', 'Mobile responsive'],
    });

    return tasks;
  }

  /**
   * Get design section
   */
  getDesignSection(issue, designSystem) {
    return `
---

## 🎨 Design Requirements

### Helm Design System

| Element | Class |
|---------|-------|
| Card | \`rounded-2xl bg-white/5 border border-white/10 p-6\` |
| Input | \`h-12 bg-white/5 border-white/10 rounded-xl\` |
| Button Primary | \`rounded-xl bg-white text-black\` |
| Button Secondary | \`rounded-xl bg-white/10 text-white\` |
| Hover | \`hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200\` |
| Focus | \`focus:ring-2 focus:ring-white/20\` |

### Required States

- [ ] **Loading**: Skeleton with \`animate-pulse\`
- [ ] **Empty**: Icon + title + description + CTA
- [ ] **Error**: Red icon + message + retry
- [ ] **Success**: Toast via \`sonner\`
`;
  }

  /**
   * Get final checklist
   */
  getFinalChecklist(issue) {
    const severity = issue.severity || 'info';
    const effort = issue.effort || 'medium';
    
    let checklist = `
---

## ✅ Final Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No console.log statements
- [ ] Error boundaries in place
- [ ] Loading states complete

### UI/UX
- [ ] Matches design system
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Touch targets ≥ 44px
`;

    if (effort === 'high' || severity === 'error') {
      checklist += `
### Production Readiness
- [ ] Tested with real data
- [ ] Edge cases handled
- [ ] Performance acceptable
- [ ] Analytics added
`;
    }

    return checklist;
  }

  /**
   * Helper: Get route folder name
   */
  getRouteFolder(route) {
    const parts = route.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'shared';
  }

  /**
   * Helper: Extract entity from route
   */
  extractEntityFromRoute(route) {
    const folder = this.getRouteFolder(route);
    return folder.charAt(0).toUpperCase() + folder.slice(1).replace(/-/g, '');
  }

  /**
   * Component code generators
   */
  getLoadingSkeletonCode(route) {
    return `"use client";

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-white/5 rounded-xl w-48" />
        <div className="h-10 bg-white/5 rounded-xl w-32" />
      </div>
      
      {/* Content */}
      <div className="grid gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-white/5 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}`;
  }

  getEmptyStateCode(route, issue) {
    const entity = this.extractEntityFromRoute(route);
    return `"use client";

import { Button } from '@/components/ui/button';
import { Plus, FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  onAction?: () => void;
}

export function ${entity}EmptyState({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
        <FolderOpen className="w-10 h-10 text-white/20" />
      </div>
      <h3 className="text-xl font-semibold text-white/80">
        No ${entity.toLowerCase()}s yet
      </h3>
      <p className="text-white/40 mt-2 max-w-md">
        Get started by creating your first ${entity.toLowerCase()}.
      </p>
      {onAction && (
        <Button className="mt-6" onClick={onAction}>
          <Plus className="w-4 h-4 mr-2" />
          Add ${entity}
        </Button>
      )}
    </div>
  );
}`;
  }

  getErrorStateCode() {
    return `"use client";

import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <h3 className="text-xl font-semibold text-white/80">Error</h3>
      <p className="text-white/40 mt-2">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}`;
  }

  getFormCode(entity, issue) {
    return `"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface ${entity}FormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initial?: any;
}

export function ${entity}Form({ open, onClose, onSubmit, initial }: ${entity}FormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onSubmit({ name });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-3xl bg-[#0f0f0f] border border-white/10">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit' : 'Add'} ${entity}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name..."
              className="h-12 bg-white/5 border-white/10 rounded-xl"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}`;
  }

  getModalCode(issue) {
    return `"use client";

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ActionModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  isDestructive = false,
  isLoading = false,
}: ActionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-3xl bg-[#0f0f0f] border border-white/10">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}`;
  }

  getFilterBarCode(issue) {
    return `"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface FilterBarProps {
  onSearch: (query: string) => void;
  onFilter: (filter: string) => void;
  filters?: { value: string; label: string }[];
}

export function FilterBar({ onSearch, onFilter, filters = [] }: FilterBarProps) {
  const [search, setSearch] = useState('');

  const handleSearch = (value: string) => {
    setSearch(value);
    onSearch(value);
  };

  const clearSearch = () => {
    setSearch('');
    onSearch('');
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search..."
          className="pl-10 pr-10 h-10 bg-white/5 border-white/10 rounded-xl"
        />
        {search && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filters.length > 0 && (
        <Select onValueChange={onFilter}>
          <SelectTrigger className="w-[180px] h-10 bg-white/5 border-white/10 rounded-xl">
            <SelectValue placeholder="Filter by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {filters.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}`;
  }

  /**
   * Get component code for pattern (used by dynamic generation)
   */
  getComponentCodeForPattern(pattern, entityName, analysis) {
    const lowerName = entityName.toLowerCase();

    switch (pattern) {
      case 'list':
        return `
\`\`\`tsx
// List component for ${entityName}s
// Shows search, filter, and cards
"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';

export function ${entityName}List({ data, isLoading, onAdd }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return data;
    return data.filter(item => 
      item.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  if (isLoading) return <LoadingSkeleton />;
  if (data.length === 0) return <EmptyState onAdd={onAdd} />;

  return (
    <div className="space-y-4">
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
        <Button onClick={onAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add ${entityName}
        </Button>
      </div>
      <div className="space-y-2">
        {filtered.map((item) => (
          <${entityName}Card key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
\`\`\``;

      case 'card':
        return `
\`\`\`tsx
// Card component for individual ${entityName}
"use client";

export function ${entityName}Card({ item }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10
      hover:bg-white/8 hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex-1">
        <h3 className="font-medium">{item.name}</h3>
        <p className="text-sm text-white/40">{item.description}</p>
      </div>
      {/* Add actions dropdown */}
    </div>
  );
}
\`\`\``;

      case 'form':
        return `
\`\`\`tsx
// Form component for ${entityName}
"use client";

export function ${entityName}Form({ onSubmit, initial, onClose }) {
  // Form implementation with validation
  // See generated code above for full implementation
}
\`\`\``;

      default:
        return `\`\`\`tsx\n// ${pattern} component\n\`\`\``;
    }
  }

  // Queue management
  getQueue() { return this.mdQueue; }
  getMD(id) { return this.mdQueue.find(md => md.id === id); }
  removeMD(id) {
    const i = this.mdQueue.findIndex(md => md.id === id);
    if (i !== -1) { this.mdQueue.splice(i, 1); return true; }
    return false;
  }
  clearQueue() { this.mdQueue = []; }

  handleMessage(msg) {
    if (msg.type === 'generate-md') {
      this.generateMD(msg.payload).then(md => this.sendToAgent(msg.from, 'md-ready', md));
    }
  }

  getStatus() {
    return {
      ...this.getStats(),
      queueLength: this.mdQueue.length,
      mode: 'intelligent-contextual',
    };
  }
}

export default MDGeneratorAgent;
