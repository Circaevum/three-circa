/**
 * SIMPLIFIED TIME MARKERS - Example Structure
 * 
 * This shows how the code would be simplified from 2,153 lines to ~800 lines
 * by using declarative configs and unified helpers.
 */

const TimeMarkers = (function() {
    // ============================================
    // STATE (unchanged)
    // ============================================
    let scene, timeMarkers, getMarkerColor, createTextLabel;
    let PLANET_DATA, ZOOM_LEVELS, calculateDateHeight;
    let selectedYearOffset, selectedQuarterOffset, selectedWeekOffset, selectedDayOffset;
    let currentQuarter, currentWeekInMonth, currentDayInWeek;
    let isLightMode;

    // ============================================
    // SYSTEM DEFINITIONS (NEW: Declarative configs)
    // ============================================
    const SYSTEMS = {
        quarter: {
            name: 'quarter',
            unitsPerYear: 4,
            names: ['Q1', 'Q2', 'Q3', 'Q4'],
            getDate: (index, year) => new Date(year, index * 3, 1),
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
            }
        },
        month: {
            name: 'month',
            unitsPerYear: 12,
            names: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
            getDate: (index, year) => new Date(year, index, 1),
            getRadii: (zoom, dist) => zoom >= 4
                ? { outer: dist*2/3, inner: dist/3, label: dist*0.5 }
                : { outer: dist*0.75, inner: dist*0.5, label: dist*0.75 },
            getUnits: (zoom, state) => {
                // Simplified: get months for selected + current quarter
                const units = [];
                const selectedQ = Math.floor(state.selectedMonth / 3);
                for (let m = selectedQ * 3; m < (selectedQ + 1) * 3; m++) {
                    units.push({index: m, year: state.selectedYear});
                }
                const now = state.currentDate;
                const actualQ = Math.floor(now.getMonth() / 3);
                if (actualQ !== selectedQ || now.getFullYear() !== state.selectedYear) {
                    for (let m = actualQ * 3; m < (actualQ + 1) * 3; m++) {
                        units.push({index: m, year: now.getFullYear()});
                    }
                }
                return units;
            }
        }
        // ... week, day similar
    };

    // ============================================
    // UNIFIED HELPERS (NEW: One function instead of many)
    // ============================================
    
    /**
     * Get unit state (current, selected, offset) - unified for all systems
     */
    function getUnitState(unit, system, timeState) {
        const now = timeState.currentDate;
        const unitDate = system.getDate(unit.index, unit.year);
        
        // Current check
        let isCurrent = false;
        if (system.name === 'quarter') {
            isCurrent = Math.floor(now.getMonth() / 3) === unit.index && now.getFullYear() === unit.year;
        } else if (system.name === 'month') {
            isCurrent = now.getMonth() === unit.index && now.getFullYear() === unit.year;
        } else if (system.name === 'day') {
            isCurrent = unitDate.getFullYear() === now.getFullYear() &&
                       unitDate.getMonth() === now.getMonth() &&
                       unitDate.getDate() === now.getDate();
        }
        
        // Selected check
        const isSelected = unit.index === timeState.selected[system.name] &&
                          unit.year === timeState.selectedYear;
        
        // Offset check (simplified)
        let hasOffset = false;
        if (system.name === 'quarter') {
            hasOffset = selectedQuarterOffset !== 0;
        } else if (system.name === 'month') {
            hasOffset = selectedWeekOffset !== 0 || timeState.selectedMonth !== now.getMonth();
        } else if (system.name === 'day') {
            hasOffset = selectedDayOffset !== 0 || currentDayInWeek !== now.getDay();
        }
        
        return { isCurrent, isSelected, hasOffset };
    }
    
    /**
     * Calculate color - unified for all units
     */
    function getColor(isCurrent, isSelected, hasOffset) {
        if (isCurrent) return 0xFF0000; // Red
        if (hasOffset && isSelected) return isLightMode ? 0x0066CC : 0x00FFFF; // Blue
        return getMarkerColor(); // Default
    }
    
    /**
     * Calculate angle from height
     */
    function getAngle(height, currentHeight) {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const years = (height - currentHeight) / 100;
        const orbits = years / earth.orbitalPeriod;
        return earth.startAngle - (orbits * Math.PI * 2);
    }

    // ============================================
    // SIMPLIFIED FRAME CREATION (~150 lines instead of 536)
    // ============================================
    
    function createTimeFrame(system, zoomLevel, earthDistance, timeState) {
        const radii = system.getRadii(zoomLevel, earthDistance);
        const units = system.getUnits(zoomLevel, timeState);
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        
        // Create lines for each unit
        units.forEach((unit, i) => {
            const unitDate = system.getDate(unit.index, unit.year);
            const height = calculateDateHeight(
                unitDate.getFullYear(),
                unitDate.getMonth(),
                unitDate.getDate(),
                0
            );
            const angle = getAngle(height, timeState.currentDateHeight);
            const state = getUnitState(unit, system, timeState);
            
            // Check previous unit for both-sides coloring (simplified)
            const prevUnit = i > 0 ? units[i-1] : null;
            const prevState = prevUnit ? getUnitState(prevUnit, system, timeState) : null;
            
            // Determine line radii
            const startRadius = radii.inner || 0;
            const endRadius = (system.name === 'week' && zoomLevel >= 7) ? earthDistance : radii.outer;
            
            // Create line
            const points = [
                Math.cos(angle) * startRadius, height, Math.sin(angle) * startRadius,
                Math.cos(angle) * endRadius, height, Math.sin(angle) * endRadius
            ];
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
            
            const lineColor = getColor(state.isCurrent || prevState?.isCurrent, 
                                      state.isSelected || prevState?.isSelected, 
                                      state.hasOffset || prevState?.hasOffset);
            
            const material = new THREE.LineBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: (state.isCurrent || state.isSelected) ? 0.9 : 0.7,
                linewidth: (state.isCurrent || state.isSelected) ? 3 : 2
            });
            
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            timeMarkers.push(line);
            
            // Create label if needed
            if (shouldShowLabel(system.name, zoomLevel)) {
                const labelText = system.names[unit.index];
                const labelColor = state.isCurrent ? 'red' : (state.hasOffset && state.isSelected ? 'blue' : false);
                createTextLabel(labelText, height, radii.label, zoomLevel, angle, labelColor);
            }
        });
    }
    
    function shouldShowLabel(unitType, zoomLevel) {
        return (unitType === 'quarter' && zoomLevel >= 3) ||
               (unitType === 'month' && zoomLevel >= 4) ||
               (unitType === 'week' && zoomLevel >= 5) ||
               (unitType === 'day' && zoomLevel >= 7);
    }

    // ============================================
    // SIMPLIFIED TIME STATE (~50 lines instead of 110)
    // ============================================
    
    function getTimeState(zoomLevel) {
        const now = new Date();
        const currentHeight = calculateCurrentDateHeight();
        
        // Simplified selected time calculation
        let selected = {};
        if (zoomLevel === 3) {
            selected = {
                quarter: currentQuarter,
                year: now.getFullYear() + selectedYearOffset
            };
        } else if (zoomLevel === 4) {
            selected = {
                quarter: (Math.floor(now.getMonth() / 3) + selectedQuarterOffset) % 4,
                month: (now.getMonth() + selectedQuarterOffset * 3) % 12,
                year: now.getFullYear()
            };
        } else if (zoomLevel === 5) {
            selected = {
                month: (now.getMonth() + selectedWeekOffset) % 12,
                year: now.getFullYear() + Math.floor((now.getMonth() + selectedWeekOffset) / 12)
            };
        }
        // ... etc for other zoom levels
        
        return {
            currentDate: now,
            currentDateHeight: currentHeight,
            selected,
            selectedYear: selected.year || now.getFullYear(),
            selectedQuarter: selected.quarter !== undefined ? selected.quarter : Math.floor(now.getMonth() / 3),
            selectedMonth: selected.month !== undefined ? selected.month : now.getMonth(),
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset
        };
    }

    // ============================================
    // SYSTEM CREATION (SIMPLIFIED)
    // ============================================
    
    function createQuarterSystem(earthDistance, timeState, zoomLevel) {
        createTimeFrame(SYSTEMS.quarter, zoomLevel, earthDistance, timeState);
    }
    
    function createMonthSystem(earthDistance, timeState, zoomLevel) {
        createTimeFrame(SYSTEMS.month, zoomLevel, earthDistance, timeState);
    }
    
    // ... week, day similar

    // ============================================
    // MAIN ENTRY POINT (SIMPLIFIED)
    // ============================================
    
    function createTimeMarkers(zoomLevel) {
        timeMarkers.forEach(m => scene.remove(m));
        timeMarkers.length = 0;
        
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
            createMoonPhases(earthDistance, timeState);
        }
    }

    return {
        init: function(deps) { /* ... */ },
        createTimeMarkers,
        updateOffsets: function(offsets) { /* ... */ }
    };
})();

/**
 * KEY SIMPLIFICATIONS:
 * 
 * 1. Systems are declarative configs (~20 lines each) instead of 120+ line functions
 * 2. Unified getUnitState() replaces 4 separate isCurrent/isSelected functions per system
 * 3. Simplified createTimeFrame (~150 lines) instead of 536 lines
 * 4. Simplified time state (~50 lines) instead of 110 lines
 * 5. Removed complex helpers: extractUnitInfo, getVisibleParentUnits, expandQuartersToMonths, etc.
 * 6. Previous unit check simplified to just array index - 1
 * 
 * RESULT: ~800 lines instead of 2,153 lines (63% reduction)
 */
