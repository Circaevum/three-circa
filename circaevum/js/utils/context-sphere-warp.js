/**
 * Interstellar Event Horizon warp — STE spindle (pole taper) + LTE line→circle.
 *
 * Outside sphere: STE vertical stack keeps Y; horizontal radius → 0 at poles.
 * Outside sphere: LTE day-frame unwraps to a full circadian circle just outside
 *   the Event Horizon. Paths slerp around the shell (never through it). Radius
 *   falls toward a clearance floor like a black-hole approach — crawl near the
 *   horizon, never intersect. Midnight anti-sun, noon sunward.
 * Inside sphere: identity — STE wormhole stack at full radius; no LTE ring warp.
 */
(function (global) {
  let _cameraInside = false;
  let _lastInsideSample = null;

  function isWarpModeEnabled() {
    if (typeof global.isEventHorizonWarpEnabled === 'function') {
      try {
        return !!global.isEventHorizonWarpEnabled();
      } catch (e) {
        return true;
      }
    }
    if (typeof global.getEventHorizonMode === 'function') {
      try {
        return global.getEventHorizonMode() === 'nest';
      } catch (e) {
        return true;
      }
    }
    return true;
  }

  function getSphereState() {
    if (typeof global.getContextSphereState === 'function') {
      try {
        return global.getContextSphereState();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function isCameraInsideContextSphere(camera, state) {
    const s = state || getSphereState();
    const cam = camera || global.camera;
    if (!s || !(s.radius > 0) || !cam || !cam.position) return false;
    const dx = cam.position.x - s.x;
    const dy = cam.position.y - s.y;
    const dz = cam.position.z - s.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const r = s.radius * 0.985;
    return d2 < r * r;
  }

  /** Update cached inside flag. Returns true when value flipped. */
  function syncCameraInsideFlag(camera, state) {
    const next = isCameraInsideContextSphere(camera, state);
    const flipped = _lastInsideSample !== null && next !== _cameraInside;
    _cameraInside = next;
    _lastInsideSample = next;
    return flipped;
  }

  function getCameraInsideCached() {
    return !!_cameraInside;
  }

  function setCameraInsideCached(on) {
    _cameraInside = !!on;
    _lastInsideSample = _cameraInside;
  }

  /**
   * Pole taper factor: 1 at equator (y≈Cy), 0 at sphere poles (|y−Cy|→R).
   * Softened so mid-latitudes stay readable.
   */
  function stePoleScale(y, state) {
    const s = state || getSphereState();
    if (!s || !(s.radius > 0)) return 1;
    const t = (y - s.y) / s.radius;
    const tt = Math.max(-1, Math.min(1, t));
    const raw = Math.sqrt(Math.max(0, 1 - tt * tt));
    // Keep a floor so disks near poles don't vanish completely before clip.
    return 0.06 + 0.94 * raw;
  }

  /**
   * STE: keep vertical stack; squash horizontal radius toward sphere axis when outside.
   * @param {{x:number,y:number,z:number}} p
   * @param {{x:number,y:number,z:number,radius:number}|null} state
   * @param {boolean} [cameraInside]
   */
  function warpStePoint(p, state, cameraInside) {
    if (!p) return p;
    if (!isWarpModeEnabled()) return p;
    const inside =
      typeof cameraInside === 'boolean' ? cameraInside : getCameraInsideCached();
    if (inside) return p;
    const s = state || getSphereState();
    if (!s || !(s.radius > 0)) return p;
    const scale = stePoleScale(p.y, s);
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    return {
      x: s.x + dx * scale,
      y: p.y,
      z: s.z + dz * scale
    };
  }

  /**
   * Warp strength from scene Y vs Event Horizon band + adjustable fade past poles.
   * Fade length scales with warpBeyondDays / ehHalfDays (never starts inside shell).
   */
  function getSceneYSelectedWeekWarpAmount(y, state) {
    if (!isWarpModeEnabled()) return 0;
    const s = state || getSphereState();
    if (!s || typeof y !== 'number' || !isFinite(y)) return 0;
    if (typeof s.y0 !== 'number' || typeof s.y1 !== 'number') return 0;
    const yLo = Math.min(s.y0, s.y1);
    const yHi = Math.max(s.y0, s.y1);
    if (!(yHi > yLo)) return 0;
    const span = yHi - yLo;
    const ehHalf =
      typeof s.ehHalfDays === 'number' && s.ehHalfDays > 0 ? s.ehHalfDays : 7;
    const beyond =
      typeof s.warpBeyondDays === 'number' && s.warpBeyondDays >= 0
        ? s.warpBeyondDays
        : Math.max(ehHalf * 0.28, 2);
    const fadeScale = beyond / Math.max(ehHalf, 1e-6);
    const fade = Math.max(
      span * Math.max(0.05, fadeScale),
      (s.radius || span) * 0.06 * Math.max(0.25, fadeScale)
    );
    if (y >= yLo && y <= yHi) return 1;
    if (fade <= 1e-8) return 0;
    if (y < yLo - fade || y > yHi + fade) return 0;
    if (y < yLo) {
      const t = (y - (yLo - fade)) / fade;
      const u = Math.max(0, Math.min(1, t));
      return u * u * (3 - 2 * u);
    }
    const t = ((yHi + fade) - y) / fade;
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  }

  /** Stay strictly outside the Event Horizon (black-hole photon-sphere gap). */
  const HORIZON_CLEARANCE = 1.06;

  function getHorizonClearanceRadius(state) {
    const s = state || getSphereState();
    if (!s || !(s.radius > 0)) return 0;
    return s.radius * HORIZON_CLEARANCE;
  }

  /**
   * Push a point onto/outside the clearance shell. Never returns an interior point.
   */
  function clampOutsideHorizon(p, state) {
    if (!p) return p;
    const s = state || getSphereState();
    if (!s || !(s.radius > 0)) return p;
    const rMin = getHorizonClearanceRadius(s);
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const dz = p.z - s.z;
    const r = Math.hypot(dx, dy, dz);
    if (r >= rMin) return p;
    if (r < 1e-10) {
      return { x: s.x + rMin, y: s.y, z: s.z };
    }
    const k = rMin / r;
    return {
      x: s.x + dx * k,
      y: s.y + dy * k,
      z: s.z + dz * k
    };
  }

  function slerpUnit(ax, ay, az, bx, by, bz, t) {
    const tt = Math.max(0, Math.min(1, t));
    let dot = ax * bx + ay * by + az * bz;
    if (dot > 1) dot = 1;
    if (dot < -1) dot = -1;
    if (tt <= 0) return { x: ax, y: ay, z: az };
    if (tt >= 1) return { x: bx, y: by, z: bz };
    if (dot > 0.9995) {
      let x = ax + (bx - ax) * tt;
      let y = ay + (by - ay) * tt;
      let z = az + (bz - az) * tt;
      const n = Math.hypot(x, y, z) || 1;
      return { x: x / n, y: y / n, z: z / n };
    }
    if (dot < -0.9995) {
      let px = -az;
      let py = 0;
      let pz = ax;
      let pn = Math.hypot(px, py, pz);
      if (pn < 1e-8) {
        px = 1;
        py = 0;
        pz = 0;
        pn = 1;
      } else {
        px /= pn;
        pz /= pn;
      }
      const ang = Math.PI * tt;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const crx = py * az - pz * ay;
      const cry = pz * ax - px * az;
      const crz = px * ay - py * ax;
      let x = ax * c + crx * s;
      let y = ay * c + cry * s;
      let z = az * c + crz * s;
      const n = Math.hypot(x, y, z) || 1;
      return { x: x / n, y: y / n, z: z / n };
    }
    const omega = Math.acos(dot);
    const so = Math.sin(omega);
    const s0 = Math.sin((1 - tt) * omega) / so;
    const s1 = Math.sin(tt * omega) / so;
    let x = ax * s0 + bx * s1;
    let y = ay * s0 + by * s1;
    let z = az * s0 + bz * s1;
    const n = Math.hypot(x, y, z) || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  /**
   * LTE day-frame → Event Horizon circadian circle (outside view only).
   * Direction slerps around the shell (no chords through the ball). Radius is
   * attracted to a clearance floor with (1−amount)² crawl — proximal like a
   * horizon, never intersecting it.
   *
   * dayFrac from opts.when, opts.dayFrac, else radialT (spoke parameter).
   *
   * @param {{x:number,y:number,z:number}} p
   * @param {object} [opts]
   * @param {number} [opts.radialT] 0..1 along day spoke (fallback dayFrac)
   * @param {number} [opts.dayFrac] 0..1 wall-clock fraction
   * @param {Date} [opts.when] wall time → dayFrac
   * @param {number} [opts.amount] 0..1 blend (default 1 when warping)
   */
  function warpLtePointToRing(p, state, opts) {
    if (!p) return p;
    if (!isWarpModeEnabled()) return p;
    const inside =
      opts && typeof opts.cameraInside === 'boolean'
        ? opts.cameraInside
        : getCameraInsideCached();
    if (inside) return p;
    const s = state || getSphereState();
    if (!s || !(s.radius > 0)) return p;

    const o = opts || {};
    const a0 =
      typeof o.amount === 'number' && !isNaN(o.amount)
        ? Math.max(0, Math.min(1, o.amount))
        : 1;
    const conform =
      typeof global.currentEhWarpConform === 'number' && !isNaN(global.currentEhWarpConform)
        ? Math.max(0, Math.min(1, global.currentEhWarpConform))
        : 1;
    const amount = a0 * conform;
    if (amount <= 0.001) return p;

    const rMin = getHorizonClearanceRadius(s);
    const radialT =
      typeof o.radialT === 'number' && !isNaN(o.radialT)
        ? Math.max(0, Math.min(1, o.radialT))
        : 0.5;

    let dayFrac = radialT;
    if (o.when && o.when instanceof Date && !isNaN(o.when.getTime())) {
      const d = o.when;
      dayFrac =
        (d.getHours() +
          d.getMinutes() / 60 +
          d.getSeconds() / 3600 +
          d.getMilliseconds() / 3600000) /
        24;
    } else if (typeof o.dayFrac === 'number' && !isNaN(o.dayFrac)) {
      dayFrac = o.dayFrac;
    }
    dayFrac = ((dayFrac % 1) + 1) % 1;

    const sunToEarthAngle = Math.atan2(s.z, s.x);
    const targetAngle = sunToEarthAngle - dayFrac * Math.PI * 2;
    const u1x = Math.cos(targetAngle);
    const u1y = 0;
    const u1z = Math.sin(targetAngle);

    let dx = p.x - s.x;
    let dy = p.y - s.y;
    let dz = p.z - s.z;
    let r0 = Math.hypot(dx, dy, dz);
    let u0x;
    let u0y;
    let u0z;
    if (r0 < 1e-8) {
      u0x = u1x;
      u0y = u1y;
      u0z = u1z;
      r0 = rMin;
    } else {
      u0x = dx / r0;
      u0y = dy / r0;
      u0z = dz / r0;
      if (r0 < rMin) r0 = rMin;
    }

    const a = amount;
    const fall = (1 - a) * (1 - a);
    const r = rMin + (r0 - rMin) * fall;
    const u = slerpUnit(u0x, u0y, u0z, u1x, u1y, u1z, a);

    const out = {
      x: s.x + u.x * r,
      y: s.y + u.y * r,
      z: s.z + u.z * r,
      _warpAngle: targetAngle,
      _warpDelta: 0
    };
    return clampOutsideHorizon(out, s);
  }

  /** Warp a flat xyz array in place (or into out). kind: 'ste' | 'lte'. */
  function warpPositionArray(arr, kind, state, opts) {
    if (!arr || arr.length < 3) return arr;
    const out = opts && opts.out ? opts.out : arr;
    const s = state || getSphereState();
    for (let i = 0; i < arr.length; i += 3) {
      const p = { x: arr[i], y: arr[i + 1], z: arr[i + 2] };
      let q;
      if (kind === 'ste') {
        q = warpStePoint(p, s, opts && opts.cameraInside);
      } else {
        const radialT =
          opts && typeof opts.radialTAt === 'function'
            ? opts.radialTAt(i / 3)
            : opts && typeof opts.radialT === 'number'
              ? opts.radialT
              : 0.5;
        q = warpLtePointToRing(p, s, Object.assign({}, opts, { radialT }));
      }
      out[i] = q.x;
      out[i + 1] = q.y;
      out[i + 2] = q.z;
    }
    return out;
  }

  global.ContextSphereWarp = {
    isCameraInsideContextSphere,
    syncCameraInsideFlag,
    getCameraInsideCached,
    setCameraInsideCached,
    stePoleScale,
    warpStePoint,
    warpLtePointToRing,
    warpPositionArray,
    getSceneYSelectedWeekWarpAmount,
    getHorizonClearanceRadius,
    clampOutsideHorizon
  };
})(typeof window !== 'undefined' ? window : globalThis);
