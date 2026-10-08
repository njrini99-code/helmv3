#!/usr/bin/env bash
# The `shell:` for the Static checks and Lint jobs (defaults.run.shell:
# `bash scripts/github/step-shell.sh {0}`). It runs each `run:` step exactly as
# GitHub's default bash would (`bash --noprofile --norc -eo pipefail <file>`) and
# also tees the combined output to $RUNNER_TEMP/step-logs/<step id>.log, so the
# aggregate step at the end of the job can quote the failing step's first error
# (scripts/github/step-summary.mjs). An aggregate cannot read another step's log
# any other way.
#
# GITHUB_ACTION is the step's `id` when it has one (and __run, __run_2, ... when
# it does not). The exit code is the script's own, never tee's.
set -u
script="${1:?usage: step-shell.sh <script-file>}"
log_dir="${RUNNER_TEMP:-/tmp}/step-logs"
mkdir -p "$log_dir"
log="$log_dir/${GITHUB_ACTION:-step}.log"
bash --noprofile --norc -eo pipefail "$script" 2>&1 | tee "$log"
exit "${PIPESTATUS[0]}"
