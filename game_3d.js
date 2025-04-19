import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from "@tweenjs/tween.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// --- DOM Elements ---
const canvasContainer = document.getElementById("gameCanvasContainer");
const canvas = document.getElementById("threeCanvas");
const btnPlanMove = document.getElementById("btnPlanMove");
const btnPlanShoot = document.getElementById("btnPlanShoot");
const btnReset = document.getElementById("btnReset");
const phaseIndicator = document.getElementById("phaseIndicator");
const messageArea = document.getElementById("messageArea");
// --- MODIFIED IDs ---
const playerFuelInfo = document.getElementById("playerFuelInfo");
const aiFuelInfo = document.getElementById("aiFuelInfo");
const planFuelCostInfo = document.getElementById("planFuelCostInfo");
// --- END MODIFIED IDs ---

// --- Game Constants ---
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
// --- REMOVED: const MAX_WEAPON_LEVEL = 5; ---
// --- ADDED/MODIFIED Constants ---
const INITIAL_FUEL = 10; // Starting fuel
const FUEL_PER_UPGRADE = 5; // Fuel gained from powerup (now fuel cell)
const INITIAL_POWERUP_COUNT = 8; // Renamed Powerups to Fuel Cells conceptually
const AI_DISTANCE_BIAS = 0.95; // For fuel cell spawn weighting
// --- END ADDED/MODIFIED Constants ---

// Timing Constants
// --- MODIFIED/ADDED Timing ---
const MISSILE_TRAVEL_DURATION = 800; // Time for missile visual
const MOVEMENT_DURATION = 400;
const AI_THINK_DELAY = 50;
const ACTION_RESOLVE_DELAY = 200;
// --- END MODIFIED/ADDED Timing ---

// --- REMOVED: AI_MAX_SEGMENT_EVAL_POINTS ---

// --- Three.js Setup ---
let scene, camera, renderer, controls, composer;
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = []; // Conceptually "fuelCellMeshes" now
let playerMesh, aiMesh;
// --- RENAMED Visual Indicators ---
let playerFuelIndicator, aiFuelIndicator;
// --- END RENAMED ---
let activeHighlights = [];
let activeProjectiles = []; // Renamed from activeLasers

// Materials (Keep materials, laser materials will be used for missile visuals)
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9, metalness: 0.2, receiveShadow: true, flatShading: true });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.7, metalness: 0.3, emissive: 0x101010, emissiveIntensity: 0.1, flatShading: true, castShadow: true, receiveShadow: true });
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, roughness: 0.4, metalness: 0.5, emissive: 0x003a7f, emissiveIntensity: 0.5, castShadow: true });
const aiMaterial = new THREE.MeshStandardMaterial({ color: 0xdc3545, roughness: 0.4, metalness: 0.5, emissive: 0x6b1a22, emissiveIntensity: 0.5, castShadow: true });
const powerupMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0xffc107, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.8, castShadow: true }); // Fuel Cell Material
const moveHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, emissive: 0x00ff00, emissiveIntensity: 0.2 });
const pathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.5, emissive: 0xffa500, emissiveIntensity: 0.3 });
const invalidPathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, emissive: 0x444444, emissiveIntensity: 0.1 });
const hitHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, emissive: 0xff0000, emissiveIntensity: 0.5 });
const playerMissileMaterial = new THREE.MeshStandardMaterial({ color: 0x00bfff, emissive: 0x00bfff, emissiveIntensity: 5.0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }); // Reused laser mat
const aiMissileMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xff6a6a, emissiveIntensity: 5.0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }); // Reused laser mat

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
// --- RENAMED State Vars ---
let playerFuel = INITIAL_FUEL;
let aiFuel = INITIAL_FUEL;
// --- END RENAMED ---
let powerUpPositions = []; // Conceptually "fuelCellPositions"
let gamePhase = "playerTurn";
let currentPlayer = "player";
let currentPlanningMode = "move";
// --- REMOVED/ADDED State Vars ---
// let hoverPos = null; // Less relevant now
// let hoverPath = []; // Replaced by plannedShootPath
// let hoverPathIsValid = false;
// let partialShootPlan = null; // Removed
let plannedShootPath = null; // Store calculated path during player hover
let plannedShootCost = 0;   // Store cost during player hover
// --- END REMOVED/ADDED ---
let gameOverState = null;
let isResolving = false;

// --- Initialization ---
function init() {
    console.log("Initializing 3D Missile Game...");
    initThreeJS();
    initGameLogic();
    setupInputListeners();
    animate();
    console.log("Game Initialized.");
}
function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1113);
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 0.8, GRID_SIZE * CELL_3D_SIZE * 0.7);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(canvasContainer.clientWidth, canvasContainer.clientHeight), 1.0, 0.4, 0.85);
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
        gameOverState = { winner: "None", message: "Initialization Failed" };
        updatePhaseIndicator();
        return;
    }
    playerPos = startPositions.player;
    aiPos = startPositions.ai;
    // --- MODIFIED Initial State ---
    playerFuel = INITIAL_FUEL;
    aiFuel = INITIAL_FUEL;
    // --- END MODIFIED ---
    powerUpPositions = []; // Fuel Cell positions
    powerupMeshes = []; // Fuel Cell meshes
    currentPlayer = "player";
    gamePhase = "playerTurn";
    currentPlanningMode = "move";
    // --- MODIFIED Initial State ---
    // hoverPos = null;
    plannedShootPath = null;
    plannedShootCost = 0;
    // partialShootPlan = null;
    // --- END MODIFIED ---
    gameOverState = null;
    isResolving = false;
    createUnits3D();
    spawnInitialPowerups(); // Spawns "Fuel Cells"
    setMessage("Your Turn: Plan your move or missile shot.");
    updatePhaseIndicator();
    // --- MODIFIED UI Call ---
    updateFuelInfo();
    // --- END MODIFIED ---
    enablePlanningControls();
    clearHighlights();
    clearPlanningCostUI(); // Clear cost display
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
}

