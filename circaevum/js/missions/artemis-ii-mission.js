/**
 * Artemis II — mission-only overlay (separate from core Moon mechanics).
 *
 * Uses MoonMechanics for Earth/Moon XZ at each mission time so the trajectory aligns with the
 * lunar worldline ribbon and pedagogical Moon (synodic phase), not sidereal moonXZAtHeight.
 * Depends: MoonMechanics, THREE, PLANET_DATA, calculateDateHeight.
 */

const ArtemisIIMission = (function () {
    const MISSION = {
        name: 'Artemis II',
        waypoints: [
            { label: 'Launch', month: 3, day: 1, hour: 18, earthBlend: 1 },
            { label: 'Earth orbit', month: 3, day: 1, hour: 22, earthBlend: 0.98 },
            { label: 'TLI', month: 3, day: 2, hour: 20, earthBlend: 0.82 },
            { label: 'Outbound', month: 3, day: 4, hour: 12, earthBlend: 0.55 },
            /** earthBlend 0 = MoonMechanics moon distance (full offsetFromEarth); any >0 shortens the arc vs the pedagogical Moon. */
            { label: 'Lunar flyby', month: 3, day: 6, hour: 19, earthBlend: 0 },
            { label: 'Return', month: 3, day: 8, hour: 12, earthBlend: 0.48 },
            { label: 'Splashdown', month: 3, day: 10, hour: 20, earthBlend: 1 }
        ],
        year: 2026
    };

    const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /** Short calendar string per waypoint; adds clock time when same day as previous stage. */
    function shortStageDate(wp, prevWp) {
        const base = `${MONTH_SHORT[wp.month]} ${wp.day}`;
        if (prevWp && prevWp.month === wp.month && prevWp.day === wp.day) {
            return `${base} · ${String(wp.hour).padStart(2, '0')}:00`;
        }
        return base;
    }

    /** Same indexing as CatmullRom getPoints: u = i / (n - 1) → mission time between waypoints. */
    function timeMsAtMissionU(u, waypoints, year) {
        const n = waypoints.length;
        if (n < 1) return Date.now();
        if (n < 2) {
            const w = waypoints[0];
            return new Date(year, w.month, w.day, w.hour).getTime();
        }
        const uu = Math.max(0, Math.min(1, u));
        const f = uu * (n - 1);
        const k = Math.min(n - 2, Math.floor(f));
        const frac = f - k;
        const a = waypoints[k];
        const b = waypoints[k + 1];
        const ta = new Date(year, a.month, a.day, a.hour).getTime();
        const tb = new Date(year, b.month, b.day, b.hour).getTime();
        return ta + frac * (tb - ta);
    }

    /** Ribbon strip (event-style quad strip) from centerline flat [x,y,z,...]. */
    function createRibbonBufferFromFlatArrays(T, innerFlat, outerFlat) {
        const n = innerFlat.length / 3;
        if (n < 2 || innerFlat.length !== outerFlat.length) return null;
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
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            idx.push(a, b, c, b, d, c);
        }
        const geo = new T.BufferGeometry();
        geo.setIndex(idx);
        geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return geo;
    }

    /** Offset centerline in XZ by ±halfWidth along binormal (tangent × up). */
    function ribbonInnerOuterFromCenterline(T, smooth, halfWidth) {
        const n = smooth.length / 3;
        const innerFlat = new Float32Array(smooth.length);
        const outerFlat = new Float32Array(smooth.length);
        const up = new T.Vector3(0, 1, 0);
        const tan = new T.Vector3();
        const side = new T.Vector3();
        for (let i = 0; i < n; i++) {
            const ix = i * 3;
            const x0 = smooth[ix];
            const y0 = smooth[ix + 1];
            const z0 = smooth[ix + 2];
            const xPrev = smooth[Math.max(0, i - 1) * 3];
            const yPrev = smooth[Math.max(0, i - 1) * 3 + 1];
            const zPrev = smooth[Math.max(0, i - 1) * 3 + 2];
            const xNext = smooth[Math.min(n - 1, i + 1) * 3];
            const yNext = smooth[Math.min(n - 1, i + 1) * 3 + 1];
            const zNext = smooth[Math.min(n - 1, i + 1) * 3 + 2];
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
        return { innerFlat, outerFlat };
    }

    /**
     * @param {object} opts
     * @returns {{ meshes: THREE.Object3D[], lines: THREE.Line[] }}
     */
    function build(opts) {
        const T = opts.THREE;
        const MM = typeof MoonMechanics !== 'undefined' ? MoonMechanics : null;
        const out = { meshes: [], lines: [] };

        if (!T || !MM || !opts.calculateDateHeight || !opts.flatGroup || !opts.sceneContentGroup) return out;

        const earth = typeof PLANET_DATA !== 'undefined' ? PLANET_DATA.find((p) => p.name === 'Earth') : null;
        if (!earth) return out;

        const selectedYear = opts.selectedYear;
        const zoomLevel = opts.zoomLevel;
        if (selectedYear !== MISSION.year || zoomLevel < 2 || zoomLevel > 8) return out;

        const refH = opts.currentDateHeight;
        const calcH = opts.calculateDateHeight;
        const isLightMode = !!opts.isLightMode;
        const moonSep = MM.getOffset();
        const moonXZAtTime =
            typeof MM.moonXZSynodicAtHeight === 'function'
                ? MM.moonXZSynodicAtHeight.bind(MM)
                : MM.moonXZAtHeight.bind(MM);

        const earthPlanet = opts.earthPlanet;
        const planetScaleFactor = opts.planetScaleFactor != null ? opts.planetScaleFactor : 0.3;
        const earthRadius =
            earthPlanet && earthPlanet.geometry && earthPlanet.geometry.parameters && earthPlanet.geometry.parameters.radius != null
                ? earthPlanet.geometry.parameters.radius
                : earth.size * planetScaleFactor;

        const points = [];
        const waypointPositions = [];
        let prevWp = null;
        for (const wp of MISSION.waypoints) {
            const h = calcH(MISSION.year, wp.month, wp.day, wp.hour);
            const atDate = new Date(MISSION.year, wp.month, wp.day, wp.hour);
            const exz = MM.earthXZAtHeight(h, refH, earth);
            const mxz = moonXZAtTime(h, refH, earth, moonSep, atDate);
            const p = MM.blendXZ(wp.earthBlend, exz.x, exz.z, mxz.x, mxz.z);
            points.push(p.x, h, p.z);
            waypointPositions.push({ x: p.x, y: h, z: p.z, wp, prevWp });
            prevWp = wp;
        }

        /** One smooth space-time curve through waypoints (avoids kinked / “wiggly” piecewise lines). */
        const smooth = [];
        const nCtrl = points.length / 3;
        if (typeof T.CatmullRomCurve3 === 'function' && nCtrl >= 2) {
            const vectors = [];
            for (let i = 0; i < nCtrl; i++) {
                vectors.push(new T.Vector3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]));
            }
            const curve = new T.CatmullRomCurve3(vectors, false, 'centripetal', 0.5);
            const divisions = Math.min(512, Math.max(160, (nCtrl - 1) * 56));
            const sampled = curve.getPoints(divisions);
            for (let i = 0; i < sampled.length; i++) {
                smooth.push(sampled[i].x, sampled[i].y, sampled[i].z);
            }
        } else {
            const segmentsPerLeg = 24;
            for (let i = 0; i < points.length / 3 - 1; i++) {
                const x0 = points[i * 3];
                const y0 = points[i * 3 + 1];
                const z0 = points[i * 3 + 2];
                const x1 = points[(i + 1) * 3];
                const y1 = points[(i + 1) * 3 + 1];
                const z1 = points[(i + 1) * 3 + 2];
                for (let s = 0; s < segmentsPerLeg; s++) {
                    const t = s / segmentsPerLeg;
                    const omt = 1 - t;
                    smooth.push(omt * x0 + t * x1, omt * y0 + t * y1, omt * z0 + t * z1);
                }
            }
            smooth.push(points[points.length - 3], points[points.length - 2], points[points.length - 1]);
        }

        const nSamp = smooth.length / 3;
        const timeMsAlong = new Float64Array(nSamp);
        for (let si = 0; si < nSamp; si++) {
            const u = nSamp > 1 ? si / (nSamp - 1) : 0;
            timeMsAlong[si] = timeMsAtMissionU(u, MISSION.waypoints, MISSION.year);
        }

        const halfWidth = Math.max(earthRadius * 0.065, 0.22);
        const { innerFlat, outerFlat } = ribbonInnerOuterFromCenterline(T, smooth, halfWidth);
        const ribbonGeo = createRibbonBufferFromFlatArrays(T, innerFlat, outerFlat);
        const wlColor = isLightMode ? 0xc2410c : 0xff6b35;
        const fillHex = wlColor;
        const ribbonMesh = ribbonGeo
            ? new T.Mesh(
                  ribbonGeo,
                  new T.MeshBasicMaterial({
                      color: fillHex,
                      transparent: true,
                      opacity: 0.78,
                      side: T.DoubleSide,
                      depthWrite: false,
                      polygonOffset: true,
                      polygonOffsetFactor: 2,
                      polygonOffsetUnits: 1
                  })
              )
            : null;
        if (ribbonMesh) {
            ribbonMesh.renderOrder = 46;
            ribbonMesh.userData = {
                type: 'ArtemisIIMission',
                role: 'trajectoryRibbon',
                artemisCenterline: new Float32Array(smooth),
                artemisTimeMs: timeMsAlong
            };
            opts.flatGroup.add(ribbonMesh);
            out.meshes.push(ribbonMesh);
        }

        const stageLabelLift = Math.max(earthRadius * 0.42, 2.4);
        const stageJitter = moonSep * 0.11;
        waypointPositions.forEach((pos, i) => {
            const text = shortStageDate(pos.wp, pos.prevWp);
            const cw = 200;
            const ch = 32;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = cw;
            canvas.height = ch;
            ctx.fillStyle = isLightMode ? 'rgba(255,248,240,0.92)' : 'rgba(255,230,210,0.92)';
            ctx.strokeStyle = isLightMode ? 'rgba(120,53,15,0.35)' : 'rgba(0,0,0,0.32)';
            ctx.lineWidth = 1.25;
            ctx.font = '600 13px Orbitron, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(text, cw / 2, ch / 2);
            ctx.fillText(text, cw / 2, ch / 2);
            const tex = new T.CanvasTexture(canvas);
            const spMat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
            const sp = new T.Sprite(spMat);
            const ox = Math.sin(i * 1.83 + 0.4) * stageJitter;
            const oz = Math.cos(i * 1.31 + 0.2) * stageJitter;
            sp.position.set(pos.x + ox, pos.y + stageLabelLift, pos.z + oz);
            const sc = earthRadius * 0.72;
            sp.scale.set(sc * (cw / ch), sc, 1);
            sp.renderOrder = 47;
            sp.userData = {
                type: 'ArtemisIIMission',
                role: 'stageDateLabel',
                stageIndex: i,
                artemisNavigateTimeMs: new Date(MISSION.year, pos.wp.month, pos.wp.day, pos.wp.hour).getTime()
            };
            opts.sceneContentGroup.add(sp);
            out.meshes.push(sp);
        });

        const flybyH = calcH(MISSION.year, 3, 6, 19);
        const flybyDate = new Date(MISSION.year, 3, 6, 19);
        const exzF = MM.earthXZAtHeight(flybyH, refH, earth);
        const mxzF = moonXZAtTime(flybyH, refH, earth, moonSep, flybyDate);
        const mid = MM.blendXZ(0, exzF.x, exzF.z, mxzF.x, mxzF.z);
        const labelText = `${MISSION.name} · crewed lunar flyby`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const cw = 480;
        const ch = 44;
        canvas.width = cw;
        canvas.height = ch;
        ctx.fillStyle = isLightMode ? 'rgba(255,248,240,0.94)' : 'rgba(255,230,210,0.95)';
        ctx.strokeStyle = isLightMode ? 'rgba(120,53,15,0.4)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        ctx.font = 'bold 16px Orbitron, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(labelText, cw / 2, ch / 2);
        ctx.fillText(labelText, cw / 2, ch / 2);
        const tex = new T.CanvasTexture(canvas);
        const spMat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const sprite = new T.Sprite(spMat);
        sprite.position.set(mid.x + moonSep * 0.35, flybyH + 8, mid.z);
        const sc = earthRadius * 1.85;
        sprite.scale.set(sc * (cw / ch), sc, 1);
        sprite.renderOrder = 48;
        sprite.userData = {
            type: 'ArtemisIIMission',
            role: 'label',
            artemisNavigateTimeMs: flybyDate.getTime()
        };
        opts.sceneContentGroup.add(sprite);
        out.meshes.push(sprite);

        return out;
    }

    return { MISSION, build };
})();

if (typeof window !== 'undefined') {
    window.ArtemisIIMission = ArtemisIIMission;
}
