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
const GRID_SIZE = 20; // Increased grid size
const CELL_3D_SIZE = 2; // Size of each cell in 3D space
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
const MAX_WEAPON_LEVEL = 5; // Increased max weapon level (0-4 bends)
const MAX_POWERUPS = 4; // Slightly more powerups for larger board
const POWERUP_SPAWN_CHANCE = 0.6;

// Timing Constants (milliseconds)
const SHOT_FLASH_DURATION = 400; // Laser visible duration
const MOVEMENT_DURATION = 350;   // Unit movement animation
const RESOLVE_STEP_DELAY = 150;

// AI constants
const AI_MAX_BEND_CHECK_DEPTH = 2; // Limit how many bends AI actively plans for performance
const AI_MAX_SEGMENT_EVAL_POINTS = 5; // Limit how many end points AI checks per segment

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
let intersectionPlane; // Invisible plane for raycasting grid clicks

// --- Game State ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerWeaponLevel = 1;
let aiWeaponLevel = 1;
let powerUpPositions = []; // Array of {x, y}
let gamePhase = 'planning'; // 'planning', 'resolving', 'gameOver'
let currentPlanningMode = 'move'; // Default to move mode
let playerPlannedAction = null;
let aiPlannedAction = null;
let hoverPos = null;
let hoverPath = [];
let hoverPathIsValid = false; // Flag for hover path validity
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
    scene.background = new THREE.Color(0xdee4e8); // Lighter grey background

    // Camera
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    // Adjust FoV or position based on larger grid
    camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    // Pull camera back and up more for larger grid
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 1.0, GRID_SIZE * CELL_3D_SIZE * 0.8);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Slightly brighter ambient
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Slightly stronger directional
    directionalLight.position.set(GRID_SIZE * 0.4, GRID_SIZE * 1.5, GRID_SIZE * 0.6); // Adjust angle slightly
    directionalLight.castShadow = true;
     // Configure shadow properties
     directionalLight.shadow.mapSize.width = 2048; // Higher res shadows
     directionalLight.shadow.mapSize.height = 2048;
     directionalLight.shadow.camera.near = 0.5;
     directionalLight.shadow.camera.far = GRID_SIZE * CELL_3D_SIZE * 3;
     const shadowCamSize = GRID_SIZE * CELL_3D_SIZE * 0.7; // Increase shadow camera frustum size
     directionalLight.shadow.camera.left = -shadowCamSize;
     directionalLight.shadow.camera.right = shadowCamSize;
     directionalLight.shadow.camera.top = shadowCamSize;
     directionalLight.shadow.camera.bottom = -shadowCamSize;
    scene.add(directionalLight);
    // scene.add( new THREE.CameraHelper( directionalLight.shadow.camera ) ); // Helper for debugging shadows


    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0); // Point controls at the center of the board
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera from going below ground plane slightly more
    controls.minDistance = CELL_3D_SIZE * 5; // Don't zoom in too close
    controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.5; // Allow zooming out further

    // Game Board Group
    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);

    // Intersection Plane (for mouse clicks) - Ensure size matches grid
    const planeSize = GRID_SIZE * CELL_3D_SIZE;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }); // Invisible
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    intersectionPlane.position.y = 0.01; // Slightly above floor meshes to ensure intersection
    scene.add(intersectionPlane); // Add directly to scene, not the group

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    // Use container size for aspect ratio calculation
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return; // Avoid issues if container is hidden/collapsed

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
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
    // currentPlanningMode = 'move'; // Set default mode here
    playerPlannedAction = null;
    aiPlannedAction = null;
    hoverPos = null;
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null;
    gameOverState = null;
    isResolving = false;

    // Create 3D units
    createUnits3D();

    // Initial powerups
    maybeSpawnPowerup();
    maybeSpawnPowerup();
    maybeSpawnPowerup(); // Spawn one more initially for larger board

    setMessage("Plan your move."); // Default message
    updatePhaseIndicator();
    updateWeaponLevelInfo();
    enablePlanningControls(); // Will set default mode visually
    clearHighlights();

    // Adjust camera target slightly if needed
    controls.target.set(0, 0, 0);
    controls.update();

    // Explicitly set planning mode AFTER enabling controls
    setPlanningMode('move');
}

function setupInputListeners() {
    btnPlanMove.addEventListener('click', () => setPlanningMode('move'));
    btnPlanShoot.addEventListener('click', () => setPlanningMode('shoot'));
    btnReset.addEventListener('click', initGameLogic); // Reset only game logic and 3D state
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
}

