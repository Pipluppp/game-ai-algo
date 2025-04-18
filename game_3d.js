import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import TWEEN from '@tweenjs/tween.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
// import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'; // Optional: Adds screen-space ambient occlusion


// --- DOM Elements ---
const canvasContainer = document.getElementById('gameCanvasContainer');
const canvas = document.getElementById('threeCanvas');
const btnPlanMove = document.getElementById('btnPlanMove');
const btnPlanShoot = document.getElementById('btnPlanShoot');
const btnReset = document.getElementById('btnReset');
const phaseIndicator = document.getElementById('phaseIndicator');
const messageArea = document.getElementById('messageArea'); // Now inside a container
const weaponLevelInfo = document.getElementById('weaponLevelInfo');
const aiWeaponLevelInfo = document.getElementById('aiWeaponLevelInfo');


// --- Game Constants ---
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
const MAX_WEAPON_LEVEL = 5;
const MAX_POWERUPS = 4;
const POWERUP_SPAWN_CHANCE = 0.6;

// Timing Constants (milliseconds)
const SHOT_FLASH_DURATION = 600; // Slightly longer flash
const MOVEMENT_DURATION = 400; // Slightly slower movement
const RESOLVE_STEP_DELAY = 200; // More delay between steps

// AI constants
const AI_MAX_BEND_CHECK_DEPTH = 2; // How many bends the AI plans ahead for shooting
const AI_MAX_SEGMENT_EVAL_POINTS = 5; // How many points along a segment the AI considers for bending

// --- Three.js Setup ---
let scene, camera, renderer, controls, composer; // Add composer
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = [];
let playerMesh, aiMesh;
let playerLevelIndicator, aiLevelIndicator; // Sprites
let activeHighlights = [];
let activeLasers = [];

// Materials (Enhanced for PBR-like look and emissiveness)
const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a, // Dark grey floor
    roughness: 0.9,
    metalness: 0.2,
    receiveShadow: true,
    flatShading: true // Optional: gives a more defined grid look
});
const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a6a7a, // Desaturated Blue Grey
    roughness: 0.7,
    metalness: 0.3,
    emissive: 0x101010, // Subtle self-illumination
    emissiveIntensity: 0.1,
    flatShading: true,
    castShadow: true,
    receiveShadow: true
});
const playerMaterial = new THREE.MeshStandardMaterial({
    color: 0x007bff, // Blue
    roughness: 0.4,
    metalness: 0.5,
    emissive: 0x003a7f, // Darker blue emissive for glow base
    emissiveIntensity: 0.5, // Base emissive intensity
    castShadow: true
});
const aiMaterial = new THREE.MeshStandardMaterial({
    color: 0xdc3545, // Red
    roughness: 0.4,
    metalness: 0.5,
    emissive: 0x6b1a22, // Darker red emissive for glow base
    emissiveIntensity: 0.5, // Base emissive intensity
    castShadow: true
});
const powerupMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc107, // Yellow
    emissive: 0xffc107, // Emissive matches color for strong glow
    emissiveIntensity: 1.5, // Higher intensity for brighter glow
    roughness: 0.2,
    metalness: 0.8,
    castShadow: true
});
// Highlighting materials (can be emissive to glow with bloom)
const moveHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, emissive: 0x00ff00, emissiveIntensity: 0.2 });
const pathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.5, emissive: 0xffa500, emissiveIntensity: 0.3 });
const invalidPathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, emissive: 0x444444, emissiveIntensity: 0.1 });
const hitHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, emissive: 0xff0000, emissiveIntensity: 0.5 });
// Laser materials (highly emissive)
const playerLaserMaterial = new THREE.MeshStandardMaterial({ color: 0x00bfff, emissive: 0x00bfff, emissiveIntensity: 5.0, transparent: true, opacity: 0.9, side: THREE.AdditiveBlending }); // Additive blending for glow effect
const aiLaserMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xff6a6a, emissiveIntensity: 5.0, transparent: true, opacity: 0.9, side: THREE.AdditiveBlending });


// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State --- (Same as before)
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerWeaponLevel = 1;
let aiWeaponLevel = 1;
let powerUpPositions = [];
let gamePhase = 'planning';
let currentPlanningMode = 'move';
let playerPlannedAction = null;
let aiPlannedAction = null;
let hoverPos = null;
let hoverPath = [];
let hoverPathIsValid = false;
let partialShootPlan = null;
let gameOverState = null;
let isResolving = false;

// --- Initialization ---

function init() {
    console.log("Initializing 3D Game...");
    initThreeJS();
    initGameLogic();
    setupInputListeners();
    animate();
    console.log("Game Initialized.");
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1113); // Match body background slightly

    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100); // Adjusted FOV, smaller far plane is often better for depth
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 0.8, GRID_SIZE * CELL_3D_SIZE * 0.7); // Slightly different camera angle
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows

    // --- Lighting ---
    // Primary directional light for global illumination and shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Brighter
    directionalLight.position.set(GRID_SIZE * CELL_3D_SIZE * 0.6, GRID_SIZE * CELL_3D_SIZE * 1.2, GRID_SIZE * CELL_3D_SIZE * 0.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = GRID_SIZE * CELL_3D_SIZE * 2.5;
    const shadowCamSize = GRID_SIZE * CELL_3D_SIZE * 0.7;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    // directionalLight.shadow.bias = -0.0001; // Optional: adjust bias to fix shadow acne
    scene.add(directionalLight);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x808080, 0.6); // Slightly warmer, less intense ambient
    scene.add(ambientLight);

     // Hemisphere light for subtle fill from sky/ground
     const hemisphereLight = new THREE.HemisphereLight(0x4488bb, 0x080820, 0.5); // Sky color, ground color, intensity
     scene.add(hemisphereLight);

    // --- Post-processing ---
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Bloom Pass: Makes emissive areas glow
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(canvasContainer.clientWidth, canvasContainer.clientHeight),
        1.0, // strength (adjust for intensity)
        0.4, // radius (adjust for spread)
        0.85 // threshold (only pixels brighter than this value glow)
    );
    composer.addPass(bloomPass);

    // SSAO Pass (Optional, can be performance heavy and tricky to tune)
    // const ssaoPass = new SSAOPass(scene, camera, canvasContainer.clientWidth, canvasContainer.clientHeight);
    // ssaoPass.kernelRadius = 8; // Adjust radius
    // ssaoPass.minDistance = 0.005; // Adjust based on scene scale
    // ssaoPass.maxDistance = 0.05; // Adjust based on scene scale
    // ssaoPass.output = SSAOPass.OUTPUT.Default; // Or SSAOPass.OUTPUT.SAO to visualize the effect
    // composer.addPass(ssaoPass);


    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = CELL_3D_SIZE * 3; // Closer zoom allowed
    controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.5;

    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);

    const planeSize = GRID_SIZE * CELL_3D_SIZE;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2;
    intersectionPlane.position.y = -0.04; // Place slightly below floor
    scene.add(intersectionPlane);

    window.addEventListener('resize', onWindowResize, false);
    onWindowResize(); // Initial call
}

function onWindowResize() {
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return; // Prevent errors if container is hidden

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height); // Update composer size too
    // If using SSAOPass, update its size as well: ssaoPass.setSize(width, height);
}

function initGameLogic() {
    clearBoard3D();
    generateGrid();
    createBoard3D();

    const startPositions = findStartPositions();
    if (!startPositions) {
        console.error("Failed to find valid start positions!");
        setMessage("Error: Could not place players. Please reset.");
        disablePlanningControls();
        gameOverState = { winner: 'None', message: 'Initialization Failed' }; // Set game over state
        updatePhaseIndicator();
        return;
    }
    playerPos = startPositions.player;
    aiPos = startPositions.ai;

    playerWeaponLevel = 1;
    aiWeaponLevel = 1;
    powerUpPositions = [];
    powerupMeshes = [];
    gamePhase = 'planning';
    playerPlannedAction = null;
    aiPlannedAction = null;
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null;
    gameOverState = null; // Clear game over state on reset
    isResolving = false;

    createUnits3D();

    // Spawn some initial powerups
    maybeSpawnPowerup(); maybeSpawnPowerup(); maybeSpawnPowerup(); maybeSpawnPowerup();


    setMessage("Plan your move.");
    updatePhaseIndicator();
    updateWeaponLevelInfo();
    enablePlanningControls();
    clearHighlights();

    // Adjust controls target to be centered on the grid
    controls.target.set(0, 0, 0);
    controls.update();

    setPlanningMode('move');
}

function setupInputListeners() {
    btnPlanMove.addEventListener('click', () => setPlanningMode('move'));
    btnPlanShoot.addEventListener('click', () => setPlanningMode('shoot'));
    btnReset.addEventListener('click', initGameLogic);
    canvasContainer.addEventListener('click', handleCanvasClick);
    canvasContainer.addEventListener('mousemove', handleCanvasMouseMove);
}

