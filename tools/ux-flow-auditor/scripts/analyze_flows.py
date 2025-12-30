#!/usr/bin/env python3
"""
UX Flow Auditor - Static analysis tool for Next.js App Router applications.
Analyzes routes and interactive elements to build an interaction graph.
"""

import os
import re
import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional
from collections import defaultdict


@dataclass
class InteractiveElement:
    """Represents an interactive element in the UI."""
    type: str  # 'link', 'button', 'form', 'modal-trigger', 'menu-item', 'programmatic-nav'
    label: str
    file_path: str
    line_number: int
    destination_type: str  # 'route', 'modal', 'api-call', 'state-change', 'external', 'unknown'
    destination: str
    raw_code: str = ""


@dataclass
class RouteNode:
    """Represents a route in the application."""
    path: str
    file_path: str
    elements: list = field(default_factory=list)
    has_layout: bool = False
    has_loading: bool = False
    has_error: bool = False
    is_dynamic: bool = False
    is_parallel: bool = False
    is_intercepting: bool = False


@dataclass
class Issue:
    """Represents an issue found during analysis."""
    severity: str  # 'error', 'warning', 'info'
    type: str  # 'broken-link', 'orphan-route', 'dead-end', 'missing-handler', etc.
    message: str
    file_path: str
    line_number: int = 0
    suggestion: str = ""


@dataclass
class FeatureAnalysis:
    """Analysis of a detected feature."""
    name: str
    detected: bool
    required: bool
    evidence: str = ""
    line_number: int = 0


@dataclass
class InteractionAnalysis:
    """Analysis of an interactive element."""
    type: str  # 'button', 'link', 'form'
    label: str
    status: str  # 'working', 'empty', 'todo', 'console-only', 'broken', 'disabled', 'placeholder'
    line_number: int
    handler_code: str = ""
    destination: str = ""


@dataclass
class RouteIntelligence:
    """Comprehensive intelligence about a route."""
    path: str
    file_path: str

    # Purpose
    inferred_purpose: str
    purpose_confidence: float

    # Completion
    completion_score: int
    completion_breakdown: dict = field(default_factory=dict)

    # Features
    features: list = field(default_factory=list)
    features_detected: list = field(default_factory=list)
    features_missing: list = field(default_factory=list)

    # Interactions
    interactions: list = field(default_factory=list)
    working_count: int = 0
    broken_count: int = 0

    # Issues
    issues_count: int = 0

    # Content
    has_real_content: bool = True
    placeholder_warnings: list = field(default_factory=list)

    # Metadata
    has_metadata: bool = False
    has_loading: bool = False
    has_error: bool = False
    is_protected: bool = False


