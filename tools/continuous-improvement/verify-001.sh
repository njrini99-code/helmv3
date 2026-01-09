#!/bin/bash
#
# VERIFY CYCLE 001 FIXES
#
# This reads cycle-001 and checks if the documented fixes were actually made
#

cd /Users/ricknini/Downloads/helmv3/tools/continuous-improvement

python3 verify_cycle.py \
  --project /Users/ricknini/Downloads/helmv3 \
  --verify-cycle 1

echo ""
echo "✅ Verification complete!"
