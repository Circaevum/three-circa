(function() {
  var UI = window.CircaevumUI || {};
  var getUserEventsLayerId = typeof UI.getUserEventsLayerId === 'function' ? UI.getUserEventsLayerId : function() { return 'user-events'; };
  var buildFullAppUrlShared = typeof UI.buildFullAppUrl === 'function' ? UI.buildFullAppUrl : function() { return window.CIRCAEVUM_FULL_APP_URL || ''; };

  document.addEventListener('DOMContentLoaded', function() {
    var panel = document.getElementById('event-list-panel');
    var leftPanel = document.getElementById('calendars-left-panel');
    var keyboardPanel = document.getElementById('keyboard-controls-panel');
    var testBtn = document.getElementById('test-event-lines-btn');
    var navDropdown = document.getElementById('nav-dropdown');
    var navAccountBtn = document.getElementById('nav-account-btn');
    var landingPage = document.getElementById('landing-page');

    if (typeof window.circaevumSelectedLayerId === 'undefined') window.circaevumSelectedLayerId = getUserEventsLayerId();

    if (testBtn) {
      testBtn.onclick = function() {
        if (typeof window.sendEventLines === 'function') {
          window.sendEventLines([
            { start: new Date('2025-01-01'), end: new Date('2025-01-31'), label: 'The January Run' },
            { start: new Date('2025-06-01'), end: new Date('2025-06-15'), label: 'Midsummer Span' }
          ], 'test-lines');
        }
        testBtn.textContent = 'Added!';
        setTimeout(function() { testBtn.textContent = 'Test event lines'; }, 4000);
      };
    }

    function runLoadEdgeEsmeraldaWeek(week) {
      if (typeof window.getGL === 'function') window.getGL();
      var w = Number(week);
      var loaders = {
        1: window.loadEdgeEsmeraldaWeek1Samples,
        2: window.loadEdgeEsmeraldaWeek2Samples,
        3: window.loadEdgeEsmeraldaWeek3Samples,
        4: window.loadEdgeEsmeraldaWeek4Samples
      };
      var loadFn = loaders[w] || (typeof window.loadEdgeEsmeraldaWeek === 'function'
        ? function (opts) { return window.loadEdgeEsmeraldaWeek(w, opts); }
        : null);
      if (!loadFn) {
        console.warn('edge-esmeralda-2026.js not loaded');
        return 0;
      }
      var n = loadFn({});
      if (typeof window.openEventListPanel === 'function') window.openEventListPanel();
      return n;
    }
    function wireEdgeEsmeraldaWeekButton(btn) {
      if (!btn) return;
      var week = parseInt(btn.getAttribute('data-ee-week'), 10);
      var label = btn.textContent || ('W' + week);
      btn.onclick = function() {
        var n = runLoadEdgeEsmeraldaWeek(week);
        btn.textContent = n ? ('+' + n) : '…';
        setTimeout(function() { btn.textContent = label; }, 3500);
      };
    }
    wireEdgeEsmeraldaWeekButton(document.getElementById('edge-esmeralda-w1-btn'));
    wireEdgeEsmeraldaWeekButton(document.getElementById('edge-esmeralda-w2-btn'));
    wireEdgeEsmeraldaWeekButton(document.getElementById('edge-esmeralda-w3-btn'));
    wireEdgeEsmeraldaWeekButton(document.getElementById('edge-esmeralda-w4-btn'));

    function openCalendarsLeftPanel() {
      if (window.self !== window.top && window.parent && typeof window.parent.postMessage === 'function') {
        try { window.parent.postMessage({ type: 'CIRCAEVUM_OPEN_ACCOUNT' }, '*'); } catch (err) {}
        return;
      }
      if (!leftPanel) return;
      leftPanel.classList.add('open');
      leftPanel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('calendars-left-panel-open');
      if (typeof window.refreshCalendarLayersList === 'function') window.refreshCalendarLayersList();
    }

    function closeCalendarsLeftPanel() {
      if (window.self !== window.top) return;
      if (!leftPanel) return;
      leftPanel.classList.remove('open');
      leftPanel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('calendars-left-panel-open');
    }

    function openEventListPanel() {
      if (!panel) return;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('event-list-panel-open');
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
    }

    function closeEventListPanel() {
      if (!panel) return;
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('event-list-panel-open');
    }

    function openKeyboardControlsPanel() {
      if (!keyboardPanel) return;
      closeEventListPanel();
      closeCalendarsLeftPanel();
      document.body.classList.add('keyboard-panel-open');
      keyboardPanel.classList.add('open');
      keyboardPanel.setAttribute('aria-hidden', 'false');
    }

    function closeKeyboardControlsPanel() {
      if (!keyboardPanel) return;
      document.body.classList.remove('keyboard-panel-open');
      keyboardPanel.classList.remove('open');
      keyboardPanel.setAttribute('aria-hidden', 'true');
    }

    function toggleAboutPanel() {
      if (!landingPage) return;
      var shouldOpen = !landingPage.classList.contains('active');
      landingPage.classList.toggle('active', shouldOpen);
    }
    window.toggleAboutPanel = toggleAboutPanel;
    window.openEventListPanel = openEventListPanel;
    window.openCalendarLayersPanel = openCalendarsLeftPanel;

    var closeBtn = document.getElementById('event-list-close');
    if (closeBtn && panel) closeBtn.onclick = closeEventListPanel;
    var calendarsLeftClose = document.getElementById('calendars-left-close');
    if (calendarsLeftClose && leftPanel) calendarsLeftClose.onclick = closeCalendarsLeftPanel;
    var keyboardCloseBtn = document.getElementById('keyboard-controls-close');
    if (keyboardCloseBtn && keyboardPanel) keyboardCloseBtn.onclick = closeKeyboardControlsPanel;

    var calendarLayersPullTab = document.getElementById('calendar-layers-pull-tab');
    if (calendarLayersPullTab) calendarLayersPullTab.onclick = function() {
      if (window.self !== window.top) return openCalendarsLeftPanel();
      if (leftPanel && leftPanel.classList.contains('open')) closeCalendarsLeftPanel(); else openCalendarsLeftPanel();
    };

    var pullTab = document.getElementById('event-list-pull-tab');
    if (pullTab && panel) pullTab.onclick = function() {
      if (panel.classList.contains('open')) closeEventListPanel(); else openEventListPanel();
    };

    var fullAppUrl = window.CIRCAEVUM_FULL_APP_URL;
    var isEmbeddedViewer = !!window.CIRCAEVUM_VIEWER_MODE;
    var footerEl = document.getElementById('event-list-panel-footer');
    var fullAppLink = document.getElementById('open-full-app-link');
    function buildFullAppUrl(withOpenLogin) {
      return buildFullAppUrlShared(!!withOpenLogin);
    }
    if (fullAppUrl && footerEl && fullAppLink && !isEmbeddedViewer) {
      footerEl.style.display = 'block';
      function updateFullAppLink() { fullAppLink.href = buildFullAppUrl(false); }
      updateFullAppLink();
      fullAppLink.addEventListener('click', function(e) {
        e.preventDefault();
        updateFullAppLink();
        window.location.href = fullAppLink.href;
      });
      var refreshBtn = document.getElementById('events-panel-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', updateFullAppLink);
    } else if (footerEl) {
      footerEl.style.display = 'none';
    }

    var calendarsLeftLogin = document.getElementById('calendars-left-login-btn');
    if (calendarsLeftLogin) {
      if (fullAppUrl) calendarsLeftLogin.onclick = function() { window.location.href = buildFullAppUrl(true); };
      else calendarsLeftLogin.style.display = 'none';
    }

    if (navAccountBtn && navDropdown) {
      navAccountBtn.onclick = function(e) {
        e.stopPropagation();
        var open = navDropdown.classList.toggle('open');
        navDropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
        navAccountBtn.setAttribute('aria-expanded', open);
      };
      navDropdown.addEventListener('click', function(e) { e.stopPropagation(); });
      navDropdown.querySelectorAll('.nav-dropdown-item').forEach(function(item) {
        var action = item.getAttribute('data-action');
        if (action === 'login' && !fullAppUrl) item.style.display = 'none';
        item.onclick = function() {
          navDropdown.classList.remove('open');
          navDropdown.setAttribute('aria-hidden', 'true');
          navAccountBtn.setAttribute('aria-expanded', 'false');
          if (action === 'calendar-layers') openCalendarsLeftPanel();
          if (action === 'event-list') openEventListPanel();
          if (action === 'login' && fullAppUrl) window.location.href = buildFullAppUrl(true);
          if (action === 'keyboard-controls') openKeyboardControlsPanel();
          if (action === 'about') toggleAboutPanel();
          if (action === 'replay-intro') {
            if (window.CircaevumIntro && typeof window.CircaevumIntro.clearStoredIntro === 'function') {
              window.CircaevumIntro.clearStoredIntro();
            }
            if (typeof window.showCircaevumIntroPrompt === 'function') {
              window.showCircaevumIntroPrompt({ force: true });
            }
          }
          if (action === 'edge-esmeralda-w1') runLoadEdgeEsmeraldaWeek(1);
          if (action === 'edge-esmeralda-w2') runLoadEdgeEsmeraldaWeek(2);
          if (action === 'edge-esmeralda-w3') runLoadEdgeEsmeraldaWeek(3);
          if (action === 'edge-esmeralda-w4') runLoadEdgeEsmeraldaWeek(4);
        };
      });
      document.addEventListener('click', function() {
        navDropdown.classList.remove('open');
        navDropdown.setAttribute('aria-hidden', 'true');
        navAccountBtn.setAttribute('aria-expanded', 'false');
      });
    }

    var sceneIconOverlay = document.querySelector('.scene-icon-overlay');
    var sceneIconToggle = document.getElementById('scene-icon-toggle');
    if (sceneIconOverlay && sceneIconToggle) {
      sceneIconToggle.onclick = function(e) {
        e.stopPropagation();
        sceneIconOverlay.classList.toggle('collapsed');
      };
    }

    var ORBITAL_DATA_STORAGE_KEY = 'circaevum-orbital-data-mode';
    var orbitalPanel = document.getElementById('orbital-data-panel');
    var orbitalHide = document.getElementById('orbital-data-hide');
    var orbitalRestore = document.getElementById('orbital-data-restore');

    function notifyOrbitalDataVisibility() {
      var visible = !!(orbitalPanel && !orbitalPanel.classList.contains('is-hidden'));
      if (typeof window.onOrbitalDataVisibilityChange === 'function') {
        try {
          window.onOrbitalDataVisibilityChange(visible);
        } catch (notifyErr) { /* ignore */ }
      }
    }

    function applyOrbitalDataMode(mode) {
      if (!orbitalPanel) return;
      var m = mode === 'hidden' ? 'hidden' : 'expanded';
      orbitalPanel.classList.remove('is-collapsed');
      orbitalPanel.classList.toggle('is-hidden', m === 'hidden');
      if (orbitalRestore) orbitalRestore.hidden = m !== 'hidden';
      try {
        localStorage.setItem(ORBITAL_DATA_STORAGE_KEY, m);
      } catch (storageErr) { /* ignore */ }
      notifyOrbitalDataVisibility();
    }

    function readOrbitalDataMode() {
      try {
        var stored = localStorage.getItem(ORBITAL_DATA_STORAGE_KEY);
        if (stored === 'hidden') return 'hidden';
        if (stored === 'collapsed') return 'expanded';
        if (stored === 'expanded') return 'expanded';
      } catch (readErr) { /* ignore */ }
      return 'expanded';
    }

    window.isOrbitalDataPanelVisible = function() {
      return !!(orbitalPanel && !orbitalPanel.classList.contains('is-hidden'));
    };

    if (orbitalPanel) {
      applyOrbitalDataMode(readOrbitalDataMode());
      if (orbitalHide) {
        orbitalHide.addEventListener('click', function(e) {
          e.stopPropagation();
          applyOrbitalDataMode('hidden');
        });
      }
      if (orbitalRestore) {
        orbitalRestore.addEventListener('click', function(e) {
          e.stopPropagation();
          applyOrbitalDataMode('expanded');
        });
      }
    }

    var ephemerisToggle = document.getElementById('ephemeris-toggle');
    var ephemerisStatusBadge = document.getElementById('ephemeris-status-badge');
    function updateEphemerisToggleUi() {
      if (!ephemerisToggle) return;
      var status = (typeof window.getEphemerisStatus === 'function') ? window.getEphemerisStatus() : null;
      var on = status ? !!status.enabled : (typeof window.getEphemerisEnabled === 'function' ? !!window.getEphemerisEnabled() : false);
      var provider = status && status.activeProvider ? status.activeProvider : 'circular';
      var aeAvail = status && typeof status.astronomyEngineAvailable === 'boolean' ? status.astronomyEngineAvailable : false;
      ephemerisToggle.classList.toggle('active', on);
      ephemerisToggle.setAttribute('aria-label', on ? 'Disable ephemeris planetary alignment' : 'Enable ephemeris planetary alignment');
      ephemerisToggle.title = on
        ? ('Ephemeris alignment: on (' + provider + ')')
        : ('Ephemeris alignment: off' + (aeAvail ? ' (astronomy provider available)' : ' (circular fallback)'));

      if (ephemerisStatusBadge) {
        var label;
        if (!on) label = 'E OFF';
        else if (provider === 'astronomy-engine') label = 'E AE';
        else if (provider === 'kepler') label = 'E KP';
        else label = 'E FB';
        ephemerisStatusBadge.textContent = label;
        ephemerisStatusBadge.title = on
          ? ('Ephemeris ON via ' + provider)
          : ('Ephemeris OFF' + (aeAvail ? ' (AE available)' : ' (fallback only)'));
        ephemerisStatusBadge.classList.toggle('is-on', on);
        ephemerisStatusBadge.classList.toggle('is-fallback', on && provider !== 'astronomy-engine');
      }
    }

    if (ephemerisToggle) {
      updateEphemerisToggleUi();
      ephemerisToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof window.toggleEphemerisEnabled === 'function') {
          window.toggleEphemerisEnabled();
          updateEphemerisToggleUi();
          // Rebuild scene geometry at current zoom so worldlines pick the new mode.
          if (typeof window.setZoomLevel === 'function' && typeof window.getCurrentZoomLevel === 'function') {
            window.setZoomLevel(window.getCurrentZoomLevel());
          }
          if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
        }
      });
    }
  });
})();
