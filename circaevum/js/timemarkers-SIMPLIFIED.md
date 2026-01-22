# Simplified Time Markers - Single File Approach

## Goal: Reduce from 2,153 lines to ~600-800 lines

## Key Simplifications

### 1. Declarative System Definitions
Instead of separate functions for each system, use simple config objects:

```javascript
const SYSTEMS = {
    quarter: {
        unitType: 'quarter',
        unitsPerYear: 4,
        names: ['Q1', 'Q2', 'Q3', 'Q4'],
        getDate: (index, year) => new Date(year, index * 3, 1),
        getRadii: (zoom, dist) => zoom >= 4 
            ? { outer: dist/3, inner: null, label: dist/6 }
            : { outer: dist*0.5, inner: null, label: dist*0.25 }
    },
    month: {
        unitType: 'month',
        unitsPerYear: 12,
        names: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        getDate: (index, year) => new Date(year, index, 1),
        getRadii: (zoom, dist) => zoom >= 4
            ? { outer: dist*2/3, inner: dist/3, label: dist*0.5 }
            : { outer: dist*0.75, inner: dist*0.5, label: dist*0.75 }
    },
    // ... week, day
};
```

### 2. Unified Offset/Color Calculation
One simple function instead of repeated logic:

```javascript
function getUnitState(unit, system, timeState) {
    const now = timeState.currentDate;
    const unitDate = system.getDate(unit.index, unit.year);
    
    // Simple current check
    const isCurrent = unitDate.getFullYear() === now.getFullYear() &&
                     unitDate.getMonth() === now.getMonth() &&
                     (system.unitType === 'day' ? unitDate.getDate() === now.getDate() : true);
    
    // Simple selected check
    const isSelected = unit.index === timeState.selected[system.unitType] &&
                      unit.year === timeState.selectedYear;
    
    // Simple offset check
    const hasOffset = timeState[`selected${system.unitType}Offset`] !== 0 ||
                     (system.unitType === 'month' && timeState.selectedMonth !== now.getMonth());
    
    return { isCurrent, isSelected, hasOffset };
}
```

### 3. Simplified createTimeFrame
Reduce from 536 lines to ~150 lines:

```javascript
function createTimeFrame(system, zoomLevel, earthDistance, timeState) {
    const radii = system.getRadii(zoomLevel, earthDistance);
    const units = getUnitsToShow(system, zoomLevel, timeState);
    
    // Create lines
    units.forEach((unit, i) => {
        const unitDate = system.getDate(unit.index, unit.year);
        const height = calculateDateHeight(unitDate);
        const angle = calculateAngle(height, timeState.currentDateHeight);
        const state = getUnitState(unit, system, timeState);
        
        // Check previous unit for both-sides coloring
        const prevUnit = i > 0 ? units[i-1] : null;
        const prevState = prevUnit ? getUnitState(prevUnit, system, timeState) : null;
        
        // Create line
        createLine(angle, height, radii, state, prevState);
        
        // Create label if needed
        if (shouldShowLabel(system, zoomLevel)) {
            createLabel(angle, height, radii.label, system.names[unit.index], state);
        }
    });
}
```

### 4. Simplified Time State
Instead of complex per-zoom logic, use simple calculations:

```javascript
function getTimeState(zoomLevel) {
    const now = new Date();
    const currentHeight = calculateCurrentDateHeight();
    
    // Simple selected time calculation
    const selected = {
        year: now.getFullYear() + selectedYearOffset,
        quarter: currentQuarter + selectedQuarterOffset,
        month: now.getMonth() + (selectedWeekOffset || 0), // Simplified
        // ... etc
    };
    
    return {
        currentDate: now,
        currentDateHeight: currentHeight,
        selected,
        selectedYearOffset,
        // ... offsets
    };
}
```

### 5. Remove Duplicate Helpers
- Remove `extractUnitInfo` - just handle directly
- Remove `getVisibleParentUnits` - inline simple logic
- Remove `expandQuartersToMonths` - inline
- Remove `createParentUnitCurvesForUnits` - simplify curve creation
- Remove complex "previous unit" calculation - just check array index

### 6. Simplified Moon Phases
Keep it simple - just create sprites for visible days:

```javascript
function createMoonPhases(earthDistance, timeState) {
    const days = getVisibleDays(timeState);
    days.forEach(day => {
        const phase = calculateMoonPhase(day);
        createMoonSprite(day, phase, earthDistance * 0.89);
    });
}
```

## Estimated Line Count

- System definitions: ~100 lines
- Unified helpers: ~150 lines
- createTimeFrame: ~150 lines
- System creation functions: ~200 lines
- Moon phases: ~100 lines
- Time state: ~50 lines
- Main entry: ~50 lines
- **Total: ~800 lines** (down from 2,153)

## Benefits

1. **Much simpler** - No complex helper chains
2. **Easier to read** - Declarative configs instead of functions
3. **Less duplication** - Unified logic
4. **Easier to modify** - Change system config, not functions
5. **Still one file** - No file splitting needed
