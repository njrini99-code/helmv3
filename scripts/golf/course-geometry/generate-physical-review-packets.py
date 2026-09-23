#!/usr/bin/env python3
"""Generate immutable, pending physical-review packets from retained artifacts.

The command is read-only with respect to geometry and compilation.  It may
create new evidence-index files only; existing review packets are never
modified.  `--all-visual-candidates` is intentionally a batch review queue,
not a promotion command.
"""
import argparse
import json
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from factory.physical_review_packet import build_packet, write_packet  # noqa: E402
from factory.world_coverage import audit_catalog  # noqa: E402


BATCH_SCHEMA = 'golfhelm-physical-review-packet-batch-v1'


def _packet_path(out_root: Path, packet: dict) -> Path:
    return out_root / packet['layoutId'] / f"{packet['contentHash']}.json"


def _retain_or_write(packet: dict, out_root: Path, dry_run: bool) -> tuple[str, str]:
    destination = _packet_path(out_root, packet)
    if dry_run:
        return 'planned', str(destination)
    if destination.exists():
        try:
            existing = json.loads(destination.read_text(encoding='utf-8'))
        except (OSError, ValueError, TypeError) as exc:
            raise ValueError(f'existing review packet is unreadable: {destination}') from exc
        if existing.get('contentHash') != packet['contentHash']:
            raise ValueError(f'existing review packet content is inconsistent: {destination}')
        return 'retained', str(destination)
    write_packet(packet, destination)
    return 'created', str(destination)


def _write_json_exclusive(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        json.dump(document, stream, indent=2, sort_keys=True)
        stream.write('\n')


def _one(args) -> dict:
    packet = build_packet(args.output_root, args.catalog, args.layout)
    if args.dry_run:
        status, path = 'planned', str(args.out)
    elif args.out.exists():
        try:
            existing = json.loads(args.out.read_text(encoding='utf-8'))
        except (OSError, ValueError, TypeError) as exc:
            raise ValueError(f'existing review packet is unreadable: {args.out}') from exc
        if existing.get('contentHash') != packet['contentHash']:
            raise ValueError(f'existing review packet content is inconsistent: {args.out}')
        status, path = 'retained', str(args.out)
    else:
        write_packet(packet, args.out)
        status, path = 'created', str(args.out)
    return {
        'layoutId': packet['layoutId'], 'packageHash': packet['packageHash'],
        'holeCount': len(packet['holes']), 'status': status,
        'approval': False, 'contentHash': packet['contentHash'], 'path': path,
    }


def _batch(args) -> dict:
    coverage = audit_catalog(args.repo_root, args.catalog, args.output_root)
    candidates = [row['layoutId'] for row in coverage['layouts']
                  if row.get('lifecycleState') == 'physical_review_pending']
    created, retained, planned, blocked = [], [], [], []
    for layout_id in sorted(candidates):
        try:
            packet = build_packet(args.output_root, args.catalog, layout_id)
            status, path = _retain_or_write(packet, args.out_root, args.dry_run)
            entry = {
                'layoutId': layout_id, 'packageHash': packet['packageHash'],
                'holeCount': len(packet['holes']), 'contentHash': packet['contentHash'],
                'path': path,
            }
            {'created': created, 'retained': retained, 'planned': planned}[status].append(entry)
        except (OSError, ValueError, TypeError) as exc:
            blocked.append({
                'layoutId': layout_id,
                'code': 'PHYSICAL_REVIEW_PACKET_INPUT_MISMATCH',
                'explanation': str(exc),
                'nextAction': 'Rerun the stale dependency graph through the canonical factory; do not edit retained package, context, mesh, or review evidence manually.',
            })
    result = {
        'schema': BATCH_SCHEMA,
        'purpose': 'physical-review-only',
        'approval': False,
        'candidateLayouts': candidates,
        'created': created,
        'retained': retained,
        'planned': planned,
        'blocked': blocked,
        'totals': {
            'candidates': len(candidates), 'created': len(created),
            'retained': len(retained), 'planned': len(planned), 'blocked': len(blocked),
        },
    }
    if args.report:
        if args.dry_run:
            raise ValueError('--report cannot be used with --dry-run')
        _write_json_exclusive(args.report, result)
        result['reportPath'] = str(args.report)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument('--layout')
    selection.add_argument('--all-visual-candidates', action='store_true')
    parser.add_argument('--output-root', default='output/course-geometry/factory')
    parser.add_argument('--catalog', default='course-geometry/catalog')
    parser.add_argument('--repo-root', default='.',
                        help='Repository root used by the read-only route/evidence audit')
    parser.add_argument('--out', type=Path,
                        help='New single-packet path; exclusive create prevents overwriting a prior review artifact')
    parser.add_argument('--out-root', type=Path,
                        help='Root for deterministic batch packet paths')
    parser.add_argument('--report', type=Path,
                        help='New batch report path; exclusive create prevents overwriting a prior report')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    if args.layout and args.out is None:
        parser.error('--layout requires --out')
    if args.all_visual_candidates and args.out_root is None:
        parser.error('--all-visual-candidates requires --out-root')
    try:
        result = _one(args) if args.layout else _batch(args)
    except (OSError, ValueError, TypeError) as exc:
        print(f'physical review packet failed: {exc}', file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True) if args.json else json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
