/**
 * Event Renderer - Renders VEVENTs as EventObjects in the 3D scene
 *
 * Creates basic Three.js meshes (markers or short worldlines) for events,
 * so the Circaevum GL API can display event data from layers (e.g. account-managed React).
 *
 * EventObject: a Three.js object with userData.vevent, userData.layerId, userData.type === 'EventObject'
 *
 * Dependencies (globals): THREE, calculateDateHeight, calculateCurrentDateHeight, SceneGeometry
 * Optional: PLANET_DATA (Earth distance), or use default radius 50
 */

(function (global) {
  const EARTH_RADIUS = 50;
  // Radius bounds: keep events outside the time-marker text zone (day names, week labels, etc.)
  // so event fill doesn't sit under markers and render as outline-only. Time markers use
  // day.outer = 3/4; we start events just outside that (25/32) for a clear gap.
  const EVENT_RADIUS_INNER_FRACTION = 25 / 32;  // ~0.78 — clear of day.outer (3/4)
  const EVENT_RADIUS_OUTER_FRACTION = 58 / 64; // outer bound toward Earth
  const EVENT_LINE_RADIUS_FRACTION = 55 / 64;
  const EVENT_LINE_LABEL_RADIUS_OFFSET = 2; // Labels this much farther out than the arc
  /** Match TimeMarkers day band: numbers just inside dots; spheres tight inside edge; names near outer. */
  const DAY_INNER_FRAC = 5 / 8;
  const DAY_OUTER_FRAC = 3 / 4;
  const DAY_SPHERE_T = 0.05;
  const DAY_NUMBER_T = 0.02;
  const DAY_NAME_T = 0.88;
  const DAY_NUMBER_RADIUS_FRAC = DAY_INNER_FRAC + (DAY_OUTER_FRAC - DAY_INNER_FRAC) * DAY_NUMBER_T;
  const DAY_NAME_RADIUS_FRAC = DAY_INNER_FRAC + (DAY_OUTER_FRAC - DAY_INNER_FRAC) * DAY_NAME_T;
  const DAY_EVENT_DOT_RADIUS_FRAC = DAY_INNER_FRAC + (DAY_OUTER_FRAC - DAY_INNER_FRAC) * DAY_SPHERE_T;
  /**
   * LineBasicMaterial.linewidth is ignored in WebGL on most platforms; ribbon outlines use mesh tubes instead.
   * Radius = earthDist * FRAC * (outline emphasis); ~0.005 reads clearly at Earth orbit scale (~50).
   */
  const RIBBON_OUTLINE_TUBE_RADIUS_FRAC = 0.0003;

  /**
   * Adaptive tube level-of-detail. Each duration event builds two TubeGeometry
   * outlines (inner+outer); with "all events" on, a zoom hop rebuilds hundreds of
   * them and the TubeGeometry/Frenet-frame work (three.js `mn`/`Ro`) dominates the
   * frame. Below the budget, quality stays at 1 (no visible change). Above it,
   * tube segment counts fall off so total geometry work stays roughly bounded.
   */
  /** Start degrading tube segments earlier — Frenet work dominates lag before verts do. */
  const EVENT_TUBE_BUDGET = 48;
  const EVENT_TUBE_QUALITY_FLOOR = 0.34;
  /**
   * When adaptive quality drops below this, prefer THREE.Line over low-seg TubeGeometry.
   * Skinny tubes still pay CatmullRom+Frenet; lines do not.
   */
  const EVENT_OUTLINE_PREFER_LINE_QUALITY = 0.55;
  let _eventTubeQualityScale = 1;

  /**
   * Temporal distance LOD: events whose time is far from SELECTED TIME draw their
   * outlines as cheap THREE.Line polylines instead of TubeGeometry (which runs
   * expensive Frenet-frame math — the `mn`/`Ro` hotspot). Far events are already
   * desaturated/de-emphasized, so a thin line reads fine. Threshold = this many
   * "in-focus half spans" (zoom-aware) away from selected time. Set to 0/Infinity
   * to disable. `_eventOutlineLineMode` is set per event before its tubes build.
   *
   * Prefer Line / ribbon fill / flat borders over tubes wherever fidelity allows
   * (see MeshPrimitives.COST). Day-frame LTE borders already use flat Lines.
   */
  const EVENT_LINE_LOD_FAR_FACTOR = 2;
  let _eventOutlineLineMode = false;
  function computeEventTubeQualityScale(eventCount) {
    const n = Math.max(1, eventCount | 0);
    if (n <= EVENT_TUBE_BUDGET) return 1;
    const s = Math.sqrt(EVENT_TUBE_BUDGET / n);
    return Math.max(EVENT_TUBE_QUALITY_FLOOR, Math.min(1, s));
  }

  /**
   * Per-zoom event geometry budget. When a layer's event count exceeds the budget
   * at the current zoom, events are priority-sorted and only the top N are rendered
   * as full geometry. A count indicator arc is appended for the overflow.
   *
   * Rationale: at wide zooms (Century/Decade) individual markers are sub-pixel and
   * serve no informational purpose — TubeGeometry / Frenet-frame work still runs
   * for each one. The budget caps geometry count per zoom tier.
   *
   * Priority order within a layer: duration (longer first), then recency (later first).
   */
  const DENSITY_BUDGET = {
    0: 120,   // MOMENT (hour) — clock zoom; limited visible time window
    1: 20,    // CENTURY — 100 years; individual dots sub-pixel
    2: 40,    // DECADE — 10 years
    3: 300,   // YEAR — raised; calendar + timeseries years can run deep
    4: 300,   // QUARTER
    5: 120,   // MONTH — day-frame LTE dailies across ±month (was 800→300, now 120 = one month)
    6: 120,   // LUNAR — same month of day-frame dailies as zoom 5 (was 800→300)
    7: 80,    // WEEK — parent week + 1 adjacent (was 800→200, now 80)
    8: 700,   // DAY — month-range dailies + selected week
    9: 120,   // CLOCK — polar day disk
  };

  /**
   * Return the budget for the given zoom level (default 100 for unknown zooms).
   */
  function getEventDensityBudget(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
    return DENSITY_BUDGET[z] ?? 100;
  }

  /**
   * Score an event for priority rendering. Higher = more important to show as geometry.
   * Uses log₂-duration so a 1h meeting is not systematically crowded out by a 30-day trip
   * (previously a linear scale gave trips a 720× advantage over 1h events, which caused
   * short-term events to be cut first whenever the density budget was hit).
   */
  function scoreEventPriority(event) {
    const zl = getZoomLevelForEvents();
    const start = getEventStart(event);
    const end = getEventEnd(event);
    const durationMs = (end && start) ? Math.max(0, end.getTime() - start.getTime()) : 0;
    const recencyScore = start ? start.getTime() / 1e12 : 0;
    const durationDays = durationMs / 86400000;
    // log₂ compresses the range: 1h→0.06, 8h→0.41, 1d→1.0, 7d→3.0, 30d→4.95
    const durationScore = durationDays > 0 ? Math.log2(1 + durationDays) : 0;
    // At circadian helix zooms, short events render as ribbons — boost them so they survive
    // budget cuts over long-duration LTEs. At Day Sky (zoom 8), STEs are the primary content
    // so they get a stronger boost to beat multi-day LTEs in priority scoring.
    const steBoostMag = (zl === 8 || zl === 9 || zl === 0) ? 5.0 : 1.5;
    const steBoost = (durationDays < 1 && isCircadianHelixZoom(zl)) ? steBoostMag : 0;
    // Day-frame LTE dailies outside selected week still need budget priority (cheap low-poly).
    const dayFrameLteBoost =
      durationDays < 2 && shouldRenderDayFrameSubDayOnAnnualHelix() ? 2.2 : 0;
    return durationScore + recencyScore + steBoost + dayFrameLteBoost;
  }

  /**
   * Build a simple arc + count sprite indicating N overflow events at the layer's radius.
   * Returns a THREE.Group or null.
  function createEventMaterial(THREE_REF, MatClass, options) {
    const T = THREE_REF || (typeof global !== 'undefined' && global.THREE) || (typeof window !== 'undefined' && window.THREE) || null;
    if (!T) return null;
    const Mat = MatClass || T.MeshBasicMaterial;
    if (typeof window !== 'undefined' && window.MeshPrimitives && typeof window.MeshPrimitives.createNodeCompatibleMaterial === 'function') {
      return window.MeshPrimitives.createNodeCompatibleMaterial(T, Mat, options);
    }
    return new Mat(options);
  }

  /**
   * Create an indicator geometry when event density exceeds budget.
   */
  function createOverflowIndicatorArc(overflowCount, earthDist, layerConfig) {
    if (!THREE || overflowCount <= 0) return null;
    try {
      const r = earthDist * EVENT_RADIUS_INNER_FRACTION;
      const arc = new THREE.RingGeometry(r * 0.995, r * 1.005, 64, 1, 0, Math.PI * 0.25);
      const mat = createEventMaterial(THREE, THREE.MeshBasicMaterial, {
        color: 0xffd060,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(arc, mat);
      mesh.userData.type = 'OverflowIndicator';
      mesh.userData.overflowCount = overflowCount;

      const group = new THREE.Group();
      group.userData.type = 'OverflowIndicator';
      group.userData.__layerId = layerConfig.layerId;
      group.add(mesh);
      return group;
    } catch (_) {
      return null;
    }
  }

  /**
   * Event-marker shapes (sphere + its edges, or disk circle/ring) are identical
   * per shape — only position/scale/color differ. Building SphereGeometry +
   * EdgesGeometry per marker is the `Ga` hotspot. Build each unit geometry once,
   * flag it __sharedCached, and reuse it (mesh is scaled by radius). Disposal in
   * _removeLayerObjects / disposeOutlineNode skips flagged geometries so they
   * persist across rebuilds.
   */
  const _sharedMarkerGeoCache = new Map();
  function getSharedMarkerGeometry(key, build) {
    let g = _sharedMarkerGeoCache.get(key);
    if (!g) {
      g = build();
      if (g) {
        g.userData = g.userData || {};
        g.userData.__sharedCached = true;
      }
      _sharedMarkerGeoCache.set(key, g);
    }
    return g;
  }

  /** Multi-day ribbon fills at or above this span use a radial alpha gradient (opaque at Sun-ward inner edge, fading toward outer). */
  const LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS = 1;
  /** Outer-edge fill alpha = fillOpacity × this (inner edge uses full fillOpacity). Outlines are unchanged. */
  const LONG_EVENT_RIBBON_OUTER_FILL_ALPHA_RATIO = 0.1;
  /** In alpha-fade mode, out-of-window long-term fills reduce inner alpha more than outer (but never disappear). */
  const LONG_EVENT_CONTEXT_INNER_ALPHA_MIN = 0.28;
  const LONG_EVENT_CONTEXT_OUTER_ALPHA_MIN = 0.18;

  function longEventRibbonUsesRadialFillGradient(durationDays) {
    return durationDays >= LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS;
  }

  function getLongEventContextFadeMode() {
    if (typeof global.getLongEventContextFadeMode === 'function') {
      const mode = String(global.getLongEventContextFadeMode() || '').toLowerCase();
      if (mode === 'alpha') return 'alpha';
      if (mode === 'desaturate') return 'desaturate';
    }
    return 'desaturate';
  }

  /**
   * @param {number} fillHex
   * @param {number} fillOpacity - same combined opacity as MeshBasicMaterial (capped)
   * @param {object} THREE - global THREE
   */
  function createLongTermRibbonFillShaderMaterial(fillHex, fillOpacity, THREE, innerScale, outerScale) {
    const inScale = innerScale != null ? innerScale : 1;
    const outScale = outerScale != null ? outerScale : 1;
    const innerA = Math.min(1, Math.max(0, fillOpacity * inScale));
    const outerA = Math.min(1, Math.max(0, fillOpacity * LONG_EVENT_RIBBON_OUTER_FILL_ALPHA_RATIO * outScale));
    return new THREE.ShaderMaterial({
      uniforms: {
        diffuse: { value: new THREE.Color(fillHex) },
        innerAlpha: { value: innerA },
        outerAlpha: { value: outerA }
      },
      vertexShader: [
        'attribute float ribbonEdge;',
        'varying float vRibbonEdge;',
        'void main() {',
        '  vRibbonEdge = ribbonEdge;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 diffuse;',
        'uniform float innerAlpha;',
        'uniform float outerAlpha;',
        'varying float vRibbonEdge;',
        'void main() {',
        '  float a = mix(innerAlpha, outerAlpha, vRibbonEdge);',
        '  gl_FragColor = vec4(diffuse, a);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1
    });
  }

  function getZoomLevelForEvents() {
    if (typeof global.getCurrentZoomLevel === 'function') return global.getCurrentZoomLevel();
    return 5;
  }

  /** Multi-day / ≥24h spans always keep filled ribbons (auto mode only affects sub-day events). */
  function isLongTermEventSpanForPlotType(start, end) {
    if (!start || isNaN(start.getTime())) return false;
    let endUse = end;
    if (!endUse || !(endUse > start)) endUse = new Date(start.getTime() + 3600000);
    return durationHoursBetween(start, endUse) >= 24;
  }

  /**
   * Nesting resolver candidate: sub-day + single all-day (<2 calendar days).
   * Same VEVENT may resolve as STE (Frame B / day-pitch) or LTE (Frame A manifold) by
   * viewer scale + Selected Time Frame — coords stay (theta1, theta2, z). See COORDINATES.md.
   * Multi-day stays LTE. Differs from {@link isLongTermEventSpanForPlotType} so 24h all-day
   * can still use STE geometry inside the Context Arc window.
   */
  function isSteStyleDailySpan(start, end) {
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return durationDaysBetween(start, evEnd) < 2;
  }

  function isEventInSelectedYear(start, end) {
    if (!start || isNaN(start.getTime())) return false;
    const zl = getZoomLevelForEvents();
    if (zl === 1 || zl === 2 || (typeof global.flattenMode === 'string' && global.flattenMode === 'all')) {
      return true;
    }
    const selFn = getSelectedDateTimeFn();
    const sel = selFn ? selFn() : new Date();
    const selectedYear = sel.getFullYear();
    const evStartYear = start.getFullYear();
    const evEndYear = (end && !isNaN(end.getTime())) ? end.getFullYear() : evStartYear;
    return (evStartYear <= selectedYear && evEndYear >= selectedYear);
  }

  /** Event belongs to selected year (or all years for Zooms 1, 2, or flattened 3). */
  function eventTouchesSelectedContextArcWindow(start, end) {
    return isEventInSelectedYear(start, end);
  }

  /**
   * Month-grain window from Zoom 5 (±1 month about selected). Off-day sub-day
   * events stay visible at closer zooms on the annual day-frame — no Shift.
   */
  function eventTouchesZoom5DailyWindow(start, end) {
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    if (typeof global.getZoomRelativeContextTimeBoundsMs === 'function') {
      try {
        const b = global.getZoomRelativeContextTimeBoundsMs(5);
        if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) {
          return evEnd.getTime() > b.t0 && start.getTime() < b.t1;
        }
      } catch (e) { /* fall through */ }
    }
    return eventTouchesSelectedMonthWindow(start, evEnd);
  }

  /**
   * Plot style per event. Auto: polygons on selected day for short events, lines on other days;
   * long-term (≥24h) always polygons. Global HUD can force all lines or all polygons.
   * @param {Date|null} start
   * @param {Date|null} end
   * @param {...Object} styleSources - layerConfig, lineStyle, etc.
   */
  function resolveEventPlotType(start, end) {
    let mode = 'auto';
    if (typeof global.getGlobalEventPlotType === 'function') {
      mode = global.getGlobalEventPlotType();
    }
    if (start && !isNaN(start.getTime()) && isLongTermEventSpanForPlotType(start, end)) {
      return 'polygon3d';
    }
    if (
      isCircadianShortEventsShiftPreview() &&
      start &&
      !isNaN(start.getTime()) &&
      !isLongTermEventSpanForPlotType(start, end)
    ) {
      return 'polygon3d';
    }
    if (mode === 'lines') return 'lines';
    if (mode === 'polygon3d' || mode === 'polygon2d') return 'polygon3d';
    if (start && !isNaN(start.getTime()) && eventTouchesSelectedCalendarDay(start, end)) {
      return 'polygon3d';
    }
    // Clock zoom: month-range off-day STEs get filled ribbons (not just lines) so they're visible.
    if (start && !isNaN(start.getTime()) && getZoomLevelForEvents() === 9 && eventTouchesSelectedMonthRangeWindow(start, end)) {
      return 'polygon3d';
    }
    if (mode !== 'auto') {
      for (let i = 2; i < arguments.length; i++) {
        const src = arguments[i];
        if (src && src.plotType) return src.plotType;
      }
    }
    return 'lines';
  }

  /** Match main.js: landing/month/week/day/clock show circadian helix ribbons and connectors. */
  function isCircadianHelixZoom(zl) {
    return zl === 0 || zl === 5 || zl === 7 || zl === 8 || zl === 9;
  }

  /** Week/day/clock zooms: short events use the vertical day-disk stack (same frame as gold rings). */
  function isHelixZoomShortStackFrame() {
    return isCircadianHelixZoom(getZoomLevelForEvents());
  }

  /**
   * Sub-day markers/ribbons share the same world-Y frame as {@link CircadianRenderer} day-disk rings
   * (sceneContentGroup). flattenableGroup squashes Y and desyncs dots from the daily circles.
   */
  function shouldAttachShortCircadianToWorldGroup() {
    return isHelixZoomShortStackFrame();
  }

  function resolveFlattenGroup(flattenGroup) {
    if (flattenGroup) return flattenGroup;
    if (typeof global.flattenableGroup !== 'undefined' && global.flattenableGroup) {
      return global.flattenableGroup;
    }
    if (typeof global.sceneContentGroup !== 'undefined' && global.sceneContentGroup) {
      return global.sceneContentGroup;
    }
    return null;
  }

  function resolveWorldGroup(worldGroup) {
    if (worldGroup) return worldGroup;
    if (typeof global.sceneContentGroup !== 'undefined' && global.sceneContentGroup) {
      return global.sceneContentGroup;
    }
    return null;
  }

  /** Prefer sceneContentGroup so flatten mode does not squash timeline geometry. */
  function resolveEventObjectParent(obj, flattenGroup, worldGroup) {
    const flat = resolveFlattenGroup(flattenGroup);
    const world = resolveWorldGroup(worldGroup);
    if (!obj || !obj.userData) return flat || world || null;
    if (obj.userData.circadianWorldSpaceLayer || obj.userData.useWorldSpaceGroup) {
      return world || flat || null;
    }
    return flat || world || null;
  }

  function shouldSkipTemporalVividnessAtDayHelixZooms() {
    const zl = getZoomLevelForEvents();
    return zl === 0 || zl === 8 || zl === 9;
  }

  function shouldSkipTemporalVividnessForShortEvent() {
    return shouldSkipTemporalVividnessAtDayHelixZooms();
  }

  /**
   * Long-term ribbons use sceneContentGroup + per-frame Y flatten (see updateTimelineHelixEventsForFlatten).
   * flattenableGroup Y-scale alone does not keep helix verts aligned with squashed markers/worldlines.
   */
  function shouldAttachLongEventToWorldGroup() {
    return true;
  }

  function getTimelineFlattenYScale(amount) {
    const a = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return Math.max(0, 1 - a);
  }

  function flattenTimelineFlatArray(logicalFlat, focusY, amount) {
    if (!logicalFlat || logicalFlat.length < 3) return logicalFlat;
    const yScale = getTimelineFlattenYScale(amount);
    const offset = (typeof focusY === 'number' && !isNaN(focusY) ? focusY : 0) * (1 - yScale);
    const out = new Float32Array(logicalFlat.length);
    for (let i = 0; i < logicalFlat.length; i += 3) {
      out[i] = logicalFlat[i];
      out[i + 1] = logicalFlat[i + 1] * yScale + offset;
      out[i + 2] = logicalFlat[i + 2];
    }
    return out;
  }

  function flattenTimelineLogicalY(logicalY, focusY, amount) {
    const yScale = getTimelineFlattenYScale(amount);
    const offset = (typeof focusY === 'number' && !isNaN(focusY) ? focusY : 0) * (1 - yScale);
    return logicalY * yScale + offset;
  }

  /** Stagger only (helix verts carry flattened world Y; root stays at 0). */
  function getTimelineHelixStaggerOffsetY(staggerLogical, amount) {
    if (typeof staggerLogical !== 'number' || isNaN(staggerLogical) || staggerLogical === 0) return 0;
    return staggerLogical * getTimelineFlattenYScale(amount);
  }

  function storeTimelineHelixRef(userData, ref) {
    if (!userData || !ref) return;
    userData.timelineHelixRef = {
      startHeight: ref.startHeight,
      endHeight: ref.endHeight,
      rInner: ref.rInner,
      rOuter: ref.rOuter,
      refWorldline: ref.refWorldline,
      segments: ref.segments
    };
    if (ref.kind) userData.timelineHelixRef.kind = ref.kind;
    if (ref.radius != null && isFinite(ref.radius)) userData.timelineHelixRef.radius = ref.radius;
    if (ref.logicalHeight != null && isFinite(ref.logicalHeight)) {
      userData.timelineHelixRef.logicalHeight = ref.logicalHeight;
    }
  }

  function storeDayFrameHelixRef(userData, ref) {
    if (!userData || !ref) return;
    userData.dayFrameHelixRef = {
      startMs: ref.startMs,
      endMs: ref.endMs,
      earthDist: ref.earthDist,
      indexOffset: ref.indexOffset,
      durationH: ref.durationH,
      segments: ref.segments,
      refWorldline: ref.refWorldline,
      logicalInnerFlat: ref.logicalInnerFlat ? ref.logicalInnerFlat.slice() : null,
      logicalOuterFlat: ref.logicalOuterFlat ? ref.logicalOuterFlat.slice() : null
    };
  }

  function resolveDayFrameHelixEvent(root) {
    if (!root) return null;
    if (root.userData && root.userData.vevent) return root.userData.vevent;
    if (root.children) {
      for (let i = 0; i < root.children.length; i++) {
        const ch = root.children[i];
        if (ch && ch.userData && ch.userData.vevent) return ch.userData.vevent;
      }
    }
    return null;
  }

  /** Rebuild logical flats from stored span — orbit phase uses worldline ref (not selected date). */
  function rebuildDayFrameHelixLogicalFlats(ref, root) {
    if (!ref || ref.startMs == null || ref.endMs == null || !ref.earthDist) return null;
    const event = resolveDayFrameHelixEvent(root);
    const refWorldline = getWorldlineOrbitReferenceHeight();
    const segments = ref.segments != null ? ref.segments : 16;
    return buildDayFrameHelixPair(
      new Date(ref.startMs),
      new Date(ref.endMs),
      ref.earthDist,
      refWorldline,
      segments,
      ref.indexOffset,
      event,
      ref.durationH
    );
  }

  function applyFlattenedDayFrameHelixToRoot(root, focusY, amount) {
    if (!root || !root.userData || !root.userData.dayFrameHelixRef) return;
    const ref = root.userData.dayFrameHelixRef;
    const currentRefHeight = getWorldlineOrbitReferenceHeight();
    if (!ref._cachedFlats || ref._cachedRefHeight !== currentRefHeight) {
      ref._cachedRefHeight = currentRefHeight;
      ref._cachedFlats = rebuildDayFrameHelixLogicalFlats(ref, root);
    }
    const freshFlats = ref._cachedFlats;
    const baseInner = freshFlats && freshFlats.innerFlat ? freshFlats.innerFlat : ref.logicalInnerFlat;
    const baseOuter = freshFlats && freshFlats.outerFlat ? freshFlats.outerFlat : ref.logicalOuterFlat;
    if (!baseInner || !baseOuter) return;
    const amt = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    let innerFlat = amt > 1e-6
      ? flattenTimelineFlatArray(baseInner, focusY, amt)
      : baseInner.slice();
    let outerFlat = amt > 1e-6
      ? flattenTimelineFlatArray(baseOuter, focusY, amt)
      : baseOuter.slice();
    applyDayFrameEhWarpToFlats(
      innerFlat,
      outerFlat,
      ref.startMs,
      ref.endMs,
      ref.earthDist,
      ref.refWorldline
    );
    root.position.y = 0;
    let fillMesh = null;
    root.traverse((child) => {
      if (child.userData && child.userData.type === 'EventRibbonArc') {
        if (child.userData.arcEdge === 'outer') {
          updateLineGeometryFromFlat(child, outerFlat);
        } else {
          updateLineGeometryFromFlat(child, innerFlat);
        }
      } else if (child.isMesh && child.userData && child.userData.longTermFill) {
        fillMesh = child;
      } else if (child.isMesh && child.userData && child.userData.type === 'EventPickProxy') {
        updateRibbonFillMeshFromFlat(child, innerFlat, outerFlat);
      }
    });
    if (fillMesh) updateRibbonFillMeshFromFlat(fillMesh, innerFlat, outerFlat);
    updateEventRibbonBandEndConnectors(root, innerFlat, outerFlat);
    updateEventRibbonLabelsForFlatten(root, innerFlat, outerFlat, amt);
  }

  function applyFlattenedHelixToRoot(root, focusY, amount) {
    if (!root || !root.userData || !root.userData.timelineHelixRef) return;
    const ref = root.userData.timelineHelixRef;
    if (ref.kind === 'superYearCylinder') {
      applyFlattenedSuperYearCylinderToRoot(root, focusY, amount);
      return;
    }
    const currentRefHeight = getWorldlineOrbitReferenceHeight();
    if (!ref._cachedPair || ref._cachedRefHeight !== currentRefHeight) {
      ref._cachedRefHeight = currentRefHeight;
      ref._cachedPair = buildHelixPair(
        ref.startHeight,
        ref.endHeight,
        ref.rInner,
        ref.rOuter,
        currentRefHeight,
        ref.segments
      );
    }
    const pair = ref._cachedPair;
    if (!pair.innerFlat || !pair.outerFlat || pair.innerFlat.length < 6) return;
    const innerFlat = flattenTimelineFlatArray(pair.innerFlat, focusY, amount);
    const outerFlat = flattenTimelineFlatArray(pair.outerFlat, focusY, amount);
    const staggerY =
      root.userData.eventStaggerRoot && typeof root.userData.staggerLogical === 'number'
        ? getTimelineHelixStaggerOffsetY(root.userData.staggerLogical, amount)
        : 0;
    if (staggerY) {
      offsetHelixFlatY(innerFlat, staggerY);
      offsetHelixFlatY(outerFlat, staggerY);
    }
    root.position.y = 0;
    const outlineCtx = resolveRibbonOutlineCtx(root);
    const fillMeshes = [];
    const tubesToReplace = [];
    root.traverse((child) => {
      if (child.userData && child.userData.type === 'EventRibbonArc') {
        if (child.userData.arcEdge === 'outer') {
          updateLineGeometryFromFlat(child, outerFlat);
        } else {
          updateLineGeometryFromFlat(child, innerFlat);
        }
      } else if (
        child.isMesh &&
        (child.userData.longTermFill ||
         child.userData.type === 'EventRibbonFill' ||
         child.userData.type === 'EventPolygon3D' ||
         child.userData.type === 'EventPickProxy' ||
         (child.geometry && child.geometry.attributes && child.geometry.attributes.ribbonEdge))
      ) {
        fillMeshes.push(child);
      } else if (child.userData && child.userData.eventRibbonTube) {
        tubesToReplace.push(child);
      } else if (
        child.isLine &&
        child.geometry &&
        child.userData &&
        (child.userData.type === 'EventObject' ||
          (child.userData.type === 'EventRibbonArc' && child.userData.arcEdge === 'mid'))
      ) {
        const midFlat = getFlattenedRibbonFlatForEdge(
          ref,
          'mid',
          innerFlat,
          outerFlat,
          focusY,
          amount,
          staggerY
        );
        if (midFlat) updateLineGeometryFromFlat(child, midFlat);
      }
    });
    fillMeshes.forEach((fm) => updateRibbonFillMeshFromFlat(fm, innerFlat, outerFlat));
    if (outlineCtx && tubesToReplace.length) {
      for (let ti = 0; ti < tubesToReplace.length; ti++) {
        const child = tubesToReplace[ti];
        const edge = child.userData.eventRibbonTube;
        const flat = getFlattenedRibbonFlatForEdge(
          ref,
          edge,
          innerFlat,
          outerFlat,
          focusY,
          amount,
          staggerY
        );
        replaceRibbonTubeMeshFromFlat(child, flat, outlineCtx);
      }
    }
    updateEventRibbonLabelsForFlatten(root, innerFlat, outerFlat, amount);
    updateEventRibbonBandEndConnectors(root, innerFlat, outerFlat);
  }

  /**
   * Super-year life columns: squash Y toward flatten focus the same way helical ribbons do.
   * Cylinder mesh scales about its midpoint; top/bottom rings and labels follow flattened heights.
   */
  function applyFlattenedSuperYearCylinderToRoot(root, focusY, amount) {
    if (!root || !root.userData || !root.userData.timelineHelixRef) return;
    const ref = root.userData.timelineHelixRef;
    const radius = ref.radius != null && isFinite(ref.radius) ? ref.radius : (ref.rOuter + ref.rInner) * 0.5;
    if (!(radius > 0)) return;
    const y0 = flattenTimelineLogicalY(ref.startHeight, focusY, amount);
    const y1 = flattenTimelineLogicalY(ref.endHeight, focusY, amount);
    const staggerY =
      root.userData.eventStaggerRoot && typeof root.userData.staggerLogical === 'number'
        ? getTimelineHelixStaggerOffsetY(root.userData.staggerLogical, amount)
        : 0;
    const mid = (y0 + y1) * 0.5 + staggerY;
    const h = Math.abs(y1 - y0);
    const logicalH = ref.logicalHeight > 1e-6
      ? ref.logicalHeight
      : Math.abs(ref.endHeight - ref.startHeight);
    const yScale = logicalH > 1e-6 ? h / logicalH : 1;
    root.position.y = 0;
    root.traverse((child) => {
      if (child.isMesh && child.userData && child.userData.superYearCylinder) {
        child.position.y = mid;
        child.scale.y = yScale;
      } else if (child.userData && child.userData.type === 'SuperYearCylinderRing') {
        const yRing = (child.userData.ring === 'end' ? y1 : y0) + staggerY;
        const pos = child.geometry && child.geometry.attributes && child.geometry.attributes.position;
        if (pos && pos.array) {
          const arr = pos.array;
          for (let i = 1; i < arr.length; i += 3) arr[i] = yRing;
          pos.needsUpdate = true;
        }
      }
    });
    const pair = buildVerticalCylinderLabelFlats(y0 + staggerY, y1 + staggerY, radius, 8);
    updateEventRibbonLabelsForFlatten(root, pair.innerFlat, pair.outerFlat, amount);
  }

  function getEventSpanDatesFromRoot(root) {
    if (!root || !root.userData) return { start: null, end: null };
    const ud = root.userData;
    if (ud.start instanceof Date && ud.end instanceof Date) {
      return { start: ud.start, end: ud.end };
    }
    const ev = ud.vevent;
    if (ev) {
      const s = getEventStart(ev);
      const e = getEventEnd(ev);
      return { start: s, end: e };
    }
    return { start: null, end: null };
  }

  function resolveRibbonOutlineCtx(root) {
    if (!root) return null;
    if (root.userData && root.userData._ribbonOutlineCtx) return root.userData._ribbonOutlineCtx;
    let ctx = null;
    root.traverse((child) => {
      if (!ctx && child.userData && child.userData._ribbonOutlineCtx) {
        ctx = child.userData._ribbonOutlineCtx;
      }
    });
    return ctx;
  }

  /**
   * Reposition LTE name/date labels on the flattened ribbon (surface meshes + sprite fallback).
   */
  function updateEventRibbonLabelsForFlatten(root, innerFlat, outerFlat, amount) {
    if (!root || !innerFlat || !outerFlat || innerFlat.length < 6) return;
    const n = innerFlat.length / 3;
    if (n < 2) return;
    const earthDist = getEarthDistance();
    const bump = earthDist * 0.004;
    const { start, end } = getEventSpanDatesFromRoot(root);
    const daysForLabels = start && end ? durationDaysBetween(start, end) : 0;
    const isWeekCorridorEvent = eventBandUsesWeekCorridor(daysForLabels);
    const isMonthishLongTermLabel =
      typeof daysForLabels === 'number' && !isNaN(daysForLabels) &&
      daysForLabels >= 12 && !isWeekCorridorEvent;
    const ribbonLabelRadialT = isWeekCorridorEvent
      ? 0.38
      : (isMonthishLongTermLabel ? 0.24 : 0.5);
    const flatAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;

    root.traverse((child) => {
      const ud = child.userData;
      if (!ud || (ud.type !== 'EventObjectLabel' && ud.type !== 'EventLineLabel')) return;
      const kind = ud.kind;
      let idx = ud.labelRibbonIdx;
      if (idx == null || isNaN(idx)) {
        if (kind === 'start') idx = 0;
        else if (kind === 'end') idx = n - 1;
        else idx = Math.round((n - 1) * 0.5);
      }
      idx = Math.max(0, Math.min(n - 1, Math.floor(idx)));
      const tAlong =
        ud.labelRibbonRadialT != null && !isNaN(ud.labelRibbonRadialT)
          ? ud.labelRibbonRadialT
          : ribbonLabelRadialT;
      const fr = sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, tAlong);
      if (!fr) return;

      let labelY = fr.position.y;
      if (flatAmount > 0.001) {
        const focusY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
        labelY = flattenTimelineLogicalY(labelY, focusY, flatAmount);
      }

      if (ud.isRibbonSurfaceLabel && child.isMesh) {
        placeMeshOnRibbonFrame(child, fr, bump);
        if (ud.circadianShortRibbonLabel && typeof orientCircadianShortRibbonLabelMesh === 'function') {
          orientCircadianShortRibbonLabelMesh(child, fr);
        }
        if (ud.monthishLabelSnap && flatAmount < 0.02) {
          snapMeshPositionXZRadius(child, getMonthOuterInnerLabelRadiusXZ(earthDist));
        }
      } else if (child.isSprite) {
        child.position.set(fr.position.x, labelY, fr.position.z);
        if (bump && fr.normal) child.position.addScaledVector(fr.normal, bump);
        if (ud.kind === 'mid' || ud.labelIsName) {
          clampEventNameSpriteScaleToBand(child, fr.band, 0.88);
        }
      }
    });
  }

  function updateEventRibbonBandEndConnectors(root, innerFlat, outerFlat) {
    if (!root || !innerFlat || !outerFlat) return;
    root.traverse((child) => {
      if (child.userData && child.userData.type === 'EventRibbonBandEnd') {
        updateBandEndConnectorFromFlat(child, innerFlat, outerFlat, child.userData.capIndex);
      }
    });
  }

  function disposeOutlineNode(node) {
    if (!node) return;
    if (node.geometry && !(node.geometry.userData && node.geometry.userData.__sharedCached)) node.geometry.dispose();
    if (node.material) {
      if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
      else node.material.dispose();
    }
    if (node.children && node.children.length) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        disposeOutlineNode(node.children[i]);
      }
    }
  }

  function replaceRibbonTubeMeshFromFlat(oldNode, flat, outlineCtx) {
    if (!oldNode || !flat || flat.length < 6 || !outlineCtx) return;
    const parent = oldNode.parent;
    if (!parent) return;
    const edge = oldNode.userData && oldNode.userData.eventRibbonTube;
    const fresh = createTubeOutlineAlongFlat(
      flat,
      outlineCtx.outlineColorHex,
      outlineCtx.outlineOp,
      outlineCtx.roLine,
      outlineCtx.earthDist,
      outlineCtx.layerConfig,
      outlineCtx.radiusScale
    );
    if (!fresh) return;
    const idx = parent.children.indexOf(oldNode);
    parent.remove(oldNode);
    disposeOutlineNode(oldNode);
    if (!fresh.userData) fresh.userData = {};
    fresh.userData.eventRibbonTube = edge;
    if (idx >= 0) parent.children.splice(idx, 0, fresh);
    else parent.add(fresh);
  }

  function getFlattenedRibbonFlatForEdge(ref, edge, innerFlat, outerFlat, focusY, amount, staggerY) {
    let flat = innerFlat;
    if (edge === 'outer') flat = outerFlat;
    else if (edge === 'mid' && typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      const rMid = (ref.rInner + ref.rOuter) * 0.5;
      const points = SceneGeometry.createEarthHelicalCurve(
        ref.startHeight,
        ref.endHeight,
        rMid,
        ref.refWorldline,
        ref.segments
      );
      if (points) {
        flat = flattenTimelineFlatArray(points, focusY, amount);
        if (staggerY) offsetHelixFlatY(flat, staggerY);
      }
    }
    return flat;
  }

  /**
   * @param {{ forEachLayerObjectRoot?: function(function):void }|null} gl
   * @param {number} focusY
   * @param {number} amount - 0..1 flatten intensity (matches main.js currentFlattenAmount)
   */
  function updateTimelineHelixEventsForFlatten(gl, focusY, amount) {
    const seen = new Set();
    const visit = function (root) {
      if (!root || !root.userData || seen.has(root.uuid)) return;
      if (root.userData.dayFrameHelixRef) {
        seen.add(root.uuid);
        applyFlattenedDayFrameHelixToRoot(root, focusY, amount);
        return;
      }
      if (root.userData.dualStePlacement && root.children && root.children.length) {
        for (let ci = 0; ci < root.children.length; ci++) {
          const ch = root.children[ci];
          if (ch && ch.userData && ch.userData.dayFrameHelixRef) {
            seen.add(root.uuid);
            applyFlattenedDayFrameHelixToRoot(root, focusY, amount);
            return;
          }
        }
      }
      if (root.userData.circadianShortScrub) return;
      if (root.userData.circadianWorldSpaceLayer && !root.userData.timelineHelixRef) return;
      if (!root.userData.timelineHelixRef) return;
      seen.add(root.uuid);
      applyFlattenedHelixToRoot(root, focusY, amount);
    };
    if (gl && typeof gl.forEachLayerObjectRoot === 'function') {
      gl.forEachLayerObjectRoot(visit);
    }
    const world =
      typeof global.sceneContentGroup !== 'undefined' && global.sceneContentGroup
        ? global.sceneContentGroup
        : null;
    if (world) {
      world.traverse((obj) => {
        if (!obj || !obj.userData) return;
        if (!obj.userData.timelineHelixRef && !obj.userData.dayFrameHelixRef) return;
        if (obj.parent && obj.parent.userData &&
            (obj.parent.userData.timelineHelixRef || obj.parent.userData.dayFrameHelixRef)) return;
        visit(obj);
      });
    }
  }

  function markWorldSpaceIfNeeded(userData, start, end) {
    if (!userData) return;
    const spanMs =
      start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
        ? end.getTime() - start.getTime()
        : 0;
    const isLongSpan = spanMs >= 24 * 60 * 60 * 1000;
    if (!isLongSpan && shouldAttachShortCircadianToWorldGroup()) {
      userData.circadianWorldSpaceLayer = true;
    } else if (shouldAttachLongEventToWorldGroup()) {
      userData.useWorldSpaceGroup = true;
      userData.immuneToFlatten = true;
    }
  }

  function disablePointerRaycastSubtree(root) {
    if (!root || typeof root.traverse !== 'function') return;
    root.traverse((child) => {
      if (child.userData && child.userData._pointerRaycastDisabled) return;
      if (child.userData) child.userData._pointerRaycastDisabled = true;
      child.raycast = function () {};
    });
  }

  /**
   * Zoom 0 / 8 / 9: only sub-day events on the selected calendar day accept pointer picks.
   */
  function isShortEventPointerPickableAtCurrentZoom(start, end) {
    return true;
  }

  /** Moment (0): hide all LTEs. Clock (9): hide multi-day LTEs only; single all-day (24h) events pass through. Day zoom (8) keeps all LTEs. */
  function shouldHideLongTermOnDailySkySte(start, end) {
    const zl = getZoomLevelForEvents();
    if (zl !== 0 && zl !== 9) return false;
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    // Clock zoom: allow single all-day events (24h) to render; only hide multi-day spans.
    if (zl === 9) return durationDaysBetween(start, evEnd) >= 2;
    if (isLongTermEventSpanForPlotType(start, evEnd)) return true;
    if (durationDaysBetween(start, evEnd) >= 2) return true;
    return false;
  }

  function isLongTermSpanForDailySky(start, end) {
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return isLongTermEventSpanForPlotType(start, evEnd) || durationDaysBetween(start, evEnd) >= 2;
  }

  /** Labels, disk markers, fallback dots: selected calendar day only (Shift does not override). */
  function isSteVisibleOnDailySkyClock(start, end) {
    if (shouldHideLongTermOnDailySkySte(start, end)) return false;
    const zl = getZoomLevelForEvents();
    if (zl !== 0 && zl !== 8 && zl !== 9) return true;
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return eventTouchesSelectedCalendarDay(start, evEnd);
  }

  /** Ribbons/lines on day-sky STE: Shift peeks off-day sub-day spans only; LTE uses day overlap rules. */
  function shouldDrawDailySkySteGeometry(start, end) {
    if (shouldHideLongTermOnDailySkySte(start, end)) return false;
    const zl = getZoomLevelForEvents();
    if (zl !== 0 && zl !== 8 && zl !== 9) return true;
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    if (isLongTermSpanForDailySky(start, evEnd)) {
      // Day zoom: LTEs visible across the full calendar month.
      if (zl === 8) return eventTouchesSelectedMonthWindow(start, evEnd);
      // Clock zoom: same-day all-day events only (multi-day already blocked above).
      if (zl === 9) return eventTouchesSelectedCalendarDay(start, evEnd);
      return false;
    }
    if (isCircadianShortEventsShiftPreview()) return true;
    // Day zoom in year scope, Clock zoom, Moment zoom: use the slider-controlled month-range window.
    if (zl === 8 && isCircadianShortEventScopeYear()) return eventTouchesSelectedMonthRangeWindow(start, evEnd);
    if (zl === 9 || zl === 0) return eventTouchesSelectedMonthRangeWindow(start, evEnd);
    return eventTouchesSelectedCalendarDay(start, evEnd);
  }

  /**
   * Disk/sphere STE beads on the circadian helix (red→blue time gradient).
   * Useless at month/week/day-sky — ribbons/lines already mark the span. Skip all helix zooms.
   */
  function shouldRenderDailySkySteDiskFallbackMarker(start, end) {
    if (isCircadianHelixZoom(getZoomLevelForEvents())) return false;
    return isSteVisibleOnDailySkyClock(start, end);
  }

  function markShortEventPointerPickability(root, start, end) {
    if (!root) return;
    const pickable = isShortEventPointerPickableAtCurrentZoom(start, end);
    if (root.userData) root.userData.shortEventPickable = pickable;
    if (!pickable) disablePointerRaycastSubtree(root);
  }

  /** Hold Shift: peek off-day STEs as filled ribbons (inner + outer edges); selected day unchanged. */
  function isCircadianShortEventsShiftPreview() {
    return typeof global.getCircadianShortEventsShiftPreview === 'function' &&
      !!global.getCircadianShortEventsShiftPreview();
  }

  /** 1 on selected calendar day; falls off with |day delta| for Shift peek. */
  function getShiftPreviewDayProximity(start, end) {
    const selFn = getSelectedDateTimeFn();
    const sel = selFn ? selFn() : null;
    if (!sel || !start || isNaN(start.getTime())) return 0;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    const mid = new Date((start.getTime() + evEnd.getTime()) / 2);
    const ua = Date.UTC(mid.getFullYear(), mid.getMonth(), mid.getDate());
    const ub = Date.UTC(sel.getFullYear(), sel.getMonth(), sel.getDate());
    const diffDays = Math.abs(Math.round((ua - ub) / 86400000));
    return Math.exp(-diffDays / 3.5);
  }

  /** Opacity multiplier for off-day STE geometry while Shift is held (day-sky zooms). */
  function getShiftPreviewSteVisibilityMul(start, end) {
    if (!isCircadianShortEventsShiftPreview() || !start || isNaN(start.getTime())) return 1;
    if (eventTouchesSelectedCalendarDay(start, end)) return 1;
    const prox = getShiftPreviewDayProximity(start, end);
    return Math.max(0.5, Math.min(0.92, 0.52 + 0.4 * prox));
  }

  function getShiftPreviewSteOutlineMul(start, end) {
    if (!isCircadianShortEventsShiftPreview() || eventTouchesSelectedCalendarDay(start, end)) return 1;
    return 1.28;
  }

  function isCircadianShortEventScopeYear() {
    if (isCircadianShortEventsShiftPreview()) return true;
    return typeof global.getCircadianShortEventScope === 'function' &&
      global.getCircadianShortEventScope() === 'year';
  }

  /**
   * Extra dimming for short-event **line** plot on days/hours outside the selected time.
   * Polygons on the selected day are unchanged (auto mode uses lines off-day only).
   */
  function getOffSelectedTimeLineDimStrength() {
    if (typeof global.getOffSelectedTimeLineDimStrength === 'function') {
      const v = global.getOffSelectedTimeLineDimStrength();
      if (typeof v === 'number' && !isNaN(v)) return Math.max(0, Math.min(1, v));
    }
    return 1;
  }

  /** Slider 0 = no extra off-day dim; 1 = full off-day line dim curve. */
  function applyOffSelectedLineDimStrength(mul) {
    const strength = getOffSelectedTimeLineDimStrength();
    if (strength >= 1) return mul;
    if (strength <= 0) return 1;
    return 1 + (mul - 1) * strength;
  }

  function getOffSelectedTimeLineOpacityMul(start, end) {
    return 1;
  }

  function resolveShortCircadianLineOpacity(opacity, start, end) {
    const zl = getZoomLevelForEvents();
    if (
      !isCircadianShortEventsShiftPreview() &&
      (zl === 0 || zl === 9) &&
      start &&
      isSub24HourSpan(start, end) &&
      !eventTouchesSelectedCalendarDay(start, end)
    ) {
      return 0;
    }
    const base = opacity != null && !isNaN(opacity) ? opacity : 0.9;
    const mul = start ? getOffSelectedTimeLineOpacityMul(start, end) : 1;
    let op = Math.max(0.03, Math.min(1, base * mul));
    if (
      zl === 9 &&
      start &&
      isSub24HourSpan(start, end) &&
      eventTouchesSelectedCalendarDay(start, end)
    ) {
      op = Math.min(1, op * 1.32);
    } else if (
      zl === 0 &&
      start &&
      isSub24HourSpan(start, end) &&
      eventTouchesSelectedCalendarDay(start, end) &&
      eventTouchesSelectedHour(start, end)
    ) {
      op = Math.min(1, op * 1.38);
    }
    if (isCircadianShortEventsShiftPreview() && start && isSub24HourSpan(start, end)) {
      if (eventTouchesSelectedCalendarDay(start, end)) {
        op = Math.max(op, 0.9);
      } else {
        op = Math.max(op, 0.55 * getShiftPreviewSteVisibilityMul(start, end));
      }
    }
    return op;
  }

  function getShortCircadianLineMaterialOpts(opacity, start, end) {
    return {
      transparent: true,
      opacity: resolveShortCircadianLineOpacity(opacity, start, end),
      depthTest: false,
      depthWrite: false
    };
  }

  const SHORT_CIRCADIAN_LINE_RENDER_ORDER = 14;

  function ensureSceneGeometryInitialized() {
    if (typeof SceneGeometry === 'undefined' || typeof SceneGeometry.init !== 'function') return;
    if (typeof PLANET_DATA === 'undefined' || !PLANET_DATA || !PLANET_DATA.length) return;
    SceneGeometry.init({
      PLANET_DATA,
      calculateDateHeight,
      getHeightForYear,
      calculateCurrentDateHeight,
      CENTURY_START,
      ZOOM_LEVELS,
      currentYear,
      calculateActualCurrentDateHeight,
      calculateYearProgressForDate,
      getDaysInMonth,
      isLeapYear
    });
  }

  function getCircadianStraightenBlendForEvents() {
    if (typeof global.getCircadianStraightenBlend === 'function') {
      return Math.min(1, Math.max(0, global.getCircadianStraightenBlend()));
    }
    return 0;
  }

  /** Treat anything other than straightened/wrapped as off (avoids undefined behaving like “on”). */
  function normalizedCircadianState() {
    const raw = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
    if (raw === 'straightened' || raw === 'wrapped') return raw;
    return 'off';
  }

  /** Hide events outside scoped window: Moment (0) & Clock (9) always use selected local day (even if UI scope is “year”). */
  function shouldHideCircadianShortEventForDayScope(start, end) {
    const zl = getZoomLevelForEvents();
    const selFn = getSelectedDateTimeFn();
    if (!selFn || !start || isNaN(start.getTime())) return false;
    const sel = selFn();
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);

    // Parent-unit density window (week→month, day→week, …) — hard cull first.
    if (shouldHideOutsideParentUnitWindow(start, evEnd)) return true;

    if (shouldHideLongTermOnDailySkySte(start, evEnd)) return true;

    // Off-day sub-day still draw on the annual day-frame (Zoom 5 month). Do not kill them here.
    if (isSteStyleDailySpan(start, evEnd) && shouldRenderDayFrameSubDayOnAnnualHelix()) {
      return false;
    }

    // Day zoom: long-term spans visible across the full calendar month.
    if (zl === 8 && isLongTermSpanForDailySky(start, evEnd)) {
      return !eventTouchesSelectedMonthWindow(start, evEnd);
    }

    if (isCircadianShortEventsShiftPreview()) return false;

    if (zl === 0) return !eventTouchesSelectedMonthRangeWindow(start, evEnd);

    if (isCircadianShortEventScopeYear()) {
      // Week zoom (7): parent month already applied; day/clock: month-range inside parent day/week.
      if (zl === 7) return false;
      if (zl === 8) return !eventTouchesSelectedMonthRangeWindow(start, evEnd);
    }

    if (zl === 9) return !eventTouchesSelectedMonthRangeWindow(start, evEnd);

    // Month / lunar / week: parent window already culled; keep STE draw gates for Context Arc.
    if (zl === 5 || zl === 6 || zl === 7) return false;

    const circ = normalizedCircadianState();
    if (!isCircadianHelixZoom(zl) || circ === 'off') return false;

    const dayStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime());
    dayEnd.setDate(dayEnd.getDate() + 1);
    const overlap = evEnd > dayStart && start < dayEnd;
    return !overlap;
  }

  /** Zoom 0 / 8 / 9: drop geometry outside selected day unless short-event scope is “year”. */
  function shouldHideCircadianEventOutsideSelectedDayAtClockZooms(start, end) {
    const zl = getZoomLevelForEvents();
    if (zl !== 0 && zl !== 8 && zl !== 9) return false;
    return shouldHideCircadianShortEventForDayScope(start, end);
  }

  /**
   * Extra opacity for circadian disks: ghost non-selected days; at Moment (0) only the selected hour reads.
   * When circadian is off, returns 1.
   */
  function getDailyCircadianEventOpacityMul(start, end) {
    const zl = getZoomLevelForEvents();
    const circ = normalizedCircadianState();
    const helixOn = isCircadianHelixZoom(zl) && circ !== 'off';
    if (!helixOn) return 1;
    if (zl === 7 && isCircadianShortEventScopeYear()) {
      return 1;
    }

    let mul = 1;
    const onSelDay = eventTouchesSelectedCalendarDay(start, end);

    const dayDiffProx = (function proxFade() {
      const selFn = getSelectedDateTimeFn();
      const sel = selFn ? selFn() : null;
      if (!sel || !start || !end) return 1;
      const mid = new Date((start.getTime() + end.getTime()) / 2);
      const ua = Date.UTC(mid.getFullYear(), mid.getMonth(), mid.getDate());
      const ub = Date.UTC(sel.getFullYear(), sel.getMonth(), sel.getDate());
      const diffDays = Math.abs(Math.round((ua - ub) / 86400000));
      return 0.06 + 0.94 * Math.exp(-diffDays / 5);
    })();

    const isShort = isSub24HourSpan(start, end);

    if (
      isCircadianShortEventsShiftPreview() &&
      isShort &&
      !onSelDay &&
      (zl === 0 || zl === 8 || zl === 9)
    ) {
      return getShiftPreviewSteVisibilityMul(start, end);
    }

    if (zl === 0 && isShort && !onSelDay) return 0;
    if (zl === 9 && isShort && !onSelDay) {
      // Month-range events fade by day distance; events outside the window are hidden.
      if (eventTouchesSelectedMonthRangeWindow(start, end)) return Math.max(0.28, dayDiffProx * 0.82);
      return 0;
    }

    if (zl === 0) {
      if (eventTouchesSelectedHour(start, end)) {
        if (isShort) mul = Math.min(1, mul * 1.42);
        return Math.max(isShort ? 0.88 : 0.38, Math.min(1, mul));
      }
      mul *= isShort ? 0.34 : 0.1;
      return Math.max(isShort ? 0.22 : 0.04, Math.min(0.58, mul));
    }

    if (zl === 9 && onSelDay && isShort) {
      mul = Math.min(1, mul * 1.38);
    }

    if (zl === 8 && onSelDay && !isShort) {
      return Math.max(0.72, Math.min(1, mul));
    }

    if (!onSelDay) {
      if (zl === 8) mul *= 0.14;
      else if (zl === 5 || zl === 6 || zl === 7) {
        // Nesting resolver LTE day grain: keep full read at month/week (no off-day ghost).
        if (isShort || isSteStyleDailySpan(start, end)) mul = 1;
        else mul *= 0.22;
      } else mul *= 0.28;
      if (!(zl === 5 || zl === 6 || zl === 7) || !(isShort || isSteStyleDailySpan(start, end))) {
        mul *= dayDiffProx;
      }
    }

    const floor = zl === 8 ? 0.42 : (zl === 5 || zl === 6 || zl === 7 ? 0.85 : 0.12);
    return Math.max(floor, Math.min(1, mul));
  }

  /** Zoom 0 / day / clock: events sit on the flat day-sky plane — need thicker bands + draw above sky. */
  function isEarthDailySkyEventZoom(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : getZoomLevelForEvents();
    return z === 0 || z === 8 || z === 9;
  }

  function getShortCircadianRadialHalfWidth(handLen, zl) {
    const hl = typeof handLen === 'number' && handLen > 0 ? handLen : 12;
    if (zl === 0) {
      return Math.max(hl * 0.034, 0.24);
    }
    if (isEarthDailySkyEventZoom(zl)) {
      // Day/clock sky: keep readable but avoid lane pileups.
      return Math.max(hl * 0.055, 0.32);
    }
    return Math.max(hl * 0.028, 0.18);
  }

  function getShortCircadianMinRibbonRadialSpan(handLen, zl) {
    const hl = typeof handLen === 'number' && handLen > 0 ? handLen : 12;
    if (zl === 0) {
      return Math.max(hl * 0.04, 0.16);
    }
    if (isEarthDailySkyEventZoom(zl)) {
      return Math.max(hl * 0.032, 0.14);
    }
    return Math.max(hl * 0.04, 0.12);
  }

  /** Thinner outline tubes at month/week helix; slim on day/clock sky (not Moment). */
  function getShortCircadianRibbonTubeScale() {
    const zl = getZoomLevelForEvents();
    if (zl === 0) return 0.58;
    if (isEarthDailySkyEventZoom(zl)) return 0.5;
    return 0.5;
  }

  function getShortCircadianOutlineOpacityMul(zl) {
    if (isEarthDailySkyEventZoom(zl)) return 0.82;
    return 1;
  }

  /** Inner edge of quarter-hour ticks — STE outer must stay inside (no tick intersection). */
  function getDailySkySteMaxOuterRadius(handLen) {
    const hl = typeof handLen === 'number' && handLen > 0 ? handLen : 12;
    const tickCenterR = hl * 0.93;
    const tickHalfSpanQuarter = hl * 0.02;
    const margin = Math.max(hl * 0.018, 0.035);
    return tickCenterR - tickHalfSpanQuarter - margin;
  }

  /**
   * Pack `peakConcurrent` non-overlapping radial bands between Earth and tick inner edge.
   * @returns {{ innerR: number, outerR: number, bandW: number, gap: number, lanes: number }}
   */
  function getDailySkySteAnnulusLayout(baseHand, peakConcurrent) {
    const hl = typeof baseHand === 'number' && baseHand > 0 ? baseHand : 12;
    const innerR = getShortCircadianMinRadiusFromEarthCenter();
    const outerR = getDailySkySteMaxOuterRadius(hl);
    const span = Math.max(outerR - innerR, 0.05);
    const lanes = Math.max(1, peakConcurrent);
    // Split the annulus into `lanes` equal steps; each step is a band + a slit.
    // Gap is a fraction of the *step* (not the whole span) so the layout stays
    // valid for any lane count and always fills the full radial span.
    const step = span / lanes;
    const gapFrac = lanes > 1 ? 0.18 : 0;
    const gap = step * gapFrac;
    const bandW = step - gap;
    return { innerR, outerR, bandW, gap, lanes };
  }

  function applyDailyCircadianLabelOpacity(sprite, start, end) {
    if (!sprite) return;
    const m = getDailyCircadianEventOpacityMul(start, end);
    const op = Math.max(0.04, Math.min(1, 0.95 * m));
    const mat = sprite.material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((mm) => { if (mm && typeof mm.opacity === 'number') mm.opacity = op; });
    else if (typeof mat.opacity === 'number') mat.opacity = op;
  }

  function getOrbitAngleForShortEventPlacement(height, currentHeight) {
    const b = getCircadianStraightenBlendForEvents();
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle) {
      const aw = SceneGeometry.getAngle(height, currentHeight);
      const as = SceneGeometry.getAngle(currentHeight, currentHeight);
      return aw * (1 - b) + as * b;
    }
    return 0;
  }

  /**
   * Week+ **calendar** views: place sub-day dots in the day-number / day-name band.
   * When circadian rhythm is on at helix zooms, short events belong on the hour-hand near Earth instead.
   */
  function shouldUseDayBandDotPlacement() {
    const zl = getZoomLevelForEvents();
    if (zl < 7) return false;
    if (isCircadianHelixZoom(zl) && normalizedCircadianState() !== 'off') return false;
    return true;
  }

  /** True when sub-day geometry should sit on the day-disk stack (not the annual Earth helix). */
  function shouldUseCircadianNearEarthShortPlacement() {
    return isHelixZoomShortStackFrame();
  }

  /**
   * World position for an instant event on the blended hour-hand tip (same frame as helix ribbons).
   * @returns {{x:number,y:number,z:number}|null}
   */
  function getInstantEventCircadianNearEarthPosition(when, currentHeight) {
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') return null;
    if (!when || isNaN(when.getTime())) return null;
    const r = clampShortCircadianRadiusFromEarth(
      typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5
    );
    return CR.blendedDiskPointAtDate(when, r, currentHeight, calculateDateHeight, getCircadianStraightenBlendForEvents());
  }

  /**
   * Midpoint between start/end hand tips for sub-day spans (matches ribbon locus when ribbons fail).
   * @returns {{x:number,y:number,z:number}|null}
   */
  function getShortEventCircadianNearEarthPosition(start, end, currentHeight, rOverride) {
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') return null;
    if (!start || !end || !(end > start)) return null;
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    const r = clampShortCircadianRadiusFromEarth(
      rOverride != null && !isNaN(rOverride)
        ? rOverride
        : (typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5)
    );
    return CR.blendedDiskPointAtDate(mid, r, currentHeight, calculateDateHeight, getCircadianStraightenBlendForEvents());
  }

  /**
   * Local frame on the daily disk at `date`: +X along time-of-day, +Y radial (away from Earth), +Z disk normal.
   * @returns {{ position: {x:number,y:number,z:number}, quaternion: import('three').Quaternion }|null}
   */
  function sampleCircadianDiskMarkerFrame(date, r, refHeight) {
    const THREE = global.THREE;
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!THREE || !CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') {
      return null;
    }
    if (!date || isNaN(date.getTime())) return null;
    r = clampShortCircadianRadiusFromEarth(r);
    const blend = getCircadianStraightenBlendForEvents();
    const p = CR.blendedDiskPointAtDate(date, r, refHeight, calculateDateHeight, blend);
    const pT = CR.blendedDiskPointAtDate(new Date(date.getTime() + 60000), r, refHeight, calculateDateHeight, blend);
    const pIn = CR.blendedDiskPointAtDate(date, Math.max(r * 0.2, 0.5), refHeight, calculateDateHeight, blend);
    if (!p || !pT || !pIn) return null;
    const tangent = new THREE.Vector3(pT.x - p.x, pT.y - p.y, pT.z - p.z);
    if (tangent.lengthSq() < 1e-14) return { position: p, quaternion: new THREE.Quaternion() };
    tangent.normalize();
    const width = new THREE.Vector3(p.x - pIn.x, p.y - pIn.y, p.z - pIn.z);
    if (width.lengthSq() < 1e-14) {
      width.set(0, 1, 0);
    } else {
      width.normalize();
    }
    const normal = new THREE.Vector3().crossVectors(tangent, width);
    if (normal.lengthSq() < 1e-14) {
      return { position: p, quaternion: new THREE.Quaternion() };
    }
    normal.normalize();
    width.crossVectors(normal, tangent).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tangent, width, normal)
    );
    return { position: p, quaternion: quat };
  }

  function durationHoursBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / (3600 * 1000);
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MS_PER_HOUR = MS_PER_DAY / 24;
  /** ~calendar month / quarter for context bands (days). */
  const CONTEXT_MONTH_DAYS = 31;
  const CONTEXT_QUARTER_DAYS = 92;
  /** Mean tropical year (days); “sub-year” uses strict `<` this. */
  const CONTEXT_YEAR_DAYS = 365.25;
  const CONTEXT_DECADE_DAYS = CONTEXT_YEAR_DAYS * 10;
  const CONTEXT_CENTURY_DAYS = CONTEXT_YEAR_DAYS * 100;

  /** Span length in days (fractional). Zero if missing or non-positive span. */
  function durationDaysBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / MS_PER_DAY;
  }

  /**
   * “Roughly a week” (5–10 d): one canonical ribbon annulus in {@link getEventBandRadii} and no duration-rank
   * concentric spread, so neighbors with slightly different lengths share the same radii.
   */
  const WEEKISH_PLATEAU_MIN_DAYS = 5;
  const WEEKISH_PLATEAU_MAX_DAYS = 10;
  function isWeekishDurationDays(durationDays) {
    const d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    return d >= WEEKISH_PLATEAU_MIN_DAYS && d <= WEEKISH_PLATEAU_MAX_DAYS;
  }

  /** True when {@link getEventBandRadii} uses the week-corridor annulus (not the >7 d month sweep). */
  function eventBandUsesWeekCorridor(durationDays) {
    const d = Math.max(typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0, 1e-4);
    const dBand = isWeekishDurationDays(d) ? 7 : d;
    return dBand <= 7;
  }

  /**
   * Each zoom’s “focused” spans are one step **smaller** than the view unit (sub outer / super inner).
   * Moment (0) / Clock (9): sub-day [0, 1). Century (1): (decade, century]. Decade (2): all super-year (d > 1 y).
   * Year (3): (quarter, year). Quarter (4): (month, quarter]. Month (5) / Lunar (6): (week, month].
   * Week (7): (day, synodic month] — window is prev full moon → next full moon. Day (8): (0, 1d].
   * Keep in sync with `yang/web/index.html` list filter.
   */
  function eventDurationEligibleForFullListAtZoom(durationDays, zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : 5;
    const d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    if (z <= 0 || z >= 9) return d >= 0;
    if (z === 1) return d > CONTEXT_DECADE_DAYS;
    if (z === 2) return d > 1;
    // Zooms 3-7 (Year, Quarter, Month, Lunar Month, Week): all sub-year to super-day events (d > 1 day) show up
    if (z >= 3 && z <= 7) return d > 1;
    if (z === 8) return d >= 0;
    return true;
  }

  /**
   * Smallest zoom at which this span is in the focused band (for legacy callers).
   */
  function eventTextLabelsMinZoomForDurationDays(durationDays) {
    const d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    for (let zz = 1; zz <= 9; zz++) {
      if (eventDurationEligibleForFullListAtZoom(d, zz)) return zz;
    }
    if (eventDurationEligibleForFullListAtZoom(d, 0)) return 0;
    return 9;
  }

  /**
   * `rInner` / `rOuter` are already from getEventBandRadii (week/month/day corridor vs span) — keep them as the zone anchor.
   * With `rank01` (0 = shortest in layer, 1 = longest): nudge **inner** sun-ward and **outer** Earth-ward by `u` so longer
   * ribbons separate; **outer** stays capped inside the day-number → day-name annulus (same as TimeMarkers text rings).
   * Without rank: remap midpoint into [~0.26W, 0.44W] for legacy list/spine callers that are not span-zoned.
   */
  function applyConcentricEventRibbonRadii(earthDist, rInner, rOuter, rank01) {
    const W = earthDist;
    const riBase = rInner;
    const roBase = rOuter;
    let ri = riBase;
    let ro = roBase;
    if (rank01 != null && isFinite(rank01)) {
      const u = Math.max(0, Math.min(1, rank01));
      const bandWidth = Math.max(W * 0.01, roBase - riBase);
      ri = riBase + (bandWidth * 0.1) * u;
      ro = Math.min(roBase, ri + bandWidth);
      if (ro < ri + W * 0.008) ro = ri + W * 0.008;
      return { rInner: ri, rOuter: ro };
    }
    return { rInner: riBase, rOuter: roBase };
  }

  /** Push overlapping long-term ribbons to slightly different radii when lane packing cannot split them on the disk. */
  function applyOverlapLaneRadialNudge(earthDist, rInner, rOuter, overlapLane, peakLanes) {
    const lane = typeof overlapLane === 'number' && overlapLane > 0 ? overlapLane : 0;
    const peak = Math.max(1, peakLanes || 1);
    if (lane <= 0 || peak <= 1) return { rInner, rOuter };
    const W = earthDist;
    const band = Math.max(rOuter - rInner, W * 0.014);
    const step = Math.min(W * 0.013, band * 0.38);
    const nudge = step * lane;
    const { dayName: rDnm } = getDayNumberNameBand(W);
    const outerCap = rDnm - W * 0.0025;
    let ri = rInner + nudge * 0.5;
    let ro = rOuter + nudge;
    if (ro > outerCap) {
      const spill = ro - outerCap;
      ro = outerCap;
      ri = Math.max(rInner, ri - spill * 0.45);
    }
    if (ro < ri + W * 0.012) ro = ri + W * 0.012;
    return { rInner: ri, rOuter: ro };
  }

  function shouldApplyConcentricEventRibbonLayout(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : 5;
    if (z <= 1) return false;
    if (z >= 8) return false;
    return true;
  }

  /** Long-term ribbons keep one stable radial lane regardless of zoom. */
  function shouldApplyConcentricLongEventRibbonLayout() {
    return true;
  }

  function buildDurationRankMapForEvents(events) {
    const ranks = new Map();
    if (!events || !events.length) return ranks;
    const items = [];
    for (let i = 0; i < events.length; i++) {
      const s = getEventStart(events[i]);
      let e = getEventEnd(events[i]);
      if (!s || isNaN(s.getTime())) continue;
      if (!e || e <= s) e = new Date(s.getTime() + MS_PER_DAY);
      const d = durationDaysBetween(s, e);
      items.push({ i, d: Math.max(d, 1e-4) });
    }
    if (items.length === 0) return ranks;
    items.sort((a, b) => a.d - b.d);
    const n = items.length;
    for (let k = 0; k < n; k++) {
      ranks.set(items[k].i, n === 1 ? 0.5 : k / (n - 1));
    }
    return ranks;
  }

  function buildDurationRankMapForLines(lines) {
    const ranks = new Map();
    if (!lines || !lines.length) return ranks;
    const items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const s = line.start instanceof Date ? line.start : null;
      let e = line.end instanceof Date ? line.end : null;
      if (!s || isNaN(s.getTime())) continue;
      if (!e || e <= s) e = new Date(s.getTime() + MS_PER_DAY);
      const d = durationDaysBetween(s, e);
      items.push({ i, d: Math.max(d, 1e-4) });
    }
    if (items.length === 0) return ranks;
    items.sort((a, b) => a.d - b.d);
    const n = items.length;
    for (let k = 0; k < n; k++) {
      ranks.set(items[k].i, n === 1 ? 0.5 : k / (n - 1));
    }
    return ranks;
  }

  function areEventTextLabelsVisibleAtCurrentZoom(start, end) {
    if (!start || !end || !(end > start)) return false;
    const zlLbl = getZoomLevelForEvents();
    if (zlLbl === 8 && isLongTermSpanForDailySky(start, end) && eventTouchesSelectedMonthWindow(start, end)) {
      return true;
    }
    if (isSub24HourSpan(start, end) && !eventTouchesSelectedCalendarDay(start, end)) return false;
    if (!isEventLabelRadialContextSurpassesInner(start, end)) return false;
    const zl = getZoomLevelForEvents();
    const days = durationDaysBetween(start, end);
    return eventDurationEligibleForFullListAtZoom(days, zl);
  }

  /**
   * Event **titles** (mid name) stay visible when zoomed in even if the span is outside the Event List “focus band”
   * for that zoom. MM/DD endpoints still follow {@link areEventTextLabelsVisibleAtCurrentZoom}.
   * All text is suppressed when the list-context ring does not reach past this event’s ribbon {@link getEventBandRadii} rInner.
   */
  function areEventNameLabelsVisibleAtCurrentZoom(start, end) {
    if (!start || !end || !(end > start)) return false;
    const zlLbl = getZoomLevelForEvents();
    if (zlLbl === 8 && isLongTermSpanForDailySky(start, end) && eventTouchesSelectedMonthWindow(start, end)) {
      return true;
    }
    if (isSub24HourSpan(start, end) && !eventTouchesSelectedCalendarDay(start, end)) return false;
    if (!isEventLabelRadialContextSurpassesInner(start, end)) return false;
    if (areEventTextLabelsVisibleAtCurrentZoom(start, end)) return true;
    const zl = Math.floor(Number(getZoomLevelForEvents()) || 5);
    if (zl < 3) return false;
    return durationDaysBetween(start, end) >= 2;
  }

  function isSub24HourSpan(start, end) {
    if (!end || end <= start) return true;
    return durationHoursBetween(start, end) < 24;
  }

  function datesSameCalendarDay(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** Week starts Sunday (0) — matches week zoom / navigateUnit. */
  function startOfLocalWeekSunday(d) {
    if (!d || isNaN(d.getTime())) return null;
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = x.getDay();
    x.setDate(x.getDate() - dow);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function eventOverlapsLocalWeek(evStart, evEnd, weekStart) {
    if (!weekStart || !evStart || isNaN(evStart.getTime())) return false;
    const ws = weekStart.getTime();
    const we = ws + 7 * MS_PER_DAY;
    const es = evStart.getTime();
    const ee = evEnd && evEnd > evStart ? evEnd.getTime() : es + 3600000;
    return ee > ws && es < we;
  }

  /** True if the event interval intersects the selected calendar day (local). */
  function eventTouchesSelectedCalendarDay(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const dayStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime());
    dayEnd.setDate(dayEnd.getDate() + 1);
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return evEnd > dayStart && start < dayEnd;
  }

  /** Zoom 8 STE: show sub-day events within ±3 days of the selected day (7-day window). */
  function eventTouchesSelectedWeekWindow(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const winStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() - 3, 0, 0, 0, 0);
    const winEnd = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + 4, 0, 0, 0, 0);
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return evEnd > winStart && start < winEnd;
  }

  /** Read user-controlled STE month-range setting (default 2 = current + next month). */
  function getSteWindowMonths() {
    return typeof global.getSteWindowMonths === 'function' ? Math.max(1, global.getSteWindowMonths()) : 2;
  }

  /** STEs visible from the start of the selected month through N months ahead (slider-controlled). */
  function eventTouchesSelectedMonthRangeWindow(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const months = getSteWindowMonths();
    const winStart = new Date(sel.getFullYear(), sel.getMonth(), 1, 0, 0, 0, 0);
    const winEnd = new Date(sel.getFullYear(), sel.getMonth() + months, 1, 0, 0, 0, 0);
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return evEnd > winStart && start < winEnd;
  }

  /** Zoom 8 LTE: show long-term events that fall anywhere in the selected calendar month. */
  function eventTouchesSelectedMonthWindow(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const winStart = new Date(sel.getFullYear(), sel.getMonth(), 1, 0, 0, 0, 0);
    const winEnd = new Date(sel.getFullYear(), sel.getMonth() + 1, 1, 0, 0, 0, 0);
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return evEnd > winStart && start < winEnd;
  }

  /** True if the event overlaps the selected local hour window [floor hour, +1h). */
  function eventTouchesSelectedHour(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    const hourStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), sel.getHours(), 0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 3600000);
    return evEnd > hourStart && start < hourEnd;
  }

  /**
   * Event Horizon time window (Zoom-7 week, all zooms). STE nest inside this shell.
   * Shift may widen via getEventDisplayTimeBoundsMs → parent nest.
   * @returns {{ t0: number, t1: number, unit?: string }|null}
   */
  function getSelectedParentUnitBounds() {
    if (typeof global.getEventDisplayTimeBoundsMs === 'function') {
      try {
        const b = global.getEventDisplayTimeBoundsMs(getZoomLevelForEvents());
        if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) return b;
      } catch (e) { /* fall through */ }
    }
    if (typeof global.getExplodedContextTimeBoundsMs === 'function') {
      try {
        const b = global.getExplodedContextTimeBoundsMs(getZoomLevelForEvents());
        if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) return b;
      } catch (e) { /* fall through */ }
    }
    if (typeof global.getContextSphereTimeBoundsMs === 'function') {
      try {
        const b = global.getContextSphereTimeBoundsMs(getZoomLevelForEvents());
        if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) return b;
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  /**
   * Wider LTE density window — zoom-relative context (± grain), outside Event Horizon.
   * @returns {{ t0: number, t1: number, unit?: string }|null}
   */
  function getLteDensityTimeBounds() {
    if (typeof global.getZoomRelativeContextTimeBoundsMs === 'function') {
      try {
        const b = global.getZoomRelativeContextTimeBoundsMs(getZoomLevelForEvents());
        if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) return b;
      } catch (e) { /* optional */ }
    }
    if (typeof global.getParentUnitTimeBoundsMs === 'function') {
      try {
        const b = global.getParentUnitTimeBoundsMs(getZoomLevelForEvents());
        if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) return b;
      } catch (e) { /* optional */ }
    }
    return getSelectedParentUnitBounds();
  }

  /**
   * Clamp STE nest to Event Horizon week. Day-frame LTE dailies keep full span
   * on the annual day time frame (same Zoom-5 month, no week chop, no Shift).
   */
  function clampEventSpanToContextSphere(start, end) {
    if (!start || isNaN(start.getTime())) return null;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    if (!isSteStyleDailySpan(start, evEnd)) {
      return { start, end: evEnd, clipped: false };
    }
    if (shouldRenderDayFrameSubDayOnAnnualHelix()) {
      return { start, end: evEnd, clipped: false };
    }
    const b = getSelectedParentUnitBounds();
    if (!b) return { start, end: evEnd, clipped: false };
    const s = Math.max(start.getTime(), b.t0);
    const e = Math.min(evEnd.getTime(), b.t1);
    if (!(e > s)) return null;
    const clipped = s > start.getTime() || e < evEnd.getTime();
    return { start: new Date(s), end: new Date(e), clipped };
  }

  /**
   * STE circadian nest → Event Horizon week (Shift may widen).
   * Day-frame LTE dailies → Zoom-5 month (visible at closer zooms without Shift).
   */
  function eventTouchesSelectedParentWindow(start, end) {
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return isEventInSelectedYear(start, evEnd);
  }

  /** Hard-cull: LTE events only culled if outside selected year. */
  function shouldHideOutsideParentUnitWindow(start, end) {
    return !eventTouchesSelectedParentWindow(start, end);
  }

  function getSelectedDateTimeFn() {
    if (typeof global.getSelectedDateTime === 'function') return global.getSelectedDateTime;
    return null;
  }

  /**
   * Orbital phase zero = wall-clock now height (`startAngle` epoch).
   * Selected date is Y + Earth XZ only. Using selected height here parks
   * local events at now's longitude — opposite the Sun from Selected Earth
   * after navigating years, then zooming in.
   */
  function getWorldlineOrbitReferenceHeight() {
    if (typeof global.getOrbitPhaseReferenceHeight === 'function') {
      try {
        const h = global.getOrbitPhaseReferenceHeight();
        if (h != null && !isNaN(h)) return h;
      } catch (e) { /* fall through */ }
    }
    const zl = getZoomLevelForEvents();
    if (typeof global.computeSceneDateHeights === 'function') {
      try {
        const pack = global.computeSceneDateHeights(zl);
        if (pack && typeof pack.currentDateHeight === 'number' && !isNaN(pack.currentDateHeight)) {
          return pack.currentDateHeight;
        }
      } catch (e) { /* fall through */ }
    }
    if (typeof SceneGeometry !== 'undefined' && typeof SceneGeometry.getCurrentDateHeight === 'function') {
      try {
        const h = SceneGeometry.getCurrentDateHeight(zl);
        if (h != null && !isNaN(h)) return h;
      } catch (e) { /* fall through */ }
    }
    if (typeof calculateActualCurrentDateHeight === 'function') {
      const h = calculateActualCurrentDateHeight();
      if (h != null && !isNaN(h)) return h;
    }
    return typeof calculateCurrentDateHeight === 'function' ? calculateCurrentDateHeight() : 0;
  }

  function getEventOrbitReferenceHeight() {
    return getWorldlineOrbitReferenceHeight();
  }

  function isDateOnSelectedCalendarDay(d) {
    const fn = getSelectedDateTimeFn();
    if (!fn) return false;
    return datesSameCalendarDay(d, fn());
  }

  function getRadiusForDailyEventDot(earthDist, midDate, indexOffset) {
    let r;
    if (shouldUseDayFrameSubDayHelixPlacement()) {
      r = getRadiusInDayMarkerFrame(midDate, earthDist, indexOffset);
    } else if (shouldUseDayBandDotPlacement()) {
      const band = getDayNumberNameBand(earthDist);
      r = typeof band.sphere === 'number' ? band.sphere : earthDist * DAY_EVENT_DOT_RADIUS_FRAC;
    } else {
      r = getRadiusForTimeOfDay(midDate, earthDist, indexOffset);
    }
    const zl = getZoomLevelForEvents();
    if (shouldApplyConcentricEventRibbonLayout(zl)) {
      r = Math.min(r, earthDist * 0.42);
    }
    return r;
  }

  function isZoom5AndHigher(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : getZoomLevelForEvents();
    return z === 4 || z === 5 || z === 6 || z === 7 || z === 8 || z === 9 || z === 0;
  }

  function getCircadianWorldPointAtDate(atDate) {
    if (!atDate || typeof global.CircadianRenderer === 'undefined' || !global.CircadianRenderer.blendedDiskPointAtDate) return null;
    const currentHeight = getEventOrbitReferenceHeight();
    const hl = typeof global.CircadianRenderer.getHandLength === 'function'
      ? global.CircadianRenderer.getHandLength()
      : 12;
    return global.CircadianRenderer.blendedDiskPointAtDate(
      atDate,
      hl,
      currentHeight,
      calculateDateHeight,
      getCircadianStraightenBlendForEvents()
    );
  }

  function getAnnualDayFrameWorldPointAtDate(atDate) {
    if (!atDate) return null;
    const earthDist = (typeof PLANET_DATA !== 'undefined' && PLANET_DATA.find(p => p.name === 'Earth'))
      ? PLANET_DATA.find(p => p.name === 'Earth').distance
      : 50;
    const refHeight = getWorldlineOrbitReferenceHeight();
    const eventTz = getEventTimeZoneId(null);
    const viewerTz = getUserTimeZoneId();
    if (typeof computeDayFrameAnchor === 'function' && typeof dayFramePositionFromAnchor === 'function') {
      const anchor = computeDayFrameAnchor(atDate, eventTz, viewerTz, earthDist, refHeight, 0, true);
      if (anchor) {
        return dayFramePositionFromAnchor(anchor, anchor.rMid);
      }
    }
    return null;
  }

  const RAY_CATEGORY_PALETTE = [
    0xf59e0b, // Amber / Gold
    0x3b82f6, // Blue
    0x10b981, // Emerald Green
    0xec4899, // Pink / Rose
    0x8b5cf6, // Violet / Purple
    0xf97316, // Orange
    0x06b6d4, // Cyan
    0x84cc16, // Lime
    0xa855f7  // Deep Purple
  ];

  function hashStringToColorHex(str) {
    if (!str) return 0xf59e0b;
    let hash = 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % RAY_CATEGORY_PALETTE.length;
    return RAY_CATEGORY_PALETTE[idx];
  }

  function resolveEventConnectorColor(colorHex, parent) {
    const targets = [];
    if (parent) {
      if (parent.userData) targets.push(parent.userData);
      if (parent.children && parent.children.length) {
        parent.children.forEach(c => { if (c && c.userData) targets.push(c.userData); });
      }
    }

    for (const u of targets) {
      if (!u) continue;
      const isDefaultCyan = (c) => c === 0x00b4d8 || c === '#00b4d8' || c === '0x00b4d8';
      if (u.fillColor != null && u.fillColor !== '' && !isDefaultCyan(u.fillColor)) return u.fillColor;
      if (u.eventHex != null && u.eventHex !== '' && !isDefaultCyan(u.eventHex)) return u.eventHex;
      if (u.colorHex != null && u.colorHex !== '' && !isDefaultCyan(u.colorHex)) return u.colorHex;
      if (u.color != null && u.color !== '' && !isDefaultCyan(u.color)) return u.color;
      if (u.layerConfig) {
        if (u.layerConfig.fillColor != null && u.layerConfig.fillColor !== '' && !isDefaultCyan(u.layerConfig.fillColor)) return u.layerConfig.fillColor;
        if (u.layerConfig.color != null && u.layerConfig.color !== '' && !isDefaultCyan(u.layerConfig.color)) return u.layerConfig.color;
      }
      const ev = u.event || u.vevent;
      if (ev) {
        if (ev.fillColor != null && ev.fillColor !== '' && !isDefaultCyan(ev.fillColor)) return ev.fillColor;
        if (ev.color != null && ev.color !== '' && !isDefaultCyan(ev.color)) return ev.color;
        const cat = ev.category || (Array.isArray(ev.categories) && ev.categories[0]);
        if (cat && typeof global !== 'undefined' && global.circaevumGL) {
          const catStyles = global.circaevumGL.layerStylesByCategory || {};
          if (catStyles[cat] && catStyles[cat].color) return catStyles[cat].color;
        }
      }
    }

    if (colorHex != null && colorHex !== undefined && colorHex !== 0x00b4d8 && colorHex !== '#00b4d8') {
      return colorHex;
    }

    // Fallback: derive distinct, consistent category color from event category/summary hash
    for (const u of targets) {
      if (!u) continue;
      const ev = u.event || u.vevent;
      if (ev) {
        const key = ev.category || (Array.isArray(ev.categories) && ev.categories[0]) || ev.summary || ev.title || ev.uid || ev.id;
        if (key) return hashStringToColorHex(key);
      }
    }

    return 0xf59e0b;
  }

  /**
   * Translucent ray of light connecting Annual Day event position to Circadian day event position for Zooms 5 and higher.
   * Appears as a subtle, translucent ray in the event's category color.
   */
  function addCircadianConnectorIfApplicable(parent, ax, ay, az, atDate, colorHex) {
    return;
  }

  /**
   * Radius for a sub-day instant on the annual helix — day-marker frame when not on circadian disks.
   * @param {Date} date - used for time-of-day (hours/minutes)
   * @param {number} earthDist - Earth orbit distance
   * @param {number} indexOffset - optional small per-event offset (e.g. index % 3) to separate same-time events
   * @returns {number} radius
   */
  function getRadiusForTimeOfDay(date, earthDist, indexOffset) {
    if (shouldUseDayFrameSubDayHelixPlacement()) {
      return getRadiusInDayMarkerFrame(date, earthDist, indexOffset);
    }
    const inner = earthDist * EVENT_RADIUS_INNER_FRACTION;
    const outer = earthDist * EVENT_RADIUS_OUTER_FRACTION;
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const t = hours / 24;
    const closenessToNoon = 1 - 2 * Math.abs(t - 0.5);
    const r = outer - (outer - inner) * Math.max(0, Math.min(1, closenessToNoon));
    const offset = (indexOffset != null ? indexOffset : 0) * 0.6;
    return Math.max(inner, Math.min(outer, r + offset));
  }

  /**
   * Radius for long-term events: proportional to event length with log scaling so very long events don't get too large.
   * Longer event -> larger radius (further from Sun). Uses ln(durationDays + 1) / ln(365) capped at 1.
   * @param {number} durationDays - event duration in days
   * @param {number} earthDist - Earth orbit distance
   * @returns {number} radius
   */
  function getRadiusForDuration(durationDays, earthDist) {
    const inner = earthDist * EVENT_RADIUS_INNER_FRACTION;
    const outer = earthDist * EVENT_RADIUS_OUTER_FRACTION;
    const logNorm = Math.log(Math.max(0, durationDays) + 1) / Math.log(365);
    const factor = Math.max(0, Math.min(1, logNorm));
    return inner + (outer - inner) * factor;
  }

  /** Same radii as TimeMarkers `day.label` / `day.dayName` / `day.sphere`. */
  function getDayNumberNameBand(earthDist) {
    const W = earthDist;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
      const z = TimeMarkers.getCanonicalRadialZones(W);
      return {
        label: z.day.label,
        dayName: z.day.dayName,
        sphere: typeof z.day.sphere === 'number' ? z.day.sphere : W * DAY_EVENT_DOT_RADIUS_FRAC
      };
    }
    return {
      label: W * DAY_NUMBER_RADIUS_FRAC,
      dayName: W * DAY_NAME_RADIUS_FRAC,
      sphere: W * DAY_EVENT_DOT_RADIUS_FRAC
    };
  }

  /**
   * Day-marker radial frame: inner = midnight (pedagogical L1 / sunward),
   * outer = end of day (pedagogical L2). Span = circadian noon↔midnight (2×hand).
   */
  function getDayMarkerFrameRadii(earthDist) {
    const W = earthDist;
    if (
      typeof TimeMarkers !== 'undefined' &&
      typeof TimeMarkers.getEarthOrbitL1L2DayFrameRadii === 'function' &&
      typeof window !== 'undefined' &&
      typeof window.getSingularBandMode === 'function' &&
      window.getSingularBandMode()
    ) {
      const day = TimeMarkers.getEarthOrbitL1L2DayFrameRadii(W);
      return { inner: day.inner, outer: day.outer };
    }
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
      const z = TimeMarkers.getCanonicalRadialZones(W);
      return { inner: z.day.inner, outer: z.day.outer };
    }
    return { inner: W * 5 / 8, outer: W * 3 / 4 };
  }

  function getFractionOfDay(date) {
    if (!date || isNaN(date.getTime())) return 0;
    return (date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600) / 24;
  }

  function getUserTimeZoneId() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  function getEventTimeZoneId(event) {
    if (!event) return getUserTimeZoneId();
    const ds = event.dtstart;
    if (ds && ds.timeZone) return ds.timeZone;
    if (event.timeZone) return event.timeZone;
    return getUserTimeZoneId();
  }

  function getZonedDateParts(date, timeZone) {
    const d = date instanceof Date ? date : new Date(date);
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = fmt.formatToParts(d);
      const get = (type) => {
        const p = parts.find((x) => x.type === type);
        return p ? parseInt(p.value, 10) : 0;
      };
      return {
        year: get('year'),
        month: get('month') - 1,
        day: get('day'),
        hour: get('hour') % 24,
        minute: get('minute'),
        second: get('second')
      };
    } catch (e) {
      return {
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        hour: d.getHours(),
        minute: d.getMinutes(),
        second: d.getSeconds()
      };
    }
  }

  function getFractionOfDayInTimeZone(date, timeZone) {
    const p = getZonedDateParts(date, timeZone);
    return (p.hour + p.minute / 60 + p.second / 3600) / 24;
  }

  /** UTC offset in minutes (east of UTC positive) for `timeZone` at `date`. */
  function getUtcOffsetMinutesForTimeZone(timeZone, date) {
    const d = date instanceof Date ? date : new Date(date);
    try {
      const p = getZonedDateParts(d, timeZone);
      const asUtc = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
      return (asUtc - d.getTime()) / 60000;
    } catch (e) {
      return -d.getTimezoneOffset();
    }
  }

  function getDayFrameHeightPerHour() {
    const hy = typeof HEIGHT_PER_YEAR !== 'undefined' ? HEIGHT_PER_YEAR : 100;
    return hy / (365.25 * 24);
  }

  /** CRTBP γ ≈ (μ/3)^(1/3) — L1/L2 sit at (1±γ)·W from Sun (~0.01·W from Earth). */
  function getEarthLagrangeGamma() {
    const cfg =
      typeof SCENE_CONFIG !== 'undefined' && SCENE_CONFIG && SCENE_CONFIG.lagrangeMarkers
        ? SCENE_CONFIG.lagrangeMarkers
        : null;
    const mu =
      cfg && typeof cfg.earthToSunMassRatio === 'number' && cfg.earthToSunMassRatio > 0
        ? cfg.earthToSunMassRatio
        : 3.00346e-6;
    return Math.pow(mu / 3, 1 / 3);
  }

  /**
   * Nesting resolver — Event Horizon radius (geocentric).
   * Pedagogical L1↔L2 half-span from Earth orbit (= circadian noon↔midnight hand length).
   * STE lives inside this sphere; LTE day floor / sky live on or outside it.
   */
  function getEventHorizonRadius(earthDist) {
    const W = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : getEarthDistance();
    if (
      typeof TimeMarkers !== 'undefined' &&
      typeof TimeMarkers.getEarthOrbitL1L2DayFrameRadii === 'function'
    ) {
      const day = TimeMarkers.getEarthOrbitL1L2DayFrameRadii(W);
      if (day && day.halfSpan > 0) return day.halfSpan;
    }
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (CR && typeof CR.getHandLength === 'function') {
      const h = CR.getHandLength();
      if (h > 0) return h;
    }
    return W * 0.1;
  }

  /** Earth-marker center on the annual worldline at height `refHeight` (Event Horizon origin). */
  function getEarthEventHorizonCenter(refHeight, earthDist) {
    const W = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : getEarthDistance();
    const y =
      typeof refHeight === 'number' && isFinite(refHeight)
        ? refHeight
        : getWorldlineOrbitReferenceHeight();
    const refWl = getWorldlineOrbitReferenceHeight();
    const angle =
      typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(y, refWl)
        : 0;
    return { x: Math.cos(angle) * W, y, z: Math.sin(angle) * W, W };
  }

  /**
   * 0 = full annual day-marker / Context Arc frame; 1 = full circadian near-Earth frame.
   * Nesting resolver / Event Horizon: sharp in time — STE only near SELECTED day;
   * no week-long mushy warp (that tore LTE day ribbons into diagonals).
   */
  function getContextArcToCircadianBlend(when, earthDist) {
    void earthDist;
    if (typeof global.isEventHorizonWarpEnabled === 'function') {
      try {
        if (!global.isEventHorizonWarpEnabled()) return 0;
      } catch (e) {
        return 0;
      }
    } else if (typeof global.getEventHorizonMode === 'function') {
      try {
        if (global.getEventHorizonMode() !== 'nest') return 0;
      } catch (e) {
        return 0;
      }
    } else {
      return 0;
    }
    if (!when || isNaN(when.getTime())) return 0;
    let sel = null;
    if (typeof global.getSelectedDateTime === 'function') {
      const s = global.getSelectedDateTime();
      if (s instanceof Date && !isNaN(s.getTime())) sel = s;
    }
    if (!sel) return 0;
    const dayMs = 86400000;
    const absDays = Math.abs(when.getTime() - sel.getTime()) / dayMs;
    // Hard STE on selected day; hard LTE by ±1.25 days — Event Horizon in calendar time.
    if (absDays <= 0.35) return 1;
    if (absDays >= 1.25) return 0;
    const t = (absDays - 0.35) / (1.25 - 0.35);
    const u = 1 - Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  }

  /** Circadian target point for an instant (hour-hand disk); null if unavailable. */
  function sampleCircadianBlendTarget(when, refHeight) {
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') {
      return null;
    }
    if (!when || isNaN(when.getTime())) return null;
    if (normalizedCircadianState() === 'off') return null;
    const zl = getZoomLevelForEvents();
    if (!isCircadianHelixZoom(zl) && zl < 7) return null;
    const r = clampShortCircadianRadiusFromEarth(
      typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5
    );
    return CR.blendedDiskPointAtDate(
      when,
      r,
      refHeight,
      calculateDateHeight,
      getCircadianStraightenBlendForEvents()
    );
  }

  /**
   * LTE Interstellar disc strength from SELECTED DATE (calendar days).
   * Soft ramp through whole band (not binary inside EH) so ribbons bend gradually
   * like densified time markers — full near selected, easing toward rim, fade past EH.
   * @returns {number} 0..1 warp strength
   */
  function getSelectedWeekLteWarpAmount(when) {
    if (typeof global.isEventHorizonWarpEnabled === 'function') {
      try {
        if (!global.isEventHorizonWarpEnabled()) return 0;
      } catch (e) {
        return 0;
      }
    } else if (typeof global.getEventHorizonMode === 'function') {
      try {
        if (global.getEventHorizonMode() !== 'nest') return 0;
      } catch (e) {
        return 0;
      }
    } else {
      return 0;
    }
    if (!when || isNaN(when.getTime())) return 0;
    const selFn = getSelectedDateTimeFn();
    if (!selFn) return 0;
    const sel = selFn();
    if (!sel || isNaN(sel.getTime())) return 0;
    const dayMs = 86400000;
    const selMid = sel.getTime();
    const whenMid = when.getTime();
    const absDays = Math.abs(whenMid - selMid) / dayMs;
    let ehHalf = 7;
    let warpOuter = 9;
    if (typeof global.getEventHorizonHalfDays === 'function') {
      try {
        ehHalf = Math.max(1, global.getEventHorizonHalfDays());
      } catch (e) { /* keep default */ }
    }
    if (typeof global.getEventHorizonWarpOuterHalfDays === 'function') {
      try {
        warpOuter = Math.max(ehHalf, global.getEventHorizonWarpOuterHalfDays());
      } catch (e) {
        warpOuter = ehHalf + 2;
      }
    } else {
      warpOuter = ehHalf + 2;
    }
    if (absDays >= warpOuter) return 0;
    // Full circadian circle at and inside Event Horizon; bow only in the outer fade.
    if (absDays <= ehHalf) return 1;
    const t = 1 - (absDays - ehHalf) / Math.max(warpOuter - ehHalf, 1e-6);
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  }

  /** Segment count for day-frame ribbons — densify under warp so disc arcs stay chord-free. */
  function getDayFrameRibbonSegmentCount(durationH, start, end) {
    const hrs = typeof durationH === 'number' && !isNaN(durationH) ? Math.max(durationH, 0.25) : 1;
    const mid = start && end
      ? new Date((start.getTime() + (end > start ? end.getTime() : start.getTime() + 3600000)) / 2)
      : start;
    const near = getSelectedWeekLteWarpAmount(mid);
    if (near > 0.05) {
      const arc = Math.ceil((hrs / 24) * 128);
      return Math.max(16, Math.min(128, Math.max(arc, Math.ceil(hrs * 4))));
    }
    return Math.max(3, Math.min(8, Math.ceil(hrs * 0.9)));
  }

  /**
   * Nesting resolver warp through Event Horizon.
   * Outside: STE → pole-taper spindle; LTE day-frame → full circadian circle
   * (midnight anti-sun, noon sunward). Camera inside → classic day-frame helix.
   */
  function lerpDayFrameTowardCircadian(dayPos, when, refHeight, earthDist, warpOpts) {
    if (!dayPos) return dayPos;
    const W = typeof global.ContextSphereWarp !== 'undefined' ? global.ContextSphereWarp : null;
    if (!W) return dayPos;
    if (typeof W.isWarpModeEnabled === 'function' && !W.isWarpModeEnabled()) {
      return { x: dayPos.x, y: dayPos.y, z: dayPos.z, _arcCircadianBlend: 0 };
    }
    const state =
      typeof global.getContextSphereState === 'function' ? global.getContextSphereState() : null;
    const inside = W.getCameraInsideCached();
    const blend = getContextArcToCircadianBlend(when, earthDist);
    if (blend > 0.55) {
      const q = W.warpStePoint(dayPos, state, inside);
      if (q) q._arcCircadianBlend = blend;
      return q || dayPos;
    }
    // LTE day frame: warp only near selected week. Rest = standard LTE day time frame.
    const amt = inside ? 0 : getSelectedWeekLteWarpAmount(when);
    if (!(amt > 0.001) || !state || !(state.radius > 0)) {
      return { x: dayPos.x, y: dayPos.y, z: dayPos.z, _arcCircadianBlend: blend };
    }
    let radialT = 0.5;
    try {
      const Worb = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : getEarthDistance();
      const day = getDayMarkerFrameRadii(Worb);
      if (day && day.outer > day.inner) {
        const rH = Math.hypot(dayPos.x, dayPos.z);
        radialT = Math.max(0, Math.min(1, (rH - day.inner) / (day.outer - day.inner)));
      }
    } catch (e) { /* keep mid band */ }
    const warped = W.warpLtePointToRing(
      dayPos,
      state,
      Object.assign(
        {
          cameraInside: false,
          radialT,
          diskWidth: state.radius * 0.28,
          amount: amt,
          when
        },
        warpOpts && typeof warpOpts === 'object' ? warpOpts : null
      )
    );
    if (!warped) {
      return { x: dayPos.x, y: dayPos.y, z: dayPos.z, _arcCircadianBlend: blend };
    }
    return {
      x: warped.x,
      y: warped.y,
      z: warped.z,
      _arcCircadianBlend: blend,
      _warpAngle: warped._warpAngle,
      _warpDelta: warped._warpDelta
    };
  }

  /**
   * Placement on the annual Earth helix day-marker frame: midnight spoke angle, time-of-day → radius,
   * earlier time zones below / later above the day line (Y), overlap lanes stack in Y.
   */
  function computeDayFrameAnchor(when, eventTz, viewerTz, earthDist, refHeight, overlapLane, onManifold) {
    const viewerParts = getZonedDateParts(when, viewerTz);
    const midnightY = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(viewerParts.year, viewerParts.month, viewerParts.day, 0)
      : 0;
    const eventOff = getUtcOffsetMinutesForTimeZone(eventTz, when);
    const viewerOff = getUtcOffsetMinutesForTimeZone(viewerTz, when);
    const diffHours = (eventOff - viewerOff) / 60;
    const maxTzHours = 12;
    const cappedTz = Math.max(-maxTzHours, Math.min(maxTzHours, diffHours));
    const hph = getDayFrameHeightPerHour();
    const lane = overlapLane != null ? overlapLane : 0;
    let y;
    let angleY = midnightY;
    if (onManifold) {
      // Worldline manifold: instant sets helix Y/angle (true span incl. 1hr); radius = time-of-day.
      if (typeof calculateDateHeight === 'function') {
        angleY = calculateDateHeight(
          viewerParts.year,
          viewerParts.month,
          viewerParts.day,
          viewerParts.hour,
          (viewerParts.minute || 0) / 60 + (viewerParts.second || 0) / 3600
        );
      }
      y = angleY + lane * hph * 0.1;
    } else {
      y = midnightY + cappedTz * hph * 0.92 + lane * hph * 1.18;
    }
    const angle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? SceneGeometry.getAngle(onManifold ? angleY : midnightY, refHeight)
      : 0;
    const { inner, outer } = getDayMarkerFrameRadii(earthDist);
    const t = getFractionOfDayInTimeZone(when, eventTz);
    const rMid = inner + t * (outer - inner);
    return { y, angle, rMid, inner, outer, t, diffHours: cappedTz };
  }

  function dayFramePositionFromAnchor(anchor, r) {
    return {
      x: Math.cos(anchor.angle) * r,
      y: anchor.y,
      z: Math.sin(anchor.angle) * r
    };
  }

  /**
   * Map wall-clock time into the day-marker annulus:
   * midnight at inner (L1 when singular), noon mid-band, evening → outer (L2).
   */
  function getRadiusInDayMarkerFrame(date, earthDist, indexOffset, event) {
    if (!shouldUseDayFrameSubDayHelixPlacement()) {
      const raw = getRadiusInDayMarkerFrameRaw(date, earthDist, indexOffset, event);
      return Math.max(raw.inner, Math.min(raw.outer, raw.r));
    }
    const viewerTz = getUserTimeZoneId();
    const eventTz = getEventTimeZoneId(event);
    const ref = typeof getWorldlineOrbitReferenceHeight === 'function' ? getWorldlineOrbitReferenceHeight() : 0;
    const anchor = computeDayFrameAnchor(date, eventTz, viewerTz, earthDist, ref, indexOffset, true);
    return Math.max(anchor.inner, Math.min(anchor.outer, anchor.rMid));
  }

  /** Unclamped radial position within the day frame (may lie outside inner/outer before clip). */
  function getRadiusInDayMarkerFrameRaw(date, earthDist, indexOffset, event) {
    const { inner, outer } = getDayMarkerFrameRadii(earthDist);
    const viewerTz = getUserTimeZoneId();
    const eventTz = getEventTimeZoneId(event);
    const t = shouldUseDayFrameSubDayHelixPlacement()
      ? getFractionOfDayInTimeZone(date, eventTz)
      : getFractionOfDay(date);
    const r = inner + t * (outer - inner);
    const offset = !shouldUseDayFrameSubDayHelixPlacement() && indexOffset != null
      ? indexOffset * (earthDist * 0.004)
      : 0;
    return { r: r + offset, inner, outer, t };
  }

  /**
   * Sub-day LTE ribbon width = full calendar-day pitch (midnight → next midnight), not radial inner→outer.
   */
  function shouldUseCalendarDayCrossSectionRibbon() {
    return shouldRenderDayFrameSubDayOnAnnualHelix();
  }

  /** Viewer-local calendar day: Y at midnight and at next midnight (day-marker row thickness). */
  function getCalendarDayCrossSectionYBounds(viewerParts) {
    if (!viewerParts || typeof calculateDateHeight !== 'function') {
      return { dayStartY: 0, dayEndY: 0 };
    }
    const dayStartY = calculateDateHeight(viewerParts.year, viewerParts.month, viewerParts.day, 0);
    const nextDay = new Date(viewerParts.year, viewerParts.month, viewerParts.day + 1);
    const dayEndY = calculateDateHeight(
      nextDay.getFullYear(),
      nextDay.getMonth(),
      nextDay.getDate(),
      0
    );
    return { dayStartY, dayEndY };
  }

  function dayFrameCrossSectionEdgePosition(crossY, rMid, refHeight, laneY) {
    const y = crossY + (laneY || 0);
    const angle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? SceneGeometry.getAngle(y, refHeight)
      : 0;
    return { x: Math.cos(angle) * rMid, y, z: Math.sin(angle) * rMid };
  }

  /**
   * Keep a visible band at day-frame clip edges — never taper ribbon width to zero at inner/outer.
   */
  function resolveDayFrameRibbonEdgeRadii(rMid, inner, outer, bandHalf) {
    const frameSpan = Math.max(outer - inner, 1e-6);
    const zl = getZoomLevelForEvents();
    const minBandFrac = (zl === 7 || zl === 8) ? 0.12 : 0.14;
    const minBand = Math.max(bandHalf * 2, frameSpan * minBandFrac);
    let rIn = rMid - bandHalf;
    let rOut = rMid + bandHalf;
    let clippedLow = false;
    let clippedHigh = false;
    if (rIn < inner) {
      clippedLow = true;
      rIn = inner;
      rOut = Math.max(rOut, inner + minBand);
    }
    if (rOut > outer) {
      clippedHigh = true;
      rOut = outer;
      rIn = Math.min(rIn, outer - minBand);
    }
    if (rOut - rIn < minBand) {
      const mid = Math.max(inner + minBand * 0.5, Math.min(outer - minBand * 0.5, rMid));
      rIn = Math.max(inner, mid - minBand * 0.5);
      rOut = Math.min(outer, mid + minBand * 0.5);
    }
    return { rIn, rOut, clippedLow, clippedHigh, minBand };
  }

  /** Sub-day LTE on the annual Earth helix (not circadian day-disk stack). */
  function shouldUseDayFrameSubDayHelixPlacement() {
    return !shouldUseCircadianNearEarthShortPlacement();
  }

  /**
   * Month/week/day: STE ribbons on annual helix day-marker frame (Selected Time Frame).
   * Month (5) / lunar (6) so a month of daily events can sit in STE view on the Context Arc spine.
   */
  function shouldRenderDayFrameSubDayOnAnnualHelix(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : getZoomLevelForEvents();
    if (z === 4 || z === 5 || z === 6 || z === 7 || z === 8 || z === 9 || z === 0) return true;
    return shouldUseDayFrameSubDayHelixPlacement();
  }

  /** Annual-helix day-frame ribbons use world Y (not circadian disk stack parent). */
  function prepareDayFrameRibbonUserData(userDataBase) {
    const ud = userDataBase ? { ...userDataBase } : {};
    const zl = getZoomLevelForEvents();
    if (zl === 4 || zl === 5 || zl === 6 || zl === 7 || zl === 8 || zl === 9 || zl === 0) {
      delete ud.circadianWorldSpaceLayer;
      ud.useWorldSpaceGroup = true;
      ud.immuneToFlatten = true;
    }
    return ud;
  }

  function combineSteCircadianAndAnnualRoots(circadianRoot, annualRoot, userData, start, end) {
    if (!annualRoot) return circadianRoot || null;
    if (!circadianRoot) {
      markShortEventPointerPickability(annualRoot, start, end);
      return annualRoot;
    }
    const dual = new global.THREE.Group();
    dual.userData = Object.assign({}, userData, {
      type: 'EventObject',
      dualStePlacement: true
    });
    if (annualRoot.userData && annualRoot.userData.dayFrameHelixRef) {
      const ref = annualRoot.userData.dayFrameHelixRef;
      dual.userData.dayFrameAnnualHelix = true;
      dual.userData.dayFrameHelixRef = {
        startMs: ref.startMs,
        endMs: ref.endMs,
        earthDist: ref.earthDist,
        indexOffset: ref.indexOffset,
        durationH: ref.durationH,
        segments: ref.segments,
        refWorldline: ref.refWorldline,
        logicalInnerFlat: ref.logicalInnerFlat ? ref.logicalInnerFlat.slice() : null,
        logicalOuterFlat: ref.logicalOuterFlat ? ref.logicalOuterFlat.slice() : null
      };
    }
    dual.add(circadianRoot);
    dual.add(annualRoot);

    const zl = getZoomLevelForEvents();
    if (isZoom5AndHigher(zl) && start) {
      const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
      const midDate = new Date((start.getTime() + evEnd.getTime()) / 2);
      const colorHex = (userData && (userData.fillColor || userData.color || userData.colorHex)) || 0x00b4d8;
      const annPt = getAnnualDayFrameWorldPointAtDate(midDate);
      if (annPt) {
        addCircadianConnectorIfApplicable(dual, annPt.x, annPt.y, annPt.z, midDate, colorHex);
      }
    }

    markShortEventPointerPickability(dual, start, end);
    return dual;
  }

  function maybeAppendAnnualDayFrameSte(circadianRoot, ribbonOpts, userData, start, end) {
    if (!shouldDrawAnnualDayFrameSteGeometry(start, end)) return circadianRoot;
    // LOD: at WEEK and closer, circadian disk is the primary view — skip dual
    // annual+circadian placement to avoid 2× ribbons + connector per daily.
    const zl = getZoomLevelForEvents();
    if ((zl === 7 || zl === 8 || zl === 9 || zl === 0) && circadianRoot) {
      return circadianRoot;
    }
    const annualRoot = tryCreateDayFrameSubDayRibbon(
      Object.assign({}, ribbonOpts, { skipLabels: !!circadianRoot })
    );
    return combineSteCircadianAndAnnualRoots(circadianRoot, annualRoot, userData, start, end);
  }

  function isAnnualDayFrameSteSpan(start, end) {
    return isSteStyleDailySpan(start, end);
  }

  /** Annual helix day-frame: Zoom-4/5 month of dailies, including closer zooms (no Shift).
   * LOD fix: WEEK (7) uses week window (~7d) not month window (~60d) to avoid
   * rebuilding 60 annual ribbons when only 7 are visible on circadian disks. */
  function shouldDrawAnnualDayFrameSteGeometry(start, end) {
    if (typeof global.flattenMode === 'string' && global.flattenMode === 'all') return false;
    if (!shouldRenderDayFrameSubDayOnAnnualHelix()) return false;
    if (!isAnnualDayFrameSteSpan(start, end)) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    if (shouldHideLongTermOnDailySkySte(start, evEnd)) return false;
    const zl = getZoomLevelForEvents();
    if (zl === 4 || zl === 5 || zl === 6 || zl === 8 || zl === 9 || zl === 0) {
      return eventTouchesZoom5DailyWindow(start, evEnd);
    }
    if (zl === 7) {
      return eventTouchesSelectedWeekWindow(start, evEnd);
    }
    return true;
  }

  /** Circadian disk-stack STEs — selected day at close zooms; Zoom 5 keeps the month on the nest. */
  function shouldDrawCircadianSteGeometry(start, end) {
    if (!shouldDrawDailySkySteGeometry(start, end)) return false;
    if (shouldHideCircadianShortEventForDayScope(start, end)) return false;
    const zl = getZoomLevelForEvents();
    if ((zl === 6 || zl === 7 || zl === 8 || zl === 9 || zl === 0) && isSteStyleDailySpan(start, end)) {
      if (isCircadianShortEventsShiftPreview()) return true;
      return eventTouchesSelectedCalendarDay(start, end);
    }
    // Month: dailies inside Selected Time Frame use STE; rest → LTE manifold.
    if ((zl === 4 || zl === 5) && isSteStyleDailySpan(start, end)) {
      return eventTouchesSelectedContextArcWindow(start, end);
    }
    return true;
  }

  function getAnnualDayFrameRibbonBandHalf(earthDist, frameSpan, durationH) {
    const span = Math.max(frameSpan, earthDist * 0.008);
    const zl = getZoomLevelForEvents();
    const frac = (zl === 4 || zl === 5 || zl === 6 || zl === 7 || zl === 8) ? 0.17 : 0.14;
    let half = Math.max(span * frac, earthDist * 0.012);
    const hrs = typeof durationH === 'number' && !isNaN(durationH) ? durationH : 2;
    if (hrs < 4) {
      half *= 1 + (4 - Math.max(hrs, 0.25)) * 0.08;
    }
    const maxHalf = span * 0.34;
    return Math.min(half, maxHalf);
  }

  function getAnnualDayFrameOffDayOpacityMul(start, end) {
    // Nesting resolver LTE day events: full opacity across month/week/day zooms.
    if (!start) return 1;
    const zl = getZoomLevelForEvents();
    if (zl === 4 || zl === 5 || zl === 6 || zl === 7 || zl === 8 || zl === 9 || zl === 0) return 1;
    if (eventTouchesSelectedCalendarDay(start, end)) return 1;
    return 0.88;
  }

  /**
   * XZ radius just Sun-ward of the month time-marker **outer** curve ({@link TimeMarkers} `month.outer` = W/2).
   * Used to park long (month-ish) event titles inside that ring so they don’t sit in busier outer bands.
   */
  function getMonthOuterInnerLabelRadiusXZ(earthDist) {
    const W = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : getEarthDistance();
    let rMonthOuter = W * 0.5;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
      rMonthOuter = TimeMarkers.getCanonicalRadialZones(W).month.outer;
    }
    const pad = W * 0.024;
    return Math.max(W * 0.17, rMonthOuter - pad);
  }

  function snapMeshPositionXZRadius(mesh, rTargetXZ) {
    if (!mesh || !mesh.position || !(rTargetXZ > 0)) return;
    const p = mesh.position;
    const rh = Math.hypot(p.x, p.z);
    if (rh < 1e-9) return;
    const s = rTargetXZ / rh;
    p.x *= s;
    p.z *= s;
  }

  /**
   * Inner/outer radii for duration-event band (aligned with TimeMarkers RADII_CONFIG week/month/day rings).
   * For spans > 1 week (after week-ish plateau), inner sweeps week→month and outer eases in the day-number→day-name band.
   * Week corridor (≤7 d band, incl. ~5–10 d plateau): **inner** = mid between week label text and week outer curve;
   * **outer** = mid between day numbers and day names (same as `day.label`–`day.dayName`).
   */
  /**
   * Inner/outer radii for duration-event bands.
   * Long-term events remain strictly within their respective radial sections:
   * - Multi-Year (> 365d): Core area [0.04W, 0.125W]
   * - Sub-Annual Super-Month (30d to 365d): Quarterly area [0.125W, 0.25W]
   * - Sub-Month Super-Week (7d to 30d): Month area [0.25W, 0.50W]
   * - Sub-Week Super-Day (1d to 7d): Week area [0.50W, 0.625W]
   * - Sub-Day / Instant (<= 1d): Day realm [0.625W, 0.75W]
   */
  function getEventBandRadii(earthDist, durationDays) {
    const W = earthDist;
    const zones = (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function')
      ? TimeMarkers.getCanonicalRadialZones(W)
      : null;

    const rQuarterInner = zones ? zones.quarter.inner : W * 0.125;
    const rQuarterOuter = zones ? zones.quarter.outer : W * 0.25;
    const rMonthInner   = zones ? zones.month.inner   : W * 0.25;
    const rMonthOuter   = zones ? zones.month.outer   : W * 0.50;
    const rWeekInner    = zones ? zones.week.inner    : W * 0.50;
    const rWeekOuter    = zones ? zones.week.outer    : W * 0.625;

    const d = Math.max(durationDays, 1e-4);

    let rInner, rOuter;

    if (d > 365) {
      // Super-annual / Multi-year events (> 1 year): Core area
      rInner = W * 0.04;
      rOuter = rQuarterInner;
    } else if (d > 30) {
      // Sub-annual super-month events (30 days to 1 year, e.g. 8 months):
      // Positioned away from the Sun, extending gracefully into the Month realm (up to ~0.45W)
      const t = Math.min(1, (d - 30) / (365 - 30));
      rInner = rQuarterOuter * 0.88;
      rOuter = rQuarterOuter + (rMonthOuter - rQuarterOuter) * (0.35 + 0.65 * t);
    } else if (d > 7) {
      // Sub-month super-week events (7 days to 30 days): Month area
      const t = Math.min(1, (d - 7) / (30 - 7));
      rInner = rMonthInner;
      rOuter = rMonthInner + (rMonthOuter - rMonthInner) * Math.max(0.6, t);
    } else if (d > 1) {
      // Sub-week super-day events (1 day to 7 days): Week area
      const t = Math.min(1, (d - 1) / (7 - 1));
      rInner = rWeekInner;
      rOuter = rWeekInner + (rWeekOuter - rWeekInner) * Math.max(0.6, t);
    } else {
      // Sub-day / instant events (<= 1 day): Day realm
      rInner = rWeekOuter;
      rOuter = zones ? zones.day.outer : W * 0.75;
    }

    return { rInner, rOuter };
  }

  /**
   * Shortest span (days) still eligible for the Event List “focus band” at this zoom.
   * Matches {@link eventDurationEligibleForFullListAtZoom} lower bounds.
   */
  function getListFocusMinDurationDaysForZoom(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
    if (z <= 0 || z >= 9) return 1 / 24;
    if (z === 8) return 1 / 48;
    if (z === 7) return 1 + 1e-4;
    if (z === 5 || z === 6) return 7 + 1e-4;
    if (z === 4) return 31 + 1e-4;
    if (z === 3) return 92 + 1e-4;
    if (z === 2) return CONTEXT_YEAR_DAYS + 1e-4;
    if (z === 1) return CONTEXT_DECADE_DAYS + 1e-4;
    return 8;
  }

  /**
   * List-context annulus radii — same inner/outer curves as time markers for this zoom
   * ({@link TimeMarkers.getListContextRingRadiiForZoom} when available).
   */
  function getListContextRingRadiiForZoom(earthDist, zoomLevel) {
    const W = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : EARTH_RADIUS;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
    const zr = z === 0 ? 9 : z;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getListContextRingRadiiForZoom === 'function') {
      return TimeMarkers.getListContextRingRadiiForZoom(zr, W);
    }
    const monthOuter = W / 2;
    const monthInner = W / 4;
    const weekOuter = W * 5 / 8;
    const weekInner = W / 2;
    const dayInner = W * 5 / 8;
    const dayOuter = W * 3 / 4;
    const qOuter = W / 4;
    let rInner;
    let rOuter;
    if (zr <= 0) {
      rInner = dayInner;
      rOuter = dayInner;
    } else if (zr <= 2) {
      rInner = W / 6;
      rOuter = qOuter;
    } else if (z === 3) {
      rInner = qOuter;
      rOuter = monthOuter;
    } else if (z === 4) {
      rInner = qOuter;
      rOuter = monthOuter;
    } else if (z === 5 || z === 6) {
      rInner = monthInner;
      rOuter = monthOuter;
    } else if (z === 7) {
      rInner = weekInner;
      rOuter = weekOuter;
    } else {
      rInner = dayInner;
      rOuter = dayOuter;
    }
    const rMax = z >= 8 ? W * 0.998 : W * 0.92;
    rOuter = Math.max(W * 0.08, Math.min(rOuter, rMax));
    rInner = Math.max(W * 0.06, Math.min(rInner, rOuter - W * 0.02));
    return { rInner, rOuter };
  }

  function getListContextRingInnerRadius(earthDist, zoomLevel) {
    return getListContextRingRadiiForZoom(earthDist, zoomLevel).rInner;
  }

  function getListContextRingOuterRadius(earthDist, zoomLevel) {
    return getListContextRingRadiiForZoom(earthDist, zoomLevel).rOuter;
  }

  /**
   * True when the context ring lies outside this event’s Sun-ward ribbon edge (context ring radius > rInner), so labels may draw.
   * When the band sits outside the ring (e.g. sub-week ribbons at quarter zoom), skip all event text.
   */
  function isEventLabelRadialContextSurpassesInner(start, end) {
    if (!start || !end || !(end > start)) return false;
    const W = getEarthDistance();
    const contextR = getListContextRingOuterRadius(W, getZoomLevelForEvents());
    const days = durationDaysBetween(start, end);
    const { rInner } = getEventBandRadii(W, Math.max(days, 1e-4));
    return contextR > rInner;
  }

  /**
   * Long-term bands shift along scene Y (time height) by duration: longer spans sit slightly lower
   * than shorter ones so overlapping ribbons separate. No shift for spans ≤ 1 week.
   */
  function getEventBandVerticalStagger(durationDays) {
    if (durationDays <= 7) return 0;
    const t = Math.max(0, Math.min(1,
      (Math.log(1 + durationDays) - Math.log(8)) / (Math.log(400) - Math.log(8))
    ));
    return -1.6 * t;
  }

  /**
   * Longer ribbons use logical stagger in userData; root.position.y is updated each frame (main.js) so flatten Y scale
   * does not crush the visual separation vs unflattened view.
   */
  function attachEventStaggerRoot(root, staggerLogical) {
    if (!root || !staggerLogical) return root;
    root.userData.eventStaggerRoot = true;
    root.userData.staggerLogical = staggerLogical;
    if (root.userData.timelineHelixRef) {
      root.position.y = 0;
      const focusY =
        typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
      const amount =
        typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
      applyFlattenedHelixToRoot(root, focusY, amount);
    } else {
      const ys = typeof global.getEventFlattenYScale === 'function' ? global.getEventFlattenYScale() : 1;
      root.position.y = staggerLogical / Math.max(0.05, ys);
    }
    return root;
  }

  function markCircadianShortScrubRoot(root, diskRibbon, isRibbon) {
    if (!root || !root.userData) return;
    if (!shouldUseCircadianNearEarthShortPlacement()) return;
    if (normalizedCircadianState() === 'off') return;
    root.userData.circadianShortScrub = true;
    root.userData.circadianShortRibbon = !!isRibbon;
    if (diskRibbon) root.userData._diskRibbon = diskRibbon;
  }

  function updateLineGeometryFromFlat(line, flat) {
    if (!line || !line.geometry || !flat || flat.length < 6) return;
    const pos = line.geometry.attributes.position;
    if (!pos || pos.count * 3 !== flat.length) {
      line.geometry.dispose();
      const geo = new global.THREE.BufferGeometry();
      geo.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
      line.geometry = geo;
      return;
    }
    pos.array.set(flat);
    pos.needsUpdate = true;
    if (line.geometry.computeBoundingSphere) line.geometry.computeBoundingSphere();
  }

  function updateRibbonFillMeshFromFlat(mesh, innerFlat, outerFlat) {
    if (!mesh || !innerFlat || !outerFlat) return;
    const geo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
    if (!geo) return;
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;
  }

  function updateCircadianConnectorChild(line, ax, ay, az, atDate, refHeight) {
    if (!line || !line.isLine || !line.geometry) return;
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function') return;
    const hl = typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
    const tip = CR.blendedDiskPointAtDate(
      atDate,
      hl,
      refHeight,
      calculateDateHeight,
      getCircadianStraightenBlendForEvents()
    );
    if (!tip) return;
    const pos = line.geometry.attributes.position;
    if (!pos || pos.count < 2) return;
    const arr = pos.array;
    arr[0] = ax;
    arr[1] = ay;
    arr[2] = az;
    arr[3] = tip.x;
    arr[4] = tip.y;
    arr[5] = tip.z;
    pos.needsUpdate = true;
    if (line.geometry.computeBoundingSphere) line.geometry.computeBoundingSphere();
  }

  function repositionCircadianShortEventRoot(root, refHeight) {
    if (!root || !root.userData || !root.userData.circadianShortScrub) return;
    const event = root.userData.vevent;
    let start = event ? getEventStart(event) : root.userData.start;
    let end = event ? getEventEnd(event) : root.userData.end;
    if (!start || isNaN(start.getTime())) return;
    if (!end || !(end > start)) end = new Date(start.getTime() + 3600000);
    const durationH = durationHoursBetween(start, end);
    if (durationH > 7 * 24) return;

    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    const straightenBlend = getCircadianStraightenBlendForEvents();
    const midDate = new Date((start.getTime() + end.getTime()) / 2);
    const amt = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
    const focusY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;

    if (root.userData.circadianShortRibbon && CR && typeof CR.buildDiskRibbonBetween === 'function') {
      const earthDist = getEarthDistance();
      const dr = root.userData._diskRibbon;
      let rIn;
      let rOut;
      if (dr && dr.rIn != null && dr.rOut != null && dr.rOut > dr.rIn) {
        const clamped = clampShortCircadianDiskRibbon(dr);
        rIn = clamped.rIn;
        rOut = clamped.rOut;
      } else {
        const hl = typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
        const zlScrub = getZoomLevelForEvents();
        const halfRadial = getShortCircadianRadialHalfWidth(hl, zlScrub);
        const minR = getShortCircadianMinRadiusFromEarthCenter();
        const minSpan = getShortCircadianMinRibbonRadialSpan(hl, zlScrub);
        rIn = Math.max(hl * 0.72, hl - halfRadial, minR);
        rOut = Math.max(hl + halfRadial, rIn + minSpan);
      }
      const segments = Math.max(8, Math.min(48, Math.ceil(durationH * 4)));
      const ribbonPair = CR.buildDiskRibbonBetween(
        start,
        end,
        rIn,
        rOut,
        refHeight,
        calculateDateHeight,
        segments,
        straightenBlend
      );
      if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat) {
        let innerFlat = ribbonPair.innerFlat;
        let outerFlat = ribbonPair.outerFlat;
        if (amt > 0.001) {
          innerFlat = flattenTimelineFlatArray(innerFlat, focusY, amt);
          outerFlat = flattenTimelineFlatArray(outerFlat, focusY, amt);
        }
        const fillMeshes = [];
        let connectorAnchor = null;
        root.traverse((child) => {
          if (child.userData && child.userData.type === 'EventCircadianConnector' && child.isLine) {
            /* anchor updated after traverse */
          } else if (child.userData && child.userData.type === 'EventRibbonBandEnd') {
            updateBandEndConnectorFromFlat(child, innerFlat, outerFlat, child.userData.capIndex);
          } else if (child.userData && child.userData.type === 'EventRibbonArc') {
            if (child.userData.arcEdge === 'outer') {
              updateLineGeometryFromFlat(child, outerFlat);
            } else {
              updateLineGeometryFromFlat(child, innerFlat);
            }
            if (!connectorAnchor && child.userData.arcEdge === 'inner') {
              connectorAnchor = { x: innerFlat[0], y: innerFlat[1], z: innerFlat[2] };
            }
          } else if (
            child.isMesh &&
            (child.userData.longTermFill ||
             child.userData.type === 'EventRibbonFill' ||
             child.userData.type === 'EventPolygon3D' ||
             child.userData.type === 'EventPickProxy' ||
             (child.geometry && child.geometry.index))
          ) {
            fillMeshes.push(child);
          }
        });
        if (!connectorAnchor) {
          connectorAnchor = { x: innerFlat[0], y: innerFlat[1], z: innerFlat[2] };
        }
        root.traverse((child) => {
          if (child.userData && child.userData.type === 'EventCircadianConnector' && child.isLine) {
            updateCircadianConnectorChild(
              child,
              connectorAnchor.x,
              connectorAnchor.y,
              connectorAnchor.z,
              midDate,
              refHeight
            );
          }
        });
        fillMeshes.forEach((fm) => updateRibbonFillMeshFromFlat(fm, innerFlat, outerFlat));
        updateEventRibbonLabelsForFlatten(root, innerFlat, outerFlat, amt);
      }
    } else {
      const dr = root.userData._diskRibbon;
      const rLane = clampShortCircadianRadiusFromEarth(
        dr && dr.rMid != null
          ? dr.rMid
          : (CR && typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5)
      );
      let diskFrame = sampleCircadianDiskMarkerFrame(midDate, rLane, refHeight);
      let pos = diskFrame && diskFrame.position
        ? diskFrame.position
        : getShortEventCircadianNearEarthPosition(start, end, refHeight, rLane);
      if (!pos) return;
      root.traverse((child) => {
        if (child.userData && child.userData.type === 'EventLineMarker') {
          child.position.set(pos.x, pos.y, pos.z);
          if (diskFrame && diskFrame.quaternion) child.quaternion.copy(diskFrame.quaternion);
        } else if (child.userData && child.userData.type === 'EventCircadianConnector' && child.isLine) {
          updateCircadianConnectorChild(child, pos.x, pos.y, pos.z, midDate, refHeight);
        }
      });
    }

    if (root.userData.eventStaggerRoot) {
      const durationDays = Math.max(durationH / 24, 1e-4);
      attachEventStaggerRoot(root, getEventBandVerticalStagger(durationDays));
    }
  }

  /**
   * Move short circadian disk/stack events during smooth selected-time scrub (no full layer rebuild).
   * @param {{ forEachLayerObjectRoot?: function(function):void }|null} gl
   * @param {number} refHeight - selectedDateHeight from computeSceneDateHeights
   */
  function updateCircadianShortEventsForScrub(gl, refHeight) {
    if (!shouldUseCircadianNearEarthShortPlacement()) return;
    if (normalizedCircadianState() === 'off') return;
    if (refHeight == null || isNaN(refHeight)) {
      refHeight = getEventOrbitReferenceHeight();
    }
    const visit = function (root) {
      repositionCircadianShortEventRoot(root, refHeight);
    };
    if (gl && typeof gl.forEachLayerObjectRoot === 'function') {
      gl.forEachLayerObjectRoot(visit);
    }
  }

  /** Keep below time-marker text (main.js ~50); above default scene objects. */
  const EVENT_LABEL_SPRITE_RENDER_ORDER = 30;
  /** Shorter ribbons stack above longer but must not paint over time-marker labels. */
  const MAX_RIBBON_RENDER_ORDER_BOOST = 12;

  /**
   * Multiplies layer opacity for multi-day ribbons: shorter spans read stronger when drawn on top of long ones.
   * Approaches 1.0 for durations past ~8 weeks so very long events keep the configured opacity.
   */
  function getDurationOpacityScale(durationDays) {
    const d = Math.max(durationDays, 1e-4);
    const t = Math.max(0, Math.min(1, (Math.min(d, 56) - 2) / 54));
    return 1.3 - 0.3 * t;
  }

  /**
   * Shorter ribbons draw later (higher renderOrder) so they stack on top of longer overlays instead of blending underneath.
   */
  function getDurationRibbonRenderOrderBoost(durationDays) {
    const d = Math.max(durationDays, 0.25);
    const t = Math.max(0, Math.min(1,
      (Math.log(1 + d) - Math.log(2)) / (Math.log(400) - Math.log(2))
    ));
    return Math.min(MAX_RIBBON_RENDER_ORDER_BOOST, Math.round((1 - t) * MAX_RIBBON_RENDER_ORDER_BOOST));
  }

  function getShortCircadianRibbonRenderOrders(durationDays, zl) {
    const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
    const base = isEarthDailySkyEventZoom(zl) ? 9 : -4;
    const roFill = base + roBoost;
    return { roFill, roLine: roFill + 2 };
  }

  /** Day/clock sky: double-sided fill + depth write so opposite-face labels occlude. */
  function puffShortCircadianRibbonFillForDailySky(fillMesh, zl) {
    if (!fillMesh || zl === 0 || !isEarthDailySkyEventZoom(zl)) return;
    const THREE = global.THREE;
    if (fillMesh.material) {
      fillMesh.material.side = THREE.DoubleSide;
      fillMesh.material.depthWrite = true;
      fillMesh.material.depthTest = true;
    }
  }

  /**
   * Day/clock sky: ribbon geometry above and below the sky plane (labels added separately per face).
   */
  function wrapDailySkyTwoSidedRibbonOnly(ribbonGroup, zl) {
    if (!ribbonGroup || zl === 0 || !isEarthDailySkyEventZoom(zl)) {
      return { wrap: ribbonGroup, top: ribbonGroup, bot: ribbonGroup };
    }
    const THREE = global.THREE;
    if (!THREE) return { wrap: ribbonGroup, top: ribbonGroup, bot: ribbonGroup };
    const puffY = getDailySkyRibbonPuffY();
    const top = ribbonGroup;
    const bot = ribbonGroup.clone(true);
    top.position.y += puffY;
    bot.position.y -= puffY;
    const wrap = new THREE.Group();
    wrap.userData = ribbonGroup.userData || {};
    wrap.add(top);
    wrap.add(bot);
    return { wrap, top, bot };
  }

  function finishDailySkySteRibbonRoot(ribbonGroup, zl, labelOpts) {
    if (!ribbonGroup || ribbonGroup.children.length === 0) return null;
    if (labelOpts && labelOpts.innerFlat && labelOpts.outerFlat) {
      addEventRibbonPickProxy(ribbonGroup, labelOpts.innerFlat, labelOpts.outerFlat);
    }
    markCircadianShortScrubRoot(ribbonGroup, labelOpts.diskRibbon, true);
    markShortEventPointerPickability(ribbonGroup, labelOpts.start, labelOpts.end);
    if (!isEarthDailySkyEventZoom(zl)) return ribbonGroup;
    const { wrap, top, bot } = wrapDailySkyTwoSidedRibbonOnly(ribbonGroup, zl);
    if (labelOpts.showLabels) {
      addEventWorldlineLabelSprites(
        top,
        labelOpts.event,
        labelOpts.start,
        labelOpts.end,
        labelOpts.startHeight,
        labelOpts.endHeight,
        labelOpts.rInner,
        labelOpts.rOuter,
        labelOpts.eventHex,
        labelOpts.currentHeight,
        0,
        labelOpts.innerFlat,
        labelOpts.outerFlat,
        labelOpts.midTitleAlong01,
        'top'
      );
      addEventWorldlineLabelSprites(
        bot,
        labelOpts.event,
        labelOpts.start,
        labelOpts.end,
        labelOpts.startHeight,
        labelOpts.endHeight,
        labelOpts.rInner,
        labelOpts.rOuter,
        labelOpts.eventHex,
        labelOpts.currentHeight,
        0,
        labelOpts.innerFlat,
        labelOpts.outerFlat,
        labelOpts.midTitleAlong01,
        'bottom'
      );
    }
    markShortEventPointerPickability(wrap, labelOpts.start, labelOpts.end);
    return wrap;
  }

  /**
   * Sub-day STE/LTE on the annual Earth helix — short ribbon inside the day-marker radial frame.
   * @returns {THREE.Group|null}
   */
  function tryCreateDayFrameSubDayRibbon(opts) {
    if (!opts || !shouldRenderDayFrameSubDayOnAnnualHelix()) return null;
    const {
      start,
      end,
      startHeight,
      endHeight,
      layerConfig,
      lineStyle,
      firstStyle,
      earthDist,
      refSelected,
      eventHex,
      explicitColor,
      fallbackGradient,
      anchorMs,
      durationH,
      userDataBase,
      midTitleAlong01,
      labelEvent
    } = opts;
    const skipLabels = !!(opts && opts.skipLabels);
    if (!start || !end || !(end > start)) return null;

    const overlapLane = (layerConfig && layerConfig._overlapLane) || 0;
    const segments = getDayFrameRibbonSegmentCount(durationH, start, end);
    const refWorldline = getWorldlineOrbitReferenceHeight();
    const ribbonPair = buildDayFrameHelixPair(
      start,
      end,
      earthDist,
      refWorldline,
      segments,
      overlapLane,
      labelEvent,
      durationH
    );
    if (!ribbonPair || !ribbonPair.innerFlat || ribbonPair.innerFlat.length < 6) return null;

    const durationDays = Math.max(durationH / 24, 1 / 24);
    const plotType = 'polygon3d';
    const offDayMul = getAnnualDayFrameOffDayOpacityMul(start, end);
    const dailyMul = getDailyCircadianEventOpacityMul(start, end);
    const nearSel = getSelectedWeekLteWarpAmount(start);
    const farDayFrame = nearSel < 0.2;
    const opacity = Math.min(1,
      ((lineStyle && lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.78) *
        getDurationOpacityScale(durationDays) * dailyMul * offDayMul *
        (farDayFrame ? 0.72 : 1));
    const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
    const roFill = -4 + roBoost;
    const roLine = -2 + roBoost;
    let fillOpacity = Math.min(0.96,
      opacity * getDurationFillOpacityFactor(durationDays) * getSubDayLteManifoldFillOpacityMul());
    if (ribbonPair.extendsOutsideFrame) {
      fillOpacity = Math.min(0.98, fillOpacity * 1.12);
    }
    if (farDayFrame) fillOpacity = Math.min(fillOpacity, 0.38);
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    const fillColorFromStyle =
      (lineStyle && lineStyle.fillColor) ||
      layerConfig.fillColor ||
      (firstStyle && firstStyle.fillColor) ||
      null;
    let fillHex = parseColor(fillColorFromStyle || eventHex || fallbackGradient);
    fillHex = applyEventDisplayColor(fillHex, anchorMs, start, end);
    const borderStyle =
      (lineStyle && lineStyle.borderStyle) ||
      layerConfig.borderStyle ||
      (firstStyle && firstStyle.borderStyle) ||
      'event';
    let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, labelEvent);
    if (outlineColorHex != null) outlineColorHex = applyEventDisplayColor(outlineColorHex, anchorMs, start, end);
    let outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);
    outlineOp = Math.min(1, outlineOp * (ribbonPair.extendsOutsideFrame ? 0.98 : 0.92));

    const innerFlat = ribbonPair.innerFlat.slice();
    const outerFlat = ribbonPair.outerFlat.slice();
    applyDayFrameEhWarpToFlats(
      innerFlat,
      outerFlat,
      start.getTime(),
      end.getTime(),
      earthDist,
      refWorldline
    );
    const borderHex = outlineColorHex != null ? outlineColorHex : eventHex;
    const borderOp = Math.min(1, Math.max(outlineOp, opacity * 0.88));
    const userData = userDataBase ? { ...userDataBase } : {};
    markWorldSpaceIfNeeded(userData, start, end);
    Object.assign(userData, prepareDayFrameRibbonUserData(userData));
    userData.dayFrameAnnualHelix = true;

    const group = new global.THREE.Group();
    group.userData = userData;
    group.userData.dayFrameAnnualHelix = true;

    const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
    if (ribbonGeo) {
      const fillMesh = createRibbonFillMesh(
        ribbonGeo,
        fillHex,
        fillOpacity,
        plotType,
        roFill,
        durationDays,
        null,
        true
      );
      group.add(fillMesh);
      addDayFrameFlatRibbonBorders(group, innerFlat, outerFlat, borderHex, borderOp, roLine);
    }

    if (group.children.length === 0) return null;

    storeDayFrameHelixRef(userData, {
      startMs: start.getTime(),
      endMs: end.getTime(),
      earthDist,
      indexOffset: overlapLane,
      durationH,
      segments,
      refWorldline,
      logicalInnerFlat: ribbonPair.innerFlat,
      logicalOuterFlat: ribbonPair.outerFlat
    });
    storeDayFrameHelixRef(group.userData, {
      startMs: start.getTime(),
      endMs: end.getTime(),
      earthDist,
      indexOffset: overlapLane,
      durationH,
      segments,
      refWorldline,
      logicalInnerFlat: ribbonPair.innerFlat,
      logicalOuterFlat: ribbonPair.outerFlat
    });

    const flattenFocusY =
      typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
    const flattenAmt =
      typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
    if (flattenAmt > 1e-6) {
      applyFlattenedDayFrameHelixToRoot(group, flattenFocusY, flattenAmt);
    }

    if (
      !skipLabels &&
      !farDayFrame &&
      labelEvent &&
      (areEventTextLabelsVisibleAtCurrentZoom(start, end) ||
        areEventNameLabelsVisibleAtCurrentZoom(start, end))
    ) {
      addEventWorldlineLabelSprites(
        group,
        labelEvent,
        start,
        end,
        startHeight,
        endHeight,
        ribbonPair.rInner,
        ribbonPair.rOuter,
        eventHex,
        refSelected,
        0,
        innerFlat,
        outerFlat,
        midTitleAlong01 != null ? midTitleAlong01 : 0.5
      );
    }

    addEventRibbonPickProxy(group, innerFlat, outerFlat);
    markCircadianShortScrubRoot(group, layerConfig._diskRibbon, false);
    markShortEventPointerPickability(group, start, end);
    return group;
  }

  /**
   * Stronger ribbon fill for shorter spans so the foreground color reads clearly (not equal-weight blend with behind).
   */
  function getDurationFillOpacityFactor(durationDays) {
    const d = Math.max(durationDays, 0.25);
    const t = Math.max(0, Math.min(1,
      (Math.log(1 + d) - Math.log(2)) / (Math.log(220) - Math.log(2))
    ));
    return 0.5 + 0.47 * (1 - t);
  }

  /** Sub-day LTE ribbons on the annual manifold: solid fill (not circadian glass stack). */
  function getSubDayLteManifoldFillOpacityMul() {
    return 0.9;
  }

  /** Sub-day ribbon fills (circadian arcs): more glassy so overlaps read as stacks. */
  function getShortTermEventFillOpacityMul() {
    return 0.56;
  }

  /** Flat inner/outer edge strokes (no TubeGeometry) for sub-day LTE on annual worldline. */
  function addDayFrameFlatRibbonBorders(group, innerFlat, outerFlat, colorHex, opacity, roLine) {
    if (!group || !innerFlat || !outerFlat) return;
    function edgeLine(flat, arcEdge) {
      const g = new global.THREE.BufferGeometry();
      g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
      const m = new global.THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        depthWrite: false
      });
      const lo = new global.THREE.Line(g, m);
      lo.renderOrder = roLine != null ? roLine : -2;
      lo.userData = { type: 'EventRibbonArc', arcEdge: arcEdge || 'inner' };
      return lo;
    }
    group.add(edgeLine(innerFlat, 'inner'));
    group.add(edgeLine(outerFlat, 'outer'));
    addBandEndConnectors(group, innerFlat, outerFlat, colorHex, opacity, roLine);
  }

  /** Add deltaY to every Y in a flat [x,y,z,...] array (mutates). */
  function offsetHelixFlatY(flat, deltaY) {
    if (!deltaY || !flat || flat.length < 3) return;
    for (let i = 1; i < flat.length; i += 3) flat[i] += deltaY;
  }

  function offsetLinePointsFlatY(points, deltaY) {
    if (!deltaY || !points || points.length < 6) return;
    for (let i = 1; i < points.length; i += 3) points[i] += deltaY;
  }

  function createRibbonBufferFromFlatArrays(innerFlat, outerFlat) {
    if (typeof global.RibbonGeometry !== 'undefined' && global.RibbonGeometry.fromInnerOuter) {
      return global.RibbonGeometry.fromInnerOuter(innerFlat, outerFlat, {
        THREE: global.THREE,
        ribbonEdgeAttr: true,
        // MeshBasic / fill shader ignore normals — skip Frenet-ish CPU on every rebuild.
        computeNormals: false
      });
    }
    // Fallback if util script missing (standalone embeds)
    const n = innerFlat.length / 3;
    if (n < 2 || innerFlat.length !== outerFlat.length) return null;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = innerFlat[i * 3];
      pos[i * 6 + 1] = innerFlat[i * 3 + 1];
      pos[i * 6 + 2] = innerFlat[i * 3 + 2];
      pos[i * 6 + 3] = outerFlat[i * 3];
      pos[i * 6 + 4] = outerFlat[i * 3 + 1];
      pos[i * 6 + 5] = outerFlat[i * 3 + 2];
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = 2 * i;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new global.THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new global.THREE.BufferAttribute(pos, 3));
    const ribbonEdge = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      ribbonEdge[i * 2] = 0;
      ribbonEdge[i * 2 + 1] = 1;
    }
    geo.setAttribute('ribbonEdge', new global.THREE.BufferAttribute(ribbonEdge, 1));
    return geo;
  }

  /** Invisible ribbon mesh so thin line-mode sub-day events stay easy to click. */
  function addEventRibbonPickProxy(group, innerFlat, outerFlat) {
    if (!group || !innerFlat || !outerFlat || innerFlat.length < 6) return;
    const geo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
    if (!geo) return;
    const mesh = new global.THREE.Mesh(
      geo,
      new global.THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: global.THREE.DoubleSide
      })
    );
    mesh.renderOrder = -24;
    mesh.userData = { type: 'EventPickProxy' };
    group.add(mesh);
  }

  function createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, contextFade, forceUniformFill) {
    const THREE = global.THREE;
    const useGradient = !forceUniformFill && longEventRibbonUsesRadialFillGradient(durationDays);
    const innerScale = contextFade && contextFade.innerScale != null ? contextFade.innerScale : 1;
    const outerScale = contextFade && contextFade.outerScale != null ? contextFade.outerScale : 1;
    let mat;
    if (useGradient) {
      mat = createLongTermRibbonFillShaderMaterial(fillHex, fillOpacity, THREE, innerScale, outerScale);
    } else if (typeof global.createNodeCompatibleMaterial === 'function') {
      mat = global.createNodeCompatibleMaterial(THREE, THREE.MeshBasicMaterial, {
        color: fillHex,
        transparent: true,
        opacity: fillOpacity * innerScale,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 1
      });
    } else {
      mat = new THREE.MeshBasicMaterial({
        color: fillHex,
        transparent: true,
        opacity: fillOpacity * innerScale,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 1
      });
    }
    if (typeof global.CircaevumWebGPUPipeline !== 'undefined' && typeof global.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial === 'function') {
      global.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial(mat);
    }
    const fillMesh = new global.THREE.Mesh(ribbonGeo, mat);
    if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
    fillMesh.renderOrder = roFill;
    fillMesh.userData.longTermFill = true;
    return fillMesh;
  }

  function updateBandEndConnectorFromFlat(obj, innerFlat, outerFlat, capIndex) {
    if (!obj || !innerFlat || !outerFlat || innerFlat.length < 3) return;
    const n = innerFlat.length / 3;
    const si = capIndex == null ? 0 : Math.max(0, Math.min(n - 1, capIndex));
    const ix = si * 3;
    const ax = innerFlat[ix];
    const ay = innerFlat[ix + 1];
    const az = innerFlat[ix + 2];
    const bx = outerFlat[ix];
    const by = outerFlat[ix + 1];
    const bz = outerFlat[ix + 2];
    if (obj.isLine && obj.geometry) {
      const pos = obj.geometry.attributes.position;
      if (!pos || pos.count < 2) return;
      const arr = pos.array;
      arr[0] = ax;
      arr[1] = ay;
      arr[2] = az;
      arr[3] = bx;
      arr[4] = by;
      arr[5] = bz;
      pos.needsUpdate = true;
      if (obj.geometry.computeBoundingSphere) obj.geometry.computeBoundingSphere();
    } else if (obj.isMesh && obj.geometry && obj.geometry.parameters) {
      const THREE = global.THREE;
      const p0 = new THREE.Vector3(ax, ay, az);
      const p1 = new THREE.Vector3(bx, by, bz);
      const dir = new THREE.Vector3().subVectors(p1, p0);
      const len = dir.length();
      if (len < 1e-9) return;
      const origH = obj.geometry.parameters.height;
      if (typeof origH === 'number' && origH > 1e-9) {
        obj.scale.set(1, len / origH, 1);
      }
      const axis = new THREE.Vector3(0, 1, 0);
      obj.quaternion.setFromUnitVectors(axis, dir.clone().normalize());
      obj.position.copy(p0).add(p1).multiplyScalar(0.5);
    }
  }

  function addBandEndConnectors(group, innerFlat, outerFlat, colorHex, opacity, renderOrder, tubeRadius) {
    // Cap cylinders/lines usually read as useless beads — skip unless Context Sphere
    // clipped this ribbon at the event horizon (show that the event continues beyond).
    const forceHorizonCaps = !!(group && group.userData && group.userData.contextSphereClipped);
    if (!forceHorizonCaps) return;
    const n = innerFlat.length / 3;
    if (n < 1) return;
    const THREE = global.THREE;
    if (tubeRadius != null && tubeRadius > 0 && typeof THREE.CylinderGeometry === 'function') {
      function cap(si) {
        const ix = si * 3;
        const p0 = new THREE.Vector3(innerFlat[ix], innerFlat[ix + 1], innerFlat[ix + 2]);
        const p1 = new THREE.Vector3(outerFlat[ix], outerFlat[ix + 1], outerFlat[ix + 2]);
        const c = cylinderBetweenPoints(p0, p1, tubeRadius * 0.92, colorHex, opacity, renderOrder);
        if (c) {
          c.userData = { type: 'EventRibbonBandEnd', capIndex: si, contextSphereHorizon: true };
          group.add(c);
        }
      }
      cap(0);
      cap(n - 1);
      return;
    }
    function seg(si) {
      const ix = si * 3;
      const g = new global.THREE.BufferGeometry();
      g.setAttribute('position', new global.THREE.Float32BufferAttribute([
        innerFlat[ix], innerFlat[ix + 1], innerFlat[ix + 2],
        outerFlat[ix], outerFlat[ix + 1], outerFlat[ix + 2]
      ], 3));
      const m = new global.THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        linewidth: 1
      });
      const line = new global.THREE.Line(g, m);
      line.renderOrder = renderOrder;
      line.userData = { type: 'EventRibbonBandEnd', capIndex: si };
      group.add(line);
    }
    seg(0);
    seg(n - 1);
  }

  function buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, segments) {
    let innerFlat;
    let outerFlat;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      innerFlat = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rInner, currentHeight, segments);
      outerFlat = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rOuter, currentHeight, segments);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(startHeight, currentHeight)
        : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(endHeight, currentHeight)
        : angle0;
      const p0i = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, rInner)
        : { x: Math.cos(angle0) * rInner, y: startHeight, z: Math.sin(angle0) * rInner };
      const p1i = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, rInner)
        : { x: Math.cos(angle1) * rInner, y: endHeight, z: Math.sin(angle1) * rInner };
      const p0o = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, rOuter)
        : { x: Math.cos(angle0) * rOuter, y: startHeight, z: Math.sin(angle0) * rOuter };
      const p1o = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, rOuter)
        : { x: Math.cos(angle1) * rOuter, y: endHeight, z: Math.sin(angle1) * rOuter };
      innerFlat = [p0i.x, p0i.y, p0i.z, p1i.x, p1i.y, p1i.z];
      outerFlat = [p0o.x, p0o.y, p0o.z, p1o.x, p1o.y, p1o.z];
    }
    return { innerFlat, outerFlat };
  }

  /** Spans longer than one tropical year (school, jobs, other life chapters). */
  function isSuperYearDurationDays(durationDays) {
    return typeof durationDays === 'number' && !isNaN(durationDays) && durationDays > CONTEXT_YEAR_DAYS;
  }

  /**
   * Sleeve just outside Earth helix so the worldline sits inside the column.
   * Longer / overlapping chapters step slightly outward to avoid z-fight.
   */
  function getSuperYearCylinderRadius(earthDist, rank01, overlapLane) {
    const W = earthDist > 0 ? earthDist : EARTH_RADIUS;
    const u = rank01 != null && isFinite(rank01) ? Math.max(0, Math.min(1, rank01)) : 0;
    const lane = typeof overlapLane === 'number' && overlapLane > 0 ? overlapLane : 0;
    return W * (1.04 + 0.055 * u + 0.028 * lane);
  }

  /** Thin vertical strip on the +X seam — label sprites / flatten reuse ribbon helpers. */
  function buildVerticalCylinderLabelFlats(startHeight, endHeight, radius, segments) {
    const n = Math.max(2, segments || 8);
    const r = radius > 0 ? radius : EARTH_RADIUS;
    const band = Math.max(r * 0.01, 0.35);
    const rIn = r - band;
    const rOut = r + band;
    const innerFlat = new Float32Array(n * 3);
    const outerFlat = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const y = startHeight + (endHeight - startHeight) * t;
      const ii = i * 3;
      innerFlat[ii] = rIn;
      innerFlat[ii + 1] = y;
      innerFlat[ii + 2] = 0;
      outerFlat[ii] = rOut;
      outerFlat[ii + 1] = y;
      outerFlat[ii + 2] = 0;
    }
    return { innerFlat, outerFlat };
  }

  function createSuperYearCylinderRing(y, radius, colorHex, opacity, renderOrder, ringKind) {
    const THREE = global.THREE;
    const segs = 48;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        depthWrite: false
      })
    );
    line.renderOrder = renderOrder;
    line.userData = { type: 'SuperYearCylinderRing', ring: ringKind };
    return line;
  }

  /**
   * Open Y-axis cylinder from startHeight→endHeight (time = height).
   * Glass sleeve around Earth helix for Grade School / jobs / other super-year spans.
   */
  function createSuperYearCylinderRoot(opts) {
    if (!opts || !isSuperYearDurationDays(opts.durationDays)) return null;
    const THREE = global.THREE;
    if (!THREE || typeof THREE.CylinderGeometry !== 'function') return null;
    const startHeight = opts.startHeight;
    const endHeight = opts.endHeight;
    const h = Math.abs(endHeight - startHeight);
    if (!(h > 1e-4)) return null;
    const layerConfig = opts.layerConfig || {};
    const rank01 = layerConfig._durationRank01 != null
      ? layerConfig._durationRank01
      : (opts.rank01 != null ? opts.rank01 : null);
    const overlapLane = layerConfig._overlapLane != null
      ? layerConfig._overlapLane
      : (opts.overlapLane || 0);
    const radius = getSuperYearCylinderRadius(opts.earthDist, rank01, overlapLane);
    const fillOp = Math.min(0.38, Math.max(0.08, (opts.fillOpacity != null ? opts.fillOpacity : 0.28) * 0.52));
    const geom = new THREE.CylinderGeometry(radius, radius, h, 48, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: opts.fillHex != null ? opts.fillHex : 0x00b4d8,
      transparent: true,
      opacity: fillOp,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, (startHeight + endHeight) * 0.5, 0);
    mesh.renderOrder = opts.roFill != null ? opts.roFill : -4;
    mesh.userData = {
      longTermFill: true,
      superYearCylinder: true
    };

    const band = Math.max(radius * 0.01, 0.35);
    const rInner = radius - band;
    const rOuter = radius + band;
    const userData = opts.userData || {};
    userData.superYearCylinder = true;
    storeTimelineHelixRef(userData, {
      kind: 'superYearCylinder',
      startHeight,
      endHeight,
      rInner,
      rOuter,
      radius,
      logicalHeight: h,
      refWorldline: opts.refWorldline,
      segments: 8
    });

    const group = new THREE.Group();
    group.userData = userData;
    group.add(mesh);
    // Rings match sleeve fill — skip provenance outline (native #9333ea reads as purple rims).
    const ringHex = opts.fillHex != null ? opts.fillHex : opts.eventHex;
    if (opts.borderStyle !== 'none' && ringHex != null) {
      const ringOp = opts.outlineOp != null ? opts.outlineOp : 0.7;
      const roLine = opts.roLine != null ? opts.roLine : -2;
      group.add(createSuperYearCylinderRing(
        startHeight, radius, ringHex, ringOp, roLine, 'start'));
      group.add(createSuperYearCylinderRing(
        endHeight, radius, ringHex, ringOp, roLine, 'end'));
    }

    const { innerFlat, outerFlat } = buildVerticalCylinderLabelFlats(startHeight, endHeight, radius, 8);
    const wrapped = wrapWorldlineWithLabels(
      group,
      userData,
      opts.labelEvent || opts.event,
      opts.start,
      opts.end,
      startHeight,
      endHeight,
      rInner,
      rOuter,
      opts.eventHex,
      opts.refWorldline,
      0,
      innerFlat,
      outerFlat,
      opts.midTitleAlong01
    );
    return attachEventStaggerRoot(wrapped, getEventBandVerticalStagger(opts.durationDays));
  }

  /**
   * Apply current Event Horizon warp onto an unwarped day-frame ribbon (in place).
   * Re-run each frame so lines conform as selected day / zoom pose moves.
   */
  function applyDayFrameEhWarpToFlats(innerFlat, outerFlat, startMs, endMs, earthDist, currentHeight) {
    if (!innerFlat || !outerFlat || innerFlat.length < 6 || outerFlat.length < 6) return;
    let warpOn = false;
    if (typeof global.isEventHorizonWarpEnabled === 'function') {
      try {
        warpOn = !!global.isEventHorizonWarpEnabled();
      } catch (e) {
        warpOn = false;
      }
    } else if (typeof global.getEventHorizonMode === 'function') {
      try {
        warpOn = global.getEventHorizonMode() === 'nest';
      } catch (e2) {
        warpOn = false;
      }
    }
    if (!warpOn) return;
    const n = Math.floor(innerFlat.length / 3) - 1;
    if (n < 0) return;
    const spanMs = Math.max((endMs || 0) - (startMs || 0), 1);
    let prevAngleDelta = null;
    let prevWarpAngle = null;
    const sphereState =
      typeof global.getContextSphereState === 'function' ? global.getContextSphereState() : null;
    const W = typeof global.ContextSphereWarp !== 'undefined' ? global.ContextSphereWarp : null;
    for (let i = 0; i <= n; i++) {
      const u = n > 0 ? i / n : 0;
      const when = new Date((startMs || 0) + u * spanMs);
      const ii = i * 3;
      let pi = { x: innerFlat[ii], y: innerFlat[ii + 1], z: innerFlat[ii + 2] };
      let po = { x: outerFlat[ii], y: outerFlat[ii + 1], z: outerFlat[ii + 2] };
      const mid = {
        x: (pi.x + po.x) * 0.5,
        y: (pi.y + po.y) * 0.5,
        z: (pi.z + po.z) * 0.5
      };
      const half = {
        x: (po.x - pi.x) * 0.5,
        y: (po.y - pi.y) * 0.5,
        z: (po.z - pi.z) * 0.5
      };
      const warpedMid =
        lerpDayFrameTowardCircadian(mid, when, currentHeight, earthDist, {
          angleDeltaHint: prevAngleDelta
        }) || mid;
      if (typeof warpedMid._warpDelta === 'number') {
        prevAngleDelta = warpedMid._warpDelta;
      }
      if (sphereState && sphereState.radius > 0) {
        let ang = Math.atan2(warpedMid.z - sphereState.z, warpedMid.x - sphereState.x);
        const rad = Math.hypot(warpedMid.x - sphereState.x, warpedMid.z - sphereState.z);
        if (prevWarpAngle != null && rad > 1e-8) {
          while (ang - prevWarpAngle > Math.PI) ang -= Math.PI * 2;
          while (ang - prevWarpAngle < -Math.PI) ang += Math.PI * 2;
          warpedMid.x = sphereState.x + Math.cos(ang) * rad;
          warpedMid.z = sphereState.z + Math.sin(ang) * rad;
        }
        if (rad > 1e-8) prevWarpAngle = ang;
      }
      const blendW =
        typeof warpedMid._arcCircadianBlend === 'number' ? warpedMid._arcCircadianBlend : 0;
      const widthKeep = blendW < 0.12 ? 1 : Math.max(0.08, 1 - blendW * 0.92);
      let halfX = half.x * widthKeep;
      let halfY = half.y * widthKeep;
      let halfZ = half.z * widthKeep;
      const warpAmt = getSelectedWeekLteWarpAmount(when);
      if (warpAmt > 0.001) {
        const halfLen = Math.hypot(halfX, halfY, halfZ);
        if (halfLen > 1e-8) {
          const frac =
            (when.getHours() +
              when.getMinutes() / 60 +
              when.getSeconds() / 3600 +
              when.getMilliseconds() / 3600000) /
            24;
          const dayAngle = frac * Math.PI * 2;
          const ex = sphereState && typeof sphereState.x === 'number' ? sphereState.x : mid.x;
          const ez = sphereState && typeof sphereState.z === 'number' ? sphereState.z : mid.z;
          const hand = Math.atan2(ez, ex) - dayAngle;
          let handUse = hand;
          if (prevWarpAngle != null) {
            while (handUse - prevWarpAngle > Math.PI) handUse -= Math.PI * 2;
            while (handUse - prevWarpAngle < -Math.PI) handUse += Math.PI * 2;
          }
          const discHalfX = Math.cos(handUse) * halfLen;
          const discHalfZ = Math.sin(handUse) * halfLen;
          const wa = Math.max(0, Math.min(1, warpAmt));
          halfX = halfX * (1 - wa) + discHalfX * wa;
          halfY = halfY * (1 - wa);
          halfZ = halfZ * (1 - wa) + discHalfZ * wa;
        }
      }
      pi = {
        x: warpedMid.x - halfX,
        y: warpedMid.y - halfY,
        z: warpedMid.z - halfZ
      };
      po = {
        x: warpedMid.x + halfX,
        y: warpedMid.y + halfY,
        z: warpedMid.z + halfZ
      };
      if (warpAmt > 0.001 && W && typeof W.clampOutsideHorizon === 'function' && sphereState) {
        const ci = W.clampOutsideHorizon(pi, sphereState);
        const co = W.clampOutsideHorizon(po, sphereState);
        pi = ci;
        po = co;
      }
      innerFlat[ii] = pi.x;
      innerFlat[ii + 1] = pi.y;
      innerFlat[ii + 2] = pi.z;
      outerFlat[ii] = po.x;
      outerFlat[ii + 1] = po.y;
      outerFlat[ii + 2] = po.z;
    }
  }

  /**
   * Helix ribbon for sub-day spans on the annual worldline: fixed midnight spoke per calendar day,
   * wall-clock in event TZ → radius; TZ offset stacks in Y above/below the day line.
   * Returns *unwarped* flats — Event Horizon warp is applied live so lines conform while moving.
   */
  function buildDayFrameHelixPair(start, end, earthDist, currentHeight, segments, indexOffset, event, durationH) {
    if (!start || !end || !(end > start)) return null;
    const { inner, outer } = getDayMarkerFrameRadii(earthDist);
    const frameSpan = Math.max(outer - inner, earthDist * 0.008);
    const durationHours = typeof durationH === 'number' && !isNaN(durationH)
      ? durationH
      : durationHoursBetween(start, end);
    const useDayCross = shouldUseCalendarDayCrossSectionRibbon();
    const bandHalf = getAnnualDayFrameRibbonBandHalf(earthDist, frameSpan, durationHours);
    const startMs = start.getTime();
    const spanMs = Math.max(end.getTime() - startMs, 1);
    const segHint =
      typeof segments === 'number' && !isNaN(segments) ? Math.max(2, Math.floor(segments)) : 10;
    // Prefer caller densify (warp-aware); still floor by duration so long spans stay smooth.
    const n = Math.max(segHint, Math.min(96, Math.ceil((spanMs / 3600000) * 6)));
    const innerFlat = [];
    const outerFlat = [];
    const viewerTz = getUserTimeZoneId();
    const eventTz = getEventTimeZoneId(event);
    const hph = getDayFrameHeightPerHour();
    const laneY = (indexOffset != null ? indexOffset : 0) * hph * 0.12;

    let clipStart = false;
    let clipEnd = false;

    // Pin day-cross to the start calendar day so midnight-spanning events do not
    // jump day Y-bounds mid-ribbon (that read as wild diagonals).
    const startViewerParts = getZonedDateParts(start, viewerTz);
    const pinnedDayBounds = useDayCross
      ? getCalendarDayCrossSectionYBounds(startViewerParts)
      : null;
    const crossesMidnight =
      useDayCross &&
      (() => {
        const ep = getZonedDateParts(end, viewerTz);
        return (
          ep.year !== startViewerParts.year ||
          ep.month !== startViewerParts.month ||
          ep.day !== startViewerParts.day
        );
      })();

    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const when = new Date(startMs + u * spanMs);
      // After midnight on a multi-day span: stop extending day-cross (clip to start day).
      if (crossesMidnight && pinnedDayBounds) {
        const wp = getZonedDateParts(when, viewerTz);
        if (
          wp.year !== startViewerParts.year ||
          wp.month !== startViewerParts.month ||
          wp.day !== startViewerParts.day
        ) {
          break;
        }
      }
      const anchor = computeDayFrameAnchor(when, eventTz, viewerTz, earthDist, currentHeight, indexOffset, true);
      let pi;
      let po;
      if (useDayCross && pinnedDayBounds) {
        const { dayStartY, dayEndY } = pinnedDayBounds;
        pi = dayFrameCrossSectionEdgePosition(dayStartY, anchor.rMid, currentHeight, laneY);
        po = dayFrameCrossSectionEdgePosition(dayEndY, anchor.rMid, currentHeight, laneY);
      } else {
        const edges = resolveDayFrameRibbonEdgeRadii(anchor.rMid, inner, outer, bandHalf);
        if (i === 0 && (edges.clippedLow || edges.clippedHigh)) clipStart = true;
        if (i === n && (edges.clippedLow || edges.clippedHigh)) clipEnd = true;
        pi = dayFramePositionFromAnchor(anchor, edges.rIn);
        po = dayFramePositionFromAnchor(anchor, edges.rOut);
      }

      innerFlat.push(pi.x, pi.y, pi.z);
      outerFlat.push(po.x, po.y, po.z);
    }

    if (innerFlat.length < 6) return null;

    const startAnchor = computeDayFrameAnchor(start, eventTz, viewerTz, earthDist, currentHeight, indexOffset, true);
    const endAnchor = computeDayFrameAnchor(end, eventTz, viewerTz, earthDist, currentHeight, indexOffset, true);

    return {
      innerFlat,
      outerFlat,
      rInner: startAnchor.rMid,
      rOuter: endAnchor.rMid,
      extendsOutsideFrame: clipStart || clipEnd
    };
  }

  /**
   * Orthonormal frame on the ribbon at `idx`. **width** = inner helix → outer helix (Sun-ward → Earth).
   * Label plane uses local **+X → width** so left-to-right text reads from inner radius toward Earth; **+Y → tangent** (along span).
   * @param {number} [tAlongWidth] - 0 = inner edge, 1 = outer, 0.5 = mid (default). Below 0.5 shifts Sun-ward (away from day-marker text).
   * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, tangent: THREE.Vector3, width: THREE.Vector3, normal: THREE.Vector3, band: number }|null}
   */
  function sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, tAlongWidth) {
    const THREE = global.THREE;
    const n = innerFlat.length / 3;
    if (n < 2 || !outerFlat || outerFlat.length < n * 3) return null;
    const clampI = (i) => Math.max(0, Math.min(n - 1, i));
    const i = clampI(idx);
    const iPrev = clampI(i - 1);
    const iNext = clampI(i + 1);
    const Pi = new THREE.Vector3(innerFlat[i * 3], innerFlat[i * 3 + 1], innerFlat[i * 3 + 2]);
    const Po = new THREE.Vector3(outerFlat[i * 3], outerFlat[i * 3 + 1], outerFlat[i * 3 + 2]);
    const PiPrev = new THREE.Vector3(innerFlat[iPrev * 3], innerFlat[iPrev * 3 + 1], innerFlat[iPrev * 3 + 2]);
    const PiNext = new THREE.Vector3(innerFlat[iNext * 3], innerFlat[iNext * 3 + 1], innerFlat[iNext * 3 + 2]);
    const tW = tAlongWidth != null && isFinite(tAlongWidth)
      ? Math.max(0, Math.min(1, Number(tAlongWidth)))
      : 0.5;
    const center = new THREE.Vector3().lerpVectors(Pi, Po, tW);
    const width = new THREE.Vector3().subVectors(Po, Pi);
    const band = width.length();
    if (band < 1e-6) width.set(1, 0, 0);
    else width.normalize();
    const tangent = new THREE.Vector3().subVectors(PiNext, PiPrev);
    if (tangent.lengthSq() < 1e-10) tangent.set(-width.z, 0, width.x);
    const tw = tangent.dot(width);
    tangent.addScaledVector(width, -tw);
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 1, 0);
    else tangent.normalize();
    const bx = width;
    const by = tangent;
    const bz = new THREE.Vector3().crossVectors(bx, by);
    if (bz.lengthSq() < 1e-10) return null;
    bz.normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(bx, by, bz)
    );
    const normal = bz.clone();
    return { position: center, quaternion: quat, tangent, width, normal, band };
  }

  /** Larger font / plane for longer spans (multi-day); sub-day uses hours. */
  function getEventNameLabelStyleFromDuration(start, end) {
    const days = durationDaysBetween(start, end);
    const hrs = durationHoursBetween(start, end);
    let u;
    if (hrs < 24) u = Math.max(0, Math.min(1, hrs / 24));
    else u = Math.max(0, Math.min(1, Math.log(1 + days) / Math.log(366)));
    const fontPx = Math.round(13 + u * 28);
    return { u, fontPx };
  }

  /** Dark outline behind event **name** glyphs (2D canvas); not used for MM/DD-only labels. */
  function strokeAndFillEventNameOnCanvas(ctx, text, x, y, r, g, b, fontPx, isNameLabel) {
    if (!text) return;
    ctx.textBaseline = 'middle';
    if (isNameLabel) {
      const fp = Math.max(8, Math.round(fontPx));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8, 10, 16, 0.96)';
      ctx.lineWidth = Math.max(2.5, fp * 0.2);
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = `rgba(${r},${g},${b},0.98)`;
    ctx.fillText(text, x, y);
  }

  function wrapParagraphToLines(ctx, para, maxW) {
    const words = String(para).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width <= maxW) {
        cur = t;
      } else {
        if (cur) lines.push(cur);
        if (ctx.measureText(w).width > maxW) {
          let rest = w;
          while (rest.length) {
            let lo = 1;
            let hi = rest.length;
            let best = 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (ctx.measureText(rest.slice(0, mid)).width <= maxW) {
                best = mid;
                lo = mid + 1;
              } else {
                hi = mid - 1;
              }
            }
            lines.push(rest.slice(0, best));
            rest = rest.slice(best);
          }
          cur = '';
        } else {
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** Split on \\n; wrap each paragraph to maxW. Blank rows become empty lines. */
  function eventNameToCanvasLines(text, ctx, maxW) {
    const rows = String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '').split('\n');
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row === '') {
        out.push('');
        continue;
      }
      out.push(...wrapParagraphToLines(ctx, row, maxW));
    }
    return out.length ? out : [''];
  }

  /** Single-line width in px (must match `bold ... Orbitron` in label canvases). */
  function measureBoldOrbitronTextWidthPx(text, fontPx) {
    if (text == null || text === '') return 0;
    const fp = Math.max(8, Math.round(fontPx));
    const probe = document.createElement('canvas');
    const ctx = probe.getContext('2d');
    ctx.font = `bold ${fp}px Orbitron`;
    return ctx.measureText(String(text)).width;
  }

  /**
   * Canvas pixel size for event ribbon text (must match createEventSurfaceTextMesh drawing).
   * @param {number} [maxLineWidthPx] - if set, word-wrap and support explicit line breaks for long-term names.
   * @returns {{ cw: number, ch: number, lines?: string[], lineHeight?: number }}
   */
  function measureEventSurfaceLabelCanvasSize(text, fontPx, pad, maxLineWidthPx) {
    const fp = Math.max(8, Math.round(fontPx));
    const p = pad != null ? pad : 14;
    const probe = document.createElement('canvas');
    const ctx = probe.getContext('2d');
    ctx.font = `bold ${fp}px Orbitron`;
    const lh = fp * 1.22;
    if (maxLineWidthPx != null && maxLineWidthPx > 0) {
      const lines = eventNameToCanvasLines(text, ctx, maxLineWidthPx);
      let tw = 80;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (ln) tw = Math.max(tw, ctx.measureText(ln).width);
      }
      const ch = Math.ceil(Math.max(lh + p * 2, lines.length * lh + p * 2));
      const cw = Math.ceil(Math.max(80, tw + p * 2));
      return { cw, ch, lines, lineHeight: lh };
    }
    const tw = text ? ctx.measureText(String(text)).width : 40;
    const ch = Math.ceil(Math.max(40, fp + p * 2));
    return {
      cw: Math.ceil(Math.max(80, tw + p * 2)),
      ch
    };
  }

  /**
   * Text on a plane mesh (no billboard). `textAlign` 'left': first glyph at texture left → maps to inner radius when plane +X is width.
   * @param {boolean} [isNameLabel] - if true, draw a dark stroke around glyphs (event titles only).
   * @param {boolean} [mapWideAlongRibbonTangent] - long-term ribbons: keep glyph aspect by mapping canvas “wide” to ribbon tangent (+Y), thin to radial (+X); rotates the texture 90°.
   * @param {number} [maxLineWidthPx] - wrap long names / honor \\n (long-term labels only when set).
   */
  function createEventSurfaceTextMesh(text, colorHex, planeWorldW, planeWorldH, fontPx, textAlign, isNameLabel, mapWideAlongRibbonTangent, maxLineWidthPx) {
    const THREE = global.THREE;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fp = Math.max(8, Math.round(fontPx));
    ctx.font = `bold ${fp}px Orbitron`;
    const pad = 14;
    const align = textAlign === 'left' ? 'left' : 'center';
    const layout = measureEventSurfaceLabelCanvasSize(text, fp, pad, maxLineWidthPx);
    const cw = layout.cw;
    const ch = layout.ch;
    canvas.width = cw;
    canvas.height = ch;
    const textColorHex = (colorHex != null && luminanceForHex(colorHex) >= 0.35) ? colorHex : DEFAULT_LABEL_COLOR_HEX;
    const r = (textColorHex >> 16) & 0xff;
    const g = (textColorHex >> 8) & 0xff;
    const b = textColorHex & 0xff;
    ctx.font = `bold ${fp}px Orbitron`;
    ctx.textAlign = align;
    if (text) {
      const tx = align === 'left' ? pad : cw / 2;
      if (layout.lines && layout.lines.length) {
        const lh = layout.lineHeight || fp * 1.22;
        for (let li = 0; li < layout.lines.length; li++) {
          const ln = layout.lines[li];
          const ty = pad + (li + 0.5) * lh;
          if (ln) strokeAndFillEventNameOnCanvas(ctx, ln, tx, ty, r, g, b, fp, !!isNameLabel);
        }
      } else {
        const ty = ch / 2;
        strokeAndFillEventNameOnCanvas(ctx, text, tx, ty, r, g, b, fp, !!isNameLabel);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (mapWideAlongRibbonTangent) {
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
    }
    const geo = new THREE.PlaneGeometry(planeWorldW, planeWorldH);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = EVENT_LABEL_SPRITE_RENDER_ORDER;
    return mesh;
  }

  function placeMeshOnRibbonFrame(mesh, frame, normalBump) {
    if (!mesh || !frame) return;
    let py = frame.position.y;
    const amt = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
    if (amt > 0.001) {
      const focusY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
      py = flattenTimelineLogicalY(py, focusY, amt);
    }
    mesh.position.set(frame.position.x, py, frame.position.z);
    mesh.userData.logicalY = frame.position.y;
    if (normalBump && frame.normal) mesh.position.addScaledVector(frame.normal, normalBump);
    mesh.quaternion.copy(frame.quaternion);
  }

  /**
   * Short circadian labels: lie in the ribbon plane (no camera billboard). Canvas +X reads along the arc
   * (tangent); canvas +Y is letter height toward the outer edge of the band (away from Earth — {@link sampleRibbonSurfaceFrame} width).
   */
  function orientCircadianShortRibbonLabelMesh(mesh, frame) {
    const THREE = global.THREE;
    if (!mesh || !frame || !frame.tangent || !frame.width) return;
    const xAxis = frame.tangent.clone();
    if (xAxis.lengthSq() < 1e-14) return;
    xAxis.normalize();
    const yAxis = frame.width.clone();
    if (yAxis.lengthSq() < 1e-14) return;
    yAxis.normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    if (zAxis.lengthSq() < 1e-14) return;
    zAxis.normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  }

  /** Annual-helix day frame: glyphs read inner → outer (+X = radial width). */
  function orientDayFrameAnnualHelixLabelMesh(mesh, frame) {
    const THREE = global.THREE;
    if (!mesh || !frame || !frame.width || !frame.tangent) return;
    const xAxis = frame.width.clone();
    if (xAxis.lengthSq() < 1e-14) return;
    xAxis.normalize();
    const yAxis = frame.tangent.clone();
    if (yAxis.lengthSq() < 1e-14) return;
    yAxis.normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    if (zAxis.lengthSq() < 1e-14) return;
    zAxis.normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  }

  function getDayFrameWorldPosition(when, earthDist, refHeight, overlapLane, event) {
    const viewerTz = getUserTimeZoneId();
    const eventTz = getEventTimeZoneId(event);
    const anchor = computeDayFrameAnchor(when, eventTz, viewerTz, earthDist, refHeight, overlapLane, true);
    return dayFramePositionFromAnchor(anchor, anchor.rMid);
  }

  function getDailySkyRibbonPuffY() {
    const handLen = global.CircadianRenderer && typeof global.CircadianRenderer.getHandLength === 'function'
      ? global.CircadianRenderer.getHandLength()
      : 12;
    return Math.max(0.02, handLen * 0.004);
  }

  function getEventCenterLocalHourDecimal(start, end) {
    if (!start || isNaN(start.getTime())) return 12;
    const tMs =
      end && end > start ? (start.getTime() + end.getTime()) * 0.5 : start.getTime();
    const d = new Date(tMs);
    return (
      d.getHours() +
      d.getMinutes() / 60 +
      d.getSeconds() / 3600
    );
  }

  /** True when event midpoint is after 06:00 and before 18:00 (local). */
  function isEventCenterInDaytimeCircadianWindow(start, end) {
    const h = getEventCenterLocalHourDecimal(start, end);
    return h > 6 && h < 18;
  }

  /**
   * Day/clock sky STE labels: +X along arc; +Y is sun-up (top face) or day/night rule on underside.
   */
  function orientDailySkySteLabelMesh(mesh, frame, skyFace, start, end) {
    const THREE = global.THREE;
    if (!mesh || !frame || !frame.tangent || !frame.width) return;
    let tangent = frame.tangent.clone();
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
    else tangent.normalize();

    let sunUp;
    if (skyFace === 'bottom') {
      const daytime = isEventCenterInDaytimeCircadianWindow(start, end);
      sunUp = frame.width.clone();
      if (!daytime) sunUp.multiplyScalar(-1);
    } else {
      sunUp = frame.width.clone().multiplyScalar(-1);
    }
    sunUp.y = 0;
    if (sunUp.lengthSq() < 1e-12) sunUp.set(-tangent.z, 0, tangent.x);
    else sunUp.normalize();

    let xAxis = tangent.clone();
    let yAxis = sunUp.clone();
    let zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    if (zAxis.lengthSq() < 1e-12) {
      zAxis.set(0, 1, 0);
      yAxis.crossVectors(zAxis, xAxis).normalize();
    } else {
      zAxis.normalize();
    }

    const wantZUp = skyFace !== 'bottom';
    if (wantZUp && zAxis.y < 0) {
      xAxis.multiplyScalar(-1);
      zAxis.multiplyScalar(-1);
    } else if (!wantZUp && zAxis.y > 0) {
      xAxis.multiplyScalar(-1);
      zAxis.multiplyScalar(-1);
    }
    yAxis.crossVectors(zAxis, xAxis).normalize();
    xAxis.crossVectors(yAxis, zAxis).normalize();

    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    if (mesh.material) {
      mesh.material.side = THREE.FrontSide;
      mesh.material.depthTest = true;
      mesh.material.depthWrite = false;
    }
  }

  /** Sit on ribbon surface in parent-local Y (parent ±puff already offsets the ribbon stack). */
  function placeDailySkySteLabelMesh(mesh, frame, skyFace, start, end) {
    if (!mesh || !frame) return;
    const puffY = getDailySkyRibbonPuffY();
    const surfaceEps = Math.max(0.0012, puffY * 0.12);
    mesh.position.copy(frame.position);
    orientDailySkySteLabelMesh(mesh, frame, skyFace, start, end);
    mesh.position.y += skyFace === 'top' ? surfaceEps : -surfaceEps;
  }

  function chordLenAlongInner(innerFlat, i0, i1) {
    const THREE = global.THREE;
    const p0 = new THREE.Vector3(innerFlat[i0 * 3], innerFlat[i0 * 3 + 1], innerFlat[i0 * 3 + 2]);
    const p1 = new THREE.Vector3(innerFlat[i1 * 3], innerFlat[i1 * 3 + 1], innerFlat[i1 * 3 + 2]);
    return p0.distanceTo(p1);
  }

  /** Polyline length along inner ribbon vertices from index i0 through i1-1. */
  function polylineArcLenInner(innerFlat, i0, i1) {
    if (!innerFlat || i1 <= i0) return 0;
    const np = innerFlat.length / 3;
    const hi = Math.min(i1, np - 1);
    let L = 0;
    for (let i = i0; i < hi; i++) {
      L += chordLenAlongInner(innerFlat, i, i + 1);
    }
    return L;
  }

  /**
   * Get Earth distance from PLANET_DATA if available
   */
  function getEarthDistance() {
    if (typeof PLANET_DATA !== 'undefined' && Array.isArray(PLANET_DATA)) {
      const earth = PLANET_DATA.find(p => p.name === 'Earth');
      if (earth && typeof earth.distance === 'number') return earth.distance;
    }
    return EARTH_RADIUS;
  }

  const DEFAULT_EARTH_GLOBE_SURFACE_RADIUS = 1.95;
  /** Clearance beyond the rendered globe mesh (scene units from Earth center). */
  const SHORT_CIRCADIAN_RADIUS_PAD_OUTSIDE_GLOBE = 0.14;

  function getEarthGlobeSurfaceRadiusForEvents() {
    if (typeof global.getEarthGlobeSurfaceRadius === 'function') {
      const r = global.getEarthGlobeSurfaceRadius();
      if (typeof r === 'number' && r > 0 && !isNaN(r)) return r;
    }
    if (typeof PLANET_DATA !== 'undefined' && Array.isArray(PLANET_DATA)) {
      const earth = PLANET_DATA.find(p => p.name === 'Earth');
      if (earth && typeof earth.size === 'number') return earth.size * 0.3;
    }
    return DEFAULT_EARTH_GLOBE_SURFACE_RADIUS;
  }

  /** Minimum radial distance from Earth center for short circadian geometry (must clear the globe). */
  function getShortCircadianMinRadiusFromEarthCenter() {
    return getEarthGlobeSurfaceRadiusForEvents() + SHORT_CIRCADIAN_RADIUS_PAD_OUTSIDE_GLOBE;
  }

  function clampShortCircadianRadiusFromEarth(r) {
    const minR = getShortCircadianMinRadiusFromEarthCenter();
    if (r == null || isNaN(r)) return minR;
    return Math.max(r, minR);
  }

  function clampShortCircadianDiskRibbon(dr) {
    if (!dr) return dr;
    const zl = getZoomLevelForEvents();
    const minR = getShortCircadianMinRadiusFromEarthCenter();
    let rIn = clampShortCircadianRadiusFromEarth(dr.rIn);
    let rOut = clampShortCircadianRadiusFromEarth(dr.rOut);
    const minSpan = getShortCircadianMinRibbonRadialSpan(
      typeof global.CircadianRenderer !== 'undefined' && global.CircadianRenderer.getHandLength
        ? global.CircadianRenderer.getHandLength()
        : 12,
      zl
    );
    if (isEarthDailySkyEventZoom(zl)) {
      const hl =
        typeof global.CircadianRenderer !== 'undefined' && global.CircadianRenderer.getHandLength
          ? global.CircadianRenderer.getHandLength()
          : 12;
      const maxOuter = getDailySkySteMaxOuterRadius(hl);
      if (rOut > maxOuter) {
        const w = Math.max(rOut - rIn, hl * 0.012);
        rOut = maxOuter;
        rIn = Math.max(minR, rOut - w);
      }
      if (!(rOut > rIn)) rOut = rIn + hl * 0.012;
    } else {
      if (!(rOut > rIn)) rOut = rIn + minSpan;
      if (rOut - rIn < minSpan) {
        const mid = (rIn + rOut) * 0.5;
        rIn = Math.max(minR, mid - minSpan * 0.5);
        rOut = Math.max(rIn + minSpan * 0.55, mid + minSpan * 0.5);
      }
    }
    const rMid = clampShortCircadianRadiusFromEarth(
      dr.rMid != null && !isNaN(dr.rMid) ? dr.rMid : (rIn + rOut) * 0.5
    );
    return { rIn, rOut, rMid, lane: dr.lane };
  }

  /** Default label text color when event/layer color is too dark (neutral visible gray). */
  const DEFAULT_LABEL_COLOR_HEX = 0x9ca3af;

  function luminanceForHex(hex) {
    const r = ((hex >> 16) & 0xff) / 255;
    const g = ((hex >> 8) & 0xff) / 255;
    const b = (hex & 0xff) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function luminanceToGrayHex(hex) {
    const L = Math.round(luminanceForHex(hex) * 255);
    return (L << 16) | (L << 8) | L;
  }

  /**
   * Moment (0): full color only in the selected hour; same-day neighbors go mostly grayscale.
   */
  function applyMomentZoomFocusColor(hex, start, end) {
    if (getZoomLevelForEvents() !== 0 || !start || isNaN(start.getTime())) return hex;
    if (isCircadianShortEventsShiftPreview()) return hex;
    if (eventTouchesSelectedHour(start, end)) return hex;
    return lerpHexColor(hex, luminanceToGrayHex(hex), 0.9);
  }

  /** Return full vibrant event color without temporal fading or grayscale degradation. */
  function applyEventDisplayColor(hex) {
    return hex;
  }

  /**
   * Create a text sprite for event line labels (event name or MM/DD). Color in hex number.
   * Uses neutral gray for text when the given color is too dark for readability.
   * For event names (isNameLabel true), canvas width is sized to fit the full text.
   * @param {string} text
   * @param {number} colorHex - e.g. 0x00b4d8
   * @param {number} x, y, z - world position
   * @param {number} scale - sprite scale (default 8)
   * @param {boolean} isNameLabel - if true, canvas width is derived from text measure so full name fits
   * @returns {THREE.Sprite}
   */
  function createEventLineLabelSprite(text, colorHex, x, y, z, scale, isNameLabel) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const font = 'bold 36px Orbitron';
    context.font = font;

    const padding = 24;
    const minWidth = 256;
    const height = 64;

    let width = minWidth;
    if (isNameLabel && text) {
      const metrics = context.measureText(text);
      width = Math.ceil(Math.max(minWidth, metrics.width + padding * 2));
    }
    canvas.width = width;
    canvas.height = height;

    const textColorHex = (colorHex != null && luminanceForHex(colorHex) >= 0.35) ? colorHex : DEFAULT_LABEL_COLOR_HEX;
    const r = (textColorHex >> 16) & 0xff;
    const g = (textColorHex >> 8) & 0xff;
    const b = textColorHex & 0xff;
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const nx = width / 2;
    const ny = height / 2;
    if (isNameLabel) {
      strokeAndFillEventNameOnCanvas(context, text, nx, ny, r, g, b, 36, true);
    } else {
      context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      context.fillText(text, nx, ny);
    }

    const texture = new global.THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new global.THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      alphaTest: 0.05
    });
    const sprite = new global.THREE.Sprite(mat);
    sprite.renderOrder = EVENT_LABEL_SPRITE_RENDER_ORDER;
    sprite.position.set(x, y, z);
    const s = scale != null ? scale : 8;
    const sx = s * (width / minWidth);
    const sy = s * 0.3;
    sprite.scale.set(sx, sy, 1);
    sprite.userData.baseScale = { x: sx, y: sy, z: 1 };
    sprite.userData.immuneToFlatten = true;
    return sprite;
  }

  /**
   * Name sprites scale with canvas width; shrink so world width stays within ribbon radial thickness.
   */
  function clampEventNameSpriteScaleToBand(sprite, bandWorld, frac) {
    if (!sprite || !sprite.scale || bandWorld == null || !(bandWorld > 1e-6)) return;
    const maxSpan = bandWorld * (frac != null ? frac : 0.88);
    const sx = sprite.scale.x;
    if (sx > maxSpan) {
      const r = maxSpan / sx;
      sprite.scale.x *= r;
      sprite.scale.y *= r;
      if (sprite.userData && sprite.userData.baseScale) {
        sprite.userData.baseScale.x *= r;
        sprite.userData.baseScale.y *= r;
      }
    }
  }

  function attachEventLabelTiming(sprite, start, end, isNameLabel) {
    if (!sprite || !sprite.userData) return sprite;
    const s = start instanceof Date && !isNaN(start.getTime()) ? start.getTime() : NaN;
    const e = end instanceof Date && !isNaN(end.getTime()) && end > start ? end.getTime() : s;
    if (isFinite(s)) sprite.userData.labelStartMs = s;
    if (isFinite(e)) sprite.userData.labelEndMs = e;
    if (isNameLabel) sprite.userData.isEventNameLabel = true;
    return sprite;
  }

  /**
   * Format date as MM/DD for start/end labels
   */
  function formatMMDD(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return (m < 10 ? '0' : '') + m + '/' + (d < 10 ? '0' : '') + d;
  }

  /**
   * Short-event dot: semi-transparent fill + edge outline (long-term ribbon look, smaller scale).
   * @param {{ position: {x:number,y:number,z:number}, quaternion?: import('three').Quaternion }|null} [diskFrame] - when set, lays a flat disk circle on the circadian day plane
   * @returns {THREE.Group}
   */
  function createEventLinePointMarker(x, y, z, colorHex, size, userData, startForOpacity, endForOpacity, diskFrame) {
    const THREE = global.THREE;
    const root = new THREE.Group();
    const amt = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
    if (amt > 0.001) {
      const focusY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
      y = flattenTimelineLogicalY(y, focusY, amt);
    }
    root.position.set(x, y, z);
    root.userData = userData || { type: 'EventLineMarker' };
    return root;
  }

  /**
   * Get start date from event (VEvent or plain object)
   * @param {Object|VEvent} event
   * @returns {Date|null}
   */
  function parseLocalCalendarDate(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  }

  function getEventStart(event) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      return event.getStartDate();
    }
    if (event.dtstart) {
      if (event.dtstart.dateTime) return new Date(event.dtstart.dateTime);
      if (event.dtstart.date) {
        const local = parseLocalCalendarDate(event.dtstart.date);
        if (local) return local;
        return new Date(event.dtstart.date + 'T00:00:00Z');
      }
      if (typeof event.dtstart === 'string') {
        const d = new Date(event.dtstart);
        if (!isNaN(d.getTime())) return d;
      }
    }
    const start = event.startTime || event.start || event.date;
    return start instanceof Date ? start : start ? new Date(start) : null;
  }

  /**
   * Get end date from event (VEvent or plain object)
   * @param {Object|VEvent} event
   * @returns {Date|null}
   */
  function getEventEnd(event) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      return event.getEndDate();
    }
    if (event.dtend) {
      if (event.dtend.dateTime) return new Date(event.dtend.dateTime);
      if (event.dtend.date) {
        const local = parseLocalCalendarDate(event.dtend.date);
        if (local) return local;
        return new Date(event.dtend.date + 'T00:00:00Z');
      }
      if (typeof event.dtend === 'string') {
        const d = new Date(event.dtend);
        if (!isNaN(d.getTime())) return d;
      }
    }
    const end = event.endTime || event.end;
    return end instanceof Date ? end : end ? new Date(end) : null;
  }

  function mergeTimeIntervalsMs(intervals) {
    if (!intervals || intervals.length === 0) return [];
    const iv = intervals.filter(x => x && x[1] > x[0]).map(x => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
    if (iv.length === 0) return [];
    const out = [[iv[0][0], iv[0][1]]];
    for (let k = 1; k < iv.length; k++) {
      const a = iv[k][0];
      const b = iv[k][1];
      const last = out[out.length - 1];
      if (a <= last[1]) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  /**
   * 0–1 along the host interval for title placement: center of the longest gap not covered by strictly shorter overlapping spans.
   */
  function findMidTitleAlongSpan01(hostStartMs, hostEndMs, occluderIntervalsMs) {
    const S = hostStartMs;
    const E = hostEndMs;
    const span = E - S;
    if (!(span > 0)) return 0.5;
    const merged = mergeTimeIntervalsMs(occluderIntervalsMs);
    let bestSeg = null;
    let cursor = S;
    for (let k = 0; k < merged.length; k++) {
      const a = merged[k][0];
      const b = merged[k][1];
      if (a > cursor) {
        const seg = [cursor, a];
        if (!bestSeg || seg[1] - seg[0] > bestSeg[1] - bestSeg[0]) bestSeg = seg;
      }
      cursor = Math.max(cursor, b);
    }
    if (E > cursor) {
      const seg = [cursor, E];
      if (!bestSeg || seg[1] - seg[0] > bestSeg[1] - bestSeg[0]) bestSeg = seg;
    }
    if (!bestSeg || bestSeg[1] - bestSeg[0] < 1e-9) return 0.5;
    const midMs = (bestSeg[0] + bestSeg[1]) * 0.5;
    const t = (midMs - S) / span;
    return Math.max(0, Math.min(1, t));
  }

  function computeTitleAlongForLayerEvents(events) {
    const map = new Map();
    if (!events || !events.length) return map;
    for (let i = 0; i < events.length; i++) {
      const s = getEventStart(events[i]);
      const e = getEventEnd(events[i]);
      if (!s || isNaN(s.getTime()) || !e || e <= s) {
        map.set(i, 0.5);
        continue;
      }
      const hostMs0 = s.getTime();
      const hostMs1 = e.getTime();
      const hostDur = hostMs1 - hostMs0;
      const oc = [];
      for (let j = 0; j < events.length; j++) {
        if (j === i) continue;
        const sj = getEventStart(events[j]);
        const ej = getEventEnd(events[j]);
        if (!sj || isNaN(sj.getTime()) || !ej || ej <= sj) continue;
        const djr = ej.getTime() - sj.getTime();
        if (djr >= hostDur) continue;
        const a = Math.max(hostMs0, sj.getTime());
        const b = Math.min(hostMs1, ej.getTime());
        if (b > a) oc.push([a, b]);
      }
      map.set(i, findMidTitleAlongSpan01(hostMs0, hostMs1, oc));
    }
    return map;
  }

  function computeTitleAlongForLayerLines(lines) {
    const map = new Map();
    if (!lines || !lines.length) return map;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const s = line.start instanceof Date ? line.start : new Date(line.start);
      const e = line.end instanceof Date ? line.end : new Date(line.end);
      if (!s || isNaN(s.getTime()) || !e || isNaN(e.getTime()) || e <= s) {
        map.set(i, 0.5);
        continue;
      }
      const hostMs0 = s.getTime();
      const hostMs1 = e.getTime();
      const hostDur = hostMs1 - hostMs0;
      const oc = [];
      for (let j = 0; j < lines.length; j++) {
        if (j === i) continue;
        const lj = lines[j];
        const sj = lj.start instanceof Date ? lj.start : new Date(lj.start);
        const ej = lj.end instanceof Date ? lj.end : new Date(lj.end);
        if (!sj || isNaN(sj.getTime()) || !ej || isNaN(ej.getTime()) || ej <= sj) continue;
        const djr = ej.getTime() - sj.getTime();
        if (djr >= hostDur) continue;
        const a = Math.max(hostMs0, sj.getTime());
        const b = Math.min(hostMs1, ej.getTime());
        if (b > a) oc.push([a, b]);
      }
      map.set(i, findMidTitleAlongSpan01(hostMs0, hostMs1, oc));
    }
    return map;
  }

  function hasCategoryValue(event, value) {
    if (!event || !value) return false;
    const target = String(value).trim().toLowerCase();
    const source = event.category ?? event.categories;
    if (Array.isArray(source)) {
      return source.some((entry) => String(entry).trim().toLowerCase() === target);
    }
    if (source != null) {
      return String(source).trim().toLowerCase() === target;
    }
    return false;
  }

  function isTripEvent(event) {
    if (!event) return false;
    if (event.isTrip === true) return true;
    if (event.meta && event.meta.isTrip === true) return true;
    return hasCategoryValue(event, 'trip');
  }

  function isWorkTaggedEvent(event) {
    if (!event) return false;
    if (event.isWorkEvent === true) return true;
    if (event.meta && event.meta.isWorkEvent === true) return true;
    return hasCategoryValue(event, 'work');
  }

  function getLongTermEventMarkers(event, start, end) {
    if (!start || !end || end <= start) return '';
    if (durationDaysBetween(start, end) < 1) return '';
    const markers = [];
    if (isTripEvent(event)) markers.push('[TRIP]');
    if (isWorkTaggedEvent(event)) markers.push('[WORK]');
    return markers.length ? markers.join(' ') : '';
  }

  function getEventSummaryText(event, start, end) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      const s = event.summary;
      const base = s && String(s).trim() ? String(s).trim() : null;
      const markers = getLongTermEventMarkers(event, start, end);
      if (!markers) return base;
      return base ? `${markers} ${base}` : markers;
    }
    const s = event.summary || event.title;
    const base = s && String(s).trim() ? String(s).trim() : null;
    const markers = getLongTermEventMarkers(event, start, end);
    if (!markers) return base;
    return base ? `${markers} ${base}` : markers;
  }

  /**
   * Labels on ribbon surface (plane meshes, no billboards). Falls back to sprites if geometry is unusable.
   * @param {number} [midTitleAlongSpan01] - 0–1 along the span for the **name** anchor (default 0.5); dates stay at ends.
   */
  function addEventWorldlineLabelSprites(parent, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, currentHeight, staggerY, innerFlatOpt, outerFlatOpt, midTitleAlongSpan01, dailySkyFace) {
    if (!parent || !start || !end || end <= start) return;
    const showDates = areEventTextLabelsVisibleAtCurrentZoom(start, end);
    const showName = areEventNameLabelsVisibleAtCurrentZoom(start, end);
    if (!showDates && !showName) return;
    const isDayFrameAnnualHelixLabel = !!(parent.userData && parent.userData.dayFrameAnnualHelix);
    const labelType = parent.userData && parent.userData.type === 'EventLine' ? 'EventLineLabel' : 'EventObjectLabel';
    const sy = staggerY != null && !isNaN(staggerY) ? staggerY : 0;
    const sameDay = start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
    const isShortEvent = durationHoursBetween(start, end) < 24;
    const daysForLabels = durationDaysBetween(start, end);
    const isWeekCorridorEvent = eventBandUsesWeekCorridor(daysForLabels);
    const showEndpointDates = showDates && !isWeekCorridorEvent;
    const earthDist = getEarthDistance();
    let innerFlat = innerFlatOpt;
    let outerFlat = outerFlatOpt;
    if (!innerFlat || !outerFlat || innerFlat.length < 6) {
      const seg = Math.max(8, Math.min(48, Math.ceil(Math.abs(endHeight - startHeight) / 8)));
      const pair = buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, seg);
      innerFlat = pair.innerFlat;
      outerFlat = pair.outerFlat;
    }
    const n = innerFlat.length / 3;
    const canSurface = n >= 2 && outerFlat && outerFlat.length >= n * 3;

    const getAngle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? function (h) { return SceneGeometry.getAngle(h, currentHeight); }
      : function () { return 0; };
    const getPos = function (h, rad) {
      const a = getAngle(h);
      return {
        x: Math.cos(a) * rad,
        y: h,
        z: Math.sin(a) * rad
      };
    };

    const nameStr = getEventSummaryText(event, start, end);
    const style = getEventNameLabelStyleFromDuration(start, end);
    /** Multi-week / month-scale titles (not week-corridor ~5–10 d): hug inside month.outer, larger type. */
    const isMonthishLongTermLabel =
      typeof daysForLabels === 'number' && !isNaN(daysForLabels) &&
      daysForLabels >= 12 && !isWeekCorridorEvent;
    /** Week-corridor ribbons: anchor labels Sun-ward so titles don’t sit under day number/name rings. */
    const ribbonLabelRadialT = isDayFrameAnnualHelixLabel
      ? 0.07
      : isWeekCorridorEvent
        ? 0.38
        : (isMonthishLongTermLabel ? 0.24 : 0.5);
    const dateShrink = 1 / (1 + Math.log(1 + Math.max(1, daysForLabels)) / Math.log(120));
    const dateFontPx = Math.max(6, Math.round((Math.max(7, style.fontPx - 10)) * dateShrink));
    const bump = earthDist * 0.004;
    const zlLabels = getZoomLevelForEvents();
    const isDailySkySteLabel = isShortEvent && isEarthDailySkyEventZoom(zlLabels);
    const circadianNearEarthNames =
      isShortEvent &&
      isCircadianHelixZoom(zlLabels) &&
      normalizedCircadianState() !== 'off' &&
      !isDailySkySteLabel;
    const circadianBillboardNames = circadianNearEarthNames || (isDailySkySteLabel && !!dailySkyFace);

    function planeDimsAtIndex(idx, fontPx, text, kind) {
      const spanHalf = Math.max(2, Math.floor((n - 1) / 5));
      const i0 = Math.max(0, idx - spanHalf);
      const i1 = Math.min(n - 1, idx + spanHalf);
      const chord = chordLenAlongInner(innerFlat, i0, i1);
      const fr = sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, ribbonLabelRadialT);
      if (!fr) return { planeW: earthDist * 0.08, planeH: earthDist * 0.045, fr: null, chord: earthDist * 0.04 };
      const band = fr.band;
      const len = text ? String(text).length : 4;
      const isEndpoint = kind === 'start' || kind === 'end';
      const longT = Math.max(0, Math.min(1, Math.log(1 + Math.max(1, daysForLabels)) / Math.log(400)));
      const kindMul = isEndpoint
        ? (0.26 + 0.2 * (1 - longT)) * (0.55 + 0.45 * Math.min(1, 5 / Math.max(3, len)))
        : 1;
      // Local +X is inner→outer (ribbon thickness). planeW must stay ≤ band or glyphs sit past the outline.
      const ribbonRadCap = band * (isEndpoint ? 0.96 : 0.91);
      const radialFromChars = len * earthDist * 0.0082 * kindMul;
      const radialFloor = isEndpoint
        ? Math.max(band * (0.36 + 0.2 * (1 - longT)), earthDist * 0.02) * kindMul
        : Math.max(band * 0.68, earthDist * 0.012);
      let planeW = Math.min(earthDist * 0.22, Math.max(radialFloor, radialFromChars));
      if (isEndpoint) planeW = Math.min(planeW, earthDist * (0.068 + 0.04 * (1 - longT)));
      planeW = Math.min(planeW, ribbonRadCap);
      let along = Math.max(earthDist * 0.036, chord * 0.32 + fontPx * earthDist * 0.0022);
      if (isEndpoint) along *= 0.52 + 0.28 * (1 - longT);
      const planeH = Math.min(earthDist * 0.16, Math.max(earthDist * 0.026, along));
      return { planeW, planeH, fr, chord };
    }

    function addSurfaceLabel(text, idx, fontPx, kind, isNameLabel) {
      if (isDayFrameAnnualHelixLabel && isShortEvent && isNameLabel && kind === 'mid' && text) {
        const fr = sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, 0.05);
        if (!fr) return null;
        const band = Math.max(fr.band, earthDist * 0.006);
        const chordMid = chordLenAlongInner(innerFlat, Math.max(0, idx - 1), Math.min(n - 1, idx + 1));
        const drawFontPx = Math.max(5, Math.min(9, Math.round(band / earthDist * 185)));
        const planeW = Math.min(band * 0.96, earthDist * 0.11);
        const planeH = Math.min(
          Math.max(earthDist * 0.0055, band * 0.36),
          Math.max(earthDist * 0.007, chordMid * 0.48)
        );
        const maxWrapPx = Math.round(Math.min(120, Math.max(36, planeW / earthDist * 95)));
        const mesh = createEventSurfaceTextMesh(
          text,
          eventHex,
          planeW,
          planeH,
          drawFontPx,
          'left',
          true,
          false,
          maxWrapPx
        );
        placeMeshOnRibbonFrame(mesh, fr, earthDist * 0.0008);
        orientDayFrameAnnualHelixLabelMesh(mesh, fr);
        attachEventLabelTiming(mesh, start, end, true);
        Object.assign(mesh.userData, {
          type: labelType,
          kind,
          labelRibbonIdx: idx,
          labelRibbonRadialT: 0.05,
          isRibbonSurfaceLabel: true,
          dayFrameAnnualHelixLabel: true,
          shortEventPickable: false
        });
        applyDailyCircadianLabelOpacity(mesh, start, end);
        return mesh;
      }
      const { planeW, planeH, fr, chord } = planeDimsAtIndex(idx, fontPx, text, kind);
      if (!fr || !text) return null;
      let drawW = planeW;
      let drawH = planeH;
      let drawFontPx = fontPx;
      let mapWideAlongRibbonTangent = false;
      let ribbonNameMaxLinePx;
      if (isNameLabel && circadianBillboardNames) {
        const band = fr.band != null && fr.band > 1e-6 ? fr.band : planeW;
        const chordLen = chord != null && chord > 1e-6 ? chord : earthDist * 0.045;
        const bandCap = Math.max(earthDist * 0.008, Math.min(band * 0.94, earthDist * 0.074));
        const alongMax = Math.max(earthDist * 0.028, Math.min(chordLen * 0.92, earthDist * 0.52));
        const fontFloor = Math.max(10, Math.round(fontPx * 0.7));
        const fontCeil = Math.min(28, Math.max(13, Math.round(fontPx * 1.12)));

        let chosenFp = fontFloor;
        let maxWrapChosen = Math.round(Math.min(520, Math.max(100, (alongMax / earthDist) * 340)));
        for (let tryFp = fontCeil; tryFp >= fontFloor; tryFp--) {
          const fpTry = Math.max(8, Math.round(tryFp));
          const maxWrapPx = Math.round(Math.min(560, Math.max(96, (alongMax / earthDist) * 320 + fpTry * 8)));
          const layoutTry = measureEventSurfaceLabelCanvasSize(text, fpTry, 14, maxWrapPx);
          const cwTry = layoutTry.cw;
          const chTry = layoutTry.ch;
          if (cwTry < 1 || chTry < 1) continue;
          const texAspectTry = cwTry / chTry;
          let acrossTry = Math.min(
            bandCap,
            Math.max(earthDist * 0.012, fpTry * earthDist * 0.00212)
          );
          let alongTry = acrossTry * texAspectTry;
          if (alongTry > alongMax) {
            alongTry = alongMax;
            acrossTry = alongTry / texAspectTry;
          }
          if (acrossTry > bandCap) {
            acrossTry = bandCap;
            alongTry = acrossTry * texAspectTry;
            if (alongTry > alongMax) {
              alongTry = alongMax;
              acrossTry = alongTry / texAspectTry;
            }
          }
          const fits =
            alongTry <= alongMax + 0.002 &&
            acrossTry <= bandCap + 0.002 &&
            (acrossTry >= earthDist * 0.009 || fpTry <= fontFloor);
          if (fits || fpTry <= fontFloor) {
            chosenFp = fpTry;
            maxWrapChosen = maxWrapPx;
            break;
          }
        }

        drawFontPx = chosenFp;
        ribbonNameMaxLinePx = maxWrapChosen;
        const layoutFinal = measureEventSurfaceLabelCanvasSize(text, drawFontPx, 14, ribbonNameMaxLinePx);
        const cwF = layoutFinal.cw;
        const chF = layoutFinal.ch;
        const texAspect = cwF > 0 && chF > 0 ? cwF / chF : 2;
        let across = Math.min(
          bandCap,
          Math.max(earthDist * 0.012, drawFontPx * earthDist * 0.00212)
        );
        let along = across * texAspect;
        if (along > alongMax) {
          along = alongMax;
          across = along / texAspect;
        }
        if (across > bandCap) {
          across = bandCap;
          along = across * texAspect;
          if (along > alongMax) {
            along = alongMax;
            across = along / texAspect;
          }
        }
        drawW = across;
        drawH = along;
      } else if (isNameLabel && !isShortEvent && kind === 'mid') {
        // Long-term name: canvas is wide×short but ribbon basis maps +X to thin radial band and +Y along span —
        // old sizing stretched one axis. Fit world plane to texture aspect; wide axis runs along tangent via UV rotation.
        if (String(text).length > 28) {
          drawFontPx = Math.min(36, Math.round(drawFontPx * 1.12));
        }
        if (isMonthishLongTermLabel) {
          drawFontPx = Math.min(44, Math.round(drawFontPx * 1.12));
        }
        const band = fr.band != null && fr.band > 1e-6 ? fr.band : planeW;
        const bandCap = Math.max(earthDist * 0.008, Math.min(band * 0.92, earthDist * 0.055));
        const alongMax = Math.max(earthDist * 0.03, planeH * 0.97);
        const wideSingleLineSpan =
          typeof daysForLabels === 'number' && !isNaN(daysForLabels) &&
          daysForLabels >= 14 && daysForLabels <= 50;
        const tryLargerFonts =
          typeof daysForLabels === 'number' && !isNaN(daysForLabels) && daysForLabels >= 12;
        const fontFloor = Math.max(8, Math.round(drawFontPx));
        const extraTry = tryLargerFonts
          ? Math.min(14, Math.round(3 + (daysForLabels - 12) / 5))
          : 0;
        const monthishFontBoost = isMonthishLongTermLabel ? 7 : 0;
        const fontCeil = Math.min(54, fontFloor + extraTry + monthishFontBoost);

        let chosenFp = fontFloor;
        let linePxChosen = undefined;
        for (let tryFp = fontCeil; tryFp >= fontFloor; tryFp--) {
          const fp = Math.max(8, Math.round(tryFp));
          const maxWrapPx = Math.round(Math.min(320, Math.max(100, 7 * fp + 24)));
          const maxSingleBeforeWrap = wideSingleLineSpan
            ? Math.round(
              Math.min(
                isMonthishLongTermLabel ? 640 : 580,
                Math.max(maxWrapPx, 16 * fp + Math.min(100, Math.max(0, daysForLabels - 14) * 2.2))
              )
            )
            : maxWrapPx;
          const singleW = measureBoldOrbitronTextWidthPx(text, fp);
          const linePx = singleW <= maxSingleBeforeWrap + 0.5 ? undefined : maxWrapPx;
          const layoutM = measureEventSurfaceLabelCanvasSize(text, fp, 14, linePx);
          const cw0 = layoutM.cw;
          const ch0 = layoutM.ch;
          if (cw0 < 1 || ch0 < 1) continue;
          const texAspect = cw0 / ch0;
          let across0 = Math.min(
            bandCap,
            Math.max(earthDist * 0.014, fp * earthDist * 0.00205)
          );
          let along0 = across0 * texAspect;
          if (along0 > alongMax) {
            along0 = alongMax;
            across0 = along0 / texAspect;
          }
          if (across0 > bandCap) {
            across0 = bandCap;
            along0 = across0 * texAspect;
          }
          const fits =
            along0 <= alongMax + 0.002 &&
            across0 <= bandCap + 0.002 &&
            (across0 >= earthDist * 0.01 || fp <= fontFloor);
          if (fits || fp <= fontFloor) {
            chosenFp = fp;
            linePxChosen = linePx;
            break;
          }
        }

        drawFontPx = chosenFp;
        ribbonNameMaxLinePx = linePxChosen;
        const { cw, ch } = measureEventSurfaceLabelCanvasSize(text, drawFontPx, 14, ribbonNameMaxLinePx);
        const texAspect = cw / ch;
        let across = Math.min(
          bandCap,
          Math.max(earthDist * 0.014, drawFontPx * earthDist * 0.00205)
        );
        let along = across * texAspect;
        if (along > alongMax) {
          along = alongMax;
          across = along / texAspect;
        }
        if (across > bandCap) {
          across = bandCap;
          along = across * texAspect;
          if (along > alongMax) {
            along = alongMax;
            across = along / texAspect;
          }
        }
        drawW = across;
        drawH = along;
        mapWideAlongRibbonTangent = true;
      }
      let meshW = drawW;
      let meshH = drawH;
      let useMapTan = mapWideAlongRibbonTangent;
      if (circadianBillboardNames) {
        useMapTan = false;
        meshW = drawH;
        meshH = drawW;
      }
      const mesh = createEventSurfaceTextMesh(
        text,
        eventHex,
        meshW,
        meshH,
        drawFontPx,
        'left',
        isNameLabel,
        useMapTan,
        ribbonNameMaxLinePx
      );
      if (isDailySkySteLabel && dailySkyFace) {
        placeDailySkySteLabelMesh(mesh, fr, dailySkyFace, start, end);
        mesh.renderOrder = Math.max(mesh.renderOrder || 0, getShortCircadianRibbonRenderOrders(0.5, zlLabels).roFill + 1);
      } else {
        placeMeshOnRibbonFrame(mesh, fr, bump);
      }
      if (circadianNearEarthNames) {
        orientCircadianShortRibbonLabelMesh(mesh, fr);
        if (typeof startHeight === 'number' && typeof endHeight === 'number') {
          mesh.position.y = (startHeight + endHeight) * 0.5;
        }
      }
      if (sy) mesh.position.y += sy;
      if (isMonthishLongTermLabel && isNameLabel && kind === 'mid' && !isShortEvent) {
        mesh.userData.monthishLabelSnap = true;
        snapMeshPositionXZRadius(mesh, getMonthOuterInnerLabelRadiusXZ(earthDist));
      }
      attachEventLabelTiming(mesh, start, end, isNameLabel);
      Object.assign(mesh.userData, {
        type: labelType,
        kind,
        labelRibbonIdx: idx,
        labelRibbonRadialT: ribbonLabelRadialT,
        isRibbonSurfaceLabel: true,
        // Wide transparent text quads must not steal clicks from neighboring
        // events; only the colored ribbon/marker geometry is pickable.
        shortEventPickable: false,
        circadianBillboardLabel: false,
        circadianShortRibbonLabel: !!circadianBillboardNames,
        dailySkySteLabelFace: isDailySkySteLabel ? dailySkyFace : null,
        immuneToFlatten: !!circadianBillboardNames
      });
      applyDailyCircadianLabelOpacity(mesh, start, end);
      return mesh;
    }

    const midLabelForInset = isShortEvent
      ? (nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end))))
      : (showName
        ? (isWeekCorridorEvent ? (nameStr || null) : (nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end))))
        : null);

    let titleAlongT =
      midTitleAlongSpan01 != null && !isNaN(midTitleAlongSpan01)
        ? Math.max(0, Math.min(1, Number(midTitleAlongSpan01)))
        : 0.5;

    function clampMidTitleAlong01ForRibbon(tRaw, numPoints, labelText, fp) {
      const t = Math.max(0, Math.min(1, tRaw));
      const maxIdx = Math.max(0, numPoints - 1);
      if (maxIdx < 1) return t;
      const len = labelText ? String(labelText).length : 0;
      const fpN = fp != null ? fp : 14;
      let marginFrac = Math.min(0.34, Math.max(0.045, 0.045 + len / 78 + fpN / 195));
      let marginIdx = Math.ceil(maxIdx * marginFrac);
      marginIdx = Math.max(1, Math.min(marginIdx, Math.floor(maxIdx / 2)));
      let idx = Math.round(t * maxIdx);
      idx = Math.min(maxIdx - marginIdx, Math.max(marginIdx, idx));
      return maxIdx > 0 ? idx / maxIdx : 0.5;
    }

    function clampMidTitleAlong01Heuristic(tRaw, labelText, fp) {
      const t = Math.max(0, Math.min(1, tRaw));
      const len = labelText ? String(labelText).length : 0;
      const fpN = fp != null ? fp : 14;
      const frac = Math.min(0.3, Math.max(0.07, 0.07 + len / 88 + fpN / 155));
      return Math.max(frac, Math.min(1 - frac, t));
    }

    function refineMidRibbonIdxToFitLabel(idx0, labelText, fp) {
      if (!canSurface || n < 2 || !labelText) return Math.min(n - 1, Math.max(0, idx0));
      const maxIdx = n - 1;
      const len = String(labelText).length;
      const fpN = fp != null ? fp : 14;
      let marginFrac = Math.min(0.34, Math.max(0.045, 0.045 + len / 78 + fpN / 195));
      let marginIdx = Math.max(1, Math.min(Math.ceil(maxIdx * marginFrac), Math.floor(maxIdx / 2)));
      let ix = Math.min(maxIdx - marginIdx, Math.max(marginIdx, idx0));
      let dims = planeDimsAtIndex(ix, fpN, labelText, 'mid');
      let halfAlong = (dims.planeH || earthDist * 0.04) * 0.58;
      for (let iter = 0; iter < n + 10; iter++) {
        const L0 = polylineArcLenInner(innerFlat, 0, ix);
        const L1 = polylineArcLenInner(innerFlat, ix, maxIdx);
        if (L0 >= halfAlong && L1 >= halfAlong) break;
        if (L0 < L1) ix++;
        else ix--;
        if (ix < marginIdx) {
          ix = marginIdx;
          break;
        }
        if (ix > maxIdx - marginIdx) {
          ix = maxIdx - marginIdx;
          break;
        }
        dims = planeDimsAtIndex(ix, fpN, labelText, 'mid');
        halfAlong = (dims.planeH || earthDist * 0.04) * 0.58;
      }
      return ix;
    }

    if (midLabelForInset && (showName || isShortEvent)) {
      titleAlongT = canSurface && n >= 2
        ? clampMidTitleAlong01ForRibbon(titleAlongT, n, midLabelForInset, style.fontPx)
        : clampMidTitleAlong01Heuristic(titleAlongT, midLabelForInset, style.fontPx);
    }

    let idxMidTitle = Math.min(n - 1, Math.max(0, Math.round((n - 1) * titleAlongT)));
    if (midLabelForInset && (showName || isShortEvent) && canSurface && n >= 2) {
      idxMidTitle = refineMidRibbonIdxToFitLabel(idxMidTitle, midLabelForInset, style.fontPx);
      titleAlongT = (n - 1) > 0 ? idxMidTitle / (n - 1) : 0.5;
    }

    if (canSurface) {
      if (isShortEvent) {
        if (!showName && !showDates) return;
        if (isDailySkySteLabel && !isSteVisibleOnDailySkyClock(start, end)) return;
        const midLabel = nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
        const idxMid = idxMidTitle;
        const m = addSurfaceLabel(midLabel, idxMid, style.fontPx, 'mid', true);
        if (m) {
          parent.add(m);
          return;
        }
      } else {
        const idxStart = 0;
        const idxEnd = n - 1;
        const idxMid = idxMidTitle;
        let s = null;
        let e = null;
        if (showEndpointDates) {
          s = addSurfaceLabel(formatMMDD(start), idxStart, dateFontPx, 'start', false);
          e = addSurfaceLabel(formatMMDD(end), idxEnd, dateFontPx, 'end', false);
        }
        let mid = null;
        if (showName) {
          const midLabel = isWeekCorridorEvent
            ? (nameStr || null)
            : (nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end)));
          if (midLabel) mid = addSurfaceLabel(midLabel, idxMid, style.fontPx, 'mid', true);
        }
        if (s) parent.add(s);
        if (e) parent.add(e);
        if (mid) parent.add(mid);
        if (s || e || mid) return;
      }
    }

    const rMidRibbon = rInner + (rOuter - rInner) * ribbonLabelRadialT + EVENT_LINE_LABEL_RADIUS_OFFSET * 0.5;
    const rMidName = !isShortEvent && isMonthishLongTermLabel
      ? getMonthOuterInnerLabelRadiusXZ(earthDist)
      : rMidRibbon;
    const midHeight = startHeight + titleAlongT * (endHeight - startHeight);
    const dayNumberScale = 1.5;
    const startEndScale = dayNumberScale * 2 * (0.42 + 0.58 * dateShrink);
    const nameScale = dayNumberScale * 3;
    if (isShortEvent) {
      if (!showName && !showDates) return;
      if (isEarthDailySkyEventZoom(getZoomLevelForEvents()) && !isSteVisibleOnDailySkyClock(start, end)) return;
      if (isDayFrameAnnualHelixLabel) return;
      const midLabel = nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
      const midPos = getPos(midHeight, rMidName);
      const midSprite = attachEventLabelTiming(
        createEventLineLabelSprite(midLabel, eventHex, midPos.x, midPos.y + sy, midPos.z, nameScale, true),
        start,
        end,
        true
      );
      Object.assign(midSprite.userData, {
        type: labelType,
        kind: 'mid',
        labelRibbonIdx: idxMidTitle,
        labelRibbonRadialT: ribbonLabelRadialT,
        labelIsName: true
      });
      applyDailyCircadianLabelOpacity(midSprite, start, end);
      clampEventNameSpriteScaleToBand(midSprite, Math.abs(rOuter - rInner), 0.88);
      parent.add(midSprite);
      return;
    }
    const midPos = getPos(midHeight, rMidName);
    if (showEndpointDates) {
      const startPos = getPos(startHeight, rMidRibbon);
      const endPos = getPos(endHeight, rMidRibbon);
      const startSprite = createEventLineLabelSprite(formatMMDD(start), eventHex, startPos.x, startPos.y + sy, startPos.z, startEndScale, false);
      Object.assign(startSprite.userData, {
        type: labelType,
        kind: 'start',
        labelRibbonIdx: 0,
        labelRibbonRadialT: ribbonLabelRadialT
      });
      parent.add(startSprite);
      const endSprite = createEventLineLabelSprite(formatMMDD(end), eventHex, endPos.x, endPos.y + sy, endPos.z, startEndScale, false);
      Object.assign(endSprite.userData, {
        type: labelType,
        kind: 'end',
        labelRibbonIdx: n - 1,
        labelRibbonRadialT: ribbonLabelRadialT
      });
      parent.add(endSprite);
    }
    if (showName) {
      const midLabel = isWeekCorridorEvent
        ? (nameStr || null)
        : (nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end)));
      if (!midLabel) return;
      const nameScaleEff = isMonthishLongTermLabel ? nameScale * 1.24 : nameScale;
      const midSprite = attachEventLabelTiming(
        createEventLineLabelSprite(midLabel, eventHex, midPos.x, midPos.y + sy, midPos.z, nameScaleEff, true),
        start,
        end,
        true
      );
      Object.assign(midSprite.userData, {
        type: labelType,
        kind: 'mid',
        labelRibbonIdx: idxMidTitle,
        labelRibbonRadialT: ribbonLabelRadialT,
        labelIsName: true
      });
      clampEventNameSpriteScaleToBand(midSprite, Math.abs(rOuter - rInner), 0.88);
      parent.add(midSprite);
    }
  }

  /**
   * Wrap a worldline mesh/line in a group if needed, attach labels on ribbon surface, preserve picking userData on the primary.
   */
  function wrapWorldlineWithLabels(primary, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, currentHeight, staggerY, innerFlat, outerFlat, midTitleAlongSpan01) {
    let parent = primary;
    if (!(primary instanceof global.THREE.Group)) {
      const wrapper = new global.THREE.Group();
      wrapper.userData = { ...userData };
      if (primary.userData && primary.userData.timelineHelixRef) {
        storeTimelineHelixRef(wrapper.userData, primary.userData.timelineHelixRef);
      }
      primary.userData = { ...userData };
      if (userData.timelineHelixRef) {
        storeTimelineHelixRef(primary.userData, userData.timelineHelixRef);
      }
      wrapper.add(primary);
      parent = wrapper;
    } else if (!primary.userData || !primary.userData.type) {
      primary.userData = { ...userData };
    } else if (userData.timelineHelixRef && !primary.userData.timelineHelixRef) {
      storeTimelineHelixRef(primary.userData, userData.timelineHelixRef);
    }
    addEventWorldlineLabelSprites(parent, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, currentHeight, staggerY, innerFlat, outerFlat, midTitleAlongSpan01);
    return parent;
  }

  /**
   * Parse hex color string to number for THREE
   * @param {string} hex - e.g. '#ff0000' or '0xff0000'
   * @returns {number}
   */
  function parseColor(hex) {
    if (typeof hex === 'number' && !isNaN(hex)) return hex;
    if (typeof hex !== 'string') return 0xffffff;
    const s = hex.replace('#', '');
    return parseInt(s.length === 6 ? s : s.slice(0, 6), 16);
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Portal/Yin: outline color from per-event provenance (native / CSV / ICS / URL / public, edited flag).
   * Returns a THREE-compatible numeric color, or null if the event has no provenance field.
   */
  function getCircaevumProvenanceOutlineHex(event) {
    if (!event || typeof event !== 'object') return null;
    const srcRaw = event.circaevumSource;
    if (srcRaw == null || String(srcRaw).trim() === '') return null;
    const src = String(srcRaw).trim();
    const edited =
      event.circaevumEdited === true ||
      event.circaevumEdited === 'true' ||
      event.circaevumEdited === 1;
    if (src === 'public_share') return parseColor('#dc2626');
    if (src === 'native') return parseColor('#9333ea');
    if (src === 'csv') return parseColor(edited ? '#22c55e' : '#2563eb');
    if (src === 'ics_url') {
      if (edited) return parseColor('#ea580c');
      return parseColor('#eab308');
    }
    if (src === 'ics_file') {
      if (edited) return parseColor('#ea580c');
      return parseColor('#14b8a6');
    }
    return null;
  }

  /**
   * Outline stroke color for duration ribbons.
   * When the event carries circaevumSource (portal), outline color follows provenance and ignores borderStyle for color.
   * @param {string} borderStyle - 'event' | 'layer' | 'none' | optional 'custom' (legacy stored styles)
   * @param {Object|null} [eventForProvenance] - VEVENT-like row (optional)
   */
  function resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, eventForProvenance) {
    const prov = eventForProvenance != null ? getCircaevumProvenanceOutlineHex(eventForProvenance) : null;
    if (prov != null) return prov;
    const bs = borderStyle || 'event';
    if (bs === 'none') return null;
    if (bs === 'custom') {
      const raw = layerConfig && layerConfig.borderColor != null ? String(layerConfig.borderColor).trim() : '';
      if (raw) return parseColor(raw);
      return layerHex;
    }
    if (bs === 'layer') return layerHex;
    return eventHex;
  }

  /** Stronger borderThickness → higher outline opacity and thicker tube stroke. */
  function getRibbonOutlineOpacity(baseOpacity, borderStyle, layerConfig) {
    const bs = borderStyle || 'event';
    if (bs === 'none') return 0;
    const rawT = layerConfig && layerConfig.borderThickness != null ? Number(layerConfig.borderThickness) : 1;
    const t = Math.max(0.3, Math.min(4, isNaN(rawT) ? 1 : rawT));
    return Math.min(1, baseOpacity * (0.82 + 0.38 * t));
  }

  function getRibbonOutlineTubeRadius(earthDist, layerConfig) {
    const ed = earthDist != null && !isNaN(earthDist) ? earthDist : EARTH_RADIUS;
    const rawT = layerConfig && layerConfig.borderThickness != null ? Number(layerConfig.borderThickness) : 1;
    const t = Math.max(0.3, Math.min(4, isNaN(rawT) ? 1 : rawT));
    return Math.max(ed * 0.001, ed * RIBBON_OUTLINE_TUBE_RADIUS_FRAC * (0.42 + 0.58 * t));
  }

  function cylinderBetweenPoints(p0, p1, radius, colorHex, opacity, renderOrder) {
    if (typeof global.MeshPrimitives !== 'undefined' && global.MeshPrimitives.cylinderBetween) {
      return global.MeshPrimitives.cylinderBetween(p0, p1, {
        THREE: global.THREE,
        radius,
        color: colorHex,
        opacity,
        renderOrder
      });
    }
    const THREE = global.THREE;
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-9) return null;
    const geom = new THREE.CylinderGeometry(radius, radius, len, 6, 1, false);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder;
    const axis = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(axis, dir.clone().normalize());
    mesh.position.copy(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5));
    return mesh;
  }

  /**
   * Thick polyline stroke along flat [x,y,z,...].
   * Prefer Line when far-LOD / low quality; Tube only when close + budget allows.
   * @param {number} [radiusScale] - multiply tube radius (e.g. short circadian arcs).
   */
  function createTubeOutlineAlongFlat(flat, colorHex, opacity, renderOrder, earthDist, layerConfig, radiusScale) {
    let r = getRibbonOutlineTubeRadius(earthDist, layerConfig);
    if (radiusScale != null && isFinite(radiusScale) && radiusScale > 0) r *= radiusScale;
    const forceLine =
      _eventOutlineLineMode ||
      (_eventTubeQualityScale < EVENT_OUTLINE_PREFER_LINE_QUALITY);

    if (typeof global.MeshPrimitives !== 'undefined' && global.MeshPrimitives.strokeAlongFlat) {
      return global.MeshPrimitives.strokeAlongFlat(flat, {
        THREE: global.THREE,
        mode: forceLine ? 'line' : 'auto',
        forceLine,
        qualityScale: _eventTubeQualityScale,
        preferLineBelow: EVENT_OUTLINE_PREFER_LINE_QUALITY,
        radius: r,
        color: colorHex,
        opacity,
        renderOrder
      });
    }

    // Fallback without MeshPrimitives
    const THREE = global.THREE;
    const nPts = flat.length / 3;
    if (nPts < 2) return null;
    if (forceLine) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: opacity,
          depthWrite: false
        })
      );
      line.renderOrder = renderOrder;
      return line;
    }
    if (nPts === 2) {
      return cylinderBetweenPoints(
        new THREE.Vector3(flat[0], flat[1], flat[2]),
        new THREE.Vector3(flat[3], flat[4], flat[5]),
        r, colorHex, opacity, renderOrder
      );
    }
    return null;
  }

  /** lineThickness scales radial span of inner/outer helix (portal “band width”). */
  function applyLayerRibbonWidthScale(rInner, rOuter, earthDist, layerConfig) {
    const rawTh = layerConfig && layerConfig.lineThickness != null ? Number(layerConfig.lineThickness) : 1;
    const th = Math.max(0.3, Math.min(4, isNaN(rawTh) ? 1 : rawTh));
    const mid = (rInner + rOuter) / 2;
    let half = Math.max(earthDist * 0.012, (rOuter - rInner) / 2);
    half *= 0.45 + 0.55 * th;
    return { rInner: mid - half, rOuter: mid + half };
  }

  function lerpHexColor(hexA, hexB, t) {
    const tt = clamp01(t);
    const ar = (hexA >> 16) & 0xff;
    const ag = (hexA >> 8) & 0xff;
    const ab = hexA & 0xff;
    const br = (hexB >> 16) & 0xff;
    const bg = (hexB >> 8) & 0xff;
    const bb = hexB & 0xff;
    const rr = Math.round(ar + (br - ar) * tt);
    const rg = Math.round(ag + (bg - ag) * tt);
    const rb = Math.round(ab + (bb - ab) * tt);
    return (rr << 16) | (rg << 8) | rb;
  }

  /** Desaturate distant events toward achromatic gray (strong contrast) while leaving a hint of hue. */
  const TEMPORAL_NEUTRAL_HEX = 0x8f8f8f;
  /** Within this window of selected or “now”, keep full chroma. */
  const TEMPORAL_VIVID_CLOSE_MS = 2.5 * 24 * 60 * 60 * 1000;
  /** Beyond this distance from both, blend down to TEMPORAL_VIVID_FLOOR. */
  const TEMPORAL_VIVID_FAR_MS = 65 * 24 * 60 * 60 * 1000;
  /** Minimum weight on the true event color when far (>0 so never fully monochrome). */
  const TEMPORAL_VIVID_FLOOR = 0.14;

  function temporalFadeSmoothstep(edge0, edge1, x) {
    if (x <= edge0) return 0;
    if (x >= edge1) return 1;
    const t = (x - edge0) / (edge1 - edge0);
    return t * t * (3 - 2 * t);
  }

  /**
   * @param {Date|null} start
   * @param {Date|null} end
   * @returns {number} midpoint ms, or start, or NaN
   */
  function getEventTemporalAnchorMs(start, end) {
    if (!start || isNaN(start.getTime())) return NaN;
    const a = start.getTime();
    if (!end || !(end > start)) return a;
    return (a + end.getTime()) / 2;
  }

  /** 1 = full vivid color; TEMPORAL_VIVID_FLOOR = most muted (vs neutral). */
  function getTemporalVividness01(anchorMs) {
    if (!isFinite(anchorMs)) return 1;
    const selFn = getSelectedDateTimeFn();
    const nowMs = Date.now();
    const dSel = selFn ? Math.abs(anchorMs - selFn().getTime()) : Infinity;
    const dNow = Math.abs(anchorMs - nowMs);
    const d = Math.min(dSel, dNow);
    const u = temporalFadeSmoothstep(TEMPORAL_VIVID_CLOSE_MS, TEMPORAL_VIVID_FAR_MS, d);
    return TEMPORAL_VIVID_FLOOR + (1 - TEMPORAL_VIVID_FLOOR) * (1 - u);
  }

  function getTemporalContextFactors(anchorMs, spanStart, spanEnd) {
    if (
      spanStart &&
      getZoomLevelForEvents() === 2 &&
      isSuperYearDurationDays(durationDaysBetween(spanStart, spanEnd))
    ) {
      return { vt: 1, vp: 1, v: 1 };
    }
    const vt = getTemporalVividness01(anchorMs);
    const vp = spanStart && !isNaN(spanStart.getTime())
      ? getPeripheralVividness01(spanStart, spanEnd)
      : 1;
    return { vt, vp, v: Math.min(vt, vp) };
  }

  /**
   * Half-width of the “in focus” time window around selected time, by zoom.
   * Matches yang/web/index.html nearbyHalfSpanMs (event list / horizon).
   */
  function getFocusHalfSpanMsForZoom(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? zl : 5;
    if (z === 7 && typeof global.MoonMechanics !== 'undefined' && typeof global.MoonMechanics.fullMoonBoundsAroundRef === 'function') {
      const fn = getSelectedDateTimeFn();
      const ref = fn ? fn() : new Date();
      const b = global.MoonMechanics.fullMoonBoundsAroundRef(ref);
      return Math.max(MS_PER_DAY, (b.t1 - b.t0) / 2);
    }
    if (z === 0) return MS_PER_HOUR / 2;
    if (z >= 9) return MS_PER_DAY;
    if (z >= 8) return 2 * MS_PER_DAY;
    if (z >= 5) return 30 * MS_PER_DAY;
    if (z >= 3) return 120 * MS_PER_DAY;
    return 365 * MS_PER_DAY;
  }

  /**
   * True when an event is far enough from SELECTED TIME (and "now") that its
   * outline should render as a cheap line instead of a tube. Distance is measured
   * against the zoom-aware in-focus half span.
   */
  function eventOutlineShouldUseLine(start, end) {
    if (!(EVENT_LINE_LOD_FAR_FACTOR > 0) || !isFinite(EVENT_LINE_LOD_FAR_FACTOR)) return false;
    const anchor = getEventTemporalAnchorMs(start, end);
    if (!isFinite(anchor)) return false;
    const selFn = getSelectedDateTimeFn();
    const selMs = selFn ? selFn().getTime() : NaN;
    const nowMs = Date.now();
    const d = Math.min(
      isFinite(selMs) ? Math.abs(anchor - selMs) : Infinity,
      Math.abs(anchor - nowMs)
    );
    const half = getFocusHalfSpanMsForZoom(getZoomLevelForEvents());
    return d > half * EVENT_LINE_LOD_FAR_FACTOR;
  }

  function getSelectedHourLocalBounds(ref) {
    if (!ref || isNaN(ref.getTime())) ref = new Date();
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ref.getHours(), 0, 0, 0);
    return { start, end: new Date(start.getTime() + MS_PER_HOUR) };
  }

  /** ms gap between event [s,e] and window [center±half]; 0 if they overlap. */
  function getPeripheralSeparationMs(spanStart, spanEnd, centerMs, halfMs) {
    if (!spanStart || isNaN(spanStart.getTime())) return 0;
    const s = spanStart.getTime();
    const e = spanEnd && !isNaN(spanEnd.getTime()) && spanEnd.getTime() > s ? spanEnd.getTime() : s;
    const w0 = centerMs - halfMs;
    const w1 = centerMs + halfMs;
    if (e < w0) return w0 - e;
    if (s > w1) return s - w1;
    return 0;
  }

  /** Local calendar year [Jan 1 .. Dec 31] for `ref` — matches Event List year / quarter zoom. */
  function getCalendarYearBoundsLocal(ref) {
    if (!ref || isNaN(ref.getTime())) ref = new Date();
    const y = ref.getFullYear();
    const start = new Date(y, 0, 1, 0, 0, 0, 0);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    return { start, end };
  }

  /** ms gap from interval [s,e] to calendar-year window; 0 if overlap. */
  function getPeripheralSeparationMsYearMode(spanStart, spanEnd, yStart, yEnd) {
    if (!spanStart || isNaN(spanStart.getTime())) return 0;
    const s = spanStart.getTime();
    const e = spanEnd && !isNaN(spanEnd.getTime()) && spanEnd.getTime() > s ? spanEnd.getTime() : s;
    const y0 = yStart.getTime();
    const y1 = yEnd.getTime();
    if (e < y0) return y0 - e;
    if (s > y1) return s - y1;
    return 0;
  }

  /**
   * Desaturate events outside the Event List time horizon (selected ± half-span, calendar year at zoom 3–4, or year ∩ half-span at zoom 5+).
   * Also dims events inside the horizon that the list hides for zoom (long spans until you zoom in).
   * Cyan ring in the Event List panel shows the same window; blue/cyan matches the timeline accent (red reads as errors).
   */
  function getPeripheralVividness01(spanStart, spanEnd) {
    const zl = getZoomLevelForEvents();
    const selFn = getSelectedDateTimeFn();
    if (!selFn) return 1;
    if (!spanStart || isNaN(spanStart.getTime())) return 1;
    const spanEndEff = spanEnd && spanEnd > spanStart ? spanEnd : new Date(spanStart.getTime() + MS_PER_DAY);
    if (zl === 2 && isSuperYearDurationDays(durationDaysBetween(spanStart, spanEndEff))) return 1;
    const ref = selFn();
    const textOk = areEventTextLabelsVisibleAtCurrentZoom(spanStart, spanEndEff) ||
      areEventNameLabelsVisibleAtCurrentZoom(spanStart, spanEndEff);
    const TEXT_OUTSIDE_LIST = 0.36;

    // Context Sphere horizon: hard cliff outside; near-edge fade so cut-off events read as truncated.
    const parent = getSelectedParentUnitBounds();
    let contextEdgeFade = 1;
    if (parent) {
      const s = spanStart.getTime();
      const e = spanEndEff.getTime();
      if (e <= parent.t0 || s >= parent.t1) return textOk ? TEXT_OUTSIDE_LIST : 0.12;
      const mid = (s + e) * 0.5;
      const half = Math.max(1, (parent.t1 - parent.t0) * 0.5);
      const center = (parent.t0 + parent.t1) * 0.5;
      const edgeDist = Math.abs(mid - center) / half; // 0 center → 1 at shell
      if (edgeDist > 0.72) {
        const t = Math.min(1, (edgeDist - 0.72) / 0.28);
        contextEdgeFade = 1 - t * 0.45;
      }
    }

    let sep = 0;
    if (zl === 0) {
      if (isCircadianShortEventsShiftPreview()) return contextEdgeFade;
      const hb = getSelectedHourLocalBounds(ref);
      sep = getPeripheralSeparationMsYearMode(spanStart, spanEndEff, hb.start, hb.end);
    } else if (zl === 3 || zl === 4) {
      const b = getCalendarYearBoundsLocal(ref);
      const halfMs = getFocusHalfSpanMsForZoom(zl);
      const centerMs = ref.getTime();
      const winStart = new Date(Math.max(b.start.getTime(), centerMs - halfMs));
      const winEnd = new Date(Math.min(b.end.getTime(), centerMs + halfMs));
      sep = getPeripheralSeparationMsYearMode(spanStart, spanEndEff, winStart, winEnd);
    } else {
      const centerMs = ref.getTime();
      const halfMs = getFocusHalfSpanMsForZoom(zl);
      const timeSep = getPeripheralSeparationMs(spanStart, spanEndEff, centerMs, halfMs);
      if (zl >= 5) {
        const b = getCalendarYearBoundsLocal(ref);
        const yearSep = getPeripheralSeparationMsYearMode(spanStart, spanEndEff, b.start, b.end);
        sep = Math.max(yearSep, timeSep);
      } else {
        sep = timeSep;
      }
    }

    if (sep <= 0) {
      const base = textOk ? 1 : TEXT_OUTSIDE_LIST;
      return base * contextEdgeFade;
    }

    let fadeMs;
    let floor;
    if (zl === 3 || zl === 4) {
      fadeMs = Math.max(20 * MS_PER_DAY, MS_PER_DAY * 45);
      floor = zl === 4 ? 0.22 : 0.28;
    } else {
      const halfMs = getFocusHalfSpanMsForZoom(zl);
      fadeMs = Math.max(halfMs * 0.24, MS_PER_DAY * 0.85);
      if (zl >= 9) floor = 0.16;
      else if (zl >= 8) floor = 0.22;
      else if (zl >= 7) floor = 0.3;
      else if (zl >= 5) floor = 0.45;
      else floor = 0.38;
    }
    const u = temporalFadeSmoothstep(0, fadeMs, sep);
    const vp = floor + (1 - floor) * (1 - u);
    return vp * contextEdgeFade;
  }

  /**
   * @param {Date|null} spanStart - event (or line) interval start; drives peripheral window test
   * @param {Date|null} spanEnd - interval end; omit or same as start for instant events
   */
  function applyTemporalVividnessToHex(hex) {
    return hex;
  }

  function applyLongTermContextColorToHex(hex, anchorMs, spanStart, spanEnd, durationDays) {
    if (durationDays >= 1 && getLongEventContextFadeMode() === 'alpha') return hex;
    return applyTemporalVividnessToHex(hex, anchorMs, spanStart, spanEnd);
  }

  function getLongTermContextFillFadeScales(anchorMs, spanStart, spanEnd, durationDays) {
    if (
      getZoomLevelForEvents() === 8 &&
      spanStart &&
      spanEnd &&
      isLongTermSpanForDailySky(spanStart, spanEnd) &&
      eventTouchesSelectedCalendarDay(spanStart, spanEnd)
    ) {
      return { innerScale: 1, outerScale: 1 };
    }
    if (durationDays < 1 || getLongEventContextFadeMode() !== 'alpha') {
      return { innerScale: 1, outerScale: 1 };
    }
    const f = getTemporalContextFactors(anchorMs, spanStart, spanEnd);
    const attenuation = Math.max(0, 1 - f.vp);
    const innerScale = Math.max(LONG_EVENT_CONTEXT_INNER_ALPHA_MIN, 1 - 0.78 * attenuation);
    const outerScale = Math.max(LONG_EVENT_CONTEXT_OUTER_ALPHA_MIN, 1 - 0.45 * attenuation);
    return { innerScale, outerScale };
  }

  // Earlier events -> warmer red, later events -> cooler blue.
  function getTimeGradientHex(normalizedTime) {
    const EARLY_RED = 0xef4444;
    const LATE_BLUE = 0x3b82f6;
    return lerpHexColor(EARLY_RED, LATE_BLUE, normalizedTime);
  }

  function hasExplicitEventColor(eventOrLine) {
    const raw = eventOrLine?.color ?? eventOrLine?.colorId ?? null;
    return raw != null && String(raw).trim() !== '';
  }

  function getTimeRange(items) {
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (let i = 0; i < items.length; i++) {
      const d = getEventStart(items[i]);
      if (!d || isNaN(d.getTime())) continue;
      const ms = d.getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
    if (!isFinite(minMs) || !isFinite(maxMs)) return null;
    return { minMs, maxMs };
  }

  /**
   * Series spines/connectors used to park short-event “prominence” in the classic month
   * annulus (~0.34W, sunward of week). That flooded the month time frame with gray lines
   * and fought the LTE day-frame nest. Disabled — keep day-frame LTE ribbons only.
   */
  const SERIES_MONTH_FRAME_DECORATION_ENABLED = false;
  /** Spine + connectors: short events spread over months (heuristic) or explicit circaevumSeriesId. */
  const SERIES_MIN_HEURISTIC_EVENTS = 4;
  const SERIES_MIN_HEURISTIC_SPAN_DAYS = 45;
  const SERIES_MAX_EVENT_HOURS = 48;
  const SERIES_MIN_EXPLICIT_EVENTS = 2;
  const SERIES_MIN_EXPLICIT_SPAN_DAYS = 14;
  /** Sun-ward centerline of the series spine; sits in month band (inside week.inner). */
  const SERIES_SPINE_RADIUS_FRAC = 0.34;

  function passesHeuristicTimeSeries(arr) {
    if (!arr || arr.length < SERIES_MIN_HEURISTIC_EVENTS) return false;
    let minT = Infinity;
    let maxT = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i];
      const s = getEventStart(ev);
      if (!s || isNaN(s.getTime())) return false;
      let e = getEventEnd(ev);
      if (!e || e <= s) e = new Date(s.getTime() + 3600000);
      if (durationHoursBetween(s, e) > SERIES_MAX_EVENT_HOURS) return false;
      minT = Math.min(minT, s.getTime());
      maxT = Math.max(maxT, e.getTime());
    }
    const spanDays = ( maxT - minT) / (24 * 60 * 60 * 1000);
    return spanDays >= SERIES_MIN_HEURISTIC_SPAN_DAYS;
  }

  function passesExplicitTimeSeries(arr) {
    if (!arr || arr.length < SERIES_MIN_EXPLICIT_EVENTS) return false;
    let minT = Infinity;
    let maxT = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i];
      const s = getEventStart(ev);
      if (!s || isNaN(s.getTime())) return false;
      let e = getEventEnd(ev);
      if (!e || e <= s) e = new Date(s.getTime() + 3600000);
      minT = Math.min(minT, s.getTime());
      maxT = Math.max(maxT, e.getTime());
    }
    const spanDays = (maxT - minT) / (24 * 60 * 60 * 1000);
    return spanDays >= SERIES_MIN_EXPLICIT_SPAN_DAYS;
  }

  /**
   * @returns {Array<Array>} list of event arrays (each is one series)
   */
  function clusterEventsIntoTimeSeries(allEvents) {
    if (!allEvents || allEvents.length < 2) return [];
    const explicit = new Map();
    const noId = [];
    for (let i = 0; i < allEvents.length; i++) {
      const ev = allEvents[i];
      const raw = ev.circaevumSeriesId != null ? String(ev.circaevumSeriesId).trim() : '';
      if (raw) {
        if (!explicit.has(raw)) explicit.set(raw, []);
        explicit.get(raw).push(ev);
      } else {
        noId.push(ev);
      }
    }
    const out = [];
    explicit.forEach((arr) => {
      if (passesExplicitTimeSeries(arr)) out.push(arr);
    });
    const byCat = new Map();
    for (let i = 0; i < noId.length; i++) {
      const ev = noId[i];
      const cat = getEventCategory(ev);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(ev);
    }
    byCat.forEach((arr) => {
      if (passesHeuristicTimeSeries(arr)) out.push(arr);
    });
    return out;
  }

  /** World position at event mid-time for connector endpoint (matches short-event placement). */
  function getSeriesEventMidAnchor(ev, earthDist, currentHeight) {
    const start = getEventStart(ev);
    if (!start || isNaN(start.getTime())) return null;
    let end = getEventEnd(ev);
    if (!end || end <= start) end = new Date(start.getTime() + 3600000);
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    if (typeof calculateDateHeight !== 'function') return null;
    const startHeight = calculateDateHeight(
      start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()
    );
    const endHeight = calculateDateHeight(
      end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()
    );
    const midHeight = (startHeight + endHeight) / 2;
    const rDot = getRadiusForDailyEventDot(earthDist, mid, 0);
    const angle = getOrbitAngleForShortEventPlacement(midHeight, currentHeight);
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D) {
      const p = SceneGeometry.getPosition3D(midHeight, angle, rDot);
      return { x: p.x, y: p.y, z: p.z };
    }
    return {
      x: Math.cos(angle) * rDot,
      y: midHeight,
      z: Math.sin(angle) * rDot
    };
  }

  /**
   * Helical arc (inner+outer edges, same radial width as short events) + connector lines to each session.
   * @returns {THREE.Group[]}
   */
  function createTimeSeriesDecorationGroups(events, layerConfig) {
    const groups = [];
    // Month-frame STE prominence scaffolding (spine @ SERIES_SPINE_RADIUS_FRAC + connectors).
    // Do not draw — LTE day-frame events stay via tryCreateDayFrameSubDayRibbon.
    if (!SERIES_MONTH_FRAME_DECORATION_ENABLED) return groups;
    if (!events || !layerConfig || typeof calculateDateHeight !== 'function') return groups;
    const seriesList = clusterEventsIntoTimeSeries(events);
    if (seriesList.length === 0) return groups;

    const earthDist = getEarthDistance();
    const currentHeight = getWorldlineOrbitReferenceHeight();
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    const rSpine = earthDist * SERIES_SPINE_RADIUS_FRAC;

    for (let s = 0; s < seriesList.length; s++) {
      const series = seriesList[s];
      const sorted = series
        .filter((ev) => getEventStart(ev))
        .sort((a, b) => getEventStart(a).getTime() - getEventStart(b).getTime());
      if (sorted.length < 2) continue;

      const first = getEventStart(sorted[0]);
      let maxEndT = -Infinity;
      for (let i = 0; i < sorted.length; i++) {
        const st = getEventStart(sorted[i]);
        let en = getEventEnd(sorted[i]);
        if (!en || en <= st) en = new Date(st.getTime() + 3600000);
        maxEndT = Math.max(maxEndT, en.getTime());
      }
      const lastEnd = new Date(maxEndT);
      const seriesMidMs = (first.getTime() + lastEnd.getTime()) / 2;
      const spineColorHex = applyTemporalVividnessToHex(layerHex, seriesMidMs, first, lastEnd);

      const startHeight = calculateDateHeight(
        first.getFullYear(), first.getMonth(), first.getDate(), first.getHours()
      );
      const endHeight = calculateDateHeight(
        lastEnd.getFullYear(), lastEnd.getMonth(), lastEnd.getDate(), lastEnd.getHours()
      );

      const segCount = Math.max(48, Math.min(160, Math.ceil(Math.abs(endHeight - startHeight) / 8)));
      const bandRef = getEventBandRadii(earthDist, 2);
      const halfBand = (bandRef.rOuter - bandRef.rInner) / 2;
      let rInnerSpine = rSpine - halfBand;
      let rOuterSpine = rSpine + halfBand;
      const ribbonSpine = applyLayerRibbonWidthScale(rInnerSpine, rOuterSpine, earthDist, layerConfig);
      rInnerSpine = ribbonSpine.rInner;
      rOuterSpine = ribbonSpine.rOuter;
      if (shouldApplyConcentricLongEventRibbonLayout()) {
        const sp = applyConcentricEventRibbonRadii(earthDist, rInnerSpine, rOuterSpine, null);
        rInnerSpine = sp.rInner;
        rOuterSpine = sp.rOuter;
      }

      const pair = buildHelixPair(startHeight, endHeight, rInnerSpine, rOuterSpine, currentHeight, segCount);
      if (!pair.innerFlat || !pair.outerFlat || pair.innerFlat.length < 6) continue;

      const root = new global.THREE.Group();
      root.userData = {
        type: 'EventSeriesDecoration',
        layerId: layerConfig.id,
      };

      const roSpine = -10;
      const spineOpacity = 0.5;
      function spineEdgeFromFlat(flat) {
        const g = new global.THREE.BufferGeometry();
        g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
        const m = new global.THREE.LineBasicMaterial({
          color: spineColorHex,
          transparent: true,
          opacity: spineOpacity,
          linewidth: 1
        });
        const ln = new global.THREE.Line(g, m);
        ln.renderOrder = roSpine;
        return ln;
      }
      root.add(spineEdgeFromFlat(pair.innerFlat));
      root.add(spineEdgeFromFlat(pair.outerFlat));
      addBandEndConnectors(root, pair.innerFlat, pair.outerFlat, spineColorHex, spineOpacity, roSpine);

      for (let i = 0; i < sorted.length; i++) {
        const anchor = getSeriesEventMidAnchor(sorted[i], earthDist, currentHeight);
        if (!anchor) continue;
        const ev = sorted[i];
        const st = getEventStart(ev);
        let en = getEventEnd(ev);
        if (!en || en <= st) en = new Date(st.getTime() + 3600000);
        const midHeight = (calculateDateHeight(st.getFullYear(), st.getMonth(), st.getDate(), st.getHours()) +
          calculateDateHeight(en.getFullYear(), en.getMonth(), en.getDate(), en.getHours())) / 2;
        const angle = getOrbitAngleForShortEventPlacement(midHeight, currentHeight);
        let sx; let sy; let sz;
        if (typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D) {
          const p = SceneGeometry.getPosition3D(midHeight, angle, rSpine);
          sx = p.x;
          sy = p.y;
          sz = p.z;
        } else {
          sx = Math.cos(angle) * rSpine;
          sy = midHeight;
          sz = Math.sin(angle) * rSpine;
        }
        const connGeo = new global.THREE.BufferGeometry();
        connGeo.setAttribute('position', new global.THREE.Float32BufferAttribute([
          sx, sy, sz,
          anchor.x, anchor.y, anchor.z
        ], 3));
        const connAnchorMs = (st.getTime() + en.getTime()) / 2;
        const connColorHex = applyTemporalVividnessToHex(layerHex, connAnchorMs, st, en);
        const connMat = new global.THREE.LineBasicMaterial({
          color: connColorHex,
          transparent: true,
          opacity: 0.32
        });
        const conn = new global.THREE.Line(connGeo, connMat);
        conn.renderOrder = -9;
        root.add(conn);
      }

      groups.push(root);
    }
    return groups;
  }

  function getNormalizedTimeForDate(date, range) {
    if (!date || isNaN(date.getTime())) return 0.5;
    if (range && isFinite(range.minMs) && isFinite(range.maxMs) && range.maxMs > range.minMs) {
      return clamp01((date.getTime() - range.minMs) / (range.maxMs - range.minMs));
    }
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    const startOfNextYear = Date.UTC(date.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0);
    return clamp01((date.getTime() - startOfYear) / Math.max(1, (startOfNextYear - startOfYear)));
  }

  /**
   * Create a single event marker (point event or start of duration event)
   * @param {Object|VEvent} event
   * @param {Object} layerConfig - { id, color, opacity }
   * @param {number} radius - Orbit radius (default Earth)
   * @returns {THREE.Mesh|null}
   */
  function createEventMarker(event, layerConfig, radius) {
    const earthDist = getEarthDistance();
    const start = getEventStart(event);
    if (!start || isNaN(start.getTime())) return null;
    let spanEnd = getEventEnd(event);
    if (!spanEnd || spanEnd <= start) spanEnd = start;
    if (shouldHideLongTermOnDailySkySte(start, spanEnd)) return null;
    if (getZoomLevelForEvents() === 8 && isLongTermSpanForDailySky(start, spanEnd)) return null;
    if (shouldHideCircadianShortEventForDayScope(start, spanEnd)) return null;
    if (!isSteVisibleOnDailySkyClock(start, spanEnd)) return null;
    // Instant / point events on the STE helix → same useless red→blue beads as disk fallback.
    if (isCircadianHelixZoom(getZoomLevelForEvents()) && shouldUseCircadianNearEarthShortPlacement()) {
      return null;
    }

    const height = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const currentHeight = getEventOrbitReferenceHeight();

    let pos = null;
    if (shouldUseCircadianNearEarthShortPlacement()) {
      const CR = global.CircadianRenderer;
      const dr = layerConfig._diskRibbon;
      const rUse = clampShortCircadianRadiusFromEarth(
        dr && dr.rMid != null
          ? dr.rMid
          : (CR && typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5)
      );
      if (CR && typeof CR.blendedDiskPointAtDate === 'function' && typeof calculateDateHeight === 'function') {
        pos = CR.blendedDiskPointAtDate(
          start,
          rUse,
          currentHeight,
          calculateDateHeight,
          getCircadianStraightenBlendForEvents()
        );
      }
    }
    if (!pos) {
      if (shouldUseDayFrameSubDayHelixPlacement()) {
        pos = getDayFrameWorldPosition(
          start,
          earthDist,
          currentHeight,
          layerConfig._overlapLane || 0,
          event
        );
      } else {
        const band = getDayNumberNameBand(earthDist);
        const r = shouldUseDayBandDotPlacement()
          ? (typeof band.sphere === 'number' ? band.sphere : earthDist * DAY_EVENT_DOT_RADIUS_FRAC)
          : (radius != null ? radius : getRadiusForTimeOfDay(start, earthDist, layerConfig._overlapLane || 0));
        const angle = getOrbitAngleForShortEventPlacement(height, currentHeight);
        pos = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
          ? SceneGeometry.getPosition3D(height, angle, r)
          : { x: Math.cos(angle) * r, y: height, z: Math.sin(angle) * r };
      }
    }

    const explicitColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    const colorBase = parseColor(explicitColor ? (event.color ?? event.colorId) : fallbackGradient);
    let colorEnd = getEventEnd(event);
    if (!colorEnd || colorEnd <= start) colorEnd = start;
    const color = applyEventDisplayColor(colorBase, start.getTime(), start, colorEnd);
    const markerR = shouldUseDayBandDotPlacement() ? 0.28 : 0.55;
    const opMul = getDailyCircadianEventOpacityMul(start, spanEnd);
    const THREE = global.THREE;
    const fillOp = Math.min(0.9, Math.max(0.16, 0.5 * opMul));
    const outlineOp = Math.min(0.95, Math.max(0.24, 0.75 * opMul));
    let diskFrame = null;
    if (shouldUseCircadianNearEarthShortPlacement()) {
      const dr = layerConfig._diskRibbon;
      const rLane = clampShortCircadianRadiusFromEarth(
        dr && dr.rMid != null
          ? dr.rMid
          : (typeof global.CircadianRenderer !== 'undefined' &&
              typeof global.CircadianRenderer.getHandLength === 'function'
            ? global.CircadianRenderer.getHandLength() * 0.88
            : 10.5)
      );
      diskFrame = sampleCircadianDiskMarkerFrame(start, rLane, currentHeight);
      if (diskFrame && diskFrame.position) {
        pos = diskFrame.position;
      }
    }
    const markerRoot = new THREE.Group();
    const amt = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
    if (amt > 0.001) {
      const focusY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
      pos = new THREE.Vector3(pos.x, flattenTimelineLogicalY(pos.y, focusY, amt), pos.z);
    }
    markerRoot.position.set(pos.x, pos.y, pos.z);
    const userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };
    if (shouldUseDayBandDotPlacement()) {
      userData.dayBandDot = true;
      userData.logicalY = pos.y;
    }
    markWorldSpaceIfNeeded(userData, start, spanEnd);
    markerRoot.userData = userData;

    const zlConn = getZoomLevelForEvents();
    const showConn = (isZoom5AndHigher(zlConn) || isCircadianHelixZoom(zlConn)) &&
      normalizedCircadianState() !== 'off' &&
      (isZoom5AndHigher(zlConn) || isDateOnSelectedCalendarDay(start));
    if (showConn) {
      const grp = new THREE.Group();
      grp.userData = userData;
      grp.add(markerRoot);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, start, color);
      markShortEventPointerPickability(grp, start, spanEnd);
      return grp;
    }
    markShortEventPointerPickability(markerRoot, start, spanEnd);
    return markerRoot;
  }

  /**
   * Create a short worldline for a duration event. Layer style: plotType (legacy), lineThickness (band width),
   * fillColor (omit to follow per-event color), borderStyle (event | layer | custom | none), borderColor (with custom),
   * borderThickness (outline emphasis).
   * @param {Object|VEvent} event
   * @param {Object} layerConfig
   * @param {number} radius
   * @returns {THREE.Object3D|null} Line, Group (tube + outline), or flattened group
   */
  function createEventWorldline(event, layerConfig, radius) {
    const earthDist = getEarthDistance();
    let start = getEventStart(event);
    let end = getEventEnd(event);
    if (!start || isNaN(start.getTime())) return null;
    if (!end || end <= start) {
      const evEnd = end && end > start ? end : start;
      if (shouldHideOutsideParentUnitWindow(start, evEnd)) return null;
      if (shouldHideLongTermOnDailySkySte(start, evEnd)) return null;
      return createEventMarker(event, layerConfig, radius);
    }
    if (shouldHideOutsideParentUnitWindow(start, end)) return null;

    // Event horizon: trim geometry to Context Sphere window so long events cut at the shell.
    let contextSphereClipped = false;
    const clamped = clampEventSpanToContextSphere(start, end);
    if (!clamped) return null;
    if (clamped.clipped) {
      start = clamped.start;
      end = clamped.end;
      contextSphereClipped = true;
    }
    _eventOutlineLineMode = eventOutlineShouldUseLine(start, end);

    const midTitleAlong01 =
      layerConfig && layerConfig._midTitleAlongSpan != null && !isNaN(layerConfig._midTitleAlongSpan)
        ? Math.max(0, Math.min(1, Number(layerConfig._midTitleAlongSpan)))
        : 0.5;

    const refSelected = getEventOrbitReferenceHeight();
    const refWorldline = getWorldlineOrbitReferenceHeight();
    const startHeight = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const endHeight = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours())
      : startHeight;

    const durationH = durationHoursBetween(start, end);
    // Nesting resolver: STE nest inside Selected Time Frame; else LTE manifold (multi-day always LTE).
    const isShortSpan = isSteStyleDailySpan(start, end);
    let drawCircadianSte = false;
    let drawAnnualSte = false;
    if (isShortSpan) {
      drawCircadianSte = shouldDrawCircadianSteGeometry(start, end);
      drawAnnualSte = shouldDrawAnnualDayFrameSteGeometry(start, end);
    }
    if (isShortSpan && (drawCircadianSte || drawAnnualSte)) {
      const anchorMsShort = getEventTemporalAnchorMs(start, end);
      const zl = getZoomLevelForEvents();
      const straightenBlend = getCircadianStraightenBlendForEvents();
      const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
      const canStackRibbon =
        isCircadianHelixZoom(zl) &&
        CR &&
        typeof CR.buildDiskRibbonBetween === 'function' &&
        typeof calculateDateHeight === 'function';

      const eventColorRaw = event.color ?? event.colorId ?? null;
      const explicitEventColor = hasExplicitEventColor(event);
      const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
      let eventHex = parseColor(explicitEventColor ? eventColorRaw : fallbackGradient);
      eventHex = applyEventDisplayColor(eventHex, anchorMsShort, start, end);
      const layerHex = parseColor(layerConfig.color || '#00b4d8');
      const userData = {
        vevent: event,
        layerId: layerConfig.id,
        type: 'EventObject',
        eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null,
        contextSphereClipped: !!contextSphereClipped
      };
      markWorldSpaceIfNeeded(userData, start, end);

      if (canStackRibbon && drawCircadianSte) {
        const segments = Math.max(8, Math.min(48, Math.ceil(durationH * 4)));
        const dr = layerConfig._diskRibbon;
        let rIn;
        let rOut;
        if (dr && dr.rIn != null && dr.rOut != null && dr.rOut > dr.rIn) {
          const clamped = clampShortCircadianDiskRibbon(dr);
          rIn = clamped.rIn;
          rOut = clamped.rOut;
        } else {
          const hl = typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
          const halfRadial = getShortCircadianRadialHalfWidth(hl, zl);
          const minR = getShortCircadianMinRadiusFromEarthCenter();
          const minSpan = getShortCircadianMinRibbonRadialSpan(hl, zl);
          rIn = Math.max(hl * 0.72, hl - halfRadial, minR);
          rOut = Math.max(hl + halfRadial, rIn + minSpan);
        }
        let ribbonPair = CR.buildDiskRibbonBetween(
          start,
          end,
          rIn,
          rOut,
          refSelected,
          calculateDateHeight,
          segments,
          straightenBlend
        );
        if (
          (!ribbonPair || !ribbonPair.innerFlat || ribbonPair.innerFlat.length < 6) &&
          typeof CR.blendedDiskPointAtDate === 'function'
        ) {
          const rMidFb = (rIn + rOut) * 0.5;
          const p0 = CR.blendedDiskPointAtDate(start, rMidFb, refSelected, calculateDateHeight, 0);
          const p1 = CR.blendedDiskPointAtDate(end, rMidFb, refSelected, calculateDateHeight, 0);
          if (p0 && p1) {
            ribbonPair = {
              innerFlat: [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z],
              outerFlat: [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z]
            };
          }
        }
        if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat && ribbonPair.innerFlat.length >= 6) {
          const durationDays = Math.max(durationH / 24, 1 / 24);
          const plotType = resolveEventPlotType(start, end, layerConfig);
          const dailyMul = getDailyCircadianEventOpacityMul(start, end);
          const opacity = Math.min(1,
            (layerConfig.opacity != null ? layerConfig.opacity : 0.78) *
              getDurationOpacityScale(durationDays) * dailyMul);
          const roOrders = getShortCircadianRibbonRenderOrders(durationDays, zl);
          const roFill = roOrders.roFill;
          const roLine = roOrders.roLine;
          const fillOpacity = Math.min(0.98,
            opacity * getDurationFillOpacityFactor(durationDays) * getShortTermEventFillOpacityMul() *
              (isCircadianShortEventsShiftPreview() && !eventTouchesSelectedCalendarDay(start, end) ? 1.12 : 1));
          let fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
          fillHex = applyEventDisplayColor(fillHex, anchorMsShort, start, end);
          const borderStyle = layerConfig.borderStyle || 'event';
          let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
          if (outlineColorHex != null) {
            outlineColorHex = applyEventDisplayColor(outlineColorHex, anchorMsShort, start, end);
          }
          let outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);
          outlineOp *= 0.74 * getShortCircadianOutlineOpacityMul(zl) *
            getShiftPreviewSteOutlineMul(start, end);

          const innerFlat = ribbonPair.innerFlat;
          const outerFlat = ribbonPair.outerFlat;
          const circTubeMul = getShortCircadianRibbonTubeScale();

          function lineFromFlatShort(flat, hex, op, renderOrder, lineWidth, arcEdge) {
            const lw = lineWidth != null ? lineWidth : 1;
            const geometry = new global.THREE.BufferGeometry();
            geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
            const material = new global.THREE.LineBasicMaterial({
              color: hex,
              ...getShortCircadianLineMaterialOpts(op, start, end),
              linewidth: lw
            });
            const lineObj = new global.THREE.Line(geometry, material);
            lineObj.renderOrder = renderOrder != null ? renderOrder : SHORT_CIRCADIAN_LINE_RENDER_ORDER;
            lineObj.userData = { type: 'EventRibbonArc', arcEdge: arcEdge || 'inner' };
            return lineObj;
          }

          const group = new global.THREE.Group();
          group.userData = userData;

          if (plotType === 'lines') {
            const lineOp = resolveShortCircadianLineOpacity(opacity, start, end);
            group.add(lineFromFlatShort(innerFlat, eventHex, lineOp, roLine, 1, 'inner'));
            group.add(lineFromFlatShort(outerFlat, eventHex, lineOp, roLine, 1, 'outer'));
            addBandEndConnectors(group, innerFlat, outerFlat, eventHex, lineOp, roLine);
          } else if (plotType === 'polygon3d' || plotType === 'polygon2d') {
            const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
            if (ribbonGeo) {
              const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays);
              puffShortCircadianRibbonFillForDailySky(fillMesh, zl);
              group.add(fillMesh);
              if (borderStyle !== 'none' && outlineColorHex != null) {
                const tubeR = getRibbonOutlineTubeRadius(earthDist, layerConfig) * circTubeMul;
                const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig, circTubeMul);
                const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig, circTubeMul);
                if (oIn) group.add(oIn);
                if (oOut) group.add(oOut);
                addBandEndConnectors(group, innerFlat, outerFlat, outlineColorHex, outlineOp, roLine, tubeR);
              }
            }
          } else {
            const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
            if (ribbonGeo) {
              const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, 'polygon3d', roFill, durationDays);
              puffShortCircadianRibbonFillForDailySky(fillMesh, zl);
              group.add(fillMesh);
              if (borderStyle !== 'none' && outlineColorHex != null) {
                const tubeR = getRibbonOutlineTubeRadius(earthDist, layerConfig) * circTubeMul;
                const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig, circTubeMul);
                const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig, circTubeMul);
                if (oIn) group.add(oIn);
                if (oOut) group.add(oOut);
                addBandEndConnectors(group, innerFlat, outerFlat, outlineColorHex, outlineOp, roLine, tubeR);
              }
            }
          }

          if (group.children.length > 0) {
            const bdHelix = getEventBandRadii(earthDist, durationDays);
            const showLabels = !isCircadianShortEventsShiftPreview() && (
              areEventTextLabelsVisibleAtCurrentZoom(start, end) ||
              areEventNameLabelsVisibleAtCurrentZoom(start, end)
            );
            const circadianRoot = finishDailySkySteRibbonRoot(group, zl, {
              diskRibbon: layerConfig._diskRibbon,
              start,
              end,
              event,
              startHeight,
              endHeight,
              rInner: bdHelix.rInner,
              rOuter: bdHelix.rOuter,
              eventHex,
              currentHeight: refSelected,
              innerFlat,
              outerFlat,
              midTitleAlong01,
              showLabels
            });
            return maybeAppendAnnualDayFrameSte(circadianRoot, {
              start,
              end,
              startHeight,
              endHeight,
              layerConfig,
              earthDist,
              refSelected,
              eventHex,
              explicitColor: explicitEventColor,
              fallbackGradient,
              anchorMs: anchorMsShort,
              durationH,
              userDataBase: userData,
              midTitleAlong01,
              labelEvent: event
            }, userData, start, end);
          }
        }
      }

      if (drawAnnualSte) {
        const dayFrameGrp = tryCreateDayFrameSubDayRibbon({
          start,
          end,
          startHeight,
          endHeight,
          layerConfig,
          earthDist,
          refSelected,
          eventHex,
          explicitColor: explicitEventColor,
          fallbackGradient,
          anchorMs: anchorMsShort,
          durationH,
          userDataBase: userData,
          midTitleAlong01,
          labelEvent: event
        });
        if (dayFrameGrp) return dayFrameGrp;
      }

      if (drawCircadianSte && shouldRenderDailySkySteDiskFallbackMarker(start, end)) {
      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const getPos = function (h, rad) {
        const a = getOrbitAngleForShortEventPlacement(h, refSelected);
        return { x: Math.cos(a) * rad, y: h, z: Math.sin(a) * rad };
      };
      const midHeight = (startHeight + endHeight) / 2;
      let pos = null;
      if (shouldUseCircadianNearEarthShortPlacement()) {
        const dr = layerConfig._diskRibbon;
        pos = getShortEventCircadianNearEarthPosition(
          start,
          end,
          refSelected,
          dr && dr.rMid != null ? dr.rMid : null
        );
      }
      if (!pos) {
        if (shouldUseDayFrameSubDayHelixPlacement()) {
          pos = getDayFrameWorldPosition(
            midDate,
            earthDist,
            refSelected,
            layerConfig._overlapLane || 0,
            event
          );
        } else {
          const rDot = getRadiusForDailyEventDot(earthDist, midDate, layerConfig._overlapLane || 0);
          pos = getPos(midHeight, rDot);
        }
      }
      let markerSize = Math.max(0.22, Math.min(0.5, 0.22 + 0.28 * Math.min(1, durationH / 24)));
      if (isEarthDailySkyEventZoom(zl)) {
        markerSize = Math.max(0.4, markerSize * 1.4);
      }
      let diskFrameDot = null;
      if (shouldUseCircadianNearEarthShortPlacement()) {
        const drDot = layerConfig._diskRibbon;
        const rLaneDot = clampShortCircadianRadiusFromEarth(
          drDot && drDot.rMid != null
            ? drDot.rMid
            : (typeof global.CircadianRenderer !== 'undefined' &&
                typeof global.CircadianRenderer.getHandLength === 'function'
              ? global.CircadianRenderer.getHandLength() * 0.88
              : 10.5)
        );
        diskFrameDot = sampleCircadianDiskMarkerFrame(midDate, rLaneDot, refSelected);
        if (diskFrameDot && diskFrameDot.position) pos = diskFrameDot.position;
      }
      const marker = createEventLinePointMarker(
        pos.x, pos.y, pos.z, eventHex, markerSize, userData, start, end, diskFrameDot
      );
      const grp = new global.THREE.Group();
      grp.userData = userData;
      grp.add(marker);
      const bdDot = getEventBandRadii(earthDist, Math.max(durationH / 24, 1e-3));
      addEventWorldlineLabelSprites(grp, event, start, end, startHeight, endHeight, bdDot.rInner, bdDot.rOuter, eventHex, refSelected, 0, undefined, undefined, midTitleAlong01);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, midDate, eventHex);
      markWorldSpaceIfNeeded(grp.userData, start, end);
      markCircadianShortScrubRoot(grp, layerConfig._diskRibbon, false);
      markShortEventPointerPickability(grp, start, end);
      return grp;
      }
      // STE attempted but no geometry — fall through to large LTE manifold.
    }

    if (shouldHideLongTermOnDailySkySte(start, end)) return null;
    if (shouldHideCircadianEventOutsideSelectedDayAtClockZooms(start, end)) return null;

    // Sub-day / all-day on annual helix: calendar-day pitch (midnight→next), not week-corridor
    // radial stretch from getEventBandRadii (that path is for multi-day LTE only).
    if (isSteStyleDailySpan(start, end) && shouldRenderDayFrameSubDayOnAnnualHelix()) {
      const anchorMsDay = getEventTemporalAnchorMs(start, end);
      const eventColorRawDay = event.color ?? event.colorId ?? null;
      const explicitDay = hasExplicitEventColor(event);
      const fallbackDay = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
      let eventHexDay = parseColor(explicitDay ? eventColorRawDay : fallbackDay);
      eventHexDay = applyEventDisplayColor(eventHexDay, anchorMsDay, start, end);
      const dayFrameLte = tryCreateDayFrameSubDayRibbon({
        start,
        end,
        startHeight,
        endHeight,
        layerConfig,
        earthDist,
        refSelected,
        eventHex: eventHexDay,
        explicitColor: explicitDay,
        fallbackGradient: fallbackDay,
        anchorMs: anchorMsDay,
        durationH,
        userDataBase: {
          vevent: event,
          layerId: layerConfig.id,
          type: 'EventObject',
          eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
        },
        midTitleAlong01,
        labelEvent: event
      });
      if (dayFrameLte) return dayFrameLte;
    }

    const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    const band = radius != null && !isNaN(radius)
      ? { rInner: Math.max(earthDist * 0.2, radius * 0.92), rOuter: Math.min(earthDist * 0.8, radius * 1.08) }
      : getEventBandRadii(earthDist, durationDays);
    let { rInner, rOuter } = band;
    if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;
    const ribbonScaled = applyLayerRibbonWidthScale(rInner, rOuter, earthDist, layerConfig);
    rInner = ribbonScaled.rInner;
    rOuter = ribbonScaled.rOuter;
    if (shouldApplyConcentricLongEventRibbonLayout() && !eventBandUsesWeekCorridor(durationDays)) {
      const rank01 = layerConfig._durationRank01 != null ? layerConfig._durationRank01 : null;
      const conc = applyConcentricEventRibbonRadii(earthDist, rInner, rOuter, rank01);
      rInner = conc.rInner;
      rOuter = conc.rOuter;
    }
    if (layerConfig._overlapLane > 0) {
      const nudged = applyOverlapLaneRadialNudge(
        earthDist,
        rInner,
        rOuter,
        layerConfig._overlapLane,
        layerConfig._overlapPeak
      );
      rInner = nudged.rInner;
      rOuter = nudged.rOuter;
    }

    const segments = 32;
    const { innerFlat, outerFlat } = buildHelixPair(startHeight, endHeight, rInner, rOuter, refWorldline, segments);
    const staggerLogical = getEventBandVerticalStagger(durationDays);
    const hasRibbon = innerFlat.length >= 6 && innerFlat.length === outerFlat.length;
    const helixRef = {
      startHeight,
      endHeight,
      rInner,
      rOuter,
      refWorldline,
      segments
    };

    const plotType = resolveEventPlotType(start, end, layerConfig);
    const opacity = Math.min(1,
      (layerConfig.opacity != null ? layerConfig.opacity : 0.7) * getDurationOpacityScale(durationDays));
    const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
    const roFill = -4 + roBoost;
    const roLine = -2 + roBoost;
    const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));
    const anchorMsLong = getEventTemporalAnchorMs(start, end);
    const eventColorRaw = event.color ?? event.colorId ?? null;
    const explicitEventColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    let eventHex = parseColor(explicitEventColor ? eventColorRaw : fallbackGradient);
    eventHex = applyEventDisplayColor(eventHex, anchorMsLong, start, end, durationDays);
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    // Prefer explicit fillColor, then per-event color, then layer color.
    let fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
    fillHex = applyEventDisplayColor(fillHex, anchorMsLong, start, end, durationDays);
    const borderStyle = layerConfig.borderStyle || 'event';
    let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
    if (outlineColorHex != null) {
      outlineColorHex = applyEventDisplayColor(outlineColorHex, anchorMsLong, start, end, durationDays);
    }
    const outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);
    const fillFade = getLongTermContextFillFadeScales(anchorMsLong, start, end, durationDays);

    const userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null,
      contextSphereClipped: !!contextSphereClipped
    };
    markWorldSpaceIfNeeded(userData, start, end);
    storeTimelineHelixRef(userData, helixRef);

    if (isSuperYearDurationDays(durationDays)) {
      return createSuperYearCylinderRoot({
        durationDays,
        start,
        end,
        startHeight,
        endHeight,
        earthDist,
        layerConfig,
        event,
        userData,
        eventHex,
        fillHex,
        fillOpacity,
        outlineColorHex,
        outlineOp,
        borderStyle,
        roFill,
        roLine,
        midTitleAlong01,
        refWorldline
      });
    }

    function lineFromFlat(flat, hex, op, renderOrder, lineWidth, arcEdge) {
      const lw = lineWidth != null ? lineWidth : 1;
      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: hex,
        transparent: true,
        opacity: op,
        linewidth: lw
      });
      const lineObj = new global.THREE.Line(geometry, material);
      lineObj.renderOrder = renderOrder != null ? renderOrder : roLine;
      lineObj.userData = { type: 'EventRibbonArc', arcEdge: arcEdge || 'inner' };
      return lineObj;
    }

    if (plotType === 'lines' && hasRibbon) {
      const group = new global.THREE.Group();
      group.userData = userData;
      group.add(lineFromFlat(innerFlat, eventHex, opacity, roLine, 1, 'inner'));
      group.add(lineFromFlat(outerFlat, eventHex, opacity, roLine, 1, 'outer'));
      addBandEndConnectors(group, innerFlat, outerFlat, eventHex, opacity, roLine);
      return attachEventStaggerRoot(
        wrapWorldlineWithLabels(group, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, refWorldline, 0, innerFlat, outerFlat, midTitleAlong01),
        staggerLogical);
    }

    if ((plotType === 'polygon3d' || plotType === 'polygon2d') && hasRibbon) {
      const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
      if (ribbonGeo) {
        const group = new global.THREE.Group();
        group.userData = userData;
        const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, fillFade);
        group.add(fillMesh);
        if (borderStyle !== 'none' && outlineColorHex != null) {
          const tubeR = getRibbonOutlineTubeRadius(earthDist, layerConfig);
          const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig);
          const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig);
          if (oIn) {
            if (!oIn.userData) oIn.userData = {};
            oIn.userData.eventRibbonTube = 'inner';
            group.add(oIn);
          }
          if (oOut) {
            if (!oOut.userData) oOut.userData = {};
            oOut.userData.eventRibbonTube = 'outer';
            group.add(oOut);
          }
          addBandEndConnectors(group, innerFlat, outerFlat, outlineColorHex, outlineOp, roLine, tubeR);
          userData._ribbonOutlineCtx = {
            earthDist,
            layerConfig,
            outlineColorHex,
            outlineOp,
            roLine,
            radiusScale: null
          };
        }
        return attachEventStaggerRoot(
          wrapWorldlineWithLabels(group, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, refWorldline, 0, innerFlat, outerFlat, midTitleAlong01),
          staggerLogical);
      }
    }

    const rMid = (rInner + rOuter) * 0.5;
    let points;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rMid, refWorldline, 32);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(startHeight, refWorldline)
        : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(endHeight, refWorldline)
        : angle0;
      const p0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, rMid)
        : { x: Math.cos(angle0) * rMid, y: startHeight, z: Math.sin(angle0) * rMid };
      const p1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, rMid)
        : { x: Math.cos(angle1) * rMid, y: endHeight, z: Math.sin(angle1) * rMid };
      points = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
    }
    let fallbackOutlineHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
    if (fallbackOutlineHex != null) fallbackOutlineHex = applyLongTermContextColorToHex(fallbackOutlineHex, anchorMsLong, start, end, durationDays);
    const useOutline = borderStyle !== 'none' && fallbackOutlineHex != null;
    const strokeHex = useOutline ? fallbackOutlineHex : eventHex;
    const strokeOp = useOutline ? getRibbonOutlineOpacity(opacity, borderStyle, layerConfig) : opacity;
    let strokeObj = null;
    if (useOutline) {
      strokeObj = createTubeOutlineAlongFlat(points, strokeHex, strokeOp, roLine, earthDist, layerConfig);
      if (strokeObj) {
        if (!strokeObj.userData) strokeObj.userData = {};
        strokeObj.userData.eventRibbonTube = 'mid';
      }
      userData._ribbonOutlineCtx = {
        earthDist,
        layerConfig,
        outlineColorHex: strokeHex,
        outlineOp: strokeOp,
        roLine,
        radiusScale: null
      };
    }
    if (!strokeObj) {
      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: strokeHex,
        transparent: true,
        opacity: strokeOp,
        linewidth: 1
      });
      strokeObj = new global.THREE.Line(geometry, material);
      strokeObj.renderOrder = roLine;
    }
    strokeObj.userData = userData;
    return attachEventStaggerRoot(
      wrapWorldlineWithLabels(strokeObj, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, refWorldline, 0, null, null, midTitleAlong01),
      staggerLogical);
  }

  /**
   * Create line segments from raw { start, end, label?, color? }. Used by addEventLines API.
   * Radius is between Earth worldline and day-name boundary (55/64 of earth distance).
   * Labels: event name at midsection, MM/DD at start and end; same color as the line.
   * @param {Array<{ start: Date|string, end: Date|string, label?: string, color?: string|number }>} lines
   * @param {Object} layerConfig - Layer config (id, color, opacity, ...)
   * @param {THREE.Group|null} sceneContentGroup - Group to add lines to (usually flattenableGroup)
   * @param {number} radiusOverride - Optional; if not set, uses radius between worldline and day-name boundary
   * @param {THREE.Group|null} worldSpaceGroup - When set (scene root), short circadian lines attach here if userData.circadianWorldSpaceLayer
   * @returns {Array<THREE.Object3D>} Created line and label objects (EventLine + sprites)
   */
  function createEventLineObjects(lines, layerConfig, sceneContentGroup, radiusOverride, worldSpaceGroup) {
    const lineTimeRange = getTimeRange(lines);
    const earthDist = typeof radiusOverride === 'number' && !isNaN(radiusOverride)
      ? radiusOverride
      : getEarthDistance();
    const objects = [];
    if (!lines || !Array.isArray(lines) || !layerConfig) return objects;
    _eventTubeQualityScale = computeEventTubeQualityScale(lines.length);
    _eventOutlineLineMode = false;
    const group = sceneContentGroup || null;
    const worldGroup = worldSpaceGroup || null;
    const lineZl = getZoomLevelForEvents();
    const lineDurationRanks = buildDurationRankMapForLines(lines);
    const titleAlongByLineIdx = computeTitleAlongForLayerLines(lines);
    const lineOverlapLayout = buildTemporalOverlapLayoutForLines(lines);
    const lineDiskRibbonByIdx = shouldAssignCircadianDiskLanes(lines)
      ? buildCircadianDiskRibbonForLineIntervals(lines, lineOverlapLayout)
      : null;

    function addToFlattenOrWorld(root) {
      if (!root) return;
      const p = resolveEventObjectParent(root, group, worldGroup);
      if (p) p.add(root);
    }

    const refSelected = getEventOrbitReferenceHeight();
    const refWorldline = getWorldlineOrbitReferenceHeight();

    const getAngle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? function (h) { return SceneGeometry.getAngle(h, refWorldline); }
      : function () { return 0; };
    const getPos = function (h, rad) {
      const a = getAngle(h);
      return {
        x: Math.cos(a) * rad,
        y: h,
        z: Math.sin(a) * rad
      };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let start = line.start instanceof Date ? line.start : new Date(line.start);
      let end = line.end instanceof Date ? line.end : new Date(line.end);
      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime()) || end <= start) continue;
      if (shouldHideOutsideParentUnitWindow(start, end)) continue;
      let contextSphereClipped = false;
      const clampedLine = clampEventSpanToContextSphere(start, end);
      if (!clampedLine) continue;
      if (clampedLine.clipped) {
        start = clampedLine.start;
        end = clampedLine.end;
        contextSphereClipped = true;
      }
      // Same far/density LOD as createEventWorldline — line-objects path used to force tubes always.
      _eventOutlineLineMode = eventOutlineShouldUseLine(start, end);

      const startHeight = typeof calculateDateHeight === 'function'
        ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
        : 0;
      const endHeight = typeof calculateDateHeight === 'function'
        ? calculateDateHeight(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours())
        : startHeight;

      const durationMs = end.getTime() - start.getTime();
      const durationDays = durationMs / (24 * 60 * 60 * 1000);
      const durationH = durationHoursBetween(start, end);
      const isShortEvent = isSteStyleDailySpan(start, end);

      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const anchorMs = midDate.getTime();
      const rShort = getRadiusForDailyEventDot(earthDist, midDate, lineOverlapLayout.byIndex.get(i) || 0);

      const lineHasExplicitColor = hasExplicitEventColor(line);
      const lineGradient = getTimeGradientHex(getNormalizedTimeForDate(start, lineTimeRange));
      let colorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      colorHex = applyEventDisplayColor(colorHex, anchorMs, start, end, durationDays);
      const midHeight = (startHeight + endHeight) / 2;

      const byCategory = layerConfig.layerStylesByCategory || {};
      const firstStyle = Object.keys(byCategory).length > 0 ? byCategory[Object.keys(byCategory)[0]] : {};
      const lineStyle = (line.category && byCategory[line.category]) ? byCategory[line.category] : firstStyle;
      const lineDiskRibbon = lineDiskRibbonByIdx ? lineDiskRibbonByIdx.get(i) : null;
      const outlineLayerCfg = {
        ...layerConfig,
        ...lineStyle,
        _overlapLane: lineOverlapLayout.byIndex.get(i) || 0,
        _overlapPeak: lineOverlapLayout.peakAll || 1,
        ...(lineDiskRibbon ? { _diskRibbon: lineDiskRibbon } : {})
      };

      let drawCircadianLine = false;
      let drawAnnualLine = false;
      if (isShortEvent) {
        drawCircadianLine = shouldDrawCircadianSteGeometry(start, end);
        drawAnnualLine = shouldDrawAnnualDayFrameSteGeometry(start, end);
      } else if (!shouldDrawDailySkySteGeometry(start, end) &&
          !shouldDrawAnnualDayFrameSteGeometry(start, end)) {
        continue;
      }

      if (isShortEvent && (drawCircadianLine || drawAnnualLine)) {
        const zl = getZoomLevelForEvents();
        const circ = normalizedCircadianState();
        const straightenBlendLines = getCircadianStraightenBlendForEvents();
        const useHelixRibbon =
          isCircadianHelixZoom(zl) &&
          circ !== 'off' &&
          typeof global.CircadianRenderer !== 'undefined' &&
          typeof global.CircadianRenderer.buildHelixRibbonBetween === 'function' &&
          typeof calculateDateHeight === 'function';

        const getPosShort = function (h, rad) {
          const a = getOrbitAngleForShortEventPlacement(h, refSelected);
          return {
            x: Math.cos(a) * rad,
            y: h,
            z: Math.sin(a) * rad
          };
        };

        const lineUserDataPre = {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i
        };
        markWorldSpaceIfNeeded(lineUserDataPre, start, end);

        if (useHelixRibbon && drawCircadianLine) {
          const segments = Math.max(8, Math.min(48, Math.ceil(durationH * 4)));
          const CR = global.CircadianRenderer;
          let ribbonPair = null;
          if (lineDiskRibbon && CR && typeof CR.buildDiskRibbonBetween === 'function') {
            ribbonPair = CR.buildDiskRibbonBetween(
              start,
              end,
              lineDiskRibbon.rIn,
              lineDiskRibbon.rOut,
              refSelected,
              calculateDateHeight,
              segments,
              straightenBlendLines
            );
          }
          if (
            (!ribbonPair || !ribbonPair.innerFlat || ribbonPair.innerFlat.length < 6) &&
            CR &&
            typeof CR.buildHelixRibbonBetween === 'function'
          ) {
            ribbonPair = CR.buildHelixRibbonBetween(
              start,
              end,
              refSelected,
              calculateDateHeight,
              segments,
              straightenBlendLines
            );
          }
          if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat && ribbonPair.innerFlat.length >= 6) {
            const durationDaysSmall = Math.max(durationH / 24, 1 / 24);
            const plotType = resolveEventPlotType(start, end, lineStyle, layerConfig, firstStyle);
            const dailyMulLines = getDailyCircadianEventOpacityMul(start, end);
            const opacity = Math.min(1,
              ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.78) *
                getDurationOpacityScale(durationDaysSmall) * dailyMulLines);
            const roBoost = getDurationRibbonRenderOrderBoost(durationDaysSmall);
            const roFill = -4 + roBoost;
            const roLine = -2 + roBoost;
            const fillOpacity = Math.min(0.98,
              opacity * getDurationFillOpacityFactor(durationDaysSmall) * getShortTermEventFillOpacityMul() *
                (isCircadianShortEventsShiftPreview() && !eventTouchesSelectedCalendarDay(start, end) ? 1.12 : 1));
            const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
            let eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
            eventColorHex = applyTemporalVividnessToHex(eventColorHex, anchorMs, start, end);
            const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
            let fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
            fillHex = applyTemporalVividnessToHex(fillHex, anchorMs, start, end);
            const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';
            let outlineColorHexEvt = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
            if (outlineColorHexEvt != null) outlineColorHexEvt = applyTemporalVividnessToHex(outlineColorHexEvt, anchorMs, start, end);
            let outlineOpEvt = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
            outlineOpEvt *= 0.74 * getShiftPreviewSteOutlineMul(start, end);
            const innerFlat = ribbonPair.innerFlat;
            const outerFlat = ribbonPair.outerFlat;
            const circTubeMulLines = getShortCircadianRibbonTubeScale();

            function evtShortLineFromFlat(flat, hex, op, lw, arcEdge) {
              const g = new global.THREE.BufferGeometry();
              g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
              const m = new global.THREE.LineBasicMaterial({
                color: hex,
                ...getShortCircadianLineMaterialOpts(
                  borderStyle === 'none' ? 0 : op,
                  start,
                  end
                ),
                linewidth: lw != null ? lw : 1
              });
              const lo = new global.THREE.Line(g, m);
              lo.renderOrder = roLine;
              lo.userData = { type: 'EventRibbonArc', arcEdge: arcEdge || 'inner' };
              return lo;
            }

            const lineUserData = {
              layerId: layerConfig.id,
              type: 'EventLine',
              start,
              end,
              label: line.label || null,
              index: i,
              contextSphereClipped: !!contextSphereClipped
            };
            markWorldSpaceIfNeeded(lineUserData, start, end);
            const lineRoot = new global.THREE.Group();
            lineRoot.userData = { ...lineUserData };

            if (plotType === 'lines') {
              const shortLineOp = resolveShortCircadianLineOpacity(opacity, start, end);
              lineRoot.add(evtShortLineFromFlat(innerFlat, eventColorHex, shortLineOp, 1, 'inner'));
              lineRoot.add(evtShortLineFromFlat(outerFlat, eventColorHex, shortLineOp, 1, 'outer'));
              addBandEndConnectors(lineRoot, innerFlat, outerFlat, eventColorHex, shortLineOp, roLine,
                getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg) * circTubeMulLines);
            } else if (plotType === 'polygon3d' || plotType === 'polygon2d') {
              const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
              if (ribbonGeo) {
                const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDaysSmall);
                lineRoot.add(fillMesh);
                if (borderStyle !== 'none' && outlineColorHexEvt != null) {
                  const tubeR = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg) * circTubeMulLines;
                  const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg, circTubeMulLines);
                  const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg, circTubeMulLines);
                  if (oIn) lineRoot.add(oIn);
                  if (oOut) lineRoot.add(oOut);
                  addBandEndConnectors(lineRoot, innerFlat, outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, tubeR);
                }
              }
            } else {
              const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
              if (ribbonGeo) {
                const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, 'polygon3d', roFill, durationDaysSmall);
                lineRoot.add(fillMesh);
                if (borderStyle !== 'none' && outlineColorHexEvt != null) {
                  const tubeR = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg) * circTubeMulLines;
                  const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg, circTubeMulLines);
                  const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg, circTubeMulLines);
                  if (oIn) lineRoot.add(oIn);
                  if (oOut) lineRoot.add(oOut);
                  addBandEndConnectors(lineRoot, innerFlat, outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, tubeR);
                }
              }
            }

            if (
              !isCircadianShortEventsShiftPreview() &&
              (areEventTextLabelsVisibleAtCurrentZoom(start, end) ||
                areEventNameLabelsVisibleAtCurrentZoom(start, end))
            ) {
              const pseudoLineEvent = {
                summary: (line.label && String(line.label).trim()) || null,
                title: (line.label && String(line.label).trim()) || null
              };
              const bdLine = getEventBandRadii(earthDist, durationDaysSmall);
              addEventWorldlineLabelSprites(
                lineRoot,
                pseudoLineEvent,
                start,
                end,
                startHeight,
                endHeight,
                bdLine.rInner,
                bdLine.rOuter,
                colorHex,
                refSelected,
                0,
                innerFlat,
                outerFlat,
                titleAlongByLineIdx.get(i) ?? 0.5
              );
            }

            if (lineRoot.children.length > 0) {
              if (innerFlat && outerFlat) {
                addEventRibbonPickProxy(lineRoot, innerFlat, outerFlat);
              }
              markCircadianShortScrubRoot(lineRoot, layerConfig._diskRibbon, true);
              const linePickUserData = {
                vevent: {
                  uid: line.uid || line.id || `line-${layerConfig.id}-${i}`,
                  key: line.key || line.uid || line.id || null,
                  summary: (line.label && String(line.label).trim()) || null,
                  title: (line.label && String(line.label).trim()) || null,
                  category: line.category || null,
                  layerId: layerConfig.id,
                  calendarId: line.calendarId || null,
                  dtstart: line.dtstart || { dateTime: start.toISOString() },
                  dtend: line.dtend || { dateTime: end.toISOString() },
                  timeZone: line.timeZone
                },
                layerId: layerConfig.id,
                type: 'EventObject',
                eventUid: line.uid || line.id || null
              };
              markWorldSpaceIfNeeded(linePickUserData, start, end);
              const lineRootOut = drawAnnualLine
                ? maybeAppendAnnualDayFrameSte(lineRoot, {
                  start,
                  end,
                  startHeight,
                  endHeight,
                  layerConfig: outlineLayerCfg,
                  lineStyle,
                  firstStyle,
                  earthDist,
                  refSelected,
                  eventHex: colorHex,
                  explicitColor: lineHasExplicitColor,
                  fallbackGradient: lineGradient,
                  anchorMs,
                  durationH,
                  userDataBase: linePickUserData,
                  midTitleAlong01: titleAlongByLineIdx.get(i) ?? 0.5,
                  labelEvent: {
                    summary: (line.label && String(line.label).trim()) || null,
                    title: (line.label && String(line.label).trim()) || null,
                    dtstart: line.dtstart || (line.timeZone
                      ? { dateTime: start.toISOString(), timeZone: line.timeZone }
                      : undefined),
                    timeZone: line.timeZone
                  }
                }, linePickUserData, start, end)
                : lineRoot;
              markShortEventPointerPickability(lineRootOut, start, end);
              addToFlattenOrWorld(lineRootOut);
              objects.push(lineRootOut);
              continue;
            }
          }
        }

        if (drawAnnualLine) {
          const dayFrameLineRoot = tryCreateDayFrameSubDayRibbon({
            start,
            end,
            startHeight,
            endHeight,
            layerConfig: outlineLayerCfg,
            lineStyle,
            firstStyle,
            earthDist,
            refSelected,
            eventHex: colorHex,
            explicitColor: lineHasExplicitColor,
            fallbackGradient: lineGradient,
            anchorMs,
            durationH,
            userDataBase: {
              vevent: {
                uid: line.uid || line.id || `line-${layerConfig.id}-${i}`,
                key: line.key || line.uid || line.id || null,
                summary: (line.label && String(line.label).trim()) || null,
                title: (line.label && String(line.label).trim()) || null,
                category: line.category || null,
                layerId: layerConfig.id,
                calendarId: line.calendarId || null,
                googleAccountEmail: line.googleAccountEmail || null,
                googleCalendarId: line.googleCalendarId || line.calendarId || null,
                circaevumSource: line.circaevumSource || null,
                circaevumSourceDetail: line.circaevumSourceDetail || null,
                dtstart: line.dtstart || { dateTime: start.toISOString() },
                dtend: line.dtend || { dateTime: end.toISOString() },
                timeZone: line.timeZone
              },
              layerId: layerConfig.id,
              type: 'EventObject',
              eventUid: line.uid || line.id || null,
              start,
              end,
              label: line.label || null,
              index: i
            },
            midTitleAlong01: titleAlongByLineIdx.get(i) ?? 0.5,
            labelEvent: {
              summary: (line.label && String(line.label).trim()) || null,
              title: (line.label && String(line.label).trim()) || null,
              dtstart: line.dtstart || (line.timeZone
                ? { dateTime: start.toISOString(), timeZone: line.timeZone }
                : undefined),
              timeZone: line.timeZone
            }
          });
          if (dayFrameLineRoot) {
            addToFlattenOrWorld(dayFrameLineRoot);
            objects.push(dayFrameLineRoot);
            continue;
          }
        }

        if (drawCircadianLine && shouldRenderDailySkySteDiskFallbackMarker(start, end)) {
        let midPos = null;
        if (shouldUseCircadianNearEarthShortPlacement()) {
          midPos = getShortEventCircadianNearEarthPosition(start, end, refSelected);
        }
        if (!midPos) {
          if (shouldUseDayFrameSubDayHelixPlacement()) {
            midPos = getDayFrameWorldPosition(
              midDate,
              earthDist,
              refSelected,
              lineOverlapLayout.byIndex.get(i) || 0,
              {
                dtstart: line.dtstart,
                timeZone: line.timeZone
              }
            );
          } else {
            midPos = getPosShort(midHeight, rShort);
          }
        }
        const markerSize = Math.max(0.2, Math.min(0.48, 0.2 + 0.28 * Math.min(1, durationH / 24)));
        let diskFrameLine = null;
        if (shouldUseCircadianNearEarthShortPlacement()) {
          diskFrameLine = sampleCircadianDiskMarkerFrame(midDate, rShort, refSelected);
          if (diskFrameLine && diskFrameLine.position) midPos = diskFrameLine.position;
        }
        const shortRoot = new global.THREE.Group();
        shortRoot.userData = {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i,
          shortEvent: true
        };
        markWorldSpaceIfNeeded(shortRoot.userData, start, end);

        const marker = createEventLinePointMarker(
          midPos.x,
          midPos.y,
          midPos.z,
          colorHex,
          markerSize,
          {
            layerId: layerConfig.id,
            type: 'EventLine',
            start,
            end,
            label: line.label || null,
            index: i,
            shortEvent: true
          },
          start,
          end,
          diskFrameLine
        );
        shortRoot.add(marker);

        if (
          !isCircadianShortEventsShiftPreview() &&
          (areEventTextLabelsVisibleAtCurrentZoom(start, end) ||
            areEventNameLabelsVisibleAtCurrentZoom(start, end))
        ) {
          const pseudoLineEvent = {
            summary: (line.label && String(line.label).trim()) || null,
            title: (line.label && String(line.label).trim()) || null
          };
          const bdShortLine = getEventBandRadii(earthDist, Math.max(durationH / 24, 1e-3));
          addEventWorldlineLabelSprites(
            shortRoot,
            pseudoLineEvent,
            start,
            end,
            startHeight,
            endHeight,
            bdShortLine.rInner,
            bdShortLine.rOuter,
            colorHex,
            refSelected,
            0,
            undefined,
            undefined,
            titleAlongByLineIdx.get(i) ?? 0.5
          );
        }

        addCircadianConnectorIfApplicable(shortRoot, midPos.x, midPos.y, midPos.z, midDate, colorHex);
        markCircadianShortScrubRoot(shortRoot, layerConfig._diskRibbon, false);
        markShortEventPointerPickability(shortRoot, start, end);
        addToFlattenOrWorld(shortRoot);
        objects.push(shortRoot);
        continue;
        }
        // STE attempted but no geometry — fall through to large LTE manifold.
      }

      if (shouldHideCircadianEventOutsideSelectedDayAtClockZooms(start, end)) {
        continue;
      }
      if (!shouldDrawDailySkySteGeometry(start, end)) {
        continue;
      }

      // Sub-day LTE on annual helix: day pitch (last→next midnight), not week-corridor radii.
      if (isShortEvent && shouldRenderDayFrameSubDayOnAnnualHelix()) {
        const dayFrameLineRoot = tryCreateDayFrameSubDayRibbon({
          start,
          end,
          startHeight,
          endHeight,
          layerConfig: outlineLayerCfg,
          lineStyle,
          firstStyle,
          earthDist,
          refSelected,
          eventHex: colorHex,
          explicitColor: lineHasExplicitColor,
          fallbackGradient: lineGradient,
          anchorMs,
          durationH,
          userDataBase: {
            layerId: layerConfig.id,
            type: 'EventObject',
            eventUid: line.uid || line.id || null,
            start,
            end,
            label: line.label || null,
            index: i
          },
          midTitleAlong01: titleAlongByLineIdx.get(i) ?? 0.5,
          labelEvent: {
            summary: (line.label && String(line.label).trim()) || null,
            title: (line.label && String(line.label).trim()) || null,
            dtstart: line.dtstart || (line.timeZone
              ? { dateTime: start.toISOString(), timeZone: line.timeZone }
              : undefined),
            timeZone: line.timeZone
          }
        });
        if (dayFrameLineRoot) {
          addToFlattenOrWorld(dayFrameLineRoot);
          objects.push(dayFrameLineRoot);
          continue;
        }
      }

      // Multi-day: inner/outer helices, end connectors, optional ribbon fill
      let { rInner, rOuter } = getEventBandRadii(earthDist, durationDays);
      if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;
      const ribbonScaled = applyLayerRibbonWidthScale(rInner, rOuter, earthDist, outlineLayerCfg);
      rInner = ribbonScaled.rInner;
      rOuter = ribbonScaled.rOuter;
      if (shouldApplyConcentricLongEventRibbonLayout() && !eventBandUsesWeekCorridor(durationDays)) {
        const rank01 = lineDurationRanks.has(i) ? lineDurationRanks.get(i) : null;
        const conc = applyConcentricEventRibbonRadii(earthDist, rInner, rOuter, rank01);
        rInner = conc.rInner;
        rOuter = conc.rOuter;
      }
      if ((lineOverlapLayout.byIndex.get(i) || 0) > 0) {
        const nudged = applyOverlapLaneRadialNudge(
          earthDist,
          rInner,
          rOuter,
          lineOverlapLayout.byIndex.get(i),
          lineOverlapLayout.peakAll
        );
        rInner = nudged.rInner;
        rOuter = nudged.rOuter;
      }

      const plotType = resolveEventPlotType(start, end, lineStyle, layerConfig, firstStyle);
      const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
      const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';

      const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
      let eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      eventColorHex = applyLongTermContextColorToHex(eventColorHex, anchorMs, start, end, durationDays);
      let fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
      fillHex = applyLongTermContextColorToHex(fillHex, anchorMs, start, end, durationDays);
      const opacity = Math.min(1,
        ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.7) * getDurationOpacityScale(durationDays));
      const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
      const roFill = -4 + roBoost;
      const roLine = -2 + roBoost;
      const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));
      let outlineColorHexEvt = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
      if (outlineColorHexEvt != null) outlineColorHexEvt = applyLongTermContextColorToHex(outlineColorHexEvt, anchorMs, start, end, durationDays);
      const outlineOpEvt = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
      const fillFade = getLongTermContextFillFadeScales(anchorMs, start, end, durationDays);

      if (isSuperYearDurationDays(durationDays)) {
        const lineUserDataCyl = {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i,
          useWorldSpaceGroup: true,
          immuneToFlatten: true,
          contextSphereClipped: !!contextSphereClipped
        };
        markWorldSpaceIfNeeded(lineUserDataCyl, start, end);
        const cylRoot = createSuperYearCylinderRoot({
          durationDays,
          start,
          end,
          startHeight,
          endHeight,
          earthDist,
          layerConfig: outlineLayerCfg,
          rank01: lineDurationRanks.has(i) ? lineDurationRanks.get(i) : null,
          event: line,
          userData: lineUserDataCyl,
          labelEvent: {
            summary: (line.label && String(line.label).trim()) || null,
            title: (line.label && String(line.label).trim()) || null
          },
          eventHex: eventColorHex,
          fillHex,
          fillOpacity,
          outlineColorHex: outlineColorHexEvt,
          outlineOp: outlineOpEvt,
          borderStyle,
          roFill,
          roLine,
          midTitleAlong01: titleAlongByLineIdx.get(i) ?? 0.5,
          refWorldline
        });
        if (cylRoot) {
          addToFlattenOrWorld(cylRoot);
          objects.push(cylRoot);
          continue;
        }
      }

      const { innerFlat, outerFlat } = buildHelixPair(startHeight, endHeight, rInner, rOuter, refWorldline, 32);
      const staggerLogical = getEventBandVerticalStagger(durationDays);
      const hasRibbon = innerFlat.length >= 6 && innerFlat.length === outerFlat.length;
      const helixRef = {
        startHeight,
        endHeight,
        rInner,
        rOuter,
        refWorldline,
        segments: 32
      };

      const lineUserData = {
        layerId: layerConfig.id,
        type: 'EventLine',
        start,
        end,
        label: line.label || null,
        index: i,
        useWorldSpaceGroup: true,
        immuneToFlatten: true,
        contextSphereClipped: !!contextSphereClipped
      };
      storeTimelineHelixRef(lineUserData, helixRef);

      const lineRoot = new global.THREE.Group();
      lineRoot.userData = { ...lineUserData };

      function evtLineFromFlat(flat, hex, op, lineWidth, arcEdge) {
        const lw = lineWidth != null ? lineWidth : 1;
        const g = new global.THREE.BufferGeometry();
        g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
        const m = new global.THREE.LineBasicMaterial({
          color: hex,
          transparent: true,
          opacity: borderStyle === 'none' ? 0 : op,
          linewidth: lw
        });
        const lo = new global.THREE.Line(g, m);
        lo.renderOrder = roLine;
        lo.userData = { type: 'EventRibbonArc', arcEdge: arcEdge || 'inner' };
        return lo;
      }

      let bandAdded = false;
      if (hasRibbon && plotType === 'lines') {
        const bandGroup = new global.THREE.Group();
        bandGroup.userData = { ...lineUserData };
        bandGroup.add(evtLineFromFlat(innerFlat, eventColorHex, opacity, 1, 'inner'));
        bandGroup.add(evtLineFromFlat(outerFlat, eventColorHex, opacity, 1, 'outer'));
        addBandEndConnectors(bandGroup, innerFlat, outerFlat, eventColorHex, opacity, roLine);
        lineRoot.add(bandGroup);
        bandAdded = true;
      } else if (hasRibbon && (plotType === 'polygon3d' || plotType === 'polygon2d')) {
        const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
        if (ribbonGeo) {
          const bandGroup = new global.THREE.Group();
          bandGroup.userData = { ...lineUserData };
          const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, fillFade);
          fillMesh.userData = { ...lineUserData, longTermFill: true };
          bandGroup.add(fillMesh);
          if (borderStyle !== 'none' && outlineColorHexEvt != null) {
            const tubeR = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg);
            const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg);
            const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg);
            if (oIn) {
              if (!oIn.userData) oIn.userData = {};
              oIn.userData.eventRibbonTube = 'inner';
              bandGroup.add(oIn);
            }
            if (oOut) {
              if (!oOut.userData) oOut.userData = {};
              oOut.userData.eventRibbonTube = 'outer';
              bandGroup.add(oOut);
            }
            addBandEndConnectors(bandGroup, innerFlat, outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, tubeR);
            lineUserData._ribbonOutlineCtx = {
              earthDist,
              layerConfig: outlineLayerCfg,
              outlineColorHex: outlineColorHexEvt,
              outlineOp: outlineOpEvt,
              roLine,
              radiusScale: null
            };
            lineRoot.userData._ribbonOutlineCtx = lineUserData._ribbonOutlineCtx;
          }
          lineRoot.add(bandGroup);
          bandAdded = true;
        }
      }

      if (!bandAdded) {
        const rMid = (rInner + rOuter) * 0.5;
        let points;
        if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
          points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rMid, refWorldline, 32);
        } else {
          const angle0 = getAngle(startHeight);
          const angle1 = getAngle(endHeight);
          const p0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
            ? SceneGeometry.getPosition3D(startHeight, angle0, rMid)
            : { x: Math.cos(angle0) * rMid, y: startHeight, z: Math.sin(angle0) * rMid };
          const p1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
            ? SceneGeometry.getPosition3D(endHeight, angle1, rMid)
            : { x: Math.cos(angle1) * rMid, y: endHeight, z: Math.sin(angle1) * rMid };
          points = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
        }
        let outlineColorFb = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
        if (outlineColorFb != null) outlineColorFb = applyLongTermContextColorToHex(outlineColorFb, anchorMs, start, end, durationDays);
        const outlineOpFb = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
        const useOutFb = borderStyle !== 'none' && outlineColorFb != null;
        const strokeHexFb = useOutFb ? outlineColorFb : eventColorHex;
        const strokeOpFb = borderStyle === 'none' ? 0 : outlineOpFb;
        let strokeObjFb = null;
        if (useOutFb && strokeOpFb > 0) {
          strokeObjFb = createTubeOutlineAlongFlat(points, strokeHexFb, strokeOpFb, roLine, earthDist, outlineLayerCfg);
          if (strokeObjFb) {
            if (!strokeObjFb.userData) strokeObjFb.userData = {};
            strokeObjFb.userData.eventRibbonTube = 'mid';
          }
          lineUserData._ribbonOutlineCtx = {
            earthDist,
            layerConfig: outlineLayerCfg,
            outlineColorHex: strokeHexFb,
            outlineOp: strokeOpFb,
            roLine,
            radiusScale: null
          };
          lineRoot.userData._ribbonOutlineCtx = lineUserData._ribbonOutlineCtx;
        }
        if (!strokeObjFb) {
          const lineGeometry = new global.THREE.BufferGeometry();
          lineGeometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
          const lineMaterial = new global.THREE.LineBasicMaterial({
            color: strokeHexFb,
            transparent: true,
            opacity: borderStyle === 'none' ? 0 : strokeOpFb,
            linewidth: 1
          });
          strokeObjFb = new global.THREE.Line(lineGeometry, lineMaterial);
          strokeObjFb.renderOrder = roLine;
        }
        strokeObjFb.userData = { ...lineUserData, type: 'EventRibbonArc', arcEdge: 'mid' };
        lineRoot.add(strokeObjFb);
      }

      lineRoot.userData = { ...lineUserData };

      if (areEventTextLabelsVisibleAtCurrentZoom(start, end) || areEventNameLabelsVisibleAtCurrentZoom(start, end)) {
        const pseudoLineEvent = {
          summary: (line.label && String(line.label).trim()) || null,
          title: (line.label && String(line.label).trim()) || null
        };
        addEventWorldlineLabelSprites(
          lineRoot,
          pseudoLineEvent,
          start,
          end,
          startHeight,
          endHeight,
          rInner,
          rOuter,
          colorHex,
          refWorldline,
          0,
          innerFlat,
          outerFlat,
          titleAlongByLineIdx.get(i) ?? 0.5
        );
      }

      attachEventStaggerRoot(lineRoot, staggerLogical);
      lineRoot.userData.eventStaggerRoot = true;
      addToFlattenOrWorld(lineRoot);
      objects.push(lineRoot);
    }
    return objects;
  }

  /**
   * Create EventObjects for a set of events and add them to the scene group.
   * @param {Array} events - Array of VEvent or VEVENT-like objects
   * @param {Object} layerConfig - Layer config (id, color, opacity, ...)
   * @param {THREE.Group|null} sceneContentGroup - Group to add meshes to (timeline / flatten group)
   * @param {THREE.Scene|null} scene - Scene (unused for now, for API compatibility)
   * @param {THREE.Group|null} worldSpaceGroup - When set, objects with userData.circadianWorldSpaceLayer attach here
   * @returns {Array<THREE.Object3D>} Created objects (meshes/lines) with userData.type === 'EventObject'
   */
  function eventUidForDisk(ev, idx) {
    if (typeof VEvent !== 'undefined' && ev instanceof VEvent && ev.uid) return String(ev.uid);
    if (ev.uid != null && String(ev.uid).trim() !== '') return String(ev.uid);
    if (ev.id != null && String(ev.id).trim() !== '') return String(ev.id);
    return '__idx_' + idx;
  }

  function shouldAssignCircadianDiskLanes(events) {
    if (!events || !events.length) return false;
    const zl = getZoomLevelForEvents();
    if (!isCircadianHelixZoom(zl) || normalizedCircadianState() === 'off') return false;
    return true;
  }

  /** Title patterns that should not count toward a venue's popularity. */
  const ADMINISH_TITLE_RE =
    /check.?in|registrat|office hours|orientation|front desk|info desk|help desk|sign.?up|\badmin\b/;

  /** Edge Esmeralda day-disk band plan: Hub lanes 0–1, Loft lane 2, others from 3+. */
  const EDGE_HUB_DISK_LANES = 2;
  const EDGE_LOFT_DISK_LANE = 2;
  const EDGE_OTHER_DISK_LANE_START = 3;

  function isEdgeEsmeraldaEvent(ev) {
    if (!ev) return false;
    if (ev.metadata && ev.metadata.venue_zone) return true;
    const loc = ev.location != null ? String(ev.location) : '';
    if (loc.indexOf('Edge Esmeralda') >= 0) return true;
    const uid = ev.uid != null ? String(ev.uid) : '';
    return uid.indexOf('ee26-') === 0;
  }

  function isEdgeEsmeraldaEventSet(events) {
    if (!events || !events.length) return false;
    let n = 0;
    for (let i = 0; i < events.length; i++) {
      if (isEdgeEsmeraldaEvent(events[i])) n++;
    }
    return n >= Math.max(5, Math.floor(events.length * 0.2));
  }

  function edgeVenueZoneOf(ev) {
    if (ev && ev.metadata && ev.metadata.venue_zone) return ev.metadata.venue_zone;
    const loc = ev && ev.location != null ? String(ev.location) : '';
    const tail = loc.indexOf('—') >= 0 ? loc.split('—').pop().trim().toLowerCase() : loc.toLowerCase();
    if (!tail) return 'other';
    if (/\bhub\b|405 healdsburg|outside the hub|meet at the hub/.test(tail)) return 'hub';
    if (/\bloft\b|120 north|outside the loft/.test(tail)) return 'loft';
    return 'other';
  }

  function edgeVenueZoneOfInterval(it, events) {
    const ev = events && events[it.i] != null ? events[it.i] : null;
    return edgeVenueZoneOf(ev);
  }

  /**
   * Pack Edge Esmeralda sub-day events into fixed venue bands on the circadian disk.
   * Hub overlaps scrunch into two inner lanes; Loft is one lane; everything else floats above.
   */
  function assignEdgeEsmeraldaVenueLanes(intervalList, events, maxOtherLanes) {
    const hub = [];
    const loft = [];
    const other = [];
    for (let k = 0; k < intervalList.length; k++) {
      const it = intervalList[k];
      const zone = edgeVenueZoneOfInterval(it, events);
      if (zone === 'hub') hub.push(it);
      else if (zone === 'loft') loft.push(it);
      else other.push(it);
    }
    const laneByUid = new Map();
    assignTemporalOverlapLanes(hub, EDGE_HUB_DISK_LANES, null).forEach((lane, uid) => {
      laneByUid.set(uid, lane);
    });
    for (let k = 0; k < loft.length; k++) {
      laneByUid.set(loft[k].uid, EDGE_LOFT_DISK_LANE);
    }
    const otherCap = Math.max(1, maxOtherLanes || 1);
    assignTemporalOverlapLanes(other, otherCap, null).forEach((lane, uid) => {
      laneByUid.set(uid, EDGE_OTHER_DISK_LANE_START + lane);
    });
    const peakOther = Math.max(1, computePeakConcurrentFromIntervals(other));
    const totalLanes = EDGE_OTHER_DISK_LANE_START + Math.min(otherCap, peakOther);
    return { laneByUid, totalLanes, peakOther };
  }

  function diskVenueKeyOf(ev) {
    if (isEdgeEsmeraldaEvent(ev)) {
      const zone = edgeVenueZoneOf(ev);
      if (zone === 'hub') return 'The Hub';
      if (zone === 'loft') return 'The Loft';
    }
    const loc = ev && ev.location != null ? String(ev.location) : '';
    const parts = loc.split('—');
    if (parts.length >= 2) return parts[parts.length - 1].trim() || 'Other';
    return 'Other';
  }

  function isAdminishEvent(ev) {
    const t = String((ev && (ev.summary != null ? ev.summary : ev.title)) || '').toLowerCase();
    return ADMINISH_TITLE_RE.test(t);
  }

  function normalizeEventIntervalMs(event, idx) {
    const s = getEventStart(event);
    let e = getEventEnd(event);
    if (!s || isNaN(s.getTime())) return null;
    if (!e || !(e > s)) e = new Date(s.getTime() + 3600000);
    return {
      i: idx,
      uid: eventUidForDisk(event, idx),
      s: s.getTime(),
      e: e.getTime(),
      venue: diskVenueKeyOf(event),
      subDay: durationHoursBetween(s, e) < 24
    };
  }

  function buildVenueRankMap(events, intervalItems) {
    if (isEdgeEsmeraldaEventSet(events)) {
      const venueRank = new Map([
        ['The Hub', 0],
        ['The Loft', 1]
      ]);
      let next = 2;
      for (let k = 0; k < intervalItems.length; k++) {
        const v = intervalItems[k].venue;
        if (!venueRank.has(v)) venueRank.set(v, next++);
      }
      return venueRank;
    }
    const venueCounts = new Map();
    const venueOrder = [];
    for (let k = 0; k < intervalItems.length; k++) {
      const it = intervalItems[k];
      if (!it.subDay) continue;
      if (!venueCounts.has(it.venue)) {
        venueCounts.set(it.venue, 0);
        venueOrder.push(it.venue);
      }
      const ev = events && events[it.i] != null ? events[it.i] : null;
      if (!isAdminishEvent(ev)) venueCounts.set(it.venue, venueCounts.get(it.venue) + 1);
    }
    venueOrder.sort(
      (a, b) => venueCounts.get(b) - venueCounts.get(a) || (a < b ? -1 : 1)
    );
    const venueRank = new Map();
    venueOrder.forEach((v, i) => venueRank.set(v, i));
    return venueRank;
  }

  function computePeakConcurrentFromIntervals(list) {
    if (!list || !list.length) return 0;
    const points = [];
    for (let k = 0; k < list.length; k++) {
      points.push({ t: list[k].s, d: 1 });
      points.push({ t: list[k].e, d: -1 });
    }
    points.sort((a, b) => a.t - b.t || a.d - b.d);
    let cur = 0;
    let peak = 0;
    for (let k = 0; k < points.length; k++) {
      cur += points[k].d;
      if (cur > peak) peak = cur;
    }
    return peak;
  }

  /**
   * Greedy interval lanes: overlapping spans prefer different lanes when capacity allows.
   * @returns {Map<string, number>} uid → lane (0..maxLanes-1)
   */
  function assignTemporalOverlapLanes(list, maxLanes, venueRank) {
    const laneByUid = new Map();
    if (!list || !list.length) return laneByUid;
    const lanes = Math.max(1, maxLanes);
    const sorted = list.slice().sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s;
      if (a.e !== b.e) return a.e - b.e;
      const ra = venueRank && venueRank.has(a.venue) ? venueRank.get(a.venue) : 9999;
      const rb = venueRank && venueRank.has(b.venue) ? venueRank.get(b.venue) : 9999;
      return ra - rb || (a.uid < b.uid ? -1 : 1);
    });
    const freeAt = new Array(lanes);
    for (let L = 0; L < lanes; L++) freeAt[L] = -Infinity;
    for (let k = 0; k < sorted.length; k++) {
      const it = sorted[k];
      let lane = -1;
      for (let L = 0; L < freeAt.length; L++) {
        if (it.s >= freeAt[L]) {
          lane = L;
          break;
        }
      }
      if (lane === -1) {
        lane = 0;
        for (let L = 1; L < freeAt.length; L++) {
          if (freeAt[L] < freeAt[lane]) lane = L;
        }
      }
      freeAt[lane] = Math.max(freeAt[lane], it.e);
      laneByUid.set(it.uid, lane);
    }
    return laneByUid;
  }

  function buildTemporalOverlapLayoutForEvents(events) {
    const byIndex = new Map();
    const subDayByUid = new Map();
    if (!events || !events.length) {
      return { byIndex, subDayByUid, peakAll: 1, peakSubDay: 1 };
    }
    const all = [];
    const subDay = [];
    for (let i = 0; i < events.length; i++) {
      const iv = normalizeEventIntervalMs(events[i], i);
      if (!iv) continue;
      all.push(iv);
      if (iv.subDay) subDay.push(iv);
    }
    const venueRank = buildVenueRankMap(events, subDay.length ? subDay : all);
    const peakAll = Math.max(1, computePeakConcurrentFromIntervals(all));
    const peakSubDay = Math.max(1, computePeakConcurrentFromIntervals(subDay));
    const helixPeak = Math.min(peakAll, 8);
    if (isEdgeEsmeraldaEventSet(events)) {
      const edgeAll = assignEdgeEsmeraldaVenueLanes(all, events, helixPeak);
      for (let k = 0; k < all.length; k++) {
        byIndex.set(all[k].i, edgeAll.laneByUid.get(all[k].uid) || 0);
      }
      const edgeSub = assignEdgeEsmeraldaVenueLanes(subDay, events, Math.max(1, peakSubDay));
      return {
        byIndex,
        subDayByUid,
        peakAll: edgeAll.totalLanes,
        peakSubDay: edgeSub.totalLanes,
        subDay,
        venueRank
      };
    }
    const laneByUidAll = assignTemporalOverlapLanes(all, helixPeak, venueRank);
    for (let k = 0; k < all.length; k++) {
      byIndex.set(all[k].i, laneByUidAll.get(all[k].uid) || 0);
    }
    return { byIndex, subDayByUid, peakAll: helixPeak, peakSubDay, subDay, venueRank };
  }

  function normalizeLineIntervalMs(line, idx) {
    const start = line.start instanceof Date ? line.start : new Date(line.start);
    const end = line.end instanceof Date ? line.end : new Date(line.end);
    if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime()) || !(end > start)) return null;
    return {
      i: idx,
      uid: '__line_' + idx,
      s: start.getTime(),
      e: end.getTime(),
      venue: line.location != null ? String(line.location).trim() || 'Other' : 'Other',
      subDay: durationHoursBetween(start, end) < 24
    };
  }

  function buildTemporalOverlapLayoutForLines(lines) {
    const byIndex = new Map();
    if (!lines || !lines.length) {
      return { byIndex, peakAll: 1, peakSubDay: 1, subDay: [], venueRank: new Map() };
    }
    const all = [];
    const subDay = [];
    for (let i = 0; i < lines.length; i++) {
      const iv = normalizeLineIntervalMs(lines[i], i);
      if (!iv) continue;
      all.push(iv);
      if (iv.subDay) subDay.push(iv);
    }
    const pseudoEvents = lines.map((line, i) => ({
      summary: line.label || '',
      title: line.label || '',
      location: line.location || ''
    }));
    const venueRank = buildVenueRankMap(pseudoEvents, subDay.length ? subDay : all);
    const peakAll = Math.max(1, computePeakConcurrentFromIntervals(all));
    const peakSubDay = Math.max(1, computePeakConcurrentFromIntervals(subDay));
    const helixPeak = Math.min(peakAll, 8);
    const laneByUidAll = assignTemporalOverlapLanes(all, helixPeak, venueRank);
    for (let k = 0; k < all.length; k++) {
      byIndex.set(all[k].i, laneByUidAll.get(all[k].uid) || 0);
    }
    return { byIndex, peakAll: helixPeak, peakSubDay, subDay, venueRank };
  }

  function buildCircadianDiskRibbonForLineIntervals(lines, overlapLayout) {
    const map = new Map();
    const layout = overlapLayout || buildTemporalOverlapLayoutForLines(lines);
    const subDay = layout.subDay || [];
    if (!subDay.length) return map;

    const CR = global.CircadianRenderer;
    const baseHand = CR && typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
    const zlLanes = getZoomLevelForEvents();
    const momentLanes = zlLanes === 0;
    const dailySkyLanes = isEarthDailySkyEventZoom(zlLanes);
    const minR = getShortCircadianMinRadiusFromEarthCenter();
    const rim = Math.max(baseHand * 1.08, minR + Math.max(baseHand * 0.04, 0.35));
    const innerMin = Math.max(baseHand * 0.24, minR);
    const gapFrac = momentLanes ? 0.36 : dailySkyLanes ? 0.12 : 0.4;
    const usable = Math.max(baseHand * 0.04, rim - innerMin);
    const minLaneSpan = momentLanes ? 0 : getShortCircadianMinRibbonRadialSpan(baseHand, zlLanes);

    let laneCapacity;
    if (dailySkyLanes) {
      const outerR = getDailySkySteMaxOuterRadius(baseHand);
      const span = Math.max(outerR - minR, 0.05);
      const minBand = Math.max(baseHand * 0.045, 0.1);
      laneCapacity = Math.max(4, Math.min(22, Math.floor(span / minBand)));
    } else {
      const minSpan = Math.max(minLaneSpan, baseHand * 0.03, 1e-3);
      laneCapacity = Math.max(4, Math.min(16, Math.floor(usable / minSpan)));
    }

    const totalLanes = Math.max(1, Math.min(laneCapacity, layout.peakSubDay || 1));
    const laneByUid = assignTemporalOverlapLanes(subDay, totalLanes, layout.venueRank);
    const layoutCtx = {
      baseHand,
      momentLanes,
      dailySkyLanes,
      minR,
      innerMin,
      gapFrac,
      usable,
      minLaneSpan,
      laneCapacity
    };

    for (let k = 0; k < subDay.length; k++) {
      const it = subDay[k];
      const lane = laneByUid.get(it.uid) || 0;
      map.set(it.i, diskRibbonFromLaneIndex(lane, totalLanes, layoutCtx));
    }
    return map;
  }

  function diskRibbonFromLaneIndex(lane, totalLanes, layoutCtx) {
    const {
      baseHand,
      momentLanes,
      dailySkyLanes,
      minR,
      innerMin,
      gapFrac,
      usable,
      minLaneSpan,
      laneCapacity
    } = layoutCtx;
    const lanes = Math.max(1, Math.min(totalLanes, laneCapacity));
    const L = Math.max(0, Math.min(lanes - 1, lane));

    if (dailySkyLanes) {
      const ann = getDailySkySteAnnulusLayout(baseHand, lanes);
      const step = ann.bandW + ann.gap;
      const rIn = ann.innerR + L * step;
      const rOut = rIn + ann.bandW;
      return clampShortCircadianDiskRibbon({ rIn, rOut, rMid: (rIn + rOut) * 0.5, lane: L });
    }

    const laneW = momentLanes
      ? usable / lanes
      : Math.max(baseHand * 0.04, usable / lanes);
    const rIn = innerMin + L * laneW;
    let rOut = rIn + laneW * (1 - gapFrac);
    if (minLaneSpan > 0 && rOut - rIn < minLaneSpan) rOut = rIn + minLaneSpan;
    return clampShortCircadianDiskRibbon({ rIn, rOut, rMid: (rIn + rOut) * 0.5, lane: L });
  }

  /**
   * Sub-day disk ribbons: lane per uid from temporal overlap packing (not venue-only scatter).
   * Overlapping intervals get different radial lanes when capacity allows.
   */
  function buildCircadianDiskRibbonByUid(events, overlapLayout) {
    const map = new Map();
    if (!events || !events.length) return map;

    const layout = overlapLayout || buildTemporalOverlapLayoutForEvents(events);
    const subDay = layout.subDay || [];
    if (!subDay.length) return map;

    const CR = global.CircadianRenderer;
    const baseHand = CR && typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
    const zlLanes = getZoomLevelForEvents();
    const momentLanes = zlLanes === 0;
    const dailySkyLanes = isEarthDailySkyEventZoom(zlLanes);
    const minR = getShortCircadianMinRadiusFromEarthCenter();
    const rim = Math.max(baseHand * 1.08, minR + Math.max(baseHand * 0.04, 0.35));
    const innerMin = Math.max(baseHand * 0.24, minR);
    const gapFrac = momentLanes ? 0.36 : dailySkyLanes ? 0.12 : 0.4;
    const usable = Math.max(baseHand * 0.04, rim - innerMin);
    const minLaneSpan = momentLanes ? 0 : getShortCircadianMinRibbonRadialSpan(baseHand, zlLanes);

    let laneCapacity;
    if (dailySkyLanes) {
      const outerR = getDailySkySteMaxOuterRadius(baseHand);
      const span = Math.max(outerR - minR, 0.05);
      const minBand = Math.max(baseHand * 0.045, 0.1);
      laneCapacity = Math.max(4, Math.min(22, Math.floor(span / minBand)));
    } else {
      const minSpan = Math.max(minLaneSpan, baseHand * 0.03, 1e-3);
      laneCapacity = Math.max(4, Math.min(16, Math.floor(usable / minSpan)));
    }

    let totalLanes;
    let laneByUid;
    if (isEdgeEsmeraldaEventSet(events)) {
      const otherCap = Math.max(1, laneCapacity - EDGE_OTHER_DISK_LANE_START);
      const edge = assignEdgeEsmeraldaVenueLanes(subDay, events, otherCap);
      laneByUid = edge.laneByUid;
      totalLanes = Math.max(EDGE_OTHER_DISK_LANE_START + 1, Math.min(laneCapacity, edge.totalLanes));
    } else {
      totalLanes = Math.max(1, Math.min(laneCapacity, layout.peakSubDay || 1));
      laneByUid = assignTemporalOverlapLanes(subDay, totalLanes, layout.venueRank);
    }
    const layoutCtx = {
      baseHand,
      momentLanes,
      dailySkyLanes,
      minR,
      innerMin,
      gapFrac,
      usable,
      minLaneSpan,
      laneCapacity
    };

    for (let k = 0; k < subDay.length; k++) {
      const it = subDay[k];
      const lane = laneByUid.get(it.uid) || 0;
      map.set(it.uid, diskRibbonFromLaneIndex(lane, totalLanes, layoutCtx));
    }
    return map;
  }

  function getEventCategory(event) {
    const c = event.category ?? (Array.isArray(event.categories) && event.categories[0]);
    return (c != null && String(c).trim()) ? String(c).trim() : 'Default';
  }

  /**
   * Is this event inside its density window?
   * STE → Event Horizon week; LTE → zoom parent nest (outside horizon).
   * Used for window-before-budget at every zoom.
   */
  function isEventOnScreenForDensityBudget(event, zl) {
    const start = getEventStart(event);
    const end = getEventEnd(event);
    if (!start || isNaN(start.getTime())) return false;
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    if (zl === 2 && isSuperYearDurationDays(durationDaysBetween(start, evEnd))) return true;
    if (!eventTouchesSelectedParentWindow(start, evEnd)) return false;

    if (!isEarthDailySkyEventZoom(zl)) return true;
    // Budget window is SHIFT-agnostic: SHIFT changes what's visible, not what competes for slots.
    if (isLongTermSpanForDailySky(start, evEnd)) {
      return isEventInSelectedYear(start, evEnd);
    }
    // STEs at daily-sky: month-range slider still applies inside Event Horizon week.
    return eventTouchesSelectedMonthRangeWindow(start, evEnd);
  }

  /**
   * Apply the per-zoom density budget to a layer's standard (non-timeseries) events.
   * Window-before-budget: parent-unit window first (all zooms), then daily-sky sub-filters.
   */
  function selectEventsForDensityBudget(standardEvents, zl) {
    const budget = getEventDensityBudget(zl);
    const list = standardEvents || [];
    const alwaysShow = [];
    const rest = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const start = getEventStart(e);
      const end = getEventEnd(e);
      const evEnd = end && end > start ? end : (start ? new Date(start.getTime() + 3600000) : null);
      if (zl === 2 && start && isSuperYearDurationDays(durationDaysBetween(start, evEnd))) {
        alwaysShow.push(e);
      } else {
        rest.push(e);
      }
    }
    const inScope = rest.filter((e) => isEventOnScreenForDensityBudget(e, zl));
    if (inScope.length <= budget) {
      return { rendered: alwaysShow.concat(inScope), overflowCount: 0 };
    }
    const scored = inScope.map((e, i) => ({ e, i, score: scoreEventPriority(e) }));
    scored.sort((a, b) => b.score - a.score);
    return {
      rendered: alwaysShow.concat(scored.slice(0, budget).map((x) => x.e)),
      overflowCount: inScope.length - budget
    };
  }

  function createEventObjects(events, layerConfig, sceneContentGroup, scene, worldSpaceGroup) {
    const objects = [];
    if (!events || !layerConfig) return objects;
    ensureSceneGeometryInitialized();

    // Density budget: cap geometry per zoom level. Priority-sort, render top N, badge the rest.
    const zl = getZoomLevelForEvents();
    // Timeseries events (Garmin HR, sleep arcs) render via TimeseriesRenderer, not as
    // worldline ribbons. Excluding them from the worldline density budget prevents hundreds
    // of Garmin daily entries from crowding out regular calendar events and STEs.
    const timeseriesEvents = events.filter(
      (e) => e && e.render && e.render.kind === 'timeseries'
    );
    const standardEvents = events.filter(
      (e) => !(e && e.render && e.render.kind === 'timeseries')
    );

    const { rendered: renderStandard, overflowCount } = selectEventsForDensityBudget(standardEvents, zl);
    // Recombine: standard events (budget-capped) + timeseries events (unlimited)
    const renderEvents = [...renderStandard, ...timeseriesEvents];

    _eventTubeQualityScale = computeEventTubeQualityScale(renderEvents.length);
    _eventOutlineLineMode = false;
    const group = sceneContentGroup || null;
    const worldGroup = worldSpaceGroup || null;
    const byCategory = layerConfig.layerStylesByCategory || {};
    const eventTimeRange = getTimeRange(renderEvents);
    const durationRanks = buildDurationRankMapForEvents(renderEvents);
    const titleAlongByEventIdx = computeTitleAlongForLayerEvents(renderEvents);
    const overlapLayout = buildTemporalOverlapLayoutForEvents(renderEvents);
    const diskRibbonByUid = shouldAssignCircadianDiskLanes(renderEvents)
      ? buildCircadianDiskRibbonByUid(renderEvents, overlapLayout)
      : null;

    for (let i = 0; i < renderEvents.length; i++) {
      const event = renderEvents[i];
      // Timeseries events (e.g. Garmin HR/sleep) render as varying-radius arcs via TimeseriesRenderer,
      // not as default dots/ribbons. Suppress the default geometry when the render flag disables the arc.
      if (event && event.render && event.render.kind === 'timeseries' && event.render.arc === false) continue;
      const category = getEventCategory(event);
      const styleOverride = byCategory[category];
      if (styleOverride && styleOverride.visible === false) continue;
      const rank01 = durationRanks.has(i) ? durationRanks.get(i) : null;
      const alongSpan = titleAlongByEventIdx.get(i) ?? 0.5;
      const diskRibbon = diskRibbonByUid ? diskRibbonByUid.get(eventUidForDisk(event, i)) : null;
      const overlapAttach = {
        _overlapLane: overlapLayout.byIndex.get(i) || 0,
        _overlapPeak: overlapLayout.peakAll || 1
      };
      const diskAttach = diskRibbon ? { _diskRibbon: diskRibbon } : {};
      const effectiveConfig = styleOverride
        ? { ...layerConfig, ...styleOverride, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange, _durationRank01: rank01, _midTitleAlongSpan: alongSpan, ...overlapAttach, ...diskAttach }
        : { ...layerConfig, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange, _durationRank01: rank01, _midTitleAlongSpan: alongSpan, ...overlapAttach, ...diskAttach };
      const hasEnd = !!getEventEnd(event);
      const obj = hasEnd ? createEventWorldline(event, effectiveConfig) : createEventMarker(event, effectiveConfig);
      if (obj) {
        const evStart = getEventStart(event);
        const evEnd = getEventEnd(event);
        markShortEventPointerPickability(obj, evStart, evEnd);
        const parent = resolveEventObjectParent(obj, group, worldGroup);
        if (parent) parent.add(obj);
        else if (typeof console !== 'undefined' && console.warn) {
          console.warn('EventRenderer: no scene parent for event', eventUidForDisk(event, i));
        }
        objects.push(obj);
      }
    }

    // Density overflow indicator — dim arc + count when budget was hit
    if (overflowCount > 0 && SceneGeometry) {
      const earthDist = (SceneGeometry.earthDistance != null) ? SceneGeometry.earthDistance : EARTH_RADIUS;
      const indicator = createOverflowIndicatorArc(overflowCount, earthDist, layerConfig);
      if (indicator) {
        const parent = group || worldGroup;
        if (parent) {
          parent.add(indicator);
          objects.push(indicator);
        }
      }
    }

    const seriesBaseConfig = { ...layerConfig, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange };
    // Timeseries-arc events (e.g. Garmin sleep/HR) draw their own arcs; keep them out of the standard
    // time-series decoration spines/connectors so no extra "standard event arcs" appear for them.
    // Month-frame series spines (0.34W) are disabled in createTimeSeriesDecorationGroups.
    const decorationEvents = renderEvents.filter(
      (e) => !(e && e.render && e.render.kind === 'timeseries' && e.render.arc === false)
    );
    let seriesRoots = [];
    if (
      SERIES_MONTH_FRAME_DECORATION_ENABLED &&
      !isEarthDailySkyEventZoom(getZoomLevelForEvents())
    ) {
      seriesRoots = createTimeSeriesDecorationGroups(decorationEvents, seriesBaseConfig);
    }
    for (let si = 0; si < seriesRoots.length; si++) {
      const sg = seriesRoots[si];
      if (group) group.add(sg);
      objects.push(sg);
    }

    return objects;
  }

  /**
   * Why short events may not appear (filters run before meshes are created).
   * @param {Array} events
   * @param {string} [layerId]
   * @returns {Object}
   */
  function getShortEventRenderDiagnostics(events, layerId) {
    const list = events || [];
    const zl = getZoomLevelForEvents();
    const circ = normalizedCircadianState();
    const scope =
      typeof global.getCircadianShortEventScope === 'function'
        ? global.getCircadianShortEventScope()
        : 'unknown';
    const sel =
      typeof global.getSelectedDateTime === 'function' ? global.getSelectedDateTime() : null;
    let hiddenScope = 0;
    let shortCount = 0;
    let stackEligible = 0;
    for (let i = 0; i < list.length; i++) {
      const s = getEventStart(list[i]);
      const e = getEventEnd(list[i]);
      if (!s || isNaN(s.getTime())) continue;
      const endUse = e && e > s ? e : new Date(s.getTime() + 3600000);
      if (durationHoursBetween(s, endUse) >= 24) continue;
      shortCount++;
      if (shouldHideCircadianShortEventForDayScope(s, endUse)) hiddenScope++;
      if (isHelixZoomShortStackFrame()) stackEligible++;
    }
    return {
      layerId: layerId || null,
      zoomLevel: zl,
      helixZoom: isCircadianHelixZoom(zl),
      circadianState: circ,
      shortEventScope: scope,
      shiftPreviewSte: isCircadianShortEventsShiftPreview(),
      selectedDate: sel ? sel.toISOString() : null,
      stackPlacement: isHelixZoomShortStackFrame(),
      attachToSceneContentGroup: shouldAttachShortCircadianToWorldGroup(),
      shortEventsInLayer: shortCount,
      hiddenByDayScopeFilter: hiddenScope,
      wouldReachGpu: shortCount - hiddenScope,
      sceneGeometryReady:
        typeof SceneGeometry !== 'undefined' &&
        typeof PLANET_DATA !== 'undefined' &&
        !!PLANET_DATA &&
        PLANET_DATA.length > 0
    };
  }

  const EventRenderer = {
    createEventObjects,
    createEventLineObjects,
    createEventMarker,
    createEventWorldline,
    updateCircadianShortEventsForScrub,
    updateTimelineHelixEventsForFlatten,
    getEventStart,
    getEventEnd,
    getShortEventRenderDiagnostics,
    // Exposed for tests: per-zoom density-budget selection and its inputs.
    selectEventsForDensityBudget,
    isEventOnScreenForDensityBudget,
    getEventDensityBudget,
    scoreEventPriority,
    eventTouchesSelectedParentWindow,
    getSelectedParentUnitBounds,
    isCircadianHelixZoom,
    isEarthDailySkyEventZoom,
    DENSITY_BUDGET,
    isShortEventPointerPickableAtCurrentZoom,
    markShortEventPointerPickability,
    /** Same inner/outer radii as multi-day event ribbons (used by list-horizon shell in main.js). */
    getEventBandRadii,
    /** Log-scaled radius vs span length (list-horizon hoop in main.js). */
    getRadiusForDuration,
    eventTextLabelsMinZoomForDurationDays,
    eventDurationEligibleForFullListAtZoom,
    areEventNameLabelsVisibleAtCurrentZoom,
    isEventLabelRadialContextSurpassesInner,
    getListFocusMinDurationDaysForZoom,
    getListContextRingInnerRadius,
    getListContextRingOuterRadius,
    getListContextRingRadiiForZoom,
    getDayMarkerFrameRadii,
    getRadiusInDayMarkerFrame,
    getContextArcToCircadianBlend,
    getEventHorizonRadius,
    getEarthEventHorizonCenter,
    isSteStyleDailySpan,
    eventTouchesSelectedContextArcWindow
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventRenderer;
  } else {
    global.EventRenderer = EventRenderer;
  }
})(typeof window !== 'undefined' ? window : this);
