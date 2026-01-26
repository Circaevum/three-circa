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

let scene, camera, renderer;
let planetMeshes = [];
let orbitLines = [];
let worldlines = [];
let timeMarkers = [];
let currentZoom = 2;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraRotation = { x: Math.PI / 6, y: 0 };
let time = 0;
let focusPoint = null; // Initialized in initScene after THREE is loaded
let targetFocusPoint = null; // Initialized in initScene after THREE is loaded
let targetCameraDistance = 800;
let currentCameraDistance = 800;
let cameraTransitionSpeed = 0.15; // Camera transition speed for zoom level changes
let isLightMode = false;
let viewMode = 0; // 0 = angled, 1 = top-down (looking into future), 2 = bottom-up (looking into past)
let stars = null;
let showTimeMarkers = true;
let showMoonWorldline = false; // Toggle for moon worldline
let moonWorldlines = []; // Store moon worldline meshes
let sunMesh = null; // Store sun mesh for position updates
let sunGlow = null; // Store sun glow for position updates
let sunLight = null; // Store sun light for position updates

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
            break;
            
        case 2: // Decade view
            currentYear = selectedYear;
            const decadeStart = selectedYear - (selectedYear % 10);
            selectedDecadeOffset = Math.floor((selectedYear - decadeStart) / 10);
            break;
            
        case 3: // Year view - navigate by quarters
            selectedYearOffset = selectedYear - actualYear;
            // Calculate which quarter the selected month is in
            currentQuarter = Math.floor(selectedMonth / 3);
            currentMonthInYear = selectedMonth; // Full month index (0-11)
            currentMonth = selectedMonth % 3; // Month within quarter (0-2)
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
            break;
            
        case 5: // Month view - navigate by weeks
            // Calculate month offset (months since system month)
            const totalSystemMonths = actualYear * 12 + actualMonth;
            const totalSelectedMonths = selectedYear * 12 + selectedMonth;
            selectedWeekOffset = totalSelectedMonths - totalSystemMonths;
            
            // Calculate which week in the month the selected day is in
            // Find the first Sunday of the month (or before it)
            const firstOfMonth = new Date(selectedYear, selectedMonth, 1);
            const firstSundayOffset = -firstOfMonth.getDay();
            const firstSunday = new Date(selectedYear, selectedMonth, 1 + firstSundayOffset);
            
            // Calculate how many weeks from first Sunday to selected day
            const daysFromFirstSunday = Math.floor((selectedDate - firstSunday) / (1000 * 60 * 60 * 24));
            currentWeekInMonth = Math.floor(daysFromFirstSunday / 7);
            // Clamp to reasonable range (0-5)
            currentWeekInMonth = Math.max(0, Math.min(5, currentWeekInMonth));
            
            // Calculate day within week
            currentDayInWeek = selectedDayOfWeek;
            break;
            
        case 6: // Lunar view
            // Similar to month view but with lunar cycles
            const lunarCycleLength = 29.5; // days
            const daysSinceSystem = (selectedDate - now) / (1000 * 60 * 60 * 24);
            selectedLunarOffset = Math.floor(daysSinceSystem / lunarCycleLength);
            currentWeekInMonth = Math.floor((daysSinceSystem % lunarCycleLength) / 7);
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
            break;
            
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
            break;
    }
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
            
        case 5: // Month view - selectedWeekOffset + currentWeekInMonth + currentDayInWeek
            // First, move to the selected month
            const targetMonth = actualMonth + selectedWeekOffset;
            const targetYear = actualYear + Math.floor(targetMonth / 12);
            const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
            selected.setFullYear(targetYear);
            selected.setMonth(targetMonthIndex);
            
            // Now calculate the specific week and day within that month
            // Find the first Sunday of the selected month (or before it)
            const firstOfSelectedMonth = new Date(targetYear, targetMonthIndex, 1);
            const firstSundayOffset = -firstOfSelectedMonth.getDay();
            const firstSunday = new Date(targetYear, targetMonthIndex, 1 + firstSundayOffset);
            
            // Add weeks and days from the first Sunday
            const daysToAdd = (currentWeekInMonth * 7) + currentDayInWeek;
            selected.setTime(firstSunday.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
            break;
            
        case 6: // Lunar view
            // Lunar offset in ~29.5 day cycles
            selected.setDate(selected.getDate() + (selectedLunarOffset * 29));
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
            break;
            
        case 8: // Day view
        case 9: // Clock view
            const hourDiff = currentHourInDay - actualHour;
            selected.setHours(selected.getHours() + hourDiff + (selectedHourOffset * 24));
            break;
            
        default:
            // For other zoom levels, apply general offsets
            selected.setFullYear(selected.getFullYear() + selectedYearOffset);
            break;
    }
    
    return selected;
}

