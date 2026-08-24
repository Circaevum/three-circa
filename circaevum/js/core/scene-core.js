/**
 * Scene Core
 * 
 * Handles scene initialization, camera setup, and basic scene elements.
 * Matches Unity Core/SceneCore.cs structure.
 * 
 * Dependencies: THREE.js, config.js, datetime.js
 */

function isTourEditorLayoutActive() {
    return (
        typeof document !== 'undefined' &&
        document.body &&
        document.body.classList.contains('is-tour-editor-open')
    );
}

/** Full window by default; shrink to #canvas-container only while tour editor dock is open. */
function getCircaevumViewportSize() {
    if (typeof window === 'undefined') {
        return { width: 0, height: 0 };
    }
    if (!isTourEditorLayoutActive()) {
        return { width: window.innerWidth, height: window.innerHeight };
    }
    const container = document.getElementById('canvas-container');
    const width = container && container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
    const height = container && container.clientHeight > 0 ? container.clientHeight : window.innerHeight;
    return { width, height };
}

function resizeCircaevumViewport() {
    const cam = typeof camera !== 'undefined' ? camera : window.camera;
    const rend = typeof renderer !== 'undefined' ? renderer : window.renderer;
    if (!cam || !rend) return;
    const { width, height } = getCircaevumViewportSize();
    if (width <= 0 || height <= 0) return;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    rend.setSize(width, height);
}

if (typeof window !== 'undefined') {
    window.circaevumResizeViewport = resizeCircaevumViewport;
}

// Global scene variables (will be set by initScene)
// Note: These are declared in main.js, we just assign to them here
// We don't declare them here to avoid "already declared" errors

/**
 * Create Three.js renderer supporting WebGPU with WebGL fallback
 */
function createCircaevumRenderer(initW, initH) {
    const THREE = typeof window !== 'undefined' ? window.THREE : null;
    let rend = null;
    let isWebGPU = false;

    if (typeof THREE !== 'undefined' && typeof THREE.WebGPURenderer === 'function') {
        try {
            rend = new THREE.WebGPURenderer({ antialias: true, alpha: true });
            isWebGPU = true;
            console.log('[Circaevum Engine] WebGPURenderer initialized');
        } catch (e) {
            console.warn('[Circaevum Engine] WebGPURenderer failed, falling back to WebGL:', e);
        }
    }

    if (!rend) {
        rend = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
        isWebGPU = false;
        console.log('[Circaevum Engine] WebGLRenderer initialized');
    }

    rend.setSize(initW, initH);
    rend.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (rend.xr) rend.xr.enabled = true;
    rend.userData = Object.assign(rend.userData || {}, { isWebGPU });
    return rend;
}

function getCircaevumRendererType() {
    const rend = typeof renderer !== 'undefined' ? renderer : (typeof window !== 'undefined' ? window.renderer : null);
    if (!rend) return 'none';
    return (rend.userData && rend.userData.isWebGPU) ? 'WebGPU' : 'WebGL';
}

if (typeof window !== 'undefined') {
    window.createCircaevumRenderer = createCircaevumRenderer;
    window.getCircaevumRendererType = getCircaevumRendererType;
    window.isWebGPUSupported = function() {
        return getCircaevumRendererType() === 'WebGPU';
    };
}

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

    if (typeof window !== 'undefined' && THREE && !window.THREE) {
        window.THREE = THREE;
    }

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

    const { width: initW, height: initH } = getCircaevumViewportSize();
    camera = new THREE.PerspectiveCamera(75, initW / initH, 0.1, 20000);
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

    // Camera lives under scene so system roll (R) rotates content and viewpoint together; focal math stays in scene-local space.
    scene.add(camera);

    renderer = createCircaevumRenderer(initW, initH);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(
        SCENE_CONFIG.ambientLightColor != null ? SCENE_CONFIG.ambientLightColor : 0x9eb4cf,
        SCENE_CONFIG.ambientLightIntensity != null ? SCENE_CONFIG.ambientLightIntensity : 0.34
    );
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
    
    const sunIllum =
        SCENE_CONFIG.sunLightColor != null ? SCENE_CONFIG.sunLightColor : 0xfff9f2;
    const pointInt =
        SCENE_CONFIG.sunPointLightIntensity != null ? SCENE_CONFIG.sunPointLightIntensity : 1.15;
    sunLight = new THREE.PointLight(sunIllum, pointInt, 5000);
    sunLight.position.set(0, validatedHeight, 0);
    sceneContentGroup.add(sunLight);
    if (typeof window.ensureSunDirectionalLight === 'function') {
        window.ensureSunDirectionalLight();
        if (typeof window.updateSunLightingTowardEarth === 'function') {
            window.updateSunLightingTowardEarth();
        }
    }

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
        resizeCircaevumViewport();
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
    const target = dependencies.flattenableGroup || sceneContentGroup;
    target.add(sunWorldline);
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
        size: 1.5,
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