// --- Grid Generation (Same as 2D) ---
function generateGrid() { /* ... copy from previous version ... */
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
function isGridConnected() { /* ... copy from previous version ... */
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
function findFirstFloor() { /* ... copy from previous version ... */
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor') return { x, y };
        }
    }
    return null;
}
function findStartPositions() { /* ... copy from previous version, adjust indices for larger grid ... */
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
function findNearestFloorBFS(startSearchPos, occupied = []) { /* ... copy from previous version ... */
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
        // Dispose geometry and materials specific to this child if not shared
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
             // If material is an array (multi-material object)
             if (Array.isArray(child.material)) {
                 child.material.forEach(mat => mat.dispose());
             } else {
                 child.material.dispose();
             }
        }
        // If it's a sprite with a canvas texture, dispose that too
        if(child instanceof THREE.Sprite && child.material.map instanceof THREE.CanvasTexture){
             child.material.map.dispose();
        }
        gameBoardGroup.remove(child);
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

    // Use InstancedMesh for floors for better performance on larger grids (optional but good)
    // For simplicity here, we stick to individual meshes.

    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.1, CELL_3D_SIZE);
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);

            if (grid[y][x] === 'floor') {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial.clone()); // Clone for highlighting
                floorMesh.position.copy(pos);
                floorMesh.position.y = -0.05;
                floorMesh.castShadow = false;
                floorMesh.receiveShadow = true;
                floorMesh.userData = { gridX: x, gridY: y, type: 'floor' };
                gameBoardGroup.add(floorMesh);
                floorMeshes[y][x] = floorMesh;
            }
            else if (grid[y][x] === 'wall') {
                 // Floor under the wall (optional, for visual completeness)
                 const baseMesh = new THREE.Mesh(floorGeom, floorMaterial.clone());
                 baseMesh.position.copy(pos);
                 baseMesh.position.y = -0.05;
                 baseMesh.receiveShadow = true;
                 gameBoardGroup.add(baseMesh); // Add base under wall

                // Wall Mesh
                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial); // Use shared material
                wallMesh.position.copy(pos);
                wallMesh.position.y += WALL_HEIGHT / 2 - 0.05; // Position wall on top of floor plane
                wallMesh.castShadow = true;
                wallMesh.receiveShadow = true;
                wallMesh.userData = { gridX: x, gridY: y, type: 'wall' };
                gameBoardGroup.add(wallMesh);
                wallMeshes.push(wallMesh); // Add to wall list
                floorMeshes[y][x] = null; // No highlightable floor mesh here
            }
        }
    }
}

function createUnits3D() {
    const unitElevation = CELL_3D_SIZE * 0.4; // How high units float

    // Player (Slightly more complex shape)
    const playerGeom = new THREE.CapsuleGeometry(CELL_3D_SIZE * 0.3, CELL_3D_SIZE * 0.5, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial.clone()); // Clone material for potential hit effect later
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, unitElevation + 0.1); // Player capsule center offset
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: 'player' };
    gameBoardGroup.add(playerMesh);
    playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
    playerLevelIndicator.position.set(0, CELL_3D_SIZE * 0.7, 0); // Position above the mesh
    playerMesh.add(playerLevelIndicator); // Add as child


    // AI (Maybe a pyramid?)
    const aiGeom = new THREE.ConeGeometry(CELL_3D_SIZE * 0.4, CELL_3D_SIZE * 0.8, 4); // Pyramid shape
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial.clone()); // Clone material
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, unitElevation + 0.4); // Cone base offset
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: 'ai' };
    gameBoardGroup.add(aiMesh);
    aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
    aiLevelIndicator.position.set(0, CELL_3D_SIZE * 0.8, 0); // Position above the mesh
    aiMesh.add(aiLevelIndicator); // Add as child

    updateWeaponLevelVisuals(); // Initial update
}

function createLevelTextMesh(level) {
     const canvas = document.createElement('canvas');
     const context = canvas.getContext('2d');
     const size = 64; // Texture size
     const halfSize = size / 2;
     canvas.width = size;
     canvas.height = size;

     // Slightly rounded background
     context.fillStyle = 'rgba(0, 0, 0, 0.6)';
     context.beginPath();
     context.roundRect(0, 0, size, size, size * 0.2);
     context.fill();

     context.font = `Bold ${size * 0.55}px Arial`; // Adjust font size
     context.fillStyle = 'white';
     context.textAlign = 'center';
     context.textBaseline = 'middle';
     context.fillText(level.toString(), halfSize, halfSize + 2); // Adjust vertical position

     const texture = new THREE.CanvasTexture(canvas);
     texture.needsUpdate = true;
     const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false }); // sizeAttenuation false makes it fixed size regardless of distance
     const sprite = new THREE.Sprite(spriteMaterial);
     // Scale controls size relative to the screen if sizeAttenuation is false
     sprite.scale.set(0.05, 0.05, 1); // Adjust scale for desired screen size
     return sprite;
}


