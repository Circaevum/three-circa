/**
 * Circaevum Time Markers Module - SIMPLIFIED
 * 
 * Simplified from 2,153 lines to ~800 lines by:
 * - Using declarative system configs for quarter/month
 * - Unifying helper functions (getAngle, getColor, calculateOffset)
 * - Simplifying createTimeFrame by removing duplicate logic
 * - Streamlining week/day systems
 */

const TimeMarkers = (function() {
    // ============================================
    // STATE & DEPENDENCIES
    // ============================================
    let scene, timeMarkers, getMarkerColor, createTextLabel;
    let PLANET_DATA, ZOOM_LEVELS, CENTURY_START;
    let currentYear, currentMonth, currentQuarter, currentWeekInMonth, currentDayInWeek;
    let selectedYearOffset, selectedQuarterOffset, selectedWeekOffset, selectedDayOffset;
    let isLightMode, calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let planetMeshes;

    function init(dependencies) {
        scene = dependencies.scene;
        timeMarkers = dependencies.timeMarkers;
        getMarkerColor = dependencies.getMarkerColor;
        createTextLabel = dependencies.createTextLabel;
        PLANET_DATA = dependencies.PLANET_DATA;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        CENTURY_START = dependencies.CENTURY_START;
        currentYear = dependencies.currentYear;
        currentMonth = dependencies.currentMonth;
        currentQuarter = dependencies.currentQuarter;
        currentWeekInMonth = dependencies.currentWeekInMonth;
        currentDayInWeek = dependencies.currentDayInWeek;
        selectedYearOffset = dependencies.selectedYearOffset;
        selectedQuarterOffset = dependencies.selectedQuarterOffset;
        selectedWeekOffset = dependencies.selectedWeekOffset;
        selectedDayOffset = dependencies.selectedDayOffset;
        isLightMode = dependencies.isLightMode;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        planetMeshes = dependencies.planetMeshes;
    }

    // ============================================
    // SIMPLIFIED TIME STATE
    // ============================================
    function getTimeState(zoomLevel) {
        const now = new Date();
        const actualYear = now.getFullYear();
        const actualMonth = now.getMonth();
        const actualDay = now.getDate();
        
        let currentDateHeight = calculateCurrentDateHeight();
        if (zoomLevel === 3 || zoomLevel === 4) {
            const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            const isLeap = (actualYear % 4 === 0 && actualYear % 100 !== 0) || (actualYear % 400 === 0);
            if (isLeap) daysInMonth[1] = 29;
            const yearProgress = (actualMonth + (actualDay - 1) / daysInMonth[actualMonth]) / 12;
            currentDateHeight = ((actualYear - 2000) * 100) + (yearProgress * 100);
        }

        let selectedYear, selectedMonth, selectedQuarter, selectedDateHeight;
        if (zoomLevel === 3) {
            selectedYear = actualYear + selectedYearOffset;
            selectedQuarter = currentQuarter;
            selectedMonth = selectedQuarter * 3;
        } else if (zoomLevel === 4) {
            const systemQuarter = Math.floor(actualMonth / 3);
            const selectedQuarterValue = systemQuarter + selectedQuarterOffset;
            selectedQuarter = ((selectedQuarterValue % 4) + 4) % 4;
            selectedMonth = (selectedQuarter * 3) + currentMonth;
            selectedYear = actualYear + Math.floor(selectedQuarterValue / 4);
        } else if (zoomLevel === 5) {
            selectedYear = actualYear + Math.floor((actualMonth + selectedWeekOffset) / 12);
            selectedMonth = ((actualMonth + selectedWeekOffset) % 12 + 12) % 12;
            selectedQuarter = Math.floor(selectedMonth / 3);
        } else if (zoomLevel === 6) {
            selectedYear = actualYear + Math.floor((actualMonth + selectedWeekOffset) / 12);
            selectedMonth = ((actualMonth + selectedWeekOffset) % 12 + 12) % 12;
            selectedQuarter = Math.floor(selectedMonth / 3);
            const config = ZOOM_LEVELS[6];
            selectedDateHeight = currentDateHeight + (selectedWeekOffset * config.timeYears * 100);
        } else if (zoomLevel === 7) {
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            const selectedWeekSunday = new Date(actualCurrentWeekSunday);
            selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
            selectedWeekSunday.setHours(0, 0, 0, 0);
            const selectedDay = new Date(selectedWeekSunday);
            selectedDay.setDate(selectedWeekSunday.getDate() + (currentDayInWeek || 0));
            selectedDay.setHours(0, 0, 0, 0);
            selectedMonth = selectedDay.getMonth();
            selectedYear = selectedDay.getFullYear();
            selectedQuarter = Math.floor(selectedMonth / 3);
        } else {
            // Default case for zoom levels not explicitly handled (e.g., zoom 2, 8, 9)
            // Use current month/year as fallback
            selectedYear = actualYear;
            selectedMonth = actualMonth;
            selectedQuarter = Math.floor(actualMonth / 3);
        }

        if (!selectedDateHeight) {
            selectedDateHeight = calculateDateHeight(new Date(selectedYear, selectedMonth, 1));
        }

        return {
            currentDate: now,
            currentDateHeight,
            selectedDate: new Date(selectedYear, selectedMonth, 1),
            selectedDateHeight,
            selectedYear,
            selectedMonth,
            selectedQuarter,
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            currentDayInWeek
        };
    }

    // ============================================
    // UNIFIED HELPERS
    // ============================================
    
    function getAngle(height, currentHeight) {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const years = (height - currentHeight) / 100;
        const orbits = years / earth.orbitalPeriod;
        return earth.startAngle - (orbits * Math.PI * 2);
    }

    function getColor(isCurrent, isSelected, hasOffset) {
        if (isCurrent) return 0xFF0000;
        if (hasOffset && isSelected) return isLightMode ? 0x0066CC : 0x00FFFF;
        return getMarkerColor();
    }

    function getLabelColor(isCurrent, isSelected, hasOffset) {
        if (isCurrent) return 'red';
        if (hasOffset && isSelected) return 'blue';
        return false;
    }

    // Unified offset calculation
    function calculateOffset(unitType, zoomLevel, timeState) {
        const now = timeState.currentDate;
        if (unitType === 'quarter') {
            return timeState.selectedQuarterOffset !== 0;
        } else if (unitType === 'month') {
            return timeState.selectedWeekOffset !== 0 || 
                   timeState.selectedMonth !== now.getMonth() || 
                   timeState.selectedYear !== now.getFullYear();
        } else if (unitType === 'week') {
            if (zoomLevel === 5) {
                const actualMonth = now.getMonth();
                const actualYear = now.getFullYear();
                const monthDifferent = (timeState.selectedMonth !== actualMonth) || (timeState.selectedYear !== actualYear);
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                const actualMonthStart = new Date(actualYear, actualMonth, 1);
                const actualFirstSundayOffset = -actualMonthStart.getDay();
                const actualFirstSunday = new Date(actualYear, actualMonth, 1 + actualFirstSundayOffset);
                actualFirstSunday.setHours(0, 0, 0, 0);
                const actualWeekInMonth = Math.floor((actualCurrentWeekSunday.getTime() - actualFirstSunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
                const weekInMonthDifferent = (currentWeekInMonth !== actualWeekInMonth) && 
                                            (timeState.selectedMonth === actualMonth && timeState.selectedYear === actualYear);
                return monthDifferent || weekInMonthDifferent;
            } else if (zoomLevel === 7) {
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                const selectedDayOffset = timeState.selectedDayOffset || 0;
                const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
                return (selectedDayOffset !== 0) || (selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime());
            }
            return (timeState.selectedWeekOffset || 0) !== 0;
        } else if (unitType === 'day') {
            if (zoomLevel === 7) {
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                const selectedDayOffset = timeState.selectedDayOffset || 0;
                const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
                const weekDifferent = (selectedDayOffset !== 0) || (selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime());
                return weekDifferent || (currentDayInWeek !== actualDayInWeek);
            }
            return (timeState.selectedDayOffset || 0) !== 0;
        }
        return false;
    }

    // Get previous unit (simplified - just check array index)
    function getPreviousUnit(unitInfo, unitIndex, unitYear, unitType, unitsArray, currentIndex) {
        if (currentIndex === 0) return null;
        return unitsArray[currentIndex - 1];
    }

    // ============================================
    // SYSTEM DEFINITIONS (Declarative)
    // ============================================
    
    const SYSTEMS = {
        quarter: {
            name: 'quarter',
            getRadii: (zoom, dist) => zoom >= 4 
                ? { outer: dist/3, inner: null, label: dist/6 }
                : { outer: dist*0.5, inner: null, label: dist*0.25 },
            getUnits: (zoom, state) => {
                if (zoom === 3) return Array.from({length: 4}, (_, i) => ({index: i, year: state.selectedYear}));
                const units = [{index: state.selectedQuarter, year: state.selectedYear}];
                const now = state.currentDate;
                const actual = Math.floor(now.getMonth() / 3);
                if (actual !== state.selectedQuarter || now.getFullYear() !== state.selectedYear) {
                    units.push({index: actual, year: now.getFullYear()});
                }
                return units;
            },
            getDate: (unitInfo, index, year) => new Date(year || (typeof unitInfo === 'object' && unitInfo.year) || 2026, (index !== undefined ? index : (typeof unitInfo === 'object' ? unitInfo.index : 0)) * 3, 1),
            names: ['Q1', 'Q2', 'Q3', 'Q4'],
            isCurrent: (unit, state) => {
                const now = state.currentDate;
                return Math.floor(now.getMonth() / 3) === unit.index && now.getFullYear() === unit.year;
            },
            isSelected: (unit, state) => unit.index === state.selectedQuarter && unit.year === state.selectedYear
        },
        month: {
            name: 'month',
            getRadii: (zoom, dist) => zoom >= 4
                ? { outer: dist*2/3, inner: dist/3, label: dist*0.5 }
                : { outer: dist*0.75, inner: dist*0.5, label: dist*0.75 },
            getUnits: (zoom, state) => {
                const units = [];
                const selectedQ = Math.floor(state.selectedMonth / 3);
                // Include all months in the selected quarter
                for (let m = selectedQ * 3; m < (selectedQ + 1) * 3; m++) {
                    units.push({index: m, year: state.selectedYear});
                }
                // Include the first month of the next quarter for boundary line (if not Q4)
                if (selectedQ < 3) {
                    const boundaryMonth = (selectedQ + 1) * 3;
                    units.push({index: boundaryMonth, year: state.selectedYear});
                }
                const now = state.currentDate;
                const actualQ = Math.floor(now.getMonth() / 3);
                if (actualQ !== selectedQ || now.getFullYear() !== state.selectedYear) {
                    // Include all months in the current quarter
                    for (let m = actualQ * 3; m < (actualQ + 1) * 3; m++) {
                        units.push({index: m, year: now.getFullYear()});
                    }
                    // Include the first month of the next quarter for boundary line (if not Q4)
                    if (actualQ < 3) {
                        const boundaryMonth = (actualQ + 1) * 3;
                        units.push({index: boundaryMonth, year: now.getFullYear()});
                    }
                }
                const exists = units.some(u => u.index === state.selectedMonth && u.year === state.selectedYear);
                if (!exists) units.push({index: state.selectedMonth, year: state.selectedYear});
                return units.sort((a, b) => a.year !== b.year ? a.year - b.year : a.index - b.index);
            },
            getDate: (unitInfo, index, year) => {
                const monthIndex = index !== undefined ? index : (typeof unitInfo === 'object' ? unitInfo.index : 0);
                const monthYear = year || (typeof unitInfo === 'object' && unitInfo.year) || 2026;
                return monthIndex === 12 ? new Date(monthYear + 1, 0, 1) : new Date(monthYear, monthIndex, 1);
            },
            names: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
            isCurrent: (unit, state) => {
                const now = state.currentDate;
                if (unit.index === 12) return (unit.year + 1 === now.getFullYear() && now.getMonth() === 0);
                return now.getMonth() === unit.index && now.getFullYear() === unit.year;
            },
            isSelected: (unit, state) => {
                if (unit.index === 12) return (unit.year + 1 === state.selectedYear && state.selectedMonth === 0);
                return unit.index === state.selectedMonth && unit.year === state.selectedYear;
            }
        }
    };

    // ============================================
    // SIMPLIFIED FRAME CREATION
    // ============================================
    
    function createTimeFrame(config) {
        const { unitType, zoomLevel, outerRadius, innerRadius, earthDistance, timeState, 
                unitNames, getUnitsToShow, getUnitDate, isCurrentUnit, isSelectedUnit, 
                skipLabels = false, labelRadius = null, getUnitCenterDate } = config;
        
        const showText = !skipLabels && ((unitType === 'quarter' && zoomLevel >= 3) ||
                                        (unitType === 'month' && zoomLevel >= 4) ||
                                        (unitType === 'week' && zoomLevel >= 5) ||
                                        (unitType === 'day' && zoomLevel >= 7));
        
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const unitsToShow = getUnitsToShow(zoomLevel, timeState);
        
        // Zoom 3 curves for quarter boundaries
        if (zoomLevel === 3 && innerRadius === null && unitType === 'quarter') {
            const selectedYear = timeState.selectedYear;
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            
            // Create a curve for each quarter using actual date heights
            for (let q = 0; q < 4; q++) {
                const quarterStartMonth = q * 3;
                const quarterStartHeight = calculateDateHeight(selectedYear, quarterStartMonth, 1, 0);
                const quarterEndMonth = quarterStartMonth + 3;
                const quarterEndHeight = calculateDateHeight(selectedYear, quarterEndMonth, 1, 0);
                const quarterHeight = quarterEndHeight - quarterStartHeight;
                
                const angle = getAngle(quarterStartHeight, timeState.currentDateHeight);
                const orbitsInSpan = (quarterHeight / 100) / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= 64; i++) {
                    const t = i / 64;
                    const a = angle - (t * orbitsInSpan * Math.PI * 2);
                    const h = quarterStartHeight + (t * quarterHeight);
                    curvePoints.push(Math.cos(a) * outerRadius, h, Math.sin(a) * outerRadius);
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
        
        // Create lines and labels
        unitsToShow.forEach((unitInfo, i) => {
            let unitIndex, unitYear;
            if (unitInfo instanceof Date) {
                unitIndex = unitInfo;
                unitYear = unitInfo.getFullYear();
            } else if (typeof unitInfo === 'object' && unitInfo !== null) {
                unitIndex = unitInfo.unit !== undefined ? unitInfo.unit : unitInfo.index;
                unitYear = unitInfo.year || timeState.selectedYear;
            } else {
                unitIndex = unitInfo;
                unitYear = timeState.selectedYear;
            }
            
            const unitStartDate = getUnitDate(unitInfo, unitIndex, unitYear);
            const height = calculateDateHeight(unitStartDate.getFullYear(), unitStartDate.getMonth(), 
                                              unitStartDate.getDate(), unitStartDate.getHours());
            const angle = getAngle(height, timeState.currentDateHeight);
            
            // Convert to unit object format expected by isCurrent/isSelected functions
            const unit = { index: unitIndex, year: unitYear };
            const isCurrent = isCurrentUnit(unit, timeState);
            const isSelected = isSelectedUnit(unit, timeState);
            const hasOffset = calculateOffset(unitType, zoomLevel, timeState);
            
            // Previous unit for both-sides coloring
            const prevUnit = i > 0 ? unitsToShow[i-1] : null;
            let prevIsCurrent = false, prevIsSelected = false, prevHasOffset = false;
            if (prevUnit) {
                let prevIndex, prevYear;
                if (prevUnit instanceof Date) {
                    prevIndex = prevUnit;
                    prevYear = prevUnit.getFullYear();
                } else if (typeof prevUnit === 'object') {
                    prevIndex = prevUnit.unit !== undefined ? prevUnit.unit : prevUnit.index;
                    prevYear = prevUnit.year || timeState.selectedYear;
                } else {
                    prevIndex = prevUnit;
                    prevYear = timeState.selectedYear;
                }
                const prevUnitObj = { index: prevIndex, year: prevYear };
                prevIsCurrent = isCurrentUnit(prevUnitObj, timeState);
                prevIsSelected = isSelectedUnit(prevUnitObj, timeState);
                prevHasOffset = calculateOffset(unitType, zoomLevel, timeState);
            }
            
            // Line radii
            let startRadius = innerRadius || 0;
            let endRadius = outerRadius;
            if (zoomLevel === 3 && innerRadius === null) {
                startRadius = 0;
            } else if (zoomLevel >= 4) {
                if (unitType === 'month' && typeof unitIndex === 'number' && unitIndex % 3 === 0 && unitIndex > 0) {
                    startRadius = 0; // Quarter boundaries (end of previous quarter)
                    endRadius = earthDistance; // Extend to Earth's worldline
                }
                if (unitType === 'week' && zoomLevel >= 7) {
                    endRadius = earthDistance;
                }
            }
            
            // Create line
            const points = [
                Math.cos(angle) * startRadius, height, Math.sin(angle) * startRadius,
                Math.cos(angle) * endRadius, height, Math.sin(angle) * endRadius
            ];
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
            
            const lineColor = getColor(isCurrent || prevIsCurrent, isSelected || prevIsSelected, hasOffset || prevHasOffset);
            const material = new THREE.LineBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: (isCurrent || isSelected) ? 0.9 : 0.7,
                linewidth: (isCurrent || isSelected) ? 3 : 2
            });
            
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            timeMarkers.push(line);
            
            // Create label
            if (showText) {
                let labelText = null;
                if (typeof unitNames === 'function') {
                    labelText = unitNames(unitInfo, unitIndex, unitYear);
                } else if (Array.isArray(unitNames) && typeof unitIndex === 'number' && unitIndex < unitNames.length) {
                    labelText = unitNames[unitIndex];
                }
                
                if (labelText) {
                    // Month label filtering for Zoom 4+
                    if (unitType === 'month' && zoomLevel >= 4) {
                        const quarterStart = timeState.selectedQuarter * 3;
                        const isInSelectedQ = (unitIndex >= quarterStart && unitIndex < quarterStart + 3) && (unitYear === timeState.selectedYear);
                        const now = timeState.currentDate;
                        const actualQ = Math.floor(now.getMonth() / 3);
                        const isInCurrentQ = (actualQ !== timeState.selectedQuarter || now.getFullYear() !== timeState.selectedYear) &&
                                           (unitIndex >= (actualQ * 3) && unitIndex < (actualQ * 3) + 3) && (unitYear === now.getFullYear());
                        if (!isInSelectedQ && !isInCurrentQ) return;
                    }
                    
                    let centerDate = unitStartDate;
                    if (getUnitCenterDate) {
                        centerDate = getUnitCenterDate(unitStartDate, unitInfo);
                    } else if (unitType === 'month') {
                        const monthIndex = typeof unitIndex === 'number' ? unitIndex : unitStartDate.getMonth();
                        const daysInMonth = new Date(unitYear, monthIndex + 1, 0).getDate();
                        centerDate = new Date(unitStartDate);
                        centerDate.setDate(Math.floor(daysInMonth / 2) + 1);
                    } else if (unitType === 'quarter') {
                        const qIndex = typeof unitIndex === 'number' ? unitIndex : Math.floor(unitStartDate.getMonth() / 3);
                        centerDate = new Date(unitStartDate);
                        centerDate.setMonth(qIndex * 3 + 1);
                        centerDate.setDate(15);
                    } else if (unitType === 'week') {
                        centerDate = new Date(unitStartDate);
                        centerDate.setDate(unitStartDate.getDate() + 3.5);
                    }
                    
                    const labelHeight = calculateDateHeight(centerDate.getFullYear(), centerDate.getMonth(), 
                                                           centerDate.getDate(), centerDate.getHours());
                    const labelAngle = getAngle(labelHeight, timeState.currentDateHeight);
                    const calcLabelRadius = labelRadius || (innerRadius ? (innerRadius + outerRadius) / 2 : outerRadius / 2);
                    const labelColor = getLabelColor(isCurrent, isSelected, hasOffset);
                    const textZoom = (unitType === 'quarter' || unitType === 'month') ? 4 : (unitType === 'week' ? 5 : zoomLevel);
                    createTextLabel(labelText, labelHeight, calcLabelRadius, textZoom, labelAngle, labelColor, false, 0.85);
                }
            }
        });
    }

    // ============================================
    // QUARTER SYSTEM (Simplified)
    // ============================================
    
    function createQuarterSystem(earthDistance, timeState, zoomLevel) {
        const system = SYSTEMS.quarter;
        const radii = system.getRadii(zoomLevel, earthDistance);
        
        // Parent curves for Zoom 4+
        if (zoomLevel >= 4) {
            const quartersToShow = system.getUnits(zoomLevel, timeState);
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            
            quartersToShow.forEach(qInfo => {
                const qIndex = typeof qInfo === 'object' ? qInfo.index : qInfo;
                const qYear = typeof qInfo === 'object' ? qInfo.year : timeState.selectedYear;
                
                // Use calculateDateHeight to match actual line positions
                const quarterStartMonth = qIndex * 3;
                const quarterStartHeight = calculateDateHeight(qYear, quarterStartMonth, 1, 0);
                const quarterEndMonth = quarterStartMonth + 3;
                const quarterEndHeight = calculateDateHeight(qYear, quarterEndMonth, 1, 0);
                const quarterHeight = quarterEndHeight - quarterStartHeight;
                
                const angle = getAngle(quarterStartHeight, timeState.currentDateHeight);
                const orbitsInSpan = (quarterHeight / 100) / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= 64; i++) {
                    const t = i / 64;
                    const a = angle - (t * orbitsInSpan * Math.PI * 2);
                    const h = quarterStartHeight + (t * quarterHeight);
                    curvePoints.push(Math.cos(a) * radii.outer, h, Math.sin(a) * radii.outer);
                }
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                scene.add(new THREE.Line(curveGeometry, curveMaterial));
            });
        }
        
        createTimeFrame({
            unitType: 'quarter',
            zoomLevel,
            outerRadius: radii.outer,
            innerRadius: radii.inner,
            earthDistance,
            timeState,
            unitNames: system.names,
            getUnitsToShow: system.getUnits,
            getUnitDate: system.getDate,
            isCurrentUnit: system.isCurrent,
            isSelectedUnit: system.isSelected,
            labelRadius: radii.label
        });
    }

    // ============================================
    // MONTH SYSTEM (Simplified)
    // ============================================
    
    function createMonthSystem(earthDistance, timeState, zoomLevel) {
        const system = SYSTEMS.month;
        const radii = system.getRadii(zoomLevel, earthDistance);
        
        // Month curves for Zoom 3
        if (zoomLevel === 3) {
            const monthsToShow = system.getUnits(zoomLevel, timeState);
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            
            monthsToShow.forEach(mInfo => {
                const mIndex = typeof mInfo === 'object' ? mInfo.index : mInfo;
                const mYear = typeof mInfo === 'object' ? mInfo.year : timeState.selectedYear;
                
                // Use calculateDateHeight to match actual line positions
                let monthStartHeight, monthEndHeight;
                if (mIndex === 12) {
                    monthStartHeight = calculateDateHeight(mYear + 1, 0, 1, 0);
                    monthEndHeight = calculateDateHeight(mYear + 1, 1, 1, 0);
                } else {
                    monthStartHeight = calculateDateHeight(mYear, mIndex, 1, 0);
                    const nextMonth = mIndex + 1;
                    monthEndHeight = calculateDateHeight(mYear, nextMonth, 1, 0);
                }
                const monthHeight = monthEndHeight - monthStartHeight;
                
                const angle = getAngle(monthStartHeight, timeState.currentDateHeight);
                const orbitsInSpan = (monthHeight / 100) / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= 64; i++) {
                    const t = i / 64;
                    const a = angle - (t * orbitsInSpan * Math.PI * 2);
                    const h = monthStartHeight + (t * monthHeight);
                    curvePoints.push(Math.cos(a) * radii.outer, h, Math.sin(a) * radii.outer);
                }
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                scene.add(new THREE.Line(curveGeometry, curveMaterial));
            });
        }
        
        // Parent curves for Zoom 4+
        if (zoomLevel >= 4) {
            const monthsToShow = system.getUnits(zoomLevel, timeState);
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            
            monthsToShow.forEach(mInfo => {
                const mIndex = typeof mInfo === 'object' ? mInfo.index : mInfo;
                const mYear = typeof mInfo === 'object' ? mInfo.year : timeState.selectedYear;
                
                // Use calculateDateHeight to match actual line positions
                // Handle month 12 (next year boundary)
                let monthStartHeight, monthEndHeight;
                if (mIndex === 12) {
                    monthStartHeight = calculateDateHeight(mYear + 1, 0, 1, 0);
                    monthEndHeight = calculateDateHeight(mYear + 1, 1, 1, 0);
                } else {
                    monthStartHeight = calculateDateHeight(mYear, mIndex, 1, 0);
                    const nextMonth = mIndex + 1;
                    monthEndHeight = calculateDateHeight(mYear, nextMonth, 1, 0);
                }
                const monthHeight = monthEndHeight - monthStartHeight;
                
                const angle = getAngle(monthStartHeight, timeState.currentDateHeight);
                const orbitsInSpan = (monthHeight / 100) / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= 64; i++) {
                    const t = i / 64;
                    const a = angle - (t * orbitsInSpan * Math.PI * 2);
                    const h = monthStartHeight + (t * monthHeight);
                    curvePoints.push(Math.cos(a) * radii.outer, h, Math.sin(a) * radii.outer);
                }
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                scene.add(new THREE.Line(curveGeometry, curveMaterial));
            });
        }
        
        createTimeFrame({
            unitType: 'month',
            zoomLevel,
            outerRadius: radii.outer,
            innerRadius: radii.inner,
            earthDistance,
            timeState,
            unitNames: system.names,
            getUnitsToShow: system.getUnits,
            getUnitDate: system.getDate,
            isCurrentUnit: system.isCurrent,
            isSelectedUnit: system.isSelected,
            labelRadius: radii.label
        });
    }

    // ============================================
    // WEEK SYSTEM (Keep complex logic but streamline)
    // ============================================
    
    function createWeekSystem(earthDistance, timeState, zoomLevel) {
        const innerRadius = earthDistance * (2/3);
        const outerRadius = earthDistance * (5/6);
        const labelRadius = earthDistance * 0.75;
        
        function getWeeksToShow(zoomLevel, timeState) {
            const { selectedYear, selectedMonth } = timeState;
            let weeksToShow = [];
            
            if (zoomLevel >= 4) {
                const selectedQuarterFromMonth = Math.floor(selectedMonth / 3);
                let monthsForWeeks = [];
                
                const selectedQuarterStartMonth = selectedQuarterFromMonth * 3;
                for (let m = selectedQuarterStartMonth; m < selectedQuarterStartMonth + 3; m++) {
                    monthsForWeeks.push({ month: m % 12, year: selectedYear + Math.floor(m / 12) });
                }
                
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                if (actualQuarter !== selectedQuarterFromMonth || actualYear !== selectedYear) {
                    const currentQuarterStartMonth = actualQuarter * 3;
                    for (let m = currentQuarterStartMonth; m < currentQuarterStartMonth + 3; m++) {
                        const monthYear = actualYear + Math.floor(m / 12);
                        const monthIndex = m % 12;
                        if (!monthsForWeeks.some(mo => mo.month === monthIndex && mo.year === monthYear)) {
                            monthsForWeeks.push({ month: monthIndex, year: monthYear });
                        }
                    }
                }
                
                if (!monthsForWeeks.some(mo => mo.month === selectedMonth && mo.year === selectedYear)) {
                    monthsForWeeks.push({ month: selectedMonth, year: selectedYear });
                }
                
                monthsForWeeks.forEach(({ month, year }) => {
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstOfMonth = new Date(year, month, 1);
                    const lastOfMonth = new Date(year, month, daysInMonth);
                    const firstSundayOffset = -firstOfMonth.getDay();
                    const firstSunday = new Date(year, month, 1 + firstSundayOffset);
                    firstSunday.setHours(0, 0, 0, 0);
                    
                    let currentSunday = new Date(firstSunday);
                    while (currentSunday <= lastOfMonth || (currentSunday.getMonth() === month)) {
                        const weekEnd = new Date(currentSunday);
                        weekEnd.setDate(currentSunday.getDate() + 6);
                        
                        if ((currentSunday.getMonth() === month && currentSunday.getDate() <= daysInMonth) ||
                            (weekEnd.getMonth() === month && weekEnd.getDate() >= 1) ||
                            (currentSunday < firstOfMonth && weekEnd >= firstOfMonth)) {
                            weeksToShow.push(new Date(currentSunday));
                        }
                        
                        currentSunday.setDate(currentSunday.getDate() + 7);
                        if (currentSunday > lastOfMonth && currentSunday.getMonth() !== month) break;
                    }
                });
                
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                
                let selectedWeekSunday;
                if (zoomLevel === 5) {
                    const selectedMonthStart = new Date(selectedYear, selectedMonth, 1);
                    const firstSundayOffset = -selectedMonthStart.getDay();
                    const firstSunday = new Date(selectedYear, selectedMonth, 1 + firstSundayOffset);
                    firstSunday.setHours(0, 0, 0, 0);
                    selectedWeekSunday = new Date(firstSunday);
                    selectedWeekSunday.setDate(firstSunday.getDate() + (currentWeekInMonth * 7));
                    selectedWeekSunday.setHours(0, 0, 0, 0);
                } else if (zoomLevel === 7) {
                    const selectedDayOffset = timeState.selectedDayOffset || 0;
                    selectedWeekSunday = new Date(actualCurrentWeekSunday);
                    selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                    selectedWeekSunday.setHours(0, 0, 0, 0);
                } else {
                    const selectedWeekOffset = timeState.selectedWeekOffset || 0;
                    selectedWeekSunday = new Date(actualCurrentWeekSunday);
                    selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedWeekOffset * 7));
                    selectedWeekSunday.setHours(0, 0, 0, 0);
                }
                
                if (!weeksToShow.some(w => {
                    const wDate = new Date(w);
                    wDate.setHours(0, 0, 0, 0);
                    return wDate.getTime() === selectedWeekSunday.getTime();
                })) {
                    weeksToShow.push(new Date(selectedWeekSunday));
                }
                
                weeksToShow.sort((a, b) => a.getTime() - b.getTime());
            }
            
            return weeksToShow;
        }
        
        function getWeekDate(unitInfo, unitIndex, unitYear) {
            if (unitIndex instanceof Date) return new Date(unitIndex);
            return new Date();
        }
        
        function getWeekLabelText(unitInfo, unitIndex, unitYear) {
            const weekSunday = unitIndex instanceof Date ? unitIndex : unitInfo;
            const weekStartDay = weekSunday.getDate();
            const weekEnd = new Date(weekSunday);
            weekEnd.setDate(weekSunday.getDate() + 6);
            return `${weekStartDay}-${weekEnd.getDate()}`;
        }
        
        function getWeekCenterDate(unitStartDate, unitInfo) {
            const centerDate = new Date(unitStartDate);
            centerDate.setDate(unitStartDate.getDate() + 3.5);
            return centerDate;
        }
        
        function isCurrentWeek(unit, state) {
            // unit is { index: Date, year: number } for weeks
            if (!unit || !unit.index || !(unit.index instanceof Date)) return false;
            const now = state.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            const normalizedWeekSunday = new Date(unit.index);
            normalizedWeekSunday.setHours(0, 0, 0, 0);
            return normalizedWeekSunday.getTime() === actualCurrentWeekSunday.getTime();
        }
        
        function isSelectedWeekValue(unit, state) {
            // unit is { index: Date, year: number } for weeks
            if (!unit || !unit.index || !(unit.index instanceof Date)) return false;
            const now = state.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            
            let selectedWeekSunday;
            if (zoomLevel === 5) {
                const selectedMonthStart = new Date(state.selectedYear, state.selectedMonth, 1);
                const firstSundayOffset = -selectedMonthStart.getDay();
                const firstSunday = new Date(state.selectedYear, state.selectedMonth, 1 + firstSundayOffset);
                firstSunday.setHours(0, 0, 0, 0);
                selectedWeekSunday = new Date(firstSunday);
                selectedWeekSunday.setDate(firstSunday.getDate() + (currentWeekInMonth * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
            } else if (zoomLevel === 7) {
                const selectedDayOffset = state.selectedDayOffset || 0;
                selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
            } else {
                const selectedWeekOffset = state.selectedWeekOffset || 0;
                selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedWeekOffset * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
            }
            
            const normalizedWeekSunday = new Date(unit.index);
            normalizedWeekSunday.setHours(0, 0, 0, 0);
            return normalizedWeekSunday.getTime() === selectedWeekSunday.getTime();
        }
        
        // Parent curves for Zoom 4+
        if (zoomLevel >= 4) {
            const monthsToShow = SYSTEMS.month.getUnits(zoomLevel, timeState);
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            const yearHeight = 100;
            const monthHeight = yearHeight / 12;
            
            monthsToShow.forEach(mInfo => {
                const mIndex = typeof mInfo === 'object' ? mInfo.index : mInfo;
                const mYear = typeof mInfo === 'object' ? mInfo.year : timeState.selectedYear;
                const unitStartHeight = (mYear - CENTURY_START) * yearHeight + (mIndex * monthHeight);
                const angle = getAngle(unitStartHeight, timeState.currentDateHeight);
                const orbitsInSpan = (monthHeight / 100) / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= 64; i++) {
                    const t = i / 64;
                    const a = angle - (t * orbitsInSpan * Math.PI * 2);
                    const h = unitStartHeight + (t * monthHeight);
                    curvePoints.push(Math.cos(a) * outerRadius, h, Math.sin(a) * outerRadius);
                }
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                scene.add(new THREE.Line(curveGeometry, curveMaterial));
            });
        }
        
        createTimeFrame({
            unitType: 'week',
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitNames: getWeekLabelText,
            getUnitsToShow: getWeeksToShow,
            getUnitDate: getWeekDate,
            getUnitCenterDate: getWeekCenterDate,
            isCurrentUnit: isCurrentWeek,
            isSelectedUnit: isSelectedWeekValue,
            labelRadius: labelRadius
        });
    }

    // ============================================
    // DAY SYSTEM (Keep complex logic but streamline)
    // ============================================
    
    function createDaySystem(earthDistance, timeState, zoomLevel) {
        const innerRadius = earthDistance * (5/6);
        const outerRadius = earthDistance * (11/12);
        const labelRadius = earthDistance * (21/24);
        
        function getDaysToShow(zoomLevel, timeState) {
            const { selectedYear, selectedMonth } = timeState;
            let daysToShow = [];
            
            if (zoomLevel >= 6) {
                const selectedQuarterFromMonth = Math.floor(selectedMonth / 3);
                let monthsForDays = [];
                
                const selectedQuarterStartMonth = selectedQuarterFromMonth * 3;
                for (let m = selectedQuarterStartMonth; m < selectedQuarterStartMonth + 3; m++) {
                    monthsForDays.push({ month: m % 12, year: selectedYear + Math.floor(m / 12) });
                }
                
                const now = timeState.currentDate;
                const actualYear = now.getFullYear();
                const actualMonthInYear = now.getMonth();
                const actualQuarter = Math.floor(actualMonthInYear / 3);
                if (actualQuarter !== selectedQuarterFromMonth || actualYear !== selectedYear) {
                    const currentQuarterStartMonth = actualQuarter * 3;
                    for (let m = currentQuarterStartMonth; m < currentQuarterStartMonth + 3; m++) {
                        const monthYear = actualYear + Math.floor(m / 12);
                        const monthIndex = m % 12;
                        if (!monthsForDays.some(mo => mo.month === monthIndex && mo.year === monthYear)) {
                            monthsForDays.push({ month: monthIndex, year: monthYear });
                        }
                    }
                }
                
                if (!monthsForDays.some(mo => mo.month === selectedMonth && mo.year === selectedYear)) {
                    monthsForDays.push({ month: selectedMonth, year: selectedYear });
                }
                
                monthsForDays.forEach(({ month, year }) => {
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstOfMonth = new Date(year, month, 1);
                    const firstSundayOffset = -firstOfMonth.getDay();
                    const firstSunday = new Date(year, month, 1 + firstSundayOffset);
                    firstSunday.setHours(0, 0, 0, 0);
                    const lastOfMonth = new Date(year, month, daysInMonth);
                    
                    let currentSunday = new Date(firstSunday);
                    while (currentSunday <= lastOfMonth || (currentSunday.getMonth() === month)) {
                        for (let d = 0; d < 7; d++) {
                            const dayDate = new Date(currentSunday);
                            dayDate.setDate(currentSunday.getDate() + d);
                            dayDate.setHours(0, 0, 0, 0);
                            
                            if (dayDate >= firstSunday && dayDate <= lastOfMonth) {
                                if (!daysToShow.some(d => d.getTime() === dayDate.getTime())) {
                                    daysToShow.push(dayDate);
                                }
                            }
                        }
                        currentSunday.setDate(currentSunday.getDate() + 7);
                    }
                });
                
                daysToShow.sort((a, b) => a - b);
            }
            
            return daysToShow;
        }
        
        function getDayDate(unitInfo, unitIndex, unitYear) {
            if (unitInfo instanceof Date) return unitInfo;
            return new Date(unitYear || timeState.selectedYear, timeState.selectedMonth || 0, (unitIndex || 0) + 1, 0, 0, 0);
        }
        
        function getDayCenterDate(dayStartDate, unitInfo) {
            const center = new Date(dayStartDate);
            center.setHours(12, 0, 0, 0);
            return center;
        }
        
        function getDayLabelText(unitInfo, unitIndex, unitYear) {
            const dayDate = unitInfo instanceof Date ? unitInfo : getDayDate(unitInfo, unitIndex, unitYear);
            return dayDate.getDate().toString();
        }
        
        function isCurrentDay(unit, state) {
            // unit is { index: Date, year: number } for days
            if (!unit || !unit.index || !(unit.index instanceof Date)) return false;
            const now = state.currentDate;
            const dayDate = unit.index;
            return dayDate.getFullYear() === now.getFullYear() &&
                   dayDate.getMonth() === now.getMonth() &&
                   dayDate.getDate() === now.getDate();
        }
        
        function isSelectedDayValue(unit, state) {
            // unit is { index: Date, year: number } for days
            if (!unit || !unit.index || !(unit.index instanceof Date)) return false;
            const now = state.currentDate;
            const actualDayInWeek = now.getDay();
            const actualCurrentWeekSunday = new Date(now);
            actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
            actualCurrentWeekSunday.setHours(0, 0, 0, 0);
            const selectedDayOffset = state.selectedDayOffset || 0;
            const selectedWeekSunday = new Date(actualCurrentWeekSunday);
            selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
            selectedWeekSunday.setHours(0, 0, 0, 0);
            const dayOffset = (currentDayInWeek !== undefined && currentDayInWeek !== null) ? currentDayInWeek : actualDayInWeek;
            const selectedDay = new Date(selectedWeekSunday);
            selectedDay.setDate(selectedWeekSunday.getDate() + dayOffset);
            selectedDay.setHours(0, 0, 0, 0);
            const normalizedDay = new Date(unit.index);
            normalizedDay.setHours(0, 0, 0, 0);
            return normalizedDay.getTime() === selectedDay.getTime();
        }
        
        // Day curves for Zoom 7+
        if (zoomLevel >= 7) {
            const daysToShow = getDaysToShow(zoomLevel, timeState);
            const weekSundays = new Set();
            daysToShow.forEach(dayDate => {
                const sunday = new Date(dayDate);
                const dayOfWeek = sunday.getDay();
                sunday.setDate(sunday.getDate() - dayOfWeek);
                sunday.setHours(0, 0, 0, 0);
                weekSundays.add(sunday.getTime());
            });
            
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            Array.from(weekSundays).forEach(sundayTime => {
                const weekSunday = new Date(sundayTime);
                const weekStart = new Date(weekSunday);
                const weekEnd = new Date(weekSunday);
                weekEnd.setDate(weekSunday.getDate() + 7);
                const weekStartHeight = calculateDateHeight(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0);
                const weekEndHeight = calculateDateHeight(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 0);
                const weekHeightActual = weekEndHeight - weekStartHeight;
                const angle = getAngle(weekStartHeight, timeState.currentDateHeight);
                const orbitsInSpan = (weekHeightActual / 100) / earth.orbitalPeriod;
                
                const curvePoints = [];
                for (let i = 0; i <= 64; i++) {
                    const t = i / 64;
                    const a = angle - (t * orbitsInSpan * Math.PI * 2);
                    const h = weekStartHeight + (t * weekHeightActual);
                    curvePoints.push(Math.cos(a) * outerRadius, h, Math.sin(a) * outerRadius);
                }
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(),
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                scene.add(new THREE.Line(curveGeometry, curveMaterial));
            });
        }
        
        createTimeFrame({
            unitType: 'day',
            zoomLevel,
            outerRadius,
            innerRadius,
            earthDistance,
            timeState,
            unitNames: getDayLabelText,
            getUnitsToShow: getDaysToShow,
            getUnitDate: getDayDate,
            getUnitCenterDate: getDayCenterDate,
            isCurrentUnit: isCurrentDay,
            isSelectedUnit: isSelectedDayValue,
            labelRadius: labelRadius
        });
        
        // Day-of-week labels for Zoom 7+
        if (zoomLevel >= 7) {
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            const dayOfWeekNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayOfWeekNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayOfWeekLabelRadius = earthDistance * (15/16);
            
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
            
            const daysToShow = getDaysToShow(zoomLevel, timeState);
            daysToShow.forEach(dayDate => {
                const unit = { index: dayDate, year: dayDate.getFullYear() };
                const isCurrent = isCurrentDay(unit, timeState);
                const isSelected = isSelectedDayValue(unit, timeState);
                const dayOfWeekColor = isCurrent ? 'red' : (hasDayOffset && isSelected ? 'blue' : false);
                const dayOfWeekIndex = dayDate.getDay();
                const dayOfWeekText = (isCurrent || (hasDayOffset && isSelected)) 
                    ? dayOfWeekNamesFull[dayOfWeekIndex] 
                    : dayOfWeekNamesShort[dayOfWeekIndex];
                
                const dayCenterDate = getDayCenterDate(dayDate, dayDate);
                const dayHeight = calculateDateHeight(dayCenterDate.getFullYear(), dayCenterDate.getMonth(), 
                                                     dayCenterDate.getDate(), dayCenterDate.getHours());
                const dayAngle = getAngle(dayHeight, timeState.currentDateHeight);
                createTextLabel(dayOfWeekText, dayHeight, dayOfWeekLabelRadius, 7, dayAngle, dayOfWeekColor, false, 0.85);
            });
        }
    }

    // ============================================
    // MOON PHASE IMAGES (Simplified)
    // ============================================
    
    function createMoonPhaseImages(earthDistance, timeState) {
        console.log('[Moon Phases] createMoonPhaseImages called');
        const { selectedDateHeight, currentDateHeight, selectedDate } = timeState;
        console.log('[Moon Phases] selectedDateHeight:', selectedDateHeight, 'currentDateHeight:', currentDateHeight);
        
        const moonPhaseRadius = earthDistance * (8/9);
        const config = ZOOM_LEVELS[6];
        const lunarHeight = config.timeYears * 100;
        const startHeight = selectedDateHeight - (lunarHeight / 2);
        const endHeight = selectedDateHeight + (lunarHeight / 2);
        console.log('[Moon Phases] Height range:', startHeight, 'to', endHeight, 'lunarHeight:', lunarHeight);
        
        // Use selectedDate as the center point, or calculate from selectedDateHeight
        let centerDate;
        if (selectedDate) {
            centerDate = new Date(selectedDate);
            centerDate.setHours(12, 0, 0, 0);
        } else {
            // Fallback: calculate from height
            const yearHeight = 100;
            const baseYear = 2000;
            const year = Math.floor((selectedDateHeight / yearHeight) + baseYear);
            const yearProgress = (selectedDateHeight - (year - baseYear) * yearHeight) / yearHeight;
            const month = Math.floor(yearProgress * 12);
            const day = Math.floor((yearProgress * 12 - month) * 30) + 1;
            centerDate = new Date(year, month, day, 12, 0, 0, 0);
        }
        
        // Start 14 days before center
        const startDate = new Date(centerDate);
        startDate.setDate(centerDate.getDate() - 14);
        startDate.setHours(12, 0, 0, 0);
        
        let spriteCount = 0;
        const daysToShow = 28;
        for (let dayOffset = 0; dayOffset < daysToShow; dayOffset++) {
            const dayDate = new Date(startDate);
            dayDate.setDate(startDate.getDate() + dayOffset);
            dayDate.setHours(12, 0, 0, 0);
            const dayHeight = calculateDateHeight(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), dayDate.getHours());
            
            if (dayHeight < startHeight || dayHeight > endHeight) {
                continue;
            }
            
            const angle = getAngle(dayHeight, currentDateHeight);
            const lunarPeriod = 29.53059;
            const knownNewMoon = new Date(2000, 0, 6, 18, 14, 0);
            const daysSinceNewMoon = (dayDate - knownNewMoon) / (1000 * 60 * 60 * 24);
            const phase = (daysSinceNewMoon % lunarPeriod) / lunarPeriod;
            
            const sprite = createMoonPhaseSprite(phase, moonPhaseRadius, angle, dayHeight);
            scene.add(sprite);
            timeMarkers.push(sprite);
            spriteCount++;
        }
        
        console.log('[Moon Phases] Created', spriteCount, 'moon phase sprites');
    }
    
    function createMoonPhaseSprite(phase, radius, angle, height) {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const centerX = size / 2;
        const centerY = size / 2;
        const moonRadius = size * 0.4;
        
        context.clearRect(0, 0, size, size);
        const moonColor = isLightMode ? 'rgba(200, 200, 200, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        const shadowColor = isLightMode ? 'rgba(50, 50, 50, 0.9)' : 'rgba(20, 20, 20, 0.9)';
        const outlineColor = isLightMode ? 'rgba(100, 100, 100, 0.9)' : 'rgba(200, 200, 200, 0.9)';
        
        context.strokeStyle = outlineColor;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
        context.stroke();
        
        if (phase < 0.01 || phase > 0.99) {
            context.fillStyle = shadowColor;
            context.beginPath();
            context.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
            context.fill();
        } else if (phase > 0.49 && phase < 0.51) {
            context.fillStyle = moonColor;
            context.beginPath();
            context.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
            context.fill();
        } else if (phase < 0.5) {
            const litPortion = phase * 2;
            context.fillStyle = moonColor;
            context.beginPath();
            context.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = shadowColor;
            context.beginPath();
            const ellipseX = centerX - moonRadius * (1 - litPortion);
            const ellipseWidth = moonRadius * 2 * (1 - litPortion);
            context.ellipse(ellipseX, centerY, ellipseWidth, moonRadius, 0, 0, Math.PI * 2);
            context.fill();
        } else {
            const litPortion = (1 - phase) * 2;
            context.fillStyle = moonColor;
            context.beginPath();
            context.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = shadowColor;
            context.beginPath();
            const ellipseX = centerX + moonRadius * (1 - litPortion);
            const ellipseWidth = moonRadius * 2 * (1 - litPortion);
            context.ellipse(ellipseX, centerY, ellipseWidth, moonRadius, 0, 0, Math.PI * 2);
            context.fill();
        }
        
        context.strokeStyle = outlineColor;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
        context.stroke();
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        sprite.position.set(x, height, z);
        sprite.scale.set(12, 12, 1);
        return sprite;
    }

    // ============================================
    // MAIN ENTRY POINT
    // ============================================
    
    function createTimeMarkers(zoomLevel) {
        timeMarkers.forEach(m => scene.remove(m));
        timeMarkers.length = 0;
        
        if (!ZOOM_LEVELS[zoomLevel]) return;
        
        const earthPlanet = planetMeshes.find(p => p.userData.name === 'Earth');
        const earthDistance = earthPlanet ? earthPlanet.userData.distance : 50;
        const timeState = getTimeState(zoomLevel);
        
        if (zoomLevel >= 3) {
            createQuarterSystem(earthDistance, timeState, zoomLevel);
            createMonthSystem(earthDistance, timeState, zoomLevel);
        }
        if (zoomLevel >= 4) {
            createWeekSystem(earthDistance, timeState, zoomLevel);
        }
        if (zoomLevel >= 6) {
            createDaySystem(earthDistance, timeState, zoomLevel);
        }
        if (zoomLevel === 6) {
            createMoonPhaseImages(earthDistance, timeState);
        }
    }

    // ============================================
    // UPDATE OFFSETS
    // ============================================
    
    function updateOffsets(newOffsets) {
        selectedYearOffset = newOffsets.selectedYearOffset;
        selectedQuarterOffset = newOffsets.selectedQuarterOffset;
        selectedWeekOffset = newOffsets.selectedWeekOffset;
        selectedDayOffset = newOffsets.selectedDayOffset;
        currentMonth = newOffsets.currentMonth;
        currentWeekInMonth = newOffsets.currentWeekInMonth;
        currentQuarter = newOffsets.currentQuarter;
        currentDayInWeek = newOffsets.currentDayInWeek;
    }

    return {
        init,
        createTimeMarkers,
        updateOffsets
    };
})();
