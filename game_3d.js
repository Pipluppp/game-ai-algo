// game_3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from "@tweenjs/tween.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// --- DOM Elements ---
// ... (keep existing DOM element selectors)
const canvasContainer = document.getElementById("gameCanvasContainer");
const canvas = document.getElementById("threeCanvas");
const btnPlanMove = document.getElementById("btnPlanMove");
const btnPlanShoot = document.getElementById("btnPlanShoot");
const btnReset = document.getElementById("btnReset");
const phaseIndicator = document.getElementById("phaseIndicator");
const messageArea = document.getElementById("messageArea");
const playerFuelInfo = document.getElementById("playerFuelInfo");
const aiFuelInfo = document.getElementById("aiFuelInfo");
const planFuelCostInfo = document.getElementById("planFuelCostInfo");

// --- Game Constants ---
// ... (keep existing constants)
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
const INITIAL_FUEL = 10;
const FUEL_PER_UPGRADE = 5;
const INITIAL_POWERUP_COUNT = 8;
const AI_DISTANCE_BIAS = 0.95;
const BASE_MOVE_COST = 1;
const TURN_PENALTY = 1;

// Timing Constants
const MISSILE_TRAVEL_DURATION = 1200; // Increased duration for more complex anim
const MOVEMENT_DURATION = 400;
const AI_THINK_DELAY = 50;
const ACTION_RESOLVE_DELAY = 200;
const EXPLOSION_DURATION = 700; // Duration for the explosion effect

// --- Three.js Setup ---
// ... (keep existing setup variables)
let scene, camera, renderer, controls, composer;
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = []; // Fuel Cells
let playerMesh, aiMesh;
let playerFuelIndicator, aiFuelIndicator;
let activeHighlights = [];
let activeProjectiles = []; // Will hold missile meshes, trails, explosion parts

// Materials
// ... (keep existing materials)
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a,
  roughness: 0.9,
  metalness: 0.2,
  receiveShadow: true,
  flatShading: true,
});
const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0x5a6a7a,
  roughness: 0.7,
  metalness: 0.3,
  emissive: 0x101010,
  emissiveIntensity: 0.1,
  flatShading: true,
  castShadow: true,
  receiveShadow: true,
});
const playerMaterial = new THREE.MeshStandardMaterial({
  color: 0x007bff,
  roughness: 0.4,
  metalness: 0.5,
  emissive: 0x003a7f,
  emissiveIntensity: 0.5,
  castShadow: true,
});
const aiMaterial = new THREE.MeshStandardMaterial({
  color: 0xdc3545,
  roughness: 0.4,
  metalness: 0.5,
  emissive: 0x6b1a22,
  emissiveIntensity: 0.5,
  castShadow: true,
});
const powerupMaterial = new THREE.MeshStandardMaterial({
  color: 0xffc107,
  emissive: 0xffc107,
  emissiveIntensity: 1.5,
  roughness: 0.2,
  metalness: 0.8,
  castShadow: true,
});
const moveHighlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ff00,
  transparent: true,
  opacity: 0.4,
  emissive: 0x00ff00,
  emissiveIntensity: 0.2,
});
const pathHighlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xffa500,
  transparent: true,
  opacity: 0.5,
  emissive: 0xffa500,
  emissiveIntensity: 0.3,
});
const invalidPathHighlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  transparent: true,
  opacity: 0.3,
  emissive: 0x444444,
  emissiveIntensity: 0.1,
});
const hitHighlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xff0000,
  transparent: true,
  opacity: 0.6,
  emissive: 0xff0000,
  emissiveIntensity: 0.5,
});

// --- NEW Missile/Explosion Materials ---
const playerMissileCoreMaterial = new THREE.MeshStandardMaterial({
  color: 0x00bfff,
  emissive: 0x00bfff,
  emissiveIntensity: 2.0,
  roughness: 0.1,
  metalness: 0.6,
});
const aiMissileCoreMaterial = new THREE.MeshStandardMaterial({
  color: 0xff6a6a,
  emissive: 0xff6a6a,
  emissiveIntensity: 2.0,
  roughness: 0.1,
  metalness: 0.6,
});
const missileTrailMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.15,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
  depthWrite: false,
});
const explosionShockwaveMaterial = new THREE.MeshBasicMaterial({
  color: 0xffccaa, // Orangey-white
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide, // Render inside of sphere too
  depthWrite: false,
});
const explosionParticleMaterial = new THREE.PointsMaterial({
  color: 0xff8844, // Orange sparks
  size: 0.25,
  transparent: true,
  opacity: 1.0,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
  depthWrite: false,
  vertexColors: true, // We can tint particles later if needed
});
// --- END NEW Materials ---

// Raycasting
// ... (keep existing raycasting setup)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State ---
// ... (keep existing game state variables)
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerFuel = INITIAL_FUEL;
let aiFuel = INITIAL_FUEL;
let powerUpPositions = [];
let gamePhase = "playerTurn";
let currentPlayer = "player";
let currentPlanningMode = "move";
let plannedShootPath = null; // Store calculated path during player hover
let plannedShootCost = 0; // Store cost during player hover
let currentHoverPos = null; // Track the currently hovered grid cell
let gameOverState = null;
let isResolving = false;

// --- Initialization ---
// ... (init, initThreeJS, onWindowResize, initGameLogic - unchanged)
function init() {
  console.log("Initializing 3D Missile Game with Turn Cost...");
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
  camera.position.set(
    0,
    GRID_SIZE * CELL_3D_SIZE * 0.8,
    GRID_SIZE * CELL_3D_SIZE * 0.7
  );
  camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(
    GRID_SIZE * CELL_3D_SIZE * 0.6,
    GRID_SIZE * CELL_3D_SIZE * 1.2,
    GRID_SIZE * CELL_3D_SIZE * 0.5
  );
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
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      canvasContainer.clientWidth,
      canvasContainer.clientHeight
    ),
    1.0,
    0.4,
    0.85
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
  const planeMat = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
  });
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
  playerFuel = INITIAL_FUEL;
  aiFuel = INITIAL_FUEL;
  powerUpPositions = [];
  powerupMeshes = [];
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
  setMessage("Your Turn: Plan your move or missile shot.");
  updatePhaseIndicator();
  updateFuelInfo();
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
  canvasContainer.addEventListener("contextmenu", (event) =>
    event.preventDefault()
  );
}