// --- Grid Generation Functions --- (Unchanged - logic is fine)
function generateGrid() {
    let attempts = 0;
    while (attempts < 10) {
        grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor"));
        let wallCount = 0;
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetWallCount = Math.floor(totalCells * WALL_DENSITY);
        while (wallCount < targetWallCount) {
            const x = Math.floor(Math.random() * GRID_SIZE);
            const y = Math.floor(Math.random() * GRID_SIZE);
            const isNearCorner = (px, py) => (px >= 0 && px <= 4 && py >= 0 && py <= 4) || (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) || (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) || (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);
            if (grid[y][x] === "floor" && !isNearCorner(x, y) && Math.random() < 0.9) { grid[y][x] = "wall"; wallCount++; }
            else if (grid[y][x] === "floor" && Math.random() < 0.2) { grid[y][x] = "wall"; wallCount++; }
        }
        if (isGridConnected()) { console.log("Generated connected grid."); return; }
        attempts++;
        console.warn(`Generated grid attempt ${attempts} was not connected or valid. Retrying...`);
    }
    console.error("Failed to generate a valid connected grid after multiple attempts.");
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor"));
    for (let i = 0; i < GRID_SIZE * GRID_SIZE * 0.1; i++) {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        if (grid[y][x] === "floor") grid[y][x] = "wall";
    }
    setMessage("Warning: Grid generation failed, using fallback.");
}
function isGridConnected() {
    const startNode = findFirstFloor(); if (!startNode) return false;
    const q = [startNode]; const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0; let totalFloorCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === "floor") totalFloorCount++; } }
    if (totalFloorCount === 0) return false;
    while (q.length > 0) {
        const { x, y } = q.shift(); reachableFloorCount++;
        const neighbors = [{ x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 }];
        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && grid[n.y][n.x] === "floor" && !visited.has(key)) { visited.add(key); q.push(n); }
        }
    } return reachableFloorCount === totalFloorCount;
}
function findFirstFloor() { for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === "floor") return { x, y }; } } return null; }
function findStartPositions() {
    const potentialStarts = [{ x: 2, y: 2 }, { x: GRID_SIZE - 3, y: GRID_SIZE - 3 }, { x: 2, y: GRID_SIZE - 3 }, { x: GRID_SIZE - 3, y: 2 }];
    const playerStart = findNearestFloorBFS(potentialStarts[0]); let aiStart = null;
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]]; farCorners.sort(() => Math.random() - 0.5);
    for (const corner of farCorners) {
        const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
        if (potentialAiStart && playerStart && distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) { aiStart = potentialAiStart; break; }
    }
    if (!aiStart && playerStart) { console.warn("Could not find a far start position for AI, trying any reachable floor."); aiStart = findNearestFloorBFS({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, [playerStart]); }
    if (playerStart && aiStart) { console.log(`Player start: ${playerStart.x},${playerStart.y}. AI start: ${aiStart.x},${aiStart.y}`); return { player: playerStart, ai: aiStart }; }
    console.error("Failed to find suitable start positions even with fallbacks."); return null;
}
function findNearestFloorBFS(startSearchPos, occupied = []) {
    const q = [{ pos: startSearchPos, dist: 0 }]; const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]); occupied.forEach((occ) => visited.add(`${occ.x},${occ.y}`));
    while (q.length > 0) {
        const current = q.shift(); const { x, y } = current.pos;
        if (isValid(x, y) && grid[y][x] === "floor" && !occupied.some((occ) => occ.x === x && occ.y === y)) { return { x, y }; }
        const neighbors = [{ x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 }];
        for (const n of neighbors) { const key = `${n.x},${n.y}`; if (isValid(n.x, n.y) && !visited.has(key)) { visited.add(key); q.push({ pos: n, dist: current.dist + 1 }); } }
    } console.warn(`BFS from ${startSearchPos.x},${startSearchPos.y} found no valid floor.`); return null;
}

