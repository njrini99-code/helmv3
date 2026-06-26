# Generated Artifacts Audit

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Likely Generated Folders

| Folder | Evidence | Proposed Action |
|---|---|---|
| `.next` | 28G build output | GENERATED_ARTIFACT; ensure ignored and remove locally only with approval. |
| `node_modules` | 2.8G dependency install | GENERATED_ARTIFACT; ignored/local. |
| `ds-bundle` | Generated JS/CSS bundle dominates repo LOC | MANUAL_REVIEW then likely artifact cleanup. |
| `.playwright-mcp` | 48M Playwright capture YAML/PNGs | GENERATED_ARTIFACT / gitignore review. |
| `ui-intelligence`, `routes` | Generated route/UI intelligence outputs | MANUAL_REVIEW. |
| `.cleanup` | This audit output | REPORT_ONLY; do not commit raw secret output. |

## Likely Local-Only Folders

| Folder | Evidence | Proposed Action |
|---|---|---|
| `.vercel` | Local deployment metadata | Keep ignored. |
| `.tmp-screenshots`, `.bugtest-screens` | Screenshot/debug outputs | GENERATED_ARTIFACT. |
| `playwright-report` | Test report output | GENERATED_ARTIFACT. |

## Should Be Gitignored

| Path | Reason |
|---|---|
| `.cleanup/reports/secret-pattern-scan.txt` | Raw secret scans must never be committed. |
| `.cleanup/reports/*.txt` raw tool outputs | May include sensitive paths or huge data. |
| `.playwright-mcp/**` | Generated browser captures. |
| `ds-bundle/**` if regenerated | Generated bundle output. |

## Needs Human Review

| Path | Reason |
|---|---|
| `.helmdev`, `.agents`, `.claude`, `.skills` | Agent tooling may be intentionally retained. |
| `helm-website-ui` | Nested project; do not remove as artifact without owner decision. |

## Do Not Touch

| Path | Reason |
|---|---|
| `.ultracode/baseballhelm/**` | DEFERRED_BASEBALLHELM. |
| BaseballHelm docs/scripts/source | Frozen by playbook. |
