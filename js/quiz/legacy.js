// Temporary: quiz types that are not rebuilt yet open the existing pages.
import { siteUrl } from '../core/data.js';

export function legacyUrl(params) {
  const id = encodeURIComponent(params.set);
  const inf = params.infinite === '1' ? '&infinite=1' : '';
  switch (params.type) {
    case 'map':
      if (params.dir === 'b') return siteUrl(`pages/quiz_map_zoek.html?id=${id}${inf}`);
      return siteUrl(`pages/quiz_map.html?id=${id}${params.ans === 'self' ? '&mode=snelle' : inf}`);
    case 'mix':
      if (params.mix === 'mega') return siteUrl(`pages/quiz_mix.html?id=${id}&mega=1${inf}`);
      if (params.mix === 'own') return siteUrl(`pages/quiz_mix.html?id=${id}&custom=${encodeURIComponent(params.custom || '')}${inf}`);
      return siteUrl(`pages/quiz_mix.html?id=${id}${inf}`);
    default:
      return siteUrl(`pages/quiz_kwartet.html?id=${id}${inf}`);
  }
}

export function createMode({ params }) {
  location.replace(legacyUrl(params));
  throw new Error('Deze quiz opent op de vorige versie van de site…');
}
