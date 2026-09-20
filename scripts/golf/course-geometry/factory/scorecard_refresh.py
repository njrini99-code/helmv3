"""Fill absent catalog scorecards from a complete library export, without
overwriting a reviewed/previously selected card or changing hole identity."""
import copy
import hashlib
import json
from pathlib import Path

from .catalog import cross_problems, load_catalog, scorecard_problems
from .intake import choose_tee, slugify


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
    for layout in sorted(catalog.layouts.values(), key=lambda item: item['layoutId']):
        ident = layout['layoutId']
        if layout['scorecardProfiles']:
            rows.append({'layoutId': ident, 'status': 'preserved'})
            continue
        bound = layout['externalBindings']['golfCourseIds']
        cards = [card for card in snapshot.get('scorecards', []) if card['course_id'] in bound]
        candidates = []
        for card in cards:
            profile_id = f'{ident}-{slugify(card["tee_name"])}'
            profile = {
                'schema': 'golfhelm-scorecard-profile-v1', 'profileId': profile_id, 'layoutId': ident,
                'teeName': card['tee_name'],
                'source': {'provider': 'helm_course_library', 'url': None, 'retrievedAt': snapshot['queriedAt'][:10],
                           'note': f'Complete read-only export SHA256 {hashlib.sha256(raw).hexdigest()}; '
                                   f'library source={card.get("source", "unknown")}. Scorecard facts only; '
                                   'no surveyed tee markers, route association, source boundary approval or production publication.'},
                'holes': [{'hole': h['number'], 'par': h['par'], 'yards': h['yardage']} for h in card['holes']],
            }
            if len(profile['holes']) == len(layout['holeOrder']) and not scorecard_problems(profile):
                candidates.append({**card, 'profile': profile})
        card = choose_tee(candidates)
        if not card:
            rows.append({'layoutId': ident, 'status': 'missing', 'reason': 'no complete matching library scorecard'})
            continue
        profile = card['profile']
        if profile['profileId'] in catalog.scorecards:
            raise ValueError(f'unreferenced profile already exists: {profile["profileId"]}; review before replacing')
        updated = {**layout, 'scorecardProfiles': [profile['profileId']]}
        merged.layouts[ident] = updated
        merged.scorecards[profile['profileId']] = profile
        changes.append((updated, profile))
        rows.append({'layoutId': ident, 'status': 'added' if write else 'ready', 'profileId': profile['profileId']})
    problems = cross_problems(merged)
    if problems:
        raise ValueError('; '.join(problems))
    if write:
        for layout, profile in changes:
            # Write the new card first; never leave a dangling layout reference.
            path = Path(catalog_root) / 'scorecards' / f'{profile["profileId"]}.json'
            with path.open('x') as stream:
                stream.write(json.dumps(profile, indent=2) + '\n')
            path = Path(catalog_root) / 'layouts' / f'{layout["layoutId"]}.json'
            path.write_text(json.dumps(layout, indent=2) + '\n')
    return {'schema': 'golfhelm-scorecard-refresh-v1', 'snapshotSha256': hashlib.sha256(raw).hexdigest(),
            'changed': len(changes), 'written': write, 'rows': rows}
