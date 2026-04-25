(function() {
  var container = document.getElementById('canvas-container');
  window.circaevumGL = null;

  function getGL() {
    if (!window.CircaevumGL) { console.error('CircaevumGL not loaded.'); return null; }
    if (!window.circaevumGL) {
      window.circaevumGL = new window.CircaevumGL(container, {
        zoomLevel: 2,
        showMoonWorldline: false
      });
    }
    return window.circaevumGL;
  }
  window.getGL = getGL;

  window.sendEvent = function(event, layerId, options) {
    var gl = getGL(); if (!gl) return;
    layerId = layerId || 'api';
    options = options || {};
    gl.addEvent(layerId, event);
    var layer = gl.getLayer(layerId);
    if (layer && options.sessionId) layer.sessionId = options.sessionId;
  };

  /** Add event lines (line segments on the helix). */
  window.sendEventLines = function(lines, layerId) {
    var gl = getGL(); if (!gl) return;
    layerId = layerId || 'lines';
    gl.addEventLines(layerId, Array.isArray(lines) ? lines : [lines]);
  };
})();
