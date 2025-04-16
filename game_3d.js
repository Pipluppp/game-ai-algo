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
const GRID_SIZE = 15;
const CELL_3D_SIZE = 2; // Size of each cell in 3D space
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
const MAX_WEAPON_LEVEL = 3;
const MAX_POWERUPS = 3;
const POWERUP_SPAWN_CHANCE = 0.6;

// Timing Constants (milliseconds)
const SHOT_FLASH_DURATION = 400; // Laser visible duration
const MOVEMENT_DURATION = 350;   // Unit movement animation
const RESOLVE_STEP_DELAY = 150;

// --- Three.js Setup ---
let scene, camera, renderer, controls;
let gameBoardGroup; // Group to hold all game elements (cells, units, etc.)
let floorMeshes = []; // 2D array to store references to floor meshes for highlighting
let wallMeshes = [];   // Store wall meshes if needed for interaction/removal
let powerupMeshes = []; // Array to store powerup mesh objects {mesh: THREE.Mesh, pos: {x, y}}
let playerMesh, aiMesh;
let playerLevelIndicator, aiLevelIndicator; // Meshes/sprites for level text
let activeHighlights = []; // Store meshes currently highlighted
let activeLasers = []; // Store active laser beam meshes

// Materials
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 });
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, roughness: 0.5 });
const aiMaterial = new THREE.MeshStandardMaterial({ color: 0xdc3545, roughness: 0.5 });
const powerupMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0xcc9000, roughness: 0.4 });
const moveHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
const pathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.6 });
const hitHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 });
const playerLaserMaterial = new THREE.MeshStandardMaterial({ color: 0x00bfff, emissive: 0x008fcc, transparent: true, opacity: 0.85 });
const aiLaserMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xcc4a4a, transparent: true, opacity: 0.85 });

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane; // Invisible plane for raycasting grid clicks

// --- Game State (Same as 2D version) ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerWeaponLevel = 1;
let aiWeaponLevel = 1;
let powerUpPositions = []; // Array of {x, y}
let gamePhase = 'planning'; // 'planning', 'resolving', 'gameOver'
let currentPlanningMode = null; // 'move' or 'shoot'
let playerPlannedAction = null;
let aiPlannedAction = null;
let hoverPos = null;
let hoverPath = [];
let partialShootPlan = null;
let gameOverState = null;
let isResolving = false; // Flag to prevent input during resolution steps

// --- Initialization ---

function init() {
    console.log("Initializing 3D Game...");
    initThreeJS();
    initGameLogic(); // Initialize game state after Three.js setup
    setupInputListeners();
    animate(); // Start the render loop
    console.log("Game Initialized.");
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xabcdef); // Light blue background

    // Camera
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 0.8, GRID_SIZE * CELL_3D_SIZE * 0.6); // Angled top-down view
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(GRID_SIZE * 0.5, GRID_SIZE * 1.5, GRID_SIZE * 0.5);
    directionalLight.castShadow = true;
     // Configure shadow properties
     directionalLight.shadow.mapSize.width = 1024;
     directionalLight.shadow.mapSize.height = 1024;
     directionalLight.shadow.camera.near = 0.5;
     directionalLight.shadow.camera.far = GRID_SIZE * CELL_3D_SIZE * 3;
     const shadowCamSize = GRID_SIZE * CELL_3D_SIZE * 0.6;
     directionalLight.shadow.camera.left = -shadowCamSize;
     directionalLight.shadow.camera.right = shadowCamSize;
     directionalLight.shadow.camera.top = shadowCamSize;
     directionalLight.shadow.camera.bottom = -shadowCamSize;

    scene.add(directionalLight);
     // Optional: Add a light helper
    // const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // scene.add(lightHelper);
     // Optional: Add a shadow camera helper
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);


    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0); // Point controls at the center of the board
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent camera from going below ground plane

    // Game Board Group
    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);

    // Intersection Plane (for mouse clicks)
    const planeGeom = new THREE.PlaneGeometry(GRID_SIZE * CELL_3D_SIZE, GRID_SIZE * CELL_3D_SIZE);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }); // Invisible
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    intersectionPlane.position.y = 0.01; // Slightly above floor meshes to ensure intersection
    scene.add(intersectionPlane); // Add directly to scene, not the group

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

function initGameLogic() {
    clearBoard3D(); // Clear any existing 3D objects from previous game

    generateGrid(); // Generate the logical grid layout

    // Create 3D representation of the grid
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
    currentPlanningMode = null;
    playerPlannedAction = null;
    aiPlannedAction = null;
    hoverPos = null;
    hoverPath = [];
    partialShootPlan = null;
    gameOverState = null;
    isResolving = false;

    // Create 3D units
    createUnits3D();

    // Initial powerups
    maybeSpawnPowerup();
    maybeSpawnPowerup();

    setMessage("Plan your action.");
    updatePhaseIndicator();
    updateWeaponLevelInfo();
    enablePlanningControls();
    clearHighlights();

    // Adjust camera target slightly if needed
    controls.target.set(0, 0, 0);
    controls.update();
}

function setupInputListeners() {
    btnPlanMove.addEventListener('click', () => setPlanningMode('move'));
    btnPlanShoot.addEventListener('click', () => setPlanningMode('shoot'));
    btnReset.addEventListener('click', initGameLogic); // Reset only game logic and 3D state
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
}

// --- Grid Generation (Same as 2D) ---
function generateGrid() { /* ... copy from 2D version ... */
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
                // Avoid blocking corners initially for start pos finding
                if ((x > 1 && x < GRID_SIZE - 2) || (y > 1 && y < GRID_SIZE - 2)) {
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
    setMessage("Warning: Grid generation failed, using fallback.");
}
function isGridConnected() { /* ... copy from 2D version ... */
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
function findFirstFloor() { /* ... copy from 2D version ... */
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor') return { x, y };
        }
    }
    return null;
}
function findStartPositions() { /* ... copy from 2D version ... */
    const potentialStarts = [
        { x: 1, y: 1 },               // Top-leftish
        { x: GRID_SIZE - 2, y: GRID_SIZE - 2 }, // Bottom-rightish
        { x: 1, y: GRID_SIZE - 2 },   // Bottom-leftish
        { x: GRID_SIZE - 2, y: 1 }    // Top-rightish
    ];

    const playerStart = findNearestFloorBFS(potentialStarts[0]);
    const aiStart = findNearestFloorBFS(potentialStarts[1], playerStart ? [playerStart] : []); // Avoid placing AI on player start

    if (playerStart && aiStart) {
        // Ensure they are reasonably far apart
        if(distance(playerStart, aiStart) > GRID_SIZE / 2) {
             return { player: playerStart, ai: aiStart };
        }
         // If too close, try other corners
         const aiStartAlt = findNearestFloorBFS(potentialStarts[2], playerStart ? [playerStart] : []);
          if (aiStartAlt && distance(playerStart, aiStartAlt) > GRID_SIZE / 2) {
                return { player: playerStart, ai: aiStartAlt };
          }
         const aiStartAlt2 = findNearestFloorBFS(potentialStarts[3], playerStart ? [playerStart] : []);
          if (aiStartAlt2 && distance(playerStart, aiStartAlt2) > GRID_SIZE / 2) {
                return { player: playerStart, ai: aiStartAlt2 };
          }
          // Fallback if other corners don't work well, just use the first pair
           return { player: playerStart, ai: aiStart };

    }

    return null; // Couldn't find suitable spots
}
function findNearestFloorBFS(startSearchPos, occupied = []) { /* ... copy from 2D version ... */
    const q = [{ pos: startSearchPos, dist: 0 }];
    const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    occupied.forEach(occ => visited.add(`${occ.x},${occ.y}`)); // Mark occupied as visited

    while (q.length > 0) {
        const current = q.shift();
        const { x, y } = current.pos;

        if (isValid(x, y) && grid[y][x] === 'floor' && !occupied.some(occ => occ.x === x && occ.y === y)) {
            return { x, y }; // Found a valid, unoccupied floor
        }

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
             // Only search within grid boundaries
            if (isValid(n.x, n.y) && !visited.has(key)) {
                visited.add(key);
                 // Add neighbors to search, even if they are walls initially,
                 // but prioritize closer floor tiles by sorting/managing queue if needed
                 // Simple BFS explores layer by layer, so first floor found is closest.
                q.push({ pos: n, dist: current.dist + 1 });
            }
        }
    }
    return null; // No floor found reachable from startSearchPos
}

