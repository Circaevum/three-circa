/**
 * Trajectory sampler for worldlines.
 */
const AstroTrajectorySampler = (function() {
    function sampleByHeightRange(options) {
        const {
            startHeight,
            endHeight,
            segments,
            sampleAtHeight
        } = options || {};
        if (typeof sampleAtHeight !== 'function') return [];
        const out = [];
        const seg = Math.max(1, segments || 64);
        const span = endHeight - startHeight;
        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            const h = startHeight + (span * t);
            const p = sampleAtHeight(h);
            if (!p || isNaN(p.x) || isNaN(p.z)) continue;
            out.push(p.x, h, p.z);
        }
        return out;
    }

    return {
        sampleByHeightRange
    };
})();
