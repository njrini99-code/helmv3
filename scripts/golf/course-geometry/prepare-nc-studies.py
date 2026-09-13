"""Partial, unnumbered green studies where played-hole routing is not verified.

Original OSM boundaries only. High-resolution NC imagery is a visual review
reference, never silently traced into a publicly distributed derived package.
"""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from shapely.geometry import Point, Polygon, box, mapping

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'src/test/fixtures/course-geometry'
CACHE = BASE / 'sources/top-course-osm'


def main():
    discovery = json.loads((CACHE / 'discovery.json').read_text())
    for name, slug, center in [('Bryan Park Champs', 'bryan', [-79.7388922,36.1738712]),
                                ('The Cardinal','cardinal',[-79.91585,36.13665])]:
        source = next(c for c in discovery if c['name'] == name)
        root = ET.fromstring(gzip.decompress((CACHE / source['sourceFile']).read_bytes()))
        nodes = {n.get('id'): [float(n.get('lon')),float(n.get('lat'))] for n in root.findall('node')}
        raw = []
        for way in root.findall('way'):
            tags = {t.get('k'):t.get('v') for t in way.findall('tag')}
            kind = 'woods' if tags.get('natural') == 'wood' or tags.get('landuse') == 'forest' else 'water' if tags.get('natural') == 'water' or tags.get('golf') in ('water_hazard','lateral_water_hazard') else tags.get('golf')
            if kind not in ('green','bunker','woods','water','fairway'):
                continue
            coords = [nodes[n.get('ref')] for n in way.findall('nd') if n.get('ref') in nodes]
            if len(coords) != len(way.findall('nd')) or len(coords)<4 or coords[0]!=coords[-1]:
                continue
            shape = Polygon(coords)
            if not shape.is_valid:
                continue
            raw.append((way.get('id'), kind, shape))
        greens = [f for f in raw if f[1]=='green']
        selected_green = min(greens,key=lambda f:f[2].distance(Point(center)))
        assert selected_green[2].distance(Point(center)) < .0003
        key = slug + '-green-study'
        selected = [selected_green]
        for feature in raw:
            if feature[1] not in ('bunker','water') or feature[2].distance(selected_green[2])>.00045:
                continue
            nearest = min(greens,key=lambda g:g[2].distance(feature[2]))
            if nearest[0] == selected_green[0]:
                selected.append(feature)
        w,s,e,n = selected_green[2].bounds
        for ident,kind,shape in raw:
            if kind == 'woods':
                crop = shape.intersection(box(w-.00055,s-.00045,e+.00055,n+.00045))
                if not crop.is_empty and crop.geom_type in ('Polygon','MultiPolygon'):
                    selected.append((ident+'-context-crop',kind,crop))
        features = [{'id':'osm-way-'+ident,'kind':kind,'sourceIds':['osm'],'holeKeys':[key],
                    'geometryWgs84':mapping(shape),'reviewed':False,'accuracyMeters':None} for ident,kind,shape in selected]
        green_id = 'osm-way-'+selected_green[0]
        pkg = {'schemaVersion':1,'siteId':slug+'-unassigned-study','name':name+' · unassigned green study',
               'status':'source_candidate','originWgs84':center,'projection':'wgs84-local-enu-v1',
               'sources':[{'id':'osm','provider':'OpenStreetMap','licenseId':'ODbL-1.0','url':source['sourceUrl'],
                           'capturedAt':None,'retrievedAt':'2026-09-13','attribution':'© OpenStreetMap contributors · ODbL 1.0'}],
               'features':features,'holes':[{'key':key,'displayLabel':'Unassigned green complex · layout review pending',
                   'ordinal':1,'par':4,'scorecardYards':None,'featureIds':[f['id'] for f in features],
                   'routeFeatureId':None,'greenFeatureId':green_id,'nominalTargetWgs84':None,'completeness':'partial',
                   'gaps':['Study ordinal and par are internal placeholders, never a playable-hole binding or displayed scorecard',
                           'No accepted routing, fairway, tee, daily pin or observed ball coordinates',
                           'Current bunker renovation review pending' if slug=='bryan' else 'Played hole number unresolved']}]}
        pkg['contentHash']=hashlib.sha256(json.dumps(pkg,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        (BASE/(slug+'-study.json')).write_text(json.dumps(pkg,separators=(',',':'))+'\n')
        print(slug,len(features),green_id)


if __name__ == '__main__':
    main()
