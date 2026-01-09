#!/usr/bin/env python3
"""
Helm Intelligence - Overnight Deep Analysis
Run this before bed, wake up to comprehensive documentation.

Usage:
    python overnight.py --baseballhelm ~/baseballhelm --golfhelm ~/golfhelm
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Prompts
from core.deep_prompts import (
    DEEP_UNDERSTANDING_PROMPT,
    DEEP_ESSAY_PROMPT,
    DEEP_FEATURE_SPEC_PROMPT,
    DEEP_RLS_PROMPT,
    DEEP_CROSS_REFERENCE_PROMPT
)


class OvernightAnalyzer:
    """
    Deep, thorough analysis designed to run for 1-2 hours per platform
    and produce genuinely useful documentation.
    """
    
    def __init__(self, project_path: str, platform_name: str):
        self.project_path = Path(project_path)
        self.platform_name = platform_name
        self.helm_dir = self.project_path / ".helm"
        self.helm_dir.mkdir(parents=True, exist_ok=True)
        
        # Knowledge accumulator
        self.understanding: dict = {}
        self.features: list = []
        self.issues: list = []
        
    async def run_deep_understanding(self):
        """Phase 1: Build comprehensive understanding of the codebase"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  📚 PHASE 1: DEEP UNDERSTANDING                                              ║