function updateWeaponLevelVisuals() {
    // Update Player Level Indicator
    if (playerMesh) {
        if(playerLevelIndicator) playerMesh.remove(playerLevelIndicator); // Remove old one
        // Safely dispose previous resources
        if(playerLevelIndicator?.material?.map) playerLevelIndicator.material.map.dispose();
        if(playerLevelIndicator?.material) playerLevelIndicator.material.dispose();

        playerLevelIndicator = createLevelTextMesh(playerWeaponLevel);
        playerLevelIndicator.position.set(0, CELL_3D_SIZE * 0.7, 0);
        playerMesh.add(playerLevelIndicator);
    }
     // Update AI Level Indicator
     if (aiMesh) {
        if(aiLevelIndicator) aiMesh.remove(aiLevelIndicator); // Remove old one
        if(aiLevelIndicator?.material?.map) aiLevelIndicator.material.map.dispose();
        if(aiLevelIndicator?.material) aiLevelIndicator.material.dispose();

        aiLevelIndicator = createLevelTextMesh(aiWeaponLevel);
        aiLevelIndicator.position.set(0, CELL_3D_SIZE * 0.8, 0); // Adjust Y pos for AI shape
        aiMesh.add(aiLevelIndicator);
    }

     // Optional: Change material emissiveness based on level
     const playerEmissiveIntensity = Math.max(0, (playerWeaponLevel - 1) * 0.2); // Dim glow increases with level
     if (playerMesh?.material) playerMesh.material.emissive.set(playerMaterial.color).multiplyScalar(playerEmissiveIntensity);

     const aiEmissiveIntensity = Math.max(0, (aiWeaponLevel - 1) * 0.2);
     if (aiMesh?.material) aiMesh.material.emissive.set(aiMaterial.color).multiplyScalar(aiEmissiveIntensity);
}


function createPowerup3D(x, y) {
    const powerupGeom = new THREE.OctahedronGeometry(CELL_3D_SIZE * 0.25, 0); // Crystal shape
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial); // Use shared material
    mesh.position.copy(get3DPosition(x, y, CELL_3D_SIZE * 0.4));
    mesh.castShadow = true;
    mesh.userData = { type: 'powerup', gridX: x, gridY: y, spinSpeed: Math.random() * 0.02 + 0.01 };
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}

function removePowerup3D(x, y) {
    const index = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (index !== -1) {
        const powerupObj = powerupMeshes[index];
        // Dispose geometry before removing
        if (powerupObj.mesh.geometry) powerupObj.mesh.geometry.dispose();
        gameBoardGroup.remove(powerupObj.mesh);
        // Don't dispose shared material generally
        powerupMeshes.splice(index, 1);
    }
}

// --- Highlighting ---

function clearHighlights() {
    activeHighlights.forEach(mesh => {
        // Only reset if it's a floor mesh and material was changed
        if (mesh.userData.type === 'floor' && mesh.material !== floorMaterial) {
             // Re-apply a fresh clone of the base material
             mesh.material = floorMaterial.clone();
        }
    });
    activeHighlights = [];
}

function highlightCell(x, y, highlightMaterial) {
    if (isValid(x, y) && floorMeshes[y]?.[x]) { // Check if floor mesh exists at coords
        const floorMesh = floorMeshes[y][x];
         // Only highlight if not already highlighted with the *same* material
         if (floorMesh.material !== highlightMaterial) {
             // Remove from active highlights if it was previously highlighted differently
             const existingIndex = activeHighlights.indexOf(floorMesh);
             if (existingIndex > -1) {
                 activeHighlights.splice(existingIndex, 1);
             }
             // Apply new highlight
             floorMesh.material = highlightMaterial;
             activeHighlights.push(floorMesh);
         } else if (!activeHighlights.includes(floorMesh)){
             // If it has the correct material but wasn't tracked (e.g. after reset), track it
             activeHighlights.push(floorMesh);
         }
    }
}

function renderHighlights() {
    clearHighlights(); // Clear previous frame's highlights first

    if (gamePhase !== 'planning' || gameOverState || isResolving) return;

    const opponentTargetPos = aiPos; // Target the AI for hit highlights

    // --- Move Mode Highlights ---
    if (currentPlanningMode === 'move') {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));

        if (playerPlannedAction?.type === 'move') {
             // Maybe add a ring marker instead of floor highlight
        }
    }
    // --- Shoot Mode Highlights ---
    else if (currentPlanningMode === 'shoot') {
         let pathToShow = [];
         let useMaterial = pathHighlightMaterial; // Default path color

         // Show hover path if hovering, otherwise show partial plan path
         if (hoverPath.length > 0 && !playerPlannedAction) {
             pathToShow = hoverPath;
              // Use invalid highlight color if the hover path itself isn't valid
              if (!hoverPathIsValid) {
                 useMaterial = invalidPathHighlightMaterial;
              }
         } else if (partialShootPlan?.path?.length > 0 && !playerPlannedAction) {
             pathToShow = partialShootPlan.path;
             useMaterial = pathHighlightMaterial; // Path being built is assumed valid
         } else if (playerPlannedAction?.type === 'shoot') {
             pathToShow = playerPlannedAction.path; // Show locked path
             useMaterial = pathHighlightMaterial;
         }

         let hitOpponent = false;
         pathToShow.forEach(p => {
             highlightCell(p.x, p.y, useMaterial);
             if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y && useMaterial !== invalidPathHighlightMaterial) {
                 hitOpponent = true;
             }
         });

        // Highlight opponent if hit by a valid path segment
        if (hitOpponent) {
             highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial);
        }
    }
}

