/**
 * Four calendar collections for each hypothetical life.
 * A collection is one colored calendar. Its child layers are the swim lanes.
 * Times are offsets from the moment the profile is loaded.
 */
(function (global) {
  'use strict';

  var COLLECTIONS = [
    { id: 'basic', label: 'Basic', color: '#9aa3ad', lanes: ['Home', 'Place'] },
    { id: 'health', label: 'Health', color: '#e11d48', lanes: ['Sleep', 'Activity', 'Heart', 'Nutrition'] },
    { id: 'work', label: 'Work', color: '#2563eb', lanes: ['Research', 'Development', 'Delivery'] },
    { id: 'financial', label: 'Financial', color: '#16a34a', lanes: ['Income', 'Expenses', 'Credit', 'Savings', 'Debit', 'Crypto'] }
  ];

  var LANE_COLOR = { Sleep: '#7c3aed' };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = dayStart(d); x.setDate(x.getDate() + n); return x; }
  function atTime(day, h, m) { return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m || 0, 0, 0); }

  function beat(dayOffset, hour, minutes, title) {
    return { kind: 'time', dayOffset: dayOffset, hour: hour, minutes: minutes, title: title };
  }
  function span(dayOffset, days, title) {
    return { kind: 'span', dayOffset: dayOffset, days: days, title: title };
  }

  /**
   * Each lane has a short mark, a few-day mark, a multi-week mark, and a season mark.
   * Offsets differ per lane so the lanes do not stack on the same dates.
   */
  var STORIES = {
    amina: {
      Place: [
        beat(0, 6, 75, 'Dawn feeder walk, north spur'),
        beat(-2, 16, 50, 'Kiosk lamp test before market'),
        span(-3, 4, 'Pole patrol after the dust'),
        span(-18, 16, 'Meter swap on the east spur')
      ],
      Sleep: [
        beat(-1, 21, 430, 'Sleep on the roof after Harmattan'),
        beat(1, 22, 390, 'Short night, inverter alarm'),
        span(-9, 3, 'Rest days after the night guard'),
        span(12, 6, 'Quiet week while the line is down')
      ],
      Activity: [
        beat(0, 6, 80, 'Walk the north spur with the meter book'),
        beat(-4, 17, 40, 'Climb the shed to seat the rain gauge'),
        span(-14, 5, 'Market-week rounds on foot'),
        span(20, 18, 'Harvest-path checks at dusk')
      ],
      Heart: [
        beat(-1, 7, 15, 'Resting pulse before the feeder walk'),
        beat(2, 18, 20, 'Pulse after the dust climb'),
        span(-30, 14, 'Higher mornings during the hot spell'),
        span(40, 21, 'Steady week once the rains cool the yard')
      ],
      Nutrition: [
        beat(0, 12, 30, 'Millet and soumbala at the kiosk'),
        beat(-3, 19, 25, 'Guava and water after the lamp test'),
        span(-11, 7, 'Market greens while the road is open'),
        span(25, 20, 'Grain stores drawn down before harvest')
      ],
      Research: [
        beat(-2, 9, 90, 'Read the tariff board against last season'),
        span(-8, 4, 'Notes on which spurs sag in dust'),
        span(-40, 21, 'Compare night load to the rain gauge'),
        span(-120, 80, 'A season of asking why the east line fails')
      ],
      Development: [
        beat(1, 10, 120, 'Rewind the grain-mill motor on the bench'),
        span(-5, 4, 'Splice the clinic feeder'),
        span(8, 16, 'Fit a second inverter in the shed'),
        span(-70, 45, 'Rebuild the west-run pull before the dry peak')
      ],
      Delivery: [
        beat(0, 15, 40, 'Hand the night guard the storm cutoff list'),
        span(3, 3, 'Lamp count delivered to the committee'),
        span(18, 10, 'School line back in service'),
        span(-90, 30, 'Concession report carried to the prefect')
      ],
      Income: [
        beat(-6, 11, 20, 'Kiosk fees counted at midday'),
        span(-2, 3, 'Market-week takings'),
        span(-35, 14, 'Tariff month, east and north'),
        span(-200, 60, 'Concession payment for the half-year')
      ],
      Expenses: [
        beat(1, 8, 15, 'Diesel can for the loaned generator'),
        span(-7, 4, 'Cable and tape from the river trader'),
        span(15, 12, 'Shed roofing sheets'),
        span(-100, 40, 'Inverter parts across the dry months')
      ],
      Credit: [
        beat(-10, 14, 30, 'Ask the miller to wait on the rewind'),
        span(6, 5, 'Generator loan still out'),
        span(-50, 28, 'Committee advance against next tariff'),
        span(80, 70, 'Prefect credit for the west-run poles')
      ],
      Savings: [
        beat(-20, 9, 15, 'Coin tin under the battery shelf'),
        span(-15, 6, 'Set aside the school-line surplus'),
        span(30, 20, 'Rainy-season reserve, untouched'),
        span(-180, 90, 'Two seasons of the lamp fund')
      ],
      Debit: [
        beat(4, 16, 20, 'Pay the night guard in cash'),
        span(-4, 2, 'Clear the trader for the last cable'),
        span(22, 8, 'Roofing balance due'),
        span(-60, 25, 'Pay down the committee advance')
      ],
      Crypto: [
        beat(-8, 21, 25, 'Cousin converts a small tether gift'),
        span(10, 4, 'Phone-credit swap, no exchange in Tera'),
        span(-45, 12, 'Hold a little USDT for inverter parts'),
        span(100, 40, 'Leave the coin tin alone through harvest')
      ]
    },
    ellis: {
      Place: [
        beat(0, 8, 110, 'Keel fairing on the port garboard'),
        beat(-1, 13, 80, 'Steam box for the new rib'),
        span(-4, 4, 'Haul-out on the spring tide'),
        span(-22, 15, 'Ribs 6 through 9 out of the boat')
      ],
      Sleep: [
        beat(-1, 22, 400, 'Sleep in the loft over the stove'),
        beat(1, 21, 360, 'Short night, tide at four'),
        span(-8, 3, 'Lay-in after the haul'),
        span(16, 5, 'Quiet nights once the cover is on')
      ],
      Activity: [
        beat(0, 6, 70, 'Row out to the mooring at dawn'),
        beat(-3, 15, 90, 'Fair the garboard until the light goes'),
        span(-13, 4, 'Days on the ways, up and down the ladder'),
        span(24, 14, 'Varnish weeks, arms over the head')
      ],
      Heart: [
        beat(0, 7, 10, 'Pulse before the row'),
        beat(-2, 16, 15, 'Pulse after the steam box'),
        span(-28, 12, 'Harder mornings in the cold shed'),
        span(35, 18, 'Easier rate once the deck is caulked')
      ],
      Nutrition: [
        beat(0, 12, 30, 'Chowder at the harbor shack'),
        beat(-4, 18, 25, 'Bread and coffee in the loft'),
        span(-10, 6, 'The yard eats from one pot'),
        span(28, 16, 'Lighter weeks while the boat is covered')
      ],
      Research: [
        beat(-2, 9, 70, 'Measure the sheer against the old loft notes'),
        span(-6, 4, 'Read the harbor chart for the haul tide'),
        span(-36, 18, 'Which frames actually took the ice'),
        span(-140, 70, 'A winter of learning this hull')
      ],
      Development: [
        beat(1, 10, 100, 'Dry-fit the mast step'),
        span(-5, 4, 'Recaulk the cabin top'),
        span(9, 17, 'Guest berth taking shape'),
        span(-80, 50, 'Spar and standing rig for the season')
      ],
      Delivery: [
        beat(2, 14, 60, 'Buyer walk-through in the shed'),
        span(4, 3, 'Sea trial inside the harbor'),
        span(20, 8, 'Winter cover cut and tied'),
        span(-100, 25, 'Boat handed back for the summer')
      ],
      Income: [
        beat(-5, 11, 20, 'Deposit from the guest-berth owner'),
        span(-1, 3, 'Haul-out fee paid at the yard'),
        span(-30, 14, 'Commission for the summer fit-out'),
        span(-220, 40, 'The year the loft actually paid')
      ],
      Expenses: [
        beat(1, 8, 15, 'Bronze screws from the chandlery'),
        span(-6, 4, 'Oak for the new ribs'),
        span(12, 10, 'Varnish and cotton caulking'),
        span(-90, 35, 'Yard rent across the ice months')
      ],
      Credit: [
        beat(-12, 15, 20, 'Chandlery tab still open'),
        span(5, 6, 'Oak on account until the trial'),
        span(-48, 24, 'Yard will wait until commission'),
        span(70, 60, 'A season of the loft on credit')
      ],
      Savings: [
        beat(-18, 9, 10, 'Envelope behind the steam box'),
        span(-16, 5, 'Hold the deposit, do not spend the oak'),
        span(26, 18, 'Berth money set for winter cover'),
        span(-160, 80, 'Two winters of not buying a second boat')
      ],
      Debit: [
        beat(3, 16, 15, 'Pay the chandlery down'),
        span(-3, 2, 'Clear the oak bill'),
        span(18, 7, 'Yard balance after the trial'),
        span(-55, 20, 'Finish last season’s tab')
      ],
      Crypto: [
        beat(-9, 20, 20, 'Brother sends a little bitcoin for screws'),
        span(8, 3, 'Leave it, the chandlery takes cash'),
        span(-40, 10, 'Convert just enough for the varnish'),
        span(90, 30, 'The rest sits through the layup')
      ]
    },
    noor: {
      Place: [
        beat(0, 5, 80, 'Dawn transect on the wash plot'),
        beat(-2, 17, 50, 'Dusk insect sweep'),
        span(-4, 4, 'Sensor swap along the ridge'),
        span(-20, 14, 'Phenology cameras pulled and reseated')
      ],
      Sleep: [
        beat(-1, 21, 480, 'Long sleep, second trimester'),
        beat(1, 22, 420, 'Up once, back down'),
        span(-7, 3, 'Naps between plot walks'),
        span(14, 6, 'Earlier nights as the belly gets heavy')
      ],
      Activity: [
        beat(0, 6, 40, 'Slow walk on the wash, not the ridge'),
        beat(-3, 16, 30, 'Shade-house watering, then stop'),
        span(-12, 4, 'Short plot loops instead of the full transect'),
        span(18, 14, 'Walking the flat ground only')
      ],
      Heart: [
        beat(0, 7, 12, 'Resting pulse, a little high'),
        beat(-2, 18, 12, 'Pulse after the short walk'),
        span(-24, 14, 'The higher rhythm of these months'),
        span(30, 21, 'Clinic says the rise is ordinary')
      ],
      Nutrition: [
        beat(0, 8, 20, 'Dates, yogurt, and the iron tablet'),
        beat(-1, 13, 25, 'Lentils at the station table'),
        span(-9, 7, 'Eating earlier, smaller plates'),
        span(20, 16, 'The cook keeps the greens coming')
      ],
      Research: [
        beat(-2, 9, 80, 'Read last year’s bud dates against this week'),
        span(-6, 4, 'Which acacias set seed early'),
        span(-32, 18, 'Plot notes through the second trimester'),
        span(-150, 90, 'The phenology series does not pause for this')
      ],
      Development: [
        beat(1, 11, 70, 'Reseat one camera without climbing'),
        span(-5, 3, 'Shade-house valves replaced'),
        span(11, 12, 'A shorter transect marked for the students'),
        span(-60, 40, 'Station methods rewritten for a smaller crew')
      ],
      Delivery: [
        beat(2, 15, 50, 'Field-course hour, then sit'),
        span(5, 3, 'Hand the species list to the guest researchers'),
        span(22, 8, 'Grant figures sent from the desk'),
        span(-80, 20, 'Winter rain ledger closed')
      ],
      Income: [
        beat(-7, 10, 15, 'Station stipend lands'),
        span(-2, 2, 'Field-course honorarium'),
        span(-28, 10, 'Grant draw for the quarter'),
        span(-200, 30, 'The posting paid for the year')
      ],
      Expenses: [
        beat(0, 9, 10, 'Iron tablets and dates in the souk'),
        span(-8, 4, 'Clinic van and the lab fee'),
        span(12, 9, 'A wider shirt, new sandals'),
        span(-70, 25, 'Travel home planned, then postponed')
      ],
      Credit: [
        beat(-14, 14, 15, 'Station floats the clinic bill'),
        span(6, 5, 'Lab fee still on the grant'),
        span(-40, 20, 'Family sends a small advance'),
        span(60, 50, 'The posting will square it after the birth')
      ],
      Savings: [
        beat(-16, 9, 10, 'Envelope marked for the birth'),
        span(-11, 4, 'Do not touch the envelope'),
        span(24, 14, 'Stipend split, half to the envelope'),
        span(-170, 80, 'A year of keeping that envelope shut')
      ],
      Debit: [
        beat(3, 11, 10, 'Pay the souk for the tablets'),
        span(-3, 2, 'Clear the van driver'),
        span(16, 6, 'Sandals paid, shirt still open'),
        span(-48, 18, 'Return the family advance in part')
      ],
      Crypto: [
        beat(-11, 20, 15, 'A colleague sends USDC for the clinic'),
        span(7, 3, 'Convert a slice to cash in the town'),
        span(-36, 8, 'Leave the rest for the birth month'),
        span(80, 25, 'Do not trade it, the series is not a market')
      ]
    }
  };

  function laneList(profile) {
    var out = [];
    COLLECTIONS.forEach(function (col) {
      col.lanes.forEach(function (lane) {
        out.push({
          collection: col.id,
          label: col.label,
          color: LANE_COLOR[lane] || col.color,
          collectionColor: col.color,
          lane: lane === 'Place' ? profile.place : lane
        });
      });
    });
    return out;
  }

  function materialize(profile, spec, today, laneIndex) {
    var shift = laneIndex * 2;
    var start;
    var end;
    if (spec.kind === 'time') {
      start = atTime(addDays(today, spec.dayOffset + shift), spec.hour, (laneIndex * 7) % 50);
      end = new Date(start.getTime() + spec.minutes * 60000);
      return { start: start, end: end, allDay: false, title: spec.title };
    }
    start = addDays(today, spec.dayOffset + shift);
    end = addDays(start, spec.days);
    return { start: start, end: end, allDay: true, title: spec.title };
  }

  function vevent(profile, meta, item, key) {
    var uid = 'sample-' + profile.id + '-' + meta.collection + '-' + meta.lane.replace(/\s+/g, '') + '-' + key;
    var base = {
      uid: uid,
      summary: item.title,
      description: 'Hypothetical sample. ' + meta.label + ' / ' + meta.lane + '.',
      location: profile.place,
      categories: [meta.lane],
      category: meta.lane,
      color: meta.color,
      status: 'CONFIRMED',
      isWorkEvent: true,
      work: {
        project: profile.name,
        lane: meta.lane,
        kind: item.allDay && item.end - item.start > 20 * 86400000 ? 'milestone' : 'task',
        status: item.end < new Date() ? 'done' : 'planned',
        workflow: meta.collection === 'work' ? 'field' : 'operations',
        dependencies: []
      }
    };
    if (item.allDay) {
      base.dtstart = { date: item.start.getFullYear() + '-' + pad(item.start.getMonth() + 1) + '-' + pad(item.start.getDate()) };
      base.dtend = { date: item.end.getFullYear() + '-' + pad(item.end.getMonth() + 1) + '-' + pad(item.end.getDate()) };
      if (base.work.kind === 'milestone') base.work.kind = 'task';
    } else {
      base.dtstart = { dateTime: item.start.toISOString() };
      base.dtend = { dateTime: item.end.toISOString() };
    }
    return base;
  }

  function pregnancy(profile, today) {
    var start = addDays(today, -160);
    var end = addDays(start, 280);
    return {
      uid: 'sample-' + profile.id + '-pregnancy',
      summary: 'Pregnancy',
      description: 'Hypothetical. Counted from about five months ago, forty weeks, due after the present.',
      location: profile.place,
      categories: ['Home'],
      category: 'Home',
      color: '#9aa3ad',
      status: 'CONFIRMED',
      isWorkEvent: true,
      dtstart: { date: start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate()) },
      dtend: { date: end.getFullYear() + '-' + pad(end.getMonth() + 1) + '-' + pad(end.getDate()) },
      work: { project: profile.name, lane: 'Home', kind: 'task', status: 'planned', workflow: 'operations', dependencies: [] }
    };
  }

  function tagLife(events, profile) {
    return (events || []).map(function (ev) {
      var copy = Object.assign({}, ev, {
        category: 'Home',
        categories: ['Home'],
        isWorkEvent: true,
        work: { project: profile.name, lane: 'Home', kind: 'task', status: 'planned', workflow: 'operations', dependencies: [] }
      });
      return copy;
    });
  }

  function dropSampleLayers(g, keepId) {
    if (!g.getLayerIds) return;
    g.getLayerIds().forEach(function (id) {
      if (String(id).indexOf('sample-') !== 0) return;
      if (keepId && id !== 'sample-' + keepId && String(id).indexOf('sample-' + keepId + '-') === 0) return;
      try { g.removeLayer(id); } catch (e) { /* ignore */ }
    });
  }

  function ingestSampleCollections(profile, g, lifeEvents) {
    if (!profile || !g || typeof g.ingestEvents !== 'function') return;
    var today = dayStart(new Date());
    dropSampleLayers(g, profile.id);
    var lanes = laneList(profile);
    var homeId = 'sample-' + profile.id + '-basic-home';
    var homeEvents = tagLife(lifeEvents, profile);
    if (profile.id === 'noor') homeEvents = homeEvents.concat([pregnancy(profile, today)]);
    g.ingestEvents(homeId, homeEvents, { fullSet: true, visible: true, sessionId: 'sample-' + profile.id });
    paint(g, homeId, profile, lanes[0], 0);

    lanes.forEach(function (meta, index) {
      if (meta.lane === 'Home') return;
      var specs = (STORIES[profile.id] && STORIES[profile.id][meta.lane === profile.place ? 'Place' : meta.lane]) || [];
      var events = specs.map(function (spec, n) {
        return vevent(profile, meta, materialize(profile, spec, today, index), n);
      });
      var id = 'sample-' + profile.id + '-' + meta.collection + '-' + String(meta.lane).toLowerCase().replace(/[^a-z0-9]+/g, '');
      g.ingestEvents(id, events, { fullSet: true, visible: true, sessionId: 'sample-' + profile.id });
      paint(g, id, profile, meta, index);
    });
    global.applyCalendarModeVisibility?.();
    if (typeof global.refreshCalendarLayersList === 'function') {
      try { global.refreshCalendarLayersList(); } catch (e) { /* ignore */ }
    }
  }

  function paint(g, id, profile, meta, order) {
    var layer = g.getLayer && g.getLayer(id);
    if (!layer) return;
    layer.name = meta.lane;
    layer.color = meta.color;
    layer.visible = true;
    layer.collection = meta.collection;
    layer.collectionLabel = meta.label;
    layer.collectionColor = meta.collectionColor;
    layer.laneName = meta.lane;
    layer.laneOrder = order;
    layer.profileId = profile.id;
  }

  global.CIRCAEVUM_COLLECTIONS = COLLECTIONS;
  global.ingestSampleCollections = ingestSampleCollections;
  global.tagSampleLifeEvents = tagLife;
})(typeof window !== 'undefined' ? window : global);
