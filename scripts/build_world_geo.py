"""Bouwt assets/maps/world.detail.json uit high_res_usa.json (Natural Earth 1:10m).

Niets wordt vereenvoudigd: alle grenspunten blijven, coördinaten worden alleen
afgerond op 4 decimalen (~11 m). Elk land krijgt `id` = ISO3 (zoals in
data/countries.json) en een ankerpunt (lx/ly) voor de stip bij kleine landen.

Gebruik: python3 scripts/build_world_geo.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/maps/high_res_usa.json')
OUT = os.path.join(ROOT, 'assets/maps/world.detail.json')
ID_FIX = {'KOS': 'XKX'}


def ring(r):
    out, last = [], None
    for x, y in r:
        p = [round(x, 4), round(y, 4)]
        if p != last:
            out.append(p)
            last = p
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def main():
    src = json.load(open(SRC))
    feats = []
    for f in src['features']:
        p = f['properties']
        iso = p.get('iso_a3')
        if iso in (None, '-99'):
            iso = ID_FIX.get(p.get('adm0_a3'), p.get('adm0_a3'))
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        feats.append({
            'type': 'Feature', 'id': iso,
            'properties': {'lx': p.get('label_x'), 'ly': p.get('label_y')},
            'geometry': {'type': 'MultiPolygon', 'coordinates': [[ring(r) for r in poly] for poly in polys]},
        })
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(OUT, 'w'), separators=(',', ':'))
    print(f'{len(feats)} landen -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
