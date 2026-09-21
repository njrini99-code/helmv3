"""Compare One-Tap binding desired state with its real migration history.

Uses two disposable databases on an explicitly provided LOOPBACK PostgreSQL.
Only the binding dependency closure is replayed, in config.toml schema order;
this is not a claim that the unrelated full historical schema is drift-free.
Supabase-like public default grants are installed before both replay paths.

Usage: python3 scripts/golf/course-geometry/test-round-binding-schema.py --url postgresql://postgres@127.0.0.1:55439/postgres
"""
from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import json
import pathlib
import re
import shutil
import subprocess
import uuid
from urllib.parse import urlparse, urlunparse

import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[3]
SECTION = "-- One-Tap immutable round geometry binding and required evidence dependencies.\n"
OBJECTS = ("golf_round_course_bindings", "golf_shot_anchors", "can_read_golf_round",
           "owns_golf_round", "resolve_golf_round_course_binding", "guard_golf_round_geometry_binding")
ROUND = "aaaaaaaa-1111-4111-8111-111111111111"
ALICE = "11111111-1111-4111-8111-111111111111"
BOB = "22222222-2222-4222-8222-222222222222"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--pg-dump", default=shutil.which("pg_dump"))
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Only an explicit loopback PostgreSQL instance is permitted")
    if not args.pg_dump:
        raise SystemExit("A pg_dump matching the local server is required")
    token = uuid.uuid4().hex
    names = [f"golf_binding_schema_{token}_{kind}" for kind in ("migrated", "declared")]
    urls = [urlunparse(parsed._replace(path="/" + name)) for name in names]

    def sql(url: str, statement: str, *, fails: str | None = None) -> str:
        result = subprocess.run(["psql", url, "-XAtq", "-v", "ON_ERROR_STOP=1"],
                                input=statement, text=True, capture_output=True, check=False)
        if fails is not None:
            assert result.returncode and fails in result.stderr, result.stderr or "Expected refusal"
        elif result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip()

    def dump(url: str) -> dict[str, str]:
        result = subprocess.run([args.pg_dump, url, "--schema-only", "--quote-all-identifiers"],
                                capture_output=True, text=True, check=True)
        entries = re.findall(r"--\n-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner: (.*?)\n--\n"
                             r"(.*?)(?=\n--\n-- Name:|\n--\n-- PostgreSQL database dump complete)",
                             result.stdout, re.DOTALL)
        retained = {}
        for name, kind, schema, _owner, body in entries:
            if any(obj in name for obj in OBJECTS) or name == 'SCHEMA "helm_private"':
                # ACL grant order is not authority; compare the actual grants.
                value = "\n".join(sorted(body.strip().splitlines())) if kind == "ACL" else body.strip()
                retained[f"{schema}:{kind}:{name}"] = value
        assert len(retained) >= 50, "Dump must include tables, functions, comments, policies, triggers and ACLs"
        return retained

    # Minimal pre-existing application tables; all new objects come from real
    # migrations or desired-state declarations, never from a second test schema.
    fixture = (ROOT / "src/test/fixtures/course-geometry/round-binding/postgres-base.sql").read_text()
    fixture = fixture.split("CREATE TABLE public.golf_shot_anchors")[0]
    fixture = fixture.replace("player_id uuid REFERENCES public.golf_players,",
                              "player_id uuid REFERENCES public.golf_players, team_id uuid,")
    fixture = """
CREATE SCHEMA helm_private;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, anon, service_role;
""" + fixture + """
CREATE FUNCTION public.is_golf_team_coach(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_golf_team_player(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
"""
    sql(args.url, """DO $$ BEGIN
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;""")
    created = []
    try:
        for name, url in zip(names, urls, strict=True):
            sql(args.url, f'CREATE DATABASE "{name}";')
            created.append(name)
            sql(url, fixture)
        for name in ("20260916_peek_n_peak_one_tap.sql", "20260920234128_golf_round_geometry_binding_immutable_v2.sql"):
            sql(urls[0], (ROOT / "supabase/migrations" / name).read_text())
        config = tomllib.loads((ROOT / "supabase/config.toml").read_text())
        replayed = []
        for path in config["db"]["migrations"]["schema_paths"]:
            text = (ROOT / "supabase" / path).read_text()
            if SECTION in text:
                assert text.count(SECTION) == 1, path
                sql(urls[1], text.split(SECTION, 1)[1])
                replayed.append(path)
        assert len(replayed) == 12, f"Expected the full dependency closure, got {replayed}"
        migrated, declared = (dump(url) for url in urls)
        if migrated != declared:
            before = json.dumps(migrated, indent=2, sort_keys=True).splitlines()
            after = json.dumps(declared, indent=2, sort_keys=True).splitlines()
            raise AssertionError("\n".join(difflib.unified_diff(before, after, fromfile="migrated", tofile="declared")))
        # Exercise the declared objects, not just text/object-name matching.
        target = urls[1]
        sql(target, f"""
INSERT INTO public.golf_players VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{ALICE}');
INSERT INTO public.golf_rounds(id,player_id,tee_id,holes_played,draft_data)
 VALUES('{ROUND}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,
 '{{"holes":[{{"number":1,"par":4,"yardage":410}}]}}');
""")

        def claim(version: str) -> dict:
            proposal = {"schemaVersion": 2, "roundId": ROUND, "layoutId": "upper", "siteId": "site",
                        "geometryVersion": version, "layoutRevision": "a" * 64, "admissionVersion": "b" * 64,
                        "frameVersion": "c" * 64, "admissionBasis": "runtime_policy", "holeBindings": {"1": "upper-1"},
                        "manifest": {"courseId": "upper", "geometryVersion": version},
                        "scoringSnapshot": {"selectedTeeId": "fake", "holes": [{"number": 1, "par": 5, "yardage": 999}]}}
            value = json.dumps(proposal).replace("'", "''")
            return json.loads(sql(target, f"SET ROLE authenticated; SET request.jwt.claim.sub='{ALICE}'; "
                                        f"SELECT public.resolve_golf_round_course_binding('{ROUND}','{value}');"))

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, ["world-a", "world-b"]))
        assert results[0] == results[1], "Declared implementation must retain first-write winner"
        scoring = results[0]["binding"]["scoringSnapshot"]
        assert scoring["selectedTeeId"] == "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        assert scoring["holes"][0]["yardage"] == 410 and scoring["holes"][0]["par"] == 4
        sql(target, f"SET ROLE authenticated; SET request.jwt.claim.sub='{BOB}'; "
                    f"SELECT public.resolve_golf_round_course_binding('{ROUND}');", fails="Round unavailable")
        sql(target, "SET ROLE anon; SELECT * FROM public.golf_round_course_bindings;", fails="permission denied")
        sql(target, f"SET ROLE authenticated; SET request.jwt.claim.sub='{ALICE}'; "
                    "UPDATE public.golf_round_course_bindings SET geometry_version='rewrite';", fails="permission denied")
        sql(target, "SET ROLE authenticated; TRUNCATE public.golf_round_course_bindings;", fails="permission denied")
        sql(target, "UPDATE public.golf_round_course_bindings SET geometry_version='rewrite';", fails="immutable")
        print(f"PASS: {len(migrated)} PostgreSQL objects equivalent across 12 declared files and migration replay; "
              "default-grant hardening, first-write concurrency, scoring authority, RLS and immutability exercised")
    finally:
        for name in created:
            sql(args.url, f'DROP DATABASE "{name}" WITH (FORCE);')


if __name__ == "__main__":
    main()
