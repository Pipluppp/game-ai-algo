// game_3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from "@tweenjs/tween.js";
// Removed EffectComposer, RenderPass, UnrealBloomPass, ExtrudeGeometry

// --- DOM Elements ---
const canvasContainer = document.getElementById("gameCanvasContainer");
const canvas = document.getElementById("threeCanvas");
const btnPlanMove = document.getElementById("btnPlanMove");
const btnPlanShoot = document.getElementById("btnPlanShoot");
const btnReset = document.getElementById("btnReset");
const phaseIndicator = document.getElementById("phaseIndicator");
const messageArea = document.getElementById("messageArea");
const playerFuelInfo = document.getElementById("playerFuelInfo");
const aiFuelInfo = document.getElementById("aiFuelInfo");
const playerHealthInfo = document.getElementById("playerHealthInfo");
const aiHealthInfo = document.getElementById("aiHealthInfo");
const planFuelCostInfo = document.getElementById("planFuelCostInfo");

// --- Game Constants ---
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
const DAMPENER_DENSITY = 0.15; // % of floor cells that become dampeners
const INITIAL_FUEL = 10;
const FUEL_PER_UPGRADE = 5;
const INITIAL_POWERUP_COUNT = 8;
const AI_DISTANCE_BIAS = 0.95;
const BASE_MOVE_COST = 1; // Cost for normal floor
const DAMPENER_MOVE_COST = 2; // Cost for dampener floor
const TURN_PENALTY = 0; // REMOVED - Keep variable for potential future use, but set to 0
const INITIAL_HEALTH = 3;
const MAX_POWERUPS = Math.floor(GRID_SIZE * GRID_SIZE * 0.04);

// Timing Constants
const MISSILE_TRAVEL_DURATION = 800; // Faster?
const MOVEMENT_DURATION = 250; // Faster?
const AI_THINK_DELAY = 50;
const ACTION_RESOLVE_DELAY = 150;
const EXPLOSION_DURATION = 500; // Faster?

// --- NEW MECHANICS Constants ---
const FUEL_EXPLOSION_RADIUS = 2;
const FUEL_EXPLOSION_SCALE_MULTIPLIER = 1.5; // Smaller
const FUEL_EXPLOSION_PARTICLE_MULTIPLIER = 1.0; // Fewer
const NUKES_PER_ROUND = 3;
const NUKE_DAMAGE = 1;
const NUKE_EXPLOSION_SCALE_MULTIPLIER = 0.8; // Smaller
const NUKE_EXPLOSION_PARTICLE_MULTIPLIER = 1.5; // Fewer
const NUKE_EXPLOSION_DURATION_MULTIPLIER = 1.0; // Normal speed
// Removed NUKE_INDICATOR_PULSE_DURATION
// Removed DAMPENER_PULSE_SPEED, DAMPENER_PULSE_AMOUNT

// --- Three.js Setup ---
let scene, camera, renderer, controls; // Removed composer
let gameBoardGroup;
let floorMeshes = []; // 2D array: [y][x] -> mesh or null
let wallMeshes = [];
let powerupMeshes = []; // {mesh, pos}
let playerMesh, aiMesh;
// Removed playerHeartsGroup, aiHeartsGroup
let activeHighlights = [];
let activeProjectiles = []; // {mesh?, trail?}
let nukeIndicatorMeshes = []; // {mesh} - Removed tween
let dampenerFloorMeshes = []; // Keep track BUT NO ANIMATION

// --- PROTOTYPE Materials (Basic) ---
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
const dampenerMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaff }); // Light blue tint
const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Bright Green
const aiMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Bright Red
// Removed heartMaterial
const powerupMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright Yellow
const moveHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4 });
const pathHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.5 });
const invalidPathHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
const hitHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
const nukeIndicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.6, side: THREE.DoubleSide }); // Static orange

// Missile/Explosion Materials (Basic)
const playerMissileCoreMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Cyan
const aiMissileCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xff8888 }); // Light Red
const missileTrailMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0.7, sizeAttenuation: true, depthWrite: false });
const explosionShockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffccaa, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }); // Simple expand/fade sphere
const explosionParticleMaterial = new THREE.PointsMaterial({ color: 0xff8844, size: 0.3, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false, vertexColors: false }); // Basic orange points
const nukeExplosionBaseColor = new THREE.Color(0xff5500); // Still used for explosion color

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State (Unchanged) ---
let grid = []; // Contains "floor", "wall", or "dampener"
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerFuel = INITIAL_FUEL;
let aiFuel = INITIAL_FUEL;
let playerHealth = INITIAL_HEALTH;
let aiHealth = INITIAL_HEALTH;
let powerUpPositions = []; // {x, y}
let pendingNukeLocations = []; // {x, y} for next round's nukes
let gamePhase = "playerTurn";
let currentPlayer = "player";
let currentPlanningMode = "move";
let plannedShootPath = null;
let plannedShootCost = 0;
let currentHoverPos = null;
let gameOverState = null;
let isResolving = false;

// --- Initialization ---
function init() {
    console.log("Initializing PROTOTYPE Missile Game...");
    initThreeJS();
    initGameLogic();
    setupInputListeners();
    animate();
    console.log("Game Initialized (Prototype).");
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdddddd); // Light gray background
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 0.8, GRID_SIZE * CELL_3D_SIZE * 0.7);
    camera.lookAt(0, 0, 0);

    // Simple Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false }); // No anti-aliasing
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = false; // NO SHADOWS

    // Simple Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Brighter ambient
    scene.add(ambientLight);
    // Removed Directional, Hemisphere lights

    // Removed Composer and Bloom Pass

    // Controls (Keep for interaction, disable damping)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; // Less smooth
    // controls.dampingFactor = 0.1; // Removed
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = CELL_3D_SIZE * 3;
    controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.5;

    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);

    // Intersection plane (keep for input)
    const planeSize = GRID_SIZE * CELL_3D_SIZE;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2;
    intersectionPlane.position.y = -0.04;
    scene.add(intersectionPlane);

    window.addEventListener("resize", onWindowResize, false);
    onWindowResize();
}

function onWindowResize() {
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    // Removed composer.setSize
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
        gameOverState = { winner: "None", message: "Initialization Failed" };
        updatePhaseIndicator();
        return;
    }
    playerPos = startPositions.player;
    aiPos = startPositions.ai;

    playerFuel = INITIAL_FUEL;
    aiFuel = INITIAL_FUEL;
    playerHealth = INITIAL_HEALTH;
    aiHealth = INITIAL_HEALTH;
    powerUpPositions = [];
    powerupMeshes = [];
    pendingNukeLocations = [];
    dampenerFloorMeshes = []; // Reset dampener mesh list

    currentPlayer = "player";
    gamePhase = "playerTurn";
    currentPlanningMode = "move";
    plannedShootPath = null;
    plannedShootCost = 0;
    currentHoverPos = null;
    gameOverState = null;
    isResolving = false;

    createUnits3D();
    spawnInitialPowerups();
    selectNextNukeLocations();

    setMessage("Your Turn: Plan move/shoot.");
    updatePhaseIndicator();
    updateFuelInfo();
    updateHealthInfo(); // Update UI, no 3D hearts
    enablePlanningControls();
    clearHighlights();
    clearPlanningCostUI();
    controls.target.set(0, 0, 0);
    controls.update();
    setPlanningMode("move");
}

function setupInputListeners() {
    btnPlanMove.addEventListener("click", () => setPlanningMode("move"));
    btnPlanShoot.addEventListener("click", () => setPlanningMode("shoot"));
    btnReset.addEventListener("click", initGameLogic);
    canvasContainer.addEventListener("click", handleCanvasClick);
    canvasContainer.addEventListener("mousemove", handleCanvasMouseMove);
    canvasContainer.addEventListener("contextmenu", (event) => event.preventDefault());
}


