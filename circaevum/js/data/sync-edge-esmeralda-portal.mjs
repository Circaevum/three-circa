/**
 * Sync Edge Esmeralda portal JSON exports:
 *   - diff incoming vs canonical raw
 *   - apply updates + rebuild GL sessions + shareable CSVs
 *   - track personal attendance (my-plan.json)
 *
 * Usage:
 *   node sync-edge-esmeralda-portal.mjs diff [export.json]
 *   node sync-edge-esmeralda-portal.mjs apply [export.json]
 *   node sync-edge-esmeralda-portal.mjs plan [--csv]
 *   node sync-edge-esmeralda-portal.mjs mark <eventKey> [--status going|maybe|skip] [--note text]
 *   node sync-edge-esmeralda-portal.mjs unmark <eventKey>
 *
 * export.json may be a raw array or { results: [...], paging?: {...} }.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HERE,
  RAW_PATH,
  dedupeRawPortalEvents,
  loadRaw,
  portalEventKey
} from './edge-esmeralda-build-core.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const EE_DIR = join(REPO_ROOT, 'internal', 'collaborations', 'edge-esmeralda-2026');
const INCOMING_DIR = join(EE_DIR, 'incoming');
const PLAN_PATH = join(EE_DIR, 'my-plan.json');
const REPORTS_DIR = join(INCOMING_DIR, 'reports');

const RSVP_TO_STATUS = {
  registered: 'going',
  going: 'going',
  accepted: 'going',
  maybe: 'maybe',
  interested: 'maybe',
  waitlisted: 'maybe',
  declined: 'skip',
  cancelled: 'skip'
};

function parsePortalExportInput(pathOrJson) {
  let data;
  if (pathOrJson && existsSync(pathOrJson)) {
    data = JSON.parse(readFileSync(pathOrJson, 'utf8'));
  } else if (pathOrJson) {
    data = JSON.parse(pathOrJson);
  } else {
    throw new Error('Missing export file path');
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  throw new Error('Expected JSON array or { results: [...] }');
}

function eventFingerprint(ev) {
  return JSON.stringify({
    title: ev.title,
    start: ev.start_time,
    end: ev.end_time,
    rrule: ev.rrule,
    occurrence_id: ev.occurrence_id,
    venue: ev.venue_title,
    track: ev.track_title,
    kind: ev.kind,
    status: ev.status,
    hidden: ev.hidden,
    updated: ev.updated_at,
    seq: ev.ical_sequence,
    rsvp: ev.my_rsvp_status
  });
}

function indexPortalRows(rows) {
  const map = new Map();
  for (const ev of dedupeRawPortalEvents(rows)) {
    map.set(portalEventKey(ev), ev);
  }
  return map;
}

function comparePortalExports(oldRows, newRows) {
  const oldMap = indexPortalRows(oldRows);
  const newMap = indexPortalRows(newRows);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, ev] of newMap) {
    if (!oldMap.has(key)) added.push(ev);
  }
  for (const [key, ev] of oldMap) {
    if (!newMap.has(key)) removed.push(ev);
  }
  for (const [key, nev] of newMap) {
    const oev = oldMap.get(key);
    if (!oev) continue;
    if (eventFingerprint(oev) !== eventFingerprint(nev)) {
      changed.push({ key, before: oev, after: nev });
    }
  }

  return {
    oldMap,
    newMap,
    added,
    removed,
    changed,
    oldUnique: oldMap.size,
    newUnique: newMap.size,
    oldRawCount: oldRows.length,
    newRawCount: newRows.length
  };
}

function fmtEventLine(ev) {
  const when = ev.start_time ? ev.start_time.replace('T', ' ').replace(':00Z', 'Z') : '?';
  const title = String(ev.title || 'Untitled').slice(0, 72);
  return `${when}  ${title}  [${portalEventKey(ev)}]`;
}

function loadPlan() {
  if (!existsSync(PLAN_PATH)) {
    return { version: 1, updated_at: null, events: {} };
  }
  return JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
}

function savePlan(plan) {
  plan.updated_at = new Date().toISOString();
  mkdirSync(dirname(PLAN_PATH), { recursive: true });
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2) + '\n');
}

function planEntryFromPortal(ev, status, source) {
  return {
    status,
    source,
    portal_rsvp: ev.my_rsvp_status || null,
    event_id: ev.id || null,
    occurrence_id: ev.occurrence_id || null,
    title: ev.title || null,
    start_time: ev.start_time || null,
    end_time: ev.end_time || null,
    venue: ev.venue_title || null,
    track: ev.track_title || null,
    note: '',
    marked_at: new Date().toISOString()
  };
}

function mergePortalRsvps(plan, portalRows) {
  let imported = 0;
  for (const ev of dedupeRawPortalEvents(portalRows)) {
    if (!ev.my_rsvp_status) continue;
    const key = portalEventKey(ev);
    const status = RSVP_TO_STATUS[String(ev.my_rsvp_status).toLowerCase()] || 'going';
    const prev = plan.events[key];
    if (prev && prev.source === 'manual' && prev.status !== status) continue;
    plan.events[key] = {
      ...(prev || {}),
      ...planEntryFromPortal(ev, status, 'portal-rsvp')
    };
    imported += 1;
  }
  return imported;
}

function resolvePortalEvent(key, portalMap) {
  if (portalMap.has(key)) return portalMap.get(key);
  for (const ev of portalMap.values()) {
    if (ev.id === key || ev.occurrence_id === key) return ev;
  }
  return null;
}

function markEvent(key, opts = {}) {
  const plan = loadPlan();
  const portalMap = indexPortalRows(loadRaw());
  const ev = resolvePortalEvent(key, portalMap);
  const status = opts.status || 'going';
  if (!['going', 'maybe', 'skip'].includes(status)) {
    throw new Error('status must be going, maybe, or skip');
  }
  plan.events[key] = {
    ...(plan.events[key] || {}),
    ...(ev ? planEntryFromPortal(ev, status, 'manual') : {
      status,
      source: 'manual',
      title: null,
      start_time: null,
      marked_at: new Date().toISOString()
    }),
    note: opts.note != null ? String(opts.note) : (plan.events[key]?.note || '')
  };
  savePlan(plan);
  console.log(`Marked ${status}: ${key}`);
  if (ev) console.log(' ', fmtEventLine(ev));
}

function unmarkEvent(key) {
  const plan = loadPlan();
  if (!plan.events[key]) {
    console.log('No plan entry for', key);
    return;
  }
  delete plan.events[key];
  savePlan(plan);
  console.log('Removed plan entry:', key);
}

function escapeCsvCell(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function buildPlanCsv(plan, portalMap) {
  const headers = ['Status', 'Title', 'Start', 'End', 'Venue', 'Track', 'Note', 'Key', 'EventId'];
  const rows = Object.entries(plan.events)
    .map(([key, entry]) => {
      const ev = portalMap.get(key) || resolvePortalEvent(key, portalMap);
      const start = entry.start_time || ev?.start_time || '';
      const end = entry.end_time || ev?.end_time || '';
      return {
        start,
        line: [
          escapeCsvCell(entry.status),
          escapeCsvCell(entry.title || ev?.title),
          escapeCsvCell(start),
          escapeCsvCell(end),
          escapeCsvCell(entry.venue || ev?.venue_title),
          escapeCsvCell(entry.track || ev?.track_title),
          escapeCsvCell(entry.note || ''),
          escapeCsvCell(key),
          escapeCsvCell(entry.event_id || ev?.id || '')
        ].join(',')
      };
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .map((r) => r.line);
  return [headers.join(','), ...rows].join('\r\n');
}

function printPlan(plan, portalMap, writeCsv) {
  const entries = Object.entries(plan.events).sort((a, b) => {
    const sa = a[1].start_time || portalMap.get(a[0])?.start_time || '';
    const sb = b[1].start_time || portalMap.get(b[0])?.start_time || '';
    return String(sa).localeCompare(String(sb));
  });
  console.log(`Personal plan: ${entries.length} event(s)`);
  for (const [key, entry] of entries) {
    const ev = portalMap.get(key);
    const when = entry.start_time || ev?.start_time || '?';
    const title = entry.title || ev?.title || key;
    const note = entry.note ? ` — ${entry.note}` : '';
    console.log(`[${entry.status}] ${when}  ${title}${note}`);
    console.log(`  key: ${key}`);
  }
  if (writeCsv) {
    const csvPath = join(EE_DIR, 'my-plan.csv');
    writeFileSync(csvPath, buildPlanCsv(plan, portalMap));
    console.log('Wrote', csvPath);
  }
}

function writeDiffReport(label, diff) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const lines = [
    `# Edge Esmeralda portal diff — ${label}`,
    '',
    `- Old raw rows: ${diff.oldRawCount} (${diff.oldUnique} unique occurrences)`,
    `- New raw rows: ${diff.newRawCount} (${diff.newUnique} unique occurrences)`,
    `- Added: ${diff.added.length}`,
    `- Removed: ${diff.removed.length}`,
    `- Changed: ${diff.changed.length}`,
    ''
  ];
  if (diff.added.length) {
    lines.push('## Added', '');
    for (const ev of diff.added.slice(0, 100)) lines.push('- ' + fmtEventLine(ev));
    if (diff.added.length > 100) lines.push(`- … and ${diff.added.length - 100} more`);
    lines.push('');
  }
  if (diff.removed.length) {
    lines.push('## Removed', '');
    for (const ev of diff.removed.slice(0, 100)) lines.push('- ' + fmtEventLine(ev));
    if (diff.removed.length > 100) lines.push(`- … and ${diff.removed.length - 100} more`);
    lines.push('');
  }
  if (diff.changed.length) {
    lines.push('## Changed', '');
    for (const { before, after } of diff.changed.slice(0, 100)) {
      lines.push(`- ${fmtEventLine(after)}`);
      if (before.start_time !== after.start_time) {
        lines.push(`  - start: ${before.start_time} → ${after.start_time}`);
      }
      if (before.title !== after.title) {
        lines.push(`  - title: ${before.title} → ${after.title}`);
      }
      if (before.venue_title !== after.venue_title) {
        lines.push(`  - venue: ${before.venue_title} → ${after.venue_title}`);
      }
      if (before.my_rsvp_status !== after.my_rsvp_status) {
        lines.push(`  - rsvp: ${before.my_rsvp_status} → ${after.my_rsvp_status}`);
      }
    }
    if (diff.changed.length > 100) lines.push(`- … and ${diff.changed.length - 100} more`);
    lines.push('');
  }
  const reportPath = join(REPORTS_DIR, `${label}.md`);
  writeFileSync(reportPath, lines.join('\n'));
  return reportPath;
}

function printDiffSummary(diff, reportPath) {
  console.log('Edge Esmeralda portal diff');
  console.log(`  old: ${diff.oldRawCount} raw rows / ${diff.oldUnique} unique occurrences`);
  console.log(`  new: ${diff.newRawCount} raw rows / ${diff.newUnique} unique occurrences`);
  console.log(`  added: ${diff.added.length}`);
  console.log(`  removed: ${diff.removed.length}`);
  console.log(`  changed: ${diff.changed.length}`);
  if (reportPath) console.log(`  report: ${reportPath}`);
  if (diff.added.length) {
    console.log('\nAdded (sample):');
    diff.added.slice(0, 8).forEach((ev) => console.log('  +', fmtEventLine(ev)));
  }
  if (diff.changed.length) {
    console.log('\nChanged (sample):');
    diff.changed.slice(0, 8).forEach(({ before, after }) => {
      console.log('  ~', fmtEventLine(after));
      if (before.start_time !== after.start_time) {
        console.log(`      start ${before.start_time} → ${after.start_time}`);
      }
    });
  }
}

function rebuildDerived() {
  execSync('node build-edge-esmeralda-sessions.mjs', { cwd: HERE, stdio: 'inherit' });
  execSync('node build-edge-esmeralda-shareable-weeks.mjs', { cwd: HERE, stdio: 'inherit' });
}

function cmdDiff(inPath) {
  const incoming = parsePortalExportInput(inPath);
  const current = existsSync(RAW_PATH) ? loadRaw() : [];
  const diff = comparePortalExports(current, incoming);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = writeDiffReport(`diff-${stamp}`, diff);
  printDiffSummary(diff, reportPath);
  return diff;
}

function cmdApply(inPath) {
  const incoming = parsePortalExportInput(inPath);
  const current = existsSync(RAW_PATH) ? loadRaw() : [];
  const diff = comparePortalExports(current, incoming);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  mkdirSync(INCOMING_DIR, { recursive: true });
  const archivePath = join(INCOMING_DIR, `portal-export-${stamp}.json`);
  writeFileSync(archivePath, JSON.stringify(incoming, null, 2) + '\n');

  const deduped = dedupeRawPortalEvents(incoming);
  writeFileSync(RAW_PATH, JSON.stringify(deduped, null, 2) + '\n');

  const plan = loadPlan();
  const imported = mergePortalRsvps(plan, incoming);
  savePlan(plan);

  const reportPath = writeDiffReport(`apply-${stamp}`, diff);
  printDiffSummary(diff, reportPath);
  console.log(`\nArchived: ${archivePath}`);
  console.log(`Updated raw: ${RAW_PATH} (${deduped.length} unique occurrence rows)`);
  console.log(`Portal RSVPs merged into my-plan: ${imported}`);

  console.log('\nRebuilding GL sessions + shareable CSVs…');
  rebuildDerived();
  printPlan(plan, diff.newMap, true);
}

function parseArgs(argv) {
  const args = [...argv];
  const cmd = args.shift() || 'diff';
  const flags = { csv: false, status: 'going', note: '' };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--csv') flags.csv = true;
    else if (a === '--status' && args[i + 1]) flags.status = args[++i];
    else if (a === '--note' && args[i + 1]) flags.note = args[++i];
    else positional.push(a);
  }
  return { cmd, positional, flags };
}

function main() {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));

  if (cmd === 'diff') {
    const inPath = positional[0] || join(INCOMING_DIR, 'portal-export-latest.json');
    if (!existsSync(inPath)) {
      console.error('Usage: node sync-edge-esmeralda-portal.mjs diff <export.json>');
      process.exit(1);
    }
    cmdDiff(inPath);
    return;
  }

  if (cmd === 'apply') {
    const inPath = positional[0];
    if (!inPath || !existsSync(inPath)) {
      console.error('Usage: node sync-edge-esmeralda-portal.mjs apply <export.json>');
      process.exit(1);
    }
    cmdApply(inPath);
    return;
  }

  if (cmd === 'plan') {
    const plan = loadPlan();
    const portalMap = indexPortalRows(loadRaw());
    printPlan(plan, portalMap, flags.csv);
    return;
  }

  if (cmd === 'mark') {
    const key = positional[0];
    if (!key) {
      console.error('Usage: node sync-edge-esmeralda-portal.mjs mark <eventKey> [--status going|maybe|skip]');
      process.exit(1);
    }
    markEvent(key, { status: flags.status, note: flags.note });
    return;
  }

  if (cmd === 'unmark') {
    const key = positional[0];
    if (!key) {
      console.error('Usage: node sync-edge-esmeralda-portal.mjs unmark <eventKey>');
      process.exit(1);
    }
    unmarkEvent(key);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main();
