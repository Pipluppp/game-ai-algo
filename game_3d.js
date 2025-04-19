import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from "@tweenjs/tween.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// --- DOM Elements --- (Unchanged)
const canvasContainer = document.getElementById("gameCanvasContainer");
const canvas = document.getElementById("threeCanvas");
const btnPlanMove = document.getElementById("btnPlanMove");
const btnPlanShoot = document.getElementById("btnPlanShoot");
const btnReset = document.getElementById("btnReset");
const phaseIndicator = document.getElementById("phaseIndicator");
const messageArea = document.getElementById("messageArea");
const weaponLevelInfo = document.getElementById("weaponLevelInfo");
const aiWeaponLevelInfo = document.getElementById("aiWeaponLevelInfo");

// --- Game Constants --- (Unchanged)
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 1.5;
const WALL_DENSITY = 0.28;
const MAX_WEAPON_LEVEL = 5;
const INITIAL_POWERUP_COUNT = 8;
const AI_DISTANCE_BIAS = 0.95;

// Timing Constants (Unchanged)
const SHOT_FLASH_DURATION = 600;
const MOVEMENT_DURATION = 400;
const AI_THINK_DELAY = 50;
const ACTION_RESOLVE_DELAY = 200;

// AI constants (Unchanged)
const AI_MAX_SEGMENT_EVAL_POINTS = GRID_SIZE;

// --- Three.js Setup --- (Unchanged)
let scene, camera, renderer, controls, composer;
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = [];
let playerMesh, aiMesh;
let playerLevelIndicator, aiLevelIndicator;
let activeHighlights = [];
let activeLasers = [];

// Materials (Unchanged)
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9, metalness: 0.2, receiveShadow: true, flatShading: true });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.7, metalness: 0.3, emissive: 0x101010, emissiveIntensity: 0.1, flatShading: true, castShadow: true, receiveShadow: true });
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, roughness: 0.4, metalness: 0.5, emissive: 0x003a7f, emissiveIntensity: 0.5, castShadow: true });
const aiMaterial = new THREE.MeshStandardMaterial({ color: 0xdc3545, roughness: 0.4, metalness: 0.5, emissive: 0x6b1a22, emissiveIntensity: 0.5, castShadow: true });
const powerupMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0xffc107, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.8, castShadow: true });
const moveHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, emissive: 0x00ff00, emissiveIntensity: 0.2 });
const pathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.5, emissive: 0xffa500, emissiveIntensity: 0.3 });
const invalidPathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, emissive: 0x444444, emissiveIntensity: 0.1 });
const hitHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, emissive: 0xff0000, emissiveIntensity: 0.5 });
const playerLaserMaterial = new THREE.MeshStandardMaterial({ color: 0x00bfff, emissive: 0x00bfff, emissiveIntensity: 5.0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
const aiLaserMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xff6a6a, emissiveIntensity: 5.0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });

// Raycasting (Unchanged)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State --- (Unchanged)
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerWeaponLevel = 1;
let aiWeaponLevel = 1;
let powerUpPositions = [];
let gamePhase = "playerTurn";
let currentPlayer = "player";
let currentPlanningMode = "move";
let hoverPos = null;
let hoverPath = [];
let hoverPathIsValid = false;
let partialShootPlan = null;
let gameOverState = null;
let isResolving = false;

// --- Initialization --- (Unchanged)
function init() { console.log("Initializing 3D Game..."); initThreeJS(); initGameLogic(); setupInputListeners(); animate(); console.log("Game Initialized."); }
function initThreeJS() { /* ... Scene, Camera, Renderer, Lights, Controls, Composer ... */ scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f1113); const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight; camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100); camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 0.8, GRID_SIZE * CELL_3D_SIZE * 0.7); camera.lookAt(0, 0, 0); renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight); renderer.setPixelRatio(window.devicePixelRatio); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); directionalLight.position.set(GRID_SIZE * CELL_3D_SIZE * 0.6, GRID_SIZE * CELL_3D_SIZE * 1.2, GRID_SIZE * CELL_3D_SIZE * 0.5); directionalLight.castShadow = true; directionalLight.shadow.mapSize.width = 2048; directionalLight.shadow.mapSize.height = 2048; directionalLight.shadow.camera.near = 0.5; directionalLight.shadow.camera.far = GRID_SIZE * CELL_3D_SIZE * 2.5; const shadowCamSize = GRID_SIZE * CELL_3D_SIZE * 0.7; directionalLight.shadow.camera.left = -shadowCamSize; directionalLight.shadow.camera.right = shadowCamSize; directionalLight.shadow.camera.top = shadowCamSize; directionalLight.shadow.camera.bottom = -shadowCamSize; scene.add(directionalLight); const ambientLight = new THREE.AmbientLight(0x808080, 0.6); scene.add(ambientLight); const hemisphereLight = new THREE.HemisphereLight(0x4488bb, 0x080820, 0.5); scene.add(hemisphereLight); composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); const bloomPass = new UnrealBloomPass(new THREE.Vector2(canvasContainer.clientWidth, canvasContainer.clientHeight), 1.0, 0.4, 0.85); composer.addPass(bloomPass); controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.1; controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI / 2 - 0.05; controls.minDistance = CELL_3D_SIZE * 3; controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.5; gameBoardGroup = new THREE.Group(); scene.add(gameBoardGroup); const planeSize = GRID_SIZE * CELL_3D_SIZE; const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize); const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, }); intersectionPlane = new THREE.Mesh(planeGeom, planeMat); intersectionPlane.rotation.x = -Math.PI / 2; intersectionPlane.position.y = -0.04; scene.add(intersectionPlane); window.addEventListener("resize", onWindowResize, false); onWindowResize(); }
function onWindowResize() { const width = canvasContainer.clientWidth; const height = canvasContainer.clientHeight; if (width === 0 || height === 0) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); composer.setSize(width, height); }
function initGameLogic() { clearBoard3D(); generateGrid(); createBoard3D(); const startPositions = findStartPositions(); if (!startPositions) { console.error("Failed to find valid start positions!"); setMessage("Error: Could not place players. Please reset."); disablePlanningControls(); gameOverState = { winner: "None", message: "Initialization Failed" }; updatePhaseIndicator(); return; } playerPos = startPositions.player; aiPos = startPositions.ai; playerWeaponLevel = 1; aiWeaponLevel = 1; powerUpPositions = []; powerupMeshes = []; currentPlayer = "player"; gamePhase = "playerTurn"; currentPlanningMode = "move"; hoverPos = null; hoverPath = []; hoverPathIsValid = false; partialShootPlan = null; gameOverState = null; isResolving = false; createUnits3D(); spawnInitialPowerups(); setMessage("Your Turn: Plan your move or shot."); updatePhaseIndicator(); updateWeaponLevelInfo(); enablePlanningControls(); clearHighlights(); controls.target.set(0, 0, 0); controls.update(); setPlanningMode("move"); }
function setupInputListeners() { btnPlanMove.addEventListener("click", () => setPlanningMode("move")); btnPlanShoot.addEventListener("click", () => setPlanningMode("shoot")); btnReset.addEventListener("click", initGameLogic); canvasContainer.addEventListener("click", handleCanvasClick); canvasContainer.addEventListener("mousemove", handleCanvasMouseMove); }

