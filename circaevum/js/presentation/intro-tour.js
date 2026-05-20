/**
 * Scripted intro tour: seven narrative sequences across five calendar years.
 * Depends on main.js + window.applyCircaevumTourScene / capture / restore / clearTourNarrativeSceneFlags.
 */
(function () {
  var hostEl = null;
  var rafId = null;
  var run = null;

  var DEMO_LAYER = 'intro-narrative-demo';
  /** seq1: ensure single applyScene when switching focus to Earth */
  var tourSeq1EarthApplied = false;
  /** seq6: avoid applyScene / setZoom every frame (was double full createPlanets + repeated zoom 8). */
  var tourSeq6SolsticeLast = null;
  var tourSeq6DayZoomApplied = false;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isoDate(y, m, d) {
    return y + '-' + pad2(m + 1) + '-' + pad2(d);
  }

  /** Calendar date noon local for stable ephemeris stepping. */
  function noon(y, m, d) {
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  function applyScene(p) {
    if (typeof window.applyCircaevumTourScene === 'function') window.applyCircaevumTourScene(p);
  }

  function setTimeMs(ms) {
    if (typeof setSelectedDateTime === 'function') setSelectedDateTime(new Date(ms));
  }

  function clearIntroDemoLayer() {
    var gl = window.circaevumGL;
    if (!gl || typeof gl.removeLayer !== 'function') return;
    try {
      var ids = typeof gl.getLayerIds === 'function' ? gl.getLayerIds() : [];
      if (ids.indexOf(DEMO_LAYER) >= 0) gl.removeLayer(DEMO_LAYER);
    } catch (e) {}
  }

  function ensureDemoLayer() {
    var gl = window.circaevumGL;
    if (!gl || typeof gl.addLayer !== 'function') return;
    try {
      var ids = typeof gl.getLayerIds === 'function' ? gl.getLayerIds() : [];
      if (ids.indexOf(DEMO_LAYER) < 0) {
        gl.addLayer(DEMO_LAYER, { name: 'Tour narrative', color: '#7c3aed' });
      }
    } catch (e) {}
  }

  function addDemoEvents(list) {
    var gl = window.circaevumGL;
    if (!gl || typeof gl.addEvents !== 'function' || !list || !list.length) return;
    ensureDemoLayer();
    try {
      gl.addEvents(DEMO_LAYER, list);
    } catch (e) {}
  }

  function demoEvent(uid, summary, y0, m0, d0, y1, m1, d1) {
    return {
      uid: uid,
      summary: summary,
      dtstart: { date: isoDate(y0, m0, d0) },
      dtend: { date: isoDate(y1, m1, d1) },
      status: 'CONFIRMED'
    };
  }

  function setStoryFrame(ms, wlProgressOpt) {
    if (typeof window.applyCircaevumTourStoryFrame === 'function') {
      window.applyCircaevumTourStoryFrame(ms, wlProgressOpt);
    } else {
      setTimeMs(ms);
    }
  }

  function removeTourCalendarStrip() {
    try {
      var el = document.getElementById('circaevum-tour-cal-strip');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) {}
  }

  function ensureTourCalendarStrip() {
    if (typeof document === 'undefined' || document.getElementById('circaevum-tour-cal-strip')) return;
    var bar = document.createElement('div');
    bar.id = 'circaevum-tour-cal-strip';
    bar.className = 'circaevum-tour-cal-strip';
    bar.setAttribute('role', 'presentation');
    var labels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    var cells = labels
      .map(function (lab, i) {
        return '<span class="circaevum-tour-cal-strip-cell" data-m="' + i + '">' + lab + '</span>';
      })
      .join('');
    bar.innerHTML =
      '<div class="circaevum-tour-cal-strip-inner">' +
      '<span class="circaevum-tour-cal-strip-label">Year at a glance</span>' +
      '<div class="circaevum-tour-cal-strip-track">' +
      cells +
      '</div><div class="circaevum-tour-cal-strip-cursor" aria-hidden="true"></div></div>';
    document.body.appendChild(bar);
  }

  function refreshTourCalendarStrip(ms) {
    var bar = document.getElementById('circaevum-tour-cal-strip');
    if (!bar) return;
    var d = new Date(ms);
    var m = Math.max(0, Math.min(11, d.getMonth()));
    var cur = bar.querySelector('.circaevum-tour-cal-strip-cursor');
    if (cur) {
      cur.style.left = ((m + 0.5) / 12) * 100 + '%';
    }
    bar.querySelectorAll('.circaevum-tour-cal-strip-cell').forEach(function (c) {
      var mi = parseInt(c.getAttribute('data-m'), 10);
      c.classList.toggle('is-past', mi < m);
      c.classList.toggle('is-current', mi === m);
    });
  }

  function showTourPersonasOptional() {
    if (typeof document === 'undefined' || document.getElementById('circaevum-tour-personas')) return;
    var wrap = document.createElement('div');
    wrap.id = 'circaevum-tour-personas';
    wrap.className = 'circaevum-tour-personas';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Who is this timeline for?');
    var selected = {};
    try {
      var raw = localStorage.getItem('circaevum_tour_personas_v1');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.ids && o.ids.forEach) o.ids.forEach(function (id) { selected[id] = true; });
      }
    } catch (e) {}
    function persist() {
      var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
      try {
        localStorage.setItem('circaevum_tour_personas_v1', JSON.stringify({ ids: ids, updatedAt: new Date().toISOString() }));
      } catch (e2) {}
    }
    function chip(id, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'circaevum-tour-personas-chip' + (selected[id] ? ' is-on' : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', selected[id] ? 'true' : 'false');
      b.addEventListener('click', function () {
        selected[id] = !selected[id];
        b.classList.toggle('is-on', selected[id]);
        b.setAttribute('aria-pressed', selected[id] ? 'true' : 'false');
        persist();
      });
      return b;
    }
    var row = document.createElement('div');
    row.className = 'circaevum-tour-personas-row';
    row.appendChild(chip('kid', 'Kid'));
    row.appendChild(chip('parent', 'Parent'));
    row.appendChild(chip('educator', 'Educator'));
    var title = document.createElement('p');
    title.className = 'circaevum-tour-personas-title';
    title.textContent = 'Optional: who is this plan for?';
    var sub = document.createElement('p');
    sub.className = 'circaevum-tour-personas-sub';
    sub.textContent = 'Toggle any that apply. You can change this later in settings when we wire it up.';
    var actions = document.createElement('div');
    actions.className = 'circaevum-tour-personas-actions';
    var done = document.createElement('button');
    done.type = 'button';
    done.className = 'circaevum-tour-personas-done strip-btn';
    done.textContent = 'Done';
    done.addEventListener('click', function () {
      persist();
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    });
    actions.appendChild(done);
    wrap.appendChild(title);
    wrap.appendChild(sub);
    wrap.appendChild(row);
    wrap.appendChild(actions);
    document.body.appendChild(wrap);
  }

  if (typeof window !== 'undefined') {
    window.circaevumTourCalendarStripRefresh = refreshTourCalendarStrip;
  }

  /**
   * @param {number} Y0 Anchor year (first “orbit” calendar year).
   * @param {*} snap Snapshot from captureCircaevumTourSnapshot (moon default).
   */
  function buildDefaultSteps(Y0, snap) {
    var snapMoon = snap && typeof snap.showMoonLayer === 'boolean' ? snap.showMoonLayer : true;
    var camSun = { x: 1.15, y: 0.4 };
    var camEarth = { x: 0.48, y: 0.42 };

    return [
      /* 1 — Earth orbits the Sun: no worldlines, no markers; end by easing toward Earth. */
      {
        id: 'seq1',
        label: '1 · Earth orbits the Sun',
        durationMs: 20000,
        onEnter: function () {
          tourSeq1EarthApplied = false;
          if (typeof setZoomLevel === 'function') setZoomLevel(3);
          applyScene({
            tourMinimalOrbitMode: true,
            tourYearMarkerReveal: null,
            tourWorldlineRevealProgress: null,
            tourHideAllTimeMarkers: true,
            tourOrbitMarkersFromCalendar: false,
            tourSolsticeCrossActive: false,
            tourNarrativeLightMode: true,
            tourFlatCalendarStrip: false,
            tourMarkerDensityOverride: null,
            moonLayer: false,
            focusTarget: 'sun',
            showFullYearTimeMarkers: false,
            showTimeMarkerLines: false,
            showTimeMarkerText: false,
            cameraRotation: camSun
          });
          setTimeMs(noon(Y0, 0, 1).getTime());
        },
        onFrame: function (u) {
          var t0 = noon(Y0, 0, 1).getTime();
          var t1 = noon(Y0, 11, 31).getTime();
          var ue = u < 0.82 ? u / 0.82 : 1;
          var ms = lerp(t0, t1, ue);
          setStoryFrame(ms);

          if (u < 0.82) {
            var orbitT = u / 0.82;
            var ang = orbitT * Math.PI * 2 * 0.55;
            var cx = camSun.x + 0.26 * Math.sin(ang);
            var cy = camSun.y + 0.18 * Math.cos(ang * 1.15);
            applyScene({ tourCameraOnly: true, cameraRotation: { x: cx, y: cy } });
          } else {
            var k = (u - 0.82) / 0.18;
            var ke = easeInOutCubic(Math.min(1, k));
            if (!tourSeq1EarthApplied) {
              tourSeq1EarthApplied = true;
              applyScene({
                tourMinimalOrbitMode: true,
                tourHideAllTimeMarkers: true,
                tourNarrativeLightMode: true,
                focusTarget: 'earth'
              });
            }
            applyScene({
              tourCameraOnly: true,
              cameraRotation: {
                x: lerp(camSun.x, camEarth.x, ke),
                y: lerp(camSun.y, camEarth.y, ke)
              }
            });
          }
        }
      },
      /* 2 — Second calendar year: grow helical worldline from Jan 1 to Earth’s current date. */
      {
        id: 'seq2',
        label: '2 · Worldlines grow',
        durationMs: 20000,
        onEnter: function () {
          if (typeof setZoomLevel === 'function') setZoomLevel(3);
          setTimeMs(noon(Y0 + 1, 0, 1).getTime());
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: 0,
            tourHideAllTimeMarkers: true,
            tourOrbitMarkersFromCalendar: false,
            tourSolsticeCrossActive: false,
            tourNarrativeLightMode: true,
            tourFlatCalendarStrip: false,
            tourMarkerDensityOverride: null,
            moonLayer: false,
            focusTarget: 'sun',
            showTimeMarkerLines: false,
            showTimeMarkerText: false
          });
        },
        onFrame: function (u) {
          if (u < 0.22) {
            var kb = easeInOutCubic(u / 0.22);
            applyScene({
              tourCameraOnly: true,
              cameraRotation: {
                x: lerp(camEarth.x, camSun.x, kb),
                y: lerp(camEarth.y, camSun.y, kb)
              }
            });
          }
          var t0 = noon(Y0 + 1, 0, 1).getTime();
          var t1 = noon(Y0 + 1, 11, 31).getTime();
          setStoryFrame(lerp(t0, t1, u), Math.max(0, Math.min(1, u)));
        }
      },
      /* 3 — Third year: time markers by calendar quarter + progressive draw; zoom steps for week/day bands. */
      {
        id: 'seq3',
        label: '3 · Time markers by season',
        durationMs: 26000,
        onEnter: function () {
          if (typeof setZoomLevel === 'function') setZoomLevel(3);
          setTimeMs(noon(Y0 + 2, 0, 1).getTime());
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: null,
            tourHideAllTimeMarkers: false,
            tourOrbitMarkersFromCalendar: true,
            tourSolsticeCrossActive: false,
            tourNarrativeLightMode: true,
            tourFlatCalendarStrip: true,
            tourMarkerDensityOverride: 'quarters',
            moonLayer: false,
            focusTarget: 'sun',
            showFullYearTimeMarkers: false,
            showTimeMarkerLines: true,
            showTimeMarkerText: true,
            cameraRotation: camSun
          });
          ensureTourCalendarStrip();
          refreshTourCalendarStrip(noon(Y0 + 2, 0, 1).getTime());
        },
        onFrame: function (u) {
          var t0 = noon(Y0 + 2, 0, 1).getTime();
          var t1 = noon(Y0 + 2, 11, 31).getTime();
          var slow = u < 0.9 ? u / 0.9 : 1;
          var ms = lerp(t0, t1, slow);
          if (u >= 0.9) {
            var tail = (u - 0.9) / 0.1;
            ms = lerp(lerp(t0, t1, 1), t1, easeOutCubic(tail));
          }
          setStoryFrame(ms);
        }
      },
      /* 4 — Fourth year Q1: Moon worldline + follow Moon (requires lunar zoom). */
      {
        id: 'seq4',
        label: '4 · Moon path (Q1)',
        durationMs: 16000,
        onEnter: function () {
          if (typeof setZoomLevel === 'function') setZoomLevel(6);
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: null,
            tourHideAllTimeMarkers: true,
            tourOrbitMarkersFromCalendar: false,
            tourSolsticeCrossActive: false,
            tourNarrativeLightMode: false,
            tourFlatCalendarStrip: false,
            tourMarkerDensityOverride: null,
            moonLayer: true,
            /* Earth-centered framing so the Moon visibly orbits the Earth (moon focus locks camera on the Moon). */
            focusTarget: 'earth',
            showTimeMarkerLines: false,
            showTimeMarkerText: false,
            cameraRotation: { x: 0.5, y: 0.42 }
          });
          setTimeMs(noon(Y0 + 3, 0, 1).getTime());
        },
        onFrame: function (u) {
          var t0 = noon(Y0 + 3, 0, 1).getTime();
          var t1 = noon(Y0 + 3, 2, 28).getTime();
          setStoryFrame(lerp(t0, t1, u));
        }
      },
      /* 5 — Spring→late fall: year-scale helix + staged orbit markers + Fall semester demo events. */
      {
        id: 'seq5',
        label: '5 · Planets & Fall semester',
        durationMs: 22000,
        onEnter: function () {
          if (typeof setZoomLevel === 'function') setZoomLevel(3);
          setTimeMs(noon(Y0 + 3, 3, 1).getTime());
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: null,
            tourHideAllTimeMarkers: false,
            tourOrbitMarkersFromCalendar: true,
            tourSolsticeCrossActive: false,
            /* Same light scrub path as seq 3 so time advances rebuild markers/worldlines on a cadence. */
            tourNarrativeLightMode: true,
            tourFlatCalendarStrip: false,
            tourMarkerDensityOverride: 'months',
            moonLayer: snapMoon,
            focusTarget: 'sun',
            showFullYearTimeMarkers: false,
            showTimeMarkerLines: true,
            showTimeMarkerText: false,
            cameraRotation: { x: 0.42, y: 0.5 }
          });
          clearIntroDemoLayer();
        },
        onFrame: function (u) {
          var t0 = noon(Y0 + 3, 3, 1).getTime();
          var t1 = noon(Y0 + 3, 11, 15).getTime();
          setStoryFrame(lerp(t0, t1, u));
          if (u > 0.18) {
            addDemoEvents([
              demoEvent('intro-fall-' + Y0, 'Fall Semester', Y0 + 3, 7, 20, Y0 + 3, 11, 20)
            ]);
          }
          if (u > 0.42) {
            addDemoEvents([
              demoEvent('intro-proj-a-' + Y0, 'Project milestone A', Y0 + 3, 8, 10, Y0 + 3, 8, 24),
              demoEvent('intro-proj-b-' + Y0, 'Project milestone B', Y0 + 3, 9, 2, Y0 + 3, 9, 18)
            ]);
          }
        }
      },
      /* 6 — Late year: solstice cross overlay + winter holidays (demo events). */
      {
        id: 'seq6',
        label: '6 · Solstices & holidays',
        durationMs: 20000,
        onEnter: function () {
          tourSeq6SolsticeLast = null;
          tourSeq6DayZoomApplied = false;
          if (typeof setZoomLevel === 'function') setZoomLevel(3);
          setTimeMs(noon(Y0 + 3, 9, 1).getTime());
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: null,
            tourHideAllTimeMarkers: false,
            tourOrbitMarkersFromCalendar: true,
            tourSolsticeCrossActive: false,
            tourNarrativeLightMode: true,
            tourFlatCalendarStrip: false,
            tourMarkerDensityOverride: null,
            moonLayer: snapMoon,
            focusTarget: 'sun',
            showFullYearTimeMarkers: false,
            showTimeMarkerLines: true,
            showTimeMarkerText: true,
            cameraRotation: camSun
          });
        },
        onFrame: function (u) {
          var t0 = noon(Y0 + 3, 9, 1).getTime();
          var t1 = noon(Y0 + 3, 11, 31).getTime();
          var ms = lerp(t0, t1, u);
          setStoryFrame(ms);
          var d = new Date(ms);
          var wantSolstice = d.getMonth() >= 10;
          if (tourSeq6SolsticeLast !== wantSolstice) {
            tourSeq6SolsticeLast = wantSolstice;
            applyScene({ tourSolsticeCrossActive: wantSolstice });
          }
          if (u > 0.55 && !tourSeq6DayZoomApplied) {
            tourSeq6DayZoomApplied = true;
            if (typeof setZoomLevel === 'function') setZoomLevel(8);
            applyScene({ focusTarget: 'earth', cameraRotation: camEarth });
          }
          if (u > 0.72) {
            addDemoEvents([
              demoEvent('intro-xmas-' + Y0, 'Winter holidays', Y0 + 3, 11, 22, Y0 + 3, 11, 31)
            ]);
          }
        }
      },
      /* 7 — Fifth calendar year: stay on year helix (no day/week zoom); scrub spring → winter so demo events read clearly. */
      {
        id: 'seq7',
        label: '7 · Spring semester & year recap',
        durationMs: 22000,
        onEnter: function () {
          if (typeof setZoomLevel === 'function') setZoomLevel(3);
          setTimeMs(noon(Y0 + 4, 0, 1).getTime());
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: null,
            tourSolsticeCrossActive: false,
            tourOrbitMarkersFromCalendar: true,
            tourHideAllTimeMarkers: false,
            tourNarrativeLightMode: true,
            tourFlatCalendarStrip: false,
            tourMarkerDensityOverride: 'months',
            moonLayer: snapMoon,
            focusTarget: 'sun',
            showFullYearTimeMarkers: false,
            showTimeMarkerLines: true,
            showTimeMarkerText: true,
            cameraRotation: camSun
          });
          addDemoEvents([
            demoEvent('intro-spring-' + Y0, 'Spring Semester', Y0 + 4, 0, 15, Y0 + 4, 4, 15),
            demoEvent('intro-game-' + Y0, 'Sports game', Y0 + 4, 2, 5, Y0 + 4, 2, 5),
            demoEvent('intro-doc-' + Y0, 'Doctor appointment', Y0 + 4, 3, 2, Y0 + 4, 3, 2),
            demoEvent('intro-trip-' + Y0, 'Family trip', Y0 + 4, 5, 10, Y0 + 4, 5, 17)
          ]);
        },
        onFrame: function (u) {
          var t0 = noon(Y0 + 4, 0, 1).getTime();
          var t1 = noon(Y0 + 4, 11, 31).getTime();
          var slow = u < 0.92 ? u / 0.92 : 1;
          setStoryFrame(lerp(t0, t1, easeOutCubic(slow)));
          if (u < 0.92) {
            var wobble = 0.04 * Math.sin(u * Math.PI * 2);
            applyScene({
              tourCameraOnly: true,
              cameraRotation: { x: camSun.x + wobble, y: camSun.y + 0.03 * Math.cos(u * Math.PI * 2) }
            });
          }
        }
      }
    ];
  }

  function createTourUi(steps, api) {
    var wrap = document.createElement('div');
    wrap.className = 'circaevum-intro-tour-bar-inner';
    wrap.setAttribute('role', 'group');
    var dotsHtml = steps
      .map(function (s, i) {
        return (
          '<button type="button" class="circaevum-intro-tour-dot" data-step="' +
          i +
          '" title="' +
          String(s.label || s.id).replace(/"/g, '&quot;') +
          '" aria-label="Go to step ' +
          (i + 1) +
          ': ' +
          String(s.label || s.id).replace(/"/g, '&quot;') +
          '"></button>'
        );
      })
      .join('');
    wrap.innerHTML =
      '<div class="circaevum-intro-tour-row1">' +
      '<span class="circaevum-intro-tour-title" id="circaevum-intro-tour-title">Intro</span>' +
      '<div class="circaevum-intro-tour-transport">' +
      '<button type="button" class="circaevum-intro-tour-btn" id="circaevum-intro-tour-prev" aria-label="Previous step">◀</button>' +
      '<button type="button" class="circaevum-intro-tour-btn" id="circaevum-intro-tour-play" aria-label="Pause or resume">❚❚</button>' +
      '<button type="button" class="circaevum-intro-tour-btn" id="circaevum-intro-tour-next" aria-label="Next step">▶</button>' +
      '</div>' +
      '<button type="button" class="circaevum-intro-tour-end strip-btn" id="circaevum-intro-tour-end">End tour</button>' +
      '</div>' +
      '<div class="circaevum-intro-tour-row2">' +
      '<label class="circaevum-intro-tour-progress-label">' +
      '<span class="circaevum-intro-tour-sr-only">Tour progress</span>' +
      '<input type="range" id="circaevum-intro-tour-progress" min="0" max="1000" value="0" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0" />' +
      '</label>' +
      '<div class="circaevum-intro-tour-dots" role="tablist">' +
      dotsHtml +
      '</div>' +
      '</div>';

    var titleEl = wrap.querySelector('#circaevum-intro-tour-title');
    var playBtn = wrap.querySelector('#circaevum-intro-tour-play');
    var prevBtn = wrap.querySelector('#circaevum-intro-tour-prev');
    var nextBtn = wrap.querySelector('#circaevum-intro-tour-next');
    var endBtn = wrap.querySelector('#circaevum-intro-tour-end');
    var progressEl = wrap.querySelector('#circaevum-intro-tour-progress');

    playBtn.addEventListener('click', function () {
      api.togglePlay();
    });
    prevBtn.addEventListener('click', function () {
      api.prevStep();
    });
    nextBtn.addEventListener('click', function () {
      api.nextStep();
    });
    endBtn.addEventListener('click', function () {
      api.endTour(true);
    });
    progressEl.addEventListener('input', function () {
      api.scrubToFraction(parseInt(progressEl.value, 10) / 1000);
    });
    wrap.querySelectorAll('.circaevum-intro-tour-dot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-step'), 10);
        if (!isNaN(idx)) api.goToStep(idx);
      });
    });

    return {
      root: wrap,
      setTitle: function (text) {
        if (titleEl) titleEl.textContent = text;
      },
      setPlayLabel: function (playing) {
        playBtn.textContent = playing ? '❚❚' : '▶';
        playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      },
      setProgress: function (fraction) {
        var v = Math.round(Math.max(0, Math.min(1, fraction)) * 1000);
        progressEl.value = String(v);
        progressEl.setAttribute('aria-valuenow', String(v));
      },
      setStepHighlight: function (index) {
        wrap.querySelectorAll('.circaevum-intro-tour-dot').forEach(function (d, i) {
          d.classList.toggle('is-active', i === index);
        });
      }
    };
  }

  function start(opts) {
    if (run) stop(false);
    var onComplete = opts && typeof opts.onComplete === 'function' ? opts.onComplete : null;
    var tourYear =
      typeof getSelectedDateTime === 'function'
        ? getSelectedDateTime().getFullYear()
        : new Date().getFullYear();
    var initialSnapshot =
      typeof window.captureCircaevumTourSnapshot === 'function' ? window.captureCircaevumTourSnapshot() : null;
    var steps = buildDefaultSteps(tourYear, initialSnapshot);

    var stepIndex = 0;
    var stepLocalMs = 0;
    var playing = true;
    var totalMs = steps.reduce(function (a, s) {
      return a + s.durationMs;
    }, 0);
    var lastNow = performance.now();

    hostEl = document.createElement('div');
    hostEl.className = 'circaevum-intro-tour-bar';
    document.body.appendChild(hostEl);

    function totalElapsedMs() {
      var acc = 0;
      for (var i = 0; i < stepIndex; i++) acc += steps[i].durationMs;
      return acc + stepLocalMs;
    }

    function fractionGlobal() {
      return totalMs > 0 ? Math.min(1, totalElapsedMs() / totalMs) : 0;
    }

    function syncUi(ui) {
      var st = steps[stepIndex];
      ui.setTitle((st && st.label) || 'Intro');
      ui.setPlayLabel(playing);
      ui.setProgress(fractionGlobal());
      ui.setStepHighlight(stepIndex);
    }

    function seekToStep(j, ui) {
      if (j < 0 || j >= steps.length) return;
      if (typeof window.restoreCircaevumTourSnapshot === 'function' && initialSnapshot) {
        window.restoreCircaevumTourSnapshot(initialSnapshot);
      }
      for (var k = 0; k < j; k++) {
        var sk = steps[k];
        if (sk.onEnter) sk.onEnter();
        if (sk.onFrame) sk.onFrame(1);
      }
      stepIndex = j;
      stepLocalMs = 0;
      if (steps[j].onEnter) steps[j].onEnter();
      syncUi(ui);
    }

    var ui = createTourUi(steps, {
      togglePlay: function () {
        if (!run) return;
        playing = !playing;
        lastNow = performance.now();
        syncUi(ui);
      },
      prevStep: function () {
        if (!run) return;
        if (stepIndex <= 0) return;
        seekToStep(stepIndex - 1, ui);
      },
      nextStep: function () {
        if (!run) return;
        if (stepIndex >= steps.length - 1) return;
        seekToStep(stepIndex + 1, ui);
      },
      goToStep: function (j) {
        if (!run) return;
        seekToStep(j, ui);
      },
      scrubToFraction: function (fr) {
        if (!run) return;
        fr = Math.max(0, Math.min(1, fr));
        if (fr >= 0.9995) {
          if (typeof window.restoreCircaevumTourSnapshot === 'function' && initialSnapshot) {
            window.restoreCircaevumTourSnapshot(initialSnapshot);
          }
          for (var ki = 0; ki < steps.length; ki++) {
            if (steps[ki].onEnter) steps[ki].onEnter();
            if (steps[ki].onFrame) steps[ki].onFrame(1);
          }
          stepIndex = steps.length - 1;
          stepLocalMs = steps[stepIndex].durationMs;
          syncUi(ui);
          return;
        }
        var targetMs = fr * totalMs;
        var acc = 0;
        var idx = 0;
        for (; idx < steps.length; idx++) {
          if (acc + steps[idx].durationMs >= targetMs - 1e-6) break;
          acc += steps[idx].durationMs;
        }
        var local = Math.max(0, targetMs - acc);
        if (typeof window.restoreCircaevumTourSnapshot === 'function' && initialSnapshot) {
          window.restoreCircaevumTourSnapshot(initialSnapshot);
        }
        for (var k = 0; k < idx; k++) {
          var sk = steps[k];
          if (sk.onEnter) sk.onEnter();
          if (sk.onFrame) sk.onFrame(1);
        }
        stepIndex = idx;
        stepLocalMs = Math.min(local, steps[idx].durationMs);
        if (steps[idx].onEnter) steps[idx].onEnter();
        var u = steps[idx].durationMs > 0 ? stepLocalMs / steps[idx].durationMs : 1;
        if (steps[idx].onFrame) steps[idx].onFrame(Math.min(1, u));
        syncUi(ui);
      },
      endTour: function (completed) {
        stop(completed);
      }
    });

    run = {
      onComplete: onComplete,
      initialSnapshot: initialSnapshot
    };

    hostEl.appendChild(ui.root);
    seekToStep(0, ui);

    function finishTour() {
      stop(true);
    }

    function tick(now) {
      if (!run) return;
      if (playing) {
        var dt = now - lastNow;
        lastNow = now;
        stepLocalMs += dt;
        while (stepIndex < steps.length && stepLocalMs >= steps[stepIndex].durationMs) {
          stepLocalMs -= steps[stepIndex].durationMs;
          stepIndex++;
          if (stepIndex >= steps.length) {
            finishTour();
            return;
          }
          if (steps[stepIndex].onEnter) steps[stepIndex].onEnter();
        }
        var st = steps[stepIndex];
        var u = st.durationMs > 0 ? Math.min(1, stepLocalMs / st.durationMs) : 1;
        if (st.onFrame) st.onFrame(u);
      } else {
        lastNow = now;
      }
      syncUi(ui);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }

  function stop(completed) {
    var cb = run && run.onComplete;
    var snap = run && run.initialSnapshot;
    run = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    clearIntroDemoLayer();
    removeTourCalendarStrip();
    if (typeof window.restoreCircaevumTourSnapshot === 'function' && snap) {
      try {
        window.restoreCircaevumTourSnapshot(snap);
      } catch (e) {}
    }
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    hostEl = null;
    if (completed) {
      try {
        showTourPersonasOptional();
      } catch (e) {}
    }
    if (completed && cb) {
      try {
        cb();
      } catch (e) {}
    }
  }

  window.CircaevumIntroTour = {
    start: start,
    stop: stop,
    isActive: function () {
      return !!run;
    }
  };
})();
