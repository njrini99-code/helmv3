#!/usr/bin/env python3
"""
VERIFY SPECIFIC CYCLE - Check if fixes in cycle-001 are actually done

Usage: python3 verify_cycle.py --project PATH --platform NAME --verify-cycle 1
"""

import re
from pathlib import Path


class CycleVerifier:
    """
    Verifies a specific cycle's fixes by reading actual files
    """
    
    def __init__(self, project_path: str, verify_cycle: int):
        self.project_path = Path(project_path)
        self.verify_cycle = verify_cycle
        self.helm_dir = self.project_path / ".helm"
        self.cycle_dir = self.helm_dir / "cycles"
        
    def parse_md_file(self) -> dict:
        """Parse the MD file for the cycle we're verifying"""
        md_file = self.cycle_dir / f"issues-cycle-{self.verify_cycle:03d}.md"
        
        if not md_file.exists():
            print(f"❌ File not found: {md_file}")
            return {}
        
        print(f"📄 Reading {md_file.name}...\n")
        
        with open(md_file) as f:
            content = f.read()
        
        fixes = {}
        sections = re.split(r'### FIX STATUS:\s*([A-Z]+-\d+)', content)
        
        for i in range(1, len(sections), 2):
            if i + 1 >= len(sections):
                break
                
            issue_id = sections[i].strip()
            status_content = sections[i + 1]
            
            # Check if marked as fixed
            is_fixed = (
                ('✅' in status_content and 'Fixed' in status_content) or
                'Status:** ✅ Fixed' in status_content or
                'Status: ✅ Fixed' in status_content
            )
            
            if not is_fixed:
                continue
            
            # Extract files modified
            files = []
            files_match = re.search(r'\*\*Files Modified:\*\*\s*(.*?)(?=\*\*|###|---)', status_content, re.DOTALL)
            if files_match:
                files_text = files_match.group(1)
                file_paths = re.findall(r'`([^`]+?\.(?:tsx?|jsx?|py|sql|json|md|css))`', files_text)
                files = [f.strip() for f in file_paths]
            
            # Extract changes made
            changes = []
            changes_match = re.search(r'\*\*Changes Made:\*\*\s*(.*?)(?=\*\*|###|---)', status_content, re.DOTALL)
            if changes_match:
                changes_text = changes_match.group(1)
                change_lines = re.findall(r'[-*]\s*(.+)', changes_text)
                changes = [c.strip() for c in change_lines if c.strip()]
            
            fixes[issue_id] = {
                'files': files,
                'changes': changes,
                'raw': status_content[:500]
            }
        
        return fixes
    
    def verify(self):
        """Verify all fixes"""
        
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔍 VERIFYING CYCLE {self.verify_cycle:03d} FIXES                                       ║
║   Reading actual files to check if changes were made                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        """)
        
        fixes = self.parse_md_file()
        
        if not fixes:
            print("❌ No fixes found to verify")
            return
        
        print(f"Found {len(fixes)} issues marked as fixed\n")
        print("="*80)
        print()
        
        verified = []
        not_fixed = []
        uncertain = []
        
        for issue_id, fix_info in fixes.items():
            files = fix_info['files']
            changes = fix_info['changes']
            
            print(f"📋 {issue_id}")
            print(f"   Documented files: {len(files)}")
            print(f"   Documented changes: {len(changes)}")
            
            if not files:
                print("   ⚠️  NO FILES DOCUMENTED")
                uncertain.append(issue_id)
                print()
                continue
            
            # Check each file
            files_exist = []
            files_missing = []
            changes_found = []
            
            for file_path in files:
                full_path = self.project_path / file_path
                
                if full_path.exists():
                    files_exist.append(file_path)
                    
                    # Read file and check for changes
                    try:
                        with open(full_path, 'r', encoding='utf-8') as f:
                            file_content = f.read().lower()
                        
                        # Check for keywords from changes
                        for change in changes:
                            keywords = self._extract_keywords(change)
                            for keyword in keywords:
                                if keyword in file_content:
                                    changes_found.append(f"{keyword} in {file_path}")
                                    break
                    except Exception:
                        pass
                else:
                    files_missing.append(file_path)
            
            # Print results
            if files_exist:
                print(f"   ✅ Files exist: {', '.join(files_exist)}")
            if files_missing:
                print(f"   ❌ Files missing: {', '.join(files_missing)}")
            if changes_found:
                print(f"   ✅ Changes detected: {len(changes_found)} keywords found")
            
            # Determine status
            if files_missing:
                print("   ❌ VERDICT: NOT FIXED (files missing)")
                not_fixed.append(issue_id)
            elif files_exist and changes_found:
                print("   ✅ VERDICT: VERIFIED (files + changes found)")
                verified.append(issue_id)
            elif files_exist:
                print("   ✅ VERDICT: LIKELY FIXED (files modified)")
                verified.append(issue_id)
            else:
                print("   ⚠️  VERDICT: UNCERTAIN")
                uncertain.append(issue_id)
            
            print()
        
        # Final summary
        print("="*80)
        print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   📊 VERIFICATION SUMMARY                                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

Total Issues Checked: {len(fixes)}

✅ VERIFIED: {len(verified)}
{self._format_list(verified)}

❌ NOT FIXED: {len(not_fixed)}
{self._format_list(not_fixed)}

⚠️  UNCERTAIN: {len(uncertain)}
{self._format_list(uncertain)}
        """)
    
    def _extract_keywords(self, text: str) -> list[str]:
        """Extract meaningful keywords"""
        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were'}
        
        words = re.findall(r'\w+', text.lower())
        keywords = [w for w in words if len(w) > 3 and w not in stopwords]
        
        return keywords[:5]
    
    def _format_list(self, items: list[str]) -> str:
        """Format list for display"""
        if not items:
            return "   (none)"
        return "\n".join([f"   - {item}" for item in items])


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Verify specific cycle fixes")
    parser.add_argument("--project", required=True, help="Project path")
    parser.add_argument("--verify-cycle", type=int, required=True, help="Cycle number to verify (e.g., 1)")
    
    args = parser.parse_args()
    
    verifier = CycleVerifier(args.project, args.verify_cycle)
    verifier.verify()


if __name__ == "__main__":
    main()
