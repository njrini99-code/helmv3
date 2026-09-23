#!/usr/bin/env bash
# Fake Vercel CLI for scripts/__tests__/deploy-prod-verify.test.ts.
#
# Logs every invocation to $FAKE_VERCEL_LOG so a test can prove `deploy` was
# (or was not) called. `deploy` succeeds the way the real CLI does in a
# non-interactive session: a JSON summary on stdout.
#
# `inspect` reproduces the real CLI's OUTPUT SHAPE (vercel 59.5.0, measured
# 2026-09-02): every human-readable line goes to STDERR, the `id` row is the
# second row of "General", more rows follow it, and then an alias list. The
# alias list here is deliberately far larger than a pipe buffer (64 KiB on
# macOS). A reader that stops at the `id` row — the `awk '{...; exit}'` the
# deploy script used until 2026-09-02 — leaves this process writing into a
# closed pipe. Bash receives SIGPIPE there; the real CLI reacted by allocating
# until V8 aborted (SIGABRT, exit 134). The PIPE trap mirrors that exit status
# so a regression fails the way the incident did.
#
# FAKE_INSPECT_MODE=abort makes `inspect` die immediately with 134 instead,
# which is what a CLI abort looks like to the script when the pipe is intact.
#
# `ls` backs the weekly-budget guard (scripts/lib/deploy-week-count.mjs).
# FAKE_LS_MODE selects the shape:
#   empty (default)  "No deployments found." -> count 0
#   rows             FAKE_LS_COUNT age-"1h" rows -> count FAKE_LS_COUNT
#                    (pair with HELM_DEPLOY_WEEK_COUNT_NOW so "1h ago" and
#                    "now" are unambiguously the same ISO week)
#   unparseable      output with no row matching the age-column shape
#   error            exit 1, as if the CLI itself failed (e.g. auth)

printf '%s\n' "$*" >> "${FAKE_VERCEL_LOG:?FAKE_VERCEL_LOG must be set}"

case "${1:-}" in
  deploy)
    printf '{"status":"ok","deployment":{"id":"dpl_FIXTURE","readyState":"READY","target":"production"}}\n'
    exit 0
    ;;
  ls)
    case "${FAKE_LS_MODE:-empty}" in
      empty)
        echo 'Vercel CLI 59.5.0 (Node.js 22.23.2)'
        echo '> Deployments for helmv3 under fixture-team [200ms]'
        echo
        echo 'No deployments found.'
        exit 0
        ;;
      rows)
        echo 'Vercel CLI 59.5.0 (Node.js 22.23.2)'
        echo '> Deployments for helmv3 under fixture-team [200ms]'
        echo
        printf '  Age     Deployment                                Status     Environment   Duration   Username\n'
        n="${FAKE_LS_COUNT:-0}"
        i=0
        while [ "$i" -lt "$n" ]; do
          printf '  1h      helmv3-fixture-%02d.vercel.app             %s Ready    Production    2m         fixture-user\n' "$i" '\xe2\x97\x8f'
          i=$((i + 1))
        done
        exit 0
        ;;
      unparseable)
        echo 'Vercel CLI 59.5.0 (Node.js 22.23.2)'
        echo 'this output does not look like a deployment table at all'
        exit 0
        ;;
      error)
        echo 'Error: The specified token is not valid.' >&2
        exit 1
        ;;
      *)
        echo "fake vercel: unknown FAKE_LS_MODE '${FAKE_LS_MODE}'" >&2
        exit 2
        ;;
    esac
    ;;
  inspect)
    case "${FAKE_INSPECT_MODE:-chatty}" in
      abort)
        echo "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory" >&2
        exit 134
        ;;
      chatty)
        trap 'exit 134' PIPE
        {
          echo 'Vercel CLI 59.5.0 (Node.js 22.23.2)'
          echo '> Fetched deployment "helmv3-fixture.vercel.app" in fixture-team [450ms]'
          echo
          echo '  General'
          echo
          printf '    id\t\tdpl_FIXTURE\n'
          printf '    name\thelmv3\n'
          printf '    target\tproduction\n'
          printf '    status\t● Ready\n'
          printf '    url\t\thttps://helmv3-fixture.vercel.app\n'
          echo
          echo '  Aliases'
          echo
          i=0
          while [ "$i" -lt 4000 ]; do
            printf '    ╶ https://helmv3-alias-%04d.vercel.app\n' "$i"
            i=$((i + 1))
          done
        } >&2
        exit 0
        ;;
      *)
        echo "fake vercel: unknown FAKE_INSPECT_MODE '${FAKE_INSPECT_MODE}'" >&2
        exit 2
        ;;
    esac
    ;;
  *)
    echo "fake vercel: unexpected invocation: $*" >&2
    exit 2
    ;;
esac
