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
// const MAX_POWERUPS = 4; // No longer needed for dynamic spawning
// const POWERUP_SPAWN_CHANCE = 0.6; // No longer needed
const INITIAL_POWERUP_COUNT = 8; // Spawn this many powerups at the start
const AI_DISTANCE_BIAS = 0.95; // Target ratio: distAi / distPlayer. 0.95 means 5% closer to AI on average.

// Timing Constants (milliseconds)
const SHOT_FLASH_DURATION = 600; // Slightly longer flash
const MOVEMENT_DURATION = 400; // Slightly slower movement
const AI_THINK_DELAY = 500; // Delay before AI makes its move
const ACTION_RESOLVE_DELAY = 200; // Delay after an action resolves before next turn starts

// AI constants
const AI_MAX_BEND_CHECK_DEPTH = 2; // How many bends the AI plans ahead for shooting
const AI_MAX_SEGMENT_EVAL_POINTS = 5; // How many points along a segment the AI considers for bending

// --- Three.js Setup ---
let scene, camera, renderer, controls, composer; // Add composer
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = []; // Holds {mesh, pos} objects for placed powerups
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

// --- Game State ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerWeaponLevel = 1;
let aiWeaponLevel = 1;
let powerUpPositions = []; // Holds {x, y} for logical checks
let gamePhase = 'playerTurn'; // Initial phase: Player's turn
let currentPlayer = 'player'; // Who is currently acting
let currentPlanningMode = 'move'; // Player's chosen action type (move/shoot)
let hoverPos = null;
let hoverPath = [];
let hoverPathIsValid = false;
let partialShootPlan = null; // Holds player's shooting plan as they click
let gameOverState = null;
let isResolving = false; // True while an action (move/shoot anim) is in progress

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
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
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
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0x808080, 0.6);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x4488bb, 0x080820, 0.5);
    scene.add(hemisphereLight);

    // --- Post-processing ---
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(canvasContainer.clientWidth, canvasContainer.clientHeight),
        1.0, // strength
        0.4, // radius
        0.85 // threshold
    );
    composer.addPass(bloomPass);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = CELL_3D_SIZE * 3;
    controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.5;

    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);

    const planeSize = GRID_SIZE * CELL_3D_SIZE;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2;
    intersectionPlane.position.y = -0.04;
    scene.add(intersectionPlane);

    window.addEventListener('resize', onWindowResize, false);
    onWindowResize(); // Initial call
}

function onWindowResize() {
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
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
        gameOverState = { winner: 'None', message: 'Initialization Failed' };
        updatePhaseIndicator();
        return;
    }
    playerPos = startPositions.player;
    aiPos = startPositions.ai;

    playerWeaponLevel = 1;
    aiWeaponLevel = 1;
    powerUpPositions = []; // Reset powerups logical list
    powerupMeshes = [];    // Reset powerup meshes list

    currentPlayer = 'player';
    gamePhase = 'playerTurn';
    currentPlanningMode = 'move';
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null;
    gameOverState = null;
    isResolving = false;

    createUnits3D();

    // Spawn initial powerups *after* players are placed and grid exists
    spawnInitialPowerups(); // Call the new initial spawn function

    setMessage("Your Turn: Plan your move or shot.");
    updatePhaseIndicator();
    updateWeaponLevelInfo();
    enablePlanningControls();
    clearHighlights();

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

// --- Grid Generation Functions --- (Unchanged)
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
            const isNearCorner = (px, py) => {
                return (px >= 0 && px <= 4 && py >= 0 && py <= 4) ||
                       (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                       (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                       (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);
            };
            if (grid[y][x] === 'floor' && !isNearCorner(x, y) && Math.random() < 0.9) { grid[y][x] = 'wall'; wallCount++; }
            else if (grid[y][x] === 'floor' && Math.random() < 0.2) { grid[y][x] = 'wall'; wallCount++; }
        }
        if (isGridConnected()) { console.log("Generated connected grid."); return; }
        attempts++;
        console.warn(`Generated grid attempt ${attempts} was not connected or valid. Retrying...`);
    }
    console.error("Failed to generate a valid connected grid after multiple attempts.");
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('floor'));
    for (let i = 0; i < GRID_SIZE * GRID_SIZE * 0.1; i++) {
        const x = Math.floor(Math.random() * GRID_SIZE); const y = Math.floor(Math.random() * GRID_SIZE);
        if (grid[y][x] === 'floor') grid[y][x] = 'wall';
    }
    setMessage("Warning: Grid generation failed, using fallback.");
}

function isGridConnected() {
    const startNode = findFirstFloor();
    if (!startNode) return false;
    const q = [startNode]; const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0; let totalFloorCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor') totalFloorCount++; } }
    if (totalFloorCount === 0) return false;
    while (q.length > 0) {
        const { x, y } = q.shift(); reachableFloorCount++;
        const neighbors = [ { x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 } ];
        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && grid[n.y][n.x] === 'floor' && !visited.has(key)) { visited.add(key); q.push(n); }
        }
    }
    return reachableFloorCount === totalFloorCount;
}

function findFirstFloor() {
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor') return { x, y }; } }
    return null;
}

function findStartPositions() {
    const potentialStarts = [ { x: 2, y: 2 }, { x: GRID_SIZE - 3, y: GRID_SIZE - 3 }, { x: 2, y: GRID_SIZE - 3 }, { x: GRID_SIZE - 3, y: 2 } ];
    const playerStart = findNearestFloorBFS(potentialStarts[0]); let aiStart = null;
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]]; farCorners.sort(() => Math.random() - 0.5);
    for(const corner of farCorners) {
        const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
        if (potentialAiStart && playerStart && distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) { aiStart = potentialAiStart; break; }
    }
     if (!aiStart && playerStart) {
         console.warn("Could not find a far start position for AI, trying any reachable floor.");
         aiStart = findNearestFloorBFS({x: Math.floor(GRID_SIZE/2), y: Math.floor(GRID_SIZE/2)}, [playerStart]);
     }
    if (playerStart && aiStart) { console.log(`Player start: ${playerStart.x},${playerStart.y}. AI start: ${aiStart.x},${aiStart.y}`); return { player: playerStart, ai: aiStart }; }
    console.error("Failed to find suitable start positions even with fallbacks."); return null;
}

