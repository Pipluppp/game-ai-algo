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

// --- Game State ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerWeaponLevel = 1;
let aiWeaponLevel = 1;
let powerUpPositions = [];
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
    currentPlayer = 'player'; // Player starts
    gamePhase = 'playerTurn';
    currentPlanningMode = 'move'; // Default to move
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null;
    gameOverState = null;
    isResolving = false;

    createUnits3D();

    // Spawn some initial powerups
    maybeSpawnPowerup(); maybeSpawnPowerup(); maybeSpawnPowerup(); maybeSpawnPowerup();

    setMessage("Your Turn: Plan your move or shot.");
    updatePhaseIndicator();
    updateWeaponLevelInfo();
    enablePlanningControls(); // Enable controls for the player
    clearHighlights();

    controls.target.set(0, 0, 0);
    controls.update();

    setPlanningMode('move'); // Set initial mode visuals
}

function setupInputListeners() {
    btnPlanMove.addEventListener('click', () => setPlanningMode('move'));
    btnPlanShoot.addEventListener('click', () => setPlanningMode('shoot'));
    btnReset.addEventListener('click', initGameLogic);
    canvasContainer.addEventListener('click', handleCanvasClick);
    canvasContainer.addEventListener('mousemove', handleCanvasMouseMove);
}

// --- Grid Generation Functions --- (Keep existing grid generation, connection check, start position finding)
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

    activeLasers.slice().forEach(laser => {
        disposeMesh(laser);
    });
    activeLasers = [];
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    wallMeshes = [];

    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);

            if (grid[y][x] === 'floor') {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
                floorMesh.position.copy(pos);
                floorMesh.position.y = -0.1;
                floorMesh.castShadow = false;
                floorMesh.receiveShadow = true;
                floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
                gameBoardGroup.add(floorMesh);
                floorMeshes[y][x] = floorMesh;
            }
            else if (grid[y][x] === 'wall') {
                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
                wallMesh.position.copy(pos);
                wallMesh.position.y = WALL_HEIGHT / 2;
                wallMesh.castShadow = true;
                wallMesh.receiveShadow = true;
                wallMesh.userData = { gridX: x, gridY: y, type: 'wall' };
                gameBoardGroup.add(wallMesh);
                wallMeshes.push(wallMesh);
                floorMeshes[y][x] = null;
            }
        }
    }
}

function createUnits3D() {
    const playerUnitHeight = CELL_3D_SIZE * 0.9;
    const playerUnitRadius = CELL_3D_SIZE * 0.3;

    const aiUnitHeight = CELL_3D_SIZE * 1.0;
    const aiUnitRadius = CELL_3D_SIZE * 0.4;


    const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - playerUnitRadius * 2, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2);
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: 'player' };
    gameBoardGroup.add(playerMesh);

    playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
    playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0);
    playerMesh.add(playerLevelIndicator);


    const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2);
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: 'ai' };
    gameBoardGroup.add(aiMesh);

    aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
    aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0);
    aiMesh.add(aiLevelIndicator);

    updateWeaponLevelVisuals();
}

function createLevelTextMesh(level) {
     const canvas = document.createElement('canvas');
     const context = canvas.getContext('2d');
     const size = 128;
     const halfSize = size / 2;
     canvas.width = size;
     canvas.height = size;

     context.fillStyle = 'rgba(0, 0, 0, 0.7)';
     context.beginPath();
     context.roundRect(0, 0, size, size, size * 0.15);
     context.fill();

     context.font = `Bold ${size * 0.6}px Arial`;
     context.fillStyle = 'white';
     context.textAlign = 'center';
     context.textBaseline = 'middle';
     context.fillText(level.toString(), halfSize, halfSize + size * 0.02);

     const texture = new THREE.CanvasTexture(canvas);
     texture.needsUpdate = true;
     texture.colorSpace = THREE.SRGBColorSpace;

     const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false });
     const sprite = new THREE.Sprite(spriteMaterial);
     sprite.scale.set(0.1, 0.1, 1);
     return sprite;
}

function updateWeaponLevelVisuals() {
     if (playerMesh) {
        disposeSprite(playerLevelIndicator);
        playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
        const playerUnitHeight = CELL_3D_SIZE * 0.9;
        playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0);
        playerMesh.add(playerLevelIndicator);
        playerMesh.material.emissiveIntensity = 0.5 + (playerWeaponLevel - 1) * 0.3;
    }
     if (aiMesh) {
        disposeSprite(aiLevelIndicator);
        aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
        const aiUnitHeight = CELL_3D_SIZE * 1.0;
        aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0);
        aiMesh.add(aiLevelIndicator);
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
         disposeMesh(mesh); // Dispose the highlight instance
    });
    activeHighlights = [];
    // Recreate floor meshes if they were replaced by highlights
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
    if (isValid(x, y) && grid[y][x] === 'floor') {
        const existingMesh = floorMeshes[y]?.[x];
         if (existingMesh) {
             disposeMesh(existingMesh);
             floorMeshes[y][x] = null;
         }

        const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE);
        const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone());
        highlightMesh.position.copy(get3DPosition(x, y));
        highlightMesh.position.y = -0.08;
        highlightMesh.userData = { gridX: x, gridY: y, type: 'highlight' };
        gameBoardGroup.add(highlightMesh);
        activeHighlights.push(highlightMesh);
    }
}

