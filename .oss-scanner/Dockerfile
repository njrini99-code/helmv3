# Build environment for Anthropic's OSS Scanner (https://red.anthropic.com/oss-scanner/).
# The image is built with network access; the scanning agent then runs offline,
# so everything it needs to read and run the code must be installed here.
# Node major matches .nvmrc and package.json "engines".
FROM node:24-bookworm

# The scanner clones the repo and uses it as the build context.
WORKDIR /src
COPY . .

# CI=true makes the `prepare` hook (scripts/setup-hooks.mjs) skip itself.
# Dev dependencies are kept so the scanner can run vitest and tsc offline.
RUN CI=true npm ci --no-audit --no-fund
