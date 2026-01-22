/**
 * Worldlines Module
 * 
 * Creates helical worldlines for planets based on orbital mechanics.
 * Uses SceneGeometry utilities for consistent calculations.
 */

const Worldlines = (function() {
    // Dependencies (will be injected)
    let scene, PLANET_DATA, ZOOM_LEVELS, SCENE_CONFIG;
    let calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let CENTURY_START, currentYear, isLightMode, getSelectedTimeColor;
    let SceneGeometry;
    let calculateYearProgressForDate, getDaysInMonth;
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init(dependencies) {
        scene = dependencies.scene;
        PLANET_DATA = dependencies.PLANET_DATA;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        SCENE_CONFIG = dependencies.SCENE_CONFIG;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        CENTURY_START = dependencies.CENTURY_START;
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
                CENTURY_START,
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
            const nowWorldline = new Date();
            const actualYear = nowWorldline.getFullYear();
            const actualMonth = nowWorldline.getMonth();
            const actualDay = nowWorldline.getDate();
            // Use centralized year progress calculation if available
            let yearProgress;
            if (typeof calculateYearProgressForDate === 'function') {
                yearProgress = calculateYearProgressForDate(actualYear, actualMonth, actualDay, 0);
            } else {
                // Fallback
                const daysInMonth = getDaysInMonth ? getDaysInMonth(actualYear, actualMonth) : 30;
                yearProgress = (actualMonth + (actualDay - 1) / daysInMonth) / 12;
            }
            startHeight = currentDateHeight - (yearProgress * yearHeight);
            endHeight = startHeight + yearHeight;
        } else { // Higher zooms - show time span around current date
            const spanHeight = timeYears * 100;
            const extensionFactor = 2.5; // Show 2.5x the span
            startHeight = currentDateHeight - (spanHeight * extensionFactor / 2);
            endHeight = currentDateHeight + (spanHeight * extensionFactor / 2);
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
        
        // Create THREE.js geometry and material
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        
        // Make Earth's worldline more prominent at higher zoom levels
        const isEarth = planetData.name === 'Earth';
        const opacity = (isEarth && zoomLevel >= 3) ? 0.9 : SCENE_CONFIG.worldlineOpacity;
        const lineWidth = (isEarth && zoomLevel >= 3) ? 3 : 2;
        
        // Adjust colors for light mode visibility
        let worldlineColor = planetData.color;
        if (isLightMode) {
            const saturationBoost = 1.3;
            const darkenFactor = 0.7;
            let r = ((worldlineColor >> 16) & 0xFF);
            let g = ((worldlineColor >> 8) & 0xFF);
            let b = (worldlineColor & 0xFF);
            
            const max = Math.max(r, g, b);
            if (max > 0) {
                r = Math.min(255, r * saturationBoost * darkenFactor);
                g = Math.min(255, g * saturationBoost * darkenFactor);
                b = Math.min(255, b * saturationBoost * darkenFactor);
            }
            worldlineColor = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
        }
        
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
        const extensionFactor = 5; // Extend 5x beyond current view
        const baseSpan = ZOOM_LEVELS[zoomLevel].timeYears * 100;
        const totalSpan = baseSpan * extensionFactor;
        const startHeight = currentDateHeight - (totalSpan / 2);
        
        const moonDistance = 15; // Moon distance from Earth
        const lunarPeriod = 0.0767; // ~28 days in years
        const segments = 1000;
        
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
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
            
            // Earth position
            const earthPos = SceneGeometry.getPosition3D(height, earthAngle, earth.distance);
            
            // Sun to Earth direction
            const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
            
            // Moon phase progress
            const moonPhaseProgress = (t * moonOrbitsInSpan) % 1;
            const moonAngleRelativeToSun = sunToEarthAngle + Math.PI - (moonPhaseProgress * Math.PI * 2);
            
            // Moon position relative to Earth
            const moonPos = SceneGeometry.getPosition3D(0, moonAngleRelativeToSun, moonDistance);
            moonPoints.push(earthPos.x + moonPos.x, height, earthPos.z + moonPos.z);
        }
        
        const moonGeometry = new THREE.BufferGeometry();
        moonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(moonPoints, 3));
        
        const moonMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
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