// --- 3D Object Creation / Management ---

// Map grid coords (x, y) to 3D world coords (Vector3)
function get3DPosition(x, y, yOffset = 0) {
    const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    return new THREE.Vector3(worldX, yOffset, worldZ);
}

// Get grid coords (x, y) from 3D world position
function getGridCoords(position) {
    const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    return { x, y };
}


function clearBoard3D() {
    // Remove all meshes from the group
    while (gameBoardGroup.children.length > 0) {
        const child = gameBoardGroup.children[0];
        gameBoardGroup.remove(child);
        // Dispose geometry and material if they are not shared/reused extensively
        if (child.geometry) child.geometry.dispose();
        // if (child.material) child.material.dispose(); // Be careful if materials ARE shared
    }
    // Clear references
    floorMeshes = [];
    wallMeshes = [];
    powerupMeshes = [];
    playerMesh = null;
    aiMesh = null;
    playerLevelIndicator = null;
    aiLevelIndicator = null;
    activeHighlights = [];
    activeLasers.forEach(laser => scene.remove(laser)); // Lasers are added directly to scene
    activeLasers = [];
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    wallMeshes = []; // Reset wall meshes array

    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE * 0.95, 0.1, CELL_3D_SIZE * 0.95); // Slightly smaller for gaps
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE * 0.9, WALL_HEIGHT, CELL_3D_SIZE * 0.9);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);

            // Floor
            const floorMesh = new THREE.Mesh(floorGeom, floorMaterial.clone()); // Clone material for highlighting potential
            floorMesh.position.copy(pos);
            floorMesh.position.y = -0.05; // Base floor level
            floorMesh.castShadow = false;
            floorMesh.receiveShadow = true;
            floorMesh.userData = { gridX: x, gridY: y, type: 'floor' }; // Store grid coords
            gameBoardGroup.add(floorMesh);
            floorMeshes[y][x] = floorMesh;

            // Wall
            if (grid[y][x] === 'wall') {
                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
                wallMesh.position.copy(pos);
                wallMesh.position.y += WALL_HEIGHT / 2 - 0.05; // Position wall on top of floor plane
                wallMesh.castShadow = true;
                wallMesh.receiveShadow = true;
                wallMesh.userData = { gridX: x, gridY: y, type: 'wall' };
                gameBoardGroup.add(wallMesh);
                wallMeshes.push(wallMesh); // Add to wall list
            }
        }
    }
}

function createUnits3D() {
    // Player
    const playerGeom = new THREE.CapsuleGeometry(CELL_3D_SIZE * 0.3, CELL_3D_SIZE * 0.5, 4, 8);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, CELL_3D_SIZE * 0.55); // Elevate slightly
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: 'player' };
    gameBoardGroup.add(playerMesh);
    // Player level indicator (simple text sprite)
    playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
    playerLevelIndicator.position.set(0, CELL_3D_SIZE * 0.7, 0); // Position above the mesh
    playerMesh.add(playerLevelIndicator); // Add as child


    // AI
    const aiGeom = new THREE.IcosahedronGeometry(CELL_3D_SIZE * 0.4, 0); // Simple sphere/polyhedron
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, CELL_3D_SIZE * 0.4); // Elevate slightly
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: 'ai' };
    gameBoardGroup.add(aiMesh);
     // AI level indicator
    aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
    aiLevelIndicator.position.set(0, CELL_3D_SIZE * 0.6, 0); // Position above the mesh
    aiMesh.add(aiLevelIndicator); // Add as child

    updateWeaponLevelVisuals(); // Initial update
}

function createLevelTextMesh(level) {
     const canvas = document.createElement('canvas');
     const context = canvas.getContext('2d');
     const size = 64; // Texture size
     canvas.width = size;
     canvas.height = size;
     context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Background for contrast
     context.fillRect(0,0,size,size);
     context.font = `Bold ${size * 0.6}px Arial`;
     context.fillStyle = 'white';
     context.textAlign = 'center';
     context.textBaseline = 'middle';
     context.fillText(level.toString(), size / 2, size / 2 + 2); // Adjust position slightly

     const texture = new THREE.CanvasTexture(canvas);
     const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
     const sprite = new THREE.Sprite(spriteMaterial);
     sprite.scale.set(CELL_3D_SIZE * 0.5, CELL_3D_SIZE * 0.5, 1); // Adjust sprite size in world units
     return sprite;
}


function updateWeaponLevelVisuals() {
    if (playerMesh && playerLevelIndicator) {
        playerMesh.remove(playerLevelIndicator); // Remove old one
        playerLevelIndicator.material.map.dispose(); // Dispose texture
        playerLevelIndicator.material.dispose();    // Dispose material
        playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
        playerLevelIndicator.position.set(0, CELL_3D_SIZE * 0.7, 0);
        playerMesh.add(playerLevelIndicator);
    }
     if (aiMesh && aiLevelIndicator) {
        aiMesh.remove(aiLevelIndicator); // Remove old one
        aiLevelIndicator.material.map.dispose();
        aiLevelIndicator.material.dispose();
        aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
        aiLevelIndicator.position.set(0, CELL_3D_SIZE * 0.6, 0);
        aiMesh.add(aiLevelIndicator);
    }
     // Optional: Change material color/emissiveness based on level
    // playerMaterial.emissive.setHex(playerWeaponLevel > 1 ? 0x3399ff : 0x000000);
    // aiMaterial.emissive.setHex(aiWeaponLevel > 1 ? 0xff6666 : 0x000000);
}