// --- Grid Generation Functions --- (Unchanged)
function generateGrid() { /* ... */ let attempts = 0; while (attempts < 10) { grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor")); let wallCount = 0; const totalCells = GRID_SIZE * GRID_SIZE; const targetWallCount = Math.floor(totalCells * WALL_DENSITY); while (wallCount < targetWallCount) { const x = Math.floor(Math.random() * GRID_SIZE); const y = Math.floor(Math.random() * GRID_SIZE); const isNearCorner = (px, py) => (px >= 0 && px <= 4 && py >= 0 && py <= 4) || (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) || (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) || (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4); if (grid[y][x] === "floor" && !isNearCorner(x, y) && Math.random() < 0.9) { grid[y][x] = "wall"; wallCount++; } else if (grid[y][x] === 'floor' && Math.random() < 0.2) { grid[y][x] = "wall"; wallCount++; } } if (isGridConnected()) { console.log("Generated connected grid."); return; } attempts++; console.warn(`Generated grid attempt ${attempts} was not connected or valid. Retrying...`); } console.error("Failed to generate a valid connected grid after multiple attempts."); grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor")); for (let i = 0; i < GRID_SIZE * GRID_SIZE * 0.1; i++) { const x = Math.floor(Math.random() * GRID_SIZE); const y = Math.floor(Math.random() * GRID_SIZE); if (grid[y][x] === 'floor') grid[y][x] = 'wall'; } setMessage("Warning: Grid generation failed, using fallback."); }
function isGridConnected() { /* ... */ const startNode = findFirstFloor(); if (!startNode) return false; const q = [startNode]; const visited = new Set([`${startNode.x},${startNode.y}`]); let reachableFloorCount = 0; let totalFloorCount = 0; for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor') totalFloorCount++; } } if (totalFloorCount === 0) return false; while (q.length > 0) { const { x, y } = q.shift(); reachableFloorCount++; const neighbors = [{ x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 },]; for (const n of neighbors) { const key = `${n.x},${n.y}`; if (isValid(n.x, n.y) && grid[n.y][n.x] === 'floor' && !visited.has(key)) { visited.add(key); q.push(n); } } } return reachableFloorCount === totalFloorCount; }
function findFirstFloor() { /* ... */ for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor') return { x, y }; } } return null; }
function findStartPositions() { /* ... */ const potentialStarts = [{ x: 2, y: 2 }, { x: GRID_SIZE - 3, y: GRID_SIZE - 3 }, { x: 2, y: GRID_SIZE - 3 }, { x: GRID_SIZE - 3, y: 2 },]; const playerStart = findNearestFloorBFS(potentialStarts[0]); let aiStart = null; const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3],]; farCorners.sort(() => Math.random() - 0.5); for (const corner of farCorners) { const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []); if (potentialAiStart && playerStart && distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) { aiStart = potentialAiStart; break; } } if (!aiStart && playerStart) { console.warn("Could not find a far start position for AI, trying any reachable floor."); aiStart = findNearestFloorBFS({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, [playerStart]); } if (playerStart && aiStart) { console.log(`Player start: ${playerStart.x},${playerStart.y}. AI start: ${aiStart.x},${aiStart.y}`); return { player: playerStart, ai: aiStart }; } console.error("Failed to find suitable start positions even with fallbacks."); return null; }
function findNearestFloorBFS(startSearchPos, occupied = []) { /* ... */ const q = [{ pos: startSearchPos, dist: 0 }]; const visited = new Set([`${startSearchPos.x},${startSearchPos.y}`]); occupied.forEach(occ => visited.add(`${occ.x},${occ.y}`)); while (q.length > 0) { const current = q.shift(); const { x, y } = current.pos; if (isValid(x, y) && grid[y][x] === 'floor' && !occupied.some(occ => occ.x === x && occ.y === y)) { return { x, y }; } const neighbors = [{ x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 },]; for (const n of neighbors) { const key = `${n.x},${n.y}`; if (isValid(n.x, n.y) && !visited.has(key)) { visited.add(key); q.push({ pos: n, dist: current.dist + 1 }); } } } console.warn(`BFS from ${startSearchPos.x},${startSearchPos.y} found no valid floor.`); return null; }

