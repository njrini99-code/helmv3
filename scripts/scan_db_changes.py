#!/usr/bin/env python3
"""
Scan every remediation agent transcript + the migrations dir and emit ONE manifest of
all DB changes (applied-to-prod, file-only-unapplied, needed-but-deferred, data-backfill)
so nothing drifts. Re-runnable — finalize after the run completes.
Output: docs/audits/DB_CHANGES_MANIFEST_2026-06-21.md  (+ /tmp/db_changes.json)
"""
import json, glob, os, re, subprocess, time

REPO="/Users/ricknini/Downloads/helmv3"
WFP="/Users/ricknini/.claude/projects/-Users-ricknini/f091ec6b-b133-4061-91a2-2e5a2aff285f/subagents/workflows"
MIGDIR=f"{REPO}/supabase/migrations"
OUT=f"{REPO}/docs/audits/DB_CHANGES_MANIFEST_2026-06-21.md"

def transcripts():
    return glob.glob(f"{WFP}/wf_*/agent-*.jsonl")

def assistant_tooluses(fp):
    for ln in open(fp,encoding="utf-8",errors="ignore"):
        if '"tool_use"' not in ln: continue
        try: ev=json.loads(ln)
        except: continue
        if ev.get("type")!="assistant": continue
        c=ev.get("message",{}).get("content")
        if not isinstance(c,list): continue
        for b in c:
            if isinstance(b,dict) and b.get("type")=="tool_use":
                yield b.get("name",""), (b.get("input",{}) or {})

def first_ids(fp):
    for ln in open(fp,encoding="utf-8",errors="ignore"):
        if "Your finding IDs" not in ln: continue
        try: ev=json.loads(ln)
        except: continue
        c=ev.get("message",{}).get("content")
        t=c if isinstance(c,str) else (" ".join(x.get("text","") for x in c if isinstance(x,dict)) if isinstance(c,list) else "")
        m=re.search(r"Your finding IDs:\s*([^\n]+)",t)
        if m: return [x.strip() for x in m.group(1).split(",")]
    return []

DESTRUCTIVE=re.compile(r"\b(DROP|DELETE|TRUNCATE|ALTER COLUMN .* TYPE|DROP COLUMN)\b",re.I)
def table_of(sql):
    m=re.search(r"(?:ALTER TABLE|CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO|UPDATE)\s+(?:public\.)?([a-z_0-9]+)",sql,re.I)
    return m.group(1) if m else "?"

# 1) applied-to-prod via supabase MCP
applied=[]   # {name, table, sql, additive, owner_ids}
for fp in transcripts():
    ids=first_ids(fp)
    for name,inp in assistant_tooluses(fp):
        if "apply_migration" in name or ("execute_sql" in name):
            sql=(inp.get("query") or inp.get("sql") or "").strip()
            is_apply="apply_migration" in name
            if not is_apply:
                # execute_sql: keep only real DDL on a public.golf_* table; drop probes/temp/SELECTs
                if not re.search(r"\b(ALTER TABLE|CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX)\s+(?:IF NOT EXISTS\s+)?(?:public\.)?golf_",sql,re.I):
                    continue
                if re.search(r"TEMP TABLE|00000000-0000|DO \$\$|pg_policies|information_schema",sql,re.I) or sql.lstrip().startswith("--"):
                    continue
            applied.append({"name":inp.get("name","") or "(inline execute_sql)","table":table_of(sql),
                            "sql":re.sub(r"\s+"," ",sql)[:400],"additive":not bool(DESTRUCTIVE.search(sql)),
                            "ids":ids})

# 2) migration files in repo
migfiles=[]
for f in sorted(glob.glob(f"{MIGDIR}/2026062*.sql")):
    name=os.path.basename(f)
    tracked=subprocess.run(["git","-C",REPO,"ls-files","--error-unmatch",f],capture_output=True).returncode==0
    body=open(f,errors="ignore").read()
    migfiles.append({"file":name,"tracked":tracked,"table":table_of(body),
                     "additive":not bool(DESTRUCTIVE.search(body)),"head":re.sub(r"\s+"," ",body)[:240]})