// --- Grid Generation Functions ---
// (Keep existing grid generation, connection check, start position finding)
function generateGrid() {
    let attempts = 0;
    while (attempts < 10) {
        grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('floor'));
        let wallCount = 0;
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetWallCount = Math.floor(totalCells * WALL_DENSITY);

        while (wallCount < targetWallCount) {
            const x = Math.floor(Math.random() * GRID_SIZE);
            const y = Math.floor(Math.random() * GRID_SIZE);
            // Allow walls anywhere except directly on or adjacent to initial likely spawn corners (2,2), (GS-3,GS-3), etc.
            // This makes finding start positions easier.
            const isNearCorner = (px, py) => {
                return (px >= 0 && px <= 4 && py >= 0 && py <= 4) ||
                       (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                       (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                       (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);
            };

            if (grid[y][x] === 'floor' && !isNearCorner(x, y) && Math.random() < 0.9) { // Higher chance away from corners
                 grid[y][x] = 'wall';
                 wallCount++;
            } else if (grid[y][x] === 'floor' && Math.random() < 0.2) { // Lower chance near corners
                 grid[y][x] = 'wall';
                 wallCount++;
            }
        }

        if (isGridConnected()) {
            console.log("Generated connected grid.");
            return;
        }
        attempts++;
        console.warn(`Generated grid attempt ${attempts} was not connected or valid. Retrying...`);
    }
    console.error("Failed to generate a valid connected grid after multiple attempts.");
    // Fallback: create a mostly empty grid
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('floor'));
    for (let i = 0; i < GRID_SIZE * GRID_SIZE * 0.1; i++) {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        if (grid[y][x] === 'floor') grid[y][x] = 'wall';
    }
    setMessage("Warning: Grid generation failed, using fallback.");
}

function isGridConnected() {
    const startNode = findFirstFloor();
    if (!startNode) return false;

    const q = [startNode];
    const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0;
    let totalFloorCount = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor') totalFloorCount++;
        }
    }
    if (totalFloorCount === 0) return false;

    while (q.length > 0) {
        const { x, y } = q.shift();
        reachableFloorCount++;

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && grid[n.y][n.x] === 'floor' && !visited.has(key)) {
                visited.add(key);
                q.push(n);
            }
        }
    }
    return reachableFloorCount === totalFloorCount;
}

function findFirstFloor() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor') return { x, y };
        }
    }
    return null;
}

function findStartPositions() {
    const potentialStarts = [
        { x: 2, y: 2 },
        { x: GRID_SIZE - 3, y: GRID_SIZE - 3 },
        { x: 2, y: GRID_SIZE - 3 },
        { x: GRID_SIZE - 3, y: 2 }
    ];

    const playerStart = findNearestFloorBFS(potentialStarts[0]);
    let aiStart = null;

    // Try corners far from player first
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]];
    // Shuffle to add randomness to which far corner is tried first
    farCorners.sort(() => Math.random() - 0.5);

    for(const corner of farCorners) {
        const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
        if (potentialAiStart && playerStart && distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) {
            aiStart = potentialAiStart;
            break;
        }
    }

     // If no far spot found, try any reachable floor that isn't the player start
     if (!aiStart && playerStart) {
         console.warn("Could not find a far start position for AI, trying any reachable floor.");
         aiStart = findNearestFloorBFS({x: Math.floor(GRID_SIZE/2), y: Math.floor(GRID_SIZE/2)}, [playerStart]);
     }


    if (playerStart && aiStart) {
        console.log(`Player start: ${playerStart.x},${playerStart.y}. AI start: ${aiStart.x},${aiStart.y}`);
        return { player: playerStart, ai: aiStart };
    }

    console.error("Failed to find suitable start positions even with fallbacks.");
    return null;
}

function findNearestFloorBFS(startSearchPos, occupied = []) {
    const q = [{ pos: startSearchPos, dist: 0 }];
    const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    occupied.forEach(occ => visited.add(`${occ.x},${occ.y}`));

    while (q.length > 0) {
        const current = q.shift();
        const { x, y } = current.pos;

        if (isValid(x, y) && grid[y][x] === 'floor' && !occupied.some(occ => occ.x === x && occ.y === y)) {
            return { x, y };
        }

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && !visited.has(key)) {
                visited.add(key);
                q.push({ pos: n, dist: current.dist + 1 });
            }
        }
    }
    console.warn(`BFS from ${startSearchPos.x},${startSearchPos.y} found no valid floor.`);
    return null;
}


// --- 3D Object Creation / Management Functions ---
function get3DPosition(x, y, yOffset = 0) {
    const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    return new THREE.Vector3(worldX, yOffset, worldZ);
}

function getGridCoords(position) {
    // Add half cell size and round to handle floating point inaccuracies
    const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01);
    const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01);
    return { x, y };
}

function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => mat.dispose());
        } else {
            mesh.material.dispose();
        }
    }
    if (mesh.parent) {
        mesh.parent.remove(mesh);
    }
}

function disposeSprite(sprite) {
    if (!sprite) return;
    if (sprite.material?.map) sprite.material.map.dispose();
    if (sprite.material) sprite.material.dispose();
    if (sprite.parent) {
        sprite.parent.remove(sprite);
    }
}


function clearBoard3D() {
    gameBoardGroup.children.slice().forEach(child => { // Iterate over a copy
         disposeMesh(child);
    });

    // Dispose of level indicators separately if they are sprites not directly in gameBoardGroup children list
     disposeSprite(playerLevelIndicator);
     disposeSprite(aiLevelIndicator);

    floorMeshes = [];
    wallMeshes = [];
    powerupMeshes = [];
    playerMesh = null;
    aiMesh = null;
    playerLevelIndicator = null;
    aiLevelIndicator = null;
    activeHighlights = [];

     // Dispose of active lasers
    activeLasers.slice().forEach(laser => { // Iterate over a copy
        disposeMesh(laser);
    });
    activeLasers = [];
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    wallMeshes = [];

    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE); // Slightly thicker floor
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);

            if (grid[y][x] === 'floor') {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial); // Use shared material instance
                floorMesh.position.copy(pos);
                floorMesh.position.y = -0.1; // Position below y=0 grid plane
                floorMesh.castShadow = false;
                floorMesh.receiveShadow = true;
                floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
                gameBoardGroup.add(floorMesh);
                floorMeshes[y][x] = floorMesh;
            }
            else if (grid[y][x] === 'wall') {
                 // Optionally add a base for walls if floor material isn't covering
                 // const baseMesh = new THREE.Mesh(floorGeom, floorMaterial);
                 // baseMesh.position.copy(pos);
                 // baseMesh.position.y = -0.1;
                 // baseMesh.receiveShadow = true;
                 // gameBoardGroup.add(baseMesh);

                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial); // Use shared material instance
                wallMesh.position.copy(pos);
                wallMesh.position.y = WALL_HEIGHT / 2; // Position correctly above y=0 grid plane
                wallMesh.castShadow = true;
                wallMesh.receiveShadow = true;
                wallMesh.userData = { gridX: x, gridY: y, type: 'wall' };
                gameBoardGroup.add(wallMesh);
                wallMeshes.push(wallMesh);
                floorMeshes[y][x] = null; // Wall cell doesn't have a floor mesh reference
            }
        }
    }
}

function createUnits3D() {
    const playerUnitHeight = CELL_3D_SIZE * 0.9; // Taller player
    const playerUnitRadius = CELL_3D_SIZE * 0.3;

    const aiUnitHeight = CELL_3D_SIZE * 1.0; // Taller AI
    const aiUnitRadius = CELL_3D_SIZE * 0.4;


    const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - playerUnitRadius * 2, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial); // Use shared material instance
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = false; // Player doesn't receive shadow from itself/grid
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2); // Position centered vertically
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: 'player' };
    gameBoardGroup.add(playerMesh);

    // Level indicator sprite
    playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
    playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0); // Position above unit
    playerMesh.add(playerLevelIndicator);


    const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8); // More segments for smoother cone base
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial); // Use shared material instance
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = false; // AI doesn't receive shadow from itself/grid
     // Cone geometry vertex 0 is the tip, base is at -height/2. Adjust Y.
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2);
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: 'ai' };
    gameBoardGroup.add(aiMesh);

    // Level indicator sprite
    aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
    aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0); // Position above unit
    aiMesh.add(aiLevelIndicator);

    updateWeaponLevelVisuals(); // Set initial emissive intensities
}

function createLevelTextMesh(level) {
     const canvas = document.createElement('canvas');
     const context = canvas.getContext('2d');
     const size = 128; // Higher resolution for better text
     const halfSize = size / 2;
     canvas.width = size;
     canvas.height = size;

     context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Darker background
     context.beginPath();
     context.roundRect(0, 0, size, size, size * 0.15); // Less rounded rectangle
     context.fill();

     context.font = `Bold ${size * 0.6}px Arial`; // Bolder, slightly larger font
     context.fillStyle = 'white';
     context.textAlign = 'center';
     context.textBaseline = 'middle';
     context.fillText(level.toString(), halfSize, halfSize + size * 0.02); // Vertically center text

     const texture = new THREE.CanvasTexture(canvas);
     texture.needsUpdate = true;
     texture.colorSpace = THREE.SRGBColorSpace; // Important for correct color display

     const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false }); // Disable depth test so it's always visible
     const sprite = new THREE.Sprite(spriteMaterial);
     sprite.scale.set(0.1, 0.1, 1); // Adjust scale in 3D space
     return sprite;
}

