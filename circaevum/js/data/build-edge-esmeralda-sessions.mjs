/**
 * Build script: convert the real Edge Esmeralda 2026 portal export
 * (edge-esmeralda-2026-raw.json) into week-split VEVENT session packs the GL
 * can ingest. Expands RRULE recurrences (the GL does not), maps each Edge
 * track/kind to a colored, toggleable category, and writes
 * edge-esmeralda-2026-sessions.js (registers weeks 1-4).
 *
 * Run: node yang/web/circaevum/js/data/build-edge-esmeralda-sessions.mjs
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, buildWeekSessions, loadRaw } from './edge-esmeralda-build-core.mjs';

const OUT = join(HERE, 'edge-esmeralda-2026-sessions.js');

const raw = loadRaw();
const { weeks, usedCats, occCount } = buildWeekSessions(raw, { descriptionMax: 240 });

const styleLines = [...usedCats.entries()]
  .map(([c, col]) => `    ${JSON.stringify(c)}: '${col}'`)
  .join(',\n');

const banner =
  '/**\n' +
  ' * Edge Esmeralda 2026 — REAL session packs (weeks 1-4), generated from the\n' +
  ' * portal export by build-edge-esmeralda-sessions.mjs. RRULE recurrences are\n' +
  ' * pre-expanded into occurrences within the festival window. Each Edge track /\n' +
  ' * kind is a toggleable category. DO NOT hand-edit; re-run the build script.\n' +
  ` * Events: ${occCount} occurrences from ${raw.length} source rows.\n` +
  ' */\n';

const body =
  banner +
  '(function (global) {\n' +
  `  var WEEK_CATEGORY_COLORS = {\n${styleLines}\n  };\n\n` +
  `  var weeks = ${JSON.stringify(weeks)};\n\n` +
  '  if (typeof global.registerEdgeEsmeraldaWeekSessions === "function") {\n' +
  '    [1, 2, 3, 4].forEach(function (w) {\n' +
  '      global.registerEdgeEsmeraldaWeekSessions(w, weeks[w] || []);\n' +
  '    });\n' +
  '  }\n' +
  '  if (typeof global.registerEdgeEsmeraldaCategoryColors === "function") {\n' +
  '    global.registerEdgeEsmeraldaCategoryColors(WEEK_CATEGORY_COLORS);\n' +
  '  }\n' +
  '  global.edgeEsmeralda2026Weeks = weeks;\n' +
  '  global.edgeEsmeralda2026CategoryColors = WEEK_CATEGORY_COLORS;\n' +
  '})(typeof window !== "undefined" ? window : this);\n';

writeFileSync(OUT, body);
console.log('Wrote', OUT);
console.log('Occurrences total:', occCount);
for (const w of [1, 2, 3, 4]) console.log('  W' + w + ':', weeks[w].length);
console.log('Categories:', [...usedCats.keys()].join(', '));
