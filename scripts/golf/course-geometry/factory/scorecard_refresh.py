"""Append every identified tee revision without replacing existing cards."""
import copy
import hashlib
import json
from pathlib import Path

from .catalog import cross_problems, layout_problems, load_catalog
from .tee_profiles import import_profiles


def refresh(catalog_root, snapshot_path, write=False):
    raw = Path(snapshot_path).read_bytes()
    snapshot = json.loads(raw)
    if (snapshot.get('completeness') or {}).get('method') != 'exact-count-stable-id-pagination':
        raise ValueError('scorecard refresh requires a complete paginated library export')
    catalog = load_catalog(str(catalog_root))
    if catalog.problems:
        raise ValueError('; '.join(catalog.problems))
    merged = copy.deepcopy(catalog)
    rows, changes = [], []
    snapshot_hash = hashlib.sha256(raw).hexdigest()
    for layout in sorted(catalog.layouts.values(), key=lambda item: item['layoutId']):
        ident = layout['layoutId']
        bound = layout['externalBindings']['golfCourseIds']
        cards = [card for card in snapshot.get('scorecards', []) if card['course_id'] in bound]
        profiles, rejected = import_profiles(cards, ident, snapshot['queriedAt'], snapshot_hash, len(layout['holeOrder']))
        new_profiles = []
        for profile in profiles:
            previous = catalog.scorecards.get(profile['profileId'])
            if previous:
                keys = ('revision', 'libraryBinding', 'holes', 'teeName', 'courseRating', 'slopeRating')
                if any(previous.get(k) != profile.get(k) for k in keys) or profile['profileId'] not in layout['scorecardProfiles']:
                    raise ValueError(f'SCORECARD_SOURCE_CONFLICT: immutable profile {profile["profileId"]}; review required')
            else:
                new_profiles.append(profile)
        if new_profiles:
            listed = [*layout['scorecardProfiles'], *[p['profileId'] for p in new_profiles]]
            updated = {**layout, 'scorecardProfiles': listed,
                       'referenceScorecardProfileId': layout.get('referenceScorecardProfileId') or listed[0]}
            problems = layout_problems(updated)
            if problems:
                raise ValueError('; '.join(problems))
            merged.layouts[ident] = updated
            merged.scorecards.update({p['profileId']: p for p in new_profiles})
            changes.append((updated, new_profiles))
        rows.append({'layoutId': ident, 'status': ('added' if write else 'ready') if new_profiles else 'preserved' if layout['scorecardProfiles'] else 'missing',
                     'addedProfiles': [p['profileId'] for p in new_profiles], 'rejected': rejected})
    problems = cross_problems(merged)
    if problems:
        raise ValueError('; '.join(problems))
    if write:
        for layout, profiles in changes:
            # Write the new card first; never leave a dangling layout reference.
            for profile in profiles:
                path = Path(catalog_root) / 'scorecards' / f'{profile["profileId"]}.json'
                with path.open('x') as stream:
                    stream.write(json.dumps(profile, indent=2) + '\n')
            path = Path(catalog_root) / 'layouts' / f'{layout["layoutId"]}.json'
            path.write_text(json.dumps(layout, indent=2) + '\n')
    return {'schema': 'golfhelm-scorecard-refresh-v1', 'snapshotSha256': snapshot_hash,
            'changed': len(changes), 'profilesAdded': sum(len(profiles) for _, profiles in changes), 'written': write, 'rows': rows}