function createPowerup3D(x, y) {
    const powerupGeom = new THREE.TorusKnotGeometry(CELL_3D_SIZE * 0.2, CELL_3D_SIZE * 0.08, 50, 8);
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
    mesh.position.copy(get3DPosition(x, y, CELL_3D_SIZE * 0.4));
    mesh.castShadow = true;
    mesh.userData = { type: 'powerup', gridX: x, gridY: y, spinSpeed: Math.random() * 0.02 + 0.01 }; // Add spin speed
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}

function removePowerup3D(x, y) {
    const index = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (index !== -1) {
        const powerupObj = powerupMeshes[index];
        gameBoardGroup.remove(powerupObj.mesh);
        if (powerupObj.mesh.geometry) powerupObj.mesh.geometry.dispose();
        // Don't dispose shared material
        powerupMeshes.splice(index, 1);
    }
}

// --- Highlighting ---

function clearHighlights() {
    activeHighlights.forEach(mesh => {
        // Restore original material (assuming floorMaterial was cloned)
        mesh.material = floorMaterial.clone(); // Re-apply a fresh clone
    });
    activeHighlights = [];
}

function highlightCell(x, y, highlightMaterial) {
    if (isValid(x, y) && floorMeshes[y][x]) {
        const floorMesh = floorMeshes[y][x];
         // Check if already highlighted with a different color maybe?
         if (!activeHighlights.includes(floorMesh)) {
             floorMesh.material = highlightMaterial; // Apply the highlight
             activeHighlights.push(floorMesh);
         } else if (floorMesh.material !== highlightMaterial) {
             floorMesh.material = highlightMaterial; // Update highlight color
         }
    }
}

function renderHighlights() {
    clearHighlights(); // Clear previous frame's highlights first

    if (gamePhase !== 'planning' || gameOverState || isResolving) return;

    // --- Move Mode Highlights ---
    if (currentPlanningMode === 'move') {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));

        // Highlight locked move target (optional visual)
        if (playerPlannedAction?.type === 'move') {
            // Could add a temporary ring/marker mesh instead of changing floor color
            // highlightCell(playerPlannedAction.target.x, playerPlannedAction.target.y, hitHighlightMaterial); // Example: use red for target
        }
    }
    // --- Shoot Mode Highlights ---
    else if (currentPlanningMode === 'shoot') {
         let pathToShow = [];
         let hitOpponent = false;
         const opponentTargetPos = aiPos; // Target the AI

         // Determine which path to show: hover, partial, or final locked plan
         if (hoverPath.length > 0 && !playerPlannedAction) { // Show hover only if no action locked yet
             pathToShow = hoverPath;
         } else if (partialShootPlan?.path?.length > 0 && !playerPlannedAction) { // Show partial if exists and no action locked
             pathToShow = partialShootPlan.path;
         } else if (playerPlannedAction?.type === 'shoot') { // Show locked path
             pathToShow = playerPlannedAction.path;
         }


         // Highlight the path cells
         pathToShow.forEach(p => {
             highlightCell(p.x, p.y, pathHighlightMaterial);
             if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y) {
                 hitOpponent = true;
             }
         });

        // Highlight opponent if hit
        if (hitOpponent) {
             highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial);
             // Maybe also flash the AI model slightly? (More advanced)
        }
    }
}

// --- Laser Effect ---

function createLaserBeam(path, material) {
    if (!path || path.length < 1) return null;

     const points = [];
     // Start slightly above the center of the starting cell
     const startOffset = 0.3 * CELL_3D_SIZE; // How high above the floor
     points.push(get3DPosition(path[0].x, path[0].y, startOffset));

     // Add points for the center of each subsequent cell in the path
     for (let i = 1; i < path.length; i++) {
         points.push(get3DPosition(path[i].x, path[i].y, startOffset));
     }

     // If only one point, add a tiny segment in a default direction (or handle error)
     if (points.length === 1) {
         const nextPoint = points[0].clone();
         nextPoint.x += 0.01; // Tiny segment if only one cell targeted
         points.push(nextPoint);
     }


    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, Math.max(1, path.length * 2), CELL_3D_SIZE * 0.08, 8, false); // Radius 0.08
    const laserMesh = new THREE.Mesh(tubeGeom, material);
    laserMesh.userData = { type: 'laser' };

    scene.add(laserMesh); // Add directly to scene
    activeLasers.push(laserMesh);

    // Fade out and remove after duration
    const tween = new TWEEN.Tween({ opacity: material.opacity })
        .to({ opacity: 0 }, SHOT_FLASH_DURATION * 0.5) // Fade out in the second half
        .delay(SHOT_FLASH_DURATION * 0.5)
        .onUpdate((obj) => {
            laserMesh.material.opacity = obj.opacity;
        })
        .onComplete(() => {
            scene.remove(laserMesh);
            laserMesh.geometry.dispose();
            // Don't dispose shared material
            const index = activeLasers.indexOf(laserMesh);
            if (index > -1) activeLasers.splice(index, 1);
        })
        .start();

    return laserMesh;
}


// --- Animation Loop ---

function animate(time) {
    requestAnimationFrame(animate);

    TWEEN.update(time); // Update animations

    controls.update(); // Update camera controls

    // Simple Powerup Animation
    powerupMeshes.forEach(p => {
        p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.01;
        p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.01) * 0.5;
    });

     // Rotate level indicators to face camera (optional, can be tricky with orbit controls)
     /*
     if (playerLevelIndicator && aiLevelIndicator) {
         const camPos = camera.position;
         playerLevelIndicator.lookAt(camPos);
         aiLevelIndicator.lookAt(camPos);
     }
     */

     renderHighlights(); // Update highlights each frame during planning


    renderer.render(scene, camera);
}

// --- Input Handling (Raycasting) ---

function handleCanvasMouseMove(event) {
    updateMouseCoords(event);

    if (gamePhase !== 'planning' || currentPlanningMode !== 'shoot' || playerPlannedAction || gameOverState || isResolving || !partialShootPlan?.needsInput) {
        if (hoverPath.length > 0) { // Clear old hover path if conditions not met
            hoverPath = [];
             // clearHighlights(); // Highlights are cleared/redrawn in animate loop
        }
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane); // Intersect with the invisible plane

    if (intersects.length > 0) {
        const intersectionPoint = intersects[0].point;
        const { x, y } = getGridCoords(intersectionPoint); // Convert 3D point to grid coords

        if (!hoverPos || hoverPos.x !== x || hoverPos.y !== y) {
             if(isValid(x, y)){ // Only process if valid grid cell
                hoverPos = { x, y };

                // --- Calculate hover path logic (Adapted from 2D version) ---
                const startPos = partialShootPlan.segments.length > 0 ? partialShootPlan.lastBendPos : playerPos;
                const currentLevel = playerWeaponLevel;
                const bendsSoFar = partialShootPlan.segments.length;

                const dx = Math.abs(x - startPos.x);
                const dy = Math.abs(y - startPos.y);
                let dir = { dx: 0, dy: 0 };

                if (dx === 0 && dy === 0) {
                    hoverPath = []; // Hovering over start, no path
                     // Highlights cleared/redrawn in animate loop
                    return;
                } else if (dx > dy) {
                    dir.dx = Math.sign(x - startPos.x);
                } else {
                    dir.dy = Math.sign(y - startPos.y);
                }

                // Prevent reversing previous segment direction
                if (partialShootPlan.segments.length > 0) {
                    const prevDir = partialShootPlan.segments[partialShootPlan.segments.length - 1].direction;
                    if (dir.dx === -prevDir.dx && dir.dy === 0 || dir.dy === -prevDir.dy && dir.dx === 0) {
                        hoverPath = []; // Invalid reverse direction
                         // Highlights cleared/redrawn in animate loop
                        return;
                    }
                }

                let tempPathData = calculateShotPathSegment(startPos, dir, aiPos, 999); // Calculate one segment
                hoverPath = [...partialShootPlan.path, ...tempPathData.path];
                 // Highlights cleared/redrawn in animate loop

             } else {
                  // Mouse is off the valid grid part of the plane
                   hoverPos = null;
                   hoverPath = [];
             }
        }
    } else {
        // Not intersecting the plane
         hoverPos = null;
         hoverPath = [];
    }
}