║  Platform: {self.platform_name:<63} ║
║                                                                              ║
║  This phase reads the entire codebase to build a mental model.               ║
║  Expected time: 15-30 minutes                                                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=200,  # Allow thorough exploration
        )
        
        prompt = f"""
        You are analyzing {self.platform_name} at {self.project_path}
        
        {DEEP_UNDERSTANDING_PROMPT}
        
        Take your time. This analysis is worth $5-10 - make it count.
        Read files thoroughly. Trace code paths. Build real understanding.
        
        Start now.
        """
        
        output_parts = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text)
                        output_parts.append(block.text)
        
        # Extract and save understanding
        full_output = "\n".join(output_parts)
        self.understanding = self._extract_json(full_output) or {"raw_output": full_output}
        self.features = self.understanding.get("features", [])
        
        # Save
        with open(self.helm_dir / "UNDERSTANDING.json", "w") as f:
            json.dump(self.understanding, f, indent=2)
        
        # Also save raw output for reference
        with open(self.helm_dir / "understanding_raw.txt", "w") as f:
            f.write(full_output)
        
        print(f"\n✅ Understanding saved to {self.helm_dir}/UNDERSTANDING.json")
        return self.understanding
    
    async def run_deep_essay(self):
        """Phase 2: Write comprehensive technical essay"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  📝 PHASE 2: PLATFORM ESSAY                                                  ║
║  Writing comprehensive technical documentation                               ║
║                                                                              ║
║  Expected time: 20-40 minutes                                                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
            permission_mode="default",
            max_turns=150,
        )
        
        # Include understanding as context
        context = json.dumps(self.understanding, indent=2)[:10000]  # Truncate if huge
        
        prompt = f"""
        You are writing the definitive technical essay for {self.platform_name}.
        
        You've already built this understanding:
        ```json
        {context}
        ```
        
        {DEEP_ESSAY_PROMPT}
        
        Write the complete essay now. Be thorough and specific.
        Reference actual file paths and code.
        This document will be used for months.
        """
        
        output_parts = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text[-1000:] if len(block.text) > 1000 else block.text)
                        output_parts.append(block.text)
        
        essay = self._extract_markdown("\n".join(output_parts))
        
        # Save essay
        essay_path = self.helm_dir / f"{self.platform_name.upper()}_ESSAY.md"
        with open(essay_path, "w") as f:
            f.write(essay)
        
        print(f"\n✅ Essay saved to {essay_path}")
        return essay
    
    async def run_deep_feature_specs(self):
        """Phase 3: Document every feature with detailed specs"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        features = self.understanding.get("features", [])
        if not features:
            print("⚠️  No features identified. Using generic scan.")
            features = [{"name": "Full Application", "primary_files": []}]
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  📋 PHASE 3: FEATURE SPECIFICATIONS                                          ║
║  Documenting {len(features)} features with detailed specs                            ║
║                                                                              ║
║  Expected time: 30-60 minutes                                                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        all_issues = []
        
        for i, feature in enumerate(features):
            feature_name = feature.get("name", f"Feature {i+1}")
            
            print(f"\n[{i+1}/{len(features)}] Documenting: {feature_name}")
            print("-" * 60)
            
            # Determine spec location
            primary_files = feature.get("primary_files", feature.get("all_files", []))
            if primary_files and len(primary_files) > 0:
                primary_file = Path(primary_files[0])
                if primary_file.suffix in ['.tsx', '.ts', '.jsx', '.js']:
                    spec_path = self.project_path / primary_file.with_suffix('.spec.md')
                else:
                    spec_path = self.project_path / primary_file.parent / f"{feature_name.lower().replace(' ', '-')}.spec.md"
            else:
                spec_path = self.helm_dir / "features" / f"{feature_name.lower().replace(' ', '-')}.spec.md"
            
            options = ClaudeAgentOptions(
                cwd=str(self.project_path),
                allowed_tools=["Read", "Bash", "Glob", "Grep", "LS"],
                permission_mode="default",
                max_turns=75,
            )
            
            prompt = f"""
            Document the "{feature_name}" feature of {self.platform_name}.
            
            Feature info from initial analysis:
            ```json
            {json.dumps(feature, indent=2)}
            ```
            
            Platform context:
            ```json
            {json.dumps({k: v for k, v in self.understanding.items() if k != 'features'}, indent=2)[:3000]}
            ```
            
            {DEEP_FEATURE_SPEC_PROMPT}
            
            The spec will be saved to: {spec_path}
            
            Be thorough. Read all relevant files. Trace code paths.
            Document what SHOULD work and what ACTUALLY works.
            List every issue you find with specific file locations.
            """
            
            output_parts = []
            
            async for message in query(prompt=prompt, options=options):
                if hasattr(message, 'content'):
                    for block in message.content:
                        if hasattr(block, 'text'):
                            # Truncate output for readability
                            preview = block.text[-500:] if len(block.text) > 500 else block.text
                            print(preview)
                            output_parts.append(block.text)
            
            spec_content = self._extract_markdown("\n".join(output_parts))
            
            # Ensure directory exists
            spec_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Save spec
            with open(spec_path, "w") as f:
                f.write(spec_content)
            
            print(f"✅ Spec saved: {spec_path}")
            
            # Extract issues from spec
            feature_issues = self._extract_issues(spec_content, feature_name)
            all_issues.extend(feature_issues)
        
        self.issues = all_issues
        return all_issues
    
    async def run_deep_rls_audit(self):
        """Phase 4: Comprehensive RLS security audit"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  🔐 PHASE 4: RLS SECURITY AUDIT                                              ║
║  Deep analysis of all database security policies                             ║
║                                                                              ║
║  Expected time: 20-40 minutes                                                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        security_dir = self.helm_dir / "security"
        security_dir.mkdir(parents=True, exist_ok=True)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Write", "Bash", "Glob", "Grep", "LS"],
            permission_mode="acceptEdits",  # Allow writing fix migration
            max_turns=200,
        )
        
        context = json.dumps(self.understanding, indent=2)[:5000]
        
        prompt = f"""
        Perform a comprehensive RLS security audit on {self.platform_name}.
        
        Application context:
        ```json
        {context}
        ```
        
        {DEEP_RLS_PROMPT}
        
        Save outputs to:
        - {security_dir}/RLS_AUDIT.md (full report)
        - {security_dir}/vulnerabilities.json (structured data)
        - {security_dir}/policy_matrix.md (access matrix)
        - supabase/migrations/[timestamp]_rls_fixes.sql (if fixes needed)
        
        Be paranoid. Think like an attacker. Miss nothing.
        """
        
        output_parts = []
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text)
                        output_parts.append(block.text)
        
        # Save raw output
        with open(security_dir / "audit_log.txt", "w") as f:
            f.write("\n".join(output_parts))
        
        print(f"\n✅ Security audit saved to {security_dir}/")
        
        return {"output_dir": str(security_dir)}
    
    async def run_synthesis(self):
        """Phase 5: Cross-reference and create action items"""
        from claude_agent_sdk import query, ClaudeAgentOptions
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  🔄 PHASE 5: SYNTHESIS & ACTION ITEMS                                        ║
║  Consolidating all findings into actionable work items                       ║
║                                                                              ║
║  Expected time: 15-30 minutes                                                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        options = ClaudeAgentOptions(
            cwd=str(self.project_path),
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "LS"],
            permission_mode="acceptEdits",
            max_turns=100,
        )
        
        prompt = f"""
        Synthesize all analysis for {self.platform_name}.
        
        You have:
        - Platform understanding in {self.helm_dir}/UNDERSTANDING.json
        - Technical essay in {self.helm_dir}/{self.platform_name.upper()}_ESSAY.md
        - Feature specs in *.spec.md files
        - Security audit in {self.helm_dir}/security/
        
        {DEEP_CROSS_REFERENCE_PROMPT}
        
        Create these files:
        1. {self.helm_dir}/ACTIONS.md - Prioritized action items (THE file to work from)
        2. {self.helm_dir}/ISSUES.md - All issues consolidated
        3. {self.helm_dir}/DEPENDENCIES.md - Feature dependency graph
        
        Update any specs that need cross-references added.
        
        Make ACTIONS.md incredibly actionable:
        - Clear priorities
        - Time estimates
        - File locations
        - Copy-paste test commands
        """
        
        async for message in query(prompt=prompt, options=options):
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text'):
                        print(block.text)
        
        print(f"\n✅ Synthesis complete. Check {self.helm_dir}/ACTIONS.md for work items.")
    
    async def run_full_analysis(self):
        """Run the complete overnight analysis pipeline"""
        
        start_time = datetime.now()
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                  ║
║   🌙 HELM INTELLIGENCE - OVERNIGHT DEEP ANALYSIS                                 ║
║                                                                                  ║
║   Platform: {self.platform_name:<67} ║
║   Path: {str(self.project_path):<71} ║
║   Started: {start_time.strftime('%Y-%m-%d %H:%M:%S'):<66} ║
║                                                                                  ║
║   This will run for 1-2 hours and produce:                                       ║
║   • Complete application understanding                                           ║
║   • 4000-6000 word technical essay                                               ║
║   • Detailed spec for every feature                                              ║
║   • RLS security audit with fixes                                                ║
║   • Prioritized action items                                                     ║
║                                                                                  ║
║   Estimated cost: $8-15                                                          ║
║                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝
        """)
        
        try:
            # Phase 1
            await self.run_deep_understanding()
            
            # Phase 2
            await self.run_deep_essay()
            
            # Phase 3
            await self.run_deep_feature_specs()
            
            # Phase 4
            await self.run_deep_rls_audit()
            
            # Phase 5
            await self.run_synthesis()
            
        except Exception as e:
            print(f"\n❌ Error during analysis: {e}")
            raise
        
        end_time = datetime.now()
        duration = end_time - start_time
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                  ║
║   ✅ ANALYSIS COMPLETE                                                           ║
║                                                                                  ║
║   Duration: {str(duration).split('.')[0]:<67} ║
║   Completed: {end_time.strftime('%Y-%m-%d %H:%M:%S'):<65} ║
║                                                                                  ║
║   📁 Outputs in {str(self.helm_dir):<61} ║
║                                                                                  ║
║   Key files:                                                                     ║
║   • ACTIONS.md        ← START HERE - prioritized work items                      ║
║   • {self.platform_name.upper()}_ESSAY.md    ← Complete technical documentation              ║
║   • UNDERSTANDING.json ← Structured app knowledge                                ║
║   • ISSUES.md          ← All issues consolidated                                 ║
║   • security/          ← RLS audit and fixes                                     ║
║   • *.spec.md          ← Feature specs (alongside code)                          ║
║                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝
        """)
    
    def _extract_json(self, text: str) -> Optional[dict]:
        """Extract JSON from text"""
        import re
        json_pattern = r'```json\s*(.*?)\s*```'
        matches = re.findall(json_pattern, text, re.DOTALL)
        for match in reversed(matches):  # Try last match first (usually most complete)
            try:
                return json.loads(match)
            except:
                continue
        return None
    
    def _extract_markdown(self, text: str) -> str:
        """Extract markdown content from agent output"""
        import re
        
        # Try to find markdown block
        md_pattern = r'```markdown\s*(.*?)\s*```'
        matches = re.findall(md_pattern, text, re.DOTALL)
        if matches:
            return matches[-1]
        
        # Look for content starting with # header
        lines = text.split('\n')
        content_lines = []
        in_content = False
        
        for line in lines:
            if line.startswith('# ') and not in_content:
                in_content = True
            if in_content:
                content_lines.append(line)
        
        return '\n'.join(content_lines) if content_lines else text
    
    def _extract_issues(self, spec_content: str, feature_name: str) -> list:
        """Extract issues from a spec file"""
        import re
        issues = []
        
        # Look for issue patterns
        issue_pattern = r'(?:ISSUE-\d+|🔴|🟠|🟡|🟢)[:\s]+([^\n]+)'
        matches = re.findall(issue_pattern, spec_content)
        
        for match in matches:
            issues.append({
                "feature": feature_name,
                "title": match.strip()[:100]
            })
        
        return issues


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Helm Intelligence - Overnight Deep Analysis",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Analyze BaseballHelm
    python overnight.py --baseballhelm ~/projects/baseballhelm
    
    # Analyze both platforms
    python overnight.py --baseballhelm ~/baseballhelm --golfhelm ~/golfhelm
    
    # Analyze single platform with custom name
    python overnight.py --project ~/myapp --name "MyApp"
        """
    )
    
    parser.add_argument("--baseballhelm", help="Path to BaseballHelm project")
    parser.add_argument("--golfhelm", help="Path to GolfHelm project")
    parser.add_argument("--project", help="Path to any project")
    parser.add_argument("--name", default="app", help="Platform name (for --project)")
    
    args = parser.parse_args()
    
    platforms = []
    
    if args.baseballhelm:
        platforms.append(("baseballhelm", args.baseballhelm))
    if args.golfhelm:
        platforms.append(("golfhelm", args.golfhelm))
    if args.project:
        platforms.append((args.name, args.project))
    
    if not platforms:
        print("❌ Specify at least one project:")
        print("   --baseballhelm PATH")
        print("   --golfhelm PATH")
        print("   --project PATH --name NAME")
        sys.exit(1)
    
    for platform_name, project_path in platforms:
        analyzer = OvernightAnalyzer(project_path, platform_name)
        await analyzer.run_full_analysis()


if __name__ == "__main__":
    asyncio.run(main())
