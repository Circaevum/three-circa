/**
 * Hypothetical lives for a first open. One event per zoom grain.
 * Not a real person. Not a calendar import.
 *
 * Scales (duration):
 *   hour · day · week · month · quarter · year · years · decade · century
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'circaevum_sample_profile';

  var SCALE_COLOR = {
    hour: '#f472b6',
    day: '#38bdf8',
    week: '#34d399',
    month: '#a3e635',
    quarter: '#fbbf24',
    year: '#fb923c',
    years: '#f97316',
    decade: '#c084fc',
    century: '#94a3b8'
  };

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function ymd(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    var x = dayStart(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function addYears(d, n) {
    return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
  }

  function atTime(day, h, m) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m || 0, 0, 0);
  }

  function ev(profileId, scale, summary, start, end, place, allDay) {
    var uid = 'sample-' + profileId + '-' + scale;
    var base = {
      uid: uid,
      summary: summary,
      description: 'Hypothetical sample. Scale: ' + scale + '.',
      location: place,
      categories: ['sample', scale],
      category: scale,
      color: SCALE_COLOR[scale] || '#00b4d8',
      status: 'CONFIRMED'
    };
    if (allDay) {
      base.dtstart = { date: ymd(start) };
      base.dtend = { date: ymd(end) };
    } else {
      base.dtstart = { dateTime: start.toISOString(), timeZone: 'UTC' };
      base.dtend = { dateTime: end.toISOString(), timeZone: 'UTC' };
    }
    return base;
  }

  /**
   * Build spans around `now` so hour/day sit on the open day
   * and long chapters still bracket the present.
   */
  function buildEvents(profile, now) {
    var today = dayStart(now || new Date());
    var place = profile.place;
    var id = profile.id;
    var n = profile.names;
    return [
      ev(id, 'hour', n.hour, atTime(today, 9, 0), atTime(today, 10, 30), place, false),
      ev(id, 'day', n.day, today, addDays(today, 1), place, true),
      ev(id, 'week', n.week, addDays(today, -1), addDays(today, 6), place, true),
      ev(id, 'month', n.month, addDays(today, -3), addDays(today, 24), place, true),
      ev(id, 'quarter', n.quarter, addDays(today, -10), addDays(today, 70), place, true),
      ev(id, 'year', n.year, addDays(today, -40), addDays(today, 160), place, true),
      ev(id, 'years', n.years, addYears(today, -3), addYears(today, 3), place, true),
      ev(id, 'decade', n.decade, addYears(today, -8), addYears(today, 8), place, true),
      ev(id, 'century', n.century, addYears(today, -70), addYears(today, 40), place, true)
    ];
  }

  var PROFILES = [
    {
      id: 'amina',
      name: 'Amina Diallo',
      blurb: 'Mini-grid keeper, Tera Nou',
      place: 'Tera Nou',
      color: '#2dd4bf',
      names: {
        hour: 'Hour · Feeder walk',
        day: 'Day · Market cutoff drill',
        week: 'Week · Pole patrol',
        month: 'Month · Meter swap',
        quarter: 'Quarter · Rain tariff',
        year: 'Year · Apprentice cohort',
        years: 'Years · Concession',
        decade: 'Decade · Keeper post',
        century: 'Century · Well record'
      }
    },
    {
      id: 'ellis',
      name: 'Ellis Ward',
      blurb: 'Boatwright, Gray Harbor',
      place: 'Gray Harbor',
      color: '#f59e0b',
      names: {
        hour: 'Hour · Keel fairing',
        day: 'Day · Haul-out',
        week: 'Week · Passage to the yard',
        month: 'Month · Deck recaulk',
        quarter: 'Quarter · Winter layup',
        year: 'Year · Apprentice loft',
        years: 'Years · Yard lease',
        decade: 'Decade · Family ways',
        century: 'Century · Harbor chart'
      }
    },
    {
      id: 'noor',
      name: 'Noor El-Sayed',
      blurb: 'Phenology station, Wadi',
      place: 'Wadi Station',
      color: '#a78bfa',
      names: {
        hour: 'Hour · Dawn transect',
        day: 'Day · Plot census',
        week: 'Week · Field course',
        month: 'Month · Sensor service',
        quarter: 'Quarter · Dry-season watch',
        year: 'Year · Grant year',
        years: 'Years · Station posting',
        decade: 'Decade · Phenology series',
        century: 'Century · Rain ledger'
      }
    }
  ];

  function byId(id) {
    for (var i = 0; i < PROFILES.length; i++) {
      if (PROFILES[i].id === id) return PROFILES[i];
    }
    return PROFILES[0];
  }

  function gl() {
    return global.circaevumGL || (global.getGL && global.getGL()) || null;
  }

  function otherSampleIds(keep) {
    var ids = [];
    for (var i = 0; i < PROFILES.length; i++) {
      if (PROFILES[i].id !== keep) ids.push('sample-' + PROFILES[i].id);
    }
    return ids;
  }

  function loadSampleProfile(id) {
    var g = gl();
    if (!g || typeof g.ingestEvents !== 'function') return false;
    var profile = byId(id);
    var layerId = 'sample-' + profile.id;
    var drop = otherSampleIds(profile.id);
    for (var i = 0; i < drop.length; i++) {
      if (g.getLayer && g.getLayer(drop[i]) && typeof g.removeLayer === 'function') {
        try { g.removeLayer(drop[i]); } catch (e) { /* ignore */ }
      }
    }
    if (g.getLayer && g.getLayer(layerId) && typeof g.removeLayer === 'function') {
      try { g.removeLayer(layerId); } catch (e2) { /* ignore */ }
    }
    g.ingestEvents(layerId, buildEvents(profile, new Date()), {
      fullSet: true,
      visible: true,
      sessionId: 'sample-' + profile.id
    });
    var layer = g.getLayer && g.getLayer(layerId);
    if (layer) {
      layer.name = profile.name;
      layer.color = profile.color;
      layer.visible = true;
    }
    if (typeof g.setLayerVisibility === 'function') g.setLayerVisibility(layerId, true);
    try { global.localStorage && global.localStorage.setItem(STORE_KEY, profile.id); } catch (e3) { /* ignore */ }
    if (typeof global.refreshCalendarLayersList === 'function') {
      try { global.refreshCalendarLayersList(); } catch (e4) { /* ignore */ }
    }
    if (typeof global.refreshEventsList === 'function') {
      try { global.refreshEventsList(false); } catch (e5) { /* ignore */ }
    }
    var sel = document.getElementById('sample-profile-select');
    if (sel) sel.value = profile.id;
    return true;
  }

  function fillSelect(sel) {
    if (!sel || sel.getAttribute('data-filled') === '1') return;
    sel.innerHTML = '';
    for (var i = 0; i < PROFILES.length; i++) {
      var p = PROFILES[i];
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' — ' + p.blurb;
      sel.appendChild(opt);
    }
    sel.setAttribute('data-filled', '1');
  }

  function bind() {
    var sel = document.getElementById('sample-profile-select');
    var btn = document.getElementById('sample-profile-load');
    if (!sel || !btn || btn.getAttribute('data-bound') === '1') return;
    fillSelect(sel);
    var stored = null;
    try { stored = global.localStorage && global.localStorage.getItem(STORE_KEY); } catch (e) { /* ignore */ }
    if (stored && byId(stored).id === stored) sel.value = stored;
    btn.setAttribute('data-bound', '1');
    btn.addEventListener('click', function () {
      loadSampleProfile(sel.value || 'amina');
    });
  }

  function wantsForce(params) {
    var s = params.get('sample');
    return !!(s && s !== '0' && s !== 'off' && s !== 'none');
  }

  function skipAuto(params) {
    var s = params.get('sample');
    if (s === '0' || s === 'off' || s === 'none') return true;
    if (params.get('viewer') === '1') return true;
    try {
      if (global.self && global.top && global.self !== global.top) return true;
    } catch (e) { /* cross-origin frame: skip */ return true; }
    return false;
  }

  function layerCount(g) {
    if (!g || typeof g.getLayerIds !== 'function') return 0;
    var ids = g.getLayerIds() || [];
    return ids.length;
  }

  function boot() {
    bind();
    var params;
    try { params = new URLSearchParams(global.location.search); }
    catch (e) { params = new URLSearchParams(''); }
    var forced = wantsForce(params) ? params.get('sample') : null;
    if (!forced && skipAuto(params)) return;
    var tick = setInterval(function () {
      var g = gl();
      if (!g || typeof g.ingestEvents !== 'function') return;
      clearInterval(tick);
      if (forced) {
        loadSampleProfile(forced);
        return;
      }
      if (layerCount(g) > 0) return;
      var stored = null;
      try { stored = global.localStorage && global.localStorage.getItem(STORE_KEY); } catch (e2) { /* ignore */ }
      loadSampleProfile(stored || 'amina');
    }, 250);
    setTimeout(function () { clearInterval(tick); }, 15000);
  }

  global.CIRCAEVUM_SAMPLE_PROFILES = PROFILES;
  global.loadSampleProfile = loadSampleProfile;
  global.buildSampleProfileEvents = function (id, now) {
    return buildEvents(byId(id), now || new Date());
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : global);
