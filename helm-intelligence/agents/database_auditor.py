"""
Helm Intelligence - Database Auditor Agent
Specialized agent for Supabase/PostgreSQL schema, RLS, and performance analysis.
"""

from dataclasses import dataclass
from typing import Optional
from pathlib import Path

from agents.base import BaseAgent, Finding, AgentConfig
from config.settings import AgentRole, Models, Severity, Category, HelmConfig


# ============================================
# DATABASE AUDITOR SYSTEM PROMPT
# ============================================

DATABASE_AUDITOR_SYSTEM_PROMPT = """You are an expert Database Auditor Agent for Helm Intelligence, specializing in Supabase/PostgreSQL security and performance.

# Your Expertise
- PostgreSQL internals and optimization
- Supabase Row Level Security (RLS)
- Database schema design
- Index optimization
- Query performance analysis
- Data integrity and foreign keys
- Migration safety

# Codebase Context: Helm Sports Labs
- **Database**: Supabase (PostgreSQL)
- **Products**: BaseballHelm (recruiting), GolfHelm (team management), CoachHelm (AI)

# Critical Tables

## Baseball Tables
- users, coaches, players, organizations, teams
- team_members, watchlists, videos, player_metrics
- coach_notes, events, camps, messages, conversations

## Golf Tables  
- golf_players, golf_rounds, golf_holes, golf_shots
- golf_events, golf_courses, golf_team_settings
- golf_qualifying_events, coach_philosophy, round_reviews

# RLS Security Checklist (22 checks from Supabase)
1. Tables without RLS enabled
2. Tables without SELECT policies
3. Tables without INSERT policies  
4. Tables without UPDATE policies
5. Tables without DELETE policies
6. Policies using auth.uid() properly
7. Policies with function calls (security risk)
8. Policies with subqueries (performance risk)
9. Recursive policy dependencies
10. Missing team_id scoping
11. Cross-tenant data exposure risks
12. Overly permissive policies (USING (true))
13. Missing policy for authenticated role
14. Missing policy for anon role where needed
15. Inconsistent policy naming
16. Policies that could cause infinite recursion
17. Missing SECURITY DEFINER on functions
18. Functions with SECURITY INVOKER leaking data
19. Missing search_path on functions
20. Triggers without proper security
21. Views exposing sensitive data
22. Materialized views with stale data

# Performance Checks
1. Missing indexes on foreign keys
2. Missing indexes on commonly filtered columns
3. Unused indexes
4. Missing ANALYZE statistics
5. Large table scans
6. N+1 query patterns in code
7. Missing connection pooling configuration
8. Inefficient JOIN patterns
9. Missing partial indexes for filtered queries
10. Composite index opportunities

# Schema Quality Checks
1. Missing foreign key constraints
2. Nullable columns that should be NOT NULL
3. Missing default values
4. Inconsistent column naming (snake_case)
5. Missing created_at/updated_at timestamps
6. Missing soft delete columns where appropriate
7. Orphaned records (FK without CASCADE)
8. Type mismatches between related columns
9. Missing CHECK constraints
10. ENUM values that need updating

# Your Task
1. Analyze the database schema and migrations
2. Check all RLS policies for security vulnerabilities
3. Identify performance optimization opportunities
4. Validate data integrity constraints
5. Review migration safety

# Output Format
For each finding:
- Severity: critical | high | medium | low
- Category: security | performance | database | architecture
- Location: { table, column, policy, migration }
- Evidence: The problematic SQL or configuration
- Suggested fix: Corrective SQL statements

Use the provided tools to query the database schema and analyze migrations.
"""


# ============================================
# CRITICAL SQL AUDIT QUERIES
# ============================================

