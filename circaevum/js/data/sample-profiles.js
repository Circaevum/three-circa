/**
 * Hypothetical lives for a first open.
 * Each person has a different schedule inside each duration band.
 * Spans stay off the band cuts (1 day, 8 days, 31 days, 365 days).
 * No daily repeat. Not a real person. Not a calendar import.
 *
 * Bands: hour · week · month · quarter · year · years · decade · century
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

  function ev(profileId, scale, summary, start, end, place, allDay, key) {
    var uid = 'sample-' + profileId + '-' + scale + (key ? '-' + key : '');
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

  function on(year, month, day) {
    return new Date(year, month - 1, day);
  }

  /**
   * Hours are well under a day. Week spans are 3–4 days.
   * Month spans are 14–21 days. Quarter spans are 48–88 days.
   * The year chapter runs past both New Years so it is longer than 365 days.
   */
  function buildEvents(profile, now) {
    var today = dayStart(now || new Date());
    var place = profile.place;
    var id = profile.id;
    var n = profile.names;
    var year = today.getFullYear();
    var out = [];
    var i;
    var beat;
    var start;
    var clock;

    for (i = 0; i < profile.hours.length; i++) {
      beat = profile.hours[i];
      start = on(year, beat[0], beat[1]);
      clock = atTime(start, beat[2], beat[3]);
      out.push(ev(id, 'hour', beat[5], clock, new Date(clock.getTime() + beat[4] * 60000), place, false, ymd(start)));
    }

    for (i = 0; i < profile.spans.length; i++) {
      beat = profile.spans[i];
      start = on(year, beat[1], beat[2]);
      out.push(ev(id, beat[0], beat[4], start, addDays(start, beat[3]), place, true, beat[0] + '-' + ymd(start)));
    }

    out.push(ev(id, 'year', n.year, on(year - 1, 11, 20), on(year + 1, 2, 10), place, true, 'year'));
    out.push(ev(id, 'years', n.years, addYears(today, -3), addYears(today, 3), place, true, 'span'));
    out.push(ev(id, 'decade', n.decade, addYears(today, -8), addYears(today, 8), place, true, 'span'));
    out.push(ev(id, 'century', n.century, addYears(today, -70), addYears(today, 40), place, true, 'span'));
    return out;
  }

  var PROFILES = [
    {
      id: 'amina',
      name: 'Amina Diallo',
      blurb: 'Mini-grid keeper, Tera Nou',
      place: 'Tera Nou',
      color: '#2dd4bf',
      names: {
        year: 'Apprentice cohort',
        years: 'Concession',
        decade: 'Keeper post',
        century: 'Well record'
      },
      hours: [
        [1, 9, 6, 20, 80, 'Dawn feeder walk, north spur'],
        [1, 28, 16, 10, 70, 'Kiosk lamp test before market'],
        [2, 17, 9, 40, 100, 'Meter dispute at the east kiosk'],
        [3, 6, 5, 50, 75, 'Inverter reboot after dust'],
        [4, 11, 18, 5, 60, 'Storm cutoff with the night guard'],
        [5, 16, 10, 30, 120, 'Tariff board under the neem'],
        [6, 7, 7, 10, 85, 'Well-pump prime'],
        [7, 19, 15, 40, 110, 'Rain gauge on the shed roof'],
        [9, 9, 8, 5, 95, 'School line reconnect'],
        [10, 21, 17, 25, 80, 'Harvest-night load plan'],
        [11, 12, 9, 15, 70, 'Battery-room sweep'],
        [12, 19, 19, 0, 90, 'Year-end lamp count']
      ],
      spans: [
        ['week', 1, 15, 3, 'Pole patrol, north spur'],
        ['week', 3, 2, 4, 'Clinic feeder splice'],
        ['week', 4, 21, 3, 'Market-week generator loan'],
        ['week', 6, 16, 4, 'River-crossing cable'],
        ['week', 8, 4, 3, 'Grain-mill motor rewind'],
        ['week', 10, 8, 4, 'Mosque feeder outage'],
        ['week', 12, 3, 3, 'Dry-season pull, west run'],
        ['month', 2, 3, 16, 'Meter swap, east spur'],
        ['month', 5, 5, 18, 'Rain-tariff trial'],
        ['month', 8, 18, 14, 'Shed reroof'],
        ['month', 11, 4, 21, 'Wet-season ledger close'],
        ['quarter', 1, 18, 52, 'Harmattan dust on the insulators'],
        ['quarter', 4, 15, 68, 'First-rains build'],
        ['quarter', 9, 6, 74, 'Harvest load on the night feeder']
      ]
    },
    {
      id: 'ellis',
      name: 'Ellis Ward',
      blurb: 'Boatwright, Gray Harbor',
      place: 'Gray Harbor',
      color: '#f59e0b',
      names: {
        year: 'Apprentice loft',
        years: 'Yard lease',
        decade: 'Family ways',
        century: 'Harbor chart'
      },
      hours: [
        [1, 11, 8, 0, 120, 'Keel fairing, port garboard'],
        [2, 6, 13, 30, 90, 'Steam box for the new rib'],
        [3, 14, 7, 40, 60, 'Tide check before the haul'],
        [4, 8, 15, 10, 100, 'Caulking the sheer strake'],
        [5, 19, 9, 20, 80, 'Bronze fastener sort'],
        [6, 23, 16, 45, 70, 'Boot stripe in the paint booth'],
        [7, 9, 6, 15, 90, 'Dawn row out to the mooring'],
        [8, 27, 11, 0, 110, 'Mast step dry-fit'],
        [9, 15, 14, 20, 75, 'Buyer walk-through in the shed'],
        [10, 4, 8, 50, 95, 'Spar varnish, second coat'],
        [11, 18, 10, 10, 85, 'Winter cover cut'],
        [12, 9, 15, 40, 60, 'Stove lit in the loft']
      ],
      spans: [
        ['week', 1, 22, 4, 'Haul-out on the spring tide'],
        ['week', 3, 9, 3, 'Passage down to the yard'],
        ['week', 5, 4, 4, 'Deck recaulk, cabin top'],
        ['week', 7, 14, 3, 'Guest berth fit-out'],
        ['week', 9, 2, 4, 'Sea trial inside the harbor'],
        ['week', 11, 3, 3, 'Lay the boat up on the ways'],
        ['month', 2, 10, 20, 'Rib replacement, frames 6–9'],
        ['month', 4, 20, 15, 'Deck recaulk after the thaw'],
        ['month', 8, 2, 17, 'Spars and standing rig'],
        ['month', 10, 12, 19, 'Winter layup of the hull'],
        ['quarter', 1, 6, 60, 'Yard ice and the slow fairing'],
        ['quarter', 5, 28, 72, 'Summer commission'],
        ['quarter', 9, 20, 55, 'Fall haul and cover']
      ]
    },
    {
      id: 'noor',
      name: 'Noor El-Sayed',
      blurb: 'Phenology station, Wadi',
      place: 'Wadi Station',
      color: '#a78bfa',
      names: {
        year: 'Grant year',
        years: 'Station posting',
        decade: 'Phenology series',
        century: 'Rain ledger'
      },
      hours: [
        [1, 7, 5, 40, 80, 'Dawn transect, wash plot'],
        [2, 19, 6, 10, 70, 'First bud count on the acacia'],
        [3, 11, 9, 30, 100, 'Soil cores after the flood'],
        [4, 2, 17, 50, 50, 'Dusk insect sweep'],
        [5, 21, 4, 55, 90, 'Pre-dawn bird point'],
        [6, 13, 11, 15, 85, 'Shade-house watering'],
        [7, 28, 8, 40, 110, 'Camera-trap cards'],
        [8, 8, 15, 5, 65, 'Field-course lecture'],
        [9, 24, 6, 35, 95, 'Seed-set transect'],
        [10, 11, 10, 25, 75, 'Rain-gauge calibration'],
        [11, 26, 7, 20, 80, 'Cold-front plant check'],
        [12, 14, 16, 0, 60, 'Archive the plot photos']
      ],
      spans: [
        ['week', 1, 19, 4, 'Sensor swap on the ridge'],
        ['week', 3, 23, 3, 'Flood-plot rescue'],
        ['week', 5, 11, 4, 'Field course, first week'],
        ['week', 7, 6, 3, 'Night-bloom watch'],
        ['week', 9, 14, 4, 'Seed harvest on the plots'],
        ['week', 11, 9, 3, 'Station shutters before wind'],
        ['month', 2, 4, 18, 'Phenology camera service'],
        ['month', 4, 16, 14, 'Dry-season species list'],
        ['month', 8, 11, 21, 'Guest researchers in residence'],
        ['month', 10, 20, 16, 'Grant figures from the plots'],
        ['quarter', 1, 12, 64, 'Winter rain ledger'],
        ['quarter', 5, 2, 80, 'Dry-season watch'],
        ['quarter', 9, 1, 70, 'Seed and fruit season']
      ]
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
