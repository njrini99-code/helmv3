#!/usr/bin/env python3
"""
WORKAROUND: Manually update cycle-001 JSON with fixes from MD file

This reads the MD file Claude Code updated and marks issues as "fixed" in the JSON
"""

import json
import re
from pathlib import Path

project_path = Path("/Users/ricknini/Downloads/helmv3")
cycles_dir = project_path / ".helm" / "cycles"

# Read the MD file
md_file = cycles_dir / "issues-cycle-001.md"
json_file = cycles_dir / "issues-cycle-001.json"

print("Reading MD file to find fixes...")
with open(md_file) as f:
    md_content = f.read()

# Find all FIX STATUS sections that are marked as fixed
fixed_issues = []
sections = re.split(r'### FIX STATUS: ([A-Z]+-\d+)', md_content)

for i in range(1, len(sections), 2):
    if i + 1 >= len(sections):
        break
        
    issue_id = sections[i]
    status_content = sections[i + 1]
    
    # Look for Status line with checkmark
    if '✅' in status_content and 'Fixed' in status_content:
        fixed_issues.append(issue_id)
        print(f"  ✅ {issue_id}: Marked as fixed")

print(f"\nFound {len(fixed_issues)} issues marked as fixed in MD file")

# Update the JSON file
print("\nUpdating JSON file...")
with open(json_file) as f:
    cycle_data = json.load(f)

updated_count = 0
for issue in cycle_data['issues']:
    if issue['id'] in fixed_issues:
        issue['state'] = 'fixed'
        issue['fixed_in_cycle'] = 1
        updated_count += 1

# Save updated JSON
with open(json_file, 'w') as f:
    json.dump(cycle_data, f, indent=2)

print(f"✅ Updated {updated_count} issues in JSON file")
print("\nNow run cycle 2:")
print("bash /Users/ricknini/Downloads/helmv3/tools/continuous-improvement/run-now.sh")
