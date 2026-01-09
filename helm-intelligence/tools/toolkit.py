"""
Helm Intelligence - Tools
Tools that agents use to interact with the codebase.
"""

import subprocess
import json
import re
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass

from agents.base import Tool, TOOL_REGISTRY
from config.settings import Paths


# ============================================
# FILE SYSTEM TOOLS
# ============================================

def read_file(path: str, max_lines: Optional[int] = None) -> str:
    """Read contents of a file."""
    filepath = Path(path)
    if not filepath.exists():
        return f"Error: File not found: {path}"
    
    try:
        content = filepath.read_text()
        if max_lines:
            lines = content.split('\n')[:max_lines]
            content = '\n'.join(lines)
            if len(content.split('\n')) < len(filepath.read_text().split('\n')):
                content += f"\n... (truncated, showing first {max_lines} lines)"
        return content
    except Exception as e:
        return f"Error reading file: {e}"


def list_directory(path: str, pattern: str = "*") -> list[dict]:
    """List contents of a directory."""
    dirpath = Path(path)
    if not dirpath.exists():
        return [{"error": f"Directory not found: {path}"}]
    
    if not dirpath.is_dir():
        return [{"error": f"Not a directory: {path}"}]
    
    items = []
    for item in dirpath.glob(pattern):
        items.append({
            "name": item.name,
            "path": str(item),
            "type": "directory" if item.is_dir() else "file",
            "size": item.stat().st_size if item.is_file() else None,
        })
    
    return sorted(items, key=lambda x: (x["type"] == "file", x["name"]))


def search_files(
    directory: str, 
    pattern: str, 
    file_pattern: str = "**/*"
) -> list[dict]:
    """Search for pattern in files matching file_pattern."""
    dirpath = Path(directory)
    results = []
    
    try:
        regex = re.compile(pattern)
    except re.error:
        # Treat as literal string if not valid regex
        regex = re.compile(re.escape(pattern))
    
    for filepath in dirpath.glob(file_pattern):
        if filepath.is_file():
            try:
                content = filepath.read_text()
                matches = list(regex.finditer(content))
                if matches:
                    lines = content.split('\n')
                    file_results = []
                    for match in matches[:10]:  # Limit matches per file
                        line_num = content[:match.start()].count('\n') + 1
                        file_results.append({
                            "line": line_num,
                            "content": lines[line_num - 1].strip()[:200],
                            "match": match.group()[:100],
                        })
                    results.append({
                        "file": str(filepath),
                        "matches": file_results,
                        "total_matches": len(matches),
                    })
            except (UnicodeDecodeError, PermissionError):
                continue
    
    return results


def grep_pattern(
    directory: str,
    pattern: str,
    include: str = "*.ts,*.tsx",
    exclude: str = "node_modules,*.min.js,.next"
) -> list[dict]:
    """Search for pattern using grep-like functionality."""
    dirpath = Path(directory)
    results = []
    
    include_patterns = include.split(',')
    exclude_patterns = exclude.split(',')
    
    def should_include(filepath: Path) -> bool:
        # Check excludes
        for exc in exclude_patterns:
            if exc in str(filepath):
                return False
        # Check includes
        for inc in include_patterns:
            if filepath.match(inc):
                return True
        return False
    
    for filepath in dirpath.rglob("*"):
        if filepath.is_file() and should_include(filepath):
            try:
                content = filepath.read_text()
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    if pattern in line:
                        results.append({
                            "file": str(filepath.relative_to(dirpath)),
                            "line": i,
                            "content": line.strip()[:200],
                        })
            except (UnicodeDecodeError, PermissionError):
                continue
    
    return results[:100]  # Limit total results


def write_file(path: str, content: str) -> str:
    """Write content to a file."""
    filepath = Path(path)
    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(content)
        return f"Successfully wrote to {path}"
    except Exception as e:
        return f"Error writing file: {e}"


