"""Read-only USGS 1m candidate discovery for a bounded prepared study.

Usage: python3 fetch-terrain-study.py package.json physical-key output-cache
Locks one full-coverage source tile; does not silently mosaic mixed source dates.
"""
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Polygon, box

spec = importlib.util.spec_from_file_location('fetch', Path(__file__).with_name('fetch-terrain-pilot.py'))
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)


def points(value):
    if isinstance(value[0], (float, int)):
        yield value
    else:
        for child in value:
            yield from points(child)


def main():
    package_path, key, output_path = sys.argv[1:]
    out = Path(output_path)
    out.mkdir(parents=True, exist_ok=True)
    names = ['catalog.json','export.json','elevation.tiff']
    if all((out/name).exists() for name in names):
        print('Using immutable local candidate cache')
        return
    if any((out/name).exists() for name in names):
        raise ValueError('Incomplete source cache; preserve it and use another directory')
    pkg = json.loads(Path(package_path).read_text())
    hole = next(h for h in pkg['holes'] if h['key'] == key)
    coords = [p for f in pkg['features'] if f['id'] in hole['featureIds'] and f['kind'] != 'woods' for p in points(f['geometryWgs84']['coordinates'])]
    w,s,e,n = min(p[0] for p in coords)-.0007,min(p[1] for p in coords)-.0007,max(p[0] for p in coords)+.0007,max(p[1] for p in coords)+.0007
    if max(e-w,n-s)>.02:
        raise ValueError('Unbounded physical context; review feature selection')
    catalog = fetch.request('query', {'where':'Category=1','geometry':json.dumps({'x':(w+e)/2,'y':(s+n)/2,'spatialReference':{'wkid':4326}}),
        'geometryType':'esriGeometryPoint','inSR':4326,'spatialRel':'esriSpatialRelIntersects',
        'outFields':'OBJECTID,Name,title,URL,StartDate,EndDate,Resolution_X,VerticalDatum','returnGeometry':'true','outSR':4326})
    candidates = [f for f in catalog.get('features',[]) if f['attributes']['title'].startswith('USGS 1 Meter ')
                  and Polygon(f['geometry']['rings'][0]).covers(box(w,s,e,n))]
    if not candidates:
        raise ValueError('No USGS 1m product found at this study point' if not any(f['attributes']['title'].startswith('USGS 1 Meter ') for f in catalog.get('features', [])) else 'No single full-coverage 1m tile; source mosaic review required')
    selected = max(candidates,key=lambda f:str(f['attributes']['EndDate']))['attributes']
    result = fetch.request('exportImage', {'bbox':','.join(map(str,[w,s,e,n])),'bboxSR':4326,'imageSR':4326,
        'size':'512,512','format':'tiff','pixelType':'F32','interpolation':'RSP_BilinearInterpolation',
        'renderingRule':json.dumps({'rasterFunction':'None'}),
        'mosaicRule':json.dumps({'mosaicMethod':'esriMosaicLockRaster','lockRasterIds':[selected['OBJECTID']]})})
    # Returned aspect-fit bounds must also lie inside the chosen source tile.
    ex=result['extent']
    footprint=next(f['geometry']['rings'][0] for f in candidates if f['attributes']['OBJECTID']==selected['OBJECTID'])
    if not Polygon(footprint).covers(box(ex['xmin'],ex['ymin'],ex['xmax'],ex['ymax'])):
        raise ValueError('Aspect-fitted export crosses source tile boundary')
    pixels=fetch.read(result['href'],2_000_000)
    result.update(selectedObjectId=selected['OBJECTID'],retrievedAt=datetime.now(timezone.utc).date().isoformat())
    (out/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
    (out/'export.json').write_text(json.dumps(result,indent=2)+'\n')
    (out/'elevation.tiff').write_bytes(pixels)
    print(key+': '+selected['title'],flush=True)


if __name__=='__main__':
    main()
