(function() {
  var USER_EVENTS_LAYER = 'user-events';
  var MAX_EVENTS_IN_STATE = 200;

  function getShareState() {
    var gl = window.getGL && window.getGL();
    if (!gl) return { z: 2, rx: 0, ry: 0, focus: new Date().toISOString(), events: [] };
    var events = (gl.getEventObjects && gl.getEventObjects(USER_EVENTS_LAYER)) || [];
    var serialized = events.slice(0, MAX_EVENTS_IN_STATE).map(function(o) {
      return {
        uid: o.uid,
        summary: o.summary,
        start: o.start && o.start.toISOString ? o.start.toISOString() : null,
        end: o.end && o.end.toISOString ? o.end.toISOString() : null
      };
    });
    return {
      z: typeof currentZoom !== 'undefined' ? currentZoom : 2,
      rx: typeof cameraRotation !== 'undefined' ? cameraRotation.x : Math.PI / 6,
      ry: typeof cameraRotation !== 'undefined' ? cameraRotation.y : 0,
      focus: typeof getSelectedDateTime === 'function' ? getSelectedDateTime().toISOString() : new Date().toISOString(),
      events: serialized
    };
  }

  function applyShareState(state) {
    if (!state || typeof state !== 'object') return;
    var gl = window.getGL && window.getGL();
    if (!gl) return;
    var z = state.z;
    if (typeof z === 'number' && z >= 1 && z <= 9) {
      if (typeof gl.setZoomLevel === 'function') gl.setZoomLevel(z);
      else if (typeof setZoomLevel === 'function') setZoomLevel(z);
    }
    if (typeof cameraRotation !== 'undefined') {
      if (typeof state.rx === 'number') cameraRotation.x = state.rx;
      if (typeof state.ry === 'number') cameraRotation.y = state.ry;
    }
    if (state.focus && typeof gl.navigateToTime === 'function') {
      gl.navigateToTime(state.focus);
    }
    if (Array.isArray(state.events) && state.events.length > 0 && gl.ingestEvents) {
      var restored = state.events.map(function(e) {
        return {
          uid: e.uid,
          summary: e.summary,
          start: e.start ? new Date(e.start) : null,
          end: e.end ? new Date(e.end) : null
        };
      });
      gl.ingestEvents(USER_EVENTS_LAYER, restored, {});
    }
  }

  function stateToQueryString(state) {
    var params = new URLSearchParams();
    params.set('zoom', String(state.z));
    params.set('rx', String(state.rx));
    params.set('ry', String(state.ry));
    params.set('focus', state.focus);
    if (state.events && state.events.length > 0) {
      try {
        params.set('e', btoa(unescape(encodeURIComponent(JSON.stringify(state.events)))));
      } catch (err) {}
    }
    return params.toString();
  }

  function queryStringToState() {
    var params = new URLSearchParams(window.location.search);
    var z = parseInt(params.get('zoom'), 10);
    var rx = parseFloat(params.get('rx'));
    var ry = parseFloat(params.get('ry'));
    var focus = params.get('focus');
    var e = params.get('e');
    var events = [];
    if (e) {
      try {
        events = JSON.parse(decodeURIComponent(escape(atob(e))));
      } catch (err) {}
    }
    if (!(z >= 1 && z <= 9)) z = 2;
    if (typeof rx !== 'number' || isNaN(rx)) rx = Math.PI / 6;
    if (typeof ry !== 'number' || isNaN(ry)) ry = 0;
    if (!focus) focus = new Date().toISOString();
    return { z: z, rx: rx, ry: ry, focus: focus, events: events };
  }

  function hasStateInUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.has('zoom') || params.has('focus') || params.has('e');
  }

  window.getShareState = getShareState;
  window.applyShareState = applyShareState;
  window.stateToQueryString = stateToQueryString;

  document.addEventListener('DOMContentLoaded', function() {
    if (!hasStateInUrl()) return;
    var state = queryStringToState();
    setTimeout(function() {
      var gl = window.getGL && window.getGL();
      if (gl) applyShareState(state);
    }, 800);
  });
})();