function renderHighlights() {
    // Only render highlights during the player's turn when not resolving
    if (currentPlayer !== 'player' || isResolving || gameOverState) {
        if (activeHighlights.length > 0) clearHighlights();
        return;
    }

     clearHighlights(); // Clear previous highlights before rendering new ones

    const opponentTargetPos = aiPos; // Target for player is AI

    if (currentPlanningMode === 'move') {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));
    }
    else if (currentPlanningMode === 'shoot') {
         let pathToShow = [];
         let useMaterial = pathHighlightMaterial;

         // Show hover path if player is picking points
         if (partialShootPlan?.needsInput && hoverPath.length > 0) {
             pathToShow = hoverPath;
              if (!hoverPathIsValid) {
                 useMaterial = invalidPathHighlightMaterial;
              }
         }
         // Show the current partial plan if bends are locked in
          else if (partialShootPlan?.path?.length > 0 && !partialShootPlan.needsInput) {
             pathToShow = partialShootPlan.path;
             useMaterial = pathHighlightMaterial;
         }

         let hitOpponent = false;
         pathToShow.forEach(p => {
             highlightCell(p.x, p.y, useMaterial);
             // Check if the opponent's CURRENT position is on the valid path being shown
             if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y && useMaterial !== invalidPathHighlightMaterial) {
                 hitOpponent = true;
             }
         });

        // Highlight target if hit
        if (hitOpponent) {
             highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial);
        }
    }
}


// --- Laser Effect Function ---
function createLaserBeam(path, material) {
    if (!path || path.length < 1) return null;

     const adjustedPath = [];
     const startOffset = (material === playerLaserMaterial ? playerMesh : aiMesh).position.y;
     const endOffset = (material === playerLaserMaterial ? aiMesh : playerMesh).position.y;

     // Start point
     const firstPoint3D = get3DPosition(path[0].x, path[0].y, startOffset);
     adjustedPath.push(firstPoint3D);

     // Intermediate points
     for (let i = 1; i < path.length; i++) {
         adjustedPath.push(get3DPosition(path[i].x, path[i].y, startOffset));
     }

     // End point extension logic (adjusted for potentially different unit heights)
     if (path.length > 0) {
          const lastPoint = path[path.length - 1];
          const targetUnitPos = (material === playerLaserMaterial) ? aiPos : playerPos;
          const targetUnit3D = get3DPosition(targetUnitPos.x, targetUnitPos.y, endOffset); // Use target unit's height

          // Check if the last cell of the *logical* path is the target unit's cell
          if (lastPoint.x === targetUnitPos.x && lastPoint.y === targetUnitPos.y) {
              const lastPathPoint3D = adjustedPath[adjustedPath.length - 1]; // Last point in the 3D path array
              // Extend slightly towards the target unit's center (at its height)
              const dirToTarget = targetUnit3D.clone().sub(lastPathPoint3D).normalize().multiplyScalar(CELL_3D_SIZE * 0.3);
              adjustedPath.push(lastPathPoint3D.clone().add(dirToTarget));
          }
     }

    const curve = new THREE.CatmullRomCurve3(adjustedPath, false, 'catmullrom', 0.1);
    const tubeRadius = CELL_3D_SIZE * 0.08;
    const tubeSegments = Math.max(8, path.length * 4);
    const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);

    const laserMesh = new THREE.Mesh(tubeGeom, material.clone()); // Use cloned material
    laserMesh.userData = { type: 'laser' };
    laserMesh.castShadow = false;
    laserMesh.receiveShadow = false;

    scene.add(laserMesh);
    activeLasers.push(laserMesh);

    new TWEEN.Tween({ opacity: laserMesh.material.opacity })
        .to({ opacity: 0 }, SHOT_FLASH_DURATION)
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
        p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5;
    });

    // No need to call renderHighlights here - it's triggered by mousemove/mode changes
    composer.render();
}

