"""
Helm Intelligence - UI/UX Auditor Agent
Specialized agent for React component analysis, accessibility, and design system compliance.
"""

from dataclasses import dataclass
from typing import Optional
from pathlib import Path

from agents.base import BaseAgent, Finding, AgentConfig
from config.settings import AgentRole, Models, Severity, Category, HelmConfig


# ============================================
# UI/UX AUDITOR SYSTEM PROMPT
# ============================================

UI_UX_AUDITOR_SYSTEM_PROMPT = """You are an expert UI/UX Auditor Agent for Helm Intelligence, specializing in React/Next.js component quality, accessibility, and design system compliance.

# Your Expertise
- React component architecture
- Accessibility (WCAG 2.1 AA compliance)
- Tailwind CSS best practices
- Design system implementation
- Performance optimization (bundle size, rendering)
- Animation and micro-interactions
- Responsive design patterns

# Codebase Context: Helm Sports Labs

## Design Philosophy
- **Inspiration**: Linear, Stripe, Vercel - premium SaaS aesthetics
- **Style**: Clean, minimal, functional with subtle glassmorphism
- **Quality Bar**: "Think Linear, Stripe, Vercel - not generic Bootstrap"

## Design System

### Colors
```
primary-600: '#16A34A'     // Kelly green - buttons, accents
primary-500: '#22c55e'     // Lighter green
cream: '#FFFEFA'           // Page background
glass-white: 'rgba(255,255,255,0.7)'
warm-900: '#1c1917'        // Primary text
warm-500: '#78716c'        // Secondary text
```

### Glassmorphism Pattern
```
// Standard glass card
bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass

// Hover state
hover:bg-white/80 hover:shadow-card-hover transition-all duration-200

// Dark glass (modals, overlays)
bg-warm-900/97 backdrop-blur-xl
```

### Typography
```
h1: 'text-3xl font-semibold text-warm-900'     // 30px
h2: 'text-2xl font-semibold text-warm-900'     // 24px
h3: 'text-xl font-medium text-warm-900'        // 20px
body: 'text-base text-warm-700'                // 16px
small: 'text-sm text-warm-500'                 // 14px
```

### Spacing & Radius
```
Card padding: p-6 or p-8
Card radius: rounded-2xl (20px)
Button radius: rounded-lg (14px)
Input radius: rounded-md (10px)
Gap between cards: gap-6
```

## Component Structure
```
src/components/
├── ui/           # Primitives: Button, Input, Card, Modal, GlassCard
├── baseball/     # Baseball-specific components
├── golf/         # Golf-specific components
├── shared/       # Cross-product components
└── features/     # Feature components (PlayerCard, etc.)
```

## Quality Standards
- **Loading States**: Skeleton loaders, not spinners
- **Empty States**: Helpful, actionable messages
- **Error Handling**: User-friendly messages
- **Animations**: Subtle, purposeful (Framer Motion)
- **Accessibility**: Proper labels, keyboard navigation, focus management

# Audit Categories

## 1. Accessibility (Critical)
- Missing alt text on images
- Missing form labels
- Missing ARIA attributes
- Poor color contrast
- Missing keyboard navigation
- Missing focus indicators
- Incorrect heading hierarchy
- Missing skip links
- Non-semantic HTML

## 2. Design System Compliance
- Incorrect color usage (not using design tokens)
- Inconsistent spacing
- Wrong border radius values
- Missing glassmorphism where expected
- Inconsistent typography
- Wrong hover/focus states

## 3. Component Quality
- Components too large (>200 lines)
- Missing prop types/interfaces
- Inline styles instead of Tailwind
- Magic numbers/strings
- Missing loading states
- Missing error states
- Missing empty states

## 4. Performance
- Large components without code splitting
- Missing React.memo on list items
- Inline object/function creation in JSX
- Missing image optimization (next/image)
- Unnecessary re-renders
- Large bundle imports

## 5. Responsive Design
- Missing mobile breakpoints
- Fixed widths that break on mobile
- Touch targets too small (<44px)
- Text too small on mobile

# Output Format
For each finding:
- Severity: critical | high | medium | low
- Category: accessibility | ui_consistency | performance | code_quality
- Location: { file, component, line }
- Evidence: Code snippet or screenshot description
- Suggested fix: Concrete code example

Use tools to analyze components and provide actionable findings.
"""


