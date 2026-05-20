/**
 * Circaevum intro: startup gate, opt-out (localStorage), URL flags, public-view segment,
 * prompt UI, and launcher for the guided tour (see presentation/intro-tour.js).
 */
(function () {
  var STORAGE_KEY = 'circaevum_intro_v1';
  var SESSION_PROMPT_KEY = 'circaevum_intro_v1_prompt_shown_session';

  function getParams() {
    return new URLSearchParams(typeof window !== 'undefined' && window.location.search ? window.location.search : '');
  }

  function isPublicViewSegment(params) {
    if (params.get('view') === 'public') return true;
    if (params.get('bundle') && params.get('owner')) return true;
    if (params.get('calendar') && params.get('owner')) return true;
    return false;
  }

  function readStoredStatus() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      if (raw === 'dismissed' || raw === 'completed' || raw === 'accepted') return raw;
      try {
        var o = JSON.parse(raw);
        if (o && typeof o.status === 'string') return o.status;
      } catch (e) {}
    } catch (e) {}
    return null;
  }

  function writeStoredStatus(status) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ status: status, updatedAt: new Date().toISOString() })
      );
    } catch (e) {}
  }

  function clearStoredIntro() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_PROMPT_KEY);
    } catch (e) {}
  }

  function getUrlFlags() {
    var f = typeof window !== 'undefined' && window.CIRCAEVUM_INTRO_URL_FLAGS;
    if (f && typeof f === 'object') return f;
    return { skipIntro: false, introForcePrompt: false, presentStart: false };
  }

  /**
   * @returns {'silent'|'prompt'|'present'}
   */
  function getIntroDecision() {
    var params = getParams();
    var flags = getUrlFlags();

    if (flags.skipIntro || params.get('skipIntro') === '1' || params.get('intro') === '0') {
      return 'silent';
    }

    if (flags.presentStart || params.get('present') === '1') {
      return 'present';
    }

    var publicSeg = isPublicViewSegment(params);
    var forceIntro = flags.introForcePrompt || params.get('intro') === '1';

    if (publicSeg && !forceIntro) {
      return 'silent';
    }

    var stored = readStoredStatus();
    if ((stored === 'dismissed' || stored === 'completed' || stored === 'accepted') && !forceIntro) {
      return 'silent';
    }

    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_PROMPT_KEY) === '1' && !forceIntro) {
        return 'silent';
      }
    } catch (e) {}

    return 'prompt';
  }

  var promptEl = null;

  function removeEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function markSessionPromptShown() {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_PROMPT_KEY, '1');
    } catch (e) {}
  }

  function hidePrompt() {
    if (promptEl) {
      promptEl.setAttribute('aria-hidden', 'true');
      promptEl.classList.remove('circaevum-intro-prompt--visible');
    }
  }

  function destroyPrompt() {
    removeEl(promptEl);
    promptEl = null;
  }

  function hideTourBar() {
    if (window.CircaevumIntroTour && typeof window.CircaevumIntroTour.stop === 'function') {
      window.CircaevumIntroTour.stop(false);
    }
  }

  function startTourStub() {
    if (isIntroSkippedByUrl()) return;
    hidePrompt();
    hideTourBar();
    if (window.CircaevumIntroTour && typeof window.CircaevumIntroTour.start === 'function') {
      window.CircaevumIntroTour.start({
        onComplete: function () {
          writeStoredStatus('completed');
        }
      });
      return;
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[CircaevumIntro] intro-tour.js not loaded; tour unavailable.');
    }
  }

  function isIntroSkippedByUrl() {
    var flags = getUrlFlags();
    var params = getParams();
    return flags.skipIntro || params.get('skipIntro') === '1' || params.get('intro') === '0';
  }

  function buildPromptDom(onTakeTour, onSkip) {
    var wrap = document.createElement('div');
    wrap.id = 'circaevum-intro-prompt';
    wrap.className = 'circaevum-intro-prompt';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'false');
    wrap.setAttribute('aria-labelledby', 'circaevum-intro-prompt-title');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="circaevum-intro-prompt-card">' +
      '<p id="circaevum-intro-prompt-title" class="circaevum-intro-prompt-title">Take a quick tour?</p>' +
      '<p class="circaevum-intro-prompt-sub">See how planetary time, worldlines, and events fit together in Circaevum.</p>' +
      '<div class="circaevum-intro-prompt-actions">' +
      '<button type="button" class="circaevum-intro-btn circaevum-intro-btn-primary" data-action="tour">Take the tour</button>' +
      '<button type="button" class="circaevum-intro-btn circaevum-intro-btn-ghost" data-action="skip">Skip</button>' +
      '</div></div>';

    wrap.querySelector('[data-action="tour"]').onclick = function () {
      onTakeTour();
    };
    wrap.querySelector('[data-action="skip"]').onclick = function () {
      onSkip();
    };
    return wrap;
  }

  function showIntroPrompt(options) {
    if (isIntroSkippedByUrl()) return;
    var force = options && options.force;
    var params = getParams();
    var flags = getUrlFlags();
    if (!force) {
      if (getIntroDecision() === 'silent' && !flags.introForcePrompt && params.get('intro') !== '1') {
        return;
      }
    }
    if (promptEl) return;

    markSessionPromptShown();

    function onSkip() {
      writeStoredStatus('dismissed');
      destroyPrompt();
    }

    function onTakeTour() {
      destroyPrompt();
      startTourStub();
    }

    promptEl = buildPromptDom(onTakeTour, onSkip);
    var root = document.body;
    root.appendChild(promptEl);
    requestAnimationFrame(function () {
      promptEl.classList.add('circaevum-intro-prompt--visible');
      promptEl.setAttribute('aria-hidden', 'false');
      var primary = promptEl.querySelector('.circaevum-intro-btn-primary');
      if (primary && typeof primary.focus === 'function') primary.focus();
    });
  }

  function runStartupGate() {
    var d = getIntroDecision();
    if (d === 'present') {
      markSessionPromptShown();
      startTourStub();
      return;
    }
    if (d === 'prompt') {
      showIntroPrompt({ force: true });
    }
  }

  function ensureReplayControl() {
    var grid = document.querySelector('.scene-icon-grid');
    if (!grid || grid.querySelector('#circaevum-intro-replay-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'circaevum-intro-replay-btn';
    btn.className = 'scene-icon-btn';
    btn.title = 'Replay intro tour';
    btn.setAttribute('aria-label', 'Replay intro tour');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polygon points="5 3 19 12 5 21 5 3"/>' +
      '</svg>';
    btn.onclick = function (e) {
      e.stopPropagation();
      clearStoredIntro();
      showIntroPrompt({ force: true });
    };
    grid.appendChild(btn);
  }

  /** @param {Object} data embed message */
  function applyCircaevumIntroEmbedCommand(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'CIRCAEVUM_INTRO_SET') {
      var mode = data.mode;
      if (mode === 'dismissed' || mode === 'completed' || mode === 'accepted') {
        writeStoredStatus(mode);
      } else if (mode === 'reset' || mode === 'cleared') {
        clearStoredIntro();
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_INTRO_PROMPT' && data.show) {
      showIntroPrompt({ force: true });
      return;
    }
    if (data.type === 'CIRCAEVUM_INTRO_START') {
      markSessionPromptShown();
      startTourStub();
    }
  }

  window.CircaevumIntro = {
    STORAGE_KEY: STORAGE_KEY,
    SESSION_PROMPT_KEY: SESSION_PROMPT_KEY,
    isPublicViewSegment: isPublicViewSegment,
    getIntroDecision: getIntroDecision,
    readStoredStatus: readStoredStatus,
    writeStoredStatus: writeStoredStatus,
    clearStoredIntro: clearStoredIntro,
    showIntroPrompt: showIntroPrompt,
    hideIntroPrompt: function () {
      hidePrompt();
      destroyPrompt();
    },
    startTourStub: startTourStub,
    applyCircaevumIntroEmbedCommand: applyCircaevumIntroEmbedCommand,
    runStartupGate: runStartupGate
  };

  window.showCircaevumIntroPrompt = function (opts) {
    showIntroPrompt(opts || {});
  };
  window.startCircaevumIntroTour = function () {
    if (window.CircaevumIntroTour && typeof window.CircaevumIntroTour.start === 'function') {
      window.CircaevumIntroTour.start({
        onComplete: function () {
          writeStoredStatus('completed');
        }
      });
    } else {
      startTourStub();
    }
  };
  window.applyCircaevumIntroEmbedCommand = applyCircaevumIntroEmbedCommand;

  document.addEventListener('DOMContentLoaded', function () {
    try {
      runStartupGate();
    } catch (e) {}
    try {
      ensureReplayControl();
    } catch (e) {}
  });
})();
