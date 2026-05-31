/**
 * Shared Edge Esmeralda 2026 build logic: raw portal export → week-split VEVENTs.
 * Used by build-edge-esmeralda-sessions.mjs and build-edge-esmeralda-shareable-weeks.mjs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const RAW_PATH = join(HERE, 'edge-esmeralda-2026-raw.json');
export const LOC = 'Edge Esmeralda, Healdsburg, CA';

export const WINDOW_START = Date.UTC(2026, 4, 30, 0, 0, 0);
export const WINDOW_END = Date.UTC(2026, 5, 28, 7, 0, 0);
export const WEEK_CUTS = [
  Date.UTC(2026, 5, 8, 7, 0, 0),
  Date.UTC(2026, 5, 15, 7, 0, 0),
  Date.UTC(2026, 5, 22, 7, 0, 0)
];

export const PDT_OFFSET_MS = 7 * 60 * 60 * 1000;
export const WEEKEND_PAD_MS = 3 * 24 * 60 * 60 * 1000;

export const TRACK_CAT = {
  'Vital Futures (Health Track)': ['Vital Futures', '#06d6a0'],
  Neurome: ['Neurome', '#4cc9f0'],
  "Women's Health": ["Women's Health", '#ff6b9d'],
  'Consciousness Residency': ['Consciousness', '#9b5de5'],
  'Psychedelic Futures': ['Psychedelic Futures', '#c77dff'],
  Agartha: ['Agartha', '#7b2cbf'],
  'Connection / Community Care': ['Community Care', '#f15bb5'],
  'AI week: Intelligence and Autonomy': ['Intelligence & Autonomy', '#00b4d8'],
  'World Building': ['World Building', '#ffd166'],
  'Environments of Tomorrow': ['Environments of Tomorrow', '#2ec4b6'],
  'Future of Education': ['Future of Education', '#fca311'],
  'Long Journey': ['Long Journey', '#ef476f'],
  Production: ['Production', '#6699cc']
};

export const KIND_CAT = {
  exercise: ['Fitness', '#ef476f'],
  community: ['Community Care', '#f15bb5'],
  'social gathering': ['Social', '#f72585'],
  talk: ['Talks', '#00b4d8'],
  workshop: ['Workshops', '#7b2cbf'],
  party: ['Dance', '#ff6b9d']
};

export const DEFAULT_CAT = ['Edge General', '#e9c46a'];

export const TITLE_RULES = [
  [/women/i, ["Women's Health", '#ff6b9d']],
  [/silence|meditat|breath|sound bath|sauna|wind down|warm ?up|the void|\brest\b|\bnap\b/i, ['Wellness', '#9b5de5']],
  [/yoga|\brun\b|sport|mobility|\bbike\b|swim|fitness|workout|\bgym\b|climb|badger park/i, ['Fitness', '#ef476f']],
  [/clinic|health|biomed|biolog|medical|trial|clair|mochi|kangaroo|nourish/i, ['Vital Futures', '#06d6a0']],
  [/\bai\b|agent|\bcloud\b|zero ?knowledge|\bzk\b|privacy|decentral|democracy|intellect|claw|crypto|protocol|aztec|proof|prime intellect/i, ['Intelligence & Autonomy', '#00b4d8']],
  [/deep work|pomodoro|co-?work|buildathon|vibecoding|\bhack|onboarding|set up|residency|ideation/i, ['Build & Co-Work', '#f3722c']],
  [/lunch|dinner|brunch|breakfast|\bmeal\b|\bfood\b|plaza|byod|coffee|\btea\b/i, ['Meals & Gatherings', '#ffd166']],
  [/check.?in|connect|tour|community|demo day|games|social|mixer|\bmeet\b|wedding|party|courage|hard convo|becoming/i, ['Community Care', '#f15bb5']]
];

export const LONG_TERM_EVENTS = [
  {
    uid: 'ee26-festival',
    summary: 'Edge City Esmeralda 2026',
    description: 'Month-long popup village, Healdsburg CA (May 30 – June 27) — https://www.edgeesmeralda.com/',
    location: LOC,
    dtstart: { dateTime: '2026-05-30T16:00:00Z' },
    dtend: { dateTime: '2026-06-28T05:00:00Z' },
    color: '#f15bb5',
    categories: ['Edge-City-Esmeralda-2026'],
    status: 'CONFIRMED',
    url: 'https://www.edgeesmeralda.com/'
  },
  {
    uid: 'ee26-w1-span',
    summary: 'Protocols for Flourishing',
    description: 'Week 1 (June 1–7): Health & Longevity · Consciousness · Wellbeing · Bio & Neuro.',
    location: LOC,
    dtstart: { dateTime: '2026-06-01T13:00:00Z' },
    dtend: { dateTime: '2026-06-08T01:00:00Z' },
    color: '#00b4d8',
    categories: ['Edge-City-Esmeralda-2026'],
    status: 'CONFIRMED'
  },
  {
    uid: 'ee26-w2-span',
    summary: 'Intelligence & Autonomy',
    description: 'Week 2 (June 8–14): AI · Governance & Coordination · Hard Tech · Privacy · d/acc.',
    location: LOC,
    dtstart: { dateTime: '2026-06-08T09:00:00Z' },
    dtend: { dateTime: '2026-06-15T01:00:00Z' },
    color: '#9b5de5',
    categories: ['Edge-City-Esmeralda-2026'],
    status: 'CONFIRMED'
  },
  {
    uid: 'ee26-w3-span',
    summary: 'Emergent Futures & World Building',
    description: 'Week 3 (June 15–21): Art & Culture · Decentralized Tech · Creative AI · Spatial Computing.',
    location: LOC,
    dtstart: { dateTime: '2026-06-15T09:00:00Z' },
    dtend: { dateTime: '2026-06-22T01:00:00Z' },
    color: '#ffd166',
    categories: ['Edge-City-Esmeralda-2026'],
    status: 'CONFIRMED'
  },
  {
    uid: 'ee26-w4-span',
    summary: 'Environments of Tomorrow',
    description: 'Week 4 (June 22–27): New Urbanism · Education · Energy & Climate · Food Systems.',
    location: LOC,
    dtstart: { dateTime: '2026-06-22T09:00:00Z' },
    dtend: { dateTime: '2026-06-28T01:00:00Z' },
    color: '#06d6a0',
    categories: ['Edge-City-Esmeralda-2026'],
    status: 'CONFIRMED'
  }
];

export const WEEK_SHARE_META = {
  1: {
    slug: 'w1-protocols-for-flourishing',
    calendarName: 'Edge Esmeralda W1 — Protocols for Flourishing',
    subtitle: 'June 1–7 (+ adjacent weekends)',
    spanUid: 'ee26-w1-span'
  },
  2: {
    slug: 'w2-intelligence-autonomy',
    calendarName: 'Edge Esmeralda W2 — Intelligence & Autonomy',
    subtitle: 'June 8–14 (+ adjacent weekends)',
    spanUid: 'ee26-w2-span'
  },
  3: {
    slug: 'w3-emergent-futures',
    calendarName: 'Edge Esmeralda W3 — Emergent Futures & World Building',
    subtitle: 'June 15–21 (+ adjacent weekends)',
    spanUid: 'ee26-w3-span'
  },
  4: {
    slug: 'w4-environments-tomorrow',
    calendarName: 'Edge Esmeralda W4 — Environments of Tomorrow',
    subtitle: 'June 22–27 (+ adjacent weekends)',
    spanUid: 'ee26-w4-span'
  }
};

const DOW = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

function inferCatFromTitle(title) {
  const t = String(title || '');
  for (const [re, cat] of TITLE_RULES) if (re.test(t)) return cat;
  return null;
}

export function parseRRule(s) {
  const out = {};
  for (const part of s.split(';')) {
    const [k, v] = part.split('=');
    out[k] = v;
  }
  const rule = {
    freq: out.FREQ,
    interval: out.INTERVAL ? parseInt(out.INTERVAL, 10) : 1,
    count: out.COUNT ? parseInt(out.COUNT, 10) : null,
    until: null,
    byday: out.BYDAY ? out.BYDAY.split(',').map((d) => DOW[d]) : null
  };
  if (out.UNTIL) {
    const m = out.UNTIL.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (m) {
      rule.until = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
  }
  return rule;
}

export function expand(startMs, durMs, rruleStr) {
  if (!rruleStr) {
    if (startMs >= WINDOW_START && startMs < WINDOW_END) return [startMs];
    return [];
  }
  const r = parseRRule(rruleStr);
  const hardEnd = Math.min(WINDOW_END, r.until != null ? r.until : WINDOW_END);
  const out = [];
  const startDate = new Date(startMs);
  const startWeekday = startDate.getUTCDay();
  const dayMs = 86400000;
  let n = 0;
  for (let t = startMs; t <= hardEnd && out.length < 80; t += dayMs) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    const daysSince = Math.round((t - startMs) / dayMs);
    let hit = false;
    if (r.freq === 'DAILY') {
      hit = daysSince % r.interval === 0;
    } else if (r.freq === 'WEEKLY') {
      const weeksSince = Math.floor(daysSince / 7);
      const onInterval = weeksSince % r.interval === 0 || r.byday;
      if (r.byday) hit = r.byday.includes(wd) && weeksSince % r.interval === 0;
      else hit = wd === startWeekday && onInterval;
    }
    if (!hit) continue;
    if (t >= WINDOW_START) out.push(t);
    n += 1;
    if (r.count != null && n >= r.count) break;
  }
  return out;
}

export function catFor(ev) {
  if (ev.track_title && TRACK_CAT[ev.track_title]) return TRACK_CAT[ev.track_title];
  if (ev.kind && KIND_CAT[ev.kind]) return KIND_CAT[ev.kind];
  return inferCatFromTitle(ev.title) || DEFAULT_CAT;
}

export function venueShort(ev) {
  let v = ev.venue_title || ev.custom_location_name || '';
  v = String(v).replace(/\[OLD[^\]]*\]/i, '').trim();
  v = v.replace(/\s*-\s*\d.*$/, '').trim();
  v = v.replace(/\s*-\s*/g, ' · ').replace(/\s+/g, ' ').trim();
  return v || 'Village';
}

