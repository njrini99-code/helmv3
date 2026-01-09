"""
Helm Intelligence - Configuration & Settings
Ultra-powerful multi-agent system for codebase auditing and improvement.
Tailored for Helm Sports Labs (BaseballHelm, GolfHelm, CoachHelm).
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Literal
from enum import Enum
import os

# ============================================
# PATHS & DIRECTORIES
# ============================================

class Paths:
    """Project paths configuration."""
    # Root project path (helmv3)
    PROJECT_ROOT = Path(os.environ.get("HELM_PROJECT_ROOT", "/Users/ricknini/Downloads/helmv3"))
    
    # Source directories
    SRC = PROJECT_ROOT / "src"
    APP = SRC / "app"
    COMPONENTS = SRC / "components"
    LIB = SRC / "lib"
    HOOKS = SRC / "hooks"
    STORES = SRC / "stores"
    
    # Special directories
    SUPABASE = PROJECT_ROOT / "supabase"
    MIGRATIONS = SUPABASE / "migrations"
    E2E_TESTS = PROJECT_ROOT / "e2e"
    DOCS = PROJECT_ROOT / "docs"
    
    # Agent output directories
    AGENT_ROOT = PROJECT_ROOT / ".helm-intelligence"
    ARTIFACTS = AGENT_ROOT / "artifacts"
    CHECKPOINTS = AGENT_ROOT / "checkpoints"
    REPORTS = AGENT_ROOT / "reports"
    MEMORY = AGENT_ROOT / "memory"
    LOGS = AGENT_ROOT / "logs"
    
    @classmethod
    def ensure_directories(cls):
        """Create all necessary directories."""
        for path in [cls.ARTIFACTS, cls.CHECKPOINTS, cls.REPORTS, cls.MEMORY, cls.LOGS]:
            path.mkdir(parents=True, exist_ok=True)


# ============================================
# MODEL CONFIGURATION
# ============================================

class Models:
    """Claude model configuration - MAXIMUM POWER MODE ($30 budget)."""
    # Primary models - Use Sonnet for cost efficiency with full capability
    ORCHESTRATOR = "claude-sonnet-4-20250514"    # $3/$15 per MTok - great for coordination
    SPECIALIST = "claude-sonnet-4-20250514"      # $3/$15 per MTok - deep analysis
    FAST = "claude-3-5-haiku-20241022"           # $0.25/$1.25 - quick lookups only
    
    # MAXIMUM CONTEXT - 200K tokens available!
    MAX_CONTEXT = 200_000
    SAFE_CONTEXT = 180_000       # Leave 20K for output
    SYSTEM_PROMPT_BUDGET = 15_000   # Rich, detailed system prompts
    TOOL_RESULT_BUDGET = 50_000     # Full file contents, no truncation
    MAX_OUTPUT_TOKENS = 16_384      # Maximum output per response
    
    # Token costs per million (for budget tracking)
    COSTS = {
        "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
        "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
        "claude-3-5-haiku-20241022": {"input": 0.25, "output": 1.25},
    }
    
    # Budget configuration
    BUDGET_USD = 30.0
    ESTIMATED_COST_PER_AUDIT = 4.0  # ~$4 per full audit with Sonnet
    MAX_AUDITS_IN_BUDGET = 7        # Conservative estimate
    
    # Token costs per million (for budgeting)
    COSTS = {
        "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
        "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
        "claude-3-5-haiku-20241022": {"input": 0.25, "output": 1.25},
    }


# ============================================
# AGENT ROLES & SPECIALIZATIONS
# ============================================

class AgentRole(Enum):
    """Specialized agent roles in the system."""
    ORCHESTRATOR = "orchestrator"
    CODE_AUDITOR = "code_auditor"
    DATABASE_AUDITOR = "database_auditor"
    UI_UX_AUDITOR = "ui_ux_auditor"
    ENHANCEMENT_AGENT = "enhancement_agent"
    SYNTHESIS_AGENT = "synthesis_agent"
    FIX_AGENT = "fix_agent"


@dataclass
class AgentConfig:
    """Configuration for an individual agent - MAXIMUM POWER."""
    role: AgentRole
    model: str
    system_prompt: str
    tools: list[str] = field(default_factory=list)
    max_turns: int = 100          # More turns for deep exploration
    temperature: float = 0.0      # Deterministic for consistency
    thinking_budget: int = 0      # Disabled - avoids API conflicts
    cache_system_prompt: bool = True  # 90% cost reduction on cache hits
    max_output_tokens: int = 16384    # Maximum output per response


# ============================================
# HELM-SPECIFIC CONFIGURATION
# ============================================

@dataclass
class HelmConfig:
    """Helm Sports Labs specific configuration."""
    # Products
    products: list[str] = field(default_factory=lambda: ["BaseballHelm", "GolfHelm", "CoachHelm"])
    
    # Tech stack
    framework: str = "Next.js 14 App Router"
    language: str = "TypeScript strict"
    database: str = "Supabase (PostgreSQL)"
    styling: str = "Tailwind CSS"
    state: str = "Zustand"
    animation: str = "Framer Motion"
    
    # Design system
    design_system: dict = field(default_factory=lambda: {
        "primary_color": "#16A34A",  # Kelly green
        "background": "#FFFEFA",      # Cream
        "glassmorphism": "bg-white/70 backdrop-blur-xl border-white/20",
        "inspiration": ["Linear", "Stripe", "Vercel"],
    })
    
    # Database tables (critical for auditing)
    baseball_tables: list[str] = field(default_factory=lambda: [
        "users", "coaches", "players", "organizations", "teams",
        "team_members", "watchlists", "videos", "player_metrics",
        "coach_notes", "events", "camps", "messages", "conversations"
    ])
    
    golf_tables: list[str] = field(default_factory=lambda: [
        "golf_players", "golf_rounds", "golf_holes", "golf_shots",
        "golf_events", "golf_courses", "golf_team_settings",
        "golf_qualifying_events", "coach_philosophy", "round_reviews"
    ])
    
    # Pipeline stages (baseball recruiting)
    pipeline_stages: list[str] = field(default_factory=lambda: [
        "watchlist", "high_priority", "offer_extended", "committed", "uninterested"
    ])
    
    # Import rules
    import_rules: dict = field(default_factory=lambda: {
        "types": "@/lib/types",
        "supabase_server": "@/lib/supabase/server",
        "supabase_client": "@/lib/supabase/client",
        "utils": "@/lib/utils",
    })


# ============================================
# AUDIT CONFIGURATION
# ============================================

class Severity(Enum):
    """Issue severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Category(Enum):
    """Issue categories."""
    SECURITY = "security"
    PERFORMANCE = "performance"
    TYPE_SAFETY = "type_safety"
    CODE_QUALITY = "code_quality"
    ACCESSIBILITY = "accessibility"
    UI_CONSISTENCY = "ui_consistency"
    DATABASE = "database"
    ARCHITECTURE = "architecture"
    TESTING = "testing"