// --- 3D Object Creation / Management Functions --- (Unchanged)
function get3DPosition(x, y, yOffset = 0) { /* ... */ const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE; const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE; return new THREE.Vector3(worldX, yOffset, worldZ); }
function getGridCoords(position) { /* ... */ const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01); const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01); return { x, y }; }
function disposeMesh(mesh) { /* ... */ if (!mesh) return; if (mesh.geometry) mesh.geometry.dispose(); if (mesh.material) { if (Array.isArray(mesh.material)) { mesh.material.forEach(mat => mat.dispose()); } else { mesh.material.dispose(); } } if (mesh.parent) { mesh.parent.remove(mesh); } }
function disposeSprite(sprite) { /* ... */ if (!sprite) return; if (sprite.material?.map) sprite.material.map.dispose(); if (sprite.material) sprite.material.dispose(); if (sprite.parent) { sprite.parent.remove(sprite); } }
function clearBoard3D() { /* ... */ gameBoardGroup.children.slice().forEach(child => { if (child.isMesh) { disposeMesh(child); } else if (child.isSprite) { disposeSprite(child); } }); disposeSprite(playerLevelIndicator); disposeSprite(aiLevelIndicator); playerLevelIndicator = null; aiLevelIndicator = null; floorMeshes = []; wallMeshes = []; powerupMeshes = []; playerMesh = null; aiMesh = null; activeHighlights.forEach(disposeMesh); activeHighlights = []; activeLasers.forEach(disposeMesh); activeLasers = []; }
function createBoard3D() { /* ... */ floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)); wallMeshes = []; const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE); const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE); for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { const pos = get3DPosition(x, y); if (grid[y][x] === 'floor') { const floorMesh = new THREE.Mesh(floorGeom, floorMaterial); floorMesh.position.copy(pos); floorMesh.position.y = -0.1; floorMesh.castShadow = false; floorMesh.receiveShadow = true; floorMesh.userData = { gridX: x, gridY: y, type: 'floor' }; gameBoardGroup.add(floorMesh); floorMeshes[y][x] = floorMesh; } else if (grid[y][x] === 'wall') { const wallMesh = new THREE.Mesh(wallGeom, wallMaterial); wallMesh.position.copy(pos); wallMesh.position.y = WALL_HEIGHT / 2; wallMesh.castShadow = true; wallMesh.receiveShadow = true; wallMesh.userData = { gridX: x, gridY: y, type: 'wall' }; gameBoardGroup.add(wallMesh); wallMeshes.push(wallMesh); floorMeshes[y][x] = null; } } } }
function createUnits3D() { /* ... */ const playerUnitHeight = CELL_3D_SIZE * 0.9; const playerUnitRadius = CELL_3D_SIZE * 0.3; const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - (playerUnitRadius * 2), 4, 10); playerMesh = new THREE.Mesh(playerGeom, playerMaterial); playerMesh.castShadow = true; playerMesh.receiveShadow = false; const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2); playerMesh.position.copy(playerPos3D); playerMesh.userData = { type: 'player' }; gameBoardGroup.add(playerMesh); playerLevelIndicator = createLevelTextMesh(playerWeaponLevel); playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0); playerMesh.add(playerLevelIndicator); const aiUnitHeight = CELL_3D_SIZE * 1.0; const aiUnitRadius = CELL_3D_SIZE * 0.4; const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8); aiMesh = new THREE.Mesh(aiGeom, aiMaterial); aiMesh.castShadow = true; aiMesh.receiveShadow = false; const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2); aiMesh.position.copy(aiPos3D); aiMesh.userData = { type: 'ai' }; gameBoardGroup.add(aiMesh); aiLevelIndicator = createLevelTextMesh(aiWeaponLevel); aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0); aiMesh.add(aiLevelIndicator); updateWeaponLevelVisuals(); }
function createLevelTextMesh(level) { /* ... */ const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); const size = 128; const halfSize = size / 2; canvas.width = size; canvas.height = size; context.fillStyle = 'rgba(0, 0, 0, 0.7)'; context.beginPath(); context.roundRect(0, 0, size, size, size * 0.15); context.fill(); context.font = `Bold ${size * 0.6}px Arial`; context.fillStyle = 'white'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(level.toString(), halfSize, halfSize + size * 0.02); const texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true; texture.colorSpace = THREE.SRGBColorSpace; const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false, }); const sprite = new THREE.Sprite(spriteMaterial); sprite.scale.set(0.1, 0.1, 1); return sprite; }
function updateWeaponLevelVisuals() { /* ... */ if (playerMesh && playerLevelIndicator) { playerMesh.remove(playerLevelIndicator); disposeSprite(playerLevelIndicator); playerLevelIndicator = createLevelTextMesh(playerWeaponLevel); const playerUnitHeight = CELL_3D_SIZE * 0.9; playerLevelIndicator.position.set(0, playerUnitHeight * 0.6, 0); playerMesh.add(playerLevelIndicator); playerMesh.material.emissiveIntensity = 0.5 + (playerWeaponLevel - 1) * 0.3; } if (aiMesh && aiLevelIndicator) { aiMesh.remove(aiLevelIndicator); disposeSprite(aiLevelIndicator); aiLevelIndicator = createLevelTextMesh(aiWeaponLevel); const aiUnitHeight = CELL_3D_SIZE * 1.0; aiLevelIndicator.position.set(0, aiUnitHeight * 0.6, 0); aiMesh.add(aiLevelIndicator); aiMesh.material.emissiveIntensity = 0.5 + (aiWeaponLevel - 1) * 0.3; } }
function createPowerup3D(x, y) { /* ... */ const powerupSize = CELL_3D_SIZE * 0.3; const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0); const mesh = new THREE.Mesh(powerupGeom, powerupMaterial); mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7)); mesh.castShadow = true; mesh.userData = { type: 'powerup', gridX: x, gridY: y, spinSpeed: Math.random() * 0.03 + 0.015 }; gameBoardGroup.add(mesh); return { mesh: mesh, pos: { x, y } }; }
function removePowerup3D(x, y) { /* ... */ const meshIndex = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y); if (meshIndex !== -1) { const powerupObj = powerupMeshes[meshIndex]; disposeMesh(powerupObj.mesh); powerupMeshes.splice(meshIndex, 1); } else { console.warn(`Could not find powerup mesh at ${x},${y} to remove.`); } const logicalIndex = powerUpPositions.findIndex(p => p.x === x && p.y === y); if (logicalIndex !== -1) { powerUpPositions.splice(logicalIndex, 1); } }

