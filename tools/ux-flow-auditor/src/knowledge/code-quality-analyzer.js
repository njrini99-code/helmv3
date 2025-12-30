/**
 * CODE QUALITY ANALYZER
 * 
 * Helm-specific code quality rules including:
 * - Type import validation
 * - Supabase pattern checking
 * - Client/Server component rules
 * - Table name validation
 * - Common bug patterns
 */

import { HelmProjectKnowledge } from './helm-project-knowledge.js';

export const CodeQualityAnalyzer = {

  // ============================================================
  // TYPE IMPORT VALIDATION
  // ============================================================
  
  typeImports: {
    // Correct import patterns
    correct: [
      /import\s+type\s+\{[^}]+\}\s+from\s+['"]@\/lib\/types['"]/,
      /import\s+\{[^}]*type\s+[^}]+\}\s+from\s+['"]@\/lib\/types['"]/,
    ],
    
    // Wrong import patterns to flag
    wrong: [
      { pattern: /from\s+['"]@\/types\//, message: 'Use @/lib/types instead of @/types/' },
      { pattern: /from\s+['"]@\/lib\/types\/database['"]/, message: 'Import from @/lib/types (index.ts), not @/lib/types/database' },
      { pattern: /from\s+['"]@\/lib\/types\/supabase['"]/, message: 'Import from @/lib/types, not @/lib/types/supabase' },
    ],
    
    // Check if import is valid
    validate(code) {
      const issues = [];
      for (const wrongPattern of this.wrong) {
        if (wrongPattern.pattern.test(code)) {
          issues.push({
            type: 'type-import',
            severity: 'error',
            message: wrongPattern.message,
            fix: "Change import to: import type { ... } from '@/lib/types';",
          });
        }
      }
      return issues;
    },
  },

  // ============================================================
  // SUPABASE CLIENT VALIDATION
  // ============================================================
  
  supabaseClient: {
    // Server patterns
    serverPatterns: [
      /import\s+\{[^}]*createClient[^}]*\}\s+from\s+['"]@\/lib\/supabase\/server['"]/,
    ],
    
    // Client patterns
    clientPatterns: [
      /import\s+\{[^}]*createClient[^}]*\}\s+from\s+['"]@\/lib\/supabase\/client['"]/,
    ],
    
    // Check for correct usage
    validate(code, isServerComponent) {
      const issues = [];
      
      const hasServerImport = this.serverPatterns.some(p => p.test(code));
      const hasClientImport = this.clientPatterns.some(p => p.test(code));
      const hasUseClient = /^['"]use client['"]/.test(code.trim());
      
      // Client component using server client
      if (hasUseClient && hasServerImport) {
        issues.push({
          type: 'supabase-client',
          severity: 'error',
          message: 'Client component is importing server Supabase client',
          fix: "Change to: import { createClient } from '@/lib/supabase/client';",
        });
      }
      
      // Server component using client client (less critical but still wrong)
      if (!hasUseClient && hasClientImport && isServerComponent) {
        issues.push({
          type: 'supabase-client',
          severity: 'warning',
          message: 'Server component is importing client Supabase client',
          fix: "Change to: import { createClient } from '@/lib/supabase/server';",
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // CLIENT COMPONENT DIRECTIVE
  // ============================================================
  
  clientDirective: {
    // Hooks that require 'use client'
    clientHooks: ['useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useContext', 'useReducer'],
    
    // Events that require 'use client'
    clientEvents: ['onClick', 'onChange', 'onSubmit', 'onFocus', 'onBlur', 'onKeyDown', 'onKeyUp', 'onMouseEnter', 'onMouseLeave'],
    
    validate(code) {
      const issues = [];
      const hasUseClient = /^['"]use client['"]/.test(code.trim());
      
      if (!hasUseClient) {
        // Check for hooks
        for (const hook of this.clientHooks) {
          const hookPattern = new RegExp(`\\b${hook}\\s*\\(`);
          if (hookPattern.test(code)) {
            issues.push({
              type: 'use-client',
              severity: 'error',
              message: `Using ${hook} without 'use client' directive`,
              fix: "Add 'use client' at the top of the file",
            });
            break; // Only report once
          }
        }
        
        // Check for event handlers (less reliable)
        for (const event of this.clientEvents) {
          const eventPattern = new RegExp(`${event}=\\{`);
          if (eventPattern.test(code)) {
            issues.push({
              type: 'use-client',
              severity: 'warning',
              message: `Using ${event} handler, may need 'use client' directive`,
              fix: "Add 'use client' at the top of the file if this is a client component",
            });
            break; // Only report once
          }
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // DATABASE TABLE VALIDATION
  // ============================================================
  
  tableNames: {
    // Valid table names from schema
    valid: Object.keys(HelmProjectKnowledge.database.tables),
    
    // Wrong table names people commonly use
    wrong: {
      'recruit_watchlist': 'watchlists',
      'player_videos': 'videos',
      'colleges': 'organizations (colleges is legacy)',
      'high_schools': 'organizations (high_schools is legacy)',
      'player_watchlist': 'watchlists',
      'coach_watchlist': 'watchlists',
    },
    
    validate(code) {
      const issues = [];
      
      // Check for wrong table names in .from() calls
      for (const [wrong, correct] of Object.entries(this.wrong)) {
        const pattern = new RegExp(`\\.from\\s*\\(\\s*['"]${wrong}['"]\\s*\\)`);
        if (pattern.test(code)) {
          issues.push({
            type: 'table-name',
            severity: 'error',
            message: `Wrong table name '${wrong}'`,
            fix: `Use '${correct}' instead`,
          });
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // PIPELINE STAGE VALIDATION
  // ============================================================
  
  pipelineStages: {
    valid: HelmProjectKnowledge.database.enums.pipeline_stage,
    
    validate(code) {
      const issues = [];
      
      // Look for pipeline_stage assignments or comparisons
      const stagePattern = /pipeline_stage['":\s]*[=:]\s*['"](\w+)['"]/g;
      let match;
      
      while ((match = stagePattern.exec(code)) !== null) {
        const stage = match[1];
        if (!this.valid.includes(stage)) {
          issues.push({
            type: 'pipeline-stage',
            severity: 'error',
            message: `Invalid pipeline stage '${stage}'`,
            fix: `Valid stages are: ${this.valid.join(', ')}`,
          });
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // COMMON BUG PATTERNS
  // ============================================================
  
  commonBugs: {
    patterns: [
      {
        pattern: /console\.(log|warn|error|debug)\s*\(/,
        type: 'console',
        severity: 'warning',
        message: 'Console statement in production code',
        fix: 'Remove console statements before production',
      },
      {
        pattern: /:\s*any\b/,
        type: 'any-type',
        severity: 'warning',
        message: 'TypeScript any type usage',
        fix: 'Use proper type instead of any',
      },
      {
        pattern: /TODO|FIXME|HACK|XXX/,
        type: 'todo',
        severity: 'info',
        message: 'TODO/FIXME comment found',
        fix: 'Address or remove before production',
      },
      {
        pattern: /onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/,
        type: 'empty-handler',
        severity: 'warning',
        message: 'Empty click handler',
        fix: 'Implement handler or remove if not needed',
      },
      {
        pattern: /<img[^>]+(?!alt=)[^>]*>/,
        type: 'missing-alt',
        severity: 'warning',
        message: 'Image without alt text',
        fix: 'Add alt attribute for accessibility',
      },
      {
        pattern: /SUPABASE_KEY|API_KEY|SECRET_KEY|PASSWORD\s*=/,
        type: 'secret',
        severity: 'blocker',
        message: 'Possible hardcoded secret',
        fix: 'Use environment variables for secrets',
      },
      {
        pattern: /async\s+function[^{]+\{[^}]*await[^}]*\}(?![^}]*catch)/,
        type: 'unhandled-async',
        severity: 'warning',
        message: 'Async function may lack error handling',
        fix: 'Add try/catch or error boundary',
      },
    ],
    
    validate(code) {
      const issues = [];
      
      for (const bug of this.patterns) {
        if (bug.pattern.test(code)) {
          issues.push({
            type: bug.type,
            severity: bug.severity,
            message: bug.message,
            fix: bug.fix,
          });
        }
      }
      
      return issues;
    },
  },

  // ============================================================
  // SERVER ACTION VALIDATION
  // ============================================================
  
  serverActions: {
    // Check for proper server action patterns
    validate(code, filePath) {
      const issues = [];
      
      // Only check files in /actions/ directory
      if (!filePath.includes('/actions/')) return issues;
      
      const hasUseServer = /^['"]use server['"]/.test(code.trim());
      
      if (!hasUseServer) {
        issues.push({
          type: 'server-action',
          severity: 'error',
          message: 'Server action file missing "use server" directive',
          fix: "Add 'use server' at the top of the file",
        });
      }
      
      // Check for auth check
      const hasAuthCheck = /getUser|auth\.getSession|supabase\.auth/.test(code);
      if (!hasAuthCheck) {
        issues.push({
          type: 'server-action-auth',
          severity: 'warning',
          message: 'Server action may be missing auth check',
          fix: 'Add auth check at the beginning of the action',
        });
      }
      
      // Check for revalidatePath on mutations
      const hasMutation = /\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(code);
      const hasRevalidate = /revalidatePath|revalidateTag/.test(code);
      
      if (hasMutation && !hasRevalidate) {
        issues.push({
          type: 'server-action-revalidate',
          severity: 'warning',
          message: 'Server action with mutation missing revalidatePath',
          fix: 'Add revalidatePath() after mutation',
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // HOOK PATTERNS
  // ============================================================
  
  hooks: {
    validate(code, filePath) {
      const issues = [];
      
      // Only check hook files
      if (!filePath.includes('/hooks/') && !filePath.match(/use[A-Z]/)) return issues;
      
      // Check for use client
      const hasUseClient = /^['"]use client['"]/.test(code.trim());
      if (!hasUseClient) {
        issues.push({
          type: 'hook-client',
          severity: 'error',
          message: 'Hook file missing "use client" directive',
          fix: "Add 'use client' at the top of the file",
        });
      }
      
      // Check for proper error handling
      const hasErrorState = /setError|error,\s*setError/.test(code);
      const hasTryCatch = /try\s*\{/.test(code);
      
      if (!hasErrorState && !hasTryCatch) {
        issues.push({
          type: 'hook-error',
          severity: 'warning',
          message: 'Hook may be missing error handling',
          fix: 'Add error state and try/catch for async operations',
        });
      }
      
      return issues;
    },
  },

  // ============================================================
  // MASTER VALIDATION FUNCTION
  // ============================================================
  
  validateCode(code, filePath = '') {
    const allIssues = [];
    
    // Run all validators
    allIssues.push(...this.typeImports.validate(code));
    allIssues.push(...this.supabaseClient.validate(code, filePath.includes('/app/') && !code.includes("'use client'")));
    allIssues.push(...this.clientDirective.validate(code));
    allIssues.push(...this.tableNames.validate(code));
    allIssues.push(...this.pipelineStages.validate(code));
    allIssues.push(...this.commonBugs.validate(code));
    allIssues.push(...this.serverActions.validate(code, filePath));
    allIssues.push(...this.hooks.validate(code, filePath));
    
    // Deduplicate issues
    const seen = new Set();
    return allIssues.filter(issue => {
      const key = `${issue.type}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  
  // Get issues by severity
  getIssuesBySeverity(issues) {
    return {
      blockers: issues.filter(i => i.severity === 'blocker'),
      errors: issues.filter(i => i.severity === 'error'),
      warnings: issues.filter(i => i.severity === 'warning'),
      info: issues.filter(i => i.severity === 'info'),
    };
  },
  
  // Get fix suggestions
  getFixSuggestions(issues) {
    return issues.map(issue => ({
      type: issue.type,
      problem: issue.message,
      solution: issue.fix,
    }));
  },
};

// Export helper functions
export function validateCode(code, filePath) {
  return CodeQualityAnalyzer.validateCode(code, filePath);
}

export function getCodeIssues(code, filePath) {
  const issues = CodeQualityAnalyzer.validateCode(code, filePath);
  return CodeQualityAnalyzer.getIssuesBySeverity(issues);
}

export default CodeQualityAnalyzer;