// --- 3D Object Creation / Management Functions ---
function get3DPosition(x, y, yOffset = 0) { const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE; const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE; return new THREE.Vector3(worldX, yOffset, worldZ); }
function getGridCoords(position) { const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01); const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01); return { x, y }; }
function disposeMesh(mesh) { if (!mesh) return; if (mesh.geometry) mesh.geometry.dispose(); if (mesh.material) { if (Array.isArray(mesh.material)) { mesh.material.forEach((mat) => mat.dispose()); } else { mesh.material.dispose(); } } if (mesh.parent) { mesh.parent.remove(mesh); } }
function disposeSprite(sprite) { if (!sprite) return; if (sprite.material?.map) sprite.material.map.dispose(); if (sprite.material) sprite.material.dispose(); if (sprite.parent) { sprite.parent.remove(sprite); } }
function clearBoard3D() {
    gameBoardGroup.children.slice().forEach((child) => { if (child.isMesh) { disposeMesh(child); } else if (child.isSprite) { disposeSprite(child); } });
    // --- RENAMED Indicators ---
    disposeSprite(playerFuelIndicator);
    disposeSprite(aiFuelIndicator);
    playerFuelIndicator = null;
    aiFuelIndicator = null;
    // --- END RENAMED ---
    floorMeshes = []; wallMeshes = []; powerupMeshes = []; playerMesh = null; aiMesh = null;
    activeHighlights.forEach(disposeMesh); activeHighlights = [];
    activeProjectiles.forEach(disposeMesh); activeProjectiles = []; // Use renamed array
}
function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)); wallMeshes = [];
    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);
            if (grid[y][x] === "floor") {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial); floorMesh.position.copy(pos); floorMesh.position.y = -0.1; floorMesh.castShadow = false; floorMesh.receiveShadow = true; floorMesh.userData = { gridX: x, gridY: y, type: "floor" }; gameBoardGroup.add(floorMesh); floorMeshes[y][x] = floorMesh;
            } else if (grid[y][x] === "wall") {
                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial); wallMesh.position.copy(pos); wallMesh.position.y = WALL_HEIGHT / 2; wallMesh.castShadow = true; wallMesh.receiveShadow = true; wallMesh.userData = { gridX: x, gridY: y, type: "wall" }; gameBoardGroup.add(wallMesh); wallMeshes.push(wallMesh); floorMeshes[y][x] = null;
            }
        }
    }
}
function createUnits3D() {
    const playerUnitHeight = CELL_3D_SIZE * 0.9; const playerUnitRadius = CELL_3D_SIZE * 0.3;
    const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - playerUnitRadius * 2, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial); playerMesh.castShadow = true; playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2); playerMesh.position.copy(playerPos3D); playerMesh.userData = { type: "player" }; gameBoardGroup.add(playerMesh);
    // --- MODIFIED Indicator Creation ---
    playerFuelIndicator = createFuelTextMesh(playerFuel); // Use fuel
    playerFuelIndicator.position.set(0, playerUnitHeight * 0.6, 0); playerMesh.add(playerFuelIndicator);
    // --- END MODIFIED ---
    const aiUnitHeight = CELL_3D_SIZE * 1.0; const aiUnitRadius = CELL_3D_SIZE * 0.4;
    const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial); aiMesh.castShadow = true; aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2); aiMesh.position.copy(aiPos3D); aiMesh.userData = { type: "ai" }; gameBoardGroup.add(aiMesh);
    // --- MODIFIED Indicator Creation ---
    aiFuelIndicator = createFuelTextMesh(aiFuel); // Use fuel
    aiFuelIndicator.position.set(0, aiUnitHeight * 0.6, 0); aiMesh.add(aiFuelIndicator);
    // --- END MODIFIED ---
    updateFuelVisuals(); // Call renamed function
}
// --- RENAMED Function ---
function createFuelTextMesh(fuel) { // Renamed parameter
    const canvas = document.createElement("canvas"); const context = canvas.getContext("2d"); const size = 128; const halfSize = size / 2; canvas.width = size; canvas.height = size;
    context.fillStyle = "rgba(0, 0, 0, 0.7)"; context.beginPath(); context.roundRect(0, 0, size, size, size * 0.15); context.fill();
    context.font = `Bold ${size * 0.6}px Arial`; context.fillStyle = "white"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(fuel.toString(), halfSize, halfSize + size * 0.02); // Use fuel
    const texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true; texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial); sprite.scale.set(0.1, 0.1, 1); return sprite;
}
// --- RENAMED Function ---
function updateFuelVisuals() {
    // --- MODIFIED Logic ---
    if (playerMesh && playerFuelIndicator) {
        playerMesh.remove(playerFuelIndicator); disposeSprite(playerFuelIndicator);
        playerFuelIndicator = createFuelTextMesh(playerFuel); // Use fuel
        const playerUnitHeight = CELL_3D_SIZE * 0.9;
        playerFuelIndicator.position.set(0, playerUnitHeight * 0.6, 0); playerMesh.add(playerFuelIndicator);
        // Optional: Adjust emissive based on fuel?
        playerMesh.material.emissiveIntensity = 0.5 + (playerFuel / 50); // Example scaling
    }
    if (aiMesh && aiFuelIndicator) {
        aiMesh.remove(aiFuelIndicator); disposeSprite(aiFuelIndicator);
        aiFuelIndicator = createFuelTextMesh(aiFuel); // Use fuel
        const aiUnitHeight = CELL_3D_SIZE * 1.0;
        aiFuelIndicator.position.set(0, aiUnitHeight * 0.6, 0); aiMesh.add(aiFuelIndicator);
        // Optional: Adjust emissive based on fuel?
        aiMesh.material.emissiveIntensity = 0.5 + (aiFuel / 50); // Example scaling
    }
    // --- END MODIFIED ---
}
function createPowerup3D(x, y) { // Represents a Fuel Cell now
    const powerupSize = CELL_3D_SIZE * 0.3;
    const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0);
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial); // Use powerupMaterial
    mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7));
    mesh.castShadow = true;
    mesh.userData = { type: "powerup", gridX: x, gridY: y, spinSpeed: Math.random() * 0.03 + 0.015 };
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}
function removePowerup3D(x, y) { // Removes a Fuel Cell
    const meshIndex = powerupMeshes.findIndex((p) => p.pos.x === x && p.pos.y === y);
    if (meshIndex !== -1) { const powerupObj = powerupMeshes[meshIndex]; disposeMesh(powerupObj.mesh); powerupMeshes.splice(meshIndex, 1); }
    else { console.warn(`Could not find fuel cell mesh at ${x},${y} to remove.`); }
    const logicalIndex = powerUpPositions.findIndex((p) => p.x === x && p.y === y);
    if (logicalIndex !== -1) { powerUpPositions.splice(logicalIndex, 1); }
}

