const assert = require('node:assert/strict');
const path = require('node:path');
const HelicalProjection = require('./helical-projection.js');

const p = HelicalProjection.point(10, 0, 50, 1);
assert.equal(p.x, 10);
assert.equal(p.y, 50);
assert.ok(Math.abs(p.z) < 1e-12);

const q = HelicalProjection.point(10, Math.PI / 2, 50, 1);
assert.ok(Math.abs(q.x) < 1e-12);
assert.equal(q.y, 50);
assert.equal(q.z, 10);

const theta = HelicalProjection.thetaFromHeight(200, 100, 1, 0, 100);
assert.ok(Math.abs(theta - (-2 * Math.PI)) < 1e-12);

const pts = HelicalProjection.sampleHelix(0, 100, 10, 100, 1, 0, 2, 100);
assert.equal(pts.length, 9);
assert.equal(pts[1], 0);
assert.equal(pts[4], 50);
assert.equal(pts[7], 100);

const fallback = [];
const startHeight = 0;
const endHeight = 100;
const radius = 10;
const currentHeight = 100;
const orbitalPeriod = 1;
const startAngle = 0;
const segments = 2;
const totalHeight = endHeight - startHeight;
const timeSpanYears = totalHeight / 100;
const orbitsInSpan = timeSpanYears / orbitalPeriod;
const yearsBeforeCurrent = (currentHeight - startHeight) / 100;
const orbitsBeforeCurrent = yearsBeforeCurrent / orbitalPeriod;
const angleBeforeCurrent = orbitsBeforeCurrent * Math.PI * 2;
const curveStartAngle = startAngle + angleBeforeCurrent;
for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = curveStartAngle - (t * orbitsInSpan * Math.PI * 2);
    const height = startHeight + (t * totalHeight);
    fallback.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
}
assert.deepEqual(pts, fallback);

console.log('PASS: helical-projection matches GL Y-up helix numbers');
