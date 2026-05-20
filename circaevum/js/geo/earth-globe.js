/**
 * Earth globe: obliquity, latitude lines, user pin, meridian + subsolar-lat hand.
 * Scene mapping: orbit plane XZ, +Y = ecliptic north / time axis at a slice.
 */
const EarthGlobe = (function () {
    const OBLIQUITY_DEG = 23.4392911;
    const TROPIC_DEG = 23.4392911;
    /** Arctic / Antarctic circles (90° − obliquity). */
    const ARCTIC_DEG = 90 - TROPIC_DEG;
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;

    /** @type {{ lat: number, lon: number, source: string } | null} */
    let observer = null;

    /** @type {THREE.Object3D[]} */
    let handObjects = [];

    const LOCATION_HINTS = [
        { match: /edge\s*esmeralda|healdsburg/i, lat: 38.6105, lon: -122.8692 },
        { match: /san\s*francisco|sf\s*bay|oakland|berkeley/i, lat: 37.7749, lon: -122.4194 },
        { match: /los\s*angeles|santa\s*monica/i, lat: 34.0522, lon: -118.2437 },
        { match: /new\s*york|nyc|manhattan/i, lat: 40.7128, lon: -74.006 },
        { match: /london/i, lat: 51.5074, lon: -0.1278 },
        { match: /paris/i, lat: 48.8566, lon: 2.3522 }
    ];

    function isGlobeDetailZoom(zoomLevel) {
        return zoomLevel === 0 || zoomLevel === 8 || zoomLevel === 9;
    }

    function normalizeLon(lon) {
        let x = lon;
        while (x > 180) x -= 360;
        while (x < -180) x += 360;
        return x;
    }

    function getThree() {
        return typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : null;
    }

    /** Earth spin axis in J2000 ecliptic (lon ~90°, lat ~66.56°N). */
    function inertialNorthPoleEcliptic() {
        const obl = OBLIQUITY_DEG * DEG;
        return { x: 0, y: Math.sin(obl), z: Math.cos(obl) };
    }

    function getScenePhaseLockRotationRad() {
        if (typeof window !== 'undefined' && window.CircaevumAstro &&
            typeof window.CircaevumAstro.getScenePhaseLockRotationRad === 'function') {
            return window.CircaevumAstro.getScenePhaseLockRotationRad();
        }
        return 0;
    }

    /** Inertial north pole as a scene unit vector (same mapping as ephemeris Earth positions). */
    function inertialNorthPoleScene() {
        const e = inertialNorthPoleEcliptic();
        if (typeof window !== 'undefined' && window.CircaevumAstro &&
            typeof window.CircaevumAstro.eclipticDirectionToScene === 'function') {
            return window.CircaevumAstro.eclipticDirectionToScene(e.x, e.y, e.z);
        }
        const obl = OBLIQUITY_DEG * DEG;
        const rot = getScenePhaseLockRotationRad();
        const rawX = e.x;
        const rawZ = -e.y;
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        const v = {
            x: rawX * cr - rawZ * sr,
            y: e.z,
            z: rawX * sr + rawZ * cr
        };
        const len = Math.hypot(v.x, v.y, v.z) || 1;
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    function getSunDirectionWorld(earthGroup) {
        const THREE = getThree();
        if (!THREE || !earthGroup) return null;
        const center = new THREE.Vector3();
        earthGroup.getWorldPosition(center);
        const sun = new THREE.Vector3(0, center.y, 0);
        const dir = sun.sub(center);
        if (dir.lengthSq() < 1e-12) return null;
        return dir.normalize();
    }

    function spinQuatToAlign(axis, fromVec, toVec) {
        const THREE = getThree();
        const n = axis.clone().normalize();
        const fromP = fromVec.clone().projectOnPlane(n);
        const toP = toVec.clone().projectOnPlane(n);
        if (fromP.lengthSq() < 1e-10 || toP.lengthSq() < 1e-10) {
            return new THREE.Quaternion();
        }
        fromP.normalize();
        toP.normalize();
        const cross = new THREE.Vector3().crossVectors(fromP, toP);
        const dot = fromP.dot(toP);
        const angle = Math.atan2(cross.dot(n), dot);
        return new THREE.Quaternion().setFromAxisAngle(n, angle);
    }

    /** Geographic lat/lon (deg) → unit vector; Y = north, lon 0° at +X, east toward +Z. */
    function latLonToUnit(latDeg, lonDeg) {
        const lat = latDeg * DEG;
        const lon = lonDeg * DEG;
        const c = Math.cos(lat);
        return { x: c * Math.cos(lon), y: Math.sin(lat), z: c * Math.sin(lon) };
    }

    function getSubsolarGeographic(date) {
        if (typeof Astronomy === 'undefined' || !Astronomy.MakeTime) {
            return { lat: 0, lon: 0 };
        }
        const t = Astronomy.MakeTime(date instanceof Date ? date : new Date());
        const sun = Astronomy.SunPosition(t);
        let lat = sun.elat;
        let lon = 0;
        try {
            const obs = new Astronomy.Observer(0, 0, 0);
            const eq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
            lat = eq.dec;
            const gst = Astronomy.SiderealTime(t);
            lon = normalizeLon((gst - eq.ra) * 15);
        } catch (e) {
            const gst = Astronomy.SiderealTime(t);
            lon = normalizeLon(gst * 15 - sun.elon);
        }
        return { lat, lon };
    }

    /**
     * Orient globe: obliquity axis fixed in space, spin places subsolar point toward scene Sun.
     * Works with ephemeris Earth XZ (not only circular June-at-+Z).
     */
    function computeEarthOrientationQuat(date, earthGroup) {
        const THREE = getThree();
        if (!THREE) return null;
        const nPole = inertialNorthPoleScene();
        const axis = new THREE.Vector3(nPole.x, nPole.y, nPole.z).normalize();
        const qTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

        const sub = getSubsolarGeographic(date);
        const subBody = latLonToUnit(sub.lat, sub.lon);
        const subVec = new THREE.Vector3(subBody.x, subBody.y, subBody.z);
        subVec.applyQuaternion(qTilt);

        const sunDir = earthGroup ? getSunDirectionWorld(earthGroup) : null;
        if (sunDir && sunDir.lengthSq() > 0.5) {
            const qSpin = spinQuatToAlign(axis, subVec, sunDir);
            return qSpin.multiply(qTilt);
        }

        let spin = 0;
        if (typeof Astronomy !== 'undefined' && Astronomy.MakeTime) {
            const t = Astronomy.MakeTime(date instanceof Date ? date : new Date());
            spin = Astronomy.SiderealTime(t) * (Math.PI * 2 / 24);
        }
        const qSpin = new THREE.Quaternion().setFromAxisAngle(axis, spin);
        return qSpin.multiply(qTilt);
    }

    /**
     * Geographic point in Earth body frame → world (uses orientGroup only; do not re-apply quat).
     */
    function bodyLatLonToWorld(earthGroup, latDeg, lonDeg, radius) {
        const THREE = getThree();
        if (!THREE || !earthGroup || !earthGroup.userData || !earthGroup.userData.orientGroup) {
            return null;
        }
        const orient = earthGroup.userData.orientGroup;
        const unit = latLonToUnit(latDeg, lonDeg);
        const v = new THREE.Vector3(unit.x, unit.y, unit.z).multiplyScalar(radius);
        earthGroup.updateMatrixWorld(true);
        orient.updateMatrixWorld(true);
        return orient.localToWorld(v);
    }

    /** Subsolar surface point (only place on Earth whose outward normal aims at the Sun). */
    function subsolarSurfaceWorld(earthGroup, date, radius) {
        const sub = getSubsolarGeographic(date);
        return bodyLatLonToWorld(earthGroup, sub.lat, sub.lon, radius);
    }

    function parseGeoFromLocationString(loc) {
        if (!loc || typeof loc !== 'string') return null;
        const s = loc.trim();
        const geo = s.match(/(?:geo:)?(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/i);
        if (geo) {
            const a = parseFloat(geo[1]);
            const b = parseFloat(geo[2]);
            if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
            if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lon: a };
        }
        for (let i = 0; i < LOCATION_HINTS.length; i++) {
            const h = LOCATION_HINTS[i];
            if (h.match.test(s)) return { lat: h.lat, lon: h.lon };
        }
        return null;
    }

    function nearbyHalfSpanMs(zoom) {
        const day = 86400000;
        const hour = 3600000;
        const z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : 9;
        if (z === 0) return hour / 2;
        if (z >= 9) return day;
        if (z >= 8) return 2 * day;
        if (z >= 7) return 7 * day;
        if (z >= 5) return 30 * day;
        if (z >= 3) return 120 * day;
        return 365 * day;
    }

    function inferObserverFromEvents(selectedDate, zoomLevel) {
        const gl = typeof window !== 'undefined' ? window.circaevumGL : null;
        if (!gl || typeof gl.getLayerIds !== 'function' || typeof gl.getEventObjects !== 'function') {
            return null;
        }
        const ref = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
        const halfMs = nearbyHalfSpanMs(zoomLevel);
        const t0 = ref.getTime() - halfMs;
        const t1 = ref.getTime() + halfMs;
        let best = null;
        let bestScore = -1;

        gl.getLayerIds().forEach((layerId) => {
            const layer = gl.getLayer(layerId);
            if (layer && layer.visible === false) return;
            (gl.getEventObjects(layerId) || []).forEach((ev) => {
                if (!ev || !ev.start || isNaN(ev.start.getTime())) return;
                const end = ev.end && ev.end > ev.start ? ev.end : new Date(ev.start.getTime() + 3600000);
                if (end.getTime() < t0 || ev.start.getTime() > t1) return;
                const overlap =
                    Math.min(end.getTime(), t1) - Math.max(ev.start.getTime(), t0);
                if (overlap <= 0) return;
                const geo = parseGeoFromLocationString(ev.location);
                if (!geo) return;
                const score = overlap / (end.getTime() - ev.start.getTime() + 1);
                if (score > bestScore) {
                    bestScore = score;
                    best = geo;
                }
            });
        });
        if (!best) return null;
        return { lat: best.lat, lon: best.lon, source: 'events' };
    }

    function timezoneFallbackObserver(selectedDate) {
        const ref = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
        const offsetMin = -ref.getTimezoneOffset();
        const lon = normalizeLon((offsetMin / 60) * 15);
        let lat = 0;
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            if (/^(America|US)\//.test(tz)) lat = 39;
            else if (/^Europe\//.test(tz)) lat = 50;
            else if (/^Australia\//.test(tz)) lat = -28;
            else if (/^Pacific\//.test(tz) && !/Honolulu/.test(tz)) lat = -15;
        } catch (e) { /* ignore */ }
        return { lat, lon, source: 'timezone' };
    }

    function getObserver(selectedDate, zoomLevel) {
        if (observer && observer.source === 'browser') return observer;
        const fromEvents = inferObserverFromEvents(selectedDate, zoomLevel);
        if (fromEvents) {
            observer = fromEvents;
            return observer;
        }
        if (observer && observer.source === 'events') return observer;
        if (!observer || observer.source === 'timezone') {
            observer = timezoneFallbackObserver(selectedDate);
        }
        return observer;
    }

    function isGeolocationFeatureAllowed() {
        try {
            if (typeof document === 'undefined') return true;
            const policy = document.permissionsPolicy || document.featurePolicy;
            if (policy && typeof policy.allowsFeature === 'function') {
                return policy.allowsFeature('geolocation');
            }
        } catch (e) { /* ignore */ }
        return true;
    }

    function initGeolocationObserver() {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        if (!isGeolocationFeatureAllowed()) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                observer = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    source: 'browser'
                };
                if (typeof window !== 'undefined' && typeof window.createPlanets === 'function') {
                    const z =
                        typeof window.getCurrentZoomLevel === 'function'
                            ? window.getCurrentZoomLevel()
                            : typeof currentZoom !== 'undefined'
                              ? currentZoom
                              : 9;
                    try {
                        window.createPlanets(z);
                    } catch (e) { /* ignore */ }
                }
            },
            () => { /* keep events / timezone fallback */ },
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
        );
    }

    function refreshObserverForSelectedTime(selectedDate, zoomLevel) {
        if (observer && observer.source === 'browser') return;
        const fromEvents = inferObserverFromEvents(selectedDate, zoomLevel);
        if (fromEvents) {
            observer = fromEvents;
            return;
        }
        if (!observer) observer = timezoneFallbackObserver(selectedDate);
    }

    /** Tubular latitude ring (LineBasicMaterial.linewidth is ignored in WebGL). */
    function buildLatCircle(THREE, radius, latDeg, segments, color, opacity, tubeRadius) {
        const lat = latDeg * DEG;
        const y = radius * Math.sin(lat);
        const r = radius * Math.cos(lat);
        const points = [];
        for (let i = 0; i < segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t)));
        }
        const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
        const tr =
            typeof tubeRadius === 'number' && tubeRadius > 0
                ? tubeRadius
                : Math.max(0.012, radius * 0.02);
        const geom = new THREE.TubeGeometry(curve, Math.max(segments, 64), tr, 8, true);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 11;
        return mesh;
    }

    /**
     * Thin great-circle segment on the oriented globe (meridian at lon or parallel at lat).
     */
    function buildObserverGeodesicLine(
        THREE,
        earthGroup,
        radius,
        sampler,
        colorHex,
        opacity,
        tubeRadius,
        renderOrder
    ) {
        if (!THREE || !earthGroup || typeof sampler !== 'function') return null;
        const rSurf = radius * 1.004;
        const steps = 96;
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const ll = sampler(i / steps);
            if (!ll || isNaN(ll.lat) || isNaN(ll.lon)) continue;
            const w = bodyLatLonToWorld(earthGroup, ll.lat, ll.lon, rSurf);
            if (w) points.push(w);
        }
        if (points.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
        const tr =
            typeof tubeRadius === 'number' && tubeRadius > 0
                ? tubeRadius
                : Math.max(0.006, radius * 0.007);
        const geom = new THREE.TubeGeometry(curve, Math.max(steps * 2, 64), tr, 6, false);
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: typeof opacity === 'number' ? opacity : 0.5,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = renderOrder != null ? renderOrder : 12;
        mesh.userData = { type: 'EarthObserverCross' };
        return mesh;
    }

    function addObserverMeridianLatitudeCross(earthGroup, obs, radius, sceneContentGroup) {
        const THREE = getThree();
        if (!THREE || !earthGroup || !obs || !sceneContentGroup) return;
        const lon = normalizeLon(obs.lon);
        const lat = Math.max(-89.5, Math.min(89.5, obs.lat));
        const tubeR = Math.max(0.006, radius * 0.0075);

        const meridian = buildObserverGeodesicLine(
            THREE,
            earthGroup,
            radius,
            function (t) {
                return { lat: -90 + t * 180, lon };
            },
            0xffc857,
            0.62,
            tubeR,
            12
        );
        if (meridian) {
            sceneContentGroup.add(meridian);
            handObjects.push(meridian);
        }

        const parallel = buildObserverGeodesicLine(
            THREE,
            earthGroup,
            radius,
            function (t) {
                return { lat, lon: -180 + t * 360 };
            },
            0x5ec8e8,
            0.5,
            tubeR * 0.92,
            12
        );
        if (parallel) {
            sceneContentGroup.add(parallel);
            handObjects.push(parallel);
        }
    }

    function buildRadialTube(THREE, start, end, tubeRadius, colorHex, renderOrder) {
        const a = new THREE.Vector3(start.x, start.y, start.z);
        const b = new THREE.Vector3(end.x, end.y, end.z);
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        if (len < 1e-6) return null;
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const geom = new THREE.CylinderGeometry(tubeRadius, tubeRadius, len, 10, 1, false);
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.92,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(mid);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        mesh.renderOrder = renderOrder;
        return mesh;
    }

    function disposeObject3D(obj) {
        if (!obj) return;
        if (obj.parent) obj.parent.remove(obj);
        obj.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                else child.material.dispose();
            }
        });
    }

    function disposeHandObjects() {
        handObjects.forEach(disposeObject3D);
        handObjects = [];
    }

    /** At day/clock/landing zoom: semi-transparent shell so circadian lines read through. */
    function applyGlobeMaterialStyle(mesh, zoomLevel) {
        if (!mesh || !mesh.material) return;
        const detail = isGlobeDetailZoom(zoomLevel);
        mesh.material.transparent = detail;
        mesh.material.opacity = detail ? 0.36 : 1;
        mesh.material.depthWrite = !detail;
        mesh.material.needsUpdate = true;
    }

    /**
     * Semi-transparent disk + white rim in scene XZ (orbital plane); fixed inside Earth (no daily spin).
     * @returns {THREE.Group}
     */
    function buildOrbitalPlaneInterior(THREE, planetSize) {
        const group = new THREE.Group();
        const r =
            typeof planetSize === 'number' && planetSize > 0 ? planetSize * 0.93 : 1.8;
        const eqTube = Math.max(0.018, planetSize * 0.032);

        const geom = new THREE.CircleGeometry(r, 72);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x5eb8e8,
            transparent: true,
            opacity: 0.26,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const disk = new THREE.Mesh(geom, mat);
        disk.rotation.x = -Math.PI / 2;
        disk.renderOrder = 4;
        group.add(disk);

        const ring = buildLatCircle(THREE, r, 0, 96, 0xffffff, 0.92, eqTube);
        ring.renderOrder = 5;
        group.add(ring);

        group.userData.orbitalPlaneDisk = disk;
        group.userData.orbitalPlaneRing = ring;
        return group;
    }

    function applyOrbitalPlaneInteriorStyle(interior, zoomLevel) {
        if (!interior) return;
        const detail = isGlobeDetailZoom(zoomLevel);
        interior.visible = detail;
        const disk = interior.userData && interior.userData.orbitalPlaneDisk;
        if (disk && disk.material) {
            disk.material.opacity = detail ? 0.22 : 0.26;
            disk.material.needsUpdate = true;
        }
    }

    /**
     * @returns {THREE.Group}
     */
    function createEarthPlanet(options) {
        const THREE = getThree();
        const {
            planetSize,
            color,
            zoomLevel,
            position,
            parentGroup
        } = options;
        if (!THREE || !parentGroup) return null;

        const earthGroup = new THREE.Group();
        earthGroup.position.set(position.x, position.y, position.z);

        const orientGroup = new THREE.Group();
        earthGroup.add(orientGroup);

        const geometry = new THREE.SphereGeometry(planetSize, 48, 48);
        const material = new THREE.MeshStandardMaterial({
            color: color || 0x2d8cff,
            metalness: 0.25,
            roughness: 0.72
        });
        const mesh = new THREE.Mesh(geometry, material);
        applyGlobeMaterialStyle(mesh, zoomLevel);
        orientGroup.add(mesh);

        const eqTube = Math.max(0.018, planetSize * 0.032);
        const tropTube = Math.max(0.014, planetSize * 0.024);
        const arcTube = Math.max(0.012, planetSize * 0.022);
        const eq = buildLatCircle(THREE, planetSize, 0, 96, 0x7ec8e3, 0.9, eqTube);
        const tropN = buildLatCircle(THREE, planetSize, TROPIC_DEG, 72, 0xffb347, 0.78, tropTube);
        const tropS = buildLatCircle(THREE, planetSize, -TROPIC_DEG, 72, 0xffb347, 0.78, tropTube);
        const arcN = buildLatCircle(THREE, planetSize, ARCTIC_DEG, 64, 0xe8f4fc, 0.82, arcTube);
        const arcS = buildLatCircle(THREE, planetSize, -ARCTIC_DEG, 64, 0xe8f4fc, 0.82, arcTube);
        orientGroup.add(eq, tropN, tropS, arcN, arcS);

        const orbitalPlaneInterior = buildOrbitalPlaneInterior(THREE, planetSize);
        applyOrbitalPlaneInteriorStyle(orbitalPlaneInterior, zoomLevel);
        earthGroup.add(orbitalPlaneInterior);

        earthGroup.userData = {
            name: 'Earth',
            earthMesh: mesh,
            orientGroup,
            orbitalPlaneInterior,
            globeRadius: planetSize,
            baseHeight: position.y
        };

        parentGroup.add(earthGroup);
        return earthGroup;
    }

    function updateOrientation(earthGroup, date) {
        if (!earthGroup || !earthGroup.userData || !earthGroup.userData.orientGroup) return;
        const q = computeEarthOrientationQuat(date, earthGroup);
        if (q) earthGroup.userData.orientGroup.quaternion.copy(q);
    }

    function getEarthCenterAndRadius(earthGroup) {
        const THREE = getThree();
        if (!THREE || !earthGroup) return null;
        const center = new THREE.Vector3();
        earthGroup.getWorldPosition(center);
        const r =
            earthGroup.userData && typeof earthGroup.userData.globeRadius === 'number'
                ? earthGroup.userData.globeRadius
                : 1.95;
        return { center, radius: r };
    }

    function getLocalHourDecimal(date) {
        const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        return (
            d.getHours() +
            d.getMinutes() / 60 +
            d.getSeconds() / 3600 +
            d.getMilliseconds() / 3600000
        );
    }

    /**
     * Clock hour for hour hands / numerals. Uses `date` when provided (e.g. wall-clock `Date` for red “now” hand).
     * Falls back to navigation selected time only when no valid date is passed.
     */
    function getSelectedHourDecimal(date) {
        if (date instanceof Date && !isNaN(date.getTime())) {
            return getLocalHourDecimal(date);
        }
        if (typeof window !== 'undefined' && typeof window.getSelectedDateTime === 'function') {
            const sel = window.getSelectedDateTime();
            if (sel instanceof Date && !isNaN(sel.getTime())) {
                return getLocalHourDecimal(sel);
            }
        }
        return getLocalHourDecimal(date);
    }

    /**
     * Blue-hand latitude on the user's meridian: subsolar declination at local noon,
     * negated at midnight (e.g. June 22 → Cancer at noon, Capricorn at midnight).
     */
    function getMeridianHandLatitudeForHour(date) {
        const sub = getSubsolarGeographic(date);
        const hour = getSelectedHourDecimal(date);
        return sub.lat * Math.cos(((hour - 12) / 12) * Math.PI);
    }

    /**
     * Selected-time hour hand direction in orbital XZ (matches timemarker numerals).
     */
    function getSelectedHourClockDirectionXZ(earthGroup, date, selectedDateHeight, center) {
        const THREE = getThree();
        if (!THREE || !center) return null;
        const tip = getHourLabelTipWorldXZ(earthGroup, date, 1, selectedDateHeight);
        if (!tip) return null;
        const v = tip.clone().sub(center);
        const xz = new THREE.Vector3(v.x, 0, v.z);
        if (xz.lengthSq() < 1e-12) return null;
        return xz.normalize();
    }

    function getMeridianHandTipWorld(earthGroup, date, hourNumberRadius, selectedDateHeight, center) {
        const THREE = getThree();
        if (!THREE || !center) return null;
        const dirXZ = getSelectedHourClockDirectionXZ(earthGroup, date, selectedDateHeight, center);
        if (!dirXZ) return null;
        const r =
            typeof hourNumberRadius === 'number' && hourNumberRadius > 0
                ? hourNumberRadius
                : 1.95 * 2.2;
        const tip = center.clone().add(dirXZ.clone().multiplyScalar(r));
        if (typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)) {
            tip.y = selectedDateHeight;
        }
        return tip;
    }

    function getOrbitalRingHandMarkerWorld(earthGroup, date, ringRadius, center, selectedDateHeight) {
        const THREE = getThree();
        if (!THREE || !center) return null;
        const dirXZ = getSelectedHourClockDirectionXZ(earthGroup, date, selectedDateHeight, center);
        if (!dirXZ) return null;
        const r = typeof ringRadius === 'number' && ringRadius > 0 ? ringRadius : 1.8;
        return center.clone().add(dirXZ.clone().multiplyScalar(r));
    }

    /**
     * If stored longitude puts the user on the wrong hemisphere vs the selected-time clock hand, flip meridian.
     */
    function getObserverAlignedToMeridianHand(earthGroup, date, zoomLevel, selectedDateHeight) {
        const obs = getObserver(date, zoomLevel);
        if (!obs) return null;
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return obs;
        updateOrientation(earthGroup, date);
        const clockDir = getSelectedHourClockDirectionXZ(earthGroup, date, selectedDateHeight, ctx.center);
        const surf = bodyLatLonToWorld(earthGroup, obs.lat, obs.lon, 1);
        if (!clockDir || !surf) return obs;
        const uXZ = new THREE.Vector3(surf.x - ctx.center.x, 0, surf.z - ctx.center.z);
        if (uXZ.lengthSq() < 1e-12) return obs;
        uXZ.normalize();
        if (uXZ.dot(clockDir) < 0) {
            return { lat: obs.lat, lon: normalizeLon(obs.lon + 180), source: obs.source };
        }
        return obs;
    }

    /** True user location (gold pin). */
    function getObserverSurfaceWorld(earthGroup, date, zoomLevel, radius, hourNumberRadius, selectedDateHeight) {
        const obs = getObserverAlignedToMeridianHand(earthGroup, date, zoomLevel, selectedDateHeight);
        if (!obs) return null;
        updateOrientation(earthGroup, date);
        return bodyLatLonToWorld(earthGroup, obs.lat, obs.lon, radius);
    }

    /** Blue-hand anchor on user longitude at hour-scaled subsolar latitude. */
    function getMeridianHandSurfaceWorld(earthGroup, date, userLon, radius) {
        if (userLon == null || isNaN(userLon)) return null;
        updateOrientation(earthGroup, date);
        const lat = getMeridianHandLatitudeForHour(date);
        return bodyLatLonToWorld(earthGroup, lat, userLon, radius);
    }

    /**
     * Hour-label tip in the orbital XZ clock (matches timemarker numerals / getEarthHourHandPointAtRadius).
     */
    function getHourLabelTipWorldXZ(earthGroup, date, hourNumberRadius, selectedDateHeight) {
        const THREE = getThree();
        if (!THREE || !earthGroup) return null;
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        const y =
            typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)
                ? selectedDateHeight
                : ctx.center.y;
        const earthPos = { x: ctx.center.x, z: ctx.center.z };
        const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
        const hourFrac = getSelectedHourDecimal(safeDate) / 24;
        const hourAngleFromEarth = sunToEarthAngle - hourFrac * Math.PI * 2;
        const r =
            typeof hourNumberRadius === 'number' && hourNumberRadius > 0
                ? hourNumberRadius
                : ctx.radius * 2.2;
        return new THREE.Vector3(
            earthPos.x + Math.cos(hourAngleFromEarth) * r,
            y,
            earthPos.z + Math.sin(hourAngleFromEarth) * r
        );
    }

    function getHourLabelTipWorld(earthGroup, date, hourNumberRadius, selectedDateHeight) {
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (ctx) {
            const tip = getMeridianHandTipWorld(
                earthGroup,
                date,
                hourNumberRadius,
                selectedDateHeight,
                ctx.center
            );
            if (tip) return tip;
        }
        return getHourLabelTipWorldXZ(earthGroup, date, hourNumberRadius, selectedDateHeight);
    }

    /**
     * Blue time hand: Earth center → orbital-ring marker (XZ) → hour radius; aligned with solar time on user meridian.
     */
    function getMeridianHandGeometry(earthGroup, date, zoomLevel, hourNumberRadius, selectedDateHeight, userLon) {
        const THREE = getThree();
        if (!THREE || !earthGroup) return null;
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        const obs = getObserver(date, zoomLevel);
        const lon = userLon != null && !isNaN(userLon) ? userLon : obs ? obs.lon : null;
        if (lon == null || isNaN(lon)) return null;

        const ringR = ctx.radius * 0.93;
        const ringMarker = getOrbitalRingHandMarkerWorld(
            earthGroup,
            date,
            ringR,
            ctx.center,
            selectedDateHeight
        );
        const meridianSurface = getMeridianHandSurfaceWorld(earthGroup, date, lon, ctx.radius);
        let tip = getMeridianHandTipWorld(
            earthGroup,
            date,
            hourNumberRadius,
            selectedDateHeight,
            ctx.center
        );
        if (!ringMarker || !tip) return null;
        tip = ensureTipOutsideSphere(ctx.center, tip, hourNumberRadius);
        const exit = hourHandExitOnSphere(ctx.center, tip, ctx.radius) || meridianSurface;
        return {
            center: ctx.center,
            meridianSurface: ringMarker,
            globeMeridian: meridianSurface,
            exit,
            tip,
            handLat: getMeridianHandLatitudeForHour(date),
            subsolar: getSubsolarGeographic(date)
        };
    }

    /** World point for main.js hour helpers: globe surface = meridian hand; outer = label tip. */
    function getHourHandPointAtRadius(earthGroup, date, zoomLevel, radialDistance, userLon, selectedDateHeight) {
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        const rGlobe =
            typeof ctx.radius === 'number' && ctx.radius > 0 ? ctx.radius : 1.95;
        const useTip = radialDistance > rGlobe * 1.85;
        const obs = getObserverAlignedToMeridianHand(earthGroup, date, zoomLevel, selectedDateHeight);
        const lon = obs ? obs.lon : userLon;

        if (useTip) {
            const tip = getMeridianHandTipWorld(
                earthGroup,
                date,
                radialDistance,
                selectedDateHeight,
                ctx.center
            );
            if (!tip) return null;
            return { x: tip.x, y: tip.y, z: tip.z };
        }
        const ringMark = getOrbitalRingHandMarkerWorld(
            earthGroup,
            date,
            radialDistance,
            ctx.center,
            selectedDateHeight
        );
        if (ringMark) return { x: ringMark.x, y: ringMark.y, z: ringMark.z };
        const surf = getMeridianHandSurfaceWorld(earthGroup, date, lon, radialDistance);
        if (!surf) return null;
        return { x: surf.x, y: surf.y, z: surf.z };
    }

    /** Where center→hour-tip ray exits the sphere (same direction as hour numerals). */
    function hourHandExitOnSphere(center, tip, radius) {
        const THREE = getThree();
        if (!THREE || !tip || !center) return null;
        const dir = tip.clone().sub(center);
        if (dir.lengthSq() < 1e-12) return null;
        dir.normalize();
        return center.clone().add(dir.multiplyScalar(radius));
    }

    function ensureTipOutsideSphere(center, tip, minRadius) {
        const THREE = getThree();
        if (!THREE || !tip || !center) return tip;
        const v = tip.clone().sub(center);
        const dist = v.length();
        if (dist < minRadius * 1.002) {
            if (dist < 1e-12) v.set(1, 0, 0);
            else v.normalize();
            return center.clone().add(v.multiplyScalar(minRadius));
        }
        return tip;
    }

    function getMeridianHandWorldPoints(earthGroup, selectedDate, userLon, hourNumberRadius, selectedDateHeight, zoomLevel) {
        const zl = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : 9;
        const geom = getMeridianHandGeometry(
            earthGroup,
            selectedDate,
            zl,
            hourNumberRadius,
            selectedDateHeight,
            userLon
        );
        if (!geom) return null;
        return {
            center: geom.center,
            exit: geom.exit || geom.meridianSurface,
            meridianMark: geom.meridianSurface,
            tip: geom.tip,
            handLat: geom.handLat,
            subsolar: geom.subsolar
        };
    }

    function getMeridianHandFocusPoint(earthGroup, selectedDate, userLon, hourNumberRadius, selectedDateHeight) {
        const pts = getMeridianHandWorldPoints(
            earthGroup,
            selectedDate,
            userLon,
            hourNumberRadius,
            selectedDateHeight
        );
        if (!pts || !pts.tip) return null;
        return {
            x: (pts.center.x + pts.tip.x) * 0.5,
            y: (pts.center.y + pts.tip.y) * 0.5,
            z: (pts.center.z + pts.tip.z) * 0.5
        };
    }

    function updateGlobeHands(params) {
        const THREE = getThree();
        disposeHandObjects();
        if (!THREE || !params || !params.earthGroup || !params.sceneContentGroup) return;
        if (!isGlobeDetailZoom(params.zoomLevel)) return;

        const {
            earthGroup,
            selectedDate,
            currentDate,
            hourNumberRadius,
            selectedDateHeight,
            sceneContentGroup,
            tourMinimalOrbitMode,
            getSelectedTimeColor
        } = params;

        refreshObserverForSelectedTime(selectedDate, params.zoomLevel);
        const obs = getObserverAlignedToMeridianHand(
            earthGroup,
            selectedDate,
            params.zoomLevel,
            selectedDateHeight
        );
        if (!obs) return;

        updateOrientation(earthGroup, selectedDate);

        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return;

        const userSurface = getObserverSurfaceWorld(
            earthGroup,
            selectedDate,
            params.zoomLevel,
            ctx.radius,
            hourNumberRadius,
            selectedDateHeight
        );
        if (!userSurface) return;

        const pinR = Math.max(0.018, ctx.radius * 0.055);
        const pinGeom = new THREE.SphereGeometry(pinR, 12, 12);
        const pinMat = new THREE.MeshBasicMaterial({
            color: 0xffc857,
            transparent: true,
            opacity: 0.95,
            depthWrite: false
        });
        const pin = new THREE.Mesh(pinGeom, pinMat);
        pin.position.copy(userSurface);
        pin.renderOrder = 17;
        sceneContentGroup.add(pin);
        handObjects.push(pin);

        addObserverMeridianLatitudeCross(earthGroup, obs, ctx.radius, sceneContentGroup);

        const goldHandR = Math.max(0.02, ctx.radius * 0.022);
        const goldHand = buildRadialTube(
            THREE,
            { x: ctx.center.x, y: ctx.center.y, z: ctx.center.z },
            { x: userSurface.x, y: userSurface.y, z: userSurface.z },
            goldHandR,
            0xffc857,
            16
        );
        if (goldHand) {
            sceneContentGroup.add(goldHand);
            handObjects.push(goldHand);
        }

        const handR = Math.max(0.022, ctx.radius * 0.024);
        const selColor = typeof getSelectedTimeColor === 'function' ? getSelectedTimeColor() : 0x2d8cff;

        function addMeridianHand(date, colorHex, order) {
            const geom = getMeridianHandGeometry(
                earthGroup,
                date,
                params.zoomLevel,
                hourNumberRadius,
                selectedDateHeight,
                obs.lon
            );
            if (!geom || !geom.meridianSurface || !geom.tip) return;

            const markR = Math.max(0.018, ctx.radius * 0.038);
            const markGeom = new THREE.SphereGeometry(markR, 10, 10);
            const markMat = new THREE.MeshBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            });
            const mark = new THREE.Mesh(markGeom, markMat);
            mark.position.copy(geom.meridianSurface);
            mark.renderOrder = order + 1;
            sceneContentGroup.add(mark);
            handObjects.push(mark);

            const spoke = buildRadialTube(
                THREE,
                { x: geom.center.x, y: geom.center.y, z: geom.center.z },
                { x: geom.tip.x, y: geom.tip.y, z: geom.tip.z },
                handR,
                colorHex,
                order
            );
            if (spoke) {
                sceneContentGroup.add(spoke);
                handObjects.push(spoke);
            }
        }

        addMeridianHand(selectedDate, selColor, 13);
        if (!tourMinimalOrbitMode && currentDate) {
            addMeridianHand(currentDate, 0xff4d4d, 14);
        }
    }

    function setGlobeZoomAppearance(earthGroup, zoomLevel) {
        if (!earthGroup || !earthGroup.userData || !earthGroup.userData.earthMesh) return;
        applyGlobeMaterialStyle(earthGroup.userData.earthMesh, zoomLevel);
        if (earthGroup.userData.orbitalPlaneInterior) {
            applyOrbitalPlaneInteriorStyle(earthGroup.userData.orbitalPlaneInterior, zoomLevel);
        }
        const orient = earthGroup.userData.orientGroup;
        if (orient) {
            const detail = isGlobeDetailZoom(zoomLevel);
            orient.traverse(function (child) {
                if (!child.isMesh || !child.material) return;
                if (child === earthGroup.userData.earthMesh) return;
                if (child.material.isMeshBasicMaterial || child.material.isMeshStandardMaterial) {
                    child.material.transparent = true;
                    child.material.opacity = detail ? 0.55 : 0.9;
                    child.material.depthWrite = false;
                    child.material.needsUpdate = true;
                }
            });
        }
    }

    function disposeEarthGroup(earthGroup) {
        disposeHandObjects();
        if (!earthGroup) return;
        disposeObject3D(earthGroup);
    }

    function getDefaultPolarHourAngleXZ(earthGroup, selectedDate, selectedDateHeight, zoomLevel) {
        const zl = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : 9;
        const obs = getObserver(selectedDate, zl);
        const ctx = earthGroup ? getEarthCenterAndRadius(earthGroup) : null;
        const hourR = ctx ? ctx.radius * 2.2 : 4;
        const tip =
            earthGroup && obs
                ? getHourLabelTipWorld(earthGroup, selectedDate, hourR, selectedDateHeight)
                : null;
        if (tip && ctx) {
            return Math.atan2(tip.z - ctx.center.z, tip.x - ctx.center.x);
        }
        return null;
    }

    if (typeof window !== 'undefined') {
        window.EarthGlobe = {
            isGlobeDetailZoom,
            initGeolocationObserver,
            refreshObserverForSelectedTime,
            getObserver,
            createEarthPlanet,
            updateOrientation,
            updateGlobeHands,
            disposeHandObjects,
            disposeEarthGroup,
            setGlobeZoomAppearance,
            getMeridianHandFocusPoint,
            getMeridianHandWorldPoints,
            getDefaultPolarHourAngleXZ,
            getHourHandPointAtRadius,
            getSubsolarGeographic
        };
    }

    return {
        isGlobeDetailZoom,
        initGeolocationObserver,
        refreshObserverForSelectedTime,
        getObserver,
        createEarthPlanet,
        updateOrientation,
        updateGlobeHands,
        disposeHandObjects,
        disposeEarthGroup,
        setGlobeZoomAppearance,
        getMeridianHandFocusPoint,
        getMeridianHandWorldPoints,
        getDefaultPolarHourAngleXZ,
        getHourHandPointAtRadius,
        getSubsolarGeographic
    };
})();
