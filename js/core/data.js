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
  const loaders = { world: loadWorld, us: loadUs };
  if (!datasets.has(name)) datasets.set(name, loaders[name] ? loaders[name]() : Promise.reject(new Error(`Onbekende dataset: ${name}`)));
  return datasets.get(name);
}

async function loadWorld() {
  const [countries, groups, iso2, capAt] = await Promise.all([
    loadJSON('data/countries.json'),
    loadJSON('data/groups.json'),
    loadJSON('data/iso3-to-iso2.json'),
    loadJSON('data/capital_locations.json')
  ]);
  const items = new Map();
  for (const c of countries) {
    const code = typeof iso2[c.iso] === 'string' ? iso2[c.iso] : c.iso;
    items.set(c.iso, {
      id: c.iso,
      name: c.name_nl,
      answers: c.capitals_nl || [],
      region: c.continent,
      capitalAt: capAt[c.iso] || null,
      flag: siteUrl(`assets/flags/${code.toLowerCase()}.svg`)
    });
  }
  return {
    name: 'world',
    title: 'De wereld',
    noun: { one: 'land', many: 'landen', One: 'Land', which: 'Welk', the: 'het', The: 'Het', this: 'dit', every: 'Elk' },
    unit: { one: 'week', many: 'weken' },
    geo: siteUrl('assets/maps/world.detail.json'),
    items,
    groups,
    regionTitle: r => CONTINENT_NL[r] || r,
    regions: CONTINENT_ORDER
  };
}

async function loadUs() {
  const [states, groups] = await Promise.all([loadJSON('data/us/states.json'), loadJSON('data/us/groups.json')]);
  const items = new Map(states.map(s => [s.id, {
    id: s.id, code: s.code, name: s.name, aliases: s.aliases, answers: [s.capital],
    capitalAt: s.capital_at, region: s.region,
    flag: siteUrl(`assets/flags/us/us-${s.code.toLowerCase()}.svg`)
  }]));
  const titles = Object.fromEntries(groups.map(g => [g.id, g.title]));
  return {
    name: 'us',
    title: 'VS-staten',
    noun: { one: 'staat', many: 'staten', One: 'Staat', which: 'Welke', the: 'de', The: 'De', this: 'deze', every: 'Elke' },
    unit: { one: 'week', many: 'weken' },
    geo: siteUrl('assets/maps/us.detail.json'),
    items,
    groups,
    regionTitle: r => titles[r] || r,
    regions: groups.map(g => g.id),
    singleSection: 'Verenigde Staten'
  };
}

/**
 * Own selection of weeks/regions: 'sel.<group id>.<group id>…'. It is rebuilt from the data itself,
 * so it works on every device without storage, and its progress is kept under its own id (and synced).
 */
export const selectionId = groupIds => 'sel.' + [...groupIds].sort().join('.');
export function selectionGroup(ds, id) {
  if (!id || !id.startsWith('sel.')) return null;
  const parts = id.slice(4).split('.').map(g => ds.groups.find(x => x.id === g)).filter(Boolean);
  if (!parts.length) return null;
  const names = parts.map(g => ds.name === 'world' ? shortTitle(g) : g.title);
  return {
    id, continent: 'Custom', parts: parts.map(g => g.id),
    title: parts.length <= 3 ? names.join(' + ') : `Mijn selectie · ${parts.length} ${ds.unit.many}`,
    countries: [...new Set(parts.flatMap(g => g.countries))]
  };
}

/** Group by id: a week/region, a selection ('sel.…', or the older 'custom'), 'world' or 'continent_<name>'. */
export async function getGroup(ds, id) {
  if (id && id.startsWith('sel.')) {
    const g = selectionGroup(ds, id);
    if (!g) throw new Error('Deze selectie bestaat niet (meer). Kies opnieuw weken op de overzichtspagina.');
    return g;
  }
  if (id === 'custom') {
    const g = getCustomGroup();
    if (!g || !g.countries || !g.countries.length || (g.dataset || 'world') !== ds.name) throw new Error('Geen selectie gevonden. Kies eerst weken op de overzichtspagina.');
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
/** "Week 4" or "Regio 2": the label above a set card. */
export function groupLabel(g) {
  if (g.label) return g.label;
  const n = weekNumber(g);
  return n === null ? '' : `Week ${n}`;
}
export function weekNumber(g) {
  const m = g.title.match(/^Week (\d+)/);
  return m ? Number(m[1]) : null;
}
