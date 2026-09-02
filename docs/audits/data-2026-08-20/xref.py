"""Cross-reference live Supabase objects against tracked source code.

Deliberate choices:
  * File list comes from `git ls-files`, so gitignored phantom trees
    (.deepsec/, .worktrees/, .claude/worktrees/) cannot contribute a single
    reference. Those hold ~8,000 stale copies of src/ and would otherwise
    make every dead object look alive.
  * References are counted per BUCKET, because "referenced in a migration"
    and "referenced in the app" mean opposite things. Every table is named
    in the migration that created it; that is not usage.
  * A table name is matched as a whole word, so golf_task_templates cannot
    absorb a hit meant for golf_tasks.
"""
import json, os, re, subprocess, collections

REPO = "/Users/ricknini/Downloads/helmv3"
D = "/private/tmp/claude-501/-Users-ricknini-Downloads-helmv3/8e5b742f-c08d-4e21-9903-2ee0dc10af84/scratchpad"


def tracked_files():
    out = subprocess.run(
        ["git", "-C", REPO, "ls-files"], capture_output=True, text=True, check=True
    ).stdout.split("\n")
    return [f for f in out if f]


def bucket(path: str) -> str:
    if path.startswith("supabase/migrations/"):
        return "migration"
    if path.startswith("supabase/functions/"):
        return "edge"
    if "__tests__" in path or ".test." in path or path.startswith("e2e/"):
        return "test"
    if path.startswith("scripts/") or path.startswith("tools/"):
        return "script"
    if path.startswith("src/lib/types/"):
        return "generated"
    if path.startswith("src/"):
        return "app"
    if path.startswith("docs/") or path.startswith("memory/"):
        return "doc"
    return "other"


READABLE = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".md", ".yml", ".yaml", ".json")


def load_corpus():
    corpus = collections.defaultdict(list)  # bucket -> [(path, text)]
    for f in tracked_files():
        if not f.endswith(READABLE):
            continue
        p = os.path.join(REPO, f)
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                corpus[bucket(f)].append((f, fh.read()))
        except OSError:
            continue
    return corpus


def main():
    stats = {}
    for row in open(D + "/table_stats.txt").read().strip().split(","):
        name, live, ins, upd, reads = row.split("|")
        stats[name] = dict(live=int(live), ins=int(ins), upd=int(upd), reads=int(reads))

    surface = json.load(open(os.environ["TMPDIR"] + "/typesurface.json"))
    corpus = load_corpus()
    print("corpus files by bucket:",
          {k: len(v) for k, v in sorted(corpus.items())})

    names = sorted(set(list(stats) + surface["tables"] + surface["views"]))
    result = {}
    for n in names:
        pat = re.compile(r"(?<![A-Za-z0-9_])" + re.escape(n) + r"(?![A-Za-z0-9_])")
        hits = collections.Counter()
        where = collections.defaultdict(list)
        for b, files in corpus.items():
            for path, text in files:
                if n not in text:
                    continue
                c = len(pat.findall(text))
                if c:
                    hits[b] += c
                    if len(where[b]) < 6:
                        where[b].append(path)
        result[n] = dict(hits=dict(hits), where={k: v for k, v in where.items()},
                         **stats.get(n, dict(live=-1, ins=-1, upd=-1, reads=-1)))
    json.dump(result, open(D + "/xref_tables.json", "w"), indent=1)

    def app(n):
        return result[n]["hits"].get("app", 0)

    dead = [n for n in names if app(n) == 0]
    print(f"\ntables/views with ZERO references in src/ (excluding generated types): {len(dead)}")
    for n in dead:
        h = result[n]["hits"]
        s = result[n]
        print(f"  {n:46s} live={s['live']:>7} ins={s['ins']:>7} "
              f"| script={h.get('script',0)} test={h.get('test',0)} "
              f"edge={h.get('edge',0)} mig={h.get('migration',0)} doc={h.get('doc',0)}")


if __name__ == "__main__":
    main()