export function fmt(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function clean(s, max) {
  if (!s) return '';
  let t = String(s).replace(/\s+/g, ' ').trim();
  if (max && t.length > max) t = t.slice(0, max - 1).trim() + '…';
  return t;
}

export function eventUrl(ev) {
  const u = ev.meeting_url || ev.custom_location_url || null;
  return u && String(u).trim() ? String(u).trim() : null;
}

export function edgeEventStartMs(e) {
  const s = e && e.dtstart;
  if (!s) return NaN;
  if (s.dateTime) return Date.parse(s.dateTime);
  if (s.date) return Date.parse(String(s.date).slice(0, 10) + 'T12:00:00Z');
  return NaN;
}

export function edgeEventEndMs(e) {
  const x = e && e.dtend;
  if (!x) return NaN;
  if (x.dateTime) return Date.parse(x.dateTime);
  if (x.date) return Date.parse(String(x.date).slice(0, 10) + 'T12:00:00Z');
  return NaN;
}

export function isWeekendPdt(ms) {
  if (!isFinite(ms)) return false;
  const dow = new Date(ms - PDT_OFFSET_MS).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Same weekend bleed as edge-esmeralda-2026.js loadEdgeEsmeraldaWeek().
 */
export function appendAdjacentWeekendEvents(week, base, sessionsByWeek) {
  base = base || [];
  const out = [];
  const seen = {};
  let winStart = Infinity;
  let winEnd = -Infinity;
  for (let i = 0; i < base.length; i++) {
    const e = base[i];
    out.push(e);
    if (e && e.uid != null) seen[e.uid] = true;
    const s = edgeEventStartMs(e);
    const en = edgeEventEndMs(e);
    if (isFinite(s)) {
      if (s < winStart) winStart = s;
      if (s > winEnd) winEnd = s;
    }
    if (isFinite(en) && en > winEnd) winEnd = en;
  }
  if (!isFinite(winStart) || !isFinite(winEnd)) return out;

  const lo = winStart - WEEKEND_PAD_MS;
  const hi = winEnd + WEEKEND_PAD_MS;
  for (let wk = 1; wk <= 4; wk++) {
    if (wk === Number(week)) continue;
    const pool = sessionsByWeek[wk] || [];
    for (let j = 0; j < pool.length; j++) {
      const ev = pool[j];
      if (!ev || ev.uid == null || seen[ev.uid]) continue;
      const es = edgeEventStartMs(ev);
      if (!isFinite(es) || es < lo || es > hi) continue;
      if (!isWeekendPdt(es)) continue;
      seen[ev.uid] = true;
      out.push(ev);
    }
  }
  return out;
}

export function longTermForWeek(week) {
  const meta = WEEK_SHARE_META[week];
  if (!meta) return [];
  const span = LONG_TERM_EVENTS.find((e) => e.uid === meta.spanUid);
  const festival = LONG_TERM_EVENTS.find((e) => e.uid === 'ee26-festival');
  return [festival, span].filter(Boolean);
}

/**
 * @param {object[]} raw portal export rows
 * @param {{ descriptionMax?: number|null }} opts
 */
export function buildWeekSessions(raw, opts = {}) {
  const descriptionMax = opts.descriptionMax ?? 240;
  const weeks = { 1: [], 2: [], 3: [], 4: [] };
  const usedCats = new Map();
  let occCount = 0;

  for (const ev of raw) {
    const startMs = Date.parse(ev.start_time);
    const endMs = Date.parse(ev.end_time);
    if (!isFinite(startMs) || !isFinite(endMs)) continue;
    const durMs = Math.max(15 * 60000, endMs - startMs);
    const [cat, color] = catFor(ev);
    usedCats.set(cat, color);
    const venue = venueShort(ev);
    const url = eventUrl(ev);
    const occs = expand(startMs, durMs, ev.rrule);
    for (let i = 0; i < occs.length; i++) {
      const s = occs[i];
      const e = s + durMs;
      const wk = s < WEEK_CUTS[0] ? 1 : s < WEEK_CUTS[1] ? 2 : s < WEEK_CUTS[2] ? 3 : 4;
      const desc = descriptionMax == null ? clean(ev.content) : clean(ev.content, descriptionMax);
      const row = {
        uid: 'ee26-' + (ev.id || 'x') + (occs.length > 1 ? '-' + i : ''),
        summary: clean(ev.title, 120) || 'Untitled',
        description: desc,
        location: LOC + ' — ' + venue,
        dtstart: { dateTime: fmt(s) },
        dtend: { dateTime: fmt(e) },
        color,
        categories: [cat],
        status: 'CONFIRMED'
      };
      if (url) row.url = url;
      if (ev.host_display_name) row.metadata = { host: ev.host_display_name };
      if (ev.track_title) row.metadata = { ...(row.metadata || {}), track: ev.track_title };
      if (ev.kind) row.metadata = { ...(row.metadata || {}), kind: ev.kind };
      weeks[wk].push(row);
      occCount += 1;
    }
  }

  for (const w of [1, 2, 3, 4]) {
    weeks[w].sort((a, b) => edgeEventStartMs(a) - edgeEventStartMs(b));
  }

  return { weeks, usedCats, occCount, sourceRows: raw.length };
}

export function loadRaw() {
  return JSON.parse(readFileSync(RAW_PATH, 'utf8'));
}

export function buildShareableWeekPack(week, sessionsByWeek) {
  const meta = WEEK_SHARE_META[week];
  const base = sessionsByWeek[week] || [];
  const withWeekends = appendAdjacentWeekendEvents(week, base, sessionsByWeek);
  const events = longTermForWeek(week).concat(withWeekends);
  events.sort((a, b) => edgeEventStartMs(a) - edgeEventStartMs(b));
  const weekendExtras = withWeekends.length - base.length;
  return {
    week,
    ...meta,
    generatedFrom: 'edge-esmeralda-2026-raw.json',
    includesAdjacentWeekends: true,
    sessionCount: base.length,
    weekendExtraCount: weekendExtras,
    longTermCount: longTermForWeek(week).length,
    eventCount: events.length,
    events
  };
}
