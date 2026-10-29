"""Bouwt data/borders.json: per land (ISO3) de landen waarmee het een landgrens deelt.

Twee landen zijn buren als hun grenzen minstens 2 identieke punten delen in
assets/maps/world.detail.json (Natural Earth 1:10m deelt de punten van gedeelde
grenzen exact). Alleen landen uit data/countries.json tellen mee.

Gebruik: python3 scripts/build_borders.py
"""
import json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
geo = json.load(open(os.path.join(ROOT, 'assets/maps/world.detail.json')))
known = {c['iso'] for c in json.load(open(os.path.join(ROOT, 'data/countries.json')))}

owners = defaultdict(set)
for f in geo['features']:
    if f['id'] not in known:
        continue
    for poly in f['geometry']['coordinates']:
        for ring in poly:
            for x, y in ring:
                owners[(x, y)].add(f['id'])

shared = defaultdict(int)
for ids in owners.values():
    if len(ids) > 1:
        ids = sorted(ids)
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                shared[(ids[i], ids[j])] += 1

borders = {iso: [] for iso in sorted(known)}
for (a, b), n in shared.items():
    if n >= 2:
        borders[a].append(b)
        borders[b].append(a)
for v in borders.values():
    v.sort()
json.dump(borders, open(os.path.join(ROOT, 'data/borders.json'), 'w'), separators=(',', ':'))
print(sum(len(v) for v in borders.values()) // 2, 'grenzen;', sum(1 for v in borders.values() if not v), 'landen zonder landgrens')