// --- Input Handling Functions ---
function handleCanvasMouseMove(event) {
    // Only allow hover interactions during player's turn and when not resolving
    if (currentPlayer !== 'player' || isResolving || gameOverState) {
        if (hoverPath.length > 0 || !hoverPathIsValid) { // Clear old hover state if conditions not met
            hoverPos = null;
            hoverPath = [];
            hoverPathIsValid = false;
            renderHighlights(); // Clear highlights immediately
        }
        return;
    }
    // Only update hover path if planning shoot mode and needs input
    if (currentPlanningMode !== 'shoot' || !partialShootPlan?.needsInput) {
         if (hoverPath.length > 0 || !hoverPathIsValid) { // Clear old hover state if conditions not met
            hoverPos = null;
            hoverPath = [];
            hoverPathIsValid = false;
            renderHighlights(); // Clear highlights immediately
         }
        return;
    }

    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const targetGridPos = getGridCoords(intersects[0].point);
        if (isValid(targetGridPos.x, targetGridPos.y)) {
            if (!hoverPos || hoverPos.x !== targetGridPos.x || hoverPos.y !== targetGridPos.y) {
                hoverPos = { ...targetGridPos };
                const startPos = partialShootPlan.lastBendPos;
                const segmentResult = calculateShotPathSegment(startPos, hoverPos, aiPos); // Check against AI pos for potential hit display

                if (segmentResult.isValidSegment) {
                    hoverPath = [...partialShootPlan.path, ...segmentResult.path];
                    hoverPathIsValid = true;
                } else {
                    hoverPath = [...partialShootPlan.path, hoverPos]; // Show path up to hover, marked invalid
                    hoverPathIsValid = false;
                }
                renderHighlights();
            }
        } else {
             if (hoverPos !== null) {
                 hoverPos = null;
                 hoverPath = [];
                 hoverPathIsValid = false;
                 renderHighlights();
             }
        }
    } else {
        if (hoverPos !== null) {
             hoverPos = null;
             hoverPath = [];
             hoverPathIsValid = false;
             renderHighlights();
        }
    }
}