// --- Grid Generation Functions --- (Unchanged)
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
      const isNearCorner = (px, py) =>
        (px >= 0 && px <= 4 && py >= 0 && py <= 4) ||
        (px >= GRID_SIZE - 5 &&
          px < GRID_SIZE &&
          py >= GRID_SIZE - 5 &&
          py < GRID_SIZE) ||
        (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
        (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);
      if (
        grid[y][x] === "floor" &&
        !isNearCorner(x, y) &&
        Math.random() < 0.9
      ) {
        grid[y][x] = "wall";
        wallCount++;
      } else if (grid[y][x] === "floor" && Math.random() < 0.2) {
        grid[y][x] = "wall";
        wallCount++;
      }
    }
    if (isGridConnected()) {
      console.log("Generated connected grid.");
      return;
    }
    attempts++;
    console.warn(
      `Generated grid attempt ${attempts} was not connected or valid. Retrying...`
    );
  }
  console.error(
    "Failed to generate a valid connected grid after multiple attempts."
  );
  grid = Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill("floor"));
  for (let i = 0; i < GRID_SIZE * GRID_SIZE * 0.1; i++) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    if (grid[y][x] === "floor") grid[y][x] = "wall";
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
      if (grid[y][x] === "floor") totalFloorCount++;
    }
  }
  if (totalFloorCount === 0) return false;
  while (q.length > 0) {
    const { x, y } = q.shift();
    reachableFloorCount++;
    const neighbors = [
      { x: x + 1, y: y },
      { x: x - 1, y: y },
      { x: x, y: y + 1 },
      { x: x, y: y - 1 },
    ];
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (
        isValid(n.x, n.y) &&
        grid[n.y][n.x] === "floor" &&
        !visited.has(key)
      ) {
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
      if (grid[y][x] === "floor") return { x, y };
    }
  }
  return null;
}
function findStartPositions() {
  const potentialStarts = [
    { x: 2, y: 2 },
    { x: GRID_SIZE - 3, y: GRID_SIZE - 3 },
    { x: 2, y: GRID_SIZE - 3 },
    { x: GRID_SIZE - 3, y: 2 },
  ];
  const playerStart = findNearestFloorBFS(potentialStarts[0]);
  let aiStart = null;
  const farCorners = [
    potentialStarts[1],
    potentialStarts[2],
    potentialStarts[3],
  ];
  farCorners.sort(() => Math.random() - 0.5);
  for (const corner of farCorners) {
    const potentialAiStart = findNearestFloorBFS(
      corner,
      playerStart ? [playerStart] : []
    );
    if (
      potentialAiStart &&
      playerStart &&
      distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6
    ) {
      aiStart = potentialAiStart;
      break;
    }
  }
  if (!aiStart && playerStart) {
    console.warn(
      "Could not find a far start position for AI, trying any reachable floor."
    );
    aiStart = findNearestFloorBFS(
      { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) },
      [playerStart]
    );
  }
  if (playerStart && aiStart) {
    console.log(
      `Player start: ${playerStart.x},${playerStart.y}. AI start: ${aiStart.x},${aiStart.y}`
    );
    return { player: playerStart, ai: aiStart };
  }
  console.error("Failed to find suitable start positions even with fallbacks.");
  return null;
}
function findNearestFloorBFS(startSearchPos, occupied = []) {
  const q = [{ pos: startSearchPos, dist: 0 }];
  const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
  occupied.forEach((occ) => visited.add(`${occ.x},${occ.y}`));
  while (q.length > 0) {
    const current = q.shift();
    const { x, y } = current.pos;
    if (
      isValid(x, y) &&
      grid[y][x] === "floor" &&
      !occupied.some((occ) => occ.x === x && occ.y === y)
    ) {
      return { x, y };
    }
    const neighbors = [
      { x: x + 1, y: y },
      { x: x - 1, y: y },
      { x: x, y: y + 1 },
      { x: x, y: y - 1 },
    ];
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (isValid(n.x, n.y) && !visited.has(key)) {
        visited.add(key);
        q.push({ pos: n, dist: current.dist + 1 });
      }
    }
  }
  console.warn(
    `BFS from ${startSearchPos.x},${startSearchPos.y} found no valid floor.`
  );
  return null;
}

// --- 3D Object Creation / Management Functions ---
// ... (get3DPosition, getGridCoords, disposeMesh, disposeSprite, clearBoard3D, createBoard3D, createUnits3D, createFuelTextMesh, updateFuelVisuals, createPowerup3D, removePowerup3D - unchanged)
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
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat) => mat.dispose());
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
  gameBoardGroup.children.slice().forEach((child) => {
    if (child.isMesh) {
      disposeMesh(child);
    } else if (child.isSprite) {
      disposeSprite(child);
    }
  });
  disposeSprite(playerFuelIndicator);
  disposeSprite(aiFuelIndicator);
  playerFuelIndicator = null;
  aiFuelIndicator = null;
  floorMeshes = [];
  wallMeshes = [];
  powerupMeshes = [];
  playerMesh = null;
  aiMesh = null;
  activeHighlights.forEach(disposeMesh);
  activeHighlights = [];
} // Cleanup existing projectiles/effects activeProjectiles.forEach(proj => { if (proj.mesh) disposeMesh(proj.mesh); if (proj.light) disposeMesh(proj.light); // includes PointLight if (proj.trail) disposeMesh(proj.trail); }); activeProjectiles = []; }
function createBoard3D() {
  floorMeshes = Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill(null));
  wallMeshes = [];
  const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
  const wallGeom = new THREE.BoxGeometry(
    CELL_3D_SIZE,
    WALL_HEIGHT,
    CELL_3D_SIZE
  );
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const pos = get3DPosition(x, y);
      if (grid[y][x] === "floor") {
        const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
        floorMesh.position.copy(pos);
        floorMesh.position.y = -0.1;
        floorMesh.castShadow = false;
        floorMesh.receiveShadow = true;
        floorMesh.userData = { gridX: x, gridY: y, type: "floor" };
        gameBoardGroup.add(floorMesh);
        floorMeshes[y][x] = floorMesh;
      } else if (grid[y][x] === "wall") {
        const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
        wallMesh.position.copy(pos);
        wallMesh.position.y = WALL_HEIGHT / 2;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        wallMesh.userData = { gridX: x, gridY: y, type: "wall" };
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
  const playerGeom = new THREE.CapsuleGeometry(
    playerUnitRadius,
    playerUnitHeight - playerUnitRadius * 2,
    4,
    10
  );
  playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
  playerMesh.castShadow = true;
  playerMesh.receiveShadow = false;
  const playerPos3D = get3DPosition(
    playerPos.x,
    playerPos.y,
    playerUnitHeight / 2
  );
  playerMesh.position.copy(playerPos3D);
  playerMesh.userData = { type: "player" };
  gameBoardGroup.add(playerMesh);
  playerFuelIndicator = createFuelTextMesh(playerFuel);
  playerFuelIndicator.position.set(0, playerUnitHeight * 0.6, 0);
  playerMesh.add(playerFuelIndicator);
  const aiUnitHeight = CELL_3D_SIZE * 1.0;
  const aiUnitRadius = CELL_3D_SIZE * 0.4;
  const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8);
  aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
  aiMesh.castShadow = true;
  aiMesh.receiveShadow = false;
  const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2);
  aiMesh.position.copy(aiPos3D);
  aiMesh.userData = { type: "ai" };
  gameBoardGroup.add(aiMesh);
  aiFuelIndicator = createFuelTextMesh(aiFuel);
  aiFuelIndicator.position.set(0, aiUnitHeight * 0.6, 0);
  aiMesh.add(aiFuelIndicator);
  updateFuelVisuals();
}
function createFuelTextMesh(fuel) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const size = 128;
  const halfSize = size / 2;
  canvas.width = size;
  canvas.height = size;
  context.fillStyle = "rgba(0, 0, 0, 0.7)";
  context.beginPath();
  context.roundRect(0, 0, size, size, size * 0.15);
  context.fill();
  context.font = `Bold ${size * 0.6}px Arial`;
  context.fillStyle = "white";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(fuel.toString(), halfSize, halfSize + size * 0.02);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    sizeAttenuation: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.1, 0.1, 1);
  return sprite;
}
function updateFuelVisuals() {
  if (playerMesh && playerFuelIndicator) {
    playerMesh.remove(playerFuelIndicator);
    disposeSprite(playerFuelIndicator);
    playerFuelIndicator = createFuelTextMesh(playerFuel);
    const playerUnitHeight = CELL_3D_SIZE * 0.9;
    playerFuelIndicator.position.set(0, playerUnitHeight * 0.6, 0);
    playerMesh.add(playerFuelIndicator);
    playerMesh.material.emissiveIntensity = 0.5 + playerFuel / 50;
  }
  if (aiMesh && aiFuelIndicator) {
    aiMesh.remove(aiFuelIndicator);
    disposeSprite(aiFuelIndicator);
    aiFuelIndicator = createFuelTextMesh(aiFuel);
    const aiUnitHeight = CELL_3D_SIZE * 1.0;
    aiFuelIndicator.position.set(0, aiUnitHeight * 0.6, 0);
    aiMesh.add(aiFuelIndicator);
    aiMesh.material.emissiveIntensity = 0.5 + aiFuel / 50;
  }
}
function createPowerup3D(x, y) {
  const powerupSize = CELL_3D_SIZE * 0.3;
  const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0);
  const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
  mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7));
  mesh.castShadow = true;
  mesh.userData = {
    type: "powerup",
    gridX: x,
    gridY: y,
    spinSpeed: Math.random() * 0.03 + 0.015,
  };
  gameBoardGroup.add(mesh);
  return { mesh: mesh, pos: { x, y } };
}
function removePowerup3D(x, y) {
  const meshIndex = powerupMeshes.findIndex(
    (p) => p.pos.x === x && p.pos.y === y
  );
  if (meshIndex !== -1) {
    const powerupObj = powerupMeshes[meshIndex];
    disposeMesh(powerupObj.mesh);
    powerupMeshes.splice(meshIndex, 1);
  } else {
    console.warn(`Could not find fuel cell mesh at ${x},${y} to remove.`);
  }
  const logicalIndex = powerUpPositions.findIndex(
    (p) => p.x === x && p.y === y
  );
  if (logicalIndex !== -1) {
    powerUpPositions.splice(logicalIndex, 1);
  }
}

