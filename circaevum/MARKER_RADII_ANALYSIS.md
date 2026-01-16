# Time Marker Radii Analysis

## Base Marker Radii (Lines 487-490)
These define the outer extent of marker lines for each zoom level:
- `quarterMarkerRadius = earthDistance * 0.5` (25 units)
- `monthMarkerRadius = earthDistance * 0.75` (37.5 units)
- `weekMarkerRadius = earthDistance * 0.875` (43.75 units)
- `dayMarkerRadius = earthDistance * 0.9375` (46.875 units)

## Label Radii (Scattered Throughout Code)

### Year View (Zoom Level 3)
- Year label: `earthDistance * 1.4` (line 803)
- Month names: `earthDistance * 1.15` (line 842)

### Quarter View (Zoom Level 4)
- Quarter label: 
  - `markerRadius * 0.35` when called from higher zoom (line 940)
  - `markerRadius * 1.4` when standalone (line 940)
- Month names within quarter: `markerRadius * 1.15` (line 982)
- Tick marks: `earthDistance * 0.9` to `earthDistance` (lines 1064-1065)

### Month View (Zoom Level 5)
- Month label:
  - `markerRadius * 0.45` when called from week view (line 1149)
  - `markerRadius * 1.4` when standalone (line 1149)
- Week labels: `markerRadius * 0.7` (line 1239)
- Day number labels: `markerRadius * 0.85` (lines 1370, 1373)
- Day tick marks: `markerRadius * 0.95` to `markerRadius` (lines 1338-1339)

### Lunar Cycle View (Zoom Level 6)
- Lunar cycle label: `earthDistance * 1.4` (line 1412)

### Week View (Zoom Level 7)
- Month label: `markerRadius * 0.5` (line 1722)
- Week label: `markerRadius * 0.6` (line 1735)
- Day names (outside): `markerRadius * 1.15` (selected) or `markerRadius * 1.1` (normal) (lines 1792, 1796)
- Day numbers (inside): `markerRadius * 0.75` (lines 1793, 1797)

## Selection Arc Radii
- Day selection: `innerRadiusFactor = 0.8`, `outerRadiusFactor = 1.2` (line 1688)
- Week selection: `innerRadiusFactor = 0.75`, `outerRadiusFactor = 1.25` (line 1691)

## Issues Identified

1. **Inconsistent Base References**: Some labels use `earthDistance` directly (year, lunar), others use `markerRadius` (quarter, month, week, day)

2. **Inconsistent Multipliers**: Similar label types use different multipliers:
   - Quarter label: 0.35 or 1.4
   - Month label: 0.45 or 1.4
   - Week label: 0.6 or 0.7
   - Day labels: 0.75, 0.85, 1.1, 1.15

3. **Hardcoded Values**: Many radius multipliers are hardcoded throughout the code instead of being defined as constants

4. **Conditional Logic**: Label positions change based on context (skipMonthLabels, skipWeekLabels), making it hard to track all possible values

## Recommendation

All radius values should be:
1. Defined as constants at the top of `createTimeMarkers` function
2. Use consistent base reference (either all `earthDistance` or all `markerRadius`)
3. Organized by marker type and zoom level
4. Documented with their purpose
