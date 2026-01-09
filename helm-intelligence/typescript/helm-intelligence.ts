/**
 * Helm Intelligence - TypeScript SDK
 * Ultra-powerful multi-agent system for codebase auditing.
 * Designed for Next.js 14 / TypeScript / Supabase stack.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// ============================================
// TYPES
// ============================================

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Category =
  | "security"
  | "performance"
  | "type_safety"
  | "code_quality"
  | "accessibility"
  | "ui_consistency"
  | "database"
  | "architecture"
  | "testing";

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  description: string;
  location: {
    file?: string;
    line?: number;
    component?: string;
    table?: string;
    policy?: string;
  };
  evidence: string;
  suggestedFix: string;
  automatable: boolean;
  agentId: string;
  timestamp: string;
}

export interface AgentConfig {
  role: AgentRole;
  model: string;
  systemPrompt: string;
  tools: string[];
  maxTurns: number;
  temperature: number;
  thinkingBudget: number;
}

export type AgentRole =
  | "orchestrator"
  | "code_auditor"
  | "database_auditor"
  | "ui_ux_auditor"
  | "enhancement_agent";

export interface AuditConfig {
  auditCode: boolean;
  auditDatabase: boolean;
  auditUi: boolean;
  deepAnalysis: boolean;
  autoFixLowRisk: boolean;
  maxFilesPerAgent: number;
}

export interface AuditReport {
  workflowId: string;
  title: string;
  generatedAt: string;
  executiveSummary: string;
  findingsSummary: Record<string, Record<string, number>>;
  criticalIssues: Finding[];
  highPriority: Finding[];
  quickWins: Finding[];
  roadmap: string;
  agentStats: {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: string;
    agentsCompleted: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

// ============================================
// CONFIGURATION
// ============================================

export const MODELS = {
  ORCHESTRATOR: "claude-opus-4-20250514",
  SPECIALIST: "claude-sonnet-4-20250514",
  FAST: "claude-3-5-haiku-20241022",
} as const;

export const HELM_CONFIG = {
  products: ["BaseballHelm", "GolfHelm", "CoachHelm"],
  framework: "Next.js 14 App Router",
  language: "TypeScript strict",
  database: "Supabase (PostgreSQL)",
  styling: "Tailwind CSS",
  designSystem: {
    primaryColor: "#16A34A",
    background: "#FFFEFA",
    glassmorphism: "bg-white/70 backdrop-blur-xl border-white/20",
  },
  baseballTables: [
    "users",
    "coaches",
    "players",
    "organizations",
    "teams",
    "watchlists",
    "videos",
  ],
  golfTables: [
    "golf_players",
    "golf_rounds",
    "golf_holes",
    "golf_events",
    "coach_philosophy",
  ],
  pipelineStages: [
    "watchlist",
    "high_priority",
    "offer_extended",
    "committed",
    "uninterested",
  ],
};

// ============================================
// SYSTEM PROMPTS
// ============================================

const CODE_AUDITOR_PROMPT = `You are an expert Code Auditor Agent for Helm Intelligence.

# Your Expertise
- TypeScript strict mode
- Next.js 14 App Router
- React Server/Client Components
- Supabase integration
- Tailwind CSS

# Critical Rules (Helm Sports Labs)
1. Types: import from '@/lib/types' ONLY
2. Supabase Server: await createClient() from '@/lib/supabase/server'
3. Supabase Client: 'use client' + createClient() from '@/lib/supabase/client'
4. Server Actions: Must check auth, call revalidatePath()
5. Pipeline stages: watchlist | high_priority | offer_extended | committed | uninterested

# Check For
1. Missing 'use client' on components using hooks
2. Wrong type imports (@/types instead of @/lib/types)
3. Supabase client misuse (server in client or vice versa)
4. Missing auth checks in server actions
5. Missing revalidatePath after mutations
6. Performance issues (inline objects, missing memoization)
7. Security vulnerabilities

Be thorough and provide specific line numbers and fixes.`;

const DATABASE_AUDITOR_PROMPT = `You are an expert Database Auditor Agent for Helm Intelligence.

# Your Expertise
- PostgreSQL internals
- Supabase Row Level Security (RLS)
- Index optimization
- Schema design

# Critical Checks
1. Tables without RLS enabled
2. Missing SELECT/INSERT/UPDATE/DELETE policies
3. Overly permissive policies (USING true)
4. Missing foreign key indexes
5. Auth.uid() usage in policies
6. Recursive policy dependencies
7. Functions without SECURITY DEFINER

# Helm Tables
Baseball: users, coaches, players, organizations, teams, watchlists, videos
Golf: golf_players, golf_rounds, golf_holes, golf_events, coach_philosophy

Provide SQL fixes for all issues found.`;

const UI_AUDITOR_PROMPT = `You are an expert UI/UX Auditor Agent for Helm Intelligence.

# Your Expertise
- React component architecture
- WCAG 2.1 AA accessibility
- Tailwind CSS
- Design system compliance

# Helm Design System
- Primary: #16A34A (Kelly green)
- Background: #FFFEFA (Cream)
- Glassmorphism: bg-white/70 backdrop-blur-xl border-white/20 rounded-2xl
- Inspiration: Linear, Stripe, Vercel

# Check For
1. Missing alt text on images
2. Missing form labels
3. Color contrast issues
4. Hardcoded colors (should use design tokens)
5. Inconsistent glassmorphism
6. Missing loading/error/empty states
7. Large components (>200 lines)
8. Inline functions in JSX

Report with file locations and specific fixes.`;

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

const tools: Record<string, (input: Record<string, unknown>) => unknown> = {
  read_file: ({ path: filePath, maxLines }: { path: string; maxLines?: number }) => {
    try {
      let content = fs.readFileSync(filePath as string, "utf-8");
      if (maxLines) {
        const lines = content.split("\n").slice(0, maxLines as number);
        content = lines.join("\n");
      }
      return content;
    } catch (e) {
      return `Error: ${e}`;
    }
  },

  list_directory: ({ path: dirPath, pattern }: { path: string; pattern?: string }) => {
    try {
      const items = fs.readdirSync(dirPath as string, { withFileTypes: true });
      return items.map((item) => ({
        name: item.name,
        type: item.isDirectory() ? "directory" : "file",
        path: path.join(dirPath as string, item.name),
      }));
    } catch (e) {
      return `Error: ${e}`;
    }
  },

  search_files: ({
    directory,
    pattern,
    filePattern,
  }: {
    directory: string;
    pattern: string;
    filePattern?: string;
  }) => {
    const results: Array<{
      file: string;
      matches: Array<{ line: number; content: string }>;
    }> = [];
    const regex = new RegExp(pattern as string, "g");

    function searchDir(dir: string) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory() && !item.name.includes("node_modules")) {
          searchDir(fullPath);
        } else if (item.isFile() && (item.name.endsWith(".ts") || item.name.endsWith(".tsx"))) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            const matches: Array<{ line: number; content: string }> = [];
            lines.forEach((line, i) => {
              if (regex.test(line)) {
                matches.push({ line: i + 1, content: line.trim().slice(0, 200) });
              }
            });
            if (matches.length > 0) {
              results.push({ file: fullPath, matches: matches.slice(0, 10) });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    searchDir(directory as string);
    return results.slice(0, 50);
  },

  analyze_component: ({ filepath }: { filepath: string }) => {
    try {
      const content = fs.readFileSync(filepath as string, "utf-8");
      const hooks = ["useState", "useEffect", "useCallback", "useMemo", "useRef"];
      const usedHooks = hooks.filter((h) => content.includes(h));

      return {
        filepath,
        isClientComponent: content.includes("'use client'") || content.includes('"use client"'),
        lineCount: content.split("\n").length,
        usesHooks: usedHooks,
        hasLoadingState: /isLoading|loading|Skeleton/.test(content),
        hasErrorState: /error|Error|catch/.test(content),
        issues: [
          ...(usedHooks.length > 0 &&
          !content.includes("'use client'") &&
          !content.includes('"use client"')
            ? [{ type: "missing_use_client", message: "Uses hooks but missing 'use client'" }]
            : []),
          ...(content.split("\n").length > 200
            ? [{ type: "large_component", message: "Component exceeds 200 lines" }]
            : []),
        ],
      };
    } catch (e) {
      return { error: String(e) };
    }
  },

  check_types: ({ filepath }: { filepath: string }) => {
    try {
      const content = fs.readFileSync(filepath as string, "utf-8");
      const issues: Array<{ line: number; type: string; content: string }> = [];
      const lines = content.split("\n");

      lines.forEach((line, i) => {
        if (/: any\b|<any>|as any/.test(line)) {
          issues.push({ line: i + 1, type: "any_type", content: line.trim().slice(0, 100) });
        }
        if (/@\/types[^\/]/.test(line) && !/@\/lib\/types/.test(line)) {
          issues.push({
            line: i + 1,
            type: "wrong_import",
            content: "Should use @/lib/types",
          });
        }
      });

      return { filepath, issues, issueCount: issues.length };
    } catch (e) {
      return { error: String(e) };
    }
  },
};

// Tool definitions for API
const toolDefinitions: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read contents of a file",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        maxLines: { type: "number", description: "Max lines to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: "List directory contents",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        pattern: { type: "string", description: "Glob pattern" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for pattern in files",
    input_schema: {
      type: "object",
      properties: {
        directory: { type: "string" },
        pattern: { type: "string" },
        filePattern: { type: "string" },
      },
      required: ["directory", "pattern"],
    },
  },
  {
    name: "analyze_component",
    description: "Analyze a React component",
    input_schema: {
      type: "object",
      properties: { filepath: { type: "string" } },
      required: ["filepath"],
    },
  },
  {
    name: "check_types",
    description: "Check TypeScript types in a file",
    input_schema: {
      type: "object",
      properties: { filepath: { type: "string" } },
      required: ["filepath"],
    },
  },
];

// ============================================
// BASE AGENT
// ============================================

export class BaseAgent {
  protected client: Anthropic;
  protected config: AgentConfig;
  public agentId: string;
  public findings: Finding[] = [];
  protected messages: Anthropic.MessageParam[] = [];
  protected turnCount = 0;
  protected inputTokens = 0;
  protected outputTokens = 0;

  constructor(config: AgentConfig, client?: Anthropic) {
    this.client = client || new Anthropic();
    this.config = config;
    this.agentId = `${config.role}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async *run(
    task: string,
    context?: Record<string, unknown>
  ): AsyncGenerator<{
    type: string;
    content?: string;
    tool?: string;
    input?: unknown;
    result?: unknown;
  }> {
    // Build initial message
    let initialContent = `# Task\n${task}\n`;
    if (context) {
      initialContent += `\n# Context\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
    }

    this.messages.push({ role: "user", content: initialContent });

    while (this.turnCount < this.config.maxTurns) {
      this.turnCount++;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 16384,
        system: [
          {
            type: "text",
            text: this.config.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: this.messages,
        tools: toolDefinitions as Anthropic.Tool[],
        temperature: this.config.temperature,
      });

      this.inputTokens += response.usage.input_tokens;
      this.outputTokens += response.usage.output_tokens;

      const assistantContent: Anthropic.ContentBlock[] = [];
      const toolCalls: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          assistantContent.push(block);
          yield { type: "text", content: block.text };
        } else if (block.type === "tool_use") {
          assistantContent.push(block);
          toolCalls.push(block);
          yield { type: "tool_call", tool: block.name, input: block.input };
        }
      }

      this.messages.push({ role: "assistant", content: assistantContent });

      if (response.stop_reason === "end_turn" && toolCalls.length === 0) {
        yield { type: "complete" };
        break;
      }

      if (toolCalls.length > 0) {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          const handler = tools[toolCall.name];
          if (handler) {
            try {
              const result = handler(toolCall.input as Record<string, unknown>);
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolCall.id,
                content: typeof result === "string" ? result : JSON.stringify(result, null, 2),
              });
              yield { type: "tool_result", tool: toolCall.name, result };
            } catch (e) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolCall.id,
                content: `Error: ${e}`,
                is_error: true,
              });
            }
          }
        }

        this.messages.push({ role: "user", content: toolResults });
      }
    }
  }

  addFinding(finding: Omit<Finding, "id" | "agentId" | "timestamp">): void {
    this.findings.push({
      ...finding,
      id: Math.random().toString(36).slice(2, 10),
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
    });
  }

  getStats() {
    const costs = {
      [MODELS.ORCHESTRATOR]: { input: 15.0, output: 75.0 },
      [MODELS.SPECIALIST]: { input: 3.0, output: 15.0 },
      [MODELS.FAST]: { input: 0.25, output: 1.25 },
    };
    const modelCosts = costs[this.config.model as keyof typeof costs] || { input: 3.0, output: 15.0 };
    const cost =
      (this.inputTokens / 1_000_000) * modelCosts.input +
      (this.outputTokens / 1_000_000) * modelCosts.output;

    return {
      agentId: this.agentId,
      role: this.config.role,
      turns: this.turnCount,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      findingsCount: this.findings.length,
      estimatedCost: cost.toFixed(4),
    };
  }
}

// ============================================
// SPECIALIZED AGENTS
// ============================================

export class CodeAuditorAgent extends BaseAgent {
  constructor(client?: Anthropic) {
    super(
      {
        role: "code_auditor",
        model: MODELS.SPECIALIST,
        systemPrompt: CODE_AUDITOR_PROMPT,
        tools: ["read_file", "list_directory", "search_files", "analyze_component", "check_types"],
        maxTurns: 100,
        temperature: 0,
        thinkingBudget: 15000,
      },
      client
    );
  }

  async audit(projectRoot: string): Promise<{ findings: Finding[]; stats: ReturnType<BaseAgent["getStats"]> }> {
    const task = `Perform a comprehensive code audit of the Helm Sports Labs codebase.

Project root: ${projectRoot}
Source directory: ${projectRoot}/src

Focus areas:
1. Type safety and imports (must use @/lib/types)
2. React patterns (Server vs Client components, 'use client' directives)
3. Supabase patterns (server vs client, auth checks)
4. Performance issues (memoization, bundle size)
5. Security concerns

Start by listing the directory structure, then analyze high-risk files:
- Server actions in src/app/actions/
- API routes in src/app/api/
- Auth-related files
- Database query files

Report all findings with severity and suggested fixes.`;

    for await (const event of this.run(task, { projectRoot, helmConfig: HELM_CONFIG })) {
      // Process events (could emit to callback)
      if (event.type === "complete") break;
    }

    return { findings: this.findings, stats: this.getStats() };
  }
}

export class DatabaseAuditorAgent extends BaseAgent {
  constructor(client?: Anthropic) {
    super(
      {
        role: "database_auditor",
        model: MODELS.SPECIALIST,
        systemPrompt: DATABASE_AUDITOR_PROMPT,
        tools: ["read_file", "list_directory", "search_files"],
        maxTurns: 80,
        temperature: 0,
        thinkingBudget: 15000,
      },
      client
    );
  }

  async audit(projectRoot: string): Promise<{ findings: Finding[]; stats: ReturnType<BaseAgent["getStats"]> }> {
    const task = `Perform a comprehensive database security audit.

Migration directory: ${projectRoot}/supabase/migrations

Focus areas:
1. RLS policies - coverage and security
2. Missing indexes on foreign keys
3. Schema quality and data integrity
4. Migration safety

Review all migration files and identify:
- Tables without RLS enabled
- Overly permissive policies
- Missing foreign key indexes
- Potential security vulnerabilities

Provide SQL fixes for all issues found.`;

    for await (const event of this.run(task, { projectRoot, helmConfig: HELM_CONFIG })) {
      if (event.type === "complete") break;
    }

    return { findings: this.findings, stats: this.getStats() };
  }
}

export class UIUXAuditorAgent extends BaseAgent {
  constructor(client?: Anthropic) {
    super(
      {
        role: "ui_ux_auditor",
        model: MODELS.SPECIALIST,
        systemPrompt: UI_AUDITOR_PROMPT,
        tools: ["read_file", "list_directory", "search_files", "analyze_component"],
        maxTurns: 100,
        temperature: 0,
        thinkingBudget: 12000,
      },
      client
    );
  }

  async audit(projectRoot: string): Promise<{ findings: Finding[]; stats: ReturnType<BaseAgent["getStats"]> }> {
    const task = `Perform a comprehensive UI/UX audit.

Components directory: ${projectRoot}/src/components
App directory: ${projectRoot}/src/app

Focus areas:
1. Accessibility (WCAG 2.1 AA compliance)
2. Design system consistency (glassmorphism, colors, spacing)
3. Component quality (loading states, error handling)
4. Performance (code splitting, memoization)

Check all React components for:
- Missing alt text on images
- Form label accessibility
- Design token usage
- Proper loading/error/empty states

Report findings with file locations and fixes.`;

    for await (const event of this.run(task, { projectRoot, helmConfig: HELM_CONFIG })) {
      if (event.type === "complete") break;
    }

    return { findings: this.findings, stats: this.getStats() };
  }
}

// ============================================
// ORCHESTRATOR
// ============================================

export class HelmIntelligenceOrchestrator {
  private client: Anthropic;
  private config: AuditConfig;
  private findings: {
    code: Finding[];
    database: Finding[];
    ui: Finding[];
  } = { code: [], database: [], ui: [] };
  private stats: {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
  } = { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 };

  constructor(config?: Partial<AuditConfig>, client?: Anthropic) {
    this.client = client || new Anthropic();
    this.config = {
      auditCode: true,
      auditDatabase: true,
      auditUi: true,
      deepAnalysis: true,
      autoFixLowRisk: false,
      maxFilesPerAgent: 100,
      ...config,
    };
  }

  async runFullAudit(projectRoot: string): Promise<AuditReport> {
    const workflowId = `wf_${Date.now().toString(36)}`;
    console.log(`\n🚀 Starting Helm Intelligence Audit: ${workflowId}\n`);

    // Run agents in parallel
    const agentPromises: Promise<void>[] = [];

    if (this.config.auditCode) {
      agentPromises.push(this.runCodeAudit(projectRoot));
    }
    if (this.config.auditDatabase) {
      agentPromises.push(this.runDatabaseAudit(projectRoot));
    }
    if (this.config.auditUi) {
      agentPromises.push(this.runUIAudit(projectRoot));
    }

    await Promise.all(agentPromises);

    // Generate report
    return this.generateReport(workflowId);
  }

  private async runCodeAudit(projectRoot: string): Promise<void> {
    console.log("📝 Code Auditor: Starting...");
    const agent = new CodeAuditorAgent(this.client);
    const result = await agent.audit(projectRoot);
    this.findings.code = result.findings;
    this.updateStats(result.stats);
    console.log(`📝 Code Auditor: Found ${result.findings.length} issues`);
  }

  private async runDatabaseAudit(projectRoot: string): Promise<void> {
    console.log("🗄️  Database Auditor: Starting...");
    const agent = new DatabaseAuditorAgent(this.client);
    const result = await agent.audit(projectRoot);
    this.findings.database = result.findings;
    this.updateStats(result.stats);
    console.log(`🗄️  Database Auditor: Found ${result.findings.length} issues`);
  }

  private async runUIAudit(projectRoot: string): Promise<void> {
    console.log("🎨 UI/UX Auditor: Starting...");
    const agent = new UIUXAuditorAgent(this.client);
    const result = await agent.audit(projectRoot);
    this.findings.ui = result.findings;
    this.updateStats(result.stats);
    console.log(`🎨 UI/UX Auditor: Found ${result.findings.length} issues`);
  }

  private updateStats(agentStats: ReturnType<BaseAgent["getStats"]>): void {
    this.stats.totalInputTokens += agentStats.inputTokens;
    this.stats.totalOutputTokens += agentStats.outputTokens;
    this.stats.estimatedCost += parseFloat(agentStats.estimatedCost);
  }

  private generateReport(workflowId: string): AuditReport {
    const allFindings = [...this.findings.code, ...this.findings.database, ...this.findings.ui];

    const criticalIssues = allFindings.filter((f) => f.severity === "critical");
    const highPriority = allFindings.filter((f) => f.severity === "high");
    const quickWins = allFindings.filter((f) => f.automatable);

    // Group by category and severity
    const summary: Record<string, Record<string, number>> = {};
    for (const f of allFindings) {
      if (!summary[f.category]) summary[f.category] = {};
      summary[f.category][f.severity] = (summary[f.category][f.severity] || 0) + 1;
    }

    return {
      workflowId,
      title: `Helm Intelligence Audit Report`,
      generatedAt: new Date().toISOString(),
      executiveSummary: this.generateExecutiveSummary(allFindings, criticalIssues, highPriority),
      findingsSummary: summary,
      criticalIssues,
      highPriority,
      quickWins,
      roadmap: this.generateRoadmap(allFindings),
      agentStats: {
        totalInputTokens: this.stats.totalInputTokens,
        totalOutputTokens: this.stats.totalOutputTokens,
        estimatedCost: `$${this.stats.estimatedCost.toFixed(2)}`,
        agentsCompleted: 3,
      },
    };
  }

  private generateExecutiveSummary(
    all: Finding[],
    critical: Finding[],
    high: Finding[]
  ): string {
    return `This automated audit identified ${all.length} findings across code quality, database security, and UI/UX compliance.

**Priority Items**: ${critical.length} critical issues require immediate attention, with ${high.length} additional high-priority items.

**Estimated Effort**: The roadmap estimates 6 weeks of focused work to address all significant findings.`;
  }

  private generateRoadmap(findings: Finding[]): string {
    const critical = findings.filter((f) => f.severity === "critical");
    const high = findings.filter((f) => f.severity === "high");

    return `## Improvement Roadmap

### Week 1-2: Security & Critical Fixes
- Address ${critical.length} critical security issues
- Fix RLS policy gaps
- Add missing auth checks

### Week 3-4: Quality & Performance
- Fix ${high.length} high-priority issues
- Optimize database queries
- Reduce bundle size

### Week 5-6: Polish & UX
- Fix accessibility issues
- Ensure design system consistency
- Add missing loading/empty states`;
  }
}

// ============================================
// EXPORTS & CLI
// ============================================

export async function runAudit(projectRoot?: string): Promise<AuditReport> {
  const root = projectRoot || process.cwd();
  const orchestrator = new HelmIntelligenceOrchestrator();
  return orchestrator.runFullAudit(root);
}

// CLI Entry point
if (require.main === module) {
  const projectRoot = process.argv[2] || "/Users/ricknini/Downloads/helmv3";

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   HELM INTELLIGENCE - TypeScript SDK                         ║
║   Multi-Agent Codebase Auditing System                       ║
╚═══════════════════════════════════════════════════════════════╝
`);

  runAudit(projectRoot)
    .then((report) => {
      console.log("\n✅ Audit Complete!\n");
      console.log(`📊 Total Findings: ${
        report.criticalIssues.length +
        report.highPriority.length +
        report.quickWins.length
      }`);
      console.log(`🔴 Critical: ${report.criticalIssues.length}`);
      console.log(`🟠 High: ${report.highPriority.length}`);
      console.log(`⚡ Quick Wins: ${report.quickWins.length}`);
      console.log(`\n💰 Cost: ${report.agentStats.estimatedCost}`);

      // Save report
      const reportPath = path.join(process.cwd(), `helm-audit-${report.workflowId}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved: ${reportPath}`);
    })
    .catch((err) => {
      console.error("Audit failed:", err);
      process.exit(1);
    });
}