// --- Highlighting Functions ---
// ... (clearHighlights, highlightCell, renderHighlights - unchanged)
function clearHighlights() {
  activeHighlights.forEach((mesh) => {
    disposeMesh(mesh);
  });
  activeHighlights = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === "floor" && !floorMeshes[y]?.[x]) {
        const floorGeom = new THREE.BoxGeometry(
          CELL_3D_SIZE,
          0.2,
          CELL_3D_SIZE
        );
        const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
        floorMesh.position.copy(get3DPosition(x, y));
        floorMesh.position.y = -0.1;
        floorMesh.castShadow = false;
        floorMesh.receiveShadow = true;
        floorMesh.userData = { gridX: x, gridY: y, type: "floor" };
        gameBoardGroup.add(floorMesh);
        floorMeshes[y][x] = floorMesh;
      }
    }
  }
}
function highlightCell(x, y, highlightMaterial) {
  if (isValid(x, y) && grid[y][x] === "floor") {
    const existingMesh = floorMeshes[y]?.[x];
    if (existingMesh) {
      disposeMesh(existingMesh);
      floorMeshes[y][x] = null;
    }
    const highlightGeom = new THREE.BoxGeometry(
      CELL_3D_SIZE,
      0.25,
      CELL_3D_SIZE
    );
    const highlightMesh = new THREE.Mesh(
      highlightGeom,
      highlightMaterial.clone()
    );
    highlightMesh.position.copy(get3DPosition(x, y));
    highlightMesh.position.y = -0.08;
    highlightMesh.userData = { gridX: x, gridY: y, type: "highlight" };
    gameBoardGroup.add(highlightMesh);
    activeHighlights.push(highlightMesh);
  }
}
function renderHighlights() {
  clearHighlights();
  clearPlanningCostUI();
  if (currentPlayer !== "player" || isResolving || gameOverState) {
    if (activeHighlights.length > 0) clearHighlights();
    return;
  }
  if (currentPlanningMode === "move") {
    const validMoves = getValidMoves(playerPos, aiPos);
    validMoves.forEach((move) =>
      highlightCell(move.x, move.y, moveHighlightMaterial)
    );
  } else if (currentPlanningMode === "shoot") {
    if (plannedShootPath && plannedShootPath.length > 0) {
      const cost = plannedShootCost;
      const available = playerFuel;
      const canAfford = cost <= available;
      const pathMaterial = canAfford
        ? pathHighlightMaterial
        : invalidPathHighlightMaterial;
      plannedShootPath.forEach((p) => {
        if (!(p.x === playerPos.x && p.y === playerPos.y)) {
          highlightCell(p.x, p.y, pathMaterial);
        }
      });
      const target = plannedShootPath[plannedShootPath.length - 1];
      const targetMaterial = canAfford
        ? hitHighlightMaterial
        : invalidPathHighlightMaterial;
      highlightCell(target.x, target.y, targetMaterial);
      updatePlanningCostUI(cost, available);
    } else {
      clearPlanningCostUI();
    }
  }
}

// --- ====================================== ---
// --- NEW: Guided Missile Visual Function ---
// --- ====================================== ---

/**
 * Creates the guided missile animation: launch, travel with trail, and explosion.
 * @param {Array<object>} path Array of {x, y} grid coordinates.
 * @param {THREE.Material} missileCoreMaterial The base material for the missile body.
 * @param {Function} [onCompleteCallback] Optional callback when the entire sequence finishes.
 */