// --- Highlighting Functions ---
function clearHighlights() {
    activeHighlights.forEach((mesh) => { disposeMesh(mesh); }); activeHighlights = [];
    // Restore floor meshes if they were replaced by highlights
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === "floor" && !floorMeshes[y]?.[x]) { const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE); const floorMesh = new THREE.Mesh(floorGeom, floorMaterial); floorMesh.position.copy(get3DPosition(x, y)); floorMesh.position.y = -0.1; floorMesh.castShadow = false; floorMesh.receiveShadow = true; floorMesh.userData = { gridX: x, gridY: y, type: "floor" }; gameBoardGroup.add(floorMesh); floorMeshes[y][x] = floorMesh; } } }
}
function highlightCell(x, y, highlightMaterial) {
    if (isValid(x, y) && grid[y][x] === "floor") {
        const existingMesh = floorMeshes[y]?.[x]; if (existingMesh) { disposeMesh(existingMesh); floorMeshes[y][x] = null; } // Remove floor to place highlight
        const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE); const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone());
        highlightMesh.position.copy(get3DPosition(x, y)); highlightMesh.position.y = -0.08; highlightMesh.userData = { gridX: x, gridY: y, type: "highlight" }; gameBoardGroup.add(highlightMesh); activeHighlights.push(highlightMesh);
    }
}
// --- MODIFIED Highlighting ---
function renderHighlights() {
    clearHighlights(); // Always clear first
    clearPlanningCostUI(); // Clear cost display initially

    if (currentPlayer !== "player" || isResolving || gameOverState) {
        if (activeHighlights.length > 0) clearHighlights(); // Ensure cleared on exit
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

            // Highlight the path
            plannedShootPath.forEach(p => {
                // Don't highlight the starting cell of the path
                if (!(p.x === playerPos.x && p.y === playerPos.y)) {
                    highlightCell(p.x, p.y, pathMaterial);
                }
            });

            // Highlight the target cell (AI)
            const target = plannedShootPath[plannedShootPath.length - 1];
             if(target.x === aiPos.x && target.y === aiPos.y) { // Make sure target is AI
                highlightCell(target.x, target.y, canAfford ? hitHighlightMaterial : invalidPathHighlightMaterial);
             }


            // Update UI cost display
            updatePlanningCostUI(cost, available);
        } else {
            // Optionally highlight the AI subtly to indicate it's the target?
            // highlightCell(aiPos.x, aiPos.y, someTargetIndicatorMaterial);
            clearPlanningCostUI(); // Ensure it's clear if no path
        }
    }
}
// --- END MODIFIED Highlighting ---

// --- REMOVED: createLaserBeam ---

// +++ ADDED: Missile Visual Function +++
function createMissilePathVisual(path, material) {
    if (!path || path.length < 2) return null; // Need at least start and end

    const points3D = path.map(p => get3DPosition(p.x, p.y, CELL_3D_SIZE * 0.5)); // Adjust Y offset as needed

    // Ensure start point is slightly above ground
    points3D[0].y = CELL_3D_SIZE * 0.6;
    // Ensure end point aims for center mass slightly
    points3D[points3D.length - 1].y = CELL_3D_SIZE * 0.5;

    // Create the curve (more tension makes it less loopy)
    const curve = new THREE.CatmullRomCurve3(points3D, false, 'catmullrom', 0.1); // Low tension for straighter paths

    const tubeRadius = CELL_3D_SIZE * 0.1; // Slightly thicker maybe?
    const tubeSegments = Math.max(8, path.length * 5); // More segments for smoother curve
    const radialSegments = 8;
    const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, radialSegments, false);

    const missileMesh = new THREE.Mesh(tubeGeom, material.clone()); // Use provided material
    missileMesh.material.opacity = 0; // Start invisible for fade-in/travel
    missileMesh.userData = { type: "missile" };
    scene.add(missileMesh);
    activeProjectiles.push(missileMesh); // Use renamed array

    // --- Missile Travel + Fade Effect ---
    const travelDuration = MISSILE_TRAVEL_DURATION; // Use the defined constant
    const headStart = 0.15; // How much of the path the head particle starts ahead

    // 1. Missile Body (Fades in slightly after head starts, then fades out)
    new TWEEN.Tween(missileMesh.material)
        .to({ opacity: material.opacity }, travelDuration * 0.2) // Fade in quickly
        .delay(travelDuration * headStart * 0.5) // Slight delay
        .easing(TWEEN.Easing.Quadratic.Out)
        .chain(
            new TWEEN.Tween(missileMesh.material)
            .to({ opacity: 0 }, travelDuration * 0.6) // Fade out over longer duration
            .delay(travelDuration * 0.3) // Start fade out before end
            .easing(TWEEN.Easing.Quadratic.In)
            .onComplete(() => {
                disposeMesh(missileMesh);
                const index = activeProjectiles.indexOf(missileMesh);
                if (index > -1) activeProjectiles.splice(index, 1);
            })
        ).start();


    // 2. Missile Head Particle (Travels the path)
    const particleGeom = new THREE.SphereGeometry(tubeRadius * 1.5, 8, 8);
    // Ensure the particle material uses the base emissive color, not the transparent material itself
    const particleMat = new THREE.MeshBasicMaterial({
        color: material.emissive || material.color, // Use emissive color
        blending: THREE.AdditiveBlending,
        depthTest: false, // Render on top
    });
    const particle = new THREE.Mesh(particleGeom, particleMat);
    particle.position.copy(points3D[0]); // Start at the beginning
    scene.add(particle);

    new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, travelDuration) // Travel the full duration
        .easing(TWEEN.Easing.Linear.None) // Consistent speed
        .onUpdate((obj) => {
            const point = curve.getPointAt(obj.t);
            if (point) {
                particle.position.copy(point);
            }
        })
        .onComplete(() => {
            scene.remove(particle);
            disposeMesh(particle); // Dispose particle geometry/material
        })
        .start();

    return missileMesh; // Return the main mesh if needed elsewhere
}
// +++ END ADDED Missile Visual Function +++


// --- Animation Loop --- (Unchanged)
function animate(time) {
    requestAnimationFrame(animate);
    TWEEN.update(time);
    controls.update();
    powerupMeshes.forEach((p) => { // Spin fuel cells
        if (p.mesh) { p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.015; p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5; }
    });
    composer.render();
}

