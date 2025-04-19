// game_3d.js
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
const playerFuelInfo = document.getElementById("playerFuelInfo");
const aiFuelInfo = document.getElementById("aiFuelInfo");
const planFuelCostInfo = document.getElementById("planFuelCostInfo");

// --- Game Constants ---
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
const MISSILE_TRAVEL_DURATION = 1200;
const MOVEMENT_DURATION = 400;
const AI_THINK_DELAY = 50;
const ACTION_RESOLVE_DELAY = 200;
const EXPLOSION_DURATION = 700; // Base duration for normal explosions

// --- NEW MECHANICS Constants ---
const FUEL_EXPLOSION_RADIUS = 2; // Manhattan distance for blast radius destruction
const FUEL_EXPLOSION_SCALE_MULTIPLIER = 1.8; // How much bigger fuel explosions are
const FUEL_EXPLOSION_PARTICLE_MULTIPLIER = 2.0; // How many more particles fuel explosions have


// --- Three.js Setup ---
let scene, camera, renderer, controls, composer;
let gameBoardGroup;
let floorMeshes = [];
let wallMeshes = [];
let powerupMeshes = []; // Fuel Cells (Stores {mesh, pos})
let playerMesh, aiMesh;
let playerFuelIndicator, aiFuelIndicator;
let activeHighlights = [];
let activeProjectiles = []; // Holds missile meshes and trails (explosions manage their own cleanup)

// Materials
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
	color: 0xffc107, // Bright Yellow/Orange
	emissive: 0xffaa00, // Stronger emissive color
	emissiveIntensity: 1.8, // Increased intensity
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

// Missile/Explosion Materials
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
// Enhanced base explosion materials for better visuals
const explosionShockwaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xffccaa, // Orangey-white
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
});
const explosionParticleMaterial = new THREE.PointsMaterial({
    color: 0xff8844, // Orange sparks
    size: 0.25, // Base size, can be adjusted
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    depthWrite: false,
    vertexColors: true, // Allow individual particle coloring
});

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State ---
let grid = [];
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerFuel = INITIAL_FUEL;
let aiFuel = INITIAL_FUEL;
let powerUpPositions = []; // Array of {x, y} coordinates
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
	console.log("Initializing 3D Missile Game with Fuel Explosions...");
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
	const planeMat = new THREE.MeshBasicMaterial({
		visible: false,
		side: THREE.DoubleSide,
	});
	intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
	intersectionPlane.rotation.x = -Math.PI / 2;
	intersectionPlane.position.y = -0.04; // Slightly below floor
	scene.add(intersectionPlane);
	window.addEventListener("resize", onWindowResize, false);
	onWindowResize(); // Initial setup
}

function onWindowResize() {
	const width = canvasContainer.clientWidth;
	const height = canvasContainer.clientHeight;
	if (width === 0 || height === 0) return; // Avoid division by zero
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
	powerUpPositions = []; // Reset logical positions
	powerupMeshes = []; // Reset visual meshes

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
	controls.target.set(0, 0, 0); // Reset camera target
	controls.update();
	setPlanningMode("move"); // Default to move
}

function setupInputListeners() {
	btnPlanMove.addEventListener("click", () => setPlanningMode("move"));
	btnPlanShoot.addEventListener("click", () => setPlanningMode("shoot"));
	btnReset.addEventListener("click", initGameLogic);
	canvasContainer.addEventListener("click", handleCanvasClick);
	canvasContainer.addEventListener("mousemove", handleCanvasMouseMove);
	canvasContainer.addEventListener("contextmenu", (event) =>
		event.preventDefault()
	); // Prevent right-click menu
}


// --- Grid Generation Functions --- (Unchanged from previous versions)
function generateGrid() {
    let attempts = 0;
    while (attempts < 10) {
        grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor"));
        let wallCount = 0;
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetWallCount = Math.floor(totalCells * WALL_DENSITY) * 0.7;

        while (wallCount < targetWallCount) {
            const x = Math.floor(Math.random() * GRID_SIZE);
            const y = Math.floor(Math.random() * GRID_SIZE);

            // Avoid corners more strongly
            const isNearCorner = (px, py) =>
                (px >= 0 && px <= 4 && py >= 0 && py <= 4) ||
                (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);

            if (grid[y][x] === "floor" && !isNearCorner(x, y) && Math.random() < 0.9) {
                grid[y][x] = "wall";
                wallCount++;
            } else if (grid[y][x] === "floor" && Math.random() < 0.2) { // Allow some random walls elsewhere
                grid[y][x] = "wall";
                wallCount++;
            }
        }

        if (isGridConnected()) {
            console.log("Generated connected grid.");
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
    const startNode = findFirstFloor();
    if (!startNode) return false; // No floor cells

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
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && grid[n.y][n.x] === "floor" && !visited.has(key)) {
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

    // Find closest valid floor for player near corner 0
    const playerStart = findNearestFloorBFS(potentialStarts[0]);

    let aiStart = null;
    const farCorners = [potentialStarts[1], potentialStarts[2], potentialStarts[3]];
    farCorners.sort(() => Math.random() - 0.5); // Shuffle potential AI corners

    // Try to find a valid floor near a far corner, distant from player
    for (const corner of farCorners) {
        const potentialAiStart = findNearestFloorBFS(corner, playerStart ? [playerStart] : []);
        if (potentialAiStart && playerStart && distance(playerStart, potentialAiStart) > GRID_SIZE * 0.6) {
            aiStart = potentialAiStart;
            break;
        }
    }

    // Fallback: If no distant corner worked, find *any* valid floor far from player
    if (!aiStart && playerStart) {
        console.warn("Could not find a far start position for AI, trying any reachable floor.");
        aiStart = findNearestFloorBFS({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }, [playerStart]);
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
    occupied.forEach(occ => visited.add(`${occ.x},${occ.y}`)); // Mark occupied spots

    while (q.length > 0) {
        const current = q.shift();
        const { x, y } = current.pos;

        // Check if current position is valid and not occupied
        if (isValid(x, y) && grid[y][x] === "floor" && !occupied.some(occ => occ.x === x && occ.y === y)) {
            return { x, y }; // Found the nearest valid floor
        }

        // Explore neighbors
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
    return null; // No reachable valid floor found
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
	// Add small epsilon for robustness near edges if needed, but rounding usually works
	// const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01);
	// const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2 + 0.01);
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
	// Remove all meshes directly added to gameBoardGroup
	gameBoardGroup.children.slice().forEach(child => {
        if (child.isMesh) {
            disposeMesh(child);
        } else if (child.isSprite) {
             disposeSprite(child); // Handle sprites like fuel indicators
        }
    });
	// Clear specific references and arrays
    disposeSprite(playerFuelIndicator); playerFuelIndicator = null;
    disposeSprite(aiFuelIndicator); aiFuelIndicator = null;
	floorMeshes = [];
	wallMeshes = [];
    powerupMeshes = []; // Clear powerup mesh array too
	playerMesh = null;
	aiMesh = null;
    activeHighlights.forEach(disposeMesh);
    activeHighlights = [];
	// Clear active projectiles/trails (missiles)
	activeProjectiles.forEach(proj => {
		if (proj.mesh) disposeMesh(proj.mesh);
		if (proj.trail) { // Trails are groups
            proj.trail.children.forEach(disposeMesh);
            if(proj.trail.parent) proj.trail.parent.remove(proj.trail);
        }
	});
	activeProjectiles = [];
}

function createBoard3D() {
	floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
	wallMeshes = [];

	const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
	const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

	for (let y = 0; y < GRID_SIZE; y++) {
		for (let x = 0; x < GRID_SIZE; x++) {
			const pos = get3DPosition(x, y);
			if (grid[y][x] === "floor") {
				const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
				floorMesh.position.copy(pos);
				floorMesh.position.y = -0.1; // Slightly below 0
				floorMesh.castShadow = false;
				floorMesh.receiveShadow = true;
				floorMesh.userData = { gridX: x, gridY: y, type: "floor" };
				gameBoardGroup.add(floorMesh);
				floorMeshes[y][x] = floorMesh;
			} else if (grid[y][x] === "wall") {
				const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
				wallMesh.position.copy(pos);
				wallMesh.position.y = WALL_HEIGHT / 2 - 0.1; // Center vertically, align with floor
				wallMesh.castShadow = true;
				wallMesh.receiveShadow = true;
				wallMesh.userData = { gridX: x, gridY: y, type: "wall" };
				gameBoardGroup.add(wallMesh);
				wallMeshes.push(wallMesh);
				floorMeshes[y][x] = null; // No floor mesh under a wall
			}
		}
	}
}

function createUnits3D() {
	// Player
	const playerUnitHeight = CELL_3D_SIZE * 0.9;
	const playerUnitRadius = CELL_3D_SIZE * 0.3;
	const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - playerUnitRadius * 2, 4, 10);
	playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
	playerMesh.castShadow = true;
	playerMesh.receiveShadow = false; // Units usually don't receive shadows on themselves well
	const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2);
	playerMesh.position.copy(playerPos3D);
	playerMesh.userData = { type: "player" };
	gameBoardGroup.add(playerMesh);

	// Player Fuel Indicator
	playerFuelIndicator = createFuelTextMesh(playerFuel);
    playerFuelIndicator.position.set(0, playerUnitHeight * 0.6, 0); // Position relative to player mesh center
    playerMesh.add(playerFuelIndicator); // Add as child

	// AI
	const aiUnitHeight = CELL_3D_SIZE * 1.0;
	const aiUnitRadius = CELL_3D_SIZE * 0.4;
	const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8); // Cone shape for AI
	aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
	aiMesh.castShadow = true;
	aiMesh.receiveShadow = false;
	const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2);
	aiMesh.position.copy(aiPos3D);
	aiMesh.userData = { type: "ai" };
	gameBoardGroup.add(aiMesh);

    // AI Fuel Indicator
    aiFuelIndicator = createFuelTextMesh(aiFuel);
    aiFuelIndicator.position.set(0, aiUnitHeight * 0.6, 0); // Position relative to AI mesh center
    aiMesh.add(aiFuelIndicator); // Add as child

	updateFuelVisuals(); // Initial update
}