function createGuidedMissileVisual(
  path,
  missileCoreMaterial,
  onCompleteCallback = null
) {
  if (!path || path.length < 2) return;

  const startGridPos = path[0];
  const endGridPos = path[path.length - 1];

  // --- Path and Curve Setup ---
  const launchHeight = CELL_3D_SIZE * 0.7; // Height missile starts above launcher
  const impactHeight = CELL_3D_SIZE * 0.3; // Height missile impacts above target floor
  const midHeightBoost = CELL_3D_SIZE * 1.5 * Math.min(1.0, path.length / 5); // Apex boost based on path length

  const points3D = path.map((p, index) => {
    let yOffset =
      launchHeight +
      (impactHeight - launchHeight) * (index / (path.length - 1)); // Linear interpolation
    // Add a curve upwards in the middle
    const midPointFactor = Math.sin((index / (path.length - 1)) * Math.PI); // 0 at start/end, 1 in middle
    yOffset += midHeightBoost * midPointFactor;
    return get3DPosition(p.x, p.y, yOffset);
  });

  // Ensure start/end points are precisely above the unit/target floor
  points3D[0] = get3DPosition(startGridPos.x, startGridPos.y, launchHeight);
  points3D[points3D.length - 1] = get3DPosition(
    endGridPos.x,
    endGridPos.y,
    impactHeight
  );

  const curve = new THREE.CatmullRomCurve3(points3D, false, "catmullrom", 0.2); // Smoother curve

  // --- Missile Mesh ---
  const missileRadius = CELL_3D_SIZE * 0.12;
  const missileLength = CELL_3D_SIZE * 0.45;
  // Cone points along positive Y by default, rotate it
  const missileGeom = new THREE.ConeGeometry(missileRadius, missileLength, 8);
  missileGeom.rotateX(Math.PI / 2); // Point along Z
  missileGeom.translate(0, 0, missileLength / 2); // Center pivot at the base

  const missileMesh = new THREE.Mesh(missileGeom, missileCoreMaterial.clone());
  missileMesh.position.copy(curve.getPointAt(0));
  missileMesh.lookAt(curve.getPointAt(0.01)); // Initial orientation
  missileMesh.userData = { type: "missile_object" };
  scene.add(missileMesh);
  activeProjectiles.push({ mesh: missileMesh }); // Track for potential cleanup

  // --- Trail Particles ---
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  activeProjectiles.push({ trail: trailGroup }); // Track for potential cleanup
  const trailSpawnInterval = 30; // ms
  let lastTrailSpawnTime = 0;
  const trailParticleLifetime = 400; // ms

  // --- Missile Movement Tween ---
  const travelTween = new TWEEN.Tween({ t: 0 })
    .to({ t: 1 }, MISSILE_TRAVEL_DURATION)
    .easing(TWEEN.Easing.Linear.None) // Constant speed (can change easing)
    .onUpdate((obj, elapsed) => {
      const currentTime = performance.now();
      const currentPoint = curve.getPointAt(obj.t);
      const tangent = curve.getTangentAt(obj.t).normalize();

      missileMesh.position.copy(currentPoint);

      // Orientation: Look ahead along the tangent
      const lookAtPoint = currentPoint.clone().add(tangent);
      missileMesh.lookAt(lookAtPoint);

      // Spawn Trail Particles periodically
      if (
        currentTime - lastTrailSpawnTime > trailSpawnInterval &&
        obj.t < 0.98
      ) {
        // Don't spawn right at the end
        lastTrailSpawnTime = currentTime;
        const particleGeom = new THREE.SphereGeometry(
          missileRadius * 0.4,
          4,
          2
        );
        const particleMat = missileTrailMaterial.clone(); // Clone to animate opacity individually
        particleMat.opacity = 0.7; // Start slightly faded
        const particle = new THREE.Mesh(particleGeom, particleMat);
        // Spawn slightly behind the missile base
        particle.position
          .copy(currentPoint)
          .addScaledVector(tangent, -missileLength * 0.6);
        trailGroup.add(particle);

        // Animate particle fade out and shrink
        new TWEEN.Tween(particle.material)
          .to({ opacity: 0 }, trailParticleLifetime)
          .easing(TWEEN.Easing.Quadratic.In)
          .start();
        new TWEEN.Tween(particle.scale)
          .to({ x: 0.01, y: 0.01, z: 0.01 }, trailParticleLifetime)
          .easing(TWEEN.Easing.Quadratic.In)
          .onComplete(() => {
            trailGroup.remove(particle);
            disposeMesh(particle);
          })
          .start();
      }
    })
    .onComplete(() => {
      // Missile reached destination
      const impactPosition = curve.getPointAt(1);
      createExplosionEffect(impactPosition, missileCoreMaterial.color); // Trigger explosion

      // Clean up missile mesh immediately
      scene.remove(missileMesh);
      disposeMesh(missileMesh);
      const missileIndex = activeProjectiles.findIndex(
        (p) => p.mesh === missileMesh
      );
      if (missileIndex > -1) activeProjectiles.splice(missileIndex, 1);

      // Clean up trail group after a short delay (let existing particles fade)
      setTimeout(() => {
        scene.remove(trailGroup);
        trailGroup.children.forEach(disposeMesh); // Dispose any remaining particles
        const trailIndex = activeProjectiles.findIndex(
          (p) => p.trail === trailGroup
        );
        if (trailIndex > -1) activeProjectiles.splice(trailIndex, 1);

        // Call the final callback after trail cleanup
        if (onCompleteCallback) {
          onCompleteCallback();
        }
      }, trailParticleLifetime);
    })
    .start();
}

/**
 * Creates a visual explosion effect at a given position.
 * @param {THREE.Vector3} position World position for the explosion center.
 * @param {THREE.Color} baseColor Color hint for the explosion.
 */
