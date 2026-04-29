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
/** Pedagogical Moon mesh + dashed guide + lunar worldline + Artemis II overlay (scene icon / M). */
let showMoonLayer = true;

/** Moon layer is off at coarse zooms 1–4 (century → quarter); still on at 0, 5–9 when `showMoonLayer` is true. */
function isMoonLayerEffectiveAtZoom(zl) {
    if (!showMoonLayer) return false;
    const z = typeof zl === 'number' && !isNaN(zl) ? zl : currentZoom;
    if (z >= 1 && z <= 4) return false;
    return true;
}
let moonWorldlines = []; // Store moon worldline meshes
let lagrangeMarkerObjects = []; // Sun–Earth L1–L5 at selected time (orbital plane)
/** Core pedagogical Moon mesh + Earth–Moon dashed guide (see core/moon-mechanics.js). */
let moonMechanicObjects = [];
/** Artemis II trajectory + labels; shown when moon layer is effective (see missions/artemis-ii-mission.js). */
let artemisMissionObjects = [];
let circadianWorldlines = []; // Circadian rhythm helix (hour-hand), shown at day/clock zoom
let circadianSelectedDayLabels = []; // Sprite(s) with selected calendar day, day/clock zoom only
let circadianHelixMarkerGroups = []; // Week/month ticks along circadian helix (LineSegments)
/** Sun Hands: Sun↔Earth cylinders for current/selected time; sceneContentGroup space. */
let sunEarthTimeRadialCurrent = null;
let sunEarthTimeRadialSelected = null;
/** Earth Hands: Earth-center→surface hour vectors + square markers at hit points (zoom 0). */
let earthHandCurrent = null;
let earthHandSelected = null;
let earthHandMarkerCurrent = null;
let earthHandMarkerSelected = null;
/** List-context circle: sky-filled disks to Sun axis + rim wall; Day/Clock outer radius to Earth orbit. */
let listHorizonEarthRingMesh = null;
let listHorizonEarthRingCurrentRadius = null;
let listHorizonEarthRingTargetRadius = null;
let listHorizonEarthRingCurrentHeight = null;
let listHorizonEarthRingTargetHeight = null;
let listHorizonEarthRingEarthDistance = null;
let listHorizonEarthRingTargetZoom = null;
/** Short (<24h) circadian-scoped events: 'day' = selected calendar day only, 'year' = whole selected year. */
let circadianShortEventScope = 'day';
/** Default off so the daily helix frame is not on until the user enables it. */
let circadianState = 'off';
/** false = show calendar events only in selected year; true = all time (see scene calendar icon) */
let showAllTimelineEvents = false;
/** 'alpha' keeps hue for long-term events and fades fill opacity out-of-window; 'desaturate' uses prior gray blend behavior. */
let longEventContextFadeMode = 'alpha';
if (typeof window !== 'undefined') {
    window.getCurrentZoomLevel = function () { return currentZoom; };
    window.getCircadianRhythmState = function () { return circadianState; };
    window.getLongEventContextFadeMode = function () { return longEventContextFadeMode; };
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
            const totalSystemMonths = actualYear * 12 + actualMonth;
            const totalSelectedMonths = selectedYear * 12 + selectedMonth;
            selectedWeekOffset = totalSelectedMonths - totalSystemMonths;

            const firstOfMonth = new Date(selectedYear, selectedMonth, 1);
            const firstSundayOffset = -firstOfMonth.getDay();
            const firstSunday = new Date(selectedYear, selectedMonth, 1 + firstSundayOffset);

            const daysFromFirstSunday = Math.floor((selectedDate - firstSunday) / (1000 * 60 * 60 * 24));
            currentWeekInMonth = Math.floor(daysFromFirstSunday / 7);
            currentWeekInMonth = Math.max(0, Math.min(5, currentWeekInMonth));

            currentDayInWeek = selectedDayOfWeek;
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

/** Month (5), landing (0), week (7), day (8), clock (9): circadian helix, selected-day label, short-event ribbons. */
function isCircadianHelixZoom(zl) {
    return zl === 0 || zl === 5 || zl === 7 || zl === 8 || zl === 9;
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
            
        case 3: // Year view - selectedYearOffset + currentMonthInYear
            selected.setFullYear(actualYear + selectedYearOffset);
            selected.setMonth(currentMonthInYear);
            break;
            
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

if (typeof window !== 'undefined') window.getSelectedDateTime = getSelectedDateTime;

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
        currentTimeEl.textContent = formatDateTime(now);
    }
    if (selectedTimeEl) {
        selectedTimeEl.textContent = formatDateTime(selected);
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        scene.add(ambientLight);
        const currentDateHeight = getHeightForYear(currentYear, 1);
        sunLight = new THREE.PointLight(SCENE_CONFIG.sunColor, 3, 5000);
        sunLight.position.set(0, currentDateHeight, 0);
        sceneContentGroup.add(sunLight);
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
        selectedDate.getHours()
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

function getEarthHourHandSurfaceFocus(earthPos, selectedDateHeight, selectedDate, earthSurfaceRadius) {
    const safeDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
    const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
    const hourFrac = (safeDate.getHours() + (safeDate.getMinutes() / 60) + (safeDate.getSeconds() / 3600)) / 24;
    const hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
    const r = Number.isFinite(earthSurfaceRadius) && earthSurfaceRadius > 0 ? earthSurfaceRadius : 1.95;
    return {
        x: earthPos.x + Math.cos(hourAngleFromEarth) * r,
        y: selectedDateHeight,
        z: earthPos.z + Math.sin(hourAngleFromEarth) * r
    };
}

function getEarthHourHandPointAtRadius(earthPos, selectedDateHeight, selectedDate, radialDistance) {
    const safeDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
    const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
    const hourFrac = (safeDate.getHours() + (safeDate.getMinutes() / 60) + (safeDate.getSeconds() / 3600)) / 24;
    const hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
    const r = Number.isFinite(radialDistance) && radialDistance > 0 ? radialDistance : 1.95;
    return {
        x: earthPos.x + Math.cos(hourAngleFromEarth) * r,
        y: selectedDateHeight,
        z: earthPos.z + Math.sin(hourAngleFromEarth) * r
    };
}

function disposeSunEarthTimeRadials() {
    [
        sunEarthTimeRadialCurrent,
        sunEarthTimeRadialSelected,
        earthHandCurrent,
        earthHandSelected,
        earthHandMarkerCurrent,
        earthHandMarkerSelected
    ].forEach((mesh) => {
        if (!mesh) return;
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    });
    sunEarthTimeRadialCurrent = null;
    sunEarthTimeRadialSelected = null;
    earthHandCurrent = null;
    earthHandSelected = null;
    earthHandMarkerCurrent = null;
    earthHandMarkerSelected = null;
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
    if (z >= 9) return EVENT_LIST_MS_PER_DAY;
    if (z >= 8) return 2 * EVENT_LIST_MS_PER_DAY;
    if (z >= 7) return 7 * EVENT_LIST_MS_PER_DAY;
    if (z >= 5) return 30 * EVENT_LIST_MS_PER_DAY;
    if (z >= 3) return 120 * EVENT_LIST_MS_PER_DAY;
    return 365 * EVENT_LIST_MS_PER_DAY;
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
    listHorizonEarthRingCurrentHeight = null;
    listHorizonEarthRingTargetHeight = null;
    listHorizonEarthRingEarthDistance = null;
    listHorizonEarthRingTargetZoom = null;
}

function resolveListHorizonRingRadius(z, W) {
    // Landing camera (0) should share the same context ring envelope as clock (9).
    const zr = z === 0 ? 9 : z;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getListContextRingRadiusForZoom === 'function') {
        return TimeMarkers.getListContextRingRadiusForZoom(zr, W);
    }
    const monthOuter = W / 2;
    const weekOuter = W * 5 / 8;
    const dayInner = W * 5 / 8;
    const dayOuter = W * 3 / 4;
    const qOuter = W / 4;
    let ro;
    if (zr <= 0) ro = dayInner;
    else if (zr <= 2) ro = W * 0.5;
    else if (zr === 3) ro = qOuter;
    else if (zr === 4) ro = monthOuter;
    else if (zr <= 6) ro = weekOuter;
    else if (zr === 7) ro = dayOuter;
    else ro = W;
    const rMax = zr >= 8 ? W * 0.998 : W * 0.92;
    return Math.max(W * 0.08, Math.min(ro, rMax));
}

function rebuildListHorizonEarthRingMesh(radius, yCenter, earthW, z) {
    const T = getThreeNamespace();
    if (!T || !sceneContentGroup || !isFinite(radius) || !isFinite(yCenter) || !isFinite(earthW)) return;
    disposeListHorizonEarthRing();
    const extendEarth = Math.floor(z) >= 8;
    const mesh = buildListHorizonHoopGroup(
        T,
        radius,
        earthW,
        yCenter,
        getListHorizonRingColorHex(),
        7,
        { extendToEarthOrbit: extendEarth }
    );
    if (!mesh) return;
    sceneContentGroup.add(mesh);
    listHorizonEarthRingMesh = mesh;
}

/** Legacy accent for the hoop wall (annuli use sky shader). */
function getListHorizonRingColorHex() {
    return isLightMode ? 0x0891b2 : 0x22d3ee;
}

/**
 * Sky disk fill + original list-hoop cyan on the outer edge (`edgeColorHex` = getListHorizonRingColorHex).
 */
function createListHorizonSkyDiskMaterial(THREE, isLight, edgeColorHex) {
    const light = !!isLight;
    const zenith = new THREE.Color(light ? 0x6a9ec8 : 0x142a48);
    const skyBand = new THREE.Color(light ? 0xa8d4f5 : 0x3d7eb8);
    const twilight = new THREE.Color(light ? 0xffc9a8 : 0xc87858);
    const twilightMix = new THREE.Color(light ? 0xe8b8e0 : 0x6a5080);
    const edgeCol = new THREE.Color(edgeColorHex != null ? edgeColorHex : 0x22d3ee);
    return new THREE.ShaderMaterial({
        uniforms: {
            zenithColor: { value: zenith },
            skyBandColor: { value: skyBand },
            twilightColor: { value: twilight },
            twilightMixColor: { value: twilightMix },
            edgeColor: { value: edgeCol }
        },
        vertexShader: [
            'attribute float annulusT;',
            'varying float vAnnulusT;',
            'void main() {',
            '  vAnnulusT = annulusT;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 zenithColor;',
            'uniform vec3 skyBandColor;',
            'uniform vec3 twilightColor;',
            'uniform vec3 twilightMixColor;',
            'uniform vec3 edgeColor;',
            'varying float vAnnulusT;',
            'void main() {',
            '  float t = vAnnulusT;',
            '  vec3 c = zenithColor;',
            '  c = mix(c, skyBandColor, smoothstep(0.0, 0.48, t));',
            '  vec3 skyHi = mix(skyBandColor, vec3(0.82, 0.93, 1.0), 0.35);',
            '  c = mix(c, skyHi, smoothstep(0.28, 0.72, t));',
            '  float tw = smoothstep(0.93, 1.0, t);',
            '  vec3 twC = mix(twilightColor, twilightMixColor, 0.45 * tw);',
            '  c = mix(c, twC, tw * 0.45);',
            '  c = mix(c, vec3(0.92, 0.96, 1.0), 0.22);',
            '  float cyanEdge = smoothstep(0.76, 1.0, t);',
            '  c = mix(c, edgeColor, cyanEdge * 0.92);',
            '  float a = mix(0.04, 0.14, smoothstep(0.0, 0.38, t));',
            '  a = mix(a, 0.20, smoothstep(0.32, 0.75, t));',
            '  a = mix(a, 0.14, smoothstep(0.94, 1.0, t));',
            '  a = mix(a, min(a + 0.18, 0.34), cyanEdge * 0.65);',
            '  gl_FragColor = vec4(c, a);',
            '}'
        ].join('\n'),
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
}

/**
 * Filled disk in the plane y = const: sky gradient from center (included context) to context-circle edge.
 */
function buildListHorizonSkyDiskMesh(THREE, radius, y, nSeg, colorHex, opacity, renderOrder) {
    void opacity;
    const TWO_PI = Math.PI * 2;
    const ro = Math.max(0, radius);
    if (ro < 1e-4) return null;

    const n = Math.max(24, Math.min(96, nSeg));
    const positions = [];
    const annulusT = [];
    const indices = [];

    positions.push(0, y, 0);
    annulusT.push(0);
    const iCenter = 0;
    for (let i = 0; i < n; i++) {
        const t0 = (i / n) * TWO_PI;
        const c0 = Math.cos(t0);
        const s0 = Math.sin(t0);
        positions.push(c0 * ro, y, s0 * ro);
        annulusT.push(1);
    }
    for (let i = 0; i < n; i++) {
        const a = iCenter;
        const b = 1 + i;
        const c = 1 + ((i + 1) % n);
        indices.push(a, b, c);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('annulusT', new THREE.Float32BufferAttribute(new Float32Array(annulusT), 1));
    geom.setIndex(indices);

    const mat = createListHorizonSkyDiskMaterial(THREE, isLightMode, colorHex);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder != null ? renderOrder : 7;
    mesh.userData = { type: 'ListHorizonEarthRing' };
    return mesh;
}

/**
 * Context circle: vertical wall on the outer radius + sky-filled disks (top/bottom) covering interior to Sun axis.
 * @param {object} [opts] - `{ extendToEarthOrbit?: boolean }` relaxes outer radius cap toward W (Day/Clock).
 */
function buildListHorizonHoopGroup(THREE, rHoop, earthW, yCenter, colorHex, renderOrder, opts) {
    if (!THREE) return null;
    const TWO_PI = Math.PI * 2;
    const extendEarth = opts && opts.extendToEarthOrbit === true;
    const roCap = extendEarth ? 0.998 : 0.94;
    const ro = Math.max(earthW * 0.2, Math.min(rHoop, earthW * roCap));
    const halfH = Math.max(0.75, earthW * 0.014);
    const y0 = yCenter - halfH;
    const y1 = yCenter + halfH;

    const n = Math.max(36, Math.min(96, Math.round(52 + ro * 0.28)));

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
        const t0 = (i / n) * TWO_PI;
        const t1 = ((i + 1) / n) * TWO_PI;
        const c0 = Math.cos(t0);
        const s0 = Math.sin(t0);
        const c1 = Math.cos(t1);
        const s1 = Math.sin(t1);
        const a = addV(c0 * ro, y0, s0 * ro);
        const b = addV(c1 * ro, y0, s1 * ro);
        const c = addV(c1 * ro, y1, s1 * ro);
        const d = addV(c0 * ro, y1, s0 * ro);
        addQuad(a, b, c, d);
    }

    const wallGeom = new THREE.BufferGeometry();
    wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    wallGeom.setIndex(indices);
    wallGeom.computeVertexNormals();

    const matWall = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
    const wall = new THREE.Mesh(wallGeom, matWall);
    wall.renderOrder = renderOrder != null ? renderOrder : 7;
    wall.userData = { type: 'ListHorizonEarthRing' };

    const group = new THREE.Group();
    group.userData = { type: 'ListHorizonEarthRing' };
    group.add(wall);

    const bottom = buildListHorizonSkyDiskMesh(THREE, ro, y0, n, colorHex, null, renderOrder);
    const top = buildListHorizonSkyDiskMesh(THREE, ro, y1, n, colorHex, null, renderOrder);
    if (bottom) group.add(bottom);
    if (top) group.add(top);

    return group;
}

/**
 * Zoom-context hoop on the outer edge of the primary time-marker band for this zoom
 * (see TimeMarkers.getListContextRingRadiusForZoom): flat ring at selected time height on sceneContentGroup.
 * Hidden when list Draw-all is on.
 */
function updateListHorizonEarthRing(zoomLevel) {
    const T = getThreeNamespace();
    if (!T || !sceneContentGroup || !PLANET_DATA || !PLANET_DATA.length) return;
    if (typeof window !== 'undefined' && window.eventsListHorizonRingActive === false) {
        disposeListHorizonEarthRing();
        resetListHorizonEarthRingAnimationState();
        return;
    }

    const earth = PLANET_DATA.find((p) => p.name === 'Earth');
    if (!earth) return;

    const { selectedDateHeight } = computeSceneDateHeights(zoomLevel);
    const W = earth.distance;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : currentZoom;
    const targetRadius = resolveListHorizonRingRadius(z, W);

    listHorizonEarthRingTargetRadius = targetRadius;
    listHorizonEarthRingTargetHeight = selectedDateHeight;
    listHorizonEarthRingEarthDistance = W;
    listHorizonEarthRingTargetZoom = z;

    if (listHorizonEarthRingCurrentRadius == null || listHorizonEarthRingCurrentHeight == null || !listHorizonEarthRingMesh) {
        listHorizonEarthRingCurrentRadius = targetRadius;
        listHorizonEarthRingCurrentHeight = selectedDateHeight;
        rebuildListHorizonEarthRingMesh(listHorizonEarthRingCurrentRadius, listHorizonEarthRingCurrentHeight, W, z);
    }
}

if (typeof window !== 'undefined') {
    window.updateListHorizonEarthRingScene = function () {
        updateListHorizonEarthRing(currentZoom);
    };
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

    // Sun Hands intentionally thin/subtle.
    let tubeRSelected = Math.max(0.036, d * 0.0032);
    let tubeRCurrent = tubeRSelected * 0.52;
    if (zoomLevel === 0) {
        tubeRSelected = Math.max(0.018, d * 0.0017);
        tubeRCurrent = tubeRSelected * 0.7;
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

    const eps = 0.2;
    function near3(a, b) {
        return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
    }
    const sameRadial = near3(sunSel, sunCur) && near3(earthSel, earthCur);

    // In landing/clock zoom, hide Sun Hands so Earth Hands communicate local hour.
    if (zoomLevel !== 0 && zoomLevel !== 9) {
        if (sameRadial) {
            // Selected === current: only the red “now” radial (no duplicate blue).
            sunEarthTimeRadialCurrent = buildSunEarthRadialTube(sunCur, earthCur, tubeRSelected, 0xff0000, 10);
            if (sunEarthTimeRadialCurrent) sceneContentGroup.add(sunEarthTimeRadialCurrent);
        } else {
            // Blue (selected) wider; red (current) thinner and drawn on top (higher renderOrder).
            sunEarthTimeRadialSelected = buildSunEarthRadialTube(sunSel, earthSel, tubeRSelected, getSelectedTimeColor(), 8);
            if (sunEarthTimeRadialSelected) sceneContentGroup.add(sunEarthTimeRadialSelected);
            sunEarthTimeRadialCurrent = buildSunEarthRadialTube(sunCur, earthCur, tubeRCurrent, 0xff0000, 10);
            if (sunEarthTimeRadialCurrent) sceneContentGroup.add(sunEarthTimeRadialCurrent);
        }
    }

    if (zoomLevel === 0 || zoomLevel === 9) {
        const selectedDate = getSelectedDateTime();
        const currentDate = new Date();
        const earthMesh = planetMeshes.find(p => p.userData && p.userData.name === 'Earth');
        const earthCenterSel = earthMesh ? earthMesh.position.clone() : new THREE.Vector3(earthSel.x, selectedDateHeight, earthSel.z);
        earthCenterSel.y = selectedDateHeight;
        const earthCenterCur = earthCenterSel.clone();
        const earthSurfaceRadius = earthMesh && earthMesh.geometry && earthMesh.geometry.parameters && typeof earthMesh.geometry.parameters.radius === 'number'
            ? earthMesh.geometry.parameters.radius
            : (earth && typeof earth.size === 'number' ? earth.size : 6.5) * 0.3;
        const earthPosForHands = { x: earthCenterSel.x, z: earthCenterSel.z };
        const hitSel = getEarthHourHandSurfaceFocus(earthPosForHands, selectedDateHeight, selectedDate, earthSurfaceRadius);
        const hitCur = getEarthHourHandSurfaceFocus(earthPosForHands, selectedDateHeight, currentDate, earthSurfaceRadius);
        const hourNumberRadius = earthSurfaceRadius * 2.2;
        const handSelEnd = getEarthHourHandPointAtRadius(earthPosForHands, selectedDateHeight, selectedDate, hourNumberRadius);
        const handCurEnd = getEarthHourHandPointAtRadius(earthPosForHands, selectedDateHeight, currentDate, hourNumberRadius);

        // Earth Hand lines: axis centered at Earth origin, extending outward only.
        const earthHandRadius = Math.max(0.022, earthSurfaceRadius * 0.024);
        earthHandSelected = buildSunEarthRadialTube(
            { x: earthCenterSel.x, y: earthCenterSel.y, z: earthCenterSel.z },
            handSelEnd,
            earthHandRadius,
            0x2d8cff,
            13
        );
        if (earthHandSelected) sceneContentGroup.add(earthHandSelected);
        earthHandCurrent = buildSunEarthRadialTube(
            { x: earthCenterCur.x, y: earthCenterCur.y, z: earthCenterCur.z },
            handCurEnd,
            earthHandRadius,
            0xff0000,
            14
        );
        if (earthHandCurrent) sceneContentGroup.add(earthHandCurrent);

        function buildEarthHandSquareAtHit(hit, earthCenter, colorHex, renderOrder) {
            const hitVec = new THREE.Vector3(hit.x, hit.y, hit.z);
            const normal = new THREE.Vector3().subVectors(hitVec, earthCenter).normalize(); // perpendicular to Earth Hand
            let tangentA = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y);
            if (tangentA.lengthSq() < 1e-10) tangentA = new THREE.Vector3(1, 0, 0);
            tangentA.normalize();
            const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
            const markerSpan = Math.max(0.04, earthSurfaceRadius * 0.065);
            const markerRadius = earthSurfaceRadius + 0.006;
            const markerCenter = hitVec.clone().addScaledVector(normal, markerRadius - earthSurfaceRadius);
            const cornerOffsets = [
                [1, 1],
                [-1, 1],
                [-1, -1],
                [1, -1]
            ];
            const squareCorners = [];
            cornerOffsets.forEach((pair) => {
                const dir = new THREE.Vector3()
                    .copy(normal)
                    .addScaledVector(tangentA, pair[0] * markerSpan)
                    .addScaledVector(tangentB, pair[1] * markerSpan)
                    .normalize();
                const p = new THREE.Vector3()
                    .copy(earthCenter)
                    .addScaledVector(dir, markerRadius);
                squareCorners.push(p);
            });
            const edgeRadius = Math.max(0.012, earthSurfaceRadius * 0.015);
            return buildEarthHandSquareMarker(squareCorners, earthCenter, markerRadius, edgeRadius, colorHex, renderOrder);
        }
        earthHandMarkerSelected = buildEarthHandSquareAtHit(hitSel, earthCenterSel, 0x2d8cff, 15);
        if (earthHandMarkerSelected) sceneContentGroup.add(earthHandMarkerSelected);
        earthHandMarkerCurrent = buildEarthHandSquareAtHit(hitCur, earthCenterCur, 0xff4d4d, 16);
        if (earthHandMarkerCurrent) sceneContentGroup.add(earthHandMarkerCurrent);
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

    const { currentDateHeight, selectedDateHeight, selectedHeightOffset, selectedDate } = computeSceneDateHeights(zoomLevel);

    const needGhost = Math.abs(selectedHeightOffset) > 1e-6;
    if (!!ghostEarth !== needGhost) return false;

    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        const earth = PLANET_DATA.find((p) => p.name === 'Earth');
        const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
        const earthX = earthPos.x;
        const earthZ = earthPos.z;
        if (effectiveFocusTarget === 'mid') {
            const midFrac = getFocusMidRadialFrac(zoomLevel);
            targetFocusPoint.set(earthX * midFrac, selectedDateHeight, earthZ * midFrac);
        } else if (zoomLevel === 0) {
            const earthSurfaceRadius = (earth && typeof earth.size === 'number' ? earth.size : 6.5) * 0.3;
            const p = getEarthHourHandSurfaceFocus(earthPos, selectedDateHeight, selectedDate, earthSurfaceRadius);
            targetFocusPoint.set(p.x, p.y, p.z);
        } else {
            targetFocusPoint.set(earthX, selectedDateHeight, earthZ);
        }
    } else if (effectiveFocusTarget === 'moon') {
        const earth = PLANET_DATA.find((p) => p.name === 'Earth');
        const moonXZ =
            typeof MoonMechanics !== 'undefined' && MoonMechanics.moonXZSynodicAtHeight
                ? MoonMechanics.moonXZSynodicAtHeight.bind(MoonMechanics)
                : typeof MoonMechanics !== 'undefined' && MoonMechanics.moonXZAtHeight
                  ? MoonMechanics.moonXZAtHeight.bind(MoonMechanics)
                  : null;
        if (moonXZ && earth) {
            const mxz = moonXZ(selectedDateHeight, currentDateHeight, earth, null, selectedDate);
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

    const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;
    const moonXZScrub =
        MM && typeof MM.moonXZSynodicAtHeight === 'function'
            ? MM.moonXZSynodicAtHeight.bind(MM)
            : MM && typeof MM.moonXZAtHeight === 'function'
              ? MM.moonXZAtHeight.bind(MM)
              : null;
    if (isMoonLayerEffectiveAtZoom(zoomLevel) && MM && typeof MM.earthXZAtHeight === 'function' && moonXZScrub && moonMechanicObjects.length) {
        const earth = PLANET_DATA.find((p) => p.name === 'Earth');
        if (earth) {
            const exz = MM.earthXZAtHeight(selectedDateHeight, currentDateHeight, earth);
            const mxz = moonXZScrub(selectedDateHeight, currentDateHeight, earth, null, selectedDate);
            moonMechanicObjects.forEach((obj) => {
                if (!obj || !obj.userData) return;
                if (obj.userData.role === 'pedagogicalMoon') {
                    obj.position.set(mxz.x, selectedDateHeight, mxz.z);
                }
                if (obj.userData.role === 'earthMoonGuide' && obj.geometry && obj.geometry.attributes.position) {
                    const pa = obj.geometry.attributes.position.array;
                    pa[0] = exz.x;
                    pa[1] = selectedDateHeight;
                    pa[2] = exz.z;
                    pa[3] = mxz.x;
                    pa[4] = selectedDateHeight;
                    pa[5] = mxz.z;
                    obj.geometry.attributes.position.needsUpdate = true;
                    if (typeof obj.computeLineDistances === 'function') obj.computeLineDistances();
                }
            });
        }
    }

    updateSunEarthTimeRadials(zoomLevel);
    updateListHorizonEarthRing(zoomLevel);

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
            isLeapYear: typeof isLeapYear !== 'undefined' ? isLeapYear : null
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

    planetMeshes.forEach(p => sceneContentGroup.remove(p));
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
    circadianSelectedDayLabels.forEach(obj => {
        flatGroup.remove(obj);
        if (sceneContentGroup) sceneContentGroup.remove(obj);
    });
    circadianSelectedDayLabels = [];
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

    // Update target focus point to follow selected position (will be smoothly interpolated)
    // For earth-focused zooms, focus on Earth's X,Z position at selected height
    // For sun-focused zooms, focus on the Sun at selected height (x=z=0)
    // Landing (0) and clock (9) both use earth focus so the worldline stays visually
    // anchored; framing toward the circadian helix is handled in the polar camera rig only.
    if (effectiveFocusTarget === 'earth' || effectiveFocusTarget === 'mid') {
        // Calculate Earth's position at selected time using exact date height
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const earthPos = getPlanetXZAtSelectedDate(earth, selectedDate, currentDateHeight, selectedDateHeight);
        const earthX = earthPos.x;
        const earthZ = earthPos.z;
        if (effectiveFocusTarget === 'mid') {
            const midFrac = getFocusMidRadialFrac(zoomLevel);
            targetFocusPoint.set(earthX * midFrac, selectedDateHeight, earthZ * midFrac);
        } else if (zoomLevel === 0) {
            const earthSurfaceRadius = (earth && typeof earth.size === 'number' ? earth.size : 6.5) * 0.3;
            const p = getEarthHourHandSurfaceFocus(earthPos, selectedDateHeight, selectedDate, earthSurfaceRadius);
            targetFocusPoint.set(p.x, p.y, p.z);
        } else {
            targetFocusPoint.set(earthX, selectedDateHeight, earthZ);
        }
    } else if (effectiveFocusTarget === 'moon') {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const moonXZ =
            typeof MoonMechanics !== 'undefined' && MoonMechanics.moonXZSynodicAtHeight
                ? MoonMechanics.moonXZSynodicAtHeight.bind(MoonMechanics)
                : typeof MoonMechanics !== 'undefined' && MoonMechanics.moonXZAtHeight
                  ? MoonMechanics.moonXZAtHeight.bind(MoonMechanics)
                  : null;
        if (moonXZ && earth) {
            const mxz = moonXZ(selectedDateHeight, currentDateHeight, earth, null, selectedDate);
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
        
        const geometry = new THREE.SphereGeometry(planetSize, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: planetData.color,
            metalness: 0.3,
            roughness: 0.7
        });
        const planet = new THREE.Mesh(geometry, material);
        
        const posXZ = getPlanetXZAtSelectedDate(planetData, selectedDate, currentDateHeight, selectedDateHeight);
        const planetAngle = Math.atan2(posXZ.z, posXZ.x);
        
        // Position planet at selected date height
        planet.position.x = posXZ.x;
        planet.position.y = selectedDateHeight;
        planet.position.z = posXZ.z;
        
        planet.userData = {
            distance: planetData.distance,
            speed: planetData.speed,
            angle: planetAngle,
            name: planetData.name,
            baseHeight: selectedDateHeight
        };
        
        sceneContentGroup.add(planet);
        planetMeshes.push(planet);
        
        // Create ghost Earth at actual current position if offset
        if (planetData.name === 'Earth' && selectedHeightOffset !== 0) {
            const ghostGeometry = new THREE.SphereGeometry(planetSize, 32, 32);
            const ghostMaterial = new THREE.MeshStandardMaterial({
                color: planetData.color,
                metalness: 0.3,
                roughness: 0.7,
                transparent: true,
                opacity: 0.3
            });
            ghostEarth = new THREE.Mesh(ghostGeometry, ghostMaterial);
            
            // Position at actual current date
            const earthCurrentXZ = getPlanetXZAtSelectedDate(planetData, new Date(), currentDateHeight, currentDateHeight);
            ghostEarth.position.x = earthCurrentXZ.x;
            ghostEarth.position.y = currentDateHeight;
            ghostEarth.position.z = earthCurrentXZ.z;
            
            sceneContentGroup.add(ghostEarth); // Earth stays 3D (not flattened)
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
        if (planetData.name === 'Earth' && selectedHeightOffset !== 0) {
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
        
        // Create worldline using Worldlines module
        if (typeof Worldlines !== 'undefined' && Worldlines.createWorldline) {
            const worldline = Worldlines.createWorldline(planetData, config.timeYears, zoomLevel);
            if (worldline) { // Check if worldline was created successfully
                flatGroup.add(worldline);
                worldlines.push(worldline);
            }
            
            // Create connector worldline if viewing a different time than present
            if (selectedHeightOffset !== 0) {
                const connectorWorldline = Worldlines.createConnectorWorldline(planetData, currentDateHeight, selectedDateHeight);
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
    if (earthPlanet) {
        addLagrangeSunEarthMarkers(earthPlanet, selectedDateHeight, zoomLevel, planetScaleFactor);
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
    if (isMoonLayerEffectiveAtZoom(zoomLevel) && typeof Worldlines !== 'undefined' && Worldlines.createMoonWorldline) {
        const moonWorldline = Worldlines.createMoonWorldline(currentDateHeight, zoomLevel);
        if (moonWorldline) {
            flatGroup.add(moonWorldline);
            moonWorldlines.push(moonWorldline);
        }
    }

    // Circadian rhythm worldline (hour-hand helix): landing, month, week, day, clock — when not off.
    // Geometry morphs wrapped ↔ straight via currentCircadianStraightenAmount (updated in animate).
    if (isCircadianHelixZoom(zoomLevel) && typeof circadianState !== 'undefined' && circadianState !== 'off') {
        if (typeof CircadianRenderer !== 'undefined' && CircadianRenderer.createAnimatedHelixLine) {
            const currentHeight = typeof selectedDateHeight !== 'undefined' && !isNaN(selectedDateHeight)
                ? selectedDateHeight
                : currentDateHeight;
            const spanDays = circadianSpanDaysForZoom(zoomLevel);
            const circLineOpts = typeof window.getCircadianHelixVisualStyle === 'function'
                ? window.getCircadianHelixVisualStyle()
                : {};
            const circadianLine = CircadianRenderer.createAnimatedHelixLine(currentHeight, {
                color: circLineOpts.helixColor != null ? circLineOpts.helixColor : 0xffaa44,
                opacity: circLineOpts.helixOpacity != null ? circLineOpts.helixOpacity : 0.82,
                spanDays
            });
            if (circadianLine) {
                sceneContentGroup.add(circadianLine);
                circadianWorldlines.push(circadianLine);
            }
            if (typeof CircadianRenderer.createHelixStructureMarkersGroup === 'function') {
                const mk = CircadianRenderer.createHelixStructureMarkersGroup(spanDays);
                if (mk) {
                    sceneContentGroup.add(mk);
                    circadianHelixMarkerGroups.push(mk);
                    if (typeof CircadianRenderer.refreshHelixStructureMarkersGroup === 'function') {
                        CircadianRenderer.refreshHelixStructureMarkersGroup(
                            mk,
                            currentCircadianStraightenAmount,
                            currentHeight,
                            getSelectedDateTime()
                        );
                    }
                }
            }
        }
    }

    // Selected calendar day near Earth (same zooms as circadian helix; always, independent of straight/wrapped)
    if (isCircadianHelixZoom(zoomLevel) && earthPlanet && typeof THREE !== 'undefined') {
        const sd = getSelectedDateTime();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const labelText = `${dayNames[sd.getDay()]}, ${monNames[sd.getMonth()]} ${sd.getDate()}, ${sd.getFullYear()}`;
        const logicalFont = 'bold 44px Orbitron, system-ui, sans-serif';
        const padX = 72;
        const logicalH = 88;
        const trackEm = '0.1em';
        const measureCv = document.createElement('canvas');
        const mctx = measureCv.getContext('2d');
        mctx.font = logicalFont;
        try {
            mctx.letterSpacing = trackEm;
        } catch (err) { /* match draw path */ }
        const textW = Math.ceil(mctx.measureText(labelText).width);
        // Extra slack so year digits and commas don’t feel tight; wider canvas → wider world billboard with same aspect.
        const logicalW = Math.max(640, textW + padX * 2 + 96);
        const dpr = Math.min(3, Math.max(1.5, typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 2));

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.floor(logicalW * dpr);
        canvas.height = Math.floor(logicalH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (typeof ctx.imageSmoothingEnabled === 'boolean') ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';

        const cyan = isLightMode ? '#0369a1' : '#22d3ee';
        ctx.font = logicalFont;
        ctx.fillStyle = cyan;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        try {
            ctx.letterSpacing = trackEm;
        } catch (err) { /* older canvas */ }
        ctx.fillText(labelText, logicalW / 2, logicalH / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            opacity: 0.95,
            depthWrite: false
        });
        const spr = new THREE.Sprite(mat);
        spr.renderOrder = 40;
        const ex = earthPlanet.position.x;
        const ey = earthPlanet.position.y;
        const ez = earthPlanet.position.z;
        // Offset above Earth center along +Y (world time axis); keep label readable but nearer the globe.
        const er = earthPlanet.geometry && earthPlanet.geometry.parameters && earthPlanet.geometry.parameters.radius;
        const rise = Math.max(1.55, er ? er * 2.65 : 2.45);
        spr.position.set(ex, ey + rise, ez);
        // Match sprite quad aspect to canvas (logicalW:logicalH) so text is not stretched; scale whole
        // billboard down so it stays a comfortable width near Earth (high-DPI canvas keeps it sharp).
        const aspect = logicalW / logicalH;
        const worldH = 0.78;
        const worldW = worldH * aspect;
        spr.scale.set(worldW, worldH, 1);
        spr.userData.immuneToFlatten = true;
        // flattenableGroup scales Y each frame; without baseScale the animate loop replaces scale with (1,1/yScale,1) and squashes X.
        spr.userData.baseScale = { x: worldW, y: worldH, z: 1 };
        const dayLabelParent =
            flattenMode === 'all' && isCircadianHelixZoom(zoomLevel) ? sceneContentGroup : flatGroup;
        dayLabelParent.add(spr);
        circadianSelectedDayLabels.push(spr);
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
            if (isMoonLayerEffectiveAtZoom(zoomLevel) && typeof window.circaevumGL.refreshMoonWorldline === 'function') {
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

// Create 3D text label (using sprites for simplicity)
// Note: This function is still needed as it's passed to TimeMarkers module
// isLarge: if true, taller canvas and larger base font (year headline labels)
// sizeMultiplier: optional multiplier for text size (e.g., 0.5 for half size)
// colorType: 'red' for current time, 'blue' for selected time, false/undefined for default
function createTextLabel(text, height, radius, zoomLevel, angle = 0, colorType = false, isLarge = false, sizeMultiplier = 1.0) {
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
                isLeapYear: typeof isLeapYear !== 'undefined' ? isLeapYear : null
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
            SceneGeometry: typeof SceneGeometry !== 'undefined' ? SceneGeometry : null
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
                currentHourInDay // Needed for Zoom 8/9 hour calculation
            });
        }
        // Full-year toggle now only controls whether day markers span the entire year.
        const options = showFullYearTimeMarkers ? { fullYearScope: true } : undefined;
        TimeMarkers.createTimeMarkers(zoomLevel, options);
        applyTimeMarkerVisibility();
        return;
    }
    // If TimeMarkers module is not available, log a warning
    console.warn('TimeMarkers module not available');
}

function applyTimeMarkerVisibility() {
    timeMarkers.forEach(marker => {
        const isText = marker.type === 'Sprite';
        if (isText) {
            marker.visible = showTimeMarkerText;
        } else {
            marker.visible = showTimeMarkerLines;
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

    function trySelectEventObjectAtClientPoint(clientX, clientY) {
        if (!renderer || !camera || !sceneContentGroup) return;
        if (tryPickArtemisMissionTrajectory(clientX, clientY)) return;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        pickRaycaster.setFromCamera(pickPointer, camera);
        const hits = pickRaycaster.intersectObjects(sceneContentGroup.children, true);
        const eventHit = hits.find((hit) => {
            let cur = hit.object;
            while (cur) {
                if (cur.userData && cur.userData.type === 'EventObject' && cur.userData.vevent) return true;
                cur = cur.parent;
            }
            return false;
        });
        if (!eventHit) return;
        let target = eventHit.object;
        while (target && !(target.userData && target.userData.type === 'EventObject' && target.userData.vevent)) {
            target = target.parent;
        }
        if (!target || !target.userData || !target.userData.vevent) return;
        const ve = target.userData.vevent;
        const startRaw = ve.start || ve.startTime || ve.date || ve.dtstart?.dateTime || ve.dtstart?.date || null;
        const endRaw = ve.end || ve.endTime || ve.dtend?.dateTime || ve.dtend?.date || null;
        const start = startRaw instanceof Date ? startRaw : (startRaw ? new Date(startRaw) : null);
        const end = endRaw instanceof Date ? endRaw : (endRaw ? new Date(endRaw) : null);
        if (!start || isNaN(start.getTime())) return;
        if (typeof window.setCircaevumSelectedLayerId === 'function' && target.userData.layerId) {
            window.setCircaevumSelectedLayerId(target.userData.layerId);
        }
        if (typeof window.openEventListPanel === 'function') window.openEventListPanel();
        if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
        if (typeof window.navigateToEvent === 'function') window.navigateToEvent(start, end);
    }

    // Mouse events for desktop
    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        dragStartPos = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
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
        }
    });

    renderer.domElement.addEventListener('mouseup', (e) => {
        const wasDragging = isDragging;
        isDragging = false;
        if (!wasDragging || !dragStartPos) return;
        const dx = e.clientX - dragStartPos.x;
        const dy = e.clientY - dragStartPos.y;
        dragStartPos = null;
        if (Math.hypot(dx, dy) > 6) return;
        trySelectEventObjectAtClientPoint(e.clientX, e.clientY);
    });
    renderer.domElement.addEventListener('mouseleave', () => { isDragging = false; });
    
    // Touch events for mobile
    let lastTouchDistance = 0;
    
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            // Single touch - rotate camera
            isDragging = true;
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
    
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
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
                targetCameraDistance *= zoomFactor;
                // Clamp to reasonable limits
                const config = ZOOM_LEVELS[currentZoom];
                targetCameraDistance = Math.max(config.distance * 0.3, Math.min(config.distance * 3, targetCameraDistance));
            }
            lastTouchDistance = distance;
        }
        e.preventDefault();
    }, { passive: false });
    
    renderer.domElement.addEventListener('touchend', (e) => {
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

    // Zoom 0 (Moment): keep most shortcuts off to avoid accidental mode toggles; N still jumps to present (instant).
    const isLandingPage = currentZoom === 0;
        
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
        } else if ((e.key === '[' || e.code === 'BracketLeft') && !isLandingPage) {
            e.preventDefault();
            nudgeSelectedWallTime(-15 * 60 * 1000); // 15 minutes back
            if (typeof playTickSound === 'function') playTickSound(Math.min(9, currentZoom + 1));
        } else if ((e.key === ']' || e.code === 'BracketRight') && !isLandingPage) {
            e.preventDefault();
            nudgeSelectedWallTime(15 * 60 * 1000); // 15 minutes forward
            if (typeof playTickSound === 'function') playTickSound(Math.min(9, currentZoom + 1));
        } else if (e.key.toLowerCase() === 'a' && e.shiftKey && !isLandingPage) {
            e.preventDefault();
            nudgeSelectedWallTime(-60 * 60 * 1000); // 1 hour (finer than “one day” in week/month views)
            if (typeof playTickSound === 'function') playTickSound(Math.min(9, currentZoom + 1));
        } else if (e.key.toLowerCase() === 'd' && e.shiftKey && !isLandingPage) {
            e.preventDefault();
            nudgeSelectedWallTime(60 * 60 * 1000);
            if (typeof playTickSound === 'function') playTickSound(Math.min(9, currentZoom + 1));
        } else if (e.key.toLowerCase() === 'a') {
            navigateUnit(-1); // Navigate down one unit (previous week, day, hour, etc.)
            if (typeof playTickSound === 'function') playTickSound(currentZoom);
        } else if (e.key.toLowerCase() === 'd') {
            navigateUnit(1); // Navigate up one unit (next week, day, hour, etc.)
            if (typeof playTickSound === 'function') playTickSound(currentZoom);
        } else if (e.key.toLowerCase() === 'n') {
            returnToPresent(); // Return selection to current date/time
        } else if (e.key.toLowerCase() === 'c' && !isLandingPage) {
            toggleFocusTarget(); // Camera: toggle focus Sun/Earth
        } else if (e.key.toLowerCase() === 'l' && !isLandingPage) {
            toggleLightMode(); // Light mode
        } else if (e.key.toLowerCase() === 't' && !isLandingPage) {
            toggleTimeMarkerText(); // Time marker text
        } else if (e.key.toLowerCase() === 'm' && !isLandingPage) {
            if (e.shiftKey) {
                const soundBtn = document.getElementById('sound-toggle');
                if (soundBtn) soundBtn.click();
            } else {
                e.preventDefault();
                toggleMoonLayer();
            }
        } else if (e.key.toLowerCase() === 'x' && !isLandingPage) {
            toggleWebXR(); // XR mode
        } else if (e.key.toLowerCase() === 'r' && !isLandingPage) {
            rotate90Right(); // Rotate system 90 degrees clockwise
        } else if (e.key.toLowerCase() === 'f' && !isLandingPage) {
            toggleFlattenWithKey();
        }
    });
    
    // Mouse wheel zoom within current zoom level
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        targetCameraDistance *= zoomFactor;
        // Clamp to reasonable limits
        const config = ZOOM_LEVELS[currentZoom];
        targetCameraDistance = Math.max(config.distance * 0.3, Math.min(config.distance * 3, targetCameraDistance));
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
    const btn = document.getElementById('circadian-toggle');
    if (btn) {
        btn.classList.toggle('active', circadianState !== 'off');
        const titles = { off: 'Circadian worldline: off', straightened: 'Circadian worldline: straightened', wrapped: 'Circadian worldline: wrapped' };
        btn.title = titles[circadianState];
        btn.setAttribute('aria-label', titles[circadianState]);
    }
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
                            if (currentZoom === 0) return;
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
/** One calendar step at the current zoom (A/D); used internally by navigateUnit. */
function navigateUnitStep(direction) {
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

        case 5: // Month view — navigate weeks within month
            currentWeekInMonth += direction;

            if (currentWeekInMonth < 0) {
                selectedWeekOffset--;
                currentWeekInMonth = 5;
            } else if (currentWeekInMonth > 5) {
                selectedWeekOffset++;
                currentWeekInMonth = 0;
            }
            break;

        case 6: // Lunar zoom — keep A/D local (same week-step behavior as month zoom)
            currentWeekInMonth += direction;

            if (currentWeekInMonth < 0) {
                selectedWeekOffset--;
                currentWeekInMonth = 5;
            } else if (currentWeekInMonth > 5) {
                selectedWeekOffset++;
                currentWeekInMonth = 0;
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

        case 0: // Landing view - navigate hours
        case 8: // Day view - navigate hours
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
 */
function navigateUnit(direction, stepCount) {
    const n =
        stepCount === undefined || stepCount === null
            ? 1
            : Math.max(1, Math.min(32, Math.floor(Number(stepCount))));
    for (let i = 0; i < n; i++) {
        navigateUnitStep(direction);
    }
    createPlanets(currentZoom);
    if (currentZoom === 0) {
        // Re-seed look direction on each hour step in moment view.
        forcePolarDefaultOnInit = true;
        needPolarOrbitInit = true;
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
    let sunToEarthAngle = 0;
    let hourAngleFromEarth = 0;
    if (earthMesh) {
        const ex = earthMesh.position.x;
        const ez = earthMesh.position.z;
        sunToEarthAngle = Math.atan2(ez, ex);
        const sel = getSelectedDateTime();
        const hourFrac =
            (sel.getHours() + sel.getMinutes() / 60 + sel.getSeconds() / 3600) / 24;
        hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
    } else if (earthDef) {
        sunToEarthAngle = earthDef.startAngle;
        const sel = getSelectedDateTime();
        const hourFrac =
            (sel.getHours() + sel.getMinutes() / 60 + sel.getSeconds() / 3600) / 24;
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
    const nextPolar = isEarthZoomRig(level);
    if (nextPolar && !prevPolar) {
        needPolarOrbitInit = true;
    }
    if (level === 9 && prevZoom !== 9) {
        forcePolarDefaultOnInit = true;
        needPolarOrbitInit = true;
    }
    if (!nextPolar) {
        needPolarOrbitInit = true;
        forcePolarDefaultOnInit = false;
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
    if (level === 0) {
        // Ensure about/landing overlay is not kept open when zoom is controlled by camera.
        landingPage.classList.remove('active');
        if (controls) {
            controls.style.top = 'auto';
            controls.style.bottom = '30px';
        }
    } else {
        landingPage.classList.remove('active');
        if (controls) {
            controls.style.top = 'auto';
            controls.style.bottom = '30px';
        }
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
    updateTimeDisplays(); // Update time displays after zoom change
    updateFlattenIconVisibility();
}

// Set the selected date/time without changing the current zoom level.
// Used by external consumers (e.g. CircaevumGL.navigateToTime) so that
// the Orbital Data panel, Earth position, and time markers all snap to
// a specific date.
function setSelectedDateTime(date) {
    const targetDate = date instanceof Date ? date : new Date(date);
    if (!targetDate || isNaN(targetDate.getTime())) return;

    if (typeof applySelectedDateToZoomLevel === 'function') {
        applySelectedDateToZoomLevel(targetDate, currentZoom);
    }

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

    if (typeof createPlanets === 'function') {
        createPlanets(currentZoom);
    }
    if (typeof updateTimeDisplays === 'function') {
        updateTimeDisplays();
    }
}

/** Smoothly animates SELECTED TIME from current selection to target (e.g. Artemis trajectory click). */
let isSmoothNavigatingTime = false;
/**
 * @param {Date|string|number} targetDate
 * @param {number} [durationMs]
 * @param {boolean} [snapToLivePresent] If true (Space / return-to-present), final frame uses returnToPresent() so time matches real now.
 */
function smoothNavigateToTime(targetDate, durationMs, snapToLivePresent) {
    const dur = durationMs != null ? durationMs : 1350;
    const endDate = targetDate instanceof Date ? targetDate : new Date(targetDate);
    if (!endDate || isNaN(endDate.getTime())) return;
    if (isSmoothNavigatingTime) return;

    isSmoothNavigatingTime = true;
    const startDate = getSelectedDateTime();
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
            try {
                if (typeof window.circaevumGL !== 'undefined' && window.circaevumGL) {
                    if (isMoonLayerEffectiveAtZoom(currentZoom) && typeof window.circaevumGL.refreshMoonWorldline === 'function') {
                        window.circaevumGL.refreshMoonWorldline();
                    } else if (typeof window.circaevumGL.clearMoonWorldline === 'function') {
                        window.circaevumGL.clearMoonWorldline();
                    }
                }
            } catch (e) {
                /* optional GL wrapper */
            }
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
    if (currentZoom === 0) return;
    const d = typeof deltaMs === 'number' && !isNaN(deltaMs) ? deltaMs : 0;
    if (d === 0) return;
    const next = getSelectedDateTime();
    next.setTime(next.getTime() + d);
    applySelectedDateToZoomLevel(next, currentZoom);
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
            if (effectiveFocusTarget === 'mid') {
                const midFrac = getFocusMidRadialFrac(currentZoom);
                return new THREE.Vector3(earthPos.x * midFrac, earthPos.y, earthPos.z * midFrac);
            }
            if (currentZoom === 0) {
                const sel = getSelectedDateTime();
                const meshRadius = earthPlanet.geometry && earthPlanet.geometry.parameters && typeof earthPlanet.geometry.parameters.radius === 'number'
                    ? earthPlanet.geometry.parameters.radius
                    : 1.95;
                const p = getEarthHourHandSurfaceFocus(earthPos, earthPos.y, sel, meshRadius);
                return new THREE.Vector3(p.x, p.y, p.z);
            }
            return earthPos;
        }
    }

    if (effectiveFocusTarget === 'moon') {
        const earth = typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p.name === 'Earth') : null;
        const moonXZ =
            typeof MoonMechanics !== 'undefined' && MoonMechanics.moonXZSynodicAtHeight
                ? MoonMechanics.moonXZSynodicAtHeight.bind(MoonMechanics)
                : typeof MoonMechanics !== 'undefined' && MoonMechanics.moonXZAtHeight
                  ? MoonMechanics.moonXZAtHeight.bind(MoonMechanics)
                  : null;
        if (moonXZ && earth) {
            const refH =
                typeof calculateCurrentDateHeight === 'function' ? calculateCurrentDateHeight() : verticalOffset;
            const sel = getSelectedDateTime();
            const mxz = moonXZ(verticalOffset, refH, earth, null, sel);
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
                const isBillboard = obj.isSprite || obj.userData.type === 'EventLineLabel';
                if ((isBillboard || obj.userData.immuneToFlatten) && hasBaseScale) {
                    const b = obj.userData.baseScale;
                    const mul = getEventNameLabelScaleMultiplier(obj, selectedMsForLabelScale);
                    obj.scale.set(b.x * mul, (b.y * mul) / yScaleLocal, b.z);
                } else if (obj.userData.immuneToFlatten || obj.userData.type === 'EventLineMarker') {
                    obj.scale.set(1, 1 / yScaleLocal, 1);
                }
            });
        } else {
            group.traverse((obj) => {
                if (includeEventStagger && obj.userData && obj.userData.eventStaggerRoot && typeof obj.userData.staggerLogical === 'number') {
                    obj.position.y = obj.userData.staggerLogical;
                }
                const hasBaseScale = obj.userData && obj.userData.baseScale;
                const isBillboard = obj.isSprite || obj.userData.type === 'EventLineLabel';
                if ((isBillboard || obj.userData.immuneToFlatten) && hasBaseScale) {
                    const b = obj.userData.baseScale;
                    const mul = getEventNameLabelScaleMultiplier(obj, selectedMsForLabelScale);
                    obj.scale.set(b.x * mul, b.y * mul, b.z);
                } else if (obj.userData.immuneToFlatten || obj.userData.type === 'EventLineMarker') {
                    obj.scale.set(1, 1, 1);
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
    if (typeof flattenableGroup !== 'undefined' && flattenableGroup && typeof focusPoint !== 'undefined' && focusPoint) {
        applyFlattenToGroup(flattenableGroup, currentFlattenAmount, true);
    }
    if (typeof timeMarkersGroup !== 'undefined' && timeMarkersGroup && typeof focusPoint !== 'undefined' && focusPoint) {
        applyFlattenToGroup(timeMarkersGroup, currentTimeMarkerFlattenAmount, false);
    }

    // Smooth context-ring radius/height transitions across zoom and selected-time changes.
    if (listHorizonEarthRingMesh &&
        listHorizonEarthRingTargetRadius != null &&
        listHorizonEarthRingTargetHeight != null &&
        listHorizonEarthRingCurrentRadius != null &&
        listHorizonEarthRingCurrentHeight != null &&
        listHorizonEarthRingEarthDistance != null &&
        listHorizonEarthRingTargetZoom != null) {
        const lerp = 0.14;
        const nextR = listHorizonEarthRingCurrentRadius +
            (listHorizonEarthRingTargetRadius - listHorizonEarthRingCurrentRadius) * lerp;
        const nextY = listHorizonEarthRingCurrentHeight +
            (listHorizonEarthRingTargetHeight - listHorizonEarthRingCurrentHeight) * lerp;
        const dr = Math.abs(nextR - listHorizonEarthRingCurrentRadius);
        const dy = Math.abs(nextY - listHorizonEarthRingCurrentHeight);
        const atTargetR = Math.abs(listHorizonEarthRingTargetRadius - listHorizonEarthRingCurrentRadius) < 0.01;
        const atTargetY = Math.abs(listHorizonEarthRingTargetHeight - listHorizonEarthRingCurrentHeight) < 0.01;
        if (!atTargetR || !atTargetY) {
            listHorizonEarthRingCurrentRadius = nextR;
            listHorizonEarthRingCurrentHeight = nextY;
            if (dr > 0.0005 || dy > 0.0005) {
                rebuildListHorizonEarthRingMesh(
                    listHorizonEarthRingCurrentRadius,
                    listHorizonEarthRingCurrentHeight,
                    listHorizonEarthRingEarthDistance,
                    listHorizonEarthRingTargetZoom
                );
            }
        } else if (dr > 0 || dy > 0) {
            listHorizonEarthRingCurrentRadius = listHorizonEarthRingTargetRadius;
            listHorizonEarthRingCurrentHeight = listHorizonEarthRingTargetHeight;
            rebuildListHorizonEarthRingMesh(
                listHorizonEarthRingCurrentRadius,
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
    if (typeof CircadianRenderer !== 'undefined' && CircadianRenderer.refreshCircadianHelixLine &&
        circadianWorldlines && circadianWorldlines.length) {
        const sdHel = getSelectedDateTime();
        const chHel = calculateDateHeight(
            sdHel.getFullYear(),
            sdHel.getMonth(),
            sdHel.getDate(),
            sdHel.getHours()
        );
        circadianWorldlines.forEach(function (ln) {
            if (ln && ln.userData && ln.userData.circadianHelixAnim) {
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
    if (Math.abs(circadianStraightenTarget - currentCircadianStraightenAmount) > 0.002 &&
        typeof window !== 'undefined' && window.circaevumGL &&
        typeof window.circaevumGL.refreshAllEventLayers === 'function') {
        try {
            window.circaevumGL.refreshAllEventLayers();
        } catch (e) { /* GL may be disposing */ }
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

    // Smooth focus point transition (targetFocusPoint is set in createPlanets)
    focusPoint.x += (targetFocusPoint.x - focusPoint.x) * cameraTransitionSpeed;
    focusPoint.y += (targetFocusPoint.y - focusPoint.y) * cameraTransitionSpeed;
    focusPoint.z += (targetFocusPoint.z - focusPoint.z) * cameraTransitionSpeed;
    
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
        setZoomLevel(currentZoom);
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
