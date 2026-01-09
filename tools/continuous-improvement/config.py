"""
Optimized settings for continuous improvement cycles
"""

# SDK options for different phases
IMPORT_OPTIONS = {
    "max_turns": 20,  # Reduced from 30 - importing is simple
    "temperature": 0.3,  # Low temp for consistent extraction
}

VERIFICATION_OPTIONS = {
    "max_turns": 30,  # Reduced from 50 - verification should be quick
    "temperature": 0.2,  # Very low temp for accurate verification
}

ANALYSIS_OPTIONS = {
    "max_turns": 60,  # Reduced from 100 - prevent context overflow
    "temperature": 0.4,  # Slightly higher for creative issue finding
}

# Context trimming settings
MAX_CONTEXT_CHARS = {
    "understanding_json": 10000,
    "essay": 5000,
    "issues": 3000,
    "actions": 2000,
    "rls_audit": 2000,
}

# Model selection
MODEL = "claude-sonnet-4-20250514"  # Sonnet 4.5 - best balance