// --- Laser Effect ---

function createLaserBeam(path, material) {
    if (!path || path.length < 1) return null;

     const points = [];
     const startOffset = 0.3 * CELL_3D_SIZE; // How high above the floor

     // Start point (center of first cell)
     points.push(get3DPosition(path[0].x, path[0].y, startOffset));

     // Intermediate points (if any)
     for (let i = 1; i < path.length; i++) {
         points.push(get3DPosition(path[i].x, path[i].y, startOffset));
     }

    // Need at least two points for TubeGeometry
     if (points.length === 1) {
         const nextPoint = points[0].clone();
         // Determine a slight direction based on planned action if possible
         const initialDir = playerPlannedAction?.type === 'shoot' ? playerPlannedAction.direction : {dx: 1, dy: 0}; // Default direction
         nextPoint.x += initialDir.dx * 0.1;
         nextPoint.z += initialDir.dy * 0.1;
         points.push(nextPoint);
     }

    // Use a simpler curve for straight segments if path represents bends correctly
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1); // Lower tension for straighter lines between points
    // const curve = new THREE.LineCurve3(points[0], points[points.length-1]); // Only if always straight

    const tubeRadius = CELL_3D_SIZE * 0.06; // Thinner laser
    const tubeSegments = Math.max(8, path.length * 3); // More segments for longer paths
    const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);
    const laserMesh = new THREE.Mesh(tubeGeom, material.clone()); // Clone material for opacity tween
    laserMesh.userData = { type: 'laser' };

    scene.add(laserMesh); // Add directly to scene
    activeLasers.push(laserMesh);

    // Fade out and remove after duration
    const tween = new TWEEN.Tween({ opacity: laserMesh.material.opacity })
        .to({ opacity: 0 }, SHOT_FLASH_DURATION * 0.6) // Fade out longer
        .delay(SHOT_FLASH_DURATION * 0.4)
        .easing(TWEEN.Easing.Quadratic.In) // Ease in the fade
        .onUpdate((obj) => {
            if(laserMesh.material) laserMesh.material.opacity = obj.opacity;
        })
        .onComplete(() => {
            scene.remove(laserMesh);
            laserMesh.geometry.dispose();
            if(laserMesh.material) laserMesh.material.dispose(); // Dispose cloned material
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

    // Powerup Animation
    powerupMeshes.forEach(p => {
        p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.01;
        p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.01) * 0.6;
    });

    renderHighlights(); // Update highlights each frame during planning

    renderer.render(scene, camera);
}

// --- Input Handling (Raycasting) ---