// --- Grid Generation Functions (UNCHANGED) ---
function generateGrid() {
    let attempts = 0;
    while (attempts < 10) {
        grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor"));
        let wallCount = 0;
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetWallCount = Math.floor(totalCells * WALL_DENSITY) * 0.7;

        // Place Walls
        while (wallCount < targetWallCount) {
            const x = Math.floor(Math.random() * GRID_SIZE);
            const y = Math.floor(Math.random() * GRID_SIZE);
            const isNearCorner = (px, py) =>
                (px >= 0 && px <= 4 && py >= 0 && py <= 4) ||
                (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);

            if (grid[y][x] === "floor" && !isNearCorner(x, y) && Math.random() < 0.9) {
                grid[y][x] = "wall";
                wallCount++;
            } else if (grid[y][x] === "floor" && Math.random() < 0.2) {
                grid[y][x] = "wall";
                wallCount++;
            }
        }

        // Place Dampeners on remaining Floor cells
        let dampenerCount = 0;
        const floorCells = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (grid[y][x] === "floor") {
                    floorCells.push({x, y});
                }
            }
        }
        const targetDampenerCount = Math.floor(floorCells.length * DAMPENER_DENSITY);
        floorCells.sort(() => Math.random() - 0.5); // Shuffle floor cells

        for (let i = 0; i < Math.min(targetDampenerCount, floorCells.length); i++) {
            const { x, y } = floorCells[i];
            grid[y][x] = "dampener";
            dampenerCount++;
        }
        console.log(`Placed ${dampenerCount} gravity dampeners.`);


        if (isGridConnected()) {
            console.log("Generated connected grid with walls and dampeners.");
            return;
        }
        attempts++;
        console.warn(`Generated grid attempt ${attempts} was not connected, retrying...`);
    }
    console.error("Failed to generate a connected grid after multiple attempts. Using last attempt.");
    if (!isGridConnected()) {
        console.warn("WARNING: Grid may still be disconnected.");
    }
}
function isGridConnected() {
    const startNode = findFirstFloorOrDampener(); // Check connectivity for both floor types
    if (!startNode) return false;
    const q = [startNode];
    const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0;
    let totalFloorCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === "floor" || grid[y][x] === "dampener") totalFloorCount++; // Count both
        }
    }
    if (totalFloorCount === 0) return false;
    while (q.length > 0) {
        const { x, y } = q.shift();
        reachableFloorCount++;
        const neighbors = [ { x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 } ];
        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && (grid[n.y][n.x] === "floor" || grid[n.y][n.x] === "dampener") && !visited.has(key)) { // Check both
                visited.add(key);
                q.push(n);
            }
        }
    }
    return reachableFloorCount === totalFloorCount;
}
function findFirstFloorOrDampener() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === "floor" || grid[y][x] === "dampener") return { x, y };
        }
    }
    return null;
}
function findStartPositions() {
    const potentialStarts = [ { x: 2, y: 2 }, { x: GRID_SIZE - 3, y: GRID_SIZE - 3 }, { x: 2, y: GRID_SIZE - 3 }, { x: GRID_SIZE - 3, y: 2 }, ];
    const playerStart = findNearestFloorBFS(potentialStarts[0]);
    let aiStart = null;
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]];
    farCorners.sort(() => Math.random() - 0.5);
    for (const corner of farCorners) {
        const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
        if (potentialAiStart && playerStart && distance(playerStart, potentialAiStart) > GRID_SIZE * 0.7) {
            aiStart = potentialAiStart;
            break;
        }
    }
    if (!aiStart && playerStart) {
        console.warn("Could not find a far start position for AI, trying any reachable floor.");
        let candidateAIStarts = [];
        const candidateSearchPoints = [ { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, { x: GRID_SIZE - 3, y: GRID_SIZE - 3 }, { x: 2, y: GRID_SIZE - 3 }, { x: GRID_SIZE - 3, y: 2 } ];
        for (const sp of candidateSearchPoints) {
            const potentialAi = findNearestFloorBFS(sp, [playerStart]);
            if (potentialAi && distance(playerStart, potentialAi) > GRID_SIZE * 0.5) {
                candidateAIStarts.push(potentialAi);
            }
        }
        if (candidateAIStarts.length > 0) {
            candidateAIStarts.sort((a, b) => distance(playerStart, b) - distance(playerStart, a));
            aiStart = candidateAIStarts[0];
        } else {
            aiStart = findNearestFloorBFS({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, [playerStart]);
        }
    }
    if (playerStart && aiStart && (playerStart.x !== aiStart.x || playerStart.y !== aiStart.y)) {
        console.log(`Player start: ${playerStart.x},${playerStart.y}. AI start: ${aiStart.x},${aiStart.y}`);
        return { player: playerStart, ai: aiStart };
    }
    console.error("Failed to find suitable start positions even with fallbacks.");
    return null;
}
function findNearestFloorBFS(startSearchPos, occupied = []) {
    const q = [{ pos: startSearchPos, dist: 0 }];
    const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    const occupiedSet = new Set(occupied.map(occ => `${occ.x},${occ.y}`));
    while (q.length > 0) {
        q.sort((a, b) => a.dist - b.dist);
        const current = q.shift();
        const { x, y } = current.pos;
        const currentKey = `${x},${y}`;
        if (isValid(x, y) && (grid[y][x] === "floor" || grid[y][x] === "dampener") && !occupiedSet.has(currentKey)) {
            return { x, y }; // Found the nearest valid floor
        }
        const neighbors = [ { x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 } ];
        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && !visited.has(key)) {
                visited.add(key);
                if (grid[n.y][n.x] === "floor" || grid[n.y][n.x] === "dampener") {
                    q.push({ pos: n, dist: current.dist + 1 });
                }
            }
        }
    }
    console.warn(`BFS from ${startSearchPos.x},${startSearchPos.y} found no valid, unoccupied floor/dampener.`);
    return null;
}


// --- 3D Object Creation / Management Functions ---
function get3DPosition(x, y, yOffset = 0) {
    const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    return new THREE.Vector3(worldX, yOffset, worldZ);
}

function getGridCoords(position) {
    const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    return { x, y };
}

function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.isGroup) {
        mesh.children.slice().forEach(child => disposeMesh(child));
    }
    // Remove tween reference checking - no complex tweens on meshes now
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => mat.dispose()); // BasicMaterial has no maps
        } else {
            mesh.material.dispose();
        }
    }
    if (mesh.parent) {
        mesh.parent.remove(mesh);
    }
}

function clearBoard3D() {
    gameBoardGroup.children.slice().forEach(child => disposeMesh(child));
    // Removed playerHeartsGroup, aiHeartsGroup nulling
    floorMeshes = [];
    wallMeshes = [];
    powerupMeshes = [];
    dampenerFloorMeshes = [];
    playerMesh = null;
    aiMesh = null;
    activeHighlights = [];
    activeProjectiles.forEach(proj => {
        if (proj.mesh) disposeMesh(proj.mesh);
        if (proj.trail) disposeMesh(proj.trail);
    });
    activeProjectiles = [];
    clearNukeIndicators();
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    dampenerFloorMeshes = []; // Reset list
    wallMeshes = [];
    // Basic Box Geometries
    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
    const dampenerGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.18, CELL_3D_SIZE); // Slightly thinner
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);
            const cellType = grid[y][x];

            if (cellType === "floor") {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
                floorMesh.position.copy(pos);
                floorMesh.position.y = -0.1;
                // Removed shadow properties
                floorMesh.userData = { gridX: x, gridY: y, type: "floor" }; // Removed originalY
                gameBoardGroup.add(floorMesh);
                floorMeshes[y][x] = floorMesh;
            } else if (cellType === "dampener") {
                const dampenerMesh = new THREE.Mesh(dampenerGeom, dampenerMaterial); // No need to clone BasicMaterial unless changing color later
                dampenerMesh.position.copy(pos);
                dampenerMesh.position.y = -0.11;
                // Removed shadow properties
                dampenerMesh.userData = { gridX: x, gridY: y, type: "dampener" }; // Removed originalY
                gameBoardGroup.add(dampenerMesh);
                floorMeshes[y][x] = dampenerMesh;
                dampenerFloorMeshes.push(dampenerMesh); // Still track, but no animation
            } else if (cellType === "wall") {
                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
                wallMesh.position.copy(pos);
                wallMesh.position.y = WALL_HEIGHT / 2 - 0.1;
                // Removed shadow properties
                wallMesh.userData = { gridX: x, gridY: y, type: "wall" };
                gameBoardGroup.add(wallMesh);
                wallMeshes.push(wallMesh);
                floorMeshes[y][x] = null;
            }
        }
    }
}