function createExplosionEffect(position, baseColor) {
  const explosionGroup = new THREE.Group();
  scene.add(explosionGroup);
  activeProjectiles.push({ explosion: explosionGroup }); // Track for cleanup

  const explosionScale = CELL_3D_SIZE * 1.5; // Max size of explosion effects

  // --- 1. Shockwave Sphere ---
  const shockwaveGeom = new THREE.SphereGeometry(explosionScale * 0.1, 32, 16);
  const shockwaveMat = explosionShockwaveMaterial.clone();
  shockwaveMat.color.set(baseColor).lerp(new THREE.Color(0xffffff), 0.7); // Blend base color with white
  const shockwaveMesh = new THREE.Mesh(shockwaveGeom, shockwaveMat);
  shockwaveMesh.position.copy(position);
  explosionGroup.add(shockwaveMesh);

  new TWEEN.Tween(shockwaveMesh.scale)
    .to(
      { x: explosionScale, y: explosionScale, z: explosionScale },
      EXPLOSION_DURATION * 0.6
    )
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();

  new TWEEN.Tween(shockwaveMesh.material)
    .to({ opacity: 0 }, EXPLOSION_DURATION * 0.7)
    .easing(TWEEN.Easing.Cubic.In) // Fade faster at the end
    .delay(EXPLOSION_DURATION * 0.1) // Start fading slightly after expansion starts
    .start();

  // --- 2. Particle Burst ---
  const particleCount = 150;
  const positions = new Float32Array(particleCount * 3);
  const velocities = []; // Store velocity vectors
  const colors = new Float32Array(particleCount * 3);
  const initialSizes = new Float32Array(particleCount); // Store initial random sizes

  const particleBaseColor = baseColor
    .clone()
    .lerp(new THREE.Color(0xffaa00), 0.5); // Orangey

  for (let i = 0; i < particleCount; i++) {
    // Initial position is the center
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;

    // Random velocity (outward spherical)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1); // Uniform spherical distribution
    const speed = (Math.random() * 0.8 + 0.2) * explosionScale * 1.8; // Random speed
    const velocity = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    ).multiplyScalar(speed);
    velocities.push(velocity);

    // Color (start bright orange/yellow, fade to red/dark)
    const initialColor = particleBaseColor
      .clone()
      .lerp(new THREE.Color(0xffffdd), Math.random() * 0.6);
    colors[i * 3] = initialColor.r;
    colors[i * 3 + 1] = initialColor.g;
    colors[i * 3 + 2] = initialColor.b;

    // Random initial size
    initialSizes[i] = (Math.random() * 0.6 + 0.4) * 0.3; // Base size factor
  }

  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  particleGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // We'll store velocity and initial size in userData or manage externally for the tween

  const particleMat = explosionParticleMaterial.clone();
  particleMat.size = 1.0; // Use size attribute later

  const particleSystem = new THREE.Points(particleGeom, particleMat);
  particleSystem.position.copy(position);
  explosionGroup.add(particleSystem);

  // Animate particles using a single tween controlling 't'
  const particleTween = new TWEEN.Tween({ t: 0, sizeFactor: 1.0, opacity: 1.0 })
    .to({ t: 1, sizeFactor: 0.01, opacity: 0.0 }, EXPLOSION_DURATION)
    .easing(TWEEN.Easing.Exponential.Out) // Fast start, slow end for particles
    .onUpdate((obj) => {
      const posAttr = particleSystem.geometry.attributes.position;
      const colAttr = particleSystem.geometry.attributes.color;

      for (let i = 0; i < particleCount; i++) {
        const t = obj.t;
        const easeT = TWEEN.Easing.Quadratic.Out(t); // Use easing for position displacement

        // Update position based on velocity and eased time
        posAttr.setXYZ(
          i,
          velocities[i].x * easeT,
          velocities[i].y * easeT,
          velocities[i].z * easeT
        );

        // Update color (e.g., shift towards red/dark)
        const colorProgress = Math.min(1, t * 1.5); // Fade color faster
        const currentColor = new THREE.Color().setRGB(
          colors[i * 3 + 0],
          colors[i * 3 + 1],
          colors[i * 3 + 2]
        );
        // Lerp towards a dark red/orange
        const targetColor = new THREE.Color(0x551100);
        currentColor.lerp(targetColor, colorProgress * 0.8);
        colAttr.setXYZ(i, currentColor.r, currentColor.g, currentColor.b);
      }
      // Update size and opacity globally for the material
      particleSystem.material.size = obj.sizeFactor * 0.3; // Adjust base size here
      particleSystem.material.opacity = obj.opacity;

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    })
    .start();

  // --- 3. Light Flash ---
  const flashLight = new THREE.PointLight(
    baseColor.clone().lerp(new THREE.Color(0xffffff), 0.8),
    15.0,
    explosionScale * 2.5,
    1.5
  ); // Bright, short range
  flashLight.position.copy(position);
  explosionGroup.add(flashLight);
  activeProjectiles.push({ light: flashLight }); // Track light

  new TWEEN.Tween(flashLight)
    .to({ intensity: 0 }, EXPLOSION_DURATION * 0.4) // Short, intense flash
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();

  // --- Cleanup for the entire explosion effect ---
  setTimeout(() => {
    scene.remove(explosionGroup);
    disposeMesh(shockwaveMesh);
    disposeMesh(particleSystem); // Disposes geometry and material
    scene.remove(flashLight); // PointLight doesn't use disposeMesh

    const explosionIndex = activeProjectiles.findIndex(
      (p) => p.explosion === explosionGroup
    );
    if (explosionIndex > -1) activeProjectiles.splice(explosionIndex, 1);
    const lightIndex = activeProjectiles.findIndex(
      (p) => p.light === flashLight
    );
    if (lightIndex > -1) activeProjectiles.splice(lightIndex, 1);
  }, EXPLOSION_DURATION + 100); // Cleanup slightly after animation ends
}
// --- ====================================== ---
// --- END: Guided Missile Visual Function ---
// --- ====================================== ---

// --- Animation Loop --- (Unchanged)
function animate(time) {
  requestAnimationFrame(animate);
  TWEEN.update(time);
  controls.update();
  powerupMeshes.forEach((p) => {
    if (p.mesh) {
      p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.015;
      p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5;
    }
  });
  composer.render();
}