// Update the time displays in the info panel
function updateTimeDisplays() {
    const now = new Date();
    const selected = getSelectedDateTime();
    
    const currentTimeEl = document.getElementById('current-time');
    const selectedTimeEl = document.getElementById('selected-time');
    
    if (currentTimeEl) {
        currentTimeEl.textContent = formatDateTime(now);
    }
    if (selectedTimeEl) {
        selectedTimeEl.textContent = formatDateTime(selected);
    }
}

let ghostEarth = null; // Ghost version of Earth at current/actual position
let ghostOrbitLine = null; // Ghost version of orbit line
let targetCameraUp = null; // Target camera up vector - initialized in initScene
let currentCameraUp = null; // Current camera up vector - initialized in initScene
let targetCameraPosition = null; // Target camera position offset - initialized in initScene
let isPolarView = false; // Track if in polar view mode

// Initialize scene
function initScene() {
    // Initialize THREE.Vector3 objects now that THREE is loaded
    focusPoint = new THREE.Vector3(0, 0, 0);
    targetFocusPoint = new THREE.Vector3(0, 0, 0);
    targetCameraUp = new THREE.Vector3(0, 1, 0);
    currentCameraUp = new THREE.Vector3(0, 1, 0);
    targetCameraPosition = new THREE.Vector3(0, 0, 0);
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);
    // Remove fog for better visibility at all distances
    // scene.fog = new THREE.FogExp2(SCENE_CONFIG.backgroundColor, SCENE_CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    // Position camera to view current time (2025) - will adjust based on zoom
    const currentYearHeight = getHeightForYear(currentYear, 1);
    camera.position.set(0, currentYearHeight + 400, 800);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Limit pixel ratio on mobile for better performance (max 2)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Enable WebXR support
    renderer.xr.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    // Position sun light at current date height so it illuminates planets
    const currentDateHeight = getHeightForYear(currentYear, 1);
    sunLight = new THREE.PointLight(SCENE_CONFIG.sunColor, 3, 5000);
    sunLight.position.set(0, currentDateHeight, 0);
    scene.add(sunLight);

    createStarField();

    // Create Sun at origin (it extends vertically through all time)
    const sunGeometry = new THREE.SphereGeometry(SCENE_CONFIG.sunSize, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: SCENE_CONFIG.sunColor
    });
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(0, currentDateHeight, 0); // Position at current date
    scene.add(sunMesh);

    // Add sun glow
    const glowGeometry = new THREE.SphereGeometry(SCENE_CONFIG.sunGlowSize, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: SCENE_CONFIG.sunColor,
        transparent: true,
        opacity: 0.3
    });
    sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    sunGlow.position.set(0, currentDateHeight, 0); // Position at current date
    scene.add(sunGlow);
    
    // Create Sun's worldline (vertical line through time)
    createSunWorldline();

    window.addEventListener('resize', () => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });
}