function updateWeaponLevelVisuals() {
    // Dispose old sprites before creating new ones
     if (playerMesh) {
        disposeSprite(playerLevelIndicator);
        playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
        const playerUnitHeight = CELL_3D_SIZE * 0.9;
        playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0);
        playerMesh.add(playerLevelIndicator);

        // Update emissive intensity based on level
        playerMesh.material.emissiveIntensity = 0.5 + (playerWeaponLevel - 1) * 0.3; // Increase glow with level
    }
     if (aiMesh) {
        disposeSprite(aiLevelIndicator);
        aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
        const aiUnitHeight = CELL_3D_SIZE * 1.0;
        aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0);
        aiMesh.add(aiLevelIndicator);

        // Update emissive intensity based on level
        aiMesh.material.emissiveIntensity = 0.5 + (aiWeaponLevel - 1) * 0.3; // Increase glow with level
    }
}

function createPowerup3D(x, y) {
    const powerupSize = CELL_3D_SIZE * 0.3; // Slightly larger
    const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0); // Use Icosahedron for smoother look
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial); // Use shared material instance
    mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7)); // Position slightly floating above floor
    mesh.castShadow = true;
    mesh.userData = { type: 'powerup', gridX: x, gridY: y, spinSpeed: Math.random() * 0.03 + 0.015 }; // Faster spin
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}

function removePowerup3D(x, y) {
    const index = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (index !== -1) {
        const powerupObj = powerupMeshes[index];
        disposeMesh(powerupObj.mesh);
        powerupMeshes.splice(index, 1);
    }
}


// --- Highlighting Functions ---
function clearHighlights() {
    activeHighlights.forEach(mesh => {
        // Restore original material properties or use a base floor highlight
        // Cloning materials can cause performance issues if not managed.
        // A better way might be to have a separate highlight mesh layer,
        // but for simplicity, we swap materials back here.
        // Let's reset them to the base floor material to avoid leaks/many materials.
        if (mesh.material !== floorMaterial) {
             disposeMesh(mesh); // Dispose the highlight instance
        }
    });
    activeHighlights = [];
    // Recreate floor meshes for highlighted cells
     for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor' && !floorMeshes[y][x]) {
                const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
                 floorMesh.position.copy(get3DPosition(x, y));
                 floorMesh.position.y = -0.1;
                 floorMesh.castShadow = false;
                 floorMesh.receiveShadow = true;
                 floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
                 gameBoardGroup.add(floorMesh);
                 floorMeshes[y][x] = floorMesh;
            }
        }
     }
}

function highlightCell(x, y, highlightMaterial) {
    if (isValid(x, y) && grid[y][x] === 'floor') { // Only highlight floor tiles
        const existingMesh = floorMeshes[y]?.[x];
         if (existingMesh) {
             disposeMesh(existingMesh); // Remove the base floor mesh
             floorMeshes[y][x] = null; // Clear reference
         }

         // Create a new highlight mesh instance
        const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE); // Slightly taller highlight
        const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone()); // Clone material for each highlight
        highlightMesh.position.copy(get3DPosition(x, y));
        highlightMesh.position.y = -0.08; // Position slightly above base floor level
        highlightMesh.userData = { gridX: x, gridY: y, type: 'highlight' }; // Mark as highlight
        gameBoardGroup.add(highlightMesh);
        activeHighlights.push(highlightMesh); // Add to list for clearing
    }
}

function renderHighlights() {
    // Only clear and re-render highlights if needed (during planning)
    if (gamePhase !== 'planning' || gameOverState || isResolving) {
        if (activeHighlights.length > 0) clearHighlights();
        return;
    }

    // Check if highlights need updating (e.g., mouse moved, mode changed)
    // For simplicity here, we clear and re-render every frame in planning phase.
    // A more optimized approach would track state changes.
     if (activeHighlights.length > 0) clearHighlights();


    const opponentTargetPos = aiPos; // Target for player is always AI

    if (currentPlanningMode === 'move') {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));
    }
    else if (currentPlanningMode === 'shoot') {
         let pathToShow = [];
         let useMaterial = pathHighlightMaterial;

         // Show hover path if available and user is still picking points
         if (partialShootPlan?.needsInput && hoverPath.length > 0) {
             pathToShow = hoverPath;
              if (!hoverPathIsValid) {
                 useMaterial = invalidPathHighlightMaterial;
              }
         }
         // Show the planned path if action is locked (shouldn't happen in planning phase, but for clarity)
         else if (playerPlannedAction?.type === 'shoot') {
             pathToShow = playerPlannedAction.path;
             useMaterial = pathHighlightMaterial;
         }
         // Show the current partial plan if user is picking bends
          else if (partialShootPlan?.path?.length > 0 && !partialShootPlan.needsInput) {
             pathToShow = partialShootPlan.path;
             useMaterial = pathHighlightMaterial;
         }


         let hitOpponent = false;
         pathToShow.forEach(p => {
             highlightCell(p.x, p.y, useMaterial);
             if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y && useMaterial !== invalidPathHighlightMaterial) {
                 hitOpponent = true;
             }
         });

        // Highlight target cell if hit, even if it's not part of the path visually
        // This might overlap with path highlight, but that's okay.
        if (hitOpponent) {
             highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial);
        }
    }
}


// --- Laser Effect Function ---
function createLaserBeam(path, material) {
    if (!path || path.length < 1) return null;

     // Adjust path for visual effect: start slightly above unit, end slightly above target
     const adjustedPath = [];
     const startOffset = playerMesh.position.y; // Start at player height
     const endOffset = aiMesh.position.y; // End at AI height

     // Start point
     const firstPoint3D = get3DPosition(path[0].x, path[0].y, startOffset);
     adjustedPath.push(firstPoint3D);

     // Intermediate points
     for (let i = 1; i < path.length; i++) {
         adjustedPath.push(get3DPosition(path[i].x, path[i].y, startOffset));
     }

     // End point (extend slightly past the last path cell towards the target)
     if (path.length > 0) {
          const lastPoint = path[path.length - 1];
          const targetUnitPos = (material === playerLaserMaterial) ? aiPos : playerPos; // Who is being shot at
          if (lastPoint.x === targetUnitPos.x && lastPoint.y === targetUnitPos.y) {
              // If the path ends on the target, extend slightly to the unit center
              const lastPoint3D = get3DPosition(lastPoint.x, lastPoint.y, startOffset); // Use startOffset for consistency before tween
              adjustedPath[adjustedPath.length-1] = lastPoint3D; // Replace last point with one at unit height

              const targetUnit3D = get3DPosition(targetUnitPos.x, targetUnitPos.y, endOffset);

              // Add a point slightly past the last grid cell towards the target unit center
              const dirToTarget = targetUnit3D.clone().sub(lastPoint3D).normalize().multiplyScalar(CELL_3D_SIZE * 0.3); // Extend by ~30% of cell size
              adjustedPath.push(lastPoint3D.clone().add(dirToTarget));
          }
     }


    // Use CatmullRomCurve3 for smooth path visualization, even if path is straight line segments
    const curve = new THREE.CatmullRomCurve3(adjustedPath, false, 'catmullrom', 0.1);
    const tubeRadius = CELL_3D_SIZE * 0.08; // Thicker laser
    const tubeSegments = Math.max(8, path.length * 4); // More segments for smoother curve
    const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);

     // Use AdditiveBlending material
    const laserMesh = new THREE.Mesh(tubeGeom, material.clone()); // Clone material for opacity tween
    laserMesh.userData = { type: 'laser' };
    // Lasers usually don't cast shadows
    laserMesh.castShadow = false;
    laserMesh.receiveShadow = false;

    scene.add(laserMesh);
    activeLasers.push(laserMesh);

    // Animate opacity for fading out
    new TWEEN.Tween({ opacity: laserMesh.material.opacity })
        .to({ opacity: 0 }, SHOT_FLASH_DURATION) // Fade out over full duration
        .easing(TWEEN.Easing.Quadratic.In)
        .onUpdate((obj) => {
            if(laserMesh.material) laserMesh.material.opacity = obj.opacity;
        })
        .onComplete(() => {
            disposeMesh(laserMesh);
            const index = activeLasers.indexOf(laserMesh);
            if (index > -1) activeLasers.splice(index, 1);
        })
        .start();

     // Optional: Animate scale or color?
    // const scaleTween = new TWEEN.Tween(laserMesh.scale)
    //     .from({ x: 0.1, y: 0.1, z: 0.1 })
    //     .to({ x: 1, y: 1, z: 1 }, SHOT_FLASH_DURATION * 0.3)
    //     .easing(TWEEN.Easing.Back.Out)
    //     .start();

    return laserMesh;
}