// --- Input Handling Functions ---
// ... (handleCanvasMouseMove, handleCanvasClick, updateMouseCoords - unchanged)
function handleCanvasMouseMove(event) {
  if (
    currentPlayer !== "player" ||
    isResolving ||
    gameOverState ||
    currentPlanningMode !== "shoot"
  ) {
    if (plannedShootPath || currentHoverPos) {
      plannedShootPath = null;
      plannedShootCost = 0;
      currentHoverPos = null;
      clearPlanningCostUI();
      renderHighlights();
    }
    return;
  }
  updateMouseCoords(event);
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(intersectionPlane);
  let targetPos = null;
  if (intersects.length > 0) {
    const gridPos = getGridCoords(intersects[0].point);
    if (
      isValid(gridPos.x, gridPos.y) &&
      grid[gridPos.y][gridPos.x] === "floor"
    ) {
      targetPos = gridPos;
    }
  }
  const hoverChanged =
    !currentHoverPos ||
    !targetPos ||
    currentHoverPos.x !== targetPos.x ||
    currentHoverPos.y !== targetPos.y;
  if (hoverChanged) {
    currentHoverPos = targetPos ? { ...targetPos } : null;
    if (
      targetPos &&
      !(targetPos.x === playerPos.x && targetPos.y === playerPos.y)
    ) {
      const result = findShortestPathWithTurnCost(playerPos, targetPos, []);
      if (result) {
        plannedShootPath = result.path;
        plannedShootCost = result.cost;
        setMessage(
          `Target: ${targetPos.x},${targetPos.y}. Est. Cost: ${result.cost}`
        );
      } else {
        plannedShootPath = null;
        plannedShootCost = 0;
        setMessage(`Cannot reach target ${targetPos.x},${targetPos.y}.`);
      }
    } else {
      plannedShootPath = null;
      plannedShootCost = 0;
      setMessage(
        `Your Turn (Fuel: ${playerFuel}): Hover over a floor tile or the AI to target missile.`
      );
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
      if (currentPlanningMode === "move") {
        if (grid[clickedGridPos.y][clickedGridPos.x] === "floor") {
          handleMoveInput(clickedGridPos.x, clickedGridPos.y);
        } else {
          setMessage("Invalid move click: Must click on a floor tile.");
        }
      } else if (currentPlanningMode === "shoot") {
        if (
          plannedShootPath &&
          plannedShootPath.length > 0 &&
          plannedShootPath[plannedShootPath.length - 1].x ===
            clickedGridPos.x &&
          plannedShootPath[plannedShootPath.length - 1].y === clickedGridPos.y
        ) {
          const cost = plannedShootCost;
          if (cost <= playerFuel) {
            const action = {
              type: "shoot",
              target: clickedGridPos,
              _path: plannedShootPath,
              _cost: cost,
            };
            executeAction(action);
          } else {
            setMessage(
              `Not enough fuel! Cost: ${cost}, Available: ${playerFuel}`
            );
          }
        } else {
          setMessage(
            "Invalid target or path. Hover over a valid destination first."
          );
        }
      }
    } else {
      setMessage("Invalid click: Click within the grid boundaries.");
    }
  } else {
    setMessage("Invalid click: Click within the grid area.");
  }
}
function updateMouseCoords(event) {
  const rect = canvasContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// --- UI Update Functions ---
// ... (setMessage, updatePhaseIndicator, updateFuelInfo, updatePlanningCostUI, clearPlanningCostUI, enablePlanningControls, disablePlanningControls - unchanged)
function setMessage(msg) {
  messageArea.textContent = msg;
}
function updatePhaseIndicator() {
  let phaseText = "Unknown";
  if (gameOverState) {
    phaseText = `Game Over! ${gameOverState.message}`;
  } else if (isResolving) {
    phaseText = `Executing ${currentPlayer}'s Action...`;
  } else if (currentPlayer === "player") {
    phaseText = "Your Turn";
  } else if (currentPlayer === "ai") {
    phaseText = "AI Turn";
  }
  phaseIndicator.textContent = phaseText;
}
function updateFuelInfo() {
  playerFuelInfo.textContent = `Your Fuel: ${playerFuel}`;
  aiFuelInfo.textContent = `AI Fuel: ${aiFuel}`;
  updateFuelVisuals();
}
function updatePlanningCostUI(cost, available) {
  if (cost > 0) {
    planFuelCostInfo.textContent = `Est. Fuel Cost: ${cost} / Avail: ${available}`;
    planFuelCostInfo.style.color = cost <= available ? "lightgreen" : "salmon";
    planFuelCostInfo.style.fontWeight = "bold";
  } else {
    planFuelCostInfo.textContent = "";
    planFuelCostInfo.style.fontWeight = "normal";
  }
}
function clearPlanningCostUI() {
  planFuelCostInfo.textContent = "";
  planFuelCostInfo.style.fontWeight = "normal";
}
function enablePlanningControls() {
  if (gameOverState || isResolving || currentPlayer !== "player") return;
  btnPlanMove.disabled = false;
  btnPlanShoot.disabled = false;
  renderHighlights();
}
function disablePlanningControls() {
  btnPlanMove.disabled = true;
  btnPlanShoot.disabled = true;
  plannedShootPath = null;
  plannedShootCost = 0;
  currentHoverPos = null;
  clearHighlights();
  clearPlanningCostUI();
}

// --- Planning Phase Logic Functions (Player Only) ---
// ... (setPlanningMode, handleMoveInput - unchanged)
function setPlanningMode(mode) {
  if (currentPlayer !== "player" || isResolving || gameOverState) return;
  console.log("Setting planning mode:", mode);
  currentPlanningMode = mode;
  plannedShootPath = null;
  plannedShootCost = 0;
  currentHoverPos = null;
  clearPlanningCostUI();
  btnPlanMove.classList.toggle("active", mode === "move");
  btnPlanShoot.classList.toggle("active", mode === "shoot");
  if (mode === "move") {
    setMessage("Your Turn: Click an adjacent floor cell to move.");
  } else if (mode === "shoot") {
    setMessage(
      `Your Turn (Fuel: ${playerFuel}): Hover over a floor tile or the AI to target missile.`
    );
  }
  renderHighlights();
}
function handleMoveInput(targetX, targetY) {
  if (
    currentPlayer !== "player" ||
    currentPlanningMode !== "move" ||
    isResolving ||
    gameOverState
  )
    return;
  const validMoves = getValidMoves(playerPos, aiPos);
  const isValidTarget = validMoves.some(
    (move) => move.x === targetX && move.y === targetY
  );
  if (isValidTarget) {
    const action = { type: "move", target: { x: targetX, y: targetY } };
    executeAction(action);
  } else {
    setMessage("Invalid move target. Click a highlighted adjacent square.");
  }
}

// --- Pathfinding Logic (UCS with Turn Cost) ---
// ... (findShortestPathWithTurnCost - unchanged)
function findShortestPathWithTurnCost(
  startPos,
  targetPos,
  opponentBlockers = []
) {
  const priorityQueue = [];
  const startState = {
    pos: startPos,
    path: [startPos],
    cost: 0,
    arrivalDir: null,
  };
  priorityQueue.push([0, startState]);
  const visited = new Set();
  const startVisitedKey = `${startPos.x},${startPos.y},9,9`;
  visited.add(startVisitedKey);
  const blockerSet = new Set(opponentBlockers.map((p) => `${p.x},${p.y}`));
  while (priorityQueue.length > 0) {
    priorityQueue.sort((a, b) => a[0] - b[0]);
    const [currentCost, currentState] = priorityQueue.shift();
    if (
      currentState.pos.x === targetPos.x &&
      currentState.pos.y === targetPos.y
    ) {
      return { path: currentState.path, cost: currentState.cost };
    }
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    for (const moveDir of directions) {
      const neighborPos = {
        x: currentState.pos.x + moveDir.dx,
        y: currentState.pos.y + moveDir.dy,
      };
      if (
        !isValid(neighborPos.x, neighborPos.y) ||
        isWall(neighborPos.x, neighborPos.y)
      ) {
        continue;
      }
      const neighborKey = `${neighborPos.x},${neighborPos.y}`;
      if (
        blockerSet.has(neighborKey) &&
        (neighborPos.x !== targetPos.x || neighborPos.y !== targetPos.y)
      ) {
        continue;
      }
      let turnPenaltyCost = 0;
      if (currentState.arrivalDir !== null) {
        if (
          currentState.arrivalDir.dx !== moveDir.dx ||
          currentState.arrivalDir.dy !== moveDir.dy
        ) {
          turnPenaltyCost = TURN_PENALTY;
        }
      }
      const newCost = currentCost + BASE_MOVE_COST + turnPenaltyCost;
      const visitedKey = `${neighborPos.x},${neighborPos.y},${moveDir.dx},${moveDir.dy}`;
      if (!visited.has(visitedKey)) {
        visited.add(visitedKey);
        const newPath = [...currentState.path, neighborPos];
        const newState = {
          pos: neighborPos,
          path: newPath,
          cost: newCost,
          arrivalDir: moveDir,
        };
        priorityQueue.push([newCost, newState]);
      }
    }
  }
  return null;
}

// --- AI Logic (Using UCS with Turn Cost) ---
// ... (findBestActionUCSBased, findShortestPath_SimpleBFS - unchanged)
function findBestActionUCSBased() {
  console.log("AI using rule-based logic with UCS Turn Cost pathing...");
  const startTime = performance.now();
  const result = findShortestPathWithTurnCost(aiPos, playerPos, []);
  let canShoot = false;
  let winningShotAction = null;
  if (result) {
    const fuelCost = result.cost;
    if (fuelCost <= aiFuel) {
      canShoot = true;
      winningShotAction = {
        type: "shoot",
        target: playerPos,
        _path: result.path,
        _cost: fuelCost,
      };
      console.log(
        `AI Decision: Winning Shot Found. Path Length: ${result.path.length}, Cost: ${fuelCost}, Available Fuel: ${aiFuel}.`
      );
    } else {
      console.log(
        `AI found path to player (Cost: ${fuelCost}) but lacks fuel (${aiFuel}).`
      );
    }
  } else {
    console.log("AI: No path found to player.");
  }
  if (canShoot) {
    const endTime = performance.now();
    console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
    return winningShotAction;
  }
  const availableUpgrades = [...powerUpPositions];
  let shortestMovePathToUpgrade = null;
  let bestTargetUpgrade = null;
  availableUpgrades.sort((a, b) => distance(aiPos, a) - distance(aiPos, b));
  for (const upgradePos of availableUpgrades) {
    const upgradePath = findShortestPath_SimpleBFS(aiPos, upgradePos, [
      playerPos,
    ]);
    if (upgradePath && upgradePath.length > 1) {
      if (
        !shortestMovePathToUpgrade ||
        upgradePath.length < shortestMovePathToUpgrade.length
      ) {
        shortestMovePathToUpgrade = upgradePath;
        bestTargetUpgrade = upgradePos;
      }
    }
  }
  if (shortestMovePathToUpgrade) {
    const nextStep = shortestMovePathToUpgrade[1];
    console.log(
      `AI Decision: Moving towards fuel cell at ${bestTargetUpgrade.x},${bestTargetUpgrade.y}. Next step: ${nextStep.x},${nextStep.y}`
    );
    const endTime = performance.now();
    console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
    return { type: "move", target: nextStep };
  }
  console.log(
    "AI Decision: No winning shot or reachable fuel cells. Staying put."
  );
  const endTime = performance.now();
  console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
  return { type: "stay" };
}
function findShortestPath_SimpleBFS(
  startPos,
  targetPos,
  opponentBlockers = []
) {
  const q = [{ pos: startPos, path: [startPos] }];
  const visited = new Set([`${startPos.x},${startPos.y}`]);
  const blockerSet = new Set(opponentBlockers.map((p) => `${p.x},${p.y}`));
  while (q.length > 0) {
    const current = q.shift();
    const { pos, path } = current;
    if (pos.x === targetPos.x && pos.y === targetPos.y) return path;
    const neighbors = getValidMoves(pos, { x: -1, y: -1 });
    for (const neighbor of neighbors) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (
        !visited.has(key) &&
        !(
          blockerSet.has(key) &&
          (neighbor.x !== targetPos.x || neighbor.y !== targetPos.y)
        )
      ) {
        visited.add(key);
        q.push({ pos: neighbor, path: [...path, neighbor] });
      }
    }
  }
  return null;
}

