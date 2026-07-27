/**
 * Timeseries event renderer — varying-radius arcs on the circadian day disks.
 *
 * Renders VEVENTs that carry a timeseries render descriptor (see VEvent / TimeseriesEvent):
 *   render = { kind: 'timeseries', metric: 'hr' | 'sleepStage', arc: false,
 *              summary: [...], dense: { collection, key, id } }
 *
 *   - metric 'hr': a polyline per day where RADIUS from Earth encodes bpm (low hugs the
 *     surface, high reaches toward the hour ticks), flat ribbon strip (no TubeGeometry).
 *     summary = [{ tOff, v }]  (tOff = ms from dtstart, v = bpm)
 *   - metric 'sleepStage': arcs at ATC band radii (deep = recovery band 1, REM = band 6)
 *     as flat ribbon strokes (extra disk-normal aft replaces former tube volume).
 *     summary = [{ tOff, dur, stage }]  (tOff/dur in ms from dtstart)
 *
 * These events flow through the normal event pipeline (they are layer-toggleable calendar
 * objects); the event-renderer suppresses their default dot/ribbon and this module draws the
 * arc instead. Selected calendar day when the layer is on; Shift peeks other days (one HR arc
 * per calendar day). Sleep sessions plot on the wake day (Garmin calendarDate, or local sleep-start date + 1).
 *
 * Geometry rebuilds when day, blend bucket, shift, or event set changes — not every frame.
 *
 * Dependencies: window.THREE, window.CircadianRenderer, window.circaevumGL,
 * window.isTimeseriesEvent, a calculateDateHeight fn (passed in refresh).
 */
