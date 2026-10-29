// Data loading: datasets (world, later US states), groups and the custom selection.
// Every item has the same shape, so quiz code never needs to know which dataset it uses:
//   { id, name, answers: [capitals], region, flag }

const ROOT = new URL('../../', import.meta.url);
export const siteUrl = path => new URL(path, ROOT).href;

const jsonCache = new Map();
export function loadJSON(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetch(siteUrl(path)).then(r => {
      if (!r.ok) throw new Error(`Kon ${path} niet laden (${r.status})`);
      return r.json();
    }));
  }
  return jsonCache.get(path);
}

export const CONTINENT_NL = {
  'South America': 'Zuid-Amerika',
  'North America': 'Noord-Amerika',
  'Europe': 'Europa',
  'Oceania': 'Oceanië',
  'Africa': 'Afrika',
  'Asia': 'Azië'
};
const CONTINENT_ORDER = ['South America', 'North America', 'Europe', 'Africa', 'Asia', 'Oceania'];

const CUSTOM_GROUP_KEY = 'landjes_custom_group';

const datasets = new Map();

export function loadDataset(name = 'world') {
  if (!datasets.has(name)) datasets.set(name, name === 'world' ? loadWorld() : Promise.reject(new Error(`Onbekende dataset: ${name}`)));
  return datasets.get(name);
}

async function loadWorld() {
  const [countries, groups, iso2] = await Promise.all([
    loadJSON('data/countries.json'),
    loadJSON('data/groups.json'),
    loadJSON('data/iso3-to-iso2.json')
  ]);
  const items = new Map();
  for (const c of countries) {
    const code = typeof iso2[c.iso] === 'string' ? iso2[c.iso] : c.iso;
    items.set(c.iso, {
      id: c.iso,
      name: c.name_nl,
      answers: c.capitals_nl || [],
      region: c.continent,
      flag: siteUrl(`assets/flags/${code.toLowerCase()}.svg`)
    });
  }
  return {
    name: 'world',
    title: 'De wereld',
    noun: { one: 'land', many: 'landen', One: 'Land' },
    geo: siteUrl('assets/maps/world.detail.json'),
    items,
    groups,
    regionTitle: r => CONTINENT_NL[r] || r,
    regions: CONTINENT_ORDER
  };
}

/** Group by id: a week/region, 'custom', 'world' or 'continent_<name>'. */
export async function getGroup(ds, id) {
  if (id === 'custom') {
    const g = getCustomGroup();
    if (!g || !g.countries || !g.countries.length) throw new Error('Geen selectie gevonden. Kies eerst weken op de overzichtspagina.');
    return g;
  }
  if (id === 'world') return { id, title: 'Hele wereld', continent: 'World', countries: [...ds.items.keys()] };
  if (id && id.startsWith('continent_')) {
    const cont = id.slice('continent_'.length);
    return { id, title: ds.regionTitle(cont), continent: cont, countries: [...ds.items.values()].filter(i => i.region === cont).map(i => i.id) };
  }
  const g = ds.groups.find(x => x.id === id);
  if (!g) throw new Error(`Onbekende set: ${id}`);
  return g;
}

export function getCustomGroup() {
  try { return JSON.parse(sessionStorage.getItem(CUSTOM_GROUP_KEY) || 'null'); } catch (_) { return null; }
}

export function setCustomGroup(group) {
  try { sessionStorage.setItem(CUSTOM_GROUP_KEY, JSON.stringify(group)); } catch (_) { /* private mode */ }
}

/** Short display title: "Week 4 - Europa (deel 1)" -> "Europa · deel 1". */
export function shortTitle(g) {
  return g.title.replace(/^Week \d+ - /, '').replace(/ \(deel (\d+)\)/, ' · deel $1');
}
export function weekNumber(g) {
  const m = g.title.match(/^Week (\d+)/);
  return m ? Number(m[1]) : null;
}
