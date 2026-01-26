/**
 * Circaevum DateTime Module
 * Date initialization and time-to-height calculations
 * 
 * This module contains:
 * - System date initialization
 * - Derived date values (quarter, week, etc.)
 * - Height calculations for time positions
 * - Date progress calculations
 * 
 * Dependencies: config.js (CENTURY_START, ZOOM_LEVELS)
 */

// ============================================
// CURRENT DATE STATE
// ============================================

// Initialize current date from system
const now = new Date();

// Primary date values from system
let currentYear = now.getFullYear();
let currentMonthInYear = now.getMonth(); // 0-11
let currentDayOfMonth = now.getDate(); // 1-31
let currentHourInDay = now.getHours(); // 0-23

// Derived date values
let currentQuarter = Math.floor(currentMonthInYear / 3); // 0-3 for Q1-Q4
let currentMonth = currentMonthInYear % 3; // Month within quarter (0-2)
let currentDayInWeek = now.getDay(); // 0=Sunday, 6=Saturday

// Calculate which calendar week of the month we're in (based on Sundays)
// Find the first Sunday of the month (or count from Sunday before the 1st)
const firstOfMonth = new Date(currentYear, currentMonthInYear, 1);
const firstSundayOffset = -firstOfMonth.getDay(); // Days to go back to get Sunday (0 if 1st is Sunday)
let currentWeekInMonth = Math.floor((currentDayOfMonth - 1 - firstSundayOffset) / 7);


// ============================================
// NAVIGATION OFFSET STATE
// ============================================

// Navigation offsets (initially zero - at current time)
let selectedYearOffset = 0;
let selectedQuarterOffset = 0;
let selectedWeekOffset = 0;
let selectedDayOffset = 0;
let selectedHourOffset = 0;
let selectedLunarOffset = 0;
let selectedDecadeOffset = 0;

// ============================================
// HEIGHT CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate height (Y position) for a given year
 * Height is measured from year 2000 (CENTURY_START)
 * 
 * @param {number} year - The year to calculate height for
 * @param {number} zoomLevel - Current zoom level (unused but kept for API consistency)
 * @returns {number} Height in scene units (100 units per year)
 */
function getHeightForYear(year, zoomLevel) {
    const yearsSinceCenturyStart = year - CENTURY_START;
    const heightPerYear = HEIGHT_PER_YEAR; // 100 units per year (from config.js)
    return yearsSinceCenturyStart * heightPerYear;
}

/**
 * Calculate the precise current date height including month, day, and hour
 * @returns {number} Height in scene units
 */
function calculateCurrentDateHeight() {
    const yearHeight = HEIGHT_PER_YEAR;
    const baseYearHeight = getHeightForYear(currentYear, 1);
    
    // Get days in current month
    const daysInCurrentMonth = getDaysInMonth(currentYear, currentMonthInYear);
    
    // Calculate fractional progress through the year
    const monthProgress = currentMonthInYear / 12;
    const dayProgress = (currentDayOfMonth - 1) / (daysInCurrentMonth * 12);
    const hourProgress = currentHourInDay / (24 * daysInCurrentMonth * 12);
    
    const totalYearProgress = monthProgress + dayProgress + hourProgress;
    
    return baseYearHeight + (totalYearProgress * yearHeight);
}

/**
 * Calculate height for a specific date
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} day - Day of month (1-31)
 * @param {number} hour - Hour (0-23)
 * @returns {number} Height in scene units
 */
function calculateDateHeight(year, month, day, hour = 0) {
    const yearHeight = HEIGHT_PER_YEAR;
    const baseYearHeight = getHeightForYear(year, 1);
    
    const daysInMonth = getDaysInMonth(year, month);
    
    const monthProgress = month / 12;
    const dayProgress = (day - 1) / (daysInMonth * 12);
    const hourProgress = hour / (24 * daysInMonth * 12);
    
    const totalYearProgress = monthProgress + dayProgress + hourProgress;
    
    return baseYearHeight + (totalYearProgress * yearHeight);
}

/**
 * Calculate year progress (0.0 to 1.0) for a given date
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} day - Day of month (1-31)
 * @param {number} hour - Hour (0-23, optional, defaults to 0)
 * @returns {number} Fraction of year elapsed (0.0 to 1.0)
 */
function calculateYearProgressForDate(year, month, day, hour = 0) {
    const daysInMonth = getDaysInMonth(year, month);
    const yearProgress = (month + (day - 1) / daysInMonth + hour / (24 * daysInMonth)) / 12;
    return yearProgress;
}

/**
 * Calculate current date height from actual system date (bypasses navigated variables)
 * This is used for worldlines and other calculations that need the real current date
 * @returns {number} Height in scene units
 */
function calculateActualCurrentDateHeight() {
    const nowActual = new Date();
    return calculateDateHeight(
        nowActual.getFullYear(),
        nowActual.getMonth(),
        nowActual.getDate(),
        nowActual.getHours()
    );
}



