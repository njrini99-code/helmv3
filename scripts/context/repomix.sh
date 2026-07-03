#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node is required."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"

if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Repomix currently requires Node >=22."
  echo "Current Node: $(node -v)"
  echo "Use one of:"
  echo "  brew install repomix"
  echo "  nvm use 22"
  echo "  fnm use 22"
  echo "  docker run -v .:/app -it --rm ghcr.io/yamadashy/repomix"
  exit 1
fi

REPOMIX_VERSION="${REPOMIX_VERSION:-1.16.0}"
npx -y "repomix@${REPOMIX_VERSION}" "$@"