# 3) needed-but-deferred (from demoted notes) + known backfills
live=json.load(open("/tmp/live_outcomes.json")) if os.path.exists("/tmp/live_outcomes.json") else {}
deferred=[]
SCHEMA_HINT=re.compile(r"has no |needs? .*(table|column)|ADD COLUMN|new tables|outcome_status|semester|golf_insight_(exposure|action|outcome)",re.I)
for i,o in live.items():
    if o["action"]=="demoted" and SCHEMA_HINT.search(o.get("note","")):
        deferred.append({"id":i,"note":o["note"][:300]})
backfills=[{"id":"P0-01","what":"Rebuild golf_coachhelm_coach_weights from corrected attribution history (direction fix). One-time data backfill, NOT a schema change.","status":"NEEDS BACKFILL SCRIPT"}]

# cross-ref: which applied migrations have a file? which files look unapplied?
applied_names={a["name"] for a in applied}
for m in migfiles:
    stem=m["file"].split("_",1)[1].replace(".sql","") if "_" in m["file"] else m["file"]
    m["applied"]=any(stem in n or n in stem for n in applied_names) or any(m["table"]==a["table"] for a in applied)

data={"applied":applied,"migfiles":migfiles,"deferred":deferred,"backfills":backfills}
json.dump(data,open("/tmp/db_changes.json","w"))

# ── manifest markdown ──
L=[]
L.append("# DB Changes Manifest — Premium Remediation (Phase 3/4 + CoachHelm)")
L.append(f"\n_Scan of all remediation agent transcripts + `supabase/migrations/`. Re-run `scripts/scan_db_changes.py` to refresh._\n")
L.append("> Purpose: ONE apply-to-prod checklist so no schema change drifts. Nothing here is auto-applied to prod by this manifest.\n")

L.append("## 1. Applied to LIVE prod during the run (verify each has a committed migration file)")
if applied:
    L.append("\n| Migration | Table | Safe? | From | SQL (head) |\n|---|---|---|---|---|")
    for a in applied:
        L.append(f"| `{a['name']}` | `{a['table']}` | {'✅ additive' if a['additive'] else '⚠️ DESTRUCTIVE'} | {', '.join(a['ids']) or '—'} | `{a['sql'][:120]}` |")
else: L.append("\n_None detected yet._")

L.append("\n## 2. Migration files in repo (apply to prod if not yet applied)")
if migfiles:
    L.append("\n| File | In git? | Applied to prod? | Table | Safe? |\n|---|---|---|---|---|")
    for m in migfiles:
        L.append(f"| `{m['file']}` | {'yes' if m['tracked'] else '**UNTRACKED**'} | {'✅ yes' if m['applied'] else '❌ **NOT APPLIED**'} | `{m['table']}` | {'✅' if m['additive'] else '⚠️'} |")
else: L.append("\n_No 2026-06-21 migration files found._")

