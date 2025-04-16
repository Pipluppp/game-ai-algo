import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import TWEEN from '@tweenjs/tween.js';

// --- DOM Elements ---
const canvasContainer = document.getElementById('gameCanvasContainer');
const canvas = document.getElementById('threeCanvas');
const btnPlanMove = document.getElementById('btnPlanMove');
const btnPlanShoot = document.getElementById('btnPlanShoot');
const btnReset = document.getElementById('btnReset');
const phaseIndicator = document.getElementById('phaseIndicator');
const messageArea = document.getElementById('messageArea');
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
const SHOT_FLASH_DURATION = 400;
const MOVEMENT_DURATION = 350;
const RESOLVE_STEP_DELAY = 150;

// AI constants
const AI_MAX_BEND_CHECK_DEPTH = 2;
const AI_MAX_SEGMENT_EVAL_POINTS = 5;

// --- Three.js Setup ---
let scene, camera, renderer, controls;
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = [];
let playerMesh, aiMesh;
let playerLevelIndicator, aiLevelIndicator;
let activeHighlights = [];
let activeLasers = [];

// Materials (Using names from previous version)
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8, metalness: 0.1 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x607d8b, roughness: 0.6, metalness: 0.2 }); // Blue Grey
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, roughness: 0.5, metalness: 0.3 });
const aiMaterial = new THREE.MeshStandardMaterial({ color: 0xdc3545, roughness: 0.5, metalness: 0.3 });
const powerupMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0xcc9000, roughness: 0.4 });
const moveHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4 });
const pathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.5 });
const invalidPathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });
const hitHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
const playerLaserMaterial = new THREE.MeshStandardMaterial({ color: 0x00bfff, emissive: 0x008fcc, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const aiLaserMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xcc4a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });


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
    scene.background = new THREE.Color(0x111315);

    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 1.0, GRID_SIZE * CELL_3D_SIZE * 0.8);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const ambientLight = new THREE.AmbientLight(0xb0c0d0, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(GRID_SIZE * 0.5, GRID_SIZE * 1.5, GRID_SIZE * 0.7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = GRID_SIZE * CELL_3D_SIZE * 3;
    const shadowCamSize = GRID_SIZE * CELL_3D_SIZE * 0.8;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    scene.add(directionalLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = CELL_3D_SIZE * 4;
    controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.6;

    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);

    const planeSize = GRID_SIZE * CELL_3D_SIZE;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2;
    intersectionPlane.position.y = 0.01;
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
    gameOverState = null;
    isResolving = false;

    createUnits3D();

    maybeSpawnPowerup(); maybeSpawnPowerup(); maybeSpawnPowerup();

    setMessage("Plan your move.");
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

// --- Grid Generation Functions (generateGrid, isGridConnected, findFirstFloor, findStartPositions, findNearestFloorBFS) ---
// ... (Copy from previous version - No changes needed here) ...
function generateGrid() { /* ... copy from previous ... */
    let attempts = 0;
    while (attempts < 10) { // Try generating a few times if the first is bad
        grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('floor'));
        let wallCount = 0;
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetWallCount = Math.floor(totalCells * WALL_DENSITY);

        // Randomly place walls
        while (wallCount < targetWallCount) {
            const x = Math.floor(Math.random() * GRID_SIZE);
            const y = Math.floor(Math.random() * GRID_SIZE);
            if (grid[y][x] === 'floor') {
                // Avoid blocking corners initially for start pos finding - adjust range for larger grid
                if ((x > 2 && x < GRID_SIZE - 3) || (y > 2 && y < GRID_SIZE - 3)) {
                     grid[y][x] = 'wall';
                     wallCount++;
                } else if (Math.random() < 0.3) { // Allow some walls near edges but less likely
                    grid[y][x] = 'wall';
                    wallCount++;
                }
            }
        }

        // Check connectivity (simple BFS from a corner floor)
        if (isGridConnected()) {
            console.log("Generated connected grid.");
            return; // Grid is okay
        }
        attempts++;
        console.warn(`Generated grid attempt ${attempts} was not connected or valid. Retrying...`);
    }
    console.error("Failed to generate a valid connected grid after multiple attempts.");
     // Fallback: create a mostly empty grid if generation fails repeatedly
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('floor'));
    // Add a few random walls to the fallback grid
    for (let i = 0; i < GRID_SIZE * GRID_SIZE * 0.1; i++) {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        if (grid[y][x] === 'floor') grid[y][x] = 'wall';
    }
    setMessage("Warning: Grid generation failed, using fallback.");
}
function isGridConnected() { /* ... copy from previous ... */
    const startNode = findFirstFloor();
    if (!startNode) return false; // No floor tiles?

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
    // Check if all floor cells are reachable
    return reachableFloorCount === totalFloorCount;
}
function findFirstFloor() { /* ... copy from previous ... */
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor') return { x, y };
        }
    }
    return null;
}
function findStartPositions() { /* ... copy from previous ... */
    const potentialStarts = [
        { x: 2, y: 2 },                           // Top-leftish
        { x: GRID_SIZE - 3, y: GRID_SIZE - 3 },   // Bottom-rightish
        { x: 2, y: GRID_SIZE - 3 },               // Bottom-leftish
        { x: GRID_SIZE - 3, y: 2 }                // Top-rightish
    ];

    const playerStart = findNearestFloorBFS(potentialStarts[0]);
    // Try finding AI start far away first
    let aiStart = findNearestFloorBFS(potentialStarts[1], playerStart ? [playerStart] : []);

    // If first try failed or is too close, try other corners
    if (!aiStart || (playerStart && distance(playerStart, aiStart) <= GRID_SIZE * 0.6)) {
         const aiStartAlt = findNearestFloorBFS(potentialStarts[2], playerStart ? [playerStart] : []);
         if (aiStartAlt && playerStart && distance(playerStart, aiStartAlt) > GRID_SIZE * 0.6) {
             aiStart = aiStartAlt;
         } else {
             const aiStartAlt2 = findNearestFloorBFS(potentialStarts[3], playerStart ? [playerStart] : []);
              if (aiStartAlt2 && playerStart && distance(playerStart, aiStartAlt2) > GRID_SIZE * 0.6) {
                 aiStart = aiStartAlt2;
             } else if (!aiStart && aiStartAlt) { // Fallback if no far spot found
                  aiStart = aiStartAlt;
             } else if (!aiStart && aiStartAlt2) {
                  aiStart = aiStartAlt2;
             }
             // If still no suitable AI start, BFS from center? Or accept the close one?
             if (!aiStart) {
                 // Last resort: BFS from center outwards for AI start
                 aiStart = findNearestFloorBFS({x: Math.floor(GRID_SIZE/2), y: Math.floor(GRID_SIZE/2)}, playerStart ? [playerStart] : []);
             }
         }
    }


    if (playerStart && aiStart) {
        return { player: playerStart, ai: aiStart };
    }

    console.error("Failed to find suitable start positions even with fallbacks.");
    return null; // Couldn't find suitable spots
}
function findNearestFloorBFS(startSearchPos, occupied = []) { /* ... copy from previous ... */
    const q = [{ pos: startSearchPos, dist: 0 }];
    const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    occupied.forEach(occ => visited.add(`${occ.x},${occ.y}`)); // Mark occupied as visited

    while (q.length > 0) {
        // Optimization: Prioritize nodes closer to the starting point if needed, but simple BFS works
        const current = q.shift();
        const { x, y } = current.pos;

        if (isValid(x, y) && grid[y][x] === 'floor' && !occupied.some(occ => occ.x === x && occ.y === y)) {
            return { x, y }; // Found a valid, unoccupied floor
        }

        // Explore neighbors
        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];
        // Shuffle neighbors to explore in a less biased order (optional)
        // neighbors.sort(() => Math.random() - 0.5);

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
             // Only search within grid boundaries
            if (isValid(n.x, n.y) && !visited.has(key)) {
                visited.add(key);
                 // Add neighbors to search. BFS explores layer by layer, so first floor found is closest.
                q.push({ pos: n, dist: current.dist + 1 });
            }
        }
    }
    console.warn(`BFS from ${startSearchPos.x},${startSearchPos.y} found no valid floor.`);
    return null; // No floor found reachable from startSearchPos
}