# ============================================
# CODE ANALYSIS TOOLS
# ============================================

def analyze_imports(filepath: str) -> dict:
    """Analyze imports in a TypeScript/JavaScript file."""
    try:
        content = Path(filepath).read_text()
    except Exception as e:
        return {"error": str(e)}
    
    imports = {
        "types": [],
        "components": [],
        "libraries": [],
        "local": [],
        "issues": [],
    }
    
    # Find import statements
    import_regex = r'import\s+(?:type\s+)?(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+[\'"]([^\'"]+)[\'"]'
    
    for match in re.finditer(import_regex, content):
        path = match.group(1)
        full_import = match.group(0)
        
        if path.startswith('@/lib/types'):
            imports["types"].append(path)
        elif path.startswith('@/components') or path.startswith('../components'):
            imports["components"].append(path)
        elif path.startswith('@/') or path.startswith('./') or path.startswith('../'):
            imports["local"].append(path)
        else:
            imports["libraries"].append(path)
        
        # Check for issues
        if '@/types' in path and '@/lib/types' not in path:
            imports["issues"].append({
                "type": "wrong_type_import",
                "import": full_import,
                "suggestion": "Use @/lib/types instead"
            })
    
    return imports


def check_types(filepath: str) -> dict:
    """Check for type issues in a TypeScript file."""
    try:
        content = Path(filepath).read_text()
    except Exception as e:
        return {"error": str(e)}
    
    issues = []
    lines = content.split('\n')
    
    for i, line in enumerate(lines, 1):
        # Check for 'any' type
        if ': any' in line or '<any>' in line or 'as any' in line:
            issues.append({
                "line": i,
                "type": "any_type",
                "content": line.strip()[:100],
            })
        
        # Check for missing return type on functions
        func_match = re.match(r'\s*(export\s+)?(async\s+)?function\s+\w+\([^)]*\)\s*{', line)
        if func_match and '):' not in line:
            issues.append({
                "line": i,
                "type": "missing_return_type",
                "content": line.strip()[:100],
            })
    
    return {
        "filepath": filepath,
        "issues": issues,
        "issue_count": len(issues),
    }


def analyze_component(filepath: str) -> dict:
    """Analyze a React component file."""
    try:
        content = Path(filepath).read_text()
    except Exception as e:
        return {"error": str(e)}
    
    analysis = {
        "filepath": filepath,
        "is_client_component": "'use client'" in content or '"use client"' in content,
        "is_server_component": "'use client'" not in content and '"use client"' not in content,
        "line_count": len(content.split('\n')),
        "uses_hooks": [],
        "uses_state": "useState" in content,
        "uses_effect": "useEffect" in content,
        "has_loading_state": any(x in content for x in ["isLoading", "loading", "Skeleton", "Spinner"]),
        "has_error_state": any(x in content for x in ["error", "Error", "catch"]),
        "issues": [],
    }
    
    # Check for hooks
    hooks = ["useState", "useEffect", "useCallback", "useMemo", "useRef", "useContext"]
    for hook in hooks:
        if hook in content:
            analysis["uses_hooks"].append(hook)
    
    # Client component without 'use client'
    if analysis["uses_hooks"] and not analysis["is_client_component"]:
        analysis["issues"].append({
            "type": "missing_use_client",
            "message": f"Uses hooks ({analysis['uses_hooks']}) but missing 'use client'"
        })
    
    # Large component
    if analysis["line_count"] > 200:
        analysis["issues"].append({
            "type": "large_component",
            "message": f"Component has {analysis['line_count']} lines, consider splitting"
        })
    
    # Check for inline functions in JSX (performance)
    inline_funcs = re.findall(r'on\w+={(?:\(\)\s*=>|function)', content)
    if len(inline_funcs) > 3:
        analysis["issues"].append({
            "type": "inline_functions",
            "message": f"Found {len(inline_funcs)} inline functions in JSX, consider useCallback"
        })
    
    return analysis


