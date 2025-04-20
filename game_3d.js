import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- DOM Elements ---
// Removed all UI element selectors

// --- Game Constants ---
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 2;
const WALL_DENSITY = 0.25; // Kept for initial random generation
// Removed all other game constants (fuel, health, timing, etc.)

// --- Three.js Setup ---
let scene, camera, renderer, controls;
let gameBoardGroup;
let floorMeshes = []; // Simplified, only floor
let wallMeshes = [];
let playerMesh, aiMesh;
// Removed highlights, projectiles, dampeners meshes etc.

// --- Materials (Ultra Basic) ---
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0x00dd00 });
const aiMaterial = new THREE.MeshBasicMaterial({ color: 0xdd0000 });
// Removed all other materials

// Removed Raycaster and Mouse logic

// --- Game State (Minimal for Setup) ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
// Removed all other game state variables

// --- Initialization ---
function init() {
  console.log("Initializing Minimal 3D Board Display...");
  initThreeJS();
  initBoardAndPlayers(); // Simplified init logic call
  animate();
  console.log("Minimal Display Initialized.");
}

function initThreeJS() {
  const canvasContainer = document.getElementById("gameCanvasContainer");
  const canvas = document.getElementById("threeCanvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee);
  const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 100);
  camera.position.set(
    0,
    GRID_SIZE * CELL_3D_SIZE * 0.7,
    GRID_SIZE * CELL_3D_SIZE * 0.6
  );
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); // Antialias can be nice for static view
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio); // Use full device resolution
  renderer.shadowMap.enabled = false; // No shadows needed

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Simple lighting
  scene.add(ambientLight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Smoother controls if desired
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // Limit looking straight down slightly
  controls.minDistance = CELL_3D_SIZE * 3;
  controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.2;

  gameBoardGroup = new THREE.Group();
  scene.add(gameBoardGroup);

  // Removed intersection plane

  window.addEventListener("resize", onWindowResize, false);
  onWindowResize(); // Call initially
}

function onWindowResize() {
  const canvasContainer = document.getElementById("gameCanvasContainer");
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function initBoardAndPlayers() {
  clearBoard3D();
  generateGrid(); // Generate the layout
  createBoard3D(); // Create the visual board

  const startPositions = findStartPositions(); // Find places for players
  if (!startPositions) {
    console.error("Failed to find start positions!");
    // No UI to update, just log error
    return;
  }
  playerPos = startPositions.player;
  aiPos = startPositions.ai;

  createUnits3D(); // Create the player models

  controls.target.set(0, 0, 0); // Center camera target
  controls.update();
  console.log("Board and players generated.");
}

// Removed setupInputListeners

// --- Grid Generation Functions (UNCHANGED LOGIC - needed for setup) ---
function generateGrid() {
  let attempts = 0;
  while (attempts < 10) {
    grid = Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill("floor"));
    let wallCount = 0;
    const totalCells = GRID_SIZE * GRID_SIZE;
    const targetWallCount = Math.floor(totalCells * WALL_DENSITY);
    while (wallCount < targetWallCount) {
      const x = Math.floor(Math.random() * GRID_SIZE);
      const y = Math.floor(Math.random() * GRID_SIZE);
      if (grid[y][x] === "floor") {
        grid[y][x] = "wall";
        wallCount++;
      }
    }
    // Skip dampener placement logic - they will just be 'floor' visually
    if (isGridConnected()) {
      return;
    }
    attempts++;
    console.warn(`Grid gen attempt ${attempts} failed connectivity.`);
  }
  console.error("Failed to generate connected grid.");
}
function isGridConnected() {
    const startNode = findFirstFloorOrDampener(); // Function name kept, but only checks for floor now implicitly
    if (!startNode) return false;
    const q = [startNode];
    const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0;
    let totalFloorCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // Treat dampeners as floor for connectivity check
            if (grid[y][x] === "floor" || grid[y][x] === "dampener") totalFloorCount++;
        }
    }
    if (totalFloorCount === 0) return false; // No floor cells at all
    while (q.length > 0) {
        const { x, y } = q.shift();
        // Treat dampeners as floor for connectivity check
        if (grid[y][x] === "floor" || grid[y][x] === "dampener") {
             reachableFloorCount++;
        }
        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 },
        ];
        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (
                isValid(n.x, n.y) &&
                (grid[n.y][n.x] === "floor" || grid[n.y][n.x] === "dampener") && // Check includes potential dampeners
                !visited.has(key)
            ) {
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
        // Return first non-wall cell
      if (grid[y][x] === "floor" || grid[y][x] === "dampener") return { x, y };
    }
  }
  return null;
}
function findStartPositions() {
    const potentialStarts = [
      { x: 1, y: 1 },
      { x: GRID_SIZE - 2, y: GRID_SIZE - 2 },
      { x: 1, y: GRID_SIZE - 2 },
      { x: GRID_SIZE - 2, y: 1 },
    ];
    // Find nearest non-wall for player 1
    const playerStart = findNearestFloorBFS(potentialStarts[0]);

    let aiStart = null;
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]];
    farCorners.sort(() => Math.random() - 0.5); // Randomize search order

    // Try to find a distant starting spot for AI
    for (const corner of farCorners) {
      const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
      // Ensure it's found, different from player, and reasonably far
      if (potentialAiStart && playerStart &&
          distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) {
        aiStart = potentialAiStart;
        break;
      }
    }

    // Fallback: if no distant spot found, find *any* valid spot for AI not occupied by player
    if (!aiStart && playerStart) {
        aiStart = findNearestFloorBFS({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, [playerStart]);
    }

    // Final check if both positions are valid and distinct
    if (playerStart && aiStart && (playerStart.x !== aiStart.x || playerStart.y !== aiStart.y)) {
      return { player: playerStart, ai: aiStart };
    }

    console.error("Could not find two distinct start positions.");
    // Attempt fallback to *any* two distinct floor cells if primary logic fails
    const floorCells = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 'floor' || grid[y][x] === 'dampener') floorCells.push({x, y});
        }
    }
    if (floorCells.length >= 2) {
        console.warn("Using fallback start position logic.");
        floorCells.sort(() => Math.random() - 0.5);
        return { player: floorCells[0], ai: floorCells[1] };
    }

    return null; // Truly failed
}
function findNearestFloorBFS(startSearchPos, occupied = []) {
    const q = [{ pos: startSearchPos, dist: 0 }];
    const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    const occupiedSet = new Set(occupied.map(occ => `${occ.x},${occ.y}`));

    while (q.length > 0) {
        // Simple BFS, no need to sort by dist for just finding *any* valid cell
        const current = q.shift();
        const { x, y } = current.pos;
        const currentKey = `${x},${y}`;

        // Check if current cell is valid, non-wall, and not occupied
        if (isValid(x, y) && (grid[y][x] === 'floor' || grid[y][x] === 'dampener') && !occupiedSet.has(currentKey)) {
            return { x, y }; // Found a valid spot
        }

        // Explore neighbors
        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 },
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            // Add to queue if valid grid cell and not visited yet
            if (isValid(n.x, n.y) && !visited.has(key)) {
                visited.add(key);
                 // Add any valid cell, wall check happens when processing queue item
                q.push({ pos: n, dist: current.dist + 1 });
            }
        }
    }
    return null; // No valid spot found from this start position
}

