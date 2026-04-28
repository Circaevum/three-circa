/**
 * Astro time-scale helpers (UTC/JD/TT/TDB-lite).
 * Lightweight scaffold for future high-precision ephemerides.
 */
const AstroTimeScales = (function() {
    const JD_UNIX_EPOCH = 2440587.5;
    const MS_PER_DAY = 86400000;

    function dateToJulianDate(date) {
        const t = date instanceof Date ? date.getTime() : Date.now();
        return (t / MS_PER_DAY) + JD_UNIX_EPOCH;
    }

    function julianDateToDate(jd) {
        return new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY);
    }

    // Placeholder constants (sufficient for current visualization scaffolding).
    function utcToTtJulianDate(date) {
        const jdUtc = dateToJulianDate(date);
        const deltaSeconds = 69.184; // ~TAI-UTC + 32.184s (approx)
        return jdUtc + (deltaSeconds / 86400);
    }

    function ttToTdbJulianDate(jdTt) {
        // For current usage, TT ~= TDB.
        return jdTt;
    }

    return {
        MS_PER_DAY,
        dateToJulianDate,
        julianDateToDate,
        utcToTtJulianDate,
        ttToTdbJulianDate
    };
})();
