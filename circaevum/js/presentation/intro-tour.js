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

  function pitchRadToDeg(rad) {
    if (tourCfg && typeof tourCfg.pitchRadToDeg === 'function') return tourCfg.pitchRadToDeg(rad);
    return Math.round((rad * 180) / Math.PI);
  }

  function pitchDegToRad(deg) {
    if (tourCfg && typeof tourCfg.pitchDegToRad === 'function') return tourCfg.pitchDegToRad(deg);
    return (deg * Math.PI) / 180;
  }

  function inclinationLabelFromDeg(deg) {
    if (tourCfg && typeof tourCfg.inclinationLabelFromDeg === 'function') {
      return tourCfg.inclinationLabelFromDeg(deg);
    }
    if (deg <= -15) return 'Below horizon';
    if (deg >= 15) return 'Above horizon';
    return 'Horizon';
  }

  function defaultTourCameraPitch() {
    return tourCfg && typeof tourCfg.DEFAULT_TOUR_CAMERA_PITCH === 'number'
      ? tourCfg.DEFAULT_TOUR_CAMERA_PITCH
      : 1.15;
  }

  function defaultTourCameraYaw() {
    return tourCfg && typeof tourCfg.DEFAULT_TOUR_CAMERA_YAW === 'number'
      ? tourCfg.DEFAULT_TOUR_CAMERA_YAW
      : 0.4;
  }

  function defaultTourCameraPitchEarth() {
    return tourCfg && typeof tourCfg.DEFAULT_TOUR_CAMERA_PITCH_EARTH === 'number'
      ? tourCfg.DEFAULT_TOUR_CAMERA_PITCH_EARTH
      : 0.48;
  }

  function getStepCameraRotation(stepCfg, fallback) {
    var layers = (stepCfg && stepCfg.layers) || {};
    var fb = fallback || { x: defaultTourCameraPitch(), y: defaultTourCameraYaw() };
    return {
      x: typeof layers.tourCameraPitch === 'number' ? layers.tourCameraPitch : fb.x,
      y: typeof layers.tourCameraYaw === 'number' ? layers.tourCameraYaw : fb.y
    };
  }

  function stepCamSun(stepCfg) {
    return getStepCameraRotation(stepCfg, { x: defaultTourCameraPitch(), y: defaultTourCameraYaw() });
  }

  function stepCamEarth(stepCfg) {
    var layers = (stepCfg && stepCfg.layers) || {};
    return {
      x: defaultTourCameraPitchEarth(),
      y: typeof layers.tourCameraYaw === 'number' ? layers.tourCameraYaw : 0.42
    };
  }

  function previewTourCamera(pitchDeg, yawRad) {
    applyScene({
      tourCameraOnly: true,
      cameraRotation: {
        x: pitchDegToRad(pitchDeg),
        y: typeof yawRad === 'number' ? yawRad : defaultTourCameraYaw()
      }
    });
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

  /** Apply worldline clip from step layers (grow = 0 uses narrative/wall progress). */
  function syncWorldlineRevealFromConfig(stepCfg, wallU, narrativeU) {
    var layers = (stepCfg && stepCfg.layers) || {};
    if (layers.tourWorldlineRevealProgress == null) return;
    var p =
      layers.tourWorldlineRevealProgress === 0
        ? Math.max(0, Math.min(1, typeof narrativeU === 'number' ? narrativeU : wallU))
        : Math.max(0, Math.min(1, Number(layers.tourWorldlineRevealProgress)));
    applyScene({
      tourMinimalOrbitMode: false,
      tourWorldlineRevealProgress: p
    });
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

  var tourCfg = typeof window !== 'undefined' ? window.CircaevumIntroTourConfig : null;
  var editorOpen = false;
  var editorStepIndex = 0;
  var EDITOR_DOCK_KEY = 'circaevum_tour_editor_dock_width';
  var EDITOR_DOCK_MIN = 280;
  var EDITOR_DOCK_MAX = 560;
  var EDITOR_DOCK_DEFAULT = 380;
  var editorDockResize = null;

  function readEditorDockWidth() {
    try {
      var w = parseInt(localStorage.getItem(EDITOR_DOCK_KEY), 10);
      if (!isNaN(w)) return Math.max(EDITOR_DOCK_MIN, Math.min(EDITOR_DOCK_MAX, w));
    } catch (e) { /* ignore */ }
    return EDITOR_DOCK_DEFAULT;
  }

  function setEditorDockWidth(px) {
    var w = Math.max(EDITOR_DOCK_MIN, Math.min(EDITOR_DOCK_MAX, Math.round(px)));
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty('--tour-editor-dock-width', w + 'px');
    }
    try {
      localStorage.setItem(EDITOR_DOCK_KEY, String(w));
    } catch (e) { /* ignore */ }
    if (typeof window.circaevumResizeViewport === 'function') {
      window.circaevumResizeViewport();
    } else {
      window.dispatchEvent(new Event('resize'));
    }
    return w;
  }

  function scheduleViewportRestore() {
    requestAnimationFrame(function () {
      if (typeof window.circaevumResizeViewport === 'function') {
        window.circaevumResizeViewport();
      } else {
        window.dispatchEvent(new Event('resize'));
      }
    });
  }

  function applyTourEditorLayout(open) {
    if (typeof document === 'undefined' || !document.body) return;
    if (open && !run) return;
    document.body.classList.toggle('is-tour-editor-open', !!open);
    if (open) {
      setEditorDockWidth(readEditorDockWidth());
      return;
    }
    if (document.documentElement) {
      document.documentElement.style.removeProperty('--tour-editor-dock-width');
    }
    scheduleViewportRestore();
  }

  function createEditorDockResize(host) {
    var handle = document.createElement('div');
    handle.className = 'circaevum-intro-tour-editor-resize';
    handle.hidden = true;
    handle.title = 'Drag to resize editor panel';
    handle.setAttribute('aria-label', 'Resize tour editor panel');
    host.appendChild(handle);

    var dragging = false;
    handle.addEventListener('pointerdown', function (e) {
      dragging = true;
      handle.classList.add('is-dragging');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      setEditorDockWidth(e.clientX);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('is-dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    return {
      setVisible: function (visible) {
        handle.hidden = !visible;
      }
    };
  }

  /** Demo events respect per-step layer toggle. */
  function addDemoEventsIfEnabled(list) {
    if (run && run.showDemoEventsForStep === false) return;
    addDemoEvents(list);
  }

  function normalizeTiming(timing) {
    var t = timing || {};
    return {
      durationMs: typeof t.durationMs === 'number' ? t.durationMs : 20000,
      baselineSpeed: typeof t.baselineSpeed === 'number' ? t.baselineSpeed : 1,
      transitionInPct: typeof t.transitionInPct === 'number' ? t.transitionInPct : 0.06,
      transitionOutPct: typeof t.transitionOutPct === 'number' ? t.transitionOutPct : 0.08,
      transitionSlowdown: typeof t.transitionSlowdown === 'number' ? t.transitionSlowdown : 0.35,
      speedKeyframes:
        t.speedKeyframes && t.speedKeyframes.length
          ? t.speedKeyframes.slice().sort(function (a, b) { return a.t - b.t; })
          : [{ t: 0, v: 1 }, { t: 1, v: 1 }]
    };
  }

  function keyframeMulAt(keyframes, w) {
    if (!keyframes || keyframes.length === 0) return 1;
    if (w <= keyframes[0].t) return keyframes[0].v;
    for (var i = 1; i < keyframes.length; i++) {
      if (w <= keyframes[i].t) {
        var a = keyframes[i - 1];
        var b = keyframes[i];
        var span = b.t - a.t;
        var k = span > 1e-6 ? (w - a.t) / span : 1;
        return lerp(a.v, b.v, easeInOutCubic(k));
      }
    }
    return keyframes[keyframes.length - 1].v;
  }

  /** Instantaneous narrative speed multiplier at wall progress w ∈ [0,1]. */
  function speedAtWall(w, timing) {
    var t = normalizeTiming(timing);
    w = Math.max(0, Math.min(1, w));
    var base = Math.max(0.05, t.baselineSpeed);
    var inPct = Math.max(0, Math.min(0.45, t.transitionInPct));
    var outPct = Math.max(0, Math.min(0.45, t.transitionOutPct));
    var slow = Math.max(0.05, Math.min(1, t.transitionSlowdown));
    var mul = base;
    if (inPct > 1e-6 && w < inPct) {
      mul = lerp(slow * base, base, easeInOutCubic(w / inPct));
    } else if (outPct > 1e-6 && w > 1 - outPct) {
      mul = lerp(base, slow * base, easeInOutCubic((w - (1 - outPct)) / outPct));
    }
    mul *= keyframeMulAt(t.speedKeyframes, w);
    return Math.max(0.04, mul);
  }

  /** Map wall-clock progress within a step → narrative progress for onFrame handlers. */
  function wallToNarrativeU(w, timing) {
    var samples = 80;
    var target = Math.max(0, Math.min(1, w));
    var acc = 0;
    var total = 0;
    var prevW = 0;
    var prevSp = speedAtWall(0, timing);
    for (var i = 1; i <= samples; i++) {
      var wi = i / samples;
      var sp = speedAtWall(wi, timing);
      var seg = (prevSp + sp) * 0.5 * (wi - prevW);
      total += seg;
      if (wi <= target) acc += seg;
      prevW = wi;
      prevSp = sp;
    }
    if (total <= 1e-9) return target;
    return Math.max(0, Math.min(1, acc / total));
  }

  function applyStepFromConfig(stepCfg, snap, cameraExtra) {
    if (!stepCfg) return;
    var resolved =
      tourCfg && typeof tourCfg.resolveLayersForStep === 'function'
        ? tourCfg.resolveLayersForStep(stepCfg, snap && snap.showMoonLayer)
        : { scene: stepCfg.layers || {}, showDemoEvents: false };
    if (typeof setZoomLevel === 'function' && typeof stepCfg.zoomLevel === 'number') {
      setZoomLevel(stepCfg.zoomLevel);
    }
    var scenePatch = {};
    for (var k in resolved.scene) {
      if (Object.prototype.hasOwnProperty.call(resolved.scene, k)) scenePatch[k] = resolved.scene[k];
    }
    scenePatch.cameraRotation = getStepCameraRotation(stepCfg, cameraExtra);
    applyScene(scenePatch);
    if (run) run.showDemoEventsForStep = resolved.showDemoEvents !== false;
    if (resolved.scene && resolved.scene.tourFlatCalendarStrip) ensureTourCalendarStrip();
    else removeTourCalendarStrip();
    if (!resolved.showDemoEvents) clearIntroDemoLayer();
  }

  function wrapStepHandlers(Y0, snap, handlersById, doc) {
    return doc.steps.map(function (stepCfg) {
      var h = handlersById[stepCfg.id] || {};
      var timing = normalizeTiming(stepCfg.timing);
      return {
        id: stepCfg.id,
        label: stepCfg.label,
        durationMs: timing.durationMs,
        timing: timing,
        config: stepCfg,
        onEnter: function () {
          var camSun = stepCamSun(stepCfg);
          var camEarth = stepCamEarth(stepCfg);
          if (h.onEnter) h.onEnter(stepCfg, { Y0: Y0, snap: snap, camSun: camSun, camEarth: camEarth });
        },
        onFrame: function (wallU) {
          var narrativeU = wallToNarrativeU(wallU, timing);
          var camSun = stepCamSun(stepCfg);
          var camEarth = stepCamEarth(stepCfg);
          if (h.onFrame) {
            h.onFrame(narrativeU, wallU, stepCfg, {
              Y0: Y0,
              snap: snap,
              camSun: camSun,
              camEarth: camEarth
            });
          }
          syncWorldlineRevealFromConfig(stepCfg, wallU, narrativeU);
        }
      };
    });
  }

  var STEP_MOTION = {
    seq1: {
      onEnter: function (cfg, ctx) {
        tourSeq1EarthApplied = false;
        applyStepFromConfig(cfg, ctx.snap, ctx.camSun);
        setTimeMs(noon(ctx.Y0, 0, 1).getTime());
      },
      onFrame: function (u, wallU, cfg, ctx) {
        var t0 = noon(ctx.Y0, 0, 1).getTime();
        var t1 = noon(ctx.Y0, 11, 31).getTime();
        var ue = u < 0.82 ? u / 0.82 : 1;
        setStoryFrame(lerp(t0, t1, ue));
        if (u < 0.82) {
          var orbitT = u / 0.82;
          var ang = orbitT * Math.PI * 2 * 0.55;
          applyScene({
            tourCameraOnly: true,
            cameraRotation: {
              x: ctx.camSun.x + 0.26 * Math.sin(ang),
              y: ctx.camSun.y + 0.18 * Math.cos(ang * 1.15)
            }
          });
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
              x: lerp(ctx.camSun.x, ctx.camEarth.x, ke),
              y: lerp(ctx.camSun.y, ctx.camEarth.y, ke)
            }
          });
        }
      }
    },
    seq2: {
      onEnter: function (cfg, ctx) {
        applyStepFromConfig(cfg, ctx.snap);
        setTimeMs(noon(ctx.Y0 + 1, 0, 1).getTime());
      },
      onFrame: function (u, wallU, cfg, ctx) {
        if (u < 0.22) {
          var kb = easeInOutCubic(u / 0.22);
          applyScene({
            tourCameraOnly: true,
            cameraRotation: {
              x: lerp(ctx.camEarth.x, ctx.camSun.x, kb),
              y: lerp(ctx.camEarth.y, ctx.camSun.y, kb)
            }
          });
        }
        var t0 = noon(ctx.Y0 + 1, 0, 1).getTime();
        var t1 = noon(ctx.Y0 + 1, 11, 31).getTime();
        setStoryFrame(lerp(t0, t1, u), Math.max(0, Math.min(1, u)));
      }
    },
    seq3: {
      onEnter: function (cfg, ctx) {
        applyStepFromConfig(cfg, ctx.snap, ctx.camSun);
        setTimeMs(noon(ctx.Y0 + 2, 0, 1).getTime());
        refreshTourCalendarStrip(noon(ctx.Y0 + 2, 0, 1).getTime());
      },
      onFrame: function (u, wallU, cfg, ctx) {
        var t0 = noon(ctx.Y0 + 2, 0, 1).getTime();
        var t1 = noon(ctx.Y0 + 2, 11, 31).getTime();
        setStoryFrame(lerp(t0, t1, u));
      }
    },
    seq4: {
      onEnter: function (cfg, ctx) {
        applyStepFromConfig(cfg, ctx.snap, ctx.camSun);
        setTimeMs(noon(ctx.Y0 + 3, 0, 1).getTime());
      },
      onFrame: function (u, wallU, cfg, ctx) {
        setStoryFrame(lerp(noon(ctx.Y0 + 3, 0, 1).getTime(), noon(ctx.Y0 + 3, 2, 28).getTime(), u));
      }
    },
    seq5: {
      onEnter: function (cfg, ctx) {
        applyStepFromConfig(cfg, ctx.snap, ctx.camSun);
        setTimeMs(noon(ctx.Y0 + 3, 3, 1).getTime());
      },
      onFrame: function (u, wallU, cfg, ctx) {
        setStoryFrame(lerp(noon(ctx.Y0 + 3, 3, 1).getTime(), noon(ctx.Y0 + 3, 11, 15).getTime(), u));
        if (u > 0.18) {
          addDemoEventsIfEnabled([
            demoEvent('intro-fall-' + ctx.Y0, 'Fall Semester', ctx.Y0 + 3, 7, 20, ctx.Y0 + 3, 11, 20)
          ]);
        }
        if (u > 0.42) {
          addDemoEventsIfEnabled([
            demoEvent('intro-proj-a-' + ctx.Y0, 'Project milestone A', ctx.Y0 + 3, 8, 10, ctx.Y0 + 3, 8, 24),
            demoEvent('intro-proj-b-' + ctx.Y0, 'Project milestone B', ctx.Y0 + 3, 9, 2, ctx.Y0 + 3, 9, 18)
          ]);
        }
      }
    },
    seq6: {
      onEnter: function (cfg, ctx) {
        tourSeq6SolsticeLast = null;
        tourSeq6DayZoomApplied = false;
        applyStepFromConfig(cfg, ctx.snap, ctx.camSun);
        setTimeMs(noon(ctx.Y0 + 3, 9, 1).getTime());
      },
      onFrame: function (u, wallU, cfg, ctx) {
        var ms = lerp(noon(ctx.Y0 + 3, 9, 1).getTime(), noon(ctx.Y0 + 3, 11, 31).getTime(), u);
        setStoryFrame(ms);
        var wantSolstice = new Date(ms).getMonth() >= 10;
        if (tourSeq6SolsticeLast !== wantSolstice) {
          tourSeq6SolsticeLast = wantSolstice;
          applyScene({ tourSolsticeCrossActive: wantSolstice });
        }
        if (u > 0.55 && !tourSeq6DayZoomApplied) {
          tourSeq6DayZoomApplied = true;
          if (typeof setZoomLevel === 'function') setZoomLevel(8);
          applyScene({ focusTarget: 'earth', cameraRotation: ctx.camEarth });
        }
        if (u > 0.72) {
          addDemoEventsIfEnabled([
            demoEvent('intro-xmas-' + ctx.Y0, 'Winter holidays', ctx.Y0 + 3, 11, 22, ctx.Y0 + 3, 11, 31)
          ]);
        }
      }
    },
    seq7: {
      onEnter: function (cfg, ctx) {
        applyStepFromConfig(cfg, ctx.snap, ctx.camSun);
        setTimeMs(noon(ctx.Y0 + 4, 0, 1).getTime());
        addDemoEventsIfEnabled([
          demoEvent('intro-spring-' + ctx.Y0, 'Spring Semester', ctx.Y0 + 4, 0, 15, ctx.Y0 + 4, 4, 15),
          demoEvent('intro-game-' + ctx.Y0, 'Sports game', ctx.Y0 + 4, 2, 5, ctx.Y0 + 4, 2, 5),
          demoEvent('intro-doc-' + ctx.Y0, 'Doctor appointment', ctx.Y0 + 4, 3, 2, ctx.Y0 + 4, 3, 2),
          demoEvent('intro-trip-' + ctx.Y0, 'Family trip', ctx.Y0 + 4, 5, 10, ctx.Y0 + 4, 5, 17)
        ]);
      },
      onFrame: function (u, wallU, cfg, ctx) {
        setStoryFrame(
          lerp(noon(ctx.Y0 + 4, 0, 1).getTime(), noon(ctx.Y0 + 4, 11, 31).getTime(), easeOutCubic(u))
        );
        if (u < 0.92) {
          var wobble = 0.04 * Math.sin(u * Math.PI * 2);
          applyScene({
            tourCameraOnly: true,
            cameraRotation: {
              x: ctx.camSun.x + wobble,
              y: ctx.camSun.y + 0.03 * Math.cos(u * Math.PI * 2)
            }
          });
        }
      }
    }
  };

  function buildSteps(Y0, snap) {
    var doc =
      tourCfg && typeof tourCfg.getEffectiveDocument === 'function'
        ? tourCfg.getEffectiveDocument()
        : { steps: [] };
    if (!doc.steps || !doc.steps.length) {
      doc = tourCfg.buildDefaultTourDocument();
    }
    return wrapStepHandlers(Y0, snap, STEP_MOTION, doc);
  }

  /** @deprecated use buildSteps */
  function buildDefaultSteps(Y0, snap) {
    return buildSteps(Y0, snap);
  }

  function drawSpeedCurveCanvas(canvas, timing, wallPlayhead) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, 0, w, h);
    var samples = w;
    var maxSp = 0.01;
    var speeds = [];
    for (var i = 0; i <= samples; i++) {
      var sp = speedAtWall(i / samples, timing);
      speeds.push(sp);
      if (sp > maxSp) maxSp = sp;
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.lineTo(w, h * 0.72);
    ctx.stroke();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j <= samples; j++) {
      var x = (j / samples) * w;
      var y = h - (speeds[j] / maxSp) * (h - 8) - 4;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (typeof wallPlayhead === 'number') {
      var px = Math.max(0, Math.min(1, wallPlayhead)) * w;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }

  function createTourEditorPanel(steps, api) {
    var panel = document.createElement('div');
    panel.className = 'circaevum-intro-tour-editor';
    panel.hidden = true;

    var doc =
      tourCfg && typeof tourCfg.getEffectiveDocument === 'function'
        ? tourCfg.cloneJson(tourCfg.getEffectiveDocument())
        : { steps: [] };

    function syncDocFromSteps() {
      doc.steps = steps.map(function (s) {
        return tourCfg.cloneJson(s.config);
      });
    }

    function persistAndReload(previewStepIdx) {
      if (tourCfg && typeof tourCfg.saveOverrides === 'function') {
        tourCfg.saveOverrides({ version: 1, steps: doc.steps });
      }
      api.reloadFromConfig(typeof previewStepIdx === 'number' ? previewStepIdx : editorStepIndex);
    }

    function readWorldlineRevealFromStep(step) {
      var p = step.layers && step.layers.tourWorldlineRevealProgress;
      if (p == null) return { mode: '', fixedPct: 50 };
      if (p === 0) return { mode: 'grow', fixedPct: 50 };
      if (typeof p === 'number') {
        return { mode: 'fixed', fixedPct: Math.round(Math.max(0, Math.min(1, p)) * 100) };
      }
      return { mode: '', fixedPct: 50 };
    }

    function writeWorldlineRevealToStep(step, mode, fixedPct) {
      if (mode === 'grow') {
        step.layers.tourWorldlineRevealProgress = 0;
        step.layers.tourMinimalOrbitMode = false;
      } else if (mode === 'fixed') {
        step.layers.tourWorldlineRevealProgress = Math.max(0, Math.min(1, fixedPct / 100));
        step.layers.tourMinimalOrbitMode = false;
      } else {
        step.layers.tourWorldlineRevealProgress = null;
      }
    }

    function renderStepEditor(idx) {
      editorStepIndex = idx;
      var step = doc.steps[idx];
      if (!step) return;
      step.timing = normalizeTiming(step.timing);
      step.layers = step.layers || {};

      panel.innerHTML =
        '<div class="circaevum-intro-tour-editor-head">' +
        '<label class="circaevum-intro-tour-editor-steppick">' +
        'Segment <select id="tour-editor-step-select"></select></label>' +
        '<input type="text" id="tour-editor-label" class="circaevum-intro-tour-editor-label" value="' +
        String(step.label || '').replace(/"/g, '&quot;') +
        '" />' +
        '</div>' +
        '<div class="circaevum-intro-tour-editor-grid">' +
        '<fieldset class="circaevum-intro-tour-editor-fieldset"><legend>Layers in this segment</legend>' +
        '<div id="tour-editor-layers" class="circaevum-intro-tour-editor-layers"></div>' +
        '<label class="circaevum-intro-tour-editor-row">Worldline reveal ' +
        '<select id="tour-editor-wl">' +
        '<option value="">Off</option>' +
        '<option value="grow">Grow with segment</option>' +
        '<option value="fixed">Fixed amount</option>' +
        '</select></label>' +
        '<label class="circaevum-intro-tour-editor-row" id="tour-editor-wl-fixed-row" hidden>' +
        'Reveal amount ' +
        '<input type="range" id="tour-editor-wl-fixed" min="0" max="100" step="1" />' +
        '<span id="tour-editor-wl-fixed-val"></span></label>' +
        '<label class="circaevum-intro-tour-editor-row">Marker density ' +
        '<select id="tour-editor-density"></select></label>' +
        '<label class="circaevum-intro-tour-editor-row">Focus ' +
        '<select id="tour-editor-focus"></select></label>' +
        '<label class="circaevum-intro-tour-editor-row">Zoom ' +
        '<input type="number" id="tour-editor-zoom" min="0" max="9" step="1" /></label>' +
        '</fieldset>' +
        '<fieldset class="circaevum-intro-tour-editor-fieldset"><legend>3D visuals</legend>' +
        '<div id="tour-editor-visuals" class="circaevum-intro-tour-editor-visuals"></div>' +
        '</fieldset>' +
        '<fieldset class="circaevum-intro-tour-editor-fieldset"><legend>Camera</legend>' +
        '<label class="circaevum-intro-tour-editor-row circaevum-intro-tour-inclination-row">' +
        'Inclination <span class="circaevum-intro-tour-inclination-scale">Below</span>' +
        '<input type="range" id="tour-editor-pitch" min="-90" max="90" step="1" />' +
        '<span class="circaevum-intro-tour-inclination-scale">Above</span>' +
        '<span id="tour-editor-pitch-val" class="circaevum-intro-tour-inclination-readout"></span></label>' +
        '<div id="tour-editor-inclination-presets" class="circaevum-intro-tour-inclination-presets"></div>' +
        '</fieldset>' +
        '<fieldset class="circaevum-intro-tour-editor-fieldset"><legend>Speed envelope (clip editor)</legend>' +
        '<label class="circaevum-intro-tour-editor-row">Duration (sec) ' +
        '<input type="range" id="tour-editor-duration" min="4" max="60" step="1" />' +
        '<span id="tour-editor-duration-val"></span></label>' +
        '<label class="circaevum-intro-tour-editor-row">Baseline speed ' +
        '<input type="range" id="tour-editor-baseline" min="25" max="250" step="5" />' +
        '<span id="tour-editor-baseline-val"></span></label>' +
        '<label class="circaevum-intro-tour-editor-row">Transition in ' +
        '<input type="range" id="tour-editor-tin" min="0" max="30" step="1" />' +
        '<span id="tour-editor-tin-val"></span></label>' +
        '<label class="circaevum-intro-tour-editor-row">Transition out ' +
        '<input type="range" id="tour-editor-tout" min="0" max="30" step="1" />' +
        '<span id="tour-editor-tout-val"></span></label>' +
        '<label class="circaevum-intro-tour-editor-row">Transition slowdown ' +
        '<input type="range" id="tour-editor-tslow" min="5" max="100" step="5" />' +
        '<span id="tour-editor-tslow-val"></span></label>' +
        '<canvas id="tour-editor-speed-canvas" class="circaevum-intro-tour-speed-canvas" width="640" height="56"></canvas>' +
        '<p class="circaevum-intro-tour-editor-hint">Cyan = speed along segment. Gold line = playhead. Low baseline + transition tails = slow dissolve between beats.</p>' +
        '</fieldset></div>' +
        '<div class="circaevum-intro-tour-editor-actions">' +
        '<button type="button" class="strip-btn" id="tour-editor-save">Apply segment</button>' +
        '<button type="button" class="strip-btn" id="tour-editor-reset">Reset all to defaults</button>' +
        '<button type="button" class="strip-btn" id="tour-editor-export">Export JSON</button>' +
        '</div>';

      var sel = panel.querySelector('#tour-editor-step-select');
      doc.steps.forEach(function (s, i) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = s.label || s.id;
        if (i === idx) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = function () {
        renderStepEditor(parseInt(sel.value, 10));
      };

      var layersEl = panel.querySelector('#tour-editor-layers');
      (tourCfg.LAYER_DEFS || []).forEach(function (def) {
        var id = 'tour-layer-' + def.key;
        var lab = document.createElement('label');
        lab.className = 'circaevum-intro-tour-editor-check';
        lab.innerHTML =
          '<input type="checkbox" id="' +
          id +
          '" data-layer="' +
          def.key +
          '" /> ' +
          def.label;
        lab.title = def.hint || '';
        layersEl.appendChild(lab);
        var cb = lab.querySelector('input');
        cb.checked = !!step.layers[def.key];
        if (def.key === 'moonLayer' && step.layers.moonLayer === 'inherit') cb.indeterminate = true;
      });

      var visualsEl = panel.querySelector('#tour-editor-visuals');
      (tourCfg.VISUAL_ADJUSTER_DEFS || []).forEach(function (def) {
        if (def.type === 'checkbox') {
          var clab = document.createElement('label');
          clab.className = 'circaevum-intro-tour-editor-check';
          clab.title = def.hint || '';
          var checked = step.layers[def.key] === true;
          clab.innerHTML =
            '<input type="checkbox" id="tour-visual-' +
            def.key +
            '" data-visual="' +
            def.key +
            '" /> ' +
            def.label;
          visualsEl.appendChild(clab);
          clab.querySelector('input').checked = checked;
          return;
        }
        var raw = step.layers[def.key];
        var pct = typeof raw === 'number' && !isNaN(raw) ? Math.round(Math.max(0, Math.min(1, raw)) * 100) : 100;
        var row = document.createElement('label');
        row.className = 'circaevum-intro-tour-editor-row';
        row.title = def.hint || '';
        row.innerHTML =
          def.label +
          ' <input type="range" id="tour-visual-' +
          def.key +
          '" data-visual="' +
          def.key +
          '" min="0" max="100" step="1" value="' +
          pct +
          '" />' +
          '<span id="tour-visual-val-' +
          def.key +
          '">' +
          pct +
          '%</span>';
        visualsEl.appendChild(row);
      });

      var pitchRad =
        typeof step.layers.tourCameraPitch === 'number'
          ? step.layers.tourCameraPitch
          : defaultTourCameraPitch();
      var pitchDeg = pitchRadToDeg(pitchRad);
      var pitchIn = panel.querySelector('#tour-editor-pitch');
      var pitchVal = panel.querySelector('#tour-editor-pitch-val');
      pitchIn.value = String(pitchDeg);
      function refreshPitchReadout() {
        var deg = parseInt(pitchIn.value, 10);
        if (pitchVal) {
          pitchVal.textContent = deg + '° · ' + inclinationLabelFromDeg(deg);
        }
      }
      refreshPitchReadout();

      var presetsEl = panel.querySelector('#tour-editor-inclination-presets');
      (tourCfg.INCLINATION_PRESETS || []).forEach(function (preset) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strip-btn circaevum-intro-tour-inclination-preset';
        btn.textContent = preset.label;
        btn.title = preset.deg + '°';
        btn.onclick = function () {
          pitchIn.value = String(preset.deg);
          refreshPitchReadout();
          previewTourCamera(preset.deg, step.layers.tourCameraYaw);
        };
        presetsEl.appendChild(btn);
      });

      pitchIn.addEventListener('input', function () {
        refreshPitchReadout();
        previewTourCamera(parseInt(pitchIn.value, 10), step.layers.tourCameraYaw);
      });

      var densitySel = panel.querySelector('#tour-editor-density');
      var wlSel = panel.querySelector('#tour-editor-wl');
      var wlFixedRow = panel.querySelector('#tour-editor-wl-fixed-row');
      var wlFixed = panel.querySelector('#tour-editor-wl-fixed');
      var wlFixedVal = panel.querySelector('#tour-editor-wl-fixed-val');
      var wlState = readWorldlineRevealFromStep(step);
      wlSel.value = wlState.mode;
      wlFixed.value = String(wlState.fixedPct);
      if (wlFixedVal) wlFixedVal.textContent = wlState.fixedPct + '%';
      if (wlFixedRow) wlFixedRow.hidden = wlState.mode !== 'fixed';

      function refreshWorldlineUi() {
        if (wlFixedRow) wlFixedRow.hidden = wlSel.value !== 'fixed';
        if (wlFixedVal && wlFixed) wlFixedVal.textContent = wlFixed.value + '%';
      }

      function previewWorldlineFromEditor() {
        var mode = wlSel.value;
        if (mode === '') {
          applyScene({ tourWorldlineRevealProgress: null });
          return;
        }
        var previewU =
          typeof api.getPreviewWallU === 'function' ? api.getPreviewWallU(editorStepIndex) : 0.5;
        var fixedPct = wlFixed ? parseInt(wlFixed.value, 10) : 50;
        if (mode === 'grow') {
          applyScene({ tourMinimalOrbitMode: false, tourWorldlineRevealProgress: 0 });
          syncWorldlineRevealFromConfig(
            { layers: { tourWorldlineRevealProgress: 0, tourMinimalOrbitMode: false } },
            previewU,
            previewU
          );
        } else {
          applyScene({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: Math.max(0, Math.min(1, fixedPct / 100))
          });
        }
      }

      wlSel.onchange = function () {
        refreshWorldlineUi();
        previewWorldlineFromEditor();
      };
      if (wlFixed) {
        wlFixed.addEventListener('input', function () {
          refreshWorldlineUi();
          if (wlSel.value === 'fixed') previewWorldlineFromEditor();
        });
      }
      (tourCfg.MARKER_DENSITY_OPTIONS || []).forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if ((step.layers.tourMarkerDensityOverride || '') === opt.value) o.selected = true;
        densitySel.appendChild(o);
      });

      var focusSel = panel.querySelector('#tour-editor-focus');
      (tourCfg.FOCUS_OPTIONS || []).forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if ((step.layers.focusTarget || 'sun') === opt.value) o.selected = true;
        focusSel.appendChild(o);
      });

      var zoomIn = panel.querySelector('#tour-editor-zoom');
      zoomIn.value = String(step.zoomLevel != null ? step.zoomLevel : 3);

      var dur = panel.querySelector('#tour-editor-duration');
      dur.value = String(Math.round(step.timing.durationMs / 1000));
      panel.querySelector('#tour-editor-duration-val').textContent = dur.value + 's';

      var base = panel.querySelector('#tour-editor-baseline');
      base.value = String(Math.round(step.timing.baselineSpeed * 100));
      panel.querySelector('#tour-editor-baseline-val').textContent = (step.timing.baselineSpeed).toFixed(2) + '×';

      var tin = panel.querySelector('#tour-editor-tin');
      tin.value = String(Math.round(step.timing.transitionInPct * 100));
      panel.querySelector('#tour-editor-tin-val').textContent = tin.value + '%';

      var tout = panel.querySelector('#tour-editor-tout');
      tout.value = String(Math.round(step.timing.transitionOutPct * 100));
      panel.querySelector('#tour-editor-tout-val').textContent = tout.value + '%';

      var tslow = panel.querySelector('#tour-editor-tslow');
      tslow.value = String(Math.round(step.timing.transitionSlowdown * 100));
      panel.querySelector('#tour-editor-tslow-val').textContent = tslow.value + '%';

      var canvas = panel.querySelector('#tour-editor-speed-canvas');
      function refreshCanvas(playhead) {
        drawSpeedCurveCanvas(canvas, step.timing, playhead);
      }
      refreshCanvas(api.getWallProgressForStep(idx));

      function onTimingInput() {
        step.timing.durationMs = parseInt(dur.value, 10) * 1000;
        step.timing.baselineSpeed = parseInt(base.value, 10) / 100;
        step.timing.transitionInPct = parseInt(tin.value, 10) / 100;
        step.timing.transitionOutPct = parseInt(tout.value, 10) / 100;
        step.timing.transitionSlowdown = parseInt(tslow.value, 10) / 100;
        panel.querySelector('#tour-editor-duration-val').textContent = dur.value + 's';
        panel.querySelector('#tour-editor-baseline-val').textContent = step.timing.baselineSpeed.toFixed(2) + '×';
        panel.querySelector('#tour-editor-tin-val').textContent = tin.value + '%';
        panel.querySelector('#tour-editor-tout-val').textContent = tout.value + '%';
        panel.querySelector('#tour-editor-tslow-val').textContent = tslow.value + '%';
        refreshCanvas(api.getWallProgressForStep(idx));
      }
      [dur, base, tin, tout, tslow].forEach(function (el) {
        el.addEventListener('input', onTimingInput);
      });

      (tourCfg.VISUAL_ADJUSTER_DEFS || []).forEach(function (def) {
        var el = panel.querySelector('#tour-visual-' + def.key);
        if (!el || def.type === 'checkbox') return;
        var valEl = panel.querySelector('#tour-visual-val-' + def.key);
        el.addEventListener('input', function () {
          if (valEl) valEl.textContent = el.value + '%';
        });
      });

      panel.querySelector('#tour-editor-save').onclick = function () {
        step.label = panel.querySelector('#tour-editor-label').value;
        step.zoomLevel = parseInt(zoomIn.value, 10);
        step.layers.tourMarkerDensityOverride = densitySel.value || null;
        writeWorldlineRevealToStep(
          step,
          wlSel.value,
          wlFixed ? parseInt(wlFixed.value, 10) : 50
        );
        step.layers.focusTarget = focusSel.value || 'sun';
        step.layers.tourCameraPitch = pitchDegToRad(parseInt(pitchIn.value, 10));
        (tourCfg.LAYER_DEFS || []).forEach(function (def) {
          var cb = panel.querySelector('#tour-layer-' + def.key);
          if (cb) step.layers[def.key] = cb.indeterminate ? 'inherit' : cb.checked;
        });
        (tourCfg.VISUAL_ADJUSTER_DEFS || []).forEach(function (def) {
          var el = panel.querySelector('#tour-visual-' + def.key);
          if (!el) return;
          if (def.type === 'checkbox') {
            step.layers[def.key] = el.checked;
          } else {
            step.layers[def.key] = parseInt(el.value, 10) / 100;
          }
        });
        onTimingInput();
        persistAndReload(editorStepIndex);
      };

      panel.querySelector('#tour-editor-reset').onclick = function () {
        if (tourCfg && typeof tourCfg.clearSavedOverrides === 'function') tourCfg.clearSavedOverrides();
        persistAndReload();
        renderStepEditor(0);
      };

      panel.querySelector('#tour-editor-export').onclick = function () {
        syncDocFromSteps();
        var blob = new Blob([JSON.stringify({ version: 1, steps: doc.steps }, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'circaevum-tour-config.json';
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }

    renderStepEditor(0);

    return {
      root: panel,
      syncDoc: function (stepList) {
        doc.steps = stepList.map(function (s) {
          return tourCfg.cloneJson(s.config);
        });
      },
      renderCurrent: function (idx) {
        renderStepEditor(idx);
      },
      toggle: function (open) {
        editorOpen = open;
        panel.hidden = !open;
        applyTourEditorLayout(open);
        if (editorDockResize) editorDockResize.setVisible(open);
        if (open) {
          renderStepEditor(editorStepIndex);
        }
      },
      refreshPlayhead: function (stepIdx, wallU) {
        if (panel.hidden) return;
        var canvas = panel.querySelector('#tour-editor-speed-canvas');
        var step = doc.steps[stepIdx];
        if (canvas && step) drawSpeedCurveCanvas(canvas, step.timing, wallU);
      }
    };
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
      '<button type="button" class="circaevum-intro-tour-edit strip-btn" id="circaevum-intro-tour-edit" title="Timeline editor — layers & speed per segment">Edit</button>' +
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

    var stepIndex = 0;
    var stepLocalMs = 0;
    var playing = true;
    var steps = buildSteps(tourYear, initialSnapshot);
    var totalMs = steps.reduce(function (a, s) {
      return a + s.durationMs;
    }, 0);
    var lastNow = performance.now();
    var editorPanel = null;

    function recomputeTotal() {
      totalMs = steps.reduce(function (a, s) {
        return a + s.durationMs;
      }, 0);
    }

    hostEl = document.createElement('div');
    hostEl.className = 'circaevum-intro-tour-bar';
    if (editorOpen || (typeof location !== 'undefined' && /(?:^|[?&])tourEdit=1(?:&|$)/.test(location.search))) {
      hostEl.classList.add('is-editor-open');
    }
    document.body.appendChild(hostEl);

    function totalElapsedMs() {
      var acc = 0;
      for (var i = 0; i < stepIndex; i++) acc += steps[i].durationMs;
      return acc + stepLocalMs;
    }

    function fractionGlobal() {
      return totalMs > 0 ? Math.min(1, totalElapsedMs() / totalMs) : 0;
    }

    function wallProgressCurrentStep() {
      var st = steps[stepIndex];
      return st && st.durationMs > 0 ? Math.min(1, stepLocalMs / st.durationMs) : 0;
    }

    function syncUi(ui) {
      var st = steps[stepIndex];
      ui.setTitle((st && st.label) || 'Intro');
      ui.setPlayLabel(playing);
      ui.setProgress(fractionGlobal());
      ui.setStepHighlight(stepIndex);
      if (editorPanel) editorPanel.refreshPlayhead(stepIndex, wallProgressCurrentStep());
    }

    function previewStepAt(j, wallU, ui) {
      if (j < 0 || j >= steps.length) return;
      wallU = Math.max(0, Math.min(1, wallU));
      if (typeof window.restoreCircaevumTourSnapshot === 'function' && initialSnapshot) {
        window.restoreCircaevumTourSnapshot(initialSnapshot);
      }
      for (var k = 0; k < j; k++) {
        var sk = steps[k];
        if (sk.onEnter) sk.onEnter();
        if (sk.onFrame) sk.onFrame(1);
      }
      stepIndex = j;
      stepLocalMs = steps[j].durationMs * wallU;
      if (steps[j].onEnter) steps[j].onEnter();
      if (steps[j].onFrame) steps[j].onFrame(wallU);
      syncUi(ui);
    }

    function seekToStep(j, ui) {
      previewStepAt(j, 0, ui);
    }

    var uiApi = {
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
      reloadFromConfig: function (previewStepIdx) {
        if (!run) return;
        var wasPlaying = playing;
        var targetIdx =
          typeof previewStepIdx === 'number' && previewStepIdx >= 0 ? previewStepIdx : stepIndex;
        var previewU = targetIdx === stepIndex ? wallProgressCurrentStep() : 0.5;
        var reloaded = buildSteps(tourYear, initialSnapshot);
        steps.length = 0;
        reloaded.forEach(function (s) {
          steps.push(s);
        });
        recomputeTotal();
        previewStepAt(targetIdx, previewU, ui);
        playing = wasPlaying;
        syncUi(ui);
      },
      getWallProgressForStep: function (idx) {
        if (idx === stepIndex) return wallProgressCurrentStep();
        if (idx < stepIndex) return 1;
        return 0;
      },
      getPreviewWallU: function (idx) {
        if (idx === stepIndex) return wallProgressCurrentStep();
        return 0.5;
      },
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
      endTour: function (completed) {
        stop(completed);
      }
    };

    var ui = createTourUi(steps, uiApi);

    run = {
      onComplete: onComplete,
      initialSnapshot: initialSnapshot,
      showDemoEventsForStep: true
    };

    hostEl.appendChild(ui.root);

    editorPanel = createTourEditorPanel(steps, {
      reloadFromConfig: function () {
        uiApi.reloadFromConfig();
        if (editorPanel && typeof editorPanel.syncDoc === 'function') editorPanel.syncDoc(steps);
        if (editorPanel && typeof editorPanel.renderCurrent === 'function') {
          editorPanel.renderCurrent(editorStepIndex);
        }
      },
      getWallProgressForStep: function (idx) {
        return uiApi.getWallProgressForStep(idx);
      },
      getPreviewWallU: function (idx) {
        return uiApi.getPreviewWallU(idx);
      }
    });
    hostEl.appendChild(editorPanel.root);
    editorDockResize = createEditorDockResize(hostEl);

    var editBtn = ui.root.querySelector('#circaevum-intro-tour-edit');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        editorOpen = !editorOpen;
        hostEl.classList.toggle('is-editor-open', editorOpen);
        editorPanel.toggle(editorOpen);
      });
    }
    if (editorOpen || (typeof location !== 'undefined' && /(?:^|[?&])tourEdit=1(?:&|$)/.test(location.search))) {
      editorOpen = true;
      editorPanel.toggle(true);
    }

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
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('is-tour-editor-open');
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.removeProperty('--tour-editor-dock-width');
    }
    if (editorDockResize) editorDockResize.setVisible(false);
    scheduleViewportRestore();
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
