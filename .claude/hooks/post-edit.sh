#!/usr/bin/env bash
# PostToolUse / Write|Edit|MultiEdit — autofix + feed back the silent-failure
# patterns that lint cannot see.
#
# One script (one process spawn) doing two jobs:
#   1. eslint --fix using THIS repo's config, so it reinforces the gates
#      rather than fighting them (note: prettier is deliberately not used —
#      it is not installed or configured here).
#   2. Warn on Tailwind alpha applied to a CSS-variable colour, which compiles
#      to NOTHING. No error, no lint failure, just an invisible element.
#
# PostToolUse cannot block (the write already happened). Structured feedback
# goes back to Claude via hookSpecificOutput.additionalContext, so exit 0
# with JSON — never exit 2 here, that would just print noise.
set -uo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0
[ -f "$FILE" ] || exit 0

NOTES=""

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    npx eslint --fix "$FILE" >/dev/null 2>&1 || true
    ;;
esac

# bg-fw-danger/30, text-accent-500/50 … — Tailwind cannot compute an alpha
# channel from a var() colour, so the whole utility is dropped at build time.
case "$FILE" in
  *.tsx|*.jsx|*.css)
    if HITS=$(grep -nEo '(bg|text|border|ring|fill|stroke)-(fw|accent)-[a-z0-9-]+/[0-9]+' "$FILE" 2>/dev/null | head -5) \
       && [ -n "$HITS" ]; then
      NOTES="Tailwind alpha on a CSS-variable colour compiles to NOTHING (silently — no error, no lint failure). Found in $FILE:
$HITS
Use an explicit inline style with color-mix(), or a pre-defined token that already carries the alpha."
    fi
    ;;
esac

if [ -n "$NOTES" ]; then
  jq -nc --arg ctx "$NOTES" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$ctx}}'
fi

exit 0
