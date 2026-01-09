#!/usr/bin/env python3
"""
Quick patch to update multi_platform_cycle.py to use working_cycle_agent
"""

from pathlib import Path

file_path = Path("/Users/ricknini/Downloads/helmv3/tools/continuous-improvement/multi_platform_cycle.py")

with open(file_path) as f:
    content = f.read()

# Replace the imports
content = content.replace(
    "from enhanced_cycle_agent import EnhancedCycleAgent",
    "from working_cycle_agent import WorkingCycleAgent"
)

content = content.replace(
    "EnhancedCycleAgent(",
    "WorkingCycleAgent("
)

with open(file_path, 'w') as f:
    f.write(content)

print("✅ Patched multi_platform_cycle.py to use WorkingCycleAgent")