function findNearestFloorBFS(startSearchPos, occupied = []) {
    const q = [{ pos: startSearchPos, dist: 0 }]; const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    occupied.forEach(occ => visited.add(`${occ.x},${occ.y}`));
    while (q.length > 0) {
        const current = q.shift(); const { x, y } = current.pos;
        if (isValid(x, y) && grid[y][x] === 'floor' && !occupied.some(occ => occ.x === x && occ.y === y)) { return { x, y }; }
        const neighbors = [ { x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 } ];
        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && !visited.has(key)) { visited.add(key); q.push({ pos: n, dist: current.dist + 1 }); }
        }
    }
    console.warn(`BFS from ${startSearchPos.x},${startSearchPos.y} found no valid floor.`); return null;
}


// --- 3D Object Creation / Management Functions --- (Unchanged except removePowerup3D adjustment)
function get3DPosition(x, y, yOffset = 0) {
    const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    return new THREE.Vector3(worldX, yOffset, worldZ);
}

function getGridCoords(position) {
    const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01);
    const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01);
    return { x, y };
}

function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) { mesh.material.forEach(mat => mat.dispose()); }
        else { mesh.material.dispose(); }
    }
    if (mesh.parent) { mesh.parent.remove(mesh); }
}

function disposeSprite(sprite) {
    if (!sprite) return;
    if (sprite.material?.map) sprite.material.map.dispose();
    if (sprite.material) sprite.material.dispose();
    if (sprite.parent) { sprite.parent.remove(sprite); }
}


function clearBoard3D() {
    gameBoardGroup.children.slice().forEach(child => { disposeMesh(child); });
    disposeSprite(playerLevelIndicator); disposeSprite(aiLevelIndicator);
    floorMeshes = []; wallMeshes = []; powerupMeshes = []; // Clear mesh references
    playerMesh = null; aiMesh = null; playerLevelIndicator = null; aiLevelIndicator = null;
    activeHighlights = []; activeLasers.slice().forEach(laser => { disposeMesh(laser); }); activeLasers = [];
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)); wallMeshes = [];
    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) {
        const pos = get3DPosition(x, y);
        if (grid[y][x] === 'floor') {
            const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
            floorMesh.position.copy(pos); floorMesh.position.y = -0.1;
            floorMesh.castShadow = false; floorMesh.receiveShadow = true;
            floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
            gameBoardGroup.add(floorMesh); floorMeshes[y][x] = floorMesh;
        } else if (grid[y][x] === 'wall') {
            const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
            wallMesh.position.copy(pos); wallMesh.position.y = WALL_HEIGHT / 2;
            wallMesh.castShadow = true; wallMesh.receiveShadow = true;
            wallMesh.userData = { gridX: x, gridY: y, type: 'wall' };
            gameBoardGroup.add(wallMesh); wallMeshes.push(wallMesh); floorMeshes[y][x] = null;
        }
    }}
}

function createUnits3D() {
    const playerUnitHeight = CELL_3D_SIZE * 0.9; const playerUnitRadius = CELL_3D_SIZE * 0.3;
    const aiUnitHeight = CELL_3D_SIZE * 1.0; const aiUnitRadius = CELL_3D_SIZE * 0.4;
    const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - playerUnitRadius * 2, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    playerMesh.castShadow = true; playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2);
    playerMesh.position.copy(playerPos3D); playerMesh.userData = { type: 'player' }; gameBoardGroup.add(playerMesh);
    playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
    playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0); playerMesh.add(playerLevelIndicator);
    const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
    aiMesh.castShadow = true; aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2);
    aiMesh.position.copy(aiPos3D); aiMesh.userData = { type: 'ai' }; gameBoardGroup.add(aiMesh);
    aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
    aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0); aiMesh.add(aiLevelIndicator);
    updateWeaponLevelVisuals();
}

function createLevelTextMesh(level) {
     const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
     const size = 128; const halfSize = size / 2; canvas.width = size; canvas.height = size;
     context.fillStyle = 'rgba(0, 0, 0, 0.7)'; context.beginPath(); context.roundRect(0, 0, size, size, size * 0.15); context.fill();
     context.font = `Bold ${size * 0.6}px Arial`; context.fillStyle = 'white'; context.textAlign = 'center'; context.textBaseline = 'middle';
     context.fillText(level.toString(), halfSize, halfSize + size * 0.02);
     const texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true; texture.colorSpace = THREE.SRGBColorSpace;
     const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false });
     const sprite = new THREE.Sprite(spriteMaterial); sprite.scale.set(0.1, 0.1, 1); return sprite;
}

function updateWeaponLevelVisuals() {
     if (playerMesh) {
        disposeSprite(playerLevelIndicator); playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
        const playerUnitHeight = CELL_3D_SIZE * 0.9; playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0); playerMesh.add(playerLevelIndicator);
        playerMesh.material.emissiveIntensity = 0.5 + (playerWeaponLevel - 1) * 0.3;
    }
     if (aiMesh) {
        disposeSprite(aiLevelIndicator); aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
        const aiUnitHeight = CELL_3D_SIZE * 1.0; aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0); aiMesh.add(aiLevelIndicator);
        aiMesh.material.emissiveIntensity = 0.5 + (aiWeaponLevel - 1) * 0.3;
    }
}

