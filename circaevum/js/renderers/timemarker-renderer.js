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
    let PLANET_DATA, ZOOM_LEVELS, TIME_MARKERS, CENTURY_START;
    /** When true, quarter/month/week/day systems show all units for the full year (_fullYearYear). */
    let _fullYearScope = false;
    let _fullYearYear = null;
    let currentYear, currentMonth, currentMonthInYear, currentQuarter, currentWeekInMonth, currentDayInWeek;
    let currentDayOfMonth;
    let selectedYearOffset, selectedQuarterOffset, selectedWeekOffset, selectedDayOffset, selectedHourOffset;
    let currentHourInDay;
    let isLightMode, calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let planetMeshes;
    let SceneGeometry; // Shared geometry utilities
    let getListContextDiscArcTimeBoundsMs;

    const MS_PER_DAY = 86400000;

    function init(dependencies) {
        scene = dependencies.scene;
        timeMarkers = dependencies.timeMarkers;
        getMarkerColor = dependencies.getMarkerColor;
        createTextLabel = dependencies.createTextLabel;
        PLANET_DATA = dependencies.PLANET_DATA;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        TIME_MARKERS = dependencies.TIME_MARKERS;
        CENTURY_START = dependencies.CENTURY_START;
        currentYear = dependencies.currentYear;
        currentMonth = dependencies.currentMonth;
        currentMonthInYear = dependencies.currentMonthInYear;
        currentQuarter = dependencies.currentQuarter;
        currentWeekInMonth = dependencies.currentWeekInMonth;
        currentDayInWeek = dependencies.currentDayInWeek;
        currentDayOfMonth = dependencies.currentDayOfMonth;
        selectedYearOffset = dependencies.selectedYearOffset;
        selectedQuarterOffset = dependencies.selectedQuarterOffset;
        selectedWeekOffset = dependencies.selectedWeekOffset;
        selectedDayOffset = dependencies.selectedDayOffset;
        selectedHourOffset = dependencies.selectedHourOffset || 0;
        currentHourInDay = dependencies.currentHourInDay;
        isLightMode = dependencies.isLightMode;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        planetMeshes = dependencies.planetMeshes;
        SceneGeometry = dependencies.SceneGeometry;
        getListContextDiscArcTimeBoundsMs = dependencies.getListContextDiscArcTimeBoundsMs;

        // Initialize SceneGeometry if provided
        if (SceneGeometry) {
            SceneGeometry.init({
                PLANET_DATA,
                calculateDateHeight,
                getHeightForYear,
                calculateCurrentDateHeight,
                CENTURY_START,
                ZOOM_LEVELS,
                currentYear
            });
        }
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
        // Decade / Year / Quarter: same "now" height as planets & worldlines (not Jan 1 of navigated year)
        if (zoomLevel === 2 || zoomLevel === 3 || zoomLevel === 4) {
            let yearProgress;
            if (typeof calculateYearProgressForDate === 'function') {
                yearProgress = calculateYearProgressForDate(actualYear, actualMonth, actualDay, 0);
            } else {
                const daysInMonth = getDaysInMonth ? getDaysInMonth(actualYear, actualMonth) : 30;
                yearProgress = (actualMonth + (actualDay - 1) / daysInMonth) / 12;
            }
            const cs = typeof CENTURY_START === 'number' ? CENTURY_START : 2000;
            currentDateHeight = ((actualYear - cs) * 100) + (yearProgress * 100);
        }

        let selectedYear, selectedMonth, selectedQuarter, selectedDateHeight;
        let selectedDayForReturn = 1;
        if (zoomLevel === 1) {
            // Century view - preserve selected year from currentYear (which is updated by navigation)
            // Snap to nearest decade for proper highlighting
            selectedYear = (currentYear !== undefined && currentYear !== null) ? currentYear : actualYear;
            selectedYear = Math.round(selectedYear / 10) * 10; // Snap to nearest decade
            selectedMonth = actualMonth;
            selectedQuarter = Math.floor(actualMonth / 3);
            selectedDateHeight = getHeightForYear(selectedYear, 1);
        } else if (zoomLevel === 2) {
            // Decade view - same calendar date as getSelectedDateTime (year from navigation, month/day from clock)
            selectedYear = (currentYear !== undefined && currentYear !== null) ? currentYear : actualYear;
            selectedMonth = actualMonth;
            selectedQuarter = Math.floor(actualMonth / 3);
            selectedDayForReturn = actualDay;
            selectedDateHeight = calculateDateHeight(selectedYear, selectedMonth, actualDay, now.getHours());
        } else if (zoomLevel === 3) {
            selectedYear = actualYear + selectedYearOffset;
            selectedMonth = currentMonthInYear;
            selectedQuarter = Math.floor(selectedMonth / 3);
            const dom =
                currentDayOfMonth != null && !isNaN(currentDayOfMonth) ? currentDayOfMonth : actualDay;
            const lastDom = new Date(selectedYear, selectedMonth + 1, 0).getDate();
            selectedDayForReturn = Math.max(1, Math.min(dom, lastDom));
            selectedDateHeight = calculateDateHeight(
                selectedYear,
                selectedMonth,
                selectedDayForReturn,
                currentHourInDay !== undefined ? currentHourInDay : now.getHours()
            );
        } else if (zoomLevel === 4) {
            const systemQuarter = Math.floor(actualMonth / 3);
            const selectedQuarterValue = systemQuarter + selectedQuarterOffset;
            selectedQuarter = ((selectedQuarterValue % 4) + 4) % 4;
            selectedMonth = (selectedQuarter * 3) + currentMonth;
            selectedYear = actualYear + Math.floor(selectedQuarterValue / 4);
        } else if (zoomLevel === 5 || zoomLevel === 6) {
            selectedYear = actualYear + Math.floor((actualMonth + selectedWeekOffset) / 12);
            selectedMonth = ((actualMonth + selectedWeekOffset) % 12 + 12) % 12;
            selectedQuarter = Math.floor(selectedMonth / 3);
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
        } else if (zoomLevel === 8 || zoomLevel === 9) {
            // Day/Clock view - calculate selected month/quarter from selected day (selectedHourOffset represents days)
            const dayOffset = selectedHourOffset || 0;
            const selectedMidnight = new Date(now);
            selectedMidnight.setDate(now.getDate() + dayOffset);
            selectedMidnight.setHours(0, 0, 0, 0);
            selectedYear = selectedMidnight.getFullYear();
            selectedMonth = selectedMidnight.getMonth();
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
            selectedDate: new Date(selectedYear, selectedMonth, selectedDayForReturn),
            selectedDateHeight,
            selectedYear,
            selectedMonth,
            selectedQuarter,
            selectedYearOffset,
            selectedQuarterOffset,
            selectedWeekOffset,
            selectedDayOffset,
            selectedHourOffset, // Include for Zoom 8/9 calculations
            currentDayInWeek,
            selectedHourInDay: (currentHourInDay !== undefined ? currentHourInDay : now.getHours()) + (selectedHourOffset || 0) * 24
        };
    }

    // ============================================
    // UNIFIED HELPERS
    // ============================================
    
    function getAngle(height, currentHeight) {
        // Use SceneGeometry if available, otherwise fallback to local calculation
        if (SceneGeometry) {
            return SceneGeometry.getAngle(height, currentHeight);
        }
        // Fallback for backwards compatibility
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        const years = (height - currentHeight) / 100;
        const orbits = years / earth.orbitalPeriod;
        return earth.startAngle - (orbits * Math.PI * 2);
    }

    /** Selected-time marker lines in light mode: clearly navy vs. old bright #0066CC (pairs with label rgba in main.js). */
    function getSelectedMarkerLineColor() {
        return isLightMode ? 0x062d52 : 0x00FFFF;
    }

    function getColor(isCurrent, isSelected, hasOffset) {
        if (isCurrent) return 0xFF0000;
        // In full-year scope, show selected (blue) whenever the unit matches selected time, even without A/D offset
        if (isSelected && (_fullYearScope ? true : hasOffset)) return getSelectedMarkerLineColor();
        return getMarkerColor();
    }

    function getLabelColor(isCurrent, isSelected, hasOffset) {
        if (isCurrent) return 'red';
        if (isSelected && (_fullYearScope ? true : hasOffset)) return 'blue';
        return false;
    }

    // Unified offset calculation
    function calculateOffset(unitType, zoomLevel, timeState) {
        const now = timeState.currentDate;
        if (unitType === 'quarter') {
            if (zoomLevel === 8 || zoomLevel === 9) {
                // In Zoom 8/9, check if selected day is in a different quarter
                const selectedHourOffset = timeState.selectedHourOffset || 0;
                if (selectedHourOffset === 0) return false;
                const selectedMidnight = new Date(now);
                selectedMidnight.setDate(now.getDate() + selectedHourOffset);
                selectedMidnight.setHours(0, 0, 0, 0);
                const selectedQuarter = Math.floor(selectedMidnight.getMonth() / 3);
                const currentQuarter = Math.floor(now.getMonth() / 3);
                return selectedQuarter !== currentQuarter || selectedMidnight.getFullYear() !== now.getFullYear();
            }
            return timeState.selectedQuarterOffset !== 0;
        } else if (unitType === 'month') {
            if (zoomLevel === 8 || zoomLevel === 9) {
                // In Zoom 8/9, check if selected day is in a different month
                const selectedHourOffset = timeState.selectedHourOffset || 0;
                if (selectedHourOffset === 0) return false;
                const selectedMidnight = new Date(now);
                selectedMidnight.setDate(now.getDate() + selectedHourOffset);
                selectedMidnight.setHours(0, 0, 0, 0);
                return selectedMidnight.getMonth() !== now.getMonth() || selectedMidnight.getFullYear() !== now.getFullYear();
            }
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
            } else if (zoomLevel === 8 || zoomLevel === 9) {
                // In Zoom 8/9, selectedHourOffset represents days
                const selectedHourOffset = timeState.selectedHourOffset || 0;
                if (selectedHourOffset === 0) return false;
                // Calculate which week the selected day is in
                const selectedMidnight = new Date(now);
                selectedMidnight.setDate(now.getDate() + selectedHourOffset);
                selectedMidnight.setHours(0, 0, 0, 0);
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                const selectedDayOfWeek = selectedMidnight.getDay();
                const selectedWeekSunday = new Date(selectedMidnight);
                selectedWeekSunday.setDate(selectedMidnight.getDate() - selectedDayOfWeek);
                selectedWeekSunday.setHours(0, 0, 0, 0);
                return selectedWeekSunday.getTime() !== actualCurrentWeekSunday.getTime();
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
            } else if (zoomLevel === 8 || zoomLevel === 9) {
                // In Zoom 8/9, selectedHourOffset represents days
                const selectedHourOffset = timeState.selectedHourOffset || 0;
                return selectedHourOffset !== 0;
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
    // TIME MARKER RADII CONFIGURATION
    // ============================================
    // All time marker radii are defined here for easy adjustment
    const RADII_CONFIG = {
        quarter: {
            outer: (dist) => dist / 4,
            inner: () => null,
            label: (dist) => dist / 6
        },
        month: {
            outer: (dist) => dist / 2,
            inner: (dist) => dist / 4,
            label: (dist) => dist * 3 / 8
        },
        week: {
            outer: (dist) => dist * 5 / 8,
            inner: (dist) => dist / 2,
            label: (dist) => dist * 9 / 16
        },
        day: {
            outer: (dist) => dist * 3 / 4,
            inner: (dist) => dist * 5 / 8,
            label: (dist) => dist * 21 / 32,  // Day numbers - between inner and middle
            dayName: (dist) => dist * 23 / 32  // Day names - between middle and outer
        },
        hour: {
            spiral: (dist) => dist * 0.1 * 0.9  // 0.9x size for daily spiral and hours
        }
    };

    function isSingularBandModeActive() {
        return typeof window !== 'undefined' &&
            typeof window.getSingularBandMode === 'function' &&
            !!window.getSingularBandMode();
    }

    function getEarthLagrangeGammaForRadii() {
        const cfg =
            typeof SCENE_CONFIG !== 'undefined' && SCENE_CONFIG && SCENE_CONFIG.lagrangeMarkers
                ? SCENE_CONFIG.lagrangeMarkers
                : null;
        const mu =
            cfg && typeof cfg.earthToSunMassRatio === 'number' && cfg.earthToSunMassRatio > 0
                ? cfg.earthToSunMassRatio
                : 3.00346e-6;
        return Math.pow(mu / 3, 1 / 3);
    }

    /**
     * Circadian hour-hand length from Earth (noon tip ↔ midnight tip = 2× this along Sun–Earth).
     * Same as RADII_CONFIG.hour.spiral / CircadianRenderer hand.
     */
    function getCircadianNoonMidnightHalfSpan(earthDistance) {
        const W = typeof earthDistance === 'number' && !isNaN(earthDistance) ? earthDistance : 50;
        if (
            typeof CircadianRenderer !== 'undefined' &&
            typeof CircadianRenderer.getHandLength === 'function'
        ) {
            const h = CircadianRenderer.getHandLength();
            if (typeof h === 'number' && isFinite(h) && h > 0) return h;
        }
        return RADII_CONFIG.hour.spiral(W);
    }

    /**
     * Day-marker / Context Arc sky frame (singular):
     * Radial span = circadian noon↔midnight difference (2 × hour-hand length).
     * Centered on Earth orbit W — pedagogical L1 (midnight, sunward) → L2 (end of day, anti-sunward).
     * Not CRTBP γ·W (too thin to match the daily disk).
     */
    function getEarthOrbitL1L2DayFrameRadii(earthDistance) {
        const W = typeof earthDistance === 'number' && !isNaN(earthDistance) ? earthDistance : 50;
        const half = getCircadianNoonMidnightHalfSpan(W);
        const inner = W - half;
        const outer = W + half;
        return {
            inner,
            outer,
            label: inner + (outer - inner) * 0.4,
            dayName: inner + (outer - inner) * 0.7,
            halfSpan: half,
            gamma: getEarthLagrangeGammaForRadii(),
            W
        };
    }

    /**
     * Thin residual Δr stack centered on Earth orbit W (demo).
     * Day band = circadian noon↔midnight radial span (2×hand), midnight at inner / end at outer.
     * Coarser grains step sunward of day inner.
     */
    function getSingularRadialZones(earthDistance) {
        const W = typeof earthDistance === 'number' && !isNaN(earthDistance) ? earthDistance : 50;
        const day = getEarthOrbitL1L2DayFrameRadii(W);
        const dayInner = day.inner;
        const dayOuter = day.outer;
        const dayWidth = Math.max(dayOuter - dayInner, W * 0.004);
        // Stack coarser grains sunward of day-inner with similar pitch.
        const wOuter = dayInner;
        const wInner = wOuter - dayWidth;
        const mOuter = wInner;
        const mInner = mOuter - dayWidth;
        const qOuter = mInner;
        const qInner = qOuter - dayWidth;
        return {
            quarter: {
                outer: qOuter,
                inner: null,
                label: (qInner + qOuter) * 0.5
            },
            month: {
                outer: mOuter,
                inner: mInner,
                label: (mInner + mOuter) * 0.5
            },
            week: {
                outer: wOuter,
                inner: wInner,
                label: (wInner + wOuter) * 0.5
            },
            day: {
                outer: dayOuter,
                inner: dayInner,
                label: day.label,
                dayName: day.dayName
            },
            hour: {
                spiral: RADII_CONFIG.hour.spiral(W)
            }
        };
    }

    /** Radii for one marker system — singular stack or classic onion. */
    function getSystemRadii(systemName, earthDistance) {
        const zones = getCanonicalRadialZones(earthDistance);
        if (systemName === 'quarter') return zones.quarter;
        if (systemName === 'month') return zones.month;
        if (systemName === 'week') return zones.week;
        if (systemName === 'day') return zones.day;
        if (systemName === 'hour') return { spiral: zones.hour.spiral };
        return zones.month;
    }

    // ============================================
    // SYSTEM DEFINITIONS (Declarative)
    // ============================================
    
    const SYSTEMS = {
        quarter: {
            name: 'quarter',
            /** Zoom-invariant: same rings at all zoom levels; only which units render changes. */
            getRadii: (_zoom, dist) => getSystemRadii('quarter', dist),
            // For zoom 3+ always show all 4 quarters of the selected year
            getUnits: (zoom, state) => {
                const year = state.selectedYear;
                if (zoom >= 3) {
                    return Array.from({ length: 4 }, (_, i) => ({ index: i, year }));
                }
                const units = [{ index: state.selectedQuarter, year }];
                const now = state.currentDate;
                const actual = Math.floor(now.getMonth() / 3);
                if (actual !== state.selectedQuarter || now.getFullYear() !== year) {
                    units.push({ index: actual, year: now.getFullYear() });
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
            /** Zoom-invariant: same rings at all zoom levels; only which units render changes. */
            getRadii: (_zoom, dist) => getSystemRadii('month', dist),
            // For zoom 3+ always show all 12 months of the selected year
            getUnits: (zoom, state) => {
                const year = state.selectedYear;
                if (zoom >= 3) {
                    const months = Array.from({ length: 12 }, (_, i) => ({ index: i, year }));
                    // Add a boundary marker at the start of the next year for continuous curves
                    months.push({ index: 12, year });
                    return months;
                }
                const units = [];
                const selectedQ = Math.floor(state.selectedMonth / 3);
                for (let m = selectedQ * 3; m < (selectedQ + 1) * 3; m++) {
                    units.push({ index: m, year });
                }
                if (selectedQ < 3) {
                    const boundaryMonth = (selectedQ + 1) * 3;
                    units.push({ index: boundaryMonth, year });
                }
                const now = state.currentDate;
                const actualQ = Math.floor(now.getMonth() / 3);
                if (actualQ !== selectedQ || now.getFullYear() !== year) {
                    for (let m = actualQ * 3; m < (actualQ + 1) * 3; m++) {
                        units.push({ index: m, year: now.getFullYear() });
                    }
                    if (actualQ < 3) {
                        const boundaryMonth = (actualQ + 1) * 3;
                        units.push({ index: boundaryMonth, year: now.getFullYear() });
                    }
                }
                const exists = units.some(u => u.index === state.selectedMonth && u.year === year);
                if (!exists) units.push({ index: state.selectedMonth, year });
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

    /** Year-zoom intro: only draw marker units whose calendar start is at or before selected time (Earth “draws” ticks). */
    function tourProgressiveIncludeUnitStart(unitStartMs, progressiveMs) {
        if (progressiveMs == null || typeof progressiveMs !== 'number' || isNaN(progressiveMs)) return true;
        return unitStartMs <= progressiveMs;
    }

    function resolveUnitIndexYear(unitInfo, timeState) {
        if (unitInfo instanceof Date) {
            return { unitIndex: unitInfo, unitYear: unitInfo.getFullYear() };
        }
        if (typeof unitInfo === 'object' && unitInfo !== null) {
            return {
                unitIndex: unitInfo.unit !== undefined ? unitInfo.unit : unitInfo.index,
                unitYear: unitInfo.year || timeState.selectedYear
            };
        }
        return { unitIndex: unitInfo, unitYear: timeState.selectedYear };
    }

    function getContextArcBoundsMs(zoomLevel) {
        if (_fullYearScope) return null;
        const fn =
            getListContextDiscArcTimeBoundsMs ||
            (typeof window !== 'undefined' ? window.getListContextDiscArcTimeBoundsMs : null);
        if (typeof fn !== 'function') return null;
        return fn(zoomLevel);
    }

    function unitRangeOverlapsContextArc(unitStartMs, unitEndMs, zoomLevel) {
        const bounds = getContextArcBoundsMs(zoomLevel);
        if (!bounds || bounds.t1 < bounds.t0) return true;
        return unitStartMs <= bounds.t1 && bounds.t0 <= unitEndMs;
    }

    /**
     * LTE day-frame markers ↔ Event Horizon Interstellar warp (accretion ring outside).
     * Stores logical verts so camera in/out can restore helix spokes.
     */
    function applyLteDayFrameWarpToGeometry(geom) {
        if (!geom || !geom.attributes || !geom.attributes.position) return;
        const logical = geom.userData && geom.userData.lteDayFrameLogical;
        if (!logical || !logical.length) return;
        const pos = geom.attributes.position.array;
        const W = typeof window !== 'undefined' ? window.ContextSphereWarp : null;
        const stateFn =
            typeof window !== 'undefined' && typeof window.getContextSphereState === 'function'
                ? window.getContextSphereState
                : null;
        const state = stateFn ? stateFn() : null;
        const inside = W && W.getCameraInsideCached && W.getCameraInsideCached();
        if (!W || !W.warpLtePointToRing || inside || !state || !(state.radius > 0)) {
            pos.set(logical);
            geom.attributes.position.needsUpdate = true;
            return;
        }
        const ri = typeof geom.userData.dayFrameRi === 'number' ? geom.userData.dayFrameRi : 0;
        const ro =
            typeof geom.userData.dayFrameRo === 'number' ? geom.userData.dayFrameRo : ri + 1;
        const span = Math.max(ro - ri, 1e-6);
        const diskWidth = state.radius * 0.28;
        let basis = null;
        if (typeof window.getContextSphereLteCanvasPlaneBasis === 'function') {
            try {
                basis = window.getContextSphereLteCanvasPlaneBasis(state, 0);
            } catch (e) { /* optional */ }
        }
        for (let i = 0; i < logical.length; i += 3) {
            const x = logical[i];
            const y = logical[i + 1];
            const z = logical[i + 2];
            const amt =
                W.getSceneYSelectedWeekWarpAmount
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
        if (geom.computeBoundingSphere) geom.computeBoundingSphere();
    }

    function applyLteDayFrameWarpToSprite(sprite) {
        if (!sprite || !sprite.userData || !sprite.userData.lteDayFrameLogicalPos) return;
        const logical = sprite.userData.lteDayFrameLogicalPos;
        const W = typeof window !== 'undefined' ? window.ContextSphereWarp : null;
        const stateFn =
            typeof window !== 'undefined' && typeof window.getContextSphereState === 'function'
                ? window.getContextSphereState
                : null;
        const state = stateFn ? stateFn() : null;
        const inside = W && W.getCameraInsideCached && W.getCameraInsideCached();
        if (!W || !W.warpLtePointToRing || inside || !state || !(state.radius > 0)) {
            sprite.position.set(logical.x, logical.y, logical.z);
            return;
        }
        const amt = W.getSceneYSelectedWeekWarpAmount
            ? W.getSceneYSelectedWeekWarpAmount(logical.y, state)
            : 0;
        if (amt <= 0.001) {
            sprite.position.set(logical.x, logical.y, logical.z);
            return;
        }
        const ri = typeof sprite.userData.dayFrameRi === 'number' ? sprite.userData.dayFrameRi : 0;
        const ro =
            typeof sprite.userData.dayFrameRo === 'number' ? sprite.userData.dayFrameRo : ri + 1;
        const span = Math.max(ro - ri, 1e-6);
        const rH = Math.hypot(logical.x, logical.z);
        const radialT = Math.max(0, Math.min(1, (rH - ri) / span));
        let basis = null;
        if (typeof window.getContextSphereLteCanvasPlaneBasis === 'function') {
            try {
                basis = window.getContextSphereLteCanvasPlaneBasis(state, 0);
            } catch (e) { /* optional */ }
        }
        const q = W.warpLtePointToRing(logical, state, {
            cameraInside: false,
            radialT,
            diskWidth: state.radius * 0.28,
            basis,
            amount: amt
        });
        sprite.position.set(q.x, q.y, q.z);
    }

    function tagLteDayFrameMarker(obj, ri, ro) {
        if (!obj) return;
        if (!obj.userData) obj.userData = {};
        obj.userData.lteDayFrameMarker = true;
        obj.userData.dayFrameRi = ri;
        obj.userData.dayFrameRo = ro;
        if (obj.isSprite || obj.type === 'Sprite') {
            obj.userData.lteDayFrameLogicalPos = {
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z
            };
            applyLteDayFrameWarpToSprite(obj);
            return;
        }
        const geom = obj.geometry;
        if (geom && geom.attributes && geom.attributes.position) {
            if (!geom.userData) geom.userData = {};
            geom.userData.lteDayFrameLogical = new Float32Array(geom.attributes.position.array);
            geom.userData.dayFrameRi = ri;
            geom.userData.dayFrameRo = ro;
            applyLteDayFrameWarpToGeometry(geom);
        }
    }

    /** Re-apply Event Horizon warp to all tagged LTE day-frame time markers. */
    function applyLteDayFrameEventHorizonWarp() {
        if (!timeMarkers || !timeMarkers.length) return;
        for (let i = 0; i < timeMarkers.length; i++) {
            const m = timeMarkers[i];
            if (!m || !m.userData || !m.userData.lteDayFrameMarker) continue;
            if (m.isSprite || m.type === 'Sprite') {
                applyLteDayFrameWarpToSprite(m);
            } else if (m.geometry) {
                applyLteDayFrameWarpToGeometry(m.geometry);
            }
        }
    }

    function getUnitTimeRangeMs(unitType, unitInfo, unitIndex, unitYear, getUnitDate) {
        const start = getUnitDate(unitInfo, unitIndex, unitYear);
        if (!start || isNaN(start.getTime())) return null;
        const t0 = start.getTime();
        let t1;
        if (unitType === 'month') {
            const idx = typeof unitIndex === 'number' ? unitIndex : start.getMonth();
            const y = unitYear != null ? unitYear : start.getFullYear();
            if (idx === 12) {
                t1 = new Date(y + 1, 0, 1, 0, 0, 0, 0).getTime();
            } else {
                t1 = new Date(y, idx + 1, 1, 0, 0, 0, 0).getTime();
            }
        } else if (unitType === 'quarter') {
            const q = typeof unitIndex === 'number' ? unitIndex : Math.floor(start.getMonth() / 3);
            const y = unitYear != null ? unitYear : start.getFullYear();
            const endMonth = (q + 1) * 3;
            t1 =
                endMonth >= 12
                    ? new Date(y + 1, 0, 1, 0, 0, 0, 0).getTime()
                    : new Date(y, endMonth, 1, 0, 0, 0, 0).getTime();
        } else if (unitType === 'week') {
            t1 = t0 + 7 * MS_PER_DAY;
        } else if (unitType === 'day') {
            t1 = t0 + MS_PER_DAY - 1;
        } else {
            t1 = t0 + MS_PER_DAY;
        }
        return { t0, t1 };
    }

    /** True when unit calendar span overlaps the 3D context arc window (cyan highlight only). */
    function isUnitInContextArc(unitType, unitInfo, unitIndex, unitYear, zoomLevel, timeState, getUnitDate) {
        if (_fullYearScope) return true;
        if (!getContextArcBoundsMs(zoomLevel)) return true;
        const range = getUnitTimeRangeMs(unitType, unitInfo, unitIndex, unitYear, getUnitDate);
        if (!range) return true;
        return unitRangeOverlapsContextArc(range.t0, range.t1, zoomLevel);
    }
    
    function createTimeFrame(config) {
        const {
            unitType,
            zoomLevel,
            outerRadius,
            innerRadius,
            timeState,
            unitNames,
            getUnitsToShow,
            getUnitDate,
            isCurrentUnit,
            isSelectedUnit,
            skipLabels = false,
            labelRadius = null,
            getUnitCenterDate,
            tourMarkerStaged = false,
            tourProgressiveMarkerMs = null
        } = config;

        // Label visibility is controlled purely by zoom level; the full-year toggle
        // only affects which days are generated, not which labels are allowed.
        const showText =
            !skipLabels &&
            ((unitType === 'quarter' && zoomLevel >= 3) ||
                (unitType === 'month' && (zoomLevel >= 4 || (zoomLevel === 3 && tourMarkerStaged))) ||
                (unitType === 'week' && zoomLevel >= 5) ||
                (unitType === 'day' && zoomLevel >= 7));
        
        let unitsToShow = getUnitsToShow(zoomLevel, timeState);
        if (tourProgressiveMarkerMs != null && zoomLevel === 3 && (unitType === 'quarter' || unitType === 'month')) {
            unitsToShow = unitsToShow.filter((unitInfo) => {
                const { unitIndex, unitYear } = resolveUnitIndexYear(unitInfo, timeState);
                const unitStartDate = getUnitDate(unitInfo, unitIndex, unitYear);
                return unitStartDate.getTime() <= tourProgressiveMarkerMs;
            });
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
            let prevIsCurrent = false;
            let prevIsSelected = false;
            let prevHasOffset = false;
            let prevInArc = false;
            let prevIndex = null;
            let prevYear = null;
            if (prevUnit) {
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
                prevInArc = isUnitInContextArc(
                    unitType,
                    prevUnit,
                    prevIndex,
                    prevYear,
                    zoomLevel,
                    timeState,
                    getUnitDate
                );
            }

            const inArc = isUnitInContextArc(
                unitType,
                unitInfo,
                unitIndex,
                unitYear,
                zoomLevel,
                timeState,
                getUnitDate
            );
            const highlightSelected = (isSelected && inArc) || (prevIsSelected && prevInArc);

            // Spoke radii: fixed to this unit's ring. Quarter-boundary month ticks from Sun (0) to month.outer only.
            let startRadius = innerRadius || 0;
            const endRadius = outerRadius;
            if (unitType === 'month' && typeof unitIndex === 'number' && unitIndex % 3 === 0 && unitIndex > 0) {
                startRadius = 0;
            }
            
            // Create line using SceneGeometry
            let points = SceneGeometry ?
                SceneGeometry.createEarthStraightLine(height, startRadius, endRadius, timeState.currentDateHeight) :
                [
                    Math.cos(angle) * startRadius, height, Math.sin(angle) * startRadius,
                    Math.cos(angle) * endRadius, height, Math.sin(angle) * endRadius
                ];
            // Day spokes densify along day-pitch so EH warp can unwrap midnight→evening
            // around Earth (2-point lines both map near midnight → pile on anti-sun side).
            if (unitType === 'day') {
                const nSeg = 24;
                const dense = [];
                const ang =
                    typeof angle === 'number' && isFinite(angle)
                        ? angle
                        : typeof getAngle === 'function'
                          ? getAngle(height, timeState.currentDateHeight)
                          : 0;
                for (let si = 0; si <= nSeg; si++) {
                    const t = si / nSeg;
                    const r = startRadius + (endRadius - startRadius) * t;
                    dense.push(Math.cos(ang) * r, height, Math.sin(ang) * r);
                }
                points = dense;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
            
            const lineColor = getColor(
                isCurrent || prevIsCurrent,
                highlightSelected,
                hasOffset || prevHasOffset
            );
            const sel = highlightSelected;
            const cur = isCurrent || prevIsCurrent;
            let lineOp = cur || sel ? 0.9 : 0.7;
            if (isLightMode && sel && !cur) lineOp = 0.82;
            const material = new THREE.LineBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: lineOp,
                linewidth: (isCurrent || (isSelected && inArc)) ? 3 : 2
            });
            
            const line = new THREE.Line(geometry, material);
            line.renderOrder = 4;
            if (tourMarkerStaged && zoomLevel === 3 && tourProgressiveMarkerMs == null) {
                if (unitType === 'quarter') line.userData.circaevumTourRevealTier = 4;
                else if (unitType === 'month') line.userData.circaevumTourRevealTier = 5;
            }
            if (unitType === 'day') {
                tagLteDayFrameMarker(line, startRadius, endRadius);
            }
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
                    // Previously, month labels were filtered to only the selected/current quarter.
                    // With the new design we want month labels available for the whole year,
                    // so no additional quarter-based filtering is applied here.
                    
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
                    const labelColor = getLabelColor(isCurrent, isSelected && inArc, hasOffset);
                    // Debug logging for Zoom 8/9
                    if ((zoomLevel === 8 || zoomLevel === 9) && (unitType === 'quarter' || unitType === 'month' || unitType === 'week' || unitType === 'day')) {
                    }
                    const textZoom = (unitType === 'quarter' || unitType === 'month') ? 4 : (unitType === 'week' ? 5 : zoomLevel);
                    const labelTier =
                        tourMarkerStaged && zoomLevel === 3 && tourProgressiveMarkerMs == null
                            ? unitType === 'quarter'
                                ? 4
                                : unitType === 'month'
                                  ? 5
                                  : undefined
                            : undefined;
                    createTextLabel(labelText, labelHeight, calcLabelRadius, textZoom, labelAngle, labelColor, false, 0.85, labelTier);
                    if (unitType === 'day' && timeMarkers.length) {
                        tagLteDayFrameMarker(
                            timeMarkers[timeMarkers.length - 1],
                            innerRadius || 0,
                            outerRadius
                        );
                    }
                }
            }
        });
    }

    // ============================================
    // QUARTER SYSTEM (Simplified)
    // ============================================
    
    function createQuarterSystem(earthDistance, timeState, zoomLevel, tourMarkerStaged, tourProgressiveMs) {
        const system = SYSTEMS.quarter;
        const radii = system.getRadii(zoomLevel, earthDistance);
        
        // Parent curves for Zoom 3+ (same system as Zoom 4+)
        if (zoomLevel >= 3) {
            const quartersToShow = system.getUnits(zoomLevel, timeState);
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            
            quartersToShow.forEach(qInfo => {
                const qIndex = typeof qInfo === 'object' ? qInfo.index : qInfo;
                const qYear = typeof qInfo === 'object' ? qInfo.year : timeState.selectedYear;
                const qStartMs = new Date(qYear, qIndex * 3, 1, 0, 0, 0, 0).getTime();
                if (!tourProgressiveIncludeUnitStart(qStartMs, tourProgressiveMs)) return;

                // Use calculateDateHeight to match actual line positions
                const quarterStartMonth = qIndex * 3;
                const quarterStartHeight = calculateDateHeight(qYear, quarterStartMonth, 1, 0);
                const quarterEndMonth = quarterStartMonth + 3;
                // calculateDateHeight expects month 0–11; month 12 is Jan next year (Q4 end).
                const quarterEndHeight = quarterEndMonth >= 12
                  ? calculateDateHeight(qYear + 1, 0, 1, 0)
                  : calculateDateHeight(qYear, quarterEndMonth, 1, 0);
                
                // Use SceneGeometry for consistent curve generation
                const curvePoints = SceneGeometry ?
                    SceneGeometry.createEarthHelicalCurve(quarterStartHeight, quarterEndHeight, radii.outer, timeState.currentDateHeight, 64) :
                    (() => {
                        // Fallback if SceneGeometry not available
                        const quarterHeight = quarterEndHeight - quarterStartHeight;
                        const angle = getAngle(quarterStartHeight, timeState.currentDateHeight);
                        const orbitsInSpan = (quarterHeight / 100) / earth.orbitalPeriod;
                        const points = [];
                        for (let i = 0; i <= 64; i++) {
                            const t = i / 64;
                            const a = angle - (t * orbitsInSpan * Math.PI * 2);
                            const h = quarterStartHeight + (t * quarterHeight);
                            points.push(Math.cos(a) * radii.outer, h, Math.sin(a) * radii.outer);
                        }
                        return points;
                    })();
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(), // Adapts to light/dark mode
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                const curveLine = new THREE.Line(curveGeometry, curveMaterial);
                curveLine.renderOrder = 4;
                if (tourMarkerStaged && zoomLevel === 3 && tourProgressiveMs == null) {
                    curveLine.userData.circaevumTourRevealTier = qIndex === 0 ? 1 : 2;
                }
                scene.add(curveLine);
                timeMarkers.push(curveLine);
            });
        }
        
        createTimeFrame({
            unitType: 'quarter',
            zoomLevel,
            outerRadius: radii.outer,
            innerRadius: radii.inner,
            timeState,
            unitNames: system.names,
            getUnitsToShow: system.getUnits,
            getUnitDate: system.getDate,
            isCurrentUnit: system.isCurrent,
            isSelectedUnit: system.isSelected,
            labelRadius: radii.label,
            tourMarkerStaged: !!tourMarkerStaged,
            tourProgressiveMarkerMs: tourProgressiveMs
        });
    }

    // ============================================
    // MONTH SYSTEM (Simplified)
    // ============================================
    
    function createMonthSystem(earthDistance, timeState, zoomLevel, tourMarkerStaged, tourProgressiveMs) {
        const system = SYSTEMS.month;
        const radii = system.getRadii(zoomLevel, earthDistance);
        
        // Parent curves for Zoom 3+ (same system as Zoom 4+)
        if (zoomLevel >= 3) {
            const monthsToShow = system.getUnits(zoomLevel, timeState);
            const earth = PLANET_DATA.find(p => p.name === 'Earth');
            
            monthsToShow.forEach(mInfo => {
                const mIndex = typeof mInfo === 'object' ? mInfo.index : mInfo;
                const mYear = typeof mInfo === 'object' ? mInfo.year : timeState.selectedYear;
                const mStartMs =
                    mIndex === 12
                        ? new Date(mYear + 1, 0, 1, 0, 0, 0, 0).getTime()
                        : new Date(mYear, mIndex, 1, 0, 0, 0, 0).getTime();
                if (!tourProgressiveIncludeUnitStart(mStartMs, tourProgressiveMs)) return;

                // Use calculateDateHeight to match actual line positions
                // Handle month 12 (next year boundary)
                let monthStartHeight, monthEndHeight;
                if (mIndex === 12) {
                    monthStartHeight = calculateDateHeight(mYear + 1, 0, 1, 0);
                    monthEndHeight = calculateDateHeight(mYear + 1, 1, 1, 0);
                } else {
                    monthStartHeight = calculateDateHeight(mYear, mIndex, 1, 0);
                    const nextMonth = mIndex + 1;
                    // December (11): end is Jan 1 next year, not month 12 (undefined in getDaysInMonth).
                    monthEndHeight = nextMonth >= 12
                      ? calculateDateHeight(mYear + 1, 0, 1, 0)
                      : calculateDateHeight(mYear, nextMonth, 1, 0);
                }
                // Use SceneGeometry for consistent curve generation
                const curvePoints = SceneGeometry ?
                    SceneGeometry.createEarthHelicalCurve(monthStartHeight, monthEndHeight, radii.outer, timeState.currentDateHeight, 64) :
                    (() => {
                        // Fallback if SceneGeometry not available
                        const monthHeight = monthEndHeight - monthStartHeight;
                        const angle = getAngle(monthStartHeight, timeState.currentDateHeight);
                        const orbitsInSpan = (monthHeight / 100) / earth.orbitalPeriod;
                        const points = [];
                        for (let i = 0; i <= 64; i++) {
                            const t = i / 64;
                            const a = angle - (t * orbitsInSpan * Math.PI * 2);
                            const h = monthStartHeight + (t * monthHeight);
                            points.push(Math.cos(a) * radii.outer, h, Math.sin(a) * radii.outer);
                        }
                        return points;
                    })();
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(), // Adapts to light/dark mode
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                const curveLine = new THREE.Line(curveGeometry, curveMaterial);
                curveLine.renderOrder = 4;
                if (tourMarkerStaged && zoomLevel === 3 && tourProgressiveMs == null) {
                    curveLine.userData.circaevumTourRevealTier = 5;
                }
                scene.add(curveLine);
                timeMarkers.push(curveLine);
            });
        }
        
        createTimeFrame({
            unitType: 'month',
            zoomLevel,
            outerRadius: radii.outer,
            innerRadius: radii.inner,
            timeState,
            unitNames: system.names,
            getUnitsToShow: system.getUnits,
            getUnitDate: system.getDate,
            isCurrentUnit: system.isCurrent,
            isSelectedUnit: system.isSelected,
            labelRadius: radii.label,
            tourMarkerStaged: !!tourMarkerStaged,
            tourProgressiveMarkerMs: tourProgressiveMs
        });
    }


    // ============================================
    // WEEK SYSTEM (Keep complex logic but streamline)
    // ============================================
    
    function createWeekSystem(earthDistance, timeState, zoomLevel) {
        const weekRadii = getSystemRadii('week', earthDistance);
        const innerRadius = weekRadii.inner;
        const outerRadius = weekRadii.outer;
        const labelRadius = weekRadii.label;
        
        function getWeeksToShow(zoomLevel, timeState) {
            // New behavior: for zoom 4+ we always show all weeks in the selected year.
            const year = timeState.selectedYear;
            const weeksToShow = [];
            const firstOfYear = new Date(year, 0, 1);
            const lastOfYear = new Date(year, 11, 31);
            const firstSundayOffset = -firstOfYear.getDay();
            let currentSunday = new Date(year, 0, 1 + firstSundayOffset);
            currentSunday.setHours(0, 0, 0, 0);
            while (currentSunday <= lastOfYear || currentSunday.getFullYear() === year) {
                if (currentSunday.getFullYear() === year || new Date(currentSunday.getTime() + 6 * 24 * 60 * 60 * 1000).getFullYear() === year) {
                    weeksToShow.push(new Date(currentSunday));
                }
                currentSunday.setDate(currentSunday.getDate() + 7);
            }
            weeksToShow.sort((a, b) => a.getTime() - b.getTime());
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
            } else if (zoomLevel === 8 || zoomLevel === 9) {
                // In Zoom 8/9, selectedHourOffset represents days
                const selectedHourOffset = state.selectedHourOffset || 0;
                const selectedMidnight = new Date(now);
                selectedMidnight.setDate(now.getDate() + selectedHourOffset);
                selectedMidnight.setHours(0, 0, 0, 0);
                const selectedDayOfWeek = selectedMidnight.getDay();
                selectedWeekSunday = new Date(selectedMidnight);
                selectedWeekSunday.setDate(selectedMidnight.getDate() - selectedDayOfWeek);
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
                    color: getMarkerColor(), // Adapts to light/dark mode
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                const curveLine = new THREE.Line(curveGeometry, curveMaterial);
                curveLine.renderOrder = 4;
                scene.add(curveLine);
                timeMarkers.push(curveLine);
            });
        }
        
        createTimeFrame({
            unitType: 'week',
            zoomLevel,
            outerRadius,
            innerRadius,
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
        const dayRadii = getSystemRadii('day', earthDistance);
        const innerRadius = dayRadii.inner;
        const outerRadius = dayRadii.outer;
        const labelRadius = dayRadii.label;  // Day numbers
        const dayNameRadius = dayRadii.dayName;  // Day names
        
        function getDaysToShow(zoomLevel, timeState) {
            if (_fullYearScope && _fullYearYear != null) {
                const year = _fullYearYear;
                const daysToShow = [];
                const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
                const daysInYear = isLeap(year) ? 366 : 365;
                for (let d = 0; d < daysInYear; d++) {
                    const date = new Date(year, 0, 1 + d);
                    date.setHours(0, 0, 0, 0);
                    daysToShow.push(date);
                }
                return daysToShow;
            }
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
            const normalizedDay = new Date(unit.index);
            normalizedDay.setHours(0, 0, 0, 0);
            
            // In full-year scope, tie the blue selected day directly to the global Selected Time
            // so it follows navigation at any zoom level.
            if (_fullYearScope && typeof getSelectedDateTime === 'function') {
                const selectedDate = getSelectedDateTime();
                const selectedMidnight = new Date(selectedDate);
                selectedMidnight.setHours(0, 0, 0, 0);
                return normalizedDay.getTime() === selectedMidnight.getTime();
            }
            
            // For Zoom 8/9, use selectedHourOffset (which represents days) and currentHourInDay
            if (zoomLevel === 8 || zoomLevel === 9) {
                const actualMidnight = new Date(now);
                actualMidnight.setHours(0, 0, 0, 0);
                const selectedHourOffset = state.selectedHourOffset || 0; // In Zoom 8/9, this represents days
                const selectedMidnight = new Date(actualMidnight);
                selectedMidnight.setDate(actualMidnight.getDate() + selectedHourOffset);
                selectedMidnight.setHours(0, 0, 0, 0);
                return normalizedDay.getTime() === selectedMidnight.getTime();
            }
            
            // For Zoom 7, use selectedDayOffset (weeks) and currentDayInWeek
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
                
                // Rotate 180 degrees so curves start/stop at midnight (not noon)
                // For SceneGeometry, we need to offset by half a day to rotate the angle
                const weekHeightActual = weekEndHeight - weekStartHeight;
                const halfDayOffset = weekHeightActual / 14; // Half day offset (7 days / 14 = 0.5 days)
                const rotatedStartHeight = weekStartHeight + halfDayOffset;
                const rotatedEndHeight = weekEndHeight + halfDayOffset;
                
                // Use SceneGeometry for consistent curve generation
                const curvePoints = SceneGeometry ?
                    SceneGeometry.createEarthHelicalCurve(rotatedStartHeight, rotatedEndHeight, outerRadius, timeState.currentDateHeight, 64) :
                    (() => {
                        // Fallback if SceneGeometry not available
                        // Add Math.PI to rotate 180 degrees (midnight instead of noon)
                        const angle = getAngle(weekStartHeight, timeState.currentDateHeight) + Math.PI;
                        const orbitsInSpan = (weekHeightActual / 100) / earth.orbitalPeriod;
                        const points = [];
                        for (let i = 0; i <= 64; i++) {
                            const t = i / 64;
                            const a = angle - (t * orbitsInSpan * Math.PI * 2);
                            const h = weekStartHeight + (t * weekHeightActual);
                            points.push(Math.cos(a) * outerRadius, h, Math.sin(a) * outerRadius);
                        }
                        return points;
                    })();
                const curveGeometry = new THREE.BufferGeometry();
                curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curvePoints, 3));
                const curveMaterial = new THREE.LineBasicMaterial({
                    color: getMarkerColor(), // Adapts to light/dark mode
                    transparent: true,
                    opacity: 0.6,
                    linewidth: 2
                });
                const curveLine = new THREE.Line(curveGeometry, curveMaterial);
                curveLine.renderOrder = 4;
                tagLteDayFrameMarker(curveLine, outerRadius * 0.98, outerRadius);
                scene.add(curveLine);
                timeMarkers.push(curveLine);
            });
        }
        
        createTimeFrame({
            unitType: 'day',
            zoomLevel,
            outerRadius,
            innerRadius,
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
            const dayOfWeekLabelRadius = dayNameRadius;  // Use the configured day name radius
            
            const now = timeState.currentDate;
            let hasDayOffset = false;
            
            // For Zoom 8/9, check selectedHourOffset (which represents days)
            if (zoomLevel === 8 || zoomLevel === 9) {
                const selectedHourOffset = timeState.selectedHourOffset || 0;
                hasDayOffset = selectedHourOffset !== 0;
            } else {
                // For Zoom 7, check selectedDayOffset (weeks) and currentDayInWeek
                const actualDayInWeek = now.getDay();
                const actualCurrentWeekSunday = new Date(now);
                actualCurrentWeekSunday.setDate(now.getDate() - actualDayInWeek);
                actualCurrentWeekSunday.setHours(0, 0, 0, 0);
                const selectedDayOffset = timeState.selectedDayOffset || 0;
                const selectedWeekSunday = new Date(actualCurrentWeekSunday);
                selectedWeekSunday.setDate(actualCurrentWeekSunday.getDate() + (selectedDayOffset * 7));
                selectedWeekSunday.setHours(0, 0, 0, 0);
                const dayOffset = (currentDayInWeek !== undefined && currentDayInWeek !== null) ? currentDayInWeek : actualDayInWeek;
                hasDayOffset = (selectedDayOffset !== 0) || (currentDayInWeek !== actualDayInWeek);
            }
            
            const daysToShow = getDaysToShow(zoomLevel, timeState);
            daysToShow.forEach(dayDate => {
                const unit = { index: dayDate, year: dayDate.getFullYear() };
                const isCurrent = isCurrentDay(unit, timeState);
                const isSelected = isSelectedDayValue(unit, timeState);
                const dayInArc = isUnitInContextArc(
                    'day',
                    dayDate,
                    dayDate,
                    dayDate.getFullYear(),
                    zoomLevel,
                    timeState,
                    getDayDate
                );
                const dayOfWeekColor = isCurrent
                    ? 'red'
                    : (hasDayOffset && isSelected && dayInArc ? 'blue' : false);
                const dayOfWeekIndex = dayDate.getDay();
                const dayOfWeekText = (isCurrent || (hasDayOffset && isSelected && dayInArc))
                    ? dayOfWeekNamesFull[dayOfWeekIndex]
                    : dayOfWeekNamesShort[dayOfWeekIndex];
                
                const dayCenterDate = getDayCenterDate(dayDate, dayDate);
                const dayHeight = calculateDateHeight(dayCenterDate.getFullYear(), dayCenterDate.getMonth(), 
                                                     dayCenterDate.getDate(), dayCenterDate.getHours());
                const dayAngle = getAngle(dayHeight, timeState.currentDateHeight);
                createTextLabel(dayOfWeekText, dayHeight, dayOfWeekLabelRadius, 7, dayAngle, dayOfWeekColor, false, 0.85);
                if (timeMarkers.length) {
                    tagLteDayFrameMarker(
                        timeMarkers[timeMarkers.length - 1],
                        innerRadius,
                        outerRadius
                    );
                }
            });
        }
    }

    // ============================================
    // LINEAR/VERTICAL MARKERS FOR ZOOM 1 & 2
    // ============================================
    
    function createCenturyMarkers(timeState) {
        const config = TIME_MARKERS[1];
        const markerConfig = ZOOM_LEVELS[1];
        const lineLength = markerConfig.height; // Full height span
        const lineRadius = -100; // Distance from center (Sun) for vertical lines - negative for left side
        
        // Debug: log what years we're creating
        
        // Create all markers with same size - use only major array
        config.major.forEach(year => {
            const yearHeight = getHeightForYear(year, 1);
            const isCurrent = year === timeState.currentDate.getFullYear();
            const isSelected = year === timeState.selectedYear;
            if (year >= 2020 && year <= 2040) {
            }
            const color = isCurrent ? 0xFF0000 : (isSelected ? getSelectedMarkerLineColor() : getMarkerColor());
            
            // Create vertical line from Sun position - all same size
            const lineGeometry = new THREE.BufferGeometry();
            const linePoints = [
                0, yearHeight - lineLength/2, 0,  // Start point
                0, yearHeight + lineLength/2, 0   // End point
            ];
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
            
            const lineMaterial = new THREE.LineBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.6
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = 4;
            scene.add(line);
            timeMarkers.push(line);
            
            // Create text label - all same size
            createTextLabel(year.toString(), yearHeight, lineRadius, 1, 0, isCurrent ? 'red' : (isSelected ? 'blue' : false), false);
        });
    }
    
    function createDecadeMarkers(timeState) {
        const config = TIME_MARKERS[2];
        const markerConfig = ZOOM_LEVELS[2];
        const lineLength = markerConfig.height; // Full height span
        const lineRadius = -80; // Distance from center (Sun) for vertical lines - negative for left side
        
        // Create all markers with same size (2020-2030)
        config.major.forEach(year => {
            const yearHeight = getHeightForYear(year, 1);
            const now = new Date();
            const isCurrent = year === now.getFullYear();
            const isSelected = year === timeState.selectedYear;
            if (year >= 2020 && year <= 2030) {
            }
            const color = isCurrent ? 0xFF0000 : (isSelected ? getSelectedMarkerLineColor() : getMarkerColor());
            
            // Create vertical line from Sun position - all same size
            const lineGeometry = new THREE.BufferGeometry();
            const linePoints = [
                0, yearHeight - lineLength/2, 0,
                0, yearHeight + lineLength/2, 0
            ];
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
            
            const lineMaterial = new THREE.LineBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.6
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = 4;
            scene.add(line);
            timeMarkers.push(line);
            
            // Create text label - all same size
            createTextLabel(year.toString(), yearHeight, lineRadius, 2, 0, isCurrent ? 'red' : (isSelected ? 'blue' : false), false);
        });
    }
    
    function createYearMarker(timeState, zoomLevel, tourMarkerStaged, tourProgressiveMs) {
        // Create a year marker - size varies by zoom level
        const markerConfig = ZOOM_LEVELS[zoomLevel || 3];
        const baseLineLength = markerConfig.height; // Full height span
        // Zoom 1 uses half size
        const lineLength = (zoomLevel === 1) ? baseLineLength / 2 : baseLineLength;
        const lineRadius = -100; // Distance from center (Sun) for vertical line - increased from 120
        
        const selectedYear = timeState.selectedYear;
        const now = new Date();
        const currentYear = now.getFullYear();
        const isCurrent = selectedYear === currentYear;
        const isSelected = selectedYear !== currentYear;
        
        const yearHeight = getHeightForYear(selectedYear, 1);
        const color = isCurrent ? 0xFF0000 : (isSelected ? getSelectedMarkerLineColor() : getMarkerColor());
        
        // Create vertical line from Sun position
        const lineGeometry = new THREE.BufferGeometry();
        const linePoints = [
            0, yearHeight - lineLength/2, 0,
            0, yearHeight + lineLength/2, 0
        ];
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
        
        const lineMaterial = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8, // Increased opacity for better visibility
            linewidth: 2 // Thicker line
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.renderOrder = 4;
        if (tourMarkerStaged && zoomLevel >= 3 && tourProgressiveMs == null) {
            line.userData.circaevumTourRevealTier = 3;
        }
        scene.add(line);
        timeMarkers.push(line);
        
        // Zoom 1 uses half text size (sizeMultiplier 1.0 instead of 2.0)
        const textSizeMultiplier = (zoomLevel === 1) ? 1.0 : 2.0;
        const textZoom = zoomLevel || 3;
        const yTier = tourMarkerStaged && zoomLevel >= 3 && tourProgressiveMs == null ? 3 : undefined;
        createTextLabel(
            selectedYear.toString(),
            yearHeight,
            lineRadius,
            textZoom,
            0,
            isCurrent ? 'red' : (isSelected ? 'blue' : false),
            true,
            textSizeMultiplier,
            yTier
        );
    }

    // ============================================
    // HOUR SYSTEM (Zoom 8 & 9)
    // ============================================

    function angularDistRad(a, b) {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d);
    }

    /** Hour index 0–23 on the scene clock (matches EarthGlobe hands + orbital dial labels). */
    function sceneClockHourIndex(date, lon, eg) {
        if (eg && typeof eg.getSceneHourDecimal === 'function') {
            const h = eg.getSceneHourDecimal(date, lon);
            if (typeof h === 'number' && !isNaN(h)) {
                return ((Math.floor(h + 1e-9) % 24) + 24) % 24;
            }
        }
        const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        return d.getHours();
    }

    /** Orbital hour-dial angle for fractional clock time (0–24). Fixed ring — never meridian-snapped. */
    function hourFractionAngleFromEarth(hourFraction, sunToEarthAngle) {
        const hourRadians = (hourFraction / 24) * Math.PI * 2;
        return sunToEarthAngle - hourRadians;
    }

    /** Orbital hour-dial angle for label `hour` (0 = opposite Sun, 12 toward Sun). */
    function hourLabelAngleFromEarth(hour, sunToEarthAngle) {
        return hourFractionAngleFromEarth(hour, sunToEarthAngle);
    }

    /** One thick radial tick (quad in XZ); LineBasicMaterial width is ignored in WebGL. */
    function pushRadialTickQuad(verts, indices, earthX, earthZ, y, angle, innerR, outerR, halfWidth) {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const px = -sinA * halfWidth;
        const pz = cosA * halfWidth;
        const x0 = earthX + cosA * innerR;
        const z0 = earthZ + sinA * innerR;
        const x1 = earthX + cosA * outerR;
        const z1 = earthZ + sinA * outerR;
        const bi = verts.length / 3;
        verts.push(
            x0 + px,
            y,
            z0 + pz,
            x0 - px,
            y,
            z0 - pz,
            x1 - px,
            y,
            z1 - pz,
            x1 + px,
            y,
            z1 + pz
        );
        indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }

    /** Above earth daylight sky (main.js EARTH_DAYLIGHT_SKY_RENDER_ORDER = 7); below hour labels (50). */
    const QUARTER_HOUR_TICK_RENDER_ORDER = 12;

    /** Radial :00/:15/:30/:45 ticks just inside hour numerals on the Earth day spiral. */
    function createQuarterHourTickMarks(
        earthX,
        earthY,
        earthZ,
        sunToEarthAngle,
        spiralRadius,
        spiralCenterY,
        spiralHeight
    ) {
        const verts = [];
        const indices = [];
        const labelR = spiralRadius;
        const tickCenterR = labelR * 0.93;
        const tickHalfSpanHour = labelR * 0.048;
        const tickHalfSpanHalf = labelR * 0.034;
        const tickHalfSpanQuarter = labelR * 0.02;
        const halfWidth = Math.max(labelR * 0.004, 0.005);
        const quarterFracs = [0, 0.25, 0.5, 0.75];
        for (let hour = 0; hour < 24; hour++) {
            for (let qi = 0; qi < 4; qi++) {
                const hourFrac = hour + quarterFracs[qi];
                const angleFromEarth = hourFractionAngleFromEarth(hourFrac, sunToEarthAngle);
                const t = hourFrac / 24;
                const y = spiralCenterY + t * spiralHeight - spiralHeight / 2;
                const tickHalfSpan =
                    qi === 0 ? tickHalfSpanHour : qi === 2 ? tickHalfSpanHalf : tickHalfSpanQuarter;
                pushRadialTickQuad(
                    verts,
                    indices,
                    earthX,
                    earthZ,
                    y,
                    angleFromEarth,
                    tickCenterR - tickHalfSpan,
                    tickCenterR + tickHalfSpan,
                    halfWidth
                );
            }
        }
        const tickGeometry = new THREE.BufferGeometry();
        tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        tickGeometry.setIndex(indices);
        tickGeometry.computeVertexNormals();
        const tickMaterial = new THREE.MeshBasicMaterial({
            color: getMarkerColor(),
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
        });
        const ticks = new THREE.Mesh(tickGeometry, tickMaterial);
        ticks.renderOrder = QUARTER_HOUR_TICK_RENDER_ORDER;
        scene.add(ticks);
        timeMarkers.push(ticks);
    }

    /** Scene-clock hour indices for label/hand highlights (same hour math as EarthGlobe meridian hands). */
    function getSceneHourHighlightIndices(timeState, zoomLevel, sunToEarthAngle, earthPlanet) {
        const now = timeState.currentDate;
        const eg =
            typeof window !== 'undefined' && window.EarthGlobe ? window.EarthGlobe : null;
        const selInstant =
            typeof window !== 'undefined' && typeof window.getSelectedDateTime === 'function'
                ? window.getSelectedDateTime()
                : now;
        // Hour dial + red/cyan hands share browser-local orbital clock (not observer-lon solar index).
        const selectedHour =
            currentHourInDay !== undefined && currentHourInDay !== null
                ? ((currentHourInDay % 24) + 24) % 24
                : timeState.selectedHourInDay !== undefined
                  ? ((timeState.selectedHourInDay % 24) + 24) % 24
                  : sceneClockHourIndex(selInstant, null, eg);
        const currentHour = sceneClockHourIndex(now, null, eg);
        return { selectedHour, currentHour };
    }
    
    function createHourSystem(earthDistance, timeState, zoomLevel) {
        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        if (!earth) return;
        
        // Get Earth's actual 3D position from the mesh
        const earthPlanet = planetMeshes.find(p => p.userData.name === 'Earth');
        if (!earthPlanet) return;
        
        const earthX = earthPlanet.position.x;
        const earthY = earthPlanet.position.y;
        const earthZ = earthPlanet.position.z;
        
        // Get Earth's orbital angle for calculating Sun direction
        const earthOrbitalAngle = earth.startAngle;
        
        // Calculate Sun-to-Earth direction (this is where noon points - closest to Sun)
        // Use orbital angle to determine direction from Sun (at origin) to Earth
        const sunToEarthAngle = Math.atan2(earthZ, earthX);
        
        // Spiral parameters - wrap around Earth
        const spiralRadius = getSystemRadii('hour', earthDistance).spiral;
        // Day height: 24 hours = 0.00274 years = 0.274 units
        const dayHeight = ZOOM_LEVELS[zoomLevel].timeYears * 100;
        const spiralHeight = dayHeight; // Only the height of one day
        const spiralTurns = 1; // One full turn for 24 hours
        
        // Center the spiral around Earth's current Y position
        const spiralCenterY = earthY;
        
        const now = timeState.currentDate;
        const eg =
            typeof window !== 'undefined' && window.EarthGlobe ? window.EarthGlobe : null;
        const selInstant =
            typeof window !== 'undefined' && typeof window.getSelectedDateTime === 'function'
                ? window.getSelectedDateTime()
                : now;
        const { selectedHour, currentHour } = getSceneHourHighlightIndices(
            timeState,
            zoomLevel,
            sunToEarthAngle,
            earthPlanet
        );
        
        // Get day offsets from timeState for blue highlighting logic
        const dayOffset = timeState.selectedDayOffset || 0;
        const hourOffset = timeState.selectedHourOffset || 0; // In Zoom 8/9, this represents days
        
        // Create spiral curve for the day progression
        // The spiral wraps around Earth, starting at midnight (0) farthest from Sun
        const spiralPoints = [];
        const numSpiralPoints = 200;
        for (let i = 0; i <= numSpiralPoints; i++) {
            const t = i / numSpiralPoints;
            // Hour angle: 0 = midnight (farthest from Sun), 12 = noon (closest to Sun)
            // Clockwise when viewed from below South Pole
            const hourAngle = (t * 24) % 24;
            const hourRadians = (hourAngle / 24) * Math.PI * 2;
            
            // Position: 0 (midnight) is opposite Sun, 12 (noon) is toward Sun
            // Rotate 180 degrees: midnight (0) starts opposite Sun, noon (12) is towards Sun
            // Add Math.PI to rotate so hour 0 is opposite Sun (not towards it)
            const angle = sunToEarthAngle + hourRadians; // Start at midnight (opposite Sun)
            
            // Spiral radius varies slightly for visual effect
            const radius = spiralRadius * (1 + t * 0.1);
            
            // Height follows the spiral, centered around Earth's Y position
            const height = spiralCenterY + (t * spiralHeight) - (spiralHeight / 2);
            
            // Position relative to Earth's center
            const x = earthX + Math.cos(angle) * radius;
            const z = earthZ + Math.sin(angle) * radius;
            const y = height;
            
            spiralPoints.push(x, y, z);
        }
        
        // Create spiral curve
        const spiralGeometry = new THREE.BufferGeometry();
        spiralGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spiralPoints, 3));
        const spiralMaterial = new THREE.LineBasicMaterial({
            color: getMarkerColor(),
            transparent: true,
            opacity: 0.5,
            linewidth: 2
        });
        const spiral = new THREE.Line(spiralGeometry, spiralMaterial);
        spiral.renderOrder = 4;
        scene.add(spiral);
        timeMarkers.push(spiral);
        
        // Create 24 hour labels positioned along the spiral
        for (let hour = 0; hour < 24; hour++) {
            // Calculate position along spiral for this hour
            const t = hour / 24;
            // Position on dial: observer meridian clock when lon known (matches red/cyan hands).
            const angleFromEarth = hourLabelAngleFromEarth(hour, sunToEarthAngle);
            
            const radiusFromEarth = spiralRadius; // Slightly outside spiral for labels
            const height = spiralCenterY + (t * spiralHeight) - (spiralHeight / 2);
            
            // Calculate position relative to Earth's center
            const offsetX = Math.cos(angleFromEarth) * radiusFromEarth;
            const offsetZ = Math.sin(angleFromEarth) * radiusFromEarth;
            
            // Convert to absolute position (relative to Sun/origin)
            const x = earthX + offsetX;
            const z = earthZ + offsetZ;
            const y = height;
            
            // Calculate angle and radius relative to origin (Sun) for createTextLabel
            const labelAngle = Math.atan2(z, x);
            const labelRadius = Math.sqrt(x * x + z * z);
            
            // Determine if this hour is current or selected
            const isCurrent = hour === currentHour;
            const isSelected = hour === selectedHour;
            // Check for offset: hour difference OR day offset (selectedDayOffset or selectedHourOffset)
            // selectedHourOffset represents days in Zoom 8/9, so if it's non-zero, we're on a different day
            const hasHourOffset = selectedHour !== currentHour;
            const hasDayOffset = (dayOffset !== 0) || (hourOffset !== 0);
            const hasOffset = hasHourOffset || hasDayOffset;
            
            // Color logic
            const labelColor = isCurrent ? 'red' : (hasOffset && isSelected ? 'blue' : false);
            
            // Create hour label (no leading zeros)
            const hourLabel = hour.toString();
            
            // Reduce hour label size (use 0.6 multiplier for smaller labels)
            createTextLabel(hourLabel, y, labelRadius, zoomLevel, labelAngle, labelColor, false, 0.8);
        }

        createQuarterHourTickMarks(
            earthX,
            earthY,
            earthZ,
            sunToEarthAngle,
            spiralRadius,
            spiralCenterY,
            spiralHeight
        );
        
        // Landing / day / clock: Earth hour hands (red = now, blue = selected) come from EarthGlobe in main.js.
        if (zoomLevel !== 0 && zoomLevel !== 8 && zoomLevel !== 9) {
            // Thin red spoke: wall-clock hour on the spiral (not navigation selected hour).
            const hourToDisplay = currentHour;
            const currentT = hourToDisplay / 24;
            const currentHourRadians = (hourToDisplay / 24) * Math.PI * 2;
            const currentAngleFromEarth = sunToEarthAngle - currentHourRadians;
            const currentRadiusFromEarth = spiralRadius;
            const currentHeight = spiralCenterY + (currentT * spiralHeight) - (spiralHeight / 2);

            // Calculate current hour position relative to Earth's center
            const currentOffsetX = Math.cos(currentAngleFromEarth) * currentRadiusFromEarth;
            const currentOffsetZ = Math.sin(currentAngleFromEarth) * currentRadiusFromEarth;

            // Convert to absolute position
            const currentHourX = earthX + currentOffsetX;
            const currentHourZ = earthZ + currentOffsetZ;
            const currentHourY = currentHeight;

            // Create line from Earth's center to current hour
            const lineGeometry = new THREE.BufferGeometry();
            const linePoints = [
                earthX, earthY, earthZ,  // Start at Earth's center
                currentHourX, currentHourY, currentHourZ  // End at current hour position
            ];
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));

            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xFF0000, // RED - matches current hour label
                transparent: true,
                opacity: 0.8,
                linewidth: 2
            });
            const currentHourLine = new THREE.Line(lineGeometry, lineMaterial);
            currentHourLine.renderOrder = 4;
            scene.add(currentHourLine);
            timeMarkers.push(currentHourLine);
        }
    }

    // ============================================
    // MAIN ENTRY POINT
    // ============================================
    
    function createTimeMarkers(zoomLevel, options) {
        timeMarkers.forEach(m => scene.remove(m));
        timeMarkers.length = 0;

        if (options && options.tourHideAll === true) {
            return;
        }
        
        const fullYearScope = options && options.fullYearScope === true;
        if (fullYearScope) {
            // When full-year scope is enabled we only change how days are generated;
            // all other units (year/quarter/month/week) are driven purely by zoom.
            _fullYearYear = currentYear != null ? currentYear : getTimeState(zoomLevel).selectedYear;
            _fullYearScope = true;
        }
        try {
            if (!ZOOM_LEVELS[zoomLevel]) return;
            const earthPlanet = planetMeshes.find(p => p.userData.name === 'Earth');
            const earthDistance = earthPlanet ? earthPlanet.userData.distance : 50;
            const timeState = getTimeState(zoomLevel);
            if (fullYearScope) {
                // Keep the selected year in sync with the year used for full-year day markers.
                timeState.selectedYear = _fullYearYear;
            }

            const tourMarkerStaged = options && options.tourYearMarkerStaged === true;
            const tourProgressiveMs =
                options && typeof options.tourProgressiveMarkerDateMs === 'number' && !isNaN(options.tourProgressiveMarkerDateMs)
                    ? options.tourProgressiveMarkerDateMs
                    : null;
            const tourMarkerDensity = (options && options.tourMarkerDensity) || 'all';

            if (zoomLevel === 1) {
                createCenturyMarkers(timeState);
            } else if (zoomLevel === 2) {
                createDecadeMarkers(timeState);
            } else if (zoomLevel >= 3) {
                createYearMarker(timeState, zoomLevel, tourMarkerStaged, tourProgressiveMs);
                createQuarterSystem(earthDistance, timeState, zoomLevel, tourMarkerStaged, tourProgressiveMs);
                if (tourMarkerDensity !== 'quarters') {
                    createMonthSystem(earthDistance, timeState, zoomLevel, tourMarkerStaged, tourProgressiveMs);
                }
            }
            if (zoomLevel >= 4 && (tourMarkerDensity === 'all' || tourMarkerDensity === 'weeks' || tourMarkerDensity === 'days')) {
                createWeekSystem(earthDistance, timeState, zoomLevel);
            }
            // Full-year scope only affects the day system (whole-year days vs quarter/month scope).
            if ((zoomLevel >= 6 || fullYearScope) && (tourMarkerDensity === 'all' || tourMarkerDensity === 'days')) {
                createDaySystem(earthDistance, timeState, fullYearScope ? 7 : zoomLevel);
            }
            if (zoomLevel === 8 || zoomLevel === 9) {
                createHourSystem(earthDistance, timeState, zoomLevel);
            }
        } finally {
            if (fullYearScope) {
                _fullYearScope = false;
                _fullYearYear = null;
            }
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
        selectedHourOffset = newOffsets.selectedHourOffset || 0;
        currentYear = newOffsets.currentYear !== undefined ? newOffsets.currentYear : currentYear; // Update currentYear when A/D is pressed
        currentMonth = newOffsets.currentMonth;
        currentMonthInYear = newOffsets.currentMonthInYear !== undefined ? newOffsets.currentMonthInYear : currentMonthInYear;
        currentWeekInMonth = newOffsets.currentWeekInMonth;
        currentQuarter = newOffsets.currentQuarter;
        currentDayInWeek = newOffsets.currentDayInWeek;
        currentDayOfMonth = newOffsets.currentDayOfMonth !== undefined ? newOffsets.currentDayOfMonth : currentDayOfMonth;
        currentHourInDay = newOffsets.currentHourInDay; // Update currentHourInDay when A/D is pressed
    }

    /**
     * Numeric radii for all marker bands at Earth distance W (single source for event-renderer and list UI).
     */
    function getCanonicalRadialZones(earthDistance) {
        if (isSingularBandModeActive()) {
            return getSingularRadialZones(earthDistance);
        }
        const W = typeof earthDistance === 'number' && !isNaN(earthDistance) ? earthDistance : 50;
        return {
            quarter: {
                outer: RADII_CONFIG.quarter.outer(W),
                inner: RADII_CONFIG.quarter.inner(),
                label: RADII_CONFIG.quarter.label(W)
            },
            month: {
                outer: RADII_CONFIG.month.outer(W),
                inner: RADII_CONFIG.month.inner(W),
                label: RADII_CONFIG.month.label(W)
            },
            week: {
                outer: RADII_CONFIG.week.outer(W),
                inner: RADII_CONFIG.week.inner(W),
                label: RADII_CONFIG.week.label(W)
            },
            day: {
                outer: RADII_CONFIG.day.outer(W),
                inner: RADII_CONFIG.day.inner(W),
                label: RADII_CONFIG.day.label(W),
                dayName: RADII_CONFIG.day.dayName(W)
            },
            hour: {
                spiral: RADII_CONFIG.hour.spiral(W)
            }
        };
    }

    /**
     * List-context annulus radii aligned to the active zoom’s time-marker band (inner/outer curves).
     * Singular demo: one grain-wide band; Year/Quarter use the Earth-orbit spine (day band)
     * so Context Arc stays centered on W and does not span multiple grains.
     * Classic: z5 Month / z6 Lunar month band; z7 week; z8–9 day; etc.
     */
    /**
     * Classic onion Context Arc radii by zoom — always (even when singular LTE day-spine sky is on).
     * Simple blue hoop sits sunward of Earth; Earth / Event Horizon stay outside the LTE day frame.
     */
    function getClassicListContextRingRadiiForZoom(zoomLevel, earthDistance) {
        const W = typeof earthDistance === 'number' && !isNaN(earthDistance) ? earthDistance : 50;
        const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
        const zr = z === 0 ? 9 : z;
        const classic = {
            quarter: { outer: W / 4, label: W / 6 },
            month: { outer: W / 2, inner: W / 4 },
            week: { outer: W * 5 / 8, inner: W / 2 },
            day: { outer: W * 3 / 4, inner: W * 5 / 8 }
        };
        let rInner;
        let rOuter;
        if (zr <= 0) {
            rInner = classic.day.inner;
            rOuter = classic.day.inner;
        } else if (zr <= 2) {
            rInner = classic.quarter.label;
            rOuter = classic.quarter.outer;
        } else if (z === 3 || z === 4) {
            rInner = classic.quarter.outer;
            rOuter = classic.month.outer;
        } else if (z === 5 || z === 6) {
            rInner = classic.month.inner;
            rOuter = classic.month.outer;
        } else if (z === 7) {
            rInner = classic.week.inner;
            rOuter = classic.week.outer;
        } else {
            rInner = classic.day.inner;
            rOuter = classic.day.outer;
        }
        const rMax = z >= 8 ? W * 0.998 : W * 0.92;
        rOuter = Math.max(W * 0.08, Math.min(rOuter, rMax));
        rInner = Math.max(W * 0.06, Math.min(rInner, rOuter - W * 0.02));
        if (rInner >= rOuter - W * 0.002) {
            rInner = Math.max(W * 0.06, rOuter - Math.max(W * 0.02, (rOuter - rInner) || W * 0.02));
        }
        return { rInner, rOuter };
    }

    /**
     * List-context annulus radii aligned to the active zoom’s time-marker band (inner/outer curves).
     * Singular demo: one grain-wide band; Year/Quarter use the Earth-orbit spine (day band)
     * so Context Arc stays centered on W and does not span multiple grains.
     * Classic: z5 Month / z6 Lunar month band; z7 week; z8–9 day; etc.
     */
    function getListContextRingRadiiForZoom(zoomLevel, earthDistance) {
        const W = typeof earthDistance === 'number' && !isNaN(earthDistance) ? earthDistance : 50;
        const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
        const zr = z === 0 ? 9 : z;
        const zones = getCanonicalRadialZones(W);
        const singular = isSingularBandModeActive();
        let rInner;
        let rOuter;
        if (singular) {
            // LTE day-spine sky: midnight (inner) → end of day (outer).
            const day = getEarthOrbitL1L2DayFrameRadii(W);
            rInner = day.inner;
            rOuter = day.outer;
        } else if (zr <= 0) {
            rInner = zones.day.inner;
            rOuter = zones.day.inner;
        } else if (zr <= 2) {
            rInner = zones.quarter.label;
            rOuter = zones.quarter.outer;
        } else if (z === 3 || z === 4) {
            rInner = zones.quarter.outer;
            rOuter = zones.month.outer;
        } else if (z === 5 || z === 6) {
            rInner = zones.month.inner;
            rOuter = zones.month.outer;
        } else if (z === 7) {
            rInner = zones.week.inner;
            rOuter = zones.week.outer;
        } else {
            rInner = zones.day.inner;
            rOuter = zones.day.outer;
        }
        const rMax = z >= 8 ? W * 0.998 : W * 0.92;
        const dayHalf = singular ? getCircadianNoonMidnightHalfSpan(W) : 0;
        const rMaxEff = singular ? Math.max(rMax, W + dayHalf * 1.02) : rMax;
        const minGap = singular ? Math.max(dayHalf * 0.5, W * 0.02) : W * 0.02;
        rOuter = Math.max(W * 0.08, Math.min(rOuter, rMaxEff));
        rInner = Math.max(W * 0.06, Math.min(rInner, rOuter - minGap));
        if (rInner >= rOuter - W * 0.002) {
            rInner = Math.max(W * 0.06, rOuter - Math.max(minGap, (rOuter - rInner) || minGap));
        }
        return { rInner, rOuter };
    }

    /** @deprecated Use {@link getListContextRingRadiiForZoom}; returns outer radius only. */
    function getListContextRingRadiusForZoom(zoomLevel, earthDistance) {
        return getListContextRingRadiiForZoom(zoomLevel, earthDistance).rOuter;
    }

    return {
        init,
        createTimeMarkers,
        updateOffsets,
        getListContextRingRadiusForZoom,
        getListContextRingRadiiForZoom,
        getClassicListContextRingRadiiForZoom,
        getCanonicalRadialZones,
        getSingularRadialZones,
        getEarthOrbitL1L2DayFrameRadii,
        getSystemRadii,
        applyLteDayFrameEventHorizonWarp
    };
})();