function handleCanvasClick(event) {
     if (gamePhase !== 'planning' || playerPlannedAction || gameOverState || isResolving) return;

     updateMouseCoords(event);

     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObject(intersectionPlane);

    if (intersects.length > 0) {
        const intersectionPoint = intersects[0].point;
        const { x, y } = getGridCoords(intersectionPoint); // Convert 3D point to grid coords

         if (isValid(x,y)) { // Ensure click is within grid bounds
             if (currentPlanningMode === 'move') {
                handleMoveInput(x, y);
            } else if (currentPlanningMode === 'shoot') {
                handleShootInput(x, y);
            }
         }
    }
}

function updateMouseCoords(event) {
    const rect = canvasContainer.getBoundingClientRect();
    // Calculate mouse position in normalized device coordinates (-1 to +1) for both components
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}


// --- UI Update Functions (Mostly Same as 2D) ---
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() { /* ... copy from 2D version ... */
    let phaseText = 'Unknown';
    if (gameOverState) {
        phaseText = `Game Over! ${gameOverState.message}`;
    } else {
         phaseText = `Phase: ${gamePhase.charAt(0).toUpperCase() + gamePhase.slice(1)}`;
    }
    phaseIndicator.textContent = phaseText;
}
function updateWeaponLevelInfo() { /* ... copy from 2D version ... */
     weaponLevelInfo.textContent = `Your Weapon Level: ${playerWeaponLevel}`;
     aiWeaponLevelInfo.textContent = `AI Weapon Level: ${aiWeaponLevel}`;
     updateWeaponLevelVisuals(); // Update 3D visuals as well
}
function enablePlanningControls() { /* ... copy from 2D version, plus clear highlights */
    if (gameOverState) return;
    btnPlanMove.disabled = false;
    btnPlanShoot.disabled = false;
    isResolving = false; // Make sure resolving flag is off
     clearHighlights(); // Clear any lingering highlights from resolution
}
function disablePlanningControls() { /* ... copy from 2D version, plus clear highlights */
    btnPlanMove.disabled = true;
    btnPlanShoot.disabled = true;
    btnPlanMove.classList.remove('active');
    btnPlanShoot.classList.remove('active');
    currentPlanningMode = null;
    hoverPath = [];
    partialShootPlan = null;
    clearHighlights(); // Clear planning highlights
}

// --- Planning Phase Logic (Mostly Same as 2D) ---
function setPlanningMode(mode) { /* ... copy from 2D version ... */
    if (gamePhase !== 'planning' || playerPlannedAction || gameOverState || isResolving) return;

    // If clicking the already active mode, deactivate it (optional)
    if (currentPlanningMode === mode) {
        currentPlanningMode = null;
    } else {
        currentPlanningMode = mode;
    }


    playerPlannedAction = null; // Clear any previous incomplete plan if switching modes
    partialShootPlan = null;
    hoverPath = [];

    btnPlanMove.classList.toggle('active', currentPlanningMode === 'move');
    btnPlanShoot.classList.toggle('active', currentPlanningMode === 'shoot');

    if (currentPlanningMode === 'move') {
         setMessage("Click an adjacent green square to plan your move.");
    } else if (currentPlanningMode === 'shoot') {
         setMessage(`Click to set shot direction (Level ${playerWeaponLevel}).`);
         // Initialize shoot plan immediately when mode is selected
          partialShootPlan = {
             needsInput: true,
             maxBends: playerWeaponLevel - 1,
             segments: [],
             path: [],
             lastBendPos: playerPos
         };
    } else {
         setMessage("Select 'Plan Move' or 'Plan Shoot'.");
    }

    // renderBoard(); // Render handled by animate loop + renderHighlights
}
function handleMoveInput(targetX, targetY) { /* ... copy from 2D version ... */
    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidMove = validMoves.some(move => move.x === targetX && move.y === targetY);

    if (isValidMove) {
        playerPlannedAction = { type: 'move', target: { x: targetX, y: targetY } };
        setMessage("Move planned. Waiting for AI...");
        lockPlayerAction();
    } else {
        setMessage("Invalid move target. Click a green square.");
        // Clear highlights maybe? Handled by animate loop.
    }
}
function handleShootInput(clickX, clickY) { /* ... copy from 2D version ... */
     // Ensure partial plan is initialized (should be by setPlanningMode)
     if (!partialShootPlan) {
         console.error("Shoot input without partial plan!");
         partialShootPlan = { // Re-initialize just in case
             needsInput: true, maxBends: playerWeaponLevel - 1, segments: [], path: [], lastBendPos: playerPos
         };
         setMessage(`Level ${playerWeaponLevel} Shot: Define direction 1.`);
     }

     const startPos = partialShootPlan.lastBendPos;

     // Determine direction
      const dx = Math.abs(clickX - startPos.x);
      const dy = Math.abs(clickY - startPos.y);
      let direction = { dx: 0, dy: 0 };

      if (dx === 0 && dy === 0) {
          setMessage("Cannot target starting cell. Click further away.");
          return;
      } else if (dx > dy) {
          direction.dx = Math.sign(clickX - startPos.x);
      } else {
          direction.dy = Math.sign(clickY - startPos.y);
      }

     // --- Validation ---
    if (partialShootPlan.segments.length > 0) {
        const prevDir = partialShootPlan.segments[partialShootPlan.segments.length - 1].direction;
        if (direction.dx === -prevDir.dx && direction.dy === 0 || direction.dy === -prevDir.dy && direction.dx === 0) {
            setMessage("Cannot reverse direction immediately. Choose another direction.");
             return;
        }
    }

     // --- Calculate and Add Segment ---
     const segmentData = calculateShotPathSegment(startPos, direction, aiPos, 999);

    // Add segment to the plan
     partialShootPlan.segments.push({ direction: direction, path: segmentData.path });
     partialShootPlan.path.push(...segmentData.path);
     partialShootPlan.lastBendPos = segmentData.endPos;

    const bendsMade = partialShootPlan.segments.length - 1;

    // --- Check if more input needed ---
    if (bendsMade < partialShootPlan.maxBends) {
        partialShootPlan.needsInput = true;
        setMessage(`Select Bend ${bendsMade + 1} Direction (Level ${playerWeaponLevel}).`);
         hoverPath = [];
         // renderBoard(); // Handled by animate loop
    } else {
        partialShootPlan.needsInput = false;

        // Format final planned action
         const finalPlan = {
             type: 'shoot',
             direction: partialShootPlan.segments[0].direction,
             bends: [],
             path: partialShootPlan.path
         };

         let bendStartPos = playerPos;
         for(let i=0; i < partialShootPlan.segments.length; i++) {
             const seg = partialShootPlan.segments[i];
              const segmentEndPos = seg.path.length > 0 ? seg.path[seg.path.length - 1] : bendStartPos;
              if(i < partialShootPlan.segments.length - 1) {
                 const nextDir = partialShootPlan.segments[i+1].direction;
                  finalPlan.bends.push({ pos: segmentEndPos, direction: nextDir });
              }
              bendStartPos = segmentEndPos;
         }

        playerPlannedAction = finalPlan;
        setMessage("Shoot planned. Waiting for AI...");
        lockPlayerAction();
    }
}
function lockPlayerAction() { /* ... modified slightly for 3D ... */
    disablePlanningControls(); // Visually lock controls & clear highlights
    currentPlanningMode = null;
    partialShootPlan = null;
    hoverPath = [];
    // Highlights automatically cleared by disablePlanningControls -> clearHighlights

    // Trigger AI planning after a short delay
    setTimeout(() => {
        planAiAction();
        startResolution();
    }, 300);
}

