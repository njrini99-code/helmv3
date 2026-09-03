#!/usr/bin/env bash
# scripts/selfheal-repair-install.sh — install the repo's tracked Repair
# launchd config as the live agent, so the plist on disk is always exactly
# what config/launchd/com.helm.bridge-rca-repair.plist says it is.
#
# WHY THIS EXISTS
#
# The 06:40 scheduled Repair fire on 2026-09-02 failed in 0.6s because the
# live plist passed SKILL.md's raw text (starting with YAML `---`) as the
# `claude -p` argument, and the CLI parsed it as an unknown flag. The
# commander hand-patched the live plist and reloaded it, but the repo held no
# copy — nothing could diff the fix, and nothing stopped it drifting back.
# This script and config/launchd/com.helm.bridge-rca-repair.plist together
# make the repo the source of truth: `git diff` on the plist is now
# meaningful, and installing is one command instead of a manual copy +
# launchctl dance.
#
# Usage:
#   scripts/selfheal-repair-install.sh
#
# What it does, in order:
#   1. Copies the repo's plist to ~/Library/LaunchAgents/.
#   2. Lints it with plutil (catches malformed XML before launchd sees it).
#   3. Bootouts the currently-loaded agent, if any (ignores "not loaded").
#   4. Bootstraps it back in under gui/$(id -u).
#   5. Prints `launchctl print` so the caller can see it loaded.
#
# This script does NOT edit the plist. If the prompt, schedule, or command
# needs to change, edit config/launchd/com.helm.bridge-rca-repair.plist in
# the repo, review it like any other change, then re-run this script.
set -euo pipefail

LABEL="com.helm.bridge-rca-repair"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_PLIST="$REPO_ROOT/config/launchd/${LABEL}.plist"
DEST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_GUI="gui/$(id -u)"

if [[ ! -f "$SRC_PLIST" ]]; then
  echo "error: $SRC_PLIST not found" >&2
  exit 1
fi

echo "Installing $LABEL"
echo "  source: $SRC_PLIST"
echo "  dest:   $DEST_PLIST"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$SRC_PLIST" "$DEST_PLIST"

echo
echo "Linting..."
plutil -lint "$DEST_PLIST"

echo
echo "Reloading..."
# Ignore "not loaded" — the agent may not have been booted yet, and that is
# not an error for a first install.
launchctl bootout "$UID_GUI/$LABEL" 2>/dev/null || true
launchctl bootstrap "$UID_GUI" "$DEST_PLIST"

echo
echo "State after reload:"
launchctl print "$UID_GUI/$LABEL" || true

echo
echo "Done. Verify with: npm run selfheal:repair:doctor"
