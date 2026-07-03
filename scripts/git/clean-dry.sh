#!/usr/bin/env bash
set -euo pipefail

echo "## Untracked Non-Ignored Files"
git clean -nd

echo
echo "## Ignored Removable Paths"
git clean -Xdn

echo
echo "## Targeted Cleanup Candidates"
for path in .next playwright-report test-results .playwright-mcp .helmdev docs/audits/generated; do
  if [ -e "$path" ]; then
    size="$(du -sh "$path" 2>/dev/null | awk '{print $1}')"
    echo "$path	$size"
  else
    echo "$path	absent"
  fi
done

echo
echo "No files were removed. Review the dry-run output before deleting caches."