// --- Animation Loop ---
function animate(time) {
    requestAnimationFrame(animate);
    TWEEN.update(time);
    controls.update();

    // Animate powerup rotation
    powerupMeshes.forEach(p => {
        p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.015;
        p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5; // Slower tilt
    });

    // Update highlights in the animate loop if needed (e.g., based on hover)
    // renderHighlights is called by mousemove/click and setPlanningMode,
    // but calling it here ensures they are updated even if camera moves or during animations.
    // However, clearing and recreating meshes every frame is expensive.
    // Let's only call it when input/state changes.
    // If we want highlights to animate or react to camera (like pulsating),
    // we'd need a different approach than material swapping/mesh recreation.
    // For now, rely on input/state changes to trigger renderHighlights.

    // Render the scene using the composer
    composer.render();
}

// --- Input Handling Functions ---
function handleCanvasMouseMove(event) {
    updateMouseCoords(event);
    // Only update hover path if planning shoot mode, not resolving, not game over, and needs input
    if (gamePhase !== 'planning' || currentPlanningMode !== 'shoot' || playerPlannedAction || gameOverState || isResolving || !partialShootPlan?.needsInput) {
        if (hoverPath.length > 0 || !hoverPathIsValid) { // Clear old hover state if conditions are not met
             hoverPos = null;
             hoverPath = [];
             hoverPathIsValid = false;
             renderHighlights(); // Clear highlights immediately
        }
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane); // Raycast against the invisible plane
    if (intersects.length > 0) {
        const targetGridPos = getGridCoords(intersects[0].point);
        // Check if the intersection point is actually within the grid boundaries
        if (isValid(targetGridPos.x, targetGridPos.y)) {
            // Only update if the hover position has changed
            if (!hoverPos || hoverPos.x !== targetGridPos.x || hoverPos.y !== targetGridPos.y) {
                hoverPos = { ...targetGridPos };
                const startPos = partialShootPlan.lastBendPos;
                // Calculate the segment from the last bend point to the hover cell
                const segmentResult = calculateShotPathSegment(startPos, hoverPos, aiPos);

                if (segmentResult.isValidSegment) {
                    // Append the new valid segment to the existing partial path
                    hoverPath = [...partialShootPlan.path, ...segmentResult.path];
                    hoverPathIsValid = true;
                } else {
                    // If segment is invalid, show the path up to the blocked point if any,
                    // or just the partial plan path plus the invalid hover pos.
                    // For visual clarity, let's show the partial plan + the hover pos (which will be marked invalid).
                    hoverPath = [...partialShootPlan.path, hoverPos];
                    hoverPathIsValid = false;
                }
                renderHighlights(); // Re-render highlights based on the new hover path
            }
        } else {
             // Mouse is over the plane but outside the valid grid area
             if (hoverPos !== null) { // Only clear if it was previously over a valid area
                 hoverPos = null;
                 hoverPath = [];
                 hoverPathIsValid = false;
                 renderHighlights(); // Clear highlights
             }
        }
    } else {
        // Mouse is not over the intersection plane
        if (hoverPos !== null) { // Only clear if it was previously over a valid area
             hoverPos = null;
             hoverPath = [];
             hoverPathIsValid = false;
             renderHighlights(); // Clear highlights
        }
    }
}

function handleCanvasClick(event) {
     if (gamePhase !== 'planning' || playerPlannedAction || gameOverState || isResolving) return;
     updateMouseCoords(event);
     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObject(intersectionPlane); // Raycast against the invisible plane
    if (intersects.length > 0) {
        const { x, y } = getGridCoords(intersects[0].point);
         if (isValid(x,y) && grid[y][x] === 'floor') { // Ensure clicked cell is a floor tile
             if (currentPlanningMode === 'move') handleMoveInput(x, y);
             else if (currentPlanningMode === 'shoot') handleShootInput(x, y);
         } else {
              setMessage("Invalid click: Must click on a floor tile.");
         }
    } else {
        setMessage("Invalid click: Must click within the grid area.");
    }
}

function updateMouseCoords(event) {
    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// --- UI Update Functions ---
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() {
    let phaseText = 'Unknown';
    if (gameOverState) { phaseText = `Game Over! ${gameOverState.message}`; }
    else { phaseText = `Phase: ${gamePhase.charAt(0).toUpperCase() + gamePhase.slice(1)}`; }
    phaseIndicator.textContent = phaseText;
}
function updateWeaponLevelInfo() {
     weaponLevelInfo.textContent = `Your Weapon Level: ${playerWeaponLevel}`;
     aiWeaponLevelInfo.textContent = `AI Weapon Level: ${aiWeaponLevel}`;
     updateWeaponLevelVisuals(); // Update the 3D visuals of the units
}
function enablePlanningControls() {
    if (gameOverState) return;
    btnPlanMove.disabled = false;
    btnPlanShoot.disabled = false;
    isResolving = false;
    // Highlights will be rendered on next mouse move or explicit call
}
function disablePlanningControls() {
    btnPlanMove.disabled = true;
    btnPlanShoot.disabled = true;
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null; // Clear any partial plan
    clearHighlights(); // Immediately clear highlights when disabling controls
    // No longer calling renderHighlights in animate loop when disabled
}

// --- Planning Phase Logic Functions ---
function setPlanningMode(mode) {
    if (gamePhase !== 'planning' || gameOverState || isResolving) return;
    console.log("Setting planning mode:", mode);
    currentPlanningMode = mode;
    playerPlannedAction = null; // Reset planned action when changing mode
    partialShootPlan = null; // Reset partial plan
    hoverPos = null;
    hoverPath = []; // Clear hover path
    hoverPathIsValid = false;

    btnPlanMove.classList.toggle('active', mode === 'move');
    btnPlanShoot.classList.toggle('active', mode === 'shoot');

    if (mode === 'move') {
         setMessage("Click an adjacent floor cell to plan your move.");
    } else if (mode === 'shoot') {
          partialShootPlan = {
             needsInput: true, maxBends: playerWeaponLevel - 1, segments: [], path: [], lastBendPos: playerPos
         };
         setMessage(`Weapon Level ${playerWeaponLevel} Shot: Click target cell for segment 1 (Max Bends: ${partialShootPlan.maxBends}).`);
    }
    renderHighlights(); // Render highlights for the new mode
}

function handleMoveInput(targetX, targetY) {
     if (currentPlanningMode !== 'move' || playerPlannedAction || gameOverState || isResolving) return;

    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidMove = validMoves.some(move => move.x === targetX && move.y === targetY);

    if (isValidMove) {
        playerPlannedAction = { type: 'move', target: { x: targetX, y: targetY } };
        setMessage(`Move planned to ${targetX},${targetY}. Waiting for AI...`);
        lockPlayerAction();
    } else {
        setMessage("Invalid move target. Click a highlighted square.");
    }
}

// --- Input Handling Functions ---
// (MODIFIED handleShootInput for clarity and ensure segment targeting)
function handleShootInput(clickX, clickY) {
    if (currentPlanningMode !== 'shoot' || !partialShootPlan || !partialShootPlan.needsInput || playerPlannedAction || gameOverState || isResolving) {
        console.warn("Ignoring shoot input - not in correct state.");
        return;
    }

    const targetPos = { x: clickX, y: clickY }; // The clicked cell is the target for THIS segment
    const startPos = partialShootPlan.lastBendPos; // Start from the player or the last bend point

    // Prevent targeting the start cell itself
    if (targetPos.x === startPos.x && targetPos.y === startPos.y) {
        setMessage("Cannot target the starting cell for a segment.");
        return;
    }

    // Check if the segment from startPos to targetPos is valid (doesn't hit walls before targetPos)
    // The opponentPos is needed by calculateShotPathSegment to check for hits along the way, but validity depends on reaching targetPos.
    const segmentResult = calculateShotPathSegment(startPos, targetPos, aiPos);

    if (!segmentResult.isValidSegment) {
        // The path *to the clicked cell* is blocked by a wall.
        setMessage("Invalid target: Path segment is blocked by a wall.");
        hoverPath = []; // Clear hover state on invalid click
        hoverPathIsValid = false;
        renderHighlights(); // Update highlights to remove invalid hover path
        return;
    }

    // --- Valid segment selected ---
    // Add the *exact path* calculated for this segment to the partial plan
    partialShootPlan.segments.push({ path: segmentResult.path, endPos: targetPos });
    // The full path is rebuilt from segments, ensure no duplicates if targetPos included in path
    // Rebuild the full path from all segment paths collected so far
    partialShootPlan.path = partialShootPlan.segments.flatMap(seg => seg.path);

    // Update the last bend position to the *clicked* target cell
    partialShootPlan.lastBendPos = targetPos;

    const bendsMade = partialShootPlan.segments.length - 1; // Bends are the intermediate points

    if (bendsMade < partialShootPlan.maxBends) {
        // Plan another segment/bend
        partialShootPlan.needsInput = true;
        setMessage(`Level ${playerWeaponLevel} Shot: Bend ${bendsMade + 1} at ${targetPos.x},${targetPos.y}. Click target cell for segment ${bendsMade + 2}.`);
        hoverPos = null; // Clear hover state
        hoverPath = [];
        hoverPathIsValid = false;
        renderHighlights(); // Update highlights to show current planned path
    } else {
        // Max bends reached, finalize the shot plan
        partialShootPlan.needsInput = false;
        const finalPlan = {
            type: 'shoot',
            targetPoints: partialShootPlan.segments.map(seg => seg.endPos), // End points of segments are the bend points + final target
            path: partialShootPlan.path, // The full path taken by the shot
        };

        playerPlannedAction = finalPlan;
        setMessage("Shoot planned. Waiting for AI...");
        lockPlayerAction();
    }
}

function lockPlayerAction() {
    disablePlanningControls(); // Disable controls and clear highlights
    partialShootPlan = null; // Ensure partial plan is cleared
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;

    // Short delay before AI plans and resolution starts
    setTimeout(() => {
        planAiAction(); // AI plans its action
        startResolution(); // Start the resolution phase
    }, 300);
}

// --- Shot Path Calculation Functions ---
// (Keep calculateShotPathSegment and calculateFullPathFromTargets as is)
function calculateShotPathSegment(startPos, targetPos, opponentPos) {
    let path = [];
    let currentPos = { ...startPos };
    let isValidSegment = true;
    let hitTargetAlongSegment = false; // Renamed for clarity

    const dxTotal = targetPos.x - startPos.x;
    const dyTotal = targetPos.y - startPos.y;

    // Determine primary direction (must be purely horizontal or vertical)
    let stepDir = { dx: 0, dy: 0 };
    if (Math.abs(dxTotal) > Math.abs(dyTotal)) {
        if (dyTotal !== 0) return { path: [], isValidSegment: false, hitTarget: false }; // Must be horizontal
        stepDir.dx = Math.sign(dxTotal);
    } else if (Math.abs(dyTotal) > 0) {
         if (dxTotal !== 0) return { path: [], isValidSegment: false, hitTarget: false }; // Must be vertical
        stepDir.dy = Math.sign(dyTotal);
    } else {
        return { path: [], isValidSegment: false, hitTarget: false }; // start === target or no movement
    }

    // Traverse step by step *up to the target cell*
    while (currentPos.x !== targetPos.x || currentPos.y !== targetPos.y) {
        const nextX = currentPos.x + stepDir.dx;
        const nextY = currentPos.y + stepDir.dy;

        if (!isValid(nextX, nextY) || isWall(nextX, nextY)) {
            isValidSegment = false; // Hit wall or went off grid before reaching targetPos
            // path.push({ x: nextX, y: nextY }); // Optionally add the wall cell
            break; // Stop traversal for this segment
        }

        currentPos = { x: nextX, y: nextY };
        path.push({ ...currentPos }); // Add the valid step to the path

        // Check if opponent is hit *at this cell* but DO NOT stop
        if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) {
            hitTargetAlongSegment = true; // Mark that the opponent was on this segment path
            // --- DO NOT BREAK HERE --- allow shot to continue to targetPos
        }

        // If we reached the target cell (should be redundant due to while loop condition, but safe check)
        if (currentPos.x === targetPos.x && currentPos.y === targetPos.y) {
             break;
        }
    }

    // A segment is valid if it reaches the target cell AND didn't hit a wall/go off-grid before the target.
    // The check `currentPos.x === targetPos.x && currentPos.y === targetPos.y` ensures it reached the target.
    // The `isValidSegment = false` flag handles hitting walls.
    const reachedTargetCell = isValidSegment && (currentPos.x === targetPos.x && currentPos.y === targetPos.y);

    // Note: The `hitTarget` returned here now means "was the opponent on any part of this specific segment's valid path?"
    return { path: path, isValidSegment: reachedTargetCell, hitTarget: hitTargetAlongSegment };
}


