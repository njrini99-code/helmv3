"""Complete-library C0 intake, with uncertain source identities held explicitly.

Coverage is a discovery hint. Neither a shared name, a shared OSM polygon nor
matching scorecard facts authorize merging library UUIDs or physical admission.
"""
import copy
import re
from collections import Counter, defaultdict

from .catalog import UUID
from .intake import build_entries, slugify
from .source_registry import imagery_policy
from .tee_profiles import content_hash, import_profiles

US_REGIONS = {'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
              'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
              'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
              'WV', 'WI', 'WY'}


def _snapshot_courses(snapshot):
    if snapshot.get('schema') != 'golfhelm-team-course-library-snapshot-v1':
        raise ValueError('LIBRARY_SNAPSHOT_REQUIRED: use the complete library exporter')
    courses = snapshot.get('courses')
    completeness = snapshot.get('completeness') or {}
    if (not isinstance(courses, list) or completeness.get('method') != 'exact-count-stable-id-pagination'
            or completeness.get('courses') != len(courses)):
        raise ValueError('LIBRARY_SNAPSHOT_INCOMPLETE: exact course count does not match the snapshot')
    ids = [course.get('id') for course in courses]
    if any(not isinstance(value, str) or not UUID.fullmatch(value) for value in ids) or len(set(ids)) != len(ids):
        raise ValueError('LIBRARY_ID_INVALID: course UUIDs must be valid and unique')
    tee_courses = {}
    for card in snapshot.get('scorecards', []):
        if card.get('course_id') not in ids:
            raise ValueError('SCORECARD_COURSE_UNKNOWN: scorecard course is absent from the snapshot')
        tee_id = card.get('tee_id')
        if tee_id in tee_courses and tee_courses[tee_id] != card['course_id']:
            raise ValueError('TEE_COURSE_CONFLICT: one tee UUID belongs to different course UUIDs')
        tee_courses[tee_id] = card['course_id']
    if not isinstance(completeness.get('tees'), int) or completeness['tees'] < len(tee_courses):
        raise ValueError('LIBRARY_SNAPSHOT_INCOMPLETE: source tee count is missing or smaller than exported tee IDs')
    return courses


def _pin(facility):
    course = facility.get('osmCourse') or {}
    return facility.get('osmPin') or (f"{course['type']}/{course['id']}" if course.get('type') and course.get('id') else None)