// --- 3D Object Creation / Management Functions ---
// ... (Copy get3DPosition, getGridCoords, clearBoard3D, createBoard3D, createUnits3D, createLevelTextMesh, updateWeaponLevelVisuals, createPowerup3D, removePowerup3D from previous version) ...
function get3DPosition(x, y, yOffset = 0) { /* ... */
    const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    return new THREE.Vector3(worldX, yOffset, worldZ);
}
function getGridCoords(position) { /* ... */
    const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    return { x, y };
}
function clearBoard3D() { /* ... */
    while (gameBoardGroup.children.length > 0) {
        const child = gameBoardGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
             if (Array.isArray(child.material)) {
                 child.material.forEach(mat => mat.dispose());
             } else {
                 child.material.dispose();
             }
        }
        if(child instanceof THREE.Sprite && child.material.map instanceof THREE.CanvasTexture){
             child.material.map.dispose();
        }
        gameBoardGroup.remove(child);
    }
    floorMeshes = [];
    wallMeshes = [];
    powerupMeshes = [];
    playerMesh = null;
    aiMesh = null;
    playerLevelIndicator = null;
    aiLevelIndicator = null;
    activeHighlights = [];
    activeLasers.forEach(laser => scene.remove(laser));
    activeLasers = [];
}
function createBoard3D() { /* ... */
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    wallMeshes = [];

    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.1, CELL_3D_SIZE);
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);

            if (grid[y][x] === 'floor') {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial.clone());
                floorMesh.position.copy(pos);
                floorMesh.position.y = -0.05;
                floorMesh.castShadow = false;
                floorMesh.receiveShadow = true;
                floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
                gameBoardGroup.add(floorMesh);
                floorMeshes[y][x] = floorMesh;
            }
            else if (grid[y][x] === 'wall') {
                 const baseMesh = new THREE.Mesh(floorGeom, floorMaterial.clone());
                 baseMesh.position.copy(pos);
                 baseMesh.position.y = -0.05;
                 baseMesh.receiveShadow = true;
                 gameBoardGroup.add(baseMesh);

                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
                wallMesh.position.copy(pos);
                wallMesh.position.y += WALL_HEIGHT / 2 - 0.05;
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
function createUnits3D() { /* ... */
    const unitElevation = CELL_3D_SIZE * 0.4;

    const playerGeom = new THREE.CapsuleGeometry(CELL_3D_SIZE * 0.3, CELL_3D_SIZE * 0.5, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial.clone());
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, unitElevation + 0.1);
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: 'player' };
    gameBoardGroup.add(playerMesh);
    playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
    playerLevelIndicator.position.set(0, CELL_3D_SIZE * 0.7, 0);
    playerMesh.add(playerLevelIndicator);


    const aiGeom = new THREE.ConeGeometry(CELL_3D_SIZE * 0.4, CELL_3D_SIZE * 0.8, 4);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial.clone());
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, unitElevation + 0.4);
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: 'ai' };
    gameBoardGroup.add(aiMesh);
    aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
    aiLevelIndicator.position.set(0, CELL_3D_SIZE * 0.8, 0);
    aiMesh.add(aiLevelIndicator);

    updateWeaponLevelVisuals();
}
function createLevelTextMesh(level) { /* ... */
     const canvas = document.createElement('canvas');
     const context = canvas.getContext('2d');
     const size = 64;
     const halfSize = size / 2;
     canvas.width = size;
     canvas.height = size;

     context.fillStyle = 'rgba(0, 0, 0, 0.6)';
     context.beginPath();
     context.roundRect(0, 0, size, size, size * 0.2);
     context.fill();

     context.font = `Bold ${size * 0.55}px Arial`;
     context.fillStyle = 'white';
     context.textAlign = 'center';
     context.textBaseline = 'middle';
     context.fillText(level.toString(), halfSize, halfSize + 2);

     const texture = new THREE.CanvasTexture(canvas);
     texture.needsUpdate = true;
     const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false });
     const sprite = new THREE.Sprite(spriteMaterial);
     sprite.scale.set(0.05, 0.05, 1);
     return sprite;
}
function updateWeaponLevelVisuals() { /* ... */
    if (playerMesh) {
        if(playerLevelIndicator) playerMesh.remove(playerLevelIndicator);
        if(playerLevelIndicator?.material?.map) playerLevelIndicator.material.map.dispose();
        if(playerLevelIndicator?.material) playerLevelIndicator.material.dispose();
        playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
        playerLevelIndicator.position.set(0, CELL_3D_SIZE * 0.7, 0);
        playerMesh.add(playerLevelIndicator);
    }
     if (aiMesh) {
        if(aiLevelIndicator) aiMesh.remove(aiLevelIndicator);
        if(aiLevelIndicator?.material?.map) aiLevelIndicator.material.map.dispose();
        if(aiLevelIndicator?.material) aiLevelIndicator.material.dispose();
        aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
        aiLevelIndicator.position.set(0, CELL_3D_SIZE * 0.8, 0);
        aiMesh.add(aiLevelIndicator);
    }

     const playerEmissiveIntensity = Math.max(0, (playerWeaponLevel - 1) * 0.2);
     if (playerMesh?.material) playerMesh.material.emissive.set(playerMaterial.color).multiplyScalar(playerEmissiveIntensity);
     const aiEmissiveIntensity = Math.max(0, (aiWeaponLevel - 1) * 0.2);
     if (aiMesh?.material) aiMesh.material.emissive.set(aiMaterial.color).multiplyScalar(aiEmissiveIntensity);
}
function createPowerup3D(x, y) { /* ... */
    const powerupGeom = new THREE.OctahedronGeometry(CELL_3D_SIZE * 0.25, 0);
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
    mesh.position.copy(get3DPosition(x, y, CELL_3D_SIZE * 0.4));
    mesh.castShadow = true;
    mesh.userData = { type: 'powerup', gridX: x, gridY: y, spinSpeed: Math.random() * 0.02 + 0.01 };
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}
function removePowerup3D(x, y) { /* ... */
    const index = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (index !== -1) {
        const powerupObj = powerupMeshes[index];
        if (powerupObj.mesh.geometry) powerupObj.mesh.geometry.dispose();
        gameBoardGroup.remove(powerupObj.mesh);
        powerupMeshes.splice(index, 1);
    }
}


