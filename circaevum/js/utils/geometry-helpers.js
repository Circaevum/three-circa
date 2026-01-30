/**
 * Scene Geometry Utilities
 * 
 * Shared geometry calculations for worldlines, time marker curves, lines, and labels.
 * All use the same equations for consistency.
 */

const SceneGeometry = (function() {
    // Dependencies (will be injected)
    let PLANET_DATA, calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let CENTURY_START, ZOOM_LEVELS, currentYear;
    let calculateActualCurrentDateHeight, calculateYearProgressForDate, getDaysInMonth;
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init(dependencies) {
        PLANET_DATA = dependencies.PLANET_DATA;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        CENTURY_START = dependencies.CENTURY_START;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        currentYear = dependencies.currentYear;
        calculateActualCurrentDateHeight = dependencies.calculateActualCurrentDateHeight;
        calculateYearProgressForDate = dependencies.calculateYearProgressForDate;
        getDaysInMonth = dependencies.getDaysInMonth;
    }
    
    // ============================================
    // ANGLE CALCULATIONS
    // ============================================
    
    /**
     * Calculate the orbital angle for a given height
     * @param {number} height - Height in scene units
     * @param {number} currentHeight - Current date height
     * @param {number} orbitalPeriod - Orbital period in years (default: Earth's)
     * @param {number} startAngle - Starting angle offset (default: Earth's)
     * @returns {number} Angle in radians
     */
    function getAngle(height, currentHeight, orbitalPeriod = null, startAngle = null) {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const period = orbitalPeriod || earth.orbitalPeriod;
        const start = startAngle !== null ? startAngle : earth.startAngle;
        
        const years = (height - currentHeight) / 100;
        const orbits = years / period;
        return start - (orbits * Math.PI * 2);
    }
    
    /**
     * Calculate angle for a specific planet
     * @param {number} height - Height in scene units
     * @param {number} currentHeight - Current date height
     * @param {Object} planetData - Planet data with orbitalPeriod and startAngle
     * @returns {number} Angle in radians
     */
    function getPlanetAngle(height, currentHeight, planetData) {
        return getAngle(height, currentHeight, planetData.orbitalPeriod, planetData.startAngle);
    }
    
    // ============================================
    // 3D POSITION CALCULATIONS
    // ============================================
    
    /**
     * Convert height, angle, and radius to 3D position
     * @param {number} height - Height (Y coordinate)
     * @param {number} angle - Angle in radians
     * @param {number} radius - Radius (distance from center)
     * @returns {{x: number, y: number, z: number}}
     */
    function getPosition3D(height, angle, radius) {
        // Validate inputs
        if (isNaN(height) || isNaN(angle) || isNaN(radius)) {
            console.error('SceneGeometry.getPosition3D: Invalid inputs', { height, angle, radius });
            return { x: 0, y: 0, z: 0 };
        }
        
        const x = Math.cos(angle) * radius;
        const y = height;
        const z = Math.sin(angle) * radius;
        
        // Validate outputs
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
            console.error('SceneGeometry.getPosition3D: NaN in calculation', { x, y, z, height, angle, radius });
            return { x: 0, y: 0, z: 0 };
        }
        
        return { x, y, z };
    }
    
    // ============================================
    // HELICAL CURVE GENERATION
    // ============================================
    
    /**
     * Generate points for a helical curve (like worldlines and time marker curves)
     * @param {number} startHeight - Starting height
     * @param {number} endHeight - Ending height
     * @param {number} radius - Radius from center
     * @param {number} currentHeight - Current date height for angle calculation
     * @param {number} orbitalPeriod - Orbital period in years
     * @param {number} startAngle - Starting angle offset
     * @param {number} segments - Number of segments (default: 64)
     * @returns {Array<number>} Flat array of [x, y, z, x, y, z, ...] points
     */
    function createHelicalCurve(startHeight, endHeight, radius, currentHeight, orbitalPeriod, startAngle, segments = 64) {
        // Validate inputs
        if (isNaN(startHeight) || isNaN(endHeight) || isNaN(radius) || isNaN(currentHeight) || isNaN(orbitalPeriod) || isNaN(startAngle)) {
            console.error('SceneGeometry.createHelicalCurve: Invalid input parameters', {
                startHeight,
                endHeight,
                radius,
                currentHeight,
                orbitalPeriod,
                startAngle
            });
            return [];
        }
        
        const points = [];
        const totalHeight = endHeight - startHeight;
        const timeSpanYears = totalHeight / 100;
        const orbitsInSpan = timeSpanYears / orbitalPeriod;
        
        // Validate calculated values
        if (isNaN(totalHeight) || isNaN(timeSpanYears) || isNaN(orbitsInSpan)) {
            console.error('SceneGeometry.createHelicalCurve: Invalid calculated values', {
                totalHeight,
                timeSpanYears,
                orbitsInSpan
            });
            return [];
        }
        
        // Calculate starting angle based on how far back from current date
        const yearsBeforeCurrent = (currentHeight - startHeight) / 100;
        const orbitsBeforeCurrent = yearsBeforeCurrent / orbitalPeriod;
        const angleBeforeCurrent = orbitsBeforeCurrent * Math.PI * 2;
        const curveStartAngle = startAngle + angleBeforeCurrent;
        
        // Validate angle calculations
        if (isNaN(curveStartAngle)) {
            console.error('SceneGeometry.createHelicalCurve: Invalid curveStartAngle', {
                yearsBeforeCurrent,
                orbitsBeforeCurrent,
                angleBeforeCurrent,
                startAngle
            });
            return [];
        }
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = curveStartAngle - (t * orbitsInSpan * Math.PI * 2);
            const height = startHeight + (t * totalHeight);
            
            // Validate height and angle before getting position
            if (isNaN(height) || isNaN(angle)) {
                console.error('SceneGeometry.createHelicalCurve: NaN at segment', i, { height, angle });
                return [];
            }
            
            const pos = getPosition3D(height, angle, radius);
            
            // Validate position
            if (!pos || isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                console.error('SceneGeometry.createHelicalCurve: Invalid position at segment', i, pos);
                return [];
            }
            
            points.push(pos.x, pos.y, pos.z);
        }
        
        return points;
    }
    
    /**
     * Generate helical curve for Earth (most common case)
     * @param {number} startHeight - Starting height
     * @param {number} endHeight - Ending height
     * @param {number} radius - Radius from center
     * @param {number} currentHeight - Current date height
     * @param {number} segments - Number of segments (default: 64)
     * @returns {Array<number>} Flat array of points
     */
    function createEarthHelicalCurve(startHeight, endHeight, radius, currentHeight, segments = 64) {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        return createHelicalCurve(startHeight, endHeight, radius, currentHeight, earth.orbitalPeriod, earth.startAngle, segments);
    }
    
    // ============================================
    // STRAIGHT LINE GENERATION
    // ============================================
    
    /**
     * Generate points for a straight line (time marker dividers)
     * @param {number} height - Height of the line
     * @param {number} startRadius - Starting radius
     * @param {number} endRadius - Ending radius
     * @param {number} currentHeight - Current date height for angle calculation
     * @param {number} orbitalPeriod - Orbital period (default: Earth's)
     * @param {number} startAngle - Starting angle offset (default: Earth's)
     * @returns {Array<number>} Flat array of [x, y, z, x, y, z] (start and end points)
     */
    function createStraightLine(height, startRadius, endRadius, currentHeight, orbitalPeriod = null, startAngle = null) {
        const angle = getAngle(height, currentHeight, orbitalPeriod, startAngle);
        const startPos = getPosition3D(height, angle, startRadius);
        const endPos = getPosition3D(height, angle, endRadius);
        return [startPos.x, startPos.y, startPos.z, endPos.x, endPos.y, endPos.z];
    }
    
    /**
     * Generate straight line for Earth (most common case)
     * @param {number} height - Height of the line
     * @param {number} startRadius - Starting radius
     * @param {number} endRadius - Ending radius
     * @param {number} currentHeight - Current date height
     * @returns {Array<number>} Flat array of [x, y, z, x, y, z]
     */
    function createEarthStraightLine(height, startRadius, endRadius, currentHeight) {
        return createStraightLine(height, startRadius, endRadius, currentHeight);
    }
    
    // ============================================
    // CURRENT DATE HEIGHT CALCULATION
    // ============================================
    
    /**
     * Get current date height based on zoom level
     * Handles special cases for Zoom 3 and 4
     * @param {number} zoomLevel - Current zoom level
     * @returns {number} Current date height
     */
    function getCurrentDateHeight(zoomLevel) {
        let height;
        
        if (zoomLevel === 3 || zoomLevel === 4) {
            // Use actual system date for Zoom 3 and 4
            if (typeof calculateActualCurrentDateHeight === 'function') {
                height = calculateActualCurrentDateHeight();
            } else if (typeof calculateCurrentDateHeight === 'function') {
                height = calculateCurrentDateHeight();
            } else {
                console.error('SceneGeometry.getCurrentDateHeight: No date calculation function available for Zoom', zoomLevel);
                // Fallback: use current year
                const now = new Date();
                height = getHeightForYear(now.getFullYear(), 1);
            }
        } else if (zoomLevel >= 3) {
            if (typeof calculateCurrentDateHeight === 'function') {
                height = calculateCurrentDateHeight();
            } else {
                console.error('SceneGeometry.getCurrentDateHeight: calculateCurrentDateHeight not available');
                height = getHeightForYear(currentYear, 1);
            }
        } else {
            height = getHeightForYear(currentYear, 1);
        }
        
        // Validate result
        if (isNaN(height)) {
            console.error('SceneGeometry.getCurrentDateHeight: Result is NaN for Zoom', zoomLevel, {
                calculateActualCurrentDateHeight: typeof calculateActualCurrentDateHeight,
                calculateCurrentDateHeight: typeof calculateCurrentDateHeight,
                currentYear,
                height
            });
            // Fallback: assume year 2025
            const fallbackYear = 2025;
            height = getHeightForYear(fallbackYear, 1);
            
            // If still NaN, use hardcoded value
            if (isNaN(height)) {
                height = 2500; // Year 2025 = (2025 - 2000) * 100
            }
        }
        
        return height;
    }
    
    return {
        init,
        getAngle,
        getPlanetAngle,
        getPosition3D,
        createHelicalCurve,
        createEarthHelicalCurve,
        createStraightLine,
        createEarthStraightLine,
        getCurrentDateHeight
    };
})();
