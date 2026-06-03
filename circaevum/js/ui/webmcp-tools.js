/**
 * WebMCP — expose GL actions to browser AI agents (Chrome modelContext preview).
 * https://developer.chrome.com/docs/ai/webmcp/imperative-api
 */
(function () {
  if (typeof navigator === 'undefined' || !('modelContext' in navigator)) return;
  var mc = navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  var controller = new AbortController();
  var regOpts = { signal: controller.signal };
  window.addEventListener('pagehide', function () {
    try {
      controller.abort();
    } catch (e) {}
  });

  function getGl() {
    return window.circaevumGL || (window.getGL && window.getGL());
  }

  function register(def) {
    try {
      mc.registerTool(def, regOpts);
    } catch (e) {
      try {
        console.warn('[Circaevum WebMCP] registerTool failed:', def.name, e);
      } catch (e2) {}
    }
  }

  register({
    name: 'circaevum_navigate_to_time',
    description: 'Move the 3D timeline focus to an ISO 8601 datetime. Optional zoom level 0 (year) through 9 (finest).',
    inputSchema: {
      type: 'object',
      properties: {
        iso8601: { type: 'string', description: 'Target time, e.g. 2026-05-30T12:00:00Z' },
        zoom: { type: 'integer', minimum: 0, maximum: 9, description: 'Optional zoom level' }
      },
      required: ['iso8601']
    },
    annotations: { readOnlyHint: true },
    execute: function (args) {
      var gl = getGl();
      if (!gl || typeof gl.navigateToTime !== 'function') return 'Graphics Library not ready yet.';
      gl.navigateToTime(args.iso8601);
      if (typeof args.zoom === 'number' && typeof gl.setZoomLevel === 'function') {
        gl.setZoomLevel(args.zoom);
      }
      return 'Navigated to ' + args.iso8601 + (typeof args.zoom === 'number' ? ' at zoom ' + args.zoom : '') + '.';
    }
  });

  register({
    name: 'circaevum_set_zoom',
    description: 'Set the Circaevum timeline zoom level (0 = year scale, 9 = finest).',
    inputSchema: {
      type: 'object',
      properties: {
        zoom: { type: 'integer', minimum: 0, maximum: 9 }
      },
      required: ['zoom']
    },
    annotations: { readOnlyHint: true },
    execute: function (args) {
      var gl = getGl();
      if (!gl || typeof gl.setZoomLevel !== 'function') return 'Graphics Library not ready yet.';
      gl.setZoomLevel(args.zoom);
      return 'Zoom level set to ' + args.zoom + '.';
    }
  });

  register({
    name: 'circaevum_open_event_list',
    description: 'Open the calendar events list panel in the Circaevum viewer.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      if (typeof window.openEventListPanel === 'function') {
        window.openEventListPanel();
        return 'Event list panel opened.';
      }
      return 'Event list panel is not available.';
    }
  });

  register({
    name: 'circaevum_get_viewer_state',
    description: 'Return current zoom level and selected time from the Circaevum viewer.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      var gl = getGl();
      var zoom = gl && typeof gl.getZoomLevel === 'function' ? gl.getZoomLevel() : null;
      var time = null;
      if (typeof getSelectedDateTime === 'function') {
        var sel = getSelectedDateTime();
        if (sel instanceof Date && !isNaN(sel.getTime())) time = sel.toISOString();
      }
      return JSON.stringify({ zoom: zoom, selectedTime: time, ready: !!gl });
    }
  });

  register({
    name: 'circaevum_ingest_events',
    description: 'Ingest VEVENT-like calendar objects into a named layer on the timeline (demo / embed path).',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'Layer id, e.g. agent-demo' },
        events: {
          type: 'array',
          description: 'Array of event objects with summary, dtstart, dtend, category',
          items: { type: 'object' }
        }
      },
      required: ['layerId', 'events']
    },
    execute: function (args) {
      var gl = getGl();
      if (!gl || typeof gl.ingestEvents !== 'function') return 'Graphics Library not ready yet.';
      if (!Array.isArray(args.events)) return 'events must be an array.';
      gl.ingestEvents(args.layerId, args.events, {});
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
      return 'Ingested ' + args.events.length + ' event(s) into layer "' + args.layerId + '".';
    }
  });
})();