L.append("\n## 3. Every DB directive in the CoachHelm audit — cross-checked to status")
L.append("\n_Source of truth = `COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md` (Tables/Fix sections + Batch table). Each schema/data directive and what actually happened:_\n")
L.append("| Finding | DB directive (from doc) | Status |\n|---|---|---|")
DOC_SCHEMA=[
 ("P1-11","`golf_coachhelm_chat_messages.client_turn_id` + unique index","✅ APPLIED to prod · file `20260621120000` is **UNTRACKED → commit it**"),
 ("P1-11","`golf_coachhelm_chat_messages.status` (complete/failed terminal state)","✅ APPLIED to prod · captured in file `20260621120000` (UNTRACKED → commit it)"),
 ("P1-11","Persist `tool` call/result messages (data-grounded answers)","CODE (persistence.ts) — verify; no schema column"),
 ("P0-04","`golf_rounds.analysis_status` (complete/partial/gated/failed) + per-generator receipts + retry state; OR new `golf_coachhelm_analysis_runs` table","⚠️ **DIVERGED** — shipped via existing `coachhelm_failure_reason='engine_partial_failure'`; doc's first-class `analysis_status` column + receipts table **NOT created** (optional follow-up)"),
 ("P0-05","`golf_coach_insights.evidence.diagnosis` (symptom/root_cause/drivers/confidence_reason)","✅ DONE in code (JSON evidence field — no schema change needed)"),
 ("P0-01","`golf_insight_outcome_attribution` store normalized `improvement_lift` by metric direction","✅ DONE in code (existing delta/lift columns)"),
 ("P0-01","Rebuild `golf_coachhelm_coach_weights` from corrected history","🔁 BACKFILL needed (see §4)"),
 ("P0-02","Retire stranded same-day `golf_predictions`; recompute `golf_prediction_model_performance`","CODE retires NEW rows (error_category='invalid_horizon'); 🔁 **~623 existing stranded rows need a BACKFILL** (see §4)"),
 ("P1-07","`golf_goals` snapshot + evaluation columns","✅ NO MIGRATION NEEDED — golf_goals already has baseline_value/current_value/target_value/state/outcome_evaluated_at/snapshots; only the evaluator CODE remains"),
 ("P1-08","`golf_goal_suggestions` cap to ≤2 active pending/player","CODE (suggestion-writer/loader) — no schema"),
 ("P1-09","`golf_insight_player_feedback` read state affects all player surfaces","CODE (insight-visibility/delivery) — no schema"),
 ("P1-10","Route every category through `golf_player_notification_state`","CODE (router/dispatch) — table exists; verify delivery wired"),
 ("P1-12","Unified event ledger — 3 tables `golf_insight_exposure`/`action`/`outcome`","✅ TABLES APPLIED to prod (RLS enabled, 0 advisor flags) + file 20260621160000; ledger + trust-chips + Effectiveness UI built"),
 ("P2-21","`golf_player_genome` — only persist valid dimensions (no all-null vectors)","CODE (Pin) — no schema"),
 ("P094","`golf_player_focus_areas.outcome_status` column","✅ APPLIED to prod + file 20260621140000"),
 ("P231","`golf_player_classes.semester` column","✅ APPLIED to prod + file 20260621150000"),
]
for fid,d,st in DOC_SCHEMA: L.append(f"| {fid} | {d} | {st} |")
# sanity: any agent-detected deferred-schema not in the curated list
extra=[d['id'] for d in deferred if d['id'] not in {x[0] for x in DOC_SCHEMA}]
if extra: L.append(f"\n_Also flagged by agents (verify): {', '.join(sorted(set(extra)))}_")

backfills=[
 {"id":"P0-01","what":"Rebuild `golf_coachhelm_coach_weights` from corrected attribution history. ⏳ POST-DEPLOY — needs the direction-fix code live; run the attribution cron after the merge."},
 {"id":"P0-02","what":"Retire stranded same-day predictions. ✅ DONE — 623 rows stamped error_category='invalid_horizon' + validated_at (file 20260621170000). Rollups self-correct on the next writer run."},
]
L.append("\n## 4. Data backfills (one-time, no schema change)")
for b in backfills:
    L.append(f"- **{b['id']}** — {b['what']}")

L.append("\n## Apply order (recommended)")
L.append("1. Commit untracked migration files so repo == intent.")
L.append("2. For each §2 row marked **NOT APPLIED**: review SQL → apply via `supabase` MCP/CLI (additive first).")
L.append("3. Confirm §1 prod-applied columns each have a matching committed file (close the drift).")
L.append("4. Write + apply §3 deferred migrations only after you approve the schema.")
L.append("5. Run §4 backfills last (after the direction-fix code is deployed).")
L.append("\n_Verify prod truth with read-only `information_schema` / `list_migrations` before applying._")

open(OUT,"w").write("\n".join(L))
print("wrote",OUT)
print(f"applied-to-prod DDL: {len(applied)} | migration files: {len(migfiles)} | doc directives: {len(DOC_SCHEMA)} | backfills: {len(backfills)}")
