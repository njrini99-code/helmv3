# Evidence index

Raw evidence lives outside the repository, at:

    ~/Library/Logs/HelmNativeAudit/20260907T180915Z-bd5a4a3ba/

It is not committed: it contains full-page captures of an authenticated
production account and a Playwright trace of the live login page.

| Path (relative to the evidence directory) | What it is |
|---|---|
| `environment.txt` | machine, toolchain, checkout state at start |
| `run.json` | the run manifest (also copied into this report directory) |
| `logs/xcodebuild.stdout.log` | Release build for iPhone 17 simulator, BUILD SUCCEEDED |
| `logs/webkit.log` | Playwright run output, 2 failed / 1 passed |
| `static/hig-doctor.json` | raw scanner output, 959 concerns, 3258+23 files |
| `static/hig-doctor.md` | same, markdown |
| `static/hig-scoped.json` | the 344 concerns inside the GolfHelm/shared surface |
| `native/j01-run2/*.png` | cold launch, 0.2s intervals to t+12s — the valid timing series |
| `native/cold-*.png` | second cold-launch series, coarser intervals |
| `native/coldlaunch-t*.png` | **discarded** first attempt; timing was invalid (see COVERAGE.md) |
| `native/snapshot-dashboard.txt` | the 18-element / 0-target accessibility snapshot |
| `webkit/results.json` | Playwright JSON report |
| `webkit/axe-by-project.json` | decoded axe results per project |
| `webkit/html/` | Playwright HTML report |
| `webkit/artifacts/` | traces, videos, failure screenshots — **contains live production page content** |
| `audit-tools-package{,-lock}.json` | resolved versions of the audit CLIs |

## Files created inside the repository

| Path | Why |
|---|---|
| `playwright/native-audit.config.ts` | the WebKit lane; separate config, does not touch the main suite |
| `playwright/native-audit/login-audit.spec.ts` | signed-out login render + axe, gated on an entrance-transition settle check |
| `docs/audits/ios-native/README.md` | pointer to the newest run |
| `docs/audits/ios-native/runs/20260907T180915Z-bd5a4a3ba/` | this report set |

Nothing else in the repository was modified. No application source, native
configuration, CI, migration, or production setting was touched.

## Signed-in sweep

| Artifact | What it holds |
|---|---|
| `signed-in/<screen>.json` | per-screen tap-target, tiny-text, overflow and axe measurements |
| `playwright/native-audit/journeys.spec.ts` | the read-only sweep itself |
| `playwright/native-audit/signed-in.setup.ts` | sign-in that writes storage state OUTSIDE the repo |

Session storage state lives at `~/Library/Logs/HelmNativeAudit/.state/` and is
never committed. The setup refuses to write it inside a checkout. No credential,
token or storage state appears in any file in this run directory.
