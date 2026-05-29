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
let currentZoom = 5;
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
/** 'dark' | 'light' | 'sky' — sky uses light chrome (body.light-mode) plus sky-theme tints and a blue scene background. */
let appearanceTheme = 'dark';
/** True for light or sky (readable orbit lines, bright UI chrome). */
let isLightMode = false;
let viewMode = 0; // 0 = angled, 1 = top-down (looking into future), 2 = bottom-up (looking into past)
let showTimeMarkerLines = true;
let showTimeMarkerText = true;
let showFullYearTimeMarkers = false; // When true, show time markers for the full selected year
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
let tourSceneLightRebuildLast = 0;

function clearTourNarrativeSceneFlags() {
    tourWorldlineRevealProgress = null;
    tourHideAllTimeMarkers = false;
    tourOrbitMarkersFromCalendar = false;
    tourSolsticeCrossActive = false;
    tourNarrativeLightMode = false;
    tourFlatCalendarStrip = false;
    tourMarkerDensityOverride = null;
    tourNarrativeShaderWorldlinesActive = false;
    try {
        const el = typeof document !== 'undefined' ? document.getElementById('circaevum-tour-cal-strip') : null;
        if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) { /* ignore */ }
}
/** Pedagogical Moon mesh + dashed guide + lunar worldline + Artemis II overlay (scene icon / M). */
let showMoonLayer = true;

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
/** Artemis II trajectory + labels; shown when moon layer is effective (see missions/artemis-ii-mission.js). */
let artemisMissionObjects = [];
let circadianWorldlines = []; // Circadian: one disk outline per day in span (day/clock zoom)
let circadianHelixMarkerGroups = []; // Week/month ticks along circadian helix (LineSegments)
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
/** Local +Z in the sky group points sunward after {@link syncEarthDaylightSkyTransform}. */
const EARTH_DAYLIGHT_SKY_LOCAL_SUN_AZIMUTH = Math.PI / 2;
const EARTH_DAYLIGHT_SKY_RENDER_ORDER = 7;
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
/** Hold Shift: show all STEs as lightweight centerlines (see event-renderer). */
let circadianShortEventsShiftPreview = false;
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
        const gl = window.circaevumGL;
        if (gl && typeof gl.refreshAllEventLayers === 'function') {
            try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
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
        const gl = window.circaevumGL;
        if (gl && typeof gl.refreshAllEventLayers === 'function') {
            try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
        }
        if (typeof window.refreshEventsList === 'function') {
            const ep = document.getElementById('event-list-panel');
            if (ep && ep.classList.contains('open')) window.refreshEventsList(false);
        }
    };
}
let flattenMode = 'off'; // 'off' | 'markers' | 'all'
let currentFlattenAmount = 0; // Lerps for event/worldline flatten in mode 'all'.
let currentTimeMarkerFlattenAmount = 0;
/** 0 = circadian helix fully wrapped/helical, 1 = fully straightened (lerps like currentFlattenAmount). */
let currentCircadianStraightenAmount = 0;
// flattenIntensity: 0–1 where 0 = no flatten, 1 = maximum flatten.
// Default to maximum flatten so the slider (0 = flattest, 1 = tallest) starts at the far left.
let flattenIntensity = 1;
/** UI 0 = circadian helix tight along time, 1 = spread; 0.5 → 1× natural calendar scale (see getCircadianHelixYStretchMult). */
let circadianHelixStretchSlider = 0.5;
let focusTargetOverride = null; // 'sun' | 'earth' | 'mid' | 'moon' | null – null = use ZOOM_LEVELS default
/** When true (long-term event click), use day-number/day-name radial band for mid focus geometry (same as week view mid). */
let focusMidFromLongTermEventClick = false;
if (typeof window !== 'undefined') {
    /** Y scale applied to flattenableGroup (1 = no flatten). Used to keep event stagger visually consistent when flat. */
    window.getEventFlattenYScale = function () {
        return Math.max(0.05, 1 - currentFlattenAmount * 0.95);
    };
    /** True only when marker + event timeline geometry are both flattened. */
    window.isFlattenTimeStraightenActive = function () { return flattenMode === 'all'; };
    /** Selected-time Y for long-term helix flatten (matches focusPoint.y in animate). */
    window.flattenTimelineFocusY = function () {
        return (typeof focusPoint !== 'undefined' && focusPoint && typeof focusPoint.y === 'number')
            ? focusPoint.y
            : 0;
    };
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
        if (typeof window.circaevumGL !== 'undefined' && window.circaevumGL &&
            typeof window.circaevumGL.refreshAllEventLayers === 'function') {
            try {
                window.circaevumGL.refreshAllEventLayers();
            } catch (e) { /* GL may be disposing */ }
        }
    };
    window.getCircadianShortEventsShiftPreview = function () {
        return !!circadianShortEventsShiftPreview;
    };
    window.setCircadianShortEventsShiftPreview = function (active) {
        const next = !!active;
        if (next === circadianShortEventsShiftPreview) return;
        circadianShortEventsShiftPreview = next;
        const gl = window.circaevumGL;
        if (gl && typeof gl.refreshAllEventLayers === 'function') {
            try { gl.refreshAllEventLayers(); } catch (e) { /* GL may be disposing */ }
        }
    };
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
            currentHourInDay = selectedHour;
            selectedMinuteInHour = selectedDate.getMinutes();
            break;
            
        case 2: // Decade view
            currentYear = selectedYear;
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
        case 1: // Century view - year changes by 10-year increments
            // currentYear is modified directly by navigateUnit
            selected.setFullYear(currentYear);
            break;
            
        case 2: // Decade view - currentYear is the selected year
            selected.setFullYear(currentYear);
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
 * Radial position along Sun→Earth for camera "mid" focus: halfway between TimeMarkers day.number and day.dayName (21/32 and 23/32 W).
 * Long-term event navigation always uses this band; week/day/clock zooms use it for normal mid focus too.
 */
function getFocusMidRadialFrac(zoomLevel) {
    const dayBandMidFrac = (21 / 32 + 23 / 32) / 2;
    if (focusMidFromLongTermEventClick) return dayBandMidFrac;
    if (zoomLevel === 7 || zoomLevel === 8 || zoomLevel === 9) return dayBandMidFrac;
    return 0.5;
}