# ============================================
# DATABASE TOOLS
# ============================================

def read_migration(filepath: str) -> dict:
    """Read and parse a SQL migration file."""
    try:
        content = Path(filepath).read_text()
    except Exception as e:
        return {"error": str(e)}
    
    analysis = {
        "filepath": filepath,
        "statements": [],
        "tables_created": [],
        "tables_altered": [],
        "indexes_created": [],
        "policies_created": [],
        "functions_created": [],
        "issues": [],
    }
    
    # Parse CREATE TABLE
    for match in re.finditer(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)', content, re.I):
        analysis["tables_created"].append(match.group(1))
    
    # Parse ALTER TABLE
    for match in re.finditer(r'ALTER TABLE\s+(?:public\.)?(\w+)', content, re.I):
        analysis["tables_altered"].append(match.group(1))
    
    # Parse CREATE INDEX
    for match in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)', content, re.I):
        analysis["indexes_created"].append(match.group(1))
    
    # Parse CREATE POLICY
    for match in re.finditer(r'CREATE POLICY\s+"?([^"\s]+)"?\s+ON\s+(?:public\.)?(\w+)', content, re.I):
        analysis["policies_created"].append({
            "name": match.group(1),
            "table": match.group(2)
        })
    
    # Check for issues
    # Missing IF NOT EXISTS
    if 'CREATE TABLE' in content and 'IF NOT EXISTS' not in content:
        analysis["issues"].append({
            "type": "missing_if_not_exists",
            "message": "CREATE TABLE without IF NOT EXISTS"
        })
    
    # DROP without IF EXISTS
    if 'DROP ' in content and 'IF EXISTS' not in content:
        analysis["issues"].append({
            "type": "missing_if_exists",
            "message": "DROP without IF EXISTS could fail"
        })
    
    # RLS not enabled for new tables
    for table in analysis["tables_created"]:
        if f"ENABLE ROW LEVEL SECURITY" not in content or table not in content:
            # More thorough check
            rls_pattern = rf'ALTER TABLE\s+(?:public\.)?{table}\s+ENABLE ROW LEVEL SECURITY'
            if not re.search(rls_pattern, content, re.I):
                analysis["issues"].append({
                    "type": "rls_not_enabled",
                    "message": f"Table {table} created without RLS enabled",
                    "table": table
                })
    
    return analysis


def list_migrations(directory: str) -> list[dict]:
    """List all migration files in order."""
    dirpath = Path(directory)
    migrations = []
    
    for filepath in sorted(dirpath.glob("*.sql")):
        migrations.append({
            "name": filepath.name,
            "path": str(filepath),
            "size": filepath.stat().st_size,
        })
    
    return migrations


def execute_sql(query: str, database_url: Optional[str] = None) -> dict:
    """
    Execute a SQL query (read-only for safety).
    In production, this would connect to Supabase.
    """
    # Safety check - only allow SELECT queries
    query_upper = query.strip().upper()
    if not query_upper.startswith("SELECT") and not query_upper.startswith("WITH"):
        return {
            "error": "Only SELECT queries are allowed for safety",
            "query": query[:100]
        }
    
    # In production, this would execute against the database
    # For now, return a placeholder
    return {
        "status": "simulated",
        "message": "In production, this would execute the query",
        "query": query[:200]
    }


# ============================================
# BUILD TOOLS
# ============================================

def run_eslint(directory: str, fix: bool = False) -> dict:
    """Run ESLint on a directory."""
    cmd = ["npx", "eslint", directory, "--format", "json"]
    if fix:
        cmd.append("--fix")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=Paths.PROJECT_ROOT,
            timeout=60
        )
        
        try:
            output = json.loads(result.stdout)
        except json.JSONDecodeError:
            output = result.stdout
        
        return {
            "success": result.returncode == 0,
            "output": output,
            "stderr": result.stderr[:500] if result.stderr else None,
        }
    except subprocess.TimeoutExpired:
        return {"error": "ESLint timed out"}
    except Exception as e:
        return {"error": str(e)}


