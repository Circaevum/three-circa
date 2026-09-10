/**
 * Admin render-tax HUD — split timeline + lag-spike cards.
 *
 * Left: session summary (clickable lag markers).
 * Right: last ~10s live (cyan frame ms, amber draw calls).
 * Toggle: Shift+P, or ?perf=1. Does not freeze on lag.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'circaevum.adminPerfHud';
  var MAX_FRAMES = 720;
  var MAX_CRUMBS = 180;
  var HOT_WINDOW_MS = 30000;
  var SHORT_MS = 10000;
  var DRAW_CAP_FALLBACK = 800;
  var LAG_MS = 33;
  var MAX_LAG_MOMENTS = 64;
  var LAG_MERGE_MS = 280;
  var SESSION_STEP = 250;
  var MAX_SESSION = 2400;

  var KIND = {
    zoom: { color: '#c4b5fd', label: 'zoom' },
    planets: { color: '#34d399', label: 'planets' },
    events: { color: '#f472b6', label: 'events' },
    layer: { color: '#fb7185', label: 'layer' },
    markers: { color: '#60a5fa', label: 'markers' },
    hoop: { color: '#e879f9', label: 'hoop' },
    ingest: { color: '#fb923c', label: 'ingest' },
    scrub: { color: '#94a3b8', label: 'scrub' },
    lag: { color: '#f43f5e', label: 'lag' }
  };

  var frames = [];
  var crumbs = [];
  var sessionSamples = [];
  var sessionStart = 0;
  var layerHot = Object.create(null);
  var eventHot = Object.create(null);
  var visible = false;
  var lastTickT = 0;
  var lastUiPaint = 0;
  var lagArmed = true;
  var drawCallPeak = DRAW_CAP_FALLBACK;
  var lastSpike = null;
  var selectedSpike = null;
  var lagMoments = [];
  var layout = null;
  var root = null;
  var canvas = null;
  var ctx = null;
  var statsEl = null;
  var spikeEl = null;
  var lagSumEl = null;
  var logEl = null;
  var hotLayerEl = null;
  var hotEventEl = null;
  var hoverEl = null;

  function nowMs() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function wantsAutoOpen() {
    try {
      var q = new URLSearchParams(global.location.search);
      if (q.get('perf') === '1' || q.get('perfHud') === '1') return true;
    } catch (e) { /* ignore */ }
    try {
      return global.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e2) {
      return false;
    }
  }

  function persistVisible(on) {
    try {
      global.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  function pruneHot(map, cutoff) {
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var row = map[keys[i]];
      if (!row || !row.hits) continue;
      var keep = [];
      var totalMs = 0;
      for (var h = 0; h < row.hits.length; h++) {
        if (row.hits[h].t >= cutoff) {
          keep.push(row.hits[h]);
          totalMs += row.hits[h].ms || 0;
        }
      }
      if (!keep.length) {
        delete map[keys[i]];
      } else {
        row.hits = keep;
        row.count = keep.length;
        row.totalMs = totalMs;
        row.lastAt = keep[keep.length - 1].t;
      }
    }
  }

  function rankHot(map, limit) {
    var cutoff = nowMs() - HOT_WINDOW_MS;
    pruneHot(map, cutoff);
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return (b.totalMs || 0) - (a.totalMs || 0);
    });
    return rows.slice(0, limit || 6);
  }

  function pushCrumb(kind, label, extra) {
    var spec = KIND[kind] || KIND.events;
    var t = nowMs();
    var last = crumbs.length ? crumbs[crumbs.length - 1] : null;
    if (last && last.kind === kind && last.label === label && t - last.t < 40) {
      last.n = (last.n || 1) + 1;
      if (extra && extra.ms != null) last.ms = (last.ms || 0) + extra.ms;
      last.t = t;
      return last;
    }
    var crumb = {
      t: t,
      kind: kind,
      color: spec.color,
      label: String(label || spec.label).slice(0, 72),
      ms: extra && extra.ms != null ? extra.ms : 0,
      extra: extra || null,
      n: 1
    };
    crumbs.push(crumb);
    if (crumbs.length > MAX_CRUMBS) crumbs.splice(0, crumbs.length - MAX_CRUMBS);
    return crumb;
  }

  function mark(kind, label, extra) {
    extra = extra || {};
    if (extra.skip) return null;
    if (kind === 'scrub' && !(extra.ms >= 8)) return null;
    if (kind === 'layer' || kind === 'events') {
      var lid = extra.layerId || label;
      if (lid) {
        if (!layerHot[lid]) {
          layerHot[lid] = { key: lid, name: extra.name || lid, count: 0, totalMs: 0, hits: [], events: 0, meshes: 0 };
        }
        layerHot[lid].count += 1;
        layerHot[lid].totalMs += extra.ms || 0;
        layerHot[lid].events = extra.events != null ? extra.events : layerHot[lid].events;
        layerHot[lid].meshes = extra.meshes != null ? extra.meshes : layerHot[lid].meshes;
        layerHot[lid].hits.push({ t: nowMs(), ms: extra.ms || 0 });
        layerHot[lid].lastAt = nowMs();
      }
    }
    return pushCrumb(kind, label, extra);
  }

  function begin(kind, label) {
    var t0 = nowMs();
    return {
      end: function (extra) {
        extra = extra || {};
        extra.ms = nowMs() - t0;
        return mark(kind, label, extra);
      }
    };
  }

  function measure(kind, label, fn) {
    var span = begin(kind, label);
    try {
      return fn();
    } finally {
      span.end();
    }
  }

  function noteLayerRebuild(layerId, extra) {
    extra = extra || {};
    extra.layerId = layerId;
    return mark('layer', String(layerId), extra);
  }

  function noteEventRemesh(uid, layerId, summary) {
    if (!uid) return;
    var key = String(uid);
    if (!eventHot[key]) {
      eventHot[key] = {
        key: key,
        uid: key,
        layerId: layerId || '',
        summary: String(summary || key).slice(0, 56),
        count: 0,
        hits: [],
        totalMs: 0
      };
    }
    var row = eventHot[key];
    row.count += 1;
    row.layerId = layerId || row.layerId;
    if (summary) row.summary = String(summary).slice(0, 56);
    row.hits.push({ t: nowMs(), ms: 0 });
    row.lastAt = nowMs();
  }

  function pushSession(t, dt, calls) {
    if (!sessionStart) sessionStart = t;
    var last = sessionSamples.length ? sessionSamples[sessionSamples.length - 1] : null;
    if (last && t - last.t < SESSION_STEP) {
      last.dt = Math.max(last.dt, dt);
      last.calls = Math.max(last.calls, calls);
      return;
    }
    sessionSamples.push({ t: t, dt: dt, calls: calls });
    if (sessionSamples.length > MAX_SESSION) {
      var next = [];
      for (var i = 0; i < sessionSamples.length; i += 2) {
        var a = sessionSamples[i];
        var b = sessionSamples[i + 1];
        if (!b) {
          next.push(a);
          break;
        }
        next.push({
          t: a.t,
          dt: Math.max(a.dt, b.dt),
          calls: Math.max(a.calls, b.calls)
        });
      }
      sessionSamples = next;
    }
  }

  function crumbsNear(t, padBefore, padAfter) {
    var a = t - (padBefore || 80);
    var b = t + (padAfter || 20);
    var out = [];
    for (var i = 0; i < crumbs.length; i++) {
      var c = crumbs[i];
      var c0 = c.t - (c.ms || 0);
      var c1 = c.t;
      if (c1 >= a && c0 <= b && c.kind !== 'lag') out.push(c);
    }
    out.sort(function (x, y) { return (y.ms || 0) - (x.ms || 0); });
    return out;
  }

  function primaryCause(near) {
    if (!near || !near.length) {
      return { key: 'unattributed', label: 'GPU / lerp', color: '#94a3b8', ms: 0 };
    }
    var top = near[0];
    return {
      key: top.kind + ':' + top.label,
      label: top.label,
      color: top.color,
      ms: top.ms || 0
    };
  }

  function recordSpike(dt, t) {
    var near = crumbsNear(t, Math.max(dt + 40, 120), 30);
    var cause = primaryCause(near);
    lastSpike = {
      t: t,
      dt: dt,
      crumbs: near.slice(0, 6),
      causeKey: cause.key,
      causeLabel: cause.label,
      color: cause.color
    };
    if (!selectedSpike) selectedSpike = lastSpike;
    var head = lagMoments[0];
    if (head && head.causeKey === cause.key && t - head.t < LAG_MERGE_MS) {
      head.n += 1;
      head.dt = Math.max(head.dt, dt);
      head.totalDt += dt;
      head.t = t;
      head.crumbs = lastSpike.crumbs;
    } else {
      lagMoments.unshift({
        t: t,
        dt: dt,
        totalDt: dt,
        n: 1,
        causeKey: cause.key,
        causeLabel: cause.label,
        color: cause.color,
        crumbs: lastSpike.crumbs
      });
      if (lagMoments.length > MAX_LAG_MOMENTS) lagMoments.pop();
    }
  }

  function showSpike(mom) {
    if (!mom) return;
    selectedSpike = mom;
    if (typeof console !== 'undefined' && console.info) {
      console.info('[CircaevumPerf] lag moment', mom);
    }
    paint();
  }

  function summarizeLagCauses() {
    var map = Object.create(null);
    for (var i = 0; i < lagMoments.length; i++) {
      var m = lagMoments[i];
      if (!map[m.causeKey]) {
        map[m.causeKey] = {
          key: m.causeKey,
          label: m.causeLabel,
          color: m.color,
          n: 0,
          totalDt: 0,
          worst: 0
        };
      }
      var row = map[m.causeKey];
      row.n += m.n;
      row.totalDt += m.totalDt;
      if (m.dt > row.worst) row.worst = m.dt;
    }
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return b.totalDt - a.totalDt; });
    return rows;
  }

  function frameMsCap() {
    var tEnd = nowMs();
    var tShort = tEnd - SHORT_MS;
    var peak = 48;
    var i;
    for (i = 0; i < frames.length; i++) {
      if (frames[i].t >= tShort && frames[i].dt > peak) peak = frames[i].dt;
    }
    for (i = 0; i < sessionSamples.length; i++) {
      if (sessionSamples[i].dt > peak) peak = sessionSamples[i].dt;
    }
    return Math.min(200, Math.max(48, Math.ceil(peak / 8) * 8 + 8));
  }

  function tick(renderer) {
    var t = nowMs();
    var dt = lastTickT ? t - lastTickT : 16.6;
    lastTickT = t;
    if (dt > 400) dt = 400;

    var info = renderer && renderer.info && renderer.info.render ? renderer.info.render : null;
    var calls = info && typeof info.calls === 'number' ? info.calls : 0;
    var tris = info && typeof info.triangles === 'number' ? info.triangles : 0;
    if (calls > drawCallPeak) drawCallPeak = calls;

    frames.push({ t: t, dt: dt, calls: calls, tris: tris });
    if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES);
    pushSession(t, dt, calls);

    if (dt >= LAG_MS && lagArmed) {
      pushCrumb('lag', dt.toFixed(0) + 'ms frame', { ms: dt });
      recordSpike(dt, t);
      lagArmed = false;
    } else if (dt < 22) {
      lagArmed = true;
    }

    if (!visible) return;
    if (t - lastUiPaint < 80 && dt < 28) return;
    lastUiPaint = t;
    paint();
  }

  function fmtMs(n) {
    if (!isFinite(n)) return '—';
    return n >= 10 ? n.toFixed(0) + 'ms' : n.toFixed(1) + 'ms';
  }

  function fmtNum(n) {
    if (!isFinite(n) || n < 0) return '0';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(Math.round(n));
  }

  function fmtDur(ms) {
    var s = Math.max(0, ms / 1000);
    if (s < 60) return Math.round(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }

  function ago(t) {
    var s = Math.max(0, (nowMs() - t) / 1000);
    return s < 1 ? '<1s' : s < 60 ? s.toFixed(1) + 's' : fmtDur(s * 1000);
  }

  function yMs(ms, padT, plotH, yCap) {
    var u = Math.max(0, Math.min(1, ms / yCap));
    return padT + plotH * (1 - u);
  }

  function yCalls(c, padT, plotH, drawMax) {
    var u = Math.max(0, Math.min(1, c / drawMax));
    return padT + plotH * (1 - u);
  }

  function drawPane(pane, series, yCap, drawMax, dpr) {
    var padT = pane.y0;
    var plotH = pane.y1 - pane.y0;
    ctx.fillStyle = 'rgba(8, 16, 32, 0.35)';
    ctx.fillRect(pane.x0, padT, pane.x1 - pane.x0, plotH);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var y16 = yMs(16.6, padT, plotH, yCap);
    ctx.moveTo(pane.x0, y16);
    ctx.lineTo(pane.x1, y16);
    ctx.stroke();

    function xAt(t) {
      var span = Math.max(1, pane.t1 - pane.t0);
      return pane.x0 + ((t - pane.t0) / span) * (pane.x1 - pane.x0);
    }

    ctx.strokeStyle = '#fbbf24';
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.1 * dpr;
    ctx.beginPath();
    var started = false;
    var i;
    for (i = 0; i < series.length; i++) {
      var f = series[i];
      if (f.t < pane.t0 || f.t > pane.t1) continue;
      var x = xAt(f.t);
      var y = yCalls(f.calls, padT, plotH, drawMax);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#22d3ee';
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    started = false;
    for (i = 0; i < series.length; i++) {
      var fr = series[i];
      if (fr.t < pane.t0 || fr.t > pane.t1) continue;
      var xx = xAt(fr.t);
      var yy = yMs(fr.dt, padT, plotH, yCap);
      if (!started) { ctx.moveTo(xx, yy); started = true; }
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    pane.xAt = xAt;
  }

  function drawLagMarkers(pane, dpr, interactive) {
    var padT = pane.y0;
    var plotH = pane.y1 - pane.y0;
    var hits = [];
    var sel = selectedSpike || lastSpike;
    for (var i = 0; i < lagMoments.length; i++) {
      var m = lagMoments[i];
      if (m.t < pane.t0 || m.t > pane.t1) continue;
      var x = pane.xAt(m.t);
      var picked = sel && Math.abs(sel.t - m.t) < 2;
      ctx.globalAlpha = picked ? 1 : 0.9;
      ctx.fillStyle = m.color || '#f43f5e';
      ctx.beginPath();
      ctx.arc(x, padT + 7 * dpr, (picked ? 4.4 : 3.2) * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = picked ? '#fff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = (picked ? 1.4 : 0.8) * dpr;
      ctx.stroke();
      if (interactive) {
        hits.push({ x: x, y: padT + 7 * dpr, r: 8 * dpr, moment: m });
      }
    }
    ctx.globalAlpha = 1;
    return hits;
  }

  function paintCanvas() {
    if (!ctx || !canvas) return;
    var w = canvas.width;
    var h = canvas.height;
    var dpr = canvas._dpr || 1;
    ctx.clearRect(0, 0, w, h);

    var padL = 30 * dpr;
    var padR = 30 * dpr;
    var padT = 16 * dpr;
    var padB = 16 * dpr;
    var gap = 10 * dpr;
    var plotH = h - padT - padB;
    var innerW = w - padL - padR - gap;
    var leftW = Math.round(innerW * 0.5);
    var rightW = innerW - leftW;
    var tEnd = nowMs();
    var tShort0 = tEnd - SHORT_MS;
    var tSess0 = sessionStart || (sessionSamples.length ? sessionSamples[0].t : tEnd - SHORT_MS);
    if (tEnd - tSess0 < SHORT_MS) tSess0 = tEnd - SHORT_MS;
    var yCap = frameMsCap();
    var drawMax = Math.max(80, drawCallPeak * 0.85);

    var left = { x0: padL, x1: padL + leftW, y0: padT, y1: padT + plotH, t0: tSess0, t1: tEnd };
    var right = { x0: padL + leftW + gap, x1: padL + leftW + gap + rightW, y0: padT, y1: padT + plotH, t0: tShort0, t1: tEnd };

    drawPane(left, sessionSamples, yCap, drawMax, dpr);
    drawPane(right, frames, yCap, drawMax, dpr);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(left.x1, padT, gap, plotH);

    var leftHits = drawLagMarkers(left, dpr, true);
    drawLagMarkers(right, dpr, false);

    for (var c = 0; c < crumbs.length; c++) {
      var crumb = crumbs[c];
      if (crumb.t < right.t0 || crumb.t > right.t1) continue;
      var cx = right.xAt(crumb.t);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = crumb.color;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, right.y0);
      ctx.lineTo(cx, right.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#94a3b8';
    ctx.font = (9 * dpr) + 'px "Space Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('session ' + fmtDur(tEnd - tSess0), left.x0 + 4 * dpr, padT - 3 * dpr);
    ctx.fillText('last 10s', right.x0 + 4 * dpr, padT - 3 * dpr);

    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'right';
    ctx.fillText(String(yCap), padL - 4 * dpr, padT + 8 * dpr);
    ctx.fillText('16', padL - 4 * dpr, yMs(16.6, padT, plotH, yCap) + 3 * dpr);
    ctx.fillText('0', padL - 4 * dpr, padT + plotH);

    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'left';
    ctx.fillText(fmtNum(drawMax), right.x1 + 4 * dpr, padT + 8 * dpr);
    ctx.fillText('0', right.x1 + 4 * dpr, padT + plotH);

    layout = { left: left, right: right, hits: leftHits, dpr: dpr };
  }

  function paneAt(cssX, cssY) {
    if (!layout || !canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var x = (cssX - rect.left) * (canvas.width / Math.max(1, rect.width));
    var y = (cssY - rect.top) * (canvas.height / Math.max(1, rect.height));
    if (x >= layout.left.x0 && x <= layout.left.x1) return { pane: layout.left, x: x, y: y, side: 'left' };
    if (x >= layout.right.x0 && x <= layout.right.x1) return { pane: layout.right, x: x, y: y, side: 'right' };
    return null;
  }

  function nearestLag(hit, maxDist) {
    if (!layout || !layout.hits) return null;
    var best = null;
    var bestD = maxDist != null ? maxDist : 14 * (layout.dpr || 1);
    for (var i = 0; i < layout.hits.length; i++) {
      var h = layout.hits[i];
      var d = Math.abs(h.x - hit.x);
      if (d < bestD) {
        bestD = d;
        best = h.moment;
      }
    }
    return best;
  }

  function nearestLagInPane(pane, x) {
    var best = null;
    var span = pane.x1 - pane.x0;
    var bestD = span * 0.04;
    for (var i = 0; i < lagMoments.length; i++) {
      var m = lagMoments[i];
      if (m.t < pane.t0 || m.t > pane.t1) continue;
      var mx = pane.xAt(m.t);
      var d = Math.abs(mx - x);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  function renderHotList(el, rows, kind) {
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<li class="circa-perf-empty">none in last 30s</li>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var title = kind === 'event' ? r.summary : r.name;
      var sub = kind === 'event' ? (r.layerId || '') : (r.events ? r.events + ' ev' : '');
      html += '<li data-kind="' + kind + '" data-key="' + String(r.key).replace(/"/g, '') + '">' +
        '<span class="circa-perf-hot-n">' + r.count + '×</span>' +
        '<span class="circa-perf-hot-title">' + escapeHtml(title) + '</span>' +
        '<span class="circa-perf-hot-meta">' + escapeHtml(sub) +
        (r.totalMs ? ' · ' + fmtMs(r.totalMs) : '') + '</span></li>';
    }
    el.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function cardSpike() {
    return selectedSpike || lastSpike;
  }

  function paintSpike() {
    if (!spikeEl) return;
    var spike = cardSpike();
    if (!spike) {
      spikeEl.innerHTML = '<span class="circa-perf-spike-wait">Spike card: click a session marker (left). Live 10s stays on the right.</span>';
      return;
    }
    var bits = spike.crumbs && spike.crumbs.length
      ? spike.crumbs.map(function (c) {
          return '<span style="color:' + c.color + '">' +
            escapeHtml(c.label) + (c.ms >= 1 ? ' ' + fmtMs(c.ms) : '') +
            (c.n > 1 ? '×' + c.n : '') + '</span>';
        }).join(' + ')
      : '<span class="circa-perf-spike-wait">no named crumb in that frame (GPU / lerp)</span>';
    spikeEl.innerHTML =
      '<strong>Spike ' + fmtMs(spike.dt) + '</strong>' +
      '<span class="circa-perf-spike-ago">' + ago(spike.t) + ' ago · ' +
      escapeHtml(spike.causeLabel || 'lag') + '</span>' +
      '<div class="circa-perf-spike-why">' + bits + '</div>';
  }

  function paintLagSummary() {
    if (!lagSumEl) return;
    if (!lagMoments.length) {
      lagSumEl.innerHTML = '<p class="circa-perf-empty">No lag moments yet this session.</p>';
      return;
    }
    var n = 0;
    var extra = 0;
    var worst = 0;
    for (var i = 0; i < lagMoments.length; i++) {
      n += lagMoments[i].n;
      extra += Math.max(0, lagMoments[i].totalDt - 16.6 * lagMoments[i].n);
      if (lagMoments[i].dt > worst) worst = lagMoments[i].dt;
    }
    var causes = summarizeLagCauses();
    var html = '<div class="circa-perf-lag-head">' + n + ' lag moments · extra ' +
      fmtMs(extra) + ' · worst ' + fmtMs(worst) + '</div>';
    html += '<ol class="circa-perf-lag-causes">';
    for (var c = 0; c < Math.min(causes.length, 5); c++) {
      var row = causes[c];
      html += '<li><span class="circa-perf-hot-n">' + row.n + '×</span>' +
        '<span class="circa-perf-hot-title" style="color:' + row.color + '">' +
        escapeHtml(row.label) + '</span>' +
        '<span class="circa-perf-hot-meta">sum ' + fmtMs(row.totalDt) +
        ' · worst ' + fmtMs(row.worst) + '</span></li>';
    }
    html += '</ol>';
    lagSumEl.innerHTML = html;
  }

  function paintLog() {
    if (!logEl) return;
    var tEnd = nowMs();
    var recent = crumbs.filter(function (c) { return tEnd - c.t < SHORT_MS; }).slice(-12);
    if (!recent.length) {
      logEl.innerHTML = '<li class="circa-perf-empty">last 10s log empty</li>';
      return;
    }
    var html = '';
    for (var i = recent.length - 1; i >= 0; i--) {
      var c = recent[i];
      html += '<li><span class="circa-perf-log-ago">' + ago(c.t) + '</span>' +
        '<span style="color:' + c.color + '">' + escapeHtml(c.label) + '</span>' +
        '<span class="circa-perf-hot-meta">' +
        (c.ms >= 1 ? fmtMs(c.ms) : '') +
        (c.n > 1 ? ' ×' + c.n : '') + '</span></li>';
    }
    logEl.innerHTML = html;
  }

  function paint() {
    if (!root) return;
    var last = frames.length ? frames[frames.length - 1] : null;
    var dt = last ? last.dt : 0;
    var fps = dt > 0 ? Math.round(1000 / dt) : 0;
    var n = Math.min(frames.length, 30);
    var sum = 0;
    var counted = 0;
    for (var i = frames.length - 1; i >= 0 && counted < n; i--) {
      sum += frames[i].dt;
      counted++;
    }
    var avg = counted ? sum / counted : 0;
    var calls = last ? last.calls : 0;
    var tris = last ? last.tris : 0;

    if (statsEl) {
      statsEl.innerHTML =
        '<span class="circa-perf-ms">' + fmtMs(dt) + '</span>' +
        '<span>' + fps + ' fps</span>' +
        '<span class="circa-perf-avg">avg ' + fmtMs(avg) + '</span>' +
        '<span class="circa-perf-draws">draws ' + fmtNum(calls) + '</span>' +
        '<span>tris ' + fmtNum(tris) + '</span>';
    }

    paintCanvas();
    paintSpike();
    paintLagSummary();
    paintLog();
    renderHotList(hotLayerEl, rankHot(layerHot, 6), 'layer');
    renderHotList(hotEventEl, rankHot(eventHot, 8), 'event');
  }

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'circa-perf-hud';
    root.setAttribute('hidden', '');
    root.innerHTML =
      '<header class="circa-perf-head">' +
        '<strong>Render tax</strong>' +
        '<span class="circa-perf-axes">' +
          '<i class="circa-perf-swatch circa-perf-swatch-ms"></i>frame ms' +
          '<i class="circa-perf-swatch circa-perf-swatch-draw"></i>draw calls' +
        '</span>' +
        '<button type="button" class="circa-perf-close" aria-label="Hide render tax">Shift+P</button>' +
      '</header>' +
      '<div class="circa-perf-stats"></div>' +
      '<div class="circa-perf-spike"></div>' +
      '<div class="circa-perf-split-label"><span>Session (click dots)</span><span>Last 10s</span></div>' +
      '<canvas class="circa-perf-canvas" width="680" height="140"></canvas>' +
      '<section class="circa-perf-lag-sum" aria-label="Lag moment summary"></section>' +
      '<h3 class="circa-perf-log-h">Last 10s crumbs</h3>' +
      '<ol class="circa-perf-log"></ol>' +
      '<div class="circa-perf-cols">' +
        '<section><h3>Hot layers (30s)</h3><ol class="circa-perf-hot circa-perf-hot-layers"></ol></section>' +
        '<section><h3>Hot events (30s remesh)</h3><ol class="circa-perf-hot circa-perf-hot-events"></ol></section>' +
      '</div>' +
      '<div class="circa-perf-hover" hidden></div>';

    document.body.appendChild(root);
    canvas = root.querySelector('.circa-perf-canvas');
    statsEl = root.querySelector('.circa-perf-stats');
    spikeEl = root.querySelector('.circa-perf-spike');
    lagSumEl = root.querySelector('.circa-perf-lag-sum');
    logEl = root.querySelector('.circa-perf-log');
    hotLayerEl = root.querySelector('.circa-perf-hot-layers');
    hotEventEl = root.querySelector('.circa-perf-hot-events');
    hoverEl = root.querySelector('.circa-perf-hover');
    ctx = canvas.getContext('2d');
    sizeCanvas();

    root.querySelector('.circa-perf-close').addEventListener('click', function () {
      setVisible(false);
    });
    root.addEventListener('click', function (e) {
      var li = e.target.closest && e.target.closest('.circa-perf-hot li[data-key]');
      if (!li) return;
      var key = li.getAttribute('data-key');
      var kind = li.getAttribute('data-kind');
      var row = kind === 'event' ? eventHot[key] : layerHot[key];
      if (typeof console !== 'undefined' && console.info) {
        console.info('[CircaevumPerf]', kind, row || key);
      }
    });
    canvas.addEventListener('click', function (e) {
      var hit = paneAt(e.clientX, e.clientY);
      if (!hit) return;
      var mom = hit.side === 'left'
        ? (nearestLag(hit) || nearestLagInPane(hit.pane, hit.x))
        : nearestLagInPane(hit.pane, hit.x);
      if (mom) showSpike(mom);
    });
    canvas.addEventListener('mousemove', onCanvasHover);
    canvas.addEventListener('mouseleave', function () {
      if (hoverEl) hoverEl.hidden = true;
      if (canvas) canvas.style.cursor = 'default';
    });
    window.addEventListener('resize', sizeCanvas);
  }

  function sizeCanvas() {
    if (!canvas) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cssW = canvas.clientWidth || 680;
    var cssH = canvas.clientHeight || 140;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas._dpr = dpr;
  }

  function onCanvasHover(e) {
    if (!hoverEl || !canvas) return;
    var hit = paneAt(e.clientX, e.clientY);
    if (!hit) {
      hoverEl.hidden = true;
      canvas.style.cursor = 'default';
      return;
    }
    var mom = hit.side === 'left'
      ? (nearestLag(hit, 16 * (layout.dpr || 1)) || nearestLagInPane(hit.pane, hit.x))
      : nearestLagInPane(hit.pane, hit.x);
    if (mom) {
      canvas.style.cursor = 'pointer';
      hoverEl.hidden = false;
      hoverEl.style.left = Math.round(e.clientX - root.getBoundingClientRect().left + 8) + 'px';
      hoverEl.style.top = '64px';
      hoverEl.innerHTML = '<b style="color:' + (mom.color || '#f43f5e') + '">' +
        escapeHtml(mom.causeLabel || 'lag') + '</b> · ' + fmtMs(mom.dt) +
        (mom.n > 1 ? ' · ×' + mom.n : '') + ' · ' + ago(mom.t);
      return;
    }
    canvas.style.cursor = 'default';
    if (hit.side === 'right') {
      var t = hit.pane.t0 + ((hit.x - hit.pane.x0) / Math.max(1, hit.pane.x1 - hit.pane.x0)) * (hit.pane.t1 - hit.pane.t0);
      var best = null;
      var bestD = 220;
      for (var i = 0; i < crumbs.length; i++) {
        var d = Math.abs(crumbs[i].t - t);
        if (d < bestD) { bestD = d; best = crumbs[i]; }
      }
      if (best) {
        hoverEl.hidden = false;
        hoverEl.style.left = Math.round(e.clientX - root.getBoundingClientRect().left + 8) + 'px';
        hoverEl.style.top = '64px';
        hoverEl.innerHTML = '<b style="color:' + best.color + '">' + escapeHtml(best.label) + '</b>' +
          (best.ms ? ' · ' + fmtMs(best.ms) : '') + ' · ' + ago(best.t);
        return;
      }
    }
    hoverEl.hidden = true;
  }

  function setVisible(on) {
    ensureDom();
    visible = !!on;
    if (visible) {
      root.removeAttribute('hidden');
      sizeCanvas();
      paint();
    } else {
      root.setAttribute('hidden', '');
    }
    persistVisible(visible);
  }

  function toggle() {
    setVisible(!visible);
  }

  function init() {
    ensureDom();
    if (wantsAutoOpen()) setVisible(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.CircaevumPerf = {
    mark: mark,
    begin: begin,
    measure: measure,
    noteLayerRebuild: noteLayerRebuild,
    noteEventRemesh: noteEventRemesh,
    tick: tick,
    setVisible: setVisible,
    toggle: toggle,
    isVisible: function () { return visible; }
  };
})(typeof window !== 'undefined' ? window : this);
