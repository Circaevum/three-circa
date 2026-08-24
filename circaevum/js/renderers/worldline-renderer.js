/**
 * Worldlines Module
 * 
 * Creates helical worldlines for planets based on orbital mechanics.
 * Uses SceneGeometry utilities for consistent calculations.
 */

const Worldlines = (function() {
    // Dependencies (will be injected)
    let PLANET_DATA, ZOOM_LEVELS, SCENE_CONFIG;
    let calculateDateHeight, getHeightForYear, calculateCurrentDateHeight;
    let currentYear, isLightMode, getSelectedTimeColor;
    let SceneGeometry;
    let calculateYearProgressForDate, getDaysInMonth;
    let getSelectedDateTime;
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init(dependencies) {
        PLANET_DATA = dependencies.PLANET_DATA;
        ZOOM_LEVELS = dependencies.ZOOM_LEVELS;
        SCENE_CONFIG = dependencies.SCENE_CONFIG;
        calculateDateHeight = dependencies.calculateDateHeight;
        getHeightForYear = dependencies.getHeightForYear;
        calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
        currentYear = dependencies.currentYear;
        isLightMode = dependencies.isLightMode;
        getSelectedTimeColor = dependencies.getSelectedTimeColor;
        SceneGeometry = dependencies.SceneGeometry;
        calculateYearProgressForDate = dependencies.calculateYearProgressForDate;
        getDaysInMonth = dependencies.getDaysInMonth;
        getSelectedDateTime =
            typeof dependencies.getSelectedDateTime === 'function' ? dependencies.getSelectedDateTime : null;

        // Initialize SceneGeometry if provided
        if (SceneGeometry && typeof SceneGeometry.init === 'function') {
            SceneGeometry.init({
                PLANET_DATA,
                calculateDateHeight,
                getHeightForYear,
                calculateCurrentDateHeight,
                CENTURY_START: dependencies.CENTURY_START,
                ZOOM_LEVELS,
                currentYear,
                calculateActualCurrentDateHeight: dependencies.calculateActualCurrentDateHeight,
                calculateYearProgressForDate,
                getDaysInMonth,
                isLeapYear: dependencies.isLeapYear
            });
        }
    }
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    /**
     * Adjust color for light mode visibility
     * @param {number} color - Original color (hex)
     * @param {boolean} isLightMode - Whether in light mode
     * @returns {number} Adjusted color
     */
    function adjustColorForLightMode(color, isLightMode) {
        if (!isLightMode) return color;
        
        const saturationBoost = 1.3;
        const darkenFactor = 0.7;
        let r = ((color >> 16) & 0xFF);
        let g = ((color >> 8) & 0xFF);
        let b = (color & 0xFF);
        
        const max = Math.max(r, g, b);
        if (max > 0) {
            r = Math.min(255, r * saturationBoost * darkenFactor);
            g = Math.min(255, g * saturationBoost * darkenFactor);
            b = Math.min(255, b * saturationBoost * darkenFactor);
        }
        return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
    }

    function createWorldlineMaterial(THREE, MatClass, options) {
        if (typeof window !== 'undefined' && window.MeshPrimitives && typeof window.MeshPrimitives.createNodeCompatibleMaterial === 'function') {
            return window.MeshPrimitives.createNodeCompatibleMaterial(THREE, MatClass, options);
        }
        return new MatClass(options);
    }

    /** Earth helix stays gray. Selected year white/black. Present year is NOT red (a full coil reads as Mars). */
    function tintRibbonByPresentYear(geo) {
        if (!geo || !geo.getAttribute) return;
        const pos = geo.getAttribute('position');
        if (!pos || !pos.count) return;
        const THREE =
            typeof global !== 'undefined' && global.THREE ? global.THREE : typeof window !== 'undefined' ? window.THREE : null;
        if (!THREE) return;
        let selected = null;
        if (typeof getSelectedDateTime === 'function') {
            const sd = getSelectedDateTime();
            if (sd instanceof Date && !isNaN(sd.getTime())) selected = sd.getFullYear();
        } else if (typeof currentYear === 'number' && !isNaN(currentYear)) {
            selected = currentYear;
        }
        const cs = typeof CENTURY_START === 'number' ? CENTURY_START : 2000;
        const hpy = typeof HEIGHT_PER_YEAR !== 'undefined' ? HEIGHT_PER_YEAR : 100;
        const quiet = isLightMode ? [0.42, 0.447, 0.502] : [0.612, 0.639, 0.686];
        const sel = isLightMode ? [0, 0, 0] : [1, 1, 1];
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            const year = Math.floor(cs + y / hpy);
            const c = selected != null && year === selected ? sel : quiet;
            colors[i * 3] = c[0];
            colors[i * 3 + 1] = c[1];
            colors[i * 3 + 2] = c[2];
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    /**
     * Thick stroke as a quad strip along a 3D centerline (THREE.Line linewidth is ignored in WebGL).
     * Prefers shared RibbonGeometry when loaded; cheaper than TubeGeometry for worldline strokes.
     * @param {Float32Array|number[]} centerFlat - [x,y,z,...]
     * @param {number} halfWidth - half thickness in scene units
     * @returns {THREE.BufferGeometry|null}
     */
    function createRibbonStripGeometry(centerFlat, halfWidth) {
        if (typeof global !== 'undefined' && global.RibbonGeometry && global.RibbonGeometry.fromCenterline) {
            return global.RibbonGeometry.fromCenterline(centerFlat, halfWidth);
        }
        const THREE = typeof global !== 'undefined' && global.THREE ? global.THREE : typeof window !== 'undefined' ? window.THREE : null;
        if (!THREE || !centerFlat || halfWidth <= 0) return null;
        const n = centerFlat.length / 3;
        if (n < 2) return null;
        const innerFlat = new Float32Array(centerFlat.length);
        const outerFlat = new Float32Array(centerFlat.length);
        const up = new THREE.Vector3(0, 1, 0);
        const tan = new THREE.Vector3();
        const side = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
            const ix = i * 3;
            const x0 = centerFlat[ix];
            const y0 = centerFlat[ix + 1];
            const z0 = centerFlat[ix + 2];
            const xPrev = centerFlat[Math.max(0, i - 1) * 3];
            const yPrev = centerFlat[Math.max(0, i - 1) * 3 + 1];
            const zPrev = centerFlat[Math.max(0, i - 1) * 3 + 2];
            const xNext = centerFlat[Math.min(n - 1, i + 1) * 3];
            const yNext = centerFlat[Math.min(n - 1, i + 1) * 3 + 1];
            const zNext = centerFlat[Math.min(n - 1, i + 1) * 3 + 2];
            tan.set(xNext - xPrev, yNext - yPrev, zNext - zPrev);
            if (tan.lengthSq() < 1e-12) tan.set(0, 1, 0);
            else tan.normalize();
            side.crossVectors(tan, up);
            if (side.lengthSq() < 1e-10) {
                side.set(1, 0, 0).cross(tan);
            }
            side.normalize().multiplyScalar(halfWidth);
            innerFlat[ix] = x0 + side.x;
            innerFlat[ix + 1] = y0 + side.y;
            innerFlat[ix + 2] = z0 + side.z;
            outerFlat[ix] = x0 - side.x;
            outerFlat[ix + 1] = y0 - side.y;
            outerFlat[ix + 2] = z0 - side.z;
        }
        const pos = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) {
            pos[i * 6] = innerFlat[i * 3];
            pos[i * 6 + 1] = innerFlat[i * 3 + 1];
            pos[i * 6 + 2] = innerFlat[i * 3 + 2];
            pos[i * 6 + 3] = outerFlat[i * 3];
            pos[i * 6 + 4] = outerFlat[i * 3 + 1];
            pos[i * 6 + 5] = outerFlat[i * 3 + 2];
        }
        const idx = [];
        for (let i = 0; i < n - 1; i++) {
            const a = 2 * i;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return geo;
    }

    /**
     * Synodic new and full moons whose instants fall in [tMinMs, tMaxMs] (UTC ms), sorted by time.
     */
    function synodicNewFullInRangeUtcMs(tMinMs, tMaxMs) {
        const SYN =
            typeof MoonMechanics !== 'undefined' && MoonMechanics.SYNODIC_MONTH_MS
                ? MoonMechanics.SYNODIC_MONTH_MS
                : 29.530588861 * 86400000;
        const ANC =
            typeof MoonMechanics !== 'undefined' && MoonMechanics.LUNATION_ANCHOR_UTC_MS != null
                ? MoonMechanics.LUNATION_ANCHOR_UTC_MS
                : Date.UTC(2000, 0, 6, 18, 14, 0);
        const lo = Math.min(tMinMs, tMaxMs);
        const hi = Math.max(tMinMs, tMaxMs);
        const out = [];
        let k = Math.floor((lo - ANC) / SYN) - 2;
        const kMax = Math.ceil((hi - ANC) / SYN) + 2;
        for (; k <= kMax; k++) {
            const newMs = ANC + k * SYN;
            const fullMs = newMs + SYN / 2;
            if (newMs >= lo && newMs <= hi) out.push({ kind: 'new', ms: newMs });
            if (fullMs >= lo && fullMs <= hi) out.push({ kind: 'full', ms: fullMs });
        }
        return out.sort((a, b) => a.ms - b.ms);
    }

    // ============================================
    // WORLDLINE CREATION
    // ============================================
    
    function setNarrativeClipYMax(meshes, yMax) {
        if (!meshes || typeof yMax !== 'number' || isNaN(yMax)) return;
        meshes.forEach((m) => {
            const u = m && m.userData && m.userData.narrClipUniform;
            if (u) u.value = yMax;
        });
    }

    function flattenOrbitSpanZoom() {
        if (typeof window !== 'undefined' && typeof window.getCurrentZoomLevel === 'function') {
            try {
                const z = window.getCurrentZoomLevel();
                if (typeof z === 'number' && !isNaN(z)) return z;
            } catch (e) { /* keep */ }
        }
        return 3;
    }

    function flattenOrbitSpanMul() {
        if (typeof window !== 'undefined' && typeof window.isFlattenTimeStraightenActive === 'function') {
            try {
                if (window.isFlattenTimeStraightenActive()) {
                    // Week/day canvas: native span so Earth worldline matches flattened day frame.
                    const z = Math.floor(flattenOrbitSpanZoom());
                    if (z === 7 || z === 8) return 1;
                    return 10;
                }
            } catch (e) { /* off */ }
        }
        return 1;
    }

    function flattenOrbitSpanMidYear(navYear, bucketMid) {
        const mul = flattenOrbitSpanMul();
        if (mul > 1 && typeof navYear === 'number' && !isNaN(navYear)) return navYear;
        return bucketMid;
    }

    /** Local helix Y-span mid = selected time (phase ref stays wall-clock now). */
    function flattenOrbitSpanMidHeight(fallbackHeight) {
        if (typeof getSelectedDateTime === 'function' && typeof calculateDateHeight === 'function') {
            try {
                const sd = getSelectedDateTime();
                if (sd instanceof Date && !isNaN(sd.getTime())) {
                    const h = calculateDateHeight(
                        sd.getFullYear(),
                        sd.getMonth(),
                        sd.getDate(),
                        sd.getHours() + (sd.getMinutes() || 0) / 60
                    );
                    if (typeof h === 'number' && !isNaN(h)) return h;
                }
            } catch (e) { /* fallback */ }
        }
        return fallbackHeight;
    }

    /**
     * Create a worldline for a planet
     * @param {Object} planetData - Planet data with orbitalPeriod, startAngle, distance, color, name
     * @param {number} timeYears - Time span in years
     * @param {number} zoomLevel - Current zoom level
     * @returns {THREE.Mesh|THREE.Line} Ribbon mesh (preferred) or line fallback
     */
    function createWorldline(planetData, timeYears, zoomLevel, clipHeights) {
        // Safety check: ensure module is initialized
        if (!ZOOM_LEVELS || !SceneGeometry) {
            console.error('Worldlines module not initialized. Call Worldlines.init() first.');
            return null;
        }

        const config = ZOOM_LEVELS[zoomLevel];
        if (!config) {
            console.error(`Invalid zoom level: ${zoomLevel}`);
            return null;
        }

        const sceneCurrentHeight = SceneGeometry.getCurrentDateHeight(zoomLevel);
        if (isNaN(sceneCurrentHeight)) {
            console.error('Worldlines: currentDateHeight is NaN, skipping worldline for', planetData.name);
            return null;
        }

        const narrativeShaderClip =
            clipHeights &&
            clipHeights.narrativeShaderClip === true &&
            typeof clipHeights.heightStart === 'number' &&
            typeof clipHeights.heightEnd === 'number' &&
            !isNaN(clipHeights.heightStart) &&
            !isNaN(clipHeights.heightEnd);

        let curveExtra = null;
        let helicalReferenceHeight = sceneCurrentHeight;
        if (
            clipHeights &&
            typeof clipHeights.phaseReferenceHeight === 'number' &&
            !isNaN(clipHeights.phaseReferenceHeight)
        ) {
            helicalReferenceHeight = clipHeights.phaseReferenceHeight;
            curveExtra = {};
            if (typeof getSelectedDateTime === 'function') {
                const sd = getSelectedDateTime();
                if (sd instanceof Date && !isNaN(sd.getTime())) {
                    curveExtra.referenceDate = sd;
                }
            }
        }

        let startHeight;
        let endHeight;
        const flattenMul = flattenOrbitSpanMul();

        if (narrativeShaderClip) {
            let hs = clipHeights.heightStart;
            let he = clipHeights.heightEnd;
            if (hs > he) {
                const tmp = hs;
                hs = he;
                he = tmp;
            }
            startHeight = hs;
            endHeight = he;
        } else if (zoomLevel === 1) {
            const y = typeof currentYear === 'number' ? currentYear : 2050;
            const centuryStart = Math.floor(y / 100) * 100;
            const span = 100 * flattenMul;
            const mid = flattenOrbitSpanMidYear(y, centuryStart + 50);
            startHeight = getHeightForYear(Math.round(mid - span / 2), 1);
            endHeight = getHeightForYear(Math.round(mid + span / 2), 1);
        } else if (zoomLevel === 2) {
            const y = typeof currentYear === 'number' ? currentYear : new Date().getFullYear();
            const decadeStart = typeof window !== 'undefined' && typeof window.getDecadeStartYear === 'function'
                ? window.getDecadeStartYear(y)
                : Math.floor(y / 10) * 10;
            const span = 10 * flattenMul;
            const mid = flattenOrbitSpanMidYear(y, decadeStart + 5);
            let y0 = Math.round(mid - span / 2);
            let y1 = Math.round(mid + span / 2);
            if (typeof window !== 'undefined' && typeof window.clampYearSpanToBirth === 'function') {
                const c = window.clampYearSpanToBirth(y0, y1);
                y0 = c.y0;
                y1 = c.y1;
            }
            startHeight = getHeightForYear(y0, 1);
            endHeight = getHeightForYear(y1, 1);
        } else if (zoomLevel === 3) {
            const yearHeight = 100 * flattenMul;
            const mid = flattenOrbitSpanMidHeight(sceneCurrentHeight);
            startHeight = mid - yearHeight / 2;
            endHeight = mid + yearHeight / 2;

            if (isNaN(startHeight) || isNaN(endHeight)) {
                startHeight = sceneCurrentHeight - yearHeight / 2;
                endHeight = sceneCurrentHeight + yearHeight / 2;
            }
        } else {
            const spanHeight = timeYears * 100 * flattenMul;
            const extensionFactor = flattenMul > 1 ? 1 : 2.5;
            const mid = flattenOrbitSpanMidHeight(sceneCurrentHeight);
            startHeight = mid - (spanHeight * extensionFactor) / 2;
            endHeight = mid + (spanHeight * extensionFactor) / 2;
        }

        /** Intro / narrative: fixed helical span (non-shader height trim). */
        if (
            !narrativeShaderClip &&
            clipHeights &&
            typeof clipHeights.heightStart === 'number' &&
            typeof clipHeights.heightEnd === 'number' &&
            !isNaN(clipHeights.heightStart) &&
            !isNaN(clipHeights.heightEnd)
        ) {
            let hs = clipHeights.heightStart;
            let he = clipHeights.heightEnd;
            if (hs > he) {
                const tmp = hs;
                hs = he;
                he = tmp;
            }
            startHeight = hs;
            endHeight = he;
        }

        if (isNaN(startHeight) || isNaN(endHeight)) {
            console.error('Worldlines: startHeight or endHeight is NaN', {
                startHeight,
                endHeight,
                planet: planetData.name,
                zoomLevel
            });
            return null;
        }

        let segments = zoomLevel >= 4 ? 400 : 200;
        if (flattenMul > 1) {
            const spanYears = Math.abs(endHeight - startHeight) / 100;
            segments = Math.min(4000, Math.max(segments, Math.round(spanYears * 64)));
        }
        if (clipHeights && clipHeights.tourLightSegments) {
            segments = Math.min(segments, 72);
        }

        const points = SceneGeometry.createHelicalCurve(
            startHeight,
            endHeight,
            planetData.distance,
            helicalReferenceHeight,
            planetData.orbitalPeriod,
            planetData.startAngle,
            segments,
            planetData.name,
            curveExtra
        );

        if (!points || points.length === 0) {
            console.error('Worldlines: createHelicalCurve returned empty points array');
            return null;
        }

        for (let i = 0; i < points.length; i++) {
            if (isNaN(points[i])) {
                console.error('Worldlines: NaN detected in points array at index', i, 'for', planetData.name);
                return null;
            }
        }

        const isEarth = planetData.name === 'Earth';
        const opacityVal = isEarth
            ? (isLightMode ? 0.5 : 0.42)
            : SCENE_CONFIG.worldlineOpacity;
        let halfWidth = Math.max(0.55, Math.min(5.8, planetData.distance * 0.027));
        if (zoomLevel === 1) halfWidth = Math.min(8.2, halfWidth * 1.82);
        else if (zoomLevel === 2) halfWidth *= 1.38;
        if (isEarth && zoomLevel >= 1 && zoomLevel <= 3) halfWidth *= 1.35;
        else if (isEarth && zoomLevel >= 3) halfWidth *= 1.2;
        if (clipHeights && clipHeights.tourLightSegments && !isEarth) {
            halfWidth *= 0.92;
        }
        if (isLightMode) halfWidth *= 1.12;

        const quietEarth = isLightMode ? 0x6b7280 : 0x9ca3af;
        const worldlineColor = isEarth
            ? quietEarth
            : adjustColorForLightMode(planetData.color, isLightMode);
        const centerFlat = Float32Array.from(points);
        const ribbonGeo = createRibbonStripGeometry(centerFlat, halfWidth);
        if (ribbonGeo) {
            const THREE =
                typeof global !== 'undefined' && global.THREE ? global.THREE : typeof window !== 'undefined' ? window.THREE : null;
            if (isEarth) tintRibbonByPresentYear(ribbonGeo);
            const material = createWorldlineMaterial(THREE, THREE.MeshBasicMaterial, {
                color: isEarth ? 0xffffff : worldlineColor,
                vertexColors: !!isEarth,
                transparent: true,
                opacity: isEarth ? opacityVal : (isLightMode ? 0.95 : opacityVal),
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });

            let narrClipUniform = null;
            if (narrativeShaderClip) {
                const clipY0 =
                    typeof clipHeights.initialClipYMax === 'number' && !isNaN(clipHeights.initialClipYMax)
                        ? clipHeights.initialClipYMax
                        : startHeight;
                narrClipUniform = { value: clipY0 };
                material.onBeforeCompile = (shader) => {
                    shader.uniforms.uNarrClipYMax = narrClipUniform;
                    shader.vertexShader = shader.vertexShader
                        .replace('#include <common>', '#include <common>\nvarying float vNarrClipY;\n')
                        .replace(
                            '#include <project_vertex>',
                            '{\nvec4 _narrWorldPos = modelMatrix * vec4( position, 1.0 );\nvNarrClipY = _narrWorldPos.y;\n}\n#include <project_vertex>'
                        );
                    if (shader.fragmentShader.includes('#include <clipping_planes_fragment>')) {
                        shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <clipping_planes_fragment>',
                            'uniform float uNarrClipYMax;\nvarying float vNarrClipY;\n#include <clipping_planes_fragment>\nif (vNarrClipY > uNarrClipYMax) discard;\n'
                        );
                    } else if (shader.fragmentShader.includes('void main() {')) {
                        shader.fragmentShader = shader.fragmentShader.replace(
                            'void main() {',
                            'uniform float uNarrClipYMax;\nvarying float vNarrClipY;\nvoid main() {\n\tif (vNarrClipY > uNarrClipYMax) discard;\n'
                        );
                    }
                };
            }

            const mesh = new THREE.Mesh(ribbonGeo, material);
            mesh.renderOrder = 8;
            mesh.userData = {
                type: 'PlanetWorldlineRibbon',
                planet: planetData.name,
                narrClipUniform: narrClipUniform
            };
            return mesh;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        if (isEarth) tintRibbonByPresentYear(geometry);
        let lineWidth = isEarth && zoomLevel >= 3 ? 3 : 2;
        if (zoomLevel === 1) lineWidth += 4.5;
        const lineMat = createWorldlineMaterial(THREE, THREE.LineBasicMaterial, {
            color: isEarth ? 0xffffff : worldlineColor,
            vertexColors: !!isEarth,
            transparent: true,
            opacity: isEarth ? opacityVal : (isLightMode ? 0.95 : opacityVal),
            linewidth: isLightMode ? lineWidth + 1 : lineWidth
        });
        return new THREE.Line(geometry, lineMat);
    }
    
    /**
     * Create moon worldline (orbits around Earth). Rendered as a thick ribbon mesh (visible width in WebGL).
     * @param {number} currentDateHeight - Current date height
     * @param {number} zoomLevel - Current zoom level
     * @returns {THREE.Group|THREE.Mesh|THREE.Line|null}
     */
    function createMoonWorldline(currentDateHeight, zoomLevel) {
        // Validate currentDateHeight
        if (isNaN(currentDateHeight)) {
            console.error('Worldlines: createMoonWorldline received NaN currentDateHeight');
            return null;
        }
        
        const extensionFactor = flattenOrbitSpanMul() > 1 ? 1 : 5;
        const baseSpan = ZOOM_LEVELS[zoomLevel].timeYears * 100 * Math.max(1, flattenOrbitSpanMul());
        const totalSpan = baseSpan * extensionFactor;
        const startHeight = flattenOrbitSpanMidHeight(currentDateHeight) - (totalSpan / 2);
        
        // Validate calculated values
        if (isNaN(startHeight) || isNaN(totalSpan)) {
            console.error('Worldlines: Invalid moon worldline calculation', {
                currentDateHeight,
                baseSpan,
                totalSpan,
                startHeight
            });
            return null;
        }
        
        const moonDistance =
            typeof MoonMechanics !== 'undefined' && typeof MoonMechanics.getOffset === 'function'
                ? MoonMechanics.getOffset()
                : 10.75;
        const lunarPeriod = 0.0767; // ~28 days in years (legacy fallback only)
        const segments = 1000;
        const hpy = typeof HEIGHT_PER_YEAR !== 'undefined' ? HEIGHT_PER_YEAR : 100;
        /** Mean tropical year (ms); matches constant-rate height↔time used by orbital angle along Y. */
        const MS_PER_ORBIT_YEAR = 365.2425 * 86400000;

        const earth = PLANET_DATA.find(p => p.name === 'Earth');
        if (!earth) {
            console.error('Worldlines: Earth not found in PLANET_DATA');
            return null;
        }

        const refH = currentDateHeight; // same reference as MoonMechanics.addPedagogicalMoon (currentDateHeight)
        const selDate =
            typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date();
        let selH;
        if (typeof calculateDateHeight === 'function') {
            selH = calculateDateHeight(
                selDate.getFullYear(),
                selDate.getMonth(),
                selDate.getDate(),
                selDate.getHours()
            );
        } else {
            selH = refH;
        }

        const moonPoints = [];
        const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;
        const moonXZForWorldline =
            MM && typeof MM.moonXZSynodicAtHeight === 'function'
                ? MM.moonXZSynodicAtHeight
                : MM && typeof MM.moonXZAtHeight === 'function'
                  ? MM.moonXZAtHeight
                  : null;

        if (moonXZForWorldline) {
            const moonSep = typeof MM.getOffset === 'function' ? MM.getOffset() : moonDistance;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const height = startHeight + (t * totalSpan);
                if (isNaN(height)) {
                    console.error('Worldlines: NaN height in moon worldline at segment', i);
                    return null;
                }
                const atDate = new Date(
                    selDate.getTime() + ((height - selH) / hpy) * MS_PER_ORBIT_YEAR
                );
                const mxz = moonXZForWorldline.call(MM, height, refH, earth, moonSep, atDate, null, selH);
                if (!mxz || isNaN(mxz.x) || isNaN(mxz.z)) {
                    console.error('Worldlines: Invalid moonXZ from MoonMechanics at segment', i);
                    return null;
                }
                moonPoints.push(mxz.x, height, mxz.z);
            }
        } else if (SceneGeometry && typeof SceneGeometry.getPosition3D === 'function') {
            const timeSpanYears = totalSpan / 100;
            const earthOrbitsInSpan = timeSpanYears / earth.orbitalPeriod;
            const yearsBeforeCurrent = (currentDateHeight - startHeight) / 100;
            const earthOrbitsBeforeCurrent = yearsBeforeCurrent / earth.orbitalPeriod;
            const earthAngleBeforeCurrent = earthOrbitsBeforeCurrent * Math.PI * 2;
            const earthStartAngle = earth.startAngle + earthAngleBeforeCurrent;
            const moonOrbitsInSpan = timeSpanYears / lunarPeriod;

            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const earthAngle = earthStartAngle - (t * earthOrbitsInSpan * Math.PI * 2);
                const height = startHeight + (t * totalSpan);
                if (isNaN(height)) {
                    console.error('Worldlines: NaN height in moon worldline at segment', i);
                    return null;
                }
                const earthPos = SceneGeometry.getPosition3D(height, earthAngle, earth.distance);
                if (!earthPos || isNaN(earthPos.x) || isNaN(earthPos.y) || isNaN(earthPos.z)) {
                    console.error('Worldlines: Invalid earthPos in moon worldline at segment', i);
                    return null;
                }
                const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
                const moonPhaseProgress = (t * moonOrbitsInSpan) % 1;
                const moonAngleRelativeToSun = sunToEarthAngle + Math.PI - (moonPhaseProgress * Math.PI * 2);
                const moonPos = SceneGeometry.getPosition3D(0, moonAngleRelativeToSun, moonDistance);
                if (!moonPos || isNaN(moonPos.x) || isNaN(moonPos.y) || isNaN(moonPos.z)) {
                    console.error('Worldlines: Invalid moonPos in moon worldline at segment', i);
                    return null;
                }
                moonPoints.push(earthPos.x + moonPos.x, height, earthPos.z + moonPos.z);
            }
        } else {
            console.error('Worldlines: Moon worldline needs MoonMechanics or SceneGeometry');
            return null;
        }
        
        // Validate moonPoints before creating geometry
        for (let i = 0; i < moonPoints.length; i++) {
            if (isNaN(moonPoints[i])) {
                console.error('Worldlines: NaN in moonPoints at index', i);
                return null;
            }
        }
        
        const moonColor = isLightMode ? 0x666666 : 0x888888;
        const centerFlat = new Float32Array(moonPoints);
        const halfWidth = Math.max(moonDistance * 0.085, 0.55);

        const tSpanMin =
            selDate.getTime() + ((startHeight - selH) / hpy) * MS_PER_ORBIT_YEAR;
        const tSpanMax =
            selDate.getTime() + ((startHeight + totalSpan - selH) / hpy) * MS_PER_ORBIT_YEAR;
        const phaseEvents = synodicNewFullInRangeUtcMs(tSpanMin, tSpanMax);

        const ribbonGeo = createRibbonStripGeometry(centerFlat, halfWidth);
        if (ribbonGeo) {
            const moonMaterial = new THREE.MeshBasicMaterial({
                color: moonColor,
                transparent: true,
                opacity: 0.46,
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
            const mesh = new THREE.Mesh(ribbonGeo, moonMaterial);
            mesh.renderOrder = 10;
            mesh.userData = { type: 'MoonWorldlineRibbon' };

            const root = new THREE.Group();
            root.userData = { type: 'MoonWorldlineRoot' };
            root.add(mesh);

            if (moonXZForWorldline) {
                const moonSep = typeof MM.getOffset === 'function' ? MM.getOffset() : moonDistance;
                const mr = Math.max(0.3, moonSep * 0.026);
                for (let pi = 0; pi < phaseEvents.length; pi++) {
                    const ev = phaseEvents[pi];
                    const at = new Date(ev.ms);
                    const h =
                        selH + ((at.getTime() - selDate.getTime()) / MS_PER_ORBIT_YEAR) * hpy;
                    if (isNaN(h)) continue;
                    const mxz = moonXZForWorldline.call(MM, h, refH, earth, moonSep, at, null, selH);
                    if (!mxz || isNaN(mxz.x) || isNaN(mxz.z)) continue;

                    const markUd = {
                        type: 'MoonPhaseMarker',
                        role: ev.kind === 'new' ? 'newMoon' : 'fullMoon',
                        navigateTimeMs: ev.ms
                    };

                    if (ev.kind === 'new') {
                        const coreR = mr * 0.58;
                        const coreGeo = new THREE.SphereGeometry(coreR, 22, 22);
                        const coreMat = new THREE.MeshBasicMaterial({
                            color: isLightMode ? 0x020617 : 0x050508,
                            transparent: true,
                            opacity: 0.98,
                            depthWrite: false
                        });
                        const core = new THREE.Mesh(coreGeo, coreMat);
                        const ringGeo = new THREE.RingGeometry(mr * 0.82, mr * 1.38, 56);
                        const ringMat = new THREE.MeshBasicMaterial({
                            color: 0xe6a00c,
                            transparent: true,
                            opacity: 0.9,
                            side: THREE.DoubleSide,
                            depthWrite: false
                        });
                        const ring = new THREE.Mesh(ringGeo, ringMat);
                        ring.rotation.x = -Math.PI / 2;
                        const g = new THREE.Group();
                        g.position.set(mxz.x, h, mxz.z);
                        g.renderOrder = 14;
                        g.userData = markUd;
                        core.userData = markUd;
                        ring.userData = markUd;
                        g.add(core);
                        g.add(ring);
                        root.add(g);
                    } else {
                        const coreR = mr * 1.08;
                        const coreGeo = new THREE.SphereGeometry(coreR, 24, 24);
                        const coreMat = new THREE.MeshBasicMaterial({
                            color: isLightMode ? 0xfffef8 : 0xf5f3ff,
                            transparent: true,
                            opacity: 0.99,
                            depthWrite: false
                        });
                        const core = new THREE.Mesh(coreGeo, coreMat);
                        const ringGeo = new THREE.RingGeometry(mr * 1.22, mr * 1.72, 56);
                        const ringMat = new THREE.MeshBasicMaterial({
                            color: isLightMode ? 0x93c5fd : 0xa5b4fc,
                            transparent: true,
                            opacity: 0.55,
                            side: THREE.DoubleSide,
                            depthWrite: false
                        });
                        const ring = new THREE.Mesh(ringGeo, ringMat);
                        ring.rotation.x = -Math.PI / 2;
                        const g = new THREE.Group();
                        g.position.set(mxz.x, h, mxz.z);
                        g.renderOrder = 14;
                        g.userData = markUd;
                        core.userData = markUd;
                        ring.userData = markUd;
                        g.add(core);
                        g.add(ring);
                        root.add(g);
                    }
                }
            }

            return root;
        }

        const moonGeometry = new THREE.BufferGeometry();
        moonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(moonPoints, 3));
        const lineMat = new THREE.LineBasicMaterial({
            color: moonColor,
            transparent: true,
            opacity: 0.4,
            linewidth: 1
        });
        return new THREE.Line(moonGeometry, lineMat);
    }
    
    return {
        init,
        createWorldline,
        createMoonWorldline,
        setNarrativeClipYMax
    };
})();