// --- Highlighting Functions --- (Unchanged)
function clearHighlights() { /* ... */ activeHighlights.forEach(mesh => { disposeMesh(mesh); }); activeHighlights = []; for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' && !floorMeshes[y]?.[x]) { const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE); const floorMesh = new THREE.Mesh(floorGeom, floorMaterial); floorMesh.position.copy(get3DPosition(x, y)); floorMesh.position.y = -0.1; floorMesh.castShadow = false; floorMesh.receiveShadow = true; floorMesh.userData = { gridX: x, gridY: y, type: 'floor' }; gameBoardGroup.add(floorMesh); floorMeshes[y][x] = floorMesh; } } } }
function highlightCell(x, y, highlightMaterial) { /* ... */ if (isValid(x, y) && grid[y][x] === 'floor') { const existingMesh = floorMeshes[y]?.[x]; if (existingMesh) { disposeMesh(existingMesh); floorMeshes[y][x] = null; } const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE); const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone()); highlightMesh.position.copy(get3DPosition(x, y)); highlightMesh.position.y = -0.08; highlightMesh.userData = { gridX: x, gridY: y, type: 'highlight' }; gameBoardGroup.add(highlightMesh); activeHighlights.push(highlightMesh); } }
function renderHighlights() { /* ... */ if (currentPlayer !== 'player' || isResolving || gameOverState) { if (activeHighlights.length > 0) clearHighlights(); return; } clearHighlights(); const opponentTargetPos = aiPos; if (currentPlanningMode === 'move') { const validMoves = getValidMoves(playerPos, aiPos); validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial)); } else if (currentPlanningMode === 'shoot') { let pathToShow = []; let useMaterial = pathHighlightMaterial; let hitOpponent = false; if (partialShootPlan?.needsInput && hoverPath.length > 0) { pathToShow = hoverPath; if (!hoverPathIsValid) useMaterial = invalidPathHighlightMaterial; } else if (partialShootPlan?.path?.length > 0 && !partialShootPlan.needsInput) { pathToShow = partialShootPlan.path; useMaterial = pathHighlightMaterial; } pathToShow.forEach(p => { highlightCell(p.x, p.y, useMaterial); if (p.x === opponentTargetPos.x && p.y === opponentTargetPos.y && useMaterial !== invalidPathHighlightMaterial) { hitOpponent = true; } }); if (hitOpponent) { highlightCell(opponentTargetPos.x, opponentTargetPos.y, hitHighlightMaterial); } } }

// --- Laser Effect Function --- (Unchanged)
function createLaserBeam(path, material) { /* ... */ if (!path || path.length < 1) return null; const adjustedPath = []; const startUnit = material === playerLaserMaterial ? playerMesh : aiMesh; const endUnit = material === playerLaserMaterial ? aiMesh : playerMesh; const startOffset = startUnit.position.y; const endOffset = endUnit.position.y; const firstPoint3D = get3DPosition(path[0].x, path[0].y, startOffset); adjustedPath.push(firstPoint3D); for (let i = 1; i < path.length; i++) { adjustedPath.push(get3DPosition(path[i].x, path[i].y, startOffset)); } const lastPoint = path[path.length - 1]; const targetUnitPos = material === playerLaserMaterial ? aiPos : playerPos; const targetUnit3D = get3DPosition(targetUnitPos.x, targetUnitPos.y, endOffset); if (lastPoint.x === targetUnitPos.x && lastPoint.y === targetUnitPos.y) { const lastPathPoint3D = adjustedPath[adjustedPath.length - 1]; const dirToTarget = targetUnit3D.clone().sub(lastPathPoint3D).normalize().multiplyScalar(CELL_3D_SIZE * 0.3); adjustedPath.push(lastPathPoint3D.clone().add(dirToTarget)); } if (adjustedPath.length < 2) return null; const curve = new THREE.CatmullRomCurve3(adjustedPath, false, 'catmullrom', 0.1); const tubeRadius = CELL_3D_SIZE * 0.08; const tubeSegments = Math.max(8, path.length * 4); const radialSegments = 8; const tubeGeom = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, radialSegments, false); const laserMesh = new THREE.Mesh(tubeGeom, material.clone()); laserMesh.userData = { type: 'laser' }; laserMesh.castShadow = false; laserMesh.receiveShadow = false; scene.add(laserMesh); activeLasers.push(laserMesh); new TWEEN.Tween({ opacity: laserMesh.material.opacity }).to({ opacity: 0 }, SHOT_FLASH_DURATION).easing(TWEEN.Easing.Quadratic.In).onUpdate((obj) => { if (laserMesh.material) laserMesh.material.opacity = obj.opacity; }).onComplete(() => { disposeMesh(laserMesh); const index = activeLasers.indexOf(laserMesh); if (index > -1) activeLasers.splice(index, 1); }).start(); return laserMesh; }

// --- Animation Loop --- (Unchanged)
function animate(time) { /* ... */ requestAnimationFrame(animate); TWEEN.update(time); controls.update(); powerupMeshes.forEach(p => { if (p.mesh) { p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.015; p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5; } }); composer.render(); }