function createFuelTextMesh(fuel) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const size = 128; // Texture resolution
    const halfSize = size / 2;
    canvas.width = size;
    canvas.height = size;

    // Background bubble
    context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black background
    context.beginPath();
    context.roundRect(0, 0, size, size, size * 0.15); // Rounded rectangle
    context.fill();

    // Text
    context.font = `Bold ${size * 0.6}px Arial`; // Large, bold text
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(fuel.toString(), halfSize, halfSize + size * 0.02); // Adjust vertical alignment slightly

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace; // Important for color accuracy

    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        sizeAttenuation: false, // Keep size constant regardless of distance
        depthTest: false, // Render on top
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.1, 0.1, 1); // Scale down the sprite
    return sprite;
}


function updateFuelVisuals() {
	// Update Player Fuel Indicator
    if (playerMesh && playerFuelIndicator) {
        playerMesh.remove(playerFuelIndicator); // Remove old one
        disposeSprite(playerFuelIndicator);
        playerFuelIndicator = createFuelTextMesh(playerFuel);
        const playerUnitHeight = CELL_3D_SIZE * 0.9;
        playerFuelIndicator.position.set(0, playerUnitHeight * 0.6, 0);
        playerMesh.add(playerFuelIndicator);
        // Optional: Adjust player emissive intensity based on fuel
        playerMesh.material.emissiveIntensity = 0.5 + playerFuel / 50;
    }

    // Update AI Fuel Indicator
    if (aiMesh && aiFuelIndicator) {
        aiMesh.remove(aiFuelIndicator); // Remove old one
        disposeSprite(aiFuelIndicator);
        aiFuelIndicator = createFuelTextMesh(aiFuel);
        const aiUnitHeight = CELL_3D_SIZE * 1.0;
        aiFuelIndicator.position.set(0, aiUnitHeight * 0.6, 0);
        aiMesh.add(aiFuelIndicator);
        // Optional: Adjust AI emissive intensity based on fuel
        aiMesh.material.emissiveIntensity = 0.5 + aiFuel / 50;
    }
}

function createPowerup3D(x, y) {
	const powerupSize = CELL_3D_SIZE * 0.3;
	const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0); // Shiny gem shape
	const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
	mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7)); // Float slightly above ground
	mesh.castShadow = true;
	mesh.userData = {
		type: "powerup",
		gridX: x,
		gridY: y,
		spinSpeed: Math.random() * 0.03 + 0.015, // Random spin
	};
	gameBoardGroup.add(mesh);
	return { mesh: mesh, pos: { x, y } }; // Return object containing mesh and position
}

function removePowerup3D(x, y) {
	const meshIndex = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
	if (meshIndex !== -1) {
		const powerupObj = powerupMeshes[meshIndex];
		disposeMesh(powerupObj.mesh);
		powerupMeshes.splice(meshIndex, 1); // Remove from mesh array
	} else {
        console.warn(`Could not find fuel cell mesh at ${x},${y} to remove visually.`);
    }

	// Also remove from the logical position array
	const logicalIndex = powerUpPositions.findIndex(p => p.x === x && p.y === y);
	if (logicalIndex !== -1) {
		powerUpPositions.splice(logicalIndex, 1);
	} else {
         console.warn(`Could not find fuel cell position at ${x},${y} to remove logically.`);
    }
}


// --- Highlighting Functions ---
function clearHighlights() {
	activeHighlights.forEach(mesh => {
		disposeMesh(mesh);
	});
	activeHighlights = [];

	// Ensure base floor tiles are restored if they were replaced by highlights
	for (let y = 0; y < GRID_SIZE; y++) {
		for (let x = 0; x < GRID_SIZE; x++) {
			if (grid[y][x] === 'floor' && !floorMeshes[y]?.[x]) {
                // If a floor tile is missing (likely replaced by a highlight), recreate it
                const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
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
        // Remove existing floor tile at this position before adding highlight
        const existingMesh = floorMeshes[y]?.[x];
        if (existingMesh) {
            disposeMesh(existingMesh);
            floorMeshes[y][x] = null; // Mark as empty so clearHighlights can restore it
        }

		const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE); // Slightly thicker
		const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone()); // Clone material
		highlightMesh.position.copy(get3DPosition(x, y));
		highlightMesh.position.y = -0.08; // Slightly above base floor level
		highlightMesh.userData = { gridX: x, gridY: y, type: "highlight" };
		gameBoardGroup.add(highlightMesh);
		activeHighlights.push(highlightMesh);
	}
}