// --- REMOVED Heart Geometry and Visuals ---
// function createHeartGeometry() { ... }
// const cachedHeartGeometry = createHeartGeometry();
// function updateHealthVisuals(health, heartsGroup) { ... }


// --- Create Units 3D (Simplified) ---
function createUnits3D() {
    // Player (Green Box)
    const playerSize = CELL_3D_SIZE * 0.6;
    const playerGeom = new THREE.BoxGeometry(playerSize, playerSize * 1.2, playerSize); // Slightly taller box
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    // Removed shadow properties
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerSize * 1.2 / 2); // Center box
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: "player" };
    gameBoardGroup.add(playerMesh);
    // Removed heart group creation

    // AI (Red Box)
    const aiSize = CELL_3D_SIZE * 0.7; // Slightly larger box
    const aiGeom = new THREE.BoxGeometry(aiSize, aiSize, aiSize); // Cube
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
    // Removed shadow properties
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiSize / 2); // Center cube
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: "ai" };
    gameBoardGroup.add(aiMesh);
    // Removed heart group creation

    updateHealthInfo(); // Update UI after creation
}

// --- Create/Remove Powerup 3D (Simplified) ---
function createPowerup3D(x, y) {
    const powerupSize = CELL_3D_SIZE * 0.4;
    const powerupGeom = new THREE.BoxGeometry(powerupSize, powerupSize, powerupSize); // Yellow Box
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
    mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7)); // Position slightly above floor
    // Removed shadow properties
    mesh.userData = { type: "powerup", gridX: x, gridY: y }; // Removed spinSpeed
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}
function removePowerup3D(x, y) {
    const meshIndex = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (meshIndex !== -1) {
        disposeMesh(powerupMeshes[meshIndex].mesh);
        powerupMeshes.splice(meshIndex, 1);
    } else { console.warn(`Could not find fuel cell mesh at ${x},${y} to remove visually.`); }
    const logicalIndex = powerUpPositions.findIndex(p => p.x === x && p.y === y);
    if (logicalIndex !== -1) { powerUpPositions.splice(logicalIndex, 1); }
    else { console.warn(`Could not find fuel cell position at ${x},${y} to remove logically.`); }
}

// --- Highlighting Functions (Adapted for Basic Materials) ---
function clearHighlights() {
    activeHighlights.forEach(mesh => disposeMesh(mesh));
    activeHighlights = [];

    // Restore original floor meshes that were replaced by highlights
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if ((grid[y][x] === 'floor' || grid[y][x] === 'dampener') && !floorMeshes[y]?.[x]) {
                const cellType = grid[y][x];
                const pos = get3DPosition(x, y);
                let originalMesh;

                if (cellType === 'floor') {
                    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
                    originalMesh = new THREE.Mesh(floorGeom, floorMaterial);
                    originalMesh.position.copy(pos);
                    originalMesh.position.y = -0.1;
                    originalMesh.userData = { gridX: x, gridY: y, type: "floor" };
                } else { // cellType === 'dampener'
                    const dampenerGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.18, CELL_3D_SIZE);
                    originalMesh = new THREE.Mesh(dampenerGeom, dampenerMaterial);
                    originalMesh.position.copy(pos);
                    originalMesh.position.y = -0.11;
                    originalMesh.userData = { gridX: x, gridY: y, type: "dampener" };
                    // No need to add back to animation list
                }
                // Removed shadow properties
                gameBoardGroup.add(originalMesh);
                floorMeshes[y][x] = originalMesh;
            }
        }
    }
}

function highlightCell(x, y, highlightMaterial) {
    const cellType = grid[y]?.[x];
    if (isValid(x, y) && (cellType === "floor" || cellType === "dampener")) {
        const existingMesh = floorMeshes[y]?.[x];
        if (existingMesh) {
            // No need to check dampener animation list
            disposeMesh(existingMesh);
            floorMeshes[y][x] = null;
        }
        const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE); // Simple box highlight
        const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial); // No clone needed for basic material? Keep clone for safety.
        highlightMesh.position.copy(get3DPosition(x, y));
        highlightMesh.position.y = -0.08;
        highlightMesh.userData = { gridX: x, gridY: y, type: "highlight" };
        gameBoardGroup.add(highlightMesh);
        activeHighlights.push(highlightMesh);
    }
}

// RenderHighlights (unchanged logic, uses new highlightCell)
function renderHighlights() {
    clearHighlights();
    clearPlanningCostUI();
    if (currentPlayer !== "player" || isResolving || gameOverState) {
        return;
    }
    if (currentPlanningMode === "move") {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));
    } else if (currentPlanningMode === "shoot") {
        if (plannedShootPath && plannedShootPath.length > 0) {
            const cost = plannedShootCost;
            const available = playerFuel;
            const canAfford = cost <= available;
            const pathMaterial = canAfford ? pathHighlightMaterial : invalidPathHighlightMaterial;
            plannedShootPath.forEach(p => {
                if (!(p.x === playerPos.x && p.y === playerPos.y)) {
                    highlightCell(p.x, p.y, pathMaterial);
                }
            });
            const target = plannedShootPath[plannedShootPath.length - 1];
            const targetMaterial = canAfford ? hitHighlightMaterial : invalidPathHighlightMaterial;
            highlightCell(target.x, target.y, targetMaterial);
            updatePlanningCostUI(cost, available);
        } else {
            clearPlanningCostUI();
        }
    }
}

