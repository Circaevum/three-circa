/**
 * Annual helical projection — renderer-free.
 *
 * Architecture sketch (Z-up time):
 *   x = R * sin(theta), y = R * cos(theta), z = k * t
 *
 * Live Circaevum GL (Y-up time, XZ orbit) — do not "fix" this:
 *   x = R * cos(theta)
 *   y = k * t
 *   z = R * sin(theta)
 *
 * Earth day/year are not assumed here. Callers pass orbitalPeriod and
 * heightPerYear (scene scale; GL default 100 units per year).
 */
(function (root) {
    'use strict';

    var HEIGHT_PER_YEAR_DEFAULT = 100;

    function point(radius, theta, t, k) {
        var scale = k == null ? 1 : k;
        return {
            x: Math.cos(theta) * radius,
            y: scale * t,
            z: Math.sin(theta) * radius
        };
    }

    function thetaFromHeight(height, referenceHeight, orbitalPeriod, startAngle, heightPerYear) {
        var hpy = heightPerYear == null ? HEIGHT_PER_YEAR_DEFAULT : heightPerYear;
        var years = (height - referenceHeight) / hpy;
        var orbits = years / orbitalPeriod;
        return startAngle - (orbits * Math.PI * 2);
    }

    /**
     * Flat [x,y,z,...] helix. Same numbers as SceneGeometry.createHelicalCurve
     * when ephemeris sampling is off.
     */
    function sampleHelix(startHeight, endHeight, radius, currentHeight, orbitalPeriod, startAngle, segments, heightPerYear) {
        var segs = segments == null ? 64 : segments;
        var hpy = heightPerYear == null ? HEIGHT_PER_YEAR_DEFAULT : heightPerYear;
        var points = [];
        var totalHeight = endHeight - startHeight;
        var timeSpanYears = totalHeight / hpy;
        var orbitsInSpan = timeSpanYears / orbitalPeriod;
        var yearsBeforeCurrent = (currentHeight - startHeight) / hpy;
        var orbitsBeforeCurrent = yearsBeforeCurrent / orbitalPeriod;
        var angleBeforeCurrent = orbitsBeforeCurrent * Math.PI * 2;
        var curveStartAngle = startAngle + angleBeforeCurrent;
        var i;
        for (i = 0; i <= segs; i++) {
            var u = i / segs;
            var angle = curveStartAngle - (u * orbitsInSpan * Math.PI * 2);
            var height = startHeight + (u * totalHeight);
            var pos = point(radius, angle, height, 1);
            points.push(pos.x, pos.y, pos.z);
        }
        return points;
    }

    var api = {
        point: point,
        thetaFromHeight: thetaFromHeight,
        sampleHelix: sampleHelix,
        HEIGHT_PER_YEAR_DEFAULT: HEIGHT_PER_YEAR_DEFAULT
    };

    root.HelicalProjection = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