# ============================================
# UI/UX AUDITOR AGENT
# ============================================

class UIUXAuditorAgent(BaseAgent):
    """
    Specialized agent for UI/UX analysis.
    MAXIMUM POWER MODE - Full context, comprehensive accessibility audit.
    """
    
    def __init__(self, helm_config: Optional[HelmConfig] = None):
        config = AgentConfig(
            role=AgentRole.UI_UX_AUDITOR,
            model=Models.SPECIALIST,
            system_prompt=UI_UX_AUDITOR_SYSTEM_PROMPT,
            tools=[
                "read_file",
                "list_directory",
                "search_files",
                "grep_pattern",
                "analyze_component",
                "check_a11y",
                "measure_component_size",
            ],
            max_turns=100,
            temperature=0.0,
            thinking_budget=0,        # Disabled for API compatibility
            max_output_tokens=16384,  # Full output capacity
        )
        super().__init__(config)
        self.helm_config = helm_config or HelmConfig()
    
    async def execute_task(self, task: str, context: dict) -> dict:
        """Execute the UI/UX audit task."""
        async for event in self.run(task, context):
            if event["type"] == "complete":
                break
        
        return {
            "agent_id": self.agent_id,
            "findings": [f.to_dict() for f in self.findings],
            "stats": self.get_stats(),
        }
    
    async def audit_accessibility(self) -> list[Finding]:
        """Comprehensive accessibility audit."""
        task = """Perform a comprehensive accessibility (a11y) audit:

1. **Image Alt Text**
   Search for: <img without alt, <Image without alt
   Check: All images have meaningful alt text (not just "image" or "photo")

2. **Form Labels**
   Search for: <input, <select, <textarea without associated <label
   Check: htmlFor matches id, aria-label or aria-labelledby present

3. **Heading Hierarchy**
   Check: h1 → h2 → h3 (no skipping levels)
   Each page should have exactly one h1

4. **Button/Link Accessibility**
   Check: All buttons have accessible text
   Links have meaningful text (not "click here")
   Icon-only buttons have aria-label

5. **Color Contrast**
   Check: Text meets WCAG AA contrast ratios
   - Normal text: 4.5:1
   - Large text: 3:1
   Verify: warm-500 (#78716c) on white background

6. **Focus Management**
   Check: Focus visible on all interactive elements
   Tab order is logical
   Focus traps in modals

7. **ARIA Usage**
   Check: ARIA roles used correctly
   aria-hidden not hiding focusable elements
   Live regions for dynamic content

8. **Semantic HTML**
   Check: <nav>, <main>, <header>, <footer>, <section> used appropriately
   Lists use <ul>, <ol> properly
   Tables have proper headers

Start with src/components/ and audit all React components.
For each violation, note the file, line, and provide the fix.
"""
        await self.execute_task(task, {})
        return self.findings
    
    async def audit_design_system(self) -> list[Finding]:
        """Design system compliance audit."""
        task = """Audit design system compliance:

1. **Color Usage**
   Search for: hex colors, rgb values, hardcoded colors
   Should use: primary-600, primary-500, warm-900, warm-500, etc.
   Flag: Any color not in the design system

2. **Glassmorphism Consistency**
   Check: Glass cards use correct pattern:
   - bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass
   Flag: Inconsistent implementations

3. **Typography**
   Check: Headings use correct classes
   - h1: text-3xl font-semibold text-warm-900
   - h2: text-2xl font-semibold text-warm-900
   - h3: text-xl font-medium text-warm-900
   Flag: Custom font sizes or weights

4. **Spacing**
   Check: Consistent gap, padding, margin values
   - Card padding: p-6 or p-8
   - Gap between cards: gap-6
   Flag: Magic numbers like gap-7 or p-5

5. **Border Radius**
   Check: Correct radius values
   - Cards: rounded-2xl
   - Buttons: rounded-lg
   - Inputs: rounded-md
   Flag: Inconsistent radius

6. **Hover/Focus States**
   Check: All interactive elements have states
   - hover:bg-white/80 hover:shadow-card-hover
   - transition-all duration-200
   Flag: Missing transitions, inconsistent hovers

7. **Component Patterns**
   Check: Using shared components from ui/
   - Button (not custom buttons)
   - GlassCard (not ad-hoc glass styling)
   - Input, Select (not native elements)
   Flag: Re-implemented primitives

Scan src/components and src/app for violations.
"""
        await self.execute_task(task, {})
        return self.findings
    
    async def audit_component_quality(self) -> list[Finding]:
        """Component quality and patterns audit."""
        task = """Audit React component quality:

1. **Component Size**
   Flag: Components > 200 lines
   Recommendation: Split into smaller, focused components

2. **Loading States**
   Check: All async components have loading states
   Should use: Skeleton loaders (not spinners)
   Check: Suspense boundaries present

3. **Empty States**
   Check: Lists/tables handle empty data gracefully
   Should have: Helpful message + action CTA

4. **Error States**
   Check: Error boundaries present
   Check: User-friendly error messages (not technical errors)

5. **Prop Types**
   Check: All props have TypeScript interfaces
   Flag: `any` types, missing interfaces

6. **Performance Issues**
   Flag: Inline object creation in JSX props
   - style={{...}}
   - onClick={() => {...}} in loops
   Flag: Missing React.memo on list items
   Flag: Missing useCallback/useMemo where needed

7. **Import Patterns**
   Flag: Large library imports (import entire lodash)
   Should use: Tree-shakeable imports

8. **Animation Quality**
   Check: Framer Motion used consistently
   Check: Animations are subtle and purposeful
   Flag: CSS animations that should be Framer

9. **Responsive Design**
   Check: Mobile breakpoints present (sm:, md:, lg:)
   Check: Touch targets >= 44px
   Check: Text readable on mobile

Focus on src/components/ directory.
"""
        await self.execute_task(task, {})
        return self.findings
    
    async def audit_file(self, filepath: str) -> list[Finding]:
        """Audit a specific component file."""
        task = f"""Thoroughly audit this component file:

File: {filepath}

Check ALL of the following:

1. ACCESSIBILITY
   - All images have alt text
   - Form elements have labels
   - Buttons/links have accessible names
   - Heading hierarchy is correct
   - ARIA attributes used properly

2. DESIGN SYSTEM
   - Colors from design tokens
   - Correct typography classes
   - Proper glassmorphism pattern
   - Correct spacing and radius

3. COMPONENT QUALITY
   - Size under 200 lines
   - Props properly typed
   - Loading/empty/error states
   - No inline object creation in JSX

4. PERFORMANCE
   - Proper memoization
   - Code splitting where needed
   - Optimized imports

5. RESPONSIVE
   - Mobile breakpoints
   - Touch targets
   - Readable text

Read the file and provide detailed findings with line numbers.
"""
        await self.execute_task(task, {})
        return self.findings
    
    async def generate_report(self) -> dict:
        """Generate a comprehensive UI/UX audit report."""
        task = """Generate a comprehensive UI/UX audit report:

1. **Executive Summary**
   - Overall design system compliance score
   - Accessibility score
   - Critical issues count

2. **Accessibility Findings**
   - Critical: Missing alt text, form labels
   - High: Color contrast issues
   - Medium: Heading hierarchy issues

3. **Design System Findings**
   - Violations of color system
   - Inconsistent glassmorphism
   - Typography deviations

4. **Component Quality**
   - Large components to refactor
   - Missing states (loading/empty/error)
   - Performance issues

5. **Recommendations**
   - Prioritized list of fixes
   - Quick wins (automatable)
   - Larger refactoring efforts

Output a structured report suitable for the development team.
"""
        result = await self.execute_task(task, {})
        return {
            "report": result,
            "findings": [f.to_dict() for f in self.findings],
            "stats": self.get_stats(),
        }


