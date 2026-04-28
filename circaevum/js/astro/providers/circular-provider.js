/**
 * Circular-orbit provider.
 * Matches current app behavior while exposing an ephemeris-like interface.
 */
const CircularEphemerisProvider = (function() {
    function getPlanetDataByName(name) {
        if (!Array.isArray(PLANET_DATA)) return null;
        return PLANET_DATA.find(p => p && p.name === name) || null;
    }

    function getYearsFromNow(date) {
        const now = Date.now();
        const t = date instanceof Date ? date.getTime() : now;
        return (t - now) / (365.2425 * 86400000);
    }

    function getHeliocentricPosition(bodyName, date) {
        const body = getPlanetDataByName(bodyName);
        if (!body) return { x: 0, y: 0, z: 0 };
        const years = getYearsFromNow(date);
        const angle = body.startAngle - ((years / body.orbitalPeriod) * Math.PI * 2);
        return {
            x: Math.cos(angle) * body.distance,
            // Keep heliocentric orbital plane in x/y like Astronomy Engine + Kepler providers.
            y: Math.sin(angle) * body.distance,
            z: 0
        };
    }

    return {
        name: 'circular',
        getHeliocentricPosition
    };
})();

if (typeof window !== 'undefined') {
    window.CircularEphemerisProvider = CircularEphemerisProvider;
}