function calculateFullPathFromTargets(startPos, targetPoints, opponentPos) {
    let fullPath = [];
    let currentPos = { ...startPos };
    let pathIsValid = true;
    let finalHitTarget = false; // Was the opponent hit *anywhere* on the *entire valid* path?

    for (const targetPoint of targetPoints) {
        // Calculate segment from the *previous* target point (or start) to the *current* target point
        const segmentResult = calculateShotPathSegment(currentPos, targetPoint, opponentPos);

        // Append the calculated path for this segment, even if it's invalid (for potential visual feedback if needed)
        // However, only add to the *logical* fullPath if the segment was valid.
        // Let's refine: The fullPath should only contain the valid path steps.
        if (segmentResult.isValidSegment) {
            fullPath.push(...segmentResult.path);
        }


        // The entire path becomes invalid if *any* segment fails to reach its target point without hitting a wall.
        if (!segmentResult.isValidSegment) {
            pathIsValid = false;
            // If a segment is invalid, we might still want the path up to the point of failure for visualization.
            // The current logic correctly stops appending valid path segments.
            break; // The overall path is broken, stop processing further segments
        }

        // Segment is valid. Update the starting point for the next segment.
        currentPos = targetPoint;

        // Check if the opponent was hit by this *valid* segment
        if (segmentResult.hitTarget) {
             finalHitTarget = true; // Mark that the opponent was hit somewhere along the valid path
             // Don't break, continue calculating the full path for visualization
        }
    }

    // The path is valid only if *all* segments were valid (reached their target points).
    // The hitTarget flag is true if the opponent was on any cell in the valid path segments.
    return { path: fullPath, isValid: pathIsValid, hitTarget: finalHitTarget };
}


// --- AI Logic Functions ---
function planAiAction() {
    console.log("AI Planning...");
    const possibleActions = [];
    const currentAiPos = { ...aiPos };
    const currentPlayerPos = { ...playerPos };
    const currentAiLevel = aiWeaponLevel;
    const maxBendsToPlan = Math.min(currentAiLevel - 1, AI_MAX_BEND_CHECK_DEPTH);

    // 1. Stay Put
    possibleActions.push({ type: 'stay' });

    // 2. Possible Moves
    getValidMoves(currentAiPos, currentPlayerPos).forEach(move => {
        possibleActions.push({ type: 'move', target: move });
    });

    // 3. Possible Shots (Recursive generation, limited depth)
    function generateShotActions(startPos, currentTargetPathPoints, bendsSoFar) {
        // Base Case: Max bends reached or exceeded planned depth
        if (bendsSoFar > maxBendsToPlan) return;

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        // If we just bent, exclude the reverse direction for the next segment
        let forbiddenDir = { dx: 0, dy: 0 };
        if (currentTargetPathPoints.length > 0) {
            const lastBend = currentTargetPathPoints[currentTargetPathPoints.length - 1];
            const prevPos = currentTargetPathPoints.length > 1 ? currentTargetPathPoints[currentTargetPathPoints.length - 2] : currentAiPos;
            forbiddenDir = { dx: Math.sign(prevPos.x - lastBend.x), dy: Math.sign(prevPos.y - lastBend.y) };
        }


        directions.forEach(dir => {
             // Prevent immediate 180-degree turn for the *next* segment
            if (dir.dx === forbiddenDir.dx && dir.dy === forbiddenDir.dy && (dir.dx !== 0 || dir.dy !== 0)) {
                 return; // Skip reverse direction
             }

             let currentExplorePos = { ...startPos };
             // Explore cells along the current direction up to GRID_SIZE away, or a performance limit
             for (let i = 1; i <= Math.max(GRID_SIZE, AI_MAX_SEGMENT_EVAL_POINTS); i++) {
                 const potentialTargetX = startPos.x + dir.dx * i;
                 const potentialTargetY = startPos.y + dir.dy * i;
                 const potentialTarget = { x: potentialTargetX, y: potentialTargetY };

                 if (!isValid(potentialTargetX, potentialTargetY)) break; // Off grid

                 // Check segment validity from startPos to potentialTarget
                 const segmentResult = calculateShotPathSegment(startPos, potentialTarget, currentPlayerPos);

                 if (!segmentResult.isValidSegment) {
                     break; // Path blocked by wall, stop checking further along this direction
                 }

                 // --- Valid Segment found to potentialTarget ---
                 const newTargetPathPoints = [...currentTargetPathPoints, potentialTarget];

                 // Calculate the full path for this potential action
                 // Note: This is calculated from the *original AI pos* through all targetPoints
                 const fullPathResult = calculateFullPathFromTargets(currentAiPos, newTargetPathPoints, currentPlayerPos);

                 // Add the shot action if the full path is valid (up to the final target point)
                 if(fullPathResult.isValid) {
                     possibleActions.push({
                         type: 'shoot',
                         targetPoints: newTargetPathPoints, // Store the intermediate bend points + final target
                         path: fullPathResult.path, // Store the actual cell path
                         // Add other relevant info like hit status if needed for evaluation
                         hitsPlayer: fullPathResult.hitTarget
                     });
                 }

                 // If the segment hit the player, AI might not want to bend further past them
                 // depending on strategy, but for general path generation, we continue.

                 // --- Recursive Call for Next Bend (if within limits) ---
                 if (bendsSoFar + 1 < currentAiLevel) { // Can we make another bend based on AI level?
                     // Recursive call starts from the current *potentialTarget* as the bend point
                     generateShotActions(potentialTarget, newTargetPathPoints, bendsSoFar + 1);
                 }

                 // Optional Performance Limit: Stop checking points along this segment if too far
                 // if (i >= AI_MAX_SEGMENT_EVAL_POINTS && bendsSoFar + 1 < currentAiLevel) {
                 //      // Allow bending from this point, but don't explore further along the current straight line segment for *new* bend points
                 //      break; // uncomment to enable
                 // }
             }
        });
    }

    // Start shot generation from the AI's current position
    generateShotActions(currentAiPos, [], 0);


    // --- Evaluate Actions ---
    let bestAction = { type: 'stay' }; // Default to stay
    let bestScore = -Infinity; // Start with a very low score

     // Evaluate default 'stay' action first
    bestScore = evaluateAiPotentialAction(bestAction, currentAiPos, currentPlayerPos);
    console.log(`AI Action Eval: stay Score: ${bestScore.toFixed(2)}`);


    // Remove duplicate actions (can happen with path generation exploring same targets)
    const uniqueActions = [];
    const seenActions = new Set();
    possibleActions.forEach(action => {
         let key;
         if(action.type === 'move') key = `move-${action.target.x},${action.target.y}`;
         else if(action.type === 'stay') key = 'stay'; // Should be unique already
         else if(action.type === 'shoot') {
             // Create a key based on the target points of the shoot path
             key = `shoot-${action.targetPoints.map(p => `${p.x},${p.y}`).join('|')}`;
         } else key = Math.random().toString(); // Fallback - shouldn't happen

        if (!seenActions.has(key)) {
            uniqueActions.push(action);
            seenActions.add(key);
        } else {
             // console.log("Skipped duplicate AI action:", action); // Optional logging for duplicates
        }
    });


    uniqueActions.forEach(action => {
        if (action.type === 'stay') return; // Already evaluated 'stay'

        const score = evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos);

        // Simple logging for evaluation results
         let actionDesc = action.type;
         if(action.type === 'move') actionDesc += ` to ${action.target.x},${action.target.y}`;
         else if(action.type === 'shoot') actionDesc += ` bends: ${action.targetPoints.length - 1}`;
        console.log(`AI Action Eval: ${actionDesc} Score: ${score.toFixed(2)}`);


        // Selection logic: Prioritize significantly better scores,
        // use randomization for scores that are very close.
        if (score > bestScore) {
            bestScore = score;
            bestAction = action;
        } else if (score >= bestScore - 5) { // Consider actions within a small score range (-5 to +0)
             if (Math.random() > 0.4) { // 60% chance to pick the new one if close
                 bestScore = score;
                 bestAction = action;
             }
        }
    });

    // --- Select Action ---
    aiPlannedAction = bestAction;
    console.log("AI Planned Action:", aiPlannedAction);
}


function evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos) {
    let score = 0;
    let predictedAiPos = { ...currentAiPos }; // Where AI *would* be after this action

    if (action.type === 'move') {
        predictedAiPos = { ...action.target };
    }
    // If action is shoot or stay, predictedAiPos is the same as currentAiPos

    // (+) Offensive - Hitting Player
    if (action.type === 'shoot') {
        // The 'hitsPlayer' property was pre-calculated in generateShotActions based on the *valid* path
        if (action.hitsPlayer) {
            score += 1200; // High score for hitting the player
             // Slightly prefer simpler shots (fewer target points/bends)
             score -= (action.targetPoints.length * 40); // Penalty for complexity
        }
         // Optional: Bonus for ending the shot near the player, even if not a direct hit?
         // const lastPathPoint = action.path.length > 0 ? action.path[action.path.length-1] : null;
         // if (lastPathPoint && distance(lastPathPoint, currentPlayerPos) <= 2) {
         //      score += 50; // Small bonus for near miss / area denial
         // }
    }

     // (+) Powerup - Collection
    if (action.type === 'move') {
        if (powerUpPositions.some(p => p.x === action.target.x && p.y === action.target.y)) {
            score += 700; // High score for collecting powerup
        }
    }

     // (-) Defensive - Being Targeted: Check if player can hit AI's predicted position
    if (canHitTarget(playerPos, predictedAiPos, playerWeaponLevel)) { // Use the player's weapon level
        score -= 1000; // Heavy penalty for being hittable
         // Add extra penalty if AI moves *into* a hittable spot it wasn't in before
         if (action.type === 'move' && !canHitTarget(playerPos, currentAiPos, playerWeaponLevel)) {
              score -= 300; // Extra penalty for moving into danger
         }
    }

    // (+) Defensive - Cover: Check if a *straight* shot from player to predicted pos is blocked by a wall
     // This is a simplified check for direct line-of-sight cover (weapon level 1 check)
    if (!canHitTarget(currentPlayerPos, predictedAiPos, 1)) {
          score += 100; // Bonus for being behind cover from a straight shot
         // Bonus for moving further away while gaining cover
         if(action.type === 'move' && distance(predictedAiPos, currentPlayerPos) > distance(currentAiPos, currentPlayerPos)){
             score += 50;
         }
    } else {
         // Small penalty for moving *out* of cover (if the predicted spot *is* straight-line-hittable, and the current wasn't)
         if (action.type === 'move' && !canHitTarget(currentPlayerPos, currentAiPos, 1)) {
              score -= 80; // Penalty for losing straight-line cover
         }
    }


    // (+) Powerup - Proximity: Move towards nearest powerup if not collecting one this turn
    const nearestPowerup = findNearestPowerup(predictedAiPos);
    if (nearestPowerup && !powerUpPositions.some(p => p.x === predictedAiPos.x && p.y === predictedAiPos.y)) { // Ensure not double-counting the collection case
        const distAfter = distance(predictedAiPos, nearestPowerup);
        const nearestBefore = findNearestPowerup(currentAiPos);
        const distBefore = nearestBefore ? distance(currentAiPos, nearestBefore) : Infinity;

        if (distAfter < distBefore) { // Check if the move gets AI closer to *any* powerup
            // The bonus is higher the closer the powerup is, and the more distance was closed
            const distanceClosed = distBefore === Infinity ? 0 : distBefore - distAfter;
            score += Math.max(0, 300 - distAfter * 30) + distanceClosed * 10; // Bonus based on final distance and distance closed
        }
    }

     // (+/-) Distance to Player: Prefer a medium distance for potential future shots
     const distToPlayer = distance(predictedAiPos, currentPlayerPos);
     const idealMinDist = 5; // AI prefers not to be too close
     const idealMaxDist = GRID_SIZE / 2; // AI prefers not to be too far

     if (distToPlayer < idealMinDist) {
         score -= (idealMinDist - distToPlayer) * 40; // Heavier penalty for being too close
     } else if (distToPlayer > idealMaxDist) {
          score -= (distToPlayer - idealMaxDist) * 10; // Lighter penalty for being too far
     }


    // (+) Offensive - Setup: Can AI shoot player *next turn* from predicted position?
     // This is a look-ahead evaluation
     if (action.type === 'move' || action.type === 'stay') { // Only evaluate setup for moves/stay, not for shooting this turn
         if (canHitTarget(predictedAiPos, currentPlayerPos, aiWeaponLevel)) { // Check if AI can hit player from its *new* position
             score += 250; // Bonus for getting into a position where AI can shoot next turn
             // Bonus if it's a straight shot from the new position?
             if(canHitTarget(predictedAiPos, currentPlayerPos, 1)) {
                 score += 100; // Extra bonus for getting a straight shot setup
             }
             // Bonus if player *cannot* shoot back immediately from that position?
             if(!canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel)){
                 score += 150; // Bonus for a relatively safe attacking position
             }
         }
     }

    // Add small random factor to break ties more naturally and add unpredictability
    score += (Math.random() - 0.5) * 5; // Random nudge between -2.5 and 2.5

    return score;
}


// --- Resolution Phase (Modified for Move-First Logic) ---

