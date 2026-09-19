"""Intake: turn the usage cohort and the library coverage audit into catalog
entries, most-played first (Factory v2 §3, §28). It writes C0 manifests
only — routes stay null, the tier stays C0 — and never overwrites a
catalogued layout. What it cannot derive from retained evidence it reports
as the reason the course is not catalogued."""
import json
import os
import re
import tempfile

from .catalog import load_catalog

USGS = ['usgs_s1m', 'usgs_3dep_project_1m']
TEE_PREFERENCE = ('champ', 'black', 'blue', 'gold', 'member', 'white')


def slugify(text):
    text = re.sub(r"['’]", '', str(text or '').lower())
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text or 'course'


def choose_tee(cards):
    def rank(card):
        name = (card.get('tee_name') or '').lower()
        return next((i for i, word in enumerate(TEE_PREFERENCE) if word in name), len(TEE_PREFERENCE))
    return min(cards, key=rank) if cards else None


def terrain_providers(facility):
    if facility.get('dem1mTiles'):
        return USGS
    if (facility.get('state') or '').upper() == 'NC':
        return ['nc_onemap_dem03']      # PR C adapter; the plan blocks on TERRAIN_ADAPTER_MISSING until then
    return USGS                          # discovery may still find a tile the audit did not name


def build_entries(cohort, coverage, scorecards, existing, min_rounds=1):
    """Ranked cohort rows with either the catalog documents to write or the
    reason there are none."""
    facilities_by_id = {}
    for facility in coverage.get('facilities', []):
        for library_id in facility.get('libraryIds', []):
            facilities_by_id[library_id] = facility
    cards_by_course = {}
    for card in scorecards.get('scorecards', []):
        cards_by_course.setdefault(card['course_id'], []).append(card)
    bound = {}
    for layout in existing.layouts.values():
        for course_id in (layout.get('externalBindings') or {}).get('golfCourseIds', []):
            bound[course_id] = layout['layoutId']
    rows = []
    facility_docs = {}
    for course in sorted(cohort.get('courses', []), key=lambda c: (-(c.get('completed_rounds') or 0), c.get('name') or '')):
        rounds = course.get('completed_rounds') or 0
        if rounds < min_rounds:
            continue
        row = {'course': course.get('name'), 'state': course.get('state'), 'rounds': rounds, 'libraryId': course.get('id'), 'layoutId': None, 'facilityId': None,
               'status': None, 'reason': None, 'osm': None, 'features': None, 'terrain': None}
        facility = facilities_by_id.get(course.get('id'))
        if course.get('id') in bound:
            row.update(status='catalogued', layoutId=bound[course['id']], reason='already in the catalog')
            rows.append(row)
            continue
        if not facility:
            row.update(status='skipped', reason='not in the library coverage audit (name resolution needed)')
            rows.append(row)
            continue
        osm_course = facility.get('osmCourse') or {}
        pin = facility.get('osmPin')
        element = pin or (f"{osm_course['type']}/{osm_course['id']}" if osm_course else None)
        row.update(osm=element, features=f"h{facility.get('holes', 0)} g{facility.get('greens', 0)} f{facility.get('fairways', 0)} b{facility.get('bunkers', 0)} t{facility.get('tees', 0)}",
                   terrain=('3dep-1m' if facility.get('dem1mTiles') else 'none'))
        if not element:
            row.update(status='skipped', reason='no OSM course polygon matched; a human pin is needed before an AOI exists')
            rows.append(row)
            continue
        center = osm_course.get('center')
        if not center:
            row.update(status='skipped', reason='the pinned OSM element has no recorded centre; run the coverage audit for it')
            rows.append(row)
            continue
        osm_name = osm_course.get('name')
        library_names = facility.get('libraryNames') or []
        if len(facility.get('libraryIds') or []) > 1 and osm_name and any(n.lower() == osm_name.lower() for n in library_names) \
                and (course.get('name') or '').lower() != osm_name.lower():
            # The audit folded this library row into a polygon named for a
            # sibling course (Pinehurst No. 8 under No. 2). A person pins it.
            row.update(status='skipped', reason=f'coverage audit binds this row to the polygon of {osm_name!r}; a human pin is needed')
            rows.append(row)
            continue
        facility_name = osm_name or re.sub(r'\s*\(.*?\)\s*', ' ', facility['name']).strip()
        facility_id = slugify(facility_name)
        layout_id = slugify(course.get('name'))
        if layout_id in existing.layouts or any(r.get('layoutId') == layout_id for r in rows):
            row.update(status='skipped', reason=f'layout id {layout_id} is taken')
            rows.append(row)
            continue
        cards = cards_by_course.get(course['id'], [])
        card = choose_tee(cards)
        hole_count = len(card['holes']) if card else 18
        holes = [f'{layout_id}-{n:02}' for n in range(1, hole_count + 1)]
        facility_doc = facility_docs.get(facility_id) or existing.facilities.get(facility_id)
        if facility_doc is None:
            facility_doc = {
                'schema': 'golfhelm-facility-v1', 'facilityId': facility_id, 'name': facility_name, 'country': 'US',
                'region': (facility.get('state') or course.get('state') or '??')[:40].upper()[:2] if (facility.get('state') or course.get('state')) else 'US',
                'originWgs84': [round(center[1], 7), round(center[0], 7)],
                'aoi': {'kind': 'osm', 'id': element, 'marginM': 300}, 'sourcePins': {'osm': [element]},
                'providerPolicy': {'terrain': terrain_providers(facility), 'imagery': ['naip_current'], 'context': ['osm']},
                'notes': [f'Intake from the {cohort.get("queriedAt")} usage cohort and the library coverage audit ({coverage.get("generatedAt", "")[:10]}); origin is the OSM course centre until the build pins it from the AOI.',
                          f'Coverage audit: {row["features"]} inside the course polygon; DEM tiles named: {len(facility.get("dem1mTiles") or [])}; verdict {facility.get("verdict")}.'][:20],
            }
            facility_docs[facility_id] = facility_doc
        layout_doc = {
            'schema': 'golfhelm-layout-v1', 'layoutId': layout_id, 'facilityId': facility_id, 'name': course.get('name'),
            'siteIds': [f'osm-{element.replace("/", "-")}'], 'segments': {'main': {'holes': holes}}, 'segmentOrder': ['main'], 'holeOrder': holes,
            'routeWayIds': None, 'bboxWgs84': None, 'capabilityTier': 'C0', 'externalBindings': {'golfCourseIds': [course['id']]},
            'scorecardProfiles': [f'{layout_id}-{slugify(card["tee_name"])}'] if card else [], 'geometry': None,
            'notes': [f'{rounds} completed cohort rounds ({cohort.get("queriedAt")}); intake wrote this manifest at C0 with routes unresolved.'],
        }
        scorecard_doc = None
        if card:
            scorecard_doc = {
                'schema': 'golfhelm-scorecard-profile-v1', 'profileId': f'{layout_id}-{slugify(card["tee_name"])}', 'layoutId': layout_id, 'teeName': card['tee_name'][:60],
                'source': {'provider': 'helm_course_library', 'url': None, 'retrievedAt': cohort.get('queriedAt'), 'note': 'Helm read-only course library snapshot; current card, not surveyed tee markers'},
                'holes': [{'hole': h['number'], 'par': h['par'], 'yards': h['yardage']} for h in sorted(card['holes'], key=lambda h: h['number'])],
            }
        row.update(status='ready_to_write', layoutId=layout_id, facilityId=facility_id,
                   reason=None if card else 'no library scorecard: the plan will block on SCORECARD_REQUIRED',
                   docs={'facility': facility_doc, 'layout': layout_doc, 'scorecard': scorecard_doc})
        rows.append(row)
    return rows