// --- Highlighting Functions ---
// ... (Copy clearHighlights, highlightCell, renderHighlights from previous version) ...
function clearHighlights() { /* ... */
    activeHighlights.forEach(mesh => {
        if (mesh.userData.type === 'floor' && mesh.material !== floorMaterial) {
             mesh.material = floorMaterial.clone();
        }
    });
    activeHighlights = [];
}
function highlightCell(x, y, highlightMaterial) { /* ... */
    if (isValid(x, y) && floorMeshes[y]?.[x]) {
        const floorMesh = floorMeshes[y][x];
         if (floorMesh.material !== highlightMaterial) {
             const existingIndex = activeHighlights.indexOf(floorMesh);
             if (existingIndex > -1) {
                 activeHighlights.splice(existingIndex, 1);
             }
             floorMesh.material = highlightMaterial;
             activeHighlights.push(floorMesh);
         } else if (!activeHighlights.includes(floorMesh)){
             activeHighlights.push(floorMesh);
         }
    }
}
function renderHighlights() { /* ... */
    clearHighlights();

    if (gamePhase !== 'planning' || gameOverState || isResolving) return;

    const opponentTargetPos = aiPos;

    if (currentPlanningMode === 'move') {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));
    }
    else if (currentPlanningMode === 'shoot') {
         let pathToShow = [];
         let useMaterial = pathHighlightMaterial;

         if (hoverPath.length > 0 && !playerPlannedAction) {
             pathToShow = hoverPath;
              if (!hoverPathIsValid) {
                 useMaterial = invalidPathHighlightMaterial;
              }
         } else if (partialShootPlan?.path?.length > 0 && !playerPlannedAction) {
             pathToShow = partialShootPlan.path;
             useMaterial = pathHighlightMaterial;
         } else if (playerPlannedAction?.type === 'shoot') {
             pathToShow = playerPlannedAction.path;
             useMaterial = pathHighlightMaterial;
         }

         let hitOpponent = false;
         pathToShow.forEach(p => {
             highlightCell(p.x, p.y, useMaterial);
             if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y && useMaterial !== invalidPathHighlightMaterial) {
                 hitOpponent = true;
             }
         });

        if (hitOpponent) {
             highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial);
        }
    }
}


// --- Laser Effect Function ---
// ... (Copy createLaserBeam from previous version) ...
function createLaserBeam(path, material) { /* ... */
    if (!path || path.length < 1) return null;
     const points = [];
     const startOffset = 0.3 * CELL_3D_SIZE;
     points.push(get3DPosition(path[0].x, path[0].y, startOffset));
     for (let i = 1; i < path.length; i++) {
         points.push(get3DPosition(path[i].x, path[i].y, startOffset));
     }
     if (points.length === 1) {
         const nextPoint = points[0].clone();
         const initialDir = playerPlannedAction?.type === 'shoot' ? playerPlannedAction.direction : {dx: 1, dy: 0};
         nextPoint.x += initialDir.dx * 0.1;
         nextPoint.z += initialDir.dy * 0.1;
         points.push(nextPoint);
     }

    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
    const tubeRadius = CELL_3D_SIZE * 0.06;
    const tubeSegments = Math.max(8, path.length * 3);
    const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);
    const laserMesh = new THREE.Mesh(tubeGeom, material.clone());
    laserMesh.userData = { type: 'laser' };

    scene.add(laserMesh);
    activeLasers.push(laserMesh);

    const tween = new TWEEN.Tween({ opacity: laserMesh.material.opacity })
        .to({ opacity: 0 }, SHOT_FLASH_DURATION * 0.6)
        .delay(SHOT_FLASH_DURATION * 0.4)
        .easing(TWEEN.Easing.Quadratic.In)
        .onUpdate((obj) => {
            if(laserMesh.material) laserMesh.material.opacity = obj.opacity;
        })
        .onComplete(() => {
            scene.remove(laserMesh);
            laserMesh.geometry.dispose();
            if(laserMesh.material) laserMesh.material.dispose();
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
    powerupMeshes.forEach(p => {
        p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.01;
        p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.01) * 0.6;
    });
    renderHighlights(); // Keep updating highlights during planning
    renderer.render(scene, camera);
}