// --- 3D Object Creation / Management Functions (Simplified) ---
function get3DPosition(x, y, yOffset = 0) {
  const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
  const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
  return new THREE.Vector3(worldX, yOffset, worldZ);
}

// Removed getGridCoords

function disposeMesh(mesh) {
  if (!mesh) return;
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) {
    // Check if material is an array (though unlikely in this simplified version)
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat) => mat.dispose());
    } else {
      mesh.material.dispose();
    }
  }
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }
   // If it's a group, recursively dispose children
   if (mesh.isGroup) {
       mesh.children.slice().forEach(child => disposeMesh(child));
   }
}

function clearBoard3D() {
  // Dispose all children of the main group
  gameBoardGroup.children.slice().forEach(child => disposeMesh(child));
  // Clear references
  floorMeshes = [];
  wallMeshes = [];
  playerMesh = null;
  aiMesh = null;
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    wallMeshes = [];

    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);
            const cellType = grid[y][x];
            let mesh;

            if (cellType === "floor" || cellType === "dampener") { // Treat dampener visually as floor
                mesh = new THREE.Mesh(floorGeom, floorMaterial);
                mesh.position.copy(pos);
                mesh.position.y = -0.1; // Position floor slightly below 0
                mesh.userData = { gridX: x, gridY: y, type: "floor" }; // Store grid coords if needed later
                gameBoardGroup.add(mesh);
                floorMeshes[y][x] = mesh;
            } else if (cellType === "wall") {
                mesh = new THREE.Mesh(wallGeom, wallMaterial);
                mesh.position.copy(pos);
                mesh.position.y = WALL_HEIGHT / 2 - 0.1; // Center wall vertically
                mesh.userData = { gridX: x, gridY: y, type: "wall" };
                gameBoardGroup.add(mesh);
                wallMeshes.push(mesh); // Keep track of walls if needed
                floorMeshes[y][x] = null; // Ensure no floor mesh here
            }
        }
    }
}

function createUnits3D() {
    // Ensure previous meshes are disposed if recreating
    if (playerMesh) disposeMesh(playerMesh);
    if (aiMesh) disposeMesh(aiMesh);

    const playerSize = CELL_3D_SIZE * 0.6;
    const playerGeom = new THREE.BoxGeometry(playerSize, playerSize, playerSize);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    // Use the determined playerPos
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerSize / 2);
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: "player" }; // Simple identifier
    gameBoardGroup.add(playerMesh);

    const aiSize = CELL_3D_SIZE * 0.6; // Can be same or different
    const aiGeom = new THREE.BoxGeometry(aiSize, aiSize, aiSize);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
     // Use the determined aiPos
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiSize / 2);
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: "ai" };
    gameBoardGroup.add(aiMesh);
}

// Removed Powerup functions
// Removed Highlighting functions
// Removed Missile/Explosion functions

// --- Animation Loop (Minimal) ---
function animate() {
  requestAnimationFrame(animate);
  // TWEEN.update(time); // Removed TWEEN
  controls.update(); // Update camera controls
  renderer.render(scene, camera);
}

// Removed Input Handling functions
// Removed UI Update functions
// Removed Planning Phase functions
// Removed Pathfinding functions (except BFS for start positions)
// Removed AI Logic functions
// Removed Action Execution & Turn Management functions
// Removed wait function
// Removed Game Over function

// --- Utility Functions (Minimal subset) ---
function isValid(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}
function isWall(x, y) { // Kept as it might be useful for generation logic
  return isValid(x, y) && grid[y][x] === "wall";
}
// Removed isPowerupAt
// Removed getValidMoves
function distance(pos1, pos2) { // Kept for findStartPositions logic
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

// --- Start Display ---
init();