// Create the Sun's worldline (vertical axis through time)
function createSunWorldline() {
    const points = [
        0, getHeightForYear(2000, 1), 0,  // Start at 2000
        0, getHeightForYear(2100, 1), 0   // End at 2100
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
    scene.add(sunWorldline);
}

function createStarField() {
    // Remove existing stars if any
    if (stars) {
        scene.remove(stars);
    }
    
    // Don't show stars in Century view (too far out)
    if (currentZoom === 1) {
        return;
    }
    
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: isLightMode ? 0x333333 : 0x8ecae6,
        size: 2,
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
    scene.add(stars);
}

function createPlanets(zoomLevel) {
    // Ensure Worldlines is initialized before use
    if (typeof Worldlines !== 'undefined' && typeof Worldlines.init === 'function') {
        // Initialize Worldlines if not already done
        Worldlines.init({
            scene,
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
    
    planetMeshes.forEach(p => scene.remove(p));
    orbitLines.forEach(o => scene.remove(o));
    worldlines.forEach(w => scene.remove(w));
    
    // Remove ghost elements
    if (typeof ghostEarth !== 'undefined' && ghostEarth) {
        scene.remove(ghostEarth);
        ghostEarth = null;
    }
    if (typeof ghostOrbitLine !== 'undefined' && ghostOrbitLine) {
        scene.remove(ghostOrbitLine);
        ghostOrbitLine = null;
    }
    
    planetMeshes.length = 0;
    orbitLines.length = 0;
    worldlines.length = 0;
    
    const config = ZOOM_LEVELS[zoomLevel];
    const focusOnEarth = config.focusTarget === 'earth';
    
    // The orbital plane is at the current date
    // For zoom levels 3+ (Year, Quarter, etc.), use precise date; for 1-2 use year start
    // For Zoom 3 and 4, we need to use ACTUAL system date to avoid issues with navigated variables
    let currentDateHeight;
    if (zoomLevel === 3 || zoomLevel === 4) {
        // Use centralized function if available, otherwise calculate directly
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
            // Fallback calculation
            const nowActual = new Date();
            const actualYear = nowActual.getFullYear();
            const actualMonth = nowActual.getMonth();
            const actualDay = nowActual.getDate();
            const actualHour = nowActual.getHours();
            const daysInMonth = getDaysInMonth(actualYear, actualMonth);
            const yearProgress = (actualMonth + (actualDay - 1) / daysInMonth + actualHour / (24 * daysInMonth)) / 12;
            currentDateHeight = ((actualYear - CENTURY_START) * HEIGHT_PER_YEAR) + (yearProgress * HEIGHT_PER_YEAR);
        }
    } else if (zoomLevel >= 3) {
        currentDateHeight = calculateCurrentDateHeight();
    } else {
        currentDateHeight = getHeightForYear(currentYear, 1);
    }
    
    // Calculate selected date height using the actual selected date for continuous movement
    // This ensures smooth transitions when crossing day/hour boundaries
    const selectedDate = getSelectedDateTime();
    const selectedDateHeight = calculateDateHeight(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        selectedDate.getHours()
    );
    
    // Also calculate the offset for other uses (but use exact height for Earth position)
    const selectedHeightOffset = selectedDateHeight - currentDateHeight;
    
    // Update target focus point to follow selected position (will be smoothly interpolated)
    // For earth-focused zooms, focus on Earth's X,Z position at selected height
    // For sun-focused zooms, focus on Sun at selected height
    if (config.focusTarget === 'earth') {
        // Calculate Earth's position at selected time using exact date height
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        // Calculate Earth's angle at selected time using continuous height calculation
        const yearsFromCurrentToSelected = (selectedDateHeight - currentDateHeight) / 100;
        const orbitsFromCurrentToSelected = yearsFromCurrentToSelected / earth.orbitalPeriod;
        const angleFromCurrentToSelected = orbitsFromCurrentToSelected * Math.PI * 2;
        const earthAngle = earth.startAngle - angleFromCurrentToSelected; // Counter-clockwise
        
        targetFocusPoint.set(
            Math.cos(earthAngle) * earth.distance,
            selectedDateHeight,
            Math.sin(earthAngle) * earth.distance
        );
    } else {
        // Sun-focused: just update Y
        targetFocusPoint.y = selectedDateHeight;
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
        
        // Calculate angle at selected height based on orbital motion
        // Use the same calculation method as time markers: calculate from currentDateHeight to selectedDateHeight
        const yearsFromCurrentToSelected = (selectedDateHeight - currentDateHeight) / 100;
        const orbitsFromCurrentToSelected = yearsFromCurrentToSelected / planetData.orbitalPeriod;
        const angleFromCurrentToSelected = orbitsFromCurrentToSelected * Math.PI * 2;
        const planetAngle = planetData.startAngle - angleFromCurrentToSelected; // Counter-clockwise
        
        // Position planet at selected date height
        planet.position.x = Math.cos(planetAngle) * planetData.distance;
        planet.position.y = selectedDateHeight;
        planet.position.z = Math.sin(planetAngle) * planetData.distance;
        
        planet.userData = {
            distance: planetData.distance,
            speed: planetData.speed,
            angle: planetAngle,
            name: planetData.name,
            baseHeight: selectedDateHeight
        };
        
        scene.add(planet);
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
            ghostEarth.position.x = Math.cos(planetData.startAngle) * planetData.distance;
            ghostEarth.position.y = currentDateHeight;
            ghostEarth.position.z = Math.sin(planetData.startAngle) * planetData.distance;
            
            scene.add(ghostEarth);
        }
        
        // Create orbit line at selected date height
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
        scene.add(orbitLine);
        orbitLines.push(orbitLine);
        
        // Create ghost orbit line at actual current position if offset
        if (planetData.name === 'Earth' && selectedHeightOffset !== 0) {
            const ghostOrbitGeometry = new THREE.BufferGeometry();
            const ghostOrbitPoints = [];
            
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
            scene.add(ghostOrbitLine);
        }
        
        // Create worldline using Worldlines module
        if (typeof Worldlines !== 'undefined' && Worldlines.createWorldline) {
            const worldline = Worldlines.createWorldline(planetData, config.timeYears, zoomLevel);
            if (worldline) { // Check if worldline was created successfully
                scene.add(worldline);
                worldlines.push(worldline);
            }
            
            // Create connector worldline if viewing a different time than present
            if (selectedHeightOffset !== 0) {
                const connectorWorldline = Worldlines.createConnectorWorldline(planetData, currentDateHeight, selectedDateHeight);
                if (connectorWorldline) {
                    scene.add(connectorWorldline);
                    worldlines.push(connectorWorldline);
                }
            }
        } else {
            // Fallback if Worldlines module not available
            console.warn('Worldlines module not available, worldlines will not be created');
        }
    });

    // Create moon worldline for Zoom 6 (Lunar view)
    if (zoomLevel === 6) {
        // Remove existing moon worldlines first
        moonWorldlines.forEach(mesh => {
            scene.remove(mesh);
        });
        moonWorldlines = [];
        
        // Create moon worldline
        if (typeof Worldlines !== 'undefined' && Worldlines.createMoonWorldline) {
            const moonWorldline = Worldlines.createMoonWorldline(currentDateHeight, zoomLevel);
            if (moonWorldline) {
                scene.add(moonWorldline);
                moonWorldlines.push(moonWorldline);
            }
        }
    } else {
        // Remove moon worldlines when not in Zoom 6
        moonWorldlines.forEach(mesh => {
            scene.remove(mesh);
        });
        moonWorldlines = [];
    }

    // Create time markers for this zoom level
    createTimeMarkers(zoomLevel);
}

// Get marker color based on light mode
function getMarkerColor() {
    return isLightMode ? 0x000000 : 0xffffff;
}

// Get selected time color (blue) - darker in light mode for better contrast
function getSelectedTimeColor() {
    return isLightMode ? 0x0066CC : 0x00FFFF; // Darker blue in light mode
}

// Get orbit line color - darker in light mode for better contrast
function getOrbitLineColor() {
    return isLightMode ? 0x0066CC : SCENE_CONFIG.orbitLineColor; // Darker blue in light mode
}

// Create 3D text label (using sprites for simplicity)
// Note: This function is still needed as it's passed to TimeMarkers module
// isLarge: if true, uses wider canvas and larger scale for month/year labels
// sizeMultiplier: optional multiplier for text size (e.g., 0.5 for half size)
// colorType: 'red' for current time, 'blue' for selected time, false/undefined for default
function createTextLabel(text, height, radius, zoomLevel, angle = 0, colorType = false, isLarge = false, sizeMultiplier = 1.0) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Use wider canvas for large labels (like "December 2025")
    if (isLarge) {
        canvas.width = 1536; // Extra wide for month names
        canvas.height = 256;
    } else {
        canvas.width = 512;
        canvas.height = 128;
    }
    
    // Use color based on colorType: 'red' for current time, 'blue' for selected time, false for default
    let textColor;
    if (colorType === true || colorType === 'red') {
        textColor = 'rgba(255, 0, 0, 0.9)'; // Red for current time
    } else if (colorType === 'blue') {
        // Darker blue in light mode for better contrast
        textColor = isLightMode ? 'rgba(0, 102, 204, 0.9)' : 'rgba(0, 255, 255, 0.9)'; // Cyan/blue for selected time
    } else {
        textColor = isLightMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)'; // Default
    }
    context.fillStyle = textColor;
    // Apply size multiplier to font size
    const baseFontSize = isLarge ? 80 : 60;
    const fontSize = baseFontSize * sizeMultiplier;
    context.font = `bold ${fontSize}px Orbitron`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.9
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    // Position sprite at the given angle and radius
    sprite.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    
    // Scale based on zoom level - larger for zoomed out views, smaller for zoomed in
    let scale;
    if (zoomLevel === 1) {
        scale = 3000; // Century - larger for far distance
    } else if (zoomLevel === 2) {
        scale = 200; // Decade - larger
    } else if (zoomLevel === 3) {
        scale = 37.5; // Year - reduced by 2x (was 75)
    } else if (zoomLevel === 4) {
        scale = 50; // Quarter - smaller (was 100)
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
    
    sprite.scale.set(scale, scale * 0.25, 1);
    
    scene.add(sprite);
    timeMarkers.push(sprite);
}