function createPowerup3D(x, y) {
    const powerupSize = CELL_3D_SIZE * 0.3;
    const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0);
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
    mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7));
    mesh.castShadow = true;
    mesh.userData = { type: 'powerup', gridX: x, gridY: y, spinSpeed: Math.random() * 0.03 + 0.015 };
    gameBoardGroup.add(mesh);
    // Return object containing mesh and pos, managed by spawnInitialPowerups
    return { mesh: mesh, pos: { x, y } };
}

function removePowerup3D(x, y) {
    // Find in the mesh list
    const meshIndex = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (meshIndex !== -1) {
        const powerupObj = powerupMeshes[meshIndex];
        disposeMesh(powerupObj.mesh);
        powerupMeshes.splice(meshIndex, 1); // Remove from the centrally managed mesh list
    } else {
        console.warn(`Could not find powerup mesh at ${x},${y} to remove.`);
    }

     // Also remove from the logical list used for placement/logic checks
     const logicalIndex = powerUpPositions.findIndex(p => p.x === x && p.y === y);
     if (logicalIndex !== -1) {
         powerUpPositions.splice(logicalIndex, 1);
     } else {
         // This might happen if removal is attempted twice, log if needed
         // console.warn(`Could not find powerup logical position at ${x},${y} to remove.`);
     }
}


// --- Highlighting Functions --- (Unchanged)
function clearHighlights() {
    activeHighlights.forEach(mesh => { disposeMesh(mesh); }); activeHighlights = [];
     for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x] === 'floor' && !floorMeshes[y][x]) {
            const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
            const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
             floorMesh.position.copy(get3DPosition(x, y)); floorMesh.position.y = -0.1;
             floorMesh.castShadow = false; floorMesh.receiveShadow = true;
             floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
             gameBoardGroup.add(floorMesh); floorMeshes[y][x] = floorMesh;
        }
     }}
}

function highlightCell(x, y, highlightMaterial) {
    if (isValid(x, y) && grid[y][x] === 'floor') {
        const existingMesh = floorMeshes[y]?.[x];
         if (existingMesh) { disposeMesh(existingMesh); floorMeshes[y][x] = null; }
        const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE);
        const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone());
        highlightMesh.position.copy(get3DPosition(x, y)); highlightMesh.position.y = -0.08;
        highlightMesh.userData = { gridX: x, gridY: y, type: 'highlight' };
        gameBoardGroup.add(highlightMesh); activeHighlights.push(highlightMesh);
    }
}

function renderHighlights() {
    if (currentPlayer !== 'player' || isResolving || gameOverState) { if (activeHighlights.length > 0) clearHighlights(); return; }
     clearHighlights(); const opponentTargetPos = aiPos;
    if (currentPlanningMode === 'move') {
        const validMoves = getValidMoves(playerPos, aiPos); validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));
    } else if (currentPlanningMode === 'shoot') {
         let pathToShow = []; let useMaterial = pathHighlightMaterial;
         if (partialShootPlan?.needsInput && hoverPath.length > 0) { pathToShow = hoverPath; if (!hoverPathIsValid) useMaterial = invalidPathHighlightMaterial; }
         else if (partialShootPlan?.path?.length > 0 && !partialShootPlan.needsInput) { pathToShow = partialShootPlan.path; useMaterial = pathHighlightMaterial; }
         let hitOpponent = false; pathToShow.forEach(p => { highlightCell(p.x, p.y, useMaterial); if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y && useMaterial !== invalidPathHighlightMaterial) hitOpponent = true; });
         if (hitOpponent) { highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial); }
    }
}


// --- Laser Effect Function --- (Unchanged)
function createLaserBeam(path, material) {
    if (!path || path.length < 1) return null;
     const adjustedPath = [];
     const startOffset = (material === playerLaserMaterial ? playerMesh : aiMesh).position.y;
     const endOffset = (material === playerLaserMaterial ? aiMesh : playerMesh).position.y;
     const firstPoint3D = get3DPosition(path[0].x, path[0].y, startOffset); adjustedPath.push(firstPoint3D);
     for (let i = 1; i < path.length; i++) { adjustedPath.push(get3DPosition(path[i].x, path[i].y, startOffset)); }
     if (path.length > 0) {
          const lastPoint = path[path.length - 1];
          const targetUnitPos = (material === playerLaserMaterial) ? aiPos : playerPos;
          const targetUnit3D = get3DPosition(targetUnitPos.x, targetUnitPos.y, endOffset);
          if (lastPoint.x === targetUnitPos.x && lastPoint.y === targetUnitPos.y) {
              const lastPathPoint3D = adjustedPath[adjustedPath.length - 1];
              const dirToTarget = targetUnit3D.clone().sub(lastPathPoint3D).normalize().multiplyScalar(CELL_3D_SIZE * 0.3);
              adjustedPath.push(lastPathPoint3D.clone().add(dirToTarget));
          }
     }
    const curve = new THREE.CatmullRomCurve3(adjustedPath, false, 'catmullrom', 0.1);
    const tubeRadius = CELL_3D_SIZE * 0.08; const tubeSegments = Math.max(8, path.length * 4);
    const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);
    const laserMesh = new THREE.Mesh(tubeGeom, material.clone());
    laserMesh.userData = { type: 'laser' }; laserMesh.castShadow = false; laserMesh.receiveShadow = false;
    scene.add(laserMesh); activeLasers.push(laserMesh);
    new TWEEN.Tween({ opacity: laserMesh.material.opacity }).to({ opacity: 0 }, SHOT_FLASH_DURATION).easing(TWEEN.Easing.Quadratic.In)
        .onUpdate((obj) => { if(laserMesh.material) laserMesh.material.opacity = obj.opacity; })
        .onComplete(() => {
            disposeMesh(laserMesh); const index = activeLasers.indexOf(laserMesh); if (index > -1) activeLasers.splice(index, 1);
        }).start();
    return laserMesh;
}