# ============================================
# A11Y CHECK HELPERS
# ============================================

def check_image_alt(content: str, filepath: str) -> list[Finding]:
    """Check for images missing alt text."""
    findings = []
    
    # Check for img tags without alt
    import re
    img_tags = re.findall(r'<img[^>]*>', content)
    for img in img_tags:
        if 'alt=' not in img or 'alt=""' in img:
            findings.append(Finding(
                category=Category.ACCESSIBILITY,
                severity=Severity.CRITICAL,
                title="Image missing alt text",
                description="Images must have descriptive alt text for screen readers",
                location={"file": filepath},
                evidence=img[:100],
                suggested_fix='Add meaningful alt text: alt="Description of image"',
                automatable=False,
            ))
    
    # Check for Next.js Image without alt
    next_images = re.findall(r'<Image[^>]*>', content)
    for img in next_images:
        if 'alt=' not in img:
            findings.append(Finding(
                category=Category.ACCESSIBILITY,
                severity=Severity.CRITICAL,
                title="Next.js Image missing alt text",
                description="All images must have alt text",
                location={"file": filepath},
                evidence=img[:100],
                suggested_fix='Add alt prop: alt="Description"',
                automatable=False,
            ))
    
    return findings


def check_form_labels(content: str, filepath: str) -> list[Finding]:
    """Check for form elements missing labels."""
    findings = []
    
    import re
    # Find inputs without associated labels
    inputs = re.findall(r'<input[^>]*>', content)
    for inp in inputs:
        has_label = any(attr in inp for attr in ['aria-label=', 'aria-labelledby=', 'id='])
        if not has_label:
            findings.append(Finding(
                category=Category.ACCESSIBILITY,
                severity=Severity.HIGH,
                title="Form input missing label",
                description="Inputs must have associated labels for accessibility",
                location={"file": filepath},
                evidence=inp[:80],
                suggested_fix='Add aria-label or connect with <label htmlFor="id">',
                automatable=False,
            ))
    
    return findings


