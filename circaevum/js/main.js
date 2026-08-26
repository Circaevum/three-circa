/**
 * Circaevum Main Application
 * Three.js-based planetary time visualization
 * 
 * This module contains:
 * - Scene initialization and rendering
 * - Planet and worldline creation
 * - Time marker systems
 * - Navigation and controls
 * - Animation loop
 * 
 * Dependencies: Three.js, config.js
 */

// ============================================
// GLOBAL VARIABLES
// ============================================
// Note: Date/time variables are now in datetime.js
// Note: Configuration constants are now in config.js
// Note: scene, camera, renderer, sceneContentGroup, sunMesh, sunGlow, sunLight, stars
//       are now declared in core/scene-core.js and exported to window

// Scene variables are declared in scene-core.js (loaded before this file)
// They are available as globals: scene, camera, renderer, sceneContentGroup, etc.

// Scene variables declared here (used by scene-core.js)
let scene, camera, renderer;
let sceneContentGroup = null;
let flattenableGroup = null; // Worldlines and time markers only; scaled when flatten is on. Sun/planets stay in sceneContentGroup.
let timeMarkersGroup = null; // Time markers only; enables marker-only flatten mode.
let sunMesh = null;
let sunGlow = null;
let sunLight = null;
/** Parallel sunlight; target tracks Earth each frame. */
let sunDirectionalLight = null;
let sunDirectionalTarget = null;
let stars = null;

// Other global variables
let planetMeshes = [];
let orbitLines = [];
let worldlines = [];
let timeMarkers = [];
let currentZoom = 4;
// Set true while createPlanets() runs and after it refreshes event layers, so
// callers that invoke createPlanets() can skip an immediately-following
// refreshAllEventLayers() (a full event rebuild) instead of doing it twice.
let eventsRefreshedDuringCreatePlanets = false;
/**
 * Cache key for calendar event layer geometry. createPlanets skips refreshAllEventLayers
 * when this matches (planet/marker teardown does not remove GL event meshes).
 */
let lastEventLayersRebuildKey = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraRotation = { x: Math.PI / 6, y: 0 };
if (typeof window !== 'undefined') window.cameraRotation = cameraRotation;
let time = 0;
let focusPoint = null; // Initialized in initScene after THREE is loaded
let targetFocusPoint = null; // Initialized in initScene after THREE is loaded
let targetCameraDistance = 800;
let currentCameraDistance = 800;
let cameraTransitionSpeed = 0.15; // Camera transition speed for zoom level changes
/**
 * Optional override after Event Horizon fit-cam (normally unused — classic ZOOM_LEVELS.distance).
 */
let zoomFramedCameraDistance = null;
/** When true: Earth look-at + fit sphere in FOV. Default off — classic focusTarget ladder. */
let preferEarthEventHorizonCamera = false;
/** Default perspective FOV. Zoom 0 narrows toward MIN_MOMENT_FOV for telephoto inspection once the dolly is pinned at the globe. */
const BASE_CAMERA_FOV = 75;
const MIN_MOMENT_FOV = 14;
/** 'dark' | 'light' | 'sky' — sky uses light chrome (body.light-mode) plus sky-theme tints and a blue scene background. */
let appearanceTheme = 'dark';
/** True for light or sky (readable orbit lines, bright UI chrome). */
let isLightMode = false;
let viewMode = 0; // 0 = angled, 1 = top-down (looking into future), 2 = bottom-up (looking into past)
let showTimeMarkerLines = true;
let showTimeMarkerText = true;
let showFullYearTimeMarkers = false; // When true, show time markers for the full selected year
/**
 * Demo: collapse time-marker bands + Context Arc onto a thin stack near Earth orbit radius.
 * Temp default: singular/shared-radius ON (less onion jump; better for parent-window rift).
 * Classic onion: URL `?singularBand=0` or toolbar. URL wins; else sessionStorage v3.
 */
let singularBandMode = true;
const SINGULAR_BAND_STORAGE_KEY = 'circaevum.singularBand.v3';
/** When true (intro tour “clean orbit”), skip helical worldlines, ghost Earth orbit, and Lagrange extras. */
let tourMinimalOrbitMode = false;
/** Intro tour only: cap visible staged time-marker tiers (1–5) on year zoom; null = normal visibility rules. */
let tourYearMarkerReveal = null;
/** 0–1: Earth helical worldline drawn from Jan 1 of selected year toward current selected height (narrative orbit 2). */
let tourWorldlineRevealProgress = null;
/** When true, skip all time marker geometry (orbit 1 clean Sun view). */
let tourHideAllTimeMarkers = false;
/** Orbit 3: calendar-quarter-driven marker density + progressive reveal from selected date. */
let tourOrbitMarkersFromCalendar = false;
/** Decorative equinox/solstice cross overlay (narrative beats 6–7). */
let tourSolsticeCrossActive = false;
/** Meshes for {@link tourSolsticeCrossActive} and related tour-only overlays; cleared each createPlanets. */
let tourNarrativeOverlayMeshes = [];
/** When true, scrub selected time with light mesh updates; throttle full rebuilds for markers (intro tour). */
let tourNarrativeLightMode = false;
/** 2D month strip during tour (keeps heavy week/day markers off the helix). */
let tourFlatCalendarStrip = false;
/** When set (e.g. `'quarters'`), overrides progressive marker density from calendar month. */
let tourMarkerDensityOverride = null;
/** Planet ribbons use shader Y-clip while intro worldline reveal is active. */
let tourNarrativeShaderWorldlinesActive = false;
/** Intro tour: multiply planetary orbit ring opacity (0–1). */
let tourPlanetOrbitRingOpacityMul = 1;
/** Intro tour: multiply helical worldline mesh opacity (0–1). */
let tourWorldlineOpacityMul = 1;
/** Intro tour: when false, hide the event-list context arc at selected time. */
let tourContextArcVisible = true;
let tourSceneLightRebuildLast = 0;

function applyTourSceneOpacityOverrides() {
    const orbitMul =
        typeof tourPlanetOrbitRingOpacityMul === 'number' && !isNaN(tourPlanetOrbitRingOpacityMul)
            ? Math.max(0, Math.min(1, tourPlanetOrbitRingOpacityMul))
            : 1;
    const wlMul =
        typeof tourWorldlineOpacityMul === 'number' && !isNaN(tourWorldlineOpacityMul)
            ? Math.max(0, Math.min(1, tourWorldlineOpacityMul))
            : 1;

    orbitLines.forEach((line) => {
        if (!line || !line.material) return;
        if (line.userData.tourBaseOpacity == null) line.userData.tourBaseOpacity = line.material.opacity;
        line.material.opacity = line.userData.tourBaseOpacity * orbitMul;
        line.material.visible = orbitMul > 0.01;
    });
    if (ghostOrbitLine && ghostOrbitLine.material) {
        if (ghostOrbitLine.userData.tourBaseOpacity == null) {
            ghostOrbitLine.userData.tourBaseOpacity = ghostOrbitLine.material.opacity;
        }
        ghostOrbitLine.material.opacity = ghostOrbitLine.userData.tourBaseOpacity * orbitMul;
        ghostOrbitLine.material.visible = orbitMul > 0.01;
    }
    worldlines.forEach((wl) => {
        if (!wl || typeof wl.traverse !== 'function') return;
        wl.traverse((child) => {
            if (!child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
                if (mat.opacity == null) return;
                if (child.userData.tourBaseOpacity == null) child.userData.tourBaseOpacity = mat.opacity;
                mat.opacity = child.userData.tourBaseOpacity * wlMul;
                mat.visible = wlMul > 0.01;
            });
        });
    });
}

function clearTourNarrativeSceneFlags() {
    tourWorldlineRevealProgress = null;
    tourHideAllTimeMarkers = false;
    tourOrbitMarkersFromCalendar = false;
    tourSolsticeCrossActive = false;
    tourNarrativeLightMode = false;
    tourFlatCalendarStrip = false;
    tourMarkerDensityOverride = null;
    tourNarrativeShaderWorldlinesActive = false;
    tourPlanetOrbitRingOpacityMul = 1;
    tourWorldlineOpacityMul = 1;
    tourContextArcVisible = true;
    try {
        const el = typeof document !== 'undefined' ? document.getElementById('circaevum-tour-cal-strip') : null;
        if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) { /* ignore */ }
}
/** Pedagogical Moon mesh + dashed guide + lunar worldline (scene icon / M). */
let showMoonLayer = true;
/**
 * Other planets (not Earth). Off until the user turns them on (P / HUD).
 * `true` / `false` stick until toggled again.
 */
let otherPlanetsOverride = false;
/** Full birth date from yin-portal (`profile/birthday`). Anchors decade zoom span. */
let userBirthdayDate = null;
/**
 * Earth helical worldline ribbon (annual manifold).
 * Auto-on at zoom 1–9. Off at Moment (0) so the polar dial stays clear.
 * `showEarthHelicalWorldline === true` forces it on even there.
 */
let showEarthHelicalWorldline = false;

/** Moon layer is off at coarse zooms 1–4 (century → quarter); still on at 0, 5–9 when `showMoonLayer` is true. */
function isMoonLayerEffectiveAtZoom(zl) {
    if (!showMoonLayer) return false;
    const z = typeof zl === 'number' && !isNaN(zl) ? zl : currentZoom;
    if (z >= 1 && z <= 4) return false;
    return true;
}

/** Lunar orbit ribbon only — off at Moment (0) and Clock (9); pedagogical Moon mesh may still show. */
function isMoonWorldlineVisibleAtZoom(zl) {
    if (!isMoonLayerEffectiveAtZoom(zl)) return false;
    const z = typeof zl === 'number' && !isNaN(zl) ? zl : currentZoom;
    return z !== 0 && z !== 9;
}
let moonWorldlines = []; // Store moon worldline meshes
let lagrangeMarkerObjects = []; // Sun–Earth L1–L5 at selected time (orbital plane)
/** L1-radius “day in L4–L5 sector” dots + hover connector (see SCENE_CONFIG.lagrangeMarkers.l1DayArc). */
let lagrangeL1DayArcObjects = [];
let lagrangeL1DayHoverConnector = null;
let lagrangeL1DayHoverTargetMesh = null;
/** Last screen-space pick ray (for growing day dots near cursor / touch). */
const lagrangeL1MouseRay = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0, has: false };
let lagrangeL1SharedPickRaycaster = null;
let lagrangeL1NdcScratch = null;
/** Core pedagogical Moon mesh + Earth–Moon dashed guide (see core/moon-mechanics.js). */
let moonMechanicObjects = [];
let circadianWorldlines = []; // Circadian: one disk outline per day in span (day/clock zoom)
let circadianHelixMarkerGroups = []; // Week/month ticks along circadian helix (LineSegments)
/**
 * Frosted mist + shutter disks outside the parent-unit density window
 * (week→month, day→week, …). Events outside are not meshed; veil signals intentional occlude.
 */
let parentUnitTemporalVeilGroup = null;
/** Sun Hands: Sun↔Earth cylinders for current/selected time; sceneContentGroup space. */
let sunEarthTimeRadialCurrent = null;
let sunEarthTimeRadialSelected = null;
/** Earth Hands: Earth-center→surface hour vectors + square markers at hit points (zoom 0). */
let earthHandCurrent = null;
let earthHandSelected = null;
let earthHandMarkerCurrent = null;
let earthHandMarkerSelected = null;
/** Orbital sky at Earth (zoom 0/8/9): thin flat ring + wedge in the XZ plane. */
let earthDaylightSkyMesh = null;
let earthDaylightSkyRadiiKey = null;
let earthDaylightSkyColorKey = null;
let earthDaylightSkyAltitudeCache = { key: '', alts: null };
/** Local +Z in the sky group points sunward after {@link syncEarthDaylightSkyTransform}. */
const EARTH_DAYLIGHT_SKY_LOCAL_SUN_AZIMUTH = Math.PI / 2;
const EARTH_DAYLIGHT_SKY_RENDER_ORDER = 7;
const LIST_HORIZON_SKY_DISK_OPACITY = 0.88;
/** Hold Shift: fade sky canvas so fore/aft STEs and timeseries arcs stay readable. */
const LIST_HORIZON_SKY_DISK_SHIFT_OPACITY = 0.08;
/**
 * Radial samples across context-arc sky fill (inner midnight → outer end-of-day).
 * Must be >1 so noon/dawn/dusk exist as verts — 2-ring lerp of night→night wipes the day.
 * Matches {@link buildDayFrameLteSkyMesh} diurnal resolution.
 */
const CONTEXT_ARC_SKY_RADIAL_SEGMENTS = 24;
/** Annual-helix day-frame LTE: selected-day sky strip (diurnal hues like day canvas). */
const DAY_FRAME_LTE_SKY_RENDER_ORDER = -12;
const DAY_FRAME_LTE_SKY_OPACITY = 0.64;
const DAY_FRAME_LTE_SKY_STORAGE_KEY = 'circaevum.dayFrameLteSky';
/** When false, day-frame LTE sky mesh is disposed so it cannot occlude STE / timeseries mapping. */
let showDayFrameLteSky = false;
let dayFrameLteSkyMesh = null;
let dayFrameLteSkyGeomKey = null;
let dayFrameLteSkyColorKey = null;
/** Per-calendar-day solar altitude samples for context-arc sky coloring. */
let contextArcSolarAltitudeCache = new Map();
const CONTEXT_ARC_SOLAR_CACHE_MAX = 400;
let listHorizonSkyColorKey = null;
/** List-context circle: sky-filled disks to Sun axis + rim wall; Day/Clock outer radius to Earth orbit. */
let listHorizonEarthRingMesh = null;
let listHorizonEarthRingCurrentRadius = null;
let listHorizonEarthRingTargetRadius = null;
let listHorizonEarthRingCurrentInnerRadius = null;
let listHorizonEarthRingTargetInnerRadius = null;
let listHorizonEarthRingCurrentHeight = null;
let listHorizonEarthRingTargetHeight = null;
let listHorizonEarthRingEarthDistance = null;
let listHorizonEarthRingTargetZoom = null;
/** Cached arc span key so selected-time scrub rebuilds the context band. */
let listHorizonEarthRingArcKey = null;
let listHorizonHelixTimeKey = null;
/** Context arc always on at zoom; hidden only when Event List uses Draw all. */
/** Short (<24h) circadian-scoped events: 'day' = selected calendar day only, 'year' = whole selected year. */
let circadianShortEventScope = 'year';
/** Hold Shift: peek nearby STEs as ribbon polygons (inner + outer edges); full detail on selected day. Suppressed while ⌘/Meta is held (screenshots). */
let circadianShortEventsShiftPreview = false;
let modifierMetaHeld = false;
/** Default on so the circadian frame is visible at helix-capable zoom levels. */
let circadianState = 'wrapped';
/** false = show calendar events only in selected year; true = all time (see scene calendar icon) */
let showAllTimelineEvents = false;
/** 'alpha' keeps hue for long-term events and fades fill opacity out-of-window; 'desaturate' uses prior gray blend behavior. */
let longEventContextFadeMode = 'alpha';
/** 'auto' = polygons on selected day only; 'polygon3d' | 'lines' = force all. */
let globalEventPlotType = 'auto';
/** 0 = off-day lines stay bright; 1 = full off-selected-time line dimming (see event-renderer). */
let offSelectedTimeLineDimStrength = 1;
if (typeof window !== 'undefined') {
    window.getEarthGlobeSurfaceRadius = function (earthPlanet) {
        const mesh = earthPlanet || planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
        return resolveEarthGlobeSurfaceRadius(mesh);
    };
    window.getOffSelectedTimeLineDimStrength = function () {
        return offSelectedTimeLineDimStrength;
    };
    window.setOffSelectedTimeLineDimStrength = function (value) {
        const v = Number(value);
        offSelectedTimeLineDimStrength = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
        if (typeof updateOffSelectedLineDimSliderUi === 'function') updateOffSelectedLineDimSliderUi();
        if (typeof refreshEventLayersIfNeeded === 'function') {
            refreshEventLayersIfNeeded(true);
        } else {
            const gl = window.circaevumGL;
            if (gl && typeof gl.refreshAllEventLayers === 'function') {
                try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
            }
        }
    };
    window.getCurrentZoomLevel = function () { return currentZoom; };
    window.getCircadianRhythmState = function () { return circadianState; };
    window.getLongEventContextFadeMode = function () { return longEventContextFadeMode; };
    window.getGlobalEventPlotType = function () {
        return globalEventPlotType === 'lines' || globalEventPlotType === 'polygon3d'
            ? globalEventPlotType
            : 'auto';
    };
    window.setGlobalEventPlotType = function (mode) {
        if (mode === 'lines' || mode === 'polygon3d') globalEventPlotType = mode;
        else globalEventPlotType = 'auto';
        if (typeof updateEventPlotTypeButton === 'function') updateEventPlotTypeButton();
        if (typeof refreshEventLayersIfNeeded === 'function') {
            refreshEventLayersIfNeeded(true);
        } else {
            const gl = window.circaevumGL;
            if (gl && typeof gl.refreshAllEventLayers === 'function') {
                try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
            }
        }
        if (typeof window.refreshEventsList === 'function') {
            const ep = document.getElementById('event-list-panel');
            if (ep && ep.classList.contains('open')) window.refreshEventsList(false);
        }
    };
}
let flattenMode = 'all'; // 'off' | 'markers' | 'all' — defaulted to fully flat
let currentFlattenAmount = 1; // Lerps for event/worldline flatten in mode 'all'.
/** Logical Y where flatten group scales while flatten-all is on. Stays put on A/D so camera moves flattened deltas. */
let flattenWorldOriginY = null;
/** Last selectedDateHeight (logical, 100 units/year). Flatten pivot fallback. */
let lastLogicalSelectedDateHeight = null;

function flattenAllYScale() {
    if (flattenMode !== 'all') return 1;
    const amt = typeof currentFlattenAmount === 'number' && !isNaN(currentFlattenAmount)
        ? currentFlattenAmount
        : 0;
    if (amt <= 0.001) return 1;
    return Math.max(0, 1 - amt);
}

function ensureFlattenWorldOriginFromLogicalY(logicalY) {
    if (flattenMode !== 'all') {
        flattenWorldOriginY = null;
        return;
    }
    if (
        flattenWorldOriginY == null &&
        typeof logicalY === 'number' &&
        isFinite(logicalY)
    ) {
        flattenWorldOriginY = logicalY;
    }
}

/** Scene Y for sun/planets/camera: flattened delta around sticky origin (not unflattened year-height). */
function getFlattenedSceneY(logicalY) {
    if (typeof logicalY !== 'number' || !isFinite(logicalY)) return logicalY;
    const s = flattenAllYScale();
    if (s >= 0.999) return logicalY;
    ensureFlattenWorldOriginFromLogicalY(logicalY);
    const origin =
        typeof flattenWorldOriginY === 'number' && isFinite(flattenWorldOriginY)
            ? flattenWorldOriginY
            : logicalY;
    return logicalY * s + origin * (1 - s);
}

/** Live 0..1 mix for Event Horizon line→circle (lerps like flatten so zoom/day moves show conforming). */
let currentEhWarpConform = 1;
let currentTimeMarkerFlattenAmount = 0;
/** 0 = circadian helix fully wrapped/helical, 1 = fully straightened (lerps like currentFlattenAmount). */
let currentCircadianStraightenAmount = 0;
// flattenIntensity: 0–1 where 0 = no flatten, 1 = maximum flatten.
// Default to maximum flatten so the slider (0 = flattest, 1 = tallest) starts at the far left.
let flattenIntensity = 1;
/** UI 0 = circadian helix tight along time, 1 = spread; 0.5 → 1× natural calendar scale (see getCircadianHelixYStretchMult). */
let circadianHelixStretchSlider = 0.5;
/** Months from start of selected month to include STEs at zoom 8/9/0 (1 = current month only, 2 = current + next, …). */
let steWindowMonths = 2;
/** Event Horizon sphere half-span in calendar days (±N from selected). Default week. */
let eventHorizonHalfDays = 7;
/**
 * Outer half-span where LTE→disc warp fades to 0. Must be ≥ eventHorizonHalfDays
 * (warp never starts inside EH; length beyond = warpOuter − sphere).
 */
let eventHorizonWarpOuterHalfDays = 9;
/**
 * Event Horizon / Black Hole visual mode:
 *   nest   — Interstellar: STE inside / LTE outside + disc warp (current)
 *   inside — veil: markers/events/skies inside sphere; worldlines + orbits stay full
 *   off    — classic: no shell, no clip, no warp
 */
let eventHorizonMode = 'off';
const EVENT_HORIZON_MODES = ['nest', 'inside', 'off'];
/** Prior focusTargetOverride while Mode 2 forces Earth (undefined = none saved). */
let eventHorizonSavedFocusTarget = undefined;
const EH_HALF_DAYS_MIN = 1;
const EH_HALF_DAYS_MAX = 30;
try {
    if (typeof sessionStorage !== 'undefined') {
        const ehStored = parseInt(sessionStorage.getItem('circaevum.ehHalfDays'), 10);
        const woStored = parseInt(sessionStorage.getItem('circaevum.ehWarpOuterHalfDays'), 10);
        const modeStored = sessionStorage.getItem('circaevum.ehMode');
        if (!isNaN(ehStored)) {
            eventHorizonHalfDays = Math.max(EH_HALF_DAYS_MIN, Math.min(EH_HALF_DAYS_MAX, ehStored));
        }
        if (!isNaN(woStored)) {
            eventHorizonWarpOuterHalfDays = Math.max(
                eventHorizonHalfDays,
                Math.min(EH_HALF_DAYS_MAX, woStored)
            );
        } else {
            eventHorizonWarpOuterHalfDays = Math.min(
                EH_HALF_DAYS_MAX,
                Math.max(eventHorizonHalfDays, eventHorizonHalfDays + 2)
            );
        }
        if (modeStored && EVENT_HORIZON_MODES.indexOf(modeStored) >= 0) {
            eventHorizonMode = modeStored;
        }
    }
} catch (e) { /* private mode */ }
if (typeof window !== 'undefined') {
    window.getEventHorizonHalfDays = function () {
        return eventHorizonHalfDays;
    };
    window.getEventHorizonWarpOuterHalfDays = function () {
        return Math.max(eventHorizonHalfDays, eventHorizonWarpOuterHalfDays);
    };
    window.getEventHorizonWarpBeyondDays = function () {
        return Math.max(0, eventHorizonWarpOuterHalfDays - eventHorizonHalfDays);
    };
    window.getEventHorizonMode = function () {
        return eventHorizonMode;
    };
    window.isEventHorizonWarpEnabled = function () {
        return false;
    };
}
let focusTargetOverride = null; // 'sun' | 'earth' | 'mid' | 'moon' | null – null = use ZOOM_LEVELS default
/** When true (long-term event click), use day-number/day-name radial band for mid focus geometry (same as week view mid). */
let focusMidFromLongTermEventClick = false;
if (typeof window !== 'undefined') {
    /** Y scale applied to flattenableGroup (1 = no flatten). Used to keep event stagger visually consistent when flat. */
    window.getEventFlattenYScale = function () {
        return Math.max(0, 1 - currentFlattenAmount);
    };
    /** True only when marker + event timeline geometry are both flattened. */
    window.isFlattenTimeStraightenActive = function () { return flattenMode === 'all'; };
    /**
     * Flatten group / helix vertex pivot: sticky world origin while flatten-all is on.
     * Not selectedDateHeight — else A/D translates by unflattened year-height.
     */
    window.flattenTimelineFocusY = function () {
        if (
            flattenMode === 'all' &&
            typeof flattenWorldOriginY === 'number' &&
            isFinite(flattenWorldOriginY)
        ) {
            return flattenWorldOriginY;
        }
        if (typeof lastLogicalSelectedDateHeight === 'number' && isFinite(lastLogicalSelectedDateHeight)) {
            return lastLogicalSelectedDateHeight;
        }
        if (typeof targetFocusPoint !== 'undefined' && targetFocusPoint && typeof targetFocusPoint.y === 'number' && isFinite(targetFocusPoint.y)) {
            return targetFocusPoint.y;
        }
        return (typeof focusPoint !== 'undefined' && focusPoint && typeof focusPoint.y === 'number')
            ? focusPoint.y
            : 0;
    };
    window.getFlattenedSceneY = getFlattenedSceneY;
    /**
     * Vertical scale for the circadian (daily) helix vs selected time: compress or stretch span along the time axis.
     * Range ~0.2–1.8; 1.0 at slider midpoint. Does not affect the separate year-timeline flatten slider.
     */
    window.getCircadianHelixYStretchMult = function () {
        var t = circadianHelixStretchSlider;
        if (typeof t !== 'number' || isNaN(t)) t = 0.5;
        t = Math.min(1, Math.max(0, t));
        return 0.2 + t * 1.6;
    };
    /** Blended circadian geometry: short-event ribbons and orange helix morph with this (0–1). */
    window.getCircadianStraightenBlend = function () {
        return typeof currentCircadianStraightenAmount === 'number' ? currentCircadianStraightenAmount : 0;
    };
    /** 'day' | 'year' — filters sub-day event ribbons/dots at circadian zooms (see HUD toggle). */
    window.getCircadianShortEventScope = function () {
        return circadianShortEventScope === 'year' ? 'year' : 'day';
    };
    window.setCircadianShortEventScope = function (scope) {
        circadianShortEventScope = scope === 'year' ? 'year' : 'day';
        if (typeof syncCircadianShortEventScopeButtons === 'function') {
            syncCircadianShortEventScopeButtons();
        }
        if (typeof refreshEventLayersIfNeeded === 'function') {
            refreshEventLayersIfNeeded(true);
        } else if (typeof window.circaevumGL !== 'undefined' && window.circaevumGL &&
            typeof window.circaevumGL.refreshAllEventLayers === 'function') {
            try {
                window.circaevumGL.refreshAllEventLayers();
            } catch (e) { /* GL may be disposing */ }
        }
    };
    window.getCircadianShortEventsShiftPreview = function () {
        return !!circadianShortEventsShiftPreview && !modifierMetaHeld;
    };
    window.getSteWindowMonths = function () { return steWindowMonths; };
    function metaModifierFromKeyboardEvent(e) {
        if (!e) return false;
        return !!(e.metaKey || (typeof e.getModifierState === 'function' && e.getModifierState('Meta')));
    }
    function shiftModifierFromKeyboardEvent(e) {
        if (!e || typeof e.getModifierState !== 'function') return false;
        return e.getModifierState('Shift');
    }
    /** Derive Shift peek from live modifier state (⌘/Meta suppresses for screenshots). */
    window.applyCircadianShiftPreviewFromModifiers = function (e) {
        if (!e) return;
        const meta = metaModifierFromKeyboardEvent(e);
        const shift = shiftModifierFromKeyboardEvent(e);
        let changed = false;
        if (meta !== modifierMetaHeld) {
            modifierMetaHeld = meta;
            changed = true;
        }
        const wantPreview = shift && !meta;
        if (wantPreview !== circadianShortEventsShiftPreview) {
            circadianShortEventsShiftPreview = wantPreview;
            changed = true;
        }
        if (changed) refreshShiftPreviewScene();
    };
    window.setCircadianShortEventsShiftPreview = function (active) {
        if (active && modifierMetaHeld) return;
        const next = !!active;
        if (next === circadianShortEventsShiftPreview) return;
        circadianShortEventsShiftPreview = next;
        refreshShiftPreviewScene();
    };
    /** @deprecated use applyCircadianShiftPreviewFromModifiers */
    window.syncCircadianShiftPreviewModifiers = function (e) {
        window.applyCircadianShiftPreviewFromModifiers(e);
    };
    window.setCircadianShiftPreviewMetaHeld = function (held) {
        window.applyCircadianShiftPreviewFromModifiers({
            metaKey: !!held,
            shiftKey: false,
            getModifierState: function (key) { return key === 'Meta' ? !!held : false; }
        });
    };
    function refreshShiftPreviewScene() {
        if (typeof refreshEventLayersIfNeeded === 'function') {
            refreshEventLayersIfNeeded(true);
        } else {
            const gl = window.circaevumGL;
            if (gl && typeof gl.refreshAllEventLayers === 'function') {
                try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
            }
        }
        if (typeof TimeseriesRenderer !== 'undefined' && typeof TimeseriesRenderer.resetRefreshCache === 'function') {
            TimeseriesRenderer.resetRefreshCache();
        }
        // Shift expands event display to parent window only — sphere size / camera stay put.
    }
    /** Console: debugShortEventRender('edge-esmeralda-2026') — counts filters before GPU meshes. */
    window.debugShortEventRender = function (layerId) {
        const gl = window.circaevumGL || (window.getGL && window.getGL());
        if (!gl || typeof EventRenderer === 'undefined' ||
            typeof EventRenderer.getShortEventRenderDiagnostics !== 'function') {
            return { error: 'GL or EventRenderer not ready' };
        }
        const id = layerId || 'edge-esmeralda-2026';
        const events = typeof gl.getEvents === 'function' ? gl.getEvents(id) : [];
        const diag = EventRenderer.getShortEventRenderDiagnostics(events, id);
        const timelineFilter = typeof gl.getTimelineEventFilter === 'function'
            ? gl.getTimelineEventFilter()
            : null;
        const out = Object.assign({ timelineEventFilter: timelineFilter }, diag);
        console.log('[short-event render]', out);
        return out;
    };
    window.getCircaevumLightMode = function () {
        return !!isLightMode;
    };
    window.getAppearanceTheme = function () {
        return typeof appearanceTheme === 'string' ? appearanceTheme : 'dark';
    };
    window.getCircadianHelixVisualStyle = function () {
        if (isLightMode) {
            return {
                helixColor: 0xd97706,
                helixOpacity: 0.9,
                markerMonth: 0x1d4ed8,
                markerWeek: 0x5b21b6,
                markerOpacity: 0.95,
                markerWeekOpacity: 0.85
            };
        }
        return {
            helixColor: 0xffb347,
            helixOpacity: 0.82,
            markerMonth: 0x7dd3fc,
            markerWeek: 0xc4b5fd,
            markerOpacity: 0.92,
            markerWeekOpacity: 0.8
        };
    };
}

// WebXR controls (using adapter system)
let xrAdapter = null;
let xrInputAdapter = null;
let xrUI = null;
let xrDomQuad = null;
let xrDomQuadTexture = null;
let xrDomQuadRefreshId = null;
/** XR panel: how many calendar steps A/D-equivalent moves apply per press (1–8). */
let xrTimeScale = 1;
const XR_TIME_SCALE_MIN = 1;
const XR_TIME_SCALE_MAX = 8;
/** Camera used to render the solar system to the window texture in XR windowed mode (same logic as 2D view). */
let contentCamera = null;

/**
 * Month/lunar zoom (5/6): map a wall date to week row within anchor calendar month.
 * Anchor month = month with most days (4+) in the Sunday-start week containing the date.
 */
function monthZoomWeekStateFromDate(selectedDate, referenceNow) {
    const now = referenceNow || new Date();
    const actualYear = now.getFullYear();
    const actualMonth = now.getMonth();
    const selectedDayOfWeek = selectedDate.getDay();

    const selSunday = new Date(selectedDate);
    selSunday.setDate(selectedDate.getDate() - selectedDayOfWeek);
    selSunday.setHours(0, 0, 0, 0);

    const monthCounts = new Map();
    for (let d = 0; d < 7; d++) {
        const day = new Date(selSunday);
        day.setDate(selSunday.getDate() + d);
        const key = day.getFullYear() * 12 + day.getMonth();
        monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    }

    let anchorKey = selectedDate.getFullYear() * 12 + selectedDate.getMonth();
    let bestCount = 0;
    for (const [key, count] of monthCounts) {
        if (count > bestCount) {
            bestCount = count;
            anchorKey = key;
        }
    }

    const anchorYear = Math.floor(anchorKey / 12);
    const anchorMonth = anchorKey % 12;
    const totalSystemMonths = actualYear * 12 + actualMonth;
    const selectedWeekOffset = anchorKey - totalSystemMonths;

    const firstOfMonth = new Date(anchorYear, anchorMonth, 1);
    const firstSunday = new Date(anchorYear, anchorMonth, 1 - firstOfMonth.getDay());
    firstSunday.setHours(0, 0, 0, 0);

    const daysFromFirstSunday = Math.floor((selSunday - firstSunday) / (1000 * 60 * 60 * 24));
    let currentWeekInMonth = Math.floor(daysFromFirstSunday / 7);
    currentWeekInMonth = Math.max(0, Math.min(5, currentWeekInMonth));

    return {
        selectedWeekOffset,
        currentWeekInMonth,
        currentDayInWeek: selectedDayOfWeek,
        anchorYear,
        anchorMonth
    };
}

// Function to convert a selected date to a specific zoom level's offset system
// This maintains selected time when switching between zoom levels
function applySelectedDateToZoomLevel(selectedDate, targetZoomLevel) {
    const now = new Date();
    const actualYear = now.getFullYear();
    const actualMonth = now.getMonth();
    const actualDayInWeek = now.getDay();
    const actualHour = now.getHours();
    
    const selectedYear = selectedDate.getFullYear();
    const selectedMonth = selectedDate.getMonth();
    const selectedDay = selectedDate.getDate();
    const selectedDayOfWeek = selectedDate.getDay();
    const selectedHour = selectedDate.getHours();
    
    switch(targetZoomLevel) {
        case 1: // Century view - preserve exact selected year
            currentYear = selectedYear;
            currentMonthInYear = selectedMonth;
            currentDayOfMonth = selectedDay;
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
            
        case 2: // Decade view
            currentYear = selectedYear;
            currentMonthInYear = selectedMonth;
            currentDayOfMonth = selectedDay;
            const decadeStart = selectedYear - (selectedYear % 10);
            selectedDecadeOffset = Math.floor((selectedYear - decadeStart) / 10);
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
            
        case 3: // Year view - navigate by quarters
            selectedYearOffset = selectedYear - actualYear;
            // Calculate which quarter the selected month is in
            currentQuarter = Math.floor(selectedMonth / 3);
            currentMonthInYear = selectedMonth; // Full month index (0-11)
            currentMonth = selectedMonth % 3; // Month within quarter (0-2)
            currentDayOfMonth = selectedDay;
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
            
        case 4: // Quarter view - navigate by months
            // Calculate selected quarter
            const systemQuarter = Math.floor(actualMonth / 3);
            const selectedQuarter = Math.floor(selectedMonth / 3);
            const selectedQuarterYear = selectedYear;
            const systemQuarterYear = actualYear;
            
            // Calculate quarter offset (quarters since system quarter)
            const totalSystemQuarters = systemQuarterYear * 4 + systemQuarter;
            const totalSelectedQuarters = selectedQuarterYear * 4 + selectedQuarter;
            selectedQuarterOffset = totalSelectedQuarters - totalSystemQuarters;
            
            // Calculate month within quarter (0-2)
            currentMonth = selectedMonth % 3;
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
            
        case 5: // Month view — navigate by weeks within calendar month
        case 6: // Lunar-cycle zoom — same calendar week grid as month (no separate lunar epoch)
            {
            const weekState = monthZoomWeekStateFromDate(selectedDate, now);
            selectedWeekOffset = weekState.selectedWeekOffset;
            currentWeekInMonth = weekState.currentWeekInMonth;
            currentDayInWeek = weekState.currentDayInWeek;
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            }
            break;
            
        case 7: // Week view - navigate by days
            // Calculate week offset (weeks since system week)
            const currentSunday = new Date(now);
            currentSunday.setDate(now.getDate() - actualDayInWeek);
            currentSunday.setHours(0, 0, 0, 0);
            
            const selectedSunday = new Date(selectedDate);
            selectedSunday.setDate(selectedDate.getDate() - selectedDayOfWeek);
            selectedSunday.setHours(0, 0, 0, 0);
            
            const daysBetween = Math.floor((selectedSunday - currentSunday) / (1000 * 60 * 60 * 24));
            selectedDayOffset = Math.floor(daysBetween / 7);
            
            // Day within week (0-6, where 0 is Sunday)
            currentDayInWeek = selectedDayOfWeek;
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
            
        case 0: // Landing camera view (shares day/hour selection model)
        case 8: // Day view
        case 9: // Clock view
            // Calculate day offset
            const currentMidnight = new Date(now);
            currentMidnight.setHours(0, 0, 0, 0);
            const selectedMidnight = new Date(selectedDate);
            selectedMidnight.setHours(0, 0, 0, 0);
            
            const daysOffset = Math.floor((selectedMidnight - currentMidnight) / (1000 * 60 * 60 * 24));
            // selectedHourOffset represents days (not hours) - it's multiplied by dayHeight later
            selectedHourOffset = daysOffset;
            
            // Hour within day
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
    }
}

/** Month (5), landing (0), week (7), day (8), clock (9): circadian helix, short-event ribbons. */
function isCircadianHelixZoom(zl) {
    return zl === 0 || zl === 5 || zl === 7 || zl === 8 || zl === 9;
}

/** Century (1) through clock (9): F / flatten slider. Moment (0) stays polar, no flatten. */
function isTimelineFlattenZoom(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? zl : currentZoom;
    return z >= 1;
}

/** Day (8), clock (9), landing (0): circadian defaults to on when entering zoom (user can still cycle off). */
function isCircadianDefaultOnZoom(zl) {
    return zl === 0 || zl === 8 || zl === 9;
}

function syncCircadianToggleUi() {
    const btn = document.getElementById('circadian-toggle');
    if (!btn) return;
    btn.classList.toggle('active', circadianState !== 'off');
    const titles = {
        off: 'Circadian worldline: off',
        straightened: 'Circadian worldline: straightened',
        wrapped: 'Circadian worldline: wrapped'
    };
    const title = titles[circadianState] || titles.off;
    btn.title = title;
    btn.setAttribute('aria-label', title);
}

/** Turn circadian on (wrapped) when entering zoom 0 / 8 / 9 if it was off. */
function ensureCircadianOnForZoom(zl) {
    if (!isCircadianDefaultOnZoom(zl) || circadianState !== 'off') return;
    circadianState = 'wrapped';
    syncCircadianToggleUi();
}

/** How many calendar days the orange helix spans (centered on selected time). */
function circadianSpanDaysForZoom(zl) {
    if (zl === 9) return 1;
    if (zl === 8) return 2;
    if (zl === 7) return 7;
    if (zl === 5) return 14;
    if (zl === 0) return 2;
    return 2;
}

// Format a date for display
function formatDateTime(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${year} ${hours}:${mins}`;
}

/** Orbital panel: local wall time + UTC in brackets (matches scene clock at default observer). */
function formatDateTimeWithUtc(date) {
    const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    const local = formatDateTime(d);
    const uh = d.getUTCHours().toString().padStart(2, '0');
    const um = d.getUTCMinutes().toString().padStart(2, '0');
    return local + ' [' + uh + ':' + um + ' UTC]';
}

// Calculate the selected date/time based on navigation variables and current zoom level
function getSelectedDateTime() {
    const now = new Date();
    const selected = new Date(now);
    const actualYear = now.getFullYear();
    const actualMonth = now.getMonth();
    const actualDayInWeek = now.getDay();
    const actualHour = now.getHours();
    
    // Apply offsets based on current zoom level
    switch(currentZoom) {
        case 1: // Century view - year + stored month/day/clock
        case 2: // Decade view — same (A/D changes year only)
            {
            const y = currentYear;
            const m = currentMonthInYear != null && !isNaN(currentMonthInYear)
                ? currentMonthInYear
                : selected.getMonth();
            const lastDom = new Date(y, m + 1, 0).getDate();
            const dim = currentDayOfMonth != null && !isNaN(currentDayOfMonth)
                ? currentDayOfMonth
                : selected.getDate();
            selected.setFullYear(y, m, Math.max(1, Math.min(dim, lastDom)));
            selected.setHours(currentHourInDay, selectedMinuteInHour, 0, 0);
            }
            break;
            
        case 3: {
            // Full calendar date (day + clock) so ephemeris / Earth move smoothly within the year, not in monthly jumps.
            const y = actualYear + selectedYearOffset;
            const m = currentMonthInYear;
            const dim =
                currentDayOfMonth != null && !isNaN(currentDayOfMonth)
                    ? currentDayOfMonth
                    : selected.getDate();
            const lastDom = new Date(y, m + 1, 0).getDate();
            const dom = Math.max(1, Math.min(dim, lastDom));
            selected.setFullYear(y, m, dom);
            selected.setHours(currentHourInDay, selectedMinuteInHour, 0, 0);
            break;
        }
            
        case 4: // Quarter view - selectedQuarterOffset + currentMonth
            // currentMonth is 0-2 (month within quarter), selectedQuarterOffset is quarter offset
            // Calculate the absolute selected month
            const systemQuarter = Math.floor(actualMonth / 3); // Current quarter (0-3)
            const selectedQuarter = systemQuarter + selectedQuarterOffset;
            const selectedAbsoluteMonth = (selectedQuarter * 3) + currentMonth;
            // Handle year rollover for months outside 0-11
            const yearAdjust4 = Math.floor(selectedAbsoluteMonth / 12);
            const adjustedMonth4 = ((selectedAbsoluteMonth % 12) + 12) % 12;
            selected.setFullYear(actualYear + yearAdjust4);
            selected.setMonth(adjustedMonth4);
            break;
            
        case 5: // Month view — selectedWeekOffset + currentWeekInMonth + currentDayInWeek
        case 6: // Lunar zoom — same date reconstruction as month
            {
            const targetMonth = actualMonth + selectedWeekOffset;
            const targetYear = actualYear + Math.floor(targetMonth / 12);
            const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
            selected.setFullYear(targetYear);
            selected.setMonth(targetMonthIndex);

            const firstOfSelectedMonth = new Date(targetYear, targetMonthIndex, 1);
            const firstSundayOffsetM = -firstOfSelectedMonth.getDay();
            const firstSunday = new Date(targetYear, targetMonthIndex, 1 + firstSundayOffsetM);

            const daysToAdd = (currentWeekInMonth * 7) + currentDayInWeek;
            selected.setTime(firstSunday.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
            selected.setHours(currentHourInDay, selectedMinuteInHour, 0, 0);
            }
            break;
            
        case 7: // Week view - selectedDayOffset + currentDayInWeek
            // Calculate the actual selected date:
            // 1. Start from current date
            // 2. Go to Sunday of current week: subtract actualDayInWeek days
            // 3. Go to Sunday of selected week: add (selectedDayOffset * 7) days
            // 4. Go to selected day within that week: add currentDayInWeek days
            const sundayOfCurrentWeek = now.getDate() - actualDayInWeek;
            const sundayOfSelectedWeek = sundayOfCurrentWeek + (selectedDayOffset * 7);
            const selectedDay7 = sundayOfSelectedWeek + currentDayInWeek;
            selected.setDate(selectedDay7);
            selected.setHours(currentHourInDay, selectedMinuteInHour, 0, 0);
            break;
            
        case 0: // Landing camera view (shares day/hour selection model)
        case 8: // Day view
        case 9: // Clock view
            const hourDiff = currentHourInDay - actualHour;
            selected.setHours(selected.getHours() + hourDiff + (selectedHourOffset * 24));
            selected.setMinutes(selectedMinuteInHour, 0, 0);
            break;
            
        default:
            // For other zoom levels, apply general offsets
            selected.setFullYear(selected.getFullYear() + selectedYearOffset);
            break;
    }
    
    return selected;
}

if (typeof window !== 'undefined') {
    window.isMoonWorldlineVisibleAtZoom = isMoonWorldlineVisibleAtZoom;
    window.ensureSunDirectionalLight = ensureSunDirectionalLight;
    window.updateSunLightingTowardEarth = updateSunLightingTowardEarth;
    window.getSelectedDateTime = getSelectedDateTime;
    window.setZoomLevel = setZoomLevel;
    window.setSelectedDateTime = setSelectedDateTime;
    window.createPlanets = createPlanets;
    window.onOrbitalDataVisibilityChange = function(visible) {
        if (typeof createPlanets === 'function' && typeof currentZoom !== 'undefined') {
            createPlanets(currentZoom);
        }
    };
}

/**
 * Earth orbital radius W used to convert marker-band radii → Sun→Earth focus frac.
 */
function getEarthOrbitDistanceForFocus() {
    const mesh =
        typeof planetMeshes !== 'undefined' && planetMeshes
            ? planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth')
            : null;
    if (mesh && typeof mesh.userData.distance === 'number' && mesh.userData.distance > 0) {
        return mesh.userData.distance;
    }
    const earth =
        typeof PLANET_DATA !== 'undefined' && PLANET_DATA
            ? PLANET_DATA.find((p) => p && p.name === 'Earth')
            : null;
    return earth && typeof earth.distance === 'number' && earth.distance > 0 ? earth.distance : 50;
}

/** Midpoint of an annulus as a fraction of Earth orbit distance W. */
function radialFracFromMarkerBand(inner, outer, W) {
    if (!(W > 0)) return 0.5;
    if (typeof inner === 'number' && typeof outer === 'number' && isFinite(inner) && isFinite(outer)) {
        return ((inner + outer) * 0.5) / W;
    }
    if (typeof outer === 'number' && isFinite(outer)) return outer / W;
    if (typeof inner === 'number' && isFinite(inner)) return inner / W;
    return 0.5;
}

/**
 * Radial position along Sun→Earth for camera "mid" focus.
 * Zoom 4 (Quarter): center of month time-marker band.
 * Zoom 5 (Month): center of week time-marker band.
 * Zoom 6 (Lunar): center of month time-marker band.
 * Zoom 7 (Week): center of day time-marker band.
 * Day/clock / long-term event nav: day number↔day-name mid (classic 21/32–23/32).
 * Uses live TimeMarkers radii so singular-band + classic onion both land correctly.
 */
function getFocusMidRadialFrac(zoomLevel) {
    const W = getEarthOrbitDistanceForFocus();
    // Classic onion fallbacks (match RADII_CONFIG in timemarker-renderer).
    const classicMonthMidFrac = (1 / 4 + 1 / 2) / 2; // month inner–outer
    const classicWeekMidFrac = (1 / 2 + 5 / 8) / 2; // week inner–outer
    const classicDayAnnulusMidFrac = (5 / 8 + 3 / 4) / 2; // day inner–outer
    const classicDayLabelMidFrac = (21 / 32 + 23 / 32) / 2; // day number ↔ day name

    let zones = null;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
        try {
            zones = TimeMarkers.getCanonicalRadialZones(W);
        } catch (e) {
            zones = null;
        }
    }

    function dayLabelMidFrac() {
        if (
            zones &&
            zones.day &&
            typeof zones.day.label === 'number' &&
            typeof zones.day.dayName === 'number'
        ) {
            return ((zones.day.label + zones.day.dayName) * 0.5) / W;
        }
        if (zones && zones.day) {
            return radialFracFromMarkerBand(zones.day.inner, zones.day.outer, W);
        }
        return classicDayLabelMidFrac;
    }

    if (focusMidFromLongTermEventClick) return dayLabelMidFrac();

    // Quarter: camera mid in the month marker annulus.
    if (zoomLevel === 4) {
        if (zones && zones.month) {
            return radialFracFromMarkerBand(zones.month.inner, zones.month.outer, W);
        }
        return classicMonthMidFrac;
    }

    // Month view: center on week time markers (not the month band).
    if (zoomLevel === 5) {
        if (zones && zones.week) {
            return radialFracFromMarkerBand(zones.week.inner, zones.week.outer, W);
        }
        return classicWeekMidFrac;
    }

    // Lunar: camera mid in the month marker annulus.
    if (zoomLevel === 6) {
        if (zones && zones.month) {
            return radialFracFromMarkerBand(zones.month.inner, zones.month.outer, W);
        }
        return classicMonthMidFrac;
    }

    // Week zoom: center on day time markers (not the week band).
    if (zoomLevel === 7) {
        if (zones && zones.day) {
            return radialFracFromMarkerBand(zones.day.inner, zones.day.outer, W);
        }
        return classicDayAnnulusMidFrac;
    }

    if (zoomLevel === 8 || zoomLevel === 9 || zoomLevel === 0) {
        return dayLabelMidFrac();
    }

    return 0.5;
}

/** Sun–Earth “mid” override stays valid at these zooms (incl. week/day/clock where the day band is defined). */
function keepMidFocusOverrideAtZoom(zl) {
    if (focusMidFromLongTermEventClick) return true;
    if (zl >= 4 && zl <= 9) return true;
    if (zl === 0) return true;
    return false;
}

/** Week/day zoom: camera focus cycles Earth ↔ mid only (no Sun). */
function focusSunAllowedAtZoom(zl) {
    return zl !== 7 && zl !== 8;
}

if (typeof window !== 'undefined') {
    window.setNavigateLongTermEventFocus = function (enabled) {
        focusMidFromLongTermEventClick = !!enabled;
    };
}

// Update the time displays in the info panel
function updateTimeDisplays() {
    const now = new Date();
    const selected = getSelectedDateTime();
    
    const currentTimeEl = document.getElementById('current-time');
    const selectedTimeEl = document.getElementById('selected-time');
    const facingTimeEl = document.getElementById('camera-facing-time');
    const ephemerisDebugEl = document.getElementById('ephemeris-debug');
    
    if (currentTimeEl) {
        currentTimeEl.textContent = formatDateTimeWithUtc(now);
    }
    if (selectedTimeEl) {
        selectedTimeEl.textContent = formatDateTimeWithUtc(selected);
    }
    if (facingTimeEl) {
        facingTimeEl.textContent = getCameraTemporalFacingText();
    }
    if (ephemerisDebugEl) {
        ephemerisDebugEl.textContent = getEphemerisDebugText(selected);
    }
}

function getCameraTemporalFacingText() {
    if (typeof THREE === 'undefined' || !focusPoint) return '--';
    const inXRWindowed = xrAdapter && xrAdapter.isPresenting() && xrAdapter.windowedMode;
    const cam = (inXRWindowed && contentCamera) ? contentCamera : camera;
    if (!cam || !cam.position) return '--';
    const toFocus = new THREE.Vector3().subVectors(focusPoint, cam.position);
    if (toFocus.lengthSq() < 1e-10) return '--';
    toFocus.normalize();
    if (toFocus.y > 0.12) return 'Future ↑';
    if (toFocus.y < -0.12) return 'Past ↓';
    return 'Lateral ↔';
}

function normalizeSelectedDateForEphemeris(selectedDate, currentDateHeight, selectedDateHeight) {
    // Selected calendar time is already the authoritative reference.
    // Do not remap it through height->date here, or it can drift toward wall-clock "now".
    if (!(selectedDate instanceof Date) || isNaN(selectedDate.getTime())) return new Date();
    return selectedDate;
}

function getEphemerisDebugText(selectedDate) {
    try {
        if (typeof window === 'undefined' || !window.CircaevumAstro || typeof window.CircaevumAstro.getStatus !== 'function') return 'off';
        const status = window.CircaevumAstro.getStatus();
        if (!status || !status.enabled) return 'off';
        if (typeof window.CircaevumAstro.getHeliocentricPositionAtDate !== 'function') return 'on';
        const earth = window.CircaevumAstro.getHeliocentricPositionAtDate('Earth', selectedDate);
        const mars = window.CircaevumAstro.getHeliocentricPositionAtDate('Mars', selectedDate);
        if (!earth || !mars) return 'on';
        const sunToEarth = earth;
        const sunToMars = mars;
        const earthToSun = { x: -earth.x, y: -earth.y, z: -earth.z };
        const earthToMars = { x: mars.x - earth.x, y: mars.y - earth.y, z: mars.z - earth.z };
        const angHelio = angleDegBetween(sunToEarth, sunToMars);
        const angOpp = angleDegBetween(earthToSun, earthToMars);
        const residual = Math.abs(180 - angOpp);
        const provider = status.activeProvider === 'astronomy-engine' ? 'AE' : 'FB';
        return provider + ' helio=' + angHelio.toFixed(1) + ' opp=' + angOpp.toFixed(1) + ' d=' + residual.toFixed(1);
    } catch (e) {
        return 'debug err';
    }
}

function angleDegBetween(a, b) {
    const am = Math.hypot(a.x, a.y, a.z) || 1;
    const bm = Math.hypot(b.x, b.y, b.z) || 1;
    const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (am * bm);
    const c = Math.max(-1, Math.min(1, dot));
    return Math.acos(c) * 180 / Math.PI;
}

let ghostEarth = null; // Ghost version of Earth at current/actual position
let ghostOrbitLine = null; // Ghost version of orbit line
let targetCameraUp = null; // Target camera up vector - initialized in initScene
let currentCameraUp = null; // Current camera up vector - initialized in initScene
let targetCameraPosition = null; // Target camera position offset - initialized in initScene
let polarViewDir = null; // Unit offset focus→camera in polar zooms; updated by drag, not rebuilt from scratch
let needPolarOrbitInit = true; // After non-polar → polar, seed polarViewDir from camera or default
let forcePolarDefaultOnInit = false; // Force default Earth-pole entry orientation on zoom handoff
let isPolarView = false; // Track if in polar view mode
if (typeof window !== 'undefined') {
    window.requestCircaevumPolarReseed = function () {
        needPolarOrbitInit = true;
    };
}
/** Scene Z roll (R key) in radians; scene.rotation.z eases toward this so the pivot is animated. */
let sceneRollTargetRad = 0;
const sceneRollSmoothSpeed = 0.16;

function isEarthZoomRig(zoomLevel) {
    // Keep Earth zoom rig on 9/0 for now; 8 stays on legacy orbit controls
    // until dedicated handoff tuning is complete.
    return zoomLevel === 9 || zoomLevel === 0;
}

// Initialize scene
function initScene() {
    // Use SceneCore.initScene if available, otherwise fallback to local implementation
    if (typeof SceneCore !== 'undefined' && SceneCore.initScene) {
        // Initialize THREE.Vector3 objects now that THREE is loaded
        focusPoint = new THREE.Vector3(0, 0, 0);
        targetFocusPoint = new THREE.Vector3(0, 0, 0);
        targetCameraUp = new THREE.Vector3(0, 1, 0);
        currentCameraUp = new THREE.Vector3(0, 1, 0);
        targetCameraPosition = new THREE.Vector3(0, 0, 0);
        polarViewDir = new THREE.Vector3(0, -1, 0);
        
        // Call SceneCore.initScene which will set scene, camera, renderer, etc. on window
        SceneCore.initScene({
            THREE: THREE,
            SCENE_CONFIG: SCENE_CONFIG,
            getHeightForYear: getHeightForYear,
            currentYear: currentYear
        });
        
        // Sync our stars reference with SceneCore's (so we remove the right one when recreating)
        if (typeof window.stars !== 'undefined') stars = window.stars;
        flattenableGroup = new THREE.Group();
        sceneContentGroup.add(flattenableGroup);
        timeMarkersGroup = new THREE.Group();
        sceneContentGroup.add(timeMarkersGroup);
    } else {
        // Fallback: original implementation (should not be needed if SceneCore is loaded)
        console.warn('SceneCore not available, using fallback initScene');
        focusPoint = new THREE.Vector3(0, 0, 0);
        targetFocusPoint = new THREE.Vector3(0, 0, 0);
        targetCameraUp = new THREE.Vector3(0, 1, 0);
        currentCameraUp = new THREE.Vector3(0, 1, 0);
        targetCameraPosition = new THREE.Vector3(0, 0, 0);
        polarViewDir = new THREE.Vector3(0, -1, 0);
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);
        sceneContentGroup = new THREE.Group();
        scene.add(sceneContentGroup);
        flattenableGroup = new THREE.Group();
        sceneContentGroup.add(flattenableGroup);
        timeMarkersGroup = new THREE.Group();
        sceneContentGroup.add(timeMarkersGroup);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
        const currentYearHeight = getHeightForYear(currentYear, 1);
        camera.position.set(0, currentYearHeight + 400, 800);
        scene.add(camera);
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        const fbSize =
            typeof getCircaevumViewportSize === 'function'
                ? getCircaevumViewportSize()
                : { width: window.innerWidth, height: window.innerHeight };
        renderer.setSize(fbSize.width, fbSize.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.xr.enabled = true;
        document.getElementById('canvas-container').appendChild(renderer.domElement);
        const ambientLight = new THREE.AmbientLight(
            SCENE_CONFIG.ambientLightColor != null ? SCENE_CONFIG.ambientLightColor : 0x9eb4cf,
            SCENE_CONFIG.ambientLightIntensity != null ? SCENE_CONFIG.ambientLightIntensity : 0.34
        );
        scene.add(ambientLight);
        const currentDateHeight = getHeightForYear(currentYear, 1);
        const sunIllum =
            SCENE_CONFIG.sunLightColor != null ? SCENE_CONFIG.sunLightColor : 0xfff9f2;
        const pointInt =
            SCENE_CONFIG.sunPointLightIntensity != null ? SCENE_CONFIG.sunPointLightIntensity : 1.15;
        sunLight = new THREE.PointLight(sunIllum, pointInt, 5000);
        sunLight.position.set(0, currentDateHeight, 0);
        sceneContentGroup.add(sunLight);
        ensureSunDirectionalLight();
        updateSunLightingTowardEarth();
        createStarField();
        const sunGeometry = new THREE.SphereGeometry(SCENE_CONFIG.sunSize, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: SCENE_CONFIG.sunColor });
        sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        sunMesh.position.set(0, currentDateHeight, 0);
        sceneContentGroup.add(sunMesh);
        const glowGeometry = new THREE.SphereGeometry(SCENE_CONFIG.sunGlowSize, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({ color: SCENE_CONFIG.sunColor, transparent: true, opacity: 0.3 });
        sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        sunGlow.position.set(0, currentDateHeight, 0);
        sceneContentGroup.add(sunGlow);
        createSunWorldline();
        window.addEventListener('resize', () => {
            if (typeof resizeCircaevumViewport === 'function') {
                resizeCircaevumViewport();
            } else if (camera && renderer) {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
        });
    }
}

// Create the Sun's worldline (vertical axis through time)
// Note: This function is kept for backward compatibility but delegates to SceneCore
function createSunWorldline() {
    if (typeof SceneCore !== 'undefined' && SceneCore.createSunWorldline) {
        SceneCore.createSunWorldline({
            THREE: THREE,
            SCENE_CONFIG: SCENE_CONFIG,
            getHeightForYear: getHeightForYear,
            flattenableGroup: flattenableGroup
        });
    } else {
        // Fallback: validate before creating geometry
        const startHeight = getHeightForYear(2000, 1);
        const endHeight = getHeightForYear(2100, 1);
        
        if (isNaN(startHeight) || isNaN(endHeight)) {
            console.warn('createSunWorldline: getHeightForYear returned NaN, skipping');
            return;
        }
        
        const points = [
            0, startHeight, 0,
            0, endHeight, 0
        ];
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        
        const material = new THREE.LineBasicMaterial({
            color: SCENE_CONFIG.sunColor,
            transparent: true,
            opacity: 0.4,
            linewidth: 1
        });
        
        const sunWorldline = new THREE.Line(geometry, material);
        (flattenableGroup || sceneContentGroup).add(sunWorldline);
    }
}

function createStarField() {
    // Remove any existing star field (ours or SceneCore's) so we never have duplicates or huge XR stars
    if (stars) {
        sceneContentGroup.remove(stars);
        stars = null;
    }
    const toRemove = sceneContentGroup.children.filter(function (c) { return c.type === 'Points'; });
    toRemove.forEach(function (p) { sceneContentGroup.remove(p); });
    
    // Don't show stars in Century view (too far out)
    if (currentZoom === 1) {
        return;
    }
    
    const starGeometry = new THREE.BufferGeometry();
    // Fixed size (no distance attenuation) so stars stay consistent in 2D and XR and never blow up
    const starMaterial = new THREE.PointsMaterial({
        color: isLightMode ? 0x333333 : 0x8ecae6,
        size: 1.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: isLightMode ? 0.3 : 0.8
    });
    if (typeof CircaevumWebGPUPipeline !== 'undefined' && typeof CircaevumWebGPUPipeline.applyGPUStarfieldNode === 'function') {
        CircaevumWebGPUPipeline.applyGPUStarfieldNode(starMaterial);
    }
    
    const starVertices = [];
    // Center stars vertically around year 2050 (height 5000)
    const centuryMidHeight = getHeightForYear(2050, 1);
    
    for (let i = 0; i < SCENE_CONFIG.starCount; i++) {
        const x = (Math.random() - 0.5) * SCENE_CONFIG.starFieldSize;
        // Spread stars vertically across the full century range
        const y = centuryMidHeight + (Math.random() - 0.5) * SCENE_CONFIG.starFieldHeight;
        const z = (Math.random() - 0.5) * SCENE_CONFIG.starFieldSize;
        starVertices.push(x, y, z);
    }
    
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    stars = new THREE.Points(starGeometry, starMaterial);
    sceneContentGroup.add(stars);
}

/** Wall-clock fraction for selected time (matches event-renderer circadian disk placement). */
function selectedDateHourFraction(d) {
    if (!d || isNaN(d.getTime())) return 0;
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3600000;
}

/**
 * Orbital reference + selected-time heights (shared by createPlanets and light time-scrub updates).
 */
function computeSceneDateHeights(zoomLevel) {
    // Phase zero is always wall-clock now (`startAngle` epoch). Zoom must not
    // substitute navigated year/month or selected height — that puts helices
    // 180° from Selected Earth after A/D years then zoom-in.
    let currentDateHeight = typeof getOrbitPhaseReferenceHeight === 'function'
        ? getOrbitPhaseReferenceHeight()
        : (typeof calculateActualCurrentDateHeight === 'function'
            ? calculateActualCurrentDateHeight()
            : calculateCurrentDateHeight());

    if (isNaN(currentDateHeight)) {
        console.error('computeSceneDateHeights: currentDateHeight is NaN, using fallback');
        currentDateHeight = 2500;
    }

    const selectedDate = getSelectedDateTime();
    let selectedDateHeight = calculateDateHeight(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        selectedDateHourFraction(selectedDate)
    );

    if (isNaN(selectedDateHeight)) {
        console.error('computeSceneDateHeights: selectedDateHeight is NaN, using currentDateHeight as fallback', {
            year: selectedDate.getFullYear(),
            month: selectedDate.getMonth(),
            day: selectedDate.getDate(),
            hour: selectedDate.getHours()
        });
        selectedDateHeight = currentDateHeight;
    }

    const selectedHeightOffset = selectedDateHeight - currentDateHeight;
    return { currentDateHeight, selectedDateHeight, selectedHeightOffset, selectedDate };
}

if (typeof window !== 'undefined') {
    window.computeSceneDateHeights = computeSceneDateHeights;
    window.getPlanetXZAtSelectedDate = getPlanetXZAtSelectedDate;
    window.sceneDateHeightForInstant = sceneDateHeightForInstant;
    window.earthOrbitAngleForSceneDate = earthOrbitAngleForSceneDate;
}

/**
 * Circadian daily disks: orbit phase from wall-clock now (currentDateHeight),
 * timeline Y + Earth XZ from navigation (selected).
 */
function getCircadianSceneTimeContext() {
    if (typeof currentZoom === 'undefined') {
        return null;
    }
    try {
        const { currentDateHeight, selectedDateHeight, selectedDate } = computeSceneDateHeights(currentZoom);
        const earth = typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p.name === 'Earth') : null;
        let earthX = 0;
        let earthZ = 0;
        if (earth && typeof getPlanetXZAtSelectedDate === 'function') {
            const xz = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            if (xz && !isNaN(xz.x) && !isNaN(xz.z)) {
                earthX = xz.x;
                earthZ = xz.z;
            }
        }
        return { currentDateHeight, selectedDateHeight, selectedDate, earthX, earthZ };
    } catch (e) {
        return null;
    }
}
if (typeof window !== 'undefined') {
    window.getCircadianSceneTimeContext = getCircadianSceneTimeContext;
}

/**
 * Smooth calendar-day proximity for circadian day-ring opacity (1 = selected stack; falls off with |Δdays|).
 */
function getCircadianDayRingDistanceFade(dayDate, selectedDate) {
    if (!dayDate || !selectedDate) return 1;
    const a = Date.UTC(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
    const b = Date.UTC(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const diffDays = Math.abs(Math.round((a - b) / 86400000));
    const tau = 5.5;
    return 0.07 + 0.93 * Math.exp(-diffDays / tau);
}
if (typeof window !== 'undefined') {
    window.getCircadianDayRingDistanceFade = getCircadianDayRingDistanceFade;
}

/** Scene timeline height for a wall-clock instant (matches time-marker dividers). */
function sceneDateHeightForInstant(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 0;
    if (typeof calculateDateHeight !== 'function') return 0;
    const frac =
        date.getHours() +
        date.getMinutes() / 60 +
        date.getSeconds() / 3600 +
        date.getMilliseconds() / 3600000;
    const h = calculateDateHeight(date.getFullYear(), date.getMonth(), date.getDate(), frac);
    return h != null && !isNaN(h) ? h : 0;
}

/**
 * Earth orbital θ in scene XZ — same as {@link TimeMarkers} / {@link SceneGeometry.getAngle}
 * (reference = current “now” height, not selected slice).
 */
function earthOrbitAngleForSceneDate(date, referenceCurrentHeight) {
    const h = sceneDateHeightForInstant(date);
    const refH =
        typeof referenceCurrentHeight === 'number' && !isNaN(referenceCurrentHeight) ? referenceCurrentHeight : h;
    if (typeof SceneGeometry !== 'undefined' && typeof SceneGeometry.getAngle === 'function') {
        return SceneGeometry.getAngle(h, refH);
    }
    const earth = PLANET_DATA && PLANET_DATA.find((p) => p && p.name === 'Earth');
    if (!earth) return 0;
    const years = (h - refH) / 100;
    const orbits = years / earth.orbitalPeriod;
    return earth.startAngle - orbits * Math.PI * 2;
}

function getPlanetXZAtSelectedDate(planetData, selectedDate, currentDateHeight, selectedDateHeight) {
    const selectedDateForEphemeris = normalizeSelectedDateForEphemeris(selectedDate, currentDateHeight, selectedDateHeight);
    if (typeof window !== 'undefined' && window.CircaevumAstro && typeof window.CircaevumAstro.getPlanetScenePositionAtDate === 'function') {
        const astroPos = window.CircaevumAstro.getPlanetScenePositionAtDate(planetData.name, selectedDateForEphemeris);
        if (astroPos && !isNaN(astroPos.x) && !isNaN(astroPos.z)) {
            return { x: astroPos.x, z: astroPos.z };
        }
    }
    const yearsFromCurrentToSelected = (selectedDateHeight - currentDateHeight) / 100;
    const orbitsFromCurrentToSelected = yearsFromCurrentToSelected / planetData.orbitalPeriod;
    const angleFromCurrentToSelected = orbitsFromCurrentToSelected * Math.PI * 2;
    const planetAngle = planetData.startAngle - angleFromCurrentToSelected;
    return {
        x: Math.cos(planetAngle) * planetData.distance,
        z: Math.sin(planetAngle) * planetData.distance
    };
}

/**
 * Orbit guide ring verts in XZ at fixed Y.
 * Ephemeris ON → sample one orbital period (ellipse, Sun at focus) so ring matches planet mesh.
 * Ephemeris OFF → circular ring at PLANET_DATA.distance (Sun at center).
 */
function fillPlanetOrbitRingPositions(arr, planetData, selectedDate, currentDateHeight, selectedDateHeight, yHeight, segments) {
    const n = Math.max(8, segments | 0);
    const y = isFinite(yHeight) ? yHeight : 0;
    const periodYears =
        planetData && typeof planetData.orbitalPeriod === 'number' && planetData.orbitalPeriod > 0
            ? planetData.orbitalPeriod
            : 1;
    const periodMs = periodYears * 365.25 * 24 * 60 * 60 * 1000;
    const baseDate = normalizeSelectedDateForEphemeris(selectedDate, currentDateHeight, selectedDateHeight);
    const baseMs =
        baseDate instanceof Date && !isNaN(baseDate.getTime()) ? baseDate.getTime() : Date.now();
    const useEphemeris =
        typeof window !== 'undefined' &&
        window.CircaevumAstro &&
        typeof window.CircaevumAstro.isEnabled === 'function' &&
        window.CircaevumAstro.isEnabled() &&
        typeof window.CircaevumAstro.getPlanetScenePositionAtDate === 'function';

    for (let j = 0; j <= n; j++) {
        const t = j / n;
        let x;
        let z;
        if (useEphemeris) {
            const sampleDate = new Date(baseMs + t * periodMs);
            const p = window.CircaevumAstro.getPlanetScenePositionAtDate(planetData.name, sampleDate);
            if (p && !isNaN(p.x) && !isNaN(p.z)) {
                x = p.x;
                z = p.z;
            } else {
                const angle = t * Math.PI * 2;
                x = Math.cos(angle) * planetData.distance;
                z = Math.sin(angle) * planetData.distance;
            }
        } else {
            const angle = t * Math.PI * 2;
            x = Math.cos(angle) * planetData.distance;
            z = Math.sin(angle) * planetData.distance;
        }
        arr[j * 3] = x;
        arr[j * 3 + 1] = y;
        arr[j * 3 + 2] = z;
    }
}

function sceneHourFractionForEarthHand(safeDate, zoomLevel) {
    const zl = typeof zoomLevel !== 'undefined' ? zoomLevel : currentZoom;
    if (typeof EarthGlobe !== 'undefined' && EarthGlobe.getSceneHourDecimal && EarthGlobe.getObserver) {
        const obs = EarthGlobe.getObserver(safeDate, zl);
        if (obs && obs.lon != null && !isNaN(obs.lon)) {
            return EarthGlobe.getSceneHourDecimal(safeDate, obs.lon) / 24;
        }
    }
    return (
        safeDate.getHours() +
        safeDate.getMinutes() / 60 +
        safeDate.getSeconds() / 3600
    ) / 24;
}

function getEarthHourHandSurfaceFocus(earthPos, selectedDateHeight, selectedDate, earthSurfaceRadius) {
    let safeDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
    if (typeof window !== 'undefined' && typeof window.getSelectedDateTime === 'function') {
        const sel = window.getSelectedDateTime();
        if (sel instanceof Date && !isNaN(sel.getTime())) safeDate = sel;
    }
    const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
    const hourFrac = sceneHourFractionForEarthHand(safeDate, currentZoom);
    const hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
    const r = Number.isFinite(earthSurfaceRadius) && earthSurfaceRadius > 0 ? earthSurfaceRadius : 1.95;
    return {
        x: earthPos.x + Math.cos(hourAngleFromEarth) * r,
        y: selectedDateHeight,
        z: earthPos.z + Math.sin(hourAngleFromEarth) * r
    };
}

/** Matches `hourNumberRadius` in {@link updateSunEarthTimeRadials}: outer end of the Earth hour hand for zoom 0/9. */
function getEarthHourHandOuterExtentRadius(earthSurfaceRadius) {
    const r = Number.isFinite(earthSurfaceRadius) && earthSurfaceRadius > 0 ? earthSurfaceRadius : 1.95;
    return r * 2.2;
}

/** Orbital hour-dial angle for a numeral index (fixed ring; matches red/cyan hands). */
function hourDialLabelAngleFromEarth(hour, sunToEarthAngle) {
    return sunToEarthAngle - (hour / 24) * Math.PI * 2;
}

/** World position of the SELECTED HOUR numeral (zoom 0 uses hour markers at zoom 9 layout). */
function getSelectedHourDialLabelWorldPoint(earthPlanet, selectedDate, selectedDateHeight, markerZoomLevel) {
    const earth = PLANET_DATA.find((p) => p.name === 'Earth');
    if (!earth || !earthPlanet) return null;
    const earthX = earthPlanet.position.x;
    const earthZ = earthPlanet.position.z;
    const earthY = typeof selectedDateHeight === 'number' ? selectedDateHeight : earthPlanet.position.y;
    const spiralRadius = earth.distance * 0.1 * 0.9;
    const zl = typeof markerZoomLevel === 'number' ? markerZoomLevel : 9;
    const spiralHeight = ZOOM_LEVELS[zl].timeYears * 100;
    const sunToEarthAngle = Math.atan2(earthZ, earthX);
    const refNow = new Date();
    let selectedHour =
        selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate.getHours() : 0;
    if (typeof currentHourInDay !== 'undefined' && currentHourInDay !== null) {
        selectedHour = ((currentHourInDay % 24) + 24) % 24;
    }
    const angleFromEarth = hourDialLabelAngleFromEarth(selectedHour, sunToEarthAngle);
    const t = selectedHour / 24;
    const y = earthY + t * spiralHeight - spiralHeight / 2;
    return {
        x: earthX + Math.cos(angleFromEarth) * spiralRadius,
        y,
        z: earthZ + Math.sin(angleFromEarth) * spiralRadius
    };
}

/**
 * Zoom 0 camera look-at: midpoint on the cyan selected hour hand between globe exit and
 * the SELECTED HOUR dial label (browser-local orbital clock).
 */
function getEarthHourHandZoom0FocusPoint(earthPos, selectedDateHeight, selectedDate, earthSurfaceRadius) {
    const earthGroup = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    const rSurf =
        earthGroup && typeof resolveEarthGlobeSurfaceRadius === 'function'
            ? resolveEarthGlobeSurfaceRadius(earthGroup)
            : Number.isFinite(earthSurfaceRadius) && earthSurfaceRadius > 0
              ? earthSurfaceRadius
              : 1.95;
    const markerZl = 9;
    const label = getSelectedHourDialLabelWorldPoint(
        earthGroup || null,
        selectedDate,
        selectedDateHeight,
        markerZl
    );
    let surface = null;
    if (typeof EarthGlobe !== 'undefined' && earthGroup) {
        const rTip = getEarthHourHandOuterExtentRadius(rSurf);
        if (EarthGlobe.getMeridianHandWorldPoints) {
            const pts = EarthGlobe.getMeridianHandWorldPoints(
                earthGroup,
                selectedDate,
                null,
                rTip,
                selectedDateHeight,
                0
            );
            const gs = pts && (pts.exit || pts.globeSurface || pts.meridianMark);
            if (gs) {
                surface = { x: gs.x, y: gs.y, z: gs.z };
            }
        }
        if (!surface && EarthGlobe.getHourHandPointAtRadius) {
            const p = EarthGlobe.getHourHandPointAtRadius(
                earthGroup,
                selectedDate,
                0,
                rSurf,
                null,
                selectedDateHeight
            );
            if (p) surface = p;
        }
    }
    if (!surface) {
        surface = getEarthHourHandPointAtRadius(earthPos, selectedDateHeight, selectedDate, rSurf);
    }
    if (label && surface) {
        return {
            x: (surface.x + label.x) * 0.5,
            y: (surface.y + label.y) * 0.5,
            z: (surface.z + label.z) * 0.5
        };
    }
    if (label) return label;
    if (surface) return surface;
    const y =
        typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)
            ? selectedDateHeight
            : earthGroup
              ? earthGroup.position.y
              : 0;
    if (earthGroup) {
        return { x: earthGroup.position.x, y, z: earthGroup.position.z };
    }
    return {
        x: earthPos && typeof earthPos.x === 'number' ? earthPos.x : 0,
        y,
        z: earthPos && typeof earthPos.z === 'number' ? earthPos.z : 0
    };
}

/** Zoom 0: last selected-hour XZ angle for relative camera yaw when time changes. */
let zoom0LastHourAngleXZ = null;

function getZoom0SelectedHourAngleXZ(earthMesh) {
    if (!earthMesh) return 0;
    const sel = getSelectedDateTime();
    const y = earthMesh.position.y;
    if (typeof EarthGlobe !== 'undefined' && EarthGlobe.getDefaultPolarHourAngleXZ) {
        const a = EarthGlobe.getDefaultPolarHourAngleXZ(earthMesh, sel, y, 0);
        if (a != null && !isNaN(a)) return a;
    }
    const sunToEarth = Math.atan2(earthMesh.position.z, earthMesh.position.x);
    const hourFrac = sceneHourFractionForEarthHand(sel, 0);
    return sunToEarth - hourFrac * Math.PI * 2;
}

/**
 * Zoom 0 focus + optional camera yaw.
 * `snap` — entry / explicit reset (default polar view).
 * `delta` — rotate view by Δhour when selected time changes; does not fight user orbit.
 * `focus` — move look-at only (hour-hand midpoint).
 */
function syncZoom0CameraToSelectedHourHand(mode) {
    // Event Horizon framing: keep look-at on Earth / Context Sphere center.
    if (preferEarthEventHorizonCamera) return;
    if (currentZoom !== 0 || typeof THREE === 'undefined') return;
    const earthMesh = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    if (!earthMesh || !targetFocusPoint) return;
    const sel = getSelectedDateTime();
    const { selectedDateHeight } = computeSceneDateHeights(0);
    const rSurf = resolveEarthGlobeSurfaceRadius(earthMesh);
    const fp = getEarthHourHandZoom0FocusPoint(
        { x: earthMesh.position.x, z: earthMesh.position.z },
        selectedDateHeight,
        sel,
        rSurf
    );
    targetFocusPoint.set(fp.x, fp.y, fp.z);

    const hourAngle = getZoom0SelectedHourAngleXZ(earthMesh);
    const snapView = mode === 'snap' || mode === true || zoom0LastHourAngleXZ == null;

    if (snapView && polarViewDir && mode !== 'focus') {
        polarViewDir.copy(buildDefaultPolarViewDirection());
        zoom0LastHourAngleXZ = hourAngle;
        return;
    }

    if (mode === 'focus') return;

    if (mode === 'delta' && polarViewDir && zoom0LastHourAngleXZ != null) {
        let delta = hourAngle - zoom0LastHourAngleXZ;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) > 1e-8) {
            polarViewDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -delta);
            zoom0LastHourAngleXZ = hourAngle;
        }
    }
}

function resolveEarthGlobeSurfaceRadius(earthPlanet) {
    if (!earthPlanet || !earthPlanet.userData) {
        return 1.95;
    }
    if (typeof earthPlanet.userData.globeRadius === 'number') {
        return earthPlanet.userData.globeRadius;
    }
    const mesh = earthPlanet.userData.earthMesh;
    if (mesh && mesh.geometry && mesh.geometry.parameters && typeof mesh.geometry.parameters.radius === 'number') {
        return mesh.geometry.parameters.radius;
    }
    if (earthPlanet.geometry && earthPlanet.geometry.parameters && typeof earthPlanet.geometry.parameters.radius === 'number') {
        return earthPlanet.geometry.parameters.radius;
    }
    return 1.95;
}

function getEarthHourHandPointAtRadius(earthPos, selectedDateHeight, selectedDate, radialDistance) {
    const zl = typeof currentZoom !== 'undefined' ? currentZoom : 9;
    const earthGroup = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    if (typeof EarthGlobe !== 'undefined' && earthGroup && EarthGlobe.getHourHandPointAtRadius) {
        const p = EarthGlobe.getHourHandPointAtRadius(
            earthGroup,
            selectedDate,
            zl,
            radialDistance,
            null,
            selectedDateHeight
        );
        if (p) return p;
    }
    let safeDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
    if (typeof window !== 'undefined' && typeof window.getSelectedDateTime === 'function') {
        const sel = window.getSelectedDateTime();
        if (sel instanceof Date && !isNaN(sel.getTime())) safeDate = sel;
    }
    const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
    const hourFrac = sceneHourFractionForEarthHand(safeDate, zl);
    const hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
    const r = Number.isFinite(radialDistance) && radialDistance > 0 ? radialDistance : 1.95;
    return {
        x: earthPos.x + Math.cos(hourAngleFromEarth) * r,
        y: selectedDateHeight,
        z: earthPos.z + Math.sin(hourAngleFromEarth) * r
    };
}

function disposeSunEarthTimeRadials() {
    function disposeObject3D(obj) {
        if (!obj) return;
        if (obj.parent) obj.parent.remove(obj);
        obj.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                else child.material.dispose();
            }
        });
    }
    [
        sunEarthTimeRadialCurrent,
        sunEarthTimeRadialSelected,
        earthHandCurrent,
        earthHandSelected,
        earthHandMarkerCurrent,
        earthHandMarkerSelected
    ].forEach(disposeObject3D);
    sunEarthTimeRadialCurrent = null;
    sunEarthTimeRadialSelected = null;
    earthHandCurrent = null;
    earthHandSelected = null;
    earthHandMarkerCurrent = null;
    earthHandMarkerSelected = null;
    if (typeof EarthGlobe !== 'undefined' && EarthGlobe.disposeHandObjects) {
        EarthGlobe.disposeHandObjects();
    }
    disposeEarthDaylightSky();
}

const EVENT_LIST_MS_PER_DAY = 86400000;
const EVENT_LIST_MS_PER_YEAR = 365 * EVENT_LIST_MS_PER_DAY;

/** Script-tag builds expose Three on `window`; bare `THREE` is not in scope under ESM/Vite. */
function getThreeNamespace() {
    if (typeof window !== 'undefined' && window.THREE) return window.THREE;
    if (typeof globalThis !== 'undefined' && globalThis.THREE) return globalThis.THREE;
    return null;
}

/** Same half-span as `nearbyHalfSpanMs` in `yang/web/index.html` (event list time window). */
function getEventListHalfSpanMs(zoomLevel, refDate) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    if (z === 7 && typeof MoonMechanics !== 'undefined' && typeof MoonMechanics.fullMoonBoundsAroundRef === 'function') {
        const ref =
            refDate instanceof Date && !isNaN(refDate.getTime())
                ? refDate
                : typeof getSelectedDateTime === 'function'
                  ? getSelectedDateTime()
                  : new Date();
        const b = MoonMechanics.fullMoonBoundsAroundRef(ref);
        return Math.max(EVENT_LIST_MS_PER_DAY, (b.t1 - b.t0) / 2);
    }
    if (z === 0) return EVENT_LIST_MS_PER_DAY / 24 / 2;
    if (z >= 9) return EVENT_LIST_MS_PER_DAY;
    if (z >= 8) return 2 * EVENT_LIST_MS_PER_DAY;
    if (z >= 5) return 30 * EVENT_LIST_MS_PER_DAY;
    if (z >= 3) return 120 * EVENT_LIST_MS_PER_DAY;
    return 365 * EVENT_LIST_MS_PER_DAY;
}

/** Zoom 7 visible week (Sun 00:00 – Sat end) around selected time — matches week markers, not lunar month. */
function getZoom7WeekTimeBoundsMs(refDate) {
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    const dayMs = EVENT_LIST_MS_PER_DAY;
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return { t0: start.getTime(), t1: start.getTime() + 7 * dayMs - 1, ref };
}

/** Event-list time window [t0, t1] in ms (matches events-list.js filters). */
function getListContextDiscTimeBoundsMs(zoomLevel, refDate) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    if (z === 7 && typeof MoonMechanics !== 'undefined' && typeof MoonMechanics.fullMoonBoundsAroundRef === 'function') {
        const b = MoonMechanics.fullMoonBoundsAroundRef(ref);
        let t0 = b.t0;
        let t1 = b.t1;
        const y0 = new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
        const y1 = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
        t0 = Math.max(t0, y0);
        t1 = Math.min(t1, y1);
        if (t1 < t0) t1 = t0;
        return { t0, t1, ref };
    }
    const halfMs = getEventListHalfSpanMs(z, ref);
    let t0 = ref.getTime() - halfMs;
    let t1 = ref.getTime() + halfMs;
    if (z === 0) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ref.getHours(), 0, 0, 0);
        t0 = start.getTime();
        t1 = t0 + EVENT_LIST_MS_PER_DAY / 24;
    } else if (z === 3 || z === 4 || z >= 5) {
        const y0 = new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
        const y1 = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
        t0 = Math.max(t0, y0);
        t1 = Math.min(t1, y1);
    }
    if (t1 < t0) t1 = t0;
    return { t0, t1, ref };
}

/**
 * Time bounds for the 3D context arc — matches visible zoom span (week/month/day), not the wider event-list filter.
 * nest / inside — ± zoom-grain about selected time (+ pad) for Interstellar LTE chrome.
 * off (Mode 3) — calendar context window (Sun–Sat week, calendar month, …), not a selected-time buffer.
 */
function getListContextDiscArcTimeBoundsMs(zoomLevel, refDate) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    const ehMode = typeof eventHorizonMode === 'string' ? eventHorizonMode : 'nest';
    // nest / inside: zoom-relative ± buffer about selected instant (pad for clip rim).
    // Mode 3 (off): skip — use calendar-box fallthrough below.
    if (
        ehMode !== 'off' &&
        typeof getZoomRelativeContextTimeBoundsMs === 'function' &&
        z !== 1
    ) {
        try {
            const cs = getZoomRelativeContextTimeBoundsMs(z, ref);
            if (cs && cs.t1 > cs.t0) {
                const pad =
                    typeof getZoomRelativeContextContentPad === 'function'
                        ? getZoomRelativeContextContentPad(z)
                        : typeof getContextSphereContentPad === 'function'
                          ? getContextSphereContentPad(z)
                          : { padMs: 0 };
                const p = pad && pad.padMs > 0 ? pad.padMs : 0;
                return { t0: cs.t0 - p, t1: cs.t1 + p, ref: cs.ref || ref };
            }
        } catch (e) { /* fall through */ }
    }
    const dayMs = EVENT_LIST_MS_PER_DAY;
    if (z === 0) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ref.getHours(), 0, 0, 0);
        return { t0: start.getTime(), t1: start.getTime() + dayMs / 24, ref };
    }
    if (z === 7) {
        return getZoom7WeekTimeBoundsMs(ref);
    }
    if (z === 5 || z === 6) {
        return {
            t0: new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0).getTime(),
            t1: new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
            ref
        };
    }
    if (z === 8 || z === 9) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
        return { t0: start.getTime(), t1: start.getTime() + dayMs - 1, ref };
    }
    if (z === 4) {
        const q = Math.floor(ref.getMonth() / 3);
        return {
            t0: new Date(ref.getFullYear(), q * 3, 1, 0, 0, 0, 0).getTime(),
            t1: new Date(ref.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999).getTime(),
            ref
        };
    }
    if (z === 3) {
        return {
            t0: new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(),
            t1: new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999).getTime(),
            ref
        };
    }
    return getListContextDiscTimeBoundsMs(z, refDate);
}

/**
 * Zoom-relative LTE / list context window (± one grain of current zoom).
 * Event Horizon shell stays week-sized ({@link getContextSphereTimeBoundsMs});
 * LTE chrome + density expand to this window (outside the sphere).
 *
 * @returns {{ t0: number, t1: number, ref: Date, unit: string, halfCount: number, extended: boolean }}
 */
function getZoomRelativeContextTimeBoundsMs(zoomLevel, refDate) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    const dayMs =
        typeof EVENT_LIST_MS_PER_DAY === 'number' && EVENT_LIST_MS_PER_DAY > 0
            ? EVENT_LIST_MS_PER_DAY
            : 86400000;

    // Lunar (6): fortnight each way + couple extra days so full synodic (~29.5d) fits with margin.
    if (z === 6) {
        const halfDays = 14 + 2;
        return {
            t0: ref.getTime() - halfDays * dayMs,
            t1: ref.getTime() + halfDays * dayMs,
            ref,
            unit: 'lunar',
            halfCount: halfDays,
            extended: false
        };
    }

    const halfCount = 1;

    let unit = 'month';
    if (z === 0 || z === 9) unit = 'hour';
    else if (z === 8) unit = 'day';
    else if (z === 7) unit = 'week';
    else if (z === 5) unit = 'month';
    else if (z === 4) unit = 'quarter';
    else if (z === 3) unit = 'year';
    else if (z === 2) unit = 'decade';
    else if (z === 1) unit = 'century';

    function offsetByUnit(base, signedHalves) {
        const d = new Date(base.getTime());
        const n = signedHalves;
        if (unit === 'hour') d.setHours(d.getHours() + 12 * n);
        else if (unit === 'day') d.setDate(d.getDate() + n);
        else if (unit === 'week') d.setDate(d.getDate() + 7 * n);
        else if (unit === 'month') d.setMonth(d.getMonth() + n);
        else if (unit === 'quarter') d.setMonth(d.getMonth() + 3 * n);
        else if (unit === 'year') d.setFullYear(d.getFullYear() + n);
        else if (unit === 'decade') d.setFullYear(d.getFullYear() + 10 * n);
        else if (unit === 'century') d.setFullYear(d.getFullYear() + 100 * n);
        return d;
    }

    const t0d = offsetByUnit(ref, -halfCount);
    const t1d = offsetByUnit(ref, halfCount);
    return {
        t0: t0d.getTime(),
        t1: t1d.getTime(),
        ref,
        unit,
        halfCount,
        extended: false
    };
}

/**
 * Event Horizon time window for the drawn shell.
 * nest — adjustable ±eventHorizonHalfDays (slider)
 * inside — traditional Zoom-7 week (±7d); slider does not size the shell
 *
 * @returns {{ t0: number, t1: number, ref: Date, unit: string, halfCount: number, extended: boolean, ehHalfDays: number }}
 */
function getContextSphereTimeBoundsMs(zoomLevel, refDate) {
    void zoomLevel;
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    // Mode 2 (inside veil): classic week shell — not the nest dual-knob.
    const halfDays =
        typeof eventHorizonMode === 'string' && eventHorizonMode === 'inside'
            ? 7
            : Math.max(
                  EH_HALF_DAYS_MIN,
                  Math.min(
                      EH_HALF_DAYS_MAX,
                      typeof eventHorizonHalfDays === 'number' && !isNaN(eventHorizonHalfDays)
                          ? eventHorizonHalfDays
                          : 7
                  )
              );
    const t0d = new Date(ref.getTime());
    t0d.setDate(t0d.getDate() - halfDays);
    const t1d = new Date(ref.getTime());
    t1d.setDate(t1d.getDate() + halfDays);
    return {
        t0: t0d.getTime(),
        t1: t1d.getTime(),
        ref,
        unit: 'week',
        halfCount: halfDays / 7,
        extended: false,
        ehHalfDays: halfDays
    };
}

/**
 * Content pad for Event Horizon (week shell) — STE overshoot past rim.
 *
 * @returns {{ padMs: number, padWorld: number, units: number }}
 */
function getContextSphereContentPad(zoomLevel) {
    void zoomLevel;
    const dayMs =
        typeof EVENT_LIST_MS_PER_DAY === 'number' && EVENT_LIST_MS_PER_DAY > 0
            ? EVENT_LIST_MS_PER_DAY
            : 86400000;
    const units = 2.5;
    const padMs = units * dayMs;

    let padWorld = 0;
    const R =
        contextSphereState && typeof contextSphereState.radius === 'number'
            ? contextSphereState.radius
            : 0;
    if (R > 0) padWorld = R * 0.04;
    if (
        contextSphereState &&
        typeof contextSphereState.heightAtMs === 'function' &&
        typeof contextSphereState.t1 === 'number' &&
        padMs > 0
    ) {
        try {
            const yA = contextSphereState.heightAtMs(contextSphereState.t1);
            const yB = contextSphereState.heightAtMs(contextSphereState.t1 + padMs);
            if (typeof yA === 'number' && typeof yB === 'number' && isFinite(yA) && isFinite(yB)) {
                padWorld = Math.max(padWorld, Math.abs(yB - yA) * 0.55);
            }
        } catch (e) { /* keep radial fraction */ }
    }
    return { padMs, padWorld, units };
}

/**
 * Content pad for LTE / list chrome past the zoom-relative context window.
 *
 * @returns {{ padMs: number, padWorld: number, units: number }}
 */
function getZoomRelativeContextContentPad(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const dayMs =
        typeof EVENT_LIST_MS_PER_DAY === 'number' && EVENT_LIST_MS_PER_DAY > 0
            ? EVENT_LIST_MS_PER_DAY
            : 86400000;
    const hourMs = dayMs / 24;
    const units = 2.5;
    let padMs;
    if (z === 0 || z === 9) padMs = units * hourMs;
    else if (z === 8) padMs = units * hourMs;
    else if (z === 6) padMs = units * dayMs;
    else if (z === 7) padMs = units * dayMs;
    else if (z === 5) padMs = units * dayMs;
    else if (z === 4) padMs = 7 * dayMs;
    else if (z === 3) padMs = 14 * dayMs;
    else if (z === 2) padMs = 30 * dayMs;
    else padMs = 90 * dayMs;

    let padWorld = 0;
    if (typeof calculateDateHeight === 'function') {
        try {
            const b = getZoomRelativeContextTimeBoundsMs(z);
            if (b && b.t1 > b.t0) {
                const d0 = new Date(b.t1);
                const d1 = new Date(b.t1 + padMs);
                const frac = (d) =>
                    d.getHours() +
                    d.getMinutes() / 60 +
                    d.getSeconds() / 3600 +
                    d.getMilliseconds() / 3600000;
                const yA = calculateDateHeight(d0.getFullYear(), d0.getMonth(), d0.getDate(), frac(d0));
                const yB = calculateDateHeight(d1.getFullYear(), d1.getMonth(), d1.getDate(), frac(d1));
                if (typeof yA === 'number' && typeof yB === 'number' && isFinite(yA) && isFinite(yB)) {
                    padWorld = Math.abs(yB - yA) * 0.55;
                }
            }
        } catch (e) { /* optional */ }
    }
    const R =
        contextSphereState && typeof contextSphereState.radius === 'number'
            ? contextSphereState.radius
            : 0;
    if (R > 0) padWorld = Math.max(padWorld, R * 0.04);
    return { padMs, padWorld, units };
}

/**
 * Events visible in the scene.
 * nest — Context Sphere (slider) window; Shift → parent nest.
 * inside — zoom-relative context (arc / grain), not week-slider shell.
 */
function getEventDisplayTimeBoundsMs(zoomLevel, refDate) {
    if (typeof eventHorizonMode === 'string' && eventHorizonMode === 'inside') {
        if (typeof getZoomRelativeContextTimeBoundsMs === 'function') {
            try {
                const cs = getZoomRelativeContextTimeBoundsMs(zoomLevel, refDate);
                if (cs && cs.t1 > cs.t0) {
                    const pad =
                        typeof getZoomRelativeContextContentPad === 'function'
                            ? getZoomRelativeContextContentPad(zoomLevel)
                            : { padMs: 0 };
                    const p = pad && pad.padMs > 0 ? pad.padMs : 0;
                    return {
                        t0: cs.t0 - p,
                        t1: cs.t1 + p,
                        ref: cs.ref,
                        unit: cs.unit,
                        halfCount: cs.halfCount,
                        extended: false
                    };
                }
            } catch (e) { /* fall through */ }
        }
    }
    const shift =
        typeof window !== 'undefined' &&
        typeof window.getCircadianShortEventsShiftPreview === 'function' &&
        !!window.getCircadianShortEventsShiftPreview();
    if (shift) {
        const p = getParentUnitTimeBoundsMs(zoomLevel, refDate);
        if (p && p.t1 > p.t0) return Object.assign({}, p, { extended: true });
    }
    return getContextSphereTimeBoundsMs(zoomLevel, refDate);
}

/**
 * Density / visibility parent of the current zoom unit (legacy wider nest).
 * Prefer {@link getContextSphereTimeBoundsMs} for the event-horizon shell.
 *
 * @returns {{ t0: number, t1: number, ref: Date, unit: string }}
 */
function getParentUnitTimeBoundsMs(zoomLevel, refDate) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    const dayMs = EVENT_LIST_MS_PER_DAY;

    if (z === 0 || z === 9) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
        return { t0: start.getTime(), t1: start.getTime() + dayMs - 1, ref, unit: 'day' };
    }
    if (z === 8) {
        const w = getZoom7WeekTimeBoundsMs(ref);
        return { t0: w.t0, t1: w.t1, ref: w.ref, unit: 'week' };
    }
    if (z === 7 || z === 6) {
        return {
            t0: new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0).getTime(),
            t1: new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
            ref,
            unit: 'month'
        };
    }
    if (z === 5) {
        const q = Math.floor(ref.getMonth() / 3);
        return {
            t0: new Date(ref.getFullYear(), q * 3, 1, 0, 0, 0, 0).getTime(),
            t1: new Date(ref.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999).getTime(),
            ref,
            unit: 'quarter'
        };
    }
    if (z === 4) {
        return {
            t0: new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(),
            t1: new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999).getTime(),
            ref,
            unit: 'year'
        };
    }
    if (z === 3) {
        const y0 = ref.getFullYear() - (ref.getFullYear() % 10);
        return {
            t0: new Date(y0, 0, 1, 0, 0, 0, 0).getTime(),
            t1: new Date(y0 + 10, 0, 1, 0, 0, 0, 0).getTime() - 1,
            ref,
            unit: 'decade'
        };
    }
    if (z === 2) {
        const y0 = ref.getFullYear() - (ref.getFullYear() % 100);
        return {
            t0: new Date(y0, 0, 1, 0, 0, 0, 0).getTime(),
            t1: new Date(y0 + 100, 0, 1, 0, 0, 0, 0).getTime() - 1,
            ref,
            unit: 'century'
        };
    }
    const half = typeof getEventListHalfSpanMs === 'function' ? getEventListHalfSpanMs(z, ref) : 50 * 365 * dayMs;
    return { t0: ref.getTime() - half, t1: ref.getTime() + half, ref, unit: 'span' };
}

/** @deprecated Prefer getContextSphereTimeBoundsMs — kept for callers that want calendar-box unit. */
function getCurrentUnitTimeBoundsMs(zoomLevel, refDate) {
    return getContextSphereTimeBoundsMs(zoomLevel, refDate);
}

/**
 * Event display / density cull window.
 * Alias of {@link getEventDisplayTimeBoundsMs} (Shift → parent nest, sphere size unchanged).
 */
function getExplodedContextTimeBoundsMs(zoomLevel, refDate) {
    return getEventDisplayTimeBoundsMs(zoomLevel, refDate);
}

/** Latest Context Sphere pose for event edge-fade / debug. */
let contextSphereState = null;

if (typeof window !== 'undefined') {
    window.getParentUnitTimeBoundsMs = getParentUnitTimeBoundsMs;
    window.getCurrentUnitTimeBoundsMs = getCurrentUnitTimeBoundsMs;
    window.getContextSphereTimeBoundsMs = getContextSphereTimeBoundsMs;
    window.getZoomRelativeContextTimeBoundsMs = getZoomRelativeContextTimeBoundsMs;
    window.getContextSphereContentPad = getContextSphereContentPad;
    window.getZoomRelativeContextContentPad = getZoomRelativeContextContentPad;
    window.getEventDisplayTimeBoundsMs = getEventDisplayTimeBoundsMs;
    window.getExplodedContextTimeBoundsMs = getExplodedContextTimeBoundsMs;
    window.getContextSphereState = function () {
        return contextSphereState;
    };
}

function disposeParentUnitTemporalVeil() {
    if (!parentUnitTemporalVeilGroup) return;
    if (parentUnitTemporalVeilGroup.parent) parentUnitTemporalVeilGroup.parent.remove(parentUnitTemporalVeilGroup);
    parentUnitTemporalVeilGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
        }
    });
    parentUnitTemporalVeilGroup = null;
    // Keep contextSphereState until ensureContextSphereState replaces/clears it —
    // Sky Canvas reads radius between dispose and rebuild.
}

/**
 * Local LTE canvas plane at selected Earth: helix tangent × horizontal orbital radial.
 * Flatten scales tangent.y (same as sky/list helix) → plane → horizontal when flat.
 * Ring = that plane ∩ Event Horizon (great circle through sphere center).
 *
 * @returns {{ ux:number, uy:number, uz:number, vx:number, vy:number, vz:number }|null}
 */
function getContextSphereLteCanvasPlaneBasis(state, flattenAmount) {
    if (!state || !(state.radius > 0) || typeof state.earthPointAtMs !== 'function') return null;
    const spanMs =
        typeof state.t1 === 'number' && typeof state.t0 === 'number' ? state.t1 - state.t0 : 0;
    const dayMs =
        typeof EVENT_LIST_MS_PER_DAY === 'number' && EVENT_LIST_MS_PER_DAY > 0
            ? EVENT_LIST_MS_PER_DAY
            : 86400000;
    const dt = Math.max(spanMs * 0.015, dayMs * 0.04, 3600000);
    const selMs =
        typeof getSelectedDateTime === 'function'
            ? getSelectedDateTime().getTime()
            : typeof state.t0 === 'number' && typeof state.t1 === 'number'
              ? (state.t0 + state.t1) * 0.5
              : Date.now();
    const pA = state.earthPointAtMs(selMs - dt);
    const pB = state.earthPointAtMs(selMs + dt);
    if (!pA || !pB) return null;

    let tx = pB.x - pA.x;
    let ty = pB.y - pA.y;
    let tz = pB.z - pA.z;
    const amt = typeof flattenAmount === 'number' && !isNaN(flattenAmount) ? flattenAmount : 0;
    const yScale = Math.max(0, 1 - amt);
    ty *= yScale;
    const tLen = Math.hypot(tx, ty, tz);
    if (tLen < 1e-10) return null;
    tx /= tLen;
    ty /= tLen;
    tz /= tLen;

    // Ribbon width on LTE canvas: sun→Earth in XZ (horizontal orbital radial).
    let rx = state.x;
    let rz = state.z;
    let rLen = Math.hypot(rx, rz);
    if (rLen < 1e-8) {
        rx = 1;
        rz = 0;
        rLen = 1;
    }
    rx /= rLen;
    rz /= rLen;
    const ry = 0;

    // Plane basis: T and R (lie on LTE strip). Normal = T × R.
    let nx = ty * rz - tz * ry;
    let ny = tz * rx - tx * rz;
    let nz = tx * ry - ty * rx;
    let nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-8) {
        // Degenerate (T ‖ R): fall back to horizontal plane.
        nx = 0;
        ny = 1;
        nz = 0;
        nLen = 1;
    }
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    // Orthonormal u, v in the plane (u ≈ radial, v ≈ T projected).
    let ux = rx - nx * (nx * rx + ny * ry + nz * rz);
    let uy = ry - nx * (nx * rx + ny * ry + nz * rz);
    let uz = rz - nx * (nx * rx + ny * ry + nz * rz);
    let uLen = Math.hypot(ux, uy, uz);
    if (uLen < 1e-8) {
        ux = 1 - nx * nx;
        uy = -nx * ny;
        uz = -nx * nz;
        uLen = Math.hypot(ux, uy, uz);
        if (uLen < 1e-8) return null;
    }
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    return { ux, uy, uz, vx, vy, vz, nx, ny, nz };
}

/** Rebuild white LTE-slope ∩ Event Horizon ring positions (local to Context Sphere group). */
function syncContextSphereLteSlopeRing() {
    if (typeof THREE === 'undefined') return;
    const group = parentUnitTemporalVeilGroup;
    const state = contextSphereState;
    if (!group || !state || !(state.radius > 0)) return;

    let ring = null;
    for (let i = 0; i < group.children.length; i++) {
        const ch = group.children[i];
        if (ch && ch.userData && ch.userData.type === 'ContextSphereLteSlopeRing') {
            ring = ch;
            break;
        }
    }
    const basis = getContextSphereLteCanvasPlaneBasis(
        state,
        typeof getActiveTimelineFlattenAmount === 'function' ? getActiveTimelineFlattenAmount() : 0
    );
    if (!basis) return;

    const R = state.radius * 0.999;
    const nSeg = 96;
    const pts = new Float32Array((nSeg + 1) * 3);
    for (let s = 0; s <= nSeg; s++) {
        const a = (s / nSeg) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const o = s * 3;
        pts[o] = (basis.ux * ca + basis.vx * sa) * R;
        pts[o + 1] = (basis.uy * ca + basis.vy * sa) * R;
        pts[o + 2] = (basis.uz * ca + basis.vz * sa) * R;
    }

    if (!ring) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        ring = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: isLightMode ? 0.9 : 0.95,
                depthWrite: false,
                depthTest: true
            })
        );
        ring.renderOrder = 23;
        ring.userData = { type: 'ContextSphereLteSlopeRing' };
        ring.raycast = function () {};
        group.add(ring);
    } else {
        const pos = ring.geometry && ring.geometry.attributes && ring.geometry.attributes.position;
        if (pos && pos.array && pos.array.length === pts.length) {
            pos.array.set(pts);
            pos.needsUpdate = true;
        } else if (ring.geometry) {
            ring.geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        }
        if (ring.material) {
            ring.material.color.setHex(0xffffff);
            ring.material.opacity = isLightMode ? 0.9 : 0.95;
            ring.material.needsUpdate = true;
        }
    }
}

/**
 * Compute Context Sphere pose (center + radius + time window) without building mesh.
 * Sky Canvas / cull / markers read {@link contextSphereState}.
 * @returns {object|null}
 */
function ensureContextSphereState(zoomLevel) {
    if (typeof THREE === 'undefined') {
        contextSphereState = null;
        return null;
    }
    if (tourMinimalOrbitMode) {
        contextSphereState = null;
        return null;
    }
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    if (z === 1) {
        contextSphereState = null;
        return null;
    }
    if (typeof calculateDateHeight !== 'function') {
        contextSphereState = null;
        return null;
    }
    if (typeof getPlanetXZAtSelectedDate !== 'function') {
        contextSphereState = null;
        return null;
    }

    const earth = typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p.name === 'Earth') : null;
    if (!earth) {
        contextSphereState = null;
        return null;
    }

    const bounds = getContextSphereTimeBoundsMs(z);
    if (!bounds || !(bounds.t1 > bounds.t0)) {
        contextSphereState = null;
        return null;
    }
    const heights = typeof computeSceneDateHeights === 'function' ? computeSceneDateHeights(z) : null;
    const currentDateHeight = heights ? heights.currentDateHeight : 0;

    function heightAtMs(ms) {
        const d = new Date(ms);
        const frac =
            d.getHours() +
            d.getMinutes() / 60 +
            d.getSeconds() / 3600 +
            d.getMilliseconds() / 3600000;
        const h = calculateDateHeight(d.getFullYear(), d.getMonth(), d.getDate(), frac);
        return h != null && !isNaN(h) ? h : null;
    }

    function earthPointAtMs(ms) {
        const d = new Date(ms);
        const h = heightAtMs(ms);
        if (h == null) return null;
        const xz = getPlanetXZAtSelectedDate(earth, d, currentDateHeight, h);
        if (!xz) return null;
        return { x: xz.x, y: h, z: xz.z };
    }

    const selMs = bounds.ref.getTime();
    const center = earthPointAtMs(selMs);
    if (!center) {
        contextSphereState = null;
        return null;
    }

    const spanMs = bounds.t1 - bounds.t0;
    const samples = 32;
    let radius = 0;
    for (let i = 0; i <= samples; i++) {
        const p = earthPointAtMs(bounds.t0 + (i / samples) * spanMs);
        if (!p) continue;
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const dz = p.z - center.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > radius) radius = dist;
    }
    const earthOrbitR = Math.hypot(center.x, center.z) || 50;
    radius = Math.max(radius, earthOrbitR * 0.04, 2.5);
    // Shell radius from Event Horizon time chord (slider in nest; fixed week in inside).

    const y0 = heightAtMs(bounds.t0);
    const y1 = heightAtMs(bounds.t1);
    const ehHalf =
        typeof bounds.ehHalfDays === 'number' && bounds.ehHalfDays > 0
            ? bounds.ehHalfDays
            : eventHorizonMode === 'inside'
              ? 7
              : eventHorizonHalfDays;
    const warpOuter = Math.max(ehHalf, eventHorizonWarpOuterHalfDays);
    const warpBeyond = Math.max(0, warpOuter - ehHalf);

    // Mode 2 veil: clip volume follows zoom-relative context (arc/grain), not week shell.
    // Drawn Event Horizon shell stays traditional week size above.
    let clipRadius = radius;
    let clipY0 = y0 != null ? y0 : center.y;
    let clipY1 = y1 != null ? y1 : center.y;
    if (eventHorizonMode === 'inside' && typeof getZoomRelativeContextTimeBoundsMs === 'function') {
        try {
            const cb = getZoomRelativeContextTimeBoundsMs(z);
            if (cb && cb.t1 > cb.t0) {
                const pad =
                    typeof getZoomRelativeContextContentPad === 'function'
                        ? getZoomRelativeContextContentPad(z)
                        : { padMs: 0 };
                const pMs = pad && pad.padMs > 0 ? pad.padMs : 0;
                const ct0 = cb.t0 - pMs;
                const ct1 = cb.t1 + pMs;
                let cR = 0;
                const cSpan = ct1 - ct0;
                for (let i = 0; i <= samples; i++) {
                    const p = earthPointAtMs(ct0 + (i / samples) * cSpan);
                    if (!p) continue;
                    const dx = p.x - center.x;
                    const dy = p.y - center.y;
                    const dz = p.z - center.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist > cR) cR = dist;
                }
                clipRadius = Math.max(cR, radius, earthOrbitR * 0.04, 2.5);
                const cy0 = heightAtMs(ct0);
                const cy1 = heightAtMs(ct1);
                if (cy0 != null) clipY0 = cy0;
                if (cy1 != null) clipY1 = cy1;
            }
        } catch (e) { /* keep shell radius as clip */ }
    }

    contextSphereState = {
        x: center.x,
        y: center.y,
        z: center.z,
        radius,
        clipRadius,
        t0: bounds.t0,
        t1: bounds.t1,
        unit: bounds.unit,
        halfCount: bounds.halfCount,
        extended: !!bounds.extended,
        zoom: z,
        radiusSourceZoom: 7,
        ehHalfDays: ehHalf,
        warpOuterHalfDays: warpOuter,
        warpBeyondDays: warpBeyond,
        y0: y0 != null ? y0 : center.y,
        y1: y1 != null ? y1 : center.y,
        clipY0,
        clipY1,
        heightAtMs,
        earthPointAtMs
    };
    return contextSphereState;
}

/** Rebuild Sky Canvas meshes so they fill the Context Sphere event horizon. */
function refreshSkyCanvasForContextSphere(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const earthPlanet =
        typeof planetMeshes !== 'undefined' && planetMeshes
            ? planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth')
            : null;
    if (earthPlanet && typeof updateEarthDaylightSky === 'function') {
        try {
            updateEarthDaylightSky(earthPlanet, z);
        } catch (e) { /* optional */ }
    }
    if (typeof updateDayFrameLteSkyBackdrop === 'function') {
        try {
            updateDayFrameLteSkyBackdrop(z);
        } catch (e) { /* optional */ }
    }
    if (typeof updateListHorizonEarthRing === 'function') {
        try {
            updateListHorizonEarthRing(z);
        } catch (e) { /* optional */ }
    }
}

/**
 * Patch materials for Event Horizon clip by mode:
 *   nest   — STE keep inside; LTE keep outside (Interstellar reverse)
 *   inside — everything keep inside (veil)
 *   off    — clip disabled
 */
function refreshContextSphereVisualClip() {
    if (typeof ContextSphereClip === 'undefined' || !ContextSphereClip.refresh) return;
    if (eventHorizonMode === 'off' || !contextSphereState) {
        if (ContextSphereClip.setEnabled) ContextSphereClip.setEnabled(false);
        return;
    }

    const steRoots = [];
    const lteRoots = [];
    const lteObjects = [];

    if (eventHorizonMode === 'inside') {
        // Veil: markers / skies / events stay inside. Worldlines + orbital paths
        // live on flattenableGroup — leave unpatched so they read through the rim.
        if (typeof earthDaylightSkyMesh !== 'undefined' && earthDaylightSkyMesh) {
            steRoots.push(earthDaylightSkyMesh);
        }
        if (typeof dayFrameLteSkyMesh !== 'undefined' && dayFrameLteSkyMesh) {
            steRoots.push(dayFrameLteSkyMesh);
        }
        if (typeof listHorizonEarthRingMesh !== 'undefined' && listHorizonEarthRingMesh) {
            steRoots.push(listHorizonEarthRingMesh);
        }
        if (typeof timeMarkersGroup !== 'undefined' && timeMarkersGroup) {
            steRoots.push(timeMarkersGroup);
        }
        if (typeof timeMarkers !== 'undefined' && Array.isArray(timeMarkers)) {
            for (let i = 0; i < timeMarkers.length; i++) {
                if (timeMarkers[i]) steRoots.push(timeMarkers[i]);
            }
        }
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        if (gl && gl.eventLayerGroups && typeof gl.eventLayerGroups === 'object') {
            Object.keys(gl.eventLayerGroups).forEach((k) => {
                const g = gl.eventLayerGroups[k];
                if (g) steRoots.push(g);
            });
        }
        ContextSphereClip.refresh({
            THREE: typeof THREE !== 'undefined' ? THREE : null,
            // Veil clip = zoom-relative context volume; drawn shell stays week-sized.
            state: {
                x: contextSphereState.x,
                y: contextSphereState.y,
                z: contextSphereState.z,
                radius:
                    typeof contextSphereState.clipRadius === 'number' &&
                    contextSphereState.clipRadius > 0
                        ? contextSphereState.clipRadius
                        : contextSphereState.radius
            },
            steRoots,
            lteRoots: [],
            lteObjects: [],
            padWorld: 0,
            stretchSte: false
        });
        return;
    }

    // nest — reverse Event Horizon
    if (typeof earthDaylightSkyMesh !== 'undefined' && earthDaylightSkyMesh) {
        steRoots.push(earthDaylightSkyMesh);
    }
    if (typeof dayFrameLteSkyMesh !== 'undefined' && dayFrameLteSkyMesh) {
        lteRoots.push(dayFrameLteSkyMesh);
    }
    if (typeof listHorizonEarthRingMesh !== 'undefined' && listHorizonEarthRingMesh) {
        lteRoots.push(listHorizonEarthRingMesh);
    }
    if (typeof timeMarkersGroup !== 'undefined' && timeMarkersGroup) {
        lteRoots.push(timeMarkersGroup);
    }
    if (typeof timeMarkers !== 'undefined' && Array.isArray(timeMarkers)) {
        for (let i = 0; i < timeMarkers.length; i++) {
            if (timeMarkers[i]) lteObjects.push(timeMarkers[i]);
        }
    }
    const pad =
        typeof getContextSphereContentPad === 'function'
            ? getContextSphereContentPad(
                  contextSphereState && typeof contextSphereState.zoom === 'number'
                      ? contextSphereState.zoom
                      : currentZoom
              )
            : { padWorld: 0 };
    ContextSphereClip.refresh({
        THREE: typeof THREE !== 'undefined' ? THREE : null,
        state: contextSphereState,
        steRoots,
        lteRoots,
        lteObjects,
        padWorld: pad && pad.padWorld > 0 ? pad.padWorld : 0,
        stretchSte: true
    });
}

/**
 * Context Sphere / Event Horizon — Earth-centered; radius locked to Zoom-7 week chord
 * at every zoom. STE nest inside; LTE / time-frame chrome outside (invert clip).
 * Shift expands STE display nest only — sphere size unchanged.
 * White ring: Event Horizon ∩ LTE canvas plane (tilts with helix; flattens toward horizontal).
 */
function updateParentUnitTemporalVeil(zoomLevel) {
    disposeParentUnitTemporalVeil();
    if (typeof THREE === 'undefined' || !sceneContentGroup) return;

    // Classic: no shell, no clip, no warp.
    if (eventHorizonMode === 'off') {
        contextSphereState = null;
        if (typeof ContextSphereClip !== 'undefined' && ContextSphereClip.setEnabled) {
            ContextSphereClip.setEnabled(false);
        }
        if (
            typeof TimeMarkers !== 'undefined' &&
            typeof TimeMarkers.applyLteDayFrameEventHorizonWarp === 'function'
        ) {
            try {
                TimeMarkers.applyLteDayFrameEventHorizonWarp();
            } catch (e) { /* optional */ }
        }
        return;
    }

    const state = ensureContextSphereState(zoomLevel);
    if (!state) {
        if (typeof ContextSphereClip !== 'undefined' && ContextSphereClip.setEnabled) {
            ContextSphereClip.setEnabled(false);
        }
        return;
    }

    const bounds = {
        t0: state.t0,
        t1: state.t1,
        ref: typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date(),
        unit: state.unit,
        halfCount: state.halfCount,
        extended: state.extended
    };
    const center = { x: state.x, y: state.y, z: state.z };
    const radius = state.radius;
    const z = state.zoom;
    const spanMs = bounds.t1 - bounds.t0;
    const samples = 32;
    const earthPointAtMs = state.earthPointAtMs;
    const heightAtMs = state.heightAtMs;
    const selMs = typeof getSelectedDateTime === 'function' ? getSelectedDateTime().getTime() : (bounds.t0 + bounds.t1) * 0.5;

    const group = new THREE.Group();
    group.userData = {
        type: 'ContextSphere',
        unit: bounds.unit,
        extended: !!bounds.extended,
        t0: bounds.t0,
        t1: bounds.t1,
        radius
    };
    group.position.set(center.x, center.y, center.z);

    const shellColor = isLightMode ? 0x3d6a8c : 0x7eb6d9;
    const insideVeil = typeof eventHorizonMode === 'string' && eventHorizonMode === 'inside';
    const clipR =
        insideVeil &&
        typeof state.clipRadius === 'number' &&
        state.clipRadius > radius + 0.05
            ? state.clipRadius
            : null;

    // Event Horizon shell (week / nest size) — soft volume; not the Mode-2 clip rim.
    const shellOpacity = isLightMode ? 0.05 : 0.07;
    const shellGeo = new THREE.SphereGeometry(radius, 16, 12);
    const shell = new THREE.Mesh(
        shellGeo,
        new THREE.MeshBasicMaterial({
            color: shellColor,
            transparent: true,
            opacity: shellOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        })
    );
    shell.renderOrder = 16;
    shell.raycast = function () {};
    group.add(shell);

    const RING_SEGS = 48;
    const colSelected =
        typeof getSelectedTimeColor === 'function' ? getSelectedTimeColor() : isLightMode ? 0x000000 : 0xffffff;
    const colCurrent = isLightMode ? 0xcc2200 : 0xff3333;
    const colEdge = isLightMode ? 0xb8860b : 0xffd23c;
    const colMonth = isLightMode ? 0x475569 : 0xb8c9dc;
    const colWeek = isLightMode ? 0x64748b : 0x8aa0b8;
    const colClip = isLightMode ? 0x0e7490 : 0x7dd3fc;

    /** Horizontal latitude ring on a sphere of radius `rAt` at local Y. */
    function addLatRingOn(rAt, yLocal, color, opacity, renderOrder, segs) {
        if (!(rAt > 0) || !isFinite(yLocal)) return;
        if (Math.abs(yLocal) >= rAt * 0.995) return;
        const rRing = Math.sqrt(Math.max(0, rAt * rAt - yLocal * yLocal));
        if (rRing < rAt * 0.015) return;
        const n = segs != null ? segs : RING_SEGS;
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI * 2;
            pts.push(Math.cos(a) * rRing, yLocal, Math.sin(a) * rRing);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity,
                depthWrite: false,
                depthTest: true
            })
        );
        line.renderOrder = renderOrder != null ? renderOrder : 17;
        line.raycast = function () {};
        group.add(line);
    }

    function addLatRing(yLocal, color, opacity, renderOrder, segs) {
        addLatRingOn(radius, yLocal, color, opacity, renderOrder, segs);
    }

    /** Great-circle on radius `rAt` (equator / meridians). */
    function addGreatCircleOn(rAt, axis, color, opacity, renderOrder) {
        if (!(rAt > 0)) return;
        const n = 64;
        const pts = [];
        const R = rAt * 1.001;
        for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI * 2;
            const c = Math.cos(a);
            const s = Math.sin(a);
            if (axis === 'y') pts.push(c * R, 0, s * R);
            else if (axis === 'x') pts.push(0, c * R, s * R);
            else pts.push(c * R, s * R, 0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity,
                depthWrite: false,
                depthTest: true
            })
        );
        line.renderOrder = renderOrder != null ? renderOrder : 19;
        line.raycast = function () {};
        line.userData = { type: 'ContextClipOutline', axis };
        group.add(line);
    }

    /**
     * Mode 2: quiet rim of the *clip* sphere (zoom-context veil) —
     * soft fill + a few outline circles. No wire cage.
     */
    if (clipR != null) {
        const clipShell = new THREE.Mesh(
            new THREE.SphereGeometry(clipR, 32, 24),
            new THREE.MeshBasicMaterial({
                color: colClip,
                transparent: true,
                opacity: isLightMode ? 0.045 : 0.06,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            })
        );
        clipShell.renderOrder = 15;
        clipShell.raycast = function () {};
        clipShell.userData = { type: 'ContextClipShell' };
        group.add(clipShell);

        // One equator + context time-edge latitude rings.
        addGreatCircleOn(clipR, 'y', colClip, isLightMode ? 0.42 : 0.55, 20);

        const clipY0s =
            typeof state.clipY0 === 'number' && isFinite(state.clipY0) ? state.clipY0 - center.y : null;
        const clipY1s =
            typeof state.clipY1 === 'number' && isFinite(state.clipY1) ? state.clipY1 - center.y : null;
        if (clipY0s != null) {
            addLatRingOn(clipR, clipY0s, colClip, isLightMode ? 0.5 : 0.62, 21, 72);
        }
        if (clipY1s != null) {
            addLatRingOn(clipR, clipY1s, colClip, isLightMode ? 0.5 : 0.62, 21, 72);
        }
    }

    function yLocalAtMs(ms) {
        const h = heightAtMs(ms);
        if (h == null) return null;
        return h - center.y;
    }

    /** Skip primary ticks that sit on a highlight ring (ms proximity). */
    function nearHighlight(ms, highlights, padMs) {
        for (let i = 0; i < highlights.length; i++) {
            if (Math.abs(ms - highlights[i]) < padMs) return true;
        }
        return false;
    }

    const highlightMs = [bounds.t0, bounds.t1, selMs];
    const nowMs = Date.now();
    if (nowMs >= bounds.t0 && nowMs <= bounds.t1) highlightMs.push(nowMs);
    const padMs = Math.max(EVENT_LIST_MS_PER_DAY * 0.35, spanMs * 0.008);

    function collectMonthStarts(t0, t1) {
        const out = [];
        const d = new Date(t0);
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        if (d.getTime() < t0) d.setMonth(d.getMonth() + 1);
        let guard = 0;
        while (d.getTime() <= t1 && guard++ < 48) {
            out.push(d.getTime());
            d.setMonth(d.getMonth() + 1);
        }
        return out;
    }
    function collectWeekStarts(t0, t1) {
        const out = [];
        const d = new Date(t0);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        if (d.getTime() < t0) d.setDate(d.getDate() + 7);
        let guard = 0;
        while (d.getTime() <= t1 && guard++ < 120) {
            out.push(d.getTime());
            d.setDate(d.getDate() + 7);
        }
        return out;
    }

    const monthStarts = collectMonthStarts(bounds.t0, bounds.t1);
    const weekStarts = collectWeekStarts(bounds.t0, bounds.t1);
    for (let i = 0; i < weekStarts.length; i++) {
        const ms = weekStarts[i];
        if (nearHighlight(ms, highlightMs, padMs)) continue;
        if (nearHighlight(ms, monthStarts, padMs)) continue;
        const yl = yLocalAtMs(ms);
        if (yl == null) continue;
        addLatRing(yl, colWeek, isLightMode ? 0.28 : 0.32, 17, RING_SEGS);
    }
    for (let i = 0; i < monthStarts.length; i++) {
        const ms = monthStarts[i];
        if (nearHighlight(ms, highlightMs, padMs)) continue;
        const yl = yLocalAtMs(ms);
        if (yl == null) continue;
        addLatRing(yl, colMonth, isLightMode ? 0.4 : 0.45, 18, RING_SEGS);
    }

    const y0 = yLocalAtMs(bounds.t0);
    const y1 = yLocalAtMs(bounds.t1);
    if (y0 != null) addLatRing(y0, colEdge, isLightMode ? 0.7 : 0.8, 20, RING_SEGS);
    if (y1 != null) addLatRing(y1, colEdge, isLightMode ? 0.7 : 0.8, 20, RING_SEGS);

    if (nowMs >= bounds.t0 && nowMs <= bounds.t1) {
        const yNow = yLocalAtMs(nowMs);
        if (yNow != null) addLatRing(yNow, colCurrent, isLightMode ? 0.75 : 0.85, 21, RING_SEGS);
    }

    const ySel = yLocalAtMs(selMs);
    if (ySel != null) addLatRing(ySel, colSelected, isLightMode ? 0.8 : 0.9, 22, RING_SEGS);

    const spineFlat = [];
    for (let i = 0; i <= samples; i++) {
        const p = earthPointAtMs(bounds.t0 + (i / samples) * spanMs);
        if (!p) continue;
        spineFlat.push(p.x - center.x, p.y - center.y, p.z - center.z);
    }
    if (spineFlat.length >= 6) {
        const spineGeo = new THREE.BufferGeometry();
        spineGeo.setAttribute('position', new THREE.Float32BufferAttribute(spineFlat, 3));
        const spine = new THREE.Line(
            spineGeo,
            new THREE.LineBasicMaterial({
                color: colSelected,
                transparent: true,
                opacity: isLightMode ? 0.4 : 0.5,
                depthWrite: false
            })
        );
        spine.renderOrder = 19;
        spine.raycast = function () {};
        group.add(spine);
    }

    sceneContentGroup.add(group);
    parentUnitTemporalVeilGroup = group;

    /**
     * Single white ring: Event Horizon ∩ local LTE canvas plane (helix tangent × orbital radial).
     * Flatten scales tangent.y → ring nearly horizontal when timeline flat.
     */
    syncContextSphereLteSlopeRing();

    if (typeof ContextSphereWarp !== 'undefined' && ContextSphereWarp.syncCameraInsideFlag) {
        try {
            ContextSphereWarp.syncCameraInsideFlag(
                typeof camera !== 'undefined' ? camera : null,
                state
            );
        } catch (e) { /* optional */ }
    }

    // Sky Canvas fills this event horizon (disc radius = sphere R; day-frame span = window).
    refreshSkyCanvasForContextSphere(z);

    if (typeof applyTimeMarkerVisibility === 'function') {
        try {
            applyTimeMarkerVisibility();
        } catch (e) { /* markers may be mid-rebuild */ }
    }

    // Visual sphere clip on time-frame + sky (rounded cut at Event Horizon).
    if (typeof refreshContextSphereVisualClip === 'function') {
        try {
            refreshContextSphereVisualClip();
        } catch (e) { /* clip optional */ }
    }
}

if (typeof window !== 'undefined') {
    /** Console: force Context Sphere rebuild + report radius / window. */
    window.debugParentUnitVeil = function () {
        try {
            updateParentUnitTemporalVeil(currentZoom);
            const b = getContextSphereTimeBoundsMs(currentZoom);
            const s = contextSphereState;
            console.info('[ContextSphere]', {
                zoom: currentZoom,
                unit: b && b.unit,
                halfCount: b && b.halfCount,
                extended: b && b.extended,
                radius: s && s.radius,
                t0: b && new Date(b.t0).toISOString(),
                t1: b && new Date(b.t1).toISOString()
            });
            return s && s.radius;
        } catch (e) {
            console.warn('[ContextSphere] failed', e);
            return -1;
        }
    };
    window.debugContextSphere = window.debugParentUnitVeil;
    window.applyCameraDistanceToFitContextSphere = applyCameraDistanceToFitContextSphere;
    window.refreshContextSphereVisualClip = refreshContextSphereVisualClip;
    window.getContextSphereLteCanvasPlaneBasis = getContextSphereLteCanvasPlaneBasis;
    window.refreshDayFrameLteSkyInterstellarWarp = refreshDayFrameLteSkyInterstellarWarp;
    window.setPreferEarthEventHorizonCamera = function (on) {
        preferEarthEventHorizonCamera = !!on;
        return preferEarthEventHorizonCamera;
    };
}

function listHorizonSegmentCountForArc(bounds, baseN, arc) {
    const dayMs = EVENT_LIST_MS_PER_DAY;
    const spanDays = bounds && bounds.t1 > bounds.t0 ? (bounds.t1 - bounds.t0) / dayMs : 7;
    const b = baseN != null ? baseN : 52;
    // Full-year hoop: denser along-arc samples so polar day/night season bands read clearly.
    if (arc && arc.fullCircle) {
        const yearish = spanDays >= 300;
        return Math.max(yearish ? 72 : 24, Math.min(yearish ? 128 : 96, Math.round(yearish ? Math.max(b, 96) : b)));
    }
    const frac = Math.max(0.06, Math.min(1, spanDays / 365));
    return Math.max(12, Math.min(96, Math.round(b * frac * 2.8)));
}

/**
 * Orbital XZ arc (radians) for the selected list time span at the context hoop height.
 * @returns {{ theta0: number, theta1: number, spanRad: number, fullCircle: boolean, thetaMid: number }}
 */
function getListContextDiscArcRad(zoomLevel, refDate) {
    const TWO_PI = Math.PI * 2;
    const earth = PLANET_DATA && PLANET_DATA.find((p) => p && p.name === 'Earth');
    if (!earth || typeof getPlanetXZAtSelectedDate !== 'function' || typeof computeSceneDateHeights !== 'function') {
        return { theta0: 0, theta1: TWO_PI, spanRad: TWO_PI, fullCircle: true, thetaMid: 0 };
    }
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const bounds = getListContextDiscArcTimeBoundsMs(z, refDate);
    let currentDateHeight;
    let selectedDateHeight;
    try {
        const heights = computeSceneDateHeights(z);
        currentDateHeight = heights.currentDateHeight;
        selectedDateHeight = heights.selectedDateHeight;
    } catch (e) {
        return { theta0: 0, theta1: TWO_PI, spanRad: TWO_PI, fullCircle: true, thetaMid: 0 };
    }

    function thetaAtMs(ms) {
        return earthOrbitAngleForSceneDate(new Date(ms), currentDateHeight);
    }

    const thetaRef = thetaAtMs(bounds.ref.getTime());
    function unwrapNear(theta, center) {
        let t = theta;
        while (t - center > Math.PI) t -= TWO_PI;
        while (t - center < -Math.PI) t += TWO_PI;
        return t;
    }

    const u0 = unwrapNear(thetaAtMs(bounds.t0), thetaRef);
    const u1 = unwrapNear(thetaAtMs(bounds.t1), thetaRef);
    let theta0 = Math.min(u0, u1);
    let theta1 = Math.max(u0, u1);
    let spanRad = theta1 - theta0;
    if (spanRad < 1e-4) {
        const pad = z === 0 ? 0.04 : 0.02;
        theta0 = thetaRef - pad;
        theta1 = thetaRef + pad;
        spanRad = theta1 - theta0;
    }
    const arcSpanMs = Math.max(0, bounds.t1 - bounds.t0);
    const yearMs = 365 * EVENT_LIST_MS_PER_DAY;
    if (spanRad >= TWO_PI - 0.02 && arcSpanMs >= yearMs * 0.92) {
        return { theta0: 0, theta1: TWO_PI, spanRad: TWO_PI, fullCircle: true, thetaMid: thetaRef };
    }
    return {
        theta0,
        theta1,
        spanRad,
        fullCircle: false,
        thetaMid: (theta0 + theta1) * 0.5
    };
}

function disposeListHorizonEarthRing() {
    if (!listHorizonEarthRingMesh) return;
    if (listHorizonEarthRingMesh.parent) listHorizonEarthRingMesh.parent.remove(listHorizonEarthRingMesh);
    listHorizonEarthRingMesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    listHorizonEarthRingMesh = null;
}

function resetListHorizonEarthRingAnimationState() {
    listHorizonEarthRingCurrentRadius = null;
    listHorizonEarthRingTargetRadius = null;
    listHorizonEarthRingCurrentInnerRadius = null;
    listHorizonEarthRingTargetInnerRadius = null;
    listHorizonEarthRingCurrentHeight = null;
    listHorizonEarthRingTargetHeight = null;
    listHorizonEarthRingEarthDistance = null;
    listHorizonEarthRingTargetZoom = null;
    listHorizonEarthRingArcKey = null;
    listHorizonHelixTimeKey = null;
    listHorizonSkyColorKey = null;
}

function listContextDiscHelixTimeKey(zoomLevel) {
    const bounds = getListContextDiscArcTimeBoundsMs(
        zoomLevel,
        typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date()
    );
    let curH = '0';
    try {
        curH = computeSceneDateHeights(zoomLevel).currentDateHeight.toFixed(4);
    } catch (eCur) { /* keep */ }
    return (
        bounds.t0 +
        ':' +
        bounds.t1 +
        ':' +
        bounds.ref.getTime() +
        ':cur' +
        curH +
        ':sr' +
        CONTEXT_ARC_SKY_RADIAL_SEGMENTS
    );
}

function listContextDiscArcKey(zoomLevel) {
    const ref = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
    const arc = getListContextDiscArcRad(zoomLevel, ref);
    let curH = '0';
    try {
        curH = computeSceneDateHeights(zoomLevel).currentDateHeight.toFixed(4);
    } catch (eCur) { /* keep */ }
    if (arc.fullCircle) return 'full:' + ref.getTime() + ':cur' + curH;
    return arc.theta0.toFixed(5) + ':' + arc.theta1.toFixed(5) + ':' + ref.getTime() + ':cur' + curH;
}

/** List ms at orbital θ along the context arc (matches {@link getListContextDiscArcRad}). */
function listHorizonMsAtArcTheta(theta, arc, bounds) {
    const TWO_PI = Math.PI * 2;
    if (!bounds || bounds.t1 < bounds.t0) return bounds ? bounds.t0 : 0;
    if (arc && arc.fullCircle) {
        let u = ((theta % TWO_PI) + TWO_PI) % TWO_PI / TWO_PI;
        return bounds.t0 + u * (bounds.t1 - bounds.t0);
    }
    const span = arc && arc.spanRad > 1e-6 ? arc.spanRad : TWO_PI;
    const t0a = arc ? arc.theta0 : 0;
    let u = (theta - t0a) / span;
    u = Math.max(0, Math.min(1, u));
    return bounds.t0 + u * (bounds.t1 - bounds.t0);
}

/** Helical sample on the list-context band (Earth orbit θ, timeline Y). */
function listHorizonHelixPointAtMs(ms, r, refCurrentHeight, refSelectedHeight, bandHalfH, bandSign) {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return { x: 0, y: 0, z: 0 };
    const h = sceneDateHeightForInstant(d);
    const angle = earthOrbitAngleForSceneDate(d, refCurrentHeight);
    const rad = Math.max(0, r);
    const y =
        bandSign === 0 ? h : h + (bandSign < 0 ? -bandHalfH : bandHalfH);
    return { x: Math.cos(angle) * rad, y, z: Math.sin(angle) * rad };
}

function listHorizonHelixPointAtTheta(theta, r, arc, bounds, refCurrentHeight, refSelectedHeight, bandHalfH, bandSign) {
    const ms = listHorizonMsAtArcTheta(theta, arc, bounds);
    return listHorizonHelixPointAtMs(ms, r, refCurrentHeight, refSelectedHeight, bandHalfH, bandSign);
}

function storeListHorizonLogicalPositions(geom) {
    if (!geom || !geom.attributes || !geom.attributes.position) return;
    geom.userData.listHorizonLogical = new Float32Array(geom.attributes.position.array);
}

/** Re-apply Event Horizon warp to day markers / sky / day-frame events (no mesh rebuild). */
function refreshLiveEventHorizonWarp() {
    const nestOn = typeof eventHorizonMode === 'string' && eventHorizonMode === 'nest';
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.applyLteDayFrameEventHorizonWarp === 'function') {
        try {
            TimeMarkers.applyLteDayFrameEventHorizonWarp();
        } catch (e) { /* optional */ }
    }
    if (!nestOn && (!dayFrameLteSkyMesh || !dayFrameLteSkyMesh.geometry)) return;
    if (dayFrameLteSkyMesh && dayFrameLteSkyMesh.geometry) {
        try {
            applyDayFrameLteSkyInterstellarWarp(dayFrameLteSkyMesh.geometry);
        } catch (e2) { /* optional */ }
    }
}

/**
 * Warp LTE day-frame sky near selected-week Event Horizon band (smooth fade).
 * Outside that band → classic helix. Inside camera → logical helix.
 */
function resolveDayFrameLteSkySourcePositions(logical) {
    const flattenAmt =
        typeof getActiveTimelineFlattenAmount === 'function' ? getActiveTimelineFlattenAmount() : 0;
    if (!(flattenAmt > 0.001) || !logical) return logical;
    const focusY =
        typeof window !== 'undefined' && typeof window.flattenTimelineFocusY === 'function'
            ? window.flattenTimelineFocusY()
            : 0;
    return flattenListHorizonPositionArray(logical, focusY, flattenAmt);
}

function applyDayFrameLteSkyInterstellarWarp(geom) {
    if (!geom || !geom.attributes || !geom.attributes.position) return;
    const logical = geom.userData.listHorizonLogical;
    if (!logical || !logical.length) return;
    const pos = geom.attributes.position.array;
    const source = resolveDayFrameLteSkySourcePositions(logical);
    const W = typeof ContextSphereWarp !== 'undefined' ? ContextSphereWarp : null;
    const state = typeof getContextSphereState === 'function' ? getContextSphereState() : contextSphereState;
    const warpOn = W && typeof W.isWarpModeEnabled === 'function' ? !!W.isWarpModeEnabled() : false;
    if (!warpOn || !W || !W.warpLtePointToRing || !state || !(state.radius > 0) || W.getCameraInsideCached()) {
        pos.set(source);
        geom.attributes.position.needsUpdate = true;
        if (geom.computeVertexNormals) geom.computeVertexNormals();
        return;
    }
    const ri = typeof geom.userData.dayFrameLteSkyRi === 'number' ? geom.userData.dayFrameLteSkyRi : 0;
    const ro =
        typeof geom.userData.dayFrameLteSkyRo === 'number'
            ? geom.userData.dayFrameLteSkyRo
            : ri + 1;
    const span = Math.max(ro - ri, 1e-6);
    const diskWidth = state.radius * 0.32;
    let basis = null;
    if (typeof getContextSphereLteCanvasPlaneBasis === 'function') {
        try {
            basis = getContextSphereLteCanvasPlaneBasis(
                state,
                typeof getActiveTimelineFlattenAmount === 'function'
                    ? getActiveTimelineFlattenAmount()
                    : 0
            );
        } catch (e) { /* optional */ }
    }
    for (let i = 0; i < source.length; i += 3) {
        const x = source[i];
        const y = source[i + 1];
        const z = source[i + 2];
        const amt =
            typeof W.getSceneYSelectedWeekWarpAmount === 'function'
                ? W.getSceneYSelectedWeekWarpAmount(y, state)
                : 0;
        if (amt <= 0.001) {
            pos[i] = x;
            pos[i + 1] = y;
            pos[i + 2] = z;
            continue;
        }
        const rH = Math.hypot(x, z);
        const radialT = Math.max(0, Math.min(1, (rH - ri) / span));
        const q = W.warpLtePointToRing(
            { x, y, z },
            state,
            { cameraInside: false, radialT, diskWidth, basis, amount: amt }
        );
        pos[i] = q.x;
        pos[i + 1] = q.y;
        pos[i + 2] = q.z;
    }
    geom.attributes.position.needsUpdate = true;
    if (geom.computeVertexNormals) geom.computeVertexNormals();
    if (geom.computeBoundingSphere) geom.computeBoundingSphere();
}

/** Re-apply Interstellar LTE sky warp on all day-frame LTE sky meshes. */
function refreshDayFrameLteSkyInterstellarWarp() {
    if (!dayFrameLteSkyMesh) return;
    dayFrameLteSkyMesh.traverse(function (child) {
        if (child && child.geometry && child.geometry.userData && child.geometry.userData.listHorizonLogical) {
            applyDayFrameLteSkyInterstellarWarp(child.geometry);
        }
    });
}

/**
 * Camera crossed Event Horizon — refresh STE spindle + near-week LTE frame/events.
 */
function onInterstellarHorizonCameraCross() {
    try {
        refreshDayFrameLteSkyInterstellarWarp();
    } catch (e) { /* optional */ }
    try {
        if (
            typeof TimeMarkers !== 'undefined' &&
            typeof TimeMarkers.applyLteDayFrameEventHorizonWarp === 'function'
        ) {
            TimeMarkers.applyLteDayFrameEventHorizonWarp();
        }
    } catch (eMarkers) { /* optional */ }
    try {
        if (typeof refreshContextSphereVisualClip === 'function') refreshContextSphereVisualClip();
    } catch (e2) { /* optional */ }
    try {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        if (gl && typeof gl.refreshAllEventLayers === 'function') gl.refreshAllEventLayers();
    } catch (e3) { /* optional */ }
}

function flattenListHorizonPositionArray(logical, focusY, amount) {
    if (!logical || logical.length < 3) return logical;
    const yScale = Math.max(0, 1 - (typeof amount === 'number' && !isNaN(amount) ? amount : 0));
    const offset = (typeof focusY === 'number' && !isNaN(focusY) ? focusY : 0) * (1 - yScale);
    const out = new Float32Array(logical.length);
    for (let i = 0; i < logical.length; i += 3) {
        out[i] = logical[i];
        out[i + 1] = logical[i + 1] * yScale + offset;
        out[i + 2] = logical[i + 2];
    }
    return out;
}

/** Deform context-arc verts to match timeline flatten (helix ↔ straight). */
function updateListHorizonContextArcFlatten(focusY, amount) {
    if (!listHorizonEarthRingMesh) return;
    listHorizonEarthRingMesh.scale.set(1, 1, 1);
    listHorizonEarthRingMesh.position.y = 0;
    listHorizonEarthRingMesh.traverse((child) => {
        const geom = child.geometry;
        if (!geom || !geom.attributes || !geom.attributes.position || !geom.userData.listHorizonLogical) {
            return;
        }
        const flat = flattenListHorizonPositionArray(geom.userData.listHorizonLogical, focusY, amount);
        geom.attributes.position.array.set(flat);
        geom.attributes.position.needsUpdate = true;
        if (geom.computeVertexNormals) geom.computeVertexNormals();
    });
}

function getListHorizonHelixBuildContext(yCenter, zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const refDate = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
    const bounds = getListContextDiscArcTimeBoundsMs(z, refDate);
    const arc = getListContextDiscArcRad(z, refDate);
    let refCurrentHeight = yCenter;
    let refSelectedHeight = yCenter;
    try {
        const heights = computeSceneDateHeights(z);
        refCurrentHeight = heights.currentDateHeight;
        refSelectedHeight = heights.selectedDateHeight;
    } catch (e) { /* keep yCenter */ }
    return { bounds, arc, refCurrentHeight, refSelectedHeight, zoomLevel: z };
}

/** Helix context-arc annulus verts sampled uniformly in time (not orbital θ). */
function appendListHorizonHelixAnnulusByTime(positions, annulusT, indices, ri, ro, nSeg, helixCtx, bandSign) {
    if (!helixCtx || !helixCtx.bounds || helixCtx.bounds.t1 <= helixCtx.bounds.t0) return;
    const n = Math.max(2, nSeg);
    const bounds = helixCtx.bounds;
    const refCur = helixCtx.refCurrentHeight;
    const refSel = helixCtx.refSelectedHeight;
    const bandHalfH = helixCtx.bandHalfH != null ? helixCtx.bandHalfH : 0;
    const base = positions.length / 3;
    for (let ring = 0; ring < 2; ring++) {
        const r = ring === 0 ? ri : ro;
        const tAttr = ring === 0 ? 0 : 1;
        for (let i = 0; i <= n; i++) {
            const ms = bounds.t0 + (i / n) * (bounds.t1 - bounds.t0);
            const p = listHorizonHelixPointAtMs(ms, r, refCur, refSel, bandHalfH, bandSign);
            positions.push(p.x, p.y, p.z);
            annulusT.push(tAttr);
        }
    }
    const innerCount = n + 1;
    for (let i = 0; i < n; i++) {
        const a = base + i;
        const b = base + i + 1;
        const c = base + innerCount + i + 1;
        const d = base + innerCount + i;
        indices.push(a, b, c, a, c, d);
    }
}

function resolveListHorizonRingRadii(z, W) {
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getListContextRingRadiiForZoom === 'function') {
        return TimeMarkers.getListContextRingRadiiForZoom(z, W);
    }
    if (typeof EventRenderer !== 'undefined' && typeof EventRenderer.getListContextRingRadiiForZoom === 'function') {
        return EventRenderer.getListContextRingRadiiForZoom(W, z);
    }
    const ro = W * 0.5;
    return { rInner: Math.max(W * 0.06, ro * 0.5), rOuter: ro };
}

function resolveListHorizonRingInnerRadius(z, W) {
    return resolveListHorizonRingRadii(z, W).rInner;
}

function resolveListHorizonRingRadius(z, W) {
    const zr = z === 0 ? 9 : z;
    return resolveListHorizonRingRadii(zr, W).rOuter;
}

/** Context band Y anchor — same height as selected time (hoops + fill share helix sampling). */
function getListHorizonContextArcYCenter(selectedDateHeight) {
    return selectedDateHeight;
}

/**
 * Transparent pass order: below LTE ribbon fill (-4) so events stay readable,
 * but above default opaque Earth (0) so the sky annulus is not depth-occluded.
 */
function getListHorizonContextRenderOrder() {
    return -6;
}

function rebuildListHorizonEarthRingMesh(outerRadius, innerRadius, yCenter, earthW, z) {
    const T = getThreeNamespace();
    if (!T || !sceneContentGroup || !isFinite(outerRadius) || !isFinite(yCenter) || !isFinite(earthW)) return;
    disposeListHorizonEarthRing();
    const extendEarth = Math.floor(z) >= 8;
    const ri = isFinite(innerRadius) ? innerRadius : resolveListHorizonRingInnerRadius(z, earthW);
    const arc = getListContextDiscArcRad(z, typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : null);
    const mesh = buildListHorizonHoopGroup(
        T,
        outerRadius,
        ri,
        earthW,
        yCenter,
        getListHorizonRingColorHex(),
        getListHorizonContextRenderOrder(),
        { extendToEarthOrbit: extendEarth, arc }
    );
    if (!mesh) return;
    sceneContentGroup.add(mesh);
    listHorizonEarthRingMesh = mesh;
    updateListHorizonSkyDiskUniforms();
    const focusY =
        typeof window.flattenTimelineFocusY === 'function'
            ? window.flattenTimelineFocusY()
            : (typeof focusPoint !== 'undefined' && focusPoint && typeof focusPoint.y === 'number'
                ? focusPoint.y
                : yCenter);
    updateListHorizonContextArcFlatten(focusY, getActiveTimelineFlattenAmount());
    listHorizonSkyColorKey = buildEarthDaylightSkyColorKey(getSkyCanvasObserverContext(z));
}

/** Legacy accent for the hoop wall (annuli use sky shader). */
function getListHorizonRingColorHex() {
    return isLightMode ? 0x0891b2 : 0x22d3ee;
}

/**
 * Ecliptic-season directions (Mar/Jun/Sep/Dec) projected to scene XZ for the list “context” sky disc:
 * uses Astronomy.Seasons when available, else approximate UTC noons.
 */
function getListHorizonSeasonSpikeThetasRad(calendarYear) {
    const earth =
        typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p && p.name === 'Earth') : null;
    if (
        !earth ||
        typeof calculateDateHeight !== 'function' ||
        typeof getPlanetXZAtSelectedDate !== 'function' ||
        typeof computeSceneDateHeights !== 'function'
    ) {
        return null;
    }
    const y = Number.isFinite(calendarYear) ? Math.floor(calendarYear) : new Date().getFullYear();
    const zl = typeof currentZoom !== 'undefined' && !isNaN(currentZoom) ? currentZoom : 9;
    let currentDateHeight;
    try {
        currentDateHeight = computeSceneDateHeights(zl).currentDateHeight;
    } catch (e) {
        return null;
    }
    if (currentDateHeight == null || isNaN(currentDateHeight)) return null;

    const dates = [];
    try {
        if (typeof Astronomy !== 'undefined' && Astronomy.Seasons) {
            const s = Astronomy.Seasons(y);
            if (s && s.mar_equinox && s.mar_equinox.date) dates.push(new Date(s.mar_equinox.date));
            if (s && s.jun_solstice && s.jun_solstice.date) dates.push(new Date(s.jun_solstice.date));
            if (s && s.sep_equinox && s.sep_equinox.date) dates.push(new Date(s.sep_equinox.date));
            if (s && s.dec_solstice && s.dec_solstice.date) dates.push(new Date(s.dec_solstice.date));
        }
    } catch (e) {
        dates.length = 0;
    }
    if (dates.length !== 4) {
        dates.length = 0;
        dates.push(
            new Date(y, 2, 20, 12, 0, 0, 0),
            new Date(y, 5, 21, 12, 0, 0, 0),
            new Date(y, 8, 22, 12, 0, 0, 0),
            new Date(y, 11, 21, 12, 0, 0, 0)
        );
    }

    const out = [];
    for (let i = 0; i < 4; i++) {
        const d = dates[i];
        if (!d || isNaN(d.getTime())) return null;
        const frac =
            d.getHours() +
            d.getMinutes() / 60 +
            d.getSeconds() / 3600 +
            d.getMilliseconds() / 3600000;
        const h = calculateDateHeight(d.getFullYear(), d.getMonth(), d.getDate(), frac);
        if (h == null || isNaN(h)) return null;
        const xz = getPlanetXZAtSelectedDate(earth, d, currentDateHeight, h);
        if (!xz || isNaN(xz.x) || isNaN(xz.z)) return null;
        out.push(Math.atan2(xz.z, xz.x));
    }
    return out;
}

/**
 * Normalize context-arc annulus radii. Classic onion: if band too thin, expand inward
 * (legacy 0.38·ro). Singular Earth-orbit stack: keep thin band — never smash ri sunward.
 */
function normalizeListHorizonAnnulusRadii(rInner, rOuter) {
    const ro = Math.max(0, rOuter);
    let ri = Math.max(0, rInner);
    if (ro < 1e-4) return { ri: 0, ro: 0, ok: false };
    const singular =
        typeof window !== 'undefined' &&
        typeof window.getSingularBandMode === 'function' &&
        !!window.getSingularBandMode();
    if (ri >= ro - ro * 0.04) {
        if (singular) {
            // Preserve mid-radius; enforce a tiny visible gap only.
            const mid = (ri + ro) * 0.5;
            const half = Math.max(ro * 0.008, (ro - ri) * 0.5, mid * 0.006);
            ri = Math.max(0, mid - half);
            return { ri, ro: mid + half, ok: true };
        }
        ri = Math.max(0, ro * 0.38);
    }
    return { ri, ro, ok: true };
}

/**
 * Annulus mesh for season spikes (list-context band only — no fan to the Sun).
 * @param {object} [arc] - from {@link getListContextDiscArcRad}; omit for full circle.
 * @param {object} [helixCtx] - from {@link getListHorizonHelixBuildContext}; helical band when set.
 */
function buildListHorizonContextAnnulusGeometry(THREE, rInner, rOuter, y, nSeg, arc, helixCtx) {
    const TWO_PI = Math.PI * 2;
    const norm = normalizeListHorizonAnnulusRadii(rInner, rOuter);
    if (!norm.ok || !THREE) return null;
    const ri = norm.ri;
    const ro = norm.ro;

    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const t1 = fullCircle ? TWO_PI : arc.theta1;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, t1 - t0);
    const n = fullCircle
        ? Math.max(24, Math.min(96, nSeg))
        : Math.max(12, Math.min(96, Math.round(nSeg * (span / TWO_PI))));

    const positions = [];
    const indices = [];
    const useHelix = helixCtx && helixCtx.bounds;

    if (useHelix) {
        const nTime = listHorizonSegmentCountForArc(helixCtx.bounds, nSeg, arc);
        appendListHorizonHelixAnnulusByTime(positions, [], indices, ri, ro, nTime, helixCtx, 0);
    } else if (fullCircle) {
        for (let ring = 0; ring < 2; ring++) {
            const r = ring === 0 ? ri : ro;
            for (let i = 0; i < n; i++) {
                const theta = (i / n) * TWO_PI;
                positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
            }
        }
        for (let i = 0; i < n; i++) {
            const i1 = (i + 1) % n;
            indices.push(i, i1, n + i1, i, n + i1, n + i);
        }
    } else {
        for (let ring = 0; ring < 2; ring++) {
            const r = ring === 0 ? ri : ro;
            for (let i = 0; i <= n; i++) {
                const theta = t0 + (i / n) * span;
                positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
            }
        }
        const innerCount = n + 1;
        for (let i = 0; i < n; i++) {
            indices.push(i, i + 1, innerCount + i + 1, i, innerCount + i + 1, innerCount + i);
        }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    if (useHelix) storeListHorizonLogicalPositions(geom);
    return geom;
}

/**
 * Soft “diffraction spike” overlay on the list-context annulus only (solstice/equinox directions).
 */
function buildListHorizonSeasonSpikeOverlayMesh(THREE, rInner, rOuter, yCenter, nSeg, edgeColorHex, thetasRad4, renderOrderBase, arc, helixCtx) {
    if (!THREE || !thetasRad4 || thetasRad4.length !== 4) return null;
    const norm = normalizeListHorizonAnnulusRadii(rInner, rOuter);
    if (!norm.ok) return null;
    const ri = norm.ri;
    const ro = norm.ro;
    const geom = buildListHorizonContextAnnulusGeometry(THREE, ri, ro, yCenter, nSeg, arc, helixCtx);
    if (!geom) return null;

    const edge = new THREE.Color(edgeColorHex != null ? edgeColorHex : 0x22d3ee);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uEdgeColor: { value: edge },
            uInnerRadius: { value: ri },
            uOuterRadius: { value: ro },
            uTheta: {
                value: new THREE.Vector4(
                    thetasRad4[0],
                    thetasRad4[1],
                    thetasRad4[2],
                    thetasRad4[3]
                )
            }
        },
        vertexShader: [
            'varying vec2 vXZ;',
            'void main() {',
            '  vXZ = vec2(position.x, position.z);',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n'),
        fragmentShader: [
            'precision mediump float;',
            'uniform vec3 uEdgeColor;',
            'uniform float uInnerRadius;',
            'uniform float uOuterRadius;',
            'uniform vec4 uTheta;',
            'varying vec2 vXZ;',
            'float spikeAt(float phi, float r, float theta) {',
            '  float d = abs(phi - theta);',
            '  d = min(d, 6.28318530718 - d);',
            '  float perp = r * sin(d);',
            '  float span = max(uOuterRadius - uInnerRadius, 0.0001);',
            '  float w = 0.034 * span + 0.09 * (r - uInnerRadius);',
            '  return exp(-(perp * perp) / (w * w + 0.00015));',
            '}',
            'void main() {',
            '  float r = length(vXZ);',
            '  if (r < uInnerRadius - 0.002 || r > uOuterRadius + 0.002) discard;',
            '  float phi = atan(vXZ.y, vXZ.x);',
            '  float s = spikeAt(phi, r, uTheta.x) + spikeAt(phi, r, uTheta.y)',
            '          + spikeAt(phi, r, uTheta.z) + spikeAt(phi, r, uTheta.w);',
            '  s = min(s, 3.4);',
            '  float span = max(uOuterRadius - uInnerRadius, 0.0001);',
            '  float bandT = clamp((r - uInnerRadius) / span, 0.0, 1.0);',
            '  float rim = pow(bandT, 0.48);',
            '  float a = s * (0.07 + 0.62 * rim) * 0.38;',
            '  vec3 base = mix(vec3(1.0), uEdgeColor, 0.5);',
            '  gl_FragColor = vec4(base, a);',
            '}'
        ].join('\n'),
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geom, mat);
    const roBase = renderOrderBase != null ? renderOrderBase : 7;
    mesh.renderOrder = roBase + 1;
    mesh.userData = { type: 'ListHorizonSeasonSpikes' };
    return mesh;
}

/** World-space Sun position for list-context sky (timeline axis). */
function getListHorizonSkySunPositionWorld() {
    const T = getThreeNamespace();
    if (!T) return null;
    if (sunMesh && sunMesh.position) {
        return sunMesh.position.clone();
    }
    const y =
        typeof listHorizonEarthRingCurrentHeight === 'number' && isFinite(listHorizonEarthRingCurrentHeight)
            ? listHorizonEarthRingCurrentHeight
            : typeof focusPoint !== 'undefined' && focusPoint && typeof focusPoint.y === 'number'
              ? focusPoint.y
              : 0;
    return new T.Vector3(0, y, 0);
}

function isSkyDiskShiftPreviewActive() {
    return typeof window.getCircadianShortEventsShiftPreview === 'function' &&
        !!window.getCircadianShortEventsShiftPreview();
}

function applySkyDiskOpacityForShift(mesh) {
    if (!mesh || !mesh.isMesh || !mesh.material) return;
    const ud = mesh.userData || {};
    if (!ud.listHorizonSkyFill && ud.type !== 'EarthDaylightSky' && ud.type !== 'DayFrameLteSky') return;
    if (typeof ud.skyDiskBaseOpacity !== 'number') {
        ud.skyDiskBaseOpacity = mesh.material.opacity;
    }
    const target = isSkyDiskShiftPreviewActive()
        ? LIST_HORIZON_SKY_DISK_SHIFT_OPACITY
        : ud.skyDiskBaseOpacity;
    if (Math.abs(mesh.material.opacity - target) > 1e-4) {
        mesh.material.opacity = target;
    }
}

/** Sky annulus + Earth daylight disk opacity while Shift peeks fore/aft events. */
function updateListHorizonSkyDiskUniforms() {
    const roots = [listHorizonEarthRingMesh, earthDaylightSkyMesh, dayFrameLteSkyMesh];
    for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        if (!root || !root.traverse) continue;
        root.traverse((child) => applySkyDiskOpacityForShift(child));
    }
}

function getSolarAltitudeSeriesForCalendarDate(lat, lon, date) {
    if (lon == null || isNaN(lon)) return null;
    const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    const dayKey = d.toISOString().slice(0, 10);
    const n = 48; // denser than hourly — sunrise/sunset drift smoothly along year arc
    const ck = dayKey + ':' + lat.toFixed(2) + ':' + lon.toFixed(2) + ':n' + n;
    if (contextArcSolarAltitudeCache.has(ck)) return contextArcSolarAltitudeCache.get(ck);
    const alts = new Array(n);
    const step = 24 / n;
    for (let i = 0; i < n; i++) {
        alts[i] = solarAltitudeDegAtObserver(lat, lon, d, (i + 0.5) * step);
    }
    if (contextArcSolarAltitudeCache.size >= CONTEXT_ARC_SOLAR_CACHE_MAX) {
        contextArcSolarAltitudeCache.clear();
    }
    contextArcSolarAltitudeCache.set(ck, alts);
    return alts;
}

function contextArcDiskHourFromRadialT(radialT) {
    const t = Math.max(0, Math.min(1, radialT));
    // Singular day frame: radialT 0 = midnight (inner, sunward / pedagogical L1),
    // 1 = end of day (outer, anti-sunward / pedagogical L2).
    // Span = circadian noon↔midnight hand diameter. Sample inside band for edge colors.
    return 0.5 + t * 23;
}

function skyColorForContextArcAt(observerCtx, ms, radialT, isLight, edgeColorHex) {
    const diskHour = contextArcDiskHourFromRadialT(radialT);
    let weights;
    if (!observerCtx || observerCtx.lon == null) {
        weights = skyDiurnalWeightsAtHour(diskHour);
    } else {
        const alts = getSolarAltitudeSeriesForCalendarDate(
            observerCtx.lat,
            observerCtx.lon,
            new Date(ms)
        );
        weights = skyDiurnalWeightsForContextArcHour(alts, diskHour);
    }
    let col = skyColorFromDiurnalWeights(weights, radialT, isLight, edgeColorHex);
    const T = getThreeNamespace();
    if (T) col = applySelectedHourSkyHighlight(col, diskHour, observerCtx, T, isLight);
    // Keep night readable without turning whole arc into legacy blue gradient.
    if (col && col.lerp) {
        const legacy = skyAnnulusColorFromT(radialT, isLight, edgeColorHex);
        const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
        const floorMix = Math.max(0, Math.min(0.16, (0.16 - lum) * 1.6));
        if (floorMix > 1e-4) col.lerp(legacy, floorMix);
    }
    return col;
}

function resolveContextArcVertexMsAndRadial(i, pos, ri, ro, opts) {
    const bounds = opts && opts.bounds;
    const arc = opts && opts.arc;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    const span = Math.max(ro - ri, 1e-4);
    let radialT = Math.max(0, Math.min(1, (r - ri) / span));
    let ms = bounds && bounds.t0 != null ? bounds.t0 : Date.now();

    if (opts && opts.layout === 'helixStrip' && opts.helixInnerVertexCount > 0) {
        const rowLen = opts.helixInnerVertexCount;
        const timeIdx = i % rowLen;
        const ring = Math.floor(i / rowLen);
        const nRadial = opts.helixRadialSegments > 0
            ? opts.helixRadialSegments
            : Math.max(1, Math.floor((opts.helixRingCount || 2) - 1));
        radialT = ring / nRadial;
        const nHelix = Math.max(1, rowLen - 1);
        if (bounds && bounds.t1 > bounds.t0) {
            ms = bounds.t0 + (timeIdx / nHelix) * (bounds.t1 - bounds.t0);
        }
    } else if (bounds && arc && typeof listHorizonMsAtArcTheta === 'function') {
        const theta = Math.atan2(z, x);
        ms = listHorizonMsAtArcTheta(theta, arc, bounds);
    }
    return { ms, radialT };
}

/**
 * Context-arc sky: along arc = calendar date (polar day/night by season); radial = hour (inner midnight → outer).
 */
function applyContextArcSkyVertexColors(geom, ri, ro, zoomLevel, opts) {
    const T = getThreeNamespace();
    if (!T || !geom || !geom.attributes || !geom.attributes.position) return;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const refDate = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
    const bounds = (opts && opts.bounds) || getListContextDiscArcTimeBoundsMs(z, refDate);
    const arc = (opts && opts.arc) || getListContextDiscArcRad(z, refDate);
    const colorOpts = Object.assign({ bounds, arc }, opts || {});
    const edgeHex = getListHorizonRingColorHex();
    const observerCtx = getSkyCanvasObserverContext(z);
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const sample = resolveContextArcVertexMsAndRadial(i, pos, ri, ro, colorOpts);
        const col = skyColorForContextArcAt(observerCtx, sample.ms, sample.radialT, isLightMode, edgeHex);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geom.userData = geom.userData || {};
    geom.userData.contextArcSkyColorKey = buildEarthDaylightSkyColorKey(observerCtx);
    if (geom.attributes.color) geom.attributes.color.needsUpdate = true;
}

function refreshListHorizonContextArcSkyColors(zoomLevel) {
    if (!listHorizonEarthRingMesh || !listHorizonEarthRingMesh.traverse) return;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const refDate = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
    const bounds = getListContextDiscArcTimeBoundsMs(z, refDate);
    const arc = getListContextDiscArcRad(z, refDate);
    const observerCtx = getSkyCanvasObserverContext(z);
    const colorKey = buildEarthDaylightSkyColorKey(observerCtx);
    listHorizonEarthRingMesh.traverse((child) => {
        const geom = child.geometry;
        const ud = child.userData || {};
        if (!geom || !ud.listHorizonSkyFill) return;
        if (geom.userData.contextArcSkyColorKey === colorKey) return;
        const ri = geom.userData.contextArcSkyRi != null ? geom.userData.contextArcSkyRi : ud.listInnerRadius;
        const ro = geom.userData.contextArcSkyRo != null ? geom.userData.contextArcSkyRo : ud.listOuterRadius;
        if (ri == null || ro == null) return;
        applyContextArcSkyVertexColors(geom, ri, ro, z, {
            bounds,
            arc,
            layout: geom.userData.contextArcSkyLayout,
            helixInnerVertexCount: geom.userData.contextArcSkyInnerCount,
            helixRadialSegments: geom.userData.contextArcSkyRadialSegments,
            helixRingCount: geom.userData.contextArcSkyRingCount
        });
    });
    listHorizonSkyColorKey = colorKey;
}

/** Radial band color t∈[0,1]: inner zenith → outer cyan hoop. */
function skyAnnulusColorFromT(t, isLight, edgeColorHex) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.2, g: 0.5, b: 0.8 };
    const light = !!isLight;
    const u = Math.max(0, Math.min(1, t));
    const inner = new T.Color(light ? 0x5a9ad0 : 0x3a6eb0);
    const mid = new T.Color(light ? 0x9ed0f8 : 0x5aa8e0);
    const hi = new T.Color(light ? 0xc8ecff : 0x7ec8f5);
    const edge = new T.Color(edgeColorHex != null ? edgeColorHex : light ? 0x22b8d8 : 0x4ae0ff);
    const c = inner.clone();
    if (u < 0.55) {
        c.lerp(mid, u / 0.55);
    } else {
        c.lerp(hi, (u - 0.55) / 0.45);
    }
    if (u > 0.68) {
        c.lerp(edge, (u - 0.68) / 0.32);
    }
    return c;
}

function applySkyAnnulusVertexColors(geom, ri, ro, isLight, edgeColorHex, zoomLevel, arcOpts) {
    void isLight;
    void edgeColorHex;
    applyContextArcSkyVertexColors(geom, ri, ro, zoomLevel, Object.assign({ layout: 'annulus' }, arcOpts || {}));
    if (geom && geom.userData) {
        geom.userData.contextArcSkyRi = ri;
        geom.userData.contextArcSkyRo = ro;
        geom.userData.contextArcSkyLayout = 'annulus';
    }
}

/**
 * STE inside Sky Canvas (Earth daylight disc).
 * Always on when Event Horizon exists — visible from outside through the shell too.
 */
function isEarthDaylightSkyZoom(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : currentZoom;
    if (z === 1) return false; // no Context Sphere at Century
    if (typeof tourMinimalOrbitMode !== 'undefined' && tourMinimalOrbitMode) return false;
    return true;
}

/** Circadian day/clock/moment zooms for timeseries arcs / ATC guides (not all STE-sky zooms). */
function isEarthDailyCircadianSkyZoom(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : currentZoom;
    return z === 0 || z === 7 || z === 8 || z === 9;
}

window.getFocusTargetOverride = function () {
    return focusTargetOverride;
};

window.refreshGeophysicalShells = function () {
    if (typeof window.refreshIonosphereShells === 'function') window.refreshIonosphereShells();
    if (typeof window.refreshMagnetosphereShells === 'function') window.refreshMagnetosphereShells();
};

window.refreshIonosphereShells = function () {
    const earth = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
    if (!earth || typeof IonosphereShell === 'undefined') return;
    if (IonosphereShell.ensureShellGroup) IonosphereShell.ensureShellGroup(earth);
    if (IonosphereShell.refreshShellGroup) {
        IonosphereShell.refreshShellGroup(earth, getSelectedDateTime(), currentZoom);
    }
};

window.refreshMagnetosphereShells = function () {
    const earth = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
    if (!earth || typeof MagnetosphereShell === 'undefined') return;
    if (MagnetosphereShell.ensureMagnetosphereShells) MagnetosphereShell.ensureMagnetosphereShells(earth);
    if (MagnetosphereShell.refreshMagnetosphereShells) {
        MagnetosphereShell.refreshMagnetosphereShells(earth, getSelectedDateTime(), currentZoom);
    }
};

/** Sky zooms show all timeseries; month/week show sleep on the selected day only. */
function isTimeseriesArcZoom(zoomLevel) {
    return isEarthDailyCircadianSkyZoom(zoomLevel) || zoomLevel === 5 || zoomLevel === 7;
}

function shouldAttachTimeseriesArcGroup(zoomLevel) {
    if (!isTimeseriesArcZoom(zoomLevel)) return false;
    if (isEarthDailyCircadianSkyZoom(zoomLevel)) return true;
    return typeof circadianState !== 'undefined' && circadianState !== 'off';
}

/**
 * Timeseries-event arcs (Garmin HR/sleep, ...) flow in through the normal event ingest, which can
 * arrive after createPlanets. Lazily attach the arc group as soon as data exists at a sky zoom,
 * without forcing a full scene rebuild. createPlanets clears + recreates it on the next rebuild.
 */
function ensureTimeseriesArcGroup() {
    if (typeof TimeseriesRenderer === 'undefined' || typeof TimeseriesRenderer.hasData !== 'function') return;
    if (typeof sceneContentGroup === 'undefined' || !sceneContentGroup) return;
    if (!shouldAttachTimeseriesArcGroup(currentZoom)) return;
    if (!TimeseriesRenderer.hasData()) return;
    for (let i = 0; i < circadianWorldlines.length; i++) {
        const ln = circadianWorldlines[i];
        if (ln && ln.userData && ln.userData.circadianTimeseriesAnim) return; // already attached
    }
    const tsGroup = TimeseriesRenderer.createGroup();
    if (tsGroup) {
        tsGroup.userData.spanDays = circadianSpanDaysForZoom(currentZoom);
        sceneContentGroup.add(tsGroup);
        circadianWorldlines.push(tsGroup);
    }
}

/** Faint ATC band guide rings on day disks (sky zooms). */
function ensureAtcGuideGroup() {
    if (typeof AtcBand === 'undefined' || typeof AtcBand.createGuideGroup !== 'function') return;
    if (typeof sceneContentGroup === 'undefined' || !sceneContentGroup) return;
    if (!isEarthDailyCircadianSkyZoom(currentZoom)) return;
    if (typeof circadianState !== 'undefined' && circadianState === 'off') return;
    for (let i = circadianWorldlines.length - 1; i >= 0; i--) {
        const ln = circadianWorldlines[i];
        if (ln && ln.userData && ln.userData.atcGuideAnim) {
            if (ln.userData.atcGuideVersion === 3) return;
            if (sceneContentGroup) sceneContentGroup.remove(ln);
            circadianWorldlines.splice(i, 1);
            break;
        }
    }
    const currentHeight = typeof selectedDateHeight !== 'undefined' && !isNaN(selectedDateHeight)
        ? selectedDateHeight
        : currentDateHeight;
    const guideGroup = AtcBand.createGuideGroup(currentHeight, {});
    if (guideGroup) {
        sceneContentGroup.add(guideGroup);
        circadianWorldlines.push(guideGroup);
    }
}

function skySmoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 1e-6)));
    return t * t * (3 - 2 * t);
}

/**
 * Hour on the orbital clock at azimuth φ (local XZ). `midnightAzimuth` = direction opposite the Sun.
 * Noon (hour 12) sits at midnightAzimuth + π (local +Z when the sky group is sun-aligned).
 */
function orbitalClockHourAtPhi(phi, midnightAzimuth) {
    let h = ((midnightAzimuth - phi) * 12) / Math.PI;
    h = h % 24;
    if (h < 0) h += 24;
    return h;
}

function orbitalClockHourAtPhiSunward(phi, sunwardAzimuth) {
    return orbitalClockHourAtPhi(phi, sunwardAzimuth - Math.PI);
}

/** Hours from solar noon (0 at 12:00, 12 at midnight). */
function hourDistFromSolarNoon(h) {
    let d = Math.abs(h - 12);
    if (d > 12) d = 24 - d;
    return d;
}

/** Weights for day / dawn / dusk / twilight / night (sum ≈ 1). Day peak at noon; twin twilight at both terminators. */
function skyDiurnalWeightsAtHour(h) {
    const dn = hourDistFromSolarNoon(h);
    const day = 1 - skySmoothstep(5.5, 6.5, dn);
    const golden = skySmoothstep(4.6, 5.8, dn) * (1 - skySmoothstep(6.0, 7.4, dn));
    const dawn = h < 12 ? golden : 0;
    const dusk = h >= 12 ? golden : 0;
    const twi = skySmoothstep(6.0, 8.0, dn) * (1 - skySmoothstep(8.6, 10.4, dn));
    let night = 1 - Math.min(1, day + dawn + dusk + twi);
    if (night < 0) night = 0;
    return { day, dawn, dusk, twi, night };
}

function normalizeSkyObserverLon(lonDeg) {
    let lon = lonDeg;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
}

/** Observer lat/lon + selected instant for sky canvas (EarthGlobe chain: URL → geo → events → timezone). */
function getSkyCanvasObserverContext(zoomLevel) {
    const zl = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    let selectedDate = new Date();
    if (typeof getSelectedDateTime === 'function') {
        const sel = getSelectedDateTime();
        if (sel instanceof Date && !isNaN(sel.getTime())) selectedDate = sel;
    }
    let lat = 0;
    let lon = null;
    if (typeof EarthGlobe !== 'undefined' && typeof EarthGlobe.getObserver === 'function') {
        const obs = EarthGlobe.getObserver(selectedDate, zl);
        if (obs) {
            if (obs.lat != null && !isNaN(obs.lat)) lat = obs.lat;
            if (obs.lon != null && !isNaN(obs.lon)) lon = normalizeSkyObserverLon(obs.lon);
        }
    }
    let observerHour = 12;
    if (lon != null && typeof EarthGlobe !== 'undefined' && typeof EarthGlobe.getSceneHourDecimal === 'function') {
        observerHour = EarthGlobe.getSceneHourDecimal(selectedDate, lon);
    } else {
        observerHour =
            selectedDate.getHours() +
            selectedDate.getMinutes() / 60 +
            selectedDate.getSeconds() / 3600;
    }
    return { lat, lon, selectedDate, observerHour };
}

function buildEarthDaylightSkyColorKey(ctx) {
    const dayKey = ctx.selectedDate.toISOString().slice(0, 10);
    const latQ = Math.round(ctx.lat * 4) / 4;
    const lonQ = ctx.lon != null ? Math.round(ctx.lon * 4) / 4 : 'na';
    const hourQ = Math.round(ctx.observerHour * 12) / 12;
    return `${dayKey}:${latQ}:${lonQ}:${hourQ}:${isLightMode ? 1 : 0}`;
}

function instantAtObserverLocalHour(selectedDate, lonDeg, hourDecimal) {
    const ref = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
    const h = ((hourDecimal % 24) + 24) % 24;
    const utcH = h - normalizeSkyObserverLon(lonDeg) / 15;
    const dayStart = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
    return new Date(dayStart + utcH * 3600000);
}

function solarAltitudeDegAtObserver(lat, lon, selectedDate, hourDecimal) {
    if (
        lon == null ||
        isNaN(lon) ||
        typeof Astronomy === 'undefined' ||
        !Astronomy.Observer ||
        !Astronomy.Equator ||
        !Astronomy.Horizon ||
        !Astronomy.MakeTime ||
        !Astronomy.Body
    ) {
        return null;
    }
    try {
        const instant = instantAtObserverLocalHour(selectedDate, lon, hourDecimal);
        const obs = new Astronomy.Observer(lat, lon, 0);
        const t = Astronomy.MakeTime(instant);
        const eq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
        return Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal').altitude;
    } catch (e) {
        return null;
    }
}

function getObserverSolarAltitudeSeries(ctx) {
    if (!ctx || ctx.lon == null) return null;
    const key =
        ctx.selectedDate.toISOString().slice(0, 10) +
        ':' +
        ctx.lat.toFixed(2) +
        ':' +
        ctx.lon.toFixed(2);
    if (earthDaylightSkyAltitudeCache.key === key && earthDaylightSkyAltitudeCache.alts) {
        return earthDaylightSkyAltitudeCache.alts;
    }
    const alts = new Array(24);
    for (let h = 0; h < 24; h++) {
        alts[h] = solarAltitudeDegAtObserver(ctx.lat, ctx.lon, ctx.selectedDate, h + 0.5);
    }
    earthDaylightSkyAltitudeCache = { key, alts };
    return alts;
}

function interpolateObserverSolarAltitude(alts, hour) {
    if (!alts || !alts.length) return null;
    const n = alts.length;
    const h = ((hour % 24) + 24) % 24;
    const t = (h / 24) * n;
    const i = Math.floor(t) % n;
    const f = t - Math.floor(t);
    const a0 = alts[i];
    const a1 = alts[(i + 1) % n];
    if (a0 == null || a1 == null || isNaN(a0) || isNaN(a1)) return null;
    return a0 + f * (a1 - a0);
}

/** Circular hour distance on 24h clock (0–12). */
function skyHourCircularDist(a, b) {
    let d = Math.abs(a - b) % 24;
    if (d > 12) d = 24 - d;
    return d;
}

/** Soft bump in hour-space — stable radial width as sunrise/sunset drift through the year. */
function skySoftBumpAtHour(hour, center, halfWidthHours) {
    if (center == null || isNaN(center) || !(halfWidthHours > 0)) return 0;
    const d = skyHourCircularDist(hour, center);
    const w = halfWidthHours;
    // 1 at center → 0 at 2·halfWidth; smoothstep so neighboring days blend.
    return 1 - skySmoothstep(0, w * 2, d);
}

/**
 * Sunrise / sunset hours from altitude series (0° crossings).
 * Null when polar day/night (no crossing) — twilight then falls back to altitude-only.
 */
function findSolarHorizonCrossings(alts) {
    if (!alts || alts.length < 2) return { sunrise: null, sunset: null };
    const n = alts.length;
    const step = 24 / n;
    let sunrise = null;
    let sunset = null;
    for (let i = 0; i < n; i++) {
        const a0 = alts[i];
        const a1 = alts[(i + 1) % n];
        if (a0 == null || a1 == null || isNaN(a0) || isNaN(a1)) continue;
        if (a0 === a1) continue;
        // Sample i is at local hour (i+0.5)*step
        const h0 = (i + 0.5) * step;
        if (a0 < 0 && a1 >= 0 && sunrise == null) {
            const u = (0 - a0) / (a1 - a0);
            sunrise = (h0 + u * step + 24) % 24;
        } else if (a0 >= 0 && a1 < 0 && sunset == null) {
            const u = (0 - a0) / (a1 - a0);
            sunset = (h0 + u * step + 24) % 24;
        }
    }
    return { sunrise, sunset };
}

/** Diurnal palette from true solar altitude at the observer (latitude + season on selected day). */
function skyDiurnalWeightsFromSolarAltitude(altDeg, hourDecimal) {
    if (altDeg == null || isNaN(altDeg)) return skyDiurnalWeightsAtHour(hourDecimal);
    const day = skySmoothstep(-0.5, 6, altDeg);
    let golden =
        skySmoothstep(-1.5, 0.5, altDeg) * (1 - skySmoothstep(2, 5, altDeg)) * (1 - day);
    if (golden < 0) golden = 0;
    const dawn = hourDecimal < 12 ? golden : 0;
    const dusk = hourDecimal >= 12 ? golden : 0;
    let twi =
        skySmoothstep(-8.5, -0.5, altDeg) * (1 - skySmoothstep(-0.5, 2, altDeg)) * (1 - day);
    if (twi < 0) twi = 0;
    let night = 1 - Math.min(1, day + dawn + dusk + twi);
    if (night < 0) night = 0;
    return { day, dawn, dusk, twi, night };
}

/**
 * Context-arc diurnal weights: daylight from altitude (width tracks season);
 * dawn/dusk as soft hour-bumps on true sunrise/sunset so twilight tracks the
 * terminator with stable radial width (no 1-ring flicker as times drift).
 */
function skyDiurnalWeightsForContextArcHour(alts, diskHour) {
    if (!alts || !alts.length) return skyDiurnalWeightsAtHour(diskHour);
    const alt = interpolateObserverSolarAltitude(alts, diskHour);
    if (alt == null || isNaN(alt)) return skyDiurnalWeightsAtHour(diskHour);

    // Daylight width — continuous in altitude, expands/contracts with season.
    const day = skySmoothstep(-0.5, 5, alt);
    const crossings = findSolarHorizonCrossings(alts);

    // ~1.35h half-width ≈ 2–3 radial rings at 24-ring resolution; moves with terminator.
    const twHalf = 1.35;
    let dawn = 0;
    let dusk = 0;
    if (crossings.sunrise != null) {
        dawn = skySoftBumpAtHour(diskHour, crossings.sunrise, twHalf);
    }
    if (crossings.sunset != null) {
        dusk = skySoftBumpAtHour(diskHour, crossings.sunset, twHalf);
    }
    // No horizon crossing (polar day/night): faint altitude-only golden if sun skims horizon.
    if (crossings.sunrise == null && crossings.sunset == null) {
        const skim =
            skySmoothstep(-2, 1, alt) * (1 - skySmoothstep(3, 8, alt)) * (1 - day);
        if (diskHour < 12) dawn = skim;
        else dusk = skim;
    }

    // Civil twilight below horizon — also continuous in altitude.
    let twi =
        skySmoothstep(-9, -5, alt) * (1 - skySmoothstep(-1.5, 1, alt)) * (1 - day);
    if (twi < 0) twi = 0;

    // Don't let golden fight full daylight / deep night.
    dawn *= 1 - day * 0.85;
    dusk *= 1 - day * 0.85;

    let night = 1 - Math.min(1, day + dawn + dusk + twi);
    if (night < 0) night = 0;
    return { day, dawn, dusk, twi, night };
}

function skyDiurnalWeightsForObserverDiskHour(diskHour, observerCtx, altitudeSeries) {
    if (!observerCtx || observerCtx.lon == null) return skyDiurnalWeightsAtHour(diskHour);
    const alt = interpolateObserverSolarAltitude(altitudeSeries, diskHour);
    return skyDiurnalWeightsFromSolarAltitude(alt, diskHour);
}

function skySelectedHourHighlightMul(diskHour, observerHour) {
    if (observerHour == null || isNaN(observerHour)) return 1;
    let d = Math.abs(diskHour - observerHour);
    if (d > 12) d = 24 - d;
    return 1 + 0.34 * Math.exp(-(d * d) / 1.44);
}

function applySelectedHourSkyHighlight(col, diskHour, observerCtx, THREE, isLight) {
    if (!col || !observerCtx || observerCtx.lon == null || !THREE || !THREE.Color) return col;
    // Coarse zooms (century→month): selected-hour stripe reads as twilight “phasing” on the arc.
    // Keep highlight for week/day/clock where one day fills the band.
    const z = typeof currentZoom === 'number' ? currentZoom : 9;
    if (z <= 5) return col;
    const mul = skySelectedHourHighlightMul(diskHour, observerCtx.observerHour);
    if (mul <= 1.002) return col;
    const hi = new THREE.Color(isLight ? 0xd4ecff : 0x6aaeff);
    const out = col.clone ? col.clone() : new THREE.Color(col.r, col.g, col.b);
    out.lerp(hi, Math.min(1, ((mul - 1) / 0.34) * 0.42));
    return out;
}

function skyGoldenColorFromT(t, isLight, isDawn) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.55, g: 0.38, b: 0.28 };
    const u = Math.max(0, Math.min(1, t));
    const zenith = new T.Color(isLight ? 0xffd8a0 : 0xffb070);
    const mid = new T.Color(isLight ? 0xffb888 : 0xff8a5a);
    const horizon = new T.Color(isLight ? 0xa8d8f8 : 0x6a9ec8);
    const rose = new T.Color(isLight ? 0xffc0d4 : 0xc06080);
    const c = zenith.clone();
    if (u < 0.5) {
        c.lerp(isDawn ? mid : rose, u / 0.5);
    } else {
        c.lerp(horizon, (u - 0.5) / 0.5);
    }
    if (u > 0.72) {
        c.lerp(horizon, (u - 0.72) / 0.28);
    }
    return c;
}

function skyTwilightColorFromT(t, isLight) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.12, g: 0.14, b: 0.28 };
    const u = Math.max(0, Math.min(1, t));
    const zenith = new T.Color(isLight ? 0x5a6a9a : 0x2a3460);
    const mid = new T.Color(isLight ? 0x8a7aaa : 0x4a4578);
    const horizon = new T.Color(isLight ? 0xd89ab8 : 0x8a5a90);
    const c = zenith.clone();
    c.lerp(mid, u < 0.55 ? u / 0.55 : 1);
    if (u > 0.45) {
        c.lerp(horizon, (u - 0.45) / 0.55);
    }
    return c;
}

function skyNightColorFromT(t, isLight) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.02, g: 0.03, b: 0.06 };
    const u = Math.max(0, Math.min(1, t));
    // Keep night clearly darker than day, but lift enough to read under opaque scene.
    const inner = new T.Color(isLight ? 0x121a2c : 0x0a1020);
    const outer = new T.Color(isLight ? 0x1c2840 : 0x121a30);
    const c = inner.clone();
    c.lerp(outer, u);
    return c;
}

function skyColorFromDiurnalWeights(weights, radialT, isLight, edgeColorHex) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.1, g: 0.2, b: 0.35 };
    const w = weights;
    const sum = w.day + w.dawn + w.dusk + w.twi + w.night;
    if (sum < 1e-6) {
        return skyNightColorFromT(radialT, isLight);
    }
    const dayC = skyAnnulusColorFromT(radialT, isLight, edgeColorHex);
    const dawnC = skyGoldenColorFromT(radialT, isLight, true);
    const duskC = skyGoldenColorFromT(radialT, isLight, false);
    const twiC = skyTwilightColorFromT(radialT, isLight);
    const nightC = skyNightColorFromT(radialT, isLight);
    const c = new T.Color(0, 0, 0);
    c.r =
        (dayC.r * w.day +
            dawnC.r * w.dawn +
            duskC.r * w.dusk +
            twiC.r * w.twi +
            nightC.r * w.night) /
        sum;
    c.g =
        (dayC.g * w.day +
            dawnC.g * w.dawn +
            duskC.g * w.dusk +
            twiC.g * w.twi +
            nightC.g * w.night) /
        sum;
    c.b =
        (dayC.b * w.day +
            dawnC.b * w.dawn +
            duskC.b * w.dusk +
            twiC.b * w.twi +
            nightC.b * w.night) /
        sum;
    return c;
}

function applyEarthDaylightSkyVertexColors(geom, ri, ro, sunwardAzimuth, isLight, edgeColorHex, observerCtx, altitudeSeries) {
    const T = getThreeNamespace();
    if (!T || !geom || !geom.attributes || !geom.attributes.position) return;
    const pos = geom.attributes.position;
    const span = Math.max(ro - ri, 1e-4);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        const phi = Math.atan2(z, x);
        const hour = orbitalClockHourAtPhiSunward(phi, sunwardAzimuth);
        const weights = skyDiurnalWeightsForObserverDiskHour(hour, observerCtx, altitudeSeries);
        const radialT = Math.max(0, Math.min(1, (r - ri) / span));
        let col = skyColorFromDiurnalWeights(weights, radialT, isLight, edgeColorHex);
        col = applySelectedHourSkyHighlight(col, hour, observerCtx, T, isLight);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
}

function disposeEarthDaylightSky() {
    if (!earthDaylightSkyMesh) {
        earthDaylightSkyRadiiKey = null;
        earthDaylightSkyColorKey = null;
        earthDaylightSkyAltitudeCache = { key: '', alts: null };
        return;
    }
    if (earthDaylightSkyMesh.parent) earthDaylightSkyMesh.parent.remove(earthDaylightSkyMesh);
    earthDaylightSkyMesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
        }
    });
    earthDaylightSkyMesh = null;
    earthDaylightSkyRadiiKey = null;
    earthDaylightSkyColorKey = null;
    earthDaylightSkyAltitudeCache = { key: '', alts: null };
}

function earthDaylightSkyGradientT(r, y, ri, ro, halfH) {
    const radialT = Math.max(0, Math.min(1, (r - ri) / Math.max(ro - ri, 1e-4)));
    const verticalT = Math.max(0, Math.min(1, (y + halfH) / Math.max(2 * halfH, 1e-4)));
    return Math.max(radialT * 0.35, verticalT * 0.92);
}

function applyEarthDaylightSkySkirtVertexColors(geom, ri, ro, halfH, sunwardAzimuth, isLight, edgeColorHex, observerCtx, altitudeSeries) {
    const T = getThreeNamespace();
    if (!T || !geom || !geom.attributes || !geom.attributes.position) return;
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        const phi = Math.atan2(z, x);
        const hour = orbitalClockHourAtPhiSunward(phi, sunwardAzimuth);
        const weights = skyDiurnalWeightsForObserverDiskHour(hour, observerCtx, altitudeSeries);
        const t = earthDaylightSkyGradientT(r, y, ri, ro, halfH);
        let col = skyColorFromDiurnalWeights(weights, t, isLight, edgeColorHex);
        col = applySelectedHourSkyHighlight(col, hour, observerCtx, T, isLight);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
}

/** Earth → Sun azimuth in world XZ (scene Sun at origin on the ecliptic slice). */
function getEarthSunwardAzimuthRad(earthGroup) {
    let ex = NaN;
    let ez = NaN;
    if (earthGroup && earthGroup.position) {
        ex = earthGroup.position.x;
        ez = earthGroup.position.z;
    }
    if ((!Number.isFinite(ex) || !Number.isFinite(ez)) && typeof getCircadianSceneTimeContext === 'function') {
        const ctx = getCircadianSceneTimeContext();
        if (ctx && Number.isFinite(ctx.earthX) && Number.isFinite(ctx.earthZ)) {
            ex = ctx.earthX;
            ez = ctx.earthZ;
        }
    }
    if (!Number.isFinite(ex) || !Number.isFinite(ez) || ex * ex + ez * ez < 1e-10) return 0;
    return Math.atan2(-ez, -ex);
}

/**
 * Hour 12 on the orbital clock in world XZ — same frame as hour numerals / cyan hand
 * ({@link hourDialLabelAngleFromEarth}(12, sunToEarth)), not the globe meridian projection
 * (that frame is ~6h off in XZ and painted pre-dawn at dial noon).
 */
function getEarthCircadianDialNoonAzimuthRad(earthGroup) {
    let ex = NaN;
    let ez = NaN;
    if (earthGroup && earthGroup.position) {
        ex = earthGroup.position.x;
        ez = earthGroup.position.z;
    }
    if ((!Number.isFinite(ex) || !Number.isFinite(ez)) && typeof getCircadianSceneTimeContext === 'function') {
        const ctx = getCircadianSceneTimeContext();
        if (ctx && Number.isFinite(ctx.earthX) && Number.isFinite(ctx.earthZ)) {
            ex = ctx.earthX;
            ez = ctx.earthZ;
        }
    }
    if (!Number.isFinite(ex) || !Number.isFinite(ez) || ex * ex + ez * ez < 1e-10) return 0;
    const sunToEarth = Math.atan2(ez, ex);
    return sunToEarth - Math.PI;
}

/** Full circadian disk in local XZ; group rotation.y puts +Z sunward (both terminators visible). */
function getEarthDaylightSkyAzimuthArc() {
    return { theta0: 0, thetaSpan: Math.PI * 2 };
}

function buildEarthDaylightSkySkirtMesh(T, ri, ro, halfH, nSeg, sunwardAzimuth, isLight, edgeColorHex, arc) {
    if (!T || ro < 1e-4 || halfH < 1e-4) return null;
    const theta0 = arc && arc.theta0 != null ? arc.theta0 : -Math.PI / 2;
    const span = arc && arc.thetaSpan != null ? arc.thetaSpan : Math.PI;
    const n = Math.max(24, Math.round(nSeg * (span / Math.PI)));
    const positions = [];
    const indices = [];
    let vi = 0;
    function addV(x, y, z) {
        positions.push(x, y, z);
        return vi++;
    }
    function addQuad(a, b, c, d) {
        indices.push(a, b, c, a, c, d);
    }
    for (let i = 0; i < n; i++) {
        const th0 = theta0 + (i / n) * span;
        const th1 = theta0 + ((i + 1) / n) * span;
        const c0 = Math.cos(th0);
        const s0 = Math.sin(th0);
        const c1 = Math.cos(th1);
        const s1 = Math.sin(th1);
        const a = addV(c0 * ro, -halfH, s0 * ro);
        const b = addV(c1 * ro, -halfH, s1 * ro);
        const c = addV(c1 * ro, halfH, s1 * ro);
        const d = addV(c0 * ro, halfH, s0 * ro);
        addQuad(a, b, c, d);
    }
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    applyEarthDaylightSkySkirtVertexColors(geom, ri, ro, halfH, sunwardAzimuth, isLight, edgeColorHex);
    const mat = createListHorizonSkyDiskMaterial(T);
    mat.opacity = 0.82;
    const mesh = new T.Mesh(geom, mat);
    mesh.renderOrder = EARTH_DAYLIGHT_SKY_RENDER_ORDER;
    mesh.userData = { type: 'EarthDaylightSky', earthDaylightSkyPart: 'skirt' };
    return mesh;
}

function buildEarthDaylightSkyGroup(T, ri, ro, sunwardAzimuth, isLight, edgeColorHex) {
    const group = new T.Group();
    group.userData = { type: 'EarthDaylightSky', immuneToFlatten: true };
    const skyArc = getEarthDaylightSkyAzimuthArc();
    const n = 72;
    const mat = createListHorizonSkyDiskMaterial(T);
    mat.opacity = 0.8;

    const wedgeGeom = new T.CircleGeometry(ro, n, skyArc.theta0, skyArc.thetaSpan);
    wedgeGeom.rotateX(-Math.PI / 2);
    applyEarthDaylightSkyVertexColors(wedgeGeom, ri * 0.15, ro, sunwardAzimuth, isLight, edgeColorHex);
    const wedgeMat = mat.clone();
    wedgeMat.opacity = 0.42;
    const wedge = new T.Mesh(wedgeGeom, wedgeMat);
    wedge.renderOrder = EARTH_DAYLIGHT_SKY_RENDER_ORDER - 1;
    wedge.userData = { type: 'EarthDaylightSky', earthDaylightSkyPart: 'wedge' };
    group.add(wedge);

    const ringGeom = new T.RingGeometry(ri, ro, n, 1, skyArc.theta0, skyArc.thetaSpan);
    ringGeom.rotateX(-Math.PI / 2);
    applyEarthDaylightSkyVertexColors(ringGeom, ri, ro, sunwardAzimuth, isLight, edgeColorHex);
    const ring = new T.Mesh(ringGeom, mat.clone());
    ring.renderOrder = EARTH_DAYLIGHT_SKY_RENDER_ORDER;
    ring.userData = { type: 'EarthDaylightSky', earthDaylightSkyPart: 'ring' };
    group.add(ring);

    return group;
}

function syncEarthDaylightSkyTransform(earthGroup) {
    if (!earthDaylightSkyMesh || !earthGroup || !earthGroup.position) return;
    earthDaylightSkyMesh.position.set(earthGroup.position.x, earthGroup.position.y, earthGroup.position.z);
    const noonAz = getEarthCircadianDialNoonAzimuthRad(earthGroup);
    // Local +Z (φ = π/2) is painted as h=12; rotate to dial noon (Earth → Sun in XZ).
    earthDaylightSkyMesh.rotation.y = Math.PI / 2 - noonAz;
}

function refreshEarthDaylightSkyColors(earthGroup, ri, ro, sunwardAzimuth, observerCtx) {
    void earthGroup;
    if (!earthDaylightSkyMesh || !earthDaylightSkyMesh.traverse) return;
    const ctx = observerCtx || getSkyCanvasObserverContext(currentZoom);
    const altitudeSeries = getObserverSolarAltitudeSeries(ctx);
    const edgeHex = getListHorizonRingColorHex();
    earthDaylightSkyMesh.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const part = child.userData && child.userData.earthDaylightSkyPart;
        if (part === 'wedge') {
            applyEarthDaylightSkyVertexColors(
                child.geometry,
                ri * 0.15,
                ro,
                sunwardAzimuth,
                isLightMode,
                edgeHex,
                ctx,
                altitudeSeries
            );
        } else {
            applyEarthDaylightSkyVertexColors(
                child.geometry,
                ri,
                ro,
                sunwardAzimuth,
                isLightMode,
                edgeHex,
                ctx,
                altitudeSeries
            );
        }
        if (child.material) child.material.needsUpdate = true;
    });
}

function resolveEarthDaylightSkyRadii(earthGroup, zoomLevel) {
    const rSurf = resolveEarthGlobeSurfaceRadius(earthGroup);
    const ri = Math.max(rSurf * 1.02, rSurf + 0.05);
    // Fill past Event Horizon slightly; fragment clip rounds the rim.
    if (contextSphereState && contextSphereState.radius > ri + 0.1) {
        const pad = getContextSphereContentPad(
            typeof zoomLevel === 'number' ? zoomLevel : contextSphereState.zoom
        );
        const overshoot = pad && pad.padWorld > 0 ? pad.padWorld : contextSphereState.radius * 0.04;
        return { ri, ro: contextSphereState.radius + overshoot, rSurf };
    }
    const rTip = getEarthHourHandOuterExtentRadius(rSurf);
    const earth = PLANET_DATA && PLANET_DATA.find((p) => p.name === 'Earth');
    const W = earth && typeof earth.distance === 'number' ? earth.distance : 50;
    const spiralR = W * 0.1 * 0.9;
    let handRim = spiralR * 1.12;
    if (typeof CircadianRenderer !== 'undefined' && typeof CircadianRenderer.getHandLength === 'function') {
        handRim = Math.max(handRim, CircadianRenderer.getHandLength() * 1.1);
    }
    const ro = Math.max(ri + 0.18, Math.min(handRim, rTip * 1.06, spiralR * 1.18));
    return { ri, ro, rSurf };
}

/** Full circadian disk backdrop (globe → Event Horizon rim). Always when EH exists. */
function updateEarthDaylightSky(earthGroup, zoomLevel) {
    const T = getThreeNamespace();
    if (!T || !earthGroup || !isEarthDaylightSkyZoom(zoomLevel) || !showDayFrameLteSky) {
        disposeEarthDaylightSky();
        return;
    }
    const { ri, ro } = resolveEarthDaylightSkyRadii(earthGroup, zoomLevel);
    const radiiKey = `${ri.toFixed(3)}:${ro.toFixed(3)}`;
    const sunwardAzimuth = EARTH_DAYLIGHT_SKY_LOCAL_SUN_AZIMUTH;
    const edgeHex = getListHorizonRingColorHex();
    const observerCtx = getSkyCanvasObserverContext(zoomLevel);
    const colorKey = buildEarthDaylightSkyColorKey(observerCtx);

    if (!earthDaylightSkyMesh || earthDaylightSkyRadiiKey !== radiiKey) {
        disposeEarthDaylightSky();
        earthDaylightSkyMesh = buildEarthDaylightSkyGroup(T, ri, ro, sunwardAzimuth, isLightMode, edgeHex);
        earthDaylightSkyRadiiKey = radiiKey;
        earthDaylightSkyColorKey = colorKey;
        if (earthDaylightSkyMesh && sceneContentGroup) {
            sceneContentGroup.add(earthDaylightSkyMesh);
        }
        refreshEarthDaylightSkyColors(earthGroup, ri, ro, sunwardAzimuth, observerCtx);
    } else if (earthDaylightSkyColorKey !== colorKey) {
        earthDaylightSkyColorKey = colorKey;
        refreshEarthDaylightSkyColors(earthGroup, ri, ro, sunwardAzimuth, observerCtx);
    }
    syncEarthDaylightSkyTransform(earthGroup);
    if (
        earthDaylightSkyMesh &&
        sceneContentGroup &&
        earthDaylightSkyMesh.parent !== sceneContentGroup
    ) {
        if (earthDaylightSkyMesh.parent) earthDaylightSkyMesh.parent.remove(earthDaylightSkyMesh);
        sceneContentGroup.add(earthDaylightSkyMesh);
        syncEarthDaylightSkyTransform(earthGroup);
    }
    if (earthDaylightSkyMesh) {
        earthDaylightSkyMesh.visible = true;
        earthDaylightSkyMesh.traverse(function (child) {
            if (child && child.isMesh) {
                child.visible = true;
                applySkyDiskOpacityForShift(child);
            }
        });
    }
    if (typeof refreshContextSphereVisualClip === 'function') {
        try {
            refreshContextSphereVisualClip();
        } catch (e) { /* clip optional */ }
    }
}

function isDayFrameLteSkyZoom(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : currentZoom;
    // Selected-day sky strip on the annual-helix day frame. Clock/moment use the orbital sky disk.
    return z >= 4 && z <= 8;
}

function getSelectedCalendarDayHelixBounds() {
    const z =
        typeof currentZoom === 'number' && !isNaN(currentZoom) ? currentZoom : 8;
    // Week/day: zoom-relative context strip. Quarter–month: one selected day so the
    // canvas stays a day band on the helix (not a jagged quarter/month polygon).
    if (z >= 7 && z <= 8 && typeof getZoomRelativeContextTimeBoundsMs === 'function' && typeof calculateDateHeight === 'function') {
        try {
            const b = getZoomRelativeContextTimeBoundsMs(z);
            if (b && b.t1 > b.t0) {
                const pad =
                    typeof getZoomRelativeContextContentPad === 'function'
                        ? getZoomRelativeContextContentPad(z)
                        : { padMs: 0 };
                const p = pad && pad.padMs > 0 ? pad.padMs : 0;
                const frac = (d) =>
                    d.getHours() +
                    d.getMinutes() / 60 +
                    d.getSeconds() / 3600 +
                    d.getMilliseconds() / 3600000;
                const dA = new Date(b.t0 - p);
                const dB = new Date(b.t1 + p);
                const yA = calculateDateHeight(dA.getFullYear(), dA.getMonth(), dA.getDate(), frac(dA));
                const yB = calculateDateHeight(dB.getFullYear(), dB.getMonth(), dB.getDate(), frac(dB));
                if (
                    typeof yA === 'number' &&
                    typeof yB === 'number' &&
                    isFinite(yA) &&
                    isFinite(yB) &&
                    yB !== yA
                ) {
                    return {
                        dayStartY: Math.min(yA, yB),
                        dayEndY: Math.max(yA, yB),
                        dayKey: `lte:${b.t0}:${b.t1}:pad${p}:z${z}`
                    };
                }
            }
        } catch (e) { /* fall through */ }
    }
    // Fallback: week Event Horizon heights if zoom-relative unavailable (week/day only).
    if (
        z >= 7 &&
        z <= 8 &&
        contextSphereState &&
        typeof contextSphereState.t0 === 'number' &&
        typeof contextSphereState.t1 === 'number' &&
        contextSphereState.t1 > contextSphereState.t0
    ) {
        const pad = getContextSphereContentPad(
            typeof contextSphereState.zoom === 'number' ? contextSphereState.zoom : currentZoom
        );
        const p = pad && pad.padMs > 0 ? pad.padMs : 0;
        let dayStartY;
        let dayEndY;
        if (typeof contextSphereState.heightAtMs === 'function') {
            const yA = contextSphereState.heightAtMs(contextSphereState.t0 - p);
            const yB = contextSphereState.heightAtMs(contextSphereState.t1 + p);
            if (typeof yA === 'number' && typeof yB === 'number' && isFinite(yA) && isFinite(yB)) {
                dayStartY = Math.min(yA, yB);
                dayEndY = Math.max(yA, yB);
            }
        }
        if (
            (dayStartY == null || dayEndY == null) &&
            typeof contextSphereState.y0 === 'number' &&
            typeof contextSphereState.y1 === 'number'
        ) {
            const mid = 0.5 * (contextSphereState.y0 + contextSphereState.y1);
            const half = 0.5 * Math.abs(contextSphereState.y1 - contextSphereState.y0);
            const extra = pad && pad.padWorld > 0 ? pad.padWorld : half * 0.08;
            dayStartY = mid - half - extra;
            dayEndY = mid + half + extra;
        }
        if (
            typeof dayStartY === 'number' &&
            typeof dayEndY === 'number' &&
            isFinite(dayStartY) &&
            isFinite(dayEndY) &&
            dayEndY !== dayStartY
        ) {
            return {
                dayStartY,
                dayEndY,
                dayKey: `ctx:${contextSphereState.t0}:${contextSphereState.t1}:pad${p}`
            };
        }
    }
    const sel = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
    if (!sel || isNaN(sel.getTime()) || typeof calculateDateHeight !== 'function') return null;
    const dayStartY = calculateDateHeight(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0);
    const nd = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + 1);
    const dayEndY = calculateDateHeight(nd.getFullYear(), nd.getMonth(), nd.getDate(), 0);
    if (!isFinite(dayStartY) || !isFinite(dayEndY) || dayEndY <= dayStartY) return null;
    return { dayStartY, dayEndY, dayKey: sel.toISOString().slice(0, 10) };
}

function getDayFrameLteSkyWorldlineRef() {
    try {
        const zl = typeof currentZoom !== 'undefined' ? currentZoom : 8;
        const pack = computeSceneDateHeights(zl);
        if (pack && typeof pack.currentDateHeight === 'number' && !isNaN(pack.currentDateHeight)) {
            return pack.currentDateHeight;
        }
    } catch (e) { /* fall through */ }
    return typeof getOrbitPhaseReferenceHeight === 'function'
        ? getOrbitPhaseReferenceHeight()
        : (typeof calculateActualCurrentDateHeight === 'function'
            ? calculateActualCurrentDateHeight()
            : (typeof calculateCurrentDateHeight === 'function' ? calculateCurrentDateHeight() : 0));
}

function resolveDayFrameLteSkyRadii() {
    const earth = PLANET_DATA && PLANET_DATA.find((p) => p.name === 'Earth');
    const W = earth && typeof earth.distance === 'number' ? earth.distance : 50;
    let inner;
    let outer;
    if (
        typeof TimeMarkers !== 'undefined' &&
        typeof TimeMarkers.getEarthOrbitL1L2DayFrameRadii === 'function' &&
        typeof getSingularBandMode === 'function' &&
        getSingularBandMode()
    ) {
        const day = TimeMarkers.getEarthOrbitL1L2DayFrameRadii(W);
        inner = day.inner;
        outer = day.outer;
    } else if (typeof EventRenderer !== 'undefined' && typeof EventRenderer.getDayMarkerFrameRadii === 'function') {
        const day = EventRenderer.getDayMarkerFrameRadii(W);
        inner = day.inner;
        outer = day.outer;
    } else if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
        const z = TimeMarkers.getCanonicalRadialZones(W);
        inner = z.day.inner;
        outer = z.day.outer;
    } else {
        inner = W * 5 / 8;
        outer = W * 3 / 4;
    }
    // LTE lives outside Event Horizon: keep day-frame outer past sphere rim (+ pad).
    if (contextSphereState && contextSphereState.radius > 0) {
        const pad = getContextSphereContentPad(
            typeof contextSphereState.zoom === 'number' ? contextSphereState.zoom : currentZoom
        );
        const target = contextSphereState.radius + (pad && pad.padWorld > 0 ? pad.padWorld : contextSphereState.radius * 0.06);
        if (outer < target) outer = target;
        // Prefer frame outer that still clears the sphere when L1–L2 already past rim.
        if (outer <= contextSphereState.radius) {
            outer = target;
        }
    }
    return { inner, outer };
}

function applyDayFrameLteSkyVertexColors(geom, ri, ro, isLight, edgeColorHex, observerCtx) {
    const T = getThreeNamespace();
    if (!T || !geom || !geom.attributes || !geom.attributes.position) return;
    const ctx = observerCtx || getSkyCanvasObserverContext(8);
    const pos = geom.attributes.position;
    const span = Math.max(ro - ri, 1e-4);
    const colors = new Float32Array(pos.count * 3);
    const refDate = ctx.selectedDate || (typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date());
    const alts = ctx.lon != null
        ? getSolarAltitudeSeriesForCalendarDate(ctx.lat, ctx.lon, refDate)
        : null;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        const radialT = Math.max(0, Math.min(1, (r - ri) / span));
        const diskHour = radialT * 24;
        let weights;
        if (alts) {
            const alt = interpolateObserverSolarAltitude(alts, diskHour);
            weights = skyDiurnalWeightsFromSolarAltitude(alt, diskHour);
        } else {
            weights = skyDiurnalWeightsAtHour(diskHour);
        }
        let col = skyColorFromDiurnalWeights(weights, 0.5, isLight, edgeColorHex);
        col = applySelectedHourSkyHighlight(col, diskHour, ctx, T, isLight);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
}

function buildDayFrameLteSkyMesh(T, ri, ro, dayStartY, dayEndY, refWorldline) {
    if (!T || !SceneGeometry || typeof SceneGeometry.getAngle !== 'function') return null;
    const inner = Math.max(0, ri);
    const outer = Math.max(inner + 1e-4, ro);
    const ySpan = dayEndY - dayStartY;
    if (!(ySpan > 1e-6)) return null;
    const nHelix = 16;
    const nRadial = 24;
    const positions = [];
    const indices = [];
    for (let jr = 0; jr <= nRadial; jr++) {
        const radialT = jr / nRadial;
        const r = inner + radialT * (outer - inner);
        for (let i = 0; i <= nHelix; i++) {
            const u = i / nHelix;
            const y = dayStartY + u * ySpan;
            const angle = SceneGeometry.getAngle(y, refWorldline);
            positions.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
        }
    }
    const rowLen = nHelix + 1;
    for (let jr = 0; jr < nRadial; jr++) {
        for (let i = 0; i < nHelix; i++) {
            const a = jr * rowLen + i;
            const b = a + 1;
            const c = (jr + 1) * rowLen + i + 1;
            const d = (jr + 1) * rowLen + i;
            indices.push(a, b, c, a, c, d);
        }
    }
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.userData.dayFrameLteSkyRi = inner;
    geom.userData.dayFrameLteSkyRo = outer;
    geom.userData.dayFrameLteSkyMidY = dayStartY + ySpan * 0.5;
    storeListHorizonLogicalPositions(geom);
    applyDayFrameLteSkyInterstellarWarp(geom);
    const mat = createListHorizonSkyDiskMaterial(T);
    mat.opacity = DAY_FRAME_LTE_SKY_OPACITY;
    const mesh = new T.Mesh(geom, mat);
    mesh.renderOrder = DAY_FRAME_LTE_SKY_RENDER_ORDER;
    mesh.userData = {
        type: 'DayFrameLteSky',
        listHorizonSkyFill: true,
        immuneToFlatten: true,
        skyDiskBaseOpacity: DAY_FRAME_LTE_SKY_OPACITY
    };
    return mesh;
}

function refreshDayFrameLteSkyColors(mesh, ri, ro, observerCtx) {
    if (!mesh || !mesh.geometry) return;
    const edgeHex = getListHorizonRingColorHex();
    const ctx = observerCtx || getSkyCanvasObserverContext(8);
    applyDayFrameLteSkyVertexColors(mesh.geometry, ri, ro, isLightMode, edgeHex, ctx);
}

function disposeDayFrameLteSky() {
    if (!dayFrameLteSkyMesh) {
        dayFrameLteSkyGeomKey = null;
        dayFrameLteSkyColorKey = null;
        return;
    }
    if (dayFrameLteSkyMesh.parent) dayFrameLteSkyMesh.parent.remove(dayFrameLteSkyMesh);
    if (dayFrameLteSkyMesh.geometry) dayFrameLteSkyMesh.geometry.dispose();
    if (dayFrameLteSkyMesh.material) dayFrameLteSkyMesh.material.dispose();
    dayFrameLteSkyMesh = null;
    dayFrameLteSkyGeomKey = null;
    dayFrameLteSkyColorKey = null;
}

function updateDayFrameLteSkyFlatten(focusY, amount) {
    if (!dayFrameLteSkyMesh) return;
    dayFrameLteSkyMesh.scale.set(1, 1, 1);
    dayFrameLteSkyMesh.position.y = 0;
    if (dayFrameLteSkyMesh.geometry) {
        applyDayFrameLteSkyInterstellarWarp(dayFrameLteSkyMesh.geometry);
    }
}

/** Selected-day sky backdrop on annual helix day-marker frame (zoom 7/8). */
function updateDayFrameLteSkyBackdrop(zoomLevel) {
    const T = getThreeNamespace();
    if (!T || !sceneContentGroup || !showDayFrameLteSky || !isDayFrameLteSkyZoom(zoomLevel)) {
        disposeDayFrameLteSky();
        return;
    }
    const dayBounds = getSelectedCalendarDayHelixBounds();
    if (!dayBounds) {
        disposeDayFrameLteSky();
        return;
    }
    const { inner, outer } = resolveDayFrameLteSkyRadii();
    const refWorldline = getDayFrameLteSkyWorldlineRef();
    const geomKey =
        `${zoomLevel}:${dayBounds.dayKey}:${inner.toFixed(3)}:${outer.toFixed(3)}:` +
        `${dayBounds.dayStartY.toFixed(4)}:${dayBounds.dayEndY.toFixed(4)}:${refWorldline.toFixed(4)}`;
    const colorKey = buildEarthDaylightSkyColorKey(getSkyCanvasObserverContext(zoomLevel));

    if (!dayFrameLteSkyMesh || dayFrameLteSkyGeomKey !== geomKey) {
        disposeDayFrameLteSky();
        dayFrameLteSkyMesh = buildDayFrameLteSkyMesh(
            T,
            inner,
            outer,
            dayBounds.dayStartY,
            dayBounds.dayEndY,
            refWorldline
        );
        dayFrameLteSkyGeomKey = geomKey;
        dayFrameLteSkyColorKey = colorKey;
        if (dayFrameLteSkyMesh) {
            refreshDayFrameLteSkyColors(dayFrameLteSkyMesh, inner, outer, getSkyCanvasObserverContext(zoomLevel));
            sceneContentGroup.add(dayFrameLteSkyMesh);
        }
    } else if (dayFrameLteSkyColorKey !== colorKey) {
        dayFrameLteSkyColorKey = colorKey;
        refreshDayFrameLteSkyColors(
            dayFrameLteSkyMesh,
            inner,
            outer,
            getSkyCanvasObserverContext(zoomLevel)
        );
    }
    if (dayFrameLteSkyMesh && dayFrameLteSkyMesh.parent !== sceneContentGroup) {
        if (dayFrameLteSkyMesh.parent) dayFrameLteSkyMesh.parent.remove(dayFrameLteSkyMesh);
        sceneContentGroup.add(dayFrameLteSkyMesh);
    }
    applySkyDiskOpacityForShift(dayFrameLteSkyMesh);
}

/** Helix list-context strip: date along arc × hour radial (observer solar model). */
function applySkyAnnulusVertexColorsHelixStrip(geom, innerVertexCount, ri, ro, zoomLevel, helixCtx) {
    if (!geom || ri == null || ro == null) return;
    const z = typeof zoomLevel === 'number' ? zoomLevel : (helixCtx && helixCtx.zoomLevel);
    const nRadial = (helixCtx && helixCtx.nRadialSegments > 0)
        ? helixCtx.nRadialSegments
        : CONTEXT_ARC_SKY_RADIAL_SEGMENTS;
    applyContextArcSkyVertexColors(geom, ri, ro, z, {
        bounds: helixCtx && helixCtx.bounds,
        arc: helixCtx && helixCtx.arc,
        layout: 'helixStrip',
        helixInnerVertexCount: innerVertexCount,
        helixRadialSegments: nRadial,
        helixRingCount: nRadial + 1
    });
    if (geom && geom.userData) {
        geom.userData.contextArcSkyLayout = 'helixStrip';
        geom.userData.contextArcSkyInnerCount = innerVertexCount;
        geom.userData.contextArcSkyRadialSegments = nRadial;
        geom.userData.contextArcSkyRingCount = nRadial + 1;
    }
}

/** Sky annulus fill: vertex-colored MeshBasic (reliable vs custom ShaderMaterial attrs). */
function createListHorizonSkyDiskMaterial(THREE) {
    return new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: LIST_HORIZON_SKY_DISK_OPACITY,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
}

/**
 * Primary context fill: flat annulus in the XZ plane at selected time (visible from orbit view).
 */
function buildListHorizonSkyFlatAnnulusMesh(THREE, rInner, rOuter, yCenter, nSeg, colorHex, renderOrder, arc) {
    const TWO_PI = Math.PI * 2;
    const norm = normalizeListHorizonAnnulusRadii(rInner, rOuter);
    if (!norm.ok || !THREE || !THREE.RingGeometry) return null;
    const ri = norm.ri;
    const ro = norm.ro;

    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, arc.theta1 - arc.theta0);
    const n = fullCircle
        ? Math.max(48, Math.min(128, nSeg * 2))
        : Math.max(24, Math.min(128, Math.round(nSeg * (span / TWO_PI) * 2)));
    // thetaSegments, radialSegments — radial >1 so diurnal sky (dawn/noon/dusk) exists between ri/ro.
    const nRadial = CONTEXT_ARC_SKY_RADIAL_SEGMENTS;

    const geom = new THREE.RingGeometry(ri, ro, n, nRadial, t0, span);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, yCenter, 0);
    const zDisc = typeof currentZoom !== 'undefined' ? currentZoom : 9;
    applySkyAnnulusVertexColors(geom, ri, ro, isLightMode, colorHex, zDisc, { arc });
    storeListHorizonLogicalPositions(geom);

    const mat = createListHorizonSkyDiskMaterial(THREE);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder != null ? renderOrder : 6;
    mesh.userData = { type: 'ListHorizonEarthRing', listHorizonSkyFill: true };
    return mesh;
}

/**
 * Sky fill between marker radii — helical strip along list time bounds (matches hoop walls), else flat XZ arc.
 */
function buildListHorizonSkyFillMesh(THREE, rInner, rOuter, yCenter, nSeg, colorHex, renderOrder, arc, helixCtx) {
    const useHelix = helixCtx && helixCtx.bounds && helixCtx.bounds.t1 > helixCtx.bounds.t0;
    if (useHelix) {
        const midCtx = Object.assign({}, helixCtx, { bandSign: 0 });
        return buildListHorizonSkyDiskMesh(
            THREE,
            rInner,
            rOuter,
            yCenter,
            nSeg,
            colorHex,
            null,
            renderOrder,
            arc,
            midCtx
        );
    }
    return buildListHorizonSkyFlatAnnulusMesh(
        THREE,
        rInner,
        rOuter,
        yCenter,
        nSeg,
        colorHex,
        renderOrder,
        arc
    );
}

/**
 * Sky annulus on the list-context band: helical along the list time arc; flattens with timeline (F).
 * Radial rings sample hour-of-day (same model as day-marker sky); along-arc samples calendar date.
 */
function buildListHorizonSkyDiskMesh(THREE, rInner, rOuter, y, nSeg, colorHex, opacity, renderOrder, arc, helixCtx) {
    void opacity;
    void y;
    const TWO_PI = Math.PI * 2;
    const norm = normalizeListHorizonAnnulusRadii(rInner, rOuter);
    if (!norm.ok) return null;
    const ri = norm.ri;
    const ro = norm.ro;

    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const t1 = fullCircle ? TWO_PI : arc.theta1;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, t1 - t0);
    const n = fullCircle
        ? Math.max(24, Math.min(96, nSeg))
        : Math.max(12, Math.min(96, Math.round(nSeg * (span / TWO_PI))));

    const useHelix = helixCtx && helixCtx.bounds;
    const bandSign = helixCtx && helixCtx.bandSign != null ? helixCtx.bandSign : 0;
    const nRadial = CONTEXT_ARC_SKY_RADIAL_SEGMENTS;

    const positions = [];
    const indices = [];
    let helixInnerVertexCount = 0;

    if (useHelix) {
        const nTime = listHorizonSegmentCountForArc(helixCtx.bounds, nSeg, arc);
        const bounds = helixCtx.bounds;
        const refCur = helixCtx.refCurrentHeight;
        const refSel = helixCtx.refSelectedHeight;
        const bandHalfH = helixCtx.bandHalfH != null ? helixCtx.bandHalfH : 0;
        const nHelix = Math.max(2, nTime);
        helixInnerVertexCount = nHelix + 1;
        for (let jr = 0; jr <= nRadial; jr++) {
            const radialT = jr / nRadial;
            const r = ri + radialT * (ro - ri);
            for (let i = 0; i <= nHelix; i++) {
                const ms = bounds.t0 + (i / nHelix) * (bounds.t1 - bounds.t0);
                const p = listHorizonHelixPointAtMs(ms, r, refCur, refSel, bandHalfH, bandSign);
                positions.push(p.x, p.y, p.z);
            }
        }
        const rowLen = helixInnerVertexCount;
        for (let jr = 0; jr < nRadial; jr++) {
            for (let i = 0; i < nHelix; i++) {
                const a = jr * rowLen + i;
                const b = a + 1;
                const c = (jr + 1) * rowLen + i + 1;
                const d = (jr + 1) * rowLen + i;
                indices.push(a, b, c, a, c, d);
            }
        }
    } else if (fullCircle) {
        for (let jr = 0; jr <= nRadial; jr++) {
            const radialT = jr / nRadial;
            const r = ri + radialT * (ro - ri);
            for (let i = 0; i < n; i++) {
                const theta = (i / n) * TWO_PI;
                positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
            }
        }
        for (let jr = 0; jr < nRadial; jr++) {
            for (let i = 0; i < n; i++) {
                const i1 = (i + 1) % n;
                const a = jr * n + i;
                const b = jr * n + i1;
                const c = (jr + 1) * n + i1;
                const d = (jr + 1) * n + i;
                indices.push(a, b, c, a, c, d);
            }
        }
    } else {
        const rowLen = n + 1;
        for (let jr = 0; jr <= nRadial; jr++) {
            const radialT = jr / nRadial;
            const r = ri + radialT * (ro - ri);
            for (let i = 0; i <= n; i++) {
                const theta = t0 + (i / n) * span;
                positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
            }
        }
        for (let jr = 0; jr < nRadial; jr++) {
            for (let i = 0; i < n; i++) {
                const a = jr * rowLen + i;
                const b = a + 1;
                const c = (jr + 1) * rowLen + i + 1;
                const d = (jr + 1) * rowLen + i;
                indices.push(a, b, c, a, c, d);
            }
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const zDisc = (helixCtx && helixCtx.zoomLevel != null) ? helixCtx.zoomLevel : currentZoom;
    if (geom.userData) {
        geom.userData.contextArcSkyRi = ri;
        geom.userData.contextArcSkyRo = ro;
    }
    if (useHelix) {
        const colorCtx = Object.assign({}, helixCtx, {
            arc: arc,
            nRadialSegments: nRadial
        });
        applySkyAnnulusVertexColorsHelixStrip(
            geom, helixInnerVertexCount, ri, ro, zDisc, colorCtx
        );
    } else {
        applySkyAnnulusVertexColors(geom, ri, ro, isLightMode, colorHex, zDisc, { arc });
    }
    storeListHorizonLogicalPositions(geom);

    const mat = createListHorizonSkyDiskMaterial(THREE);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder != null ? renderOrder : 7;
    mesh.userData = { type: 'ListHorizonEarthRing', listHorizonSkyFill: true };
    return mesh;
}

/**
 * Radial faces between inner and outer hoops (visible edge-on along the orbit).
 * Same sky gradient as top/bottom annulus caps.
 */
function buildListHorizonSkyBandRadialWallMesh(THREE, rInner, rOuter, y0, y1, nSeg, colorHex, renderOrder, arc, helixCtx) {
    const TWO_PI = Math.PI * 2;
    const norm = normalizeListHorizonAnnulusRadii(rInner, rOuter);
    if (!norm.ok || !THREE) return null;
    const ri = norm.ri;
    const ro = norm.ro;

    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const t1 = fullCircle ? TWO_PI : arc.theta1;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, t1 - t0);
    const n = fullCircle
        ? Math.max(36, Math.min(96, Math.round(52 + ro * 0.28)))
        : Math.max(12, Math.min(96, Math.round((52 + ro * 0.28) * (span / TWO_PI))));

    const useHelix = helixCtx && helixCtx.bounds;
    const bandHalfH = helixCtx && helixCtx.bandHalfH != null ? helixCtx.bandHalfH : 0;
    const positions = [];
    const indices = [];
    let vi = 0;
    function addV(x, y, z) {
        positions.push(x, y, z);
        return vi++;
    }
    function addQuad(a, b, c, d) {
        indices.push(a, b, c, a, c, d);
    }

    const segCount = useHelix
        ? listHorizonSegmentCountForArc(helixCtx.bounds, n, arc)
        : fullCircle
          ? n
          : n;

    for (let i = 0; i < segCount; i++) {
        let pIb;
        let pIt;
        let pOb;
        let pOt;
        if (useHelix) {
            const bounds = helixCtx.bounds;
            const refCur = helixCtx.refCurrentHeight;
            const refSel = helixCtx.refSelectedHeight;
            const ms0 = bounds.t0 + (i / segCount) * (bounds.t1 - bounds.t0);
            const ms1 = bounds.t0 + ((i + 1) / segCount) * (bounds.t1 - bounds.t0);
            pIb = listHorizonHelixPointAtMs(ms0, ri, refCur, refSel, bandHalfH, -1);
            pIt = listHorizonHelixPointAtMs(ms0, ri, refCur, refSel, bandHalfH, 1);
            pOb = listHorizonHelixPointAtMs(ms0, ro, refCur, refSel, bandHalfH, -1);
            pOt = listHorizonHelixPointAtMs(ms0, ro, refCur, refSel, bandHalfH, 1);
            const pIb1 = listHorizonHelixPointAtMs(ms1, ri, refCur, refSel, bandHalfH, -1);
            const pIt1 = listHorizonHelixPointAtMs(ms1, ri, refCur, refSel, bandHalfH, 1);
            const pOb1 = listHorizonHelixPointAtMs(ms1, ro, refCur, refSel, bandHalfH, -1);
            const pOt1 = listHorizonHelixPointAtMs(ms1, ro, refCur, refSel, bandHalfH, 1);
            const a = addV(pIb.x, pIb.y, pIb.z);
            const b = addV(pIt.x, pIt.y, pIt.z);
            const c = addV(pOt.x, pOt.y, pOt.z);
            const d = addV(pOb.x, pOb.y, pOb.z);
            addQuad(a, b, c, d);
            const a1 = addV(pIb1.x, pIb1.y, pIb1.z);
            const b1 = addV(pIt1.x, pIt1.y, pIt1.z);
            const c1 = addV(pOt1.x, pOt1.y, pOt1.z);
            const d1 = addV(pOb1.x, pOb1.y, pOb1.z);
            addQuad(a1, b1, c1, d1);
            addQuad(d, c, c1, d1);
            addQuad(a, d, d1, a1);
            continue;
        }
        const th0 = fullCircle ? (i / n) * TWO_PI : t0 + (i / n) * span;
        const th1 = fullCircle ? ((i + 1) / n) * TWO_PI : t0 + ((i + 1) / n) * span;
        const c0 = Math.cos(th0);
        const s0 = Math.sin(th0);
        const c1 = Math.cos(th1);
        const s1 = Math.sin(th1);
        const a = addV(c0 * ri, y0, s0 * ri);
        const b = addV(c0 * ri, y1, s0 * ri);
        const c = addV(c0 * ro, y1, s0 * ro);
        const d = addV(c0 * ro, y0, s0 * ro);
        addQuad(a, b, c, d);
        const a1 = addV(c1 * ri, y0, s1 * ri);
        const b1 = addV(c1 * ri, y1, s1 * ri);
        const c1v = addV(c1 * ro, y1, s1 * ro);
        const d1 = addV(c1 * ro, y0, s1 * ro);
        addQuad(a1, b1, c1v, d1);
        addQuad(d, c, c1v, d1);
        addQuad(a, d, d1, a1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const zDisc = (helixCtx && helixCtx.zoomLevel != null) ? helixCtx.zoomLevel : currentZoom;
    applySkyAnnulusVertexColors(geom, ri, ro, isLightMode, colorHex, zDisc, {
        bounds: helixCtx && helixCtx.bounds,
        arc: arc
    });
    storeListHorizonLogicalPositions(geom);

    const mat = createListHorizonSkyDiskMaterial(THREE);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder != null ? renderOrder : 6.5;
    mesh.userData = { type: 'ListHorizonEarthRing', listHorizonSkyFill: true };
    return mesh;
}

/** Vertical hoop wall at one radius (inner or outer list-context edge); helical when helixCtx set. */
function buildListHorizonHoopWallMesh(THREE, radius, y0, y1, nSeg, colorHex, renderOrder, opacityMul, isInnerEdge, arc, helixCtx) {
    void y0;
    void y1;
    const TWO_PI = Math.PI * 2;
    const ro = Math.max(0, radius);
    if (ro < 1e-4 || !THREE) return null;
    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const t1 = fullCircle ? TWO_PI : arc.theta1;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, t1 - t0);
    const n = fullCircle
        ? Math.max(36, Math.min(96, Math.round(52 + ro * 0.28)))
        : Math.max(12, Math.min(96, Math.round((52 + ro * 0.28) * (span / TWO_PI))));
    const useHelix = helixCtx && helixCtx.bounds;
    const bandHalfH = helixCtx && helixCtx.bandHalfH != null ? helixCtx.bandHalfH : 0;
    const positions = [];
    const indices = [];
    let vi = 0;
    function addV(x, y, z) {
        positions.push(x, y, z);
        return vi++;
    }
    function addQuad(a, b, c, d) {
        indices.push(a, b, c, a, c, d);
    }
    function wallPoint(theta, bandSign) {
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const yv = bandSign < 0 ? y0 : y1;
        return { x: c * ro, y: yv, z: s * ro };
    }
    const segCount = useHelix
        ? listHorizonSegmentCountForArc(helixCtx.bounds, n, arc)
        : (fullCircle ? n : n);
    for (let i = 0; i < segCount; i++) {
        let pA;
        let pB;
        let pC;
        let pD;
        if (useHelix) {
            const bounds = helixCtx.bounds;
            const refCur = helixCtx.refCurrentHeight;
            const refSel = helixCtx.refSelectedHeight;
            const ms0 = bounds.t0 + (i / segCount) * (bounds.t1 - bounds.t0);
            const ms1 = bounds.t0 + ((i + 1) / segCount) * (bounds.t1 - bounds.t0);
            pA = listHorizonHelixPointAtMs(ms0, ro, refCur, refSel, bandHalfH, -1);
            pB = listHorizonHelixPointAtMs(ms1, ro, refCur, refSel, bandHalfH, -1);
            pC = listHorizonHelixPointAtMs(ms1, ro, refCur, refSel, bandHalfH, 1);
            pD = listHorizonHelixPointAtMs(ms0, ro, refCur, refSel, bandHalfH, 1);
        } else {
            const th0 = fullCircle ? (i / n) * TWO_PI : t0 + (i / n) * span;
            const th1 = fullCircle ? ((i + 1) / n) * TWO_PI : t0 + ((i + 1) / n) * span;
            pA = wallPoint(th0, -1);
            pB = wallPoint(th1, -1);
            pC = wallPoint(th1, 1);
            pD = wallPoint(th0, 1);
        }
        const a = addV(pA.x, pA.y, pA.z);
        const b = addV(pB.x, pB.y, pB.z);
        const c = addV(pC.x, pC.y, pC.z);
        const d = addV(pD.x, pD.y, pD.z);
        addQuad(a, b, c, d);
    }
    const wallGeom = new THREE.BufferGeometry();
    wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    wallGeom.setIndex(indices);
    wallGeom.computeVertexNormals();
    if (useHelix) storeListHorizonLogicalPositions(wallGeom);
    const baseOp = isInnerEdge ? 0.52 : 0.36;
    const op = Math.min(0.92, baseOp * (opacityMul != null ? opacityMul : 1));
    const matWall = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: op,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: isInnerEdge ? -2 : 1,
        polygonOffsetUnits: isInnerEdge ? -2 : 1
    });
    const wall = new THREE.Mesh(wallGeom, matWall);
    wall.renderOrder = (renderOrder != null ? renderOrder : 7) + (isInnerEdge ? 1 : 0);
    wall.userData = { type: isInnerEdge ? 'ListHorizonEarthRingInner' : 'ListHorizonEarthRing' };
    return wall;
}

/**
 * Context annulus: inner hoop = list span band; sky fill between inner/outer; outer hoop = time-marker context.
 * Sun-ward of inner: events may render but are excluded from the Event List at this zoom.
 * @param {object} [opts] - `{ extendToEarthOrbit?: boolean }` relaxes outer radius cap toward W (Day/Clock).
 */
function buildListHorizonHoopGroup(THREE, rHoopOuter, rHoopInner, earthW, yCenter, colorHex, renderOrder, opts) {
    if (!THREE) return null;
    const extendEarth = opts && opts.extendToEarthOrbit === true;
    const singularBand =
        typeof window !== 'undefined' &&
        typeof window.getSingularBandMode === 'function' &&
        !!window.getSingularBandMode();
    // Singular Context Arc = day spine (W ± circadian hand) — allow outer past W.
    const roCap = singularBand ? 1.12 : extendEarth ? 0.998 : 0.94;
    let ro = Math.max(earthW * 0.2, Math.min(rHoopOuter, earthW * roCap));
    const minGap = singularBand ? earthW * 0.004 : earthW * 0.015;
    let ri = Math.max(earthW * 0.06, Math.min(rHoopInner, ro - minGap));
    if (ri >= ro - (singularBand ? earthW * 0.002 : earthW * 0.02)) {
        ri = Math.max(earthW * 0.06, ro - Math.max(minGap, ro * (singularBand ? 0.02 : 0.5)));
    }
    const n = Math.max(36, Math.min(96, Math.round(52 + ro * 0.28)));
    const zDisc = typeof currentZoom !== 'undefined' ? currentZoom : 9;
    const arc =
        opts && opts.arc ? opts.arc : getListContextDiscArcRad(zDisc);
    const halfH = Math.max(0.75, earthW * 0.014);
    const bandHalfH = Math.max(0.22, halfH * 0.32);
    const y0 = yCenter - bandHalfH;
    const y1 = yCenter + bandHalfH;

    const helixCtx = getListHorizonHelixBuildContext(yCenter, zDisc);
    helixCtx.bandHalfH = bandHalfH;
    const useHelixBand = helixCtx && helixCtx.bounds && helixCtx.bounds.t1 > helixCtx.bounds.t0;

    const group = new THREE.Group();
    group.userData = {
        type: 'ListHorizonEarthRing',
        listInnerRadius: ri,
        listOuterRadius: ro,
        immuneToFlatten: true
    };

    const skyRo = renderOrder != null ? renderOrder : getListHorizonContextRenderOrder();
    const wallOpMul = useHelixBand ? 0.72 : 1;

    const skyFill = buildListHorizonSkyFillMesh(
        THREE,
        ri,
        ro,
        yCenter,
        n,
        colorHex,
        skyRo,
        arc,
        helixCtx
    );
    if (skyFill) {
        group.add(skyFill);
    }

    const wallInner = buildListHorizonHoopWallMesh(
        THREE, ri, y0, y1, n, colorHex, renderOrder, 1.65 * wallOpMul, true, arc, helixCtx
    );
    const wallOuter = buildListHorizonHoopWallMesh(
        THREE, ro, y0, y1, n, colorHex, renderOrder, 1 * wallOpMul, false, arc, helixCtx
    );
    if (wallInner) group.add(wallInner);
    if (wallOuter) group.add(wallOuter);

    // Singular: keep LTE day-spine sky above; also show classic blue Context Arc at
    // older zoom onion radii (Earth / Event Horizon sit outside the LTE day frame).
    if (singularBand && typeof TimeMarkers !== 'undefined' &&
        typeof TimeMarkers.getClassicListContextRingRadiiForZoom === 'function') {
        const classic = TimeMarkers.getClassicListContextRingRadiiForZoom(zDisc, earthW);
        let cRo = Math.max(earthW * 0.2, Math.min(classic.rOuter, earthW * 0.92));
        let cRi = Math.max(earthW * 0.06, Math.min(classic.rInner, cRo - earthW * 0.015));
        if (cRi >= cRo - earthW * 0.02) cRi = Math.max(earthW * 0.06, cRo * 0.5);
        // Only add if classic band is clearly sunward of LTE day spine (avoid double walls).
        if (cRo < ri - earthW * 0.01) {
            const blueHex = colorHex != null ? colorHex : 0x22d3ee;
            const classicInner = buildListHorizonHoopWallMesh(
                THREE, cRi, y0, y1, n, blueHex, (renderOrder != null ? renderOrder : 7) + 2,
                1.4 * wallOpMul, true, arc, helixCtx
            );
            const classicOuter = buildListHorizonHoopWallMesh(
                THREE, cRo, y0, y1, n, blueHex, (renderOrder != null ? renderOrder : 7) + 2,
                1.15 * wallOpMul, false, arc, helixCtx
            );
            if (classicInner) {
                classicInner.userData = Object.assign({}, classicInner.userData, {
                    type: 'ListHorizonClassicContextInner',
                    classicContextArc: true
                });
                group.add(classicInner);
            }
            if (classicOuter) {
                classicOuter.userData = Object.assign({}, classicOuter.userData, {
                    type: 'ListHorizonClassicContextOuter',
                    classicContextArc: true
                });
                group.add(classicOuter);
            }
            group.userData.classicInnerRadius = cRi;
            group.userData.classicOuterRadius = cRo;
        }
    }

    return group;
}

/**
 * Zoom-context annulus at selected time height: inner edge = Event List span band; outer = time-marker context hoop.
 * Hidden when list Draw-all is on.
 */
function isContextDiscEnabled() {
    if (tourContextArcVisible === false) return false;
    if (typeof window !== 'undefined' && window.eventsListHorizonRingActive === false) return false;
    if (!showDayFrameLteSky) return false;
    return true;
}

function updateListHorizonEarthRing(zoomLevel) {
    const T = getThreeNamespace();
    if (!T || !sceneContentGroup || !PLANET_DATA || !PLANET_DATA.length) return;
    if (!isContextDiscEnabled()) {
        disposeListHorizonEarthRing();
        resetListHorizonEarthRingAnimationState();
        return;
    }

    const earth = PLANET_DATA.find((p) => p.name === 'Earth');
    if (!earth) return;

    const { selectedDateHeight } = computeSceneDateHeights(zoomLevel);
    const W = earth.distance;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const { rInner: targetInnerRadius, rOuter: targetRadius } = resolveListHorizonRingRadii(z, W);

    listHorizonEarthRingTargetRadius = targetRadius;
    listHorizonEarthRingTargetInnerRadius = targetInnerRadius;
    listHorizonEarthRingTargetHeight = getListHorizonContextArcYCenter(selectedDateHeight);
    listHorizonEarthRingEarthDistance = W;
    listHorizonEarthRingTargetZoom = z;

    const arcKey = listContextDiscArcKey(z);
    const helixKey = listContextDiscHelixTimeKey(z);
    const needRebuild =
        listHorizonEarthRingCurrentRadius == null ||
        listHorizonEarthRingCurrentInnerRadius == null ||
        listHorizonEarthRingCurrentHeight == null ||
        !listHorizonEarthRingMesh ||
        listHorizonEarthRingArcKey !== arcKey ||
        listHorizonHelixTimeKey !== helixKey ||
        Math.abs(listHorizonEarthRingCurrentRadius - targetRadius) > 0.02 ||
        Math.abs(listHorizonEarthRingCurrentInnerRadius - targetInnerRadius) > 0.02;

    if (needRebuild) {
        listHorizonEarthRingCurrentRadius = targetRadius;
        listHorizonEarthRingCurrentInnerRadius = targetInnerRadius;
        listHorizonEarthRingCurrentHeight = getListHorizonContextArcYCenter(selectedDateHeight);
        listHorizonEarthRingArcKey = arcKey;
        listHorizonHelixTimeKey = helixKey;
        rebuildListHorizonEarthRingMesh(
            listHorizonEarthRingCurrentRadius,
            listHorizonEarthRingCurrentInnerRadius,
            listHorizonEarthRingCurrentHeight,
            W,
            z
        );
    } else {
        const skyColorKey = buildEarthDaylightSkyColorKey(getSkyCanvasObserverContext(z));
        if (listHorizonSkyColorKey !== skyColorKey) {
            refreshListHorizonContextArcSkyColors(z);
        }
    }
}

if (typeof window !== 'undefined') {
    window.getListContextDiscArcTimeBoundsMs = getListContextDiscArcTimeBoundsMs;
    window.getListContextDiscRadiiForPanel = function (zoomLevel) {
        const earth = PLANET_DATA && PLANET_DATA.find((p) => p.name === 'Earth');
        const W = earth ? earth.distance : 50;
        const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
        const ro = resolveListHorizonRingRadius(z, W);
        const ri = resolveListHorizonRingInnerRadius(z, W);
        return { inner: ri, outer: ro, innerFrac: ro > 0 ? ri / ro : 0.42 };
    };
    /** Panel ring SVG: arc length and start offset (pathLength 100), aligned to selected list span. */
    window.getListContextDiscArcForPanel = function (zoomLevel) {
        const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
        const arc = getListContextDiscArcRad(z);
        const C = 100;
        if (arc.fullCircle) {
            return { arcLen: C, arcGap: 0, arcOffset: 0, fullCircle: true };
        }
        const arcLen = Math.max(1.5, Math.min(C - 0.5, (arc.spanRad / (Math.PI * 2)) * C));
        const arcGap = C - arcLen;
        const midFrac = (((arc.thetaMid / (Math.PI * 2)) % 1) + 1) % 1;
        const arcOffset = (midFrac * C - arcLen * 0.5 + C) % C;
        return { arcLen, arcGap, arcOffset, fullCircle: false };
    };
    window.updateListHorizonEarthRingScene = function () {
        updateListHorizonEarthRing(currentZoom);
    };
    window.getContextDiscEnabled = isContextDiscEnabled;
}

/**
 * Radial tube Sun (origin in XZ at that date height) ↔ Earth on the helical worldline, thicker than tick lines.
 */
function buildSunEarthRadialTube(p0, p1, radius, colorHex, renderOrder) {
    if (typeof THREE === 'undefined') return null;
    const v0 = new THREE.Vector3(p0.x, p0.y, p0.z);
    const v1 = new THREE.Vector3(p1.x, p1.y, p1.z);
    const dir = new THREE.Vector3().subVectors(v1, v0);
    const len = dir.length();
    if (len < 1e-5) return null;
    dir.normalize();
    const mid = new THREE.Vector3().addVectors(v0, v1).multiplyScalar(0.5);
    const geom = new THREE.CylinderGeometry(radius, radius, len, 12, 1, false);
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.94,
        depthTest: true,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.renderOrder = renderOrder != null ? renderOrder : 8;
    mesh.userData = { type: 'SunEarthTimeRadial' };
    return mesh;
}

/**
 * Closed loop in the ecliptic (XZ) at local origin — reuse for Sun–Earth end ring and circadian day frames.
 */
function buildEclipticPlaneLineLoopGeometry(radius, segments) {
    if (typeof THREE === 'undefined') return null;
    const n = Math.max(16, segments != null ? Math.round(segments) : 48);
    const flat = [];
    for (let s = 0; s <= n; s++) {
        const t = (s / n) * Math.PI * 2;
        flat.push(Math.cos(t) * radius, 0, Math.sin(t) * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    return geo;
}

/**
 * Sun→Earth “time hand”: cylinder from Sun to just outside the local hour-marker band, plus a thin ring around Earth
 * so landing/clock zoom does not stack a second Earth-anchored spoke on top of the daily hour hands.
 */
function buildSunEarthRadialWithEndRing(sun, earthCenter, tubeRadius, colorHex, renderOrder, ringRadius) {
    if (typeof THREE === 'undefined') return null;
    const S = new THREE.Vector3(sun.x, sun.y, sun.z);
    const E = earthCenter.clone ? earthCenter.clone() : new THREE.Vector3(earthCenter.x, earthCenter.y, earthCenter.z);
    const dir = new THREE.Vector3().subVectors(E, S);
    const len = dir.length();
    if (len < 1e-5) return null;
    dir.normalize();
    const ringR = Math.max(Number(ringRadius) || 0, 1e-3);
    const stemLen = len - ringR;
    const minStem = Math.min(len * 0.04, Math.max(ringR * 0.08, 0.35));

    const group = new THREE.Group();
    group.userData = { type: 'SunEarthTimeRadialWithRing' };

    if (stemLen > minStem) {
        const end = new THREE.Vector3().copy(S).addScaledVector(dir, stemLen);
        const tube = buildSunEarthRadialTube(
            { x: S.x, y: S.y, z: S.z },
            { x: end.x, y: end.y, z: end.z },
            tubeRadius,
            colorHex,
            renderOrder
        );
        if (tube) group.add(tube);
    }

    const ringGeom = buildEclipticPlaneLineLoopGeometry(ringR, 56);
    if (ringGeom) {
        const ring = new THREE.LineLoop(
            ringGeom,
            new THREE.LineBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.9,
                depthTest: true,
                depthWrite: false
            })
        );
        ring.position.copy(E);
        ring.rotation.set(0, 0, 0);
        ring.renderOrder = renderOrder != null ? renderOrder + 1 : 9;
        ring.userData = { type: 'SunEarthTimeRadialRing' };
        group.add(ring);
    }

    return group;
}

/**
 * Great-circle edge for Earth-hand square marker.
 * Prefer cheap THREE.Line over TubeGeometry — but Lines have no volume, so draw on a
 * slightly lifted sphere (old tube radius) or the stroke sinks into the globe / z-fights.
 */
function buildEarthHandSurfaceArcEdge(p0, p1, sphereCenter, sphereRadius, edgeRadius, colorHex, renderOrder) {
    if (typeof THREE === 'undefined') return null;
    const center = sphereCenter.clone ? sphereCenter.clone() : new THREE.Vector3(sphereCenter.x, sphereCenter.y, sphereCenter.z);
    const a = p0.clone ? p0.clone() : new THREE.Vector3(p0.x, p0.y, p0.z);
    const b = p1.clone ? p1.clone() : new THREE.Vector3(p1.x, p1.y, p1.z);
    const ua = new THREE.Vector3().subVectors(a, center).normalize();
    const ub = new THREE.Vector3().subVectors(b, center).normalize();
    const lift = Math.max(
        typeof edgeRadius === 'number' && edgeRadius > 0 ? edgeRadius : 0,
        sphereRadius * 0.004,
        0.008
    );
    const rDraw = sphereRadius + lift;
    const flat = [];
    const segments = 10;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const u = new THREE.Vector3().copy(ua).lerp(ub, t).normalize();
        const p = new THREE.Vector3().copy(center).addScaledVector(u, rDraw);
        flat.push(p.x, p.y, p.z);
    }
    const ro = renderOrder != null ? renderOrder : 12;
    if (typeof MeshPrimitives !== 'undefined' && MeshPrimitives.lineFromFlat) {
        return MeshPrimitives.lineFromFlat(flat, {
            THREE,
            color: colorHex,
            opacity: 0.92,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            renderOrder: ro
        });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            depthTest: true
        })
    );
    line.renderOrder = ro;
    return line;
}

function buildEarthHandSquareMarker(corners, sphereCenter, sphereRadius, edgeRadius, colorHex, renderOrder) {
    if (typeof THREE === 'undefined' || !Array.isArray(corners) || corners.length < 4) return null;
    const group = new THREE.Group();
    group.userData = { type: 'EarthHandMarker' };
    for (let i = 0; i < corners.length; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        const edge = buildEarthHandSurfaceArcEdge(a, b, sphereCenter, sphereRadius, edgeRadius, colorHex, renderOrder);
        if (edge) group.add(edge);
    }
    return group;
}

function updateSunEarthTimeRadials(zoomLevel) {
    if (typeof THREE === 'undefined' || !sceneContentGroup || !PLANET_DATA || !PLANET_DATA.length) return;
    const earth = PLANET_DATA.find((p) => p.name === 'Earth');
    if (!earth) return;

    disposeSunEarthTimeRadials();

    const { currentDateHeight, selectedDateHeight } = computeSceneDateHeights(zoomLevel);
    lastLogicalSelectedDateHeight = selectedDateHeight;
    ensureFlattenWorldOriginFromLogicalY(selectedDateHeight);
    const selectedSceneY = getFlattenedSceneY(selectedDateHeight);
    const currentSceneY = getFlattenedSceneY(currentDateHeight);
    const d = earth.distance;
    const yearsFromCurrentToSelected = (selectedDateHeight - currentDateHeight) / 100;
    const orbitsFromCurrentToSelected = yearsFromCurrentToSelected / earth.orbitalPeriod;
    const angleFromCurrentToSelected = orbitsFromCurrentToSelected * Math.PI * 2;
    const earthAngleSelected = earth.startAngle - angleFromCurrentToSelected;
    const earthAngleCurrent = earth.startAngle;

    // Sun Hands: thinner than before so day/time markers stay readable under them.
    let tubeRSelected = Math.max(0.022, d * 0.00205);
    let tubeRCurrent = tubeRSelected * 0.48;
    if (zoomLevel === 0 || zoomLevel === 9) {
        tubeRSelected = Math.max(0.0095, d * 0.00095);
        tubeRCurrent = tubeRSelected * 0.62;
    }

    const sunSel = { x: 0, y: selectedSceneY, z: 0 };
    const earthSel = {
        x: Math.cos(earthAngleSelected) * d,
        y: selectedSceneY,
        z: Math.sin(earthAngleSelected) * d
    };
    const sunCur = { x: 0, y: currentSceneY, z: 0 };
    const earthCur = {
        x: Math.cos(earthAngleCurrent) * d,
        y: currentSceneY,
        z: Math.sin(earthAngleCurrent) * d
    };

    const earthMesh = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    const earthSurfaceRadius = resolveEarthGlobeSurfaceRadius(earthMesh) ||
        (earth && typeof earth.size === 'number' ? earth.size : 6.5) * 0.3;
    const hourNumberRadius = earthSurfaceRadius * 2.2;
    const ringPad = Math.max(tubeRSelected * 0.35, 0.012);
    const sunHandRingRadius = hourNumberRadius * 1.2 + ringPad;

    const sunRingEarthCenterSel = new THREE.Vector3(
        earthMesh ? earthMesh.position.x : earthSel.x,
        selectedSceneY,
        earthMesh ? earthMesh.position.z : earthSel.z
    );
    const sunRingEarthCenterCur = new THREE.Vector3(
        earthMesh ? earthMesh.position.x : earthCur.x,
        currentSceneY,
        earthMesh ? earthMesh.position.z : earthCur.z
    );

    const eps = 0.2;
    function near3(a, b) {
        return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
    }
    const sameRadial = near3(sunSel, sunCur) && near3(earthSel, earthCur);

    // Stem stops before Earth; torus sits outside hour numerals (avoids doubling Earth hour hands at zoom 0/9).
    if (sameRadial) {
        sunEarthTimeRadialCurrent = buildSunEarthRadialWithEndRing(
            sunCur,
            sunRingEarthCenterCur,
            tubeRSelected,
            0xff0000,
            10,
            sunHandRingRadius
        );
        if (sunEarthTimeRadialCurrent) sceneContentGroup.add(sunEarthTimeRadialCurrent);
    } else {
        sunEarthTimeRadialSelected = buildSunEarthRadialWithEndRing(
            sunSel,
            sunRingEarthCenterSel,
            tubeRSelected,
            getSelectedTimeColor(),
            8,
            sunHandRingRadius
        );
        if (sunEarthTimeRadialSelected) sceneContentGroup.add(sunEarthTimeRadialSelected);
        if (!tourMinimalOrbitMode) {
            sunEarthTimeRadialCurrent = buildSunEarthRadialWithEndRing(
                sunCur,
                sunRingEarthCenterCur,
                tubeRCurrent,
                0xff0000,
                10,
                sunHandRingRadius
            );
            if (sunEarthTimeRadialCurrent) sceneContentGroup.add(sunEarthTimeRadialCurrent);
        }
    }

    if (zoomLevel === 0 || zoomLevel === 8 || zoomLevel === 9) {
        const selectedDate = getSelectedDateTime();
        const currentDate = new Date();
        if (typeof EarthGlobe !== 'undefined' && earthMesh && EarthGlobe.updateGlobeHands) {
            EarthGlobe.updateGlobeHands({
                earthGroup: earthMesh,
                selectedDate,
                currentDate,
                hourNumberRadius,
                selectedDateHeight,
                zoomLevel,
                sceneContentGroup,
                tourMinimalOrbitMode,
                getSelectedTimeColor
            });
        }
    }

}

/**
 * During smoothNavigateToTime, skip full mesh/worldline teardown: move planets, orbits, focus, Moon guide only.
 * Worldlines / Lagrange / markers refresh on the final full createPlanets after the scrub ends.
 * @returns {boolean} true if the light path handled this frame
 */
function applyLightTimeScrubUpdate(zoomLevel) {
    if (planetMeshes.length !== expectedVisiblePlanetCount(zoomLevel)) return false;
    if (orbitLines.length !== planetMeshes.length) return false;

    const config = ZOOM_LEVELS[zoomLevel];
    if (focusTargetOverride === 'mid' && !keepMidFocusOverrideAtZoom(zoomLevel)) {
        focusTargetOverride = null;
    }
    if (focusTargetOverride === 'moon' && zoomLevel !== 6) {
        focusTargetOverride = null;
    }
    if (!focusSunAllowedAtZoom(zoomLevel) && focusTargetOverride === 'sun') {
        focusTargetOverride = null;
    }
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;

    const { currentDateHeight, selectedDateHeight, selectedHeightOffset, selectedDate } = computeSceneDateHeights(zoomLevel);
    lastLogicalSelectedDateHeight = selectedDateHeight;
    ensureFlattenWorldOriginFromLogicalY(selectedDateHeight);
    const selectedSceneY = getFlattenedSceneY(selectedDateHeight);
    const currentSceneY = getFlattenedSceneY(currentDateHeight);

    const needGhost = Math.abs(selectedHeightOffset) > 1e-6 && !tourMinimalOrbitMode;
    if (!ghostEarth && needGhost) return false;
    if (ghostEarth) ghostEarth.visible = needGhost;
    if (ghostOrbitLine) ghostOrbitLine.visible = needGhost;

    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        if (
            preferEarthEventHorizonCamera &&
            contextSphereState &&
            typeof contextSphereState.x === 'number' &&
            isFinite(contextSphereState.radius) &&
            contextSphereState.radius > 0
        ) {
            targetFocusPoint.set(contextSphereState.x, getFlattenedSceneY(contextSphereState.y), contextSphereState.z);
        } else {
            const earth = PLANET_DATA.find((p) => p.name === 'Earth');
            const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            const earthX = earthPos.x;
            const earthZ = earthPos.z;
            const earthMesh = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
            if (
                !preferEarthEventHorizonCamera &&
                zoomLevel === 0 &&
                effectiveFocusTarget === 'earth'
            ) {
                const rSurf = resolveEarthGlobeSurfaceRadius(earthMesh);
                const fp = getEarthHourHandZoom0FocusPoint(
                    { x: earthX, z: earthZ },
                    selectedDateHeight,
                    selectedDate,
                    rSurf
                );
                targetFocusPoint.set(fp.x, getFlattenedSceneY(fp.y), fp.z);
            } else if (effectiveFocusTarget === 'mid' && !preferEarthEventHorizonCamera) {
                const midFrac = getFocusMidRadialFrac(zoomLevel);
                targetFocusPoint.set(earthX * midFrac, selectedSceneY, earthZ * midFrac);
            } else {
                targetFocusPoint.set(earthX, selectedSceneY, earthZ);
            }
        }
    } else if (effectiveFocusTarget === 'moon') {
        const earth = PLANET_DATA.find((p) => p.name === 'Earth');
        const earthMesh = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
        const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;
        if (MM && typeof MM.moonXZPedagogicalFromEarthMesh === 'function' && earthMesh) {
            const mxz = MM.moonXZPedagogicalFromEarthMesh(
                earthMesh,
                selectedDate,
                null,
                currentDateHeight,
                selectedDateHeight
            );
            targetFocusPoint.set(mxz.x, selectedSceneY, mxz.z);
        } else if (MM && typeof MM.moonXZPedagogicalFromEarthMesh === 'function' && earth) {
            const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            const stub = { position: { x: earthPos.x, y: selectedDateHeight, z: earthPos.z } };
            const mxz = MM.moonXZPedagogicalFromEarthMesh(
                stub,
                selectedDate,
                null,
                currentDateHeight,
                selectedDateHeight
            );
            targetFocusPoint.set(mxz.x, selectedSceneY, mxz.z);
        } else {
            targetFocusPoint.set(0, selectedSceneY, 0);
        }
    } else {
        targetFocusPoint.set(0, selectedSceneY, 0);
    }

    if (sunMesh) sunMesh.position.y = selectedSceneY;
    if (sunGlow) sunGlow.position.y = selectedSceneY;
    if (sunLight) sunLight.position.y = selectedSceneY;

    const segments = 128;
    PLANET_DATA.forEach((planetData) => {
        const planet = planetMeshes.find((p) => p && p.userData && p.userData.name === planetData.name);
        if (!planet) return;
        const posXZ = getPlanetXZAtSelectedDate(planetData, selectedDate, currentDateHeight, selectedDateHeight);
        const planetAngle = Math.atan2(posXZ.z, posXZ.x);
        planet.position.set(
            posXZ.x,
            selectedSceneY,
            posXZ.z
        );
        planet.userData.angle = planetAngle;
        planet.userData.baseHeight = selectedDateHeight;

        const lineIdx = planetMeshes.indexOf(planet);
        const line = lineIdx >= 0 ? orbitLines[lineIdx] : null;
        if (line && line.geometry && line.geometry.attributes.position) {
            const pos = line.geometry.attributes.position;
            fillPlanetOrbitRingPositions(
                pos.array,
                planetData,
                selectedDate,
                currentDateHeight,
                selectedDateHeight,
                selectedDateHeight,
                segments
            );
            pos.needsUpdate = true;
        }
    });

    if (ghostEarth && needGhost) {
        const earthData = PLANET_DATA.find((p) => p.name === 'Earth');
        if (earthData) {
            const currentDate = new Date();
            const earthCurrentXZ = getPlanetXZAtSelectedDate(earthData, currentDate, currentDateHeight, currentDateHeight);
            ghostEarth.position.set(
                earthCurrentXZ.x,
                currentSceneY,
                earthCurrentXZ.z
            );
        }
    }
    if (ghostOrbitLine && ghostOrbitLine.geometry && ghostOrbitLine.geometry.attributes.position && needGhost) {
        const earthData = PLANET_DATA.find((p) => p.name === 'Earth');
        if (earthData) {
            const pos = ghostOrbitLine.geometry.attributes.position;
            fillPlanetOrbitRingPositions(
                pos.array,
                earthData,
                new Date(),
                currentDateHeight,
                currentDateHeight,
                currentDateHeight,
                segments
            );
            pos.needsUpdate = true;
        }
    }

    if (
        isMoonLayerEffectiveAtZoom(zoomLevel) &&
        MM &&
        typeof MM.moonXZPedagogicalFromEarthMesh === 'function' &&
        moonMechanicObjects.length
    ) {
        const earth = PLANET_DATA.find((p) => p.name === 'Earth');
        const earthMesh = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
        if (earth && earthMesh) {
            const mxz = MM.moonXZPedagogicalFromEarthMesh(
                earthMesh,
                selectedDate,
                null,
                currentDateHeight,
                selectedDateHeight
            );
            let ex = earthMesh.position.x;
            let ez = earthMesh.position.z;
            if (typeof MM.resolveEarthXZForMoon === 'function') {
                const eXZ = MM.resolveEarthXZForMoon(
                    selectedDateHeight,
                    currentDateHeight,
                    selectedDate,
                    null,
                    selectedDateHeight
                );
                ex = eXZ.x;
                ez = eXZ.z;
            }
            moonMechanicObjects.forEach((obj) => {
                if (!obj || !obj.userData) return;
                if (obj.userData.role === 'pedagogicalMoon') {
                    obj.position.set(mxz.x, selectedSceneY, mxz.z);
                }
                if (obj.userData.role === 'earthMoonGuide' && obj.geometry && obj.geometry.attributes.position) {
                    const pa = obj.geometry.attributes.position.array;
                    pa[0] = ex;
                    pa[1] = selectedSceneY;
                    pa[2] = ez;
                    pa[3] = mxz.x;
                    pa[4] = selectedSceneY;
                    pa[5] = mxz.z;
                    obj.geometry.attributes.position.needsUpdate = true;
                    if (typeof obj.computeLineDistances === 'function') obj.computeLineDistances();
                }
            });
        }
    }

    const earthMeshScrub = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
    if (earthMeshScrub && typeof EarthGlobe !== 'undefined') {
        if (typeof EarthGlobe.refreshObserverForSelectedTime === 'function') {
            EarthGlobe.refreshObserverForSelectedTime(selectedDate, zoomLevel);
        }
        if (typeof EarthGlobe.updateOrientation === 'function') {
            EarthGlobe.updateOrientation(earthMeshScrub, selectedDate);
        }
    }
    // Pose before sky so disc / day-frame fill Context Sphere.
    try {
        ensureContextSphereState(zoomLevel);
    } catch (e) { /* optional */ }
    refreshLiveEventHorizonWarp();
    if (isEarthDaylightSkyZoom(zoomLevel) && earthMeshScrub) {
        updateEarthDaylightSky(earthMeshScrub, zoomLevel);
    } else if (!isEarthDaylightSkyZoom(zoomLevel)) {
        disposeEarthDaylightSky();
    }
    updateDayFrameLteSkyBackdrop(zoomLevel);

    if (zoomLevel === 0 || zoomLevel === 8 || zoomLevel === 9) {
        createTimeMarkers(zoomLevel === 0 ? 9 : zoomLevel);
    }

    updateSunEarthTimeRadials(zoomLevel);
    updateListHorizonEarthRing(zoomLevel);

    if (
        typeof EventRenderer !== 'undefined' &&
        typeof EventRenderer.updateCircadianShortEventsForScrub === 'function'
    ) {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        try {
            EventRenderer.updateCircadianShortEventsForScrub(gl, selectedDateHeight);
        } catch (e) {
            /* optional during scrub */
        }
    }

    try {
        updateParentUnitTemporalVeil(zoomLevel);
    } catch (e) { /* veil optional */ }
    try {
        syncEventHorizonCameraAfterSphere(zoomLevel);
    } catch (e) { /* optional */ }

    return true;
}

function getUserBirthYear() {
    if (userBirthdayDate && !isNaN(userBirthdayDate.getTime())) {
        return userBirthdayDate.getFullYear();
    }
    return null;
}

/** Keep a year span from starting before stored birth year. */
function clampYearSpanToBirth(y0, y1) {
    const by = getUserBirthYear();
    if (typeof by !== 'number' || isNaN(by)) return { y0: y0, y1: y1 };
    const start = Math.max(y0, by);
    return { y0: start, y1: Math.max(y1, start) };
}

/**
 * Decade helix start year. With a stored birthday, decades of life start on that year
 * (birth, birth+10, …). Else calendar decades (2020, 2030, …).
 */
function getDecadeStartYear(navYear) {
    const y = typeof navYear === 'number' && !isNaN(navYear)
        ? navYear
        : (typeof currentYear === 'number' ? currentYear : new Date().getFullYear());
    if (userBirthdayDate && !isNaN(userBirthdayDate.getTime())) {
        const by = userBirthdayDate.getFullYear();
        const raw = by + Math.floor((y - by) / 10) * 10;
        return Math.max(by, raw);
    }
    return Math.floor(y / 10) * 10;
}

function parseBirthdayInput(raw) {
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    if (raw == null) return null;
    const s = String(raw).trim();
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0);
    const md = s.match(/^(\d{2})-(\d{2})$/);
    if (md) return new Date(new Date().getFullYear(), Number(md[1]) - 1, Number(md[2]), 12, 0, 0);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Logged-in birthday: decade zoom, selected time on that date.
 * Full YYYY-MM-DD also anchors the 10-year helix at birth year.
 */
function applyUserBirthdayView(raw) {
    const d = parseBirthdayInput(raw);
    if (!d) return;
    if (raw instanceof Date) {
        userBirthdayDate = d;
    } else {
        const s = raw == null ? '' : String(raw).trim();
        userBirthdayDate = /^\d{4}-/.test(s) ? d : null;
    }
}

if (typeof window !== 'undefined') {
    window.getUserBirthYear = getUserBirthYear;
    window.clampYearSpanToBirth = clampYearSpanToBirth;
    window.getDecadeStartYear = getDecadeStartYear;
    window.applyUserBirthdayView = applyUserBirthdayView;
}

/**
 * Other planets off unless the user forces them on (P / HUD).
 */
function showOtherPlanetsAtZoom(_zoomLevel) {
    if (otherPlanetsOverride === true) return true;
    return false;
}

/** Earth helix on Century, Decade, and Year (Zooms 1-3); removed for Zoom 4 (Quarter) and above. */
function isEarthWorldlineVisibleAtZoom(zoomLevel) {
    if (showEarthHelicalWorldline === true) return true;
    if (typeof flattenMode === 'string' && flattenMode === 'all') return true;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    return z >= 1 && z < 4;
}

function expectedVisiblePlanetCount(zoomLevel) {
    if (typeof PLANET_DATA === 'undefined' || !PLANET_DATA.length) return 0;
    return showOtherPlanetsAtZoom(zoomLevel) ? PLANET_DATA.length : 1;
}

function createPlanets(zoomLevel) {
    eventsRefreshedDuringCreatePlanets = false;
    // Ensure Worldlines is initialized before use
    if (typeof Worldlines !== 'undefined' && typeof Worldlines.init === 'function') {
        // Initialize Worldlines if not already done
        Worldlines.init({
            scene: sceneContentGroup,
            PLANET_DATA,
            ZOOM_LEVELS,
            SCENE_CONFIG,
            calculateDateHeight,
            getHeightForYear,
            calculateCurrentDateHeight,
            CENTURY_START,
            currentYear,
            isLightMode,
            getSelectedTimeColor,
            SceneGeometry: typeof SceneGeometry !== 'undefined' ? SceneGeometry : null,
            calculateActualCurrentDateHeight: typeof calculateActualCurrentDateHeight !== 'undefined' ? calculateActualCurrentDateHeight : null,
            calculateYearProgressForDate: typeof calculateYearProgressForDate !== 'undefined' ? calculateYearProgressForDate : null,
            getDaysInMonth: typeof getDaysInMonth !== 'undefined' ? getDaysInMonth : null,
            isLeapYear: typeof isLeapYear !== 'undefined' ? isLeapYear : null,
            getSelectedDateTime: typeof getSelectedDateTime === 'function' ? getSelectedDateTime : null
        });
    }
    if (typeof CircadianRenderer !== 'undefined' && typeof CircadianRenderer.init === 'function') {
        CircadianRenderer.init({
            SceneGeometry: typeof SceneGeometry !== 'undefined' ? SceneGeometry : null,
            calculateDateHeight,
            calculateCurrentDateHeight,
            PLANET_DATA
        });
    }

    if (typeof isSmoothNavigatingTime !== 'undefined' && isSmoothNavigatingTime) {
        if (applyLightTimeScrubUpdate(zoomLevel)) {
            return;
        }
    }

    planetMeshes.forEach((p) => {
        if (p.userData && p.userData.name === 'Earth' && typeof EarthGlobe !== 'undefined' && EarthGlobe.disposeEarthGroup) {
            EarthGlobe.disposeEarthGroup(p);
        } else {
            sceneContentGroup.remove(p);
            if (p.geometry) p.geometry.dispose();
            if (p.material) {
                if (Array.isArray(p.material)) p.material.forEach((m) => m.dispose());
                else p.material.dispose();
            }
        }
    });
    const flatGroup = flattenableGroup || sceneContentGroup;
    orbitLines.forEach(o => flatGroup.remove(o));
    worldlines.forEach(w => flatGroup.remove(w));
    
    // Remove ghost elements (ghostEarth stays on sceneContentGroup, ghostOrbitLine on flattenable)
    if (typeof ghostEarth !== 'undefined' && ghostEarth) {
        sceneContentGroup.remove(ghostEarth);
        ghostEarth = null;
    }
    if (typeof ghostOrbitLine !== 'undefined' && ghostOrbitLine) {
        flatGroup.remove(ghostOrbitLine);
        ghostOrbitLine = null;
    }
    
    planetMeshes.length = 0;
    orbitLines.length = 0;
    worldlines.length = 0;

    lagrangeMarkerObjects.forEach((obj) => sceneContentGroup.remove(obj));
    lagrangeMarkerObjects.length = 0;

    disposeLagrangeL1DayArcSceneObjects();

    moonMechanicObjects.forEach((obj) => {
        if (obj && obj.parent) obj.parent.remove(obj);
    });
    moonMechanicObjects.length = 0;

    circadianWorldlines.forEach(obj => {
        flatGroup.remove(obj);
        if (sceneContentGroup) sceneContentGroup.remove(obj);
    });
    circadianWorldlines = [];
    if (typeof TimeseriesRenderer !== 'undefined' && typeof TimeseriesRenderer.resetRefreshCache === 'function') {
        TimeseriesRenderer.resetRefreshCache();
    }
    if (typeof AtcBand !== 'undefined' && typeof AtcBand.resetGuideCache === 'function') {
        AtcBand.resetGuideCache();
    }
    circadianHelixMarkerGroups.forEach(obj => {
        if (sceneContentGroup) sceneContentGroup.remove(obj);
    });
    circadianHelixMarkerGroups = [];
    disposeParentUnitTemporalVeil();

    disposeSunEarthTimeRadials();

    const config = ZOOM_LEVELS[zoomLevel];
    if (focusTargetOverride === 'mid' && !keepMidFocusOverrideAtZoom(zoomLevel)) {
        focusTargetOverride = null;
    }
    if (focusTargetOverride === 'moon' && zoomLevel !== 6) {
        focusTargetOverride = null;
    }
    if (!focusSunAllowedAtZoom(zoomLevel) && focusTargetOverride === 'sun') {
        focusTargetOverride = null;
    }
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    const focusOnEarth = effectiveFocusTarget === 'earth';

    const { currentDateHeight, selectedDateHeight, selectedHeightOffset, selectedDate } = computeSceneDateHeights(zoomLevel);
    lastLogicalSelectedDateHeight = selectedDateHeight;
    ensureFlattenWorldOriginFromLogicalY(selectedDateHeight);
    const selectedSceneY = getFlattenedSceneY(selectedDateHeight);
    const currentSceneY = getFlattenedSceneY(currentDateHeight);

    let tourHelicalClip = null;
    if (
        typeof tourWorldlineRevealProgress === 'number' &&
        !isNaN(tourWorldlineRevealProgress) &&
        tourWorldlineRevealProgress >= 0 &&
        tourWorldlineRevealProgress <= 1
    ) {
        const ySrc = selectedDate.getFullYear();
        const hJan = calculateDateHeight(ySrc, 0, 1, 0);
        const hYearEnd = calculateDateHeight(ySrc, 11, 31, 12);
        let hs = hJan;
        let he = hYearEnd;
        if (hs > he) {
            const t = hs;
            hs = he;
            he = t;
        }
        const span = Math.max(0.001, selectedDateHeight - hJan);
        const initialClipYMax = hJan + Math.max(0.02, span * tourWorldlineRevealProgress);
        tourHelicalClip = {
            heightStart: hs,
            heightEnd: he,
            narrativeShaderClip: true,
            phaseReferenceHeight: selectedDateHeight,
            tourLightSegments: true,
            initialClipYMax
        };
    }

    if (tourNarrativeOverlayMeshes && tourNarrativeOverlayMeshes.length) {
        tourNarrativeOverlayMeshes.forEach((m) => {
            if (m && m.parent) m.parent.remove(m);
            if (m && m.geometry) m.geometry.dispose();
            if (m && m.material) m.material.dispose();
        });
        tourNarrativeOverlayMeshes.length = 0;
    }
    if (tourSolsticeCrossActive && typeof THREE !== 'undefined' && flatGroup && !isNaN(selectedDateHeight)) {
        const earthD = (PLANET_DATA.find((p) => p.name === 'Earth') || { distance: 50 }).distance;
        const arm = earthD * 0.42;
        const y = selectedDateHeight;
        const mk = (xa, ya, za, xb, yb, zb, hex) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute([xa, ya, za, xb, yb, zb], 3));
            const mat = new THREE.LineBasicMaterial({
                color: hex,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            });
            const ln = new THREE.Line(g, mat);
            ln.renderOrder = 25;
            flatGroup.add(ln);
            tourNarrativeOverlayMeshes.push(ln);
        };
        mk(-arm, y, 0, arm, y, 0, isLightMode ? 0x1a3a6e : 0x88ccff);
        mk(0, y, -arm, 0, y, arm, isLightMode ? 0x1a3a6e : 0x88ccff);
    }
    // For earth-focused zooms, focus on Earth's X,Z (or Context Sphere center) at selected height.
    // Default product framing: Earth + Event Horizon for all zoom levels.
    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        if (
            preferEarthEventHorizonCamera &&
            contextSphereState &&
            typeof contextSphereState.x === 'number' &&
            isFinite(contextSphereState.radius) &&
            contextSphereState.radius > 0
        ) {
            targetFocusPoint.set(contextSphereState.x, getFlattenedSceneY(contextSphereState.y), contextSphereState.z);
        } else {
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            const earthX = earthPos.x;
            const earthZ = earthPos.z;
            const earthMesh = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
            if (
                !preferEarthEventHorizonCamera &&
                zoomLevel === 0 &&
                effectiveFocusTarget === 'earth'
            ) {
                const rSurf = resolveEarthGlobeSurfaceRadius(earthMesh);
                const fp = getEarthHourHandZoom0FocusPoint(
                    { x: earthX, z: earthZ },
                    selectedDateHeight,
                    selectedDate,
                    rSurf
                );
                targetFocusPoint.set(fp.x, getFlattenedSceneY(fp.y), fp.z);
            } else if (effectiveFocusTarget === 'mid' && !preferEarthEventHorizonCamera) {
                const midFrac = getFocusMidRadialFrac(zoomLevel);
                targetFocusPoint.set(earthX * midFrac, selectedSceneY, earthZ * midFrac);
            } else {
                targetFocusPoint.set(earthX, selectedSceneY, earthZ);
            }
        }
    } else if (effectiveFocusTarget === 'moon') {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;
        if (MM && typeof MM.moonXZPedagogicalFromEarthMesh === 'function' && earth) {
            const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            const stub = { position: { x: earthPos.x, y: selectedDateHeight, z: earthPos.z } };
            const mxz = MM.moonXZPedagogicalFromEarthMesh(
                stub,
                selectedDate,
                null,
                currentDateHeight,
                selectedDateHeight
            );
            targetFocusPoint.set(mxz.x, selectedSceneY, mxz.z);
        } else if (earth) {
            const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            const earthX = earthPos.x;
            const earthZ = earthPos.z;
            const midFrac = getFocusMidRadialFrac(zoomLevel);
            targetFocusPoint.set(earthX * midFrac, selectedSceneY, earthZ * midFrac);
        } else {
            targetFocusPoint.set(0, selectedSceneY, 0);
        }
    } else {
        // Sun-focused: point camera at the Sun's position in space-time (origin in X/Z at selected height)
        targetFocusPoint.set(0, selectedSceneY, 0);
    }

    // Update Sun position to match selected date height
    if (sunMesh) {
        sunMesh.position.y = selectedSceneY;
    }
    if (sunGlow) {
        sunGlow.position.y = selectedSceneY;
    }
    if (sunLight) {
        sunLight.position.y = selectedSceneY;
    }
    
    // Calculate scale factor for all planets based on zoom level
    // Use 30% size for all zoom levels (same as zoom levels 7+)
    let planetScaleFactor = 0.3;
    
    PLANET_DATA.forEach(planetData => {
        if (!showOtherPlanetsAtZoom(zoomLevel) && planetData.name !== 'Earth') return;
        let planetSize = planetData.size * planetScaleFactor;
        
        const posXZ = getPlanetXZAtSelectedDate(planetData, selectedDate, currentDateHeight, selectedDateHeight);
        const planetAngle = Math.atan2(posXZ.z, posXZ.x);

        let planet;
        if (planetData.name === 'Earth' && typeof EarthGlobe !== 'undefined' && EarthGlobe.createEarthPlanet) {
            if (typeof EarthGlobe.refreshObserverForSelectedTime === 'function') {
                EarthGlobe.refreshObserverForSelectedTime(selectedDate, zoomLevel);
            }
            planet = EarthGlobe.createEarthPlanet({
                planetSize,
                color: planetData.color,
                zoomLevel,
                position: { x: posXZ.x, y: selectedSceneY, z: posXZ.z },
                parentGroup: sceneContentGroup
            });
            if (planet && typeof EarthGlobe.updateOrientation === 'function') {
                EarthGlobe.updateOrientation(planet, selectedDate);
            }
            if (planet && typeof EarthGlobe.setGlobeZoomAppearance === 'function') {
                EarthGlobe.setGlobeZoomAppearance(planet, zoomLevel);
            }
        } else {
            const geometry = new THREE.SphereGeometry(planetSize, 32, 32);
            const material = new THREE.MeshStandardMaterial({
                color: planetData.color,
                metalness: 0.3,
                roughness: 0.7
            });
            planet = new THREE.Mesh(geometry, material);
            planet.position.x = posXZ.x;
            planet.position.y = selectedSceneY;
            planet.position.z = posXZ.z;
            sceneContentGroup.add(planet);
        }

        planet.userData = Object.assign(planet.userData || {}, {
            distance: planetData.distance,
            speed: planetData.speed,
            angle: planetAngle,
            name: planetData.name,
            baseHeight: selectedDateHeight
        });

        planetMeshes.push(planet);
        
        // Ghost Earth at “now” (orbital XZ + current height). Skip globe hand zooms; never depth-write over graticule.
        const showGhostEarth =
            planetData.name === 'Earth' &&
            Math.abs(selectedHeightOffset) > 1e-6 &&
            !tourMinimalOrbitMode &&
            zoomLevel !== 0 &&
            zoomLevel !== 8 &&
            zoomLevel !== 9;
        if (showGhostEarth) {
            const ghostGeometry = new THREE.SphereGeometry(planetSize, 32, 32);
            const ghostMaterial = new THREE.MeshStandardMaterial({
                color: planetData.color,
                metalness: 0.3,
                roughness: 0.7,
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                depthTest: true
            });
            ghostEarth = new THREE.Mesh(ghostGeometry, ghostMaterial);
            ghostEarth.renderOrder = 1;

            const earthCurrentXZ = getPlanetXZAtSelectedDate(
                planetData,
                new Date(),
                currentDateHeight,
                currentDateHeight
            );
            ghostEarth.position.x = earthCurrentXZ.x;
            ghostEarth.position.y = currentSceneY;
            ghostEarth.position.z = earthCurrentXZ.z;

            sceneContentGroup.add(ghostEarth);
        }
        
        // Create orbit line at selected date height
        // Validate selectedDateHeight before creating geometry
        if (!isNaN(selectedDateHeight)) {
            const orbitGeometry = new THREE.BufferGeometry();
            const segments = 128;
            const orbitPoints = new Float32Array((segments + 1) * 3);
            fillPlanetOrbitRingPositions(
                orbitPoints,
                planetData,
                selectedDate,
                currentDateHeight,
                selectedDateHeight,
                selectedDateHeight,
                segments
            );
            
            orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(orbitPoints, 3));
            const orbitMaterial = new THREE.LineBasicMaterial({
                color: getOrbitLineColor(), // Darker blue in light mode
                transparent: true,
                opacity: SCENE_CONFIG.orbitLineOpacity
            });
            const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
            flatGroup.add(orbitLine);
            orbitLines.push(orbitLine);
        } else {
            console.warn('createPlanets: selectedDateHeight is NaN, skipping orbit line for', planetData.name);
        }
        
        // Create worldline using Worldlines module (skipped in intro “minimal orbit” view)
        if (tourMinimalOrbitMode) {
            // keep orbit rings + planet meshes only
        } else if (typeof Worldlines !== 'undefined' && Worldlines.createWorldline) {
            const skipEarthWl =
                planetData.name === 'Earth' && !isEarthWorldlineVisibleAtZoom(zoomLevel);
            if (!skipEarthWl) {
                const wlClip = tourHelicalClip;
                const worldline = Worldlines.createWorldline(planetData, config.timeYears, zoomLevel, wlClip);
                if (worldline) { // Check if worldline was created successfully
                    worldline.visible = isWorldlineVisibleForZoom(zoomLevel);
                    flatGroup.add(worldline);
                    worldlines.push(worldline);
                }
            }
        } else {
            // Fallback if Worldlines module not available
            console.warn('Worldlines module not available, worldlines will not be created');
        }
    });

    const earthPlanet = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    // Pose first so Sky Canvas can size to Context Sphere radius.
    try {
        ensureContextSphereState(zoomLevel);
    } catch (e) { /* optional */ }
    if (isEarthDaylightSkyZoom(zoomLevel) && earthPlanet) {
        updateEarthDaylightSky(earthPlanet, zoomLevel);
    } else {
        disposeEarthDaylightSky();
    }
    updateDayFrameLteSkyBackdrop(zoomLevel);

    if (!tourMinimalOrbitMode && earthPlanet) {
        addLagrangeSunEarthMarkers(earthPlanet, selectedSceneY, zoomLevel, planetScaleFactor);
        addLagrangeL1DayArcMarkers(
            earthPlanet,
            selectedDateHeight,
            zoomLevel,
            planetScaleFactor,
            currentDateHeight,
            selectedDate
        );
    }

    if (
        isMoonLayerEffectiveAtZoom(zoomLevel) &&
        typeof MoonMechanics !== 'undefined' &&
        MoonMechanics.addPedagogicalMoon &&
        earthPlanet &&
        typeof THREE !== 'undefined'
    ) {
        const moonObjs = MoonMechanics.addPedagogicalMoon({
            THREE,
            earthPlanet,
            currentDateHeight,
            selectedDateHeight,
            selectedDate: getSelectedDateTime(),
            flatGroup,
            sceneContentGroup,
            zoomLevel,
            planetScaleFactor,
            isLightMode
        });
        moonObjs.forEach((o) => moonMechanicObjects.push(o));
    }

    moonWorldlines.forEach((mesh) => {
        flatGroup.remove(mesh);
    });
    moonWorldlines = [];
    if (isMoonWorldlineVisibleAtZoom(zoomLevel) && typeof Worldlines !== 'undefined' && Worldlines.createMoonWorldline) {
        const moonWorldline = Worldlines.createMoonWorldline(currentDateHeight, zoomLevel);
        if (moonWorldline) {
            flatGroup.add(moonWorldline);
            moonWorldlines.push(moonWorldline);
        }
    }

    // Circadian rhythm worldline (hour-hand helix): landing, month, week, day, clock — when not off.
    // Geometry morphs wrapped ↔ straight via currentCircadianStraightenAmount (updated in animate).
    if (isCircadianHelixZoom(zoomLevel) && typeof circadianState !== 'undefined' && circadianState !== 'off') {
        if (typeof CircadianRenderer !== 'undefined' && CircadianRenderer.createDayDiskOutlinesGroup) {
            const currentHeight = typeof selectedDateHeight !== 'undefined' && !isNaN(selectedDateHeight)
                ? selectedDateHeight
                : currentDateHeight;
            const spanDays = circadianSpanDaysForZoom(zoomLevel);
            const circLineOpts = typeof window.getCircadianHelixVisualStyle === 'function'
                ? window.getCircadianHelixVisualStyle()
                : {};
            const diskGroup = CircadianRenderer.createDayDiskOutlinesGroup(currentHeight, {
                spanDays,
                rimRadius: (typeof CircadianRenderer.getHandLength === 'function'
                    ? CircadianRenderer.getHandLength() * 1.08
                    : null),
                color: circLineOpts.helixColor != null ? circLineOpts.helixColor : 0xffaa44,
                opacity: circLineOpts.helixOpacity != null ? circLineOpts.helixOpacity : 0.82
            });
            if (diskGroup) {
                sceneContentGroup.add(diskGroup);
                circadianWorldlines.push(diskGroup);
            }
        }
    }

    // Timeseries-event arcs (e.g. Garmin HR/sleep) on day disks.
    // Sky zooms (0/8/9): HR + sleep. Month/week (5/7): selected-day sleep only (refreshGroup filters).
    if (shouldAttachTimeseriesArcGroup(zoomLevel) &&
        typeof TimeseriesRenderer !== 'undefined' && TimeseriesRenderer.hasData && TimeseriesRenderer.hasData()) {
        const tsGroup = TimeseriesRenderer.createGroup();
        if (tsGroup) {
            tsGroup.userData.spanDays = circadianSpanDaysForZoom(zoomLevel);
            sceneContentGroup.add(tsGroup);
            circadianWorldlines.push(tsGroup);
        }
    }

    if (isEarthDaylightSkyZoom(zoomLevel) &&
        typeof circadianState !== 'undefined' && circadianState !== 'off' &&
        typeof AtcBand !== 'undefined' && typeof AtcBand.createGuideGroup === 'function') {
        const currentHeight = typeof selectedDateHeight !== 'undefined' && !isNaN(selectedDateHeight)
            ? selectedDateHeight
            : currentDateHeight;
        const guideGroup = AtcBand.createGuideGroup(currentHeight, {});
        if (guideGroup) {
            sceneContentGroup.add(guideGroup);
            circadianWorldlines.push(guideGroup);
        }
    }

    // Create time markers for this zoom level.
    // Zoom 0 is a landing camera mode; keep day/clock markers visible so selected-time
    // context does not disappear when toggling between 9 and 0.
    createTimeMarkers(zoomLevel === 0 ? 9 : zoomLevel);

    updateSunEarthTimeRadials(zoomLevel);
    updateListHorizonEarthRing(zoomLevel);

    if (typeof updateCircadianHelixSpanHint === 'function') {
        updateCircadianHelixSpanHint();
    }

    if (typeof window !== 'undefined' && window.circaevumGL && typeof window.circaevumGL.refreshAllEventLayers === 'function') {
        try {
            // Event meshes live on GL groups (not torn down with planets). Skip rebuild when
            // zoom/day/style key unchanged — biggest thrash cut on time-scrub full createPlanets.
            refreshEventLayersIfNeeded(false);
            eventsRefreshedDuringCreatePlanets = true;
        } catch (err) { /* GL may be disposing */ }
    }
    try {
        updateParentUnitTemporalVeil(zoomLevel);
    } catch (err) { /* veil optional */ }
    try {
        syncEventHorizonCameraAfterSphere(zoomLevel);
    } catch (err) { /* optional */ }
    if (typeof window !== 'undefined' && window.circaevumGL) {
        try {
            if (isMoonWorldlineVisibleAtZoom(zoomLevel) && typeof window.circaevumGL.refreshMoonWorldline === 'function') {
                window.circaevumGL.refreshMoonWorldline(currentDateHeight, zoomLevel);
            } else if (typeof window.circaevumGL.clearMoonWorldline === 'function') {
                window.circaevumGL.clearMoonWorldline();
            }
        } catch (err) { /* GL may be disposing */ }
    }
    if (typeof window !== 'undefined' && typeof window.circaevumOnSelectedTimeOrViewChanged === 'function') {
        try {
            window.circaevumOnSelectedTimeOrViewChanged();
        } catch (err) { /* optional UI */ }
    }

    syncMoonLayerButton();
    syncOtherPlanetsButton();

    if (zoomLevel === 0) {
        syncZoom0CameraToSelectedHourHand('delta');
    }

    applyTourSceneOpacityOverrides();

    tourNarrativeShaderWorldlinesActive =
        typeof tourWorldlineRevealProgress === 'number' &&
        !isNaN(tourWorldlineRevealProgress) &&
        tourWorldlineRevealProgress >= 0 &&
        tourWorldlineRevealProgress <= 1 &&
        worldlines.some((w) => w && w.userData && w.userData.narrClipUniform);
}

// Get marker color based on light mode
function getMarkerColor() {
    return isLightMode ? 0x6b7280 : 0x9ca3af;
}

// Selected time: white on dark sky, black in light mode (not cyan).
function getSelectedTimeColor() {
    return isLightMode ? 0x000000 : 0xffffff;
}

// Get orbit line color - darker in light mode for better contrast
function getOrbitLineColor() {
    return isLightMode ? 0x0066CC : SCENE_CONFIG.orbitLineColor; // Darker blue in light mode
}

/**
 * Sun–Earth L1–L5 in the orbital plane at SELECTED TIME: co-rotating with Earth (same R, angle as Earth mesh).
 * L1–L3 collinear from Sun: L1 at (1−γ)R / L2 at (1+γ)R along Sun→Earth (γ=(μ/3)^(1/3)), so L1 lies between Sun and Earth;
 * L4/L5 at ±60° on the same circular orbit as Earth (equilateral CRTBP layout).
 */
function addLagrangeSunEarthMarkers(earthPlanet, selectedDateHeight, zoomLevel, planetScaleFactor) {
    const cfg = SCENE_CONFIG.lagrangeMarkers;
    if (!cfg || !earthPlanet || !sceneContentGroup || zoomLevel < 3) return;

    const R = earthPlanet.userData.distance;
    const ang = earthPlanet.userData.angle;
    const y = selectedDateHeight;
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);

    const earthRadius =
        earthPlanet.geometry && earthPlanet.geometry.parameters && earthPlanet.geometry.parameters.radius != null
            ? earthPlanet.geometry.parameters.radius
            : (typeof PLANET_DATA !== 'undefined'
                ? (PLANET_DATA.find((p) => p.name === 'Earth') || { size: 6.5 }).size * planetScaleFactor
                : 6.5 * planetScaleFactor);

    const μ = cfg.earthToSunMassRatio;
    const γ = Math.pow(μ / 3, 1 / 3);
    const l1Along = 1 - γ;
    const l2Along = 1 + γ;
    const l3Along = -(1 + (5 * μ) / 12);

    const fr = cfg.markerRadiusEarthFraction;
    const rSphere = earthRadius * (typeof fr === 'number' ? fr : 0.072);
    const radialOff = earthRadius * (cfg.labelRadialOffsetEarthMult ?? 2.1);

    const collinearColor = cfg.colors.collinear;
    const triangularColor = cfg.colors.triangular;
    const mMin = cfg.labelSpriteEarthMultMin ?? 0.55;
    const mMax = cfg.labelSpriteEarthMultMax ?? 1.15;
    const zoomT = Math.max(0, Math.min(1, (zoomLevel - 3) / 6));
    const labelEarthMult = mMax - zoomT * (mMax - mMin);

    /**
     * @param {'lineIn'|'lineOut'|'tangent'} labelAlong
     *   lineIn = toward Sun along Sun→point; lineOut = away from Sun (L2/L3 labels past the point).
     *   tangent = side offset in orbit plane for L4/L5 only.
     * @param tangentSign ±1 when labelAlong === 'tangent'
     */
    function placeLagrangePoint(px, pz, color, label, labelAlong, tangentSign = 1) {
        const geo = new THREE.SphereGeometry(rSphere, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.25,
            roughness: 0.55,
            emissive: color,
            emissiveIntensity: 0.12,
            transparent: true,
            opacity: 0.9
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(px, y, pz);
        mesh.userData = { type: 'LagrangeMarker', label };
        sceneContentGroup.add(mesh);
        lagrangeMarkerObjects.push(mesh);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const cw = 80;
        const ch = 30;
        canvas.width = cw;
        canvas.height = ch;
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillStyle = isLightMode ? 'rgba(25,45,70,0.95)' : 'rgba(220,235,255,0.95)';
        ctx.strokeStyle = isLightMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.35;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(label, cw / 2, ch / 2);
        ctx.fillText(label, cw / 2, ch / 2);
        const tex = new THREE.CanvasTexture(canvas);
        const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const sp = new THREE.Sprite(sm);
        const hr = Math.hypot(px, pz) || 1;
        const rx = px / hr;
        const rz = pz / hr;
        let lx = px;
        let lz = pz;
        if (labelAlong === 'lineIn') {
            lx = px - rx * radialOff;
            lz = pz - rz * radialOff;
        } else if (labelAlong === 'lineOut') {
            lx = px + rx * radialOff;
            lz = pz + rz * radialOff;
        } else {
            const tx = (-pz / hr) * tangentSign;
            const tz = (px / hr) * tangentSign;
            lx = px + tx * radialOff;
            lz = pz + tz * radialOff;
        }
        sp.position.set(lx, y, lz);
        const sc = earthRadius * labelEarthMult;
        sp.scale.set(sc * (cw / ch), sc, 1);
        sp.userData.baseScale = { x: sc * (cw / ch), y: sc, z: 1 };
        sp.renderOrder = 2;
        sceneContentGroup.add(sp);
        lagrangeMarkerObjects.push(sp);
    }

    // L1/L2 lie on Sun–Earth line (toward/away from Sun); labels sit on that same line, not to the sides.
    placeLagrangePoint(ux * R * l1Along, uz * R * l1Along, collinearColor, 'L1', 'lineIn');
    placeLagrangePoint(ux * R * l2Along, uz * R * l2Along, collinearColor, 'L2', 'lineOut');
    placeLagrangePoint(ux * R * l3Along, uz * R * l3Along, collinearColor, 'L3', 'lineOut');
    placeLagrangePoint(R * Math.cos(ang + Math.PI / 3), R * Math.sin(ang + Math.PI / 3), triangularColor, 'L4', 'tangent', 1);
    placeLagrangePoint(R * Math.cos(ang - Math.PI / 3), R * Math.sin(ang - Math.PI / 3), triangularColor, 'L5', 'tangent', -1);
}

function shouldShowLagrangeL1DayArc(zoomLevel) {
    return false;
}

function lagrangeL1WrapAnglePi(a) {
    let x = a;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
}

function lagrangeL1AbsAngleDelta(a, b) {
    return Math.abs(lagrangeL1WrapAnglePi(a - b));
}

function lagrangeL1SetMouseRayFromThreeRay(ray) {
    if (!ray || !ray.origin || !ray.direction) {
        lagrangeL1MouseRay.has = false;
        return;
    }
    lagrangeL1MouseRay.ox = ray.origin.x;
    lagrangeL1MouseRay.oy = ray.origin.y;
    lagrangeL1MouseRay.oz = ray.origin.z;
    lagrangeL1MouseRay.dx = ray.direction.x;
    lagrangeL1MouseRay.dy = ray.direction.y;
    lagrangeL1MouseRay.dz = ray.direction.z;
    lagrangeL1MouseRay.has = true;
}

function lagrangeL1DistanceRayToPoint(px, py, pz) {
    if (!lagrangeL1MouseRay.has) return 1e12;
    const { ox, oy, oz, dx, dy, dz } = lagrangeL1MouseRay;
    const vx = px - ox;
    const vy = py - oy;
    const vz = pz - oz;
    let t = vx * dx + vy * dy + vz * dz;
    if (t < 0) t = 0;
    const cx = ox + t * dx;
    const cy = oy + t * dy;
    const cz = oz + t * dz;
    const ex = px - cx;
    const ey = py - cy;
    const ez = pz - cz;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

function getTimelineFlattenParentGroup() {
    return timeMarkersGroup || flattenableGroup || sceneContentGroup;
}

function getActiveTimelineFlattenAmount() {
    const a = typeof currentFlattenAmount === 'number' && !isNaN(currentFlattenAmount) ? currentFlattenAmount : 0;
    const m =
        typeof currentTimeMarkerFlattenAmount === 'number' && !isNaN(currentTimeMarkerFlattenAmount)
            ? currentTimeMarkerFlattenAmount
            : 0;
    return Math.max(a, m);
}

function resetLagrangeL1DayDotScales() {
    const yScale = Math.max(0.001, 1 - getActiveTimelineFlattenAmount());
    for (let i = 0; i < lagrangeL1DayArcObjects.length; i++) {
        const m = lagrangeL1DayArcObjects[i];
        if (!m || !m.scale) continue;
        const base = m.userData && typeof m.userData.pickScaleMul === 'number' ? m.userData.pickScaleMul : 1;
        m.scale.set(base, base / yScale, base);
    }
}

function refreshLagrangeL1DayDotPickScales() {
    const arcCfg = SCENE_CONFIG.lagrangeMarkers && SCENE_CONFIG.lagrangeMarkers.l1DayArc;
    if (!arcCfg || !lagrangeL1MouseRay.has || !lagrangeL1DayArcObjects.length) return;
    const falloff = arcCfg.pickProximityFalloff != null ? arcCfg.pickProximityFalloff : 26;
    const maxBoost = arcCfg.pickScaleMaxMul != null ? arcCfg.pickScaleMaxMul : 4.2;
    for (let i = 0; i < lagrangeL1DayArcObjects.length; i++) {
        const mesh = lagrangeL1DayArcObjects[i];
        if (!mesh || !mesh.position) continue;
        const p = mesh.position;
        const d = lagrangeL1DistanceRayToPoint(p.x, p.y, p.z);
        const u = Math.max(0, Math.min(1, 1 - d / falloff));
        const s = 1 + u * u * (maxBoost - 1);
        mesh.userData.pickScaleMul = s;
        const yScale = Math.max(0.001, 1 - getActiveTimelineFlattenAmount());
        mesh.scale.set(s, s / yScale, s);
    }
}

function lagrangeL1EnsurePickScratch() {
    if (typeof THREE === 'undefined') return;
    if (!lagrangeL1NdcScratch) lagrangeL1NdcScratch = new THREE.Vector2();
    if (!lagrangeL1SharedPickRaycaster) lagrangeL1SharedPickRaycaster = new THREE.Raycaster();
}

/**
 * @returns {THREE.Mesh|null}
 */
function lagrangeL1ResolveDotMeshUnderClient(clientX, clientY) {
    if (!renderer || !camera || !sceneContentGroup || typeof THREE === 'undefined') return null;
    if (!shouldShowLagrangeL1DayArc(currentZoom) || !lagrangeL1DayArcObjects.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    lagrangeL1EnsurePickScratch();
    const arcCfg = SCENE_CONFIG.lagrangeMarkers && SCENE_CONFIG.lagrangeMarkers.l1DayArc;
    const maxRatio = arcCfg && arcCfg.pickMissMaxRayRadiusRatio != null ? arcCfg.pickMissMaxRayRadiusRatio : 1.42;

    lagrangeL1NdcScratch.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    lagrangeL1NdcScratch.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    lagrangeL1SharedPickRaycaster.setFromCamera(lagrangeL1NdcScratch, camera);
    lagrangeL1SetMouseRayFromThreeRay(lagrangeL1SharedPickRaycaster.ray);
    refreshLagrangeL1DayDotPickScales();

    const hits = lagrangeL1SharedPickRaycaster.intersectObjects(lagrangeL1DayArcObjects, false);
    if (hits.length) return hits[0].object;

    let best = null;
    let bestRatio = 1e12;
    for (let i = 0; i < lagrangeL1DayArcObjects.length; i++) {
        const mesh = lagrangeL1DayArcObjects[i];
        if (!mesh || !mesh.position) continue;
        const p = mesh.position;
        const d = lagrangeL1DistanceRayToPoint(p.x, p.y, p.z);
        let r = 1;
        if (mesh.geometry && mesh.geometry.parameters && typeof mesh.geometry.parameters.radius === 'number') {
            r = mesh.geometry.parameters.radius * (mesh.scale && mesh.scale.x != null ? mesh.scale.x : 1);
        }
        r = Math.max(0.08, r);
        const ratio = d / r;
        if (ratio < bestRatio) {
            bestRatio = ratio;
            best = mesh;
        }
    }
    if (best && bestRatio <= maxRatio) return best;
    return null;
}

/**
 * Ray-pick a Lagrange L1 day dot and smoothly navigate SELECTED TIME to that calendar day (keeps clock).
 * @returns {boolean} true if a dot was hit and navigation started.
 */
function tryPickLagrangeL1DayNavigate(clientX, clientY) {
    const hitMesh = lagrangeL1ResolveDotMeshUnderClient(clientX, clientY);
    if (!hitMesh) return false;
    const ud = hitMesh.userData;
    if (!ud || ud.type !== 'LagrangeL1DayDot' || ud.anchorDateMs == null) return false;
    const t = new Date(ud.anchorDateMs);
    if (isNaN(t.getTime())) return false;
    const sel = getSelectedDateTime();
    const next = new Date(
        t.getFullYear(),
        t.getMonth(),
        t.getDate(),
        sel.getHours(),
        sel.getMinutes(),
        sel.getSeconds(),
        sel.getMilliseconds()
    );
    const arcCfg = SCENE_CONFIG.lagrangeMarkers && SCENE_CONFIG.lagrangeMarkers.l1DayArc;
    const dur = arcCfg && arcCfg.navigateDurationMs != null ? arcCfg.navigateDurationMs : 1180;
    if (typeof smoothNavigateToTime === 'function') {
        smoothNavigateToTime(next, dur, false);
    } else {
        setSelectedDateTime(next);
    }
    return true;
}

function disposeLagrangeL1DayArcSceneObjects() {
    lagrangeL1DayArcObjects.forEach((obj) => {
        if (obj && obj.parent) obj.parent.remove(obj);
        if (obj && obj.geometry) obj.geometry.dispose();
        if (obj && obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m && m.dispose && m.dispose());
            else if (obj.material.dispose) obj.material.dispose();
        }
    });
    lagrangeL1DayArcObjects.length = 0;
    lagrangeL1DayHoverTargetMesh = null;
    lagrangeL1MouseRay.has = false;
    if (lagrangeL1DayHoverConnector) {
        if (lagrangeL1DayHoverConnector.parent) lagrangeL1DayHoverConnector.parent.remove(lagrangeL1DayHoverConnector);
        if (lagrangeL1DayHoverConnector.geometry) lagrangeL1DayHoverConnector.geometry.dispose();
        if (lagrangeL1DayHoverConnector.material) lagrangeL1DayHoverConnector.material.dispose();
        lagrangeL1DayHoverConnector = null;
    }
}

function ensureLagrangeL1DayHoverConnector() {
    if (lagrangeL1DayHoverConnector || typeof THREE === 'undefined' || !sceneContentGroup) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const arcCfg = SCENE_CONFIG.lagrangeMarkers && SCENE_CONFIG.lagrangeMarkers.l1DayArc;
    const mat = new THREE.LineBasicMaterial({
        color: getSelectedTimeColor(),
        transparent: true,
        opacity: arcCfg && arcCfg.connectorOpacity != null ? arcCfg.connectorOpacity : 0.55,
        depthWrite: false
    });
    const line = new THREE.Line(geom, mat);
    line.visible = false;
    line.frustumCulled = false;
    line.renderOrder = 12;
    line.userData = { type: 'LagrangeL1DayHoverConnector' };
    sceneContentGroup.add(line);
    lagrangeL1DayHoverConnector = line;
}

function updateLagrangeL1DayHoverConnectorGeometry() {
    if (!lagrangeL1DayHoverTargetMesh) {
        if (lagrangeL1DayHoverConnector) lagrangeL1DayHoverConnector.visible = false;
        return;
    }
    ensureLagrangeL1DayHoverConnector();
    const ud = lagrangeL1DayHoverTargetMesh.userData;
    const anchor = ud && ud.anchorDateMs != null ? new Date(ud.anchorDateMs) : null;
    if (!lagrangeL1DayHoverConnector || !anchor || isNaN(anchor.getTime())) {
        if (lagrangeL1DayHoverConnector) lagrangeL1DayHoverConnector.visible = false;
        return;
    }
    const CR = typeof CircadianRenderer !== 'undefined' ? CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') {
        lagrangeL1DayHoverConnector.visible = false;
        return;
    }
    const sd = getSelectedDateTime();
    const ch = calculateDateHeight(sd.getFullYear(), sd.getMonth(), sd.getDate(), sd.getHours());
    const blend =
        typeof currentCircadianStraightenAmount === 'number' && !isNaN(currentCircadianStraightenAmount)
            ? currentCircadianStraightenAmount
            : 0;
    const rimR =
        typeof CR.getHandLength === 'function'
            ? CR.getHandLength() * 1.08
            : (typeof PLANET_DATA !== 'undefined'
                ? (PLANET_DATA.find((p) => p.name === 'Earth') || { distance: 50 }).distance * 0.1 * 0.9 * 1.08
                : 5);
    const stackPt = CR.blendedDiskPointAtDate(anchor, rimR, ch, calculateDateHeight, blend);
    if (!stackPt) {
        lagrangeL1DayHoverConnector.visible = false;
        return;
    }
    const ax = lagrangeL1DayHoverTargetMesh.position.x;
    const ay = lagrangeL1DayHoverTargetMesh.position.y;
    const az = lagrangeL1DayHoverTargetMesh.position.z;
    const ex = stackPt.x;
    const ey = ay;
    const ez = stackPt.z;
    const pos = lagrangeL1DayHoverConnector.geometry.attributes.position;
    if (pos && pos.array) {
        pos.array[0] = ax;
        pos.array[1] = ay;
        pos.array[2] = az;
        pos.array[3] = ex;
        pos.array[4] = ey;
        pos.array[5] = ez;
        pos.needsUpdate = true;
    }
    lagrangeL1DayHoverConnector.geometry.computeBoundingSphere();
    lagrangeL1DayHoverConnector.visible = true;
    if (lagrangeL1DayHoverConnector.material && lagrangeL1DayHoverConnector.material.color) {
        lagrangeL1DayHoverConnector.material.color.setHex(getSelectedTimeColor());
    }
}

/**
 * One clickable dot per calendar day in the Sun–L4–L5 sector through Earth (~120°, ~⅓ year): sunward along
 * that day’s Sun→Earth line at a pedagogical radius. Orbit angle uses **local noon** on each day so dots sit
 * between midnight day-marker radials; Y uses the same noon height. **White** = other days; **blue** = SELECTED
 * calendar day (same as selected-time styling). Click selects that calendar day while preserving SELECTED wall clock.
 */
function addLagrangeL1DayArcMarkers(earthPlanet, selectedDateHeight, zoomLevel, planetScaleFactor, currentDateHeight, selectedDate) {
    const rootCfg = SCENE_CONFIG.lagrangeMarkers;
    const arcCfg = rootCfg && rootCfg.l1DayArc;
    if (!shouldShowLagrangeL1DayArc(zoomLevel) || !earthPlanet || !sceneContentGroup || !rootCfg || !arcCfg) return;

    const earthData = typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p.name === 'Earth') : null;
    if (!earthData || typeof calculateDateHeight !== 'function' || typeof getPlanetXZAtSelectedDate !== 'function') return;

    const earthRadius =
        earthPlanet.geometry && earthPlanet.geometry.parameters && earthPlanet.geometry.parameters.radius != null
            ? earthPlanet.geometry.parameters.radius
            : (typeof earthData.size === 'number' ? earthData.size : 6.5) * planetScaleFactor;

    const fr = rootCfg.markerRadiusEarthFraction;
    const rMarker = earthRadius * (typeof fr === 'number' ? fr : 0.072);
    const rDot = rMarker * (arcCfg.dotRadiusMul != null ? arcCfg.dotRadiusMul : 0.42);

    const selPos = getPlanetXZAtSelectedDate(earthData, selectedDate, currentDateHeight, selectedDateHeight);
    const angSel = Math.atan2(selPos.z, selPos.x);
    const halfSector = Math.PI / 3;

    const scan = Math.max(40, Math.min(160, arcCfg.daySearchRadius != null ? arcCfg.daySearchRadius : 95));
    const ySel = selectedDate.getFullYear();
    const mSel = selectedDate.getMonth();
    const dSel = selectedDate.getDate();
    const hh = selectedDate.getHours();
    const mm = selectedDate.getMinutes();
    const ss = selectedDate.getSeconds();
    const mss = selectedDate.getMilliseconds();

    const colSelected = getSelectedTimeColor();
    /** Near-white in light mode (readable on pale UI); pure white in dark. */
    const colUnselected = isLightMode ? 0xe8eef7 : 0xffffff;

    for (let k = -scan; k <= scan; k++) {
        /** Calendar day at SELECTED wall clock — used for picks + navigation. */
        const dAnchor = new Date(ySel, mSel, dSel + k, hh, mm, ss, mss);
        /** Local noon on that calendar day — orbit XZ sits between midnight day-marker radials (day “center”). */
        const dNoon = new Date(ySel, mSel, dSel + k, 12, 0, 0, 0);
        const hNoon = calculateDateHeight(
            dNoon.getFullYear(),
            dNoon.getMonth(),
            dNoon.getDate(),
            12
        );
        if (hNoon == null || isNaN(hNoon)) continue;

        const xz = getPlanetXZAtSelectedDate(earthData, dNoon, currentDateHeight, hNoon);
        const ang = Math.atan2(xz.z, xz.x);
        if (lagrangeL1AbsAngleDelta(ang, angSel) > halfSector + 1e-7) continue;

        const earthDist = Math.hypot(xz.x, xz.z) || 1e-6;
        const ux = xz.x / earthDist;
        const uz = xz.z / earthDist;
        // Prefer live day-frame sphere ring (just outside inner curve); else config fallback.
        let radial = null;
        if (
            typeof TimeMarkers !== 'undefined' &&
            typeof TimeMarkers.getCanonicalRadialZones === 'function'
        ) {
            try {
                const zones = TimeMarkers.getCanonicalRadialZones(earthDist);
                if (zones && zones.day && typeof zones.day.sphere === 'number' && zones.day.sphere > 0) {
                    radial = zones.day.sphere;
                } else if (
                    zones &&
                    zones.day &&
                    typeof zones.day.inner === 'number' &&
                    typeof zones.day.outer === 'number'
                ) {
                    radial = zones.day.inner + (zones.day.outer - zones.day.inner) * 0.05;
                }
            } catch (e) { /* fall through */ }
        }
        if (!(radial > 0)) {
            const frac = arcCfg.radialFractionFromSun != null ? arcCfg.radialFractionFromSun : 0.64;
            const clearance = (arcCfg.clearanceEarthRadii != null ? arcCfg.clearanceEarthRadii : 2.85) * earthRadius;
            const sunwardCap = Math.max(earthDist * 0.1, earthDist - clearance);
            radial = Math.min(frac * earthDist, sunwardCap);
        }
        const px = ux * radial;
        const pz = uz * radial;
        const py = getFlattenedSceneY(hNoon);

        const isSelectedDay =
            dAnchor.getFullYear() === selectedDate.getFullYear() &&
            dAnchor.getMonth() === selectedDate.getMonth() &&
            dAnchor.getDate() === selectedDate.getDate();
        const col = isSelectedDay ? colSelected : colUnselected;

        const geo = new THREE.SphereGeometry(rDot, 12, 12);
        const mat = new THREE.MeshStandardMaterial({
            color: col,
            metalness: 0.2,
            roughness: 0.5,
            emissive: col,
            emissiveIntensity: isSelectedDay ? 0.32 : 0.14,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(px, py, pz);
        mesh.userData = {
            type: 'LagrangeL1DayDot',
            anchorDateMs: dAnchor.getTime(),
            sceneHeight: hNoon,
            pickScaleMul: 1
        };
        const yScale = Math.max(0.05, 1 - getActiveTimelineFlattenAmount() * 0.95);
        mesh.scale.set(1, 1 / yScale, 1);
        mesh.renderOrder = 8;
        const dayDotParent = getTimelineFlattenParentGroup();
        if (dayDotParent) dayDotParent.add(mesh);
        lagrangeL1DayArcObjects.push(mesh);
    }
}

// Create 3D text label (using sprites for simplicity)
// Note: This function is still needed as it's passed to TimeMarkers module
// isLarge: if true, taller canvas and larger base font (year headline labels)
// sizeMultiplier: optional multiplier for text size (e.g., 0.5 for half size)
// colorType: 'red' for current time, 'blue' for selected time, false/undefined for default
function createTextLabel(
    text,
    height,
    radius,
    zoomLevel,
    angle = 0,
    colorType = false,
    isLarge = false,
    sizeMultiplier = 1.0,
    tourRevealTier = undefined
) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const canvasHeight = isLarge ? 256 : 128;
    const padding = isLarge ? 40 : 28;
    const minWidth = isLarge ? 160 : 96;

    // Use color based on colorType: 'red' for current time, 'blue' for selected time, false for default
    let textColor;
    if (colorType === true || colorType === 'red') {
        textColor = 'rgba(255, 0, 0, 0.9)'; // Red for current time
    } else if (colorType === 'blue') {
        textColor = isLightMode ? 'rgba(0, 0, 0, 0.92)' : 'rgba(255, 255, 255, 0.95)';
    } else {
        textColor = isLightMode ? 'rgba(107, 114, 128, 0.92)' : 'rgba(156, 163, 175, 0.92)'; // Unselected
    }

    const baseFontSize = isLarge ? 80 : 60;
    const fontSize = baseFontSize * sizeMultiplier;
    context.font = `bold ${fontSize}px Orbitron`;
    const metrics = context.measureText(text);
    const canvasWidth = Math.max(minWidth, Math.ceil(metrics.width + padding * 2));

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    context.fillStyle = textColor;
    context.font = `bold ${fontSize}px Orbitron`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvasWidth / 2, canvasHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        alphaTest: 0.04
    });
    if (typeof CircaevumWebGPUPipeline !== 'undefined' && typeof CircaevumWebGPUPipeline.applyGPUBillboardToMaterial === 'function') {
        CircaevumWebGPUPipeline.applyGPUBillboardToMaterial(spriteMaterial);
    }

    const sprite = new THREE.Sprite(spriteMaterial);
    // Above event ribbons (see EventRenderer duration renderOrder cap) so calendar labels stay readable
    sprite.renderOrder = 50;
    let finalY = height;
    const amt = typeof currentFlattenAmount === 'number' ? currentFlattenAmount : 0;
    if (amt > 0.001) {
        const focusY = typeof flattenTimelineFocusY === 'function' ? flattenTimelineFocusY() : (typeof focusPoint !== 'undefined' && focusPoint ? focusPoint.y : 0);
        finalY = typeof flattenTimelineLogicalY === 'function' ? flattenTimelineLogicalY(height, focusY, amt) : height;
    }
    sprite.position.set(Math.cos(angle) * radius, finalY, Math.sin(angle) * radius);

    // Scale based on zoom level - larger for zoomed out views, smaller for zoomed in
    let scale;
    if (zoomLevel === 1) {
        scale = 1100; // Century - extra reduced
    } else if (zoomLevel === 2) {
        scale = 150; // Decade - reduced
    } else if (zoomLevel === 3) {
        scale = 30; // Year - reduced
    } else if (zoomLevel === 4) {
        scale = 42; // Quarter - slightly reduced
    } else if (zoomLevel === 5) {
        scale = 16.5; // Month - half size (was 33)
    } else if (zoomLevel === 6) {
        scale = 15; // Lunar - much smaller (was 60)
    } else if (zoomLevel === 7) {
        scale = isLarge ? 15 : 5; // Week - much larger for month label
    } else {
        scale = 6; // Day
    }

    const looksLikeYear = /^\d{4}$/.test(String(text));
    if (looksLikeYear) {
        const dist =
            typeof currentCameraDistance === 'number' && currentCameraDistance > 0
                ? currentCameraDistance
                : (typeof ZOOM_LEVELS !== 'undefined' && ZOOM_LEVELS[zoomLevel] && ZOOM_LEVELS[zoomLevel].distance) || 140;
        const sy = Math.max(5, dist * 0.07);
        const aspect = canvasWidth / canvasHeight;
        sprite.scale.set(sy * aspect, sy, 1);
        sprite.userData.baseScale = { x: sy * aspect, y: sy, z: 1 };
        sprite.userData.scaleWithCameraDistance = 0.07;
    } else {
        scale = scale * sizeMultiplier;
        const scaleY = scale * 0.25;
        const scaleX = scaleY * (canvasWidth / canvasHeight);
        sprite.scale.set(scaleX, scaleY, 1);
        sprite.userData.baseScale = { x: scaleX, y: scaleY, z: 1 };
    }
    if (tourRevealTier != null && typeof tourRevealTier === 'number') {
        sprite.userData.circaevumTourRevealTier = tourRevealTier;
    }

    (timeMarkersGroup || flattenableGroup || sceneContentGroup).add(sprite);
    timeMarkers.push(sprite);
}

// Initialize TimeMarkers module once
let timeMarkersInitialized = false;
function initTimeMarkers() {
    if (!timeMarkersInitialized && typeof TimeMarkers !== 'undefined') {
        // Initialize Worldlines first (needed by TimeMarkers)
        if (typeof Worldlines !== 'undefined' && typeof Worldlines.init === 'function') {
            Worldlines.init({
                scene: sceneContentGroup,
                PLANET_DATA,
                ZOOM_LEVELS,
                SCENE_CONFIG,
                calculateDateHeight,
                getHeightForYear,
                calculateCurrentDateHeight,
                CENTURY_START,
                currentYear,
                isLightMode,
                getSelectedTimeColor,
                SceneGeometry: typeof SceneGeometry !== 'undefined' ? SceneGeometry : null,
                calculateActualCurrentDateHeight: typeof calculateActualCurrentDateHeight !== 'undefined' ? calculateActualCurrentDateHeight : null,
                calculateYearProgressForDate: typeof calculateYearProgressForDate !== 'undefined' ? calculateYearProgressForDate : null,
                getDaysInMonth: typeof getDaysInMonth !== 'undefined' ? getDaysInMonth : null,
                isLeapYear: typeof isLeapYear !== 'undefined' ? isLeapYear : null,
                getSelectedDateTime: typeof getSelectedDateTime === 'function' ? getSelectedDateTime : null
            });
        }
        
        TimeMarkers.init({
            scene: timeMarkersGroup || flattenableGroup || sceneContentGroup,
            timeMarkers,
            getMarkerColor,
            createTextLabel,
            PLANET_DATA,
            ZOOM_LEVELS,
            TIME_MARKERS,
            CENTURY_START,
            currentYear,
            currentMonthInYear,
            currentMonth,
            currentQuarter,
            currentWeekInMonth,
            currentDayInWeek,
            currentDayOfMonth,
            currentHourInDay,
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            selectedHourOffset,
            selectedLunarOffset,
            selectedDecadeOffset,
            isLightMode,
            calculateDateHeight,
            getHeightForYear,
            calculateCurrentDateHeight,
            planetMeshes,
            SceneGeometry: typeof SceneGeometry !== 'undefined' ? SceneGeometry : null,
            getListContextDiscArcTimeBoundsMs: getListContextDiscArcTimeBoundsMs
        });
        timeMarkersInitialized = true;
    }
}

/**
 * Optional: hide time markers that do not intersect Event Horizon ball.
 * Default off — LTE chrome lives *outside* the sphere (invert fragment clip).
 * Toggle: `window.setClipTimeMarkersToContextSphere(true)`.
 */
let clipTimeMarkersToContextSphere = false;

function createTimeMarkers(zoomLevel) {
    // Initialize TimeMarkers if not already done
    initTimeMarkers();
    
    // Delegate to TimeMarkers module if available, otherwise fall back to old code
    if (typeof TimeMarkers !== 'undefined' && TimeMarkers.createTimeMarkers) {
        // CRITICAL: Update offset values before recreating markers
        // These are captured by value in TimeMarkers.init(), so we need to update them
        if (typeof TimeMarkers.updateOffsets === 'function') {
            TimeMarkers.updateOffsets({
                selectedYearOffset,
                selectedQuarterOffset,
                selectedWeekOffset,
                selectedDayOffset,
                selectedHourOffset,
                selectedLunarOffset, // Needed for Zoom 6 lunar calculation
                currentYear, // Needed for Zoom 1 and 2 year highlighting
                currentMonthInYear,
                currentMonth,
                currentWeekInMonth, // Needed for Zoom 5 and 6 week calculation
                currentQuarter, // Needed for Zoom 3 quarter navigation
                currentDayInWeek, // Needed for Zoom 7 day calculation
                currentDayOfMonth,
                currentHourInDay // Needed for Zoom 8/9 hour calculation
            });
        }
        // Full-year toggle now only controls whether day markers span the entire year.
        const options = {};
        if (showFullYearTimeMarkers) options.fullYearScope = true;
        if (tourHideAllTimeMarkers) {
            options.tourHideAll = true;
            TimeMarkers.createTimeMarkers(zoomLevel, options);
            applyTimeMarkerVisibility();
            if (typeof refreshContextSphereVisualClip === 'function') refreshContextSphereVisualClip();
            return;
        }
        if (tourOrbitMarkersFromCalendar) {
            options.tourYearMarkerStaged = true;
            const selProg = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : null;
            if (selProg instanceof Date && !isNaN(selProg.getTime())) {
                options.tourProgressiveMarkerDateMs = selProg.getTime();
                if (tourMarkerDensityOverride) {
                    options.tourMarkerDensity = tourMarkerDensityOverride;
                } else {
                    const m = selProg.getMonth();
                    if (m < 3) options.tourMarkerDensity = 'quarters';
                    else if (m < 6) options.tourMarkerDensity = 'months';
                    else if (m < 9) options.tourMarkerDensity = 'weeks';
                    else options.tourMarkerDensity = 'days';
                }
            }
        } else if (tourMinimalOrbitMode && zoomLevel === 3) {
            options.tourYearMarkerStaged = true;
            const selProg = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : null;
            if (selProg instanceof Date && !isNaN(selProg.getTime())) {
                options.tourProgressiveMarkerDateMs = selProg.getTime();
            }
        }
        TimeMarkers.createTimeMarkers(zoomLevel, Object.keys(options).length ? options : undefined);
        applyTimeMarkerVisibility();
        if (typeof ContextSphereWarp !== 'undefined' && ContextSphereWarp.syncCameraInsideFlag) {
            try {
                ContextSphereWarp.syncCameraInsideFlag(camera, contextSphereState);
            } catch (e) { /* optional */ }
        }
        if (
            typeof TimeMarkers !== 'undefined' &&
            typeof TimeMarkers.applyLteDayFrameEventHorizonWarp === 'function'
        ) {
            try {
                TimeMarkers.applyLteDayFrameEventHorizonWarp();
            } catch (e2) { /* optional */ }
        }
        if (typeof refreshContextSphereVisualClip === 'function') refreshContextSphereVisualClip();
        return;
    }
    // If TimeMarkers module is not available, log a warning
    console.warn('TimeMarkers module not available');
}

function timeMarkerIntersectsContextSphere(marker, sphere) {
    if (!marker || !sphere || !(sphere.radius > 0)) return true;
    if (typeof THREE === 'undefined') return true;
    const cx = sphere.x;
    const cy = sphere.y;
    const cz = sphere.z;
    const R2 = sphere.radius * sphere.radius * 1.06; // slight pad so rim markers stay
    const v = new THREE.Vector3();

    function pointInside(x, y, z) {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        return dx * dx + dy * dy + dz * dz <= R2;
    }

    if (marker.isSprite || marker.type === 'Sprite') {
        marker.getWorldPosition(v);
        return pointInside(v.x, v.y, v.z);
    }

    const geom = marker.geometry;
    const pos = geom && geom.attributes && geom.attributes.position;
    if (pos && pos.count > 0) {
        marker.updateMatrixWorld(true);
        const n = pos.count;
        const step = Math.max(1, Math.floor(n / 32));
        for (let i = 0; i < n; i += step) {
            v.fromBufferAttribute(pos, i);
            marker.localToWorld(v);
            if (pointInside(v.x, v.y, v.z)) return true;
        }
        v.fromBufferAttribute(pos, n - 1);
        marker.localToWorld(v);
        return pointInside(v.x, v.y, v.z);
    }

    if (marker.children && marker.children.length) {
        for (let i = 0; i < marker.children.length; i++) {
            if (timeMarkerIntersectsContextSphere(marker.children[i], sphere)) return true;
        }
        return false;
    }

    marker.getWorldPosition(v);
    return pointInside(v.x, v.y, v.z);
}

function applyTimeMarkerVisibility() {
    const tierCap = tourYearMarkerReveal;
    const sphere =
        clipTimeMarkersToContextSphere && typeof contextSphereState === 'object' ? contextSphereState : null;
    timeMarkers.forEach((marker) => {
        const isText = marker.type === 'Sprite';
        const tr = marker.userData && marker.userData.circaevumTourRevealTier;
        const tierOk =
            tierCap == null || tr === undefined || (typeof tr === 'number' && typeof tierCap === 'number' && tr <= tierCap);
        let vis = isText ? showTimeMarkerText && tierOk : showTimeMarkerLines && tierOk;
        if (vis && sphere) {
            vis = timeMarkerIntersectsContextSphere(marker, sphere);
        }
        marker.visible = vis;
    });
}

if (typeof window !== 'undefined') {
    window.getClipTimeMarkersToContextSphere = function () {
        return !!clipTimeMarkersToContextSphere;
    };
    window.setClipTimeMarkersToContextSphere = function (on) {
        clipTimeMarkersToContextSphere = !!on;
        if (typeof applyTimeMarkerVisibility === 'function') applyTimeMarkerVisibility();
        return clipTimeMarkersToContextSphere;
    };
}

// Helper function to create faint context markers for adjacent time periods
// Sun-centered marker ticks (Century, Decade, Year)
// Year view - radial lines from Sun to Earth's orbital path for each month
// Quarter view - radial lines from Sun to Earth's orbital path for each month
// Year view (Zoom 3) - create markers for all 4 quarters and all 12 months of the year
// Month view - radial lines for each week
// Week view - daily radial markers
function initControls() {
    const pickRaycaster = new THREE.Raycaster();
    if (pickRaycaster.params) {
        pickRaycaster.params.Line = { threshold: 10 };
        pickRaycaster.params.LineSegments = { threshold: 10 };
        pickRaycaster.params.Points = { threshold: 8 };
    }
    const pickPointer = new THREE.Vector2();
    let dragStartPos = null;

    function tryPickMoonPhaseMarker(clientX, clientY) {
        if (!renderer || !camera || !sceneContentGroup || typeof THREE === 'undefined') return false;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        pickRaycaster.setFromCamera(pickPointer, camera);
        const hits = pickRaycaster.intersectObjects(sceneContentGroup.children, true);
        if (!hits.length) return false;

        for (let hi = 0; hi < hits.length; hi++) {
            let o = hits[hi].object;
            while (o) {
                const ud = o.userData;
                if (ud && ud.type === 'MoonPhaseMarker') {
                    const ms = ud.navigateTimeMs != null ? ud.navigateTimeMs : ud.artemisNavigateTimeMs;
                    if (ms != null && !isNaN(ms)) {
                        smoothNavigateToTime(new Date(ms));
                        return true;
                    }
                }
                o = o.parent;
            }
        }
        return false;
    }

    function finishEventPickFromVevent(ve, layerId, options) {
        if (!ve) return false;
        let startRaw = ve.start || ve.startTime || ve.date || ve.dtstart?.dateTime || ve.dtstart?.date || null;
        let endRaw = ve.end || ve.endTime || ve.dtend?.dateTime || ve.dtend?.date || null;
        if (!startRaw && typeof ve.getStartDate === 'function') {
            const sd = ve.getStartDate();
            if (sd instanceof Date && !isNaN(sd.getTime())) startRaw = sd;
        }
        if (!endRaw && typeof ve.getEndDate === 'function') {
            const ed = ve.getEndDate();
            if (ed instanceof Date && !isNaN(ed.getTime())) endRaw = ed;
        }
        const start = startRaw instanceof Date ? startRaw : (startRaw ? new Date(startRaw) : null);
        const end = endRaw instanceof Date ? endRaw : (endRaw ? new Date(endRaw) : null);
        if (!start || isNaN(start.getTime())) return false;
        const skipShortPick = !!(options && options.skipShortEventPickCheck);
        if (
            !skipShortPick &&
            typeof EventRenderer !== 'undefined' &&
            typeof EventRenderer.isShortEventPointerPickableAtCurrentZoom === 'function' &&
            !EventRenderer.isShortEventPointerPickableAtCurrentZoom(start, end)
        ) {
            return false;
        }
        const pickUid = ve.uid != null ? ve.uid : ve.id;
        const pickUidStr = pickUid != null ? String(pickUid).trim() : '';
        if (typeof window.setCircaevumSelectedLayerId === 'function' && layerId) {
            window.setCircaevumSelectedLayerId(layerId);
        }
        const glPick = typeof window !== 'undefined' ? (window.circaevumGL || (window.getGL && window.getGL())) : null;
        const useMobileSheet = typeof window.isMobileEventSheetViewport === 'function' &&
            window.isMobileEventSheetViewport();
        if (glPick && typeof glPick.setEventHighlight === 'function' && pickUidStr && layerId) {
            const cur = typeof glPick.getEventFocus === 'function' ? glPick.getEventFocus() : null;
            if (cur && cur.uid && cur.layerId === layerId && String(cur.uid) === pickUidStr) {
                glPick.setEventHighlight(layerId, null);
                if (typeof window.updateEventFocusClearButton === 'function') window.updateEventFocusClearButton();
                if (useMobileSheet && typeof window.closeMobileEventDetailSheet === 'function') {
                    window.closeMobileEventDetailSheet();
                }
                return true;
            }
            glPick.setEventHighlight(layerId, pickUidStr);
        }
        if (options && options.preferSleepStartNav && typeof window.smoothNavigateToTime === 'function') {
            window.smoothNavigateToTime(start, 880);
        } else if (typeof window.navigateToEvent === 'function') {
            window.navigateToEvent(start, end);
        }
        if (useMobileSheet && typeof window.showMobileEventDetailSheet === 'function') {
            window.showMobileEventDetailSheet({
                vevent: ve,
                layerId: layerId,
                start: start,
                end: end
            });
        } else {
            if (window.self !== window.top && window.parent && window.parent.postMessage) {
                const buildPayload = typeof window.buildCircaevumEditPayload === 'function'
                    ? window.buildCircaevumEditPayload
                    : null;
                if (buildPayload) {
                    window.parent.postMessage({
                        type: 'CIRCAEVUM_EDIT_EVENT',
                        event: buildPayload(ve, layerId, start, end)
                    }, '*');
                }
            }
            if (typeof window.openEventListPanel === 'function') window.openEventListPanel();
            if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
            const scrollToRow = function () {
                if (typeof window.scrollEventListToFocusedEvent !== 'function') return;
                if (window.scrollEventListToFocusedEvent()) return;
                if (typeof window.refreshEventsList === 'function') {
                    window.refreshEventsList(true);
                    requestAnimationFrame(function () {
                        if (typeof window.scrollEventListToFocusedEvent === 'function') {
                            window.scrollEventListToFocusedEvent();
                        }
                    });
                }
            };
            requestAnimationFrame(scrollToRow);
        }
        return true;
    }

    function trySelectEventObjectAtClientPoint(clientX, clientY, options) {
        if (!renderer || !camera || !sceneContentGroup) return false;
        if (!options || !options.skipLagrangeL1) {
            if (tryPickLagrangeL1DayNavigate(clientX, clientY)) return true;
        }
        if (tryPickMoonPhaseMarker(clientX, clientY)) return true;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        pickRaycaster.setFromCamera(pickPointer, camera);
        const hits = pickRaycaster.intersectObjects(sceneContentGroup.children, true);
        const tsHit = hits.find((hit) => {
            let cur = hit.object;
            while (cur) {
                if (cur.userData && cur.userData.type === 'TimeseriesObject' && cur.userData.vevent) return true;
                cur = cur.parent;
            }
            return false;
        });
        if (tsHit) {
            let target = tsHit.object;
            while (target && !(target.userData && target.userData.type === 'TimeseriesObject' && target.userData.vevent)) {
                target = target.parent;
            }
            if (target && target.userData && target.userData.vevent) {
                return finishEventPickFromVevent(
                    target.userData.vevent,
                    target.userData.layerId,
                    {
                        skipShortEventPickCheck: true,
                        preferSleepStartNav: target.userData.timeseriesMetric === 'sleepStage'
                    }
                );
            }
        }
        const eventHit = hits.find((hit) => {
            let cur = hit.object;
            // Wide transparent label/text quads must never steal a click from the
            // event the user is actually pointing at — skip them so the colored
            // ribbon/marker geometry behind resolves instead.
            if (cur && cur.userData && typeof cur.userData.type === 'string' && /Label$/.test(cur.userData.type)) {
                return false;
            }
            while (cur) {
                if (cur.userData && cur.userData.shortEventPickable === false) return false;
                if (cur.userData && cur.userData.vevent &&
                    (cur.userData.type === 'EventObject' || cur.userData.type === 'EventLine')) return true;
                cur = cur.parent;
            }
            return false;
        });
        if (!eventHit) return false;
        let target = eventHit.object;
        while (target && !(target.userData && target.userData.vevent &&
            (target.userData.type === 'EventObject' || target.userData.type === 'EventLine'))) {
            target = target.parent;
        }
        if (!target || !target.userData || !target.userData.vevent) return false;
        if (target.userData.shortEventPickable === false) return false;
        let ve = target.userData.vevent;
        if (!ve.uid && !ve.id && target.userData.type === 'EventLine' && target.userData.start) {
            ve = Object.assign({}, ve, {
                uid: ve.uid || ve.id || `line-${target.userData.index != null ? target.userData.index : 0}`,
                dtstart: ve.dtstart || { dateTime: target.userData.start.toISOString() },
                dtend: ve.dtend || (target.userData.end
                    ? { dateTime: target.userData.end.toISOString() }
                    : null)
            });
        }
        return finishEventPickFromVevent(ve, target.userData.layerId);
    }

    // Mouse events for desktop
    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        resetLagrangeL1DayDotScales();
        lagrangeL1MouseRay.has = false;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        dragStartPos = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            resetLagrangeL1DayDotScales();
            lagrangeL1MouseRay.has = false;
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            if (isEarthZoomRig(currentZoom)) {
                applyPolarOrbitDelta(deltaX, deltaY);
            } else {
                cameraRotation.y -= deltaX * 0.005;
                cameraRotation.x -= deltaY * 0.005;
                clampCameraRotationPitch();
            }

            previousMousePosition = { x: e.clientX, y: e.clientY };
        } else if (shouldShowLagrangeL1DayArc(currentZoom) && lagrangeL1DayArcObjects.length) {
            const rect = renderer.domElement.getBoundingClientRect();
            if (rect.width && rect.height) {
                pickPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                pickPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                pickRaycaster.setFromCamera(pickPointer, camera);
                lagrangeL1SetMouseRayFromThreeRay(pickRaycaster.ray);
                refreshLagrangeL1DayDotPickScales();
                const hh = pickRaycaster.intersectObjects(lagrangeL1DayArcObjects, false);
                lagrangeL1DayHoverTargetMesh = hh.length ? hh[0].object : null;
                updateLagrangeL1DayHoverConnectorGeometry();
                if (renderer && renderer.domElement) {
                    renderer.domElement.style.cursor = lagrangeL1DayHoverTargetMesh ? 'pointer' : '';
                }
            }
        } else {
            lagrangeL1DayHoverTargetMesh = null;
            resetLagrangeL1DayDotScales();
            lagrangeL1MouseRay.has = false;
            if (lagrangeL1DayHoverConnector) lagrangeL1DayHoverConnector.visible = false;
            if (renderer && renderer.domElement) renderer.domElement.style.cursor = '';
        }
    });

    renderer.domElement.addEventListener('mouseup', (e) => {
        const wasDragging = isDragging;
        isDragging = false;
        if (!wasDragging || !dragStartPos) return;
        const dx = e.clientX - dragStartPos.x;
        const dy = e.clientY - dragStartPos.y;
        dragStartPos = null;
        const dist = Math.hypot(dx, dy);
        const arcCfg = SCENE_CONFIG.lagrangeMarkers && SCENE_CONFIG.lagrangeMarkers.l1DayArc;
        const l1MaxDrag = arcCfg && arcCfg.pickMaxDragPx != null ? arcCfg.pickMaxDragPx : 26;
        if (dist <= l1MaxDrag && tryPickLagrangeL1DayNavigate(e.clientX, e.clientY)) {
            return;
        }
        if (dist > 6) return;
        if (!trySelectEventObjectAtClientPoint(e.clientX, e.clientY, { skipLagrangeL1: true })) {
            if (typeof window.clearEventFocus === 'function') window.clearEventFocus();
        }
    });
    renderer.domElement.addEventListener('mouseleave', () => {
        isDragging = false;
        lagrangeL1DayHoverTargetMesh = null;
        resetLagrangeL1DayDotScales();
        lagrangeL1MouseRay.has = false;
        if (lagrangeL1DayHoverConnector) lagrangeL1DayHoverConnector.visible = false;
    });
    
    // Touch events for mobile
    let lastTouchDistance = 0;
    
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            // Single touch - rotate camera
            isDragging = true;
            resetLagrangeL1DayDotScales();
            lagrangeL1MouseRay.has = false;
            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            // Two fingers - pinch to zoom
            isDragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        }
        e.preventDefault();
    }, { passive: false });
    
    // Mobile swipe gestures for zoom
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchPickMoved = false;
    let touchSessionMulti = false;

    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length >= 2) touchSessionMulti = true;
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            touchPickMoved = false;
        }
    }, { passive: true });
    
    renderer.domElement.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1 && !isDragging) {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const touchEndTime = Date.now();
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const deltaTime = touchEndTime - touchStartTime;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Swipe detection: quick swipe (less than 300ms) and significant distance (more than 50px)
            if (deltaTime < 300 && distance > 50) {
                // Vertical swipe for zoom
                if (Math.abs(deltaY) > Math.abs(deltaX)) {
                    if (deltaY < 0 && currentZoom < 9) {
                        setZoomLevel(currentZoom + 1);
                    } else if (deltaY > 0 && currentZoom > 1) {
                        setZoomLevel(currentZoom - 1);
                    }
                }
            }
        }
    }, { passive: true });
    
    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isDragging) {
            // Single touch drag - rotate camera
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;

            if (isEarthZoomRig(currentZoom)) {
                applyPolarOrbitDelta(deltaX, deltaY);
            } else {
                cameraRotation.y -= deltaX * 0.005;
                cameraRotation.x -= deltaY * 0.005;
                clampCameraRotationPitch();
            }

            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            // Pinch to zoom
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (lastTouchDistance > 0) {
                const zoomFactor = lastTouchDistance / distance;
                targetCameraDistance = clampCameraDistanceForZoom(
                    currentZoom,
                    targetCameraDistance * zoomFactor
                );
                if (isEarthZoomRig(currentZoom)) {
                    currentCameraDistance = targetCameraDistance;
                }
            }
            lastTouchDistance = distance;
        }
        if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (Math.hypot(dx, dy) > 10) touchPickMoved = true;
        }
        e.preventDefault();
    }, { passive: false });
    
    renderer.domElement.addEventListener('touchend', (e) => {
        if (!touchSessionMulti && e.changedTouches.length === 1 && !touchPickMoved) {
            const t = e.changedTouches[0];
            const dt = Date.now() - touchStartTime;
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            if (dt < 700 && Math.hypot(dx, dy) < 14) {
                if (!trySelectEventObjectAtClientPoint(t.clientX, t.clientY)) {
                    if (typeof window.clearEventFocus === 'function') window.clearEventFocus();
                }
            }
        }
        if (e.touches.length === 0) touchSessionMulti = false;
        isDragging = false;
        lastTouchDistance = 0;
    });
    
    renderer.domElement.addEventListener('touchcancel', (e) => {
        isDragging = false;
        lastTouchDistance = 0;
    });

    function getNextKeyboardZoomLevel(direction) {
        // W/S skip Lunar (6) — moon hop is jarring. Digit 6 still jumps there.
        const sequence = [1, 2, 3, 4, 5, 7, 8, 9, 0];
        if (currentZoom === 6) return direction > 0 ? 7 : 5;
        const currentIdx = sequence.indexOf(currentZoom);
        const nextIdx = currentIdx === -1
            ? (direction > 0 ? 0 : sequence.length - 1)
            : currentIdx + (direction > 0 ? 1 : -1);
        if (nextIdx < 0 || nextIdx >= sequence.length) return null;
        return sequence[nextIdx];
    }

    document.addEventListener('keydown', (e) => {
        // Check if user is typing in a text field
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.isContentEditable
        );
        
        // Disable all keyboard shortcuts when typing in form fields
        if (isTyping) {
            return;
        }

        // Space: smooth return to wall-clock now at every zoom (including Moment / zoom 0). Handle before digit shortcuts.
        if (e.code === 'Space') {
            e.preventDefault();
            smoothReturnToPresent();
            return;
        }

        if (e.code === 'Escape') {
            const glEsc = typeof window !== 'undefined' ? (window.circaevumGL || (window.getGL && window.getGL())) : null;
            const focused = glEsc && typeof glEsc.getEventFocus === 'function' ? glEsc.getEventFocus() : null;
            if (focused && focused.uid) {
                e.preventDefault();
                if (typeof window.clearEventFocus === 'function') window.clearEventFocus();
                return;
            }
            if (typeof window.closeMobileEventDetailSheet === 'function') {
                const sheet = document.getElementById('event-detail-sheet');
                if (sheet && sheet.classList.contains('open')) {
                    e.preventDefault();
                    window.closeMobileEventDetailSheet();
                    return;
                }
            }
            if (typeof window.closeKeyboardControlsPanel === 'function') {
                window.closeKeyboardControlsPanel();
            }
        }

        if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
            e.preventDefault();
            if (typeof window.toggleKeyboardControlsPanel === 'function') {
                window.toggleKeyboardControlsPanel();
            } else if (typeof window.openKeyboardControlsPanel === 'function') {
                window.openKeyboardControlsPanel();
            }
            return;
        }

    // Zoom 0 (Moment): A/D = hour, Shift+A/D = day, [ ] = 15 min; block mode toggles that fight polar landing view.
    const blockMomentModeShortcuts = currentZoom === 0;
        
        const key = parseInt(e.key);
        if (key >= 0 && key <= 9) {
            if (e.repeat) return;
            if (key !== currentZoom) setZoomLevel(key);
        } else if (e.key.toLowerCase() === 'w') {
            if (e.repeat) return;
            const nextZoom = getNextKeyboardZoomLevel(1);
            if (typeof nextZoom === 'number') setZoomLevel(nextZoom);
        } else if (e.key.toLowerCase() === 's') {
            if (e.repeat) return;
            const nextZoom = getNextKeyboardZoomLevel(-1);
            if (typeof nextZoom === 'number') setZoomLevel(nextZoom);
        } else if (e.key === '[' || e.code === 'BracketLeft') {
            e.preventDefault();
            nudgeSelectedWallTime(-15 * 60 * 1000); // 15 minutes back
            if (typeof playTickSound === 'function') playTickSound(Math.min(9, currentZoom + 1));
        } else if (e.key === ']' || e.code === 'BracketRight') {
            e.preventDefault();
            nudgeSelectedWallTime(15 * 60 * 1000); // 15 minutes forward
            if (typeof playTickSound === 'function') playTickSound(Math.min(9, currentZoom + 1));
        } else if (e.key.toLowerCase() === 'a' && e.shiftKey) {
            e.preventDefault();
            navigateUnit(-1, 1, { coarse: true });
            if (typeof playTickSound === 'function') {
                playTickSound(Math.max(0, currentZoom - 1));
            }
        } else if (e.key.toLowerCase() === 'd' && e.shiftKey) {
            e.preventDefault();
            navigateUnit(1, 1, { coarse: true });
            if (typeof playTickSound === 'function') {
                playTickSound(Math.max(0, currentZoom - 1));
            }
        } else if (e.key.toLowerCase() === 'a') {
            navigateUnit(-1); // Navigate down one unit (previous week, day, hour, etc.)
            if (typeof playTickSound === 'function') playTickSound(currentZoom);
        } else if (e.key.toLowerCase() === 'd') {
            navigateUnit(1); // Navigate up one unit (next week, day, hour, etc.)
            if (typeof playTickSound === 'function') playTickSound(currentZoom);
        } else if (e.key.toLowerCase() === 'n') {
            returnToPresent(); // Return selection to current date/time
        } else if (e.key.toLowerCase() === 'c' && !blockMomentModeShortcuts) {
            toggleFocusTarget(); // Camera: toggle focus Sun/Earth
        } else if (e.key.toLowerCase() === 'l' && !blockMomentModeShortcuts) {
            toggleLightMode(); // Light mode
        } else if (e.key.toLowerCase() === 't' && !blockMomentModeShortcuts) {
            toggleTimeMarkerText(); // Time marker text
        } else if (e.key.toLowerCase() === 'm' && !blockMomentModeShortcuts) {
            if (e.shiftKey) {
                const soundBtn = document.getElementById('sound-toggle');
                if (soundBtn) soundBtn.click();
            } else {
                e.preventDefault();
                toggleMoonLayer();
            }
        } else if (e.key.toLowerCase() === 'p' && !blockMomentModeShortcuts) {
            e.preventDefault();
            toggleOtherPlanets();
        } else if (e.key.toLowerCase() === 'x' && !blockMomentModeShortcuts) {
            toggleWebXR(); // XR mode
        } else if (e.key.toLowerCase() === 'r' && !blockMomentModeShortcuts) {
            rotate90Right(); // Rotate system 90 degrees clockwise
        } else if (e.key.toLowerCase() === 'g' && !blockMomentModeShortcuts) {
            e.preventDefault();
            if (typeof toggleGeophysicalShells === 'function') toggleGeophysicalShells();
        } else if (e.key.toLowerCase() === 'k' && !blockMomentModeShortcuts) {
            e.preventDefault();
            toggleDayFrameLteSky();
        } else if (e.key.toLowerCase() === 'w' && !blockMomentModeShortcuts) {
            e.preventDefault();
            toggleWorldlines();
        } else if (e.key.toLowerCase() === 'f' && !blockMomentModeShortcuts) {
            toggleFlattenWithKey();
        }
    });

    function onCircadianShiftPreviewModifierEvent(e) {
        if (typeof window.applyCircadianShiftPreviewFromModifiers === 'function') {
            window.applyCircadianShiftPreviewFromModifiers(e);
        }
    }
    document.addEventListener('keydown', onCircadianShiftPreviewModifierEvent, true);
    document.addEventListener('keyup', onCircadianShiftPreviewModifierEvent, true);
    document.addEventListener('mousemove', onCircadianShiftPreviewModifierEvent, { capture: true, passive: true });
    document.addEventListener('pointermove', onCircadianShiftPreviewModifierEvent, { capture: true, passive: true });
    window.addEventListener('blur', () => {
        onCircadianShiftPreviewModifierEvent({
            metaKey: false,
            shiftKey: false,
            getModifierState: function () { return false; }
        });
    });
    
    // Mouse wheel zoom within current zoom level (distance dolly; [ ] / mobile buttons change zoom band)
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        let effDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : (e.shiftKey ? -e.deltaX : e.deltaX);
        if (Math.abs(effDelta) < 1e-4) return;
        const zoomIn = effDelta < 0;
        // Zoom 0 (Moment): the dolly bottoms out at the globe standoff, so extra
        // zoom-in scroll there is dead. Convert it into FOV magnification
        // (telephoto) for fine inspection, and unwind FOV before pulling back out.
        if (currentZoom === 0 && camera) {
            const earthMesh = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
            const standoff = resolveEarthGlobeSurfaceRadius(earthMesh) + 0.02;
            const atWall = targetCameraDistance <= standoff + 1e-3;
            if (zoomIn && atWall) {
                camera.fov = Math.max(MIN_MOMENT_FOV, camera.fov * 0.9);
                camera.updateProjectionMatrix();
                return;
            }
            if (!zoomIn && camera.fov < BASE_CAMERA_FOV - 1e-3) {
                camera.fov = Math.min(BASE_CAMERA_FOV, camera.fov / 0.9);
                camera.updateProjectionMatrix();
                return;
            }
        }
        const zoomFactor = zoomIn ? 0.9 : 1.1;
        targetCameraDistance = clampCameraDistanceForZoom(currentZoom, targetCameraDistance * zoomFactor);
        if (isEarthZoomRig(currentZoom)) {
            currentCameraDistance = targetCameraDistance;
        }
    });

    // Mobile zoom controls
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const mobileZoomLabel = document.getElementById('mobile-zoom-label');
    
    // Zoom in function
    const handleZoomIn = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextZoom = getNextKeyboardZoomLevel(1);
        if (typeof nextZoom === 'number') setZoomLevel(nextZoom);
    };
    
    // Zoom out function
    const handleZoomOut = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextZoom = getNextKeyboardZoomLevel(-1);
        if (typeof nextZoom === 'number') setZoomLevel(nextZoom);
    };
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', handleZoomIn);
        zoomInBtn.addEventListener('touchend', handleZoomIn);
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', handleZoomOut);
        zoomOutBtn.addEventListener('touchend', handleZoomOut);
    }

    const mobileTimeBackBtn = document.getElementById('mobile-time-back-btn');
    const mobileTimeNowBtn = document.getElementById('mobile-time-now-btn');
    const mobileTimeForwardBtn = document.getElementById('mobile-time-forward-btn');
    const handleTimeBack = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateUnit(-1);
        if (typeof playTickSound === 'function') playTickSound(currentZoom);
    };
    const handleTimeNow = (e) => {
        e.preventDefault();
        e.stopPropagation();
        smoothReturnToPresent();
    };
    const handleTimeForward = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateUnit(1);
        if (typeof playTickSound === 'function') playTickSound(currentZoom);
    };
    function wireMobileTimeBtn(btn, handler) {
        if (!btn) return;
        btn.addEventListener('click', handler);
        btn.addEventListener('touchend', handler);
    }
    wireMobileTimeBtn(mobileTimeBackBtn, handleTimeBack);
    wireMobileTimeBtn(mobileTimeNowBtn, handleTimeNow);
    wireMobileTimeBtn(mobileTimeForwardBtn, handleTimeForward);
    
    document.querySelectorAll('.zoom-option').forEach(option => {
        option.addEventListener('click', () => {
            const zoom = parseInt(option.dataset.zoom);
            if (!isNaN(zoom)) {
                setZoomLevel(zoom);
            }
        });
        option.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            const zoom = parseInt(option.dataset.zoom);
            if (!isNaN(zoom)) setZoomLevel(zoom);
        });
    });
    
    // Time marker lines and text toggles
    const markersLinesBtn = document.getElementById('markers-lines-toggle');
    const markersTextBtn = document.getElementById('markers-text-toggle');
    const markersYearBtn = document.getElementById('markers-year-toggle');
    const markersSingularBandBtn = document.getElementById('markers-singular-band-toggle');
    if (markersLinesBtn) {
        markersLinesBtn.classList.toggle('active', showTimeMarkerLines);
        setButtonPressed(markersLinesBtn, showTimeMarkerLines);
    }
    if (markersLinesBtn) markersLinesBtn.addEventListener('click', toggleTimeMarkerLines);
    if (markersTextBtn) markersTextBtn.addEventListener('click', toggleTimeMarkerText);
    if (markersYearBtn) markersYearBtn.addEventListener('click', toggleTimeMarkerYearMode);
    if (markersSingularBandBtn) {
        initSingularBandModeFromUrlAndStorage();
        markersSingularBandBtn.addEventListener('click', toggleSingularBandMode);
    } else {
        initSingularBandModeFromUrlAndStorage();
    }

    const worldlinesBtn = document.getElementById('worldlines-toggle');
    if (worldlinesBtn) {
        worldlinesBtn.addEventListener('click', toggleWorldlines);
        syncWorldlinesToggleButton();
    }

    const dayFrameLteSkyBtn = document.getElementById('day-frame-lte-sky-toggle');
    initDayFrameLteSkyFromUrlAndStorage();
    if (dayFrameLteSkyBtn) {
        dayFrameLteSkyBtn.addEventListener('click', toggleDayFrameLteSky);
    }

    const eventsTimelineScopeBtn = document.getElementById('events-timeline-scope-toggle');
    if (eventsTimelineScopeBtn) {
        eventsTimelineScopeBtn.addEventListener('click', toggleTimelineEventScope);
        if (typeof window !== 'undefined' && window.circaevumGL && typeof window.circaevumGL.getTimelineEventFilter === 'function') {
            showAllTimelineEvents = window.circaevumGL.getTimelineEventFilter() === 'all';
        }
        updateEventsTimelineScopeButton();
    }
    const eventsColorFadeBtn = document.getElementById('events-color-fade-toggle');
    if (eventsColorFadeBtn) {
        eventsColorFadeBtn.addEventListener('click', toggleLongEventContextFadeMode);
        updateLongEventContextFadeButton();
    }
    const eventsPlotLinesBtn = document.getElementById('events-plot-lines-toggle');
    if (eventsPlotLinesBtn) {
        eventsPlotLinesBtn.addEventListener('click', toggleEventPlotType);
        updateEventPlotTypeButton();
    }

    const geophysicalShellsBtn = document.getElementById('geophysical-shells-toggle');
    if (geophysicalShellsBtn) {
        if (typeof syncGeophysicalShellsIcon === 'function') syncGeophysicalShellsIcon();
        geophysicalShellsBtn.addEventListener('click', function () {
            if (typeof toggleGeophysicalShells === 'function') toggleGeophysicalShells();
        });
    }

    const moonLayerBtn = document.getElementById('moon-layer-toggle');
    if (moonLayerBtn) {
        syncMoonLayerButton();
        moonLayerBtn.addEventListener('click', toggleMoonLayer);
    }
    const otherPlanetsBtn = document.getElementById('other-planets-toggle');
    if (otherPlanetsBtn) {
        syncOtherPlanetsButton();
        otherPlanetsBtn.addEventListener('click', toggleOtherPlanets);
    }
    
    // Light mode toggle
    document.getElementById('light-mode-toggle').addEventListener('click', toggleLightMode);

    // Camera focus toggle (Sun <-> Earth)
    const focusToggleBtn = document.getElementById('focus-toggle');
    if (focusToggleBtn) focusToggleBtn.addEventListener('click', toggleFocusTarget);

    // Flatten view: icon toggles flatten on/off (smooth transition in animate)
    const flattenToggleBtn = document.getElementById('flatten-toggle');
    if (flattenToggleBtn) {
        flattenToggleBtn.addEventListener('click', toggleFlatten);
        syncFlattenToggleButtonState();
    }
    const flattenHeightSlider = document.getElementById('flatten-height-slider');
    if (flattenHeightSlider) {
        // Slider value represents height (0 = flattest, 1 = tallest).
        // Internally, flattenIntensity is how strong the flatten is (0 = none, 1 = max).
        flattenHeightSlider.addEventListener('input', (e) => {
            if (flattenMode !== 'all') return;
            const value = parseFloat(e.target.value);
            if (!isNaN(value)) {
                // Higher slider value = taller view (less flatten).
                flattenIntensity = 1 - Math.min(1, Math.max(0, value));
            }
        });
        syncFlattenHeightSlider();
    }

    const circadianHelixStretchEl = document.getElementById('circadian-helix-stretch-slider');
    if (circadianHelixStretchEl) {
        circadianHelixStretchEl.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value)) {
                circadianHelixStretchSlider = Math.min(1, Math.max(0, value));
                if (typeof createPlanets === 'function') createPlanets(currentZoom);
            }
        });
    }
    const circScopeDay = document.getElementById('circadian-events-scope-day');
    const circScopeYear = document.getElementById('circadian-events-scope-year');
    function refreshEventsAfterCircadianScopeChange() {
        syncCircadianShortEventScopeButtons();
        if (typeof refreshEventLayersIfNeeded === 'function') {
            refreshEventLayersIfNeeded(true);
        } else if (typeof window !== 'undefined' && window.circaevumGL &&
            typeof window.circaevumGL.refreshAllEventLayers === 'function') {
            try {
                window.circaevumGL.refreshAllEventLayers();
            } catch (err) { /* GL may be disposing */ }
        }
    }
    if (circScopeDay) {
        circScopeDay.addEventListener('click', () => {
            circadianShortEventScope = 'day';
            refreshEventsAfterCircadianScopeChange();
        });
    }
    if (circScopeYear) {
        circScopeYear.addEventListener('click', () => {
            circadianShortEventScope = 'year';
            refreshEventsAfterCircadianScopeChange();
        });
    }
    const offDayLineDimSlider = document.getElementById('off-selected-line-dim-slider');
    if (offDayLineDimSlider) {
        offDayLineDimSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && typeof window.setOffSelectedTimeLineDimStrength === 'function') {
                window.setOffSelectedTimeLineDimStrength(value);
            }
        });
        updateOffSelectedLineDimSliderUi();
    }
    const steMonthSlider = document.getElementById('ste-month-range-slider');
    if (steMonthSlider) {
        steMonthSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) {
                steWindowMonths = Math.max(1, Math.min(12, v));
                updateSteMonthRangeHint();
                if (typeof refreshEventLayersIfNeeded === 'function') {
                    refreshEventLayersIfNeeded(true);
                } else {
                    const gl = window.circaevumGL;
                    if (gl && typeof gl.refreshAllEventLayers === 'function') {
                        try { gl.refreshAllEventLayers(); } catch (err) {}
                    }
                }
            }
        });
        updateSteMonthRangeHint();
    }

    bindEventHorizonDualSliders();
    syncEventHorizonDualSliders();
    syncEventHorizonModeToggleUi();
    if (eventHorizonMode === 'nest' || eventHorizonMode === 'inside') {
        applyEventHorizonModeCameraFocus();
    }
    const ehModeBtn = document.getElementById('event-horizon-mode-toggle');
    if (ehModeBtn) {
        ehModeBtn.addEventListener('click', cycleEventHorizonMode);
    }

    // WebXR toggle (using adapter system) – show whenever adapter loads so user can try (e.g. on headset over HTTP)
    const webxrToggle = document.getElementById('webxr-toggle');
    if (webxrToggle) {
        if (typeof WebXRAdapter !== 'undefined') {
            xrAdapter = new WebXRAdapter(scene, camera, renderer, sceneContentGroup);
            webxrToggle.addEventListener('click', toggleWebXR);
            webxrToggle.style.display = 'inline-flex';
            xrAdapter.isSupported().then((supported) => {
                if (supported) {
                    console.log('WebXR: Supported - button enabled');
                } else {
                    console.warn('WebXR: Not supported on this device/browser (e.g. needs HTTPS or no headset)');
                }
            }).catch((error) => {
                console.error('WebXR: Error checking support', error);
            });
        } else {
            webxrToggle.style.display = 'none';
            console.warn('WebXR: WebXRAdapter not loaded');
        }
    }
}

function timeMarkerOffsetPayload() {
    return {
        selectedYearOffset,
        selectedQuarterOffset,
        selectedWeekOffset,
        selectedDayOffset,
        selectedHourOffset,
        selectedLunarOffset,
        currentYear,
        currentMonthInYear,
        currentMonth,
        currentQuarter,
        currentWeekInMonth,
        currentDayInWeek,
        currentDayOfMonth,
        currentHourInDay
    };
}

/** Write wall-clock now into zoom offsets (no scene rebuild). */
function syncSelectionToWallClockNow() {
    const now = new Date();
    selectedYearOffset = 0;
    selectedQuarterOffset = 0;
    selectedWeekOffset = 0;
    selectedDayOffset = 0;
    selectedHourOffset = 0;
    selectedLunarOffset = 0;
    selectedDecadeOffset = 0;
    currentYear = now.getFullYear();
    currentMonthInYear = now.getMonth();
    currentDayOfMonth = now.getDate();
    currentHourInDay = now.getHours();
    selectedMinuteInHour = now.getMinutes();
    currentQuarter = Math.floor(currentMonthInYear / 3);
    currentMonth = currentMonthInYear % 3;
    currentDayInWeek = now.getDay();
    applySelectedDateToZoomLevel(now, currentZoom);
    return now;
}

/** Apply a Date as SELECTED TIME and refresh the scene (light scrub when possible). */
function applySelectedTimeToScene(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return;
    applySelectedDateToZoomLevel(date, currentZoom);
    if (typeof TimeMarkers !== 'undefined' && TimeMarkers.updateOffsets) {
        TimeMarkers.updateOffsets(timeMarkerOffsetPayload());
    }
    if (!applyLightTimeScrubUpdate(currentZoom)) {
        createPlanets(currentZoom);
    }
    if (currentZoom === 0) {
        syncZoom0CameraToSelectedHourHand('delta');
    }
    updateTimeDisplays();
}

function returnToPresent() {
    cancelSmoothNavigateToTime();
    syncSelectionToWallClockNow();
    if (isEarthZoomRig(currentZoom)) {
        forcePolarDefaultOnInit = true;
        needPolarOrbitInit = true;
    }
    createPlanets(currentZoom);
    updateTimeDisplays();
}

/** Space / mobile Now: ease SELECTED TIME to live wall-clock now at the current zoom. */
function smoothReturnToPresent() {
    smoothNavigateToTime(new Date(), null, true);
}

function syncOtherPlanetsButton() {
    const btn = document.getElementById('other-planets-toggle');
    if (!btn) return;
    const on = showOtherPlanetsAtZoom(currentZoom);
    btn.classList.toggle('active', on);
    setButtonPressed(btn, on);
    btn.title = on
        ? 'Other planets: shown (P)'
        : 'Other planets: hidden (P)';
    btn.setAttribute(
        'aria-label',
        on
            ? 'Hide Mercury through Neptune (keep Earth)'
            : 'Show Mercury through Neptune'
    );
}

function toggleOtherPlanets() {
    otherPlanetsOverride = !showOtherPlanetsAtZoom(currentZoom);
    syncOtherPlanetsButton();
    createPlanets(currentZoom);
}

function syncMoonLayerButton() {
    const btn = document.getElementById('moon-layer-toggle');
    if (!btn) return;
    const on = isMoonLayerEffectiveAtZoom(currentZoom);
    btn.classList.toggle('active', on);
    setButtonPressed(btn, on);
}

function toggleMoonLayer() {
    showMoonLayer = !showMoonLayer;
    syncMoonLayerButton();
    const btn = document.getElementById('moon-layer-toggle');
    if (btn) {
        btn.title = showMoonLayer
            ? 'Moon & lunar path (M)'
            : 'Moon & lunar path: hidden (M)';
        btn.setAttribute(
            'aria-label',
            showMoonLayer
                ? 'Hide Moon mesh and lunar worldline (M)'
                : 'Show Moon mesh and lunar worldline (M)'
        );
    }
    createPlanets(currentZoom);
}

if (typeof window !== 'undefined') {
    window.toggleMoonLayer = toggleMoonLayer;
    window.toggleOtherPlanets = toggleOtherPlanets;
    window.getShowEarthHelicalWorldline = function () {
        return isEarthWorldlineVisibleAtZoom(currentZoom);
    };
    window.setShowEarthHelicalWorldline = function (on) {
        showEarthHelicalWorldline = !!on;
        if (typeof createPlanets === 'function') createPlanets(currentZoom);
        return showEarthHelicalWorldline;
    };
}

// createMoonWorldline moved to worldlines.js module

function setButtonPressed(btn, pressed) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
}

function hideLoadingScreen() {
    const loadingElement = document.getElementById('loading');
    if (!loadingElement) return;
    loadingElement.style.display = 'none';
    loadingElement.setAttribute('aria-busy', 'false');
    loadingElement.setAttribute('aria-hidden', 'true');
}

function toggleTimeMarkerLines() {
    showTimeMarkerLines = !showTimeMarkerLines;
    const button = document.getElementById('markers-lines-toggle');
    if (button) {
        button.classList.toggle('active', showTimeMarkerLines);
        setButtonPressed(button, showTimeMarkerLines);
    }
    applyTimeMarkerVisibility();
}

function toggleTimeMarkerText() {
    showTimeMarkerText = !showTimeMarkerText;
    const button = document.getElementById('markers-text-toggle');
    if (button) {
        button.classList.toggle('active', showTimeMarkerText);
        setButtonPressed(button, showTimeMarkerText);
    }
    applyTimeMarkerVisibility();
}

function toggleTimeMarkerYearMode() {
    showFullYearTimeMarkers = !showFullYearTimeMarkers;
    const button = document.getElementById('markers-year-toggle');
    if (button) {
        button.classList.toggle('active', showFullYearTimeMarkers);
        setButtonPressed(button, showFullYearTimeMarkers);
    }
    // Recreate markers with the new mode applied
    createTimeMarkers(currentZoom);
}

function readSingularBandModeFromStorage() {
    try {
        if (typeof sessionStorage === 'undefined') return null;
        const v = sessionStorage.getItem(SINGULAR_BAND_STORAGE_KEY);
        if (v === '1' || v === 'true') return true;
        if (v === '0' || v === 'false') return false;
    } catch (e) { /* private mode */ }
    return null;
}

function writeSingularBandModeToStorage(on) {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(SINGULAR_BAND_STORAGE_KEY, on ? '1' : '0');
        }
    } catch (e) { /* ignore */ }
}

/** URL `?singularBand=1|0` wins; else sessionStorage v3; else singular/shared-radius (temp default). */
function initSingularBandModeFromUrlAndStorage() {
    let fromUrl = null;
    try {
        if (typeof window !== 'undefined' && window.location) {
            const params = new URLSearchParams(window.location.search);
            if (params.has('singularBand')) {
                const raw = String(params.get('singularBand') || '').toLowerCase();
                fromUrl = raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
                if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') fromUrl = false;
            }
        }
    } catch (e) { /* keep */ }
    if (fromUrl != null) {
        singularBandMode = fromUrl;
        writeSingularBandModeToStorage(singularBandMode);
    } else {
        const stored = readSingularBandModeFromStorage();
        // Temp default: shared-radius ON. Classic only if user explicitly stored off.
        singularBandMode = stored === false ? false : true;
        if (stored == null) writeSingularBandModeToStorage(true);
    }
    syncSingularBandToggleButton();
}

function syncSingularBandToggleButton() {
    const button = document.getElementById('markers-singular-band-toggle');
    if (!button) return;
    button.classList.toggle('active', !!singularBandMode);
    setButtonPressed(button, !!singularBandMode);
}

function getSingularBandMode() {
    return !!singularBandMode;
}

function setSingularBandMode(on) {
    const next = !!on;
    if (next === singularBandMode) {
        syncSingularBandToggleButton();
        return singularBandMode;
    }
    singularBandMode = next;
    writeSingularBandModeToStorage(singularBandMode);
    syncSingularBandToggleButton();
    // createPlanets rebuilds markers + Context Arc (radii from getSingularBandMode).
    if (typeof createPlanets === 'function') {
        createPlanets(currentZoom);
    } else {
        createTimeMarkers(currentZoom);
        if (typeof updateListHorizonEarthRing === 'function') {
            updateListHorizonEarthRing(currentZoom);
        }
    }
    return singularBandMode;
}

function toggleSingularBandMode() {
    return setSingularBandMode(!singularBandMode);
}

function readDayFrameLteSkyFromStorage() {
    try {
        if (typeof sessionStorage === 'undefined') return null;
        const v = sessionStorage.getItem(DAY_FRAME_LTE_SKY_STORAGE_KEY);
        if (v === '1' || v === 'true') return true;
        if (v === '0' || v === 'false') return false;
    } catch (e) { /* keep */ }
    return null;
}

function writeDayFrameLteSkyToStorage(on) {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(DAY_FRAME_LTE_SKY_STORAGE_KEY, on ? '1' : '0');
        }
    } catch (e) { /* keep */ }
}

/** URL `?dayFrameLteSky=1|0` wins; else sessionStorage; else true (on). */
function initDayFrameLteSkyFromUrlAndStorage() {
    let fromUrl = null;
    try {
        if (typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined') {
            const params = new URLSearchParams(location.search);
            if (params.has('dayFrameLteSky')) {
                const raw = String(params.get('dayFrameLteSky') || '').toLowerCase();
                fromUrl = raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
                if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') fromUrl = false;
            }
        }
    } catch (e) { /* keep */ }
    if (fromUrl != null) {
        showDayFrameLteSky = fromUrl;
        writeDayFrameLteSkyToStorage(showDayFrameLteSky);
    } else {
        const stored = readDayFrameLteSkyFromStorage();
        if (stored != null) {
            showDayFrameLteSky = stored;
        } else {
            showDayFrameLteSky = false;
        }
    }
    syncDayFrameLteSkyToggleButton();
}

function syncDayFrameLteSkyToggleButton() {
    const button = document.getElementById('day-frame-lte-sky-toggle');
    if (!button) return;
    button.classList.toggle('active', !!showDayFrameLteSky);
    setButtonPressed(button, !!showDayFrameLteSky);
    button.title = showDayFrameLteSky
        ? 'Earth LTE sky canvas on day frame (K) — click to hide'
        : 'Earth LTE sky canvas: hidden (K) — click to show';
    button.setAttribute(
        'aria-label',
        showDayFrameLteSky
            ? 'Hide Earth day-frame LTE sky canvas (K)'
            : 'Show Earth day-frame LTE sky canvas (K)'
    );
}

function getShowDayFrameLteSky() {
    return !!showDayFrameLteSky;
}

function setShowDayFrameLteSky(on) {
    const next = !!on;
    if (next === showDayFrameLteSky) {
        syncDayFrameLteSkyToggleButton();
        return showDayFrameLteSky;
    }
    showDayFrameLteSky = next;
    writeDayFrameLteSkyToStorage(showDayFrameLteSky);
    syncDayFrameLteSkyToggleButton();
    if (!showDayFrameLteSky) {
        disposeEarthDaylightSky();
        if (typeof disposeListHorizonEarthRing === 'function') disposeListHorizonEarthRing();
        if (typeof resetListHorizonEarthRingAnimationState === 'function') resetListHorizonEarthRingAnimationState();
    }
    if (typeof updateDayFrameLteSkyBackdrop === 'function') {
        updateDayFrameLteSkyBackdrop(currentZoom);
    }
    if (typeof earthGroup !== 'undefined' && earthGroup && typeof updateEarthDaylightSky === 'function') {
        updateEarthDaylightSky(earthGroup, currentZoom);
    }
    if (typeof updateListHorizonEarthRing === 'function') {
        updateListHorizonEarthRing(currentZoom);
    }
    return showDayFrameLteSky;
}

function toggleDayFrameLteSky() {
    return setShowDayFrameLteSky(!showDayFrameLteSky);
}

let showWorldlines = false;

function isWorldlineVisibleForZoom(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    if (z === 1 || z === 2) return true;
    return !!showWorldlines;
}

function syncWorldlinesToggleButton() {
    const button = document.getElementById('worldlines-toggle');
    if (!button) return;
    const active = isWorldlineVisibleForZoom(currentZoom);
    button.classList.toggle('active', active);
    setButtonPressed(button, active);
    button.title = active
        ? 'Earth helical worldline ribbon (W) — click to hide'
        : 'Earth helical worldline ribbon: hidden (W) — click to show';
    button.setAttribute(
        'aria-label',
        active
            ? 'Hide Earth helical worldline ribbon (W)'
            : 'Show Earth helical worldline ribbon (W)'
    );
}

function setWorldlinesVisible(visible) {
    showWorldlines = !!visible;
    if (Array.isArray(worldlines)) {
        worldlines.forEach((w) => {
            if (w) w.visible = isWorldlineVisibleForZoom(currentZoom);
        });
    }
    syncWorldlinesToggleButton();
    return showWorldlines;
}

function toggleWorldlines() {
    return setWorldlinesVisible(!showWorldlines);
}

function pickInitialZoomLevel() {
    try {
        if (typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined') {
            const params = new URLSearchParams(location.search);
            const zParam = params.get('zoom') || params.get('zl') || params.get('zoomLevel');
            if (zParam !== null) {
                const parsed = parseInt(zParam, 10);
                if (!isNaN(parsed) && typeof ZOOM_LEVELS !== 'undefined' && ZOOM_LEVELS[parsed]) {
                    return parsed;
                }
            }
        }
    } catch (e) { /* ignore */ }
    return typeof currentZoom === 'number' ? currentZoom : 4;
}

if (typeof window !== 'undefined') {
    window.getShowDayFrameLteSky = getShowDayFrameLteSky;
    window.setShowDayFrameLteSky = setShowDayFrameLteSky;
    window.toggleDayFrameLteSky = toggleDayFrameLteSky;
    window.setWorldlinesVisible = setWorldlinesVisible;
    window.toggleWorldlines = toggleWorldlines;
    window.pickInitialZoomLevel = pickInitialZoomLevel;
}

if (typeof window !== 'undefined') {
    window.getSingularBandMode = getSingularBandMode;
    window.setSingularBandMode = setSingularBandMode;
    window.toggleSingularBandMode = toggleSingularBandMode;
}

function getFlattenedY(logicalY) {
    return getFlattenedSceneY(logicalY);
}

function syncCircadianShortEventScopeButtons() {
    const d = document.getElementById('circadian-events-scope-day');
    const y = document.getElementById('circadian-events-scope-year');
    if (d) d.classList.toggle('active', circadianShortEventScope !== 'year');
    if (y) y.classList.toggle('active', circadianShortEventScope === 'year');
}

function updateCircadianHelixSpanHint() {
    const el = document.getElementById('circadian-helix-span-hint');
    if (!el) return;
    if (
        typeof isCircadianHelixZoom !== 'function' ||
        !isCircadianHelixZoom(currentZoom) ||
        typeof circadianState === 'undefined' ||
        circadianState === 'off'
    ) {
        el.textContent = '';
        return;
    }
    const span = circadianSpanDaysForZoom(currentZoom);
    const sd = getSelectedDateTime();
    const start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), 0, 0, 0, 0);
    const half = Math.floor(span / 2);
    start.setDate(start.getDate() - half);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + span - 1);
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmt = function (dt) {
        return mon[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear();
    };
    el.textContent =
        'Span: ' + fmt(start) + ' — ' + fmt(end) + ' (' + span + 'd). Ticks: month starts & Mondays (week).';
}

function updateOffSelectedLineDimSliderUi() {
    const slider = document.getElementById('off-selected-line-dim-slider');
    const hint = document.getElementById('off-selected-line-dim-hint');
    if (!slider) return;
    const v = typeof offSelectedTimeLineDimStrength === 'number' ? offSelectedTimeLineDimStrength : 1;
    slider.value = String(Math.max(0, Math.min(1, v)));
    const pct = Math.round(v * 100);
    if (hint) {
        hint.textContent = v <= 0.02
            ? 'Off-day lines: same brightness as selected day'
            : 'Off-day line dim: ' + pct + '%';
    }
    slider.title = 'Dim short event lines on days/hours outside selected time (' + pct + '%)';
}

function updateSteMonthRangeHint() {
    const hint = document.getElementById('ste-month-range-hint');
    if (!hint) return;
    hint.textContent = steWindowMonths === 1 ? '1 month' : steWindowMonths + ' months';
}

function clampEventHorizonHalfDays(n) {
    return Math.max(EH_HALF_DAYS_MIN, Math.min(EH_HALF_DAYS_MAX, Math.round(n)));
}

function persistEventHorizonKnobs() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('circaevum.ehHalfDays', String(eventHorizonHalfDays));
            sessionStorage.setItem(
                'circaevum.ehWarpOuterHalfDays',
                String(eventHorizonWarpOuterHalfDays)
            );
        }
    } catch (e) { /* private mode */ }
}

function updateEventHorizonHint() {
    const hint = document.getElementById('eh-horizon-hint');
    if (!hint) return;
    if (eventHorizonMode === 'off') {
        hint.textContent = 'Event Horizon off';
        return;
    }
    const beyond = Math.max(0, eventHorizonWarpOuterHalfDays - eventHorizonHalfDays);
    if (eventHorizonMode === 'inside') {
        hint.textContent = 'Shell ±7d (classic) · veil = zoom context';
        return;
    }
    hint.textContent =
        'Sphere ±' +
        eventHorizonHalfDays +
        'd · warp +' +
        beyond +
        'd past rim';
}

function syncEventHorizonDualFill() {
    const fill = document.getElementById('eh-dual-fill');
    const range = document.getElementById('eh-dual-range');
    if (!fill || !range) return;
    const min = EH_HALF_DAYS_MIN;
    const max = EH_HALF_DAYS_MAX;
    const span = max - min;
    if (eventHorizonMode === 'inside') {
        // Mode 2: fill from 0 → sphere only (warp band inactive).
        const a = ((eventHorizonHalfDays - min) / span) * 100;
        fill.style.left = '0%';
        fill.style.width = Math.max(0, a) + '%';
        return;
    }
    const a = ((eventHorizonHalfDays - min) / span) * 100;
    const b = ((eventHorizonWarpOuterHalfDays - min) / span) * 100;
    fill.style.left = Math.min(a, b) + '%';
    fill.style.width = Math.abs(b - a) + '%';
}

function syncEventHorizonDualSliders() {
    const sphereEl = document.getElementById('eh-sphere-slider');
    const warpEl = document.getElementById('eh-warp-outer-slider');
    if (sphereEl) sphereEl.value = String(eventHorizonHalfDays);
    if (warpEl) warpEl.value = String(eventHorizonWarpOuterHalfDays);
    syncEventHorizonDualFill();
    updateEventHorizonHint();
}

/**
 * Dual knobs: inner = EH sphere half-days; outer = warp fade end (≥ sphere).
 * Live-rebuild sphere (+ LTE warp band in nest mode).
 */
function applyEventHorizonKnobsFromUi(which) {
    const sphereEl = document.getElementById('eh-sphere-slider');
    const warpEl = document.getElementById('eh-warp-outer-slider');
    if (!sphereEl) return;
    let sphere = clampEventHorizonHalfDays(parseInt(sphereEl.value, 10));
    let outer = warpEl
        ? clampEventHorizonHalfDays(parseInt(warpEl.value, 10))
        : Math.max(sphere, eventHorizonWarpOuterHalfDays);

    if (eventHorizonMode === 'inside') {
        // Inside veil: only sphere size matters — keep outer ≥ sphere for when user returns to nest.
        eventHorizonHalfDays = sphere;
        if (outer < sphere) outer = sphere;
        eventHorizonWarpOuterHalfDays = outer;
        sphereEl.value = String(sphere);
        if (warpEl) warpEl.value = String(outer);
    } else {
        if (which === 'sphere') {
            if (sphere > outer) outer = sphere;
        } else if (outer < sphere) {
            sphere = outer;
        }
        eventHorizonHalfDays = sphere;
        eventHorizonWarpOuterHalfDays = outer;
        sphereEl.value = String(sphere);
        if (warpEl) warpEl.value = String(outer);
    }

    persistEventHorizonKnobs();
    syncEventHorizonDualFill();
    updateEventHorizonHint();
    refreshSceneForEventHorizonKnobs();
}

function refreshSceneForEventHorizonKnobs() {
    if (typeof createPlanets === 'function') {
        createPlanets(currentZoom);
    } else if (typeof updateParentUnitTemporalVeil === 'function') {
        updateParentUnitTemporalVeil(currentZoom);
        if (typeof refreshSkyCanvasForContextSphere === 'function') {
            refreshSkyCanvasForContextSphere(currentZoom);
        }
    }
    // createPlanets refreshes events with force=false; always force here so LTE day
    // ribbons rebuild with new EH / warp-band knobs (markers already rebuilt above).
    if (typeof refreshEventLayersIfNeeded === 'function') {
        refreshEventLayersIfNeeded(true);
    } else if (
        typeof window !== 'undefined' &&
        window.circaevumGL &&
        typeof window.circaevumGL.refreshAllEventLayers === 'function'
    ) {
        try {
            window.circaevumGL.refreshAllEventLayers();
        } catch (err) { /* GL may be disposing */ }
    }
    if (
        typeof TimeMarkers !== 'undefined' &&
        TimeMarkers.applyLteDayFrameEventHorizonWarp
    ) {
        try {
            TimeMarkers.applyLteDayFrameEventHorizonWarp();
        } catch (e) { /* optional */ }
    } else if (
        typeof TimeMarkerRenderer !== 'undefined' &&
        TimeMarkerRenderer.applyLteDayFrameEventHorizonWarp
    ) {
        try {
            TimeMarkerRenderer.applyLteDayFrameEventHorizonWarp();
        } catch (e) { /* optional */ }
    }
    // Inside veil: clip radius must match new sphere after materials rebuild.
    if (typeof refreshContextSphereVisualClip === 'function') {
        try {
            refreshContextSphereVisualClip();
        } catch (e) { /* optional */ }
    }
}

function bindEventHorizonDualSliders() {
    const sphereEl = document.getElementById('eh-sphere-slider');
    const warpEl = document.getElementById('eh-warp-outer-slider');
    if (!sphereEl || !warpEl) return;
    sphereEl.addEventListener('input', () => applyEventHorizonKnobsFromUi('sphere'));
    warpEl.addEventListener('input', () => applyEventHorizonKnobsFromUi('warp'));
}

function updateEventHorizonSliderVisibility() {
    const wrap = document.getElementById('event-horizon-slider-wrap');
    if (!wrap) return;
    // Dual knobs only for nest (Interstellar). Inside = classic week shell + zoom veil.
    const show =
        eventHorizonMode === 'nest' && currentZoom !== 1 && !tourMinimalOrbitMode;
    wrap.style.display = show ? '' : 'none';
    if (show) syncEventHorizonDualSliders();
    const range = document.getElementById('eh-dual-range');
    const warpEl = document.getElementById('eh-warp-outer-slider');
    const sphereEl = document.getElementById('eh-sphere-slider');
    if (range) range.classList.remove('eh-dual-range--sphere-only');
    if (warpEl) {
        warpEl.disabled = false;
        warpEl.style.pointerEvents = '';
        warpEl.style.opacity = '';
        warpEl.setAttribute('aria-hidden', 'false');
    }
    if (sphereEl) {
        sphereEl.disabled = false;
        sphereEl.style.pointerEvents = '';
        sphereEl.style.zIndex = '';
    }
    const caption = wrap && wrap.querySelector('.scene-slider-caption');
    if (caption) {
        caption.innerHTML = '<span>Sphere</span><span>Warp past rim</span>';
    }
}

function syncEventHorizonModeToggleUi() {
    const btn = document.getElementById('event-horizon-mode-toggle');
    if (!btn) return;
    const titles = {
        nest: 'Event Horizon: nest (Interstellar — STE in / LTE out + warp)',
        inside: 'Event Horizon: inside veil (classic week shell · zoom context arc)',
        off: 'Event Horizon: off (classic, no shell)'
    };
    const title = titles[eventHorizonMode] || titles.nest;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('data-eh-mode', eventHorizonMode);
    btn.classList.toggle('active', eventHorizonMode !== 'off');
    btn.setAttribute('aria-pressed', eventHorizonMode !== 'off' ? 'true' : 'false');
}

function persistEventHorizonMode() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('circaevum.ehMode', eventHorizonMode);
        }
    } catch (e) { /* private mode */ }
}

/**
 * Nest + Mode 2: look-at Earth / Event Horizon center.
 * Mode 2 also frames full context sphere in FOV (after veil rebuild).
 * Off: restore prior focus + classic zoom distance.
 */
function applyEventHorizonModeCameraFocus() {
    const config =
        typeof ZOOM_LEVELS !== 'undefined' && ZOOM_LEVELS[currentZoom]
            ? ZOOM_LEVELS[currentZoom]
            : null;
    if (eventHorizonMode === 'nest' || eventHorizonMode === 'inside') {
        if (eventHorizonSavedFocusTarget === undefined) {
            eventHorizonSavedFocusTarget = focusTargetOverride;
        }
        focusTargetOverride = 'earth';
        preferEarthEventHorizonCamera = true;
    } else {
        preferEarthEventHorizonCamera = false;
        zoomFramedCameraDistance = null;
        if (eventHorizonSavedFocusTarget !== undefined) {
            focusTargetOverride = eventHorizonSavedFocusTarget;
            eventHorizonSavedFocusTarget = undefined;
        }
        if (config && typeof config.distance === 'number' && config.distance > 0) {
            targetCameraDistance = config.distance;
        }
    }
    const effective =
        focusTargetOverride || (config && config.focusTarget) || 'sun';
    const focusLabel = document.getElementById('focus-target');
    if (focusLabel) focusLabel.textContent = String(effective).toUpperCase();
    const btn = document.getElementById('focus-toggle');
    if (btn) {
        btn.classList.toggle('active', effective === 'earth');
        if (typeof setButtonPressed === 'function') setButtonPressed(btn, effective === 'earth');
        btn.title = 'Camera focus: ' + String(effective).toUpperCase() + ' (C)';
    }
}

/**
 * After Context Sphere state is fresh: snap look-at to EH center;
 * Mode 2 dolly so full veil sphere fits in FOV.
 */
function syncEventHorizonCameraAfterSphere(zoomLevel) {
    if (eventHorizonMode === 'off') {
        preferEarthEventHorizonCamera = false;
        return;
    }
    preferEarthEventHorizonCamera = true;
    if (
        contextSphereState &&
        typeof contextSphereState.x === 'number' &&
        typeof contextSphereState.y === 'number' &&
        typeof contextSphereState.z === 'number' &&
        targetFocusPoint
    ) {
        targetFocusPoint.set(contextSphereState.x, contextSphereState.y, contextSphereState.z);
    }
    if (eventHorizonMode === 'inside') {
        applyCameraDistanceToFitContextSphere(zoomLevel);
    } else if (zoomFramedCameraDistance != null) {
        // Left Mode 2 framed dolly — return nest to classic zoom distance.
        zoomFramedCameraDistance = null;
        const config =
            typeof ZOOM_LEVELS !== 'undefined' && ZOOM_LEVELS[zoomLevel]
                ? ZOOM_LEVELS[zoomLevel]
                : null;
        if (config && typeof config.distance === 'number' && config.distance > 0) {
            targetCameraDistance = config.distance;
        }
    }
}

/** Cycle nest → inside → off → nest. */
function cycleEventHorizonMode() {
    const idx = EVENT_HORIZON_MODES.indexOf(eventHorizonMode);
    eventHorizonMode = EVENT_HORIZON_MODES[(idx + 1) % EVENT_HORIZON_MODES.length];
    persistEventHorizonMode();
    syncEventHorizonModeToggleUi();
    updateEventHorizonSliderVisibility();
    if (typeof updateFlattenIconVisibility === 'function') updateFlattenIconVisibility();
    applyEventHorizonModeCameraFocus();
    refreshSceneForEventHorizonKnobs();
}

function updateCircadianHelixSliderVisibility() {
    const helixWrap = document.getElementById('circadian-helix-slider-wrap');
    if (!helixWrap) return;
    const show =
        typeof isCircadianHelixZoom === 'function' &&
        isCircadianHelixZoom(currentZoom) &&
        typeof circadianState !== 'undefined' &&
        circadianState !== 'off';
    helixWrap.style.display = show ? '' : 'none';
    if (show) {
        updateCircadianHelixSpanHint();
        syncCircadianShortEventScopeButtons();
        updateOffSelectedLineDimSliderUi();
        updateSteMonthRangeHint();
    }
}

function updateFlattenIconVisibility() {
    const btn = document.getElementById('flatten-toggle');
    const sliderWrap = document.getElementById('flatten-slider-wrap');
    const stack = document.getElementById('scene-sliders-stack');
    const shouldShow = isTimelineFlattenZoom(currentZoom);
    if (btn) btn.style.display = shouldShow ? '' : 'none';
    if (sliderWrap) sliderWrap.style.display = shouldShow ? '' : 'none';
    if (shouldShow) syncFlattenHeightSlider();
    updateCircadianHelixSliderVisibility();
    updateEventHorizonSliderVisibility();
    if (stack) {
        const showHelix =
            typeof isCircadianHelixZoom === 'function' &&
            isCircadianHelixZoom(currentZoom) &&
            typeof circadianState !== 'undefined' &&
            circadianState !== 'off';
        const showEh = eventHorizonMode === 'nest' && currentZoom !== 1 && !tourMinimalOrbitMode;
        stack.style.display = shouldShow || showHelix || showEh ? 'flex' : 'none';
    }
}

/**
 * Keep flatten slider in sync with flatten on/off (F key, icon, embed).
 * Off: slider at max height (value 1) and disabled. On: interactive value = 1 - flattenIntensity.
 */
function syncFlattenHeightSlider() {
    const slider = document.getElementById('flatten-height-slider');
    if (!slider || !isTimelineFlattenZoom(currentZoom)) return;
    if (flattenMode === 'off') {
        slider.value = '1';
        slider.disabled = true;
        slider.setAttribute('aria-disabled', 'true');
        slider.title = 'Enable flatten (F) to adjust height';
    } else if (flattenMode === 'markers') {
        slider.value = '0';
        slider.disabled = true;
        slider.setAttribute('aria-disabled', 'true');
        slider.title = 'Markers-only flatten is fixed at full flatten';
    } else {
        slider.disabled = false;
        slider.removeAttribute('aria-disabled');
        slider.removeAttribute('title');
        slider.value = String(1 - flattenIntensity);
    }
}

function rebuildSceneAndEventsForFlattenChange() {
    if (typeof createPlanets === 'function') {
        createPlanets(currentZoom);
    }
    if (!eventsRefreshedDuringCreatePlanets) {
        if (typeof refreshEventLayersIfNeeded === 'function') {
            refreshEventLayersIfNeeded(true);
        } else if (typeof window !== 'undefined' && window.circaevumGL && typeof window.circaevumGL.refreshAllEventLayers === 'function') {
            try {
                window.circaevumGL.refreshAllEventLayers();
            } catch (err) { /* GL may be disposing */ }
        }
    }
    if (
        typeof EventRenderer !== 'undefined' &&
        typeof EventRenderer.updateTimelineHelixEventsForFlatten === 'function' &&
        typeof focusPoint !== 'undefined' &&
        focusPoint
    ) {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        const amount = flattenMode === 'all' ? flattenIntensity : 0;
        const pivotY =
            typeof window.flattenTimelineFocusY === 'function' ? window.flattenTimelineFocusY() : focusPoint.y;
        try {
            EventRenderer.updateTimelineHelixEventsForFlatten(gl, pivotY, amount);
        } catch (err) { /* optional */ }
    }
    if (typeof focusPoint !== 'undefined' && focusPoint) {
        const pivotY =
            typeof window.flattenTimelineFocusY === 'function' ? window.flattenTimelineFocusY() : focusPoint.y;
        updateListHorizonContextArcFlatten(pivotY, getActiveTimelineFlattenAmount());
        updateDayFrameLteSkyFlatten(pivotY, getActiveTimelineFlattenAmount());
        if (typeof syncContextSphereLteSlopeRing === 'function') {
            try {
                syncContextSphereLteSlopeRing();
            } catch (e) { /* optional */ }
        }
    }
}

function syncFlattenToggleButtonState() {
    const btn = document.getElementById('flatten-toggle');
    if (!btn) return;
    const isOn = flattenMode !== 'off';
    btn.classList.toggle('active', isOn);
    setButtonPressed(btn, isOn);
    if (flattenMode === 'markers') {
        btn.title = 'Flatten mode: time markers only (full) (F)';
        btn.setAttribute('aria-label', 'Flatten mode: time markers only, fully flattened');
    } else if (flattenMode === 'all') {
        btn.title = 'Flatten mode: markers + event worldlines (F)';
        btn.setAttribute('aria-label', 'Flatten mode: time markers and event worldlines');
    } else {
        btn.title = 'Flatten view (F)';
        btn.setAttribute('aria-label', 'Flatten mode: off');
    }
}

function toggleFlatten() {
    if (!isTimelineFlattenZoom(currentZoom)) return;
    // Requested order: 1) regular (off), 2) markers only (full), 3) markers + event worldlines.
    if (flattenMode === 'off') flattenMode = 'markers';
    else if (flattenMode === 'markers') flattenMode = 'all';
    else flattenMode = 'off';
    if (flattenMode !== 'all') flattenWorldOriginY = null;
    else if (typeof lastLogicalSelectedDateHeight === 'number' && isFinite(lastLogicalSelectedDateHeight)) {
        flattenWorldOriginY = lastLogicalSelectedDateHeight;
    }
    syncFlattenToggleButtonState();
    syncFlattenHeightSlider();
    rebuildSceneAndEventsForFlattenChange();
}

function toggleFlattenWithKey() {
    if (!isTimelineFlattenZoom(currentZoom)) return;
    toggleFlatten();
}

/**
 * Parent embed (yin-portal) can enable flatten for public share views.
 * @param {boolean} enabled - turn flatten on or off
 * @param {number} [internalIntensity] - 0 = no flatten, 1 = max flatten (matches flattenIntensity in this file)
 */
function applyFlattenFromEmbed(enabled, internalIntensity) {
    flattenMode = enabled ? 'all' : 'off';
    if (typeof internalIntensity === 'number' && !isNaN(internalIntensity)) {
        flattenIntensity = Math.min(1, Math.max(0, internalIntensity));
    } else if (flattenMode === 'all') {
        flattenIntensity = 1;
    }
    if (flattenMode !== 'all') flattenWorldOriginY = null;
    else if (typeof lastLogicalSelectedDateHeight === 'number' && isFinite(lastLogicalSelectedDateHeight)) {
        flattenWorldOriginY = lastLogicalSelectedDateHeight;
    }
    syncFlattenToggleButtonState();
    if (typeof updateFlattenIconVisibility === 'function') {
        updateFlattenIconVisibility();
    } else {
        syncFlattenHeightSlider();
    }
    rebuildSceneAndEventsForFlattenChange();
}

if (typeof window !== 'undefined') {
    window.applyFlattenFromEmbed = applyFlattenFromEmbed;
}

function updateEventsTimelineScopeButton() {
    const btn = document.getElementById('events-timeline-scope-toggle');
    if (!btn) return;
    const yearOnly = !showAllTimelineEvents;
    btn.classList.toggle('active', yearOnly);
    setButtonPressed(btn, yearOnly);
    if (showAllTimelineEvents) {
        btn.title = 'Events: all time (click for selected year only)';
        btn.setAttribute('aria-label', 'Showing all events. Switch to selected year only.');
    } else {
        btn.title = 'Events: selected year only (click for all time)';
        btn.setAttribute('aria-label', 'Showing selected year only. Switch to all events.');
    }
    // Legible 1Y / all-time: bold text + Feather-style lemniscate (fills icon; not 9px glyph).
    if (showAllTimelineEvents) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c-2-3-4-3-6 0 2 3 4 3 6 0 2-3 4-3 6 0-2 3-4 3-6 0-2-3-4-3-6 0"/></svg>`;
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="16.8" font-size="14" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui, -apple-system, Segoe UI, sans-serif" letter-spacing="-0.04em">1Y</text></svg>`;
    }
}

function toggleTimelineEventScope() {
    showAllTimelineEvents = !showAllTimelineEvents;
    const gl = typeof window !== 'undefined' && window.circaevumGL;
    if (gl && typeof gl.setTimelineEventFilter === 'function') {
        gl.setTimelineEventFilter(showAllTimelineEvents ? 'all' : 'year');
    }
    updateEventsTimelineScopeButton();
}

function updateLongEventContextFadeButton() {
    const btn = document.getElementById('events-color-fade-toggle');
    if (!btn) return;
    const alphaMode = longEventContextFadeMode === 'alpha';
    btn.classList.toggle('active', alphaMode);
    setButtonPressed(btn, alphaMode);
    if (alphaMode) {
        btn.title = 'Long-term event context: fade transparency, keep hue (click for desaturate)';
        btn.setAttribute('aria-label', 'Long-term context uses transparency fade while keeping hue. Click to switch to desaturate.');
    } else {
        btn.title = 'Long-term event context: desaturate color (click for transparency fade)';
        btn.setAttribute('aria-label', 'Long-term context desaturates color. Click to switch to transparency fade.');
    }
}

function updateEventPlotTypeButton() {
    const btn = document.getElementById('events-plot-lines-toggle');
    if (!btn) return;
    const mode = globalEventPlotType === 'lines' || globalEventPlotType === 'polygon3d'
        ? globalEventPlotType
        : 'auto';
    const forced = mode === 'lines' || mode === 'polygon3d';
    btn.classList.toggle('active', forced);
    setButtonPressed(btn, forced);
    if (mode === 'lines') {
        btn.title = 'Events: all simple lines. Click for auto (polygons on selected day only).';
        btn.setAttribute('aria-label', 'All events drawn as simple lines. Click for auto mode.');
    } else if (mode === 'polygon3d') {
        btn.title = 'Events: all filled polygons. Click for auto (lines on other days).';
        btn.setAttribute('aria-label', 'All events drawn as filled ribbons. Click for auto mode.');
    } else {
        btn.title = 'Events: auto — long events filled; short events filled on selected day only. Click to force all lines.';
        btn.setAttribute('aria-label', 'Auto: polygon fill for multi-day events; short events use lines except on selected day.');
    }
}

function toggleEventPlotType() {
    const cycle = ['auto', 'lines', 'polygon3d'];
    const idx = cycle.indexOf(globalEventPlotType);
    const next = cycle[(idx < 0 ? 0 : idx + 1) % cycle.length];
    if (typeof window.setGlobalEventPlotType === 'function') {
        window.setGlobalEventPlotType(next);
    }
}

function toggleLongEventContextFadeMode() {
    longEventContextFadeMode = longEventContextFadeMode === 'alpha' ? 'desaturate' : 'alpha';
    updateLongEventContextFadeButton();
    if (typeof refreshEventLayersIfNeeded === 'function') {
        refreshEventLayersIfNeeded(true);
    } else {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        if (gl && typeof gl.refreshAllEventLayers === 'function') {
            try {
                gl.refreshAllEventLayers();
            } catch (err) {
                console.warn('Could not refresh event layers after long-term context fade toggle:', err);
            }
        }
    }
    if (typeof window !== 'undefined' && typeof window.refreshEventsList === 'function') {
        const ep = document.getElementById('event-list-panel');
        if (ep && ep.classList.contains('open')) window.refreshEventsList(false);
    }
}

function toggleCircadianWorldline() {
    const cycle = ['off', 'straightened', 'wrapped'];
    const idx = cycle.indexOf(circadianState);
    circadianState = cycle[(idx + 1) % cycle.length];
    syncCircadianToggleUi();
    createPlanets(currentZoom);
    if (typeof updateFlattenIconVisibility === 'function') updateFlattenIconVisibility();
}

function toggleFocusTarget() {
    focusMidFromLongTermEventClick = false;
    const config = ZOOM_LEVELS[currentZoom];
    const base = config.focusTarget || 'sun';
    const current = focusTargetOverride || base;
    let next;
    if (currentZoom === 6) {
        const cycle = ['moon', 'earth', 'sun', 'mid'];
        const idx = cycle.indexOf(current);
        const i = idx === -1 ? 0 : (idx + 1) % cycle.length;
        next = cycle[i];
    } else if (currentZoom === 7 || currentZoom === 8) {
        const cycle = ['earth', 'mid'];
        const idx = cycle.indexOf(current);
        const i = idx === -1 ? 0 : (idx + 1) % cycle.length;
        next = cycle[i];
    } else if (currentZoom >= 4 && currentZoom <= 5) {
        const cycle = ['earth', 'sun', 'mid'];
        const idx = cycle.indexOf(current);
        const i = idx === -1 ? 0 : (idx + 1) % cycle.length;
        next = cycle[i];
    } else {
        next = current === 'sun' ? 'earth' : 'sun';
    }
    focusTargetOverride = next;
    const focusLabel = document.getElementById('focus-target');
    if (focusLabel) focusLabel.textContent = next.toUpperCase();
    const btn = document.getElementById('focus-toggle');
    if (btn) {
        btn.classList.toggle('active', next === 'earth');
        setButtonPressed(btn, next === 'earth');
        btn.title = `Camera focus: ${next.toUpperCase()} (C)`;
        let aria;
        if (currentZoom === 6) {
            aria = `Cycle camera focus: Moon, Earth, Sun, midpoint Sun–Earth at selected time (currently ${next.toUpperCase()})`;
        } else if (currentZoom === 7 || currentZoom === 8) {
            aria = `Cycle camera focus: Earth, then midpoint between Sun and Earth at selected time (currently ${next.toUpperCase()})`;
        } else if (currentZoom >= 4 && currentZoom <= 5) {
            aria = `Cycle camera focus: Earth, then Sun, then midpoint between Sun and Earth at selected time (currently ${next.toUpperCase()})`;
        } else {
            aria = `Toggle camera focus between Sun and Earth (currently ${next.toUpperCase()})`;
        }
        btn.setAttribute('aria-label', aria);
    }
    createPlanets(currentZoom);
}

function refreshThemeToggleButton() {
    const button = document.getElementById('light-mode-toggle');
    if (!button) return;
    button.classList.toggle('active', appearanceTheme !== 'dark');
    setButtonPressed(button, appearanceTheme !== 'dark');
    const titles = {
        dark: 'Theme: dark (L)',
        light: 'Theme: light (L)',
        sky: 'Theme: sky blue (L)'
    };
    button.title = `${titles[appearanceTheme] || titles.dark} — cycle`;
    button.setAttribute(
        'aria-label',
        `Cycle appearance: dark, light, sky (currently ${appearanceTheme})`
    );
}

function syncAppearanceDerivedState() {
    isLightMode = appearanceTheme === 'light' || appearanceTheme === 'sky';
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('light-mode', appearanceTheme !== 'dark');
        document.body.classList.toggle('sky-theme', appearanceTheme === 'sky');
    }
    refreshThemeToggleButton();
}

function cycleAppearanceTheme() {
    const order = ['dark', 'light', 'sky'];
    const i = Math.max(0, order.indexOf(appearanceTheme));
    appearanceTheme = order[(i + 1) % order.length];
    syncAppearanceDerivedState();

    if (typeof window.parent !== 'undefined' && window.parent !== window.self && window.parent.postMessage) {
        try {
            window.parent.postMessage(
                { type: 'CIRCAEVUM_THEME', lightMode: isLightMode, appearanceTheme },
                '*'
            );
        } catch (e) {}
    }

    if (typeof scene !== 'undefined' && scene && typeof THREE !== 'undefined') {
        scene.background = new THREE.Color(getBackgroundColor(viewMode, appearanceTheme));
    }
    createStarField();
    createPlanets(currentZoom);
}

function toggleLightMode() {
    cycleAppearanceTheme();
}

function removeXRDomQuad() {
    if (xrDomQuadRefreshId != null) {
        cancelAnimationFrame(xrDomQuadRefreshId);
        xrDomQuadRefreshId = null;
    }
    if (xrDomQuad && scene) {
        scene.remove(xrDomQuad);
        if (xrDomQuad.geometry) xrDomQuad.geometry.dispose();
        if (xrDomQuad.material) {
            if (xrDomQuad.material.map) xrDomQuad.material.map.dispose();
            xrDomQuad.material.dispose();
        }
        xrDomQuad = null;
    }
    xrDomQuadTexture = null;
}

function createXRDomQuad() {
    var el = document.getElementById('xr-ui-layer');
    if (!el || !scene || typeof html2canvas === 'undefined') return;
    html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false }).then(function (canvas) {
        if (!scene || xrAdapter && !xrAdapter.isPresenting()) return;
        var width = 1.6;
        var height = 0.9;
        if (xrDomQuad) {
            scene.remove(xrDomQuad);
            if (xrDomQuad.material && xrDomQuad.material.map) xrDomQuad.material.map.dispose();
            if (xrDomQuad.material) xrDomQuad.material.dispose();
            if (xrDomQuad.geometry) xrDomQuad.geometry.dispose();
        }
        if (xrDomQuadTexture) xrDomQuadTexture.dispose();
        xrDomQuadTexture = new THREE.CanvasTexture(canvas);
        xrDomQuadTexture.minFilter = THREE.LinearFilter;
        xrDomQuadTexture.magFilter = THREE.LinearFilter;
        var mat = new THREE.MeshBasicMaterial({
            map: xrDomQuadTexture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95
        });
        var geom = new THREE.PlaneGeometry(width, height);
        xrDomQuad = new THREE.Mesh(geom, mat);
        xrDomQuad.position.set(0, 1.4, -1.2);
        xrDomQuad.renderOrder = 1000;
        scene.add(xrDomQuad);
        console.log('XR: UI panel placed at (0, 1.4, -1.2) in scene');
        var lastRefresh = 0;
        function refreshQuad() {
            if (!xrAdapter || !xrAdapter.isPresenting() || !xrDomQuad) return;
            xrDomQuadRefreshId = requestAnimationFrame(refreshQuad);
            var now = Date.now();
            if (now - lastRefresh < 2000) return;
            lastRefresh = now;
            html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false }).then(function (c) {
                if (xrDomQuad && xrDomQuad.material && xrDomQuad.material.map) {
                    xrDomQuad.material.map.image = c;
                    xrDomQuad.material.map.needsUpdate = true;
                }
            });
        }
        xrDomQuadRefreshId = requestAnimationFrame(refreshQuad);
    }).catch(function (err) {
        console.warn('XR: Could not capture UI for in-scene panel', err);
    });
}

function toggleWebXR() {
    const button = document.getElementById('webxr-toggle');
    
    if (!xrAdapter) {
        console.error('WebXR: XR adapter not initialized');
        return;
    }
    
    if (xrAdapter.isPresenting()) {
        // Exit WebXR
        // Stars stay fixed-size (no change on XR exit)
        if (xrUI) {
            xrUI.hide();
        }
        removeXRDomQuad();
        xrAdapter.exitXR();
        if (xrInputAdapter) {
            xrInputAdapter.cleanup();
        }
        const orbitalPanel = document.querySelector('.info-panel');
        if (orbitalPanel) orbitalPanel.style.display = '';
        button.classList.remove('active');
        setButtonPressed(button, false);
        button.title = 'WebXR';
        button.setAttribute('aria-label', 'Enter WebXR / VR');
    } else {
        // Enter WebXR
        // Hide loading screen immediately when entering VR
        hideLoadingScreen();
        
        const overlayRoot = document.getElementById('xr-ui-layer') || undefined;
        const tryEnterXR = (mode) => xrAdapter.enterXR(mode, { domOverlayRoot: overlayRoot }).then((session) => {
            button.classList.add('active');
            setButtonPressed(button, true);
            button.title = 'Exit VR';
            button.setAttribute('aria-label', 'Exit VR');
            
            // Initialize XR input adapter (controllers/gamepad)
            if (!xrInputAdapter) {
                xrInputAdapter = new XRInputAdapter(xrAdapter, {
                    currentZoom: currentZoom,
                    setZoomLevel: (zoom) => {
                        currentZoom = zoom;
                        createPlanets(currentZoom);
                    },
                    move: (x, z) => {
                        // Movement handled by adapter
                    },
                    rotate: (y) => {
                        // Rotation handled by adapter
                    }
                });
            }
            xrInputAdapter.init(session);
            
            // XR UI panel (zoom slider + icon buttons) for hand tracking / AVP; in windowed mode add to room scene
            if (typeof XRUI !== 'undefined') {
                if (!xrUI) {
                    xrUI = new XRUI(scene, xrAdapter, {
                        setZoomLevel: (zoom) => {
                            currentZoom = zoom;
                            createPlanets(currentZoom);
                        },
                        getZoomLevel: () => currentZoom,
                        iconActions: {
                            markersLines: toggleTimeMarkerLines,
                            markersText: toggleTimeMarkerText,
                            lightMode: toggleLightMode,
                            flatten: toggleFlatten
                        },
                        getLayerState: {
                            markersLines: () => showTimeMarkerLines,
                            markersText: () => showTimeMarkerText,
                            lightMode: () => isLightMode,
                            flatten: () => flattenMode !== 'off'
                        },
                        getEventLayers: () => {
                            const gl = typeof window !== 'undefined' && (window.circaevumGL || (window.getGL && window.getGL()));
                            if (!gl || typeof gl.getLayerIds !== 'function') return [];
                            return gl.getLayerIds().map((id) => {
                                const l = gl.getLayer(id);
                                return {
                                    id,
                                    name: (l && l.name) || id,
                                    visible: l ? l.visible !== false : true,
                                    color: l && l.color != null ? l.color : undefined
                                };
                            });
                        },
                        setEventLayerVisibility: (layerId, visible) => {
                            const gl = typeof window !== 'undefined' && (window.circaevumGL || (window.getGL && window.getGL()));
                            if (gl && typeof gl.setLayerVisibility === 'function') gl.setLayerVisibility(layerId, visible);
                        },
                        getTimeScale: () => xrTimeScale,
                        adjustTimeScale: (delta) => {
                            const d = delta > 0 ? 1 : -1;
                            xrTimeScale = Math.max(XR_TIME_SCALE_MIN, Math.min(XR_TIME_SCALE_MAX, xrTimeScale + d));
                            if (xrUI && typeof xrUI.refreshTimeScaleLabel === 'function') {
                                xrUI.refreshTimeScaleLabel();
                            }
                        },
                        /** Move selected time by xrTimeScale calendar steps (A/D equivalent). */
                        navigateTimeScaled: (direction) => {
                            navigateUnit(direction, xrTimeScale);
                            if (typeof playTickSound === 'function') playTickSound(currentZoom);
                        }
                    });
                }
                const roomScene = xrAdapter.windowedMode ? xrAdapter.getRoomScene() : null;
                xrUI.show(session, roomScene);
            }
            const orbitalPanel = document.querySelector('.info-panel');
            if (orbitalPanel) orbitalPanel.style.display = 'none';
            
            if (xrAdapter.windowedMode && contentCamera && focusPoint && targetCameraPosition) {
                contentCamera.position.set(
                    focusPoint.x + targetCameraPosition.x,
                    focusPoint.y + targetCameraPosition.y,
                    focusPoint.z + targetCameraPosition.z
                );
                contentCamera.up.copy(targetCameraUp || currentCameraUp);
                contentCamera.lookAt(focusPoint);
            }
            
            // Stars are always fixed-size (no XR override needed)
            // if (!xrAdapter.windowedMode) createXRDomQuad(); // hidden for now
        });
        function onXRError(error) {
            console.error('Failed to enter XR:', error);
            const msg = (error && error.message) ? String(error.message) : '';
            const needSecure = typeof window !== 'undefined' && !window.isSecureContext;
            let userMsg = 'Could not start VR. ';
            if (needSecure || /secure|https|insecure/i.test(msg)) {
                userMsg += 'WebXR needs a secure page: use https:// or open from the headset’s browser (e.g. Safari on Vision Pro) at an HTTPS URL.';
            } else if (msg) {
                userMsg += msg;
            } else {
                userMsg += 'Use Safari on the headset (Vision Pro) or ensure the headset is connected and WebXR is enabled in browser settings.';
            }
            alert(userMsg);
        }
        if (xrAdapter.windowedMode) {
            tryEnterXR('immersive-ar').catch(() => tryEnterXR('immersive-vr')).catch(onXRError);
        } else {
            tryEnterXR('immersive-vr').catch(onXRError);
        }
    }
}

// Initialize XR controller input
function initXRControls(session) {
    xrControllers = [];
    
    // Create controller objects for visualization and input
    const controllerModelFactory = new THREE.XRControllerModelFactory();
    
    // Left controller
    const controller1 = renderer.xr.getController(0);
    controller1.addEventListener('connected', (event) => {
        const controller = event.target;
        controller.add(buildController(controller1, 'left'));
        xrControllers.push(controller);
        console.log('WebXR: Left controller connected');
    });
    controller1.addEventListener('disconnected', () => {
        console.log('WebXR: Left controller disconnected');
    });
    scene.add(controller1);
    
    // Right controller
    const controller2 = renderer.xr.getController(1);
    controller2.addEventListener('connected', (event) => {
        const controller = event.target;
        controller.add(buildController(controller2, 'right'));
        xrControllers.push(controller);
        console.log('WebXR: Right controller connected');
    });
    controller2.addEventListener('disconnected', () => {
        console.log('WebXR: Right controller disconnected');
    });
    scene.add(controller2);
}

// Build controller visualization
function buildController(controller, hand) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -0.1)
    ]);
    const material = new THREE.LineBasicMaterial({ color: hand === 'left' ? 0x00ff00 : 0x0000ff });
    return new THREE.Line(geometry, material);
}

// Handle XR controller input (WASD-like movement)
function handleXRInput(frame) {
    if (!xrSession || !sceneContentGroup || !frame) return;
    
    // Get input sources from the session (they're available on the session object)
    const inputSources = xrSession.inputSources || [];
    
    let moveForward = 0;
    let moveRight = 0;
    let rotate = 0;
    
    // Debug: Log input sources
    if (inputSources.length === 0) {
        // Only log once per second to avoid spam
        if (!handleXRInput.lastLogTime || (Date.now() - handleXRInput.lastLogTime) > 1000) {
            console.log('WebXR: No input sources detected. Controllers may not be connected.');
            handleXRInput.lastLogTime = Date.now();
        }
    }
    
    // Process each controller
    for (let i = 0; i < inputSources.length; i++) {
        const inputSource = inputSources[i];
        const gamepad = inputSource.gamepad;
        
        if (!gamepad) {
            console.log(`WebXR: Controller ${i} has no gamepad`);
            continue;
        }
        
        // Determine which hand this controller is (left or right)
        // Quest controllers: handedness can be 'left' or 'right'
        const isLeft = inputSource.handedness === 'left' || (inputSource.handedness === 'none' && i === 0);
        const isRight = inputSource.handedness === 'right' || (inputSource.handedness === 'none' && i === 1);
        
        // Left controller: Movement (thumbstick)
        if (isLeft && gamepad.axes && gamepad.axes.length >= 2) {
            // Left thumbstick: Forward/Back and Left/Right movement
            moveForward = -gamepad.axes[1]; // Y-axis inverted
            moveRight = gamepad.axes[0]; // X-axis
        }
        
        // Right controller: Rotation (thumbstick)
        if (isRight && gamepad.axes && gamepad.axes.length >= 2) {
            // Right thumbstick: Rotation
            rotate = gamepad.axes[0]; // X-axis for rotation
        }
        
        // Debug: Log button presses
        if (gamepad.buttons && gamepad.buttons.length > 0) {
            for (let j = 0; j < gamepad.buttons.length; j++) {
                if (gamepad.buttons[j].pressed) {
                    console.log(`WebXR: Button ${j} pressed on ${inputSource.handedness || 'unknown'} controller`);
                }
            }
        }
    }
    
    // Apply movement (WASD-like)
    // Use frame's elapsed time for accurate deltaTime
    const deltaTime = frame ? (frame.elapsedTime - (handleXRInput.lastTime || 0)) : 0.016;
    handleXRInput.lastTime = frame ? frame.elapsedTime : 0;
    const safeDeltaTime = Math.min(deltaTime, 0.1); // Cap at 100ms to prevent large jumps
    
    // Dead zone for thumbsticks (ignore small movements)
    const deadZone = 0.1;
    if (Math.abs(moveForward) < deadZone) moveForward = 0;
    if (Math.abs(moveRight) < deadZone) moveRight = 0;
    if (Math.abs(rotate) < deadZone) rotate = 0;
    
    // Calculate movement direction based on head rotation (where you're looking)
    // Get head pose for forward direction
    const referenceSpace = xrReferenceSpace || renderer.xr.getReferenceSpace();
    if (referenceSpace && frame) {
        const viewerPose = frame.getViewerPose(referenceSpace);
        if (viewerPose) {
            const headQuaternion = viewerPose.transform.orientation;
            const headEuler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(
                headQuaternion.x, headQuaternion.y, headQuaternion.z, headQuaternion.w
            ));
            const headYaw = headEuler.y; // Y rotation (left/right)
            
            // Move relative to head direction
            const moveX = Math.sin(headYaw) * moveForward + Math.cos(headYaw) * moveRight;
            const moveZ = Math.cos(headYaw) * moveForward - Math.sin(headYaw) * moveRight;
            
            // Update position
            xrPosition.x += moveX * xrMoveSpeed * safeDeltaTime;
            xrPosition.z += moveZ * xrMoveSpeed * safeDeltaTime;
        }
    } else {
        // Fallback: simple movement without head tracking
        const moveX = Math.sin(xrRotation) * moveForward + Math.cos(xrRotation) * moveRight;
        const moveZ = Math.cos(xrRotation) * moveForward - Math.sin(xrRotation) * moveRight;
        xrPosition.x += moveX * xrMoveSpeed * safeDeltaTime;
        xrPosition.z += moveZ * xrMoveSpeed * safeDeltaTime;
    }
    
    // Update rotation
    xrRotation += rotate * xrRotationSpeed * safeDeltaTime;
    
    // Apply position and rotation to scene content group
    // Movement is relative to the scene, so we move the scene opposite to the player
    if (sceneContentGroup) {
        const currentTimeHeight = typeof calculateCurrentDateHeight === 'function' 
            ? calculateCurrentDateHeight() 
            : 2500;
        const eyeLevel = 1.6;
        
        // Position scene: offset by player position (inverse movement)
        // This makes it feel like you're moving through the scene
        sceneContentGroup.position.set(
            -xrPosition.x,
            eyeLevel - currentTimeHeight + xrPosition.y,
            -xrPosition.z
        );
        
        // Optional: Rotate scene around Y-axis based on player rotation
        // sceneContentGroup.rotation.y = -xrRotation;
    }
}

// Cleanup XR controls
function cleanupXRControls() {
    xrControllers = [];
    xrSession = null;
    xrReferenceSpace = null;
    xrPosition.set(0, 0, 0);
    xrRotation = 0;
    if (handleXRInput.lastTime !== undefined) {
        handleXRInput.lastTime = undefined;
    }
}

// Toggle rotation between vertical and horizontal orientation (R key)
/**
 * One calendar step for Shift+A/D: parent zoom unit (coarser than normal A/D at this level).
 * e.g. zoom 7 → week, zoom 8 → day, zoom 5 → month.
 */
function navigateUnitCoarseStep(direction) {
    switch (currentZoom) {
        case 0:
        case 9:
        case 8:
            selectedHourOffset += direction;
            break;
        case 7:
            selectedDayOffset += direction;
            break;
        case 6:
        case 5: {
            const sel = getSelectedDateTime();
            sel.setMonth(sel.getMonth() + direction);
            applySelectedDateToZoomLevel(sel, currentZoom);
            break;
        }
        case 4:
            selectedQuarterOffset += direction;
            break;
        case 3:
            selectedYearOffset += direction;
            break;
        case 2:
            currentYear += direction * 10;
            currentYear = Math.round(currentYear / 10) * 10;
            break;
        case 1:
            currentYear += direction * 100;
            currentYear = Math.round(currentYear / 100) * 100;
            break;
        default:
            break;
    }
}

/** One calendar step at the current zoom (A/D); used internally by navigateUnit. */
function navigateUnitStep(direction, options) {
    if (options && options.coarse) {
        navigateUnitCoarseStep(direction);
        return;
    }
    switch (currentZoom) {
        case 1: // Century view - navigate by 10 years, snap to nearest decade
            currentYear += direction * 10;
            currentYear = Math.round(currentYear / 10) * 10;
            break;

        case 2: // Decade view — one year at a time; window follows (no wrap to the far end)
            currentYear += direction;
            break;

        case 3: // Year view — one quarter at a time; cross year boundary instead of wrapping to Q4/Q1 of the same year
            {
                const sel = getSelectedDateTime();
                sel.setMonth(sel.getMonth() + direction * 3);
                applySelectedDateToZoomLevel(sel, 3);
            }
            break;

        case 4: // Quarter view - navigate months
            currentMonth += direction;

            if (currentMonth < 0) {
                selectedQuarterOffset--;
                currentMonth = 2;
            } else if (currentMonth > 2) {
                selectedQuarterOffset++;
                currentMonth = 0;
            }
            break;

        case 5: // Month view — step by calendar week (+7 days), no index wrap
        case 6: // Lunar zoom — same week-step as month
            {
            const sel = getSelectedDateTime();
            sel.setDate(sel.getDate() + direction * 7);
            applySelectedDateToZoomLevel(sel, currentZoom);
            }
            break;

        case 7: // Week view - navigate days
            currentDayInWeek += direction;

            if (currentDayInWeek < 0) {
                selectedDayOffset--;
                currentDayInWeek = 6;
            } else if (currentDayInWeek > 6) {
                selectedDayOffset++;
                currentDayInWeek = 0;
            }
            break;

        case 8: // Day view — A/D steps one hour (Shift+A/D = one day via navigateUnitCoarseStep)
            currentHourInDay += direction;
            if (currentHourInDay < 0) {
                selectedHourOffset--;
                currentHourInDay = 23;
            } else if (currentHourInDay > 23) {
                selectedHourOffset++;
                currentHourInDay = 0;
            }
            break;

        case 0: // Landing view - navigate hours
        case 9: // Clock view - navigate hours
            currentHourInDay += direction;

            if (currentHourInDay < 0) {
                selectedHourOffset--;
                currentHourInDay = 23;
            } else if (currentHourInDay > 23) {
                selectedHourOffset++;
                currentHourInDay = 0;
            }
            break;
        default:
            break;
    }
}

/**
 * Navigate within the current zoom level's units (A/D keys use one step).
 * @param {number} direction -1 previous, +1 next
 * @param {number} [stepCount=1] repeat steps (capped); XR uses xrTimeScale for multi-step.
 * @param {{ coarse?: boolean }} [options] Shift+A/D: step parent zoom unit (day, week, month, …).
 */
function navigateUnit(direction, stepCount, options) {
    const prevSelected = getSelectedDateTime();
    const n =
        stepCount === undefined || stepCount === null
            ? 1
            : Math.max(1, Math.min(32, Math.floor(Number(stepCount))));
    for (let i = 0; i < n; i++) {
        navigateUnitStep(direction, options);
    }
    clearEventFocusIfSelectedDayChanged(prevSelected, getSelectedDateTime());
    createPlanets(currentZoom);
    if (currentZoom === 0) {
        syncZoom0CameraToSelectedHourHand('delta');
    }
    updateTimeDisplays();
}

function clampCameraRotationPitch() {
    const lim = Math.PI / 2 - 0.0001;
    cameraRotation.x = Math.max(-lim, Math.min(lim, cameraRotation.x));
}

/** Default polar view: nadir tilted toward SELECTED TIME hour-hand direction in XZ (stronger on landing). */
function buildDefaultPolarViewDirection() {
    const v = new THREE.Vector3(0, -1, 0);
    const earthMesh = planetMeshes.find(p => p.userData && p.userData.name === 'Earth');
    const earthDef = PLANET_DATA.find(p => p.name === 'Earth');
    const sel = getSelectedDateTime();
    let hourAngleFromEarth = null;
    if (typeof EarthGlobe !== 'undefined' && earthMesh && EarthGlobe.getDefaultPolarHourAngleXZ) {
        const globeAngle = EarthGlobe.getDefaultPolarHourAngleXZ(earthMesh, sel, earthMesh.position.y, currentZoom);
        if (globeAngle != null && !isNaN(globeAngle)) {
            hourAngleFromEarth = globeAngle;
        }
    }
    if (hourAngleFromEarth == null) {
        let sunToEarthAngle = 0;
        if (earthMesh) {
            sunToEarthAngle = Math.atan2(earthMesh.position.z, earthMesh.position.x);
        } else if (earthDef) {
            sunToEarthAngle = earthDef.startAngle;
        }
        const hourFrac = sceneHourFractionForEarthHand(sel, currentZoom);
        hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
    }
    let baseTilt = 0.24;
    if (currentZoom === 0) {
        // Slightly more downward look toward Earth's center.
        baseTilt = 0.42;
    } else if (currentZoom === 9) {
        // Start zoom 9 almost straight toward Earth's south-pole-facing view.
        baseTilt = 0.035;
    } else if (currentZoom === 8) {
        // Zoom 8 starts with a friendlier oblique Earth view.
        baseTilt = 1.02;
    }
    const hourDirX = Math.cos(hourAngleFromEarth);
    const hourDirZ = Math.sin(hourAngleFromEarth);
    v.set(hourDirX * Math.sin(baseTilt), -Math.cos(baseTilt), hourDirZ * Math.sin(baseTilt));
    return v.normalize();
}

/** Keep polar/landing camera outside opaque Earth (depthWrite on) so the sphere stays visible. */
function ensureSunDirectionalLight() {
    if (sunDirectionalLight || typeof THREE === 'undefined' || !sceneContentGroup) return;
    const sunIllum =
        SCENE_CONFIG.sunLightColor != null ? SCENE_CONFIG.sunLightColor : 0xfff9f2;
    const dirInt =
        SCENE_CONFIG.sunDirectionalIntensity != null ? SCENE_CONFIG.sunDirectionalIntensity : 2.65;
    sunDirectionalLight = new THREE.DirectionalLight(sunIllum, dirInt);
    sunDirectionalTarget = new THREE.Object3D();
    sceneContentGroup.add(sunDirectionalTarget);
    sceneContentGroup.add(sunDirectionalLight);
    sunDirectionalLight.target = sunDirectionalTarget;
}

/** Aim parallel sunlight from Sun position at Earth (day/night terminator on the globe). */
function updateSunLightingTowardEarth() {
    if (!sunDirectionalLight || !sunDirectionalTarget) return;
    const earthMesh = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    if (!earthMesh) return;
    const y = earthMesh.position.y;
    sunDirectionalLight.position.set(0, y, 0);
    sunDirectionalTarget.position.copy(earthMesh.position);
    sunDirectionalTarget.updateMatrixWorld();
    if (sunLight) {
        sunLight.position.set(0, y, 0);
        const sunIllum =
            SCENE_CONFIG.sunLightColor != null ? SCENE_CONFIG.sunLightColor : 0xfff9f2;
        if (sunLight.color.getHex() !== sunIllum) {
            sunLight.color.setHex(sunIllum);
        }
    }
}

/** Camera distance so a sphere of radius R centered at lookAt fits in the FOV. */
function cameraDistanceToFitRadius(radius, fovDeg, padding) {
    if (!(radius > 0)) return null;
    const fov = typeof fovDeg === 'number' && fovDeg > 0 ? fovDeg : BASE_CAMERA_FOV;
    const pad = padding != null && padding > 0 ? padding : 1.22;
    const halfV = (fov * Math.PI) / 360;
    let halfFit = halfV;
    if (typeof camera !== 'undefined' && camera && camera.aspect > 0) {
        const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
        halfFit = Math.min(halfV, halfH);
    }
    const sinH = Math.sin(halfFit);
    if (!(sinH > 1e-6)) return null;
    return (radius * pad) / sinH;
}

/**
 * Frame camera so the whole Context Sphere (Event Horizon) fits in view.
 * Mode 2 uses clipRadius when larger than the week shell (visible veil rim).
 * Call after createPlanets / ensureContextSphereState on zoom change.
 */
function applyCameraDistanceToFitContextSphere(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const config = ZOOM_LEVELS[z];
    const fallback = config && config.distance ? config.distance : 50;
    let dist = fallback;

    if (!contextSphereState || !(contextSphereState.radius > 0)) {
        try {
            ensureContextSphereState(z);
        } catch (e) { /* optional */ }
    }

    if (contextSphereState && contextSphereState.radius > 0) {
        const shellR = contextSphereState.radius;
        const clipR =
            typeof contextSphereState.clipRadius === 'number' &&
            contextSphereState.clipRadius > 0
                ? contextSphereState.clipRadius
                : shellR;
        // Mode 2: fit the veil volume; nest callers (if any) fit the drawn shell.
        const fitR =
            typeof eventHorizonMode === 'string' && eventHorizonMode === 'inside'
                ? Math.max(shellR, clipR)
                : shellR;
        const fov =
            typeof camera !== 'undefined' && camera && typeof camera.fov === 'number'
                ? camera.fov
                : BASE_CAMERA_FOV;
        const pad =
            typeof eventHorizonMode === 'string' && eventHorizonMode === 'inside' ? 1.32 : 1.22;
        const fitted = cameraDistanceToFitRadius(fitR, fov, pad);
        if (fitted != null && isFinite(fitted)) {
            dist = fitted;
        }
        const earthMesh =
            typeof planetMeshes !== 'undefined' && planetMeshes
                ? planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth')
                : null;
        if (earthMesh) {
            const r = resolveEarthGlobeSurfaceRadius(earthMesh);
            dist = Math.max(dist, r * 2.8 + fitR * 0.05);
        }
    }

    zoomFramedCameraDistance = dist;
    targetCameraDistance = dist;
    return dist;
}

/** Wheel / pinch distance limits within one zoom level (Moment allows closer + farther). */
function clampCameraDistanceForZoom(zoomLevel, dist) {
    const config = ZOOM_LEVELS[zoomLevel];
    const base =
        zoomFramedCameraDistance != null && zoomFramedCameraDistance > 0
            ? zoomFramedCameraDistance
            : config && config.distance
              ? config.distance
              : dist;
    if (zoomLevel === 0) {
        return Math.max(base * 0.035, Math.min(base * 6, dist));
    }
    if (zoomLevel === 1) {
        // Century: default is far; allow dolly in to about year-scale to read Earth's helix.
        return Math.max(base * 0.014, Math.min(base * 3, dist));
    }
    if (zoomLevel === 2) {
        // Decade: allow in toward quarter-scale.
        return Math.max(base * 0.08, Math.min(base * 3, dist));
    }
    if (zoomLevel === 9) {
        return Math.max(base * 0.25, Math.min(base * 4.5, dist));
    }
    return Math.max(base * 0.3, Math.min(base * 3, dist));
}

function clampPolarCameraOutsideEarth(offsetFromFocus, focus) {
    const earthMesh = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    if (!earthMesh || !offsetFromFocus || !focus) return;
    const r = resolveEarthGlobeSurfaceRadius(earthMesh);
    const momentZoom = currentZoom === 0;
    const polarRig = isEarthZoomRig(currentZoom);
    const wheelDist =
        typeof targetCameraDistance === 'number' && !isNaN(targetCameraDistance)
            ? targetCameraDistance
            : Math.sqrt(offsetFromFocus.lengthSq() || 1);
    const cfg = ZOOM_LEVELS[currentZoom];
    const cfgDist = cfg && cfg.distance ? cfg.distance : 4.25;

    if (polarRig) {
        const minGlobeStandoff = r + (momentZoom ? 0.02 : 0.5);
        const maxDist = cfgDist * (momentZoom ? 6 : 4.5);
        const targetLen = Math.max(minGlobeStandoff, Math.min(maxDist, wheelDist));
        if (offsetFromFocus.lengthSq() < 1e-10) {
            offsetFromFocus.copy(buildDefaultPolarViewDirection());
        }
        offsetFromFocus.normalize().multiplyScalar(targetLen);

        const center = new THREE.Vector3();
        earthMesh.getWorldPosition(center);
        const camWorld = new THREE.Vector3(
            focus.x + offsetFromFocus.x,
            focus.y + offsetFromFocus.y,
            focus.z + offsetFromFocus.z
        );
        const toCam = camWorld.clone().sub(center);
        const distFromEarth = toCam.length();
        if (distFromEarth < minGlobeStandoff && distFromEarth > 1e-6) {
            toCam.normalize().multiplyScalar(minGlobeStandoff);
            camWorld.copy(center).add(toCam);
            offsetFromFocus.set(camWorld.x - focus.x, camWorld.y - focus.y, camWorld.z - focus.z);
        }
        return;
    }

    const minShell = Math.max(r * 1.85, r + 2.5);
    const minOffsetLen = Math.max(cfgDist, minShell * 0.92);

    if (offsetFromFocus.lengthSq() < minOffsetLen * minOffsetLen) {
        if (offsetFromFocus.lengthSq() < 1e-10) {
            offsetFromFocus.copy(buildDefaultPolarViewDirection());
        }
        offsetFromFocus.normalize().multiplyScalar(minOffsetLen);
    }

    const center = new THREE.Vector3();
    earthMesh.getWorldPosition(center);
    const camWorld = new THREE.Vector3(
        focus.x + offsetFromFocus.x,
        focus.y + offsetFromFocus.y,
        focus.z + offsetFromFocus.z
    );
    const toCam = camWorld.clone().sub(center);
    const dist = toCam.length();
    if (dist < minShell && dist > 1e-6) {
        toCam.normalize().multiplyScalar(minShell);
        camWorld.copy(center).add(toCam);
        offsetFromFocus.set(camWorld.x - focus.x, camWorld.y - focus.y, camWorld.z - focus.z);
    }
}

function getEarthZoomOrbitUpAxis() {
    if (isEarthZoomRig(currentZoom)) {
        const earthMesh = planetMeshes.find(p => p.userData && p.userData.name === 'Earth');
        const earthDef = PLANET_DATA.find(p => p.name === 'Earth');
        let sunToEarthAngle = 0;
        if (earthMesh) {
            sunToEarthAngle = Math.atan2(earthMesh.position.z, earthMesh.position.x);
        } else if (earthDef) {
            sunToEarthAngle = earthDef.startAngle;
        }
        return new THREE.Vector3(
            -Math.cos(sunToEarthAngle),
            0,
            -Math.sin(sunToEarthAngle)
        ).normalize();
    }
    return new THREE.Vector3(0, 1, 0);
}

/** Incremental Earth-zoom orbit: yaw about active up axis, pitch about right axis. */
function applyPolarOrbitDelta(deltaX, deltaY) {
    if (!polarViewDir) return;
    const sens = 0.005;
    const upAxis = getEarthZoomOrbitUpAxis();
    polarViewDir.applyAxisAngle(upAxis, -deltaX * sens);
    const pitchAxis = new THREE.Vector3().crossVectors(upAxis, polarViewDir);
    if (pitchAxis.lengthSq() > 1e-14) {
        pitchAxis.normalize();
        polarViewDir.applyAxisAngle(pitchAxis, -deltaY * sens);
    }
    polarViewDir.normalize();
    // Keep camera from crossing singularity axis (prevents flip/erratic drag).
    const minDot = currentZoom === 8 ? -0.9 : -0.98;
    // 9/0: allow crossing farther toward the illuminated side while still
    // preventing singularity flips near the orbit-up axis.
    const maxDot = currentZoom === 8 ? 0.84 : 0.58;
    const dot = polarViewDir.dot(upAxis);
    if (dot > maxDot || dot < minDot) {
        const clamped = Math.max(minDot, Math.min(maxDot, dot));
        const lateral = new THREE.Vector3().copy(polarViewDir).addScaledVector(upAxis, -dot);
        if (lateral.lengthSq() < 1e-10) {
            polarViewDir.copy(buildDefaultPolarViewDirection());
        } else {
            lateral.normalize().multiplyScalar(Math.sqrt(Math.max(0, 1 - (clamped * clamped))));
            polarViewDir.copy(lateral).addScaledVector(upAxis, clamped).normalize();
        }
    }
}

function toggleTimeRotation() {
    // Cycle through view modes: angled -> top-down -> bottom-up -> angled
    viewMode = (viewMode + 1) % 3;
    
    scene.background = new THREE.Color(getBackgroundColor(viewMode, appearanceTheme));
    
    // Adjust camera rotation based on view mode
    const rotations = [Math.PI / 6, Math.PI / 2, -Math.PI / 2];
    cameraRotation.x = rotations[viewMode];
}

function rotate90Right() {
    if (!scene) return;
    sceneRollTargetRad -= Math.PI / 2;
}

// Helper function to get background color based on view mode and appearance theme
function getBackgroundColor(viewMode, appearance) {
    const vm = viewMode % 3;
    if (appearance === 'sky') {
        return [
            0xa8d4f0, // angled — clear sky blue
            0xbfe4f8, // top-down — lighter zenith
            0x9ec9eb // bottom-up — slightly deeper
        ][vm];
    }
    if (appearance === 'light') {
        return [0xe8f4f8, 0xf8e8e8, 0xe8e8f8][vm];
    }
    return [0x000814, 0x140808, 0x080814][vm];
}

function setZoomLevel(level, overrideDate) {
    // CRITICAL: Get selected date BEFORE changing currentZoom (or use override when navigating to a specific event)
    const selectedDate = overrideDate instanceof Date ? overrideDate : getSelectedDateTime();

    const prevZoom = currentZoom;
    const prevPolar = isEarthZoomRig(prevZoom);

    // Now change the zoom level
    currentZoom = level;
    if (Array.isArray(worldlines)) {
        worldlines.forEach((w) => {
            if (w) w.visible = isWorldlineVisibleForZoom(level);
        });
    }
    syncWorldlinesToggleButton();
    ensureCircadianOnForZoom(level);
    const nextPolar = isEarthZoomRig(level);
    if (nextPolar && !prevPolar) {
        needPolarOrbitInit = true;
    }
    if (level === 9 && prevZoom !== 9) {
        forcePolarDefaultOnInit = true;
        needPolarOrbitInit = true;
    }
    if (level === 0 && prevZoom !== 0) {
        forcePolarDefaultOnInit = true;
        needPolarOrbitInit = true;
        zoom0LastHourAngleXZ = null;
    }
    if (!nextPolar) {
        needPolarOrbitInit = true;
        forcePolarDefaultOnInit = false;
        zoom0LastHourAngleXZ = null;
    }
    if (focusTargetOverride === 'mid' && !keepMidFocusOverrideAtZoom(level)) {
        focusTargetOverride = null;
    }
    if (level !== 6 && focusTargetOverride === 'moon') {
        focusTargetOverride = null;
    }
    if (!focusSunAllowedAtZoom(level) && focusTargetOverride === 'sun') {
        focusTargetOverride = null;
    }
    const config = ZOOM_LEVELS[level];
    
    // Play transition sound
    if (typeof playTransitionSound === 'function') {
        playTransitionSound();
    }
    
    const landingPage = document.getElementById('landing-page');
    const hud = document.getElementById('hud');
    const controls = document.querySelector('.controls');
    
    // Keep zoom HUD (controls) visible even in Zoom 0; body class used for z-index in CSS
    document.body.classList.toggle('zoom-level-0', level === 0);
    
    // Landing/About overlay:
    // - Zoom 0 should NOT automatically open the About/landing overlay.
    // - The overlay is toggled explicitly via the hamburger menu ("About").
    // - Any non-zero zoom closes the overlay.
    // About overlay is toggled from the menu only (not tied to zoom 0). Zoom changes via bar/keys close it.
    if (landingPage) {
        landingPage.classList.remove('active');
    }
    if (controls) {
        controls.style.top = 'auto';
        controls.style.bottom = '30px';
    }
    
    // Set target camera distance for smooth transition (classic ZOOM_LEVELS.distance).
    targetCameraDistance = config.distance;
    zoomFramedCameraDistance = null;

    // Unwind any Zoom-0 telephoto magnification when changing zoom band.
    if (camera && Math.abs(camera.fov - BASE_CAMERA_FOV) > 1e-3) {
        camera.fov = BASE_CAMERA_FOV;
        camera.updateProjectionMatrix();
    }
    
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    document.getElementById('current-zoom').textContent = config.name;
    document.getElementById('time-span').textContent = config.span;
    document.getElementById('focus-target').textContent = effectiveFocusTarget.toUpperCase();
    document.getElementById('worldline-height').textContent = (config.timeYears * 100).toFixed(1) + ' AU';
    
    document.querySelectorAll('.zoom-option').forEach(opt => {
        const selected = parseInt(opt.dataset.zoom) === level;
        opt.classList.toggle('active', selected);
        opt.setAttribute('aria-checked', selected ? 'true' : 'false');
        opt.setAttribute('tabindex', selected ? '0' : '-1');
    });
    
    // Update mobile zoom label
    const mobileZoomLabel = document.getElementById('mobile-zoom-label');
    if (mobileZoomLabel) {
        mobileZoomLabel.textContent = config.name;
    }
    
    // Preserve selected time across zoom levels by converting the selected date
    // to the new zoom level's offset system
    applySelectedDateToZoomLevel(selectedDate, level);
    
    // Update TimeMarkers module with new offsets
    if (typeof TimeMarkers !== 'undefined' && TimeMarkers.updateOffsets) {
        TimeMarkers.updateOffsets({
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            selectedHourOffset,
            selectedLunarOffset, // Needed for Zoom 6 lunar calculation
            currentYear, // Needed for Zoom 1 and 2 year highlighting
            currentMonthInYear,
            currentMonth,
            currentQuarter,
            currentWeekInMonth,
            currentDayInWeek,
            currentDayOfMonth,
            currentHourInDay
        });
    }
    
    createStarField(); // Update star visibility based on zoom level
    createPlanets(currentZoom);
    updateTimeDisplays(); // Update time displays after zoom change
    updateFlattenIconVisibility();

    const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
    if (!eventsRefreshedDuringCreatePlanets && gl && typeof gl.refreshAllEventLayers === 'function') {
        const wasMonthPlus = prevZoom >= 5;
        const isMonthPlus = level >= 5;
        if (wasMonthPlus !== isMonthPlus || isMonthPlus) {
            try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
        }
    }
    if (typeof window.refreshEventsList === 'function') {
        const ep = document.getElementById('events-panel');
        if (ep && ep.classList.contains('open')) window.refreshEventsList(false);
    }
}

function selectedCalendarDayKey(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

/**
 * Geometry-need key for calendar event layers (not Garmin — that has its own refresh key).
 * Include anything that changes ribbon/outline topology or day-frame placement.
 */
function buildEventLayersRebuildKey(zoomLevel) {
    const zl = zoomLevel != null ? zoomLevel : currentZoom;
    const sel = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
    const dayKey = selectedCalendarDayKey(sel) || 'x';
    let needGhost = 0;
    try {
        if (typeof computeSceneDateHeights === 'function') {
            const h = computeSceneDateHeights(zl);
            if (h && Math.abs(h.selectedHeightOffset) > 1e-6 && !tourMinimalOrbitMode) needGhost = 1;
        }
    } catch (e) { /* heights optional during boot */ }
    const shift =
        typeof circadianShortEventsShiftPreview !== 'undefined' &&
        circadianShortEventsShiftPreview &&
        !modifierMetaHeld
            ? 1
            : 0;
    let parentKey = 'x';
    try {
        if (typeof getParentUnitTimeBoundsMs === 'function') {
            const pb = getParentUnitTimeBoundsMs(zl);
            if (pb) parentKey = (pb.unit || 'u') + ':' + pb.t0 + ':' + pb.t1;
        }
    } catch (e) { /* optional */ }
    return [
        zl,
        dayKey,
        parentKey,
        needGhost,
        showAllTimelineEvents ? 1 : 0,
        circadianShortEventScope || 'year',
        globalEventPlotType || 'auto',
        longEventContextFadeMode || 'alpha',
        Math.round((typeof offSelectedTimeLineDimStrength === 'number' ? offSelectedTimeLineDimStrength : 1) * 100),
        shift,
        circadianState || 'off',
        tourMinimalOrbitMode ? 1 : 0,
        typeof steWindowMonths === 'number' ? steWindowMonths : 2,
        typeof eventHorizonHalfDays === 'number' ? eventHorizonHalfDays : 7,
        typeof eventHorizonWarpOuterHalfDays === 'number' ? eventHorizonWarpOuterHalfDays : 9,
        typeof eventHorizonMode === 'string' ? eventHorizonMode : 'nest'
    ].join('|');
}

function noteEventLayersRebuilt(zoomLevel) {
    lastEventLayersRebuildKey = buildEventLayersRebuildKey(zoomLevel);
}
if (typeof window !== 'undefined') {
    window.noteEventLayersRebuilt = noteEventLayersRebuilt;
    window.invalidateEventLayersRebuildKey = invalidateEventLayersRebuildKey;
    window.refreshEventLayersIfNeeded = refreshEventLayersIfNeeded;
}

function invalidateEventLayersRebuildKey() {
    lastEventLayersRebuildKey = null;
}

/**
 * @param {boolean} [force]
 * @returns {boolean} true if refresh ran
 */
function refreshEventLayersIfNeeded(force) {
    const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
    if (!gl || typeof gl.refreshAllEventLayers !== 'function') return false;
    const key = buildEventLayersRebuildKey(currentZoom);
    if (!force && key === lastEventLayersRebuildKey) return false;
    try {
        gl.refreshAllEventLayers();
        lastEventLayersRebuildKey = key;
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Same-calendar-day time scrub: move planets/focus/short STEs without tearing down the scene
 * or rebuilding every event ribbon. Day change → false (caller should full createPlanets).
 */
function tryLightSelectedTimeSceneUpdate(prevDate) {
    if (tourMinimalOrbitMode) return false;
    if (typeof PLANET_DATA === 'undefined' || !PLANET_DATA.length) return false;
    if (planetMeshes.length !== expectedVisiblePlanetCount(currentZoom)) return false;
    if (orbitLines.length !== planetMeshes.length) return false;
    const nextDate = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : null;
    if (selectedCalendarDayKey(prevDate) !== selectedCalendarDayKey(nextDate)) return false;
    if (typeof applyLightTimeScrubUpdate !== 'function') return false;
    return !!applyLightTimeScrubUpdate(currentZoom);
}

/** Drop STE/event focus when SELECTED TIME moves to another calendar day. */
function clearEventFocusIfSelectedDayChanged(prevDate, nextDate) {
    const a = selectedCalendarDayKey(prevDate);
    const b = selectedCalendarDayKey(nextDate);
    if (a == null || b == null || a === b) return;
    if (typeof window.clearEventFocus === 'function') window.clearEventFocus();
}

// Set the selected date/time without changing the current zoom level.
// Used by external consumers (e.g. CircaevumGL.navigateToTime) so that
// the Orbital Data panel, Earth position, and time markers all snap to
// a specific date.
function setSelectedDateTime(date) {
    const targetDate = date instanceof Date ? date : new Date(date);
    if (!targetDate || isNaN(targetDate.getTime())) return;

    const prevSelected = getSelectedDateTime();

    if (typeof applySelectedDateToZoomLevel === 'function') {
        applySelectedDateToZoomLevel(targetDate, currentZoom);
    }

    clearEventFocusIfSelectedDayChanged(prevSelected, getSelectedDateTime());

    if (typeof TimeMarkers !== 'undefined' && TimeMarkers.updateOffsets) {
        TimeMarkers.updateOffsets({
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            selectedHourOffset,
            selectedLunarOffset,
            currentYear,
            currentMonthInYear,
            currentMonth,
            currentQuarter,
            currentWeekInMonth,
            currentDayInWeek,
            currentDayOfMonth,
            currentHourInDay
        });
    }

    const lightTourOk =
        tourNarrativeLightMode &&
        !tourMinimalOrbitMode &&
        typeof PLANET_DATA !== 'undefined' &&
        planetMeshes.length === PLANET_DATA.length &&
        orbitLines.length === PLANET_DATA.length;

    if (lightTourOk && typeof applyLightTimeScrubUpdate === 'function' && applyLightTimeScrubUpdate(currentZoom)) {
        const wlProg =
            typeof tourWorldlineRevealProgress === 'number' &&
            !isNaN(tourWorldlineRevealProgress) &&
            tourWorldlineRevealProgress >= 0 &&
            tourWorldlineRevealProgress <= 1 &&
            tourNarrativeShaderWorldlinesActive;
        if (wlProg && typeof Worldlines !== 'undefined' && typeof Worldlines.setNarrativeClipYMax === 'function') {
            const heights = computeSceneDateHeights(currentZoom);
            const sel = getSelectedDateTime();
            const hJan = calculateDateHeight(sel.getFullYear(), 0, 1, 0);
            const span = Math.max(0.001, heights.selectedDateHeight - hJan);
            const p = Math.max(0, Math.min(1, tourWorldlineRevealProgress));
            Worldlines.setNarrativeClipYMax(worldlines, hJan + span * p);
        }
        if (tourFlatCalendarStrip && typeof window.circaevumTourCalendarStripRefresh === 'function') {
            try {
                window.circaevumTourCalendarStripRefresh(targetDate.getTime());
            } catch (e) { /* ignore */ }
        }
        const markerThrottleMs = 260;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (wlProg) {
            // Shader clip only; skip full scene rebuild
        } else if (tourOrbitMarkersFromCalendar) {
            if (now - tourSceneLightRebuildLast >= markerThrottleMs) {
                tourSceneLightRebuildLast = now;
                if (typeof createPlanets === 'function') {
                    createPlanets(currentZoom);
                }
            }
        } else if (
            typeof tourWorldlineRevealProgress === 'number' &&
            !isNaN(tourWorldlineRevealProgress) &&
            tourWorldlineRevealProgress >= 0 &&
            tourWorldlineRevealProgress <= 1 &&
            !tourNarrativeShaderWorldlinesActive
        ) {
            if (typeof createPlanets === 'function') {
                createPlanets(currentZoom);
            }
        }
        if (typeof updateTimeDisplays === 'function') {
            updateTimeDisplays();
        }
        return;
    }

    // Normal UI scrub: same-day light path (planets + short STEs) — no full event ribbon rebuild.
    if (tryLightSelectedTimeSceneUpdate(prevSelected)) {
        if (typeof updateTimeDisplays === 'function') {
            updateTimeDisplays();
        }
        return;
    }

    if (typeof createPlanets === 'function') {
        createPlanets(currentZoom);
    }
    if (typeof updateTimeDisplays === 'function') {
        updateTimeDisplays();
    }
}

// --- Intro / scripted tour hooks (used by presentation/intro-tour.js) ---
if (typeof window !== 'undefined') {
    window.clearTourNarrativeSceneFlags = clearTourNarrativeSceneFlags;
    /**
     * Single-frame tour clock: optional worldline reveal progress (0–1) then selected date.
     * Keeps narrative date and shader clip in sync without reordering applyScene vs setTimeMs.
     */
    window.applyCircaevumTourStoryFrame = function (ms, wlProgressOpt) {
        if (typeof wlProgressOpt === 'number' && !isNaN(wlProgressOpt)) {
            tourWorldlineRevealProgress = Math.max(0, Math.min(1, wlProgressOpt));
        }
        setSelectedDateTime(new Date(ms));
    };
    window.applyCircaevumTourScene = function (partial) {
        if (!partial || typeof partial !== 'object') return;
        if ('focusTarget' in partial) {
            const v = partial.focusTarget;
            focusTargetOverride = v == null || v === 'default' || v === 'auto' ? null : v;
        }
        if ('showFullYearTimeMarkers' in partial) {
            showFullYearTimeMarkers = !!partial.showFullYearTimeMarkers;
            const btn = document.getElementById('markers-year-toggle');
            if (btn) {
                btn.classList.toggle('active', showFullYearTimeMarkers);
                setButtonPressed(btn, showFullYearTimeMarkers);
            }
        }
        if ('showTimeMarkerLines' in partial) {
            showTimeMarkerLines = !!partial.showTimeMarkerLines;
            const btn = document.getElementById('markers-lines-toggle');
            if (btn) {
                btn.classList.toggle('active', showTimeMarkerLines);
                setButtonPressed(btn, showTimeMarkerLines);
            }
        }
        if ('showTimeMarkerText' in partial) {
            showTimeMarkerText = !!partial.showTimeMarkerText;
            const btn = document.getElementById('markers-text-toggle');
            if (btn) {
                btn.classList.toggle('active', showTimeMarkerText);
                setButtonPressed(btn, showTimeMarkerText);
            }
        }
        if ('tourMinimalOrbitMode' in partial) {
            tourMinimalOrbitMode = !!partial.tourMinimalOrbitMode;
        }
        if ('tourYearMarkerReveal' in partial) {
            tourYearMarkerReveal =
                partial.tourYearMarkerReveal == null || partial.tourYearMarkerReveal === ''
                    ? null
                    : Number(partial.tourYearMarkerReveal);
            if (Number.isNaN(tourYearMarkerReveal)) tourYearMarkerReveal = null;
        }
        if ('tourWorldlineRevealProgress' in partial) {
            tourWorldlineRevealProgress =
                partial.tourWorldlineRevealProgress == null || partial.tourWorldlineRevealProgress === ''
                    ? null
                    : Number(partial.tourWorldlineRevealProgress);
            if (Number.isNaN(tourWorldlineRevealProgress)) tourWorldlineRevealProgress = null;
        }
        if ('tourHideAllTimeMarkers' in partial) {
            tourHideAllTimeMarkers = !!partial.tourHideAllTimeMarkers;
        }
        if ('tourOrbitMarkersFromCalendar' in partial) {
            tourOrbitMarkersFromCalendar = !!partial.tourOrbitMarkersFromCalendar;
        }
        if ('tourSolsticeCrossActive' in partial) {
            tourSolsticeCrossActive = !!partial.tourSolsticeCrossActive;
        }
        if ('tourNarrativeLightMode' in partial) {
            tourNarrativeLightMode = !!partial.tourNarrativeLightMode;
        }
        if ('tourFlatCalendarStrip' in partial) {
            tourFlatCalendarStrip = !!partial.tourFlatCalendarStrip;
        }
        if ('tourMarkerDensityOverride' in partial) {
            const o = partial.tourMarkerDensityOverride;
            tourMarkerDensityOverride = o == null || o === '' ? null : String(o);
        }
        if ('tourPlanetOrbitRingOpacityMul' in partial) {
            const v = Number(partial.tourPlanetOrbitRingOpacityMul);
            tourPlanetOrbitRingOpacityMul = Number.isNaN(v) ? 1 : Math.max(0, Math.min(1, v));
        }
        if ('tourWorldlineOpacityMul' in partial) {
            const v = Number(partial.tourWorldlineOpacityMul);
            tourWorldlineOpacityMul = Number.isNaN(v) ? 1 : Math.max(0, Math.min(1, v));
        }
        if ('tourContextArcVisible' in partial) {
            tourContextArcVisible = partial.tourContextArcVisible !== false;
        }
        if ('moonLayer' in partial) {
            showMoonLayer = !!partial.moonLayer;
            syncMoonLayerButton();
            const moonBtn = document.getElementById('moon-layer-toggle');
            if (moonBtn) {
                moonBtn.title = showMoonLayer
                    ? 'Moon & lunar path (M)'
                    : 'Moon & lunar path: hidden (M)';
                moonBtn.setAttribute(
                    'aria-label',
                    showMoonLayer
                        ? 'Hide Moon mesh and lunar worldline (M)'
                        : 'Show Moon mesh and lunar worldline (M)'
                );
            }
        }
        if ('dayFrameLteSky' in partial) {
            setShowDayFrameLteSky(!!partial.dayFrameLteSky);
        }
        if (partial.cameraRotation && typeof window.cameraRotation === 'object') {
            const c = partial.cameraRotation;
            if (typeof c.x === 'number') {
                window.cameraRotation.x = c.x;
                clampCameraRotationPitch();
            }
            if (typeof c.y === 'number') window.cameraRotation.y = c.y;
        }
        const focusLabel = document.getElementById('focus-target');
        const config = typeof ZOOM_LEVELS !== 'undefined' ? ZOOM_LEVELS[currentZoom] : null;
        const eff = focusTargetOverride || (config && config.focusTarget) || 'sun';
        if (focusLabel) focusLabel.textContent = String(eff).toUpperCase();
        const focusBtn = document.getElementById('focus-toggle');
        if (focusBtn) focusBtn.classList.toggle('active', eff === 'earth');

        const _camOnlyKeys = Object.keys(partial);
        if (
            partial.tourCameraOnly === true &&
            _camOnlyKeys.length > 0 &&
            _camOnlyKeys.every((k) => k === 'tourCameraOnly' || k === 'cameraRotation')
        ) {
            return;
        }

        const partialKeys = Object.keys(partial);
        const lightweightSceneKeys = new Set([
            'tourWorldlineRevealProgress',
            'cameraRotation',
            'tourPlanetOrbitRingOpacityMul',
            'tourWorldlineOpacityMul',
            'tourContextArcVisible'
        ]);
        const onlyLightweightScenePatch =
            partialKeys.length > 0 && partialKeys.every((k) => lightweightSceneKeys.has(k));
        if (onlyLightweightScenePatch) {
            if ('tourPlanetOrbitRingOpacityMul' in partial || 'tourWorldlineOpacityMul' in partial) {
                applyTourSceneOpacityOverrides();
            }
            if ('tourContextArcVisible' in partial) {
                updateListHorizonEarthRing(currentZoom);
            }
            if (
                'tourWorldlineRevealProgress' in partial &&
                tourNarrativeShaderWorldlinesActive &&
                typeof Worldlines !== 'undefined' &&
                typeof Worldlines.setNarrativeClipYMax === 'function'
            ) {
                const sel = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
                const heights = computeSceneDateHeights(currentZoom);
                const hJan = calculateDateHeight(sel.getFullYear(), 0, 1, 0);
                const span = Math.max(0.001, heights.selectedDateHeight - hJan);
                const p =
                    typeof tourWorldlineRevealProgress === 'number' && !isNaN(tourWorldlineRevealProgress)
                        ? Math.max(0, Math.min(1, tourWorldlineRevealProgress))
                        : 0;
                Worldlines.setNarrativeClipYMax(worldlines, hJan + span * p);
            }
            return;
        }

        if (typeof createPlanets === 'function') createPlanets(currentZoom);
    };

    window.captureCircaevumTourSnapshot = function () {
        const sel = typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
        return {
            zoom: currentZoom,
            focusTargetOverride,
            showFullYearTimeMarkers,
            showTimeMarkerLines,
            showTimeMarkerText,
            tourMinimalOrbitMode: !!tourMinimalOrbitMode,
            tourYearMarkerReveal: tourYearMarkerReveal == null ? null : tourYearMarkerReveal,
            tourPlanetOrbitRingOpacityMul,
            tourWorldlineOpacityMul,
            tourContextArcVisible: tourContextArcVisible !== false,
            showMoonLayer: !!showMoonLayer,
            showDayFrameLteSky: !!showDayFrameLteSky,
            cameraRotation:
                typeof window.cameraRotation === 'object' && window.cameraRotation
                    ? { x: window.cameraRotation.x, y: window.cameraRotation.y }
                    : null,
            selectedTime: sel instanceof Date && !isNaN(sel.getTime()) ? sel.toISOString() : new Date().toISOString()
        };
    };

    window.restoreCircaevumTourSnapshot = function (snap) {
        if (!snap || typeof snap !== 'object') return;
        clearTourNarrativeSceneFlags();
        if (typeof snap.zoom === 'number' && typeof setZoomLevel === 'function') {
            setZoomLevel(snap.zoom);
        }
        if (typeof snap.selectedTime === 'string' && typeof setSelectedDateTime === 'function') {
            setSelectedDateTime(new Date(snap.selectedTime));
        }
        window.applyCircaevumTourScene({
            focusTarget: snap.focusTargetOverride === undefined ? 'default' : snap.focusTargetOverride,
            showFullYearTimeMarkers: !!snap.showFullYearTimeMarkers,
            showTimeMarkerLines: snap.showTimeMarkerLines !== false,
            showTimeMarkerText: snap.showTimeMarkerText !== false,
            tourMinimalOrbitMode: snap.tourMinimalOrbitMode === true,
            tourYearMarkerReveal: 'tourYearMarkerReveal' in snap ? snap.tourYearMarkerReveal : null,
            tourPlanetOrbitRingOpacityMul:
                typeof snap.tourPlanetOrbitRingOpacityMul === 'number' ? snap.tourPlanetOrbitRingOpacityMul : 1,
            tourWorldlineOpacityMul:
                typeof snap.tourWorldlineOpacityMul === 'number' ? snap.tourWorldlineOpacityMul : 1,
            tourContextArcVisible: snap.tourContextArcVisible !== false,
            moonLayer: snap.showMoonLayer !== false,
            dayFrameLteSky: snap.showDayFrameLteSky !== false,
            cameraRotation: snap.cameraRotation || undefined
        });
    };
}

/** Smoothly animates SELECTED TIME from current selection to target (e.g. Moon phase click). */
let isSmoothNavigatingTime = false;
let smoothTimeRaf = 0;

function cancelSmoothNavigateToTime() {
    if (smoothTimeRaf) {
        cancelAnimationFrame(smoothTimeRaf);
        smoothTimeRaf = 0;
    }
    isSmoothNavigatingTime = false;
}

function easeSmoothTime(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function refreshMoonWorldlineAfterTimeJump() {
    try {
        if (typeof window.circaevumGL !== 'undefined' && window.circaevumGL) {
            if (isMoonWorldlineVisibleAtZoom(currentZoom) &&
                typeof window.circaevumGL.refreshMoonWorldline === 'function') {
                window.circaevumGL.refreshMoonWorldline();
            } else if (typeof window.circaevumGL.clearMoonWorldline === 'function') {
                window.circaevumGL.clearMoonWorldline();
            }
        }
    } catch (e) {
        /* optional GL wrapper */
    }
}

/**
 * Ease SELECTED TIME to target. Space uses snapToLivePresent so the end
 * tracks wall-clock now (no same-day snap, no polar reseed).
 */
function smoothNavigateToTime(targetDate, durationMs, snapToLivePresent) {
    const want = targetDate instanceof Date ? targetDate : new Date(targetDate);
    if (!want || isNaN(want.getTime())) return;

    cancelSmoothNavigateToTime();

    const startDate = getSelectedDateTime();
    const startMs = startDate.getTime();
    const liveEnd = function () {
        return snapToLivePresent ? Date.now() : want.getTime();
    };
    clearEventFocusIfSelectedDayChanged(startDate, new Date(liveEnd()));

    const spanMs = Math.abs(liveEnd() - startMs);
    if (spanMs < 80) {
        if (snapToLivePresent) {
            applySelectedTimeToScene(syncSelectionToWallClockNow());
        } else {
            applySelectedTimeToScene(want);
        }
        refreshMoonWorldlineAfterTimeJump();
        return;
    }

    const dur = durationMs != null
        ? durationMs
        : Math.min(1600, Math.max(520, 480 + Math.min(spanMs / 86400000, 365) * 3));

    isSmoothNavigatingTime = true;
    const t0 = performance.now();

    function step(now) {
        const u = Math.min(1, (now - t0) / dur);
        const d = new Date(startMs + (liveEnd() - startMs) * easeSmoothTime(u));
        applySelectedTimeToScene(d);
        if (u < 1) {
            smoothTimeRaf = requestAnimationFrame(step);
            return;
        }
        cancelSmoothNavigateToTime();
        if (snapToLivePresent) {
            applySelectedTimeToScene(syncSelectionToWallClockNow());
        } else {
            applySelectedTimeToScene(want);
        }
        refreshMoonWorldlineAfterTimeJump();
    }
    smoothTimeRaf = requestAnimationFrame(step);
}

if (typeof window !== 'undefined') {
    window.smoothNavigateToTime = smoothNavigateToTime;
    /** True while selected-time easing is running (avoid heavy DOM work e.g. Events List). */
    window.isSmoothNavigateToTimeActive = function () {
        return !!isSmoothNavigatingTime;
    };
}

/**
 * Nudge SELECTED TIME by wall-clock milliseconds (works at any zoom; recalculates offset grid).
 * Use for steps smaller than navigateUnit (e.g. hour in week view, quarter-hour on day view).
 */
function nudgeSelectedWallTime(deltaMs) {
    const d = typeof deltaMs === 'number' && !isNaN(deltaMs) ? deltaMs : 0;
    if (d === 0) return;
    const prevSelected = getSelectedDateTime();
    const next = getSelectedDateTime();
    next.setTime(next.getTime() + d);
    applySelectedDateToZoomLevel(next, currentZoom);
    clearEventFocusIfSelectedDayChanged(prevSelected, getSelectedDateTime());
    if (typeof TimeMarkers !== 'undefined' && TimeMarkers.updateOffsets) {
        TimeMarkers.updateOffsets({
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            selectedHourOffset,
            selectedLunarOffset,
            currentYear,
            currentMonthInYear,
            currentMonth,
            currentQuarter,
            currentWeekInMonth,
            currentDayInWeek,
            currentDayOfMonth,
            currentHourInDay
        });
    }
    if (!tryLightSelectedTimeSceneUpdate(prevSelected)) {
        createPlanets(currentZoom);
    }
    if (currentZoom === 0) {
        syncZoom0CameraToSelectedHourHand('delta');
    }
    updateTimeDisplays();
}

if (typeof window !== 'undefined') {
    window.nudgeSelectedWallTime = nudgeSelectedWallTime;
}

function getFocusPoint() {
    const config = ZOOM_LEVELS[currentZoom];
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    
    // Set vertical offset based on zoom level (match Sun/planets at SELECTED TIME, not Jan 1 of currentYear)
    let verticalOffset = 0;
    if (currentZoom === 1) {
        verticalOffset = getHeightForYear(2050, 1);
    } else {
        const sel = getSelectedDateTime();
        verticalOffset = calculateDateHeight(
            sel.getFullYear(),
            sel.getMonth(),
            sel.getDate(),
            sel.getHours()
        );
    }
    
    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        const earthPlanet = planetMeshes.find(p => p.userData.name === 'Earth');
        if (earthPlanet) {
            const earthPos = earthPlanet.position.clone();
            earthPos.y = verticalOffset;
            if (currentZoom === 0 && effectiveFocusTarget === 'earth') {
                const sel = getSelectedDateTime();
                const rSurf = resolveEarthGlobeSurfaceRadius(earthPlanet);
                const fp = getEarthHourHandZoom0FocusPoint(
                    { x: earthPos.x, z: earthPos.z },
                    verticalOffset,
                    sel,
                    rSurf
                );
                return new THREE.Vector3(fp.x, fp.y, fp.z);
            }
            if (effectiveFocusTarget === 'mid') {
                const midFrac = getFocusMidRadialFrac(currentZoom);
                return new THREE.Vector3(earthPos.x * midFrac, earthPos.y, earthPos.z * midFrac);
            }
            return earthPos;
        }
    }

    if (effectiveFocusTarget === 'moon') {
        const earthPlanet = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
        const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;
        const sel = getSelectedDateTime();
        if (MM && typeof MM.moonXZPedagogicalFromEarthMesh === 'function' && earthPlanet) {
            let refH = verticalOffset;
            try {
                refH = computeSceneDateHeights(currentZoom).currentDateHeight;
            } catch (eRef) { /* use verticalOffset */ }
            const mxz = MM.moonXZPedagogicalFromEarthMesh(
                earthPlanet,
                sel,
                null,
                refH,
                verticalOffset
            );
            return new THREE.Vector3(mxz.x, verticalOffset, mxz.z);
        }
    }

    return new THREE.Vector3(0, verticalOffset, 0);
}

function updateHourHandMarkerPulse(time) {
    if (!earthHandMarkerCurrent && !earthHandMarkerSelected) return;
    const pulseOpacity = 0.9;
    [earthHandMarkerCurrent, earthHandMarkerSelected].forEach((marker) => {
        if (!marker) return;
        marker.scale.set(1, 1, 1);
        marker.traverse((child) => {
            if (child && child.material && typeof child.material.opacity === 'number') {
                child.material.opacity = pulseOpacity;
            }
        });
    });
}

function applyCircadianEventNameBillboards(root, camRef) {
    if (typeof CircaevumWebGPUPipeline !== 'undefined' && CircaevumWebGPUPipeline.GPU_UNIFORMS && CircaevumWebGPUPipeline.GPU_UNIFORMS.isWebGPUActive.value) {
        return;
    }
    if (!root || !camRef || !root.traverse) return;
    root.traverse((obj) => {
        if (!obj || !obj.userData || obj.userData.circadianBillboardLabel !== true) return;
        if (typeof obj.quaternion !== 'undefined' && camRef.quaternion) {
            obj.quaternion.copy(camRef.quaternion);
        }
    });
}

function animate(time, frame) {
    time += 0.01;
    
    // Handle XR input if in VR mode (using adapter system)
    if (xrAdapter && xrAdapter.isPresenting() && frame) {
        if (xrInputAdapter) {
            xrInputAdapter.handleInput(frame);
        }
        if (xrUI) {
            xrUI.update(frame);
        }
    }
    
    function getEventNameLabelScaleMultiplier(labelObj, selectedMs) {
        if (!labelObj || !labelObj.userData || !labelObj.userData.isEventNameLabel) return 1;
        const s = Number(labelObj.userData.labelStartMs);
        const eRaw = Number(labelObj.userData.labelEndMs);
        if (!isFinite(s) || !isFinite(selectedMs)) return 1;
        const e = isFinite(eRaw) && eRaw >= s ? eRaw : s;
        let sep = 0;
        if (selectedMs < s) sep = s - selectedMs;
        else if (selectedMs > e) sep = selectedMs - e;
        const closeMs = 3 * 24 * 60 * 60 * 1000;
        const farMs = 60 * 24 * 60 * 60 * 1000;
        let t;
        if (sep <= closeMs) t = 0;
        else if (sep >= farMs) t = 1;
        else t = (sep - closeMs) / (farMs - closeMs);
        // Name labels start smaller by default and grow as selected time approaches.
        return 1.18 - (1.18 - 0.72) * t;
    }

    const selectedMsForLabelScale = typeof getSelectedDateTime === 'function'
        ? getSelectedDateTime().getTime()
        : Date.now();

    function applyFlattenToGroup(group, amount, includeEventStagger) {
        if (!group || !focusPoint) return;
        const yScaleLocal = Math.max(0.05, 1 - amount * 0.95);
        const pivotY =
            typeof window.flattenTimelineFocusY === 'function' ? window.flattenTimelineFocusY() : focusPoint.y;
        group.scale.set(1, yScaleLocal, 1);
        group.position.y = pivotY * (1 - yScaleLocal);
        if (amount > 0.01) {
            group.traverse((obj) => {
                if (includeEventStagger && obj.userData && obj.userData.eventStaggerRoot && typeof obj.userData.staggerLogical === 'number') {
                    obj.position.y = obj.userData.staggerLogical / yScaleLocal;
                }
                const hasBaseScale = obj.userData && obj.userData.baseScale;
                const isBillboard = obj.isSprite || (obj.userData.type === 'EventLineLabel' && !obj.userData.isRibbonSurfaceLabel);
                if ((isBillboard || obj.userData.immuneToFlatten) && hasBaseScale) {
                    const b = obj.userData.baseScale;
                    const mul = getEventNameLabelScaleMultiplier(obj, selectedMsForLabelScale);
                    const frac = obj.userData.scaleWithCameraDistance;
                    if (typeof frac === 'number' && frac > 0 && currentCameraDistance > 0) {
                        const aspect = b.y > 1e-6 ? b.x / b.y : 1;
                        const sy = Math.max(5, currentCameraDistance * frac);
                        obj.scale.set(sy * aspect * mul, (sy * mul) / yScaleLocal, b.z);
                    } else {
                        obj.scale.set(b.x * mul, (b.y * mul) / yScaleLocal, b.z);
                    }
                } else if (
                    obj.userData.immuneToFlatten ||
                    obj.userData.type === 'EventLineMarker' ||
                    obj.userData.type === 'LagrangeL1DayDot' ||
                    (obj.userData.type === 'EventObject' && obj.userData.dayBandDot)
                ) {
                    const pickMul =
                        obj.userData.type === 'LagrangeL1DayDot' &&
                        typeof obj.userData.pickScaleMul === 'number'
                            ? obj.userData.pickScaleMul
                            : 1;
                    obj.scale.set(pickMul, pickMul / yScaleLocal, pickMul);
                }
            });
        } else {
            group.traverse((obj) => {
                if (includeEventStagger && obj.userData && obj.userData.eventStaggerRoot && typeof obj.userData.staggerLogical === 'number') {
                    obj.position.y = obj.userData.staggerLogical;
                }
                const hasBaseScale = obj.userData && obj.userData.baseScale;
                const isBillboard = obj.isSprite || (obj.userData.type === 'EventLineLabel' && !obj.userData.isRibbonSurfaceLabel);
                if ((isBillboard || obj.userData.immuneToFlatten) && hasBaseScale) {
                    const b = obj.userData.baseScale;
                    const mul = getEventNameLabelScaleMultiplier(obj, selectedMsForLabelScale);
                    const frac = obj.userData.scaleWithCameraDistance;
                    if (typeof frac === 'number' && frac > 0 && currentCameraDistance > 0) {
                        const aspect = b.y > 1e-6 ? b.x / b.y : 1;
                        const sy = Math.max(5, currentCameraDistance * frac);
                        obj.scale.set(sy * aspect * mul, sy * mul, b.z);
                    } else {
                        obj.scale.set(b.x * mul, b.y * mul, b.z);
                    }
                } else if (
                    obj.userData.immuneToFlatten ||
                    obj.userData.type === 'EventLineMarker' ||
                    obj.userData.type === 'LagrangeL1DayDot' ||
                    (obj.userData.type === 'EventObject' && obj.userData.dayBandDot)
                ) {
                    const pickMul =
                        obj.userData.type === 'LagrangeL1DayDot' &&
                        typeof obj.userData.pickScaleMul === 'number'
                            ? obj.userData.pickScaleMul
                            : 1;
                    obj.scale.set(pickMul, pickMul, pickMul);
                }
            });
        }
    }

    // Smooth flatten transition (split: all-timeline vs time-markers-only).
    const flattenTargetAll = flattenMode === 'all' ? flattenIntensity : 0;
    const flattenTargetMarkers = flattenMode === 'markers'
        ? 1
        : (flattenMode === 'all' ? flattenIntensity : 0);
    currentFlattenAmount += (flattenTargetAll - currentFlattenAmount) * 0.08;
    currentTimeMarkerFlattenAmount += (flattenTargetMarkers - currentTimeMarkerFlattenAmount) * 0.08;
    const ehWant =
        typeof eventHorizonMode === 'string' &&
        eventHorizonMode === 'nest' &&
        typeof currentZoom === 'number' &&
        currentZoom !== 1
            ? 1
            : 0;
    if (ehWant === 0) {
        currentEhWarpConform = 0;
    } else {
        currentEhWarpConform += (ehWant - currentEhWarpConform) * 0.12;
    }
    if (typeof window !== 'undefined') {
        window.currentFlattenAmount = currentFlattenAmount;
        window.currentEhWarpConform = currentEhWarpConform;
        if (window.CircaevumWebGPUPipeline && typeof window.CircaevumWebGPUPipeline.updateGPUUniforms === 'function') {
            window.CircaevumWebGPUPipeline.updateGPUUniforms({
                flattenAmount: currentFlattenAmount,
                focusY: typeof focusPoint !== 'undefined' && focusPoint ? focusPoint.y : 0,
                selectedDate: typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date(),
                densityBudgetMax: typeof getSteWindowMonths === 'function' ? getSteWindowMonths() : 2
            });
        }
    }
    const flattenChanged = Math.abs(currentFlattenAmount - (window._lastFlattenableAmt || 0)) > 1e-4 ||
                           Math.abs(currentCameraDistance - (window._lastCameraDistForFlatten || 0)) > 0.05;
    const markerFlattenChanged = Math.abs(currentTimeMarkerFlattenAmount - (window._lastTimeMarkerFlattenAmt || 0)) > 1e-4;

    if (flattenChanged) {
        window._lastFlattenableAmt = currentFlattenAmount;
        window._lastCameraDistForFlatten = currentCameraDistance;
        if (typeof flattenableGroup !== 'undefined' && flattenableGroup && typeof focusPoint !== 'undefined' && focusPoint) {
            applyFlattenToGroup(flattenableGroup, currentFlattenAmount, true);
        }
    }
    if (markerFlattenChanged) {
        window._lastTimeMarkerFlattenAmt = currentTimeMarkerFlattenAmount;
        if (typeof timeMarkersGroup !== 'undefined' && timeMarkersGroup && typeof focusPoint !== 'undefined' && focusPoint) {
            applyFlattenToGroup(timeMarkersGroup, currentTimeMarkerFlattenAmount, false);
        }
    }
    if (flattenChanged && typeof circadianWorldlines !== 'undefined' && circadianWorldlines && circadianWorldlines.length && typeof focusPoint !== 'undefined' && focusPoint) {
        const circFlattenAmt = flattenMode === 'all' ? currentFlattenAmount : 0;
        circadianWorldlines.forEach((g) => {
            if (g) applyFlattenToGroup(g, circFlattenAmt, false);
        });
    }
    if (flattenChanged && typeof circadianHelixMarkerGroups !== 'undefined' && circadianHelixMarkerGroups && circadianHelixMarkerGroups.length && typeof focusPoint !== 'undefined' && focusPoint) {
        const circFlattenAmt = flattenMode === 'all' ? currentFlattenAmount : 0;
        circadianHelixMarkerGroups.forEach((g) => {
            if (g) applyFlattenToGroup(g, circFlattenAmt, false);
        });
    }
    if (currentFlattenAmount > 0.001 || flattenMode === 'all') {
        const earthMeshForHands = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
        if (typeof EarthGlobe !== 'undefined' && earthMeshForHands && EarthGlobe.updateGlobeHands) {
            const sdForHands = getSelectedDateTime();
            const cdForHands = typeof currentDate !== 'undefined' ? currentDate : null;
            const sdhForHands = calculateDateHeight(
                sdForHands.getFullYear(),
                sdForHands.getMonth(),
                sdForHands.getDate(),
                selectedDateHourFraction(sdForHands)
            );
            EarthGlobe.updateGlobeHands({
                earthGroup: earthMeshForHands,
                selectedDate: sdForHands,
                currentDate: cdForHands,
                selectedDateHeight: sdhForHands,
                zoomLevel: currentZoom,
                sceneContentGroup,
                tourMinimalOrbitMode: typeof isTourMinimalOrbitMode === 'function' ? isTourMinimalOrbitMode() : false,
                getSelectedTimeColor: typeof getSelectedTimeColor === 'function' ? getSelectedTimeColor : null
            });
        }
    }
    if (
        flattenChanged &&
        typeof EventRenderer !== 'undefined' &&
        typeof EventRenderer.updateTimelineHelixEventsForFlatten === 'function' &&
        typeof focusPoint !== 'undefined' &&
        focusPoint
    ) {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        try {
            const helixFlattenAmt = flattenMode === 'all' ? currentFlattenAmount : 0;
            const helixPivotY =
                typeof window.flattenTimelineFocusY === 'function' ? window.flattenTimelineFocusY() : focusPoint.y;
            EventRenderer.updateTimelineHelixEventsForFlatten(
                gl,
                helixPivotY,
                helixFlattenAmt
            );
        } catch (e) { /* optional */ }
    }

    updateListHorizonSkyDiskUniforms();
    const earthForDaylightSky = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
    if (
        earthForDaylightSky &&
        typeof currentZoom !== 'undefined' &&
        isEarthDaylightSkyZoom(currentZoom)
    ) {
        updateEarthDaylightSky(earthForDaylightSky, currentZoom);
    }
    if (typeof focusPoint !== 'undefined' && focusPoint) {
        const flattenPivotY =
            typeof window.flattenTimelineFocusY === 'function' ? window.flattenTimelineFocusY() : focusPoint.y;
        updateListHorizonContextArcFlatten(flattenPivotY, getActiveTimelineFlattenAmount());
        updateDayFrameLteSkyFlatten(flattenPivotY, getActiveTimelineFlattenAmount());
        refreshLiveEventHorizonWarp();
        if (typeof syncContextSphereLteSlopeRing === 'function') {
            try {
                syncContextSphereLteSlopeRing();
            } catch (e) { /* optional */ }
        }
    }

    // Interstellar: camera crossed Event Horizon → STE spindle / LTE accretion swap.
    if (typeof ContextSphereWarp !== 'undefined' && ContextSphereWarp.syncCameraInsideFlag) {
        try {
            if (ContextSphereWarp.syncCameraInsideFlag(camera, contextSphereState)) {
                onInterstellarHorizonCameraCross();
            }
        } catch (eHorizon) { /* optional */ }
    }

    // Smooth context-ring radius/height transitions across zoom and selected-time changes.
    if (listHorizonEarthRingMesh &&
        listHorizonEarthRingTargetRadius != null &&
        listHorizonEarthRingTargetInnerRadius != null &&
        listHorizonEarthRingTargetHeight != null &&
        listHorizonEarthRingCurrentRadius != null &&
        listHorizonEarthRingCurrentInnerRadius != null &&
        listHorizonEarthRingCurrentHeight != null &&
        listHorizonEarthRingEarthDistance != null &&
        listHorizonEarthRingTargetZoom != null) {
        const lerp = 0.14;
        const nextR = listHorizonEarthRingCurrentRadius +
            (listHorizonEarthRingTargetRadius - listHorizonEarthRingCurrentRadius) * lerp;
        const nextRi = listHorizonEarthRingCurrentInnerRadius +
            (listHorizonEarthRingTargetInnerRadius - listHorizonEarthRingCurrentInnerRadius) * lerp;
        const nextY = listHorizonEarthRingCurrentHeight +
            (listHorizonEarthRingTargetHeight - listHorizonEarthRingCurrentHeight) * lerp;
        const dr = Math.abs(nextR - listHorizonEarthRingCurrentRadius);
        const dri = Math.abs(nextRi - listHorizonEarthRingCurrentInnerRadius);
        const dy = Math.abs(nextY - listHorizonEarthRingCurrentHeight);
        const atTargetR = Math.abs(listHorizonEarthRingTargetRadius - listHorizonEarthRingCurrentRadius) < 0.01;
        const atTargetRi = Math.abs(listHorizonEarthRingTargetInnerRadius - listHorizonEarthRingCurrentInnerRadius) < 0.01;
        const atTargetY = Math.abs(listHorizonEarthRingTargetHeight - listHorizonEarthRingCurrentHeight) < 0.01;
        if (!atTargetR || !atTargetRi || !atTargetY) {
            listHorizonEarthRingCurrentRadius = nextR;
            listHorizonEarthRingCurrentInnerRadius = nextRi;
            listHorizonEarthRingCurrentHeight = nextY;
            if (dr > 0.0005 || dri > 0.0005 || dy > 0.0005) {
                rebuildListHorizonEarthRingMesh(
                    listHorizonEarthRingCurrentRadius,
                    listHorizonEarthRingCurrentInnerRadius,
                    listHorizonEarthRingCurrentHeight,
                    listHorizonEarthRingEarthDistance,
                    listHorizonEarthRingTargetZoom
                );
            }
        } else if (dr > 0 || dri > 0 || dy > 0) {
            listHorizonEarthRingCurrentRadius = listHorizonEarthRingTargetRadius;
            listHorizonEarthRingCurrentInnerRadius = listHorizonEarthRingTargetInnerRadius;
            listHorizonEarthRingCurrentHeight = listHorizonEarthRingTargetHeight;
            rebuildListHorizonEarthRingMesh(
                listHorizonEarthRingCurrentRadius,
                listHorizonEarthRingCurrentInnerRadius,
                listHorizonEarthRingCurrentHeight,
                listHorizonEarthRingEarthDistance,
                listHorizonEarthRingTargetZoom
            );
        }
    }

    // Circadian wrapped ↔ straightened morph (same lerp rate as flatten for a consistent feel).
    let circadianStraightenTarget = 0;
    if (typeof isCircadianHelixZoom === 'function' && isCircadianHelixZoom(currentZoom) &&
        typeof circadianState !== 'undefined' && circadianState !== 'off') {
        if (circadianState === 'straightened' || (flattenMode === 'all' && currentZoom >= 3)) {
            circadianStraightenTarget = 1;
        }
    }
    currentCircadianStraightenAmount +=
        (circadianStraightenTarget - currentCircadianStraightenAmount) * 0.08;
    ensureTimeseriesArcGroup();
    if (typeof CircadianRenderer !== 'undefined' && circadianWorldlines && circadianWorldlines.length) {
        const sdHel = getSelectedDateTime();
        const sdTimeMs = sdHel.getTime();
        const straightenChanged = Math.abs(currentCircadianStraightenAmount - (window._lastCircadianStraightenAmt || 0)) > 1e-4;
        const timeChanged = sdTimeMs !== (window._lastCircadianSelectedTimeMs || 0);

        if (straightenChanged || timeChanged) {
            window._lastCircadianStraightenAmt = currentCircadianStraightenAmount;
            window._lastCircadianSelectedTimeMs = sdTimeMs;

            const chHel = calculateDateHeight(
                sdHel.getFullYear(),
                sdHel.getMonth(),
                sdHel.getDate(),
                selectedDateHourFraction(sdHel)
            );
            circadianWorldlines.forEach(function (ln) {
                if (!ln || !ln.userData) return;
                if (ln.userData.circadianDayDisksAnim && CircadianRenderer.refreshDayDiskOutlinesGroup) {
                    CircadianRenderer.refreshDayDiskOutlinesGroup(
                        ln,
                        currentCircadianStraightenAmount,
                        chHel,
                        sdHel,
                        ln.userData.spanDays,
                        ln.userData.rimRadius
                    );
                } else if (ln.userData.circadianHelixAnim && CircadianRenderer.refreshCircadianHelixLine) {
                    CircadianRenderer.refreshCircadianHelixLine(
                        ln,
                        currentCircadianStraightenAmount,
                        chHel,
                        ln.userData.spanDays
                    );
                } else if (ln.userData.circadianTimeseriesAnim && typeof TimeseriesRenderer !== 'undefined' && TimeseriesRenderer.refreshGroup) {
                    TimeseriesRenderer.refreshGroup(
                        ln,
                        currentCircadianStraightenAmount,
                        chHel,
                        sdHel,
                        ln.userData.spanDays,
                        calculateDateHeight
                    );
                } else if (ln.userData.atcGuideAnim && typeof AtcBand !== 'undefined' && AtcBand.refreshGuideGroup) {
                    AtcBand.refreshGuideGroup(
                        ln,
                        currentCircadianStraightenAmount,
                        chHel,
                        sdHel
                    );
                }
            });
            circadianHelixMarkerGroups.forEach(function (mg) {
                if (mg && CircadianRenderer.refreshHelixStructureMarkersGroup) {
                    CircadianRenderer.refreshHelixStructureMarkersGroup(
                        mg,
                        currentCircadianStraightenAmount,
                        chHel,
                        getSelectedDateTime()
                    );
                }
            });
        }
    }
    // Do not refreshAllEventLayers every frame while straighten lerps — rebuilds all event meshes (severe XR lag).

    if (lagrangeL1DayHoverTargetMesh) {
        updateLagrangeL1DayHoverConnectorGeometry();
    }

    if (
        lagrangeL1MouseRay.has &&
        !isDragging &&
        lagrangeL1DayArcObjects.length &&
        shouldShowLagrangeL1DayArc(currentZoom)
    ) {
        refreshLagrangeL1DayDotPickScales();
    }

    // System roll (R): ease scene Z to match target so content and camera (child of scene) pivot together.
    if (scene && typeof sceneRollTargetRad === 'number') {
        const rollErr = sceneRollTargetRad - scene.rotation.z;
        if (Math.abs(rollErr) > 1e-7) {
            scene.rotation.z += rollErr * sceneRollSmoothSpeed;
        } else {
            scene.rotation.z = sceneRollTargetRad;
        }
    }

    // Planets stay at rest at their accurate positions
    // No orbital animation

    updateSunLightingTowardEarth();

    const focusLerp = currentZoom === 0 ? 0.38 : cameraTransitionSpeed;
    const flattenLockY =
        flattenMode === 'all' &&
        typeof currentFlattenAmount === 'number' &&
        currentFlattenAmount > 0.12 &&
        targetFocusPoint &&
        typeof targetFocusPoint.y === 'number' &&
        isFinite(targetFocusPoint.y);
    focusPoint.x += (targetFocusPoint.x - focusPoint.x) * focusLerp;
    if (flattenLockY) {
        focusPoint.y = targetFocusPoint.y;
    } else {
        focusPoint.y += (targetFocusPoint.y - focusPoint.y) * focusLerp;
    }
    focusPoint.z += (targetFocusPoint.z - focusPoint.z) * focusLerp;
    
    // Smooth camera distance transition
    currentCameraDistance += (targetCameraDistance - currentCameraDistance) * cameraTransitionSpeed;
    
    const distance = currentCameraDistance;

    const inXRWindowed = xrAdapter && xrAdapter.isPresenting() && xrAdapter.windowedMode;
    const camForPos = (inXRWindowed && contentCamera) ? contentCamera : camera;

    // Set target camera orientation based on zoom level
    if (currentZoom === 9 || currentZoom === 0) {
        isPolarView = true;

        if (needPolarOrbitInit && polarViewDir && camForPos) {
            if (forcePolarDefaultOnInit) {
                polarViewDir.copy(buildDefaultPolarViewDirection());
            } else {
                polarViewDir.subVectors(camForPos.position, focusPoint);
                if (polarViewDir.lengthSq() < 1e-8) {
                    polarViewDir.copy(buildDefaultPolarViewDirection());
                } else {
                    polarViewDir.normalize();
                // No hard world-Y clamp here; dot-limit guard in applyPolarOrbitDelta
                // now controls safe angular range for Earth zoom rigs.
                }
            }
            needPolarOrbitInit = false;
            forcePolarDefaultOnInit = false;
        }

        const earthMesh = planetMeshes.find(p => p.userData && p.userData.name === 'Earth');
        const earthDef = PLANET_DATA.find(p => p.name === 'Earth');
        let sunToEarthAngle = 0;
        if (earthMesh) {
            sunToEarthAngle = Math.atan2(earthMesh.position.z, earthMesh.position.x);
        } else if (earthDef) {
            sunToEarthAngle = earthDef.startAngle;
        }

        if (polarViewDir) {
            targetCameraPosition.copy(polarViewDir).multiplyScalar(distance);
        } else {
            targetCameraPosition.copy(buildDefaultPolarViewDirection()).multiplyScalar(distance);
        }

        if (currentZoom === 8) {
            targetCameraUp.set(0, 1, 0);
        } else {
            targetCameraUp.set(
                -Math.cos(sunToEarthAngle),
                0,
                -Math.sin(sunToEarthAngle)
            );
        }

        if (Math.floor(time) % 100 === 0 && currentZoom === 9) {
            console.log('Zoom 9 - Camera distance:', distance, 'Focus point:', focusPoint.y, 'Markers visible:', timeMarkers.length);
        }
    } else {
        isPolarView = false;

        // Target: Normal camera positioning
        const cameraX = Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x) * distance;
        const cameraY = Math.sin(cameraRotation.x) * distance;
        const cameraZ = Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x) * distance;

        targetCameraPosition.set(cameraX, cameraY, cameraZ);

        // Target: Default up vector
        targetCameraUp.set(0, 1, 0);
    }

    const currentPos = new THREE.Vector3(
        camForPos.position.x - focusPoint.x,
        camForPos.position.y - focusPoint.y,
        camForPos.position.z - focusPoint.z
    );

    const polarCam = isEarthZoomRig(currentZoom);
    const camLerp = polarCam ? 1 : cameraTransitionSpeed;
    currentPos.lerp(targetCameraPosition, camLerp);
    if (polarCam) {
        clampPolarCameraOutsideEarth(currentPos, focusPoint);
    }

    const cam = (inXRWindowed && contentCamera) ? contentCamera : camera;
    if (cam) {
        cam.position.set(
            focusPoint.x + currentPos.x,
            focusPoint.y + currentPos.y,
            focusPoint.z + currentPos.z
        );
        currentCameraUp.lerp(targetCameraUp, camLerp);
        cam.up.copy(currentCameraUp);
        cam.lookAt(focusPoint);
        if (typeof circadianState !== 'undefined' && circadianState !== 'off') {
            applyCircadianEventNameBillboards(flattenableGroup, cam);
            applyCircadianEventNameBillboards(sceneContentGroup, cam);
        }
    }

    updateHourHandMarkerPulse(time);
    
    if (inXRWindowed && contentCamera && xrAdapter._roomScene) {
        xrAdapter.renderWindowed(renderer, scene, contentCamera, camera);
    } else {
        if (xrAdapter && xrAdapter.isPresenting() && !xrAdapter.windowedMode && typeof xrAdapter.applyScenePlacement === 'function') {
            xrAdapter.applyScenePlacement();
        }
        renderer.render(scene, camera);
    }
}

// Check for WebGL support
function webGLSupported() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && 
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch(e) {
        return false;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const loadingElement = document.getElementById('loading');
    const loadingText = document.querySelector('.loading-text');
    
    // Check if Three.js loaded
    if (typeof THREE === 'undefined') {
        if (loadingText) {
            loadingText.textContent = 'Failed to load 3D library. Check your connection.';
        }
        if (loadingElement) {
            loadingElement.setAttribute('aria-busy', 'false');
        }
        console.error('Three.js failed to load from CDN');
        return;
    }
    
    // Check WebGL support
    if (!webGLSupported()) {
        if (loadingText) {
            loadingText.textContent = 'WebGL not supported. Please use a modern browser.';
        }
        if (loadingElement) {
            loadingElement.setAttribute('aria-busy', 'false');
        }
        console.error('WebGL is not supported on this device/browser');
        return;
    }
    
    try {
        initScene();
        requestAnimationFrame(function () {
            if (typeof resizeCircaevumViewport === 'function') {
                resizeCircaevumViewport();
            }
        });
        if (typeof EarthGlobe !== 'undefined' && EarthGlobe.initGeolocationObserver) {
            EarthGlobe.initGeolocationObserver();
        }
        syncAppearanceDerivedState();
        if (typeof scene !== 'undefined' && scene && typeof THREE !== 'undefined') {
            scene.background = new THREE.Color(getBackgroundColor(viewMode, appearanceTheme));
        }
        // Initialize zoom, camera, and UI using the standard zoom pipeline
        if (camera && typeof THREE !== 'undefined') {
            contentCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
            contentCamera.position.copy(camera.position);
            contentCamera.up.copy(camera.up);
        }
        initControls();
        initSingularBandModeFromUrlAndStorage();
        const variedZoom = pickInitialZoomLevel();
        if (typeof variedZoom === 'number') {
            currentZoom = variedZoom;
        }
        // Route through window.setZoomLevel so the embed-api monkey-patch fires
        // and any parent wrapper (e.g. yin-portal on app.circaevum.com) receives
        // CIRCAEVUM_ZOOM with the picked level and can sync its own state.
        const applyZoom = (typeof window !== 'undefined' && typeof window.setZoomLevel === 'function')
            ? window.setZoomLevel
            : setZoomLevel;
        applyZoom(currentZoom);
        // Use renderer.setAnimationLoop for WebXR compatibility
        renderer.setAnimationLoop(animate);
        
        setTimeout(() => {
            hideLoadingScreen();
        }, 1500);
        
    } catch (error) {
        console.error('Failed to initialize Circaevum:', error);
        if (loadingText) {
            loadingText.textContent = 'Failed to load. Check console for details.';
        }
    }
});

if (typeof window !== 'undefined') {
    window.createPlanets = createPlanets;
}