async function startResolution() {
    console.log("Starting Resolution Phase (Move First)...");
    if (isResolving) return;
    isResolving = true;
    gamePhase = 'resolving';
    updatePhaseIndicator();
    disablePlanningControls(); // Ensure controls are disabled and highlights cleared

    const initialPlayerPos = { ...playerPos };
    const initialAiPos = { ...aiPos };
    let conflictMessages = [];
    let playerWasHit = false;
    let aiWasHit = false;

    // --- Step 1: Resolve Movement Conflicts & Calculate Final Positions ---
    setMessage("Resolving Movement...");
    let finalPlayerPos = { ...initialPlayerPos }; // Assume no movement initially
    let finalAiPos = { ...initialAiPos }; // Assume no movement initially
    let playerMoveAttempted = playerPlannedAction?.type === 'move';
    let aiMoveAttempted = aiPlannedAction?.type === 'move';
    let playerMoveValidated = false; // Does the attempted move pass initial checks?
    let aiMoveValidated = false; // Does the attempted move pass initial checks?

    const pTarget = playerMoveAttempted ? playerPlannedAction.target : null;
    const aTarget = aiMoveAttempted ? aiPlannedAction.target : null;

    // Validate moves individually first (adjacent, not wall, not currently occupied by opponent)
    if (playerMoveAttempted) {
        if (isValidMoveTarget(pTarget, initialPlayerPos, initialAiPos)) {
            playerMoveValidated = true;
        } else {
            conflictMessages.push("Player move blocked!");
        }
    }
    if (aiMoveAttempted) {
        if (isValidMoveTarget(aTarget, initialAiPos, initialPlayerPos)) {
            aiMoveValidated = true;
        } else {
            conflictMessages.push("AI move blocked!");
        }
    }


    // Check for collisions ONLY if both are attempting a valid move
    if (playerMoveValidated && aiMoveValidated) {
         const pTargetIsAiInitial = pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y;
         const aTargetIsPlayerInitial = aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y;
         const sameTarget = pTarget.x === aTarget.x && pTarget.y === aTarget.y;

        if (sameTarget) { // Both target the same empty cell
             conflictMessages.push("Collision! Both tried to move to the same cell.");
            // Neither moves - they bounce
            playerMoveValidated = false;
            aiMoveValidated = false;
        } else if (pTargetIsAiInitial && aTargetIsPlayerInitial) { // They attempt to swap
            conflictMessages.push("Players swapped positions!");
            // Both moves are valid and succeed
            finalPlayerPos = { ...pTarget };
            finalAiPos = { ...aTarget };
             // No change to validated flags, they succeed
        } else if (pTargetIsAiInitial) { // Player targeted AI's *initial* position, but AI is moving away
             // Player move fails because AI is leaving the spot, but player can't occupy a spot the AI *was* just in?
             // Rule: If you target a spot the opponent started on, your move is blocked *unless* they swapped with you.
             // This prevents "chasing into a spot".
             conflictMessages.push("Player move blocked!");
             playerMoveValidated = false;
             // AI's validated move proceeds to its target aTarget
             finalAiPos = { ...aTarget };

        } else if (aTargetIsPlayerInitial) { // AI targeted Player's *initial* position, but Player is moving away
             // AI move fails for the same reason
             conflictMessages.push("AI move blocked!");
             aiMoveValidated = false;
             // Player's validated move proceeds to its target pTarget
             finalPlayerPos = { ...pTarget };
        } else {
            // No collision, both valid moves succeed to distinct targets
            finalPlayerPos = { ...pTarget };
            finalAiPos = { ...aTarget };
        }
    } else if (playerMoveValidated && !aiMoveAttempted) { // Only player moves, AI stays
         if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y) { // Player tries to move onto stationary AI
             conflictMessages.push("Player move blocked!");
             playerMoveValidated = false; // Player move fails
             // AI stays at initialAiPos
         } else {
             // Player move succeeds
             finalPlayerPos = { ...pTarget };
             // AI stays at initialAiPos
         }
    } else if (!playerMoveAttempted && aiMoveValidated) { // Only AI moves, Player stays
         if (aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) { // AI tries to move onto stationary Player
             conflictMessages.push("AI move blocked!");
             aiMoveValidated = false; // AI move fails
             // Player stays at initialPlayerPos
         } else {
             // AI move succeeds
             finalAiPos = { ...aTarget };
             // Player stays at initialPlayerPos
         }
    }
    // If neither attempted a move, or both failed validation, final positions are their initial positions.

    // --- Step 2: Execute Movement Animation ---
    // Animate only if the final position is different from the initial position
    const playerMovePromise = (finalPlayerPos.x !== initialPlayerPos.x || finalPlayerPos.y !== initialPlayerPos.y)
                            ? animateMove(playerMesh, finalPlayerPos) : Promise.resolve();
    const aiMovePromise = (finalAiPos.x !== initialAiPos.x || finalAiPos.y !== initialAiPos.y)
                            ? animateMove(aiMesh, finalAiPos) : Promise.resolve();

    await Promise.all([playerMovePromise, aiMovePromise]); // Wait for both animations

    // --- Step 3: Update Logical Positions & Collect Powerups ---
    // Update state variables AFTER animation completes
    playerPos = { ...finalPlayerPos };
    aiPos = { ...finalAiPos };

    // Check for powerup collection at the NEW positions
    const collectedMsg = [];
    const powerupIndexPlayer = powerUpPositions.findIndex(p => p.x === playerPos.x && p.y === playerPos.y);
    if (powerupIndexPlayer !== -1) {
        playerWeaponLevel = Math.min(MAX_WEAPON_LEVEL, playerWeaponLevel + 1);
        collectedMsg.push("Player collected weapon upgrade!");
        removePowerup3D(playerPos.x, playerPos.y); // Remove 3D mesh
        powerUpPositions.splice(powerupIndexPlayer, 1); // Remove from logical list
        updateWeaponLevelInfo();
    }

    const powerupIndexAi = powerUpPositions.findIndex(p => p.x === aiPos.x && p.y === aiPos.y);
    if (powerupIndexAi !== -1) {
         aiWeaponLevel = Math.min(MAX_WEAPON_LEVEL, aiWeaponLevel + 1);
         collectedMsg.push("AI collected weapon upgrade!");
         removePowerup3D(aiPos.x, aiPos.y); // Remove 3D mesh
         powerUpPositions.splice(powerupIndexAi, 1); // Remove from logical list
         updateWeaponLevelInfo();
    }

    // Combine conflict messages and collected messages
    const step2Message = conflictMessages.join(" ") + (conflictMessages.length > 0 && collectedMsg.length > 0 ? " " : "") + collectedMsg.join(" ");
     setMessage(step2Message || "Movement resolved. Calculating shots...");


    // Short delay after movement/collection before firing
    await wait(RESOLVE_STEP_DELAY);


    // --- Step 4: Calculate Shot Outcomes BASED ON FINAL POSITIONS ---
    // Recalculate paths based on final positions, as original planned paths were based on *initial* positions
    // This is crucial for movement-first mechanics.
    const finalPlayerShotPathResult = playerPlannedAction?.type === 'shoot'
        ? calculateFullPathFromTargets(initialPlayerPos, playerPlannedAction.targetPoints, aiPos) // Path starts from *initial* pos, targets are absolute cells, checked against *final* AI pos
        : { path: [], isValid: false, hitTarget: false };

    const finalAiShotPathResult = aiPlannedAction?.type === 'shoot'
         ? calculateFullPathFromTargets(initialAiPos, aiPlannedAction.targetPoints, playerPos) // Path starts from *initial* pos, targets are absolute cells, checked against *final* Player pos
         : { path: [], isValid: false, hitTarget: false };


    // A shot hits if its calculated path is valid AND the opponent's *final* position is on that path.
    playerWasHit = finalAiShotPathResult.isValid && finalAiShotPathResult.path.some(p => p.x === playerPos.x && p.y === playerPos.y);
    aiWasHit = finalPlayerShotPathResult.isValid && finalPlayerShotPathResult.path.some(p => p.x === aiPos.x && p.y === aiPos.y);

    console.log("Player Shot Valid/Hits AI:", finalPlayerShotPathResult.isValid, aiWasHit);
    console.log("AI Shot Valid/Hits Player:", finalAiShotPathResult.isValid, playerWasHit);


    // --- Step 5: Visualize Shots ---
    const shotMsg = [];
    if (playerPlannedAction?.type === 'shoot' && finalPlayerShotPathResult.isValid) {
         shotMsg.push("Player Fired!");
         createLaserBeam(finalPlayerShotPathResult.path, playerLaserMaterial);
    } else if (playerPlannedAction?.type === 'shoot' && !finalPlayerShotPathResult.isValid) {
        shotMsg.push("Player shot blocked!");
    }

    if (aiPlannedAction?.type === 'shoot' && finalAiShotPathResult.isValid) {
         shotMsg.push("AI Fired!");
         createLaserBeam(finalAiShotPathResult.path, aiLaserMaterial);
    } else if (aiPlannedAction?.type === 'shoot' && !finalAiShotPathResult.isValid) {
         shotMsg.push("AI shot blocked!");
    }

    setMessage((step2Message ? step2Message + " " : "") + (shotMsg.length > 0 ? shotMsg.join(" ") : "No shots fired."));


    await wait(SHOT_FLASH_DURATION + RESOLVE_STEP_DELAY); // Wait for laser effects and a bit more

    // --- Step 6: Determine Game Outcome & Transition ---
    let finalMessage = conflictMessages.join(" ") + (conflictMessages.length > 0 && collectedMsg.length > 0 ? " " : "") + collectedMsg.join(" ") + (shotMsg.length > 0 ? " " + shotMsg.join(" ") : "");


    if (playerWasHit && aiWasHit) {
        endGame("Draw! Both players hit each other!", 'Draw');
    } else if (playerWasHit) {
        endGame("AI Wins! Player was hit.", 'AI');
    } else if (aiWasHit) {
        endGame("Player Wins! AI was hit.", 'Player');
    } else {
        // Game Continues
        gamePhase = 'planning';
        playerPlannedAction = null;
        aiPlannedAction = null;
        isResolving = false;

        maybeSpawnPowerup(); // Chance to spawn a new powerup

        setMessage(finalMessage || "Plan your next action."); // Use combined messages or default
        updatePhaseIndicator();
        enablePlanningControls();
        setPlanningMode('move'); // Reset to default move mode
    }
}