// --- Input Handling Functions --- (Unchanged)
function handleCanvasMouseMove(event) { /* ... */ if (currentPlayer !== 'player' || isResolving || gameOverState || currentPlanningMode !== 'shoot' || !partialShootPlan?.needsInput) { if (hoverPath.length > 0 || !hoverPathIsValid) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } return; } updateMouseCoords(event); raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObject(intersectionPlane); if (intersects.length > 0) { const targetGridPos = getGridCoords(intersects[0].point); if (isValid(targetGridPos.x, targetGridPos.y)) { if (!hoverPos || hoverPos.x !== targetGridPos.x || hoverPos.y !== targetGridPos.y) { hoverPos = { ...targetGridPos }; const startPos = partialShootPlan.lastBendPos; const segmentResult = calculateShotPathSegment(startPos, hoverPos, aiPos); if (segmentResult.isValidSegment) { hoverPath = [...partialShootPlan.path, ...segmentResult.path]; hoverPathIsValid = true; } else { hoverPath = [...partialShootPlan.path, hoverPos]; hoverPathIsValid = false; } renderHighlights(); } } else { if (hoverPos !== null) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } } } else { if (hoverPos !== null) { hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } } }
function handleCanvasClick(event) { /* ... */ if (currentPlayer !== 'player' || isResolving || gameOverState) return; updateMouseCoords(event); raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObject(intersectionPlane); if (intersects.length > 0) { const { x, y } = getGridCoords(intersects[0].point); if (isValid(x, y) && grid[y][x] === 'floor') { if (currentPlanningMode === 'move') { handleMoveInput(x, y); } else if (currentPlanningMode === 'shoot') { handleShootInput(x, y); } } else { setMessage("Invalid click: Must click on a floor tile."); } } else { setMessage("Invalid click: Must click within the grid area."); } }
function updateMouseCoords(event) { /* ... */ const rect = canvasContainer.getBoundingClientRect(); mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; }

// --- UI Update Functions --- (Unchanged)
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() { /* ... */ let phaseText = "Unknown"; if (gameOverState) { phaseText = `Game Over! ${gameOverState.message}`; } else if (isResolving) { phaseText = `Executing ${currentPlayer}'s Action...`; } else if (currentPlayer === 'player') { phaseText = "Your Turn"; } else if (currentPlayer === 'ai') { phaseText = "AI Turn"; } phaseIndicator.textContent = phaseText; }
function updateWeaponLevelInfo() { weaponLevelInfo.textContent = `Your Weapon Level: ${playerWeaponLevel}`; aiWeaponLevelInfo.textContent = `AI Weapon Level: ${aiWeaponLevel}`; updateWeaponLevelVisuals(); }
function enablePlanningControls() { if (gameOverState || isResolving || currentPlayer !== 'player') return; btnPlanMove.disabled = false; btnPlanShoot.disabled = false; renderHighlights(); }
function disablePlanningControls() { btnPlanMove.disabled = true; btnPlanShoot.disabled = true; hoverPos = null; hoverPath = []; hoverPathIsValid = false; partialShootPlan = null; clearHighlights(); }

// --- Planning Phase Logic Functions (Player Only) --- (Unchanged)
function setPlanningMode(mode) { /* ... */ if (currentPlayer !== 'player' || isResolving || gameOverState) return; console.log("Setting planning mode:", mode); currentPlanningMode = mode; partialShootPlan = null; hoverPos = null; hoverPath = []; hoverPathIsValid = false; btnPlanMove.classList.toggle("active", mode === 'move'); btnPlanShoot.classList.toggle("active", mode === 'shoot'); if (mode === 'move') { setMessage("Your Turn: Click an adjacent floor cell to move."); } else if (mode === 'shoot') { partialShootPlan = { needsInput: true, maxBends: playerWeaponLevel - 1, segments: [], path: [], lastBendPos: playerPos, }; setMessage(`Your Turn (Shoot Lv ${playerWeaponLevel}): Click target cell for segment 1 (Max Bends: ${partialShootPlan.maxBends}).`); } renderHighlights(); }
function handleMoveInput(targetX, targetY) { /* ... */ if (currentPlayer !== 'player' || currentPlanningMode !== 'move' || isResolving || gameOverState) return; const validMoves = getValidMoves(playerPos, aiPos); const isValidTarget = validMoves.some(move => move.x === targetX && move.y === targetY); if (isValidTarget) { const action = { type: 'move', target: { x: targetX, y: targetY } }; executeAction(action); } else { setMessage("Invalid move target. Click a highlighted adjacent square."); } }
function handleShootInput(clickX, clickY) { /* ... */ if (currentPlayer !== 'player' || currentPlanningMode !== 'shoot' || !partialShootPlan || !partialShootPlan.needsInput || isResolving || gameOverState) { return; } const targetPos = { x: clickX, y: clickY }; const startPos = partialShootPlan.lastBendPos; if (targetPos.x === startPos.x && targetPos.y === startPos.y) { setMessage("Cannot target the starting cell for a segment."); return; } const segmentResult = calculateShotPathSegment(startPos, targetPos, aiPos); if (!segmentResult.isValidSegment) { setMessage("Invalid target: Path segment is blocked by a wall."); hoverPath = []; hoverPathIsValid = false; renderHighlights(); return; } partialShootPlan.segments.push({ path: segmentResult.path, endPos: targetPos }); partialShootPlan.path = partialShootPlan.segments.flatMap(seg => seg.path); partialShootPlan.lastBendPos = targetPos; const bendsMade = partialShootPlan.segments.length - 1; if (bendsMade < partialShootPlan.maxBends) { partialShootPlan.needsInput = true; setMessage(`Shoot Plan: Bend ${bendsMade + 1} at ${targetPos.x},${targetPos.y}. Click target cell for segment ${bendsMade + 2}.`); hoverPos = null; hoverPath = []; hoverPathIsValid = false; renderHighlights(); } else { partialShootPlan.needsInput = false; const finalAction = { type: 'shoot', targetPoints: partialShootPlan.segments.map(seg => seg.endPos), }; setMessage(`Shoot plan complete with ${bendsMade} bends. Executing...`); executeAction(finalAction); } }