// Initialize TimeMarkers module once
let timeMarkersInitialized = false;
function initTimeMarkers() {
    if (!timeMarkersInitialized && typeof TimeMarkers !== 'undefined') {
        // Initialize Worldlines first (needed by TimeMarkers)
        if (typeof Worldlines !== 'undefined' && typeof Worldlines.init === 'function') {
            Worldlines.init({
                scene,
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
            scene,
            timeMarkers,
            showTimeMarkers,
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
        TimeMarkers.createTimeMarkers(zoomLevel);
        return;
    }
    // If TimeMarkers module is not available, log a warning
    console.warn('TimeMarkers module not available');
}

// Helper function to create faint context markers for adjacent time periods
// Sun-centered marker ticks (Century, Decade, Year)
// Year view - radial lines from Sun to Earth's orbital path for each month
// Quarter view - radial lines from Sun to Earth's orbital path for each month
// Year view (Zoom 3) - create markers for all 4 quarters and all 12 months of the year
// Month view - radial lines for each week
// Lunar cycle view - show moon's orbit around Earth
// Create lunar label positioned at absolute coordinates
// Week view - daily radial markers
function initControls() {
    // Mouse events for desktop
    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            cameraRotation.y -= deltaX * 0.005;
            cameraRotation.x -= deltaY * 0.005;
            cameraRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.x));
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    renderer.domElement.addEventListener('mouseup', () => { isDragging = false; });
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
    
    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isDragging) {
            // Single touch drag - rotate camera
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;
            
            cameraRotation.y -= deltaX * 0.005;
            cameraRotation.x -= deltaY * 0.005;
            cameraRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.x));
            
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
        
        // Disable WASD navigation on landing page (Zoom 0)
        const isLandingPage = currentZoom === 0;
        
        const key = parseInt(e.key);
        if (key >= 0 && key <= 9) {
            setZoomLevel(key);
        } else if (e.key.toLowerCase() === 'w' && !isLandingPage) {
            // Zoom in (increase zoom level), skip Lunar view (6)
            if (currentZoom < 9) {
                let nextZoom = currentZoom + 1;
                // Skip Lunar view (6) unless we're already at 6
                if (nextZoom === 6 && currentZoom !== 6) {
                    nextZoom = 7;
                }
                setZoomLevel(nextZoom);
            }
        } else if (e.key.toLowerCase() === 's' && !isLandingPage) {
            // Zoom out (decrease zoom level), skip Lunar view (6)
            if (currentZoom > 1) {
                let prevZoom = currentZoom - 1;
                // Skip Lunar view (6) unless we're already at 6
                if (prevZoom === 6 && currentZoom !== 6) {
                    prevZoom = 5;
                }
                setZoomLevel(prevZoom);
            }
        } else if (e.key.toLowerCase() === 'a' && !isLandingPage) {
            navigateUnit(-1); // Navigate down one unit (previous week, day, hour, etc.)
        } else if (e.key.toLowerCase() === 'd' && !isLandingPage) {
            navigateUnit(1); // Navigate up one unit (next week, day, hour, etc.)
        } else if (e.key.toLowerCase() === 'n' && !isLandingPage) {
            returnToPresent(); // Return selection to current date/time
        } else if (e.key.toLowerCase() === 'm' && !isLandingPage) {
            toggleMoonWorldline(); // Toggle moon worldline visibility
        } else if (e.key.toLowerCase() === 't' && !isLandingPage) {
            toggleTimeRotation(); // Toggle time axis rotation (horizontal view)
        } else if (e.key.toLowerCase() === 'r' && !isLandingPage) {
            rotate90Right(); // Rotate system 90 degrees clockwise
        } else if (e.code === 'Space' && !isLandingPage) {
            e.preventDefault(); // Prevent page scroll
            smoothReturnToPresent(); // Smoothly animate back to current time
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

    document.querySelectorAll('.zoom-option').forEach(option => {
        option.addEventListener('click', () => {
            const zoom = parseInt(option.dataset.zoom);
            if (!isNaN(zoom)) {
                setZoomLevel(zoom);
            }
        });
    });
    
    // Time markers toggle
    document.getElementById('markers-toggle').addEventListener('click', toggleTimeMarkers);
    
    // Light mode toggle
    document.getElementById('light-mode-toggle').addEventListener('click', toggleLightMode);
    
    // WebXR toggle
    const webxrToggle = document.getElementById('webxr-toggle');
    if (webxrToggle) {
        // Start hidden by default
        webxrToggle.style.display = 'none';
        
        // Check if WebXR is supported
        if ('xr' in navigator) {
            // Check for immersive-vr support (primary for VR headsets)
            navigator.xr.isSessionSupported('immersive-vr').then((vrSupported) => {
                if (vrSupported) {
                    webxrToggle.style.display = 'block';
                    webxrToggle.addEventListener('click', toggleWebXR);
                    console.log('WebXR: VR mode supported');
                } else {
                    // Also check for immersive-ar (AR headsets)
                    return navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
                        if (arSupported) {
                            webxrToggle.style.display = 'block';
                            webxrToggle.addEventListener('click', toggleWebXR);
                            console.log('WebXR: AR mode supported');
                        } else {
                            console.log('WebXR: Neither VR nor AR mode supported');
                        }
                    });
                }
            }).catch((error) => {
                console.log('WebXR: Error checking support', error);
                // Keep it hidden (already set above)
            });
        } else {
            console.log('WebXR: navigator.xr not available');
            // If WebXR not in navigator, keep it hidden (already set above)
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
    currentQuarter = Math.floor(currentMonthInYear / 3);
    currentMonth = currentMonthInYear % 3;
    currentWeekInMonth = Math.floor((currentDayOfMonth - 1) / 7);
    currentDayInWeek = now.getDay();
    
    // Recreate planets and markers at current position
    createPlanets(currentZoom);
    updateTimeDisplays(); // Update time displays after returning to present
}