// --- AI Trigger --- (Unchanged)
function triggerAiTurn() {
  setMessage("AI is thinking...");
  updatePhaseIndicator();
  disablePlanningControls();
  setTimeout(() => {
    if (gameOverState) return;
    const aiAction = findBestActionUCSBased();
    if (!aiAction) {
      console.error("AI failed to find ANY action (even 'stay')!");
      executeAction({ type: "stay" });
      return;
    }
    executeAction(aiAction);
  }, AI_THINK_DELAY);
}

// --- Action Execution and Turn Management ---
// --- MODIFIED executeAction (Uses new missile visual) ---
async function executeAction(action) {
  if (isResolving || gameOverState) return;
  console.log(`Executing ${currentPlayer}'s action:`, action);
  isResolving = true;
  disablePlanningControls();
  updatePhaseIndicator();
  let actionSuccess = true;
  let wasHit = false;
  let collectedPowerup = false;
  let messageLog = [];
  const activePlayer = currentPlayer;
  const activePlayerMesh = activePlayer === "player" ? playerMesh : aiMesh;
  const activePlayerPosRef = activePlayer === "player" ? playerPos : aiPos;
  const opponentPos = activePlayer === "player" ? aiPos : playerPos;
  // --- Select appropriate missile material ---
  const missileCoreMaterial =
    activePlayer === "player"
      ? playerMissileCoreMaterial
      : aiMissileCoreMaterial;

  if (action.type === "move") {
    setMessage(`${activePlayer.toUpperCase()} moves...`);
    if (
      action.target.x === opponentPos.x &&
      action.target.y === opponentPos.y
    ) {
      messageLog.push(
        `${activePlayer.toUpperCase()} move blocked by opponent!`
      );
      actionSuccess = false;
    } else {
      await animateMove(activePlayerMesh, action.target);
      activePlayerPosRef.x = action.target.x;
      activePlayerPosRef.y = action.target.y;
      messageLog.push(
        `${activePlayer.toUpperCase()} moved to ${action.target.x},${
          action.target.y
        }.`
      );
      const powerupIndex = powerUpPositions.findIndex(
        (p) => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y
      );
      if (powerupIndex !== -1) {
        if (activePlayer === "player") {
          playerFuel += FUEL_PER_UPGRADE;
          messageLog.push(`Player collected fuel cell! (Total: ${playerFuel})`);
        } else {
          aiFuel += FUEL_PER_UPGRADE;
          messageLog.push(`AI collected fuel cell! (Total: ${aiFuel})`);
        }
        collectedPowerup = true;
        removePowerup3D(activePlayerPosRef.x, activePlayerPosRef.y);
        updateFuelInfo();
      }
    }
    if (actionSuccess) await wait(ACTION_RESOLVE_DELAY / 2); // Shorter wait for move only
  } else if (action.type === "shoot") {
    setMessage(`${activePlayer.toUpperCase()} fires missile!`);
    const path = action._path;
    const cost = action._cost;
    let currentFuel = activePlayer === "player" ? playerFuel : aiFuel;

    if (path && path.length > 1 && cost <= currentFuel) {
      if (activePlayer === "player") playerFuel -= cost;
      else aiFuel -= cost;
      updateFuelInfo();

      // --- Use the NEW missile visual function ---
      const missilePromise = new Promise((resolve) => {
        createGuidedMissileVisual(path, missileCoreMaterial, resolve);
      });
      // --- END Use the NEW missile visual function ---

      messageLog.push(
        `${activePlayer.toUpperCase()} missile launched (Cost: ${cost}).`
      );
      const targetPos = path[path.length - 1];
      if (targetPos.x === opponentPos.x && targetPos.y === opponentPos.y) {
        wasHit = true; // Mark hit immediately for game logic
        messageLog.push(
          `${activePlayer === "player" ? "AI" : "Player"} was hit!`
        );
      } else {
        messageLog.push(`Missile impacted at ${targetPos.x},${targetPos.y}.`); // Hit the target floor tile
      }

      // Wait for the missile travel AND explosion to visually complete
      await missilePromise; // Wait for the onComplete callback from the visual
      await wait(EXPLOSION_DURATION / 2); // Add a small extra pause after explosion finishes visually
    } else {
      messageLog.push(
        `${activePlayer.toUpperCase()} missile fizzled! (Check fuel/path).`
      );
      actionSuccess = false;
      wasHit = false;
      await wait(ACTION_RESOLVE_DELAY); // Wait even if fizzled
    }
  } else if (action.type === "stay") {
    setMessage(`${activePlayer.toUpperCase()} stays put.`);
    messageLog.push(`${activePlayer.toUpperCase()} did not move.`);
    await wait(ACTION_RESOLVE_DELAY); // Standard wait for doing nothing
  }

  // Update message AFTER action animation is complete
  setMessage(messageLog.join(" "));

  // Check game end condition AFTER visual effects and message update
  if (wasHit) {
    endGame(`${activePlayer.toUpperCase()} Wins!`, activePlayer);
    return; // Stop further turn progression
  }

  // If game not over, proceed to next turn
  if (!gameOverState) {
    currentPlayer = activePlayer === "player" ? "ai" : "player";
    gamePhase = currentPlayer + "Turn";
    isResolving = false; // Allow next action

    // Short delay before AI thinks or player controls are enabled
    await wait(ACTION_RESOLVE_DELAY / 2);

    if (currentPlayer === "ai") {
      triggerAiTurn();
    } else {
      setMessage("Your Turn: Plan your action.");
      updatePhaseIndicator();
      enablePlanningControls();
      setPlanningMode("move"); // Default back to move planning
    }
  } else {
    isResolving = false; // Ensure resolving is false even if game ended during action
  }
}
// --- END MODIFIED executeAction ---

