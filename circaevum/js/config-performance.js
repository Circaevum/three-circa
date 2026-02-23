/**
 * Performance Configuration for Small Devices
 * 
 * Use this config on Raspberry Pi or other resource-constrained devices.
 * Replace config.js imports with this file for minimal hardware.
 */

// Reduced geometry complexity
const PERFORMANCE_CONFIG = {
    // Star field
    starCount: 1000,  // Reduced from 5000
    
    // Worldline segments
    worldlineSegments: {
        low: 64,      // For zoom levels 1-3
        medium: 128,  // For zoom levels 4-6
        high: 200     // For zoom levels 7+ (reduced from 400)
    },
    
    // Planet geometry
    planetSegments: 16,  // Reduced from 32
    
    // Orbit lines
    orbitSegments: 64,   // Reduced from 128
    
    // Render settings
    renderResolution: {
        width: 1280,
        height: 720,
        pixelRatio: 1.0  // Don't use device pixel ratio
    },
    
    // Disable expensive features
    features: {
        shadows: false,
        postProcessing: false,
        antialiasing: false,
        webxr: false  // Too heavy for small devices
    },
    
    // LOD (Level of Detail) distances
    lodDistances: {
        near: 100,
        medium: 500,
        far: 2000
    }
};

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PERFORMANCE_CONFIG;
} else {
    window.PERFORMANCE_CONFIG = PERFORMANCE_CONFIG;
}
