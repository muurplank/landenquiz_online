"""Bouwt de VS-dataset uit Natural Earth 1:10m:
  data/us/states.json, data/us/groups.json en assets/maps/us.detail.json

Gebruik: python3 scripts/build_us_data.py <ne_10m_admin_1_states_provinces.geojson> <ne_10m_populated_places_simple.geojson>
Grenzen worden niet vereenvoudigd, alleen afgerond op 4 decimalen (~11 m).
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Nederlandse namen waar die afwijken; de Engelse naam blijft altijd goed bij typen.
NL = {'California': 'Californië', 'Hawaii': 'Hawaï', 'North Carolina': 'Noord-Carolina', 'South Carolina': 'Zuid-Carolina',
      'North Dakota': 'Noord-Dakota', 'South Dakota': 'Zuid-Dakota', 'West Virginia': 'West-Virginia'}
REGIONS = [  # 5 sets van precies 10 staten
    ('us_noordoost', 'Noordoosten', ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE']),
    ('us_zuidoost', 'Zuidoosten', ['MD', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'KY', 'TN', 'AL']),
    ('us_zuid', 'Zuiden en Zuidwesten', ['MS', 'LA', 'AR', 'MO', 'KS', 'OK', 'TX', 'NM', 'AZ', 'CO']),
    ('us_middenwesten', 'Middenwesten', ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'NE', 'SD', 'ND']),
    ('us_westen', 'Westen en Pacific', ['MT', 'WY', 'ID', 'UT', 'NV', 'CA', 'OR', 'WA', 'AK', 'HI']),
]
CAPITAL_FIX = {'St.  Paul': 'Saint Paul'}


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


def main(admin1_path, places_path):
    admin1 = [f for f in json.load(open(admin1_path))['features'] if f['properties'].get('iso_a2') == 'US' and f['properties']['postal'] != 'DC']
    caps = {p['adm1name']: p for p in (f['properties'] for f in json.load(open(places_path))['features'])
            if p.get('adm0_a3') == 'USA' and p.get('featurecla') == 'Admin-1 capital'}
    region_of = {code: rid for rid, _, codes in REGIONS for code in codes}

    states, feats = [], []
    for f in sorted(admin1, key=lambda f: f['properties']['name']):
        p = f['properties']
        code, en = p['postal'], p['name']
        cap = caps[en]
        sid = f'US-{code}'
        states.append({
            'id': sid, 'code': code, 'name': NL.get(en, en), 'aliases': [en] if en in NL else [],
            'capital': CAPITAL_FIX.get(cap['name'], cap['name']), 'capital_at': [round(cap['longitude'], 4), round(cap['latitude'], 4)],
            'region': region_of[code],
        })
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        feats.append({'type': 'Feature', 'id': sid, 'properties': {'lx': p.get('longitude'), 'ly': p.get('latitude')},
                      'geometry': {'type': 'MultiPolygon', 'coordinates': [[ring(r) for r in poly] for poly in polys]}})

    assert len(states) == 50, len(states)
    assert all(len(codes) == 10 for _, _, codes in REGIONS) and len(region_of) == 50
    groups = [{'id': rid, 'title': title, 'label': f'Week {i + 1}', 'continent': rid, 'countries': [f'US-{c}' for c in codes]}
              for i, (rid, title, codes) in enumerate(REGIONS)]
    json.dump(states, open(os.path.join(ROOT, 'data/us/states.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(groups, open(os.path.join(ROOT, 'data/us/groups.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(ROOT, 'assets/maps/us.detail.json'), 'w'), separators=(',', ':'))
    print(f'{len(states)} staten, {len(groups)} weken, kaart {os.path.getsize(os.path.join(ROOT, "assets/maps/us.detail.json")) // 1024} KB')


if __name__ == '__main__':
    main(*sys.argv[1:3])
