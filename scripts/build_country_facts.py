"""Bouwt data/country_facts.json voor Geo trivia: per land oppervlakte, inwoners,
of het aan zee ligt en het aantal buurlanden.

- Oppervlakte: berekend uit assets/maps/world.detail.json (sferische benadering, km²).
- Inwoners: pop_est (2019) uit Natural Earth (assets/maps/high_res_usa.json).
- Ingesloten (geen kust): vaste lijst van de 44 landen zonder zeekust (Kaspische Zee telt niet als zee).
Gebruik: python3 scripts/build_country_facts.py
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6371.0088
LANDLOCKED = set('AFG AND ARM AUT AZE BLR BTN BOL BWA BFA BDI CAF TCD CZE ETH HUN KAZ XKX KGZ LAO LSO LIE LUX MWI MLI MDA MNG NPL NER MKD PRY RWA SMR SRB SVK SSD CHE TJK TKM UGA UZB VAT ZMB ZWE'.split())


def ring_area(ring):
    # Same approximation as d3/turf: sum of (lon2 - lon1) * (2 + sin lat1 + sin lat2)
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        total += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
    return abs(total * R * R / 2)


countries = json.load(open(os.path.join(ROOT, 'data/countries.json')))
known = {c['iso'] for c in countries}
borders = json.load(open(os.path.join(ROOT, 'data/borders.json')))
detail = {f['id']: f for f in json.load(open(os.path.join(ROOT, 'assets/maps/world.detail.json')))['features']}
pop = {}
for f in json.load(open(os.path.join(ROOT, 'assets/maps/high_res_usa.json')))['features']:
    p = f['properties']
    iso = p.get('iso_a3') if p.get('iso_a3') not in (None, '-99') else {'KOS': 'XKX'}.get(p.get('adm0_a3'), p.get('adm0_a3'))
    if iso in known and p.get('pop_est'):
        pop[iso] = int(p['pop_est'])

facts = {}
for iso in sorted(known):
    area = None
    if iso in detail:
        area = 0.0
        for poly in detail[iso]['geometry']['coordinates']:
            area += ring_area(poly[0]) - sum(ring_area(h) for h in poly[1:])
        area = round(area)
    facts[iso] = {'area': area, 'pop': pop.get(iso), 'landlocked': iso in LANDLOCKED, 'neighbours': len(borders.get(iso, []))}
json.dump(facts, open(os.path.join(ROOT, 'data/country_facts.json'), 'w'), separators=(',', ':'))
print(len(facts), 'landen;', sum(1 for f in facts.values() if f['pop']), 'met inwoners;', sum(f['landlocked'] for f in facts.values()), 'ingesloten')
