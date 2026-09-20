#!/usr/bin/env python3
"""Select active-library courses geographically near active GolfHelm schools.

The result is a *build-priority cohort*, not geographic evidence for a golf
hole. Each source coordinate retains whether it was an address/name geocode or
a city centroid, so proximity can never certify a tee, green, route or yardage.

    python3 build-team-nearby-course-cohort.py library-snapshot.json out-dir \
      --max-miles 75
"""
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NOMINATIM = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'GolfHelm team course-factory proximity selection (read-only, cached)'
EARTH_MILES = 3958.7613


def request(query):
    req = Request(f'{NOMINATIM}?{urlencode({"q": query, "format": "json", "limit": 1})}', headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urlopen(req, timeout=45) as response:
        rows = json.loads(response.read().decode('utf-8'))
    if not rows:
        return None
    row = rows[0]
    return {'latitude': float(row['lat']), 'longitude': float(row['lon']), 'displayName': row.get('display_name')}


def queries_for_school(team):
    return [
        (', '.join(x for x in (team.get('schoolName'), team.get('city'), team.get('state'), 'USA') if x), 'derived_school_geocode'),
        (', '.join(x for x in (team.get('city'), team.get('state'), 'USA') if x), 'estimated_school_city_anchor'),
    ]


def queries_for_course(course):
    country = course.get('country') or 'USA'
    attempts = []
    if course.get('address'):
        attempts.append((', '.join(x for x in (course.get('address'), course.get('city'), course.get('state'), country) if x), 'derived_address_geocode'))
    attempts.append((', '.join(x for x in (course.get('name'), course.get('city'), course.get('state'), country) if x), 'derived_name_geocode'))
    # The city fallback deliberately has a weaker class. It is enough to
    # discover nearby library rows but cannot be misread as the golf course's
    # physical location.
    attempts.append((', '.join(x for x in (course.get('city'), course.get('state'), country) if x), 'estimated_city_anchor'))
    return attempts


def coordinate(cache, cache_key, attempts):
    """Use the strongest available geocode, then an explicitly weak city
    fallback. Old cache entries are upgraded lazily without repeating already
    failed requests."""
    cached = cache.get(cache_key)
    if cached and not cached.get('missing'):
        return cached
    previous = cached.get('attempts', []) if isinstance(cached, dict) else []
    if cached and cached.get('query'):
        previous = previous or [{'query': cached['query'], 'truthClass': cached.get('truthClass'), 'missing': bool(cached.get('missing'))}]
    seen = {entry.get('query') for entry in previous}
    for query, truth_class in attempts:
        if not query or query in seen:
            continue
        value = request(query)
        attempt = {'query': query, 'truthClass': truth_class, 'missing': value is None}
        previous.append(attempt)
        time.sleep(1.05)  # Nominatim's public use policy: bounded, one request/sec.
        if value:
            result = {'query': query, 'truthClass': truth_class, 'attempts': previous, **value}
            cache[cache_key] = result
            return result
    result = {'query': attempts[-1][0], 'truthClass': attempts[-1][1], 'attempts': previous, 'missing': True}
    cache[cache_key] = result
    return result


def miles(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a['latitude'], a['longitude'], b['latitude'], b['longitude']))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return EARTH_MILES * 2 * math.asin(math.sqrt(h))


def build(snapshot, cache, max_miles):
    schools = []
    for team in snapshot.get('teams', []):
        if not team.get('city') or not team.get('state'):
            continue
        point = coordinate(cache, f"school:{team['id']}", queries_for_school(team))
        if not point.get('missing'):
            schools.append((team, point))
    selected = []
    missing = []
    for course in snapshot.get('courses', []):
        if not course.get('city') or not course.get('state'):
            missing.append({'courseId': course['id'], 'course': course['name'], 'reason': 'library row lacks city or state'})
            continue
        point = coordinate(cache, f"course:{course['id']}", queries_for_course(course))
        if point.get('missing'):
            missing.append({'courseId': course['id'], 'course': course['name'], 'reason': 'public geocoder returned no coordinate'})
            continue
        matches = []
        for team, school in schools:
            distance = miles(point, school)
            if distance <= max_miles:
                matches.append({'teamId': team['id'], 'team': team['name'], 'school': team['schoolName'], 'distanceMiles': round(distance, 1),
                                'schoolCoordinateTruthClass': school['truthClass']})
        if matches:
            selected.append({
                'id': course['id'], 'name': course['name'], 'city': course['city'], 'state': course['state'], 'country': course.get('country'),
                # Existing intake ranks by this numeric field. Here it means
                # the number of active nearby teams, never a round count.
                'completed_rounds': len(matches),
                'selection': {'kind': 'active_team_school_proximity', 'maxMiles': max_miles, 'courseCoordinateTruthClass': point['truthClass'],
                              'courseCoordinate': [point['longitude'], point['latitude']], 'matches': sorted(matches, key=lambda m: (m['distanceMiles'], m['team']))},
            })
    selected.sort(key=lambda row: (-row['completed_rounds'], row['name']))
    return schools, selected, missing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot')
    parser.add_argument('output')
    parser.add_argument('--max-miles', type=float, default=75.0)
    args = parser.parse_args()
    if args.max_miles <= 0 or args.max_miles > 300:
        raise SystemExit('--max-miles must be > 0 and <= 300')
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    cache_path = out / 'geocode-cache.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    snapshot = json.loads(Path(args.snapshot).read_text())
    schools, courses, missing = build(snapshot, cache, args.max_miles)
    cache_path.write_text(json.dumps(cache, indent=2) + '\n')
    cohort = {'schema': 'golfhelm-team-proximity-cohort-v1', 'queriedAt': snapshot.get('queriedAt'),
              'selection': {'kind': 'active_team_school_proximity', 'maxMiles': args.max_miles,
                            'limitation': 'School and course locations are geocoded anchors only. They select factory priority and never establish physical course geometry.'},
              'courses': courses}
    (out / 'cohort.json').write_text(json.dumps(cohort, indent=2) + '\n')
    report = {'schema': 'golfhelm-team-proximity-report-v1', 'queriedAt': snapshot.get('queriedAt'), 'maxMiles': args.max_miles,
              'schoolsConsidered': [{'teamId': team['id'], 'team': team['name'], 'school': team['schoolName'], 'coordinateTruthClass': point['truthClass']} for team, point in schools],
              'selectedCourses': courses, 'unlocatedCourses': missing}
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'selected {len(courses)} courses near {len(schools)} active school anchors; {len(missing)} library rows could not be located')


if __name__ == '__main__':
    main()