// --- Shot Path Calculation (Same as 2D) ---
function calculateShotPath(startPos, initialDirection, bends, opponentPos, weaponLevel) { /* ... copy from 2D version ... */
    let fullPath = [];
    let currentPos = { ...startPos };
    let currentDir = { ...initialDirection };
    let hitTargetOnSegment = false; // Track if target was hit

    // Segment 1
    let segmentData = calculateShotPathSegment(currentPos, currentDir, opponentPos, 999);
    fullPath.push(...segmentData.path);
    currentPos = segmentData.endPos;
    hitTargetOnSegment = segmentData.hitTarget;

    // Subsequent segments based on bends
    for (let i = 0; i < bends.length && i < weaponLevel - 1; i++) {
         // Stop if hit wall boundary (endPos is on wall) or target already
         if (hitTargetOnSegment || (isValid(currentPos.x, currentPos.y) && isWall(currentPos.x, currentPos.y))) {
              break;
         }

        currentDir = bends[i].direction; // Get direction for the next segment
         // Ensure bend position matches expected end of previous segment (ideally guaranteed by planning)
         if (currentPos.x !== bends[i].pos.x || currentPos.y !== bends[i].pos.y) {
            console.warn("Bend position mismatch during path calculation! Forcing position.");
             // It might be safer to use bends[i].pos as the start for the next segment
             currentPos = { ...bends[i].pos };
         }

        segmentData = calculateShotPathSegment(currentPos, currentDir, opponentPos, 999);
         // Add segment path only if it moved somewhere
        if (segmentData.path.length > 0) {
             fullPath.push(...segmentData.path);
             currentPos = segmentData.endPos; // Update current position to the end of this segment
             if (segmentData.hitTarget) hitTargetOnSegment = true;
         } else {
             // Segment didn't move (e.g., started facing a wall), stop bending
             break;
         }
    }

    return fullPath;
}
function calculateShotPathSegment(startPos, direction, opponentPos, maxLength) { /* ... copy from 2D version ... */
    let path = [];
    let currentPos = { ...startPos };
    let steps = 0;
    let hitTarget = false;
    let lastValidPos = {...startPos};

    while (steps < maxLength) {
        const nextX = currentPos.x + direction.dx;
        const nextY = currentPos.y + direction.dy;

        if (!isValid(nextX, nextY) || isWall(nextX, nextY)) {
            break; // Stop *before* hitting the wall/boundary
        }

         // Move to the next cell
         currentPos.x = nextX;
         currentPos.y = nextY;
         lastValidPos = { ...currentPos };
         path.push({ ...currentPos });
         steps++;

        // Check for opponent hit
        if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) {
            hitTarget = true;
            break; // Stop segment on hit
        }
    }
    // Ensure endPos reflects the last valid position reached, even if the loop didn't run (path is empty)
    return { path: path, endPos: path.length > 0 ? path[path.length - 1] : startPos , hitTarget: hitTarget };
}