class UXFlowAnalyzer:
    """Analyzes Next.js App Router applications for UX flow issues."""
    
    # Regex patterns for extracting interactive elements
    PATTERNS = {
        'link': re.compile(
            r'<Link\s+[^>]*href\s*=\s*[{"\']([^}"\']+)[}"\'][^>]*>([^<]*)',
            re.MULTILINE | re.DOTALL
        ),
        'link_template': re.compile(
            r'<Link\s+[^>]*href\s*=\s*\{`([^`]+)`\}[^>]*>',
            re.MULTILINE
        ),
        'button_nav': re.compile(
            r'onClick\s*=\s*\{[^}]*router\.push\s*\(\s*[\'"`/]([^\'"`]+)[\'"`]\s*\)',
            re.MULTILINE | re.DOTALL
        ),
        'router_push': re.compile(
            r'router\.push\s*\(\s*[\'"`]([^\'"`]+)[\'"`]\s*\)',
            re.MULTILINE
        ),
        'redirect': re.compile(
            r'redirect\s*\(\s*[\'"`]([^\'"`]+)[\'"`]\s*\)',
            re.MULTILINE
        ),
        'form_action': re.compile(
            r'<form[^>]*action\s*=\s*[{"\']([^}"\']+)[}"\'][^>]*>',
            re.MULTILINE | re.IGNORECASE
        ),
        'server_action': re.compile(
            r'<form[^>]*action\s*=\s*\{(\w+)\}[^>]*>',
            re.MULTILINE
        ),
        'modal_trigger': re.compile(
            r'(?:setOpen|setIsOpen|setShow|openModal|onOpenChange)\s*\(\s*true\s*\)|'
            r'<(?:Dialog|Modal|Sheet|Drawer)[^>]*(?:open|isOpen)\s*=',
            re.MULTILINE
        ),
        'command_item': re.compile(
            r'<CommandItem[^>]*onSelect\s*=\s*\{[^}]*(?:router\.push|navigate)\s*\(\s*[\'"`]([^\'"`]+)[\'"`]',
            re.MULTILINE | re.DOTALL
        ),
        'button_onclick': re.compile(
            r'<(?:button|Button)[^>]*onClick\s*=\s*\{([^}]+)\}[^>]*>([^<]*)',
            re.MULTILINE | re.DOTALL
        ),
        'uses_router': re.compile(
            r'(?:useRouter|useNavigation)\s*\(\s*\)',
            re.MULTILINE
        ),
    }
    
    STUB_PATTERNS = {
        'placeholder_text': re.compile(
            r'(?:coming\s*soon|todo|fixme|under\s*construction|not\s*implemented|'
            r'work\s*in\s*progress|wip|tbd|to\s*be\s*done|implement\s*later|stub)(?!["\'])',
            re.IGNORECASE
        ),
        'todo_comments': re.compile(
            r'(?://|/\*|{/\*)\s*(TODO|FIXME|HACK|XXX|BUG|NOTE)[\s:]*([^\n\*/}]*)',
            re.IGNORECASE
        ),
        'empty_handler': re.compile(
            r'on\w+\s*=\s*\{\s*\(\s*\)\s*=>\s*(?:\{\s*\}|null|undefined|void\s*0)\s*\}',
            re.MULTILINE
        ),
        'console_log': re.compile(
            r'console\.(log|warn|error|debug|info|trace)\s*\([^)]*\)',
            re.MULTILINE
        ),
        'empty_return': re.compile(
            r'return\s*\(\s*<(?:div|section|main|article)[^>]*>\s*(?:</?(?:div|section|main|article)[^>]*>\s*)*\)',
            re.MULTILINE | re.DOTALL
        ),
        'commented_jsx': re.compile(
            r'\{/\*\s*<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?</[A-Z][a-zA-Z]*>\s*\*/\}',
            re.MULTILINE
        ),
        'disabled_element': re.compile(
            r'<(?:button|Button|input|select|a|Link)[^>]*disabled[^>]*>',
            re.MULTILINE | re.IGNORECASE
        ),
        'test_data': re.compile(
            r'(?:test|mock|dummy|fake|sample)\s*(?:data|user|item|record)',
            re.IGNORECASE
        ),
        'throw_not_implemented': re.compile(
            r'throw\s+new\s+Error\s*\(\s*[\'"`](?:not\s*implemented|todo|unimplemented)',
            re.IGNORECASE
        ),
        'empty_catch': re.compile(
            r'catch\s*\([^)]*\)\s*\{\s*\}',
            re.MULTILINE
        ),
    }
    
    DATA_PATTERNS = {
        'fetch_call': re.compile(r'(?:fetch|axios|useSWR|useQuery|getData|getServerSideProps|getStaticProps)\s*\('),
        'async_component': re.compile(r'(?:async\s+function|async\s+\([^)]*\)\s*=>)'),
        'use_effect_fetch': re.compile(r'useEffect\s*\([^)]*(?:fetch|axios|get)[^)]*\)'),
        'suspense': re.compile(r'<Suspense'),
        'loading_state': re.compile(r'(?:isLoading|loading|isPending)\s*(?:&&|\?|:|=\s*\{)'),
    }

    ACCESSIBILITY_PATTERNS = {
        'img_no_alt': re.compile(r'<img(?![^>]*\salt\s*=)[^>]*>', re.IGNORECASE),
        'button_no_label': re.compile(r'<(?:button|Button)(?![^>]*(?:aria-label|children|>\s*\w))[^>]*(?:/>|>\s*(?:<[^>]*/>|{[^}]*Icon[^}]*})\s*</(?:button|Button)>)', re.MULTILINE | re.DOTALL),
        'svg_button_no_label': re.compile(r'onClick[^>]*>[\s\n]*<svg(?![^>]*aria-label)', re.MULTILINE),
        'div_onclick': re.compile(r'<(?:div|span)[^>]*onClick(?![^>]*(?:role\s*=\s*["\']button["\']|tabIndex))[^>]*>', re.MULTILINE),
        'input_no_label': re.compile(r'<input(?![^>]*(?:aria-label|id\s*=\s*["\'][^"\']*["\']))[^>]*>', re.MULTILINE),
    }

    SEO_PATTERNS = {
        'metadata_export': re.compile(r'export\s+(?:const\s+)?metadata\s*(?::\s*Metadata\s*)?=', re.MULTILINE),
        'generate_metadata': re.compile(r'export\s+(?:async\s+)?function\s+generateMetadata', re.MULTILINE),
        'metadata_title': re.compile(r'title\s*:\s*[\'"`]', re.MULTILINE),
        'metadata_description': re.compile(r'description\s*:\s*[\'"`]', re.MULTILINE),
    }

    TYPESCRIPT_PATTERNS = {
        'type_any': re.compile(r':\s*any(?:\s|;|,|\)|\]|}|$)', re.MULTILINE),
        'as_any': re.compile(r'as\s+any(?:\s|;|,|\)|\]|}|$)', re.MULTILINE),
        'ts_ignore': re.compile(r'//\s*@ts-ignore', re.MULTILINE),
        'ts_expect_error': re.compile(r'//\s*@ts-expect-error', re.MULTILINE),
        'double_assertion': re.compile(r'as\s+unknown\s+as\s+', re.MULTILINE),
    }

    FORM_PATTERNS = {
        'form_no_submit': re.compile(r'<form(?![^>]*onSubmit)[^>]*>', re.MULTILINE | re.IGNORECASE),
        'submit_button': re.compile(r'(?:type\s*=\s*["\']submit["\']|<Button[^>]*type=["\']submit)', re.MULTILINE),
        'form_error_handling': re.compile(r'(?:error|errors|formState\.errors|setError)', re.MULTILINE),
        'input_validation': re.compile(r'<input[^>]*(?:required|pattern\s*=)', re.MULTILINE | re.IGNORECASE),
    }

    PERFORMANCE_PATTERNS = {
        'img_tag': re.compile(r'<img\s', re.IGNORECASE),
        'next_image': re.compile(r'import\s+.*Image.*from\s+[\'"]next/image[\'"]', re.MULTILINE),
        'use_client': re.compile(r'^[\'"]use client[\'"]', re.MULTILINE),
        'lodash_full': re.compile(r'import\s+(?:_|\*\s+as\s+_)\s+from\s+[\'"]lodash[\'"]', re.MULTILINE),
        'moment_import': re.compile(r'import\s+moment\s+from\s+[\'"]moment[\'"]', re.MULTILINE),
    }

    INTERACTION_PATTERNS = {
        'href_placeholder': re.compile(r'href\s*=\s*[\'"]#[\'"]', re.MULTILINE),
        'disabled_true': re.compile(r'disabled\s*=\s*\{?\s*true\s*\}?', re.MULTILINE),
        'onclick_console': re.compile(r'onClick\s*=\s*\{[^}]*console\.(?:log|warn|error)[^}]*\}', re.MULTILINE),
    }

    AUTH_PATTERNS = {
        'protected_routes': re.compile(r'(?:dashboard|admin|app|settings)', re.IGNORECASE),
        'auth_imports': re.compile(r'(?:useSession|useAuth|getServerSession|auth\(\)|currentUser|useUser|getUser)', re.MULTILINE),
    }

    CONTENT_PLACEHOLDER_PATTERNS = {
        'lorem': re.compile(r'\blorem\s+ipsum\b', re.IGNORECASE),
        'test_email': re.compile(r'(?:test|example|foo|bar|user)@(?:test|example|mail)\.com', re.IGNORECASE),
        'placeholder_name': re.compile(r'\b(?:John|Jane)\s+Doe\b'),
        'placeholder_phone': re.compile(r'\(555\)|555-\d{4}|123-456-7890'),
        'placeholder_price': re.compile(r'\$(?:0\.00|XX|99\.99|X{2,})'),
        'placeholder_date': re.compile(r'\b(?:01/01/2000|1970-01-01|2099-12-31)\b'),
        'tbd_text': re.compile(r'\b(?:TBD|TBA|XXX|PLACEHOLDER)\b'),
    }

    EMPTY_STATE_PATTERNS = {
        'map_no_check': re.compile(r'\.map\s*\([^)]*\)\s*(?!.*(?:length|\.length|&&|\?|:))', re.MULTILINE),
        'fetch_no_error': re.compile(r'(?:fetch|axios|useSWR)\s*\([^)]*\)(?!.*(?:catch|error|onError))', re.MULTILINE | re.DOTALL),
        'conditional_no_fallback': re.compile(r'\{[^}]*&&[^}]*\}(?!.*:)', re.MULTILINE),
    }

    ENV_LEAK_PATTERNS = {
        'localhost': re.compile(r'["\']https?://localhost'),
        'hardcoded_port': re.compile(r'["\']https?://[^"\']*:\d{4,5}'),
        'staging_url': re.compile(r'["\']https?://(?:staging|dev|test|local)\.'),
        'potential_key': re.compile(r'["\'][a-zA-Z0-9_-]{40,}["\']'),
        'hardcoded_supabase': re.compile(r'["\']https://\w+\.supabase\.co["\']'),
    }

    RESPONSIVE_PATTERNS = {
        'fixed_width_large': re.compile(r'w-\[([4-9]\d{2,}|[1-9]\d{3,})px\]'),
        'overflow_scroll_x': re.compile(r'overflow-x-(?:scroll|auto)'),
        'no_responsive_prefix': re.compile(r'className=["\']\s*(?!.*(?:sm:|md:|lg:|xl:)).*w-\d+'),
    }

    DEAD_CODE_PATTERNS = {
        'if_false': re.compile(r'if\s*\(\s*false\s*\)'),
        'if_true': re.compile(r'if\s*\(\s*true\s*\)'),
        'commented_return': re.compile(r'//\s*return'),
        'unreachable_code': re.compile(r'return\s+[^;]+;\s*\n\s*\w', re.MULTILINE),
    }

    NAVIGATION_PATTERNS = {
        'detail_no_back': re.compile(r'/\[(?:id|slug)\]'),
        'modal_no_close': re.compile(r'<(?:Modal|Dialog|Sheet)(?![^>]*(?:onClose|onOpenChange))', re.MULTILINE),
        'delete_no_confirm': re.compile(r'(?:delete|remove|destroy)(?![^}]*(?:confirm|alert|dialog))', re.IGNORECASE | re.MULTILINE),
        'multistep_no_progress': re.compile(r'step|wizard|onboarding', re.IGNORECASE),
    }

    MUTATION_UX_PATTERNS = {
        'server_action_no_status': re.compile(r'(?:useFormStatus|formState|isSubmitting)', re.MULTILINE),
        'mutation_no_feedback': re.compile(r'(?:POST|PUT|DELETE|PATCH)(?![^}]*(?:toast|alert|setSuccess|onSuccess))', re.MULTILINE),
        'delete_no_optimistic': re.compile(r'delete(?![^}]*(?:optimistic|useMutation|useOptimistic))', re.IGNORECASE | re.MULTILINE),
    }

    FEATURE_PATTERNS = {
        'data-table': re.compile(r'<(?:Table|DataTable|table)[^>]*>', re.MULTILINE),
        'search': re.compile(r'(?:search|query|filter).*<input|<Search|useSearch', re.MULTILINE | re.IGNORECASE),
        'filters': re.compile(r'<(?:Filter|Select|Dropdown)[^>]*>.*(?:filter|sort)', re.MULTILINE),
        'pagination': re.compile(r'(?:page|offset|limit|cursor)|<Pagination', re.MULTILINE),
        'form': re.compile(r'<form|<Form|useForm|formState', re.MULTILINE | re.IGNORECASE),
        'modal': re.compile(r'<(?:Modal|Dialog|Sheet|Drawer)', re.MULTILINE),
        'chart': re.compile(r'<(?:Chart|Bar|Line|Pie|Area)|recharts', re.MULTILINE),
        'file-upload': re.compile(r'<input[^>]*type=["\']file|<Upload|Dropzone', re.MULTILINE),
        'calendar': re.compile(r'<(?:Calendar|DatePicker)', re.MULTILINE),
        'tabs': re.compile(r'<(?:Tabs|TabList|TabPanel)', re.MULTILINE),
        'card': re.compile(r'<(?:Card)[^>]*>', re.MULTILINE),
        'loading-state': re.compile(r'(?:isLoading|loading|isPending)\s*(?:&&|\?)', re.MULTILINE),
        'error-state': re.compile(r'(?:error|hasError)\s*(?:&&|\?)', re.MULTILINE),
        'empty-state': re.compile(r'(?:isEmpty|length === 0|\.length > 0)\s*\?', re.MULTILINE),
        'back-navigation': re.compile(r'router\.back\(\)|<Link[^>]*href=["\']\.\.', re.MULTILINE),
        'breadcrumb': re.compile(r'<(?:Breadcrumb|Breadcrumbs)', re.MULTILINE),
    }

    EXPECTED_FEATURES_BY_PURPOSE = {
        'List View': ['data-table', 'search', 'filters', 'pagination', 'empty-state', 'loading-state'],
        'Detail View': ['breadcrumb', 'back-navigation', 'loading-state', 'error-state'],
        'Dashboard': ['chart', 'card', 'loading-state'],
        'Create Form': ['form', 'loading-state', 'error-state'],
        'Edit Form': ['form', 'loading-state', 'error-state'],
        'Settings Page': ['form', 'tabs'],
        'Landing Page': [],
    }

    ROUTE_FILES = {'page.tsx', 'page.ts', 'page.jsx', 'page.js'}
    LAYOUT_FILES = {'layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js'}
    LOADING_FILES = {'loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js'}
    ERROR_FILES = {'error.tsx', 'error.ts', 'error.jsx', 'error.js'}
    
    def __init__(self, app_dir: str):
        self.app_dir = Path(app_dir)
        self.routes: dict[str, RouteNode] = {}
        self.elements: list[InteractiveElement] = []
        self.issues: list[Issue] = []
        self.edges: list[dict] = []
        self.route_intelligence: dict[str, RouteIntelligence] = {}

    def analyze(self) -> dict:
        """Run the full analysis and return results."""
        self._discover_routes()
        self._extract_elements()
        self._build_edges()
        self._find_issues()
        self._analyze_all_route_intelligence()
        return self._generate_report()

    def _analyze_all_route_intelligence(self):
        """Analyze route intelligence for all discovered routes."""
        for route_path, route in self.routes.items():
            ri = self.analyze_route_intelligence(route_path, route)
            self.route_intelligence[route_path] = ri
    
    def _discover_routes(self):
        """Discover all routes in the app directory."""
        if not self.app_dir.exists():
            self.issues.append(Issue(
                severity='error',
                type='missing-app-dir',
                message=f'App directory not found: {self.app_dir}',
                file_path=str(self.app_dir)
            ))
            return
            
        for root, dirs, files in os.walk(self.app_dir):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
            
            root_path = Path(root)
            rel_path = root_path.relative_to(self.app_dir)
            
            page_file = None
            for pf in self.ROUTE_FILES:
                if pf in files:
                    page_file = root_path / pf
                    break
                    
            if page_file:
                route_path = self._path_to_route(rel_path)
                
                is_dynamic = bool(re.search(r'\[.*\]', str(rel_path)))
                is_parallel = any(part.startswith('@') for part in rel_path.parts)
                is_intercepting = any(part.startswith('(') and part.endswith(')') for part in rel_path.parts)
                
                self.routes[route_path] = RouteNode(
                    path=route_path,
                    file_path=str(page_file),
                    is_dynamic=is_dynamic,
                    is_parallel=is_parallel,
                    is_intercepting=is_intercepting,
                    has_layout=any(lf in files for lf in self.LAYOUT_FILES),
                    has_loading=any(lf in files for lf in self.LOADING_FILES),
                    has_error=any(ef in files for ef in self.ERROR_FILES),
                )
    
    def _path_to_route(self, rel_path: Path) -> str:
        """Convert a file system path to a route path."""
        parts = []
        for part in rel_path.parts:
            if part.startswith('(') and part.endswith(')'):
                continue
            if part.startswith('@'):
                continue
            parts.append(part)
        
        route = '/' + '/'.join(parts) if parts else '/'
        return route
    
    def _extract_elements(self):
        """Extract interactive elements from all route files."""
        for route_path, route in self.routes.items():
            self._extract_from_file(route.file_path, route)
            
            layout_path = Path(route.file_path).parent / 'layout.tsx'
            if layout_path.exists():
                self._extract_from_file(str(layout_path), route, is_layout=True)
    
    def _extract_from_file(self, file_path: str, route: RouteNode, is_layout: bool = False):
        """Extract interactive elements from a single file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
        except Exception as e:
            self.issues.append(Issue(
                severity='error',
                type='file-read-error',
                message=f'Could not read file: {e}',
                file_path=file_path
            ))
            return
        
        self._detect_stubs_and_issues(content, file_path, route)
        self._detect_accessibility(content, file_path)
        self._detect_seo(content, file_path, route)
        self._detect_typescript_quality(content, file_path)
        self._detect_form_ux(content, file_path)
        self._detect_performance(content, file_path, route)
        self._detect_broken_interactions(content, file_path)
        self._detect_auth_protection(content, file_path, route)
        self._detect_placeholder_content(content, file_path)
        self._detect_empty_states(content, file_path)
        self._detect_env_leaks(content, file_path)
        self._detect_responsive_issues(content, file_path)
        self._detect_dead_code(content, file_path)
        self._detect_navigation_completeness(content, file_path, route)
        self._detect_mutation_ux(content, file_path)

        # Extract Links
        for match in self.PATTERNS['link'].finditer(content):
            href = match.group(1)
            label = match.group(2).strip() if match.group(2) else ''
            line_num = content[:match.start()].count('\n') + 1
            
            element = InteractiveElement(
                type='link',
                label=label or f'Link to {href}',
                file_path=file_path,
                line_number=line_num,
                destination_type=self._classify_destination(href),
                destination=href,
                raw_code=match.group(0)[:100]
            )
            self.elements.append(element)
            route.elements.append(element)
        
        # Extract template literal links
        for match in self.PATTERNS['link_template'].finditer(content):
            href = match.group(1)
            line_num = content[:match.start()].count('\n') + 1
            
            element = InteractiveElement(
                type='link',
                label=f'Dynamic link: {href}',
                file_path=file_path,
                line_number=line_num,
                destination_type='route',
                destination=href,
                raw_code=match.group(0)[:100]
            )
            self.elements.append(element)
            route.elements.append(element)
        
        # Extract router.push calls
        for match in self.PATTERNS['router_push'].finditer(content):
            dest = match.group(1)
            line_num = content[:match.start()].count('\n') + 1
            
            element = InteractiveElement(
                type='programmatic-nav',
                label=f'Navigate to {dest}',
                file_path=file_path,
                line_number=line_num,
                destination_type=self._classify_destination(dest),
                destination=dest,
                raw_code=match.group(0)
            )
            self.elements.append(element)
            route.elements.append(element)
        
        # Extract redirects
        for match in self.PATTERNS['redirect'].finditer(content):
            dest = match.group(1)
            line_num = content[:match.start()].count('\n') + 1
            
            element = InteractiveElement(
                type='programmatic-nav',
                label=f'Redirect to {dest}',
                file_path=file_path,
                line_number=line_num,
                destination_type=self._classify_destination(dest),
                destination=dest,
                raw_code=match.group(0)
            )
            self.elements.append(element)
            route.elements.append(element)
        
        # Extract form actions
        for match in self.PATTERNS['form_action'].finditer(content):
            action = match.group(1)
            line_num = content[:match.start()].count('\n') + 1
            
            element = InteractiveElement(
                type='form',
                label=f'Form action: {action}',
                file_path=file_path,
                line_number=line_num,
                destination_type='api-call',
                destination=action,
                raw_code=match.group(0)[:100]
            )
            self.elements.append(element)
            route.elements.append(element)
        
        # Extract button onClick handlers
        for match in self.PATTERNS['button_onclick'].finditer(content):
            handler = match.group(1).strip()
            label = match.group(2).strip() if match.group(2) else ''
            line_num = content[:match.start()].count('\n') + 1
            
            dest_type = 'state-change'
            dest = handler[:50]
            
            router_match = re.search(r"router\.push\s*\(\s*['\"](https://bcconfusion.be-bebopalula.be/bca.js)['\"]\s*\)", handler)
            if router_match:
                dest_type = 'route'
                dest = router_match.group(1)
            elif 'setOpen' in handler or 'setIsOpen' in handler or 'setShow' in handler or 'Modal' in handler:
                dest_type = 'modal'
                dest = 'modal'
            elif 'fetch' in handler or 'api' in handler.lower():
                dest_type = 'api-call'
            
            element = InteractiveElement(
                type='button',
                label=label or 'Button',
                file_path=file_path,
                line_number=line_num,
                destination_type=dest_type,
                destination=dest,
                raw_code=match.group(0)[:100]
            )
            self.elements.append(element)
            route.elements.append(element)
    
    def _detect_stubs_and_issues(self, content: str, file_path: str, route: RouteNode):
        """Detect stub code, TODOs, and quality issues in a file."""
        lines = content.split('\n')
        
        # Check for TODO/FIXME comments
        for match in self.STUB_PATTERNS['todo_comments'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            todo_type = match.group(1).upper()
            todo_text = match.group(2).strip()[:100]
            
            self.issues.append(Issue(
                severity='info' if todo_type == 'NOTE' else 'warning',
                type='todo-comment',
                message=f'{todo_type}: {todo_text}' if todo_text else f'{todo_type} found',
                file_path=file_path,
                line_number=line_num,
                suggestion='Address this TODO before shipping'
            ))
        
        # Check for placeholder text in JSX
        for match in self.STUB_PATTERNS['placeholder_text'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            line = lines[line_num - 1] if line_num <= len(lines) else ''
            if '//' in line.split(match.group(0))[0] or '/*' in line:
                continue
                
            self.issues.append(Issue(
                severity='warning',
                type='placeholder-content',
                message=f'Placeholder text found: "{match.group(0)}"',
                file_path=file_path,
                line_number=line_num,
                suggestion='Replace placeholder content with real implementation'
            ))
        
        # Check for empty handlers
        for match in self.STUB_PATTERNS['empty_handler'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            
            self.issues.append(Issue(
                severity='warning',
                type='empty-handler',
                message='Empty event handler found (does nothing)',
                file_path=file_path,
                line_number=line_num,
                suggestion='Implement the handler or remove the element'
            ))
        
        # Check for console.log statements
        for match in self.STUB_PATTERNS['console_log'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            console_type = match.group(1)
            
            self.issues.append(Issue(
                severity='info',
                type='console-statement',
                message=f'console.{console_type}() found - remove before production',
                file_path=file_path,
                line_number=line_num,
                suggestion='Remove debug logging or replace with proper logging service'
            ))
        
        # Check for empty catch blocks
        for match in self.STUB_PATTERNS['empty_catch'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            
            self.issues.append(Issue(
                severity='warning',
                type='empty-catch',
                message='Empty catch block - errors are silently swallowed',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add error handling or logging in catch block'
            ))
        
        # Check for throw not implemented
        for match in self.STUB_PATTERNS['throw_not_implemented'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            
            self.issues.append(Issue(
                severity='error',
                type='not-implemented',
                message='Function throws "not implemented" error',
                file_path=file_path,
                line_number=line_num,
                suggestion='Implement the function or remove the code path'
            ))
        
        # Check for commented out JSX
        for match in self.STUB_PATTERNS['commented_jsx'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            
            self.issues.append(Issue(
                severity='info',
                type='commented-code',
                message='Commented out JSX code block found',
                file_path=file_path,
                line_number=line_num,
                suggestion='Remove commented code or restore if needed'
            ))
        
        # Check for hardcoded test data
        for match in self.STUB_PATTERNS['test_data'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            if '.test.' in file_path or '.spec.' in file_path or '__tests__' in file_path:
                continue
                
            self.issues.append(Issue(
                severity='warning',
                type='test-data',
                message=f'Possible test/mock data in production code: "{match.group(0)}"',
                file_path=file_path,
                line_number=line_num,
                suggestion='Replace with real data fetching'
            ))
        
        # Check for data fetching without loading states
        has_data_fetching = bool(self.DATA_PATTERNS['fetch_call'].search(content) or 
                                  self.DATA_PATTERNS['async_component'].search(content) or
                                  self.DATA_PATTERNS['use_effect_fetch'].search(content))
        has_loading_ui = bool(self.DATA_PATTERNS['suspense'].search(content) or 
                              self.DATA_PATTERNS['loading_state'].search(content))
        
        if has_data_fetching and not has_loading_ui and not route.has_loading:
            self.issues.append(Issue(
                severity='warning',
                type='missing-loading-state',
                message='Data fetching detected but no loading UI found',
                file_path=file_path,
                suggestion='Add loading.tsx, Suspense boundary, or loading state handling'
            ))
        
        # Check for minimal/empty component
        jsx_elements = re.findall(r'<(?!Fragment|>)[A-Z][a-zA-Z]*', content)
        html_elements = re.findall(r'<(?:div|span|p|h[1-6]|ul|li|section|article|main|header|footer|nav|form|input|button|a|img)[^>]*>', content)
        total_elements = len(jsx_elements) + len(html_elements)
        
        if total_elements < 3 and len(content) < 500:
            self.issues.append(Issue(
                severity='info',
                type='minimal-content',
                message='Page has very little content - may be incomplete',
                file_path=file_path,
                suggestion='Add more content or mark as intentionally minimal'
            ))

    def _detect_accessibility(self, content: str, file_path: str):
        """Detect accessibility (a11y) issues."""
        # Images without alt text
        for match in self.ACCESSIBILITY_PATTERNS['img_no_alt'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='error',
                type='a11y-img-no-alt',
                message='Image without alt attribute - breaks screen readers',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add alt="" for decorative images or descriptive alt text'
            ))

        # Buttons without labels
        for match in self.ACCESSIBILITY_PATTERNS['button_no_label'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='a11y-button-no-label',
                message='Button with only icon - needs aria-label or text',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add aria-label="descriptive label" or visible text'
            ))

        # Clickable divs/spans without proper ARIA
        for match in self.ACCESSIBILITY_PATTERNS['div_onclick'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='a11y-clickable-div',
                message='onClick on non-interactive element without role/tabIndex',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add role="button" and tabIndex={0}, or use <button>'
            ))

        # Inputs without labels
        for match in self.ACCESSIBILITY_PATTERNS['input_no_label'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            if 'type="hidden"' not in match.group(0):  # Skip hidden inputs
                self.issues.append(Issue(
                    severity='warning',
                    type='a11y-input-no-label',
                    message='Input field without label or aria-label',
                    file_path=file_path,
                    line_number=line_num,
                    suggestion='Add <label> or aria-label for screen readers'
                ))

    def _detect_seo(self, content: str, file_path: str, route: RouteNode):
        """Detect SEO and metadata issues."""
        # Only check page files
        if not any(pf in file_path for pf in self.ROUTE_FILES):
            return

        has_metadata = bool(self.SEO_PATTERNS['metadata_export'].search(content) or
                           self.SEO_PATTERNS['generate_metadata'].search(content))

        if not has_metadata:
            self.issues.append(Issue(
                severity='warning',
                type='seo-missing-metadata',
                message='Page missing metadata export - affects SEO',
                file_path=file_path,
                suggestion='Add: export const metadata = { title: "...", description: "..." }'
            ))
        elif has_metadata:
            # Check if metadata has title and description
            has_title = bool(self.SEO_PATTERNS['metadata_title'].search(content))
            has_description = bool(self.SEO_PATTERNS['metadata_description'].search(content))

            if not has_title:
                self.issues.append(Issue(
                    severity='warning',
                    type='seo-missing-title',
                    message='Metadata missing title property',
                    file_path=file_path,
                    suggestion='Add title: "Page Title" to metadata'
                ))

            if not has_description:
                self.issues.append(Issue(
                    severity='info',
                    type='seo-missing-description',
                    message='Metadata missing description property',
                    file_path=file_path,
                    suggestion='Add description: "..." to metadata for better SEO'
                ))

    def _detect_typescript_quality(self, content: str, file_path: str):
        """Detect TypeScript quality issues."""
        # Type 'any' usage
        for match in self.TYPESCRIPT_PATTERNS['type_any'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='ts-any-type',
                message='Using "any" type - loses type safety',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use a specific type or unknown instead of any'
            ))

        # 'as any' assertions
        for match in self.TYPESCRIPT_PATTERNS['as_any'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='ts-as-any',
                message='Type assertion "as any" - bypasses type checking',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use proper typing instead of forcing any'
            ))

        # @ts-ignore comments
        for match in self.TYPESCRIPT_PATTERNS['ts_ignore'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='ts-ignore-comment',
                message='Using @ts-ignore to suppress TypeScript errors',
                file_path=file_path,
                line_number=line_num,
                suggestion='Fix the type error instead of ignoring it'
            ))

        # Double type assertions
        for match in self.TYPESCRIPT_PATTERNS['double_assertion'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='ts-double-assertion',
                message='Double type assertion "as unknown as" - code smell',
                file_path=file_path,
                line_number=line_num,
                suggestion='Refactor to avoid double assertion'
            ))

    def _detect_form_ux(self, content: str, file_path: str):
        """Detect form UX issues."""
        # Forms without onSubmit handler
        for match in self.FORM_PATTERNS['form_no_submit'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='form-no-submit',
                message='Form without onSubmit handler',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add onSubmit handler for form validation and submission'
            ))

        # Check for submit buttons without loading states
        has_submit_button = bool(self.FORM_PATTERNS['submit_button'].search(content))
        has_loading_state = 'loading' in content.lower() or 'isSubmitting' in content or 'disabled' in content

        if has_submit_button and not has_loading_state:
            self.issues.append(Issue(
                severity='info',
                type='form-no-loading-state',
                message='Submit button without loading/disabled state',
                file_path=file_path,
                suggestion='Add loading state to prevent double submissions'
            ))

        # Forms without error handling
        if '<form' in content.lower():
            has_error_handling = bool(self.FORM_PATTERNS['form_error_handling'].search(content))
            if not has_error_handling:
                self.issues.append(Issue(
                    severity='info',
                    type='form-no-error-handling',
                    message='Form without visible error handling',
                    file_path=file_path,
                    suggestion='Add error state display for better UX'
                ))

    def _detect_performance(self, content: str, file_path: str, route: RouteNode):
        """Detect performance issues."""
        # Using <img> instead of Next.js Image
        has_img_tag = bool(self.PERFORMANCE_PATTERNS['img_tag'].search(content))
        has_next_image = bool(self.PERFORMANCE_PATTERNS['next_image'].search(content))

        if has_img_tag and not has_next_image:
            img_count = len(self.PERFORMANCE_PATTERNS['img_tag'].findall(content))
            self.issues.append(Issue(
                severity='info',
                type='perf-img-tag',
                message=f'Using <img> tag ({img_count}x) instead of next/image',
                file_path=file_path,
                suggestion='Use Next.js Image component for automatic optimization'
            ))

        # Large library imports
        for match in self.PERFORMANCE_PATTERNS['lodash_full'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='perf-lodash-full',
                message='Importing full lodash library - increases bundle size',
                file_path=file_path,
                line_number=line_num,
                suggestion='Import specific functions: import { map } from "lodash"'
            ))

        for match in self.PERFORMANCE_PATTERNS['moment_import'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='perf-moment-import',
                message='Using moment.js - very large bundle size',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use date-fns or native Date instead of moment'
            ))

    def _detect_broken_interactions(self, content: str, file_path: str):
        """Detect potentially broken interactive elements."""
        # Links with href="#"
        for match in self.INTERACTION_PATTERNS['href_placeholder'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='broken-placeholder-link',
                message='Link with href="#" - placeholder link',
                file_path=file_path,
                line_number=line_num,
                suggestion='Replace with actual destination or remove link'
            ))

        # Hardcoded disabled={true}
        for match in self.INTERACTION_PATTERNS['disabled_true'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            context = content[max(0, match.start()-50):match.end()+50]
            if 'disabled={true}' in context or 'disabled=true' in context:
                self.issues.append(Issue(
                    severity='warning',
                    type='broken-always-disabled',
                    message='Element with hardcoded disabled={true} - always disabled',
                    file_path=file_path,
                    line_number=line_num,
                    suggestion='Use conditional disabled state or remove if not needed'
                ))

        # onClick handlers that only console.log
        for match in self.INTERACTION_PATTERNS['onclick_console'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='broken-console-only-handler',
                message='onClick handler only contains console.log - dev-only code',
                file_path=file_path,
                line_number=line_num,
                suggestion='Implement actual functionality or remove the handler'
            ))

    def _detect_auth_protection(self, content: str, file_path: str, route: RouteNode):
        """Detect routes that should be protected but lack auth checks."""
        # Check if route looks like it should be protected
        is_protected_route = bool(self.AUTH_PATTERNS['protected_routes'].search(route.path))

        if is_protected_route:
            has_auth_check = bool(self.AUTH_PATTERNS['auth_imports'].search(content))

            if not has_auth_check:
                self.issues.append(Issue(
                    severity='warning',
                    type='auth-missing',
                    message=f'Protected route "{route.path}" without auth check',
                    file_path=file_path,
                    suggestion='Add authentication check (useSession, useAuth, etc.)'
                ))

    def _detect_placeholder_content(self, content: str, file_path: str):
        """Detect placeholder content that should be replaced."""
        # Lorem ipsum
        for match in self.CONTENT_PLACEHOLDER_PATTERNS['lorem'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='content-lorem',
                message='Lorem ipsum placeholder text found',
                file_path=file_path,
                line_number=line_num,
                suggestion='Replace with real content before production'
            ))

        # Test emails
        for match in self.CONTENT_PLACEHOLDER_PATTERNS['test_email'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='content-test-email',
                message=f'Test email address found: {match.group(0)}',
                file_path=file_path,
                line_number=line_num,
                suggestion='Replace with real email or use faker for development'
            ))

        # Placeholder names
        for match in self.CONTENT_PLACEHOLDER_PATTERNS['placeholder_name'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='content-placeholder-name',
                message=f'Placeholder name found: {match.group(0)}',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use dynamic data or realistic examples'
            ))

        # TBD/TBA/Placeholder text
        for match in self.CONTENT_PLACEHOLDER_PATTERNS['tbd_text'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='content-tbd',
                message=f'Incomplete content marker: {match.group(0)}',
                file_path=file_path,
                line_number=line_num,
                suggestion='Complete this content before shipping'
            ))

    def _detect_empty_states(self, content: str, file_path: str):
        """Detect missing empty states and error handling."""
        # .map() without length check
        for match in self.EMPTY_STATE_PATTERNS['map_no_check'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            context = content[max(0, match.start()-50):match.end()+50]
            # Only flag if no conditional render nearby
            if '&&' not in context and '?' not in context and 'length' not in context:
                self.issues.append(Issue(
                    severity='warning',
                    type='empty-state-map-no-check',
                    message='.map() without empty state handling',
                    file_path=file_path,
                    line_number=line_num,
                    suggestion='Add: {items.length > 0 ? items.map(...) : <EmptyState />}'
                ))

        # Conditional render without fallback
        for match in self.EMPTY_STATE_PATTERNS['conditional_no_fallback'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            matched_text = match.group(0)
            if '&&' in matched_text and ':' not in matched_text:
                self.issues.append(Issue(
                    severity='info',
                    type='empty-state-no-fallback',
                    message='Conditional render without fallback',
                    file_path=file_path,
                    line_number=line_num,
                    suggestion='Consider adding fallback: {condition ? <Component /> : <Fallback />}'
                ))

    def _detect_env_leaks(self, content: str, file_path: str):
        """Detect potential environment variable leaks."""
        # Localhost URLs
        for match in self.ENV_LEAK_PATTERNS['localhost'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='env-localhost-url',
                message='Hardcoded localhost URL found',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use environment variable: process.env.NEXT_PUBLIC_API_URL'
            ))

        # Hardcoded ports
        for match in self.ENV_LEAK_PATTERNS['hardcoded_port'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='env-hardcoded-port',
                message='Hardcoded port in URL',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use environment variable for API endpoints'
            ))

        # Staging/dev URLs
        for match in self.ENV_LEAK_PATTERNS['staging_url'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='error',
                type='env-staging-url',
                message='Staging/dev URL hardcoded - will break in production',
                file_path=file_path,
                line_number=line_num,
                suggestion='Use environment-specific URLs via env vars'
            ))

    def _detect_responsive_issues(self, content: str, file_path: str):
        """Detect responsive design issues."""
        # Large fixed widths
        for match in self.RESPONSIVE_PATTERNS['fixed_width_large'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            width = match.group(1)
            self.issues.append(Issue(
                severity='warning',
                type='responsive-large-fixed-width',
                message=f'Large fixed width ({width}px) without responsive prefix',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add responsive prefix: w-full md:w-[{width}px]'
            ))

        # Horizontal scroll risks
        for match in self.RESPONSIVE_PATTERNS['overflow_scroll_x'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='responsive-horizontal-scroll',
                message='Horizontal scroll detected - verify mobile UX',
                file_path=file_path,
                line_number=line_num,
                suggestion='Test on mobile to ensure good UX'
            ))

    def _detect_dead_code(self, content: str, file_path: str):
        """Detect dead/unreachable code."""
        # if (false)
        for match in self.DEAD_CODE_PATTERNS['if_false'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='dead-code-if-false',
                message='Dead code: if (false) will never execute',
                file_path=file_path,
                line_number=line_num,
                suggestion='Remove dead code branch'
            ))

        # if (true) - might be intentional debugging
        for match in self.DEAD_CODE_PATTERNS['if_true'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='dead-code-if-true',
                message='Suspicious: if (true) - always executes',
                file_path=file_path,
                line_number=line_num,
                suggestion='Remove condition if always true, or fix logic'
            ))

        # Commented returns
        for match in self.DEAD_CODE_PATTERNS['commented_return'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='info',
                type='dead-code-commented-return',
                message='Commented return statement found',
                file_path=file_path,
                line_number=line_num,
                suggestion='Remove commented code or uncomment if needed'
            ))

    def _detect_navigation_completeness(self, content: str, file_path: str, route: RouteNode):
        """Detect incomplete navigation patterns."""
        # Detail pages without back navigation
        if '[id]' in route.path or '[slug]' in route.path:
            has_back = 'router.back()' in content or 'router.push' in content or '<Link' in content
            if not has_back:
                self.issues.append(Issue(
                    severity='warning',
                    type='nav-detail-no-back',
                    message='Detail page without back navigation',
                    file_path=file_path,
                    suggestion='Add back button or breadcrumb navigation'
                ))

        # Modals without close handlers
        for match in self.NAVIGATION_PATTERNS['modal_no_close'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            self.issues.append(Issue(
                severity='warning',
                type='nav-modal-no-close',
                message='Modal/Dialog without close handler',
                file_path=file_path,
                line_number=line_num,
                suggestion='Add onClose or onOpenChange handler'
            ))

        # Delete actions without confirmation
        for match in self.NAVIGATION_PATTERNS['delete_no_confirm'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            context = content[max(0, match.start()-100):match.end()+100]
            if 'confirm' not in context.lower() and 'dialog' not in context.lower():
                self.issues.append(Issue(
                    severity='warning',
                    type='nav-delete-no-confirm',
                    message='Delete action without confirmation dialog',
                    file_path=file_path,
                    line_number=line_num,
                    suggestion='Add confirmation: if (confirm("Are you sure?")) { ... }'
                ))

    def _detect_mutation_ux(self, content: str, file_path: str):
        """Detect data mutation UX issues."""
        # Check for mutations (POST/PUT/DELETE) without feedback
        for match in self.MUTATION_UX_PATTERNS['mutation_no_feedback'].finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            context = content[max(0, match.start()-100):match.end()+200]
            if 'toast' not in context and 'alert' not in context and 'setSuccess' not in context:
                self.issues.append(Issue(
                    severity='warning',
                    type='mutation-no-feedback',
                    message='Data mutation without user feedback',
                    file_path=file_path,
                    line_number=line_num,
                    suggestion='Add success/error toast notification'
                ))

    def infer_purpose(self, route_path: str, content: str) -> tuple[str, float]:
        """
        Infer the purpose of a route based on path patterns and content.
        Returns (purpose, confidence_score).
        """
        path_lower = route_path.lower()

        # Pattern-based purpose detection with confidence scores
        purpose_scores = {
            'List View': 0.0,
            'Detail View': 0.0,
            'Create Form': 0.0,
            'Edit Form': 0.0,
            'Dashboard': 0.0,
            'Settings Page': 0.0,
            'Landing Page': 0.0,
            'Auth Page': 0.0,
        }

        # Path-based signals
        if '[id]' in route_path or '[slug]' in route_path:
            purpose_scores['Detail View'] += 0.6
        if '/edit' in path_lower or '/[id]/edit' in route_path:
            purpose_scores['Edit Form'] += 0.7
        if '/new' in path_lower or '/create' in path_lower:
            purpose_scores['Create Form'] += 0.7
        if 'dashboard' in path_lower and route_path.count('/') <= 3:
            purpose_scores['Dashboard'] += 0.6
        if 'settings' in path_lower or 'preferences' in path_lower:
            purpose_scores['Settings Page'] += 0.7
        if route_path == '/' or route_path == '/page.tsx':
            purpose_scores['Landing Page'] += 0.8
        if any(x in path_lower for x in ['login', 'signup', 'register', 'auth', 'forgot-password']):
            purpose_scores['Auth Page'] += 0.9

        # Content-based signals
        if re.search(r'<(?:Table|DataTable|table)[^>]*>', content, re.MULTILINE):
            purpose_scores['List View'] += 0.3
        if re.search(r'\.map\s*\([^)]*\)\s*', content, re.MULTILINE):
            purpose_scores['List View'] += 0.2
        if re.search(r'<form|<Form|useForm', content, re.MULTILINE | re.IGNORECASE):
            if 'edit' in path_lower:
                purpose_scores['Edit Form'] += 0.2
            elif 'new' in path_lower or 'create' in path_lower:
                purpose_scores['Create Form'] += 0.2
            else:
                purpose_scores['Edit Form'] += 0.1
                purpose_scores['Create Form'] += 0.1
        if re.search(r'<(?:Chart|Bar|Line|Pie|Area)', content, re.MULTILINE):
            purpose_scores['Dashboard'] += 0.3
        if re.search(r'<(?:Tabs|TabList|TabPanel)', content, re.MULTILINE):
            purpose_scores['Settings Page'] += 0.2

        # List view patterns (pagination, filters, search)
        if re.search(r'(?:page|offset|limit|cursor)', content, re.MULTILINE):
            purpose_scores['List View'] += 0.2
        if re.search(r'(?:search|query|filter).*<input', content, re.MULTILINE | re.IGNORECASE):
            purpose_scores['List View'] += 0.2

        # Get highest scoring purpose
        max_purpose = max(purpose_scores, key=purpose_scores.get)
        max_score = purpose_scores[max_purpose]

        # Default to generic if confidence is too low
        if max_score < 0.3:
            return ('Generic Page', 0.5)

        return (max_purpose, min(max_score, 1.0))

    def detect_features(self, content: str, purpose: str) -> list[FeatureAnalysis]:
        """
        Detect which features are present in the route.
        Compares detected vs expected features for the route purpose.
        """
        features = []
        expected = self.EXPECTED_FEATURES_BY_PURPOSE.get(purpose, [])

        for feature_name, pattern in self.FEATURE_PATTERNS.items():
            match = pattern.search(content)
            detected = match is not None
            required = feature_name in expected

            evidence = ""
            line_number = 0
            if detected and match:
                line_number = content[:match.start()].count('\n') + 1
                evidence = match.group(0)[:50]  # First 50 chars

            features.append(FeatureAnalysis(
                name=feature_name,
                detected=detected,
                required=required,
                evidence=evidence,
                line_number=line_number
            ))

        return features

    def analyze_interactions(self, content: str) -> list[InteractionAnalysis]:
        """
        Analyze all interactive elements (buttons, links, forms) and determine their status.
        Status can be: working, empty, todo, console-only, broken, disabled, placeholder
        """
        interactions = []

        # Analyze buttons
        button_pattern = re.compile(
            r'<[Bb]utton[^>]*(?:onClick=\{([^}]+)\})?[^>]*>(.*?)</[Bb]utton>',
            re.MULTILINE | re.DOTALL
        )
        for match in button_pattern.finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            handler = match.group(1) or ''
            label = re.sub(r'<[^>]+>', '', match.group(2) or '').strip()[:30]

            status = self._determine_interaction_status(handler, label)

            interactions.append(InteractionAnalysis(
                type='button',
                label=label or 'Unlabeled button',
                status=status,
                line_number=line_num,
                handler_code=handler[:100] if handler else ''
            ))

        # Analyze links
        link_pattern = re.compile(
            r'<Link[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</Link>',
            re.MULTILINE | re.DOTALL
        )
        for match in link_pattern.finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            destination = match.group(1)
            label = re.sub(r'<[^>]+>', '', match.group(2) or '').strip()[:30]

            status = 'working' if destination and destination != '#' else 'placeholder'

            interactions.append(InteractionAnalysis(
                type='link',
                label=label or 'Unlabeled link',
                status=status,
                line_number=line_num,
                destination=destination
            ))

        # Analyze forms
        form_pattern = re.compile(
            r'<form[^>]*(?:onSubmit=\{([^}]+)\})?[^>]*>',
            re.MULTILINE | re.DOTALL
        )
        for match in form_pattern.finditer(content):
            line_num = content[:match.start()].count('\n') + 1
            handler = match.group(1) or ''

            status = self._determine_interaction_status(handler, 'form')

            interactions.append(InteractionAnalysis(
                type='form',
                label='Form submission',
                status=status,
                line_number=line_num,
                handler_code=handler[:100] if handler else ''
            ))

        return interactions

    def _determine_interaction_status(self, handler: str, label: str) -> str:
        """Determine the status of an interaction based on handler code."""
        if not handler:
            return 'empty'

        handler_lower = handler.lower()

        # Check for TODO comments
        if 'todo' in handler_lower or 'fixme' in handler_lower:
            return 'todo'

        # Check for console-only
        if 'console.log' in handler_lower and len(handler) < 50:
            return 'console-only'

        # Check for disabled
        if 'disabled' in label.lower() or 'disabled' in handler_lower:
            return 'disabled'

        # Check for placeholder
        if any(x in handler_lower for x in ['placeholder', 'noop', 'void', '() => {}']):
            return 'placeholder'

        # Check for working (has substantial code)
        if len(handler.strip()) > 20 and any(x in handler_lower for x in ['await', 'fetch', 'router', 'set', 'handle', 'submit']):
            return 'working'

        # Default
        return 'empty'

    def calculate_completion_score(self, route_intelligence: RouteIntelligence) -> tuple[int, dict]:
        """
        Calculate completion score (0-100) for a route based on multiple factors.
        Returns (overall_score, breakdown_dict).
        """
        breakdown = {
            'ui_completeness': 0,      # 25 points
            'functionality': 0,        # 30 points
            'error_handling': 0,       # 20 points
            'accessibility': 0,        # 15 points
            'code_quality': 0,         # 10 points
        }

        # 1. UI Completeness (25 points)
        # Based on required features detected
        required_features = [f for f in route_intelligence.features if f.required]
        detected_required = [f for f in required_features if f.detected]
        if required_features:
            breakdown['ui_completeness'] = int((len(detected_required) / len(required_features)) * 25)
        else:
            breakdown['ui_completeness'] = 25  # No requirements = full score

        # 2. Functionality (30 points)
        # Based on working interactions vs broken/empty
        total_interactions = len(route_intelligence.interactions)
        if total_interactions > 0:
            working_ratio = route_intelligence.working_count / total_interactions
            breakdown['functionality'] = int(working_ratio * 30)
        else:
            breakdown['functionality'] = 15  # Neutral score for no interactions

        # 3. Error Handling (20 points)
        points = 0
        if route_intelligence.has_loading:
            points += 7
        if route_intelligence.has_error:
            points += 7
        if route_intelligence.has_metadata:
            points += 6
        breakdown['error_handling'] = points

        # 4. Accessibility (15 points)
        # Give full score for now (could enhance later to check specific a11y issues)
        breakdown['accessibility'] = 15

        # 5. Code Quality (10 points)
        # Penalize for placeholder content, dead code, etc.
        quality_issues = len(route_intelligence.placeholder_warnings)
        if quality_issues == 0:
            breakdown['code_quality'] = 10
        elif quality_issues < 3:
            breakdown['code_quality'] = 7
        elif quality_issues < 5:
            breakdown['code_quality'] = 4
        else:
            breakdown['code_quality'] = 2

        overall = sum(breakdown.values())
        return (overall, breakdown)

    def analyze_route_intelligence(self, route_path: str, route: RouteNode) -> RouteIntelligence:
        """
        Perform comprehensive route intelligence analysis.
        This is the main orchestration method.
        """
        # Read file content
        try:
            with open(route.file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except:
            content = ""

        # 1. Infer purpose
        purpose, confidence = self.infer_purpose(route_path, content)

        # 2. Detect features
        features = self.detect_features(content, purpose)
        features_detected = [f.name for f in features if f.detected]
        features_missing = [f.name for f in features if f.required and not f.detected]

        # 3. Analyze interactions
        interactions = self.analyze_interactions(content)
        working_count = len([i for i in interactions if i.status == 'working'])
        broken_count = len([i for i in interactions if i.status in ['broken', 'empty', 'console-only']])

        # 4. Check for real content (not placeholders)
        has_real_content = True
        placeholder_warnings = []
        for pattern_name, pattern in self.CONTENT_PLACEHOLDER_PATTERNS.items():
            if pattern.search(content):
                has_real_content = False
                placeholder_warnings.append(pattern_name)

        # 5. Check route completeness
        has_metadata = bool(re.search(r'export\s+(?:const\s+)?metadata', content))
        file_path_obj = Path(route.file_path)
        has_loading = (file_path_obj.parent / 'loading.tsx').exists()
        has_error = (file_path_obj.parent / 'error.tsx').exists()

        # 6. Check auth protection
        is_protected = bool(re.search(r'getUser|requireAuth|auth\(\)', content))

        # 7. Count issues for this route
        route_issues = [i for i in self.issues if str(route.file_path) in i.file_path]
        issues_count = len(route_issues)

        # Create RouteIntelligence object
        ri = RouteIntelligence(
            path=route_path,
            file_path=str(route.file_path),
            inferred_purpose=purpose,
            purpose_confidence=confidence,
            completion_score=0,  # Will be set below
            features=features,
            features_detected=features_detected,
            features_missing=features_missing,
            interactions=interactions,
            working_count=working_count,
            broken_count=broken_count,
            issues_count=issues_count,
            has_real_content=has_real_content,
            placeholder_warnings=placeholder_warnings,
            has_metadata=has_metadata,
            has_loading=has_loading,
            has_error=has_error,
            is_protected=is_protected
        )

        # 8. Calculate completion score
        overall_score, breakdown = self.calculate_completion_score(ri)
        ri.completion_score = overall_score
        ri.completion_breakdown = breakdown

        return ri

    def _classify_destination(self, href: str) -> str:
        """Classify the type of destination."""
        if href.startswith('http://') or href.startswith('https://'):
            return 'external'
        if href.startswith('/api/'):
            return 'api-call'
        if href.startswith('#'):
            return 'anchor'
        if href.startswith('/'):
            return 'route'
        if '${' in href or '{' in href:
            return 'route'
        return 'unknown'
    
    def _build_edges(self):
        """Build edges between routes based on interactions."""
        for route_path, route in self.routes.items():
            for element in route.elements:
                if element.destination_type == 'route':
                    dest = element.destination
                    if '${' in dest:
                        dest = re.sub(r'\$\{[^}]+\}', '[param]', dest)
                    
                    self.edges.append({
                        'from': route_path,
                        'to': dest,
                        'trigger': element.type,
                        'label': element.label
                    })
    
    def _find_issues(self):
        """Find potential issues in the interaction graph."""
        known_routes = set(self.routes.keys())
        
        # Build redirect graph for cycle detection
        redirect_graph = defaultdict(list)
        for route_path, route in self.routes.items():
            for el in route.elements:
                if el.type == 'programmatic-nav' and 'Redirect' in el.label:
                    redirect_graph[route_path].append(el.destination)
        
        self._find_redirect_cycles(redirect_graph)
        
        # Check for broken internal links with fuzzy matching
        for edge in self.edges:
            dest = edge['to']
            if dest.startswith('http') or dest.startswith('/api/'):
                continue
            
            found, suggestion = self._check_route_exists(dest, known_routes)
            
            if not found and not '${' in edge['to'] and not '[param]' in edge['to']:
                issue = Issue(
                    severity='warning',
                    type='broken-link',
                    message=f'Link to "{dest}" may be broken - no matching route found',
                    file_path=edge['from'],
                    suggestion=suggestion or f'Verify that route "{dest}" exists or update the link'
                )
                self.issues.append(issue)
        
        # Check for orphan routes
        linked_destinations = set(edge['to'] for edge in self.edges)
        for route_path in self.routes.keys():
            if route_path == '/':
                continue
            
            is_linked = self._is_route_linked(route_path, linked_destinations)
            
            if not is_linked:
                self.issues.append(Issue(
                    severity='info',
                    type='orphan-route',
                    message=f'Route "{route_path}" is not linked from any other route',
                    file_path=self.routes[route_path].file_path,
                    suggestion='Consider adding navigation to this route or removing it if unused'
                ))
        
        # Check for dead ends
        for route_path, route in self.routes.items():
            outbound = [el for el in route.elements if el.destination_type == 'route']
            if not outbound and route_path != '/':
                self.issues.append(Issue(
                    severity='info',
                    type='dead-end',
                    message=f'Route "{route_path}" has no outbound navigation',
                    file_path=route.file_path,
                    suggestion='Consider adding a back link or navigation to other sections'
                ))
        
        # Check for missing error boundaries
        for route_path, route in self.routes.items():
            if not route.has_error:
                route_dir = Path(route.file_path).parent
                has_parent_error = False
                while route_dir != self.app_dir.parent:
                    for ef in self.ERROR_FILES:
                        if (route_dir / ef).exists():
                            has_parent_error = True
                            break
                    if has_parent_error:
                        break
                    route_dir = route_dir.parent
                
                if not has_parent_error:
                     self.issues.append(Issue(
                        severity='info',
                        type='missing-error-boundary',
                        message=f'Route "{route_path}" has no error boundary',
                        file_path=route.file_path,
                        suggestion='Add error.tsx to handle errors gracefully'
                    ))
    
    def _find_redirect_cycles(self, redirect_graph: dict):
        """Detect circular redirect chains."""
        visited = set()
        rec_stack = set()
        
        def dfs(node, path):
            visited.add(node)
            rec_stack.add(node)
            path.append(node)
            
            for neighbor in redirect_graph.get(node, []):
                neighbor_normalized = neighbor.split('?')[0]
                
                if neighbor_normalized in rec_stack:
                    cycle_start = path.index(neighbor_normalized) if neighbor_normalized in path else 0
                    cycle = path[cycle_start:] + [neighbor_normalized]
                    self.issues.append(Issue(
                        severity='error',
                        type='redirect-cycle',
                        message=f'Circular redirect detected: {" → ".join(cycle)}',
                        file_path=self.routes.get(node, RouteNode('', '')).file_path,
                        suggestion='Break the redirect cycle to prevent infinite loops'
                    ))
                    return
                
                if neighbor_normalized not in visited and neighbor_normalized in self.routes:
                    dfs(neighbor_normalized, path.copy())
            
            rec_stack.remove(node)
        
        for route in redirect_graph:
            if route not in visited:
                dfs(route, [])
    
    def _check_route_exists(self, dest: str, known_routes: set) -> tuple[bool, str]:
        """Check if a route exists, with fuzzy matching for suggestions."""
        if dest in known_routes:
            return True, ''
        
        for route in known_routes:
            if '[' in route:
                pattern = '^' + re.sub(r'\[[^\]]+\]', '[^/]+', route) + '$'
                if re.match(pattern, dest):
                    return True, ''
        
        best_match = None
        best_score = 0
        
        for route in known_routes:
            score = self._similarity(dest, route)
            if score > best_score and score > 0.6:
                best_score = score
                best_match = route
        
        if best_match:
            return False, f'Did you mean "{best_match}"? (similarity: {best_score:.0%})'
        
        return False, ''
    
    def _similarity(self, s1: str, s2: str) -> float:
        """Calculate similarity between two strings (Levenshtein-based)."""
        if s1 == s2:
            return 1.0
        
        len1, len2 = len(s1), len(s2)
        if len1 == 0 or len2 == 0:
            return 0.0
        
        if len1 > len2:
            s1, s2 = s2, s1
            len1, len2 = len2, len1
        
        distances = range(len1 + 1)
        for i2, c2 in enumerate(s2):
            new_distances = [i2 + 1]
            for i1, c1 in enumerate(s1):
                if c1 == c2:
                    new_distances.append(distances[i1])
                else:
                    new_distances.append(1 + min((distances[i1], distances[i1 + 1], new_distances[-1])))
            distances = new_distances
        
        max_len = max(len1, len2)
        return 1 - (distances[-1] / max_len)
    
    def _is_route_linked(self, route_path: str, linked_destinations: set) -> bool:
        """Check if a route is linked from any other route."""
        for dest in linked_destinations:
            if dest == route_path:
                return True
            if '${' in dest or '[' in dest:
                pattern = re.sub(r'\$\{[^}]+\}|\[[^\]]+\]', '[^/]+', dest)
                if re.match(f'^{pattern}$', route_path):
                    return True
        return False
    
    def _generate_report(self) -> dict:
        """Generate the full analysis report."""
        # Calculate average completion score
        avg_completion = 0
        if self.route_intelligence:
            avg_completion = sum(ri.completion_score for ri in self.route_intelligence.values()) / len(self.route_intelligence)

        return {
            'summary': {
                'total_routes': len(self.routes),
                'total_elements': len(self.elements),
                'total_edges': len(self.edges),
                'average_completion_score': int(avg_completion),
                'issues': {
                    'errors': len([i for i in self.issues if i.severity == 'error']),
                    'warnings': len([i for i in self.issues if i.severity == 'warning']),
                    'info': len([i for i in self.issues if i.severity == 'info'])
                }
            },
            'routes': {path: asdict(route) for path, route in self.routes.items()},
            'route_intelligence': {
                path: {
                    'path': ri.path,
                    'file_path': ri.file_path,
                    'inferred_purpose': ri.inferred_purpose,
                    'purpose_confidence': ri.purpose_confidence,
                    'completion_score': ri.completion_score,
                    'completion_breakdown': ri.completion_breakdown,
                    'features_detected': ri.features_detected,
                    'features_missing': ri.features_missing,
                    'interactions': [
                        {
                            'type': ia.type,
                            'label': ia.label,
                            'status': ia.status,
                            'line_number': ia.line_number
                        }
                        for ia in ri.interactions
                    ],
                    'working_count': ri.working_count,
                    'broken_count': ri.broken_count,
                    'issues_count': ri.issues_count,
                    'has_real_content': ri.has_real_content,
                    'placeholder_warnings': ri.placeholder_warnings,
                    'has_metadata': ri.has_metadata,
                    'has_loading': ri.has_loading,
                    'has_error': ri.has_error,
                    'is_protected': ri.is_protected
                }
                for path, ri in self.route_intelligence.items()
            },
            'edges': self.edges,
            'issues': [asdict(i) for i in self.issues],
            'mermaid': self._generate_mermaid()
        }
    
    def _generate_mermaid(self) -> str:
        """Generate a Mermaid diagram of the interaction graph."""
        lines = ['graph LR']

        def node_id(path: str) -> str:
            # Remove query strings and fragments before generating ID
            path = path.split('?')[0].split('#')[0]
            return path.replace('/', '_').replace('[', '').replace(']', '').replace('-', '_').replace('(', '').replace(')', '') or 'root'

        def sanitize_label(text: str) -> str:
            """Sanitize text for use in Mermaid labels."""
            # Truncate query strings and fragments in labels
            if '?' in text:
                text = text.split('?')[0] + '?...'
            if '#' in text:
                text = text.split('#')[0]
            return text.replace('"', "'").replace('<', '').replace('>', '')

        added_nodes = set()
        for route_path in self.routes.keys():
            nid = node_id(route_path)
            if nid not in added_nodes:
                label = route_path if route_path != '/' else '/ (home)'
                label = sanitize_label(label)
                lines.append(f'    {nid}["{label}"]')
                added_nodes.add(nid)

        for edge in self.edges:
            from_id = node_id(edge['from'])
            to_path = edge['to']

            if not to_path.startswith('/') or to_path.startswith('/api/'):
                continue

            to_id = node_id(to_path)

            if to_id not in added_nodes:
                to_label = sanitize_label(to_path)
                lines.append(f'    {to_id}["{to_label}"]')
                added_nodes.add(to_id)

            label = edge['label'][:30] + '...' if len(edge['label']) > 30 else edge['label']
            label = sanitize_label(label)

            lines.append(f'    {from_id} -->|"{label}"| {to_id}')

        return '\n'.join(lines)


class TodoGenerator:
    """Generates comprehensive TODO.md based on audit findings."""
    
    def __init__(self, report: dict, app_dir: Path):
        self.report = report
        self.app_dir = app_dir
        self.todos = []
        self.findings = []
        
    def analyze(self) -> dict:
        """Run all analyses and generate TODO structure."""
        self._analyze_missing_routes()
        self._analyze_code_issues()
        self._analyze_navigation_gaps()
        self._analyze_ux_patterns()
        
        return {
            'findings': self.findings,
            'todos': self.todos,
            'stats': self._calculate_stats()
        }
    
    def _analyze_missing_routes(self):
        """Detect routes that should exist based on patterns."""
        routes = set(self.report['routes'].keys())
        
        for route in list(routes):
            if route.count('/') >= 1 and '[' not in route and route != '/':
                dynamic_version = f"{route}/[id]"
                if dynamic_version not in routes and not any(r.startswith(route + '/[') for r in routes):
                    route_data = self.report['routes'].get(route, {})
                    elements = route_data.get('elements', [])
                    has_list_indicators = any(
                        'list' in str(e.get('label', '')).lower() or
                        'all' in str(e.get('label', '')).lower() or
                        'view' in str(e.get('label', '')).lower()
                        for e in elements
                    )
                    if has_list_indicators or route.endswith('s'):
                        self.findings.append({
                            'type': 'missing-detail-route',
                            'message': f'List page "{route}" exists but no detail page "{dynamic_version}"',
                            'severity': 'suggestion'
                        })
                        self.todos.append({
                            'priority': 2,
                            'category': 'Missing Routes',
                            'task': f'Create detail page: {dynamic_version}',
                            'file': f'app{dynamic_version}/page.tsx',
                            'description': f'Add individual item view for {route}',
                            'status': 'pending'
                        })
    
    def _analyze_code_issues(self):
        """Convert code issues to TODOs."""
        priority_map = {
            'redirect-cycle': (1, 'Critical Bugs'),
            'not-implemented': (1, 'Critical Bugs'),
            'broken-link': (2, 'Broken Links'),
            'empty-handler': (2, 'Dead Code'),
            'empty-catch': (2, 'Error Handling'),
            'placeholder-content': (3, 'Incomplete Content'),
            'todo-comment': (3, 'Developer TODOs'),
            'test-data': (3, 'Test Data Cleanup'),
            'console-statement': (4, 'Code Cleanup'),
            'commented-code': (5, 'Code Cleanup'),
        }
        
        for issue in self.report.get('issues', []):
            issue_type = issue.get('type', '')
            if issue_type in priority_map:
                priority, category = priority_map[issue_type]
                file_path = issue.get('file_path', '').split('/')[-2:]
                file_str = '/'.join(file_path)
                line = issue.get('line_number', '')
                
                self.todos.append({
                    'priority': priority,
                    'category': category,
                    'task': issue.get('message', 'Fix issue'),
                    'file': f"{file_str}:{line}" if line else file_str,
                    'description': issue.get('suggestion', ''),
                    'status': 'pending'
                })
    
    def _analyze_navigation_gaps(self):
        """Find navigation issues."""
        edges = self.report.get('edges', [])
        routes = set(self.report['routes'].keys())
        
        linked_to = set(e['to'] for e in edges)
        for route in routes:
            if route != '/' and route not in linked_to:
                self.findings.append({
                    'type': 'orphan-route',
                    'message': f'Route "{route}" is not linked from anywhere',
                    'severity': 'warning'
                })
                self.todos.append({
                    'priority': 3,
                    'category': 'Navigation',
                    'task': f'Add navigation to {route}',
                    'file': 'Multiple files',
                    'description': 'Add links from related pages or remove if unused',
                    'status': 'pending'
                })
        
        links_from = set(e['from'] for e in edges)
        for route in routes:
            if route not in links_from:
                route_data = self.report['routes'].get(route, {})
                if len(route_data.get('elements', [])) > 0:
                    self.todos.append({
                        'priority': 4,
                        'category': 'Navigation',
                        'task': f'Add outbound navigation from {route}',
                        'file': route_data.get('file_path', '').split('/')[-1],
                        'description': 'Add back link or related page links',
                        'status': 'pending'
                    })
    
    def _analyze_ux_patterns(self):
        """Detect missing UX patterns."""
        routes = self.report['routes']
        
        if '/not-found' not in routes and '/_not-found' not in routes:
            self.todos.append({
                'priority': 3,
                'category': 'UX Patterns',
                'task': 'Create custom 404 page',
                'file': 'app/not-found.tsx',
                'description': 'Add branded 404 page with navigation back to safety',
                'status': 'pending'
            })
        
        has_global_error = any('error' in str(self.app_dir / f) for f in ['error.tsx', 'global-error.tsx'])
        if not has_global_error:
            self.todos.append({
                'priority': 4,
                'category': 'UX Patterns',
                'task': 'Create global error boundary',
                'file': 'app/global-error.tsx',
                'description': 'Catch-all error page for unhandled exceptions',
                'status': 'pending'
            })
    
    def _calculate_stats(self) -> dict:
        """Calculate summary statistics."""
        by_priority = defaultdict(int)
        by_category = defaultdict(int)
        
        for todo in self.todos:
            by_priority[todo['priority']] += 1
            by_category[todo['category']] += 1
        
        return {
            'total': len(self.todos),
            'by_priority': dict(by_priority),
            'by_category': dict(by_category),
            'critical': by_priority.get(1, 0) + by_priority.get(2, 0),
            'findings_count': len(self.findings)
        }
    
    def generate_markdown(self) -> str:
        """Generate TODO.md content."""
        data = self.analyze()
        lines = []
        
        lines.append('# 📋 Project TODO List')
        lines.append('')
        lines.append(f'> Auto-generated by UX Flow Auditor | {datetime.now().strftime("%Y-%m-%d %H:%M")}')
        lines.append('> This file auto-updates as you complete tasks. Check off items by changing `[ ]` to `[x]`.')
        lines.append('')
        
        stats = data['stats']
        lines.append('## 📊 Summary')
        lines.append('')
        lines.append(f'| Metric | Count |')
        lines.append(f'|--------|-------|')
        lines.append(f'| Total Tasks | **{stats["total"]}** |')
        lines.append(f'| Critical/High Priority | **{stats["critical"]}** |')
        lines.append(f'| Findings | {stats["findings_count"]} |')
        lines.append('')
        
        priority_labels = {
            1: '🚨 Critical',
            2: '🔴 High',
            3: '🟠 Medium', 
            4: '🟡 Low',
            5: '📝 Cleanup'
        }
        
        lines.append('### By Priority')
        lines.append('')
        for p in sorted(stats['by_priority'].keys()):
            label = priority_labels.get(p, f'Priority {p}')
            count = stats['by_priority'][p]
            lines.append(f'- {label}: {count}')
        lines.append('')
        
        if data['findings']:
            lines.append('## 🔍 Key Findings')
            lines.append('')
            for finding in data['findings']:
                icon = '⚠️' if finding['severity'] == 'warning' else '💡'
                lines.append(f'- {icon} {finding["message"]}')
            lines.append('')
        
        by_category = defaultdict(list)
        for todo in data['todos']:
            by_category[todo['category']].append(todo)
        
        def category_priority(cat):
            items = by_category[cat]
            return min(t['priority'] for t in items) if items else 99
        
        sorted_categories = sorted(by_category.keys(), key=category_priority)
        
        lines.append('## ✅ Tasks')
        lines.append('')
        
        for category in sorted_categories:
            todos = sorted(by_category[category], key=lambda x: x['priority'])
            
            lines.append(f'### {category} ({len(todos)})')
            lines.append('')
            
            for todo in todos:
                checkbox = '[ ]' if todo['status'] == 'pending' else '[x]'
                priority_icon = priority_labels.get(todo['priority'], '').split()[0] if todo['priority'] in priority_labels else ''
                
                lines.append(f'- {checkbox} {priority_icon} **{todo["task"]}**')
                lines.append(f'  - 📁 `{todo["file"]}`')
                if todo.get('description'):
                    lines.append(f'  - {todo["description"]}')
                lines.append('')
        
        lines.append('---')
        lines.append('')
        lines.append('## 🎯 Quick Wins')
        lines.append('')
        lines.append('Tasks that can be completed in < 5 minutes:')
        lines.append('')
        
        quick_wins = [t for t in data['todos'] if t['priority'] >= 4 and 'console' in t['task'].lower() or 'remove' in t['task'].lower()][:5]
        for todo in quick_wins:
            lines.append(f'- [ ] {todo["task"]} (`{todo["file"]}`)')
        
        if not quick_wins:
            lines.append('- No quick wins identified')
        
        lines.append('')
        lines.append('---')
        lines.append('*Re-run the auditor to refresh this list after making changes.*')
        
        return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Analyze UX flows in a Next.js App Router application')
    parser.add_argument('app_dir', help='Path to the app directory (e.g., ./src/app or ./app)')
    parser.add_argument('--output', '-o', help='Output file path (default: stdout)')
    parser.add_argument('--format', '-f', choices=['json', 'mermaid', 'summary'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--todo', '-t', nargs='?', const='auto', default=None,
                        help='Generate TODO.md (use "auto" or specify path)')
    
    args = parser.parse_args()
    
    analyzer = UXFlowAnalyzer(args.app_dir)
    report = analyzer.analyze()
    
    if args.todo:
        todo_generator = TodoGenerator(report, Path(args.app_dir))
        todo_content = todo_generator.generate_markdown()
        todo_data = todo_generator.analyze()
        
        if args.todo == 'auto':
            todo_path = Path(args.app_dir).parent / 'TODO.md'
        else:
            todo_path = Path(args.todo)
        
        with open(todo_path, 'w') as f:
            f.write(todo_content)
        
        print(f"📋 Generated TODO.md at {todo_path}", file=sys.stderr)
        print(f"   📊 {todo_data['stats']['total']} tasks | {todo_data['stats']['critical']} critical", file=sys.stderr)
        
        report['todo'] = todo_data
    
    if args.format == 'mermaid':
        output = report['mermaid']
    elif args.format == 'summary':
        output = generate_summary(report)
    else:
        output = json.dumps(report, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f'Report written to {args.output}')
    else:
        print(output)


def generate_summary(report: dict) -> str:
    """Generate a human-readable summary of the report."""
    lines = [
        '# UX Flow Audit Report',
        '',
        '## Summary',
        f"- **Routes discovered:** {report['summary']['total_routes']}",
        f"- **Interactive elements:** {report['summary']['total_elements']}",
        f"- **Navigation edges:** {report['summary']['total_edges']}",
        '',
        '## Issues',
        f"- 🔴 Errors: {report['summary']['issues']['errors']}",
        f"- 🟡 Warnings: {report['summary']['issues']['warnings']}",
        f"- 🔵 Info: {report['summary']['issues']['info']}",
        '',
    ]
    
    if report['issues']:
        issues_by_type = defaultdict(list)
        for issue in report['issues']:
            issues_by_type[issue['type']].append(issue)
        
        lines.append('### Issues by Category')
        lines.append('')
        
        categories = [
            ('redirect-cycle', '🔄 Redirect Cycles'),
            ('not-implemented', '🚫 Not Implemented'),
            ('broken-link', '🔗 Broken Links'),
            ('empty-handler', '⚡ Empty Handlers'),
            ('empty-catch', '🕳️ Empty Catch Blocks'),
            ('placeholder-content', '📝 Placeholder Content'),
            ('todo-comment', '📌 TODO Comments'),
            ('missing-loading-state', '⏳ Missing Loading States'),
            ('missing-error-boundary', '🛡️ Missing Error Boundaries'),
            ('console-statement', '🖥️ Console Statements'),
            ('test-data', '🧪 Test Data'),
            ('commented-code', '💬 Commented Code'),
            ('dead-end', '🚷 Dead Ends'),
            ('orphan-route', '👻 Orphan Routes'),
            ('minimal-content', '📄 Minimal Content'),
        ]
        
        for issue_type, label in categories:
            if issue_type in issues_by_type:
                issues = issues_by_type[issue_type]
                lines.append(f'#### {label} ({len(issues)})')
                lines.append('')
                for issue in issues[:10]:
                    icon = {'error': '🔴', 'warning': '🟡', 'info': '🔵'}[issue['severity']]
                    lines.append(f"- {icon} {issue['message']}")
                    if issue['suggestion']:
                        lines.append(f"  - 💡 {issue['suggestion']}")
                    if issue.get('line_number'):
                        lines.append(f"  - 📍 Line {issue['line_number']}")
                if len(issues) > 10:
                    lines.append(f"  - *...and {len(issues) - 10} more*")
                lines.append('')
    
    lines.extend([
        '## Routes',
        '',
        '| Route | Elements | Dynamic | Layout | Loading | Error |',
        '|-------|----------|---------|--------|---------|-------|',
    ])
    
    for path, route in report['routes'].items():
        elements = len(route['elements'])
        dynamic = '✓' if route['is_dynamic'] else ''
        layout = '✓' if route['has_layout'] else ''
        loading = '✓' if route['has_loading'] else ''
        error = '✓' if route['has_error'] else ''
        lines.append(f"| `{path}` | {elements} | {dynamic} | {layout} | {loading} | {error} |")
    
    lines.extend([
        '',
        '## Interaction Graph',
        '',
        '```mermaid',
        report['mermaid'],
        '```'
    ])
    
    return '\n'.join(lines)


if __name__ == '__main__':
    main()