def write_entries(catalog_root, rows):
    """Write the new manifests, validating the merged catalog first. Existing
    files are never overwritten."""
    written = []
    with tempfile.TemporaryDirectory() as tmp:
        for sub in ('facilities', 'layouts', 'scorecards'):
            os.makedirs(os.path.join(tmp, sub), exist_ok=True)
            src = os.path.join(catalog_root, sub)
            for name in os.listdir(src) if os.path.isdir(src) else []:
                with open(os.path.join(src, name), encoding='utf-8') as f, open(os.path.join(tmp, sub, name), 'w', encoding='utf-8') as g:
                    g.write(f.read())
        planned = []
        for row in rows:
            if row.get('status') != 'ready_to_write':
                continue
            docs = row['docs']
            for sub, key, doc in (('facilities', 'facilityId', docs['facility']), ('layouts', 'layoutId', docs['layout']), ('scorecards', 'profileId', docs['scorecard'])):
                if doc is None:
                    continue
                name = f'{doc[key]}.json'
                target = os.path.join(catalog_root, sub, name)
                if os.path.exists(target) or any(t == target for _, t in planned):
                    continue
                with open(os.path.join(tmp, sub, name), 'w', encoding='utf-8') as f:
                    json.dump(doc, f, indent=2, ensure_ascii=False)
                    f.write('\n')
                planned.append((os.path.join(tmp, sub, name), target))
        merged = load_catalog(tmp)
        if merged.problems:
            raise ValueError('intake would leave the catalog invalid: ' + '; '.join(merged.problems[:5]))
        for source, target in planned:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(source, encoding='utf-8') as f, open(target, 'w', encoding='utf-8') as g:
                g.write(f.read())
            written.append(target)
    return written


def render(rows):
    lines = [f'{"ROUNDS":>6}  {"COURSE":<32} {"ST":<2}  {"STATUS":<15} {"OSM":<24} {"FEATURES":<22} {"TERRAIN":<8} REASON']
    for r in rows:
        lines.append(f'{r["rounds"]:>6}  {str(r["course"])[:32]:<32} {str(r["state"] or "")[:2]:<2}  {r["status"]:<15} {r["osm"] or "-"!s:<24} {r["features"] or "-"!s:<22} {r["terrain"] or "-"!s:<8} {r["reason"] or ""}')
    return '\n'.join(lines)