// --- AI Logic (Same as 2D) ---
function planAiAction() { /* ... copy from 2D version ... */
    console.log("AI Planning...");
    const possibleActions = [];
    const currentAiPos = { ...aiPos }; // Use current pos for planning
    const currentPlayerPos = { ...playerPos }; // Opponent's current pos

    // 1. Stay Put
    possibleActions.push({ type: 'stay' });

    // 2. Possible Moves
    const validMoves = getValidMoves(currentAiPos, currentPlayerPos); // Check moves AI can make
    validMoves.forEach(move => {
        possibleActions.push({ type: 'move', target: move });
    });

    // 3. Possible Shots (Straight)
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach(dir => {
        // Use the full path calculation for consistency, even for straight shots
        const path = calculateShotPath(currentAiPos, dir, [], currentPlayerPos, 1);
         if (path.length > 0) { // Only consider shots that actually travel somewhere
             possibleActions.push({ type: 'shoot', direction: dir, bends: [], path: path });
         }
    });

    // 4. Possible Shots (1 Bend - if level >= 2)
     if (aiWeaponLevel >= 2) {
         directions.forEach(dir1 => {
             const seg1Data = calculateShotPathSegment(currentAiPos, dir1, currentPlayerPos, 999);
             // Check if segment 1 ended on a valid floor tile without hitting the target
             if (seg1Data.path.length > 0 && !seg1Data.hitTarget && isValid(seg1Data.endPos.x, seg1Data.endPos.y) && !isWall(seg1Data.endPos.x, seg1Data.endPos.y)) {
                 const bendPos = seg1Data.endPos;
                 directions.forEach(dir2 => {
                      // Prevent immediate reversal
                     if (!(dir2.dx === -dir1.dx && dir2.dy === 0) && !(dir2.dy === -dir1.dy && dir2.dx === 0)) {
                          // Use full path calculation starting from bend
                          const bends = [{ pos: bendPos, direction: dir2 }];
                          const fullPath = calculateShotPath(currentAiPos, dir1, bends, currentPlayerPos, 2);
                          if (fullPath.length > seg1Data.path.length) { // Check if second segment added anything
                               possibleActions.push({
                                   type: 'shoot',
                                   direction: dir1,
                                   bends: bends,
                                   path: fullPath
                               });
                           }
                     }
                 });
             }
         });
     }

    // 5. Possible Shots (2 Bends - if level >= 3)
     if (aiWeaponLevel >= 3) {
          directions.forEach(dir1 => {
             const seg1Data = calculateShotPathSegment(currentAiPos, dir1, currentPlayerPos, 999);
             if (seg1Data.path.length > 0 && !seg1Data.hitTarget && isValid(seg1Data.endPos.x, seg1Data.endPos.y) && !isWall(seg1Data.endPos.x, seg1Data.endPos.y)) {
                 const bendPos1 = seg1Data.endPos;
                 directions.forEach(dir2 => {
                     if (!(dir2.dx === -dir1.dx && dir2.dy === 0) && !(dir2.dy === -dir1.dy && dir2.dx === 0)) {
                         const seg2Data = calculateShotPathSegment(bendPos1, dir2, currentPlayerPos, 999);
                         if (seg2Data.path.length > 0 && !seg2Data.hitTarget && isValid(seg2Data.endPos.x, seg2Data.endPos.y) && !isWall(seg2Data.endPos.x, seg2Data.endPos.y)) {
                             const bendPos2 = seg2Data.endPos;
                             directions.forEach(dir3 => {
                                  if (!(dir3.dx === -dir2.dx && dir3.dy === 0) && !(dir3.dy === -dir2.dy && dir3.dx === 0)) {
                                      const bends = [
                                          { pos: bendPos1, direction: dir2 },
                                          { pos: bendPos2, direction: dir3 }
                                      ];
                                      const fullPath = calculateShotPath(currentAiPos, dir1, bends, currentPlayerPos, 3);
                                       // Check if third segment added anything
                                      const pathLenAfterBend1 = seg1Data.path.length + seg2Data.path.length;
                                      if (fullPath.length > pathLenAfterBend1) {
                                           possibleActions.push({
                                               type: 'shoot',
                                               direction: dir1,
                                               bends: bends,
                                               path: fullPath
                                           });
                                       }
                                  }
                             });
                         }
                     }
                 });
             }
         });
     }


    // --- Evaluate Actions ---
    let bestAction = { type: 'stay' }; // Default to stay
    let bestScore = -Infinity;

    // Calculate score for 'stay' first
    bestScore = evaluateAiPotentialAction({ type: 'stay' }, currentAiPos, currentPlayerPos);
    console.log(`AI Action Eval: stay Score: ${bestScore}`);


    possibleActions.forEach(action => {
        // Skip re-evaluating 'stay'
        if (action.type === 'stay') return;

        const score = evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos);
         // Simple logging for shoot actions for brevity
         const actionDesc = action.type === 'move' ? `${action.type} to ${action.target.x},${action.target.y}` : `${action.type} bends: ${action.bends?.length || 0}`;
        console.log(`AI Action Eval: ${actionDesc} Score: ${score}`);

         // Use >= to allow slight preference for action over staying if score is equal
        if (score >= bestScore) {
            // Randomize tie-breaking: If scores are very close, randomly pick between them
            if (Math.abs(score - bestScore) < 0.1) { // Scores are essentially equal
                 if (Math.random() > 0.5) { // 50% chance to switch
                     bestScore = score;
                     bestAction = action;
                 }
            } else { // New score is clearly better
                 bestScore = score;
                 bestAction = action;
            }
        }
    });

    // --- Select Action ---
    aiPlannedAction = bestAction;
    console.log("AI Planned Action:", aiPlannedAction);
}
function evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos) { /* ... copy from 2D version ... */
    let score = 0;
    let predictedAiPos = { ...currentAiPos }; // Where AI *would* be after this action

    if (action.type === 'move') {
        predictedAiPos = { ...action.target };
    }

    // (+) Offensive - Hitting Player: High positive score if the action (shoot) directly hits the player's current position.
    if (action.type === 'shoot') {
        const hitsPlayer = action.path.some(p => p.x === currentPlayerPos.x && p.y === currentPlayerPos.y);
        if (hitsPlayer) {
            score += 1000;
             score -= (action.bends.length * 50); // Slightly prefer simpler shots
        }
    }

     // (+) Powerup - Collection: Significant positive score if the action is a move directly onto a powerup cell.
    if (action.type === 'move') {
        if (powerUpPositions.some(p => p.x === action.target.x && p.y === action.target.y)) {
            score += 500;
        }
    }

     // (-) Defensive - Being Targeted: Large negative score if the player has a potential shot aimed at the AI's position *after* the AI's planned action.
    if (canHitTarget(playerPos, predictedAiPos, playerWeaponLevel, aiPos)) { // Check if player can hit AI's predicted spot
        score -= 800;
         // Increase penalty if AI moves INTO line of fire vs staying in it
         // Check if player could NOT hit the *current* AI pos, but CAN hit the *predicted* pos
         if (action.type === 'move' && !canHitTarget(playerPos, currentAiPos, playerWeaponLevel, aiPos) ){
            score -= 200; // Extra penalty for moving into danger
         }
    }

    // (+) Defensive - Cover: Small positive score if the AI's position after the action is behind a wall relative to the player. Check simple line of sight.
    if (!canHitTarget(currentPlayerPos, predictedAiPos, 1, currentAiPos)) { // Check if straight shot from player is blocked TO the predicted position
         // This check alone is often sufficient for basic cover.
         // A more complex check would trace line of sight.
          score += 50;
         // Is the predicted position further from the player than the current one, while also being covered? Bonus for tactical retreat.
         if(distance(predictedAiPos, currentPlayerPos) > distance(currentAiPos, currentPlayerPos)){
             score += 20;
         }
    }


    // (+) Powerup - Proximity: Smaller, diminishing positive score if the action reduces the distance to the nearest powerup.
    const nearestPowerup = findNearestPowerup(predictedAiPos);
    if (nearestPowerup) {
        const distAfter = distance(predictedAiPos, nearestPowerup);
        const nearestBefore = findNearestPowerup(currentAiPos);
        const distBefore = nearestBefore ? distance(currentAiPos, nearestBefore) : Infinity;

        if (distAfter < distBefore && distAfter > 0) { // Make sure not evaluating the collection case again
            score += Math.max(0, 200 - distAfter * 20); // Bonus decreases with distance
        }
    }

     // (+/-) Distance to Player: Prefer a medium distance? Avoid being too close or too far.
     const distToPlayer = distance(predictedAiPos, currentPlayerPos);
     const idealDist = 6; // Example ideal distance
     score -= Math.abs(distToPlayer - idealDist) * 5; // Penalty for deviating from ideal


    // (+) Offensive - Setup: Moderate positive score if a move/stay results in the AI having a clear shot for the *next* turn.
     if (action.type === 'move' || action.type === 'stay') {
         if (canHitTarget(predictedAiPos, currentPlayerPos, aiWeaponLevel, currentPlayerPos)) { // Can AI shoot player from new pos?
             score += 150;
             // Bonus if it's a straight shot?
             if(canHitTarget(predictedAiPos, currentPlayerPos, 1, currentPlayerPos)) {
                 score += 50;
             }
             // Bonus if player *cannot* shoot back immediately from that position?
             if(!canHitTarget(currentPlayerPos, predictedAiPos, playerWeaponLevel, predictedAiPos)){
                 score += 100; // Good safe attacking position
             }
         }
     }

    return score;
}