def run_typecheck(directory: str) -> dict:
    """Run TypeScript type checking."""
    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            capture_output=True,
            text=True,
            cwd=directory,
            timeout=120
        )
        
        errors = []
        for line in result.stdout.split('\n'):
            if '.ts' in line or '.tsx' in line:
                errors.append(line)
        
        return {
            "success": result.returncode == 0,
            "error_count": len(errors),
            "errors": errors[:50],  # Limit errors
        }
    except subprocess.TimeoutExpired:
        return {"error": "TypeScript check timed out"}
    except Exception as e:
        return {"error": str(e)}


# ============================================
# ACCESSIBILITY TOOLS
# ============================================

def check_a11y(filepath: str) -> dict:
    """Check accessibility issues in a component."""
    try:
        content = Path(filepath).read_text()
    except Exception as e:
        return {"error": str(e)}
    
    issues = []
    
    # Check for images without alt
    img_tags = re.findall(r'<img[^>]*>', content)
    for img in img_tags:
        if 'alt=' not in img or 'alt=""' in img:
            issues.append({
                "type": "missing_alt",
                "element": "img",
                "content": img[:80]
            })
    
    # Check for Next.js Image without alt
    next_images = re.findall(r'<Image[^>]*>', content)
    for img in next_images:
        if 'alt=' not in img:
            issues.append({
                "type": "missing_alt",
                "element": "Image",
                "content": img[:80]
            })
    
    # Check for buttons without accessible name
    icon_buttons = re.findall(r'<button[^>]*>[\s]*<[^/][^>]*Icon[^>]*/>[\s]*</button>', content)
    for btn in icon_buttons:
        if 'aria-label=' not in btn:
            issues.append({
                "type": "missing_aria_label",
                "element": "button",
                "content": btn[:80]
            })
    
    # Check for inputs without labels
    inputs = re.findall(r'<input[^>]*>', content)
    for inp in inputs:
        if 'aria-label=' not in inp and 'id=' not in inp:
            issues.append({
                "type": "missing_label",
                "element": "input",
                "content": inp[:80]
            })
    
    return {
        "filepath": filepath,
        "issues": issues,
        "issue_count": len(issues),
    }


# ============================================
# ARTIFACT TOOLS
# ============================================

def read_artifact(ref: str) -> Any:
    """Read an artifact by reference."""
    from agents.base import ARTIFACT_STORE
    try:
        return ARTIFACT_STORE.retrieve(ref)
    except Exception as e:
        return {"error": str(e)}


def list_artifacts(agent_id: Optional[str] = None) -> list[dict]:
    """List available artifacts."""
    from agents.base import ARTIFACT_STORE
    return ARTIFACT_STORE.list_artifacts(agent_id)


def write_report(content: str, filename: str) -> str:
    """Write a report to the reports directory."""
    filepath = Paths.REPORTS / filename
    try:
        filepath.write_text(content)
        return f"Report written to {filepath}"
    except Exception as e:
        return f"Error writing report: {e}"


# ============================================
# REGISTER ALL TOOLS
# ============================================