@dataclass
class AuditConfig:
    """Configuration for audit runs - MAXIMUM POWER MODE."""
    # What to audit
    audit_code: bool = True
    audit_database: bool = True
    audit_ui: bool = True
    audit_tests: bool = True
    audit_deps: bool = True
    
    # MAXIMUM POWER - Deep analysis with full context
    deep_analysis: bool = True
    include_suggestions: bool = True
    auto_fix_low_risk: bool = False
    
    # Output settings
    output_format: Literal["json", "markdown", "github_issues"] = "json"
    create_report: bool = True
    create_github_issues: bool = False
    
    # MAXIMUM LIMITS - Use full context window
    max_files_per_agent: int = 500        # Analyze more files
    max_issues_per_category: int = 200    # Report more issues
    max_concurrent_agents: int = 4        # Run all agents in parallel
    max_turns_per_agent: int = 100        # Allow deep exploration
    
    # Checkpointing
    checkpoint_interval: int = 10
    resume_from_checkpoint: bool = True
    
    # Budget tracking ($30 budget)
    budget_usd: float = 30.0
    warn_at_percent: float = 0.7  # Warn at 70% budget used
    stop_at_percent: float = 0.95  # Stop at 95% to leave buffer


# ============================================
# WORKFLOW CONFIGURATION  
# ============================================

class WorkflowPhase(Enum):
    """Phases in the EXAMINE → DOCUMENT → FIX workflow."""
    EXAMINE = "examine"
    DOCUMENT = "document"
    FIND_ISSUES = "find_issues"
    VERIFY = "verify"
    FIX = "fix"
    SYNTHESIZE = "synthesize"


@dataclass
class WorkflowConfig:
    """Configuration for the audit workflow."""
    phases: list[WorkflowPhase] = field(default_factory=lambda: list(WorkflowPhase))
    parallel_examination: bool = True
    require_verification: bool = True
    max_fix_attempts: int = 3
    escalate_on_failure: bool = True
    human_approval_for_fixes: bool = True


# ============================================
# DEFAULT CONFIGURATION
# ============================================

def get_default_config():
    """Get default configuration for Helm Intelligence."""
    return {
        "paths": Paths,
        "models": Models,
        "helm": HelmConfig(),
        "audit": AuditConfig(),
        "workflow": WorkflowConfig(),
    }