// --- Resolution Phase (Modified for Animation) ---

async function startResolution() {
    console.log("Starting Resolution Phase...");
    if (isResolving) return; // Prevent multiple triggers
    isResolving = true;
    gamePhase = 'resolving';
    updatePhaseIndicator();
    setMessage("Resolving Actions...");
    disablePlanningControls(); // Turn off input and highlights

    const initialPlayerPos = { ...playerPos };
    const initialAiPos = { ...aiPos };
    let conflictMessages = [];

    // --- Step 1: Calculate Shot Outcomes ---
    let playerWillBeHit = false;
    let aiWillBeHit = false;
    let playerShotPath = playerPlannedAction?.type === 'shoot' ? playerPlannedAction.path : null;
    let aiShotPath = aiPlannedAction?.type === 'shoot' ? aiPlannedAction.path : null;

    if (aiShotPath?.some(p => p.x === initialPlayerPos.x && p.y === initialPlayerPos.y)) {
        playerWillBeHit = true;
    }
    if (playerShotPath?.some(p => p.x === initialAiPos.x && p.y === initialAiPos.y)) {
        aiWillBeHit = true;
    }

    // --- Step 2: Visualize Shots ---
    setMessage("Shots Firing...");
    if (playerShotPath) createLaserBeam(playerShotPath, playerLaserMaterial);
    if (aiShotPath) createLaserBeam(aiShotPath, aiLaserMaterial);

    await wait(SHOT_FLASH_DURATION + RESOLVE_STEP_DELAY); // Wait for laser effects

    // --- Step 3: Resolve Movement Conflicts & Calculate Final Positions ---
     setMessage("Resolving Movement...");
     let finalPlayerPos = { ...initialPlayerPos };
     let finalAiPos = { ...initialAiPos };
     let playerMoveValid = false;
     let aiMoveValid = false;
     let playerTargetPos = null;
     let aiTargetPos = null;

     const playerMoving = playerPlannedAction?.type === 'move';
     const aiMoving = aiPlannedAction?.type === 'move';
     const pTarget = playerMoving ? playerPlannedAction.target : null;
     const aTarget = aiMoving ? aiPlannedAction.target : null;

     // Basic validation (target is valid grid cell, not wall, is adjacent)
     playerMoveValid = playerMoving && isValidMoveTarget(pTarget, initialPlayerPos, initialAiPos);
     aiMoveValid = aiMoving && isValidMoveTarget(aTarget, initialAiPos, initialPlayerPos);

     // --- Resolve Conflicts ---
     if (playerMoveValid && aiMoveValid) {
         // Collision: Both move to the SAME target square
         if (pTarget.x === aTarget.x && pTarget.y === aTarget.y) {
             conflictMessages.push("Collision! Both bounced back.");
             playerMoveValid = false;
             aiMoveValid = false;
         }
         // Swap: Player moves to AI's initial spot AND AI moves to Player's initial spot
         else if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y &&
                  aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) {
             conflictMessages.push("Players swapped positions!");
             // Both moves remain valid
         }
         // Block: Player moves to AI's spot (and AI moves elsewhere OR stays)
         else if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y) {
             conflictMessages.push("Player move blocked!");
             playerMoveValid = false; // Player move fails
             // AI move validity remains unchanged unless it was also blocked
         }
         // Block: AI moves to Player's spot (and Player moves elsewhere OR stays)
         else if (aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) {
             conflictMessages.push("AI move blocked!");
             aiMoveValid = false;   // AI move fails
             // Player move validity remains unchanged unless it was also blocked
         }
         // Else: No conflict involving blocking or collision, both moves are potentially valid.

     } else if (playerMoveValid) { // Only player tries to move
         // Block: Player moves to AI's spot (AI is staying/shooting)
         if (pTarget.x === initialAiPos.x && pTarget.y === initialAiPos.y) {
             conflictMessages.push("Player move blocked!");
             playerMoveValid = false;
         }
     } else if (aiMoveValid) { // Only AI tries to move
         // Block: AI moves to Player's spot (Player is staying/shooting)
         if (aTarget.x === initialPlayerPos.x && aTarget.y === initialPlayerPos.y) {
             conflictMessages.push("AI move blocked!");
             aiMoveValid = false;
         }
     }
     // Else: Neither is moving validly, or only one tried and failed validation earlier.


     // Determine final target positions for animation
     if (playerMoveValid) finalPlayerPos = { ...pTarget };
     if (aiMoveValid) finalAiPos = { ...aTarget };


    // --- Step 4: Execute Movement Animation ---
    const playerMovePromise = playerMoveValid ? animateMove(playerMesh, finalPlayerPos) : Promise.resolve();
    const aiMovePromise = aiMoveValid ? animateMove(aiMesh, finalAiPos) : Promise.resolve();

    await Promise.all([playerMovePromise, aiMovePromise]); // Wait for animations

    // --- Step 5: Update Logical Positions & Collect Powerups ---
    playerPos = { ...finalPlayerPos }; // Update logical state AFTER animation
    aiPos = { ...finalAiPos };

    let playerCollectedPowerup = false;
    const powerupIndexPlayer = powerUpPositions.findIndex(p => p.x === playerPos.x && p.y === playerPos.y);
    if (powerupIndexPlayer !== -1) {
        playerCollectedPowerup = true;
        playerWeaponLevel = Math.min(MAX_WEAPON_LEVEL, playerWeaponLevel + 1);
        conflictMessages.push("Player collected weapon upgrade!");
        removePowerup3D(playerPos.x, playerPos.y); // Remove 3D mesh
        powerUpPositions.splice(powerupIndexPlayer, 1);
        updateWeaponLevelInfo(); // Updates 3D visuals too
    }

    const powerupIndexAi = powerUpPositions.findIndex(p => p.x === aiPos.x && p.y === aiPos.y);
    if (powerupIndexAi !== -1) { // Player priority implicitly handled by checking array again
         aiWeaponLevel = Math.min(MAX_WEAPON_LEVEL, aiWeaponLevel + 1);
         conflictMessages.push("AI collected weapon upgrade!");
         removePowerup3D(aiPos.x, aiPos.y);
         powerUpPositions.splice(powerupIndexAi, 1);
         updateWeaponLevelInfo();
    }


    await wait(RESOLVE_STEP_DELAY); // Short delay after movement/collection

    // --- Step 6: Determine Game Outcome & Transition ---
    let finalMessage = conflictMessages.join(" ");

    if (playerWillBeHit && aiWillBeHit) {
        endGame("Draw! Both players hit each other!", 'Draw');
    } else if (playerWillBeHit) {
        endGame("AI Wins! Player was hit.", 'AI');
         // Optional: Add player hit effect (e.g., mesh flashes red/disappears)
    } else if (aiWillBeHit) {
        endGame("Player Wins! AI was hit.", 'Player');
         // Optional: Add AI hit effect
    } else {
        // Game Continues
        gamePhase = 'planning';
        playerPlannedAction = null;
        aiPlannedAction = null;
        isResolving = false;

        maybeSpawnPowerup(); // Attempt to spawn new powerups

        setMessage(finalMessage || "Plan your next action.");
        updatePhaseIndicator();
        enablePlanningControls(); // Renable controls and clear highlights
    }
}