function handleCanvasMouseMove(event) {
    updateMouseCoords(event);

    // Only process hover if in shoot mode, planning phase, not resolving, and expecting input
    if (gamePhase !== 'planning' || currentPlanningMode !== 'shoot' || playerPlannedAction || gameOverState || isResolving || !partialShootPlan?.needsInput) {
        if (hoverPath.length > 0) { // Clear old hover path if conditions not met
            hoverPath = [];
            hoverPathIsValid = false;
        }
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane); // Intersect with the invisible plane

    if (intersects.length > 0) {
        const intersectionPoint = intersects[0].point;
        const targetGridPos = getGridCoords(intersectionPoint); // Convert 3D point to grid coords

        if (isValid(targetGridPos.x, targetGridPos.y)) { // Only process if valid grid cell
            // Check if hover target changed
            if (!hoverPos || hoverPos.x !== targetGridPos.x || hoverPos.y !== targetGridPos.y) {
                hoverPos = { ...targetGridPos };

                const startPos = partialShootPlan.lastBendPos;
                // Calculate the path segment to the hovered cell
                const segmentResult = calculateShotPathSegment(startPos, hoverPos, aiPos);

                if (segmentResult.isValidSegment) {
                    // Combine with existing partial path for visualization
                    hoverPath = [...partialShootPlan.path, ...segmentResult.path];
                    hoverPathIsValid = true;
                } else {
                    // Show path up to the blocking point or just indicate invalid?
                    // For now, just show the invalid target cell
                    hoverPath = [...partialShootPlan.path, hoverPos]; // Include target cell to show where hover is
                    hoverPathIsValid = false;
                }
            }
        } else {
             // Mouse is off the valid grid part of the plane
             hoverPos = null;
             hoverPath = [];
             hoverPathIsValid = false;
        }
    } else {
        // Not intersecting the plane
         hoverPos = null;
         hoverPath = [];
         hoverPathIsValid = false;
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
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}


// --- UI Update Functions ---
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() { /* ... copy from previous version ... */
    let phaseText = 'Unknown';
    if (gameOverState) {
        phaseText = `Game Over! ${gameOverState.message}`;
    } else {
         phaseText = `Phase: ${gamePhase.charAt(0).toUpperCase() + gamePhase.slice(1)}`;
    }
    phaseIndicator.textContent = phaseText;
}
function updateWeaponLevelInfo() { /* ... copy from previous version, includes visual update call ... */
     weaponLevelInfo.textContent = `Your Weapon Level: ${playerWeaponLevel}`;
     aiWeaponLevelInfo.textContent = `AI Weapon Level: ${aiWeaponLevel}`;
     updateWeaponLevelVisuals(); // Update 3D visuals as well
}
function enablePlanningControls() {
    if (gameOverState) return;
    btnPlanMove.disabled = false;
    btnPlanShoot.disabled = false;
    isResolving = false;
    clearHighlights(); // Clear any lingering highlights from resolution
    // Default mode is set by setPlanningMode called after this
}
function disablePlanningControls() {
    btnPlanMove.disabled = true;
    btnPlanShoot.disabled = true;
    // Don't deactivate buttons here, let setPlanningMode handle it
    // currentPlanningMode = null; // Don't reset mode here
    hoverPath = [];
    hoverPathIsValid = false;
    partialShootPlan = null; // Clear partial plan on disable (e.g., during resolution)
    clearHighlights();
}

// --- Planning Phase Logic ---
function setPlanningMode(mode) {
    // Allow setting mode even if it's the current one (to reset state like partial shot plan)
    if (gamePhase !== 'planning' || gameOverState || isResolving) return;

    console.log("Setting planning mode:", mode);
    currentPlanningMode = mode;

    // Reset planning state when mode changes or is re-selected
    playerPlannedAction = null;
    partialShootPlan = null;
    hoverPath = [];
    hoverPathIsValid = false;

    btnPlanMove.classList.toggle('active', mode === 'move');
    btnPlanShoot.classList.toggle('active', mode === 'shoot');

    if (mode === 'move') {
         setMessage("Click an adjacent green square to plan your move.");
    } else if (mode === 'shoot') {
         // Initialize shoot plan immediately
          partialShootPlan = {
             needsInput: true,
             maxBends: playerWeaponLevel - 1,
             segments: [], // Stores { path: [], endPos: {x, y} } for each segment
             path: [], // Combined path of all segments
             lastBendPos: playerPos // Start from player
         };
         setMessage(`Level ${playerWeaponLevel} Shot: Click target cell for segment 1.`);
    } else {
         setMessage("Select 'Plan Move' or 'Plan Shoot'."); // Should not happen with default
    }

    clearHighlights(); // Clear highlights from previous mode
}

function handleMoveInput(targetX, targetY) {
    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidMove = validMoves.some(move => move.x === targetX && move.y === targetY);

    if (isValidMove) {
        playerPlannedAction = { type: 'move', target: { x: targetX, y: targetY } };
        setMessage("Move planned. Waiting for AI...");
        lockPlayerAction();
    } else {
        setMessage("Invalid move target. Click a green square.");
    }
}

// --- Reworked Shoot Input for Flexible Bending ---
function handleShootInput(clickX, clickY) {
     // Ensure shoot mode is active and expecting input
     if (currentPlanningMode !== 'shoot' || !partialShootPlan || !partialShootPlan.needsInput) {
         console.warn("Shoot input ignored. Mode:", currentPlanningMode, "PartialPlan:", partialShootPlan);
         return;
     }

     const targetPos = { x: clickX, y: clickY };
     const startPos = partialShootPlan.lastBendPos;

     // Avoid targeting the start cell of the segment
     if (targetPos.x === startPos.x && targetPos.y === startPos.y) {
         setMessage("Cannot target the start cell of the segment.");
         return;
     }

    // --- Calculate and Validate Segment ---
     const segmentResult = calculateShotPathSegment(startPos, targetPos, aiPos);

     if (!segmentResult.isValidSegment) {
         setMessage("Invalid target: Path blocked by a wall.");
         return;
     }

    // --- Add Valid Segment to Plan ---
     console.log("Adding segment:", segmentResult.path);
     partialShootPlan.segments.push({ path: segmentResult.path, endPos: targetPos });
     partialShootPlan.path.push(...segmentResult.path);
     partialShootPlan.lastBendPos = targetPos; // Update start for next bend

     const bendsMade = partialShootPlan.segments.length - 1;

    // --- Check if more input needed ---
    if (bendsMade < partialShootPlan.maxBends) {
        partialShootPlan.needsInput = true;
        setMessage(`Select Bend Point ${bendsMade + 1} (Click target cell for segment ${bendsMade + 2}).`);
         hoverPath = []; // Clear hover path after click
         hoverPathIsValid = false;
    } else {
        // Final segment clicked, lock the action
        partialShootPlan.needsInput = false;

        // --- Format Final Action ---
        const finalPlan = {
            type: 'shoot',
            // Store the sequence of target points (bends + final target)
            targetPoints: partialShootPlan.segments.map(seg => seg.endPos),
            // The full calculated path
            path: partialShootPlan.path,
             // We might not need 'direction' and 'bends' in the old format anymore
             // but let's keep them for potential AI/other logic reuse, derived from targetPoints
             direction: {dx: 0, dy: 0}, // Calculate first segment direction
             bends: []
        };

         // Calculate initial direction
         if (finalPlan.targetPoints.length > 0) {
             const firstTarget = finalPlan.targetPoints[0];
             const dx = Math.abs(firstTarget.x - playerPos.x);
             const dy = Math.abs(firstTarget.y - playerPos.y);
              if (dx > dy) finalPlan.direction.dx = Math.sign(firstTarget.x - playerPos.x);
              else if (dy > 0) finalPlan.direction.dy = Math.sign(firstTarget.y - playerPos.y);
         }
         // Calculate bend directions
         for (let i = 0; i < finalPlan.targetPoints.length - 1; i++) {
              const bendPos = finalPlan.targetPoints[i];
              const nextTarget = finalPlan.targetPoints[i+1];
              const nextDir = {dx: 0, dy: 0};
              const dx = Math.abs(nextTarget.x - bendPos.x);
              const dy = Math.abs(nextTarget.y - bendPos.y);
              if (dx > dy) nextDir.dx = Math.sign(nextTarget.x - bendPos.x);
              else if (dy > 0) nextDir.dy = Math.sign(nextTarget.y - bendPos.y);
              finalPlan.bends.push({ pos: bendPos, direction: nextDir });
          }


        playerPlannedAction = finalPlan;
        setMessage("Shoot planned. Waiting for AI...");
        lockPlayerAction();
    }
}


function lockPlayerAction() {
    disablePlanningControls(); // Visually lock controls & clear highlights
    // currentPlanningMode = null; // Don't reset mode, keep it active until next turn starts
    partialShootPlan = null; // Clear partial plan state
    hoverPath = [];
    hoverPathIsValid = false;

    // Trigger AI planning after a short delay
    setTimeout(() => {
        planAiAction();
        startResolution();
    }, 300);
}

// --- Reworked Shot Path Calculation ---

// Calculates a straight path segment from startPos towards targetPos.
// Returns { path: array, isValidSegment: bool, hitTarget: bool }
function calculateShotPathSegment(startPos, targetPos, opponentPos) {
    let path = [];
    let currentPos = { ...startPos };
    let hitTarget = false;
    let isValidSegment = true; // Assume valid initially

    const dxTotal = targetPos.x - startPos.x;
    const dyTotal = targetPos.y - startPos.y;
    const steps = Math.max(Math.abs(dxTotal), Math.abs(dyTotal));

    // Determine direction vector (normalized for single steps)
    let stepDir = { dx: 0, dy: 0 };
     if (Math.abs(dxTotal) > Math.abs(dyTotal)) {
        stepDir.dx = Math.sign(dxTotal);
    } else if (Math.abs(dyTotal) > 0) {
        stepDir.dy = Math.sign(dyTotal);
    } else {
        return { path: [], isValidSegment: false, hitTarget: false }; // Start == Target
    }

    // Check if the primary direction is valid (only cardinal allowed)
    if (stepDir.dx !== 0 && stepDir.dy !== 0) {
        console.warn("Diagonal path segment requested, invalidating.");
         // Decide how to handle - maybe default to one cardinal direction?
         // For now, invalidate. The UI should ideally prevent diagonal clicks from being primary.
         // Let's adjust direction finding to prioritize cardinals:
         if (Math.abs(dxTotal) > Math.abs(dyTotal)) { stepDir.dy = 0; }
         else { stepDir.dx = 0; }
         // If start==target after forcing cardinal, it's still invalid.
         if (stepDir.dx === 0 && stepDir.dy === 0) return { path: [], isValidSegment: false, hitTarget: false };
         console.log("Forcing cardinal direction:", stepDir);
    }


    for (let i = 0; i < steps; i++) {
        const nextX = currentPos.x + stepDir.dx;
        const nextY = currentPos.y + stepDir.dy;

        // Check for wall hit *before* reaching the target cell
        if (isWall(nextX, nextY)) {
            isValidSegment = false;
            break; // Stop path calculation here, segment is invalid
        }

        // Move to the next cell
        currentPos.x = nextX;
        currentPos.y = nextY;
        path.push({ ...currentPos });

        // Check for opponent hit
        if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) {
            hitTarget = true;
            break; // Stop path calculation, segment hit target
        }

         // Stop if we reached the target cell for this segment
         if (currentPos.x === targetPos.x && currentPos.y === targetPos.y) {
             break;
         }
    }

    // Final validation: did we actually reach the target cell if the segment wasn't blocked/didn't hit opponent?
    if (isValidSegment && !hitTarget && !(currentPos.x === targetPos.x && currentPos.y === targetPos.y)) {
        // This can happen if the calculated 'steps' based on dx/dy was off for pure cardinal
        // Or if the path stopped early for other reasons. Re-validate.
        console.warn("Path segment calculation did not reach target cell. Current:", currentPos, "Target:", targetPos);
        // It might be invalid if the step calculation failed. Let's mark it invalid for safety.
        isValidSegment = false;
        path = []; // Clear the potentially incorrect path
    }


    // Return the path segment (even if invalid, might be used for hover feedback)
    return { path: path, isValidSegment: isValidSegment, hitTarget: hitTarget };
}