// --- Shot Path Calculation Functions --- (Unchanged)
function calculateShotPathSegment(startPos, targetPos, opponentPos) { /* ... */ let path = []; let currentPos = { ...startPos }; let isValidSegment = true; let hitTargetAlongSegment = false; const dxTotal = targetPos.x - startPos.x; const dyTotal = targetPos.y - startPos.y; let stepDir = { dx: 0, dy: 0 }; if (Math.abs(dxTotal) > 0 && dyTotal === 0) { stepDir.dx = Math.sign(dxTotal); } else if (Math.abs(dyTotal) > 0 && dxTotal === 0) { stepDir.dy = Math.sign(dyTotal); } else { return { path: [], isValidSegment: false, hitTarget: false }; } while (currentPos.x !== targetPos.x || currentPos.y !== targetPos.y) { const nextX = currentPos.x + stepDir.dx; const nextY = currentPos.y + stepDir.dy; if (!isValid(nextX, nextY) || isWall(nextX, nextY)) { isValidSegment = false; break; } currentPos = { x: nextX, y: nextY }; path.push({ ...currentPos }); if (currentPos.x === opponentPos.x && currentPos.y === opponentPos.y) { hitTargetAlongSegment = true; } if (currentPos.x === targetPos.x && currentPos.y === targetPos.y) { break; } if (path.length > GRID_SIZE * 2) { console.error("Path segment calculation exceeded max length, breaking."); isValidSegment = false; break; } } const reachedTargetCell = isValidSegment && currentPos.x === targetPos.x && currentPos.y === targetPos.y; return { path: path, isValidSegment: reachedTargetCell, hitTarget: hitTargetAlongSegment }; }
function calculateFullPathFromTargets(startPos, targetPoints, opponentActualPos) { /* ... */ let fullPath = []; let currentPos = { ...startPos }; let pathIsValid = true; let finalHitTarget = false; for (const targetPoint of targetPoints) { const segmentResult = calculateShotPathSegment(currentPos, targetPoint, opponentActualPos); if (!segmentResult.isValidSegment) { pathIsValid = false; break; } fullPath.push(...segmentResult.path); currentPos = targetPoint; } if (pathIsValid) { finalHitTarget = fullPath.some(p => p.x === opponentActualPos.x && p.y === opponentActualPos.y); } else { finalHitTarget = false; fullPath = []; } return { path: fullPath, isValid: pathIsValid, hitTarget: finalHitTarget }; }

// --- AI Logic --- >>>>>>>> USING UCS/BFS FOR PATHING <<<<<<<<<<

// Helper: Generates potential shoot actions (Unchanged from previous simple AI)
function generatePossibleShootActions(actorPos, opponentPos, actorLevel) {
    const shootActions = [];
    const maxBends = actorLevel - 1;
    if (maxBends < 0) return [];

    function generateShootsRecursive(startPos, currentTargetPathPoints, bendsSoFar) {
        if (bendsSoFar > maxBends) return;
        const directions = [ { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 } ];
        let forbiddenDir = { dx: 0, dy: 0 };
        if (currentTargetPathPoints.length > 0) {
            const lastBend = currentTargetPathPoints[currentTargetPathPoints.length - 1];
            const prevPos = currentTargetPathPoints.length === 1 ? actorPos : currentTargetPathPoints[currentTargetPathPoints.length - 2];
            forbiddenDir = { dx: Math.sign(lastBend.x - prevPos.x), dy: Math.sign(lastBend.y - prevPos.y) };
        }
        directions.forEach((dir) => {
            if (currentTargetPathPoints.length > 0 && dir.dx === -forbiddenDir.dx && dir.dy === -forbiddenDir.dy && (dir.dx !== 0 || dir.dy !== 0)) return;
            for (let i = 1; i <= AI_MAX_SEGMENT_EVAL_POINTS; i++) {
                const potentialTargetX = startPos.x + dir.dx * i;
                const potentialTargetY = startPos.y + dir.dy * i;
                const potentialTarget = { x: potentialTargetX, y: potentialTargetY };
                if (!isValid(potentialTargetX, potentialTargetY)) break;
                const segmentResult = calculateShotPathSegment(startPos, potentialTarget, { x: -1, y: -1 });
                if (!segmentResult.isValidSegment) break;
                const newTargetPathPoints = [...currentTargetPathPoints, potentialTarget];
                const fullPathResult = calculateFullPathFromTargets(actorPos, newTargetPathPoints, opponentPos);
                 if (fullPathResult.isValid) {
                     shootActions.push({
                         type: "shoot",
                         targetPoints: newTargetPathPoints,
                         _hitsOpponent: fullPathResult.hitTarget
                     });
                 }
                if (bendsSoFar + 1 <= maxBends) {
                    generateShootsRecursive(potentialTarget, newTargetPathPoints, bendsSoFar + 1);
                }
            }
        });
    }
    generateShootsRecursive(actorPos, [], 0);
    const uniqueActions = []; const seenActions = new Set();
    shootActions.forEach((action) => {
        let key = `shoot-${action.targetPoints.map(p => `${p.x},${p.y}`).join('|')}`;
        if (!seenActions.has(key)) { uniqueActions.push(action); seenActions.add(key); }
    });
    return uniqueActions;
}

// Helper: Finds shortest path using BFS (equivalent to UCS with cost 1) (Unchanged)
function findShortestPath(startPos, targetPos, opponentPos) { // Renamed for clarity
    const q = [{ pos: startPos, path: [startPos] }];
    const visited = new Set([`${startPos.x},${startPos.y}`]);

    while (q.length > 0) {
        const current = q.shift();
        const { pos, path } = current;
        if (pos.x === targetPos.x && pos.y === targetPos.y) {
            return path; // Path found
        }
        const neighbors = getValidMoves(pos, opponentPos);
        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (!visited.has(key)) {
                visited.add(key);
                const newPath = [...path, neighbor];
                q.push({ pos: neighbor, path: newPath });
            }
        }
    }
    return null; // Target not reachable
}


/**
 * Simplified rule-based AI using pathfinding for movement.
 * Priority: Shoot Player > Move to Nearest Reachable Upgrade > Stay.
 * Uses BFS/UCS for pathfinding to upgrades.
 * @returns {object} The chosen action object.
 */