function animateMove(mesh, targetGridPos) {
    return new Promise(resolve => {
        const startPos3D = mesh.position.clone();
         // Calculate Y offset based on mesh type (player/ai)
         const yOffset = mesh.userData.type === 'player' ? CELL_3D_SIZE * 0.55 : CELL_3D_SIZE * 0.4;
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

function wait(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

// --- Powerup Logic (Spawn/Remove 3D) ---
function maybeSpawnPowerup() {
     if (gameOverState || isResolving) return;

    if (powerUpPositions.length < MAX_POWERUPS) {
        if (Math.random() < POWERUP_SPAWN_CHANCE) {
            spawnPowerup();
        }
    }
}

function spawnPowerup() {
    let attempts = 0;
    while (attempts < 50) {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);

        const isFloor = isValid(x,y) && grid[y][x] === 'floor';
        // Check against logical positions first
        const isUnoccupiedLogically = (x !== playerPos.x || y !== playerPos.y) &&
                                      (x !== aiPos.x || y !== aiPos.y) &&
                                      !powerUpPositions.some(p => p.x === x && p.y === y);

        if (isFloor && isUnoccupiedLogically) {
             // Double check against mesh positions during potential animation? Less critical if called between turns.
            powerUpPositions.push({ x, y });
            const newPowerupMesh = createPowerup3D(x, y);
            powerupMeshes.push(newPowerupMesh); // Store reference with mesh
            console.log(`Spawned powerup at ${x},${y}`);
            return true;
        }
        attempts++;
    }
     console.warn("Could not find suitable location to spawn powerup.");
    return false;
}


// --- Game Over ---
function endGame(message, winner) { /* ... copy from 2D version ... */
    console.log("Game Over:", message);
    gamePhase = 'gameOver';
    gameOverState = { winner: winner, message: message };
    setMessage(message);
    updatePhaseIndicator();
    disablePlanningControls(); // Keep controls disabled
    isResolving = false; // Ensure resolving flag is cleared
}

// --- Utility Functions (Mostly Same as 2D) ---
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === 'wall'; }
function getValidMoves(unitPos, opponentPos) { /* ... copy from 2D version ... */
    const moves = [];
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

    directions.forEach(dir => {
        const nextX = unitPos.x + dir.dx;
        const nextY = unitPos.y + dir.dy;

        // Check logical grid first
        if (isValid(nextX, nextY) && !isWall(nextX, nextY) && !(nextX === opponentPos.x && nextY === opponentPos.y)) {
            moves.push({ x: nextX, y: nextY });
        }
    });
    return moves;
}
 function isValidMoveTarget(target, unitPos, opponentPos){ /* ... copy from 2D version ... */
      if (!target || !isValid(target.x, target.y) || isWall(target.x, target.y)) return false;
      // Check adjacency
      const dx = Math.abs(target.x - unitPos.x);
      const dy = Math.abs(target.y - unitPos.y);
      if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return false;
      // Check if target is opponent's current position (will be handled by conflict resolution)
      // if (target.x === opponentPos.x && target.y === opponentPos.y) return false;

      return true;
 }
function distance(pos1, pos2) { /* ... copy from 2D version ... */
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}
function findNearestPowerup(pos) { /* ... copy from 2D version ... */
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
function canHitTarget(attackerPos, targetPos, attackerWeaponLevel, currentTargetActualPos) { /* ... copy from 2D version ... */
     // Uses the same path calculation logic which works on the grid
     const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

     // Check straight shot first (Level 1)
     for (const dir of directions) {
         const path = calculateShotPath(attackerPos, dir, [], targetPos, 1);
         if (path.some(p => p.x === targetPos.x && p.y === targetPos.y)) return true;
     }

     // Check 1-bend shots (Level 2+)
     if (attackerWeaponLevel >= 2) {
         for (const dir1 of directions) {
             const seg1Data = calculateShotPathSegment(attackerPos, dir1, targetPos, 999);
             if (seg1Data.path.length > 0 && !seg1Data.hitTarget && isValid(seg1Data.endPos.x, seg1Data.endPos.y) && !isWall(seg1Data.endPos.x, seg1Data.endPos.y)) {
                 const bendPos = seg1Data.endPos;
                 for (const dir2 of directions) {
                      if (!(dir2.dx === -dir1.dx && dir2.dy === 0) && !(dir2.dy === -dir1.dy && dir2.dx === 0)) { // No reverse
                          const bends = [{ pos: bendPos, direction: dir2 }];
                          const fullPath = calculateShotPath(attackerPos, dir1, bends, targetPos, 2);
                           if (fullPath.some(p => p.x === targetPos.x && p.y === targetPos.y)) return true;
                      }
                 }
             }
         }
     }

     // Check 2-bend shots (Level 3+)
     if (attackerWeaponLevel >= 3) {
          for (const dir1 of directions) {
             const seg1Data = calculateShotPathSegment(attackerPos, dir1, targetPos, 999);
             if (seg1Data.path.length > 0 && !seg1Data.hitTarget && isValid(seg1Data.endPos.x, seg1Data.endPos.y) && !isWall(seg1Data.endPos.x, seg1Data.endPos.y)) {
                  const bendPos1 = seg1Data.endPos;
                  for (const dir2 of directions) {
                       if (!(dir2.dx === -dir1.dx && dir2.dy === 0) && !(dir2.dy === -dir1.dy && dir2.dx === 0)) {
                           const seg2Data = calculateShotPathSegment(bendPos1, dir2, targetPos, 999);
                           if (seg2Data.path.length > 0 && !seg2Data.hitTarget && isValid(seg2Data.endPos.x, seg2Data.endPos.y) && !isWall(seg2Data.endPos.x, seg2Data.endPos.y)) {
                               const bendPos2 = seg2Data.endPos;
                               for (const dir3 of directions) {
                                    if (!(dir3.dx === -dir2.dx && dir3.dy === 0) && !(dir3.dy === -dir2.dy && dir3.dx === 0)) {
                                        const bends = [ { pos: bendPos1, direction: dir2 }, { pos: bendPos2, direction: dir3 }];
                                        const fullPath = calculateShotPath(attackerPos, dir1, bends, targetPos, 3);
                                        if (fullPath.some(p => p.x === targetPos.x && p.y === targetPos.y)) return true;
                                    }
                               }
                           }
                       }
                  }
             }
         }
     }

     return false; // Target cannot be hit with current weapon level
}
// --- Start Game ---
init(); // Call the main initialization function