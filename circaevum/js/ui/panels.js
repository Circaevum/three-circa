(function() {
  var UI = window.CircaevumUI || {};
  var getUserEventsLayerId = typeof UI.getUserEventsLayerId === 'function' ? UI.getUserEventsLayerId : function() { return 'user-events'; };
  var buildFullAppUrlShared = typeof UI.buildFullAppUrl === 'function' ? UI.buildFullAppUrl : function() { return window.CIRCAEVUM_FULL_APP_URL || ''; };

  document.addEventListener('DOMContentLoaded', function() {
    var panel = document.getElementById('event-list-panel');
    var leftPanel = document.getElementById('calendars-left-panel');
    var keyboardPanel = document.getElementById('keyboard-controls-panel');
    var navDropdown = document.getElementById('nav-dropdown');
    var navAccountBtn = document.getElementById('nav-account-btn');
    var landingPage = document.getElementById('landing-page');

    if (typeof window.circaevumSelectedLayerId === 'undefined') window.circaevumSelectedLayerId = getUserEventsLayerId();

    var eeAllBtn = document.getElementById('edge-esmeralda-all-btn');
    if (eeAllBtn) {
      eeAllBtn.onclick = function() {
        if (typeof window.getGL === 'function') window.getGL();
        var total = 0;
        var loaders = [
          window.loadEdgeEsmeraldaWeek1Samples,
          window.loadEdgeEsmeraldaWeek2Samples,
          window.loadEdgeEsmeraldaWeek3Samples,
          window.loadEdgeEsmeraldaWeek4Samples
        ];
        var fallback = typeof window.loadEdgeEsmeraldaWeek === 'function';
        for (var w = 1; w <= 4; w++) {
          var fn = loaders[w - 1] || (fallback ? (function(wk) { return function(opts) { return window.loadEdgeEsmeraldaWeek(wk, opts); }; })(w) : null);
          if (fn) total += (fn({}) || 0);
        }
        if (!total) { console.warn('edge-esmeralda-2026.js not loaded'); }
        eeAllBtn.textContent = total ? ('+' + total) : '…';
        if (typeof window.openEventListPanel === 'function') window.openEventListPanel();
        setTimeout(function() { eeAllBtn.textContent = 'Load all'; }, 3500);
      };
    }

    function syncPullTabExpanded(tabId, open) {
      var tab = document.getElementById(tabId);
      if (!tab) return;
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (tabId === 'calendar-layers-pull-tab') {
        tab.setAttribute('aria-label', open ? 'Close Calendar Layers' : 'Open Calendar Layers');
      } else if (tabId === 'event-list-pull-tab') {
        tab.setAttribute('aria-label', open ? 'Close Event List' : 'Open Event List');
      }
    }

    function openCalendarsLeftPanel() {
      if (window.self !== window.top && window.parent && typeof window.parent.postMessage === 'function') {
        try { window.parent.postMessage({ type: 'CIRCAEVUM_OPEN_ACCOUNT' }, '*'); } catch (err) {}
        return;
      }
      if (!leftPanel) return;
      leftPanel.classList.add('open');
      leftPanel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('calendars-left-panel-open');
      syncPullTabExpanded('calendar-layers-pull-tab', true);
      if (typeof window.refreshCalendarLayersList === 'function') window.refreshCalendarLayersList();
    }

    function closeCalendarsLeftPanel() {
      if (window.self !== window.top) return;
      if (!leftPanel) return;
      leftPanel.classList.remove('open');
      leftPanel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('calendars-left-panel-open');
      syncPullTabExpanded('calendar-layers-pull-tab', false);
    }

    function openEventListPanel() {
      if (!panel) return;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('event-list-panel-open');
      syncPullTabExpanded('event-list-pull-tab', true);
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
      var searchInput = document.getElementById('event-list-search');
      if (searchInput) {
        setTimeout(function() { searchInput.focus(); }, 0);
      }
    }

    function closeEventListPanel() {
      if (!panel) return;
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('event-list-panel-open');
      syncPullTabExpanded('event-list-pull-tab', false);
    }

    function openKeyboardControlsPanel() {
      if (!keyboardPanel) return;
      closeEventListPanel();
      closeCalendarsLeftPanel();
      document.body.classList.add('keyboard-panel-open');
      keyboardPanel.classList.add('open');
      keyboardPanel.setAttribute('aria-hidden', 'false');
      var keysBtn = document.getElementById('nav-keys-btn');
      if (keysBtn) {
        keysBtn.setAttribute('aria-expanded', 'true');
        keysBtn.classList.add('active');
      }
    }

    function closeKeyboardControlsPanel() {
      if (!keyboardPanel) return;
      document.body.classList.remove('keyboard-panel-open');
      keyboardPanel.classList.remove('open');
      keyboardPanel.setAttribute('aria-hidden', 'true');
      var keysBtn = document.getElementById('nav-keys-btn');
      if (keysBtn) {
        keysBtn.setAttribute('aria-expanded', 'false');
        keysBtn.classList.remove('active');
      }
    }

    function toggleKeyboardControlsPanel() {
      if (!keyboardPanel) return;
      if (keyboardPanel.classList.contains('open')) closeKeyboardControlsPanel();
      else openKeyboardControlsPanel();
    }

    function toggleAboutPanel() {
      if (!landingPage) return;
      var shouldOpen = !landingPage.classList.contains('active');
      landingPage.classList.toggle('active', shouldOpen);
    }
    window.toggleAboutPanel = toggleAboutPanel;
    window.openEventListPanel = openEventListPanel;
    window.openCalendarLayersPanel = openCalendarsLeftPanel;
    window.openKeyboardControlsPanel = openKeyboardControlsPanel;
    window.toggleKeyboardControlsPanel = toggleKeyboardControlsPanel;
    window.closeKeyboardControlsPanel = closeKeyboardControlsPanel;

    var navKeysBtn = document.getElementById('nav-keys-btn');
    if (navKeysBtn) navKeysBtn.onclick = function(e) {
      e.stopPropagation();
      toggleKeyboardControlsPanel();
    };

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
          if (action === 'about') toggleAboutPanel();
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
    function syncSceneIconToggleUi() {
      if (!sceneIconOverlay || !sceneIconToggle) return;
      var collapsed = sceneIconOverlay.classList.contains('collapsed');
      sceneIconToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      sceneIconToggle.title = collapsed ? 'Expand scene controls' : 'Collapse scene controls';
      sceneIconToggle.setAttribute('aria-label', collapsed ? 'Expand scene controls' : 'Collapse scene controls');
    }
    if (sceneIconOverlay && sceneIconToggle) {
      if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
        sceneIconOverlay.classList.add('collapsed');
      }
      syncSceneIconToggleUi();
      sceneIconToggle.onclick = function(e) {
        e.stopPropagation();
        sceneIconOverlay.classList.toggle('collapsed');
        syncSceneIconToggleUi();
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

  });
})();