// --- Input Handling Functions ---
// --- MODIFIED Mouse Move for Shoot Planning ---
function handleCanvasMouseMove(event) {
    if (currentPlayer !== 'player' || isResolving || gameOverState || currentPlanningMode !== 'shoot') {
        if (plannedShootPath) { // Clear visual planning if moving off shoot mode or not player turn
            plannedShootPath = null;
            plannedShootCost = 0;
            clearPlanningCostUI();
            renderHighlights(); // Rerender to clear highlights
        }
        return;
    }

    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    // Important: Check AI mesh FIRST, then plane
    const intersects = raycaster.intersectObjects([aiMesh, intersectionPlane], false); // Don't intersect children of aiMesh if any

    let targetPos = null;
    let hoverOnTarget = false;

    if (intersects.length > 0) {
        const firstIntersect = intersects[0].object;
        if (firstIntersect === aiMesh) {
            // Directly hovering over AI mesh
            targetPos = { ...aiPos };
            hoverOnTarget = true;
        } else if (firstIntersect === intersectionPlane) {
            // Hovering over the plane, check if it's the AI's cell
            const gridPos = getGridCoords(intersects[0].point);
            if (isValid(gridPos.x, gridPos.y) && gridPos.x === aiPos.x && gridPos.y === aiPos.y) {
                targetPos = { ...aiPos };
                hoverOnTarget = true;
            }
        }
    }

    if (hoverOnTarget) {
        // Calculate shortest path on hover IF path isn't already calculated for this target
        if (!plannedShootPath || plannedShootPath[plannedShootPath.length-1].x !== targetPos.x || plannedShootPath[plannedShootPath.length-1].y !== targetPos.y) {
             const path = findShortestPath(playerPos, targetPos, []); // Pass [] so AI tile isn't blocked for path itself
             if (path && path.length > 1) {
                 const cost = path.length - 1;
                 plannedShootPath = path;
                 plannedShootCost = cost;
                 // updatePlanningCostUI(cost, playerFuel); // Update done in renderHighlights
                 setMessage(`Target AI. Estimated Fuel Cost: ${cost}`);
             } else {
                 plannedShootPath = null; // No valid path
                 plannedShootCost = 0;
                 // updatePlanningCostUI(0, playerFuel); // Update done in renderHighlights
                 setMessage("Target AI: Path Blocked!");
             }
             renderHighlights(); // Update highlights based on new plannedShootPath
        }
        // If already hovering over target and path is calculated, do nothing to avoid recalculation
    } else {
        // Not hovering over target
        if (plannedShootPath) { // Clear if moving off target
           plannedShootPath = null;
           plannedShootCost = 0;
           // clearPlanningCostUI(); // Clearing done in renderHighlights
           renderHighlights(); // Update highlights to clear path
        }
        setMessage(`Your Turn (Fuel: ${playerFuel}): Hover over & click the AI unit to target missile.`);
    }
}
// --- END MODIFIED Mouse Move ---

// --- MODIFIED Canvas Click ---
function handleCanvasClick(event) {
    if (currentPlayer !== "player" || isResolving || gameOverState) return;

    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);

    // Prioritize clicking the AI mesh
    const intersects = raycaster.intersectObjects([aiMesh, intersectionPlane], false);

    let clickedTargetPos = null;
    if (intersects.length > 0) {
        const firstIntersect = intersects[0].object;
         if (firstIntersect === aiMesh) {
             clickedTargetPos = { ...aiPos };
         } else if (firstIntersect === intersectionPlane && currentPlanningMode === 'move') {
             // Only handle plane click for movement
             const { x, y } = getGridCoords(intersects[0].point);
             if (isValid(x, y) && grid[y][x] === 'floor') {
                 handleMoveInput(x, y);
             } else {
                 setMessage("Invalid move click: Must click on a floor tile.");
             }
             return; // Handled move or invalid move click
         } else if (firstIntersect === intersectionPlane && currentPlanningMode === 'shoot') {
             // Check if click on plane corresponds to AI grid cell
             const gridPos = getGridCoords(intersects[0].point);
              if (isValid(gridPos.x, gridPos.y) && gridPos.x === aiPos.x && gridPos.y === aiPos.y) {
                  clickedTargetPos = { ...aiPos };
              }
         }
    }

    if (currentPlanningMode === "shoot") {
        if (clickedTargetPos) {
            // Target AI clicked, re-calculate path and check fuel
            const path = findShortestPath(playerPos, clickedTargetPos, []); // Empty array - target cell is traversable
            if (path && path.length > 1) {
                const cost = path.length - 1;
                if (cost <= playerFuel) {
                    // Execute the shot
                    const action = { type: "shoot", target: clickedTargetPos, _path: path, _cost: cost };
                    executeAction(action);
                } else {
                    setMessage(`Not enough fuel! Cost: ${cost}, Available: ${playerFuel}`);
                }
            } else {
                setMessage("Target unreachable or path blocked!");
            }
        } else {
             setMessage("Invalid target: Click directly on the AI unit.");
        }
    } else if (currentPlanningMode === "move" && !clickedTargetPos) {
        // If move mode and didn't click on floor (handled above), it's an invalid click location
        setMessage("Invalid click: Must click on a valid floor tile to move.");
    }
}
// --- END MODIFIED Canvas Click ---

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
    phaseIndicator.textContent = phaseText;
}
// --- RENAMED & MODIFIED UI Function ---
function updateFuelInfo() {
    playerFuelInfo.textContent = `Your Fuel: ${playerFuel}`;
    aiFuelInfo.textContent = `AI Fuel: ${aiFuel}`;
    updateFuelVisuals(); // Call corresponding visual update
}
// --- ADDED UI Function ---
function updatePlanningCostUI(cost, available) {
    if (cost > 0) {
        planFuelCostInfo.textContent = `Est. Fuel Cost: ${cost} / Avail: ${available}`;
        planFuelCostInfo.style.color = (cost <= available) ? 'lightgreen' : 'salmon';
        planFuelCostInfo.style.fontWeight = 'bold';
    } else {
        planFuelCostInfo.textContent = ''; // Clear if no cost
        planFuelCostInfo.style.fontWeight = 'normal';
    }
}
function clearPlanningCostUI() {
    planFuelCostInfo.textContent = '';
    planFuelCostInfo.style.fontWeight = 'normal';
}
// --- END ADDED & RENAMED ---