function findBestActionUCSBased() {
    console.log("AI using simple rule-based logic with BFS/UCS pathing...");
    const startTime = performance.now();

    // --- Rule 1: Check for winning shots ---
    const possibleShots = generatePossibleShootActions(aiPos, playerPos, aiWeaponLevel);
    const winningShots = possibleShots.filter(shot => shot._hitsOpponent);

    if (winningShots.length > 0) {
        const chosenShot = winningShots[0]; // Take the first winning shot found
        console.log(`AI Decision: Winning Shot Found. Action:`, chosenShot);
        const endTime = performance.now();
        console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
        return chosenShot;
    }

    // --- Rule 2: Move towards nearest reachable upgrade ---
    const availableUpgrades = [...powerUpPositions]; // Copy the list
    let shortestPathToUpgrade = null;
    let bestTargetUpgrade = null;

    // Sort upgrades by distance to potentially check closer ones first (optional optimization)
    availableUpgrades.sort((a, b) => distance(aiPos, a) - distance(aiPos, b));

    // Find the shortest path to any reachable upgrade
    for (const upgradePos of availableUpgrades) {
        const path = findShortestPath(aiPos, upgradePos, playerPos); // Use BFS/UCS
        if (path && path.length > 1) { // Path exists and requires movement
             // Found the first reachable upgrade based on sorted distance
             shortestPathToUpgrade = path;
             bestTargetUpgrade = upgradePos;
             break; // Stop searching once the nearest reachable one is found
        }
    }

    if (shortestPathToUpgrade) {
        // Path found, take the first step
        const nextStep = shortestPathToUpgrade[1]; // path[0] is current pos
        console.log(`AI Decision: Moving towards upgrade at ${bestTargetUpgrade.x},${bestTargetUpgrade.y}. Next step: ${nextStep.x},${nextStep.y}`);
        const endTime = performance.now();
        console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
        return { type: "move", target: nextStep };
    }

    // --- Rule 3: Fallback - Stay Put ---
    // No winning shot, no reachable upgrade found.
    console.log("AI Decision: No winning shot or reachable upgrades. Staying put.");
    const endTime = performance.now();
    console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
    return { type: "stay" };
}

// --- MODIFIED triggerAiTurn to use the new Simple AI ---
function triggerAiTurn() {
    setMessage("AI is thinking...");
    updatePhaseIndicator();
    disablePlanningControls();

    setTimeout(() => {
        if (gameOverState) return;

        // Find the best action using the simplified logic
        const aiAction = findBestActionUCSBased();

        if (!aiAction) {
             console.error("AI failed to find ANY action (even 'stay')!");
             executeAction({ type: 'stay'});
             return;
        }

        executeAction(aiAction);

    }, AI_THINK_DELAY);
}

