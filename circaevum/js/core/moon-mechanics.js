/**
 * Circaevum core — Earth–Moon schematic mechanics (not to scale).
 *
 * Moon sits on a circle around Earth in the ecliptic (XZ) plane. The visible pedagogical Moon
 * uses the same mean-synodic phase as the lunar worldline ribbon (new/full geometry vs Sun),
 * so the sphere lies on the ribbon. For raw sidereal angle only, use moonXZAtHeight.
 *
 * Globals: SCENE_CONFIG (config.js), PLANET_DATA, HEIGHT_PER_YEAR (config.js), THREE (after three.min.js).
 */

const MoonMechanics = (function () {
    function cfg() {
        const m = typeof SCENE_CONFIG !== 'undefined' && SCENE_CONFIG.moonMechanics ? SCENE_CONFIG.moonMechanics : {};
        return {
            offsetFromEarth: typeof m.offsetFromEarth === 'number' ? m.offsetFromEarth : 10.75,
            sphereRadiusEarthFraction: typeof m.sphereRadiusEarthFraction === 'number' ? m.sphereRadiusEarthFraction : 0.28,
            sphereRadiusMin: typeof m.sphereRadiusMin === 'number' ? m.sphereRadiusMin : 1.02,
            dashOpacity: typeof m.dashOpacity === 'number' ? m.dashOpacity : 0.55,
            dashSize: typeof m.dashSize === 'number' ? m.dashSize : 2.5,
            dashGap: typeof m.dashGap === 'number' ? m.dashGap : 1.8,
            showZoomMin: typeof m.showZoomMin === 'number' ? m.showZoomMin : 2,
            showZoomMax: typeof m.showZoomMax === 'number' ? m.showZoomMax : 8,
            siderealOrbitDays: typeof m.siderealOrbitDays === 'number' ? m.siderealOrbitDays : 27.321661,
            orbitPhaseOffsetRad: typeof m.orbitPhaseOffsetRad === 'number' ? m.orbitPhaseOffsetRad : 0,
            orbitEpochUtcMs: typeof m.orbitEpochUtcMs === 'number' ? m.orbitEpochUtcMs : Date.UTC(2000, 0, 6, 18, 0, 0)
        };
    }

    const MS_PER_DAY = 86400000;

    /** Mean synodic month (ms); lunar worldline + A/D quarter steps share this grid. */
    const SYNODIC_MONTH_MS = 29.530588861 * 86400000;
    /** Reference new moon (UTC ms) for mean synodic phase. */
    const LUNATION_ANCHOR_UTC_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

    /**
     * Moon orbital angle (radians) in the ecliptic plane from calendar time.
     * @param {Date} atDate — same clock as SELECTED TIME / calculateDateHeight (local wall time).
     */
    function moonOrbitAngleRad(atDate) {
        if (!atDate || typeof atDate.getTime !== 'function' || isNaN(atDate.getTime())) return 0;
        const c = cfg();
        const days = (atDate.getTime() - c.orbitEpochUtcMs) / MS_PER_DAY;
        return (days / c.siderealOrbitDays) * Math.PI * 2 + c.orbitPhaseOffsetRad;
    }

    function getEarth() {
        return typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p.name === 'Earth') : null;
    }

    function heightPerYear() {
        return typeof HEIGHT_PER_YEAR !== 'undefined' ? HEIGHT_PER_YEAR : 100;
    }

    /**
     * Earth heliocentric angle (radians) at scene height, using same convention as planet meshes / worldlines.
     */
    function earthAngleAtHeight(height, currentDateHeight, earth) {
        if (!earth) return 0;
        const years = (height - currentDateHeight) / heightPerYear();
        return earth.startAngle - (years / earth.orbitalPeriod) * Math.PI * 2;
    }

    function earthXZAtHeight(height, currentDateHeight, earth) {
        const e = earth || getEarth();
        if (!e) return { x: 0, z: 0, angle: 0 };
        const ang = earthAngleAtHeight(height, currentDateHeight, e);
        const R = e.distance;
        return { x: Math.cos(ang) * R, z: Math.sin(ang) * R, angle: ang };
    }

    /**
     * Schematic Moon center in XZ: Earth at this scene height, Moon on a circle of radius `separation`
     * in the XZ plane; angle from `atDate` (sidereal month). Y is assigned separately by callers.
     * @param {number} [separation] — orbit radius in scene units
     * @param {Date} [atDate] — required for motion vs time; if omitted, angle 0 (Sunward +X from Earth)
     */
    function moonXZAtHeight(height, currentDateHeight, earth, separation, atDate) {
        const sep = separation != null ? separation : cfg().offsetFromEarth;
        const e = earth || getEarth();
        const exz = earthXZAtHeight(height, currentDateHeight, e);
        const theta = atDate ? moonOrbitAngleRad(atDate) : 0;
        return {
            x: exz.x + sep * Math.cos(theta),
            z: exz.z + sep * Math.sin(theta)
        };
    }

    /**
     * Moon XZ from mean synodic phase (Sun at origin): new = toward Sun, full = away, quarters at ±90°.
     * Use for the lunar worldline ribbon so new/full markers sit on conjunction / opposition geometry.
     */
    function moonXZSynodicAtHeight(height, currentDateHeight, earth, separation, atDate) {
        const sep = separation != null ? separation : cfg().offsetFromEarth;
        const e = earth || getEarth();
        const exz = earthXZAtHeight(height, currentDateHeight, e);
        const ex = exz.x;
        const ez = exz.z;
        const r = Math.hypot(ex, ez);
        const towardSunX = r < 1e-10 ? -1 : -ex / r;
        const towardSunZ = r < 1e-10 ? 0 : -ez / r;
        const perpX = -towardSunZ;
        const perpZ = towardSunX;
        let phase = 0;
        if (atDate && typeof atDate.getTime === 'function' && !isNaN(atDate.getTime())) {
            phase = ((atDate.getTime() - LUNATION_ANCHOR_UTC_MS) / SYNODIC_MONTH_MS) * Math.PI * 2;
        }
        const c = Math.cos(phase);
        const s = Math.sin(phase);
        return {
            x: ex + sep * (c * towardSunX + s * perpX),
            z: ez + sep * (c * towardSunZ + s * perpZ)
        };
    }

    function blendXZ(earthBlend, ex, ez, mx, mz) {
        const w = Math.max(0, Math.min(1, earthBlend));
        return {
            x: ex * w + mx * (1 - w),
            z: ez * w + mz * (1 - w)
        };
    }

    /**
     * Moon sphere + dashed Earth–Moon segment at selected time (for main Circaevum scene).
     * @returns {THREE.Object3D[]} objects added to scene (for removal on rebuild)
     */
    function addPedagogicalMoon(opts) {
        const T = opts.THREE;
        const out = [];
        if (!T || !opts.earthPlanet || !opts.flatGroup || !opts.sceneContentGroup) return out;

        const c = cfg();
        if (opts.zoomLevel < c.showZoomMin || opts.zoomLevel > c.showZoomMax) return out;

        const earth = getEarth();
        if (!earth) return out;

        const refH = opts.currentDateHeight;
        const selH = typeof opts.selectedDateHeight === 'number' ? opts.selectedDateHeight : refH;
        const isLightMode = !!opts.isLightMode;
        const planetScaleFactor = opts.planetScaleFactor != null ? opts.planetScaleFactor : 0.3;

        const earthPlanet = opts.earthPlanet;
        const earthRadius =
            earthPlanet.geometry && earthPlanet.geometry.parameters && earthPlanet.geometry.parameters.radius != null
                ? earthPlanet.geometry.parameters.radius
                : earth.size * planetScaleFactor;

        const selDate = opts.selectedDate instanceof Date && !isNaN(opts.selectedDate.getTime())
            ? opts.selectedDate
            : new Date();
        const { x: mex, z: mez } = moonXZSynodicAtHeight(selH, refH, earth, null, selDate);
        const moonR = Math.max(c.sphereRadiusMin, earthRadius * c.sphereRadiusEarthFraction);
        const moonGeo = new T.SphereGeometry(moonR, 24, 24);
        const moonMat = new T.MeshStandardMaterial({
            color: isLightMode ? 0x9ca3af : 0xb8c5d6,
            metalness: 0.2,
            roughness: 0.85,
            emissive: isLightMode ? 0x4b5563 : 0x2a3441,
            emissiveIntensity: 0.08
        });
        const moonMesh = new T.Mesh(moonGeo, moonMat);
        moonMesh.position.set(mex, selH, mez);
        moonMesh.userData = { type: 'MoonMechanics', role: 'pedagogicalMoon' };
        opts.sceneContentGroup.add(moonMesh);
        out.push(moonMesh);

        const { x: eex, z: eez } = earthXZAtHeight(selH, refH, earth);
        const dashGeom = new T.BufferGeometry();
        dashGeom.setAttribute('position', new T.Float32BufferAttribute([eex, selH, eez, mex, selH, mez], 3));
        const dashMat = new T.LineDashedMaterial({
            color: isLightMode ? 0x64748b : 0x94a3b8,
            transparent: true,
            opacity: c.dashOpacity,
            dashSize: c.dashSize,
            gapSize: c.dashGap
        });
        const dash = new T.Line(dashGeom, dashMat);
        dash.computeLineDistances();
        dash.userData = { type: 'MoonMechanics', role: 'earthMoonGuide' };
        opts.flatGroup.add(dash);
        out.push(dash);

        return out;
    }

    return {
        cfg,
        earthAngleAtHeight,
        earthXZAtHeight,
        moonOrbitAngleRad,
        moonXZAtHeight,
        moonXZSynodicAtHeight,
        blendXZ,
        addPedagogicalMoon,
        getOffset: function () {
            return cfg().offsetFromEarth;
        },
        SYNODIC_MONTH_MS,
        LUNATION_ANCHOR_UTC_MS
    };
})();

if (typeof window !== 'undefined') {
    window.MoonMechanics = MoonMechanics;
}
