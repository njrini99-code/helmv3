"""Apply a QGIS review-adjustments sidecar to a canonical course package and
its context layer (renderer-redesign plan section 23, master plan 79-80).

Usage:
  python3 apply-review-adjustments.py <package.json> <review-adjustments.geojson> <out-dir> \
      [--context=<context.json>]

One sidecar feature per decision (as written by build-qgis-review-kit.py):
  featureId   canonical package feature id or context zone id
  decision    accepted | adjust | reject
  reviewer    who decided (required)
  reviewedAt  ISO-8601 timestamp (required)
  note        free text (optional)
  geometry    the corrected WGS84 shape; required for `adjust`, same type as the original

Effects (on copies; the input files are never edited in place):
  accepted    reviewed: true
  adjust      geometryWgs84 replaced, reviewed: true
  reject      package feature -> reviewed: false; context zone -> basis: 'uncertain', reviewed: true
Every content hash is recomputed with the pipeline convention (sha256 of the
compact, key-sorted JSON without `contentHash`); the context layer is re-bound
to the new package hash. `review-provenance.json` records every decision with
the geometry hashes before and after. Compiled terrain fixtures bind the old
package hash and must be recompiled afterwards; visual artifacts recompile
themselves through the hash gate.
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

TOOL = 'apply-review-adjustments-v1'
DECISIONS = ('accepted', 'adjust', 'reject')


def sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def content_hash(document):
    return sha({key: value for key, value in document.items() if key != 'contentHash'})


def fail(problems):
    for problem in problems:
        print(f'review-adjustments: {problem}', file=sys.stderr)
    sys.exit(2)


def finite_positions(coords, depth):
    if depth == 0:
        return isinstance(coords, list) and len(coords) == 2 and all(isinstance(c, (int, float)) and c == c and abs(c) != float('inf') for c in coords)
    return isinstance(coords, list) and len(coords) > 0 and all(finite_positions(item, depth - 1) for item in coords)


def valid_geometry(geometry, original_type):
    if not isinstance(geometry, dict) or geometry.get('type') != original_type:
        return f'geometry must be a {original_type}'
    coords = geometry.get('coordinates')
    if original_type == 'LineString':
        return None if finite_positions(coords, 1) and len(coords) >= 2 else 'LineString needs at least two finite positions'
    rings = coords if original_type == 'Polygon' else [ring for polygon in (coords or []) for ring in polygon]
    if original_type == 'Polygon' and not finite_positions(coords, 2):
        return 'Polygon needs finite rings'
    if original_type == 'MultiPolygon' and not finite_positions(coords, 3):
        return 'MultiPolygon needs finite rings'
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1]:
            return 'every ring needs at least four positions and must close on its first position'
    return None


def parse_timestamp(value):
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None


def main(argv):
    positional = [arg for arg in argv if not arg.startswith('--')]
    options = dict(arg[2:].split('=', 1) for arg in argv if arg.startswith('--') and '=' in arg)
    if len(positional) != 3:
        print(__doc__)
        sys.exit(1)
    package_path, sidecar_path, out_dir = Path(positional[0]), Path(positional[1]), Path(positional[2])
    context_path = Path(options['context']) if options.get('context') else None
    package = json.loads(package_path.read_text())
    sidecar_bytes = sidecar_path.read_bytes()
    sidecar = json.loads(sidecar_bytes)
    context = json.loads(context_path.read_text()) if context_path else None
    before = {'package': package['contentHash'], 'context': context['contentHash'] if context else None}
    if content_hash(package) != package['contentHash']:
        fail([f'{package_path.name}: stored contentHash does not match its content; refusing to build on an unverified package'])
    if context is not None and content_hash(context) != context['contentHash']:
        fail([f'{context_path.name}: stored contentHash does not match its content'])
    if context is not None and context.get('packageHash') != package['contentHash']:
        fail([f'{context_path.name}: bound to package {context.get("packageHash", "")[:12]}, not {package["contentHash"][:12]}'])

    features = {feature['id']: feature for feature in package['features']}
    zones = {zone['id']: zone for zone in (context or {}).get('zones', [])}
    problems, decisions, seen = [], [], set()
    for index, item in enumerate(sidecar.get('features', [])):
        props = item.get('properties') or {}
        feature_id, decision = props.get('featureId'), props.get('decision')
        label = f'feature {index} ({feature_id or "no featureId"})'
        if not feature_id:
            problems.append(f'{label}: featureId is required'); continue
        if decision not in DECISIONS:
            problems.append(f'{label}: decision must be one of {", ".join(DECISIONS)}'); continue
        if feature_id in seen:
            problems.append(f'{label}: more than one decision for this id'); continue
        seen.add(feature_id)
        if not str(props.get('reviewer') or '').strip():
            problems.append(f'{label}: reviewer is required')
        if parse_timestamp(props.get('reviewedAt')) is None:
            problems.append(f'{label}: reviewedAt must be an ISO-8601 timestamp')
        target = 'package' if feature_id in features else 'context' if feature_id in zones else None
        if target is None:
            problems.append(f'{label}: no package feature or context zone with this id'); continue
        record = features[feature_id] if target == 'package' else zones[feature_id]
        geometry_key = 'geometryWgs84'
        if decision == 'adjust':
            error = valid_geometry(item.get('geometry'), record[geometry_key]['type'])
            if error:
                problems.append(f'{label}: {error}'); continue
        decisions.append((target, record, decision, props, item.get('geometry'), geometry_key))
    if problems:
        fail(problems)
    if not decisions:
        fail(['the sidecar holds no decisions'])

    applied = []
    for target, record, decision, props, geometry, geometry_key in decisions:
        entry = {'featureId': record['id'], 'target': target, 'kind': record.get('kind') or record.get('class'), 'decision': decision,
                 'reviewer': str(props['reviewer']).strip(), 'reviewedAt': props['reviewedAt'], 'note': props.get('note') or None,
                 'geometrySha256Before': sha(record[geometry_key]), 'reviewedBefore': bool(record.get('reviewed'))}
        if target == 'context':
            entry['basisBefore'] = record.get('basis')
        if decision == 'accepted':
            record['reviewed'] = True
        elif decision == 'adjust':
            record[geometry_key] = geometry
            record['reviewed'] = True
        elif target == 'package':
            record['reviewed'] = False
        else:
            record['basis'] = 'uncertain'
            record['reviewed'] = True
        entry['geometrySha256After'] = sha(record[geometry_key])
        entry['reviewedAfter'] = record['reviewed']
        if target == 'context':
            entry['basisAfter'] = record.get('basis')
        applied.append(entry)

    package['contentHash'] = content_hash(package)
    latest = max(parse_timestamp(entry['reviewedAt']) for entry in applied)
    if context is not None:
        context['packageHash'] = package['contentHash']
        review = dict(context.get('review') or {})
        zone_decisions = [entry for entry in applied if entry['target'] == 'context']
        review['status'] = 'reviewed' if zones and all(zone.get('reviewed') for zone in zones.values()) else 'partial' if zone_decisions or review.get('status') == 'partial' else review.get('status', 'unreviewed')
        review['reviewedAt'] = latest.isoformat() if zone_decisions else review.get('reviewedAt')
        review['notes'] = list(review.get('notes') or []) + [f'{len(zone_decisions)} zone decision(s) applied by {TOOL} from {sidecar_path.name}'][:1 if zone_decisions else 0]
        context['review'] = review
        context['contentHash'] = content_hash(context)

    out_dir.mkdir(parents=True, exist_ok=True)
    package_out = out_dir / package_path.name
    package_out.write_text(json.dumps(package, ensure_ascii=False, separators=(',', ':')) + '\n')
    context_out = None
    if context is not None:
        context_out = out_dir / context_path.name
        context_out.write_text(json.dumps(context, ensure_ascii=False, separators=(',', ':')) + '\n')
    provenance = {
        'kind': 'golfhelm-review-provenance', 'tool': TOOL, 'appliedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'sidecar': {'name': sidecar_path.name, 'sha256': hashlib.sha256(sidecar_bytes).hexdigest(), 'decisions': len(applied)},
        'package': {'name': package_path.name, 'before': before['package'], 'after': package['contentHash']},
        'contextLayer': {'name': context_path.name, 'before': before['context'], 'after': context['contentHash']} if context is not None else None,
        'decisions': applied,
        'downstream': [
            'Compiled terrain fixtures bind the previous package hash: run compile-course-terrain.py against the adjusted package before shipping.',
            'Visual artifacts and canopy identities key on the package hash and recompile through the hash gate; no manual step.',
        ],
    }
    (out_dir / 'review-provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'decisions': len(applied), 'packageHash': package['contentHash'][:12], 'contextHash': context['contentHash'][:12] if context else None,
                      'out': str(out_dir)}))


if __name__ == '__main__':
    main(sys.argv[1:])