// --- NUKE INDICATOR & RESOLUTION LOGIC (Simplified Visuals) ---
function createNukeIndicator3D(x, y) {
    const radius = CELL_3D_SIZE * 0.45; const height = CELL_3D_SIZE * 0.05;
    const indicatorGeom = new THREE.CylinderGeometry(radius, radius, height, 8, 1, false); // Less detailed cylinder
    const indicatorMesh = new THREE.Mesh(indicatorGeom, nukeIndicatorMaterial); // No clone needed, no pulse
    indicatorMesh.position.copy(get3DPosition(x, y, height));
    indicatorMesh.rotation.x = 0;
    indicatorMesh.userData = { type: "nuke_indicator", gridX: x, gridY: y }; // Removed tween
    gameBoardGroup.add(indicatorMesh);
    nukeIndicatorMeshes.push(indicatorMesh);
    // Removed TWEEN pulsing code
    return indicatorMesh;
}
function clearNukeIndicators() { nukeIndicatorMeshes.forEach(mesh => disposeMesh(mesh)); nukeIndicatorMeshes = []; }
function selectNextNukeLocations() {
    clearNukeIndicators(); pendingNukeLocations = [];
    let availableFloorCells = [];
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' || grid[y][x] === 'dampener') availableFloorCells.push({ x, y }); } }
    if (availableFloorCells.length === 0) return;
    for (let i = availableFloorCells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [availableFloorCells[i], availableFloorCells[j]] = [availableFloorCells[j], availableFloorCells[i]]; }
    const count = Math.min(NUKES_PER_ROUND, availableFloorCells.length);
    for (let i = 0; i < count; i++) { const targetPos = availableFloorCells[i]; pendingNukeLocations.push(targetPos); createNukeIndicator3D(targetPos.x, targetPos.y); } // Create static indicator
    console.log(`Selected ${pendingNukeLocations.length} nuke targets for next round:`, pendingNukeLocations);
}
// resolveNukeImpacts (unchanged logic, calls simplified explosion)
async function resolveNukeImpacts() {
    if (pendingNukeLocations.length === 0) return { impactedLocations: [], hitMessages: [], playerWasHit: false, aiWasHit: false };
    console.log("Resolving nuke impacts...");
    const impactPromises = []; const hitMessages = []; let playerWasHit = false; let aiWasHit = false; const destroyedFuelCells = []; const currentImpactLocations = [...pendingNukeLocations];
    clearNukeIndicators(); pendingNukeLocations = [];
    currentImpactLocations.forEach(pos => {
        const { x, y } = pos; console.log(` Nuke impacting at ${x},${y}`); const impactPosition3D = get3DPosition(x, y, CELL_3D_SIZE * 0.4);
        const explosionPromise = new Promise(resolve => {
            createExplosionEffect(impactPosition3D, nukeExplosionBaseColor, NUKE_EXPLOSION_SCALE_MULTIPLIER, NUKE_EXPLOSION_PARTICLE_MULTIPLIER, resolve, NUKE_EXPLOSION_DURATION_MULTIPLIER); // Calls simplified explosion
        });
        impactPromises.push(explosionPromise);
        if (playerPos.x === x && playerPos.y === y) { playerHealth -= NUKE_DAMAGE; playerWasHit = true; hitMessages.push(`Player caught in nuke blast at ${x},${y}!`); }
        if (aiPos.x === x && aiPos.y === y) { aiHealth -= NUKE_DAMAGE; aiWasHit = true; hitMessages.push(`AI caught in nuke blast at ${x},${y}!`); }
        if (isPowerupAt(x, y)) { removePowerup3D(x, y); destroyedFuelCells.push({ x, y }); hitMessages.push(`Fuel cell at ${x},${y} obliterated by nuke.`); }
    });
    await Promise.all(impactPromises); console.log("Nuke explosion visuals complete.");
    if (playerWasHit || aiWasHit) { updateHealthInfo(); } // Update UI health
    return { impactedLocations: currentImpactLocations, hitMessages, playerWasHit, aiWasHit };
}

// --- Missile / Explosion Visual Functions (Simplified) ---
function createGuidedMissileVisual(path, missileCoreMaterial, onImpactCallback = null) {
    if (!path || path.length < 2) return;
    const startGridPos = path[0]; const endGridPos = path[path.length - 1];
    const launchHeight = CELL_3D_SIZE * 0.5; const impactHeight = CELL_3D_SIZE * 0.2; const midHeightBoost = CELL_3D_SIZE * 0.8 * Math.min(1.0, path.length / 5); // Less arc
    const points3D = path.map((p, index) => { let yOffset = launchHeight + (impactHeight - launchHeight) * (index / (path.length - 1)); const midPointFactor = Math.sin((index / (path.length - 1)) * Math.PI); yOffset += midHeightBoost * midPointFactor; return get3DPosition(p.x, p.y, yOffset); });
    points3D[0] = get3DPosition(startGridPos.x, startGridPos.y, launchHeight); points3D[points3D.length - 1] = get3DPosition(endGridPos.x, endGridPos.y, impactHeight);
    const curve = new THREE.CatmullRomCurve3(points3D, false, "catmullrom", 0.5); // Less smooth curve

    // Simple Missile Geometry (Sphere)
    const missileRadius = CELL_3D_SIZE * 0.15;
    const missileGeom = new THREE.SphereGeometry(missileRadius, 6, 4); // Low poly sphere
    const missileMesh = new THREE.Mesh(missileGeom, missileCoreMaterial); // Basic material
    missileMesh.position.copy(curve.getPointAt(0));
    missileMesh.lookAt(curve.getPointAt(0.01)); // Still needs to look forward
    missileMesh.userData = { type: "missile_object" };
    scene.add(missileMesh); activeProjectiles.push({ mesh: missileMesh });

    // Simple Trail (Points)
    const trailGroup = new THREE.Group(); scene.add(trailGroup); activeProjectiles.push({ trail: trailGroup });
    const trailSpawnInterval = 50; let lastTrailSpawnTime = 0; const trailParticleLifetime = 300;
    const travelTween = new TWEEN.Tween({ t: 0 }).to({ t: 1 }, MISSILE_TRAVEL_DURATION).easing(TWEEN.Easing.Linear.None) // Linear Easing
        .onUpdate((obj) => {
            const currentTime = performance.now(); const currentPoint = curve.getPointAt(obj.t); const tangent = curve.getTangentAt(obj.t).normalize();
            missileMesh.position.copy(currentPoint); const lookAtPoint = currentPoint.clone().add(tangent); missileMesh.lookAt(lookAtPoint);

            // Simplified Trail Spawn
            if (currentTime - lastTrailSpawnTime > trailSpawnInterval && obj.t < 0.98) {
                lastTrailSpawnTime = currentTime;
                const particleGeom = new THREE.BufferGeometry(); // Simple point
                particleGeom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
                const particleMat = missileTrailMaterial.clone(); // Use basic points material
                particleMat.opacity = 0.6;
                const particle = new THREE.Points(particleGeom, particleMat);
                particle.position.copy(currentPoint).addScaledVector(tangent, -missileRadius * 2); // Behind missile
                trailGroup.add(particle);

                // Simple fade out
                new TWEEN.Tween(particle.material).to({ opacity: 0 }, trailParticleLifetime).easing(TWEEN.Easing.Linear.None).onComplete(() => disposeMesh(particle)).start();
            }
        })
        .onComplete(() => {
            let missileIndex = activeProjectiles.findIndex(p => p.mesh === missileMesh); if (missileIndex > -1) activeProjectiles.splice(missileIndex, 1); disposeMesh(missileMesh);
            setTimeout(() => { let trailIndex = activeProjectiles.findIndex(p => p.trail === trailGroup); if (trailIndex > -1) activeProjectiles.splice(trailIndex, 1); disposeMesh(trailGroup); }, trailParticleLifetime);
            if (onImpactCallback) onImpactCallback();
        })
        .start();
}