// --- Animate Move Function ---
function animateMove(mesh, targetGridPos) {
    return new Promise(resolve => {
        const startPos3D = mesh.position.clone();
         // Calculate the correct target Y position based on unit type and grid position
         // Ensure it ends up resting on the floor, considering unit pivot point
         const targetY = mesh.userData.type === 'player'
             ? CELL_3D_SIZE * 0.9 / 2 // Player capsule height / 2
             : CELL_3D_SIZE * 1.0 / 2; // AI cone height / 2

        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);

         // Add a small hop animation: up, then down to target
        const hopHeight = CELL_3D_SIZE * 0.3;
        const midPos3D = new THREE.Vector3(
             (startPos3D.x + targetPos3D.x) / 2,
             Math.max(startPos3D.y, targetPos3D.y) + hopHeight, // Hop relative to highest point
             (startPos3D.z + targetPos3D.z) / 2
         );


        // Tween to mid position (hop up)
        new TWEEN.Tween(startPos3D)
            .to(midPos3D, MOVEMENT_DURATION * 0.5)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => {
                mesh.position.copy(startPos3D);
            })
            .onComplete(() => {
                // Tween from mid position to final target position (hop down)
                 new TWEEN.Tween(startPos3D) // Continue from current animated value
                     .to(targetPos3D, MOVEMENT_DURATION * 0.5)
                     .easing(TWEEN.Easing.Quadratic.In)
                     .onUpdate(() => {
                         mesh.position.copy(startPos3D);
                     })
                     .onComplete(resolve) // Resolve promise when final tween finishes
                     .start();
            })
            .start();
    });
}


// --- Utility Wait Function ---
function wait(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

// --- Powerup Logic Functions ---
function maybeSpawnPowerup() {
     if (gameOverState || isResolving) return;
    if (powerUpPositions.length < MAX_POWERUPS) {
        if (Math.random() < POWERUP_SPAWN_CHANCE) { spawnPowerup(); }
    }
}
function spawnPowerup() {
    let attempts = 0;
    while (attempts < 50) {
        const x = Math.floor(Math.random() * GRID_SIZE); const y = Math.floor(Math.random() * GRID_SIZE);
        const isFloor = isValid(x,y) && grid[y][x] === 'floor';
        // Check if cell is *logically* unoccupied (ignore meshes)
        const isUnoccupiedLogically = (x !== playerPos.x || y !== playerPos.y) && (x !== aiPos.x || y !== aiPos.y) && !powerUpPositions.some(p => p.x === x && p.y === y);

        if (isFloor && isUnoccupiedLogically) {
            powerUpPositions.push({ x, y }); // Add to logical list
            const newPowerup = createPowerup3D(x, y); // Create 3D mesh
            powerupMeshes.push(newPowerup); // Add to mesh list for animation/disposal
            console.log(`Spawned powerup at ${x},${y}`); return true;
        }
        attempts++;
    }
     console.warn("Could not find suitable location to spawn powerup."); return false;
}

// --- Game Over Function ---
function endGame(message, winner) {
    console.log("Game Over:", message);
    gamePhase = 'gameOver';
    gameOverState = { winner: winner, message: message };
    setMessage(message);
    updatePhaseIndicator();
    disablePlanningControls(); // Ensure controls stay disabled
    isResolving = false;
    // Optional: Add a visual effect for game over (e.g., camera shake, color filter)
}

// --- Utility Functions ---
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === 'wall'; }

// getValidMoves: Checks adjacency and ensures target is not a wall or opponent's *current* position
function getValidMoves(unitPos, opponentPos) {
    const moves = [];
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach(dir => {
        const nextX = unitPos.x + dir.dx;
        const nextY = unitPos.y + dir.dy;
        if (isValid(nextX, nextY) && grid[nextY][nextX] === 'floor' && !(nextX === opponentPos.x && nextY === opponentPos.y)) {
             moves.push({ x: nextX, y: nextY });
        }
    });
    return moves;
}

// isValidMoveTarget: Checks if a *proposed target* is valid for a unit moving from *unitPos*,
// considering *opponentPos*. Used during resolution conflict checking.
function isValidMoveTarget(target, unitPos, opponentPos){
     if (!target || !isValid(target.x, target.y) || grid[target.y][target.x] === 'wall') return false; // Must be on floor
     const dx = Math.abs(target.x - unitPos.x);
     const dy = Math.abs(target.y - unitPos.y);
     if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return false; // Must be adjacent
     // The check against opponent's *current* position is handled by getValidMoves for planning.
     // For resolution validation, we just need to know if the *target cell itself* is blocked by the stationary opponent.
     // If the opponent is also moving, collision rules apply later.
     // Simplified: Just check adjacency and if it's a floor tile. Collision with moving opponent handled in resolution.
     return true;
}

function distance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

function findNearestPowerup(pos) {
     let minDist = Infinity;
     let nearest = null;
     powerUpPositions.forEach(p => {
        const d = distance(pos, p);
        if(d < minDist) {
             minDist = d;
             nearest = p;
         }
    });
     return nearest;
}

// canHitTarget: Checks if attacker can hit target with given weapon level,
// assuming target is stationary at targetPos.
// opponentActualPos is the *actual* current position of the opponent being targeted
// (needed to check if a path cell is occupied by the opponent)
// Simplified this function to not need opponentActualPos explicitly, as the grid
// and wall status is sufficient, and the targetPos is where we check for the hit.
function canHitTarget(attackerPos, targetPos, attackerWeaponLevel) {
    // Base cases
    if (!isValid(attackerPos.x, attackerPos.y) || !isValid(targetPos.x, targetPos.y) || grid[targetPos.y][targetPos.x] === 'wall') {
        return false; // Attacker or target is in/on a wall or off-grid
    }
     if (attackerPos.x === targetPos.x && attackerPos.y === targetPos.y) {
         return true; // Attacker is on the target cell (unlikely but possible)
     }

    const maxBends = attackerWeaponLevel - 1;

    // BFS search for a valid path within bend limits
    // State: { pos: current cell, bendsMade: bends taken to reach pos, lastDir: direction taken to reach pos }
    const q = [{ pos: attackerPos, bendsMade: -1, lastDir: { dx: 0, dy: 0 } }];
    const visited = new Set([`${attackerPos.x},${attackerPos.y},-1,0,0`]); // Track pos, bends, and last direction

    while (q.length > 0) {
        const { pos, bendsMade, lastDir } = q.shift();

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

        for (const dir of directions) {
            // Prevent reversing direction immediately
             if (dir.dx === -lastDir.dx && dir.dy === -lastDir.dy && (dir.dx !== 0 || dir.dy !== 0)) {
                 continue;
             }

            let currentExplorePos = { ...pos };
            let currentBends = bendsMade;

            // If we are changing direction from the last step, it counts as a bend (unless this is the first step)
            const isBend = (lastDir.dx !== 0 || lastDir.dy !== 0) && (dir.dx !== lastDir.dx || dir.dy !== lastDir.dy);
            if (isBend) {
                 currentBends++;
             }

             // Check if we exceed max bends
            if (currentBends > maxBends) {
                continue; // Cannot take this path, too many bends
            }


             // Traverse along the current direction
             for (let i = 1; i < GRID_SIZE * 2; i++) { // Check up to twice the grid size to be safe
                 const nextX = pos.x + dir.dx * i;
                 const nextY = pos.y + dir.dy * i;
                 currentExplorePos = { x: nextX, y: nextY };


                 if (!isValid(nextX, nextY) || grid[nextY][nextX] === 'wall') {
                      // Hit a wall or went off-grid. This straight segment is blocked past the previous cell.
                      // If the target was on this blocked segment, it's unreachable this way.
                      break; // Stop exploring further along this direction
                 }

                 // Check if this cell is the target
                 if (currentExplorePos.x === targetPos.x && currentExplorePos.y === targetPos.y) {
                     return true; // Found a valid path to the target within bend limits
                 }

                 // Add the next cell to the queue if not visited with this bend count and direction
                 // The key needs to include bendsMade and the direction *taken to reach* the next cell
                const dirToNext = { dx: Math.sign(currentExplorePos.x - pos.x), dy: Math.sign(currentExplorePos.y - pos.y) };
                const nextStateKey = `${currentExplorePos.x},${currentExplorePos.y},${currentBends},${dirToNext.dx},${dirToNext.dy}`;
                // Check if we've visited this cell with this specific number of bends *ending in this direction*.
                // This prevents infinite loops and ensures we find the shortest path *in terms of bends*.
                if (!visited.has(nextStateKey)) {
                    visited.add(nextStateKey);
                    // Queue the *next* potential bend point (currentExplorePos)
                    // The bendsMade counter *for the state being added to the queue* is the bends used to get *to this point*.
                     q.push({ pos: currentExplorePos, bendsMade: currentBends, lastDir: dirToNext });
                }
             }
        }
    }

    // If the queue is empty and we haven't reached the target, it's unreachable
    return false;
}


// --- Start Game ---
init();