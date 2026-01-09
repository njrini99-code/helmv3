#!/usr/bin/env python3
"""
Quick fix script to add MD parsing method

This adds the ability to read what Claude Code documented in the MD file
"""

MD_PARSER_CODE = '''
def _parse_md_file_for_fixes(self, cycle_number: int) -> Dict[str, str]:
    """
    Parse the MD file to see which issues Claude Code claimed to fix.
    Returns: {issue_id: fix_documentation}
    """
    md_file = self.cycle_dir / f"issues-cycle-{cycle_number:03d}.md"
    
    if not md_file.exists():
        return {}
    
    with open(md_file) as f:
        content = f.read()
    
    # Find all FIX STATUS sections
    fixes = {}
    
    # Split by FIX STATUS sections
    sections = re.split(r'### FIX STATUS: ([A-Z]+-\d+)', content)
    
    for i in range(1, len(sections), 2):
        if i + 1 >= len(sections):
            break
            
        issue_id = sections[i]
        status_content = sections[i + 1]
        
        # Look for Status line with checkmark
        if '✅' in status_content or 'Status:** ✅ Fixed' in status_content or 'Status: ✅ Fixed' in status_content:
            # Extract fix details for verification
            fixes[issue_id] = status_content[:2000]  # Get first 2000 chars
    
    return fixes
'''

print("Add this method to EnhancedCycleAgent class:")
print()
print(MD_PARSER_CODE)
print()
print("=" * 80)
print()

VERIFY_FIX = '''
# In verify_previous_fixes, BEFORE loading prev_issues:

# Parse MD file to see what Claude Code claimed to fix
md_fixes = self._parse_md_file_for_fixes(self.current_cycle - 1)

if not md_fixes:
    print("⚠️  No fixes documented in MD file")
    print("   Claude Code needs to update FIX STATUS sections")
    return

print(f"Found {len(md_fixes)} issues marked as ✅ Fixed in MD file")

# Update issue states based on MD file
fixed_issues = []
for issue in prev_issues:
    if issue.id in md_fixes:
        issue.state = "fixed"
        issue.fix_details = md_fixes[issue.id]
        issue.fixed_in_cycle = self.current_cycle - 1
        fixed_issues.append(issue)
'''

print("Update verify_previous_fixes method:")
print()
print(VERIFY_FIX)