function renderHighlights() {
	clearHighlights(); // Clear previous highlights first
    clearPlanningCostUI(); // Clear cost text

	if (currentPlayer !== "player" || isResolving || gameOverState) {
        if(activeHighlights.length > 0) clearHighlights(); // Ensure cleared if state changes mid-frame
		return; // Don't render highlights if not player's turn or resolving/game over
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

			// Highlight path tiles
			plannedShootPath.forEach(p => {
                if (!(p.x === playerPos.x && p.y === playerPos.y)) { // Don't highlight player's own cell
                    highlightCell(p.x, p.y, pathMaterial);
                }
            });

			// Highlight target tile distinctly
			const target = plannedShootPath[plannedShootPath.length - 1];
			const targetMaterial = canAfford ? hitHighlightMaterial : invalidPathHighlightMaterial;
			highlightCell(target.x, target.y, targetMaterial);

            // Update UI cost display
            updatePlanningCostUI(cost, available);
		} else {
             clearPlanningCostUI(); // No path, clear cost display
        }
	}
}


// --- ====================================== ---
// --- NEW: Guided Missile Visual Function ---
// --- ====================================== ---

/**
 * Creates the guided missile animation: launch, travel with trail, and calls back on impact.
 * Does NOT create the explosion effect itself, that's handled by the caller based on target type.
 * @param {Array<object>} path Array of {x, y} grid coordinates.
 * @param {THREE.Material} missileCoreMaterial The base material for the missile body.
 * @param {Function} [onImpactCallback] Optional callback when the missile visually reaches the target position.
 */
function createGuidedMissileVisual(path, missileCoreMaterial, onImpactCallback = null) {
	if (!path || path.length < 2) return;

	const startGridPos = path[0];
	const endGridPos = path[path.length - 1];

	// --- Path and Curve Setup ---
	const launchHeight = CELL_3D_SIZE * 0.7;
	const impactHeight = CELL_3D_SIZE * 0.3; // Target height above floor
	const midHeightBoost = CELL_3D_SIZE * 1.5 * Math.min(1.0, path.length / 5); // Apex boost

	const points3D = path.map((p, index) => {
		let yOffset = launchHeight + (impactHeight - launchHeight) * (index / (path.length - 1));
		const midPointFactor = Math.sin((index / (path.length - 1)) * Math.PI);
		yOffset += midHeightBoost * midPointFactor;
		return get3DPosition(p.x, p.y, yOffset);
	});

	points3D[0] = get3DPosition(startGridPos.x, startGridPos.y, launchHeight);
	points3D[points3D.length - 1] = get3DPosition(endGridPos.x, endGridPos.y, impactHeight);

	const curve = new THREE.CatmullRomCurve3(points3D, false, "catmullrom", 0.2);

	// --- Missile Mesh ---
	const missileRadius = CELL_3D_SIZE * 0.12;
	const missileLength = CELL_3D_SIZE * 0.45;
	const missileGeom = new THREE.ConeGeometry(missileRadius, missileLength, 8);
	missileGeom.rotateX(Math.PI / 2);
	missileGeom.translate(0, 0, missileLength / 2);

	const missileMesh = new THREE.Mesh(missileGeom, missileCoreMaterial.clone());
	missileMesh.position.copy(curve.getPointAt(0));
	missileMesh.lookAt(curve.getPointAt(0.01));
	missileMesh.userData = { type: "missile_object" };
	scene.add(missileMesh);
	activeProjectiles.push({ mesh: missileMesh }); // Track for cleanup if game resets

	// --- Trail Particles ---
	const trailGroup = new THREE.Group();
	scene.add(trailGroup);
	activeProjectiles.push({ trail: trailGroup }); // Track for cleanup
	const trailSpawnInterval = 30; // ms
	let lastTrailSpawnTime = 0;
	const trailParticleLifetime = 400; // ms

	// --- Missile Movement Tween ---
	const travelTween = new TWEEN.Tween({ t: 0 })
		.to({ t: 1 }, MISSILE_TRAVEL_DURATION)
		.easing(TWEEN.Easing.Linear.None)
		.onUpdate((obj) => {
			const currentTime = performance.now();
			const currentPoint = curve.getPointAt(obj.t);
			const tangent = curve.getTangentAt(obj.t).normalize();

			missileMesh.position.copy(currentPoint);
			const lookAtPoint = currentPoint.clone().add(tangent);
			missileMesh.lookAt(lookAtPoint);

			// Spawn Trail Particles
			if (currentTime - lastTrailSpawnTime > trailSpawnInterval && obj.t < 0.98) {
				lastTrailSpawnTime = currentTime;
				const particleGeom = new THREE.SphereGeometry(missileRadius * 0.4, 4, 2);
				const particleMat = missileTrailMaterial.clone();
				particleMat.opacity = 0.7;
				const particle = new THREE.Mesh(particleGeom, particleMat);
				particle.position.copy(currentPoint).addScaledVector(tangent, -missileLength * 0.6);
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
			// Missile visually reached destination

            // Clean up missile mesh immediately
            scene.remove(missileMesh);
            disposeMesh(missileMesh);
            let missileIndex = activeProjectiles.findIndex(p => p.mesh === missileMesh);
            if (missileIndex > -1) activeProjectiles.splice(missileIndex, 1);


			// Clean up trail group after a short delay
			setTimeout(() => {
				scene.remove(trailGroup);
				trailGroup.children.forEach(disposeMesh); // Dispose any remaining particles
                let trailIndex = activeProjectiles.findIndex(p => p.trail === trailGroup);
                if (trailIndex > -1) activeProjectiles.splice(trailIndex, 1);

			}, trailParticleLifetime);

             // Call the impact callback signalling visual arrival
            if (onImpactCallback) {
                onImpactCallback();
            }
		})
		.start();
}


/**
 * Creates a visual explosion effect at a given position with optional enhancements.
 * Manages its own cleanup via tweens and calls a callback when fully finished.
 * @param {THREE.Vector3} position World position for the explosion center.
 * @param {THREE.Color} baseColor Color hint for the explosion.
 * @param {number} [scaleMultiplier=1.0] Multiplier for the size and duration.
 * @param {number} [particleMultiplier=1.0] Multiplier for the number of particles.
 * @param {Function} [onCompleteCallback=null] Callback when the effect finishes visually.
 */
function createExplosionEffect(position, baseColor, scaleMultiplier = 1.0, particleMultiplier = 1.0, onCompleteCallback = null) {
    const explosionGroup = new THREE.Group();
    scene.add(explosionGroup);

    const baseExplosionScale = CELL_3D_SIZE * 1.5;
    const explosionScale = baseExplosionScale * scaleMultiplier;
    const baseParticleCount = 150;
    const particleCount = Math.round(baseParticleCount * particleMultiplier);
    const baseDuration = EXPLOSION_DURATION; // Use the constant
    const effectDuration = baseDuration * scaleMultiplier; // Scale duration with size

    let completedComponents = 0;
    const totalVisualComponents = 3; // shockwave, particles, light

    const checkCleanup = () => {
        completedComponents++;
        if (completedComponents >= totalVisualComponents) {
            // Cleanup internal meshes/lights
            scene.remove(explosionGroup); // Remove parent group
            disposeMesh(shockwaveMesh);
            disposeMesh(particleSystem); // Disposes geom and mat
            scene.remove(flashLight); // Light removed directly

            // Signal overall completion
            if (onCompleteCallback) {
                onCompleteCallback();
            }
        }
    };

    // --- 1. Shockwave Sphere ---
    const shockwaveGeom = new THREE.SphereGeometry(explosionScale * 0.1, 32, 16); // Start small
    const shockwaveMat = explosionShockwaveMaterial.clone();
    shockwaveMat.color.set(baseColor).lerp(new THREE.Color(0xffffff), 0.7);
    const shockwaveMesh = new THREE.Mesh(shockwaveGeom, shockwaveMat);
    shockwaveMesh.position.copy(position);
    explosionGroup.add(shockwaveMesh);

    new TWEEN.Tween(shockwaveMesh.scale)
        .to({ x: explosionScale, y: explosionScale, z: explosionScale }, effectDuration * 0.6)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start(); // Scale tween doesn't trigger cleanup directly

    new TWEEN.Tween(shockwaveMesh.material)
        .to({ opacity: 0 }, effectDuration * 0.7)
        .easing(TWEEN.Easing.Cubic.In)
        .delay(effectDuration * 0.1)
        .onComplete(checkCleanup) // Opacity tween completion triggers cleanup check
        .start();

    // --- 2. Particle Burst ---
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const colors = new Float32Array(particleCount * 3);
    const particleBaseColor = baseColor.clone().lerp(new THREE.Color(0xffaa00), 0.5); // Orangey base

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0; // Start at center

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = (Math.random() * 0.8 + 0.2) * explosionScale * 1.8;
        const velocity = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi)
        ).multiplyScalar(speed);
        velocities.push(velocity);

        const initialColor = particleBaseColor.clone().lerp(new THREE.Color(0xffffdd), Math.random() * 0.6); // Add some yellow/white variance
        colors[i * 3] = initialColor.r; colors[i * 3 + 1] = initialColor.g; colors[i * 3 + 2] = initialColor.b;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMat = explosionParticleMaterial.clone();
    particleMat.size = 0.3 * scaleMultiplier; // Adjust base size with scale

    const particleSystem = new THREE.Points(particleGeom, particleMat);
    particleSystem.position.copy(position);
    explosionGroup.add(particleSystem);

    // Animate particles
    const particleTween = new TWEEN.Tween({ t: 0, sizeFactor: 1.0, opacity: 1.0 })
        .to({ t: 1, sizeFactor: 0.01, opacity: 0.0 }, effectDuration)
        .easing(TWEEN.Easing.Exponential.Out)
        .onUpdate((obj) => {
            const posAttr = particleSystem.geometry.attributes.position;
            const colAttr = particleSystem.geometry.attributes.color;
            const easeT = TWEEN.Easing.Quadratic.Out(obj.t); // Apply easing to displacement

            for (let i = 0; i < particleCount; i++) {
                posAttr.setXYZ(i, velocities[i].x * easeT, velocities[i].y * easeT, velocities[i].z * easeT);

                const colorProgress = Math.min(1, obj.t * 1.5);
                const currentColor = new THREE.Color().setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
                const targetColor = new THREE.Color(0x551100); // Dark red/orange end color
                currentColor.lerp(targetColor, colorProgress * 0.8);
                colAttr.setXYZ(i, currentColor.r, currentColor.g, currentColor.b);
            }
            particleSystem.material.size = obj.sizeFactor * 0.3 * scaleMultiplier; // Update size dynamically
            particleSystem.material.opacity = obj.opacity;
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        })
        .onComplete(checkCleanup) // Particle system completion triggers cleanup check
        .start();

    // --- 3. Light Flash ---
    const flashLight = new THREE.PointLight(
        baseColor.clone().lerp(new THREE.Color(0xffffff), 0.8), // Bright whiteish flash color
        15.0 * scaleMultiplier, // Intensity scales with size
        explosionScale * 2.5, // Range scales
        1.5 // Decay
    );
    flashLight.position.copy(position);
    explosionGroup.add(flashLight); // Add light to the group

    new TWEEN.Tween(flashLight)
        .to({ intensity: 0 }, effectDuration * 0.4) // Faster flash fade
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(checkCleanup) // Light completion triggers cleanup check
        .start();
}