// --- Action Execution and Turn Management --- (Unchanged)
async function executeAction(action) { /* ... */ if (isResolving || gameOverState) return; console.log(`Executing ${currentPlayer}'s action:`, action); isResolving = true; disablePlanningControls(); updatePhaseIndicator(); let actionSuccess = true; let wasHit = false; let collectedPowerup = false; let messageLog = []; const activePlayer = currentPlayer; const activePlayerMesh = activePlayer === "player" ? playerMesh : aiMesh; const activePlayerPosRef = activePlayer === "player" ? playerPos : aiPos; const opponentPos = activePlayer === "player" ? aiPos : playerPos; const opponentMesh = activePlayer === "player" ? aiMesh : playerMesh; const laserMaterial = activePlayer === "player" ? playerLaserMaterial : aiLaserMaterial; let weaponLevelRef = activePlayer === "player" ? playerWeaponLevel : aiWeaponLevel; if (action.type === "move") { setMessage(`${activePlayer.toUpperCase()} moves...`); if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) { messageLog.push(`${activePlayer.toUpperCase()} move blocked by opponent!`); actionSuccess = false; } else { await animateMove(activePlayerMesh, action.target); activePlayerPosRef.x = action.target.x; activePlayerPosRef.y = action.target.y; messageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`); const powerupIndex = powerUpPositions.findIndex((p) => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y); if (powerupIndex !== -1) { const currentLevel = activePlayer === "player" ? playerWeaponLevel : aiWeaponLevel; const newLevel = Math.min(MAX_WEAPON_LEVEL, currentLevel + 1); if (activePlayer === "player") playerWeaponLevel = newLevel; else aiWeaponLevel = newLevel; collectedPowerup = true; messageLog.push(`${activePlayer.toUpperCase()} collected weapon upgrade! (Level ${newLevel})`); removePowerup3D(activePlayerPosRef.x, activePlayerPosRef.y); updateWeaponLevelInfo(); } } if (actionSuccess) await wait(ACTION_RESOLVE_DELAY / 2); } else if (action.type === "shoot") { setMessage(`${activePlayer.toUpperCase()} fires!`); const startPos = activePlayer === "player" ? playerPos : aiPos; const finalPathResult = calculateFullPathFromTargets(startPos, action.targetPoints, opponentPos); if (finalPathResult.isValid) { createLaserBeam(finalPathResult.path, laserMaterial); messageLog.push(`${activePlayer.toUpperCase()} shot path confirmed.`); wasHit = finalPathResult.hitTarget; if (wasHit) { messageLog.push(`${activePlayer === "player" ? "AI" : "Player"} was hit!`); } else { messageLog.push(`Shot missed!`); } await wait(SHOT_FLASH_DURATION); } else { messageLog.push(`${activePlayer.toUpperCase()} shot path blocked or invalid!`); actionSuccess = false; await wait(ACTION_RESOLVE_DELAY); } } else if (action.type === "stay") { setMessage(`${activePlayer.toUpperCase()} stays put.`); messageLog.push(`${activePlayer.toUpperCase()} did not move.`); await wait(ACTION_RESOLVE_DELAY); } setMessage(messageLog.join(" ")); if (wasHit) { endGame(`${activePlayer.toUpperCase()} Wins!`, activePlayer); return; } if (!gameOverState) { currentPlayer = activePlayer === "player" ? "ai" : "player"; gamePhase = currentPlayer + "Turn"; isResolving = false; await wait(ACTION_RESOLVE_DELAY); if (currentPlayer === "ai") { triggerAiTurn(); } else { setMessage("Your Turn: Plan your action."); updatePhaseIndicator(); enablePlanningControls(); setPlanningMode("move"); } } else { isResolving = false; } }

// --- Animate Move Function --- (Unchanged)
function animateMove(mesh, targetGridPos) { /* ... */ return new Promise((resolve) => { const startPos3D = mesh.position.clone(); const targetY = mesh.userData.type === 'player' ? (CELL_3D_SIZE * 0.9) / 2 : (CELL_3D_SIZE * 1.0) / 2; const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY); const hopHeight = CELL_3D_SIZE * 0.3; const midPos3D = new THREE.Vector3((startPos3D.x + targetPos3D.x) / 2, Math.max(startPos3D.y, targetPos3D.y) + hopHeight, (startPos3D.z + targetPos3D.z) / 2); new TWEEN.Tween(startPos3D).to(midPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.Out).onUpdate(() => { mesh.position.copy(startPos3D); }).onComplete(() => { new TWEEN.Tween(startPos3D).to(targetPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.In).onUpdate(() => { mesh.position.copy(startPos3D); }).onComplete(resolve).start(); }).start(); }); }

// --- Utility Wait Function --- (Unchanged)
function wait(duration) { return new Promise(resolve => setTimeout(resolve, duration)); }

// --- Powerup Logic Functions --- (Unchanged)
function spawnInitialPowerups() { /* ... */ console.log("Spawning initial powerups (Weighted Random Sampling)..."); powerUpPositions = []; powerupMeshes.forEach(p => disposeMesh(p.mesh)); powerupMeshes = []; let availableCells = []; for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' && !(x === playerPos.x && y === playerPos.y) && !(x === aiPos.x && y === aiPos.y)) { availableCells.push({ x, y }); } } } if (availableCells.length < INITIAL_POWERUP_COUNT) { console.warn(`Not enough available cells (${availableCells.length}) to spawn ${INITIAL_POWERUP_COUNT} powerups. Spawning all available.`); availableCells.forEach((cell) => { powerUpPositions.push({ x: cell.x, y: cell.y }); const newPowerup = createPowerup3D(cell.x, cell.y); if (newPowerup) powerupMeshes.push(newPowerup); console.log(`Spawned powerup at ${cell.x},${cell.y} (fallback due to low cell count)`); }); return; } let weightedCells = availableCells.map((cell) => { const distPlayer = Math.max(1, distance(cell, playerPos)); const distAi = Math.max(1, distance(cell, aiPos)); const ratio = distAi / distPlayer; const diff = Math.abs(ratio - AI_DISTANCE_BIAS); const weight = 0.01 + 1 / (1 + diff * diff * 10); return { cell, weight, ratio, distPlayer, distAi }; }).filter((wc) => wc.weight > 0); let totalWeight = weightedCells.reduce((sum, wc) => sum + wc.weight, 0); let spawnedCount = 0; const maxSpawnAttempts = availableCells.length * 3; let attempts = 0; while (spawnedCount < INITIAL_POWERUP_COUNT && weightedCells.length > 0 && attempts < maxSpawnAttempts) { attempts++; if (totalWeight <= 0) { console.warn("Total weight is zero or negative, cannot perform weighted sampling. Attempt:", attempts); break; } let randomVal = Math.random() * totalWeight; let chosenIndex = -1; for (let i = 0; i < weightedCells.length; i++) { randomVal -= weightedCells[i].weight; if (randomVal <= 0) { chosenIndex = i; break; } } if (chosenIndex === -1 && weightedCells.length > 0) { console.warn("Weighted sampling fallback triggered (chosenIndex = -1). Selecting last element. Attempt:", attempts); chosenIndex = weightedCells.length - 1; } if (chosenIndex !== -1 && chosenIndex < weightedCells.length) { const chosenWeightedCell = weightedCells[chosenIndex]; const { cell, ratio, distPlayer, distAi } = chosenWeightedCell; powerUpPositions.push({ x: cell.x, y: cell.y }); const newPowerup = createPowerup3D(cell.x, cell.y); if (newPowerup) powerupMeshes.push(newPowerup); console.log(`Spawned powerup at ${cell.x},${cell.y} (Ratio: ${ratio.toFixed(2)}, PDist: ${distPlayer}, ADist: ${distAi}, Weight: ${chosenWeightedCell.weight.toFixed(3)})`); spawnedCount++; totalWeight -= chosenWeightedCell.weight; weightedCells.splice(chosenIndex, 1); } else { console.error(`Error during weighted sampling: Invalid chosenIndex (${chosenIndex}) or weightedCells issue. Attempt:`, attempts, "TotalWeight:", totalWeight, "weightedCells.length:", weightedCells.length); break; } } if (spawnedCount < INITIAL_POWERUP_COUNT) { console.warn(`Could only spawn ${spawnedCount} out of ${INITIAL_POWERUP_COUNT} initial powerups after ${attempts} attempts.`); } else { console.log(`Successfully spawned ${spawnedCount} initial powerups.`); } }

// --- Game Over Function --- (Unchanged)
function endGame(message, winner) { console.log("Game Over:", message); gamePhase = "gameOver"; gameOverState = { winner: winner, message: message }; setMessage(message); updatePhaseIndicator(); disablePlanningControls(); isResolving = false; }

// --- Utility Functions --- (Unchanged)
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === "wall"; }
function getValidMoves(unitPos, opponentPos) { /* ... */ const moves = []; const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },]; directions.forEach(dir => { const nextX = unitPos.x + dir.dx; const nextY = unitPos.y + dir.dy; if (isValid(nextX, nextY) && grid[nextY][nextX] === 'floor' && !(nextX === opponentPos.x && nextY === opponentPos.y)) { moves.push({ x: nextX, y: nextY }); } }); return moves; }
function distance(pos1, pos2) { return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y); }
function findNearestPowerup(pos, powerupList = powerUpPositions) { /* ... */ let minDist = Infinity; let nearest = null; powerupList.forEach((p) => { const d = distance(pos, p); if (d < minDist) { minDist = d; nearest = p; } }); return nearest; }


// --- Start Game ---
init();