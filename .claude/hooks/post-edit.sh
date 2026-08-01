#!/usr/bin/env bash
# PostToolUse / Write|Edit|MultiEdit — autofix + feed back the silent-failure
# patterns that lint cannot see.
#
# One script (one process spawn) doing two jobs:
#   1. eslint --fix using THIS repo's config, so it reinforces the gates
#      rather than fighting them (note: prettier is deliberately not used —
#      it is not installed or configured here).
# PostToolUse cannot block — the write already happened. Exit 0 always; exit 2
# here would only print noise.
set -uo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0
[ -f "$FILE" ] || exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    npx eslint --fix "$FILE" >/dev/null 2>&1 || true
    ;;
esac

# NOTE — there is deliberately NO Tailwind alpha check here.
#
# The "alpha on a CSS-variable colour compiles to nothing" trap was REAL (the
# 2026-07-24 audit measured 286 dead sites across 122 files) and is now FIXED
# at the source: tailwind.config.ts's tokenColor() emits
#   color-mix(in oklab, var(--x) calc(<alpha-value> * 100%), transparent)
# so `bg-fw-danger/30` composes correctly. 341 such utilities are live and
# correct today.
#
# A hook warning on them would fire on the majority of UI edits and be wrong
# every time — which is how you train yourself to ignore hook output. If the
# token layer ever regresses, the fix belongs in tailwind.config.ts, not here.

exit 0
