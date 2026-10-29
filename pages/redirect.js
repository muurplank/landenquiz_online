// Old page addresses (bookmarks, shared links) forward to the new pages.
(function () {
  var p = new URLSearchParams(location.search);
  var page = location.pathname.split('/').pop().replace('.html', '');
  var id = p.get('id') || '';
  var mode = p.get('mode') || '';
  var q = new URLSearchParams();
  var target = 'quiz.html';
  var dir = { 'land-to-capital': 'a', 'capital-to-land': 'b', 'flag-to-land': 'a', 'land-to-flag': 'b', both: 'both', thompson: 'both' };
  if (page === 'group') { target = 'set.html'; q.set('id', id); }
  else if (page === 'stats') { target = 'stats.html'; }
  else {
    q.set('set', id);
    if (page === 'quiz_capitals' || page === 'quiz_flags') {
      q.set('type', page === 'quiz_flags' ? 'flag' : 'capital');
      q.set('dir', dir[mode] || 'a');
      if (mode === 'thompson') q.set('order', 'smart');
    } else if (page === 'quiz_typing') {
      q.set('type', mode === 'flag-to-land' ? 'flag' : 'capital');
      q.set('dir', mode === 'flag-to-land' ? 'a' : 'both');
      q.set('ans', 'type');
    } else if (page === 'quiz_map') {
      q.set('type', 'map'); q.set('dir', 'a'); q.set('ans', mode === 'snelle' ? 'self' : 'pick');
    } else if (page === 'quiz_map_zoek') {
      q.set('type', 'map'); q.set('dir', 'b'); q.set('ans', 'click');
    } else if (page === 'quiz_mix') {
      q.set('type', 'mix');
      if (p.get('mega') === '1') q.set('mix', 'mega');
      if (p.get('custom')) { q.set('mix', 'own'); q.set('custom', p.get('custom')); }
    } else {
      q.set('type', 'kwartet');
    }
    if (p.get('infinite') === '1') q.set('infinite', '1');
  }
  var qs = q.toString();
  location.replace('../' + target + (qs ? '?' + qs : ''));
})();
