(function() {
  var params = new URLSearchParams(window.location.search);
  var inIframe = window.self !== window.top;
  var forceViewer = params.get('viewer') === '1';
  var forceFull = params.get('viewer') === '0';
  var isLocalhost = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  // Viewer mode (no navbar) only when ?viewer=1 or in iframe. On direct load (e.g. localhost or circaevum.com) show navbar so user can click Log in.
  var useViewerMode = forceViewer || (inIframe && !forceFull);
  if (useViewerMode) {
    document.documentElement.classList.add('viewer-no-nav');
    document.body.classList.add('viewer-no-nav');
    window.CIRCAEVUM_VIEWER_MODE = true;
    // Yin-portal (and similar wrappers) provide their own Layers rail; hide GL duplicate that was wired to Account.
    if (inIframe) {
      document.documentElement.classList.add('circaevum-embed-hide-layers-pull');
    }
  }
  // Optional: set to your wrapper URL for "Open full app" (same-tab navigate with state).
  // On localhost, default to Yin-portal (wrapper) so the link works without config.
  if (isLocalhost && !window.CIRCAEVUM_FULL_APP_URL) {
    window.CIRCAEVUM_FULL_APP_URL = 'http://localhost:5173';
  }
  // On production (circaevum.com), "Log in" and "Open full app" point to the app.
  if (typeof location !== 'undefined' && location.hostname === 'circaevum.com' && !window.CIRCAEVUM_FULL_APP_URL) {
    window.CIRCAEVUM_FULL_APP_URL = 'https://app.circaevum.com';
  }
})();
