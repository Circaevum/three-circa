/**
 * Circaevum Time Markers Module
 * 
 * Composable time marker systems for Zoom Levels 3-7.
 * Each system from a lower zoom level is visible at higher zoom levels.
 * All systems reference shared Current Time and Selected Time variables.
 * 
 * Systems:
 * 1. Quarter System (Zoom 3+) - 4 quarters per year
 * 2. Month System (Zoom 3+) - 12 months per year  
 * 3. Week System (Zoom 5+) - weeks within months
 * 4. Day System (Zoom 7+) - days within weeks
 * 
 * Each system consists of:
 * - Curves: Inner and outer boundary curves
 * - Lines: Straight separator lines between units
 * - Text: Labels positioned at centers of regions
 */

const TimeMarkers = (function() {
    // ============================================
    // PRIVATE STATE & DEPENDENCIES
    // ============================================
    let scene, timeMarkers, showTimeMarkers, getMarkerColor, createTextLabel;
    let PLANET_DATA, ZOOM_LEVELS, TIME_MARKERS, CENTURY_START;
    let currentYear, currentMonthInYear, currentMonth, currentQuarter, currentWeekInMonth, currentDayInWeek, currentDayOfMonth, currentHourInDay;
    let selectedYearOffset, selectedQuarterOffset, selectedWeekOffset, selectedDayOffset, selectedHourOffset;
    let isLightMode, calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let planetMeshes;

    // ============================================
    // INITIALIZATION
    // ============================================
    function init(dependencies) {
        scene = dependencies.scene;
        timeMarkers = dependencies.timeMarkers;
        showTimeMarkers = dependencies.showTimeMarkers;
        getMarkerColor = dependencies.getMarkerColor;
        createTextLabel = dependencies.createTextLabel;
        PLANET_DATA = dependencies.PLANET_DATA;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        TIME_MARKERS = dependencies.TIME_MARKERS;
        CENTURY_START = dependencies.CENTURY_START;
        currentYear = dependencies.currentYear;
        currentMonthInYear = dependencies.currentMonthInYear;
        currentMonth = dependencies.currentMonth;
        currentQuarter = dependencies.currentQuarter;
        currentWeekInMonth = dependencies.currentWeekInMonth;
        currentDayInWeek = dependencies.currentDayInWeek;
        currentDayOfMonth = dependencies.currentDayOfMonth;
        currentHourInDay = dependencies.currentHourInDay;
        selectedYearOffset = dependencies.selectedYearOffset;
        selectedQuarterOffset = dependencies.selectedQuarterOffset;
        selectedWeekOffset = dependencies.selectedWeekOffset;
        selectedDayOffset = dependencies.selectedDayOffset;
        selectedHourOffset = dependencies.selectedHourOffset;
        isLightMode = dependencies.isLightMode;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        planetMeshes = dependencies.planetMeshes;
    }

    // ============================================
    // SHARED TIME CALCULATION
    // ============================================
    /**
     * Calculate Current Time (system time) and Selected Time (navigated time)
     * Returns: { currentDate, currentDateHeight, selectedDate, selectedDateHeight, selectedYear, selectedMonth, selectedQuarter }
     */
    function getTimeState(zoomLevel) {
        const now = new Date();
        const actualYear = now.getFullYear();
        const actualMonth = now.getMonth();
        const actualDay = now.getDate();
        const actualHour = now.getHours();
        
        // Calculate current date height (always uses actual system time)
        let currentDateHeight;
        if (zoomLevel === 3 || zoomLevel === 4) {
            const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            const isLeap = (actualYear % 4 === 0 && actualYear % 100 !== 0) || (actualYear % 400 === 0);
            if (isLeap) daysInMonth[1] = 29;
            const yearProgress = (actualMonth + (actualDay - 1) / daysInMonth[actualMonth] + actualHour / (24 * daysInMonth[actualMonth])) / 12;
            currentDateHeight = ((actualYear - 2000) * 100) + (yearProgress * 100);
        } else if (zoomLevel >= 3) {
            currentDateHeight = calculateCurrentDateHeight();
        } else {
            currentDateHeight = getHeightForYear(currentYear, 1);
        }

        // Calculate selected time based on zoom level
        let selectedYear, selectedMonth, selectedQuarter;
        if (zoomLevel === 3) {
            selectedYear = actualYear + selectedYearOffset;
            selectedQuarter = currentQuarter; // Navigate by quarters in Zoom 3
            selectedMonth = selectedQuarter * 3; // First month of the selected quarter
        } else if (zoomLevel === 4) {
            const systemQuarter = Math.floor(actualMonth / 3);
            const selectedQuarterValue = systemQuarter + selectedQuarterOffset;
            selectedQuarter = ((selectedQuarterValue % 4) + 4) % 4;
            selectedMonth = (selectedQuarter * 3) + currentMonth; // Month within quarter
            selectedYear = actualYear + Math.floor(selectedQuarterValue / 4);
        } else if (zoomLevel === 5) {
            // Month view - use week offset to determine month
            selectedYear = actualYear + Math.floor((actualMonth + selectedWeekOffset) / 12);
            selectedMonth = ((actualMonth + selectedWeekOffset) % 12 + 12) % 12;
            selectedQuarter = Math.floor(selectedMonth / 3);
        } else if (zoomLevel === 7) {
            // Week view - use day offset + currentDayInWeek to determine the actual selected day
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            // Calculate selected week Sunday from selectedDayOffset
            const selectedWeekSunday = new Date(actualCurrentWeekSunday);
            selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
            selectedWeekSunday.setHours(0, 0, 0, 0);
            
            // Calculate actual selected day by adding currentDayInWeek
            const selectedDay = new Date(selectedWeekSunday);
            selectedDay.setDate(selectedWeekSunday.getDate() + (currentDayInWeek || 0));
            selectedDay.setHours(0, 0, 0, 0);
            
            // Extract month, year, quarter from the actual selected day
            selectedMonth = selectedDay.getMonth();
            selectedYear = selectedDay.getFullYear();
            selectedQuarter = Math.floor(selectedMonth / 3);
        }

        // Create selected date object
        const selectedDate = new Date(selectedYear, selectedMonth, 1);
        
        const actualQuarter = Math.floor(actualMonth / 3);
        
        return {
            currentDate: now,
            currentDateHeight,
            selectedDate,
            selectedYear,
            selectedMonth,
            selectedQuarter,
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            selectedHourOffset,
            currentDayInWeek, // Needed for Zoom 7 day calculation
            actualMonthInYear: actualMonth,
            actualQuarter,
            actualYear
        };
    }

    // ============================================
    // UNIFIED TIME FRAME HELPERS
    // ============================================
    
    /**
     * Helper to extract unit index and year from flexible unit info format
     * Handles: number, {unit, year}, or Date object
     * @param {*} unitInfo - Unit information (can be index, object, or Date)
     * @param {number} defaultYear - Default year if not found in unitInfo
     * @returns {{unitIndex: *, unitYear: number, isDateUnit: boolean}}
     */
    function extractUnitInfo(unitInfo, defaultYear) {
        if (unitInfo instanceof Date) {
            return {
                unitIndex: unitInfo,
                unitYear: unitInfo.getFullYear(),
                isDateUnit: true
            };
        } else if (typeof unitInfo === 'object' && unitInfo !== null) {
            return {
                unitIndex: unitInfo.unit,
                unitYear: unitInfo.year || defaultYear,
                isDateUnit: false
            };
        } else {
            return {
                unitIndex: unitInfo,
                unitYear: defaultYear,
                isDateUnit: false
            };
        }
    }
    
    /**
     * Helper to get visible parent units (selected + current if different)
     * Common pattern: Zoom 3 shows all, Zoom 4+ shows selected + current
     * ALWAYS includes selected unit to ensure blue highlighting works even when outside initial frame
     * @param {number} zoomLevel - Current zoom level
     * @param {Object} timeState - Time state object
     * @param {Function} getSelectedUnit - Function(timeState) => {unit, year}
     * @param {Function} getActualUnit - Function(timeState) => {unit, year}
     * @param {number} allUnitsCount - Number of units for Zoom 3 (e.g., 4 for quarters, 12 for months)
     * @returns {Array} Array of units to show (always includes selected unit)
     */
    function getVisibleParentUnits(zoomLevel, timeState, getSelectedUnit, getActualUnit, allUnitsCount) {
        if (zoomLevel === 3) {
            // Zoom 3: Show all units
            return Array.from({length: allUnitsCount}, (_, i) => i);
        } else if (zoomLevel >= 4) {
            // Zoom 4+: Always show selected unit + current if different
            // This ensures blue highlighting works even when navigating outside initial frame
            const selectedUnit = getSelectedUnit(timeState);
            const actualUnit = getActualUnit(timeState);
            const unitsToShow = [{ unit: selectedUnit.unit, year: selectedUnit.year }];
            
            // Add current unit if it's different from selected
            const isCurrentDifferent = (actualUnit.unit !== selectedUnit.unit) || (actualUnit.year !== selectedUnit.year);
            if (isCurrentDifferent) {
                // Only add if not already in list
                const alreadyExists = unitsToShow.some(u => u.unit === actualUnit.unit && u.year === actualUnit.year);
                if (!alreadyExists) {
                    unitsToShow.push({ unit: actualUnit.unit, year: actualUnit.year });
                }
            }
            
            return unitsToShow;
        }
        return [];
    }
    
    /**
     * Helper to expand quarters to months (used by month system)
     * Takes quarter units and expands to month boundaries (4 boundaries per quarter)
     * @param {Array} quartersToShow - Array of quarter units
     * @returns {Array} Array of month units
     */
    function expandQuartersToMonths(quartersToShow) {
        let monthsToShow = [];
        quartersToShow.forEach(quarterInfo => {
            const { unitIndex: quarterIndex, unitYear: quarterYear } = extractUnitInfo(quarterInfo, 0);
            const quarterStartMonth = quarterIndex * 3;
            for (let m = quarterStartMonth; m <= quarterStartMonth + 3; m++) {
                let monthIndex, monthYear;
                if (m >= 12) {
                    monthIndex = m - 12;
                    monthYear = quarterYear + 1;
                } else {
                    monthIndex = m;
                    monthYear = quarterYear;
                }
                // Only add if not already in list
                const alreadyExists = monthsToShow.some(mo => mo.unit === monthIndex && mo.year === monthYear);
                if (!alreadyExists) {
                    monthsToShow.push({ unit: monthIndex, year: monthYear });
                }
            }
        });
        return monthsToShow;
    }
    
    /**
     * Helper to create parent unit curves (reused by quarter and month systems)
     * @param {Object} config Configuration for curves
     * @param {number} config.earthDistance - Distance to Earth
     * @param {Object} config.timeState - Time state
     * @param {number} config.currentDateHeight - Current date height
     * @param {number} config.yearHeight - Height of one year (100)
     * @param {number} config.unitHeight - Height of one unit (e.g., quarterHeight or monthHeight)
     * @param {number} config.outerRadius - Outer radius for curves
     * @param {Array} config.parentUnitsToShow - Array of parent units to create curves for
     * @param {Function} config.getSelectedUnit - Function(timeState) => {unit, year}
     * @param {Function} config.getActualUnit - Function(timeState) => {unit, year}
     */
    function createParentUnitCurvesForUnits(config) {
        const {
            earthDistance,
            timeState,
            currentDateHeight,
            yearHeight,
            unitHeight,
            outerRadius,
            parentUnitsToShow,
            getSelectedUnit,
            getActualUnit
        } = config;
        
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const curveSegments = 64;
        const timeSpanYears = unitHeight / 100;
        const orbitsInSpan = timeSpanYears / earth.orbitalPeriod;
        
        for (const parentInfo of parentUnitsToShow) {
            const { unitIndex, unitYear } = extractUnitInfo(parentInfo, timeState.selectedYear);
            
            const unitStartHeight = (unitYear - CENTURY_START) * yearHeight + (unitIndex * unitHeight);
            
            const yearsFromCurrentToYearStart = ((unitYear - CENTURY_START) * yearHeight - currentDateHeight) / 100;
            const orbitsFromCurrentToYearStart = yearsFromCurrentToYearStart / earth.orbitalPeriod;
            const yearStartAngle = earth.startAngle - (orbitsFromCurrentToYearStart * Math.PI * 2);
            
            // Calculate unit start angle (assuming units are evenly distributed within parent)
            // Determine totalUnits based on unitHeight: quarters=4, months=12
            const totalUnits = (unitHeight > 20) ? 4 : 12; // Quarters per year (25 units) vs months (8.33 units)
            const unitT = unitIndex / totalUnits;
            const timeSpanYearsForParent = 1; // One year
            const orbitsInSpanForParent = timeSpanYearsForParent / earth.orbitalPeriod;
            const unitStartAngle = yearStartAngle - (unitT * orbitsInSpanForParent * Math.PI * 2);
            
            const curvePoints = [];
            for (let i = 0; i <= curveSegments; i++) {
                const t = i / curveSegments;
                const angle = unitStartAngle - (t * orbitsInSpan * Math.PI * 2);
                const height = unitStartHeight + (t * unitHeight);
                curvePoints.push(
                    Math.cos(angle) * outerRadius, height, Math.sin(angle) * outerRadius
                );
            }
            const curveGeometry = new THREE.BufferGeometry();
            curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
            const curveMaterial = new THREE.LineBasicMaterial({
                color: getMarkerColor(),
                transparent: true,
                opacity: 0.6,
                linewidth: 2
            });
            const curve = new THREE.Line(curveGeometry, curveMaterial);
            scene.add(curve);
            timeMarkers.push(curve);
        }
    }
    /**
     * Helper to determine if text should be shown for a unit type at a zoom level
     * Pattern: Each zoom level shows its own unit (lines + text) and next level's unit (lines only)
     * @param {string} unitType - 'quarter', 'month', 'week', 'day'
     * @param {number} zoomLevel - Current zoom level
     * @returns {boolean} True if text should be shown
     */
    function shouldShowTextForUnit(unitType, zoomLevel) {
        // Pattern: Text shows at this zoom level and above
        // Zoom 3: Quarter text only (no month text)
        // Zoom 4: Quarter text, Month text, Week lines (no text)
        // Zoom 5: Quarter text, Month text, Week text, Day lines (no text)
        const textVisibility = {
            'quarter': zoomLevel >= 3,  // Quarter text at Zoom 3+
            'month': zoomLevel >= 4,    // Month text at Zoom 4+ (not Zoom 3)
            'week': zoomLevel >= 5,     // Week text at Zoom 5+ (lines only at 4)
            'day': zoomLevel >= 7       // Day text at Zoom 7+
        };
        
        return textVisibility[unitType] || false;
    }

    /**
     * Unified helper to create a time frame with curves, lines, and text
     * @param {Object} config Configuration object
     * @param {string} config.unitType - 'quarter', 'month', 'week', 'day'
     * @param {number} config.zoomLevel - Current zoom level
     * @param {number} config.outerRadius - Outer boundary radius
     * @param {number|null} config.innerRadius - Inner boundary radius (null for Zoom 3)
     * @param {number} config.earthDistance - Distance to Earth orbit
     * @param {Object} config.timeState - Time state from getTimeState()
     * @param {number} config.unitsPerParent - Units per parent (e.g., 4 for quarters/year, 12 for months/year, ~4 for weeks/month)
     * @param {Array|Function} config.unitNames - Array of unit names OR function(unitInfo, unitIndex, unitYear) => string for dynamic labels
     * @param {number} config.parentHeight - Height of parent unit in years (e.g., 1 for year, 0.25 for quarter, 0.0833 for month)
     * @param {Function} config.getUnitsToShow - Function(zoomLevel, timeState) => array of units to show (can be indices or Date objects)
     * @param {Function} config.getUnitDate - Function(unitInfo, unitIndex, unitYear) => Date object for unit start
     * @param {Function} config.isCurrentUnit - Function(unitInfo, unitIndex, unitYear) => boolean
     * @param {Function} config.isSelectedUnit - Function(unitInfo, unitIndex, unitYear) => boolean
     * @param {boolean} config.skipLabels - Skip text labels (overrides pattern)
     * @param {number|null} config.labelRadius - Optional explicit label radius (overrides calculated)
     * @param {Function} config.getUnitCenterDate - Optional function(unitStartDate, unitInfo) => Date for label center (defaults to midpoint)
     */
    function createTimeFrame(config) {
        const {
            unitType,
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitsPerParent,
            unitNames,
            parentHeight,
            getUnitsToShow,
            getUnitDate,
            isCurrentUnit,
            isSelectedUnit,
            skipLabels = false,
            labelRadius = null
        } = config;

        // Determine if text should be shown based on pattern (unless explicitly skipped)
        const showTextForThisUnit = !skipLabels && shouldShowTextForUnit(unitType, zoomLevel);

        const { currentDateHeight } = timeState;
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const curveSegments = 64;

        // Get units to display
        const unitsToShow = getUnitsToShow(zoomLevel, timeState);

        // CURVE: Outer boundary (and inner boundary if not Zoom 3)
        // For Zoom 3 with lowest unit (quarters): create full-span curve
        // For Zoom 4+: create curves for visible parent units only
        if (zoomLevel === 3 && innerRadius === null) {
            // Zoom 3: Full-span curve for lowest level unit
            const now = timeState.currentDate;
            const actualYear = now.getFullYear();
            const selectedYear = timeState.selectedYear;
            const yearStartHeight = (selectedYear - CENTURY_START) * parentHeight * 100;
            const yearsFromCurrentToYearStart = (yearStartHeight - currentDateHeight) / 100;
            const orbitsFromCurrentToYearStart = yearsFromCurrentToYearStart / earth.orbitalPeriod;
            const yearStartAngle = earth.startAngle - (orbitsFromCurrentToYearStart * Math.PI * 2);
            const orbitsInSpan = parentHeight / earth.orbitalPeriod;

            const curvePoints = [];
            for (let i = 0; i <= curveSegments; i++) {
                const t = i / curveSegments;
                const angle = yearStartAngle - (t * orbitsInSpan * Math.PI * 2);
                const height = yearStartHeight + (t * parentHeight * 100);
                curvePoints.push(
                    Math.cos(angle) * outerRadius, height, Math.sin(angle) * outerRadius
                );
            }
            const curveGeometry = new THREE.BufferGeometry();
            curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
            const curveMaterial = new THREE.LineBasicMaterial({
                color: getMarkerColor(),
                transparent: true,
                opacity: 0.6,
                linewidth: 2
            });
            const curve = new THREE.Line(curveGeometry, curveMaterial);
            scene.add(curve);
            timeMarkers.push(curve);
        } else if (zoomLevel >= 4 && innerRadius !== null) {
            // Zoom 4+: Create curves for visible parent units only
            // This will be handled by parent unit frames
            // For now, we'll skip curves here and let the lines handle boundaries
        }

        // LINES: Unit separator lines
        for (const unitInfo of unitsToShow) {
            // Handle flexible unit types: can be index, object with {unit, year}, or Date
            let unitIndex, unitYear;
            let isDateUnit = false;
            
            if (unitInfo instanceof Date) {
                // Week units are Date objects (Sunday of the week)
                const weekDate = new Date(unitInfo);
                unitYear = weekDate.getFullYear();
                unitIndex = weekDate; // Store Date as index for weeks
                isDateUnit = true;
            } else if (typeof unitInfo === 'object' && unitInfo !== null) {
                unitIndex = unitInfo.unit;
                unitYear = unitInfo.year || timeState.selectedYear;
            } else {
                unitIndex = unitInfo;
                unitYear = timeState.selectedYear;
            }

            const unitStartDate = getUnitDate(unitInfo, unitIndex, unitYear);
            const unitStartHeight = calculateDateHeight(
                unitStartDate.getFullYear(),
                unitStartDate.getMonth(),
                unitStartDate.getDate(),
                unitStartDate.getHours()
            );

            const yearsFromCurrentToUnitStart = (unitStartHeight - currentDateHeight) / 100;
            const orbitsFromCurrentToUnitStart = yearsFromCurrentToUnitStart / earth.orbitalPeriod;
            const angle = earth.startAngle - (orbitsFromCurrentToUnitStart * Math.PI * 2);

            // Determine line start and end radii
            let startRadius, endRadius;
            if (zoomLevel === 3) {
                // Zoom 3: Check if this is the lowest level (no inner radius) or a parent boundary
                if (innerRadius === null) {
                    // Lowest level (quarters): all lines go from Sun (0) to outer radius
                    startRadius = 0;
                    endRadius = outerRadius;
                } else {
                    // Higher level (months): parent boundaries from Sun (0) to outer, others from inner to Earth
                    const isParentBoundary = (unitIndex % 3 === 0); // Quarter boundaries
                    startRadius = isParentBoundary ? 0 : innerRadius;
                    endRadius = earthDistance;
                }
            } else {
                // Zoom 4+: Lines go from inner radius to outer radius
                // Parent boundaries (quarter boundaries for months) go from Sun (0) to outer
                // For weeks, if day labels are shown (zoomLevel >= 7), extend to Earth's worldline
                const isParentBoundary = (unitType === 'month' && unitIndex % 3 === 0);
                startRadius = isParentBoundary ? 0 : (innerRadius || 0);
                
                // Week lines extend to Earth when day labels are visible (Zoom 7+)
                if (unitType === 'week' && zoomLevel >= 7) {
                    endRadius = earthDistance;
                } else {
                    endRadius = outerRadius;
                }
            }

            const points = [
                Math.cos(angle) * startRadius, unitStartHeight, Math.sin(angle) * startRadius,
                Math.cos(angle) * endRadius, unitStartHeight, Math.sin(angle) * endRadius
            ];

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

            const isCurrent = isCurrentUnit(unitInfo, unitIndex, unitYear);
            const isSelected = isSelectedUnit(unitInfo, unitIndex, unitYear);
            
            // For all unit types, also check if the previous unit is current/selected
            // This ensures both lines bordering a unit are colored (the one before and after)
            let isPreviousUnitCurrent = false;
            let isPreviousUnitSelected = false;
            let hasPreviousUnitOffset = false;
            
            // Calculate previous unit based on unit type
            let previousUnitInfo = null;
            let previousUnitIndex = null;
            let previousUnitYear = null;
            
            if (unitType === 'quarter') {
                // Previous quarter: decrease quarter index, handle year boundary
                const prevQuarterIndex = unitIndex - 1;
                if (prevQuarterIndex < 0) {
                    previousUnitIndex = 3;
                    previousUnitYear = unitYear - 1;
                } else {
                    previousUnitIndex = prevQuarterIndex;
                    previousUnitYear = unitYear;
                }
                previousUnitInfo = { unit: previousUnitIndex, year: previousUnitYear };
            } else if (unitType === 'month') {
                // Previous month: decrease month index, handle year boundary
                const prevMonthIndex = unitIndex - 1;
                if (prevMonthIndex < 0) {
                    previousUnitIndex = 11;
                    previousUnitYear = unitYear - 1;
                } else {
                    previousUnitIndex = prevMonthIndex;
                    previousUnitYear = unitYear;
                }
                previousUnitInfo = { unit: previousUnitIndex, year: previousUnitYear };
            } else if (unitType === 'week') {
                // Previous week: subtract 7 days from week Sunday
                // Weeks are stored as Date objects (Sunday of the week)
                const weekSunday = unitInfo instanceof Date ? unitInfo : (unitIndex instanceof Date ? unitIndex : null);
                if (weekSunday instanceof Date) {
                    const prevWeekDate = new Date(weekSunday);
                    prevWeekDate.setDate(prevWeekDate.getDate() - 7);
                    prevWeekDate.setHours(0, 0, 0, 0);
                    previousUnitInfo = prevWeekDate;
                    // For weeks, unitIndex is the Date object
                    previousUnitIndex = prevWeekDate;
                }
            } else if (unitType === 'day') {
                // Previous day: subtract 1 day
                const previousDayDate = new Date(unitStartDate);
                previousDayDate.setDate(previousDayDate.getDate() - 1);
                previousDayDate.setHours(0, 0, 0, 0);
                previousUnitInfo = previousDayDate;
            }
            
            // Check if previous unit is current or selected (if we calculated a previous unit)
            if (previousUnitInfo !== null) {
                isPreviousUnitCurrent = isCurrentUnit(previousUnitInfo, previousUnitIndex, previousUnitYear);
                isPreviousUnitSelected = isSelectedUnit(previousUnitInfo, previousUnitIndex, previousUnitYear);
                
                // Calculate hasOffset for previous unit (use same logic as current unit)
                if (unitType === 'quarter') {
                    hasPreviousUnitOffset = timeState.selectedQuarterOffset !== 0;
                } else if (unitType === 'month') {
                    const now = timeState.currentDate;
                    const actualMonth = now.getMonth();
                    const actualYear = now.getFullYear();
                    const { selectedMonth, selectedYear } = timeState;
                    hasPreviousUnitOffset = (selectedMonth !== actualMonth) || (selectedYear !== actualYear);
                } else if (unitType === 'week') {
                    if (zoomLevel === 5) {
                        const now = timeState.currentDate;
                        const actualMonth = now.getMonth();
                        const actualYear = now.getFullYear();
                        const { selectedMonth, selectedYear } = timeState;
                        const monthDifferent = (selectedMonth !== actualMonth) || (selectedYear !== actualYear);
                        const actualDayInWeek = now.getDay();
                        const actualCurrentWeekSunday = new Date(now);
                        actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                        actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                        const actualMonthStart = new Date(actualYear, actualMonth, 1);
                        const actualFirstSundayOffset = -actualMonthStart.getDay();
                        const actualFirstSunday = new Date(actualYear, actualMonth, 1 + actualFirstSundayOffset);
                        actualFirstSunday.setHours(0, 0, 0, 0);
                        const actualWeekInMonth = Math.floor((actualCurrentWeekSunday.getTime() - actualFirstSunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
                        const weekInMonthDifferent = (currentWeekInMonth !== actualWeekInMonth) && (selectedMonth === actualMonth && selectedYear === actualYear);
                        hasPreviousUnitOffset = monthDifferent || weekInMonthDifferent;
                    } else {
                        hasPreviousUnitOffset = (timeState.selectedWeekOffset || 0) !== 0;
                    }
                } else if (unitType === 'day') {
                    if (zoomLevel === 7) {
                        const now = timeState.currentDate;
                        const actualDayInWeek = now.getDay();
                        const actualCurrentWeekSunday = new Date(now);
                        actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                        actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                        const selectedDayOffset = timeState.selectedDayOffset || 0;
                        const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                        selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                        selectedWeekSunday.setHours(0, 0, 0, 0);
                        const weekDifferent = (selectedDayOffset !== 0) || (selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime());
                        const dayInWeekDifferent = (currentDayInWeek !== actualDayInWeek);
                        hasPreviousUnitOffset = weekDifferent || dayInWeekDifferent;
                    } else {
                        hasPreviousUnitOffset = (timeState.selectedDayOffset || 0) !== 0;
                    }
                }
            }
            
            // Check if there's a navigation offset (like the old code did)
            // This is the key: if offset is non-zero, we're navigating away from current time
            let hasOffset = false;
            if (unitType === 'quarter') {
                hasOffset = timeState.selectedQuarterOffset !== 0;
            } else if (unitType === 'month') {
                // For months, check if we're in a different month than current
                const now = timeState.currentDate;
                const actualMonth = now.getMonth();
                const actualYear = now.getFullYear();
                const { selectedMonth, selectedYear } = timeState;
                hasOffset = (selectedMonth !== actualMonth) || (selectedYear !== actualYear);
            } else if (unitType === 'week') {
                // For weeks in Zoom 5, selectedWeekOffset is in MONTHS, not weeks
                // Check if selected month is different OR currentWeekInMonth is different from actual
                if (zoomLevel === 5) {
                    const now = timeState.currentDate;
                    const actualMonth = now.getMonth();
                    const actualYear = now.getFullYear();
                    const { selectedMonth, selectedYear } = timeState;
                    // Check if we're in a different month
                    const monthDifferent = (selectedMonth !== actualMonth) || (selectedYear !== actualYear);
                    // Check if currentWeekInMonth differs from actual week in month
                    const actualDayInWeek = now.getDay();
                    const actualCurrentWeekSunday = new Date(now);
                    actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                    actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                    // Find which week of the month the actual current week is
                    const actualMonthStart = new Date(actualYear, actualMonth, 1);
                    const actualFirstSundayOffset = -actualMonthStart.getDay();
                    const actualFirstSunday = new Date(actualYear, actualMonth, 1 + actualFirstSundayOffset);
                    actualFirstSunday.setHours(0, 0, 0, 0);
                    const actualWeekInMonth = Math.floor((actualCurrentWeekSunday.getTime() - actualFirstSunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
                    const weekInMonthDifferent = (currentWeekInMonth !== actualWeekInMonth) && (selectedMonth === actualMonth && selectedYear === actualYear);
                    hasOffset = monthDifferent || weekInMonthDifferent;
                } else {
                    // For other zoom levels, selectedWeekOffset might be in weeks
                    hasOffset = (timeState.selectedWeekOffset || 0) !== 0;
                }
            } else if (unitType === 'day') {
                // For days in Zoom 7, selectedDayOffset is in WEEKS, not days
                // Check if selected week is different OR currentDayInWeek is different from actual
                if (zoomLevel === 7) {
                    const now = timeState.currentDate;
                    const actualDayInWeek = now.getDay();
                    const actualCurrentWeekSunday = new Date(now);
                    actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                    actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                    
                    // Calculate selected week Sunday
                    const selectedDayOffset = timeState.selectedDayOffset || 0;
                    const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                    selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                    selectedWeekSunday.setHours(0, 0, 0, 0);
                    
                    // Check if we're in a different week
                    const weekDifferent = (selectedDayOffset !== 0) || (selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime());
                    
                    // Check if currentDayInWeek differs from actual day in week (even within same week)
                    // Use the module's currentDayInWeek variable, which is updated by updateOffsets
                    const dayInWeekDifferent = (currentDayInWeek !== actualDayInWeek);
                    
                    hasOffset = weekDifferent || dayInWeekDifferent;
                } else {
                    // For other zoom levels, selectedDayOffset might be in days
                    hasOffset = (timeState.selectedDayOffset || 0) !== 0;
                }
            }
            
            // Color logic: Red for current time, Blue for selected time (when offset exists)
            // For all unit types, also check previous unit to color both bordering lines
            // This ensures both lines bordering a current/selected unit are colored
            // This matches the old main.js logic: isSystemCurrent ? red : (offset !== 0 ? blue : default)
            const lineIsCurrent = isCurrent || isPreviousUnitCurrent;
            const lineIsSelected = (isSelected && hasOffset) || (isPreviousUnitSelected && hasPreviousUnitOffset);
            
            // Darker blue in light mode for better contrast
            const selectedTimeColor = isLightMode ? 0x0066CC : 0x00FFFF;
            const lineColor = lineIsCurrent ? 0xFF0000 : (lineIsSelected ? selectedTimeColor : getMarkerColor());
            
            // DEBUG: Log color decision
            if (hasOffset && isSelected) {
                console.log(`[BLUE DEBUG] Setting BLUE line color: unitType=${unitType}, hasOffset=${hasOffset}, isSelected=${isSelected}, isCurrent=${isCurrent}, lineColor=0x${lineColor.toString(16)}`);
            }

            const material = new THREE.LineBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: isCurrent || isSelected ? 0.9 : 0.7,
                linewidth: isCurrent || isSelected ? 3 : 2
            });

            const line = new THREE.Line(geometry, material);
            scene.add(line);
            timeMarkers.push(line);

            // TEXT: Unit label
            // Only show labels for units that are actually part of the visible range
            // Use pattern-based text visibility unless explicitly skipped
            let shouldShowLabel = showTextForThisUnit;
            
            // Get unit label text
            let unitLabelText = null;
            if (unitNames) {
                if (typeof unitNames === 'function') {
                    // Dynamic label function (e.g., for weeks with day ranges)
                    unitLabelText = unitNames(unitInfo, unitIndex, unitYear);
                } else if (Array.isArray(unitNames)) {
                    // Array-based labels (only for index-based units)
                    if (!isDateUnit && typeof unitIndex === 'number' && unitIndex < unitNames.length) {
                        unitLabelText = unitNames[unitIndex];
                    }
                }
            }
            
            shouldShowLabel = shouldShowLabel && unitLabelText !== null;
            
            // For months in Zoom 4+, only show labels for months within the selected quarter
            if (unitType === 'month' && zoomLevel >= 4) {
                const { selectedQuarter, selectedYear } = timeState;
                // Check if this month is part of the selected quarter
                // Q1 = months 0-2, Q2 = months 3-5, Q3 = months 6-8, Q4 = months 9-11
                const quarterStartMonth = selectedQuarter * 3;
                const isInSelectedQuarter = (unitIndex >= quarterStartMonth && unitIndex < quarterStartMonth + 3) && (unitYear === selectedYear);
                // Also check if it's in the current quarter (if different from selected)
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                const isInCurrentQuarter = (actualQuarter !== selectedQuarter || actualYear !== selectedYear) && 
                                          (unitIndex >= (actualQuarter * 3) && unitIndex < (actualQuarter * 3) + 3) && 
                                          (unitYear === actualYear);
                
                // Only show label if it's in the selected OR current quarter (not just any visible quarter)
                shouldShowLabel = shouldShowLabel && (isInSelectedQuarter || isInCurrentQuarter);
            }
            
            if (shouldShowLabel) {
                // Calculate center of unit for label
                let unitCenterDate;
                if (config.getUnitCenterDate) {
                    // Use custom center date function if provided
                    unitCenterDate = config.getUnitCenterDate(unitStartDate, unitInfo);
                } else {
                    // Default: approximate center
                    unitCenterDate = new Date(unitStartDate);
                    if (unitType === 'month') {
                        const monthIndex = typeof unitIndex === 'number' ? unitIndex : unitStartDate.getMonth();
                        const daysInMonth = new Date(unitYear, monthIndex + 1, 0).getDate();
                        unitCenterDate.setDate(Math.floor(daysInMonth / 2) + 1);
                    } else if (unitType === 'quarter') {
                        // Center of quarter (~month 1.5 of the quarter)
                        const quarterIndex = typeof unitIndex === 'number' ? unitIndex : Math.floor(unitStartDate.getMonth() / 3);
                        unitCenterDate.setMonth(quarterIndex * 3 + 1);
                        unitCenterDate.setDate(15);
                    } else if (unitType === 'week') {
                        // Center of week (3.5 days in, i.e., Wednesday)
                        unitCenterDate.setDate(unitStartDate.getDate() + 3.5);
                    }
                }

                const labelHeight = calculateDateHeight(
                    unitCenterDate.getFullYear(),
                    unitCenterDate.getMonth(),
                    unitCenterDate.getDate(),
                    unitCenterDate.getHours()
                );
                const yearsFromCurrentToLabel = (labelHeight - currentDateHeight) / 100;
                const orbitsFromCurrentToLabel = yearsFromCurrentToLabel / earth.orbitalPeriod;
                const labelAngle = earth.startAngle - (orbitsFromCurrentToLabel * Math.PI * 2);

                // Label radius: use explicit labelRadius if provided, otherwise calculate
                let calculatedLabelRadius;
                if (labelRadius !== null) {
                    calculatedLabelRadius = labelRadius;
                } else if (zoomLevel === 3) {
                    // Zoom 3: For lowest level (quarters), label at first half center (0 to outerRadius)
                    // For higher level (months), label at second half center (outerRadius to Earth)
                    if (innerRadius === null) {
                        calculatedLabelRadius = outerRadius / 2; // First half center
                    } else {
                        calculatedLabelRadius = (outerRadius + earthDistance) / 2; // Second half center
                    }
                } else {
                    // Zoom 4+: Label at center between inner and outer
                    calculatedLabelRadius = innerRadius ? (innerRadius + outerRadius) / 2 : outerRadius / 2;
                }

                // Check if there's a navigation offset (like the old code did)
                let hasOffset = false;
                if (unitType === 'quarter') {
                    hasOffset = timeState.selectedQuarterOffset !== 0;
                } else if (unitType === 'month') {
                    // For months, check if we're in a different month than current
                    const now = timeState.currentDate;
                    const actualMonth = now.getMonth();
                    const actualYear = now.getFullYear();
                    const { selectedMonth, selectedYear } = timeState;
                    hasOffset = (selectedMonth !== actualMonth) || (selectedYear !== actualYear);
                } else if (unitType === 'week') {
                    // For weeks in Zoom 5, selectedWeekOffset is in MONTHS, not weeks
                    // Check if selected month is different OR currentWeekInMonth is different from actual
                    if (zoomLevel === 5) {
                        const now = timeState.currentDate;
                        const actualMonth = now.getMonth();
                        const actualYear = now.getFullYear();
                        const { selectedMonth, selectedYear } = timeState;
                        // Check if we're in a different month
                        const monthDifferent = (selectedMonth !== actualMonth) || (selectedYear !== actualYear);
                        // Check if currentWeekInMonth differs from actual week in month
                        const actualDayInWeek = now.getDay();
                        const actualCurrentWeekSunday = new Date(now);
                        actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                        actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                        // Find which week of the month the actual current week is
                        const actualMonthStart = new Date(actualYear, actualMonth, 1);
                        const actualFirstSundayOffset = -actualMonthStart.getDay();
                        const actualFirstSunday = new Date(actualYear, actualMonth, 1 + actualFirstSundayOffset);
                        actualFirstSunday.setHours(0, 0, 0, 0);
                        const actualWeekInMonth = Math.floor((actualCurrentWeekSunday.getTime() - actualFirstSunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
                        const weekInMonthDifferent = (currentWeekInMonth !== actualWeekInMonth) && (selectedMonth === actualMonth && selectedYear === actualYear);
                        hasOffset = monthDifferent || weekInMonthDifferent;
                    } else if (zoomLevel === 7) {
                        // Zoom 7: Use selectedDayOffset (in weeks) to determine selected week
                        // Check if selected week is different from current week
                        const now = timeState.currentDate;
                        const actualDayInWeek = now.getDay();
                        const actualCurrentWeekSunday = new Date(now);
                        actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                        actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                        
                        // Calculate selected week Sunday (from selectedDayOffset)
                        const selectedDayOffset = timeState.selectedDayOffset || 0;
                        const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                        selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                        selectedWeekSunday.setHours(0, 0, 0, 0);
                        
                        // Check if we're in a different week
                        hasOffset = (selectedDayOffset !== 0) || (selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime());
                    } else {
                        // For other zoom levels, selectedWeekOffset might be in weeks
                        hasOffset = (timeState.selectedWeekOffset || 0) !== 0;
                    }
                } else if (unitType === 'day') {
                    // For days in Zoom 7, selectedDayOffset is in WEEKS, not days
                    // Check if selected week is different OR currentDayInWeek is different from actual
                    if (zoomLevel === 7) {
                        const now = timeState.currentDate;
                        const actualDayInWeek = now.getDay();
                        const actualCurrentWeekSunday = new Date(now);
                        actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                        actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                        
                        // Calculate selected week Sunday
                        const selectedDayOffset = timeState.selectedDayOffset || 0;
                        const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                        selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                        selectedWeekSunday.setHours(0, 0, 0, 0);
                        
                        // Check if we're in a different week
                        const weekDifferent = (selectedDayOffset !== 0) || (selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime());
                        
                        // Check if currentDayInWeek differs from actual day in week (even within same week)
                        // Use the module's currentDayInWeek variable, which is updated by updateOffsets
                        const dayInWeekDifferent = (currentDayInWeek !== actualDayInWeek);
                        
                        hasOffset = weekDifferent || dayInWeekDifferent;
                    } else {
                        // For other zoom levels, selectedDayOffset might be in days
                        hasOffset = (timeState.selectedDayOffset || 0) !== 0;
                    }
                }
                
                // Color logic: Red for current time, Blue for selected time (when offset exists)
                // This matches the old main.js logic: isSystemCurrent ? red : (offset !== 0 ? blue : default)
                const labelColor = isCurrent ? 'red' : (hasOffset && isSelected ? 'blue' : false);
                
                // DEBUG: Log color decision
                if (hasOffset && isSelected) {
                    console.log(`[BLUE DEBUG] Setting BLUE label color: unitType=${unitType}, hasOffset=${hasOffset}, isSelected=${isSelected}, isCurrent=${isCurrent}, labelColor=${labelColor}, unitLabelText=${unitLabelText}`);
                }
                
                // Use fixed zoom levels for text sizes: Q and M use Zoom 4, W uses Zoom 5
                const textZoomLevel = (unitType === 'quarter' || unitType === 'month') ? 4 : (unitType === 'week' ? 5 : zoomLevel);
                createTextLabel(unitLabelText, labelHeight, calculatedLabelRadius, textZoomLevel, labelAngle, labelColor, false, 0.85);
            }
        }
    }

    /**
     * Helper to extend time frame when Selected Time changes
     * Similar to createTimeFrame but only adds new units that aren't already visible
     * @param {Object} config Same as createTimeFrame config
     */
    function extendTimeFrame(config) {
        // For now, we'll just call createTimeFrame
        // In the future, this could be optimized to only add new units
        createTimeFrame(config);
    }

    /**
     * Helper to create curves for visible parent units (Zoom 4+)
     * @param {Object} config Configuration for curves
     */
    function createParentUnitCurves(config) {
        const {
            zoomLevel,
            outerRadius,
            earthDistance,
            timeState,
            parentUnitsToShow,
            parentHeight,
            getParentUnitStartHeight,
            getParentUnitStartAngle
        } = config;

        if (zoomLevel < 4) return;

        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const curveSegments = 64;
        const timeSpanYears = parentHeight / 100;
        const orbitsInSpan = timeSpanYears / earth.orbitalPeriod;

        for (const parentInfo of parentUnitsToShow) {
            const parentIndex = typeof parentInfo === 'object' ? parentInfo.unit : parentInfo;
            const parentYear = typeof parentInfo === 'object' ? parentInfo.year : timeState.selectedYear;

            const parentStartHeight = getParentUnitStartHeight(parentYear, parentIndex);
            const parentStartAngle = getParentUnitStartAngle(parentYear, parentIndex);

            const curvePoints = [];
            for (let i = 0; i <= curveSegments; i++) {
                const t = i / curveSegments;
                const angle = parentStartAngle - (t * orbitsInSpan * Math.PI * 2);
                const height = parentStartHeight + (t * parentHeight);
                curvePoints.push(
                    Math.cos(angle) * outerRadius, height, Math.sin(angle) * outerRadius
                );
            }
            const curveGeometry = new THREE.BufferGeometry();
            curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
            const curveMaterial = new THREE.LineBasicMaterial({
                color: getMarkerColor(),
                transparent: true,
                opacity: 0.6,
                linewidth: 2
            });
            const curve = new THREE.Line(curveGeometry, curveMaterial);
            scene.add(curve);
            timeMarkers.push(curve);
        }
    }

    // ============================================
    // SYSTEM 1: QUARTER SYSTEM
    // ============================================
    /**
     * Creates quarter markers: curves, lines, and text
     * Used in Zoom 3-7
     */
    function createQuarterSystem(earthDistance, timeState, zoomLevel, options = {}) {
        const { selectedYear, selectedQuarter, currentDateHeight, actualQuarter } = timeState;
        const { skipLabels = false } = options;
        
        // Adjust radii based on zoom level
        // Zoom 3: dividing curve at 0.5, quarter labels at 0.25
        // Zoom 4+: quarterly frame outer boundary at 1/3, quarter labels at center of quarter region
        const isZoom4Plus = zoomLevel >= 4;
        const outerRadius = isZoom4Plus ? earthDistance * (1/3) : earthDistance * 0.5;
        const innerRadius = null; // Quarters are the lowest level, no inner boundary
        const labelRadius = isZoom4Plus ? earthDistance * (1/6) : earthDistance * 0.25;
        
        const yearHeight = 100;
        const parentHeight = 1; // One year
        const quarterHeight = yearHeight / 4;
        
        // Helper functions for unified createTimeFrame
        function getQuartersToShow(zoomLevel, timeState) {
            // ALWAYS include selected quarter, even if far from current quarter
            // This ensures markers extend when navigating outside initial window
            const selectedQuarter = timeState.selectedQuarter;
            const selectedYear = timeState.selectedYear;
            
            if (zoomLevel === 3) {
                // Zoom 3: Show all quarters
                return Array.from({length: 4}, (_, i) => i);
            } else if (zoomLevel >= 4) {
                // Zoom 4+: Always show selected quarter + current if different
                const quartersToShow = [{ unit: selectedQuarter, year: selectedYear }];
                
                // Add current quarter if different
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                const isCurrentDifferent = (actualQuarter !== selectedQuarter) || (actualYear !== selectedYear);
                if (isCurrentDifferent) {
                    quartersToShow.push({ unit: actualQuarter, year: actualYear });
                }
                
                return quartersToShow;
            }
            return [];
        }
        
        function getQuarterDate(unitInfo, unitIndex, unitYear) {
            // Quarter starts at month (quarterIndex * 3), day 1
            const quarterIndex = typeof unitIndex === 'number' ? unitIndex : unitInfo.unit;
            const year = unitYear || (typeof unitInfo === 'object' && unitInfo.year) || timeState.selectedYear;
            return new Date(year, quarterIndex * 3, 1, 0, 0, 0);
        }
        
        function isCurrentQuarter(unitInfo, unitIndex, unitYear) {
            // unitInfo might be a number (Zoom 3) or object (Zoom 4+), or undefined
            const infoToExtract = (unitInfo !== undefined && unitInfo !== null) ? unitInfo : unitIndex;
            const { unitIndex: quarterIndex, unitYear: quarterYear } = extractUnitInfo(infoToExtract, unitYear || timeState.selectedYear);
            const now = timeState.currentDate;
            const actualYear = now.getFullYear();
            const actualMonthInYear = now.getMonth();
            const systemActualQuarter = Math.floor(actualMonthInYear / 3);
            return (quarterIndex === systemActualQuarter && quarterYear === actualYear);
        }
        
        function isSelectedQuarterValue(unitInfo, unitIndex, unitYear) {
            // unitInfo might be a number (Zoom 3) or object (Zoom 4+), or undefined
            // Don't use || because 0 is a valid quarter index and is falsy!
            const infoToExtract = (unitInfo !== undefined && unitInfo !== null) ? unitInfo : unitIndex;
            const { unitIndex: quarterIndex, unitYear: quarterYear } = extractUnitInfo(infoToExtract, unitYear || timeState.selectedYear);
            const { selectedQuarter, selectedYear } = timeState;
            const isSelected = (quarterIndex === selectedQuarter && quarterYear === selectedYear);
            // DEBUG: Log comparison when quarter matches but year might not
            if (quarterIndex === selectedQuarter) {
                console.log(`[DEBUG] isSelectedQuarterValue: quarterIndex=${quarterIndex}, selectedQuarter=${selectedQuarter}, quarterYear=${quarterYear}, selectedYear=${selectedYear}, isSelected=${isSelected}`);
            }
            return isSelected;
        }

        // CURVE: For Zoom 4+, create curves for visible quarters
        if (zoomLevel >= 4) {
            const quartersToShow = getQuartersToShow(zoomLevel, timeState);
            createParentUnitCurvesForUnits({
                earthDistance,
                timeState,
                currentDateHeight,
                yearHeight,
                unitHeight: quarterHeight,
                outerRadius,
                parentUnitsToShow: quartersToShow,
                getSelectedUnit: (ts) => ({ unit: ts.selectedQuarter, year: ts.selectedYear }),
                getActualUnit: (ts) => {
                    const now = ts.currentDate;
                    return { unit: Math.floor(now.getMonth() / 3), year: now.getFullYear() };
                }
            });
        }

        // Use unified createTimeFrame helper
        createTimeFrame({
            unitType: 'quarter',
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitsPerParent: 4,
            unitNames: ['Q1', 'Q2', 'Q3', 'Q4'],
            parentHeight,
            getUnitsToShow: getQuartersToShow,
            getUnitDate: getQuarterDate,
            isCurrentUnit: isCurrentQuarter,
            isSelectedUnit: isSelectedQuarterValue,
            skipLabels,
            labelRadius: labelRadius // Use explicit label radius
        });
        
        // Override label radius after createTimeFrame (since label positioning needs refinement)
        // The helper creates labels, but we need to adjust their position
        // For now, this is handled in the helper with the labelRadius calculation
        // We can refine this later if needed
    }

    // ============================================
    // SYSTEM 2: MONTH SYSTEM
    // ============================================
    /**
     * Creates month markers: lines and text
     * Used in Zoom 3-7
     */
    function createMonthSystem(earthDistance, timeState, zoomLevel, options = {}) {
        const { selectedYear, selectedMonth, selectedQuarter, currentDateHeight } = timeState;
        const { skipLabels = false } = options;
        
        // Adjust radii based on zoom level
        // Zoom 3: dividing curve at 0.5 (inner), month labels at 0.75 (second half center)
        // Zoom 4+: quarterly frame outer at 1/3 (inner), monthly frame outer at 2/3 (outer), labels at 0.5 (center)
        const isZoom4Plus = zoomLevel >= 4;
        const innerRadius = isZoom4Plus ? earthDistance * (1/3) : earthDistance * 0.5; // Inherited from quarter system
        const outerRadius = isZoom4Plus ? earthDistance * (2/3) : earthDistance * 0.75;
        const labelRadius = isZoom4Plus ? earthDistance * 0.5 : earthDistance * 0.75; // Center of month region
        
        const parentHeight = 0.25; // One quarter in years
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Helper functions for unified createTimeFrame
        function getMonthsToShow(zoomLevel, timeState) {
            if (zoomLevel === 3) {
                // For Zoom 3, store as simple month indices (0-12 for boundaries)
                return Array.from({length: 13}, (_, i) => ({ unit: i, year: timeState.selectedYear }));
            } else if (zoomLevel >= 4) {
                const { selectedMonth, selectedYear } = timeState;
                
                // Start with selected quarter (from selectedMonth)
                const selectedQuarterFromMonth = Math.floor(selectedMonth / 3);
                let quartersToShow = [{ unit: selectedQuarterFromMonth, year: selectedYear }];
                
                // Add current quarter if different
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                const isCurrentDifferent = (actualQuarter !== selectedQuarterFromMonth) || (actualYear !== selectedYear);
                if (isCurrentDifferent) {
                    quartersToShow.push({ unit: actualQuarter, year: actualYear });
                }
                
                // Expand quarters to months
                let monthsToShow = expandQuartersToMonths(quartersToShow);
                
                // ALWAYS ensure selected month is included (even if outside visible quarters)
                // This ensures blue highlighting works when navigating outside initial frame
                if (selectedMonth !== undefined && selectedYear !== undefined) {
                    const selectedMonthExists = monthsToShow.some(m => m.unit === selectedMonth && m.year === selectedYear);
                    if (!selectedMonthExists) {
                        // Add selected month and its boundaries (month start + next month start)
                        monthsToShow.push({ unit: selectedMonth, year: selectedYear });
                        const nextMonthIndex = (selectedMonth + 1) % 12;
                        const nextMonthYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
                        const nextMonthExists = monthsToShow.some(m => m.unit === nextMonthIndex && m.year === nextMonthYear);
                        if (!nextMonthExists) {
                            monthsToShow.push({ unit: nextMonthIndex, year: nextMonthYear });
                        }
                    }
                }
                
                // Sort to maintain order
                monthsToShow.sort((a, b) => {
                    if (a.year !== b.year) return a.year - b.year;
                    return a.unit - b.unit;
                });
                
                return monthsToShow;
            }
            return [];
        }
        
        function getMonthDate(unitInfo, unitIndex, unitYear) {
            // Handle month 12 which is next year boundary
            const monthIndex = typeof unitIndex === 'number' ? unitIndex : unitInfo.unit;
            const year = unitYear || (typeof unitInfo === 'object' && unitInfo.year) || timeState.selectedYear;
            if (monthIndex === 12) {
                return new Date(year + 1, 0, 1, 0, 0, 0);
            }
            return new Date(year, monthIndex, 1, 0, 0, 0);
        }
        
        function isCurrentMonth(unitInfo, unitIndex, unitYear) {
            // unitInfo might be a number (Zoom 3) or object (Zoom 4+), or undefined
            // Don't use || because 0 is a valid month index and is falsy!
            const infoToExtract = (unitInfo !== undefined && unitInfo !== null) ? unitInfo : unitIndex;
            const { unitIndex: monthIndex, unitYear: monthYear } = extractUnitInfo(infoToExtract, unitYear || timeState.selectedYear);
            const now = timeState.currentDate;
            const actualMonthInYear = now.getMonth();
            const actualYear = now.getFullYear();
            
            // Handle month 12 (next year boundary)
            if (monthIndex === 12) {
                return (monthYear + 1 === actualYear && actualMonthInYear === 0);
            }
            return (monthIndex === actualMonthInYear && monthYear === actualYear);
        }
        
        function isSelectedMonthValue(unitInfo, unitIndex, unitYear) {
            // unitInfo might be a number (Zoom 3) or object (Zoom 4+), or undefined
            // Don't use || because 0 is a valid month index and is falsy!
            const infoToExtract = (unitInfo !== undefined && unitInfo !== null) ? unitInfo : unitIndex;
            const { unitIndex: monthIndex, unitYear: monthYear } = extractUnitInfo(infoToExtract, unitYear || timeState.selectedYear);
            const { selectedMonth, selectedYear } = timeState;
            // Handle month 12 (next year boundary)
            if (monthIndex === 12) {
                return (monthYear + 1 === selectedYear && selectedMonth === 0);
            }
            return (monthIndex === selectedMonth && monthYear === selectedYear);
        }

        // CURVE: Monthly frame outer boundary (Zoom 4+ only)
        // For Zoom 4+, create monthly frame outer boundary curve at 2/3 for visible quarters
        if (zoomLevel >= 4) {
            const yearHeight = 100;
            const quarterHeight = yearHeight / 4;
            const quartersToShow = getVisibleParentUnits(
                zoomLevel,
                timeState,
                (ts) => ({ unit: ts.selectedQuarter, year: ts.selectedYear }),
                (ts) => {
                    const now = ts.currentDate;
                    return { unit: Math.floor(now.getMonth() / 3), year: now.getFullYear() };
                },
                4
            );
            
            createParentUnitCurvesForUnits({
                earthDistance,
                timeState,
                currentDateHeight,
                yearHeight,
                unitHeight: quarterHeight,
                outerRadius,
                parentUnitsToShow: quartersToShow,
                getSelectedUnit: (ts) => ({ unit: ts.selectedQuarter, year: ts.selectedYear }),
                getActualUnit: (ts) => {
                    const now = ts.currentDate;
                    return { unit: Math.floor(now.getMonth() / 3), year: now.getFullYear() };
                }
            });
        }

        // Use unified createTimeFrame helper
        createTimeFrame({
            unitType: 'month',
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitsPerParent: 12,
            unitNames: monthNames,
            parentHeight,
            getUnitsToShow: getMonthsToShow,
            getUnitDate: getMonthDate,
            isCurrentUnit: isCurrentMonth,
            isSelectedUnit: isSelectedMonthValue,
            skipLabels,
            labelRadius: labelRadius // Use explicit label radius
        });
    }

    // ============================================
    // SYSTEM 3: WEEK SYSTEM
    // ============================================
    /**
     * Creates week markers: lines and text
     * Used in Zoom 4+ (lines only at 4, text at 5+)
     */
    function createWeekSystem(earthDistance, timeState, zoomLevel, options = {}) {
        const { selectedYear, selectedMonth, selectedQuarter, currentDateHeight } = timeState;
        const { skipLabels = false } = options;
        
        // Adjust radii based on zoom level
        // Zoom 4+: weekly frame at 5/6, labels at center between 2/3 and 5/6 (3/4)
        const innerRadius = earthDistance * (2/3); // Monthly frame outer
        const outerRadius = earthDistance * (5/6); // Weekly frame outer
        const labelRadius = earthDistance * 0.75; // Center between 2/3 and 5/6 (3/4)
        
        const parentHeight = 0.0833; // One month in years (~30.44 days)
        
        // Helper functions for unified createTimeFrame
        function getWeeksToShow(zoomLevel, timeState) {
            const { selectedYear, selectedMonth } = timeState;
            let weeksToShow = [];
            
            if (zoomLevel >= 4) {
                // Use selectedMonth to determine which months to show (not just selectedQuarter)
                const selectedQuarterFromMonth = Math.floor(selectedMonth / 3);
                
                // Determine which months to get weeks for (include selected month's quarter + current quarter)
                let monthsForWeeks = [];
                
                // Always include selected month's quarter
                const selectedQuarterStartMonth = selectedQuarterFromMonth * 3;
                for (let m = selectedQuarterStartMonth; m < selectedQuarterStartMonth + 3; m++) {
                    monthsForWeeks.push({ month: m % 12, year: selectedYear + Math.floor(m / 12) });
                }
                
                // Add current quarter months if different
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                const isCurrentDifferent = (actualQuarter !== selectedQuarterFromMonth) || (actualYear !== selectedYear);
                if (isCurrentDifferent) {
                    const currentQuarterStartMonth = actualQuarter * 3;
                    for (let m = currentQuarterStartMonth; m < currentQuarterStartMonth + 3; m++) {
                        const monthYear = actualYear + Math.floor(m / 12);
                        const monthIndex = m % 12;
                        const alreadyExists = monthsForWeeks.some(mo => mo.month === monthIndex && mo.year === monthYear);
                        if (!alreadyExists) {
                            monthsForWeeks.push({ month: monthIndex, year: monthYear });
                        }
                    }
                }
                
                // ALWAYS ensure selected month is included even if not in visible quarters
                const selectedMonthExists = monthsForWeeks.some(mo => mo.month === selectedMonth && mo.year === selectedYear);
                if (!selectedMonthExists) {
                    monthsForWeeks.push({ month: selectedMonth, year: selectedYear });
                }
                
                // Get all Sundays that intersect with visible months
                monthsForWeeks.forEach(({ month, year }) => {
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstOfMonth = new Date(year, month, 1);
                    const lastOfMonth = new Date(year, month, daysInMonth);
                    
                    // Find first Sunday (or Sunday before month)
                    const firstSundayOffset = -firstOfMonth.getDay();
                    const firstSunday = new Date(year, month, 1 + firstSundayOffset);
                    firstSunday.setHours(0, 0, 0, 0);
                    
                    // Collect all Sundays that intersect with this month
                    let currentSunday = new Date(firstSunday);
                    while (currentSunday <= lastOfMonth || (currentSunday <= lastOfMonth && currentSunday.getMonth() === month)) {
                        const weekEnd = new Date(currentSunday);
                        weekEnd.setDate(currentSunday.getDate() + 6);
                        
                        // Include week if it intersects with the month
                        if ((currentSunday.getMonth() === month && currentSunday.getDate() <= daysInMonth) ||
                            (weekEnd.getMonth() === month && weekEnd.getDate() >= 1) ||
                            (currentSunday < firstOfMonth && weekEnd >= firstOfMonth)) {
                            weeksToShow.push(new Date(currentSunday)); // Store as Date object
                        }
                        
                        currentSunday.setDate(currentSunday.getDate() + 7);
                        
                        // Stop if we've moved too far past the month
                        if (currentSunday > lastOfMonth && currentSunday.getMonth() !== month) {
                            break;
                        }
                    }
                });
                
                // Also include selected week if not already in list
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                
                // Calculate selected week Sunday
                // For Zoom 5, selectedWeekOffset is in MONTHS, not weeks!
                // We need to calculate based on selectedMonth + currentWeekInMonth
                let selectedWeekSunday;
                if (zoomLevel === 5) {
                    // Zoom 5: Use selectedMonth and currentWeekInMonth to find the specific week
                    const { selectedMonth, selectedYear } = timeState;
                    const selectedMonthStart = new Date(selectedYear, selectedMonth, 1);
                    const firstSundayOffset = -selectedMonthStart.getDay(); // Days to go back to get Sunday before/at 1st
                    const firstSunday = new Date(selectedYear, selectedMonth, 1 + firstSundayOffset);
                    firstSunday.setHours(0, 0, 0, 0);
                    // Add currentWeekInMonth weeks (0-4)
                    selectedWeekSunday = new Date(firstSunday);
                    selectedWeekSunday.setDate(firstSunday.getDate() + (currentWeekInMonth * 7));
                    selectedWeekSunday.setHours(0, 0, 0, 0);
                } else {
                    // For other zoom levels, selectedWeekOffset might be in weeks
                    const selectedWeekOffset = timeState.selectedWeekOffset || 0;
                    selectedWeekSunday = new Date(actualCurrentWeekSunday);
                    selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedWeekOffset * 7));
                    selectedWeekSunday.setHours(0, 0, 0, 0);
                }
                
                const selectedWeekExists = weeksToShow.some(w => {
                    const wDate = new Date(w);
                    wDate.setHours(0, 0, 0, 0);
                    return wDate.getTime() === selectedWeekSunday.getTime();
                });
                
                if (!selectedWeekExists) {
                    weeksToShow.push(new Date(selectedWeekSunday));
                }
                
                // Sort weeks by date
                weeksToShow.sort((a, b) => a.getTime() - b.getTime());
            }
            
            return weeksToShow;
        }
        
        function getWeekDate(unitInfo, unitIndex, unitYear) {
            // unitIndex is a Date object for weeks (Sunday of the week)
            if (unitIndex instanceof Date) {
                return new Date(unitIndex);
            }
            // Fallback: should not happen for weeks
            return new Date();
        }
        
        function getWeekLabelText(unitInfo, unitIndex, unitYear) {
            // Format week as day range (e.g., "11-17")
            const weekSunday = unitIndex instanceof Date ? unitIndex : unitInfo;
            const weekStartDay = weekSunday.getDate();
            const weekEnd = new Date(weekSunday);
            weekEnd.setDate(weekSunday.getDate() + 6);
            const weekEndDay = weekEnd.getDate();
            return `${weekStartDay}-${weekEndDay}`;
        }
        
        function getWeekCenterDate(unitStartDate, unitInfo) {
            // Center of week is Wednesday (3.5 days from Sunday)
            const centerDate = new Date(unitStartDate);
            centerDate.setDate(unitStartDate.getDate() + 3.5);
            return centerDate;
        }
        
        function isCurrentWeek(unitInfo, unitIndex, unitYear) {
            const now = timeState.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            const weekSunday = unitIndex instanceof Date ? unitIndex : unitInfo;
            const normalizedWeekSunday = new Date(weekSunday);
            normalizedWeekSunday.setHours(0, 0, 0, 0);
            
            return normalizedWeekSunday.getTime() === actualCurrentWeekSunday.getTime();
        }
        
        // CURVE: Weekly frame outer boundary (Zoom 4+ only)
        // For Zoom 4+, create weekly frame outer boundary curve at 5/6 for visible months
        if (zoomLevel >= 4) {
            const yearHeight = 100;
            const monthHeight = yearHeight / 12;
            
            // Get visible quarters and expand to months (same logic as month system)
            const quartersToShow = getVisibleParentUnits(
                zoomLevel,
                timeState,
                (ts) => ({ unit: ts.selectedQuarter, year: ts.selectedYear }),
                (ts) => {
                    const now = ts.currentDate;
                    return { unit: Math.floor(now.getMonth() / 3), year: now.getFullYear() };
                },
                4
            );
            let monthsToShow = expandQuartersToMonths(quartersToShow);
            
            // ALWAYS ensure selected month is included
            const { selectedMonth, selectedYear } = timeState;
            if (selectedMonth !== undefined && selectedYear !== undefined) {
                const selectedMonthExists = monthsToShow.some(m => m.unit === selectedMonth && m.year === selectedYear);
                if (!selectedMonthExists) {
                    monthsToShow.push({ unit: selectedMonth, year: selectedYear });
                }
            }
            
            createParentUnitCurvesForUnits({
                earthDistance,
                timeState,
                currentDateHeight,
                yearHeight,
                unitHeight: monthHeight,
                outerRadius,
                parentUnitsToShow: monthsToShow,
                getSelectedUnit: (ts) => ({ unit: ts.selectedMonth, year: ts.selectedYear }),
                getActualUnit: (ts) => {
                    const now = ts.currentDate;
                    return { unit: now.getMonth(), year: now.getFullYear() };
                }
            });
        }
        
        function isSelectedWeekValue(unitInfo, unitIndex, unitYear) {
            const now = timeState.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            // Calculate selected week Sunday - reuse the same logic as getTimeState for consistency
            let selectedWeekSunday;
            if (zoomLevel === 5) {
                // Zoom 5: Use selectedMonth and currentWeekInMonth to find the specific week
                const { selectedMonth, selectedYear } = timeState;
                const selectedMonthStart = new Date(selectedYear, selectedMonth, 1);
                const firstSundayOffset = -selectedMonthStart.getDay(); // Days to go back to get Sunday before/at 1st
                const firstSunday = new Date(selectedYear, selectedMonth, 1 + firstSundayOffset);
                firstSunday.setHours(0, 0, 0, 0);
                // Add currentWeekInMonth weeks (0-4)
                selectedWeekSunday = new Date(firstSunday);
                selectedWeekSunday.setDate(firstSunday.getDate() + (currentWeekInMonth * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
            } else if (zoomLevel === 7) {
                // Zoom 7: Use selectedDayOffset (in weeks) + currentDayInWeek to find the selected day, then get its week Sunday
                const selectedDayOffset = timeState.selectedDayOffset || 0;
                selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                // Get the Sunday of the week containing the selected day
                // (selectedWeekSunday is already the Sunday, since we calculated it from currentDayInWeek = 0)
                selectedWeekSunday.setHours(0, 0, 0, 0);
            } else {
                // For other zoom levels, selectedWeekOffset might be in weeks
                const selectedWeekOffset = timeState.selectedWeekOffset || 0;
                selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedWeekOffset * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
            }
            
            const weekSunday = unitIndex instanceof Date ? unitIndex : unitInfo;
            const normalizedWeekSunday = new Date(weekSunday);
            normalizedWeekSunday.setHours(0, 0, 0, 0);
            
            return normalizedWeekSunday.getTime() === selectedWeekSunday.getTime();
        }

        // Use unified createTimeFrame helper
        createTimeFrame({
            unitType: 'week',
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitsPerParent: 4, // ~4 weeks per month
            unitNames: getWeekLabelText, // Function for dynamic labels
            parentHeight,
            getUnitsToShow: getWeeksToShow,
            getUnitDate: getWeekDate,
            getUnitCenterDate: getWeekCenterDate,
            isCurrentUnit: isCurrentWeek,
            isSelectedUnit: isSelectedWeekValue,
            skipLabels,
            labelRadius: labelRadius
        });
    }

    // ============================================
    // SYSTEM 4: DAY SYSTEM
    // ============================================
    /**
     * Creates day markers: curves, lines, and text
     * Used in Zoom 7+ (lines + text at 7)
     */
    function createDaySystem(earthDistance, timeState, zoomLevel, options = {}) {
        const { selectedYear, selectedMonth, selectedQuarter, currentDateHeight } = timeState;
        const { skipLabels = false } = options;
        
        // Adjust radii based on zoom level
        // Zoom 7+: daily frame at 11/12, labels at center between 5/6 and 11/12 (approximately 21/24)
        const innerRadius = earthDistance * (5/6); // Weekly frame outer
        const outerRadius = earthDistance * (11/12); // Daily frame outer
        const labelRadius = earthDistance * (21/24); // Center between 5/6 and 11/12
        
        const parentHeight = 7 / 365; // One week in years (~7 days)
        
        // Helper functions for unified createTimeFrame
        function getDaysToShow(zoomLevel, timeState) {
            const { selectedYear, selectedMonth } = timeState;
            let daysToShow = [];
            
            if (zoomLevel >= 7) {
                // Get visible weeks from week system logic
                // For days, we need to show all days within visible weeks
                const selectedQuarterFromMonth = Math.floor(selectedMonth / 3);
                
                // Determine which months to get days for (include selected month's quarter + current quarter)
                let monthsForDays = [];
                
                // Always include selected month's quarter
                const selectedQuarterStartMonth = selectedQuarterFromMonth * 3;
                for (let m = selectedQuarterStartMonth; m < selectedQuarterStartMonth + 3; m++) {
                    monthsForDays.push({ month: m % 12, year: selectedYear + Math.floor(m / 12) });
                }
                
                // Add current quarter months if different
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                const isCurrentDifferent = (actualQuarter !== selectedQuarterFromMonth) || (actualYear !== selectedYear);
                if (isCurrentDifferent) {
                    const currentQuarterStartMonth = actualQuarter * 3;
                    for (let m = currentQuarterStartMonth; m < currentQuarterStartMonth + 3; m++) {
                        const monthYear = actualYear + Math.floor(m / 12);
                        const monthIndex = m % 12;
                        const alreadyExists = monthsForDays.some(mo => mo.month === monthIndex && mo.year === monthYear);
                        if (!alreadyExists) {
                            monthsForDays.push({ month: monthIndex, year: monthYear });
                        }
                    }
                }
                
                // ALWAYS ensure selected month is included
                const selectedMonthExists = monthsForDays.some(mo => mo.month === selectedMonth && mo.year === selectedYear);
                if (!selectedMonthExists) {
                    monthsForDays.push({ month: selectedMonth, year: selectedYear });
                }
                
                // Get all days that intersect with visible weeks
                monthsForDays.forEach(({ month, year }) => {
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    
                    // Find first Sunday of the month (or before)
                    const firstOfMonth = new Date(year, month, 1);
                    const firstSundayOffset = -firstOfMonth.getDay();
                    const firstSunday = new Date(year, month, 1 + firstSundayOffset);
                    firstSunday.setHours(0, 0, 0, 0);
                    
                    // Collect all days in weeks that intersect with this month
                    let currentSunday = new Date(firstSunday);
                    const lastOfMonth = new Date(year, month, daysInMonth);
                    
                    while (currentSunday <= lastOfMonth || (currentSunday.getMonth() === month)) {
                        // Add all 7 days of this week
                        for (let d = 0; d < 7; d++) {
                            const dayDate = new Date(currentSunday);
                            dayDate.setDate(currentSunday.getDate() + d);
                            dayDate.setHours(0, 0, 0, 0);
                            
                            // Only include days that are in the visible month or adjacent weeks that touch it
                            if (dayDate >= firstSunday && dayDate <= lastOfMonth) {
                                // Check if we already have this day
                                const dayExists = daysToShow.some(d => d.getTime() === dayDate.getTime());
                                if (!dayExists) {
                                    daysToShow.push(dayDate);
                                }
                            }
                        }
                        
                        // Move to next Sunday
                        currentSunday.setDate(currentSunday.getDate() + 7);
                    }
                });
                
                // Sort by date
                daysToShow.sort((a, b) => a - b);
            }
            
            return daysToShow;
        }
        
        function getDayDate(unitInfo, unitIndex, unitYear) {
            // unitInfo is a Date object for days
            if (unitInfo instanceof Date) {
                return unitInfo;
            }
            // Fallback: construct date from index and year (not ideal but safe)
            return new Date(unitYear || timeState.selectedYear, timeState.selectedMonth || 0, (unitIndex || 0) + 1, 0, 0, 0);
        }
        
        function getDayCenterDate(dayStartDate, unitInfo) {
            // For days, the center is just the day itself (at noon)
            const center = new Date(dayStartDate);
            center.setHours(12, 0, 0, 0);
            return center;
        }
        
        function getDayLabelText(unitInfo, unitIndex, unitYear) {
            // unitInfo is a Date object for days
            const dayDate = unitInfo instanceof Date ? unitInfo : getDayDate(unitInfo, unitIndex, unitYear);
            return dayDate.getDate().toString(); // Just the day number (1-31)
        }
        
        function isCurrentDay(unitInfo, unitIndex, unitYear) {
            const now = timeState.currentDate;
            const dayDate = unitInfo instanceof Date ? unitInfo : getDayDate(unitInfo, unitIndex, unitYear);
            return dayDate.getFullYear() === now.getFullYear() &&
                   dayDate.getMonth() === now.getMonth() &&
                   dayDate.getDate() === now.getDate();
        }
        
        function isSelectedDayValue(unitInfo, unitIndex, unitYear) {
            const now = timeState.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            // Calculate selected day
            // For Zoom 7, selectedDayOffset is in WEEKS, not days!
            // Use currentDayInWeek from the module's state (not timeState) since it's updated by updateOffsets
            const selectedDayOffset = timeState.selectedDayOffset || 0;
            const selectedWeekSunday = new Date(actualCurrentWeekSunday);
            selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
            selectedWeekSunday.setHours(0, 0, 0, 0);
            
            // Add currentDayInWeek days to get the selected day (use module variable, not timeState)
            // Default to actualDayInWeek if currentDayInWeek is undefined (shouldn't happen but safety check)
            const dayOffset = (currentDayInWeek !== undefined && currentDayInWeek !== null) ? currentDayInWeek : actualDayInWeek;
            const selectedDay = new Date(selectedWeekSunday);
            selectedDay.setDate(selectedWeekSunday.getDate() + dayOffset);
            selectedDay.setHours(0, 0, 0, 0);
            
            const dayDate = unitInfo instanceof Date ? unitInfo : getDayDate(unitInfo, unitIndex, unitYear);
            const normalizedDay = new Date(dayDate);
            normalizedDay.setHours(0, 0, 0, 0);
            
            return normalizedDay.getTime() === selectedDay.getTime();
        }

        // CURVE: Daily frame outer boundary (Zoom 7+ only)
        // For Zoom 7+, create daily frame outer boundary curve at 11/12 for visible weeks
        if (zoomLevel >= 7) {
            const yearHeight = 100;
            const weekHeight = yearHeight * (7 / 365); // One week in years
            
            // Get visible weeks (from week system logic)
            const weeksToShow = getDaysToShow(zoomLevel, timeState);
            
            // Convert days to weeks (group by Sunday)
            const weekSundays = new Set();
            weeksToShow.forEach(dayDate => {
                const sunday = new Date(dayDate);
                const dayOfWeek = sunday.getDay();
                sunday.setDate(sunday.getDate() - dayOfWeek);
                sunday.setHours(0, 0, 0, 0);
                weekSundays.add(sunday.getTime());
            });
            
            // Create curves for each visible week
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            const curveSegments = 64;
            
            Array.from(weekSundays).forEach(sundayTime => {
                const weekSunday = new Date(sundayTime);
                const weekStart = new Date(weekSunday);
                const weekEnd = new Date(weekSunday);
                weekEnd.setDate(weekSunday.getDate() + 7);
                
                // Use calculateDateHeight for accurate week positioning
                const weekStartHeight = calculateDateHeight(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0);
                const weekEndHeight = calculateDateHeight(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 0);
                const weekHeightActual = weekEndHeight - weekStartHeight;
                
                const yearsFromCurrentToWeekStart = (weekStartHeight - currentDateHeight) / 100;
                const orbitsFromCurrentToWeekStart = yearsFromCurrentToWeekStart / earth.orbitalPeriod;
                const weekStartAngle = earth.startAngle - (orbitsFromCurrentToWeekStart * Math.PI * 2);
                
                const timeSpanYears = weekHeightActual / 100;
                const orbitsInSpan = timeSpanYears / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= curveSegments; i++) {
                    const t = i / curveSegments;
                    const angle = weekStartAngle - (t * orbitsInSpan * Math.PI * 2);
                    const height = weekStartHeight + (t * weekHeightActual);
                    curvePoints.push(
                        Math.cos(angle) * outerRadius, height, Math.sin(angle) * outerRadius
                    );
                }
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                const curve = new THREE.Line(curveGeometry, curveMaterial);
                scene.add(curve);
                timeMarkers.push(curve);
            });
        }

        // Use unified createTimeFrame helper
        createTimeFrame({
            unitType: 'day',
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitsPerParent: 7, // 7 days per week
            unitNames: getDayLabelText, // Function for dynamic labels
            parentHeight,
            getUnitsToShow: getDaysToShow,
            getUnitDate: getDayDate,
            getUnitCenterDate: getDayCenterDate,
            isCurrentUnit: isCurrentDay,
            isSelectedUnit: isSelectedDayValue,
            skipLabels,
            labelRadius: labelRadius
        });
        
        // DAY-OF-WEEK LABELS: 3-letter day names (full names for current/selected) between day numbers and Earth
        if (zoomLevel >= 7 && !skipLabels) {
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            const dayOfWeekNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayOfWeekNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            
            // Position day-of-week labels midway between day number labels and Earth
            // labelRadius is at 21/24, Earth is at 1.0, so midpoint is at (21/24 + 1) / 2 = 45/48 = 15/16
            const dayOfWeekLabelRadius = earthDistance * (15/16);
            
            // Check if there's a navigation offset for days (same logic as createTimeFrame)
            const now = timeState.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            const selectedDayOffset = timeState.selectedDayOffset || 0;
            const selectedWeekSunday = new Date(actualCurrentWeekSunday);
            selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
            selectedWeekSunday.setHours(0, 0, 0, 0);
            
            const dayOffset = (currentDayInWeek !== undefined && currentDayInWeek !== null) ? currentDayInWeek : actualDayInWeek;
            const hasDayOffset = (selectedDayOffset !== 0) || (currentDayInWeek !== actualDayInWeek);
            
            // Get all days to show (same as createTimeFrame logic)
            const daysToShow = getDaysToShow(zoomLevel, timeState);
            
            daysToShow.forEach(dayDate => {
                const isCurrent = isCurrentDay(dayDate, null, null);
                const isSelected = isSelectedDayValue(dayDate, null, null);
                
                // Color logic: Red for current, Blue for selected (when offset exists), White default
                // Use string format ('red', 'blue') or false for default, same as createTimeFrame
                let dayOfWeekColor;
                if (isCurrent) {
                    dayOfWeekColor = 'red';
                } else if (hasDayOffset && isSelected) {
                    dayOfWeekColor = 'blue';
                } else {
                    dayOfWeekColor = false; // Default (white/black based on light mode)
                }
                
                // Get day-of-week text: full name for current/selected, 3-letter abbreviation otherwise
                const dayOfWeekIndex = dayDate.getDay();
                const dayOfWeekText = (isCurrent || (hasDayOffset && isSelected)) 
                    ? dayOfWeekNamesFull[dayOfWeekIndex] 
                    : dayOfWeekNamesShort[dayOfWeekIndex];
                
                // Calculate position for day-of-week label (at noon of the day)
                const dayCenterDate = getDayCenterDate(dayDate, dayDate);
                const dayHeight = calculateDateHeight(
                    dayCenterDate.getFullYear(),
                    dayCenterDate.getMonth(),
                    dayCenterDate.getDate(),
                    dayCenterDate.getHours()
                );
                
                const yearsFromCurrentToDay = (dayHeight - currentDateHeight) / 100;
                const orbitsFromCurrentToDay = yearsFromCurrentToDay / earth.orbitalPeriod;
                const dayAngle = earth.startAngle - (orbitsFromCurrentToDay * Math.PI * 2);
                
                // Create day-of-week label using the same text size as day numbers (Zoom 7)
                createTextLabel(dayOfWeekText, dayHeight, dayOfWeekLabelRadius, 7, dayAngle, dayOfWeekColor, false, 0.85);
            });
        }
    }

    // ============================================
    // MAIN ENTRY POINT
    // ============================================
    function createTimeMarkers(zoomLevel) {
        // Clear existing markers
        timeMarkers.forEach(m => scene.remove(m));
        timeMarkers.length = 0;

        console.log('Creating time markers for zoom level:', zoomLevel);

        if (!ZOOM_LEVELS[zoomLevel]) return;

        // Get Earth's position
        const earthPlanet = planetMeshes.find(p => p.userData.name === 'Earth');
        const earthDistance = earthPlanet ? earthPlanet.userData.distance : 50;

        // Get shared time state
        const timeState = getTimeState(zoomLevel);

        // Stack marker systems based on zoom level
        if (zoomLevel === 3 || zoomLevel === 4 || zoomLevel === 5 || zoomLevel === 7) {
            // Zoom 3-5, 7: Quarter + Month systems
            createQuarterSystem(earthDistance, timeState, zoomLevel);
            createMonthSystem(earthDistance, timeState, zoomLevel);
        }
        
        // Week system: Zoom 4+ (lines only at 4, text at 5+)
        if (zoomLevel >= 4) {
            createWeekSystem(earthDistance, timeState, zoomLevel);
        }

        // Day system: Zoom 7+ (lines + text at 7)
        if (zoomLevel >= 7) {
            createDaySystem(earthDistance, timeState, zoomLevel);
        }
    }

    // ============================================
    // UPDATE OFFSETS (called each time navigation happens)
    // ============================================
    function updateOffsets(newOffsets) {
        // Update offset values that change during navigation
        selectedYearOffset = newOffsets.selectedYearOffset;
        selectedQuarterOffset = newOffsets.selectedQuarterOffset;
        selectedWeekOffset = newOffsets.selectedWeekOffset;
        selectedDayOffset = newOffsets.selectedDayOffset;
        selectedHourOffset = newOffsets.selectedHourOffset;
        currentMonthInYear = newOffsets.currentMonthInYear;
        currentMonth = newOffsets.currentMonth;
        currentWeekInMonth = newOffsets.currentWeekInMonth; // Needed for Zoom 5 week calculation
        currentQuarter = newOffsets.currentQuarter; // Needed for Zoom 3 quarter navigation
        currentDayInWeek = newOffsets.currentDayInWeek; // Needed for Zoom 7 day calculation
    }

    // ============================================
    // EXPORT
    // ============================================
    return {
        init,
        createTimeMarkers,
        updateOffsets
    };
})();