// Smoothly animate back to current time
let isAnimatingToPresent = false;
function smoothReturnToPresent() {
    if (isAnimatingToPresent) return; // Prevent multiple simultaneous animations
    
    // Calculate the target height (current system time)
    const presentHeight = calculateCurrentDateHeight();
    
    // Set the target focus point to the present
    targetFocusPoint.y = presentHeight;
    
    // Start animation flag
    isAnimatingToPresent = true;
    
    // Animate the offsets to zero over time
    const animationDuration = 1500; // ms - slower for smoother animation
    const startTime = performance.now();
    
    // Store starting values
    const startOffsets = {
        selectedYearOffset,
        selectedQuarterOffset,
        selectedWeekOffset,
        selectedDayOffset,
        selectedHourOffset,
        selectedLunarOffset,
        selectedDecadeOffset,
        currentYear: currentYear,
        currentMonthInYear: currentMonthInYear,
        currentMonth: currentMonth,
        currentWeekInMonth: currentWeekInMonth,
        currentDayInWeek: currentDayInWeek,
        currentHourInDay: currentHourInDay
    };
    
    // Target values (current system time)
    const now = new Date();
    const targetValues = {
        currentYear: now.getFullYear(),
        currentMonthInYear: now.getMonth(),
        currentMonth: now.getMonth() % 3,
        currentWeekInMonth: Math.floor((now.getDate() - 1) / 7),
        currentDayInWeek: now.getDay(),
        currentHourInDay: now.getHours()
    };
    
    function animateStep() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        // Ease-in-out quintic for very smooth acceleration and deceleration
        const eased = progress < 0.5
            ? 16 * Math.pow(progress, 5)
            : 1 - Math.pow(-2 * progress + 2, 5) / 2;
        
        // Interpolate offsets toward zero (use floor for smooth continuous movement)
        selectedYearOffset = Math.floor(startOffsets.selectedYearOffset * (1 - eased) + 0.5);
        selectedQuarterOffset = Math.floor(startOffsets.selectedQuarterOffset * (1 - eased) + 0.5);
        selectedWeekOffset = Math.floor(startOffsets.selectedWeekOffset * (1 - eased) + 0.5);
        selectedDayOffset = Math.floor(startOffsets.selectedDayOffset * (1 - eased) + 0.5);
        selectedHourOffset = Math.floor(startOffsets.selectedHourOffset * (1 - eased) + 0.5);
        selectedLunarOffset = Math.floor(startOffsets.selectedLunarOffset * (1 - eased) + 0.5);
        selectedDecadeOffset = Math.floor(startOffsets.selectedDecadeOffset * (1 - eased) + 0.5);
        
        // Interpolate navigation variables toward current time
        currentYear = Math.floor(startOffsets.currentYear + (targetValues.currentYear - startOffsets.currentYear) * eased + 0.5);
        currentMonthInYear = Math.floor(startOffsets.currentMonthInYear + (targetValues.currentMonthInYear - startOffsets.currentMonthInYear) * eased + 0.5);
        currentMonth = Math.floor(startOffsets.currentMonth + (targetValues.currentMonth - startOffsets.currentMonth) * eased + 0.5);
        currentWeekInMonth = Math.floor(startOffsets.currentWeekInMonth + (targetValues.currentWeekInMonth - startOffsets.currentWeekInMonth) * eased + 0.5);
        currentDayInWeek = Math.floor(startOffsets.currentDayInWeek + (targetValues.currentDayInWeek - startOffsets.currentDayInWeek) * eased + 0.5);
        currentHourInDay = Math.floor(startOffsets.currentHourInDay + (targetValues.currentHourInDay - startOffsets.currentHourInDay) * eased + 0.5);
        
        // Update the scene
        createPlanets(currentZoom);
        updateTimeDisplays();
        
        if (progress < 1) {
            requestAnimationFrame(animateStep);
        } else {
            // Animation complete - ensure we're exactly at present
            isAnimatingToPresent = false;
            returnToPresent(); // Final cleanup to ensure exact values
        }
    }
    
    requestAnimationFrame(animateStep);
}