SQL_QUERIES = {
    # Tables without RLS enabled
    "tables_without_rls": """
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND rowsecurity = false;
    """,
    
    # Tables missing policies
    "tables_missing_policies": """
        SELECT t.tablename, 
               COUNT(p.policyname) as policy_count,
               ARRAY_AGG(p.cmd) as commands_covered
        FROM pg_tables t
        LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
        WHERE t.schemaname = 'public'
        GROUP BY t.tablename
        HAVING COUNT(p.policyname) = 0 OR 
               NOT (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] <@ ARRAY_AGG(p.cmd::text));
    """,
    
    # Overly permissive policies
    "permissive_policies": """
        SELECT schemaname, tablename, policyname, cmd, qual
        FROM pg_policies
        WHERE schemaname = 'public'
        AND (qual::text = 'true' OR qual IS NULL)
        AND cmd != 'SELECT';
    """,
    
    # Policies with function calls (potential security risk)
    "policies_with_functions": """
        SELECT tablename, policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
        AND (qual::text LIKE '%(%' OR with_check::text LIKE '%(%');
    """,
    
    # Missing foreign key indexes
    "missing_fk_indexes": """
        SELECT 
            c.conname AS constraint_name,
            c.conrelid::regclass AS table_name,
            a.attname AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f'
        AND NOT EXISTS (
            SELECT 1 FROM pg_index i
            WHERE i.indrelid = c.conrelid 
            AND a.attnum = ANY(i.indkey)
        );
    """,
    
    # Tables missing common columns
    "tables_missing_timestamps": """
        SELECT t.tablename
        FROM pg_tables t
        WHERE t.schemaname = 'public'
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
            WHERE c.table_name = t.tablename
            AND c.column_name = 'created_at'
        );
    """,
    
    # Nullable foreign keys (potential data integrity issue)
    "nullable_fks": """
        SELECT 
            tc.table_name,
            kcu.column_name,
            c.is_nullable
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.columns c 
            ON c.table_name = tc.table_name AND c.column_name = kcu.column_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND c.is_nullable = 'YES'
        AND tc.table_schema = 'public';
    """,
    
    # Duplicate indexes
    "duplicate_indexes": """
        SELECT 
            indrelid::regclass AS table_name,
            array_agg(indexrelid::regclass) AS index_names
        FROM pg_index
        GROUP BY indrelid, indkey
        HAVING COUNT(*) > 1;
    """,
    
    # Large tables without recent ANALYZE
    "tables_needing_analyze": """
        SELECT 
            schemaname,
            relname,
            last_analyze,
            last_autoanalyze,
            n_live_tup
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND n_live_tup > 1000
        AND (last_analyze IS NULL OR last_analyze < NOW() - INTERVAL '7 days')
        AND (last_autoanalyze IS NULL OR last_autoanalyze < NOW() - INTERVAL '7 days');
    """,
    
    # Functions without SECURITY DEFINER where needed
    "functions_security_check": """
        SELECT 
            n.nspname AS schema,
            p.proname AS function_name,
            p.prosecdef AS security_definer,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prokind = 'f';
    """,
    
    # Triggers that might bypass RLS
    "triggers_security_check": """
        SELECT 
            t.tgname AS trigger_name,
            c.relname AS table_name,
            p.proname AS function_name,
            p.prosecdef AS function_is_security_definer
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE c.relnamespace = 'public'::regnamespace
        AND NOT t.tgisinternal;
    """,
}


# ============================================
# DATABASE AUDITOR AGENT
# ============================================