// --- Input Handling Functions ---
// ... (Copy handleCanvasMouseMove, handleCanvasClick, updateMouseCoords from previous version) ...
function handleCanvasMouseMove(event) { /* ... */
    updateMouseCoords(event);
    if (gamePhase !== 'planning' || currentPlanningMode !== 'shoot' || playerPlannedAction || gameOverState || isResolving || !partialShootPlan?.needsInput) {
        if (hoverPath.length > 0) { hoverPath = []; hoverPathIsValid = false; } return;
    }
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const targetGridPos = getGridCoords(intersects[0].point);
        if (isValid(targetGridPos.x, targetGridPos.y)) {
            if (!hoverPos || hoverPos.x !== targetGridPos.x || hoverPos.y !== targetGridPos.y) {
                hoverPos = { ...targetGridPos };
                const startPos = partialShootPlan.lastBendPos;
                const segmentResult = calculateShotPathSegment(startPos, hoverPos, aiPos);
                if (segmentResult.isValidSegment) {
                    hoverPath = [...partialShootPlan.path, ...segmentResult.path];
                    hoverPathIsValid = true;
                } else {
                    hoverPath = [...partialShootPlan.path, hoverPos];
                    hoverPathIsValid = false;
                }
            }
        } else { hoverPos = null; hoverPath = []; hoverPathIsValid = false; }
    } else { hoverPos = null; hoverPath = []; hoverPathIsValid = false; }
}
function handleCanvasClick(event) { /* ... */
     if (gamePhase !== 'planning' || playerPlannedAction || gameOverState || isResolving) return;
     updateMouseCoords(event);
     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const { x, y } = getGridCoords(intersects[0].point);
         if (isValid(x,y)) {
             if (currentPlanningMode === 'move') handleMoveInput(x, y);
             else if (currentPlanningMode === 'shoot') handleShootInput(x, y);
         }
    }
}
function updateMouseCoords(event) { /* ... */
    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// --- UI Update Functions ---
// ... (Copy setMessage, updatePhaseIndicator, updateWeaponLevelInfo, enablePlanningControls, disablePlanningControls from previous version) ...
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() { /* ... */
    let phaseText = 'Unknown';
    if (gameOverState) { phaseText = `Game Over! ${gameOverState.message}`; }
    else { phaseText = `Phase: ${gamePhase.charAt(0).toUpperCase() + gamePhase.slice(1)}`; }
    phaseIndicator.textContent = phaseText;
}
function updateWeaponLevelInfo() { /* ... */
     weaponLevelInfo.textContent = `Your Weapon Level: ${playerWeaponLevel}`;
     aiWeaponLevelInfo.textContent = `AI Weapon Level: ${aiWeaponLevel}`;
     updateWeaponLevelVisuals();
}
function enablePlanningControls() { /* ... */
    if (gameOverState) return;
    btnPlanMove.disabled = false;
    btnPlanShoot.disabled = false;
    isResolving = false;
    clearHighlights();
}
function disablePlanningControls() { /* ... */
    btnPlanMove.disabled = true;
    btnPlanShoot.disabled = true;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null;
    clearHighlights();
}

// --- Planning Phase Logic Functions ---
// ... (Copy setPlanningMode, handleMoveInput, handleShootInput, lockPlayerAction from previous version) ...
function setPlanningMode(mode) { /* ... */
    if (gamePhase !== 'planning' || gameOverState || isResolving) return;
    console.log("Setting planning mode:", mode);
    currentPlanningMode = mode;
    playerPlannedAction = null;
    partialShootPlan = null;
    hoverPath = [];
    hoverPathIsValid = false;
    btnPlanMove.classList.toggle('active', mode === 'move');
    btnPlanShoot.classList.toggle('active', mode === 'shoot');
    if (mode === 'move') {
         setMessage("Click an adjacent square to plan your move.");
    } else if (mode === 'shoot') {
          partialShootPlan = {
             needsInput: true, maxBends: playerWeaponLevel - 1, segments: [], path: [], lastBendPos: playerPos
         };
         setMessage(`Level ${playerWeaponLevel} Shot: Click target cell for segment 1.`);
    }
    clearHighlights();
}
function handleMoveInput(targetX, targetY) { /* ... */
    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidMove = validMoves.some(move => move.x === targetX && move.y === targetY);
    if (isValidMove) {
        playerPlannedAction = { type: 'move', target: { x: targetX, y: targetY } };
        setMessage("Move planned. Waiting for AI...");
        lockPlayerAction();
    } else {
        setMessage("Invalid move target. Click a highlighted square.");
    }
}
function handleShootInput(clickX, clickY) { /* ... */
     if (currentPlanningMode !== 'shoot' || !partialShootPlan || !partialShootPlan.needsInput) { return; }
     const targetPos = { x: clickX, y: clickY };
     const startPos = partialShootPlan.lastBendPos;
     if (targetPos.x === startPos.x && targetPos.y === startPos.y) { setMessage("Cannot target the start cell."); return; }
     const segmentResult = calculateShotPathSegment(startPos, targetPos, aiPos);
     if (!segmentResult.isValidSegment) { setMessage("Invalid target: Path blocked."); return; }
     partialShootPlan.segments.push({ path: segmentResult.path, endPos: targetPos });
     partialShootPlan.path.push(...segmentResult.path);
     partialShootPlan.lastBendPos = targetPos;
     const bendsMade = partialShootPlan.segments.length - 1;
    if (bendsMade < partialShootPlan.maxBends) {
        partialShootPlan.needsInput = true;
        setMessage(`Select Bend Point ${bendsMade + 1} (Click target cell for segment ${bendsMade + 2}).`);
         hoverPath = []; hoverPathIsValid = false;
    } else {
        partialShootPlan.needsInput = false;
        const finalPlan = {
            type: 'shoot', targetPoints: partialShootPlan.segments.map(seg => seg.endPos), path: partialShootPlan.path, direction: {dx: 0, dy: 0}, bends: []
        };
         if (finalPlan.targetPoints.length > 0) {
             const firstTarget = finalPlan.targetPoints[0]; const dx = Math.abs(firstTarget.x - playerPos.x); const dy = Math.abs(firstTarget.y - playerPos.y);
              if (dx > dy) finalPlan.direction.dx = Math.sign(firstTarget.x - playerPos.x); else if (dy > 0) finalPlan.direction.dy = Math.sign(firstTarget.y - playerPos.y);
         }
         for (let i = 0; i < finalPlan.targetPoints.length - 1; i++) {
              const bendPos = finalPlan.targetPoints[i]; const nextTarget = finalPlan.targetPoints[i+1]; const nextDir = {dx: 0, dy: 0};
              const dx = Math.abs(nextTarget.x - bendPos.x); const dy = Math.abs(nextTarget.y - bendPos.y);
              if (dx > dy) nextDir.dx = Math.sign(nextTarget.x - bendPos.x); else if (dy > 0) nextDir.dy = Math.sign(nextTarget.y - bendPos.y);
              finalPlan.bends.push({ pos: bendPos, direction: nextDir });
          }
        playerPlannedAction = finalPlan;
        setMessage("Shoot planned. Waiting for AI...");
        lockPlayerAction();
    }
}
function lockPlayerAction() { /* ... */
    disablePlanningControls();
    partialShootPlan = null;
    hoverPath = [];
    hoverPathIsValid = false;
    setTimeout(() => { planAiAction(); startResolution(); }, 300);
}

// --- Shot Path Calculation Functions ---
// ... (Copy calculateShotPathSegment, calculateFullPathFromTargets from previous version) ...
function calculateShotPathSegment(startPos, targetPos, opponentPos) { /* ... */
    let path = []; let currentPos = { ...startPos }; let hitTarget = false; let isValidSegment = true;
    const dxTotal = targetPos.x - startPos.x; const dyTotal = targetPos.y - startPos.y; const steps = Math.max(Math.abs(dxTotal), Math.abs(dyTotal));
    let stepDir = { dx: 0, dy: 0 };
     if (Math.abs(dxTotal) > Math.abs(dyTotal)) { stepDir.dx = Math.sign(dxTotal); } else if (Math.abs(dyTotal) > 0) { stepDir.dy = Math.sign(dyTotal); } else { return { path: [], isValidSegment: false, hitTarget: false }; }
     if (stepDir.dx !== 0 && stepDir.dy !== 0) { if (Math.abs(dxTotal) > Math.abs(dyTotal)) { stepDir.dy = 0; } else { stepDir.dx = 0; } if (stepDir.dx === 0 && stepDir.dy === 0) return { path: [], isValidSegment: false, hitTarget: false }; }
    for (let i = 0; i < steps; i++) {
        const nextX = currentPos.x + stepDir.dx; const nextY = currentPos.y + stepDir.dy;
        if (isWall(nextX, nextY)) { isValidSegment = false; break; }
        currentPos.x = nextX; currentPos.y = nextY; path.push({ ...currentPos });
        if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) { hitTarget = true; break; }
         if (currentPos.x === targetPos.x && currentPos.y === targetPos.y) { break; }
    }
    if (isValidSegment && !hitTarget && !(currentPos.x === targetPos.x && currentPos.y === targetPos.y)) { isValidSegment = false; path = []; }
    return { path: path, isValidSegment: isValidSegment, hitTarget: hitTarget };
}
function calculateFullPathFromTargets(startPos, targetPoints, opponentPos) { /* ... */
    let fullPath = []; let currentPos = { ...startPos }; let pathIsValid = true; let finalHitTarget = false;
    for (const targetPoint of targetPoints) {
        const segmentResult = calculateShotPathSegment(currentPos, targetPoint, opponentPos);
        if (!segmentResult.isValidSegment) { pathIsValid = false; fullPath.push(...segmentResult.path); break; }
        fullPath.push(...segmentResult.path); currentPos = targetPoint;
        if (segmentResult.hitTarget) { finalHitTarget = true; break; }
    }
    return { path: fullPath, isValid: pathIsValid, hitTarget: finalHitTarget };
}