def build_library_dossier(snapshot, coverage, existing, discovery=None):
    """Produce every library row, ready C0 documents, and precise hold reasons.

    Zero/unknown round counts never filter a complete library. All exported tee
    profiles are retained in the dossier, including those belonging to held rows.
    Existing UUID bindings stay authoritative and are never expanded here.
    """
    courses = _snapshot_courses(snapshot)
    if existing.problems:
        raise ValueError('CATALOG_INVALID: ' + '; '.join(existing.problems[:5]))
    by_id = {course['id']: course for course in courses}
    facilities = defaultdict(list)
    for facility in coverage.get('facilities', []):
        for course_id in facility.get('libraryIds', []):
            facilities[course_id].append(facility)
    cards = defaultdict(list)
    for card in snapshot.get('scorecards', []):
        cards[card['course_id']].append(card)
    discoveries = {row['courseId']: row for row in (discovery or []) if row.get('courseId')}
    existing_pins = defaultdict(list)
    for facility in existing.facilities.values():
        for pin in facility.get('sourcePins', {}).get('osm', []):
            existing_pins[pin].append(facility['facilityId'])

    # Legacy cohort intake remains the manifest constructor and merged-catalog
    # writer. Its usage filter is deliberately disabled for complete snapshots.
    rows = build_entries(snapshot, coverage, snapshot, existing, min_rounds=0)
    planned_facility_pins = {}
    for row in rows:
        course_id = row['libraryId']
        course = by_id[course_id]
        matches = facilities[course_id]
        facility = matches[0] if len(matches) == 1 else {}
        osm = facility.get('osmCourse') or {}
        pin = _pin(facility)
        layout_id = row.get('layoutId') or slugify(course['name'])
        profiles, rejected = import_profiles(cards[course_id], layout_id, snapshot.get('queriedAt', ''), content_hash(snapshot))
        source_country = course.get('country') or facility.get('country')
        region = (course.get('state') or facility.get('state') or '').upper()
        country = {'USA': 'US', 'UNITED STATES': 'US', 'CANADA': 'CA'}.get(str(source_country).upper(), str(source_country or '').upper())
        if not country and region in US_REGIONS:
            country = 'US'
        row.update(libraryCourse=copy.deepcopy(course), sourceScorecards=profiles, rejectedScorecards=rejected,
                   evidence={'coverageMatches': len(matches), 'coverageGeneratedAt': coverage.get('generatedAt'),
                             'coverageLibraryIds': facility.get('libraryIds', []), 'coverageLibraryNames': facility.get('libraryNames', []),
                             'sourcePin': pin, 'explicitSourcePin': bool(facility.get('osmPin')), 'osmCourse': osm,
                             'featureBasis': facility.get('featureBasis'), 'holeFeatureCount': facility.get('holes'),
                             'resolvedCountry': country or None,
                             'countryBasis': 'source country' if source_country else 'US state code' if country else 'unknown',
                             'existingFacilitiesAtPin': existing_pins.get(pin, []),
                             'retainedDiscovery': discoveries.get(course_id)},
                   holdReasons=[])
        if row['status'] == 'catalogued':
            continue

        def hold(code, detail, row=row):
            row['holdReasons'].append({'code': code, 'detail': detail})

        if len(matches) != 1:
            hold('COVERAGE_BINDING_AMBIGUOUS' if matches else 'COVERAGE_MISSING',
                 f'{len(matches)} retained coverage records bind this exact library UUID; one unambiguous source record is required.')
        if country != 'US' or region not in US_REGIONS:
            hold('COUNTRY_PROVIDER_UNSUPPORTED', f'Country {country or "unknown"}, region {region or "unknown"}: the current USGS/NAIP intake policy is US-only; retain this course for a country-specific provider.')
        siblings = [value for value in facility.get('libraryIds', []) if value != course_id]
        if siblings:
            hold('ALIAS_OR_SIBLING_REVIEW', 'The coverage audit grouped distinct course UUIDs: ' + ', '.join(siblings) + '. A shared name/polygon does not establish alias or layout identity.')
        if not pin or not osm.get('center'):
            hold('SOURCE_AOI_UNRESOLVED', 'No retained course polygon pin with a recorded center; nearby city/neighborhood anchors cannot establish the course AOI.')
        if not profiles:
            hold('SCORECARD_REQUIRED', 'No valid exported tee profile exists for this exact course UUID; do not assume an 18-hole layout.')
        counts = {len(profile['holes']) for profile in profiles}
        if len(counts) > 1:
            hold('LAYOUT_HOLE_COUNT_AMBIGUOUS', 'Exported tee profiles have different hole counts; resolve the physical layout before intake.')
        if len(counts) == 1 and (facility.get('holes') or 0) >= next(iter(counts)) + 9:
            hold('MULTI_LAYOUT_SOURCE_REVIEW', f"The retained source contains {facility['holes']} hole features for a {next(iter(counts))}-hole scorecard; the intended subcourse/rotation is unresolved.")
        if not facility.get('osmPin') and re.fullmatch(r'(north|south|east|west)( course)?', (osm.get('name') or '').strip(), re.IGNORECASE):
            direction = osm['name'].lower().split()[0]
            if direction not in (course.get('name') or '').lower().split():
                hold('SUBCOURSE_IDENTITY_UNRESOLVED', f"The course name does not identify the source subcourse {osm['name']!r}; the audit match alone is insufficient.")
        if existing_pins.get(pin):
            hold('EXISTING_SITE_IDENTITY_REVIEW', 'The source pin is already catalogued under ' + ', '.join(existing_pins[pin]) + '; bind a distinct layout or alias only after explicit identity evidence.')
        if row['status'] != 'ready_to_write':
            hold('INTAKE_NOT_READY', row.get('reason') or 'Legacy intake did not produce a C0 candidate.')
        else:
            doc = row['docs']['facility']
            previous = existing.facilities.get(doc['facilityId'])
            previous_pin = (previous or {}).get('aoi', {}).get('id') or planned_facility_pins.get(doc['facilityId'])
            if previous_pin and previous_pin != pin:
                hold('FACILITY_SLUG_COLLISION', f"Facility id {doc['facilityId']} already names {previous_pin}; this candidate names {pin}. Names cannot merge facilities.")
            if not row['holdReasons']:
                planned_facility_pins[doc['facilityId']] = pin
                doc['country'] = country
                doc['providerPolicy']['imagery'] = imagery_policy(region)
                doc['notes'] = [f"Complete library snapshot {snapshot.get('queriedAt')}; retained coverage {coverage.get('generatedAt')}. OSM pin is a discovery AOI candidate, not physical admission.",
                                f"Retained coverage basis: {facility.get('featureBasis') or 'unspecified'}; {row['features']}."]
                doc['notes'].extend(note for note in (facility.get('notes') or [])[:18] if isinstance(note, str))
                row['docs']['layout']['notes'] = [f"Complete library intake of exact course UUID {course_id}; no usage threshold. C0 only: routes, bbox and geometry remain unresolved. Shared names/proximity establish no physical association."]
                row['docs']['scorecards'] = profiles
                row['docs']['layout']['scorecardProfiles'] = [profile['profileId'] for profile in profiles]
                row['docs']['layout']['referenceScorecardProfileId'] = profiles[0]['profileId']
        if row['holdReasons']:
            row.update(status='held', reason='; '.join(reason['code'] for reason in row['holdReasons']))
            row.pop('docs', None)

    counts = Counter(row['status'] for row in rows)
    exported_tees = {card.get('tee_id') for card in snapshot.get('scorecards', [])}
    dossier = {
        'schema': 'golfhelm-library-intake-dossier-v1', 'snapshotQueriedAt': snapshot.get('queriedAt'),
        'inputs': {'snapshotHash': content_hash(snapshot), 'coverageHash': content_hash(coverage),
                   'catalogHash': content_hash(existing.canonical_hash_inputs()), 'discoveryHash': content_hash(discovery or [])},
        'summary': {'libraryCourses': len(courses), 'catalogued': counts['catalogued'], 'unmatched': len(courses) - counts['catalogued'],
                    'readyToWrite': counts['ready_to_write'], 'held': counts['held'],
                    'sourceTeeCount': snapshot['completeness']['tees'], 'exportedTeeIds': len(exported_tees),
                    'sourceTeesNotRepresentedInScorecards': snapshot['completeness']['tees'] - len(exported_tees),
                    'validSourceProfiles': sum(len(row['sourceScorecards']) for row in rows),
                    'rejectedSourceProfiles': sum(len(row['rejectedScorecards']) for row in rows),
                    'newCatalogProfiles': sum(len(row['docs']['scorecards']) for row in rows if row.get('docs')),
                    'holdReasonCounts': dict(sorted(Counter(reason['code'] for row in rows for reason in row['holdReasons']).items()))},
        'rows': rows,
    }
    dossier['planHash'] = content_hash(dossier)
    return dossier