/** Sun–Earth “mid” override stays valid at these zooms (incl. week/day/clock where the day band is defined). */
function keepMidFocusOverrideAtZoom(zl) {
    if (focusMidFromLongTermEventClick) return true;
    if (zl >= 4 && zl <= 9) return true;
    if (zl === 0) return true;
    return false;
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
        renderer.setSize(window.innerWidth, window.innerHeight);
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
            if (camera && renderer) {
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
    let currentDateHeight;
    if (zoomLevel === 2 || zoomLevel === 3 || zoomLevel === 4) {
        if (typeof calculateActualCurrentDateHeight !== 'undefined' && calculateActualCurrentDateHeight) {
            currentDateHeight = calculateActualCurrentDateHeight();
        } else if (typeof calculateYearProgressForDate !== 'undefined' && calculateYearProgressForDate) {
            const nowActual = new Date();
            const actualYear = nowActual.getFullYear();
            const actualMonth = nowActual.getMonth();
            const actualDay = nowActual.getDate();
            const actualHour = nowActual.getHours();
            const yearProgress = calculateYearProgressForDate(actualYear, actualMonth, actualDay, actualHour);
            currentDateHeight = ((actualYear - CENTURY_START) * HEIGHT_PER_YEAR) + (yearProgress * HEIGHT_PER_YEAR);
        } else {
            const nowActual = new Date();
            const actualYear = nowActual.getFullYear();
            const actualMonth = nowActual.getMonth();
            const actualDay = nowActual.getDate();
            const actualHour = nowActual.getHours();
            const daysInMonth = getDaysInMonth(actualYear, actualMonth);
            const yearProgress = (actualMonth + (actualDay - 1) / daysInMonth + actualHour / (24 * daysInMonth)) / 12;
            currentDateHeight = ((actualYear - CENTURY_START) * HEIGHT_PER_YEAR) + (yearProgress * HEIGHT_PER_YEAR);
        }
    } else if (zoomLevel >= 5 || zoomLevel === 0) {
        currentDateHeight = calculateCurrentDateHeight();
    } else if (zoomLevel === 1 || zoomLevel === 2) {
        // Navigated year lives in currentYear / getSelectedDateTime — present height must stay wall-clock now
        // so planet XZ (and fallback orbits) advance when stepping decades or centuries.
        if (typeof calculateActualCurrentDateHeight === 'function') {
            currentDateHeight = calculateActualCurrentDateHeight();
        } else {
            const nowActual = new Date();
            currentDateHeight = calculateDateHeight(
                nowActual.getFullYear(),
                nowActual.getMonth(),
                nowActual.getDate(),
                nowActual.getHours()
            );
        }
    } else {
        currentDateHeight = getHeightForYear(currentYear, 1);
    }

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
 * Circadian daily disks: orbit phase from “now” (currentDateHeight), timeline Y + Earth XZ from navigation (selected).
 * Keeps event arcs on the same worldline frame as the Earth mesh.
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
function getEventListHalfSpanMs(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    if (z === 0) return EVENT_LIST_MS_PER_DAY / 24 / 2;
    if (z >= 9) return EVENT_LIST_MS_PER_DAY;
    if (z >= 8) return 2 * EVENT_LIST_MS_PER_DAY;
    if (z >= 7) return 7 * EVENT_LIST_MS_PER_DAY;
    if (z >= 5) return 30 * EVENT_LIST_MS_PER_DAY;
    if (z >= 3) return 120 * EVENT_LIST_MS_PER_DAY;
    return 365 * EVENT_LIST_MS_PER_DAY;
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
    const halfMs = getEventListHalfSpanMs(z);
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
 */
function getListContextDiscArcTimeBoundsMs(zoomLevel, refDate) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const ref =
        refDate instanceof Date && !isNaN(refDate.getTime())
            ? refDate
            : typeof getSelectedDateTime === 'function'
              ? getSelectedDateTime()
              : new Date();
    const dayMs = EVENT_LIST_MS_PER_DAY;
    if (z === 0) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ref.getHours(), 0, 0, 0);
        return { t0: start.getTime(), t1: start.getTime() + dayMs / 24, ref };
    }
    if (z === 7) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
        start.setDate(start.getDate() - start.getDay());
        return { t0: start.getTime(), t1: start.getTime() + 7 * dayMs - 1, ref };
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

function listHorizonSegmentCountForArc(bounds, baseN, arc) {
    const dayMs = EVENT_LIST_MS_PER_DAY;
    const spanDays = bounds && bounds.t1 > bounds.t0 ? (bounds.t1 - bounds.t0) / dayMs : 7;
    const b = baseN != null ? baseN : 52;
    if (arc && arc.fullCircle) {
        return Math.max(24, Math.min(96, Math.round(b)));
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
    return bounds.t0 + ':' + bounds.t1 + ':' + bounds.ref.getTime() + ':cur' + curH;
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

function flattenListHorizonPositionArray(logical, focusY, amount) {
    if (!logical || logical.length < 3) return logical;
    const yScale = Math.max(0.05, 1 - (typeof amount === 'number' && !isNaN(amount) ? amount : 0) * 0.95);
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
        typeof focusPoint !== 'undefined' && focusPoint && typeof focusPoint.y === 'number'
            ? focusPoint.y
            : yCenter;
    updateListHorizonContextArcFlatten(focusY, getActiveTimelineFlattenAmount());
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
 * Annulus mesh for season spikes (list-context band only — no fan to the Sun).
 * @param {object} [arc] - from {@link getListContextDiscArcRad}; omit for full circle.
 * @param {object} [helixCtx] - from {@link getListHorizonHelixBuildContext}; helical band when set.
 */
function buildListHorizonContextAnnulusGeometry(THREE, rInner, rOuter, y, nSeg, arc, helixCtx) {
    const TWO_PI = Math.PI * 2;
    const ro = Math.max(0, rOuter);
    let ri = Math.max(0, rInner);
    if (ro < 1e-4 || !THREE) return null;
    if (ri >= ro - ro * 0.04) ri = Math.max(0, ro * 0.38);

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
    const ro = Math.max(0, rOuter);
    let ri = Math.max(0, rInner);
    if (ri >= ro - ro * 0.04) ri = Math.max(0, ro * 0.38);
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

/** No-op (sky fill uses vertex colors; kept for call sites). */
function updateListHorizonSkyDiskUniforms() {}

/** Radial band color t∈[0,1]: inner zenith → outer cyan hoop. */
function skyAnnulusColorFromT(t, isLight, edgeColorHex) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.2, g: 0.5, b: 0.8 };
    const light = !!isLight;
    const u = Math.max(0, Math.min(1, t));
    const inner = new T.Color(light ? 0x3d6a9a : 0x1a3d6e);
    const mid = new T.Color(light ? 0x7eb8e8 : 0x2d6a9e);
    const hi = new T.Color(light ? 0xa8dcff : 0x4a8ec8);
    const edge = new T.Color(edgeColorHex != null ? edgeColorHex : light ? 0x0891b2 : 0x22d3ee);
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

function applySkyAnnulusVertexColors(geom, ri, ro, isLight, edgeColorHex) {
    const T = getThreeNamespace();
    if (!T || !geom || !geom.attributes || !geom.attributes.position) return;
    const pos = geom.attributes.position;
    const span = Math.max(ro - ri, 1e-4);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        const t = Math.max(0, Math.min(1, (r - ri) / span));
        const col = skyAnnulusColorFromT(t, isLight, edgeColorHex);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
}

function isEarthDaylightSkyZoom(zoomLevel) {
    return zoomLevel === 0 || zoomLevel === 8 || zoomLevel === 9;
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

function skyGoldenColorFromT(t, isLight, isDawn) {
    const T = getThreeNamespace();
    if (!T) return { r: 0.55, g: 0.38, b: 0.28 };
    const u = Math.max(0, Math.min(1, t));
    const zenith = new T.Color(isLight ? 0xffc98a : 0xff9a5c);
    const mid = new T.Color(isLight ? 0xff9f6e : 0xe86a4a);
    const horizon = new T.Color(isLight ? 0x8ec8f0 : 0x4a7aa8);
    const rose = new T.Color(isLight ? 0xffb0c8 : 0x9a4a68);
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
    const zenith = new T.Color(isLight ? 0x4a5a8a : 0x1a2248);
    const mid = new T.Color(isLight ? 0x7a6a9a : 0x3a3568);
    const horizon = new T.Color(isLight ? 0xc88aa8 : 0x6a4a78);
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
    const inner = new T.Color(isLight ? 0x0a1220 : 0x03060c);
    const outer = new T.Color(isLight ? 0x141c2e : 0x060a12);
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

function applyEarthDaylightSkyVertexColors(geom, ri, ro, sunwardAzimuth, isLight, edgeColorHex) {
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
        const weights = skyDiurnalWeightsAtHour(hour);
        const radialT = Math.max(0, Math.min(1, (r - ri) / span));
        const col = skyColorFromDiurnalWeights(weights, radialT, isLight, edgeColorHex);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
}

function disposeEarthDaylightSky() {
    if (!earthDaylightSkyMesh) {
        earthDaylightSkyRadiiKey = null;
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
}

function earthDaylightSkyGradientT(r, y, ri, ro, halfH) {
    const radialT = Math.max(0, Math.min(1, (r - ri) / Math.max(ro - ri, 1e-4)));
    const verticalT = Math.max(0, Math.min(1, (y + halfH) / Math.max(2 * halfH, 1e-4)));
    return Math.max(radialT * 0.35, verticalT * 0.92);
}

function applyEarthDaylightSkySkirtVertexColors(geom, ri, ro, halfH, sunwardAzimuth, isLight, edgeColorHex) {
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
        const weights = skyDiurnalWeightsAtHour(hour);
        const t = earthDaylightSkyGradientT(r, y, ri, ro, halfH);
        const col = skyColorFromDiurnalWeights(weights, t, isLight, edgeColorHex);
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

function refreshEarthDaylightSkyColors(earthGroup, ri, ro, sunwardAzimuth) {
    void earthGroup;
    if (!earthDaylightSkyMesh || !earthDaylightSkyMesh.traverse) return;
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
                edgeHex
            );
        } else {
            applyEarthDaylightSkyVertexColors(
                child.geometry,
                ri,
                ro,
                sunwardAzimuth,
                isLightMode,
                edgeHex
            );
        }
        if (child.material) child.material.needsUpdate = true;
    });
}

function resolveEarthDaylightSkyRadii(earthGroup, zoomLevel) {
    void zoomLevel;
    const rSurf = resolveEarthGlobeSurfaceRadius(earthGroup);
    const rTip = getEarthHourHandOuterExtentRadius(rSurf);
    const earth = PLANET_DATA && PLANET_DATA.find((p) => p.name === 'Earth');
    const W = earth && typeof earth.distance === 'number' ? earth.distance : 50;
    const spiralR = W * 0.1 * 0.9;
    let handRim = spiralR * 1.12;
    if (typeof CircadianRenderer !== 'undefined' && typeof CircadianRenderer.getHandLength === 'function') {
        handRim = Math.max(handRim, CircadianRenderer.getHandLength() * 1.1);
    }
    const ri = Math.max(rSurf * 1.02, rSurf + 0.05);
    const ro = Math.max(ri + 0.18, Math.min(handRim, rTip * 1.06, spiralR * 1.18));
    return { ri, ro, rSurf };
}

/** Full circadian disk backdrop (globe → hour-hand rim), zoom 0/8/9. */
function updateEarthDaylightSky(earthGroup, zoomLevel) {
    const T = getThreeNamespace();
    if (!T || !earthGroup || !isEarthDaylightSkyZoom(zoomLevel)) {
        disposeEarthDaylightSky();
        return;
    }
    const { ri, ro } = resolveEarthDaylightSkyRadii(earthGroup, zoomLevel);
    const radiiKey = `${ri.toFixed(3)}:${ro.toFixed(3)}`;
    const sunwardAzimuth = EARTH_DAYLIGHT_SKY_LOCAL_SUN_AZIMUTH;
    const edgeHex = getListHorizonRingColorHex();

    if (!earthDaylightSkyMesh || earthDaylightSkyRadiiKey !== radiiKey) {
        disposeEarthDaylightSky();
        earthDaylightSkyMesh = buildEarthDaylightSkyGroup(T, ri, ro, sunwardAzimuth, isLightMode, edgeHex);
        earthDaylightSkyRadiiKey = radiiKey;
        if (earthDaylightSkyMesh && sceneContentGroup) {
            sceneContentGroup.add(earthDaylightSkyMesh);
        }
    } else {
        refreshEarthDaylightSkyColors(earthGroup, ri, ro, sunwardAzimuth);
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
}

/** Helix list-context strip: color by inner vs outer ring (XZ radius varies along the arc). */
function applySkyAnnulusVertexColorsHelixStrip(geom, innerVertexCount, isLight, edgeColorHex) {
    const T = getThreeNamespace();
    if (!T || !geom || !geom.attributes || !geom.attributes.position) return;
    const nInner = Math.max(1, innerVertexCount | 0);
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const t = i < nInner ? 0 : 1;
        const col = skyAnnulusColorFromT(t, isLight, edgeColorHex);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geom.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
}

/** Sky annulus fill: vertex-colored MeshBasic (reliable vs custom ShaderMaterial attrs). */
function createListHorizonSkyDiskMaterial(THREE) {
    return new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.66,
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
    const ro = Math.max(0, rOuter);
    let ri = Math.max(0, rInner);
    if (ro < 1e-4 || !THREE || !THREE.RingGeometry) return null;
    if (ri >= ro - ro * 0.04) ri = Math.max(0, ro * 0.38);

    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, arc.theta1 - arc.theta0);
    const n = fullCircle
        ? Math.max(48, Math.min(128, nSeg * 2))
        : Math.max(24, Math.min(128, Math.round(nSeg * (span / TWO_PI) * 2)));

    const geom = new THREE.RingGeometry(ri, ro, n, 1, t0, span);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, yCenter, 0);
    applySkyAnnulusVertexColors(geom, ri, ro, isLightMode, colorHex);
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
 */
function buildListHorizonSkyDiskMesh(THREE, rInner, rOuter, y, nSeg, colorHex, opacity, renderOrder, arc, helixCtx) {
    void opacity;
    void y;
    const TWO_PI = Math.PI * 2;
    const ro = Math.max(0, rOuter);
    let ri = Math.max(0, rInner);
    if (ro < 1e-4) return null;
    if (ri >= ro - ro * 0.04) ri = Math.max(0, ro * 0.38);

    const fullCircle = !arc || arc.fullCircle;
    const t0 = fullCircle ? 0 : arc.theta0;
    const t1 = fullCircle ? TWO_PI : arc.theta1;
    const span = fullCircle ? TWO_PI : Math.max(1e-4, t1 - t0);
    const n = fullCircle
        ? Math.max(24, Math.min(96, nSeg))
        : Math.max(12, Math.min(96, Math.round(nSeg * (span / TWO_PI))));

    const useHelix = helixCtx && helixCtx.bounds;
    const bandSign = helixCtx && helixCtx.bandSign != null ? helixCtx.bandSign : 0;

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
        for (let ring = 0; ring < 2; ring++) {
            const r = ring === 0 ? ri : ro;
            for (let i = 0; i <= nHelix; i++) {
                const ms = bounds.t0 + (i / nHelix) * (bounds.t1 - bounds.t0);
                const p = listHorizonHelixPointAtMs(ms, r, refCur, refSel, bandHalfH, bandSign);
                positions.push(p.x, p.y, p.z);
            }
        }
        for (let i = 0; i < nHelix; i++) {
            indices.push(i, i + 1, helixInnerVertexCount + i + 1, i, helixInnerVertexCount + i + 1, helixInnerVertexCount + i);
        }
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
    if (useHelix) {
        applySkyAnnulusVertexColorsHelixStrip(geom, helixInnerVertexCount, isLightMode, colorHex);
    } else {
        applySkyAnnulusVertexColors(geom, ri, ro, isLightMode, colorHex);
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
    const ro = Math.max(0, rOuter);
    let ri = Math.max(0, rInner);
    if (ro < 1e-4 || !THREE) return null;
    if (ri >= ro - ro * 0.04) ri = Math.max(0, ro * 0.38);

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
    applySkyAnnulusVertexColors(geom, ri, ro, isLightMode, colorHex);
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
    const roCap = extendEarth ? 0.998 : 0.94;
    let ro = Math.max(earthW * 0.2, Math.min(rHoopOuter, earthW * roCap));
    let ri = Math.max(earthW * 0.06, Math.min(rHoopInner, ro - earthW * 0.015));
    if (ri >= ro - earthW * 0.02) ri = Math.max(earthW * 0.06, ro * 0.5);
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
        skyRo - 1,
        arc,
        helixCtx
    );
    if (skyFill) group.add(skyFill);

    const wallInner = buildListHorizonHoopWallMesh(
        THREE, ri, y0, y1, n, colorHex, renderOrder, 1.65 * wallOpMul, true, arc, helixCtx
    );
    const wallOuter = buildListHorizonHoopWallMesh(
        THREE, ro, y0, y1, n, colorHex, renderOrder, 1 * wallOpMul, false, arc, helixCtx
    );
    if (wallInner) group.add(wallInner);
    if (wallOuter) group.add(wallOuter);

    return group;
}

/**
 * Zoom-context annulus at selected time height: inner edge = Event List span band; outer = time-marker context hoop.
 * Hidden when list Draw-all is on.
 */
function isContextDiscEnabled() {
    if (typeof window !== 'undefined' && window.eventsListHorizonRingActive === false) return false;
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

function buildEarthHandSurfaceArcEdge(p0, p1, sphereCenter, sphereRadius, edgeRadius, colorHex, renderOrder) {
    if (typeof THREE === 'undefined') return null;
    const center = sphereCenter.clone ? sphereCenter.clone() : new THREE.Vector3(sphereCenter.x, sphereCenter.y, sphereCenter.z);
    const a = p0.clone ? p0.clone() : new THREE.Vector3(p0.x, p0.y, p0.z);
    const b = p1.clone ? p1.clone() : new THREE.Vector3(p1.x, p1.y, p1.z);
    const ua = new THREE.Vector3().subVectors(a, center).normalize();
    const ub = new THREE.Vector3().subVectors(b, center).normalize();
    const points = [];
    const segments = 10;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const u = new THREE.Vector3().copy(ua).lerp(ub, t).normalize();
        points.push(new THREE.Vector3().copy(center).addScaledVector(u, sphereRadius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geom = new THREE.TubeGeometry(curve, 14, edgeRadius, 10, false);
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder != null ? renderOrder : 12;
    return mesh;
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

    const sunSel = { x: 0, y: selectedDateHeight, z: 0 };
    const earthSel = {
        x: Math.cos(earthAngleSelected) * d,
        y: selectedDateHeight,
        z: Math.sin(earthAngleSelected) * d
    };
    const sunCur = { x: 0, y: currentDateHeight, z: 0 };
    const earthCur = {
        x: Math.cos(earthAngleCurrent) * d,
        y: currentDateHeight,
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
        selectedDateHeight,
        earthMesh ? earthMesh.position.z : earthSel.z
    );
    const sunRingEarthCenterCur = new THREE.Vector3(
        earthMesh ? earthMesh.position.x : earthCur.x,
        currentDateHeight,
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
 * Worldlines / Artemis / Lagrange / markers refresh on the final full createPlanets after the scrub ends.
 * @returns {boolean} true if the light path handled this frame
 */
function applyLightTimeScrubUpdate(zoomLevel) {
    if (planetMeshes.length !== PLANET_DATA.length) return false;
    if (orbitLines.length !== PLANET_DATA.length) return false;

    const config = ZOOM_LEVELS[zoomLevel];
    if (focusTargetOverride === 'mid' && !keepMidFocusOverrideAtZoom(zoomLevel)) {
        focusTargetOverride = null;
    }
    if (focusTargetOverride === 'moon' && zoomLevel !== 6) {
        focusTargetOverride = null;
    }
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;

    const { currentDateHeight, selectedDateHeight, selectedHeightOffset, selectedDate } = computeSceneDateHeights(zoomLevel);

    const needGhost = Math.abs(selectedHeightOffset) > 1e-6 && !tourMinimalOrbitMode;
    if (!!ghostEarth !== needGhost) return false;

    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        const earth = PLANET_DATA.find((p) => p.name === 'Earth');
        const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
        const earthX = earthPos.x;
        const earthZ = earthPos.z;
        const earthMesh = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
        if (zoomLevel === 0 && effectiveFocusTarget === 'earth') {
            const rSurf = resolveEarthGlobeSurfaceRadius(earthMesh);
            const fp = getEarthHourHandZoom0FocusPoint(
                { x: earthX, z: earthZ },
                selectedDateHeight,
                selectedDate,
                rSurf
            );
            targetFocusPoint.set(fp.x, fp.y, fp.z);
        } else if (effectiveFocusTarget === 'mid') {
            const midFrac = getFocusMidRadialFrac(zoomLevel);
            targetFocusPoint.set(earthX * midFrac, selectedDateHeight, earthZ * midFrac);
        } else {
            targetFocusPoint.set(earthX, selectedDateHeight, earthZ);
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
            targetFocusPoint.set(mxz.x, selectedDateHeight, mxz.z);
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
            targetFocusPoint.set(mxz.x, selectedDateHeight, mxz.z);
        } else {
            targetFocusPoint.set(0, selectedDateHeight, 0);
        }
    } else {
        targetFocusPoint.set(0, selectedDateHeight, 0);
    }

    if (sunMesh) sunMesh.position.y = selectedDateHeight;
    if (sunGlow) sunGlow.position.y = selectedDateHeight;
    if (sunLight) sunLight.position.y = selectedDateHeight;

    const segments = 128;
    PLANET_DATA.forEach((planetData, i) => {
        const planet = planetMeshes[i];
        if (!planet) return;
        const posXZ = getPlanetXZAtSelectedDate(planetData, selectedDate, currentDateHeight, selectedDateHeight);
        const planetAngle = Math.atan2(posXZ.z, posXZ.x);
        planet.position.set(
            posXZ.x,
            selectedDateHeight,
            posXZ.z
        );
        planet.userData.angle = planetAngle;
        planet.userData.baseHeight = selectedDateHeight;

        const line = orbitLines[i];
        if (line && line.geometry && line.geometry.attributes.position) {
            const pos = line.geometry.attributes.position;
            const arr = pos.array;
            for (let j = 0; j <= segments; j++) {
                const angle = (j / segments) * Math.PI * 2;
                arr[j * 3] = Math.cos(angle) * planetData.distance;
                arr[j * 3 + 1] = selectedDateHeight;
                arr[j * 3 + 2] = Math.sin(angle) * planetData.distance;
            }
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
                currentDateHeight,
                earthCurrentXZ.z
            );
        }
    }
    if (ghostOrbitLine && ghostOrbitLine.geometry && ghostOrbitLine.geometry.attributes.position && needGhost) {
        const earthData = PLANET_DATA.find((p) => p.name === 'Earth');
        if (earthData) {
            const pos = ghostOrbitLine.geometry.attributes.position;
            const arr = pos.array;
            for (let j = 0; j <= segments; j++) {
                const angle = (j / segments) * Math.PI * 2;
                arr[j * 3] = Math.cos(angle) * earthData.distance;
                arr[j * 3 + 1] = currentDateHeight;
                arr[j * 3 + 2] = Math.sin(angle) * earthData.distance;
            }
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
                    obj.position.set(mxz.x, selectedDateHeight, mxz.z);
                }
                if (obj.userData.role === 'earthMoonGuide' && obj.geometry && obj.geometry.attributes.position) {
                    const pa = obj.geometry.attributes.position.array;
                    pa[0] = ex;
                    pa[1] = selectedDateHeight;
                    pa[2] = ez;
                    pa[3] = mxz.x;
                    pa[4] = selectedDateHeight;
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
    if (isEarthDaylightSkyZoom(zoomLevel) && earthMeshScrub) {
        updateEarthDaylightSky(earthMeshScrub, zoomLevel);
    } else if (!isEarthDaylightSkyZoom(zoomLevel)) {
        disposeEarthDaylightSky();
    }

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

    return true;
}

function createPlanets(zoomLevel) {
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

    artemisMissionObjects.forEach((obj) => {
        if (obj && obj.parent) obj.parent.remove(obj);
    });
    artemisMissionObjects.length = 0;

    circadianWorldlines.forEach(obj => {
        flatGroup.remove(obj);
        if (sceneContentGroup) sceneContentGroup.remove(obj);
    });
    circadianWorldlines = [];
    circadianHelixMarkerGroups.forEach(obj => {
        if (sceneContentGroup) sceneContentGroup.remove(obj);
    });
    circadianHelixMarkerGroups = [];

    disposeSunEarthTimeRadials();

    const config = ZOOM_LEVELS[zoomLevel];
    if (focusTargetOverride === 'mid' && !keepMidFocusOverrideAtZoom(zoomLevel)) {
        focusTargetOverride = null;
    }
    if (focusTargetOverride === 'moon' && zoomLevel !== 6) {
        focusTargetOverride = null;
    }
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    const focusOnEarth = effectiveFocusTarget === 'earth';

    const { currentDateHeight, selectedDateHeight, selectedHeightOffset, selectedDate } = computeSceneDateHeights(zoomLevel);

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
    // For earth-focused zooms, focus on Earth's X,Z position at selected height
    // For sun-focused zooms, focus on the Sun at selected height (x=z=0)
    // Landing (0): camera tracks selected hour hand (globe exit ↔ hour label midpoint). Clock (9): Earth center.
    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        // Calculate Earth's position at selected time using exact date height
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
        const earthX = earthPos.x;
        const earthZ = earthPos.z;
        const earthMesh = planetMeshes.find((p) => p && p.userData && p.userData.name === 'Earth');
        if (zoomLevel === 0 && effectiveFocusTarget === 'earth') {
            const rSurf = resolveEarthGlobeSurfaceRadius(earthMesh);
            const fp = getEarthHourHandZoom0FocusPoint(
                { x: earthX, z: earthZ },
                selectedDateHeight,
                selectedDate,
                rSurf
            );
            targetFocusPoint.set(fp.x, fp.y, fp.z);
        } else if (effectiveFocusTarget === 'mid') {
            const midFrac = getFocusMidRadialFrac(zoomLevel);
            targetFocusPoint.set(earthX * midFrac, selectedDateHeight, earthZ * midFrac);
        } else {
            targetFocusPoint.set(earthX, selectedDateHeight, earthZ);
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
            targetFocusPoint.set(mxz.x, selectedDateHeight, mxz.z);
        } else if (earth) {
            const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
            const earthX = earthPos.x;
            const earthZ = earthPos.z;
            const midFrac = getFocusMidRadialFrac(zoomLevel);
            targetFocusPoint.set(earthX * midFrac, selectedDateHeight, earthZ * midFrac);
        } else {
            targetFocusPoint.set(0, selectedDateHeight, 0);
        }
    } else {
        // Sun-focused: point camera at the Sun's position in space-time (origin in X/Z at selected height)
        targetFocusPoint.set(0, selectedDateHeight, 0);
    }

    // Update Sun position to match selected date height
    if (sunMesh) {
        sunMesh.position.y = selectedDateHeight;
    }
    if (sunGlow) {
        sunGlow.position.y = selectedDateHeight;
    }
    if (sunLight) {
        sunLight.position.y = selectedDateHeight;
    }
    
    // Calculate scale factor for all planets based on zoom level
    // Use 30% size for all zoom levels (same as zoom levels 7+)
    let planetScaleFactor = 0.3;
    
    PLANET_DATA.forEach(planetData => {
        // Show all planets at all zoom levels
        // Scale all planets proportionally at close zoom levels
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
                position: { x: posXZ.x, y: selectedDateHeight, z: posXZ.z },
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
            planet.position.y = selectedDateHeight;
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
            ghostEarth.position.y = currentDateHeight;
            ghostEarth.position.z = earthCurrentXZ.z;

            sceneContentGroup.add(ghostEarth);
        }
        
        // Create orbit line at selected date height
        // Validate selectedDateHeight before creating geometry
        if (!isNaN(selectedDateHeight)) {
            const orbitGeometry = new THREE.BufferGeometry();
            const orbitPoints = [];
            const segments = 128;
            
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                orbitPoints.push(
                    Math.cos(angle) * planetData.distance,
                    selectedDateHeight,
                    Math.sin(angle) * planetData.distance
                );
            }
            
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
        
        // Create ghost orbit line at actual current position if offset
        if (!tourMinimalOrbitMode && planetData.name === 'Earth' && selectedHeightOffset !== 0) {
            // Validate currentDateHeight before creating geometry
            if (isNaN(currentDateHeight)) {
                console.warn('createPlanets: currentDateHeight is NaN, skipping ghost orbit line');
            } else {
                const ghostOrbitGeometry = new THREE.BufferGeometry();
                const ghostOrbitPoints = [];
                const segments = 128;
                
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    ghostOrbitPoints.push(
                        Math.cos(angle) * planetData.distance,
                        currentDateHeight,
                        Math.sin(angle) * planetData.distance
                    );
                }
                
                ghostOrbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ghostOrbitPoints, 3));
                const ghostOrbitMaterial = new THREE.LineBasicMaterial({
                    color: getOrbitLineColor(), // Darker blue in light mode
                    transparent: true,
                    opacity: SCENE_CONFIG.orbitLineOpacity * 0.3
                });
                ghostOrbitLine = new THREE.Line(ghostOrbitGeometry, ghostOrbitMaterial);
                flatGroup.add(ghostOrbitLine);
            }
        }
        
        // Create worldline using Worldlines module (skipped in intro “minimal orbit” view)
        if (tourMinimalOrbitMode) {
            // keep orbit rings + planet meshes only
        } else if (typeof Worldlines !== 'undefined' && Worldlines.createWorldline) {
            const wlClip = tourHelicalClip;
            const worldline = Worldlines.createWorldline(planetData, config.timeYears, zoomLevel, wlClip);
            if (worldline) { // Check if worldline was created successfully
                flatGroup.add(worldline);
                worldlines.push(worldline);
            }
            
            // Connector uses “selected time” color; skip while intro is revealing planet helices (year-2 demo).
            if (selectedHeightOffset !== 0 && typeof tourWorldlineRevealProgress !== 'number') {
                const connectorWorldline = Worldlines.createConnectorWorldline(
                    planetData,
                    currentDateHeight,
                    selectedDateHeight,
                    zoomLevel
                );
                if (connectorWorldline) {
                    flatGroup.add(connectorWorldline);
                    worldlines.push(connectorWorldline);
                }
            }
        } else {
            // Fallback if Worldlines module not available
            console.warn('Worldlines module not available, worldlines will not be created');
        }
    });

    const earthPlanet = planetMeshes.find((p) => p.userData && p.userData.name === 'Earth');
    if (isEarthDaylightSkyZoom(zoomLevel) && earthPlanet) {
        updateEarthDaylightSky(earthPlanet, zoomLevel);
    } else {
        disposeEarthDaylightSky();
    }

    if (!tourMinimalOrbitMode && earthPlanet) {
        addLagrangeSunEarthMarkers(earthPlanet, selectedDateHeight, zoomLevel, planetScaleFactor);
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

    if (
        isMoonLayerEffectiveAtZoom(zoomLevel) &&
        typeof ArtemisIIMission !== 'undefined' &&
        ArtemisIIMission.build &&
        earthPlanet &&
        typeof THREE !== 'undefined'
    ) {
        const built = ArtemisIIMission.build({
            THREE,
            earthPlanet,
            currentDateHeight,
            selectedDateHeight,
            calculateDateHeight,
            flatGroup,
            sceneContentGroup,
            zoomLevel,
            planetScaleFactor,
            isLightMode,
            selectedYear: getSelectedDateTime().getFullYear()
        });
        built.meshes.forEach((o) => artemisMissionObjects.push(o));
        built.lines.forEach((o) => artemisMissionObjects.push(o));
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
            window.circaevumGL.refreshAllEventLayers();
        } catch (err) { /* GL may be disposing */ }
    }
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

    if (zoomLevel === 0) {
        syncZoom0CameraToSelectedHourHand('delta');
    }

    tourNarrativeShaderWorldlinesActive =
        typeof tourWorldlineRevealProgress === 'number' &&
        !isNaN(tourWorldlineRevealProgress) &&
        tourWorldlineRevealProgress >= 0 &&
        tourWorldlineRevealProgress <= 1 &&
        worldlines.some((w) => w && w.userData && w.userData.narrClipUniform);
}

// Get marker color based on light mode
function getMarkerColor() {
    return isLightMode ? 0x000000 : 0xffffff;
}

// Get selected time color (blue) — line/mesh tint; darker in light mode so it matches label text weight
function getSelectedTimeColor() {
    return isLightMode ? 0x062d52 : 0x00FFFF
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
    const root = SCENE_CONFIG.lagrangeMarkers;
    const arcCfg = root && root.l1DayArc;
    if (!arcCfg || !arcCfg.enabled) return false;
    if (zoomLevel < 3) return false;
    if (typeof circadianState === 'undefined' || circadianState === 'off') return false;
    return isCircadianHelixZoom(zoomLevel);
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
    const yScale = Math.max(0.05, 1 - getActiveTimelineFlattenAmount() * 0.95);
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
        const yScale = Math.max(0.05, 1 - getActiveTimelineFlattenAmount() * 0.95);
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
        const frac = arcCfg.radialFractionFromSun != null ? arcCfg.radialFractionFromSun : 0.76;
        const clearance = (arcCfg.clearanceEarthRadii != null ? arcCfg.clearanceEarthRadii : 2.85) * earthRadius;
        const sunwardCap = Math.max(earthDist * 0.1, earthDist - clearance);
        const radial = Math.min(frac * earthDist, sunwardCap);
        const px = ux * radial;
        const pz = uz * radial;
        const py = hNoon;

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
        // Navy in light mode — pairs with getSelectedMarkerLineColor / getSelectedTimeColor (#062d52)
        textColor = isLightMode ? 'rgba(6, 45, 82, 0.92)' : 'rgba(0, 255, 255, 0.9)'; // Selected time
    } else {
        textColor = isLightMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)'; // Default
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

    const sprite = new THREE.Sprite(spriteMaterial);
    // Above event ribbons (see EventRenderer duration renderOrder cap) so calendar labels stay pure white/black
    sprite.renderOrder = 50;
    // Position sprite at the given angle and radius
    sprite.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);

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

    // Apply size multiplier to scale
    scale = scale * sizeMultiplier;

    const scaleY = scale * 0.25;
    const scaleX = scaleY * (canvasWidth / canvasHeight);
    sprite.scale.set(scaleX, scaleY, 1);
    sprite.userData.baseScale = { x: scaleX, y: scaleY, z: 1 };
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

// Create time marker ticks at specific heights
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
        return;
    }
    // If TimeMarkers module is not available, log a warning
    console.warn('TimeMarkers module not available');
}

function applyTimeMarkerVisibility() {
    const tierCap = tourYearMarkerReveal;
    timeMarkers.forEach(marker => {
        const isText = marker.type === 'Sprite';
        const tr = marker.userData && marker.userData.circaevumTourRevealTier;
        const tierOk =
            tierCap == null || tr === undefined || (typeof tr === 'number' && typeof tierCap === 'number' && tr <= tierCap);
        if (isText) {
            marker.visible = showTimeMarkerText && tierOk;
        } else {
            marker.visible = showTimeMarkerLines && tierOk;
        }
    });
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

    function tryPickArtemisMissionTrajectory(clientX, clientY) {
        if (!renderer || !camera || !sceneContentGroup || typeof THREE === 'undefined') return false;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        pickRaycaster.setFromCamera(pickPointer, camera);
        const hits = pickRaycaster.intersectObjects(sceneContentGroup.children, true);
        if (!hits.length) return false;

        const local = new THREE.Vector3();
        for (let hi = 0; hi < hits.length; hi++) {
            let o = hits[hi].object;
            while (o) {
                const ud = o.userData;
                if (ud && ud.type === 'MoonPhaseMarker') {
                    if (ud.artemisNavigateTimeMs != null && !isNaN(ud.artemisNavigateTimeMs)) {
                        smoothNavigateToTime(new Date(ud.artemisNavigateTimeMs));
                        return true;
                    }
                }
                if (ud && ud.type === 'ArtemisIIMission') {
                    if (ud.artemisNavigateTimeMs != null && !isNaN(ud.artemisNavigateTimeMs)) {
                        smoothNavigateToTime(new Date(ud.artemisNavigateTimeMs));
                        return true;
                    }
                    if (
                        ud.role === 'trajectoryRibbon' &&
                        ud.artemisCenterline &&
                        ud.artemisTimeMs
                    ) {
                        const line = ud.artemisCenterline;
                        const times = ud.artemisTimeMs;
                        const n = line.length / 3;
                        if (n < 2) return false;
                        local.copy(hits[hi].point);
                        o.worldToLocal(local);
                        let bestD = Infinity;
                        let bestMs = times[0];
                        for (let i = 0; i < n - 1; i++) {
                            const ax = line[i * 3];
                            const ay = line[i * 3 + 1];
                            const az = line[i * 3 + 2];
                            const bx = line[(i + 1) * 3];
                            const by = line[(i + 1) * 3 + 1];
                            const bz = line[(i + 1) * 3 + 2];
                            const abx = bx - ax;
                            const aby = by - ay;
                            const abz = bz - az;
                            const apx = local.x - ax;
                            const apy = local.y - ay;
                            const apz = local.z - az;
                            const ab2 = abx * abx + aby * aby + abz * abz;
                            let t = ab2 < 1e-20 ? 0 : (apx * abx + apy * aby + apz * abz) / ab2;
                            t = Math.max(0, Math.min(1, t));
                            const qx = ax + t * abx;
                            const qy = ay + t * aby;
                            const qz = az + t * abz;
                            const dx = local.x - qx;
                            const dy = local.y - qy;
                            const dz = local.z - qz;
                            const d2 = dx * dx + dy * dy + dz * dz;
                            if (d2 < bestD) {
                                bestD = d2;
                                const ta = times[i];
                                const tb = times[i + 1];
                                bestMs = ta + t * (tb - ta);
                            }
                        }
                        smoothNavigateToTime(new Date(bestMs));
                        return true;
                    }
                }
                o = o.parent;
            }
        }
        return false;
    }

    function trySelectEventObjectAtClientPoint(clientX, clientY, options) {
        if (!renderer || !camera || !sceneContentGroup) return false;
        if (!options || !options.skipLagrangeL1) {
            if (tryPickLagrangeL1DayNavigate(clientX, clientY)) return true;
        }
        if (tryPickArtemisMissionTrajectory(clientX, clientY)) return true;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        pickRaycaster.setFromCamera(pickPointer, camera);
        const hits = pickRaycaster.intersectObjects(sceneContentGroup.children, true);
        const eventHit = hits.find((hit) => {
            let cur = hit.object;
            while (cur) {
                if (cur.userData && cur.userData.shortEventPickable === false) return false;
                if (cur.userData && cur.userData.type === 'EventObject' && cur.userData.vevent) return true;
                cur = cur.parent;
            }
            return false;
        });
        if (!eventHit) return false;
        let target = eventHit.object;
        while (target && !(target.userData && target.userData.type === 'EventObject' && target.userData.vevent)) {
            target = target.parent;
        }
        if (!target || !target.userData || !target.userData.vevent) return false;
        if (target.userData.shortEventPickable === false) return false;
        const ve = target.userData.vevent;
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
        if (target.userData.shortEventPickable === false) return false;
        if (
            typeof EventRenderer !== 'undefined' &&
            typeof EventRenderer.isShortEventPointerPickableAtCurrentZoom === 'function' &&
            !EventRenderer.isShortEventPointerPickableAtCurrentZoom(start, end)
        ) {
            return false;
        }
        const layerId = target.userData.layerId;
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
        if (typeof window.navigateToEvent === 'function') window.navigateToEvent(start, end);
        if (useMobileSheet && typeof window.showMobileEventDetailSheet === 'function') {
            window.showMobileEventDetailSheet({
                vevent: ve,
                layerId: layerId,
                start: start,
                end: end
            });
        } else {
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
        // Keep W/S zoom stepping on stable calendar scales.
        // This avoids jumps into lunar (6) and landing camera (0) unless explicitly selected.
        const sequence = [1, 2, 3, 4, 5, 7, 8, 9, 0];
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
            setZoomLevel(key);
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
        } else if (e.key.toLowerCase() === 'x' && !blockMomentModeShortcuts) {
            toggleWebXR(); // XR mode
        } else if (e.key.toLowerCase() === 'r' && !blockMomentModeShortcuts) {
            rotate90Right(); // Rotate system 90 degrees clockwise
        } else if (e.key.toLowerCase() === 'f' && !blockMomentModeShortcuts) {
            toggleFlattenWithKey();
        }
    });

    function isShiftStePreviewKey(e) {
        return e && (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight');
    }
    document.addEventListener('keydown', (e) => {
        if (!isShiftStePreviewKey(e)) return;
        if (typeof window.setCircadianShortEventsShiftPreview === 'function') {
            window.setCircadianShortEventsShiftPreview(true);
        }
    });
    document.addEventListener('keyup', (e) => {
        if (!isShiftStePreviewKey(e)) return;
        if (typeof window.setCircadianShortEventsShiftPreview === 'function') {
            window.setCircadianShortEventsShiftPreview(false);
        }
    });
    window.addEventListener('blur', () => {
        if (typeof window.setCircadianShortEventsShiftPreview === 'function') {
            window.setCircadianShortEventsShiftPreview(false);
        }
    });
    
    // Mouse wheel zoom within current zoom level (distance dolly; [ ] / mobile buttons change zoom band)
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
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
    
    document.querySelectorAll('.zoom-option').forEach(option => {
        option.addEventListener('click', () => {
            const zoom = parseInt(option.dataset.zoom);
            if (!isNaN(zoom)) {
                setZoomLevel(zoom);
            }
        });
    });
    
    // Time marker lines and text toggles
    const markersLinesBtn = document.getElementById('markers-lines-toggle');
    const markersTextBtn = document.getElementById('markers-text-toggle');
    const markersYearBtn = document.getElementById('markers-year-toggle');
    if (markersLinesBtn) markersLinesBtn.classList.toggle('active', showTimeMarkerLines);
    if (markersLinesBtn) markersLinesBtn.addEventListener('click', toggleTimeMarkerLines);
    if (markersTextBtn) markersTextBtn.addEventListener('click', toggleTimeMarkerText);
    if (markersYearBtn) markersYearBtn.addEventListener('click', toggleTimeMarkerYearMode);

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

    const moonLayerBtn = document.getElementById('moon-layer-toggle');
    if (moonLayerBtn) {
        syncMoonLayerButton();
        moonLayerBtn.addEventListener('click', toggleMoonLayer);
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
        if (typeof window !== 'undefined' && window.circaevumGL &&
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

function returnToPresent() {
    // Reset all offset variables to zero
    selectedYearOffset = 0;
    selectedQuarterOffset = 0;
    selectedWeekOffset = 0;
    selectedDayOffset = 0;
    selectedHourOffset = 0;
    selectedLunarOffset = 0;
    selectedDecadeOffset = 0;
    
    // Re-initialize from system time
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonthInYear = now.getMonth();
    currentDayOfMonth = now.getDate();
    currentHourInDay = now.getHours();
    selectedMinuteInHour = now.getMinutes();
    currentQuarter = Math.floor(currentMonthInYear / 3);
    currentMonth = currentMonthInYear % 3;
    currentDayInWeek = now.getDay();

    // Keep per-zoom calendar decomposition consistent with getSelectedDateTime/applySelectedDateToZoomLevel.
    // This prevents a one-week jump at the end of smooth return-to-present in month/lunar zooms.
    applySelectedDateToZoomLevel(now, currentZoom);

    if (isEarthZoomRig(currentZoom)) {
        forcePolarDefaultOnInit = true;
        needPolarOrbitInit = true;
    }

    // Recreate planets and markers at current position
    createPlanets(currentZoom);
    updateTimeDisplays(); // Update time displays after returning to present
}

/** Same easing path as trajectory smooth navigation; ends on true wall-clock “now” via returnToPresent(). */
function smoothReturnToPresent() {
    if (isSmoothNavigatingTime) return;
    smoothNavigateToTime(new Date(), 1500, true);
}

function syncMoonLayerButton() {
    const btn = document.getElementById('moon-layer-toggle');
    if (btn) btn.classList.toggle('active', isMoonLayerEffectiveAtZoom(currentZoom));
}

function toggleMoonLayer() {
    showMoonLayer = !showMoonLayer;
    syncMoonLayerButton();
    const btn = document.getElementById('moon-layer-toggle');
    if (btn) {
        btn.title = showMoonLayer
            ? 'Moon, lunar path & Artemis II (M)'
            : 'Moon, lunar path & Artemis II: hidden (M)';
        btn.setAttribute(
            'aria-label',
            showMoonLayer
                ? 'Hide Moon mesh, lunar worldline, and Artemis II trajectory (M)'
                : 'Show Moon mesh, lunar worldline, and Artemis II trajectory (M)'
        );
    }
    createPlanets(currentZoom);
}

if (typeof window !== 'undefined') {
    window.toggleMoonLayer = toggleMoonLayer;
}

// createMoonWorldline moved to worldlines.js module

function toggleTimeMarkerLines() {
    showTimeMarkerLines = !showTimeMarkerLines;
    const button = document.getElementById('markers-lines-toggle');
    if (button) button.classList.toggle('active', showTimeMarkerLines);
    applyTimeMarkerVisibility();
}

function toggleTimeMarkerText() {
    showTimeMarkerText = !showTimeMarkerText;
    const button = document.getElementById('markers-text-toggle');
    if (button) button.classList.toggle('active', showTimeMarkerText);
    applyTimeMarkerVisibility();
}

function toggleTimeMarkerYearMode() {
    showFullYearTimeMarkers = !showFullYearTimeMarkers;
    const button = document.getElementById('markers-year-toggle');
    if (button) button.classList.toggle('active', showFullYearTimeMarkers);
    // Recreate markers with the new mode applied
    createTimeMarkers(currentZoom);
}

function getFlattenedY(logicalY) {
    const yScale = 1 - currentFlattenAmount * 0.95;
    return logicalY * Math.max(0.05, yScale);
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
    }
}

function updateFlattenIconVisibility() {
    const btn = document.getElementById('flatten-toggle');
    const sliderWrap = document.getElementById('flatten-slider-wrap');
    const stack = document.getElementById('scene-sliders-stack');
    const shouldShow = currentZoom >= 3;
    if (btn) btn.style.display = shouldShow ? '' : 'none';
    if (sliderWrap) sliderWrap.style.display = shouldShow ? '' : 'none';
    if (shouldShow) syncFlattenHeightSlider();
    updateCircadianHelixSliderVisibility();
    if (stack) {
        const showHelix =
            typeof isCircadianHelixZoom === 'function' &&
            isCircadianHelixZoom(currentZoom) &&
            typeof circadianState !== 'undefined' &&
            circadianState !== 'off';
        stack.style.display = shouldShow || showHelix ? 'flex' : 'none';
    }
}

/**
 * Keep flatten slider in sync with flatten on/off (F key, icon, embed).
 * Off: slider at max height (value 1) and disabled. On: interactive value = 1 - flattenIntensity.
 */
function syncFlattenHeightSlider() {
    const slider = document.getElementById('flatten-height-slider');
    if (!slider || currentZoom < 3) return;
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
    if (typeof window !== 'undefined' && window.circaevumGL && typeof window.circaevumGL.refreshAllEventLayers === 'function') {
        try {
            window.circaevumGL.refreshAllEventLayers();
        } catch (err) { /* GL may be disposing */ }
    }
    if (
        typeof EventRenderer !== 'undefined' &&
        typeof EventRenderer.updateTimelineHelixEventsForFlatten === 'function' &&
        typeof focusPoint !== 'undefined' &&
        focusPoint
    ) {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        const amount = flattenMode === 'all' ? flattenIntensity : 0;
        try {
            EventRenderer.updateTimelineHelixEventsForFlatten(gl, focusPoint.y, amount);
        } catch (err) { /* optional */ }
    }
    if (typeof focusPoint !== 'undefined' && focusPoint) {
        updateListHorizonContextArcFlatten(focusPoint.y, getActiveTimelineFlattenAmount());
    }
}

function syncFlattenToggleButtonState() {
    const btn = document.getElementById('flatten-toggle');
    if (!btn) return;
    const isOn = flattenMode !== 'off';
    btn.classList.toggle('active', isOn);
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
    if (currentZoom < 3) return;
    // Requested order: 1) regular (off), 2) markers only (full), 3) markers + event worldlines.
    if (flattenMode === 'off') flattenMode = 'markers';
    else if (flattenMode === 'markers') flattenMode = 'all';
    else flattenMode = 'off';
    syncFlattenToggleButtonState();
    syncFlattenHeightSlider();
    rebuildSceneAndEventsForFlattenChange();
}

function toggleFlattenWithKey() {
    if (currentZoom < 3) return;
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
    btn.classList.toggle('active', mode === 'lines' || mode === 'polygon3d');
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
    const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
    if (gl && typeof gl.refreshAllEventLayers === 'function') {
        try {
            gl.refreshAllEventLayers();
        } catch (err) {
            console.warn('Could not refresh event layers after long-term context fade toggle:', err);
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
    } else if (currentZoom >= 4 && currentZoom <= 7) {
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
        btn.title = `Camera focus: ${next.toUpperCase()} (C)`;
        let aria;
        if (currentZoom === 6) {
            aria = `Cycle camera focus: Moon, Earth, Sun, midpoint Sun–Earth at selected time (currently ${next.toUpperCase()})`;
        } else if (currentZoom >= 4 && currentZoom <= 7) {
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
        button.title = 'WebXR';
        button.setAttribute('aria-label', 'Enter WebXR / VR');
    } else {
        // Enter WebXR
        // Hide loading screen immediately when entering VR
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        const overlayRoot = document.getElementById('xr-ui-layer') || undefined;
        const tryEnterXR = (mode) => xrAdapter.enterXR(mode, { domOverlayRoot: overlayRoot }).then((session) => {
            button.classList.add('active');
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

        case 2: // Decade view - navigate years
            {
                const yearInDecade = currentYear % 10;
                const newYearInDecade = yearInDecade + direction;

                if (newYearInDecade < 0) {
                    selectedDecadeOffset--;
                    currentYear = currentYear - (yearInDecade + 1) + 9;
                } else if (newYearInDecade > 9) {
                    selectedDecadeOffset++;
                    currentYear = currentYear - yearInDecade + 10;
                } else {
                    currentYear += direction;
                }
            }
            break;

        case 3: // Year view - navigate by quarters
            currentQuarter += direction;

            if (currentQuarter < 0) {
                selectedYearOffset--;
                currentYear--;
                currentQuarter = 3;
            } else if (currentQuarter > 3) {
                selectedYearOffset++;
                currentYear++;
                currentQuarter = 0;
            }

            currentMonthInYear = currentQuarter * 3;
            currentMonth = 0;
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

/** Wheel / pinch distance limits within one zoom level (Moment allows closer + farther). */
function clampCameraDistanceForZoom(zoomLevel, dist) {
    const config = ZOOM_LEVELS[zoomLevel];
    const base = config && config.distance ? config.distance : dist;
    if (zoomLevel === 0) {
        return Math.max(base * 0.2, Math.min(base * 6, dist));
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
        const minGlobeStandoff = r + (momentZoom ? 0.3 : 0.5);
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
    
    // Set target camera distance for smooth transition
    targetCameraDistance = config.distance;
    
    const effectiveFocusTarget = focusTargetOverride || config.focusTarget;
    document.getElementById('current-zoom').textContent = config.name;
    document.getElementById('time-span').textContent = config.span;
    document.getElementById('focus-target').textContent = effectiveFocusTarget.toUpperCase();
    document.getElementById('worldline-height').textContent = (config.timeYears * 100).toFixed(1) + ' AU';
    
    document.querySelectorAll('.zoom-option').forEach(opt => {
        opt.classList.remove('active');
        if (parseInt(opt.dataset.zoom) === level) {
            opt.classList.add('active');
        }
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
    if (level === 0) {
        syncZoom0CameraToSelectedHourHand('snap');
    }
    updateTimeDisplays(); // Update time displays after zoom change
    updateFlattenIconVisibility();

    const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
    if (gl && typeof gl.refreshAllEventLayers === 'function') {
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
            if (btn) btn.classList.toggle('active', showFullYearTimeMarkers);
        }
        if ('showTimeMarkerLines' in partial) {
            showTimeMarkerLines = !!partial.showTimeMarkerLines;
            const btn = document.getElementById('markers-lines-toggle');
            if (btn) btn.classList.toggle('active', showTimeMarkerLines);
        }
        if ('showTimeMarkerText' in partial) {
            showTimeMarkerText = !!partial.showTimeMarkerText;
            const btn = document.getElementById('markers-text-toggle');
            if (btn) btn.classList.toggle('active', showTimeMarkerText);
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
        if ('moonLayer' in partial) {
            showMoonLayer = !!partial.moonLayer;
            syncMoonLayerButton();
            const moonBtn = document.getElementById('moon-layer-toggle');
            if (moonBtn) {
                moonBtn.title = showMoonLayer
                    ? 'Moon, lunar path & Artemis II (M)'
                    : 'Moon, lunar path & Artemis II: hidden (M)';
                moonBtn.setAttribute(
                    'aria-label',
                    showMoonLayer
                        ? 'Hide Moon mesh, lunar worldline, and Artemis II trajectory (M)'
                        : 'Show Moon mesh, lunar worldline, and Artemis II trajectory (M)'
                );
            }
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
        const onlyProgressAndCamera =
            partialKeys.length > 0 &&
            partialKeys.every((k) => k === 'tourWorldlineRevealProgress' || k === 'cameraRotation');
        if (
            onlyProgressAndCamera &&
            tourNarrativeShaderWorldlinesActive &&
            typeof Worldlines !== 'undefined' &&
            typeof Worldlines.setNarrativeClipYMax === 'function'
        ) {
            if ('tourWorldlineRevealProgress' in partial) {
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
            showMoonLayer: !!showMoonLayer,
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
            moonLayer: snap.showMoonLayer !== false,
            cameraRotation: snap.cameraRotation || undefined
        });
    };
}

/** Smoothly animates SELECTED TIME from current selection to target (e.g. Artemis trajectory click). */
let isSmoothNavigatingTime = false;
/**
 * @param {Date|string|number} targetDate
 * @param {number} [durationMs]
 * @param {boolean} [snapToLivePresent] If true (Space / return-to-present), final frame uses returnToPresent() so time matches real now.
 */
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

function smoothNavigateToTime(targetDate, durationMs, snapToLivePresent) {
    const dur = durationMs != null ? durationMs : 1350;
    const endDate = targetDate instanceof Date ? targetDate : new Date(targetDate);
    if (!endDate || isNaN(endDate.getTime())) return;
    if (isSmoothNavigatingTime) return;

    const startDate = getSelectedDateTime();
    clearEventFocusIfSelectedDayChanged(startDate, endDate);

    // Same calendar day: snap instantly (smooth lerp rebuilds the scene every frame and feels laggy).
    if (selectedCalendarDayKey(startDate) === selectedCalendarDayKey(endDate)) {
        if (snapToLivePresent) {
            returnToPresent();
        } else {
            setSelectedDateTime(endDate);
        }
        createPlanets(currentZoom);
        if (currentZoom === 0) {
            syncZoom0CameraToSelectedHourHand('delta');
        }
        updateTimeDisplays();
        refreshMoonWorldlineAfterTimeJump();
        return;
    }

    isSmoothNavigatingTime = true;
    const t0 = performance.now();

    function timeMarkersPayload() {
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

    function step(now) {
        const elapsed = now - t0;
        const u = Math.min(1, elapsed / dur);
        const eased = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const ms = startDate.getTime() + (endDate.getTime() - startDate.getTime()) * eased;
        const d = new Date(ms);
        applySelectedDateToZoomLevel(d, currentZoom);
        if (typeof TimeMarkers !== 'undefined' && TimeMarkers.updateOffsets) {
            TimeMarkers.updateOffsets(timeMarkersPayload());
        }
        createPlanets(currentZoom);
        updateTimeDisplays();
        if (u < 1) {
            requestAnimationFrame(step);
        } else {
            isSmoothNavigatingTime = false;
            if (snapToLivePresent) {
                returnToPresent();
            } else {
                setSelectedDateTime(endDate);
            }
            refreshMoonWorldlineAfterTimeJump();
        }
    }
    requestAnimationFrame(step);
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
    createPlanets(currentZoom);
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
        group.scale.set(1, yScaleLocal, 1);
        group.position.y = focusPoint.y * (1 - yScaleLocal);
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
                    obj.scale.set(b.x * mul, (b.y * mul) / yScaleLocal, b.z);
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
                    obj.scale.set(b.x * mul, b.y * mul, b.z);
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
    if (typeof window !== 'undefined') {
        window.currentFlattenAmount = currentFlattenAmount;
    }
    if (typeof flattenableGroup !== 'undefined' && flattenableGroup && typeof focusPoint !== 'undefined' && focusPoint) {
        applyFlattenToGroup(flattenableGroup, currentFlattenAmount, true);
    }
    if (typeof timeMarkersGroup !== 'undefined' && timeMarkersGroup && typeof focusPoint !== 'undefined' && focusPoint) {
        applyFlattenToGroup(timeMarkersGroup, currentTimeMarkerFlattenAmount, false);
    }
    if (
        typeof EventRenderer !== 'undefined' &&
        typeof EventRenderer.updateTimelineHelixEventsForFlatten === 'function' &&
        typeof focusPoint !== 'undefined' &&
        focusPoint
    ) {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        try {
            const helixFlattenAmt = flattenMode === 'all' ? currentFlattenAmount : 0;
            EventRenderer.updateTimelineHelixEventsForFlatten(
                gl,
                focusPoint.y,
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
        updateListHorizonContextArcFlatten(focusPoint.y, getActiveTimelineFlattenAmount());
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
    if (typeof CircadianRenderer !== 'undefined' && circadianWorldlines && circadianWorldlines.length) {
        const sdHel = getSelectedDateTime();
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
    focusPoint.x += (targetFocusPoint.x - focusPoint.x) * focusLerp;
    focusPoint.y += (targetFocusPoint.y - focusPoint.y) * focusLerp;
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

/**
 * Pick an initial zoom level (1..9) that varies between sessions, weighted
 * toward levels the user has seen least recently. Skips the landing page (0).
 * Returns null when the caller should NOT randomize (URL share state present,
 * or env not available); applies in both standalone (circaevum.com) and
 * embedded (app.circaevum.com / yin-portal iframe) contexts so the variety
 * shows up wherever a fresh session opens.
 *
 * Weighting: each candidate level gets weight 1/(1+count) where `count` is how
 * many of the last few session-starts used that level. Neglected levels float
 * up without becoming deterministic; the immediately previous level is excluded
 * so successive opens always change. History persists in localStorage.
 */
function pickInitialZoomLevel() {
    try {
        if (typeof window === 'undefined' || !window.location) return null;
        const params = new URLSearchParams(window.location.search);
        if (params.has('zoom') || params.has('focus') || params.has('e')) return null;

        const STORAGE_KEY = 'circaevum.initialZoomHistory';
        const HISTORY_LIMIT = 8;
        const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

        let history = [];
        try {
            const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) history = parsed.filter(function(v) {
                    return typeof v === 'number' && LEVELS.indexOf(v) !== -1;
                });
            }
        } catch (_) { /* localStorage may be unavailable; fall through */ }

        const lastLevel = history.length ? history[history.length - 1] : null;
        const counts = {};
        for (let i = 0; i < LEVELS.length; i++) counts[LEVELS[i]] = 0;
        for (let i = 0; i < history.length; i++) counts[history[i]] = (counts[history[i]] || 0) + 1;

        const candidates = LEVELS.filter(function(lvl) { return lvl !== lastLevel; });
        const weights = candidates.map(function(lvl) { return 1 / (1 + counts[lvl]); });
        const total = weights.reduce(function(a, b) { return a + b; }, 0);
        if (!(total > 0)) return null;

        let roll = Math.random() * total;
        let chosen = candidates[candidates.length - 1];
        for (let i = 0; i < candidates.length; i++) {
            roll -= weights[i];
            if (roll <= 0) { chosen = candidates[i]; break; }
        }

        history.push(chosen);
        if (history.length > HISTORY_LIMIT) history = history.slice(history.length - HISTORY_LIMIT);
        try {
            if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (_) { /* ignore quota / private-mode errors */ }

        return chosen;
    } catch (_) {
        return null;
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
        console.error('Three.js failed to load from CDN');
        return;
    }
    
    // Check WebGL support
    if (!webGLSupported()) {
        if (loadingText) {
            loadingText.textContent = 'WebGL not supported. Please use a modern browser.';
        }
        console.error('WebGL is not supported on this device/browser');
        return;
    }
    
    try {
        initScene();
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
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
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
