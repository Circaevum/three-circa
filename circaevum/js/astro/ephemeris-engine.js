/**
 * Ephemeris engine scaffold.
 * Defaults to Kepler provider; supports Earth-orbital frame projection.
 */
const CircaevumAstro = (function() {
    let config = null;
    let runtimeConfig = null;
    let provider = null;
    let providerName = 'circular';
    let initialized = false;
    const HEIGHT_PER_YEAR_LOCAL = 100;
    const MS_PER_TROPICAL_YEAR = 365.2425 * 86400000;

    function nowDate() {
        return new Date();
    }

    function ensureInit() {
        if (initialized) return;
        const cfg = typeof EPHEMERIS_CONFIG !== 'undefined' ? EPHEMERIS_CONFIG : { enabled: false };
        config = Object.assign({
            enabled: false,
            provider: 'kepler',
            frame: 'heliocentric'
        }, cfg || {});
        runtimeConfig = {
            enabled: !!config.enabled,
            provider: config.provider || 'kepler'
        };
        selectProvider(runtimeConfig.provider);
        initialized = true;
    }

    function selectProvider(name) {
        const requested = (name || 'circular').toLowerCase();
        const ae = (typeof window !== 'undefined' && window.AstronomyEngineProvider) ? window.AstronomyEngineProvider : (typeof AstronomyEngineProvider !== 'undefined' ? AstronomyEngineProvider : null);
        const kp = (typeof window !== 'undefined' && window.KeplerEphemerisProvider) ? window.KeplerEphemerisProvider : (typeof KeplerEphemerisProvider !== 'undefined' ? KeplerEphemerisProvider : null);
        const circ = (typeof window !== 'undefined' && window.CircularEphemerisProvider) ? window.CircularEphemerisProvider : (typeof CircularEphemerisProvider !== 'undefined' ? CircularEphemerisProvider : null);

        if (requested === 'astronomy-engine' && ae && ae.isAvailable && ae.isAvailable()) {
            provider = ae;
            providerName = 'astronomy-engine';
            return;
        }
        if (kp && typeof kp.getHeliocentricPosition === 'function') {
            provider = kp;
            providerName = 'kepler';
            return;
        }
        provider = circ || CircularEphemerisProvider;
        providerName = 'circular';
    }

    function isEnabled() {
        ensureInit();
        return !!runtimeConfig.enabled;
    }

    function persistEnabled() {}

    function setEnabled(enabled) {
        ensureInit();
        runtimeConfig.enabled = !!enabled;
        if (runtimeConfig.enabled) {
            selectProvider(runtimeConfig.provider);
            // If user requested AE but it failed to initialize, disable ephemeris
            // instead of silently switching to another provider.
            if (runtimeConfig.provider === 'astronomy-engine' && providerName !== 'astronomy-engine') {
                runtimeConfig.enabled = false;
            }
        }
        persistEnabled();
        return runtimeConfig.enabled;
    }

    function isFiniteVector(v) {
        return !!v &&
            Number.isFinite(v.x) &&
            Number.isFinite(v.y) &&
            Number.isFinite(v.z);
    }

    function getProviderVectorOrDisable(bodyName, date) {
        if (!provider || typeof provider.getHeliocentricPosition !== 'function') return null;
        const out = provider.getHeliocentricPosition(bodyName, date);
        if (isFiniteVector(out)) return out;
        // Third-party provider returned bad data: fail safe to OFF.
        if (providerName === 'astronomy-engine') {
            runtimeConfig.enabled = false;
            persistEnabled();
        }
        return null;
    }

    function toggleEnabled() {
        return setEnabled(!isEnabled());
    }

    function getStatus() {
        ensureInit();
        return {
            enabled: !!runtimeConfig.enabled,
            requestedProvider: runtimeConfig.provider,
            activeProvider: providerName,
            astronomyEngineAvailable: typeof AstronomyEngineProvider !== 'undefined' && AstronomyEngineProvider && AstronomyEngineProvider.isAvailable ? AstronomyEngineProvider.isAvailable() : false
        };
    }

    function heightToDate(height, referenceHeight, referenceDate) {
        const refH = typeof referenceHeight === 'number' ? referenceHeight : 0;
        const refD = referenceDate instanceof Date ? referenceDate : nowDate();
        const years = (height - refH) / HEIGHT_PER_YEAR_LOCAL;
        return new Date(refD.getTime() + (years * MS_PER_TROPICAL_YEAR));
    }

    function getEarthOrbitalProjected(bodyName, date) {
        const earth = getProviderVectorOrDisable('Earth', date);
        const body = getProviderVectorOrDisable(bodyName, date);
        if (!earth || !body) return null;
        const delta = {
            x: body.x - earth.x,
            y: body.y - earth.y,
            z: body.z - earth.z
        };
        // Circular fallback should remain Sun-centered to match the existing scene model.
        // Using Earth-relative deltas makes each worldline appear offset from the shared Sun axis.
        if (providerName === 'circular') {
            return {
                x: body.x,
                z: body.z,
                tangent: 0
            };
        }
        const frame = EarthOrbitalFrame.buildFromEarthState(earth, null);
        const projected = EarthOrbitalFrame.projectToFrame(delta, frame);
        return AstroStateToScene.mapEarthOrbitalToScene(projected);
    }

    function getHeliocentricScenePosition(bodyName, date) {
        const body = getProviderVectorOrDisable(bodyName, date);
        if (!body) return null;
        const rawX = body.x;
        // Provider orbital plane y maps to scene z with sign convention.
        const rawZ = -body.y;
        const rot = getScenePhaseLockRotationRad();
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        return {
            x: (rawX * cr) - (rawZ * sr),
            z: (rawX * sr) + (rawZ * cr),
            tangent: 0
        };
    }

    function getLegacyEarthSceneAngleNow() {
        if (!Array.isArray(PLANET_DATA)) return 0;
        const earth = PLANET_DATA.find(p => p && p.name === 'Earth');
        if (!earth || typeof earth.startAngle !== 'number') return 0;
        return earth.startAngle;
    }

    function getProviderEarthSceneAngleNow() {
        const e = getProviderVectorOrDisable('Earth', new Date());
        if (!e) return 0;
        return Math.atan2(-e.y, e.x);
    }

    function getScenePhaseLockRotationRad() {
        // Rotate ephemeris scene so Earth-at-now lines up with legacy Earth marker angle.
        const legacy = getLegacyEarthSceneAngleNow();
        const providerAngle = getProviderEarthSceneAngleNow();
        return legacy - providerAngle;
    }

    function getScenePosition(bodyName, date) {
        if (!bodyName) return null;
        const mode = config && config.frame ? String(config.frame) : 'heliocentric';
        if (mode === 'earth-orbital') {
            return getEarthOrbitalProjected(bodyName, date);
        }
        return getHeliocentricScenePosition(bodyName, date);
    }

    function sampleWorldlineByHeight(options) {
        ensureInit();
        if (!isEnabled()) return null;
        const opts = options || {};
        const bodyName = opts.planetName;
        if (!bodyName) return null;
        const startHeight = opts.startHeight;
        const endHeight = opts.endHeight;
        const segments = opts.segments || 64;
        const referenceHeight = opts.referenceHeight || 0;
        const referenceDate = opts.referenceDate || nowDate();

        return AstroTrajectorySampler.sampleByHeightRange({
            startHeight,
            endHeight,
            segments,
            sampleAtHeight: function(h) {
                const d = heightToDate(h, referenceHeight, referenceDate);
                return getScenePosition(bodyName, d);
            }
        });
    }

    function getPlanetScenePositionAtDate(bodyName, date) {
        ensureInit();
        if (!isEnabled() || !bodyName) return null;
        const d = date instanceof Date ? date : nowDate();
        return getScenePosition(bodyName, d);
    }

    function getHeliocentricPositionAtDate(bodyName, date) {
        ensureInit();
        if (!isEnabled() || !bodyName || !provider || typeof provider.getHeliocentricPosition !== 'function') return null;
        const d = date instanceof Date ? date : nowDate();
        return getProviderVectorOrDisable(bodyName, d);
    }

    return {
        ensureInit,
        isEnabled,
        setEnabled,
        toggleEnabled,
        getStatus,
        heightToDate,
        sampleWorldlineByHeight,
        getPlanetScenePositionAtDate,
        getHeliocentricPositionAtDate
    };
})();

if (typeof window !== 'undefined') {
    window.CircaevumAstro = CircaevumAstro;
    window.getEphemerisEnabled = function() {
        return !!CircaevumAstro.isEnabled();
    };
    window.setEphemerisEnabled = function(enabled) {
        return CircaevumAstro.setEnabled(!!enabled);
    };
    window.toggleEphemerisEnabled = function() {
        return CircaevumAstro.toggleEnabled();
    };
    window.getEphemerisStatus = function() {
        return CircaevumAstro.getStatus();
    };
}