function handleCanvasClick(event) {
     // Only allow clicks during player's turn and when not resolving
     if (currentPlayer !== 'player' || isResolving || gameOverState) return;

     updateMouseCoords(event);
     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const { x, y } = getGridCoords(intersects[0].point);
         if (isValid(x,y) && grid[y][x] === 'floor') { // Must click a floor tile
             if (currentPlanningMode === 'move') {
                 handleMoveInput(x, y);
             } else if (currentPlanningMode === 'shoot') {
                 handleShootInput(x, y);
             }
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
    btnPlanMove.disabled = false;
    btnPlanShoot.disabled = false;
    renderHighlights(); // Show highlights relevant to the current mode
}
function disablePlanningControls() {
    btnPlanMove.disabled = true;
    btnPlanShoot.disabled = true;
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null;
    clearHighlights();
}

// --- Planning Phase Logic Functions (Player Only) ---
function setPlanningMode(mode) {
    if (currentPlayer !== 'player' || isResolving || gameOverState) return;
    console.log("Setting planning mode:", mode);
    currentPlanningMode = mode;
    partialShootPlan = null;
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;

    btnPlanMove.classList.toggle('active', mode === 'move');
    btnPlanShoot.classList.toggle('active', mode === 'shoot');

    if (mode === 'move') {
         setMessage("Your Turn: Click an adjacent floor cell to move.");
    } else if (mode === 'shoot') {
          partialShootPlan = {
             needsInput: true, maxBends: playerWeaponLevel - 1, segments: [], path: [], lastBendPos: playerPos
         };
         setMessage(`Your Turn (Shoot Lv ${playerWeaponLevel}): Click target cell for segment 1 (Max Bends: ${partialShootPlan.maxBends}).`);
    }
    renderHighlights(); // Render highlights for the new mode
}

function handleMoveInput(targetX, targetY) {
     if (currentPlayer !== 'player' || currentPlanningMode !== 'move' || isResolving || gameOverState) return;

    const validMoves = getValidMoves(playerPos, aiPos); // Check against AI's *current* position
    const isValidTarget = validMoves.some(move => move.x === targetX && move.y === targetY);

    if (isValidTarget) {
        const action = { type: 'move', target: { x: targetX, y: targetY } };
        executeAction(action); // Execute the move immediately
    } else {
        setMessage("Invalid move target. Click a highlighted adjacent square.");
    }
}

function handleShootInput(clickX, clickY) {
    if (currentPlayer !== 'player' || currentPlanningMode !== 'shoot' || !partialShootPlan || !partialShootPlan.needsInput || isResolving || gameOverState) {
        console.warn("Ignoring shoot input - not in correct state.");
        return;
    }

    const targetPos = { x: clickX, y: clickY };
    const startPos = partialShootPlan.lastBendPos;

    if (targetPos.x === startPos.x && targetPos.y === startPos.y) {
        setMessage("Cannot target the starting cell for a segment.");
        return;
    }

    // Check segment validity (only walls matter here, opponent position checked at resolution)
    const segmentResult = calculateShotPathSegment(startPos, targetPos, aiPos); // Pass AI pos for hover hit check

    if (!segmentResult.isValidSegment) {
        setMessage("Invalid target: Path segment is blocked by a wall.");
        hoverPath = [];
        hoverPathIsValid = false;
        renderHighlights();
        return;
    }

    // --- Valid segment selected ---
    partialShootPlan.segments.push({ path: segmentResult.path, endPos: targetPos });
    partialShootPlan.path = partialShootPlan.segments.flatMap(seg => seg.path);
    partialShootPlan.lastBendPos = targetPos;

    const bendsMade = partialShootPlan.segments.length - 1;

    if (bendsMade < partialShootPlan.maxBends) {
        // Plan another segment/bend
        partialShootPlan.needsInput = true;
        setMessage(`Shoot Plan: Bend ${bendsMade + 1} at ${targetPos.x},${targetPos.y}. Click target cell for segment ${bendsMade + 2}.`);
        hoverPos = null;
        hoverPath = [];
        hoverPathIsValid = false;
        renderHighlights(); // Update highlights to show current planned path
    } else {
        // Max bends reached, finalize the shot plan
        partialShootPlan.needsInput = false;
        const finalAction = {
            type: 'shoot',
            targetPoints: partialShootPlan.segments.map(seg => seg.endPos),
            // Path stored in partialShootPlan.path is tentative, recalculate at execution
        };
        executeAction(finalAction); // Execute the shot immediately
    }
}


// --- Shot Path Calculation Functions ---
// calculateShotPathSegment: Calculates a single straight line path segment
function calculateShotPathSegment(startPos, targetPos, opponentPos) { // opponentPos used only for hit check *during hover*
    let path = [];
    let currentPos = { ...startPos };
    let isValidSegment = true;
    let hitTargetAlongSegment = false;

    const dxTotal = targetPos.x - startPos.x;
    const dyTotal = targetPos.y - startPos.y;

    let stepDir = { dx: 0, dy: 0 };
    if (Math.abs(dxTotal) > Math.abs(dyTotal)) {
        if (dyTotal !== 0) return { path: [], isValidSegment: false, hitTarget: false }; // Must be horizontal
        stepDir.dx = Math.sign(dxTotal);
    } else if (Math.abs(dyTotal) > 0) {
         if (dxTotal !== 0) return { path: [], isValidSegment: false, hitTarget: false }; // Must be vertical
        stepDir.dy = Math.sign(dyTotal);
    } else {
        return { path: [], isValidSegment: false, hitTarget: false }; // start === target
    }

    while (currentPos.x !== targetPos.x || currentPos.y !== targetPos.y) {
        const nextX = currentPos.x + stepDir.dx;
        const nextY = currentPos.y + stepDir.dy;

        if (!isValid(nextX, nextY) || isWall(nextX, nextY)) {
            isValidSegment = false; // Hit wall or went off grid before reaching targetPos
            break;
        }

        currentPos = { x: nextX, y: nextY };
        path.push({ ...currentPos }); // Add the valid step

        // Check if opponent is hit *at this cell*
        if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) {
            hitTargetAlongSegment = true; // Mark opponent was on path
        }

        if (currentPos.x === targetPos.x && currentPos.y === targetPos.y) {
             break;
        }
    }

    const reachedTargetCell = isValidSegment && (currentPos.x === targetPos.x && currentPos.y === targetPos.y);
    return { path: path, isValidSegment: reachedTargetCell, hitTarget: hitTargetAlongSegment };
}

// calculateFullPathFromTargets: Calculates the full multi-segment path
// opponentActualPos is the position to check for hits *at the time of execution*
function calculateFullPathFromTargets(startPos, targetPoints, opponentActualPos) {
    let fullPath = [];
    let currentPos = { ...startPos };
    let pathIsValid = true;
    let finalHitTarget = false;

    for (const targetPoint of targetPoints) {
        // Pass opponentActualPos for hit check during calculation
        const segmentResult = calculateShotPathSegment(currentPos, targetPoint, opponentActualPos);

        if (!segmentResult.isValidSegment) {
            pathIsValid = false;
            // Optionally store partial path up to failure point if needed
            // fullPath.push(...segmentResult.path); // Add the failed segment's path
            break; // Overall path is broken
        }

        // Segment is valid
        fullPath.push(...segmentResult.path);
        currentPos = targetPoint; // Update start for next segment

        // Check if opponent was hit *anywhere* on this valid segment
        if (segmentResult.hitTarget) {
             finalHitTarget = true; // Mark hit, but continue calculating full path
        }
    }

    // Final check: Ensure the opponent wasn't *only* hit on a segment that ultimately failed
    // The loop breaks on invalid segments, so finalHitTarget is only true if hit on a valid part.
    // However, the hit check within calculateShotPathSegment needs to be accurate against opponentActualPos.

    // Let's refine the hit check: iterate the FINAL valid fullPath
    if (pathIsValid) {
        finalHitTarget = fullPath.some(p => p.x === opponentActualPos.x && p.y === opponentActualPos.y);
    } else {
        finalHitTarget = false; // Invalid path cannot hit
    }


    return { path: fullPath, isValid: pathIsValid, hitTarget: finalHitTarget };
}


