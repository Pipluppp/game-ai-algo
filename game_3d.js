import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 2;
const WALL_DENSITY = 0.25;

let scene, camera, renderer, controls;
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let playerMesh, aiMesh;

const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0x00dd00 });
const aiMaterial = new THREE.MeshBasicMaterial({ color: 0xdd0000 });

let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };

function init() {
  console.log("Initializing Minimal 3D Board Display...");
  initThreeJS();
  initBoardAndPlayers();
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

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = false;

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = CELL_3D_SIZE * 3;
  controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.2;

  gameBoardGroup = new THREE.Group();
  scene.add(gameBoardGroup);

  window.addEventListener("resize", onWindowResize, false);
  onWindowResize();
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
  generateGrid();
  createBoard3D();

  const startPositions = findStartPositions();
  if (!startPositions) {
    console.error("Failed to find start positions!");
    return;
  }
  playerPos = startPositions.player;
  aiPos = startPositions.ai;

  createUnits3D();

  controls.target.set(0, 0, 0);
  controls.update();
  console.log("Board and players generated.");
}

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
    if (isGridConnected()) {
      return;
    }
    attempts++;
    console.warn(`Grid gen attempt ${attempts} failed connectivity.`);
  }
  console.error("Failed to generate connected grid.");
}
function isGridConnected() {
    const startNode = findFirstFloorOrDampener();
    if (!startNode) return false;
    const q = [startNode];
    const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0;
    let totalFloorCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === "floor" || grid[y][x] === "dampener") totalFloorCount++;
        }
    }
    if (totalFloorCount === 0) return false;
    while (q.length > 0) {
        const { x, y } = q.shift();
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
                (grid[n.y][n.x] === "floor" || grid[n.y][n.x] === "dampener") &&
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
    const playerStart = findNearestFloorBFS(potentialStarts[0]);

    let aiStart = null;
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]];
    farCorners.sort(() => Math.random() - 0.5);

    for (const corner of farCorners) {
      const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
      if (potentialAiStart && playerStart &&
          distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) {
        aiStart = potentialAiStart;
        break;
      }
    }

    if (!aiStart && playerStart) {
        aiStart = findNearestFloorBFS({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, [playerStart]);
    }

    if (playerStart && aiStart && (playerStart.x !== aiStart.x || playerStart.y !== aiStart.y)) {
      return { player: playerStart, ai: aiStart };
    }

    console.error("Could not find two distinct start positions.");
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

    return null;
}
function findNearestFloorBFS(startSearchPos, occupied = []) {
    const q = [{ pos: startSearchPos, dist: 0 }];
    const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]);
    const occupiedSet = new Set(occupied.map(occ => `${occ.x},${occ.y}`));

    while (q.length > 0) {
        const current = q.shift();
        const { x, y } = current.pos;
        const currentKey = `${x},${y}`;

        if (isValid(x, y) && (grid[y][x] === 'floor' || grid[y][x] === 'dampener') && !occupiedSet.has(currentKey)) {
            return { x, y };
        }

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 },
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && !visited.has(key)) {
                visited.add(key);
                q.push({ pos: n, dist: current.dist + 1 });
            }
        }
    }
    return null;
}

function get3DPosition(x, y, yOffset = 0) {
  const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
  const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
  return new THREE.Vector3(worldX, yOffset, worldZ);
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
   if (mesh.isGroup) {
       mesh.children.slice().forEach(child => disposeMesh(child));
   }
}

function clearBoard3D() {
  gameBoardGroup.children.slice().forEach(child => disposeMesh(child));
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

            if (cellType === "floor" || cellType === "dampener") {
                mesh = new THREE.Mesh(floorGeom, floorMaterial);
                mesh.position.copy(pos);
                mesh.position.y = -0.1;
                mesh.userData = { gridX: x, gridY: y, type: "floor" };
                gameBoardGroup.add(mesh);
                floorMeshes[y][x] = mesh;
            } else if (cellType === "wall") {
                mesh = new THREE.Mesh(wallGeom, wallMaterial);
                mesh.position.copy(pos);
                mesh.position.y = WALL_HEIGHT / 2 - 0.1;
                mesh.userData = { gridX: x, gridY: y, type: "wall" };
                gameBoardGroup.add(mesh);
                wallMeshes.push(mesh);
                floorMeshes[y][x] = null;
            }
        }
    }
}

function createUnits3D() {
    if (playerMesh) disposeMesh(playerMesh);
    if (aiMesh) disposeMesh(aiMesh);

    const playerSize = CELL_3D_SIZE * 0.6;
    const playerGeom = new THREE.BoxGeometry(playerSize, playerSize, playerSize);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerSize / 2);
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: "player" };
    gameBoardGroup.add(playerMesh);

    const aiSize = CELL_3D_SIZE * 0.6;
    const aiGeom = new THREE.BoxGeometry(aiSize, aiSize, aiSize);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiSize / 2);
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: "ai" };
    gameBoardGroup.add(aiMesh);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function isValid(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}
function isWall(x, y) {
  return isValid(x, y) && grid[y][x] === "wall";
}
function distance(pos1, pos2) {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

init();