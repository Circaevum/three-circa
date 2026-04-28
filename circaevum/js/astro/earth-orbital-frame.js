/**
 * Earth orbital frame (R/T/N) from heliocentric states.
 */
const EarthOrbitalFrame = (function() {
    function normalize(v) {
        const m = Math.hypot(v.x, v.y, v.z) || 1;
        return { x: v.x / m, y: v.y / m, z: v.z / m };
    }

    function dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    function cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    function subtract(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }

    function buildFromEarthState(earthPos, earthVelHint) {
        const R = normalize(earthPos);
        const vel = earthVelHint || { x: -earthPos.z, y: 0, z: earthPos.x };
        const vr = dot(vel, R);
        const tangential = subtract(vel, { x: R.x * vr, y: R.y * vr, z: R.z * vr });
        const T = normalize(tangential);
        const N = normalize(cross(R, T));
        return { R, T, N };
    }

    function projectToFrame(vector, frame) {
        return {
            r: dot(vector, frame.R),
            t: dot(vector, frame.T),
            n: dot(vector, frame.N)
        };
    }

    return {
        buildFromEarthState,
        projectToFrame
    };
})();
