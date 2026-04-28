/**
 * Keplerian fallback provider (low-precision heliocentric ecliptic elements).
 * This is materially better than circular orbits and works without external CDNs.
 */
const KeplerEphemerisProvider = (function() {
    const DEG2RAD = Math.PI / 180;
    const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
    const MS_PER_DAY = 86400000;

    const ELEMENTS = {
        Mercury: { N0: 48.3313, Nd: 3.24587e-5, i0: 7.0047, id: 5.0e-8, w0: 29.1241, wd: 1.01444e-5, a0: 0.387098, ad: 0, e0: 0.205635, ed: 5.59e-10, M0: 168.6562, Md: 4.0923344368 },
        Venus:   { N0: 76.6799, Nd: 2.46590e-5, i0: 3.3946, id: 2.75e-8, w0: 54.8910, wd: 1.38374e-5, a0: 0.723330, ad: 0, e0: 0.006773, ed: -1.302e-9, M0: 48.0052, Md: 1.6021302244 },
        Earth:   { N0: 0, Nd: 0, i0: 0, id: 0, w0: 282.9404, wd: 4.70935e-5, a0: 1.000000, ad: 0, e0: 0.016709, ed: -1.151e-9, M0: 356.0470, Md: 0.9856002585 },
        Mars:    { N0: 49.5574, Nd: 2.11081e-5, i0: 1.8497, id: -1.78e-8, w0: 286.5016, wd: 2.92961e-5, a0: 1.523688, ad: 0, e0: 0.093405, ed: 2.516e-9, M0: 18.6021, Md: 0.5240207766 },
        Jupiter: { N0: 100.4542, Nd: 2.76854e-5, i0: 1.3030, id: -1.557e-7, w0: 273.8777, wd: 1.64505e-5, a0: 5.20256, ad: 0, e0: 0.048498, ed: 4.469e-9, M0: 19.8950, Md: 0.0830853001 },
        Saturn:  { N0: 113.6634, Nd: 2.38980e-5, i0: 2.4886, id: -1.081e-7, w0: 339.3939, wd: 2.97661e-5, a0: 9.55475, ad: 0, e0: 0.055546, ed: -9.499e-9, M0: 316.9670, Md: 0.0334442282 },
        Uranus:  { N0: 74.0005, Nd: 1.3978e-5, i0: 0.7733, id: 1.9e-8, w0: 96.6612, wd: 3.0565e-5, a0: 19.18171, ad: -1.55e-8, e0: 0.047318, ed: 7.45e-9, M0: 142.5905, Md: 0.011725806 },
        Neptune: { N0: 131.7806, Nd: 3.0173e-5, i0: 1.7700, id: -2.55e-7, w0: 272.8461, wd: -6.027e-6, a0: 30.05826, ad: 3.313e-8, e0: 0.008606, ed: 2.15e-9, M0: 260.2471, Md: 0.005995147 }
    };

    function getScaleUnitsPerAu() {
        if (!Array.isArray(PLANET_DATA)) return 50;
        const earth = PLANET_DATA.find(p => p && p.name === 'Earth');
        return earth && typeof earth.distance === 'number' ? earth.distance : 50;
    }

    function daysSinceJ2000(date) {
        const t = date instanceof Date ? date.getTime() : Date.now();
        return (t - J2000_UTC_MS) / MS_PER_DAY;
    }

    function wrapDeg(d) {
        let x = d % 360;
        if (x < 0) x += 360;
        return x;
    }

    function solveEccentricAnomaly(Mrad, e) {
        let E = Mrad + e * Math.sin(Mrad) * (1 + e * Math.cos(Mrad));
        for (let i = 0; i < 8; i++) {
            const f = E - e * Math.sin(E) - Mrad;
            const fp = 1 - e * Math.cos(E);
            E = E - (f / (fp || 1));
        }
        return E;
    }

    function heliocentricAu(bodyName, date) {
        const el = ELEMENTS[bodyName];
        if (!el) return { x: 0, y: 0, z: 0 };
        const d = daysSinceJ2000(date);
        const N = (el.N0 + el.Nd * d) * DEG2RAD;
        const i = (el.i0 + el.id * d) * DEG2RAD;
        const w = (el.w0 + el.wd * d) * DEG2RAD;
        const a = el.a0 + el.ad * d;
        const e = el.e0 + el.ed * d;
        const M = wrapDeg(el.M0 + el.Md * d) * DEG2RAD;
        const E = solveEccentricAnomaly(M, e);
        const xv = a * (Math.cos(E) - e);
        const yv = a * (Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E));
        const v = Math.atan2(yv, xv);
        const r = Math.hypot(xv, yv);
        const vw = v + w;
        const cosN = Math.cos(N), sinN = Math.sin(N);
        const cosi = Math.cos(i), sini = Math.sin(i);
        const cosvw = Math.cos(vw), sinvw = Math.sin(vw);
        const out = {
            x: r * (cosN * cosvw - sinN * sinvw * cosi),
            y: r * (sinN * cosvw + cosN * sinvw * cosi),
            z: r * (sinvw * sini)
        };
        // These Earth elements are the classical "Sun's apparent orbit" set.
        // Convert to Earth heliocentric by reversing the vector.
        if (bodyName === 'Earth') {
            out.x = -out.x;
            out.y = -out.y;
            out.z = -out.z;
        }
        return out;
    }

    function getHeliocentricPosition(bodyName, date) {
        const au = heliocentricAu(bodyName, date instanceof Date ? date : new Date());
        const s = getScaleUnitsPerAu();
        return { x: au.x * s, y: au.y * s, z: au.z * s };
    }

    return {
        name: 'kepler',
        isAvailable: function() { return true; },
        getHeliocentricPosition
    };
})();

if (typeof window !== 'undefined') {
    window.KeplerEphemerisProvider = KeplerEphemerisProvider;
}