(function (global) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Biometrics stay WITHIN the day frame (radius ≤ the hour-hand / day ring). They are kept readable
  // against the sky canvas not by a larger radius but by a small fore/aft offset along the disk normal
  // (the sky disk sits between the fore HR line and the aft sleep rings).
  const HR_BPM_MIN = 40;
  const HR_BPM_MAX = 170;
  const HR_R_MIN = 0.40; // × hand — low bpm (closer to Earth)
  const HR_R_MAX = 1.0;  // × hand — high bpm (toward the hour ticks)
  // Sleep: tight concentric rings, lifted off the Earth surface (buffer) — deep innermost,
  // awake outermost (depth = radius). Kept close together so phases read as one stacked band.
  const SLEEP_STAGE_RADIUS = { deep: 0.55, light: 0.61, rem: 0.67, awake: 0.73, unknown: 0.61 };
  // Draw biometrics after the sky canvas (renderOrder 7) and ignore its depth so they are not occluded.
  const TS_RENDER_ORDER = 12;
  const SLEEP_STAGE_COLOR = { deep: 0x2a4cff, light: 0x00d2ff, rem: 0xc46bff, awake: 0xffd23c, unknown: 0x8899aa };
  // Small fore/aft lift along the local day-disk normal (not world Y) so lines stay near the selected-time plane.
  const HR_FORE_OFFSET = 0.038; // × hand, in front of the sky canvas
  const SLEEP_AFT_OFFSET = 0.032; // × hand, behind the sky canvas
  /** Former tube radius — used as width base + extra aft lift for sleep ribbons. */
  const SLEEP_TUBE_RADIUS = 0.008; // × hand
  const SLEEP_CONNECTOR_TUBE_RADIUS = 0.006; // × hand — was tube; now lift hint for connectors
  /** Solid Garmin HR red — no zone gradient (resting BPM was reading as purple). */
  const HR_RGB = [0.92, 0.18, 0.22];
  const HR_HEX = 0xeb2e38;
  /** Bump when HR stroke path changes so cached geometry rebuilds. */
  const HR_STROKE_REV = 'hr-ribbon-v1';
  /** Bump when sleep stroke path changes (tube→line). */
  const SLEEP_STROKE_REV = 'sleep-ribbon-v3';
  /** Former tube radius — ribbon half-width base + extra fore lift. */
  const HR_TUBE_RADIUS = 0.007; // × hand
  const HR_AVERAGE_TUBE_RADIUS = 0.009; // × hand
  const HR_LINE_OPACITY = 0.92;
  const HR_AVERAGE_LINE_OPACITY = 0.98;
  const HR_AVERAGE_RGB = [1, 0.96, 0.78];
  const SLEEP_LINE_OPACITY = 0.94;
  /** Extra disk-normal aft so sleep strokes stay clear of sky / disk. */
  const SLEEP_LINE_EXTRA_AFT = SLEEP_TUBE_RADIUS;
  /** Ribbon half-width = hand × SLEEP_TUBE_RADIUS × this. */
  const SLEEP_RIBBON_WIDTH_MUL = 2.4;
  /** Extra disk-normal fore so HR ribbons stay clear of sky (replaces lost tube volume). */
  const HR_LINE_EXTRA_FORE = HR_TUBE_RADIUS;
  /** Ribbon half-width = hand × HR_*_TUBE_RADIUS × this (match sleep fatness). */
  const HR_RIBBON_WIDTH_MUL = 2.4;

  const USER_EVENTS_LAYER = 'user-events';

  function hand() {
    if (global.CircadianRenderer && typeof global.CircadianRenderer.getHandLength === 'function') {
      const h = global.CircadianRenderer.getHandLength();
      if (typeof h === 'number' && isFinite(h) && h > 0) return h;
    }
    return 4.5;
  }

  /** Arc visibility follows the Shift-preview state (hold Shift to reveal). */
  function shiftActive() {
    return typeof global.getCircadianShortEventsShiftPreview === 'function'
      ? !!global.getCircadianShortEventsShiftPreview()
      : false;
  }

  // Sleep: concentric rings by ATC band (deep = recovery near Earth, not workout band).
  // Drawn as ribbon strips (no TubeGeometry); extra aft lift replaces lost tube volume.
  // HR: continuous radius from BPM — same ribbon path, fore of sky canvas.
  function sleepStageRadius(stage) {
    const AB = global.AtcBand;
    if (AB && typeof AB.sleepStageToBand === 'function' && typeof AB.bandToRadius === 'function') {
      return AB.bandToRadius(AB.sleepStageToBand(stage));
    }
    const f = SLEEP_STAGE_RADIUS[stage] != null ? SLEEP_STAGE_RADIUS[stage] : SLEEP_STAGE_RADIUS.unknown;
    return hand() * f;
  }

  function hrRadius(bpm) {
    const b = Math.max(HR_BPM_MIN, Math.min(HR_BPM_MAX, bpm));
    const t = (b - HR_BPM_MIN) / (HR_BPM_MAX - HR_BPM_MIN);
    return hand() * (HR_R_MIN + (HR_R_MAX - HR_R_MIN) * t);
  }

  /** Insert substeps between sparse summary points so the ribbon path glides smoothly. */
  function densifyHrSummary(summary) {
    const pts = (summary || [])
      .map((s) => ({ tOff: Number(s.tOff || 0), v: Number(s.v) }))
      .filter((s) => s.v > 0)
      .sort((a, b) => a.tOff - b.tOff);
    if (pts.length < 2) return pts;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dt = b.tOff - a.tOff;
      if (dt <= 0) continue;
      const steps = Math.max(2, Math.min(16, Math.ceil(dt / (2 * 60 * 1000))));
      for (let k = 0; k < steps; k++) {
        const u = k / steps;
        out.push({ tOff: a.tOff + dt * u, v: a.v + (b.v - a.v) * u });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function hrColor(_bpm) {
    return HR_RGB;
  }

  /** Skip flat all-day rings (constant BPM, no real intraday curve). */
  function isDegenerateFlatHr(summary, startMs, endMs) {
    if (!Array.isArray(summary) || summary.length === 0) return true;
    const bpms = summary.map((s) => Number(s.v)).filter((v) => v > 0);
    if (bpms.length < 2) return true;
    let min = bpms[0];
    let max = bpms[0];
    for (let i = 1; i < bpms.length; i++) {
      if (bpms[i] < min) min = bpms[i];
      if (bpms[i] > max) max = bpms[i];
    }
    if (max - min > 3) return false;
    const firstOff = Number(summary[0].tOff || 0);
    const lastOff = Number(summary[summary.length - 1].tOff || 0);
    const spanMs = lastOff - firstOff;
    const daySpan = isFinite(endMs) && endMs > startMs ? endMs - startMs : MS_PER_DAY;
    return spanMs >= Math.min(MS_PER_DAY, daySpan) * 0.45;
  }

  function hrColorHex(bpm) {
    const c = hrColor(bpm);
    return (
      ((Math.round(c[0] * 255) << 16) |
        (Math.round(c[1] * 255) << 8) |
        Math.round(c[2] * 255)) >>>
      0
    );
  }

  function hexToRgbUnit(hex) {
    const h = hex >>> 0;
    return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  }

  function sleepStageHex(stage) {
    const s = String(stage || 'unknown').toLowerCase();
    return SLEEP_STAGE_COLOR[s] != null ? SLEEP_STAGE_COLOR[s] : SLEEP_STAGE_COLOR.unknown;
  }

  function addTimeseriesMesh(group, mesh, event, layerId, extra) {
    if (!mesh) return;
    tagTimeseriesPick(mesh, event, layerId, extra);
    group.add(mesh);
  }

  /** Split a [startMs,endMs] interval at local midnight boundaries into per-day pieces. */
  function splitByLocalDay(startMs, endMs) {
    const out = [];
    let s = startMs;
    let guard = 0;
    while (s < endMs && guard++ < 14) {
      const d = new Date(s);
      const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
      const e = Math.min(endMs, nextMidnight);
      out.push({ startMs: s, endMs: e });
      s = e;
    }
    return out;
  }

  function makeLine(THREE, positions, colors, opacity) {
    if (positions.length < 6) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(colors), 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: opacity != null ? opacity : 0.95,
      depthWrite: false,
      depthTest: false
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = TS_RENDER_ORDER;
    line.raycast = function () {};
    return line;
  }

  /**
   * Sleep strokes: flat ribbon strip (WebGL ignores Line linewidth). No TubeGeometry/Frenet.
   * halfWidth ≈ former tube radius × SLEEP_RIBBON_WIDTH_MUL; callers already apply disk-normal aft lift.
   */
  function makeSleepStroke(THREE, points, colors, opacity, uniformHex) {
    return makeBiometricRibbon(
      THREE,
      points,
      colors,
      opacity != null ? opacity : SLEEP_LINE_OPACITY,
      uniformHex,
      hand() * SLEEP_TUBE_RADIUS * SLEEP_RIBBON_WIDTH_MUL
    );
  }

  /**
   * HR / average: flat ribbon (no CatmullRom TubeGeometry). Uniform color.
   */
  function makeHrStroke(THREE, points, hex, halfWidth, opacity) {
    return makeBiometricRibbon(
      THREE,
      points,
      null,
      opacity != null ? opacity : HR_LINE_OPACITY,
      hex != null ? hex : HR_HEX,
      halfWidth
    );
  }

  function makeBiometricRibbon(THREE, points, colors, opacity, uniformHex, halfWidth) {
    if (!points || points.length < 2 || !(halfWidth > 0)) return null;
    let hex = uniformHex != null ? uniformHex : 0xffffff;
    if (uniformHex == null && colors && colors.length) {
      const c0 = colors[0];
      const c1 = colors[colors.length - 1] || c0;
      const mid = [
        (c0[0] + c1[0]) * 0.5,
        (c0[1] + c1[1]) * 0.5,
        (c0[2] + c1[2]) * 0.5
      ];
      hex =
        ((Math.round(mid[0] * 255) << 16) |
          (Math.round(mid[1] * 255) << 8) |
          Math.round(mid[2] * 255)) >>>
        0;
    }

    if (typeof RibbonGeometry !== 'undefined' && RibbonGeometry.fromCenterline) {
      const flat = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        flat[i * 3] = points[i].x;
        flat[i * 3 + 1] = points[i].y;
        flat[i * 3 + 2] = points[i].z;
      }
      const geo = RibbonGeometry.fromCenterline(flat, halfWidth, { THREE, ribbonEdgeAttr: false });
      if (geo) {
        const mat = new THREE.MeshBasicMaterial({
          color: hex >>> 0,
          transparent: true,
          opacity: opacity != null ? opacity : 0.95,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = TS_RENDER_ORDER;
        mesh.raycast = function () {};
        return mesh;
      }
    }

    const positions = [];
    const cols = [];
    const fallback = hexToRgbUnit(hex);
    for (let i = 0; i < points.length; i++) {
      positions.push(points[i].x, points[i].y, points[i].z);
      const c = colors && colors[i] ? colors[i] : fallback;
      cols.push(c[0], c[1], c[2]);
    }
    return makeLine(THREE, positions, cols, opacity);
  }

  /** Unit normal of the day disk at `date`/`r`, scaled by `offsetMul` (× hand). */
  function diskNormalOffset(CR, date, r, currentHeight, calculateDateHeightFn, blend, offsetMul) {
    const mag = hand() * (offsetMul != null ? offsetMul : 0);
    if (!mag || !CR || typeof CR.blendedDiskPointAtDate !== 'function') {
      return { x: 0, y: mag || 0, z: 0 };
    }
    const p = CR.blendedDiskPointAtDate(date, r, currentHeight, calculateDateHeightFn, blend);
    const pT = CR.blendedDiskPointAtDate(new Date(date.getTime() + 60000), r, currentHeight, calculateDateHeightFn, blend);
    const pIn = CR.blendedDiskPointAtDate(date, Math.max(r * 0.25, 0.4), currentHeight, calculateDateHeightFn, blend);
    if (!p || !pT || !pIn) return { x: 0, y: mag, z: 0 };
    const tx = pT.x - p.x;
    const ty = pT.y - p.y;
    const tz = pT.z - p.z;
    const wx = p.x - pIn.x;
    const wy = p.y - pIn.y;
    const wz = p.z - pIn.z;
    let nx = ty * wz - tz * wy;
    let ny = tz * wx - tx * wz;
    let nz = tx * wy - ty * wx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-10) return { x: 0, y: mag, z: 0 };
    return { x: (nx / len) * mag, y: (ny / len) * mag, z: (nz / len) * mag };
  }

  function eventStartMs(ev) {
    const dt = ev && ev.dtstart;
    if (!dt) return NaN;
    if (dt.dateTime) return new Date(dt.dateTime).getTime();
    if (dt.date) return new Date(dt.date + 'T00:00:00Z').getTime();
    return NaN;
  }

  function eventEndMs(ev, startMs) {
    const dt = ev && ev.dtend;
    if (dt) {
      if (dt.dateTime) return new Date(dt.dateTime).getTime();
      if (dt.date) return new Date(dt.date + 'T00:00:00Z').getTime();
    }
    return isFinite(startMs) ? startMs + MS_PER_DAY : NaN;
  }

  /** Pull the currently-ingested timeseries events from the GL (only enabled layers are present). */
  function collectTimeseriesEvents() {
    const gl = global.circaevumGL || (global.getGL && global.getGL());
    if (!gl || typeof gl.getEvents !== 'function') return [];
    const isTs = typeof global.isTimeseriesEvent === 'function'
      ? global.isTimeseriesEvent
      : (ev) => !!(ev && ev.render && ev.render.kind === 'timeseries');
    const layerIds = typeof gl.getLayerIds === 'function' ? gl.getLayerIds() : [USER_EVENTS_LAYER];
    const out = [];
    for (const id of layerIds) {
      const evs = gl.getEvents(id) || [];
      for (const ev of evs) if (isTs(ev)) out.push({ ev, layerId: id });
    }
    return out;
  }

  function tagTimeseriesPick(mesh, event, layerId, extra) {
    if (!mesh || !mesh.userData) return;
    mesh.userData.type = 'TimeseriesObject';
    mesh.userData.timeseriesMetric = extra && extra.timeseriesMetric != null ? extra.timeseriesMetric : null;
    mesh.userData.sleepStage = extra && extra.sleepStage != null ? extra.sleepStage : null;
    mesh.userData.eventUid = event && event.uid != null ? event.uid : null;
    mesh.userData.layerId = layerId || null;
    mesh.userData.vevent = event || null;
  }

  function applyMaterialsFocusRecursive(obj, mode) {
    const DIM_MUL = 0.26;
    const HI_MUL = 1.07;
    const walk = (o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m || typeof m.opacity !== 'number') continue;
          if (m.userData._focusBaseOpacity == null) m.userData._focusBaseOpacity = m.opacity;
          const base = m.userData._focusBaseOpacity;
          if (mode === 'restore') m.opacity = base;
          else if (mode === 'highlight') m.opacity = Math.min(1, base * HI_MUL);
          else if (mode === 'dim') m.opacity = Math.max(0.06, base * DIM_MUL);
        }
      }
      if (o.children && o.children.length) o.children.forEach(walk);
    };
    walk(obj);
  }

  let activeGroup = null;
  let lastRefreshKey = '';
  let lastFocusKey = '';

  function sleepWakeDayStartMs(event, startMs) {
    const cd = event && event.render && event.render.displayDate;
    if (typeof cd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cd)) {
      const p = cd.slice(0, 10).split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime();
    }
    if (!isFinite(startMs)) return NaN;
    const s = new Date(startMs);
    return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, 0, 0, 0, 0).getTime();
  }

  /** Plot anchor: wake calendar day at the session's local start clock time. */
  function sleepPlotAnchorMs(event, startMs) {
    const wakeMid = sleepWakeDayStartMs(event, startMs);
    if (!isFinite(wakeMid) || !isFinite(startMs)) return startMs;
    const s = new Date(startMs);
    return new Date(
      new Date(wakeMid).getFullYear(),
      new Date(wakeMid).getMonth(),
      new Date(wakeMid).getDate(),
      s.getHours(),
      s.getMinutes(),
      s.getSeconds(),
      0
    ).getTime();
  }

  function mapSleepPlotMs(wallMs, sleepStartMs, plotAnchorMs) {
    if (!isFinite(wallMs) || !isFinite(sleepStartMs) || !isFinite(plotAnchorMs)) return wallMs;
    return plotAnchorMs + (wallMs - sleepStartMs);
  }

  /** Local-midnight key for which calendar day a timeseries event belongs on. */
  function timeseriesDayStartMs(ev, startMs) {
    const render = ev && ev.render;
    if (render && render.metric === 'sleepStage') {
      return sleepWakeDayStartMs(ev, startMs);
    }
    if (render && typeof render.displayDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(render.displayDate)) {
      const p = render.displayDate.slice(0, 10).split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime();
    }
    if (!isFinite(startMs)) return NaN;
    const s = new Date(startMs);
    return new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0).getTime();
  }

  /** Prefer daily Garmin HR over sleep/sim/average when several land on the same day. */
  function scoreHrEvent(ev) {
    const uid = ev && ev.uid != null ? String(ev.uid) : '';
    let rank = 2;
    if (ev?.render?.average) rank = 0;
    else if (ev?.render?.simulated || ev?.circaevumSource === 'simulated') rank = 1;
    else if (uid.startsWith('garmin-hr-sleep')) rank = 2;
    else if (uid.startsWith('garmin-demo-hr') || ev?.render?.demo) rank = 4
    else if (uid.startsWith('garmin-hr')) rank = 4;
    const summary = ev?.render?.summary;
    const n = Array.isArray(summary) ? summary.length : 0;
    let range = 0;
    if (n >= 2) {
      const bpms = summary.map((s) => Number(s.v)).filter((v) => v > 0);
      if (bpms.length >= 2) range = Math.max(...bpms) - Math.min(...bpms);
    }
    return rank * 100000 + range * 100 + n;
  }

  /**
   * Without Shift: selected calendar day only. With Shift: all days in window.
   * HR: at most one arc per calendar day (best daily plot wins).
   */
  function filterVisibleTimeseries(items, opts) {
    const { selDayStart, selDayEnd, showOtherDays, winStart, winEnd, zl } = opts;
    const out = [];
    const hrByDay = new Map();

    for (const item of items) {
      const ev = item && item.ev ? item.ev : item;
      const layerId = item && item.layerId ? item.layerId : USER_EVENTS_LAYER;
      const render = ev && ev.render;
      if (isSleepOnlyTimeseriesZoom(zl) && (!render || render.metric !== 'sleepStage')) continue;

      const sMs = eventStartMs(ev);
      if (!isFinite(sMs)) continue;
      const dayStart = timeseriesDayStartMs(ev, sMs);
      if (!isFinite(dayStart) || dayStart < winStart || dayStart > winEnd) continue;

      if (!showOtherDays && (dayStart < selDayStart || dayStart >= selDayEnd)) continue;

      if (render && render.metric === 'hr') {
        const prev = hrByDay.get(dayStart);
        if (!prev || scoreHrEvent(ev) > scoreHrEvent(prev.ev)) {
          hrByDay.set(dayStart, { ev, layerId });
        }
        continue;
      }

      if (render && render.metric === 'sleepStage') {
        out.push({ ev, layerId });
      }
    }

    for (const hrItem of hrByDay.values()) out.push(hrItem);
    return out;
  }

  function currentZoomLevel() {
    return typeof global.currentZoom === 'number' ? global.currentZoom : null;
  }

  /** Month (5) and week (7): sleep arcs on the selected day only — not dense HR rings. */
  function isSleepOnlyTimeseriesZoom(zl) {
    return zl === 5 || zl === 7;
  }

  function buildRefreshKey(straightenBlend, currentHeight, selectedDate, spanDays, events) {
    const sel = selectedDate instanceof Date ? selectedDate : new Date();
    const zl = currentZoomLevel();
    // Coarse blend buckets — avoid rebuilding line geometry every animation frame at day zoom.
    const blendQ = Math.round((straightenBlend != null ? straightenBlend : 0) * 5);
    const dayKey = sel.getFullYear() + '-' + sel.getMonth() + '-' + sel.getDate();
    let evKey = String(events.length);
    for (let i = 0; i < events.length; i++) {
      const e = events[i] && events[i].ev ? events[i].ev : events[i];
      evKey += '|' + (e && e.uid != null ? e.uid : i);
    }
    return HR_STROKE_REV + ':' + SLEEP_STROKE_REV + ':' + blendQ + ':' + dayKey + ':' + spanDays + ':' + (zl != null ? zl : 'x') + ':' + (shiftActive() ? 1 : 0) + ':' + evKey;
  }

  function resetRefreshCache() {
    lastRefreshKey = '';
    lastFocusKey = '';
  }

  function syncEventFocusIfNeeded() {
    const gl = global.circaevumGL || (global.getGL && global.getGL());
    if (!gl || typeof gl.getEventFocus !== 'function') return;
    const focus = gl.getEventFocus();
    const focusKey = focus && focus.uid ? focus.layerId + ':' + focus.uid : '';
    if (focusKey === lastFocusKey) return;
    lastFocusKey = focusKey;
    applyEventFocus(focus, null);
  }

  /** Match EventObject focus styling on timeseries lines after setEventHighlight. */
  function applyEventFocus(focus, win) {
    if (!activeGroup) return;
    for (let i = 0; i < activeGroup.children.length; i++) {
      const root = activeGroup.children[i];
      const ud = root.userData;
      if (!ud || ud.type !== 'TimeseriesObject' || !ud.vevent) continue;
      if (!focus || !focus.uid) {
        applyMaterialsFocusRecursive(root, 'restore');
        continue;
      }
      const uidRoot = ud.eventUid != null ? String(ud.eventUid) : '';
      const isSel = ud.layerId === focus.layerId && uidRoot === String(focus.uid);
      if (isSel) applyMaterialsFocusRecursive(root, 'highlight');
      else applyMaterialsFocusRecursive(root, 'dim');
    }
  }

  function hasData() {
    return collectTimeseriesEvents().length > 0;
  }

  /**
   * Build the arc geometry for one timeseries event into `group`.
   * ctx = { THREE, CR, currentHeight, calculateDateHeightFn, blend }
   */
  function buildArcForEvent(event, group, ctx) {
    const render = event && event.render;
    if (!render || render.kind !== 'timeseries') return;
    const summary = Array.isArray(render.summary) ? render.summary : [];
    if (summary.length === 0) return;
    const startMs = eventStartMs(event);
    if (!isFinite(startMs)) return;

    const { THREE, CR, currentHeight, calculateDateHeightFn, blend, layerId } = ctx;

    const point = (ms, r, offsetMul) => {
      const d = new Date(ms);
      const p = CR.blendedDiskPointAtDate(d, r, currentHeight, calculateDateHeightFn, blend);
      if (!p || !offsetMul) return p;
      const off = diskNormalOffset(CR, d, r, currentHeight, calculateDateHeightFn, blend, offsetMul);
      p.x += off.x;
      p.y += off.y;
      p.z += off.z;
      return p;
    };

    if (render.metric === 'hr') {
      const isAverage = render.average === true;
      const endMs = eventEndMs(event, startMs);
      if (!isAverage && isDegenerateFlatHr(summary, startMs, endMs)) return;
      const opacity = isAverage ? HR_AVERAGE_LINE_OPACITY : HR_LINE_OPACITY;
      const strokeHex = isAverage ? 0xfff2cc : HR_HEX;
      const baseR = isAverage ? HR_AVERAGE_TUBE_RADIUS : HR_TUBE_RADIUS;
      const halfWidth = hand() * baseR * HR_RIBBON_WIDTH_MUL;
      const hrFore = HR_FORE_OFFSET + HR_LINE_EXTRA_FORE;
      const dense = densifyHrSummary(summary);
      const points = [];

      for (const s of dense) {
        const bpm = Number(s.v);
        if (!(bpm > 0)) continue;
        const ms = startMs + Number(s.tOff || 0);
        const p = point(ms, hrRadius(bpm), hrFore);
        if (!p) continue;
        points.push(new THREE.Vector3(p.x, p.y, p.z));
      }

      if (points.length < 2) return;

      const stroke = makeHrStroke(THREE, points, strokeHex, halfWidth, opacity);
      if (stroke) stroke.userData.hrStrokeRev = HR_STROKE_REV;
      addTimeseriesMesh(group, stroke, event, layerId, { timeseriesMetric: 'hr' });
      return;
    }

    if (render.metric === 'sleepStage') {
      const segs = [];
      const plotAnchorMs = sleepPlotAnchorMs(event, startMs);
      const plotMs = (ms) => mapSleepPlotMs(ms, startMs, plotAnchorMs);
      // Extra aft replaces lost tube volume so thin Lines stay clear of sky disk.
      const sleepAft = -(SLEEP_AFT_OFFSET + SLEEP_LINE_EXTRA_AFT);
      for (const seg of summary) {
        const stage = String(seg.stage || 'unknown').toLowerCase();
        const segStart = startMs + Number(seg.tOff || 0);
        const segEnd = segStart + Number(seg.dur || 0);
        if (!(segEnd > segStart)) continue;
        segs.push({ stage, startMs: segStart, endMs: segEnd });
      }

      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const r = sleepStageRadius(seg.stage);
        const hex = sleepStageHex(seg.stage);

        for (const piece of splitByLocalDay(plotMs(seg.startMs), plotMs(seg.endMs))) {
          const durMin = (piece.endMs - piece.startMs) / 60000;
          const steps = Math.max(2, Math.min(16, Math.ceil(durMin / 8)));
          const points = [];
          for (let i = 0; i <= steps; i++) {
            const ms = piece.startMs + ((piece.endMs - piece.startMs) * i) / steps;
            const p = point(ms, r, sleepAft);
            if (!p) continue;
            points.push(new THREE.Vector3(p.x, p.y, p.z));
          }
          const stroke = makeSleepStroke(THREE, points, null, SLEEP_LINE_OPACITY, hex);
          addTimeseriesMesh(group, stroke, event, layerId, {
            timeseriesMetric: 'sleepStage',
            sleepStage: seg.stage
          });
        }

        if (si + 1 < segs.length) {
          const next = segs[si + 1];
          const tMs = plotMs(next.startMs);
          const rNext = sleepStageRadius(next.stage);
          if (Math.abs(rNext - r) > 1e-4) {
            const p0 = point(plotMs(seg.endMs), r, sleepAft);
            const p1 = point(tMs, rNext, sleepAft);
            if (p0 && p1) {
              const c0 = hexToRgbUnit(hex);
              const c1 = hexToRgbUnit(sleepStageHex(next.stage));
              const connector = makeSleepStroke(
                THREE,
                [new THREE.Vector3(p0.x, p0.y, p0.z), new THREE.Vector3(p1.x, p1.y, p1.z)],
                [c0, c1],
                SLEEP_LINE_OPACITY
              );
              addTimeseriesMesh(group, connector, event, layerId, {
                timeseriesMetric: 'sleepStage',
                sleepStage: next.stage,
                sleepConnector: true
              });
            }
          }
        }
      }
    }
  }

  /** Create the timeseries group. Empty until refreshed; flagged so the animate loop drives it. */
  function createGroup() {
    if (!global.THREE) return null;
    const group = new global.THREE.Group();
    group.userData = { circadianTimeseriesAnim: true };
    activeGroup = group;
    return group;
  }

  function clearGroup(group) {
    if (!group) return;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i];
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
      group.remove(c);
    }
  }

  /**
   * Rebuild arc geometry for every visible timeseries event in the day window.
   * @param {THREE.Group} group
   * @param {number} straightenBlend
   * @param {number} currentHeight
   * @param {Date} selectedDate
   * @param {number} spanDays
   * @param {function} calculateDateHeightFn
   */
  function refreshGroup(group, straightenBlend, currentHeight, selectedDate, spanDays, calculateDateHeightFn) {
    if (!group || !group.userData || !group.userData.circadianTimeseriesAnim) return;
    const THREE = global.THREE;
    const CR = global.CircadianRenderer;
    if (!THREE || !CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeightFn !== 'function') {
      return;
    }

    const events = collectTimeseriesEvents();
    const refreshKey = buildRefreshKey(straightenBlend, currentHeight, selectedDate, spanDays, events);
    if (refreshKey === lastRefreshKey && group.children.length > 0) {
      syncEventFocusIfNeeded();
      return;
    }
    lastRefreshKey = refreshKey;
    clearGroup(group);
    if (events.length === 0) return;

    const sel = selectedDate instanceof Date ? selectedDate : new Date();
    const span = spanDays != null ? spanDays : 2;
    // Shift preview: expand window so nearby days show even when navigated to a past date.
    const effectiveSpan = shiftActive() ? Math.max(span, 30) : span;
    const pad = Math.ceil(effectiveSpan / 2) + 1;
    const selMid = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0).getTime();
    const winStart = selMid - pad * MS_PER_DAY;
    const winEnd = selMid + (pad + 1) * MS_PER_DAY;
    // Selected day when layer on; Shift additionally reveals other days (one HR arc per day).
    const selDayStart = selMid;
    const selDayEnd = selMid + MS_PER_DAY;
    const showOtherDays = shiftActive();

    const ctx = {
      THREE,
      CR,
      currentHeight,
      calculateDateHeightFn,
      blend: straightenBlend
    };

    const zl = currentZoomLevel();
    const visible = filterVisibleTimeseries(events, {
      selDayStart,
      selDayEnd,
      showOtherDays,
      winStart,
      winEnd,
      zl
    });

    for (const item of visible) {
      const ev = item.ev;
      const layerId = item.layerId;
      buildArcForEvent(ev, group, { ...ctx, layerId });
    }
    syncEventFocusIfNeeded();
  }

  const TimeseriesRenderer = {
    HR_STROKE_REV,
    hasData,
    createGroup,
    refreshGroup,
    clearGroup,
    buildArcForEvent,
    applyEventFocus,
    resetRefreshCache
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeseriesRenderer;
  } else {
    global.TimeseriesRenderer = TimeseriesRenderer;
  }
})(typeof window !== 'undefined' ? window : this);