class DatabaseAuditorAgent(BaseAgent):
    """
    Specialized agent for Supabase/PostgreSQL analysis.
    MAXIMUM POWER MODE - Full context, comprehensive security audit.
    """
    
    def __init__(self, helm_config: Optional[HelmConfig] = None):
        config = AgentConfig(
            role=AgentRole.DATABASE_AUDITOR,
            model=Models.SPECIALIST,
            system_prompt=DATABASE_AUDITOR_SYSTEM_PROMPT,
            tools=[
                "execute_sql",
                "read_migration",
                "list_migrations",
                "analyze_rls_policy",
                "check_indexes",
                "explain_query",
            ],
            max_turns=100,
            temperature=0.0,
            thinking_budget=0,        # Disabled for API compatibility
            max_output_tokens=16384,  # Full output capacity
        )
        super().__init__(config)
        self.helm_config = helm_config or HelmConfig()
        self.sql_queries = SQL_QUERIES
    
    async def execute_task(self, task: str, context: dict) -> dict:
        """Execute the database audit task."""
        async for event in self.run(task, context):
            if event["type"] == "complete":
                break
        
        return {
            "agent_id": self.agent_id,
            "findings": [f.to_dict() for f in self.findings],
            "stats": self.get_stats(),
        }
    
    async def audit_rls_security(self) -> list[Finding]:
        """Comprehensive RLS security audit."""
        task = """Perform a comprehensive RLS security audit:

1. **Enable Check**: Find all tables without RLS enabled
   Run: SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;

2. **Policy Coverage**: Check each table has SELECT, INSERT, UPDATE, DELETE policies
   
3. **Permissive Policies**: Find dangerous (USING true) or (WITH CHECK true) policies

4. **Auth Check**: Ensure all policies use auth.uid() or auth.jwt() properly

5. **Team Scoping**: Verify golf tables scope to team_id, baseball to organization_id

6. **Recursion Check**: Look for policies that reference the same table they protect

7. **Function Security**: Check triggers and functions for SECURITY DEFINER

For each issue found, provide:
- Affected table/policy
- The security risk
- Corrective SQL

Focus on critical security issues first. This database handles sensitive recruiting data.
"""
        context = {
            "baseball_tables": self.helm_config.baseball_tables,
            "golf_tables": self.helm_config.golf_tables,
        }
        await self.execute_task(task, context)
        return self.findings
    
    async def audit_performance(self) -> list[Finding]:
        """Database performance audit."""
        task = """Perform a database performance audit:

1. **Missing FK Indexes**: Find foreign keys without indexes
   These cause slow JOINs and CASCADE operations

2. **Unused Indexes**: Find indexes that aren't being used
   These slow down writes without benefiting reads

3. **Table Statistics**: Check tables need ANALYZE

4. **Common Filters**: Identify columns used in WHERE clauses that lack indexes:
   - player_id, coach_id, team_id, organization_id
   - user_id, created_at, updated_at
   - status columns, enum columns

5. **Composite Index Opportunities**: Look for common multi-column filters

6. **Query Patterns**: Review code for N+1 patterns in Supabase queries

For each finding:
- The affected table/index
- Performance impact estimate
- CREATE INDEX or DROP INDEX statement
"""
        await self.execute_task(task, {})
        return self.findings
    
    async def audit_schema_quality(self) -> list[Finding]:
        """Schema quality and data integrity audit."""
        task = """Audit schema quality and data integrity:

1. **Missing Constraints**:
   - Foreign keys without ON DELETE behavior
   - Columns that should be NOT NULL
   - Missing CHECK constraints on enums
   - Missing UNIQUE constraints

2. **Naming Consistency**:
   - All columns should be snake_case
   - All tables should be lowercase plural
   - Foreign keys should be {table}_id format

3. **Timestamps**:
   - All tables should have created_at (default now())
   - Mutable tables should have updated_at

4. **Type Consistency**:
   - IDs should all be UUID
   - Timestamps should be TIMESTAMPTZ
   - Related columns should have matching types

5. **Orphan Prevention**:
   - Check CASCADE and SET NULL behaviors
   - Identify potential orphaned records

6. **Golf-Specific**:
   - golf_rounds must reference golf_players and golf_events
   - golf_holes must reference golf_rounds
   - golf_shots must reference golf_holes

7. **Baseball-Specific**:
   - watchlists must reference coaches and players
   - videos must reference players
   - player_metrics must reference players

Provide DDL statements to fix any issues found.
"""
        context = {
            "baseball_tables": self.helm_config.baseball_tables,
            "golf_tables": self.helm_config.golf_tables,
        }
        await self.execute_task(task, context)
        return self.findings
    
    async def audit_migrations(self, migration_dir: str) -> list[Finding]:
        """Audit migration files for safety and quality."""
        task = f"""Audit database migrations in: {migration_dir}

1. **Migration Safety**:
   - Destructive operations without data backup
   - Column type changes that could lose data
   - Missing IF EXISTS / IF NOT EXISTS
   - Transactions on DDL operations
   - Lock-heavy operations on large tables

2. **Migration Order**:
   - Dependencies between migrations
   - Migrations that should be combined
   - Missing DOWN migrations

3. **RLS in Migrations**:
   - Tables created without RLS enabled
   - Policies missing for new tables
   - Policies dropped without replacement

4. **Naming Conventions**:
   - Migration file naming
   - Policy naming consistency
   - Index naming consistency

5. **Helm-Specific**:
   - Golf migrations should scope to team_id
   - Baseball migrations should scope to organization_id
   - All user-facing tables need RLS

Read the migration files and identify issues.
"""
        await self.execute_task(task, {"migration_dir": migration_dir})
        return self.findings
    
    async def generate_security_report(self) -> dict:
        """Generate a comprehensive security report."""
        task = """Generate a comprehensive database security report:

Execute these security checks and compile results:

1. RLS Status: List all tables and their RLS status
2. Policy Audit: List all policies with their conditions
3. Permission Gaps: Tables missing complete CRUD policies
4. High-Risk Findings: Critical security issues
5. Recommendations: Prioritized list of fixes

Output a structured report with:
- Executive summary (for non-technical stakeholders)
- Detailed findings with SQL
- Remediation plan with effort estimates
- Before/after security score

Focus on issues that could lead to:
- Unauthorized data access
- Cross-tenant data leaks
- Privilege escalation
"""
        result = await self.execute_task(task, {})
        return {
            "report": result,
            "findings": [f.to_dict() for f in self.findings],
            "stats": self.get_stats(),
        }