function createExplosionEffect(position, baseColor, scaleMultiplier = 1.0, particleMultiplier = 1.0, onCompleteCallback = null, durationMultiplier = 1.0) {
    const explosionGroup = new THREE.Group(); scene.add(explosionGroup);
    const baseExplosionScale = CELL_3D_SIZE * 1.0; // Smaller base
    const explosionScale = baseExplosionScale * scaleMultiplier;
    const baseParticleCount = 50; // Fewer base particles
    const particleCount = Math.round(baseParticleCount * particleMultiplier);
    const baseDuration = EXPLOSION_DURATION; const effectDuration = baseDuration * durationMultiplier;
    let shockwaveMesh, particleSystem; let completedComponents = 0; const totalVisualComponents = 2; // Shockwave + Particles only

    const checkCleanup = () => { completedComponents++; if (completedComponents >= totalVisualComponents) { disposeMesh(shockwaveMesh); disposeMesh(particleSystem); if (explosionGroup.parent) explosionGroup.parent.remove(explosionGroup); if (onCompleteCallback) onCompleteCallback(); } };

    // Simple Shockwave (Sphere)
    const shockwaveGeom = new THREE.SphereGeometry(explosionScale * 0.1, 8, 6); // Low poly sphere
    const shockwaveMat = explosionShockwaveMaterial.clone(); shockwaveMat.color.set(baseColor);
    shockwaveMesh = new THREE.Mesh(shockwaveGeom, shockwaveMat); shockwaveMesh.position.copy(position); explosionGroup.add(shockwaveMesh);
    new TWEEN.Tween(shockwaveMesh.scale).to({ x: explosionScale, y: explosionScale, z: explosionScale }, effectDuration * 0.6).easing(TWEEN.Easing.Linear.None).start();
    new TWEEN.Tween(shockwaveMesh.material).to({ opacity: 0 }, effectDuration * 0.7).easing(TWEEN.Easing.Linear.None).delay(effectDuration * 0.1).onComplete(checkCleanup).start();

    // Simple Particles (Points)
    const positions = new Float32Array(particleCount * 3); const velocities = [];
    // Removed color array - use material color
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0;
        const theta = Math.random() * Math.PI * 2; const phi = Math.acos(Math.random() * 2 - 1); const speed = (Math.random() * 0.6 + 0.1) * explosionScale * (1.0 + scaleMultiplier * 0.2); // Slower/less spread
        const velocity = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)).multiplyScalar(speed); velocities.push(velocity);
        // No per-particle color
    }
    const particleGeom = new THREE.BufferGeometry(); particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // Removed color attribute setting
    const particleMat = explosionParticleMaterial.clone(); // Basic points material
    particleMat.size = 0.4 * scaleMultiplier; // Slightly larger points maybe?
    particleMat.color.set(baseColor).lerp(new THREE.Color(0xffffff), 0.3); // Mix with white slightly

    particleSystem = new THREE.Points(particleGeom, particleMat); particleSystem.position.copy(position); explosionGroup.add(particleSystem);

    const particleTween = new TWEEN.Tween({ t: 0, opacity: 1.0 }).to({ t: 1, opacity: 0.0 }, effectDuration).easing(TWEEN.Easing.Linear.None) // Linear fade
        .onUpdate((obj) => {
            const posAttr = particleSystem.geometry.attributes.position;
            const easeT = obj.t; // Linear time
            for (let i = 0; i < particleCount; i++) {
                posAttr.setXYZ(i, velocities[i].x * easeT, velocities[i].y * easeT, velocities[i].z * easeT);
            }
            if (particleSystem.material) { particleSystem.material.opacity = obj.opacity; }
            if (posAttr) posAttr.needsUpdate = true;
        })
        .onComplete(checkCleanup).start();

    // Removed PointLight
}

// --- Animation Loop (Simplified) ---
let clock = new THREE.Clock();

function animate(time) {
    requestAnimationFrame(animate);
    // const delta = clock.getDelta(); // Delta not needed without complex physics/rotations
    const elapsed = clock.getElapsedTime(); // Still useful for some basic variation maybe?

    TWEEN.update(time);
    controls.update();

    // Removed powerup spinning
    // Removed heart spinning
    // Removed dampener pulsing

    renderer.render(scene, camera); // Direct render
}

