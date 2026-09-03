<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# ADR 2026-09-03 — Owner decisions for the Bridge control-plane program

Status: accepted (owner answered in-session 2026-09-03 ~03:00Z). Closes the five
OWNER DECISIONS listed in `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §11.

| Decision | Answer | Consequence |
| --- | --- | --- |
| `ADMIN_PLATFORM_REGISTRY_GRANULARITY` | **Split** the single `admin_platform` registry entry into sub-capabilities (`admin_incidents`, `admin_reliability_collector`, `admin_selfheal`, keeping `admin_platform` for the shared shell) | Phase E may build the world-model graph with real edges for the control plane; every session's `knowledge:map` routing for those paths changes; `knowledge:registry-check` and `knowledge:globs` must pass on the split. |
| `AGENT_FLIGHT_RECORDER_STORAGE` | **`helm_debug.agent_runs` table**, RPC-gated and service-role only, on the golf Flight Recorder pattern | One owner-applied (R3, HELD) migration; queryable hypotheses / context / verification fields; no jsonb blob in `background_job_logs`. |
| `VERIFICATION_ENSEMBLE_MODEL_COST` | **No cost**: no second provider, no recurring spend beyond today's | Build the REPRODUCER → HEALER → {ADVERSARY, SECURITY, PRODUCT} → JUDGE skeleton with roles as prompts over the existing Anthropic path, default OFF; it runs only when explicitly invoked and inside the existing Diagnose budget. |
| `FEATURE_FLAG_INFRASTRUCTURE_NET_NEW` | **Flags yes** | `config/feature-flags.yml` + `src/lib/flags/*` with the never-gate list (auth, RLS, tenancy, required persistence may never sit behind a flag); expired flags fail CI. |
| `CANARY_ROLLOUT_MECHANISM` | **Canary later** | Releases stay all-or-nothing; the rollback-recommendation script is the safety net; percentage rollout is deferred, not designed now. |

Recorded by the Sentry/commander session; the parallel Bridge session executes against
these answers. Reopen any row by a new ADR, not by editing this one.
