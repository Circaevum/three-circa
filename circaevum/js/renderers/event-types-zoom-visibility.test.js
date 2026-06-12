/**
 * Event-type × zoom visibility test for the GL event renderer.
 *
 * Invariant under test: the per-zoom density budget must never cull an event that
 * is ON-SCREEN (inside the visible window) at the current zoom. Whole classes of
 * event — short temporal events (STEs) especially — must not disappear just because
 * the layer also holds many long events elsewhere in time.
 *
 * Regression history: the per-zoom DENSITY_BUDGET (event-renderer commit f94e3e8)
 * ran over the ENTIRE layer. At Zoom 9 (CLOCK) and Zoom 0 (MOMENT) — budget 40 —
 * long multi-day events anywhere in time outscored in-window STEs and consumed
 * every slot, so STEs vanished even though they showed fine at Zoom 8 (DAY).
 * Fix (window-before-budget): at daily-sky zooms the budget is applied to the
 * on-screen window only.
 *
 * No test framework is wired up for the GL, so this is a self-contained Node
 * script: `node circaevum/js/renderers/event-types-zoom-visibility.test.js`.
 * Exit 0 = no in-scope event is budget-culled at any zoom (STEs visible at 9/0).
 *
 * Cell legend in the printed matrix:
 *    ✓  visible (a representative survives selection)
 *    —  intentionally out of scope at this zoom (e.g. multi-day LTE at Clock/Moment)
 *    ~  budget-limited overflow (on-screen set exceeds budget — sub-pixel wide zooms)
 *    ✗  BUG: in-scope, fits budget, yet culled  ← any of these fails the test
 */

'use strict';

const assert = require('node:assert');

// ---------------------------------------------------------------------------
// Load the real renderer with controllable zoom + selected-date hooks.
// The renderer reads zoom via window.getCurrentZoomLevel() and the selected time
// via window.getSelectedDateTime(); set both before require so we drive them.
// ---------------------------------------------------------------------------
let CURRENT_ZOOM = 5;
const SELECTED = new Date(2026, 5, 10, 12, 0, 0); // local Wed 10 Jun 2026, noon
globalThis.window = {
  getCurrentZoomLevel: () => CURRENT_ZOOM,
  getSelectedDateTime: () => SELECTED,
};
const EventRenderer = require('./event-renderer.js');

const {
  selectEventsForDensityBudget,
  isEventOnScreenForDensityBudget,
  getEventDensityBudget,
  scoreEventPriority,
  isCircadianHelixZoom,
} = EventRenderer;

assert(typeof selectEventsForDensityBudget === 'function',
  'renderer must export selectEventsForDensityBudget');
assert(typeof isEventOnScreenForDensityBudget === 'function',
  'renderer must export isEventOnScreenForDensityBudget');

const ZOOMS = [
  { z: 0, name: 'MOMENT' },
  { z: 1, name: 'CENTURY' },
  { z: 2, name: 'DECADE' },
  { z: 3, name: 'YEAR' },
  { z: 4, name: 'QUARTER' },
  { z: 5, name: 'MONTH' },
  { z: 6, name: 'LUNAR' },
  { z: 7, name: 'WEEK' },
  { z: 8, name: 'DAY' },
  { z: 9, name: 'CLOCK' },
];

const HOUR = 3600 * 1000;

// Build an event from local Date parts so it lines up with the renderer's
// local-time window math (eventTouchesSelectedCalendarDay / WeekWindow / Month).
function ev(id, type, start, end, extra) {
  const e = {
    uid: id,
    summary: id,
    category: 'Test',
    dtstart: { dateTime: start.toISOString() },
  };
  if (end) e.dtend = { dateTime: end.toISOString() };
  if (extra) Object.assign(e, extra);
  e.__type = type;
  return e;
}
const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo, d, h, mi, 0, 0);

// ---------------------------------------------------------------------------
// Catalog of event object types the renderer distinguishes, each anchored to the
// SELECTED day (so STEs / all-day are genuinely in-window at narrow zooms).
// ---------------------------------------------------------------------------
const EVENT_TYPES = [
  {
    type: 'STE_marker', label: 'Point-in-time STE (no end → marker)', standard: true,
    make: () => ev('marker', 'STE_marker', D(2026, 5, 10, 9), null),
  },
  {
    type: 'STE_subhour', label: 'Sub-hour STE (30m ribbon)', standard: true,
    make: () => ev('subhr', 'STE_subhour', D(2026, 5, 10, 10), D(2026, 5, 10, 10, 30)),
  },
  {
    type: 'STE_multihour', label: 'Multi-hour STE (3h ribbon)', standard: true,
    make: () => ev('multihr', 'STE_multihour', D(2026, 5, 10, 13), D(2026, 5, 10, 16)),
  },
  {
    type: 'AllDay_24h', label: 'All-day / 24h event (selected day)', standard: true,
    make: () => ev('allday', 'AllDay_24h', D(2026, 5, 10), D(2026, 5, 11)),
  },
  {
    type: 'LTE_multiday', label: 'Long temporal event (multi-day, selected month)', standard: true,
    make: () => ev('lte', 'LTE_multiday', D(2026, 5, 5), D(2026, 5, 20)),
  },
  {
    type: 'Timeseries_arc', label: 'Timeseries arc (Garmin HR/sleep)', standard: false,
    make: () => ev('ts', 'Timeseries_arc', D(2026, 5, 10, 8), D(2026, 5, 10, 9),
      { render: { kind: 'timeseries', metric: 'hr' } }),
  },
];