// --- AI Logic Functions ---
// ... (Copy planAiAction, evaluateAiPotentialAction from previous version) ...
function planAiAction() { /* ... copy from previous ... */
    console.log("AI Planning...");
    const possibleActions = [];
    const currentAiPos = { ...aiPos };
    const currentPlayerPos = { ...playerPos };
    const currentAiLevel = aiWeaponLevel;
    const maxBendsToPlan = Math.min(currentAiLevel - 1, AI_MAX_BEND_CHECK_DEPTH); // Limit AI planning depth

    // 1. Stay Put
    possibleActions.push({ type: 'stay' });

    // 2. Possible Moves
    getValidMoves(currentAiPos, currentPlayerPos).forEach(move => {
        possibleActions.push({ type: 'move', target: move });
    });

    // 3. Possible Shots (Recursive generation, limited depth)
    function generateShotActions(startPos, currentTargetPathPoints, bendsSoFar) {
        if (bendsSoFar >= currentAiLevel) return; // Max weapon level reached

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        directions.forEach(dir => {
             // Explore possible end points along this direction
             let lastValidPosInDir = { ...startPos };
             for (let i = 1; i <= GRID_SIZE; i++) { // Check cells along the direction
                 const potentialTargetX = startPos.x + dir.dx * i;
                 const potentialTargetY = startPos.y + dir.dy * i;
                 const potentialTarget = { x: potentialTargetX, y: potentialTargetY };

                 if (!isValid(potentialTargetX, potentialTargetY)) break; // Off grid

                 // Check segment validity to this point
                 const segmentResult = calculateShotPathSegment(startPos, potentialTarget, currentPlayerPos);

                 if (!segmentResult.isValidSegment) {
                     break; // Path blocked, stop checking further along this direction
                 }

                 // --- Valid Segment found ---
                 lastValidPosInDir = potentialTarget; // Update last valid reachable pos
                 const newTargetPathPoints = [...currentTargetPathPoints, potentialTarget];

                 // Calculate the full path for this potential action
                 const fullPathResult = calculateFullPathFromTargets(currentAiPos, newTargetPathPoints, currentPlayerPos);

                 if(fullPathResult.path.length > 0) { // Ensure the action results in a path
                     possibleActions.push({
                         type: 'shoot',
                         targetPoints: newTargetPathPoints,
                         path: fullPathResult.path
                         // Derived direction/bends can be added later if needed by evaluation
                     });
                 }

                 // If target hit, no need to bend further from here
                 if (segmentResult.hitTarget) break;

                 // --- Recursive Call for Next Bend (if within limits) ---
                 if (bendsSoFar + 1 < currentAiLevel && bendsSoFar + 1 <= maxBendsToPlan) {
                     // Prevent immediate reversal for the *next* segment evaluation
                     const nextDirections = directions.filter(nextDir =>
                         !(nextDir.dx === -dir.dx && nextDir.dy === 0) &&
                         !(nextDir.dy === -dir.dy && nextDir.dx === 0)
                     );
                     // For performance: only check limited points or directions?
                     // Here we call recursively for all valid next directions
                     generateShotActions(potentialTarget, newTargetPathPoints, bendsSoFar + 1);
                 }

                 // Performance limit: Stop checking points along this segment?
                 // if (i >= AI_MAX_SEGMENT_EVAL_POINTS) break;
             }
        });
    }

    // Start shot generation
    generateShotActions(currentAiPos, [], 0);


    // --- Evaluate Actions ---
    let bestAction = { type: 'stay' }; // Default to stay
    let bestScore = evaluateAiPotentialAction(bestAction, currentAiPos, currentPlayerPos); // Evaluate default 'stay'
    console.log(`AI Action Eval: stay Score: ${bestScore}`);

    // Remove duplicate actions (can happen with path generation)
    const uniqueActions = [];
    const seenActions = new Set();
    possibleActions.forEach(action => {
         // Create a simple string representation to check for duplicates
         let key;
         if(action.type === 'move') key = `move-${action.target.x},${action.target.y}`;
         else if(action.type === 'stay') key = 'stay';
         else if(action.type === 'shoot') key = `shoot-${action.targetPoints.map(p => `${p.x},${p.y}`).join('|')}`;
         else key = Math.random().toString(); // Should not happen

        if (!seenActions.has(key)) {
            uniqueActions.push(action);
            seenActions.add(key);
        }
    });


    uniqueActions.forEach(action => {
        if (action.type === 'stay') return; // Skip re-evaluating 'stay'

        const score = evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos);
         // Simple logging
         let actionDesc = action.type;
         if(action.type === 'move') actionDesc += ` to ${action.target.x},${action.target.y}`;
         else if(action.type === 'shoot') actionDesc += ` bends: ${action.targetPoints.length - 1}`;
        console.log(`AI Action Eval: ${actionDesc} Score: ${score.toFixed(2)}`);

        if (score > bestScore) {
            bestScore = score;
            bestAction = action;
        } else if (Math.abs(score - bestScore) < 1.0 && Math.random() > 0.5) { // Random tie-break for close scores
             bestScore = score;
             bestAction = action;
        }
    });

    // --- Select Action ---
    aiPlannedAction = bestAction;
    console.log("AI Planned Action:", aiPlannedAction);
}
function evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos) { /* ... copy from previous ... */
    let score = 0;
    let predictedAiPos = { ...currentAiPos }; // Where AI *would* be after this action

    if (action.type === 'move') {
        predictedAiPos = { ...action.target };
    } else if (action.type === 'shoot' && action.path.length > 0) {
         // For shooting, the predicted position is the same as current
         predictedAiPos = currentAiPos;
    } else if (action.type === 'stay'){
        predictedAiPos = currentAiPos;
    }

    // (+) Offensive - Hitting Player
    if (action.type === 'shoot') {
        const hitsPlayer = action.path.some(p => p.x === currentPlayerPos.x && p.y === currentPlayerPos.y);
        if (hitsPlayer) {
            score += 1000;
             // Slightly prefer simpler shots (fewer target points/bends)
             score -= (action.targetPoints.length * 30);
        }
         // Bonus for forcing player to move? Check if path *ends* next to player?
         // const lastPathPoint = action.path[action.path.length-1];
         // if (distance(lastPathPoint, currentPlayerPos) === 1) score += 20;
    }

     // (+) Powerup - Collection
    if (action.type === 'move') {
        if (powerUpPositions.some(p => p.x === action.target.x && p.y === action.target.y)) {
            score += 600; // Increased value
        }
    }

     // (-) Defensive - Being Targeted: Use the *updated* canHitTarget
    if (canHitTarget(playerPos, predictedAiPos, playerWeaponLevel, aiPos)) { // Check if player can hit AI's predicted spot
        score -= 900; // Increased penalty
         // Increase penalty if AI moves INTO line of fire vs staying in it
         if (action.type === 'move' && !canHitTarget(playerPos, currentAiPos, playerWeaponLevel, aiPos) ){
            score -= 250; // Extra penalty for moving into danger
         }
         // Penalty based on how many bends player needs? Less penalty if player needs many bends.
         // This requires calculating minimum bends for player, which is complex. Skip for now.
    }

    // (+) Defensive - Cover: Check if straight shot from player to predicted pos is blocked
    if (!canHitTarget(currentPlayerPos, predictedAiPos, 1, currentAiPos)) {
          score += 70; // Increased bonus for cover
         // Bonus for moving further away while gaining cover
         if(action.type === 'move' && distance(predictedAiPos, currentPlayerPos) > distance(currentAiPos, currentPlayerPos)){
             score += 30;
         }
    }

    // (+) Powerup - Proximity
    const nearestPowerup = findNearestPowerup(predictedAiPos);
    if (nearestPowerup) {
        const distAfter = distance(predictedAiPos, nearestPowerup);
        const nearestBefore = findNearestPowerup(currentAiPos);
        const distBefore = nearestBefore ? distance(currentAiPos, nearestBefore) : Infinity;

        if (distAfter < distBefore && distAfter > 0) { // Check distAfter > 0 to ensure not collection case
            score += Math.max(0, 250 - distAfter * 25); // Increased bonus, sharper drop-off
        }
    }

     // (+/-) Distance to Player: Prefer a medium distance
     const distToPlayer = distance(predictedAiPos, currentPlayerPos);
     const idealDist = Math.max(4, Math.floor(GRID_SIZE / 3)); // Ideal dist scales slightly
     score -= Math.pow(distToPlayer - idealDist, 2) * 0.5; // Quadratic penalty for distance deviation


    // (+) Offensive - Setup: Can AI shoot player *next turn* from predicted position?
     if (action.type === 'move' || action.type === 'stay') {
         if (canHitTarget(predictedAiPos, currentPlayerPos, aiWeaponLevel, currentPlayerPos)) { // Use updated check
             score += 180;
             // Bonus if it's a straight shot?
             if(canHitTarget(predictedAiPos, currentPlayerPos, 1, currentPlayerPos)) {
                 score += 70;
             }
             // Bonus if player *cannot* shoot back immediately from that position?
             if(!canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel, predictedAiPos)){
                 score += 120; // Good safe attacking position
             }
         }
     }

    // Add small random factor to break ties more naturally
    score += (Math.random() - 0.5) * 2; // Random nudge between -1 and 1


    return score;
}


