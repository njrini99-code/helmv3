#!/usr/bin/env python3
"""Inspect complete-library C0 intake; optionally write the unchanged hashed plan."""
import argparse
import json
from pathlib import Path

from factory.catalog import load_catalog
from factory.intake import write_entries
from factory.library_intake import build_library_dossier


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--coverage', required=True)
    parser.add_argument('--catalog', default='course-geometry/catalog')
    parser.add_argument('--discovery', help='Optional retained cohort discovery JSON; evidence only')
    parser.add_argument('--out', required=True)
    parser.add_argument('--write', action='store_true', help='Write only ready C0 manifests; never overwrite existing files')
    parser.add_argument('--expect-plan-hash', help='Optimistic lock from a prior dossier; required with --write')
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text())
    dossier = build_library_dossier(read(args.snapshot), read(args.coverage), load_catalog(args.catalog),
                                   read(args.discovery) if args.discovery else None)
    if args.write and args.expect_plan_hash != dossier['planHash']:
        parser.error('--write requires the current --expect-plan-hash; inputs/catalog changed or no plan hash was supplied')
    dossier['written'] = write_entries(args.catalog, dossier['rows']) if args.write else []
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dossier, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'out': str(output), 'planHash': dossier['planHash'], **dossier['summary'], 'written': len(dossier['written'])}, indent=2))


if __name__ == '__main__':
    main()
