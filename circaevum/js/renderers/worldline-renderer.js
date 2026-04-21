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

    /**
     * Thick stroke as a quad strip along a 3D centerline (THREE.Line linewidth is ignored in WebGL).
     * @param {Float32Array|number[]} centerFlat - [x,y,z,...]
     * @param {number} halfWidth - half thickness in scene units
     * @returns {THREE.BufferGeometry|null}
     */
    function createRibbonStripGeometry(centerFlat, halfWidth) {
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
    
    /**
     * Create a worldline for a planet
     * @param {Object} planetData - Planet data with orbitalPeriod, startAngle, distance, color, name
     * @param {number} timeYears - Time span in years
     * @param {number} zoomLevel - Current zoom level
     * @returns {THREE.Mesh|THREE.Line} Ribbon mesh (preferred) or line fallback
     */
    function createWorldline(planetData, timeYears, zoomLevel) {
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
        
        const currentDateHeight = SceneGeometry.getCurrentDateHeight(zoomLevel);
        
        // Validate currentDateHeight
        if (isNaN(currentDateHeight)) {
            console.error('Worldlines: currentDateHeight is NaN, skipping worldline for', planetData.name);
            return null;
        }
        
        // Calculate worldline span based on zoom level
        let startHeight, endHeight;
        
        if (zoomLevel === 1) { // Century - show full 2000-2100
            startHeight = getHeightForYear(2000, 1);
            endHeight = getHeightForYear(2100, 1);
        } else if (zoomLevel === 2) { // Decade - span containing navigated year (not fixed 2020–2030)
            const y = typeof currentYear === 'number' ? currentYear : new Date().getFullYear();
            const decadeStart = Math.floor(y / 10) * 10;
            startHeight = getHeightForYear(decadeStart, 1);
            endHeight = getHeightForYear(decadeStart + 10, 1);
        } else if (zoomLevel === 3) { // Year - show full year with current date
            const yearHeight = 100;
            const now = new Date();
            let yearProgress;
            
            if (typeof calculateYearProgressForDate === 'function') {
                yearProgress = calculateYearProgressForDate(now.getFullYear(), now.getMonth(), now.getDate(), 0);
            } else {
                // Fallback calculation
                const daysInMonth = (typeof getDaysInMonth === 'function') 
                    ? getDaysInMonth(now.getFullYear(), now.getMonth()) 
                    : 30;
                yearProgress = (now.getMonth() + (now.getDate() - 1) / daysInMonth) / 12;
            }
            
            // Validate yearProgress
            if (isNaN(yearProgress)) {
                console.error('Worldlines: yearProgress is NaN for Zoom 3', {
                    year: now.getFullYear(),
                    month: now.getMonth(),
                    day: now.getDate(),
                    calculateYearProgressForDate: typeof calculateYearProgressForDate,
                    getDaysInMonth: typeof getDaysInMonth
                });
                // Use fallback: assume middle of year
                yearProgress = 0.5;
            }
            
            startHeight = currentDateHeight - (yearProgress * yearHeight);
            endHeight = startHeight + yearHeight;
            
            // Validate calculated heights
            if (isNaN(startHeight) || isNaN(endHeight)) {
                console.error('Worldlines: Invalid heights for Zoom 3', {
                    currentDateHeight,
                    yearProgress,
                    yearHeight,
                    startHeight,
                    endHeight
                });
                // Use fallback: full year around current date
                startHeight = currentDateHeight - (yearHeight / 2);
                endHeight = currentDateHeight + (yearHeight / 2);
            }
        } else { // Higher zooms - show time span around current date
            const spanHeight = timeYears * 100;
            const extensionFactor = 2.5; // Show 2.5x the span
            startHeight = currentDateHeight - (spanHeight * extensionFactor / 2);
            endHeight = currentDateHeight + (spanHeight * extensionFactor / 2);
        }
        
        // Validate heights before creating geometry
        if (isNaN(startHeight) || isNaN(endHeight)) {
            console.error('Worldlines: startHeight or endHeight is NaN', {
                startHeight,
                endHeight,
                planet: planetData.name,
                zoomLevel
            });
            return null;
        }
        
        // Generate curve points using SceneGeometry
        const segments = zoomLevel >= 4 ? 400 : 200;
        const points = SceneGeometry.createHelicalCurve(
            startHeight,
            endHeight,
            planetData.distance,
            currentDateHeight,
            planetData.orbitalPeriod,
            planetData.startAngle,
            segments
        );
        
        // Validate points array before creating geometry
        if (!points || points.length === 0) {
            console.error('Worldlines: createHelicalCurve returned empty points array');
            return null;
        }
        
        // Check for NaN in points array
        for (let i = 0; i < points.length; i++) {
            if (isNaN(points[i])) {
                console.error('Worldlines: NaN detected in points array at index', i, 'for', planetData.name);
                return null;
            }
        }
        
        const isEarth = planetData.name === 'Earth';
        const opacityVal = (isEarth && zoomLevel >= 3) ? 0.9 : SCENE_CONFIG.worldlineOpacity;
        // Ribbon half-width in scene units (LineBasicMaterial.linewidth is ignored in WebGL).
        let halfWidth = Math.max(0.55, Math.min(5.8, planetData.distance * 0.027));
        if (zoomLevel === 1) halfWidth = Math.min(8.2, halfWidth * 1.82);
        else if (zoomLevel === 2) halfWidth *= 1.38;
        if (isEarth && zoomLevel >= 3) halfWidth *= 1.2;
        if (isLightMode) halfWidth *= 1.12;

        const worldlineColor = adjustColorForLightMode(planetData.color, isLightMode);
        const centerFlat = Float32Array.from(points);
        const ribbonGeo = createRibbonStripGeometry(centerFlat, halfWidth);
        if (ribbonGeo) {
            const material = new THREE.MeshBasicMaterial({
                color: worldlineColor,
                transparent: true,
                opacity: isLightMode ? 0.95 : opacityVal,
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
            const mesh = new THREE.Mesh(ribbonGeo, material);
            mesh.renderOrder = 8;
            mesh.userData = { type: 'PlanetWorldlineRibbon', planet: planetData.name };
            return mesh;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        let lineWidth = (isEarth && zoomLevel >= 3) ? 3 : 2;
        if (zoomLevel === 1) lineWidth += 4.5;
        const lineMat = new THREE.LineBasicMaterial({
            color: worldlineColor,
            transparent: true,
            opacity: isLightMode ? 0.95 : opacityVal,
            linewidth: isLightMode ? lineWidth + 1 : lineWidth
        });
        return new THREE.Line(geometry, lineMat);
    }
    
    /**
     * Create a connector worldline between current and selected time
     * @param {Object} planetData - Planet data
     * @param {number} currentHeight - Current date height
     * @param {number} selectedHeight - Selected date height
     * @returns {THREE.Mesh|THREE.Line} Ribbon mesh or line fallback
     */
    function createConnectorWorldline(planetData, currentHeight, selectedHeight) {
        // Validate inputs
        if (isNaN(currentHeight) || isNaN(selectedHeight)) {
            console.error('Worldlines: createConnectorWorldline received NaN heights', {
                currentHeight,
                selectedHeight,
                planet: planetData.name
            });
            return null;
        }
        
        const startHeight = Math.min(currentHeight, selectedHeight);
        const endHeight = Math.max(currentHeight, selectedHeight);
        
        // Generate curve points
        const segments = 100;
        const points = SceneGeometry.createHelicalCurve(
            startHeight,
            endHeight,
            planetData.distance,
            currentHeight,
            planetData.orbitalPeriod,
            planetData.startAngle,
            segments
        );
        
        // Validate points before creating geometry
        if (!points || points.length === 0) {
            console.error('Worldlines: createHelicalCurve returned empty points for connector');
            return null;
        }
        
        // Check for NaN in points
        for (let i = 0; i < points.length; i++) {
            if (isNaN(points[i])) {
                console.error('Worldlines: NaN in connector points at index', i);
                return null;
            }
        }
        
        const halfWidth = Math.max(0.42, Math.min(4.5, planetData.distance * 0.021));
        const ribbonGeo = createRibbonStripGeometry(Float32Array.from(points), halfWidth);
        if (ribbonGeo) {
            const material = new THREE.MeshBasicMaterial({
                color: getSelectedTimeColor(),
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
            const mesh = new THREE.Mesh(ribbonGeo, material);
            mesh.renderOrder = 8;
            mesh.userData = { type: 'ConnectorWorldlineRibbon', planet: planetData.name };
            return mesh;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const material = new THREE.LineBasicMaterial({
            color: getSelectedTimeColor(),
            transparent: true,
            opacity: 0.5,
            linewidth: 2
        });
        return new THREE.Line(geometry, material);
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
        
        const extensionFactor = 5; // Extend 5x beyond current view
        const baseSpan = ZOOM_LEVELS[zoomLevel].timeYears * 100;
        const totalSpan = baseSpan * extensionFactor;
        const startHeight = currentDateHeight - (totalSpan / 2);
        
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
        
        const moonMc = typeof SCENE_CONFIG !== 'undefined' && SCENE_CONFIG.moonMechanics ? SCENE_CONFIG.moonMechanics : {};
        const moonDistance =
            typeof moonMc.offsetFromEarth === 'number' ? moonMc.offsetFromEarth : 10.75; // align with core MoonMechanics
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
                const mxz = moonXZForWorldline.call(MM, height, refH, earth, moonSep, atDate);
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
                    const mxz = moonXZForWorldline.call(MM, h, refH, earth, moonSep, at);
                    if (!mxz || isNaN(mxz.x) || isNaN(mxz.z)) continue;

                    const markUd = {
                        type: 'MoonPhaseMarker',
                        role: ev.kind === 'new' ? 'newMoon' : 'fullMoon',
                        artemisNavigateTimeMs: ev.ms
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
        createConnectorWorldline,
        createMoonWorldline
    };
})();