// --- Animation Loop --- (Unchanged)
function animate(time) {
    requestAnimationFrame(animate); TWEEN.update(time); controls.update();
    powerupMeshes.forEach(p => { // Animate powerups from the central list
        p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.015;
        p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5;
    });
    composer.render();
}

// --- Input Handling Functions --- (Unchanged)
function handleCanvasMouseMove(event) {
    if (currentPlayer !== 'player' || isResolving || gameOverState) { if (hoverPath.length > 0 || !hoverPathIsValid) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } return; }
    if (currentPlanningMode !== 'shoot' || !partialShootPlan?.needsInput) { if (hoverPath.length > 0 || !hoverPathIsValid) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } return; }
    updateMouseCoords(event); raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const targetGridPos = getGridCoords(intersects[0].point);
        if (isValid(targetGridPos.x, targetGridPos.y)) {
            if (!hoverPos || hoverPos.x !== targetGridPos.x || hoverPos.y !== targetGridPos.y) {
                hoverPos = { ...targetGridPos }; const startPos = partialShootPlan.lastBendPos;
                const segmentResult = calculateShotPathSegment(startPos, hoverPos, aiPos);
                if (segmentResult.isValidSegment) { hoverPath = [...partialShootPlan.path, ...segmentResult.path]; hoverPathIsValid = true; }
                else { hoverPath = [...partialShootPlan.path, hoverPos]; hoverPathIsValid = false; }
                renderHighlights();
            }
        } else { if (hoverPos !== null) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } }
    } else { if (hoverPos !== null) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } }
}

function handleCanvasClick(event) {
     if (currentPlayer !== 'player' || isResolving || gameOverState) return;
     updateMouseCoords(event); raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const { x, y } = getGridCoords(intersects[0].point);
         if (isValid(x,y) && grid[y][x] === 'floor') { if (currentPlanningMode === 'move') handleMoveInput(x, y); else if (currentPlanningMode === 'shoot') handleShootInput(x, y); }
         else { setMessage("Invalid click: Must click on a floor tile."); }
    } else { setMessage("Invalid click: Must click within the grid area."); }
}

function updateMouseCoords(event) {
    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// --- UI Update Functions --- (Unchanged)
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() {
    let phaseText = 'Unknown';
    if (gameOverState) { phaseText = `Game Over! ${gameOverState.message}`; }
    else if (isResolving) { phaseText = `Executing ${currentPlayer}'s Action...`; }
    else if (currentPlayer === 'player') { phaseText = "Your Turn"; }
    else if (currentPlayer === 'ai') { phaseText = "AI Turn"; }
    phaseIndicator.textContent = phaseText;
}
function updateWeaponLevelInfo() {
     weaponLevelInfo.textContent = `Your Weapon Level: ${playerWeaponLevel}`;
     aiWeaponLevelInfo.textContent = `AI Weapon Level: ${aiWeaponLevel}`;
     updateWeaponLevelVisuals();
}
function enablePlanningControls() {
    if (gameOverState || isResolving || currentPlayer !== 'player') return;
    btnPlanMove.disabled = false; btnPlanShoot.disabled = false; renderHighlights();
}
function disablePlanningControls() {
    btnPlanMove.disabled = true; btnPlanShoot.disabled = true;
    hoverPos = null; hoverPath = []; hoverPathIsValid = false; partialShootPlan = null;
    clearHighlights();
}

// --- Planning Phase Logic Functions (Player Only) --- (Unchanged)
function setPlanningMode(mode) {
    if (currentPlayer !== 'player' || isResolving || gameOverState) return;
    console.log("Setting planning mode:", mode); currentPlanningMode = mode;
    partialShootPlan = null; hoverPos = null; hoverPath = []; hoverPathIsValid = false;
    btnPlanMove.classList.toggle('active', mode === 'move'); btnPlanShoot.classList.toggle('active', mode === 'shoot');
    if (mode === 'move') { setMessage("Your Turn: Click an adjacent floor cell to move."); }
    else if (mode === 'shoot') {
          partialShootPlan = { needsInput: true, maxBends: playerWeaponLevel - 1, segments: [], path: [], lastBendPos: playerPos };
         setMessage(`Your Turn (Shoot Lv ${playerWeaponLevel}): Click target cell for segment 1 (Max Bends: ${partialShootPlan.maxBends}).`);
    }
    renderHighlights();
}

function handleMoveInput(targetX, targetY) {
     if (currentPlayer !== 'player' || currentPlanningMode !== 'move' || isResolving || gameOverState) return;
    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidTarget = validMoves.some(move => move.x === targetX && move.y === targetY);
    if (isValidTarget) { const action = { type: 'move', target: { x: targetX, y: targetY } }; executeAction(action); }
    else { setMessage("Invalid move target. Click a highlighted adjacent square."); }
}

function handleShootInput(clickX, clickY) {
    if (currentPlayer !== 'player' || currentPlanningMode !== 'shoot' || !partialShootPlan || !partialShootPlan.needsInput || isResolving || gameOverState) return;
    const targetPos = { x: clickX, y: clickY }; const startPos = partialShootPlan.lastBendPos;
    if (targetPos.x === startPos.x && targetPos.y === startPos.y) { setMessage("Cannot target the starting cell for a segment."); return; }
    const segmentResult = calculateShotPathSegment(startPos, targetPos, aiPos);
    if (!segmentResult.isValidSegment) { setMessage("Invalid target: Path segment is blocked by a wall."); hoverPath = []; hoverPathIsValid = false; renderHighlights(); return; }
    partialShootPlan.segments.push({ path: segmentResult.path, endPos: targetPos });
    partialShootPlan.path = partialShootPlan.segments.flatMap(seg => seg.path); partialShootPlan.lastBendPos = targetPos;
    const bendsMade = partialShootPlan.segments.length - 1;
    if (bendsMade < partialShootPlan.maxBends) {
        partialShootPlan.needsInput = true; setMessage(`Shoot Plan: Bend ${bendsMade + 1} at ${targetPos.x},${targetPos.y}. Click target cell for segment ${bendsMade + 2}.`);
        hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights();
    } else {
        partialShootPlan.needsInput = false; const finalAction = { type: 'shoot', targetPoints: partialShootPlan.segments.map(seg => seg.endPos) };
        executeAction(finalAction);
    }
}


// --- Shot Path Calculation Functions --- (Unchanged)
function calculateShotPathSegment(startPos, targetPos, opponentPos) {
    let path = []; let currentPos = { ...startPos }; let isValidSegment = true; let hitTargetAlongSegment = false;
    const dxTotal = targetPos.x - startPos.x; const dyTotal = targetPos.y - startPos.y;
    let stepDir = { dx: 0, dy: 0 };
    if (Math.abs(dxTotal) > Math.abs(dyTotal)) { if (dyTotal !== 0) return { path: [], isValidSegment: false, hitTarget: false }; stepDir.dx = Math.sign(dxTotal); }
    else if (Math.abs(dyTotal) > 0) { if (dxTotal !== 0) return { path: [], isValidSegment: false, hitTarget: false }; stepDir.dy = Math.sign(dyTotal); }
    else { return { path: [], isValidSegment: false, hitTarget: false }; }
    while (currentPos.x !== targetPos.x || currentPos.y !== targetPos.y) {
        const nextX = currentPos.x + stepDir.dx; const nextY = currentPos.y + stepDir.dy;
        if (!isValid(nextX, nextY) || isWall(nextX, nextY)) { isValidSegment = false; break; }
        currentPos = { x: nextX, y: nextY }; path.push({ ...currentPos });
        if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) { hitTargetAlongSegment = true; }
        if (currentPos.x === targetPos.x && currentPos.y === targetPos.y) { break; }
    }
    const reachedTargetCell = isValidSegment && (currentPos.x === targetPos.x && currentPos.y === targetPos.y);
    return { path: path, isValidSegment: reachedTargetCell, hitTarget: hitTargetAlongSegment };
}