// --- Animate Move Function --- (Unchanged)
function animateMove(mesh, targetGridPos) {
  return new Promise((resolve) => {
    const startPos3D = mesh.position.clone();
    const targetY =
      mesh.userData.type === "player"
        ? (CELL_3D_SIZE * 0.9) / 2
        : (CELL_3D_SIZE * 1.0) / 2;
    const targetPos3D = get3DPosition(
      targetGridPos.x,
      targetGridPos.y,
      targetY
    );
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

// --- Utility Wait Function --- (Unchanged)
function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

// --- Powerup Logic Functions --- (Unchanged)
function spawnInitialPowerups() {
  console.log("Spawning initial fuel cells (Weighted Random Sampling)...");
  powerUpPositions = [];
  powerupMeshes.forEach((p) => disposeMesh(p.mesh));
  powerupMeshes = [];
  let availableCells = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (
        grid[y][x] === "floor" &&
        !(x === playerPos.x && y === playerPos.y) &&
        !(x === aiPos.x && y === aiPos.y)
      ) {
        availableCells.push({ x, y });
      }
    }
  }
  if (availableCells.length < INITIAL_POWERUP_COUNT) {
    console.warn(
      `Not enough available cells (${availableCells.length}) to spawn ${INITIAL_POWERUP_COUNT} fuel cells. Spawning all available.`
    );
    availableCells.forEach((cell) => {
      powerUpPositions.push({ x: cell.x, y: cell.y });
      const newPowerup = createPowerup3D(cell.x, cell.y);
      if (newPowerup) powerupMeshes.push(newPowerup);
      console.log(
        `Spawned fuel cell at ${cell.x},${cell.y} (fallback due to low cell count)`
      );
    });
    return;
  }
  let weightedCells = availableCells
    .map((cell) => {
      const distPlayer = Math.max(1, distance(cell, playerPos));
      const distAi = Math.max(1, distance(cell, aiPos));
      const ratio = distAi / distPlayer;
      const diff = Math.abs(ratio - AI_DISTANCE_BIAS);
      const weight = 0.01 + 1 / (1 + diff * diff * 10);
      return { cell, weight, ratio, distPlayer, distAi };
    })
    .filter((wc) => wc.weight > 0);
  let totalWeight = weightedCells.reduce((sum, wc) => sum + wc.weight, 0);
  let spawnedCount = 0;
  const maxSpawnAttempts = availableCells.length * 3;
  let attempts = 0;
  while (
    spawnedCount < INITIAL_POWERUP_COUNT &&
    weightedCells.length > 0 &&
    attempts < maxSpawnAttempts
  ) {
    attempts++;
    if (totalWeight <= 0) {
      console.warn(
        "Total weight is zero or negative, cannot perform weighted sampling. Attempt:",
        attempts
      );
      break;
    }
    let randomVal = Math.random() * totalWeight;
    let chosenIndex = -1;
    for (let i = 0; i < weightedCells.length; i++) {
      randomVal -= weightedCells[i].weight;
      if (randomVal <= 0) {
        chosenIndex = i;
        break;
      }
    }
    if (chosenIndex === -1 && weightedCells.length > 0) {
      console.warn(
        "Weighted sampling fallback triggered (chosenIndex = -1). Selecting last element. Attempt:",
        attempts
      );
      chosenIndex = weightedCells.length - 1;
    }
    if (chosenIndex !== -1 && chosenIndex < weightedCells.length) {
      const chosenWeightedCell = weightedCells[chosenIndex];
      const { cell, ratio, distPlayer, distAi } = chosenWeightedCell;
      powerUpPositions.push({ x: cell.x, y: cell.y });
      const newPowerup = createPowerup3D(cell.x, cell.y);
      if (newPowerup) powerupMeshes.push(newPowerup);
      console.log(
        `Spawned fuel cell at ${cell.x},${cell.y} (Ratio: ${ratio.toFixed(
          2
        )}, PDist: ${distPlayer}, ADist: ${distAi}, Weight: ${chosenWeightedCell.weight.toFixed(
          3
        )})`
      );
      spawnedCount++;
      totalWeight -= chosenWeightedCell.weight;
      weightedCells.splice(chosenIndex, 1);
    } else {
      console.error(
        `Error during weighted sampling: Invalid chosenIndex (${chosenIndex}) or weightedCells issue. Attempt:`,
        attempts,
        "TotalWeight:",
        totalWeight,
        "weightedCells.length:",
        weightedCells.length
      );
      break;
    }
  }
  if (spawnedCount < INITIAL_POWERUP_COUNT) {
    console.warn(
      `Could only spawn ${spawnedCount} out of ${INITIAL_POWERUP_COUNT} initial fuel cells after ${attempts} attempts.`
    );
  } else {
    console.log(`Successfully spawned ${spawnedCount} initial fuel cells.`);
  }
}

// --- Game Over Function --- (Unchanged)
function endGame(message, winner) {
  console.log("Game Over:", message);
  gamePhase = "gameOver";
  gameOverState = { winner: winner, message: message };
  setMessage(message);
  updatePhaseIndicator();
  disablePlanningControls();
  isResolving = false;
}

// --- Utility Functions ---
// ... (isValid, isWall, getValidMoves, distance, findNearestPowerup - unchanged)
function isValid(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}
function isWall(x, y) {
  return isValid(x, y) && grid[y][x] === "wall";
}
function getValidMoves(unitPos, opponentPosToBlock) {
  const moves = [];
  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];
  directions.forEach((dir) => {
    const nextX = unitPos.x + dir.dx;
    const nextY = unitPos.y + dir.dy;
    if (
      isValid(nextX, nextY) &&
      grid[nextY][nextX] === "floor" &&
      !(nextX === opponentPosToBlock?.x && nextY === opponentPosToBlock?.y)
    ) {
      moves.push({ x: nextX, y: nextY });
    }
  });
  return moves;
}
function distance(pos1, pos2) {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}
function findNearestPowerup(pos, powerupList = powerUpPositions) {
  let minDist = Infinity;
  let nearest = null;
  powerupList.forEach((p) => {
    const d = distance(pos, p);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  });
  return nearest;
}

// --- Start Game ---
init();
