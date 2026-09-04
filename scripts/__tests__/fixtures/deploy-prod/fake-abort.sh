#!/usr/bin/env bash
# Installed under some other tool's name (the test uses `mktemp`) to make one
# command inside the deploy script's verification block die the way the
# Vercel CLI did on 2026-09-02: SIGABRT, exit 134, nothing useful printed.
echo "fake $(basename "$0"): simulated abort" >&2
exit 134
