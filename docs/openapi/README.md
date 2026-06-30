# OpenAPI schema (future)

Helm API routes live under `src/app/api/` but are not yet exported as OpenAPI.

When ready:

1. Add `openapi.json` or `openapi.yaml` in this directory
2. Run `npm run schemathesis:advisory` locally against a preview URL
3. CI job `schemathesis-advisory` in `.github/workflows/free-production-readiness.yml` will pick it up automatically

See `docs/operations/BUG_DISCOVERY_STACK.md#schemathesis` for generation options (Zod-to-OpenAPI, manual maintenance, etc.).
