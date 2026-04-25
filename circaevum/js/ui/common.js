(function() {
  var existing = window.CircaevumUI || {};
  var ui = existing;

  ui.USER_EVENTS_LAYER = ui.USER_EVENTS_LAYER || 'user-events';

  ui.getUserEventsLayerId = function() {
    return ui.USER_EVENTS_LAYER;
  };

  ui.formatDate = function(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  ui.escapeHtml = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  ui.layerSwatchColor = function(layer) {
    if (!layer || layer.color == null || layer.color === '') return null;
    var c = layer.color;
    if (typeof c === 'number') return '#' + (c >>> 0).toString(16).padStart(6, '0');
    var s = String(c).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return null;
  };

  ui.oneDayLater = function(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + 1);
    return x;
  };

  ui.buildFullAppUrl = function(withOpenLogin) {
    var fullAppUrl = window.CIRCAEVUM_FULL_APP_URL;
    if (!fullAppUrl) return '';
    var state = typeof window.getShareState === 'function' ? window.getShareState() : null;
    var qs = state && typeof window.stateToQueryString === 'function' ? window.stateToQueryString(state) : '';
    if (withOpenLogin) qs = qs ? qs + '&open=login' : 'open=login';
    return fullAppUrl + (qs ? '?' + qs : '');
  };

  window.CircaevumUI = ui;
})();
