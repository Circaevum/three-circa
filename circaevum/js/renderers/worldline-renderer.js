/**
 * Worldlines Module
 * 
 * Creates helical worldlines for planets based on orbital mechanics.
 * Uses SceneGeometry utilities for consistent calculations.
 */

const Worldlines = (function() {
    // Dependencies (will be injected)
    let PLANET_DATA, ZOOM_LEVELS, SCENE_CONFIG;
    let calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let currentYear, isLightMode, getSelectedTimeColor;
    let SceneGeometry;
    let calculateYearProgressForDate, getDaysInMonth;
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init(dependencies) {
        PLANET_DATA = dependencies.PLANET_DATA;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        SCENE_CONFIG = dependencies.SCENE_CONFIG;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        currentYear = dependencies.currentYear;
        isLightMode = dependencies.isLightMode;
        getSelectedTimeColor = dependencies.getSelectedTimeColor;
        SceneGeometry = dependencies.SceneGeometry;
        calculateYearProgressForDate = dependencies.calculateYearProgressForDate;
        getDaysInMonth = dependencies.getDaysInMonth;
        
        // Initialize SceneGeometry if provided
        if (SceneGeometry && typeof SceneGeometry.init === 'function') {
            SceneGeometry.init({
                PLANET_DATA,
                calculateDateHeight,
                getHeightForYear,
                calculateCurrentDateHeight,
                CENTURY_START: dependencies.CENTURY_START,
                ZOOM_LEVELS,
                currentYear,
                calculateActualCurrentDateHeight: dependencies.calculateActualCurrentDateHeight,
                calculateYearProgressForDate,
                getDaysInMonth,
                isLeapYear: dependencies.isLeapYear
            });
        }
    }
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    /**
     * Adjust color for light mode visibility
     * @param {number} color - Original color (hex)
     * @param {boolean} isLightMode - Whether in light mode
     * @returns {number} Adjusted color
     */
    function adjustColorForLightMode(color, isLightMode) {
        if (!isLightMode) return color;
        
        const saturationBoost = 1.3;
        const darkenFactor = 0.7;
        let r = ((color >> 16) & 0xFF);
        let g = ((color >> 8) & 0xFF);
        let b = (color & 0xFF);
        
        const max = Math.max(r, g, b);
        if (max > 0) {
            r = Math.min(255, r * saturationBoost * darkenFactor);
            g = Math.min(255, g * saturationBoost * darkenFactor);
            b = Math.min(255, b * saturationBoost * darkenFactor);
        }
        return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
    }
    
    // ============================================
    // WORLDLINE CREATION
    // ============================================
    
    /**
     * Create a worldline for a planet
     * @param {Object} planetData - Planet data with orbitalPeriod, startAngle, distance, color, name
     * @param {number} timeYears - Time span in years
     * @param {number} zoomLevel - Current zoom level
     * @returns {THREE.Line} THREE.js Line object
     */
    function createWorldline(planetData, timeYears, zoomLevel) {
        // Safety check: ensure module is initialized
        if (!ZOOM_LEVELS || !SceneGeometry) {
            console.error('Worldlines module not initialized. Call Worldlines.init() first.');
            return null;
        }
        
        const config = ZOOM_LEVELS[zoomLevel];
        if (!config) {
            console.error(`Invalid zoom level: ${zoomLevel}`);
            return null;
        }
        
        const currentDateHeight = SceneGeometry.getCurrentDateHeight(zoomLevel);
        
        // Validate currentDateHeight
        if (isNaN(currentDateHeight)) {
            console.error('Worldlines: currentDateHeight is NaN, skipping worldline for', planetData.name);
            return null;
        }
        
        // Calculate worldline span based on zoom level
        let startHeight, endHeight;
        
        if (zoomLevel === 1) { // Century - show full 2000-2100
            startHeight = getHeightForYear(2000, 1);
            endHeight = getHeightForYear(2100, 1);
        } else if (zoomLevel === 2) { // Decade - show 2020-2030
            startHeight = getHeightForYear(2020, 1);
            endHeight = getHeightForYear(2030, 1);
        } else if (zoomLevel === 3) { // Year - show full year with current date
            const yearHeight = 100;
            const now = new Date();
            let yearProgress;
            
            if (typeof calculateYearProgressForDate === 'function') {
                yearProgress = calculateYearProgressForDate(now.getFullYear(), now.getMonth(), now.getDate(), 0);
            } else {
                // Fallback calculation
                const daysInMonth = (typeof getDaysInMonth === 'function') 
                    ? getDaysInMonth(now.getFullYear(), now.getMonth()) 
                    : 30;
                yearProgress = (now.getMonth() + (now.getDate() - 1) / daysInMonth) / 12;
            }
            
            // Validate yearProgress
            if (isNaN(yearProgress)) {
                console.error('Worldlines: yearProgress is NaN for Zoom 3', {
                    year: now.getFullYear(),
                    month: now.getMonth(),
                    day: now.getDate(),
                    calculateYearProgressForDate: typeof calculateYearProgressForDate,
                    getDaysInMonth: typeof getDaysInMonth
                });
                // Use fallback: assume middle of year
                yearProgress = 0.5;
            }
            
            startHeight = currentDateHeight - (yearProgress * yearHeight);
            endHeight = startHeight + yearHeight;
            
            // Validate calculated heights
            if (isNaN(startHeight) || isNaN(endHeight)) {
                console.error('Worldlines: Invalid heights for Zoom 3', {
                    currentDateHeight,
                    yearProgress,
                    yearHeight,
                    startHeight,
                    endHeight
                });
                // Use fallback: full year around current date
                startHeight = currentDateHeight - (yearHeight / 2);
                endHeight = currentDateHeight + (yearHeight / 2);
            }
        } else { // Higher zooms - show time span around current date
            const spanHeight = timeYears * 100;
            const extensionFactor = 2.5; // Show 2.5x the span
            startHeight = currentDateHeight - (spanHeight * extensionFactor / 2);
            endHeight = currentDateHeight + (spanHeight * extensionFactor / 2);
        }
        
        // Validate heights before creating geometry
        if (isNaN(startHeight) || isNaN(endHeight)) {
            console.error('Worldlines: startHeight or endHeight is NaN', {
                startHeight,
                endHeight,
                planet: planetData.name,
                zoomLevel
            });
            return null;
        }
        
        // Generate curve points using SceneGeometry
        const segments = zoomLevel >= 4 ? 400 : 200;
        const points = SceneGeometry.createHelicalCurve(
            startHeight,
            endHeight,
            planetData.distance,
            currentDateHeight,
            planetData.orbitalPeriod,
            planetData.startAngle,
            segments
        );
        
        // Validate points array before creating geometry
        if (!points || points.length === 0) {
            console.error('Worldlines: createHelicalCurve returned empty points array');
            return null;
        }
        
        // Check for NaN in points array
        for (let i = 0; i < points.length; i++) {
            if (isNaN(points[i])) {
                console.error('Worldlines: NaN detected in points array at index', i, 'for', planetData.name);
                return null;
            }
        }
        
        // Create THREE.js geometry and material
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        
        // Make Earth's worldline more prominent at higher zoom levels
        const isEarth = planetData.name === 'Earth';
        const opacity = (isEarth && zoomLevel >= 3) ? 0.9 : SCENE_CONFIG.worldlineOpacity;
        const lineWidth = (isEarth && zoomLevel >= 3) ? 3 : 2;
        
        // Adjust colors for light mode visibility
        const worldlineColor = adjustColorForLightMode(planetData.color, isLightMode);
        
        const material = new THREE.LineBasicMaterial({
            color: worldlineColor,
            transparent: true,
            opacity: isLightMode ? 0.95 : opacity,
            linewidth: isLightMode ? lineWidth + 1 : lineWidth
        });
        
        return new THREE.Line(geometry, material);
    }
    
    /**
     * Create a connector worldline between current and selected time
     * @param {Object} planetData - Planet data
     * @param {number} currentHeight - Current date height
     * @param {number} selectedHeight - Selected date height
     * @returns {THREE.Line} THREE.js Line object
     */
    function createConnectorWorldline(planetData, currentHeight, selectedHeight) {
        // Validate inputs
        if (isNaN(currentHeight) || isNaN(selectedHeight)) {
            console.error('Worldlines: createConnectorWorldline received NaN heights', {
                currentHeight,
                selectedHeight,
                planet: planetData.name
            });
            return null;
        }
        
        const startHeight = Math.min(currentHeight, selectedHeight);
        const endHeight = Math.max(currentHeight, selectedHeight);
        
        // Generate curve points
        const segments = 100;
        const points = SceneGeometry.createHelicalCurve(
            startHeight,
            endHeight,
            planetData.distance,
            currentHeight,
            planetData.orbitalPeriod,
            planetData.startAngle,
            segments
        );
        
        // Validate points before creating geometry
        if (!points || points.length === 0) {
            console.error('Worldlines: createHelicalCurve returned empty points for connector');
            return null;
        }
        
        // Check for NaN in points
        for (let i = 0; i < points.length; i++) {
            if (isNaN(points[i])) {
                console.error('Worldlines: NaN in connector points at index', i);
                return null;
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        
        const material = new THREE.LineBasicMaterial({
            color: getSelectedTimeColor(),
            transparent: true,
            opacity: 0.5,
            linewidth: 2
        });
        
        return new THREE.Line(geometry, material);
    }
    
    /**
     * Create moon worldline (orbits around Earth)
     * @param {number} currentDateHeight - Current date height
     * @param {number} zoomLevel - Current zoom level
     * @returns {THREE.Line} THREE.js Line object
     */
    function createMoonWorldline(currentDateHeight, zoomLevel) {
        // Validate currentDateHeight
        if (isNaN(currentDateHeight)) {
            console.error('Worldlines: createMoonWorldline received NaN currentDateHeight');
            return null;
        }
        
        const extensionFactor = 5; // Extend 5x beyond current view
        const baseSpan = ZOOM_LEVELS[zoomLevel].timeYears * 100;
        const totalSpan = baseSpan * extensionFactor;
        const startHeight = currentDateHeight - (totalSpan / 2);
        
        // Validate calculated values
        if (isNaN(startHeight) || isNaN(totalSpan)) {
            console.error('Worldlines: Invalid moon worldline calculation', {
                currentDateHeight,
                baseSpan,
                totalSpan,
                startHeight
            });
            return null;
        }
        
        const moonDistance = 15; // Moon distance from Earth
        const lunarPeriod = 0.0767; // ~28 days in years
        const segments = 1000;
        
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        if (!earth) {
            console.error('Worldlines: Earth not found in PLANET_DATA');
            return null;
        }
        
        const timeSpanYears = totalSpan / 100;
        const earthOrbitsInSpan = timeSpanYears / earth.orbitalPeriod;
        const yearsBeforeCurrent = (currentDateHeight - startHeight) / 100;
        const earthOrbitsBeforeCurrent = yearsBeforeCurrent / earth.orbitalPeriod;
        const earthAngleBeforeCurrent = earthOrbitsBeforeCurrent * Math.PI * 2;
        const earthStartAngle = earth.startAngle + earthAngleBeforeCurrent;
        
        const moonOrbitsInSpan = timeSpanYears / lunarPeriod;
        
        const moonPoints = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const earthAngle = earthStartAngle - (t * earthOrbitsInSpan * Math.PI * 2);
            const height = startHeight + (t * totalSpan);
            
            // Validate height before proceeding
            if (isNaN(height)) {
                console.error('Worldlines: NaN height in moon worldline at segment', i);
                return null;
            }
            
            // Earth position
            const earthPos = SceneGeometry.getPosition3D(height, earthAngle, earth.distance);
            
            // Validate earthPos
            if (!earthPos || isNaN(earthPos.x) || isNaN(earthPos.y) || isNaN(earthPos.z)) {
                console.error('Worldlines: Invalid earthPos in moon worldline at segment', i);
                return null;
            }
            
            // Sun to Earth direction
            const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
            
            // Moon phase progress
            const moonPhaseProgress = (t * moonOrbitsInSpan) % 1;
            const moonAngleRelativeToSun = sunToEarthAngle + Math.PI - (moonPhaseProgress * Math.PI * 2);
            
            // Moon position relative to Earth
            const moonPos = SceneGeometry.getPosition3D(0, moonAngleRelativeToSun, moonDistance);
            
            // Validate moonPos
            if (!moonPos || isNaN(moonPos.x) || isNaN(moonPos.y) || isNaN(moonPos.z)) {
                console.error('Worldlines: Invalid moonPos in moon worldline at segment', i);
                return null;
            }
            
            moonPoints.push(earthPos.x + moonPos.x, height, earthPos.z + moonPos.z);
        }
        
        // Validate moonPoints before creating geometry
        for (let i = 0; i < moonPoints.length; i++) {
            if (isNaN(moonPoints[i])) {
                console.error('Worldlines: NaN in moonPoints at index', i);
                return null;
            }
        }
        
        const moonGeometry = new THREE.BufferGeometry();
        moonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(moonPoints, 3));
        
        // Moon worldline color adapts to light mode
        const moonColor = isLightMode ? 0x666666 : 0x888888;
        const moonMaterial = new THREE.LineBasicMaterial({
            color: moonColor,
            transparent: true,
            opacity: 0.4,
            linewidth: 1
        });
        
        return new THREE.Line(moonGeometry, moonMaterial);
    }
    
    return {
        init,
        createWorldline,
        createConnectorWorldline,
        createMoonWorldline
    };
})();
