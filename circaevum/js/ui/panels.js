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

    function postGlChrome() {
      if (window.parent === window || !window.parent || typeof window.parent.postMessage !== 'function') return;
      var left = 0;
      var right = 0;
      if (document.body.classList.contains('calendars-left-panel-open')) {
        var lp = document.getElementById('calendars-left-panel');
        if (lp) left = Math.round(lp.getBoundingClientRect().width);
      }
      var rightEl = null;
      if (document.body.classList.contains('event-list-panel-open')) {
        rightEl = document.getElementById('event-list-panel');
      } else if (document.body.classList.contains('keyboard-panel-open')) {
        rightEl = document.getElementById('keyboard-controls-panel');
      }
      if (rightEl) right = Math.round(rightEl.getBoundingClientRect().width);
      try {
        window.parent.postMessage({ type: 'CIRCAEVUM_GL_CHROME', left: left, right: right }, '*');
      } catch (err) {}
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
      postGlChrome();
    }

    function closeCalendarsLeftPanel() {
      if (window.self !== window.top) return;
      if (!leftPanel) return;
      leftPanel.classList.remove('open');
      leftPanel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('calendars-left-panel-open');
      syncPullTabExpanded('calendar-layers-pull-tab', false);
      postGlChrome();
    }

    function openEventListPanel() {
      if (!panel) return;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('event-list-panel-open');
      syncPullTabExpanded('event-list-pull-tab', true);
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
      if (typeof window.scheduleEventsPanelRefresh === 'function') {
        window.scheduleEventsPanelRefresh(80);
        window.scheduleEventsPanelRefresh(280);
      }
      var searchInput = document.getElementById('event-list-search');
      if (searchInput) {
        setTimeout(function() { searchInput.focus(); }, 0);
      }
      postGlChrome();
    }

    function closeEventListPanel() {
      if (!panel) return;
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('event-list-panel-open');
      syncPullTabExpanded('event-list-pull-tab', false);
      postGlChrome();
    }

    function openKeyboardControlsPanel() {
      if (!keyboardPanel) return;
      closeEventListPanel();
      closeCalendarsLeftPanel();
      document.body.classList.add('keyboard-panel-open');
      keyboardPanel.classList.add('open');
      keyboardPanel.setAttribute('aria-hidden', 'false');
      postGlChrome();
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
      postGlChrome();
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

    // Desktop default: Events + (standalone) Layers open. Embedded portal opens Layers itself.
    var isDesktop = !(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    if (isDesktop) {
      openEventListPanel();
      if (window.self === window.top) openCalendarsLeftPanel();
    }

  });
})();