function toggleMoonWorldline() {
    showMoonWorldline = !showMoonWorldline;
    
    if (showMoonWorldline) {
        if (typeof Worldlines !== 'undefined' && Worldlines.createMoonWorldline) {
            const currentDateHeight = calculateCurrentDateHeight();
            const moonWorldline = Worldlines.createMoonWorldline(currentDateHeight, currentZoom);
            scene.add(moonWorldline);
            moonWorldlines.push(moonWorldline);
        }
    } else {
        // Remove all moon worldline meshes
        moonWorldlines.forEach(mesh => {
            scene.remove(mesh);
        });
        moonWorldlines = [];
    }
}

// createMoonWorldline moved to worldlines.js module

function toggleTimeMarkers() {
    showTimeMarkers = !showTimeMarkers;
    
    const button = document.getElementById('markers-toggle');
    button.classList.toggle('active', showTimeMarkers);
    
    // Toggle visibility of all time markers
    timeMarkers.forEach(marker => {
        marker.visible = showTimeMarkers;
    });
}

function toggleLightMode() {
    isLightMode = !isLightMode;
    
    // Toggle body class
    document.body.classList.toggle('light-mode', isLightMode);
    
    // Update button state
    const button = document.getElementById('light-mode-toggle');
    button.classList.toggle('active', isLightMode);
    
    scene.background = new THREE.Color(getBackgroundColor(viewMode, isLightMode));
    // No fog for better visibility
    // scene.fog = new THREE.FogExp2(bgColor, SCENE_CONFIG.fogDensity);
    
    // Update stars
    createStarField();
    
    // Recreate planets to update colors
    createPlanets(currentZoom);
}