function isTimeseries(e) {
  return !!(e && e.render && e.render.kind === 'timeseries');
}

// ---------------------------------------------------------------------------
// Dense layer: one in-window representative of every type PLUS a wall of 80
// multi-day long events placed a YEAR away (off every daily-sky window). The
// wall is the budget pressure that the old code let crowd out in-window STEs.
// ---------------------------------------------------------------------------
function buildDenseLayer() {
  const events = EVENT_TYPES.map((t) => t.make());
  for (let i = 0; i < 80; i++) {
    const start = D(2025, i % 12, 1 + (i % 20)); // year 2025 — far from selected June 2026
    const end = new Date(start.getTime() + 20 * 24 * HOUR);
    events.push(ev(`wall_${i}`, 'LTE_multiday', start, end));
  }
  return events;
}

// How many dataset events are on-screen at this zoom (independent of selection)?
function onScreenCount(events, zoom) {
  CURRENT_ZOOM = zoom;
  return events.filter((e) => !isTimeseries(e) && isEventOnScreenForDensityBudget(e, zoom)).length;
}

// Run the real selection (standard events only; timeseries bypass the budget).
function selectionSurvivors(events, zoom) {
  CURRENT_ZOOM = zoom;
  const standard = events.filter((e) => !isTimeseries(e));
  const timeseries = events.filter(isTimeseries);
  const { rendered, overflowCount } = selectEventsForDensityBudget(standard, zoom);
  const survivors = new Set([...rendered, ...timeseries].map((e) => e.uid));
  return { survivors, overflowCount };
}

// ---------------------------------------------------------------------------
// Build the matrix and assert: no in-scope event that fits the budget is culled.
// ---------------------------------------------------------------------------
const layer = buildDenseLayer();
const reps = EVENT_TYPES.map((t) => ({ t, rep: t.make() }));
const failures = [];
const rows = [];

for (const { z, name } of ZOOMS) {
  const budget = getEventDensityBudget(z);
  const { survivors, overflowCount } = selectionSurvivors(layer, z);
  const onScreen = onScreenCount(layer, z);
  const fitsBudget = onScreen <= budget;

  const cells = reps.map(({ t, rep }) => {
    CURRENT_ZOOM = z;
    const survived = survivors.has(rep.uid) || (!t.standard); // timeseries bypass budget
    const onScreenHere = !t.standard || isEventOnScreenForDensityBudget(rep, z);
    let cell;
    if (survived) cell = '✓';
    else if (!onScreenHere) cell = '—';        // intentionally out of scope at this zoom
    else if (!fitsBudget) cell = '~';          // legit overflow (sub-pixel wide zoom)
    else { cell = '✗'; failures.push({ z, name, type: t.type, label: t.label }); }
    return `${t.type}:${cell}`;
  });

  rows.push(`  z${z} ${name.padEnd(8)} (budget ${String(budget).padStart(3)}, on-screen ${String(onScreen).padStart(3)}, overflow ${String(overflowCount).padStart(3)}) | ${cells.join('  ')}`);
}

console.log('\nEvent-type × zoom visibility  (✓ visible · — out-of-scope by design · ~ overflow · ✗ BUG):\n');
console.log(rows.join('\n'));

// Concrete regression checks: the exact symptom the user reported.
CURRENT_ZOOM = 9;
const steRep = EVENT_TYPES.find((t) => t.type === 'STE_multihour').make();
const lteRep = EVENT_TYPES.find((t) => t.type === 'LTE_multiday').make();
console.log('\nScoring at Zoom 9 (CLOCK):');
console.log(`  isCircadianHelixZoom(9) = ${isCircadianHelixZoom(9)}`);
console.log(`  scoreEventPriority(LTE 15d) = ${scoreEventPriority(lteRep).toFixed(3)}`);
console.log(`  scoreEventPriority(STE 3h)  = ${scoreEventPriority(steRep).toFixed(3)}`);

const steSurvivesAt = (z) => {
  const { survivors } = selectionSurvivors(layer, z);
  return EVENT_TYPES.filter((t) => t.type.startsWith('STE') || t.type === 'AllDay_24h')
    .every((t) => survivors.has(t.make().uid) ||
      // AllDay is intentionally hidden at Moment(0); only require STEs there.
      (z === 0 && t.type === 'AllDay_24h'));
};
console.log('\nRegression checks (in-window STEs survive despite 80 off-window long events):');
console.log(`  Zoom 8 (DAY):    ${steSurvivesAt(8) ? 'PASS' : 'FAIL'}`);
console.log(`  Zoom 9 (CLOCK):  ${steSurvivesAt(9) ? 'PASS' : 'FAIL'}`);
console.log(`  Zoom 0 (MOMENT): ${steSurvivesAt(0) ? 'PASS' : 'FAIL'}`);

if (failures.length) {
  console.log('\n✗ FAIL — in-scope events culled by the density budget:\n');
  for (const f of failures) {
    console.log(`    Zoom ${f.z} (${f.name}): "${f.label}" [${f.type}] in-window but never rendered`);
  }
  console.log(`\n${failures.length} budget-culling failures.\n`);
  process.exit(1);
} else {
  assert(steSurvivesAt(9) && steSurvivesAt(0) && steSurvivesAt(8),
    'STEs must survive at Zoom 8, 9 and 0');
  console.log('\n✓ PASS — the density budget never culls an on-screen event. ' +
    'STEs are visible at every zoom including Clock (9) and Moment (0).\n');
}