// --- ====================================== ---
// --- END: Missile/Explosion Visuals ---
// --- ====================================== ---


// --- Animation Loop ---
function animate(time) {
	requestAnimationFrame(animate);
	TWEEN.update(time); // Critical for animations
	controls.update(); // Update OrbitControls if damping is enabled

	// Animate powerup spin
	powerupMeshes.forEach(p => {
		if (p.mesh) {
			p.mesh.rotation.y += p.mesh.userData.spinSpeed || 0.015;
			p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5;
		}
	});

	// Render scene with post-processing
	composer.render();
}

// --- Input Handling Functions ---
function handleCanvasMouseMove(event) {
	if (currentPlayer !== "player" || isResolving || gameOverState || currentPlanningMode !== "shoot") {
        // If not in correct state to plan shot, clear any existing path preview
        if (plannedShootPath || currentHoverPos) {
             plannedShootPath = null;
             plannedShootCost = 0;
             currentHoverPos = null;
             clearPlanningCostUI();
             renderHighlights(); // Re-render to clear visuals
        }
		return;
	}

	updateMouseCoords(event);
	raycaster.setFromCamera(mouse, camera);
	const intersects = raycaster.intersectObject(intersectionPlane);

	let targetPos = null;
	if (intersects.length > 0) {
		const gridPos = getGridCoords(intersects[0].point);
		if (isValid(gridPos.x, gridPos.y) && grid[gridPos.y][gridPos.x] === "floor") {
			targetPos = gridPos;
		}
	}

    const hoverChanged = !currentHoverPos || !targetPos || currentHoverPos.x !== targetPos.x || currentHoverPos.y !== targetPos.y;

    if (hoverChanged) {
        currentHoverPos = targetPos ? { ...targetPos } : null; // Store the new hover position

        if (targetPos && !(targetPos.x === playerPos.x && targetPos.y === playerPos.y)) {
            // Calculate path only if hovering over a valid, non-self floor tile
            const result = findShortestPathWithTurnCost(playerPos, targetPos, [aiPos]); // Use opponent as blocker for pathing
            if (result) {
                plannedShootPath = result.path;
                plannedShootCost = result.cost;
                setMessage(`Target: ${targetPos.x},${targetPos.y}. Est. Cost: ${result.cost}`);
            } else {
                plannedShootPath = null;
                plannedShootCost = 0;
                setMessage(`Cannot reach target ${targetPos.x},${targetPos.y}.`);
            }
        } else {
            // Clear path if hovering over self, wall, or outside grid
            plannedShootPath = null;
            plannedShootCost = 0;
            setMessage(`Your Turn (Fuel: ${playerFuel}): Hover over a floor tile to target missile.`);
        }
        renderHighlights(); // Update highlights based on the new hover state
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
                // Check if the click matches the end of the currently planned path
                if (plannedShootPath && plannedShootPath.length > 0 &&
                    plannedShootPath[plannedShootPath.length - 1].x === clickedGridPos.x &&
                    plannedShootPath[plannedShootPath.length - 1].y === clickedGridPos.y)
                {
                    const cost = plannedShootCost;
                    if (cost <= playerFuel) {
                        const action = {
                            type: "shoot",
                            target: clickedGridPos, // Target is the end of the path
                            _path: plannedShootPath, // Store path for visual/logic
                            _cost: cost             // Store cost for deduction
                        };
                        executeAction(action);
                    } else {
                        setMessage(`Not enough fuel! Cost: ${cost}, Available: ${playerFuel}`);
                    }
                } else {
                     setMessage("Invalid target click. Hover over a valid destination first to see the path.");
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
    updateFuelVisuals(); // Update the 3D text indicators
}

function updatePlanningCostUI(cost, available) {
    if (cost > 0) {
        planFuelCostInfo.textContent = `Est. Fuel Cost: ${cost} / Avail: ${available}`;
        planFuelCostInfo.style.color = cost <= available ? 'lightgreen' : 'salmon';
        planFuelCostInfo.style.fontWeight = 'bold';
    } else {
        planFuelCostInfo.textContent = '';
        planFuelCostInfo.style.fontWeight = 'normal';
    }
}

function clearPlanningCostUI() {
     planFuelCostInfo.textContent = '';
     planFuelCostInfo.style.fontWeight = 'normal';
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
    // Clear planning state when controls are disabled
    plannedShootPath = null;
    plannedShootCost = 0;
    currentHoverPos = null;
    clearHighlights();
    clearPlanningCostUI();
}


// --- Planning Phase Logic Functions (Player Only) ---
function setPlanningMode(mode) {
	if (currentPlayer !== "player" || isResolving || gameOverState) return;

	console.log("Setting planning mode:", mode);
	currentPlanningMode = mode;
    // Reset shoot-specific planning when switching modes
    plannedShootPath = null;
    plannedShootCost = 0;
    currentHoverPos = null; // Reset hover state too
    clearPlanningCostUI();

	// Update button styles
	btnPlanMove.classList.toggle("active", mode === "move");
	btnPlanShoot.classList.toggle("active", mode === "shoot");

	// Update instructions
	if (mode === "move") {
		setMessage("Your Turn: Click an adjacent floor cell to move.");
	} else if (mode === "shoot") {
		setMessage(`Your Turn (Fuel: ${playerFuel}): Hover over a floor tile to target missile.`);
	}

	renderHighlights(); // Update highlights for the new mode
}

function handleMoveInput(targetX, targetY) {
	if (currentPlayer !== "player" || currentPlanningMode !== "move" || isResolving || gameOverState) return;

	const validMoves = getValidMoves(playerPos, aiPos); // Get valid moves considering AI position
	const isValidTarget = validMoves.some(move => move.x === targetX && move.y === targetY);

	if (isValidTarget) {
		const action = { type: "move", target: { x: targetX, y: targetY } };
		executeAction(action); // Execute the move action
	} else {
		setMessage("Invalid move target. Click a highlighted adjacent square.");
	}
}


// --- Pathfinding Logic (UCS with Turn Cost) ---
function findShortestPathWithTurnCost(startPos, targetPos, opponentBlockers = []) {
    const priorityQueue = []; // Stores [cost, state]
    const startState = {
        pos: startPos,
        path: [startPos],
        cost: 0,
        arrivalDir: null // Direction taken to arrive at this node (null for start)
    };
    priorityQueue.push([0, startState]); // Add starting state with cost 0

    // Visited set stores 'x,y,arrivalDx,arrivalDy' to account for turn cost
    // Use '9,9' for null arrival direction at start
    const visited = new Set();
    const startVisitedKey = `${startPos.x},${startPos.y},9,9`;
    visited.add(startVisitedKey);

    // Set of blocker positions (opponents) for quick lookup
    const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`));

    while (priorityQueue.length > 0) {
        // Get state with the lowest cost (Priority Queue behavior)
        priorityQueue.sort((a, b) => a[0] - b[0]);
        const [currentCost, currentState] = priorityQueue.shift();

        // Goal check
        if (currentState.pos.x === targetPos.x && currentState.pos.y === targetPos.y) {
            return { path: currentState.path, cost: currentState.cost };
        }

        // Explore neighbors (possible moves)
        const directions = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, // Up, Down
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 }  // Left, Right
        ];

        for (const moveDir of directions) {
            const neighborPos = {
                x: currentState.pos.x + moveDir.dx,
                y: currentState.pos.y + moveDir.dy
            };

            // Check validity: within bounds and not a wall
            if (!isValid(neighborPos.x, neighborPos.y) || isWall(neighborPos.x, neighborPos.y)) {
                continue;
            }

            // Check validity: not blocked by an opponent (unless it's the target itself)
            const neighborKey = `${neighborPos.x},${neighborPos.y}`;
            if (blockerSet.has(neighborKey) && (neighborPos.x !== targetPos.x || neighborPos.y !== targetPos.y)) {
                continue; // Blocked by opponent
            }

            // Calculate cost for this move
            let turnPenaltyCost = 0;
            if (currentState.arrivalDir !== null) { // Don't penalize the first move
                // Check if the move direction is different from the arrival direction
                if (currentState.arrivalDir.dx !== moveDir.dx || currentState.arrivalDir.dy !== moveDir.dy) {
                    turnPenaltyCost = TURN_PENALTY;
                }
            }
            const newCost = currentCost + BASE_MOVE_COST + turnPenaltyCost;

            // Check if we've visited this state (position + arrival direction) before with a lower cost
            const visitedKey = `${neighborPos.x},${neighborPos.y},${moveDir.dx},${moveDir.dy}`;
            // Note: UCS inherently handles finding lower costs, but the visited check prevents cycles and redundant exploration *with the same arrival direction*.
             if (!visited.has(visitedKey)) { // Only proceed if this state hasn't been visited via this direction
                 visited.add(visitedKey);
                 const newPath = [...currentState.path, neighborPos];
                 const newState = {
                     pos: neighborPos,
                     path: newPath,
                     cost: newCost,
                     arrivalDir: moveDir // Store the direction used to reach this neighbor
                 };
                 priorityQueue.push([newCost, newState]); // Add to queue with its cost
             }
        }
    }

    return null; // Target not reachable
}


// --- AI Logic ---
function findBestActionUCSBased() {
    console.log("AI using rule-based logic with UCS Turn Cost pathing...");
    const startTime = performance.now();

    // 1. Check for Winning Shot using UCS Turn Cost pathing
    const shootPathResult = findShortestPathWithTurnCost(aiPos, playerPos, []); // AI path to player
    let canShoot = false;
    let winningShotAction = null;

    if (shootPathResult) {
        const fuelCost = shootPathResult.cost;
        if (fuelCost <= aiFuel) {
            canShoot = true;
            winningShotAction = {
                type: "shoot",
                target: playerPos, // Target the player's current position
                _path: shootPathResult.path,
                _cost: fuelCost
            };
            console.log(`AI Decision: Winning Shot Found. Path Length: ${shootPathResult.path.length}, Cost: ${fuelCost}, Available Fuel: ${aiFuel}.`);
        } else {
            console.log(`AI found path to player (Cost: ${fuelCost}) but lacks fuel (${aiFuel}).`);
        }
    } else {
        console.log("AI: No path found to player.");
    }

    // If a winning shot is possible, take it!
    if (canShoot) {
        const endTime = performance.now();
        console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
        return winningShotAction;
    }

    // 2. If no winning shot, find the nearest reachable fuel cell (using simple BFS for movement)
    const availableUpgrades = [...powerUpPositions];
    let shortestMovePathToUpgrade = null;
    let bestTargetUpgrade = null;

    // Sort upgrades by distance to potentially check closer ones first (minor optimization)
    availableUpgrades.sort((a, b) => distance(aiPos, a) - distance(aiPos, b));

    for (const upgradePos of availableUpgrades) {
        // Find a simple path to the upgrade, avoiding the player
        const upgradePath = findShortestPath_SimpleBFS(aiPos, upgradePos, [playerPos]);
        if (upgradePath && upgradePath.length > 1) { // Path exists and requires movement
             // If this is the first path found, or it's shorter than the current best
            if (!shortestMovePathToUpgrade || upgradePath.length < shortestMovePathToUpgrade.length) {
                shortestMovePathToUpgrade = upgradePath;
                bestTargetUpgrade = upgradePos;
            }
        }
    }

    // If a path to an upgrade was found, move towards it
    if (shortestMovePathToUpgrade) {
        const nextStep = shortestMovePathToUpgrade[1]; // The next cell in the path
        console.log(`AI Decision: Moving towards fuel cell at ${bestTargetUpgrade.x},${bestTargetUpgrade.y}. Next step: ${nextStep.x},${nextStep.y}`);
        const endTime = performance.now();
        console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
        return { type: "move", target: nextStep };
    }

    // 3. If no winning shot and no reachable fuel cells, stay put
    console.log("AI Decision: No winning shot or reachable fuel cells. Staying put.");
    const endTime = performance.now();
    console.log(`AI decision took ${(endTime - startTime).toFixed(2)} ms.`);
    return { type: "stay" }; // Default action if nothing else is viable
}

// Simple BFS for basic reachability (used by AI for non-critical movement like grabbing fuel)
function findShortestPath_SimpleBFS(startPos, targetPos, opponentBlockers = []) {
    const q = [{ pos: startPos, path: [startPos] }];
    const visited = new Set([`${startPos.x},${startPos.y}`]);
    const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`));

    while (q.length > 0) {
        const current = q.shift();
        const { pos, path } = current;

        if (pos.x === targetPos.x && pos.y === targetPos.y) return path; // Found target

        const neighbors = getValidMoves(pos, { x: -1, y: -1 }); // Get potential moves (don't block based on self for BFS)

        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            // Check if not visited and not blocked (unless it's the target)
            if (!visited.has(key) && !(blockerSet.has(key) && (neighbor.x !== targetPos.x || neighbor.y !== targetPos.y))) {
                visited.add(key);
                q.push({ pos: neighbor, path: [...path, neighbor] });
            }
        }
    }
    return null; // Target not reachable
}