def register_all_tools():
    """Register all tools with the global registry."""
    
    # File system tools
    TOOL_REGISTRY.register(Tool(
        name="read_file",
        description="Read the contents of a file. Provide the full path.",
        input_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Full path to the file"},
                "max_lines": {"type": "integer", "description": "Maximum lines to read (optional)"}
            },
            "required": ["path"]
        },
        handler=read_file
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="list_directory",
        description="List contents of a directory.",
        input_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to directory"},
                "pattern": {"type": "string", "description": "Glob pattern (default: *)"}
            },
            "required": ["path"]
        },
        handler=list_directory
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="search_files",
        description="Search for a pattern across files in a directory.",
        input_schema={
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Directory to search"},
                "pattern": {"type": "string", "description": "Regex pattern to search for"},
                "file_pattern": {"type": "string", "description": "Glob pattern for files (default: **/*.ts)"}
            },
            "required": ["directory", "pattern"]
        },
        handler=search_files
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="grep_pattern",
        description="Search for a literal pattern in files (like grep).",
        input_schema={
            "type": "object",
            "properties": {
                "directory": {"type": "string"},
                "pattern": {"type": "string"},
                "include": {"type": "string", "description": "File patterns to include (comma-separated)"},
                "exclude": {"type": "string", "description": "Patterns to exclude (comma-separated)"}
            },
            "required": ["directory", "pattern"]
        },
        handler=grep_pattern
    ))
    
    # Code analysis tools
    TOOL_REGISTRY.register(Tool(
        name="analyze_imports",
        description="Analyze import statements in a TypeScript file.",
        input_schema={
            "type": "object",
            "properties": {
                "filepath": {"type": "string"}
            },
            "required": ["filepath"]
        },
        handler=analyze_imports
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="check_types",
        description="Check for type issues in a TypeScript file.",
        input_schema={
            "type": "object",
            "properties": {
                "filepath": {"type": "string"}
            },
            "required": ["filepath"]
        },
        handler=check_types
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="analyze_component",
        description="Analyze a React component for issues and patterns.",
        input_schema={
            "type": "object",
            "properties": {
                "filepath": {"type": "string"}
            },
            "required": ["filepath"]
        },
        handler=analyze_component
    ))
    
    # Database tools
    TOOL_REGISTRY.register(Tool(
        name="read_migration",
        description="Read and parse a SQL migration file.",
        input_schema={
            "type": "object",
            "properties": {
                "filepath": {"type": "string"}
            },
            "required": ["filepath"]
        },
        handler=read_migration
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="list_migrations",
        description="List all migration files in a directory.",
        input_schema={
            "type": "object",
            "properties": {
                "directory": {"type": "string"}
            },
            "required": ["directory"]
        },
        handler=list_migrations
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="execute_sql",
        description="Execute a read-only SQL query (SELECT only).",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
            "required": ["query"]
        },
        handler=execute_sql
    ))
    
    # Build tools
    TOOL_REGISTRY.register(Tool(
        name="run_eslint",
        description="Run ESLint on a directory.",
        input_schema={
            "type": "object",
            "properties": {
                "directory": {"type": "string"},
                "fix": {"type": "boolean", "description": "Auto-fix issues"}
            },
            "required": ["directory"]
        },
        handler=run_eslint
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="run_typecheck",
        description="Run TypeScript type checking.",
        input_schema={
            "type": "object",
            "properties": {
                "directory": {"type": "string"}
            },
            "required": ["directory"]
        },
        handler=run_typecheck
    ))
    
    # Accessibility tools
    TOOL_REGISTRY.register(Tool(
        name="check_a11y",
        description="Check accessibility issues in a component file.",
        input_schema={
            "type": "object",
            "properties": {
                "filepath": {"type": "string"}
            },
            "required": ["filepath"]
        },
        handler=check_a11y
    ))
    
    # Artifact tools
    TOOL_REGISTRY.register(Tool(
        name="read_artifact",
        description="Read an artifact by its reference.",
        input_schema={
            "type": "object",
            "properties": {
                "ref": {"type": "string"}
            },
            "required": ["ref"]
        },
        handler=read_artifact
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="list_artifacts",
        description="List available artifacts.",
        input_schema={
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "Filter by agent ID (optional)"}
            }
        },
        handler=list_artifacts
    ))
    
    TOOL_REGISTRY.register(Tool(
        name="write_report",
        description="Write a report to the reports directory.",
        input_schema={
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "filename": {"type": "string"}
            },
            "required": ["content", "filename"]
        },
        handler=write_report
    ))


# Auto-register on import
register_all_tools()