// --- AI Logic Functions ---
function planAiAction() {
    console.log("AI Planning...");
    const possibleActions = [];
    const currentAiPos = { ...aiPos };
    const currentPlayerPos = { ...playerPos }; // Player's current, fixed position
    const currentAiLevel = aiWeaponLevel;
    const maxBendsToPlan = Math.min(currentAiLevel - 1, AI_MAX_BEND_CHECK_DEPTH);

    // 1. Stay Put
    possibleActions.push({ type: 'stay' });

    // 2. Possible Moves
    getValidMoves(currentAiPos, currentPlayerPos).forEach(move => {
        possibleActions.push({ type: 'move', target: move });
    });

    // 3. Possible Shots (Recursive generation)
    function generateShotActions(startPos, currentTargetPathPoints, bendsSoFar) {
        if (bendsSoFar > maxBendsToPlan) return;

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        let forbiddenDir = { dx: 0, dy: 0 };
        if (currentTargetPathPoints.length > 0) {
            const lastBend = currentTargetPathPoints[currentTargetPathPoints.length - 1];
            const prevPos = currentTargetPathPoints.length > 1 ? currentTargetPathPoints[currentTargetPathPoints.length - 2] : currentAiPos;
            forbiddenDir = { dx: Math.sign(prevPos.x - lastBend.x), dy: Math.sign(prevPos.y - lastBend.y) };
        }

        directions.forEach(dir => {
            if (dir.dx === forbiddenDir.dx && dir.dy === forbiddenDir.dy && (dir.dx !== 0 || dir.dy !== 0)) {
                 return; // Skip reverse direction
             }

             for (let i = 1; i <= Math.max(GRID_SIZE, AI_MAX_SEGMENT_EVAL_POINTS); i++) {
                 const potentialTargetX = startPos.x + dir.dx * i;
                 const potentialTargetY = startPos.y + dir.dy * i;
                 const potentialTarget = { x: potentialTargetX, y: potentialTargetY };

                 if (!isValid(potentialTargetX, potentialTargetY)) break; // Off grid

                 // Check segment validity from startPos to potentialTarget (only walls matter)
                 const segmentResult = calculateShotPathSegment(startPos, potentialTarget, currentPlayerPos); // Pass player pos for potential hit evaluation

                 if (!segmentResult.isValidSegment) {
                     break; // Path blocked by wall
                 }

                 // Valid Segment found
                 const newTargetPathPoints = [...currentTargetPathPoints, potentialTarget];

                 // Calculate the full path for this *potential* action
                 const fullPathResult = calculateFullPathFromTargets(currentAiPos, newTargetPathPoints, currentPlayerPos);

                 if(fullPathResult.isValid) {
                     possibleActions.push({
                         type: 'shoot',
                         targetPoints: newTargetPathPoints,
                         // Store calculated hit status for evaluation
                         hitsPlayer: fullPathResult.hitTarget
                     });
                 }

                 // Recursive Call for Next Bend
                 if (bendsSoFar + 1 < currentAiLevel) {
                     generateShotActions(potentialTarget, newTargetPathPoints, bendsSoFar + 1);
                 }
             }
        });
    }

    generateShotActions(currentAiPos, [], 0);

    // --- Evaluate Actions ---
    let bestAction = { type: 'stay' };
    let bestScore = -Infinity;

    bestScore = evaluateAiPotentialAction(bestAction, currentAiPos, currentPlayerPos);
    console.log(`AI Action Eval: stay Score: ${bestScore.toFixed(2)}`);

    // Remove duplicate actions
    const uniqueActions = [];
    const seenActions = new Set();
    possibleActions.forEach(action => {
         let key;
         if(action.type === 'move') key = `move-${action.target.x},${action.target.y}`;
         else if(action.type === 'stay') key = 'stay';
         else if(action.type === 'shoot') key = `shoot-${action.targetPoints.map(p => `${p.x},${p.y}`).join('|')}`;
         else key = Math.random().toString();

        if (!seenActions.has(key)) {
            uniqueActions.push(action);
            seenActions.add(key);
        }
    });


    uniqueActions.forEach(action => {
        if (action.type === 'stay') return;

        const score = evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos);

         let actionDesc = action.type;
         if(action.type === 'move') actionDesc += ` to ${action.target.x},${action.target.y}`;
         else if(action.type === 'shoot') actionDesc += ` bends: ${action.targetPoints.length - 1}`;
        console.log(`AI Action Eval: ${actionDesc} Score: ${score.toFixed(2)}`);

        if (score > bestScore) {
            bestScore = score;
            bestAction = action;
        } else if (score >= bestScore - 5) {
             if (Math.random() > 0.4) {
                 bestScore = score;
                 bestAction = action;
             }
        }
    });

    console.log("AI Chose Action:", bestAction);
    return bestAction; // Return the chosen action
}


function evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos) {
    let score = 0;
    let predictedAiPos = { ...currentAiPos }; // Where AI *would* be after this action

    if (action.type === 'move') {
        predictedAiPos = { ...action.target };
    }

    // (+) Offensive - Hitting Player
    if (action.type === 'shoot') {
        if (action.hitsPlayer) { // Use pre-calculated hit status
            score += 1200;
            score -= (action.targetPoints.length * 40); // Penalty for complexity
        }
    }

     // (+) Powerup - Collection
    if (action.type === 'move') {
        if (powerUpPositions.some(p => p.x === action.target.x && p.y === action.target.y)) {
            score += 700;
        }
    }

     // (-) Defensive - Being Targeted: Check if player can hit AI's predicted position
     // Use player's *current* weapon level
    if (canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel)) {
        score -= 1000;
         if (action.type === 'move' && !canHitTarget(currentPlayerPos, currentAiPos, playerWeaponLevel)) {
              score -= 300; // Extra penalty for moving into danger
         }
    }

    // (+) Defensive - Cover: Check if a *straight* shot from player to predicted pos is blocked
    if (!canHitTarget(currentPlayerPos, predictedAiPos, 1)) {
          score += 100;
         if(action.type === 'move' && distance(predictedAiPos, currentPlayerPos) > distance(currentAiPos, currentPlayerPos)){
             score += 50;
         }
    } else {
         if (action.type === 'move' && !canHitTarget(currentPlayerPos, currentAiPos, 1)) {
              score -= 80;
         }
    }

    // (+) Powerup - Proximity
    const nearestPowerup = findNearestPowerup(predictedAiPos);
    if (nearestPowerup && !(action.type === 'move' && nearestPowerup.x === action.target.x && nearestPowerup.y === action.target.y)) {
        const distAfter = distance(predictedAiPos, nearestPowerup);
        const nearestBefore = findNearestPowerup(currentAiPos);
        const distBefore = nearestBefore ? distance(currentAiPos, nearestBefore) : Infinity;

        if (distAfter < distBefore) {
            const distanceClosed = distBefore === Infinity ? 0 : distBefore - distAfter;
            score += Math.max(0, 300 - distAfter * 30) + distanceClosed * 10;
        }
    }

     // (+/-) Distance to Player
     const distToPlayer = distance(predictedAiPos, currentPlayerPos);
     const idealMinDist = 5;
     const idealMaxDist = GRID_SIZE / 2;

     if (distToPlayer < idealMinDist) {
         score -= (idealMinDist - distToPlayer) * 40;
     } else if (distToPlayer > idealMaxDist) {
          score -= (distToPlayer - idealMaxDist) * 10;
     }

    // (+) Offensive - Setup: Can AI shoot player *next turn* from predicted position?
     if (action.type === 'move' || action.type === 'stay') {
         if (canHitTarget(predictedAiPos, currentPlayerPos, aiWeaponLevel)) { // Check using AI's weapon level
             score += 250;
             if(canHitTarget(predictedAiPos, currentPlayerPos, 1)) {
                 score += 100;
             }
             if(!canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel)){ // Check if player can hit back
                 score += 150;
             }
         }
     }

    score += (Math.random() - 0.5) * 5; // Random nudge

    return score;
}

// --- Action Execution and Turn Management ---