// --- AI Trigger ---
function triggerAiTurn() {
	setMessage("AI is thinking...");
	updatePhaseIndicator();
	disablePlanningControls(); // Prevent player input during AI turn

	setTimeout(() => {
        if (gameOverState) return; // Don't act if game ended while thinking

		const aiAction = findBestActionUCSBased();

		if (!aiAction) {
			// This should ideally not happen with the "stay" fallback
			console.error("AI failed to find ANY action (even 'stay')!");
			executeAction({ type: "stay" }); // Execute a 'stay' action as a failsafe
            return;
		}

		executeAction(aiAction); // Execute the determined AI action

	}, AI_THINK_DELAY); // Short delay to simulate thinking
}


// --- ====================================== ---
// --- Action Execution & Turn Management ---
// --- ====================================== ---

/**
 * Executes the planned action for the current player.
 * Handles movement, shooting (normal and fuel cell), and game state updates.
 * @param {object} action - The action object { type, target, _path?, _cost? }
 */
async function executeAction(action) {
	if (isResolving || gameOverState) return; // Prevent concurrent actions or actions after game over

	console.log(`Executing ${currentPlayer}'s action:`, action);
	isResolving = true;
	disablePlanningControls();
	updatePhaseIndicator();

	let actionSuccess = true;
	let wasHit = false; // Did the action result in hitting the opponent?
	let collectedPowerup = false; // Did the action involve collecting fuel?
	let messageLog = []; // Collect messages for final display

	const activePlayer = currentPlayer;
	const activePlayerMesh = activePlayer === "player" ? playerMesh : aiMesh;
	const activePlayerPosRef = activePlayer === "player" ? playerPos : aiPos;
	const opponentPos = activePlayer === "player" ? aiPos : playerPos;
	const missileCoreMaterial = activePlayer === "player" ? playerMissileCoreMaterial : aiMissileCoreMaterial;

	// --- Process Action ---
	if (action.type === "move") {
		setMessage(`${activePlayer.toUpperCase()} moves...`);
		if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) {
			messageLog.push(`${activePlayer.toUpperCase()} move blocked by opponent!`);
			actionSuccess = false;
            await wait(ACTION_RESOLVE_DELAY); // Wait even if blocked
		} else {
			await animateMove(activePlayerMesh, action.target);
			activePlayerPosRef.x = action.target.x;
			activePlayerPosRef.y = action.target.y;
			messageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`);

			// Check for powerup collection AFTER moving
			const powerupIndex = powerUpPositions.findIndex(p => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y);
			if (powerupIndex !== -1) {
                collectedPowerup = true;
                const collectedPos = powerUpPositions[powerupIndex]; // Get coords before removal
                removePowerup3D(collectedPos.x, collectedPos.y); // Remove visually and logically
				if (activePlayer === "player") {
					playerFuel += FUEL_PER_UPGRADE;
					messageLog.push(`Player collected fuel cell! (+${FUEL_PER_UPGRADE} Fuel, Total: ${playerFuel})`);
				} else {
					aiFuel += FUEL_PER_UPGRADE;
					messageLog.push(`AI collected fuel cell! (+${FUEL_PER_UPGRADE} Fuel, Total: ${aiFuel})`);
				}
				updateFuelInfo(); // Update UI and 3D text
			}
		}

	} else if (action.type === "shoot") {
		setMessage(`${activePlayer.toUpperCase()} fires missile!`);
		const path = action._path;
		const cost = action._cost;
		let currentFuel = activePlayer === "player" ? playerFuel : aiFuel;

		if (path && path.length > 1 && cost <= currentFuel) {
			// Deduct fuel
			if (activePlayer === "player") playerFuel -= cost;
			else aiFuel -= cost;
			updateFuelInfo();

			const targetPos = path[path.length - 1]; // Grid coordinates {x, y}
            let impactOccurred = false; // Flag set by missile visual callback
            let explosionCompletePromise = null; // Promise for the explosion visual

            // --- Missile Visual ---
            // Create a promise that resolves when the missile visually impacts
            const missileVisualPromise = new Promise(resolveMissileImpact => {
                createGuidedMissileVisual(path, missileCoreMaterial, () => {
                    impactOccurred = true; // Set flag when impact callback is called
                    resolveMissileImpact(); // Resolve the promise
                });
            });
            messageLog.push(`${activePlayer.toUpperCase()} missile launched (Cost: ${cost}).`);

            // --- Wait for Visual Impact ---
            await missileVisualPromise; // Wait until the missile visually reaches the target

            // --- Handle Impact Logic ---
            const targetX = targetPos.x;
            const targetY = targetPos.y;

            if (isPowerupAt(targetX, targetY)) {
                // --- FUEL CELL EXPLOSION ---
                messageLog.push(`Missile hit a fuel cell at ${targetX},${targetY}!`);
                setMessage(messageLog.join(" ")); // Update message early for responsiveness

                // Trigger the chain reaction logic (handles visuals and removal)
                // This function returns a promise that resolves when the *entire chain* is done
                explosionCompletePromise = triggerFuelChainExplosion(targetX, targetY);

                // Get the results after the chain completes
                const destroyedCoords = await explosionCompletePromise;

                if (destroyedCoords.length > 0) {
                    messageLog.push(`Chain reaction destroyed ${destroyedCoords.length} fuel cell(s).`);
                } else {
                    messageLog.push(`Fuel cell at ${targetX},${targetY} might have already been destroyed.`);
                }
                // Fuel explosions do not damage players directly
                wasHit = false;

            } else {
                // --- NORMAL IMPACT (Floor or Opponent) ---
                const impactPosition3D = get3DPosition(targetX, targetY, CELL_3D_SIZE * 0.3); // Impact near floor

                // Create a promise specifically for the normal explosion visual effect
                explosionCompletePromise = new Promise(resolveExplosion => {
                    // Trigger standard explosion, passing resolveExplosion as the completion callback
                    createExplosionEffect(impactPosition3D, missileCoreMaterial.color, 1.0, 1.0, resolveExplosion);
                });

                // Check if opponent was hit
                if (targetX === opponentPos.x && targetY === opponentPos.y) {
                    wasHit = true; // Mark hit for game logic
                    messageLog.push(`${activePlayer === "player" ? "AI" : "Player"} was hit!`);
                } else {
                    messageLog.push(`Missile impacted floor at ${targetX},${targetY}.`);
                }

                // Wait for the normal explosion visual to finish
                await explosionCompletePromise;
            }

            // Ensure fuel info is updated after potential removals by explosion
            updateFuelInfo();

		} else {
			// Not enough fuel or invalid path
			messageLog.push(`${activePlayer.toUpperCase()} missile fizzled! (Check fuel/path).`);
			actionSuccess = false;
			wasHit = false;
			await wait(ACTION_RESOLVE_DELAY); // Wait even if fizzled
		}

	} else if (action.type === "stay") {
		setMessage(`${activePlayer.toUpperCase()} stays put.`);
		messageLog.push(`${activePlayer.toUpperCase()} did not move.`);
		await wait(ACTION_RESOLVE_DELAY); // Standard wait for doing nothing
	}

	// --- Post-Action Resolution ---
	setMessage(messageLog.join(" ")); // Update message area with collected logs

	// Check game end condition AFTER visuals/logic are complete
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
			setPlanningMode("move"); // Default back to move planning for player
		}
	} else {
		isResolving = false; // Ensure resolving is false even if game ended during action
	}
}

// --- ====================================== ---
// --- NEW: Fuel Cell Explosion Logic ---
// --- ====================================== ---

/**
 * Handles the explosion of a fuel cell, including chain reactions and radius destruction.
 * Triggers visual effects and removes destroyed powerups.
 * Returns a promise that resolves when all visual effects and removals are complete.
 * @param {number} startX - Grid X coordinate of the initially hit fuel cell.
 * @param {number} startY - Grid Y coordinate of the initially hit fuel cell.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of {x, y} coordinates of all destroyed fuel cells.
 */
async function triggerFuelChainExplosion(startX, startY) {
    console.log(`Starting fuel chain reaction at ${startX},${startY}`);
    const explosionQueue = [{ x: startX, y: startY }]; // Cells that will explode
    const explodedThisTurn = new Set([`${startX},${startY}`]); // Track cells *triggering* explosions to prevent loops
    const destroyedThisTurn = new Set(); // Track grid coordinates ('x,y') of all cells destroyed by any explosion in this chain
    const visualCompletionPromises = []; // To wait for all explosion visuals

    while (explosionQueue.length > 0) {
        const { x: currentX, y: currentY } = explosionQueue.shift();
        const currentKey = `${currentX},${currentY}`;

        // Double-check if the cell still exists logically (might have been added to destruction set already)
        // And ensure we haven't already processed its explosion trigger fully
         if (!isPowerupAt(currentX, currentY) || destroyedThisTurn.has(currentKey) ) {
              // console.log(`Skipping explosion at ${currentX},${currentY} - already destroyed or processed.`);
              continue; // Already destroyed or processed
         }

        // 1. Mark the exploding cell itself for destruction
        console.log(` Fuel cell at ${currentX},${currentY} explodes!`);
        destroyedThisTurn.add(currentKey);

        // 2. Trigger its visual effect (make it prominent)
        const pos3D = get3DPosition(currentX, currentY, CELL_3D_SIZE * 0.3); // Explosion center near ground
        const visualPromise = new Promise(resolve => {
            createExplosionEffect(
                pos3D,
                powerupMaterial.color, // Use powerup color as base
                FUEL_EXPLOSION_SCALE_MULTIPLIER,
                FUEL_EXPLOSION_PARTICLE_MULTIPLIER,
                resolve // Pass the resolve function as the onCompleteCallback
            );
        });
        visualCompletionPromises.push(visualPromise);


        // 3. Check radius for destruction (Mechanic #1: Explosive Fuel Cells)
        for (let dx = -FUEL_EXPLOSION_RADIUS; dx <= FUEL_EXPLOSION_RADIUS; dx++) {
            for (let dy = -FUEL_EXPLOSION_RADIUS; dy <= FUEL_EXPLOSION_RADIUS; dy++) {
                if (Math.abs(dx) + Math.abs(dy) > FUEL_EXPLOSION_RADIUS || (dx === 0 && dy === 0)) {
                    continue; // Skip self and outside Manhattan radius
                }
                const nearbyX = currentX + dx;
                const nearbyY = currentY + dy;
                const nearbyKey = `${nearbyX},${nearbyY}`;

                // If a valid powerup exists nearby and hasn't already been marked for destruction
                if (isValid(nearbyX, nearbyY) && isPowerupAt(nearbyX, nearbyY) && !destroyedThisTurn.has(nearbyKey)) {
                    // console.log(`  Blast radius from ${currentX},${currentY} marks ${nearbyX},${nearbyY} for destruction.`);
                    destroyedThisTurn.add(nearbyKey); // Mark for destruction by the blast
                }
            }
        }

        // 4. Check adjacent for chaining (Mechanic #2: Volatile Fuel)
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const dir of directions) {
            const adjX = currentX + dir.dx;
            const adjY = currentY + dir.dy;
            const adjKey = `${adjX},${adjY}`;

            // If adjacent cell is valid, has a powerup, AND hasn't started its own explosion chain yet
            if (isValid(adjX, adjY) && isPowerupAt(adjX, adjY) && !explodedThisTurn.has(adjKey)) {
                 // console.log(`  Chain reaction from ${currentX},${currentY} triggers explosion at ${adjX},${adjY}`);
                 explodedThisTurn.add(adjKey); // Mark as processed for *triggering* an explosion
                 explosionQueue.push({ x: adjX, y: adjY }); // Add to queue to explode next
            }
        }
        // Optional small delay between processing each explosion step for visual pacing
        // await wait(50);
    }

    // Wait for ALL triggered explosion visual effects to fully complete their animations and cleanup.
    await Promise.all(visualCompletionPromises);
    console.log("All fuel explosion visuals complete.");

    // 5. Perform actual logical and 3D removal *after* all visuals are done.
    const destroyedCoordsList = [];
    destroyedThisTurn.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        // Final check: ensure it *still* exists logically before removing
        if (isPowerupAt(x, y)) {
             // console.log(`Removing destroyed fuel cell at ${x},${y}`);
             removePowerup3D(x, y);
             destroyedCoordsList.push({x, y});
        }
    });

    console.log(`Fuel chain reaction finished. Destroyed cells: ${destroyedCoordsList.length}`);
    return destroyedCoordsList; // Return list of destroyed coordinates
}


// --- Animate Move Function ---
function animateMove(mesh, targetGridPos) {
	return new Promise((resolve) => {
		const startPos3D = mesh.position.clone();
        // Determine target Y based on unit type to land correctly centered
        const targetY = mesh.userData.type === 'player'
            ? (CELL_3D_SIZE * 0.9) / 2 // Player capsule center
            : (CELL_3D_SIZE * 1.0) / 2; // AI cone center
		const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);

		// Simple hop animation
		const hopHeight = CELL_3D_SIZE * 0.3;
		const midPos3D = new THREE.Vector3(
			(startPos3D.x + targetPos3D.x) / 2,
			Math.max(startPos3D.y, targetPos3D.y) + hopHeight, // Hop upwards
			(startPos3D.z + targetPos3D.z) / 2
		);

		// Tween up
		new TWEEN.Tween(startPos3D)
			.to(midPos3D, MOVEMENT_DURATION * 0.5)
			.easing(TWEEN.Easing.Quadratic.Out)
			.onUpdate(() => {
				mesh.position.copy(startPos3D);
			})
			.onComplete(() => {
				// Tween down
				new TWEEN.Tween(startPos3D)
					.to(targetPos3D, MOVEMENT_DURATION * 0.5)
					.easing(TWEEN.Easing.Quadratic.In)
					.onUpdate(() => {
						mesh.position.copy(startPos3D);
					})
					.onComplete(resolve) // Resolve the promise when movement finishes
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
function spawnInitialPowerups() {
    console.log("Spawning initial fuel cells (Weighted Random Sampling)...");
    // Clear existing powerups before spawning new ones
    powerupMeshes.forEach(p => disposeMesh(p.mesh));
    powerupMeshes = [];
    powerUpPositions = [];

    let availableCells = [];
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // Check if it's a floor cell and not occupied by players
            if (grid[y][x] === 'floor' &&
                !(x === playerPos.x && y === playerPos.y) &&
                !(x === aiPos.x && y === aiPos.y)) {
                availableCells.push({ x, y });
            }
        }
    }

    if (availableCells.length < INITIAL_POWERUP_COUNT) {
        console.warn(`Not enough available cells (${availableCells.length}) to spawn ${INITIAL_POWERUP_COUNT} fuel cells. Spawning all available.`);
         availableCells.forEach(cell => {
             powerUpPositions.push({ x: cell.x, y: cell.y }); // Add logical position
             const newPowerup = createPowerup3D(cell.x, cell.y); // Create visual
             if (newPowerup) powerupMeshes.push(newPowerup);
             console.log(` Spawned fuel cell at ${cell.x},${cell.y} (fallback)`);
         });
        return;
    }

    // Weighted sampling ( favoring cells further from AI, closer to Player)
    let weightedCells = availableCells.map(cell => {
        const distPlayer = Math.max(1, distance(cell, playerPos));
        const distAi = Math.max(1, distance(cell, aiPos));
        const ratio = distAi / distPlayer; // Higher ratio means further from AI relative to Player
        const diff = Math.abs(ratio - AI_DISTANCE_BIAS); // How close is the ratio to the desired bias?
        // Weight favors cells where the ratio is close to the bias (higher weight for lower diff)
        const weight = 0.01 + 1 / (1 + diff * diff * 10); // Add small base weight, sharp peak around bias
        return { cell, weight, ratio, distPlayer, distAi };
    }).filter(wc => wc.weight > 0); // Ensure weight is positive

    let totalWeight = weightedCells.reduce((sum, wc) => sum + wc.weight, 0);
    let spawnedCount = 0;
    const maxSpawnAttempts = availableCells.length * 3; // Limit attempts
    let attempts = 0;

    while (spawnedCount < INITIAL_POWERUP_COUNT && weightedCells.length > 0 && attempts < maxSpawnAttempts) {
        attempts++;
        if (totalWeight <= 0) {
            console.warn("Total weight is zero or negative, cannot perform weighted sampling. Attempt:", attempts);
            break; // Avoid infinite loop if weights become zero
        }

        let randomVal = Math.random() * totalWeight;
        let chosenIndex = -1;

        // Select weighted random index
        for (let i = 0; i < weightedCells.length; i++) {
            randomVal -= weightedCells[i].weight;
            if (randomVal <= 0) {
                chosenIndex = i;
                break;
            }
        }
        // Fallback if randomVal didn't hit exactly (floating point issues)
        if (chosenIndex === -1 && weightedCells.length > 0) {
             console.warn("Weighted sampling fallback triggered (chosenIndex = -1). Selecting last element. Attempt:", attempts);
             chosenIndex = weightedCells.length - 1;
        }

        if (chosenIndex !== -1 && chosenIndex < weightedCells.length) {
            const chosenWeightedCell = weightedCells[chosenIndex];
            const { cell, ratio, distPlayer, distAi } = chosenWeightedCell;

            // Spawn the powerup
            powerUpPositions.push({ x: cell.x, y: cell.y }); // Add logical position
            const newPowerup = createPowerup3D(cell.x, cell.y); // Create visual
            if (newPowerup) powerupMeshes.push(newPowerup);
            // console.log(` Spawned fuel cell at ${cell.x},${cell.y} (Ratio: ${ratio.toFixed(2)}, PDist: ${distPlayer}, ADist: ${distAi}, Weight: ${chosenWeightedCell.weight.toFixed(3)})`);
            spawnedCount++;

            // Remove the chosen cell and its weight from the pool for next iteration
            totalWeight -= chosenWeightedCell.weight;
            weightedCells.splice(chosenIndex, 1);

        } else {
             // Should not happen with the fallback, but log if it does
             console.error("Error during weighted sampling: chosenIndex invalid or weightedCells issue. Attempt:", attempts, "TotalWeight:", totalWeight, "weightedCells.length:", weightedCells.length);
             break;
        }
    }

    if (spawnedCount < INITIAL_POWERUP_COUNT) {
         console.warn(`Could only spawn ${spawnedCount} out of ${INITIAL_POWERUP_COUNT} initial fuel cells after ${attempts} attempts.`);
    } else {
         console.log(`Successfully spawned ${spawnedCount} initial fuel cells.`);
    }
}


// --- Game Over Function ---
function endGame(message, winner) {
	console.log("Game Over:", message);
	gamePhase = "gameOver";
	gameOverState = { winner: winner, message: message };
	setMessage(message);
	updatePhaseIndicator();
	disablePlanningControls();
	isResolving = false; // Ensure resolving flag is cleared
}


// --- Utility Functions ---
function isValid(x, y) {
	return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

function isWall(x, y) {
	return isValid(x, y) && grid[y][x] === "wall";
}

// NEW Helper: Checks if a powerup exists at the given logical coordinates
function isPowerupAt(x, y) {
    return powerUpPositions.some(p => p.x === x && p.y === y);
}


function getValidMoves(unitPos, opponentPosToBlock) {
	const moves = [];
	const directions = [
		{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, // Up, Down
		{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }  // Left, Right
	];

	directions.forEach(dir => {
		const nextX = unitPos.x + dir.dx;
		const nextY = unitPos.y + dir.dy;

		// Check bounds, floor type, and if the opponent is blocking the target square
		if (isValid(nextX, nextY) &&
            grid[nextY][nextX] === "floor" &&
            !(nextX === opponentPosToBlock?.x && nextY === opponentPosToBlock?.y))
        {
			moves.push({ x: nextX, y: nextY });
		}
	});
	return moves;
}

// Manhattan distance
function distance(pos1, pos2) {
	return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

function findNearestPowerup(pos, powerupList = powerUpPositions) {
    let minDist = Infinity;
    let nearest = null;
    powerupList.forEach(p => {
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