function calculateFullPathFromTargets(startPos, targetPoints, opponentActualPos) {
    let fullPath = []; let currentPos = { ...startPos }; let pathIsValid = true; let finalHitTarget = false;
    for (const targetPoint of targetPoints) {
        const segmentResult = calculateShotPathSegment(currentPos, targetPoint, opponentActualPos);
        if (!segmentResult.isValidSegment) { pathIsValid = false; break; }
        fullPath.push(...segmentResult.path); currentPos = targetPoint;
        if (segmentResult.hitTarget) { finalHitTarget = true; } // Mark hit based on segment calculation
    }
    if (pathIsValid) { finalHitTarget = fullPath.some(p => p.x === opponentActualPos.x && p.y === opponentActualPos.y); }
    else { finalHitTarget = false; }
    return { path: fullPath, isValid: pathIsValid, hitTarget: finalHitTarget };
}


// --- AI Logic Functions --- (Unchanged)
function planAiAction() {
    console.log("AI Planning..."); const possibleActions = [];
    const currentAiPos = { ...aiPos }; const currentPlayerPos = { ...playerPos };
    const currentAiLevel = aiWeaponLevel; const maxBendsToPlan = Math.min(currentAiLevel - 1, AI_MAX_BEND_CHECK_DEPTH);
    possibleActions.push({ type: 'stay' }); getValidMoves(currentAiPos, currentPlayerPos).forEach(move => { possibleActions.push({ type: 'move', target: move }); });
    function generateShotActions(startPos, currentTargetPathPoints, bendsSoFar) {
        if (bendsSoFar > maxBendsToPlan) return;
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]; let forbiddenDir = { dx: 0, dy: 0 };
        if (currentTargetPathPoints.length > 0) { const lastBend = currentTargetPathPoints[currentTargetPathPoints.length - 1]; const prevPos = currentTargetPathPoints.length > 1 ? currentTargetPathPoints[currentTargetPathPoints.length - 2] : currentAiPos; forbiddenDir = { dx: Math.sign(prevPos.x - lastBend.x), dy: Math.sign(prevPos.y - lastBend.y) }; }
        directions.forEach(dir => {
            if (dir.dx === forbiddenDir.dx && dir.dy === forbiddenDir.dy && (dir.dx !== 0 || dir.dy !== 0)) return;
             for (let i = 1; i <= Math.max(GRID_SIZE, AI_MAX_SEGMENT_EVAL_POINTS); i++) {
                 const potentialTargetX = startPos.x + dir.dx * i; const potentialTargetY = startPos.y + dir.dy * i; const potentialTarget = { x: potentialTargetX, y: potentialTargetY };
                 if (!isValid(potentialTargetX, potentialTargetY)) break; const segmentResult = calculateShotPathSegment(startPos, potentialTarget, currentPlayerPos);
                 if (!segmentResult.isValidSegment) break; const newTargetPathPoints = [...currentTargetPathPoints, potentialTarget];
                 const fullPathResult = calculateFullPathFromTargets(currentAiPos, newTargetPathPoints, currentPlayerPos);
                 if(fullPathResult.isValid) { possibleActions.push({ type: 'shoot', targetPoints: newTargetPathPoints, hitsPlayer: fullPathResult.hitTarget }); }
                 if (bendsSoFar + 1 < currentAiLevel) { generateShotActions(potentialTarget, newTargetPathPoints, bendsSoFar + 1); }
             }
        });
    }
    generateShotActions(currentAiPos, [], 0); let bestAction = { type: 'stay' }; let bestScore = -Infinity;
    bestScore = evaluateAiPotentialAction(bestAction, currentAiPos, currentPlayerPos); console.log(`AI Action Eval: stay Score: ${bestScore.toFixed(2)}`);
    const uniqueActions = []; const seenActions = new Set();
    possibleActions.forEach(action => {
         let key; if(action.type === 'move') key = `move-${action.target.x},${action.target.y}`; else if(action.type === 'stay') key = 'stay'; else if(action.type === 'shoot') key = `shoot-${action.targetPoints.map(p => `${p.x},${p.y}`).join('|')}`; else key = Math.random().toString();
        if (!seenActions.has(key)) { uniqueActions.push(action); seenActions.add(key); }
    });
    uniqueActions.forEach(action => {
        if (action.type === 'stay') return; const score = evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos);
        let actionDesc = action.type; if(action.type === 'move') actionDesc += ` to ${action.target.x},${action.target.y}`; else if(action.type === 'shoot') actionDesc += ` bends: ${action.targetPoints.length - 1}`;
        console.log(`AI Action Eval: ${actionDesc} Score: ${score.toFixed(2)}`);
        if (score > bestScore) { bestScore = score; bestAction = action; } else if (score >= bestScore - 5) { if (Math.random() > 0.4) { bestScore = score; bestAction = action; } }
    });
    console.log("AI Chose Action:", bestAction); return bestAction;
}

function evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos) {
    let score = 0; let predictedAiPos = { ...currentAiPos }; if (action.type === 'move') predictedAiPos = { ...action.target };
    if (action.type === 'shoot') { if (action.hitsPlayer) { score += 1200; score -= (action.targetPoints.length * 40); } }
    if (action.type === 'move') { if (powerUpPositions.some(p => p.x === action.target.x && p.y === action.target.y)) score += 700; }
    if (canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel)) { score -= 1000; if (action.type === 'move' && !canHitTarget(currentPlayerPos, currentAiPos, playerWeaponLevel)) score -= 300; }
    if (!canHitTarget(currentPlayerPos, predictedAiPos, 1)) { score += 100; if(action.type === 'move' && distance(predictedAiPos, currentPlayerPos) > distance(currentAiPos, currentPlayerPos)) score += 50; }
    else { if (action.type === 'move' && !canHitTarget(currentPlayerPos, currentAiPos, 1)) score -= 80; }
    const nearestPowerup = findNearestPowerup(predictedAiPos); const isCollectingThis = action.type === 'move' && nearestPowerup && nearestPowerup.x === action.target.x && nearestPowerup.y === action.target.y;
    if (nearestPowerup && !isCollectingThis) {
        const distAfter = distance(predictedAiPos, nearestPowerup); const nearestBefore = findNearestPowerup(currentAiPos); const distBefore = nearestBefore ? distance(currentAiPos, nearestBefore) : Infinity;
        if (distAfter < distBefore) { const distanceClosed = distBefore === Infinity ? 0 : distBefore - distAfter; score += Math.max(0, 300 - distAfter * 30) + distanceClosed * 10; }
    }
    const distToPlayer = distance(predictedAiPos, currentPlayerPos); const idealMinDist = 5; const idealMaxDist = GRID_SIZE / 2;
    if (distToPlayer < idealMinDist) score -= (idealMinDist - distToPlayer) * 40; else if (distToPlayer > idealMaxDist) score -= (distToPlayer - idealMaxDist) * 10;
    if (action.type === 'move' || action.type === 'stay') {
        if (canHitTarget(predictedAiPos, currentPlayerPos, aiWeaponLevel)) { score += 250; if(canHitTarget(predictedAiPos, currentPlayerPos, 1)) score += 100; if(!canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel)) score += 150; }
    }
    score += (Math.random() - 0.5) * 5; return score;
}

// --- Action Execution and Turn Management --- (Remove maybeSpawnPowerup call)

