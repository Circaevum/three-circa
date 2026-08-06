/**
 * Interstellar Event Horizon warp — STE spindle (pole taper) + LTE accretion ring.
 *
 * Outside sphere: STE vertical stack keeps Y; horizontal radius → 0 at poles.
 * Outside sphere: LTE day-frame / sky flatten into a ring hugging the shell
 *   (black-hole disk vibe).
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

  /** Fraction of local day 0..1 from Date (viewer wall clock). */
  function dayFracFromWhen(when) {
    if (!when || !(when instanceof Date) || isNaN(when.getTime())) return null;
    return (
      (when.getHours() +
        when.getMinutes() / 60 +
        when.getSeconds() / 3600 +
        when.getMilliseconds() / 3600000) /
      24
    );
  }

  /**
   * Circadian STE hand angle vs Earth–Sun line (same convention as circadian-renderer).
   * dayFrac 0 = midnight, 0.5 = noon.
   */
  function circadianHandAngleAtEarth(earthX, earthZ, dayFrac) {
    const frac =
      typeof dayFrac === 'number' && !isNaN(dayFrac)
        ? ((dayFrac % 1) + 1) % 1
        : 0;
    const dayAngle = frac * Math.PI * 2;
    const sunToEarthAngle = Math.atan2(earthZ, earthX);
    return sunToEarthAngle - dayAngle;
  }

  /**
   * LTE → accretion disc around Event Horizon (outside view only).
   * Radius stays outside shell (disc). Amount blends by rotating azimuth from
   * the original LTE spoke toward the circadian STE hand (gradual curve, not snap).
   *
   * @param {{x:number,y:number,z:number}} p
   * @param {object} [opts]
   * @param {number} [opts.radialT] 0..1 band across day-pitch / sky annulus
   * @param {number} [opts.diskWidth] world units of ring width past shell
   * @param {number} [opts.amount] 0..1 blend (default 1 when warping)
   * @param {Date} [opts.when] wall time → circadian hand angle
   * @param {number} [opts.dayFrac] 0..1 override when Date unavailable
   * @param {{ux,uy,uz,vx,vy,vz,nx,ny,nz}|null} [opts.basis] LTE plane basis
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
    const amount =
      typeof o.amount === 'number' && !isNaN(o.amount)
        ? Math.max(0, Math.min(1, o.amount))
        : 1;
    if (amount <= 0.001) return p;

    const R = s.radius;
    const diskWidth =
      typeof o.diskWidth === 'number' && o.diskWidth > 0
        ? o.diskWidth
        : Math.max(R * 0.22, 2.5);
    const radialT =
      typeof o.radialT === 'number' && !isNaN(o.radialT)
        ? Math.max(0, Math.min(1, o.radialT))
        : 0.45;

    let dayFrac = dayFracFromWhen(o.when);
    if (dayFrac == null && typeof o.dayFrac === 'number' && !isNaN(o.dayFrac)) {
      dayFrac = o.dayFrac;
    }
    if (dayFrac == null) dayFrac = radialT;

    const targetR = R * 1.04 + radialT * diskWidth;
    const hand = circadianHandAngleAtEarth(s.x, s.z, dayFrac);

    // Start from original offset around Earth (XZ) — same frame as STE hand.
    const pdx = p.x - s.x;
    const pdy = p.y - s.y;
    const pdz = p.z - s.z;
    const pRad = Math.hypot(pdx, pdz);
    const origAngle = pRad > 1e-8 ? Math.atan2(pdz, pdx) : hand;

    // Raw delta — do NOT shortest-path wrap. Shortest-path flips when |hand−orig| crosses π,
    // so adjacent ribbon samples jump to opposite sides → chords across the disc.
    // cos/sin handle angles outside (−π,π]; continuous dayFrac → continuous arc.
    let dA = hand - origAngle;
    if (typeof o.angleDeltaHint === 'number' && isFinite(o.angleDeltaHint)) {
      // Prefer delta near previous sample's delta (ribbon continuity).
      while (dA - o.angleDeltaHint > Math.PI) dA -= Math.PI * 2;
      while (dA - o.angleDeltaHint < -Math.PI) dA += Math.PI * 2;
    }

    const a = amount;
    const angle = origAngle + dA * a;
    const r0 = pRad > 1e-6 ? pRad : targetR;
    const r = r0 * (1 - a) + targetR * a;
    const y = p.y * (1 - a) + (s.y + pdy * (1 - a) * 0.15) * a;

    const out = {
      x: s.x + Math.cos(angle) * r,
      y: y,
      z: s.z + Math.sin(angle) * r,
      _warpAngle: angle,
      _warpDelta: dA
    };
    return out;
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
    getSceneYSelectedWeekWarpAmount
  };
})(typeof window !== 'undefined' ? window : globalThis);
