/**
 * Astronomy Engine provider.
 * Requires global `Astronomy` (https://www.npmjs.com/package/astronomy-engine).
 */
const AstronomyEngineProvider = (function() {
    function getScaleUnitsPerAu() {
        if (!Array.isArray(PLANET_DATA)) return 50;
        const earth = PLANET_DATA.find(p => p && p.name === 'Earth');
        return earth && typeof earth.distance === 'number' ? earth.distance : 50;
    }

    function isAvailable() {
        return typeof Astronomy !== 'undefined' && Astronomy && typeof Astronomy.HelioVector === 'function';
    }

    function getHeliocentricPosition(bodyName, date) {
        if (!isAvailable()) return { x: 0, y: 0, z: 0 };
        const d = date instanceof Date ? date : new Date();
        const vec = Astronomy.HelioVector(bodyName, d);
        const s = getScaleUnitsPerAu();
        return {
            x: vec.x * s,
            y: vec.y * s,
            z: vec.z * s
        };
    }

    return {
        name: 'astronomy-engine',
        isAvailable,
        getHeliocentricPosition
    };
})();

if (typeof window !== 'undefined') {
    window.AstronomyEngineProvider = AstronomyEngineProvider;
}