def check_button_accessibility(content: str, filepath: str) -> list[Finding]:
    """Check buttons for accessible names."""
    findings = []
    
    import re
    # Find icon-only buttons
    icon_buttons = re.findall(r'<button[^>]*>[\s]*<[^/][^>]*Icon[^>]*>[\s]*</button>', content)
    for btn in icon_buttons:
        if 'aria-label=' not in btn:
            findings.append(Finding(
                category=Category.ACCESSIBILITY,
                severity=Severity.HIGH,
                title="Icon-only button missing accessible name",
                description="Buttons with only icons must have aria-label",
                location={"file": filepath},
                evidence=btn[:80],
                suggested_fix='Add aria-label="Button description"',
                automatable=False,
            ))
    
    return findings


def check_design_tokens(content: str, filepath: str) -> list[Finding]:
    """Check for hardcoded colors instead of design tokens."""
    findings = []
    
    import re
    # Find hex colors
    hex_colors = re.findall(r'#[0-9A-Fa-f]{3,6}', content)
    # Allowed design system colors
    allowed = ['#16A34A', '#22c55e', '#FFFEFA', '#1c1917', '#78716c']
    
    for color in hex_colors:
        if color.upper() not in [c.upper() for c in allowed]:
            findings.append(Finding(
                category=Category.UI_CONSISTENCY,
                severity=Severity.MEDIUM,
                title="Hardcoded color outside design system",
                description="Use Tailwind design tokens instead of hardcoded colors",
                location={"file": filepath},
                evidence=f"Found: {color}",
                suggested_fix="Use Tailwind classes: primary-600, warm-900, etc.",
                automatable=True,
            ))
    
    return findings


def check_glassmorphism(content: str, filepath: str) -> list[Finding]:
    """Check for inconsistent glassmorphism implementation."""
    findings = []
    
    # Standard glassmorphism pattern
    standard_pattern = "bg-white/70 backdrop-blur-xl"
    
    if 'backdrop-blur' in content:
        # Check if using non-standard blur values
        if 'backdrop-blur-xl' not in content and 'backdrop-blur-sm' not in content:
            findings.append(Finding(
                category=Category.UI_CONSISTENCY,
                severity=Severity.LOW,
                title="Non-standard backdrop blur",
                description="Use standard glassmorphism: backdrop-blur-xl",
                location={"file": filepath},
                evidence="Uses non-standard backdrop-blur value",
                suggested_fix="Use backdrop-blur-xl for consistency",
                automatable=True,
            ))
    
    return findings