async function executeAction(action) {
    if (isResolving || gameOverState) return;

    console.log(`Executing ${currentPlayer}'s action:`, action);
    isResolving = true;
    disablePlanningControls(); // Disable player input during resolution
    updatePhaseIndicator(); // Show "Executing..."

    let actionSuccess = true; // Assume success initially
    let wasHit = false;
    let collectedPowerup = false;
    let messageLog = []; // Accumulate messages for this turn

    const activePlayer = currentPlayer; // Store who is acting
    const activePlayerMesh = (activePlayer === 'player') ? playerMesh : aiMesh;
    const activePlayerPosRef = (activePlayer === 'player') ? playerPos : aiPos; // Direct reference for updating
    const opponentPos = (activePlayer === 'player') ? aiPos : playerPos;
    const opponentMesh = (activePlayer === 'player') ? aiMesh : playerMesh;
    const laserMaterial = (activePlayer === 'player') ? playerLaserMaterial : aiLaserMaterial;
    let weaponLevelRef = (activePlayer === 'player') ? playerWeaponLevel : aiWeaponLevel;


    if (action.type === 'move') {
        setMessage(`${activePlayer.toUpperCase()} moves...`);
        // Double-check validity against current opponent position (important for alternating turns)
        if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) {
             messageLog.push(`${activePlayer.toUpperCase()} move blocked by opponent!`);
             actionSuccess = false;
        } else {
             await animateMove(activePlayerMesh, action.target);
             // Update the position variable AFTER animation
             activePlayerPosRef.x = action.target.x;
             activePlayerPosRef.y = action.target.y;
             messageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`);

             // Check for powerup collection at the NEW position
             const powerupIndex = powerUpPositions.findIndex(p => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y);
             if (powerupIndex !== -1) {
                 const newLevel = Math.min(MAX_WEAPON_LEVEL, weaponLevelRef + 1);
                 if (activePlayer === 'player') playerWeaponLevel = newLevel; else aiWeaponLevel = newLevel;
                 collectedPowerup = true;
                 messageLog.push(`${activePlayer.toUpperCase()} collected weapon upgrade! (Level ${newLevel})`);
                 removePowerup3D(activePlayerPosRef.x, activePlayerPosRef.y);
                 powerUpPositions.splice(powerupIndex, 1);
                 updateWeaponLevelInfo(); // Update UI and 3D visuals
             }
        }

    } else if (action.type === 'shoot') {
         setMessage(`${activePlayer.toUpperCase()} fires!`);
         // Calculate path based on the player's position *at the start of the shot* and opponent's *current* position
         const startPos = (activePlayer === 'player') ? playerPos : aiPos; // Use the updated position if they moved first
         const finalPathResult = calculateFullPathFromTargets(startPos, action.targetPoints, opponentPos);

         if (finalPathResult.isValid) {
             createLaserBeam(finalPathResult.path, laserMaterial);
             messageLog.push(`${activePlayer.toUpperCase()} shot path confirmed.`);

             // Check hit based on calculated path and opponent's position
             wasHit = finalPathResult.hitTarget; // Use the result from calculateFullPathFromTargets
             if (wasHit) {
                 messageLog.push(`${activePlayer === 'player' ? 'AI' : 'Player'} was hit!`);
             } else {
                 messageLog.push(`Shot missed!`);
             }
             await wait(SHOT_FLASH_DURATION); // Wait for laser effect

         } else {
             messageLog.push(`${activePlayer.toUpperCase()} shot blocked!`);
             actionSuccess = false;
             await wait(ACTION_RESOLVE_DELAY); // Short delay even if blocked
         }

    } else if (action.type === 'stay') {
        setMessage(`${activePlayer.toUpperCase()} stays put.`);
        messageLog.push(`${activePlayer.toUpperCase()} did not move.`);
        await wait(ACTION_RESOLVE_DELAY); // Small delay for 'stay' action
    }

    // --- Post-Action Checks ---
    setMessage(messageLog.join(" ")); // Display accumulated messages for the turn

    if (wasHit) {
         endGame(`${activePlayer.toUpperCase()} Wins!`, activePlayer);
         return; // Game Over
    }

    if (!gameOverState) {
         maybeSpawnPowerup(); // Chance to spawn powerup after successful action

         // Switch Turns
         currentPlayer = (activePlayer === 'player') ? 'ai' : 'player';
         gamePhase = currentPlayer + 'Turn';
         isResolving = false; // Resolution finished for this turn

         await wait(ACTION_RESOLVE_DELAY); // Short pause before next turn starts

         if (currentPlayer === 'ai') {
             triggerAiTurn();
         } else {
             // It's player's turn
             setMessage("Your Turn: Plan your action.");
             updatePhaseIndicator();
             enablePlanningControls();
             setPlanningMode('move'); // Reset planning mode for player
         }
     } else {
          isResolving = false; // Ensure resolving flag is reset if game ended immediately
     }
}

function triggerAiTurn() {
    setMessage("AI is thinking...");
    updatePhaseIndicator();
    disablePlanningControls(); // Ensure player controls are off

    setTimeout(() => {
        if (gameOverState) return; // Check game over status again before AI acts
        const aiAction = planAiAction();
        executeAction(aiAction); // Execute the AI's chosen action
    }, AI_THINK_DELAY);
}


// --- Animate Move Function ---
function animateMove(mesh, targetGridPos) {
    return new Promise(resolve => {
        const startPos3D = mesh.position.clone();
         const targetY = mesh.userData.type === 'player'
             ? CELL_3D_SIZE * 0.9 / 2
             : CELL_3D_SIZE * 1.0 / 2;

        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);

        const hopHeight = CELL_3D_SIZE * 0.3;
        const midPos3D = new THREE.Vector3(
             (startPos3D.x + targetPos3D.x) / 2,
             Math.max(startPos3D.y, targetPos3D.y) + hopHeight,
             (startPos3D.z + targetPos3D.z) / 2
         );

        new TWEEN.Tween(startPos3D)
            .to(midPos3D, MOVEMENT_DURATION * 0.5)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => {
                mesh.position.copy(startPos3D);
            })
            .onComplete(() => {
                 new TWEEN.Tween(startPos3D)
                     .to(targetPos3D, MOVEMENT_DURATION * 0.5)
                     .easing(TWEEN.Easing.Quadratic.In)
                     .onUpdate(() => {
                         mesh.position.copy(startPos3D);
                     })
                     .onComplete(resolve)
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
        // Check logical unoccupied status
        const isUnoccupiedLogically = (x !== playerPos.x || y !== playerPos.y) && (x !== aiPos.x || y !== aiPos.y) && !powerUpPositions.some(p => p.x === x && p.y === y);

        if (isFloor && isUnoccupiedLogically) {
            powerUpPositions.push({ x, y });
            const newPowerup = createPowerup3D(x, y);
            powerupMeshes.push(newPowerup);
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
    disablePlanningControls(); // Keep controls disabled
    isResolving = false;
}

// --- Utility Functions ---
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === 'wall'; }

// getValidMoves: Checks adjacency, floor, and NOT opponent's current position
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

// canHitTarget: Checks if attacker can reach target cell with weapon level, considering walls.
// Does NOT check if the target is currently occupied, just reachability.
function canHitTarget(attackerPos, targetPos, attackerWeaponLevel) {
    if (!isValid(attackerPos.x, attackerPos.y) || !isValid(targetPos.x, targetPos.y) || grid[targetPos.y][targetPos.x] === 'wall') {
        return false;
    }
     if (attackerPos.x === targetPos.x && attackerPos.y === targetPos.y) {
         return true;
     }

    const maxBends = attackerWeaponLevel - 1;

    // BFS search for a valid path within bend limits
    // State: { pos: current cell, bendsMade: bends to reach pos, lastDir: direction taken to reach pos }
    const q = [{ pos: attackerPos, bendsMade: -1, lastDir: { dx: 0, dy: 0 } }];
     // Visited needs to track bends *and* direction to prevent cycles and ensure bend limits are checked correctly for each path variation.
     // Key: "x,y,bends,lastDx,lastDy"
    const visited = new Set([`${attackerPos.x},${attackerPos.y},-1,0,0`]);

    while (q.length > 0) {
        const { pos, bendsMade, lastDir } = q.shift();

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

        for (const dir of directions) {
            // Prevent immediate 180 turn unless starting (lastDir is 0,0)
             if (lastDir.dx !== 0 || lastDir.dy !== 0) {
                 if (dir.dx === -lastDir.dx && dir.dy === -lastDir.dy) {
                     continue;
                 }
             }

            // Calculate bends for the *next* step/segment in this direction
            let bendsForNextSegment = bendsMade;
            const isBend = (lastDir.dx !== 0 || lastDir.dy !== 0) && (dir.dx !== lastDir.dx || dir.dy !== lastDir.dy);
            if (isBend) {
                bendsForNextSegment++;
            }

            if (bendsForNextSegment > maxBends) {
                 continue; // Too many bends required for this segment
             }

            // Explore along the current direction
            for (let i = 1; i < GRID_SIZE * 2; i++) {
                const nextX = pos.x + dir.dx * i;
                const nextY = pos.y + dir.dy * i;
                const currentExplorePos = { x: nextX, y: nextY };

                if (!isValid(nextX, nextY) || grid[nextY][nextX] === 'wall') {
                     break; // Hit wall or went off grid, stop exploring this direction
                }

                // Check if this cell is the target
                if (currentExplorePos.x === targetPos.x && currentExplorePos.y === targetPos.y) {
                    return true; // Found a valid path within bend limits
                }

                // Key for visited set uses the position *reached* and the bend count *used to reach it*
                // along with the direction *taken to reach it*.
                const nextStateKey = `${currentExplorePos.x},${currentExplorePos.y},${bendsForNextSegment},${dir.dx},${dir.dy}`;

                if (!visited.has(nextStateKey)) {
                    visited.add(nextStateKey);
                    // Add the *current position* to the queue, along with the bends count *used to get there*
                    // and the direction *taken to get there*. The BFS will then explore bends *from* this point.
                    q.push({ pos: currentExplorePos, bendsMade: bendsForNextSegment, lastDir: dir });
                }
            }
        }
    }
    return false; // Target not reachable within bend limits
}


// --- Start Game ---
init();