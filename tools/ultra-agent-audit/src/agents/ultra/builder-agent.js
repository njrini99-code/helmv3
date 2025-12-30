/**
 * 📝 BuilderAgent - Implementation Guide Generator
 * 
 * THE BUILDER. Generates:
 * - Complete database schemas (CREATE TABLE, RLS, indexes)
 * - TypeScript interfaces (entities, forms, props)
 * - React components (full code, not pseudocode)
 * - Custom hooks (React Query patterns)
 * - Step-by-step implementation tasks
 * 
 * Combines: mdGenerator with enhanced intelligence
 */

import { BaseAgent } from '../coordination/base-agent.js';
import HelmKnowledge from '../../knowledge/helm-knowledge.js';
import { FeatureAnalysis, CodebasePatterns, DynamicGenerator } from '../../knowledge/contextual-thinking.js';
import { AgentThinking } from '../../knowledge/agent-thinking.js';

export class BuilderAgent extends BaseAgent {
  constructor(config = {}) {
    super('builder', [
      'md-generation',
      'schema-generation',
      'component-generation',
      'hook-generation',
      'task-generation',
    ]);

    this.config = {
      icon: '📝',
      color: '#a855f7',
      description: 'Implementation guide builder - generates production-ready code',
    };

    this.helmKnowledge = HelmKnowledge;
    this.codebasePatterns = CodebasePatterns.learnFromCodebase(HelmKnowledge);
    this.mdQueue = [];
    this.maxQueue = 50;
  }

  async initialize() {
    this.log('info', 'Builder agent powering up...');
    this.log('success', 'Loaded codebase patterns');
    return true;
  }