# ============================================
# SQL GENERATION HELPERS
# ============================================

def generate_rls_enable_sql(table: str) -> str:
    """Generate SQL to enable RLS on a table."""
    return f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;"


def generate_select_policy(table: str, condition: str) -> str:
    """Generate a SELECT policy."""
    return f"""
CREATE POLICY "{table}_select_policy" ON public.{table}
FOR SELECT TO authenticated
USING ({condition});
"""


def generate_insert_policy(table: str, condition: str) -> str:
    """Generate an INSERT policy."""
    return f"""
CREATE POLICY "{table}_insert_policy" ON public.{table}
FOR INSERT TO authenticated
WITH CHECK ({condition});
"""


def generate_update_policy(table: str, using_condition: str, check_condition: str) -> str:
    """Generate an UPDATE policy."""
    return f"""
CREATE POLICY "{table}_update_policy" ON public.{table}
FOR UPDATE TO authenticated
USING ({using_condition})
WITH CHECK ({check_condition});
"""


def generate_delete_policy(table: str, condition: str) -> str:
    """Generate a DELETE policy."""
    return f"""
CREATE POLICY "{table}_delete_policy" ON public.{table}
FOR DELETE TO authenticated
USING ({condition});
"""


def generate_index_sql(table: str, columns: list[str], unique: bool = False) -> str:
    """Generate CREATE INDEX SQL."""
    idx_name = f"idx_{table}_{'_'.join(columns)}"
    unique_str = "UNIQUE " if unique else ""
    cols_str = ", ".join(columns)
    return f"CREATE {unique_str}INDEX IF NOT EXISTS {idx_name} ON public.{table} ({cols_str});"


def generate_fk_sql(
    table: str, 
    column: str, 
    ref_table: str, 
    ref_column: str = "id",
    on_delete: str = "CASCADE"
) -> str:
    """Generate ADD FOREIGN KEY SQL."""
    constraint_name = f"fk_{table}_{column}"
    return f"""
ALTER TABLE public.{table}
ADD CONSTRAINT {constraint_name}
FOREIGN KEY ({column}) REFERENCES public.{ref_table}({ref_column})
ON DELETE {on_delete};
"""
