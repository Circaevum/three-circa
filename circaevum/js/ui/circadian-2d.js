/* Daily SVG view. Time and events come from the same viewer state as the 3D scene. */
(function () {
  'use strict';

  const view = document.getElementById('circadian-2d');
  const selector = document.getElementById('circadian-render-mode');
  const dial = view.querySelector('svg');
  const clock = dial.querySelector('.circadian-face');
  const selection = dial.querySelector('.circadian-selection');
  const dateLabel = view.querySelector('time');
  const status = view.querySelector('.circadian-day-status');
  const arc = CircaevumD3.arc();
  const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', hourCycle: 'h23' });
  const hour = 3600000;
  const heartGapMs = 15 * 60000;
  const sleepStages = new Map([
    ['awake', { label: 'Awake', color: '#f3ab77', depth: 4 }],
    ['rem', { label: 'REM', color: '#eb8bea', depth: 7 }],
    ['light', { label: 'Light sleep', color: '#ba9af6', depth: 10 }],
    ['deep', { label: 'Deep sleep', color: '#7264e8', depth: 14 }]
  ]);
  const turn = 2 * Math.PI;
  const empty = [];
  let prefer3D = true;
  let lastFrame = -Infinity;
  let lastDay, lastClock, lastLayers, lastObserver, lastZoom, bounds;
  let observer;
  let requestedDay = null;
  let requestId = null;
  let accountEvents = empty;
  let accountStatus = '';
  let heartSamples = [], sleepSegments = [];

  function invalidateAccountDay() {
    requestedDay = requestId = null;
    accountEvents = empty;
    lastDay = null;
  }

  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent) return;
    const data = event.data;
    if (data?.type === 'CIRCAEVUM_REFRESH_CALENDAR_LANES' || data?.type === 'CIRCAEVUM_REFRESH_GARMIN_LANES') {
      invalidateAccountDay();
      return;
    }
    if (data?.type !== 'CIRCAEVUM_CIRCADIAN_DAY' || !requestId || data.requestId !== requestId) return;
    requestId = null;
    accountEvents = Array.isArray(data.events) ? data.events : empty;
    accountStatus = data.partial ? 'Some account data could not load' : '';
    lastDay = null;
  });

  function selectedLayers(gl, day) {
    const host = window.circaevumHostLayout;
    if (!host?.circadianAccountData) {
      accountStatus = '';
      return layersFor(gl);
    }
    if (!host.signedIn) {
      if (requestedDay !== null) invalidateAccountDay();
      accountStatus = 'Sign in to see calendar events';
      return empty;
    }
    if (requestedDay !== day.start) {
      requestedDay = day.start;
      requestId = crypto.randomUUID();
      accountEvents = empty;
      accountStatus = 'Loading account events…';
      window.parent.postMessage({
        type: 'CIRCAEVUM_FETCH_CIRCADIAN_DAY', requestId, t0: day.start, t1: day.end
      }, '*');
    }
    return [['user-events', accountEvents, empty, null, null, '', true]];
  }

  let lastObserverCheck = -Infinity;

  function svg(parent, tag, attrs, content) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    if (content != null) element.textContent = content;
    parent.append(element);
    return element;
  }

  function localDay(selected) {
    const start = new Date(selected);
    start.setHours(0, 0, 0, 0);
    const next = new Date(start);
    next.setDate(next.getDate() + 1);
    const noon = new Date(start);
    noon.setHours(12);
    return { start: +start, end: +next, noon: +noon };
  }

  function angle(ms) {
    return turn * (ms - bounds.noon) / (bounds.end - bounds.start);
  }

  function point(ms, radius) {
    const a = angle(ms);
    return [Math.sin(a) * radius, -Math.cos(a) * radius];
  }

  function band(parent, start, end, innerRadius, outerRadius, attrs) {
    const d = arc({ innerRadius, outerRadius, startAngle: angle(start), endAngle: angle(end) });
    return svg(parent, 'path', { d, ...attrs });
  }

  function dateOnly(value) {
    const raw = value?.date || value;
    if (typeof raw !== 'string') return null;
    const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
    if (!match) return null;
    const date = new Date(0);
    date.setFullYear(+match[1], +match[2] - 1, +match[3]);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function layersFor(gl) {
    return gl?.getLayerIds().flatMap(id => {
      const layer = gl.getLayer(id);
      if (layer.visible === false) return [];
      const events = gl.getEvents(id);
      const lines = gl.getEventLines(id);
      const styles = gl._getCategoryStylesForLayer(id, layer);
      return [[id, events.length ? events : empty, lines.length ? lines : empty, layer.filter,
        layer.color, JSON.stringify(styles)]];
    }) || [];
  }

  function sameLayers(layers) {
    return lastLayers?.length === layers.length && layers.every((row, i) =>
      row.length === lastLayers[i].length && row.every((value, j) => value === lastLayers[i][j]));
  }

  function dailyEvents(gl, layers) {
    const result = [];
    for (const [layerId, events, lines, filter, , , fromAccount] of layers) {
      const layer = gl.getLayer(layerId);
      const styles = fromAccount ? {} : gl._getCategoryStylesForLayer(layerId, layer);
      const filtered = filter ? gl._applyFilter(events, filter) : events;
      for (const event of lines.length ? filtered.concat(lines) : filtered) {
        const category = event.category || event.categories?.[0] || 'Default';
        const style = styles[category];
        const metric = event.render?.metric;
        if (style?.visible === false || (event.render?.arc === false && metric !== 'sleepStage' && metric !== 'hr')) continue;
        const dates = gl._getEventDateBounds(event);
        const allDay = dateOnly(event.dtstart);
        const start = allDay || dates.start;
        const end = dateOnly(event.dtend) || dates.end;
        if (!start || !Number.isFinite(+start)) continue;
        const next = new Date(start);
        if (allDay) next.setDate(next.getDate() + 1);
        const stop = end > start ? +end : +next;
        if (+start >= bounds.end || (stop > +start ? stop <= bounds.start : +start < bounds.start)) continue;
        const from = Math.max(bounds.start, +start);
        const to = Math.max(from, Math.min(bounds.end, stop));
        result.push({
          layerId, event, start, end: end > start ? end : allDay ? next : null,
          from, to, allDay, name: event.summary || event.label || 'Event',
          color: event.displayColor || style?.color || event.color || layer?.color
        });
      }
    }
    return result.sort((a, b) => a.from - b.from || b.to - a.to);
  }

  function drawDaylight(observer) {
    if (observer?.lat == null || observer?.lon == null || !window.Astronomy) return;
    const location = new Astronomy.Observer(observer.lat, observer.lon, 0);
    const step = 15 * 60000;
    let runStart = bounds.start;
    let daylight;
    for (let ms = bounds.start; ms < bounds.end; ms += step) {
      const instant = new Date(Math.min(bounds.end - 1, ms + step / 2));
      const sun = Astronomy.Equator(Astronomy.Body.Sun, instant, location, true, true);
      const above = Astronomy.Horizon(instant, location, sun.ra, sun.dec, 'normal').altitude >= 0;
      if (daylight !== undefined && above !== daylight) {
        band(clock, runStart, ms, 149, 162, { class: daylight ? 'circadian-daylight' : 'circadian-night' });
        runStart = ms;
      }
      daylight = above;
    }
    band(clock, runStart, bounds.end, 149, 162, { class: daylight ? 'circadian-daylight' : 'circadian-night' });
  }

  function heartRadius(bpm) {
    // Keep the scale fixed across dates so the same rate has the same radius.
    return 77 + (Math.max(40, Math.min(180, bpm)) - 40) / 140 * 28;
  }

  function drawHealth(items) {
    heartSamples = window.CalendarLaneEvents.heartTrace(items
      .filter(item => item.event.render?.metric === 'hr')
      .map(item => ({ ...item, start: +item.start })), bounds.start, bounds.end);
    sleepSegments = [];
    for (const item of items) {
      if (item.event.render?.metric !== 'sleepStage') continue;
      for (const sample of item.event.render.summary || []) {
        if (!Number.isFinite(sample.tOff) || !Number.isFinite(sample.dur) || sample.dur <= 0) continue;
        const start = +item.start + sample.tOff;
        const from = Math.max(start, item.from);
        const to = Math.min(start + sample.dur, item.to);
        if (to <= from) continue;
        const stage = sleepStages.get(String(sample.stage).toLowerCase()) ||
          { label: 'Unclassified sleep', color: '#8394b4', depth: 7 };
        sleepSegments.push({ from, to, stage });
        const segment = band(clock, from, to, 122 - stage.depth, 122, {
          class: 'circadian-sleep-stage', fill: stage.color
        });
        svg(segment, 'title', {}, stage.label + ' · ' + timeFormat.formatRange(new Date(from), new Date(to)));
      }
    }
    if (!heartSamples.length) return;
    const trace = svg(clock, 'g', { class: 'circadian-heart', role: 'img', 'aria-label': 'Heart rate trace' });
    svg(trace, 'title', {}, 'Heart rate · 40–180 beats per minute scale');
    for (const bpm of [60, 100, 140]) {
      svg(trace, 'circle', { r: heartRadius(bpm), class: 'circadian-heart-guide' });
    }
    let previous = -Infinity;
    let path = '';
    for (const [ms, bpm] of heartSamples) {
      const [x, y] = point(ms, heartRadius(bpm));
      if (ms - previous > heartGapMs) {
        path += 'M' + x + ',' + y;
        svg(trace, 'circle', { cx: x, cy: y, r: 1.15, class: 'circadian-heart-dot' });
      } else {
        path += 'L' + x + ',' + y;
      }
      previous = ms;
    }
    svg(trace, 'path', { d: path, class: 'circadian-heart-line' });
  }

  function drawFace(selected, gl, layers, observer) {
    clock.replaceChildren();
    svg(clock, 'circle', { r: 163, class: 'circadian-dial-bg' });
    drawDaylight(observer);
    for (let ms = bounds.start; ms < bounds.end; ms += hour) {
      const date = new Date(ms);
      const major = date.getHours() % 3 === 0;
      const [x1, y1] = point(ms, major ? 164 : 168);
      const [x2, y2] = point(ms, 174);
      svg(clock, 'line', { x1, y1, x2, y2, class: 'circadian-tick' });
      if (major) {
        const [x, y] = point(ms, 194);
        svg(clock, 'text', { x, y, class: 'circadian-hour' }, hourFormat.format(date));
      }
    }

    const items = dailyEvents(gl, layers);
    drawHealth(items);
    const events = items.filter(item => item.event.render?.metric !== 'hr' &&
      !(item.event.render?.metric === 'sleepStage' && item.event.render.summary?.length));
    const eventWidth = heartSamples.length || sleepSegments.length ? 18 : 64;
    const tracks = [];
    const minSweepMs = (bounds.end - bounds.start) / 240;
    for (const item of events) {
      item.drawTo = Math.min(bounds.end, item.to + Math.max(0, minSweepMs - (item.to - item.from)));
      item.track = tracks.findIndex(end => end <= item.from);
      if (item.track < 0) item.track = tracks.length;
      tracks[item.track] = item.drawTo;
    }
    const trackWidth = Math.min(14, eventWidth / Math.max(1, tracks.length));
    for (const item of events) {
      const outer = 142 - item.track * trackWidth;
      const range = item.allDay ? 'All day' : item.end
        ? timeFormat.formatRange(item.start, item.end) : timeFormat.format(item.start);
      const label = item.name + ' · ' + range;
      const shape = band(clock, item.from, item.drawTo, outer - trackWidth * 0.72, outer, {
        class: 'circadian-event', role: 'button', tabindex: '0', 'aria-label': label
      });
      if (typeof item.color === 'string' && CSS.supports('color', item.color)) shape.style.fill = item.color;
      svg(shape, 'title', {}, label);
      const open = () => {
        if (item.event.uid) gl.setEventHighlight(item.layerId, item.event.uid);
        window.showMobileEventDetailSheet?.({
          vevent: item.event.summary ? item.event : { ...item.event, summary: item.name },
          layerId: item.layerId, start: item.start, end: item.end
        });
      };
      shape.addEventListener('click', event => { event.stopPropagation(); open(); });
      shape.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          open();
        }
      });
    }

    dateLabel.textContent = dayFormat.format(selected);
    dateLabel.dateTime = selected.getFullYear() + '-' + String(selected.getMonth() + 1).padStart(2, '0') +
      '-' + String(selected.getDate()).padStart(2, '0');
    status.textContent = accountStatus;
    status.hidden = !accountStatus;
  }

  function drawSelection(selected) {
    selection.replaceChildren();
    const ms = +selected;
    const [x1, y1] = point(ms, 72);
    const [x2, y2] = point(ms, 162);
    svg(selection, 'line', { x1, y1, x2, y2, class: 'circadian-hand' });
    svg(selection, 'circle', { cx: x2, cy: y2, r: 4, class: 'circadian-hand-tip' });
    svg(selection, 'text', { x: 0, y: 1, class: 'circadian-clock' }, timeFormat.format(selected));
    const nearest = heartSamples.reduce((best, sample) =>
      !best || Math.abs(sample[0] - ms) < Math.abs(best[0] - ms) ? sample : best, null);
    const sleep = sleepSegments.find(segment => segment.from <= ms && ms < segment.to);
    const readouts = [];
    if (nearest && Math.abs(nearest[0] - ms) <= heartGapMs / 2) {
      const [x, y] = point(nearest[0], heartRadius(nearest[1]));
      svg(selection, 'circle', { cx: x, cy: y, r: 3.25, class: 'circadian-heart-dot circadian-heart-selected' });
      readouts.push(Math.round(nearest[1]) + ' bpm');
    }
    if (sleep) readouts.push(sleep.stage.label);
    svg(selection, 'text', { x: 0, y: 25, class: 'circadian-clock-caption' }, readouts.join(' · ') || 'Selected time');
  }

  dial.addEventListener('click', event => {
    if (!bounds) return;
    const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(clock.getScreenCTM().inverse());
    if (Math.hypot(cursor.x, cursor.y) < 72) return;
    const span = bounds.end - bounds.start;
    const offset = bounds.noon - bounds.start + span * Math.atan2(cursor.x, -cursor.y) / turn;
    window.setSelectedDateTime(new Date(bounds.start + ((offset % span) + span) % span));
  });

  for (const button of view.querySelectorAll('[data-day-step]')) {
    button.addEventListener('click', () => {
      const date = window.getSelectedDateTime();
      date.setDate(date.getDate() + Number(button.dataset.dayStep));
      window.setSelectedDateTime(date);
    });
  }

  for (const button of selector.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      prefer3D = button.value === '3D';
      for (const mode of selector.querySelectorAll('button')) {
        mode.setAttribute('aria-pressed', String((mode.value === '3D') === prefer3D));
      }
    });
  }

  window.CircaevumCircadian2D = {
    update(time, zoom, presenting) {
      const daily = zoom === 8 || zoom === 9 || zoom === 0;
      const available = daily && !presenting && !window.CircaevumIntroTour?.isActive() &&
        !document.body.classList.contains('is-tour-editor-open');
      const active = available && !prefer3D;
      selector.hidden = !available;
      if (view.hidden !== !active) {
        view.hidden = !active;
        document.body.classList.toggle('circadian-2d-active', active);
        lastFrame = -Infinity;
      }
      if (!active || time - lastFrame < 180) return active;
      lastFrame = time;

      const selected = window.getSelectedDateTime();
      const day = localDay(selected);
      const gl = window.circaevumGL;
      const layers = gl ? selectedLayers(gl, day) : empty;
      const faceChanged = lastDay !== day.start || lastZoom !== zoom || !sameLayers(layers);
      if (faceChanged || time - lastObserverCheck >= 30000) {
        observer = window.EarthGlobe?.getObserver(selected, zoom);
        lastObserverCheck = time;
      }
      const observerKey = observer && [observer.lat, observer.lon, observer.source].join('/');
      if (faceChanged || lastObserver !== observerKey) {
        bounds = day;
        drawFace(selected, gl, layers, observer);
        lastDay = day.start;
        lastLayers = layers;
        lastObserver = observerKey;
        lastZoom = zoom;
        lastClock = null;
      }
      const minute = Math.floor(+selected / 60000);
      if (minute !== lastClock) {
        drawSelection(selected);
        lastClock = minute;
      }
      return active;
    }
  };
})();