  /**
   * Generate implementation MD
   */
  async generateMD(options) {
    const { type, issue, route, code } = options;

    return this.executeTask(`Build guide: ${issue.title}`, async () => {
      const routeContext = this.helmKnowledge.getRouteContext(route);
      const domain = this.helmKnowledge.getRouteDomain(route);

      // Check if issue has rich context
      const isRich = this.hasRichContext(issue);
      
      // Generate appropriate MD
      let md;
      if (isRich) {
        md = this.buildFromRichContext(issue, route, routeContext);
      } else {
        const analysis = FeatureAnalysis.analyzeFeature(issue);
        const agentAnalysis = AgentThinking.analyze(issue);
        md = this.buildFromAnalysis(issue, route, analysis, agentAnalysis, routeContext);
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
          generatedAt: Date.now(),
          charCount: md.length,
        },
      };

      this.mdQueue.unshift(mdObject);
      if (this.mdQueue.length > this.maxQueue) {
        this.mdQueue = this.mdQueue.slice(0, this.maxQueue);
      }

      this.shareDiscovery('md-generated', { id: mdObject.id, title: issue.title });
      this.log('success', `Guide generated: ${issue.title} (${md.length} chars)`);

      return mdObject;
    });
  }

  /**
   * Check if issue has rich context
   */
  hasRichContext(issue) {
    return !!(
      (issue.why && issue.why.length > 30) ||
      issue.implementation ||
      issue.blockedWorkflows?.length > 0 ||
      issue.featureContext ||
      issue.industryExample
    );
  }

  /**
   * Build from rich context (from Brain agent)
   */
  buildFromRichContext(issue, route, routeContext) {
    const impl = issue.implementation || {};
    const entity = this.extractEntity(issue, route);

    let md = `# 🚀 ${issue.title}

> **Route**: \`${route}\`
> **Priority**: ${issue.priority || 'medium'}
> **Effort**: ${issue.effort || 'medium'}

---

## 💡 Why This Matters

${issue.why || issue.description}

## 🎯 Expected Result

${issue.result || 'Feature works as expected.'}
`;

    // Blocked Workflows
    if (issue.blockedWorkflows?.length > 0) {
      md += `
---

## 🚫 Blocked User Workflows

${issue.blockedWorkflows.map((w, i) => `
### ${i + 1}. ${w.task}
- **Who**: ${w.persona}
- **Frequency**: ${w.frequency}
- **Pain Point**: ${w.currentPain}
- **Ideal**: ${w.idealFlow}
`).join('')}
`;
    }

    // Industry Example
    if (issue.industryExample) {
      md += `
---

## 🏆 Industry Example

${issue.industryExample}
`;
    }

    // Implementation
    if (impl.approach || impl.libraries || impl.schema) {
      md += `
---

## 🛠️ Implementation

${impl.approach || ''}
`;

      if (impl.libraries?.length > 0) {
        md += `
### Install Dependencies

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
    }

    // Generate contextual components
    md += this.generateComponentSection(issue, entity);

    // Tasks
    md += this.generateTaskSection(issue, entity, impl);

    // Design
    md += this.getDesignSection();

    // Checklist
    md += this.getChecklist(issue);

    return md;
  }

  /**
   * Build from analysis (sparse issue)
   */
  buildFromAnalysis(issue, route, analysis, agentAnalysis, routeContext) {
    const { complexity, dataNeeds, uiNeeds, behaviorNeeds } = analysis;
    const entity = FeatureAnalysis.extractEntityName(issue);
    const implementation = DynamicGenerator.generateImplementation(issue, this.helmKnowledge);

    let md = `# 🚀 ${issue.title}

> **Route**: \`${route}\`
> **Complexity**: ${complexity.level} (~${complexity.estimatedHours}h)
> **Type**: ${agentAnalysis.scope.type}

---

## 📋 Analysis

| Aspect | Details |
|--------|---------|
| Domain | ${agentAnalysis.scope.domain} |
| Stack | ${agentAnalysis.scope.stack} |
| Priority | ${agentAnalysis.priority.priority} |
| Data Needs | ${dataNeeds.fields.length > 0 ? dataNeeds.fields.join(', ') : 'None'} |
| UI Patterns | ${uiNeeds.patterns.length > 0 ? uiNeeds.patterns.join(', ') : 'Standard'} |

---

## 💡 Why This Matters

${issue.why || issue.description || `Improves the ${agentAnalysis.scope.domain} experience.`}

## 🎯 Expected Result

${issue.result || `Users can successfully ${issue.title.toLowerCase()}.`}
`;

    // Database
    if (implementation.database.required) {
      md += `
---

## 🗄️ Database

### Table: \`${implementation.database.tableName}\`

\`\`\`sql
${implementation.database.schema}
\`\`\`

### RLS Policies

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

`;
      for (const comp of implementation.components) {
        md += `
### ${comp.name}

**File**: \`${comp.path}\`

${this.getComponentCode(comp.pattern, entity)}
`;
      }
    }

    // Tasks
    md += `
---

## 📋 Tasks

${agentAnalysis.checklist.map(phase => `
### ${phase.phase}

${phase.items.map(item => `- [ ] ${item.task}`).join('\n')}
`).join('\n')}
`;

    // Design
    md += this.getDesignSection();

    // Checklist
    md += this.getChecklist(issue);

    return md;
  }

  /**
   * Extract entity name from issue or route
   */
  extractEntity(issue, route) {
    // Try from issue title
    const title = issue.title || '';
    const patterns = [
      /add\s+(\w+)/i,
      /create\s+(\w+)/i,
      /(\w+)\s+builder/i,
      /(\w+)\s+list/i,
      /(\w+)\s+form/i,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const word = match[1].toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
    }

    // Fallback to route
    const parts = route.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  /**
   * Generate component section based on issue type
   */
  generateComponentSection(issue, entity) {
    const id = (issue.id || '').toLowerCase();
    const title = (issue.title || '').toLowerCase();
    const lowerEntity = entity.toLowerCase();

    let md = `
---

## 🧩 Components
`;

    // Loading state
    if (id.includes('loading') || title.includes('loading') || title.includes('skeleton')) {
      md += `
### ${entity}Skeleton

**File**: \`src/components/${lowerEntity}/${lowerEntity}-skeleton.tsx\`

\`\`\`tsx
"use client";

export function ${entity}Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-white/5 rounded-xl w-48" />
        <div className="h-10 bg-white/5 rounded-xl w-32" />
      </div>
      <div className="grid gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-white/5 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
\`\`\`
`;
    }

    // Empty state
    if (id.includes('empty') || title.includes('empty')) {
      md += `
### ${entity}EmptyState

**File**: \`src/components/${lowerEntity}/${lowerEntity}-empty.tsx\`

\`\`\`tsx
"use client";

import { Button } from '@/components/ui/button';
import { Plus, FolderOpen } from 'lucide-react';

interface ${entity}EmptyStateProps {
  onAdd?: () => void;
}

export function ${entity}EmptyState({ onAdd }: ${entity}EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
        <FolderOpen className="w-10 h-10 text-white/20" />
      </div>
      <h3 className="text-xl font-semibold text-white/80">
        No ${lowerEntity}s yet
      </h3>
      <p className="text-white/40 mt-2 max-w-md">
        Get started by creating your first ${lowerEntity}.
      </p>
      {onAdd && (
        <Button className="mt-6" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add ${entity}
        </Button>
      )}
    </div>
  );
}
\`\`\`
`;
    }

    // Form
    if (title.includes('form') || title.includes('add') || title.includes('create')) {
      md += `
### ${entity}Form

**File**: \`src/components/${lowerEntity}/${lowerEntity}-form.tsx\`

\`\`\`tsx
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ${entity}FormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initial?: any;
}

export function ${entity}Form({ open, onClose, onSubmit, initial }: ${entity}FormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    
    setIsLoading(true);
    try {
      await onSubmit({ name });
      toast.success(initial ? 'Updated!' : 'Created!');
      onClose();
    } catch (err) {
      toast.error('Failed to save');
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
}
\`\`\`
`;
    }

    return md;
  }

  /**
   * Generate task section
   */
  generateTaskSection(issue, entity, impl) {
    const tasks = [];
    const lowerEntity = entity.toLowerCase();
    const title = (issue.title || '').toLowerCase();

    if (impl.schema) {
      tasks.push(`Create database migration for ${lowerEntity}`);
    }

    if (impl.schema) {
      tasks.push(`Add TypeScript types in \`src/types/${lowerEntity}.ts\``);
    }

    if (title.includes('loading') || title.includes('skeleton')) {
      tasks.push(`Create ${entity}Skeleton component`);
    }

    if (title.includes('empty')) {
      tasks.push(`Create ${entity}EmptyState component`);
    }

    if (title.includes('form') || title.includes('add')) {
      tasks.push(`Create ${entity}Form component`);
    }

    tasks.push(`Integrate into page at \`${issue.route || 'appropriate route'}\``);
    tasks.push(`Test complete flow`);
    tasks.push(`Verify mobile responsiveness`);

    return `
---

## 📋 Implementation Tasks

${tasks.map((t, i) => `${i + 1}. [ ] ${t}`).join('\n')}
`;
  }

  /**
   * Get component code for pattern
   */
  getComponentCode(pattern, entity) {
    const lowerEntity = entity.toLowerCase();

    const codes = {
      list: `\`\`\`tsx
"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';

export function ${entity}List({ data, isLoading, onAdd }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return data;
    return data.filter(item => 
      item.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  if (isLoading) return <${entity}Skeleton />;
  if (data.length === 0) return <${entity}EmptyState onAdd={onAdd} />;

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
          Add ${entity}
        </Button>
      </div>
      <div className="space-y-2">
        {filtered.map((item) => (
          <${entity}Card key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
\`\`\``,

      card: `\`\`\`tsx
"use client";

export function ${entity}Card({ item }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10
      hover:bg-white/8 hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex-1">
        <h3 className="font-medium">{item.name}</h3>
        <p className="text-sm text-white/40">{item.description}</p>
      </div>
    </div>
  );
}
\`\`\``,

      form: `\`\`\`tsx
"use client";

// See form component above
\`\`\``,
    };

    return codes[pattern] || `\`\`\`tsx\n// ${pattern} component\n\`\`\``;
  }

  /**
   * Design section
   */
  getDesignSection() {
    return `
---

## 🎨 Design Requirements

| Element | Tailwind Classes |
|---------|-----------------|
| Card | \`rounded-2xl bg-white/5 border border-white/10 p-6\` |
| Input | \`h-12 bg-white/5 border-white/10 rounded-xl\` |
| Button | \`rounded-xl\` |
| Hover | \`hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200\` |

**Required States:**
- Loading: \`animate-pulse\` skeleton
- Empty: Icon + title + CTA
- Error: Red icon + message + retry
`;
  }

  /**
   * Final checklist
   */
  getChecklist(issue) {
    return `
---

## ✅ Checklist

- [ ] No TypeScript errors
- [ ] No console.log statements  
- [ ] Loading state works
- [ ] Empty state works
- [ ] Error handling complete
- [ ] Mobile responsive
- [ ] Tested with real data
`;
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

  getStatus() {
    return { ...this.getStats(), queueLength: this.mdQueue.length };
  }
}

export default BuilderAgent;