// --- Resolution Phase (Modified for Move-First Logic) ---

async function startResolution() {
    console.log("Starting Resolution Phase (Move First)...");
    if (isResolving) return;
    isResolving = true;
    gamePhase = 'resolving';
    updatePhaseIndicator();
    setMessage("Resolving Actions...");
    disablePlanningControls();

    const initialPlayerPos = { ...playerPos };
    const initialAiPos = { ...aiPos };
    let conflictMessages = [];

    // --- Step 1: Resolve Movement Conflicts & Calculate Final Positions ---
    setMessage("Resolving Movement...");
    let finalPlayerPos = { ...initialPlayerPos };
    let finalAiPos = { ...initialAiPos };
    let playerMoveValid = false;
    let aiMoveValid = false;

    const playerMoving = playerPlannedAction?.type === 'move';
    const aiMoving = aiPlannedAction?.type === 'move';
    const pTarget = playerMoving ? playerPlannedAction.target : null;
    const aTarget = aiMoving ? aiPlannedAction.target : null;

    playerMoveValid = playerMoving && isValidMoveTarget(pTarget, initialPlayerPos, initialAiPos);
    aiMoveValid = aiMoving && isValidMoveTarget(aTarget, initialAiPos, initialPlayerPos);

    if (playerMoveValid && aiMoveValid) {
        if (pTarget.x === aTarget.x && pTarget.y === aTarget.y) { // Collision
            conflictMessages.push("Collision! Both bounced back.");
            playerMoveValid = false; aiMoveValid = false;
        } else if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y && aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) { // Swap
            conflictMessages.push("Players swapped positions!");
            // Both valid
        } else if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y) { // Player blocked by AI target spot
            conflictMessages.push("Player move blocked!"); playerMoveValid = false;
        } else if (aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) { // AI blocked by Player target spot
            conflictMessages.push("AI move blocked!"); aiMoveValid = false;
        }
    } else if (playerMoveValid) { // Only player moves
        if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y) { // Player blocked by stationary AI
            conflictMessages.push("Player move blocked!"); playerMoveValid = false;
        }
    } else if (aiMoveValid) { // Only AI moves
        if (aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) { // AI blocked by stationary Player
            conflictMessages.push("AI move blocked!"); aiMoveValid = false;
        }
    }

    // Determine final positions based on valid moves
    if (playerMoveValid) finalPlayerPos = { ...pTarget };
    if (aiMoveValid) finalAiPos = { ...aTarget };

    // --- Step 2: Execute Movement Animation ---
    const playerMovePromise = (playerMoveValid && (finalPlayerPos.x !== initialPlayerPos.x || finalPlayerPos.y !== initialPlayerPos.y))
                            ? animateMove(playerMesh, finalPlayerPos) : Promise.resolve();
    const aiMovePromise = (aiMoveValid && (finalAiPos.x !== initialAiPos.x || finalAiPos.y !== initialAiPos.y))
                            ? animateMove(aiMesh, finalAiPos) : Promise.resolve();

    await Promise.all([playerMovePromise, aiMovePromise]); // Wait for animations to complete

    // --- Step 3: Update Logical Positions & Collect Powerups ---
    // Update state variables AFTER animation completes
    playerPos = { ...finalPlayerPos };
    aiPos = { ...finalAiPos };

    // Check for powerup collection at the NEW positions
    let playerCollectedPowerup = false;
    const powerupIndexPlayer = powerUpPositions.findIndex(p => p.x === playerPos.x && p.y === playerPos.y);
    if (powerupIndexPlayer !== -1) {
        playerCollectedPowerup = true;
        playerWeaponLevel = Math.min(MAX_WEAPON_LEVEL, playerWeaponLevel + 1);
        conflictMessages.push("Player collected weapon upgrade!");
        removePowerup3D(playerPos.x, playerPos.y);
        powerUpPositions.splice(powerupIndexPlayer, 1);
        updateWeaponLevelInfo();
    }

    const powerupIndexAi = powerUpPositions.findIndex(p => p.x === aiPos.x && p.y === aiPos.y);
    if (powerupIndexAi !== -1) {
         aiWeaponLevel = Math.min(MAX_WEAPON_LEVEL, aiWeaponLevel + 1);
         conflictMessages.push("AI collected weapon upgrade!");
         removePowerup3D(aiPos.x, aiPos.y);
         powerUpPositions.splice(powerupIndexAi, 1);
         updateWeaponLevelInfo();
    }

    // Short delay after movement/collection if needed
    await wait(RESOLVE_STEP_DELAY / 2);

    // --- Step 4: Calculate Shot Outcomes BASED ON FINAL POSITIONS ---
    let playerWillBeHit = false;
    let aiWillBeHit = false;
    const playerShotPath = playerPlannedAction?.type === 'shoot' ? playerPlannedAction.path : null;
    const aiShotPath = aiPlannedAction?.type === 'shoot' ? aiPlannedAction.path : null;

    // Check if AI shot hits Player's FINAL position
    if (aiShotPath?.some(p => p.x === playerPos.x && p.y === playerPos.y)) {
        playerWillBeHit = true;
        console.log("AI Hit Player at final pos:", playerPos);
    }
    // Check if Player shot hits AI's FINAL position
    if (playerShotPath?.some(p => p.x === aiPos.x && p.y === aiPos.y)) {
        aiWillBeHit = true;
        console.log("Player Hit AI at final pos:", aiPos);
    }

    // --- Step 5: Visualize Shots ---
    setMessage(conflictMessages.join(" ") + (conflictMessages.length > 0 ? " " : "") + "Shots Firing...");
    if (playerShotPath) createLaserBeam(playerShotPath, playerLaserMaterial);
    if (aiShotPath) createLaserBeam(aiShotPath, aiLaserMaterial);

    await wait(SHOT_FLASH_DURATION + RESOLVE_STEP_DELAY / 2); // Wait for laser effects

    // --- Step 6: Determine Game Outcome & Transition ---
    let finalMessage = conflictMessages.join(" "); // Reuse conflict messages

    if (playerWillBeHit && aiWillBeHit) {
        endGame("Draw! Both players hit each other!", 'Draw');
    } else if (playerWillBeHit) {
        endGame("AI Wins! Player was hit.", 'AI');
    } else if (aiWillBeHit) {
        endGame("Player Wins! AI was hit.", 'Player');
    } else {
        // Game Continues
        gamePhase = 'planning';
        playerPlannedAction = null;
        aiPlannedAction = null;
        isResolving = false;

        maybeSpawnPowerup();

        setMessage(finalMessage || "Plan your next action.");
        updatePhaseIndicator();
        enablePlanningControls();
        setPlanningMode('move'); // Reset to default move mode
    }
}

