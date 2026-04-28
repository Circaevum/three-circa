/**
 * Convert astro frame outputs into scene coordinates.
 */
const AstroStateToScene = (function() {
    function mapEarthOrbitalToScene(projected) {
        // Keep mapping simple for now:
        // scene X <- radial, scene Z <- normal (out-of-plane)
        return {
            x: projected.r,
            z: projected.n,
            tangent: projected.t
        };
    }

    return {
        mapEarthOrbitalToScene
    };
})();
