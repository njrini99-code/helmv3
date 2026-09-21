"""Execute the real migration against a disposable local PostgreSQL database.

Usage: python3 .../test-round-binding-postgres.py --url postgresql://127.0.0.1:55439/postgres
The host must be loopback. The test creates/drops its unique database and
creates the fixture auth roles if the isolated instance does not have them.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import pathlib
import subprocess
import uuid
from urllib.parse import urlparse, urlunparse

ROOT = pathlib.Path(__file__).resolve().parents[3]
ROUND = "aaaaaaaa-1111-4111-8111-111111111111"
ALICE = "11111111-1111-4111-8111-111111111111"
BOB = "22222222-2222-4222-8222-222222222222"
COACH = "33333333-3333-4333-8333-333333333333"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Only an explicit loopback PostgreSQL instance is permitted")
    name = "golf_binding_test_" + uuid.uuid4().hex
    target = urlunparse(parsed._replace(path="/" + name))

    def sql(statement: str, *, admin: bool = False, fail: str | None = None) -> str:
        result = subprocess.run(["psql", args.url if admin else target, "-XAtq", "-v", "ON_ERROR_STOP=1"],
                                input=statement, text=True, capture_output=True, check=False)
        if fail is not None:
            if result.returncode == 0 or fail not in result.stderr:
                raise AssertionError(result.stderr or "Expected SQL refusal")
        elif result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip()

    def as_user(user: str, statement: str) -> str:
        return f"SET ROLE authenticated; SET request.jwt.claim.sub='{user}'; {statement}"

    def proposal(version: str) -> dict:
        return {"schemaVersion": 2, "roundId": ROUND, "layoutId": "upper", "siteId": "site", "geometryVersion": version,
                "layoutRevision": "a" * 64, "admissionVersion": "b" * 64, "frameVersion": "c" * 64,
                "admissionBasis": "runtime_policy", "holeBindings": {"1": "ocean-1", "2": "ocean-2"},
                "manifest": {"courseId": "upper", "geometryVersion": version, "packageUrl": f"/course-geometry/upper/{version}.json"},
                "scoringSnapshot": {"selectedTeeId": "fake-black-tee", "holes": [{"number": 1, "par": 5, "yardage": 900}]}}

    def claim(version: str) -> dict:
        value = json.dumps(proposal(version)).replace("'", "''")
        return json.loads(sql(as_user(ALICE, f"SELECT public.resolve_golf_round_course_binding('{ROUND}', '{value}'::jsonb);")))

    sql("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; END $$;", admin=True)
    sql(f'CREATE DATABASE "{name}";', admin=True)
    try:
        sql((ROOT / "src/test/fixtures/course-geometry/round-binding/postgres-base.sql").read_text())
        sql((ROOT / "supabase/migrations/20260920234128_golf_round_geometry_binding_immutable_v2.sql").read_text())
        sql(f"UPDATE public.golf_rounds SET draft_data=draft_data || jsonb_build_object('scorecardProfileId','white-2026','scorecardRevision',repeat('a',64)) WHERE id='{ROUND}';")
        before = sql("SELECT jsonb_agg(to_jsonb(r)) FROM public.golf_rounds r;")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, ["version-a", "version-b"]))
        assert results[0] == results[1], "Concurrent devices must receive the first committed binding"
        binding = results[0]["binding"]
        scoring = binding["scoringSnapshot"]
        assert scoring["selectedTeeId"] == "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        assert [h["number"] for h in scoring["holes"]] == [2, 1], "Preserve saved played order"
        assert scoring["holes"][1]["yardage"] == 410, "Saved hole yardage beats draft/compiler"
        assert scoring["holes"][1]["par"] == 4
        assert scoring["scorecardProfileId"] == "white-2026"
        assert scoring["scorecardRevision"] == "a" * 64
        assert scoring["holes"][1]["teeFeatureId"] is None
        assert len(binding["scorecardSnapshotHash"]) == 64
        assert before == sql("SELECT jsonb_agg(to_jsonb(r)) FROM public.golf_rounds r;"), "No scoring mutation"
        sql(as_user(BOB, f"SELECT public.resolve_golf_round_course_binding('{ROUND}');"), fail="Round unavailable")
        sql("SET ROLE anon; SELECT public.resolve_golf_round_course_binding('" + ROUND + "');", fail="permission denied")
        assert json.loads(sql(as_user(COACH, f"SELECT public.resolve_golf_round_course_binding('{ROUND}');")))["binding"] == binding
        sql(as_user(COACH, f"SELECT public.resolve_golf_round_course_binding('{ROUND}', '{{}}');"), fail="Round unavailable")
        sql(as_user(ALICE, "UPDATE public.golf_round_course_bindings SET geometry_version='overwrite';"), fail="permission denied")
        sql(as_user(ALICE, "INSERT INTO public.golf_round_course_bindings(round_id,course_id,site_id,geometry_version) VALUES('bbbbbbbb-1111-4111-8111-111111111111','x','x','x');"), fail="permission denied")
        sql("UPDATE public.golf_round_course_bindings SET geometry_version='overwrite';", fail="immutable")
        legacy = sql(as_user(ALICE, "SELECT public.resolve_golf_round_course_binding('aaaaaaaa-2222-4222-8222-222222222222');"))
        assert json.loads(legacy)["status"] == "conflict", "Never silently migrate an old observation frame"
        blocked_round = "aaaaaaaa-4444-4444-8444-444444444444"
        sql(f"INSERT INTO public.golf_rounds(id,player_id,course_id,tee_id,draft_data) SELECT '{blocked_round}',player_id,course_id,tee_id,draft_data FROM public.golf_rounds WHERE id='{ROUND}';")
        sql(f"INSERT INTO public.golf_shot_anchors VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','{blocked_round}','original-world','upper','site');")
        old_marks = sql("SELECT jsonb_agg(to_jsonb(a)) FROM public.golf_shot_anchors a;")
        changed = proposal("new-world")
        changed["roundId"] = blocked_round
        encoded = json.dumps(changed).replace("'", "''")
        blocked = sql(as_user(ALICE, f"SELECT public.resolve_golf_round_course_binding('{blocked_round}', '{encoded}'::jsonb);"))
        assert json.loads(blocked)["status"] == "conflict", "Old observations prevent a different world binding"
        assert old_marks == sql("SELECT jsonb_agg(to_jsonb(a)) FROM public.golf_shot_anchors a;")
        assert sql(as_user(BOB, "SELECT count(*) FROM public.golf_round_course_bindings;")) == "0", "SELECT RLS hides another player's bindings"
        assert sql("SELECT prosecdef FROM pg_proc WHERE oid='public.resolve_golf_round_course_binding(uuid,jsonb)'::regprocedure;") == "f"
        incomplete_round = "aaaaaaaa-5555-4555-8555-555555555555"
        sql(f"INSERT INTO public.golf_rounds(id,player_id,course_id,tee_id,draft_data,holes_played) SELECT '{incomplete_round}',player_id,course_id,tee_id,draft_data,18 FROM public.golf_rounds WHERE id='{ROUND}';")
        incomplete = proposal("version-a")
        incomplete["roundId"] = incomplete_round
        encoded = json.dumps(incomplete).replace("'", "''")
        result = sql(as_user(ALICE, f"SELECT public.resolve_golf_round_course_binding('{incomplete_round}', '{encoded}'::jsonb);"))
        assert json.loads(result)["status"] == "unavailable", "Incomplete saved setup must not become a permanent snapshot"
        sql("UPDATE public.golf_holes SET yardage=999 WHERE hole_number=1;")
        assert claim("version-new")["binding"] == binding, "Later scorecard edits cannot mutate the pinned snapshot"
        print("PASS: real PostgreSQL migration, concurrent claims, scoring authority, immutable versions, owner/coach/stranger/anon access, direct-write refusal, legacy conflict")
    finally:
        sql(f'DROP DATABASE "{name}" WITH (FORCE);', admin=True)


if __name__ == "__main__":
    main()
