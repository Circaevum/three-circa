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

    /** Representative central meridian for IANA zones (better than offset×15 alone). */
    const TZ_CENTRAL_LON = {
        'America/Los_Angeles': -122.4194,
        'America/Vancouver': -123.1207,
        'America/Denver': -104.9903,
        'America/Phoenix': -112.074,
        'America/Chicago': -87.6298,
        'America/Mexico_City': -99.1332,
        'America/New_York': -74.006,
        'America/Toronto': -79.3832,
        'America/Sao_Paulo': -46.6333,
        'Europe/London': -0.1278,
        'Europe/Paris': 2.3522,
        'Europe/Berlin': 13.405,
        'Europe/Moscow': 37.6173,
        'Asia/Tokyo': 139.6917,
        'Asia/Shanghai': 121.4737,
        'Asia/Kolkata': 77.209,
        'Australia/Sydney': 151.2093,
        'Pacific/Auckland': 174.7633,
        'Pacific/Honolulu': -157.8583
    };

    /** @type {{ lat: number, lon: number, source: string } | null} */
    let urlObserver = null;
    let observerSourceLogged = false;

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

    function nearbyHalfSpanMs(zoom, refDate) {
        const day = 86400000;
        const hour = 3600000;
        const z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : 9;
        if (z === 7 && typeof MoonMechanics !== 'undefined' && typeof MoonMechanics.fullMoonBoundsAroundRef === 'function') {
            const ref =
                refDate instanceof Date && !isNaN(refDate.getTime())
                    ? refDate
                    : typeof getSelectedDateTime === 'function'
                      ? getSelectedDateTime()
                      : new Date();
            const b = MoonMechanics.fullMoonBoundsAroundRef(ref);
            return Math.max(day, (b.t1 - b.t0) / 2);
        }
        if (z === 0) return hour / 2;
        if (z >= 9) return day;
        if (z >= 8) return 2 * day;
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
        const halfMs = nearbyHalfSpanMs(zoomLevel, ref);
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

    function parseObserverFromUrl() {
        try {
            if (typeof window === 'undefined' || !window.location) return null;
            const params = new URLSearchParams(window.location.search);
            const latP = params.get('lat');
            const lonP = params.get('lon');
            if (latP != null && lonP != null) {
                const lat = parseFloat(latP);
                const lon = parseFloat(lonP);
                if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                    return { lat, lon: normalizeLon(lon), source: 'url' };
                }
            }
            const raw = params.get('geo') || params.get('latlon');
            if (raw) {
                const geo = parseGeoFromLocationString(raw);
                if (geo) return { lat: geo.lat, lon: normalizeLon(geo.lon), source: 'url' };
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function logObserverSourceOnce(obs, detail) {
        if (observerSourceLogged || typeof console === 'undefined') return;
        observerSourceLogged = true;
        const msg = detail
            ? `[Circaevum] Earth observer: ${obs.source} (${obs.lat.toFixed(2)}, ${obs.lon.toFixed(2)}) — ${detail}`
            : `[Circaevum] Earth observer: ${obs.source} (${obs.lat.toFixed(2)}, ${obs.lon.toFixed(2)})`;
        if (obs.source === 'browser' || obs.source === 'url') {
            console.info(msg);
        } else {
            console.info(
                msg +
                    ' — allow location in the browser, or set ?geo=lat,lon on the URL for your place.'
            );
        }
    }

    function timezoneFallbackObserver(selectedDate) {
        const ref = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
        const offsetMin = -ref.getTimezoneOffset();
        let lon = normalizeLon((offsetMin / 60) * 15);
        let lat = 0;
        let tz = '';
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            if (tz && Object.prototype.hasOwnProperty.call(TZ_CENTRAL_LON, tz)) {
                lon = TZ_CENTRAL_LON[tz];
            }
            if (/^(America|US)\//.test(tz)) lat = 39;
            else if (/^Europe\//.test(tz)) lat = 50;
            else if (/^Australia\//.test(tz)) lat = -28;
            else if (/^Pacific\//.test(tz) && !/Honolulu/.test(tz)) lat = -15;
        } catch (e) { /* ignore */ }
        return { lat, lon, source: 'timezone', timeZone: tz || undefined };
    }

    function getObserver(selectedDate, zoomLevel) {
        if (!urlObserver) {
            urlObserver = parseObserverFromUrl();
        }
        if (urlObserver) {
            logObserverSourceOnce(urlObserver);
            return urlObserver;
        }
        if (observer && observer.source === 'browser') {
            logObserverSourceOnce(observer);
            return observer;
        }
        const fromEvents = inferObserverFromEvents(selectedDate, zoomLevel);
        if (fromEvents) {
            observer = fromEvents;
            logObserverSourceOnce(observer, 'from nearby event location');
            return observer;
        }
        if (observer && observer.source === 'events') {
            logObserverSourceOnce(observer);
            return observer;
        }
        if (!observer || observer.source === 'timezone') {
            observer = timezoneFallbackObserver(selectedDate);
        }
        logObserverSourceOnce(observer);
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
        if (!urlObserver) {
            urlObserver = parseObserverFromUrl();
        }
        if (urlObserver) return;

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            console.info(
                '[Circaevum] Geolocation API not available — using timezone for Earth observer. Use ?geo=lat,lon to override.'
            );
            return;
        }
        if (!isGeolocationFeatureAllowed()) {
            console.info(
                '[Circaevum] Geolocation blocked by permissions policy (common in embedded iframes) — using timezone. Use ?geo=lat,lon or open the GL on its own origin.'
            );
            return;
        }

        const requestGeo = () => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    observer = {
                        lat: pos.coords.latitude,
                        lon: normalizeLon(pos.coords.longitude),
                        source: 'browser'
                    };
                    observerSourceLogged = false;
                    logObserverSourceOnce(observer, 'browser geolocation');
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
                (err) => {
                    const code = err && err.code;
                    const reason =
                        code === 1
                            ? 'permission denied'
                            : code === 2
                              ? 'position unavailable'
                              : code === 3
                                ? 'timeout'
                                : 'unavailable';
                    console.info(
                        `[Circaevum] Could not read browser location (${reason}) — using timezone for Earth observer. Allow location or add ?geo=lat,lon to the URL.`
                    );
                },
                { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
            );
        };

        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            navigator.permissions
                .query({ name: 'geolocation' })
                .then((status) => {
                    if (status.state === 'denied') {
                        console.info(
                            '[Circaevum] Geolocation permission denied — using timezone for Earth observer. Allow location in site settings or use ?geo=lat,lon.'
                        );
                        return;
                    }
                    requestGeo();
                })
                .catch(() => requestGeo());
        } else {
            requestGeo();
        }
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

    const OBSERVER_GREEN = 0x4dff6a;
    const SELECTED_TIME_HAND_CYAN = 0x22d3ee;
    const CURRENT_TIME_HAND_RED = 0xff4d4d;

    function addObserverMeridianLatitudeCross(earthGroup, obs, radius, sceneContentGroup) {
        const THREE = getThree();
        if (!THREE || !earthGroup || !obs || !sceneContentGroup) return;
        const lon = normalizeLon(obs.lon);
        const lat = Math.max(-89.5, Math.min(89.5, obs.lat));
        const tubeR = Math.max(0.009, radius * 0.01);

        const meridian = buildObserverGeodesicLine(
            THREE,
            earthGroup,
            radius,
            function (t) {
                return { lat: -90 + t * 180, lon };
            },
            OBSERVER_GREEN,
            0.96,
            tubeR,
            14
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
            OBSERVER_GREEN,
            0.9,
            tubeR * 0.95,
            12
        );
        if (parallel) {
            sceneContentGroup.add(parallel);
            handObjects.push(parallel);
        }
    }

    function buildRadialTube(THREE, start, end, tubeRadius, colorHex, renderOrder, opacity) {
        const a = new THREE.Vector3(start.x, start.y, start.z);
        const b = new THREE.Vector3(end.x, end.y, end.z);
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        if (len < 1e-6) return null;
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const geom = new THREE.CylinderGeometry(tubeRadius, tubeRadius, len, 10, 1, false);
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: opacity < 1,
            opacity: typeof opacity === 'number' ? opacity : 0.92,
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

    /** Earth shell: opaque at all zooms; emissive lift at 0/8/9 so polar/near cameras still read it. */
    function applyGlobeMaterialStyle(mesh, zoomLevel) {
        const THREE = getThree();
        if (!mesh || !mesh.material) return;
        const detail = isGlobeDetailZoom(zoomLevel);
        mesh.material.transparent = false;
        mesh.material.opacity = 1;
        mesh.material.depthWrite = true;
        mesh.material.depthTest = true;
        if (THREE && mesh.material.emissive) {
            mesh.material.emissive.setHex(detail ? 0x0a2848 : 0x061018);
            mesh.material.emissiveIntensity = zoomLevel === 0 ? 0.22 : detail ? 0.08 : 0.04;
        }
        if (THREE) {
            mesh.material.side = detail ? THREE.DoubleSide : THREE.FrontSide;
        }
        mesh.renderOrder = detail ? 6 : 0;
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
        const material = new THREE.MeshLambertMaterial({
            color: color || 0x12406e
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

    /** Mean local solar hour at observer longitude for this instant (UTC + lon/15). */
    function getObserverLocalHourDecimal(date, lonDeg) {
        const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        const utcH =
            d.getUTCHours() +
            d.getUTCMinutes() / 60 +
            d.getUTCSeconds() / 3600 +
            d.getUTCMilliseconds() / 3600000;
        let local = utcH + normalizeLon(lonDeg) / 15;
        return ((local % 24) + 24) % 24;
    }

    /**
     * Hour fraction for scene clock (timemarkers, globe hands, polar camera).
     * Observer longitude when known; else browser-local on `date`.
     */
    function getSceneHourDecimal(date, userLon) {
        if (userLon != null && !isNaN(userLon)) {
            return getObserverLocalHourDecimal(date, userLon);
        }
        return getSelectedHourDecimal(date);
    }

    /**
     * Orbital XZ angle for an instant: project user meridian at local solar hour onto the
     * oriented globe (same frame as the green graticule).
     */
    function getSceneHourAngleXZ(earthGroup, date, selectedDateHeight, userLon) {
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        if (earthGroup && userLon != null && !isNaN(userLon)) {
            updateOrientation(earthGroup, safeDate);
            const lon = normalizeLon(userLon);
            const hour = getSceneHourDecimal(safeDate, lon);
            const lat = getMeridianHandLatitudeForHourDecimal(hour, safeDate);
            const p = bodyLatLonToWorld(earthGroup, lat, lon, 1);
            if (p) {
                const dx = p.x - ctx.center.x;
                const dz = p.z - ctx.center.z;
                if (dx * dx + dz * dz > 1e-12) {
                    return Math.atan2(dz, dx);
                }
            }
        }
        const sunToEarthAngle = Math.atan2(ctx.center.z, ctx.center.x);
        const hourFrac = getSceneHourDecimal(safeDate, userLon) / 24;
        return sunToEarthAngle - hourFrac * Math.PI * 2;
    }

    /** XZ angle for hour index 0–23 on the observer meridian (hour labels / dial). */
    function getSceneHourAngleXZForHourIndex(earthGroup, hourIndex, date, userLon) {
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx || !earthGroup || userLon == null || isNaN(userLon)) return null;
        const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        updateOrientation(earthGroup, safeDate);
        const lon = normalizeLon(userLon);
        const h = ((Math.floor(hourIndex) % 24) + 24) % 24;
        const lat = getMeridianHandLatitudeForHourDecimal(h, safeDate);
        const p = bodyLatLonToWorld(earthGroup, lat, lon, 1);
        if (!p) return null;
        const dx = p.x - ctx.center.x;
        const dz = p.z - ctx.center.z;
        if (dx * dx + dz * dz < 1e-12) return null;
        return Math.atan2(dz, dx);
    }

    function getSceneHourPointAtRadius(earthGroup, date, userLon, radialDistance, selectedDateHeight) {
        const THREE = getThree();
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!THREE || !ctx) return null;
        const angle = getSceneHourAngleXZ(earthGroup, date, selectedDateHeight, userLon);
        if (angle == null || isNaN(angle)) return null;
        const y =
            typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)
                ? selectedDateHeight
                : ctx.center.y;
        const r =
            typeof radialDistance === 'number' && radialDistance > 0
                ? radialDistance
                : ctx.radius * 2.2;
        const center = new THREE.Vector3(ctx.center.x, y, ctx.center.z);
        return new THREE.Vector3(
            center.x + Math.cos(angle) * r,
            y,
            center.z + Math.sin(angle) * r
        );
    }

    function getMeridianHandLatitudeForHourDecimal(hourDecimal, date) {
        const sub = getSubsolarGeographic(date);
        return sub.lat * Math.cos(((hourDecimal - 12) / 12) * Math.PI);
    }

    /**
     * Blue-hand latitude on the user's meridian: subsolar declination at local noon,
     * negated at midnight (e.g. June 22 → Cancer at noon, Capricorn at midnight).
     */
    function getMeridianHandLatitudeForHour(date, userLon) {
        const hour =
            userLon != null && !isNaN(userLon)
                ? getObserverLocalHourDecimal(date, userLon)
                : getSelectedHourDecimal(date);
        return getMeridianHandLatitudeForHourDecimal(hour, date);
    }

    /**
     * Straight hour-hand ray: Earth center → user meridian at local solar hour (observer lon).
     * @returns {{ dir: THREE.Vector3, hour: number, lat: number, center: THREE.Vector3, radius: number } | null}
     */
    function getMeridianHandUnitDirection(earthGroup, date, userLon) {
        const THREE = getThree();
        if (!THREE || !earthGroup || userLon == null || isNaN(userLon)) return null;
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        updateOrientation(earthGroup, date);
        const lon = normalizeLon(userLon);
        const hour = getObserverLocalHourDecimal(date, lon);
        const lat = getMeridianHandLatitudeForHourDecimal(hour, date);
        const p = bodyLatLonToWorld(earthGroup, lat, lon, ctx.radius);
        if (!p) return null;
        const dir = p.clone().sub(ctx.center);
        if (dir.lengthSq() < 1e-12) return null;
        return {
            dir: dir.normalize(),
            hour,
            lat,
            center: ctx.center,
            radius: ctx.radius
        };
    }

    /**
     * Hour hand in orbital XZ: center → white ring on scene-hour ray → radial tip (y = slice height).
     */
    function getOrbitalPlaneMeridianHandPack(earthGroup, date, userLon, hourNumberRadius, selectedDateHeight) {
        const THREE = getThree();
        if (!THREE || !earthGroup) return null;
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        const lon = userLon != null && !isNaN(userLon) ? normalizeLon(userLon) : null;
        const y =
            typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)
                ? selectedDateHeight
                : ctx.center.y;

        updateOrientation(earthGroup, date);
        const angle = getSceneHourAngleXZ(earthGroup, date, selectedDateHeight, lon);
        if (angle == null || isNaN(angle)) return null;

        const dirXZ = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const ringR = ctx.radius * 0.93;
        const hourR =
            typeof hourNumberRadius === 'number' && hourNumberRadius > 0
                ? hourNumberRadius
                : ctx.radius * 2.2;
        const center = new THREE.Vector3(ctx.center.x, y, ctx.center.z);
        const ringMarker = new THREE.Vector3(
            center.x + dirXZ.x * ringR,
            y,
            center.z + dirXZ.z * ringR
        );
        const tip = new THREE.Vector3(
            center.x + dirXZ.x * hourR,
            y,
            center.z + dirXZ.z * hourR
        );

        return {
            center,
            ringMarker,
            tip,
            hour: getSceneHourDecimal(date, lon),
            lon: lon,
            radius: ctx.radius
        };
    }

    function getMeridianHandPointAlongObserver(earthGroup, date, userLon, radialDistance, selectedDateHeight) {
        const pack = getOrbitalPlaneMeridianHandPack(
            earthGroup,
            date,
            userLon,
            radialDistance,
            selectedDateHeight
        );
        if (!pack) return null;
        const r =
            typeof radialDistance === 'number' && radialDistance > 0 ? radialDistance : pack.radius;
        if (r <= pack.radius * 0.94) {
            return pack.ringMarker.clone();
        }
        const dirXZ = new THREE.Vector3(
            pack.tip.x - pack.center.x,
            0,
            pack.tip.z - pack.center.z
        );
        if (dirXZ.lengthSq() < 1e-12) return pack.tip.clone();
        dirXZ.normalize();
        return new THREE.Vector3(
            pack.center.x + dirXZ.x * r,
            pack.center.y,
            pack.center.z + dirXZ.z * r
        );
    }

    /**
     * Selected-time hour hand direction in orbital XZ (matches timemarker numerals).
     */
    function getSelectedHourClockDirectionXZ(earthGroup, date, selectedDateHeight, center, userLon) {
        const THREE = getThree();
        if (!THREE || !center || !earthGroup) return null;
        // Default null → browser-local orbital hour dial (matches red/cyan hands and numerals).
        const lon =
            userLon !== undefined && userLon !== null && !isNaN(userLon) ? userLon : null;
        const angle = getSceneHourAngleXZ(earthGroup, date, selectedDateHeight, lon);
        if (angle == null || isNaN(angle)) return null;
        return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
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

    /** White orbital-plane rim: user meridian ∩ ring (planetSize × 0.93, scene XZ). */
    function getSunRingMeridianMarkerWorld(earthGroup, userLon, ringRadius, center, selectedDateHeight) {
        const THREE = getThree();
        if (!THREE || !earthGroup || !center || userLon == null || isNaN(userLon)) return null;
        const lon = normalizeLon(userLon);
        const equator = bodyLatLonToWorld(earthGroup, 0, lon, 1);
        if (!equator) return null;
        const dx = equator.x - center.x;
        const dz = equator.z - center.z;
        const lenXZ = Math.sqrt(dx * dx + dz * dz);
        if (lenXZ < 1e-12) return null;
        const r = typeof ringRadius === 'number' && ringRadius > 0 ? ringRadius : 1.8;
        const y =
            typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)
                ? selectedDateHeight
                : center.y;
        return new THREE.Vector3(
            center.x + (dx / lenXZ) * r,
            y,
            center.z + (dz / lenXZ) * r
        );
    }

    /**
     * Longitude on the oriented globe where (userLat, lon) lies on the same XZ ray as the
     * browser-local hour dial (cyan/red hand). Searches at user latitude — not equator — to avoid 180° flips.
     */
    function getLongitudeForOrbitalClockXZ(earthGroup, date, selectedDateHeight, userLat, hintLon) {
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx || !earthGroup) {
            return hintLon != null && !isNaN(hintLon) ? normalizeLon(hintLon) : 0;
        }
        const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        updateOrientation(earthGroup, safeDate);
        const clockDir = getSelectedHourClockDirectionXZ(
            earthGroup,
            safeDate,
            selectedDateHeight,
            ctx.center,
            null
        );
        if (!clockDir) {
            return hintLon != null && !isNaN(hintLon) ? normalizeLon(hintLon) : 0;
        }

        const lat =
            typeof userLat === 'number' && !isNaN(userLat)
                ? Math.max(-89.5, Math.min(89.5, userLat))
                : 0;
        let bestLon = hintLon != null && !isNaN(hintLon) ? normalizeLon(hintLon) : 0;
        let bestDot = -2;
        for (let lon = -180; lon <= 180; lon += 1) {
            const p = bodyLatLonToWorld(earthGroup, lat, lon, 1);
            if (!p) continue;
            const uXZ = new THREE.Vector3(p.x - ctx.center.x, 0, p.z - ctx.center.z);
            if (uXZ.lengthSq() < 1e-12) continue;
            uXZ.normalize();
            const d = uXZ.x * clockDir.x + uXZ.z * clockDir.z;
            if (d > bestDot) {
                bestDot = d;
                bestLon = lon;
            }
        }
        return normalizeLon(bestLon);
    }

    /** User pin + green cross: lat from geo, lon snapped to hour-dial meridian at that latitude. */
    function getObserverDisplayOnDial(earthGroup, date, zoomLevel, selectedDateHeight, obs) {
        if (!obs || !earthGroup) return null;
        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return null;
        const lon = getLongitudeForOrbitalClockXZ(
            earthGroup,
            date,
            selectedDateHeight,
            obs.lat,
            obs.lon
        );
        updateOrientation(earthGroup, date);
        const surface = bodyLatLonToWorld(earthGroup, obs.lat, lon, ctx.radius);
        if (!surface) return null;
        return { lat: obs.lat, lon, surface, source: obs.source };
    }

    /** True user location on the globe (geographic lat/lon — not dial-snapped). */
    function getObserverSurfaceWorld(earthGroup, date, zoomLevel, radius, hourNumberRadius, selectedDateHeight) {
        const obs = getObserver(date, zoomLevel);
        if (!obs) return null;
        updateOrientation(earthGroup, date);
        return bodyLatLonToWorld(earthGroup, obs.lat, obs.lon, radius);
    }

    /** Blue-hand anchor on user longitude at local-solar hour on that meridian. */
    function getMeridianHandSurfaceWorld(earthGroup, date, userLon, radius) {
        if (userLon == null || isNaN(userLon)) return null;
        updateOrientation(earthGroup, date);
        const lon = normalizeLon(userLon);
        const hour = getObserverLocalHourDecimal(date, lon);
        const lat = getMeridianHandLatitudeForHourDecimal(hour, date);
        return bodyLatLonToWorld(earthGroup, lat, lon, radius);
    }

    /**
     * Hour-label tip in the orbital XZ clock (matches timemarker numerals / getEarthHourHandPointAtRadius).
     */
    function getHourLabelTipWorldXZ(earthGroup, date, hourNumberRadius, selectedDateHeight, userLon) {
        const lon =
            userLon != null && !isNaN(userLon)
                ? userLon
                : (() => {
                      const obs = getObserver(date, 9);
                      return obs ? obs.lon : null;
                  })();
        return getSceneHourPointAtRadius(
            earthGroup,
            date,
            lon,
            hourNumberRadius,
            selectedDateHeight
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
     * Cyan/red hour hand: straight in orbital XZ through user meridian ∩ white ring (r×0.93).
     */
    function getMeridianHandGeometry(earthGroup, date, zoomLevel, hourNumberRadius, selectedDateHeight, userLon) {
        const obs = getObserver(date, zoomLevel);
        const lon =
            userLon !== undefined && userLon !== null && !isNaN(userLon)
                ? userLon
                : userLon === null
                  ? null
                  : obs
                    ? obs.lon
                    : null;

        const pack = getOrbitalPlaneMeridianHandPack(
            earthGroup,
            date,
            lon,
            hourNumberRadius,
            selectedDateHeight
        );
        if (!pack) return null;

        let tip = pack.tip.clone();
        tip = ensureTipOutsideSphere(pack.center, tip, hourNumberRadius);
        const meridianSurface =
            lon != null && !isNaN(lon)
                ? getMeridianHandSurfaceWorld(earthGroup, date, lon, pack.radius)
                : null;
        const exit = hourHandExitOnSphere(pack.center, tip, pack.radius) || meridianSurface;
        return {
            center: pack.center,
            meridianSurface: pack.ringMarker,
            globeMeridian: meridianSurface,
            exit,
            tip,
            handLat: getMeridianHandLatitudeForHourDecimal(pack.hour, date),
            handHour: pack.hour,
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
        const obs = getObserver(date, zoomLevel);
        const lon = userLon != null && !isNaN(userLon) ? userLon : obs ? obs.lon : null;

        if (lon == null || isNaN(lon)) return null;

        const pt = getMeridianHandPointAlongObserver(
            earthGroup,
            date,
            lon,
            radialDistance,
            selectedDateHeight
        );
        if (pt) return { x: pt.x, y: pt.y, z: pt.z };
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
            globeSurface: geom.globeMeridian,
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
        const obs = getObserver(selectedDate, params.zoomLevel);
        if (!obs) return;

        const ctx = getEarthCenterAndRadius(earthGroup);
        if (!ctx) return;

        const display = getObserverDisplayOnDial(
            earthGroup,
            selectedDate,
            params.zoomLevel,
            selectedDateHeight,
            obs
        );
        if (!display || !display.surface) return;

        const pinR = Math.max(0.018, ctx.radius * 0.055);
        const pinGeom = new THREE.SphereGeometry(pinR, 12, 12);
        const pinMat = new THREE.MeshBasicMaterial({
            color: OBSERVER_GREEN,
            transparent: true,
            opacity: 1,
            depthWrite: false
        });
        const pin = new THREE.Mesh(pinGeom, pinMat);
        pin.position.copy(display.surface);
        pin.renderOrder = 17;
        sceneContentGroup.add(pin);
        handObjects.push(pin);

        addObserverMeridianLatitudeCross(
            earthGroup,
            { lat: display.lat, lon: display.lon, source: display.source },
            ctx.radius,
            sceneContentGroup
        );

        // Dial-plane meridian: through Earth along cyan/red hand ray (visible outside the globe).
        const clockDir = getSelectedHourClockDirectionXZ(
            earthGroup,
            selectedDate,
            selectedDateHeight,
            ctx.center,
            null
        );
        if (clockDir) {
            const y =
                typeof selectedDateHeight === 'number' && !isNaN(selectedDateHeight)
                    ? selectedDateHeight
                    : ctx.center.y;
            const outerR =
                typeof hourNumberRadius === 'number' && hourNumberRadius > 0
                    ? hourNumberRadius
                    : ctx.radius * 2.2;
            const innerR = ctx.radius * 1.04;
            const dialMeridian = buildRadialTube(
                THREE,
                {
                    x: ctx.center.x - clockDir.x * innerR,
                    y,
                    z: ctx.center.z - clockDir.z * innerR
                },
                {
                    x: ctx.center.x + clockDir.x * outerR,
                    y,
                    z: ctx.center.z + clockDir.z * outerR
                },
                Math.max(0.012, ctx.radius * 0.012),
                OBSERVER_GREEN,
                15,
                0.96
            );
            if (dialMeridian) {
                dialMeridian.renderOrder = 15;
                sceneContentGroup.add(dialMeridian);
                handObjects.push(dialMeridian);
            }
        }

        const handR = Math.max(0.022, ctx.radius * 0.024);

        function addMeridianHand(date, colorHex, order, userLonOverride) {
            const handLon =
                userLonOverride !== undefined ? userLonOverride : obs.lon;
            const geom = getMeridianHandGeometry(
                earthGroup,
                date,
                params.zoomLevel,
                hourNumberRadius,
                selectedDateHeight,
                handLon
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

        updateOrientation(earthGroup, selectedDate);
        // Cyan hand: same orbital hour-dial clock as red (browser-local on `selectedDate`), not observer-lon solar.
        addMeridianHand(selectedDate, SELECTED_TIME_HAND_CYAN, 13, null);
        if (!tourMinimalOrbitMode && currentDate) {
            const nowDate =
                currentDate instanceof Date && !isNaN(currentDate.getTime())
                    ? currentDate
                    : new Date();
            updateOrientation(earthGroup, nowDate);
            // null lon → browser-local wall clock (matches HUD Current Time).
            addMeridianHand(nowDate, CURRENT_TIME_HAND_RED, 14, null);
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
                if (
                    child.material.isMeshBasicMaterial ||
                    child.material.isMeshStandardMaterial ||
                    child.material.isMeshLambertMaterial
                ) {
                    child.material.transparent = true;
                    child.material.opacity = detail ? 0.95 : 0.9;
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
        if (!earthGroup) return null;
        const zl = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? zoomLevel : 9;
        const lon = isGlobeDetailZoom(zl)
            ? null
            : (() => {
                  const obs = getObserver(selectedDate, zl);
                  return obs ? obs.lon : null;
              })();
        return getSceneHourAngleXZ(earthGroup, selectedDate, selectedDateHeight, lon);
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
            getSubsolarGeographic,
            getObserverLocalHourDecimal,
            getSceneHourDecimal,
            getSceneHourAngleXZ,
            getSceneHourAngleXZForHourIndex
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
        getSubsolarGeographic,
        getObserverLocalHourDecimal,
        getSceneHourDecimal,
        getSceneHourAngleXZ,
        getSceneHourAngleXZForHourIndex
    };
})();