function enablePlanningControls() {
    if (gameOverState || isResolving || currentPlayer !== "player") return;
    btnPlanMove.disabled = false; btnPlanShoot.disabled = false;
    renderHighlights();
}
function disablePlanningControls() {
    btnPlanMove.disabled = true; btnPlanShoot.disabled = true;
    // --- MODIFIED Cleanup ---
    // hoverPos = null; // Removed
    // hoverPath = []; // Removed
    // hoverPathIsValid = false; // Removed
    // partialShootPlan = null; // Removed
    plannedShootPath = null; // Clear planning path
    plannedShootCost = 0;
    clearHighlights();
    clearPlanningCostUI(); // Clear cost display
    // --- END MODIFIED ---
}

// --- Planning Phase Logic Functions (Player Only) ---
// --- MODIFIED Planning Mode ---
function setPlanningMode(mode) {
    if (currentPlayer !== "player" || isResolving || gameOverState) return;
    console.log("Setting planning mode:", mode);
    currentPlanningMode = mode;
    // --- REMOVED: partialShootPlan = null; ---
    // --- MODIFIED Cleanup ---
    // hoverPos = null; hoverPath = []; hoverPathIsValid = false;
    plannedShootPath = null; // Clear visual plan when switching modes
    plannedShootCost = 0;
    clearPlanningCostUI();
    // --- END MODIFIED ---
    btnPlanMove.classList.toggle("active", mode === "move");
    btnPlanShoot.classList.toggle("active", mode === "shoot");
    if (mode === "move") {
        setMessage("Your Turn: Click an adjacent floor cell to move.");
    } else if (mode === "shoot") {
        // --- REMOVED: partialShootPlan logic ---
        setMessage(`Your Turn (Fuel: ${playerFuel}): Hover over & click the AI unit to target missile.`);
    }
    renderHighlights();
}
// --- END MODIFIED Planning Mode ---

function handleMoveInput(targetX, targetY) {
    if (currentPlayer !== "player" || currentPlanningMode !== "move" || isResolving || gameOverState) return;
    const validMoves = getValidMoves(playerPos, aiPos); // Opponent position blocks movement
    const isValidTarget = validMoves.some((move) => move.x === targetX && move.y === targetY);
    if (isValidTarget) { const action = { type: "move", target: { x: targetX, y: targetY } }; executeAction(action); }
    else { setMessage("Invalid move target. Click a highlighted adjacent square."); }
}

// --- REMOVED: handleShootInput (Replaced by logic in handleCanvasClick) ---
// --- REMOVED: calculateShotPathSegment ---
// --- REMOVED: calculateFullPathFromTargets ---
// --- REMOVED: generatePossibleShootActions ---


// --- AI Logic (Using UCS/BFS for Pathing) ---