// --- Input Handling Functions (Unchanged Logic) ---
function handleCanvasMouseMove(event) {
    if (currentPlayer !== "player" || isResolving || gameOverState || currentPlanningMode !== "shoot") {
        if (plannedShootPath || currentHoverPos) {
            plannedShootPath = null; plannedShootCost = 0; currentHoverPos = null;
            clearPlanningCostUI(); renderHighlights();
        } return;
    }
    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane);
    let targetPos = null;
    if (intersects.length > 0) {
        const gridPos = getGridCoords(intersects[0].point);
        if (isValid(gridPos.x, gridPos.y) && (grid[gridPos.y][gridPos.x] === "floor" || grid[gridPos.y][gridPos.x] === "dampener")) { targetPos = gridPos; }
    }
    const hoverChanged = !currentHoverPos || !targetPos || currentHoverPos.x !== targetPos.x || currentHoverPos.y !== targetPos.y;
    if (hoverChanged) {
        currentHoverPos = targetPos ? { ...targetPos } : null;
        if (targetPos && !(targetPos.x === playerPos.x && targetPos.y === playerPos.y)) {
            const result = findShortestMissilePath(playerPos, targetPos, [aiPos]); // Uses UCS pathfinding
            if (result) { plannedShootPath = result.path; plannedShootCost = result.cost; setMessage(`Target: ${targetPos.x},${targetPos.y}. Cost: ${result.cost}`); }
            else { plannedShootPath = null; plannedShootCost = 0; setMessage(`Cannot reach target ${targetPos.x},${targetPos.y}.`); }
        } else {
            plannedShootPath = null; plannedShootCost = 0; setMessage(`Your Turn (Fuel: ${playerFuel}): Hover to target.`);
        }
        renderHighlights();
    }
}
function handleCanvasClick(event) {
    if (currentPlayer !== "player" || isResolving || gameOverState) return;
    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const clickedGridPos = getGridCoords(intersects[0].point);
        if (isValid(clickedGridPos.x, clickedGridPos.y)) {
            const cellType = grid[clickedGridPos.y][clickedGridPos.x];
            const isWalkable = cellType === "floor" || cellType === "dampener";
            if (currentPlanningMode === "move") {
                if (isWalkable) { handleMoveInput(clickedGridPos.x, clickedGridPos.y); }
                else { setMessage("Invalid move: Click floor/dampener."); }
            } else if (currentPlanningMode === "shoot") {
                if (isWalkable && plannedShootPath && plannedShootPath.length > 0 && plannedShootPath[plannedShootPath.length - 1].x === clickedGridPos.x && plannedShootPath[plannedShootPath.length - 1].y === clickedGridPos.y) {
                    const cost = plannedShootCost;
                    if (cost <= playerFuel) { const action = { type: "shoot", target: clickedGridPos, _path: plannedShootPath, _cost: cost }; executeAction(action); }
                    else { setMessage(`Need ${cost} fuel, have ${playerFuel}.`); }
                } else if (isWalkable) { setMessage("Invalid target. Hover first."); }
                else { setMessage("Invalid click: Target floor/dampener."); }
            }
        } else { setMessage("Click inside grid."); }
    } else { setMessage("Click inside grid area."); }
}
function updateMouseCoords(event) {
    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// --- UI Update Functions ---
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() {
    let phaseText = "Unknown";
    if (gameOverState) { phaseText = `Game Over! ${gameOverState.message}`; }
    else if (isResolving) { phaseText = `Executing ${currentPlayer}'s Action...`; }
    else if (currentPlayer === "player") { phaseText = "Your Turn"; }
    else if (currentPlayer === "ai") { phaseText = "AI Turn"; }
    phaseIndicator.textContent = "Phase: " + phaseText; // Simpler text
}
function updateFuelInfo() { playerFuelInfo.textContent = `Player Fuel: ${playerFuel}`; aiFuelInfo.textContent = `AI Fuel: ${aiFuel}`; }
function updateHealthInfo() {
    playerHealthInfo.textContent = `Player Health: ${playerHealth} / ${INITIAL_HEALTH}`;
    aiHealthInfo.textContent = `AI Health: ${aiHealth} / ${INITIAL_HEALTH}`;
    // Removed updateHealthVisuals calls
}
function updatePlanningCostUI(cost, available) {
    if (cost > 0) {
        planFuelCostInfo.textContent = `Cost: ${cost} / ${available}`;
        planFuelCostInfo.style.color = cost <= available ? 'green' : 'red'; // Simpler colors
        planFuelCostInfo.style.fontWeight = 'bold';
    } else { planFuelCostInfo.textContent = ''; planFuelCostInfo.style.fontWeight = 'normal'; }
}
function clearPlanningCostUI() { planFuelCostInfo.textContent = ''; planFuelCostInfo.style.fontWeight = 'normal'; }
function enablePlanningControls() {
    if (gameOverState || isResolving || currentPlayer !== 'player') return;
    btnPlanMove.disabled = false; btnPlanShoot.disabled = false;
    renderHighlights();
}
function disablePlanningControls() {
    btnPlanMove.disabled = true; btnPlanShoot.disabled = true;
    plannedShootPath = null; plannedShootCost = 0; currentHoverPos = null;
    clearHighlights(); clearPlanningCostUI();
}


// --- Planning Phase Logic Functions (Player Only - Unchanged Logic) ---
function setPlanningMode(mode) {
    if (currentPlayer !== "player" || isResolving || gameOverState) return;
    currentPlanningMode = mode;
    plannedShootPath = null; plannedShootCost = 0; currentHoverPos = null;
    clearPlanningCostUI();
    btnPlanMove.classList.toggle("active", mode === "move"); btnPlanShoot.classList.toggle("active", mode === "shoot");
    if (mode === "move") { setMessage("Click adjacent floor/dampener to move."); }
    else if (mode === "shoot") { setMessage(`Hover floor/dampener to target missile (Fuel: ${playerFuel}).`); }
    renderHighlights();
}
function handleMoveInput(targetX, targetY) {
    if (currentPlayer !== "player" || currentPlanningMode !== "move" || isResolving || gameOverState) return;
    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidTarget = validMoves.some(move => move.x === targetX && move.y === targetY);
    if (isValidTarget) {
        const action = { type: "move", target: { x: targetX, y: targetY } };
        executeAction(action);
    } else {
        setMessage("Invalid move. Click highlighted adjacent.");
    }
}

// --- Pathfinding Logic (UCS - UNCHANGED LOGIC, CRITICAL FOR GAMEPLAY) ---
function findShortestMissilePath(startPos, targetPos, opponentBlockers = []) {
    const priorityQueue = []; const startState = { pos: startPos, path: [startPos], cost: 0 };
    priorityQueue.push([0, startState]);
    const minCostToCell = { [`${startPos.x},${startPos.y}`]: 0 };
    const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`));
    while (priorityQueue.length > 0) {
        priorityQueue.sort((a, b) => a[0] - b[0]);
        const [currentCost, currentState] = priorityQueue.shift();
        const currentCellKey = `${currentState.pos.x},${currentState.pos.y}`;
        if (currentCost > (minCostToCell[currentCellKey] ?? Infinity)) { continue; }
        if (currentState.pos.x === targetPos.x && currentState.pos.y === targetPos.y) { return { path: currentState.path, cost: currentState.cost }; }
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const moveDir of directions) {
            const neighborPos = { x: currentState.pos.x + moveDir.dx, y: currentState.pos.y + moveDir.dy };
            if (!isValid(neighborPos.x, neighborPos.y) || isWall(neighborPos.x, neighborPos.y)) { continue; }
            const neighborKey = `${neighborPos.x},${neighborPos.y}`;
            if (blockerSet.has(neighborKey) && (neighborPos.x !== targetPos.x || neighborPos.y !== targetPos.y)) { continue; }
            const cellType = grid[neighborPos.y][neighborPos.x];
            let stepCost = BASE_MOVE_COST; if (cellType === "dampener") { stepCost = DAMPENER_MOVE_COST; }
            const newCost = currentCost + stepCost;
            if (newCost < (minCostToCell[neighborKey] ?? Infinity)) {
                minCostToCell[neighborKey] = newCost; const newState = { pos: neighborPos, path: [...currentState.path, neighborPos], cost: newCost };
                priorityQueue.push([newCost, newState]);
            }
        }
    }
    return null; // Target not reachable
}


// --- AI Logic (UNCHANGED LOGIC - Uses updated pathfinding) ---
function findBestActionUCSBased() {
    const startTime = performance.now();
    let lethalShotAction = null;
    if (playerHealth <= 1) {
        const shootPathResult = findShortestMissilePath(aiPos, playerPos, []);
        if (shootPathResult && shootPathResult.cost <= aiFuel) {
            lethalShotAction = { type: "shoot", target: playerPos, _path: shootPathResult.path, _cost: shootPathResult.cost };
            console.log(`AI: Lethal Shot. Cost: ${shootPathResult.cost}.`); const endTime = performance.now(); console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`); return lethalShotAction;
        }
    }
    let possibleShotAction = null;
    const shootPathResult = findShortestMissilePath(aiPos, playerPos, []);
    if (shootPathResult && shootPathResult.cost <= aiFuel) { possibleShotAction = { type: "shoot", target: playerPos, _path: shootPathResult.path, _cost: shootPathResult.cost }; }
    const availableUpgrades = [...powerUpPositions];
    let shortestMovePathToUpgrade = null; let bestTargetUpgrade = null;
    availableUpgrades.sort((a, b) => distance(aiPos, a) - distance(aiPos, b));
    for (const upgradePos of availableUpgrades) {
        const upgradePath = findShortestPath_SimpleBFS(aiPos, upgradePos, [playerPos]);
        if (upgradePath && upgradePath.length > 1) {
            if (!shortestMovePathToUpgrade || upgradePath.length < shortestMovePathToUpgrade.length) { shortestMovePathToUpgrade = upgradePath; bestTargetUpgrade = upgradePos; }
        }
    }
    if (shortestMovePathToUpgrade && (aiFuel < 5 || !possibleShotAction || aiFuel < (possibleShotAction?._cost ?? Infinity) + FUEL_PER_UPGRADE)) {
        const nextStep = shortestMovePathToUpgrade[1]; console.log(`AI: Move to fuel @ ${bestTargetUpgrade.x},${bestTargetUpgrade.y}. Step: ${nextStep.x},${nextStep.y}`); const endTime = performance.now(); console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`); return { type: "move", target: nextStep };
    }
    if (possibleShotAction) {
        console.log(`AI: Shooting (Cost: ${possibleShotAction._cost}).`); const endTime = performance.now(); console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`); return possibleShotAction;
    }
    if (shortestMovePathToUpgrade) {
        const nextStep = shortestMovePathToUpgrade[1]; console.log(`AI (Fallback): Move to fuel @ ${bestTargetUpgrade.x},${bestTargetUpgrade.y}. Step: ${nextStep.x},${nextStep.y}`); const endTime = performance.now(); console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`); return { type: "move", target: nextStep };
    }
    console.log("AI: Staying put."); const endTime = performance.now(); console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`); return { type: "stay" };
}
// Simple BFS (Unchanged)
function findShortestPath_SimpleBFS(startPos, targetPos, opponentBlockers = []) {
    const q = [{ pos: startPos, path: [startPos] }]; const visited = new Set([`${startPos.x},${startPos.y}`]); const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`));
    while (q.length > 0) {
        const { pos, path } = q.shift(); if (pos.x === targetPos.x && pos.y === targetPos.y) return path;
        const neighbors = getValidMoves(pos, { x: -1, y: -1 });
        for (const neighbor of neighbors) { const key = `${neighbor.x},${neighbor.y}`; if (!visited.has(key) && !(blockerSet.has(key) && (neighbor.x !== targetPos.x || neighbor.y !== targetPos.y))) { visited.add(key); q.push({ pos: neighbor, path: [...path, neighbor] }); } }
    } return null;
}


// --- AI Trigger (Unchanged) ---
function triggerAiTurn() {
    disablePlanningControls();
    setTimeout(() => {
        if (gameOverState) return;
        const aiAction = findBestActionUCSBased();
        if (!aiAction) { console.error("AI failed to find ANY action!"); executeAction({ type: "stay" }); return; }
        executeAction(aiAction);
    }, AI_THINK_DELAY);
}

// --- Action Execution & Turn Management (Unchanged Logic, Calls Simplified Visuals) ---
async function executeAction(action) {
    if (isResolving || gameOverState) return;
    console.log(`Executing ${currentPlayer}'s action:`, action);
    isResolving = true; disablePlanningControls(); updatePhaseIndicator();
    const activePlayer = currentPlayer;
    let actionSuccess = true; let wasHit = false; let hitPlayer = null; let collectedPowerup = false; let actionMessageLog = [];
    const activePlayerMesh = activePlayer === "player" ? playerMesh : aiMesh;
    const activePlayerPosRef = activePlayer === "player" ? playerPos : aiPos;
    const opponentPos = activePlayer === "player" ? aiPos : playerPos;
    const missileCoreMaterial = activePlayer === "player" ? playerMissileCoreMaterial : aiMissileCoreMaterial;

    if (action.type === "move") {
        if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) {
            actionMessageLog.push(`${activePlayer.toUpperCase()} move blocked!`); actionSuccess = false; await wait(ACTION_RESOLVE_DELAY);
        } else {
            await animateMove(activePlayerMesh, action.target); // Calls simplified move animation
            activePlayerPosRef.x = action.target.x; activePlayerPosRef.y = action.target.y;
            actionMessageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`);
            const powerupIndex = powerUpPositions.findIndex(p => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y);
            if (powerupIndex !== -1) {
                collectedPowerup = true; const collectedPos = powerUpPositions[powerupIndex]; removePowerup3D(collectedPos.x, collectedPos.y);
                if (activePlayer === "player") { playerFuel += FUEL_PER_UPGRADE; actionMessageLog.push(`Got fuel! (+${FUEL_PER_UPGRADE} Fuel=${playerFuel})`); }
                else { aiFuel += FUEL_PER_UPGRADE; actionMessageLog.push(`Got fuel! (+${FUEL_PER_UPGRADE} Fuel=${aiFuel})`); }
                updateFuelInfo();
            }
        }
    } else if (action.type === "shoot") {
        const path = action._path; const cost = action._cost; let currentFuel = activePlayer === "player" ? playerFuel : aiFuel;
        if (path && path.length > 1 && cost <= currentFuel) {
            if (activePlayer === "player") playerFuel -= cost; else aiFuel -= cost;
            updateFuelInfo(); actionMessageLog.push(`${activePlayer.toUpperCase()} missile launch (Cost: ${cost}).`);
            const targetPos = path[path.length - 1]; let explosionCompletePromise = null;
            await new Promise(resolveMissileImpact => { createGuidedMissileVisual(path, missileCoreMaterial, resolveMissileImpact); }); // Simplified visual
            const targetX = targetPos.x; const targetY = targetPos.y;
            if (isPowerupAt(targetX, targetY)) {
                actionMessageLog.push(`Missile hit fuel cell at ${targetX},${targetY}!`);
                explosionCompletePromise = triggerFuelChainExplosion(targetX, targetY); // Simplified explosions internally
                const destroyedCoords = await explosionCompletePromise;
                if (destroyedCoords.length > 0) { actionMessageLog.push(`Chain reaction destroyed ${destroyedCoords.length} fuel cell(s).`); }
                wasHit = false;
            } else {
                const impactPosition3D = get3DPosition(targetX, targetY, CELL_3D_SIZE * 0.1); // Lower impact point
                explosionCompletePromise = new Promise(resolveExplosion => { createExplosionEffect(impactPosition3D, missileCoreMaterial.color, 1.0, 1.0, resolveExplosion); }); // Simplified explosion
                if (targetX === opponentPos.x && targetY === opponentPos.y) { wasHit = true; hitPlayer = activePlayer === "player" ? "ai" : "player"; actionMessageLog.push(`${hitPlayer.toUpperCase()} HIT!`); }
                else { actionMessageLog.push(`Missile hit floor at ${targetX},${targetY}.`); }
                await explosionCompletePromise;
            }
            updateFuelInfo();
        } else { actionMessageLog.push(`${activePlayer.toUpperCase()} missile fizzled!`); actionSuccess = false; wasHit = false; await wait(ACTION_RESOLVE_DELAY); }
    } else if (action.type === "stay") { actionMessageLog.push(`${activePlayer.toUpperCase()} waits.`); await wait(ACTION_RESOLVE_DELAY); }

    if (wasHit && hitPlayer) {
        if (hitPlayer === 'player') playerHealth--; else aiHealth--;
        actionMessageLog.push(`${hitPlayer.toUpperCase()} health ${hitPlayer === 'player' ? playerHealth : aiHealth}.`);
        updateHealthInfo(); // Update UI health
        if (playerHealth <= 0) { setMessage(actionMessageLog.join(" ")); endGame("AI Wins!", "ai"); return; }
        else if (aiHealth <= 0) { setMessage(actionMessageLog.join(" ")); endGame("Player Wins!", "player"); return; }
    }
    setMessage(actionMessageLog.join(" "));

    let nukeMessages = [];
    if (!gameOverState && activePlayer === 'ai') { // Nukes resolve after AI turn
        setMessage("Nuke Impact..."); updatePhaseIndicator(); await wait(ACTION_RESOLVE_DELAY);
        const nukeResult = await resolveNukeImpacts(); // Calls simplified explosion visuals
        if (nukeResult && nukeResult.hitMessages.length > 0) {
            nukeMessages = nukeResult.hitMessages; setMessage(nukeMessages.join(" ")); await wait(ACTION_RESOLVE_DELAY * 1.5);
        } else { await wait(ACTION_RESOLVE_DELAY / 2); }
        if (playerHealth <= 0) { endGame("Player nuked! AI Wins!", "ai"); return; }
        if (aiHealth <= 0) { endGame("AI nuked! Player Wins!", "player"); return; }
    }

    if (!gameOverState) {
        currentPlayer = activePlayer === "player" ? "ai" : "player"; gamePhase = currentPlayer + "Turn";
        if (activePlayer === 'ai') { // Spawn powerup & select nukes AFTER AI turn resolves
             spawnRandomPowerup();
             selectNextNukeLocations(); // Show indicators for player's turn
        }
        isResolving = false;
        await wait(ACTION_RESOLVE_DELAY / 2);
        if (currentPlayer === "ai") { setMessage("AI thinking..."); updatePhaseIndicator(); triggerAiTurn(); }
        else { setMessage("Your Turn. Nuke indicators active!"); updatePhaseIndicator(); enablePlanningControls(); setPlanningMode("move"); }
    } else { isResolving = false; }
}

// --- Fuel Cell Explosion Logic (Unchanged Logic, Calls Simplified Explosion) ---
async function triggerFuelChainExplosion(startX, startY) {
    const explosionQueue = [{ x: startX, y: startY }]; const explodedThisTurn = new Set([`${startX},${startY}`]); const destroyedThisTurn = new Set(); const visualCompletionPromises = [];
    while (explosionQueue.length > 0) {
        const { x: currentX, y: currentY } = explosionQueue.shift(); const currentKey = `${currentX},${currentY}`;
        if (!isPowerupAt(currentX, currentY) || destroyedThisTurn.has(currentKey)) continue;
        destroyedThisTurn.add(currentKey); const pos3D = get3DPosition(currentX, currentY, CELL_3D_SIZE * 0.1); // Lower explosion point
        const visualPromise = new Promise(resolve => { createExplosionEffect(pos3D, powerupMaterial.color, FUEL_EXPLOSION_SCALE_MULTIPLIER, FUEL_EXPLOSION_PARTICLE_MULTIPLIER, resolve); }); // Simplified explosion
        visualCompletionPromises.push(visualPromise);
        for (let dx = -FUEL_EXPLOSION_RADIUS; dx <= FUEL_EXPLOSION_RADIUS; dx++) { for (let dy = -FUEL_EXPLOSION_RADIUS; dy <= FUEL_EXPLOSION_RADIUS; dy++) { if (Math.abs(dx) + Math.abs(dy) > FUEL_EXPLOSION_RADIUS || (dx === 0 && dy === 0)) continue; const nearbyX = currentX + dx; const nearbyY = currentY + dy; const nearbyKey = `${nearbyX},${nearbyY}`; if (isValid(nearbyX, nearbyY) && isPowerupAt(nearbyX, nearbyY) && !destroyedThisTurn.has(nearbyKey)) { destroyedThisTurn.add(nearbyKey); } } } // Mark nearby for destruction? Check this logic - seems okay, it marks them but doesn't add to queue unless adjacent below
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const dir of directions) { const adjX = currentX + dir.dx; const adjY = currentY + dir.dy; const adjKey = `${adjX},${adjY}`; if (isValid(adjX, adjY) && isPowerupAt(adjX, adjY) && !explodedThisTurn.has(adjKey)) { explodedThisTurn.add(adjKey); explosionQueue.push({ x: adjX, y: adjY }); } }
    }
    await Promise.all(visualCompletionPromises);
    const destroyedCoordsList = []; destroyedThisTurn.forEach(key => { const [x, y] = key.split(',').map(Number); if (isPowerupAt(x, y)) { removePowerup3D(x, y); destroyedCoordsList.push({ x, y }); } }); // Remove AFTER visuals
    console.log(`Fuel chain reaction: Destroyed ${destroyedCoordsList.length}`);
    return destroyedCoordsList;
}


// --- Animate Move Function (Simplified Easing) ---
function animateMove(mesh, targetGridPos) {
    return new Promise((resolve) => {
        const startPos3D = mesh.position.clone();
        // Get target Y based on the *new* simple box geometries
        const meshHeight = mesh.geometry.parameters.height; // Get height from BoxGeometry
        const targetY = meshHeight / 2; // Center of the box vertically
        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);
        const hopHeight = CELL_3D_SIZE * 0.15; // Less hop
        const midPos3D = new THREE.Vector3((startPos3D.x + targetPos3D.x) / 2, Math.max(startPos3D.y, targetPos3D.y) + hopHeight, (startPos3D.z + targetPos3D.z) / 2);

        // Use Linear easing for a less smooth, more direct move
        new TWEEN.Tween(startPos3D).to(midPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Linear.None)
            .onUpdate(() => { mesh.position.copy(startPos3D); })
            .onComplete(() => {
                new TWEEN.Tween(startPos3D).to(targetPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Linear.None)
                    .onUpdate(() => { mesh.position.copy(startPos3D); })
                    .onComplete(resolve).start();
            }).start();
    });
}

// --- Utility Wait Function (Unchanged) ---
function wait(duration) { return new Promise(resolve => setTimeout(resolve, duration)); }


// --- Powerup Logic Functions (Unchanged Logic) ---
function spawnInitialPowerups() {
    powerupMeshes.forEach(p => disposeMesh(p.mesh)); powerupMeshes = []; powerUpPositions = [];
    let availableCells = [];
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' || grid[y][x] === 'dampener') { if (!(x === playerPos.x && y === playerPos.y) && !(x === aiPos.x && y === aiPos.y)) availableCells.push({ x, y }); } } }
    if (availableCells.length < INITIAL_POWERUP_COUNT) { console.warn(`Only ${availableCells.length} cells for ${INITIAL_POWERUP_COUNT} powerups.`); availableCells.forEach(cell => { powerUpPositions.push({ x: cell.x, y: cell.y }); const np = createPowerup3D(cell.x, cell.y); if (np) powerupMeshes.push(np); }); return; }
    let weightedCells = availableCells.map(cell => { const distPlayer = Math.max(1, distance(cell, playerPos)); const distAi = Math.max(1, distance(cell, aiPos)); const ratio = distAi / distPlayer; const diff = Math.abs(ratio - AI_DISTANCE_BIAS); const weight = 0.01 + 1 / (1 + diff * diff * 10); return { cell, weight }; }).filter(wc => wc.weight > 0);
    let totalWeight = weightedCells.reduce((sum, wc) => sum + wc.weight, 0); let spawnedCount = 0; const maxSpawnAttempts = availableCells.length * 3; let attempts = 0;
    while (spawnedCount < INITIAL_POWERUP_COUNT && weightedCells.length > 0 && attempts < maxSpawnAttempts) {
        attempts++; if (totalWeight <= 0) break; let randomVal = Math.random() * totalWeight; let chosenIndex = -1;
        for (let i = 0; i < weightedCells.length; i++) { randomVal -= weightedCells[i].weight; if (randomVal <= 0) { chosenIndex = i; break; } }
        if (chosenIndex === -1 && weightedCells.length > 0) chosenIndex = weightedCells.length - 1;
        if (chosenIndex !== -1 && chosenIndex < weightedCells.length) { const { cell } = weightedCells[chosenIndex]; powerUpPositions.push({ x: cell.x, y: cell.y }); const np = createPowerup3D(cell.x, cell.y); if (np) powerupMeshes.push(np); spawnedCount++; totalWeight -= weightedCells[chosenIndex].weight; weightedCells.splice(chosenIndex, 1); }
        else { console.error("Error during weighted sampling."); break; }
    }
    if (spawnedCount < INITIAL_POWERUP_COUNT) { console.warn(`Only spawned ${spawnedCount}/${INITIAL_POWERUP_COUNT} powerups.`); } else { console.log(`Spawned ${spawnedCount} initial powerups.`); }
}
function spawnRandomPowerup() {
    if (powerUpPositions.length >= MAX_POWERUPS) return;
    let emptyCells = [];
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' || grid[y][x] === 'dampener') { if (!(x === playerPos.x && y === playerPos.y) && !(x === aiPos.x && y === aiPos.y) && !isPowerupAt(x, y)) emptyCells.push({ x, y }); } } }
    if (emptyCells.length > 0) {
        const spawnPos = emptyCells[Math.floor(Math.random() * emptyCells.length)]; console.log(`Spawning fuel at ${spawnPos.x}, ${spawnPos.y}`);
        powerUpPositions.push({ x: spawnPos.x, y: spawnPos.y }); const np = createPowerup3D(spawnPos.x, spawnPos.y); if (np) powerupMeshes.push(np);
    } else { console.log("No empty cells for powerup."); }
}


// --- Game Over Function (Unchanged) ---
function endGame(message, winner) {
    console.log("Game Over:", message);
    gamePhase = "gameOver"; gameOverState = { winner: winner, message: message };
    setMessage(message); updatePhaseIndicator(); disablePlanningControls(); clearNukeIndicators();
    isResolving = false;
}


// --- Utility Functions (Unchanged Logic) ---
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === "wall"; }
function isPowerupAt(x, y) { return powerUpPositions.some(p => p.x === x && p.y === y); }
function getValidMoves(unitPos, opponentPosToBlock) {
    const moves = [];
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach(dir => {
        const nextX = unitPos.x + dir.dx; const nextY = unitPos.y + dir.dy;
        if (isValid(nextX, nextY) && grid[nextY][nextX] !== "wall" && !(nextX === opponentPosToBlock?.x && nextY === opponentPosToBlock?.y)) {
            moves.push({ x: nextX, y: nextY });
        }
    });
    return moves;
}
function distance(pos1, pos2) { return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y); }
function findNearestPowerup(pos, powerupList = powerUpPositions) {
    let minDist = Infinity; let nearest = null;
    powerupList.forEach(p => { const d = distance(pos, p); if (d < minDist) { minDist = d; nearest = p; } });
    return nearest;
}


// --- Start Game ---
init();