// This function reconstructs the full path from target points, primarily for final action/AI
function calculateFullPathFromTargets(startPos, targetPoints, opponentPos) {
    let fullPath = [];
    let currentPos = { ...startPos };
    let pathIsValid = true;
    let finalHitTarget = false;

    for (const targetPoint of targetPoints) {
        const segmentResult = calculateShotPathSegment(currentPos, targetPoint, opponentPos);

        if (!segmentResult.isValidSegment) {
            pathIsValid = false;
            // Optionally add the invalid segment path for visualization? No, keep path clean.
            fullPath.push(...segmentResult.path); // Add path up to the block
            break; // Stop processing further segments
        }

        fullPath.push(...segmentResult.path);
        currentPos = targetPoint; // Segment ended successfully at target

        if (segmentResult.hitTarget) {
            finalHitTarget = true;
            break; // Stop processing further segments after hit
        }
    }

    return { path: fullPath, isValid: pathIsValid, hitTarget: finalHitTarget };
}


// --- AI Logic (Adapted for New Bending Rules and Levels) ---
function planAiAction() {
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

function evaluateAiPotentialAction(action, currentAiPos, currentPlayerPos) {
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


// --- Resolution Phase (Adapted for Animation) ---

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
    // Use the pre-calculated paths from the planned actions
    let playerShotPath = playerPlannedAction?.type === 'shoot' ? playerPlannedAction.path : null;
    let aiShotPath = aiPlannedAction?.type === 'shoot' ? aiPlannedAction.path : null;

    // Check hits based on initial positions and full calculated paths
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
    // [Movement conflict logic remains the same as previous 3D version]
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

     if (playerMoveValid) finalPlayerPos = { ...pTarget };
     if (aiMoveValid) finalAiPos = { ...aTarget };

    // --- Step 4: Execute Movement Animation ---
    const playerMovePromise = (playerMoveValid && (finalPlayerPos.x !== initialPlayerPos.x || finalPlayerPos.y !== initialPlayerPos.y))
                            ? animateMove(playerMesh, finalPlayerPos) : Promise.resolve();
    const aiMovePromise = (aiMoveValid && (finalAiPos.x !== initialAiPos.x || finalAiPos.y !== initialAiPos.y))
                            ? animateMove(aiMesh, finalAiPos) : Promise.resolve();

    await Promise.all([playerMovePromise, aiMovePromise]); // Wait for animations

    // --- Step 5: Update Logical Positions & Collect Powerups ---
    playerPos = { ...finalPlayerPos }; // Update logical state AFTER animation
    aiPos = { ...finalAiPos };

    // [Powerup collection logic remains the same as previous 3D version]
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
    if (powerupIndexAi !== -1) { // Player priority implicitly handled
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
    } else if (aiWillBeHit) {
        endGame("Player Wins! AI was hit.", 'Player');
    } else {
        // Game Continues
        gamePhase = 'planning';
        playerPlannedAction = null;
        aiPlannedAction = null;
        isResolving = false;

        maybeSpawnPowerup(); // Attempt to spawn new powerups

        setMessage(finalMessage || "Plan your next action.");
        updatePhaseIndicator();
        enablePlanningControls(); // Renable controls
        setPlanningMode('move'); // <<<<<< SET DEFAULT MODE FOR NEXT TURN
    }
}

function animateMove(mesh, targetGridPos) {
    return new Promise(resolve => {
        const startPos3D = mesh.position.clone();
         // Calculate Y offset based on mesh type - use a small map or check geometry type
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

function wait(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

// --- Powerup Logic ---
function maybeSpawnPowerup() { /* ... copy from previous version ... */
     if (gameOverState || isResolving) return;

    if (powerUpPositions.length < MAX_POWERUPS) {
        if (Math.random() < POWERUP_SPAWN_CHANCE) {
            spawnPowerup();
        }
    }
}
function spawnPowerup() { /* ... copy from previous version ... */
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
function endGame(message, winner) { /* ... copy from previous version ... */
    console.log("Game Over:", message);
    gamePhase = 'gameOver';
    gameOverState = { winner: winner, message: message };
    setMessage(message);
    updatePhaseIndicator();
    disablePlanningControls(); // Keep controls disabled
    isResolving = false; // Ensure resolving flag is cleared
}

// --- Utility Functions ---
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === 'wall'; }
function getValidMoves(unitPos, opponentPos) { /* ... copy from previous version ... */
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
 function isValidMoveTarget(target, unitPos, opponentPos){ /* ... copy from previous version ... */
      if (!target || !isValid(target.x, target.y) || isWall(target.x, target.y)) return false;
      // Check adjacency
      const dx = Math.abs(target.x - unitPos.x);
      const dy = Math.abs(target.y - unitPos.y);
      if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return false;
      // Check if target is opponent's current position (will be handled by conflict resolution)
      // if (target.x === opponentPos.x && target.y === opponentPos.y) return false;

      return true;
 }
function distance(pos1, pos2) { /* ... copy from previous version ... */
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}
function findNearestPowerup(pos) { /* ... copy from previous version ... */
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

// --- Updated canHitTarget to reflect flexible bending ---
// This is significantly more complex. It requires searching for *any* valid path.
// We can use a breadth-first search (BFS) or depth-first search (DFS) approach.
function canHitTarget(attackerPos, targetPos, attackerWeaponLevel, currentTargetActualPos) {
    const maxBends = attackerWeaponLevel - 1;
    const q = [{ pos: attackerPos, pathSoFar: [], bendsMade: -1 }]; // Start BFS queue; bendsMade = -1 initially
    const visited = new Map(); // Store visited states: 'x,y,bends' -> true

    while (q.length > 0) {
        const currentState = q.shift();
        const { pos, pathSoFar, bendsMade } = currentState;

        const visitedKey = `${pos.x},${pos.y},${bendsMade}`;
        if (visited.has(visitedKey)) continue; // Already explored this state
        visited.set(visitedKey, true);

        // Base case: Hit target
        if (pos.x === targetPos.x && pos.y === targetPos.y) {
            return true; // Found a valid path
        }

        // Stop if max bends exceeded for the *next* potential segment
        if (bendsMade + 1 > maxBends) continue;

        // Explore neighbors (potential next cells in a straight line)
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

         // Prevent immediate reversal from the previous segment (if applicable)
         let currentDirection = {dx: 0, dy: 0};
         if (pathSoFar.length > 0) {
             const prevPos = pathSoFar.length > 1 ? pathSoFar[pathSoFar.length - 2] : attackerPos; // Get position before current 'pos'
             currentDirection.dx = Math.sign(pos.x - prevPos.x);
             currentDirection.dy = Math.sign(pos.y - prevPos.y);
         }

        for (const dir of directions) {
            // Prevent immediate reversal if a direction exists
             if (currentDirection.dx !== 0 || currentDirection.dy !== 0) {
                if (dir.dx === -currentDirection.dx && dir.dy === 0) continue;
                if (dir.dy === -currentDirection.dy && dir.dx === 0) continue;
            }

            // Explore along this direction
            let currentExplorePos = { ...pos };
             for (let i = 1; i <= GRID_SIZE; i++) { // Check cells along direction
                 const nextX = currentExplorePos.x + dir.dx;
                 const nextY = currentExplorePos.y + dir.dy;

                 if (!isValid(nextX, nextY) || isWall(nextX, nextY)) {
                     break; // Stop exploring this direction (hit wall/edge)
                 }

                 // Valid next step
                 currentExplorePos = { x: nextX, y: nextY };
                 const nextPath = [...pathSoFar, currentExplorePos]; // Add current step to path

                 // Add this intermediate cell as a potential bend point to the queue
                  const nextStateKey = `${currentExplorePos.x},${currentExplorePos.y},${bendsMade + 1}`;
                  if(!visited.has(nextStateKey)){
                       q.push({ pos: currentExplorePos, pathSoFar: nextPath, bendsMade: bendsMade + 1 });
                  }


                 // Check for hit after taking the step
                 if (currentExplorePos.x === targetPos.x && currentExplorePos.y === targetPos.y) {
                    return true; // Found a hit
                 }
             }
        }
    }

    return false; // BFS completed without finding a path
}


// --- Start Game ---
init(); // Call the main initialization function