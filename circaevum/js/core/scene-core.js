/**
 * Scene Core
 * 
 * Handles scene initialization, camera setup, and basic scene elements.
 * Matches Unity Core/SceneCore.cs structure.
 * 
 * Dependencies: THREE.js, config.js, datetime.js
 */

// Global scene variables (will be set by initScene)
// Note: These are declared in main.js, we just assign to them here
// We don't declare them here to avoid "already declared" errors

/**
 * Initialize the Three.js scene
 * @param {Object} dependencies - Required dependencies (THREE, config, datetime functions)
 */
function initScene(dependencies = {}) {
    const {
        THREE = window.THREE,
        SCENE_CONFIG = window.SCENE_CONFIG,
        getHeightForYear = window.getHeightForYear,
        currentYear = window.currentYear
    } = dependencies;

    // Initialize THREE.Vector3 objects now that THREE is loaded
    if (typeof window.focusPoint === 'undefined') {
        window.focusPoint = new THREE.Vector3(0, 0, 0);
    }
    if (typeof window.targetFocusPoint === 'undefined') {
        window.targetFocusPoint = new THREE.Vector3(0, 0, 0);
    }
    if (typeof window.targetCameraUp === 'undefined') {
        window.targetCameraUp = new THREE.Vector3(0, 1, 0);
    }
    if (typeof window.currentCameraUp === 'undefined') {
        window.currentCameraUp = new THREE.Vector3(0, 1, 0);
    }
    if (typeof window.targetCameraPosition === 'undefined') {
        window.targetCameraPosition = new THREE.Vector3(0, 0, 0);
    }
    
    // Assign to variables declared in main.js (they're in global scope)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);

    // Create container group for all scene content (for WebXR positioning)
    sceneContentGroup = new THREE.Group();
    scene.add(sceneContentGroup);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    // Position camera to view current time (2025) - will adjust based on zoom
    const currentYearHeight = getHeightForYear(currentYear, 1);
    
    // Validate currentYearHeight is not NaN
    if (isNaN(currentYearHeight)) {
        console.error('SceneCore: getHeightForYear returned NaN for currentYear', currentYear);
        // Use fallback height (year 2025 = 2500 units)
        camera.position.set(0, 2500, 800);
    } else {
        camera.position.set(0, currentYearHeight + 400, 800);
    }

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Limit pixel ratio on mobile for better performance (max 2)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Enable WebXR support
    renderer.xr.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight); // Keep ambient light in scene (not in group)

    // Position sun light at current date height so it illuminates planets
    const currentDateHeight = getHeightForYear(currentYear, 1);
    
    // Validate currentDateHeight is not NaN, use fallback if needed
    let validatedHeight = currentDateHeight;
    if (isNaN(currentDateHeight)) {
        console.error('SceneCore: getHeightForYear returned NaN for currentYear', currentYear);
        // Use fallback height (year 2025 = 2500 units)
        validatedHeight = 2500;
    }
    
    sunLight = new THREE.PointLight(SCENE_CONFIG.sunColor, 3, 5000);
    sunLight.position.set(0, validatedHeight, 0);
    sceneContentGroup.add(sunLight);

    createStarField(dependencies);

    // Create Sun at origin (it extends vertically through all time)
    const sunGeometry = new THREE.SphereGeometry(SCENE_CONFIG.sunSize, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: SCENE_CONFIG.sunColor
    });
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(0, validatedHeight, 0); // Position at current date
    sceneContentGroup.add(sunMesh);

    // Add sun glow
    const glowGeometry = new THREE.SphereGeometry(SCENE_CONFIG.sunGlowSize, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: SCENE_CONFIG.sunColor,
        transparent: true,
        opacity: 0.3
    });
    sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    sunGlow.position.set(0, validatedHeight, 0); // Position at current date
    sceneContentGroup.add(sunGlow);
    
    // Create Sun's worldline (vertical line through time)
    createSunWorldline(dependencies);

    window.addEventListener('resize', () => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });

    // Variables are already assigned above (they're declared in main.js, so we just assign to them)
    // Also export to window for external access
    window.scene = scene;
    window.camera = camera;
    window.renderer = renderer;
    window.sceneContentGroup = sceneContentGroup;
    window.sunMesh = sunMesh;
    window.sunGlow = sunGlow;
    window.sunLight = sunLight;
    window.stars = stars;
}

/**
 * Create the Sun's worldline (vertical axis through time)
 */
function createSunWorldline(dependencies = {}) {
    const {
        THREE = window.THREE,
        SCENE_CONFIG = window.SCENE_CONFIG,
        getHeightForYear = window.getHeightForYear
    } = dependencies;

    // Validate getHeightForYear is available and returns valid numbers
    if (typeof getHeightForYear !== 'function') {
        console.warn('SceneCore: getHeightForYear not available, skipping sun worldline');
        return;
    }

    const startHeight = getHeightForYear(2000, 1);
    const endHeight = getHeightForYear(2100, 1);
    
    // Check for NaN values
    if (isNaN(startHeight) || isNaN(endHeight)) {
        console.warn('SceneCore: getHeightForYear returned NaN, skipping sun worldline', {
            startHeight,
            endHeight
        });
        return;
    }

    const points = [
        0, startHeight, 0,  // Start at 2000
        0, endHeight, 0    // End at 2100
    ];
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    
    const material = new THREE.LineBasicMaterial({
        color: SCENE_CONFIG.sunColor,
        transparent: true,
        opacity: 0.4,
        linewidth: 1
    });
    
    const sunWorldline = new THREE.Line(geometry, material);
    sceneContentGroup.add(sunWorldline);
}

/**
 * Create star field background
 */
function createStarField(dependencies = {}) {
    const {
        THREE = window.THREE,
        SCENE_CONFIG = window.SCENE_CONFIG
    } = dependencies;

    // Remove existing stars if any
    if (stars) {
        sceneContentGroup.remove(stars);
    }
    
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 5000;
    const positions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount * 3; i += 3) {
        // Random position in a large sphere
        const radius = 5000 + Math.random() * 5000;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = radius * Math.cos(phi);
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        color: SCENE_CONFIG.starColor || 0xffffff,
        size: 1,
        sizeAttenuation: false
    });
    
    stars = new THREE.Points(starGeometry, starMaterial);
    sceneContentGroup.add(stars);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initScene, createSunWorldline, createStarField };
} else {
    window.SceneCore = { initScene, createSunWorldline, createStarField };
}
