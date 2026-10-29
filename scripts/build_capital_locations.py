"""Bouwt data/capital_locations.json ({ISO3: [lon, lat]}) uit Natural Earth populated places.

Gebruik: python3 scripts/build_capital_locations.py <ne_10m_populated_places_simple.geojson>
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = {'XKX': 'KOS', 'SSD': 'SDS'}
MANUAL = {'NRU': [166.9209, -0.5477]}  # Yaren staat niet in de bron

places = [f['properties'] for f in json.load(open(sys.argv[1]))['features']]
countries = json.load(open(os.path.join(ROOT, 'data/countries.json')))
caps = {}
for p in places:
    if p.get('featurecla') == 'Admin-0 capital':
        caps.setdefault(p['adm0_a3'], []).append(p)
out = {}
for c in countries:
    cands = caps.get(FIX.get(c['iso'], c['iso']), [])
    if cands:
        out[c['iso']] = [round(cands[0]['longitude'], 4), round(cands[0]['latitude'], 4)]
out.update(MANUAL)
json.dump(out, open(os.path.join(ROOT, 'data/capital_locations.json'), 'w'), separators=(',', ':'))
print(len(out), 'hoofdsteden')
