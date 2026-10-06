# Local dev machine tools for helmv3 (macOS). Install or update everything:
#   brew bundle            # from the repo root
#   npm run doctor         # then confirm nothing is missing
#
# Only tools the repo's scripts, git hooks and local Review Gate call directly.
# Everything else (Supabase CLI, Vercel CLI, Capacitor, Playwright, TypeScript,
# tsgo, ESLint, Vitest, knip, sentry-cli) comes from `npm ci`; do not install
# those globally. Node itself comes from fnm, which reads .nvmrc.

# Core
brew "git"
brew "git-lfs"
brew "gh"
brew "jq"
brew "ripgrep"
brew "fd"
brew "fnm"

# Runtimes and local database
brew "deno"                  # supabase/functions (npm run typecheck:functions)
brew "libpq", link: true     # psql / pg_dump
cask "docker-desktop"        # local Supabase stack, npm run test:rls

# Review Gate scanners (same tools CI blocks on)
brew "semgrep"
brew "ast-grep"
brew "gitleaks"
brew "actionlint"
brew "shellcheck"
brew "hadolint"
brew "markdownlint-cli2"
brew "ruff"
brew "uv"                    # installs the pinned Python linters, see below

# CI and payments
brew "circleci"
tap "stripe/stripe-cli"
brew "stripe/stripe-cli/stripe"

# Python linters are pinned to CI's versions and installed with uv, not brew:
#   uv tool install pylint@4.1.2 && uv tool install sqlfluff@4.4.0 \
#     && uv tool install yamllint@1.38.0
#
# Phone apps (only if you build them locally; CI compiles both):
#   Xcode 26.4+ from the App Store; Android Studio (bundled JDK 21, not 25).