// Helper: Finds shortest path using BFS (cost 1 per step = fuel cost)
// IMPORTANT: opponentBlockers should be an array of positions the path CANNOT go through.
// For missile path check, pass [], so the target's square is valid.
// For unit movement path check, pass [opponentPos] so the unit cannot move onto the opponent.
function findShortestPath(startPos, targetPos, opponentBlockers = []) {
    const q = [{ pos: startPos, path: [startPos] }];
    const visited = new Set([`${startPos.x},${startPos.y}`]);
    const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`)); // Set for quick lookup

    while (q.length > 0) {
        const current = q.shift();
        const { pos, path } = current;

        // Check if current position is the target
        if (pos.x === targetPos.x && pos.y === targetPos.y) {
            return path; // Path found
        }

        // Generate neighbors (pass empty array as getValidMoves checks its own opponent block)
        const neighbors = getValidMoves(pos, {x: -1, y: -1}); // We check blockers separately

        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            // Check visited AND if the neighbor is a blocker (unless it's the target itself)
            if (!visited.has(key) && !(blockerSet.has(key) && (neighbor.x !== targetPos.x || neighbor.y !== targetPos.y)))
            {
                visited.add(key);
                const newPath = [...path, neighbor];
                q.push({ pos: neighbor, path: newPath });
            }
        }
    }
    return null; // Target not reachable
}

// --- REWRITTEN AI Decision Logic ---
function findBestActionUCSBased() {
    console.log("AI using rule-based logic with BFS pathing (Guided Missile)...");
    const startTime = performance.now();

    // --- Rule 1: Check for winning shot ---
    const path = findShortestPath(aiPos, playerPos, []); // Missile path ignores player block
    let canShoot = false;
    let fuelCost = 0;
    let winningShotAction = null;

    if (path && path.length > 1) { // Path exists and requires moving > 0 steps
        fuelCost = path.length - 1; // Cost is steps taken (path length - 1)
        if (fuelCost <= aiFuel) {
            canShoot = true;
            winningShotAction = { type: "shoot", target: playerPos, _path: path, _cost: fuelCost };
        }
    }

    if (canShoot) {
        console.log(`AI Decision: Winning Shot Found. Path Length: ${path.length}, Cost: ${fuelCost}, Available Fuel: ${aiFuel}. Action:`, winningShotAction);
        const endTime = performance.now();
        console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
        return winningShotAction;
    }

    // --- Rule 2: Move towards nearest reachable fuel cell ---
    const availableUpgrades = [...powerUpPositions]; // Fuel cells
    let shortestPathToUpgrade = null;
    let bestTargetUpgrade = null;

    availableUpgrades.sort((a, b) => distance(aiPos, a) - distance(aiPos, b)); // Sort by distance heuristic

    for (const upgradePos of availableUpgrades) {
        // Pathfinding for movement *must* consider player blocking the destination tile
        const upgradePath = findShortestPath(aiPos, upgradePos, [playerPos]);
        if (upgradePath && upgradePath.length > 1) {
            shortestPathToUpgrade = upgradePath;
            bestTargetUpgrade = upgradePos;
            break; // Found the closest reachable one
        }
    }

    if (shortestPathToUpgrade) {
        const nextStep = shortestPathToUpgrade[1]; // path[0] is current pos
        console.log(`AI Decision: Moving towards fuel cell at ${bestTargetUpgrade.x},${bestTargetUpgrade.y}. Next step: ${nextStep.x},${nextStep.y}`);
        const endTime = performance.now();
        console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
        return { type: "move", target: nextStep };
    }

    // --- Rule 3: Fallback - Stay Put ---
    console.log("AI Decision: No winning shot or reachable fuel cells. Staying put.");
    const endTime = performance.now();
    console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
    return { type: "stay" };
}
// --- END REWRITTEN AI ---

function triggerAiTurn() {
    setMessage("AI is thinking..."); updatePhaseIndicator(); disablePlanningControls();
    setTimeout(() => {
        if (gameOverState) return;
        const aiAction = findBestActionUCSBased(); // Use the new logic
        if (!aiAction) { console.error("AI failed to find ANY action (even 'stay')!"); executeAction({ type: "stay" }); return; }
        executeAction(aiAction);
    }, AI_THINK_DELAY);
}

// --- Action Execution and Turn Management ---
// --- MODIFIED executeAction ---
async function executeAction(action) {
    if (isResolving || gameOverState) return;
    console.log(`Executing ${currentPlayer}'s action:`, action);
    isResolving = true; disablePlanningControls(); updatePhaseIndicator();
    let actionSuccess = true; let wasHit = false; let collectedPowerup = false; let messageLog = [];
    const activePlayer = currentPlayer;
    const activePlayerMesh = activePlayer === "player" ? playerMesh : aiMesh;
    const activePlayerPosRef = activePlayer === "player" ? playerPos : aiPos;
    const opponentPos = activePlayer === "player" ? aiPos : playerPos;
    // const opponentMesh = activePlayer === "player" ? aiMesh : playerMesh; // Less needed now
    const missileMaterial = activePlayer === "player" ? playerMissileMaterial : aiMissileMaterial; // Use missile materials

    if (action.type === "move") {
        setMessage(`${activePlayer.toUpperCase()} moves...`);
        if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) {
            messageLog.push(`${activePlayer.toUpperCase()} move blocked by opponent!`); actionSuccess = false;
        } else {
            await animateMove(activePlayerMesh, action.target);
            activePlayerPosRef.x = action.target.x; activePlayerPosRef.y = action.target.y;
            messageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`);
            const powerupIndex = powerUpPositions.findIndex((p) => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y);

            // --- Fuel Cell Collection Logic ---
            if (powerupIndex !== -1) {
                if (activePlayer === "player") {
                    playerFuel += FUEL_PER_UPGRADE;
                    messageLog.push(`Player collected fuel cell! (Total: ${playerFuel})`);
                } else {
                    aiFuel += FUEL_PER_UPGRADE;
                    messageLog.push(`AI collected fuel cell! (Total: ${aiFuel})`);
                }
                collectedPowerup = true;
                removePowerup3D(activePlayerPosRef.x, activePlayerPosRef.y); // Remove the visual
                updateFuelInfo(); // Update UI
            }
            // --- End Fuel Cell Logic ---
        }
        if (actionSuccess) await wait(ACTION_RESOLVE_DELAY / 2);
    } else if (action.type === "shoot") {
        setMessage(`${activePlayer.toUpperCase()} fires missile!`);
        // const startPos = (activePlayer === 'player') ? playerPos : aiPos; // Less needed
        // const targetPos = action.target; // Already have target
        const path = action._path;
        const cost = action._cost;
        let currentFuelRef = (activePlayer === 'player') ? playerFuel : aiFuel; // Use let for deduction

        // Double-check fuel and path validity
        if (path && path.length > 1 && cost <= currentFuelRef) {
             // Deduct fuel
             if (activePlayer === 'player') {
                 playerFuel -= cost;
             } else {
                 aiFuel -= cost;
             }
             updateFuelInfo(); // Update UI immediately

             // Create missile visual
             createMissilePathVisual(path, missileMaterial); // Use the new function

             messageLog.push(`${activePlayer.toUpperCase()} missile launched (Cost: ${cost}).`);
             wasHit = true; // Path calculation already confirmed reachability to target tile
             messageLog.push(`${(activePlayer === 'player' ? 'AI' : 'Player')} was hit!`);

             await wait(MISSILE_TRAVEL_DURATION); // Wait for visual
        } else {
             messageLog.push(`${activePlayer.toUpperCase()} missile fizzled! (Not enough fuel or path blocked).`);
             actionSuccess = false; wasHit = false;
             await wait(ACTION_RESOLVE_DELAY);
        }
    } else if (action.type === "stay") {
        setMessage(`${activePlayer.toUpperCase()} stays put.`);
        messageLog.push(`${activePlayer.toUpperCase()} did not move.`);
        await wait(ACTION_RESOLVE_DELAY);
    }

    setMessage(messageLog.join(" "));
    if (wasHit) { endGame(`${activePlayer.toUpperCase()} Wins!`, activePlayer); return; }

    if (!gameOverState) {
        currentPlayer = activePlayer === "player" ? "ai" : "player"; gamePhase = currentPlayer + "Turn"; isResolving = false;
        await wait(ACTION_RESOLVE_DELAY);
        if (currentPlayer === "ai") { triggerAiTurn(); }
        else { setMessage("Your Turn: Plan your action."); updatePhaseIndicator(); enablePlanningControls(); setPlanningMode("move"); }
    } else { isResolving = false; }
}
// --- END MODIFIED executeAction ---


// --- Animate Move Function --- (Unchanged)
function animateMove(mesh, targetGridPos) {
    return new Promise((resolve) => {
        const startPos3D = mesh.position.clone();
        const targetY = mesh.userData.type === "player" ? (CELL_3D_SIZE * 0.9) / 2 : (CELL_3D_SIZE * 1.0) / 2;
        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);
        const hopHeight = CELL_3D_SIZE * 0.3;
        const midPos3D = new THREE.Vector3((startPos3D.x + targetPos3D.x) / 2, Math.max(startPos3D.y, targetPos3D.y) + hopHeight, (startPos3D.z + targetPos3D.z) / 2);
        new TWEEN.Tween(startPos3D).to(midPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.Out).onUpdate(() => { mesh.position.copy(startPos3D); }).onComplete(() => { new TWEEN.Tween(startPos3D).to(targetPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.In).onUpdate(() => { mesh.position.copy(startPos3D); }).onComplete(resolve).start(); }).start();
    });
}

// --- Utility Wait Function --- (Unchanged)
function wait(duration) { return new Promise((resolve) => setTimeout(resolve, duration)); }

// --- Powerup Logic Functions --- (Conceptually Fuel Cells now)
function spawnInitialPowerups() {
    console.log("Spawning initial fuel cells (Weighted Random Sampling)...");
    powerUpPositions = []; powerupMeshes.forEach((p) => disposeMesh(p.mesh)); powerupMeshes = [];
    let availableCells = [];
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === "floor" && !(x === playerPos.x && y === playerPos.y) && !(x === aiPos.x && y === aiPos.y)) { availableCells.push({ x, y }); } } }
    if (availableCells.length < INITIAL_POWERUP_COUNT) { console.warn(`Not enough available cells (${availableCells.length}) to spawn ${INITIAL_POWERUP_COUNT} fuel cells. Spawning all available.`); availableCells.forEach((cell) => { powerUpPositions.push({ x: cell.x, y: cell.y }); const newPowerup = createPowerup3D(cell.x, cell.y); if (newPowerup) powerupMeshes.push(newPowerup); console.log(`Spawned fuel cell at ${cell.x},${cell.y} (fallback due to low cell count)`); }); return; }
    let weightedCells = availableCells.map((cell) => { const distPlayer = Math.max(1, distance(cell, playerPos)); const distAi = Math.max(1, distance(cell, aiPos)); const ratio = distAi / distPlayer; const diff = Math.abs(ratio - AI_DISTANCE_BIAS); const weight = 0.01 + 1 / (1 + diff * diff * 10); return { cell, weight, ratio, distPlayer, distAi }; }).filter((wc) => wc.weight > 0);
    let totalWeight = weightedCells.reduce((sum, wc) => sum + wc.weight, 0); let spawnedCount = 0; const maxSpawnAttempts = availableCells.length * 3; let attempts = 0;
    while (spawnedCount < INITIAL_POWERUP_COUNT && weightedCells.length > 0 && attempts < maxSpawnAttempts) {
        attempts++; if (totalWeight <= 0) { console.warn("Total weight is zero or negative, cannot perform weighted sampling. Attempt:", attempts); break; }
        let randomVal = Math.random() * totalWeight; let chosenIndex = -1;
        for (let i = 0; i < weightedCells.length; i++) { randomVal -= weightedCells[i].weight; if (randomVal <= 0) { chosenIndex = i; break; } }
        if (chosenIndex === -1 && weightedCells.length > 0) { console.warn("Weighted sampling fallback triggered (chosenIndex = -1). Selecting last element. Attempt:", attempts); chosenIndex = weightedCells.length - 1; }
        if (chosenIndex !== -1 && chosenIndex < weightedCells.length) {
            const chosenWeightedCell = weightedCells[chosenIndex]; const { cell, ratio, distPlayer, distAi } = chosenWeightedCell;
            powerUpPositions.push({ x: cell.x, y: cell.y }); const newPowerup = createPowerup3D(cell.x, cell.y); if (newPowerup) powerupMeshes.push(newPowerup);
            console.log(`Spawned fuel cell at ${cell.x},${cell.y} (Ratio: ${ratio.toFixed(2)}, PDist: ${distPlayer}, ADist: ${distAi}, Weight: ${chosenWeightedCell.weight.toFixed(3)})`);
            spawnedCount++; totalWeight -= chosenWeightedCell.weight; weightedCells.splice(chosenIndex, 1);
        } else { console.error(`Error during weighted sampling: Invalid chosenIndex (${chosenIndex}) or weightedCells issue. Attempt:`, attempts, "TotalWeight:", totalWeight, "weightedCells.length:", weightedCells.length); break; }
    }
    if (spawnedCount < INITIAL_POWERUP_COUNT) { console.warn(`Could only spawn ${spawnedCount} out of ${INITIAL_POWERUP_COUNT} initial fuel cells after ${attempts} attempts.`); }
    else { console.log(`Successfully spawned ${spawnedCount} initial fuel cells.`); }
}

// --- Game Over Function --- (Unchanged)
function endGame(message, winner) { console.log("Game Over:", message); gamePhase = "gameOver"; gameOverState = { winner: winner, message: message }; setMessage(message); updatePhaseIndicator(); disablePlanningControls(); isResolving = false; }

// --- Utility Functions ---
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === "wall"; }
// getValidMoves now takes an opponent position that *blocks* the move destination
function getValidMoves(unitPos, opponentPosToBlock) {
    const moves = [];
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach((dir) => {
        const nextX = unitPos.x + dir.dx; const nextY = unitPos.y + dir.dy;
        // Check valid, is floor, AND is NOT the opponent's blocking position
        if (isValid(nextX, nextY) && grid[nextY][nextX] === "floor" && !(nextX === opponentPosToBlock?.x && nextY === opponentPosToBlock?.y)) {
            moves.push({ x: nextX, y: nextY });
        }
    }); return moves;
}
function distance(pos1, pos2) { return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y); } // Manhattan distance
function findNearestPowerup(pos, powerupList = powerUpPositions) { let minDist = Infinity; let nearest = null; powerupList.forEach((p) => { const d = distance(pos, p); if (d < minDist) { minDist = d; nearest = p; } }); return nearest; } // Finds nearest Fuel Cell

// --- Start Game ---
init();