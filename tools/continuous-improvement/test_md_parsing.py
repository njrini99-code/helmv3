#!/usr/bin/env python3
"""
Test the MD parsing fix

This script tests if the agent can properly read Claude Code's fixes from the MD file
"""

import re
from pathlib import Path

def test_md_parsing():
    """Test MD file parsing"""
    
    project_path = Path("/Users/ricknini/Downloads/helmv3")
    md_file = project_path / ".helm" / "cycles" / "issues-cycle-001.md"
    
    if not md_file.exists():
        print("❌ No MD file found at:", md_file)
        return False
    
    print("✅ Found MD file")
    print(f"   {md_file}")
    print()
    
    with open(md_file) as f:
        content = f.read()
    
    # Find all FIX STATUS sections
    fixes = {}
    sections = re.split(r'### FIX STATUS:\s*([A-Z]+-\d+)', content)
    
    print("🔍 Scanning for FIX STATUS sections...")
    print()
    
    for i in range(1, len(sections), 2):
        if i + 1 >= len(sections):
            break
            
        issue_id = sections[i].strip()
        status_content = sections[i + 1]
        
        # Check if marked as fixed
        if ('✅' in status_content and 'Fixed' in status_content) or \
           ('**Status:** Fixed' in status_content) or \
           ('Status: Fixed' in status_content):
            fixes[issue_id] = True
            print(f"  ✅ {issue_id}: Marked as FIXED")
        else:
            print(f"  ⏳ {issue_id}: Not started or in progress")
    
    print()
    print("="*60)
    print(f"📊 RESULTS:")
    print(f"   Total issues with FIX STATUS sections: {len(sections) // 2}")
    print(f"   Issues marked as ✅ Fixed: {len(fixes)}")
    print("="*60)
    print()
    
    if len(fixes) == 0:
        print("⚠️  No fixes found!")
        print()
        print("This means either:")
        print("  1. Claude Code hasn't fixed anything yet")
        print("  2. Claude Code didn't update FIX STATUS sections")
        print()
        print("Tell Claude Code to update each FIX STATUS with:")
        print('  **Status:** ✅ Fixed')
        print()
        return False
    else:
        print("✅ FIX DETECTION WORKING!")
        print()
        print("The cycle agent will be able to verify these fixes.")
        print("Run cycle 2 to see the verification in action:")
        print()
        print("  bash run-now.sh")
        print()
        return True

if __name__ == "__main__":
    success = test_md_parsing()
    exit(0 if success else 1)