function toggleWebXR() {
    const button = document.getElementById('webxr-toggle');
    
    if (renderer.xr.isPresenting) {
        // Exit WebXR
        renderer.xr.getSession().end();
    } else {
        // Enter WebXR
        if ('xr' in navigator) {
            navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            }).then((session) => {
                renderer.xr.setSession(session);
                button.classList.add('active');
                button.textContent = 'EXIT VR';
                
                // Handle session end
                session.addEventListener('end', () => {
                    button.classList.remove('active');
                    button.textContent = 'WEBXR';
                    // Restore animation loop for non-XR mode
                    renderer.setAnimationLoop(animate);
                });
            }).catch((error) => {
                console.error('Failed to start WebXR session:', error);
                alert('Failed to enter VR mode. Make sure your headset is connected and WebXR is supported.');
            });
        }
    }
}

// Toggle rotation between vertical and horizontal orientation (R key)
function navigateUnit(direction) {
    // Navigate within the current zoom level's units
    // direction: -1 for previous (A key), +1 for next (D key)
    
    switch(currentZoom) {
        case 1: // Century view - navigate by 10 years, snap to nearest decade
            currentYear += direction * 10;
            currentYear = Math.round(currentYear / 10) * 10;
            break;
            
        case 2: // Decade view - navigate years
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
            
        case 5: // Month view - navigate weeks
            currentWeekInMonth += direction;
            
            if (currentWeekInMonth < 0) {
                selectedWeekOffset--;
                currentWeekInMonth = 4;
            } else if (currentWeekInMonth > 4) {
                selectedWeekOffset++;
                currentWeekInMonth = 0;
            }
            break;
            
        case 6: // Lunar view - navigate weeks within lunar cycle
            currentWeekInMonth += direction;
            
            if (currentWeekInMonth < 0) {
                selectedLunarOffset--;
                currentWeekInMonth = 3;
            } else if (currentWeekInMonth > 3) {
                selectedLunarOffset++;
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
    }
    
    // Recreate planets and markers to show new selection
    createPlanets(currentZoom);
    updateTimeDisplays(); // Update time displays after navigation
}

function toggleTimeRotation() {
    // Cycle through view modes: angled -> top-down -> bottom-up -> angled
    viewMode = (viewMode + 1) % 3;
    
    scene.background = new THREE.Color(getBackgroundColor(viewMode, isLightMode));
    
    // Adjust camera rotation based on view mode
    const rotations = [Math.PI / 6, Math.PI / 2, -Math.PI / 2];
    cameraRotation.x = rotations[viewMode];
}

function rotate90Right() {
    // Rotate the entire scene 90 degrees clockwise around Z axis
    scene.rotation.z -= Math.PI / 2;
}

// Helper function to get background color based on view mode and light mode
function getBackgroundColor(viewMode, isLightMode) {
    const colors = isLightMode 
        ? [0xe8f4f8, 0xf8e8e8, 0xe8e8f8] // Light mode: neutral, red tinge, blue tinge
        : [0x000814, 0x140808, 0x080814]; // Dark mode: neutral, red tinge, blue tinge
    return colors[viewMode];
}

function toggleTimeRotation() {
    // Cycle through view modes: angled -> top-down -> bottom-up -> angled
    viewMode = (viewMode + 1) % 3;
    
    scene.background = new THREE.Color(getBackgroundColor(viewMode, isLightMode));
    
    // Adjust camera rotation based on view mode
    const rotations = [Math.PI / 6, Math.PI / 2, -Math.PI / 2];
    cameraRotation.x = rotations[viewMode];
}

function setZoomLevel(level) {
    // CRITICAL: Get selected date BEFORE changing currentZoom
    // This ensures we use the OLD zoom level's logic to calculate the date
    const selectedDate = getSelectedDateTime();
    
    // Now change the zoom level
    currentZoom = level;
    const config = ZOOM_LEVELS[level];
    
    // Play transition sound
    if (typeof playTransitionSound === 'function') {
        playTransitionSound();
    }
    
    const landingPage = document.getElementById('landing-page');
    const hud = document.getElementById('hud');
    const controls = document.querySelector('.controls');
    
    // Show/hide landing page
    if (level === 0) {
        landingPage.classList.add('active');
        // Move controls to top
        controls.style.top = '30px';
        controls.style.bottom = 'auto';
    } else {
        landingPage.classList.remove('active');
        // Move controls back to bottom
        controls.style.top = 'auto';
        controls.style.bottom = '30px';
    }
    
    // Set target camera distance for smooth transition
    targetCameraDistance = config.distance;
    
    document.getElementById('current-zoom').textContent = config.name;
    document.getElementById('time-span').textContent = config.span;
    document.getElementById('focus-target').textContent = config.focusTarget.toUpperCase();
    document.getElementById('worldline-height').textContent = (config.timeYears * 100).toFixed(1) + ' AU';
    
    document.querySelectorAll('.zoom-option').forEach(opt => {
        opt.classList.remove('active');
        if (parseInt(opt.dataset.zoom) === level) {
            opt.classList.add('active');
        }
    });
    
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
}

function getFocusPoint() {
    const config = ZOOM_LEVELS[currentZoom];
    
    // Set vertical offset based on zoom level
    let verticalOffset = 0;
    if (currentZoom === 1) {
        // Century view centers at 2050
        verticalOffset = getHeightForYear(2050, 1);
    } else {
        // All other views center at current date (2025)
        verticalOffset = getHeightForYear(currentYear, 1);
    }
    
    if (config.focusTarget === 'earth') {
        const earthPlanet = planetMeshes.find(p => p.userData.name === 'Earth');
        if (earthPlanet) {
            const earthPos = earthPlanet.position.clone();
            earthPos.y = verticalOffset;
            return earthPos;
        }
    }
    
    return new THREE.Vector3(0, verticalOffset, 0);
}

function animate() {
    time += 0.01;
    
    // Planets stay at rest at their accurate positions
    // No orbital animation
    
    // Smooth focus point transition (targetFocusPoint is set in createPlanets)
    focusPoint.x += (targetFocusPoint.x - focusPoint.x) * cameraTransitionSpeed;
    focusPoint.y += (targetFocusPoint.y - focusPoint.y) * cameraTransitionSpeed;
    focusPoint.z += (targetFocusPoint.z - focusPoint.z) * cameraTransitionSpeed;
    
    // Smooth camera distance transition
    currentCameraDistance += (targetCameraDistance - currentCameraDistance) * cameraTransitionSpeed;
    
    const config = ZOOM_LEVELS[currentZoom];
    const distance = currentCameraDistance;
    
    // Set target camera orientation based on zoom level
    if (currentZoom === 9) {
        isPolarView = true;
        
        // Get Earth's position
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const earthX = Math.cos(earth.startAngle) * 50;
        const earthZ = Math.sin(earth.startAngle) * 50;
        
        // Sun to Earth angle (where noon points)
        const sunToEarthAngle = Math.atan2(earthZ, earthX);
        
        // Target: Camera below Earth looking up (rotated 180°)
        targetCameraPosition.set(0, -distance, 0);
        
        // Target: Up vector points toward noon (toward Sun), rotated 180°
        targetCameraUp.set(
            -Math.cos(sunToEarthAngle), // Negated for 180° rotation
            0,
            -Math.sin(sunToEarthAngle)  // Negated for 180° rotation
        );
        
        // Debug: Log once per second
        if (Math.floor(time) % 100 === 0) {
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
    
    // Smoothly interpolate camera position
    const currentPos = new THREE.Vector3(
        camera.position.x - focusPoint.x,
        camera.position.y - focusPoint.y,
        camera.position.z - focusPoint.z
    );
    
    currentPos.lerp(targetCameraPosition, cameraTransitionSpeed);
    
    camera.position.set(
        focusPoint.x + currentPos.x,
        focusPoint.y + currentPos.y,
        focusPoint.z + currentPos.z
    );
    
    // Smoothly interpolate camera up vector
    currentCameraUp.lerp(targetCameraUp, cameraTransitionSpeed);
    camera.up.copy(currentCameraUp);
    
    camera.lookAt(focusPoint);
    
    renderer.render(scene, camera);
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
        
        // Initialize camera distance
        const config = ZOOM_LEVELS[currentZoom];
        targetCameraDistance = config.distance;
        currentCameraDistance = config.distance;
        
        // Initialize focus point to current date
        const currentDateHeight = getHeightForYear(currentYear, 1);
        focusPoint.y = currentDateHeight;
        targetFocusPoint.y = currentDateHeight;
        
        createPlanets(currentZoom);
        initControls();
        updateTimeDisplays(); // Initialize time displays
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