async function executeAction(action) {
    if (isResolving || gameOverState) return;
    console.log(`Executing ${currentPlayer}'s action:`, action);
    isResolving = true; disablePlanningControls(); updatePhaseIndicator();
    let actionSuccess = true; let wasHit = false; let collectedPowerup = false; let messageLog = [];
    const activePlayer = currentPlayer; const activePlayerMesh = (activePlayer === 'player') ? playerMesh : aiMesh;
    const activePlayerPosRef = (activePlayer === 'player') ? playerPos : aiPos;
    const opponentPos = (activePlayer === 'player') ? aiPos : playerPos;
    const opponentMesh = (activePlayer === 'player') ? aiMesh : playerMesh;
    const laserMaterial = (activePlayer === 'player') ? playerLaserMaterial : aiLaserMaterial;
    let weaponLevelRef = (activePlayer === 'player') ? playerWeaponLevel : aiWeaponLevel;

    if (action.type === 'move') {
        setMessage(`${activePlayer.toUpperCase()} moves...`);
        if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) { messageLog.push(`${activePlayer.toUpperCase()} move blocked by opponent!`); actionSuccess = false; }
        else {
             await animateMove(activePlayerMesh, action.target); activePlayerPosRef.x = action.target.x; activePlayerPosRef.y = action.target.y;
             messageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`);
             const powerupIndex = powerUpPositions.findIndex(p => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y);
             if (powerupIndex !== -1) {
                 const currentLevel = (activePlayer === 'player') ? playerWeaponLevel : aiWeaponLevel; const newLevel = Math.min(MAX_WEAPON_LEVEL, currentLevel + 1);
                 if (activePlayer === 'player') playerWeaponLevel = newLevel; else aiWeaponLevel = newLevel;
                 collectedPowerup = true; messageLog.push(`${activePlayer.toUpperCase()} collected weapon upgrade! (Level ${newLevel})`);
                 removePowerup3D(activePlayerPosRef.x, activePlayerPosRef.y); updateWeaponLevelInfo();
             }
        }
    } else if (action.type === 'shoot') {
         setMessage(`${activePlayer.toUpperCase()} fires!`); const startPos = (activePlayer === 'player') ? playerPos : aiPos;
         const finalPathResult = calculateFullPathFromTargets(startPos, action.targetPoints, opponentPos);
         if (finalPathResult.isValid) {
             createLaserBeam(finalPathResult.path, laserMaterial); messageLog.push(`${activePlayer.toUpperCase()} shot path confirmed.`);
             wasHit = finalPathResult.hitTarget;
             if (wasHit) { messageLog.push(`${activePlayer === 'player' ? 'AI' : 'Player'} was hit!`); } else { messageLog.push(`Shot missed!`); }
             await wait(SHOT_FLASH_DURATION);
         } else { messageLog.push(`${activePlayer.toUpperCase()} shot blocked!`); actionSuccess = false; await wait(ACTION_RESOLVE_DELAY); }
    } else if (action.type === 'stay') {
        setMessage(`${activePlayer.toUpperCase()} stays put.`); messageLog.push(`${activePlayer.toUpperCase()} did not move.`); await wait(ACTION_RESOLVE_DELAY);
    }

    setMessage(messageLog.join(" "));
    if (wasHit) { endGame(`${activePlayer.toUpperCase()} Wins!`, activePlayer); return; }

    if (!gameOverState) {
         // maybeSpawnPowerup(); // REMOVED - No dynamic spawning
         currentPlayer = (activePlayer === 'player') ? 'ai' : 'player'; gamePhase = currentPlayer + 'Turn'; isResolving = false;
         await wait(ACTION_RESOLVE_DELAY);
         if (currentPlayer === 'ai') { triggerAiTurn(); }
         else { setMessage("Your Turn: Plan your action."); updatePhaseIndicator(); enablePlanningControls(); setPlanningMode('move'); }
     } else { isResolving = false; }
}

function triggerAiTurn() {
    setMessage("AI is thinking..."); updatePhaseIndicator(); disablePlanningControls();
    setTimeout(() => { if (gameOverState) return; const aiAction = planAiAction(); executeAction(aiAction); }, AI_THINK_DELAY);
}


// --- Animate Move Function --- (Unchanged)
function animateMove(mesh, targetGridPos) {
    return new Promise(resolve => {
        const startPos3D = mesh.position.clone(); const targetY = mesh.userData.type === 'player' ? CELL_3D_SIZE * 0.9 / 2 : CELL_3D_SIZE * 1.0 / 2;
        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);
        const hopHeight = CELL_3D_SIZE * 0.3; const midPos3D = new THREE.Vector3( (startPos3D.x + targetPos3D.x) / 2, Math.max(startPos3D.y, targetPos3D.y) + hopHeight, (startPos3D.z + targetPos3D.z) / 2 );
        new TWEEN.Tween(startPos3D).to(midPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => { mesh.position.copy(startPos3D); }).onComplete(() => {
                 new TWEEN.Tween(startPos3D).to(targetPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.In)
                     .onUpdate(() => { mesh.position.copy(startPos3D); }).onComplete(resolve).start();
            }).start();
    });
}


// --- Utility Wait Function --- (Unchanged)
function wait(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

// --- Powerup Logic Functions ---

// REMOVED: maybeSpawnPowerup()
// REMOVED: spawnPowerup()

// REVISED: spawnInitialPowerups() - Uses weighted random sampling
function spawnInitialPowerups() {
    console.log("Spawning initial powerups (Weighted Random Sampling)...");
    powerUpPositions = []; // Ensure logical list is clear
    powerupMeshes = [];    // Ensure mesh list is clear

    let availableCells = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // Cell must be floor and not occupied by player or AI start positions
            if (grid[y][x] === 'floor' && !(x === playerPos.x && y === playerPos.y) && !(x === aiPos.x && y === aiPos.y)) {
                availableCells.push({ x, y });
            }
        }
    }

    if (availableCells.length < INITIAL_POWERUP_COUNT) {
        console.warn(`Not enough available cells (${availableCells.length}) to spawn ${INITIAL_POWERUP_COUNT} powerups. Spawning all available.`);
        // Fallback: Spawn in all available cells if fewer than needed
        availableCells.forEach(cell => {
            powerUpPositions.push({ x: cell.x, y: cell.y });
            const newPowerup = createPowerup3D(cell.x, cell.y); // Creates mesh and adds to scene
            powerupMeshes.push(newPowerup); // Add to the managed list
            console.log(`Spawned powerup at ${cell.x},${cell.y} (fallback due to low cell count)`);
        });
        return; // Stop here if fallback was used
    }

    // Calculate weights for available cells based on distance bias
    let weightedCells = availableCells.map(cell => {
        const distPlayer = Math.max(1, distance(cell, playerPos)); // Use Manhattan distance, ensure minimum 1
        const distAi = Math.max(1, distance(cell, aiPos));
        const ratio = distAi / distPlayer; // Ratio of distances
        const diff = Math.abs(ratio - AI_DISTANCE_BIAS); // Difference from target bias

        // Weight: Higher for cells closer to the desired bias ratio.
        // Using squared difference emphasizes closer matches. Added small base weight.
        // Increased multiplier for sensitivity.
        const weight = 0.01 + 1 / (1 + diff * diff * 10);

        return { cell, weight, ratio, distPlayer, distAi };
    }).filter(wc => wc.weight > 0); // Should always be > 0 with base weight

    // Perform weighted random sampling *without replacement*
    let totalWeight = weightedCells.reduce((sum, wc) => sum + wc.weight, 0);
    let spawnedCount = 0;
    const maxSpawnAttempts = availableCells.length * 3; // Increased safety break margin
    let attempts = 0;

    while (spawnedCount < INITIAL_POWERUP_COUNT && weightedCells.length > 0 && attempts < maxSpawnAttempts) {
         attempts++;
         if (totalWeight <= 0) {
             console.warn("Total weight is zero or negative, cannot perform weighted sampling. Attempt:", attempts);
             break; // Safety break
         }
        let randomVal = Math.random() * totalWeight;
        let chosenIndex = -1;

        // Find the cell corresponding to the random value
        for (let i = 0; i < weightedCells.length; i++) {
            randomVal -= weightedCells[i].weight;
            if (randomVal <= 0) {
                chosenIndex = i;
                break;
            }
        }

        // Handle potential floating point inaccuracies or edge cases
        if (chosenIndex === -1 && weightedCells.length > 0) {
             console.warn("Weighted sampling fallback triggered (chosenIndex = -1). Attempt:", attempts);
            chosenIndex = weightedCells.length - 1; // Default to last element as fallback
        }

        if (chosenIndex !== -1 && chosenIndex < weightedCells.length) { // Ensure index is valid
             const chosenWeightedCell = weightedCells[chosenIndex];
             const { cell, ratio, distPlayer, distAi } = chosenWeightedCell;

            // Add to logical list, create 3D mesh, and add to mesh list
            powerUpPositions.push({ x: cell.x, y: cell.y });
            const newPowerup = createPowerup3D(cell.x, cell.y);
            powerupMeshes.push(newPowerup);
            console.log(`Spawned powerup at ${cell.x},${cell.y} (Ratio: ${ratio.toFixed(2)}, PDist: ${distPlayer}, ADist: ${distAi}, Weight: ${chosenWeightedCell.weight.toFixed(3)})`);
            spawnedCount++;

            // Remove chosen cell from list and update total weight for next iteration
            totalWeight -= chosenWeightedCell.weight;
            weightedCells.splice(chosenIndex, 1);

        } else {
             console.error(`Error during weighted sampling: Invalid chosenIndex (${chosenIndex}) or weightedCells issue. Attempt:`, attempts, "TotalWeight:", totalWeight, "weightedCells.length:", weightedCells.length);
             // Break if something unexpected happened
             break;
        }
    }

    // Log if not all powerups could be placed
    if (spawnedCount < INITIAL_POWERUP_COUNT) {
         console.warn(`Could only spawn ${spawnedCount} out of ${INITIAL_POWERUP_COUNT} initial powerups after ${attempts} attempts.`);
         // Consider adding a fallback to fill remaining slots purely randomly if desired
    } else {
        console.log(`Successfully spawned ${spawnedCount} initial powerups.`);
    }
}

// --- Game Over Function --- (Unchanged)
function endGame(message, winner) {
    console.log("Game Over:", message); gamePhase = 'gameOver';
    gameOverState = { winner: winner, message: message }; setMessage(message);
    updatePhaseIndicator(); disablePlanningControls(); isResolving = false;
}

// --- Utility Functions --- (Unchanged)
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === 'wall'; }

function getValidMoves(unitPos, opponentPos) {
    const moves = []; const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach(dir => { const nextX = unitPos.x + dir.dx; const nextY = unitPos.y + dir.dy;
        if (isValid(nextX, nextY) && grid[nextY][nextX] === 'floor' && !(nextX === opponentPos.x && nextY === opponentPos.y)) { moves.push({ x: nextX, y: nextY }); }
    }); return moves;
}

function distance(pos1, pos2) { return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y); } // Manhattan distance

function findNearestPowerup(pos) {
     let minDist = Infinity; let nearest = null;
     powerUpPositions.forEach(p => { const d = distance(pos, p); if(d < minDist) { minDist = d; nearest = p; } });
     return nearest;
}

function canHitTarget(attackerPos, targetPos, attackerWeaponLevel) {
    if (!isValid(attackerPos.x, attackerPos.y) || !isValid(targetPos.x, targetPos.y) || grid[targetPos.y][targetPos.x] === 'wall') return false;
    if (attackerPos.x === targetPos.x && attackerPos.y === targetPos.y) return true;
    const maxBends = attackerWeaponLevel - 1; const q = [{ pos: attackerPos, bendsMade: -1, lastDir: { dx: 0, dy: 0 } }];
    const visited = new Set([`${attackerPos.x},${attackerPos.y},-1,0,0`]);
    while (q.length > 0) {
        const { pos, bendsMade, lastDir } = q.shift(); const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const dir of directions) {
             if (lastDir.dx !== 0 || lastDir.dy !== 0) { if (dir.dx === -lastDir.dx && dir.dy === -lastDir.dy) continue; }
            let bendsForNextSegment = bendsMade; const isBend = (lastDir.dx !== 0 || lastDir.dy !== 0) && (dir.dx !== lastDir.dx || dir.dy !== lastDir.dy);
            if (isBend) bendsForNextSegment++; if (bendsForNextSegment > maxBends) continue;
            for (let i = 1; i < GRID_SIZE * 2; i++) {
                const nextX = pos.x + dir.dx * i; const nextY = pos.y + dir.dy * i; const currentExplorePos = { x: nextX, y: nextY };
                if (!isValid(nextX, nextY) || grid[nextY][nextX] === 'wall') break;
                if (currentExplorePos.x === targetPos.x && currentExplorePos.y === targetPos.y) return true;
                const nextStateKey = `${currentExplorePos.x},${currentExplorePos.y},${bendsForNextSegment},${dir.dx},${dir.dy}`;
                if (!visited.has(nextStateKey)) { visited.add(nextStateKey); q.push({ pos: currentExplorePos, bendsMade: bendsForNextSegment, lastDir: dir }); }
            }
        }
    } return false;
}


// --- Start Game ---
init();