// --- Animate Move Function ---
// ... (Copy animateMove from previous version) ...
function animateMove(mesh, targetGridPos) {
    return new Promise(resolve => {
        const startPos3D = mesh.position.clone();
         const yOffset = mesh.geometry instanceof THREE.CapsuleGeometry
            ? CELL_3D_SIZE * 0.4 + 0.1 // Player offset
            : CELL_3D_SIZE * 0.4 + 0.4; // AI offset (cone base is at 0)
        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, yOffset);

        new TWEEN.Tween(startPos3D)
            .to(targetPos3D, MOVEMENT_DURATION)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .onUpdate(() => {
                mesh.position.copy(startPos3D);
            })
            .onComplete(resolve) // Resolve promise when tween finishes
            .start();
    });
}


// --- Utility Wait Function ---
function wait(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

// --- Powerup Logic Functions ---
// ... (Copy maybeSpawnPowerup, spawnPowerup from previous version) ...
function maybeSpawnPowerup() { /* ... */
     if (gameOverState || isResolving) return;
    if (powerUpPositions.length < MAX_POWERUPS) {
        if (Math.random() < POWERUP_SPAWN_CHANCE) { spawnPowerup(); }
    }
}
function spawnPowerup() { /* ... */
    let attempts = 0;
    while (attempts < 50) {
        const x = Math.floor(Math.random() * GRID_SIZE); const y = Math.floor(Math.random() * GRID_SIZE);
        const isFloor = isValid(x,y) && grid[y][x] === 'floor';
        const isUnoccupiedLogically = (x !== playerPos.x || y !== playerPos.y) && (x !== aiPos.x || y !== aiPos.y) && !powerUpPositions.some(p => p.x === x && p.y === y);
        if (isFloor && isUnoccupiedLogically) {
            powerUpPositions.push({ x, y });
            const newPowerupMesh = createPowerup3D(x, y);
            powerupMeshes.push(newPowerupMesh);
            console.log(`Spawned powerup at ${x},${y}`); return true;
        }
        attempts++;
    }
     console.warn("Could not find suitable location to spawn powerup."); return false;
}

// --- Game Over Function ---
// ... (Copy endGame from previous version) ...
function endGame(message, winner) { /* ... */
    console.log("Game Over:", message);
    gamePhase = 'gameOver';
    gameOverState = { winner: winner, message: message };
    setMessage(message);
    updatePhaseIndicator();
    disablePlanningControls();
    isResolving = false;
}

// --- Utility Functions (isValid, isWall, getValidMoves, isValidMoveTarget, distance, findNearestPowerup, canHitTarget) ---
// ... (Copy from previous version) ...
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === 'wall'; }
function getValidMoves(unitPos, opponentPos) { /* ... */
    const moves = []; const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach(dir => {
        const nextX = unitPos.x + dir.dx; const nextY = unitPos.y + dir.dy;
        if (isValid(nextX, nextY) && !isWall(nextX, nextY) && !(nextX === opponentPos.x && nextY === opponentPos.y)) { moves.push({ x: nextX, y: nextY }); }
    }); return moves;
}
 function isValidMoveTarget(target, unitPos, opponentPos){ /* ... */
      if (!target || !isValid(target.x, target.y) || isWall(target.x, target.y)) return false;
      const dx = Math.abs(target.x - unitPos.x); const dy = Math.abs(target.y - unitPos.y);
      if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return false; return true;
 }
