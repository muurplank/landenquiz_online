// Outline of one country as an SVG, shared by the Omtrek quiz and the mix.
import { escapeHtml as esc } from '../core/text.js';

const W = 400, H = 300;

// The outline in an equal-area projection centred on the country. First framed on the large parts
// (at least 10% of the largest) that lie in a chain within ~2200 km of each other (Malaysia's two
// halves, Indonesia, not French Guiana or Alaska). Then nearby islands are added (Croatia's coast);
// far-away parts are left out instead of cut off at the edge.
export function outlineSvg(geo, id, label) {
  const f = geo.byId.get(id), main = geo.main.get(id);
  const parts = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) : [f.geometry];
  const biggest = Math.max(...parts.map(p => d3.geoArea(p)));
  const multi = ps => ({ type: 'MultiPolygon', coordinates: ps.map(p => p.coordinates) });
  const c = d3.geoCentroid(main);
  const proj = d3.geoAzimuthalEqualArea().rotate([-c[0], -c[1]]).clipAngle(150);
  const fit = ps => proj.fitExtent([[16, 16], [W - 16, H - 16]], multi(ps));
  const large = parts.filter(p => d3.geoArea(p) >= biggest * .1).map(p => ({ p, c: d3.geoCentroid(p) }));
  const core = [large.find(x => d3.geoArea(x.p) === biggest)];
  for (let added = true; added;) {
    added = false;
    for (const x of large) if (!core.includes(x) && core.some(y => d3.geoDistance(x.c, y.c) * 6371 < 2200)) { core.push(x); added = true; }
  }
  fit(core.map(x => x.p));
  const path = d3.geoPath(proj);
  const near = parts.filter(p => { const [[x0, y0], [x1, y1]] = path.bounds(p); return x1 > -W * .25 && x0 < W * 1.25 && y1 > -H * .25 && y0 < H * 1.25; });
  fit(near);
  return `<svg class="outline-shape" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><path d="${path(multi(near))}"/></svg>`;
}