function distance(pos1, pos2) { /* ... */
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}
function findNearestPowerup(pos) { /* ... */
     let minDist = Infinity; let nearest = null;
     powerUpPositions.forEach(p => { const d = distance(pos, p); if(d < minDist) { minDist = d; nearest = p; } }); return nearest;
}
function canHitTarget(attackerPos, targetPos, attackerWeaponLevel, currentTargetActualPos) { /* ... */
    const maxBends = attackerWeaponLevel - 1;
    const q = [{ pos: attackerPos, pathSoFar: [], bendsMade: -1 }];
    const visited = new Map();

    while (q.length > 0) {
        const currentState = q.shift();
        const { pos, pathSoFar, bendsMade } = currentState;
        const visitedKey = `${pos.x},${pos.y},${bendsMade}`;
        if (visited.has(visitedKey)) continue;
        visited.set(visitedKey, true);

        if (pos.x === targetPos.x && pos.y === targetPos.y) return true;
        if (bendsMade + 1 > maxBends) continue;

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        let currentDirection = {dx: 0, dy: 0};
        if (pathSoFar.length > 0) {
             const prevPos = pathSoFar.length > 1 ? pathSoFar[pathSoFar.length - 2] : attackerPos;
             currentDirection.dx = Math.sign(pos.x - prevPos.x); currentDirection.dy = Math.sign(pos.y - prevPos.y);
         }

        for (const dir of directions) {
             if (currentDirection.dx !== 0 || currentDirection.dy !== 0) {
                if (dir.dx === -currentDirection.dx && dir.dy === 0) continue;
                if (dir.dy === -currentDirection.dy && dir.dx === 0) continue;
            }
            let currentExplorePos = { ...pos };
             for (let i = 1; i <= GRID_SIZE; i++) {
                 const nextX = currentExplorePos.x + dir.dx; const nextY = currentExplorePos.y + dir.dy;
                 if (!isValid(nextX, nextY) || isWall(nextX, nextY)) break;
                 currentExplorePos = { x: nextX, y: nextY };
                 const nextPath = [...pathSoFar, currentExplorePos];
                 const nextStateKey = `${currentExplorePos.x},${currentExplorePos.y},${bendsMade + 1}`;
                 if(!visited.has(nextStateKey)){ q.push({ pos: currentExplorePos, pathSoFar: nextPath, bendsMade: bendsMade + 1 }); }
                 if (currentExplorePos.x === targetPos.x && currentExplorePos.y === targetPos.y) return true;
             }
        }
    }
    return false;
}


// --- Start Game ---
init();